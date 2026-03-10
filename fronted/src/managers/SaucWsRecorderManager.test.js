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

  test('stop triggers final-timeout fallback when no final result arrives', () => {
    const onFinalTimeout = jest.fn();
    const onStateChange = jest.fn();
    const onRecognizingChange = jest.fn();

    const mgr = new SaucWsRecorderManager({
      stopGraceMs: 10,
      finalWaitMs: 50,
      onFinalTimeout,
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
    expect(onFinalTimeout).toHaveBeenCalledWith('', { reason: 'final_wait_timeout' });
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
