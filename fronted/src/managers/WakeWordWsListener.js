import { PcmWsRecorderManager } from './PcmWsRecorderManager';
import { buildAsrWsUrl } from '../config/voiceEndpoints';

function safeTrim(v) {
  if (v == null) return '';
  return String(v).trim();
}

export class WakeWordWsListener {
  constructor({ onLog } = {}) {
    this._log = typeof onLog === 'function' ? onLog : null;
    this._mgr = null;
    this._cfg = {};
    this._callbacksRef = null;
    this._stateListener = null;
    this._busyChecker = null;
    this._paused = false;
    this._restart = { timer: null, backoffMs: 500 };
    this._resume = { timer: null };
  }

  setCallbacks(ref) {
    this._callbacksRef = ref || null;
  }

  setStateListener(fn) {
    this._stateListener = typeof fn === 'function' ? fn : null;
  }

  setBusyChecker(fn) {
    this._busyChecker = typeof fn === 'function' ? fn : null;
  }

  setOptions(next = {}) {
    const prev = this._cfg || {};
    const merged = { ...prev, ...next };
    this._cfg = merged;

    if (!this._shouldRun()) {
      this.stop();
      return;
    }
    if (this._hasChanged(prev, merged)) {
      this.stop();
    }
    if (!prev.enabled && merged.enabled) {
      this._scheduleResume(1200);
      return;
    }
    this._ensure();
  }

  pause() {
    this._paused = true;
    this.stop();
  }

  resume(delayMs = 1200) {
    this._paused = false;
    this._scheduleResume(delayMs);
  }

  stop() {
    if (this._mgr) {
      try {
        this._mgr.cancel();
      } catch (_) {
        // ignore
      }
      this._mgr = null;
    }
    this._notifyState(false);
    this._clearRestart();
    this._clearResume();
  }

  dispose() {
    this.stop();
    this._callbacksRef = null;
    this._stateListener = null;
    this._busyChecker = null;
  }

  _shouldRun() {
    const cfg = this._cfg || {};
    if (!cfg || !cfg.enabled) return false;
    if (this._paused) return false;
    if (this._busy()) return false;
    return Boolean(cfg.clientId && cfg.baseUrl && cfg.wakeWord);
  }

  _busy() {
    if (typeof this._busyChecker === 'function') {
      try {
        return !!this._busyChecker();
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  _hasChanged(prev, next) {
    return (
      prev.baseUrl !== next.baseUrl ||
      prev.clientId !== next.clientId ||
      prev.wakeWord !== next.wakeWord ||
      prev.strictMode !== next.strictMode ||
      prev.cooldownMs !== next.cooldownMs ||
      prev.enabled !== next.enabled ||
      prev.continuous !== next.continuous
    );
  }

  _ensure() {
    if (!this._shouldRun()) return;
    if (this._mgr) return;

    const cfg = this._cfg || {};
    this._resetBackoff();
    this._mgr = new PcmWsRecorderManager({
      wsUrl: buildAsrWsUrl(cfg.baseUrl, { role: 'wake' }),
      label: 'wake',
      clientId: cfg.clientId,
      requestId: `wakews_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sampleRate: 16000,
      continuous: true,
      startPayload: {
        wake_word_enabled: true,
        wake_word: cfg.wakeWord,
        wake_match_mode: cfg.strictMode ? 'prefix' : 'contains',
        wake_cooldown_ms: Number(cfg.cooldownMs) || 0,
        emit_prewake: true,
      },
      onEvent: (evt) => this._onWakeEvent(evt),
      onFinalText: (text) => this._onWakeFinalText(text),
      onError: (msg) => this._onWakeError(msg),
      onLog: (...args) => (this._log ? this._log('[WAKE-WS]', ...args) : null),
    });

    this._notifyState(true);
    Promise.resolve()
      .then(() => this._mgr.start())
      .catch(() => this._scheduleRestart());
  }

  _onWakeEvent(evt) {
    const type = safeTrim(evt && evt.type).toLowerCase();
    if (!type) return;
    const cb = this._callbacksRef ? this._callbacksRef.current : null;
    const onFeedback = cb && typeof cb.onFeedback === 'function' ? cb.onFeedback : null;
    if (type === 'wake') {
      if (onFeedback) onFeedback({ kind: 'wake_word', level: 'info', message: `已唤醒：${safeTrim(this._cfg && this._cfg.wakeWord)}` });
      return;
    }
    if (type === 'info') {
      const m = safeTrim(evt && evt.message);
      if (m && onFeedback) onFeedback({ kind: 'wake_word', level: 'info', message: m });
      return;
    }
    if (type === 'partial' && evt && evt.prewake) {
      const m = safeTrim(evt && evt.text);
      if (m && onFeedback) onFeedback({ kind: 'wake_word', level: 'info', message: m });
    }
  }

  _onWakeFinalText(text) {
    const q = safeTrim(text);
    if (!q) return;
    if (this._busy()) return;
    const cb = this._callbacksRef ? this._callbacksRef.current : null;
    if (!cb) return;
    const submitText = typeof cb.submitText === 'function' ? cb.submitText : null;
    const askQuestion = typeof cb.askQuestion === 'function' ? cb.askQuestion : null;
    const onFeedback = typeof cb.onFeedback === 'function' ? cb.onFeedback : null;

    Promise.resolve()
      .then(async () => {
        if (submitText) return await submitText(q, { source: 'wake_word' });
        if (askQuestion) return await askQuestion(q, { source: 'wake_word' });
        return null;
      })
      .catch((e) => {
        const m = safeTrim((e && e.message) || e);
        if (m && onFeedback) onFeedback({ kind: 'wake_word', level: 'error', message: m });
      });
  }

  _onWakeError(msg) {
    const m = safeTrim(msg);
    const cb = this._callbacksRef ? this._callbacksRef.current : null;
    const onFeedback = cb && typeof cb.onFeedback === 'function' ? cb.onFeedback : null;
    if (m && onFeedback) onFeedback({ kind: 'wake_word', level: 'error', message: m });
    this._scheduleRestart();
  }

  _scheduleRestart() {
    if (!this._cfg || !this._cfg.enabled) return;
    if (this._restart.timer) return;
    const ms = Math.max(300, Math.min(8000, Number(this._restart.backoffMs) || 500));
    this._restart.backoffMs = Math.min(8000, ms * 1.7);
    this._restart.timer = setTimeout(() => {
      this._restart.timer = null;
      this.stop();
      this._ensure();
    }, ms);
  }

  _clearRestart() {
    if (!this._restart.timer) return;
    try {
      clearTimeout(this._restart.timer);
    } catch (_) {
      // ignore
    }
    this._restart.timer = null;
  }

  _resetBackoff() {
    this._restart.backoffMs = 500;
  }

  _scheduleResume(delayMs) {
    if (!this._cfg || !this._cfg.enabled) return;
    if (this._resume.timer) return;
    const ms = Math.max(200, Math.min(8000, Number(delayMs) || 800));
    this._resume.timer = setTimeout(() => {
      this._resume.timer = null;
      this._ensure();
    }, ms);
  }

  _clearResume() {
    if (!this._resume.timer) return;
    try {
      clearTimeout(this._resume.timer);
    } catch (_) {
      // ignore
    }
    this._resume.timer = null;
  }

  _notifyState(active) {
    if (!this._stateListener) return;
    try {
      this._stateListener(!!active);
    } catch (_) {
      // ignore
    }
  }
}
