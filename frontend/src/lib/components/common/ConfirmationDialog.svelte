<script lang="ts">
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
        <div class="text-2xl">{getIcon()}</div>
        <h3 id="dialog-title" class="font-bold text-lg">{title}</h3>
      </div>

      <p id="dialog-message" class="text-base-content/80 mb-6">
        {message}
      </p>

      <div class="modal-action">
        <button class="btn btn-ghost" onclick={handleCancel} disabled={loading}>
          {cancelText}
        </button>
        <button class="btn {confirmClass} gap-2" onclick={handleConfirm} disabled={loading}>
          {#if loading}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
