(function () {
  const DB_NAME = "ragint-pad-db";
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = "hall_snapshots";
  const AUDIO_CACHE = "ragint-pad-audio-v1";
  const IMAGE_CACHE = "ragint-pad-image-v1";
  const PRODUCT_PLAY_COUNT_STORAGE_KEY = "ragint-pad-demo-play-counts-v1";
  const DEMO_COLUMNS_STORAGE_KEY = "ragint-pad-demo-columns-v1";
  const STATION_SLOT_STORAGE_KEY = "ragint-pad-demo-station-slots-v1";
  const REQUEST_TIMEOUT_MS = 12000;
  const DEFAULT_MODE = "demo";
  const DEFAULT_DEMO_COLUMNS = 2;
  const MIN_DEMO_COLUMNS = 1;
  const MAX_DEMO_COLUMNS = 4;
  const STATION_SLOT_KEYS = Object.freeze(["display_slot_1", "display_slot_2"]);
  const LEGACY_STATION_SLOT_KEY_MAP = Object.freeze({
    station_a: "display_slot_1",
    station_b: "display_slot_2",
  });
  const DEFAULT_DEMO_LEFT_TAB = "display_slot_1";
  const DEFAULT_DEMO_RIGHT_TAB = "product";
  const RECORDING_OPTIONS_LIMIT = 100;

  const TEXT = Object.freeze({
    loading: "正在加载当前展厅和产品列表...",
    loadFailed: "在线加载失败",
    offlineNotReady: "离线资源未就绪",
    offlineNotReadyDetail: "当前设备尚未完成本展厅的离线同步，请先在线同步一次。",
    hallBindingNotFoundDetail: "当前 clientId 尚未绑定展厅，请先在下方切换展厅。",
    backendErrorPrefix: "后端错误：",
    backendUnknownDetail: "\u540e\u7aef\u8fd4\u56de\u4e86\u672a\u9884\u671f\u7684\u72b6\u6001\u3002",
    unboundHall: "\u672a\u7ed1\u5b9a\u5c55\u5385",
    liveData: "实时数据",
    offlineSnapshot: "离线快照",
    noProducts: "\u5f53\u524d\u5c55\u5385\u6682\u65e0\u4ea7\u54c1\u3002",
    noSelection: "\u8bf7\u5148\u5728\u5de6\u4fa7\u9009\u62e9\u4e00\u4e2a\u4ea7\u54c1\u3002",
    noAudio: "\u8be5\u4ea7\u54c1\u6682\u65e0\u751f\u6548\u8bb2\u89e3\u97f3\u9891\u3002",
    audioPlayFailed: "\u4ea7\u54c1\u8bb2\u89e3\u97f3\u9891\u64ad\u653e\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4\u8d44\u6e90\u662f\u5426\u5df2\u540c\u6b65\u3002",
    audioPreparing: "\u6b63\u5728\u51c6\u5907\u64ad\u653e...",
    audioPlay: "\u64ad\u653e\u8bb2\u89e3",
    currentAudioReady: "\u97f3\u9891\u5df2\u5c31\u7eea",
    currentAudioMissing: "\u6682\u65e0\u97f3\u9891",
    introTitle: "\u4ea7\u54c1\u8bf4\u660e",
    infoTitle: "\u4ea7\u54c1\u4fe1\u606f",
    registrationName: "\u6ce8\u518c\u8bc1\u540d\u79f0",
    registrationNumber: "\u6ce8\u518c\u8bc1\u53f7",
    effectiveDate: "\u751f\u6548\u65e5\u671f",
    company: "\u6240\u5c5e\u516c\u53f8",
    emptyField: "\u672a\u586b\u5199",
    currentAudioStatusReady: "\u8bb2\u89e3\u5df2\u5c31\u7eea",
    currentAudioStatusMissing: "\u6682\u65e0\u751f\u6548\u97f3\u9891",
    currentAudioStatusFailed: "\u64ad\u653e\u5931\u8d25",
    currentAudioStatusPreparing: "\u51c6\u5907\u64ad\u653e\u4e2d",
    currentAudioStatusPlaying: "\u64ad\u653e\u4e2d",
    notSelected: "\u672a\u9009\u62e9\u4ea7\u54c1",
    heroEyebrow: "Hall Product Explainer",
    heroSubtitle: "This device binds a hall by clientId and prioritizes that hall's offline assets.",
    refreshOnline: "\u5728\u7ebf\u5237\u65b0",
    syncOffline: "\u79bb\u7ebf\u540c\u6b65",
    gotoRagint: "\u8fdb\u5165\u8bb2\u89e3\u6a21\u5f0f",
    statClientId: "\u8bbe\u5907 clientId",
    statProductCount: "\u4ea7\u54c1\u6570",
    statNetwork: "\u7f51\u7edc",
    statOffline: "\u79bb\u7ebf\u8d44\u6e90",
    online: "\u5728\u7ebf",
    offline: "\u79bb\u7ebf",
    hallListTitle: "\u5c55\u5385\u4ea7\u54c1\u5217\u8868",
    lastSyncAt: "\u6700\u8fd1\u540c\u6b65\uff1a",
    currentPlaying: "\u5f53\u524d\u64ad\u653e",
    syncPendingInit: "\u6b63\u5728\u51c6\u5907\u5c55\u5385\u8d44\u6e90",
    syncPendingOnlineLoaded: "\u5728\u7ebf\u6570\u636e\u5df2\u52a0\u8f7d\uff0c\u6b63\u5728\u51c6\u5907\u79bb\u7ebf\u5305",
    syncPendingSyncing: "\u6b63\u5728\u540c\u6b65\u5f53\u524d\u5c55\u5385\u7684\u79bb\u7ebf\u8d44\u6e90",
    syncReadyOffline: "\u5f53\u524d\u4f7f\u7528\u79bb\u7ebf\u8d44\u6e90",
    syncReadyCountPrefix: "\u79bb\u7ebf\u8d44\u6e90\u5df2\u540c\u6b65\uff08",
    syncReadyCountSuffix: " \u6761\u97f3\u9891\uff09",
    syncDangerLoadFailed: "\u5f53\u524d\u5c55\u5385\u52a0\u8f7d\u5931\u8d25",
    syncDangerOfflineNotReady: "\u79bb\u7ebf\u8d44\u6e90\u672a\u5c31\u7eea",
    syncDangerOfflineUnsupported: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u79bb\u7ebf\u7f13\u5b58",
    syncDangerOfflineInitFailed: "\u79bb\u7ebf\u7f13\u5b58\u521d\u59cb\u5316\u5931\u8d25",
    syncDangerOfflineSyncFailed: "\u79bb\u7ebf\u540c\u6b65\u5931\u8d25\uff1a",
    syncDangerOfflineUnsupportedDetail: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u79bb\u7ebf\u8d44\u6e90\uff1a",
    bannerUsingOffline: "\u5f53\u524d\u6b63\u5728\u4f7f\u7528\u672c\u5730\u79bb\u7ebf\u8d44\u6e90\u3002",
    bannerOfflineReady: "\u79bb\u7ebf\u8d44\u6e90\u5df2\u51c6\u5907\u5b8c\u6210\uff0c\u65ad\u7f51\u540e\u4ecd\u53ef\u7ee7\u7eed\u64ad\u653e\u3002",
    bannerOnlineOnly: "\u5f53\u524d\u4e3a\u5728\u7ebf\u6570\u636e\u89c6\u56fe\uff0c\u79bb\u7ebf\u8d44\u6e90\u5c1a\u672a\u5b8c\u5168\u540c\u6b65\u3002",
    quickSwitchTitle: "\u5feb\u901f\u5207\u5385",
    quickSwitchHint: "\u70b9\u51fb\u6309\u94ae\u5373\u53ef\u5207\u6362\u5f53\u524d Pad \u7684 clientId \u4e0e\u5c55\u5385\u5185\u5bb9\u3002",
    modeLabel: "\u754c\u9762\u6a21\u5f0f",
    modeDemo: "\u6f14\u793a",
    modeOps: "\u8fd0\u7ef4",
    demoEyebrow: "Exhibit Playback",
    demoSubtitle: "Tap a product item to play the active narration audio.",
    demoListTitle: "Tap a product to start narration",
    demoListHint: "Keeps only the product list and playback state needed for the on-site demo.",
    demoAudienceTitle: "Product narration",
    demoAudienceHint: "Tap a product to play narration audio.",
    demoEnterOps: "Ops",
    demoStatusPlaying: "Playing",
    demoStatusPreparing: "Preparing",
    demoStatusMissing: "No audio",
  });

  const IMAGE_TEXT = Object.freeze({
    sectionTitle: "Product images",
    upload: "Upload image",
    uploading: "Uploading image...",
    empty: "No images uploaded for this product yet.",
    uploadHint: "Supports png, jpg, jpeg, webp, gif, bmp; uploaded images will sync to offline assets.",
    syncReadySuffix: " image(s) synced",
    uploadSuccessMiddle: " product image(s) uploaded and synced.",
    uploadSuccessSyncFailed: "Images uploaded, but offline sync failed. Please retry later.",
  });
  const IMAGE_FALLBACK_NOTE = "\u5f53\u524d\u672a\u4e0a\u4f20\u4ea7\u54c1\u56fe\u7247\uff0c\u6b63\u5728\u4f7f\u7528\u9ed8\u8ba4\u5c55\u793a\u56fe\u3002";
  const FALLBACK_IMAGE_LOG_PREFIX = "[pad:fallback-image]";
  const fallbackImageLogKeys = new Set();
  const CONTROL_HOTSPOT_ACTIONS = Object.freeze({
    __control_toggle_station__: "toggle_station",
    __control_toggle_station_narration__: "toggle_station_narration",
    __control_enter_ops__: "enter_ops",
    __control_exit_app__: "exit_app",
  });
  const CONTROL_HOTSPOT_LABELS = Object.freeze({
    toggle_station: "站台切换",
    toggle_station_narration: "全站讲解",
    enter_ops: "运维",
    exit_app: "退出",
  });

  const TIMELINE_EVENT_TYPE_LABELS = Object.freeze({
    focus_switch: "切换焦点",
    highlight_on: "开启高亮",
    highlight_off: "取消高亮",
  });

  const HALL_PRESETS = Object.freeze([
    { clientId: "pad-a", hallId: "hall_01", hallName: "Cardio Implant Hall", shortLabel: "Hall 1" },
    { clientId: "pad-b", hallId: "hall_02", hallName: "Cardiac Implant Hall", shortLabel: "Hall 2" },
    { clientId: "pad-c", hallId: "hall_03", hallName: "Peripheral Implant Hall", shortLabel: "Hall 3" },
    { clientId: "pad-d", hallId: "hall_04", hallName: "Neuro Implant Hall", shortLabel: "Hall 4" },
    { clientId: "pad-e", hallId: "hall_05", hallName: "Exosome & HIFU Hall", shortLabel: "Hall 5" },
    { clientId: "pad-f", hallId: "hall_06", hallName: "Ortho & Urology Hall", shortLabel: "Hall 6" },
    { clientId: "pad-g", hallId: "hall_07", hallName: "Non-interventional Product Hall", shortLabel: "Hall 7" },
    { clientId: "pad-h", hallId: "hall_08", hallName: "Medical Standard Parts Hall", shortLabel: "Hall 8" },
  ]);

  const state = {
    mode: DEFAULT_MODE,
    clientId: "",
    display: null,
    hall: null,
    products: [],
    referencedProducts: [],
    selectedProductId: "",
    loading: true,
    errorMessage: "",
    errorDetail: "",
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    usingOfflineSnapshot: false,
    offlineReady: false,
    syncTone: "pending",
    syncMessage: TEXT.syncPendingInit,
    syncBusy: false,
    lastSyncedAtMs: 0,
    audioBusy: false,
    audioError: "",
    playingProductId: "",
    pendingPlaybackProductId: "",
    stationPlaybackBusy: false,
    stationPlaybackError: "",
    playingStationSlotKey: "",
    pendingStationSlotKey: "",
    stationPlaybackSlotKey: "",
    stationPlaybackStopName: "",
    stationPlaybackQueue: [],
    stationPlaybackNodes: [],
    stationPlaybackNodeIndex: -1,
    stationPlaybackNodeId: "",
    stationPlaybackMode: "idle",
    stationPlaybackRangeEndMs: null,
    stationPlaybackSegmentIndex: -1,
    stationPlaybackState: "idle",
    stationPlaybackCursorMs: 0,
    stationPlaybackTotalDurationMs: 0,
    stationPlaybackAnswerText: "",
    stationPlaybackTimelineEvents: [],
    stationPlaybackEndedHotspotIds: [],
    highlightedHotspotId: "",
    highlightedProductId: "",
    visibleHotspotIds: [],
    flashingHotspotIds: [],
    activeNarrationNodeId: "",
    stationTimelineSelections: Object.create(null),
    lastPlaybackRequestedUrl: "",
    assetBusy: false,
    assetAction: "",
    assetMessage: "",
    assetTone: "pending",
    audioTextDrafts: Object.create(null),
    productInfoDrafts: Object.create(null),
    displayProductPlayCounts: Object.create(null),
    productPlayCounts: Object.create(null),
    demoColumns: DEFAULT_DEMO_COLUMNS,
    opsShowDemoLayout: false,
    opsShowHallProductList: false,
    opsShowHallSwitcher: false,
    opsStationTab: "annotate",
    opsAnnotateSidebarTab: "overview",
    demoLeftTabKey: DEFAULT_DEMO_LEFT_TAB,
    demoRightTabKey: DEFAULT_DEMO_RIGHT_TAB,
    scenes: [],
    selectedSceneId: "",
    sceneDialogHotspotId: "",
    sceneEditorActiveHotspotId: "",
    sceneEditorDraft: null,
    sceneEditorCreateMode: false,
    hotspotSearchResults: [],
    hotspotSearchBusy: false,
    hotspotSearchQuery: "",
    demoStationSlots: [],
    recordingOptions: [],
    recordingOptionsReady: false,
    recordingOptionsError: "",
    recordingMetaById: Object.create(null),
    stationCatalog: [],
  };

  const refs = {
    app: document.getElementById("app"),
    audio: document.getElementById("product-audio"),
    audioStatus: document.getElementById("audio-status-text"),
  };

  let latestLoadSeq = 0;
  let latestSyncSeq = 0;
  let latestHotspotSearchSeq = 0;
  let latestStationPlaybackSeq = 0;
  let sceneEditorInteraction = null;
  let stationTimelineInteraction = null;
  let narrationNodeInteraction = null;
  let hotspotSearchComposing = false;
  let lastFlashLogicLogKey = "";
  let lastFlashRenderLogKey = "";
  const recordingMetaRequestMap = Object.create(null);
  const stationSegmentDurationCache = Object.create(null);
  const narrationStopDurationCache = Object.create(null);
  const narrationStopDurationRequestMap = Object.create(null);

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
    const cached = Number(narrationStopDurationCache[cacheKey] || 0);
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
      lastFlashLogicLogKey = "";
      return;
    }
    const nextKey = [
      String(slotKey || "").trim(),
      nodes.map((node) => String(node && node.nodeId ? node.nodeId : "").trim()).join(","),
      debugHotspots.map((item) => item.hotspotId).join(","),
    ].join("|");
    if (!nextKey || nextKey === lastFlashLogicLogKey) return;
    lastFlashLogicLogKey = nextKey;
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
      lastFlashRenderLogKey = "";
      return;
    }
    const opts = options && typeof options === "object" ? options : {};
    const nextKey = [
      sceneKey,
      String(opts.interactiveOnly ? "interactive" : "normal"),
      debugHotspots.map((item) => item.hotspotId).join(","),
    ].join("|");
    if (nextKey === lastFlashRenderLogKey) return;
    lastFlashRenderLogKey = nextKey;
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
    stationTimelineInteraction = {
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
    if (!stationTimelineInteraction) return;
    const nextMs = getTimelineTimeMsFromPointer(stationTimelineInteraction.slotKey, clientX);
    if (stationTimelineInteraction.mode === "cursor") {
      stationTimelineInteraction.currentMs = nextMs;
      setStationPlaybackCursor(stationTimelineInteraction.slotKey, nextMs, {
        pauseIfPlaying: true,
        render: false,
      });
      render();
      return;
    }
    if (stationTimelineInteraction.mode === "highlight-start" || stationTimelineInteraction.mode === "highlight-end") {
      stationTimelineInteraction.currentMs = nextMs;
      stationTimelineInteraction.moved =
        stationTimelineInteraction.moved ||
        Math.abs(nextMs - stationTimelineInteraction.anchorMs) > 20;
      const currentSelection = getStationTimelineSelection(stationTimelineInteraction.slotKey);
      if (!currentSelection) return;
      if (stationTimelineInteraction.mode === "highlight-start") {
        setStationTimelineSelection(
          stationTimelineInteraction.slotKey,
          nextMs,
          currentSelection.endMs,
          currentSelection
        );
      } else {
        setStationTimelineSelection(
          stationTimelineInteraction.slotKey,
          currentSelection.startMs,
          nextMs,
          currentSelection
        );
      }
      render();
      return;
    }
    stationTimelineInteraction.currentMs = nextMs;
    stationTimelineInteraction.moved =
      stationTimelineInteraction.moved ||
      Math.abs(nextMs - stationTimelineInteraction.anchorMs) > 40;
    const currentSelection = getStationTimelineSelection(stationTimelineInteraction.slotKey);
    setStationTimelineSelection(
      stationTimelineInteraction.slotKey,
      stationTimelineInteraction.anchorMs,
      nextMs,
      currentSelection || {}
    );
    render();
  }

  function beginStationTimelineCursorDrag(slotKey, clientX) {
    const key = String(slotKey || "").trim();
    if (!key) return;
    const currentMs = getTimelineTimeMsFromPointer(key, clientX);
    stationTimelineInteraction = {
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
    stationTimelineInteraction = {
      mode: edge === "start" ? "highlight-start" : "highlight-end",
      slotKey: key,
      anchorMs: getTimelineTimeMsFromPointer(key, clientX),
      currentMs: getTimelineTimeMsFromPointer(key, clientX),
      moved: false,
    };
    render();
  }

  function endStationTimelineSelection() {
    if (!stationTimelineInteraction) return;
    const interaction = stationTimelineInteraction;
    stationTimelineInteraction = null;
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
      if (recordingMetaRequestMap[rid]) {
        try {
          return await recordingMetaRequestMap[rid];
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
    recordingMetaRequestMap[rid] = requestPromise;
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
      if (recordingMetaRequestMap[rid] === requestPromise) {
        delete recordingMetaRequestMap[rid];
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

  function normalizeProductImages(rawImages, clientId) {
    return (Array.isArray(rawImages) ? rawImages : [])
      .map((raw) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const imageAssetId = String(item.image_asset_id || "").trim();
        const updatedAtMs = Number(item.updated_at_ms || item.created_at_ms || 0);
        const imageUrl = String(item.image_url || item.offline_image_url || "").trim();
        if (!imageAssetId || !imageUrl) return null;
        return {
          image_asset_id: imageAssetId,
          mimetype: String(item.mimetype || "").trim(),
          created_at_ms: Number(item.created_at_ms || 0),
          updated_at_ms: updatedAtMs,
          image_url: buildUrlWithClient(imageUrl, clientId, updatedAtMs),
          offline_image_url: String(item.offline_image_url || "").trim()
            ? buildUrlWithClient(item.offline_image_url, clientId, updatedAtMs)
            : "",
        };
      })
      .filter(Boolean);
  }

  function normalizeSceneHotspots(rawHotspots) {
    return (Array.isArray(rawHotspots) ? rawHotspots : [])
      .map((raw) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const hotspotId = String(item.hotspot_id || "").trim();
        const sceneId = String(item.scene_id || "").trim();
        if (!hotspotId || !sceneId) return null;
        return {
          hotspot_id: hotspotId,
          scene_id: sceneId,
          slot_key: String(item.slot_key || sceneId).trim(),
          station_id: String(item.station_id || item.station_key || sceneId).trim(),
          station_key: String(item.station_key || sceneId).trim(),
          product_id: String(item.product_id || "").trim(),
          target_type: String(item.target_type || (item.control_action ? "control" : "product")).trim() || "product",
          control_action: String(item.control_action || "").trim(),
          control_label: String(item.control_label || "").trim(),
          product_name: String(item.product_name || "").trim(),
          product_name_en: String(item.product_name_en || "").trim(),
          product_hall_id: String(item.product_hall_id || item.hall_id || "").trim(),
          product_source: String(item.product_source || "").trim(),
          has_active_audio: !!item.has_active_audio,
          audio_asset_id: String(item.audio_asset_id || "").trim(),
          audio_url: String(item.audio_url || "").trim(),
          sort_order: Number(item.sort_order || 0),
          x_pct: Number(item.x_pct || 0),
          y_pct: Number(item.y_pct || 0),
          width_pct: Number(item.width_pct || 0),
          height_pct: Number(item.height_pct || 0),
          title: String(item.title || "").trim(),
          content_text: String(item.content_text || "").trim(),
          updated_at_ms: Number(item.updated_at_ms || 0),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const orderDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(left.hotspot_id || "").localeCompare(String(right.hotspot_id || ""));
      });
  }

  function normalizeTimelineEvents(rawEvents) {
    return (Array.isArray(rawEvents) ? rawEvents : [])
      .map((raw, index) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const timeMs = normalizeTimelineEventTimeMs(item.timeMs != null ? item.timeMs : item.time_ms);
        const hotspotId = String(item.station_hotspot_id || item.hotspotId || item.hotspot_id || "").trim();
        if (!Number.isFinite(timeMs) || timeMs < 0 || !hotspotId) return null;
        const sortOrder =
          item.sortOrder != null
            ? Number(item.sortOrder)
            : item.sort_order != null
              ? Number(item.sort_order)
              : index;
        return {
          eventId: String(item.eventId || item.event_id || "").trim(),
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
          timeMs,
          productId: String(item.productId || item.product_id || "").trim(),
          hotspotId,
          eventType: normalizeTimelineEventType(item.eventType != null ? item.eventType : item.event_type),
          updatedAtMs: Number(item.updatedAtMs != null ? item.updatedAtMs : item.updated_at_ms || 0),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const orderDiff = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
        if (orderDiff !== 0) return orderDiff;
        return Number(left.timeMs || 0) - Number(right.timeMs || 0);
      });
  }

  function normalizeStations(rawStations, clientId) {
    return (Array.isArray(rawStations) ? rawStations : [])
      .map((raw, index) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const stationKey = normalizeDemoLeftTabKey(item.slot_key || item.station_key || STATION_SLOT_KEYS[index]);
        const stationId = String(item.station_id || item.station_key || "").trim();
        const updatedAtMs = Number(item.updated_at_ms || 0);
        const background = item.background && typeof item.background === "object" ? item.background : null;
        const wireframe = item.wireframe && typeof item.wireframe === "object" ? item.wireframe : null;
        const backgroundUrl = background ? String(background.image_url || background.offline_image_url || "").trim() : "";
        const wireframeUrl = wireframe ? String(wireframe.image_url || wireframe.offline_image_url || "").trim() : "";
        return {
          scene_id: stationKey,
          slot_key: stationKey,
          station_id: stationId,
          station_key: stationKey,
          hall_id: String(item.hall_id || "").trim(),
          label: String(item.label || "").trim(),
          recording_id: String(item.recording_id || "").trim(),
          stop_index: normalizeStationStopIndex(item.stop_index),
          stop_name: String(item.stop_name || "").trim(),
          name: String(item.label || "").trim() || String(item.stop_name || "").trim() || `站点 ${index + 1}`,
          sort_order: index,
          updated_at_ms: updatedAtMs,
          timeline_events: normalizeTimelineEvents(item.timeline_events),
          narration_nodes: normalizeNarrationNodes(item.narration_nodes),
          narration_nodes_error: String(item.narration_nodes_error || "").trim(),
          background: backgroundUrl
            ? {
                image_url: buildUrlWithClient(backgroundUrl, clientId, background.updated_at_ms || updatedAtMs),
                offline_image_url: String(background.offline_image_url || "").trim()
                  ? buildUrlWithClient(background.offline_image_url, clientId, background.updated_at_ms || updatedAtMs)
                  : "",
                mimetype: String(background.mimetype || "").trim(),
                width: Number(background.width || 0),
                height: Number(background.height || 0),
                updated_at_ms: Number(background.updated_at_ms || updatedAtMs || 0),
              }
            : null,
          wireframe: wireframeUrl
            ? {
                image_url: buildUrlWithClient(wireframeUrl, clientId, wireframe.updated_at_ms || updatedAtMs),
                offline_image_url: String(wireframe.offline_image_url || "").trim()
                  ? buildUrlWithClient(wireframe.offline_image_url, clientId, wireframe.updated_at_ms || updatedAtMs)
                  : "",
                mimetype: String(wireframe.mimetype || "").trim(),
                width: Number(wireframe.width || 0),
                height: Number(wireframe.height || 0),
                updated_at_ms: Number(wireframe.updated_at_ms || updatedAtMs || 0),
              }
            : null,
          hotspots: normalizeSceneHotspots(
            (Array.isArray(item.hotspots) ? item.hotspots : []).map((hotspot) =>
              Object.assign({}, hotspot || {}, {
                scene_id: stationKey,
                station_key: stationKey,
                slot_key: stationKey,
                station_id: stationId,
              })
            )
          ),
        };
      })
      .sort((left, right) => STATION_SLOT_KEYS.indexOf(left.station_key) - STATION_SLOT_KEYS.indexOf(right.station_key));
  }

  function normalizeStationsToSlots(rawStations) {
    return STATION_SLOT_KEYS.map((stationKey, index) => {
      const item =
        (Array.isArray(rawStations) ? rawStations : []).find(
          (station) => normalizeDemoLeftTabKey((station && (station.slot_key || station.station_key)) || "") === stationKey
        ) || {};
      return normalizeStationSlot(
        {
          slotKey: stationKey,
          stationId: String(item.station_id || item.station_key || "").trim(),
          label: String(item.label || "").trim(),
          recordingId: String(item.recording_id || "").trim(),
          stopIndex: item.stop_index,
          stopName: String(item.stop_name || "").trim(),
          timelineEvents: normalizeTimelineEvents(item.timeline_events),
          narrationNodes: normalizeNarrationNodes(item.narration_nodes),
          narrationNodesError: String(item.narration_nodes_error || "").trim(),
        },
        index
      );
    });
  }

  function normalizeScenes(rawScenes, clientId) {
    return (Array.isArray(rawScenes) ? rawScenes : [])
      .map((raw) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const sceneId = String(item.scene_id || "").trim();
        if (!sceneId) return null;
        const background = item.background && typeof item.background === "object" ? item.background : {};
        const updatedAtMs = Number(item.updated_at_ms || (background && background.updated_at_ms) || 0);
        const imageUrl = String(background.image_url || background.offline_image_url || "").trim();
        if (!imageUrl) return null;
        return {
          scene_id: sceneId,
          hall_id: String(item.hall_id || "").trim(),
          name: String(item.name || "").trim() || sceneId,
          sort_order: Number(item.sort_order || 0),
          updated_at_ms: updatedAtMs,
          background: {
            image_url: buildUrlWithClient(imageUrl, clientId, background.updated_at_ms || updatedAtMs),
            offline_image_url: String(background.offline_image_url || "").trim()
              ? buildUrlWithClient(background.offline_image_url, clientId, background.updated_at_ms || updatedAtMs)
              : "",
            mimetype: String(background.mimetype || "").trim(),
            width: Number(background.width || 0),
            height: Number(background.height || 0),
            updated_at_ms: Number(background.updated_at_ms || updatedAtMs || 0),
          },
          hotspots: normalizeSceneHotspots(item.hotspots),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const orderDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(left.scene_id || "").localeCompare(String(right.scene_id || ""));
      });
  }

  function findSceneById(sceneId) {
    const nextId = String(sceneId || "").trim();
    if (!nextId) return null;
    return (
      (Array.isArray(state.scenes) ? state.scenes : []).find(
        (item) => String(item && item.scene_id ? item.scene_id : "").trim() === nextId
      ) || null
    );
  }

  function getSelectedScene() {
    const list = Array.isArray(state.scenes) ? state.scenes : [];
    const selected =
      list.find((item) => String(item.scene_id || "") === String(state.demoLeftTabKey || "")) ||
      list.find((item) => String(item.scene_id || "") === String(state.selectedSceneId || ""));
    return selected || list[0] || null;
  }

  function ensureSelectedScene() {
    const selected = getSelectedScene();
    state.selectedSceneId = selected ? String(selected.scene_id || "") : "";
    if (state.sceneDialogHotspotId) {
      const hotspot =
        selected &&
        (Array.isArray(selected.hotspots) ? selected.hotspots : []).find(
          (item) => String(item && item.hotspot_id ? item.hotspot_id : "") === String(state.sceneDialogHotspotId || "")
        );
      if (!hotspot) {
        state.sceneDialogHotspotId = "";
      }
    }
  }

  function getSceneHotspotById(scene, hotspotId) {
    const targetId = String(hotspotId || "").trim();
    if (!scene || !targetId) return null;
    const draft = getSceneEditorDraftForScene(scene);
    if (draft) {
      const draftId = String(draft.hotspot_id || "").trim() || "__draft__";
      if (draftId === targetId) {
        return draft;
      }
    }
    return (
      (Array.isArray(scene.hotspots) ? scene.hotspots : []).find(
        (item) => String(item && item.hotspot_id ? item.hotspot_id : "").trim() === targetId
      ) || null
    );
  }

  function hotspotHasContent(hotspot) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    return !!(String(item.title || "").trim() || String(item.content_text || "").trim());
  }

  function getHotspotControlAction(hotspot) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    const explicitAction = String(item.control_action || "").trim();
    if (explicitAction) return explicitAction;
    return String(CONTROL_HOTSPOT_ACTIONS[String(item.product_id || "").trim()] || "").trim();
  }

  function getHotspotControlLabel(hotspot) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    const controlAction = getHotspotControlAction(item);
    if (!controlAction) return "";
    return String(item.control_label || CONTROL_HOTSPOT_LABELS[controlAction] || "").trim();
  }

  function getHotspotTargetType(hotspot) {
    return getHotspotControlAction(hotspot) ? "control" : "product";
  }

  function getHotspotProduct(hotspot) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    if (getHotspotControlAction(item) || String(item.target_type || "").trim() === "control") {
      return null;
    }
    return findProductById(item.product_id ? item.product_id : "");
  }

  function getHotspotVisualTone(hotspot) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    if (getHotspotControlAction(item)) return "control";
    if (!String(item.product_id || "").trim()) return "unbound";
    if (item.has_active_audio) return "has-audio";
    const product = getHotspotProduct(item);
    return product && product.has_active_audio ? "has-audio" : "missing-audio";
  }

  function getHotspotDisplayLabel(hotspot, index) {
    const item = hotspot && typeof hotspot === "object" ? hotspot : {};
    const resolvedControlAction = getHotspotControlAction(item);
    if (resolvedControlAction) {
      return getHotspotControlLabel(item) || "\u63a7\u5236\u6309\u94ae";
    }
    const controlAction = String(item.control_action || "").trim();
    if (controlAction) {
      return String(item.control_label || CONTROL_HOTSPOT_LABELS[controlAction] || "").trim() || "控制按钮";
    }
    const product = getHotspotProduct(hotspot);
    if (product && String(product.product_name || "").trim()) return String(product.product_name || "").trim();
    if (String(item.product_name || "").trim()) return String(item.product_name || "").trim();
    const title = String((item && item.title) || "").trim();
    if (title) return title;
    return "产品 " + String(index + 1);
  }

  function clampPct(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function mergeProducts(rawProducts, manifestItems, clientId) {
    const manifestMap = new Map();
    (Array.isArray(manifestItems) ? manifestItems : []).forEach((item) => {
      const productId = String(item && item.product_id ? item.product_id : "").trim();
      if (!productId) return;
      manifestMap.set(productId, item);
    });

    return (Array.isArray(rawProducts) ? rawProducts : [])
      .map((raw) => {
        const item = raw && typeof raw === "object" ? raw : {};
        const productId = String(item.product_id || "").trim();
        const manifestRow = manifestMap.get(productId) || null;
        const manifestAudio =
          manifestRow && manifestRow.current_audio && typeof manifestRow.current_audio === "object"
            ? manifestRow.current_audio
            : manifestRow && manifestRow.audio && typeof manifestRow.audio === "object"
              ? manifestRow.audio
              : null;
        const currentAudio = item.current_audio && typeof item.current_audio === "object" ? item.current_audio : null;
        const manifestImages = normalizeProductImages(manifestRow && manifestRow.images ? manifestRow.images : [], clientId);
        const currentImages = normalizeProductImages(item.images, clientId);
        const chosenAudio = manifestAudio || currentAudio || null;
        const chosenImages = manifestImages.length ? manifestImages : currentImages;
        return {
          product_id: productId,
          hall_id: String(item.hall_id || "").trim(),
          sort_order: Number(item.sort_order || 0),
          product_name: String(item.product_name || "").trim(),
          product_name_en: String(item.product_name_en || "").trim(),
          intro_text: String(item.intro_text || "").trim(),
          registration_name: String(item.registration_name || "").trim(),
          registration_number: String(item.registration_number || "").trim(),
          effective_date: String(item.effective_date || "").trim(),
          company: String(item.company || "").trim(),
          product_source: String(item.product_source || "").trim() || "imported",
          updated_at_ms: Number(item.updated_at_ms || 0),
          has_active_audio: !!chosenAudio,
          audio_asset_id: String(chosenAudio && chosenAudio.audio_asset_id ? chosenAudio.audio_asset_id : "").trim(),
          audio_source_type: String(chosenAudio && chosenAudio.source_type ? chosenAudio.source_type : "").trim(),
          audio_text_snapshot: String(chosenAudio && chosenAudio.text_snapshot ? chosenAudio.text_snapshot : "").trim(),
          audio_updated_at_ms: Number(chosenAudio && chosenAudio.updated_at_ms ? chosenAudio.updated_at_ms : 0),
          playback_url: chosenAudio
            ? buildUrlWithClient(chosenAudio.audio_url, clientId, chosenAudio.updated_at_ms)
            : "",
          has_images: chosenImages.length > 0,
          images: chosenImages,
          primary_image: chosenImages[0] || null,
          primary_image_url: chosenImages[0] ? String(chosenImages[0].image_url || "") : "",
        };
      })
      .sort((left, right) => {
        const orderDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return String(left.product_id || "").localeCompare(String(right.product_id || ""));
      });
  }

  function getProductPlayCountKey(product) {
    if (!product || typeof product !== "object") return "";
    const hallId = String(product.hall_id || "").trim();
    const productId = String(product.product_id || "").trim();
    if (!hallId || !productId) return "";
    return hallId + "::" + productId;
  }

  function getProductPlayCount(product) {
    const key = getProductPlayCountKey(product);
    if (!key) return 0;
    return Number(state.productPlayCounts[key] || 0);
  }

  function getDisplayProductPlayCount(product) {
    const key = getProductPlayCountKey(product);
    if (!key) return 0;
    return Number(state.displayProductPlayCounts[key] || 0);
  }

  function getDisplayProducts() {
    const list = Array.isArray(state.products) ? state.products.slice() : [];
    if (state.mode !== "demo") {
      return list;
    }
    return list.sort((left, right) => {
      const countDiff = getDisplayProductPlayCount(right) - getDisplayProductPlayCount(left);
      if (countDiff !== 0) return countDiff;
      const orderDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(left.product_id || "").localeCompare(String(right.product_id || ""));
    });
  }

  function recordProductPlay(product) {
    if (!product || !product.has_active_audio) return;
    const key = getProductPlayCountKey(product);
    if (!key) return;
    state.productPlayCounts[key] = getProductPlayCount(product) + 1;
    writeProductPlayCountsToStorage();
  }

  function getAllProducts() {
    const merged = [];
    const seen = new Set();
    const lists = [state.products, state.referencedProducts];
    lists.forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((item) => {
        const productId = String(item && item.product_id ? item.product_id : "").trim();
        if (!productId || seen.has(productId)) return;
        seen.add(productId);
        merged.push(item);
      });
    });
    return merged;
  }

  function getSelectedProduct() {
    const list = getAllProducts();
    const selected = list.find((item) => String(item.product_id || "") === String(state.selectedProductId || ""));
    return selected || (Array.isArray(state.products) && state.products[0]) || list[0] || null;
  }

  function ensureSelectedProduct() {
    const selected = getSelectedProduct();
    state.selectedProductId = selected ? String(selected.product_id || "") : "";
  }

  function findProductById(productId) {
    const nextId = String(productId || "").trim();
    if (!nextId) return null;
    return getAllProducts().find((item) => String(item && item.product_id ? item.product_id : "").trim() === nextId) || null;
  }

  function upsertReferencedProduct(product) {
    const item = product && typeof product === "object" ? product : null;
    const productId = String(item && item.product_id ? item.product_id : "").trim();
    if (!productId) return;
    if ((Array.isArray(state.products) ? state.products : []).some((entry) => String(entry.product_id || "") === productId)) {
      return;
    }
    const nextProduct = {
      product_id: productId,
      hall_id: String(item.hall_id || "").trim(),
      sort_order: Number(item.sort_order || 0),
      product_name: String(item.product_name || "").trim(),
      product_name_en: String(item.product_name_en || "").trim(),
      intro_text: String(item.intro_text || "").trim(),
      registration_name: String(item.registration_name || "").trim(),
      registration_number: String(item.registration_number || "").trim(),
      effective_date: String(item.effective_date || "").trim(),
      company: String(item.company || "").trim(),
      product_source: String(item.product_source || "").trim() || "imported",
      updated_at_ms: Number(item.updated_at_ms || 0),
      has_active_audio: !!item.has_active_audio,
      audio_asset_id: String(item.audio_asset_id || "").trim(),
      audio_source_type: String(item.audio_source_type || "").trim(),
      audio_text_snapshot: String(item.audio_text_snapshot || "").trim(),
      audio_updated_at_ms: Number(item.audio_updated_at_ms || 0),
      playback_url: String(item.playback_url || "").trim(),
      has_images: !!item.has_images,
      images: Array.isArray(item.images) ? item.images : [],
      primary_image: item.primary_image || null,
      primary_image_url: String(item.primary_image_url || "").trim(),
    };
    const current = Array.isArray(state.referencedProducts) ? state.referencedProducts.slice() : [];
    const existingIndex = current.findIndex((entry) => String(entry.product_id || "") === productId);
    if (existingIndex >= 0) {
      current.splice(existingIndex, 1, Object.assign({}, current[existingIndex], nextProduct));
    } else {
      current.push(nextProduct);
    }
    state.referencedProducts = current;
  }

  function clearHotspotProductSearch() {
    latestHotspotSearchSeq += 1;
    state.hotspotSearchBusy = false;
    state.hotspotSearchQuery = "";
    state.hotspotSearchResults = [];
  }

  async function searchStationHotspotProducts(queryText, options) {
    const query = String(queryText || "").trim();
    const opts = options && typeof options === "object" ? options : {};
    const restoreSnapshot = opts.restoreSnapshot || null;
    latestHotspotSearchSeq += 1;
    const searchSeq = latestHotspotSearchSeq;
    if (!query) {
      state.hotspotSearchBusy = false;
      state.hotspotSearchQuery = "";
      state.hotspotSearchResults = [];
      render();
      restoreHotspotSearchInputState(restoreSnapshot);
      return;
    }
    state.hotspotSearchBusy = true;
    state.hotspotSearchQuery = query;
    render();
    restoreHotspotSearchInputState(restoreSnapshot);
    try {
      const payload = await fetchJson("/api/pad/products/search?q=" + encodeURIComponent(query), state.clientId);
      if (searchSeq !== latestHotspotSearchSeq) return;
      state.hotspotSearchBusy = false;
      state.hotspotSearchResults = Array.isArray(payload && payload.items) ? payload.items : [];
      render();
      restoreHotspotSearchInputState(restoreSnapshot);
    } catch (_) {
      if (searchSeq !== latestHotspotSearchSeq) return;
      state.hotspotSearchBusy = false;
      state.hotspotSearchResults = [];
      render();
      restoreHotspotSearchInputState(restoreSnapshot);
    }
  }

  function isProductPlaying(product) {
    return !!(product && String(product.product_id || "") === String(state.playingProductId || ""));
  }

  function isProductPending(product) {
    return !!(product && String(product.product_id || "") === String(state.pendingPlaybackProductId || ""));
  }

  function isStationSlotPlaying(slot) {
    return !!(slot && String(slot.slotKey || "") === String(state.playingStationSlotKey || ""));
  }

  function isStationSlotPending(slot) {
    return !!(slot && String(slot.slotKey || "") === String(state.pendingStationSlotKey || ""));
  }

  function getStationNarrationNodes(slotKey) {
    const slot = typeof slotKey === "string" ? getStationSlotByKey(slotKey) : slotKey;
    return normalizeNarrationNodes(slot && slot.narrationNodes);
  }

  function findStationNarrationNode(slotKey, nodeId) {
    const nextNodeId = String(nodeId || "").trim();
    if (!nextNodeId) return null;
    return (
      getStationNarrationNodes(slotKey).find((node) => String(node.nodeId || "").trim() === nextNodeId) || null
    );
  }

  function getActiveNarrationNode(slotKey) {
    const nodes = getStationNarrationNodes(slotKey);
    if (!nodes.length) return null;
    const activeNodeId = String(state.activeNarrationNodeId || "").trim();
    if (activeNodeId) {
      const matched = nodes.find((node) => String(node.nodeId || "").trim() === activeNodeId);
      if (matched) return matched;
    }
    state.activeNarrationNodeId = String((nodes[0] && nodes[0].nodeId) || "");
    return nodes[0] || null;
  }

  function setActiveNarrationNode(slotKey, nodeId) {
    const node = findStationNarrationNode(slotKey, nodeId);
    state.activeNarrationNodeId = node ? String(node.nodeId || "") : "";
  }

  function createEmptyNarrationNode(slotKey) {
    const slot = getStationSlotByKey(slotKey);
    const nodes = getStationNarrationNodes(slot);
    return normalizeNarrationNode(
      {
        node_id: "narration_node_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
        sort_order: nodes.length,
        recording_id: String(slot.recordingId || "").trim(),
        stop_index: normalizeStationStopIndex(slot.stopIndex),
        stop_name: String(slot.stopName || "").trim(),
        highlight_start_ms: 0,
        highlight_end_ms: 0,
        hotspot_ids: [],
      },
      nodes.length
    );
  }

  function updateStationNarrationNodes(slotKey, updater) {
    const key = normalizeDemoLeftTabKey(slotKey);
    updateStationSlot(key, (slot) => {
      const prevNodes = getStationNarrationNodes(slot);
      const draftNodes =
        typeof updater === "function" ? updater(prevNodes.map((node) => Object.assign({}, node))) : prevNodes;
      return {
        narrationNodes: (Array.isArray(draftNodes) ? draftNodes : [])
          .map((node, index) => normalizeNarrationNode(Object.assign({}, node, { sortOrder: index }), index)),
        narrationNodesError: "",
      };
    });
    preloadNarrationStopDurations();
  }

  function addStationNarrationNode(slotKey) {
    const key = normalizeDemoLeftTabKey(slotKey);
    updateStationNarrationNodes(key, (nodes) => nodes.concat(createEmptyNarrationNode(key)));
    const nextNodes = getStationNarrationNodes(key);
    const activeNode = nextNodes[nextNodes.length - 1] || null;
    state.activeNarrationNodeId = activeNode ? String(activeNode.nodeId || "") : "";
    render();
  }

  function removeStationNarrationNode(slotKey, nodeId) {
    const key = normalizeDemoLeftTabKey(slotKey);
    updateStationNarrationNodes(key, (nodes) => nodes.filter((node) => String(node.nodeId || "") !== String(nodeId || "")));
    const nextActive = getActiveNarrationNode(key);
    state.activeNarrationNodeId = nextActive ? String(nextActive.nodeId || "") : "";
    render();
  }

  function moveStationNarrationNode(slotKey, nodeId, delta) {
    const key = normalizeDemoLeftTabKey(slotKey);
    const moveDelta = Number(delta);
    updateStationNarrationNodes(key, (nodes) => {
      const currentIndex = nodes.findIndex((node) => String(node.nodeId || "") === String(nodeId || ""));
      const nextIndex = currentIndex + moveDelta;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nodes.length) return nodes;
      const nextNodes = nodes.slice();
      const moved = nextNodes.splice(currentIndex, 1)[0];
      nextNodes.splice(nextIndex, 0, moved);
      return nextNodes;
    });
    render();
  }

  function updateStationNarrationNode(slotKey, nodeId, patch) {
    const nextPatch = patch && typeof patch === "object" ? patch : {};
    updateStationNarrationNodes(slotKey, (nodes) =>
      nodes.map((node) =>
        String(node.nodeId || "") === String(nodeId || "")
          ? normalizeNarrationNode(Object.assign({}, node, nextPatch), node.sortOrder || 0)
          : node
      )
    );
  }

  function toggleNarrationNodeHotspotBinding(slotKey, nodeId, hotspotId) {
    const nextHotspotId = String(hotspotId || "").trim();
    if (!nextHotspotId) return;
    updateStationNarrationNodes(slotKey, (nodes) =>
      nodes.map((node) => {
        if (String(node.nodeId || "") !== String(nodeId || "")) return node;
        const hasHotspot = node.hotspotIds.includes(nextHotspotId);
        return Object.assign({}, node, {
          hotspotIds: hasHotspot
            ? node.hotspotIds.filter((item) => item !== nextHotspotId)
            : node.hotspotIds.concat(nextHotspotId),
        });
      })
    );
    state.activeNarrationNodeId = String(nodeId || "");
    render();
  }

  function getNarrationNodeValidation(slotKey, node) {
    const item = node && typeof node === "object" ? node : {};
    const scene = findSceneById(slotKey) || getSelectedScene();
    const recordingId = String(item.recordingId || "").trim();
    const stopIndex = normalizeStationStopIndex(item.stopIndex);
    const hotspotIds = Array.isArray(item.hotspotIds) ? item.hotspotIds : [];
    if (!recordingId) {
      return { valid: false, tone: "warning", message: "请选择音轨存档。" };
    }
    const stops = getRecordingStops(recordingId);
    if (stopIndex == null) {
      return { valid: false, tone: "warning", message: "请选择音轨站台。" };
    }
    if (stops.length && (stopIndex < 0 || stopIndex >= stops.length)) {
      return { valid: false, tone: "danger", message: "节点音轨站台无效。" };
    }
    if (Number(item.highlightEndMs || 0) <= Number(item.highlightStartMs || 0)) {
      return { valid: false, tone: "warning", message: "请拖出有效的高亮区间。" };
    }
    if (!hotspotIds.length) {
      return { valid: false, tone: "warning", message: "请绑定至少一个高亮热区。" };
    }
    const missingHotspot = hotspotIds.find((hotspotId) => !findStationTimelineHotspot(scene, hotspotId));
    if (missingHotspot) {
      return { valid: false, tone: "danger", message: "节点绑定了不存在的热区，请重新选择。" };
    }
    return { valid: true, tone: "ready", message: "节点配置完整，可以参与全站讲解。" };
  }

  function getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX) {
    if (!refs.app) return 0;
    const track = refs.app.querySelector(
      '[data-role="narration-node-track"][data-slot-key="' +
        String(slotKey || "").trim() +
        '"][data-node-id="' +
        String(nodeId || "").trim() +
        '"]'
    );
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (Number(clientX) - rect.left) / rect.width));
    const node = findStationNarrationNode(slotKey, nodeId);
    return Math.round(getNarrationNodeVisualMaxMs(slotKey, node) * ratio);
  }

  function setNarrationNodeHighlightRange(slotKey, nodeId, startMs, endMs) {
    updateStationNarrationNode(slotKey, nodeId, {
      highlightStartMs: Math.min(normalizeTimelineEventTimeMs(startMs), normalizeTimelineEventTimeMs(endMs)),
      highlightEndMs: Math.max(normalizeTimelineEventTimeMs(startMs), normalizeTimelineEventTimeMs(endMs)),
    });
  }

  function beginNarrationNodeSelection(slotKey, nodeId, clientX) {
    narrationNodeInteraction = {
      mode: "selection",
      slotKey: String(slotKey || "").trim(),
      nodeId: String(nodeId || "").trim(),
      anchorMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
      currentMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
    };
    setActiveNarrationNode(slotKey, nodeId);
    setNarrationNodeHighlightRange(slotKey, nodeId, narrationNodeInteraction.anchorMs, narrationNodeInteraction.currentMs);
    render();
  }

  function beginNarrationNodeHandleDrag(slotKey, nodeId, edge, clientX) {
    narrationNodeInteraction = {
      mode: edge === "start" ? "highlight-start" : "highlight-end",
      slotKey: String(slotKey || "").trim(),
      nodeId: String(nodeId || "").trim(),
      anchorMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
      currentMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
    };
    setActiveNarrationNode(slotKey, nodeId);
    render();
  }

  function beginNarrationNodePlayheadDrag(slotKey, nodeId, clientX) {
    narrationNodeInteraction = {
      mode: "playhead",
      slotKey: String(slotKey || "").trim(),
      nodeId: String(nodeId || "").trim(),
      anchorMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
      currentMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
    };
    setActiveNarrationNode(slotKey, nodeId);
    render();
  }

  function updateNarrationNodeInteraction(clientX) {
    if (!narrationNodeInteraction) return;
    const nextMs = getNarrationNodeTimeMsFromPointer(
      narrationNodeInteraction.slotKey,
      narrationNodeInteraction.nodeId,
      clientX
    );
    narrationNodeInteraction.currentMs = nextMs;
    const node = findStationNarrationNode(narrationNodeInteraction.slotKey, narrationNodeInteraction.nodeId);
    if (!node) return;
    if (narrationNodeInteraction.mode === "highlight-start") {
      setNarrationNodeHighlightRange(
        narrationNodeInteraction.slotKey,
        narrationNodeInteraction.nodeId,
        nextMs,
        node.highlightEndMs
      );
    } else if (narrationNodeInteraction.mode === "highlight-end") {
      setNarrationNodeHighlightRange(
        narrationNodeInteraction.slotKey,
        narrationNodeInteraction.nodeId,
        node.highlightStartMs,
        nextMs
      );
    } else if (narrationNodeInteraction.mode === "playhead") {
      const playbackNode =
        (Array.isArray(state.stationPlaybackNodes) ? state.stationPlaybackNodes : []).find(
          (entry) => String(entry && entry.nodeId ? entry.nodeId : "").trim() === String(node.nodeId || "").trim()
        ) || null;
      if (playbackNode && String(state.stationPlaybackState || "").trim() === "playing") {
        try {
          refs.audio.pause();
        } catch (_) {}
        state.stationPlaybackState = "paused";
      }
      state.stationPlaybackCursorMs = playbackNode ? Number(playbackNode.playbackStartMs || 0) + nextMs : nextMs;
      applyStationTimelineHighlight(state.stationPlaybackCursorMs);
    } else {
      setNarrationNodeHighlightRange(
        narrationNodeInteraction.slotKey,
        narrationNodeInteraction.nodeId,
        narrationNodeInteraction.anchorMs,
        nextMs
      );
    }
    render();
  }

  function endNarrationNodeInteraction() {
    if (!narrationNodeInteraction) return;
    narrationNodeInteraction = null;
    render();
  }

  function isStationSlotConfigured(slot) {
    const item = slot && typeof slot === "object" ? slot : {};
    return getStationNarrationNodes(item).some((node) => getNarrationNodeValidation(item.slotKey, node).valid);
  }

  function getStationSlotStatus(slot) {
    const item = slot && typeof slot === "object" ? slot : getActiveStationSlot();
    const recordingId = String(item.recordingId || "").trim();
    const stopIndex = normalizeStationStopIndex(item.stopIndex);
    const metaEntry = recordingId ? getRecordingMetaEntry(recordingId) : null;
    const option = recordingId ? getRecordingOption(recordingId) : null;
    if (!recordingId) {
      return { tone: "pending", text: "请选择播放存档", playable: false };
    }
    if (metaEntry && metaEntry.loading) {
      return { tone: "pending", text: "正在加载存档信息", playable: false };
    }
    if (metaEntry && metaEntry.error) {
      return { tone: "danger", text: "存档读取失败", playable: false };
    }
    if (stopIndex == null) {
      return { tone: "warning", text: "请选择站台", playable: false };
    }
    const stops = getRecordingStops(recordingId);
    if (stops.length && (stopIndex < 0 || stopIndex >= stops.length)) {
      return { tone: "danger", text: "站台无效", playable: false };
    }
    if (!option && state.recordingOptionsReady) {
      return { tone: "danger", text: "存档不存在", playable: false };
    }
    if (isStationSlotPending(item) || isStationSlotPlaying(item)) {
      return { tone: "ready", text: "正在播放站台讲解", playable: true };
    }
    return { tone: "ready", text: "可以播放", playable: true };
  }

  function getStationSlotStatus(slot) {
    const item = slot && typeof slot === "object" ? slot : getActiveStationSlot();
    const slotKey = String(item.slotKey || "").trim();
    if (String(item.narrationNodesError || "").trim()) {
      return { tone: "danger", text: "旧时间轴数据需要人工整理", playable: false };
    }
    const nodes = getStationNarrationNodes(item);
    if (!nodes.length) {
      return { tone: "pending", text: "请先新增讲解节点", playable: false };
    }
    const invalidNode = nodes.find((node) => !getNarrationNodeValidation(slotKey, node).valid);
    if (invalidNode) {
      return { tone: "warning", text: getNarrationNodeValidation(slotKey, invalidNode).message, playable: false };
    }
    if (isStationSlotPending(item) || isStationSlotPlaying(item)) {
      return { tone: "ready", text: "正在播放全站讲解", playable: true };
    }
    return { tone: "ready", text: "可以播放全站讲解", playable: true };
  }

  function setMode(mode) {
    const nextMode = String(mode || "").trim() === "ops" ? "ops" : DEFAULT_MODE;
    if (state.mode === nextMode) return;
    resetAudioPlayback();
    state.mode = nextMode;
    state.sceneEditorCreateMode = false;
    state.sceneEditorDraft = null;
    state.sceneEditorActiveHotspotId = "";
    if (nextMode === "ops") {
      void refreshRecordingOptions();
      preloadStationSlotRecordingMeta();
    }
    render();
  }

  function toggleOpsSection(section) {
    const key = String(section || "").trim();
    if (key === "demo-layout") {
      state.opsShowDemoLayout = !state.opsShowDemoLayout;
    } else if (key === "hall-products") {
      state.opsShowHallProductList = !state.opsShowHallProductList;
    } else if (key === "hall-switcher") {
      state.opsShowHallSwitcher = !state.opsShowHallSwitcher;
    }
    render();
  }

  function normalizeOpsStationTab(value) {
    const key = String(value || "").trim();
    return key === "settings" || key === "other" ? key : "annotate";
  }

  function normalizeOpsAnnotateSidebarTab(value) {
    return String(value || "").trim() === "tools" ? "tools" : "overview";
  }

  function setOpsStationTab(value) {
    const nextTab = normalizeOpsStationTab(value);
    if (state.opsStationTab === nextTab) return;
    state.opsStationTab = nextTab;
    render();
  }

  function setOpsAnnotateSidebarTab(value) {
    const nextTab = normalizeOpsAnnotateSidebarTab(value);
    if (state.opsAnnotateSidebarTab === nextTab) return;
    state.opsAnnotateSidebarTab = nextTab;
    render();
  }

  function setDemoColumns(value) {
    const nextColumns = normalizeDemoColumns(value);
    if (state.demoColumns === nextColumns) return;
    state.demoColumns = nextColumns;
    writeDemoColumnsToStorage();
    render();
  }

  function setSyncState(message, tone, busy) {
    state.syncMessage = String(message || "");
    state.syncTone = String(tone || "pending");
    state.syncBusy = !!busy;
  }

  function setAssetState(message, tone, busy, action) {
    state.assetMessage = String(message || "");
    state.assetTone = String(tone || "pending");
    state.assetBusy = !!busy;
    state.assetAction = String(action || "");
  }

  function interruptCurrentPlayback(options) {
    const opts = options && typeof options === "object" ? options : {};
    latestStationPlaybackSeq += 1;
    stopStationTimelineSync();
    state.audioBusy = false;
    state.audioError = opts.preserveError ? state.audioError : "";
    state.playingProductId = "";
    state.pendingPlaybackProductId = "";
    state.stationPlaybackBusy = false;
    state.stationPlaybackError = opts.preserveStationError ? state.stationPlaybackError : "";
    state.stationPlaybackState = "idle";
    state.stationPlaybackCursorMs = 0;
    state.stationPlaybackTotalDurationMs = 0;
    state.playingStationSlotKey = "";
    state.pendingStationSlotKey = "";
    state.stationPlaybackSlotKey = "";
    state.stationPlaybackStopName = "";
    state.stationPlaybackQueue = [];
    state.stationPlaybackNodes = [];
    state.stationPlaybackNodeIndex = -1;
    state.stationPlaybackNodeId = "";
    state.stationPlaybackMode = "idle";
    state.stationPlaybackRangeEndMs = null;
    state.stationPlaybackSegmentIndex = -1;
    state.stationPlaybackAnswerText = "";
    state.stationPlaybackTimelineEvents = [];
    state.stationPlaybackEndedHotspotIds = [];
    state.highlightedHotspotId = "";
    state.highlightedProductId = "";
    state.visibleHotspotIds = [];
    state.flashingHotspotIds = [];
    if (!opts.preserveRequestUrl) {
      state.lastPlaybackRequestedUrl = "";
    }
    try {
      refs.audio.pause();
    } catch (_) {}
    try {
      refs.audio.currentTime = 0;
    } catch (_) {}
    if (opts.resetSource !== false) {
      try {
        refs.audio.removeAttribute("src");
        refs.audio.load();
      } catch (_) {}
    }
  }

  function getCurrentAudioText(product) {
    if (!product || typeof product !== "object") return "";
    return String(product.audio_text_snapshot || "").trim();
  }

  function getEditableProductName(product) {
    if (!product || typeof product !== "object") return "";
    const productId = String(product.product_id || "").trim();
    const draft = productId ? state.productInfoDrafts[productId] : null;
    if (draft && Object.prototype.hasOwnProperty.call(draft, "product_name")) {
      return String(draft.product_name || "");
    }
    return String(product.product_name || "").trim();
  }

  function getEditableProductIntro(product) {
    if (!product || typeof product !== "object") return "";
    const productId = String(product.product_id || "").trim();
    const draft = productId ? state.productInfoDrafts[productId] : null;
    if (draft && Object.prototype.hasOwnProperty.call(draft, "intro_text")) {
      return String(draft.intro_text || "");
    }
    return String(product.intro_text || "").trim();
  }

  function updateProductInfoDraft(productId, fields) {
    const nextId = String(productId || "").trim();
    if (!nextId) return;
    const current = state.productInfoDrafts[nextId] && typeof state.productInfoDrafts[nextId] === "object" ? state.productInfoDrafts[nextId] : {};
    state.productInfoDrafts[nextId] = Object.assign({}, current, fields || {});
  }

  function getEditableAudioText(product) {
    if (!product || typeof product !== "object") return "";
    const productId = String(product.product_id || "").trim();
    if (productId && Object.prototype.hasOwnProperty.call(state.audioTextDrafts, productId)) {
      return String(state.audioTextDrafts[productId] || "");
    }
    const currentAudioText = getCurrentAudioText(product);
    if (currentAudioText) return currentAudioText;
    return String(product.intro_text || "").trim();
  }

  function getProductImages(product) {
    return Array.isArray(product && product.images) ? product.images : [];
  }

  function buildFallbackImageDataUrl(product) {
    const productName = String((product && product.product_name) || "Product").trim() || "Product";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-label="Default product image">' +
      '<defs>' +
      '<linearGradient id="padFallbackBg" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#f6fbf7" />' +
      '<stop offset="100%" stop-color="#e2efe6" />' +
      "</linearGradient>" +
      "</defs>" +
      '<rect width="960" height="640" rx="40" fill="url(#padFallbackBg)" />' +
      '<circle cx="480" cy="228" r="92" fill="#d4e8da" />' +
      '<path d="M410 208c0-39 31-70 70-70 38 0 70 31 70 70 0 38-32 70-70 70-39 0-70-32-70-70Zm-88 170c0-55 45-100 100-100h116c55 0 100 45 100 100v20H322z" fill="#8ab89a" opacity="0.88" />' +
      '<text x="480" y="486" text-anchor="middle" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="36" font-weight="700" fill="#32513e">' +
      escapeHtml(productName) +
      "</text>" +
      '<text x="480" y="534" text-anchor="middle" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="24" fill="#567464">' +
      "\u9ed8\u8ba4\u4ea7\u54c1\u56fe" +
      "</text>" +
      "</svg>";
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function isFallbackImage(image) {
    return !!(image && image.is_fallback);
  }

  function buildFallbackProductImage(product) {
    if (!product || typeof product !== "object") return null;
    const productId = String(product.product_id || "").trim() || "__unknown__";
    if (!fallbackImageLogKeys.has(productId)) {
      fallbackImageLogKeys.add(productId);
      console.info(FALLBACK_IMAGE_LOG_PREFIX, "using default image", {
        productId: productId,
        productName: String(product.product_name || ""),
      });
    }
    return {
      image_asset_id: "__fallback__:" + productId,
      image_url: buildFallbackImageDataUrl(product),
      offline_image_url: buildFallbackImageDataUrl(product),
      mimetype: "image/svg+xml",
      is_fallback: true,
    };
  }

  function getPrimaryImage(product) {
    const images = getProductImages(product);
    return images[0] || buildFallbackProductImage(product);
  }

  function buildSyncReadyMessage(products) {
    const list = Array.isArray(products) ? products : [];
    const audioCount = list.filter((item) => item && item.playback_url).length;
    const imageCount = list.reduce((sum, item) => sum + getProductImages(item).length, 0);
    return audioCount + " 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇氱秴濠㈣埖鍔栭弲鎼佹煟濡搫妫樼憸鏃堢嵁閺嶎偄鍨濋柣鐔告緲閳峰姊洪崫鍕紞闁告瑥鍟～蹇撁洪鍛闂侀潧鐗嗛幊蹇涙倵妤ｅ啯鈷戦柤濮愬€曢弸娆徝瑰搴″婵″弶鍔欓幃娆戔偓闈涙憸閹虫繈姊洪柅鐐茶嫰婢у瓨顨ラ悙鎻掓殻闁轰焦鎹囬幃鈺呭礃閸欏鏉虹紓鍌欒兌閸嬫挸顭垮鈧棟闂侇剙绉甸崕?/ " + imageCount + IMAGE_TEXT.syncReadySuffix;
  }

  function formatAudioSourceType(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "recorded") return "\u4eba\u5de5\u5f55\u97f3";
    if (normalized === "tts") return "TTS";
    return "\u672a\u77e5";
  }

  function describeRequestError(error) {
    if (error && error.code) {
      return "\u540e\u7aef\u8fd4\u56de\u9519\u8bef\uff1a" + String(error.code);
    }
    if (error && error.message === "network_unavailable") {
      return "\u7f51\u7edc\u4e0d\u53ef\u7528\uff0c\u8bf7\u786e\u8ba4 Pad \u4e0e\u540e\u7aef\u8fde\u901a\u540e\u91cd\u8bd5\u3002";
    }
    return "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
  }

  function resetAudioPlayback() {
    interruptCurrentPlayback({
      preserveError: false,
      preserveRequestUrl: false,
      resetSource: true,
    });
  }

  function renderField(label, value) {
    return (
      '<div class="pad-detail__field">' +
      '<div class="pad-detail__field-label">' +
      escapeHtml(label) +
      "</div>" +
      '<div class="pad-detail__field-value">' +
      escapeHtml(value) +
      "</div>" +
      "</div>"
    );
  }

  function renderStatusChip() {
    const toneClass =
      state.syncTone === "ready"
        ? "pad-chip--ready"
        : state.syncTone === "danger"
          ? "pad-chip--danger"
          : state.syncTone === "warning"
            ? "pad-chip--warning"
            : "pad-chip--pending";
    return '<span class="pad-chip ' + toneClass + '">' + escapeHtml(state.syncMessage) + "</span>";
  }

  function countProductsWithActiveAudio() {
    return (Array.isArray(state.products) ? state.products : []).filter((item) => !!(item && item.has_active_audio)).length;
  }

  function renderOpsSummaryStat(label, value, dataTestId) {
    return (
      '<div class="pad-ops-stat">' +
      '<div class="pad-ops-stat__label">' +
      escapeHtml(label) +
      "</div>" +
      '<div class="pad-ops-stat__value"' +
      (dataTestId ? ' data-testid="' + escapeHtml(dataTestId) + '"' : "") +
      ">" +
      escapeHtml(value || "--") +
      "</div>" +
      "</div>"
    );
  }

  function renderOpsHallQuickSwitch() {
    return (
      '<section class="pad-panel pad-ops-hall-panel" aria-label="' +
      escapeHtml(TEXT.quickSwitchTitle) +
      '">' +
      '<div class="pad-panel__header pad-ops-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">' +
      escapeHtml(TEXT.quickSwitchTitle) +
      "</div>" +
      '<div class="pad-panel__hint">' +
      escapeHtml(TEXT.quickSwitchHint) +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-hall-panel__grid">' +
      HALL_PRESETS.map((preset, index) => {
        const active = String(preset.clientId || "") === String(state.clientId || "");
        return (
          '<button type="button" class="pad-ops-hall-btn' +
          (active ? " is-active" : "") +
          '" data-action="switch-hall" data-client-id="' +
          escapeHtml(preset.clientId) +
          '">' +
          '<span class="pad-ops-hall-btn__tag">' +
          escapeHtml(String(index + 1).padStart(2, "0")) +
          "</span>" +
          '<span class="pad-ops-hall-btn__main">' +
          escapeHtml(String(preset.clientId || "").trim()) +
          "</span>" +
          '<span class="pad-ops-hall-btn__meta">' +
          escapeHtml(String(preset.hallId || "").trim()) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>" +
      "</section>"
    );
  }

  function renderOpsHallQuickSwitchInline() {
    return (
      '<div class="pad-ops-inline-switches" aria-label="' +
      escapeHtml(TEXT.quickSwitchTitle) +
      '">' +
      HALL_PRESETS.map((preset, index) => {
        const active = String(preset.clientId || "") === String(state.clientId || "");
        return (
          '<button type="button" class="pad-ops-inline-switch' +
          (active ? " is-active" : "") +
          '" data-action="switch-hall" data-client-id="' +
          escapeHtml(preset.clientId) +
          '">' +
          '<span class="pad-ops-inline-switch__tag">' +
          escapeHtml(String(index + 1).padStart(2, "0")) +
          "</span>" +
          '<span class="pad-ops-inline-switch__label">' +
          escapeHtml(String(preset.clientId || "").trim()) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderOpsStationTabs() {
    return (
      '<div class="pad-ops-station-tabs" role="tablist" aria-label="\u7ad9\u53f0\u5207\u6362">' +
      STATION_SLOT_KEYS.map((slotKey, index) => {
        const slot = getStationSlotByKey(slotKey);
        const active = normalizeDemoLeftTabKey(state.demoLeftTabKey) === slotKey;
        return (
          '<button type="button" class="pad-ops-station-tab' +
          (active ? " is-active" : "") +
          '" data-action="set-demo-left-tab" data-tab-key="' +
          escapeHtml(slotKey) +
          '" role="tab" aria-selected="' +
          (active ? "true" : "false") +
          '">' +
          '<span class="pad-ops-station-tab__index">' +
          escapeHtml(String(index + 1).padStart(2, "0")) +
          "</span>" +
          '<span class="pad-ops-station-tab__label">' +
          escapeHtml(getStationSlotDisplayName(slot)) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderOpsStationModeTabs(extraClassName) {
    const tabs = [
      { key: "annotate", label: "\u70ed\u533a\u6807\u6ce8" },
      { key: "settings", label: "\u7ad9\u70b9\u914d\u7f6e" },
      { key: "other", label: "\u5176\u4ed6\u914d\u7f6e" },
    ];
    return (
      '<div class="pad-ops-mode-tabs' +
      (extraClassName ? " " + extraClassName : "") +
      '" role="tablist" aria-label="\u8fd0\u7ef4\u7ad9\u70b9\u529f\u80fd">' +
      tabs
        .map((tab) => {
          const active = normalizeOpsStationTab(state.opsStationTab) === tab.key;
          return (
            '<button type="button" class="pad-ops-mode-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-ops-station-tab" data-tab="' +
            escapeHtml(tab.key) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            escapeHtml(tab.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderOpsAnnotateSidebarTabs() {
    const tabs = [
      { key: "overview", label: "\u6982\u89c8\u64cd\u4f5c" },
      { key: "tools", label: "\u6807\u6ce8\u5de5\u5177" },
    ];
    return (
      '<div class="pad-ops-mode-tabs pad-ops-mode-tabs--sidebar" role="tablist" aria-label="\u53f3\u4fa7\u5de5\u5177\u680f">' +
      tabs
        .map((tab) => {
          const active = normalizeOpsAnnotateSidebarTab(state.opsAnnotateSidebarTab) === tab.key;
          return (
            '<button type="button" class="pad-ops-mode-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-ops-annotate-sidebar-tab" data-tab="' +
            escapeHtml(tab.key) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            escapeHtml(tab.label) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderOpsHotspotInspector(draft) {
    if (!draft) {
      return (
        '<section class="pad-ops-side-card pad-ops-side-card--hotspot-inspector">' +
        '<div class="pad-ops-side-card__title">\u70ed\u533a\u7ed1\u5b9a</div>' +
        '<div class="pad-panel__hint">\u5148\u5728\u4e2d\u592e\u753b\u5e03\u4e2d\u9009\u4e2d\u4e00\u4e2a\u70ed\u533a\uff0c\u6216\u70b9\u51fb\u201c\u65b0\u5efa\u70ed\u533a\u201d\u540e\u5728\u753b\u5e03\u4e0a\u62d6\u62fd\u521b\u5efa\u3002</div>' +
        "</section>"
      );
    }
    return (
      '<section class="pad-ops-side-card pad-ops-side-card--hotspot-inspector">' +
      '<div class="pad-ops-side-card__title">\u70ed\u533a\u7ed1\u5b9a</div>' +
      '<label class="pad-station-config-panel__field"><span>\u7ed1\u5b9a\u4ea7\u54c1</span><select data-action="station-hotspot-product">' +
      '<option value="">\u8bf7\u9009\u62e9\u4ea7\u54c1</option>' +
      (Array.isArray(state.products) ? state.products : [])
        .map((product) => {
          const productId = String(product && product.product_id ? product.product_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(productId) +
            '"' +
            (productId === String(draft.product_id || "") ? " selected" : "") +
            ">" +
            escapeHtml(String(product.product_name || "").trim() || productId) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>\u6392\u5e8f</span><input type="number" min="0" step="1" data-action="station-hotspot-sort-order" value="' +
      escapeHtml(String(draft.sort_order || 0)) +
      '" /></label>' +
      '<div class="pad-ops-side-card__meta">' +
      "x " +
      escapeHtml((clampPct(draft.x_pct) * 100).toFixed(1)) +
      "% / y " +
      escapeHtml((clampPct(draft.y_pct) * 100).toFixed(1)) +
      "% / w " +
      escapeHtml((clampPct(draft.width_pct) * 100).toFixed(1)) +
      "% / h " +
      escapeHtml((clampPct(draft.height_pct) * 100).toFixed(1)) +
      "%" +
      "</div>" +
      '<div class="pad-ops-inline-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-hotspot">\u4fdd\u5b58\u70ed\u533a</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="clear-station-hotspot-draft">\u53d6\u6d88</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="delete-station-hotspot"' +
      (draft.hotspot_id ? "" : " disabled") +
      ">\u5220\u9664</button>" +
      "</div>" +
      "</section>"
    );
  }

  function renderOpsHotspotTransferActions() {
    const hasActiveSlot = !!getActiveStationSlot();
    return (
      '<div class="pad-ops-inline-actions pad-ops-hotspot-transfer-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="export-station-hotspots"' +
      (hasActiveSlot ? "" : " disabled") +
      '>导出热区配置</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="import-station-hotspots"' +
      (hasActiveSlot ? "" : " disabled") +
      '>导入热区配置</button>' +
      '<input type="file" class="pad-hidden-file-input" data-action="import-station-hotspots-input" accept=".json,application/json" />' +
      "</div>"
    );
  }

  function renderOpsTimelineEventRow(slot, scene, event, index, total) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const currentIndex = Number(index);
    const hotspotOptions = getStationTimelineHotspotOptions(scene, event && event.hotspotId);
    const missingHotspot = !findStationTimelineHotspot(scene, event && event.hotspotId);
    return (
      '<div class="pad-ops-timeline-row' +
      (missingHotspot ? " is-invalid" : "") +
      '">' +
      '<div class="pad-ops-timeline-row__head">' +
      '<div>' +
      '<div class="pad-ops-timeline-row__title">\u8282\u70b9 ' +
      escapeHtml(String(currentIndex + 1)) +
      "</div>" +
      '<div class="pad-ops-timeline-row__time">' +
      escapeHtml(formatTimelineOffset(event && event.timeMs)) +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-inline-actions">' +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-move-up" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '"' +
      (currentIndex <= 0 ? " disabled" : "") +
      ">\u4e0a\u79fb</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-move-down" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '"' +
      (currentIndex >= total - 1 ? " disabled" : "") +
      ">\u4e0b\u79fb</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-remove" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '">\u5220\u9664</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-timeline-row__grid">' +
      '<label class="pad-station-config-panel__field"><span>\u89e6\u53d1\u65f6\u95f4 (ms)</span><input type="number" min="0" step="100" data-action="station-timeline-time-ms" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '" value="' +
      escapeHtml(String(normalizeTimelineEventTimeMs(event && event.timeMs))) +
      '" /></label>' +
      '<label class="pad-station-config-panel__field"><span>\u76ee\u6807\u70ed\u533a</span><select data-action="station-timeline-hotspot" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '">' +
      hotspotOptions
        .map((hotspot) => {
          const hotspotId = String(hotspot && hotspot.hotspot_id ? hotspot.hotspot_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(hotspotId) +
            '"' +
            (hotspotId === String(event && event.hotspotId ? event.hotspotId : "").trim() ? " selected" : "") +
            ">" +
            escapeHtml(getStationTimelineHotspotLabel(scene, hotspotId)) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<div class="pad-station-config-panel__field"><span>\u4e8b\u4ef6\u7c7b\u578b</span><strong>\u5207\u6362\u7126\u70b9</strong></div>' +
      "</div>" +
      '<div class="pad-ops-timeline-row__summary' +
      (missingHotspot ? " is-danger" : "") +
      '">' +
      escapeHtml(getStationTimelineEventSummary(scene, event)) +
      "</div>" +
      "</div>"
    );
  }

  function renderOpsMobileWorkspaceSwitcher() {
    const slot = getActiveStationSlot();
    const stationStatus = getStationSlotStatus(slot);
    return (
      '<section class="pad-panel pad-ops-mobile-workspace-switcher">' +
      '<div class="pad-panel__header pad-ops-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">\u5de5\u4f5c\u533a</div>' +
      '<div class="pad-panel__hint">\u5207\u6362\u70ed\u533a\u6807\u6ce8\u3001\u7ad9\u70b9\u914d\u7f6e\u3001\u5176\u4ed6\u914d\u7f6e\u65f6\uff0c\u5de5\u4f5c\u533a\u4f4d\u7f6e\u4fdd\u6301\u4e0d\u53d8\u3002</div>' +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-mobile-workspace-switcher__body">' +
      renderOpsStationModeTabs() +
      '<div class="pad-ops-station-card__status">' +
      renderToneChip(stationStatus.text, stationStatus.tone) +
      '<span class="pad-ops-station-card__status-text">' +
      escapeHtml("\u5f53\u524d\u7ad9\u70b9\uff1a" + (String(slot.stopName || "").trim() || "--")) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderOpsWorkspaceSection() {
    return (
      '<div class="pad-ops-control-overview__workspace">' +
      '<div class="pad-ops-control-overview__label">\u5de5\u4f5c\u533a</div>' +
      renderOpsStationModeTabs("pad-ops-mode-tabs--sidebar") +
      "</div>"
    );
  }

  function renderStationTimelinePlaybackControls(slot) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const currentTimeText = formatTimelineOffset(getStationPlaybackCurrentTimeMs());
    const playbackState = getStationPlaybackStateForSlot(slotKey);
    const totalDurationMs = getStationPlaybackDurationMs();
    const continueDisabled =
      playbackState !== "paused" ||
      (totalDurationMs > 0 && getStationPlaybackCurrentTimeMs() >= totalDurationMs);
    return (
      '<div class="pad-station-timeline__preview-tools" data-role="station-timeline-preview-tools">' +
      '<button type="button" class="pad-station-timeline__action" data-action="play-station-slot-from-start" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (playbackState === "playing" ? " disabled" : "") +
      ">播放</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="pause-station-playback" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (playbackState === "playing" ? "" : " disabled") +
      ">暂停</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="resume-station-playback" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (continueDisabled ? " disabled" : "") +
      '">' +
      "继续</button>" +
      '<span class="pad-station-timeline__preview-time">当前播放 ' +
      escapeHtml(currentTimeText) +
      "</span>" +
      "</div>"
    );
  }

  function renderOpsStationTimeline(slot, scene) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const timelineEvents = getStationTimelineEditableEvents(
      normalizeStationTimelineEditorEvents(slot && slot.timelineEvents, scene)
    );
    const hotspotOptions = getStationTimelineHotspotOptions(scene);
    return (
      '<section class="pad-ops-side-card pad-ops-side-card--timeline">' +
      '<div class="pad-ops-side-card__title-row">' +
      '<div class="pad-ops-side-card__title">\u8bb2\u89e3\u65f6\u95f4\u8f74</div>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="station-timeline-add" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (hotspotOptions.length ? "" : " disabled") +
      ">\u65b0\u589e\u8282\u70b9</button>" +
      "</div>" +
      (!hotspotOptions.length
        ? '<div class="pad-banner pad-banner--warning" style="margin-top:12px;">\u5f53\u524d\u7ad9\u53f0\u8fd8\u6ca1\u6709\u53ef\u7528\u70ed\u533a\uff0c\u8bf7\u5148\u5728\u753b\u5e03\u4e0a\u65b0\u5efa\u4ea7\u54c1\u70ed\u533a\u3002</div>'
        : "") +
      renderStationTimelinePlaybackControls(slot) +
      renderStationTimelineScrubber(slot, scene, timelineEvents) +
      (timelineEvents.length
        ? '<div class="pad-ops-timeline-list">' +
          timelineEvents.map((event, index) => renderOpsTimelineEventRow(slot, scene, event, index, timelineEvents.length)).join("") +
          "</div>"
        : '<div class="pad-empty" style="margin:12px 0 0;">\u5f53\u524d\u8fd8\u6ca1\u6709\u65f6\u95f4\u8f74\u8282\u70b9\u3002</div>') +
      "</section>"
    );
  }

  function renderOpsStationWorkspace() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const metaEntry = getRecordingMetaEntry(slot.recordingId);
    const stops = getRecordingStops(slot.recordingId);
    const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
    const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
    const stationStatus = getStationSlotStatus(slot);
    const stationButtonActive = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const stationButtonDisabled = !stationButtonActive && !stationStatus.playable ? " disabled" : "";
    const opsStationTab = normalizeOpsStationTab(state.opsStationTab);

    if (opsStationTab === "settings") {
      return renderStationFusionConfigPanelV3();
    }

    if (slot.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(slot.recordingId || ""))) {
      recordingOptions.unshift({
        recording_id: String(slot.recordingId || ""),
        display_name: "\u5f53\u524d\u5df2\u9009\u5f55\u97f3",
      });
    }

    const stationFields =
      '<div class="pad-ops-station-card__fields">' +
      '<label class="pad-station-config-panel__field"><span>\u771f\u5b9e\u7ad9\u4f4d</span><select data-action="station-slot-id" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      (Array.isArray(state.stationCatalog) ? state.stationCatalog : [])
        .map((item) => {
          const stationId = String(item && item.station_id ? item.station_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(stationId) +
            '"' +
            (stationId === String(slot.stationId || "") ? " selected" : "") +
            ">" +
            escapeHtml(String(item && item.label ? item.label : stationId).trim() || stationId) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>\u5c55\u793a\u540d</span><input type="text" data-action="station-slot-label" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '" value="' +
      escapeHtml(String(slot.label || "")) +
      '" /></label>' +
      '<label class="pad-station-config-panel__field"><span>\u8bb2\u89e3\u5f55\u97f3</span><select data-action="station-slot-recording" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      '<option value="">\u8bf7\u9009\u62e9\u5f55\u97f3</option>' +
      recordingOptions
        .map((item) => {
          const recordingId = String(item && item.recording_id ? item.recording_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(recordingId) +
            '"' +
            (recordingId === String(slot.recordingId || "") ? " selected" : "") +
            ">" +
            escapeHtml(formatRecordingLabel(item)) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>\u7ad9\u70b9</span><select data-action="station-slot-stop" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (!slot.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? " disabled" : "") +
      ">" +
      '<option value="">' +
      escapeHtml(metaEntry && metaEntry.loading ? "\u6b63\u5728\u52a0\u8f7d\u7ad9\u70b9..." : "\u8bf7\u9009\u62e9\u7ad9\u70b9") +
      "</option>" +
      stops
        .map((stopName, stopIndex) => {
          return (
            '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (selectedStopIndex === stopIndex ? " selected" : "") +
            ">" +
            escapeHtml(stopName) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      "</div>";

    const annotateMain =
      '<div class="pad-ops-station-card__canvas-wrap">' +
      (stationVisual
        ? renderSceneStage(stationVisual, {
            editor: true,
            showLabels: true,
            stretchToFit: true,
            className: "pad-scene-stage--ops-editor",
          })
        : '<div class="pad-empty">\u5f53\u524d\u7ad9\u70b9\u8fd8\u6ca1\u6709\u80cc\u666f\u56fe\u3002</div>') +
      "</div>";

    const settingsMain =
      '<div class="pad-ops-station-card__toolbar">' +
      '<div class="pad-ops-station-card__section-head">' +
      '<div class="pad-ops-station-card__section-title">\u7ad9\u70b9\u878d\u5408\u914d\u7f6e</div>' +
      '<div class="pad-panel__hint">\u5728\u5de6\u4fa7\u5927\u5de5\u4f5c\u533a\u5185\u7ef4\u62a4\u7ad9\u4f4d\u3001\u8bb2\u89e3\u5f55\u97f3\u3001\u80cc\u666f\u56fe\u548c\u65f6\u95f4\u8f74\u3002</div>' +
      "</div>" +
      stationFields +
      '<div class="pad-ops-inline-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-background">\u4e0a\u4f20\u80cc\u666f\u56fe</button>' +
      '<input class="pad-hidden-file-input" data-action="station-background-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      "</div>" +
      "</div>" +
      renderOpsStationTimeline(slot, stationVisual);

    const settingsSide =
      '<div class="pad-ops-station-card__side pad-ops-station-card__side--settings">' +
      '<section class="pad-ops-side-card">' +
      '<div class="pad-ops-side-card__title">\u7ad9\u70b9\u64ad\u653e</div>' +
      '<div class="pad-panel__hint">\u5728\u4e0d\u8fdb\u5165\u70ed\u533a\u6807\u6ce8\u7684\u60c5\u51b5\u4e0b\uff0c\u4ecd\u53ef\u76f4\u63a5\u9884\u89c8\u5f53\u524d\u7ad9\u70b9\u8bb2\u89e3\u3002</div>' +
      '<div class="pad-ops-station-card__status" style="margin-top:12px;">' +
      renderToneChip(stationStatus.text, stationStatus.tone) +
      '<span class="pad-ops-station-card__status-text">' +
      escapeHtml("\u5f53\u524d\u7ad9\u70b9\uff1a" + (String(slot.stopName || "").trim() || "--")) +
      "</span>" +
      "</div>" +
      '<div class="pad-ops-inline-actions" style="margin-top:12px;">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-station-slot" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      stationButtonDisabled +
      ">" +
      escapeHtml(stationButtonActive ? "\u505c\u6b62\u7ad9\u53f0\u8bb2\u89e3" : "\u64ad\u653e\u7ad9\u53f0\u8bb2\u89e3") +
      "</button>" +
      "</div>" +
      "</section>" +
      (stationVisual
        ? '<section class="pad-ops-side-card"><div class="pad-ops-side-card__title">\u9884\u89c8\u80cc\u666f</div><div class="pad-ops-station-card__preview-wrap">' +
          renderSceneStage(stationVisual, {
            editor: false,
            showLabels: false,
            stretchToFit: false,
            className: "pad-scene-stage--ops-preview",
          }) +
          "</div></section>"
        : "") +
      "</div>";

    if (opsStationTab === "settings") {
      return (
        '<section class="pad-panel pad-ops-station-card pad-ops-station-card--settings">' +
        '<div class="pad-panel__header pad-ops-panel__header">' +
        "<div>" +
        '<div class="pad-panel__title">\u7ad9\u70b9\u878d\u5408</div>' +
        '<div class="pad-panel__hint">\u7ad9\u4f4d\u3001\u5f55\u97f3\u3001\u70ed\u533a\u548c\u65f6\u95f4\u8f74\u5168\u90e8\u5728\u540c\u4e00\u5757\u5de5\u4f5c\u533a\u5185\u5b8c\u6210\u3002</div>' +
        "</div>" +
        "</div>" +
        '<div class="pad-ops-station-card__body">' +
        '<div class="pad-ops-station-card__main">' +
        settingsMain +
        "</div>" +
        settingsSide +
        "</div>" +
        (state.recordingOptionsError
          ? '<div class="pad-banner pad-banner--danger" style="margin: 0 18px 18px;">' + escapeHtml(state.recordingOptionsError) + "</div>"
          : "") +
        "</section>"
      );
    }

    return (
      '<section class="pad-panel pad-ops-station-card pad-ops-station-card--annotate pad-ops-station-card--canvas-only">' +
      '<div class="pad-ops-station-card__body">' +
      '<div class="pad-ops-station-card__main">' +
      annotateMain +
      "</div>" +
      "</div>" +
      (state.recordingOptionsError
        ? '<div class="pad-banner pad-banner--danger" style="margin: 0 18px 18px;">' + escapeHtml(state.recordingOptionsError) + "</div>"
        : "") +
      "</section>"
    );
  }

  function renderOpsAnnotateSidebar(hallName, sourceBadge, syncSummary, annotateTargetLabel) {
    const draft = state.sceneEditorDraft && typeof state.sceneEditorDraft === "object" ? state.sceneEditorDraft : null;
    const slot = getActiveStationSlot();
    const stationStatus = getStationSlotStatus(slot);
    const sidebarTab = normalizeOpsAnnotateSidebarTab(state.opsAnnotateSidebarTab);
    return (
      '<aside class="pad-ops-annotate-sidebar">' +
      '<section class="pad-panel pad-ops-annotate-overview pad-ops-annotate-overview--merged">' +
      '<div class="pad-panel__header pad-ops-panel__header">' +
      "<div>" +
      '<div class="pad-ops-topbar__eyebrow">\u8fd0\u7ef4\u5de5\u4f5c\u53f0</div>' +
      '<div class="pad-ops-annotate-overview__title-row">' +
      '<div class="pad-panel__title">' +
      escapeHtml(hallName) +
      "</div>" +
      sourceBadge +
      "</div>" +
      '<div class="pad-panel__hint">\u5c06\u9876\u90e8\u6982\u89c8\u3001\u7ad9\u4f4d\u5207\u6362\u548c\u6807\u6ce8\u64cd\u4f5c\u5408\u5e76\u5230\u53f3\u4fa7\u5de5\u5177\u680f\u3002</div>' +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-annotate-overview__body">' +
      renderOpsAnnotateSidebarTabs() +
      "</div>" +
      "</section>" +
      (sidebarTab === "overview"
        ? '<section class="pad-panel pad-ops-annotate-overview">' +
          '<div class="pad-ops-annotate-overview__body">' +
          '<div class="pad-ops-annotate-overview__meta">' +
          '<span>\u8bbe\u5907\uff1a<strong data-testid="client-id">' +
          escapeHtml(state.clientId || "--") +
          "</strong></span>" +
          '<span>\u6700\u8fd1\u540c\u6b65\uff1a<strong data-testid="last-sync-at">' +
          escapeHtml(formatTimestamp(state.lastSyncedAtMs)) +
          "</strong></span>" +
          '<span>\u79bb\u7ebf\u72b6\u6001\uff1a<strong>' +
          escapeHtml(syncSummary) +
          "</strong></span>" +
          "</div>" +
          '<div class="pad-ops-annotate-overview__stats">' +
          renderOpsSummaryStat("\u5f53\u524d\u7ad9\u4f4d", getStationSlotDisplayName(slot)) +
          renderOpsSummaryStat("\u6807\u6ce8\u5bf9\u8c61", annotateTargetLabel) +
          "</div>" +
          '<div class="pad-ops-annotate-overview__toolbar">' +
          renderModeToggle() +
          '<div class="pad-ops-inline-actions pad-ops-inline-actions--column pad-ops-annotate-overview__actions">' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="reload-live">' +
          escapeHtml(TEXT.refreshOnline) +
          "</button>" +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="sync-offline"' +
          (state.syncBusy ? " disabled" : "") +
          ">" +
          escapeHtml(TEXT.syncOffline) +
          "</button>" +
          '<a class="pad-btn pad-btn--primary" data-testid="goto-ragint" href="/ragint/?entry=tour" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">' +
          escapeHtml(TEXT.gotoRagint) +
          "</a>" +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="refresh-recordings">\u5237\u65b0\u5f55\u97f3</button>' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">\u4fdd\u5b58\u7ad9\u70b9</button>' +
          "</div>" +
          "</div>" +
          renderOpsStationTabs() +
          renderOpsHotspotTransferActions() +
          renderOpsStationModeTabs() +
          '<div class="pad-ops-station-card__status">' +
          renderToneChip(stationStatus.text, stationStatus.tone) +
          '<span class="pad-ops-station-card__status-text">' +
          escapeHtml("\u5f53\u524d\u7ad9\u70b9\uff1a" + (String(slot.stopName || "").trim() || "--")) +
          "</span>" +
          "</div>" +
          "</div>" +
          "</section>"
        : '<section class="pad-panel pad-ops-annotate-tools">' +
          '<div class="pad-panel__header pad-ops-panel__header">' +
          "<div>" +
          '<div class="pad-panel__title">\u6807\u6ce8\u5de5\u5177</div>' +
          '<div class="pad-panel__hint">\u6807\u6ce8\u76f8\u5173\u64cd\u4f5c\u96c6\u4e2d\u5728\u8fd9\u4e00\u4fa7\u3002</div>' +
          "</div>" +
          '<button type="button" class="pad-btn pad-btn--neutral' +
          (state.sceneEditorCreateMode ? " is-active" : "") +
          '" data-action="enter-station-hotspot-create" aria-pressed="' +
          (state.sceneEditorCreateMode ? "true" : "false") +
          '">' +
          escapeHtml(state.sceneEditorCreateMode ? "\u6b63\u5728\u65b0\u5efa\u70ed\u533a" : "\u65b0\u5efa\u70ed\u533a") +
          "</button>" +
          "</div>" +
          '<div class="pad-ops-annotate-tools__body">' +
          renderOpsHotspotInspector(draft) +
          "</div>" +
          "</section>") +
      "</aside>"
    );
  }

  function renderOpsControlOverviewHeader(hallName) {
    return (
      '<div class="pad-panel__header pad-ops-panel__header pad-ops-control-overview__header">' +
      '<div class="pad-ops-control-overview__header-main">' +
      '<div class="pad-ops-topbar__eyebrow">\u8fd0\u7ef4\u5de5\u4f5c\u53f0</div>' +
      '<div class="pad-ops-control-overview__title-row">' +
      '<div class="pad-panel__title">' +
      escapeHtml(hallName) +
      "</div>" +
      "</div>" +
      renderOpsWorkspaceSection() +
      "</div>" +
      renderOpsDemoEntryButton() +
      "</div>"
    );
  }

  function renderOpsControlOverviewBody(syncSummary, productCount, audioReadyCount) {
    const slot = getActiveStationSlot();
    const selectedProduct = getSelectedProduct();
    const stationStatus = getStationSlotStatus(slot);
    return (
      '<div class="pad-ops-control-overview__body">' +
      '<div class="pad-ops-control-overview__meta">' +
      '<span>\u8bbe\u5907\uff1a<strong data-testid="client-id">' +
      escapeHtml(state.clientId || "--") +
      "</strong></span>" +
      '<span>\u6700\u8fd1\u540c\u6b65\uff1a<strong data-testid="last-sync-at">' +
      escapeHtml(formatTimestamp(state.lastSyncedAtMs)) +
      "</strong></span>" +
      '<span>\u79bb\u7ebf\u72b6\u6001\uff1a<strong>' +
      escapeHtml(syncSummary) +
      "</strong></span>" +
      "</div>" +
      '<div class="pad-ops-control-overview__stats">' +
      renderOpsSummaryStat(TEXT.statProductCount, String(productCount), "product-count") +
      renderOpsSummaryStat("\u6709\u97f3\u9891", String(audioReadyCount)) +
      renderOpsSummaryStat("\u5f53\u524d\u7ad9\u4f4d", getStationSlotDisplayName(slot)) +
      renderOpsSummaryStat("\u5f53\u524d\u4ea7\u54c1", selectedProduct ? String(selectedProduct.product_name || "") : TEXT.notSelected) +
      "</div>" +
      '<div class="pad-ops-control-overview__toolbar">' +
      '<div class="pad-ops-inline-actions pad-ops-inline-actions--column pad-ops-control-overview__actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="reload-live">' +
      escapeHtml(TEXT.refreshOnline) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="sync-offline"' +
      (state.syncBusy ? " disabled" : "") +
      ">" +
      escapeHtml(TEXT.syncOffline) +
      "</button>" +
      '<a class="pad-btn pad-btn--primary" data-testid="goto-ragint" href="/ragint/?entry=tour" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">' +
      escapeHtml(TEXT.gotoRagint) +
      "</a>" +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="refresh-recordings">\u5237\u65b0\u5f55\u97f3</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">\u4fdd\u5b58\u7ad9\u70b9</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-control-overview__section">' +
      '<div class="pad-ops-control-overview__label">' +
      escapeHtml(TEXT.quickSwitchTitle) +
      "</div>" +
      renderOpsHallQuickSwitchInline() +
      "</div>" +
      '<div class="pad-ops-control-overview__section">' +
      '<div class="pad-ops-control-overview__label">\u7ad9\u4f4d\u5207\u6362</div>' +
      renderOpsStationTabs() +
      "</div>" +
      '<div class="pad-ops-station-card__status">' +
      renderToneChip(stationStatus.text, stationStatus.tone) +
      '<span class="pad-ops-station-card__status-text">' +
      escapeHtml("\u5f53\u524d\u7ad9\u70b9\uff1a" + (String(slot.stopName || "").trim() || "--")) +
      "</span>" +
      "</div>" +
      "</div>"
    );
  }

  function renderOpsControlOverviewPanel(hallName, syncSummary, productCount, audioReadyCount, extraClassName) {
    return (
      '<section class="pad-panel pad-ops-control-overview' +
      (extraClassName ? " " + extraClassName : "") +
      '">' +
      renderOpsControlOverviewHeader(hallName) +
      renderOpsControlOverviewBody(syncSummary, productCount, audioReadyCount) +
      "</section>"
    );
  }

  function renderOpsControlOverviewBodyPanel(syncSummary, productCount, audioReadyCount, extraClassName) {
    return (
      '<section class="pad-panel pad-ops-control-overview' +
      (extraClassName ? " " + extraClassName : "") +
      '">' +
      renderOpsControlOverviewBody(syncSummary, productCount, audioReadyCount) +
      "</section>"
    );
  }

  function renderOpsOtherConfigWorkspace(hallName, embeddedControlPanelHtml) {
    return (
      '<section class="pad-ops-other-workspace pad-ops-other-workspace--with-control">' +
      '<section class="pad-panel pad-ops-product-panel">' +
      '<div class="pad-panel__header pad-ops-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">' +
      escapeHtml(TEXT.hallListTitle) +
      "</div>" +
      '<div class="pad-panel__hint" data-testid="hall-name">' +
      escapeHtml(hallName) +
      "</div>" +
      "</div>" +
      '<div class="pad-panel__hint">\u9009\u4e2d\u4ea7\u54c1\u540e\uff0c\u53f3\u4fa7\u7acb\u5373\u53ef\u7f16\u8f91\u8bb2\u89e3\u4e0e\u4ea7\u54c1\u4fe1\u606f\u3002</div>' +
      "</div>" +
      renderProductCards() +
      "</section>" +
      '<section class="pad-panel pad-ops-detail-panel">' +
      renderDetailPanel() +
      "</section>" +
      (embeddedControlPanelHtml || "") +
      "</section>"
    );
  }

  function renderOpsControlSidebar(hallName, syncSummary, annotateTargetLabel, productCount, audioReadyCount) {
    const draft = state.sceneEditorDraft && typeof state.sceneEditorDraft === "object" ? state.sceneEditorDraft : null;
    const opsStationTab = normalizeOpsStationTab(state.opsStationTab);
    return (
      '<aside class="pad-ops-control-sidebar">' +
      renderOpsControlOverviewPanel(
        hallName,
        syncSummary,
        productCount,
        audioReadyCount,
        "pad-ops-control-overview--sidebar pad-ops-control-overview--body-relocated"
      ) +
      (opsStationTab === "annotate"
        ? '<section class="pad-panel pad-ops-annotate-tools">' +
          '<div class="pad-panel__header pad-ops-panel__header">' +
          "<div>" +
          '<div class="pad-panel__title">\u70ed\u533a\u6807\u6ce8\u5de5\u5177</div>' +
          '<div class="pad-panel__hint">\u5f53\u524d\u6807\u6ce8\u5bf9\u8c61\uff1a' +
          escapeHtml(annotateTargetLabel) +
          "\u3002</div>" +
          "</div>" +
          '<button type="button" class="pad-btn pad-btn--neutral' +
          (state.sceneEditorCreateMode ? " is-active" : "") +
          '" data-action="enter-station-hotspot-create" aria-pressed="' +
          (state.sceneEditorCreateMode ? "true" : "false") +
          '">' +
          escapeHtml(state.sceneEditorCreateMode ? "\u6b63\u5728\u65b0\u5efa\u70ed\u533a" : "\u65b0\u5efa\u70ed\u533a") +
          "</button>" +
          "</div>" +
          '<div class="pad-ops-annotate-tools__body">' +
          renderOpsHotspotTransferActions() +
          renderOpsHotspotInspector(draft) +
          "</div>" +
          "</section>"
        : "") +
      "</aside>"
    );
  }

  function renderOpsShellV4(hallName, productCount, snapshotBadge) {
    const audioReadyCount = countProductsWithActiveAudio();
    const opsStationTab = normalizeOpsStationTab(state.opsStationTab);
    const draft = state.sceneEditorDraft && typeof state.sceneEditorDraft === "object" ? state.sceneEditorDraft : null;
    const draftProduct = draft ? findProductById(draft.product_id) : null;
    const annotateTargetLabel = state.sceneEditorCreateMode
      ? "\u65b0\u5efa\u70ed\u533a"
      : draft
        ? String((draftProduct && draftProduct.product_name) || draft.product_search_text || draft.hotspot_id || "\u672a\u9009\u4e2d").trim() || "\u672a\u9009\u4e2d"
        : "\u672a\u9009\u4e2d";
    const syncSummary =
      state.syncTone === "danger"
        ? "\u9700\u5904\u7406"
        : state.syncBusy
          ? "\u540c\u6b65\u4e2d"
          : state.offlineReady || state.usingOfflineSnapshot
            ? "\u5df2\u540c\u6b65"
            : "\u5f85\u540c\u6b65";
    const embeddedOtherControlPanel =
      opsStationTab === "other"
        ? renderOpsControlOverviewBodyPanel(syncSummary, productCount, audioReadyCount, "pad-ops-other-control-panel")
        : "";
    const mainWorkspace =
      opsStationTab === "other"
        ? renderOpsOtherConfigWorkspace(hallName, embeddedOtherControlPanel)
        : renderOpsStationWorkspace();
    return (
      '<main class="pad-shell pad-shell--ops">' +
      renderOpsMobileWorkspaceSwitcher() +
      '<section class="pad-ops-unified-shell' +
      (opsStationTab === "other" ? " pad-ops-unified-shell--other" : "") +
      '">' +
      '<section class="pad-ops-workpane">' +
      mainWorkspace +
      "</section>" +
      renderOpsControlSidebar(hallName, syncSummary, annotateTargetLabel, productCount, audioReadyCount) +
      "</section>" +
      "</main>"
    );
  }

  function renderHallSwitcher() {
    return (
      '<section class="pad-hall-switcher" aria-label="' +
      escapeHtml(TEXT.quickSwitchTitle) +
      '">' +
      '<div class="pad-hall-switcher__header">' +
      '<div class="pad-hall-switcher__title">' +
      escapeHtml(TEXT.quickSwitchTitle) +
      "</div>" +
      '<div class="pad-hall-switcher__hint">' +
      escapeHtml(TEXT.quickSwitchHint) +
      "</div>" +
      "</div>" +
      '<div class="pad-hall-switcher__grid">' +
      HALL_PRESETS.map((preset) => {
        const active = String(preset.clientId || "") === String(state.clientId || "");
        return (
          '<button type="button" class="pad-hall-switcher__btn' +
          (active ? " is-active" : "") +
          '" data-action="switch-hall" data-client-id="' +
          escapeHtml(preset.clientId) +
          '">' +
          '<span class="pad-hall-switcher__btn-tag">' +
          escapeHtml(preset.shortLabel) +
          "</span>" +
          '<span class="pad-hall-switcher__btn-name">' +
          escapeHtml(preset.hallName) +
          "</span>" +
          '<span class="pad-hall-switcher__btn-id">' +
          escapeHtml(preset.clientId) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>" +
      "</section>"
    );
  }

  function renderOpsDemoEntryButton() {
    return (
      '<button type="button" class="pad-btn pad-btn--neutral pad-ops-control-overview__demo-entry' +
      (state.mode === "demo" ? " is-active" : "") +
      '" data-action="set-mode" data-mode="demo" data-testid="mode-toggle-demo" aria-pressed="' +
      (state.mode === "demo" ? "true" : "false") +
      '">' +
      escapeHtml(TEXT.modeDemo) +
      "</button>"
    );
  }

  function renderModeToggle(options) {
    const opts = options && typeof options === "object" ? options : {};
    const modeKeys = Array.isArray(opts.modes) && opts.modes.length ? opts.modes : ["demo", "ops"];
    const extraClassName = String(opts.extraClassName || "").trim();
    return (
      '<div class="pad-mode-toggle' +
      (extraClassName ? " " + extraClassName : "") +
      '" role="group" aria-label="' +
      escapeHtml(TEXT.modeLabel) +
      '">' +
      modeKeys
        .map((modeKey) => {
          const normalizedMode = String(modeKey || "").trim() === "ops" ? "ops" : "demo";
          const isActive = state.mode === normalizedMode;
          return (
            '<button type="button" class="pad-mode-toggle__btn' +
            (isActive ? " is-active" : "") +
            '" data-action="set-mode" data-mode="' +
            normalizedMode +
            '" data-testid="mode-toggle-' +
            normalizedMode +
            '" aria-pressed="' +
            (isActive ? "true" : "false") +
            '">' +
            escapeHtml(normalizedMode === "ops" ? TEXT.modeOps : TEXT.modeDemo) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderToneChip(text, tone) {
    const toneClass =
      tone === "danger"
        ? "pad-chip--danger"
        : tone === "warning"
          ? "pad-chip--warning"
          : tone === "ready"
            ? "pad-chip--ready"
            : "pad-chip--pending";
    return '<span class="pad-chip ' + toneClass + '">' + escapeHtml(text) + "</span>";
  }

  function renderStationHotspotSearchField(draft) {
    const item = draft && typeof draft === "object" ? draft : {};
    const searchText = String(item.product_search_text || "").trim();
    const selectedProduct = findProductById(item.product_id);
    const suggestions = Array.isArray(state.hotspotSearchResults) ? state.hotspotSearchResults : [];
    const isSearching = state.hotspotSearchBusy && searchText && searchText === String(state.hotspotSearchQuery || "").trim();
    const selectionHint = selectedProduct
      ? '<div class="pad-hotspot-search__selection">' +
          '<span class="pad-hotspot-search__selection-name">' +
          escapeHtml(String(selectedProduct.product_name || "").trim() || String(selectedProduct.product_id || "")) +
          "</span>" +
          renderToneChip(selectedProduct.has_active_audio ? "\u6709\u97f3\u9891" : "\u65e0\u97f3\u9891", selectedProduct.has_active_audio ? "ready" : "danger") +
          '<span class="pad-hotspot-search__selection-hall">' +
          escapeHtml(String(selectedProduct.hall_id || "").trim()) +
          "</span>" +
        "</div>"
      : "";
    const searchStatus = isSearching
      ? '<div class="pad-hotspot-search__status">\u6b63\u5728\u641c\u7d22\u4ea7\u54c1...</div>'
      : searchText && !selectedProduct && !suggestions.length
        ? '<div class="pad-hotspot-search__status">\u672a\u627e\u5230\u73b0\u6709\u4ea7\u54c1\uff0c\u4fdd\u5b58\u65f6\u5c06\u521b\u5efa\u5360\u4f4d\u4ea7\u54c1\u3002</div>'
        : "";
    const results = searchText && suggestions.length
      ? '<div class="pad-hotspot-search__results">' +
          suggestions
            .map((product) => {
              const productId = String(product && product.product_id ? product.product_id : "").trim();
              const productName = String(product && product.product_name ? product.product_name : "").trim() || productId;
              const hallId = String(product && product.hall_id ? product.hall_id : "").trim();
              const hasAudio = !!(product && product.has_active_audio);
              return (
                '<button type="button" class="pad-hotspot-search__result" data-action="station-hotspot-pick" data-product-id="' +
                escapeHtml(productId) +
                '">' +
                '<span class="pad-hotspot-search__result-main">' +
                '<span class="pad-hotspot-search__result-name">' +
                escapeHtml(productName) +
                "</span>" +
                '<span class="pad-hotspot-search__result-meta">' +
                escapeHtml(hallId) +
                (hasAudio ? " / \u6709\u97f3\u9891" : " / \u65e0\u97f3\u9891") +
                "</span>" +
                "</span>" +
                "</button>"
              );
            })
            .join("") +
        "</div>"
      : "";
    return (
      '<label class="pad-station-config-panel__field"><span>\u7ed1\u5b9a\u4ea7\u54c1</span><input type="text" data-action="station-hotspot-product-search" value="' +
      escapeHtml(searchText) +
      '" placeholder="\u53ef\u7559\u7a7a\uff0c\u6216\u8f93\u5165\u4ea7\u54c1\u540d\u79f0\u641c\u7d22" /></label>' +
      '<div class="pad-detail__hint">\u641c\u7d22\u8303\u56f4\u662f\u5168\u90e8\u4ea7\u54c1\uff1b\u672a\u547d\u4e2d\u65f6\uff0c\u4fdd\u5b58\u540e\u4f1a\u521b\u5efa\u5360\u4f4d\u4ea7\u54c1\u3002</div>' +
      selectionHint +
      searchStatus +
      results
    );
  }

  function hydrateStationHotspotSearchField(selectEl) {
    const selectElement = selectEl || null;
    if (!selectElement) return null;
    const fieldLabel = selectElement.closest("label");
    if (!fieldLabel || !fieldLabel.parentNode) return null;
    fieldLabel.style.display = "none";
    const host = document.createElement("div");
    host.setAttribute("data-role", "station-hotspot-search-host");
    host.innerHTML = renderStationHotspotSearchField(getSceneEditorDraftForScene(getSelectedScene()));
    fieldLabel.parentNode.insertBefore(host, fieldLabel);
    return host;
  }

  function captureHotspotSearchInputState(inputEl) {
    const input = inputEl || null;
    if (!input) return null;
    return {
      value: String(input.value || ""),
      selectionStart: typeof input.selectionStart === "number" ? input.selectionStart : null,
      selectionEnd: typeof input.selectionEnd === "number" ? input.selectionEnd : null,
      scrollX: typeof window.scrollX === "number" ? window.scrollX : 0,
      scrollY: typeof window.scrollY === "number" ? window.scrollY : 0,
    };
  }

  function restoreHotspotSearchInputState(snapshot) {
    const saved = snapshot && typeof snapshot === "object" ? snapshot : null;
    if (!saved) return;
    const input = refs.app.querySelector('[data-action="station-hotspot-product-search"]');
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      try {
        input.focus();
      } catch (_) {}
    }
    if (saved.selectionStart != null && saved.selectionEnd != null && typeof input.setSelectionRange === "function") {
      try {
        input.setSelectionRange(saved.selectionStart, saved.selectionEnd);
      } catch (_) {}
    }
    try {
      window.scrollTo(Number(saved.scrollX || 0), Number(saved.scrollY || 0));
    } catch (_) {}
  }

  function hydrateStationTimelinePreviewControls() {
    const slot = getActiveStationSlot();
    const scene = getSelectedScene();
    const timelineRoot = refs.app.querySelector(".pad-station-timeline");
    const timelineHeader = refs.app.querySelector(".pad-station-timeline__header");
    if (!timelineRoot || !timelineHeader || !slot) return;

    let headerTools = timelineRoot.querySelector('[data-role="station-timeline-preview-tools"]');
    const currentTimeText = formatTimelineOffset(getStationPlaybackCurrentTimeMs());
    const playbackState = getStationPlaybackStateForSlot(slot.slotKey);
    const totalDurationMs = getStationPlaybackDurationMs();
    const continueDisabled =
      playbackState !== "paused" ||
      (totalDurationMs > 0 && getStationPlaybackCurrentTimeMs() >= totalDurationMs);
    if (!headerTools) {
      headerTools = document.createElement("div");
      headerTools.setAttribute("data-role", "station-timeline-preview-tools");
      headerTools.className = "pad-station-timeline__preview-tools";
      timelineHeader.appendChild(headerTools);
    }
    headerTools.innerHTML =
      '<button type="button" class="pad-station-timeline__action" data-action="play-station-slot-from-start" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (playbackState === "playing" ? " disabled" : "") +
      '>播放</button>' +
      '<button type="button" class="pad-station-timeline__action" data-action="pause-station-playback" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (playbackState === "playing" ? "" : " disabled") +
      '>暂停</button>' +
      '<button type="button" class="pad-station-timeline__action" data-action="resume-station-playback" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (continueDisabled ? " disabled" : "") +
      '">' +
      '继续</button>' +
      '<span class="pad-station-timeline__preview-time">当前播放 ' +
      escapeHtml(currentTimeText) +
      "</span>";

    refs.app.querySelectorAll('.pad-station-timeline__item, .pad-ops-timeline-row').forEach((itemNode) => {
      const actions = itemNode.querySelector(".pad-station-timeline__actions");
      const removeButton = itemNode.querySelector('[data-action="station-timeline-remove"]');
      if (!actions || !removeButton || actions.querySelector('[data-action="station-timeline-use-current-time"]')) return;
      const useCurrentButton = document.createElement("button");
      useCurrentButton.type = "button";
      useCurrentButton.className = "pad-station-timeline__action";
      useCurrentButton.setAttribute("data-action", "station-timeline-use-current-time");
      useCurrentButton.setAttribute("data-slot-key", String(removeButton.getAttribute("data-slot-key") || ""));
      useCurrentButton.setAttribute("data-index", String(removeButton.getAttribute("data-index") || ""));
      useCurrentButton.textContent = "取当前播放时间";
      actions.appendChild(useCurrentButton);
    });
  }

  function renderDemoStationTabs() {
    return (
      '<div class="pad-demo-station-tabs" role="tablist" aria-label="缂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸婂潡鏌ㄩ弴妤€浜惧銈庡亜缁绘濡甸幇鏉跨闁规儳鍘栭悽濠氭⒒娓氣偓濞佳囁囬銏犵濠电姴鍟伴々鏌ユ煕閿旇骞樻俊顐灦閺岀喖顢涢崱妤勫闁告挻濞婂鍝勑ч崶褉鍋撻幇鏉跨；闁瑰墽绻濈换鍡涙煟閹板吀绨婚柍褜鍓氶悧鐘茬暦濠靛妲鹃悗鍨緲閿曨亪骞冮幆褏鏆嗛柍褜鍓熼幆宀勫醇閵忊€虫瀾闂佺粯顨呴悧鍡欑箔濮樿埖鐓熼柟鎯х摠缁€瀣煟閹垮啫浜扮€规洘鍎奸¨渚€鏌涙惔锛勭闁哄本鐩顕€鍩€椤掆偓椤繈濡搁埡浣虹枀?>' +
      STATION_SLOT_KEYS.map((slotKey, index) => {
        const slot = getStationSlotByKey(slotKey);
        const active = normalizeDemoLeftTabKey(state.demoLeftTabKey) === slotKey;
        return (
          '<button type="button" class="pad-demo-station-tab' +
          (active ? " is-active" : "") +
          '" data-action="set-demo-left-tab" data-tab-key="' +
          escapeHtml(slotKey) +
          '" role="tab" aria-selected="' +
          (active ? "true" : "false") +
          '">' +
          '<span class="pad-demo-station-tab__label">' +
          escapeHtml(getStationSlotDisplayName(slot)) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function getAlternateStationSlotKey(slotKey) {
    const key = normalizeDemoLeftTabKey(slotKey);
    return key === "display_slot_1" ? "display_slot_2" : "display_slot_1";
  }

  function renderDemoAudienceControls() {
    const slot = getActiveStationSlot();
    const stationStatus = getStationSlotStatus(slot);
    const stationButtonActive = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const stationButtonDisabled = !stationButtonActive && !stationStatus.playable ? " disabled" : "";
    return (
      '<div class="pad-demo-audience-controls">' +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-audience-btn" data-action="toggle-demo-station">' +
      "站台切换" +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-audience-btn" data-action="play-station-slot" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      stationButtonDisabled +
      ">" +
      escapeHtml(stationButtonActive ? "停止全站讲解" : "全站讲解") +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-audience-btn" data-action="set-mode" data-mode="ops" data-testid="mode-enter-ops">' +
      "运维" +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-audience-btn" data-action="request-exit">' +
      "退出" +
      "</button>" +
      "</div>"
    );
  }

  function requestExit() {
    const confirmed = typeof window.confirm === "function" ? window.confirm("确认退出程序？") : false;
    if (!confirmed) return;
    try {
      window.__ragint_exit_requested = true;
    } catch (_) {}
    if (typeof window.close === "function") {
      window.close();
    }
  }

  function toggleActiveStationSlot() {
    const nextSlotKey = getAlternateStationSlotKey(state.demoLeftTabKey);
    resetAudioPlayback();
    setDemoLeftTab(nextSlotKey);
  }

  function renderDemoStationSummary() {
    const slot = getActiveStationSlot();
    const status = getStationSlotStatus(slot);
    const recordingLabel = formatRecordingLabel(
      getRecordingOption(slot.recordingId) || (getRecordingMetaEntry(slot.recordingId) && getRecordingMetaEntry(slot.recordingId).data) || { recording_id: slot.recordingId }
    );
    const stopName = String(slot.stopName || "").trim() || "--";
    const recordingId = String(slot.recordingId || "").trim() || "--";
    return (
      '<section class="pad-demo-station-summary">' +
      '<div class="pad-demo-station-summary__header">' +
      "<div>" +
      '<div class="pad-demo-station-summary__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-demo-station-summary__hint">闂傚倸鍊峰ù鍥х暦閻㈢绐楅柟閭﹀枛閸ㄦ繈骞栧ǎ顒€鐏繛鍛У娣囧﹪濡堕崨顔兼缂備胶濮抽崡鎶藉蓟濞戞ǚ妲堟慨妤€鐗婇弫鎯р攽閻愬弶鍣藉┑鐐╁亾闂佸搫鐭夌徊鍊熺亽闂佺粯鍨惰彜闁哄鐟╁娲传閵夈儲鐎婚梺纭呮珪閿曘垹顕ｆ繝姘╅柍杞拌兌閻嫰姊洪柅鐐茶嫰婢т即鏌嶈閸撴盯鎮烽幎钘夌闁挎繂妫涢埀顒佹そ濮婅櫣绱掑鍡欏姺缂備緡鍣崹鍫曞春濞戙垹绠ｉ柣鎰典簷缁ㄥ姊虹憴鍕棎闁哄懏鐩幃鐐烘倻濡湱绠氶梺鑲┾拡閸撴瑩宕㈤幘顔界厸閻忕偠顕ч埀顒佺箓閻ｇ柉銇愰幒婵囨櫇闂侀潧娴氬鈧紒杈ㄧ箞濮婄粯鎷呯粵瀣異闂佹悶鍔嬮崡鍐茬暦椤栫偛绾ч柟瀵稿У濞堥箖姊虹紒妯烩拻闁冲嘲鐗撳顐﹀炊椤掍胶鍘藉┑鈽嗗灠閻忔繈鎷曢崗绗轰簻闁哄倹顑欏Ο鈧┑顔硷功缁垶骞忛崨鏉戝窛濠电姴鍊瑰▓姗€姊绘担钘夊惞闁革綇濡囩划濠氬箣閿斿厜鍋撻敃鍌氬瀭妞ゆ洖鎳忓娲⒑闁偛鑻晶鎾煟濞戝崬娅嶆鐐搭焽閹风娀鎳犻鈧獮鎰版⒒娴ｅ憡鍟炲〒姘殜瀹曘垺銈ｉ崘鐐櫓婵犮垼鍩栭崝鏍磹閻㈠憡鐓熼柣鏂挎啞缁跺弶銇勮箛锝勭凹缂佺粯绻堟慨鈧柍顓㈩杺娴滎亪銆佸鑸垫櫜濠㈣泛锕﹂鍛存⒑閸忛棿鑸柛搴㈠▕瀹曘垽宕￠悙鈺傛杸闂佺粯鍔曞鍫曀夐悙鐑樼厽闁绘梹绻傞幊鎰版儗閸儲鐓熼柟杈剧到琚氶梺?/div>' +
      "</div>" +
      renderToneChip(status.text, status.tone) +
      "</div>" +
      '<div class="pad-demo-station-summary__meta">' +
      '<div class="pad-demo-station-summary__field"><span>缂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸婂潡鏌ㄩ弴妤€浜惧銈庡亜缁绘濡甸幇鏉跨闁规儳鍘栭悽濠氭⒒娓氣偓濞佳囁囬銏犵濠电姴鍟伴々鑼喐閻楀牆绗氶柣鎾寸懅缁辨挻鎷呴棃娑氫患闂佸搫顑嗛惄顖炲箖瀹勬壋鏋庢繛鍡楁禋濞差參姊洪柅鐐茶嫰婢ь喚绱掗悩鑼х€规洘娲熷畷锟犳倷閳哄倻浜?/span><strong>' +
      escapeHtml(stopName) +
      "</strong></div>" +
      '<div class="pad-demo-station-summary__field"><span>闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗ù锝夋交閼板潡姊洪鈧粔鐢稿箚閻愬搫绠规繛锝庡墮婵″ジ鏌涚仦璇插闂囧鏌ｅΟ鐑樷枙闁稿骸绻戞穱濠囶敃閿涳綆浜﹢渚€姊洪幐搴ｇ畵闁绘瀚伴崺鈧い鎴ｆ娴滈箖姊绘担渚劸妞ゆ垵妫濋獮鎰板箹娴ｅ摜鍙€婵犮垼娉涜墝闁哄绉归弻褑绠涢敐鍛盎闂佽绻戝娆撳煘?/span><strong>' +
      escapeHtml(recordingLabel) +
      "</strong></div>" +
      '<div class="pad-demo-station-summary__field"><span>闂傚倸鍊搁崐宄懊归崶顒夋晪鐟滃繘鍩€椤掍胶鈻撻柡鍛箘閸掓帒鈻庨幘宕囶唺闂佸搫娲ㄩ崰鎰板闯閻戣姤鈷?ID</span><strong>' +
      escapeHtml(recordingId) +
      "</strong></div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoRightTabs() {
    const tabs = [
      { key: "product", label: "单个产品讲解" },
      { key: "station", label: "当前站台讲解" },
    ];
    return (
      '<div class="pad-demo-right-tabs" role="tablist" aria-label="闂傚倸鍊搁崐宄懊归崶褏鏆﹂柛顭戝亝閸欏繘鏌涢幇顖ｆ⒖鐟滅増甯掗悙濠囨煃鐞涒€充壕闂佺粯甯掗敃銉╁Φ閸曨喚鐤€闁规儳顕妶鈺呮⒑閸濆嫭顥犲褎顨堥幑銏犫攽閸繃鐎冲┑鈽嗗灡濡炲灝顭囬幋锔解拺闁告捁灏欓崢娑樏瑰搴濋偗鐎规洘妞介崺鈧い鎺嶉檷娴滄粓鏌熼崫鍕棞濞存粌澧界槐鎺楀礈瑜戝鎼佹煕濡鍔ら柍钘夘樀閹晫绮欑捄銊ュЕ?>' +
      tabs
        .map((tab) => {
          const active = normalizeDemoRightTabKey(state.demoRightTabKey) === tab.key;
          return (
            '<button type="button" class="pad-demo-right-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-demo-right-tab" data-tab-key="' +
            escapeHtml(tab.key) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            '<span class="pad-demo-right-tab__text">' + escapeHtml(tab.label) + "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderDemoProductPanel() {
    return (
      '<section class="pad-demo-panel pad-demo-panel--audience">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐椤旂懓浜鹃柛鎰靛枛楠炪垺淇婇悙瀛樼婵＄偘绮欓悰顔锯偓锝庡枟閺呮粓鏌ｉ敐鍛板閻㈩垱鎸荤换婵嬫偨闂堟刀銏ゆ煥閺囨ê鈧鍩€椤掍礁鍤柛锝忕秮婵℃挳宕ㄧ€涙ê娈ゅ銈嗗笂缁€渚€寮搁幋锔藉€垫鐐茬仢閸旀碍銇勯敂璇茬仯缂侇喖顭峰畷鐑筋敇閻旈攱鐎鹃梻濠庡亜濞诧妇绮欓幋鐘典笉妞ゆ牜鍋為崐鐢告煥濠靛棝顎楅柡瀣枛閺屾盯濡堕崱妤冧患缂?/div>' +
      '<div class="pad-demo-panel__hint">缂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾剧懓顪冪€ｎ亝鎹ｇ紒鈧繝鍥ㄧ厓鐟滄粓宕滈悢鐓庤摕婵炴垶菤濡插牓鏌涘Δ鍐ㄤ户濞寸媭鍙冨娲传閸曨剦妫ゆ繝鈷€鍕垫畼闁瑰箍鍨归埥澶娾枎閹邦喚肖闂備礁鎲￠幐鍡涘川閸涱喛澹橀柍瑙勫灴閹瑥顔忛鍙冣攽閻愯泛鐨洪柛鐘查叄椤㈡岸鏁愭径妯绘櫇闂佹寧娲嶉崑鎾诲炊閹绢喗鈷戦柛鎾村絻娴滄繄绱掔€ｎ偄濮囬弫鍫熶繆閵堝懏鍣洪柍閿嬪灴閹嘲鈻庤箛鎿冧患闂佸憡鏌ｉ崐婵嬪蓟濞戙垺鍋勯梺鍨儏娴犳挳鎮规笟顖氱仸闁哄本绋戦埥澶愬础閻愭畫锕傛⒑閼姐倕鏋戝鐟邦儔瀵劑鏁冮崒娑氬幗濠碘槅鍨甸褏寰婃繝姘厸闁糕剝鐟ユ禒閬嶆煛瀹€鈧崰鏍€佸☉姗嗘僵妞ゆ垼妫勬禍楣冩煕椤垵娅樻繛鍏肩墱缁辨挻鎷呯拠锛勫姺缂備讲妾ч崑鎾绘⒒娴ｅ憡鍟為柛鏃€鍨垮畷婵囧緞閹邦剙鍤戝┑鐐叉濞存艾銆掓繝姘厪闁割偅绻勭粻鎶芥煕閹哄秴宓嗛柡宀嬬秮瀵€燁槹闁稿鍨婚埀顒侇問閸ｎ噣宕戦崟顖ｆ晣濠靛倻顭堝婵囥亜閺嶃劎鈯曢柣锝囧厴濮婄粯绗熼埀顒勫焵椤掑倸浠滈柤娲诲灡閺呭墎鈧數纭堕崑鎾舵喆閸曨剛顦ㄩ梺鎼炲妼濞尖€愁嚕椤愶箑绠涙い鎾跺仧缁愮偞绻濋悽闈浶㈤悗姘槻鍗遍梺顒€绉甸埛鎴︽煠婵劕鈧洖鐨梻浣虹帛鐢亪姊介崟顓熷床婵炴垶鐟х弧鈧梺鎼炲劘閸斿本绂掗幒妤佲拺闁荤喐婢橀埛鏃傜磼椤曞懎鐏﹂柟顕嗙節瀵挳鎮㈤搹鍦闂傚倸鍊搁悧濠勭矙閹烘闂柤鎭掑劘娴滄粓鏌ㄩ弮鍌氬付妞も晩鍓熼弻宥堫檨闁告挻绻堥敐鐐村緞婵炴帗妞介幃銏ゅ传閵夘喗閿ら梻浣稿閸嬪懎煤閺嶎偆涓嶉柡宥庡亝閸犳劙鏌￠崒婵囩《闁哄棴绠撻弻鐔碱敍閻愯弓鍠婂┑陇灏畷鐢垫閹惧瓨濯村瀣唉缁愭姊洪棃鈺冪Ф缂傚秳绀侀锝囨嫚濞村顫嶅┑鈽嗗灦閺€閬嶆倵鐠囨祴鏀介柍钘夋閻忋儲绻涢崪鍐ɑ缂佸倹甯￠、娑㈡倷缁瀚肩紓鍌氬€烽悞锕傗€﹂崶鈺冧笉闁哄稁鍘介悡鐔兼煃閸濆嫸宸ラ柣蹇曞█閺岋綁鏁愰崶褍骞嬮梺杞扮劍閹瑰洭骞冮埡鍛優妞ゆ劑鍨规慨鍐ㄢ攽閿涘嫬浜奸柛濠冪墵瀹曟繆顦寸€垫澘锕ョ粋鎺斺偓锝庝簽閺屽牊绻濋悽闈浶㈡繛璇х畵閸╂盯骞嬮敂钘変哗濠电偞鍨跺濠氬磻閹捐绀傞柛娑卞弾濡粌鈹戦悩鍨毄闁稿孩鍨瑰濠囨寠婢规繃妞介弫鍌炴嚍閵夛妇褰块梺鐟板悑閻ｎ亪宕濆畝鈧竟?/div>' +
      "</div>" +
      "</div>" +
      renderDemoItems() +
      "</section>"
    );
  }

  function renderDemoStationPanel() {
    const slot = getActiveStationSlot();
    const status = getStationSlotStatus(slot);
    const recordingEntry = getRecordingOption(slot.recordingId) || (getRecordingMetaEntry(slot.recordingId) && getRecordingMetaEntry(slot.recordingId).data) || null;
    const recordingLabel = formatRecordingLabel(recordingEntry || { recording_id: slot.recordingId });
    const stopName = String(slot.stopName || "").trim() || "--";
    const active = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const buttonLabel = active ? "Stop station narration" : "Play station narration";
    const buttonDisabled = !active && !status.playable ? " disabled" : "";
    const bannerToneClass =
      state.stationPlaybackError || status.tone === "danger"
        ? "pad-banner--danger"
        : status.tone === "warning"
          ? "pad-banner--warning"
          : status.tone === "ready"
            ? "pad-banner--ready"
            : "pad-banner--pending";
    const bannerText = state.stationPlaybackError || status.text;
    const answerPreview =
      String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "") && String(state.stationPlaybackAnswerText || "").trim()
        ? String(state.stationPlaybackAnswerText || "").trim()
        : "";
    return (
      '<section class="pad-demo-panel pad-demo-panel--station">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">闂傚倸鍊峰ù鍥х暦閻㈢绐楅柟閭﹀枛閸ㄦ繈骞栧ǎ顒€鐏繛鍛У娣囧﹪濡堕崨顔兼缂備胶濮抽崡鎶藉蓟濞戞ǚ妲堟慨妤€鐗婇弫鎯р攽閻愬弶鍣藉┑鐐╁亾闂佸搫鐭夌徊鍊熺亽闂佺绻愰崥瀣掗崟顖涒拺闁告稑顭▓鏇犵棯閺夎法肖闁瑰箍鍨归埥澶愬閻樿尪鈧灝鈹戞幊閸婃洟宕导鎼晩闁搞儺鍓氶埛鎺懨归敐鍛Щ鐎规挸妫楅湁婵犲﹤鍟伴崺锝嗩殽閻愭彃鏆熼柟鍙夋尦瀹曠喖顢楅埀顒勵敁閹剧粯鈷戦柤鎭掑剭椤忓煻鍥箮閽樺鐎梺绉嗗嫷娈曢柛?/div>' +
      '<div class="pad-demo-panel__hint">闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗ù锝夋交閼板潡姊洪鈧粔鐢稿箚閻愬搫绠规繛锝庡墮婵″ジ鏌涚仦璇插闂囧鏌ｅΟ鐑樷枙闁稿骸绻戞穱濠囶敃閿涳綆浜﹢渚€姊洪幐搴ｇ畵婵炲眰鍊濆畷婵堚偓锝庡枟閸婂灚鎱ㄥ鍡楀箹闁告繃妞介弻锛勪沪閻愵剛顦ㄧ紓浣规⒒閸犳牠銆佸☉姗嗘僵妞ゆ挾鍋為鐘绘⒑閼姐倕小闁绘帪绠撻幃锟犲灳閹颁焦缍庡┑鐐叉▕娴滄粌顔忓┑鍡忔斀闁绘ɑ褰冮顏堟煕閿濆骸鏋熺紒缁樼箞閸╂盯鍩€椤掑嫬绀嬮柛顭戝亞閺嗩垱绻濋悽闈涗粶闁告艾顑呯叅婵☆垰鍚嬪畷鍙夌箾閹寸偟鎳勭紓宥呮喘閺屾盯骞樺Δ鈧崯顐︽偂閸屾粎纾介柛灞剧懅椤︼附銇勯敂璇茬仭闁哄懓鍩栭幆鏃堝Ω閵壯屾Т闂備礁婀遍崕銈夈€冮崱娑樼柧婵犲﹤鐗婇埛鎴炵箾閸℃ê鍔ら柣蹇曞Т闇夋繝濠傜墢閻ｆ椽鏌熼鐓庢Щ闁宠姘︾粻娑㈠箼閸愌呮／闂傚倷鐒﹂惇褰掑礉瀹ュ鍨傞柛鎾茬劍瀹曞弶绻涢幋娆忕仼闂佸崬娲弻锝夊籍閸偅顥栨繛瀵稿Т閵堢顫忓ú顏呯劵闁绘劘灏€氭澘顭胯閸ㄥ磭妲愰幒鏂哄亾閿濆骸浜滅紒妞绘櫊閺岀喓绮电€ｎ亙鍠婂┑顔硷攻濡炶棄螞閸愩劉妲堟繛鍡樕戦ˉ锝夋⒒娴ｄ警鐒鹃柨鏇樺妼閻ｇ兘鎮界粙璺槴闂佸湱鍎ら〃鍛存偂濞戞◤褰掓晲閸涱厾楠囬梺璇查椤嘲螞閸涙惌鏁冮柕蹇娾偓鎰佹П闂備礁婀遍幊鎾趁洪鐐垫殾闁挎繂顦伴弲鎼佹煟濡櫣锛嶉柛妯圭矙濮婅櫣绱掑Ο蹇ｄ簻椤曪綁宕滄担铏圭劸闂佸啿鎼幊蹇涙偂閺囩喓绠鹃柛鈩冾殘缁犱即鏌￠崱顓犵М闁哄瞼鍠栭、姘跺幢濞嗘垹妲囬柣搴ゎ潐濞叉牠濡剁粙娆惧殨闁圭虎鍠楅崑鍕煕濞戞﹫鍔熺憸鑸姂濮婄粯鎷呯粵瀣缂備胶绮敮鈥崇暦閹达附鍋愰悹鍥皺閿涙盯姊虹憴鍕棆濠⒀勵殜瀹曟垿鍩勯崘顏嗙槇闂傚倸鐗婄粙鎺楁倶閳哄啯鍠愰柣妤€鐗嗙粭鎺旂磼閳ь剟宕掗悙瀵稿幘闁荤喐鐟ョ€氼厾娆㈤崣澶堜簻闁靛濡囩粻鎾绘煃鐟欏嫬鐏撮柟顔界懇楠炴捇骞掗弮鍫㈠礈闂傚倷鑳剁划顖炪€冮崼鐔虹闁逞屽墰閳ь剚顔栭崰鏍€﹀畡鎵殾闁靛ň鏅涚痪褔鏌熺€电孝濠殿噯闄勬穱濠囨倷椤忓嫧鍋撻弽顐ｆ殰闁圭儤鏌￠崑鎾愁潩閻撳骸顫紓渚囧枛閻楁挸鐣烽崡鐑嗘富闁靛骏绱曢埊鏇㈡煥濞戞瑥濮堥柟宄版嚇閹煎綊宕烽鐐茬哎闂傚倸鍊烽懗鍓佸垝椤栨粎鐭欓柟鐑橆殔缁犳煡鏌涢妷顔煎闁藉啰鍠愮换娑㈠箣閻愬啯宀稿銊︾鐎ｎ偆鍘卞┑鐐村灥瀹曨剟鎮橀敐澶嬬厽婵炴垶鐗曢悘鍙夋叏婵犲懏顏犵紒杈ㄥ笒铻ｉ悹鍥皺閿涘姊绘担铏广€婇柡鍛矒閹囨偐鐠囧弶鐎悗骞垮劚椤︻垳绮诲☉銏＄厸濠㈣泛瀛╃涵鑸点亜閹捐櫕鎯堥柍瑙勫灴閹瑩宕ｆ径妯活棧闂備礁鍚嬪鍧楀垂鏉堚晝鐭?/div>' +
      "</div>" +
      "</div>" +
      '<div class="pad-station-playback">' +
      '<div class="pad-station-playback__card">' +
      '<div class="pad-station-playback__head">' +
      "<div>" +
      '<div class="pad-station-playback__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-station-playback__subtitle">' +
      escapeHtml(stopName) +
      "</div>" +
      "</div>" +
      (active
        ? '<span class="pad-demo-item__badge pad-demo-item__badge--playing"><span class="pad-wave" aria-hidden="true"><span></span><span></span><span></span></span><span>' +
          escapeHtml(isStationSlotPending(slot) ? "Preparing" : "Playing") +
          "</span></span>"
        : renderToneChip(status.text, status.tone)) +
      "</div>" +
      '<div class="pad-banner ' + bannerToneClass + '">' + escapeHtml(bannerText) + "</div>" +
      '<div class="pad-station-playback__meta">' +
      '<div class="pad-station-playback__field"><span>闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗ù锝夋交閼板潡姊洪鈧粔鐢稿箚閻愬搫绠规繛锝庡墮婵″ジ鏌涚仦璇插闂囧鏌ｅΟ鐑樷枙闁稿骸绻戞穱濠囶敃閿涳綆浜﹢渚€姊洪幐搴ｇ畵闁绘瀚伴崺鈧い鎴ｆ娴滈箖姊绘担渚劸妞ゆ垵妫濋獮鎰板箹娴ｅ摜鍙€婵犮垼娉涜墝闁哄绉归弻褑绠涢敐鍛盎闂佽绻戝娆撳煘?/span><strong>' +
      escapeHtml(recordingLabel) +
      "</strong></div>" +
      '<div class="pad-station-playback__field"><span>闂傚倸鍊搁崐宄懊归崶顒夋晪鐟滃繘鍩€椤掍胶鈻撻柡鍛箘閸掓帒鈻庨幘宕囶唺闂佸搫娲ㄩ崰鎰板闯閻戣姤鈷?ID</span><strong>' +
      escapeHtml(String(slot.recordingId || "").trim() || "--") +
      "</strong></div>" +
      '<div class="pad-station-playback__field"><span>闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵稿妽闁哄懏绻堥弻鏇熷緞濞戞﹩娲紓浣哄У閸庢娊鍩為幋锔藉亹闁告瑥顦崑宥夋⒑闁偛鑻晶顕€鏌涙繝鍌滀虎闁伙綁鏀辩缓鐣岀矙閸喖绁梻浣虹帛濡礁銆掗崷顓犵＞闁哄洢鍨洪埛鎺懨归敐鍫綈闁稿濞€閺屾稒鎯旈姀掳浠㈤梺璇″櫙缁绘繂鐣锋總绋课ㄩ柕澶堝妼閻?/span><strong>' +
      escapeHtml(
        String(
          Array.isArray(state.stationPlaybackQueue) && String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "")
            ? state.stationPlaybackQueue.length
            : 0
        )
      ) +
      "</strong></div>" +
      "</div>" +
      '<div class="pad-station-playback__actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-station-slot" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      buttonDisabled +
      ">" +
      escapeHtml(buttonLabel) +
      "</button>" +
      "</div>" +
      (answerPreview
        ? '<div class="pad-station-playback__preview"><div class="pad-station-playback__preview-title">闂傚倸鍊峰ù鍥х暦閻㈢绐楅柟閭﹀枛閸ㄦ繈骞栧ǎ顒€鐏繛鍛У娣囧﹪濡堕崨顔兼缂備胶濮抽崡鎶藉蓟濞戞ǚ妲堟慨妤€鐗婇弫鎯р攽閻愬弶鍣藉┑鐐╁亾闂佸搫鐭夌徊鍊熺亽缂佺偓濯芥ご绋啃掑畝鍕拺缂佸顑欓崕鎰版煙閸涘﹥鍊愰柛鈹垮劜瀵板嫭绻涢悙顒傗偓娲⒑閹勭闁稿瀚伴幃姗€寮堕幋鏃€鏂€闂佹枼鏅涢崯顖滀焊閿旈敮鍋撶憴鍕閻㈩垽绻濋獮鍐ㄢ枎閹惧磭鐓戞繝銏ｅ煐钃辨い銉ｅ€濆濠氬磼濞嗘垵濡介梺璇″枛閻栫厧鐣烽弴鐑嗙叆闁割偅绻傜粣娑橆渻閵堝棙顥嗘俊顐㈠瀵鈻庨幇顔剧槇缂佸墽澧楄摫妞ゎ偄锕弻娑氣偓锝庝簼閸ｈ銇勯鐐典虎閾伙綁鎮樿箛鏃傚ⅹ濞存粎鍋撻幈銊ノ熼悡搴′粯闂佽楠忕粻鎾诲蓟?/div><div class="pad-station-playback__preview-text">' +
          escapeHtml(answerPreview) +
          "</div></div>"
        : "") +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function getSceneEditorDraftForScene(scene) {
    const draft = state.sceneEditorDraft && typeof state.sceneEditorDraft === "object" ? state.sceneEditorDraft : null;
    if (!draft || !scene) return null;
    if (String(draft.scene_id || "") !== String(scene.scene_id || "")) return null;
    const controlAction = getHotspotControlAction(draft);
    return {
      hotspot_id: String(draft.hotspot_id || "").trim(),
      scene_id: String(scene.scene_id || "").trim(),
      station_key: String(draft.station_key || scene.scene_id || "").trim(),
      product_id: String(draft.product_id || "").trim(),
      product_search_text: String(draft.product_search_text || "").trim(),
      target_type: getHotspotTargetType(draft),
      control_action: controlAction,
      control_label: controlAction ? getHotspotControlLabel(draft) : "",
      sort_order: Number(draft.sort_order || 0),
      x_pct: clampPct(draft.x_pct),
      y_pct: clampPct(draft.y_pct),
      width_pct: clampPct(draft.width_pct),
      height_pct: clampPct(draft.height_pct),
      title: String(draft.title || "").trim(),
      content_text: String(draft.content_text || "").trim(),
    };
  }

  function getSceneHotspotsForRender(scene, includeDraft) {
    const baseHotspots = Array.isArray(scene && scene.hotspots) ? scene.hotspots.slice() : [];
    if (!includeDraft) return baseHotspots;
    const draft = getSceneEditorDraftForScene(scene);
    if (!draft) return baseHotspots;
    const draftProduct = findProductById(draft.product_id);
    const draftHotspot = {
      hotspot_id: draft.hotspot_id || "__draft__",
      scene_id: draft.scene_id,
      station_key: draft.station_key,
      product_id: draft.product_id,
      product_name: draftProduct ? String(draftProduct.product_name || "").trim() : String(draft.product_search_text || "").trim(),
      product_name_en: draftProduct ? String(draftProduct.product_name_en || "").trim() : "",
      product_hall_id: draftProduct ? String(draftProduct.hall_id || "").trim() : "",
      product_source: draftProduct ? String(draftProduct.product_source || "").trim() : "",
      has_active_audio: !!(draftProduct && draftProduct.has_active_audio),
      audio_asset_id: draftProduct ? String(draftProduct.audio_asset_id || "").trim() : "",
      audio_url: draftProduct ? String(draftProduct.playback_url || "").trim() : "",
      target_type: draft.target_type,
      control_action: draft.control_action,
      control_label: draft.control_label,
      sort_order: draft.sort_order,
      x_pct: draft.x_pct,
      y_pct: draft.y_pct,
      width_pct: draft.width_pct,
      height_pct: draft.height_pct,
      title: draft.title,
      content_text: draft.content_text,
      updated_at_ms: 0,
    };
    const next = baseHotspots.map((item) =>
      String(item.hotspot_id || "") === String(draft.hotspot_id || "") ? draftHotspot : item
    );
    if (!draft.hotspot_id) {
      next.push(draftHotspot);
    }
    return next.sort((left, right) => {
      const orderDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(left.hotspot_id || "").localeCompare(String(right.hotspot_id || ""));
    });
  }

  function renderSceneStage(scene, options) {
    const item = scene && typeof scene === "object" ? scene : null;
    if (!item || !item.background || !item.background.image_url) {
      return '<div class="pad-empty">This station has no background configured yet.</div>';
    }
    const opts = options && typeof options === "object" ? options : {};
    const editor = !!opts.editor;
    const interactiveOnly = !editor && !!opts.interactiveOnly;
    const stretchToFit = !!opts.stretchToFit;
    const extraClassName = String(opts.className || "").trim();
    const hotspots = getSceneHotspotsForRender(item, editor);
    const activeHotspotId =
      editor && state.sceneEditorDraft && !state.sceneEditorDraft.hotspot_id
        ? "__draft__"
        : String(
            editor
              ? state.sceneEditorActiveHotspotId || ""
              : state.highlightedHotspotId || state.sceneDialogHotspotId || ""
          );
    const width = Number(item.background.width || 0) || 1;
    const height = Number(item.background.height || 0) || 1;
    const hotspotHtml = hotspots
      .map((hotspot, index) => {
        const hotspotId = String(hotspot.hotspot_id || "");
        const active = hotspotId === activeHotspotId;
        const label = getHotspotDisplayLabel(hotspot, index);
        const hotspotTone = getHotspotVisualTone(hotspot);
        const style =
          "left:" +
          String(clampPct(hotspot.x_pct) * 100) +
          "%;top:" +
          String(clampPct(hotspot.y_pct) * 100) +
          "%;width:" +
          String(clampPct(hotspot.width_pct) * 100) +
          "%;height:" +
          String(clampPct(hotspot.height_pct) * 100) +
          "%;";
        if (!editor) {
          const controlAction = String(hotspot.control_action || "").trim();
          return (
            '<button type="button" class="pad-scene-hotspot' +
            (interactiveOnly ? " pad-scene-hotspot--interactive-only" : "") +
            (hotspotTone === "control" ? " pad-scene-hotspot--control" : "") +
            (hotspotTone === "has-audio" ? " pad-scene-hotspot--has-audio" : "") +
            (hotspotTone === "missing-audio" ? " pad-scene-hotspot--missing-audio" : "") +
            (hotspotTone === "unbound" ? " pad-scene-hotspot--unbound" : "") +
            (active ? " is-active" : "") +
            '" data-action="play-product-hotspot" data-product-id="' +
            escapeHtml(String(hotspot.product_id || "")) +
            '" data-hotspot-id="' +
            escapeHtml(hotspotId) +
            '" data-control-action="' +
            escapeHtml(controlAction) +
            '" style="' +
            escapeHtml(style) +
            '">' +
            (controlAction || opts.showLabels
              ? '<span class="pad-scene-hotspot__label">' + escapeHtml(label) + "</span>"
              : "") +
            "</button>"
          );
        }
        return (
          '<div class="pad-scene-hotspot pad-scene-hotspot--editor' +
          (hotspotTone === "control" ? " pad-scene-hotspot--control" : "") +
          (hotspotTone === "has-audio" ? " pad-scene-hotspot--has-audio" : "") +
          (hotspotTone === "missing-audio" ? " pad-scene-hotspot--missing-audio" : "") +
          (hotspotTone === "unbound" ? " pad-scene-hotspot--unbound" : "") +
          (active ? " is-active" : "") +
          '" data-action="scene-editor-hotspot" data-hotspot-id="' +
          escapeHtml(hotspotId) +
          '" style="' +
          escapeHtml(style) +
          '">' +
          '<span class="pad-scene-hotspot__label">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="pad-scene-hotspot__resize" data-action="scene-editor-hotspot-resize" data-hotspot-id="' +
          escapeHtml(hotspotId) +
          '"></span>' +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="pad-scene-stage' +
      (editor ? " is-editor" : "") +
      (stretchToFit ? " is-stretched" : "") +
      (extraClassName ? " " + extraClassName : "") +
      '" data-scene-stage-role="' +
      escapeHtml(editor ? "editor" : "demo") +
      '" data-scene-id="' +
      escapeHtml(String(item.scene_id || "")) +
      '" style="' +
      escapeHtml(
        stretchToFit
          ? "width:100%;height:100%;"
          : "aspect-ratio:" + String(width) + " / " + String(height) + ";"
      ) +
      '">' +
      '<img class="pad-scene-stage__image" src="' +
      escapeHtml(String(item.background.image_url || "")) +
      '" alt="' +
      escapeHtml(String(item.name || "Scene")) +
      '" />' +
      '<div class="pad-scene-stage__overlay">' +
      hotspotHtml +
      "</div>" +
      "</div>"
    );
  }

  function renderDemoSceneTabs() {
    const scenes = Array.isArray(state.scenes) ? state.scenes : [];
    if (!scenes.length) {
      return '<div class="pad-demo-scene-tabs-empty">No scenes</div>';
    }
    return (
      '<div class="pad-demo-scene-tabs" role="tablist" aria-label="Scene switcher">' +
      scenes
        .map((scene) => {
          const active = String(scene.scene_id || "") === String(state.selectedSceneId || "");
          const thumbStyle =
            scene.background && scene.background.image_url
              ? ' style="background-image:url(&quot;' + escapeHtml(scene.background.image_url) + '&quot;)"'
              : "";
          return (
            '<button type="button" class="pad-demo-scene-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-selected-scene" data-scene-id="' +
            escapeHtml(String(scene.scene_id || "")) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            '<span class="pad-demo-scene-tab__thumb"' +
            thumbStyle +
            "></span>" +
            '<span class="pad-demo-scene-tab__name">' +
            escapeHtml(String(scene.name || "")) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderSceneDialog() {
    const scene = getSelectedScene();
    const hotspot = getSceneHotspotById(scene, state.sceneDialogHotspotId);
    if (!scene || !hotspot) return "";
    const title = String(hotspot.title || "").trim() || "热点说明";
    const content = String(hotspot.content_text || "").trim();
    return (
      '<div class="pad-scene-dialog" data-action="close-scene-dialog">' +
      '<div class="pad-scene-dialog__card" data-scene-dialog-card="1">' +
      '<button type="button" class="pad-scene-dialog__close" data-action="close-scene-dialog">关闭</button>' +
      '<div class="pad-scene-dialog__title">' +
      escapeHtml(title) +
      "</div>" +
      '<div class="pad-scene-dialog__content">' +
      escapeHtml(content || "暂未设置内容") +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderDemoScenePanel() {
    const scene = getSelectedScene();
    if (state.loading && !state.scenes.length) {
      return '<div class="pad-loading">' + escapeHtml(TEXT.loading) + "</div>";
    }
    if (!scene) {
      return '<div class="pad-empty">No scene is configured for this hall yet.</div>';
    }
    return (
      '<section class="pad-demo-panel pad-demo-panel--scene">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">场景图讲解</div>' +
      '<div class="pad-demo-panel__hint">点击红框热点查看该区域说明；热点会随背景图缩放同步变化。</div>' +
      "</div>" +
      '<div class="pad-chip">' +
      escapeHtml(String((Array.isArray(scene.hotspots) ? scene.hotspots.length : 0)) + " hotspots") +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-panel__title">' +
      escapeHtml(String(scene.name || "")) +
      "</div>" +
      renderSceneStage(scene, { editor: false }) +
      (Array.isArray(scene.hotspots) && scene.hotspots.length
        ? ""
        : '<div class="pad-detail__hint">This scene has no hotspots yet.</div>') +
      renderSceneDialog() +
      "</section>"
    );
  }

  function renderStationConfigPanel() {
    const panelHeader =
      '<section class="pad-panel pad-station-config-panel">' +
      '<div class="pad-panel__header pad-station-config-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">??????</div>' +
      '<div class="pad-panel__hint">???? 2 ????????????????????????</div>' +
      "</div>" +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">????</button>' +
      "</div>";
    const body = STATION_SLOT_KEYS.map((slotKey, index) => {
      const slot = getStationSlotByKey(slotKey);
      const metaEntry = getRecordingMetaEntry(slot.recordingId);
      const stops = getRecordingStops(slot.recordingId);
      const status = getStationSlotStatus(slot);
      const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
      if (slot.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(slot.recordingId || ""))) {
        recordingOptions.unshift({
          recording_id: String(slot.recordingId || ""),
          display_name: "???????",
        });
      }
      const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
      const stopOptions = [];
      if (selectedStopIndex != null && (!stops.length || selectedStopIndex >= stops.length)) {
        stopOptions.push(
          '<option value="' + escapeHtml(String(selectedStopIndex)) + '" selected>?????????????</option>'
        );
      }
      stops.forEach((stopName, stopIndex) => {
        stopOptions.push(
          '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (selectedStopIndex === stopIndex ? ' selected' : '') +
            '>' +
            escapeHtml(stopName) +
            '</option>'
        );
      });
      return (
        '<div class="pad-station-config-panel__item">' +
        '<div class="pad-station-config-panel__item-header">' +
        '<div class="pad-station-config-panel__item-title">???? ' + escapeHtml(String(index + 1)) + '</div>' +
        renderToneChip(status.text, status.tone) +
        '</div>' +
        '<label class="pad-station-config-panel__field"><span>闂備礁鎼€氼剚鏅舵禒瀣︽慨妯挎硾鐟?/span><input type="text" data-action="station-slot-label" data-slot-key="' +
        '<label class="pad-station-config-panel__field"><span>显示名</span><input type="text" data-action="station-slot-label" data-slot-key="' +
        '" value="' +
        escapeHtml(String(slot.label || '')) +
        '" placeholder="濠电偞鎸婚懝楣冾敄閸涙番鈧懓顦归柡浣哥Т椤繈顢楅埀顒€顕ｉ幎鑺ョ厱婵炲棙鐟х粙缁樸亜閹邦垰袚婵?/ 闂備礁鎼粔鍫曗€﹂崼銏㈢处濡わ絽鍟梻顖炴煏婵犲繐鐦滄繛? /></label>' +
        '" placeholder="例如：入口欢迎 / 核心器械" /></label>' +
        '<label class="pad-station-config-panel__field"><span>播放存档</span><select data-action="station-slot-recording" data-slot-key="' +
        '">' +
        '<option value="">??????</option>' +
        recordingOptions
          .map((item) => {
            const recordingId = String(item && item.recording_id ? item.recording_id : '').trim();
            return (
              '<option value="' +
              escapeHtml(recordingId) +
              '"' +
              (recordingId === String(slot.recordingId || '') ? ' selected' : '') +
              '>' +
              escapeHtml(formatRecordingLabel(item)) +
              '</option>'
            );
          })
          .join('') +
        '</select></label>' +
        '<label class="pad-station-config-panel__field"><span>缂傚倷鐒﹀褰掓偡閵夈劊浜?/span><select data-action="station-slot-stop" data-slot-key="' +
        '<label class="pad-station-config-panel__field"><span>站台</span><select data-action="station-slot-stop" data-slot-key="' +
        '"' +
        (!slot.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? ' disabled' : '') +
        '>' +
        '<option value="">' + escapeHtml(metaEntry && metaEntry.loading ? '??????...' : '????') + '</option>' +
        stopOptions.join('') +
        '</select></label>' +
        '<div class="pad-station-config-panel__preview">' +
        '<div class="pad-station-config-panel__preview-title">??????</div>' +
        '<div class="pad-station-config-panel__preview-row"><span>????</span><strong>' +
        escapeHtml(String(slot.stopName || '').trim() || '--') +
        '</strong></div>' +
        '<div class="pad-station-config-panel__preview-row"><span>????</span><strong>' +
        escapeHtml(formatRecordingLabel(getRecordingOption(slot.recordingId) || (metaEntry && metaEntry.data) || { recording_id: slot.recordingId })) +
        '</strong></div>' +
        '<div class="pad-station-config-panel__preview-row"><span>????</span><strong>' +
        escapeHtml(metaEntry && metaEntry.error ? metaEntry.error : metaEntry && metaEntry.loading ? '????' : status.text) +
        '</strong></div>' +
        '</div>' +
        '</div>'
      );
    }).join('');
    const errorBanner = state.recordingOptionsError
      ? '<div class="pad-banner pad-banner--danger" style="margin: 0 22px 18px;">' + escapeHtml(state.recordingOptionsError) + '</div>'
      : '';
    return panelHeader + '<div class="pad-station-config-panel__body">' + body + '</div>' + errorBanner + '</section>';
  }

  function renderDemoPlaybackState(product) {
    if (!product || !product.has_active_audio) return "";
    if (isProductPlaying(product) || isProductPending(product)) {
      return (
        '<span class="pad-demo-item__badge pad-demo-item__badge--playing">' +
        '<span class="pad-wave" aria-hidden="true"><span></span><span></span><span></span></span>' +
        '<span>' +
        escapeHtml(isProductPending(product) ? TEXT.demoStatusPreparing : TEXT.demoStatusPlaying) +
        "</span>" +
        "</span>"
      );
    }
    return "";
  }

  function renderDemoProductImage(product) {
    const primaryImage = getPrimaryImage(product);
    if (!primaryImage || !primaryImage.image_url) {
      return "";
    }
    return (
      '<div class="pad-demo-item__media' +
      (isFallbackImage(primaryImage) ? " is-fallback" : "") +
      '">' +
      '<img class="pad-demo-item__image" data-testid="demo-item-image-' +
      escapeHtml(product.product_id) +
      '" src="' +
      escapeHtml(primaryImage.image_url) +
      '" alt="' +
      escapeHtml((product.product_name || "Product") + " image") +
      '" loading="lazy" />' +
      "</div>"
    );
  }

  function renderProductImageSection(product) {
    const images = getProductImages(product);
    const primaryImage = getPrimaryImage(product);
    const usingFallback = isFallbackImage(primaryImage);
    return (
      '<section class="pad-detail__section">' +
      '<div class="pad-detail__section-title">' +
      escapeHtml(IMAGE_TEXT.sectionTitle) +
      "</div>" +
      '<div class="pad-detail__image-stage' +
      (usingFallback ? " is-fallback" : "") +
      '">' +
      '<img class="pad-detail__image-stage-img" data-testid="product-primary-image" src="' +
      escapeHtml(primaryImage.image_url) +
      '" alt="' +
      escapeHtml((product.product_name || "Product") + " image") +
      '" loading="lazy" />' +
      "</div>" +
      (images.length
        ? '<div class="pad-detail__image-gallery" data-testid="product-image-gallery">' +
          images
            .map((image) => {
              const active = String(image.image_asset_id || "") === String(primaryImage.image_asset_id || "");
              return (
                '<div class="pad-detail__image-thumb' +
                (active ? " is-active" : "") +
                '" data-testid="product-image-thumb-' +
                escapeHtml(image.image_asset_id) +
                '">' +
                '<img src="' +
                escapeHtml(image.image_url) +
                '" alt="' +
                escapeHtml((product.product_name || "Product") + " thumbnail") +
                '" loading="lazy" />' +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : "") +
      (usingFallback
        ? '<div class="pad-detail__fallback-note" data-testid="product-image-fallback-note">' +
          escapeHtml(IMAGE_FALLBACK_NOTE) +
          "</div>"
        : "") +
      '<div class="pad-detail__hint">' +
      escapeHtml(IMAGE_TEXT.uploadHint) +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoLayoutPanel() {
    return (
      '<section class="pad-panel pad-layout-panel">' +
      '<div class="pad-panel__header pad-layout-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">\u6f14\u793a\u5e03\u5c40</div>' +
      '<div class="pad-panel__hint">\u8bbe\u7f6e\u6f14\u793a\u6a21\u5f0f\u6bcf\u884c\u663e\u793a\u7684\u4ea7\u54c1 item \u6570\u91cf\u3002</div>' +
      "</div>" +
      '<div class="pad-layout-panel__options" role="group" aria-label="\u6f14\u793a\u6bcf\u884c item \u6570\u91cf">' +
      [1, 2, 3, 4]
        .map((count) => {
          return (
            '<button type="button" class="pad-layout-panel__btn' +
            (state.demoColumns === count ? " is-active" : "") +
            '" data-action="set-demo-columns" data-columns="' +
            String(count) +
            '" data-testid="demo-columns-' +
            String(count) +
            '">' +
            escapeHtml(String(count) + " \u5217") +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoItems() {
    if (state.loading && !state.products.length) {
      return '<div class="pad-loading">' + escapeHtml(TEXT.loading) + "</div>";
    }

    if (state.errorMessage && !state.products.length) {
      return (
        '<div class="pad-error">' +
        "<div>" +
        escapeHtml(state.errorMessage) +
        "</div>" +
        (state.errorDetail ? '<div style="margin-top:8px;">' + escapeHtml(state.errorDetail) + "</div>" : "") +
        "</div>"
      );
    }

    if (!state.products.length) {
      return '<div class="pad-empty">' + escapeHtml(TEXT.noProducts) + "</div>";
    }

    return (
      '<div class="pad-demo-list" data-testid="demo-item-list" style="--pad-demo-columns:' +
      escapeHtml(String(state.demoColumns || DEFAULT_DEMO_COLUMNS)) +
      ';" data-columns="' +
      escapeHtml(String(state.demoColumns || DEFAULT_DEMO_COLUMNS)) +
      '">' +
      getDisplayProducts()
        .map((product) => {
          const selected = String(product.product_id || "") === String(state.selectedProductId || "");
          const playing = isProductPlaying(product);
          const pending = isProductPending(product);
          return (
            '<button type="button" class="pad-demo-item' +
            (product.has_active_audio ? " has-active-audio" : "") +
            (selected ? " is-selected" : "") +
            (playing ? " is-playing" : "") +
            (pending ? " is-pending" : "") +
            (!product.has_active_audio ? " is-missing-audio" : "") +
            '" data-product-id="' +
            escapeHtml(product.product_id) +
            '" data-testid="demo-item-' +
            escapeHtml(product.product_id) +
            '">' +
            '<div class="pad-demo-item__body">' +
            renderDemoProductImage(product) +
            '<div class="pad-demo-item__content">' +
            '<div class="pad-demo-item__head">' +
            '<div class="pad-demo-item__titles">' +
            '<div class="pad-demo-item__title">' +
            escapeHtml(product.product_name || "Unnamed Product") +
            "</div>" +
            (product.product_name_en
              ? '<div class="pad-demo-item__title-en">' + escapeHtml(product.product_name_en) + "</div>"
              : "") +
            "</div>" +
            renderDemoPlaybackState(product) +
            "</div>" +
            '<div class="pad-demo-item__meta">' +
            (product.company ? '<span class="pad-chip">' + escapeHtml(product.company) + "</span>" : "") +
            (product.registration_number
              ? '<span class="pad-chip">' +
                escapeHtml(TEXT.registrationNumber + " " + product.registration_number) +
                "</span>"
              : "") +
            (product.effective_date
              ? '<span class="pad-chip">' + escapeHtml(TEXT.effectiveDate + " " + product.effective_date) + "</span>"
              : "") +
            "</div>" +
            "</div>" +
            "</div>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderProductCards() {
    if (state.loading && !state.products.length) {
      return '<div class="pad-loading">' + escapeHtml(TEXT.loading) + "</div>";
    }

    if (state.errorMessage && !state.products.length) {
      return (
        '<div class="pad-error">' +
        "<div>" +
        escapeHtml(state.errorMessage) +
        "</div>" +
        (state.errorDetail ? '<div style="margin-top:8px;">' + escapeHtml(state.errorDetail) + "</div>" : "") +
        "</div>"
      );
    }

    if (!state.products.length) {
      return '<div class="pad-empty">' + escapeHtml(TEXT.noProducts) + "</div>";
    }

    return (
      '<div class="pad-ops-product-table">' +
      state.products
        .map((product, index) => {
          const active = String(product.product_id || "") === String(state.selectedProductId || "");
          const playing = isProductPlaying(product);
          const pending = isProductPending(product);
          const statusClass = product.has_active_audio ? "pad-chip--ready" : "pad-chip--warning";
          const statusLabel = playing
            ? TEXT.currentAudioStatusPlaying
            : pending
              ? TEXT.currentAudioStatusPreparing
              : product.has_active_audio
                ? TEXT.currentAudioReady
                : TEXT.currentAudioMissing;
          return (
            '<button type="button" class="pad-ops-product-row' +
            (active ? " is-active" : "") +
            (playing ? " is-playing" : "") +
            (pending ? " is-pending" : "") +
            (!product.has_active_audio ? " is-missing-audio" : "") +
            '" data-product-id="' +
            escapeHtml(product.product_id) +
            '">' +
            '<span class="pad-ops-product-row__index">' +
            escapeHtml(String(index + 1).padStart(2, "0")) +
            "</span>" +
            '<span class="pad-ops-product-row__main">' +
            '<span class="pad-ops-product-row__name">' +
            escapeHtml(product.product_name || "\u672a\u547d\u540d\u4ea7\u54c1") +
            "</span>" +
            '<span class="pad-ops-product-row__meta">' +
            escapeHtml(String(product.registration_number || product.company || "--").trim() || "--") +
            "</span>" +
            "</span>" +
            '<span class="pad-chip ' +
            statusClass +
            '">' +
            escapeHtml(statusLabel) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderDetailPanel() {
    const product = getSelectedProduct();
    if (!product) {
      return '<div class="pad-detail"><div class="pad-empty">' + escapeHtml(TEXT.noSelection) + "</div></div>";
    }

    const bannerTone = state.audioError
      ? "pad-banner--danger"
      : state.usingOfflineSnapshot || state.offlineReady
        ? "pad-banner--ready"
        : "pad-banner--warning";

    const bannerText = state.audioError
      ? state.audioError
      : state.usingOfflineSnapshot
        ? TEXT.bannerUsingOffline
        : state.offlineReady
          ? TEXT.bannerOfflineReady
          : TEXT.bannerOnlineOnly;

    const playLabel = state.audioBusy && state.selectedProductId === product.product_id ? TEXT.audioPreparing : TEXT.audioPlay;
    const playDisabled = !product.playback_url || state.assetBusy ? " disabled" : "";
    const generateLabel =
      state.assetBusy && state.assetAction === "regenerate"
        ? "\u6b63\u5728\u751f\u6210..."
        : product.has_active_audio
          ? "\u91cd\u751f TTS"
          : "\u751f\u6210 TTS";
    const uploadLabel = state.assetBusy && state.assetAction === "upload" ? "\u6b63\u5728\u4e0a\u4f20..." : "\u4e0a\u4f20\u5f55\u97f3";
    const uploadImageLabel = state.assetBusy && state.assetAction === "upload-image" ? IMAGE_TEXT.uploading : IMAGE_TEXT.upload;
    const actionDisabled = state.assetBusy ? " disabled" : "";
    const assetToneClass =
      state.assetTone === "danger"
        ? "pad-banner--danger"
        : state.assetTone === "ready"
          ? "pad-banner--ready"
          : state.assetTone === "warning"
            ? "pad-banner--warning"
            : "pad-banner--pending";
    const currentAudioText = getCurrentAudioText(product);
    const editableAudioText = getEditableAudioText(product);
    const editableProductName = getEditableProductName(product);
    const editableProductIntro = getEditableProductIntro(product);
    const assetSummary = product.has_active_audio
      ? "\u5f53\u524d\u751f\u6548\u97f3\u9891\uff1a" +
        formatAudioSourceType(product.audio_source_type) +
        "\uff0c\u66f4\u65b0\u65f6\u95f4 " +
        formatTimestamp(product.audio_updated_at_ms)
      : "\u5f53\u524d\u8fd8\u6ca1\u6709\u751f\u6548\u8bb2\u89e3\u97f3\u9891\u3002";
    const currentAudioTextDisplay = currentAudioText
      ? currentAudioText
      : product.has_active_audio
        ? "\u5f53\u524d\u751f\u6548\u97f3\u9891\u8fd8\u672a\u7ed1\u5b9a\u6587\u5b57\u3002"
        : "\u6682\u65e0\u5f53\u524d\u751f\u6548\u97f3\u9891\uff0c\u91cd\u751f TTS \u65f6\u5c06\u4f7f\u7528\u4e0b\u65b9\u6587\u5b57\u3002";

    return (
      '<div class="pad-ops-detail">' +
      '<div class="pad-ops-detail__head">' +
      "<div>" +
      '<h2 class="pad-ops-detail__title">' +
      escapeHtml(product.product_name || "\u672a\u547d\u540d\u4ea7\u54c1") +
      "</h2>" +
      (product.product_name_en
        ? '<div class="pad-ops-detail__subtitle">' + escapeHtml(product.product_name_en) + "</div>"
        : "") +
      '<div class="pad-ops-detail__summary">' +
      '<span class="pad-chip ' +
      (product.has_active_audio ? "pad-chip--ready" : "pad-chip--warning") +
      '">' +
      escapeHtml(product.has_active_audio ? TEXT.currentAudioReady : TEXT.currentAudioMissing) +
      "</span>" +
      (product.company ? '<span class="pad-chip">' + escapeHtml(product.company) + "</span>" : "") +
      (product.registration_number ? '<span class="pad-chip">' + escapeHtml(product.registration_number) + "</span>" : "") +
      "</div>" +
      "</div>" +
      '<div class="pad-ops-detail__actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-selected"' +
      playDisabled +
      ">" +
      escapeHtml(playLabel) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="regenerate-audio"' +
      actionDisabled +
      ">" +
      escapeHtml(generateLabel) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-upload-audio"' +
      actionDisabled +
      ">" +
      escapeHtml(uploadLabel) +
      "</button>" +
      '<input class="pad-hidden-file-input" data-action="upload-audio-input" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac" />' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-upload-image"' +
      actionDisabled +
      ">" +
      escapeHtml(uploadImageLabel) +
      "</button>" +
      '<input class="pad-hidden-file-input" data-action="upload-image-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" multiple />' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-product-info"' +
      actionDisabled +
      ">" +
      "\u4fdd\u5b58\u4ea7\u54c1" +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div class="pad-banner ' + bannerTone + '">' + escapeHtml(bannerText) + "</div>" +
      (state.assetMessage
        ? '<div class="pad-banner ' + assetToneClass + '" style="margin-top:10px;">' + escapeHtml(state.assetMessage) + "</div>"
        : "") +
      '<div class="pad-ops-detail__grid">' +
      '<section class="pad-ops-detail__card">' +
      '<div class="pad-detail__section-title">\u8bb2\u89e3\u97f3\u9891</div>' +
      '<div class="pad-detail__asset-summary">' + escapeHtml(assetSummary) + "</div>" +
      '<div class="pad-detail__field-label" style="margin-top:14px;">\u5f53\u524d\u7f13\u5b58\u6587\u5b57</div>' +
      '<div class="pad-detail__asset-text" data-testid="audio-text-current">' +
      escapeHtml(currentAudioTextDisplay) +
      "</div>" +
      '<div class="pad-detail__field-label" style="margin-top:14px;">\u91cd\u751f / \u5f55\u97f3\u7ed1\u5b9a\u6587\u5b57</div>' +
      '<textarea class="pad-detail__textarea pad-detail__textarea--compact" data-action="audio-text-draft" data-testid="audio-text-editor" rows="5"' +
      (state.assetBusy ? " disabled" : "") +
      ">" +
      escapeHtml(editableAudioText) +
      "</textarea>" +
      '<div class="pad-detail__hint">\u91cd\u751f TTS \u6216\u4e0a\u4f20\u5f55\u97f3\u65f6\uff0c\u90fd\u4f1a\u4f7f\u7528\u8fd9\u91cc\u7684\u6587\u672c\u3002</div>' +
      "</section>" +
      '<section class="pad-ops-detail__card">' +
      '<div class="pad-detail__section-title">' + escapeHtml(TEXT.introTitle) + "</div>" +
      renderProductImageSection(product) +
      '<div class="pad-detail__field-label">\u4ea7\u54c1\u540d\u79f0</div>' +
      '<input class="pad-detail__input" data-action="product-name-draft" type="text" value="' +
      escapeHtml(editableProductName) +
      '"' +
      (state.assetBusy ? " disabled" : "") +
      " />" +
      '<div class="pad-detail__field-label" style="margin-top:14px;">\u4ea7\u54c1\u63cf\u8ff0</div>' +
      '<textarea class="pad-detail__textarea pad-detail__textarea--compact" data-action="product-intro-draft" rows="5"' +
      (state.assetBusy ? " disabled" : "") +
      ">" +
      escapeHtml(editableProductIntro) +
      "</textarea>" +
      '<div class="pad-ops-detail__meta-grid">' +
      renderField(TEXT.registrationName, product.registration_name || TEXT.emptyField) +
      renderField(TEXT.registrationNumber, product.registration_number || TEXT.emptyField) +
      renderField(TEXT.effectiveDate, product.effective_date || TEXT.emptyField) +
      renderField(TEXT.company, product.company || TEXT.emptyField) +
      "</div>" +
      "</section>" +
      "</div>" +
      "</div>"
    );
  }

  function updateAudioDock() {
    const activeStationSlot =
      String(state.stationPlaybackSlotKey || '').trim()
        ? getStationSlotByKey(state.stationPlaybackSlotKey)
        : normalizeDemoRightTabKey(state.demoRightTabKey) === 'station'
          ? getActiveStationSlot()
          : null;
    if (activeStationSlot) {
      const slotTitle = getStationSlotDisplayName(activeStationSlot);
      const stopName = String(state.stationPlaybackStopName || activeStationSlot.stopName || '').trim();
      const status = getStationSlotStatus(activeStationSlot);
      if (state.stationPlaybackError) {
        refs.audioStatus.textContent = slotTitle + '?????????';
        return;
      }
      if (state.audioBusy && String(state.pendingStationSlotKey || '') === String(activeStationSlot.slotKey || '')) {
        refs.audioStatus.textContent = slotTitle + '?????????';
        return;
      }
      if (isStationSlotPlaying(activeStationSlot)) {
        refs.audioStatus.textContent = slotTitle + '????? ' + (stopName || '????');
        return;
      }
      refs.audioStatus.textContent = slotTitle + '?' + (stopName || status.text);
      return;
    }
    const product = getSelectedProduct();
    if (!product) {
      refs.audioStatus.textContent = TEXT.notSelected;
      return;
    }
    if (state.audioError) {
      if (state.audioError === TEXT.noAudio) {
        refs.audioStatus.textContent = product.product_name + '?' + TEXT.currentAudioStatusMissing;
        return;
      }
      refs.audioStatus.textContent = product.product_name + '?' + TEXT.currentAudioStatusFailed;
      return;
    }
    if (state.audioBusy) {
      refs.audioStatus.textContent = product.product_name + '?' + TEXT.currentAudioStatusPreparing;
      return;
    }
    if (isProductPlaying(product)) {
      refs.audioStatus.textContent = product.product_name + '?' + TEXT.currentAudioStatusPlaying;
      return;
    }
    refs.audioStatus.textContent =
      product.product_name + '?' + (product.has_active_audio ? TEXT.currentAudioStatusReady : TEXT.currentAudioStatusMissing);
  }

  function renderDemoShell(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell pad-shell--demo">' +
      '<section class="pad-demo-workspace">' +
      '<aside class="pad-demo-sidebar" aria-label="婵犵數濮靛ú妯侯潖婵犳艾桅婵﹩鍎甸悢鐓庣伋鐎规洖娲ㄩ、鍛存⒑绾懐鐒介柛鎰╁妿閸橆剟姊?>' +
      '<aside class="pad-demo-sidebar" aria-label="Demo mode control rail">' +
      renderDemoAudienceControls() +
      "</div>" +
      '<div class="pad-demo-sidebar__middle">' +
      renderDemoRightTabs() +
      "</div>" +
      '<div class="pad-demo-sidebar__bottom">' +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-sidebar__ops-btn" data-action="set-mode" data-mode="ops" data-testid="mode-enter-ops">' +
      "运维" +
      "</button>" +
      "</div>" +
      "</aside>" +
      '<section class="pad-demo-main">' +
      '<section class="pad-demo-main__meta">' +
      '<div class="pad-demo-main__hall">' +
      escapeHtml(hallName) +
      "</div>" +
      '<div class="pad-demo-main__badge">' +
      snapshotBadge +
      "</div>" +
      "</section>" +
      (normalizeDemoRightTabKey(state.demoRightTabKey) === "station" ? renderDemoStationPanel() : renderDemoProductPanel()) +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderOpsShell(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell">' +
      '<section class="pad-hero">' +
      '<div class="pad-hero__top">' +
      "<div>" +
      '<div class="pad-hero__eyebrow">' +
      escapeHtml(TEXT.heroEyebrow) +
      "</div>" +
      '<h1 class="pad-hero__title">' +
      escapeHtml(hallName) +
      "</h1>" +
      '<p class="pad-hero__subtitle">' +
      escapeHtml(TEXT.heroSubtitle) +
      "</p>" +
      "</div>" +
      '<div class="pad-hero__actions">' +
      renderModeToggle() +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="reload-live">' +
      escapeHtml(TEXT.refreshOnline) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="sync-offline"' +
      (state.syncBusy ? " disabled" : "") +
      ">" +
      escapeHtml(TEXT.syncOffline) +
      "</button>" +
      '<a class="pad-btn pad-btn--primary" data-testid="goto-ragint" href="/ragint/?entry=tour" style="text-decoration:none;display:inline-flex;align-items:center;">' +
      escapeHtml(TEXT.gotoRagint) +
      "</a>" +
      "</div>" +
      "</div>" +
      '<div class="pad-hero__stats">' +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statClientId) +
      '</div><div class="pad-stat__value pad-stat__value--small" data-testid="client-id">' +
      escapeHtml(state.clientId || "--") +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statProductCount) +
      '</div><div class="pad-stat__value" data-testid="product-count">' +
      escapeHtml(String(productCount)) +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statNetwork) +
      '</div><div class="pad-stat__value"><span class="pad-chip ' +
      (state.online ? "pad-chip--ready" : "pad-chip--warning") +
      '">' +
      escapeHtml(state.online ? TEXT.online : TEXT.offline) +
      "</span></div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statOffline) +
      '</div><div class="pad-stat__value">' +
      renderStatusChip() +
      "</div></div>" +
      "</div>" +
      "</section>" +
      renderDemoLayoutPanel() +
      renderStationConfigPanel() +
      renderHallSwitcher() +
      '<section class="pad-grid">' +
      '<section class="pad-panel">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">' +
      escapeHtml(TEXT.hallListTitle) +
      "</div>" +
      '<div class="pad-panel__hint" data-testid="hall-name">' +
      escapeHtml(hallName) +
      "</div>" +
      "</div>" +
      snapshotBadge +
      "</div>" +
      renderProductCards() +
      "</section>" +
      '<section class="pad-panel">' +
      renderDetailPanel() +
      '<div class="pad-panel__header" style="padding-top:0;">' +
      '<div class="pad-panel__hint">' +
      escapeHtml(TEXT.lastSyncAt) +
      '<span data-testid="last-sync-at">' +
      escapeHtml(formatTimestamp(state.lastSyncedAtMs)) +
      "</span></div>" +
      "</div>" +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderDemoStationTabs() {
    return (
      '<div class="pad-demo-station-tabs" role="tablist" aria-label="站台切换">' +
      STATION_SLOT_KEYS.map((slotKey) => {
        const slot = getStationSlotByKey(slotKey);
        const active = normalizeDemoLeftTabKey(state.demoLeftTabKey) === slotKey;
        return (
          '<button type="button" class="pad-demo-station-tab' +
          (active ? " is-active" : "") +
          '" data-action="set-demo-left-tab" data-tab-key="' +
          escapeHtml(slotKey) +
          '" role="tab" aria-selected="' +
          (active ? "true" : "false") +
          '">' +
          '<span class="pad-demo-station-tab__label">' +
          escapeHtml(getStationSlotDisplayName(slot)) +
          "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderDemoStationSummary() {
    const slot = getActiveStationSlot();
    const status = getStationSlotStatus(slot);
    const recordingLabel = formatRecordingLabel(
      getRecordingOption(slot.recordingId) || (getRecordingMetaEntry(slot.recordingId) && getRecordingMetaEntry(slot.recordingId).data) || { recording_id: slot.recordingId }
    );
    const stopName = String(slot.stopName || "").trim() || "--";
    const recordingId = String(slot.recordingId || "").trim() || "--";
    return (
      '<section class="pad-demo-station-summary">' +
      '<div class="pad-demo-station-summary__header">' +
      "<div>" +
      '<div class="pad-demo-station-summary__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-demo-station-summary__hint">选择左侧站位后，可以查看当前绑定的存档与站台，并在下方面板中播放对应讲解。</div>' +
      "</div>" +
      renderToneChip(status.text, status.tone) +
      "</div>" +
      '<div class="pad-demo-station-summary__meta">' +
      '<div class="pad-demo-station-summary__field"><span>当前站台</span><strong>' +
      escapeHtml(stopName) +
      "</strong></div>" +
      '<div class="pad-demo-station-summary__field"><span>播放存档</span><strong>' +
      escapeHtml(recordingLabel) +
      "</strong></div>" +
      '<div class="pad-demo-station-summary__field"><span>存档 ID</span><strong>' +
      escapeHtml(recordingId) +
      "</strong></div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoRightTabs() {
    const tabs = [
      { key: "product", label: "单个产品讲解" },
      { key: "station", label: "当前站台讲解" },
    ];
    return (
      '<div class="pad-demo-right-tabs" role="tablist" aria-label="讲解模式切换">' +
      tabs
        .map((tab) => {
          const active = normalizeDemoRightTabKey(state.demoRightTabKey) === tab.key;
          return (
            '<button type="button" class="pad-demo-right-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-demo-right-tab" data-tab-key="' +
            escapeHtml(tab.key) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            '<span class="pad-demo-right-tab__text">' +
            escapeHtml(tab.label) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderDemoProductPanel() {
    return (
      '<section class="pad-demo-panel pad-demo-panel--audience">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">单个产品讲解</div>' +
      '<div class="pad-demo-panel__hint">选择下方产品卡片后，可播放当前生效音频并查看该产品的基础信息。</div>' +
      "</div>" +
      "</div>" +
      renderDemoItems() +
      "</section>"
    );
  }

  function renderDemoStationPanel() {
    const slot = getActiveStationSlot();
    const status = getStationSlotStatus(slot);
    const recordingEntry = getRecordingOption(slot.recordingId) || (getRecordingMetaEntry(slot.recordingId) && getRecordingMetaEntry(slot.recordingId).data) || null;
    const recordingLabel = formatRecordingLabel(recordingEntry || { recording_id: slot.recordingId });
    const stopName = String(slot.stopName || "").trim() || "--";
    const active = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const buttonLabel = active ? "停止站台讲解" : "播放站台讲解";
    const buttonDisabled = !active && !status.playable ? " disabled" : "";
    const bannerToneClass =
      state.stationPlaybackError || status.tone === "danger"
        ? "pad-banner--danger"
        : status.tone === "warning"
          ? "pad-banner--warning"
          : status.tone === "ready"
            ? "pad-banner--ready"
            : "pad-banner--pending";
    const bannerText = state.stationPlaybackError || status.text;
    const answerPreview =
      String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "") && String(state.stationPlaybackAnswerText || "").trim()
        ? String(state.stationPlaybackAnswerText || "").trim()
        : "";
    return (
      '<section class="pad-demo-panel pad-demo-panel--station">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">当前站台讲解</div>' +
      '<div class="pad-demo-panel__hint">选择站位、存档和站台后，可以播放对应存档音频，并查看当前站台的讲解文本预览。</div>' +
      "</div>" +
      "</div>" +
      '<div class="pad-station-playback">' +
      '<div class="pad-station-playback__card">' +
      '<div class="pad-station-playback__head">' +
      "<div>" +
      '<div class="pad-station-playback__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-station-playback__subtitle">' +
      escapeHtml(stopName) +
      "</div>" +
      "</div>" +
      (active
        ? '<span class="pad-demo-item__badge pad-demo-item__badge--playing"><span class="pad-wave" aria-hidden="true"><span></span><span></span><span></span></span><span>' +
          escapeHtml(isStationSlotPending(slot) ? "准备中" : "播放中") +
          "</span></span>"
        : renderToneChip(status.text, status.tone)) +
      "</div>" +
      '<div class="pad-banner ' + bannerToneClass + '">' + escapeHtml(bannerText) + "</div>" +
      '<div class="pad-station-playback__meta">' +
      '<div class="pad-station-playback__field"><span>播放存档</span><strong>' +
      escapeHtml(recordingLabel) +
      "</strong></div>" +
      '<div class="pad-station-playback__field"><span>存档 ID</span><strong>' +
      escapeHtml(String(slot.recordingId || "").trim() || "--") +
      "</strong></div>" +
      '<div class="pad-station-playback__field"><span>音频片段数</span><strong>' +
      escapeHtml(
        String(
          Array.isArray(state.stationPlaybackQueue) && String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "")
            ? state.stationPlaybackQueue.length
            : 0
        )
      ) +
      "</strong></div>" +
      "</div>" +
      '<div class="pad-station-playback__actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-station-slot" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      buttonDisabled +
      ">" +
      escapeHtml(buttonLabel) +
      "</button>" +
      "</div>" +
      (answerPreview
        ? '<div class="pad-station-playback__preview"><div class="pad-station-playback__preview-title">讲解文本预览</div><div class="pad-station-playback__preview-text">' +
          escapeHtml(answerPreview) +
          "</div></div>"
        : "") +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderStationConfigPanel() {
    const panelHeader =
      '<section class="pad-panel pad-station-config-panel">' +
      '<div class="pad-panel__header pad-station-config-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">站台讲解配置</div>' +
      '<div class="pad-panel__hint">支持配置 2 个站位，分别绑定存档和站台，用于现场快速播放。</div>' +
      "</div>" +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">刷新存档</button>' +
      "</div>";
    const body = STATION_SLOT_KEYS.map((slotKey, index) => {
      const slot = getStationSlotByKey(slotKey);
      const metaEntry = getRecordingMetaEntry(slot.recordingId);
      const stops = getRecordingStops(slot.recordingId);
      const status = getStationSlotStatus(slot);
      const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
      if (slot.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(slot.recordingId || ""))) {
        recordingOptions.unshift({
          recording_id: String(slot.recordingId || ""),
          display_name: "当前已选存档",
        });
      }
      const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
      const stopOptions = [];
      if (selectedStopIndex != null && (!stops.length || selectedStopIndex >= stops.length)) {
        stopOptions.push('<option value="' + escapeHtml(String(selectedStopIndex)) + '" selected>当前站台已失效</option>');
      }
      stops.forEach((stopName, stopIndex) => {
        stopOptions.push(
          '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (selectedStopIndex === stopIndex ? ' selected' : '') +
            '>' +
            escapeHtml(stopName) +
            '</option>'
        );
      });
      return (
        '<div class="pad-station-config-panel__item">' +
        '<div class="pad-station-config-panel__item-header">' +
        '<div class="pad-station-config-panel__item-title">站位 ' + escapeHtml(String(index + 1)) + '</div>' +
        renderToneChip(status.text, status.tone) +
        '</div>' +
        '<label class="pad-station-config-panel__field"><span>显示名</span><input type="text" data-action="station-slot-label" data-slot-key="' +
        escapeHtml(String(slot.slotKey || '')) +
        '" value="' +
        escapeHtml(String(slot.label || '')) +
        '" placeholder="例如：入口欢迎 / 核心器械" /></label>' +
        '<label class="pad-station-config-panel__field"><span>播放存档</span><select data-action="station-slot-recording" data-slot-key="' +
        escapeHtml(String(slot.slotKey || '')) +
        '">' +
        '<option value="">请选择存档</option>' +
        recordingOptions
          .map((item) => {
            const recordingId = String(item && item.recording_id ? item.recording_id : '').trim();
            return (
              '<option value="' +
              escapeHtml(recordingId) +
              '"' +
              (recordingId === String(slot.recordingId || '') ? ' selected' : '') +
              '>' +
              escapeHtml(formatRecordingLabel(item)) +
              '</option>'
            );
          })
          .join('') +
        '</select></label>' +
        '<label class="pad-station-config-panel__field"><span>站台</span><select data-action="station-slot-stop" data-slot-key="' +
        escapeHtml(String(slot.slotKey || '')) +
        '"' +
        (!slot.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? ' disabled' : '') +
        '>' +
        '<option value="">' + escapeHtml(metaEntry && metaEntry.loading ? '正在加载站台...' : '请选择站台') + '</option>' +
        stopOptions.join('') +
        '</select></label>' +
        '<div class="pad-station-config-panel__preview">' +
        '<div class="pad-station-config-panel__preview-title">当前配置</div>' +
        '<div class="pad-station-config-panel__preview-row"><span>站台</span><strong>' +
        escapeHtml(String(slot.stopName || '').trim() || '--') +
        '</strong></div>' +
        '<div class="pad-station-config-panel__preview-row"><span>存档</span><strong>' +
        escapeHtml(formatRecordingLabel(getRecordingOption(slot.recordingId) || (metaEntry && metaEntry.data) || { recording_id: slot.recordingId })) +
        '</strong></div>' +
        '<div class="pad-station-config-panel__preview-row"><span>状态</span><strong>' +
        escapeHtml(metaEntry && metaEntry.error ? metaEntry.error : metaEntry && metaEntry.loading ? '正在加载' : status.text) +
        '</strong></div>' +
        '</div>' +
        '</div>'
      );
    }).join('');
    const errorBanner = state.recordingOptionsError
      ? '<div class="pad-banner pad-banner--danger" style="margin: 0 22px 18px;">' + escapeHtml(state.recordingOptionsError) + '</div>'
      : '';
    return panelHeader + '<div class="pad-station-config-panel__body">' + body + '</div>' + errorBanner + '</section>';
  }

  function renderDemoRightTabsV2() {
    const tabs = [
      { key: "product", label: "单品讲解" },
      { key: "station", label: "站台讲解" },
    ];
    return (
      '<div class="pad-demo-right-tabs" role="tablist" aria-label="Narration modes">' +
      tabs
        .map((tab) => {
          const active = normalizeDemoRightTabKey(state.demoRightTabKey) === tab.key;
          return (
            '<button type="button" class="pad-demo-right-tab' +
            (active ? " is-active" : "") +
            '" data-action="set-demo-right-tab" data-tab-key="' +
            escapeHtml(tab.key) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            '<span class="pad-demo-right-tab__text">' +
            escapeHtml(tab.label) +
            "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderSceneEditorPanel() {
    const scenes = Array.isArray(state.scenes) ? state.scenes : [];
    const selectedScene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(selectedScene);
    return (
      '<section class="pad-panel pad-scene-editor">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">场景图热点编辑</div>' +
      '<div class="pad-panel__hint">上传背景图后，可在画面上拖拽创建热点，拖动热点移动位置，拖动右下角手柄调整大小。</div>' +
      "</div>" +
      '<div class="pad-scene-editor__header-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-scene-meta"' +
      (selectedScene ? "" : " disabled") +
      ">保存场景</button>" +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__layout">' +
      '<div class="pad-scene-editor__sidebar">' +
      '<div class="pad-scene-editor__sidebar-title">场景列表</div>' +
      '<div class="pad-scene-editor__scene-list">' +
      (scenes.length
        ? scenes
            .map((scene) => {
              const active = String(scene.scene_id || "") === String(state.selectedSceneId || "");
              return (
                '<button type="button" class="pad-scene-editor__scene-btn' +
                (active ? " is-active" : "") +
                '" data-action="set-selected-scene" data-scene-id="' +
                escapeHtml(String(scene.scene_id || "")) +
                '">' +
                escapeHtml(String(scene.name || "")) +
                "</button>"
              );
            })
            .join("")
        : '<div class="pad-empty" style="margin:0;">还没有场景图</div>') +
      "</div>" +
      '<div class="pad-scene-editor__create">' +
      '<label class="pad-station-config-panel__field"><span>新场景名称</span><input type="text" data-action="scene-create-name" placeholder="例如：心内场景 1" /></label>' +
      '<label class="pad-station-config-panel__field"><span>排序</span><input type="number" data-action="scene-create-sort-order" value="' +
      escapeHtml(String(scenes.length + 1)) +
      '" min="0" step="1" /></label>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-create-scene-image">上传并新建场景</button>' +
      '<input class="pad-hidden-file-input" data-action="scene-create-image-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__stage-wrap">' +
      (selectedScene
        ? '<div class="pad-scene-editor__scene-meta">' +
          '<label class="pad-station-config-panel__field"><span>场景名称</span><input type="text" data-action="scene-name" value="' +
          escapeHtml(String(selectedScene.name || "")) +
          '" /></label>' +
          '<label class="pad-station-config-panel__field"><span>排序</span><input type="number" data-action="scene-sort-order" value="' +
          escapeHtml(String(selectedScene.sort_order || 0)) +
          '" min="0" step="1" /></label>' +
          '<div class="pad-scene-editor__scene-actions">' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-scene-background">替换背景图</button>' +
          '<input class="pad-hidden-file-input" data-action="scene-background-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="delete-scene">删除场景</button>' +
          "</div>" +
          "</div>" +
          renderSceneStage(selectedScene, { editor: true })
        : '<div class="pad-empty">请先上传一张背景图创建场景。</div>') +
      "</div>" +
      '<div class="pad-scene-editor__inspector">' +
      '<div class="pad-scene-editor__sidebar-title">热点内容</div>' +
      '<div class="pad-scene-editor__scene-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="enter-station-hotspot-create" aria-pressed="' +
      (state.sceneEditorCreateMode ? "true" : "false") +
      '">' +
      escapeHtml(state.sceneEditorCreateMode ? "正在新建热区" : "新建产品热区") +
      "</button>" +
      "</div>" +
      '<div class="pad-scene-editor__scene-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="enter-station-hotspot-create" aria-pressed="' +
      (state.sceneEditorCreateMode ? "true" : "false") +
      '">' +
      escapeHtml(state.sceneEditorCreateMode ? "正在新建热区" : "新建产品热区") +
      "</button>" +
      "</div>" +
        '<div class="pad-scene-editor__scene-actions">' +
        '<button type="button" class="pad-btn pad-btn--neutral" data-action="enter-station-hotspot-create" aria-pressed="' +
        (state.sceneEditorCreateMode ? "true" : "false") +
        '">' +
        escapeHtml(state.sceneEditorCreateMode ? "正在新建热区" : "新建产品热区") +
        "</button>" +
        "</div>" +
        (draft
        ? '<label class="pad-station-config-panel__field"><span>标题</span><input type="text" data-action="scene-draft-title" value="' +
          escapeHtml(String(draft.title || "")) +
          '" /></label>' +
          '<label class="pad-station-config-panel__field"><span>说明</span><textarea class="pad-detail__textarea pad-detail__textarea--compact" data-action="scene-draft-content" rows="6">' +
          escapeHtml(String(draft.content_text || "")) +
          "</textarea></label>" +
          '<label class="pad-station-config-panel__field"><span>排序</span><input type="number" data-action="scene-draft-sort-order" value="' +
          escapeHtml(String(draft.sort_order || 0)) +
          '" min="0" step="1" /></label>' +
          '<div class="pad-scene-editor__draft-meta">x ' +
          escapeHtml((clampPct(draft.x_pct) * 100).toFixed(1)) +
          '% / y ' +
          escapeHtml((clampPct(draft.y_pct) * 100).toFixed(1)) +
          '% / w ' +
          escapeHtml((clampPct(draft.width_pct) * 100).toFixed(1)) +
          '% / h ' +
          escapeHtml((clampPct(draft.height_pct) * 100).toFixed(1)) +
          "%</div>" +
          '<div class="pad-scene-editor__scene-actions">' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-scene-hotspot">保存热点</button>' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="clear-scene-draft">取消选择</button>' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="delete-scene-hotspot"' +
          (draft.hotspot_id ? "" : " disabled") +
          ">删除热点</button>" +
          "</div>"
        : '<div class="pad-empty" style="margin:0;">点击或框选一个热点后，在这里填写标题和说明。</div>') +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoShellV2(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell pad-shell--demo">' +
      '<section class="pad-demo-workspace">' +
      '<aside class="pad-demo-sidebar" aria-label="Demo mode control rail">' +
      '<div class="pad-demo-sidebar__top">' +
      (normalizeDemoRightTabKey(state.demoRightTabKey) === "station" ? renderDemoStationTabs() : renderDemoSceneTabs()) +
      "</div>" +
      '<div class="pad-demo-sidebar__middle">' +
      renderDemoRightTabsV2() +
      "</div>" +
      '<div class="pad-demo-sidebar__bottom">' +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-sidebar__ops-btn" data-action="set-mode" data-mode="ops" data-testid="mode-enter-ops">运维</button>' +
      "</div>" +
      "</aside>" +
      '<section class="pad-demo-main">' +
      '<section class="pad-demo-main__meta">' +
      '<div class="pad-demo-main__hall">' +
      escapeHtml(hallName) +
      "</div>" +
      '<div class="pad-demo-main__badge">' +
      snapshotBadge +
      "</div>" +
      "</section>" +
      (normalizeDemoRightTabKey(state.demoRightTabKey) === "scene"
        ? renderDemoScenePanel()
        : normalizeDemoRightTabKey(state.demoRightTabKey) === "station"
          ? renderDemoStationPanel()
          : renderDemoProductPanel()) +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderOpsShellV2(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell">' +
      '<section class="pad-hero">' +
      '<div class="pad-hero__top">' +
      "<div>" +
      '<div class="pad-hero__eyebrow">' +
      escapeHtml(TEXT.heroEyebrow) +
      "</div>" +
      '<h1 class="pad-hero__title">' +
      escapeHtml(hallName) +
      "</h1>" +
      '<p class="pad-hero__subtitle">' +
      escapeHtml(TEXT.heroSubtitle) +
      "</p>" +
      "</div>" +
      '<div class="pad-hero__actions">' +
      renderModeToggle() +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="reload-live">' +
      escapeHtml(TEXT.refreshOnline) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="sync-offline"' +
      (state.syncBusy ? " disabled" : "") +
      ">" +
      escapeHtml(TEXT.syncOffline) +
      "</button>" +
      '<a class="pad-btn pad-btn--primary" data-testid="goto-ragint" href="/ragint/?entry=tour" style="text-decoration:none;display:inline-flex;align-items:center;">' +
      escapeHtml(TEXT.gotoRagint) +
      "</a>" +
      "</div>" +
      "</div>" +
      '<div class="pad-hero__stats">' +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statClientId) +
      '</div><div class="pad-stat__value pad-stat__value--small" data-testid="client-id">' +
      escapeHtml(state.clientId || "--") +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statProductCount) +
      '</div><div class="pad-stat__value" data-testid="product-count">' +
      escapeHtml(String(productCount)) +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">Display stations</div><div class="pad-stat__value">' +
      escapeHtml(String((Array.isArray(state.demoStationSlots) ? state.demoStationSlots.length : 0))) +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statOffline) +
      '</div><div class="pad-stat__value">' +
      renderStatusChip() +
      "</div></div>" +
      "</div>" +
      "</section>" +
      renderDemoLayoutPanel() +
      renderStationConfigPanel() +
      renderHallSwitcher() +
      '<section class="pad-grid">' +
      '<section class="pad-panel">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">' +
      escapeHtml(TEXT.hallListTitle) +
      "</div>" +
      '<div class="pad-panel__hint" data-testid="hall-name">' +
      escapeHtml(hallName) +
      "</div>" +
      "</div>" +
      snapshotBadge +
      "</div>" +
      renderProductCards() +
      "</section>" +
      '<section class="pad-panel">' +
      renderDetailPanel() +
      '<div class="pad-panel__header" style="padding-top:0;">' +
      '<div class="pad-panel__hint">' +
      escapeHtml(TEXT.lastSyncAt) +
      '<span data-testid="last-sync-at">' +
      escapeHtml(formatTimestamp(state.lastSyncedAtMs)) +
      "</span></div>" +
      "</div>" +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderStationVisualPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const mode = normalizeDemoRightTabKey(state.demoRightTabKey);
    const stationStatus = getStationSlotStatus(slot);
    const stationButtonActive = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const stationButtonDisabled = !stationButtonActive && !stationStatus.playable ? " disabled" : "";
    const selectedProduct = getSelectedProduct();
    return (
      '<section class="pad-demo-panel pad-demo-panel--scene">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-demo-panel__hint">点击线框图中对应产品区域播放单品讲解；点击按钮播放当前站点讲解。</div>' +
      "</div>" +
      '<div class="pad-station-playback__actions">' +
      renderToneChip(stationStatus.text, stationStatus.tone) +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-station-slot" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      stationButtonDisabled +
      ">" +
      escapeHtml(stationButtonActive ? "停止站点讲解" : "播放站点讲解") +
      "</button>" +
      "</div>" +
      "</div>" +
      (stationVisual
        ? renderSceneStage(stationVisual, { editor: false, showLabels: false, stretchToFit: true, interactiveOnly: true })
        : '<div class="pad-empty">当前站点尚未配置背景图。</div>') +
      '<div class="pad-detail__hint" style="margin-top:12px;">' +
      escapeHtml(
        selectedProduct && String(selectedProduct.product_id || "").trim()
          ? "当前选中产品：" + String(selectedProduct.product_name || "").trim()
          : "点击产品热区后会自动切换到对应产品并播放当前生效音频。"
      ) +
      "</div>" +
      "</section>"
    );
  }

  function renderStationTimelineEventTypeOptions(selectedType) {
    const currentType = normalizeTimelineEventType(selectedType);
    return Object.keys(TIMELINE_EVENT_TYPE_LABELS)
      .map(
        (key) =>
          '<option value="' +
          escapeHtml(key) +
          '"' +
          (key === currentType ? " selected" : "") +
          ">" +
          escapeHtml(TIMELINE_EVENT_TYPE_LABELS[key]) +
          "</option>"
      )
      .join("");
  }

  function renderStationTimelineEventItem(slot, scene, event, index, total) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const currentIndex = Number(index);
    const hotspotOptions = getStationTimelineHotspotOptions(scene, event && event.hotspotId);
    const missingHotspot = !findStationTimelineHotspot(scene, event && event.hotspotId);
    const isPreviewActive =
      String(state.highlightedHotspotId || "").trim() === String(event && event.hotspotId ? event.hotspotId : "").trim();
    return (
      '<div class="pad-station-timeline__item' +
      (missingHotspot ? " is-invalid" : "") +
      (isPreviewActive ? " is-preview-active" : "") +
      '">' +
      '<div class="pad-station-timeline__rail" aria-hidden="true">' +
      '<span class="pad-station-timeline__dot"></span>' +
      '<span class="pad-station-timeline__line' +
      (currentIndex >= total - 1 ? " is-hidden" : "") +
      '"></span>' +
      "</div>" +
      '<div class="pad-station-timeline__card">' +
      '<div class="pad-station-timeline__card-top">' +
      "<div>" +
      '<div class="pad-station-timeline__card-title">节点 ' +
      escapeHtml(String(currentIndex + 1)) +
      "</div>" +
      '<div class="pad-station-timeline__card-subtitle">' +
      escapeHtml(formatTimelineOffset(event && event.timeMs)) +
      "</div>" +
      "</div>" +
      '<div class="pad-station-timeline__actions">' +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-move-up" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '"' +
      (currentIndex <= 0 ? " disabled" : "") +
      ">上移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-move-down" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '"' +
      (currentIndex >= total - 1 ? " disabled" : "") +
      ">下移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-remove" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '">删除</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-station-timeline__grid">' +
      '<label class="pad-station-config-panel__field"><span>触发时间 (ms)</span><input type="number" min="0" step="100" data-action="station-timeline-time-ms" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '" value="' +
      escapeHtml(String(normalizeTimelineEventTimeMs(event && event.timeMs))) +
      '" /></label>' +
      '<label class="pad-station-config-panel__field"><span>目标热区</span><select data-action="station-timeline-hotspot" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-index="' +
      escapeHtml(String(currentIndex)) +
      '">' +
      hotspotOptions
        .map((hotspot) => {
          const hotspotId = String(hotspot && hotspot.hotspot_id ? hotspot.hotspot_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(hotspotId) +
            '"' +
            (hotspotId === String(event && event.hotspotId ? event.hotspotId : "").trim() ? " selected" : "") +
            ">" +
            escapeHtml(getStationTimelineHotspotLabel(scene, hotspotId)) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<div class="pad-station-config-panel__field"><span>事件类型</span><strong>切换焦点</strong></div>' +
      "</div>" +
      '<div class="pad-station-timeline__summary' +
      (missingHotspot ? " is-danger" : "") +
      '">' +
      escapeHtml(getStationTimelineEventSummary(scene, event)) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderStationTimelineScrubber(slot, scene, timelineEvents) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const currentMs = getStationPlaybackCurrentTimeMs();
    const durationMs = getStationPlaybackDurationMs();
    const selection = getStationTimelineSelection(slotKey);
    const totalMs = Math.max(getStationTimelineVisualMaxMs(slotKey), 1);
    const selectionStartPct = selection ? (selection.startMs / totalMs) * 100 : 0;
    const selectionWidthPct = selection ? Math.max(0, ((selection.endMs - selection.startMs) / totalMs) * 100) : 0;
    const playheadPct = Math.min(100, Math.max(0, (currentMs / totalMs) * 100));
    const targetHotspot = getTimelineSelectedTargetHotspot(scene);
    const rangeLabel = selection
      ? formatTimelineOffset(selection.startMs) + " - " + formatTimelineOffset(selection.endMs)
      : "No range selected";
    return (
      '<div class="pad-station-timeline__scrubber">' +
      '<div class="pad-station-timeline__scrubber-meta">' +
      '<span>Timeline</span>' +
      '<span>Length ' + escapeHtml(formatTimelineOffset(durationMs || totalMs)) + '</span>' +
      '<span>Range ' + escapeHtml(rangeLabel) + '</span>' +
      "</div>" +
      '<div class="pad-station-timeline__track" data-role="station-timeline-track" data-slot-key="' +
      escapeHtml(slotKey) +
      '">' +
      (selection
        ? '<div class="pad-station-timeline__selection" style="left:' +
          escapeHtml(String(selectionStartPct)) +
          "%;width:" +
          escapeHtml(String(selectionWidthPct)) +
          '%;">' +
          '<button type="button" class="pad-station-timeline__selection-handle is-start" data-action="station-timeline-drag-highlight-start" data-slot-key="' +
          escapeHtml(slotKey) +
          '" aria-label="拖动高亮开始"></button>' +
          '<button type="button" class="pad-station-timeline__selection-handle is-end" data-action="station-timeline-drag-highlight-end" data-slot-key="' +
          escapeHtml(slotKey) +
          '" aria-label="拖动高亮结束"></button>' +
          "</div>"
        : "") +
      timelineEvents
        .map((event) => {
          const eventPct = Math.min(100, Math.max(0, (normalizeTimelineEventTimeMs(event.timeMs) / totalMs) * 100));
          return (
            '<button type="button" class="pad-station-timeline__marker" data-action="station-timeline-seek-marker" data-slot-key="' +
            escapeHtml(slotKey) +
            '" data-time-ms="' +
            escapeHtml(String(normalizeTimelineEventTimeMs(event.timeMs))) +
            '" style="left:' +
            escapeHtml(String(eventPct)) +
            '%;" title="' +
            escapeHtml(getStationTimelineEventSummary(scene, event)) +
            '"></button>'
          );
        })
        .join("") +
      '<button type="button" class="pad-station-timeline__playhead" data-action="station-timeline-drag-playhead" data-slot-key="' +
      escapeHtml(slotKey) +
      '" style="left:' +
      escapeHtml(String(playheadPct)) +
      '%;" aria-label="拖动播放位置"></button>' +
      "</div>" +
      '<div class="pad-station-timeline__selection-tools">' +
      '<button type="button" class="pad-station-timeline__action" data-action="station-timeline-delete-highlight" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (selection ? "" : " disabled") +
      '>删除高亮区间</button>' +
      '<div class="pad-station-timeline__selection-hint">' +
      escapeHtml(
        targetHotspot
          ? "Current target: " + getStationTimelineHotspotLabel(scene, targetHotspot.hotspot_id) + ". Drag on the timeline to create or overwrite the highlight range."
          : "Select a product hotspot before dragging a highlight range."
      ) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderStationTimelineEditor(slot, scene) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const timelineEvents = getStationTimelineEditableEvents(
      normalizeStationTimelineEditorEvents(slot && slot.timelineEvents, scene)
    );
    const hotspotOptions = getStationTimelineHotspotOptions(scene);
    return (
      '<div class="pad-station-timeline">' +
      '<div class="pad-station-timeline__header">' +
      "<div>" +
      '<div class="pad-station-timeline__title">站点讲解时间轴</div>' +
      '<div class="pad-panel__hint">用可视化节点管理讲解过程中的热区切换顺序。</div>' +
      "</div>" +
      '<div style="display:flex; align-items:flex-start; justify-content:flex-end; gap:12px; flex-wrap:wrap;">' +
      renderStationTimelinePlaybackControls(slot) +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="station-timeline-add" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (hotspotOptions.length ? "" : " disabled") +
      ">新增节点</button>" +
      "</div>" +
      "</div>" +
      (!hotspotOptions.length
        ? '<div class="pad-banner pad-banner--warning" style="margin-top:14px;">当前站点还没有可用热区，请先在右侧创建产品热区。</div>'
        : "") +
      renderStationTimelineScrubber(slot, scene, timelineEvents) +
      (timelineEvents.length
        ? '<div class="pad-station-timeline__list">' +
          timelineEvents
            .map((event, index) => renderStationTimelineEventItem(slot, scene, event, index, timelineEvents.length))
            .join("") +
          "</div>"
        : '<div class="pad-station-timeline__empty">暂未配置讲解时间轴，播放时不会自动切换高亮。</div>') +
      "</div>"
    );
  }

  function renderStationFusionConfigPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const draft = getSceneEditorDraftForScene(stationVisual);
    const metaEntry = getRecordingMetaEntry(slot.recordingId);
    const stops = getRecordingStops(slot.recordingId);
    const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
    const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
    if (slot.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(slot.recordingId || ""))) {
      recordingOptions.unshift({
        recording_id: String(slot.recordingId || ""),
        display_name: "当前已选存档",
      });
    }
    return (
      '<section class="pad-panel pad-scene-editor">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">站点融合配置</div>' +
      '<div class="pad-panel__hint">为每个站点配置讲解绑定、背景图、线框图和产品热区。</div>' +
      "</div>" +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">刷新存档</button>' +
      "</div>" +
      '<div class="pad-scene-editor__layout">' +
      '<div class="pad-scene-editor__sidebar">' +
      '<div class="pad-scene-editor__sidebar-title">站点切换</div>' +
      '<div style="margin-top:12px;">' +
      renderDemoStationTabs() +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__stage-wrap">' +
      '<div class="pad-scene-editor__scene-meta">' +
      '<label class="pad-station-config-panel__field"><span>真实站点</span><select data-action="station-slot-id" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      (Array.isArray(state.stationCatalog) ? state.stationCatalog : [])
        .map((item) => {
          const stationId = String(item && item.station_id ? item.station_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(stationId) +
            '"' +
            (stationId === String(slot.stationId || "") ? " selected" : "") +
            ">" +
            escapeHtml(String(item && item.label ? item.label : stationId).trim() || stationId) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>显示名</span><input type="text" data-action="station-slot-label" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '" value="' +
      escapeHtml(String(slot.label || "")) +
      '" /></label>' +
      '<label class="pad-station-config-panel__field"><span>播放存档</span><select data-action="station-slot-recording" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      '<option value="">请选择存档</option>' +
      recordingOptions
        .map((item) => {
          const recordingId = String(item && item.recording_id ? item.recording_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(recordingId) +
            '"' +
            (recordingId === String(slot.recordingId || "") ? " selected" : "") +
            ">" +
            escapeHtml(formatRecordingLabel(item)) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>站台</span><select data-action="station-slot-stop" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (!slot.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? " disabled" : "") +
      ">" +
      '<option value="">' +
      escapeHtml(metaEntry && metaEntry.loading ? "正在加载站台..." : "请选择站台") +
      "</option>" +
      stops
        .map((stopName, stopIndex) => {
          return (
            '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (selectedStopIndex === stopIndex ? " selected" : "") +
            ">" +
            escapeHtml(stopName) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      renderStationTimelineEditor(slot, stationVisual) +
      '<div class="pad-scene-editor__scene-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">保存站点配置</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-background">上传背景图</button>' +
      '<input class="pad-hidden-file-input" data-action="station-background-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      '<button type="button" class="pad-btn pad-btn--neutral' +
      (state.sceneEditorCreateMode ? " is-active" : "") +
      '" data-action="enter-station-hotspot-create" aria-pressed="' +
      (state.sceneEditorCreateMode ? "true" : "false") +
      '">' +
      escapeHtml(state.sceneEditorCreateMode ? "正在新建热区" : "新建产品热区") +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-wireframe">上传线框图</button>' +
      '<input class="pad-hidden-file-input" data-action="station-wireframe-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      "</div>" +
      "</div>" +
      (stationVisual
        ? renderSceneStage(stationVisual, { editor: true, showLabels: true, stretchToFit: true })
        : '<div class="pad-empty">请先为当前站点上传背景图。</div>') +
      "</div>" +
      '<div class="pad-scene-editor__inspector">' +
      '<div class="pad-scene-editor__sidebar-title">产品热区</div>' +
      '<div class="pad-panel__hint">\u62d6\u52a8\u6216\u7f29\u653e\u5df2\u6709\u70ed\u533a\u540e\u4f1a\u81ea\u52a8\u4fdd\u5b58\uff1b\u65b0\u5efa\u70ed\u533a\u9009\u62e9\u4ea7\u54c1\u540e\u4f1a\u81ea\u52a8\u4fdd\u5b58\u3002</div>' +
      (draft
        ? '<label class="pad-station-config-panel__field"><span>绑定产品</span><select data-action="station-hotspot-product">' +
          '<option value="">请选择产品</option>' +
          (Array.isArray(state.products) ? state.products : [])
            .map((product) => {
              const productId = String(product && product.product_id ? product.product_id : "").trim();
              return (
                '<option value="' +
                escapeHtml(productId) +
                '"' +
                (productId === String(draft.product_id || "") ? " selected" : "") +
                ">" +
                escapeHtml(String(product.product_name || "").trim() || productId) +
                "</option>"
              );
            })
            .join("") +
          "</select></label>" +
          '<label class="pad-station-config-panel__field"><span>排序</span><input type="number" data-action="station-hotspot-sort-order" value="' +
          escapeHtml(String(draft.sort_order || 0)) +
          '" min="0" step="1" /></label>' +
          '<div class="pad-scene-editor__draft-meta">x ' +
          escapeHtml((clampPct(draft.x_pct) * 100).toFixed(1)) +
          '% / y ' +
          escapeHtml((clampPct(draft.y_pct) * 100).toFixed(1)) +
          '% / w ' +
          escapeHtml((clampPct(draft.width_pct) * 100).toFixed(1)) +
          '% / h ' +
          escapeHtml((clampPct(draft.height_pct) * 100).toFixed(1)) +
          "%</div>" +
          '<div class="pad-scene-editor__scene-actions">' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-hotspot">保存热区</button>' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="clear-station-hotspot-draft">取消选择</button>' +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="delete-station-hotspot"' +
          (draft.hotspot_id ? "" : " disabled") +
          ">删除热区</button>" +
          "</div>"
        : '<div class="pad-empty" style="margin:0;">在中间画面上框选一个区域，或点击已有热区后再绑定产品。</div>') +
      "</div>" +
      "</div>" +
      (state.recordingOptionsError
        ? '<div class="pad-banner pad-banner--danger" style="margin: 0 22px 22px;">' + escapeHtml(state.recordingOptionsError) + "</div>"
        : "") +
      "</section>"
    );
  }

  function getNarrationNodeVisualMaxMs(slotKey, node) {
    const item = node && typeof node === "object" ? node : null;
    if (!item) return 1000;
    const runtimeNode =
      (Array.isArray(state.stationPlaybackNodes) ? state.stationPlaybackNodes : []).find(
        (entry) => String(entry && entry.nodeId ? entry.nodeId : "").trim() === String(item.nodeId || "").trim()
      ) || null;
    const currentNodeId = String(state.stationPlaybackNodeId || "").trim();
    const currentTotalMs =
      currentNodeId && currentNodeId === String(item.nodeId || "").trim()
        ? Math.max(0, Number((runtimeNode && runtimeNode.durationMs) || state.stationPlaybackTotalDurationMs || 0))
        : 0;
    const cachedStopDurationMs = getCachedNarrationStopDurationMs(item.recordingId, item.stopIndex);
    if (!cachedStopDurationMs) {
      void ensureNarrationStopDurationMs(item.recordingId, item.stopIndex);
    }
    return Math.max(
      1000,
      cachedStopDurationMs,
      currentTotalMs,
      Number(item.highlightEndMs || 0),
      Number(item.highlightStartMs || 0) + 500
    );
  }

  function getNarrationNodeCurrentMs(node) {
    const currentNodeId = String(state.stationPlaybackNodeId || "").trim();
    if (currentNodeId && currentNodeId === String(node && node.nodeId ? node.nodeId : "").trim()) {
      const runtimeNode =
        (Array.isArray(state.stationPlaybackNodes) ? state.stationPlaybackNodes : []).find(
          (entry) => String(entry && entry.nodeId ? entry.nodeId : "").trim() === currentNodeId
        ) || null;
      const offsetMs = runtimeNode ? Number(runtimeNode.playbackStartMs || 0) : 0;
      return Math.max(0, Number(state.stationPlaybackCursorMs || 0) - offsetMs);
    }
    return 0;
  }

  function getNarrationNodeHotspotLabel(scene, hotspotId) {
    return getStationTimelineHotspotLabel(scene, hotspotId);
  }

  function renderNarrationNodeHotspotChips(scene, node) {
    const hotspotIds = Array.isArray(node && node.hotspotIds) ? node.hotspotIds : [];
    if (!hotspotIds.length) {
      return '<div class="pad-panel__hint">未绑定热区。先选中一个节点，再点击中间画布上的热区进行绑定。</div>';
    }
    return (
      '<div class="pad-hotspot-search__selection" style="flex-wrap:wrap; gap:8px;">' +
      hotspotIds
        .map((hotspotId) => {
          const missing = !findStationTimelineHotspot(scene, hotspotId);
          return (
            '<span class="pad-hotspot-search__selection-name' +
            (missing ? '" style="color:#b64133;' : '"') +
            '>' +
            escapeHtml(getNarrationNodeHotspotLabel(scene, hotspotId)) +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderNarrationNodeScrubber(slot, node) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const totalMs = Math.max(1, getNarrationNodeVisualMaxMs(slotKey, node));
    const startPct = Math.min(100, Math.max(0, (Number(node.highlightStartMs || 0) / totalMs) * 100));
    const widthPct = Math.min(
      100,
      Math.max(0, ((Number(node.highlightEndMs || 0) - Number(node.highlightStartMs || 0)) / totalMs) * 100)
    );
    const playheadPct = Math.min(100, Math.max(0, (getNarrationNodeCurrentMs(node) / totalMs) * 100));
    return (
      '<div class="pad-station-timeline__scrubber">' +
      '<div class="pad-station-timeline__scrubber-meta">' +
      '<span>音轨长度 ' + escapeHtml(formatTimelineOffset(totalMs)) + '</span>' +
      '<span>高亮区间 ' +
      escapeHtml(formatTimelineOffset(node.highlightStartMs || 0) + " - " + formatTimelineOffset(node.highlightEndMs || 0)) +
      "</span>" +
      "</div>" +
      '<div class="pad-station-timeline__track" data-role="narration-node-track" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">' +
      '<div class="pad-station-timeline__selection" style="left:' +
      escapeHtml(String(startPct)) +
      "%;width:" +
      escapeHtml(String(widthPct)) +
      '%;">' +
      '<button type="button" class="pad-station-timeline__selection-handle is-start" data-action="narration-node-drag-highlight-start" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '" aria-label="拖动节点高亮开始"></button>' +
      '<button type="button" class="pad-station-timeline__selection-handle is-end" data-action="narration-node-drag-highlight-end" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '" aria-label="拖动节点高亮结束"></button>' +
      "</div>" +
      '<button type="button" class="pad-station-timeline__playhead" data-action="narration-node-drag-playhead" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '" style="left:' +
      escapeHtml(String(playheadPct)) +
      '%;" aria-label="拖动节点播放位置"></button>' +
      "</div>" +
      "</div>"
    );
  }

  function getNarrationBindableHotspots(scene) {
    return getStationTimelineHotspotOptions(scene).filter((hotspot) => String(hotspot && hotspot.target_type || "product") !== "control");
  }

  function renderNarrationNodePlaybackControls(slot, node) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const isCurrentNode =
      String(state.stationPlaybackSlotKey || "").trim() === slotKey &&
      String(state.stationPlaybackNodeId || "").trim() === nodeId;
    const playbackState = isCurrentNode ? String(state.stationPlaybackState || "idle") : "idle";
    const currentTimeText = formatTimelineOffset(getNarrationNodeCurrentMs(node));
    return (
      '<div class="pad-station-timeline__preview-tools" style="margin-top:12px;">' +
      '<button type="button" class="pad-station-timeline__action" data-action="play-narration-node" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (playbackState === "playing" ? " disabled" : "") +
      ">播放</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="pause-station-playback" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (playbackState === "playing" ? "" : " disabled") +
      ">暂停</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="resume-station-playback" data-slot-key="' +
      escapeHtml(slotKey) +
      '"' +
      (playbackState === "paused" ? "" : " disabled") +
      ">继续</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="play-narration-node-highlight" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">播放高亮区间</button>' +
      '<span class="pad-station-timeline__preview-time">当前播放 ' +
      escapeHtml(currentTimeText) +
      "</span>" +
      "</div>"
    );
  }

  function renderNarrationNodeHotspotOptions(scene, slot, node) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const options = getNarrationBindableHotspots(scene);
    if (!options.length) {
      return '<div class="pad-panel__hint">当前站点还没有可绑定的产品热区。</div>';
    }
    return (
      '<div class="pad-node-hotspot-list">' +
      options
        .map((hotspot) => {
          const hotspotId = String(hotspot && hotspot.hotspot_id ? hotspot.hotspot_id : "").trim();
          const active = Array.isArray(node && node.hotspotIds) && node.hotspotIds.includes(hotspotId);
          return (
            '<button type="button" class="pad-node-hotspot-pill' +
            (active ? " is-active" : "") +
            '" data-action="toggle-narration-node-hotspot" data-slot-key="' +
            escapeHtml(slotKey) +
            '" data-node-id="' +
            escapeHtml(nodeId) +
            '" data-hotspot-id="' +
            escapeHtml(hotspotId) +
            '">' +
            escapeHtml(getNarrationNodeHotspotLabel(scene, hotspotId)) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderNarrationNodeCard(slot, scene, node, index, total) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const currentValidation = getNarrationNodeValidation(slotKey, node);
    const isActive = String(state.activeNarrationNodeId || "").trim() === nodeId;
    const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
    if (node.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(node.recordingId || ""))) {
      recordingOptions.unshift({
        recording_id: String(node.recordingId || ""),
        display_name: "当前节点音轨",
      });
    }
    const metaEntry = node.recordingId ? getRecordingMetaEntry(node.recordingId) : null;
    const stops = getRecordingStops(node.recordingId);
    return (
      '<div class="pad-station-timeline__item' +
      (isActive ? " is-preview-active" : "") +
      (!currentValidation.valid ? " is-invalid" : "") +
      '">' +
      '<div class="pad-station-timeline__rail" aria-hidden="true">' +
      '<span class="pad-station-timeline__dot"></span>' +
      '<span class="pad-station-timeline__line' +
      (index >= total - 1 ? " is-hidden" : "") +
      '"></span>' +
      "</div>" +
      '<div class="pad-station-timeline__card">' +
      '<div class="pad-station-timeline__card-top">' +
      "<div>" +
      '<div class="pad-station-timeline__card-title">节点 ' +
      escapeHtml(String(index + 1)) +
      "</div>" +
      '<div class="pad-station-timeline__card-subtitle">' +
      escapeHtml(isActive ? "当前绑定节点" : "点击设为当前节点后，可在画布上绑定多个热区") +
      "</div>" +
      "</div>" +
      '<div class="pad-station-timeline__actions">' +
      '<button type="button" class="pad-station-timeline__action" data-action="select-narration-node" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">' +
      escapeHtml(isActive ? "当前节点" : "设为当前") +
      "</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="move-narration-node-up" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (index <= 0 ? " disabled" : "") +
      ">上移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="move-narration-node-down" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (index >= total - 1 ? " disabled" : "") +
      ">下移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="remove-narration-node" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">删除</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-station-timeline__grid">' +
      '<label class="pad-station-config-panel__field"><span>音轨存档</span><select data-action="narration-node-recording" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">' +
      '<option value="">请选择存档</option>' +
      recordingOptions
        .map((item) => {
          const recordingId = String(item && item.recording_id ? item.recording_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(recordingId) +
            '"' +
            (recordingId === String(node.recordingId || "") ? " selected" : "") +
            ">" +
            escapeHtml(formatRecordingLabel(item)) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<label class="pad-station-config-panel__field"><span>音轨站台</span><select data-action="narration-node-stop" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (!node.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? " disabled" : "") +
      ">" +
      '<option value="">' +
      escapeHtml(metaEntry && metaEntry.loading ? "正在加载站台..." : "请选择站台") +
      "</option>" +
      stops
        .map((stopName, stopIndex) => {
          return (
            '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (normalizeStationStopIndex(node.stopIndex) === stopIndex ? " selected" : "") +
            ">" +
            escapeHtml(stopName) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      '<div class="pad-station-config-panel__field"><span>已绑热区</span><strong>' +
      escapeHtml(String((Array.isArray(node.hotspotIds) ? node.hotspotIds.length : 0)) + " 个") +
      "</strong></div>" +
      '<div class="pad-station-config-panel__field"><span>操作</span><strong>点击中间画布热区进行绑定/解绑</strong></div>' +
      "</div>" +
      renderNarrationNodePlaybackControls(slot, node) +
      renderNarrationNodeScrubber(slot, node) +
      '<div class="pad-station-timeline__summary' +
      (!currentValidation.valid ? " is-danger" : "") +
      '">' +
      escapeHtml(currentValidation.message) +
      "</div>" +
      '<div class="pad-panel__hint" style="margin-top:12px;">点击下面的热区按钮进行绑定/解绑，一个高亮区间可绑定多个热区。</div>' +
      renderNarrationNodeHotspotOptions(scene, slot, node) +
      renderNarrationNodeHotspotChips(scene, node) +
      "</div>" +
      "</div>"
    );
  }

  function renderSceneStage(scene, options) {
    const item = scene && typeof scene === "object" ? scene : null;
    if (!item || !item.background || !item.background.image_url) {
      return '<div class="pad-empty">This station has no background configured yet.</div>';
    }
    const opts = options && typeof options === "object" ? options : {};
    const editor = !!opts.editor;
    const interactiveOnly = !editor && !!opts.interactiveOnly;
    const stretchToFit = !!opts.stretchToFit;
    const extraClassName = String(opts.className || "").trim();
    const bindingMode = !!opts.bindingMode;
    const hotspots = getSceneHotspotsForRender(item, editor);
    const selectedBindingIds = new Set((Array.isArray(opts.boundHotspotIds) ? opts.boundHotspotIds : []).map((id) => String(id || "").trim()));
    const sceneKey = String((item && (item.slot_key || item.station_key || item.scene_id)) || "").trim();
    const isPlaybackScene = sceneKey && sceneKey === String(state.stationPlaybackSlotKey || "").trim();
    const visibleHotspotIds = new Set((Array.isArray(state.visibleHotspotIds) ? state.visibleHotspotIds : []).map((id) => String(id || "").trim()));
    const flashingHotspotIds = new Set((Array.isArray(state.flashingHotspotIds) ? state.flashingHotspotIds : []).map((id) => String(id || "").trim()));
    const narrationVisibilityActive =
      !editor &&
      !bindingMode &&
      isPlaybackScene &&
      Array.isArray(state.stationPlaybackNodes) &&
      state.stationPlaybackNodes.length > 0 &&
      String(state.stationPlaybackState || "").trim() !== "idle";
    const activeHotspotId =
      editor && state.sceneEditorDraft && !state.sceneEditorDraft.hotspot_id
        ? "__draft__"
        : String(
            editor
              ? state.sceneEditorActiveHotspotId || ""
              : state.highlightedHotspotId || state.sceneDialogHotspotId || ""
          );
    const width = Number(item.background.width || 0) || 1;
    const height = Number(item.background.height || 0) || 1;
    const hotspotHtml = hotspots
      .map((hotspot, index) => {
        const hotspotId = String(hotspot.hotspot_id || "");
        const controlAction = String(hotspot.control_action || "").trim();
        const isControl = !!controlAction;
        const tone = getHotspotVisualTone(hotspot);
        const style =
          "left:" +
          String(clampPct(hotspot.x_pct) * 100) +
          "%;top:" +
          String(clampPct(hotspot.y_pct) * 100) +
          "%;width:" +
          String(clampPct(hotspot.width_pct) * 100) +
          "%;height:" +
          String(clampPct(hotspot.height_pct) * 100) +
          "%;";
        const label = getHotspotDisplayLabel(hotspot, index);
        const isBound = selectedBindingIds.has(hotspotId);
        const isVisible = visibleHotspotIds.has(hotspotId);
        const isFlashing = flashingHotspotIds.has(hotspotId);
        const isHidden = narrationVisibilityActive && !isControl && !isVisible;
        const active = bindingMode ? isBound : hotspotId === activeHotspotId;
        const className =
          "pad-scene-hotspot" +
          (interactiveOnly ? " pad-scene-hotspot--interactive-only" : "") +
          (tone === "control" ? " pad-scene-hotspot--control" : "") +
          (tone === "has-audio" ? " pad-scene-hotspot--has-audio" : "") +
          (tone === "missing-audio" ? " pad-scene-hotspot--missing-audio" : "") +
          (tone === "unbound" ? " pad-scene-hotspot--unbound" : "") +
          (active ? " is-active" : "") +
          (isHidden ? " is-hidden" : "") +
          (isFlashing ? " is-flashing" : "");
        if (bindingMode) {
          return (
            '<button type="button" class="' +
            className +
            '" data-action="toggle-narration-node-hotspot" data-hotspot-id="' +
            escapeHtml(hotspotId) +
            '" data-control-action="' +
            escapeHtml(controlAction) +
            '" style="' +
            escapeHtml(style) +
            '">' +
            '<span class="pad-scene-hotspot__label">' +
            escapeHtml(label) +
            "</span>" +
            "</button>"
          );
        }
        if (!editor) {
          const shouldRenderLabel = !!(controlAction || opts.showLabels || interactiveOnly);
          return (
            '<button type="button" class="' +
            className +
            '" data-action="play-product-hotspot" data-product-id="' +
            escapeHtml(String(hotspot.product_id || "")) +
            '" data-hotspot-id="' +
            escapeHtml(hotspotId) +
            '" data-control-action="' +
            escapeHtml(controlAction) +
            '" style="' +
            escapeHtml(style) +
            '">' +
            (shouldRenderLabel
              ? '<span class="pad-scene-hotspot__label">' + escapeHtml(label) + "</span>"
              : "") +
            "</button>"
          );
        }
        return (
          '<div class="pad-scene-hotspot pad-scene-hotspot--editor' +
          (tone === "control" ? " pad-scene-hotspot--control" : "") +
          (tone === "has-audio" ? " pad-scene-hotspot--has-audio" : "") +
          (tone === "missing-audio" ? " pad-scene-hotspot--missing-audio" : "") +
          (tone === "unbound" ? " pad-scene-hotspot--unbound" : "") +
          (active ? " is-active" : "") +
          '" data-action="scene-editor-hotspot" data-hotspot-id="' +
          escapeHtml(hotspotId) +
          '" style="' +
          escapeHtml(style) +
          '">' +
          '<span class="pad-scene-hotspot__label">' +
          escapeHtml(label) +
          "</span>" +
          '<span class="pad-scene-hotspot__resize" data-action="scene-editor-hotspot-resize" data-hotspot-id="' +
          escapeHtml(hotspotId) +
          '"></span>' +
          "</div>"
        );
      })
      .join("");
    if (isPlaybackScene) {
      const renderFlashingIds = Array.from(flashingHotspotIds);
      if (renderFlashingIds.length) {
        logStationFlashRender(item, renderFlashingIds, {
          interactiveOnly,
          activeHotspotId,
          visibleHotspotIds: Array.from(visibleHotspotIds),
        });
      } else {
        lastFlashRenderLogKey = "";
      }
    }
    return (
      '<div class="pad-scene-stage' +
      (editor ? " is-editor" : "") +
      (stretchToFit ? " is-stretched" : "") +
      (extraClassName ? " " + extraClassName : "") +
      '" data-scene-stage-role="' +
      escapeHtml(editor ? "editor" : bindingMode ? "binding" : "demo") +
      '" data-scene-id="' +
      escapeHtml(String(item.scene_id || "")) +
      '" style="' +
      escapeHtml(
        stretchToFit
          ? "width:100%;height:100%;"
          : "aspect-ratio:" + String(width) + " / " + String(height) + ";"
      ) +
      '">' +
      '<img class="pad-scene-stage__image" src="' +
      escapeHtml(String(item.background.image_url || "")) +
      '" alt="' +
      escapeHtml(String(item.name || item.scene_id || "station scene")) +
      '" />' +
      '<div class="pad-scene-stage__overlay">' +
      hotspotHtml +
      "</div>" +
      "</div>"
    );
  }

  function renderStationFusionConfigPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const nodes = getStationNarrationNodes(slot);
    const activeNode = getActiveNarrationNode(slot.slotKey);
    const metaEntry = getRecordingMetaEntry(slot.recordingId);
    const stops = getRecordingStops(slot.recordingId);
    const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
    const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
    if (slot.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(slot.recordingId || ""))) {
      recordingOptions.unshift({
        recording_id: String(slot.recordingId || ""),
        display_name: "当前默认音轨",
      });
    }
    return (
      '<section class="pad-panel pad-scene-editor">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">站点讲解节点配置</div>' +
      '<div class="pad-panel__hint">每个节点独立选择音轨和高亮区间，一个节点可绑定多个热区。</div>' +
      "</div>" +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">刷新录音</button>' +
      "</div>" +
      '<div class="pad-scene-editor__layout">' +
      '<div class="pad-scene-editor__sidebar">' +
      '<div class="pad-scene-editor__sidebar-title">站点切换</div>' +
      '<div style="margin-top:12px;">' +
      renderDemoStationTabs() +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__stage-wrap">' +
      '<div class="pad-scene-editor__scene-meta">' +
      '<label class="pad-station-config-panel__field"><span>真实站点</span><select data-action="station-slot-id" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      (Array.isArray(state.stationCatalog) ? state.stationCatalog : [])
        .map((item) => {
          const stationId = String(item && item.station_id ? item.station_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(stationId) +
            '"' +
            (stationId === String(slot.stationId || "") ? " selected" : "") +
            ">" +
            escapeHtml(String(item && item.label ? item.label : stationId).trim() || stationId) +
            "</option>"
          );
        })
        .join("") +
      '</select></label>' +
      '<label class="pad-station-config-panel__field"><span>显示名称</span><input type="text" data-action="station-slot-label" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '" value="' +
      escapeHtml(String(slot.label || "")) +
      '" /></label>' +
      '<label class="pad-station-config-panel__field"><span>默认存档</span><select data-action="station-slot-recording" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">' +
      '<option value="">请选择存档</option>' +
      recordingOptions
        .map((item) => {
          const recordingId = String(item && item.recording_id ? item.recording_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(recordingId) +
            '"' +
            (recordingId === String(slot.recordingId || "") ? " selected" : "") +
            ">" +
            escapeHtml(formatRecordingLabel(item)) +
            "</option>"
          );
        })
        .join("") +
      '</select></label>' +
      '<label class="pad-station-config-panel__field"><span>默认站台</span><select data-action="station-slot-stop" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '"' +
      (!slot.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? " disabled" : "") +
      ">" +
      '<option value="">' +
      escapeHtml(metaEntry && metaEntry.loading ? "正在加载站台..." : "请选择站台") +
      "</option>" +
      stops
        .map((stopName, stopIndex) => {
          return (
            '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (selectedStopIndex === stopIndex ? " selected" : "") +
            ">" +
            escapeHtml(stopName) +
            "</option>"
          );
        })
        .join("") +
      '</select></label>' +
      (String(slot.narrationNodesError || "").trim()
        ? '<div class="pad-banner pad-banner--danger" style="grid-column:1 / -1;">' +
          escapeHtml("旧时间轴无法自动迁移：" + String(slot.narrationNodesError || "").trim() + "。请重新配置节点后再保存。") +
          "</div>"
        : "") +
      '<div class="pad-scene-editor__scene-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">保存站点配置</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="add-narration-node" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">新增节点</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-background">上传背景图</button>' +
      '<input class="pad-hidden-file-input" data-action="station-background-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-wireframe">上传线框图</button>' +
      '<input class="pad-hidden-file-input" data-action="station-wireframe-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
      "</div>" +
      "</div>" +
      (stationVisual
        ? renderSceneStage(stationVisual, {
            bindingMode: true,
            showLabels: true,
            stretchToFit: true,
            boundHotspotIds: activeNode ? activeNode.hotspotIds : [],
          })
        : '<div class="pad-empty">请先为当前站点上传背景图。</div>') +
      "</div>" +
      '<div class="pad-scene-editor__inspector">' +
      '<div class="pad-scene-editor__sidebar-title">节点列表</div>' +
      '<div class="pad-panel__hint">选中一个节点后，点击中间画布上的热区即可绑定或取消绑定。一个高亮区间可以绑定多个热区。</div>' +
      (nodes.length
        ? '<div class="pad-station-timeline__list">' +
          nodes.map((node, index) => renderNarrationNodeCard(slot, stationVisual, node, index, nodes.length)).join("") +
          "</div>"
        : '<div class="pad-station-timeline__empty">暂未配置讲解节点。先新增节点，再选择音轨、拖出高亮区间并绑定热区。</div>') +
      "</div>" +
      "</div>" +
      (state.recordingOptionsError
        ? '<div class="pad-banner pad-banner--danger" style="margin: 0 22px 22px;">' + escapeHtml(state.recordingOptionsError) + "</div>"
        : "") +
      "</section>"
    );
  }

  function renderStationFusionConfigPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const nodes = getStationNarrationNodes(slot);
    const activeNode = getActiveNarrationNode(slot.slotKey);
    return (
      '<section class="pad-panel pad-scene-editor">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">站点讲解节点</div>' +
      '<div class="pad-panel__hint">左侧大面板已收起。现在直接在节点列表里配置音轨、播放/暂停和高亮区间，并在节点内选择热区绑定。</div>' +
      "</div>" +
      '<div class="pad-scene-editor__header-actions">' +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">刷新录音</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="add-narration-node" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">新增节点</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">保存节点配置</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__inspector pad-scene-editor__inspector--full">' +
      '<div class="pad-scene-editor__sidebar-title">节点列表</div>' +
      '<div class="pad-panel__hint">当前站点：' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      (activeNode ? '；当前节点：' + escapeHtml(String(activeNode.nodeId || "")) : '') +
      '。每个节点都可以选择音轨、播放/暂停、拖动高亮区间，并绑定多个热区。</div>' +
      (String(slot.narrationNodesError || "").trim()
        ? '<div class="pad-banner pad-banner--danger" style="margin-top:12px;">' +
          escapeHtml("旧时间轴无法自动迁移：" + String(slot.narrationNodesError || "").trim() + "。请重新配置节点后再保存。") +
          "</div>"
        : "") +
      (!stationVisual
        ? '<div class="pad-banner pad-banner--warning" style="margin-top:12px;">当前站点暂未加载背景，但节点音轨和高亮区间仍可配置。</div>'
        : "") +
      (nodes.length
        ? '<div class="pad-station-timeline__list">' +
          nodes.map((node, index) => renderNarrationNodeCard(slot, stationVisual, node, index, nodes.length)).join("") +
          "</div>"
        : '<div class="pad-station-timeline__empty">暂未配置讲解节点。先新增节点，再选择音轨、拖出高亮区间并绑定热区。</div>') +
      "</div>" +
      (state.recordingOptionsError
        ? '<div class="pad-banner pad-banner--danger" style="margin: 0 22px 22px;">' + escapeHtml(state.recordingOptionsError) + "</div>"
        : "") +
      "</section>"
    );
  }

  function getNarrationNodeHotspotLabel(scene, hotspotId) {
    const hotspot = findStationTimelineHotspot(scene, hotspotId);
    if (!hotspot) return "失效热区";
    if (String(hotspot.target_type || "product") === "control") {
      return String(hotspot.control_label || "").trim() || "控制热区";
    }
    const product = findProductById(hotspot.product_id);
    return String((product && product.product_name) || hotspot.product_name || "未命名热区").trim() || "未命名热区";
  }

  function renderNarrationNodeHotspotChips(scene, node) {
    const hotspotIds = Array.isArray(node && node.hotspotIds) ? node.hotspotIds : [];
    if (!hotspotIds.length) {
      return '<div class="pad-panel__hint">当前节点还没有绑定热区。</div>';
    }
    return (
      '<div class="pad-node-bound-list">' +
      hotspotIds
        .map((hotspotId) => {
          return '<span class="pad-node-bound-pill">' + escapeHtml(getNarrationNodeHotspotLabel(scene, hotspotId)) + "</span>";
        })
        .join("") +
      "</div>"
    );
  }

  function renderNarrationNodeHotspotOptions(scene, slot, node) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const options = getNarrationBindableHotspots(scene);
    if (!options.length) {
      return '<div class="pad-panel__hint">当前站点还没有可绑定的产品热区。</div>';
    }
    return (
      '<div class="pad-node-hotspot-list">' +
      options
        .map((hotspot) => {
          const hotspotId = String(hotspot && hotspot.hotspot_id ? hotspot.hotspot_id : "").trim();
          const active = Array.isArray(node && node.hotspotIds) && node.hotspotIds.includes(hotspotId);
          return (
            '<button type="button" class="pad-node-hotspot-pill' +
            (active ? " is-active" : "") +
            '" data-action="toggle-narration-node-hotspot" data-slot-key="' +
            escapeHtml(slotKey) +
            '" data-node-id="' +
            escapeHtml(nodeId) +
            '" data-hotspot-id="' +
            escapeHtml(hotspotId) +
            '">' +
            escapeHtml(getNarrationNodeHotspotLabel(scene, hotspotId)) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderNarrationNodeTabs(slot, nodes) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    return (
      '<div class="pad-node-tabs" role="tablist" aria-label="讲解节点">' +
      nodes
        .map((node, index) => {
          const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
          const active = String(state.activeNarrationNodeId || "").trim() === nodeId;
          return (
            '<button type="button" class="pad-node-tab' +
            (active ? " is-active" : "") +
            '" data-action="select-narration-node" data-slot-key="' +
            escapeHtml(slotKey) +
            '" data-node-id="' +
            escapeHtml(nodeId) +
            '" role="tab" aria-selected="' +
            (active ? "true" : "false") +
            '">' +
            "节点 " +
            escapeHtml(String(index + 1)) +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderNarrationNodeCard(slot, scene, node, index, total) {
    const slotKey = String(slot && slot.slotKey ? slot.slotKey : "").trim();
    const nodeId = String(node && node.nodeId ? node.nodeId : "").trim();
    const currentValidation = getNarrationNodeValidation(slotKey, node);
    const recordingOptions = Array.isArray(state.recordingOptions) ? state.recordingOptions.slice() : [];
    if (node.recordingId && !recordingOptions.find((item) => String(item.recording_id || "") === String(node.recordingId || ""))) {
      recordingOptions.unshift({
        recording_id: String(node.recordingId || ""),
        display_name: "当前节点音轨",
      });
    }
    const metaEntry = node.recordingId ? getRecordingMetaEntry(node.recordingId) : null;
    const stops = getRecordingStops(node.recordingId);
    return (
      '<div class="pad-node-panel' + (!currentValidation.valid ? " is-invalid" : "") + '">' +
      '<div class="pad-node-panel__head">' +
      '<div>' +
      '<div class="pad-station-timeline__card-title">节点 ' + escapeHtml(String(index + 1)) + "</div>" +
      '<div class="pad-station-timeline__card-subtitle">当前节点内容已压缩到单屏显示，热区区域支持内部滚动。</div>' +
      "</div>" +
      '<div class="pad-station-timeline__actions">' +
      '<button type="button" class="pad-station-timeline__action" data-action="move-narration-node-up" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (index <= 0 ? " disabled" : "") +
      ">上移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="move-narration-node-down" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (index >= total - 1 ? " disabled" : "") +
      ">下移</button>" +
      '<button type="button" class="pad-station-timeline__action" data-action="remove-narration-node" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">删除</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-node-panel__grid">' +
      '<label class="pad-station-config-panel__field"><span>音轨存档</span><select data-action="narration-node-recording" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '">' +
      '<option value="">请选择存档</option>' +
      recordingOptions
        .map((item) => {
          const recordingId = String(item && item.recording_id ? item.recording_id : "").trim();
          return (
            '<option value="' +
            escapeHtml(recordingId) +
            '"' +
            (recordingId === String(node.recordingId || "") ? " selected" : "") +
            ">" +
            escapeHtml(formatRecordingLabel(item)) +
            "</option>"
          );
        })
        .join("") +
      '</select></label>' +
      '<label class="pad-station-config-panel__field"><span>音轨站台</span><select data-action="narration-node-stop" data-slot-key="' +
      escapeHtml(slotKey) +
      '" data-node-id="' +
      escapeHtml(nodeId) +
      '"' +
      (!node.recordingId || (metaEntry && metaEntry.loading) || (metaEntry && metaEntry.error) ? " disabled" : "") +
      ">" +
      '<option value="">' +
      escapeHtml(metaEntry && metaEntry.loading ? "正在加载站台..." : "请选择站台") +
      "</option>" +
      stops
        .map((stopName, stopIndex) => {
          return (
            '<option value="' +
            escapeHtml(String(stopIndex)) +
            '"' +
            (normalizeStationStopIndex(node.stopIndex) === stopIndex ? " selected" : "") +
            ">" +
            escapeHtml(stopName) +
            "</option>"
          );
        })
        .join("") +
      '</select></label>' +
      '<div class="pad-station-config-panel__field"><span>已绑热区</span><strong>' +
      escapeHtml(String((Array.isArray(node.hotspotIds) ? node.hotspotIds.length : 0)) + " 个") +
      "</strong></div>" +
      '<div class="pad-station-config-panel__field"><span>状态</span><strong>' +
      escapeHtml(currentValidation.message) +
      "</strong></div>" +
      "</div>" +
      renderNarrationNodePlaybackControls(slot, node) +
      renderNarrationNodeScrubber(slot, node) +
      '<div class="pad-node-panel__hotspots">' +
      '<div class="pad-panel__hint">选择热区：只显示名称，不显示热区 ID。</div>' +
      renderNarrationNodeHotspotOptions(scene, slot, node) +
      '<div class="pad-panel__hint" style="margin-top:10px;">当前已绑定</div>' +
      renderNarrationNodeHotspotChips(scene, node) +
      "</div>" +
      "</div>"
    );
  }

  function renderStationFusionConfigPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const nodes = getStationNarrationNodes(slot);
    const activeNode = getActiveNarrationNode(slot.slotKey);
    return (
      '<section class="pad-panel pad-scene-editor">' +
      '<div class="pad-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">站点讲解节点</div>' +
      '<div class="pad-panel__hint">每个节点在一个 tab 里。节点内部只显示必要信息，保证单屏可看全。</div>' +
      "</div>" +
      '<div class="pad-scene-editor__header-actions">' +
      '<button type="button" class="pad-btn pad-btn--ghost pad-station-config-panel__refresh" data-action="refresh-recordings">刷新录音</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="add-narration-node" data-slot-key="' +
      escapeHtml(String(slot.slotKey || "")) +
      '">新增节点</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">保存节点配置</button>' +
      "</div>" +
      "</div>" +
      '<div class="pad-scene-editor__inspector pad-scene-editor__inspector--full">' +
      '<div class="pad-panel__hint">当前站点：' + escapeHtml(getStationSlotDisplayName(slot)) + "。</div>" +
      (String(slot.narrationNodesError || "").trim()
        ? '<div class="pad-banner pad-banner--danger" style="margin-top:12px;">' +
          escapeHtml("旧时间轴无法自动迁移：" + String(slot.narrationNodesError || "").trim() + "。请重新配置节点后再保存。") +
          "</div>"
        : "") +
      (nodes.length
        ? renderNarrationNodeTabs(slot, nodes) +
          '<div class="pad-station-timeline__list pad-station-timeline__list--single">' +
          (activeNode ? renderNarrationNodeCard(slot, stationVisual, activeNode, nodes.findIndex((item) => String(item.nodeId || "") === String(activeNode.nodeId || "")), nodes.length) : "") +
          "</div>"
        : '<div class="pad-station-timeline__empty">暂未配置讲解节点。先新增节点，再选择音轨、拖出高亮区间并绑定热区。</div>') +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoShellV3(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell pad-shell--demo">' +
      '<section class="pad-demo-workspace">' +
      '<aside class="pad-demo-sidebar" aria-label="Demo mode control rail">' +
      '<div class="pad-demo-sidebar__top">' +
      renderDemoStationTabs() +
      "</div>" +
      '<div class="pad-demo-sidebar__bottom">' +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-sidebar__ops-btn" data-action="set-mode" data-mode="ops" data-testid="mode-enter-ops">运维</button>' +
      "</div>" +
      "</aside>" +
      '<section class="pad-demo-main">' +
      '<section class="pad-demo-main__meta">' +
      '<div class="pad-demo-main__hall">' +
      escapeHtml(hallName) +
      "</div>" +
      '<div class="pad-demo-main__badge">' +
      snapshotBadge +
      "</div>" +
      "</section>" +
      renderStationVisualPanelV3() +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderOpsShellV3(hallName, productCount, snapshotBadge) {
    const demoLayoutPanel = state.opsShowDemoLayout ? renderDemoLayoutPanel() : "";
    const hallProductsPanel = state.opsShowHallProductList
      ? (
          '<section class="pad-grid">' +
          '<section class="pad-panel">' +
          '<div class="pad-panel__header">' +
          "<div>" +
          '<div class="pad-panel__title">' +
          escapeHtml(TEXT.hallListTitle) +
          "</div>" +
          '<div class="pad-panel__hint" data-testid="hall-name">' +
          escapeHtml(hallName) +
          "</div>" +
          "</div>" +
          snapshotBadge +
          "</div>" +
          renderProductCards() +
          "</section>" +
          '<section class="pad-panel">' +
          renderDetailPanel() +
          '<div class="pad-panel__header" style="padding-top:0;">' +
          '<div class="pad-panel__hint">' +
          escapeHtml(TEXT.lastSyncAt) +
          '<span data-testid="last-sync-at">' +
          escapeHtml(formatTimestamp(state.lastSyncedAtMs)) +
          "</span></div>" +
          "</div>" +
          "</section>" +
          "</section>"
        )
      : "";
    const hallSwitcherPanel = state.opsShowHallSwitcher ? renderHallSwitcher() : "";
    return (
      '<main class="pad-shell">' +
      '<section class="pad-hero">' +
      '<div class="pad-hero__top">' +
      "<div>" +
      '<div class="pad-hero__eyebrow">' +
      escapeHtml(TEXT.heroEyebrow) +
      "</div>" +
      '<h1 class="pad-hero__title">' +
      escapeHtml(hallName) +
      "</h1>" +
      '<p class="pad-hero__subtitle">' +
      escapeHtml(TEXT.heroSubtitle) +
      "</p>" +
      "</div>" +
      '<div class="pad-hero__actions">' +
      renderModeToggle() +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="reload-live">' +
      escapeHtml(TEXT.refreshOnline) +
      "</button>" +
      '<button type="button" class="pad-btn pad-btn--ghost" data-action="sync-offline"' +
      (state.syncBusy ? " disabled" : "") +
      ">" +
      escapeHtml(TEXT.syncOffline) +
      "</button>" +
      '<a class="pad-btn pad-btn--primary" data-testid="goto-ragint" href="/ragint/?entry=tour" style="text-decoration:none;display:inline-flex;align-items:center;">' +
      escapeHtml(TEXT.gotoRagint) +
      "</a>" +
      "</div>" +
      "</div>" +
      '<div class="pad-hero__stats">' +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statClientId) +
      '</div><div class="pad-stat__value pad-stat__value--small" data-testid="client-id">' +
      escapeHtml(state.clientId || "--") +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statProductCount) +
      '</div><div class="pad-stat__value" data-testid="product-count">' +
      escapeHtml(String(productCount)) +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">Current station</div><div class="pad-stat__value">' +
      escapeHtml(getStationSlotDisplayName(getActiveStationSlot())) +
      "</div></div>" +
      '<div class="pad-stat"><div class="pad-stat__label">' +
      escapeHtml(TEXT.statOffline) +
      '</div><div class="pad-stat__value">' +
      renderStatusChip() +
      "</div></div>" +
      "</div>" +
      "</section>" +
      '<section class="pad-panel pad-ops-entry-panel">' +
      '<div class="pad-panel__header pad-layout-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">运维布局</div>' +
      '<div class="pad-panel__hint">点击按钮后再展开对应区域。</div>' +
      "</div>" +
      '<div class="pad-layout-panel__options" role="group" aria-label="运维入口">' +
      '<button type="button" class="pad-layout-panel__btn' +
      (state.opsShowDemoLayout ? " is-active" : "") +
      '" data-action="toggle-ops-section" data-section="demo-layout">演示布局</button>' +
      '<button type="button" class="pad-layout-panel__btn' +
      (state.opsShowHallProductList ? " is-active" : "") +
      '" data-action="toggle-ops-section" data-section="hall-products">Hall product list</button>' +
      '<button type="button" class="pad-layout-panel__btn' +
      (state.opsShowHallSwitcher ? " is-active" : "") +
      '" data-action="toggle-ops-section" data-section="hall-switcher">Quick hall switch</button>' +
      "</div>" +
      "</div>" +
      "</section>" +
      renderStationFusionConfigPanelV3() +
      demoLayoutPanel +
      hallSwitcherPanel +
      hallProductsPanel +
      "</main>"
    );
  }

  function renderStationVisualPanelV4() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const mode = normalizeDemoRightTabKey(state.demoRightTabKey);
    const stationStatus = getStationSlotStatus(slot);
    const stationButtonActive = isStationSlotPlaying(slot) || isStationSlotPending(slot);
    const stationButtonDisabled = !stationButtonActive && !stationStatus.playable ? " disabled" : "";
    const selectedProduct = getSelectedProduct();
    return (
      '<section class="pad-demo-panel pad-demo-panel--scene">' +
      '<div class="pad-demo-panel__header">' +
      "<div>" +
      '<div class="pad-demo-panel__title">' +
      escapeHtml(getStationSlotDisplayName(slot)) +
      "</div>" +
      '<div class="pad-demo-panel__hint">' +
      escapeHtml(
        mode === "station"
          ? "显示同一站点背景图，主按钮用于播放当前站台讲解。"
          : "显示同一站点背景图，点击产品热区播放对应单品讲解。"
      ) +
      "</div>" +
      "</div>" +
      (mode === "station"
        ? '<div class="pad-station-playback__actions">' +
          renderToneChip(stationStatus.text, stationStatus.tone) +
          '<button type="button" class="pad-btn pad-btn--neutral" data-action="play-station-slot" data-slot-key="' +
          escapeHtml(String(slot.slotKey || "")) +
          '"' +
          stationButtonDisabled +
          ">" +
          escapeHtml(stationButtonActive ? "停止站台讲解" : "播放站台讲解") +
          "</button>" +
          "</div>"
        : '<div class="pad-station-playback__actions">' +
          renderToneChip("点击热区播放单品", selectedProduct && selectedProduct.has_active_audio ? "ready" : "pending") +
          "</div>") +
      "</div>" +
      (stationVisual
        ? renderSceneStage(stationVisual, { editor: false, showLabels: mode === "station", stretchToFit: true, interactiveOnly: true })
        : '<div class="pad-empty">当前站点尚未配置背景图。</div>') +
      '<div class="pad-detail__hint" style="margin-top:12px;">' +
      escapeHtml(
        mode === "station"
          ? "当前背景图与线框图仍与单品讲解共用，只是主操作切换成了站台讲解。"
          : selectedProduct && String(selectedProduct.product_id || "").trim()
            ? "当前选中产品：" + String(selectedProduct.product_name || "").trim()
            : "点击产品热区后会自动切换到对应产品并播放当前生效音频。"
      ) +
      "</div>" +
      "</section>"
    );
  }

  function renderDemoShellV4(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell pad-shell--demo pad-shell--demo-fullscreen">' +
      '<section class="pad-demo-workspace pad-demo-workspace--full">' +
      '<section class="pad-demo-main pad-demo-main--full">' +
      '<section class="pad-demo-panel pad-demo-panel--scene">' +
      (getSelectedScene()
        ? renderSceneStage(getSelectedScene(), { editor: false, showLabels: false, stretchToFit: true, interactiveOnly: true })
        : '<div class="pad-empty">This station has no background configured yet.</div>') +
      "</section>" +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function renderDemoShell(hallName, productCount, snapshotBadge) {
    return (
      '<main class="pad-shell pad-shell--demo">' +
      '<section class="pad-demo-workspace">' +
      '<aside class="pad-demo-sidebar" aria-label="Demo mode control rail">' +
      '<div class="pad-demo-sidebar__top">' +
      renderDemoStationTabs() +
      "</div>" +
      '<div class="pad-demo-sidebar__middle">' +
      renderDemoRightTabs() +
      "</div>" +
      '<div class="pad-demo-sidebar__bottom">' +
      '<button type="button" class="pad-btn pad-btn--neutral pad-demo-sidebar__ops-btn" data-action="set-mode" data-mode="ops" data-testid="mode-enter-ops">' +
      "运维" +
      "</button>" +
      "</div>" +
      "</aside>" +
      '<section class="pad-demo-main">' +
      '<section class="pad-demo-main__meta">' +
      '<div class="pad-demo-main__hall">' +
      escapeHtml(hallName) +
      "</div>" +
      '<div class="pad-demo-main__badge">' +
      snapshotBadge +
      "</div>" +
      "</section>" +
      (normalizeDemoRightTabKey(state.demoRightTabKey) === "station" ? renderDemoStationPanel() : renderDemoProductPanel()) +
      "</section>" +
      "</section>" +
      "</main>"
    );
  }

  function updateAudioDock() {
    const activeStationSlot =
      String(state.stationPlaybackSlotKey || '').trim()
        ? getStationSlotByKey(state.stationPlaybackSlotKey)
        : normalizeDemoRightTabKey(state.demoRightTabKey) === 'station'
          ? getActiveStationSlot()
          : null;
    if (activeStationSlot) {
      const slotTitle = getStationSlotDisplayName(activeStationSlot);
      const stopName = String(state.stationPlaybackStopName || activeStationSlot.stopName || '').trim();
      const status = getStationSlotStatus(activeStationSlot);
      if (state.stationPlaybackError) {
        refs.audioStatus.textContent = slotTitle + '：播放失败';
        return;
      }
      if (state.audioBusy && String(state.pendingStationSlotKey || '') === String(activeStationSlot.slotKey || '')) {
        refs.audioStatus.textContent = slotTitle + '：正在准备播放';
        return;
      }
      if (isStationSlotPlaying(activeStationSlot)) {
        refs.audioStatus.textContent = slotTitle + '：正在播放 ' + (stopName || '当前站台');
        return;
      }
      refs.audioStatus.textContent = slotTitle + '：' + (stopName || status.text);
      return;
    }
    const product = getSelectedProduct();
    if (!product) {
      refs.audioStatus.textContent = TEXT.notSelected;
      return;
    }
    if (state.audioError) {
      if (state.audioError === TEXT.noAudio) {
        refs.audioStatus.textContent = product.product_name + '：' + TEXT.currentAudioStatusMissing;
        return;
      }
      refs.audioStatus.textContent = product.product_name + '：' + TEXT.currentAudioStatusFailed;
      return;
    }
    if (state.audioBusy) {
      refs.audioStatus.textContent = product.product_name + '：' + TEXT.currentAudioStatusPreparing;
      return;
    }
    if (isProductPlaying(product)) {
      refs.audioStatus.textContent = product.product_name + '：' + TEXT.currentAudioStatusPlaying;
      return;
    }
    refs.audioStatus.textContent =
      product.product_name + '：' + (product.has_active_audio ? TEXT.currentAudioStatusReady : TEXT.currentAudioStatusMissing);
  }

  function render() {
    ensureSelectedProduct();
    ensureSelectedScene();
    const hallName = state.hall && state.hall.hall_name ? state.hall.hall_name : TEXT.unboundHall;
    const productCount = Array.isArray(state.products) ? state.products.length : 0;
    const snapshotBadge = state.usingOfflineSnapshot
      ? '<span class="pad-chip pad-chip--ready">' + escapeHtml(TEXT.offlineSnapshot) + "</span>"
      : '<span class="pad-chip pad-chip--pending">' + escapeHtml(TEXT.liveData) + "</span>";

    refs.app.innerHTML =
      state.mode === "ops"
        ? renderOpsShellV4(hallName, productCount, snapshotBadge)
        : renderDemoShellV4(hallName, productCount, snapshotBadge);

    document.body.classList.toggle("pad-body--demo", state.mode === "demo");
    document.body.classList.toggle("pad-body--ops", state.mode === "ops");
    updateAudioDock();
    hydrateStationTimelinePreviewControls();
    bindDomEvents();
    syncMobileAnnotateToolsHeight();
    publishE2eState();
  }

  function syncMobileAnnotateToolsHeight() {
    const tools = refs.app.querySelector(".pad-ops-annotate-tools");
    if (!tools) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 980;
    const isAnnotateOps = state.mode === "ops" && normalizeOpsStationTab(state.opsStationTab) === "annotate";
    if (!isMobile || !isAnnotateOps) {
      tools.style.minHeight = "";
      tools.style.height = "";
      return;
    }
    const rect = tools.getBoundingClientRect();
    const viewportHeight = typeof window.innerHeight === "number" ? window.innerHeight : 0;
    const bottomGap = 16;
    const availableHeight = Math.max(280, Math.round(viewportHeight - rect.top - bottomGap));
    tools.style.minHeight = String(availableHeight) + "px";
    tools.style.height = String(availableHeight) + "px";
  }

  function bindDomEvents() {
    refs.app.querySelectorAll('[data-action="set-mode"]').forEach((button) => {
      button.addEventListener("click", () => {
        setMode(button.getAttribute("data-mode"));
      });
    });

    refs.app.querySelectorAll('[data-action="toggle-ops-section"]').forEach((button) => {
      button.addEventListener("click", () => {
        toggleOpsSection(button.getAttribute("data-section"));
      });
    });

    refs.app.querySelectorAll('[data-action="set-demo-columns"]').forEach((button) => {
      button.addEventListener("click", () => {
        setDemoColumns(button.getAttribute("data-columns"));
      });
    });

    refs.app.querySelectorAll('[data-action="set-demo-left-tab"]').forEach((button) => {
      button.addEventListener("click", () => {
        setDemoLeftTab(button.getAttribute("data-tab-key"));
      });
    });

    refs.app.querySelectorAll('[data-action="set-demo-right-tab"]').forEach((button) => {
      button.addEventListener("click", () => {
        setDemoRightTab(button.getAttribute("data-tab-key"));
      });
    });

    refs.app.querySelectorAll('[data-action="set-ops-station-tab"]').forEach((button) => {
      button.addEventListener("click", () => {
        setOpsStationTab(button.getAttribute("data-tab"));
      });
    });

    refs.app.querySelectorAll('[data-action="set-ops-annotate-sidebar-tab"]').forEach((button) => {
      button.addEventListener("click", () => {
        setOpsAnnotateSidebarTab(button.getAttribute("data-tab"));
      });
    });

    refs.app.querySelectorAll('[data-action="toggle-demo-station"]').forEach((button) => {
      button.addEventListener("click", () => {
        toggleActiveStationSlot();
      });
    });

    refs.app.querySelectorAll('[data-action="request-exit"]').forEach((button) => {
      button.addEventListener("click", () => {
        requestExit();
      });
    });

    const syncButtons = Array.from(refs.app.querySelectorAll('[data-action="sync-offline"]'));
    const reloadButtons = Array.from(refs.app.querySelectorAll('[data-action="reload-live"]'));
    const playButton = refs.app.querySelector('[data-action="play-selected"]');
    const stationPlayButtons = Array.from(refs.app.querySelectorAll('[data-action="play-station-slot"]'));
    const stationTimelinePlayButtons = Array.from(refs.app.querySelectorAll('[data-action="play-station-slot-from-start"]'));
    const stationTimelinePauseButtons = Array.from(refs.app.querySelectorAll('[data-action="pause-station-playback"]'));
    const stationTimelineResumeButtons = Array.from(refs.app.querySelectorAll('[data-action="resume-station-playback"]'));
    const regenerateButton = refs.app.querySelector('[data-action="regenerate-audio"]');
    const uploadButton = refs.app.querySelector('[data-action="select-upload-audio"]');
    const uploadInput = refs.app.querySelector('[data-action="upload-audio-input"]');
    const uploadImageButton = refs.app.querySelector('[data-action="select-upload-image"]');
    const uploadImageInput = refs.app.querySelector('[data-action="upload-image-input"]');
    const audioTextEditor = refs.app.querySelector('[data-action="audio-text-draft"]');
    const productNameEditor = refs.app.querySelector('[data-action="product-name-draft"]');
    const productIntroEditor = refs.app.querySelector('[data-action="product-intro-draft"]');
    const saveProductInfoButton = refs.app.querySelector('[data-action="save-product-info"]');
    const refreshRecordingsButtons = Array.from(refs.app.querySelectorAll('[data-action="refresh-recordings"]'));
    const saveStationConfigButtons = Array.from(refs.app.querySelectorAll('[data-action="save-station-config"]'));
    const stationTimelineAddButton = refs.app.querySelector('[data-action="station-timeline-add"]');
    const stationBackgroundButton = refs.app.querySelector('[data-action="select-station-background"]');
    const stationBackgroundInput = refs.app.querySelector('[data-action="station-background-input"]');
    const stationWireframeButton = refs.app.querySelector('[data-action="select-station-wireframe"]');
    const stationWireframeInput = refs.app.querySelector('[data-action="station-wireframe-input"]');
    const saveStationHotspotButton = refs.app.querySelector('[data-action="save-station-hotspot"]');
    const clearStationHotspotDraftButton = refs.app.querySelector('[data-action="clear-station-hotspot-draft"]');
    const deleteStationHotspotButton = refs.app.querySelector('[data-action="delete-station-hotspot"]');
    const exportStationHotspotsButton = refs.app.querySelector('[data-action="export-station-hotspots"]');
    const importStationHotspotsButton = refs.app.querySelector('[data-action="import-station-hotspots"]');
    const importStationHotspotsInput = refs.app.querySelector('[data-action="import-station-hotspots-input"]');
    const stationHotspotProductSelect = refs.app.querySelector('[data-action="station-hotspot-product"]');
    hydrateStationHotspotSearchField(stationHotspotProductSelect);
    const stationHotspotProductSearchInput = refs.app.querySelector('[data-action="station-hotspot-product-search"]');
    const stationHotspotSortOrderInput = refs.app.querySelector('[data-action="station-hotspot-sort-order"]');
    const createSceneButton = refs.app.querySelector('[data-action="select-create-scene-image"]');
    const createSceneInput = refs.app.querySelector('[data-action="scene-create-image-input"]');
    const createSceneNameInput = refs.app.querySelector('[data-action="scene-create-name"]');
    const createSceneSortInput = refs.app.querySelector('[data-action="scene-create-sort-order"]');
    const sceneNameInput = refs.app.querySelector('[data-action="scene-name"]');
    const sceneSortInput = refs.app.querySelector('[data-action="scene-sort-order"]');
    const saveSceneMetaButton = refs.app.querySelector('[data-action="save-scene-meta"]');
    const sceneBackgroundButton = refs.app.querySelector('[data-action="select-scene-background"]');
    const sceneBackgroundInput = refs.app.querySelector('[data-action="scene-background-input"]');
    const deleteSceneButton = refs.app.querySelector('[data-action="delete-scene"]');
    const saveSceneHotspotButton = refs.app.querySelector('[data-action="save-scene-hotspot"]');
    const clearSceneDraftButton = refs.app.querySelector('[data-action="clear-scene-draft"]');
    const deleteSceneHotspotButton = refs.app.querySelector('[data-action="delete-scene-hotspot"]');
    const sceneDraftTitleInput = refs.app.querySelector('[data-action="scene-draft-title"]');
    const sceneDraftContentInput = refs.app.querySelector('[data-action="scene-draft-content"]');
    const sceneDraftSortInput = refs.app.querySelector('[data-action="scene-draft-sort-order"]');
    const editorStage = refs.app.querySelector('[data-scene-stage-role="editor"]');

    if (audioTextEditor) {
      audioTextEditor.addEventListener("input", () => {
        const product = getSelectedProduct();
        if (!product) return;
        state.audioTextDrafts[String(product.product_id || "").trim()] = String(audioTextEditor.value || "");
        publishE2eState();
      });
    }

    if (productNameEditor) {
      productNameEditor.addEventListener("input", () => {
        const product = getSelectedProduct();
        if (!product) return;
        updateProductInfoDraft(product.product_id, { product_name: String(productNameEditor.value || "") });
      });
    }

    if (productIntroEditor) {
      productIntroEditor.addEventListener("input", () => {
        const product = getSelectedProduct();
        if (!product) return;
        updateProductInfoDraft(product.product_id, { intro_text: String(productIntroEditor.value || "") });
      });
    }

    syncButtons.forEach((button) => {
      button.addEventListener("click", () => {
        resetAudioPlayback();
        void syncOfflineResources({
          hall: state.hall,
          products: state.products,
          referencedProducts: state.referencedProducts,
          scenes: state.scenes,
        });
      });
    });

    reloadButtons.forEach((button) => {
      button.addEventListener("click", () => {
        resetAudioPlayback();
        void loadCurrentHall({ forceOnline: true });
      });
    });

    if (playButton) {
      playButton.addEventListener("click", () => {
        void toggleProductPlayback();
      });
    }

    stationPlayButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void toggleStationPlayback(button.getAttribute("data-slot-key"));
      });
    });

    stationTimelinePlayButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void playStationSlot(button.getAttribute("data-slot-key"), { startAtMs: 0 });
      });
    });

    stationTimelinePauseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        pauseStationPlayback();
      });
    });

    stationTimelineResumeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void resumeStationPlayback(button.getAttribute("data-slot-key"));
      });
    });

    if (regenerateButton) {
      regenerateButton.addEventListener("click", () => {
        void regenerateSelectedProductAudio();
      });
    }

    if (uploadButton && uploadInput) {
      uploadButton.addEventListener("click", () => {
        uploadInput.click();
      });
      uploadInput.addEventListener("change", () => {
        const file = uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null;
        if (!file) return;
        void uploadSelectedProductAudio(file).finally(() => {
          uploadInput.value = "";
        });
      });
    }

    if (uploadImageButton && uploadImageInput) {
      uploadImageButton.addEventListener("click", () => {
        uploadImageInput.click();
      });
      uploadImageInput.addEventListener("change", () => {
        const files = uploadImageInput.files ? Array.from(uploadImageInput.files) : [];
        if (!files.length) return;
        void uploadSelectedProductImages(files).finally(() => {
          uploadImageInput.value = "";
        });
      });
    }

    if (saveProductInfoButton) {
      saveProductInfoButton.addEventListener("click", () => {
        void saveSelectedProductInfo();
      });
    }

    refs.app.querySelectorAll('[data-action="switch-hall"]').forEach((button) => {
      button.addEventListener("click", () => {
        const nextClientId = String(button.getAttribute("data-client-id") || "").trim();
        if (!nextClientId) return;
        void switchHall(nextClientId);
      });
    });

    refs.app.querySelectorAll('[data-action="station-slot-label"]').forEach((input) => {
      input.addEventListener("change", () => {
        const slotKey = String(input.getAttribute("data-slot-key") || "").trim();
        updateStationSlot(slotKey, () => ({ label: String(input.value || "").trim() }));
      });
    });

    refs.app.querySelectorAll('[data-action="station-slot-id"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = String(select.getAttribute("data-slot-key") || "").trim();
        updateStationSlot(slotKey, () => ({
          stationId: String(select.value || "").trim(),
        }));
      });
    });

    refs.app.querySelectorAll('[data-action="station-slot-recording"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = String(select.getAttribute("data-slot-key") || "").trim();
        const recordingId = String(select.value || "").trim();
        updateStationSlot(slotKey, () => ({
          recordingId,
          stopIndex: null,
          stopName: "",
        }));
        if (recordingId) {
          void ensureRecordingMeta(recordingId, { force: true });
        }
      });
    });

    refs.app.querySelectorAll('[data-action="station-slot-stop"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = String(select.getAttribute("data-slot-key") || "").trim();
        const slot = getStationSlotByKey(slotKey);
        const stopIndex = normalizeStationStopIndex(select.value);
        const stops = getRecordingStops(slot.recordingId);
        updateStationSlot(slotKey, () => ({
          stopIndex,
          stopName: stopIndex != null && stopIndex >= 0 && stopIndex < stops.length ? String(stops[stopIndex] || "").trim() : "",
        }));
      });
    });

    refreshRecordingsButtons.forEach((button) => {
      button.addEventListener("click", () => {
        void refreshRecordingOptions();
        preloadStationSlotRecordingMeta();
      });
    });

    if (exportStationHotspotsButton) {
      exportStationHotspotsButton.addEventListener("click", () => {
        void exportCurrentStationHotspots();
      });
    }

    if (importStationHotspotsButton && importStationHotspotsInput) {
      importStationHotspotsButton.addEventListener("click", () => {
        importStationHotspotsInput.click();
      });
      importStationHotspotsInput.addEventListener("change", () => {
        const file = importStationHotspotsInput.files && importStationHotspotsInput.files[0]
          ? importStationHotspotsInput.files[0]
          : null;
        if (!file) return;
        void importCurrentStationHotspots(file).finally(() => {
          importStationHotspotsInput.value = "";
        });
      });
    }

    if (stationTimelineAddButton) {
      stationTimelineAddButton.addEventListener("click", () => {
        addStationTimelineEvent(stationTimelineAddButton.getAttribute("data-slot-key"));
      });
    }

    refs.app.querySelectorAll('[data-action="station-timeline-remove"]').forEach((button) => {
      button.addEventListener("click", () => {
        removeStationTimelineEvent(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-index")
        );
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-move-up"]').forEach((button) => {
      button.addEventListener("click", () => {
        moveStationTimelineEvent(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-index"),
          -1
        );
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-move-down"]').forEach((button) => {
      button.addEventListener("click", () => {
        moveStationTimelineEvent(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-index"),
          1
        );
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-time-ms"]').forEach((input) => {
      input.addEventListener("change", () => {
        const slotKey = input.getAttribute("data-slot-key");
        const currentIndex = Number(input.getAttribute("data-index"));
        updateStationTimelineEvents(slotKey, (events) => {
          if (currentIndex < 0 || currentIndex >= events.length) return events;
          const nextEvents = events.slice();
          nextEvents[currentIndex] = Object.assign({}, nextEvents[currentIndex], {
            timeMs: normalizeTimelineEventTimeMs(input.value),
          });
          return nextEvents;
        });
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-hotspot"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = select.getAttribute("data-slot-key");
        const currentIndex = Number(select.getAttribute("data-index"));
        const scene = findSceneById(slotKey) || getSelectedScene();
        const hotspotId = String(select.value || "").trim();
        const hotspot = findStationTimelineHotspot(scene, hotspotId);
        updateStationTimelineEvents(slotKey, (events) => {
          if (currentIndex < 0 || currentIndex >= events.length) return events;
          const nextEvents = events.slice();
          nextEvents[currentIndex] = Object.assign({}, nextEvents[currentIndex], {
            hotspotId,
            productId: hotspot ? String(hotspot.product_id || "").trim() : "",
          });
          return nextEvents;
        });
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-use-current-time"]').forEach((button) => {
      button.addEventListener("click", () => {
        useCurrentPlaybackTimeForTimelineEvent(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-index")
        );
      });
    });

    refs.app.querySelectorAll('[data-role="station-timeline-track"]').forEach((track) => {
      track.addEventListener("pointerdown", (event) => {
        beginStationTimelineSelection(track.getAttribute("data-slot-key"), event.clientX);
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-drag-playhead"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginStationTimelineCursorDrag(button.getAttribute("data-slot-key"), event.clientX);
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-drag-highlight-start"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginStationTimelineHighlightHandleDrag(button.getAttribute("data-slot-key"), "start", event.clientX);
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-drag-highlight-end"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginStationTimelineHighlightHandleDrag(button.getAttribute("data-slot-key"), "end", event.clientX);
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-seek-marker"]').forEach((button) => {
      button.addEventListener("click", () => {
        seekStationPlaybackToMs(button.getAttribute("data-time-ms"));
      });
    });

    refs.app.querySelectorAll('[data-action="station-timeline-delete-highlight"]').forEach((button) => {
      button.addEventListener("click", () => {
        deleteStationTimelineSelection(button.getAttribute("data-slot-key"));
      });
    });

    refs.app.querySelectorAll('[data-action="add-narration-node"]').forEach((button) => {
      button.addEventListener("click", () => {
        addStationNarrationNode(button.getAttribute("data-slot-key"));
      });
    });

    refs.app.querySelectorAll('[data-action="select-narration-node"]').forEach((button) => {
      button.addEventListener("click", () => {
        setActiveNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"));
        render();
      });
    });

    refs.app.querySelectorAll('[data-action="move-narration-node-up"]').forEach((button) => {
      button.addEventListener("click", () => {
        moveStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), -1);
      });
    });

    refs.app.querySelectorAll('[data-action="move-narration-node-down"]').forEach((button) => {
      button.addEventListener("click", () => {
        moveStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), 1);
      });
    });

    refs.app.querySelectorAll('[data-action="remove-narration-node"]').forEach((button) => {
      button.addEventListener("click", () => {
        removeStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"));
      });
    });

    refs.app.querySelectorAll('[data-action="narration-node-recording"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = select.getAttribute("data-slot-key");
        const nodeId = select.getAttribute("data-node-id");
        const recordingId = String(select.value || "").trim();
        updateStationNarrationNode(slotKey, nodeId, {
          recordingId,
          stopIndex: null,
          stopName: "",
        });
        if (recordingId) {
          void ensureRecordingMeta(recordingId, { force: true });
        }
        setActiveNarrationNode(slotKey, nodeId);
        render();
      });
    });

    refs.app.querySelectorAll('[data-action="narration-node-stop"]').forEach((select) => {
      select.addEventListener("change", () => {
        const slotKey = select.getAttribute("data-slot-key");
        const nodeId = select.getAttribute("data-node-id");
        const node = findStationNarrationNode(slotKey, nodeId);
        const stopIndex = normalizeStationStopIndex(select.value);
        const stops = getRecordingStops(node && node.recordingId);
        updateStationNarrationNode(slotKey, nodeId, {
          stopIndex,
          stopName: stopIndex != null && stopIndex >= 0 && stopIndex < stops.length ? String(stops[stopIndex] || "").trim() : "",
        });
        setActiveNarrationNode(slotKey, nodeId);
        render();
      });
    });

    refs.app.querySelectorAll('[data-action="play-narration-node"]').forEach((button) => {
      button.addEventListener("click", () => {
        void playNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), { rangeOnly: false });
      });
    });

    refs.app.querySelectorAll('[data-action="play-narration-node-highlight"]').forEach((button) => {
      button.addEventListener("click", () => {
        void playNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), { rangeOnly: true });
      });
    });

    refs.app.querySelectorAll('[data-role="narration-node-track"]').forEach((track) => {
      track.addEventListener("pointerdown", (event) => {
        beginNarrationNodeSelection(
          track.getAttribute("data-slot-key"),
          track.getAttribute("data-node-id"),
          event.clientX
        );
      });
    });

    refs.app.querySelectorAll('[data-action="narration-node-drag-highlight-start"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginNarrationNodeHandleDrag(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-node-id"),
          "start",
          event.clientX
        );
      });
    });

    refs.app.querySelectorAll('[data-action="narration-node-drag-highlight-end"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginNarrationNodeHandleDrag(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-node-id"),
          "end",
          event.clientX
        );
      });
    });

    refs.app.querySelectorAll('[data-action="narration-node-drag-playhead"]').forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginNarrationNodePlayheadDrag(
          button.getAttribute("data-slot-key"),
          button.getAttribute("data-node-id"),
          event.clientX
        );
      });
    });

    refs.app.querySelectorAll('[data-action="toggle-narration-node-hotspot"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const controlAction = String(button.getAttribute("data-control-action") || "").trim();
        if (controlAction) return;
        const slotKey = String(button.getAttribute("data-slot-key") || getActiveStationSlot().slotKey || "").trim();
        const targetNodeId = String(button.getAttribute("data-node-id") || "").trim();
        const activeNode = targetNodeId ? findStationNarrationNode(slotKey, targetNodeId) : getActiveNarrationNode(slotKey);
        if (!activeNode) {
          setAssetState("请先选中一个讲解节点，再绑定热区。", "warning", false, "station-node-binding");
          render();
          return;
        }
        toggleNarrationNodeHotspotBinding(slotKey, activeNode.nodeId, button.getAttribute("data-hotspot-id"));
      });
    });

    saveStationConfigButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const activeSlot = getActiveStationSlot();
        const narrationNodes = getStationNarrationNodes(activeSlot);
        updateStationSlot(activeSlot.slotKey, () => ({ narrationNodes }));
        void saveSelectedStationConfig({ narrationNodes });
      });
    });

    if (stationBackgroundButton && stationBackgroundInput) {
      stationBackgroundButton.addEventListener("click", () => {
        stationBackgroundInput.click();
      });
      stationBackgroundInput.addEventListener("change", () => {
        const file = stationBackgroundInput.files && stationBackgroundInput.files[0] ? stationBackgroundInput.files[0] : null;
        if (!file) return;
        void uploadSelectedStationAsset(file, "background").finally(() => {
          stationBackgroundInput.value = "";
        });
      });
    }

    if (stationWireframeButton && stationWireframeInput) {
      stationWireframeButton.addEventListener("click", () => {
        stationWireframeInput.click();
      });
      stationWireframeInput.addEventListener("change", () => {
        const file = stationWireframeInput.files && stationWireframeInput.files[0] ? stationWireframeInput.files[0] : null;
        if (!file) return;
        void uploadSelectedStationAsset(file, "wireframe").finally(() => {
          stationWireframeInput.value = "";
        });
      });
    }

    if (stationHotspotProductSearchInput) {
      stationHotspotProductSearchInput.addEventListener("compositionstart", () => {
        hotspotSearchComposing = true;
      });
      stationHotspotProductSearchInput.addEventListener("compositionend", () => {
        hotspotSearchComposing = false;
        const nextText = String(stationHotspotProductSearchInput.value || "");
        const restoreSnapshot = captureHotspotSearchInputState(stationHotspotProductSearchInput);
        const scene = getSelectedScene();
        const draft = getSceneEditorDraftForScene(scene);
        const currentProduct = draft ? findProductById(draft.product_id) : null;
        const currentName = currentProduct ? String(currentProduct.product_name || "").trim() : "";
        updateSceneEditorDraft({
          product_id: currentName && String(nextText || "").trim() === currentName ? String(draft.product_id || "").trim() : "",
          product_search_text: nextText,
        }, { render: false });
        void searchStationHotspotProducts(nextText, { restoreSnapshot });
      });
      stationHotspotProductSearchInput.addEventListener("input", () => {
        if (hotspotSearchComposing) {
          return;
        }
        const scene = getSelectedScene();
        const draft = getSceneEditorDraftForScene(scene);
        const nextText = String(stationHotspotProductSearchInput.value || "");
        const restoreSnapshot = captureHotspotSearchInputState(stationHotspotProductSearchInput);
        const currentProduct = draft ? findProductById(draft.product_id) : null;
        const currentName = currentProduct ? String(currentProduct.product_name || "").trim() : "";
        updateSceneEditorDraft({
          product_id: currentName && String(nextText || "").trim() === currentName ? String(draft.product_id || "").trim() : "",
          product_search_text: nextText,
        }, { render: false });
        void searchStationHotspotProducts(nextText, { restoreSnapshot });
      });
    }

    refs.app.querySelectorAll('[data-action="station-hotspot-pick"]').forEach((button) => {
      button.addEventListener("click", () => {
        const nextProductId = String(button.getAttribute("data-product-id") || "").trim();
        if (!nextProductId) return;
        const matched =
          (Array.isArray(state.hotspotSearchResults) ? state.hotspotSearchResults : []).find(
            (item) => String(item && item.product_id ? item.product_id : "").trim() === nextProductId
          ) || null;
        if (matched) {
          upsertReferencedProduct({
            product_id: nextProductId,
            hall_id: String(matched.hall_id || "").trim(),
            product_name: String(matched.product_name || "").trim(),
            product_name_en: String(matched.product_name_en || "").trim(),
            product_source: String(matched.product_source || "").trim(),
            has_active_audio: !!matched.has_active_audio,
          });
        }
        const scene = getSelectedScene();
        const draft = getSceneEditorDraftForScene(scene);
        const nextDraft = updateSceneEditorDraft({
          product_id: nextProductId,
          product_search_text: matched ? String(matched.product_name || "").trim() : nextProductId,
        });
        clearHotspotProductSearch();
        if (draft && !draft.hotspot_id && nextDraft) {
          void saveSceneEditorHotspot();
        } else {
          render();
        }
      });
    });

    if (stationHotspotSortOrderInput) {
      stationHotspotSortOrderInput.addEventListener("change", () => {
        updateSceneEditorDraft({ sort_order: Number(stationHotspotSortOrderInput.value || 0) });
      });
    }

    if (saveStationHotspotButton) {
      saveStationHotspotButton.addEventListener("click", () => {
        void saveSceneEditorHotspot();
      });
    }

    const enterStationHotspotCreateButton = refs.app.querySelector('[data-action="enter-station-hotspot-create"]');
    if (enterStationHotspotCreateButton) {
      enterStationHotspotCreateButton.addEventListener("click", () => {
        enterStationHotspotCreateMode();
      });
    }

    if (clearStationHotspotDraftButton) {
      clearStationHotspotDraftButton.addEventListener("click", () => {
        state.sceneEditorDraft = null;
        state.sceneEditorActiveHotspotId = "";
        state.sceneEditorCreateMode = false;
        clearHotspotProductSearch();
        render();
      });
    }

    if (deleteStationHotspotButton) {
      deleteStationHotspotButton.addEventListener("click", () => {
        void deleteSceneEditorHotspot();
      });
    }

    if (createSceneButton && createSceneInput) {
      createSceneButton.addEventListener("click", () => {
        createSceneInput.click();
      });
      createSceneInput.addEventListener("change", () => {
        const file = createSceneInput.files && createSceneInput.files[0] ? createSceneInput.files[0] : null;
        if (!file) return;
        void createSceneFromUpload(
          file,
          createSceneNameInput ? createSceneNameInput.value : "",
          createSceneSortInput ? createSceneSortInput.value : ""
        ).finally(() => {
          createSceneInput.value = "";
          if (createSceneNameInput) createSceneNameInput.value = "";
        });
      });
    }

    if (saveSceneMetaButton) {
      saveSceneMetaButton.addEventListener("click", () => {
        void saveSelectedSceneMeta(sceneNameInput ? sceneNameInput.value : "", sceneSortInput ? sceneSortInput.value : "");
      });
    }

    if (sceneBackgroundButton && sceneBackgroundInput) {
      sceneBackgroundButton.addEventListener("click", () => {
        sceneBackgroundInput.click();
      });
      sceneBackgroundInput.addEventListener("change", () => {
        const file = sceneBackgroundInput.files && sceneBackgroundInput.files[0] ? sceneBackgroundInput.files[0] : null;
        if (!file) return;
        void replaceSelectedSceneBackground(file).finally(() => {
          sceneBackgroundInput.value = "";
        });
      });
    }

    if (deleteSceneButton) {
      deleteSceneButton.addEventListener("click", () => {
        void deleteSelectedScene();
      });
    }

    if (sceneDraftTitleInput) {
      sceneDraftTitleInput.addEventListener("input", () => {
        updateSceneEditorDraft({ title: String(sceneDraftTitleInput.value || "") });
      });
    }

    if (sceneDraftContentInput) {
      sceneDraftContentInput.addEventListener("input", () => {
        updateSceneEditorDraft({ content_text: String(sceneDraftContentInput.value || "") });
      });
    }

    if (sceneDraftSortInput) {
      sceneDraftSortInput.addEventListener("change", () => {
        updateSceneEditorDraft({ sort_order: Number(sceneDraftSortInput.value || 0) });
      });
    }

    if (saveSceneHotspotButton) {
      saveSceneHotspotButton.addEventListener("click", () => {
        void saveSceneEditorHotspot();
      });
    }

    if (clearSceneDraftButton) {
      clearSceneDraftButton.addEventListener("click", () => {
        state.sceneEditorDraft = null;
        state.sceneEditorActiveHotspotId = "";
        render();
      });
    }

    if (deleteSceneHotspotButton) {
      deleteSceneHotspotButton.addEventListener("click", () => {
        void deleteSceneEditorHotspot();
      });
    }

    refs.app.querySelectorAll('[data-action="scene-editor-hotspot"]').forEach((node) => {
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginSceneEditorInteraction("move", event, node.getAttribute("data-hotspot-id"));
      });
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        state.sceneEditorCreateMode = false;
        selectSceneHotspotForEditing(node.getAttribute("data-hotspot-id"));
      });
    });

    refs.app.querySelectorAll('[data-action="scene-editor-hotspot-resize"]').forEach((node) => {
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginSceneEditorInteraction("resize", event, node.getAttribute("data-hotspot-id"));
      });
    });

    if (editorStage) {
      editorStage.addEventListener("pointerdown", (event) => {
        if (
          event.target &&
          event.target !== editorStage &&
          typeof event.target.closest === "function" &&
          event.target.closest('[data-action="scene-editor-hotspot"]')
        ) {
          return;
        }
        if (!state.sceneEditorCreateMode) {
          state.sceneEditorDraft = null;
          state.sceneEditorActiveHotspotId = "";
          render();
          return;
        }
        beginSceneEditorInteraction("create", event, "");
      });
    }

    refs.app.querySelectorAll('[data-product-id]:not([data-action="play-product-hotspot"])').forEach((button) => {
      button.addEventListener("click", () => {
        const productId = String(button.getAttribute("data-product-id") || "").trim();
        if (!productId) return;
        state.selectedProductId = productId;
        setAssetState("", "pending", false, "");
        void toggleProductPlayback(productId);
      });
    });

    refs.app.querySelectorAll('[data-action="play-product-hotspot"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const controlAction = String(button.getAttribute("data-control-action") || "").trim();
        if (controlAction) {
          if (controlAction === "toggle_station") {
            toggleActiveStationSlot();
            return;
          }
          if (controlAction === "toggle_station_narration") {
            void toggleStationPlayback(getActiveStationSlot().slotKey);
            return;
          }
          if (controlAction === "enter_ops") {
            setMode("ops");
            return;
          }
          if (controlAction === "exit_app") {
            requestExit();
            return;
          }
        }
        const productId = String(button.getAttribute("data-product-id") || "").trim();
        const hotspotId = String(button.getAttribute("data-hotspot-id") || "").trim();
        if (!productId) return;
        const sameProductPlaying =
          String(state.selectedProductId || "") === productId &&
          !String(state.stationPlaybackSlotKey || "").trim() &&
          (
            String(state.playingProductId || "") === productId ||
            String(state.pendingPlaybackProductId || "") === productId ||
            String(state.lastPlaybackRequestedUrl || "").trim()
          );
        if (sameProductPlaying) {
          interruptCurrentPlayback({
            preserveError: false,
            preserveRequestUrl: false,
            resetSource: true,
          });
          render();
          return;
        }
        state.selectedProductId = productId;
        setAssetState("", "pending", false, "");
        void toggleProductPlayback(productId, hotspotId);
      });
    });
  }

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
    if (Number(stationSegmentDurationCache[cacheKey] || 0) > 0) {
      return Promise.resolve(Math.round(Number(stationSegmentDurationCache[cacheKey])));
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
        stationSegmentDurationCache[cacheKey] = durationMs;
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
    if (!opts.force && narrationStopDurationRequestMap[cacheKey]) {
      try {
        return await narrationStopDurationRequestMap[cacheKey];
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
          narrationStopDurationCache[cacheKey] = Math.round(Number(totalDurationMs));
          render();
        }
        return Number(narrationStopDurationCache[cacheKey] || 0);
      } catch (_) {
        return 0;
      }
    })();
    narrationStopDurationRequestMap[cacheKey] = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (narrationStopDurationRequestMap[cacheKey] === requestPromise) {
        delete narrationStopDurationRequestMap[cacheKey];
      }
    }
  }

  async function hydrateStationPlaybackQueue(queue, playbackSeq) {
    const baseQueue = Array.isArray(queue) ? queue : [];
    const durations = await Promise.all(baseQueue.map((segment) => loadStationSegmentDurationMs(segment)));
    if (playbackSeq !== latestStationPlaybackSeq) return null;
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

  function applyStationTimelineHighlight(elapsedMs) {
    const events = Array.isArray(state.stationPlaybackTimelineEvents) ? state.stationPlaybackTimelineEvents : [];
    let activeEvent = null;
    for (const event of events) {
      if (Number(event.timeMs || 0) <= elapsedMs) {
        activeEvent = event;
      } else {
        break;
      }
    }
    if (!activeEvent) {
      state.highlightedHotspotId = '';
      state.highlightedProductId = '';
      return;
    }
    if (String(activeEvent.eventType || 'focus_switch') === 'highlight_off') {
      state.highlightedHotspotId = '';
      state.highlightedProductId = '';
      return;
    }
    state.highlightedHotspotId = String(activeEvent.hotspotId || '');
    state.highlightedProductId = String(activeEvent.productId || '');
  }

  async function startStationSegment(slotKey, segmentIndex, playbackSeq, startAtMs) {
    if (playbackSeq !== latestStationPlaybackSeq) return;
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
      if (playbackSeq !== latestStationPlaybackSeq) return;
      try {
        refs.audio.currentTime = segmentLocalMs / 1000;
      } catch (_) {}
      const playResult = refs.audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      if (playbackSeq !== latestStationPlaybackSeq) return;
      state.audioBusy = false;
      state.stationPlaybackBusy = false;
      state.pendingStationSlotKey = "";
      state.playingStationSlotKey = String(slotKey || "");
      render();
    } catch (_) {
      if (playbackSeq !== latestStationPlaybackSeq) return;
      setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
      setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
    }
  }

  async function playStationSlot(slotKey, options) {
    const opts = options && typeof options === "object" ? options : {};
    const slot = getStationSlotByKey(slotKey);
    const stationVisual = findSceneById(slotKey);
    const recordingId = String(slot.recordingId || (stationVisual && stationVisual.recording_id) || '').trim();
    const stopIndex = normalizeStationStopIndex(slot.stopIndex != null ? slot.stopIndex : stationVisual && stationVisual.stop_index);
    if (!recordingId) {
      resetAudioPlayback();
      setStationPlaybackFailure("Station archive is not configured.");
      setStationPlaybackFailure("Station archive is not configured.");
      return;
    }
    if (stopIndex == null) {
      resetAudioPlayback();
      setStationPlaybackFailure("No stop is selected for the current station.");
      setStationPlaybackFailure("No stop is selected for the current station.");
      return;
    }
    const recordingMeta = await ensureRecordingMeta(recordingId);
    if (!recordingMeta) {
      resetAudioPlayback();
      setStationPlaybackFailure("Station archive is unavailable.");
      setStationPlaybackFailure("Station archive is unavailable.");
      return;
    }
    if (stopIndex < 0 || stopIndex >= recordingMeta.stops.length) {
      resetAudioPlayback();
      setStationPlaybackFailure("The selected station stop is invalid.");
      setStationPlaybackFailure("The selected station stop is invalid.");
      return;
    }

    interruptCurrentPlayback({
      preserveError: false,
      preserveStationError: false,
      preserveRequestUrl: false,
      resetSource: true,
    });
    const playbackSeq = latestStationPlaybackSeq;
    const resolvedStopName = String(
      recordingMeta.stops[stopIndex] || slot.stopName || (stationVisual && stationVisual.stop_name) || ''
    ).trim();
    state.audioBusy = true;
    state.audioError = '';
    state.stationPlaybackBusy = true;
    state.stationPlaybackError = '';
    state.stationPlaybackState = "playing";
    state.stationPlaybackCursorMs = 0;
    state.stationPlaybackTotalDurationMs = 0;
    state.pendingStationSlotKey = String(slot.slotKey || '');
    state.stationPlaybackSlotKey = String(slot.slotKey || '');
    state.stationPlaybackStopName = resolvedStopName;
    state.stationPlaybackQueue = [];
    state.stationPlaybackSegmentIndex = -1;
    state.stationPlaybackAnswerText = '';
    state.stationPlaybackTimelineEvents = stationVisual && Array.isArray(stationVisual.timeline_events)
      ? normalizeTimelineEvents(stationVisual.timeline_events)
      : Array.isArray(slot.timelineEvents)
        ? normalizeTimelineEvents(slot.timelineEvents)
        : [];
    if (Array.isArray(state.stationPlaybackTimelineEvents) && state.stationPlaybackTimelineEvents.length) {
      state.highlightedHotspotId = String(state.stationPlaybackTimelineEvents[0].hotspotId || '');
      state.highlightedProductId = String(state.stationPlaybackTimelineEvents[0].productId || '');
    } else {
      state.highlightedHotspotId = '';
      state.highlightedProductId = '';
    }
    state.lastPlaybackRequestedUrl = '';
    if (resolvedStopName != String(slot.stopName || '').trim()) {
      state.demoStationSlots = STATION_SLOT_KEYS.map((knownKey, index) => {
        const currentSlot = getStationSlotByKey(knownKey);
        if (knownKey !== String(slot.slotKey || '')) return normalizeStationSlot(currentSlot, index);
        return normalizeStationSlot(Object.assign({}, currentSlot, { stopName: resolvedStopName }), index);
      });
      persistStationSlotsState();
    }
    render();

    try {
      const payload = await fetchJson('/api/recordings/' + encodeURIComponent(recordingId) + '/stop/' + encodeURIComponent(String(stopIndex)), state.clientId);
      if (playbackSeq != latestStationPlaybackSeq) return;
      const baseQueue = normalizeStationSegments(payload);
      if (!baseQueue.length) {
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        return;
      }
      const hydrated = await hydrateStationPlaybackQueue(baseQueue, playbackSeq);
      if (!hydrated || !Array.isArray(hydrated.queue) || !hydrated.queue.length || Number(hydrated.totalDurationMs || 0) <= 0) {
        setStationPlaybackFailure("Current station archive audio duration is unavailable.");
        setStationPlaybackFailure("Current station archive audio duration is unavailable.");
        return;
      }
      const startCursorMs = clampStationPlaybackCursorMs(
        opts.startAtMs == null ? 0 : Math.min(normalizeTimelineEventTimeMs(opts.startAtMs), hydrated.totalDurationMs)
      );
      state.stationPlaybackQueue = hydrated.queue;
      state.stationPlaybackTotalDurationMs = Math.round(Number(hydrated.totalDurationMs || 0));
      state.stationPlaybackCursorMs = startCursorMs;
      state.stationPlaybackSegmentIndex = findStationSegmentIndexForGlobalMs(startCursorMs);
      state.stationPlaybackAnswerText = String(payload && payload.answer_text ? payload.answer_text : '').trim();
      state.stationPlaybackStopName = String(payload && payload.stop_name ? payload.stop_name : resolvedStopName).trim();
      applyStationTimelineHighlight(startCursorMs);
      await startStationSegment(
        slot.slotKey,
        state.stationPlaybackSegmentIndex < 0 ? 0 : state.stationPlaybackSegmentIndex,
        playbackSeq,
        startCursorMs
      );
    } catch (error) {
      if (playbackSeq != latestStationPlaybackSeq) return;
      const code = String(error && error.code ? error.code : '').trim();
      if (code === 'not_found') {
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        setStationPlaybackFailure("Current station archive audio is unavailable.");
      } else {
        setStationPlaybackFailure(describeRequestError(error));
      }
      render();
    }
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
    latestStationPlaybackSeq += 1;
    const playbackSeq = latestStationPlaybackSeq;
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
      if (playbackSeq !== latestStationPlaybackSeq) return null;
      const groupKey = [String(node.recordingId || "").trim(), String(node.stopIndex)].join("::");
      let stopPlan = stopPlanCache.get(groupKey) || null;
      if (!stopPlan) {
        const payload = await fetchJson(
          '/api/recordings/' + encodeURIComponent(String(node.recordingId || '')) + '/stop/' + encodeURIComponent(String(node.stopIndex)),
          state.clientId
        );
        if (playbackSeq !== latestStationPlaybackSeq) return null;
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
    const playbackSeq = latestStationPlaybackSeq;
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
      if (!plan || playbackSeq !== latestStationPlaybackSeq) return;
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
      if (playbackSeq !== latestStationPlaybackSeq) return;
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
    latestStationPlaybackSeq += 1;
    const playbackSeq = latestStationPlaybackSeq;
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

  async function finalizeAudioMutation(productId, successMessage, syncFailedMessage) {
    state.selectedProductId = String(productId || "").trim();
    await loadCurrentHall({ forceOnline: true });
    state.selectedProductId = String(productId || "").trim();
    if (state.hall) {
      await syncOfflineResources({
        hall: state.hall,
        products: state.products,
        referencedProducts: state.referencedProducts,
      });
    }
    const syncSucceeded = state.syncTone !== "danger";
    setAssetState(syncSucceeded ? successMessage : syncFailedMessage, syncSucceeded ? "ready" : "warning", false, "");
    const selected = getSelectedProduct();
    if (selected) {
      state.audioTextDrafts[String(selected.product_id || "").trim()] = getCurrentAudioText(selected) || String(selected.intro_text || "").trim();
    }
    render();
    if (selected && selected.playback_url) {
      await playSelectedProduct();
    }
  }

  async function finalizeImageMutation(productId, successMessage, syncFailedMessage) {
    state.selectedProductId = String(productId || "").trim();
    await loadCurrentHall({ forceOnline: true });
    state.selectedProductId = String(productId || "").trim();
    if (state.hall) {
      await syncOfflineResources({
        hall: state.hall,
        products: state.products,
        referencedProducts: state.referencedProducts,
      });
    }
    const syncSucceeded = state.syncTone !== "danger";
    setAssetState(
      syncSucceeded ? successMessage : syncFailedMessage,
      syncSucceeded ? "ready" : "warning",
      false,
      "upload-image"
    );
    render();
  }

  async function saveSelectedProductInfo() {
    const product = getSelectedProduct();
    if (!product || state.assetBusy) return;
    const productId = String(product.product_id || "").trim();
    const nextName = getEditableProductName(product).trim();
    const nextIntro = getEditableProductIntro(product).trim();
    if (!nextName) {
      setAssetState("\u8bf7\u5148\u586b\u5199\u4ea7\u54c1\u540d\u79f0\u3002", "danger", false, "save-product-info");
      render();
      return;
    }
    setAssetState("\u6b63\u5728\u4fdd\u5b58\u4ea7\u54c1\u4fe1\u606f...", "pending", true, "save-product-info");
    render();
    try {
      await fetchJson("/api/pad/products/" + encodeURIComponent(productId), state.clientId, {
        method: "PUT",
        json: {
          product_name: nextName,
          intro_text: nextIntro,
        },
      });
      state.selectedProductId = productId;
      await loadCurrentHall({ forceOnline: true });
      state.selectedProductId = productId;
      if (state.hall) {
        await syncOfflineResources({
          hall: state.hall,
          products: state.products,
          referencedProducts: state.referencedProducts,
        });
      }
      updateProductInfoDraft(productId, {
        product_name: nextName,
        intro_text: nextIntro,
      });
      const syncSucceeded = state.syncTone !== "danger";
      setAssetState(
        syncSucceeded ? "\u4ea7\u54c1\u4fe1\u606f\u5df2\u4fdd\u5b58\u5e76\u540c\u6b65\u79bb\u7ebf\u8d44\u6e90\u3002" : "\u4ea7\u54c1\u4fe1\u606f\u5df2\u4fdd\u5b58\uff0c\u4f46\u79bb\u7ebf\u540c\u6b65\u5931\u8d25\u3002",
        syncSucceeded ? "ready" : "warning",
        false,
        "save-product-info"
      );
      render();
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "save-product-info");
      render();
    }
  }

  async function regenerateSelectedProductAudio() {
    const product = getSelectedProduct();
    if (!product || state.assetBusy) return;
    const nextText = getEditableAudioText(product).trim();
    if (!nextText) {
      setAssetState("\u8bf7\u5148\u586b\u5199\u8bb2\u89e3\u6587\u5b57\uff0c\u518d\u91cd\u65b0\u751f\u6210 TTS\u3002", "danger", false, "");
      render();
      return;
    }
    setAssetState("\u6b63\u5728\u4e3a\u5f53\u524d\u4ea7\u54c1\u751f\u6210 TTS \u8bb2\u89e3\u97f3\u9891...", "pending", true, "regenerate");
    render();
    try {
      await fetchJson("/api/pad/products/" + encodeURIComponent(product.product_id) + "/audio/regenerate", state.clientId, {
        method: "POST",
        json: { activate: true, text: nextText },
      });
      await finalizeAudioMutation(
        product.product_id,
        "\u5df2\u751f\u6210\u5f53\u524d\u4ea7\u54c1\u7684 TTS \u8bb2\u89e3\u97f3\u9891\uff0c\u5e76\u5df2\u540c\u6b65\u79bb\u7ebf\u8d44\u6e90\u3002",
        "\u5df2\u751f\u6210\u5f53\u524d\u4ea7\u54c1\u7684 TTS \u8bb2\u89e3\u97f3\u9891\uff0c\u4f46\u79bb\u7ebf\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u201c\u540c\u6b65\u79bb\u7ebf\u8d44\u6e90\u201d\u3002"
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "");
      render();
    }
  }

  async function uploadSelectedProductAudio(file) {
    const product = getSelectedProduct();
    if (!product || !file || state.assetBusy) return;
    const formData = new FormData();
    formData.append("activate", "true");
    formData.append("text_snapshot", getEditableAudioText(product).trim());
    formData.append("file", file, file.name || "recorded.wav");
    setAssetState("\u6b63\u5728\u4e0a\u4f20\u5f55\u97f3\u5e76\u66ff\u6362\u5f53\u524d\u751f\u6548\u97f3\u9891...", "pending", true, "upload");
    render();
    try {
      await fetchJson("/api/pad/products/" + encodeURIComponent(product.product_id) + "/audio/upload", state.clientId, {
        method: "POST",
        body: formData,
      });
      await finalizeAudioMutation(
        product.product_id,
        "\u5df2\u4e0a\u4f20\u5f55\u97f3\uff0c\u5e76\u5df2\u540c\u6b65\u79bb\u7ebf\u8d44\u6e90\u3002",
        "\u5df2\u4e0a\u4f20\u5f55\u97f3\uff0c\u4f46\u79bb\u7ebf\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u201c\u540c\u6b65\u79bb\u7ebf\u8d44\u6e90\u201d\u3002"
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "");
      render();
    }
  }

  async function uploadSelectedProductImages(files) {
    const product = getSelectedProduct();
    const uploadFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!product || !uploadFiles.length || state.assetBusy) return;
    setAssetState(IMAGE_TEXT.uploading, 'pending', true, 'upload-image');
    render();
    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append('file', file, file.name || 'product.png');
        await fetchJson('/api/pad/products/' + encodeURIComponent(product.product_id) + '/images/upload', state.clientId, {
          method: 'POST',
          body: formData,
        });
      }
      await finalizeImageMutation(
        product.product_id,
        '??? ' + uploadFiles.length + IMAGE_TEXT.uploadSuccessMiddle,
        IMAGE_TEXT.uploadSuccessSyncFailed
      );
    } catch (error) {
      setAssetState(describeRequestError(error), 'danger', false, 'upload-image');
      render();
    }
  }

  async function refreshHallAfterSceneMutation(successMessage, syncFailedMessage, action, selectedSceneId, selectedHotspotId) {
    await loadCurrentHall({ forceOnline: true });
    state.sceneEditorCreateMode = false;
    if (selectedSceneId) {
      state.selectedSceneId = String(selectedSceneId || "");
    }
    if (selectedHotspotId) {
      state.sceneEditorActiveHotspotId = String(selectedHotspotId || "");
    }
    if (state.hall) {
      await syncOfflineResources({
        hall: state.hall,
        products: state.products,
        referencedProducts: state.referencedProducts,
        scenes: state.scenes,
      });
    }
    const syncSucceeded = state.syncTone !== "danger";
    setAssetState(successMessage, syncSucceeded ? "ready" : "warning", false, action);
    render();
  }

  function buildStationHotspotsExportFilename(stationKey, exportedAtMs) {
    const hallId = String(state.hall && state.hall.hall_id ? state.hall.hall_id : "hall").trim() || "hall";
    const key = String(stationKey || "station").trim() || "station";
    const date = new Date(Number(exportedAtMs || Date.now()));
    const pad = (value) => String(value).padStart(2, "0");
    const stamp =
      String(date.getFullYear()) +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "-" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds());
    return hallId + "-" + key + "-hotspots-" + stamp + ".json";
  }

  function triggerJsonDownload(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result || "")));
        } catch (error) {
          reject(error || new Error("invalid_json"));
        }
      };
      reader.onerror = () => {
        reject(reader.error || new Error("file_read_failed"));
      };
      reader.readAsText(file, "utf-8");
    });
  }

  async function exportCurrentStationHotspots() {
    const slot = getActiveStationSlot();
    if (!slot || state.assetBusy) return;
    const stationKey = String(slot.slotKey || "").trim();
    if (!stationKey) {
      setAssetState("当前站点不存在，无法导出热区配置。", "danger", false, "station-hotspot-export");
      render();
      return;
    }
    setAssetState("正在导出热区配置...", "pending", true, "station-hotspot-export");
    render();
    try {
      const payload = await fetchJson(
        "/api/pad/halls/current/stations/" + encodeURIComponent(stationKey) + "/hotspots/export",
        state.clientId
      );
      triggerJsonDownload(
        buildStationHotspotsExportFilename(
          payload && payload.station_key ? payload.station_key : stationKey,
          payload && payload.exported_at_ms
        ),
        payload
      );
      setAssetState("热区配置已导出。", "ready", false, "station-hotspot-export");
      render();
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "station-hotspot-export");
      render();
    }
  }

  async function importCurrentStationHotspots(file) {
    const slot = getActiveStationSlot();
    const selectedScene = getSelectedScene();
    if (!slot || state.assetBusy) return;
    const stationKey = String(slot.slotKey || "").trim();
    if (!stationKey) {
      setAssetState("当前站点不存在，无法导入热区配置。", "danger", false, "station-hotspot-import");
      render();
      return;
    }
    setAssetState("正在导入热区配置...", "pending", true, "station-hotspot-import");
    render();
    try {
      const parsed = await readJsonFile(file);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.hotspots)) {
        throw new Error("hotspots_must_be_list");
      }
      await fetchJson(
        "/api/pad/halls/current/stations/" + encodeURIComponent(stationKey) + "/hotspots/import",
        state.clientId,
        {
          method: "POST",
          json: {
            hotspots: parsed.hotspots,
          },
        }
      );
      clearHotspotProductSearch();
      await refreshHallAfterSceneMutation(
        "热区配置已导入并同步离线资源。",
        "热区配置已导入，但离线同步需要重试。",
        "station-hotspot-import",
        selectedScene ? selectedScene.scene_id : "",
        ""
      );
    } catch (error) {
      const message =
        error && error.message === "hotspots_must_be_list"
          ? "导入文件格式无效，缺少 hotspots 数组。"
          : describeRequestError(error);
      setAssetState(message, "danger", false, "station-hotspot-import");
      render();
    }
  }

  async function saveSelectedStationConfig(options) {
    const selectedScene = getSelectedScene();
    const selectedSlot = getActiveStationSlot();
    if (!selectedScene || !selectedSlot || state.assetBusy) return;
    const opts = options && typeof options === "object" ? options : {};
    const narrationNodes = Array.isArray(opts.narrationNodes) ? normalizeNarrationNodes(opts.narrationNodes) : getStationNarrationNodes(selectedSlot);
    if (String(selectedSlot.narrationNodesError || "").trim()) {
      setAssetState("旧时间轴数据仍需人工整理，暂时不能保存。", "danger", false, "station-config");
      render();
      return;
    }
    const invalidNode = narrationNodes.find((node) => !getNarrationNodeValidation(selectedSlot.slotKey, node).valid);
    if (invalidNode) {
      setAssetState(getNarrationNodeValidation(selectedSlot.slotKey, invalidNode).message, "danger", false, "station-config");
      render();
      return;
    }
    setAssetState("Saving station configuration...", "pending", true, "station-config");
    render();
    try {
      const nextStationId = String(opts.stationId != null ? opts.stationId : selectedSlot.stationId || "").trim();
      const displaySlotIds = STATION_SLOT_KEYS.map((slotKey) => {
        const slotItem = getStationSlotByKey(slotKey);
        if (slotKey === String(selectedSlot.slotKey || "")) return nextStationId || String(slotItem.stationId || "").trim();
        return String(slotItem.stationId || "").trim();
      });
      await fetchJson("/api/pad/display/current/config", state.clientId, {
        method: "PUT",
        json: {
          slot_station_ids: displaySlotIds,
        },
      });
      await fetchJson(
        "/api/pad/halls/current/stations/" + encodeURIComponent(selectedSlot.slotKey),
        state.clientId,
        {
          method: "PUT",
          json: {
            station_id: nextStationId,
            label: String(opts.label != null ? opts.label : selectedSlot.label || "").trim(),
            recording_id: String(opts.recordingId != null ? opts.recordingId : selectedSlot.recordingId || "").trim(),
            stop_index:
              Object.prototype.hasOwnProperty.call(opts, "stopIndex")
                ? opts.stopIndex
                : normalizeStationStopIndex(selectedSlot.stopIndex),
            stop_name: String(opts.stopName != null ? opts.stopName : selectedSlot.stopName || "").trim(),
          },
        }
      );
      if (Array.isArray(narrationNodes)) {
        await fetchJson(
          "/api/pad/halls/current/stations/" + encodeURIComponent(selectedSlot.slotKey) + "/timeline",
          state.clientId,
          {
            method: "PUT",
            json: {
              narration_nodes: narrationNodes.map((node, index) => ({
                node_id: String(node.nodeId || "").trim(),
                sort_order: Number(node.sortOrder != null ? node.sortOrder : index),
                recording_id: String(node.recordingId || "").trim(),
                stop_index: normalizeStationStopIndex(node.stopIndex),
                stop_name: String(node.stopName || "").trim(),
                highlight_start_ms: Number(node.highlightStartMs || 0),
                highlight_end_ms: Number(node.highlightEndMs || 0),
                hotspot_ids: (Array.isArray(node.hotspotIds) ? node.hotspotIds : []).map((hotspotId) => String(hotspotId || "").trim()),
              })),
            },
          }
        );
      }
      await refreshHallAfterSceneMutation(
        "Station configuration saved.",
        "Station configuration saved, but offline sync needs a retry.",
        "station-config",
        selectedScene.scene_id,
        state.sceneEditorActiveHotspotId
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "station-config");
      render();
    }
  }

  async function uploadSelectedStationAsset(file, assetKind) {
    const selectedScene = getSelectedScene();
    const selectedSlot = getActiveStationSlot();
    const kind = String(assetKind || "").trim().toLowerCase();
    if (!selectedScene || !selectedSlot || !file || state.assetBusy) return;
    const formData = new FormData();
    formData.append("file", file, file.name || (kind === "wireframe" ? "wireframe.png" : "background.png"));
    setAssetState(
      kind === "wireframe" ? "Uploading station wireframe..." : "Uploading station background...",
      "pending",
      true,
      kind === "wireframe" ? "station-wireframe" : "station-background"
    );
    render();
    try {
      await fetchJson(
        "/api/pad/halls/current/stations/" + encodeURIComponent(selectedSlot.slotKey) + "/" + encodeURIComponent(kind),
        state.clientId,
        {
          method: "POST",
          body: formData,
        }
      );
      await refreshHallAfterSceneMutation(
        kind === "wireframe" ? "Station wireframe updated." : "Station background updated.",
        kind === "wireframe"
          ? "Station wireframe updated, but offline sync needs a retry."
          : "Station background updated, but offline sync needs a retry.",
        kind === "wireframe" ? "station-wireframe" : "station-background",
        selectedScene.scene_id,
        state.sceneEditorActiveHotspotId
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, kind === "wireframe" ? "station-wireframe" : "station-background");
      render();
    }
  }

  async function createSceneFromUpload(file, sceneName, sortOrder) {
    if (!file || state.assetBusy) return;
    const name = String(sceneName || "").trim();
    if (!name) {
      setAssetState("Please fill in a scene name before uploading a background.", "danger", false, "scene-create");
      render();
      return;
    }
    const formData = new FormData();
    formData.append("name", name);
    formData.append("sort_order", String(Number(sortOrder || 0)));
    formData.append("file", file, file.name || "scene.png");
    setAssetState("Creating scene and uploading background...", "pending", true, "scene-create");
    render();
    try {
      const payload = await fetchJson("/api/pad/halls/current/scenes", state.clientId, {
        method: "POST",
        body: formData,
      });
      await refreshHallAfterSceneMutation(
        "Scene created and offline assets synced.",
        "Scene created, but offline sync did not finish cleanly.",
        "scene-create",
        payload && payload.scene ? payload.scene.scene_id : "",
        ""
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "scene-create");
      render();
    }
  }

  async function replaceSelectedSceneBackground(file) {
    const scene = getSelectedScene();
    if (!scene || !file || state.assetBusy) return;
    const formData = new FormData();
    formData.append("file", file, file.name || "scene.png");
    setAssetState("Replacing scene background...", "pending", true, "scene-background");
    render();
    try {
      await fetchJson("/api/pad/halls/current/scenes/" + encodeURIComponent(scene.scene_id) + "/background", state.clientId, {
        method: "POST",
        body: formData,
      });
      await refreshHallAfterSceneMutation(
        "Scene background updated and synced offline.",
        "Scene background updated, but offline sync needs a retry.",
        "scene-background",
        scene.scene_id,
        state.sceneEditorActiveHotspotId
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "scene-background");
      render();
    }
  }

  async function saveSelectedSceneMeta(name, sortOrder) {
    const scene = getSelectedScene();
    if (!scene || state.assetBusy) return;
    const nextName = String(name || "").trim();
    if (!nextName) {
      setAssetState("Scene name is required.", "danger", false, "scene-meta");
      render();
      return;
    }
    setAssetState("Saving scene metadata...", "pending", true, "scene-meta");
    render();
    try {
      await fetchJson("/api/pad/halls/current/scenes/" + encodeURIComponent(scene.scene_id), state.clientId, {
        method: "PUT",
        json: {
          name: nextName,
          sort_order: Number(sortOrder || 0),
        },
      });
      await refreshHallAfterSceneMutation(
        "Scene metadata saved.",
        "Scene metadata saved, but offline sync needs a retry.",
        "scene-meta",
        scene.scene_id,
        state.sceneEditorActiveHotspotId
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "scene-meta");
      render();
    }
  }

  async function deleteSelectedScene() {
    const scene = getSelectedScene();
    if (!scene || state.assetBusy) return;
    setAssetState("Deleting scene...", "pending", true, "scene-delete");
    render();
    try {
      await fetchJson("/api/pad/halls/current/scenes/" + encodeURIComponent(scene.scene_id), state.clientId, {
        method: "DELETE",
      });
      state.sceneEditorDraft = null;
      state.sceneEditorActiveHotspotId = "";
      state.sceneDialogHotspotId = "";
      await refreshHallAfterSceneMutation(
        "Scene deleted.",
        "Scene deleted, but offline sync needs a retry.",
        "scene-delete",
        "",
        ""
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "scene-delete");
      render();
    }
  }

  function buildSceneDraft(scene, geometry, sourceHotspot) {
    const hotspot = sourceHotspot && typeof sourceHotspot === "object" ? sourceHotspot : {};
    const controlAction = getHotspotControlAction(hotspot);
    const product = getHotspotProduct(hotspot);
    return {
      scene_id: String(scene.scene_id || ""),
      station_key: String(scene.station_key || scene.scene_id || ""),
      hotspot_id: String(hotspot.hotspot_id || "").trim(),
      product_id: String(hotspot.product_id || "").trim(),
      product_search_text: String(hotspot.product_search_text || hotspot.product_name || (product && product.product_name) || "").trim(),
      target_type: getHotspotTargetType(hotspot),
      control_action: controlAction,
      control_label: controlAction ? getHotspotControlLabel(hotspot) : "",
      sort_order: Number(
        hotspot.sort_order != null
          ? hotspot.sort_order
          : (Array.isArray(scene.hotspots) ? scene.hotspots.length : 0) + 1
      ),
      x_pct: clampPct(geometry.x_pct),
      y_pct: clampPct(geometry.y_pct),
      width_pct: clampPct(geometry.width_pct),
      height_pct: clampPct(geometry.height_pct),
      title: String(hotspot.title || "").trim(),
      content_text: String(hotspot.content_text || "").trim(),
    };
  }

  function selectSceneHotspotForEditing(hotspotId) {
    const scene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(scene);
    const normalizedHotspotId = String(hotspotId || "").trim();
    const hotspot =
      draft && String(draft.hotspot_id || "") === normalizedHotspotId ? draft : getSceneHotspotById(scene, hotspotId);
    if (!scene || !hotspot) return;
    state.sceneEditorDraft = buildSceneDraft(scene, hotspot, hotspot);
    state.sceneEditorActiveHotspotId = String(hotspot.hotspot_id || "");
    clearHotspotProductSearch();
    render();
  }

  async function saveSceneEditorHotspot() {
    const scene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(scene);
    if (!scene || !draft || state.assetBusy) return;
    const productId = String(draft.product_id || "").trim();
    const manualProductName = productId ? "" : String(draft.product_search_text || "").trim();
    const payload = {
      product_id: productId,
      manual_product_name: manualProductName,
      sort_order: Number(draft.sort_order || 0),
      x_pct: clampPct(draft.x_pct),
      y_pct: clampPct(draft.y_pct),
      width_pct: clampPct(draft.width_pct),
      height_pct: clampPct(draft.height_pct),
    };
    setAssetState("Saving hotspot...", "pending", true, "station-hotspot");
    render();
    try {
      const response = draft.hotspot_id
        ? await fetchJson(
            "/api/pad/halls/current/stations/" +
              encodeURIComponent(scene.station_key || scene.scene_id) +
              "/hotspots/" +
              encodeURIComponent(draft.hotspot_id),
            state.clientId,
            {
              method: "PUT",
              json: payload,
            }
          )
        : await fetchJson("/api/pad/halls/current/stations/" + encodeURIComponent(scene.station_key || scene.scene_id) + "/hotspots", state.clientId, {
            method: "POST",
            json: payload,
          });
      const hotspotId = response && response.hotspot ? response.hotspot.hotspot_id : draft.hotspot_id;
      state.sceneEditorDraft = null;
      state.sceneEditorCreateMode = false;
      clearHotspotProductSearch();
      await refreshHallAfterSceneMutation(
        "Hotspot saved and synced offline.",
        "Hotspot saved, but offline sync needs a retry.",
        "station-hotspot",
        scene.scene_id,
        hotspotId
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "station-hotspot");
      render();
    }
  }

  async function deleteSceneEditorHotspot() {
    const scene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(scene);
    if (!scene || !draft || !draft.hotspot_id || state.assetBusy) return;
    setAssetState("Deleting hotspot...", "pending", true, "scene-hotspot-delete");
    render();
    try {
      await fetchJson(
        "/api/pad/halls/current/stations/" +
          encodeURIComponent(scene.station_key || scene.scene_id) +
          "/hotspots/" +
          encodeURIComponent(draft.hotspot_id),
        state.clientId,
        {
          method: "DELETE",
        }
      );
      state.sceneEditorDraft = null;
      state.sceneEditorActiveHotspotId = "";
      state.sceneEditorCreateMode = false;
      await refreshHallAfterSceneMutation(
        "Hotspot deleted.",
        "Hotspot deleted, but offline sync needs a retry.",
        "station-hotspot-delete",
        scene.scene_id,
        ""
      );
    } catch (error) {
      setAssetState(describeRequestError(error), "danger", false, "station-hotspot-delete");
      render();
    }
  }

  function getEditorStageElement() {
    return refs.app.querySelector('[data-scene-stage-role="editor"]');
  }

  function getScenePointFromEvent(event, stageEl) {
    const rect = stageEl.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return {
      x: clampPct((Number(event.clientX || 0) - rect.left) / width),
      y: clampPct((Number(event.clientY || 0) - rect.top) / height),
    };
  }

  function beginSceneEditorInteraction(kind, event, hotspotId) {
    const scene = getSelectedScene();
    const stageEl = getEditorStageElement();
    if (!scene || !stageEl) return;
    const point = getScenePointFromEvent(event, stageEl);
    if (kind === "create") {
      state.sceneEditorDraft = buildSceneDraft(
        scene,
        { x_pct: point.x, y_pct: point.y, width_pct: 0.02, height_pct: 0.02 },
        null
      );
      state.sceneEditorActiveHotspotId = "";
    } else {
      const hotspot = getSceneHotspotById(scene, hotspotId);
      if (!hotspot) return;
      state.sceneEditorDraft = buildSceneDraft(scene, hotspot, hotspot);
      state.sceneEditorActiveHotspotId = String(hotspot.hotspot_id || "");
    }
    sceneEditorInteraction = {
      kind: kind,
      scene_id: String(scene.scene_id || ""),
      hotspot_id: String(hotspotId || "").trim(),
      start_point: point,
      origin_draft: Object.assign({}, state.sceneEditorDraft),
    };
    render();
  }

  function updateSceneEditorInteraction(event) {
    const interaction = sceneEditorInteraction;
    const scene = getSelectedScene();
    const stageEl = getEditorStageElement();
    if (!interaction || !scene || !stageEl || String(scene.scene_id || "") !== String(interaction.scene_id || "")) return;
    const point = getScenePointFromEvent(event, stageEl);
    const origin = interaction.origin_draft;
    let nextGeometry = null;
    if (interaction.kind === "create") {
      const left = Math.min(interaction.start_point.x, point.x);
      const top = Math.min(interaction.start_point.y, point.y);
      const width = Math.max(0.02, Math.abs(point.x - interaction.start_point.x));
      const height = Math.max(0.02, Math.abs(point.y - interaction.start_point.y));
      nextGeometry = {
        x_pct: Math.min(left, 1 - width),
        y_pct: Math.min(top, 1 - height),
        width_pct: width,
        height_pct: height,
      };
    } else if (interaction.kind === "move") {
      const deltaX = point.x - interaction.start_point.x;
      const deltaY = point.y - interaction.start_point.y;
      const width = clampPct(origin.width_pct);
      const height = clampPct(origin.height_pct);
      nextGeometry = {
        x_pct: Math.min(Math.max(0, origin.x_pct + deltaX), 1 - width),
        y_pct: Math.min(Math.max(0, origin.y_pct + deltaY), 1 - height),
        width_pct: width,
        height_pct: height,
      };
    } else if (interaction.kind === "resize") {
      const width = Math.max(0.02, point.x - origin.x_pct);
      const height = Math.max(0.02, point.y - origin.y_pct);
      nextGeometry = {
        x_pct: clampPct(origin.x_pct),
        y_pct: clampPct(origin.y_pct),
        width_pct: Math.min(width, 1 - clampPct(origin.x_pct)),
        height_pct: Math.min(height, 1 - clampPct(origin.y_pct)),
      };
    }
    if (!nextGeometry) return;
    state.sceneEditorDraft = Object.assign({}, origin, nextGeometry, {
      scene_id: String(scene.scene_id || ""),
    });
    render();
  }

  async function endSceneEditorInteraction() {
    const interaction = sceneEditorInteraction;
    if (!interaction) return;
    sceneEditorInteraction = null;
    if (interaction.kind === "create") {
      state.sceneEditorCreateMode = false;
    }
    const scene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(scene);
    const shouldAutoSave =
      !!scene &&
      !!draft &&
      !!draft.hotspot_id &&
      interaction.kind !== "create" &&
      hasSceneHotspotGeometryChanged(interaction.origin_draft, draft);
    render();
    if (!shouldAutoSave) return;
    await saveSceneEditorHotspot();
  }

  async function cacheAudioAssets(products) {
    if (!window.caches) {
      throw createError("cache_api_unsupported", { kind: "unsupported" });
    }
    const cache = await window.caches.open(AUDIO_CACHE);
    for (const product of products) {
      if (!product || !product.playback_url) continue;
      const response = await fetch(product.playback_url, {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-RagInt-Bypass-SW": "1",
        },
      });
      if (!response.ok) {
        throw createError("audio_cache_failed", { kind: "http", status: response.status });
      }
      await cache.put(product.playback_url, response.clone());
    }
  }

  async function cacheImageAssets(products) {
    if (!window.caches) {
      throw createError("cache_api_unsupported", { kind: "unsupported" });
    }
    const cache = await window.caches.open(IMAGE_CACHE);
    for (const product of products) {
      const images = getProductImages(product);
      for (const image of images) {
        if (!image || !image.image_url) continue;
        const response = await fetch(image.image_url, {
          method: "GET",
          cache: "no-store",
          headers: {
            "X-RagInt-Bypass-SW": "1",
          },
        });
        if (!response.ok) {
          throw createError("image_cache_failed", { kind: "http", status: response.status });
        }
        await cache.put(image.image_url, response.clone());
      }
    }
  }

  async function cacheSceneBackgroundAssets(scenes) {
    if (!window.caches) {
      throw createError("cache_api_unsupported", { kind: "unsupported" });
    }
    const cache = await window.caches.open(IMAGE_CACHE);
    for (const scene of Array.isArray(scenes) ? scenes : []) {
      const background = scene && scene.background && typeof scene.background === "object" ? scene.background : null;
      if (!background || !background.image_url) continue;
      const response = await fetch(background.image_url, {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-RagInt-Bypass-SW": "1",
        },
      });
      if (!response.ok) {
        throw createError("scene_image_cache_failed", { kind: "http", status: response.status });
      }
      await cache.put(background.image_url, response.clone());
    }
  }

  async function cacheStationVisualAssets(stations) {
    if (!window.caches) {
      throw createError("cache_api_unsupported", { kind: "unsupported" });
    }
    const cache = await window.caches.open(IMAGE_CACHE);
    for (const station of Array.isArray(stations) ? stations : []) {
      const assets = [station && station.background ? station.background : null, station && station.wireframe ? station.wireframe : null];
      for (const asset of assets) {
        if (!asset || !asset.image_url) continue;
        const response = await fetch(asset.image_url, {
          method: "GET",
          cache: "no-store",
          headers: {
            "X-RagInt-Bypass-SW": "1",
          },
        });
        if (!response.ok) {
          throw createError("station_image_cache_failed", { kind: "http", status: response.status });
        }
        await cache.put(asset.image_url, response.clone());
      }
    }
  }

  async function syncOfflineResources(options) {
    const hall = options && options.hall ? options.hall : state.hall;
    const rawProducts = Array.isArray(options && options.products) ? options.products : state.products;
    const rawReferencedProducts = Array.isArray(options && options.referencedProducts)
      ? options.referencedProducts
      : state.referencedProducts;
    const rawStations = Array.isArray(options && options.stations)
      ? options.stations
      : Array.isArray(options && options.scenes)
        ? options.scenes
        : state.scenes;
    if (!hall || !state.clientId) return;

    const syncSeq = latestSyncSeq + 1;
    latestSyncSeq = syncSeq;
    setSyncState(TEXT.syncPendingSyncing, "pending", true);
    render();

    try {
      if (!window.caches || !window.indexedDB || !("serviceWorker" in navigator)) {
        throw createError("offline_capability_unsupported", { kind: "unsupported" });
      }

      const manifestPayload = await fetchJson("/api/pad/offline/manifest", state.clientId);
      const mergedProducts = mergeProducts(rawProducts, manifestPayload.items, state.clientId);
      const mergedReferencedProducts = mergeProducts(
        rawReferencedProducts,
        manifestPayload.referenced_items,
        state.clientId
      );
      const mergedStations = normalizeStations(manifestPayload.stations, state.clientId);
      const cacheProducts = mergedProducts.concat(
        mergedReferencedProducts.filter(
          (product) => !mergedProducts.find((entry) => String(entry.product_id || "") === String(product.product_id || ""))
        )
      );
      await cacheAudioAssets(cacheProducts);
      await cacheImageAssets(cacheProducts);
      await cacheStationVisualAssets(mergedStations);

      if (syncSeq !== latestSyncSeq) return;

      const snapshot = {
        clientId: state.clientId,
        display: state.display,
        hall: manifestPayload.hall || hall,
        version: Number(manifestPayload.version || 0),
        products: mergedProducts,
        referencedProducts: mergedReferencedProducts,
        stations: mergedStations.length ? mergedStations : normalizeStations(rawStations, state.clientId),
        stationCatalog: Array.isArray(state.stationCatalog) ? state.stationCatalog : [],
        syncedAtMs: Date.now(),
        offlineReady: true,
      };
      await writeSnapshot(snapshot);

      if (syncSeq !== latestSyncSeq) return;

      state.products = mergedProducts;
      state.referencedProducts = mergedReferencedProducts;
      state.display = manifestPayload && manifestPayload.display ? manifestPayload.display : state.display;
      state.scenes = Array.isArray(snapshot.stations) ? snapshot.stations : [];
      state.demoStationSlots = normalizeStationsToSlots(manifestPayload.stations);
      state.stationCatalog = Array.isArray(snapshot.stationCatalog) ? snapshot.stationCatalog : [];
      preloadStationSlotRecordingMeta();
      state.hall = snapshot.hall;
      state.offlineReady = true;
      state.lastSyncedAtMs = snapshot.syncedAtMs;
      state.usingOfflineSnapshot = false;
      setSyncState(buildSyncReadyMessage(cacheProducts), "ready", false);
      ensureSelectedScene();
      render();
    } catch (error) {
      if (syncSeq !== latestSyncSeq) return;
      const rawReason = error && error.message ? String(error.message) : "unknown_error";
      const detail =
        error && error.kind === "unsupported"
          ? TEXT.syncDangerOfflineUnsupportedDetail + rawReason
          : TEXT.syncDangerOfflineSyncFailed + rawReason;
      state.offlineReady = false;
      setSyncState(detail, "danger", false);
      render();
    }
  }

  async function loadFromOfflineSnapshot() {
    const snapshot = await readSnapshot(state.clientId);
    if (!snapshot || !snapshot.offlineReady) {
      throw createError("offline_not_ready", { kind: "offline_not_ready" });
    }
    state.display = snapshot.display || null;
    state.hall = snapshot.hall || null;
    state.products = Array.isArray(snapshot.products) ? snapshot.products : [];
    state.referencedProducts = Array.isArray(snapshot.referencedProducts) ? snapshot.referencedProducts : [];
    state.scenes = Array.isArray(snapshot.stations) ? snapshot.stations : [];
    state.demoStationSlots = normalizeStationsToSlots(snapshot.stations);
    state.stationCatalog = Array.isArray(snapshot.stationCatalog) ? snapshot.stationCatalog : [];
    preloadStationSlotRecordingMeta();
    state.offlineReady = true;
    state.lastSyncedAtMs = Number(snapshot.syncedAtMs || 0);
    state.usingOfflineSnapshot = true;
    setSyncState(TEXT.syncReadyOffline, "ready", false);
    ensureSelectedProduct();
    ensureSelectedScene();
  }

  async function loadCurrentHall(options) {
    const forceOnline = !!(options && options.forceOnline);
    const loadSeq = latestLoadSeq + 1;
    latestLoadSeq = loadSeq;
    state.loading = true;
    state.errorMessage = "";
    state.errorDetail = "";
    state.sceneEditorCreateMode = false;
    state.online = navigator.onLine !== false;
    render();

    const shouldTryOnline = forceOnline || navigator.onLine !== false;

    if (shouldTryOnline) {
      try {
        const bootstrapPayload = await fetchJson("/api/pad/bootstrap", state.clientId);
        const productsPayload = await fetchJson("/api/pad/halls/current/products", state.clientId);
        const displayPayload = await fetchJson("/api/pad/display/current", state.clientId);

        if (loadSeq !== latestLoadSeq) return;

        state.display = displayPayload && displayPayload.display ? displayPayload.display : bootstrapPayload.display || null;
        state.stationCatalog = Array.isArray(displayPayload && displayPayload.station_catalog) ? displayPayload.station_catalog : [];
        state.hall = bootstrapPayload.hall || (displayPayload && displayPayload.hall) || (productsPayload && productsPayload.hall) || null;
        state.products = mergeProducts(productsPayload.items, null, state.clientId);
        state.referencedProducts = mergeProducts(productsPayload.referenced_items, null, state.clientId);
        state.scenes = normalizeStations(displayPayload && displayPayload.stations, state.clientId);
        state.demoStationSlots = normalizeStationsToSlots(displayPayload && displayPayload.stations);
        preloadStationSlotRecordingMeta();
        preloadNarrationStopDurations();
        state.loading = false;
        state.usingOfflineSnapshot = false;
        state.offlineReady = false;
        setSyncState(TEXT.syncPendingOnlineLoaded, "pending", false);
        ensureSelectedProduct();
        ensureSelectedScene();
        render();

        void syncOfflineResources({
          hall: state.hall,
          products: productsPayload.items,
          referencedProducts: productsPayload.referenced_items,
          stations: displayPayload && displayPayload.stations,
        });
        return;
      } catch (error) {
        if (loadSeq !== latestLoadSeq) return;
        if (error && error.kind === "http") {
          state.loading = false;
          state.errorMessage = TEXT.loadFailed;
          if (error.code === "display_binding_not_found" || error.code === "hall_binding_not_found") {
            state.errorDetail = TEXT.hallBindingNotFoundDetail;
          } else if (error.code) {
            state.errorDetail = TEXT.backendErrorPrefix + error.code;
          } else {
            state.errorDetail = TEXT.backendUnknownDetail;
          }
          setSyncState(TEXT.syncDangerLoadFailed, "danger", false);
          render();
          return;
        }
      }
    }

    try {
      await loadFromOfflineSnapshot();
      if (loadSeq !== latestLoadSeq) return;
      preloadStationSlotRecordingMeta();
      preloadNarrationStopDurations();
      state.loading = false;
      state.errorMessage = "";
      state.errorDetail = "";
      render();
    } catch (_) {
      if (loadSeq !== latestLoadSeq) return;
      state.loading = false;
      state.products = [];
      state.referencedProducts = [];
      state.scenes = [];
      state.demoStationSlots = createDefaultStationSlots();
      state.hall = null;
      state.errorMessage = TEXT.offlineNotReady;
      state.errorDetail = TEXT.offlineNotReadyDetail;
      setSyncState(TEXT.syncDangerOfflineNotReady, "danger", false);
      render();
    }
  }

  async function toggleProductPlayback(productId, hotspotId) {
    const nextProductId = String(productId || state.selectedProductId || "").trim();
    const nextHotspotId = String(hotspotId || "").trim();
    if (nextProductId) {
      state.selectedProductId = nextProductId;
    }
    const samePlayingProduct =
      nextProductId &&
      (String(state.playingProductId || "") === nextProductId ||
        String(state.pendingPlaybackProductId || "") === nextProductId);
    if (samePlayingProduct) {
      interruptCurrentPlayback({
        preserveError: false,
        preserveRequestUrl: false,
        resetSource: true,
      });
      render();
      return;
    }
    state.audioError = "";
    await playSelectedProduct(nextProductId, nextHotspotId);
  }

  async function playSelectedProduct(productId, hotspotId) {
    const nextProductId = String(productId || state.selectedProductId || "").trim();
    const nextHotspotId = String(hotspotId || "").trim();
    if (nextProductId) {
      state.selectedProductId = nextProductId;
    }
    const product = findProductById(nextProductId) || getSelectedProduct();
    if (!product) return;
    if (!product.playback_url) {
      interruptCurrentPlayback({
        preserveError: false,
        preserveRequestUrl: false,
        resetSource: true,
      });
      state.audioError = TEXT.noAudio;
      render();
      return;
    }

    interruptCurrentPlayback({
      preserveError: false,
      preserveRequestUrl: true,
      resetSource: true,
    });
    const playbackSeq = latestStationPlaybackSeq;
    state.audioBusy = true;
    state.audioError = "";
    state.pendingPlaybackProductId = String(product.product_id || "");
    state.highlightedHotspotId = nextHotspotId;
    state.highlightedProductId = String(product.product_id || "");
    state.lastPlaybackRequestedUrl = product.playback_url;
    render();

    try {
      refs.audio.src = product.playback_url;
      const playResult = refs.audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      if (playbackSeq !== latestStationPlaybackSeq) return;
      state.audioBusy = false;
      state.audioError = "";
      state.pendingPlaybackProductId = "";
      state.playingProductId = String(product.product_id || "");
      recordProductPlay(product);
      render();
    } catch (_) {
      if (playbackSeq !== latestStationPlaybackSeq) return;
      state.audioBusy = false;
      state.pendingPlaybackProductId = "";
      state.playingProductId = "";
      state.audioError = TEXT.audioPlayFailed;
      render();
    }
  }

  async function switchHall(clientId) {
    const nextClientId = persistClientId(clientId);
    resetAudioPlayback();
    state.display = null;
    state.hall = null;
    state.products = [];
    state.referencedProducts = [];
    state.scenes = [];
    state.stationCatalog = [];
    state.selectedProductId = "";
    state.selectedSceneId = "";
    state.sceneDialogHotspotId = "";
    state.sceneEditorActiveHotspotId = "";
    state.sceneEditorDraft = null;
    state.audioTextDrafts = Object.create(null);
    state.productInfoDrafts = Object.create(null);
    clearHotspotProductSearch();
    state.loading = true;
    state.errorMessage = "";
    state.errorDetail = "";
    state.online = navigator.onLine !== false;
    state.usingOfflineSnapshot = false;
    state.offlineReady = false;
    state.lastSyncedAtMs = 0;
    setAssetState("", "pending", false, "");
    setSyncState("婵犵數濮烽弫鍛婃叏閻㈠壊鏁婇柡宥庡幖缁愭淇婇妶鍛殲鐎规洘鐓￠弻鐔兼焽閿曗偓閺嬫稓绱掗煬鎻掆偓婵嬪蓟閿曗偓铻ｅ〒姘煎灡椤庡棝姊洪懖鈺侇暭閻庣瑳鍥﹂柛鏇ㄥ枤閻も偓闂佽宕樺▔娑€傞搹鍦＝濞达絾褰冩禍楣冩⒑缁洖澧茬紒瀣浮閹繝寮撮姀锛勫帾婵犮垼鍩栫粙鎾诲礆閺夊簱鏀介柍銉у仺閸嬨垺顨ラ悙瀵稿⒌鐎殿喖鐖奸獮瀣敍濠靛棙鍎撻梻?" + nextClientId, "pending", false);
    render();
    await loadCurrentHall({ forceOnline: true });
  }

  function bindAudioEvents() {
    refs.audio.addEventListener("play", () => {
      state.audioBusy = false;
      state.audioError = "";
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        state.stationPlaybackBusy = false;
        state.stationPlaybackError = "";
        state.stationPlaybackState = "playing";
        state.playingStationSlotKey = String(state.stationPlaybackSlotKey || "");
        state.pendingStationSlotKey = "";
        state.playingProductId = "";
        state.pendingPlaybackProductId = "";
        syncStationPlaybackCursorFromAudio();
      } else {
        state.playingProductId = String(state.pendingPlaybackProductId || state.selectedProductId || "");
        state.pendingPlaybackProductId = "";
      }
      render();
    });
    refs.audio.addEventListener("timeupdate", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        syncStationPlaybackCursorFromAudio();
      }
      render();
    });
    refs.audio.addEventListener("loadedmetadata", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        syncStationPlaybackCursorFromAudio();
      }
      render();
    });
    refs.audio.addEventListener("durationchange", () => {
      render();
    });
    refs.audio.addEventListener("seeked", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        syncStationPlaybackCursorFromAudio();
      }
      render();
    });
    refs.audio.addEventListener("ended", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        const queue = Array.isArray(state.stationPlaybackQueue) ? state.stationPlaybackQueue : [];
        const currentSegment = getStationPlaybackQueueSegment(state.stationPlaybackSegmentIndex);
        if (currentSegment) {
          state.stationPlaybackCursorMs = normalizeTimelineEventTimeMs(currentSegment.endMs);
          applyStationTimelineHighlight(state.stationPlaybackCursorMs);
        }
        const nextIndex = Number(state.stationPlaybackSegmentIndex) + 1;
        if (nextIndex >= 0 && nextIndex < queue.length) {
          state.playingStationSlotKey = "";
          state.pendingStationSlotKey = String(state.stationPlaybackSlotKey || "");
          state.audioBusy = true;
          state.stationPlaybackBusy = true;
          state.stationPlaybackState = "playing";
          render();
          void startStationSegment(
            state.stationPlaybackSlotKey,
            nextIndex,
            latestStationPlaybackSeq,
            normalizeTimelineEventTimeMs(queue[nextIndex] && queue[nextIndex].startMs)
          );
          return;
        }
        state.audioBusy = false;
        state.stationPlaybackBusy = false;
        state.stationPlaybackState = "idle";
        state.playingStationSlotKey = "";
        state.pendingStationSlotKey = "";
        state.stationPlaybackSegmentIndex = queue.length ? queue.length - 1 : -1;
        state.stationPlaybackCursorMs = getStationPlaybackDurationMs();
        applyStationTimelineHighlight(state.stationPlaybackCursorMs);
        state.stationPlaybackEndedHotspotIds = [];
        state.visibleHotspotIds = [];
        state.flashingHotspotIds = [];
        state.highlightedHotspotId = "";
        stopStationTimelineSync();
        state.lastPlaybackRequestedUrl = "";
        render();
        return;
      }
      state.audioBusy = false;
      state.playingProductId = "";
      state.pendingPlaybackProductId = "";
      state.lastPlaybackRequestedUrl = "";
      render();
    });
    refs.audio.addEventListener("error", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
        setStationPlaybackFailure("Station narration playback failed. Please check whether the archived stop audio is complete.");
        return;
      }
      state.audioBusy = false;
      state.playingProductId = "";
      state.pendingPlaybackProductId = "";
      state.audioError = TEXT.audioPlayFailed;
      render();
    });
    refs.audio.addEventListener("pause", () => {
      state.audioBusy = false;
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        if (String(state.stationPlaybackState || "") === "paused") {
          syncStationPlaybackCursorFromAudio();
        } else if (!state.pendingStationSlotKey && !refs.audio.ended) {
          state.playingStationSlotKey = "";
          state.stationPlaybackBusy = false;
          state.stationPlaybackState = "paused";
          syncStationPlaybackCursorFromAudio();
        }
      } else if (!state.pendingPlaybackProductId) {
        state.playingProductId = "";
      }
      render();
    });
  }

  function publishE2eState() {
    window.__RAGINT_PAD_E2E__ = {
      getState: function () {
        const selected = getSelectedProduct();
        const stations = Array.isArray(state.scenes) ? state.scenes : [];
        const activeStation = getSelectedScene();
        return {
          mode: state.mode,
          clientId: state.clientId,
          displayId: state.display && state.display.display_id ? state.display.display_id : "",
          displayName: state.display && state.display.display_name ? state.display.display_name : "",
          hallId: state.hall && state.hall.hall_id ? state.hall.hall_id : "",
          hallName: state.hall && state.hall.hall_name ? state.hall.hall_name : "",
          opsStationTab: normalizeOpsStationTab(state.opsStationTab),
          productCount: Array.isArray(state.products) ? state.products.length : 0,
          referencedProductIds: (Array.isArray(state.referencedProducts) ? state.referencedProducts : []).map((item) =>
            String(item.product_id || "")
          ),
          stationCount: stations.length,
          stationIds: stations.map((item) => String(item.station_id || item.scene_id || "")),
          activeStationId: activeStation ? String(activeStation.station_id || activeStation.scene_id || "") : "",
          activeStationSlotKey: activeStation ? String(activeStation.slot_key || activeStation.station_key || "") : "",
          activeStationHotspotCount: activeStation && Array.isArray(activeStation.hotspots) ? activeStation.hotspots.length : 0,
          productHotspots: activeStation && Array.isArray(activeStation.hotspots)
            ? activeStation.hotspots.map((item) => ({
                hotspotId: String(item.hotspot_id || ""),
                productId: String(item.product_id || ""),
                stationId: String(item.station_id || item.scene_id || ""),
                slotKey: String(item.slot_key || item.station_key || ""),
              }))
            : [],
          narrationNodes: activeStation && Array.isArray(activeStation.narration_nodes)
            ? activeStation.narration_nodes.map((item) => normalizeNarrationNode(item, 0))
            : [],
          narrationTimelineEvents: Array.isArray(state.stationPlaybackTimelineEvents)
            ? state.stationPlaybackTimelineEvents.map((item) => ({
                eventId: String(item.eventId || ""),
                timeMs: Number(item.timeMs || 0),
                productId: String(item.productId || ""),
                hotspotId: String(item.hotspotId || ""),
                eventType: String(item.eventType || "focus_switch"),
              }))
            : [],
          sceneCount: Array.isArray(state.scenes) ? state.scenes.length : 0,
          sceneIds: (Array.isArray(state.scenes) ? state.scenes : []).map((item) => String(item.scene_id || "")),
          selectedSceneId: String(state.selectedSceneId || ""),
          selectedSceneHotspotCount: activeStation && Array.isArray(activeStation.hotspots) ? activeStation.hotspots.length : 0,
          sceneDialogHotspotId: String(state.sceneDialogHotspotId || ""),
          sceneEditorActiveHotspotId: String(state.sceneEditorActiveHotspotId || ""),
          sceneEditorCreateMode: !!state.sceneEditorCreateMode,
          displayProductIds: getDisplayProducts().map((item) => String(item.product_id || "")),
          selectedProductId: selected ? selected.product_id : "",
          opsStationTab: normalizeOpsStationTab(state.opsStationTab),
          opsAnnotateSidebarTab: normalizeOpsAnnotateSidebarTab(state.opsAnnotateSidebarTab),
          playingProductId: String(state.playingProductId || ""),
          pendingPlaybackProductId: String(state.pendingPlaybackProductId || ""),
          demoLeftTabKey: normalizeDemoLeftTabKey(state.demoLeftTabKey),
          demoRightTabKey: normalizeDemoRightTabKey(state.demoRightTabKey),
          stationSlots: (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : []).map((slot, index) =>
            normalizeStationSlot(slot, index)
          ),
          stationPlaybackSlotKey: String(state.stationPlaybackSlotKey || ""),
          stationPlaybackState: String(state.stationPlaybackState || ""),
          stationPlaybackCursorMs: Number(state.stationPlaybackCursorMs || 0),
          stationPlaybackNodeId: String(state.stationPlaybackNodeId || ""),
          playingStationSlotKey: String(state.playingStationSlotKey || ""),
          pendingStationSlotKey: String(state.pendingStationSlotKey || ""),
          stationPlaybackError: String(state.stationPlaybackError || ""),
          highlightedHotspotId: String(state.highlightedHotspotId || ""),
          highlightedProductId: String(state.highlightedProductId || ""),
          activeNodeId: String(state.activeNarrationNodeId || ""),
          visibleHotspotIds: (Array.isArray(state.visibleHotspotIds) ? state.visibleHotspotIds : []).map((id) => String(id || "")),
          flashingHotspotIds: (Array.isArray(state.flashingHotspotIds) ? state.flashingHotspotIds : []).map((id) => String(id || "")),
          stationPlaybackTimelineEventCount: Array.isArray(state.stationPlaybackTimelineEvents)
            ? state.stationPlaybackTimelineEvents.length
            : 0,
          exitRequested: !!window.__ragint_exit_requested,
          demoColumns: Number(state.demoColumns || DEFAULT_DEMO_COLUMNS),
          audioError: String(state.audioError || ""),
          displayProductPlayCounts: Object.assign({}, state.displayProductPlayCounts),
          productPlayCounts: Object.assign({}, state.productPlayCounts),
          offlineReady: !!state.offlineReady,
          usingOfflineSnapshot: !!state.usingOfflineSnapshot,
          syncMessage: state.syncMessage,
          syncTone: state.syncTone,
          lastSyncedAtMs: Number(state.lastSyncedAtMs || 0),
          lastPlaybackRequestedUrl: state.lastPlaybackRequestedUrl,
          audioCurrentSrc: refs.audio.currentSrc || "",
          audioCurrentTimeMs: getStationPlaybackCurrentTimeMs(),
          currentAudioText: selected ? getCurrentAudioText(selected) : "",
          currentAudioDraft: selected ? getEditableAudioText(selected) : "",
          currentAudioSourceType: selected ? String(selected.audio_source_type || "") : "",
          currentImageAssetIds: selected ? getProductImages(selected).map((item) => String(item.image_asset_id || "")) : [],
          currentPrimaryImageIsFallback: !!(selected && isFallbackImage(getPrimaryImage(selected))),
          currentPrimaryImageUrl: selected && getPrimaryImage(selected) ? String(getPrimaryImage(selected).image_url || "") : "",
          currentSceneBackgroundUrl:
            activeStation && activeStation.background ? String(activeStation.background.image_url || "") : "",
          errorMessage: state.errorMessage,
          errorDetail: state.errorDetail,
          hallPresets: HALL_PRESETS.map((item) => ({
            clientId: item.clientId,
            hallId: item.hallId,
            hallName: item.hallName,
          })),
          stationCatalogIds: (Array.isArray(state.stationCatalog) ? state.stationCatalog : []).map((item) =>
            String(item.station_id || "")
          ),
        };
      },
      switchHall: function (clientId) {
        return switchHall(clientId);
      },
      setMode: function (mode) {
        setMode(mode);
      },
      setOpsStationTab: function (tab) {
        setOpsStationTab(tab);
      },
      toggleActiveStationSlot: function () {
        toggleActiveStationSlot();
      },
      setDemoLeftTab: function (tabKey) {
        setDemoLeftTab(tabKey);
      },
      setDemoRightTab: function (tabKey) {
        setDemoRightTab(tabKey);
      },
      toggleStationPlayback: function (slotKey) {
        return toggleStationPlayback(slotKey);
      },
      playProduct: function (productId) {
        return toggleProductPlayback(productId);
      },
      requestExit: function () {
        requestExit();
      },
    };
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      setSyncState(TEXT.syncDangerOfflineUnsupported, "danger", false);
      render();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      try {
        await registration.update();
      } catch (_) {}
      await navigator.serviceWorker.ready;
    } catch (_) {
      setSyncState(TEXT.syncDangerOfflineInitFailed, "danger", false);
      render();
    }
  }

  async function bootstrapApp() {
    persistClientId(ensureClientId());
    state.productPlayCounts = readProductPlayCountsFromStorage();
    state.displayProductPlayCounts = Object.assign(Object.create(null), state.productPlayCounts);
    state.demoColumns = readDemoColumnsFromStorage();
    const stationSlotState = readStationSlotsFromStorage();
    state.demoLeftTabKey = normalizeDemoLeftTabKey(stationSlotState.activeLeftTab);
    state.demoRightTabKey = normalizeDemoRightTabKey(stationSlotState.activeRightTab);
    state.demoStationSlots = STATION_SLOT_KEYS.map((slotKey, index) => {
      const slot =
        (stationSlotState && Array.isArray(stationSlotState.slots) ? stationSlotState.slots : []).find(
          (item) => String(item && item.slotKey ? item.slotKey : "").trim() === slotKey
        ) || getDefaultStationSlot(slotKey, index);
      return normalizeStationSlot(slot, index);
    });
    bindAudioEvents();
    publishE2eState();
    render();
    void refreshRecordingOptions();
    preloadStationSlotRecordingMeta();
    await registerServiceWorker();
    await loadCurrentHall();
  }

  window.addEventListener("pointermove", (event) => {
    if (stationTimelineInteraction) {
      updateStationTimelineSelection(event.clientX);
    }
    if (narrationNodeInteraction) {
      updateNarrationNodeInteraction(event.clientX);
    }
    if (!sceneEditorInteraction) return;
    updateSceneEditorInteraction(event);
  });

  window.addEventListener("pointerup", () => {
    endStationTimelineSelection();
    endNarrationNodeInteraction();
    void endSceneEditorInteraction();
  });

  window.addEventListener("pointercancel", () => {
    endStationTimelineSelection();
    endNarrationNodeInteraction();
    void endSceneEditorInteraction();
  });

  window.addEventListener("keydown", (event) => {
    const key = String(event && event.key ? event.key : "").trim().toLowerCase();
    if (state.mode !== "demo") return;
    if (key === "h") {
      event.preventDefault();
      setMode("ops");
    }
  });

  window.addEventListener("online", () => {
    state.online = true;
    void loadCurrentHall();
  });

  window.addEventListener("offline", () => {
    state.online = false;
    render();
  });
  window.addEventListener("resize", () => {
    syncMobileAnnotateToolsHeight();
  });
  window.addEventListener("scroll", () => {
    syncMobileAnnotateToolsHeight();
  });

  void bootstrapApp();
})();
