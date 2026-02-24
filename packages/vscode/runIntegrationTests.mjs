import { runTests } from '@vscode/test-electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  await runTests({
    extensionDevelopmentPath: resolve(__dirname),
    extensionTestsPath: resolve(
      __dirname,
      '__tests__/integration/extension.test.mjs',
    ),
    launchArgs: ['--disable-extensions'],
  });
  console.log('Integration tests passed.');
} catch (err) {
  console.error('Integration tests failed:', err);
  process.exit(1);
}
