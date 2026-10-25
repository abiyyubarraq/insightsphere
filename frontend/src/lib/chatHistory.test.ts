import { describe, expect, it } from 'vitest';
import { fetchNewestMessages, type ConversationMessagesQuery } from './chatHistory';

interface Row {
  id: string;
  created_at: string;
}

interface Recorded {
  order?: [string, { ascending: boolean }];
  limit?: number;
}

/** Fake Supabase query: records the call and answers like Postgres would. */
const fakeQuery = (rows: Row[], error: { message: string } | null = null) => {
  const recorded: Recorded = {};
  const query: ConversationMessagesQuery<Row> = {
    order: (column, options) => {
      recorded.order = [column, options];
      return {
        limit: async (count) => {
          recorded.limit = count;
          if (error) return { data: null, error };
          const sorted = [...rows].sort((a, b) =>
            options.ascending
              ? a.created_at.localeCompare(b.created_at)
              : b.created_at.localeCompare(a.created_at)
          );
          return { data: sorted.slice(0, count), error: null };
        },
      };
    },
  };
  return { query, recorded };
};

const conversation = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { id: `msg-${n}`, created_at: `2026-01-01T00:00:${n}Z` };
  });

describe('loading the newest chat messages', () => {
  // Ordering ascending before the limit kept the oldest 50 messages, so in a
  // long chat the latest questions and answers vanished on reload.
  it('keeps the newest 50 of 60 messages', async () => {
    const { query } = fakeQuery(conversation(60));

    const messages = await fetchNewestMessages(query, 50);

    expect(messages).toHaveLength(50);
    expect(messages[0].id).toBe('msg-11');
    expect(messages[49].id).toBe('msg-60');
  });

  // The chat renders the list top to bottom, so it must come back oldest first
  // even though the query reads newest first.
  it('returns the messages in time order', async () => {
    const { query } = fakeQuery(conversation(5));

    const messages = await fetchNewestMessages(query, 50);

    expect(messages.map((m) => m.id)).toEqual(['msg-01', 'msg-02', 'msg-03', 'msg-04', 'msg-05']);
  });

  it('asks Supabase for created_at descending with the limit', async () => {
    const { query, recorded } = fakeQuery(conversation(3));

    await fetchNewestMessages(query, 50);

    expect(recorded).toEqual({ order: ['created_at', { ascending: false }], limit: 50 });
  });

  it('returns an empty list for an empty conversation', async () => {
    const { query } = fakeQuery([]);

    expect(await fetchNewestMessages(query, 50)).toEqual([]);
  });

  // A failed read must not look like an empty chat.
  it('throws when the query fails', async () => {
    const { query } = fakeQuery([], { message: 'permission denied' });

    await expect(fetchNewestMessages(query, 50)).rejects.toThrow(
      'Failed to get messages: permission denied'
    );
  });
});
