const { test, expect } = require('@playwright/test');

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

function parseJson(text, fallback = {}) {
  try {
    return JSON.parse(String(text || ''));
  } catch (_) {
    return fallback;
  }
}

function toSseBody(events) {
  return `${(events || []).map((evt) => `data: ${JSON.stringify(evt)}\n`).join('')}\n`;
}

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

async function fulfillSse(route, events, status = 200) {
  await route.fulfill({
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
    body: toSseBody(events),
  });
}

async function installApiMocks(page, askCalls) {
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
          wakeWordEnabled: true,
          wakeWord: 'hello assistant',
          wakeWordStrict: false,
          asrConversationAutoSubmitSilenceMs: 1200,
          asrAutoResumeAfterAnswerEnabled: false,
          asrTextFilterEnabled: false,
          settingsActiveTab: 'asr',
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
      await fulfillJson(route, { stops: ['Stop A', 'Stop B'] });
      return;
    }

    if (path === '/api/ragflow/chats' && method === 'GET') {
      await fulfillJson(route, { chats: [{ name: 'Exhibit Chat' }], default: 'Exhibit Chat' });
      return;
    }

    if (path === '/api/ragflow/chats/new_session' && method === 'POST') {
      await fulfillJson(route, { ok: true, session_id: 'mock-session' });
      return;
    }

    if (path === '/api/ragflow/agents' && method === 'GET') {
      await fulfillJson(route, { agents: [], default: '' });
      return;
    }

    if (path === '/api/history' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    if (path === '/api/recordings' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    if (path === '/api/ask' && method === 'POST') {
      const body = parseJson(request.postData(), {});
      askCalls.push({
        question: String(body.question || '').trim(),
        trigger: String(body.trigger || '').trim() || null,
        at: Date.now(),
      });
      await fulfillSse(route, [{ chunk: `qa_${String(body.question || '').trim() || 'ok'}`, done: false }, { done: true }]);
      return;
    }

    await fulfillJson(route, {});
  });
}

async function openConversationPage(page, askCalls) {
  await page.addInitScript(() => {
    window.__RAGINT_E2E__ = { enableAsrMock: true };
  });
  await installApiMocks(page, askCalls);
  await page.goto('/ragint/');

  await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('.input-section')).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => ({
          emitAsrFinal: typeof window.__RAGINT_E2E__?.emitAsrFinal,
          getConversationState: typeof window.__RAGINT_E2E__?.getConversationState,
        })),
      { timeout: 6000 }
    )
    .toEqual({
      emitAsrFinal: 'function',
      getConversationState: 'function',
    });
}

async function startConversation(page) {
  const startButton = page.getByRole('button', { name: '开启对话' });
  await expect(startButton).toBeVisible();
  await startButton.click();
  await expect(page.getByRole('button', { name: '结束对话' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_E2E__.getConversationState()), { timeout: 4000 })
    .toEqual({ enabled: true, busy: false });
}

test('auto-submits final ASR text after 1200ms silence in conversation mode', async ({ page }) => {
  const askCalls = [];
  await openConversationPage(page, askCalls);
  await startConversation(page);

  await page.evaluate(() => window.__RAGINT_E2E__.emitAsrFinal('自动提交问题'));

  await page.waitForTimeout(1000);
  expect(askCalls.filter((call) => call.question === '自动提交问题')).toHaveLength(0);

  await expect
    .poll(() => askCalls.filter((call) => call.question === '自动提交问题').length, { timeout: 4000 })
    .toBe(1);

  expect(askCalls[0]).toEqual(expect.objectContaining({ question: '自动提交问题' }));
});

test('dedupes repeated final ASR text in conversation mode', async ({ page }) => {
  const askCalls = [];
  await openConversationPage(page, askCalls);
  await startConversation(page);

  await page.evaluate(() => {
    window.__RAGINT_E2E__.emitAsrFinal('重复问题');
    window.__RAGINT_E2E__.emitAsrFinal('重复问题');
  });

  await expect
    .poll(() => askCalls.filter((call) => call.question === '重复问题').length, { timeout: 4000 })
    .toBe(1);

  await page.waitForTimeout(800);
  expect(askCalls.filter((call) => call.question === '重复问题')).toHaveLength(1);
});

test('cancels pending auto-submit when conversation is ended before silence timeout', async ({ page }) => {
  const askCalls = [];
  await openConversationPage(page, askCalls);
  await startConversation(page);

  await page.evaluate(() => window.__RAGINT_E2E__.emitAsrFinal('取消提交问题'));
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '结束对话' }).click();

  await expect(page.getByRole('button', { name: '开启对话' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_E2E__.getConversationState()), { timeout: 4000 })
    .toEqual({ enabled: false, busy: false });

  await page.waitForTimeout(1200);
  expect(askCalls.filter((call) => call.question === '取消提交问题')).toHaveLength(0);
});
