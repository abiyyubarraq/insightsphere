<script lang="ts">
  import {
    Upload,
    Check,
    PackageSearch,
    Loader,
    CircleOff,
    Folder,
    PanelRightClose,
    X,
  } from 'lucide-svelte';
  import { selectedProject, type ProjectFile } from '../../../stores/project';
  import { FileActionsPopover } from '../common';
  import LoadingState from './LoadingState.svelte';
  import moment from 'moment';

  let {
    rightSidebarOpen = $bindable(),
    uploadedFiles = $bindable(),
    loadingFiles = $bindable(),
    fileFilter = $bindable(),
    filteredFiles = $bindable(),
    downloadingFileLoading = $bindable(),
    removingFileLoading = $bindable(),
    processingFileLoading = $bindable(),
    generatingSummaryLoading = $bindable(),
    uploadLoading = $bindable(),
    onToggleRightSidebar,
    onFileDownload,
    onFileRemove,
    onFileProcess,
    onFileRetry,
    onFileOpenSummary,
    onFileGenerateSummary,
    onUploadClick,
  } = $props<{
    rightSidebarOpen?: boolean;
    uploadedFiles?: ProjectFile[];
    loadingFiles?: boolean;
    fileFilter?: string;
    filteredFiles?: ProjectFile[];
    downloadingFileLoading?: Record<string, boolean>;
    removingFileLoading?: Record<string, boolean>;
    processingFileLoading?: Record<string, boolean>;
    generatingSummaryLoading?: Record<string, boolean>;
    uploadLoading?: boolean;
    onToggleRightSidebar: () => void;
    onFileDownload: (_event: CustomEvent<{ fileId: string }>) => void;
    onFileRemove: (_event: CustomEvent<{ fileId: string }>) => void;
    onFileProcess: (_event: CustomEvent<{ fileId: string }>) => void;
    onFileRetry: (_event: CustomEvent<{ fileId: string }>) => void;
    onFileOpenSummary: (_event: CustomEvent<{ fileId: string }>) => void;
    onFileGenerateSummary: (_event: CustomEvent<{ fileId: string }>) => void;
    onUploadClick: () => void;
  }>();
</script>

<!-- Below md it is an overlay that slides in; from md up it takes its place in the row. -->
{#if $selectedProject}
  <aside
    class="fixed inset-y-0 right-0 z-30 w-80 overflow-hidden md:static md:z-auto md:translate-x-0 motion-safe:transition-[width,translate] motion-safe:duration-200 motion-safe:ease-out {rightSidebarOpen
      ? 'translate-x-0 md:w-80'
      : 'translate-x-full md:w-0'}"
    inert={!rightSidebarOpen}
    aria-label="Documents"
  >
    <div class="flex h-full w-80 flex-col border-l border-base-content/10 bg-base-200">
      <div class="border-b border-base-content/10 px-3 pb-3">
        <div class="flex h-12 items-center justify-between gap-2">
          <h3 class="flex items-center gap-2 px-2 text-sm font-medium">
            <Folder class="w-4 h-4 text-base-content/70" />
            Documents
          </h3>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            aria-label="Close documents panel"
            title="Close documents panel"
            onclick={onToggleRightSidebar}
          >
            <PanelRightClose class="w-5 h-5 text-base-content/70" />
          </button>
        </div>

        <!-- File Filter Input -->
        <div class="form-control">
          <div class="relative">
            <input
              type="text"
              placeholder="Filter files by name..."
              bind:value={fileFilter}
              disabled={uploadedFiles.length === 0 || loadingFiles}
              class="input input-bordered input-sm w-full pr-8"
            />
            {#if fileFilter && fileFilter.trim() !== ''}
              <button
                type="button"
                class="btn btn-ghost btn-xs p-1 h-6 w-6 z-10 absolute right-2 top-1/2 transform -translate-y-1/2"
                onclick={() => (fileFilter = '')}
                title="Clear filter"
              >
                <X class="w-3 h-3" />
              </button>
            {/if}
          </div>
        </div>
      </div>
      {#if loadingFiles}
        <LoadingState />
      {:else}
        <!-- File List with max height and scroll -->
        <div class="flex-1 overflow-hidden flex flex-col">
          <div class="flex-1 overflow-y-auto p-3 min-h-0">
            {#if uploadedFiles.length > 0}
              {#if filteredFiles.length > 0}
                <div class="space-y-2">
                  {#each filteredFiles as file}
                    <div class="card border border-base-content/10 bg-base-100">
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
                            ondownload={onFileDownload}
                            onremove={onFileRemove}
                            onprocess={onFileProcess}
                            onretry={onFileRetry}
                            onopensummary={onFileOpenSummary}
                            ongeneratesummary={onFileGenerateSummary}
                          />
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center py-8">
                  <p class="text-sm text-base-content/70">No files match your filter</p>
                  <p class="text-sm text-base-content/50 mt-1">Try a different search term</p>
                </div>
              {/if}
            {:else}
              <div class="text-center py-8">
                <p class="text-sm text-base-content/70">No documents uploaded yet</p>
              </div>
            {/if}
          </div>

          <!-- Upload Button at Bottom -->
          <div class="p-3 border-t border-base-content/10">
            <button
              class="btn btn-primary btn-sm w-full gap-2"
              onclick={onUploadClick}
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
        </div>
      {/if}
    </div>
  </aside>
{/if}
