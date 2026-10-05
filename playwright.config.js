import { defineConfig } from '@playwright/test'

// The browser tests (tests/e2e/*.e2e.js): a real browser clicking through the real site.
//
// Before the tests start, Playwright launches three things by itself:
//   1. the stand-in Supabase server, which runs the real database schema in memory
//   2. the site, built with the settings in .env.e2e so it talks to that server
//   3. a second copy of the site with payments switched off (.env.e2e-nopay), which
//      is how the site starts out, for tests/e2e/without-payments.e2e.js
// Nothing here ever touches a real Supabase project or Stripe account.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.js',
  // One at a time: every test shares the same stand-in database, and resets it first.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/server/fake-supabase.mjs',
      url: 'http://localhost:54321/__test/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npx vite build --mode e2e-nopay --outDir dist-e2e-nopay && npx vite preview --outDir dist-e2e-nopay --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
