<script lang="ts">
  import { Plus, X, Edit3 } from 'lucide-svelte';
  import {
    projects,
    selectedProject,
    type Project,
    type ProjectFile,
  } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import {
    createProject,
    updateProject,
    deleteProject,
    uploadDocument,
    deleteDocument,
    getProjectFiles,
    getProjectFileSummary,
    downloadFile,
    processDocument,
    generateDocumentSummary,
  } from '../../../services/supabase';
  import { withLoading } from '../../../commons/helpers';
  import { ConfirmationDialog, SummaryMarkdown } from '../common';
  import LeftSidebar from './LeftSidebar.svelte';
  import RightSidebar from './RightSidebar.svelte';
  import MainContent from './MainContent.svelte';
  import FileLibraryModal from './FileLibraryModal.svelte';

  // State management
  let newProjectName = $state('');
  let loading = $state(false);
  let error = $state('');
  let uploadLoading = $state(false);
  let errorNotif = $state('');
  let successNotif = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let uploadedFiles: ProjectFile[] = $state([]);
  let removingFileLoading: Record<string, boolean> = $state({});
  let downloadingFileLoading: Record<string, boolean> = $state({});
  let showCreateModal = $state(false);
  let loadingFiles = $state(false);

  // Confirmation dialog state
  let showConfirmDialog = $state(false);
  let fileToRemove: { index: number; name: string } | null = $state(null);

  // Project management state
  let showRenameModal = $state(false);
  let showDeleteConfirmDialog = $state(false);
  let projectToRename: Project | null = $state(null);
  let projectToDelete: Project | null = $state(null);
  let renameProjectName = $state('');
  let renameLoading = $state(false);
  let deleteLoading = $state(false);

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
  let showFileLibraryModal = $state(false);

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

  // Helper function to clear notifications
  const clearErrors = () => {
    error = '';
    errorNotif = '';
  };

  const clearSuccessNotif = () => {
    successNotif = '';
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

  const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files || files.length === 0) return;
    if (!$selectedProject || !$user) {
      errorNotif = 'Please select a project first';
      return;
    }

    // Validate all files first
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const maxSize = 100 * 1024 * 1024; // 100MB in bytes

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        errorNotif = `File "${file.name}" is not a valid type (PDF, DOC, DOCX, or TXT)`;
        return;
      }

      // Validate file size
      if (file.size > maxSize) {
        errorNotif = `File "${file.name}" is too large (must be less than 100MB)`;
        return;
      }
    }

    await withLoading(
      async () => {
        // Upload all files sequentially
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          await uploadDocument(file, $selectedProject.id, $user.id);
        }

        // Refresh the files list to show the new files
        const updatedFiles = await getProjectFiles($selectedProject.id, $user.id);
        uploadedFiles = updatedFiles;

        // Clear the file input
        if (fileInput) {
          fileInput.value = '';
        }

        return { success: true, uploadedCount: files.length };
      },
      (loadingState) => {
        uploadLoading = loadingState;
      },
      (errorMsg) => {
        errorNotif = errorMsg;
      }
    );
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
        errorNotif = errorMsg;
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
      errorNotif = error instanceof Error ? error.message : 'Failed to download file';
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
    const file = uploadedFiles.find((f) => f.id === fileId);

    if (!file || !$selectedProject || !$user) {
      errorNotif = 'File or project not found';
      return;
    }

    await withLoading(
      async () => {
        const result = await processDocument($selectedProject.id, file.id, file.storage_path);

        if (result.success) {
          // Refresh the files list to show updated status
          const updatedFiles = await getProjectFiles($selectedProject.id, $user.id);
          uploadedFiles = updatedFiles;
        } else {
          throw new Error(result.error || 'Processing failed');
        }
      },
      (loadingState) => {
        processingFileLoading[fileId] = loadingState;
      },
      (errorMsg) => {
        errorNotif = errorMsg;
      }
    );
  };

  const handleFileRetry = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    const file = uploadedFiles.find((f) => f.id === fileId);

    if (!file || !$selectedProject || !$user) {
      errorNotif = 'File or project not found';
      return;
    }

    await withLoading(
      async () => {
        const result = await processDocument($selectedProject.id, file.id, file.storage_path);

        if (result.success) {
          // Refresh the files list to show updated status
          const updatedFiles = await getProjectFiles($selectedProject.id, $user.id);
          uploadedFiles = updatedFiles;

          console.log(
            `Document retry processed successfully: ${result.chunks_created} chunks created in ${result.processing_time_ms}ms`
          );
        } else {
          throw new Error(result.error || 'Retry processing failed');
        }
      },
      (loadingState) => {
        processingFileLoading[fileId] = loadingState;
      },
      (errorMsg) => {
        errorNotif = errorMsg;
      }
    );
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
        errorNotif = 'Summary not found for this file';
      }
    } catch (error) {
      errorNotif = error instanceof Error ? error.message : 'Failed to load summary';
    }
  };

  const handleFileGenerateSummary = async (event: CustomEvent<{ fileId: string }>) => {
    const fileId = event.detail.fileId;
    const project = $selectedProject;

    if (!project) {
      errorNotif = 'No project selected';
      return;
    }

    generatingSummaryLoading[fileId] = true;
    errorNotif = '';

    try {
      // Find the file in the uploaded files
      const file = uploadedFiles.find((f) => f.id === fileId);
      if (!file) {
        throw new Error('File not found');
      }

      if (!file.storage_path) {
        throw new Error('File storage path not available');
      }

      // Call the generate summary API
      const result = await generateDocumentSummary(project.id, file.id, file.storage_path);

      if (result.success) {
        // Refresh the files to get the updated summary
        await refreshProjectFiles(project);

        // Show success message
        successNotif = `Summary generated successfully for ${file.file_name}`;
        setTimeout(() => {
          successNotif = '';
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to generate summary');
      }
    } catch (error) {
      errorNotif = error instanceof Error ? error.message : 'Failed to generate summary';
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
    } else if (navItem === 'file-library') {
      showFileLibraryModal = true;
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

  // Project management handlers
  const handleRenameProject = (project: Project) => {
    projectToRename = project;
    renameProjectName = project.name;
    showRenameModal = true;
  };

  const handleDeleteProject = (project: Project) => {
    projectToDelete = project;
    showDeleteConfirmDialog = true;
  };

  const confirmRenameProject = async () => {
    if (!projectToRename || !renameProjectName.trim() || !$user) return;

    const project = projectToRename; // Store reference to avoid null check issues
    await withLoading(
      async () => {
        const updatedProject = await updateProject(project.id, $user.id, renameProjectName.trim());

        // Update the projects list
        projects.update((arr) => arr.map((p) => (p.id === updatedProject.id ? updatedProject : p)));

        // Update selected project if it's the one being renamed
        if ($selectedProject?.id === updatedProject.id) {
          selectedProject.set(updatedProject);
        }

        // Close modal and reset state
        showRenameModal = false;
        projectToRename = null;
        renameProjectName = '';
      },
      (loadingState) => {
        renameLoading = loadingState;
      },
      (errorMsg) => {
        error = errorMsg;
      }
    );
  };

  const cancelRenameProject = () => {
    showRenameModal = false;
    projectToRename = null;
    renameProjectName = '';
    clearErrors();
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || !$user) return;

    const project = projectToDelete; // Store reference to avoid null check issues
    await withLoading(
      async () => {
        await deleteProject(project.id, $user.id);

        // Remove from projects list
        projects.update((arr) => arr.filter((p) => p.id !== project.id));

        // Clear selected project if it's the one being deleted
        if ($selectedProject?.id === project.id) {
          selectedProject.set(null);
          uploadedFiles = [];
        }

        // Close dialog and reset state
        showDeleteConfirmDialog = false;
        projectToDelete = null;
      },
      (loadingState) => {
        deleteLoading = loadingState;
      },
      (errorMsg) => {
        error = errorMsg;
      }
    );
  };

  const cancelDeleteProject = () => {
    showDeleteConfirmDialog = false;
    projectToDelete = null;
    clearErrors();
  };
</script>

<!-- Hidden File Input -->
<input
  type="file"
  bind:this={fileInput}
  onchange={handleFileUpload}
  accept=".pdf,.doc,.docx,.txt"
  multiple
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
    onRenameProject={handleRenameProject}
    onDeleteProject={handleDeleteProject}
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
    bind:errorNotif
    bind:successNotif
    bind:uploadLoading
    bind:fileFilter
    onToggleLeftSidebar={toggleLeftSidebar}
    onToggleRightSidebar={toggleRightSidebar}
    onCreateNewProject={handleCreateNewProject}
    onClearErrorNotif={() => (errorNotif = '')}
    onClearSuccessNotif={clearSuccessNotif}
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
        <div class="text-sm leading-relaxed">
          <SummaryMarkdown content={currentSummary} />
        </div>
      </div>

      <div class="modal-action">
        <button class="btn btn-primary" onclick={closeSummaryModal}> Close </button>
      </div>
    </div>
  </div>
{/if}

<!-- Rename Project Modal -->
{#if showRenameModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Rename Project</h3>

      {#if error}
        <div class="alert alert-error mb-4">
          <X class="w-4 h-4" />
          {error}
        </div>
      {/if}

      <div class="form-control">
        <input
          id="rename-project-input"
          type="text"
          bind:value={renameProjectName}
          placeholder="Enter new project name"
          class="input input-bordered w-full"
          onkeydown={(e) => e.key === 'Enter' && confirmRenameProject()}
        />
      </div>

      <div class="modal-action">
        <button class="btn btn-ghost" onclick={cancelRenameProject}> Cancel </button>
        <button
          class="btn btn-primary gap-2"
          onclick={confirmRenameProject}
          disabled={renameLoading || !renameProjectName.trim()}
        >
          {#if renameLoading}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <Edit3 class="w-4 h-4" />
          {/if}
          Rename Project
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Project Confirmation Dialog -->
<ConfirmationDialog
  bind:isOpen={showDeleteConfirmDialog}
  title="Delete Project"
  message="Are you sure you want to delete '{projectToDelete?.name}'? This will permanently delete the project and all its files. This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  confirmClass="btn-error"
  icon="danger"
  loading={deleteLoading}
  onconfirm={confirmDeleteProject}
  oncancel={cancelDeleteProject}
/>

<!-- File Library Modal -->
<FileLibraryModal bind:isOpen={showFileLibraryModal} />
