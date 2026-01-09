import { useCallback } from 'react';
import { fetchJson } from '../api/backendClient';

export function useTourRecordings({
  clientIdRef,
  activeTourRecordingIdRef,
  selectedTourRecordingIdRef,
  setSelectedTourRecordingId,
  refreshTourRecordingOptions,
} = {}) {
  const startTourRecordingArchive = useCallback(
    async (stops) => {
      const list = Array.isArray(stops) ? stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
      if (!list.length) return '';
      const data = await fetchJson('/api/recordings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientIdRef ? clientIdRef.current : '' },
        body: JSON.stringify({ stops: list }),
      });
      const rid = String((data && data.recording_id) || '').trim();
      if (rid && activeTourRecordingIdRef) activeTourRecordingIdRef.current = rid;
      return rid;
    },
    [activeTourRecordingIdRef, clientIdRef]
  );

  const finishTourRecordingArchive = useCallback(
    async (recordingId) => {
      const rid = String(recordingId || '').trim() || String(activeTourRecordingIdRef ? activeTourRecordingIdRef.current : '').trim();
      if (!rid) return;
      try {
        await fetchJson(`/api/recordings/${encodeURIComponent(rid)}/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Client-ID': clientIdRef ? clientIdRef.current : '' },
          body: JSON.stringify({ ok: true }),
        });
      } catch (_) {
        // ignore
      }
    },
    [activeTourRecordingIdRef, clientIdRef]
  );

  const loadTourRecordingMeta = useCallback(async (recordingId) => {
    const rid = String(recordingId || '').trim();
    if (!rid) return null;
    try {
      return await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`);
    } catch (_) {
      return null;
    }
  }, []);

  const refreshTourRecordings = useCallback(async () => {
    try {
      if (typeof refreshTourRecordingOptions === 'function') {
        await refreshTourRecordingOptions();
      }
    } catch (_) {
      // ignore
    }
  }, [refreshTourRecordingOptions]);

  const renameSelectedTourRecording = useCallback(async () => {
    const rid = String(selectedTourRecordingIdRef && selectedTourRecordingIdRef.current ? selectedTourRecordingIdRef.current : '').trim();
    if (!rid) return;
    const next = window.prompt('请输入存档名称', '') || '';
    try {
      await fetchJson(`/api/recordings/${encodeURIComponent(rid)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: String(next || '').trim() }),
      });
    } catch (e) {
      alert(String((e && e.message) || e || 'rename_failed'));
    }
    await refreshTourRecordings();
  }, [refreshTourRecordings, selectedTourRecordingIdRef]);

  const deleteSelectedTourRecording = useCallback(async () => {
    const rid = String(selectedTourRecordingIdRef && selectedTourRecordingIdRef.current ? selectedTourRecordingIdRef.current : '').trim();
    if (!rid) return;
    const ok = window.confirm('确认删除该存档？删除后无法恢复。');
    if (!ok) return;
    try {
      await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`, { method: 'DELETE' });
      if (selectedTourRecordingIdRef && selectedTourRecordingIdRef.current === rid) {
        if (typeof setSelectedTourRecordingId === 'function') setSelectedTourRecordingId('');
      }
    } catch (e) {
      alert(String((e && e.message) || e || 'delete_failed'));
    }
    await refreshTourRecordings();
  }, [refreshTourRecordings, selectedTourRecordingIdRef, setSelectedTourRecordingId]);

  return {
    startTourRecordingArchive,
    finishTourRecordingArchive,
    loadTourRecordingMeta,
    refreshTourRecordings,
    renameSelectedTourRecording,
    deleteSelectedTourRecording,
  };
}

