// Runtime bootstrap, browser integration, and E2E surface.
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
          appContext.runtime.latestStationPlaybackSeq,
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
      return appActions.switchHall(clientId);
    },
    setMode: function (mode) {
      return appActions.setMode(mode);
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
      return appActions.toggleStationPlayback(slotKey);
    },
    playProduct: function (productId) {
      return appActions.toggleProductPlayback(productId);
    },
    requestExit: function () {
      return appActions.requestExit();
    },
  };
}

Object.assign(appActions, {
  setMode,
  toggleOpsSection,
  setDemoColumns,
  setDemoLeftTab,
  setDemoRightTab,
  setOpsStationTab,
  setOpsAnnotateSidebarTab,
  toggleActiveStationSlot,
  switchHall,
  loadCurrentHall,
  syncOfflineResources,
  toggleProductPlayback,
  playSelectedProduct,
  toggleStationPlayback,
  playStationSlot,
  pauseStationPlayback,
  resumeStationPlayback,
  updateStationSlot,
  addStationTimelineEvent,
  removeStationTimelineEvent,
  moveStationTimelineEvent,
  updateStationTimelineEvents,
  useCurrentPlaybackTimeForTimelineEvent,
  seekStationPlaybackToMs,
  deleteStationTimelineSelection,
  addStationNarrationNode,
  setActiveNarrationNode,
  moveStationNarrationNode,
  removeStationNarrationNode,
  updateStationNarrationNode,
  playNarrationNode,
  toggleNarrationNodeHotspotBinding,
  requestExit,
  updateSceneEditorDraft,
  clearHotspotProductSearch,
  searchStationHotspotProducts,
  upsertReferencedProduct,
  saveSelectedProductInfo,
  regenerateSelectedProductAudio,
  uploadSelectedProductAudio,
  uploadSelectedProductImages,
  saveSelectedStationConfig,
  uploadSelectedStationAsset,
  exportCurrentStationHotspots,
  importCurrentStationHotspots,
  enterStationHotspotCreateMode,
  saveSceneEditorHotspot,
  deleteSceneEditorHotspot,
  createSceneFromUpload,
  saveSelectedSceneMeta,
  replaceSelectedSceneBackground,
  deleteSelectedScene,
  selectSceneHotspotForEditing,
});

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
  if (appContext.runtime.stationTimelineInteraction) {
    updateStationTimelineSelection(event.clientX);
  }
  if (appContext.runtime.narrationNodeInteraction) {
    updateNarrationNodeInteraction(event.clientX);
  }
  if (!appContext.runtime.sceneEditorInteraction) return;
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
    appActions.setMode("ops");
  }
});

window.addEventListener("online", () => {
  state.online = true;
  void appActions.loadCurrentHall();
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
