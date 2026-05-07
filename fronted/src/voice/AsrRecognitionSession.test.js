import { AsrRecognitionSession } from './AsrRecognitionSession';

describe('AsrRecognitionSession', () => {
  test('composes recognized text onto base text', () => {
    const session = new AsrRecognitionSession();
    session.reset('base text');

    expect(session.composeInputText('recognized text', 'base text')).toBe('base text recognized text');
  });

  test('preserves user-appended suffix when recognized text updates', () => {
    const session = new AsrRecognitionSession();
    session.reset('base text');
    session.setLastAppliedInputText('base text partial result');

    expect(session.composeInputText('final result', 'base text partial result user suffix')).toBe(
      'base text final result user suffix'
    );
  });

  test('tracks assembled transcript and timeout fallback text', () => {
    const session = new AsrRecognitionSession();
    session.reset('base text');

    session.applyPartial('today weather is nice');
    session.applyPartial('i will go shopping');
    session.applyFinal('buy some things');

    expect(session.getRecognizedText()).toBe('today weather is nice i will go shopping buy some things');
    expect(session.resolveTimeoutText('')).toBe('today weather is nice i will go shopping buy some things');
  });

  test('rejects external timeout fallback text when no ASR transcript exists', () => {
    const session = new AsrRecognitionSession();
    session.reset('base text');

    expect(() => session.resolveTimeoutText('manual fallback')).toThrow('ASR timeout fallback text is not allowed');
  });
});
