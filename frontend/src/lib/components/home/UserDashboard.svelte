<script lang="ts">
  import {
    Upload,
    Search,
    Plus,
    File,
    X,
    Check,
    PackageSearch,
    Loader,
    CircleOff,
    MoreVertical,
  } from 'lucide-svelte';
  import { projects, selectedProject, type ProjectFile } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    createProject,
    deleteDocument,
    getProjectFiles,
    uploadDocument,
    downloadFile,
  } from '../../../services/supabase';
  import { withLoading } from '../../../commons/helpers';
  import { ConfirmationDialog, FileActionsPopover } from '../common';
  import moment from 'moment';

  let newProjectName = '';
  let loading = false;
  let error = '';
  let uploadLoading = false;
  let uploadError = '';
  let fileInput: HTMLInputElement;
  let uploadedFiles: ProjectFile[] = [];
  let removingFileLoading: Record<string, boolean> = {};
  let downloadingFileLoading: Record<string, boolean> = {};
  let showCreateModal = false;

  // Confirmation dialog state
  let showConfirmDialog = false;
  let fileToRemove: { index: number; name: string } | null = null;

  // File processing state
  let processingFileLoading: Record<string, boolean> = {};

  // Reactive store values
  $: currentSelectedProject = $selectedProject;
  $: currentUser = $user;

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
        const p = await createProject(currentUser?.id as string, newProjectName.trim());
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
    fileInput?.click();
  };

  const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file || !currentSelectedProject || !currentUser) return;

    await withLoading(
      async () => {
        await uploadDocument(file, currentSelectedProject.id, currentUser.id);
        await refreshProjectFiles();
        target.value = '';
      },
      (loadingState) => {
        uploadLoading = loadingState;
      },
      (errorMsg) => {
        uploadError = errorMsg;
      }
    );
  };

  const removeFile = async (index: number) => {
    const file = uploadedFiles[index];
    if (!file || !currentSelectedProject || !currentUser) return;

    // Show confirmation dialog
    fileToRemove = { index, name: file.file_name };
    showConfirmDialog = true;
  };

  const confirmRemoveFile = async () => {
    if (!fileToRemove || !currentSelectedProject || !currentUser) return;

    const file = uploadedFiles[fileToRemove.index];
    if (!file) return;

    const fileIndex = fileToRemove.index;

    await withLoading(
      async () => {
        await deleteDocument(file.id, currentSelectedProject.id, currentUser.id);
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
    } catch (error: any) {
      uploadError = error.message || 'Failed to download file';
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
      console.log('Processing file:', fileId);
      // await processFile(fileId);
    } catch (error: any) {
      uploadError = error.message || 'Failed to process file';
    } finally {
      processingFileLoading[fileId] = false;
    }
  };

  const handleFileRetry = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    processingFileLoading[fileId] = true;
    try {
      // TODO: Implement file retry processing API call
      console.log('Retrying file processing:', fileId);
      // await retryFileProcessing(fileId);
    } catch (error: any) {
      uploadError = error.message || 'Failed to retry file processing';
    } finally {
      processingFileLoading[fileId] = false;
    }
  };

  // Helper function to refresh project files
  const refreshProjectFiles = async () => {
    if (currentSelectedProject && currentUser) {
      try {
        const files = await getProjectFiles(currentSelectedProject.id, currentUser.id);
        uploadedFiles = files;
      } catch (e: any) {
        error = e.message;
      }
    }
  };
</script>

{#if $projects.length === 0}
  <!-- No projects -->
  <div class="card w-1/2 backdrop-blur-lg shadow-xl border border-primary/20">
    <div class="card-body space-y-4">
      <h2 class="card-title">Create your first project</h2>
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}
      <input
        type="text"
        bind:value={newProjectName}
        placeholder="Project Name"
        class="input input-bordered w-full"
      />
      <button
        class="btn btn-primary gap-2"
        on:click={() => createNewProject(false)}
        disabled={loading}
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
{:else if !$selectedProject}
  <!-- Select project -->
  <div class="card w-1/2 backdrop-blur-lg shadow-xl border border-primary/20">
    <div class="card-body space-y-4">
      <h2 class="card-title">Select a project</h2>
      <div class="flex flex-row justify-center items-center">
        <select
          class="select select-bordered w-full mr-2"
          bind:value={$selectedProject}
          on:change={refreshProjectFiles}
        >
          <option value={null} disabled selected>Select project</option>
          {#each $projects as p}
            <option value={p}>{p.name}</option>
          {/each}
        </select>
        <div class="tooltip tooltip-right" data-tip="Add new project">
          <button class="btn btn-outline btn-primary gap-2" on:click={handleCreateNewProject}>
            <Plus class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
{:else}
  <!-- Existing dashboard -->
  <div class="w-full max-w-2xl mx-auto">
    <div class="card backdrop-blur-lg shadow-xl border border-primary/20">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">
          Welcome back, {currentUser?.user_metadata?.full_name ||
            currentUser?.email?.split('@')[0] ||
            'User'}! 👋
        </h2>
        <p class="text-base-content/70 mb-6">
          Project: {currentSelectedProject?.name}
        </p>

        <!-- Upload Error -->
        {#if uploadError}
          <div class="alert alert-error mb-4">
            <X class="w-4 h-4" />
            {uploadError}
            <button class="btn btn-sm btn-ghost" on:click={() => (uploadError = '')}>
              <X class="w-4 h-4" />
            </button>
          </div>
        {/if}

        <!-- File Input (Hidden) -->
        <input
          type="file"
          bind:this={fileInput}
          on:change={handleFileUpload}
          accept=".pdf,.doc,.docx,.txt"
          class="hidden"
        />

        <div class="card-actions justify-center gap-4 flex-col sm:flex-row">
          <button
            class="btn btn-primary gap-2 flex-1 sm:flex-none"
            on:click={handleUploadClick}
            disabled={uploadLoading}
          >
            {#if uploadLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <Upload class="w-4 h-4" />
            {/if}
            Upload Document
          </button>
          <button class="btn btn-outline btn-primary gap-2 flex-1 sm:flex-none">
            <Search class="w-4 h-4" />
            Chat With This Brain
          </button>
        </div>

        <!-- Uploaded Files List -->
        {#if uploadedFiles.length > 0}
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-3">Uploaded Documents</h3>
            <div class="space-y-2">
              {#each uploadedFiles.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) as file, index}
                <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                  <div class="flex items-center gap-3">
                    <!-- File Status Icon -->
                    {#if file.status === 'ready'}
                      <div class="tooltip tooltip-right" data-tip="File processed">
                        <Check class="w-4 h-4 text-success" />
                      </div>
                    {:else if file.status === 'processing'}
                      <div class="tooltip tooltip-right" data-tip="File still processing">
                        <Loader class="w-4 h-4 text-warning animate-spin" />
                      </div>
                    {:else if file.status === 'failed'}
                      <div class="tooltip tooltip-right" data-tip="File processing failed">
                        <CircleOff class="w-4 h-4 text-error" />
                      </div>
                    {:else}
                      <div class="tooltip tooltip-right" data-tip="File not processed">
                        <PackageSearch class="w-4 h-4 text-base-content/50" />
                      </div>
                    {/if}

                    <!-- File Info -->
                    <div>
                      <p class="font-medium">{file.file_name}</p>
                      <p class="text-sm text-base-content/70">
                        Uploaded At: {moment(file.created_at).format('DD/MM/YYYY HH:mm')}
                      </p>
                    </div>
                  </div>

                  <!-- Actions Menu -->
                  <FileActionsPopover
                    {file}
                    isDownloading={downloadingFileLoading[file.id]}
                    isRemoving={removingFileLoading[file.id]}
                    isProcessing={processingFileLoading[file.id]}
                    on:download={handleFileDownload}
                    on:remove={handleFileRemove}
                    on:process={handleFileProcess}
                    on:retry={handleFileRetry}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

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
        <label class="label" for="project-name-input">
          <span class="label-text">Project Name</span>
        </label>
        <input
          id="project-name-input"
          type="text"
          bind:value={newProjectName}
          placeholder="Enter project name"
          class="input input-bordered w-full"
          on:keydown={(e) => e.key === 'Enter' && createNewProject(true)}
        />
      </div>

      <div class="modal-action">
        <button
          class="btn btn-ghost"
          on:click={() => {
            showCreateModal = false;
            newProjectName = '';
            clearErrors();
          }}
        >
          Cancel
        </button>
        <button
          class="btn btn-primary gap-2"
          on:click={() => createNewProject(true)}
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
  on:confirm={confirmRemoveFile}
  on:cancel={cancelRemoveFile}
/>
