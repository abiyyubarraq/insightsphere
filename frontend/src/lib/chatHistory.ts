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
