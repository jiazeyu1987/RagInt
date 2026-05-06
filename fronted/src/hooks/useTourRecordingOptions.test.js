import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useTourRecordingOptions } from './useTourRecordingOptions';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useTourRecordingOptions', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('loads options and refreshes', async () => {
    fetchJson.mockResolvedValue({
      items: [
        {
          recording_id: 'rec-1',
          display_name: 'R1',
          created_at_ms: 1710000000000,
          finished_at_ms: 1710000005000,
          stop_count: 3,
          metadata: {
            tts_provider: 'modelscope',
            tts_voice: 'voice-1',
            stored_audio_speed: 1.0,
            record_playback_speed: 1.0,
          },
        },
      ],
    });

    const hook = renderHook((p) => useTourRecordingOptions(p), {
      enabled: true,
      limit: 10,
      currentPlaybackSpeed: 1.25,
    });

    await hook.flush();
    await hook.flush();
    expect(hook.result().options).toHaveLength(1);
    expect(hook.result().ready).toBe(true);
    expect(hook.result().error).toBe('');
    expect(hook.result().options[0].recording_id).toBe('rec-1');
    expect(hook.result().options[0].label).toContain('1.25x');

    await act(async () => {
      await hook.result().refresh();
    });
    expect(fetchJson).toHaveBeenCalledWith('/api/recordings?limit=10');

    hook.unmount();
  });

  test('reports backend failure instead of silent empty options', async () => {
    fetchJson.mockResolvedValue({ ok: false, error: 'recordings_store_failed' });

    const hook = renderHook((p) => useTourRecordingOptions(p), {
      enabled: true,
      limit: 10,
      currentPlaybackSpeed: 1.0,
    });

    await hook.flush();
    await hook.flush();

    expect(hook.result().ready).toBe(true);
    expect(hook.result().options).toEqual([]);
    expect(hook.result().error).toBe('recordings_store_failed');
    hook.unmount();
  });

  test('reports invalid response shape instead of silent empty options', async () => {
    fetchJson.mockResolvedValue({ items: {} });

    const hook = renderHook((p) => useTourRecordingOptions(p), {
      enabled: true,
      limit: 10,
      currentPlaybackSpeed: 1.0,
    });

    await hook.flush();
    await hook.flush();

    expect(hook.result().ready).toBe(true);
    expect(hook.result().options).toEqual([]);
    expect(hook.result().error).toBe('recordings_invalid_response');
    hook.unmount();
  });
});

