import {
  backendUrl,
  cancelRequest,
  emitClientEvent,
  fetchAppSettings,
  fetchJson,
  filterAsrText,
  saveAppSettings,
} from './backendClient';

function mockResponse({ ok = true, status = 200, contentType = 'application/json', jsonValue, textValue = '' } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (key) => (String(key || '').toLowerCase() === 'content-type' ? contentType : null),
    },
    json: jest.fn(async () => (jsonValue == null ? {} : jsonValue)),
    text: jest.fn(async () => String(textValue || '')),
  };
}

describe('backendClient', () => {
  const originalFetch = global.fetch;
  const originalSendBeacon = navigator.sendBeacon;

  beforeEach(() => {
    global.fetch = jest.fn();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: originalSendBeacon,
    });
  });

  test('fetchJson returns JSON body when content type is application/json', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ jsonValue: { ok: true, value: 1 } }));

    const result = await fetchJson('/api/demo', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: 'abc',
      signal: 'sig',
    });

    expect(result).toEqual({ ok: true, value: 1 });
    expect(global.fetch).toHaveBeenCalledWith(backendUrl('/api/demo'), {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: 'abc',
      signal: 'sig',
    });
  });

  test('fetchJson throws on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }));

    await expect(fetchJson('/api/forbidden')).rejects.toThrow('HTTP 403 /api/forbidden');
  });

  test('fetchJson parses JSON from text body when content type is not json', async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        contentType: 'text/plain',
        textValue: '{"ok":true,"x":2}',
      })
    );

    await expect(fetchJson('/api/text_json')).resolves.toEqual({ ok: true, x: 2 });
  });

  test('fetchJson rejects text body that is not JSON', async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        contentType: 'text/plain',
        textValue: 'plain body',
      })
    );

    await expect(fetchJson('/api/text_plain')).rejects.toThrow('Invalid JSON response /api/text_plain');
  });

  test('cancelRequest is no-op when requestId is empty', () => {
    cancelRequest({ requestId: '', clientId: 'c1' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cancelRequest prefers sendBeacon when sendBeacon succeeds', () => {
    const sendBeacon = jest.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    cancelRequest({ requestId: ' rid ', clientId: ' c1 ', reason: 'manual' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe(backendUrl('/api/cancel'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cancelRequest falls back to fetch when sendBeacon fails', async () => {
    const sendBeacon = jest.fn(() => false);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    global.fetch.mockResolvedValueOnce({ ok: true });

    cancelRequest({ requestId: 'rid', clientId: 'client-x' });
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith(
      backendUrl('/api/cancel'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': 'client-x' },
      })
    );
  });

  test('emitClientEvent validates required fields', async () => {
    await expect(emitClientEvent({ name: 'evt' })).resolves.toEqual({ ok: false, error: 'request_id_required' });
    await expect(emitClientEvent({ requestId: 'rid', name: ' ' })).resolves.toEqual({ ok: false, error: 'name_required' });
  });

  test('emitClientEvent posts payload and returns fetch result', async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        jsonValue: { ok: true },
      })
    );

    const result = await emitClientEvent({
      requestId: 'rid',
      clientId: ' client-a ',
      name: 'event_1',
      fields: { x: 1 },
    });

    expect(result).toEqual({ ok: true });
    const [, init] = global.fetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload).toEqual({
      request_id: 'rid',
      client_id: 'client-a',
      kind: 'client',
      name: 'event_1',
      level: 'info',
      fields: { x: 1 },
    });
  });

  test('emitClientEvent returns structured error when request fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network_down'));
    const result = await emitClientEvent({
      requestId: 'rid',
      name: 'evt',
    });
    expect(result).toEqual({ ok: false, error: 'network_down' });
  });

  test('filterAsrText posts normalized payload fields', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ jsonValue: { corrected_text: 'abc' } }));
    await filterAsrText({
      text: 'A',
      prompt: 'P',
      chatName: 'C',
      domainTerms: 'D',
    });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(backendUrl('/api/asr/filter'));
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      text: 'A',
      prompt: 'P',
      chat_name: 'C',
      domain_terms: 'D',
    });
  });

  test('fetchAppSettings and saveAppSettings send expected headers/body', async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ jsonValue: { settings: {} } }));
    await fetchAppSettings({ clientId: ' c1 ' });

    expect(global.fetch.mock.calls[0][0]).toBe(backendUrl('/api/app_settings'));
    expect(global.fetch.mock.calls[0][1]).toEqual({
      method: 'GET',
      headers: { 'X-Client-ID': 'c1' },
      body: undefined,
      signal: undefined,
    });

    global.fetch.mockResolvedValueOnce(mockResponse({ jsonValue: { ok: true } }));
    await saveAppSettings({ clientId: ' c2 ', settings: { a: 1 } });
    const [url2, init2] = global.fetch.mock.calls[1];
    expect(url2).toBe(backendUrl('/api/app_settings'));
    expect(init2.method).toBe('PUT');
    expect(init2.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Client-ID': 'c2',
    });
    expect(JSON.parse(init2.body)).toEqual({
      client_id: 'c2',
      settings: { a: 1 },
    });
  });
});

