import { describe, expect, it } from 'vitest';
import {
  applyOlderPage,
  fetchNewestMessages,
  fetchOlderMessages,
  prependPage,
  type ConversationMessagesQuery,
  type OlderMessagesQuery,
} from './chatHistory';

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

    const { messages } = await fetchNewestMessages(query, 50);

    expect(messages).toHaveLength(50);
    expect(messages[0].id).toBe('msg-11');
    expect(messages[49].id).toBe('msg-60');
  });

  // The chat renders the list top to bottom, so it must come back oldest first
  // even though the query reads newest first.
  it('returns the messages in time order', async () => {
    const { query } = fakeQuery(conversation(5));

    const { messages } = await fetchNewestMessages(query, 50);

    expect(messages.map((m) => m.id)).toEqual(['msg-01', 'msg-02', 'msg-03', 'msg-04', 'msg-05']);
  });

  it('asks Supabase for created_at descending with the limit', async () => {
    const { query, recorded } = fakeQuery(conversation(3));

    await fetchNewestMessages(query, 50);

    expect(recorded).toEqual({ order: ['created_at', { ascending: false }], limit: 51 });
  });

  it('returns an empty list for an empty conversation', async () => {
    const { query } = fakeQuery([]);

    expect(await fetchNewestMessages(query, 50)).toEqual({ messages: [], hasMore: false });
  });

  // has_more was length >= limit, so a chat with exactly 50 messages offered
  // older history that did not exist.
  it.each([
    [49, false],
    [50, false],
    [51, true],
  ])('reports hasMore for %i messages', async (count, expected) => {
    const { query } = fakeQuery(conversation(count));

    const { messages, hasMore } = await fetchNewestMessages(query, 50);

    expect(hasMore).toBe(expected);
    expect(messages).toHaveLength(Math.min(count, 50));
  });

  // A failed read must not look like an empty chat.
  it('throws when the query fails', async () => {
    const { query } = fakeQuery([], { message: 'permission denied' });

    await expect(fetchNewestMessages(query, 50)).rejects.toThrow(
      'Failed to get messages: permission denied'
    );
  });
});

/** Fake query that also supports the `lt` cursor filter. */
const fakeOlderQuery = (rows: Row[]) => {
  const recorded: Recorded & { lt?: [string, string] } = {};
  const query: OlderMessagesQuery<Row> = {
    lt: (column, value) => {
      recorded.lt = [column, value];
      const inner = fakeQuery(rows.filter((r) => r.created_at < value));
      return {
        order: (orderColumn, options) => {
          recorded.order = [orderColumn, options];
          return {
            limit: (count) => {
              recorded.limit = count;
              return inner.query.order(orderColumn, options).limit(count);
            },
          };
        },
      };
    },
  };
  return { query, recorded };
};

const created = (row: Row) => row.created_at;

describe('loading older chat messages', () => {
  // 120 rows with distinct times, like the seeded conversation.
  const rows = Array.from({ length: 120 }, (_, i) => ({
    id: `m-${String(i).padStart(3, '0')}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));

  // An ascending query with a limit, or a missing cursor, would return the
  // oldest rows again instead of the ones just above what is on screen.
  it('asks for limit + 1 rows older than the cursor, newest first', async () => {
    const { query, recorded } = fakeOlderQuery(rows);

    await fetchOlderMessages(query, rows[70].created_at, 50);

    expect(recorded).toEqual({
      lt: ['created_at', rows[70].created_at],
      order: ['created_at', { ascending: false }],
      limit: 51,
    });
  });

  it('returns the 50 messages just before the cursor, oldest first', async () => {
    const { query } = fakeOlderQuery(rows);

    const { messages, hasMore } = await fetchOlderMessages(query, rows[70].created_at, 50);

    expect(messages.map(created)).toEqual(rows.slice(20, 70).map(created));
    expect(hasMore).toBe(true);
  });

  // The last page must hide the button, or it stays and loads nothing.
  it('reports no more history on the last, short page', async () => {
    const { query } = fakeOlderQuery(rows);

    const { messages, hasMore } = await fetchOlderMessages(query, rows[20].created_at, 50);

    expect(messages).toHaveLength(20);
    expect(hasMore).toBe(false);
  });

  it('returns an empty page when nothing is older', async () => {
    const { query } = fakeOlderQuery(rows);

    expect(await fetchOlderMessages(query, rows[0].created_at, 50)).toEqual({
      messages: [],
      hasMore: false,
    });
  });
});

describe('adding an older page to the chat', () => {
  const loaded = [
    { id: 'c', created_at: '3' },
    { id: 'd', created_at: '4' },
  ];

  it('puts the older page above the loaded messages', () => {
    const page = [
      { id: 'a', created_at: '1' },
      { id: 'b', created_at: '2' },
    ];
    expect(prependPage(loaded, page).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  // Svelte's keyed each throws on a duplicate key, so an overlap between two
  // pages would break the whole chat.
  it('skips a message that is already on screen', () => {
    const page = [
      { id: 'b', created_at: '2' },
      { id: 'c', created_at: '3' },
    ];
    expect(prependPage(loaded, page).map((m) => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('keeps the list as it was for an empty page', () => {
    expect(prependPage(loaded, [])).toEqual(loaded);
  });

  it('applies the page and its hasMore when the request is still current', () => {
    const state = { messages: loaded, hasMore: true };
    const page = { messages: [{ id: 'a', created_at: '1' }], hasMore: false };
    const at = { conversationId: 'c1', projectId: 'p1', generation: 1 };

    const next = applyOlderPage(state, page, at, { ...at });

    expect(next.messages.map((m) => m.id)).toEqual(['a', 'c', 'd']);
    expect(next.hasMore).toBe(false);
  });

  // A page that returned after the user switched project or pressed New chat
  // was prepended into the other conversation.
  it('leaves the list and hasMore unchanged for a stale page', () => {
    const state = { messages: loaded, hasMore: true };
    const page = { messages: [{ id: 'a', created_at: '1' }], hasMore: false };
    const requested = { conversationId: 'c1', projectId: 'p1', generation: 1 };

    const next = applyOlderPage(state, page, requested, { ...requested, generation: 2 });

    expect(next).toBe(state);
  });
});
