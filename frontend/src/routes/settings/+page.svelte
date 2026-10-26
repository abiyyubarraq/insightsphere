<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowLeft, Check, CircleAlert, ExternalLink, Eye, EyeOff, Key } from 'lucide-svelte';
  import { ConfirmationDialog } from '$lib/components/common';
  import {
    describeKeyError,
    formatSavedDate,
    keyStatusLine,
    NOT_ENABLED,
    savedKeyMessage,
  } from '$lib/apiKeySettings';
  import {
    getApiKeyStatus,
    removeApiKey,
    saveApiKey,
    type ApiKeyStatus,
  } from '../../services/supabase';

  const NO_KEY: ApiKeyStatus = { hasKey: false, hint: null, provider: null, updatedAt: null };

  let status = $state<ApiKeyStatus | null>(null);
  let loadError = $state('');
  let notEnabled = $state(false);

  let keyInput = $state('');
  let showKey = $state(false);
  let saving = $state(false);
  let fieldError = $state('');
  let replacing = $state(false);
  let notice = $state('');

  let confirmOpen = $state(false);
  let removing = $state(false);
  let removeError = $state('');

  let inputEl: HTMLInputElement | undefined = $state();
  let replaceButton: HTMLButtonElement | undefined = $state();

  const showForm = $derived(status !== null && (!status.hasKey || replacing));
  const savedDate = $derived(formatSavedDate(status?.updatedAt ?? null));

  async function loadStatus() {
    loadError = '';
    try {
      status = await getApiKeyStatus();
    } catch (error) {
      const view = describeKeyError(error);
      if (view.disabled) {
        notEnabled = true;
        status = NO_KEY;
      } else {
        loadError = view.message;
      }
    }
  }

  onMount(loadStatus);

  async function handleSave(event: SubmitEvent) {
    event.preventDefault();
    const key = keyInput.trim();
    if (!key || saving || notEnabled) return;
    saving = true;
    fieldError = '';
    notice = '';
    try {
      const saved = await saveApiKey(key);
      keyInput = '';
      showKey = false;
      replacing = false;
      status = saved;
      notice = saved.hint ? savedKeyMessage(saved.hint) : 'Key saved';
      await tick();
      replaceButton?.focus();
    } catch (error) {
      const view = describeKeyError(error);
      // The not-enabled sentence already shows above the form.
      if (view.disabled) notEnabled = true;
      else fieldError = view.message;
    } finally {
      saving = false;
    }
  }

  async function startReplace() {
    replacing = true;
    notice = '';
    removeError = '';
    await tick();
    inputEl?.focus();
  }

  async function cancelReplace() {
    replacing = false;
    keyInput = '';
    showKey = false;
    fieldError = '';
    await tick();
    replaceButton?.focus();
  }

  async function handleRemove() {
    removing = true;
    removeError = '';
    notice = '';
    try {
      status = await removeApiKey();
      confirmOpen = false;
      notice = 'Key removed';
      await tick();
      inputEl?.focus();
    } catch (error) {
      confirmOpen = false;
      removeError = describeKeyError(error).message;
    } finally {
      removing = false;
    }
  }
</script>

<svelte:head>
  <title>Settings - InsightSphere</title>
</svelte:head>

<div class="min-h-dvh bg-base-100 text-base-content">
  <div class="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
    <a
      href="/"
      class="inline-flex items-center gap-2 rounded-field text-sm text-base-content/70 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <ArrowLeft class="w-4 h-4" aria-hidden="true" />
      Back to dashboard
    </a>

    <h1 class="mt-8 text-2xl font-semibold">Settings</h1>

    <section
      aria-labelledby="openai-key-title"
      class="mt-8 space-y-6 border-t border-base-content/10 pt-8"
    >
      <div class="space-y-2">
        <h2 id="openai-key-title" class="text-base font-medium">OpenAI key</h2>
        <p class="max-w-prose text-sm leading-relaxed text-base-content/70">
          With your own key there are no daily limits, and OpenAI bills you for what you use. The
          key is stored encrypted, and only its last 4 characters are ever shown.
        </p>
      </div>

      {#if status === null && !loadError}
        <p class="flex items-center gap-2 text-sm text-base-content/70">
          <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
          Loading your key settings
        </p>
      {:else if loadError}
        <div class="flex flex-wrap items-center gap-2">
          <p role="alert" class="flex items-center gap-2 text-sm text-error">
            <CircleAlert class="w-4 h-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
          <button type="button" class="btn btn-ghost btn-sm" onclick={loadStatus}>Try again</button>
        </div>
      {:else if status}
        <p class="flex items-center gap-2 text-sm">
          <Key class="w-4 h-4 shrink-0 text-base-content/70" aria-hidden="true" />
          {keyStatusLine(status.hasKey)}
        </p>

        <p aria-live="polite" class="text-sm empty:hidden">
          {#if notice}
            <span class="inline-flex items-center gap-2">
              <Check class="w-4 h-4 shrink-0 text-success" aria-hidden="true" />
              {notice}
            </span>
          {/if}
        </p>

        {#if status.hasKey}
          <div
            class="flex flex-wrap items-center justify-between gap-4 rounded-box border border-base-content/10 px-4 py-3"
          >
            <div class="min-w-0 space-y-1">
              <p class="font-mono text-sm">{status.hint}</p>
              {#if savedDate}
                <p class="text-sm text-base-content/70">Saved {savedDate}</p>
              {/if}
            </div>
            {#if !replacing}
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn btn-ghost border-base-content/15"
                  bind:this={replaceButton}
                  onclick={startReplace}
                  disabled={notEnabled}
                >
                  Replace
                </button>
                <button
                  type="button"
                  class="btn btn-ghost text-error"
                  onclick={() => (confirmOpen = true)}
                  disabled={notEnabled}
                >
                  Remove
                </button>
              </div>
            {/if}
          </div>
          {#if removeError}
            <p role="alert" class="text-sm text-error">{removeError}</p>
          {/if}
        {/if}

        {#if showForm}
          {#if notEnabled}
            <p class="flex items-center gap-2 text-sm text-base-content/70">
              <CircleAlert class="w-4 h-4 shrink-0 text-warning" aria-hidden="true" />
              {NOT_ENABLED}
            </p>
          {/if}

          <form class="space-y-6" novalidate onsubmit={handleSave}>
            <fieldset class="space-y-2" disabled={notEnabled}>
              <label for="openai-key" class="block text-sm font-medium">
                {replacing ? 'New API key' : 'API key'}
              </label>
              <div class={['input w-full', fieldError && 'input-error']}>
                <input
                  id="openai-key"
                  type={showKey ? 'text' : 'password'}
                  class="grow text-base"
                  placeholder="sk-..."
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  bind:value={keyInput}
                  bind:this={inputEl}
                  disabled={saving || notEnabled}
                  aria-invalid={fieldError ? 'true' : undefined}
                  aria-describedby={fieldError ? 'openai-key-error' : undefined}
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square -mr-1"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  aria-pressed={showKey}
                  title={showKey ? 'Hide key' : 'Show key'}
                  onclick={() => (showKey = !showKey)}
                >
                  {#if showKey}
                    <EyeOff class="w-4 h-4" aria-hidden="true" />
                  {:else}
                    <Eye class="w-4 h-4" aria-hidden="true" />
                  {/if}
                </button>
              </div>
              {#if fieldError}
                <p id="openai-key-error" role="alert" class="text-sm text-error">{fieldError}</p>
              {/if}
            </fieldset>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                class="btn btn-primary"
                disabled={!keyInput.trim() || saving || notEnabled}
                aria-busy={saving}
              >
                {#if saving}
                  <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
                  Checking key
                {:else}
                  Save key
                {/if}
              </button>
              {#if replacing}
                <button
                  type="button"
                  class="btn btn-ghost"
                  onclick={cancelReplace}
                  disabled={saving}
                >
                  Cancel
                </button>
              {/if}
            </div>
          </form>

          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-field text-sm text-base-content/70 underline-offset-4 hover:text-base-content hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Create a key on the OpenAI dashboard
            <ExternalLink class="w-4 h-4" aria-hidden="true" />
            <span class="sr-only">(opens in a new tab)</span>
          </a>
        {/if}
      {/if}
    </section>
  </div>
</div>

<ConfirmationDialog
  bind:isOpen={confirmOpen}
  title="Remove your OpenAI key?"
  message="Answers go back to the shared key, and daily limits apply again. You can add a key again at any time."
  confirmText="Remove key"
  confirmClass="btn-error"
  icon="danger"
  loading={removing}
  onconfirm={handleRemove}
  oncancel={() => (confirmOpen = false)}
/>
