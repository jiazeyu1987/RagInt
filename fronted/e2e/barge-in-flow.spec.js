const { test, expect } = require('@playwright/test');

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
          asrAutoResumeAfterAnswerEnabled: true,
          asrAutoResumeAfterAnswerDelayMs: 1200,
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
      await fulfillJson(route, { stops: ['Stop A', 'Stop B', 'Stop C'] });
      return;
    }

    if (path === '/api/tour/plan' && method === 'POST') {
      await fulfillJson(route, {
        stops: ['Stop A', 'Stop B', 'Stop C'],
        stop_durations_s: [10, 10, 10],
        stop_target_chars: [100, 100, 100],
      });
      return;
    }

    if (path === '/api/tour/control' && method === 'POST') {
      await fulfillJson(route, { ok: true });
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
      const question = String(body.question || '').trim();
      const tourAction = body && body.guide ? String(body.guide.tour_action || '').trim() : '';

      askCalls.push({
        question,
        tourAction: tourAction || null,
      });

      // Keep narration requests in-flight long enough for the 1200ms
      // conversation auto-submit silence window to still interrupt narration.
      await delay(tourAction ? 2200 : 100);

      const answer = tourAction ? `tour_${tourAction}_ok` : `qa_${question || 'ok'}`;
      try {
        await fulfillSse(route, [{ chunk: answer, done: false }, { done: true }]);
      } catch (_) {
        // Request may be aborted by interrupt logic; ignore.
      }
      return;
    }

    await fulfillJson(route, {});
  });
}

test('mock full chain: barge-in during narration -> auto ask -> auto resume -> barge-in again', async ({ page }) => {
  const askCalls = [];

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

  const conversationBtn = page.getByRole('button', { name: '开启对话' });
  await expect(conversationBtn).toBeVisible();
  await conversationBtn.click();
  await expect(page.getByRole('button', { name: '结束对话' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__RAGINT_E2E__.getConversationState()), { timeout: 4000 })
    .toEqual({ enabled: true, busy: false });

  const tourBtn = page.getByRole('button', { name: '开始讲解' });
  await expect(tourBtn).toBeVisible();
  await expect(tourBtn).toBeEnabled();
  await tourBtn.click();

  await expect
    .poll(() => askCalls.filter((call) => call.tourAction === 'start').length, { timeout: 5000 })
    .toBe(1);

  await page.evaluate(() => window.__RAGINT_E2E__.emitAsrFinal('mock question one'));

  await expect
    .poll(() => askCalls.filter((call) => call.question === 'mock question one').length, { timeout: 7000 })
    .toBe(1);
  await expect
    .poll(
      () =>
        page
          .locator('.input-section .home-actions .home-action-primary, .input-section .home-actions .home-action-danger')
          .first()
          .textContent()
          .then((text) => String(text || '').trim()),
      { timeout: 10000 }
    )
    .toMatch(/继续讲解|打断/);

  await page.evaluate(() => window.__RAGINT_E2E__.emitAsrFinal('mock question two'));

  await expect
    .poll(() => askCalls.filter((call) => call.question === 'mock question two').length, { timeout: 7000 })
    .toBe(1);
  await expect
    .poll(
      () =>
        page
          .locator('.input-section .home-actions .home-action-primary, .input-section .home-actions .home-action-danger')
          .first()
          .textContent()
          .then((text) => String(text || '').trim()),
      { timeout: 10000 }
    )
    .toMatch(/继续讲解|打断/);

  const startIdx = askCalls.findIndex((call) => call.tourAction === 'start');
  const q1Idx = askCalls.findIndex((call) => call.question === 'mock question one');
  const q2Idx = askCalls.findIndex((call, idx) => idx > q1Idx && call.question === 'mock question two');

  expect(startIdx).toBeGreaterThanOrEqual(0);
  expect(q1Idx).toBeGreaterThan(startIdx);
  expect(q2Idx).toBeGreaterThan(q1Idx);
});
