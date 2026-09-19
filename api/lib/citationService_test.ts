import { assertEquals } from "@std/assert";
import { citationService } from "./citationService.ts";
import type { SearchResult } from "./qdrantClient.ts";

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: "p1",
  content: "Bitcoin price prediction using N-BEATS.",
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

// The model is told to cite [doc_id: N], and the frontend maps N back to the
// Nth citation. If the labels and the citation order ever diverge, every
// citation link points at the wrong source.
Deno.test("context labels are 1-based and match citation order", () => {
  const ctx = citationService.buildContext([
    result({ id: "a", metadata: { ...result().metadata, fileName: "first.pdf" } }),
    result({ id: "b", metadata: { ...result().metadata, fileName: "second.pdf" } }),
  ]);

  assertEquals(ctx.formatted_context.includes("[doc_id: 1] Source: first.pdf"), true);
  assertEquals(ctx.formatted_context.includes("[doc_id: 2] Source: second.pdf"), true);
  assertEquals(ctx.citations[0].file_name, "first.pdf");
  assertEquals(ctx.citations[1].file_name, "second.pdf");
});

Deno.test("empty results produce an empty context, not a crash", () => {
  const ctx = citationService.buildContext([]);
  assertEquals(ctx.citations, []);
  assertEquals(ctx.total_chunks, 0);
  assertEquals(ctx.avg_similarity, 0);
});

Deno.test("average similarity is the mean of the scores", () => {
  const ctx = citationService.buildContext([
    result({ score: 0.6 }),
    result({ score: 0.8 }),
  ]);
  assertEquals(Number(ctx.avg_similarity.toFixed(4)), 0.7);
});

Deno.test("a page number is carried into the citation", () => {
  const ctx = citationService.buildContext([result({
    metadata: { ...result().metadata, pageNumber: 12 },
  })]);
  assertEquals(ctx.citations[0].page_number, 12);
  assertEquals(ctx.formatted_context.includes("Page 12"), true);
});

Deno.test("a missing page number is omitted rather than rendered as undefined", () => {
  const md = { ...result().metadata };
  delete (md as { pageNumber?: number }).pageNumber;
  const ctx = citationService.buildContext([result({ metadata: md })]);
  assertEquals(ctx.formatted_context.includes("undefined"), false);
  assertEquals(ctx.formatted_context.includes("Page"), false);
});

Deno.test("short context stops before the limit but always keeps one chunk", () => {
  const long = result({ content: "x".repeat(5000) });
  const ctx = citationService.createShortContext([long, long, long], 3000);
  assertEquals(ctx.total_chunks, 1);
});

Deno.test("citations are grouped by document", () => {
  const other = result({
    metadata: { ...result().metadata, documentId: "doc-2", fileName: "other.pdf" },
  });
  const { citations } = citationService.buildContext([result(), result(), other]);
  const grouped = citationService.groupByDocument(citations);
  assertEquals(Object.keys(grouped).sort(), ["doc-1", "doc-2"]);
  assertEquals(grouped["doc-1"].length, 2);
});

Deno.test("snippets are truncated", () => {
  const { citations } = citationService.buildContext([
    result({ content: "sentence. ".repeat(200) }),
  ]);
  assertEquals(citations[0].text_snippet.length <= 210, true);
});

// The model is told every number in its answer must appear in the context, so
// nothing numeric may reach the context that is not from the document. A
// similarity score leaking into the header would be a number it could restate.
Deno.test("retrieval scores never reach the context", () => {
  const ctx = citationService.buildContext([
    result({ score: 0.8317 }),
    result({ id: "p2", score: 0.4142 }),
  ]);

  assertEquals(ctx.formatted_context.includes("0.83"), false);
  assertEquals(ctx.formatted_context.includes("0.41"), false);
  assertEquals(ctx.formatted_context.toLowerCase().includes("score"), false);
  assertEquals(ctx.formatted_context.toLowerCase().includes("similarity"), false);
  // The citations still carry it, because the UI shows it next to the source.
  assertEquals(ctx.citations[0].similarity_score, 0.8317);
});
