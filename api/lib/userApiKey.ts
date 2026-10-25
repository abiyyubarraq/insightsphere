/**
 * Storage for a user's own OpenAI key, in user_api_keys (service role only).
 */

import { supabaseService } from "./supabaseClient.ts";
import { parseSecret } from "./keyCrypto.ts";
import {
  keyFromRow,
  type NewUserApiKeyRow,
  type UserApiKeyRow,
} from "./userApiKeyRow.ts";

/** Null when KEY_ENCRYPTION_SECRET is missing or invalid: the feature is off. */
export const keySecret = await parseSecret(
  Deno.env.get("KEY_ENCRYPTION_SECRET"),
);

const table = () => supabaseService.getClient().from("user_api_keys");

// Errors carry only the code and message. PostgREST puts row values in
// `details`, and this row holds the ciphertext.
function storeError(action: string, error: { code: string; message: string }) {
  return new Error(`user_api_keys ${action} failed: ${error.code} ${error.message}`);
}

export async function getKeyRow(userId: string): Promise<UserApiKeyRow | null> {
  const { data, error } = await table().select("*").eq("user_id", userId)
    .maybeSingle();
  if (error) throw storeError("read", error);
  return data as UserApiKeyRow | null;
}

export async function saveKeyRow(row: NewUserApiKeyRow): Promise<UserApiKeyRow> {
  // created_at is left out so a replaced key keeps its first value.
  const { data, error } = await table()
    .upsert({ ...row, updated_at: new Date().toISOString() }, {
      onConflict: "user_id",
    })
    .select("*")
    .single();
  if (error) throw storeError("save", error);
  return data as UserApiKeyRow;
}

export async function deleteKeyRow(userId: string): Promise<void> {
  const { error } = await table().delete().eq("user_id", userId);
  if (error) throw storeError("delete", error);
}

/** The user's own key in plain text, or null when there is no usable one. */
export async function getUserOpenAIKey(userId: string): Promise<string | null> {
  if (!keySecret) return null;

  let row: UserApiKeyRow | null;
  try {
    row = await getKeyRow(userId);
  } catch (error) {
    console.error("Could not read own API key:", {
      userId,
      reason: "read_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  return row ? await keyFromRow(row, keySecret) : null;
}
