import { AsrTranscriptAssembler } from './AsrTranscriptAssembler';

describe('AsrTranscriptAssembler', () => {
  test('extends hypothesis when partial text grows', () => {
    const assembler = new AsrTranscriptAssembler();

    expect(assembler.applyPartial('hello')).toBe('hello');
    expect(assembler.applyPartial('hello world')).toBe('hello world');
    expect(assembler.getCommittedSegments()).toEqual([]);
  });

  test('commits previous hypothesis when provider starts a new segment', () => {
    const assembler = new AsrTranscriptAssembler();

    assembler.applyPartial('today weather is nice');
    expect(assembler.applyPartial('i will go shopping')).toBe('today weather is nice i will go shopping');
    expect(assembler.getCommittedSegments()).toEqual(['today weather is nice']);
    expect(assembler.getHypothesisText()).toBe('i will go shopping');
  });

  test('final text commits cumulative transcript across pauses', () => {
    const assembler = new AsrTranscriptAssembler();

    assembler.applyPartial('today weather is nice');
    assembler.applyPartial('i will go to the supermarket');

    expect(assembler.applyFinal('buy some things')).toBe('today weather is nice i will go to the supermarket buy some things');
    expect(assembler.getCommittedSegments()).toEqual([
      'today weather is nice',
      'i will go to the supermarket',
      'buy some things',
    ]);
  });

  test('deduplicates overlapping Chinese segment boundaries', () => {
    const assembler = new AsrTranscriptAssembler();

    assembler.applyPartial('今天天气不错');
    expect(assembler.applyPartial('不错我准备去超市')).toBe('今天天气不错 我准备去超市');
    expect(assembler.applyFinal('超市买点东西')).toBe('今天天气不错 我准备去超市 买点东西');
  });
});
