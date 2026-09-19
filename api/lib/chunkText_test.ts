import { assertEquals, assertNotEquals } from "@std/assert";
import {
  chunkPages,
  chunkText,
  createChunkId,
  estimateTokenCount,
  normalizeForEmbedding,
} from "./chunkText.ts";

// Qdrant upserts by point id. When this returned a random UUID, reprocessing a
// document appended a second copy of every chunk instead of replacing it, and
// 43% of the live vector store turned out to be duplicates.
Deno.test("chunk ids are stable across calls", async () => {
  const a = await createChunkId("doc-1", 7, 2);
  const b = await createChunkId("doc-1", 7, 2);
  assertEquals(a, b);
});

Deno.test("chunk ids differ per chunk, page and document", async () => {
  const base = await createChunkId("doc-1", 7, 2);
  assertNotEquals(base, await createChunkId("doc-1", 8, 2));
  assertNotEquals(base, await createChunkId("doc-1", 7, 3));
  assertNotEquals(base, await createChunkId("doc-2", 7, 2));
});

Deno.test("chunk ids are valid uuids, which Qdrant requires", async () => {
  const id = await createChunkId("doc-1", 0, 1);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assertEquals(uuid.test(id), true, `not a v5 uuid: ${id}`);
});

Deno.test("a page with no page number still gets a stable id", async () => {
  assertEquals(await createChunkId("doc-1", 3), await createChunkId("doc-1", 3));
  assertNotEquals(await createChunkId("doc-1", 3), await createChunkId("doc-1", 3, 1));
});

// Queries used to be stripped of every non-ASCII character while documents were
// left alone, so the two halves of the search were embedded from different text.
Deno.test("normalisation keeps non-ascii characters", () => {
  assertEquals(normalizeForEmbedding("kelapa sawit ±3,5%"), "kelapa sawit ±3,5%");
  assertEquals(normalizeForEmbedding("日本語のテキスト"), "日本語のテキスト");
});

Deno.test("normalisation collapses whitespace and trims", () => {
  assertEquals(normalizeForEmbedding("  a   b \n\n c  "), "a b c");
  assertEquals(normalizeForEmbedding(""), "");
  assertEquals(normalizeForEmbedding("   "), "");
});

Deno.test("chunking splits long text and keeps every chunk non-empty", () => {
  const text = "word ".repeat(4000);
  const chunks = chunkText(text, { maxChunkSize: 800, overlap: 50 });
  assertEquals(chunks.length > 1, true, "expected more than one chunk");
  for (const c of chunks) {
    assertEquals(c.content.length > 0, true);
    assertEquals(c.content, c.content.trim());
  }
});

Deno.test("chunking returns nothing for empty input", () => {
  assertEquals(chunkText(""), []);
  assertEquals(chunkText("   \n  "), []);
});

Deno.test("short text stays as a single chunk", () => {
  const chunks = chunkText("a short sentence", { maxChunkSize: 800 });
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0].content, "a short sentence");
});

Deno.test("chunk indices are sequential across pages", () => {
  const chunks = chunkPages([
    { pageNumber: 1, text: "alpha ".repeat(2000) },
    { pageNumber: 2, text: "beta ".repeat(2000) },
  ], { maxChunkSize: 800, overlap: 50 });

  assertEquals(chunks.map((c) => c.index), chunks.map((_, i) => i));
  assertEquals(chunks.some((c) => c.pageNumber === 1), true);
  assertEquals(chunks.some((c) => c.pageNumber === 2), true);
});

Deno.test("token estimate scales with length", () => {
  assertEquals(estimateTokenCount(""), 0);
  assertEquals(estimateTokenCount("abcd"), 1);
  assertEquals(estimateTokenCount("a".repeat(400)), 100);
});
