import { useCallback } from 'react';
import { TourController } from '../managers/TourController';
import { RunCoordinator } from '../managers/RunCoordinator';

export function useRunOrchestration({
  tourControllerRef,
  runCoordinatorRef,
  tourControllerDeps,
  runCoordinatorDeps,
} = {}) {
  const getTourController = useCallback(() => {
    if (!tourControllerRef.current) tourControllerRef.current = new TourController();
    tourControllerRef.current.setDeps(tourControllerDeps || {});
    return tourControllerRef.current;
  }, [tourControllerDeps, tourControllerRef]);

  const getRunCoordinator = useCallback(() => {
    if (!runCoordinatorRef.current) runCoordinatorRef.current = new RunCoordinator();
    runCoordinatorRef.current.setDeps({ ...(runCoordinatorDeps || {}), getTourController });
    return runCoordinatorRef.current;
  }, [getTourController, runCoordinatorDeps, runCoordinatorRef]);

  const submitUserText = useCallback(async (payload) => getRunCoordinator().submitUserText(payload), [getRunCoordinator]);
  const startTour = useCallback(async () => getRunCoordinator().startTour(), [getRunCoordinator]);
  const continueTour = useCallback(async () => getRunCoordinator().continueTour(), [getRunCoordinator]);
  const prevTourStop = useCallback(async () => getRunCoordinator().prevTourStop(), [getRunCoordinator]);
  const nextTourStop = useCallback(async () => getRunCoordinator().nextTourStop(), [getRunCoordinator]);
  const jumpTourStop = useCallback(async (idx) => getRunCoordinator().jumpTourStop(idx), [getRunCoordinator]);
  const resetTour = useCallback(() => getRunCoordinator().resetTour(), [getRunCoordinator]);
  const onAnswerQueuedNow = useCallback((item) => getRunCoordinator().answerQueuedNow(item), [getRunCoordinator]);
  const onRemoveQueuedQuestion = useCallback((id) => getRunCoordinator().removeQueuedQuestion(id), [getRunCoordinator]);
  const onInterruptManual = useCallback(() => getRunCoordinator().interruptManual(), [getRunCoordinator]);

  return {
    getTourController,
    getRunCoordinator,
    submitUserText,
    startTour,
    continueTour,
    prevTourStop,
    nextTourStop,
    jumpTourStop,
    resetTour,
    onAnswerQueuedNow,
    onRemoveQueuedQuestion,
    onInterruptManual,
  };
}
