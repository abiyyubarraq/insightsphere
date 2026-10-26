<script lang="ts">
  import { signInWithGoogle, signUpWithEmail } from '../../services/supabase';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '../../stores/auth';
  import {
    AUTH_ERROR_MESSAGES,
    AuthFormError,
    isValidEmail,
    validateNewPassword,
  } from '$lib/authForms';
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

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let loadingSignupWithEmail = $state(false);
  let loadingSignupWithGoogle = $state(false);
  let error = $state('');
  let info = $state('');

  function validate(): string | null {
    if (!name.trim()) return 'Enter your name.';
    if (!isValidEmail(email)) return AUTH_ERROR_MESSAGES.invalid_email;
    return validateNewPassword(password, confirmPassword);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    error = '';

    const problem = validate();
    if (problem) {
      error = problem;
      return;
    }

    loadingSignupWithEmail = true;

    try {
      await signUpWithEmail(email.trim(), password, name);

      // Show verification notice
      info =
        'We just sent a confirmation link to your email. Please verify your address before signing in.';
      // Clear form fields
      password = '';
      confirmPassword = '';
    } catch (err) {
      error = err instanceof AuthFormError ? err.message : AUTH_ERROR_MESSAGES.unknown;
    } finally {
      loadingSignupWithEmail = false;
    }
  }

  async function handleGoogleSignup() {
    error = '';
    loadingSignupWithGoogle = true;

    try {
      await signInWithGoogle();

      // Redirect to dashboard or home page
      goto('/');
    } catch {
      error = AUTH_ERROR_MESSAGES.unknown;
    } finally {
      loadingSignupWithGoogle = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up - InsightSphere</title>
</svelte:head>

<AuthShell>
  <div>
    <h1 class="text-2xl font-semibold">Create an account</h1>
    <div aria-live="polite">
      {#if info}
        <p class="mt-6 rounded-box border border-base-content/10 bg-base-200 p-4 text-base">
          {info}
        </p>
      {/if}
    </div>
  </div>

  <GoogleButton
    label="Sign up with Google"
    loadingLabel="Signing up"
    loading={loadingSignupWithGoogle}
    onclick={handleGoogleSignup}
  />

  <div class="divider text-sm text-base-content/70">or</div>

  <form class="space-y-6" novalidate onsubmit={handleSubmit}>
    <div class="space-y-2">
      <label for="name" class="block text-sm font-medium">Full name</label>
      <input
        id="name"
        type="text"
        autocomplete="name"
        bind:value={name}
        aria-describedby="form-error"
        class="input w-full text-base"
      />
    </div>

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
        autocomplete="new-password"
        describedby="form-error"
        bind:value={password}
      />
    </div>

    <div class="space-y-2">
      <PasswordField
        id="confirm-password"
        label="Confirm password"
        autocomplete="new-password"
        describedby="form-error"
        bind:value={confirmPassword}
      />
      <p id="form-error" aria-live="polite" class="min-h-5 text-sm text-error">{error}</p>
    </div>

    <button
      type="submit"
      class="btn btn-primary w-full"
      disabled={loadingSignupWithEmail}
      aria-busy={loadingSignupWithEmail}
    >
      {#if loadingSignupWithEmail}
        <Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />
        <span>Creating account</span>
      {:else}
        <span>Create account</span>
      {/if}
    </button>
  </form>

  <p class="text-sm text-base-content/70">
    Already have an account?
    <a href="/login" class="link text-base-content">Sign in</a>
  </p>
</AuthShell>
