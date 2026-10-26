import { describe, expect, it } from 'vitest';
import { emptyChatState, needsChatReset } from './chatState';

describe('chat state on a project switch', () => {
  // A failed history load kept the old project's conversation id, and every
  // send in the new project got a 404.
  it('empties messages, conversation id and paging', () => {
    expect(emptyChatState()).toEqual({ messages: [], conversationId: undefined, hasMore: false });
  });

  it('returns a new list each time, so a reset never shares one', () => {
    expect(emptyChatState().messages).not.toBe(emptyChatState().messages);
  });

  // A -> B (load fails) -> send in B -> back to A: A showed B's messages and
  // posted B's conversation id, because the guard only moved on a successful load.
  it('resets on every switch, also back to a project loaded before', () => {
    let chatProjectId: string | undefined = 'a';

    expect(needsChatReset(chatProjectId, 'b')).toBe(true);
    chatProjectId = 'b';
    // The history load for B failed: checking again must not reset or reload.
    expect(needsChatReset(chatProjectId, 'b')).toBe(false);

    expect(needsChatReset(chatProjectId, 'a')).toBe(true);
    chatProjectId = 'a';
    expect(needsChatReset(chatProjectId, 'a')).toBe(false);
  });

  it('needs a reset for the first project after the page opens', () => {
    expect(needsChatReset(undefined, 'a')).toBe(true);
  });

  // With no project the component clears the chat on its own path.
  it('needs no reset when no project is selected', () => {
    expect(needsChatReset('a', undefined)).toBe(false);
    expect(needsChatReset(undefined, undefined)).toBe(false);
  });
});
