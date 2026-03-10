import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useStagePanelProps } from './useStagePanelProps';
import { sendTourControl } from '../api/tourControl';

jest.mock('../api/tourControl', () => ({
  sendTourControl: jest.fn().mockResolvedValue({ ok: true }),
}));

describe('useStagePanelProps', () => {
  beforeEach(() => {
    sendTourControl.mockClear();
  });

  test('emits stage actions and speed toggle commands', async () => {
    const setQueueStatus = jest.fn();
    const hook = renderHook((p) => useStagePanelProps(p), {
      clientIdRef: { current: 'cid' },
      stageSpeedMode: 'normal',
      setStageSpeedMode: jest.fn(),
      setGuideDuration: jest.fn(),
      setQueueStatus,
      interruptCurrentRun: jest.fn(),
      continueTour: jest.fn().mockResolvedValue(undefined),
      nextTourStop: jest.fn().mockResolvedValue(undefined),
      resetTour: jest.fn(),
      startTour: jest.fn().mockResolvedValue(undefined),
    });

    await act(async () => {
      await hook.result().onPause();
      await hook.result().onToggleSpeed();
    });

    expect(sendTourControl).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'cid', action: 'pause' })
    );
    expect(sendTourControl).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'cid', action: 'speed', payload: { speed: 2.0 } })
    );
    expect(setQueueStatus).toHaveBeenCalled();
    hook.unmount();
  });
});

