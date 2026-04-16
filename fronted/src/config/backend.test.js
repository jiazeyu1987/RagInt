describe('config/backend', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REACT_APP_BACKEND_URL;
    delete process.env.REACT_APP_BACKEND_BASE;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('getBackendBase uses REACT_APP_BACKEND_URL and trims trailing slashes', () => {
    process.env.REACT_APP_BACKEND_URL = 'http://example.com///';
    const { getBackendBase } = require('./backend');
    expect(getBackendBase()).toBe('http://example.com');
  });

  test('getBackendBase falls back to REACT_APP_BACKEND_BASE when URL is absent', () => {
    process.env.REACT_APP_BACKEND_BASE = 'http://legacy.local/';
    const { getBackendBase } = require('./backend');
    expect(getBackendBase()).toBe('http://legacy.local');
  });

  test('getBackendBase defaults to localhost:8101 in development when env vars are absent', () => {
    process.env.NODE_ENV = 'development';
    const { getBackendBase } = require('./backend');
    expect(getBackendBase()).toBe('http://localhost:8101');
  });

  test('backendUrl normalizes leading slash', () => {
    process.env.REACT_APP_BACKEND_URL = 'http://backend.local';
    const { backendUrl } = require('./backend');
    expect(backendUrl('api/x')).toBe('http://backend.local/api/x');
    expect(backendUrl('/api/y')).toBe('http://backend.local/api/y');
  });
});

