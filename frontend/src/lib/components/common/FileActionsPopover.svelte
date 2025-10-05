<script lang="ts">
  import {
    MoreVertical,
    Download,
    Trash2,
    Play,
    RotateCcw,
    FileText,
    Sparkles,
  } from 'lucide-svelte';

  let {
    file,
    isDownloading = false,
    isRemoving = false,
    isProcessing = false,
    isGeneratingSummary = false,
    ondownload,
    onremove,
    onprocess,
    onretry,
    onopensummary,
    ongeneratesummary,
  } = $props<{
    file: {
      id: string;
      file_name: string;
      status: string | null;
      is_summary_exist: boolean;
    };
    isDownloading?: boolean;
    isRemoving?: boolean;
    isProcessing?: boolean;
    isGeneratingSummary?: boolean;
    ondownload?: (event: CustomEvent<{ fileId: string }>) => void;
    onremove?: (event: CustomEvent<{ fileId: string }>) => void;
    onprocess?: (event: CustomEvent<{ fileId: string }>) => void;
    onretry?: (event: CustomEvent<{ fileId: string }>) => void;
    onopensummary?: (event: CustomEvent<{ fileId: string }>) => void;
    ongeneratesummary?: (event: CustomEvent<{ fileId: string }>) => void;
  }>();

  const handleDownload = () => {
    ondownload?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };

  const handleRemove = () => {
    onremove?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };

  const handleProcess = () => {
    onprocess?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };

  const handleRetry = () => {
    onretry?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };

  const handleOpenSummary = () => {
    onopensummary?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };

  const handleGenerateSummary = () => {
    ongeneratesummary?.({ detail: { fileId: file.id } } as CustomEvent<{ fileId: string }>);
  };
</script>

<!-- DaisyUI Dropdown -->
<div class="dropdown dropdown-end">
  <div tabindex="0" role="button" class="btn btn-ghost btn-sm">
    <MoreVertical class="w-4 h-4" />
  </div>

  <ul class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
    <!-- Download Action -->
    <li>
      <button class="flex items-center gap-3" onclick={handleDownload} disabled={isDownloading}>
        <Download class="w-4 h-4 text-primary" />
        <span class="text-sm">
          {#if isDownloading}
            Downloading...
          {:else}
            Download File
          {/if}
        </span>
        {#if isDownloading}
          <span class="loading loading-spinner loading-xs ml-auto"></span>
        {/if}
      </button>
    </li>

    <!-- Summary Action -->
    {#if file.is_summary_exist}
      <li>
        <button class="flex items-center gap-3" onclick={handleOpenSummary}>
          <FileText class="w-4 h-4 text-info" />
          <span class="text-sm">Open Summary</span>
        </button>
      </li>
    {:else}
      <li>
        <button
          class="flex items-center gap-3"
          onclick={handleGenerateSummary}
          disabled={isGeneratingSummary}
        >
          <Sparkles class="w-4 h-4 text-secondary" />
          <span class="text-sm">
            {#if isGeneratingSummary}
              Generating...
            {:else}
              Generate Summary
            {/if}
          </span>
          {#if isGeneratingSummary}
            <span class="loading loading-spinner loading-xs ml-auto"></span>
          {/if}
        </button>
      </li>
    {/if}

    <!-- Process/Retry Action -->
    {#if file.status === 'failed'}
      <li>
        <button class="flex items-center gap-3" onclick={handleRetry} disabled={isProcessing}>
          <RotateCcw class="w-4 h-4 text-warning" />
          <span class="text-sm">
            {#if isProcessing}
              Retrying...
            {:else}
              Retry Processing
            {/if}
          </span>
          {#if isProcessing}
            <span class="loading loading-spinner loading-xs ml-auto"></span>
          {/if}
        </button>
      </li>
    {:else if file.status !== 'ready' && file.status !== 'processing'}
      <li>
        <button class="flex items-center gap-3" onclick={handleProcess} disabled={isProcessing}>
          <Play class="w-4 h-4 text-primary" />
          <span class="text-sm">
            {#if isProcessing}
              Processing...
            {:else}
              Start Processing
            {/if}
          </span>
          {#if isProcessing}
            <span class="loading loading-spinner loading-xs ml-auto"></span>
          {/if}
        </button>
      </li>
    {/if}

    <!-- Remove Action -->
    <li>
      <button
        class="flex items-center gap-3 text-error"
        onclick={handleRemove}
        disabled={isRemoving}
      >
        <Trash2 class="w-4 h-4" />
        <span class="text-sm">
          {#if isRemoving}
            Removing...
          {:else}
            Remove File
          {/if}
        </span>
        {#if isRemoving}
          <span class="loading loading-spinner loading-xs ml-auto"></span>
        {/if}
      </button>
    </li>
  </ul>
</div>
