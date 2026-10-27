/**
 * The retrieval options a client may set. Pure.
 *
 * The query route used to spread the request body into the RAG options, so a
 * caller could set the similarity threshold, the context length, or
 * `conversation_history`, which is text that goes straight into the prompt.
 * Only the keys below are read now; everything else comes from the server.
 */

import { SEARCH_DEFAULTS } from "./constants.ts";

export const CHAT_HISTORY_DEFAULT = 6;
export const CHAT_HISTORY_MAX = 10;

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

/** A whole number of at least `min`, capped at `max`, or null. */
function boundedInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    return null;
  }
  return Math.min(value, max);
}

const maxChunksFrom = (value: unknown) =>
  boundedInteger(value, 1, SEARCH_DEFAULTS.maxChunks);

/** Options for POST /query. An absent key means the server default. */
export function pickQueryOptions(raw: unknown): { max_chunks?: number } {
  const maxChunks = maxChunksFrom(asRecord(raw).max_chunks);
  return maxChunks === null ? {} : { max_chunks: maxChunks };
}

export interface ChatOptions {
  max_chunks: number;
  use_conversation_history: boolean;
  max_history_messages: number;
}

/** Options for POST /chat, with the server defaults filled in. */
export function pickChatOptions(raw: unknown): ChatOptions {
  const options = asRecord(raw);
  return {
    max_chunks: maxChunksFrom(options.max_chunks) ?? SEARCH_DEFAULTS.maxChunks,
    use_conversation_history: typeof options.use_conversation_history === "boolean"
      ? options.use_conversation_history
      : true,
    max_history_messages:
      boundedInteger(options.max_history_messages, 1, CHAT_HISTORY_MAX) ??
        CHAT_HISTORY_DEFAULT,
  };
}
