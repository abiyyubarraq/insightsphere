import type { ChatMessage, GetConversationHistoryResponse } from '../../../shared/types/chat';

export interface ChatState {
  messages: ChatMessage[];
  conversationId: string | undefined;
  hasMore: boolean;
}

export const emptyChatState = (): ChatState => ({
  messages: [],
  conversationId: undefined,
  hasMore: false,
});

/**
 * True when the chat on screen belongs to another project than the selected
 * one. `chatProjectId` is set at the start of every switch, not when the
 * history load succeeds, so a failed load cannot leave the old project's
 * conversation id behind and a re-check after it does not load again.
 */
export const needsChatReset = (
  chatProjectId: string | undefined,
  selectedProjectId: string | undefined
): boolean => selectedProjectId !== undefined && selectedProjectId !== chatProjectId;

export type HistoryLoad =
  | { status: 'loaded'; chat: ChatState }
  | { status: 'failed' }
  | { status: 'stale' };

/**
 * "stale" means the project changed (or New chat ran) while the request was
 * out, so the caller must not touch the chat on screen, not even to show an error.
 */
export const loadHistory = async (
  fetchHistory: () => Promise<GetConversationHistoryResponse>,
  isCurrent: () => boolean
): Promise<HistoryLoad> => {
  try {
    const response = await fetchHistory();
    if (!isCurrent()) return { status: 'stale' };
    return {
      status: 'loaded',
      chat: {
        messages: response.messages || [],
        conversationId: response.conversation?.id,
        hasMore: response.has_more,
      },
    };
  } catch (error) {
    if (!isCurrent()) return { status: 'stale' };
    // The raw text can be a Supabase message, so it stays out of the page.
    console.error('Failed to load conversation history:', error);
    return { status: 'failed' };
  }
};

export const canRetryHistory = (historyFailed: boolean, busy: boolean): boolean =>
  historyFailed && !busy;
