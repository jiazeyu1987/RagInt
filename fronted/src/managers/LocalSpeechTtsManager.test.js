import { LocalSpeechTtsManager } from './LocalSpeechTtsManager';

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('LocalSpeechTtsManager', () => {
  let originalSpeechSynthesis;
  let originalSpeechUtterance;

  beforeEach(() => {
    originalSpeechSynthesis = window.speechSynthesis;
    originalSpeechUtterance = window.SpeechSynthesisUtterance;
  });

  afterEach(() => {
    window.speechSynthesis = originalSpeechSynthesis;
    window.SpeechSynthesisUtterance = originalSpeechUtterance;
  });

  test('dedupes text segments and reports queue stats', () => {
    window.speechSynthesis = {
      cancel: jest.fn(),
      speaking: false,
      pending: false,
      getVoices: jest.fn().mockReturnValue([]),
      speak: jest.fn(),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
    };

    const mgr = new LocalSpeechTtsManager();
    mgr.resetForRun({ requestId: 'r1' });

    const first = mgr.enqueueText('hello', { stopIndex: 1 });
    const second = mgr.enqueueText('hello', { stopIndex: 1 });

    expect(first).toEqual(expect.objectContaining({ seq: 0, seg: 'hello', stopIndex: 1 }));
    expect(second).toBeNull();
    expect(mgr.hasAnySegment()).toBe(true);
    expect(mgr.getStats()).toEqual(
      expect.objectContaining({
        textCount: 1,
        ragDone: false,
      })
    );
  });

  test('plays queued speech and emits play_end once rag is done', async () => {
    window.speechSynthesis = {
      cancel: jest.fn(),
      speaking: false,
      pending: false,
      getVoices: jest.fn().mockReturnValue([{ name: 'v1', lang: 'zh-CN' }]),
      speak: jest.fn((utter) => {
        if (utter && typeof utter.onstart === 'function') utter.onstart();
        if (utter && typeof utter.onend === 'function') utter.onend();
      }),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    };

    const emitClientEvent = jest.fn();
    const mgr = new LocalSpeechTtsManager({
      getClientId: () => 'c1',
      nowMs: () => 1000,
      emitClientEvent,
    });

    mgr.resetForRun({ requestId: 'ask_1' });
    mgr.enqueueText('segment-1', { stopIndex: 0 });
    mgr.markRagDone();
    mgr.ensureRunning();
    await mgr.waitForIdle();
    await flushPromises();

    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ask_1',
        kind: 'client',
        name: 'play_end',
      })
    );
  });

  test('stop cancels speech and emits play_cancelled', () => {
    window.speechSynthesis = {
      cancel: jest.fn(),
      speaking: true,
      pending: false,
      getVoices: jest.fn().mockReturnValue([]),
      speak: jest.fn(),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
    };

    const emitClientEvent = jest.fn();
    const mgr = new LocalSpeechTtsManager({
      getClientId: () => 'c2',
      emitClientEvent,
    });
    mgr.resetForRun({ requestId: 'ask_2' });

    mgr.stop('interrupt');

    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(emitClientEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'ask_2',
        name: 'play_cancelled',
        fields: expect.objectContaining({ reason: 'interrupt' }),
      })
    );
  });

  test('reports getVoices failure instead of treating it as no voices', async () => {
    const getVoicesError = new Error('voice list unavailable');
    window.speechSynthesis = {
      cancel: jest.fn(),
      speaking: false,
      pending: false,
      getVoices: jest.fn(() => {
        throw getVoicesError;
      }),
      speak: jest.fn(),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    };

    const onError = jest.fn();
    const mgr = new LocalSpeechTtsManager({ onError });
    mgr.resetForRun({ requestId: 'ask_voices_error' });
    mgr.enqueueText('segment with voice failure', { stopIndex: 0 });
    mgr.markRagDone();
    mgr.ensureRunning();

    await expect(mgr.waitForIdle()).rejects.toThrow('[TTS_LOCAL] get_voices_failed');
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('[TTS_LOCAL] player_error', expect.any(Error));
  });

  test('reports speak failure instead of continuing as successful playback', async () => {
    const speakError = new Error('speak failed');
    window.speechSynthesis = {
      cancel: jest.fn(),
      speaking: false,
      pending: false,
      getVoices: jest.fn().mockReturnValue([]),
      speak: jest.fn(() => {
        throw speakError;
      }),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    };

    const emitClientEvent = jest.fn();
    const onError = jest.fn();
    const mgr = new LocalSpeechTtsManager({ emitClientEvent, onError });
    mgr.resetForRun({ requestId: 'ask_speak_error' });
    window.speechSynthesis.cancel.mockClear();
    mgr.enqueueText('segment with speak failure', { stopIndex: 0 });
    mgr.markRagDone();
    mgr.ensureRunning();

    await expect(mgr.waitForIdle()).rejects.toThrow('speak failed');
    expect(onError).toHaveBeenCalledWith('[TTS_LOCAL] player_error', speakError);
    expect(emitClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'play_end' }));
    expect(window.speechSynthesis.cancel).not.toHaveBeenCalled();
  });

  test('stop reports cancel failure instead of swallowing it', () => {
    const cancelError = new Error('cancel failed');
    window.speechSynthesis = {
      cancel: jest.fn(() => {
        throw cancelError;
      }),
      speaking: true,
      pending: false,
      getVoices: jest.fn().mockReturnValue([]),
      speak: jest.fn(),
    };
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
    };

    const emitClientEvent = jest.fn();
    const mgr = new LocalSpeechTtsManager({ emitClientEvent });
    mgr._requestId = 'ask_cancel_error';

    expect(() => mgr.stop('interrupt')).toThrow('cancel failed');
    expect(emitClientEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'play_cancelled' }));
  });
});
