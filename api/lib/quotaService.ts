import type { Context } from "hono";
import { supabaseService } from "./supabaseClient.ts";
import {
  type QuotaKind,
  quotaMessage,
  type QuotaResult,
  type QuotaRow,
  toQuotaResult,
} from "./quota.ts";
import { chargeQuota, type QuotaCharge } from "./quotaGate.ts";
import { chargeThenRun, takeBackOne, utcDay } from "./quotaRefund.ts";

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

/** consumeQuota for a user on the server key; allowed at once for an own key. */
export function chargeUserQuota(charge: QuotaCharge) {
  return chargeQuota({ consume: consumeQuota }, charge);
}

/**
 * One unit of `kind` back off the user's counter for `day`. The service role
 * bypasses RLS on usage_counters, which has no policy at all.
 */
export function refundQuota(
  userId: string,
  kind: QuotaKind,
  day: string,
): Promise<boolean> {
  const counters = () =>
    supabaseService.getClient().from("usage_counters");
  return takeBackOne({
    read: async () => {
      const { data, error } = await counters().select("count")
        .eq("user_id", userId).eq("day", day).eq("kind", kind)
        .maybeSingle<{ count: number }>();
      if (error) throw new Error(`Quota refund read failed: ${error.message}`);
      return data?.count ?? null;
    },
    swap: async (expected, next) => {
      const { data, error } = await counters().update({ count: next })
        .eq("user_id", userId).eq("day", day).eq("kind", kind)
        .eq("count", expected)
        .select("count");
      if (error) throw new Error(`Quota refund write failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
  });
}

/** chargeUserQuota for one unit, refunded if `work` throws. */
export function chargeUserQuotaForWork<T>(
  charge: Omit<QuotaCharge, "amount">,
  work: () => Promise<T>,
) {
  return chargeThenRun(
    { consume: consumeQuota, refund: refundQuota, today: utcDay },
    charge,
    work,
  );
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
