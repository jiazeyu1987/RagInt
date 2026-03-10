import {
  DEFAULT_ASR_FILTER_CHAT_NAME,
  DEFAULT_ASR_FILTER_TERMS,
  DEFAULT_ASR_FILTER_PROMPT,
} from './asrFilter';

describe('asrFilter config', () => {
  test('exports non-empty defaults', () => {
    expect(typeof DEFAULT_ASR_FILTER_CHAT_NAME).toBe('string');
    expect(DEFAULT_ASR_FILTER_CHAT_NAME.trim().length).toBeGreaterThan(0);

    expect(typeof DEFAULT_ASR_FILTER_TERMS).toBe('string');
    expect(DEFAULT_ASR_FILTER_TERMS.trim().length).toBeGreaterThan(0);

    expect(typeof DEFAULT_ASR_FILTER_PROMPT).toBe('string');
    expect(DEFAULT_ASR_FILTER_PROMPT.trim().length).toBeGreaterThan(0);
  });
});
