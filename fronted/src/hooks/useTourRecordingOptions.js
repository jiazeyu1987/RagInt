import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourRecordingOptions({ enabled, limit = 50, currentPlaybackSpeed = 1.0 } = {}) {
  const [options, setOptions] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const formatRecordingLabel = useCallback((createdAtMs) => {
    try {
      const d = new Date(Number(createdAtMs) || Date.now());
      const pad = (n) => String(Number(n) || 0).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}/${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    } catch (_) {
      return String(createdAtMs || '');
    }
  }, []);

  const formatDateTime = useCallback((value) => {
    try {
      const d = new Date(Number(value) || Date.now());
      const pad = (n) => String(Number(n) || 0).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (_) {
      return String(value || '');
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson(`/api/recordings?limit=${Number(limit) || 50}`);
      if (data && data.ok === false) {
        throw new Error(String(data.error || 'recordings_load_failed'));
      }
      if (!Array.isArray(data && data.items)) {
        throw new Error('recordings_invalid_response');
      }
      const items = data.items;
      setOptions(
        items.map((r) => {
          const rid = String((r && r.recording_id) || '');
          const displayName = r && r.display_name ? String(r.display_name || '').trim() : '';
          const meta = r && r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
          const provider = String(meta.tts_provider || '').trim();
          const voice = String(meta.tts_voice || '').trim();
          const storedAudioSpeed = Number.isFinite(Number(meta.stored_audio_speed)) ? Number(meta.stored_audio_speed) : null;
          const recordPlaybackSpeed = Number.isFinite(Number(meta.record_playback_speed)) ? Number(meta.record_playback_speed) : null;
          const currentSpeed = Number.isFinite(Number(currentPlaybackSpeed)) ? Number(currentPlaybackSpeed) : 1.0;
          const details = [
            provider ? `TTS:${provider}` : '',
            voice ? `Voice:${voice}` : '',
            storedAudioSpeed != null ? `原始:${storedAudioSpeed.toFixed(2)}x` : '',
            recordPlaybackSpeed != null ? `录制播放:${recordPlaybackSpeed.toFixed(2)}x` : '',
            `当前播放:${currentSpeed.toFixed(2)}x`,
          ].filter(Boolean);
          return {
            recording_id: rid,
            label: [displayName || formatRecordingLabel(r && r.created_at_ms), details.join(' | ')].filter(Boolean).join(' | '),
            metadata: meta,
            created_at_ms: Number(r && r.created_at_ms) || 0,
            finished_at_ms: Number(r && r.finished_at_ms) || 0,
            created_at_label: formatDateTime(r && r.created_at_ms),
            finished_at_label: r && r.finished_at_ms ? formatDateTime(r && r.finished_at_ms) : '',
            stop_count: Math.max(0, Number(r && r.stop_count) || 0),
          };
        })
      );
      setError('');
    } finally {
      setReady(true);
    }
  }, [currentPlaybackSpeed, formatDateTime, formatRecordingLabel, limit]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    refresh().catch((e) => {
      if (cancelled) return;
      setOptions([]);
      setError(String((e && e.message) || e || 'recordings_load_failed'));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  return { options, refresh, ready, error };
}
