/**
 * Retrieval defaults.
 *
 * These were previously spread across the routes with values from 0.25 to 0.7,
 * so the same question answered differently depending on which endpoint it
 * entered through.
 */
export const SEARCH_DEFAULTS = {
  /** Chunks pulled from Qdrant per query. */
  maxChunks: 5,
  /**
   * Cosine score floor. Low because OCR'd text embeds noisily; raising it
   * starts dropping relevant passages before it drops irrelevant ones.
   */
  threshold: 0.3,
  /** Characters of context handed to the LLM. */
  maxContextLength: 4000,
} as const;

/** Must match what documents were indexed with, or search returns nothing. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;
