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
    loading: "Loading current hall and product list...",
    loadFailed: "Online load failed",
    offlineNotReady: "Offline resources not ready",
    offlineNotReadyDetail: "This device has not completed offline sync for the current hall yet. Please sync once while online.",
    hallBindingNotFoundDetail: "The current clientId is not bound to a hall. Please use the hall switcher below.",
    backendErrorPrefix: "Backend error: ",
    backendUnknownDetail: "Backend returned an unexpected state.",
    unboundHall: "Unbound hall",
    liveData: "实时数据",
    offlineSnapshot: "离线快照",
    noProducts: "No products are available in the current hall.",
    noSelection: "Select a product card on the left to play its active narration audio.",
    noAudio: "This product has no active narration audio.",
    audioPlayFailed: "Product narration audio failed to play. Please check whether the resource is synced.",
    audioPreparing: "Preparing playback...",
    audioPlay: "Play product narration",
    currentAudioReady: "Active audio",
    currentAudioMissing: "No audio",
    introTitle: "Product introduction",
    infoTitle: "Product info",
    registrationName: "Registration name",
    registrationNumber: "Registration number",
    effectiveDate: "Effective date",
    company: "Company",
    emptyField: "Not filled",
    currentAudioStatusReady: "Narration ready",
    currentAudioStatusMissing: "No active audio",
    currentAudioStatusFailed: "Playback failed",
    currentAudioStatusPreparing: "Preparing playback",
    currentAudioStatusPlaying: "Playing",
    notSelected: "No product selected",
    heroEyebrow: "Hall Product Explainer",
    heroSubtitle: "This device binds a hall by clientId and prioritizes that hall's offline assets.",
    refreshOnline: "Refresh live data",
    syncOffline: "Sync offline assets",
    gotoRagint: "Enter hall guide mode",
    statClientId: "Device clientId",
    statProductCount: "Product count",
    statNetwork: "Network",
    statOffline: "Offline",
    online: "Online",
    offline: "Offline",
    hallListTitle: "Hall product list",
    lastSyncAt: "Last sync time: ",
    currentPlaying: "Now playing",
    syncPendingInit: "Preparing hall assets",
    syncPendingOnlineLoaded: "Live data loaded, preparing offline pack",
    syncPendingSyncing: "Syncing offline assets for this hall",
    syncReadyOffline: "Using offline resources",
    syncReadyCountPrefix: "Offline assets synced (",
    syncReadyCountSuffix: " audio items)",
    syncDangerLoadFailed: "Current hall failed to load",
    syncDangerOfflineNotReady: "Offline resources not ready",
    syncDangerOfflineUnsupported: "Browser does not support offline cache",
    syncDangerOfflineInitFailed: "Offline cache initialization failed",
    syncDangerOfflineSyncFailed: "Offline sync failed: ",
    syncDangerOfflineUnsupportedDetail: "Browser does not support offline resources: ",
    bannerUsingOffline: "Currently using locally synced offline resources.",
    bannerOfflineReady: "Offline assets are ready and can continue playing without network.",
    bannerOnlineOnly: "Current view is online data and offline resources are not fully synced.",
    quickSwitchTitle: "Quick hall switch",
    quickSwitchHint: "Click a button to switch the current Pad clientId and hall content.",
    modeLabel: "UI mode",
    modeDemo: "Demo",
    modeOps: "Ops",
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
    stationPlaybackSegmentIndex: -1,
    stationPlaybackAnswerText: "",
    stationPlaybackTimelineEvents: [],
    highlightedHotspotId: "",
    highlightedProductId: "",
    lastPlaybackRequestedUrl: "",
    assetBusy: false,
    assetAction: "",
    assetMessage: "",
    assetTone: "pending",
    audioTextDrafts: Object.create(null),
    displayProductPlayCounts: Object.create(null),
    productPlayCounts: Object.create(null),
    demoColumns: DEFAULT_DEMO_COLUMNS,
    opsShowDemoLayout: false,
    opsShowHallProductList: false,
    opsShowHallSwitcher: false,
    demoLeftTabKey: DEFAULT_DEMO_LEFT_TAB,
    demoRightTabKey: DEFAULT_DEMO_RIGHT_TAB,
    scenes: [],
    selectedSceneId: "",
    sceneDialogHotspotId: "",
    sceneEditorActiveHotspotId: "",
    sceneEditorDraft: null,
    sceneEditorCreateMode: false,
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
  let latestStationPlaybackSeq = 0;
  let sceneEditorInteraction = null;
  const recordingMetaRequestMap = Object.create(null);
  let stationTimelineTimer = null;
  let stationTimelineStartedAtMs = 0;

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

  function normalizeStationSlot(raw, index) {
    const base = getDefaultStationSlot("", index);
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      slotKey: base.slotKey,
      stationId: String(item.stationId || item.station_id || "").trim(),
      label: String(item.label || "").trim(),
      recordingId: String(item.recordingId || "").trim(),
      stopIndex: normalizeStationStopIndex(item.stopIndex),
      stopName: String(item.stopName || "").trim(),
      timelineEvents: Array.isArray(item.timelineEvents) ? item.timelineEvents.slice() : [],
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
    render();
  }

  function updateSceneEditorDraft(fields) {
    const selectedScene = getSelectedScene();
    if (!selectedScene) return null;
    const base = getSceneEditorDraftForScene(selectedScene);
    if (!base) return null;
    state.sceneEditorDraft = Object.assign({}, base, fields || {}, {
      scene_id: String(selectedScene.scene_id || ""),
    });
    state.sceneEditorActiveHotspotId = String(state.sceneEditorDraft.hotspot_id || "");
    render();
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
          .map((slot) => String(slot && slot.recordingId ? slot.recordingId : "").trim())
          .filter(Boolean)
      )
    );
    uniqueRecordingIds.forEach((recordingId) => {
      void ensureRecordingMeta(recordingId);
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
        const timeMs = Number(item.time_ms || 0);
        const hotspotId = String(item.station_hotspot_id || item.hotspot_id || "").trim();
        if (!Number.isFinite(timeMs) || timeMs < 0 || !hotspotId) return null;
        return {
          eventId: String(item.event_id || "").trim(),
          sortOrder: Number(item.sort_order || index),
          timeMs,
          productId: String(item.product_id || "").trim(),
          hotspotId,
          eventType: String(item.event_type || "focus_switch").trim() || "focus_switch",
          updatedAtMs: Number(item.updated_at_ms || 0),
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
        const manifestAudio = manifestRow && manifestRow.audio ? manifestRow.audio : null;
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

  function getSelectedProduct() {
    const list = Array.isArray(state.products) ? state.products : [];
    const selected = list.find((item) => String(item.product_id || "") === String(state.selectedProductId || ""));
    return selected || list[0] || null;
  }

  function ensureSelectedProduct() {
    const selected = getSelectedProduct();
    state.selectedProductId = selected ? String(selected.product_id || "") : "";
  }

  function findProductById(productId) {
    const nextId = String(productId || "").trim();
    if (!nextId) return null;
    return (
      (Array.isArray(state.products) ? state.products : []).find(
        (item) => String(item && item.product_id ? item.product_id : "").trim() === nextId
      ) || null
    );
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

  function isStationSlotConfigured(slot) {
    const item = slot && typeof slot === "object" ? slot : {};
    return !!String(item.recordingId || "").trim() && normalizeStationStopIndex(item.stopIndex) != null;
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
    state.playingStationSlotKey = "";
    state.pendingStationSlotKey = "";
    state.stationPlaybackSlotKey = "";
    state.stationPlaybackStopName = "";
    state.stationPlaybackQueue = [];
    state.stationPlaybackSegmentIndex = -1;
    state.stationPlaybackAnswerText = "";
    state.stationPlaybackTimelineEvents = [];
    state.highlightedHotspotId = "";
    state.highlightedProductId = "";
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

  function renderModeToggle() {
    return (
      '<div class="pad-mode-toggle" role="group" aria-label="' +
      escapeHtml(TEXT.modeLabel) +
      '">' +
      '<button type="button" class="pad-mode-toggle__btn' +
      (state.mode === "demo" ? " is-active" : "") +
      '" data-action="set-mode" data-mode="demo" data-testid="mode-toggle-demo" aria-pressed="' +
      (state.mode === "demo" ? "true" : "false") +
      '">' +
      escapeHtml(TEXT.modeDemo) +
      "</button>" +
      '<button type="button" class="pad-mode-toggle__btn' +
      (state.mode === "ops" ? " is-active" : "") +
      '" data-action="set-mode" data-mode="ops" data-testid="mode-toggle-ops" aria-pressed="' +
      (state.mode === "ops" ? "true" : "false") +
      '">' +
      escapeHtml(TEXT.modeOps) +
      "</button>" +
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
    const draftHotspot = {
      hotspot_id: draft.hotspot_id || "__draft__",
      scene_id: draft.scene_id,
      station_key: draft.station_key,
      product_id: draft.product_id,
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
    const stretchToFit = !!opts.stretchToFit;
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
            (controlAction ? " pad-scene-hotspot--control" : "") +
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
      '<div class="pad-products">' +
      state.products
        .map((product) => {
          const active = String(product.product_id || "") === String(state.selectedProductId || "");
          const audioChip = product.has_active_audio
            ? '<span class="pad-chip pad-chip--ready">' + escapeHtml(TEXT.currentAudioReady) + "</span>"
            : '<span class="pad-chip pad-chip--warning">' + escapeHtml(TEXT.currentAudioMissing) + "</span>";
          return (
            '<button type="button" class="pad-product-card' +
            (active ? " is-active" : "") +
            '" data-product-id="' +
            escapeHtml(product.product_id) +
            '">' +
            '<div class="pad-product-card__top">' +
            "<div>" +
            '<div class="pad-product-card__title">' +
            escapeHtml(product.product_name || "Unnamed Product") +
            "</div>" +
            (product.product_name_en
              ? '<div class="pad-product-card__title-en">' + escapeHtml(product.product_name_en) + "</div>"
              : "") +
            "</div>" +
            audioChip +
            "</div>" +
            '<div class="pad-product-card__meta">' +
            (product.company ? '<span class="pad-chip">' + escapeHtml(product.company) + "</span>" : "") +
            (product.registration_number
              ? '<span class="pad-chip">' +
                escapeHtml(TEXT.registrationNumber + " " + product.registration_number) +
                "</span>"
              : "") +
            (product.effective_date
              ? '<span class="pad-chip">' +
                escapeHtml(TEXT.effectiveDate + " " + product.effective_date) +
                "</span>"
              : "") +
            "</div>" +
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
          ? "\u91cd\u65b0\u751f\u6210TTS"
          : "\u751f\u6210TTS\u8bb2\u89e3";
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
    const assetSummary = product.has_active_audio
      ? "\u5f53\u524d\u751f\u6548\u97f3\u9891\uff1a" +
        formatAudioSourceType(product.audio_source_type) +
        "\uff0c\u66f4\u65b0\u65f6\u95f4 " +
        formatTimestamp(product.audio_updated_at_ms)
      : "\u5f53\u524d\u8fd8\u6ca1\u6709\u751f\u6548\u8bb2\u89e3\u97f3\u9891\u3002";
    const currentAudioTextLabel = product.has_active_audio
      ? "\u5f53\u524d\u7f13\u5b58\u97f3\u9891\u5bf9\u5e94\u6587\u5b57"
      : "\u9884\u8bbe\u751f\u6210\u6587\u5b57";
    const currentAudioTextDisplay = currentAudioText
      ? currentAudioText
      : product.has_active_audio
        ? "\u5f53\u524d\u751f\u6548\u97f3\u9891\u8fd8\u672a\u7ed1\u5b9a\u6587\u5b57\u3002"
        : "\u6682\u65e0\u5f53\u524d\u751f\u6548\u97f3\u9891\uff0c\u91cd\u751f\u6210 TTS \u65f6\u5c06\u4f7f\u7528\u4e0b\u65b9\u6587\u5b57\u3002";

    return (
      '<div class="pad-detail">' +
      '<div class="pad-detail__header">' +
      "<div>" +
      '<h1 class="pad-detail__title">' +
      escapeHtml(product.product_name || "Unnamed Product") +
      "</h1>" +
      (product.product_name_en
        ? '<div class="pad-detail__subtitle">' + escapeHtml(product.product_name_en) + "</div>"
        : "") +
      "</div>" +
      '<div class="pad-detail__actions">' +
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
      "</div>" +
      "</div>" +
      '<div class="pad-banner ' + bannerTone + '">' + escapeHtml(bannerText) + "</div>" +
      renderProductImageSection(product) +
      (state.assetMessage && state.assetAction === "upload-image"
        ? '<div class="pad-banner ' + assetToneClass + '" style="margin: 0 24px 0;">' + escapeHtml(state.assetMessage) + "</div>"
        : "") +
      '<section class="pad-detail__section">' +
      '<div class="pad-detail__section-title">\u8bb2\u89e3\u97f3\u9891</div>' +
      '<div class="pad-detail__asset-summary">' + escapeHtml(assetSummary) + "</div>" +
      '<div class="pad-detail__field-label" style="margin-top:14px;">' +
      escapeHtml(currentAudioTextLabel) +
      "</div>" +
      '<div class="pad-detail__asset-text" data-testid="audio-text-current">' +
      escapeHtml(currentAudioTextDisplay) +
      "</div>" +
      '<div class="pad-detail__field-label" style="margin-top:16px;">\u91cd\u751f\u6210 / \u5f55\u97f3\u7ed1\u5b9a\u6587\u5b57</div>' +
      '<textarea class="pad-detail__textarea" data-action="audio-text-draft" data-testid="audio-text-editor" rows="7"' +
      (state.assetBusy ? " disabled" : "") +
      ">" +
      escapeHtml(editableAudioText) +
      "</textarea>" +
      '<div class="pad-detail__hint">\u70b9\u51fb\u201c\u91cd\u65b0\u751f\u6210TTS\u201d\u65f6\u4f1a\u4f7f\u7528\u8fd9\u91cc\u7684\u6587\u5b57\u751f\u6210\u65b0\u7684\u7f13\u5b58\u97f3\u9891\uff1b\u4e0a\u4f20\u5f55\u97f3\u65f6\u4e5f\u4f1a\u540c\u6b65\u7ed1\u5b9a\u8fd9\u6bb5\u6587\u5b57\u3002</div>' +
      (state.assetMessage && state.assetAction !== "upload-image"
        ? '<div class="pad-banner ' + assetToneClass + '" style="margin-top:12px;">' + escapeHtml(state.assetMessage) + "</div>"
        : "") +
      "</section>" +
      '<section class="pad-detail__section">' +
      '<div class="pad-detail__section-title">' + escapeHtml(TEXT.introTitle) + "</div>" +
      '<div class="pad-detail__intro">' +
      escapeHtml(product.intro_text || "?????????????") +
      "</div>" +
      "</section>" +
      '<section class="pad-detail__section">' +
      '<div class="pad-detail__section-title">' + escapeHtml(TEXT.infoTitle) + "</div>" +
      '<div class="pad-detail__grid">' +
      renderField(TEXT.registrationName, product.registration_name || TEXT.emptyField) +
      renderField(TEXT.registrationNumber, product.registration_number || TEXT.emptyField) +
      renderField(TEXT.effectiveDate, product.effective_date || TEXT.emptyField) +
      renderField(TEXT.company, product.company || TEXT.emptyField) +
      "</div>" +
      "</section>" +
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
        ? renderSceneStage(stationVisual, { editor: false, showLabels: false, stretchToFit: true })
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

  function formatTimelineEventsForEditor(events) {
    try {
      return JSON.stringify(
        (Array.isArray(events) ? events : []).map((event, index) => ({
          sort_order: Number(event && event.sortOrder != null ? event.sortOrder : index),
          time_ms: Number(event && event.timeMs ? event.timeMs : 0),
          product_id: String(event && event.productId ? event.productId : "").trim(),
          station_hotspot_id: String(event && event.hotspotId ? event.hotspotId : "").trim(),
          event_type: String(event && event.eventType ? event.eventType : "focus_switch").trim() || "focus_switch",
        })),
        null,
        2
      );
    } catch (_) {
      return "[]";
    }
  }

  function renderStationFusionConfigPanelV3() {
    const slot = getActiveStationSlot();
    const stationVisual = getSelectedScene();
    const draft = getSceneEditorDraftForScene(stationVisual);
    const metaEntry = getRecordingMetaEntry(slot.recordingId);
    const stops = getRecordingStops(slot.recordingId);
    const selectedStopIndex = normalizeStationStopIndex(slot.stopIndex);
    const timelineEditorValue = formatTimelineEventsForEditor(slot.timelineEvents);
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
      '<label class="pad-station-config-panel__field"><span>站点讲解时间轴(JSON)</span><textarea class="pad-detail__textarea pad-detail__textarea--compact" data-action="station-timeline-events">' +
      escapeHtml(timelineEditorValue) +
      "</textarea></label>" +
      '<div class="pad-scene-editor__scene-actions">' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="save-station-config">保存站点配置</button>' +
      '<button type="button" class="pad-btn pad-btn--neutral" data-action="select-station-background">上传背景图</button>' +
      '<input class="pad-hidden-file-input" data-action="station-background-input" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp" />' +
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
      '<section class="pad-panel pad-ops-entry-panel">' +
      '<div class="pad-panel__header pad-layout-panel__header">' +
      "<div>" +
      '<div class="pad-panel__title">产品热区</div>' +
      '<div class="pad-panel__hint">默认只编辑已有热区，点按钮后才进入新建状态。</div>' +
      "</div>" +
      '<div class="pad-layout-panel__options" role="group" aria-label="产品热区创建">' +
      '<button type="button" class="pad-layout-panel__btn' +
      (state.sceneEditorCreateMode ? " is-active" : "") +
      '" data-action="enter-station-hotspot-create" aria-pressed="' +
      (state.sceneEditorCreateMode ? "true" : "false") +
      '">' +
      escapeHtml(state.sceneEditorCreateMode ? "正在新建热区" : "新建产品热区") +
      "</button>" +
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
        ? renderSceneStage(stationVisual, { editor: false, showLabels: mode === "station", stretchToFit: true })
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
      '<main class="pad-shell pad-shell--demo">' +
      '<section class="pad-demo-workspace pad-demo-workspace--full">' +
      '<section class="pad-demo-main pad-demo-main--full">' +
      '<section class="pad-demo-panel pad-demo-panel--scene">' +
      (getSelectedScene()
        ? renderSceneStage(getSelectedScene(), { editor: false, showLabels: false, stretchToFit: true })
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
        ? renderOpsShellV3(hallName, productCount, snapshotBadge)
        : renderDemoShellV4(hallName, productCount, snapshotBadge);

    document.body.classList.toggle("pad-body--demo", state.mode === "demo");
    document.body.classList.toggle("pad-body--ops", state.mode === "ops");
    updateAudioDock();
    bindDomEvents();
    publishE2eState();
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

    const syncButton = refs.app.querySelector('[data-action="sync-offline"]');
    const reloadButton = refs.app.querySelector('[data-action="reload-live"]');
    const playButton = refs.app.querySelector('[data-action="play-selected"]');
    const stationPlayButton = refs.app.querySelector('[data-action="play-station-slot"]');
    const regenerateButton = refs.app.querySelector('[data-action="regenerate-audio"]');
    const uploadButton = refs.app.querySelector('[data-action="select-upload-audio"]');
    const uploadInput = refs.app.querySelector('[data-action="upload-audio-input"]');
    const uploadImageButton = refs.app.querySelector('[data-action="select-upload-image"]');
    const uploadImageInput = refs.app.querySelector('[data-action="upload-image-input"]');
    const audioTextEditor = refs.app.querySelector('[data-action="audio-text-draft"]');
    const refreshRecordingsButton = refs.app.querySelector('[data-action="refresh-recordings"]');
    const saveStationConfigButton = refs.app.querySelector('[data-action="save-station-config"]');
    const stationTimelineEventsInput = refs.app.querySelector('[data-action="station-timeline-events"]');
    const stationBackgroundButton = refs.app.querySelector('[data-action="select-station-background"]');
    const stationBackgroundInput = refs.app.querySelector('[data-action="station-background-input"]');
    const stationWireframeButton = refs.app.querySelector('[data-action="select-station-wireframe"]');
    const stationWireframeInput = refs.app.querySelector('[data-action="station-wireframe-input"]');
    const saveStationHotspotButton = refs.app.querySelector('[data-action="save-station-hotspot"]');
    const clearStationHotspotDraftButton = refs.app.querySelector('[data-action="clear-station-hotspot-draft"]');
    const deleteStationHotspotButton = refs.app.querySelector('[data-action="delete-station-hotspot"]');
    const stationHotspotProductSelect = refs.app.querySelector('[data-action="station-hotspot-product"]');
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

    if (syncButton) {
      syncButton.addEventListener("click", () => {
        resetAudioPlayback();
        void syncOfflineResources({
          hall: state.hall,
          products: state.products,
          scenes: state.scenes,
        });
      });
    }

    if (reloadButton) {
      reloadButton.addEventListener("click", () => {
        resetAudioPlayback();
        void loadCurrentHall({ forceOnline: true });
      });
    }

    if (playButton) {
      playButton.addEventListener("click", () => {
        void toggleProductPlayback();
      });
    }

    if (stationPlayButton) {
      stationPlayButton.addEventListener("click", () => {
        void toggleStationPlayback(stationPlayButton.getAttribute("data-slot-key"));
      });
    }

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

    if (refreshRecordingsButton) {
      refreshRecordingsButton.addEventListener("click", () => {
        void refreshRecordingOptions();
        preloadStationSlotRecordingMeta();
      });
    }

    if (saveStationConfigButton) {
      saveStationConfigButton.addEventListener("click", () => {
        let timelineEvents = null;
        if (stationTimelineEventsInput) {
          try {
            const parsed = JSON.parse(String(stationTimelineEventsInput.value || "[]"));
            timelineEvents = normalizeTimelineEvents(parsed);
          } catch (_) {
            setAssetState("Timeline events JSON is invalid.", "danger", false, "station-config");
            render();
            return;
          }
        }
        void saveSelectedStationConfig({ timelineEvents });
      });
    }

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

    if (stationHotspotProductSelect) {
      stationHotspotProductSelect.addEventListener("change", () => {
        const scene = getSelectedScene();
        const draft = getSceneEditorDraftForScene(scene);
        const nextProductId = String(stationHotspotProductSelect.value || "").trim();
        const nextDraft = updateSceneEditorDraft({ product_id: nextProductId });
        if (draft && !draft.hotspot_id && nextProductId && nextDraft) {
          void saveSceneEditorHotspot();
        }
      });
    }

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
        return {
          segmentId: Number(item.segment_id || 0),
          text: String(item.text || "").trim(),
          audioUrl: buildAbsoluteUrl(audioUrl),
          updatedAtMs: Number(item.updated_at_ms || 0),
        };
      })
      .filter(Boolean);
  }

  function setStationPlaybackFailure(message) {
    stopStationTimelineSync();
    const nextMessage = String(message || '?????????????????????????');
    state.audioError = nextMessage;
    state.stationPlaybackError = nextMessage;
    state.audioBusy = false;
    state.stationPlaybackBusy = false;
    state.playingStationSlotKey = '';
    state.pendingStationSlotKey = '';
    state.stationPlaybackSlotKey = '';
    state.stationPlaybackStopName = '';
    state.stationPlaybackQueue = [];
    state.stationPlaybackSegmentIndex = -1;
    state.stationPlaybackAnswerText = '';
    state.stationPlaybackTimelineEvents = [];
    state.highlightedHotspotId = '';
    state.highlightedProductId = '';
    state.lastPlaybackRequestedUrl = '';
  }

  function stopStationTimelineSync() {
    if (stationTimelineTimer) {
      window.clearInterval(stationTimelineTimer);
      stationTimelineTimer = null;
    }
    stationTimelineStartedAtMs = 0;
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

  function startStationTimelineSync() {
    stopStationTimelineSync();
    stationTimelineStartedAtMs = Date.now();
    applyStationTimelineHighlight(0);
    if (!Array.isArray(state.stationPlaybackTimelineEvents) || !state.stationPlaybackTimelineEvents.length) {
      render();
      return;
    }
    stationTimelineTimer = window.setInterval(() => {
      const elapsedMs = Math.max(0, Date.now() - stationTimelineStartedAtMs);
      applyStationTimelineHighlight(elapsedMs);
      render();
    }, 120);
  }

  async function startStationSegment(slotKey, segmentIndex, playbackSeq) {
    if (playbackSeq !== latestStationPlaybackSeq) return;
    const queue = Array.isArray(state.stationPlaybackQueue) ? state.stationPlaybackQueue : [];
    const segment = queue[segmentIndex] || null;
    if (!segment || !segment.audioUrl) {
      setStationPlaybackFailure("Current station archive audio is unavailable.");
      setStationPlaybackFailure("Current station archive audio is unavailable.");
      return;
    }
    state.audioBusy = true;
    state.audioError = "";
    state.stationPlaybackBusy = true;
    state.stationPlaybackError = "";
    state.pendingStationSlotKey = String(slotKey || "");
    state.playingStationSlotKey = "";
    state.stationPlaybackSlotKey = String(slotKey || "");
    state.stationPlaybackSegmentIndex = Number(segmentIndex);
    state.lastPlaybackRequestedUrl = segment.audioUrl;
    render();
    try {
      refs.audio.src = segment.audioUrl;
      if (Number(segmentIndex) === 0) {
        startStationTimelineSync();
      }
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

  async function playStationSlot(slotKey) {
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
      const queue = normalizeStationSegments(payload);
      if (!queue.length) {
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        return;
      }
      state.stationPlaybackQueue = queue;
      state.stationPlaybackSegmentIndex = 0;
      state.stationPlaybackAnswerText = String(payload && payload.answer_text ? payload.answer_text : '').trim();
      state.stationPlaybackStopName = String(payload && payload.stop_name ? payload.stop_name : resolvedStopName).trim();
      await startStationSegment(slot.slotKey, 0, playbackSeq);
    } catch (error) {
      if (playbackSeq != latestStationPlaybackSeq) return;
      const code = String(error && error.code ? error.code : '').trim();
      if (code === 'not_found') {
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        setStationPlaybackFailure("Current station archive audio is unavailable.");
        setStationPlaybackFailure(describeRequestError(error));
      }
      render();
    }
  }

  async function toggleStationPlayback(slotKey) {
    const slot = getStationSlotByKey(slotKey);
    const samePlayingStation =
      slot &&
      (String(state.stationPlaybackSlotKey || "") === String(slot.slotKey || "") ||
        String(state.pendingStationSlotKey || "") === String(slot.slotKey || ""));
    if (samePlayingStation) {
      interruptCurrentPlayback({
        preserveError: false,
        preserveStationError: false,
        preserveRequestUrl: false,
        resetSource: true,
      });
      render();
      return;
    }
    await playStationSlot(slotKey);
  }

  async function finalizeAudioMutation(productId, successMessage, syncFailedMessage) {
    state.selectedProductId = String(productId || "").trim();
    await loadCurrentHall({ forceOnline: true });
    state.selectedProductId = String(productId || "").trim();
    if (state.hall) {
      await syncOfflineResources({
        hall: state.hall,
        products: state.products,
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
        scenes: state.scenes,
      });
    }
    const syncSucceeded = state.syncTone !== "danger";
    setAssetState(successMessage, syncSucceeded ? "ready" : "warning", false, action);
    render();
  }

  async function saveSelectedStationConfig(options) {
    const selectedScene = getSelectedScene();
    const selectedSlot = getActiveStationSlot();
    if (!selectedScene || !selectedSlot || state.assetBusy) return;
    const opts = options && typeof options === "object" ? options : {};
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
      if (Array.isArray(opts.timelineEvents)) {
        await fetchJson(
          "/api/pad/halls/current/stations/" + encodeURIComponent(selectedSlot.slotKey) + "/timeline",
          state.clientId,
          {
            method: "PUT",
            json: {
              timeline_events: opts.timelineEvents.map((event, index) => ({
                sort_order: Number(event.sortOrder != null ? event.sortOrder : index),
                time_ms: Number(event.timeMs || 0),
                product_id: String(event.productId || "").trim(),
                station_hotspot_id: String(event.hotspotId || "").trim(),
                event_type: String(event.eventType || "focus_switch").trim() || "focus_switch",
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
    return {
      scene_id: String(scene.scene_id || ""),
      station_key: String(scene.station_key || scene.scene_id || ""),
      hotspot_id: String(hotspot.hotspot_id || "").trim(),
      product_id: String(hotspot.product_id || "").trim(),
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
    render();
  }

  async function saveSceneEditorHotspot() {
    const scene = getSelectedScene();
    const draft = getSceneEditorDraftForScene(scene);
    if (!scene || !draft || state.assetBusy) return;
    if (!String(draft.product_id || "").trim()) {
      setAssetState("Please choose a product for this hotspot first.", "danger", false, "station-hotspot");
      render();
      return;
    }
    const payload = {
      product_id: String(draft.product_id || "").trim(),
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
    const rawStations = Array.isArray(options && options.stations) ? options.stations : state.scenes;
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
      const mergedStations = normalizeStations(manifestPayload.stations, state.clientId);
      await cacheAudioAssets(mergedProducts);
      await cacheImageAssets(mergedProducts);
      await cacheStationVisualAssets(mergedStations);

      if (syncSeq !== latestSyncSeq) return;

      const snapshot = {
        clientId: state.clientId,
        display: state.display,
        hall: manifestPayload.hall || hall,
        version: Number(manifestPayload.version || 0),
        products: mergedProducts,
        stations: mergedStations.length ? mergedStations : normalizeStations(rawStations, state.clientId),
        stationCatalog: Array.isArray(state.stationCatalog) ? state.stationCatalog : [],
        syncedAtMs: Date.now(),
        offlineReady: true,
      };
      await writeSnapshot(snapshot);

      if (syncSeq !== latestSyncSeq) return;

      state.products = mergedProducts;
      state.display = manifestPayload && manifestPayload.display ? manifestPayload.display : state.display;
      state.scenes = Array.isArray(snapshot.stations) ? snapshot.stations : [];
      state.demoStationSlots = normalizeStationsToSlots(manifestPayload.stations);
      state.stationCatalog = Array.isArray(snapshot.stationCatalog) ? snapshot.stationCatalog : [];
      preloadStationSlotRecordingMeta();
      state.hall = snapshot.hall;
      state.offlineReady = true;
      state.lastSyncedAtMs = snapshot.syncedAtMs;
      state.usingOfflineSnapshot = false;
      setSyncState(buildSyncReadyMessage(mergedProducts), "ready", false);
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
        state.scenes = normalizeStations(displayPayload && displayPayload.stations, state.clientId);
        state.demoStationSlots = normalizeStationsToSlots(displayPayload && displayPayload.stations);
        preloadStationSlotRecordingMeta();
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
      state.loading = false;
      state.errorMessage = "";
      state.errorDetail = "";
      render();
    } catch (_) {
      if (loadSeq !== latestLoadSeq) return;
      state.loading = false;
      state.products = [];
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
    state.scenes = [];
    state.stationCatalog = [];
    state.selectedProductId = "";
    state.selectedSceneId = "";
    state.sceneDialogHotspotId = "";
    state.sceneEditorActiveHotspotId = "";
    state.sceneEditorDraft = null;
    state.audioTextDrafts = Object.create(null);
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
        state.playingStationSlotKey = String(state.stationPlaybackSlotKey || "");
        state.pendingStationSlotKey = "";
        state.playingProductId = "";
        state.pendingPlaybackProductId = "";
      } else {
        state.playingProductId = String(state.pendingPlaybackProductId || state.selectedProductId || "");
        state.pendingPlaybackProductId = "";
      }
      render();
    });
    refs.audio.addEventListener("ended", () => {
      if (String(state.stationPlaybackSlotKey || "").trim()) {
        const queue = Array.isArray(state.stationPlaybackQueue) ? state.stationPlaybackQueue : [];
        const nextIndex = Number(state.stationPlaybackSegmentIndex) + 1;
        if (nextIndex >= 0 && nextIndex < queue.length) {
          state.playingStationSlotKey = "";
          state.pendingStationSlotKey = String(state.stationPlaybackSlotKey || "");
          state.audioBusy = true;
          state.stationPlaybackBusy = true;
          render();
          void startStationSegment(state.stationPlaybackSlotKey, nextIndex, latestStationPlaybackSeq);
          return;
        }
        state.audioBusy = false;
        state.stationPlaybackBusy = false;
        state.playingStationSlotKey = "";
        state.pendingStationSlotKey = "";
        state.stationPlaybackSlotKey = "";
        state.stationPlaybackStopName = "";
        state.stationPlaybackQueue = [];
        state.stationPlaybackSegmentIndex = -1;
        state.stationPlaybackAnswerText = "";
        state.stationPlaybackTimelineEvents = [];
        state.highlightedHotspotId = "";
        state.highlightedProductId = "";
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
        if (!state.pendingStationSlotKey && !refs.audio.ended) {
          state.playingStationSlotKey = "";
          state.stationPlaybackBusy = false;
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
          productCount: Array.isArray(state.products) ? state.products.length : 0,
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
          playingProductId: String(state.playingProductId || ""),
          pendingPlaybackProductId: String(state.pendingPlaybackProductId || ""),
          demoLeftTabKey: normalizeDemoLeftTabKey(state.demoLeftTabKey),
          demoRightTabKey: normalizeDemoRightTabKey(state.demoRightTabKey),
          stationSlots: (Array.isArray(state.demoStationSlots) ? state.demoStationSlots : []).map((slot, index) =>
            normalizeStationSlot(slot, index)
          ),
          playingStationSlotKey: String(state.playingStationSlotKey || ""),
          pendingStationSlotKey: String(state.pendingStationSlotKey || ""),
          stationPlaybackError: String(state.stationPlaybackError || ""),
          highlightedHotspotId: String(state.highlightedHotspotId || ""),
          highlightedProductId: String(state.highlightedProductId || ""),
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
      await navigator.serviceWorker.register("/sw.js");
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
    if (!sceneEditorInteraction) return;
    updateSceneEditorInteraction(event);
  });

  window.addEventListener("pointerup", () => {
    void endSceneEditorInteraction();
  });

  window.addEventListener("pointercancel", () => {
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

  void bootstrapApp();
})();
