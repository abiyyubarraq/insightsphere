<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Loader2 } from 'lucide-svelte';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import PasswordField from '$lib/components/auth/PasswordField.svelte';
  import {
    AUTH_ERROR_MESSAGES,
    AuthFormError,
    MIN_PASSWORD_LENGTH,
    validateNewPassword,
  } from '$lib/authForms';
  import { supabase, updatePassword } from '../../services/supabase';
  import { passwordRecovery } from '../../stores/auth';

  let checking = $state(true);
  let done = $state(false);
  let password = $state('');
  let confirm = $state('');
  let saving = $state(false);
  let error = $state('');
  let passwordInput: HTMLInputElement | undefined = $state();

  // No redirect for signed-in users here: following a reset link signs the user in.
  const view = $derived(
    done ? 'done' : checking ? 'checking' : $passwordRecovery ? 'form' : 'invalid'
  );

  const heading = $derived(
    {
      checking: 'Checking your link',
      invalid: 'This link is invalid or has expired.',
      form: 'Choose a new password',
      done: 'Password changed',
    }[view]
  );

  const intro = $derived(
    {
      checking: '',
      invalid: 'A reset link works once and only for a short time. Ask for a new one.',
      form: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      done: 'Taking you to your projects.',
    }[view]
  );

  onMount(() => {
    // Supabase reads the link and fires PASSWORD_RECOVERY in a setTimeout(0)
    // after the session is ready. Waiting one more task after getSession lets
    // that event land before the page decides the link is invalid.
    supabase.auth
      .getSession()
      .catch(() => undefined)
      .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
      .then(() => {
        checking = false;
      });
  });

  $effect(() => {
    passwordInput?.focus();
  });

  $effect(() => {
    if (!done) return;
    const timer = setTimeout(() => goto('/'), 1500);
    return () => clearTimeout(timer);
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    error = '';

    const problem = validateNewPassword(password, confirm);
    if (problem) {
      error = problem;
      return;
    }

    saving = true;
    try {
      await updatePassword(password);
      passwordRecovery.set(false);
      password = '';
      confirm = '';
      done = true;
    } catch (err) {
      error = err instanceof AuthFormError ? err.message : AUTH_ERROR_MESSAGES.unknown;
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Reset password - InsightSphere</title>
</svelte:head>

<AuthShell>
  <div class="space-y-2">
    <h1 class="flex items-center gap-2 text-2xl font-semibold">
      {#if view === 'checking'}
        <Loader2 class="w-4 h-4 animate-spin text-base-content/70" aria-hidden="true" />
      {/if}
      {heading}
    </h1>
    <p aria-live="polite" class="text-base text-base-content/70">{intro}</p>
  </div>

  {#if view === 'invalid'}
    <a href="/forgot-password" class="btn btn-outline w-full border-base-content/20">
      Request a new link
    </a>
  {:else if view === 'form'}
    <form class="space-y-6" novalidate onsubmit={handleSubmit}>
      <div class="space-y-2">
        <PasswordField
          id="new-password"
          label="New password"
          autocomplete="new-password"
          describedby="password-error"
          invalid={!!error}
          bind:value={password}
          bind:input={passwordInput}
        />
      </div>

      <div class="space-y-2">
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          autocomplete="new-password"
          describedby="password-error"
          invalid={!!error}
          bind:value={confirm}
        />
        <p id="password-error" aria-live="polite" class="min-h-5 text-sm text-error">{error}</p>
      </div>

      <button type="submit" class="btn btn-primary w-full" disabled={saving} aria-busy={saving}>
        {#if saving}
          <Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Saving</span>
        {:else}
          <span>Save new password</span>
        {/if}
      </button>
    </form>
  {/if}
</AuthShell>
