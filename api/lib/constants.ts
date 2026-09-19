/**
 * Retrieval defaults.
 *
 * These were previously spread across the routes with values from 0.25 to 0.7,
 * so the same question answered differently depending on which endpoint it
 * entered through. They now live in shared/constants so the frontend cannot
 * quietly override them either — it used to send its own 20 chunks at 0.25 on
 * every chat message, which meant these values were never once used by the
 * path that matters.
 */

import {
  EMBEDDING,
  FILE_CONSTRAINTS,
  RETRIEVAL_DEFAULTS,
} from "../../shared/constants/index.ts";

export const SEARCH_DEFAULTS = {
  maxChunks: RETRIEVAL_DEFAULTS.maxChunks,
  threshold: RETRIEVAL_DEFAULTS.threshold,
  maxContextLength: RETRIEVAL_DEFAULTS.maxContextLength,
} as const;

/**
 * Top cosine score below which the answer is flagged as a weak match. The
 * answer is still given: refusing on a 0.40 hit loses more than it saves, but
 * presenting it with the same confidence as a 0.68 hit is how a plausible
 * wrong answer gets believed.
 */
export const SUFFICIENCY_FLOOR = RETRIEVAL_DEFAULTS.sufficiencyFloor;

/** Must match what documents were indexed with, or search returns nothing. */
export const EMBEDDING_MODEL = EMBEDDING.model;
export const EMBEDDING_DIMENSION = EMBEDDING.dimensions;

/** Matches the frontend's upload guard, which a caller can simply skip. */
export const MAX_FILE_BYTES = FILE_CONSTRAINTS.MAX_FILE_BYTES;

/** Beyond this, OCR runs longer than anyone will wait for. */
export const MAX_PAGES = FILE_CONSTRAINTS.MAX_PAGES;
