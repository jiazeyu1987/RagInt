import { PressToTalkAsrModule } from '../voice/PressToTalkAsrModule';

export class VoiceInputManager {
  constructor({ onLog } = {}) {
    this._module = new PressToTalkAsrModule({ onLog });
  }

  setRecordingDeps(deps = {}) {
    this._module.configure(deps);
  }

  startRecording() {
    return this._module.startRecording();
  }

  stopRecording() {
    this._module.stopRecording();
  }

  recordOnce(opts) {
    return this._module.recordOnce(opts);
  }

  onRecordPointerDown(e) {
    return this._module.onRecordPointerDown(e);
  }

  onRecordPointerUp(e) {
    return this._module.onRecordPointerUp(e);
  }

  onRecordPointerCancel() {
    return this._module.onRecordPointerCancel();
  }

  dispose() {
    this._module.dispose();
  }
}
