import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: `npm run db:reset && npm run ${process.env.PLAYWRIGHT_SERVER_MODE === 'production' ? 'start' : 'dev'} -- --port 3100`,
    url: 'http://127.0.0.1:3100/api/session',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DEMO_MODE: 'true',
      APP_ORIGIN: 'http://127.0.0.1:3100',
      DATABASE_PATH: path.resolve('data/e2e.sqlite'),
      UPLOAD_DIR: path.resolve('data/e2e-uploads'),
    },
  },
});
