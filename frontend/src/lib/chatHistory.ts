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
 * Newest `limit` messages, oldest first.
 * The limit has to apply to a newest-first query; ascending plus limit keeps the oldest ones.
 */
export const fetchNewestMessages = async <T>(
  query: ConversationMessagesQuery<T>,
  limit: number
): Promise<T[]> => {
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

  if (error) throw new Error(`Failed to get messages: ${error.message}`);
  return (data ?? []).reverse();
};
