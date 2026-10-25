import { assert, assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { decryptKey, encryptKey, parseSecret } from "./keyCrypto.ts";

const USER = "user-1";
const KEY = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789"].join("-");

function randomSecretText(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

async function secret(): Promise<CryptoKey> {
  const key = await parseSecret(randomSecretText());
  assert(key);
  return key;
}

function flipFirstByte(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  bytes[0] ^= 0x01;
  return btoa(String.fromCharCode(...bytes));
}

// The whole feature rests on getting the same key back after a save.
Deno.test("a key decrypts back to the original", async () => {
  const s = await secret();
  assertEquals(await decryptKey(s, await encryptKey(s, KEY, USER), USER), KEY);
});

// A changed server secret must fail loudly, not return garbage that is then
// sent to OpenAI as if it were the user's key.
Deno.test("decrypting with a different secret throws", async () => {
  const encrypted = await encryptKey(await secret(), KEY, USER);
  await assertRejects(async () => await decryptKey(await secret(), encrypted, USER));
});

// Without the GCM tag check an edited row would decrypt to a different key.
Deno.test("one flipped byte in the ciphertext throws", async () => {
  const s = await secret();
  const encrypted = await encryptKey(s, KEY, USER);
  await assertRejects(async () =>
    await decryptKey(s, { ...encrypted, ciphertext: flipFirstByte(encrypted.ciphertext) }, USER)
  );
});

Deno.test("one flipped byte in the IV throws", async () => {
  const s = await secret();
  const encrypted = await encryptKey(s, KEY, USER);
  await assertRejects(async () =>
    await decryptKey(s, { ...encrypted, iv: flipFirstByte(encrypted.iv) }, USER)
  );
});

// Without the user id bound in, one user's ciphertext and IV copied into
// another user's row would decrypt for that user.
Deno.test("decrypting with a different user id throws", async () => {
  const s = await secret();
  const encrypted = await encryptKey(s, KEY, USER);
  await assertRejects(async () => await decryptKey(s, encrypted, "user-2"));
});

// A reused IV under AES-GCM leaks the XOR of two keys and the auth key.
Deno.test("two saves of the same key use different IVs and ciphertexts", async () => {
  const s = await secret();
  const a = await encryptKey(s, KEY, USER);
  const b = await encryptKey(s, KEY, USER);
  assertNotEquals(a.iv, b.iv);
  assertNotEquals(a.ciphertext, b.ciphertext);
});

Deno.test("the IV is 12 bytes", async () => {
  const { iv } = await encryptKey(await secret(), KEY, USER);
  assertEquals(atob(iv).length, 12);
});

// A short or mistyped secret must switch the feature off, not weaken it.
Deno.test("parseSecret refuses anything that is not base64 for 32 bytes", async () => {
  assertEquals(await parseSecret(undefined), null);
  assertEquals(await parseSecret(""), null);
  assertEquals(await parseSecret("   "), null);
  assertEquals(await parseSecret("not base64 at all!"), null);
  assertEquals(await parseSecret(btoa("too short")), null);
  assertEquals(await parseSecret(btoa("x".repeat(33))), null);
  assert(await parseSecret(btoa("x".repeat(32))));
});
