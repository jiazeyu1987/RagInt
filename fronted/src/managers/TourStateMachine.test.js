import {
  DEFAULT_TOUR_STATE,
  tourStateOnInterrupt,
  tourStateOnReady,
  tourStateOnTourAction,
  tourStateOnUserQuestion,
} from './TourStateMachine';

describe('TourStateMachine', () => {
  test('tourStateOnTourAction moves to running and fills fields', () => {
    const next = tourStateOnTourAction(undefined, {
      action: 'start',
      stopIndex: 3,
      stopName: 'Stop 4',
    });

    expect(next).toEqual({
      ...DEFAULT_TOUR_STATE,
      mode: 'running',
      stopIndex: 3,
      stopName: 'Stop 4',
      lastAction: 'start',
    });
  });

  test('tourStateOnTourAction falls back to previous stop index and action', () => {
    const prev = { ...DEFAULT_TOUR_STATE, mode: 'ready', stopIndex: 2, stopName: 'S2', lastAction: 'next' };
    const next = tourStateOnTourAction(prev, {});

    expect(next.mode).toBe('running');
    expect(next.stopIndex).toBe(2);
    expect(next.stopName).toBe('S2');
    expect(next.lastAction).toBe('next');
  });

  test('tourStateOnUserQuestion is no-op in idle state', () => {
    const prev = { ...DEFAULT_TOUR_STATE };
    const next = tourStateOnUserQuestion(prev);
    expect(next).toBe(prev);
  });

  test('tourStateOnUserQuestion marks non-idle state', () => {
    const prev = { ...DEFAULT_TOUR_STATE, mode: 'running', stopIndex: 0 };
    const next = tourStateOnUserQuestion(prev);
    expect(next).toEqual({ ...prev, lastAction: 'user_question' });
  });

  test('tourStateOnInterrupt is no-op in idle, otherwise transitions to interrupted', () => {
    const idlePrev = { ...DEFAULT_TOUR_STATE };
    expect(tourStateOnInterrupt(idlePrev)).toBe(idlePrev);

    const runningPrev = { ...DEFAULT_TOUR_STATE, mode: 'running', stopIndex: 1 };
    expect(tourStateOnInterrupt(runningPrev)).toEqual({
      ...runningPrev,
      mode: 'interrupted',
      lastAction: 'interrupt',
    });
  });

  test('tourStateOnReady only applies when currently running', () => {
    const runningPrev = { ...DEFAULT_TOUR_STATE, mode: 'running', lastAnswerTail: 'old' };
    const ready = tourStateOnReady(runningPrev, { fullAnswerTail: 'new tail' });
    expect(ready).toEqual({ ...runningPrev, mode: 'ready', lastAnswerTail: 'new tail' });

    const interruptedPrev = { ...DEFAULT_TOUR_STATE, mode: 'interrupted', lastAnswerTail: 'old' };
    expect(tourStateOnReady(interruptedPrev, { fullAnswerTail: 'ignored' })).toBe(interruptedPrev);
  });

  test('tourStateOnReady keeps previous tail when fullAnswerTail is empty', () => {
    const prev = { ...DEFAULT_TOUR_STATE, mode: 'running', lastAnswerTail: 'persist me' };
    const next = tourStateOnReady(prev, { fullAnswerTail: '' });
    expect(next.lastAnswerTail).toBe('persist me');
  });
});

