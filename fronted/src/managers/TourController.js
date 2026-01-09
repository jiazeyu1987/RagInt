// Tour controller extracted from App.js.
// Responsibilities:
// - Start/continue/next/prev/jump/reset actions
// - Tour plan fetch (/api/tour/plan)
// - AudioContext sample-rate safety for streaming TTS
// - Continuous tour kickoff via TourPipelineManager

import { tourStateOnReady, tourStateOnTourAction } from './TourStateMachine';
import { RUN_REASON } from './RunReasons';

export class TourController {
  constructor(deps) {
    this.deps = deps || {};
  }

  setDeps(next) {
    this.deps = { ...(this.deps || {}), ...(next || {}) };
  }

  _ensurePreferredAudioContext() {
    const { ttsEnabledRef, audioContextRef, preferredTtsSampleRate, unlockAudio } = this.deps;
    if (!ttsEnabledRef || !ttsEnabledRef.current) return;

    try {
      if (audioContextRef && audioContextRef.current && audioContextRef.current.sampleRate !== preferredTtsSampleRate) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch (_) {
          // ignore
        }
        audioContextRef.current = null;
      }
    } catch (_) {
      if (audioContextRef) audioContextRef.current = null;
    }

    try {
      if (typeof unlockAudio === 'function') unlockAudio();
    } catch (_) {
      // ignore
    }
  }

  _snapshotInterruptEpoch() {
    const { interruptManagerRef } = this.deps || {};
    const mgr = interruptManagerRef && interruptManagerRef.current ? interruptManagerRef.current : null;
    const epoch = mgr ? mgr.snapshot() : 0;
    const allow = () => (mgr ? mgr.isCurrent(epoch) : true);
    return { epoch, allow };
  }

  async _fetchTourPlan() {
    const {
      fetchJson,
      tourZoneRef,
      audienceProfileRef,
      guideDurationRef,
      tourMetaRef,
      tourStopsOverrideRef,
      setTourStops,
      setTourStopDurations,
      setTourStopTargetChars,
      tourStopDurationsRef,
      tourStopTargetCharsRef,
    } = this.deps;
    if (typeof fetchJson !== 'function') return null;

    let plannedStops = null;
    try {
      const meta = (tourMetaRef && tourMetaRef.current) || null;
      const zone = String((tourZoneRef && tourZoneRef.current) || (meta && meta.default_zone) || '默认路线');
      const profile = String((audienceProfileRef && audienceProfileRef.current) || (meta && meta.default_profile) || '大众');
      const duration = Number((guideDurationRef && guideDurationRef.current) || 60);
      const body = { zone, profile, duration_s: duration };
      const stopsOverride = tourStopsOverrideRef && Array.isArray(tourStopsOverrideRef.current) ? tourStopsOverrideRef.current : [];
      if (Array.isArray(stopsOverride) && stopsOverride.length) body.stops_override = stopsOverride;

      const data = await fetchJson('/api/tour/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const stops = Array.isArray(data && data.stops) ? data.stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
      if (stops.length && typeof setTourStops === 'function') setTourStops(stops);
      if (stops.length) plannedStops = stops;

      const durs = Array.isArray(data && data.stop_durations_s) ? data.stop_durations_s.map((x) => Number(x) || 0) : [];
      const tcs = Array.isArray(data && data.stop_target_chars) ? data.stop_target_chars.map((x) => Number(x) || 0) : [];

      if (stops.length && durs.length === stops.length) {
        if (typeof setTourStopDurations === 'function') setTourStopDurations(durs);
        if (tourStopDurationsRef) tourStopDurationsRef.current = durs;
      } else {
        if (typeof setTourStopDurations === 'function') setTourStopDurations([]);
        if (tourStopDurationsRef) tourStopDurationsRef.current = [];
      }

      if (stops.length && tcs.length === stops.length) {
        if (typeof setTourStopTargetChars === 'function') setTourStopTargetChars(tcs);
        if (tourStopTargetCharsRef) tourStopTargetCharsRef.current = tcs;
      } else {
        if (typeof setTourStopTargetChars === 'function') setTourStopTargetChars([]);
        if (tourStopTargetCharsRef) tourStopTargetCharsRef.current = [];
      }
    } catch (_) {
      return plannedStops;
    }

    return plannedStops;
  }

  async _runContinuousTour({ startIndex, firstAction, stopsOverride }) {
    const { beginDebugRun, getTourPipeline, askQuestion, getTourStops } = this.deps;
    const { allow } = this._snapshotInterruptEpoch();
    const stops =
      Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : typeof getTourStops === 'function' ? getTourStops() : [];
    if (!Array.isArray(stops) || !stops.length) {
      // eslint-disable-next-line no-console
      console.warn('[TOUR] continuous: no stops loaded');
      return;
    }
    if (!allow()) return;

    const action = String(firstAction || 'start');
    if (typeof beginDebugRun === 'function') beginDebugRun(action === 'continue' ? 'guide_continue' : 'guide_start');
    if (typeof getTourPipeline === 'function' && getTourPipeline() && typeof askQuestion === 'function') {
      await getTourPipeline().startContinuousTour({ startIndex, firstAction: action, askQuestion, stopsOverride: stops });
    }
  }

  async start() {
    const {
      continuousTourRef,
      buildTourPrompt,
      beginDebugRun,
      askQuestion,
      tourRecordingEnabledRef,
      playTourRecordingEnabledRef,
      selectedTourRecordingIdRef,
      startTourRecordingArchive,
      loadTourRecordingMeta,
      setTourStops,
      activeTourRecordingIdRef,
      interruptCurrentRun,
    } = this.deps;
    this._ensurePreferredAudioContext();
    try {
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun(RUN_REASON.TOUR_START);
    } catch (_) {
      // ignore
    }
    const { allow } = this._snapshotInterruptEpoch();

    try {
      const { tourResumeRef } = this.deps;
      if (tourResumeRef && tourResumeRef.current) tourResumeRef.current = {};
    } catch (_) {
      // ignore
    }

    let plannedStops = null;
    try {
      const playRid =
        playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef
          ? String(selectedTourRecordingIdRef.current || '').trim()
          : '';
      if (playRid && typeof loadTourRecordingMeta === 'function') {
        const meta = await loadTourRecordingMeta(playRid);
        const stops = meta && Array.isArray(meta.stops) ? meta.stops.map((s) => String(s || '').trim()).filter(Boolean) : [];
        if (stops.length) {
          plannedStops = stops;
          if (typeof setTourStops === 'function') setTourStops(stops);
        }
      } else {
        plannedStops = await this._fetchTourPlan();
      }
    } catch (_) {
      plannedStops = await this._fetchTourPlan();
    }
    if (!allow()) return;
    const stopIndex = 0;

    try {
      if ((!tourRecordingEnabledRef || !tourRecordingEnabledRef.current) && activeTourRecordingIdRef) activeTourRecordingIdRef.current = '';
      const playRid =
        playTourRecordingEnabledRef && playTourRecordingEnabledRef.current && selectedTourRecordingIdRef
          ? String(selectedTourRecordingIdRef.current || '').trim()
          : '';
      if (!playRid && tourRecordingEnabledRef && tourRecordingEnabledRef.current && typeof startTourRecordingArchive === 'function') {
        await startTourRecordingArchive(plannedStops || []);
      }
    } catch (_) {
      // ignore
    }
    if (!allow()) return;

    if (continuousTourRef && continuousTourRef.current) {
      await this._runContinuousTour({ startIndex: stopIndex, firstAction: 'start', stopsOverride: plannedStops });
      return;
    }

    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('start', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_start');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'start', tourStopIndex: stopIndex });
  }

  async _resumeFromInterrupt({ stopIndex, action, allow }) {
    const { tourResumeRef, getTtsManager, setTourState, getTourStopName, getTourPipeline, setAnswer } = this.deps;
    if (!tourResumeRef || !tourResumeRef.current) return false;
    const saved = tourResumeRef.current[stopIndex];
    if (typeof getTtsManager !== 'function') return false;
    if (typeof allow === 'function' && !allow()) return false;

    const ttsMgr = getTtsManager();
    if (!ttsMgr) return false;

    // Consume resume buffer to avoid replay loops.
    delete tourResumeRef.current[stopIndex];
    try {
      if (Number(tourResumeRef.current._latestStopIndex) === Number(stopIndex)) delete tourResumeRef.current._latestStopIndex;
    } catch (_) {
      // ignore
    }

    const hasAudioSegments = saved && Array.isArray(saved.audioSegments) && saved.audioSegments.length;
    const hasTextSegments = saved && Array.isArray(saved.segments) && saved.segments.length;
    if (!hasAudioSegments && !hasTextSegments) return false;

    // If we are resuming a tour stop, restore cached stop text so audio/text stay aligned.
    try {
      if (saved && saved.kind === 'stop' && typeof getTourPipeline === 'function' && typeof setAnswer === 'function') {
        const pipeline = getTourPipeline();
        const cached = pipeline && typeof pipeline.getPrefetch === 'function' ? pipeline.getPrefetch(stopIndex) : null;
        if (cached && cached.answerText) setAnswer(String(cached.answerText || ''));
      }
    } catch (_) {
      // ignore
    }

    const stopName = typeof getTourStopName === 'function' ? getTourStopName(Number(stopIndex)) : '';
    try {
      if (typeof setTourState === 'function') {
        setTourState((prev) => tourStateOnTourAction(prev, { action: action || 'continue', stopIndex, stopName }));
      }
    } catch (_) {
      // ignore
    }
    if (typeof allow === 'function' && !allow()) return true;

    const requestId = `tts_resume_${stopIndex}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
      if (typeof ttsMgr.resetForRun === 'function') ttsMgr.resetForRun({ requestId });
    } catch (_) {
      // ignore
    }
    if (typeof allow === 'function' && !allow()) return true;

    if (hasAudioSegments && typeof ttsMgr.enqueueAudioUrl === 'function') {
      for (const s of saved.audioSegments) {
        if (typeof allow === 'function' && !allow()) return true;
        try {
          const url = s && s.audio_url ? String(s.audio_url || '').trim() : '';
          if (!url) continue;
          const text = s && s.text ? String(s.text || '') : '';
          ttsMgr.enqueueAudioUrl(url, { stopIndex: Number(stopIndex), text });
        } catch (_) {
          // ignore
        }
      }
    } else if (hasTextSegments) {
      for (const s of saved.segments) {
        if (typeof allow === 'function' && !allow()) return true;
        try {
          if (typeof ttsMgr.enqueueText === 'function') ttsMgr.enqueueText(s, { stopIndex: Number(stopIndex) });
        } catch (_) {
          // ignore
        }
      }
    }
    try {
      if (typeof allow === 'function' && !allow()) return true;
      if (typeof ttsMgr.markRagDone === 'function') ttsMgr.markRagDone();
      if (typeof ttsMgr.ensureRunning === 'function') ttsMgr.ensureRunning();
    } catch (_) {
      // ignore
    }

    try {
      if (typeof allow === 'function' && !allow()) return true;
      if (typeof ttsMgr.waitForIdle === 'function') await ttsMgr.waitForIdle();
    } catch (_) {
      // ignore
    }
    if (typeof allow === 'function' && !allow()) return true;

    try {
      const last = hasTextSegments ? String(saved.segments[saved.segments.length - 1] || '').trim() : '';
      const tail = last ? last.slice(-80) : '';
      if (typeof setTourState === 'function') {
        setTourState((prev) => tourStateOnReady(prev, { fullAnswerTail: tail }));
      }
    } catch (_) {
      // ignore
    }

    return true;
  }

  async _resumeQuestionFromInterrupt({ allow }) {
    const { tourResumeRef, getTtsManager } = this.deps;
    if (!tourResumeRef || !tourResumeRef.current) return { resumed: false, stopIndex: null };
    const saved = tourResumeRef.current._question;
    if (!saved) return { resumed: false, stopIndex: null };

    const stopIndex = Number.isFinite(saved && saved.stopIndex) ? Number(saved.stopIndex) : null;

    // Consume to avoid replay loops.
    try {
      delete tourResumeRef.current._question;
      if (tourResumeRef.current._latestResumeKind === 'question') tourResumeRef.current._latestResumeKind = 'stop';
      if (Number.isFinite(stopIndex)) tourResumeRef.current._latestStopIndex = stopIndex;
    } catch (_) {
      // ignore
    }

    if (typeof getTtsManager !== 'function') return { resumed: false, stopIndex };
    if (typeof allow === 'function' && !allow()) return { resumed: true, stopIndex };
    const ttsMgr = getTtsManager();
    if (!ttsMgr) return { resumed: false, stopIndex };

    const hasAudioSegments = saved && Array.isArray(saved.audioSegments) && saved.audioSegments.length;
    const hasTextSegments = saved && Array.isArray(saved.segments) && saved.segments.length;
    if (!hasAudioSegments && !hasTextSegments) return { resumed: false, stopIndex };

    const requestId = `tts_resume_question_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
      if (typeof ttsMgr.resetForRun === 'function') ttsMgr.resetForRun({ requestId });
    } catch (_) {
      // ignore
    }

    try {
      if (hasAudioSegments && typeof ttsMgr.enqueueAudioUrl === 'function') {
        for (const s of saved.audioSegments) {
          if (typeof allow === 'function' && !allow()) return { resumed: true, stopIndex };
          const url = s && s.audio_url ? String(s.audio_url || '').trim() : '';
          if (!url) continue;
          const text = s && s.text ? String(s.text || '') : '';
          ttsMgr.enqueueAudioUrl(url, { stopIndex: Number.isFinite(stopIndex) ? Number(stopIndex) : null, text });
        }
      } else if (hasTextSegments) {
        for (const s of saved.segments) {
          if (typeof allow === 'function' && !allow()) return { resumed: true, stopIndex };
          if (typeof ttsMgr.enqueueText === 'function') ttsMgr.enqueueText(s, { stopIndex: Number.isFinite(stopIndex) ? Number(stopIndex) : null });
        }
      }
      if (typeof ttsMgr.markRagDone === 'function') ttsMgr.markRagDone();
      if (typeof ttsMgr.ensureRunning === 'function') ttsMgr.ensureRunning();
      if (typeof ttsMgr.waitForIdle === 'function') await ttsMgr.waitForIdle();
    } catch (_) {
      // ignore
    }

    return { resumed: true, stopIndex };
  }

  async continue() {
    const { continuousTourRef, tourStateRef, buildTourPrompt, beginDebugRun, askQuestion, getTourStops, tourResumeRef } = this.deps;
    this._ensurePreferredAudioContext();
    const { allow } = this._snapshotInterruptEpoch();

    const cur = tourStateRef ? tourStateRef.current : null;
    let stopIndex = Number.isFinite(cur && cur.stopIndex) && cur.stopIndex >= 0 ? cur.stopIndex : 0;
    try {
      const latest = tourResumeRef && tourResumeRef.current ? Number(tourResumeRef.current._latestStopIndex) : NaN;
      if (Number.isFinite(latest) && latest >= 0 && tourResumeRef && tourResumeRef.current && tourResumeRef.current[latest]) {
        stopIndex = latest;
      }
    } catch (_) {
      // ignore
    }

    // If user interrupted mid-playback, resume remaining segments first to avoid abrupt re-generation.
    try {
      const qRes = await this._resumeQuestionFromInterrupt({ allow });
      if (!allow()) return;
      if (qRes && qRes.resumed && Number.isFinite(qRes.stopIndex) && qRes.stopIndex >= 0) stopIndex = qRes.stopIndex;

      const resumed = await this._resumeFromInterrupt({ stopIndex, action: 'continue', allow });
      if (qRes.resumed || resumed) {
        if (!allow()) return;
        if (continuousTourRef && continuousTourRef.current) {
          // If prefetch worked, stopIndex will advance naturally as next-stop audio begins playing.
          // Fallback: if it didn't advance, restart continuous tour from next stop.
          const after = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
          const afterIndex =
            after && Number.isFinite(after.stopIndex) && Number(after.stopIndex) >= 0 ? Number(after.stopIndex) : stopIndex;
          // Only auto-advance when we actually resumed tour-stop content; a question resume should NOT skip the stop.
          if (resumed && afterIndex === stopIndex) {
            const stops = typeof getTourStops === 'function' ? getTourStops() : [];
            const n = Array.isArray(stops) ? stops.length : 0;
            const nextIndex = stopIndex + 1;
            if (n && nextIndex >= 0 && nextIndex < n) {
              if (!allow()) return;
              await this._runContinuousTour({ startIndex: nextIndex, firstAction: 'next' });
            }
          }
        }
        return;
      }
    } catch (_) {
      // ignore
    }
    if (!allow()) return;

    if (continuousTourRef && continuousTourRef.current) {
      await this._runContinuousTour({ startIndex: stopIndex, firstAction: 'continue' });
      return;
    }

    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('continue', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_continue');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'continue', tourStopIndex: stopIndex });
  }

  async prevStop() {
    const { tourStateRef, buildTourPrompt, beginDebugRun, askQuestion, interruptCurrentRun } = this.deps;
    try {
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun(RUN_REASON.TOUR_PREV);
    } catch (_) {
      // ignore
    }
    const cur = tourStateRef ? tourStateRef.current : null;
    const stopIndexRaw = Number.isFinite(cur && cur.stopIndex) ? cur.stopIndex - 1 : 0;
    const stopIndex = Math.max(0, stopIndexRaw);
    try {
      const { tourResumeRef } = this.deps;
      if (tourResumeRef && tourResumeRef.current) tourResumeRef.current = {};
    } catch (_) {
      // ignore
    }
    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('next', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_prev');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  }

  async nextStop() {
    const { tourStateRef, getTourStops, buildTourPrompt, beginDebugRun, askQuestion, interruptCurrentRun } = this.deps;
    try {
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun(RUN_REASON.TOUR_NEXT);
    } catch (_) {
      // ignore
    }
    const cur = tourStateRef ? tourStateRef.current : null;
    const stops = typeof getTourStops === 'function' ? getTourStops() : [];
    const n = Array.isArray(stops) ? stops.length : 0;
    const nextIndexRaw = Number.isFinite(cur && cur.stopIndex) ? cur.stopIndex + 1 : 0;
    const stopIndex = n ? Math.min(nextIndexRaw, n - 1) : Math.max(0, nextIndexRaw);
    try {
      const { tourResumeRef } = this.deps;
      if (tourResumeRef && tourResumeRef.current) tourResumeRef.current = {};
    } catch (_) {
      // ignore
    }
    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('next', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_next');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  }

  async jumpTo(idx) {
    const { getTourStops, buildTourPrompt, beginDebugRun, askQuestion, interruptCurrentRun } = this.deps;
    try {
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun(RUN_REASON.TOUR_JUMP);
    } catch (_) {
      // ignore
    }
    const stops = typeof getTourStops === 'function' ? getTourStops() : [];
    const n = Array.isArray(stops) ? stops.length : 0;
    const stopIndex = n ? Math.max(0, Math.min(Number(idx) || 0, n - 1)) : Math.max(0, Number(idx) || 0);
    try {
      const { tourResumeRef } = this.deps;
      if (tourResumeRef && tourResumeRef.current) tourResumeRef.current = {};
    } catch (_) {
      // ignore
    }
    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('next', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_jump');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  }

  reset() {
    const { interruptCurrentRun, setTourState } = this.deps;
    try {
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun(RUN_REASON.TOUR_RESET);
    } catch (_) {
      // ignore
    }

    try {
      if (typeof setTourState === 'function') {
        setTourState({
          mode: 'idle',
          stopIndex: -1,
          stopName: '',
          lastAnswerTail: '',
          lastAction: null,
        });
      }
    } catch (_) {
      // ignore
    }
  }
}

