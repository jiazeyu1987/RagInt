const path = require('path');
const { defineConfig } = require('@playwright/test');

const fixtureId = String(process.env.PW_ASR_FIXTURE_ID || 'unknown-fixture').trim() || 'unknown-fixture';
const fakeAudioFile = String(process.env.PW_ASR_AUDIO_FILE || '').trim();
const fakeAudioCaptureArg = fakeAudioFile.includes('%noloop') ? fakeAudioFile : `${fakeAudioFile}%noloop`;
const backendBase = String(process.env.PW_REAL_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000')
  .trim()
  .replace(/\/+$/, '');

if (!fakeAudioFile) {
  throw new Error('PW_ASR_AUDIO_FILE is required for playwright.asr-accuracy.config.js');
}

if (!process.env.REACT_APP_BACKEND_URL) process.env.REACT_APP_BACKEND_URL = backendBase;
if (!process.env.BROWSER) process.env.BROWSER = 'none';

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: /asr-accuracy\.real\.spec\.js$/,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(__dirname, 'test-results', 'asr-accuracy', fixtureId),
  use: {
    baseURL: 'http://127.0.0.1:4981',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium-asr-accuracy',
      use: {
        browserName: 'chromium',
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeAudioCaptureArg}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run serve:dual:e2e',
    url: 'http://127.0.0.1:4981',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
