import { useCallback, useRef } from 'react';
import { TourPipelineManager } from '../managers/TourPipelineManager';

export function useTourPipelineManager({
  baseUrl,
  clientIdRef,
  tourStopsRef,
  tourStateRef,
  audienceProfileRef,
  guideDurationRef,
  guideStyleRef,
  guideEnabledRef,
  tourStopDurationsRef,
  tourStopTargetCharsRef,
  continuousTourRef,
  useAgentModeRef,
  selectedChatRef,
  selectedAgentIdRef,
  onLog = (...args) => console.log(...args),
  onWarn = (...args) => console.warn(...args),
  maxPrefetchAhead = 1,
} = {}) {
  const tourPipelineRef = useRef(null);

  const getTourPipeline = useCallback(() => {
    if (tourPipelineRef.current) return tourPipelineRef.current;

    tourPipelineRef.current = new TourPipelineManager({
      baseUrl: String(baseUrl || 'http://localhost:8000'),
      getClientId: () => (clientIdRef ? clientIdRef.current : ''),
      getStops: () => (tourStopsRef ? tourStopsRef.current || [] : []),
      getLastAnswerTail: () => String((tourStateRef && tourStateRef.current && tourStateRef.current.lastAnswerTail) || ''),
      getAudienceProfile: () => String((audienceProfileRef && audienceProfileRef.current) || ''),
      getGuideDuration: () => Number((guideDurationRef && guideDurationRef.current) || 60),
      getGuideStyle: () => String((guideStyleRef && guideStyleRef.current) || 'friendly'),
      getGuideEnabled: () => !!(guideEnabledRef && guideEnabledRef.current),
      getPerStopDurations: () => (tourStopDurationsRef ? tourStopDurationsRef.current || [] : []),
      getPerStopTargetChars: () => (tourStopTargetCharsRef ? tourStopTargetCharsRef.current || [] : []),
      isContinuousTourEnabled: () => !!(continuousTourRef && continuousTourRef.current),
      maxPrefetchAhead: Math.max(0, Number(maxPrefetchAhead) || 1),
      getConversationConfig: () => ({
        useAgentMode: !!(useAgentModeRef && useAgentModeRef.current),
        selectedChat: useAgentModeRef && useAgentModeRef.current ? null : selectedChatRef && selectedChatRef.current,
        selectedAgentId: useAgentModeRef && useAgentModeRef.current ? (selectedAgentIdRef && selectedAgentIdRef.current) : null,
      }),
      onLog,
      onWarn,
    });

    return tourPipelineRef.current;
  }, [
    baseUrl,
    clientIdRef,
    tourStopsRef,
    tourStateRef,
    audienceProfileRef,
    guideDurationRef,
    guideStyleRef,
    guideEnabledRef,
    tourStopDurationsRef,
    tourStopTargetCharsRef,
    continuousTourRef,
    useAgentModeRef,
    selectedChatRef,
    selectedAgentIdRef,
    onLog,
    onWarn,
    maxPrefetchAhead,
  ]);

  const abortPrefetch = useCallback(
    (reason) => {
      if (!tourPipelineRef.current) return;
      tourPipelineRef.current.abortPrefetch(reason);
    },
    [tourPipelineRef]
  );

  return { tourPipelineRef, getTourPipeline, abortPrefetch };
}

