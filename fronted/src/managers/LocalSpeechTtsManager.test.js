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
});
