import { renderHook } from '../testUtils/renderHook';
import { useTourBootstrap } from './useTourBootstrap';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useTourBootstrap', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('loads tour meta/stops and applies updater callbacks', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/tour/meta') {
        return Promise.resolve({
          zones: ['Zone A'],
          profiles: ['General'],
          default_zone: 'Zone A',
          default_profile: 'General',
        });
      }
      if (url === '/api/tour/stops') {
        return Promise.resolve({ stops: ['Stop A', 'Stop B'] });
      }
      return Promise.resolve({});
    });

    const setTourMeta = jest.fn();
    const setTourZone = jest.fn();
    const setAudienceProfile = jest.fn();
    const setTourStops = jest.fn();
    const setTourSelectedStopIndex = jest.fn();

    const hook = renderHook((p) => {
      useTourBootstrap(p);
      return null;
    }, {
      setTourMeta,
      setTourZone,
      setAudienceProfile,
      setTourStops,
      setTourSelectedStopIndex,
    });

    await hook.flush();
    await hook.flush();

    expect(setTourMeta).toHaveBeenCalledWith(expect.objectContaining({ default_zone: 'Zone A' }));
    expect(setTourStops).toHaveBeenCalledWith(['Stop A', 'Stop B']);

    const zoneUpdater = setTourZone.mock.calls[0][0];
    const profileUpdater = setAudienceProfile.mock.calls[0][0];
    const stopIndexUpdater = setTourSelectedStopIndex.mock.calls[0][0];
    expect(zoneUpdater('')).toBe('Zone A');
    expect(zoneUpdater('Zone X')).toBe('Zone X');
    expect(profileUpdater('')).toBe('General');
    expect(profileUpdater('Kids')).toBe('Kids');
    expect(stopIndexUpdater(9)).toBe(1);
    expect(stopIndexUpdater('bad')).toBe(0);

    hook.unmount();
  });

  test('reports meta load failure without clearing stops as a successful empty tour', async () => {
    const error = new Error('HTTP 500 /api/tour/meta');
    fetchJson.mockRejectedValue(error);

    const setTourStops = jest.fn();
    const onTourBootstrapError = jest.fn();

    const hook = renderHook((p) => {
      useTourBootstrap(p);
      return null;
    }, {
      setTourStops,
      onTourBootstrapError,
    });

    await hook.flush();
    await hook.flush();

    expect(onTourBootstrapError).toHaveBeenCalledWith(expect.objectContaining({
      source: '/api/tour/meta',
      error,
    }));
    expect(setTourStops).not.toHaveBeenCalledWith([]);

    hook.unmount();
  });

  test('reports stops load failure without replacing the tour with an empty stop list', async () => {
    const error = new Error('HTTP 500 /api/tour/stops');
    fetchJson.mockImplementation((url) => {
      if (url === '/api/tour/meta') return Promise.resolve({ zones: [], profiles: [] });
      if (url === '/api/tour/stops') return Promise.reject(error);
      return Promise.resolve({});
    });

    const setTourStops = jest.fn();
    const onTourBootstrapError = jest.fn();

    const hook = renderHook((p) => {
      useTourBootstrap(p);
      return null;
    }, {
      setTourStops,
      onTourBootstrapError,
    });

    await hook.flush();
    await hook.flush();

    expect(onTourBootstrapError).toHaveBeenCalledWith(expect.objectContaining({
      source: '/api/tour/stops',
      error,
    }));
    expect(setTourStops).not.toHaveBeenCalledWith([]);

    hook.unmount();
  });
});

