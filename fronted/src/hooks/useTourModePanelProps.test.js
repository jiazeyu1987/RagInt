import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useTourModePanelProps } from './useTourModePanelProps';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useTourModePanelProps', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('builds selected template bindings and syncs overrides', async () => {
    fetchJson.mockResolvedValue({ stops: ['Stop A', 'Stop B'] });
    const setTourStopsOverride = jest.fn();
    const setTourStopDurationsOverride = jest.fn();
    const setTourGuideTemplates = jest.fn();
    const setTourGuideTemplateId = jest.fn();

    const hook = renderHook((p) => useTourModePanelProps(p), {
      tourGuideTemplates: [
        {
          id: 'tpl-1',
          name: 'Template 1',
          stops: [
            { name: 'Stop A', enabled: true, duration_s: 120 },
            { name: 'Stop B', enabled: false, duration_s: 90 },
          ],
        },
      ],
      setTourGuideTemplates,
      tourGuideTemplateId: 'tpl-1',
      setTourGuideTemplateId,
      tourStops: ['Stop A', 'Stop B'],
      setTourStopsOverride,
      setTourStopDurationsOverride,
    });

    await hook.flush();
    await hook.flush();

    expect(setTourStopsOverride).toHaveBeenCalled();
    expect(setTourStopDurationsOverride).toHaveBeenCalled();
    expect(hook.result().selectedTemplateId).toBe('tpl-1');
    expect(Array.isArray(hook.result().templates)).toBe(true);

    setTourGuideTemplates.mockClear();
    act(() => {
      hook.result().onCreateTemplate();
    });
    expect(setTourGuideTemplates).toHaveBeenCalled();

    hook.unmount();
  });
});

