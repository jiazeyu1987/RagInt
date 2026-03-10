import { classifyInterrupt } from './RunPolicies';

describe('classifyInterrupt', () => {
  test('classifies manual user stop as pause and resume-capable', () => {
    expect(classifyInterrupt('user_stop')).toEqual({
      kind: 'pause',
      captureResume: true,
      manualPause: true,
      reason: 'user_stop',
    });
  });

  test('classifies priority interruption as pause', () => {
    expect(classifyInterrupt('high_priority')).toEqual({
      kind: 'pause',
      captureResume: true,
      manualPause: false,
      reason: 'high_priority',
    });
  });

  test('classifies tour hard actions as hard stop', () => {
    expect(classifyInterrupt('tour_next')).toEqual({
      kind: 'hard',
      captureResume: false,
      manualPause: false,
      reason: 'tour_next',
    });
  });

  test('defaults empty reason to hard interrupt', () => {
    expect(classifyInterrupt('')).toEqual({
      kind: 'hard',
      captureResume: false,
      manualPause: false,
      reason: 'interrupt',
    });
  });
});

