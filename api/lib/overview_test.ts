import { assert, assertEquals } from "@std/assert";
import { buildOverview, OVERVIEW_SNIPPET_CHARS, type OverviewDoc } from "./overview.ts";
import { SEARCH_DEFAULTS } from "./constants.ts";

const doc = (n: number, summary: string | null): OverviewDoc => ({
  id: `doc-${n}`,
  file_name: `paper-${n}.pdf`,
  summary,
  updated_at: "2026-10-01T00:00:00.000Z",
});

const words = (count: number, word = "word") => Array(count).fill(word).join(" ");

/** The summary text of source N, without its header. */
function body(context: string, n: number): string {
  const part = context.split("\n\n---\n\n").find((p) => p.startsWith(`[doc_id: ${n}]`));
  return part?.split("\n").slice(1).join("\n") ?? "";
}

// Chip N opens the Nth citation. Each document must be exactly one source, in
// the order given, numbered the same way as search results.
Deno.test("each document with a summary is one numbered source, in order", () => {
  const overview = buildOverview([doc(1, "First."), doc(2, "Second.")], 4000);

  assertEquals(overview.total_chunks, 2);
  assert(overview.formatted_context.startsWith("[doc_id: 1] Source: paper-1.pdf\nFirst."));
  assert(overview.formatted_context.includes("[doc_id: 2] Source: paper-2.pdf\nSecond."));
  assertEquals(
    overview.citations.map((c) => [c.document_id, c.chunk_index, c.similarity_score, c.page_number]),
    [["doc-1", 0, 0, undefined], ["doc-2", 1, 0, undefined]],
  );
});

// Summaries run to 3000 tokens. Twelve of them uncut would blow past the
// context cap, and the first one would crowd out the rest.
Deno.test("twelve long summaries stay under the cap and each keeps its share", () => {
  const docs = Array.from({ length: 12 }, (_, i) => doc(i + 1, words(2000)));
  const max = SEARCH_DEFAULTS.maxContextLength;
  const overview = buildOverview(docs, max);

  const bodies = docs.map((_, i) => body(overview.formatted_context, i + 1));
  const total = bodies.reduce((sum, text) => sum + text.length, 0);
  assert(total <= max, `${total} > ${max}`);
  const share = Math.floor(max / 12);
  for (const text of bodies) assert(text.length > share - 10, `${text.length} vs ${share}`);
});

Deno.test("a short summary leaves its unused share to the others", () => {
  const overview = buildOverview([doc(1, "Short."), doc(2, words(1000)), doc(3, words(1000))], 1000);

  assertEquals(body(overview.formatted_context, 1), "Short.");
  for (const n of [2, 3]) {
    const length = body(overview.formatted_context, n).length;
    assert(length > 480 && length <= 497, `${length}`);
  }
});

Deno.test("a summary is cut on a word boundary", () => {
  const overview = buildOverview([doc(1, "alpha beta gamma delta")], 13);
  assertEquals(body(overview.formatted_context, 1), "alpha beta");
});

Deno.test("past twelve documents the context says how many there are", () => {
  const docs = Array.from({ length: 20 }, (_, i) => doc(i + 1, "A summary."));
  const overview = buildOverview(docs, 4000);

  assertEquals(overview.total_chunks, 12);
  assert(overview.formatted_context.includes("12 of 20 documents"));
  assert(overview.formatted_context.includes("paper-12.pdf"));
  assert(!overview.formatted_context.includes("paper-13.pdf"));
});

// The model may mention a document without a summary, but it has no source
// number, so no chip can point at nothing.
Deno.test("documents without a summary are named once and never numbered", () => {
  const overview = buildOverview([doc(1, "Has one."), doc(2, null), doc(3, "  ")], 4000);

  assertEquals(overview.total_chunks, 1);
  assertEquals(overview.listedOnly, ["paper-2.pdf", "paper-3.pdf"]);
  assert(overview.formatted_context.includes(
    "Also in this project, no summary yet: paper-2.pdf, paper-3.pdf",
  ));
  assert(!overview.formatted_context.includes("[doc_id: 2]"));
});

Deno.test("with no summary at all there is no source", () => {
  const overview = buildOverview([doc(1, null)], 4000);
  assertEquals(overview.total_chunks, 0);
  assertEquals(overview.citations, []);
});

// The snippet is shown as plain text under the source name.
Deno.test("the snippet is the plain start of the summary", () => {
  const summary = `# Title\n\n**Bold** and \`code\`   here.\n${words(100)}`;
  const [citation] = buildOverview([doc(1, summary)], 4000).citations;

  assert(citation.text_snippet.startsWith("Title Bold and code here. word"));
  assertEquals(citation.text_snippet.length, OVERVIEW_SNIPPET_CHARS);
});
