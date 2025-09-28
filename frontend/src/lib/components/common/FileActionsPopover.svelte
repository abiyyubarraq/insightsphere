<script lang="ts">
  import { MoreVertical, Download, Trash2, Play, RotateCcw } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let file: {
    id: string;
    file_name: string;
    status: string | null;
  };
  export let isDownloading = false;
  export let isRemoving = false;
  export let isProcessing = false;

  const dispatch = createEventDispatcher<{
    download: { fileId: string };
    remove: { fileId: string };
    process: { fileId: string };
    retry: { fileId: string };
  }>();

  const handleDownload = () => {
    dispatch('download', { fileId: file.id });
  };

  const handleRemove = () => {
    dispatch('remove', { fileId: file.id });
  };

  const handleProcess = () => {
    dispatch('process', { fileId: file.id });
  };

  const handleRetry = () => {
    dispatch('retry', { fileId: file.id });
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
      <button class="flex items-center gap-3" on:click={handleDownload} disabled={isDownloading}>
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

    <!-- Process/Retry Action -->
    {#if file.status === 'failed'}
      <li>
        <button class="flex items-center gap-3" on:click={handleRetry} disabled={isProcessing}>
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
        <button class="flex items-center gap-3" on:click={handleProcess} disabled={isProcessing}>
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
        on:click={handleRemove}
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
