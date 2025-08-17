import { writable, type Writable } from 'svelte/store';
import { supabase } from '../services/supabase';
import type { User } from '@supabase/supabase-js';
import { derived } from 'svelte/store';

export const user: Writable<User | null> = writable(null);
export const loading = writable(true);
export const isAuthenticated = derived(user, (u) => !!u);

// Only run on client to avoid SSR flicker
if (typeof window !== 'undefined') {
  let initial = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    user.set(session?.user ?? null);
    if (initial) {
      loading.set(false);
      initial = false;
    }
  });
}
