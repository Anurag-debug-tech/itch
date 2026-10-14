import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Opt-in live-network suite. Every run gets new storage; it never resets an existing database.
const directory = path.resolve('data/testnet-browser', String(Date.now()));
export default defineConfig({
  testDir: './tests/stellar',
  testMatch: '*.spec.ts',
  outputDir: 'test-results-stellar',
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-stellar-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3200', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'testnet-chrome',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
    },
  ],
  webServer: {
    command: `node --import tsx tests/stellar/prepare.ts && npm run ${process.env.PLAYWRIGHT_SERVER_MODE === 'production' ? 'start' : 'dev'} -- --port 3200`,
    url: 'http://127.0.0.1:3200/api/session',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DEMO_MODE: 'true',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: '',
      AI_GATEWAY_API_KEY: '',
      AI_MODEL: '',
      STELLAR_TESTNET_ENABLED: 'true',
      STELLAR_ESCROW_CONTRACT_ID: 'CDQODC2CCYGKCUKTXXN24BQK4GMKJLUK4QQOWKJP2POD5W3B5NDC27ID',
      DATABASE_PATH: path.join(directory, 'app.sqlite'),
      UPLOAD_DIR: path.join(directory, 'uploads'),
      APP_ORIGIN: 'http://127.0.0.1:3200',
    },
  },
});
