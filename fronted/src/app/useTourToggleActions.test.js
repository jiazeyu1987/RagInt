import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { TOUR_BTN_MODE } from './appShellState';
import { useTourToggleActions } from './useTourToggleActions';

describe('useTourToggleActions', () => {
  function createProps(overrides = {}) {
    return {
      tourButtonState: { started: false, mode: TOUR_BTN_MODE.START },
      setTourButtonState: jest.fn((updater) =>
        typeof updater === 'function' ? updater({ started: false, mode: TOUR_BTN_MODE.START }) : updater
      ),
      onInterruptManual: jest.fn(),
      continueTour: jest.fn().mockResolvedValue(undefined),
      startTour: jest.fn().mockResolvedValue(undefined),
      prepareTourRagflowConversation: jest.fn(() => '展厅聊天'),
      markRagflowAvailable: jest.fn(),
      markRagflowUnavailable: jest.fn(),
      onResetAll: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  test('starts a normal tour and marks RAGFlow available', async () => {
    const props = createProps();
    const hook = renderHook((nextProps) => useTourToggleActions(nextProps), props);

    await act(async () => {
      await hook.result().onTourToggle();
    });

    expect(props.prepareTourRagflowConversation).toHaveBeenCalledTimes(1);
    expect(props.startTour).toHaveBeenCalledTimes(1);
    expect(props.markRagflowAvailable).toHaveBeenCalledTimes(1);
    expect(props.setTourButtonState.mock.results[0].value).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.INTERRUPT,
    });
  });

  test('interrupts, continues, and rolls continue back to continue mode on failure', async () => {
    const interruptProps = createProps({
      tourButtonState: { started: true, mode: TOUR_BTN_MODE.INTERRUPT },
      setTourButtonState: jest.fn((updater) =>
        updater({ started: true, mode: TOUR_BTN_MODE.INTERRUPT })
      ),
    });
    const interruptHook = renderHook((nextProps) => useTourToggleActions(nextProps), interruptProps);
    await act(async () => {
      await interruptHook.result().onTourToggle();
    });
    expect(interruptProps.onInterruptManual).toHaveBeenCalledTimes(1);
    expect(interruptProps.setTourButtonState.mock.results[0].value).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.CONTINUE,
    });

    const continueProps = createProps({
      tourButtonState: { started: true, mode: TOUR_BTN_MODE.CONTINUE },
      setTourButtonState: jest.fn((updater) =>
        typeof updater === 'function' ? updater({ started: true, mode: TOUR_BTN_MODE.CONTINUE }) : updater
      ),
      continueTour: jest.fn().mockRejectedValue(new Error('continue failed')),
    });
    const continueHook = renderHook((nextProps) => useTourToggleActions(nextProps), continueProps);
    await act(async () => {
      await continueHook.result().onTourToggle();
    });
    expect(continueProps.continueTour).toHaveBeenCalledTimes(1);
    expect(continueProps.markRagflowUnavailable).toHaveBeenCalledWith({
      source: 'tour_continue',
      error: expect.any(Error),
    });
    expect(continueProps.setTourButtonState.mock.results[1].value).toEqual({
      started: true,
      mode: TOUR_BTN_MODE.CONTINUE,
    });
  });

  test('simple tour toggles between reset and start', async () => {
    const runningProps = createProps({ tourButtonState: { started: true, mode: TOUR_BTN_MODE.INTERRUPT } });
    const runningHook = renderHook((nextProps) => useTourToggleActions(nextProps), runningProps);
    expect(runningHook.result().simpleTourRunning).toBe(true);

    await act(async () => {
      await runningHook.result().onSimpleTourToggle();
    });
    expect(runningProps.onResetAll).toHaveBeenCalledTimes(1);

    const startProps = createProps();
    const startHook = renderHook((nextProps) => useTourToggleActions(nextProps), startProps);
    expect(startHook.result().simpleTourRunning).toBe(false);

    await act(async () => {
      await startHook.result().onSimpleTourToggle();
    });
    expect(startProps.startTour).toHaveBeenCalledTimes(1);
    expect(startProps.markRagflowAvailable).toHaveBeenCalledTimes(1);
  });
});
