import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

let commitCount = 'dev';
try {
  commitCount = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // No git available, or no history: a container build is the common case.
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __VERSION__: JSON.stringify(commitCount),
  },
  server: {
    port: 5173,
  },
});
