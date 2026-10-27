import { assertEquals } from "@std/assert";
import { errorInfo } from "./logSafe.ts";

const KEY_PART = "sk-abc123";
const DOCUMENT_TEXT = "Psychological inoculation works like a vaccine";

// Routes logged whole error objects, and OpenAI or parser errors repeat part
// of the key or the document text in their message.
Deno.test("only name, status and code are kept from an error", () => {
  const error = Object.assign(
    new Error(`Incorrect API key provided: ${KEY_PART}. Text: ${DOCUMENT_TEXT}`),
    { status: 401, code: "invalid_api_key" },
  );
  const info = errorInfo(error);
  assertEquals(info, { name: "Error", status: 401, code: "invalid_api_key" });
  const logged = JSON.stringify(info);
  assertEquals(logged.includes(KEY_PART), false);
  assertEquals(logged.includes(DOCUMENT_TEXT), false);
});

// A Supabase error is a plain object with a string code and a message that can
// quote row values; the message must not reach the log.
Deno.test("a plain error object keeps its code and loses its message", () => {
  const info = errorInfo({ code: "PGRST116", message: DOCUMENT_TEXT, details: DOCUMENT_TEXT });
  assertEquals(info, { code: "PGRST116" });
});

// A thrown string or null must not crash the error log in a catch block.
Deno.test("null, a string and an object without fields give an empty result", () => {
  assertEquals(errorInfo(null), {});
  assertEquals(errorInfo(undefined), {});
  assertEquals(errorInfo(`failed: ${KEY_PART}`), {});
  assertEquals(errorInfo({}), {});
});
