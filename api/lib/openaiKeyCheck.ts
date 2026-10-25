/**
 * Checks for a user's own OpenAI key. Pure: no client is built here.
 */

export const KEY_MIN_LENGTH = 20;
export const KEY_MAX_LENGTH = 300;

const KEY_SHAPE = /^sk-[A-Za-z0-9_-]+$/;

/** Expects an already trimmed value, so a space inside the key fails. */
export function looksLikeOpenAIKey(value: string): boolean {
  return value.length >= KEY_MIN_LENGTH &&
    value.length <= KEY_MAX_LENGTH &&
    KEY_SHAPE.test(value);
}

export function lastFour(key: string): string {
  return key.slice(-4);
}

export function formatHint(last4: string): string {
  return `sk-…${last4}`;
}

// OpenAI writes part of the key into its own error text, for example
// "Incorrect API key provided: sk-proj-abc***wxyz", so `*` and `.` count too.
const KEY_TOKEN = /sk-[A-Za-z0-9_*.-]{3,}/g;

export function maskSecrets(text: string, key?: string): string {
  const withoutKey = key ? text.replaceAll(key, "sk-…[hidden]") : text;
  return withoutKey.replace(KEY_TOKEN, "sk-…[hidden]");
}

export interface KeyCheckFailure {
  status: 400 | 502;
  message: string;
}

function field(err: unknown, name: "status" | "code"): unknown {
  return typeof err === "object" && err !== null
    ? (err as Record<string, unknown>)[name]
    : undefined;
}

// Reads only status and code. The SDK error's message can carry part of the
// key, so it is never read, logged or returned.
export function classifyOpenAIError(err: unknown): KeyCheckFailure {
  const status = field(err, "status");
  const code = field(err, "code");

  if (status === 401) {
    return { status: 400, message: "OpenAI rejected this key." };
  }
  if (status === 403 || status === 404 || code === "model_not_found") {
    return {
      status: 400,
      message: "This key cannot use the text-embedding-3-small model.",
    };
  }
  if (status === 429 || code === "insufficient_quota") {
    return {
      status: 400,
      message:
        "This key has no credit left or is rate limited. Check your OpenAI billing.",
    };
  }
  return {
    status: 502,
    message: "Could not reach OpenAI. Nothing was saved. Try again.",
  };
}
