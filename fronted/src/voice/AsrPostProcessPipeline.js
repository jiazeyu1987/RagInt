function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function errorMessage(error) {
  return safeTrim(error && error.message ? error.message : error);
}

function createAsrFilterError(message) {
  return new Error(safeTrim(message) || 'ASR filter failed');
}

const FILTER_CACHE_TTL_MS = 30000;

function parseWakeWordList(raw) {
  return String(raw || '')
    .split(/[,\uFF0C;]/g)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function isWakeTokenChar(ch) {
  return /^[A-Za-z0-9\u4e00-\u9fff]$/.test(String(ch || ''));
}

function foldWakeTextWithMap(text) {
  const source = String(text || '');
  const map = [];
  let folded = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (!isWakeTokenChar(ch)) continue;
    folded += ch.toLowerCase();
    map.push(i);
  }
  return { folded, map };
}

function foldWakeText(text) {
  return foldWakeTextWithMap(text).folded;
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left) return right.length;
  if (!right) return left.length;

  const prev = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    let currDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const tmp = prev[j];
      const cost = left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, currDiag + cost);
      currDiag = tmp;
    }
  }
  return prev[right.length];
}

function maxWakeEditDistance(wordLen) {
  const n = Math.max(1, Number(wordLen) || 1);
  if (n <= 3) return 1;
  if (n <= 6) return 2;
  return Math.max(2, Math.round(n * 0.34));
}

function findFuzzyWakeWordMatch(text, wakeWord, strict) {
  const source = String(text || '').trim();
  const word = String(wakeWord || '').trim();
  if (!source || !word) return null;

  const foldedWord = foldWakeText(word);
  if (!foldedWord) return null;

  const foldedSourceInfo = foldWakeTextWithMap(source);
  const foldedSource = foldedSourceInfo.folded;
  const map = foldedSourceInfo.map;
  if (!foldedSource) return null;

  const maxLead = strict ? 0 : Math.min(4, Math.max(0, foldedSource.length - 1));
  const minLen = Math.max(1, foldedWord.length - 1);
  const maxLen = Math.min(foldedSource.length, foldedWord.length + 1);
  const maxDist = maxWakeEditDistance(foldedWord.length);
  let bestMatch = null;

  for (let start = 0; start <= maxLead && start < foldedSource.length; start += 1) {
    for (let len = minLen; len <= maxLen; len += 1) {
      const end = start + len;
      if (end > foldedSource.length) break;
      const candidate = foldedSource.slice(start, end);
      const dist = levenshteinDistance(candidate, foldedWord);
      if (dist > maxDist) continue;
      const similarity = 1 - dist / Math.max(candidate.length, foldedWord.length);
      if (similarity < 0.6) continue;

      const rawStart = map[start];
      const rawLast = map[end - 1];
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawLast)) continue;
      const next = {
        word,
        index: rawStart,
        endIndex: rawLast + 1,
        matchedText: source.slice(rawStart, rawLast + 1),
        kind: 'fuzzy',
        distance: dist,
        similarity,
        foldedLength: len,
      };
      if (!bestMatch) {
        bestMatch = next;
        continue;
      }
      const prevSimilarity = Number(bestMatch.similarity) || 0;
      const nextSimilarity = Number(next.similarity) || 0;
      const prevDistance = Number(bestMatch.distance) || 0;
      const nextDistance = Number(next.distance) || 0;
      const prevLen = Number(bestMatch.foldedLength) || 0;
      const nextLen = Number(next.foldedLength) || 0;
      const prevStart = Number(bestMatch.index) || 0;
      const nextStart = Number(next.index) || 0;
      const better =
        nextSimilarity > prevSimilarity ||
        (nextSimilarity === prevSimilarity && nextDistance < prevDistance) ||
        (nextSimilarity === prevSimilarity && nextDistance === prevDistance && nextLen > prevLen) ||
        (nextSimilarity === prevSimilarity && nextDistance === prevDistance && nextLen === prevLen && nextStart < prevStart);
      if (better) bestMatch = next;
    }
  }

  if (!bestMatch) return null;
  delete bestMatch.foldedLength;
  return bestMatch;
}

function buildFilterCacheKey({ text, prompt, chatName, domainTerms }) {
  return [safeTrim(text), safeTrim(prompt), safeTrim(chatName), safeTrim(domainTerms)].join('\n');
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
      if (idx === 0) return { word, index: idx, endIndex: idx + String(word).length, kind: 'exact' };
      continue;
    }
    if (idx <= 2) return { word, index: idx, endIndex: idx + String(word).length, kind: 'exact' };
  }
  for (const rawWord of wakeWords || []) {
    const word = String(rawWord || '').trim();
    if (!word) continue;
    const fuzzyMatch = findFuzzyWakeWordMatch(source, word, !!strict);
    if (fuzzyMatch) return fuzzyMatch;
  }
  return null;
}

function stripWakeWordPrefix(text, match) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (!match || !match.word) return source;
  const start = Math.max(0, Number(match.index) || 0);
  const end = Math.max(start, Number(match.endIndex) || start + String(match.word).length);
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
    this._filterCache = null;
    this._filterInFlight = null;
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

  _getCachedFilterText(cacheKey) {
    const key = safeTrim(cacheKey);
    if (!key || !this._filterCache || safeTrim(this._filterCache.key) !== key) return '';
    const createdAtMs = Number(this._filterCache.createdAtMs || 0);
    if (!Number.isFinite(createdAtMs) || this._now() - createdAtMs > FILTER_CACHE_TTL_MS) return '';
    return safeTrim(this._filterCache.text);
  }

  _setCachedFilterText(cacheKey, text) {
    const key = safeTrim(cacheKey);
    const nextText = safeTrim(text);
    if (!key || !nextText) return;
    this._filterCache = {
      key,
      text: nextText,
      createdAtMs: this._now(),
    };
  }

  async _resolveFilteredText({
    text,
    prompt,
    chatName,
    domainTerms,
  } = {}) {
    const sourceText = safeTrim(text);
    if (!sourceText) return '';
    if (!this._filterAsrText) throw createAsrFilterError('ASR filter dependency is required');
    const cacheKey = buildFilterCacheKey({ text: sourceText, prompt, chatName, domainTerms });
    const cachedText = this._getCachedFilterText(cacheKey);
    if (cachedText) return cachedText;

    if (this._filterInFlight && safeTrim(this._filterInFlight.key) === cacheKey && this._filterInFlight.promise) {
      return this._filterInFlight.promise;
    }

    const inFlightPromise = (async () => {
      const res = await this._filterAsrText({
        text: sourceText,
        prompt: safeTrim(prompt),
        chatName: safeTrim(chatName),
        domainTerms: safeTrim(domainTerms),
      });
      const correctedText = safeTrim(res && res.text);
      if (!correctedText) throw createAsrFilterError('ASR filter returned invalid text');
      this._setCachedFilterText(cacheKey, correctedText);
      return correctedText;
    })();

    this._filterInFlight = { key: cacheKey, promise: inFlightPromise };
    try {
      return await inFlightPromise;
    } finally {
      if (this._filterInFlight && safeTrim(this._filterInFlight.key) === cacheKey) this._filterInFlight = null;
    }
  }

  async prefetchFilter({
    text,
    wakeWordEnabled,
    wakeWord,
    asrTextFilterEnabled,
    asrTextFilterPrompt,
    asrTextFilterChatName,
    asrTextFilterTerms,
  } = {}) {
    const sourceText = safeTrim(text);
    if (!sourceText) return { ok: false, reason: 'empty_text', text: '' };
    if (!asrTextFilterEnabled) return { ok: false, reason: 'filter_disabled', text: sourceText };
    if (!this._filterAsrText) throw createAsrFilterError('ASR filter dependency is required');

    const prompt = safeTrim(asrTextFilterPrompt);
    const chatName = safeTrim(asrTextFilterChatName);
    if (!prompt || !chatName) throw createAsrFilterError('ASR filter config missing');

    const domainTerms = buildAsrFilterDomainTerms({
      domainTermsText: asrTextFilterTerms,
      wakeWordText: wakeWordEnabled ? wakeWord : '',
    });
    const correctedText = await this._resolveFilteredText({
      text: sourceText,
      prompt,
      chatName,
      domainTerms,
    });
    return { ok: true, reason: 'prefetched', text: correctedText, correctedText };
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

    if (asrTextFilterEnabled) {
      if (!this._filterAsrText) throw createAsrFilterError('ASR filter dependency is required');
      const prompt = safeTrim(asrTextFilterPrompt);
      const chatName = safeTrim(asrTextFilterChatName);
      if (!prompt || !chatName) throw createAsrFilterError('ASR filter config missing');
      const domainTerms = buildAsrFilterDomainTerms({
        domainTermsText: asrTextFilterTerms,
        wakeWordText: wakeWordEnabled ? wakeWord : '',
      });
      try {
        if (typeof onStageChange === 'function') onStageChange('filtering');
        if (typeof onStatusChange === 'function') onStatusChange('processing_asr_text');
        emitEvent('filtering_started', { text: originalText, rawText: originalText, chatName, domainTerms });
        correctedText = await this._resolveFilteredText({
          text: originalText,
          prompt,
          chatName,
          domainTerms,
        });
        emitEvent('filtering_finished', { text: correctedText, rawText: originalText, correctedText });
      } catch (error) {
        emitEvent('filtering_failed', { text: originalText, rawText: originalText, error: errorMessage(error) });
        throw error;
      } finally {
        if (typeof onStatusChange === 'function') onStatusChange('');
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
