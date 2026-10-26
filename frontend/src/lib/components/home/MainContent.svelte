<script lang="ts">
  import {
    PanelLeft,
    PanelRight,
    X,
    ArrowUp,
    Square,
    SquarePen,
    TriangleAlert,
  } from 'lucide-svelte';
  import { onDestroy, tick, untrack } from 'svelte';
  import { selectedProject, projects } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    sendChatMessage,
    getConversationHistory,
    getOlderMessages,
    deleteConversationHistory,
    getQuerySuggestions,
    isLimitError,
  } from '../../../services/supabase';
  import type { ChatMessage } from '../../../../../shared/types/chat';
  import { ConfirmationDialog, NoticeBanner } from '../common';
  import ChatMarkdown from './ChatMarkdown.svelte';
  import { canSend, shouldSubmitOnKey } from '$lib/chatComposer';
  import { applyOlderPage } from '$lib/chatHistory';
  import { emptyChatState, needsChatReset } from '$lib/chatState';
  import { isStillCurrent } from '$lib/staleResponse';
  import { readSuggestions, suggestionsKey, type SuggestionsView } from '$lib/suggestions';

  let {
    leftSidebarOpen = $bindable(),
    rightSidebarOpen = $bindable(),
    errorNotif = $bindable(),
    errorTone = 'error',
    successNotif = $bindable(),
    uploadLoading = $bindable(),
    fileFilter = $bindable(),
    filesKey = null,
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onCreateNewProject,
    onUploadClick,
    onClearErrorNotif,
    onClearSuccessNotif,
  } = $props<{
    leftSidebarOpen?: boolean;
    rightSidebarOpen?: boolean;
    errorNotif?: string;
    errorTone?: 'error' | 'warning';
    successNotif?: string;
    uploadLoading?: boolean;
    fileFilter?: string;
    /** Ready files of the selected project, or null while they load. */
    filesKey?: string | null;
    onToggleLeftSidebar: () => void;
    onToggleRightSidebar: () => void;
    onCreateNewProject: () => void;
    onUploadClick: () => void;
    onClearErrorNotif: () => void;
    onClearSuccessNotif: () => void;
  }>();

  // Chat state
  let chatMessages: ChatMessage[] = $state([]);
  let userInput = $state('');
  let conversationId: string | undefined = $state(undefined);
  let chatLoading = $state(false);
  let chatError = $state('');
  let chatErrorTone: 'error' | 'warning' = $state('error');
  let messagesContainer: HTMLDivElement | undefined = $state();
  let loadingHistory = $state(false);
  let loadedProjectId: string | undefined = $state(undefined);
  // The project the messages, conversationId and hasMore on screen belong to.
  // Set on every switch; loadedProjectId is set only when the history load works.
  let chatProjectId: string | undefined = $state(undefined);
  let visibleCitations: Record<string, number> = $state({});
  let showClearConfirmDialog = $state(false);
  let clearLoading = $state(false);
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let hasMessages = $derived(chatMessages.length > 0);
  let hasMore = $state(false);
  let loadingOlder = $state(false);

  // Not reactive: only the send, stop and cleanup code read it.
  let pending: { controller: AbortController; assistantId: string } | null = null;

  // Bumped on a project change and on New chat, so an older page that was
  // requested before either one is dropped when it arrives.
  let loadGeneration = 0;
  const currentLoad = () => ({
    conversationId,
    projectId: loadedProjectId,
    generation: loadGeneration,
  });

  // The newest message the chat last scrolled to. Not reactive: only the scroll
  // effect and resetPaging use it.
  let scrolledToId: string | undefined;

  const resetPaging = () => {
    // Coming back to the same chat later must scroll to its bottom again.
    scrolledToId = undefined;
    loadGeneration += 1;
    hasMore = false;
    loadingOlder = false;
  };

  let suggestionsFor = $derived(
    suggestionsKey({
      projectId: $selectedProject?.id,
      loadedProjectId,
      loadingHistory,
      hasMessages,
      filesKey,
    })
  );
  let suggestionsView: SuggestionsView = $state({ status: 'hidden' });
  // Not reactive: the key the current suggestionsView belongs to.
  let suggestionsShownFor: string | null = null;

  // Fetched only when the key changes, so going back to an empty chat with the
  // same documents shows the same chips without another request.
  $effect(() => {
    const key = suggestionsFor;
    if (key === null || key === suggestionsShownFor) return;
    const projectId = untrack(() => loadedProjectId);
    if (!projectId) return;

    suggestionsShownFor = key;
    suggestionsView = { status: 'loading' };
    const controller = new AbortController();
    let settled = false;
    getQuerySuggestions(projectId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) suggestionsView = readSuggestions(response);
      })
      .catch(() => {
        // No banner: the empty chat works the same without suggestions.
        if (!controller.signal.aborted) suggestionsView = { status: 'hidden' };
      })
      .finally(() => {
        settled = true;
      });

    // Runs when the key changes (another project, a message sent) and on
    // unmount. An unfinished request is dropped and asked again next time.
    return () => {
      controller.abort();
      if (!settled) suggestionsShownFor = null;
    };
  });

  const MAX_INPUT_HEIGHT_PX = 200;

  $effect(() => {
    void userInput;
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    const contentHeight = textareaEl.scrollHeight;
    textareaEl.style.height = `${Math.min(contentHeight, MAX_INPUT_HEIGHT_PX)}px`;
    textareaEl.style.overflowY = contentHeight > MAX_INPUT_HEIGHT_PX ? 'auto' : 'hidden';
  });

  /**
   * Stop only cancels the browser request. The API still finishes, saves the
   * answer to history and counts it against the quota.
   */
  const cancelPendingAnswer = () => {
    const assistantId = pending?.assistantId;
    pending?.controller.abort();
    pending = null;
    chatLoading = false;
    // untrack: the project effect calls this and must not depend on chatMessages.
    chatMessages = untrack(() => chatMessages).filter((m) => m.id !== assistantId);
  };

  onDestroy(() => pending?.controller.abort());

  // Scroll to the bottom only when the newest message changes. Loading older
  // messages adds rows at the top and must leave the reader where they are.
  $effect(() => {
    const newestId = chatMessages.at(-1)?.id;
    if (messagesContainer && newestId && newestId !== scrolledToId) {
      scrolledToId = newestId;
      setTimeout(() => {
        messagesContainer?.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  });

  // Load conversation history when project changes
  $effect(() => {
    if ($selectedProject?.id) {
      if (needsChatReset(untrack(() => chatProjectId), $selectedProject.id)) {
        // An answer for the previous project must not land in this one.
        cancelPendingAnswer();
        untrack(resetPaging);
        ({ messages: chatMessages, conversationId, hasMore } = emptyChatState());
        chatProjectId = $selectedProject.id;
        loadConversationHistory();
      }
    } else {
      cancelPendingAnswer();
      untrack(resetPaging);
      ({ messages: chatMessages, conversationId, hasMore } = emptyChatState());
      chatProjectId = undefined;
      chatError = '';
      loadedProjectId = undefined;
      loadingHistory = false;
    }
  });

  const loadConversationHistory = async () => {
    if (!$selectedProject || !$user) return;

    const projectId = $selectedProject.id;
    const currentHistoryRequest = () => ({
      projectId: $selectedProject?.id,
      generation: loadGeneration,
    });
    const requestedFor = currentHistoryRequest();
    try {
      loadingHistory = true;
      chatError = '';
      const response = await getConversationHistory(projectId);
      if (!isStillCurrent(requestedFor, currentHistoryRequest())) return;
      chatMessages = response.messages || [];
      hasMore = response.has_more;
      conversationId = response.conversation?.id;
      loadedProjectId = projectId; // Mark this project as loaded
    } catch (error) {
      if (!isStillCurrent(requestedFor, currentHistoryRequest())) return;
      console.error('Failed to load conversation history:', error);
      chatError = error instanceof Error ? error.message : 'Failed to load conversation history';
    } finally {
      // After a project change, the newer request owns the flag.
      if (isStillCurrent(requestedFor, currentHistoryRequest())) loadingHistory = false;
    }
  };

  const loadOlderMessages = async () => {
    const oldest = chatMessages[0];
    if (!oldest || !conversationId || loadingOlder) return;

    const requestedFor = currentLoad();
    loadingOlder = true;
    chatError = '';
    try {
      const page = await getOlderMessages(conversationId, oldest.created_at);
      const loaded = { messages: chatMessages, hasMore };
      const next = applyOlderPage(loaded, page, requestedFor, currentLoad());
      if (next === loaded) return;

      // Keep the message the reader was looking at in the same place on screen.
      const container = messagesContainer;
      const oldHeight = container?.scrollHeight ?? 0;
      const oldTop = container?.scrollTop ?? 0;
      chatMessages = next.messages;
      hasMore = next.hasMore;
      await tick();
      if (container) container.scrollTop = oldTop + (container.scrollHeight - oldHeight);
    } catch (error) {
      if (requestedFor.generation !== loadGeneration) return;
      console.error('Failed to load older messages:', error);
      chatError = error instanceof Error ? error.message : 'Failed to load older messages';
      chatErrorTone = 'error';
    } finally {
      // After a project change or New chat, the newer state owns the flag.
      if (requestedFor.generation === loadGeneration) loadingOlder = false;
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!canSend(text, chatLoading) || !$selectedProject || !$user) return;

    const message = text.trim();
    chatError = '';

    // Add user message to UI immediately
    const tempUserMessage: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      conversation_id: conversationId || '',
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    chatMessages = [...chatMessages, tempUserMessage];

    // Add loading placeholder for assistant response
    const tempAssistantMessage: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      conversation_id: conversationId || '',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    chatMessages = [...chatMessages, tempAssistantMessage];

    const controller = new AbortController();
    pending = { controller, assistantId: tempAssistantMessage.id };
    textareaEl?.focus();

    try {
      chatLoading = true;
      const response = await sendChatMessage(
        $selectedProject.id,
        message,
        conversationId,
        undefined,
        controller.signal
      );
      // The response can arrive in the same moment as Stop.
      if (controller.signal.aborted) return;

      // Update conversation ID if it's a new conversation
      if (!conversationId) {
        conversationId = response.conversation_id;
      }

      // Remove temporary messages and add real ones
      chatMessages = chatMessages.filter(
        (m) => m.id !== tempUserMessage.id && m.id !== tempAssistantMessage.id
      );
      chatMessages = [...chatMessages, response.user_message, response.assistant_message];
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Failed to send message:', error);
      chatError = error instanceof Error ? error.message : 'Failed to send message';
      chatErrorTone = isLimitError(error) ? 'warning' : 'error';

      // Remove loading placeholder on error
      chatMessages = chatMessages.filter((m) => m.id !== tempAssistantMessage.id);
    } finally {
      // After a Stop, a newer request may own the loading state by now.
      if (pending?.controller === controller) {
        pending = null;
        chatLoading = false;
        textareaEl?.focus();
      }
    }
  };

  const sendComposerInput = () => {
    if (!canSend(userInput, chatLoading)) return;
    const text = userInput;
    userInput = '';
    handleSendMessage(text);
  };

  const handleStop = () => {
    cancelPendingAnswer();
    textareaEl?.focus();
  };

  const handleClearConversation = async () => {
    // A pending answer would land in the emptied chat.
    if (chatLoading || clearLoading || !$selectedProject) return;
    if (conversationId) {
      showClearConfirmDialog = true;
      return;
    }
    // No id yet, but a Stopped send may have saved the question already: the
    // API still finishes after Stop. Delete it without a dialog, or the next
    // send would bring it back.
    try {
      clearLoading = true;
      await deleteConversationHistory($selectedProject.id);
      chatMessages = [];
      chatError = '';
      resetPaging();
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      chatError = error instanceof Error ? error.message : 'Failed to clear conversation';
    } finally {
      clearLoading = false;
    }
  };

  const confirmClearConversation = async () => {
    if (!$selectedProject) return;

    try {
      clearLoading = true;
      await deleteConversationHistory($selectedProject.id);
      resetPaging();
      chatMessages = [];
      conversationId = undefined;
      chatError = '';
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      chatError = error instanceof Error ? error.message : 'Failed to clear conversation';
    } finally {
      clearLoading = false;
      // Closing on failure too, so the error banner is not hidden behind the backdrop.
      showClearConfirmDialog = false;
    }
  };

  const cancelClearConversation = () => {
    showClearConfirmDialog = false;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (shouldSubmitOnKey(e)) {
      e.preventDefault();
      sendComposerInput();
    }
  };

  // Function to show more citations for a message
  const showMoreCitations = (messageId: string) => {
    const currentVisible = visibleCitations[messageId] || 3;
    visibleCitations[messageId] = currentVisible + 3;
  };

  // Function to show fewer citations for a message
  const showLessCitations = (messageId: string) => {
    visibleCitations[messageId] = 3;
  };

  // Function to get visible citations count for a message
  const getVisibleCitationsCount = (messageId: string, totalCount: number): number => {
    return Math.min(visibleCitations[messageId] || 3, totalCount);
  };

  // Function to handle citation click and scroll to view
  const handleCitationClick = (messageId: string, citationIndex: number) => {
    // Ensure the citation is visible by expanding if needed
    const currentVisible = getVisibleCitationsCount(messageId, 999);
    if (citationIndex >= currentVisible) {
      // Calculate how many more we need to show
      const needed = citationIndex + 1;
      const toAdd = Math.ceil((needed - 3) / 3) * 3;
      visibleCitations[messageId] = 3 + toAdd;
    }

    // Wait for DOM update, then scroll to the citation
    setTimeout(() => {
      const citationElement = document.getElementById(`citation-${messageId}-${citationIndex}`);
      if (citationElement) {
        citationElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Add a temporary highlight effect
        citationElement.classList.add('citation-highlight');
        setTimeout(() => {
          citationElement.classList.remove('citation-highlight');
        }, 2000);
      }
    }, 100);
  };

  // Function to handle filename click - open right sidebar and filter by filename
  const handleFilenameClick = (filename: string) => {
    // Open right sidebar if it's closed
    if (!rightSidebarOpen) {
      onToggleRightSidebar();
    }

    // Set the file filter to the filename
    fileFilter = filename;
  };
</script>

<!-- Main Content Area -->
<div class="flex h-full min-w-0 flex-1 flex-col bg-base-100">
  <!-- Each open button sits where that sidebar's close button is, so the
       control does not move when the sidebar opens or closes. -->
  <div class="flex h-12 shrink-0 items-center px-3">
    {#if !leftSidebarOpen}
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label="Open sidebar"
        title="Open sidebar"
        onclick={onToggleLeftSidebar}
      >
        <PanelLeft class="w-5 h-5 text-base-content/70" />
      </button>
    {/if}

    <div class="ml-auto flex items-center gap-1">
      {#if $selectedProject && hasMessages && !loadingHistory}
        <!-- The tooltip sits on a wrapper so it still shows while the button is disabled. -->
        <div class="tooltip tooltip-bottom" data-tip="New chat">
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            aria-label="New chat"
            onclick={handleClearConversation}
            disabled={chatLoading || clearLoading}
          >
            <SquarePen class="w-5 h-5 text-base-content/70" aria-hidden="true" />
          </button>
        </div>
      {/if}
      {#if $selectedProject && !rightSidebarOpen}
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label="Open documents panel"
          title="Open documents panel"
          onclick={onToggleRightSidebar}
        >
          <PanelRight class="w-5 h-5 text-base-content/70" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Error Notification Display -->
  {#if errorNotif}
    <div class="mb-2 px-4">
      <NoticeBanner message={errorNotif} tone={errorTone} ondismiss={onClearErrorNotif} />
    </div>
  {/if}

  <!-- Success Notification Display -->
  {#if successNotif}
    <div class="flex justify-center mb-2 px-4 text-center">
      <div class="alert alert-success w-auto max-w-md relative pr-10">
        <span class="text-center flex-1">{successNotif}</span>
        <div class="absolute top-2.5 right-2.5">
          <button class="btn btn-xs btn-ghost" onclick={onClearSuccessNotif}>
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Main Content -->
  <div class="flex min-h-0 flex-1 flex-col">
    {#if !$selectedProject}
      <!-- Empty State - No Project Selected -->
      <div class="flex flex-1 flex-col justify-center pb-16">
        <div class="mx-auto w-full max-w-3xl px-4">
          <div class="px-1">
            {#if $projects.length > 0}
              <h2 class="text-2xl font-medium text-balance">Select a project</h2>
              <p class="mt-2 text-sm text-base-content/60">
                Pick one in the sidebar to ask questions about its documents, or start a new one.
              </p>
            {:else}
              <h2 class="text-2xl font-medium text-balance">Create your first project</h2>
              <p class="mt-2 text-sm text-base-content/60">
                A project holds the documents you want to ask questions about.
              </p>
            {/if}
            <button class="btn btn-primary mt-6" onclick={onCreateNewProject}>New project</button>
          </div>
        </div>
      </div>
    {:else}
      <!-- Chat Interface -->
      <div class="flex flex-col flex-1 min-h-0">
        <!-- Chat Error Display -->
        {#if chatError}
          <div class="mb-2 px-4">
            <NoticeBanner
              message={chatError}
              tone={chatErrorTone}
              ondismiss={() => (chatError = '')}
            />
          </div>
        {/if}

        {#if loadingHistory}
          <div class="flex flex-1 justify-center items-center">
            <span class="loading loading-spinner loading-lg text-primary"></span>
          </div>
        {:else}
          {#if hasMessages}
            <!-- Chat Messages Area -->
            <!-- Gutter on both edges keeps the column centred in the window when a scrollbar shows. -->
            <!-- overflow-anchor off: the browser's own scroll anchoring would
                 add to the manual fix in loadOlderMessages and jump twice. -->
            <div
              class="flex-1 overflow-y-auto min-h-0 py-6 [overflow-anchor:none] [scrollbar-gutter:stable_both-edges]"
              bind:this={messagesContainer}
            >
              <div class="mx-auto w-full max-w-3xl space-y-8 px-4">
                {#if hasMore}
                  <div class="flex justify-center">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm gap-2 font-normal text-base-content/70"
                      onclick={loadOlderMessages}
                      disabled={loadingOlder}
                    >
                      {#if loadingOlder}
                        <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
                      {/if}
                      Load older messages
                    </button>
                  </div>
                {/if}
                {#each chatMessages as message (message.id)}
                  <div
                    class="flex flex-col {message.role === 'user' ? 'items-end' : 'items-start'}"
                  >
                    <div
                      class={message.role === 'user'
                        ? 'max-w-[85%] rounded-box border border-base-content/10 bg-base-200 px-4 py-2.5'
                        : 'w-full text-base-content/90'}
                    >
                      {#if message.content}
                        {#if message.role === 'assistant'}
                          <!-- Render markdown for assistant messages -->
                          <ChatMarkdown
                            content={message.content}
                            messageId={message.id}
                            oncitation={handleCitationClick}
                          />
                        {:else}
                          <!-- Keep user messages as plain text -->
                          <div class="whitespace-pre-wrap">{message.content}</div>
                        {/if}
                      {:else}
                        <span class="loading loading-dots loading-sm"></span>
                      {/if}

                      <!-- The API decides what counts as weak, so the floor
                         lives in one place and history keeps the flag. -->
                      {#if message.role === 'assistant' && message.metadata?.low_confidence && message.citations?.length}
                        <div class="mt-3 flex items-start gap-2 text-xs text-warning">
                          <TriangleAlert class="w-4 h-4 shrink-0" />
                          <span>
                            Weak match. The documents may not cover this question, so check the
                            sources before relying on this answer.
                          </span>
                        </div>
                      {/if}

                      <!-- Citations for assistant messages -->
                      {#if message.role === 'assistant' && message.citations && message.citations.length > 0}
                        <div class="mt-4 pt-3 border-t border-base-content/10">
                          <div class="text-xs font-medium mb-2 text-base-content/60">
                            Sources ({message.citations.length}):
                          </div>
                          <div class="space-y-2">
                            {#each message.citations.slice(0, getVisibleCitationsCount(message.id, message.citations.length)) as citation, index}
                              <div
                                id="citation-{message.id}-{index}"
                                class="flex items-start gap-2 text-xs transition-all duration-300"
                              >
                                <div class="flex-1">
                                  <div class="font-medium">
                                    <span
                                      class="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-primary text-primary-content rounded-full mr-1"
                                    >
                                      {index + 1}
                                    </span>
                                    <button
                                      class="text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                                      onclick={() => handleFilenameClick(citation.file_name)}
                                      title="Click to find this file in the documents sidebar"
                                    >
                                      {citation.file_name}
                                    </button>
                                  </div>
                                  {#if citation.page_number}
                                    <div class="text-base-content/70">
                                      Page {citation.page_number}
                                    </div>
                                  {/if}
                                  <div class="text-base-content/60 mt-1 line-clamp-2">
                                    {citation.text_snippet}
                                  </div>
                                  <div class="text-base-content/60 mt-1">
                                    Relevance: {(citation.similarity_score * 100).toFixed(0)}%
                                  </div>
                                </div>
                              </div>
                            {/each}
                            {#if getVisibleCitationsCount(message.id, message.citations.length) < message.citations.length}
                              <button
                                class="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-base-content"
                                onclick={() => showMoreCitations(message.id)}
                              >
                                <span
                                  >Show {Math.min(
                                    3,
                                    message.citations.length -
                                      getVisibleCitationsCount(message.id, message.citations.length)
                                  )} more</span
                                >
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                  ></path>
                                </svg>
                              </button>
                            {:else if getVisibleCitationsCount(message.id, message.citations.length) > 3}
                              <button
                                class="btn btn-ghost btn-xs gap-1 text-base-content/60 hover:text-base-content"
                                onclick={() => showLessCitations(message.id)}
                              >
                                <span>Show less</span>
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 15l7-7 7 7"
                                  ></path>
                                </svg>
                              </button>
                            {/if}
                          </div>
                        </div>
                      {/if}

                      <!-- Metadata for assistant messages -->
                      {#if message.role === 'assistant' && message.metadata}
                        <div class="mt-2 text-xs text-base-content/60">
                          {#if message.metadata.processing_time_ms}
                            {(message.metadata.processing_time_ms / 1000).toFixed(1)}s
                          {/if}
                          {#if message.metadata.llm_model}
                            • {message.metadata.llm_model}
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <div class="mt-1 text-xs text-base-content/60">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- One composer for both layouts, so the draft and focus survive the move. -->
          <div class="pb-4 {hasMessages ? 'pt-2' : 'flex flex-1 flex-col justify-center'}">
            <div class="mx-auto w-full max-w-3xl px-4">
              {#if !hasMessages}
                <div class="mb-6 px-1">
                  <h2 class="text-2xl font-medium text-balance">What do you want to know?</h2>
                  <p class="mt-2 text-sm text-base-content/60">
                    Answers come from the documents in
                    <span class="text-base-content/80">{$selectedProject.name}</span>.
                  </p>
                </div>
              {/if}

              <div
                class="rounded-2xl border border-base-content/15 bg-base-200 px-3 pt-3 pb-2 transition-colors focus-within:border-base-content/40 focus-within:ring-2 focus-within:ring-primary/40"
              >
                <label for="chat-input" class="sr-only">Message</label>
                <textarea
                  id="chat-input"
                  bind:this={textareaEl}
                  bind:value={userInput}
                  onkeydown={handleKeyDown}
                  placeholder="Ask about your documents…"
                  rows="1"
                  class="block w-full resize-none bg-transparent px-1 text-base leading-6 outline-none placeholder:text-base-content/50"
                ></textarea>
                <div class="mt-2 flex justify-end">
                  {#if chatLoading}
                    <button
                      type="button"
                      class="btn btn-circle btn-sm btn-neutral"
                      onclick={handleStop}
                      aria-label="Stop"
                      title="Stop waiting for the answer"
                    >
                      <Square class="w-4 h-4" fill="currentColor" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="btn btn-circle btn-sm btn-primary"
                      onclick={sendComposerInput}
                      disabled={!canSend(userInput, false)}
                      aria-label="Send message"
                    >
                      <ArrowUp class="w-4 h-4" />
                    </button>
                  {/if}
                </div>
              </div>

              <div class="mt-2 flex min-h-6 items-center px-1">
                <span class="text-xs text-base-content/50">
                  Enter to send, Shift+Enter for a new line
                </span>
              </div>

              {#if !hasMessages}
                <!-- Reserved height so the composer does not move when the chips arrive. -->
                <div class="mt-4 min-h-50 sm:min-h-24">
                  {#if suggestionsFor !== null && suggestionsView.status === 'loading'}
                    <div
                      class="grid grid-cols-1 gap-2 sm:grid-cols-2"
                      role="status"
                      aria-busy="true"
                      aria-label="Loading suggested questions"
                      data-testid="suggestions-loading"
                    >
                      {#each [0, 1, 2, 3] as index (index)}
                        <div class="skeleton h-11 rounded-xl"></div>
                      {/each}
                    </div>
                  {:else if suggestionsFor !== null && suggestionsView.status === 'chips'}
                    <ul
                      class="grid grid-cols-1 gap-2 sm:grid-cols-2"
                      aria-label="Suggested questions"
                      data-testid="suggestions"
                    >
                      {#each suggestionsView.suggestions as question, index (index)}
                        <li class="flex">
                          <button
                            type="button"
                            class="flex min-h-11 w-full cursor-pointer items-center rounded-xl border border-base-content/15 bg-transparent px-3 py-2 text-left text-sm leading-5 text-base-content/80 transition-colors hover:border-base-content/30 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                            title={question}
                            disabled={chatLoading}
                            onclick={() => handleSendMessage(question)}
                          >
                            <span class="line-clamp-2">{question}</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {:else if suggestionsFor !== null && suggestionsView.status === 'empty'}
                    <p class="px-1 text-sm text-base-content/60" data-testid="suggestions-empty">
                      <button
                        type="button"
                        class="link link-hover text-base-content/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
                        onclick={onUploadClick}
                      >
                        Upload a document
                      </button>
                      to start.
                    </p>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<ConfirmationDialog
  bind:isOpen={showClearConfirmDialog}
  title="Start a new chat?"
  message="This deletes the current conversation. This cannot be undone."
  confirmText="Start new chat"
  cancelText="Cancel"
  confirmClass="btn-error"
  icon="danger"
  loading={clearLoading}
  onconfirm={confirmClearConversation}
  oncancel={cancelClearConversation}
/>

<style>
  /* Citation highlight effect for clicked citations */
  :global(.citation-highlight) {
    background-color: color-mix(in oklab, var(--color-primary) 20%, transparent);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-primary) 50%, transparent);
    border-radius: 0.375rem;
    padding: 0.25rem;
    margin: -0.25rem;
    transition: all 0.2s ease;
  }
</style>
