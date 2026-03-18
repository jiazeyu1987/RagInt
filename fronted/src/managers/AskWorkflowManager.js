import { tourStateOnInterrupt, tourStateOnReady, tourStateOnTourAction, tourStateOnUserQuestion } from './TourStateMachine';
import { RUN_REASON } from './RunReasons';
import { classifyInterrupt } from './RunPolicies';

const MAX_CONTEXT_TURNS = 200;
const CONTEXT_MARKER_MEMORY = '[CONTEXT_MEMORY]';
const CONTEXT_MARKER_SUMMARY = '[CONTEXT_SUMMARY]';
const CONTEXT_MARKER_RECENT = '[RECENT_TURNS]';
const CONTEXT_MARKER_CURRENT = '[CURRENT_QUESTION]';

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function shortenLine(value, maxLen = 120) {
  const text = safeTrim(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function estimateTokensByChars(text) {
  const chars = safeTrim(text).length;
  if (!chars) return 0;
  return Math.ceil(chars / 4);
}

function normalizeContextStrategy(value) {
  const strategy = safeTrim(value).toLowerCase();
  return strategy === 'full' ? 'full' : 'smart_recent_current';
}

function sanitizeTurns(turns) {
  const src = Array.isArray(turns) ? turns : [];
  const out = [];
  for (const item of src) {
    if (!item || typeof item !== 'object') continue;
    const q = safeTrim(item.question);
    const a = safeTrim(item.answer);
    if (!q || !a) continue;
    out.push({
      question: q,
      answer: a,
      ts: Number(item.ts) || Date.now(),
    });
  }
  return out.slice(-MAX_CONTEXT_TURNS);
}

function formatFullTurns(turns) {
  return turns
    .map((item, idx) => `T${idx + 1} Q: ${item.question}\nT${idx + 1} A: ${item.answer}`)
    .join('\n');
}

function formatSummary(turns) {
  return turns
    .map((item, idx) => `T${idx + 1}: Q=${shortenLine(item.question, 70)} | A=${shortenLine(item.answer, 90)}`)
    .join('\n');
}

function formatRecent(turns, startIndex) {
  return turns
    .map((item, idx) => {
      const turnNo = startIndex + idx + 1;
      return `T${turnNo} Q: ${item.question}\nT${turnNo} A: ${item.answer}`;
    })
    .join('\n');
}

export class AskWorkflowManager {
  constructor(deps) {
    this.deps = deps || {};
  }

  setDeps(next) {
    this.deps = { ...(this.deps || {}), ...(next || {}) };
  }

  _stopCurrentAudio() {
    const { currentAudioRef } = this.deps;
    if (!currentAudioRef || !currentAudioRef.current) return;
    try {
      if (typeof currentAudioRef.current.stop === 'function') {
        currentAudioRef.current.stop();
      } else if (typeof currentAudioRef.current.pause === 'function') {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      }
    } catch (_) {
      // ignore
    } finally {
      currentAudioRef.current = null;
    }
  }

  _getConversationTurnsRef() {
    const { voiceConversationTurnsRef } = this.deps || {};
    if (!voiceConversationTurnsRef || typeof voiceConversationTurnsRef !== 'object') return null;
    if (!Array.isArray(voiceConversationTurnsRef.current)) voiceConversationTurnsRef.current = [];
    return voiceConversationTurnsRef;
  }

  _readConversationTurns() {
    const ref = this._getConversationTurnsRef();
    if (!ref) return [];
    return sanitizeTurns(ref.current);
  }

  _appendConversationTurn(question, answer) {
    const q = safeTrim(question);
    const a = safeTrim(answer);
    if (!q || !a) return;
    const ref = this._getConversationTurnsRef();
    if (!ref) return;
    const next = sanitizeTurns([...(Array.isArray(ref.current) ? ref.current : []), { question: q, answer: a, ts: Date.now() }]);
    ref.current = next.slice(-MAX_CONTEXT_TURNS);
  }

  _buildQuestionWithContext(question, options = {}) {
    const baseQuestion = safeTrim(question);
    if (!baseQuestion) return baseQuestion;
    const opts = options && typeof options === 'object' ? options : {};
    if (opts.tourAction) return baseQuestion;

    const strategyRef = this.deps && this.deps.voiceConversationContextStrategyRef;
    const recentRef = this.deps && this.deps.voiceConversationContextRecentTurnsRef;
    const maxTokensRef = this.deps && this.deps.voiceConversationContextMaxTokensRef;
    const strategy = normalizeContextStrategy(strategyRef && strategyRef.current);
    const recentTurns = clampInt(recentRef && recentRef.current, 10, 1, 20);
    const maxTokens = clampInt(maxTokensRef && maxTokensRef.current, 16000, 2000, 64000);

    const allTurns = this._readConversationTurns();
    if (!allTurns.length) return baseQuestion;

    if (strategy === 'full') {
      const contextBlock = formatFullTurns(allTurns);
      if (!safeTrim(contextBlock)) return baseQuestion;
      return [
        baseQuestion,
        '',
        CONTEXT_MARKER_MEMORY,
        contextBlock,
        '',
        CONTEXT_MARKER_CURRENT,
        baseQuestion,
      ].join('\n');
    }

    let recent = allTurns.slice(-recentTurns);
    const older = allTurns.slice(0, Math.max(0, allTurns.length - recent.length));
    let summary = formatSummary(older);
    let recentText = formatRecent(recent, Math.max(0, allTurns.length - recent.length));

    let draft = [
      baseQuestion,
      '',
      CONTEXT_MARKER_SUMMARY,
      summary || 'none',
      '',
      CONTEXT_MARKER_RECENT,
      recentText || 'none',
      '',
      CONTEXT_MARKER_CURRENT,
      baseQuestion,
    ].join('\n');

    while (estimateTokensByChars(draft) > maxTokens && summary) {
      const lines = summary.split('\n');
      lines.shift();
      summary = lines.join('\n');
      draft = [
        baseQuestion,
        '',
        CONTEXT_MARKER_SUMMARY,
        summary || 'none',
        '',
        CONTEXT_MARKER_RECENT,
        recentText || 'none',
        '',
        CONTEXT_MARKER_CURRENT,
        baseQuestion,
      ].join('\n');
    }

    while (estimateTokensByChars(draft) > maxTokens && recent.length > 1) {
      recent = recent.slice(1);
      recentText = formatRecent(recent, Math.max(0, allTurns.length - recent.length));
      draft = [
        baseQuestion,
        '',
        CONTEXT_MARKER_SUMMARY,
        summary || 'none',
        '',
        CONTEXT_MARKER_RECENT,
        recentText || 'none',
        '',
        CONTEXT_MARKER_CURRENT,
        baseQuestion,
      ].join('\n');
    }

    return draft;
  }

  interrupt(reason) {
    const {
      tourPipelineRef,
      tourStateRef,
      tourResumeRef,
      playTourRecordingEnabledRef,
      selectedTourRecordingIdRef,
      interruptManagerRef,
      activeAskRequestIdRef,
      cancelBackendRequest,
      askAbortRef,
      currentAudioRef,
      receivedSegmentsRef,
      ttsManagerRef,
      setQueueStatus,
      setIsLoading,
      setTourState,
      clientIdRef,
    } = this.deps;
    const emitClientEvent = typeof this.deps.emitClientEvent === 'function' ? this.deps.emitClientEvent : null;
    const policy = classifyInterrupt(reason);
    const interruptReason = policy.reason;

    // Invalidate any late enqueue across async callbacks (prefetch / playback fetch / SSE segment).
    try {
      if (interruptManagerRef && interruptManagerRef.current) interruptManagerRef.current.bump(interruptReason);
    } catch (_) {
      // ignore
    }

    // Capture remaining tour TTS segments for a smoother "continue" after manual interrupt.
    try {
      const cur = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
      const stopIndex =
        cur && Number.isFinite(cur.stopIndex) && Number(cur.stopIndex) >= 0 ? Number(cur.stopIndex) : null;
      const isUserQuestion = !!(cur && String(cur.lastAction || '') === 'user_question');
      const isPlaybackTour =
        !!(playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef && String(selectedTourRecordingIdRef.current || '').trim());

      if (policy.captureResume && stopIndex != null && tourResumeRef && tourResumeRef.current && ttsManagerRef && ttsManagerRef.current) {
        const mgr = ttsManagerRef.current;
        if (isPlaybackTour && typeof mgr.capturePendingAudioByStopIndex === 'function') {
          const pending = mgr.capturePendingAudioByStopIndex(stopIndex);
          if (pending && pending.length) {
            if (isUserQuestion) {
              tourResumeRef.current._question = { kind: 'question', stopIndex, audioSegments: pending, capturedAtMs: Date.now() };
              tourResumeRef.current._latestResumeKind = 'question';
            } else {
              tourResumeRef.current[stopIndex] = { kind: 'stop', stopIndex, audioSegments: pending, capturedAtMs: Date.now() };
              tourResumeRef.current._latestResumeKind = 'stop';
            }
            tourResumeRef.current._latestStopIndex = stopIndex;
          }
        } else if (typeof mgr.capturePendingTextByStopIndex === 'function') {
          const pending = mgr.capturePendingTextByStopIndex(stopIndex);
          if (pending && pending.length) {
            if (isUserQuestion) {
              tourResumeRef.current._question = { kind: 'question', stopIndex, segments: pending, capturedAtMs: Date.now() };
              tourResumeRef.current._latestResumeKind = 'question';
            } else {
              tourResumeRef.current[stopIndex] = { kind: 'stop', stopIndex, segments: pending, capturedAtMs: Date.now() };
              tourResumeRef.current._latestResumeKind = 'stop';
            }
            tourResumeRef.current._latestStopIndex = stopIndex;
          }
        }
      }
    } catch (_) {
      // ignore
    }

    // Unified interrupt policy for continuous tour pipeline.
    try {
      const pipeline = tourPipelineRef && tourPipelineRef.current ? tourPipelineRef.current : null;
      if (pipeline) {
        if (policy.kind === 'pause') {
          if (typeof pipeline.pause === 'function') pipeline.pause(interruptReason || 'pause');
          else if (typeof pipeline.abortPrefetch === 'function') pipeline.abortPrefetch(interruptReason || 'pause');
          else if (typeof pipeline.interrupt === 'function') pipeline.interrupt(interruptReason || 'pause');
        } else if (typeof pipeline.interrupt === 'function') {
          pipeline.interrupt(interruptReason || 'interrupt');
        } else if (typeof pipeline.abortPrefetch === 'function') {
          pipeline.abortPrefetch(interruptReason || 'interrupt');
        }
      }
    } catch (_) {
      // ignore
    }

    try {
      if (activeAskRequestIdRef && activeAskRequestIdRef.current && typeof cancelBackendRequest === 'function') {
        cancelBackendRequest(activeAskRequestIdRef.current, interruptReason || 'interrupt');
        if (emitClientEvent) {
          try {
            emitClientEvent({
              requestId: activeAskRequestIdRef.current,
              clientId: clientIdRef ? clientIdRef.current : '',
              kind: 'nav',
              name: 'nav_cancelled',
              fields: { reason: interruptReason },
            });
          } catch (_) {
            // ignore
          }
        }
      }
    } catch (_) {
      // ignore
    }

    try {
      if (askAbortRef && askAbortRef.current) askAbortRef.current.abort();
    } catch (_) {
      // ignore
    } finally {
      if (askAbortRef) askAbortRef.current = null;
    }

    // Stop audio playback / in-flight audio fetch.
    this._stopCurrentAudio();
    if (currentAudioRef) currentAudioRef.current = null;

    if (receivedSegmentsRef) receivedSegmentsRef.current = false;
    try {
      if (ttsManagerRef && ttsManagerRef.current) {
        ttsManagerRef.current.stop(reason || 'interrupt');
      }
    } catch (_) {
      // ignore
    }

    try {
      if (typeof setQueueStatus === 'function') setQueueStatus('');
      if (typeof setIsLoading === 'function') setIsLoading(false);
    } catch (_) {
      // ignore
    }

    try {
      if (typeof setTourState === 'function') {
        setTourState((prev) => tourStateOnInterrupt(prev));
      }
    } catch (_) {
      // ignore
    }

    // eslint-disable-next-line no-console
    console.log('[INTERRUPT]', reason || 'manual');
  }

  async ask(text, opts) {
    const {
      getIsLoading,
      requestSeqRef,
      interruptManagerRef,
      askAbortRef,
      currentAudioRef,
      ttsManagerRef,
      ttsEnabledRef,
      debugRef,
      beginDebugRun,
      debugMark,
      setLastQuestion,
      setAnswer,
      setAnswerCacheMeta,
      setQaCacheDebug,
      setIsLoading,
      receivedSegmentsRef,
      getTtsManager,
      abortPrefetch,
      setTourState,
      tourStateRef,
      tourResumeRef,
      getTourStopName,
      startStatusMonitor,
      setQueueStatus,
      clientIdRef,
      activeAskRequestIdRef,
      baseUrl,
      guideDurationRef,
      guideStyleRef,
      guideEnabledRef,
      audienceProfileRef,
      qaAnswerTargetCharsRef,
      qaAudioCacheConfidenceThresholdRef,
      qaAudioCacheLookupEnabledRef,
      tourStopDurationsRef,
      tourStopTargetCharsRef,
      useAgentModeRef,
      selectedChatRef,
      selectedAgentIdRef,
      setCurrentIntent,
      getTourPipeline,
      getHistorySort,
      fetchHistory,
      maybeStartNextQueuedQuestion,
      runCoordinatorRef,
      getTourStops,
      tourRecordingEnabledRef,
      playTourRecordingEnabledRef,
      selectedTourRecordingIdRef,
      activeTourRecordingIdRef,
      finishTourRecordingArchive,
      globalPromptPrefixRef,
    } = this.deps;

    const options = opts && typeof opts === 'object' ? opts : {};
    const userQuestion = safeTrim(text);
    const questionForRequest = this._buildQuestionWithContext(userQuestion, options);
    const interruptMgr = interruptManagerRef && interruptManagerRef.current ? interruptManagerRef.current : null;

    // Interrupt any previous in-flight /api/ask stream.
    const hasActiveRun =
      !!(askAbortRef && askAbortRef.current) ||
      (typeof getIsLoading === 'function' ? !!getIsLoading() : false) ||
      !!(currentAudioRef && currentAudioRef.current) ||
      (ttsManagerRef && ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
    if (hasActiveRun) this.interrupt(RUN_REASON.NEW_QUESTION);
    try {
      if (askAbortRef && askAbortRef.current) askAbortRef.current.abort();
    } catch (_) {
      // ignore
    }

    // Snapshot epoch *after* we potentially bumped it via interrupt(new_question),
    // so this ask run isn't immediately considered stale.
    const epoch = interruptMgr ? interruptMgr.snapshot() : 0;
    const allow = () => (interruptMgr ? interruptMgr.isCurrent(epoch) : true);
    if (!allow()) return '';

    const runId = requestSeqRef ? ++requestSeqRef.current : Date.now();
    const requestId = `ask_${runId}_${Date.now()}`;
    if (activeAskRequestIdRef) activeAskRequestIdRef.current = requestId;
    try {
      if (debugRef && debugRef.current) {
        debugRef.current.requestId = requestId;
        if (typeof this.deps.debugRefresh === 'function') this.deps.debugRefresh();
      }
    } catch (_) {
      // ignore
    }

    const abortController = new AbortController();
    if (askAbortRef) askAbortRef.current = abortController;

    if (debugRef && !debugRef.current && typeof beginDebugRun === 'function') beginDebugRun('unknown');
    if (typeof setLastQuestion === 'function') setLastQuestion(userQuestion || text);
    if (typeof setAnswer === 'function') setAnswer('');
    if (typeof setAnswerCacheMeta === 'function') setAnswerCacheMeta({ hit: false, type: '' });
    if (typeof setQaCacheDebug === 'function') setQaCacheDebug(null);
    if (typeof setIsLoading === 'function') setIsLoading(true);

    // 清空所有队列/状态（用于“打断”或新问题覆盖旧问题）
    if (receivedSegmentsRef) receivedSegmentsRef.current = false;
    const ttsMgr = typeof getTtsManager === 'function' ? getTtsManager() : null;
    if (ttsMgr) ttsMgr.resetForRun({ requestId });
    const ttsProfile =
      ttsMgr && typeof ttsMgr.getTtsProfile === 'function'
        ? ttsMgr.getTtsProfile()
        : { provider: '', voice: '', speed: 1.0 };
    const askTtsProvider = String((ttsProfile && ttsProfile.provider) || '').trim();
    const askTtsVoice = String((ttsProfile && ttsProfile.voice) || '').trim();
    const askTtsSpeed = Number.isFinite(Number(ttsProfile && ttsProfile.speed)) ? Number(ttsProfile.speed) : 1.0;
    try {
      if (typeof abortPrefetch === 'function') abortPrefetch('ask_start');
    } catch (_) {
      // ignore
    }

    if (typeof setTourState === 'function') {
      if (options.tourAction) {
        const action = String(options.tourAction || '').trim();
        const stopIndex = Number.isFinite(options.tourStopIndex)
          ? options.tourStopIndex
          : tourStateRef && tourStateRef.current
            ? tourStateRef.current.stopIndex
            : 0;
        const stopName = typeof getTourStopName === 'function' ? getTourStopName(stopIndex) : '';
        setTourState((prev) =>
          tourStateOnTourAction(prev, { action, stopIndex: Number.isFinite(stopIndex) ? stopIndex : 0, stopName })
        );
        try {
          if (tourResumeRef && tourResumeRef.current && Number.isFinite(stopIndex) && Number(stopIndex) >= 0) {
            delete tourResumeRef.current[Number(stopIndex)];
            if (Number(tourResumeRef.current._latestStopIndex) === Number(stopIndex)) delete tourResumeRef.current._latestStopIndex;
            if (tourResumeRef.current._question && Number(tourResumeRef.current._question.stopIndex) === Number(stopIndex)) {
              delete tourResumeRef.current._question;
            }
          }
        } catch (_) {
          // ignore
        }
        // eslint-disable-next-line no-console
        console.log('[TOUR]', `action=${action}`, `stopIndex=${stopIndex}`, stopName ? `stop=${stopName}` : '');
      } else {
        setTourState((prev) => tourStateOnUserQuestion(prev));
      }
    }

    // 启动状态监控
    if (ttsEnabledRef && ttsEnabledRef.current) {
      try {
        if (typeof startStatusMonitor === 'function') startStatusMonitor(runId);
      } catch (_) {
        // ignore
      }
    } else {
      try {
        if (typeof setQueueStatus === 'function') setQueueStatus('');
      } catch (_) {
        // ignore
      }
    }

    // 停止当前播放的音频
    this._stopCurrentAudio();

    let fullAnswer = '';
    try {
      let guideDurationS = Math.max(1, Number((guideDurationRef && guideDurationRef.current) || 10) || 10);
      let guideTargetChars = Math.max(30, Math.round(guideDurationS * 4.5));
      let guideStopName = null;
      if (options.tourAction) {
        const idx = Number.isFinite(options.tourStopIndex)
          ? options.tourStopIndex
          : tourStateRef && tourStateRef.current
            ? tourStateRef.current.stopIndex
            : 0;
        guideStopName = (typeof getTourStopName === 'function' ? getTourStopName(idx) : '') || null;
        const durs = (tourStopDurationsRef && tourStopDurationsRef.current) || [];
        const tcs = (tourStopTargetCharsRef && tourStopTargetCharsRef.current) || [];
        const d = Number.isFinite(Number(durs[idx])) ? Number(durs[idx]) : 0;
        const tc = Number.isFinite(Number(tcs[idx])) ? Number(tcs[idx]) : 0;
        if (d > 0) guideDurationS = Math.max(1, Math.min(600, d));
        if (tc > 0) guideTargetChars = Math.max(30, tc);
        if (tc <= 0 && d > 0) guideTargetChars = Math.max(30, Math.round(guideDurationS * 4.5));
      }
      if (Number.isFinite(Number(options.guideDurationSOverride)) && Number(options.guideDurationSOverride) > 0) {
        guideDurationS = Math.max(1, Math.min(600, Number(options.guideDurationSOverride)));
      }
      if (Number.isFinite(Number(options.guideTargetCharsOverride)) && Number(options.guideTargetCharsOverride) > 0) {
        guideTargetChars = Math.max(30, Number(options.guideTargetCharsOverride));
      }
      let qaAnswerTargetChars = 1;
      try {
        qaAnswerTargetChars = Number(qaAnswerTargetCharsRef && qaAnswerTargetCharsRef.current);
      } catch (_) {
        qaAnswerTargetChars = 1;
      }
      if (!Number.isFinite(qaAnswerTargetChars) || qaAnswerTargetChars <= 0) qaAnswerTargetChars = 1;
      qaAnswerTargetChars = Math.max(1, Math.min(5000, Math.round(qaAnswerTargetChars)));
      let qaAudioCacheConfidenceThreshold = null;
      try {
        const n = Number(qaAudioCacheConfidenceThresholdRef && qaAudioCacheConfidenceThresholdRef.current);
        if (Number.isFinite(n)) qaAudioCacheConfidenceThreshold = Math.max(0, Math.min(1, n));
      } catch (_) {
        qaAudioCacheConfidenceThreshold = null;
      }
      let qaAudioCacheLookupEnabled = true;
      try {
        qaAudioCacheLookupEnabled = !!(qaAudioCacheLookupEnabledRef ? qaAudioCacheLookupEnabledRef.current : true);
      } catch (_) {
        qaAudioCacheLookupEnabled = true;
      }

      const base = String(baseUrl || '').replace(/\/+$/, '');
      const resolveAudioUrl = (rawUrl) => {
        const u = String(rawUrl || '').trim();
        if (!u) return '';
        const baseForResolve = base || (typeof window !== 'undefined' ? window.location.origin : '');
        try {
          return new URL(u, `${String(baseForResolve || '').replace(/\/+$/, '')}/`).toString();
        } catch (_) {
          return u;
        }
      };
      const emitClientEvent = typeof this.deps.emitClientEvent === 'function' ? this.deps.emitClientEvent : null;
      const consumePendingAsrClientEvents =
        typeof this.deps.consumePendingAsrClientEvents === 'function' ? this.deps.consumePendingAsrClientEvents : null;
      const tourAction = options.tourAction ? String(options.tourAction || '').trim() : '';
      if (tourAction) qaAudioCacheLookupEnabled = false;
      const stopIndex = options.tourAction
        ? (Number.isFinite(options.tourStopIndex)
          ? Number(options.tourStopIndex)
          : tourStateRef && tourStateRef.current
            ? Number(tourStateRef.current.stopIndex)
            : 0)
        : null;
      const actionType = tourAction
        ? (tourAction === 'next' || tourAction === 'prev' || tourAction === 'jump' ? '切站' : '讲解')
        : '问答';

      const playbackRecordingId =
        options.tourAction && playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef
          ? String(selectedTourRecordingIdRef.current || '').trim()
          : '';
      const isPlaybackTour = !!(options.tourAction && playbackRecordingId && Number.isFinite(stopIndex));

      const recordingIdForThisAsk =
        options.tourAction &&
        !isPlaybackTour &&
        Number.isFinite(stopIndex) &&
        tourRecordingEnabledRef &&
        tourRecordingEnabledRef.current &&
        activeTourRecordingIdRef
          ? String(activeTourRecordingIdRef.current || '').trim()
          : '';

      try {
        if (ttsMgr && typeof ttsMgr.setRecordingId === 'function') ttsMgr.setRecordingId(recordingIdForThisAsk, 'ask_recording_ctx');
      } catch (_) {
        // ignore
      }

      // SD-6 navigation events (this repo currently has no real chassis adapter; mark as skipped).
      if (emitClientEvent && tourAction && Number.isFinite(stopIndex)) {
        try {
          emitClientEvent({
            requestId,
            kind: 'nav',
            name: 'nav_start',
            fields: { stop_index: stopIndex, stop_id: `stop_${stopIndex}`, tour_action: tourAction, mode: 'skipped' },
          });
          emitClientEvent({
            requestId,
            kind: 'nav',
            name: 'nav_arrived',
            fields: { stop_index: stopIndex, stop_id: `stop_${stopIndex}`, tour_action: tourAction, mode: 'skipped' },
          });
        } catch (_) {
          // ignore
        }
      }

      if (emitClientEvent && consumePendingAsrClientEvents) {
        try {
          const bufferedAsrEvents = consumePendingAsrClientEvents();
          for (const evt of bufferedAsrEvents || []) {
            const fields = evt && evt.fields && typeof evt.fields === 'object' ? evt.fields : {};
            const eventName = String((evt && evt.name) || '').trim();
            if (!eventName) continue;
            emitClientEvent({
              requestId,
              kind: 'voice',
              name: `asr_${eventName}`,
              fields,
            });
          }
        } catch (_) {
          // ignore
        }
      }

      const playbackMode =
        !!(playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef && String(selectedTourRecordingIdRef.current || '').trim());
      const playbackStopIndex =
        playbackMode && tourStateRef && tourStateRef.current && Number.isFinite(tourStateRef.current.stopIndex)
          ? Number(tourStateRef.current.stopIndex)
          : null;
      const ttsStopIndexForAsk = options.tourAction
        ? (Number.isFinite(options.tourStopIndex) ? Number(options.tourStopIndex) : null)
        : playbackStopIndex;
      const prefetchNextContinuousStop = () => {
        if (!options.tourAction || !options.continuousRoot || typeof getTourPipeline !== 'function') return;
        try {
          const pipeline = getTourPipeline();
          if (!pipeline || typeof pipeline.maybePrefetchNextStop !== 'function') return;
          const curStopIndex = Number.isFinite(options.tourStopIndex)
            ? Number(options.tourStopIndex)
            : tourStateRef && tourStateRef.current
              ? Number(tourStateRef.current.stopIndex)
              : 0;
          const tail = String(fullAnswer || '').trim().slice(-80);
          pipeline.maybePrefetchNextStop({
            currentStopIndex: curStopIndex,
            tail,
            enqueueSegment: (s, meta) => {
              if (!allow()) return;
              if (ttsMgr && typeof ttsMgr.enqueueText === 'function') ttsMgr.enqueueText(s, meta);
            },
            ensureTtsRunning: () => {
              if (!allow()) return;
              if (ttsEnabledRef && ttsEnabledRef.current && ttsMgr && typeof ttsMgr.ensureRunning === 'function') ttsMgr.ensureRunning();
            },
          });
        } catch (_) {
          // ignore
        }
      };

      if (isPlaybackTour) {
        try {
          if (ttsMgr && typeof ttsMgr.setRecordingId === 'function') ttsMgr.setRecordingId('', 'recording_playback');
        } catch (_) {
          // ignore
        }

        const recUrl = `${base}/api/recordings/${encodeURIComponent(playbackRecordingId)}/stop/${encodeURIComponent(String(stopIndex))}`;
        const recResp = await fetch(recUrl, { method: 'GET', signal: abortController.signal });
        if (!allow()) return '';
        if (!recResp.ok) throw new Error(`recording_stop_http_${recResp.status}`);
        const recData = await recResp.json();
        if (!allow()) return '';

        const chunks = Array.isArray(recData && recData.chunks) ? recData.chunks : [];
        const segments = Array.isArray(recData && recData.segments) ? recData.segments : [];

        for (const c of chunks) {
          if (!allow()) break;
          if (options.tourAction && !allow()) break;
          const s = String(c || '');
          if (!s) continue;
          if (typeof debugMark === 'function' && !fullAnswer) debugMark('ragflowFirstChunkAt');
          fullAnswer += s;
          if (typeof setAnswer === 'function') setAnswer(fullAnswer);
        }

        for (const item of segments) {
          if (!allow()) break;
          if (options.tourAction && !allow()) break;
          const audioUrl = resolveAudioUrl(item && item.audio_url ? String(item.audio_url || '').trim() : '');
          const segText = item && item.text ? String(item.text || '') : '';
          if (!audioUrl || !ttsMgr || typeof ttsMgr.enqueueAudioUrl !== 'function') continue;
          if (typeof debugMark === 'function') debugMark('ragflowFirstSegmentAt');
          if (!options.tourAction || allow()) ttsMgr.enqueueAudioUrl(audioUrl, { stopIndex: Number(stopIndex), text: segText });
          if (receivedSegmentsRef) receivedSegmentsRef.current = true;
          if (!options.tourAction || allow()) ttsMgr.ensureRunning();
        }

        if (typeof debugMark === 'function') debugMark('ragflowDoneAt');
        if (ttsMgr) ttsMgr.markRagDone();

        if (options.tourAction && options.continuousRoot && typeof getTourPipeline === 'function' && ttsMgr) {
          try {
            const curStopIndex = Number.isFinite(stopIndex) ? stopIndex : 0;
            const pipeline = getTourPipeline();
            if (pipeline && typeof pipeline.maybePrefetchNextStopFromRecording === 'function') {
              pipeline.maybePrefetchNextStopFromRecording({
                recordingId: playbackRecordingId,
                currentStopIndex: curStopIndex,
                enqueueAudioSegment: (u, meta) => {
                  if (!allow()) return;
                  ttsMgr.enqueueAudioUrl(u, meta);
                },
                ensureTtsRunning: () => {
                  if (!allow()) return;
                  ttsMgr.ensureRunning();
                },
              });
            }
          } catch (_) {
            // ignore
          }
        }

        if (!ttsEnabledRef || !ttsEnabledRef.current) {
          if (allow() && typeof setIsLoading === 'function') setIsLoading(false);
          return fullAnswer;
        }

        if (ttsMgr) {
          ttsMgr.ensureRunning();
          await ttsMgr.waitForIdle();
        }
        if (!allow()) return '';
        if (allow()) {
          if (typeof setIsLoading === 'function') setIsLoading(false);
          if (typeof debugMark === 'function') debugMark('ttsAllDoneAt');
        }
        return fullAnswer;
      }

      const response = await fetch(`${base}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientIdRef ? clientIdRef.current : '',
          ...(recordingIdForThisAsk ? { 'X-Recording-ID': recordingIdForThisAsk } : {}),
        },
        body: JSON.stringify({
          question: questionForRequest || userQuestion || text,
          request_id: requestId,
          client_id: clientIdRef ? clientIdRef.current : '',
          recording_id: recordingIdForThisAsk || null,
          tts_provider: askTtsProvider || null,
          tts_voice: askTtsVoice || null,
          tts_speed: askTtsSpeed,
          qa_answer_target_chars: qaAnswerTargetChars,
          qa_audio_cache_confidence_threshold: qaAudioCacheConfidenceThreshold,
          qa_audio_cache_lookup_enabled: qaAudioCacheLookupEnabled,
          conversation_name: useAgentModeRef && useAgentModeRef.current ? null : selectedChatRef ? selectedChatRef.current : null,
          agent_id: useAgentModeRef && useAgentModeRef.current ? (selectedAgentIdRef ? (selectedAgentIdRef.current || null) : null) : null,
          guide: {
            enabled: guideEnabledRef ? !!guideEnabledRef.current : false,
            duration_s: guideDurationS,
            target_chars: guideTargetChars,
            stop_name: guideStopName,
            stop_index: Number.isFinite(stopIndex) ? stopIndex : null,
            tour_action: tourAction || null,
            action_type: actionType,
            continuous: !!options.continuous,
            audience_profile: String((audienceProfileRef && audienceProfileRef.current) || ''),
            style: String((guideStyleRef && guideStyleRef.current) || 'friendly'),
            prompt_prefix: String((globalPromptPrefixRef && globalPromptPrefixRef.current) || ''),
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`RAGFlow HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let sawDone = false;
      let hasAudioHit = false;

      while (true) {
        if (!allow()) {
          try {
            abortController.abort();
          } catch (_) {
            // ignore
          }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data && data.cache && data.cache.hit && typeof setAnswerCacheMeta === 'function') {
              const cacheType = String((data.cache && data.cache.type) || '').trim();
              setAnswerCacheMeta({ hit: true, type: cacheType || 'qa_text' });
              if (typeof setQaCacheDebug === 'function') {
                setQaCacheDebug((prev) => ({
                  ...(prev && typeof prev === 'object' ? prev : {}),
                  hit: true,
                  reason: String(((prev && prev.reason) || 'cache_hit')),
                  type: cacheType || 'qa_text',
                }));
              }
            }
            if (data && data.meta && typeof data.meta === 'object') {
              const cacheDebug = data.meta.qa_audio_cache_debug;
              if (cacheDebug && typeof cacheDebug === 'object') {
                if (typeof setQaCacheDebug === 'function') {
                  const normalizedDebug = { ...cacheDebug };
                  if (!Number.isFinite(Number(normalizedDebug.pair_id)) && Number.isFinite(Number(normalizedDebug.candidate_id))) {
                    normalizedDebug.pair_id = Number(normalizedDebug.candidate_id);
                  }
                  if (
                    !Number.isFinite(Number(normalizedDebug.confidence)) &&
                    Number.isFinite(Number(normalizedDebug.classifier_confidence))
                  ) {
                    normalizedDebug.confidence = Number(normalizedDebug.classifier_confidence);
                  }
                  setQaCacheDebug(normalizedDebug);
                }
                // eslint-disable-next-line no-console
                console.log('[QA_AUDIO_CACHE_DEBUG]', cacheDebug);
                if (Object.prototype.hasOwnProperty.call(cacheDebug, 'classifier_raw')) {
                  // eslint-disable-next-line no-console
                  console.log('[QA_AUDIO_CACHE_DEBUG_RAW]', String(cacheDebug.classifier_raw || ''));
                  if (Object.prototype.hasOwnProperty.call(cacheDebug, 'classifier_raw_head')) {
                    // eslint-disable-next-line no-console
                    console.log('[QA_AUDIO_CACHE_DEBUG_RAW_HEAD]', String(cacheDebug.classifier_raw_head || ''));
                  }
                  if (Object.prototype.hasOwnProperty.call(cacheDebug, 'classifier_raw_tail')) {
                    // eslint-disable-next-line no-console
                    console.log('[QA_AUDIO_CACHE_DEBUG_RAW_TAIL]', String(cacheDebug.classifier_raw_tail || ''));
                  }
                  try {
                    if (typeof window !== 'undefined') {
                      window.__qaAudioClassifierRaw = String(cacheDebug.classifier_raw || '');
                      window.__qaAudioClassifierRawHead = String(cacheDebug.classifier_raw_head || '');
                      window.__qaAudioClassifierRawTail = String(cacheDebug.classifier_raw_tail || '');
                    }
                  } catch (_) {
                    // ignore
                  }
                }
              }
              const intent = data.meta.intent ? String(data.meta.intent) : '';
              const conf = data.meta.intent_confidence != null ? Number(data.meta.intent_confidence) : null;
              if (intent && typeof setCurrentIntent === 'function') setCurrentIntent({ intent, confidence: conf });
            }

            if (data.chunk && !data.done) {
              if (debugRef && !debugRef.current && typeof beginDebugRun === 'function') beginDebugRun('unknown');
              if (typeof debugMark === 'function') debugMark('ragflowFirstChunkAt');
              fullAnswer += data.chunk;
              if (typeof setAnswer === 'function') setAnswer(fullAnswer);
            }

            if (data.segment && !data.done) {
              const seg = String(data.segment).trim();
              if (seg && ttsEnabledRef && ttsEnabledRef.current && ttsMgr) {
                if (!options.tourAction || allow()) {
                  ttsMgr.enqueueText(seg, { stopIndex: ttsStopIndexForAsk, source: 'ask' });
                }
                if (typeof debugMark === 'function') debugMark('ragflowFirstSegmentAt');
                if (receivedSegmentsRef) receivedSegmentsRef.current = true;
                // eslint-disable-next-line no-console
                console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                if (!options.tourAction || allow()) ttsMgr.ensureRunning();
              }
            }

            if (data && data.audio_hit && !data.done) {
              if (typeof setAnswerCacheMeta === 'function') setAnswerCacheMeta({ hit: true, type: 'qa_audio' });
              const hit = data.audio_hit && typeof data.audio_hit === 'object' ? data.audio_hit : null;
              const audioUrl = resolveAudioUrl(hit && hit.audio_url ? String(hit.audio_url).trim() : '');
              const hitText = hit && hit.answer_text ? String(hit.answer_text) : '';
              const hitPairId = Number.isFinite(Number(hit && hit.pair_id)) ? Number(hit.pair_id) : null;
              const hitConfidence = Number.isFinite(Number(hit && hit.confidence)) ? Number(hit.confidence) : null;
              if (typeof setQaCacheDebug === 'function') {
                setQaCacheDebug({
                  hit: true,
                  type: 'qa_audio',
                  reason: String((hit && hit.reason) || 'qa_audio_hit'),
                  pair_id: hitPairId,
                  candidate_id: hitPairId,
                  confidence: hitConfidence,
                  classifier_confidence: hitConfidence,
                  recall_score: Number.isFinite(Number(hit && hit.recall_score)) ? Number(hit.recall_score) : null,
                });
              }
              if (audioUrl && ttsEnabledRef && ttsEnabledRef.current && ttsMgr && typeof ttsMgr.enqueueAudioUrl === 'function') {
                // eslint-disable-next-line no-console
                console.log('[QA_AUDIO_CACHE_PLAY_URL]', audioUrl);
                if (!options.tourAction || allow()) {
                  ttsMgr.enqueueAudioUrl(audioUrl, {
                    stopIndex: ttsStopIndexForAsk,
                    text: hitText,
                    source: 'qa_audio_hit',
                  });
                }
                hasAudioHit = true;
                if (receivedSegmentsRef) receivedSegmentsRef.current = true;
                if (!options.tourAction || allow()) ttsMgr.ensureRunning();
              }
            }

            if (data.done) {
              sawDone = true;
              if (typeof debugMark === 'function') debugMark('ragflowDoneAt');
              if (
                ttsEnabledRef &&
                ttsEnabledRef.current &&
                !hasAudioHit &&
                receivedSegmentsRef &&
                !receivedSegmentsRef.current &&
                ttsMgr &&
                !ttsMgr.hasAnySegment() &&
                fullAnswer.trim()
              ) {
                if (!options.tourAction || allow()) {
                  ttsMgr.enqueueText(fullAnswer.trim(), { stopIndex: ttsStopIndexForAsk, source: 'ask_done' });
                }
                // eslint-disable-next-line no-console
                console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
              }
              if (ttsMgr) ttsMgr.markRagDone();

              // Prefetch next stop text (continuous tour pipeline) without waiting for current TTS.
              prefetchNextContinuousStop();

              if (!ttsEnabledRef || !ttsEnabledRef.current) {
                if (allow() && typeof setIsLoading === 'function') setIsLoading(false);
                return fullAnswer;
              }
              // eslint-disable-next-line no-console
              console.log('📚 RAGFlow响应完成，等待TTS处理完毕');
              if (ttsMgr) {
                ttsMgr.ensureRunning();
                await ttsMgr.waitForIdle();
              }
              if (!allow()) return '';
              if (allow()) {
                if (typeof setIsLoading === 'function') setIsLoading(false);
                if (typeof debugMark === 'function') debugMark('ttsAllDoneAt');
              }

              // Auto-finish a recording archive when the last stop finishes playing.
              try {
                if (recordingIdForThisAsk && options.tourAction && typeof getTourStops === 'function' && typeof finishTourRecordingArchive === 'function') {
                  const stops = getTourStops() || [];
                  const n = Array.isArray(stops) ? stops.length : 0;
                  const curStopIndex = Number.isFinite(options.tourStopIndex)
                    ? Number(options.tourStopIndex)
                    : tourStateRef && tourStateRef.current
                      ? Number(tourStateRef.current.stopIndex)
                      : 0;
                  if (n && curStopIndex >= 0 && curStopIndex === n - 1) {
                    await finishTourRecordingArchive(recordingIdForThisAsk);
                    if (activeTourRecordingIdRef) activeTourRecordingIdRef.current = '';
                  }
                }
              } catch (_) {
                // ignore
              }
              return fullAnswer;
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error parsing chunk:', err);
          }
        }
      }

      // Stream ended without explicit `done` event (e.g. client/server disconnect). Finalize to avoid UI getting stuck.
      if (allow() && !sawDone) {
        try {
          if (ttsMgr) {
            if (ttsEnabledRef && ttsEnabledRef.current) {
              try {
                if (receivedSegmentsRef && !receivedSegmentsRef.current && !hasAudioHit && !ttsMgr.hasAnySegment() && fullAnswer.trim()) {
                  ttsMgr.enqueueText(fullAnswer.trim(), {
                    stopIndex: ttsStopIndexForAsk,
                    source: 'ask_eof',
                  });
                  receivedSegmentsRef.current = true;
                }
              } catch (_) {
                // ignore
              }

              try {
                ttsMgr.markRagDone();
                prefetchNextContinuousStop();
                ttsMgr.ensureRunning();
                await ttsMgr.waitForIdle();
              } catch (_) {
                // ignore
              }
            } else {
              try {
                ttsMgr.markRagDone();
              } catch (_) {
                // ignore
              }
            }
          }
        } catch (_) {
          // ignore
        }
        if (allow()) {
          try {
            if (typeof setIsLoading === 'function') setIsLoading(false);
          } catch (_) {
            // ignore
          }
          try {
            if (typeof debugMark === 'function') debugMark('ttsAllDoneAt');
          } catch (_) {
            // ignore
          }
        }
      }

      return fullAnswer;
    } catch (err) {
      if (abortController.signal.aborted || String(err && err.name) === 'AbortError') {
        return '';
      }
      // eslint-disable-next-line no-console
      console.error('Error asking question:', err);
      if (allow() && typeof setIsLoading === 'function') setIsLoading(false);
    } finally {
      const isActiveRun = !!(activeAskRequestIdRef && activeAskRequestIdRef.current === requestId);
      const isAbortRun = !!(abortController && abortController.signal && abortController.signal.aborted);

      if (askAbortRef && askAbortRef.current === abortController) {
        askAbortRef.current = null;
      }
      if (activeAskRequestIdRef && activeAskRequestIdRef.current === requestId) {
        activeAskRequestIdRef.current = null;
      }

      // Ensure UI doesn't get stuck in loading state if the stream is aborted/disconnected
      // without a clean `done` event (common when an interrupt happens during long RAG latency).
      try {
        if (isActiveRun && isAbortRun && typeof setIsLoading === 'function') setIsLoading(false);
      } catch (_) {
        // ignore
      }

      try {
        if (allow() && typeof setTourState === 'function') {
          const tail = String(fullAnswer || '').trim().slice(-80);
          setTourState((prev) => tourStateOnReady(prev, { fullAnswerTail: tail }));
        }
      } catch (_) {
        // ignore
      }

      try {
        if (allow() && !options.tourAction && !isAbortRun) {
          const normalizedAnswer = safeTrim(fullAnswer);
          if (userQuestion && normalizedAnswer) this._appendConversationTurn(userQuestion, normalizedAnswer);
        }
      } catch (_) {
        // ignore
      }

      // refresh history list after a run finishes (best-effort)
      try {
        if (allow() && typeof fetchHistory === 'function') {
          const sortMode = typeof getHistorySort === 'function' ? getHistorySort() : undefined;
          fetchHistory(sortMode);
        }
      } catch (_) {
        // ignore
      }

      try {
        if (!allow()) return;
        const rc = runCoordinatorRef && runCoordinatorRef.current ? runCoordinatorRef.current : null;
        const nextFn =
          rc && typeof rc.maybeStartNextQueuedQuestion === 'function'
            ? () => rc.maybeStartNextQueuedQuestion()
            : maybeStartNextQueuedQuestion;
        if (typeof nextFn === 'function') {
          setTimeout(() => {
            try {
              nextFn();
            } catch (_) {
              // ignore
            }
          }, 0);
        }
      } catch (_) {
        // ignore
      }
    }

    return fullAnswer;
  }
}
