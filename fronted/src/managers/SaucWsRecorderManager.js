import { createMicRecorder } from 'voicekit-js';

function safeTrim(v) {
  return String(v == null ? '' : v).trim();
}

function toInt(value, fallback, { min = null, max = null, name = 'value' } = {}) {
  const missing = value == null || (typeof value === 'string' && value.trim() === '');
  if (missing) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid_sauc_numeric_config:${name}`);
  let out = Math.round(n);
  if (Number.isFinite(min) && out < Number(min)) throw new Error(`invalid_sauc_numeric_config:${name}`);
  if (Number.isFinite(max) && out > Number(max)) throw new Error(`invalid_sauc_numeric_config:${name}`);
  return out;
}

function toBool(value, fallback = false, name = 'value') {
  const missing = value == null || (typeof value === 'string' && value.trim() === '');
  if (missing) return !!fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    throw new Error(`invalid_sauc_boolean_config:${name}`);
  }
  const text = String(value).trim().toLowerCase();
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  throw new Error(`invalid_sauc_boolean_config:${name}`);
}

function normalizeSaucOptions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    wsUrl: safeTrim(src.wsUrl),
    resourceId: safeTrim(src.resourceId),
    appKey: safeTrim(src.appKey),
    accessKey: safeTrim(src.accessKey),
    modelName: safeTrim(src.modelName) || 'bigmodel',
    segmentDurationMs: toInt(src.segmentDurationMs, 200, { min: 50, max: 1000, name: 'segmentDurationMs' }),
    enableItn: toBool(src.enableItn, true, 'enableItn'),
    enablePunc: toBool(src.enablePunc, true, 'enablePunc'),
    enableDdc: toBool(src.enableDdc, true, 'enableDdc'),
    showUtterances: toBool(src.showUtterances, true, 'showUtterances'),
    enableNonstream: toBool(src.enableNonstream, false, 'enableNonstream'),
  };
}

function buildSaucProxyWsUrl(baseUrl, path = '/api/asr/sauc/ws', query = {}) {
  let originUrl = null;
  const base = safeTrim(baseUrl);
  if (base) {
    try {
      const u = new URL(base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/';
      u.search = '';
      u.hash = '';
      originUrl = u;
    } catch (_) {
      throw new Error('invalid_sauc_base_url');
    }
  }
  if (!originUrl) {
    if (typeof window === 'undefined' || !window.location) {
      throw new Error('cannot_build_ws_url_without_window_location');
    }
    originUrl = new URL(window.location.origin);
    originUrl.protocol = originUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  }
  const url = new URL(path, originUrl.toString());
  Object.entries(query || {}).forEach(([k, v]) => {
    const key = safeTrim(k);
    const val = safeTrim(v);
    if (!key || !val) return;
    url.searchParams.set(key, val);
  });
  return url.toString();
}

function buildHttpUrl(baseUrl, path = '/api/asr/sauc/health') {
  const base = safeTrim(baseUrl);
  if (base) {
    try {
      const u = new URL(base);
      return new URL(path, `${u.protocol}//${u.host}`).toString();
    } catch (_) {
      throw new Error('invalid_sauc_base_url');
    }
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return new URL(path, window.location.origin).toString();
  }
  throw new Error('cannot_build_http_url_without_window_location');
}

function toSaucPreflightHint(errorMessage) {
  const msg = safeTrim(errorMessage).toLowerCase();
  if (!msg) return 'unknown';
  if (msg.includes('sauc_proxy_health_http_404')) return 'backend_missing_sauc_proxy_route_or_wrong_backend';
  if (msg.includes('sauc_proxy_health_http_401') || msg.includes('sauc_proxy_health_http_403')) {
    return 'backend_auth_or_proxy_rejected';
  }
  if (msg.includes('sauc_proxy_health_timeout')) return 'backend_health_timeout';
  if (msg.includes('fetch_failed') || msg.includes('failed to fetch')) return 'backend_unreachable_or_cors_failed';
  if (msg.includes('registered') || msg.includes('not_registered')) return 'sauc_proxy_not_registered';
  return 'preflight_failed';
}

async function fetchSaucProxyHealth(baseUrl) {
  const url = buildHttpUrl(baseUrl, '/api/asr/sauc/health');
  const fetchPromise = fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`sauc_proxy_health_http_${resp.status}`);
      const data = await resp.json().catch(() => null);
      return data && typeof data === 'object' ? data : null;
    })
    .catch((e) => {
      throw new Error(safeTrim(e && e.message) || 'sauc_proxy_health_fetch_failed');
    });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('sauc_proxy_health_timeout')), 2000);
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}

function summarizeSaucProxyHint(proxy, healthErr) {
  const p = proxy && typeof proxy === 'object' ? proxy : {};
  const last = p.last_event && typeof p.last_event === 'object' ? p.last_event : {};
  const stage = safeTrim(last.stage);
  const prevStage = safeTrim(last.prev_stage);
  const prevError = safeTrim(last.prev_error || last.error);

  const history = Array.isArray(p.event_history) ? p.event_history : [];
  const recent = history.slice(-8);
  let meaningful = null;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const item = recent[i];
    if (!item || typeof item !== 'object') continue;
    const s = safeTrim(item.stage);
    if (!s) continue;
    if (s === 'disconnected' || s === 'client_closed' || s === 'upstream_loop_closed') continue;
    meaningful = item;
    break;
  }

  const meaningfulStage = safeTrim(meaningful && meaningful.stage);
  const meaningfulError = safeTrim((meaningful && (meaningful.error || meaningful.prev_error)) || '');
  const meaningfulCode = meaningful && Object.prototype.hasOwnProperty.call(meaningful, 'code')
    ? meaningful.code
    : null;

  if (meaningfulStage) {
    if (meaningfulError && meaningfulCode != null) return `${meaningfulStage}:${meaningfulError}:${meaningfulCode}`;
    if (meaningfulError) return `${meaningfulStage}:${meaningfulError}`;
    if (meaningfulCode != null) return `${meaningfulStage}:code_${meaningfulCode}`;
    return meaningfulStage;
  }

  if (stage === 'disconnected' && prevStage) {
    if (prevError) return `${prevStage}:${prevError}`;
    return prevStage;
  }

  if (stage) {
    if (prevError) return `${stage}:${prevError}`;
    return `last_event:${stage}`;
  }

  return toSaucPreflightHint(healthErr);
}

async function parseWsMessageData(data) {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  if (data instanceof ArrayBuffer) {
    const text = new TextDecoder('utf-8').decode(new Uint8Array(data));
    return JSON.parse(text);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const text = await data.text();
    return JSON.parse(text);
  }
  return null;
}

export class SaucWsRecorderManager {
  constructor({
    baseUrl,
    clientId,
    requestId,
    sampleRate = 16000,
    stopGraceMs = 480,
    finalWaitMs = 1500,
    continuous = false,
    label,
    onStateChange,
    onRecognizingChange,
    onPartialText,
    onFinalText,
    onFinalTimeout,
    onEvent,
    onError,
    onLog,
    saucOptions,
  } = {}) {
    this._baseUrl = safeTrim(baseUrl || '');
    this._label = safeTrim(label);
    this._clientId = safeTrim(clientId);
    this._requestId = safeTrim(requestId);
    this._targetSampleRate = toInt(sampleRate, 16000, { min: 8000, max: 48000, name: 'sampleRate' });
    this._continuous = !!continuous;

    this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this._onRecognizingChange = typeof onRecognizingChange === 'function' ? onRecognizingChange : null;
    this._onPartialText = typeof onPartialText === 'function' ? onPartialText : null;
    this._onFinalText = typeof onFinalText === 'function' ? onFinalText : null;
    this._onFinalTimeout = typeof onFinalTimeout === 'function' ? onFinalTimeout : null;
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._onError = typeof onError === 'function' ? onError : null;
    this._log = typeof onLog === 'function' ? onLog : null;

    this._saucOptions = normalizeSaucOptions(saucOptions);

    this._recorder = null;
    this._ws = null;
    this._wsReady = false;
    this._frameQueue = [];
    this._isRecording = false;
    this._stopRequested = false;
    this._stopping = false;
    this._finalReceived = false;
    this._isRecognizing = false;
    this._stopGraceTimer = null;
    this._finalWaitTimer = null;
    this._stopGraceMs = toInt(stopGraceMs, 480, { min: 0, max: 5000, name: 'stopGraceMs' });
    this._finalWaitMs = toInt(finalWaitMs, 1500, { min: 200, max: 30000, name: 'finalWaitMs' });
    this._lastPartialText = '';
    this._readyResolve = null;
    this._readyReject = null;
    this._preReadyFailureReported = false;
  }

  get isRecording() {
    return !!this._isRecording;
  }

  _setRecording(next) {
    this._isRecording = !!next;
    if (this._onStateChange) {
      try {
        this._onStateChange(this._isRecording);
      } catch (_) {
        // ignore
      }
    }
  }

  _setRecognizing(next) {
    this._isRecognizing = !!next;
    if (this._onRecognizingChange) {
      try {
        this._onRecognizingChange(this._isRecognizing);
      } catch (_) {
        // ignore
      }
    }
  }

  _fail(msg, err) {
    if (this._log) this._log('[ASR-SAUC]', { label: this._label }, msg, err || '');
    if (this._onError) {
      try {
        this._onError(msg, err);
      } catch (_) {
        // ignore
      }
    }
    // eslint-disable-next-line no-console
    console.error('[ASR-SAUC]', msg, err || null);
    try {
      const hint = safeTrim(err && err.hint);
      const stage = safeTrim(err && err.sauc_proxy && err.sauc_proxy.last_event && err.sauc_proxy.last_event.stage);
      if (hint || stage) {
        // eslint-disable-next-line no-console
        console.error('[ASR-SAUC] detail', { hint, stage });
      }
    } catch (_) {
      // ignore
    }
  }

  _emitInfo(message, extra = null) {
    if (!this._onEvent) return;
    try {
      this._onEvent({
        type: 'info',
        message: safeTrim(message),
        request_id: this._requestId || '',
        ...(extra && typeof extra === 'object' ? extra : {}),
      });
    } catch (_) {
      // ignore
    }
  }

  _resolveReady() {
    if (!this._readyResolve) return;
    try {
      this._readyResolve();
    } catch (_) {
      // ignore
    }
    this._readyResolve = null;
    this._readyReject = null;
  }

  _rejectReady(err) {
    if (!this._readyReject) return;
    try {
      this._readyReject(err instanceof Error ? err : new Error(safeTrim(err)));
    } catch (_) {
      // ignore
    }
    this._readyResolve = null;
    this._readyReject = null;
  }

  _cleanup() {
    this._wsReady = false;
    this._frameQueue = [];
    if (this._stopGraceTimer) {
      try {
        clearTimeout(this._stopGraceTimer);
      } catch (_) {
        // ignore
      }
      this._stopGraceTimer = null;
    }
    if (this._finalWaitTimer) {
      try {
        clearTimeout(this._finalWaitTimer);
      } catch (_) {
        // ignore
      }
      this._finalWaitTimer = null;
    }
    this._stopRequested = false;
    this._stopping = false;
    this._finalReceived = false;
    this._lastPartialText = '';
    this._readyResolve = null;
    this._readyReject = null;
    this._preReadyFailureReported = false;
    this._setRecognizing(false);
    this._setRecording(false);
  }

  _reportPreReadyFailure(tag, evt) {
    if (this._preReadyFailureReported) return;
    this._preReadyFailureReported = true;
    (async () => {
      let health = null;
      let healthErr = '';
      try {
        health = await fetchSaucProxyHealth(this._baseUrl);
      } catch (e) {
        health = null;
        healthErr = safeTrim(e && e.message);
      }
      const proxy = health && health.sauc_proxy && typeof health.sauc_proxy === 'object' ? health.sauc_proxy : null;
      const hint = summarizeSaucProxyHint(proxy, healthErr);
      this._fail(tag, {
        event: evt || null,
        sauc_proxy: proxy,
        health_error: healthErr || '',
        hint,
        base_url: this._baseUrl || '',
      });
    })();
  }

  _stopMicOnly() {
    try {
      if (this._recorder) this._recorder.stop();
    } catch (_) {
      // ignore
    }
    this._recorder = null;
  }

  _disposeWs() {
    const ws = this._ws;
    this._ws = null;
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    } catch (_) {
      // ignore
    }
  }

  _sendControlMessage(message) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    try {
      this._ws.send(JSON.stringify(message));
    } catch (e) {
      this._fail('sauc_proxy_control_send_failed', e);
      throw e;
    }
  }

  async _handleServerMessage(rawData) {
    let msg = null;
    try {
      msg = await parseWsMessageData(rawData);
    } catch (e) {
      const err = {
        error: safeTrim(e && e.message) || 'invalid_json',
        data_type: Object.prototype.toString.call(rawData),
      };
      if (!this._wsReady) this._rejectReady(new Error('sauc_proxy_message_parse_failed'));
      this._fail('sauc_proxy_message_parse_failed', err);
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const type = safeTrim(msg.type).toLowerCase();
    if (type === 'ready') {
      this._wsReady = true;
      this._resolveReady();
      this._emitInfo('sauc_ready');
      return;
    }

    if (type === 'state') {
      this._emitInfo(msg.message || msg.stage || 'state');
      return;
    }

    if (type === 'partial') {
      const text = safeTrim(msg.text);
      if (!text) return;
      this._lastPartialText = text;
      if (this._onPartialText) this._onPartialText(text, msg);
      return;
    }

    if (type === 'final') {
      const text = safeTrim(msg.text);
      this._lastPartialText = text;
      if (this._onFinalText) this._onFinalText(text, msg);
      this._finalReceived = true;
      this._setRecognizing(false);

      if (this._stopping && !this._continuous) {
        if (this._finalWaitTimer) {
          try {
            clearTimeout(this._finalWaitTimer);
          } catch (_) {
            // ignore
          }
          this._finalWaitTimer = null;
        }
        this._disposeWs();
        this._setRecording(false);
      }
      return;
    }

    if (type === 'error') {
      const msgText = safeTrim(msg.message || 'sauc_proxy_error');
      const errCode = Number(msg.code);
      const err = Number.isFinite(errCode) ? { ...msg, code: errCode } : msg;
      if (!this._wsReady) this._rejectReady(new Error(msgText));
      this._setRecognizing(false);
      if (!this._stopRequested && !this._stopping) this._fail(msgText, err);
    }
  }

  async start() {
    if (this.isRecording) return true;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this._fail('Browser does not support getUserMedia');
      return false;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this._fail('Browser security restriction: microphone requires https or localhost');
      return false;
    }

    const opts = normalizeSaucOptions(this._saucOptions);
    if (!opts.appKey || !opts.accessKey || !opts.resourceId || !opts.wsUrl) {
      this._fail('sauc settings required: appKey/accessKey/resourceId/wsUrl');
      return false;
    }

    try {
      const health = await fetchSaucProxyHealth(this._baseUrl);
      const proxy = health && health.sauc_proxy && typeof health.sauc_proxy === 'object' ? health.sauc_proxy : {};
      if (!proxy.registered) throw new Error('sauc_proxy_not_registered');
      if (proxy.flask_debug) throw new Error('backend_debug_mode_not_supported_for_sauc_ws');
      if (!proxy.aiohttp_available) throw new Error('aiohttp_not_available_on_server');
      if (!proxy.simple_websocket_available) throw new Error('simple_websocket_not_available_on_server');
      if (!proxy.receive_timeout_supported) throw new Error('simple_websocket_receive_timeout_not_supported_on_server');
    } catch (e) {
      const message = safeTrim(e && e.message);
      this._fail('SAUC proxy preflight failed', {
        error: message || String(e || ''),
        hint: toSaucPreflightHint(message),
        base_url: this._baseUrl || '',
      });
      return false;
    }

    this._cleanup();
    this._disposeWs();
    this._setRecognizing(true);
    this._setRecording(true);

    const sessionId = this._requestId || `saucws_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const wsUrl = buildSaucProxyWsUrl(this._baseUrl, '/api/asr/sauc/ws', {
      client_id: this._clientId,
      request_id: sessionId,
    });

    const readyPromise = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });

    this._wsReady = false;
    this._frameQueue = [];

    this._ws = new WebSocket(wsUrl);
    this._ws.binaryType = 'arraybuffer';

    this._ws.onopen = () => {
      this._sendControlMessage({
        type: 'start',
        request_id: sessionId,
        config: {
          app_key: opts.appKey,
          access_key: opts.accessKey,
          resource_id: opts.resourceId,
          ws_url: opts.wsUrl,
          model_name: opts.modelName,
          seg_duration_ms: opts.segmentDurationMs,
          enable_itn: opts.enableItn,
          enable_punc: opts.enablePunc,
          enable_ddc: opts.enableDdc,
          show_utterances: opts.showUtterances,
          enable_nonstream: opts.enableNonstream,
        },
      });
    };

    this._ws.onmessage = async (evt) => {
      await this._handleServerMessage(evt && evt.data);
    };

    this._ws.onerror = (evt) => {
      if (!this._wsReady && !this._stopRequested && !this._stopping) {
        this._rejectReady(new Error('sauc_proxy_ws_error'));
        this._reportPreReadyFailure('sauc_proxy_ws_error', evt || null);
      } else if (!this._stopRequested && !this._stopping) {
        this._fail('sauc_proxy_ws_error', evt || null);
      }
    };

    this._ws.onclose = (evt) => {
      if (!this._wsReady && !this._stopRequested && !this._stopping) {
        this._rejectReady(new Error('sauc_proxy_ws_closed_before_ready'));
        this._reportPreReadyFailure('sauc_proxy_ws_closed_before_ready', {
          code: evt && typeof evt.code === 'number' ? evt.code : null,
          reason: safeTrim(evt && evt.reason),
          wasClean: !!(evt && evt.wasClean),
        });
      }
      if (!this._stopRequested && !this._stopping && !this._finalReceived) {
        this._setRecognizing(false);
        this._fail('sauc_proxy_ws_closed_unexpectedly');
      }
    };

    const recommendedChunkMs = Math.max(100, Math.min(200, Number(opts.segmentDurationMs) || 200));

    this._recorder = createMicRecorder({
      dstSampleRate: this._targetSampleRate,
      chunkMs: recommendedChunkMs,
      onFrame: (buf) => {
        if (!this._ws || this._stopping) return;
        if (!(buf instanceof ArrayBuffer)) return;
        if (!this._wsReady || this._ws.readyState !== WebSocket.OPEN) {
          this._frameQueue.push(buf);
          if (this._frameQueue.length > 25) this._frameQueue.shift();
          return;
        }
        this._ws.send(buf);
      },
      onError: (e) => this._fail('Failed to access microphone', e),
    });

    try {
      await this._recorder.start();

      const readyTimeoutMs = 6000;
      await Promise.race([
        readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sauc_proxy_ready_timeout')), readyTimeoutMs)),
      ]);

      this._wsReady = true;
      if (this._frameQueue.length && this._ws && this._ws.readyState === WebSocket.OPEN) {
        const q = this._frameQueue;
        this._frameQueue = [];
        for (const b of q) this._ws.send(b);
      }
      return true;
    } catch (e) {
      this._stopMicOnly();
      this._disposeWs();
      const stoppedBeforeReady = !!(this._stopRequested || this._stopping);
      this._cleanup();
      if (stoppedBeforeReady) return false;
      this._fail('Failed to start SAUC ASR', e);
      return false;
    }
  }

  stop() {
    if (!this._recorder) return;
    if (this._stopRequested || this._stopping) return;
    this._stopRequested = true;

    if (this._stopGraceTimer) {
      try {
        clearTimeout(this._stopGraceTimer);
      } catch (_) {
        // ignore
      }
      this._stopGraceTimer = null;
    }

    this._stopGraceTimer = setTimeout(() => {
      this._stopGraceTimer = null;
      this._stopping = true;

      this._wsReady = false;
      this._frameQueue = [];
      this._stopMicOnly();
      try {
        this._sendControlMessage({ type: 'stop' });
      } catch (_) {
        this._disposeWs();
        this._setRecognizing(false);
        this._setRecording(false);
        return;
      }

      if (this._finalReceived || this._continuous) {
        this._disposeWs();
        this._setRecognizing(false);
        this._setRecording(false);
        return;
      }

      if (this._finalWaitTimer) {
        try {
          clearTimeout(this._finalWaitTimer);
        } catch (_) {
          // ignore
        }
      }
      this._finalWaitTimer = setTimeout(() => {
        this._finalWaitTimer = null;
        const timeoutInfo = { reason: 'final_wait_timeout' };
        this._fail('sauc_proxy_final_wait_timeout', timeoutInfo);
        if (this._onFinalTimeout) {
          try {
            this._onFinalTimeout(this._lastPartialText, timeoutInfo);
          } catch (_) {
            // ignore
          }
        }
        this._disposeWs();
        this._setRecognizing(false);
        this._setRecording(false);
      }, this._finalWaitMs);
    }, this._stopGraceMs);
  }

  cancel() {
    try {
      this._sendControlMessage({ type: 'cancel' });
    } catch (_) {
      // ignore
    }
    this._disposeWs();
    this._stopMicOnly();
    this._cleanup();
  }
}
