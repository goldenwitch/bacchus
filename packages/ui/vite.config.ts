import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load the root .env so ANTHROPIC_API_KEY (written by setup.ps1 -Integration)
  // is available to the browser bundle as import.meta.env.VITE_ANTHROPIC_API_KEY.
  const env = loadEnv(mode, resolve(__dirname, '..', '..'), '');

  return {
    plugins: [svelte()],
    define: {
      'import.meta.env.VITE_ANTHROPIC_API_KEY': JSON.stringify(
        env.ANTHROPIC_API_KEY ?? '',
      ),
    },
    optimizeDeps: {
      exclude: ['d3-transition'],
    },
  };
});
