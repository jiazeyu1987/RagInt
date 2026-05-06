import { useCallback, useMemo } from 'react';
import { sendTourControl } from '../api/tourControl';

export function useStagePanelProps({
  clientIdRef,
  stageSpeedMode,
  setStageSpeedMode,
  setGuideDuration,
  setQueueStatus,
  interruptCurrentRun,
  continueTour,
  nextTourStop,
  resetTour,
  startTour,
} = {}) {
  const sendStageCommand = useCallback(
    async (action, payload) => {
      await sendTourControl({ clientId: clientIdRef ? clientIdRef.current : '', action, payload: payload || {} });
    },
    [clientIdRef]
  );

  return useMemo(
    () => ({
      disabled: false,
      speedLabel: stageSpeedMode === 'fast' ? '快' : '标准',
      onPause: async () => {
        interruptCurrentRun('user_stop');
        await sendStageCommand('pause');
        setQueueStatus('已暂停');
      },
      onContinue: async () => {
        await continueTour();
        await sendStageCommand('resume');
        setQueueStatus('继续');
      },
      onSkip: async () => {
        await nextTourStop();
        await sendStageCommand('skip');
        setQueueStatus('跳过 → 下一站');
      },
      onRestart: async () => {
        resetTour();
        await startTour();
        await sendStageCommand('restart');
        setQueueStatus('重来');
      },
      onToggleSpeed: async () => {
        const next = stageSpeedMode === 'fast' ? 'normal' : 'fast';
        setStageSpeedMode(next);
        if (next === 'fast') {
          setGuideDuration('30');
          await sendStageCommand('speed', { speed: 2.0 });
          setQueueStatus('加速：30秒档');
        } else {
          setGuideDuration('60');
          await sendStageCommand('speed', { speed: 1.0 });
          setQueueStatus('加速：关闭');
        }
      },
    }),
    [
      continueTour,
      interruptCurrentRun,
      nextTourStop,
      resetTour,
      sendStageCommand,
      setGuideDuration,
      setQueueStatus,
      setStageSpeedMode,
      stageSpeedMode,
      startTour,
    ]
  );
}
