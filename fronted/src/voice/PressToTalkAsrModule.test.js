jest.mock('./providers/createPressToTalkProvider', () => ({
  createPressToTalkProvider: jest.fn(),
}));

import { createPressToTalkProvider } from './providers/createPressToTalkProvider';
import { PressToTalkAsrModule } from './PressToTalkAsrModule';

describe('PressToTalkAsrModule', () => {
  test('forwards workflow state through capture and recognizing listeners', () => {
    let configured = null;
    createPressToTalkProvider.mockReturnValue({
      configure: jest.fn((deps) => {
        configured = deps;
      }),
      startCapture: jest.fn(),
      stopCapture: jest.fn(),
      recordOnce: jest.fn(),
      onPointerDown: jest.fn(),
      onPointerUp: jest.fn(),
      onPointerCancel: jest.fn(),
      dispose: jest.fn(),
    });

    const captures = [];
    const recognitions = [];
    const module = new PressToTalkAsrModule();
    module.configure({
      onCaptureChange: (value) => captures.push(!!value),
      onRecognizingChange: (value) => recognitions.push(!!value),
    });

    configured.onRecordingChange(true);
    configured.onRecognizingChange(true);
    configured.onRecordingChange(false);
    configured.onRecognizingChange(false);

    expect(captures).toEqual([true, false]);
    expect(recognitions).toEqual([true, false]);
  });
});
