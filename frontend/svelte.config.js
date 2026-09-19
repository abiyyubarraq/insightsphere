import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// In production Caddy serves the API under /v1 on this same origin, so 'self'
// covers it. Locally the API is a separate port over plain http, which 'self'
// does not cover and 'https:' does not match -- without this the CSP blocks
// every API call in development.
const dev = process.env.NODE_ENV !== 'production';

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
        // https: covers Supabase, whose host is per-project.
        'connect-src': [
          'self',
          'https:',
          ...(dev ? ['http://localhost:8000', 'ws://localhost:*'] : []),
        ],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none'],
        'form-action': ['self'],
      },
    },
  },
};

export default config;
