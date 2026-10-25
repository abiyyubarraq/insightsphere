/**
 * GET / PUT / DELETE /v1/settings/api-key
 *
 * A user's own OpenAI key. The key itself, its ciphertext and its IV never
 * leave the API; responses carry only a hint like "sk-…abcd".
 *
 * Dependencies are parameters so the handlers can be tested with plain
 * objects. apiKey.ts wires the real ones.
 */

import type { Context } from "hono";
import type { AppEnv } from "../../lib/auth.ts";
import { encryptKey } from "../../lib/keyCrypto.ts";
import {
  classifyOpenAIError,
  formatHint,
  lastFour,
  looksLikeOpenAIKey,
} from "../../lib/openaiKeyCheck.ts";
import type {
  UserApiKeyRow,
  UserApiKeyStore,
} from "../../lib/userApiKeyRow.ts";

export interface ApiKeyDeps {
  secret: CryptoKey | null;
  store: UserApiKeyStore;
  /** Throws the OpenAI SDK error when the key does not work. */
  verifyKey(apiKey: string): Promise<void>;
}

export interface ApiKeyStatus {
  hasKey: boolean;
  hint: string | null;
  provider: "openai" | null;
  updatedAt: string | null;
}

export const NOT_ENABLED = "Own API keys are not enabled on this server.";

const NO_KEY: ApiKeyStatus = {
  hasKey: false,
  hint: null,
  provider: null,
  updatedAt: null,
};

function toStatus(row: UserApiKeyRow | null): ApiKeyStatus {
  if (!row) return NO_KEY;
  return {
    hasKey: true,
    hint: formatHint(row.key_hint),
    provider: row.provider,
    updatedAt: row.updated_at,
  };
}

// The user comes from requireUser (the JWT), never from the body or query.
// Not auth.ts's currentUser, because that module builds the Supabase client on
// import and would make this file untestable.
function userId(c: Context<AppEnv>): string {
  const user = c.get("user");
  if (!user) throw new Error("settings route mounted without requireUser");
  return user.id;
}

async function readApiKey(c: Context<AppEnv>): Promise<string | null> {
  const body: unknown = await c.req.json().catch(() => null);
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>).apiKey;
  if (typeof value !== "string") return null;
  const key = value.trim();
  return looksLikeOpenAIKey(key) ? key : null;
}

export function createApiKeyRoutes(deps: ApiKeyDeps) {
  const notEnabled = (c: Context<AppEnv>) =>
    c.json({ success: false, error: NOT_ENABLED }, 503);

  async function getApiKey(c: Context<AppEnv>) {
    if (!deps.secret) return notEnabled(c);
    return c.json(toStatus(await deps.store.getKeyRow(userId(c))));
  }

  async function putApiKey(c: Context<AppEnv>) {
    if (!deps.secret) return notEnabled(c);
    const user = userId(c);

    const apiKey = await readApiKey(c);
    if (!apiKey) {
      return c.json({
        success: false,
        error:
          "That does not look like an OpenAI key. It starts with sk- and has no spaces.",
      }, 400);
    }

    try {
      await deps.verifyKey(apiKey);
    } catch (err) {
      const failure = classifyOpenAIError(err);
      console.warn("Own API key check failed:", {
        userId: user,
        status: failure.status,
      });
      return c.json({ success: false, error: failure.message }, failure.status);
    }

    const { ciphertext, iv } = await encryptKey(deps.secret, apiKey);
    const row = await deps.store.saveKeyRow({
      user_id: user,
      provider: "openai",
      ciphertext,
      iv,
      key_hint: lastFour(apiKey),
    });
    console.log("Own API key saved:", { userId: user });
    return c.json(toStatus(row));
  }

  async function deleteApiKey(c: Context<AppEnv>) {
    if (!deps.secret) return notEnabled(c);
    const user = userId(c);
    await deps.store.deleteKeyRow(user);
    console.log("Own API key removed:", { userId: user });
    return c.json(NO_KEY);
  }

  return { getApiKey, putApiKey, deleteApiKey };
}
