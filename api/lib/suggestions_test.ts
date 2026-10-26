import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  buildSuggestionMessages,
  type CompleteSuggestions,
  createSuggestionCache,
  FALLBACK_SUGGESTIONS,
  getSuggestions,
  parseSuggestions,
  SUGGESTION_MAX_CHARS,
  SUGGESTION_MAX_DOCS,
  SUGGESTION_PROMPT_CHARS,
  SUGGESTION_SUMMARY_CHARS,
  type SuggestionDoc,
  suggestionsCacheKey,
} from "./suggestions.ts";

const doc = (id: string, fields: Partial<SuggestionDoc> = {}): SuggestionDoc => ({
  id,
  file_name: `${id}.pdf`,
  summary: null,
  is_summary_exist: false,
  updated_at: "2026-10-01T00:00:00Z",
  ...fields,
});

const four = ["What is A?", "What is B?", "What is C?", "What is D?"];

/** Counts its calls, so a test can assert the cache made none. */
const spy = (answer: string) => {
  const calls: unknown[] = [];
  const complete: CompleteSuggestions = (messages) => {
    calls.push(messages);
    return Promise.resolve(answer);
  };
  return { complete, calls };
};

// The model answers with a plain array most of the time; this is the happy path.
Deno.test("a JSON array of questions is parsed as is", () => {
  assertEquals(parseSuggestions(JSON.stringify(four)), four);
});

// gpt-4o-mini often adds a sentence or a markdown fence around the array.
Deno.test("text or a code fence around the array is ignored", () => {
  assertEquals(parseSuggestions(`Here you go:\n${JSON.stringify(four)}\nHope it helps.`), four);
  assertEquals(parseSuggestions("```json\n" + JSON.stringify(four) + "\n```"), four);
});

// The UI has room for four chips.
Deno.test("more than four questions are cut to the first four", () => {
  assertEquals(parseSuggestions(JSON.stringify([...four, "What is E?", "What is F?"])), four);
});

// An empty chip is a button with nothing to send.
Deno.test("empty and blank strings are dropped and the rest trimmed", () => {
  assertEquals(parseSuggestions(JSON.stringify(["", "   ", "  What is A?  "])), ["What is A?"]);
});

// A paragraph is not a question chip; it is dropped rather than cut mid-word.
Deno.test("a question over the length cap is dropped", () => {
  const long = "Why ".repeat(SUGGESTION_MAX_CHARS);
  assertEquals(parseSuggestions(JSON.stringify([long, "What is A?"])), ["What is A?"]);
});

Deno.test("duplicates are removed regardless of case", () => {
  assertEquals(parseSuggestions(JSON.stringify(["What is A?", "what is a?", "What is B?"])), [
    "What is A?",
    "What is B?",
  ]);
});

// Anything that is not one usable question must turn into the fallback list.
Deno.test("output that is not a JSON array of strings gives null", () => {
  for (const raw of ["", "Sorry, I cannot help.", "[not json]", '{"a": 1}', "[1, 2, null]", "[]"]) {
    assertEquals(parseSuggestions(raw), null, raw);
  }
});

Deno.test("non-string items are skipped", () => {
  assertEquals(parseSuggestions('[1, "What is A?", {"q": "x"}]'), ["What is A?"]);
});

// Summaries are long Markdown documents; the prompt must stay small and cheap.
Deno.test("the prompt is capped by documents, summary length and total size", () => {
  const docs = Array.from({ length: 30 }, (_, i) =>
    doc(`d${i}`, { summary: "s".repeat(2000), is_summary_exist: true }));

  const [, user] = buildSuggestionMessages(docs);

  assert(user.content.length <= SUGGESTION_PROMPT_CHARS + 100);
  assertFalse(user.content.includes("s".repeat(SUGGESTION_SUMMARY_CHARS + 1)));
  assertFalse(user.content.includes(`d${SUGGESTION_MAX_DOCS}.pdf`));
});

// A summary row can hold old text after is_summary_exist was reset.
Deno.test("a summary is only used when its flag says it exists", () => {
  const [, user] = buildSuggestionMessages([
    doc("a", { summary: "stale text", is_summary_exist: false }),
  ]);
  assertFalse(user.content.includes("stale text"));
});

Deno.test("no ready documents gives an empty list and makes no model call", async () => {
  const { complete, calls } = spy(JSON.stringify(four));

  const out = await getSuggestions("p1", [], complete, createSuggestionCache());

  assertEquals(out, { suggestions: [], source: "empty" });
  assertEquals(calls.length, 0);
});

Deno.test("good output is returned as generated", async () => {
  const { complete } = spy(JSON.stringify(four));

  const out = await getSuggestions("p1", [doc("a")], complete, createSuggestionCache());

  assertEquals(out, { suggestions: four, source: "generated" });
});

// A failing suggestion call must never break the empty chat.
Deno.test("a thrown error gives the fallback list", async () => {
  const complete: CompleteSuggestions = () => Promise.reject(new Error("401"));

  const out = await getSuggestions("p1", [doc("a")], complete, createSuggestionCache());

  assertEquals(out, { suggestions: [...FALLBACK_SUGGESTIONS], source: "fallback" });
});

Deno.test("a completion that never returns gives the fallback after the deadline", async () => {
  const complete: CompleteSuggestions = () => new Promise<string>(() => {});

  const out = await getSuggestions("p1", [doc("a")], complete, createSuggestionCache(), {
    timeoutMs: 20,
  });

  assertEquals(out.source, "fallback");
});

Deno.test("output that does not parse gives the fallback list", async () => {
  const { complete } = spy("I think you should ask about the documents.");

  const out = await getSuggestions("p1", [doc("a")], complete, createSuggestionCache());

  assertEquals(out.source, "fallback");
  assertEquals(out.suggestions, [...FALLBACK_SUGGESTIONS]);
});

// The empty chat is shown on every project visit; without the cache each
// visit would be one more model call.
Deno.test("a second call for an unchanged project makes no model call", async () => {
  const cache = createSuggestionCache();
  const { complete, calls } = spy(JSON.stringify(four));
  const docs = [doc("a"), doc("b")];

  await getSuggestions("p1", docs, complete, cache);
  const out = await getSuggestions("p1", [...docs].reverse(), complete, cache);

  assertEquals(calls.length, 1);
  assertEquals(out, { suggestions: four, source: "generated" });
});

// Questions must follow the documents: a new one, a new summary or a
// regenerated summary changes what they can be about.
Deno.test("a new ready document, a new summary or a regenerated summary misses the cache", async () => {
  const base = [doc("a")];
  const changed = [
    [doc("a"), doc("b")],
    [doc("a", { is_summary_exist: true, summary: "x" })],
    [doc("a", { updated_at: "2026-10-02T00:00:00Z" })],
  ];

  for (const docs of changed) {
    const cache = createSuggestionCache();
    const { complete, calls } = spy(JSON.stringify(four));
    await getSuggestions("p1", base, complete, cache);
    await getSuggestions("p1", docs, complete, cache);
    assertEquals(calls.length, 2);
    assert(suggestionsCacheKey(base) !== suggestionsCacheKey(docs));
  }
});

// A short outage must not pin the generic list on a project until the next deploy.
Deno.test("a fallback is not cached", async () => {
  const cache = createSuggestionCache();
  let calls = 0;
  const complete: CompleteSuggestions = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error("503")) : Promise.resolve(JSON.stringify(four));
  };

  const first = await getSuggestions("p1", [doc("a")], complete, cache);
  const second = await getSuggestions("p1", [doc("a")], complete, cache);

  assertEquals(first.source, "fallback");
  assertEquals(second.source, "generated");
  assertEquals(calls, 2);
});

// Two tabs or a quick re-render must not pay twice for the same answer.
Deno.test("two calls at the same time share one model call", async () => {
  const cache = createSuggestionCache();
  const { complete, calls } = spy(JSON.stringify(four));

  const [a, b] = await Promise.all([
    getSuggestions("p1", [doc("a")], complete, cache),
    getSuggestions("p1", [doc("a")], complete, cache),
  ]);

  assertEquals(calls.length, 1);
  assertEquals(a, b);
  assertEquals(cache.pending.size, 0);
});

// The cache lives for the life of the process and must not grow without limit.
Deno.test("the cache keeps at most its size in projects, dropping the oldest", async () => {
  const cache = createSuggestionCache(2);
  const { complete, calls } = spy(JSON.stringify(four));

  for (const projectId of ["p1", "p2", "p3"]) {
    await getSuggestions(projectId, [doc("a")], complete, cache);
  }
  assertEquals(cache.done.size, 2);
  assertFalse(cache.done.has("p1"));

  await getSuggestions("p3", [doc("a")], complete, cache);
  assertEquals(calls.length, 3);
});
