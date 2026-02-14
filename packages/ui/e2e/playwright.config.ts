import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'yarn workspace @bacchus/ui dev',
    port: 5173,
    reuseExistingServer: true,
    cwd: '../..',
  },
});
