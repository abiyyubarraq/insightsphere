<script lang="ts">
  import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-svelte';
  import { getFileUrl } from '../../../services/supabase';

  interface Props {
    isOpen: boolean;
    imagePaths: Record<number, string>;
    initialPage?: number;
    fileName?: string;
    onClose: () => void;
  }

  let {
    isOpen = $bindable(false),
    imagePaths,
    initialPage = 1,
    fileName = '',
    onClose,
  } = $props<{
    isOpen: boolean;
    imagePaths: Record<number, string>;
    initialPage?: number;
    fileName?: string;
    onClose: () => void;
  }>();

  // State
  let currentPage = $state(1);
  let zoomLevel = $state(1);
  let modalElement: HTMLDivElement | undefined = $state();
  let imageUrls = $state<Record<number, string>>({});

  // Constants
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;

  // Derived values
  const pageNumbers = $derived(
    Object.keys(imagePaths)
      .map(Number)
      .sort((a, b) => a - b)
  );
  const totalPages = $derived(pageNumbers.length);
  const hasMultiplePages = $derived(totalPages > 1);
  const canGoPrevious = $derived(currentPage > 1);
  const canGoNext = $derived(currentPage < totalPages);
  const currentImageUrl = $derived(
    pageNumbers.length > 0 ? imageUrls[pageNumbers[currentPage - 1]] : null
  );
  const zoomPercentage = $derived(Math.round(zoomLevel * 100));

  // Convert storage paths to URLs when modal opens
  $effect(() => {
    if (isOpen) {
      currentPage = initialPage;
      zoomLevel = 1;

      // Convert all storage paths to URLs
      const convertUrls = async () => {
        const urls: Record<number, string> = {};
        for (const pageNum of pageNumbers) {
          const storagePath = imagePaths[pageNum];
          if (storagePath) {
            try {
              urls[pageNum] = await getFileUrl(storagePath);
            } catch (error) {
              console.error(`Failed to get URL for page ${pageNum}:`, error);
            }
          }
        }
        imageUrls = urls;
      };

      convertUrls();

      // Focus modal for keyboard events
      setTimeout(() => modalElement?.focus(), 0);
    }
  });

  const goToPreviousPage = () => {
    if (canGoPrevious) {
      currentPage -= 1;
    }
  };

  const goToNextPage = () => {
    if (canGoNext) {
      currentPage += 1;
    }
  };

  const handleZoomIn = () => {
    if (zoomLevel < MAX_ZOOM) {
      zoomLevel = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
    }
  };

  const handleZoomOut = () => {
    if (zoomLevel > MIN_ZOOM) {
      zoomLevel = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
    }
  };

  const handleResetZoom = () => {
    zoomLevel = 1;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPreviousPage();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNextPage();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      handleZoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      handleZoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      handleResetZoom();
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
</script>

{#if isOpen}
  <div
    bind:this={modalElement}
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
    role="dialog"
    aria-modal="true"
    aria-labelledby="image-preview-title"
    tabindex="-1"
    onkeydown={handleKeyDown}
    onclick={handleBackdropClick}
  >
    <div
      class="bg-base-100 rounded-xl max-w-[95vw] max-h-[95vh] w-full h-full m-4 p-4 flex flex-col shadow-2xl"
    >
      <!-- Header -->
      <div class="flex justify-between items-center mb-3 flex-shrink-0">
        <div class="flex items-center gap-4">
          <h3
            id="image-preview-title"
            class="font-bold text-lg truncate max-w-[300px]"
            title={fileName}
          >
            {fileName || 'Image Preview'}
          </h3>
          {#if hasMultiplePages}
            <span class="badge badge-neutral">
              Page {currentPage} of {totalPages}
            </span>
          {/if}
        </div>
        <button class="btn btn-sm btn-circle btn-ghost" onclick={onClose}>
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Controls Bar -->
      <div class="flex justify-center items-center gap-2 mb-3 flex-shrink-0">
        <!-- Page Navigation -->
        {#if hasMultiplePages}
          <div class="join">
            <button
              class="btn btn-sm join-item"
              onclick={goToPreviousPage}
              disabled={!canGoPrevious}
              title="Previous page (←)"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <button
              class="btn btn-sm join-item"
              onclick={goToNextPage}
              disabled={!canGoNext}
              title="Next page (→)"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
          <div class="divider divider-horizontal mx-1"></div>
        {/if}

        <!-- Zoom Controls -->
        <div class="join">
          <button
            class="btn btn-sm join-item"
            onclick={handleZoomOut}
            disabled={zoomLevel <= MIN_ZOOM}
            title="Zoom out (-)"
          >
            <ZoomOut class="w-4 h-4" />
          </button>
          <button
            class="btn btn-sm join-item min-w-[70px] pointer-events-none"
            title="Current zoom level"
          >
            {zoomPercentage}%
          </button>
          <button
            class="btn btn-sm join-item"
            onclick={handleZoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            title="Zoom in (+)"
          >
            <ZoomIn class="w-4 h-4" />
          </button>
        </div>
        <button
          class="btn btn-sm btn-ghost"
          onclick={handleResetZoom}
          disabled={zoomLevel === 1}
          title="Reset zoom (0)"
        >
          <RotateCcw class="w-4 h-4" />
        </button>
      </div>

      <!-- Image Container -->
      <div
        class="flex-1 overflow-auto flex justify-center items-start min-h-0 bg-base-300/30 rounded-lg p-4"
      >
        {#if currentImageUrl}
          <img
            src={currentImageUrl}
            alt={fileName ? `${fileName} - Page ${currentPage}` : `Page ${currentPage}`}
            class="object-contain rounded-lg transition-transform duration-200 ease-out max-h-full"
            style="transform: scale({zoomLevel}); transform-origin: top center;"
          />
        {:else}
          <div class="flex items-center justify-center h-full text-base-content/50">
            Loading image...
          </div>
        {/if}
      </div>

      <!-- Keyboard Hints -->
      <div class="text-xs text-base-content/50 text-center mt-2 flex-shrink-0">
        <span class="kbd kbd-xs">←</span> <span class="kbd kbd-xs">→</span> Navigate pages
        <span class="mx-2">|</span>
        <span class="kbd kbd-xs">+</span> <span class="kbd kbd-xs">-</span> Zoom
        <span class="mx-2">|</span>
        <span class="kbd kbd-xs">0</span> Reset
        <span class="mx-2">|</span>
        <span class="kbd kbd-xs">Esc</span> Close
      </div>
    </div>
  </div>
{/if}
