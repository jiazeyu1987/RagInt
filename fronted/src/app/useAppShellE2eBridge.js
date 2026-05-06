import { useEffect } from 'react';
import { cloneAsrProbeState } from './appShellState';

export function useAppShellE2eBridge({
  asrE2eProbeRef,
  groupMode,
  questionPriority,
  useAgentMode,
  selectedAgentId,
  setGroupMode,
  setQuestionPriority,
  setUseAgentMode,
  setSelectedAgentId,
} = {}) {
  useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    const bridge = window.__RAGINT_E2E__;
    if (!bridge || typeof bridge !== 'object') return () => {};

    const prevSetGroupMode = bridge.setGroupMode;
    const prevSetQuestionPriority = bridge.setQuestionPriority;
    const prevSetUseAgentMode = bridge.setUseAgentMode;
    const prevSetSelectedAgentId = bridge.setSelectedAgentId;
    const prevGetUiState = bridge.getUiState;
    const prevGetAsrProbeState = bridge.getAsrProbeState;

    const setGroupModeForTest = (value) => {
      const next = !!value;
      setGroupMode(next);
      return next;
    };
    const setQuestionPriorityForTest = (value) => {
      const next = String(value || '').trim() === 'high' ? 'high' : 'normal';
      setQuestionPriority(next);
      return next;
    };
    const setUseAgentModeForTest = (value) => {
      const next = !!value;
      setUseAgentMode(next);
      return next;
    };
    const setSelectedAgentIdForTest = (value) => {
      const next = String(value || '').trim();
      setSelectedAgentId(next);
      return next;
    };
    const getUiState = () => ({
      groupMode: !!groupMode,
      questionPriority: String(questionPriority || 'normal'),
      useAgentMode: !!useAgentMode,
      selectedAgentId: String(selectedAgentId || ''),
    });
    const getAsrProbeState = () => cloneAsrProbeState(asrE2eProbeRef && asrE2eProbeRef.current);

    bridge.setGroupMode = setGroupModeForTest;
    bridge.setQuestionPriority = setQuestionPriorityForTest;
    bridge.setUseAgentMode = setUseAgentModeForTest;
    bridge.setSelectedAgentId = setSelectedAgentIdForTest;
    bridge.getUiState = getUiState;
    bridge.getAsrProbeState = getAsrProbeState;

    return () => {
      if (bridge.setGroupMode === setGroupModeForTest) {
        if (typeof prevSetGroupMode === 'function') bridge.setGroupMode = prevSetGroupMode;
        else delete bridge.setGroupMode;
      }
      if (bridge.setQuestionPriority === setQuestionPriorityForTest) {
        if (typeof prevSetQuestionPriority === 'function') bridge.setQuestionPriority = prevSetQuestionPriority;
        else delete bridge.setQuestionPriority;
      }
      if (bridge.setUseAgentMode === setUseAgentModeForTest) {
        if (typeof prevSetUseAgentMode === 'function') bridge.setUseAgentMode = prevSetUseAgentMode;
        else delete bridge.setUseAgentMode;
      }
      if (bridge.setSelectedAgentId === setSelectedAgentIdForTest) {
        if (typeof prevSetSelectedAgentId === 'function') bridge.setSelectedAgentId = prevSetSelectedAgentId;
        else delete bridge.setSelectedAgentId;
      }
      if (bridge.getUiState === getUiState) {
        if (typeof prevGetUiState === 'function') bridge.getUiState = prevGetUiState;
        else delete bridge.getUiState;
      }
      if (bridge.getAsrProbeState === getAsrProbeState) {
        if (typeof prevGetAsrProbeState === 'function') bridge.getAsrProbeState = prevGetAsrProbeState;
        else delete bridge.getAsrProbeState;
      }
    };
  }, [
    asrE2eProbeRef,
    groupMode,
    questionPriority,
    selectedAgentId,
    setGroupMode,
    setQuestionPriority,
    setSelectedAgentId,
    setUseAgentMode,
    useAgentMode,
  ]);
}
