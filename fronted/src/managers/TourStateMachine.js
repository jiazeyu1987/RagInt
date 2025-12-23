export const DEFAULT_TOUR_STATE = {
  mode: 'idle', // 'idle' | 'ready' | 'running' | 'interrupted'
  stopIndex: -1,
  stopName: '',
  lastAnswerTail: '',
  lastAction: null, // 'start' | 'continue' | 'next' | 'user_question' | 'interrupt'
};

export function tourStateOnTourAction(prev, { action, stopIndex, stopName }) {
  const p = prev && typeof prev === 'object' ? prev : DEFAULT_TOUR_STATE;
  const idx = Number.isFinite(stopIndex) ? Number(stopIndex) : Number.isFinite(p.stopIndex) ? Number(p.stopIndex) : 0;
  const name = typeof stopName === 'string' ? stopName : p.stopName;
  const act = typeof action === 'string' ? action : p.lastAction;

  return {
    ...p,
    mode: 'running',
    stopIndex: idx,
    stopName: name || '',
    lastAction: act || null,
  };
}

export function tourStateOnUserQuestion(prev) {
  const p = prev && typeof prev === 'object' ? prev : DEFAULT_TOUR_STATE;
  if (!p || p.mode === 'idle') return p;
  return { ...p, lastAction: 'user_question' };
}

export function tourStateOnInterrupt(prev) {
  const p = prev && typeof prev === 'object' ? prev : DEFAULT_TOUR_STATE;
  if (!p || p.mode === 'idle') return p;
  return { ...p, mode: 'interrupted', lastAction: 'interrupt' };
}

export function tourStateOnReady(prev, { fullAnswerTail }) {
  const p = prev && typeof prev === 'object' ? prev : DEFAULT_TOUR_STATE;
  if (!p || p.mode === 'idle') return p;
  if (p.mode !== 'running') return p;
  const tail = typeof fullAnswerTail === 'string' ? fullAnswerTail : '';
  return { ...p, mode: 'ready', lastAnswerTail: tail || p.lastAnswerTail };
}

