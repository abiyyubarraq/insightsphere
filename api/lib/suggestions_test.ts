import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  buildSuggestionMessages,
  type CompleteSuggestions,
  createSuggestionCache,
  FALLBACK_SUGGESTIONS,
  getSuggestions,
  type LoadSummaries,
  parseSuggestions,
  SUGGESTION_MAX_CHARS,
  SUGGESTION_MAX_DOCS,
  SUGGESTION_MIN_INTERVAL_MS,
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

/** A clock the test moves by hand, so the interval needs no real waiting. */
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
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
    const time = clock();
    const { complete, calls } = spy(JSON.stringify(four));
    await getSuggestions("p1", base, complete, cache, { now: time.now });
    time.advance(SUGGESTION_MIN_INTERVAL_MS);
    await getSuggestions("p1", docs, complete, cache, { now: time.now });
    assertEquals(calls.length, 2);
    assert(suggestionsCacheKey(base) !== suggestionsCacheKey(docs));
  }
});

// A short outage must not pin the generic list on a project until the next deploy.
Deno.test("a fallback is not cached", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  let calls = 0;
  const complete: CompleteSuggestions = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error("503")) : Promise.resolve(JSON.stringify(four));
  };

  const first = await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  time.advance(SUGGESTION_MIN_INTERVAL_MS);
  const second = await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });

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

// The user can change updated_at on their own rows, so the key alone does not
// stop a loop of model calls on the server key.
Deno.test("two cache misses within the interval make one model call", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy(JSON.stringify(four));

  const first = await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  time.advance(SUGGESTION_MIN_INTERVAL_MS - 1);
  const second = await getSuggestions(
    "p1",
    [doc("a", { updated_at: "2026-10-02T00:00:00Z" })],
    complete,
    cache,
    { now: time.now },
  );

  assertEquals(calls.length, 1);
  assertEquals(first, { suggestions: four, source: "generated" });
  assertEquals(second, { suggestions: four, source: "generated" });
});

Deno.test("a cache miss after the interval calls the model again", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy(JSON.stringify(four));

  await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  time.advance(SUGGESTION_MIN_INTERVAL_MS);
  await getSuggestions("p1", [doc("a"), doc("b")], complete, cache, { now: time.now });

  assertEquals(calls.length, 2);
});

// A miss inside the interval must not store the old list under the new key,
// or the next call after the interval would never refresh it.
Deno.test("a miss inside the interval is not stored under the new key", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy(JSON.stringify(four));
  const edited = [doc("a", { updated_at: "2026-10-02T00:00:00Z" })];

  await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  await getSuggestions("p1", edited, complete, cache, { now: time.now });
  time.advance(SUGGESTION_MIN_INTERVAL_MS);
  await getSuggestions("p1", edited, complete, cache, { now: time.now });

  assertEquals(calls.length, 2);
});

// A failed call costs money too, so it starts the interval as well.
Deno.test("a failed model call also starts the interval", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  let calls = 0;
  const complete: CompleteSuggestions = () => {
    calls += 1;
    return Promise.reject(new Error("503"));
  };

  const first = await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  const second = await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  time.advance(SUGGESTION_MIN_INTERVAL_MS);
  await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });

  assertEquals(first.source, "fallback");
  assertEquals(second, { suggestions: [...FALLBACK_SUGGESTIONS], source: "fallback" });
  assertEquals(calls, 2);
});

Deno.test("output that does not parse also starts the interval", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy("not json");

  await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  await getSuggestions("p1", [doc("b")], complete, cache, { now: time.now });

  assertEquals(calls.length, 1);
});

Deno.test("the interval is kept per project", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy(JSON.stringify(four));

  await getSuggestions("p1", [doc("a")], complete, cache, { now: time.now });
  await getSuggestions("p2", [doc("a")], complete, cache, { now: time.now });

  assertEquals(calls.length, 2);
});

Deno.test("the interval map keeps at most the cache size in projects", async () => {
  const cache = createSuggestionCache(2);
  const time = clock();
  const { complete } = spy(JSON.stringify(four));

  for (const projectId of ["p1", "p2", "p3"]) {
    await getSuggestions(projectId, [doc("a")], complete, cache, { now: time.now });
  }

  assertEquals(cache.lastCall.size, 2);
});

// The key needs no summary text, and a cache hit must not read any.
Deno.test("summaries are read only for a model call, for the newest flagged documents", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete, calls } = spy(JSON.stringify(four));
  const asked: string[][] = [];
  const loadSummaries: LoadSummaries = (ids) => {
    asked.push(ids);
    return Promise.resolve(new Map(ids.map((id) => [id, `text of ${id}`])));
  };
  const docs = Array.from({ length: SUGGESTION_MAX_DOCS + 3 }, (_, i) =>
    doc(`d${i}`, { is_summary_exist: i !== 1 }));

  await getSuggestions("p1", docs, complete, cache, { now: time.now, loadSummaries });
  await getSuggestions("p1", docs, complete, cache, { now: time.now, loadSummaries });

  assertEquals(calls.length, 1);
  assertEquals(asked.length, 1);
  assertEquals(asked[0].length, SUGGESTION_MAX_DOCS - 1);
  assertFalse(asked[0].includes("d1"));
  assertFalse(asked[0].includes(`d${SUGGESTION_MAX_DOCS}`));
  const user = (calls[0] as { content: string }[])[1].content;
  assert(user.includes("text of d0"));
});

Deno.test("a miss inside the interval reads no summaries", async () => {
  const cache = createSuggestionCache();
  const time = clock();
  const { complete } = spy(JSON.stringify(four));
  let reads = 0;
  const loadSummaries: LoadSummaries = () => {
    reads += 1;
    return Promise.resolve(new Map());
  };
  const flagged = (updated_at: string) => [doc("a", { is_summary_exist: true, updated_at })];

  await getSuggestions("p1", flagged("1"), complete, cache, { now: time.now, loadSummaries });
  await getSuggestions("p1", flagged("2"), complete, cache, { now: time.now, loadSummaries });

  assertEquals(reads, 1);
});

// A database error while reading summaries must not break the empty chat.
Deno.test("a failed summary read gives the fallback and makes no model call", async () => {
  const cache = createSuggestionCache();
  const { complete, calls } = spy(JSON.stringify(four));
  const loadSummaries: LoadSummaries = () => Promise.reject(new Error("db down"));

  const out = await getSuggestions(
    "p1",
    [doc("a", { is_summary_exist: true })],
    complete,
    cache,
    { loadSummaries },
  );

  assertEquals(out.source, "fallback");
  assertEquals(calls.length, 0);
});
