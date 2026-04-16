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
        ttsFetchConcurrency: 9,
        wakeWordEnabled: 'true',
        asrAutoSubmitOnWakeEnabled: false,
        asrAutoResumeAfterAnswerDelayMs: 100,
        asrConversationAutoSubmitSilenceMs: 100,
        asrConversationAutoSubmitScope: 'voice_and_text',
        asrConversationContextStrategy: 'full',
        asrConversationContextRecentTurns: 99,
        asrConversationContextMaxTokens: 999999,
      },
    });
    saveAppSettings.mockResolvedValue({ ok: true });

    const hook = renderHook(() => useAppSettings('client-1'));
    await waitUntilReady(hook);

    expect(fetchAppSettings).toHaveBeenCalledWith({ clientId: 'client-1' });
    expect(hook.result().ttsMode).toBe('modelscope');
    expect(hook.result().ttsFetchConcurrency).toBe(4);
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
    window.localStorage.setItem('asrAutoResumeAfterAnswerDelayMs', '99999');
    window.localStorage.setItem('asrConversationAutoSubmitSilenceMs', '2222');
    window.localStorage.setItem('asrConversationAutoSubmitScope', 'voice_and_text');
    window.localStorage.setItem('asrConversationContextRecentTurns', '7');
    window.localStorage.setItem('ttsMode', 'local');

    const hook = renderHook(() => useAppSettings('client-2'));
    await waitUntilReady(hook);

    expect(hook.result().wakeWordEnabled).toBe(true);
    expect(hook.result().wakeWord).toBe('legacy wake');
    expect(hook.result().asrAutoSubmitOnWakeEnabled).toBeUndefined();
    expect(hook.result().asrAutoResumeAfterAnswerDelayMs).toBe(20000);
    expect(hook.result().asrConversationAutoSubmitSilenceMs).toBe(2222);
    expect(hook.result().asrConversationAutoSubmitScope).toBeUndefined();
    expect(hook.result().asrConversationContextRecentTurns).toBe(7);
    expect(hook.result().ttsMode).toBe('sovtts1');
    hook.unmount();
  });
});
