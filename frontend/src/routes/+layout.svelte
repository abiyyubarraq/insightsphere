<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';
  import '../stores/auth'; // Initialize auth store

  let { children }: { children: Snippet } = $props();
</script>

<main class="min-h-screen bg-base-100" data-theme="insightsphere">
  {@render children()}
</main>
