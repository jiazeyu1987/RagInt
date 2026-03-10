import { fetchJson } from '../api/backendClient';
import { renderHook } from '../testUtils/renderHook';
import { useBackendEvents } from './useBackendEvents';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useBackendEvents', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('does not fetch when request id is empty', () => {
    const hook = renderHook(
      ({ requestId, options }) => useBackendEvents(requestId, options),
      { requestId: '', options: { enabled: true } }
    );

    expect(fetchJson).not.toHaveBeenCalled();
    expect(hook.result().items).toBe(null);
    expect(hook.result().error).toBe(null);
    hook.unmount();
  });

  test('fetches events and last error on success', async () => {
    fetchJson.mockResolvedValueOnce({
      items: [{ name: 'evt_1' }],
      last_error: { code: 'x' },
    });

    const hook = renderHook(
      ({ requestId, options }) => useBackendEvents(requestId, options),
      { requestId: 'rid-evt', options: { enabled: true, limit: 10 } }
    );

    await hook.flush();

    expect(fetchJson).toHaveBeenCalledWith('/api/events?request_id=rid-evt&limit=10');
    expect(hook.result().items).toEqual([{ name: 'evt_1' }]);
    expect(hook.result().lastError).toEqual({ code: 'x' });
    expect(hook.result().error).toBe(null);
    hook.unmount();
  });

  test('sets error message when fetch fails', async () => {
    fetchJson.mockRejectedValueOnce(new Error('events_error'));
    const hook = renderHook(
      ({ requestId, options }) => useBackendEvents(requestId, options),
      { requestId: 'rid-err', options: { enabled: true } }
    );

    await hook.flush();

    expect(hook.result().error).toBe('events_error');
    hook.unmount();
  });

  test('enforces polling interval lower bound to 400ms', () => {
    const intervalSpy = jest.spyOn(global, 'setInterval');
    fetchJson.mockResolvedValue({ items: [] });

    const hook = renderHook(
      ({ requestId, options }) => useBackendEvents(requestId, options),
      { requestId: 'rid-timer', options: { enabled: true, intervalMs: 10 } }
    );

    expect(intervalSpy).toHaveBeenCalled();
    expect(intervalSpy.mock.calls[0][1]).toBe(400);

    hook.unmount();
    intervalSpy.mockRestore();
  });
});

