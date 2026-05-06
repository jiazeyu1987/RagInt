import { useEffect } from 'react';

export function useTourRecordingPlaybackSelection({
  tourRecordingEnabled = false,
  setTourRecordingEnabled,
  playTourRecordingEnabled = false,
  setPlayTourRecordingEnabled,
  tourRecordingOptionsReady = false,
  tourRecordingOptions = [],
  selectedTourRecordingId = '',
  setSelectedTourRecordingId,
} = {}) {
  useEffect(() => {
    if (!tourRecordingEnabled || !playTourRecordingEnabled) return;
    setTourRecordingEnabled(false);
  }, [playTourRecordingEnabled, setTourRecordingEnabled, tourRecordingEnabled]);

  useEffect(() => {
    if (!tourRecordingOptionsReady || !playTourRecordingEnabled) return;
    const options = Array.isArray(tourRecordingOptions) ? tourRecordingOptions : [];
    const selectedId = String(selectedTourRecordingId || '').trim();
    const exists =
      !!selectedId && options.some((item) => String((item && item.recording_id) || '').trim() === selectedId);
    if (exists) return;
    const firstRecordingId = String((options[0] && options[0].recording_id) || '').trim();
    if (firstRecordingId) {
      if (firstRecordingId !== selectedId) setSelectedTourRecordingId(firstRecordingId);
      return;
    }
    setPlayTourRecordingEnabled(false);
    if (selectedId) setSelectedTourRecordingId('');
  }, [
    playTourRecordingEnabled,
    selectedTourRecordingId,
    setPlayTourRecordingEnabled,
    setSelectedTourRecordingId,
    tourRecordingOptions,
    tourRecordingOptionsReady,
  ]);
}
