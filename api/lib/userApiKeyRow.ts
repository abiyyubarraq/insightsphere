/**
 * The user_api_keys row and the step that turns it back into a key.
 *
 * Kept apart from userApiKey.ts, which imports the Supabase singleton, so the
 * routes and the decrypt step can be tested without a database.
 */

import { decryptKey } from "./keyCrypto.ts";

export interface UserApiKeyRow {
  user_id: string;
  provider: "openai";
  ciphertext: string;
  iv: string;
  key_hint: string;
  created_at: string;
  updated_at: string;
}

export type NewUserApiKeyRow = Omit<UserApiKeyRow, "created_at" | "updated_at">;

export interface UserApiKeyStore {
  getKeyRow(userId: string): Promise<UserApiKeyRow | null>;
  saveKeyRow(row: NewUserApiKeyRow): Promise<UserApiKeyRow>;
  deleteKeyRow(userId: string): Promise<void>;
}

/**
 * Null when the row cannot be decrypted (the server secret changed, or the row
 * was edited). The user has to save the key again; that is not a crash.
 */
export async function keyFromRow(
  row: UserApiKeyRow,
  secret: CryptoKey,
): Promise<string | null> {
  try {
    return await decryptKey(secret, row);
  } catch {
    console.error("Own API key unreadable:", {
      userId: row.user_id,
      reason: "decrypt_failed",
    });
    return null;
  }
}
