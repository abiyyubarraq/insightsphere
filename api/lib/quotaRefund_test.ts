import { assertEquals, assertRejects } from "@std/assert";
import type { QuotaKind, QuotaResult } from "./quota.ts";
import {
  chargeThenRun,
  type CounterStore,
  REFUND_TRIES,
  type RefundableChargeDeps,
  takeBackOne,
  utcDay,
} from "./quotaRefund.ts";

/** A counter whose row changes under the refund `racesLeft` times. */
function counter(start: number | null, racesLeft = 0) {
  let count = start;
  const swaps: Array<[number, number]> = [];
  const store: CounterStore = {
    read: () => Promise.resolve(count),
    swap: (expected, next) => {
      swaps.push([expected, next]);
      if (racesLeft > 0) {
        racesLeft--;
        count = (count ?? 0) + 1;
        return Promise.resolve(false);
      }
      if (count !== expected) return Promise.resolve(false);
      count = next;
      return Promise.resolve(true);
    },
  };
  return { store, swaps, value: () => count };
}

const allowed: QuotaResult = {
  allowed: true,
  count: 1,
  limit: 2,
  tier: "basic",
  tierKnown: true,
};

function deps(result: QuotaResult = allowed) {
  const consumed: Array<[string, QuotaKind, number]> = [];
  const refunds: Array<[string, QuotaKind, string]> = [];
  const d: RefundableChargeDeps = {
    consume: (userId, kind, amount) => {
      consumed.push([userId, kind, amount]);
      return Promise.resolve(result);
    },
    refund: (userId, kind, day) => {
      refunds.push([userId, kind, day]);
      return Promise.resolve(true);
    },
    today: () => "2026-10-27",
  };
  return { deps: d, consumed, refunds };
}

const serverKey = { own: false, userId: "u1", kind: "summaries" as const };
const failing = () => Promise.reject(new Error("OpenAI 500"));

// Two failed markdown summaries used up the day's two summaries, and the next
// two valid PDF summaries got 429.
Deno.test("a failed run after a charge is refunded exactly once", async () => {
  const { deps: d, consumed, refunds } = deps();

  await assertRejects(() => chargeThenRun(d, serverKey, failing), Error, "OpenAI 500");

  assertEquals(consumed, [["u1", "summaries", 1]]);
  assertEquals(refunds, [["u1", "summaries", "2026-10-27"]]);
});

// A refund on success would make every summary free.
Deno.test("a successful run is not refunded", async () => {
  const { deps: d, refunds } = deps();

  const out = await chargeThenRun(d, serverKey, () => Promise.resolve("summary"));

  assertEquals(out, { allowed: true, value: "summary" });
  assertEquals(refunds, []);
});

// An own key is never charged, so a refund would take off a unit some other
// request paid for.
Deno.test("an own key is neither charged nor refunded", async () => {
  const { deps: d, consumed, refunds } = deps();

  await assertRejects(() => chargeThenRun(d, { ...serverKey, own: true }, failing));

  assertEquals(consumed, []);
  assertEquals(refunds, []);
});

// A refused charge incremented nothing, so there is nothing to give back, and
// the work must not run at all.
Deno.test("a refused charge runs nothing and refunds nothing", async () => {
  const { deps: d, refunds } = deps({ ...allowed, allowed: false, count: null });
  let ran = false;

  const out = await chargeThenRun(d, serverKey, () => {
    ran = true;
    return Promise.resolve("x");
  });

  assertEquals(out, { allowed: false, limit: 2 });
  assertEquals(ran, false);
  assertEquals(refunds, []);
});

// A failing refund must not replace the real error the user should get.
Deno.test("a refund that throws still surfaces the original error", async () => {
  const { deps: d } = deps();
  d.refund = () => Promise.reject(new Error("db down"));

  await assertRejects(() => chargeThenRun(d, serverKey, failing), Error, "OpenAI 500");
});

// A charge made at 23:59:59 and refunded after midnight would take a unit off
// the new day, which was never charged.
Deno.test("the refund uses the day read before the charge", async () => {
  const { deps: d, refunds } = deps();
  const days = ["2026-10-27", "2026-10-28"];
  d.today = () => days.shift()!;

  await assertRejects(() => chargeThenRun(d, serverKey, failing));

  assertEquals(refunds[0][2], "2026-10-27");
});

Deno.test("utcDay is the UTC date, not the local one", () => {
  assertEquals(utcDay(new Date("2026-10-27T23:30:00-05:00")), "2026-10-28");
});

// The counter is the only thing between a user and unlimited OpenAI spend.
Deno.test("a refund takes one off", async () => {
  const c = counter(2);

  assertEquals(await takeBackOne(c.store), true);
  assertEquals(c.value(), 1);
});

Deno.test("a refund never takes the count below 0", async () => {
  for (const start of [0, null]) {
    const c = counter(start);

    assertEquals(await takeBackOne(c.store), false);
    assertEquals(c.swaps, []);
    assertEquals(c.value(), start);
  }
});

// A charge landing between the read and the write must not be overwritten:
// the write only matches the value read, and the loop reads again.
Deno.test("a refund that loses a race reads again and then succeeds", async () => {
  const c = counter(1, 1);

  assertEquals(await takeBackOne(c.store), true);
  assertEquals(c.swaps, [[1, 0], [2, 1]]);
  assertEquals(c.value(), 1);
});

// Endless retries under load would hold the request open. Giving up keeps the
// charge, which is the safe side for the cost ceiling.
Deno.test("a refund stops after three tries", async () => {
  const c = counter(1, 10);

  assertEquals(await takeBackOne(c.store), false);
  assertEquals(c.swaps.length, REFUND_TRIES);
  assertEquals(REFUND_TRIES, 3);
});
