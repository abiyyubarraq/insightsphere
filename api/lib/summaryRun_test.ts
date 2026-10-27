import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import type { QuotaKind, QuotaResult } from "./quota.ts";
import { chargeThenRun, type RefundableChargeDeps } from "./quotaRefund.ts";
import { OpenAIEmptyReplyError, OpenAIRequestError } from "./openaiErrors.ts";
import { runSummary, type SummaryRunDeps } from "./summaryRun.ts";

const allowed: QuotaResult = {
  allowed: true,
  count: 1,
  limit: 2,
  tier: "basic",
  tierKnown: true,
};

function quota() {
  const refunds: Array<[string, QuotaKind, string]> = [];
  const deps: RefundableChargeDeps = {
    consume: () => Promise.resolve(allowed),
    refund: (userId, kind, day) => {
      refunds.push([userId, kind, day]);
      return Promise.resolve(true);
    },
    today: () => "2026-10-27",
  };
  return { deps, refunds };
}

function summary(generate: SummaryRunDeps["generate"]) {
  const saved: string[] = [];
  const deps: SummaryRunDeps = {
    generate,
    save: (text) => {
      saved.push(text);
      return Promise.resolve();
    },
  };
  return { deps, saved };
}

const charge = { own: false, userId: "u1", kind: "summaries" as const };

// A network error or an error status means OpenAI never answered, so the unit
// must come back, once.
Deno.test("a summary that fails before OpenAI answers is refunded once", async () => {
  const q = quota();
  const s = summary(() =>
    Promise.reject(new OpenAIRequestError("Failed to generate chat completion", new Error("fetch failed")))
  );

  await assertRejects(
    () => chargeThenRun(q.deps, charge, (billed) => runSummary(s.deps, billed)),
    OpenAIRequestError,
    "fetch failed",
  );

  assertEquals(q.refunds, [["u1", "summaries", "2026-10-27"]]);
  assertEquals(s.saved, []);
});

// A 200 with empty choices was refunded, so regenerate could loop on paid
// calls with no daily limit.
Deno.test("a summary answered with no choices keeps the charge and still fails", async () => {
  const q = quota();
  const s = summary(() => Promise.reject(new OpenAIEmptyReplyError()));

  await assertRejects(
    () => chargeThenRun(q.deps, charge, (billed) => runSummary(s.deps, billed)),
    OpenAIEmptyReplyError,
  );

  assertEquals(q.refunds, []);
  assertEquals(s.saved, []);
});

Deno.test("a summary answered with an empty string keeps the charge", async () => {
  const q = quota();
  const s = summary(() => Promise.resolve({ answer: "  \n" }));

  await assertRejects(
    () => chargeThenRun(q.deps, charge, (billed) => runSummary(s.deps, billed)),
    Error,
    "empty summary",
  );

  assertEquals(q.refunds, []);
  assertEquals(s.saved, []);
});

// A failed save happens after OpenAI billed the call.
Deno.test("a summary whose save fails keeps the charge", async () => {
  const q = quota();
  const s = summary(() => Promise.resolve({ answer: "A summary." }));
  s.deps.save = () => Promise.reject(new Error("db down"));

  await assertRejects(
    () => chargeThenRun(q.deps, charge, (billed) => runSummary(s.deps, billed)),
    Error,
    "db down",
  );

  assertEquals(q.refunds, []);
});

Deno.test("a successful summary is saved and not refunded", async () => {
  const q = quota();
  const s = summary(() => Promise.resolve({ answer: "A summary." }));

  const out = await chargeThenRun(q.deps, charge, (billed) => runSummary(s.deps, billed));

  assertEquals(out, { allowed: true, value: "A summary.".length });
  assertEquals(s.saved, ["A summary."]);
  assertEquals(q.refunds, []);
});

// Chat, query and the router check only for OpenAIRequestError; an empty reply
// must keep reaching them the same way and with the same message.
Deno.test("an empty reply is still an OpenAI request error with the old message", () => {
  const error = new OpenAIEmptyReplyError();

  assertInstanceOf(error, OpenAIRequestError);
  assertEquals(
    error.message,
    "Failed to generate chat completion: No completion choices returned from OpenAI",
  );
  assertEquals(error.status, undefined);
});
