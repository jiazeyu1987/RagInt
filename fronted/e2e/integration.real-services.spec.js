const { test, expect } = require('@playwright/test');

const RUN_REAL_INTEGRATION = String(process.env.PW_REAL_INTEGRATION || '').trim() === '1';
const RUN_REAL_UI = String(process.env.PW_REAL_UI || '').trim() === '1';
const BACKEND_BASE = String(
  process.env.PW_REAL_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000'
)
  .trim()
  .replace(/\/+$/, '');

function parseSseEvents(bodyText) {
  return String(bodyText || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

test.describe('real services integration', () => {
  test.skip(!RUN_REAL_INTEGRATION, 'Set PW_REAL_INTEGRATION=1 to run real backend integration checks.');

  test('backend health endpoints are reachable', async ({ request }) => {
    const healthResp = await request.get(`${BACKEND_BASE}/health`, { timeout: 20_000 });
    expect(healthResp.ok()).toBeTruthy();
    const health = await healthResp.json();
    expect(health).toEqual(expect.objectContaining({ ok: true }));

    const saucHealthResp = await request.get(`${BACKEND_BASE}/api/asr/sauc/health`, { timeout: 20_000 });
    expect(saucHealthResp.ok()).toBeTruthy();
    const saucHealth = await saucHealthResp.json();
    expect(saucHealth).toEqual(expect.objectContaining({ ok: true }));
  });

  test('ask endpoint returns SSE with done marker', async ({ request }) => {
    const askText = String(process.env.PW_REAL_ASK_TEXT || 'Please return a short sentence for e2e verification.').trim();
    const askTimeoutMs = Math.max(10_000, Number(process.env.PW_REAL_ASK_TIMEOUT_MS) || 90_000);
    const response = await request.post(`${BACKEND_BASE}/api/ask`, {
      data: {
        question: askText,
        request_id: `pw_real_ask_${Date.now()}`,
        guide: { enabled: false },
      },
      timeout: askTimeoutMs,
    });

    expect(response.ok()).toBeTruthy();
    const contentType = String(response.headers()['content-type'] || '').toLowerCase();
    expect(contentType).toContain('text/event-stream');

    const body = await response.text();
    const events = parseSseEvents(body);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((evt) => evt && evt.done === true)).toBeTruthy();
  });

  test('tts stream endpoint returns audio payload', async ({ request }) => {
    const ttsText = String(process.env.PW_REAL_TTS_TEXT || 'playwright integration tts check').trim();
    const ttsTimeoutMs = Math.max(10_000, Number(process.env.PW_REAL_TTS_TIMEOUT_MS) || 90_000);
    const response = await request.post(`${BACKEND_BASE}/api/text_to_speech_stream`, {
      data: {
        text: ttsText,
        request_id: `pw_real_tts_${Date.now()}`,
        segment_index: 0,
      },
      timeout: ttsTimeoutMs,
    });

    expect(response.ok()).toBeTruthy();
    const contentType = String(response.headers()['content-type'] || '').toLowerCase();
    expect(contentType).toContain('audio');
    const audioBytes = await response.body();
    expect(audioBytes.length).toBeGreaterThan(0);
  });

  test('frontend text submit works against real backend', async ({ page }) => {
    test.skip(!RUN_REAL_UI, 'Set PW_REAL_UI=1 to include UI-level integration check.');

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible();

    const text = String(process.env.PW_REAL_UI_TEXT || 'Please answer with one concise line.').trim();
    await page.locator('.text-input input[type="text"]').fill(text);
    await page.locator('.text-input button[type="submit"]').click();

    await expect
      .poll(() => page.locator('.loading').count(), { timeout: 120_000 })
      .toBe(0);

    await expect
      .poll(async () => {
        const answer = await page
          .locator('.main .answer-section p')
          .first()
          .textContent()
          .catch(() => '');
        return String(answer || '').trim().length;
      }, { timeout: 120_000 })
      .toBeGreaterThan(0);
  });
});
