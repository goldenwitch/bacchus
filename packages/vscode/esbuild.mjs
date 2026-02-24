import esbuild from 'esbuild';
import { pnpPlugin } from '@yarnpkg/esbuild-plugin-pnp';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');

// TypeScript uses `.js` extensions in imports (`./server.js` → `./server.ts`).
// The PnP plugin doesn't know about this convention, so we resolve first.
const tsExtPlugin = {
  name: 'ts-ext',
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.path.startsWith('.')) return undefined;
      const tsPath = join(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
      if (existsSync(tsPath)) return { path: tsPath };
      return undefined;
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  plugins: [tsExtPlugin, pnpPlugin()],
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'esm',
  external: ['vscode'],
};

/** @type {import('esbuild').BuildOptions} */
const serverConfig = {
  ...shared,
  entryPoints: ['../mcp/src/index.ts'],
  outfile: 'dist/server.js',
  format: 'esm',
  // No banner — the MCP entry point already has a shebang.
};

if (watch) {
  console.log('[watch] build started');
  const [extCtx, srvCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(serverConfig),
  ]);
  await Promise.all([extCtx.watch(), srvCtx.watch()]);
  console.log('[watch] build finished');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(serverConfig),
  ]);
  console.log('Build complete.');
}
