import { assertEquals } from "@std/assert";
import type { QuotaKind, QuotaResult } from "./quota.ts";
import { chargeQuota } from "./quotaGate.ts";

function consumeSpy(result: QuotaResult) {
  const calls: Array<[string, QuotaKind, number]> = [];
  return {
    calls,
    deps: {
      consume: (userId: string, kind: QuotaKind, amount: number) => {
        calls.push([userId, kind, amount]);
        return Promise.resolve(result);
      },
    },
  };
}

const refused: QuotaResult = {
  allowed: false,
  count: null,
  limit: 20,
  tier: "basic",
  tierKnown: true,
};

// A user paying with their own key would still be stopped by our daily limit,
// and usage_counters would grow for requests we did not pay for.
Deno.test("an own key never calls consume_quota", async () => {
  const { deps, calls } = consumeSpy(refused);

  for (const kind of ["chat", "documents", "pages", "summaries"] as const) {
    const result = await chargeQuota(deps, { own: true, userId: "u1", kind, amount: 7 });
    assertEquals(result.allowed, true);
  }
  assertEquals(calls, []);
});

// Users on the server key keep the quotas exactly as before.
Deno.test("the server key calls consume_quota once with the same kind and amount", async () => {
  const { deps, calls } = consumeSpy(refused);

  const result = await chargeQuota(deps, {
    own: false,
    userId: "u1",
    kind: "pages",
    amount: 12,
  });

  assertEquals(calls, [["u1", "pages", 12]]);
  assertEquals(result, { allowed: false, limit: 20 });
});

// Chat and summary charge one unit; the amount is easy to leave out.
Deno.test("the amount defaults to one", async () => {
  const { deps, calls } = consumeSpy({ ...refused, allowed: true, count: 1 });

  await chargeQuota(deps, { own: false, userId: "u1", kind: "chat" });

  assertEquals(calls, [["u1", "chat", 1]]);
});
