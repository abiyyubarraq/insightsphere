<script lang="ts">
  import {
    Upload,
    Check,
    PackageSearch,
    Loader,
    CircleOff,
    Folder,
    PanelLeftOpen,
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
            onclick={onToggleRightSidebar}
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
                            <Loader class="w-4 h-4 text-warning animate-spin flex-shrink-0 mt-1" />
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
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
