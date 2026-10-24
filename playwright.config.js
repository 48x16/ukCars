import { defineConfig, devices } from '@playwright/test';

// Lets context.route() see the service worker's own requests, so the offline test can cut
// them off too. Browser offline emulation alone doesn't reach a service worker's fetches.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

// End-to-end and accessibility tests against the production build (`npm run build` first).
// Locally this uses the Edge already installed on Windows; CI installs Playwright's Chromium.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'msedge' } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'msedge' },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
