<script lang="ts">
  import {
    Upload,
    Search,
    Plus,
    X,
    Check,
    PackageSearch,
    Loader,
    CircleOff,
    ChevronLeft,
    ChevronRight,
    Folder,
    Library,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    PanelRightOpen,
    PanelLeftOpen,
  } from 'lucide-svelte';
  import {
    projects,
    selectedProject,
    type Project,
    type ProjectFile,
  } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    createProject,
    deleteDocument,
    getProjectFiles,
    getProjectFileSummary,
    downloadFile,
  } from '../../../services/supabase';
  import { withLoading } from '../../../commons/helpers';
  import { ConfirmationDialog, FileActionsPopover } from '../common';
  import UserHeader from './UserHeader.svelte';
  import moment from 'moment';
  import LoadingState from './LoadingState.svelte';

  let newProjectName = $state('');
  let loading = $state(false);
  let error = $state('');
  let uploadLoading = $state(false);
  let uploadError = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let uploadedFiles: ProjectFile[] = $state([]);
  let removingFileLoading: Record<string, boolean> = $state({});
  let downloadingFileLoading: Record<string, boolean> = $state({});
  let showCreateModal = $state(false);
  let loadingFiles = $state(false);

  // Confirmation dialog state
  let showConfirmDialog = $state(false);
  let fileToRemove: { index: number; name: string } | null = $state(null);

  // File processing state
  let processingFileLoading: Record<string, boolean> = $state({});
  let generatingSummaryLoading: Record<string, boolean> = $state({});

  // Summary modal state
  let showSummaryModal = $state(false);
  let currentSummary = $state('');
  let currentSummaryFileName = $state('');

  // Sidebar state
  let leftSidebarOpen = $state(true);
  let rightSidebarOpen = $state(false);

  // Projects list state
  let showProjectsList = $state(false);

  // Navigation state
  let activeNavItem = $state('');

  // File filtering state
  let fileFilter = $state('');

  // Derived filtered files
  let filteredFiles = $derived(
    fileFilter.trim() === ''
      ? uploadedFiles
      : uploadedFiles.filter((file) =>
          file.file_name.toLowerCase().includes(fileFilter.toLowerCase())
        )
  );

  // Helper function to clear errors
  const clearErrors = () => {
    error = '';
    uploadError = '';
  };

  // Common project creation logic
  const createNewProject = async (closeModal = false) => {
    if (!newProjectName.trim()) return;

    await withLoading(
      async () => {
        const p = await createProject($user?.id as string, newProjectName.trim());
        projects.update((arr) => [...arr, p]);
        selectedProject.set(p);
        newProjectName = '';
        if (closeModal) showCreateModal = false;
        return p;
      },
      (loadingState) => {
        loading = loadingState;
      },
      (errorMsg) => {
        error = errorMsg;
      }
    );
  };

  const handleCreateNewProject = () => {
    showCreateModal = true;
  };

  const handleUploadClick = () => {
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleFileUpload = async () => {
    // TODO: Implement file upload functionality
    // const target = event.target as HTMLInputElement;
    // const file = target.files?.[0];
    // if (!file || !currentSelectedProject || !currentUser) return;
    // await withLoading(
    //   async () => {
    //     await uploadDocument(file, currentSelectedProject.id, currentUser.id);
    //     await refreshProjectFiles();
    //     target.value = '';
    //   },
    //   (loadingState) => {
    //     uploadLoading = loadingState;
    //   },
    //   (errorMsg) => {
    //     uploadError = errorMsg;
    //   }
    // );
  };

  const removeFile = async (index: number) => {
    const file = uploadedFiles[index];
    if (!file || !$selectedProject || !$user) return;

    // Show confirmation dialog
    fileToRemove = { index, name: file.file_name };
    showConfirmDialog = true;
  };

  const confirmRemoveFile = async () => {
    if (!fileToRemove || !$selectedProject || !$user) return;

    const file = uploadedFiles[fileToRemove.index];
    if (!file) return;

    const fileIndex = fileToRemove.index;

    await withLoading(
      async () => {
        await deleteDocument(file.id, $selectedProject.id, $user.id);
        uploadedFiles = uploadedFiles.filter((_, i) => i !== fileIndex);
      },
      (loadingState) => {
        removingFileLoading[file.id] = loadingState;
      },
      (errorMsg) => {
        uploadError = errorMsg;
      }
    );

    // Close dialog and reset state
    showConfirmDialog = false;
    fileToRemove = null;
  };

  const cancelRemoveFile = () => {
    showConfirmDialog = false;
    fileToRemove = null;
  };

  const handleDownloadFile = async (fileId: string, storagePath: string) => {
    downloadingFileLoading[fileId] = true;
    try {
      await downloadFile(storagePath);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to download file';
    } finally {
      downloadingFileLoading[fileId] = false;
    }
  };

  // File action handlers

  const handleFileDownload = (event: CustomEvent<{ fileId: string }>) => {
    const file = uploadedFiles.find((f) => f.id === event.detail.fileId);
    if (file) {
      handleDownloadFile(file.id, file.storage_path);
    }
  };

  const handleFileRemove = (event: CustomEvent<{ fileId: string }>) => {
    const fileIndex = uploadedFiles.findIndex((f) => f.id === event.detail.fileId);
    if (fileIndex !== -1) {
      removeFile(fileIndex);
    }
  };

  const handleFileProcess = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    processingFileLoading[fileId] = true;
    try {
      // TODO: Implement file processing API call
      // await processFile(fileId);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to process file';
    } finally {
      processingFileLoading[fileId] = false;
    }
  };

  const handleFileRetry = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    processingFileLoading[fileId] = true;
    try {
      // TODO: Implement file retry processing API call
      // await retryFileProcessing(fileId);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to retry file processing';
    } finally {
      processingFileLoading[fileId] = false;
    }
  };

  const handleFileOpenSummary = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    const file = uploadedFiles.find((f) => f.id === fileId);
    if (!file || !$selectedProject || !$user) return;

    try {
      const summaries = await getProjectFileSummary($selectedProject.id, $user.id);
      const fileSummary = summaries.find((s) => s.id === fileId);

      if (fileSummary?.summary) {
        currentSummary = fileSummary.summary;
        currentSummaryFileName = file.file_name;
        showSummaryModal = true;
      } else {
        uploadError = 'Summary not found for this file';
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to load summary';
    }
  };

  const handleFileGenerateSummary = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    generatingSummaryLoading[fileId] = true;
    try {
      // TODO: Implement summary generation API call
      // await generateFileSummary(fileId);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to generate summary';
    } finally {
      generatingSummaryLoading[fileId] = false;
    }
  };

  const closeSummaryModal = () => {
    showSummaryModal = false;
    currentSummary = '';
    currentSummaryFileName = '';
  };

  // Helper function to refresh project files
  const refreshProjectFiles = async (project: Project) => {
    try {
      loadingFiles = true;
      selectedProject.set(project);

      const files = await getProjectFiles(project.id, $user?.id || '');
      uploadedFiles = files;
    } catch (e) {
      error = e instanceof Error ? e.message : 'An unknown error occurred';
    } finally {
      loadingFiles = false;
    }
  };

  // Navigation handlers
  const handleNavClick = (navItem: string) => {
    activeNavItem = navItem;
    if (navItem === 'new-project') {
      handleCreateNewProject();
    }
  };

  // Sidebar toggle handlers
  const toggleLeftSidebar = () => {
    leftSidebarOpen = !leftSidebarOpen;
  };

  const toggleRightSidebar = () => {
    rightSidebarOpen = !rightSidebarOpen;
  };

  const toggleShowProjectsList = () => {
    showProjectsList = !showProjectsList;
  };
</script>

<!-- Hidden File Input -->
<input
  type="file"
  bind:this={fileInput}
  onchange={handleFileUpload}
  accept=".pdf,.doc,.docx,.txt"
  class="hidden"
/>

<!-- Main Layout Container -->
<div
  class="relative h-screen bg-cover bg-center bg-no-repeat"
  style="background-image: url('/dashboard.png'); overflow: hidden;"
>
  <!-- Left Sidebar - Absolute positioned -->
  <div
    class="bg-base-100/50 absolute left-0 top-0 bottom-0 w-50 border-r border-base-300 border-r-white transition-transform duration-300 {leftSidebarOpen
      ? 'translate-x-0'
      : '-translate-x-full'} z-10"
  >
    <div class="flex flex-col h-full">
      <!-- Navigation Menu -->
      <div class="flex-1 p-4">
        <div class="space-y-2">
          <div class="flex justify-end">
            <button
              class="btn btn-ghost btn-sm"
              title="Close Left Sidebar"
              onclick={toggleLeftSidebar}
            >
              <PanelRightOpen class="w-4 h-4 text-base-content/70" />
            </button>
          </div>
          <button
            class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'new-project'
              ? 'btn-active'
              : ''}"
            onclick={() => handleNavClick('new-project')}
          >
            <Plus class="w-4 h-4" />
            New Project
          </button>

          <button
            class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'search-project'
              ? 'btn-active'
              : ''}"
            onclick={() => handleNavClick('search-project')}
          >
            <Search class="w-4 h-4" />
            Search Project
          </button>

          <button
            class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'file-library'
              ? 'btn-active'
              : ''}"
            onclick={() => handleNavClick('file-library')}
          >
            <Library class="w-4 h-4" />
            File Library
          </button>
        </div>

        <!-- Projects List - Chat History Style -->
        {#if $projects.length > 0}
          <div class="mt-6">
            <button
              class="btn btn-ghost w-full justify-start gap-3"
              onclick={toggleShowProjectsList}
            >
              <h3 class="text-sm font-semibold text-base-content/70">Projects</h3>
              {#if showProjectsList}
                <ChevronUp class="w-3 h-3 text-base-content/70" />
              {:else}
                <ChevronDown class="w-3 h-3 text-base-content/70" />
              {/if}
            </button>
            <div class="space-y-1 {showProjectsList ? 'block' : 'hidden'}">
              {#each $projects as project}
                <button
                  class="hover:cursor-pointer text-left truncate w-full px-3 py-2 rounded-md text-sm hover:bg-primary/20 transition-colors {$selectedProject?.id ===
                  project.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-base-content/80'}"
                  onclick={async () => {
                    if ($selectedProject?.id !== project.id) {
                      rightSidebarOpen = true;
                      await refreshProjectFiles(project);
                    }
                  }}
                >
                  {project.name}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="py-8">
            <p class="text-sm font-semibold text-base-content/70">No projects found</p>
          </div>
        {/if}
      </div>

      <!-- User Header at Bottom -->
      <div class="p-4 border-t border-base-300">
        <UserHeader />
      </div>
    </div>
  </div>

  <!-- Right Sidebar - Absolute positioned -->
  {#if $selectedProject}
    <div
      class="bg-base-100/50 absolute right-0 top-0 bottom-0 w-60 border-l border-base-300 border-l-white transition-all duration-300 {rightSidebarOpen
        ? 'translate-x-0 opacity-100'
        : 'translate-x-full opacity-0 pointer-events-none'} z-10"
    >
      <div class="flex flex-col h-full">
        <div class="p-4 border-b border-base-300">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <Folder class="w-5 h-5" />
              Documents
            </h3>
            <button
              class="btn btn-ghost btn-sm"
              title="Close Right Sidebar"
              onclick={toggleRightSidebar}
            >
              <PanelLeftOpen class="w-4 h-4 text-base-content/70" />
            </button>
          </div>

          <!-- File Filter Input -->
          <div class="form-control">
            <input
              type="text"
              placeholder="Filter files by name..."
              bind:value={fileFilter}
              disabled={uploadedFiles.length === 0 || loadingFiles}
              class="input input-bordered input-sm w-full"
            />
          </div>
        </div>
        {#if loadingFiles}
          <LoadingState />
        {:else}
          <div class="flex-1 overflow-y-auto p-4">
            {#if uploadedFiles.length > 0}
              {#if filteredFiles.length > 0}
                <div class="space-y-2">
                  {#each filteredFiles as file}
                    <div class="card bg-base-100 shadow-sm">
                      <div class="card-body p-3">
                        <div class="flex items-start gap-3">
                          <!-- File Status Icon -->
                          {#if file.status === 'ready'}
                            <div title="File processed">
                              <Check class="w-4 h-4 text-success flex-shrink-0 mt-1" />
                            </div>
                          {:else if file.status === 'processing'}
                            <div title="File still processing">
                              <Loader
                                class="w-4 h-4 text-warning animate-spin flex-shrink-0 mt-1"
                              />
                            </div>
                          {:else if file.status === 'failed'}
                            <div title="File processing failed">
                              <CircleOff class="w-4 h-4 text-error flex-shrink-0 mt-1" />
                            </div>
                          {:else}
                            <div title="File not processed">
                              <PackageSearch
                                class="w-4 h-4 text-base-content/50 flex-shrink-0 mt-1"
                              />
                            </div>
                          {/if}

                          <!-- File Info -->
                          <div class="flex-1 min-w-0 z-11" title={file.file_name}>
                            <p class="font-medium text-sm truncate">
                              {file.file_name}
                            </p>
                            <p class="text-xs text-base-content/70">
                              {moment(file.created_at).format('DD/MM/YYYY HH:mm')}
                            </p>
                          </div>

                          <!-- Actions Menu -->
                          <FileActionsPopover
                            {file}
                            isDownloading={downloadingFileLoading[file.id]}
                            isRemoving={removingFileLoading[file.id]}
                            isProcessing={processingFileLoading[file.id]}
                            isGeneratingSummary={generatingSummaryLoading[file.id]}
                            ondownload={handleFileDownload}
                            onremove={handleFileRemove}
                            onprocess={handleFileProcess}
                            onretry={handleFileRetry}
                            onopensummary={handleFileOpenSummary}
                            ongeneratesummary={handleFileGenerateSummary}
                          />
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center py-8">
                  <div class="text-4xl mb-4">🔍</div>
                  <p class="text-base-content/70">No files match your filter</p>
                  <p class="text-sm text-base-content/50 mt-1">Try a different search term</p>
                </div>
              {/if}
            {:else}
              <div class="text-center py-8">
                <div class="text-4xl mb-4">📄</div>
                <p class="text-base-content/70">No documents uploaded yet</p>
                <button
                  class="btn btn-primary btn-sm mt-4 gap-2"
                  onclick={handleUploadClick}
                  disabled={uploadLoading}
                >
                  {#if uploadLoading}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <Upload class="w-4 h-4" />
                  {/if}
                  Upload Document
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Main Content Area -->
  <div
    class="bg-base-100/30 h-screen flex flex-col transition-all duration-300 {leftSidebarOpen
      ? 'ml-50'
      : 'ml-0'} {rightSidebarOpen ? 'mr-60' : 'mr-0'}"
  >
    <!-- Top Bar with Toggle Buttons -->
    <div class="flex items-center justify-between p-4 border-b border-base-300">
      <div class="flex justify-start">
        <button class="btn btn-ghost btn-sm" onclick={toggleLeftSidebar} title="Open Left Sidebar">
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
          onclick={toggleRightSidebar}
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
        <button class="btn btn-sm btn-ghost" onclick={() => (uploadError = '')}>
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
              <button class="btn btn-primary btn-lg gap-2" onclick={handleCreateNewProject}>
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
                  onclick={handleUploadClick}
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
</div>

<!-- Create Project Modal -->
{#if showCreateModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Create New Project</h3>

      {#if error}
        <div class="alert alert-error mb-4">
          <X class="w-4 h-4" />
          {error}
        </div>
      {/if}

      <div class="form-control">
        <input
          id="project-name-input"
          type="text"
          bind:value={newProjectName}
          placeholder="Enter project name"
          class="input input-bordered w-full"
          onkeydown={(e) => e.key === 'Enter' && createNewProject(true)}
        />
      </div>

      <div class="modal-action">
        <button
          class="btn btn-ghost"
          onclick={() => {
            showCreateModal = false;
            newProjectName = '';
            clearErrors();
          }}
        >
          Cancel
        </button>
        <button
          class="btn btn-primary gap-2"
          onclick={() => createNewProject(true)}
          disabled={loading || !newProjectName.trim()}
        >
          {#if loading}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <Plus class="w-4 h-4" />
          {/if}
          Create Project
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Dialog -->
<ConfirmationDialog
  bind:isOpen={showConfirmDialog}
  title="Remove File"
  message="Are you sure you want to remove '{fileToRemove?.name}'? This action cannot be undone."
  confirmText="Remove"
  cancelText="Cancel"
  confirmClass="btn-error"
  icon="danger"
  loading={fileToRemove ? removingFileLoading[uploadedFiles[fileToRemove.index]?.id] : false}
  onconfirm={confirmRemoveFile}
  oncancel={cancelRemoveFile}
/>

<!-- Summary Modal -->
{#if showSummaryModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-4xl">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg">Document Summary</h3>
        <button class="btn btn-sm btn-circle btn-ghost" onclick={closeSummaryModal}>
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="mb-4">
        <p class="text-sm text-base-content/70 mb-2">
          File: <span class="font-medium">{currentSummaryFileName}</span>
        </p>
      </div>

      <div class="bg-base-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <p class="whitespace-pre-wrap text-sm leading-relaxed">{currentSummary}</p>
      </div>

      <div class="modal-action">
        <button class="btn btn-primary" onclick={closeSummaryModal}> Close </button>
      </div>
    </div>
  </div>
{/if}
