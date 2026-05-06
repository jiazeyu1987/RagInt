import { useCallback } from 'react';

export function useAppShellTourHelpers({ tourStops = [], getTourPipeline } = {}) {
  const getTourStopName = useCallback(
    (index) => {
      const stops = Array.isArray(tourStops) ? tourStops : [];
      if (!stops.length) return '';
      const stopIndex = Math.max(0, Math.min(Number(index) || 0, stops.length - 1));
      return String(stops[stopIndex] || '').trim();
    },
    [tourStops]
  );

  const buildTourPrompt = useCallback(
    (action, stopIndex, tailOverride) => {
      return getTourPipeline().buildTourPrompt(action, stopIndex, tailOverride);
    },
    [getTourPipeline]
  );

  const nowMs = useCallback(() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()), []);

  return {
    getTourStopName,
    buildTourPrompt,
    nowMs,
  };
}
