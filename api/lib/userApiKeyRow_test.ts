import { assert, assertEquals, assertFalse } from "@std/assert";
import { encryptKey, parseSecret } from "./keyCrypto.ts";
import { keyFromRow, type UserApiKeyRow } from "./userApiKeyRow.ts";

const KEY = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789"].join("-");

async function secret(): Promise<CryptoKey> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await parseSecret(btoa(String.fromCharCode(...bytes)));
  assert(key);
  return key;
}

async function savedRow(s: CryptoKey): Promise<UserApiKeyRow> {
  return {
    user_id: "user-1",
    provider: "openai",
    ...await encryptKey(s, KEY, "user-1"),
    key_hint: "6789",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
}

async function captureErrors(fn: () => Promise<unknown>): Promise<string> {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(Deno.inspect(args));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines.join("\n");
}

// Server code that calls OpenAI for the user needs the plain key back.
Deno.test("a saved row gives back the plain key", async () => {
  const s = await secret();
  assertEquals(await keyFromRow(await savedRow(s), s), KEY);
});

// After the server secret changes every saved key is unreadable. That must be
// "no usable key" with a log line, not an exception in the chat route, and
// the log must not carry anything that helps recover the key.
Deno.test("a row from another secret gives null and logs no key material", async () => {
  const row = await savedRow(await secret());
  let result: string | null = "unset";
  const logged = await captureErrors(async () => {
    result = await keyFromRow(row, await secret());
  });
  assertEquals(result, null);
  assert(logged.includes("decrypt_failed"));
  assertFalse(logged.includes(KEY));
  assertFalse(logged.includes(row.ciphertext));
  assertFalse(logged.includes(row.iv));
});

// Without the user id bound into the ciphertext, copying one user's row values
// into another user's row would hand that user the first user's key.
Deno.test("a row moved to another user gives null", async () => {
  const s = await secret();
  const row = { ...await savedRow(s), user_id: "user-2" };
  let result: string | null = "unset";
  await captureErrors(async () => {
    result = await keyFromRow(row, s);
  });
  assertEquals(result, null);
});

Deno.test("a corrupt ciphertext gives null and does not throw", async () => {
  const s = await secret();
  const row = { ...await savedRow(s), ciphertext: "not-base64!!" };
  let result: string | null = "unset";
  const logged = await captureErrors(async () => {
    result = await keyFromRow(row, s);
  });
  assertEquals(result, null);
  assertFalse(logged.includes(row.ciphertext));
  assertFalse(logged.includes(row.iv));
});
