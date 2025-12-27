import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingWorkflowManager } from '../managers/RecordingWorkflowManager';

export function useRecorderWorkflow({
  baseUrl,
  minRecordMs = 900,
  clientIdRef,
  setInputText,
  getInputText,
  setIsLoading,
  decodeAndConvertToWav16kMono,
  unlockAudio,
  ttsEnabledRef,
  audioContextRef,
  asrMode = 'http', // 'http' | 'ws_pcm'
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const mgrRef = useRef(null);
  if (!mgrRef.current) {
    mgrRef.current = new RecordingWorkflowManager({ onLog: (...args) => console.log(...args) });
  }

  useEffect(() => {
    const clientId = clientIdRef ? clientIdRef.current : '';
    mgrRef.current.setDeps({
      baseUrl,
      minRecordMs,
      asrMode,
      clientId,
      setInputText,
      getInputText,
      setIsLoading,
      decodeAndConvertToWav16kMono,
      unlockAudio,
      ttsEnabledRef,
      audioContextRef,
      onRecordingChange: (v) => setIsRecording(!!v),
    });
  }, [
    audioContextRef,
    asrMode,
    baseUrl,
    clientIdRef,
    decodeAndConvertToWav16kMono,
    getInputText,
    minRecordMs,
    setInputText,
    setIsLoading,
    ttsEnabledRef,
    unlockAudio,
  ]);

  const startRecording = useCallback(async () => {
    await mgrRef.current.start();
  }, []);

  const stopRecording = useCallback(() => {
    mgrRef.current.stop();
  }, []);

  const onRecordPointerDown = useCallback(
    async (e) => {
      await mgrRef.current.onPointerDown(e);
    },
    []
  );

  const onRecordPointerUp = useCallback(
    (e) => {
      mgrRef.current.onPointerUp(e);
    },
    []
  );

  const onRecordPointerCancel = useCallback(() => {
    mgrRef.current.onPointerCancel();
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    onRecordPointerDown,
    onRecordPointerUp,
    onRecordPointerCancel,
  };
}

