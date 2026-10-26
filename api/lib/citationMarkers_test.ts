import { assert, assertEquals } from "@std/assert";
import {
  historyForPrompt,
  keepValidCitationIds,
  stripCitationMarkers,
} from "./citationMarkers.ts";
import { buildRewriteMessages, selectRewriteTurns } from "./queryRewrite.ts";

const assertClean = (text: string) => {
  assert(!text.includes("[doc_id"), `marker left in: ${text}`);
  assert(!text.includes("[]"), `empty brackets in: ${text}`);
  assert(!/ {2}/.test(text), `double space in: ${text}`);
  assert(!/ [.,;]/.test(text), `space before punctuation in: ${text}`);
};

// Earlier answers went into the prompt with their markers, and the model copied
// those numbers into the new answer, citing sources that did not exist.
Deno.test("stripping removes a single marker and its space", () => {
  const text = stripCitationMarkers("Inoculation works [doc_id: 1] in practice.");
  assertEquals(text, "Inoculation works in practice.");
  assertClean(text);
});

// A list marker is one marker, not an id followed by stray text.
Deno.test("stripping removes a list marker", () => {
  const text = stripCitationMarkers("Two studies agree [doc_id: 1, 3] on this.");
  assertEquals(text, "Two studies agree on this.");
  assertClean(text);
});

// Removing one marker must not leave the spaces of the others behind.
Deno.test("stripping removes several markers in one text", () => {
  const text = stripCitationMarkers(
    "First point [doc_id: 2]. Second point [doc_id: 4, 5] holds.\n- item [doc_id: 1]\n[doc_id: 3] Starts a line.",
  );
  assertEquals(text, "First point. Second point holds.\n- item\nStarts a line.");
  assertClean(text);
});

// Each adjacent marker used to leave its own gap, giving a double space.
Deno.test("stripping adjacent markers leaves one space", () => {
  assertEquals(
    stripCitationMarkers("Seen here [doc_id: 1][doc_id: 2] and there [doc_id: 3] [doc_id: 4]."),
    "Seen here and there.",
  );
});

// "As shown [doc_id: 1]." must not become "As shown ."
Deno.test("stripping a marker before punctuation leaves no space before it", () => {
  const text = stripCitationMarkers("As shown [doc_id: 1], then [doc_id: 2]; finally [doc_id: 3].");
  assertEquals(text, "As shown, then; finally.");
  assertClean(text);
});

Deno.test("stripping a marker at the end of the text leaves no trailing space", () => {
  assertEquals(stripCitationMarkers("The end [doc_id: 5]"), "The end");
});

// Markdown emphasis closes on the next character, so a space there breaks it.
Deno.test("stripping a marker inside bold keeps the bold closed", () => {
  assertEquals(stripCitationMarkers("**Key [doc_id: 1]** point"), "**Key** point");
});

// A loose pattern would delete normal bracketed text from the answer.
Deno.test("stripping leaves text without markers unchanged", () => {
  const text = "No markers  here, an array [1, 2, 3] and [doc_id: abc].";
  assertEquals(stripCitationMarkers(text), text);
});

// The model cited [doc_id: 9] and [doc_id: 18] with only 5 sources shown.
Deno.test("keeping ids 1 to 5 drops 0, 6 and 18 and keeps 1 and 5", () => {
  assertEquals(keepValidCitationIds("A [doc_id: 0] b.", 5), "A b.");
  assertEquals(keepValidCitationIds("A [doc_id: 1] b.", 5), "A [doc_id: 1] b.");
  assertEquals(keepValidCitationIds("A [doc_id: 5] b.", 5), "A [doc_id: 5] b.");
  assertEquals(keepValidCitationIds("A [doc_id: 6] b.", 5), "A b.");
  assertEquals(keepValidCitationIds("A [doc_id: 18].", 5), "A.");
});

// A list with one bad id must keep the good one, not lose the whole citation.
Deno.test("keeping valid ids trims a mixed list", () => {
  assertEquals(keepValidCitationIds("Shown [doc_id: 2, 9].", 5), "Shown [doc_id: 2].");
  assertEquals(
    keepValidCitationIds("Shown [doc_id: 9][doc_id: 3] here.", 5),
    "Shown [doc_id: 3] here.",
  );
});

Deno.test("keeping valid ids removes a list with only bad ids and its space", () => {
  const text = keepValidCitationIds("Claimed [doc_id: 7, 18] here [doc_id: 0, 6].", 5);
  assertEquals(text, "Claimed here.");
  assertClean(text);
});

// With no sources, every marker points at nothing.
Deno.test("keeping valid ids with no sources removes every marker", () => {
  assertEquals(keepValidCitationIds("A [doc_id: 1] b [doc_id: 2, 3].", 0), "A b.");
});

Deno.test("keeping valid ids removes repeats and reads 05 as 5", () => {
  assertEquals(keepValidCitationIds("A [doc_id: 2, 2, 9, 2].", 5), "A [doc_id: 2].");
  assertEquals(keepValidCitationIds("A [doc_id: 05].", 5), "A [doc_id: 05].");
});

const recent = [
  { id: "m1", role: "user", content: "What is [doc_id: 1] in my notes?" },
  { id: "m2", role: "assistant", content: "It is a method [doc_id: 1, 4]. It works [doc_id: 19]." },
  { id: "m3", role: "system", content: "note" },
];

// History reaches the model twice: as prose for the answer and as turns for
// the query rewrite. Both carried the old numbers.
Deno.test("history for a prompt has no markers in assistant messages", () => {
  const { messages } = historyForPrompt(recent);

  assertEquals(messages[0], recent[0]);
  assertEquals(messages[1].content, "It is a method. It works.");
  assertEquals(messages[1].id, "m2");
  assertEquals(messages[2], recent[2]);
});

Deno.test("history turns for the query rewrite have no markers", () => {
  const { turns } = historyForPrompt(recent);

  assertEquals(turns, [
    { role: "user", content: "What is [doc_id: 1] in my notes?" },
    { role: "assistant", content: "It is a method. It works." },
  ]);
  const prompt = buildRewriteMessages(selectRewriteTurns(turns), "and then?")
    .map((message) => message.content)
    .join("\n");
  assert(!prompt.includes("[doc_id: 19]"));
});
