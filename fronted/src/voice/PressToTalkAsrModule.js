import { createPressToTalkProvider } from './providers/createPressToTalkProvider';

export class PressToTalkAsrModule {
  constructor({ onLog, providerType = 'voicekit_ws' } = {}) {
    this._providerType = String(providerType || 'voicekit_ws').trim().toLowerCase() || 'voicekit_ws';
    this._provider = createPressToTalkProvider({ providerType: this._providerType, onLog });
    this._isCapturing = false;
    this._isRecognizing = false;
    this._manualHoldActive = false;
    this._listeners = {
      onCaptureChange: null,
      onRecognizingChange: null,
      onRecordingChange: null,
    };
  }

  configure(deps = {}) {
    const cfg = deps && typeof deps === 'object' ? deps : {};
    this._listeners.onCaptureChange = typeof cfg.onCaptureChange === 'function' ? cfg.onCaptureChange : null;
    this._listeners.onRecognizingChange = typeof cfg.onRecognizingChange === 'function' ? cfg.onRecognizingChange : null;
    this._listeners.onRecordingChange = typeof cfg.onRecordingChange === 'function' ? cfg.onRecordingChange : null;

    const { onCaptureChange, onRecognizingChange, onRecordingChange, ...workflowDeps } = cfg;
    this._provider.configure({
      ...workflowDeps,
      onRecordingChange: (value) => this._setCaptureState(!!value),
      onRecognizingChange: (value) => this._setRecognizingState(!!value),
    });
  }

  get isCapturing() {
    return !!this._isCapturing;
  }

  get isRecognizing() {
    return !!this._isRecognizing;
  }

  get isManualHoldActive() {
    return !!this._manualHoldActive;
  }

  _setCaptureState(next) {
    const normalized = !!next;
    if (this._isCapturing !== normalized) this._isCapturing = normalized;

    const onCaptureChange = this._listeners.onCaptureChange;
    if (onCaptureChange) {
      try {
        onCaptureChange(normalized);
      } catch (_) {
        // ignore
      }
    }

    const onRecordingChange = this._listeners.onRecordingChange;
    if (onRecordingChange) {
      try {
        onRecordingChange(normalized);
      } catch (_) {
        // ignore
      }
    }
  }

  _setRecognizingState(next) {
    const normalized = !!next;
    if (this._isRecognizing !== normalized) this._isRecognizing = normalized;

    const onRecognizingChange = this._listeners.onRecognizingChange;
    if (onRecognizingChange) {
      try {
        onRecognizingChange(normalized);
      } catch (_) {
        // ignore
      }
    }
  }

  async startCapture() {
    this._manualHoldActive = true;
    return this._provider.startCapture();
  }

  stopCapture() {
    this._provider.stopCapture();
    this._manualHoldActive = false;
  }

  recordOnce(opts) {
    this._manualHoldActive = true;
    return Promise.resolve()
      .then(() => this._provider.recordOnce(opts))
      .finally(() => {
        this._manualHoldActive = false;
      });
  }

  async onPointerDown(e) {
    this._manualHoldActive = true;
    await this._provider.onPointerDown(e);
  }

  onPointerUp(e) {
    this._manualHoldActive = false;
    this._provider.onPointerUp(e);
  }

  onPointerCancel() {
    this._manualHoldActive = false;
    this._provider.onPointerCancel();
  }

  dispose() {
    this._manualHoldActive = false;
    try {
      this._provider.dispose();
    } catch (_) {
      // ignore
    }
    this._setCaptureState(false);
    this._setRecognizingState(false);
  }

  // Backward-compatible aliases.
  startRecording() {
    return this.startCapture();
  }

  stopRecording() {
    this.stopCapture();
  }

  onRecordPointerDown(e) {
    return this.onPointerDown(e);
  }

  onRecordPointerUp(e) {
    return this.onPointerUp(e);
  }

  onRecordPointerCancel() {
    return this.onPointerCancel();
  }
}
