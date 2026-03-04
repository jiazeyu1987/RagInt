import { RecordingWorkflowManager } from '../../managers/RecordingWorkflowManager';

export class VoiceKitPressToTalkProvider {
  constructor({ onLog } = {}) {
    this._workflow = new RecordingWorkflowManager({ onLog });
  }

  configure(deps = {}) {
    this._workflow.setDeps(deps);
  }

  startCapture() {
    return this._workflow.start();
  }

  stopCapture() {
    this._workflow.stop();
  }

  recordOnce(opts) {
    return this._workflow.recordOnce(opts);
  }

  onPointerDown(e) {
    return this._workflow.onPointerDown(e);
  }

  onPointerUp(e) {
    return this._workflow.onPointerUp(e);
  }

  onPointerCancel() {
    return this._workflow.onPointerCancel();
  }

  dispose() {
    this._workflow.cancel();
  }
}
