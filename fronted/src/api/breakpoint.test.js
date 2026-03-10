import { fetchJson } from './backendClient';
import { clearBreakpoint, getBreakpoint, setBreakpoint } from './breakpoint';

jest.mock('./backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('breakpoint api wrappers', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('getBreakpoint sends encoded kind and client header', async () => {
    const signal = { tag: 'abort-signal' };
    fetchJson.mockResolvedValueOnce({ ok: true });

    await getBreakpoint({ clientId: ' c-1 ', kind: 'tour mode', signal });

    expect(fetchJson).toHaveBeenCalledWith('/api/breakpoint?kind=tour%20mode', {
      method: 'GET',
      headers: { 'X-Client-ID': 'c-1' },
      signal,
    });
  });

  test('setBreakpoint posts state with defaults', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });

    await setBreakpoint({ clientId: 'c-2' });

    expect(fetchJson).toHaveBeenCalledWith('/api/breakpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': 'c-2',
      },
      body: JSON.stringify({ kind: 'tour', state: {} }),
      signal: undefined,
    });
  });

  test('clearBreakpoint sends delete request', async () => {
    fetchJson.mockResolvedValueOnce({ ok: true });

    await clearBreakpoint({ clientId: ' c-3 ', kind: 'qa' });

    expect(fetchJson).toHaveBeenCalledWith('/api/breakpoint?kind=qa', {
      method: 'DELETE',
      headers: { 'X-Client-ID': 'c-3' },
      signal: undefined,
    });
  });
});

