import { LocalSpeechTtsManager } from './LocalSpeechTtsManager';
import { TtsQueueManager } from './TtsQueueManager';

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'local' || m === 'speech' || m === 'speechsynthesis') return 'local';
  return 'online';
}

export class TtsBroadcastManager {
  constructor(opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    this._mode = normalizeMode(options.mode);

    const onlineOpts = (options.online && typeof options.online === 'object' ? options.online : {}) || {};
    const localOpts = (options.local && typeof options.local === 'object' ? options.local : {}) || {};

    this._online = new TtsQueueManager({
      ...(onlineOpts || {}),
      onDebug: typeof options.onDebug === 'function' ? options.onDebug : onlineOpts.onDebug,
      onLog: typeof options.onLog === 'function' ? options.onLog : onlineOpts.onLog,
      onWarn: typeof options.onWarn === 'function' ? options.onWarn : onlineOpts.onWarn,
      onError: typeof options.onError === 'function' ? options.onError : onlineOpts.onError,
    });

    this._local = new LocalSpeechTtsManager({
      ...(localOpts || {}),
      onDebug: typeof options.onDebug === 'function' ? options.onDebug : localOpts.onDebug,
      onLog: typeof options.onLog === 'function' ? options.onLog : localOpts.onLog,
      onWarn: typeof options.onWarn === 'function' ? options.onWarn : localOpts.onWarn,
      onError: typeof options.onError === 'function' ? options.onError : localOpts.onError,
    });

    this._requestId = null;
  }

  getMode() {
    return this._mode;
  }

  setMode(mode, reason) {
    const next = normalizeMode(mode);
    if (next === this._mode) return;

    const rid = this._requestId;
    try {
      this.stop(reason || 'mode_switch');
    } catch (_) {
      // ignore
    }

    this._mode = next;
    if (rid) this.resetForRun({ requestId: rid });
  }

  _cur() {
    return this._mode === 'local' ? this._local : this._online;
  }

  _inactive() {
    return this._mode === 'local' ? this._online : this._local;
  }

  _muteRequestIdForStop(mgr, fn) {
    if (!mgr || typeof fn !== 'function') return;
    const prev = mgr._requestId;
    try {
      mgr._requestId = null;
      fn();
    } finally {
      mgr._requestId = prev;
    }
  }

  _silentResetForRun(mgr, requestId) {
    if (!mgr) return;
    // Prevent stop() inside resetForRun() from emitting a duplicate client-event,
    // but keep the new requestId after reset.
    mgr._requestId = null;
    mgr.resetForRun({ requestId });
  }

  resetForRun({ requestId } = {}) {
    this._requestId = requestId || null;

    // Reset active manager normally (it may emit "play_cancelled" for previous rid).
    this._cur().resetForRun({ requestId });

    // Reset inactive manager silently to avoid duplicate client-events.
    const inactive = this._inactive();
    this._silentResetForRun(inactive, requestId);
  }

  stop(reason) {
    // Stop active manager normally; stop inactive silently to avoid duplicate client-events.
    this._cur().stop(reason);
    const inactive = this._inactive();
    this._muteRequestIdForStop(inactive, () => inactive.stop(reason));
  }

  markRagDone() {
    this._cur().markRagDone();
  }

  hasAnySegment() {
    return this._cur().hasAnySegment();
  }

  enqueueText(text, meta) {
    return this._cur().enqueueText(text, meta);
  }

  enqueueWavBytes(wavBytes, meta) {
    // WAV bytes playback only makes sense for online manager.
    return this._online.enqueueWavBytes(wavBytes, meta);
  }

  getStats() {
    const s = this._cur().getStats();
    return { ...(s || {}), mode: this._mode };
  }

  isBusy() {
    return this._cur().isBusy();
  }

  ensureRunning() {
    this._cur().ensureRunning();
  }

  waitForIdle() {
    return this._cur().waitForIdle();
  }
}
