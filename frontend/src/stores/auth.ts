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
  let hadSession = false;
  const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

  supabase.auth.onAuthStateChange((_event, session) => {
    user.set(session?.user ?? null);
    if (initial) {
      loading.set(false);
      initial = false;
    }

    // A session that ends used to leave the app sitting on an empty dashboard
    // with an error banner and no way forward but signing out by hand. Send
    // the user somewhere they can act. Only when a session actually ended: a
    // visitor who never signed in is left where they are.
    if (hadSession && !session) {
      const onAuthRoute = AUTH_ROUTES.some((route) =>
        window.location.pathname.startsWith(route)
      );
      if (!onAuthRoute) {
        window.location.href = '/login';
      }
    }
    hadSession = !!session;
  });
}
