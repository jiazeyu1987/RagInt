// Shared selectors for render-layer view models.
function getShellViewModel() {
  return {
    hallName: state.hall && state.hall.hall_name ? state.hall.hall_name : TEXT.unboundHall,
    productCount: Array.isArray(state.products) ? state.products.length : 0,
    snapshotTone: state.usingOfflineSnapshot ? "ready" : "pending",
    snapshotText: state.usingOfflineSnapshot ? TEXT.offlineSnapshot : TEXT.liveData,
  };
}

function getHallPresetViewModels() {
  return HALL_PRESETS.map((preset, index) => ({
    clientId: String(preset.clientId || "").trim(),
    hallId: String(preset.hallId || "").trim(),
    hallName: String(preset.hallName || "").trim(),
    shortLabel: String(preset.shortLabel || "").trim(),
    orderLabel: String(index + 1).padStart(2, "0"),
    active: String(preset.clientId || "") === String(state.clientId || ""),
  }));
}

function getDemoAudienceViewModel() {
  const slot = getActiveStationSlot();
  const stationStatus = getStationSlotStatus(slot);
  const stationButtonActive = isStationSlotPlaying(slot) || isStationSlotPending(slot);
  return {
    slot,
    stationStatus,
    stationButtonActive,
    stationButtonDisabled: !stationButtonActive && !stationStatus.playable,
  };
}

function getSceneTabViewModels() {
  const scenes = Array.isArray(state.scenes) ? state.scenes : [];
  return scenes.map((scene) => ({
    sceneId: String(scene.scene_id || "").trim(),
    name: String(scene.name || "").trim(),
    active: String(scene.scene_id || "") === String(state.selectedSceneId || ""),
    backgroundUrl: scene.background && scene.background.image_url ? String(scene.background.image_url) : "",
  }));
}

function getDemoLayoutOptionViewModels() {
  return [1, 2, 3, 4].map((count) => ({
    count,
    active: Number(state.demoColumns || DEFAULT_DEMO_COLUMNS) === count,
  }));
}

function getOpsShellViewModel() {
  const shell = getShellViewModel();
  const audioReadyCount = (Array.isArray(state.products) ? state.products : []).filter((item) => !!(item && item.has_active_audio))
    .length;
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
  return Object.assign(shell, {
    audioReadyCount,
    opsStationTab,
    annotateTargetLabel,
    syncSummary,
  });
}

function getSceneDialogViewModel() {
  const scene = getSelectedScene();
  const hotspot = getSceneHotspotById(scene, state.sceneDialogHotspotId);
  if (!scene || !hotspot) return null;
  return {
    title: String(hotspot.title || "").trim() || "Hotspot Detail",
    content: String(hotspot.content_text || "").trim(),
  };
}

function getDemoScenePanelViewModel() {
  const scene = getSelectedScene();
  return {
    scene,
    loading: !!state.loading && !(Array.isArray(state.scenes) && state.scenes.length),
    empty: !scene,
    hotspotCount: scene && Array.isArray(scene.hotspots) ? scene.hotspots.length : 0,
    hasHotspots: !!(scene && Array.isArray(scene.hotspots) && scene.hotspots.length),
    sceneName: scene ? String(scene.name || "").trim() : "",
  };
}

function getFullscreenSceneViewModel() {
  const scene = getSelectedScene();
  return {
    scene,
    hasScene: !!scene,
  };
}

Object.assign(appSelectors, {
  getShellViewModel,
  getHallPresetViewModels,
  getDemoAudienceViewModel,
  getSceneTabViewModels,
  getDemoLayoutOptionViewModels,
  getOpsShellViewModel,
  getSceneDialogViewModel,
  getDemoScenePanelViewModel,
  getFullscreenSceneViewModel,
});
