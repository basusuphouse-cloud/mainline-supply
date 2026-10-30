import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 4173;
const baseURL = `http://localhost:${PORT}`;

// Firefox and WebKit only run with ALL_BROWSERS=1 (pnpm run test:all-browsers).
const allBrowsers = process.env.ALL_BROWSERS === '1';

const desktopViewport = { width: 1280, height: 800 };

// Optional slow motion for watching tests: SLOWMO=500 waits 500 ms after each browser action.
// Unset (the default) means full speed.
const slowMo = Number(process.env.SLOWMO) || 0;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { slowMo },
  },

  // Runs on the project's pinned Node because Playwright is started through pnpm,
  // which puts node_modules/.bin (including the runtime's `node`) first on PATH.
  webServer: {
    command: 'node server.js',
    url: baseURL,
    reuseExistingServer: true,
    env: { PORT: String(PORT) },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: desktopViewport },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'phone-393',
      use: { ...devices['Pixel 7'], viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'phone-360',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
    },
    ...(allBrowsers
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: desktopViewport } },
          { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: desktopViewport } },
        ]
      : []),
  ],
});
