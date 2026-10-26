import { assertEquals } from "@std/assert";
import { escapeLike } from "./likePattern.ts";

// A search for "50%" matched every file name with "50" in it.
Deno.test("a percent sign is matched literally", () => {
  assertEquals(escapeLike("50%"), "50\\%");
});

// A search for "a_b" matched "axb" because _ matches any one character.
Deno.test("an underscore is matched literally", () => {
  assertEquals(escapeLike("a_b"), "a\\_b");
});

// The backslash is the escape character, so it is escaped first or it would eat the next one.
Deno.test("a backslash is matched literally", () => {
  assertEquals(escapeLike("c:\\dir"), "c:\\\\dir");
  assertEquals(escapeLike("\\%"), "\\\\\\%");
});

// Ordinary searches must not change.
Deno.test("plain text and an empty string are unchanged", () => {
  assertEquals(escapeLike("annual report.pdf"), "annual report.pdf");
  assertEquals(escapeLike(""), "");
});
