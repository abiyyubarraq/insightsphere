import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { supabase } from '../../services/supabase';

// The session lives in localStorage, so only the browser can tell who is
// signed in. Rendering on the client only keeps the page from flashing
// before the redirect.
export const ssr = false;

export const load: PageLoad = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(307, '/login');
};
