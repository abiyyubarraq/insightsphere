<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    Plus,
    X,
    ArrowUp,
    Square,
    SquarePen,
    TriangleAlert,
  } from 'lucide-svelte';
  import { onDestroy, untrack } from 'svelte';
  import { selectedProject, projects } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    sendChatMessage,
    getConversationHistory,
    deleteConversationHistory,
    isLimitError,
  } from '../../../services/supabase';
  import type { ChatMessage } from '../../../../../shared/types/chat';
  import { ConfirmationDialog, NoticeBanner } from '../common';
  import ChatMarkdown from './ChatMarkdown.svelte';
  import { canSend, shouldSubmitOnKey } from '$lib/chatComposer';

  let {
    leftSidebarOpen = $bindable(),
    rightSidebarOpen = $bindable(),
    errorNotif = $bindable(),
    errorTone = 'error',
    successNotif = $bindable(),
    uploadLoading = $bindable(),
    fileFilter = $bindable(),
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onCreateNewProject,
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
    onToggleLeftSidebar: () => void;
    onToggleRightSidebar: () => void;
    onCreateNewProject: () => void;
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
  let visibleCitations: Record<string, number> = $state({});
  let showClearConfirmDialog = $state(false);
  let clearLoading = $state(false);
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let hasMessages = $derived(chatMessages.length > 0);

  // Not reactive: only the send, stop and cleanup code read it.
  let pending: { controller: AbortController; assistantId: string } | null = null;

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

  // Auto-scroll to bottom when new messages arrive
  $effect(() => {
    if (messagesContainer && chatMessages.length > 0) {
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
      if (loadedProjectId !== $selectedProject.id) {
        // An answer for the previous project must not land in this one.
        cancelPendingAnswer();
        loadConversationHistory();
      }
    } else {
      cancelPendingAnswer();
      chatMessages = [];
      conversationId = undefined;
      chatError = '';
      loadedProjectId = undefined;
    }
  });

  const loadConversationHistory = async () => {
    if (!$selectedProject || !$user) return;

    try {
      loadingHistory = true;
      chatError = '';
      const response = await getConversationHistory($selectedProject.id);
      chatMessages = response.messages || [];
      conversationId = response.conversation?.id;
      loadedProjectId = $selectedProject.id; // Mark this project as loaded
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      chatError = error instanceof Error ? error.message : 'Failed to load conversation history';
    } finally {
      loadingHistory = false;
    }
  };

  const handleSendMessage = async () => {
    if (!canSend(userInput, chatLoading) || !$selectedProject || !$user) return;

    const message = userInput.trim();
    userInput = '';
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

  const handleStop = () => {
    cancelPendingAnswer();
    textareaEl?.focus();
  };

  const handleClearConversation = () => {
    // A pending answer would land in the emptied chat.
    if (chatLoading || !$selectedProject || !conversationId) return;
    showClearConfirmDialog = true;
  };

  const confirmClearConversation = async () => {
    if (!$selectedProject) return;

    try {
      clearLoading = true;
      await deleteConversationHistory($selectedProject.id);
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
      handleSendMessage();
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
        citationElement.classList.add('bg-primary/20', 'ring-2', 'ring-primary/50');
        setTimeout(() => {
          citationElement.classList.remove('bg-primary/20', 'ring-2', 'ring-primary/50');
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
<div
  class="bg-base-100/30 h-screen flex flex-col transition-all duration-300 {leftSidebarOpen
    ? 'ml-50'
    : 'ml-0'} {rightSidebarOpen ? 'mr-80' : 'mr-0'}"
>
  <!-- Error Notification Display -->
  {#if errorNotif}
    <div class="mt-4 px-14">
      <NoticeBanner message={errorNotif} tone={errorTone} ondismiss={onClearErrorNotif} />
    </div>
  {/if}

  <!-- Success Notification Display -->
  {#if successNotif}
    <div class="flex justify-center mt-4 text-center">
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
  <div class="flex-1 flex flex-col w-full h-full">
    {#if !leftSidebarOpen}
      <button
        class="absolute left-0 top-0 mt-5 btn btn-sm w-3/100 transition-all duration-500 border-accent"
        onclick={onToggleLeftSidebar}
        title="Open Left Sidebar"
      >
        <ChevronRight class="w-4 h-4 text-base-content/70" />
      </button>
    {/if}

    {#if !$selectedProject}
      <!-- Empty State - No Project Selected -->
      <div class="flex items-center justify-center mt-33">
        <div class="text-center space-y-6 max-w-md w-full">
          <div class="text-6xl">🧠</div>
          <h2 class="text-3xl font-bold">Welcome to InsightSphere</h2>
          <p class="text-base-content/70 text-lg">
            Select a project to start chatting with your documents or create a new project to get
            started.
          </p>
          {#if $projects.length === 0}
            <button class="btn btn-primary btn-lg gap-2" onclick={onCreateNewProject}>
              <Plus class="w-5 h-5" />
              Create Your First Project
            </button>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Chat Interface -->
      <div class="flex flex-col flex-1 min-h-0 ml-2">
        <!-- One header row for both buttons. pl-14 keeps it clear of the left sidebar toggle. -->
        <div class="flex h-12 shrink-0 items-center justify-end gap-1 pl-14 pr-3">
          {#if hasMessages && !loadingHistory}
            <!-- The tooltip sits on a wrapper so it still shows while the button is disabled. -->
            <div class="tooltip tooltip-left" data-tip="New chat">
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content"
                onclick={handleClearConversation}
                disabled={chatLoading}
                aria-label="New chat"
              >
                <SquarePen class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          {/if}
          {#if !rightSidebarOpen}
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content"
              onclick={onToggleRightSidebar}
              aria-label="Open right sidebar"
              title="Open right sidebar"
            >
              <ChevronLeft class="w-4 h-4" aria-hidden="true" />
            </button>
          {/if}
        </div>

        <!-- Chat Error Display -->
        <!-- px-14 keeps it clear of the left sidebar toggle. -->
        {#if chatError}
          <div class="mt-4 px-14">
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
            <div class="flex-1 p-6 overflow-y-auto min-h-0" bind:this={messagesContainer}>
              <div class="space-y-6 max-w-4xl mx-auto">
                {#each chatMessages as message (message.id)}
                  <div class="chat {message.role === 'user' ? 'chat-end' : 'chat-start'}">
                    <div
                      class="chat-bubble {message.role === 'user'
                        ? 'chat-bubble-primary'
                        : 'chat-bubble-secondary'}"
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
                        <div class="mt-3 pt-3 border-t border-base-content/20">
                          <div class="text-xs font-semibold mb-2 opacity-70">
                            Sources ({message.citations.length}):
                          </div>
                          <div class="space-y-2">
                            {#each message.citations.slice(0, getVisibleCitationsCount(message.id, message.citations.length)) as citation, index}
                              <div
                                id="citation-{message.id}-{index}"
                                class="flex items-start gap-2 text-xs opacity-80 transition-all duration-300"
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
                                    <div class="opacity-70">Page {citation.page_number}</div>
                                  {/if}
                                  <div class="opacity-60 mt-1 line-clamp-2">
                                    {citation.text_snippet}
                                  </div>
                                  <div class="opacity-50 mt-1">
                                    Relevance: {(citation.similarity_score * 100).toFixed(0)}%
                                  </div>
                                </div>
                              </div>
                            {/each}
                            {#if getVisibleCitationsCount(message.id, message.citations.length) < message.citations.length}
                              <button
                                class="btn btn-ghost btn-xs gap-1 text-white hover:text-primary-focus"
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
                        <div class="mt-2 text-xs opacity-50">
                          {#if message.metadata.processing_time_ms}
                            {(message.metadata.processing_time_ms / 1000).toFixed(1)}s
                          {/if}
                          {#if message.metadata.llm_model}
                            • {message.metadata.llm_model}
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <div class="chat-footer opacity-50 text-xs mt-1">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- One composer for both layouts, so the draft and focus survive the move. -->
          <div class="px-6 pb-4 {hasMessages ? 'pt-2' : 'flex flex-1 flex-col justify-center'}">
            <div class="w-full max-w-4xl mx-auto">
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
                  class="block w-full resize-none bg-transparent px-1 text-base leading-6 outline-none placeholder:text-base-content/40"
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
                      onclick={handleSendMessage}
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
                <!-- Room under the composer for suggested questions. -->
                <div class="min-h-16"></div>
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
    background-color: rgba(var(--p) / 0.2);
    box-shadow: 0 0 0 2px rgba(var(--p) / 0.5);
    border-radius: 0.375rem;
    padding: 0.25rem;
    margin: -0.25rem;
    transition: all 0.2s ease;
  }
</style>
