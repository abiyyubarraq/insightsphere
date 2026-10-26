<script lang="ts">
  import { Eye, EyeOff } from 'lucide-svelte';

  let {
    id,
    label,
    autocomplete,
    describedby,
    value = $bindable(''),
  }: {
    id: string;
    label: string;
    autocomplete: 'current-password' | 'new-password';
    describedby: string;
    value?: string;
  } = $props();

  let visible = $state(false);
  const toggleLabel = $derived(`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`);
</script>

<label for={id} class="block text-sm font-medium">{label}</label>
<div class="input w-full pr-1">
  <input
    {id}
    type={visible ? 'text' : 'password'}
    {autocomplete}
    bind:value
    aria-describedby={describedby}
    class="grow text-base"
  />
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square"
    aria-label={toggleLabel}
    onclick={() => (visible = !visible)}
  >
    {#if visible}
      <EyeOff class="w-4 h-4" aria-hidden="true" />
    {:else}
      <Eye class="w-4 h-4" aria-hidden="true" />
    {/if}
  </button>
</div>
