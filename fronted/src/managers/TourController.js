// Tour controller extracted from App.js.
// Responsibilities:
// - Start/continue/next/prev/jump/reset actions
// - Tour plan fetch (/api/tour/plan)
// - AudioContext sample-rate safety for streaming TTS
// - Continuous tour kickoff via TourPipelineManager

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
    const { continuousTourRef, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
    this._ensurePreferredAudioContext();

    const plannedStops = await this._fetchTourPlan();
    const stopIndex = 0;

    if (continuousTourRef && continuousTourRef.current) {
      await this._runContinuousTour({ startIndex: stopIndex, firstAction: 'start', stopsOverride: plannedStops });
      return;
    }

    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('start', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_start');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'start', tourStopIndex: stopIndex });
  }

  async continue() {
    const { continuousTourRef, tourStateRef, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
    this._ensurePreferredAudioContext();

    const cur = tourStateRef ? tourStateRef.current : null;
    const stopIndex = Number.isFinite(cur && cur.stopIndex) && cur.stopIndex >= 0 ? cur.stopIndex : 0;

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
    const prompt = typeof buildTourPrompt === 'function' ? buildTourPrompt('next', stopIndex) : '';
    if (typeof beginDebugRun === 'function') beginDebugRun('guide_next');
    if (typeof askQuestion === 'function') await askQuestion(prompt, { tourAction: 'next', tourStopIndex: stopIndex });
  }

  async jumpTo(idx) {
    const { getTourStops, buildTourPrompt, beginDebugRun, askQuestion } = this.deps;
    const stops = typeof getTourStops === 'function' ? getTourStops() : [];
    const n = Array.isArray(stops) ? stops.length : 0;
    const stopIndex = n ? Math.max(0, Math.min(Number(idx) || 0, n - 1)) : Math.max(0, Number(idx) || 0);
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

