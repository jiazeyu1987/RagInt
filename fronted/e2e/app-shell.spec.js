const { test, expect } = require('@playwright/test');

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

const MOCK_AUDIO_BYTES = Buffer.from('524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000', 'hex');

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
          asrConversationAutoSubmitSilenceMs: 1200,
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

    if (path === '/api/pad/bootstrap' && method === 'GET') {
      await fulfillJson(route, {
        ok: true,
        client_id: 'client-1',
        hall: {
          hall_id: 'hall_01',
          hall_name: '心内介植入展厅',
          product_count: 2,
          active_audio_count: 2,
          updated_at_ms: 1710000000000,
        },
        navigation: {
          home_url: '/',
          ragint_tour_url: '/ragint/?entry=tour',
        },
        offline: {
          manifest_url: '/api/pad/offline/manifest',
          version: 1710000000000,
          product_count: 2,
          active_audio_count: 2,
        },
      });
      return;
    }

    if (path === '/api/pad/halls/current/products' && method === 'GET') {
      await fulfillJson(route, {
        ok: true,
        client_id: 'client-1',
        hall: {
          hall_id: 'hall_01',
          hall_name: '心内介植入展厅',
          product_count: 2,
          active_audio_count: 2,
          updated_at_ms: 1710000000000,
        },
        items: [
          {
            product_id: 'product_001',
            hall_id: 'hall_01',
            sort_order: 1,
            product_name: '产品甲',
            product_name_en: 'Product A',
            intro_text: '产品甲介绍',
            registration_name: '注册证甲',
            registration_number: '国械注准A',
            effective_date: '2026-01-01',
            company: '公司甲',
            current_audio: {
              audio_asset_id: 'audio_001',
              source_type: 'recorded',
              updated_at_ms: 1710000000000,
              audio_url: '/api/pad/products/product_001/audio/current',
            },
          },
          {
            product_id: 'product_002',
            hall_id: 'hall_01',
            sort_order: 2,
            product_name: '产品乙',
            product_name_en: 'Product B',
            intro_text: '产品乙介绍',
            registration_name: '注册证乙',
            registration_number: '国械注准B',
            effective_date: '2026-02-01',
            company: '公司乙',
            current_audio: {
              audio_asset_id: 'audio_002',
              source_type: 'tts',
              updated_at_ms: 1710000001000,
              audio_url: '/api/pad/products/product_002/audio/current',
            },
          },
        ],
      });
      return;
    }

    if (path === '/api/pad/offline/manifest' && method === 'GET') {
      await fulfillJson(route, {
        ok: true,
        client_id: 'client-1',
        hall: {
          hall_id: 'hall_01',
          hall_name: '心内介植入展厅',
          product_count: 2,
          active_audio_count: 2,
          updated_at_ms: 1710000000000,
        },
        version: 1710000000000,
        items: [
          {
            product_id: 'product_001',
            sort_order: 1,
            product_name: '产品甲',
            product_name_en: 'Product A',
            updated_at_ms: 1710000000000,
            audio: {
              audio_asset_id: 'audio_001',
              source_type: 'recorded',
              updated_at_ms: 1710000000000,
              audio_url: '/api/pad/offline/audio/audio_001',
            },
          },
          {
            product_id: 'product_002',
            sort_order: 2,
            product_name: '产品乙',
            product_name_en: 'Product B',
            updated_at_ms: 1710000001000,
            audio: {
              audio_asset_id: 'audio_002',
              source_type: 'tts',
              updated_at_ms: 1710000001000,
              audio_url: '/api/pad/offline/audio/audio_002',
            },
          },
        ],
      });
      return;
    }

    await fulfillJson(route, {});
  });

  await page.route('**/api/pad/offline/audio/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'content-type': 'audio/wav',
      },
      body: MOCK_AUDIO_BYTES,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test('app shell loads and shows input controls', async ({ page }) => {
  await page.goto('/ragint/');
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('.input-section')).toBeVisible();

  const textInput = page.locator('.text-input input[type="text"]');
  const sendButton = page.locator('.text-input button[type="submit"]');

  await expect(textInput).toBeVisible();
  await expect(sendButton).toBeVisible();

  await textInput.fill('playwright smoke');
  await expect(sendButton).toBeEnabled();
});

test('asr tab renders silence timing and auto resume controls', async ({ page }) => {
  await page.goto('/ragint/');
  await page.getByRole('tab', { name: '语音识别设置' }).click();

  const panel = page.locator('.settings-tab-panel');
  await expect(panel).toContainText('静音判定时长（毫秒）');
  await expect(panel).not.toContainText('语音结束后自动发送问题');
  await expect(panel).not.toContainText('自动发送范围');

  const silenceInput = page.locator('.settings-tab-panel input[placeholder="1200"]').first();
  await expect(silenceInput).toBeVisible();
  await expect(silenceInput).toHaveValue('1200');

  const delayInput = page.locator('.settings-tab-panel input[placeholder="2200"]');
  await expect(delayInput).toBeVisible();
  await expect(delayInput).toHaveValue('2200');

  const autoResumeToggle = delayInput.locator('xpath=preceding::input[@type="checkbox"][1]');

  await expect(autoResumeToggle).toBeChecked();
});

test('ragint subpath entry opens simple mode and can return to product explainer', async ({ page }) => {
  await page.goto('/ragint/?entry=tour');
  await expect(page.locator('.simple-tour-main-btn')).toBeVisible();
  const clientIdBefore = await page.evaluate(() => {
    const current = window.localStorage.getItem('clientId');
    return current || '';
  });

  await page.getByRole('button', { name: '返回产品讲解' }).click();
  await expect(page.locator('.pad-shell')).toBeVisible();
  await expect(page.getByTestId('demo-item-list')).toBeVisible();
  await expect(page.getByTestId('demo-item-product_001')).toContainText('产品甲');

  const clientIdAfter = await page.evaluate(() => window.localStorage.getItem('clientId') || '');
  expect(clientIdAfter).toBe(clientIdBefore);
});
