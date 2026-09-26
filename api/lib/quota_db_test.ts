/**
 * consume_quota against the real database.
 *
 * The limit decision lives in Postgres, so this is the only place it can be
 * tested honestly. Off by default: it needs 0006_quota.sql applied and writes
 * to the project, so run it on purpose with
 *
 *   QUOTA_DB_TEST=1 deno test --allow-net --allow-env lib/quota_db_test.ts
 *
 * It creates two throwaway users and one throwaway tier, and removes them at
 * the end. Counters and tier rows go with the users by cascade. It never edits
 * the basic tier, because real users are on it.
 */

import { assert, assertEquals } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import type { QuotaRow } from "./quota.ts";

const enabled = Deno.env.get("QUOTA_DB_TEST") === "1";

const TEST_TIER = `test_tier_${crypto.randomUUID().slice(0, 8)}`;

const db = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

async function consume(
  userId: string,
  kind: string,
  amount = 1,
): Promise<QuotaRow> {
  const { data, error } = await db().rpc("consume_quota", {
    p_user_id: userId,
    p_kind: kind,
    p_amount: amount,
  });
  if (error) throw new Error(error.message);
  return (data as QuotaRow[])[0];
}

async function counter(userId: string, kind: string): Promise<number> {
  const { data } = await db().from("usage_counters").select("count")
    .eq("user_id", userId).eq("kind", kind);
  return data?.[0]?.count ?? 0;
}

async function basicLimit(kind: string): Promise<number> {
  const { data } = await db().from("quota_tiers").select("per_day")
    .eq("tier", "basic").eq("kind", kind).single();
  return data!.per_day;
}

async function setTier(userId: string, tier: string | null) {
  await db().from("user_tiers").delete().eq("user_id", userId);
  if (tier) {
    const { error } = await db().from("user_tiers").insert({ user_id: userId, tier });
    if (error) throw new Error(error.message);
  }
}

Deno.test({
  name: "consume_quota enforces tiers against the real database",
  ignore: !enabled,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const users: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data, error } = await db().auth.admin.createUser({
        email: `quota-test-${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      users.push(data.user.id);
    }
    const [a, b] = users;

    const { error: tierError } = await db().from("quota_tiers").insert([
      { tier: TEST_TIER, kind: "chat", per_day: 3 },
      { tier: TEST_TIER, kind: "pages", per_day: 10 },
    ]);
    if (tierError) throw new Error(tierError.message);

    try {
      const summaries = await basicLimit("summaries");

      // Absence is the default: a brand new account has no row and must be
      // limited, since nothing creates one at signup.
      await t.step("a user with no tier row gets basic", async () => {
        const first = await consume(a, "summaries");
        assertEquals(first.tier, "basic");
        assertEquals(first.per_day, summaries);
        assert(first.allowed);
      });

      // The boundary: the request that lands exactly on the limit is allowed,
      // the next one is not.
      await t.step("exactly at the limit is allowed, one more is refused", async () => {
        for (let used = 1; used < summaries; used++) {
          assert((await consume(a, "summaries")).allowed);
        }
        assertEquals(await counter(a, "summaries"), summaries);
        const over = await consume(a, "summaries");
        assertEquals(over.allowed, false);
        assertEquals(over.new_count, null);
      });

      // If a refused call still incremented, a user retrying at the limit would
      // push the counter up and the numbers would stop meaning anything.
      await t.step("a refused call does not raise the counter", async () => {
        await consume(a, "summaries");
        await consume(a, "summaries");
        assertEquals(await counter(a, "summaries"), summaries);
      });

      await t.step("a named tier uses its own limits", async () => {
        await setTier(b, TEST_TIER);
        for (let i = 0; i < 3; i++) assert((await consume(b, "chat")).allowed);
        const over = await consume(b, "chat");
        assertEquals(over.allowed, false);
        assertEquals(over.per_day, 3);
        assertEquals(over.tier, TEST_TIER);
      });

      // The insert branch has no where clause, so without the up-front check
      // the first 600-page document of the day would be recorded against 500.
      await t.step("an amount bigger than the whole limit is refused on the first call", async () => {
        const over = await consume(b, "pages", 11);
        assertEquals(over.allowed, false);
        assertEquals(await counter(b, "pages"), 0);
        assert((await consume(b, "pages", 10)).allowed);
      });

      // A typo in the table editor must fail closed. Granting unlimited to a
      // misspelled tier would be the expensive way to find out.
      await t.step("an unknown tier falls back to basic and is flagged", async () => {
        await setTier(b, "unlimted");
        const result = await consume(b, "summaries");
        assertEquals(result.tier, "unlimted");
        assertEquals(result.tier_known, false);
        assertEquals(result.per_day, summaries);
      });

      // Unlimited is not enforced but still counted, which is the only way to
      // see what the heaviest users spend.
      await t.step("unlimited never refuses and still counts", async () => {
        await setTier(a, "unlimited");
        const before = await counter(a, "summaries");
        const result = await consume(a, "summaries", 1000);
        assert(result.allowed);
        assertEquals(result.per_day, null);
        assertEquals(result.new_count, before + 1000);
      });

      await t.step("removing the tier row puts the user back on basic", async () => {
        await setTier(a, null);
        const result = await consume(a, "summaries");
        assertEquals(result.tier, "basic");
        assertEquals(result.allowed, false);
      });
    } finally {
      await db().from("quota_tiers").delete().eq("tier", TEST_TIER);
      for (const id of users) await db().auth.admin.deleteUser(id);
    }
  },
});
