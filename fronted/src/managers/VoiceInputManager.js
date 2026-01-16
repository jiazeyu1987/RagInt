import { RecordingWorkflowManager } from './RecordingWorkflowManager';
import { WakeWordWsListener } from './WakeWordWsListener';

export class VoiceInputManager {
  constructor({ onLog } = {}) {
    this._recording = new RecordingWorkflowManager({ onLog });
    this._wake = new WakeWordWsListener({ onLog });
    this._isRecording = false;
    this._manualHoldActive = false;
  }

  setRecordingDeps(deps = {}) {
    const userOnRecordingChange = typeof deps.onRecordingChange === 'function' ? deps.onRecordingChange : null;
    this._recording.setDeps({
      ...deps,
      onRecordingChange: (value) => {
        this._isRecording = !!value;
        if (userOnRecordingChange) {
          userOnRecordingChange(value);
        }
      },
    });
  }

  startRecording() {
    // Avoid concurrent mic usage: pause wake-word listener while manual recording is active.
    this._manualHoldActive = true;
    this._wake.pause();
    return this._recording.start();
  }

  stopRecording() {
    this._recording.stop();
    this._manualHoldActive = false;
    this._wake.resume(1200);
  }

  recordOnce(opts) {
    this._manualHoldActive = true;
    this._wake.pause();
    // Best-effort: clear the manual-hold flag once recordOnce resolves/rejects.
    return Promise.resolve()
      .then(() => this._recording.recordOnce(opts))
      .finally(() => {
        this._manualHoldActive = false;
        this._wake.resume(1200);
      });
  }

  onRecordPointerDown(e) {
    this._manualHoldActive = true;
    this._wake.pause();
    return this._recording.onPointerDown(e);
  }

  onRecordPointerUp(e) {
    this._manualHoldActive = false;
    return this._recording.onPointerUp(e);
  }

  onRecordPointerCancel() {
    this._manualHoldActive = false;
    return this._recording.onPointerCancel();
  }

  setWakeWordCallbacks(ref) {
    this._wake.setCallbacks(ref);
  }

  setWakeWordStateListener(fn) {
    this._wake.setStateListener(fn);
  }

  setWakeWordBusyChecker(fn) {
    this._wake.setBusyChecker(fn);
  }

  setWakeWordOptions(next = {}) {
    this._wake.setOptions(next || {});
  }

  dispose() {
    this._wake.dispose();
    try {
      this._recording.cancel();
    } catch (_) {
      // ignore
    }
  }
}
