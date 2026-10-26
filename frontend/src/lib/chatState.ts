import type { ChatMessage } from '../../../shared/types/chat';

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
