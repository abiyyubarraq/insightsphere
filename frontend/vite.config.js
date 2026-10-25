import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let commitCount = 'dev';
try {
  commitCount = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // No git available, or no history: a container build is the common case.
}

let realNodeModules;
try {
  realNodeModules = fs.realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)));
} catch {
  // No node_modules yet (for example a clean build): nothing to allow.
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __VERSION__: JSON.stringify(commitCount),
  },
  server: {
    port: 5173,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), ...(realNodeModules ? [realNodeModules] : [])],
    },
  },
});
