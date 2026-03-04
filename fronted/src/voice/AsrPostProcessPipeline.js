function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function parseWakeWordList(raw) {
  return String(raw || '')
    .split(/[,\uFF0C;]/g)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildAsrFilterDomainTerms({ domainTermsText, wakeWordText }) {
  const terms = String(domainTermsText || '').trim();
  const wakeWords = parseWakeWordList(wakeWordText);
  if (!wakeWords.length) return terms;
  return [terms, wakeWords.join(',')].filter(Boolean).join(',');
}

function resolveWakeWordMatch(text, wakeWords, strict) {
  const source = String(text || '').trim();
  if (!source) return null;
  for (const rawWord of wakeWords || []) {
    const word = String(rawWord || '').trim();
    if (!word) continue;
    const idx = source.indexOf(word);
    if (idx < 0) continue;
    if (strict) {
      if (idx === 0) return { word, index: idx };
      continue;
    }
    if (idx <= 2) return { word, index: idx };
  }
  return null;
}

function stripWakeWordPrefix(text, match) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (!match || !match.word) return source;
  const start = Math.max(0, Number(match.index) || 0);
  const end = start + String(match.word).length;
  return source.slice(end).replace(/^[\s锛?銆傦紒锛??:锛?锛涖€?]+/, '').trim();
}

export class AsrPostProcessPipeline {
  constructor({
    filterAsrText,
    now = () => Date.now(),
    wakeHoldMs = 8000,
  } = {}) {
    this._filterAsrText = typeof filterAsrText === 'function' ? filterAsrText : null;
    this._now = typeof now === 'function' ? now : () => Date.now();
    this._wakeHoldMs = Math.max(0, Number(wakeHoldMs) || 8000);
    this._pendingAsrText = '';
    this._wakeHoldUntilMs = 0;
  }

  setPendingAsrText(text) {
    this._pendingAsrText = safeTrim(text);
  }

  clearPendingAsrText() {
    this._pendingAsrText = '';
  }

  getWakeHoldUntilMs() {
    return this._wakeHoldUntilMs;
  }

  async process({
    text,
    trigger,
    wakeWordEnabled,
    wakeWord,
    wakeWordStrict,
    asrTextFilterEnabled,
    asrTextFilterPrompt,
    asrTextFilterChatName,
    asrTextFilterTerms,
    onStatusChange,
    onStageChange,
    onEvent,
  } = {}) {
    const emitEvent = (name, fields = {}) => {
      if (typeof onEvent !== 'function') return;
      try {
        onEvent({
          name: safeTrim(name),
          ts: this._now(),
          fields: fields && typeof fields === 'object' ? fields : {},
        });
      } catch (_) {
        // ignore
      }
    };
    const originalText = safeTrim(text);
    const normalizedTrigger = safeTrim(trigger).toLowerCase();
    const pendingAsrText = safeTrim(this._pendingAsrText);
    const looksLikePendingAsrText =
      !!originalText &&
      !!pendingAsrText &&
      originalText === pendingAsrText &&
      (normalizedTrigger === 'text' || normalizedTrigger === 'wake_word' || normalizedTrigger === 'voice');

    if (!looksLikePendingAsrText) {
      if (typeof onStageChange === 'function') onStageChange('bypass_non_asr');
      emitEvent('bypass_non_asr', { text: originalText, trigger: normalizedTrigger });
      return { accepted: true, text: originalText, correctedText: originalText, reason: 'bypass_non_asr', stage: 'bypass_non_asr' };
    }
    this._pendingAsrText = '';
    if (typeof onStageChange === 'function') onStageChange('pending_asr_matched');
      emitEvent('pending_asr_matched', { text: originalText, rawText: originalText, trigger: normalizedTrigger });

    const wakeWords = wakeWordEnabled ? parseWakeWordList(wakeWord) : [];
    const holdActive = this._now() < Number(this._wakeHoldUntilMs || 0);
    let correctedText = originalText;

    if (asrTextFilterEnabled && this._filterAsrText) {
      const prompt = safeTrim(asrTextFilterPrompt);
      const chatName = safeTrim(asrTextFilterChatName);
      const domainTerms = buildAsrFilterDomainTerms({
        domainTermsText: asrTextFilterTerms,
        wakeWordText: wakeWordEnabled ? wakeWord : '',
      });
      if (prompt && chatName) {
        try {
          if (typeof onStageChange === 'function') onStageChange('filtering');
          if (typeof onStatusChange === 'function') onStatusChange('processing_asr_text');
          emitEvent('filtering_started', { text: originalText, rawText: originalText, chatName, domainTerms });
          const res = await this._filterAsrText({
            text: originalText,
            prompt,
            chatName,
            domainTerms,
          });
          correctedText = safeTrim(res && res.text) || originalText;
          emitEvent('filtering_finished', { text: correctedText, rawText: originalText, correctedText });
        } catch (_) {
          correctedText = originalText;
          emitEvent('filtering_failed', { text: originalText, rawText: originalText });
        } finally {
          if (typeof onStatusChange === 'function') onStatusChange('');
        }
      }
    }

    let finalText = correctedText;
    if (wakeWords.length) {
      const wakeMatch = resolveWakeWordMatch(correctedText, wakeWords, !!wakeWordStrict);
      if (wakeMatch) {
        finalText = stripWakeWordPrefix(correctedText, wakeMatch);
        this._wakeHoldUntilMs = this._now() + this._wakeHoldMs;
        if (!finalText) {
          if (typeof onStageChange === 'function') onStageChange('wake_word_only');
          emitEvent('wake_word_only', { text: correctedText, rawText: originalText, correctedText, wakeWord: wakeMatch.word });
          return {
            accepted: false,
            text: '',
            correctedText,
            reason: 'wake_word_only',
            feedback: 'wake_word_detected',
            stage: 'wake_word_only',
          };
        }
      } else if (!holdActive) {
        if (typeof onStageChange === 'function') onStageChange('wake_word_missing');
        emitEvent('wake_word_missing', { text: correctedText, rawText: originalText, correctedText, wakeWordEnabled: true });
        return {
          accepted: false,
          text: '',
          correctedText,
          reason: 'wake_word_missing',
          feedback: 'wake_word_missing',
          stage: 'wake_word_missing',
        };
      } else if (finalText) {
        this._wakeHoldUntilMs = this._now() + this._wakeHoldMs;
        emitEvent('wake_word_hold_extended', { text: finalText, rawText: originalText, correctedText, finalText });
      }
    }

    if (typeof onStageChange === 'function') onStageChange('accepted');
    emitEvent('accepted', { text: finalText, rawText: originalText, correctedText, finalText });
    return {
      accepted: true,
      text: finalText,
      correctedText,
      reason: 'accepted',
      feedback: '',
      stage: 'accepted',
    };
  }
}

export { buildAsrFilterDomainTerms, parseWakeWordList, resolveWakeWordMatch, stripWakeWordPrefix };
