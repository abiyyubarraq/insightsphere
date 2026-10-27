/**
 * Context for a question about the documents as a whole, built from their
 * stored summaries instead of from searched chunks. Pure.
 */

import type { Citation } from "./citationService.ts";
import { SUGGESTION_MAX_DOCS } from "./suggestions.ts";

export interface OverviewDoc {
  id: string;
  file_name: string;
  summary: string | null;
  updated_at: string | null;
}

export interface OverviewContext {
  formatted_context: string;
  citations: Citation[];
  /** Numbered sources: the documents that have a summary. */
  total_chunks: number;
  /** Names of documents without a summary. Named in the context, never numbered. */
  listedOnly: string[];
}

export const OVERVIEW_SNIPPET_CHARS = 200;

/**
 * Equal shares of maxLength, given to the shortest summaries first, so a short
 * summary leaves what it does not use to the others.
 */
function shares(lengths: number[], maxLength: number): number[] {
  const order = lengths.map((_, index) => index).sort((a, b) =>
    lengths[a] - lengths[b]
  );
  const result = new Array<number>(lengths.length).fill(0);
  let remaining = maxLength;
  order.forEach((index, position) => {
    const share = Math.floor(remaining / (order.length - position));
    result[index] = Math.min(lengths[index], share);
    remaining -= result[index];
  });
  return result;
}

/** Cut at the last whitespace inside the limit, when there is one. */
function cutAt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.search(/\s\S*$/);
  return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

export function snippetOf(summary: string): string {
  return summary
    .replace(/[#*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OVERVIEW_SNIPPET_CHARS);
}

/**
 * `docs` is every ready document, newest first. The summary text (headers not
 * counted) stays within maxLength. Source N is the Nth document with a summary,
 * in the order given, so chip N opens source N.
 */
export function buildOverview(
  docs: OverviewDoc[],
  maxLength: number,
): OverviewContext {
  const newest = docs.slice(0, SUGGESTION_MAX_DOCS);
  const summarised = newest
    .map((doc) => ({ doc, summary: doc.summary?.trim() ?? "" }))
    .filter((entry) => entry.summary.length > 0);
  const listedOnly = newest
    .filter((doc) => !doc.summary?.trim())
    .map((doc) => doc.file_name);

  if (summarised.length === 0) {
    return { formatted_context: "", citations: [], total_chunks: 0, listedOnly };
  }

  const budget = shares(summarised.map((entry) => entry.summary.length), maxLength);
  const parts = summarised.map(({ doc, summary }, index) =>
    `[doc_id: ${index + 1}] Source: ${doc.file_name}\n${cutAt(summary, budget[index])}`
  );

  if (docs.length > newest.length) {
    parts.unshift(
      `These are the newest ${newest.length} of ${docs.length} documents in this project.`,
    );
  }
  if (listedOnly.length > 0) {
    parts.push(`Also in this project, no summary yet: ${listedOnly.join(", ")}`);
  }

  return {
    formatted_context: parts.join("\n\n---\n\n"),
    citations: summarised.map(({ doc, summary }, index) => ({
      document_id: doc.id,
      file_name: doc.file_name,
      chunk_index: index,
      similarity_score: 0,
      text_snippet: snippetOf(summary),
      created_at: doc.updated_at ?? "",
    })),
    total_chunks: summarised.length,
    listedOnly,
  };
}
