// Tour controller extracted from App.js.
// Responsibilities:
// - Start/continue/next/prev/jump/reset actions
// - Tour plan fetch (/api/tour/plan)
// - AudioContext sample-rate safety for streaming TTS
// - Continuous tour kickoff via TourPipelineManager

import { tourStateOnReady, tourStateOnTourAction } from './TourStateMachine';

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

  async _fetchTourPlan() {
    const {
      fetchJson,
      tourZoneRef,
      audienceProfileRef,
      guideDurationRef,
      tourMetaRef,
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
      const data = await fetchJson('/api/tour/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone, profile, duration_s: duration }),
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
    const stops =
      Array.isArray(stopsOverride) && stopsOverride.length ? stopsOverride : typeof getTourStops === 'function' ? getTourStops() : [];
    if (!Array.isArray(stops) || !stops.length) {
      // eslint-disable-next-line no-console
      console.warn('[TOUR] continuous: no stops loaded');
      return;
    }

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
    } = this.deps;
    this._ensurePreferredAudioContext();

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

    if (continuousTourRef && continuousTourRef.current) {
      await this._runContinuousTour({ startIndex: stopIndex, firstAction: 'start', stopsOverride: plannedStops });
      return;
    }

    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('start', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_start');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'start', tourStopIndex: stopIndex });
  }

  async _resumeFromInterrupt({ stopIndex, action }) {
    const { tourResumeRef, getTtsManager, setTourState, getTourStopName, getTourPipeline, getTourStops, continuousTourRef } = this.deps;
    if (!tourResumeRef || !tourResumeRef.current) return false;
    const saved = tourResumeRef.current[stopIndex];
    if (!saved || !Array.isArray(saved.segments) || !saved.segments.length) return false;
    if (typeof getTtsManager !== 'function') return false;

    const ttsMgr = getTtsManager();
    if (!ttsMgr) return false;

    // Consume resume buffer to avoid replay loops.
    delete tourResumeRef.current[stopIndex];

    const stopName = typeof getTourStopName === 'function' ? getTourStopName(Number(stopIndex)) : '';
    try {
      if (typeof setTourState === 'function') {
        setTourState((prev) => tourStateOnTourAction(prev, { action: action || 'continue', stopIndex, stopName }));
      }
    } catch (_) {
      // ignore
    }

    const requestId = `tts_resume_${stopIndex}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
      if (typeof ttsMgr.resetForRun === 'function') ttsMgr.resetForRun({ requestId });
    } catch (_) {
      // ignore
    }

    for (const s of saved.segments) {
      try {
        if (typeof ttsMgr.enqueueText === 'function') ttsMgr.enqueueText(s, { stopIndex: Number(stopIndex) });
      } catch (_) {
        // ignore
      }
    }
    try {
      if (typeof ttsMgr.markRagDone === 'function') ttsMgr.markRagDone();
      if (typeof ttsMgr.ensureRunning === 'function') ttsMgr.ensureRunning();
    } catch (_) {
      // ignore
    }

    // Best-effort: if continuous tour is enabled, restore/trigger prefetch for next stop so "jump" stays instant (same as main flow).
    // Important: do this AFTER enqueueing the current-stop remaining segments, to keep playback order correct.
    try {
      if (continuousTourRef && continuousTourRef.current && typeof getTourPipeline === 'function') {
        const pipeline = getTourPipeline();
        const stops = typeof getTourStops === 'function' ? getTourStops() : [];
        const n = Array.isArray(stops) ? stops.length : 0;
        const nextIndex = Number(stopIndex) + 1;
        if (pipeline && n && nextIndex >= 0 && nextIndex < n) {
          const tail = String(saved.segments[saved.segments.length - 1] || '').trim().slice(-80);
          const enqueueSegment = (s, meta) => {
            try {
              if (typeof ttsMgr.enqueueText === 'function') ttsMgr.enqueueText(s, meta);
            } catch (_) {
              // ignore
            }
          };
          const ensureTtsRunning = () => {
            try {
              if (typeof ttsMgr.ensureRunning === 'function') ttsMgr.ensureRunning();
            } catch (_) {
              // ignore
            }
          };

          // If we already have cached prefetch, replay it into the TTS queue (interrupt clears the queue but not pipeline store).
          try {
            if (typeof pipeline.replayPrefetchToQueue === 'function') {
              pipeline.replayPrefetchToQueue({ stopIndex: nextIndex, enqueueSegment, ensureTtsRunning });
            }
          } catch (_) {
            // ignore
          }

          // If not cached, force a normal prefetch (same endpoint/stream format) while we are resuming current stop.
          try {
            if (typeof pipeline.prefetchStopTextToQueue === 'function') {
              pipeline.prefetchStopTextToQueue({
                stopIndex: nextIndex,
                tail,
                token: typeof pipeline.token === 'function' ? pipeline.token() : 0,
                enqueueSegment,
                ensureTtsRunning,
                force: true,
              });
            }
          } catch (_) {
            // ignore
          }
        }
      }
    } catch (_) {
      // ignore
    }

    try {
      if (typeof ttsMgr.waitForIdle === 'function') await ttsMgr.waitForIdle();
    } catch (_) {
      // ignore
    }

    try {
      const last = String(saved.segments[saved.segments.length - 1] || '').trim();
      const tail = last ? last.slice(-80) : '';
      if (typeof setTourState === 'function') {
        setTourState((prev) => tourStateOnReady(prev, { fullAnswerTail: tail }));
      }
    } catch (_) {
      // ignore
    }

    return true;
  }

  async continue() {
    const { continuousTourRef, tourStateRef, buildTourPrompt, beginDebugRun, askQuestion, getTourStops } = this.deps;
    this._ensurePreferredAudioContext();

    const cur = tourStateRef ? tourStateRef.current : null;
    const stopIndex = Number.isFinite(cur && cur.stopIndex) && cur.stopIndex >= 0 ? cur.stopIndex : 0;

    // If user interrupted mid-playback, resume remaining segments first to avoid abrupt re-generation.
    try {
      const resumed = await this._resumeFromInterrupt({ stopIndex, action: 'continue' });
      if (resumed) {
        if (continuousTourRef && continuousTourRef.current) {
          // If prefetch worked, stopIndex will advance naturally as next-stop audio begins playing.
          // Fallback: if it didn't advance, restart continuous tour from next stop.
          const after = tourStateRef && tourStateRef.current ? tourStateRef.current : null;
          const afterIndex =
            after && Number.isFinite(after.stopIndex) && Number(after.stopIndex) >= 0 ? Number(after.stopIndex) : stopIndex;
          if (afterIndex === stopIndex) {
            const stops = typeof getTourStops === 'function' ? getTourStops() : [];
            const n = Array.isArray(stops) ? stops.length : 0;
            const nextIndex = stopIndex + 1;
            if (n && nextIndex >= 0 && nextIndex < n) {
              await this._runContinuousTour({ startIndex: nextIndex, firstAction: 'next' });
            }
          }
        }
        return;
      }
    } catch (_) {
      // ignore
    }

    if (continuousTourRef && continuousTourRef.current) {
      await this._runContinuousTour({ startIndex: stopIndex, firstAction: 'continue' });
      return;
    }

    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('continue', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_continue');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'continue', tourStopIndex: stopIndex });
  }

  async prevStop() {
    const { tourStateRef, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
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
    const { tourStateRef, getTourStops, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
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
    const { getTourStops, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
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
      if (typeof interruptCurrentRun === 'function') interruptCurrentRun('tour_reset');
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

