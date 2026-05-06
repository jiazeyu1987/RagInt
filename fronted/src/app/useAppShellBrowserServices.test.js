import { renderHook } from '../testUtils/renderHook';
import { useAppShellBrowserServices } from './useAppShellBrowserServices';

describe('useAppShellBrowserServices', () => {
  test('cancels backend requests with the current client id', () => {
    const cancelRequest = jest.fn();
    const hook = renderHook((props) => useAppShellBrowserServices(props), {
      clientIdRef: { current: 'client-1' },
      audioContextRef: { current: null },
      cancelRequest,
      decodeAndConvertToWav16kMono: jest.fn(),
      unlockAudio: jest.fn(),
    });

    hook.result().cancelBackendRequest('request-1', 'manual');

    expect(cancelRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      clientId: 'client-1',
      reason: 'manual',
    });
  });

  test('delegates ASR audio conversion and audio unlock', async () => {
    const converted = { type: 'audio/wav' };
    const decodeAndConvertToWav16kMono = jest.fn().mockResolvedValue(converted);
    const unlockAudio = jest.fn();
    const audioContextRef = { current: null };
    const hook = renderHook((props) => useAppShellBrowserServices(props), {
      clientIdRef: { current: 'client-1' },
      audioContextRef,
      cancelRequest: jest.fn(),
      decodeAndConvertToWav16kMono,
      unlockAudio,
      preferredTtsSampleRate: 16000,
    });

    await expect(hook.result().decodeAndConvertToWav16kMono('blob')).resolves.toBe(converted);
    hook.result().unlockAudio();

    expect(decodeAndConvertToWav16kMono).toHaveBeenCalledWith('blob');
    expect(unlockAudio).toHaveBeenCalledWith(audioContextRef, 16000);
  });
});
