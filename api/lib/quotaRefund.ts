/**
 * Giving back a quota unit when the paid-for work failed. Pure: the database
 * calls come in as functions.
 *
 * consume_quota refuses amounts below 1 and there is no refund function, so a
 * refund is a compare-and-swap on usage_counters: read the count, then write
 * count - 1 only where the count is still the value read. A concurrent charge
 * in between makes the write match nothing, and the loop reads again.
 */

import type { QuotaKind } from "./quota.ts";
import { chargeQuota, type QuotaCharge, type QuotaGateDeps } from "./quotaGate.ts";

export const REFUND_TRIES = 3;

export interface CounterStore {
  /** Today's count, or null when there is no row. */
  read(): Promise<number | null>;
  /** Writes `next` only where the count is still `expected`; true if it did. */
  swap(expected: number, next: number): Promise<boolean>;
}

/** Takes one unit off, never below 0. False when nothing was taken off. */
export async function takeBackOne(
  store: CounterStore,
  tries = REFUND_TRIES,
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const count = await store.read();
    if (count === null || count <= 0) return false;
    if (await store.swap(count, count - 1)) return true;
  }
  return false;
}

/** The UTC date consume_quota files the charge under. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface RefundableChargeDeps extends QuotaGateDeps {
  refund(userId: string, kind: QuotaKind, day: string): Promise<boolean>;
  today(): string;
}

export type ChargedRun<T> =
  | { allowed: false; limit: number | null }
  | { allowed: true; value: T };

/**
 * Charges one unit, runs `work`, and refunds that unit once if `work` throws
 * before it called `billed`. The error is thrown on either way.
 *
 * `work` calls `billed` as soon as the provider has returned a response, even
 * an empty one: that call is paid for, so a later failure keeps the charge.
 * Otherwise a loop of empty answers would be unlimited paid calls.
 *
 * Nothing is refunded when nothing was charged: an own key, or a refused
 * charge.
 */
export async function chargeThenRun<T>(
  deps: RefundableChargeDeps,
  charge: Omit<QuotaCharge, "amount">,
  work: (billed: () => void) => Promise<T>,
): Promise<ChargedRun<T>> {
  // Read before the charge, so a request that crosses midnight refunds the
  // day it was charged on.
  const day = deps.today();
  const quota = await chargeQuota(deps, charge);
  if (!quota.allowed) return { allowed: false, limit: quota.limit };

  let isBilled = false;
  try {
    return { allowed: true, value: await work(() => (isBilled = true)) };
  } catch (error) {
    if (!charge.own && !isBilled) {
      const refunded = await deps.refund(charge.userId, charge.kind, day)
        .catch(() => false);
      if (!refunded) {
        console.error(
          `Quota refund failed: user ${charge.userId}, ${charge.kind}, ${day}`,
        );
      }
    }
    throw error;
  }
}
