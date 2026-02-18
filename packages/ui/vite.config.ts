import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

export default defineConfig(({ mode }) => {
  // Load the root .env so ANTHROPIC_API_KEY (written by setup.ps1 -Key)
  // is available to the browser bundle as import.meta.env.VITE_ANTHROPIC_API_KEY.
  const env = loadEnv(mode, resolve(__dirname, '..', '..'), '');

  // Version watermark: package version + short git SHA
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
  );
  const version: string = pkg.version ?? '0.0.0';
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // CI or shallow clone — fall back gracefully
  }

  return {
    plugins: [svelte()],
    define: {
      'import.meta.env.VITE_ANTHROPIC_API_KEY': env.ANTHROPIC_API_KEY
        ? JSON.stringify(env.ANTHROPIC_API_KEY)
        : 'undefined',
      __APP_VERSION__: JSON.stringify(version),
      __APP_COMMIT__: JSON.stringify(gitSha),
    },
    optimizeDeps: {
      exclude: ['d3-transition'],
    },
    // SPA fallback: serve index.html for /bacchus/* routes in dev
    server: {
      historyApiFallback: true,
    },
    // For preview server
    preview: {
      historyApiFallback: true,
    },
    appType: 'spa',
  };
});
