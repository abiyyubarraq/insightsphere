<script lang="ts">
  import { ChevronLeft, ChevronRight, Plus, X, Send, Trash2 } from 'lucide-svelte';
  import { selectedProject, projects } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    sendChatMessage,
    getConversationHistory,
    deleteConversationHistory,
  } from '../../../services/supabase';
  import type { ChatMessage } from '../../../../../shared/types/chat';
  import { ConfirmationDialog } from '../common';
  import ChatMarkdown from './ChatMarkdown.svelte';

  let {
    leftSidebarOpen = $bindable(),
    rightSidebarOpen = $bindable(),
    errorNotif = $bindable(),
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
  let messagesContainer: HTMLDivElement | undefined = $state();
  let loadingHistory = $state(false);
  let loadedProjectId: string | undefined = $state(undefined);
  let visibleCitations: Record<string, number> = $state({});
  let showClearConfirmDialog = $state(false);
  let clearLoading = $state(false);

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
        loadConversationHistory();
      }
    } else {
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
    if (!userInput.trim() || !$selectedProject || !$user || chatLoading) return;

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

    try {
      chatLoading = true;
      const response = await sendChatMessage($selectedProject.id, message, conversationId);

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
      console.error('Failed to send message:', error);
      chatError = error instanceof Error ? error.message : 'Failed to send message';

      // Remove loading placeholder on error
      chatMessages = chatMessages.filter((m) => m.id !== tempAssistantMessage.id);
    } finally {
      chatLoading = false;
    }
  };

  const handleClearConversation = () => {
    if (!$selectedProject || !conversationId) return;
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
      showClearConfirmDialog = false;
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      chatError = error instanceof Error ? error.message : 'Failed to clear conversation';
    } finally {
      clearLoading = false;
    }
  };

  const cancelClearConversation = () => {
    showClearConfirmDialog = false;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // Expose the function to global scope for onclick handlers
  if (typeof window !== 'undefined') {
    (window as any).handleCitationClick = handleCitationClick;
    (window as any).handleFilenameClick = handleFilenameClick;
  }
</script>

<!-- Main Content Area -->
<div
  class="bg-base-100/30 h-screen flex flex-col transition-all duration-300 {leftSidebarOpen
    ? 'ml-50'
    : 'ml-0'} {rightSidebarOpen ? 'mr-80' : 'mr-0'}"
>
  <!-- Error Notification Display -->
  {#if errorNotif}
    <div class="flex justify-center mt-4">
      <div class="alert alert-error w-auto max-w-md relative pr-10">
        <span class="text-center flex-1">{errorNotif}</span>
        <div class="absolute top-2.5 right-2.5">
          <button class="btn btn-xs btn-ghost" onclick={onClearErrorNotif}>
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
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

    <div class="flex justify-center bg-transparent">
      <h1 class="text-xl font-semibold flex">
        {#if $selectedProject}
          {$selectedProject.name}
        {/if}
      </h1>
    </div>

    {#if $selectedProject && !rightSidebarOpen}
      <button
        class="absolute right-0 top-0 mt-5 btn btn-sm w-3/100 transition-all duration-500 border-accent"
        onclick={onToggleRightSidebar}
        title="Open Right Sidebar"
      >
        <ChevronLeft class="w-5 h-5 text-base-content/70" />
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
      <div class="flex flex-col min-h-0 ml-2">
        <!-- Chat Error Display -->
        {#if chatError}
          <div class="mx-6 flex justify-between gap-2 alert alert-error">
            {chatError}
            <button class="btn btn-sm btn-ghost" onclick={() => (chatError = '')}>
              <X class="w-4 h-4" />
            </button>
          </div>
        {/if}

        <!-- Chat Messages Area -->
        <div class="flex-1 p-6 overflow-y-auto min-h-0" bind:this={messagesContainer}>
          {#if loadingHistory}
            <div class="flex justify-center items-center h-full">
              <span class="loading loading-spinner loading-lg text-primary"></span>
            </div>
          {:else if chatMessages.length === 0}
            <div class="w-full h-full flex items-center justify-center">
              <div class="text-center space-y-4">
                <div class="text-4xl">💬</div>
                <h3 class="text-2xl font-semibold">Start a conversation</h3>
                <p class="text-base-content/70">
                  Ask questions about your documents in {$selectedProject.name}
                </p>
              </div>
            </div>
          {:else}
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
                        <ChatMarkdown content={message.content} messageId={message.id} />
                      {:else}
                        <!-- Keep user messages as plain text -->
                        <div class="whitespace-pre-wrap">{message.content}</div>
                      {/if}
                    {:else}
                      <span class="loading loading-dots loading-sm"></span>
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
          {/if}
        </div>

        <!-- Chat Input Area -->
        <div class="p-3 border-t border-base-300">
          <div class="w-full max-w-4xl mx-auto">
            <div class="flex gap-4">
              <div class="flex-1 relative">
                <textarea
                  bind:value={userInput}
                  onkeydown={handleKeyDown}
                  placeholder="Ask anything about your documents..."
                  class="textarea textarea-bordered w-full resize-none"
                  rows="2"
                  disabled={chatLoading}
                ></textarea>
                <div class="absolute right-2 bottom-2 flex gap-2">
                  <button
                    class="btn btn-primary btn-sm gap-2"
                    onclick={handleSendMessage}
                    disabled={chatLoading || !userInput.trim()}
                  >
                    {#if chatLoading}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <Send class="w-4 h-4" />
                    {/if}
                  </button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <div class="border-b border-base-300">
                  {#if chatMessages.length > 0}
                    <button
                      class="btn btn-secondary btn-sm gap-2"
                      onclick={handleClearConversation}
                      title="Clear conversation"
                    >
                      <Trash2 class="w-4 h-4" />
                      Clear
                    </button>
                  {/if}
                </div>
              </div>
            </div>
            <div class="text-xs text-base-content/50 mt-2">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Clear Conversation Confirmation Dialog -->
<ConfirmationDialog
  bind:isOpen={showClearConfirmDialog}
  title="Clear Conversation"
  message="Are you sure you want to clear this conversation? This action cannot be undone."
  confirmText="Clear"
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
