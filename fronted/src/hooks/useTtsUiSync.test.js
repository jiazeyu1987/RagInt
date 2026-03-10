import { renderHook } from '../testUtils/renderHook';
import { useTtsUiSync } from './useTtsUiSync';

describe('useTtsUiSync', () => {
  test('stops playback when tts disabled and syncs manager settings', async () => {
    const pause = jest.fn();
    const setQueueStatus = jest.fn();
    const ttsManager = {
      stop: jest.fn(),
      setTtsProvider: jest.fn(),
      setTtsVoice: jest.fn(),
      setTtsSpeed: jest.fn(),
      setFetchConcurrency: jest.fn(),
    };
    const currentAudioRef = { current: { pause, src: 'http://audio' } };
    const ttsManagerRef = { current: ttsManager };
    const ttsEnabledRef = { current: true };

    const hook = renderHook((p) => {
      useTtsUiSync(p);
      return null;
    }, {
      ttsEnabled: false,
      ttsEnabledRef,
      currentAudioRef,
      ttsManagerRef,
      setQueueStatus,
      ttsMode: 'modelscope',
      modelscopeVoice: 'voice-1',
      ttsSpeed: 1.25,
      ttsFetchConcurrency: 6,
    });

    await hook.flush();

    expect(ttsEnabledRef.current).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(currentAudioRef.current).toBeNull();
    expect(ttsManager.stop).toHaveBeenCalledWith('tts_disabled');
    expect(setQueueStatus).toHaveBeenCalledWith('');
    expect(ttsManager.setTtsProvider).toHaveBeenCalledWith('modelscope', 'ui_change');
    expect(ttsManager.setTtsVoice).toHaveBeenCalledWith('voice-1', 'ui_change');
    expect(ttsManager.setTtsSpeed).toHaveBeenCalledWith(1.25, 'ui_change');
    expect(ttsManager.setFetchConcurrency).toHaveBeenCalledWith(6, 'ui_change');

    hook.unmount();
  });
});

