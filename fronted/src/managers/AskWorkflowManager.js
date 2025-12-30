import { tourStateOnInterrupt, tourStateOnReady, tourStateOnTourAction, tourStateOnUserQuestion } from './TourStateMachine';

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
    const interruptReason = String(reason || 'interrupt');

    // Invalidate any late enqueue across async callbacks (prefetch / playback fetch / SSE segment).
    try {
      if (interruptManagerRef && interruptManagerRef.current) interruptManagerRef.current.bump(interruptReason);
    } catch (_) {
      // ignore
    }

    // Capture remaining tour TTS segments for a smoother "continue" after manual interrupt.
    try {
      const r = String(reason || '');
      const isManual = r === 'user_stop' || r === 'escape';
      const cur = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
      const stopIndex =
        cur && Number.isFinite(cur.stopIndex) && Number(cur.stopIndex) >= 0 ? Number(cur.stopIndex) : null;
      const isPlaybackTour =
        !!(playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef && String(selectedTourRecordingIdRef.current || '').trim());

      if (isManual && stopIndex != null && tourResumeRef && tourResumeRef.current && ttsManagerRef && ttsManagerRef.current) {
        const mgr = ttsManagerRef.current;
        if (isPlaybackTour && typeof mgr.capturePendingAudioByStopIndex === 'function') {
          const pending = mgr.capturePendingAudioByStopIndex(stopIndex);
          if (pending && pending.length) {
            tourResumeRef.current[stopIndex] = { stopIndex, audioSegments: pending, capturedAtMs: Date.now() };
            tourResumeRef.current._latestStopIndex = stopIndex;
          }
        } else if (typeof mgr.capturePendingTextByStopIndex === 'function') {
          const pending = mgr.capturePendingTextByStopIndex(stopIndex);
          if (pending && pending.length) {
            tourResumeRef.current[stopIndex] = { stopIndex, segments: pending, capturedAtMs: Date.now() };
            tourResumeRef.current._latestStopIndex = stopIndex;
          }
        }
      }
    } catch (_) {
      // ignore
    }

    // For manual pause, pause continuous tour pipeline (keep cache) to prevent any late prefetch from enqueueing new audio.
    try {
      const pipeline = tourPipelineRef && tourPipelineRef.current ? tourPipelineRef.current : null;
      if (pipeline) {
        if (interruptReason === 'user_stop' || interruptReason === 'escape') {
          if (typeof pipeline.pause === 'function') pipeline.pause('manual_pause');
          else if (typeof pipeline.abortPrefetch === 'function') pipeline.abortPrefetch('manual_pause');
        } else {
          pipeline.interrupt('interrupt');
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
      getTourStops,
      tourRecordingEnabledRef,
      playTourRecordingEnabledRef,
      selectedTourRecordingIdRef,
      activeTourRecordingIdRef,
      finishTourRecordingArchive,
    } = this.deps;

    const options = opts && typeof opts === 'object' ? opts : {};
    const interruptMgr = interruptManagerRef && interruptManagerRef.current ? interruptManagerRef.current : null;
    const epoch = interruptMgr ? interruptMgr.snapshot() : 0;
    const allow = () => (interruptMgr ? interruptMgr.isCurrent(epoch) : true);

    // Interrupt any previous in-flight /api/ask stream.
    const hasActiveRun =
      !!(askAbortRef && askAbortRef.current) ||
      (typeof getIsLoading === 'function' ? !!getIsLoading() : false) ||
      !!(currentAudioRef && currentAudioRef.current) ||
      (ttsManagerRef && ttsManagerRef.current ? ttsManagerRef.current.isBusy() : false);
    if (hasActiveRun) this.interrupt('new_question');
    try {
      if (askAbortRef && askAbortRef.current) askAbortRef.current.abort();
    } catch (_) {
      // ignore
    }

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
    if (typeof setLastQuestion === 'function') setLastQuestion(text);
    if (typeof setAnswer === 'function') setAnswer('');
    if (typeof setIsLoading === 'function') setIsLoading(true);

    // 清空所有队列/状态（用于“打断”或新问题覆盖旧问题）
    if (receivedSegmentsRef) receivedSegmentsRef.current = false;
    const ttsMgr = typeof getTtsManager === 'function' ? getTtsManager() : null;
    if (ttsMgr) ttsMgr.resetForRun({ requestId });
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
      let guideDurationS = Math.max(15, Number((guideDurationRef && guideDurationRef.current) || 60) || 60);
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
        if (d > 0) guideDurationS = Math.max(15, Math.min(600, d));
        if (tc > 0) guideTargetChars = Math.max(30, tc);
        if (tc <= 0 && d > 0) guideTargetChars = Math.max(30, Math.round(guideDurationS * 4.5));
      }
      if (Number.isFinite(Number(options.guideDurationSOverride)) && Number(options.guideDurationSOverride) > 0) {
        guideDurationS = Math.max(15, Math.min(600, Number(options.guideDurationSOverride)));
      }
      if (Number.isFinite(Number(options.guideTargetCharsOverride)) && Number(options.guideTargetCharsOverride) > 0) {
        guideTargetChars = Math.max(30, Number(options.guideTargetCharsOverride));
      }

      const base = String(baseUrl || '').replace(/\/+$/, '');
      const emitClientEvent = typeof this.deps.emitClientEvent === 'function' ? this.deps.emitClientEvent : null;
      const tourAction = options.tourAction ? String(options.tourAction || '').trim() : '';
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

      if (isPlaybackTour) {
        try {
          if (ttsMgr && typeof ttsMgr.setRecordingId === 'function') ttsMgr.setRecordingId('', 'recording_playback');
        } catch (_) {
          // ignore
        }

        const recUrl = `${base}/api/recordings/${encodeURIComponent(playbackRecordingId)}/stop/${encodeURIComponent(String(stopIndex))}`;
        const recResp = await fetch(recUrl, { method: 'GET', signal: abortController.signal });
        if (!recResp.ok) throw new Error(`recording_stop_http_${recResp.status}`);
        const recData = await recResp.json();

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
          const audioUrl = item && item.audio_url ? String(item.audio_url || '').trim() : '';
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
          question: text,
          request_id: requestId,
          client_id: clientIdRef ? clientIdRef.current : '',
          recording_id: recordingIdForThisAsk || null,
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
            style: String((guideStyleRef && guideStyleRef.current) || 'friendly'),
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
            if (data && data.meta && typeof data.meta === 'object') {
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
                  ttsMgr.enqueueText(seg, { stopIndex: options.tourAction ? options.tourStopIndex : null, source: 'ask' });
                }
                if (typeof debugMark === 'function') debugMark('ragflowFirstSegmentAt');
                if (receivedSegmentsRef) receivedSegmentsRef.current = true;
                // eslint-disable-next-line no-console
                console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                if (!options.tourAction || allow()) ttsMgr.ensureRunning();
              }
            }

            if (data.done) {
              if (typeof debugMark === 'function') debugMark('ragflowDoneAt');
              if (ttsEnabledRef && ttsEnabledRef.current && receivedSegmentsRef && !receivedSegmentsRef.current && ttsMgr && !ttsMgr.hasAnySegment() && fullAnswer.trim()) {
                if (!options.tourAction || allow()) {
                  ttsMgr.enqueueText(fullAnswer.trim(), { stopIndex: options.tourAction ? options.tourStopIndex : null, source: 'ask_done' });
                }
                // eslint-disable-next-line no-console
                console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
              }
              if (ttsMgr) ttsMgr.markRagDone();

              // Prefetch next stop text (continuous tour pipeline) without waiting for current TTS.
              if (options.tourAction && options.continuousRoot && typeof getTourPipeline === 'function' && ttsMgr) {
                try {
                  const curStopIndex = Number.isFinite(options.tourStopIndex)
                    ? options.tourStopIndex
                    : tourStateRef && tourStateRef.current
                      ? tourStateRef.current.stopIndex
                      : 0;
                  const tail = String(fullAnswer || '').trim().slice(-80);
                  getTourPipeline().maybePrefetchNextStop({
                    currentStopIndex: curStopIndex,
                    tail,
                    enqueueSegment: (s, meta) => {
                      if (!allow()) return;
                      ttsMgr.enqueueText(s, meta);
                    },
                    ensureTtsRunning: () => {
                      if (!allow()) return;
                      if (ttsEnabledRef && ttsEnabledRef.current) ttsMgr.ensureRunning();
                    },
                  });
                } catch (_) {
                  // ignore
                }
              }

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

      return fullAnswer;
    } catch (err) {
      if (abortController.signal.aborted || String(err && err.name) === 'AbortError') {
        return '';
      }
      // eslint-disable-next-line no-console
      console.error('Error asking question:', err);
      if (allow() && typeof setIsLoading === 'function') setIsLoading(false);
    } finally {
      if (askAbortRef && askAbortRef.current === abortController) {
        askAbortRef.current = null;
      }
      if (activeAskRequestIdRef && activeAskRequestIdRef.current === requestId) {
        activeAskRequestIdRef.current = null;
      }
      try {
        if (allow() && typeof setTourState === 'function') {
          const tail = String(fullAnswer || '').trim().slice(-80);
          setTourState((prev) => tourStateOnReady(prev, { fullAnswerTail: tail }));
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
        if (allow() && typeof maybeStartNextQueuedQuestion === 'function') {
          setTimeout(() => {
            maybeStartNextQueuedQuestion();
          }, 0);
        }
      } catch (_) {
        // ignore
      }
    }

    return fullAnswer;
  }
}
