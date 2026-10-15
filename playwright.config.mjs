// End-to-end tests: the built site and the Chapter Editor against the Firestore and Auth emulators.
// Run with: npm run test:e2e  (starts the emulators, builds for them and serves on port 4174)
import { defineConfig, devices } from '@playwright/test';

const emulators = 'http://127.0.0.1:8080 http://127.0.0.1:9099';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/build.mjs && node scripts/serve.mjs',
    url: 'http://127.0.0.1:4174/index.html',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      CONTENT_SOURCE: 'auto',
      FIREBASE_PROJECT: 'demo-acs-e2e',
      FIRESTORE_ORIGIN: 'http://127.0.0.1:8080',
      AUTH_EMULATOR_ORIGIN: 'http://127.0.0.1:9099',
      PORT: '4174',
      EXTRA_CONNECT: emulators,
    },
  },
});
