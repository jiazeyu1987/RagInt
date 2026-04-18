// Runtime playback orchestration.
// Runtime orchestration: playback, mutations, offline sync, loading, and bootstrap.
function normalizeStationSegments(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  return (Array.isArray(data.segments) ? data.segments : [])
    .map((segment) => {
      const item = segment && typeof segment === "object" ? segment : {};
      const audioUrl = String(item.audio_url || "").trim();
      if (!audioUrl) return null;
      const durationMs = Number(item.duration_ms || 0);
      return {
        segmentId: Number(item.segment_id || 0),
        text: String(item.text || "").trim(),
        audioUrl: buildAbsoluteUrl(audioUrl),
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0,
        startMs: 0,
        endMs: 0,
        updatedAtMs: Number(item.updated_at_ms || 0),
      };
    })
    .filter(Boolean);
}

function stopStationTimelineSync() {}

function waitForAudioMetadata(audio) {
  return new Promise((resolve, reject) => {
    if (!audio) {
      reject(new Error("audio_element_missing"));
      return;
    }
    if (audio && audio.readyState >= 1) {
      resolve();
      return;
    }
    let settled = false;
    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("audio_metadata_unavailable"));
    };
    audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("audio_metadata_timeout"));
    }, 5000);
    try {
      if (typeof audio.load === "function") {
        audio.load();
      }
    } catch (_) {}
  });
}

function loadStationSegmentDurationMs(segment) {
  const item = segment && typeof segment === "object" ? segment : {};
  if (Number(item.durationMs || 0) > 0) {
    return Promise.resolve(Math.round(Number(item.durationMs)));
  }
  const cacheKey = String(item.audioUrl || "").trim();
  if (!cacheKey) {
    return Promise.reject(new Error("station_segment_audio_missing"));
  }
  if (Number(appContext.caches.stationSegmentDurationCache[cacheKey] || 0) > 0) {
    return Promise.resolve(Math.round(Number(appContext.caches.stationSegmentDurationCache[cacheKey])));
  }
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    let settled = false;
    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      probe.removeEventListener("loadedmetadata", handleLoaded);
      probe.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      if (settled) return;
      const seconds = Number(probe.duration || 0);
      const durationMs = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
      if (durationMs <= 0) {
        settled = true;
        cleanup();
        reject(new Error("station_segment_duration_missing"));
        return;
      }
      settled = true;
      appContext.caches.stationSegmentDurationCache[cacheKey] = durationMs;
      cleanup();
      resolve(durationMs);
    };
    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("station_segment_duration_missing"));
    };
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", handleLoaded, { once: true });
    probe.addEventListener("error", handleError, { once: true });
    probe.src = cacheKey;
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("station_segment_duration_timeout"));
    }, 5000);
    try {
      if (typeof probe.load === "function") {
        probe.load();
      }
    } catch (_) {}
  });
}

async function ensureNarrationStopDurationMs(recordingId, stopIndex, options) {
  const cacheKey = getNarrationStopDurationCacheKey(recordingId, stopIndex);
  if (!cacheKey) return 0;
  const opts = options && typeof options === "object" ? options : {};
  const cachedDurationMs = getCachedNarrationStopDurationMs(recordingId, stopIndex);
  if (!opts.force && cachedDurationMs > 0) {
    return cachedDurationMs;
  }
  if (!opts.force && appContext.caches.narrationStopDurationRequestMap[cacheKey]) {
    try {
      return await appContext.caches.narrationStopDurationRequestMap[cacheKey];
    } catch (_) {
      return 0;
    }
  }
  const requestPromise = (async () => {
    try {
      const payload = await fetchJson(
        '/api/recordings/' + encodeURIComponent(String(recordingId || '')) + '/stop/' + encodeURIComponent(String(stopIndex)),
        state.clientId
      );
      const baseQueue = normalizeStationSegments(payload);
      if (!baseQueue.length) return 0;
      const durations = await Promise.all(baseQueue.map((segment) => loadStationSegmentDurationMs(segment)));
      const totalDurationMs = durations.reduce((sum, durationMs) => sum + Math.max(0, Number(durationMs || 0)), 0);
      if (Number(totalDurationMs || 0) > 0) {
        appContext.caches.narrationStopDurationCache[cacheKey] = Math.round(Number(totalDurationMs));
        render();
      }
      return Number(appContext.caches.narrationStopDurationCache[cacheKey] || 0);
    } catch (_) {
      return 0;
    }
  })();
  appContext.caches.narrationStopDurationRequestMap[cacheKey] = requestPromise;
  try {
    return await requestPromise;
  } finally {
    if (appContext.caches.narrationStopDurationRequestMap[cacheKey] === requestPromise) {
      delete appContext.caches.narrationStopDurationRequestMap[cacheKey];
    }
  }
}

async function hydrateStationPlaybackQueue(queue, playbackSeq) {
  const baseQueue = Array.isArray(queue) ? queue : [];
  const durations = await Promise.all(baseQueue.map((segment) => loadStationSegmentDurationMs(segment)));
  if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return null;
  let offsetMs = 0;
  const hydratedQueue = baseQueue.map((segment, index) => {
    const durationMs = Math.round(Number(durations[index] || 0));
    const nextSegment = Object.assign({}, segment, {
      durationMs,
      startMs: offsetMs,
      endMs: offsetMs + durationMs,
    });
    offsetMs += durationMs;
    return nextSegment;
  });
  return {
    queue: hydratedQueue,
    totalDurationMs: offsetMs,
  };
}

function setStationPlaybackFailure(message) {
  stopStationTimelineSync();
  const nextMessage = String(message || '?????????????????????????');
  state.audioError = nextMessage;
  state.stationPlaybackError = nextMessage;
  state.audioBusy = false;
  state.stationPlaybackBusy = false;
  state.stationPlaybackState = "idle";
  state.stationPlaybackCursorMs = 0;
  state.stationPlaybackTotalDurationMs = 0;
  state.playingStationSlotKey = '';
  state.pendingStationSlotKey = '';
  state.stationPlaybackSlotKey = '';
  state.stationPlaybackStopName = '';
  state.stationPlaybackQueue = [];
  state.stationPlaybackNodes = [];
  state.stationPlaybackNodeIndex = -1;
  state.stationPlaybackNodeId = '';
  state.stationPlaybackMode = "idle";
  state.stationPlaybackRangeEndMs = null;
  state.stationPlaybackSegmentIndex = -1;
  state.stationPlaybackAnswerText = '';
  state.stationPlaybackTimelineEvents = [];
  state.stationPlaybackEndedHotspotIds = [];
  state.highlightedHotspotId = '';
  state.highlightedProductId = '';
  state.visibleHotspotIds = [];
  state.flashingHotspotIds = [];
  state.lastPlaybackRequestedUrl = '';
}

async function startStationSegment(slotKey, segmentIndex, playbackSeq, startAtMs) {
  if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
  const segment = getStationPlaybackQueueSegment(segmentIndex);
  if (!segment || !segment.audioUrl) {
    setStationPlaybackFailure("Current station archive audio is unavailable.");
    setStationPlaybackFailure("Current station archive audio is unavailable.");
    return;
  }
  const segmentStartMs = normalizeTimelineEventTimeMs(segment.startMs);
  const segmentEndMs = normalizeTimelineEventTimeMs(segment.endMs);
  const nextCursorMs = clampStationPlaybackCursorMs(
    startAtMs == null ? segmentStartMs : Math.max(segmentStartMs, Math.min(normalizeTimelineEventTimeMs(startAtMs), segmentEndMs))
  );
  const segmentLocalMs = Math.max(0, nextCursorMs - segmentStartMs);
  state.audioBusy = true;
  state.audioError = "";
  state.stationPlaybackBusy = true;
  state.stationPlaybackError = "";
  state.stationPlaybackState = "playing";
  state.pendingStationSlotKey = String(slotKey || "");
  state.playingStationSlotKey = "";
  state.stationPlaybackSlotKey = String(slotKey || "");
  state.stationPlaybackSegmentIndex = Number(segmentIndex);
  state.stationPlaybackCursorMs = nextCursorMs;
  state.lastPlaybackRequestedUrl = segment.audioUrl;
  applyStationTimelineHighlight(nextCursorMs);
  render();
  try {
    if (String(refs.audio.currentSrc || "").trim() !== String(segment.audioUrl || "").trim()) {
      refs.audio.src = segment.audioUrl;
    }
    if (segmentLocalMs > 0 || refs.audio.readyState < 1) {
      await waitForAudioMetadata(refs.audio);
    }
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    try {
      refs.audio.currentTime = segmentLocalMs / 1000;
    } catch (_) {}
    const playResult = refs.audio.play();
    if (playResult && typeof playResult.then === "function") {
      await playResult;
    }
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    state.audioBusy = false;
    state.stationPlaybackBusy = false;
    state.pendingStationSlotKey = "";
    state.playingStationSlotKey = String(slotKey || "");
    render();
  } catch (_) {
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
    setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
  }
}

async function buildNarrationPlaybackPlan(slotKey, nodes, playbackSeq) {
  const normalizedNodes = normalizeNarrationNodes(nodes);
  const groupStats = new Map();
  normalizedNodes.forEach((node) => {
    const groupKey = [String(node.recordingId || "").trim(), String(node.stopIndex)].join("::");
    const current = groupStats.get(groupKey) || { rawMaxEndMs: 0, nodeCount: 0 };
    current.rawMaxEndMs = Math.max(current.rawMaxEndMs, Number(node.highlightEndMs || 0));
    current.nodeCount += 1;
    groupStats.set(groupKey, current);
  });
  const planNodes = [];
  const planQueue = [];
  const stopPlanCache = new Map();
  let activeGroupKey = "";
  let activeGroup = null;
  let offsetMs = 0;
  for (const node of normalizedNodes) {
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return null;
    const groupKey = [String(node.recordingId || "").trim(), String(node.stopIndex)].join("::");
    let stopPlan = stopPlanCache.get(groupKey) || null;
    if (!stopPlan) {
      const payload = await fetchJson(
        '/api/recordings/' + encodeURIComponent(String(node.recordingId || '')) + '/stop/' + encodeURIComponent(String(node.stopIndex)),
        state.clientId
      );
      if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return null;
      const baseQueue = normalizeStationSegments(payload);
      if (!baseQueue.length) {
        throw createError("narration_node_audio_missing");
      }
      const hydrated = await hydrateStationPlaybackQueue(baseQueue, playbackSeq);
      if (!hydrated || !Array.isArray(hydrated.queue) || !hydrated.queue.length || Number(hydrated.totalDurationMs || 0) <= 0) {
        throw createError("narration_node_duration_missing");
      }
      stopPlan = {
        queue: hydrated.queue,
        durationMs: Math.round(Number(hydrated.totalDurationMs || 0)),
        stopName: String(payload && payload.stop_name ? payload.stop_name : node.stopName || "").trim(),
        answerText: String(payload && payload.answer_text ? payload.answer_text : "").trim(),
      };
      const stats = groupStats.get(groupKey) || { rawMaxEndMs: 0, nodeCount: 0 };
      const rawMaxEndMs = Math.max(0, Number(stats.rawMaxEndMs || 0));
      const shouldScaleLegacyCompressedMs =
        Number(stopPlan.durationMs || 0) >= 3000 &&
        Number(stats.nodeCount || 0) > 1 &&
        rawMaxEndMs > 0 &&
        rawMaxEndMs <= Number(stopPlan.durationMs || 0) * 0.5;
      stopPlan.highlightScale = shouldScaleLegacyCompressedMs
        ? Number(stopPlan.durationMs || 0) / rawMaxEndMs
        : 1;
      if (shouldScaleLegacyCompressedMs) {
        try {
          console.warn("[pad] narration node highlight timeline looked compressed, scaled to stop duration", {
            recordingId: String(node.recordingId || "").trim(),
            stopIndex: Number(node.stopIndex),
            rawMaxEndMs,
            stopDurationMs: Number(stopPlan.durationMs || 0),
            scale: stopPlan.highlightScale,
          });
        } catch (_) {}
      }
      stopPlanCache.set(groupKey, stopPlan);
    }
    if (!activeGroup || activeGroupKey !== groupKey) {
      activeGroupKey = groupKey;
      activeGroup = {
        key: groupKey,
        playbackStartMs: offsetMs,
        playbackEndMs: offsetMs + Number(stopPlan.durationMs || 0),
        durationMs: Number(stopPlan.durationMs || 0),
        stopName: String(stopPlan.stopName || "").trim(),
        answerText: String(stopPlan.answerText || "").trim(),
      };
      (Array.isArray(stopPlan.queue) ? stopPlan.queue : []).forEach((segment) => {
        planQueue.push(
          Object.assign({}, segment, {
            nodeId: node.nodeId,
            groupKey,
            startMs: activeGroup.playbackStartMs + Number(segment.startMs || 0),
            endMs: activeGroup.playbackStartMs + Number(segment.endMs || 0),
          })
        );
      });
      offsetMs += activeGroup.durationMs;
    }
    const scaledHighlightStartMs = Math.round(
      normalizeTimelineEventTimeMs(node.highlightStartMs) * Number(stopPlan.highlightScale || 1)
    );
    const scaledHighlightEndMs = Math.round(
      normalizeTimelineEventTimeMs(node.highlightEndMs) * Number(stopPlan.highlightScale || 1)
    );
    const highlightStartMs = Math.max(0, Math.min(scaledHighlightStartMs, activeGroup.durationMs));
    const highlightEndMs = Math.max(highlightStartMs, Math.min(scaledHighlightEndMs, activeGroup.durationMs));
    const playbackNode = Object.assign({}, node, {
      playbackStartMs: activeGroup.playbackStartMs,
      playbackEndMs: activeGroup.playbackEndMs,
      durationMs: activeGroup.durationMs,
      highlightGlobalStartMs: activeGroup.playbackStartMs + highlightStartMs,
      highlightGlobalEndMs: activeGroup.playbackStartMs + highlightEndMs,
      stopName: activeGroup.stopName,
      answerText: activeGroup.answerText,
      groupKey,
    });
    planNodes.push(playbackNode);
  }
  return {
    nodes: planNodes,
    queue: planQueue,
    totalDurationMs: offsetMs,
  };
}

function applyStationTimelineHighlight(elapsedMs) {
  const nodes = Array.isArray(state.stationPlaybackNodes) ? state.stationPlaybackNodes : [];
  const slotKey = String(state.stationPlaybackSlotKey || "").trim();
  const cursorMs = Math.max(0, Number(elapsedMs || 0));
  let playbackNode = null;
  let playbackNodeIndex = -1;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (
      cursorMs >= Number(node.playbackStartMs || 0) &&
      cursorMs < Number(node.playbackEndMs || 0)
    ) {
      playbackNode = node;
      playbackNodeIndex = index;
      break;
    }
  }
  if (!playbackNode && nodes.length && cursorMs >= Number(nodes[nodes.length - 1].playbackEndMs || 0)) {
    playbackNode = nodes[nodes.length - 1];
    playbackNodeIndex = nodes.length - 1;
  }
  const activeHighlightNodes = nodes.filter(
    (node) =>
      cursorMs >= Number(node.highlightGlobalStartMs || 0) &&
      cursorMs <= Number(node.highlightGlobalEndMs || 0)
  );
  state.stationPlaybackEndedHotspotIds = [];
  const focusNode = activeHighlightNodes[0] || playbackNode || null;
  state.stationPlaybackNodeIndex = activeHighlightNodes.length
    ? nodes.findIndex((node) => String(node.nodeId || "") === String(activeHighlightNodes[0].nodeId || ""))
    : playbackNodeIndex;
  state.stationPlaybackNodeId = focusNode ? String(focusNode.nodeId || "") : "";
  state.stationPlaybackStopName = focusNode ? String(focusNode.stopName || "") : "";
  state.stationPlaybackAnswerText = focusNode ? String(focusNode.answerText || "") : "";
  if (
    state.stationPlaybackMode === "node-highlight" &&
    state.stationPlaybackRangeEndMs != null &&
    cursorMs >= Number(state.stationPlaybackRangeEndMs || 0) &&
    String(state.stationPlaybackState || "") === "playing"
  ) {
    state.stationPlaybackCursorMs = Number(state.stationPlaybackRangeEndMs || 0);
    state.audioBusy = false;
    state.stationPlaybackBusy = false;
    state.stationPlaybackState = "paused";
    state.playingStationSlotKey = "";
    state.pendingStationSlotKey = "";
    state.visibleHotspotIds = [];
    state.flashingHotspotIds = [];
    try {
      refs.audio.pause();
    } catch (_) {}
    logStationFlashLogic(slotKey, activeHighlightNodes, []);
    return;
  }
  if (!activeHighlightNodes.length) {
    state.visibleHotspotIds = [];
    state.flashingHotspotIds = [];
    state.highlightedHotspotId = "";
    logStationFlashLogic(slotKey, activeHighlightNodes, []);
    return;
  }
  const mergedHotspotIds = [];
  const seenHotspotIds = new Set();
  activeHighlightNodes.forEach((node) => {
    (Array.isArray(node.hotspotIds) ? node.hotspotIds : []).forEach((hotspotId) => {
      const nextHotspotId = String(hotspotId || "").trim();
      if (!nextHotspotId || seenHotspotIds.has(nextHotspotId)) return;
      seenHotspotIds.add(nextHotspotId);
      mergedHotspotIds.push(nextHotspotId);
    });
  });
  state.visibleHotspotIds = mergedHotspotIds.slice();
  state.flashingHotspotIds = mergedHotspotIds.slice();
  state.highlightedHotspotId = state.visibleHotspotIds[0] || "";
  logStationFlashLogic(slotKey, activeHighlightNodes, state.flashingHotspotIds);
}

async function playNarrationNodes(slotKey, nodes, options) {
  const slot = getStationSlotByKey(slotKey);
  const opts = options && typeof options === "object" ? options : {};
  const nodeList = normalizeNarrationNodes(nodes);
  if (!nodeList.length) {
    setStationPlaybackFailure("当前站点未配置讲解节点。");
    render();
    return;
  }
  const invalidNode = nodeList.find((node) => !getNarrationNodeValidation(slot.slotKey, node).valid);
  if (invalidNode) {
    setStationPlaybackFailure(getNarrationNodeValidation(slot.slotKey, invalidNode).message);
    render();
    return;
  }

  interruptCurrentPlayback({
    preserveError: false,
    preserveStationError: false,
    preserveRequestUrl: false,
    resetSource: true,
  });
  const playbackSeq = appContext.runtime.latestStationPlaybackSeq;
  state.audioBusy = true;
  state.audioError = "";
  state.stationPlaybackBusy = true;
  state.stationPlaybackError = "";
  state.stationPlaybackState = "playing";
  state.stationPlaybackSlotKey = String(slot.slotKey || "");
  state.pendingStationSlotKey = String(slot.slotKey || "");
  state.playingStationSlotKey = "";
  state.stationPlaybackMode = String(opts.mode || "station");
  state.stationPlaybackEndedHotspotIds = [];
  state.visibleHotspotIds = [];
  state.flashingHotspotIds = [];
  render();

  try {
    const plan = await buildNarrationPlaybackPlan(slot.slotKey, nodeList, playbackSeq);
    if (!plan || playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    if (!Array.isArray(plan.queue) || !plan.queue.length || Number(plan.totalDurationMs || 0) <= 0) {
      throw createError("narration_node_audio_missing");
    }
    const startCursorMs = clampStationPlaybackCursorMs(
      opts.startAtMs == null ? 0 : Math.min(normalizeTimelineEventTimeMs(opts.startAtMs), Number(plan.totalDurationMs || 0))
    );
    state.stationPlaybackNodes = plan.nodes;
    state.stationPlaybackQueue = plan.queue;
    state.stationPlaybackTotalDurationMs = Math.round(Number(plan.totalDurationMs || 0));
    state.stationPlaybackCursorMs = startCursorMs;
    state.stationPlaybackRangeEndMs =
      opts.rangeEndMs == null ? null : Math.min(normalizeTimelineEventTimeMs(opts.rangeEndMs), Number(plan.totalDurationMs || 0));
    state.stationPlaybackSegmentIndex = findStationSegmentIndexForGlobalMs(startCursorMs);
    applyStationTimelineHighlight(startCursorMs);
    const initialVisibleNodes = plan.nodes.filter(
      (node) =>
        startCursorMs >= Number(node.highlightGlobalStartMs || 0) &&
        startCursorMs <= Number(node.highlightGlobalEndMs || 0)
    );
    if (initialVisibleNodes.length) {
      const mergedHotspotIds = [];
      const seenHotspotIds = new Set();
      initialVisibleNodes.forEach((node) => {
        (Array.isArray(node.hotspotIds) ? node.hotspotIds : []).forEach((hotspotId) => {
          const nextHotspotId = String(hotspotId || "").trim();
          if (!nextHotspotId || seenHotspotIds.has(nextHotspotId)) return;
          seenHotspotIds.add(nextHotspotId);
          mergedHotspotIds.push(nextHotspotId);
        });
      });
      state.stationPlaybackNodeId = String(initialVisibleNodes[0].nodeId || "");
      state.visibleHotspotIds = mergedHotspotIds.slice();
      state.flashingHotspotIds = mergedHotspotIds.slice();
      state.highlightedHotspotId = state.visibleHotspotIds[0] || "";
    }
    await startStationSegment(
      slot.slotKey,
      state.stationPlaybackSegmentIndex < 0 ? 0 : state.stationPlaybackSegmentIndex,
      playbackSeq,
      startCursorMs
    );
  } catch (error) {
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    const code = String(error && error.code ? error.code : "").trim();
    if (code === "narration_node_audio_missing") {
      setStationPlaybackFailure("当前节点缺少可播放音轨。");
    } else if (code === "narration_node_duration_missing") {
      setStationPlaybackFailure("当前节点音轨时长读取失败。");
    } else if (code === "not_found") {
      setStationPlaybackFailure("当前节点音轨不存在。");
    } else {
      setStationPlaybackFailure(describeRequestError(error));
    }
    render();
  }
}

async function playNarrationNode(slotKey, nodeId, options) {
  const node = findStationNarrationNode(slotKey, nodeId);
  if (!node) return;
  const opts = options && typeof options === "object" ? options : {};
  await playNarrationNodes(slotKey, [node], {
    mode: opts.rangeOnly ? "node-highlight" : "node",
    startAtMs: opts.rangeOnly ? Number(node.highlightStartMs || 0) : opts.startAtMs,
    rangeEndMs: opts.rangeOnly ? Number(node.highlightEndMs || 0) : null,
  });
}

async function playStationSlot(slotKey, options) {
  const slot = getStationSlotByKey(slotKey);
  await playNarrationNodes(slot.slotKey, getStationNarrationNodes(slot), {
    mode: "station",
    startAtMs: options && typeof options === "object" ? options.startAtMs : 0,
    rangeEndMs: null,
  });
}

function pauseStationPlayback() {
  if (!String(state.stationPlaybackSlotKey || "").trim()) return;
  if (String(state.stationPlaybackState || "") !== "playing") return;
  syncStationPlaybackCursorFromAudio();
  state.stationPlaybackState = "paused";
  state.audioBusy = false;
  state.stationPlaybackBusy = false;
  state.playingStationSlotKey = "";
  state.pendingStationSlotKey = "";
  try {
    refs.audio.pause();
  } catch (_) {}
  render();
}

async function resumeStationPlayback(slotKey) {
  const key = String(slotKey || state.stationPlaybackSlotKey || "").trim();
  if (!key) return;
  if (String(state.stationPlaybackSlotKey || "").trim() !== key || !Array.isArray(state.stationPlaybackQueue) || !state.stationPlaybackQueue.length) {
    await playStationSlot(key, { startAtMs: 0 });
    return;
  }
  const totalDurationMs = getStationPlaybackDurationMs();
  const cursorMs = clampStationPlaybackCursorMs(state.stationPlaybackCursorMs || 0);
  if (totalDurationMs > 0 && cursorMs >= totalDurationMs) {
    render();
    return;
  }
  if (
    state.stationPlaybackMode === "node-highlight" &&
    state.stationPlaybackRangeEndMs != null &&
    cursorMs >= Number(state.stationPlaybackRangeEndMs || 0)
  ) {
    render();
    return;
  }
  appContext.runtime.latestStationPlaybackSeq += 1;
  const playbackSeq = appContext.runtime.latestStationPlaybackSeq;
  const segmentIndex = findStationSegmentIndexForGlobalMs(cursorMs);
  await startStationSegment(key, segmentIndex < 0 ? 0 : segmentIndex, playbackSeq, cursorMs);
}

async function toggleStationPlayback(slotKey) {
  const slot = getStationSlotByKey(slotKey);
  const samePlayingStation =
    slot &&
    (String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "") ||
      String(state.pendingStationSlotKey || "") === String(slot.slotKey || ""));
  if (samePlayingStation && String(state.stationPlaybackState || "") === "playing") {
    interruptCurrentPlayback({
      preserveError: false,
      preserveStationError: false,
      preserveRequestUrl: false,
      resetSource: true,
    });
    render();
    return;
  }
  if (samePlayingStation && String(state.stationPlaybackState || "") === "paused") {
    await resumeStationPlayback(slotKey);
    return;
  }
  await playStationSlot(slotKey, { startAtMs: 0 });
}
