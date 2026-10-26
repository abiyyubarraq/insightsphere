<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="min-h-dvh bg-base-100 text-base-content px-4">
  <div class="mx-auto w-full max-w-sm pt-16 pb-16 sm:pt-28">
    <a
      href="/"
      class="inline-block text-lg font-semibold tracking-tight text-base-content mb-12 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      InsightSphere
    </a>
    <div class="space-y-6">
      {@render children()}
    </div>
  </div>
</div>
