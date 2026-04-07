import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // VS Code tests must run serially (one instance at a time)
  reporter: process.env.CI ? [['list'], ['html']] : [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
