<script lang="ts">
  import { goto } from '$app/navigation';
  import { Loader2 } from 'lucide-svelte';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import { AUTH_ERROR_MESSAGES, AuthFormError, isValidEmail } from '$lib/authForms';
  import { requestPasswordReset } from '../../services/supabase';
  import { isAuthenticated } from '../../stores/auth';

  const SENT_MESSAGE = 'If an account exists for that email, we sent a reset link.';
  const SENT_HINT = 'No email after a few minutes? Wait a bit and try again.';

  $effect(() => {
    if ($isAuthenticated) {
      goto('/');
    }
  });

  let email = $state('');
  let error = $state('');
  let sending = $state(false);
  let sent = $state(false);
  let emailInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    emailInput?.focus();
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (sending) return;
    error = '';

    if (!isValidEmail(email)) {
      error = AUTH_ERROR_MESSAGES.invalid_email;
      emailInput?.focus();
      return;
    }

    sending = true;
    try {
      await requestPasswordReset(email.trim());
      sent = true;
    } catch (err) {
      error = err instanceof AuthFormError ? err.message : AUTH_ERROR_MESSAGES.unknown;
    } finally {
      sending = false;
    }
  }
</script>

<svelte:head>
  <title>Reset your password - InsightSphere</title>
</svelte:head>

<AuthShell>
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold">Reset your password</h1>
    <div aria-live="polite" class="space-y-2">
      <p class={['text-base', !sent && 'text-base-content/70']}>
        {sent ? SENT_MESSAGE : 'We will email you a link to choose a new one.'}
      </p>
      {#if sent}
        <p class="text-sm text-base-content/70">{SENT_HINT}</p>
      {/if}
    </div>
  </div>

  {#if !sent}
    <form class="space-y-6" novalidate onsubmit={handleSubmit}>
      <div class="space-y-2">
        <label for="email" class="block text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          autocomplete="email"
          bind:value={email}
          bind:this={emailInput}
          aria-invalid={error === AUTH_ERROR_MESSAGES.invalid_email}
          aria-describedby="email-error"
          class="input w-full text-base"
        />
        <p id="email-error" aria-live="polite" class="min-h-5 text-sm text-error">{error}</p>
      </div>

      <button type="submit" class="btn btn-primary w-full" disabled={sending} aria-busy={sending}>
        {#if sending}
          <Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Sending</span>
        {:else}
          <span>Send reset link</span>
        {/if}
      </button>
    </form>
  {/if}

  <a href="/login" class="link link-hover inline-block text-sm text-base-content/70">
    Back to sign in
  </a>
</AuthShell>
