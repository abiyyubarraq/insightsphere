<script>
  import { LogIn, Rocket } from 'lucide-svelte';
  import { goto } from '$app/navigation';
</script>

<!-- Non-authenticated User Buttons -->
<div class="flex gap-4 items-center">
  <button
    onclick={() => goto('/login')}
    class="btn btn-outline btn-primary btn-lg gap-2 min-w-[140px]"
  >
    <LogIn class="w-5 h-5" />
    Sign In
  </button>
  <button onclick={() => goto('/signup')} class="btn btn-primary btn-lg gap-2 min-w-[140px]">
    <Rocket class="w-5 h-5" />
    Get Started
  </button>
</div>
