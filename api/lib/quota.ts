/**
 * The parts of the daily quota that do not need a database.
 *
 * The decision itself — which tier, which limit, check and increment — lives in
 * the consume_quota Postgres function (supabase/migrations/0006_quota.sql),
 * because it has to be atomic and one round trip. This module only reads what
 * that function returns and words it for a person. It imports no client, so it
 * can be tested.
 */

export type QuotaKind = "chat" | "documents" | "pages" | "summaries";

/** One row as returned by consume_quota. */
export interface QuotaRow {
  allowed: boolean;
  new_count: number | null;
  per_day: number | null;
  tier: string;
  tier_known: boolean;
}

export interface QuotaResult {
  allowed: boolean;
  /** The new total for today, or null when the request was refused. */
  count: number | null;
  /** The limit that applied, or null for unlimited. */
  limit: number | null;
  /** The tier name as written in user_tiers, even when it was not recognised. */
  tier: string;
  tierKnown: boolean;
}

export function toQuotaResult(row: QuotaRow): QuotaResult {
  return {
    allowed: row.allowed === true,
    count: row.new_count,
    limit: row.per_day,
    tier: row.tier,
    tierKnown: row.tier_known,
  };
}

const UNIT: Record<QuotaKind, [one: string, many: string]> = {
  chat: ["message", "messages"],
  documents: ["document", "documents"],
  pages: ["page", "pages"],
  summaries: ["summary", "summaries"],
};

const RESET = "The limit resets at 00:00 UTC.";

export function quotaMessage(kind: QuotaKind, limit: number | null): string {
  const n = limit ?? 0;
  const unit = UNIT[kind][n === 1 ? 0 : 1];

  if (n === 0) {
    return `Your account cannot use ${UNIT[kind][1]} at the moment.`;
  }

  // A page charge can be refused because this one document is bigger than what
  // is left, not only because the budget is already used up.
  if (kind === "pages") {
    return `This document has more pages than you have left today. ` +
      `You can process up to ${n} ${unit} a day. ${RESET}`;
  }

  return `You have used your ${n} ${unit} for today. ${RESET}`;
}
