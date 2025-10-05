<script lang="ts">
  import { logout } from '../../../services/supabase';
  import { user } from '../../../stores/auth';
  import { LogOut, Loader2 } from 'lucide-svelte';
  import type { User } from '@supabase/supabase-js';

  let loggingOut = $state(false);

  const getAvatar = (u: User | null | undefined): string | null =>
    u?.user_metadata?.avatar_url ?? null;
  const getName = (u: User | null | undefined): string | null =>
    u?.user_metadata?.full_name ?? u?.email ?? null;

  async function handleLogout() {
    loggingOut = true;
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      loggingOut = false;
    }
  }
</script>

<!-- User Header -->
<div class="card bg-base-200 shadow-lg">
  <div class="card-body p-3">
    <div class="flex items-center space-x-3">
      {#if getAvatar($user)}
        <div class="avatar">
          <div class="w-8 rounded-full">
            <img src={getAvatar($user)} alt="Profile" />
          </div>
        </div>
      {:else}
        <div class="avatar placeholder">
          <div class="bg-primary text-primary-content rounded-full w-8">
            <span class="text-sm font-bold">
              {getName($user)?.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="font-medium text-sm truncate">{getName($user) || 'User'}</p>
        <p class="text-base-content/70 text-xs truncate">{$user?.email}</p>
      </div>
      <button
        onclick={handleLogout}
        disabled={loggingOut}
        class="btn btn-ghost btn-sm gap-1"
        title="Sign Out"
      >
        {#if loggingOut}
          <Loader2 class="w-4 h-4 animate-spin" />
        {:else}
          <LogOut class="w-4 h-4" />
        {/if}
      </button>
    </div>
  </div>
</div>
