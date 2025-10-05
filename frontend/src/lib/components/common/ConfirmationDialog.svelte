<script lang="ts">
  export let isOpen = false;
  export let title = 'Confirm Action';
  export let message = 'Are you sure you want to proceed?';
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let confirmClass = 'btn-error';
  export let icon: 'warning' | 'danger' | 'info' = 'warning';
  export let loading = false;

  // Event dispatchers
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{
    confirm: void;
    cancel: void;
  }>();

  const handleConfirm = () => {
    dispatch('confirm');
  };

  const handleCancel = () => {
    dispatch('cancel');
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter' && !loading) {
      handleConfirm();
    }
  };

  // Close dialog when clicking outside
  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  };

  // Get icon component based on type
  const getIcon = () => {
    switch (icon) {
      case 'danger':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      case 'warning':
      default:
        return '⚠️';
    }
  };
</script>

{#if isOpen}
  <div
    class="modal modal-open"
    on:click={handleBackdropClick}
    on:keydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-message"
    tabindex="-1"
  >
    <div class="modal-box">
      <div class="flex items-center gap-3 mb-4">
        <div class="text-2xl">{getIcon()}</div>
        <h3 id="dialog-title" class="font-bold text-lg">{title}</h3>
      </div>

      <p id="dialog-message" class="text-base-content/80 mb-6">
        {message}
      </p>

      <div class="modal-action">
        <button class="btn btn-ghost" on:click={handleCancel} disabled={loading}>
          {cancelText}
        </button>
        <button class="btn {confirmClass} gap-2" on:click={handleConfirm} disabled={loading}>
          {#if loading}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
