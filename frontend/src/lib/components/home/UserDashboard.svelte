<script lang="ts">
  import { Plus, X } from 'lucide-svelte';
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
  import { ConfirmationDialog } from '../common';
  import LeftSidebar from './LeftSidebar.svelte';
  import RightSidebar from './RightSidebar.svelte';
  import MainContent from './MainContent.svelte';

  // State management
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
  <!-- Left Sidebar -->
  <LeftSidebar
    bind:leftSidebarOpen
    bind:showProjectsList
    bind:activeNavItem
    onToggleLeftSidebar={toggleLeftSidebar}
    onNavClick={handleNavClick}
    onToggleProjectsList={toggleShowProjectsList}
    onRefreshProjectFiles={refreshProjectFiles}
  />

  <!-- Right Sidebar -->
  <RightSidebar
    bind:rightSidebarOpen
    bind:uploadedFiles
    bind:loadingFiles
    bind:fileFilter
    bind:filteredFiles
    bind:downloadingFileLoading
    bind:removingFileLoading
    bind:processingFileLoading
    bind:generatingSummaryLoading
    bind:uploadLoading
    onToggleRightSidebar={toggleRightSidebar}
    onFileDownload={handleFileDownload}
    onFileRemove={handleFileRemove}
    onFileProcess={handleFileProcess}
    onFileRetry={handleFileRetry}
    onFileOpenSummary={handleFileOpenSummary}
    onFileGenerateSummary={handleFileGenerateSummary}
    onUploadClick={handleUploadClick}
  />

  <!-- Main Content -->
  <MainContent
    bind:leftSidebarOpen
    bind:rightSidebarOpen
    bind:uploadError
    bind:uploadLoading
    onToggleLeftSidebar={toggleLeftSidebar}
    onToggleRightSidebar={toggleRightSidebar}
    onCreateNewProject={handleCreateNewProject}
    onUploadClick={handleUploadClick}
    onClearUploadError={() => (uploadError = '')}
  />
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
