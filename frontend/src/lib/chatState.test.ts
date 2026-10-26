import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, GetConversationHistoryResponse } from '../../../shared/types/chat';
import { isComposerBusy, canSend } from './chatComposer';
import { canRetryHistory, emptyChatState, loadHistory, needsChatReset } from './chatState';

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

const message = (id: string, role: ChatMessage['role'] = 'user'): ChatMessage => ({
  id,
  conversation_id: 'conv-1',
  role,
  content: id,
  created_at: '2026-10-26T10:00:00Z',
});

const history = (messages: ChatMessage[]): GetConversationHistoryResponse => ({
  success: true,
  conversation: {
    id: 'conv-1',
    project_id: 'a',
    user_id: 'u',
    title: 't',
    created_at: '2026-10-26T10:00:00Z',
    updated_at: '2026-10-26T10:00:00Z',
  },
  messages,
  has_more: false,
});

const fails = () => Promise.reject(new Error('Failed to get conversation: fetch failed'));
const current = () => true;

describe('loading the chat history and retrying it', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A failed load showed an empty chat with no way to try again except
  // switching project.
  it('reports a failure, and a retry that works shows the messages', async () => {
    const first = await loadHistory(fails, current);
    expect(first).toEqual({ status: 'failed' });

    const retry = await loadHistory(() => Promise.resolve(history([message('m1')])), current);
    expect(retry).toEqual({
      status: 'loaded',
      chat: { messages: [message('m1')], conversationId: 'conv-1', hasMore: false },
    });
  });

  it('keeps the failure when the retry fails too', async () => {
    expect(await loadHistory(fails, current)).toEqual({ status: 'failed' });
    expect(await loadHistory(fails, current)).toEqual({ status: 'failed' });
  });

  // The raw Supabase text was shown in the banner. It must stay in the console.
  it('does not hand the raw error text to the page', async () => {
    const result = await loadHistory(fails, current);
    expect(JSON.stringify(result)).not.toContain('fetch failed');
  });

  // A slow failed load from project A showed its error in project B.
  it('drops a failure or a success that arrives after a project switch', async () => {
    expect(await loadHistory(fails, () => false)).toEqual({ status: 'stale' });
    expect(
      await loadHistory(() => Promise.resolve(history([message('m1')])), () => false)
    ).toEqual({ status: 'stale' });
  });

  it('offers retry only after a failure', () => {
    expect(canRetryHistory(true, false)).toBe(true);
    expect(canRetryHistory(false, false)).toBe(false);
  });

  // A history reply during a send would drop its temporary messages.
  it('ignores retry while an answer is pending or a load runs', () => {
    expect(canRetryHistory(true, isComposerBusy(true, false))).toBe(false);
    expect(canRetryHistory(true, isComposerBusy(false, true))).toBe(false);
  });

  // Send during a retry: the history reply replaced the list, then the send
  // reply was appended again, so the answer showed twice.
  it('blocks a send during the retry, then the send is added once', async () => {
    let chat = emptyChatState();
    let loadingHistory = true;
    expect(canSend('new question', isComposerBusy(false, loadingHistory))).toBe(false);

    const server = [message('m1'), message('m2', 'assistant')];
    const result = await loadHistory(() => Promise.resolve(history(server)), current);
    loadingHistory = false;
    if (result.status === 'loaded') chat = result.chat;
    expect(chat.messages).toEqual(server);

    expect(canSend('new question', isComposerBusy(false, loadingHistory))).toBe(true);
    chat = { ...chat, messages: [...chat.messages, message('m3'), message('m4', 'assistant')] };
    expect(chat.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  // A send in the failed state is saved on the server. The retry must show the
  // server list as it is, with the sent messages once.
  it('replaces the list with the server list after a send in the failed state', async () => {
    const onScreen = [message('m3'), message('m4', 'assistant')];
    const server = [message('m1'), message('m2', 'assistant'), ...onScreen];
    const result = await loadHistory(() => Promise.resolve(history(server)), current);
    expect(result.status === 'loaded' && result.chat.messages).toEqual(server);
  });
});
