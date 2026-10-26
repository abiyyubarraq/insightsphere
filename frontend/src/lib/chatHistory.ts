import { isStillCurrent } from './staleResponse';

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * A Supabase query on chat_messages that is already filtered to one conversation.
 * Kept this narrow so a test can pass a plain object.
 */
export interface ConversationMessagesQuery<T> {
  order(
    column: 'created_at',
    options: { ascending: boolean }
  ): {
    limit(count: number): PromiseLike<QueryResult<T>>;
  };
}

/**
 * Newest `limit` messages, oldest first, and whether older ones exist.
 * The limit has to apply to a newest-first query; ascending plus limit keeps the oldest ones.
 * It asks for one extra row: if that row comes back, there is more history.
 */
export const fetchNewestMessages = async <T>(
  query: ConversationMessagesQuery<T>,
  limit: number
): Promise<{ messages: T[]; hasMore: boolean }> => {
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit + 1);

  if (error) throw new Error(`Failed to get messages: ${error.message}`);
  const rows = data ?? [];
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
};

/** The same query, before the conversation filter is narrowed to older rows. */
export interface OlderMessagesQuery<T> {
  lt(column: 'created_at', value: string): ConversationMessagesQuery<T>;
}

/**
 * The `limit` messages just before `before` (the created_at of the oldest one
 * loaded), oldest first, and whether even older ones exist.
 * User and assistant messages are saved by separate inserts, so their
 * created_at differ and a strict `<` does not skip a message.
 */
export const fetchOlderMessages = <T>(
  query: OlderMessagesQuery<T>,
  before: string,
  limit: number
): Promise<{ messages: T[]; hasMore: boolean }> =>
  fetchNewestMessages(query.lt('created_at', before), limit);

/** Puts an older page above the loaded messages, skipping any id already shown. */
export const prependPage = <T extends { id: string }>(loaded: T[], page: T[]): T[] => {
  const shown = new Set(loaded.map((m) => m.id));
  return [...page.filter((m) => !shown.has(m.id)), ...loaded];
};

export interface LoadedHistory<T> {
  messages: T[];
  hasMore: boolean;
}

/**
 * Adds an older page to what is on screen, or returns `loaded` itself when the
 * request is stale (another project, conversation or New chat since it was sent).
 */
export const applyOlderPage = <T extends { id: string }, S extends object>(
  loaded: LoadedHistory<T>,
  page: LoadedHistory<T>,
  requestedFor: S,
  currentFor: S
): LoadedHistory<T> =>
  isStillCurrent(requestedFor, currentFor)
    ? { messages: prependPage(loaded.messages, page.messages), hasMore: page.hasMore }
    : loaded;
