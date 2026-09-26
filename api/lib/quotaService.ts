import type { Context } from "hono";
import { supabaseService } from "./supabaseClient.ts";
import {
  type QuotaKind,
  quotaMessage,
  type QuotaResult,
  type QuotaRow,
  toQuotaResult,
} from "./quota.ts";

export class QuotaUnavailableError extends Error {
  constructor(cause: string) {
    super(`Quota check failed: ${cause}`);
  }
}

/**
 * Charge `amount` of `kind` to the user for today, if it fits.
 *
 * One RPC round trip. A refused call increments nothing. Throws
 * QuotaUnavailableError when the check itself fails, and callers refuse the
 * request: an unreachable counter must not mean unlimited.
 */
export async function consumeQuota(
  userId: string,
  kind: QuotaKind,
  amount = 1,
): Promise<QuotaResult> {
  const { data, error } = await supabaseService.getClient().rpc(
    "consume_quota",
    { p_user_id: userId, p_kind: kind, p_amount: amount },
  );

  const row = (Array.isArray(data) ? data[0] : data) as QuotaRow | undefined;
  if (error || !row) {
    throw new QuotaUnavailableError(error?.message ?? "no row returned");
  }

  const result = toQuotaResult(row);
  if (!result.tierKnown) {
    console.error(
      `⚠️ QUOTA: user ${userId} has tier "${result.tier}", which is not in ` +
        `quota_tiers (or has no "${kind}" row). Applied basic limits instead.`,
    );
  }
  return result;
}

export function quotaExceeded(c: Context, kind: QuotaKind, limit: number | null) {
  return c.json({ success: false, error: quotaMessage(kind, limit) }, 429);
}

export function quotaUnavailable(c: Context) {
  return c.json({
    success: false,
    error: "Usage limits could not be checked. Try again shortly.",
  }, 503);
}
