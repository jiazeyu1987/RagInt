import { fetchJson } from '../api/backendClient';
import { renderHook } from '../testUtils/renderHook';
import { useBackendStatus } from './useBackendStatus';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useBackendStatus', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('does not fetch when request id is empty', () => {
    const hook = renderHook(
      ({ requestId, options }) => useBackendStatus(requestId, options),
      { requestId: '', options: { enabled: true } }
    );

    expect(fetchJson).not.toHaveBeenCalled();
    expect(hook.result().status).toBe(null);
    expect(hook.result().error).toBe(null);
    hook.unmount();
  });

  test('fetches status and clears error on success', async () => {
    fetchJson.mockResolvedValueOnce({ running: true });
    const hook = renderHook(
      ({ requestId, options }) => useBackendStatus(requestId, options),
      { requestId: 'rid-1', options: { enabled: true, intervalMs: 1000 } }
    );

    await hook.flush();

    expect(fetchJson).toHaveBeenCalledWith('/api/status?request_id=rid-1');
    expect(hook.result().status).toEqual({ running: true });
    expect(hook.result().error).toBe(null);
    hook.unmount();
  });

  test('sets error message on fetch failure', async () => {
    fetchJson.mockRejectedValueOnce(new Error('status_error'));
    const hook = renderHook(
      ({ requestId, options }) => useBackendStatus(requestId, options),
      { requestId: 'rid-2', options: { enabled: true } }
    );

    await hook.flush();

    expect(hook.result().error).toBe('status_error');
    hook.unmount();
  });

  test('enforces polling interval lower bound to 300ms', () => {
    const intervalSpy = jest.spyOn(global, 'setInterval');
    fetchJson.mockResolvedValue({ ok: true });

    const hook = renderHook(
      ({ requestId, options }) => useBackendStatus(requestId, options),
      { requestId: 'rid-3', options: { enabled: true, intervalMs: 100 } }
    );

    expect(intervalSpy).toHaveBeenCalled();
    expect(intervalSpy.mock.calls[0][1]).toBe(300);

    hook.unmount();
    intervalSpy.mockRestore();
  });
});

