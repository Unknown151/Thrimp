import { defineConfig } from '@playwright/test';

// On this PC the tests drive Microsoft Edge, which every Windows install has, so no browser download is needed.
// In Claude's cloud container, set PW_CHROMIUM to the path of its pre-installed Chromium instead.
const chromium = process.env.PW_CHROMIUM;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 800 },
    ...(chromium ? { launchOptions: { executablePath: chromium } } : { channel: 'msedge' }),
  },
  webServer: {
    command: 'node ../build.mjs --serve --port 4173', // builds first, and fails the run if the build fails
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
