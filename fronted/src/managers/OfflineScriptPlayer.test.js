import { OfflineScriptPlayer } from './OfflineScriptPlayer';
import { fetchJson, backendUrl } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
  backendUrl: jest.fn((path) => `http://unit.test${path}`),
}));

describe('OfflineScriptPlayer', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    backendUrl.mockClear();
  });

  test('loads manifest via backend', async () => {
    fetchJson.mockResolvedValueOnce({ title: 'demo', items: [] });
    const player = new OfflineScriptPlayer();

    await expect(player.loadManifest()).resolves.toEqual({ title: 'demo', items: [] });
    expect(fetchJson).toHaveBeenCalledWith('/api/offline/manifest');
  });

  test('returns manifest_empty when no items exist', async () => {
    fetchJson.mockResolvedValueOnce({ title: 'empty', items: [] });
    const emitClientEvent = jest.fn();
    const player = new OfflineScriptPlayer({ clientIdRef: { current: 'c-1' }, emitClientEvent });

    await expect(player.playAll()).resolves.toEqual({ ok: false, error: 'manifest_empty' });
    expect(player.isPlaying()).toBe(false);
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'offline',
        name: 'offline_play_failed',
        clientId: 'c-1',
      })
    );
  });

  test('plays manifest items and emits lifecycle events', async () => {
    fetchJson.mockResolvedValueOnce({
      title: 'guided',
      items: [{ id: 's1', stop_id: 'stop_1', stop_name: 'Stop 1' }],
    });

    const pause = jest.fn();
    const play = jest.fn().mockImplementation(function playMock() {
      this.ended = true;
      return Promise.resolve();
    });
    global.Audio = jest.fn().mockImplementation(function AudioMock(url) {
      this.url = url;
      this.ended = false;
      this.pause = pause;
      this.play = play;
      this.src = url;
      this.onended = null;
      this.onerror = null;
      this.onpause = null;
    });

    const emitClientEvent = jest.fn();
    const player = new OfflineScriptPlayer({ clientIdRef: { current: 'cid' }, emitClientEvent });
    const result = await player.playAll();

    expect(result).toEqual({ ok: true });
    expect(backendUrl).toHaveBeenCalled();
    expect(Audio).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);

    const names = emitClientEvent.mock.calls.map((c) => c[0] && c[0].name);
    expect(names).toEqual(
      expect.arrayContaining(['offline_play_start', 'offline_item_start', 'offline_item_end', 'offline_play_end'])
    );
  });

  test('stop cancels current audio and emits cancel event', () => {
    const emitClientEvent = jest.fn();
    const player = new OfflineScriptPlayer({ emitClientEvent });
    player._audio = { pause: jest.fn(), src: 'x' };
    player._sessionId = 'offline_session';
    player._playing = true;

    player.stop('manual');

    expect(player._audio).toBeNull();
    expect(player.isPlaying()).toBe(false);
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'offline_play_cancelled',
        fields: expect.objectContaining({ reason: 'manual' }),
      })
    );
  });
});
