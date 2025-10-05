<script lang="ts">
  import { ChevronLeft, ChevronRight, Plus, Upload, MessageSquare, X } from 'lucide-svelte';
  import { selectedProject, projects } from '../../../stores/project';

  let {
    leftSidebarOpen = $bindable(),
    rightSidebarOpen = $bindable(),
    uploadError = $bindable(),
    uploadLoading = $bindable(),
    onToggleLeftSidebar,
    onToggleRightSidebar,
    onCreateNewProject,
    onUploadClick,
    onClearUploadError,
  } = $props<{
    leftSidebarOpen?: boolean;
    rightSidebarOpen?: boolean;
    uploadError?: string;
    uploadLoading?: boolean;
    onToggleLeftSidebar: () => void;
    onToggleRightSidebar: () => void;
    onCreateNewProject: () => void;
    onUploadClick: () => void;
    onClearUploadError: () => void;
  }>();
</script>

<!-- Main Content Area -->
<div
  class="bg-base-100/30 h-screen flex flex-col transition-all duration-300 {leftSidebarOpen
    ? 'ml-50'
    : 'ml-0'} {rightSidebarOpen ? 'mr-60' : 'mr-0'}"
>
  <!-- Top Bar with Toggle Buttons -->
  <div class="flex items-center justify-between p-4 border-b border-base-300">
    <div class="flex justify-start">
      <button class="btn btn-ghost btn-sm" onclick={onToggleLeftSidebar} title="Open Left Sidebar">
        {#if !leftSidebarOpen}
          <ChevronRight class="w-4 h-4 text-base-content/70" />
        {/if}
      </button>
    </div>

    <h1 class="text-xl font-semibold">
      {#if $selectedProject}
        {$selectedProject.name}
      {/if}
    </h1>

    {#if $selectedProject}
      <button
        class="btn btn-ghost btn-sm"
        onclick={onToggleRightSidebar}
        title="Open Right Sidebar"
      >
        {#if !rightSidebarOpen}
          <ChevronLeft class="w-4 h-4 text-base-content/70" />
        {/if}
      </button>
    {/if}
  </div>

  <!-- Upload Error Display -->
  {#if uploadError}
    <div class="alert alert-error mx-4 mt-4">
      <X class="w-4 h-4" />
      {uploadError}
      <button class="btn btn-sm btn-ghost" onclick={onClearUploadError}>
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}

  <!-- Main Content -->
  <div class="flex-1 flex flex-col w-full">
    {#if !$selectedProject}
      <!-- Empty State - No Project Selected -->
      <div class="flex-1 flex items-center justify-center">
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
      <div class="flex-1 flex flex-col">
        <!-- Chat Messages Area -->
        <div class="flex-1 p-6 overflow-y-auto">
          <div class="w-full">
            <div class="text-center space-y-4">
              <div class="text-4xl">💬</div>
              <h3 class="text-2xl font-semibold">Start a conversation</h3>
              <p class="text-base-content/70">
                Ask questions about your documents in {$selectedProject.name}
              </p>
            </div>
          </div>
        </div>

        <!-- Chat Input Area -->
        <div class="p-6 border-t border-base-300">
          <div class="w-full">
            <div class="flex gap-4">
              <div class="flex-1 relative">
                <input
                  type="text"
                  placeholder="Ask anything about your documents..."
                  class="input input-bordered w-full pr-12"
                />
                <button
                  class="btn btn-ghost btn-sm absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  <MessageSquare class="w-4 h-4" />
                </button>
              </div>
              <button
                class="btn btn-primary gap-2"
                onclick={onUploadClick}
                disabled={uploadLoading}
              >
                {#if uploadLoading}
                  <span class="loading loading-spinner loading-xs"></span>
                {:else}
                  <Upload class="w-4 h-4" />
                {/if}
                Upload
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
