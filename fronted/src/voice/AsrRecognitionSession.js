import { AsrTranscriptAssembler } from './AsrTranscriptAssembler';

function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function joinParts(parts) {
  return parts.map((part) => safeTrim(part)).filter(Boolean).join(' ');
}

export class AsrRecognitionSession {
  constructor() {
    this._assembler = new AsrTranscriptAssembler();
    this.reset('');
  }

  reset(baseText = '') {
    this._baseText = safeTrim(baseText);
    this._lastAppliedInputText = this._baseText;
    this._lastRecognizedText = '';
    this._assembler.reset();
  }

  getBaseText() {
    return this._baseText;
  }

  getLastAppliedInputText() {
    return this._lastAppliedInputText;
  }

  getLastRecognizedText() {
    return this._lastRecognizedText;
  }

  getRecognizedText() {
    return this._assembler.getRecognizedText();
  }

  getCommittedText() {
    return this._assembler.getCommittedText();
  }

  getHypothesisText() {
    return this._assembler.getHypothesisText();
  }

  setLastAppliedInputText(value) {
    this._lastAppliedInputText = safeTrim(value);
  }

  composeInputText(recognizedText, currentInput = '') {
    const recognized = safeTrim(recognizedText);
    if (!recognized) return '';

    const base = this._baseText;
    const previousApplied = this._lastAppliedInputText;
    const current = safeTrim(currentInput);

    if (previousApplied && current && current.startsWith(previousApplied)) {
      const suffix = safeTrim(current.slice(previousApplied.length));
      return joinParts([base, recognized, suffix]);
    }

    if (current && current !== previousApplied) {
      return joinParts([current, recognized]);
    }

    return joinParts([base, recognized]);
  }

  applyPartial(text) {
    const sourceText = safeTrim(text);
    const assembledText = this._assembler.applyPartial(sourceText);
    this._lastRecognizedText = assembledText || sourceText;
    return {
      sourceText,
      assembledText,
      committedText: this._assembler.getCommittedText(),
      hypothesisText: this._assembler.getHypothesisText(),
    };
  }

  replaceRecognizedText(text) {
    const sourceText = safeTrim(text);
    this._assembler.reset();
    if (sourceText) this._assembler.applyFinal(sourceText);
    this._lastRecognizedText = sourceText;
    return {
      sourceText,
      assembledText: sourceText,
      committedText: this._assembler.getCommittedText(),
      hypothesisText: this._assembler.getHypothesisText(),
    };
  }

  applyFinal(text) {
    const sourceText = safeTrim(text);
    const assembledText = this._assembler.applyFinal(sourceText);
    this._lastRecognizedText = assembledText || sourceText;
    return {
      sourceText,
      assembledText,
      committedText: this._assembler.getCommittedText(),
      hypothesisText: this._assembler.getHypothesisText(),
    };
  }

  resolveTimeoutText(fallbackText = '') {
    return safeTrim(fallbackText) || safeTrim(this._assembler.getRecognizedText()) || this._lastRecognizedText;
  }
}
