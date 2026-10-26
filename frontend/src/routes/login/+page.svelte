<script lang="ts">
  import { signInWithGoogle, signInWithEmail } from '../../services/supabase';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '../../stores/auth';
  import { AUTH_ERROR_MESSAGES, AuthFormError } from '$lib/authForms';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import GoogleButton from '$lib/components/auth/GoogleButton.svelte';
  import PasswordField from '$lib/components/auth/PasswordField.svelte';
  import { Loader2 } from 'lucide-svelte';

  // Redirect if already authenticated
  $effect(() => {
    if ($isAuthenticated) {
      goto('/');
    }
  });

  let email = $state('');
  let password = $state('');
  let loadingLoginWithGoogle = $state(false);
  let loadingLoginWithEmail = $state(false);
  let error = $state('');

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    error = '';

    if (!email.trim() || !password.trim()) {
      error = 'Enter your email and password.';
      return;
    }

    loadingLoginWithEmail = true;

    try {
      await signInWithEmail(email, password);

      // Redirect to dashboard or home page
      goto('/');
    } catch (err) {
      error = err instanceof AuthFormError ? err.message : AUTH_ERROR_MESSAGES.unknown;
    } finally {
      loadingLoginWithEmail = false;
    }
  }

  async function handleGoogleLogin() {
    error = '';
    loadingLoginWithGoogle = true;

    try {
      await signInWithGoogle();
    } catch {
      error = AUTH_ERROR_MESSAGES.unknown;
    } finally {
      loadingLoginWithGoogle = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In - InsightSphere</title>
</svelte:head>

<AuthShell>
  <h1 class="text-2xl font-semibold">Sign in</h1>

  <GoogleButton
    label="Sign in with Google"
    loadingLabel="Signing in"
    loading={loadingLoginWithGoogle}
    onclick={handleGoogleLogin}
  />

  <div class="divider text-sm text-base-content/70">or</div>

  <form class="space-y-6" novalidate onsubmit={handleSubmit}>
    <div class="space-y-2">
      <label for="email" class="block text-sm font-medium">Email</label>
      <input
        id="email"
        type="email"
        autocomplete="email"
        bind:value={email}
        aria-describedby="form-error"
        class="input w-full text-base"
      />
    </div>

    <div class="space-y-2">
      <PasswordField
        id="password"
        label="Password"
        autocomplete="current-password"
        describedby="form-error"
        bind:value={password}
      />
      <a href="/forgot-password" class="link link-hover inline-block text-sm text-base-content/70">
        Forgot your password?
      </a>
      <p id="form-error" aria-live="polite" class="min-h-5 text-sm text-error">{error}</p>
    </div>

    <button
      type="submit"
      class="btn btn-primary w-full"
      disabled={loadingLoginWithEmail}
      aria-busy={loadingLoginWithEmail}
    >
      {#if loadingLoginWithEmail}
        <Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />
        <span>Signing in</span>
      {:else}
        <span>Sign in</span>
      {/if}
    </button>
  </form>

  <p class="text-sm text-base-content/70">
    Don't have an account?
    <a href="/signup" class="link text-base-content">Sign up</a>
  </p>
</AuthShell>
