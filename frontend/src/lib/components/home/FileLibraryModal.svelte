<script lang="ts">
  import { X, Search, FileText, Loader, ChevronDown, Send } from 'lucide-svelte';
  import { projects } from '../../../stores/project';
  import { searchFiles, getFileUrl } from '../../../services/supabase';
  import type { FileLibraryItem } from '../../../../../shared/types/index';

  let { isOpen = $bindable(false) } = $props<{
    isOpen?: boolean;
  }>();

  // State management
  let files: FileLibraryItem[] = $state([]);
  let loading = $state(false);
  let error = $state('');
  let searchQuery = $state('');
  let searchMode: 'filename' | 'semantic' | 'typesense' = $state('filename');
  let selectedProjects: string[] = $state([]);
  let offset = $state(0);
  let hasMore = $state(false);
  let firstLoad = $state(false);
  let isHighlightFilename = $state(false);
  let isImageModalOpen = $state(false);
  let currentImageUrl = $state<string | null>(null);

  // Computed values for project filter
  const isAllProjectsSelected = $derived(
    selectedProjects.length === $projects.length && $projects.length > 0
  );
  const selectedCountText = $derived(
    selectedProjects.length === 0
      ? 'All Projects'
      : selectedProjects.length === $projects.length
        ? 'All Projects'
        : `${selectedProjects.length} project${selectedProjects.length > 1 ? 's' : ''} selected`
  );

  $effect(() => {
    if (isOpen && !firstLoad) {
      resetAndLoadFiles();
      firstLoad = true;
    }
  });

  const resetAndLoadFiles = async () => {
    offset = 0;
    files = [];
    await loadFiles(true);
  };

  const loadFiles = async (reset = false) => {
    if (!isOpen) return;
    try {
      loading = true;
      error = '';

      const currentOffset = reset ? 0 : offset;
      const result = await searchFiles({
        limit: 100,
        offset: currentOffset,
        projectIds: selectedProjects.length > 0 ? selectedProjects : undefined,
        searchQuery: searchQuery.trim() || undefined,
        searchMode: searchQuery.trim() ? searchMode : undefined,
      });

      if (reset) {
        files = result.files;
      } else {
        files = [...files, ...result.files];
      }

      hasMore = result.hasMore;
      offset = currentOffset + result.files.length;

      if (searchQuery.trim() && searchMode === 'filename') {
        isHighlightFilename = true;
      } else {
        isHighlightFilename = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load files';
    } finally {
      loading = false;
    }
  };

  const handleSearchInput = (value: string) => {
    searchQuery = value;
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      resetAndLoadFiles();
    }
  };

  const handleClearSearch = () => {
    searchQuery = '';
    resetAndLoadFiles();
  };

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  };

  const handleSearchModeChange = (mode: 'filename' | 'semantic' | 'typesense') => {
    searchMode = mode;
    if (searchQuery.trim()) {
      resetAndLoadFiles();
    }
  };

  const handleProjectToggle = (projectId: string, e?: Event) => {
    e?.stopPropagation();
    if (selectedProjects.includes(projectId)) {
      selectedProjects = selectedProjects.filter((id) => id !== projectId);
    } else {
      selectedProjects = [...selectedProjects, projectId];
    }

    // Disable semantic search if no projects selected
    if (selectedProjects.length === 0 && searchMode === 'semantic') {
      searchMode = 'filename';
    }

    resetAndLoadFiles();
  };

  const handleSelectAllProjects = (e?: Event) => {
    e?.stopPropagation();
    if (selectedProjects.length === $projects.length && $projects.length > 0) {
      selectedProjects = [];
    } else {
      selectedProjects = $projects.map((p) => p.id);
    }
    resetAndLoadFiles();
  };

  const handleLoadMore = () => {
    loadFiles(false);
  };

  const handleCopyFileName = async (file: FileLibraryItem, e?: MouseEvent) => {
    if (!e) return;
    if (e?.ctrlKey || e?.metaKey) {
      e.preventDefault();
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(file.name);
      } catch (err) {
        error = 'Failed to copy file name to clipboard';
      }
    }
  };

  const handleFileClick = async (file: FileLibraryItem) => {
    try {
      const url = await getFileUrl(file.storage_path);
      window.open(url, '_blank');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to open file';
    }
  };

  const handleImageClick = (file: FileLibraryItem, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (file.firstImageUrl) {
      currentImageUrl = file.firstImageUrl;
      isImageModalOpen = true;
    }
  };

  const closeImageModal = () => {
    isImageModalOpen = false;
    currentImageUrl = null;
  };

  const handleClose = () => {
    isOpen = false;
    files = [];
    searchQuery = '';
    selectedProjects = [];
    offset = 0;
    hasMore = false;
    error = '';
    searchMode = 'filename';
    firstLoad = false;
    isHighlightFilename = false;
  };

  // Highlight matching text in filename for filename search mode
  const highlightFilename = (
    filename: string,
    query: string
  ): Array<{ text: string; highlight: boolean }> => {
    if (!query.trim() || searchMode !== 'filename' || !isHighlightFilename) {
      return [{ text: filename, highlight: false }];
    }

    const segments: Array<{ text: string; highlight: boolean }> = [];
    const lowerFilename = filename.toLowerCase();
    const lowerQuery = query.trim().toLowerCase();
    let lastIndex = 0;

    let index = lowerFilename.indexOf(lowerQuery, lastIndex);
    while (index !== -1) {
      // Add text before the match
      if (index > lastIndex) {
        segments.push({ text: filename.slice(lastIndex, index), highlight: false });
      }
      // Add the highlighted match
      segments.push({ text: filename.slice(index, index + query.length), highlight: true });
      lastIndex = index + query.length;
      index = lowerFilename.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining text after the last match
    if (lastIndex < filename.length) {
      segments.push({ text: filename.slice(lastIndex), highlight: false });
    }

    return segments.length > 0 ? segments : [{ text: filename, highlight: false }];
  };
</script>

{#if isOpen}
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="file-library-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    }}
  >
    <div class="modal-box min-w-[90vw] min-h-[90vh] bg-base-100/95">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <h3 id="file-library-title" class="font-bold text-2xl">File Library</h3>
        <button class="btn btn-sm btn-circle btn-ghost" onclick={handleClose}>
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Error Display -->
      {#if error}
        <div class="alert alert-error mb-4">
          <X class="w-4 h-4" />
          {error}
          <button class="btn btn-sm btn-ghost" onclick={() => (error = '')}>
            <X class="w-4 h-4" />
          </button>
        </div>
      {/if}

      <!-- Search Section -->
      <div class="mb-6 space-y-4">
        <!-- Search Input -->
        <div class="form-control">
          <div class="relative">
            <Search class="absolute left-3 top-1/4 w-5 h-5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search files..."
              bind:value={searchQuery}
              oninput={(e) => handleSearchInput((e.target as HTMLInputElement).value)}
              onkeydown={handleSearchKeyDown}
              class="input input-bordered w-full pl-10 pr-20 bg-transparent"
              disabled={loading}
            />
            <!-- Action Icons on the right -->
            <div class="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2">
              {#if searchQuery.trim()}
                <button
                  type="button"
                  class="btn btn-ghost btn-xs p-1 h-6 w-6 hover:bg-base-300"
                  onclick={handleClearSearch}
                  disabled={loading}
                  title="Clear search"
                >
                  <X class="w-4 h-4" />
                </button>
              {/if}
              <button
                type="button"
                class="btn btn-primary btn-xs p-1 h-6 w-6"
                onclick={handleSearchSubmit}
                disabled={loading || !searchQuery.trim()}
                title="Search"
              >
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Search Mode Selector -->
        <div class="flex gap-2">
          <button
            class="btn btn-sm {searchMode === 'filename' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => handleSearchModeChange('filename')}
            disabled={loading}
          >
            Filename
          </button>
          <button
            class="btn btn-sm {searchMode === 'semantic' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => handleSearchModeChange('semantic')}
            disabled={loading}
          >
            Semantic
          </button>
          <button
            class="btn btn-sm {searchMode === 'typesense' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => handleSearchModeChange('typesense')}
            disabled={loading}
          >
            Typesense
          </button>
        </div>

        <!-- Project Filter - DaisyUI Dropdown Multi-Select -->
        <div class="dropdown dropdown-bottom w-1/6">
          <button type="button" tabindex="0" class="btn btn-outline w-full justify-between">
            <span>{selectedCountText}</span>
            <ChevronDown class="w-4 h-4" />
          </button>
          <ul
            class="dropdown-content menu bg-base-200 rounded-box z-[1] w-full p-2 shadow-lg border border-base-300 max-h-60 overflow-y-auto"
          >
            <!-- Select All Option -->
            <li>
              <label class="label cursor-pointer justify-start gap-3 py-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary checkbox-sm"
                  checked={isAllProjectsSelected}
                  onchange={(e) => handleSelectAllProjects(e)}
                  onclick={(e) => e.stopPropagation()}
                />
                <span class="label-text font-semibold">All Projects</span>
              </label>
            </li>
            <li><hr class="my-1 border-base-300" /></li>
            <!-- Individual Projects -->
            {#each $projects as project}
              <li>
                <label
                  class="label cursor-pointer justify-start gap-3 py-2 hover:bg-base-300/50 rounded"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary checkbox-sm"
                    checked={selectedProjects.includes(project.id)}
                    onchange={(e) => handleProjectToggle(project.id, e)}
                    onclick={(e) => e.stopPropagation()}
                  />
                  <span class="label-text">{project.name}</span>
                </label>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <!-- Files Gallery -->
      <div class="flex-1 overflow-y-auto min-h-0">
        {#if loading && files.length === 0}
          <div class="flex justify-center items-center h-64">
            <Loader class="w-8 h-8 animate-spin text-primary" />
          </div>
        {:else if files.length === 0}
          <div class="flex flex-col items-center justify-center h-64 text-center">
            <FileText class="w-16 h-16 text-base-content/30 mb-4" />
            <p class="text-lg font-semibold">No files found</p>
            <p class="text-base-content/70">
              {searchQuery.trim()
                ? 'Try adjusting your search query or filters'
                : 'Upload files to your projects to see them here'}
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-5 gap-4">
            {#each files as file (file.fileId)}
              <div
                class="card bg-base-200/50 hover:bg-base-200 transition-all duration-300 cursor-pointer hover:scale-90 hover:ring-1 hover:ring-primary/50"
                onclick={() => handleFileClick(file)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleFileClick(file);
                  }
                }}
              >
                <div class="card-body p-4">
                  <!-- Thumbnail Placeholder -->
                  <div
                    class="w-full aspect-square bg-base-300/50 rounded-lg flex items-center justify-center mb-2"
                  >
                    {#if file.imagePaths && Object.keys(file.imagePaths).length > 0}
                      <button
                        type="button"
                        class="w-full h-[90%] cursor-zoom-in hover:opacity-80 transition-opacity"
                        onclick={(e) => handleImageClick(file, e)}
                      >
                        <img
                          src={file.firstImageUrl}
                          alt={file.name}
                          class="w-full h-full object-cover pointer-events-none"
                        />
                      </button>
                    {:else}
                      <FileText class="w-16 h-16 text-base-content/40" />
                    {/if}
                  </div>

                  <!-- File Name -->
                  <div
                    onclick={(e) => handleCopyFileName(file, e)}
                    role="button"
                    tabindex={null}
                    onkeydown={() => {
                      handleCopyFileName(file);
                    }}
                  >
                    <h4 class="font-semibold text-sm break-words w-full" title={file.name}>
                      {#each highlightFilename(file.name, searchQuery) as segment}
                        {#if segment.highlight}
                          <mark class="bg-primary text-primary-content px-0.5 rounded"
                            >{segment.text}</mark
                          >
                        {:else}
                          {segment.text}
                        {/if}
                      {/each}
                    </h4>
                  </div>
                  <!-- Created Date -->
                  <p class="text-xs text-base-content/60">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </p>

                  <!-- Project Badge -->
                  {#if file.projectName}
                    <div class="badge badge-primary badge-sm mt-1 truncate">
                      <span title={`Project: ${file.projectName}`}>{file.projectName}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <!-- Load More Button -->
          {#if hasMore && !loading}
            <div class="flex justify-center mt-6">
              <button class="btn btn-primary" onclick={handleLoadMore} disabled={loading}>
                {#if loading}
                  <Loader class="w-4 h-4 animate-spin" />
                {/if}
                Load More
              </button>
            </div>
          {/if}

          {#if loading && files.length > 0}
            <div class="flex justify-center mt-4">
              <Loader class="w-6 h-6 animate-spin text-primary" />
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Image Preview Modal -->
{#if isImageModalOpen && currentImageUrl}
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="image-preview-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeImageModal();
      }
    }}
    onclick={(e) => {
      // Close when clicking on backdrop
      if (e.target === e.currentTarget) {
        closeImageModal();
      }
    }}
  >
    <div class="modal-box max-w-[95vw] max-h-[95vh] bg-base-100/98 p-4">
      <div class="flex justify-between items-center mb-4">
        <h3 id="image-preview-title" class="font-bold text-xl">Image Preview</h3>
        <button class="btn btn-sm btn-circle btn-ghost" onclick={closeImageModal}>
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="flex justify-center items-center overflow-auto max-h-[85vh]">
        <img
          src={currentImageUrl}
          alt="Preview"
          class="max-w-full max-h-[85vh] object-contain rounded-lg"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  /* Additional styles if needed */
</style>
