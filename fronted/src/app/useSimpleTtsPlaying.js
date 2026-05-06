import { useEffect, useState } from 'react';

export function useSimpleTtsPlaying({ uiViewMode = 'full', currentAudioRef = null } = {}) {
  const [simpleTtsPlaying, setSimpleTtsPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    if (uiViewMode !== 'simple') {
      setSimpleTtsPlaying(false);
      return () => {};
    }

    const timer = window.setInterval(() => {
      const playing = !!(currentAudioRef && currentAudioRef.current);
      setSimpleTtsPlaying((prev) => (prev === playing ? prev : playing));
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, [uiViewMode, currentAudioRef]);

  return simpleTtsPlaying;
}
