/**
 * Values the API and the frontend both have to agree on.
 *
 * This file used to be imported by nothing, and most of it described a program
 * that did not exist: endpoints that were never registered, a subscription
 * tier system, and a retrieval threshold of 0.7 against a real one of 0.3.
 * What is left is only what both sides actually need.
 */

export const FILE_CONSTRAINTS = {
	/** Enforced in the browser and again in the API, which is the one that counts. */
	MAX_FILE_BYTES: 100 * 1024 * 1024,
	ALLOWED_EXTENSIONS: ["pdf", "docx", "txt", "md"],
	/** Beyond this, OCR runs longer than anyone will wait for. */
	MAX_PAGES: 1000,
} as const;

export const RETRIEVAL_DEFAULTS = {
	/** Chunks pulled from Qdrant per query. */
	maxChunks: 5,
	/**
	 * Cosine score floor, measured on the real corpus rather than guessed.
	 *
	 * Raising it to 0.35 looks tempting because a question belonging to another
	 * project scores 0.36, but the same move breaks questions the documents do
	 * answer:
	 *
	 *   "What is psychological inoculation?"   0.340 top ->  9 hits at 0.30, 0 at 0.35
	 *   "echo chambers"                        0.345 top ->  3 hits at 0.30, 0 at 0.35
	 *   Indonesian phrasing of a question that
	 *   scores 0.684 in English                0.399 top -> 15 hits at 0.30, 4 at 0.35
	 *
	 * The answerable and the unanswerable bands overlap at 0.34 to 0.36, so no
	 * single score separates them. Treat this as the "nothing at all" guard and
	 * let sufficiencyFloor handle weak retrieval, which is what it is for.
	 *
	 * text-embedding-3-small scores in a much lower band than ada-002 did.
	 * Thresholds quoted for ada-002, usually 0.7, are meaningless here.
	 */
	threshold: 0.3,
	/** Characters of context handed to the LLM. */
	maxContextLength: 4000,
	/**
	 * Below this top score the answer is still given, but flagged as a weak
	 * match. A question this corpus covers well scores 0.66 to 0.68.
	 */
	sufficiencyFloor: 0.45,
} as const;

export const EMBEDDING = {
	/** Must match what documents were indexed with, or search returns nothing. */
	model: "text-embedding-3-small",
	dimensions: 1536,
} as const;
