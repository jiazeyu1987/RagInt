const { test, expect } = require('@playwright/test');

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function installApiMocks(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = String(request.method() || '').toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    if (path === '/api/app_settings' && method === 'GET') {
      await fulfillJson(route, {
        settings: {
          showHistoryPanel: false,
          showDebugPanel: false,
          settingsActiveTab: 'tts',
          wakeWordEnabled: true,
          wakeWord: 'hello assistant',
          wakeWordStrict: false,
          wakeWordCooldownMs: 5000,
          asrAutoSubmitOnWakeEnabled: true,
          asrAutoResumeAfterAnswerEnabled: true,
          asrAutoResumeAfterAnswerDelayMs: 2200,
        },
      });
      return;
    }

    if (path === '/api/app_settings' && method === 'PUT') {
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/breakpoint' && method === 'GET') {
      await fulfillJson(route, { ok: true, state: {} });
      return;
    }

    if (path === '/api/breakpoint' && method === 'POST') {
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/tour/meta' && method === 'GET') {
      await fulfillJson(route, {
        zones: ['Default Zone'],
        profiles: ['General'],
        default_zone: 'Default Zone',
        default_profile: 'General',
      });
      return;
    }

    if (path === '/api/tour/stops' && method === 'GET') {
      await fulfillJson(route, {
        stops: ['Stop A', 'Stop B'],
      });
      return;
    }

    if (path === '/api/ragflow/chats' && method === 'GET') {
      await fulfillJson(route, {
        chats: [{ name: 'Exhibit Chat' }],
        default: 'Exhibit Chat',
      });
      return;
    }

    if (path === '/api/ragflow/agents' && method === 'GET') {
      await fulfillJson(route, {
        agents: [],
        default: '',
      });
      return;
    }

    if (path === '/api/recordings' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    if (path === '/api/history' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    await fulfillJson(route, {});
  });
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test('app shell loads and shows input controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('.input-section')).toBeVisible();

  const textInput = page.locator('.text-input input[type="text"]');
  const sendButton = page.locator('.text-input button[type="submit"]');

  await expect(textInput).toBeVisible();
  await expect(sendButton).toBeVisible();

  await textInput.fill('playwright smoke');
  await expect(sendButton).toBeEnabled();
});

test('asr tab renders auto submit and auto resume controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /ASR/i }).click();

  const delayInput = page.locator('.settings-tab-panel input[placeholder="2200"]');
  await expect(delayInput).toBeVisible();
  await expect(delayInput).toHaveValue('2200');

  const autoResumeToggle = delayInput.locator('xpath=preceding::input[@type="checkbox"][1]');
  const autoSubmitToggle = delayInput.locator('xpath=preceding::input[@type="checkbox"][2]');

  await expect(autoSubmitToggle).toBeChecked();
  await expect(autoResumeToggle).toBeChecked();
});
