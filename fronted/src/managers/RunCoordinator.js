import { RUN_REASON } from './RunReasons';

export class RunCoordinator {
  constructor(deps) {
    this.deps = deps || {};
  }

  setDeps(next) {
    this.deps = { ...(this.deps || {}), ...(next || {}) };
  }

  interrupt(reason) {
    const { interruptCurrentRun } = this.deps;
    if (typeof interruptCurrentRun !== 'function') return;
    interruptCurrentRun(reason || RUN_REASON.USER_STOP);
  }

  interruptManual() {
    this.interrupt(RUN_REASON.USER_STOP);
  }

  interruptEscape() {
    this.interrupt(RUN_REASON.ESCAPE);
  }

  async ask(text, opts) {
    const { askQuestion } = this.deps;
    if (typeof askQuestion !== 'function') return '';
    return askQuestion(text, opts);
  }

  prepareAsk(trigger) {
    const { ttsEnabledRef, audioContextRef, unlockAudio, beginDebugRun, setInputText } = this.deps;
    try {
      if (ttsEnabledRef && ttsEnabledRef.current) {
        if (audioContextRef && audioContextRef.current) {
          try {
            audioContextRef.current.close().catch(() => {});
          } catch (_) {
            // ignore
          }
          audioContextRef.current = null;
        }
        if (typeof unlockAudio === 'function') unlockAudio();
      }
    } catch (_) {
      // ignore
    }

    try {
      if (typeof beginDebugRun === 'function') beginDebugRun(trigger || 'unknown');
    } catch (_) {
      // ignore
    }

    try {
      if (typeof setInputText === 'function') setInputText('');
    } catch (_) {
      // ignore
    }
  }

  _isActiveRun() {
    const { getIsLoading, askAbortRef, currentAudioRef, ttsManagerRef } = this.deps;
    const loading = typeof getIsLoading === 'function' ? !!getIsLoading() : false;
    const busy = ttsManagerRef && ttsManagerRef.current ? !!ttsManagerRef.current.isBusy() : false;
    const asking = !!(askAbortRef && askAbortRef.current);
    const playing = !!(currentAudioRef && currentAudioRef.current);
    return loading || busy || asking || playing;
  }

  _queueSnapshot() {
    const { queueRef } = this.deps;
    const q = queueRef && Array.isArray(queueRef.current) ? queueRef.current : [];
    return q;
  }

  enqueueQuestion({ speaker, text, priority }) {
    const { queueRef, setQuestionQueue } = this.deps;
    if (!queueRef) return null;
    const item = {
      id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      speaker: String(speaker || '观众').trim() || '观众',
      text: String(text || '').trim(),
      priority: priority === 'high' ? 'high' : 'normal',
      ts: Date.now(),
    };
    if (!item.text) return null;
    const next = [...this._queueSnapshot(), item];
    queueRef.current = next;
    if (typeof setQuestionQueue === 'function') setQuestionQueue(next);
    return item;
  }

  removeQueuedQuestion(id) {
    const { queueRef, setQuestionQueue } = this.deps;
    if (!queueRef) return;
    const next = this._queueSnapshot().filter((q) => q && q.id !== id);
    queueRef.current = next;
    if (typeof setQuestionQueue === 'function') setQuestionQueue(next);
  }

  _pickNextQueuedQuestion() {
    const { lastSpeakerRef } = this.deps;
    const q = this._queueSnapshot();
    if (!q.length) return null;
    const highs = q.filter((x) => x && x.priority === 'high');
    const pool = highs.length ? highs : q;
    const last = String((lastSpeakerRef && lastSpeakerRef.current) || '');
    const diff = pool.find((x) => String(x.speaker || '') !== last) || pool[0];
    return diff || null;
  }

  async maybeStartNextQueuedQuestion() {
    const { groupModeRef, tourPipelineRef, ttsManagerRef, askAbortRef, lastSpeakerRef, beginDebugRun } = this.deps;
    if (!(groupModeRef && groupModeRef.current)) return;
    if (tourPipelineRef && tourPipelineRef.current && typeof tourPipelineRef.current.isActive === 'function') {
      if (tourPipelineRef.current.isActive()) return;
    }
    if (this._isActiveRun()) return;
    if (askAbortRef && askAbortRef.current) return;
    const ttsBusy = ttsManagerRef && ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false;
    if (ttsBusy) return;
    const next = this._pickNextQueuedQuestion();
    if (!next) return;
    this.removeQueuedQuestion(next.id);
    if (lastSpeakerRef) lastSpeakerRef.current = String(next.speaker || '');
    const prefixed = `【提问人：${String(next.speaker || '').trim() || '观众'}】${next.text}`;
    try {
      if (typeof beginDebugRun === 'function') beginDebugRun(next.priority === 'high' ? 'group_high' : 'group_next');
      await this.ask(prefixed, { fromQueue: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[QUEUE] auto ask failed', e);
    }
  }

  async answerQueuedNow(item) {
    const { lastSpeakerRef, beginDebugRun } = this.deps;
    if (!item || !item.id) return;
    try {
      this.removeQueuedQuestion(item.id);
      if (lastSpeakerRef) lastSpeakerRef.current = String(item.speaker || '');
      const prefixed = `【提问人：${String(item.speaker || '').trim() || '观众'}】${String(item.text || '').trim()}`;
      if (this._isActiveRun()) this.interrupt(RUN_REASON.QUEUE_TAKEOVER);
      if (typeof beginDebugRun === 'function') beginDebugRun(item.priority === 'high' ? 'group_high' : 'group_takeover');
      await this.ask(prefixed, { fromQueue: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[QUEUE] takeover failed', e);
    }
  }

  async submitUserText({
    text,
    trigger,
    groupMode,
    speakerName,
    priority,
    useAgentMode,
    selectedAgentId,
  } = {}) {
    const q = String(text || '').trim();
    if (!q) return { ok: false, kind: 'empty' };
    if (useAgentMode && !selectedAgentId) return { ok: false, kind: 'missing_agent' };

    // Voice tour commands (next/prev/jump/restart/...) take precedence when guide is enabled.
    try {
      const { guideEnabledRef, clientIdRef, getTourStops, parseTourCommand, setQueueStatus } = this.deps || {};
      const guideOn = !!(guideEnabledRef && guideEnabledRef.current);
      if (guideOn && typeof parseTourCommand === 'function') {
        const stops = typeof getTourStops === 'function' ? getTourStops() : [];
        const res = await parseTourCommand({
          clientId: clientIdRef ? clientIdRef.current : '',
          text: q,
          stops: Array.isArray(stops) ? stops : [],
        });
        if (res && res.intent === 'tour_command' && res.action && Number(res.confidence || 0) >= 0.75) {
          const action = String(res.action || '').trim();
          const stopIndex = Number.isFinite(res.stop_index) ? Number(res.stop_index) : null;
          if (action === 'pause') this.interrupt(RUN_REASON.USER_STOP);
          else if (action === 'resume') await this.continueTour();
          else if (action === 'next') await this.nextTourStop();
          else if (action === 'prev') await this.prevTourStop();
          else if (action === 'start') await this.startTour();
          else if (action === 'restart') {
            this.resetTour();
            await this.startTour();
          } else if (action === 'jump' && stopIndex != null) await this.jumpTourStop(stopIndex);
          if (typeof setQueueStatus === 'function') {
            const msg = action === 'jump' && stopIndex != null ? `语音指令：跳到第${stopIndex + 1}站` : `语音指令：${action}`;
            setQueueStatus(msg);
          }
          return { ok: true, kind: 'tour_command', action };
        }
      }
    } catch (_) {
      // ignore parse failures; fall back to normal ask
    }

    if (groupMode) {
      const active = this._isActiveRun();
      const item = this.enqueueQuestion({ speaker: speakerName, text: q, priority });
      if (item && item.priority === 'high' && active) {
        this.interrupt(RUN_REASON.HIGH_PRIORITY);
        this.removeQueuedQuestion(item.id);
        const { lastSpeakerRef } = this.deps;
        if (lastSpeakerRef) lastSpeakerRef.current = String(item.speaker || '');
        this.prepareAsk('group_takeover');
        await this.ask(`【提问人：${String(item.speaker || '').trim() || '观众'}】${item.text}`, { fromQueue: true });
        return { ok: true, kind: 'group_takeover' };
      }
      if (!active) {
        await this.maybeStartNextQueuedQuestion();
      }
      return { ok: true, kind: 'group_enqueued' };
    }

    this.prepareAsk(trigger || 'text');
    await this.ask(q);
    return { ok: true, kind: 'asked' };
  }

  _tour() {
    const { getTourController } = this.deps;
    return typeof getTourController === 'function' ? getTourController() : null;
  }

  async startTour() {
    const c = this._tour();
    if (c && typeof c.start === 'function') return c.start();
  }

  async continueTour() {
    const c = this._tour();
    if (c && typeof c.continue === 'function') return c.continue();
  }

  async prevTourStop() {
    const c = this._tour();
    if (c && typeof c.prevStop === 'function') return c.prevStop();
  }

  async nextTourStop() {
    const c = this._tour();
    if (c && typeof c.nextStop === 'function') return c.nextStop();
  }

  async jumpTourStop(idx) {
    const c = this._tour();
    if (c && typeof c.jumpTo === 'function') return c.jumpTo(idx);
  }

  resetTour() {
    const c = this._tour();
    if (c && typeof c.reset === 'function') return c.reset();
  }
}
