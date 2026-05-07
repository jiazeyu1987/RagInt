import { act } from 'react';
import { renderHook } from '../testUtils/renderHook';
import { useAppSettings } from './useAppSettings';
import { fetchAppSettings, saveAppSettings } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchAppSettings: jest.fn(),
  saveAppSettings: jest.fn(),
}));

async function waitUntilReady(hook, maxTries = 12) {
  for (let i = 0; i < maxTries; i += 1) {
    await hook.flush();
    if (hook.result().settingsReady) return;
  }
  throw new Error('settings did not become ready');
}

describe('useAppSettings', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.restoreAllMocks();
    fetchAppSettings.mockReset();
    saveAppSettings.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('loads server settings and normalizes values', async () => {
    fetchAppSettings.mockResolvedValueOnce({
      settings: {
        ttsMode: 'online',
        ttsFetchConcurrency: 8,
        wakeWordEnabled: 'true',
        asrAutoSubmitOnWakeEnabled: false,
        asrAutoResumeAfterAnswerDelayMs: 300,
        asrConversationAutoSubmitSilenceMs: 500,
        asrConversationAutoSubmitScope: 'voice_and_text',
        asrConversationContextStrategy: 'full',
        asrConversationContextRecentTurns: 20,
        asrConversationContextMaxTokens: 64000,
      },
    });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-1'));
    await waitUntilReady(hook);

    expect(fetchAppSettings).toHaveBeenCalledWith({ clientId: 'client-1' });
    expect(hook.result().ttsMode).toBe('modelscope');
    expect(hook.result().ttsFetchConcurrency).toBe(8);
    expect(hook.result().wakeWordEnabled).toBe(true);
    expect(hook.result().asrAutoSubmitOnWakeEnabled).toBeUndefined();
    expect(hook.result().asrAutoResumeAfterAnswerDelayMs).toBe(300);
    expect(hook.result().asrConversationAutoSubmitSilenceMs).toBe(500);
    expect(hook.result().asrConversationAutoSubmitScope).toBeUndefined();
    expect(hook.result().asrConversationContextStrategy).toBe('full');
    expect(hook.result().asrConversationContextRecentTurns).toBe(20);
    expect(hook.result().asrConversationContextMaxTokens).toBe(64000);

    act(() => {
      hook.result().setWakeWord('new wake');
    });
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        settings: expect.objectContaining({
          wakeWord: 'new wake',
        }),
      })
    );
    hook.unmount();
  });

  test('falls back to legacy localStorage settings when server payload is empty', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });
    window.localStorage.setItem('wakeWordEnabled', 'true');
    window.localStorage.setItem('wakeWord', 'legacy wake');
    window.localStorage.setItem('asrAutoSubmitOnWakeEnabled', 'false');
    window.localStorage.setItem('asrAutoResumeAfterAnswerDelayMs', '19999');
    window.localStorage.setItem('asrConversationAutoSubmitSilenceMs', '2222');
    window.localStorage.setItem('asrConversationAutoSubmitScope', 'voice_and_text');
    window.localStorage.setItem('asrConversationContextRecentTurns', '7');
    window.localStorage.setItem('ttsMode', 'local');

    const hook = renderHook(() => useAppSettings('client-2'));
    await waitUntilReady(hook);

    expect(hook.result().wakeWordEnabled).toBe(true);
    expect(hook.result().wakeWord).toBe('legacy wake');
    expect(hook.result().asrAutoSubmitOnWakeEnabled).toBeUndefined();
    expect(hook.result().asrAutoResumeAfterAnswerDelayMs).toBe(19999);
    expect(hook.result().asrConversationAutoSubmitSilenceMs).toBe(2222);
    expect(hook.result().asrConversationAutoSubmitScope).toBeUndefined();
    expect(hook.result().asrConversationContextRecentTurns).toBe(7);
    expect(hook.result().ttsMode).toBe('sovtts1');
    hook.unmount();
  });

  test('uses initial defaults without error when server and legacy settings are missing', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-empty'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toBeNull();
    expect(hook.result().ttsMode).toBe('modelscope');
    expect(hook.result().wakeWordEnabled).toBe(false);
    hook.unmount();
  });

  test('exposes a load error when server settings contain explicit invalid values', async () => {
    fetchAppSettings.mockResolvedValueOnce({
      settings: {
        wakeWordEnabled: 'maybe',
        ttsSpeed: 'fast',
        asrMinRecordMs: 199,
        saucWsUrl: '   ',
      },
    });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-invalid-server-settings'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toContain('Invalid persisted application setting');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when server settings contain explicit invalid enum values', async () => {
    fetchAppSettings.mockResolvedValueOnce({
      settings: {
        ttsMode: 'unknown-provider',
        ttsFetchConcurrency: 3,
        asrProviderType: 'browser',
        asrFinalTimeoutStrategy: 'drop_input',
        asrConversationContextStrategy: 'latest_only',
        settingsActiveTab: 'missing-tab',
      },
    });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-invalid-server-enums'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toContain('Invalid persisted application setting');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when legacy settings contain explicit invalid numeric text', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });
    window.localStorage.setItem('guideDuration', 'abc');
    window.localStorage.setItem('qaAnswerTargetChars', 'none');
    window.localStorage.setItem('qaAudioCacheConfidenceThreshold', 'high');

    const hook = renderHook(() => useAppSettings('client-invalid-legacy-numeric-text'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toContain('Invalid persisted application setting');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when legacy settings contain explicit invalid values', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });
    window.localStorage.setItem('wakeWordEnabled', 'maybe');
    window.localStorage.setItem('asrMinRecordMs', '10001');
    window.localStorage.setItem('saucResourceId', '');

    const hook = renderHook(() => useAppSettings('client-invalid-legacy-settings'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toContain('Invalid persisted application setting');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when legacy localStorage JSON is damaged', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });
    window.localStorage.setItem('tourStopsOverride', '{damaged-json');

    const hook = renderHook(() => useAppSettings('client-damaged'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause).toBeInstanceOf(SyntaxError);
    expect(hook.result().ttsMode).toBe('modelscope');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when legacy localStorage cannot be read', async () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage_read_failed');
    });
    fetchAppSettings.mockResolvedValueOnce({ settings: {} });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-storage-read-fail'));
    await waitUntilReady(hook);

    expect(getItemSpy).toHaveBeenCalled();
    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toBe('storage_read_failed');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a load error when settings API fails', async () => {
    fetchAppSettings.mockRejectedValueOnce(new Error('settings_api_failed'));
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-api-fail'));
    await waitUntilReady(hook);

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'load',
        message: expect.stringContaining('Failed to load application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toBe('settings_api_failed');
    expect(hook.result().ttsMode).toBe('modelscope');
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();
    expect(saveAppSettings).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('exposes a save error and retries after persistence fails', async () => {
    fetchAppSettings.mockResolvedValueOnce({ settings: { wakeWord: 'server wake' } });
    saveAppSettings.mockRejectedValueOnce(new Error('save_failed')).mockResolvedValueOnce({ ok: true });

    const hook = renderHook(() => useAppSettings('client-save-fail'));
    await waitUntilReady(hook);

    act(() => {
      hook.result().setWakeWord('first update');
    });
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(hook.result().settingsError).toEqual(
      expect.objectContaining({
        phase: 'save',
        message: expect.stringContaining('Failed to save application settings'),
      })
    );
    expect(hook.result().settingsError.cause.message).toBe('save_failed');

    act(() => {
      hook.result().setWakeWord('second update');
    });
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await hook.flush();

    expect(saveAppSettings).toHaveBeenCalledTimes(2);
    expect(saveAppSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clientId: 'client-save-fail',
        settings: expect.objectContaining({
          wakeWord: 'second update',
        }),
      })
    );
    hook.unmount();
  });
});
