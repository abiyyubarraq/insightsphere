import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  failureText,
  KEY_NO_MODEL,
  KEY_OUT_OF_CREDIT,
  KEY_REJECTED,
  OpenAIRequestError,
  userKeyFailure,
} from "./openaiErrors.ts";

/** Shaped like the SDK's APIError: a message plus status and code fields. */
function sdkError(fields: { status?: number; code?: string }, message = "boom") {
  return Object.assign(new Error(message), fields);
}

const failed = (fields: { status?: number; code?: string }) =>
  new OpenAIRequestError("Failed to generate embedding", sdkError(fields));

// The client used to rethrow `new Error("Failed ...: <raw>")`, so a route could
// no longer tell a rejected key (401) from an outage.
Deno.test("the wrapped error keeps the SDK status and code", () => {
  const error = new OpenAIRequestError(
    "Failed to generate embedding",
    sdkError({ status: 429, code: "insufficient_quota" }),
  );

  assertEquals(error.status, 429);
  assertEquals(error.code, "insufficient_quota");
  assert(error.message.startsWith("Failed to generate embedding: "));
});

// OpenAI repeats part of the key in its own error text, and the wrapper message
// is logged, returned in `details` and written to processing_error.
Deno.test("the wrapped message holds no key text", () => {
  const error = new OpenAIRequestError(
    "Failed to generate embedding",
    sdkError({ status: 401 }, "Incorrect API key provided: sk-proj-abc***wxyz"),
  );

  assertFalse(error.message.includes("abc"));
  assertFalse(error.message.includes("wxyz"));
  assertFalse("cause" in error && error.cause !== undefined);
});

// A rejected own key has to tell the user what to do, not look like an outage.
Deno.test("a 401 on the user's key is a 400 asking them to update it", () => {
  assertEquals(userKeyFailure(failed({ status: 401 })), {
    status: 400,
    message: KEY_REJECTED,
  });
});

// Their OpenAI account ran out, not ours: the user's billing is the fix.
Deno.test("a 429 or no credit on the user's key is a 429 about their account", () => {
  assertEquals(userKeyFailure(failed({ status: 429 })), {
    status: 429,
    message: KEY_OUT_OF_CREDIT,
  });
  assertEquals(userKeyFailure(failed({ code: "insufficient_quota" })), {
    status: 429,
    message: KEY_OUT_OF_CREDIT,
  });
});

// Same cases the key check on save already treats as a key problem.
Deno.test("a key without access to the model is a 400", () => {
  for (const fields of [{ status: 403 }, { status: 404 }, { code: "model_not_found" }]) {
    assertEquals(userKeyFailure(failed(fields)), { status: 400, message: KEY_NO_MODEL });
  }
});

// An OpenAI outage is not the user's key, and must not tell them to change it.
Deno.test("a 500 or a non-OpenAI error is not a key failure", () => {
  assertEquals(userKeyFailure(failed({ status: 500 })), null);
  assertEquals(userKeyFailure(sdkError({ status: 401 })), null);
  assertEquals(userKeyFailure({ status: 401 }), null);
});

// A failed own-key embedding left the raw SDK text, key fragment included, in
// processing_error, which the browser shows.
Deno.test("processing_error is the user sentence for an own key", () => {
  const error = new OpenAIRequestError(
    "Failed to generate batch embeddings",
    sdkError({ status: 401 }, "Incorrect API key provided: sk-proj-abc***wxyz"),
  );

  assertEquals(failureText(error, true), KEY_REJECTED);
});

// The server key's failure is ours to read in the row, not the user's to fix.
Deno.test("processing_error on the server key stays the masked message", () => {
  const error = new OpenAIRequestError(
    "Failed to generate batch embeddings",
    sdkError({ status: 401 }, "Incorrect API key provided: sk-proj-abc***wxyz"),
  );

  const text = failureText(error, false);
  assert(text.startsWith("Failed to generate batch embeddings: "));
  assertFalse(text.includes("wxyz"));
  assertEquals(failureText(new Error("Parser error: x"), true), "Parser error: x");
});
