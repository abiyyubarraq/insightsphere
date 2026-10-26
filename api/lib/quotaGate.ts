/**
 * Users who pay OpenAI with their own key are not held to the daily quotas.
 * The burst limit in main.ts still applies to them.
 */

import type { QuotaKind, QuotaResult } from "./quota.ts";

export interface QuotaGateDeps {
  consume(userId: string, kind: QuotaKind, amount: number): Promise<QuotaResult>;
}

export interface QuotaCharge {
  own: boolean;
  userId: string;
  kind: QuotaKind;
  amount?: number;
}

export async function chargeQuota(
  deps: QuotaGateDeps,
  { own, userId, kind, amount = 1 }: QuotaCharge,
): Promise<Pick<QuotaResult, "allowed" | "limit">> {
  if (own) return { allowed: true, limit: null };
  const { allowed, limit } = await deps.consume(userId, kind, amount);
  return { allowed, limit };
}
