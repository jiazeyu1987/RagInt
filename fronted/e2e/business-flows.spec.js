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

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDefaultSettings(overrides = {}) {
  return {
    showHistoryPanel: false,
    showDebugPanel: false,
    settingsActiveTab: 'asr',
    guideEnabled: true,
    continuousTour: false,
    tourRecordingEnabled: false,
    playTourRecordingEnabled: false,
    selectedTourRecordingId: '',
    wakeWordEnabled: true,
    wakeWord: 'hello assistant',
    wakeWordStrict: false,
    wakeWordCooldownMs: 5000,
    asrAutoSubmitOnWakeEnabled: true,
    asrAutoResumeAfterAnswerEnabled: true,
    asrAutoResumeAfterAnswerDelayMs: 1200,
    ...overrides,
  };
}

async function installApiMocks(page, state) {
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
      await fulfillJson(route, { settings: state.settings || buildDefaultSettings() });
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
      state.tourControlCalls.push(parseJson(request.postData(), {}));
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/ragflow/chats' && method === 'GET') {
      await fulfillJson(route, { chats: [{ name: 'Exhibit Chat' }], default: 'Exhibit Chat' });
      return;
    }
    if (path === '/api/ragflow/chats/new_session' && method === 'POST') {
      await fulfillJson(route, { ok: true, session_id: 'session-1' });
      return;
    }
    if (path === '/api/ragflow/agents' && method === 'GET') {
      await fulfillJson(route, { agents: [{ id: 'agent-1', name: 'Agent 1' }], default: '' });
      return;
    }

    if (path === '/api/history' && method === 'GET') {
      await fulfillJson(route, { items: [] });
      return;
    }

    if (path === '/api/recordings' && method === 'GET') {
      await fulfillJson(route, {
        items: state.recordingOptions || [{ recording_id: 'rec-archive-1', display_name: 'Archive 1', stop_count: 3 }],
      });
      return;
    }
    if (path === '/api/recordings/start' && method === 'POST') {
      state.recordingStarts += 1;
      await fulfillJson(route, { recording_id: 'rec-live-1' });
      return;
    }
    if (/^\/api\/recordings\/[^/]+\/finish$/.test(path) && method === 'POST') {
      state.recordingFinishes += 1;
      await fulfillJson(route, { ok: true });
      return;
    }
    if (/^\/api\/recordings\/[^/]+\/rename$/.test(path) && method === 'POST') {
      const recordingId = decodeURIComponent(path.split('/')[3] || '');
      const body = parseJson(request.postData(), {});
      state.recordingRenameCalls.push({ recordingId, body });
      state.recordingOptions = (state.recordingOptions || []).map((item) => {
        const id = String((item && item.recording_id) || '');
        if (id !== recordingId) return item;
        const displayName = String((body && body.display_name) || '').trim() || String(item.display_name || item.label || id);
        return {
          ...item,
          display_name: displayName,
          label: displayName,
        };
      });
      await fulfillJson(route, { ok: true, recording_id: recordingId, display_name: String((body && body.display_name) || '') });
      return;
    }
    if (/^\/api\/recordings\/[^/]+$/.test(path) && method === 'GET') {
      const recordingId = decodeURIComponent(path.split('/')[3] || 'rec-archive-1');
      await fulfillJson(route, { recording_id: recordingId, stops: state.recordingMetaStops || ['Stop A', 'Stop B', 'Stop C'] });
      return;
    }
    if (/^\/api\/recordings\/[^/]+\/stop\/\d+$/.test(path) && method === 'GET') {
      state.playbackStopReads += 1;
      const stopIndex = Number(path.split('/').pop());
      const customPayload = state.recordingStopPayloads && state.recordingStopPayloads[String(stopIndex)];
      if (customPayload && typeof customPayload === 'object') {
        await fulfillJson(route, customPayload);
        return;
      }
      await fulfillJson(route, {
        stop_index: Number.isFinite(stopIndex) ? stopIndex : 0,
        stop_name: `Stop ${String.fromCharCode(65 + (Number.isFinite(stopIndex) ? stopIndex : 0))}`,
        answer_text: `playback_answer_${Number.isFinite(stopIndex) ? stopIndex : 0}`,
        segments: [{ segment_id: 1, segment_index: 0, seq: 0, text: 'segment text', audio_url: '/audio.wav' }],
      });
      return;
    }
    if (/^\/api\/recordings\/[^/]+\/segment\/\d+\/regenerate$/.test(path) && method === 'POST') {
      const parts = path.split('/');
      const recordingId = decodeURIComponent(parts[3] || '');
      const segmentId = Number(parts[5]);
      const body = parseJson(request.postData(), {});
      state.segmentRegenerateCalls.push({ recordingId, segmentId, body });
      const outText = String((body && body.text) || 'regen text');
      await fulfillJson(route, {
        segment: {
          segment_id: Number.isFinite(segmentId) ? segmentId : 1,
          text: outText,
          audio_url: '/regen.wav',
        },
      });
      return;
    }
    if (/^\/api\/recordings\/[^/]+$/.test(path) && method === 'DELETE') {
      const recordingId = decodeURIComponent(path.split('/')[3] || '');
      state.recordingDeleteCalls.push(recordingId);
      state.recordingOptions = (state.recordingOptions || []).filter(
        (item) => String((item && item.recording_id) || '') !== recordingId
      );
      await fulfillJson(route, { ok: true });
      return;
    }

    if (path === '/api/tour/command/parse' && method === 'POST') {
      const body = parseJson(request.postData(), {});
      const text = String(body.text || '').trim().toLowerCase();
      let res = { intent: 'none', confidence: 0.1 };
      if (text === 'next') res = { intent: 'tour_command', action: 'next', confidence: 0.95 };
      else if (text === 'prev') res = { intent: 'tour_command', action: 'prev', confidence: 0.95 };
      else if (text.startsWith('jump')) res = { intent: 'tour_command', action: 'jump', stop_index: 1, confidence: 0.95 };
      state.parseCalls.push({ text, res });
      await fulfillJson(route, res);
      return;
    }

    if (path === '/api/ask' && method === 'POST') {
      const body = parseJson(request.postData(), {});
      state.askCalls.push(body);
      if (state.askFailOnce && !state.askFailed) {
        state.askFailed = true;
        await fulfillJson(route, { error: 'mock_error' }, 500);
        return;
      }
      if (state.askTimeoutOnce && !state.askTimedOut) {
        state.askTimedOut = true;
        try {
          await route.abort('timedout');
        } catch (_) {
          await fulfillJson(route, { error: 'mock_timeout' }, 504);
        }
        return;
      }
      if (state.askDisconnectOnce && !state.askDisconnected) {
        state.askDisconnected = true;
        await fulfillSse(route, [{ chunk: 'qa_disconnect_partial', done: false }]);
        return;
      }

      const tourAction = body && body.guide ? String(body.guide.tour_action || '').trim() : '';
      const question = String(body.question || '').trim();
      if (tourAction) await delay(900);

      try {
        await fulfillSse(route, [
          { chunk: tourAction ? `tour_${tourAction}_ok` : `qa_${question || 'ok'}`, done: false },
          { done: true },
        ]);
      } catch (_) {
        // Request may be aborted by interrupt logic.
      }
      return;
    }

    await fulfillJson(route, {});
  });
}

async function submitText(page, text) {
  await page.locator('.text-input input[type="text"]').fill(text);
  await page.locator('.text-input button[type="submit"]').click();
}

async function clickStartTour(page) {
  await page.locator('.input-section .home-actions button').first().click();
}

function createState(settingsOverrides = {}) {
  return {
    settings: buildDefaultSettings(settingsOverrides),
    askCalls: [],
    parseCalls: [],
    tourControlCalls: [],
    recordingStarts: 0,
    recordingFinishes: 0,
    playbackStopReads: 0,
    askFailOnce: false,
    askFailed: false,
    askTimeoutOnce: false,
    askTimedOut: false,
    askDisconnectOnce: false,
    askDisconnected: false,
    recordingOptions: [{ recording_id: 'rec-archive-1', display_name: 'Archive 1', stop_count: 3 }],
    recordingMetaStops: ['Stop A', 'Stop B', 'Stop C'],
    recordingStopPayloads: null,
    recordingRenameCalls: [],
    recordingDeleteCalls: [],
    segmentRegenerateCalls: [],
  };
}

test('recording narration flow: start tour with recording enabled', async ({ page }) => {
  const state = createState({ tourRecordingEnabled: true });
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await clickStartTour(page);

  await expect.poll(() => state.recordingStarts, { timeout: 7000 }).toBe(1);
  await expect.poll(() => state.askCalls.filter((call) => String(call?.guide?.tour_action || '') === 'start').length, {
    timeout: 7000,
  }).toBe(1);
});

test('playback archive flow: start tour reads archived stop payload', async ({ page }) => {
  const state = createState({ playTourRecordingEnabled: true, selectedTourRecordingId: 'rec-archive-1' });
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await clickStartTour(page);

  await expect.poll(() => state.playbackStopReads, { timeout: 7000 }).toBeGreaterThan(0);
});

test('recording management flow: rename -> regenerate segment -> delete archive', async ({ page }) => {
  const state = createState({
    playTourRecordingEnabled: true,
    selectedTourRecordingId: 'rec-archive-1',
    settingsActiveTab: 'archive',
  });
  state.recordingMetaStops = ['Stop A'];
  state.recordingStopPayloads = {
    0: {
      stop_index: 0,
      stop_name: 'Stop A',
      answer_text: 'old answer',
      segments: [{ segment_id: 11, segment_index: 0, seq: 0, text: 'old text', audio_url: '/old.wav' }],
    },
  };

  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await page.locator('.settings-tab-btn').nth(4).click();
  await expect(page.locator('.settings-tab-panel .settings-block textarea').first()).toBeVisible();
  await expect.poll(() => state.playbackStopReads, { timeout: 7000 }).toBeGreaterThan(0);

  const archiveActions = page.locator('.settings-tab-panel .settings-group').first().locator('.settings-actions .settings-action-btn');

  let promptAccepted = false;
  page.once('dialog', async (dialog) => {
    promptAccepted = dialog.type() === 'prompt';
    await dialog.accept('Archive Renamed');
  });
  await archiveActions.nth(0).click();
  await expect.poll(() => promptAccepted, { timeout: 5000 }).toBe(true);
  await expect.poll(() => state.recordingRenameCalls.length, { timeout: 7000 }).toBe(1);
  expect(state.recordingRenameCalls[0]).toEqual(
    expect.objectContaining({
      recordingId: 'rec-archive-1',
      body: expect.objectContaining({ display_name: 'Archive Renamed' }),
    })
  );

  const segmentText = page.locator('.settings-tab-panel .settings-block textarea').first();
  await segmentText.fill('segment text rewritten');
  await page.locator('.settings-tab-panel .settings-block .settings-action-btn').last().click();
  await expect.poll(() => state.segmentRegenerateCalls.length, { timeout: 7000 }).toBe(1);
  expect(state.segmentRegenerateCalls[0]).toEqual(
    expect.objectContaining({
      recordingId: 'rec-archive-1',
      segmentId: 11,
      body: expect.objectContaining({ text: 'segment text rewritten' }),
    })
  );
  await expect(segmentText).toHaveValue('segment text rewritten');

  let confirmAccepted = false;
  page.once('dialog', async (dialog) => {
    confirmAccepted = dialog.type() === 'confirm';
    await dialog.accept();
  });
  await archiveActions.nth(1).click();
  await expect.poll(() => confirmAccepted, { timeout: 5000 }).toBe(true);
  await expect.poll(() => state.recordingDeleteCalls.length, { timeout: 7000 }).toBe(1);
  expect(state.recordingDeleteCalls[0]).toBe('rec-archive-1');
});

test('group high priority takeover: active tour is interrupted and takeover question is sent', async ({ page }) => {
  const state = createState({ groupMode: true });
  await page.addInitScript(() => {
    window.__RAGINT_E2E__ = { enableAsrMock: true };
  });
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(() => ({
          setGroupMode: typeof window.__RAGINT_E2E__?.setGroupMode,
          setQuestionPriority: typeof window.__RAGINT_E2E__?.setQuestionPriority,
        })),
      { timeout: 6000 }
    )
    .toEqual({ setGroupMode: 'function', setQuestionPriority: 'function' });

  await page.evaluate(() => {
    window.__RAGINT_E2E__.setGroupMode(true);
    window.__RAGINT_E2E__.setQuestionPriority('high');
  });

  await clickStartTour(page);
  await submitText(page, 'group takeover question');

  await expect.poll(() => state.askCalls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => state.askCalls.filter((call) => String(call.question || '').includes('group takeover question')).length, {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(1);
});

test('agent mode constraint: blocks submit when agent missing, allows after selection', async ({ page }) => {
  const state = createState();
  await page.addInitScript(() => {
    window.__RAGINT_E2E__ = { enableAsrMock: true };
  });
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(() => ({
          setUseAgentMode: typeof window.__RAGINT_E2E__?.setUseAgentMode,
          setSelectedAgentId: typeof window.__RAGINT_E2E__?.setSelectedAgentId,
        })),
      { timeout: 6000 }
    )
    .toEqual({ setUseAgentMode: 'function', setSelectedAgentId: 'function' });

  await page.evaluate(() => {
    window.__RAGINT_E2E__.setUseAgentMode(true);
    window.__RAGINT_E2E__.setSelectedAgentId('');
  });

  const input = page.locator('.text-input input[type="text"]');
  const submitBtn = page.locator('.text-input button[type="submit"]');

  await input.fill('ask without agent');
  await expect(submitBtn).toBeDisabled();
  const callsAfterBlocked = state.askCalls.length;

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          window.__RAGINT_E2E__.setSelectedAgentId('agent-1');
          return String(window.__RAGINT_E2E__?.getUiState?.().selectedAgentId || '');
        }),
      { timeout: 5000 }
    )
    .toBe('agent-1');

  await input.fill('ask with agent');
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect.poll(() => state.askCalls.length, { timeout: 7000 }).toBeGreaterThan(callsAfterBlocked);
});

test('voice command chain: next/prev/jump commands are parsed and executed', async ({ page }) => {
  const state = createState();
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await submitText(page, 'next');
  await submitText(page, 'prev');
  await submitText(page, 'jump 2');

  await expect
    .poll(() => state.parseCalls.map((c) => c.text).join(','), { timeout: 7000 })
    .toContain('next');
  await expect(state.parseCalls.map((c) => c.text).join(',')).toContain('prev');
  await expect(state.parseCalls.map((c) => c.text).join(',')).toContain('jump 2');

  await expect
    .poll(
      () => state.askCalls.filter((call) => ['next', 'prev', 'jump'].includes(String(call?.guide?.tour_action || ''))).length,
      { timeout: 10000 }
    )
    .toBeGreaterThanOrEqual(3);
});

test('error recovery: first ask fails and next ask still succeeds', async ({ page }) => {
  const state = createState();
  state.askFailOnce = true;
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await submitText(page, 'fail once');
  await submitText(page, 'recover question');

  await expect.poll(() => state.askCalls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.main')).toContainText('qa_recover question');
});

test('timeout recovery: first ask times out and next ask still succeeds', async ({ page }) => {
  const state = createState();
  state.askTimeoutOnce = true;
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await submitText(page, 'timeout once');
  await expect.poll(() => state.askTimedOut, { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.locator('.loading').count(), { timeout: 10000 }).toBe(0);

  await submitText(page, 'after timeout');
  await expect.poll(() => state.askCalls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.main')).toContainText('qa_after timeout');
});

test('disconnect recovery: stream ends without done and next ask still succeeds', async ({ page }) => {
  const state = createState();
  state.askDisconnectOnce = true;
  await installApiMocks(page, state);
  await page.goto('/');
  await expect(page.locator('.app')).toBeVisible();

  await submitText(page, 'disconnect once');
  await expect.poll(() => state.askDisconnected, { timeout: 10000 }).toBe(true);
  await expect(page.locator('.main')).toContainText('qa_disconnect_partial');
  await expect.poll(() => page.locator('.loading').count(), { timeout: 10000 }).toBe(0);

  await submitText(page, 'after disconnect');
  await expect.poll(() => state.askCalls.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.main')).toContainText('qa_after disconnect');
});
