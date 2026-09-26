import { assertEquals, assertStringIncludes } from "@std/assert";
import { quotaMessage, type QuotaRow, toQuotaResult } from "./quota.ts";

const row = (over: Partial<QuotaRow> = {}): QuotaRow => ({
  allowed: true,
  new_count: 1,
  per_day: 50,
  tier: "basic",
  tier_known: true,
  ...over,
});

// consume_quota answers a refusal with a row whose new_count is null. Reading
// "a row came back" as allowed would let every over-limit request through.
Deno.test("a refused row is not allowed, even though a row came back", () => {
  const result = toQuotaResult(row({ allowed: false, new_count: null }));
  assertEquals(result.allowed, false);
  assertEquals(result.count, null);
  assertEquals(result.limit, 50);
});

Deno.test("an allowed row carries the new total and the limit that applied", () => {
  assertEquals(toQuotaResult(row({ new_count: 50 })), {
    allowed: true,
    count: 50,
    limit: 50,
    tier: "basic",
    tierKnown: true,
  });
});

// A null per_day is unlimited, not a limit of zero. The counter still moves so
// heavy users show up in usage_counters.
Deno.test("a null limit is unlimited and still counted", () => {
  const result = toQuotaResult(
    row({ tier: "unlimited", per_day: null, new_count: 812 }),
  );
  assertEquals(result.allowed, true);
  assertEquals(result.limit, null);
  assertEquals(result.count, 812);
});

// A dashboard typo in user_tiers must be visible in the API log. The function
// has already applied basic; the flag is what makes the API say so.
Deno.test("an unrecognised tier keeps its name and is flagged", () => {
  const result = toQuotaResult(row({ tier: "unlimted", tier_known: false }));
  assertEquals(result.tier, "unlimted");
  assertEquals(result.tierKnown, false);
  assertEquals(result.limit, 50);
});

// The message is shown as-is in the red banner, so it has to read as a plain
// sentence that says what was hit and when it comes back.
Deno.test("the chat message says what was used and when it resets", () => {
  assertEquals(
    quotaMessage("chat", 50),
    "You have used your 50 messages for today. The limit resets at 00:00 UTC.",
  );
});

Deno.test("each kind names its own unit", () => {
  assertStringIncludes(quotaMessage("documents", 5), "5 documents");
  assertStringIncludes(quotaMessage("summaries", 2), "2 summaries");
  assertStringIncludes(quotaMessage("summaries", 1), "1 summary for today");
});

// A page charge is refused when one document is bigger than what is left, not
// only when the budget is used up. "You have used your 500 pages" would be
// false for someone who has used 20.
Deno.test("the pages message does not claim the whole budget was used", () => {
  const message = quotaMessage("pages", 500);
  assertStringIncludes(message, "more pages than you have left today");
  assertStringIncludes(message, "up to 500 pages a day");
  assertStringIncludes(message, "00:00 UTC");
});

// A limit of 0 is how a kind is switched off for a tier. "You have used your 0
// messages" makes no sense to a person, and it does not come back at midnight.
Deno.test("a limit of zero says the kind is unavailable", () => {
  assertEquals(
    quotaMessage("chat", 0),
    "Your account cannot use messages at the moment.",
  );
});
