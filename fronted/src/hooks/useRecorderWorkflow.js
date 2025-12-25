import { useCallback, useMemo, useRef, useState } from 'react';
import { RecorderManager } from '../managers/RecorderManager';

export function useRecorderWorkflow({
  baseUrl,
  minRecordMs = 900,
  clientIdRef,
  setInputText,
  setIsLoading,
  decodeAndConvertToWav16kMono,
  unlockAudio,
  ttsEnabledRef,
  audioContextRef,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const recorderManagerRef = useRef(null);
  const recordPointerIdRef = useRef(null);
  const asrAbortRef = useRef(null);

  const asrEndpoint = useMemo(() => {
    const base = String(baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
    return `${base}/api/speech_to_text`;
  }, [baseUrl]);

  const processAudio = useCallback(
    async (audioBlob, meta = {}) => {
      if (typeof setIsLoading === 'function') setIsLoading(true);
      try {
        let blobToSend = audioBlob;
        const ct = String(meta.mimeType || audioBlob.type || '').toLowerCase();

        if (ct.includes('webm') || ct.includes('ogg') || ct.includes('mp4')) {
          try {
            if (typeof decodeAndConvertToWav16kMono === 'function') {
              const wav = await decodeAndConvertToWav16kMono(audioBlob);
              // eslint-disable-next-line no-console
              console.log(`[REC] converted_to_wav bytes=${wav.size}`);
              blobToSend = wav;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[REC] decode/convert failed, sending original blob:', e);
            blobToSend = audioBlob;
          }
        }

        const formData = new FormData();
        const sendType = String(blobToSend.type || '').toLowerCase();
        const ext = sendType.includes('wav') ? 'wav' : ct.includes('ogg') ? 'ogg' : ct.includes('mp4') ? 'mp4' : 'webm';
        formData.append('audio', blobToSend, `recording.${ext}`);
        formData.append('client_id', clientIdRef ? clientIdRef.current : '');
        formData.append('request_id', `asr_${Date.now()}_${Math.random().toString(16).slice(2)}`);

        if (asrAbortRef.current) {
          try {
            asrAbortRef.current.abort();
          } catch (_) {
            // ignore
          }
        }
        const abortController = new AbortController();
        asrAbortRef.current = abortController;
        const response = await fetch(asrEndpoint, {
          method: 'POST',
          headers: { 'X-Client-ID': clientIdRef ? clientIdRef.current : '' },
          body: formData,
          signal: abortController.signal,
        });

        const result = await response.json();
        const text = result && result.text ? String(result.text) : '';

        if (text && typeof setInputText === 'function') {
          // eslint-disable-next-line no-console
          console.log(`[REC] asr_text chars=${text.length} preview="${text.slice(0, 30)}"`);
          setInputText((prev) => {
            const p = String(prev || '').trim();
            const t = String(text || '').trim();
            if (!t) return p;
            return p ? `${p} ${t}` : t;
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error processing audio:', err);
      } finally {
        if (asrAbortRef.current) {
          try {
            asrAbortRef.current.abort();
          } catch (_) {
            // ignore
          }
          asrAbortRef.current = null;
        }
        if (typeof setIsLoading === 'function') setIsLoading(false);
      }
    },
    [asrEndpoint, clientIdRef, decodeAndConvertToWav16kMono, setInputText, setIsLoading]
  );

  const startRecording = useCallback(async () => {
    if (!recorderManagerRef.current) {
      recorderManagerRef.current = new RecorderManager({
        minRecordMs,
        onStateChange: (v) => setIsRecording(!!v),
        onBlob: async (blob, meta) => {
          await processAudio(blob, meta);
        },
        onLog: (...args) => console.log(...args),
      });
    }
    try {
      if (typeof unlockAudio === 'function') unlockAudio();
    } catch (_) {
      // ignore
    }
    await recorderManagerRef.current.start();
  }, [minRecordMs, processAudio, unlockAudio]);

  const stopRecording = useCallback(() => {
    if (!recorderManagerRef.current) return;
    if (ttsEnabledRef && ttsEnabledRef.current) {
      if (audioContextRef && audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
      try {
        if (typeof unlockAudio === 'function') unlockAudio();
      } catch (_) {
        // ignore
      }
    }
    recorderManagerRef.current.stop();
  }, [audioContextRef, ttsEnabledRef, unlockAudio]);

  const onRecordPointerDown = useCallback(
    async (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {
        // ignore
      }
      if (recordPointerIdRef.current != null) return;
      recordPointerIdRef.current = e && e.pointerId != null ? e.pointerId : 'mouse';
      // eslint-disable-next-line no-console
      console.log('[REC] pointerdown', recordPointerIdRef.current);
      try {
        if (e && e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function' && e.pointerId != null) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch (_) {
        // ignore
      }
      await startRecording();
    },
    [startRecording]
  );

  const onRecordPointerUp = useCallback(
    (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {
        // ignore
      }
      const pid = e && e.pointerId != null ? e.pointerId : 'mouse';
      if (recordPointerIdRef.current != null && recordPointerIdRef.current !== pid) return;
      // eslint-disable-next-line no-console
      console.log('[REC] pointerup', pid);
      recordPointerIdRef.current = null;
      stopRecording();
    },
    [stopRecording]
  );

  const onRecordPointerCancel = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('[REC] pointercancel');
    recordPointerIdRef.current = null;
    stopRecording();
  }, [stopRecording]);

  const cancelAsr = useCallback(() => {
    if (asrAbortRef.current) {
      try {
        asrAbortRef.current.abort();
      } catch (_) {
        // ignore
      } finally {
        asrAbortRef.current = null;
      }
    }
    try {
      if (recorderManagerRef.current && recorderManagerRef.current.isRecording) recorderManagerRef.current.cancel();
    } catch (_) {
      // ignore
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    cancelAsr,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
  };
}

