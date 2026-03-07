function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function tokenize(text) {
  return safeTrim(text)
    .split(/\s+/)
    .map((part) => safeTrim(part))
    .filter(Boolean);
}

function joinParts(parts) {
  return parts.map((part) => safeTrim(part)).filter(Boolean).join(' ');
}

function longestCommonPrefixLength(a, b) {
  const left = safeTrim(a);
  const right = safeTrim(b);
  const max = Math.min(left.length, right.length);
  let idx = 0;
  while (idx < max && left[idx] === right[idx]) idx += 1;
  return idx;
}

function findSuffixPrefixOverlap(a, b) {
  const left = safeTrim(a);
  const right = safeTrim(b);
  if (!left || !right) return 0;
  const max = Math.min(left.length, right.length);
  for (let len = max; len >= 2; len -= 1) {
    if (left.slice(-len) === right.slice(0, len)) return len;
  }
  return 0;
}

function stripLeadingOverlap(previousText, nextText) {
  const prev = safeTrim(previousText);
  const next = safeTrim(nextText);
  if (!prev || !next) return next;
  const overlapLen = findSuffixPrefixOverlap(prev, next);
  if (overlapLen <= 0) return next;
  return safeTrim(next.slice(overlapLen));
}

function hasStrongPrefixRelation(a, b) {
  const left = safeTrim(a);
  const right = safeTrim(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  const prefixLen = longestCommonPrefixLength(left, right);
  const minLen = Math.min(left.length, right.length);
  return prefixLen > 0 && prefixLen >= Math.max(2, Math.floor(minLen * 0.6));
}

export class AsrTranscriptAssembler {
  constructor() {
    this.reset();
  }

  reset() {
    this._committedSegments = [];
    this._hypothesis = '';
  }

  _commitHypothesis() {
    const text = safeTrim(this._hypothesis);
    if (!text) return;
    const prev = safeTrim(this._committedSegments[this._committedSegments.length - 1]);
    if (prev === text) {
      this._hypothesis = '';
      return;
    }
    this._committedSegments.push(text);
    this._hypothesis = '';
  }

  applyPartial(text) {
    const next = safeTrim(text);
    if (!next) return this.getRecognizedText();
    const current = safeTrim(this._hypothesis);

    if (!current) {
      this._hypothesis = next;
      return this.getRecognizedText();
    }

    if (hasStrongPrefixRelation(current, next)) {
      this._hypothesis = next.length >= current.length ? next : current;
      return this.getRecognizedText();
    }

    this._commitHypothesis();
    this._hypothesis = stripLeadingOverlap(current, next) || next;
    return this.getRecognizedText();
  }

  applyFinal(text) {
    const next = safeTrim(text);
    if (!next) {
      this._commitHypothesis();
      return this.getRecognizedText();
    }

    const current = safeTrim(this._hypothesis);
    if (current) {
      if (hasStrongPrefixRelation(current, next)) {
        // Some providers occasionally send a shorter final than the latest
        // partial. Keep the longer one to avoid truncating long utterances.
        this._hypothesis = next.length >= current.length ? next : current;
        this._commitHypothesis();
        return this.getRecognizedText();
      }
      this._commitHypothesis();
      this._hypothesis = stripLeadingOverlap(current, next) || next;
      this._commitHypothesis();
      return this.getRecognizedText();
    }

    this._hypothesis = next;
    this._commitHypothesis();
    return this.getRecognizedText();
  }

  getRecognizedText() {
    return joinParts([...this._committedSegments, this._hypothesis]);
  }

  getCommittedText() {
    return joinParts(this._committedSegments);
  }

  getHypothesisText() {
    return safeTrim(this._hypothesis);
  }

  getCommittedSegments() {
    return [...this._committedSegments];
  }

  getTokenCount() {
    return tokenize(this.getRecognizedText()).length;
  }
}
