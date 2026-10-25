/**
 * AES-256-GCM for users' own API keys, through WebCrypto.
 *
 * Pure on purpose: no Deno.env, no Supabase. The caller parses the secret once
 * and passes the CryptoKey in, so this can be tested with throwaway secrets.
 */

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Null unless the value is base64 for exactly 32 bytes. */
export function secretBytes(
  base64: string | undefined,
): Uint8Array<ArrayBuffer> | null {
  const value = base64?.trim();
  if (!value || !BASE64.test(value)) return null;

  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(value);
  } catch {
    return null;
  }
  return raw.length === 32 ? raw : null;
}

export async function parseSecret(
  base64: string | undefined,
): Promise<CryptoKey | null> {
  const raw = secretBytes(base64);
  if (!raw) return null;

  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// GCM breaks completely if an IV is ever reused with the same key, so every
// call draws a new one. The user id is authenticated but not stored, so a
// ciphertext copied into another user's row fails the tag check.
export async function encryptKey(
  secret: CryptoKey,
  plain: string,
  userId: string,
): Promise<EncryptedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    secret,
    new TextEncoder().encode(plain),
  );
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

/**
 * Rejects on a wrong secret, a different user id, or any tampering, through
 * the GCM tag check.
 */
export async function decryptKey(
  secret: CryptoKey,
  encrypted: EncryptedKey,
  userId: string,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(encrypted.iv),
      additionalData: new TextEncoder().encode(userId),
    },
    secret,
    fromBase64(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plain);
}
