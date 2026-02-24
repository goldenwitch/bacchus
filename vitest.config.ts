import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';

/** Tell Vite that `vscode` is a host-provided module — skip import analysis. */
function externalVscode(): Plugin {
  return {
    name: 'external-vscode',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'vscode') return { id: 'vscode', external: true };
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env into process.env so integration tests can read ANTHROPIC_API_KEY
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [svelte({ hot: false }), externalVscode()],
    resolve: {
      conditions: ['browser'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['packages/ui/__tests__/setup.ts'],
      exclude: [
        '**/e2e/**',
        '**/node_modules/**',
        '**/packages/vscode/__tests__/integration/**',
      ],
      server: {
        deps: {
          inline: ['@testing-library/svelte', '@testing-library/svelte-core'],
          external: [/^vscode$/],
        },
      },
      coverage: {
        provider: 'v8',
        include: ['packages/*/src/**/*.ts'],
        exclude: ['**/index.ts', '**/cli/src/cli.ts', '**/mcp/src/server.ts'],
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
