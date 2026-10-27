import { describe, expect, it } from 'vitest';
import type { ChatCitation, ChatMessage } from '../../../shared/types/chat';
import { offTopicChips, routeLabel, sortCitations } from './chatRoute';

const timing = { processing_time_ms: 2500, llm_model: 'gpt-4o-mini' };

describe('the line under an answer', () => {
  // Old rows have no route and must read exactly as they did.
  it('shows time and model for a message saved before routes', () => {
    expect(routeLabel(timing, 3)).toBe('2.5s • gpt-4o-mini');
  });

  it.each(['specific', 'fallback'] as const)('shows time and model for %s', (route) => {
    expect(routeLabel({ ...timing, route }, 3)).toBe('2.5s • gpt-4o-mini');
  });

  it('names the number of documents for an overview', () => {
    expect(routeLabel({ ...timing, route: 'overview' }, 1)).toBe('Overview of 1 document');
    expect(routeLabel({ ...timing, route: 'overview' }, 3)).toBe('Overview of 3 documents');
  });

  it('says an off-topic reply is not about the documents', () => {
    expect(routeLabel({ ...timing, llm_model: 'none', route: 'off_topic' }, 0)).toBe(
      'Not about the documents'
    );
  });
});

const message = (id: string, role: ChatMessage['role'], metadata?: ChatMessage['metadata']) => ({
  id,
  conversation_id: 'c1',
  role,
  content: 'text',
  created_at: '2026-10-27T00:00:00.000Z',
  metadata,
});

const offTopic = (id: string, suggestions: unknown) =>
  message(id, 'assistant', {
    route: 'off_topic',
    suggestions: suggestions as string[],
  });

describe('chips under an off-topic reply', () => {
  it('shows up to three chips under the newest message', () => {
    expect(
      offTopicChips([message('u1', 'user'), offTopic('a1', ['A?', 'B?', 'C?', 'D?'])])
    ).toEqual({ messageId: 'a1', questions: ['A?', 'B?', 'C?'] });
  });

  // Once the chat has moved on, an old reply's chips are a stale choice.
  it('shows no chips once a newer message exists', () => {
    expect(
      offTopicChips([offTopic('a1', ['A?']), message('u2', 'user'), message('a2', 'assistant')])
    ).toBeNull();
  });

  it('shows no chips for an answer from the documents', () => {
    expect(offTopicChips([message('a1', 'assistant', { route: 'overview' })])).toBeNull();
  });

  // The suggestions are read back from a jsonb column.
  it('ignores suggestions that are not a list of text', () => {
    expect(offTopicChips([offTopic('a1', 'A?')])).toBeNull();
    expect(offTopicChips([offTopic('a1', [1, ' ', 'B?'])])).toEqual({
      messageId: 'a1',
      questions: ['B?'],
    });
  });
});

const citation = (id: string, score: number, chunkIndex: number): ChatCitation => ({
  id,
  message_id: 'a1',
  document_id: `doc-${id}`,
  file_name: `${id}.pdf`,
  chunk_index: chunkIndex,
  similarity_score: score,
  text_snippet: '',
  created_at: '',
});

describe('citation order after a reload', () => {
  // Overview citations all score 0. Chip N must still open source N.
  it('keeps equal scores in source order', () => {
    const shuffled = [citation('c', 0, 2), citation('a', 0, 0), citation('b', 0, 1)];
    expect(sortCitations(shuffled).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts the best score first', () => {
    const mixed = [citation('low', 0.4, 0), citation('high', 0.7, 3)];
    expect(sortCitations(mixed).map((c) => c.id)).toEqual(['high', 'low']);
  });
});
