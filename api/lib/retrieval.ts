/**
 * Ranking helpers for the retrieval step.
 *
 * Kept free of the service singletons on purpose: ragService.ts imports four
 * clients that construct themselves at module load, so nothing that imports it
 * can be unit tested. Everything here is a pure function over search results.
 */

import type { SearchResult } from "./qdrantClient.ts";
import { SUFFICIENCY_FLOOR } from "./constants.ts";

/** Standard reciprocal rank fusion damping. Large enough that the gap between
 * rank 1 and rank 2 does not swamp agreement between the two queries. */
export const RRF_K = 60;

/**
 * How many candidates to pull per query relative to the k finally kept.
 * Fusing two lists of k gives RRF nothing to work with. Measured by Qdrant,
 * deeper candidates raise the reachable ceiling a lot and the fused result a
 * little, and it costs no extra query.
 */
export const CANDIDATE_DEPTH = 5;

/**
 * Merge several ranked lists by reciprocal rank fusion.
 *
 * A chunk that both the original and the rewritten query found, each at rank 2,
 * beats a chunk only one of them found at rank 1. That is the point: agreement
 * between two phrasings of the same question is evidence, a single high score
 * is not.
 *
 * The same point returned by both searches scores differently against each
 * query vector, so the higher of the two is kept. The RRF score decides order
 * only and never reaches the caller — the UI prints the cosine score as a
 * relevance percentage, where an RRF score of 0.03 would be nonsense.
 */
export function fuseByRRF(lists: SearchResult[][], k = RRF_K): SearchResult[] {
  const fused = new Map<string, { result: SearchResult; rrf: number }>();

  for (const list of lists) {
    list.forEach((result, rank) => {
      const contribution = 1 / (k + rank + 1);
      const seen = fused.get(result.id);

      if (!seen) {
        fused.set(result.id, { result, rrf: contribution });
        return;
      }

      seen.rrf += contribution;
      if (result.score > seen.result.score) seen.result = result;
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.rrf - a.rrf || b.result.score - a.result.score)
    .map((entry) => entry.result);
}

/**
 * Collapse chunks that are the same passage stored more than once.
 *
 * Fusion already dedupes by point id. This catches the older problem: before
 * chunk ids were deterministic, reprocessing a document appended a second copy
 * of every chunk under a fresh random id. Same document, same page, same chunk
 * index, same text, different id — so one measured query came back as five
 * copies of one paragraph filling all five context slots.
 *
 * The first occurrence keeps its position, since it has the best fused rank.
 */
export function dropDuplicateChunks(results: SearchResult[]): SearchResult[] {
  const positionOf = new Map<string, number>();
  const kept: SearchResult[] = [];

  for (const result of results) {
    const key = [
      result.metadata.documentId,
      result.metadata.pageNumber ?? "",
      result.metadata.chunkIndex,
    ].join("|");

    const at = positionOf.get(key);
    if (at === undefined) {
      positionOf.set(key, kept.length);
      kept.push(result);
    } else if (result.score > kept[at].score) {
      kept[at] = result;
    }
  }

  return kept;
}

/**
 * Order the chosen chunks by similarity for presentation.
 *
 * Fusion picks which chunks survive; this picks the order they are shown in.
 * The two are separate because the model writes [doc_id: N] against the order
 * buildContext used, the frontend maps N back to the Nth citation by position,
 * and both the chat route and the history reload sort citations by score. Hand
 * the context builder a list in fused-rank order and those citation numbers
 * start pointing at the wrong source.
 */
export function sortByScore(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}

/** Highest cosine score in the list, or 0 when there is nothing. */
export function topScore(results: SearchResult[]): number {
  return results.reduce((best, result) => Math.max(best, result.score), 0);
}

/**
 * Whether the best chunk is too weak to answer from confidently. The answer is
 * still produced; the caller flags it so the UI can say so.
 */
export function isWeakMatch(results: SearchResult[]): boolean {
  return topScore(results) < SUFFICIENCY_FLOOR;
}
