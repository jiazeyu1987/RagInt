import { renderHook } from '../testUtils/renderHook';
import { useRunOrchestration } from './useRunOrchestration';

let mockLastTourController = null;
let mockLastRunCoordinator = null;

jest.mock('../managers/TourController', () => ({
  TourController: function TourControllerMock() {
    this.setDeps = jest.fn();
    mockLastTourController = this;
  },
}));

jest.mock('../managers/RunCoordinator', () => ({
  RunCoordinator: function RunCoordinatorMock() {
    this.setDeps = jest.fn();
    this.submitUserText = jest.fn().mockResolvedValue({ ok: true });
    this.startTour = jest.fn().mockResolvedValue('start');
    this.continueTour = jest.fn().mockResolvedValue('continue');
    this.prevTourStop = jest.fn().mockResolvedValue('prev');
    this.nextTourStop = jest.fn().mockResolvedValue('next');
    this.jumpTourStop = jest.fn().mockResolvedValue('jump');
    this.resetTour = jest.fn().mockReturnValue('reset');
    this.answerQueuedNow = jest.fn();
    this.removeQueuedQuestion = jest.fn();
    this.interruptManual = jest.fn();
    mockLastRunCoordinator = this;
  },
}));

describe('useRunOrchestration', () => {
  beforeEach(() => {
    mockLastTourController = null;
    mockLastRunCoordinator = null;
  });

  test('instantiates controllers lazily and delegates actions', async () => {
    const tourControllerRef = { current: null };
    const runCoordinatorRef = { current: null };
    const tourControllerDeps = { a: 1 };
    const runCoordinatorDeps = { b: 2 };

    const hook = renderHook(() =>
      useRunOrchestration({
        tourControllerRef,
        runCoordinatorRef,
        tourControllerDeps,
        runCoordinatorDeps,
      })
    );

    await expect(hook.result().submitUserText({ text: 'q' })).resolves.toEqual({ ok: true });
    await expect(hook.result().startTour()).resolves.toBe('start');
    await expect(hook.result().continueTour()).resolves.toBe('continue');
    await expect(hook.result().prevTourStop()).resolves.toBe('prev');
    await expect(hook.result().nextTourStop()).resolves.toBe('next');
    await expect(hook.result().jumpTourStop(3)).resolves.toBe('jump');
    expect(hook.result().resetTour()).toBe('reset');
    hook.result().onAnswerQueuedNow({ id: 'x' });
    hook.result().onRemoveQueuedQuestion('x');
    hook.result().onInterruptManual();
    const directTourCtrl = hook.result().getTourController();
    expect(directTourCtrl).toBeTruthy();

    const tourCtrl = tourControllerRef.current || mockLastTourController;
    const runCtrl = runCoordinatorRef.current || mockLastRunCoordinator;
    expect(tourCtrl.setDeps).toHaveBeenCalledWith(tourControllerDeps);
    expect(runCtrl.setDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        b: 2,
        getTourController: expect.any(Function),
      })
    );
    expect(runCtrl.submitUserText).toHaveBeenCalledWith({ text: 'q' });
    expect(runCtrl.jumpTourStop).toHaveBeenCalledWith(3);
    expect(runCtrl.answerQueuedNow).toHaveBeenCalledWith({ id: 'x' });
    expect(runCtrl.removeQueuedQuestion).toHaveBeenCalledWith('x');
    expect(runCtrl.interruptManual).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
