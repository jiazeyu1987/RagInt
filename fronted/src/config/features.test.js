describe('config/features', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REACT_APP_VOICE_DEBUG;
    delete process.env.REACT_APP_WAKE_HOLD_MS;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('VOICE_DEBUG is true only when REACT_APP_VOICE_DEBUG is "1"', () => {
    process.env.REACT_APP_VOICE_DEBUG = '1';
    let cfg = require('./features');
    expect(cfg.VOICE_DEBUG).toBe(true);

    jest.resetModules();
    process.env.REACT_APP_VOICE_DEBUG = '0';
    cfg = require('./features');
    expect(cfg.VOICE_DEBUG).toBe(false);
  });

  test('WAKE_HOLD_MS clamps and rounds configured values', () => {
    process.env.REACT_APP_WAKE_HOLD_MS = '499';
    let cfg = require('./features');
    expect(cfg.WAKE_HOLD_MS).toBe(500);

    jest.resetModules();
    process.env.REACT_APP_WAKE_HOLD_MS = '120001';
    cfg = require('./features');
    expect(cfg.WAKE_HOLD_MS).toBe(120000);

    jest.resetModules();
    process.env.REACT_APP_WAKE_HOLD_MS = '1234.6';
    cfg = require('./features');
    expect(cfg.WAKE_HOLD_MS).toBe(1235);
  });

  test('WAKE_HOLD_MS falls back to 8000 for invalid values', () => {
    process.env.REACT_APP_WAKE_HOLD_MS = 'bad';
    const cfg = require('./features');
    expect(cfg.WAKE_HOLD_MS).toBe(8000);
  });
});

