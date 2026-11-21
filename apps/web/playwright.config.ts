import { defineConfig, devices } from '@playwright/test';

/**
 * E2E : nécessite l’API (port 4000, mode MOCK) et le web (port 3000).
 * Si le web n’est pas déjà lancé, Playwright démarre `next dev`. Le test se met en « skip » si l’API est injoignable.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm dev', url: BASE_URL, reuseExistingServer: true, timeout: 180_000 },
});
