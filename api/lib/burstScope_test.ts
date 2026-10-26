import { assertEquals } from "@std/assert";
import { isSemanticSearch } from "./burstScope.ts";

// With an own key, semantic file search was an OpenAI route with no limit.
Deno.test("a semantic file search is limited", () => {
  assertEquals(isSemanticSearch({ searchMode: "semantic", searchQuery: "x" }), true);
});

// Filename browsing runs on every modal open and must not use up the chat budget.
Deno.test("filename mode, a missing mode and a bad body are not limited", () => {
  for (const body of [{ searchMode: "filename" }, {}, null, "semantic", undefined]) {
    assertEquals(isSemanticSearch(body), false);
  }
});
