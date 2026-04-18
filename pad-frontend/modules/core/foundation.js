// Foundation helpers: formatting, storage, requests, playback math, and shared state utilities.
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(n));
  } catch (_) {
    return new Date(n).toLocaleString();
  }
}

function ensureClientId() {
  try {
    const existing = window.localStorage.getItem("clientId");
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "cid_" + Date.now() + "_" + Math.random().toString(16).slice(2);
    window.localStorage.setItem("clientId", next);
    return next;
  } catch (_) {
    return "cid_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }
}

function createError(message, extra) {
  const error = new Error(String(message || "unknown_error"));
  return Object.assign(error, extra || {});
}

function normalizeDemoLeftTabKey(value) {
  const rawKey = String(value || "").trim();
  const key = LEGACY_STATION_SLOT_KEY_MAP[rawKey] || rawKey;
  return STATION_SLOT_KEYS.includes(key) ? key : DEFAULT_DEMO_LEFT_TAB;
}

function normalizeDemoRightTabKey(value) {
  const key = String(value || "").trim();
  if (key === "station" || key === "product") return key;
  return DEFAULT_DEMO_RIGHT_TAB;
}

function getDefaultStationSlot(slotKey, index) {
  const normalizedKey = STATION_SLOT_KEYS.includes(String(slotKey || "").trim())
    ? String(slotKey || "").trim()
    : STATION_SLOT_KEYS[index] || STATION_SLOT_KEYS[0];
  return {
    slotKey: normalizedKey,
    stationId: "",
    label: "",
    recordingId: "",
    stopIndex: null,
    stopName: "",
    timelineEvents: [],
    narrationNodes: [],
    narrationNodesError: "",
  };
}

function createDefaultStationSlots() {
  return STATION_SLOT_KEYS.map((slotKey, index) => getDefaultStationSlot(slotKey, index));
}

function normalizeStationStopIndex(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function normalizeTimelineEventTimeMs(value) {
  if (value == null || String(value).trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function normalizeNarrationHighlightTimeMs(value) {
  const normalizedMs = normalizeTimelineEventTimeMs(value);
  if (normalizedMs < 3600000) return normalizedMs;
  const normalizedFromNs = Math.round(normalizedMs / 1000000);
  if (normalizedFromNs < 0 || normalizedFromNs >= 3600000) return normalizedMs;
  try {
    console.warn("[pad] narration node highlight time looked like ns, converted to ms", {
      raw: normalizedMs,
      normalized: normalizedFromNs,
    });
  } catch (_) {}
  return normalizedFromNs;
}

function normalizeTimelineEventType(value) {
  const next = String(value || "focus_switch").trim() || "focus_switch";
  if (next === "focus_switch" || next === "highlight_on" || next === "highlight_off") {
    return next;
  }
  return "focus_switch";
}

function normalizeNarrationNode(raw, index) {
  const item = raw && typeof raw === "object" ? raw : {};
  const startMs = normalizeNarrationHighlightTimeMs(
    item.highlightStartMs != null ? item.highlightStartMs : item.highlight_start_ms
  );
  const endMs = normalizeNarrationHighlightTimeMs(
    item.highlightEndMs != null ? item.highlightEndMs : item.highlight_end_ms
  );
  const hotspotIds = Array.isArray(item.hotspotIds)
    ? item.hotspotIds
    : Array.isArray(item.hotspot_ids)
      ? item.hotspot_ids
      : [];
  return {
    nodeId: String(item.nodeId || item.node_id || "").trim(),
    sortOrder:
      item.sortOrder != null
        ? Number(item.sortOrder)
        : item.sort_order != null
          ? Number(item.sort_order)
          : index,
    recordingId: String(item.recordingId || item.recording_id || "").trim(),
    stopIndex: normalizeStationStopIndex(item.stopIndex != null ? item.stopIndex : item.stop_index),
    stopName: String(item.stopName || item.stop_name || "").trim(),
    highlightStartMs: Math.min(startMs, endMs),
    highlightEndMs: Math.max(startMs, endMs),
    hotspotIds: hotspotIds
      .map((hotspotId) => String(hotspotId || "").trim())
      .filter((hotspotId, hotspotIndex, arr) => hotspotId && arr.indexOf(hotspotId) === hotspotIndex),
    updatedAtMs: Number(item.updatedAtMs != null ? item.updatedAtMs : item.updated_at_ms || 0),
  };
}

function normalizeNarrationNodes(rawNodes) {
  return (Array.isArray(rawNodes) ? rawNodes : [])
    .map((raw, index) => normalizeNarrationNode(raw, index))
    .filter((item) => String(item.nodeId || "").trim() || item.recordingId || item.hotspotIds.length)
    .sort((left, right) => {
      const orderDiff = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(left.highlightStartMs || 0) - Number(right.highlightStartMs || 0);
    });
}

function normalizeStationSlot(raw, index) {
  const base = getDefaultStationSlot("", index);
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    slotKey: base.slotKey,
    stationId: String(item.stationId || item.station_id || "").trim(),
    label: String(item.label || "").trim(),
    recordingId: String(item.recordingId || item.recording_id || "").trim(),
    stopIndex: normalizeStationStopIndex(item.stopIndex != null ? item.stopIndex : item.stop_index),
    stopName: String(item.stopName || item.stop_name || "").trim(),
    timelineEvents: normalizeTimelineEvents(
      Array.isArray(item.timelineEvents) ? item.timelineEvents : item.timeline_events
    ),
    narrationNodes: normalizeNarrationNodes(
      Array.isArray(item.narrationNodes) ? item.narrationNodes : item.narration_nodes
    ),
    narrationNodesError: String(item.narrationNodesError || item.narration_nodes_error || "").trim(),
  };
}

function readStationSlotsFromStorage() {
  const fallback = {
    activeLeftTab: DEFAULT_DEMO_LEFT_TAB,
    activeRightTab: DEFAULT_DEMO_RIGHT_TAB,
    slots: createDefaultStationSlots(),
  };
  try {
    const raw = window.localStorage.getItem(STATION_SLOT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    STATION_SLOT_KEYS.map((slotKey) => {
      const rawSlots = parsed && Array.isArray(parsed.slots) ? parsed.slots : [];
      const found =
        rawSlots.find((item) => String(item && item.slotKey ? item.slotKey : "").trim() === slotKey) ||
        rawSlots[index] ||
        null;
      return normalizeStationSlot(found, index);
    });
    return {
      activeLeftTab: normalizeDemoLeftTabKey(parsed && parsed.activeLeftTab),
      activeRightTab: normalizeDemoRightTabKey(parsed && parsed.activeRightTab),
      slots,
    };
  } catch (_) {
    return fallback;
  }
}

function writeStationSlotsToStorage() {
  try {
    window.localStorage.setItem(
      STATION_SLOT_STORAGE_KEY,
      JSON.stringify({
        activeLeftTab: normalizeDemoLeftTabKey(state.demoLeftTabKey),
        activeRightTab: normalizeDemoRightTabKey(state.demoRightTabKey),
        slots: STATION_SLOT_KEYS.map((slotKey, index) => {
          const slot =
            (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : []).find(
              (item) => String(item && item.slotKey ? item.slotKey : "").trim() === slotKey
            ) || getDefaultStationSlot(slotKey, index);
          return {
            slotKey,
            stationId: String(slot.stationId || "").trim(),
            label: String(slot.label || "").trim(),
            recordingId: String(slot.recordingId || "").trim(),
            stopIndex: normalizeStationStopIndex(slot.stopIndex),
            stopName: String(slot.stopName || "").trim(),
          };
        }),
      })
    );
  } catch (_) {}
}

function readProductPlayCountsFromStorage() {
  try {
    const raw = window.localStorage.getItem(PRODUCT_PLAY_COUNT_STORAGE_KEY);
    if (!raw) return Object.create(null);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Object.create(null);
    }
    const next = Object.create(null);
    Object.keys(parsed).forEach((key) => {
      const count = Number(parsed[key] || 0);
      if (Number.isFinite(count) && count > 0) {
        next[String(key)] = Math.floor(count);
      }
    });
    return next;
  } catch (_) {
    return Object.create(null);
  }
}

function normalizeDemoColumns(value) {
  if (value == null || String(value).trim() === "") {
    return DEFAULT_DEMO_COLUMNS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DEMO_COLUMNS;
  return Math.min(MAX_DEMO_COLUMNS, Math.max(MIN_DEMO_COLUMNS, Math.floor(parsed)));
}

function readDemoColumnsFromStorage() {
  try {
    return normalizeDemoColumns(window.localStorage.getItem(DEMO_COLUMNS_STORAGE_KEY));
  } catch (_) {
    return DEFAULT_DEMO_COLUMNS;
  }
}

function writeDemoColumnsToStorage() {
  try {
    window.localStorage.setItem(DEMO_COLUMNS_STORAGE_KEY, String(normalizeDemoColumns(state.demoColumns)));
  } catch (_) {}
}

function writeProductPlayCountsToStorage() {
  try {
    window.localStorage.setItem(PRODUCT_PLAY_COUNT_STORAGE_KEY, JSON.stringify(state.productPlayCounts));
  } catch (_) {}
}

function persistClientId(clientId) {
  const nextClientId = String(clientId || "").trim();
  if (!nextClientId) {
    throw createError("client_id_required");
  }
  state.clientId = nextClientId;
  try {
    window.localStorage.setItem("clientId", nextClientId);
  } catch (_) {}
  publishE2eState();
  return nextClientId;
}

function buildUrlWithClient(path, clientId, version) {
  const url = new URL(String(path || "/"), window.location.origin);
  if (clientId && !url.searchParams.get("client_id")) {
    url.searchParams.set("client_id", String(clientId));
  }
  if (version != null && version !== "") {
    url.searchParams.set("v", String(version));
  }
  return url.toString();
}

async function fetchJson(path, clientId, options) {
  const opts = options && typeof options === "object" ? options : {};
  const method = String(opts.method || "GET").toUpperCase();
  const headers = Object.assign(
    {
      Accept: "application/json",
      "X-Client-ID": String(clientId || ""),
    },
    opts.headers || {}
  );
  let body;
  if (Object.prototype.hasOwnProperty.call(opts, "json")) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json == null ? {} : opts.json);
  } else if (Object.prototype.hasOwnProperty.call(opts, "body")) {
    body = opts.body;
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      delete headers["Content-Type"];
    }
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method,
      cache: "no-store",
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const payload = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
      throw createError(payload && payload.error ? payload.error : "http_" + response.status, {
        kind: "http",
        status: response.status,
        code: payload && payload.error ? String(payload.error) : "",
      });
    }
    return payload || {};
  } catch (error) {
    if (error && error.kind === "http") throw error;
    throw createError("network_unavailable", { kind: "network" });
  } finally {
    window.clearTimeout(timer);
  }
}

function buildAbsoluteUrl(path) {
  try {
    return new URL(String(path || "/"), window.location.origin).toString();
  } catch (_) {
    return String(path || "");
  }
}

function formatRecordingLabel(item) {
  const row = item && typeof item === "object" ? item : {};
  const displayName = String(row.display_name || row.label || "").trim();
  if (displayName) return displayName;
  const recordingId = String(row.recording_id || "").trim();
  if (!recordingId) return "--";
  return recordingId;
}

function getRecordingOption(recordingId) {
  const rid = String(recordingId || "").trim();
  if (!rid) return null;
  return (
    (Array.isArray(state.recordingOptions) ? state.recordingOptions : []).find(
      (item) => String(item && item.recording_id ? item.recording_id : "").trim() === rid
    ) || null
  );
}

function getRecordingMetaEntry(recordingId) {
  const rid = String(recordingId || "").trim();
  if (!rid) return null;
  return state.recordingMetaById && state.recordingMetaById[rid] ? state.recordingMetaById[rid] : null;
}

function getRecordingStops(recordingId) {
  const entry = getRecordingMetaEntry(recordingId);
  if (!entry || !entry.data || !Array.isArray(entry.data.stops)) return [];
  return entry.data.stops.map((item) => String(item || "").trim()).filter(Boolean);
}

function getNarrationStopDurationCacheKey(recordingId, stopIndex) {
  const rid = String(recordingId || "").trim();
  const nextStopIndex = normalizeStationStopIndex(stopIndex);
  if (!rid || nextStopIndex == null) return "";
  return rid + "::" + String(nextStopIndex);
}

function getCachedNarrationStopDurationMs(recordingId, stopIndex) {
  const cacheKey = getNarrationStopDurationCacheKey(recordingId, stopIndex);
  if (!cacheKey) return 0;
  const cached = Number(appContext.caches.narrationStopDurationCache[cacheKey] || 0);
  return Number.isFinite(cached) && cached > 0 ? Math.round(cached) : 0;
}

function getStationSlotByKey(slotKey) {
  const key = normalizeDemoLeftTabKey(slotKey);
  return (
    (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : []).find(
      (item) => String(item && item.slotKey ? item.slotKey : "").trim() === key
    ) || getDefaultStationSlot(key, STATION_SLOT_KEYS.indexOf(key))
  );
}

function getActiveStationSlot() {
  return getStationSlotByKey(state.demoLeftTabKey);
}

function getStationSlotDisplayName(slot) {
  const item = slot && typeof slot === "object" ? slot : {};
  const stopName = String(item.stopName || "").trim();
  if (stopName && !/^(\?|\uff1f)+$/.test(stopName) && !/[闂婵缂濠鈧]/.test(stopName)) return stopName;
  const label = String(item.label || "").trim();
  if (label && !/^(\?|\uff1f)+$/.test(label) && !/[闂婵缂濠鈧]/.test(label)) return label;
  const slotKey = String(item.slotKey || "").trim();
  const index = STATION_SLOT_KEYS.indexOf(slotKey);
  return index >= 0 ? `站位 ${index + 1}` : "未命名站位";
}

function normalizeRecordingMeta(meta) {
  const item = meta && typeof meta === "object" ? meta : {};
  return {
    recording_id: String(item.recording_id || "").trim(),
    display_name: String(item.display_name || "").trim(),
    created_at_ms: Number(item.created_at_ms || 0),
    finished_at_ms: Number(item.finished_at_ms || 0),
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    stops: (Array.isArray(item.stops) ? item.stops : []).map((stop) => String(stop || "").trim()).filter(Boolean),
  };
}

function persistStationSlotsState() {
  writeStationSlotsToStorage();
}

function updateStationSlot(slotKey, updater) {
  const key = normalizeDemoLeftTabKey(slotKey);
  const prevSlots = Array.isArray(state.demoStationSlots) ? state.demoStationSlots : createDefaultStationSlots();
  const nextSlots = STATION_SLOT_KEYS.map((knownKey, index) => {
    const base =
      prevSlots.find((item) => String(item && item.slotKey ? item.slotKey : "").trim() === knownKey) ||
      getDefaultStationSlot(knownKey, index);
    if (knownKey !== key) return normalizeStationSlot(base, index);
    const nextRaw = typeof updater === "function" ? updater(normalizeStationSlot(base, index)) : base;
    return normalizeStationSlot(Object.assign({}, base, nextRaw || {}), index);
  });
  const previousActive = getStationSlotByKey(key);
  const nextActive = nextSlots.find((item) => item.slotKey === key) || getDefaultStationSlot(key, STATION_SLOT_KEYS.indexOf(key));
  const stationConfigChanged =
    String(previousActive.recordingId || "") !== String(nextActive.recordingId || "") ||
    normalizeStationStopIndex(previousActive.stopIndex) !== normalizeStationStopIndex(nextActive.stopIndex);
  state.demoStationSlots = nextSlots;
  persistStationSlotsState();
  if (stationConfigChanged && String(state.stationPlaybackSlotKey || "") === key) {
    resetAudioPlayback();
  }
  render();
}

function findStationTimelineHotspot(scene, hotspotId) {
  const nextId = String(hotspotId || "").trim();
  if (!nextId) return null;
  const hotspots = scene && Array.isArray(scene.hotspots) ? scene.hotspots : [];
  return (
    hotspots.find((item) => String(item && item.hotspot_id ? item.hotspot_id : "").trim() === nextId) || null
  );
}

function getStationTimelineHotspotOptions(scene, selectedHotspotId) {
  const hotspots = scene && Array.isArray(scene.hotspots) ? scene.hotspots : [];
  const seen = new Set();
  const options = [];
  hotspots.forEach((hotspot) => {
    const hotspotId = String(hotspot && hotspot.hotspot_id ? hotspot.hotspot_id : "").trim();
    if (!hotspotId || seen.has(hotspotId)) return;
    seen.add(hotspotId);
    options.push(hotspot);
  });
  const fallbackId = String(selectedHotspotId || "").trim();
  if (fallbackId && !seen.has(fallbackId)) {
    options.push({
      hotspot_id: fallbackId,
      product_id: "",
      target_type: "missing",
      control_label: "",
    });
  }
  return options;
}

function getStationTimelineHotspotLabel(scene, hotspotId) {
  const hotspot = findStationTimelineHotspot(scene, hotspotId);
  if (!hotspot) {
    const fallbackId = String(hotspotId || "").trim();
    return fallbackId ? "\u5931\u6548\u70ed\u533a \u00b7 " + fallbackId : "\u672a\u9009\u62e9\u70ed\u533a";
  }
  if (String(hotspot.target_type || "product") === "control") {
    const controlLabel = String(hotspot.control_label || "").trim() || "\u63a7\u5236\u70ed\u533a";
    return controlLabel + " \u00b7 " + String(hotspot.hotspot_id || "").trim();
  }
  const product = findProductById(hotspot.product_id);
  const productName = String(product && product.product_name ? product.product_name : hotspot.product_id || "").trim();
  return (productName || "\u672a\u7ed1\u5b9a\u4ea7\u54c1") + " \u00b7 " + String(hotspot.hotspot_id || "").trim();
}

function getStationFlashDebugHotspots(scene, hotspotIds) {
  return (Array.isArray(hotspotIds) ? hotspotIds : [])
    .map((hotspotId) => String(hotspotId || "").trim())
    .filter((hotspotId, index, list) => hotspotId && list.indexOf(hotspotId) === index)
    .map((hotspotId) => ({
      hotspotId,
      hotspotName: getStationTimelineHotspotLabel(scene, hotspotId),
    }));
}

function logStationFlashLogic(slotKey, activeNodes, hotspotIds) {
  const scene = findSceneById(slotKey) || getSelectedScene();
  const debugHotspots = getStationFlashDebugHotspots(scene, hotspotIds);
  const nodes = Array.isArray(activeNodes) ? activeNodes : activeNodes ? [activeNodes] : [];
  if (!debugHotspots.length) {
    appContext.runtime.lastFlashLogicLogKey = "";
    return;
  }
  const nextKey = [
    String(slotKey || "").trim(),
    nodes.map((node) => String(node && node.nodeId ? node.nodeId : "").trim()).join(","),
    debugHotspots.map((item) => item.hotspotId).join(","),
  ].join("|");
  if (!nextKey || nextKey === appContext.runtime.lastFlashLogicLogKey) return;
  appContext.runtime.lastFlashLogicLogKey = nextKey;
  try {
    console.log("[pad:flash:logic] hotspots should flash", {
      slotKey: String(slotKey || "").trim(),
      nodeIds: nodes.map((node) => String(node && node.nodeId ? node.nodeId : "").trim()).filter(Boolean),
      nodeStopNames: nodes.map((node) => String(node && node.stopName ? node.stopName : "").trim()).filter(Boolean),
      hotspotNames: debugHotspots.map((item) => item.hotspotName),
      hotspots: debugHotspots,
    });
  } catch (_) {}
}

function logStationFlashRender(scene, hotspotIds, options) {
  const sceneKey = String(
    (scene && (scene.slot_key || scene.station_key || scene.scene_id)) || ""
  ).trim();
  const debugHotspots = getStationFlashDebugHotspots(scene, hotspotIds);
  if (!sceneKey || !debugHotspots.length) {
    appContext.runtime.lastFlashRenderLogKey = "";
    return;
  }
  const opts = options && typeof options === "object" ? options : {};
  const nextKey = [
    sceneKey,
    String(opts.interactiveOnly ? "interactive" : "normal"),
    debugHotspots.map((item) => item.hotspotId).join(","),
  ].join("|");
  if (nextKey === appContext.runtime.lastFlashRenderLogKey) return;
  appContext.runtime.lastFlashRenderLogKey = nextKey;
  try {
    console.log("[pad:flash:render] hotspots rendered with flashing style", {
      sceneId: sceneKey,
      interactiveOnly: !!opts.interactiveOnly,
      activeHotspotId: String(opts.activeHotspotId || "").trim(),
      visibleHotspotIds: Array.isArray(opts.visibleHotspotIds) ? opts.visibleHotspotIds : [],
      hotspotNames: debugHotspots.map((item) => item.hotspotName),
      hotspots: debugHotspots,
    });
  } catch (_) {}
}

function getStationTimelineEventSummary(scene, event) {
  const actionLabel =
    TIMELINE_EVENT_TYPE_LABELS[normalizeTimelineEventType(event && event.eventType)] ||
    TIMELINE_EVENT_TYPE_LABELS.focus_switch;
  const hotspot = findStationTimelineHotspot(scene, event && event.hotspotId);
  if (!hotspot) {
    return "\u5f53\u524d\u8282\u70b9\u5f15\u7528\u7684\u70ed\u533a\u5df2\u4e0d\u5b58\u5728\uff0c\u4fdd\u5b58\u65f6\u4f1a\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u70ed\u533a\u3002";
  }
  if (String(hotspot.target_type || "product") === "control") {
    const controlLabel = String(hotspot.control_label || "").trim() || "\u63a7\u5236\u70ed\u533a";
    return actionLabel + "\uff1a" + controlLabel;
  }
  const product = findProductById(hotspot.product_id);
  const productName = String(product && product.product_name ? product.product_name : hotspot.product_id || "").trim();
  return (
    actionLabel +
    "\uff1a" +
    (productName || "\u672a\u7ed1\u5b9a\u4ea7\u54c1") +
    "\uff08" +
    String(hotspot.hotspot_id || "").trim() +
    "\uff09"
  );
}

function formatTimelineOffset(timeMs) {
  const totalMs = Math.max(0, normalizeTimelineEventTimeMs(timeMs));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "." +
    String(milliseconds).padStart(3, "0")
  );
}

function getStationPlaybackDurationMs() {
  if (Number(state.stationPlaybackTotalDurationMs || 0) > 0) {
    return Math.max(0, normalizeTimelineEventTimeMs(state.stationPlaybackTotalDurationMs));
  }
  const audio = refs.audio;
  if (!audio) return 0;
  const seconds = Number(audio.duration || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(0, Math.round(seconds * 1000));
}

function getStationPlaybackStateForSlot(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key) return "idle";
  if (
    key === String(state.stationPlaybackSlotKey || "").trim() ||
    key === String(state.pendingStationSlotKey || "").trim() ||
    key === String(state.playingStationSlotKey || "").trim()
  ) {
    return String(state.stationPlaybackState || "idle");
  }
  return "idle";
}

function getStationPlaybackQueueSegment(index) {
  const queue = Array.isArray(state.stationPlaybackQueue) ? state.stationPlaybackQueue : [];
  const normalizedIndex = Number(index);
  if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= queue.length) {
    return null;
  }
  return queue[normalizedIndex] || null;
}

function clampStationPlaybackCursorMs(timeMs) {
  const normalized = normalizeTimelineEventTimeMs(timeMs);
  const totalMs = getStationPlaybackDurationMs();
  if (totalMs > 0) {
    return Math.min(normalized, totalMs);
  }
  return normalized;
}

function getStationPlaybackCurrentGlobalMs() {
  const audio = refs.audio;
  const currentSegment = getStationPlaybackQueueSegment(state.stationPlaybackSegmentIndex);
  if (
    currentSegment &&
    String(state.stationPlaybackState || "") === "playing" &&
    String(state.stationPlaybackSlotKey || "").trim() &&
    audio
  ) {
    const segmentStartMs = normalizeTimelineEventTimeMs(currentSegment.startMs);
    const localSeconds = Number(audio.currentTime || 0);
    const localMs = Number.isFinite(localSeconds) && localSeconds > 0 ? Math.round(localSeconds * 1000) : 0;
    const segmentDurationMs = normalizeTimelineEventTimeMs(currentSegment.durationMs);
    return clampStationPlaybackCursorMs(segmentStartMs + Math.min(localMs, segmentDurationMs || localMs));
  }
  return clampStationPlaybackCursorMs(state.stationPlaybackCursorMs || 0);
}

function syncStationPlaybackCursorFromAudio() {
  const currentMs = getStationPlaybackCurrentGlobalMs();
  state.stationPlaybackCursorMs = currentMs;
  if (String(state.stationPlaybackSlotKey || "").trim()) {
    applyStationTimelineHighlight(currentMs);
  }
  return currentMs;
}

function setStationPlaybackCursor(slotKey, timeMs, options) {
  const key = String(slotKey || "").trim();
  const opts = options && typeof options === "object" ? options : {};
  const currentSlotKey = String(state.stationPlaybackSlotKey || "").trim();
  if (
    opts.pauseIfPlaying &&
    key &&
    key === currentSlotKey &&
    String(state.stationPlaybackState || "") === "playing"
  ) {
    try {
      refs.audio.pause();
    } catch (_) {}
    state.stationPlaybackState = "paused";
    state.playingStationSlotKey = "";
    state.pendingStationSlotKey = "";
    state.audioBusy = false;
    state.stationPlaybackBusy = false;
  }
  const nextMs = clampStationPlaybackCursorMs(timeMs);
  state.stationPlaybackCursorMs = nextMs;
  if (key && (!currentSlotKey || key === currentSlotKey)) {
    applyStationTimelineHighlight(nextMs);
  }
  if (opts.render !== false) {
    render();
  }
  return nextMs;
}

function findStationSegmentIndexForGlobalMs(timeMs) {
  const queue = Array.isArray(state.stationPlaybackQueue) ? state.stationPlaybackQueue : [];
  if (!queue.length) return -1;
  const normalizedMs = clampStationPlaybackCursorMs(timeMs);
  for (let index = 0; index < queue.length; index += 1) {
    const segment = queue[index];
    const startMs = normalizeTimelineEventTimeMs(segment && segment.startMs);
    const endMs = normalizeTimelineEventTimeMs(segment && segment.endMs);
    if (normalizedMs < endMs || index === queue.length - 1) {
      return normalizedMs === endMs && index < queue.length - 1 ? index + 1 : index;
    }
    if (normalizedMs >= startMs && normalizedMs < endMs) {
      return index;
    }
  }
  return queue.length - 1;
}

function normalizeStationTimelineSelection(rawSelection) {
  const raw = rawSelection && typeof rawSelection === "object" ? rawSelection : null;
  if (!raw) return null;
  const hotspotId = String(raw.hotspotId || "").trim();
  if (!hotspotId) return null;
  const startMs = normalizeTimelineEventTimeMs(raw.startMs);
  const endMs = normalizeTimelineEventTimeMs(raw.endMs);
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
    hotspotId,
    productId: String(raw.productId || "").trim(),
  };
}

function getStationTimelineSelectionFromEvents(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key) return null;
  const scene = findSceneById(key) || getSelectedScene();
  const allEvents = normalizeStationTimelineEditorEvents(getStationSlotByKey(key).timelineEvents, scene);
  const highlightEvents = allEvents
    .filter((event) => {
      const type = normalizeTimelineEventType(event && event.eventType);
      return type === "highlight_on" || type === "highlight_off";
    })
    .sort((left, right) => normalizeTimelineEventTimeMs(left.timeMs) - normalizeTimelineEventTimeMs(right.timeMs));
  for (let index = 0; index < highlightEvents.length; index += 1) {
    const startEvent = highlightEvents[index];
    if (normalizeTimelineEventType(startEvent && startEvent.eventType) !== "highlight_on") continue;
    const startMs = normalizeTimelineEventTimeMs(startEvent && startEvent.timeMs);
    const hotspotId = String(startEvent && startEvent.hotspotId ? startEvent.hotspotId : "").trim();
    if (!hotspotId) continue;
    const endEvent =
      highlightEvents.find((candidate) => {
        if (normalizeTimelineEventType(candidate && candidate.eventType) !== "highlight_off") return false;
        if (String(candidate && candidate.hotspotId ? candidate.hotspotId : "").trim() !== hotspotId) return false;
        return normalizeTimelineEventTimeMs(candidate.timeMs) >= startMs;
      }) || null;
    if (!endEvent) continue;
    return normalizeStationTimelineSelection({
      startMs,
      endMs: endEvent.timeMs,
      hotspotId,
      productId: String(startEvent && startEvent.productId ? startEvent.productId : "").trim(),
    });
  }
  return null;
}

function getStationTimelineSelection(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key) return null;
  const fromState =
    state.stationTimelineSelections && state.stationTimelineSelections[key]
      ? normalizeStationTimelineSelection(state.stationTimelineSelections[key])
      : null;
  if (fromState) return fromState;
  return getStationTimelineSelectionFromEvents(key);
}

function getStationTimelineSelectionFromStateOnly(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key || !state.stationTimelineSelections || !state.stationTimelineSelections[key]) return null;
  return normalizeStationTimelineSelection(state.stationTimelineSelections[key]);
}

function setStationTimelineSelection(slotKey, startMs, endMs, options) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  const current = getStationTimelineSelection(key);
  const opts = options && typeof options === "object" ? options : {};
  const nextSelection = normalizeStationTimelineSelection({
    startMs,
    endMs,
    hotspotId: opts.hotspotId != null ? opts.hotspotId : current && current.hotspotId,
    productId: opts.productId != null ? opts.productId : current && current.productId,
  });
  if (!nextSelection) {
    clearStationTimelineSelection(key);
    return;
  }
  state.stationTimelineSelections[key] = nextSelection;
}

function clearStationTimelineSelection(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key || !state.stationTimelineSelections || !state.stationTimelineSelections[key]) return;
  delete state.stationTimelineSelections[key];
}

function getStationTimelineVisualMaxMs(slotKey) {
  const slot = getStationSlotByKey(slotKey);
  const selection = getStationTimelineSelection(slotKey);
  const eventMax = (Array.isArray(slot.timelineEvents) ? slot.timelineEvents : []).reduce((maxValue, item) => {
    return Math.max(maxValue, normalizeTimelineEventTimeMs(item && item.timeMs));
  }, 0);
  const selectionMax = selection ? Math.max(selection.startMs, selection.endMs) : 0;
  return Math.max(getStationPlaybackDurationMs(), eventMax, selectionMax, 1000);
}

function seekStationPlaybackToMs(timeMs) {
  setStationPlaybackCursor(state.stationPlaybackSlotKey, timeMs, { pauseIfPlaying: true });
}

function getTimelineTimeMsFromPointer(slotKey, clientX) {
  if (!refs.app) return 0;
  const track = refs.app.querySelector(
    '[data-role="station-timeline-track"][data-slot-key="' + String(slotKey || "").trim() + '"]'
  );
  if (!track) return 0;
  const rect = track.getBoundingClientRect();
  if (!rect || rect.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (Number(clientX) - rect.left) / rect.width));
  return Math.round(getStationTimelineVisualMaxMs(slotKey) * ratio);
}

function beginStationTimelineSelection(slotKey, clientX) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  const anchorMs = getTimelineTimeMsFromPointer(key, clientX);
  const scene = findSceneById(key) || getSelectedScene();
  const targetHotspot = getTimelineSelectedTargetHotspot(scene);
  appContext.runtime.stationTimelineInteraction = {
    mode: "selection",
    slotKey: key,
    anchorMs,
    currentMs: anchorMs,
    moved: false,
  };
  setStationTimelineSelection(key, anchorMs, anchorMs, {
    hotspotId: targetHotspot ? String(targetHotspot.hotspot_id || "").trim() : "",
    productId: targetHotspot ? String(targetHotspot.product_id || "").trim() : "",
  });
  render();
}

function updateStationTimelineSelection(clientX) {
  if (!appContext.runtime.stationTimelineInteraction) return;
  const nextMs = getTimelineTimeMsFromPointer(appContext.runtime.stationTimelineInteraction.slotKey, clientX);
  if (appContext.runtime.stationTimelineInteraction.mode === "cursor") {
    appContext.runtime.stationTimelineInteraction.currentMs = nextMs;
    setStationPlaybackCursor(appContext.runtime.stationTimelineInteraction.slotKey, nextMs, {
      pauseIfPlaying: true,
      render: false,
    });
    render();
    return;
  }
  if (appContext.runtime.stationTimelineInteraction.mode === "highlight-start" || appContext.runtime.stationTimelineInteraction.mode === "highlight-end") {
    appContext.runtime.stationTimelineInteraction.currentMs = nextMs;
    appContext.runtime.stationTimelineInteraction.moved =
      appContext.runtime.stationTimelineInteraction.moved ||
      Math.abs(nextMs - appContext.runtime.stationTimelineInteraction.anchorMs) > 20;
    const currentSelection = getStationTimelineSelection(appContext.runtime.stationTimelineInteraction.slotKey);
    if (!currentSelection) return;
    if (appContext.runtime.stationTimelineInteraction.mode === "highlight-start") {
      setStationTimelineSelection(
        appContext.runtime.stationTimelineInteraction.slotKey,
        nextMs,
        currentSelection.endMs,
        currentSelection
      );
    } else {
      setStationTimelineSelection(
        appContext.runtime.stationTimelineInteraction.slotKey,
        currentSelection.startMs,
        nextMs,
        currentSelection
      );
    }
    render();
    return;
  }
  appContext.runtime.stationTimelineInteraction.currentMs = nextMs;
  appContext.runtime.stationTimelineInteraction.moved =
    appContext.runtime.stationTimelineInteraction.moved ||
    Math.abs(nextMs - appContext.runtime.stationTimelineInteraction.anchorMs) > 40;
  const currentSelection = getStationTimelineSelection(appContext.runtime.stationTimelineInteraction.slotKey);
  setStationTimelineSelection(
    appContext.runtime.stationTimelineInteraction.slotKey,
    appContext.runtime.stationTimelineInteraction.anchorMs,
    nextMs,
    currentSelection || {}
  );
  render();
}

function beginStationTimelineCursorDrag(slotKey, clientX) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  const currentMs = getTimelineTimeMsFromPointer(key, clientX);
  appContext.runtime.stationTimelineInteraction = {
    mode: "cursor",
    slotKey: key,
    anchorMs: currentMs,
    currentMs,
    moved: false,
  };
  setStationPlaybackCursor(key, currentMs, {
    pauseIfPlaying: true,
    render: false,
  });
  render();
}

function beginStationTimelineHighlightHandleDrag(slotKey, edge, clientX) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  const selection = getStationTimelineSelection(key);
  if (!selection) return;
  appContext.runtime.stationTimelineInteraction = {
    mode: edge === "start" ? "highlight-start" : "highlight-end",
    slotKey: key,
    anchorMs: getTimelineTimeMsFromPointer(key, clientX),
    currentMs: getTimelineTimeMsFromPointer(key, clientX),
    moved: false,
  };
  render();
}

function endStationTimelineSelection() {
  if (!appContext.runtime.stationTimelineInteraction) return;
  const interaction = appContext.runtime.stationTimelineInteraction;
  appContext.runtime.stationTimelineInteraction = null;
  if (interaction.mode === "cursor") {
    render();
    return;
  }
  if (interaction.mode === "highlight-start" || interaction.mode === "highlight-end") {
    if (interaction.moved) {
      applyStationTimelineSelection(interaction.slotKey);
      return;
    }
    render();
    return;
  }
  if (!interaction.moved) {
    seekStationPlaybackToMs(interaction.currentMs);
    return;
  }
  applyStationTimelineSelection(interaction.slotKey);
}

function getStationTimelineEditableEvents(events) {
  return (Array.isArray(events) ? events : []).filter((event) => {
    const type = normalizeTimelineEventType(event && event.eventType);
    return type !== "highlight_on" && type !== "highlight_off";
  });
}

function buildStationTimelineEventsWithSelection(events, selection) {
  const baseEvents = getStationTimelineEditableEvents(events).map((event, index) =>
    Object.assign({}, event, {
      sortOrder: index,
    })
  );
  const normalizedSelection = normalizeStationTimelineSelection(selection);
  if (!normalizedSelection) {
    return normalizeStationTimelineEditorEvents(baseEvents, findSceneById(state.demoLeftTabKey) || getSelectedScene());
  }
  baseEvents.push(
    {
      eventId: "",
      sortOrder: baseEvents.length,
      timeMs: normalizedSelection.startMs,
      productId: normalizedSelection.productId,
      hotspotId: normalizedSelection.hotspotId,
      eventType: "highlight_on",
      updatedAtMs: 0,
    },
    {
      eventId: "",
      sortOrder: baseEvents.length + 1,
      timeMs: normalizedSelection.endMs,
      productId: normalizedSelection.productId,
      hotspotId: normalizedSelection.hotspotId,
      eventType: "highlight_off",
      updatedAtMs: 0,
    }
  );
  return baseEvents.sort((left, right) => {
    const timeDiff = normalizeTimelineEventTimeMs(left.timeMs) - normalizeTimelineEventTimeMs(right.timeMs);
    if (timeDiff !== 0) return timeDiff;
    return String(left.hotspotId || "").localeCompare(String(right.hotspotId || ""));
  });
}

function syncStationTimelineSelectionToSlot(slotKey, selectionOverride) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  const nextSelection =
    selectionOverride === undefined
      ? getStationTimelineSelectionFromStateOnly(key)
      : normalizeStationTimelineSelection(selectionOverride);
  updateStationSlot(key, (slot) => {
    const scene = findSceneById(key) || getSelectedScene();
    const allEvents = normalizeStationTimelineEditorEvents(slot.timelineEvents, scene);
    const focusEvents = getStationTimelineEditableEvents(allEvents);
    return {
      timelineEvents: buildStationTimelineEventsWithSelection(focusEvents, nextSelection),
    };
  });
}

function deleteStationTimelineSelection(slotKey) {
  const key = String(slotKey || "").trim();
  if (!key) return;
  clearStationTimelineSelection(key);
  syncStationTimelineSelectionToSlot(key, null);
  render();
}

function applyStationTimelineSelection(slotKey) {
  const key = String(slotKey || "").trim();
  const scene = findSceneById(key) || getSelectedScene();
  const selection = getStationTimelineSelection(key);
  const targetHotspot =
    (selection && selection.hotspotId ? findStationTimelineHotspot(scene, selection.hotspotId) : null) ||
    getTimelineSelectedTargetHotspot(scene);
  if (!selection) {
    setAssetState("Select a range on the timeline first.", "warning", false, "station-timeline");
    render();
    return;
  }
  if (!targetHotspot) {
    setAssetState("Select a product hotspot before creating a highlight range.", "warning", false, "station-timeline");
    render();
    return;
  }
  setStationTimelineSelection(key, selection.startMs, selection.endMs, {
    hotspotId: String(targetHotspot.hotspot_id || "").trim(),
    productId: String(targetHotspot.product_id || "").trim(),
  });
  syncStationTimelineSelectionToSlot(key);
  render();
}

function normalizeStationTimelineEditorEvents(rawEvents, scene) {
  return (Array.isArray(rawEvents) ? rawEvents : [])
    .map((raw, index) => {
      const item = raw && typeof raw === "object" ? raw : {};
      const hotspotId = String(item.hotspotId || item.station_hotspot_id || item.hotspot_id || "").trim();
      if (!hotspotId) return null;
      const hotspot = findStationTimelineHotspot(scene, hotspotId);
      return {
        eventId: String(item.eventId || item.event_id || "").trim(),
        sortOrder: index,
        timeMs: normalizeTimelineEventTimeMs(item.timeMs != null ? item.timeMs : item.time_ms),
        productId: hotspot ? String(hotspot.product_id || "").trim() : String(item.productId || item.product_id || "").trim(),
        hotspotId,
        eventType: normalizeTimelineEventType(item.eventType != null ? item.eventType : item.event_type),
        updatedAtMs: Number(item.updatedAtMs != null ? item.updatedAtMs : item.updated_at_ms || 0),
      };
    })
    .filter(Boolean);
}

function readStationTimelineEventsFromDom(slotKey) {
  const key = normalizeDemoLeftTabKey(slotKey);
  const scene = findSceneById(key) || getSelectedScene();
  if (!refs.app) {
    const allEvents = normalizeStationTimelineEditorEvents(getStationSlotByKey(key).timelineEvents, scene);
    return buildStationTimelineEventsWithSelection(
      getStationTimelineEditableEvents(allEvents),
      getStationTimelineSelection(key)
    );
  }
  const rowNodes = Array.from(
    refs.app.querySelectorAll(".pad-station-timeline__item, .pad-ops-timeline-row")
  );
  const focusEvents = normalizeStationTimelineEditorEvents(
    rowNodes.map((node, index) => {
      const timeInput = node.querySelector('[data-action="station-timeline-time-ms"]');
      const hotspotSelect = node.querySelector('[data-action="station-timeline-hotspot"]');
      const hotspotId = String(hotspotSelect && hotspotSelect.value ? hotspotSelect.value : "").trim();
      const hotspot = findStationTimelineHotspot(scene, hotspotId);
      return {
        sortOrder: index,
        timeMs: normalizeTimelineEventTimeMs(timeInput ? timeInput.value : 0),
        hotspotId,
        productId: hotspot ? String(hotspot.product_id || "").trim() : "",
        eventType: "focus_switch",
      };
    }),
    scene
  );
  return buildStationTimelineEventsWithSelection(focusEvents, getStationTimelineSelection(key));
}

function updateStationTimelineEvents(slotKey, updater) {
  const key = normalizeDemoLeftTabKey(slotKey);
  const scene = findSceneById(key) || getSelectedScene();
  updateStationSlot(key, (slot) => {
    const prevEvents = getStationTimelineEditableEvents(normalizeStationTimelineEditorEvents(slot.timelineEvents, scene));
    const draftEvents =
      typeof updater === "function" ? updater(prevEvents.map((event) => Object.assign({}, event))) : prevEvents;
    return {
      timelineEvents: buildStationTimelineEventsWithSelection(
        normalizeStationTimelineEditorEvents(draftEvents, scene),
        getStationTimelineSelection(key)
      ),
    };
  });
}

function addStationTimelineEvent(slotKey) {
  const key = normalizeDemoLeftTabKey(slotKey);
  const scene = findSceneById(key) || getSelectedScene();
  const hotspot = getStationTimelineHotspotOptions(scene)[0] || null;
  if (!hotspot) return;
  updateStationTimelineEvents(key, (events) => {
    const lastEvent = events[events.length - 1] || null;
    return events.concat({
      eventId: "",
      sortOrder: events.length,
      timeMs: lastEvent ? normalizeTimelineEventTimeMs(lastEvent.timeMs) + 3000 : 0,
      productId: String(hotspot.product_id || "").trim(),
      hotspotId: String(hotspot.hotspot_id || "").trim(),
      eventType: "focus_switch",
      updatedAtMs: 0,
    });
  });
}

function removeStationTimelineEvent(slotKey, index) {
  const currentIndex = Number(index);
  updateStationTimelineEvents(slotKey, (events) =>
    events.filter((_, eventIndex) => eventIndex !== currentIndex)
  );
}

function moveStationTimelineEvent(slotKey, index, delta) {
  const currentIndex = Number(index);
  const moveDelta = Number(delta);
  updateStationTimelineEvents(slotKey, (events) => {
    const nextIndex = currentIndex + moveDelta;
    if (
      currentIndex < 0 ||
      currentIndex >= events.length ||
      nextIndex < 0 ||
      nextIndex >= events.length
    ) {
      return events;
    }
    const nextEvents = events.slice();
    const moved = nextEvents.splice(currentIndex, 1)[0];
    nextEvents.splice(nextIndex, 0, moved);
    return nextEvents;
  });
}

function getStationPlaybackCurrentTimeMs() {
  if (String(state.stationPlaybackSlotKey || "").trim()) {
    return getStationPlaybackCurrentGlobalMs();
  }
  const audio = refs.audio;
  if (!audio) return 0;
  const seconds = Number(audio.currentTime || 0);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.max(0, Math.round(seconds * 1000));
}

function getTimelineSelectedTargetHotspot(scene) {
  const options = getStationTimelineHotspotOptions(scene);
  if (!options.length) return null;
  const selectedHotspotId = String(state.sceneEditorActiveHotspotId || state.highlightedHotspotId || "").trim();
  if (selectedHotspotId) {
    const matched = options.find((item) => String(item.hotspot_id || "").trim() === selectedHotspotId);
    if (matched) return matched;
  }
  return options[0] || null;
}

function addStationTimelineEventFromPlayback(slotKey, eventType) {
  const key = normalizeDemoLeftTabKey(slotKey);
  const scene = findSceneById(key) || getSelectedScene();
  const targetHotspot = getTimelineSelectedTargetHotspot(scene);
  if (!targetHotspot) {
    setAssetState("请先创建并选中一个产品热区，再设置高亮时间。", "warning", false, "station-timeline");
    render();
    return;
  }
  const playbackMs = getStationPlaybackCurrentTimeMs();
  updateStationTimelineEvents(key, (events) => {
    const nextEvents = events.concat({
      eventId: "",
      sortOrder: events.length,
      timeMs: playbackMs,
      productId: String(targetHotspot.product_id || "").trim(),
      hotspotId: String(targetHotspot.hotspot_id || "").trim(),
      eventType: normalizeTimelineEventType(eventType),
      updatedAtMs: 0,
    });
    return nextEvents.sort((left, right) => {
      const timeDiff = normalizeTimelineEventTimeMs(left.timeMs) - normalizeTimelineEventTimeMs(right.timeMs);
      if (timeDiff !== 0) return timeDiff;
      return String(left.hotspotId || "").localeCompare(String(right.hotspotId || ""));
    });
  });
}

function useCurrentPlaybackTimeForTimelineEvent(slotKey, index) {
  const currentIndex = Number(index);
  const playbackMs = getStationPlaybackCurrentTimeMs();
  updateStationTimelineEvents(slotKey, (events) => {
    if (currentIndex < 0 || currentIndex >= events.length) return events;
    const nextEvents = events.slice();
    nextEvents[currentIndex] = Object.assign({}, nextEvents[currentIndex], {
      timeMs: playbackMs,
    });
    return nextEvents;
  });
}

function setDemoLeftTab(value) {
  const nextTab = normalizeDemoLeftTabKey(value);
  if (state.demoLeftTabKey === nextTab) return;
  if (String(state.stationPlaybackSlotKey || "").trim() && String(state.stationPlaybackSlotKey || "").trim() !== nextTab) {
    resetAudioPlayback();
  }
  state.demoLeftTabKey = nextTab;
  state.selectedSceneId = nextTab;
  state.sceneDialogHotspotId = "";
  state.sceneEditorActiveHotspotId = "";
  state.sceneEditorDraft = null;
  state.sceneEditorCreateMode = false;
  const nextActiveNode = getActiveNarrationNode(nextTab);
  state.activeNarrationNodeId = nextActiveNode ? String(nextActiveNode.nodeId || "") : "";
  persistStationSlotsState();
  render();
}

function setDemoRightTab(value) {
  const nextTab = normalizeDemoRightTabKey(value);
  if (state.demoRightTabKey === nextTab) return;
  if (nextTab === "product" && String(state.stationPlaybackSlotKey || "").trim()) {
    resetAudioPlayback();
  }
  if (nextTab === "station" && (String(state.playingProductId || "").trim() || String(state.pendingPlaybackProductId || "").trim())) {
    resetAudioPlayback();
  }
  state.demoRightTabKey = nextTab;
  persistStationSlotsState();
  render();
}

function setSelectedScene(sceneId) {
  const nextScene = findSceneById(sceneId) || getSelectedScene();
  state.selectedSceneId = nextScene ? String(nextScene.scene_id || "") : "";
  state.sceneDialogHotspotId = "";
  state.sceneEditorActiveHotspotId = "";
  state.sceneEditorDraft = null;
  state.sceneEditorCreateMode = false;
  render();
}

function openSceneHotspotDialog(hotspotId) {
  state.sceneDialogHotspotId = String(hotspotId || "").trim();
  render();
}

function closeSceneHotspotDialog() {
  if (!state.sceneDialogHotspotId) return;
  state.sceneDialogHotspotId = "";
  render();
}

function setSceneEditorDraft(draft) {
  const nextDraft = draft && typeof draft === "object" ? draft : null;
  state.sceneEditorDraft = nextDraft;
  state.sceneEditorActiveHotspotId = nextDraft ? String(nextDraft.hotspot_id || "") : "";
  if (nextDraft && nextDraft.hotspot_id) {
    state.sceneEditorCreateMode = false;
  }
  render();
}

function enterStationHotspotCreateMode() {
  state.sceneEditorCreateMode = true;
  state.sceneEditorDraft = null;
  state.sceneEditorActiveHotspotId = "";
  clearHotspotProductSearch();
  render();
}

function updateSceneEditorDraft(fields, options) {
  const selectedScene = getSelectedScene();
  if (!selectedScene) return null;
  const base = getSceneEditorDraftForScene(selectedScene);
  if (!base) return null;
  const opts = options && typeof options === "object" ? options : {};
  state.sceneEditorDraft = Object.assign({}, base, fields || {}, {
    scene_id: String(selectedScene.scene_id || ""),
  });
  state.sceneEditorActiveHotspotId = String(state.sceneEditorDraft.hotspot_id || "");
  if (opts.render !== false) {
    render();
  }
  return state.sceneEditorDraft;
}

function hasSceneHotspotGeometryChanged(left, right) {
  const lhs = left && typeof left === "object" ? left : {};
  const rhs = right && typeof right === "object" ? right : {};
  return (
    clampPct(lhs.x_pct) !== clampPct(rhs.x_pct) ||
    clampPct(lhs.y_pct) !== clampPct(rhs.y_pct) ||
    clampPct(lhs.width_pct) !== clampPct(rhs.width_pct) ||
    clampPct(lhs.height_pct) !== clampPct(rhs.height_pct)
  );
}

async function refreshRecordingOptions() {
  state.recordingOptionsReady = false;
  state.recordingOptionsError = "";
  render();
  try {
    const payload = await fetchJson(`/api/recordings?limit=${RECORDING_OPTIONS_LIMIT}`, state.clientId);
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    state.recordingOptions = items.map((item) => ({
      recording_id: String(item && item.recording_id ? item.recording_id : "").trim(),
      display_name: String(item && item.display_name ? item.display_name : "").trim(),
      created_at_ms: Number(item && item.created_at_ms ? item.created_at_ms : 0),
      finished_at_ms: Number(item && item.finished_at_ms ? item.finished_at_ms : 0),
      stop_count: Number(item && item.stop_count ? item.stop_count : 0),
      metadata: item && item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    }));
    state.recordingOptionsReady = true;
    render();
  } catch (error) {
    state.recordingOptions = [];
    state.recordingOptionsReady = true;
    state.recordingOptionsError = describeRequestError(error);
    render();
  }
}

async function ensureRecordingMeta(recordingId, options) {
  const rid = String(recordingId || "").trim();
  if (!rid) return null;
  const opts = options && typeof options === "object" ? options : {};
  const current = getRecordingMetaEntry(rid);
  if (!opts.force && current && current.data && !current.error) {
    return current.data;
  }
  if (!opts.force && current && current.loading) {
    if (appContext.caches.recordingMetaRequestMap[rid]) {
      try {
        return await appContext.caches.recordingMetaRequestMap[rid];
      } catch (_) {
        return null;
      }
    }
    return current.data || null;
  }
  state.recordingMetaById[rid] = {
    loading: true,
    error: "",
    data: current && current.data ? current.data : null,
  };
  render();
  const requestPromise = (async () => {
    const payload = await fetchJson(`/api/recordings/${encodeURIComponent(rid)}`, state.clientId);
    const normalized = normalizeRecordingMeta(payload);
    state.recordingMetaById[rid] = {
      loading: false,
      error: "",
      data: normalized,
    };
    const nextSlots = (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : createDefaultStationSlots()).map((slot, index) => {
      const normalizedSlot = normalizeStationSlot(slot, index);
      if (String(normalizedSlot.recordingId || "").trim() !== rid) return normalizedSlot;
      const nextStopIndex = normalizeStationStopIndex(normalizedSlot.stopIndex);
      if (nextStopIndex == null || nextStopIndex < 0 || nextStopIndex >= normalized.stops.length) {
        return Object.assign({}, normalizedSlot, { stopIndex: null, stopName: "" });
      }
      return Object.assign({}, normalizedSlot, { stopName: String(normalized.stops[nextStopIndex] || "").trim() });
    });
    state.demoStationSlots = nextSlots;
    persistStationSlotsState();
    render();
    return normalized;
  })();
  appContext.caches.recordingMetaRequestMap[rid] = requestPromise;
  try {
    return await requestPromise;
  } catch (error) {
    state.recordingMetaById[rid] = {
      loading: false,
      error: describeRequestError(error),
      data: null,
    };
    render();
    return null;
  } finally {
    if (appContext.caches.recordingMetaRequestMap[rid] === requestPromise) {
      delete appContext.caches.recordingMetaRequestMap[rid];
    }
  }
}

function preloadStationSlotRecordingMeta() {
  const uniqueRecordingIds = Array.from(
    new Set(
      (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : [])
        .flatMap((slot) => {
          const slotRecordingId = String(slot && slot.recordingId ? slot.recordingId : "").trim();
          const nodeRecordingIds = (Array.isArray(slot && slot.narrationNodes) ? slot.narrationNodes : []).map((node) =>
            String(node && node.recordingId ? node.recordingId : "").trim()
          );
          return [slotRecordingId].concat(nodeRecordingIds);
        })
        .filter(Boolean)
    )
  );
  uniqueRecordingIds.forEach((recordingId) => {
    void ensureRecordingMeta(recordingId);
  });
}

function preloadNarrationStopDurations() {
  const stopPairs = Array.from(
    new Set(
      (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : [])
        .flatMap((slot) => {
          const slotPairs = [];
          const slotRecordingId = String(slot && slot.recordingId ? slot.recordingId : "").trim();
          const slotStopIndex = normalizeStationStopIndex(slot && slot.stopIndex);
          if (slotRecordingId && slotStopIndex != null) {
            slotPairs.push(slotRecordingId + "::" + String(slotStopIndex));
          }
          (Array.isArray(slot && slot.narrationNodes) ? slot.narrationNodes : []).forEach((node) => {
            const nodeRecordingId = String(node && node.recordingId ? node.recordingId : "").trim();
            const nodeStopIndex = normalizeStationStopIndex(node && node.stopIndex);
            if (nodeRecordingId && nodeStopIndex != null) {
              slotPairs.push(nodeRecordingId + "::" + String(nodeStopIndex));
            }
          });
          return slotPairs;
        })
        .filter(Boolean)
    )
  );
  stopPairs.forEach((pairKey) => {
    const [recordingId, rawStopIndex] = String(pairKey || "").split("::");
    const stopIndex = normalizeStationStopIndex(rawStopIndex);
    if (!recordingId || stopIndex == null) return;
    void ensureNarrationStopDurationMs(recordingId, stopIndex);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(createError("indexeddb_unsupported", { kind: "unsupported" }));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "clientId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || createError("indexeddb_open_failed"));
  });
}

async function readSnapshot(clientId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const store = tx.objectStore(SNAPSHOT_STORE);
    const request = store.get(String(clientId || ""));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || createError("snapshot_read_failed"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error || createError("snapshot_read_failed"));
  });
}

async function writeSnapshot(snapshot) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_STORE).put(snapshot);
    tx.oncomplete = () => {
      db.close();
      resolve(snapshot);
    };
    tx.onerror = () => reject(tx.error || createError("snapshot_write_failed"));
  });
}
