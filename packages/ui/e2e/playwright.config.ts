import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '..', '.env') });

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    browserName: 'chromium',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'default',
      testIgnore: ['chat-live.spec.ts'],
    },
    {
      name: 'chat-mocked',
      testMatch: 'chat-mocked.spec.ts',
    },
    {
      name: 'chat-live',
      testMatch: 'chat-live.spec.ts',
      timeout: 180_000,
    },
  ],
  webServer: {
    command: 'yarn workspace @bacchus/ui dev',
    port: 5173,
    reuseExistingServer: true,
    cwd: '../..',
  },
});
