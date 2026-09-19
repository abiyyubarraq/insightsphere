import { assertEquals } from "@std/assert";
import {
  dropDuplicateChunks,
  fuseByRRF,
  isWeakMatch,
  sortByScore,
  topScore,
} from "./retrieval.ts";
import { SUFFICIENCY_FLOOR } from "./constants.ts";
import type { SearchResult } from "./qdrantClient.ts";

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: "p1",
  content: "Hallucination arises when the decoder is unconstrained.",
  score: 0.8,
  metadata: {
    documentId: "doc-1",
    projectId: "proj-1",
    userId: "user-1",
    pageNumber: 3,
    chunkIndex: 0,
    fileName: "paper.pdf",
    fileType: "pdf",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  ...over,
});

// A follow-up is searched for twice, once as asked and once rewritten. Both
// searches hit the same collection, so the same chunk comes back in both lists.
// Without fusion it would occupy two of the five context slots.
Deno.test("a chunk found by both queries is kept once", () => {
  const fused = fuseByRRF([
    [result({ id: "a" }), result({ id: "b" })],
    [result({ id: "a" }), result({ id: "c" })],
  ]);

  assertEquals(fused.map((r) => r.id).sort(), ["a", "b", "c"]);
});

// The reason for fusing rather than concatenating: agreement between two
// phrasings of the same question is stronger evidence than one high rank.
Deno.test("a chunk both queries rank well beats one only a single query found", () => {
  const fused = fuseByRRF([
    [result({ id: "a" }), result({ id: "b" })],
    [result({ id: "c" }), result({ id: "a" })],
  ]);

  assertEquals(fused[0].id, "a");
});

// The UI prints score as "Relevance: N%" and avg_similarity is stored per
// message. An RRF score of 0.03 in that field would be meaningless, so fusion
// must order by rank and still hand back the cosine score.
Deno.test("fusion keeps the better cosine score, not the fused score", () => {
  const fused = fuseByRRF([
    [result({ id: "a", score: 0.41 })],
    [result({ id: "a", score: 0.67 })],
  ]);

  assertEquals(fused.length, 1);
  assertEquals(fused[0].score, 0.67);
});

Deno.test("fusing nothing returns nothing", () => {
  assertEquals(fuseByRRF([]), []);
  assertEquals(fuseByRRF([[], []]), []);
});

// Before chunk ids were deterministic, reprocessing appended a second copy of
// every chunk under a fresh random id. One measured query returned the same
// paragraph five times, wasting four of five context slots.
Deno.test("the same passage stored under two ids collapses to one", () => {
  const meta = result().metadata;
  const deduped = dropDuplicateChunks([
    result({ id: "random-1", score: 0.62, metadata: meta }),
    result({ id: "random-2", score: 0.62, metadata: meta }),
    result({
      id: "other",
      score: 0.5,
      metadata: { ...meta, chunkIndex: 1 },
    }),
  ]);

  assertEquals(deduped.length, 2);
  assertEquals(deduped[0].id, "random-1");
  assertEquals(deduped[1].id, "other");
});

Deno.test("a duplicate with a higher score replaces the one kept", () => {
  const meta = result().metadata;
  const deduped = dropDuplicateChunks([
    result({ id: "low", score: 0.40, metadata: meta }),
    result({ id: "high", score: 0.70, metadata: meta }),
  ]);

  assertEquals(deduped.length, 1);
  assertEquals(deduped[0].id, "high");
});

Deno.test("chunks on different pages of one document are not duplicates", () => {
  const meta = result().metadata;
  const deduped = dropDuplicateChunks([
    result({ id: "a", metadata: { ...meta, pageNumber: 1 } }),
    result({ id: "b", metadata: { ...meta, pageNumber: 2 } }),
  ]);

  assertEquals(deduped.length, 2);
});

// buildContext numbers chunks in the order it is given them, the model cites
// [doc_id: N], and both the chat route and the history reload sort citations by
// score. Hand the builder a list in fused-rank order and the numbers stop
// matching the sources.
Deno.test("the chosen chunks come out in score order", () => {
  const ordered = sortByScore([
    result({ id: "a", score: 0.42 }),
    result({ id: "b", score: 0.68 }),
    result({ id: "c", score: 0.55 }),
  ]);

  assertEquals(ordered.map((r) => r.id), ["b", "c", "a"]);
});

Deno.test("sorting by score leaves the input alone", () => {
  const input = [result({ id: "a", score: 0.4 }), result({ id: "b", score: 0.9 })];
  sortByScore(input);
  assertEquals(input.map((r) => r.id), ["a", "b"]);
});

Deno.test("top score is the highest, and zero for nothing", () => {
  assertEquals(topScore([]), 0);
  assertEquals(
    topScore([result({ score: 0.31 }), result({ score: 0.66 })]),
    0.66,
  );
});

// A weak match is answered, not refused; the point of the floor is that the
// answer says so. Refusing on a 0.40 hit loses more than it saves.
Deno.test("a match below the floor is weak, one at the floor is not", () => {
  assertEquals(isWeakMatch([result({ score: SUFFICIENCY_FLOOR - 0.01 })]), true);
  assertEquals(isWeakMatch([result({ score: SUFFICIENCY_FLOOR })]), false);
  assertEquals(isWeakMatch([result({ score: 0.68 })]), false);
  assertEquals(isWeakMatch([]), true);
});
