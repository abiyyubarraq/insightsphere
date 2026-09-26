<script lang="ts">
  import { CircleAlert, Clock, X } from 'lucide-svelte';

  let {
    message,
    tone = 'error',
    ondismiss,
  }: {
    message: string;
    tone?: 'error' | 'warning';
    ondismiss: () => void;
  } = $props();
</script>

<!-- The theme's base colours are all near black, so the banner sits on neutral
     to stand out, with the tone shown by the edge and the icon only. -->
<div
  role="alert"
  class="alert w-full max-w-2xl mx-auto flex items-start gap-3 py-3 px-4 text-sm
    bg-neutral/70 backdrop-blur-sm shadow-lg border border-base-content/10 border-l-4
    {tone === 'warning' ? 'border-l-warning' : 'border-l-error'}"
>
  {#if tone === 'warning'}
    <Clock class="w-5 h-5 shrink-0 mt-px text-warning" />
  {:else}
    <CircleAlert class="w-5 h-5 shrink-0 mt-px text-error" />
  {/if}
  <span class="flex-1 leading-relaxed text-base-content">{message}</span>
  <button
    class="btn btn-ghost btn-xs btn-circle -my-0.5 -mr-1"
    aria-label="Dismiss"
    onclick={ondismiss}
  >
    <X class="w-4 h-4" />
  </button>
</div>
