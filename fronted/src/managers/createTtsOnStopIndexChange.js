import { tourStateOnTourAction } from './TourStateMachine';

export function createTtsOnStopIndexChange({
  guideEnabledRef,
  tourStateRef,
  tourPipelineRef,
  ttsEnabledRef,
  getTourStopName,
  setTourState,
  setAnswer,
  enqueueSegment,
  enqueueAudioSegment,
  ensureTtsRunning,
  getPlaybackRecordingId,
  interruptManagerRef,
} = {}) {
  return (nextStopIndex) => {
    if (!guideEnabledRef || !guideEnabledRef.current) return;

    const curStopIndex = Number.isFinite(tourStateRef && tourStateRef.current && tourStateRef.current.stopIndex)
      ? Number(tourStateRef.current.stopIndex)
      : -1;
    if (Number(nextStopIndex) === curStopIndex) return;

    try {
      const pipeline = tourPipelineRef && tourPipelineRef.current;
      if (pipeline) {
        const mgr = interruptManagerRef && interruptManagerRef.current ? interruptManagerRef.current : null;
        const epoch = mgr ? mgr.snapshot() : 0;
        const allow = () => (mgr ? mgr.isCurrent(epoch) : true);
        const gatedEnsure = () => {
          if (!allow()) return;
          if (ttsEnabledRef && ttsEnabledRef.current && typeof ensureTtsRunning === 'function') ensureTtsRunning();
        };

        pipeline.setCurrentStopIndex(Number(nextStopIndex));
        const rid = typeof getPlaybackRecordingId === 'function' ? String(getPlaybackRecordingId() || '').trim() : '';
        if (rid && typeof pipeline.maybePrefetchFromRecordingPlayback === 'function') {
          pipeline.maybePrefetchFromRecordingPlayback({
            recordingId: rid,
            currentStopIndex: Number(nextStopIndex),
            enqueueAudioSegment: (u, meta) => {
              if (!allow()) return;
              if (typeof enqueueAudioSegment === 'function') enqueueAudioSegment(u, meta);
            },
            ensureTtsRunning: gatedEnsure,
          });
        } else {
          pipeline.maybePrefetchFromPlayback({
            currentStopIndex: Number(nextStopIndex),
            enqueueSegment: (s, meta) => {
              if (!allow()) return;
              if (typeof enqueueSegment === 'function') enqueueSegment(s, meta);
            },
            ensureTtsRunning: gatedEnsure,
          });
        }
      }
    } catch (_) {
      // ignore
    }

    const stopName = typeof getTourStopName === 'function' ? getTourStopName(Number(nextStopIndex)) : '';
    try {
      if (typeof setTourState === 'function') {
        setTourState((prev) =>
          tourStateOnTourAction(prev, { action: 'next', stopIndex: Number(nextStopIndex), stopName: stopName || '' })
        );
      }
    } catch (_) {
      // ignore
    }

    try {
      const cached = tourPipelineRef && tourPipelineRef.current ? tourPipelineRef.current.getPrefetch(Number(nextStopIndex)) : null;
      if (cached && cached.answerText && typeof setAnswer === 'function') setAnswer(String(cached.answerText || ''));
    } catch (_) {
      // ignore
    }
  };
}
