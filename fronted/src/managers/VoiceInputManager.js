import { RecordingWorkflowManager } from './RecordingWorkflowManager';

export class VoiceInputManager {
  constructor({ onLog } = {}) {
    this._recording = new RecordingWorkflowManager({ onLog });
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
    this._manualHoldActive = true;
    return this._recording.start();
  }

  stopRecording() {
    this._recording.stop();
    this._manualHoldActive = false;
  }

  recordOnce(opts) {
    this._manualHoldActive = true;
    // Best-effort: clear the manual-hold flag once recordOnce resolves/rejects.
    return Promise.resolve()
      .then(() => this._recording.recordOnce(opts))
      .finally(() => {
        this._manualHoldActive = false;
      });
  }

  onRecordPointerDown(e) {
    this._manualHoldActive = true;
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

  dispose() {
    try {
      this._recording.cancel();
    } catch (_) {
      // ignore
    }
  }
}
