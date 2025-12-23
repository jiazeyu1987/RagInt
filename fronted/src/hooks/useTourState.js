import { useCallback } from 'react';
import { useLocalStorageState } from './useLocalStorageState';

const DEFAULT_TOUR_STATE = {
  mode: 'idle', // 'idle' | 'ready' | 'running' | 'interrupted'
  stopIndex: -1,
  stopName: '',
  lastAnswerTail: '',
  lastAction: null, // 'start' | 'continue' | 'next' | 'user_question' | 'interrupt'
};

function normalizeTourState(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_TOUR_STATE;

  const mode = typeof raw.mode === 'string' ? raw.mode : DEFAULT_TOUR_STATE.mode;
  const stopIndex = Number.isFinite(raw.stopIndex) ? raw.stopIndex : DEFAULT_TOUR_STATE.stopIndex;
  const stopName = typeof raw.stopName === 'string' ? raw.stopName : DEFAULT_TOUR_STATE.stopName;
  const lastAnswerTail = typeof raw.lastAnswerTail === 'string' ? raw.lastAnswerTail : DEFAULT_TOUR_STATE.lastAnswerTail;
  const lastAction = typeof raw.lastAction === 'string' || raw.lastAction == null ? raw.lastAction : DEFAULT_TOUR_STATE.lastAction;

  return {
    mode,
    stopIndex,
    stopName,
    lastAnswerTail,
    lastAction,
  };
}

export function useTourState(storageKey = 'tourStateV1') {
  const serialize = useCallback((v) => JSON.stringify(normalizeTourState(v)), []);
  const deserialize = useCallback((raw) => {
    try {
      return normalizeTourState(JSON.parse(raw));
    } catch (_) {
      return DEFAULT_TOUR_STATE;
    }
  }, []);

  return useLocalStorageState(storageKey, DEFAULT_TOUR_STATE, { serialize, deserialize });
}

