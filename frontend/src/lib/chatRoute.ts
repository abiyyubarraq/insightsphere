import type { ChatCitation, ChatMessage, ChatMessageMetadata } from '../../../shared/types/chat';

/** The muted line under an answer. Messages saved before routes show time and model, as before. */
export const routeLabel = (metadata: ChatMessageMetadata, citationCount: number): string => {
  if (metadata.route === 'overview') {
    return `Overview of ${citationCount} ${citationCount === 1 ? 'document' : 'documents'}`;
  }
  if (metadata.route === 'off_topic') return 'Not about the documents';

  const parts: string[] = [];
  if (metadata.processing_time_ms) {
    parts.push(`${(metadata.processing_time_ms / 1000).toFixed(1)}s`);
  }
  if (metadata.llm_model) parts.push(metadata.llm_model);
  return parts.join(' • ');
};

export const MAX_OFF_TOPIC_CHIPS = 3;

/**
 * Chips for an off-topic reply, only when it is the newest message: an older
 * one has been answered past, and its chips would offer a stale choice.
 */
export const offTopicChips = (
  messages: ChatMessage[]
): { messageId: string; questions: string[] } | null => {
  const last = messages.at(-1);
  if (last?.role !== 'assistant' || last.metadata?.route !== 'off_topic') return null;

  // Read back from a jsonb column, so the shape is checked rather than trusted.
  const raw: unknown = last.metadata.suggestions;
  const questions = (Array.isArray(raw) ? raw : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_OFF_TOPIC_CHIPS);
  return questions.length > 0 ? { messageId: last.id, questions } : null;
};

/**
 * Best score first, then position. Overview citations all score 0, so without
 * the second key their order after a reload is not defined and chip N opens
 * the wrong source.
 */
export const sortCitations = (citations: ChatCitation[]): ChatCitation[] =>
  [...citations].sort(
    (a, b) => b.similarity_score - a.similarity_score || a.chunk_index - b.chunk_index
  );
