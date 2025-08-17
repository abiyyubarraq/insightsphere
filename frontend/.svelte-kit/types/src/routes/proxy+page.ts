// @ts-nocheck
import type { PageLoad } from './$types';
import { supabase } from '../services/supabase';
import { fetchProjects } from '../services/supabase';
import { browser } from '$app/environment';

export const load = async () => {
  if (!browser) {
    return { projects: [] };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { projects: [] };
  }
  const projects = await fetchProjects(session.user.id);

  return { projects };
};
null as any as PageLoad;
