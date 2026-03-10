import { renderHook } from '../testUtils/renderHook';
import { useTourTemplates } from './useTourTemplates';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useTourTemplates', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('loads templates when enabled', async () => {
    fetchJson.mockResolvedValue({ templates: [{ id: 't1', name: 'Template 1' }] });
    const hook = renderHook((p) => useTourTemplates(p), { enabled: true });
    await hook.flush();
    await hook.flush();

    expect(fetchJson).toHaveBeenCalledWith('/api/tour/templates');
    expect(hook.result().templates).toEqual([{ id: 't1', name: 'Template 1' }]);
    expect(hook.result().error).toBe('');
    hook.unmount();
  });

  test('returns empty templates and error on failure', async () => {
    fetchJson.mockRejectedValue(new Error('fetch_failed'));
    const hook = renderHook((p) => useTourTemplates(p), { enabled: true });
    await hook.flush();
    await hook.flush();

    expect(hook.result().templates).toEqual([]);
    expect(hook.result().error).toBe('fetch_failed');
    hook.unmount();
  });
});

