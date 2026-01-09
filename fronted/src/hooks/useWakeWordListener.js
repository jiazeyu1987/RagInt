import { useEffect, useRef } from 'react';
import { detectWakeWord } from '../api/wakeWord';

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return SR;
}

export function useWakeWordListener({
  enabled,
  clientId,
  wakeWord,
  strictMode,
  cooldownMs,
  isBusy,
  recordOnce,
  askQuestion,
  submitText,
  maxRecordMs = 3500,
  onFeedback,
} = {}) {
  const recRef = useRef(null);
  const runningRef = useRef(false);
  const lastCheckAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return () => {};
    const SR = getSpeechRecognition();
    if (!SR) return () => {};
    if (!clientId) return () => {};
    if (typeof recordOnce !== 'function') return () => {};
    if (typeof askQuestion !== 'function') return () => {};

    let cancelled = false;
    let sr = recRef.current;
    if (!sr) {
      sr = new SR();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = 'zh-CN';
      recRef.current = sr;
    }

    const start = () => {
      if (cancelled) return;
      if (runningRef.current) return;
      try {
        sr.start();
        runningRef.current = true;
      } catch (_) {
        // ignore
      }
    };
    const stop = () => {
      try {
        sr.stop();
      } catch (_) {
        // ignore
      }
      runningRef.current = false;
    };

    sr.onerror = () => {
      if (cancelled) return;
      runningRef.current = false;
      setTimeout(() => start(), 800);
    };
    sr.onend = () => {
      if (cancelled) return;
      runningRef.current = false;
      setTimeout(() => start(), 300);
    };

    sr.onresult = async (event) => {
      if (cancelled) return;
      if (isBusy && isBusy()) return;
      const now = Date.now();
      if (now - lastCheckAtRef.current < 500) return;

      let text = '';
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (!r || !r[0]) continue;
          text += String(r[0].transcript || '');
        }
      } catch (_) {
        return;
      }
      text = String(text || '').trim();
      if (!text) return;

      const ww = String(wakeWord || '').trim();
      if (!ww) return;
      if (!text.includes(ww)) return;
      if (strictMode) {
        const idx = text.indexOf(ww);
        if (idx > 0) return; // only allow prefix match in strict mode
      }

      lastCheckAtRef.current = now;
      let detected = false;
      let cooldownLeft = 0;
      let reason = '';
      try {
        const res = await detectWakeWord({
          clientId,
          text,
          wakeWords: [ww],
          cooldownMs,
          matchMode: strictMode ? 'prefix' : 'contains',
        });
        detected = !!(res && res.detected);
        cooldownLeft = Number(res && res.cooldown_ms_remaining) || 0;
        reason = String((res && res.reason) || '');
      } catch (_) {
        detected = true; // local fallback
      }
      if (!detected) {
        if (cooldownLeft > 0 && typeof onFeedback === 'function') {
          try {
            onFeedback({ kind: 'wake_word', level: 'info', message: `Wake word cooldown: ${cooldownLeft}ms`, reason });
          } catch (_) {
            // ignore
          }
        }
        return;
      }

      stop();
      const q = await recordOnce({ maxRecordMs });
      if (cancelled) return;
      if (q) {
        if (typeof submitText === 'function') await submitText(q, { source: 'wake_word' });
        else await askQuestion(q, { source: 'wake_word' });
      }
      start();
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [askQuestion, clientId, cooldownMs, enabled, isBusy, maxRecordMs, onFeedback, recordOnce, strictMode, submitText, wakeWord]);
}
