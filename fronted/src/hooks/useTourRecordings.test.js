import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useTourRecordings } from './useTourRecordings';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useTourRecordings', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('handles start/finish/rename/delete workflows', async () => {
    fetchJson.mockImplementation((url, opts) => {
      if (url === '/api/recordings/start' && opts && opts.method === 'POST') {
        return Promise.resolve({ recording_id: 'rec-1' });
      }
      if (String(url).includes('/finish')) return Promise.resolve({ ok: true });
      if (String(url).includes('/rename')) return Promise.resolve({ ok: true });
      if (String(url).includes('/api/recordings/rec-1') && opts && opts.method === 'DELETE') return Promise.resolve({ ok: true });
      if (url === '/api/recordings/rec-1') return Promise.resolve({ recording_id: 'rec-1' });
      return Promise.resolve({ ok: true });
    });

    const refreshTourRecordingOptions = jest.fn().mockResolvedValue(undefined);
    const setSelectedTourRecordingId = jest.fn();
    const activeTourRecordingIdRef = { current: '' };
    const selectedTourRecordingIdRef = { current: 'rec-1' };
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('renamed');
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    const hook = renderHook((p) => useTourRecordings(p), {
      clientIdRef: { current: 'cid-1' },
      activeTourRecordingIdRef,
      selectedTourRecordingIdRef,
      setSelectedTourRecordingId,
      refreshTourRecordingOptions,
      getCurrentTtsProfile: () => ({ provider: 'modelscope', voice: 'v1', speed: 1.25 }),
    });

    await act(async () => {
      const rid = await hook.result().startTourRecordingArchive(['Stop A']);
      expect(rid).toBe('rec-1');
      await hook.result().finishTourRecordingArchive();
      await hook.result().loadTourRecordingMeta('rec-1');
      await hook.result().renameSelectedTourRecording();
      await hook.result().deleteSelectedTourRecording();
    });

    expect(activeTourRecordingIdRef.current).toBe('rec-1');
    expect(fetchJson).toHaveBeenCalledWith('/api/recordings/start', expect.objectContaining({ method: 'POST' }));
    expect(fetchJson).toHaveBeenCalledWith('/api/recordings/rec-1/finish', expect.objectContaining({ method: 'POST' }));
    expect(fetchJson).toHaveBeenCalledWith('/api/recordings/rec-1/rename', expect.objectContaining({ method: 'POST' }));
    expect(fetchJson).toHaveBeenCalledWith('/api/recordings/rec-1', { method: 'DELETE' });
    expect(setSelectedTourRecordingId).toHaveBeenCalledWith('');
    expect(refreshTourRecordingOptions).toHaveBeenCalled();

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
    hook.unmount();
  });
});

