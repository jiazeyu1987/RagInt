jest.mock('voicekit-js', () => ({
  createMicRecorder: jest.fn(),
}));

import { createMicRecorder } from 'voicekit-js';
import { SaucWsRecorderManager } from './SaucWsRecorderManager';

describe('SaucWsRecorderManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: jest.fn(),
        },
      },
    });
    global.fetch = jest.fn();
    global.WebSocket = {
      OPEN: 1,
      CONNECTING: 0,
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('fails fast when SAUC settings are missing', async () => {
    const onError = jest.fn();
    const mgr = new SaucWsRecorderManager({
      baseUrl: 'http://unit.test',
      onError,
      saucOptions: {},
    });

    const started = await mgr.start();

    expect(started).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('sauc settings required');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('fails fast when explicit SAUC numeric config is invalid', () => {
    expect(
      () =>
        new SaucWsRecorderManager({
          saucOptions: {
            segmentDurationMs: 'not-a-number',
          },
        })
    ).toThrow('invalid_sauc_numeric_config:segmentDurationMs');
  });

  test('fails fast when explicit SAUC numeric config is out of range', () => {
    expect(
      () =>
        new SaucWsRecorderManager({
          saucOptions: {
            segmentDurationMs: 5000,
          },
        })
    ).toThrow('invalid_sauc_numeric_config:segmentDurationMs');
  });

  test('fails fast when explicit SAUC boolean config is invalid', () => {
    expect(
      () =>
        new SaucWsRecorderManager({
          saucOptions: {
            enableItn: 'sometimes',
          },
        })
    ).toThrow('invalid_sauc_boolean_config:enableItn');
  });

  test('fails fast when explicit timing config is invalid', () => {
    expect(
      () =>
        new SaucWsRecorderManager({
          stopGraceMs: 'slow',
          saucOptions: {
            segmentDurationMs: 200,
          },
        })
    ).toThrow('invalid_sauc_numeric_config:stopGraceMs');

    expect(
      () =>
        new SaucWsRecorderManager({
          finalWaitMs: 50,
          saucOptions: {
            segmentDurationMs: 200,
          },
        })
    ).toThrow('invalid_sauc_numeric_config:finalWaitMs');
  });

  test('does not fall back to window origin for an invalid explicit base URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sauc_proxy: {
          registered: true,
          flask_debug: false,
          aiohttp_available: true,
          simple_websocket_available: true,
          receive_timeout_supported: true,
        },
      }),
    });
    const onError = jest.fn();
    const mgr = new SaucWsRecorderManager({
      baseUrl: '://bad-base-url',
      onError,
      saucOptions: {
        wsUrl: 'wss://asr.example/ws',
        resourceId: 'res-1',
        appKey: 'app-1',
        accessKey: 'access-1',
      },
    });

    const started = await mgr.start();

    expect(started).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'SAUC proxy preflight failed',
      expect.objectContaining({
        error: 'invalid_sauc_base_url',
        base_url: '://bad-base-url',
      })
    );
  });

  test('reports invalid websocket message JSON as an error event', async () => {
    const onError = jest.fn();
    const mgr = new SaucWsRecorderManager({ onError });

    await mgr._handleServerMessage('{not-json');

    expect(onError).toHaveBeenCalledWith(
      'sauc_proxy_message_parse_failed',
      expect.objectContaining({
        error: expect.any(String),
        data_type: '[object String]',
      })
    );
    expect(onError.mock.calls[0][1].error).toBeTruthy();
  });

  test('reports preflight hint when proxy health fetch fails', async () => {
    fetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    const onError = jest.fn();
    const mgr = new SaucWsRecorderManager({
      baseUrl: 'http://unit.test',
      onError,
      saucOptions: {
        wsUrl: 'wss://asr.example/ws',
        resourceId: 'res-1',
        appKey: 'app-1',
        accessKey: 'access-1',
      },
    });

    const started = await mgr.start();

    expect(started).toBe(false);
    const call = onError.mock.calls.find((row) => row[0] === 'SAUC proxy preflight failed');
    expect(call).toBeTruthy();
    expect(call[1]).toEqual(
      expect.objectContaining({
        hint: 'backend_unreachable_or_cors_failed',
        base_url: 'http://unit.test',
      })
    );
  });

  test('stop reports final timeout when no final result arrives', () => {
    const onFinalTimeout = jest.fn();
    const onError = jest.fn();
    const onStateChange = jest.fn();
    const onRecognizingChange = jest.fn();

    const mgr = new SaucWsRecorderManager({
      stopGraceMs: 10,
      finalWaitMs: 200,
      onFinalTimeout,
      onError,
      onStateChange,
      onRecognizingChange,
    });

    const wsClose = jest.fn();
    const wsSend = jest.fn();
    const recorderStop = jest.fn();
    mgr._ws = {
      readyState: 1,
      send: wsSend,
      close: wsClose,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };
    mgr._recorder = { stop: recorderStop };
    mgr._setRecording(true);
    mgr._setRecognizing(true);

    mgr.stop();

    jest.advanceTimersByTime(10);
    expect(recorderStop).toHaveBeenCalledTimes(1);
    expect(wsSend).toHaveBeenCalledWith(JSON.stringify({ type: 'stop' }));

    jest.runOnlyPendingTimers();
    expect(onError).toHaveBeenCalledWith(
      'sauc_proxy_final_wait_timeout',
      expect.objectContaining({ reason: 'final_wait_timeout' })
    );
    expect(onFinalTimeout).toHaveBeenCalledWith('', { reason: 'final_wait_timeout' });
    expect(wsClose).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith(false);
    expect(onRecognizingChange).toHaveBeenLastCalledWith(false);
  });

  test('stop exposes websocket stop control send failures', () => {
    const onError = jest.fn();
    const onStateChange = jest.fn();
    const onRecognizingChange = jest.fn();
    const wsClose = jest.fn();
    const mgr = new SaucWsRecorderManager({
      stopGraceMs: 10,
      finalWaitMs: 200,
      onError,
      onStateChange,
      onRecognizingChange,
    });

    const sendError = new Error('ws_send_failed');
    mgr._ws = {
      readyState: 1,
      send: jest.fn(() => {
        throw sendError;
      }),
      close: wsClose,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };
    mgr._recorder = { stop: jest.fn() };
    mgr._setRecording(true);
    mgr._setRecognizing(true);

    mgr.stop();
    expect(() => jest.advanceTimersByTime(10)).not.toThrow();

    expect(onError).toHaveBeenCalledWith('sauc_proxy_control_send_failed', sendError);
    expect(wsClose).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith(false);
    expect(onRecognizingChange).toHaveBeenLastCalledWith(false);
  });

  test('cancel stops recorder and closes websocket', () => {
    const mgr = new SaucWsRecorderManager({});
    const wsClose = jest.fn();
    const wsSend = jest.fn();
    const recorderStop = jest.fn();

    mgr._ws = {
      readyState: 1,
      send: wsSend,
      close: wsClose,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };
    mgr._recorder = { stop: recorderStop };
    mgr._setRecording(true);
    mgr._setRecognizing(true);

    mgr.cancel();

    expect(wsSend).toHaveBeenCalledWith(JSON.stringify({ type: 'cancel' }));
    expect(wsClose).toHaveBeenCalledTimes(1);
    expect(recorderStop).toHaveBeenCalledTimes(1);
    expect(mgr.isRecording).toBe(false);
  });

  test('constructs recorder with recommended chunk size after successful preflight', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sauc_proxy: {
          registered: true,
          flask_debug: false,
          aiohttp_available: true,
          simple_websocket_available: true,
          receive_timeout_supported: true,
        },
      }),
    });

    let wsRef = null;
    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;

      constructor() {
        this.readyState = MockWebSocket.CONNECTING;
        this.binaryType = 'blob';
        wsRef = this;
      }

      send() {}

      close() {}
    }
    global.WebSocket = MockWebSocket;

    let recorderOpts = null;
    const recorderStart = jest.fn().mockImplementation(async () => {
      wsRef.readyState = MockWebSocket.OPEN;
      wsRef.onopen && wsRef.onopen();
      wsRef.onmessage && wsRef.onmessage({ data: JSON.stringify({ type: 'ready' }) });
    });
    createMicRecorder.mockImplementation((opts) => {
      recorderOpts = opts;
      return {
        start: recorderStart,
        stop: jest.fn(),
      };
    });

    const mgr = new SaucWsRecorderManager({
      baseUrl: 'http://unit.test',
      clientId: 'client-1',
      requestId: 'req-1',
      saucOptions: {
        wsUrl: 'wss://asr.example/ws',
        resourceId: 'res-1',
        appKey: 'app-1',
        accessKey: 'access-1',
        segmentDurationMs: 500,
      },
    });

    const started = await mgr.start();

    expect(started).toBe(true);
    expect(createMicRecorder).toHaveBeenCalledTimes(1);
    expect(recorderOpts.chunkMs).toBe(200);
    expect(recorderStart).toHaveBeenCalledTimes(1);

    mgr.cancel();
  });
});
