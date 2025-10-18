import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import path from 'path';

const commitCount = execSync('git rev-list --count HEAD').toString().trim();

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __VERSION__: JSON.stringify(commitCount),
  },
  server: {
    port: 5173,
  },
});
