import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load .env into process.env so integration tests can read ANTHROPIC_API_KEY
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [svelte({ hot: false })],
    resolve: {
      conditions: ['browser'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['packages/ui/__tests__/setup.ts'],
      exclude: ['**/e2e/**', '**/node_modules/**'],
      server: {
        deps: {
          inline: ['@testing-library/svelte', '@testing-library/svelte-core'],
        },
      },
      coverage: {
        provider: 'v8',
        include: ['packages/*/src/**/*.ts'],
        exclude: ['**/index.ts', '**/cli/src/cli.ts'],
        thresholds: {
          lines: 85,
          branches: 80,
          functions: 80,
          statements: 85,
        },
      },
    },
  };
});
