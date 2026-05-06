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

  test('reports backend failure instead of empty templates', async () => {
    fetchJson.mockResolvedValue({ ok: false, error: 'ragflow_config_invalid' });
    const hook = renderHook((p) => useTourTemplates(p), { enabled: true });
    await hook.flush();
    await hook.flush();

    expect(hook.result().templates).toEqual([]);
    expect(hook.result().error).toBe('ragflow_config_invalid');
    hook.unmount();
  });

  test('reports invalid response shape instead of empty templates', async () => {
    fetchJson.mockResolvedValue({ templates: {} });
    const hook = renderHook((p) => useTourTemplates(p), { enabled: true });
    await hook.flush();
    await hook.flush();

    expect(hook.result().templates).toEqual([]);
    expect(hook.result().error).toBe('tour_templates_invalid_response');
    hook.unmount();
  });
});

