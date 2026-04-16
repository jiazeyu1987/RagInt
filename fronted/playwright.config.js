const { defineConfig } = require('@playwright/test');

const browserName = String(process.env.PW_BROWSER_NAME || 'chromium').trim() || 'chromium';
const browserChannel = String(process.env.PW_BROWSER_CHANNEL || '').trim();

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4981',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: browserChannel ? `${browserName}-${browserChannel}` : browserName,
      use: browserChannel ? { browserName, channel: browserChannel } : { browserName },
    },
  ],
  webServer: {
    command: 'npm run serve:dual:e2e',
    url: 'http://127.0.0.1:4981',
    reuseExistingServer: !!process.env.PW_REUSE_EXISTING_SERVER,
    timeout: 240_000,
  },
});
