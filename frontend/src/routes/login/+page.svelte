<script lang="ts">
  import { signInWithGoogle, signInWithEmail } from '../../services/supabase';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '../../stores/auth';
  import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle, X } from 'lucide-svelte';

  // Redirect if already authenticated
  $effect(() => {
    if ($isAuthenticated) {
      goto('/');
    }
  });

  let showPassword = $state(false);
  let email = $state('');
  let password = $state('');
  let loadingLoginWithGoogle = $state(false);
  let loadingLoginWithEmail = $state(false);
  let error = $state('');

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  async function handleSubmit(loginType: 'google' | 'email') {
    error = '';

    if (!email.trim() || !password.trim()) {
      error = 'Please fill in all fields';
      return;
    }

    if (loginType === 'google') {
      loadingLoginWithGoogle = true;
    } else {
      loadingLoginWithEmail = true;
    }

    try {
      await signInWithEmail(email, password);

      // Redirect to dashboard or home page
      goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
    } finally {
      if (loginType === 'google') {
        loadingLoginWithGoogle = false;
      } else {
        loadingLoginWithEmail = false;
      }
    }
  }

  async function handleGoogleLogin() {
    error = '';
    loadingLoginWithGoogle = true;

    try {
      const user = await signInWithGoogle();

      // Redirect to dashboard or home page
      goto('/');
    } catch (err: any) {
      error = err.message;
    } finally {
      loadingLoginWithGoogle = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In - InsightSphere</title>
</svelte:head>

<div class="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
  <!-- Gradient Circle Background -->
  <div class="absolute inset-0 flex items-center justify-center">
    <div
      class="w-96 h-96 bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent rounded-full blur-3xl"
    ></div>
    <div
      class="absolute w-64 h-64 bg-gradient-to-tl from-primary/15 via-primary/10 to-transparent rounded-full blur-2xl -translate-x-20 translate-y-10"
    ></div>
  </div>

  <div class="w-full max-w-md space-y-8 relative z-10">
    <!-- Logo -->
    <div class="text-center">
      <div class="flex items-center justify-center space-x-3 mb-8">
        <div
          class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
        >
          <span class="text-white font-bold text-xl">I</span>
        </div>
        <h1 class="text-2xl font-bold text-white">InsightSphere</h1>
      </div>
    </div>

    <!-- Error Message -->
    {#if error}
      <div role="alert" class="alert alert-error flex items-start">
        <AlertCircle class="w-5 h-5" />
        <span class="flex-1">{error}</span>
        <button class="btn btn-ghost btn-xs" onclick={() => (error = '')}>
          <X class="w-4 h-4" />
        </button>
      </div>
    {/if}

    <!-- Google Login Button -->
    <button
      onclick={handleGoogleLogin}
      disabled={loadingLoginWithGoogle}
      class="btn btn-primary w-full gap-3"
    >
      {#if loadingLoginWithGoogle}
        <Loader2 class="w-5 h-5 animate-spin" />
      {:else}
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      {/if}
      <span>{loadingLoginWithGoogle ? 'Signing in...' : 'Sign in with Google'}</span>
    </button>

    <!-- Divider -->
    <div class="divider text-white">Or, sign in with your email</div>

    <!-- Login Form -->
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit('email');
      }}
      class="space-y-4"
    >
      <!-- Email Field -->
      <div class="form-control">
        <div class="relative">
          <input
            type="email"
            bind:value={email}
            placeholder="Enter your email"
            class="input input-bordered w-full pl-10"
            required
          />
          <Mail
            class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-base-content/70 pointer-events-none z-20"
          />
        </div>
      </div>

      <!-- Password Field -->
      <div class="form-control">
        <div class="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Enter your password"
            class="input input-bordered w-full pl-10 pr-10"
            required
          />
          <Lock
            class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-base-content/70 pointer-events-none z-20"
          />
          <button
            type="button"
            onclick={togglePasswordVisibility}
            class="btn btn-ghost btn-sm absolute right-1 top-1/2 -translate-y-1/2 z-10"
            tabindex="-1"
          >
            {#if showPassword}
              <EyeOff class="h-4 w-4" />
            {:else}
              <Eye class="h-4 w-4" />
            {/if}
          </button>
        </div>
        <div class="mt-2">
          <a href="/forgot-password" class="label-text-alt link link-hover">
            Forgot your password?
          </a>
        </div>
      </div>

      <!-- Sign In Button -->
      <button type="submit" disabled={loadingLoginWithEmail} class="btn btn-primary w-full gap-2">
        {#if loadingLoginWithEmail}
          <Loader2 class="w-4 h-4 animate-spin" />
        {:else}
          <span>Sign In</span>
        {/if}
      </button>
    </form>

    <!-- Signup Link -->
    <div class="text-center">
      <p class="text-white">
        Don't have an account?
        <a href="/signup" class="link link-primary font-medium"> Sign up </a>
      </p>
    </div>
  </div>
</div>
