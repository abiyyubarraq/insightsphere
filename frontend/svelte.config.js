import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto detected nothing and the build warned on every run. The
    // deployment target is a container behind Caddy, so node is the honest one.
    adapter: adapter({ out: 'build' }),

    // Assistant answers and document summaries are rendered with {@html}. They
    // are sanitised first, but the session's refresh token lives in
    // localStorage, so a second layer is worth having.
    //
    // script-src 'self' is the one doing the work: an injected inline script
    // cannot execute at all. SvelteKit hashes its own inline bootstrap, which
    // is what mode 'auto' handles.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        // Tailwind and Svelte both emit inline <style>; hashing those would
        // mean rebuilding the policy on every style change.
        'style-src': ['self', 'unsafe-inline'],
        // Page previews are Supabase signed URLs on a per-project domain.
        'img-src': ['self', 'data:', 'blob:', 'https:'],
        'font-src': ['self', 'data:'],
        // Supabase and the API are both configured per environment. Narrow to
        // exact origins once the deployment URLs are fixed.
        'connect-src': ['self', 'https:'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none'],
        'form-action': ['self'],
      },
    },
  },
};

export default config;
