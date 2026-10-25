import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  classifyOpenAIError,
  formatHint,
  lastFour,
  looksLikeOpenAIKey,
  maskSecrets,
} from "./openaiKeyCheck.ts";

const KEY = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789"].join("-");
const KEY_TOKEN = /sk-[A-Za-z0-9_*.-]{3,}/;

// A value that is plainly not a key must be refused before it costs an OpenAI
// call.
Deno.test("only sk- values of a sane length and charset look like a key", () => {
  assert(looksLikeOpenAIKey(KEY));
  assert(looksLikeOpenAIKey("sk-" + "a".repeat(17)));
  assertFalse(looksLikeOpenAIKey("sk-" + "a".repeat(16)));
  assertFalse(looksLikeOpenAIKey("sk-" + "a".repeat(298)));
  assertFalse(looksLikeOpenAIKey("pk-" + "a".repeat(30)));
  assertFalse(looksLikeOpenAIKey("sk-abc def" + "a".repeat(20)));
  assertFalse(looksLikeOpenAIKey("sk-abc'; drop table" + "a".repeat(20)));
});

// The page shows which key is saved without ever holding the key.
Deno.test("the hint shows only the last four characters", () => {
  assertEquals(formatHint(lastFour(KEY)), "sk-…6789");
});

// OpenAI's 401 text repeats part of the key. Logging it as-is leaks it.
Deno.test("maskSecrets removes the partial key OpenAI writes into its errors", () => {
  const text =
    "Incorrect API key provided: sk-proj-abc***wxyz. You can find your API key at https://platform.openai.com/account/api-keys.";
  const masked = maskSecrets(text);
  assertFalse(KEY_TOKEN.test(masked));
  assertFalse(masked.includes("wxyz"));
  assert(masked.includes("You can find your API key"));
});

Deno.test("maskSecrets removes the exact key wherever it appears", () => {
  const masked = maskSecrets(`key=${KEY} and again ${KEY}`, KEY);
  assertFalse(masked.includes(KEY));
  assertFalse(KEY_TOKEN.test(masked));
});

// Each OpenAI failure needs its own sentence, or a user with an empty billing
// account is told their key is wrong.
Deno.test("each OpenAI failure maps to its own status and sentence", () => {
  assertEquals(classifyOpenAIError({ status: 401, code: "invalid_api_key" }), {
    status: 400,
    message: "OpenAI rejected this key.",
  });
  for (const err of [{ status: 403 }, { status: 404, code: "model_not_found" }]) {
    assertEquals(classifyOpenAIError(err), {
      status: 400,
      message: "This key cannot use the text-embedding-3-small model.",
    });
  }
  for (const err of [{ status: 429 }, { status: 429, code: "insufficient_quota" }]) {
    assertEquals(
      classifyOpenAIError(err).message,
      "This key has no credit left or is rate limited. Check your OpenAI billing.",
    );
  }
  for (const err of [{ status: 500 }, { status: 503 }, new Error("Request timed out."), {}, null]) {
    assertEquals(classifyOpenAIError(err), {
      status: 502,
      message: "Could not reach OpenAI. Nothing was saved. Try again.",
    });
  }
});

// The classifier must not pass OpenAI's message through, because it can hold
// part of the key.
Deno.test("the classified message never contains OpenAI's own text", () => {
  const err = { status: 401, message: `Incorrect API key provided: ${KEY}` };
  assertFalse(classifyOpenAIError(err).message.includes("sk-"));
});
