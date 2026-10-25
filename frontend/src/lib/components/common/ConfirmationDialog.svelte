<script lang="ts">
  import { Info, TriangleAlert } from 'lucide-svelte';

  let {
    isOpen = $bindable(),
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmClass = 'btn-error',
    icon = 'warning' as 'warning' | 'danger' | 'info',
    loading = false,
    onconfirm,
    oncancel,
  } = $props<{
    isOpen?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    confirmClass?: string;
    icon?: 'warning' | 'danger' | 'info';
    loading?: boolean;
    onconfirm?: () => void;
    oncancel?: () => void;
  }>();

  const handleConfirm = () => {
    onconfirm?.();
  };

  const handleCancel = () => {
    oncancel?.();
  };

  let cancelButton: HTMLButtonElement | undefined = $state();
  let confirmButton: HTMLButtonElement | undefined = $state();

  // Focus starts on Cancel, the safe choice, and goes back to whatever opened
  // the dialog when it closes.
  $effect(() => {
    if (!isOpen || !cancelButton) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButton.focus();
    return () => opener?.focus();
  });

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Tab') {
      // Keep Tab inside the dialog while it is open.
      const first = cancelButton;
      const last = confirmButton;
      if (event.shiftKey && document.activeElement !== last) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement !== first) {
        event.preventDefault();
        first?.focus();
      }
    } else if (event.key === 'Enter' && !loading && event.target === event.currentTarget) {
      // Only when the dialog itself has focus; on a button, Enter presses that button.
      handleConfirm();
    }
  };

  // Close dialog when clicking outside
  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  };
</script>

{#if isOpen}
  <div
    class="modal modal-open"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-message"
    tabindex="-1"
  >
    <div class="modal-box">
      <div class="flex items-center gap-3 mb-4">
        {#if icon === 'info'}
          <Info class="w-5 h-5 shrink-0 text-info" aria-hidden="true" />
        {:else}
          <TriangleAlert
            class="w-5 h-5 shrink-0 {icon === 'danger' ? 'text-error' : 'text-warning'}"
            aria-hidden="true"
          />
        {/if}
        <h3 id="dialog-title" class="font-bold text-lg">{title}</h3>
      </div>

      <p id="dialog-message" class="text-base-content/80 mb-6">
        {message}
      </p>

      <div class="modal-action">
        <button
          bind:this={cancelButton}
          class="btn btn-ghost"
          onclick={handleCancel}
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          bind:this={confirmButton}
          class="btn {confirmClass} gap-2"
          onclick={handleConfirm}
          disabled={loading}
        >
          {#if loading}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
