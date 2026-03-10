import { RUN_REASON } from './RunReasons';

describe('RUN_REASON constants', () => {
  test('contains expected reason keys and is immutable', () => {
    expect(RUN_REASON.USER_STOP).toBe('user_stop');
    expect(RUN_REASON.TOUR_CONTINUE).toBe('tour_continue');
    expect(RUN_REASON.MODE_SWITCH).toBe('mode_switch');

    expect(Object.isFrozen(RUN_REASON)).toBe(true);
    expect(() => {
      RUN_REASON.USER_STOP = 'changed';
    }).toThrow();
  });
});

