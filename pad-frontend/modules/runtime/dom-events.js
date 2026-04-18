// DOM rendering entrypoint and event binding layer.
function render() {
  ensureSelectedProduct();
  ensureSelectedScene();
  const shell = appSelectors.getShellViewModel();
  const snapshotBadge =
    '<span class="pad-chip pad-chip--' +
    escapeHtml(shell.snapshotTone) +
    '">' +
    escapeHtml(shell.snapshotText) +
    "</span>";

  refs.app.innerHTML =
    state.mode === "ops"
      ? renderOpsShellV4(shell.hallName, shell.productCount, snapshotBadge)
      : renderDemoShellV4(shell.hallName, shell.productCount, snapshotBadge);

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
      appActions.setMode(button.getAttribute("data-mode"));
    });
  });

  refs.app.querySelectorAll('[data-action="toggle-ops-section"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.toggleOpsSection(button.getAttribute("data-section"));
    });
  });

  refs.app.querySelectorAll('[data-action="set-demo-columns"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setDemoColumns(button.getAttribute("data-columns"));
    });
  });

  refs.app.querySelectorAll('[data-action="set-demo-left-tab"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setDemoLeftTab(button.getAttribute("data-tab-key"));
    });
  });

  refs.app.querySelectorAll('[data-action="set-demo-right-tab"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setDemoRightTab(button.getAttribute("data-tab-key"));
    });
  });

  refs.app.querySelectorAll('[data-action="set-ops-station-tab"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setOpsStationTab(button.getAttribute("data-tab"));
    });
  });

  refs.app.querySelectorAll('[data-action="set-ops-annotate-sidebar-tab"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setOpsAnnotateSidebarTab(button.getAttribute("data-tab"));
    });
  });

  refs.app.querySelectorAll('[data-action="toggle-demo-station"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.toggleActiveStationSlot();
    });
  });

  refs.app.querySelectorAll('[data-action="request-exit"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.requestExit();
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
      void appActions.syncOfflineResources({
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
      void appActions.loadCurrentHall({ forceOnline: true });
    });
  });

  if (playButton) {
    playButton.addEventListener("click", () => {
      void appActions.toggleProductPlayback();
    });
  }

  stationPlayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void appActions.toggleStationPlayback(button.getAttribute("data-slot-key"));
    });
  });

  stationTimelinePlayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void appActions.playStationSlot(button.getAttribute("data-slot-key"), { startAtMs: 0 });
    });
  });

  stationTimelinePauseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      appActions.pauseStationPlayback();
    });
  });

  stationTimelineResumeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void appActions.resumeStationPlayback(button.getAttribute("data-slot-key"));
    });
  });

  if (regenerateButton) {
    regenerateButton.addEventListener("click", () => {
      void appActions.regenerateSelectedProductAudio();
    });
  }

  if (uploadButton && uploadInput) {
    uploadButton.addEventListener("click", () => {
      uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null;
      if (!file) return;
      void appActions.uploadSelectedProductAudio(file).finally(() => {
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
      void appActions.uploadSelectedProductImages(files).finally(() => {
        uploadImageInput.value = "";
      });
    });
  }

  if (saveProductInfoButton) {
    saveProductInfoButton.addEventListener("click", () => {
      void appActions.saveSelectedProductInfo();
    });
  }

  refs.app.querySelectorAll('[data-action="switch-hall"]').forEach((button) => {
      button.addEventListener("click", () => {
        const nextClientId = String(button.getAttribute("data-client-id") || "").trim();
        if (!nextClientId) return;
        void appActions.switchHall(nextClientId);
      });
    });

  refs.app.querySelectorAll('[data-action="station-slot-label"]').forEach((input) => {
    input.addEventListener("change", () => {
      const slotKey = String(input.getAttribute("data-slot-key") || "").trim();
      appActions.updateStationSlot(slotKey, () => ({ label: String(input.value || "").trim() }));
    });
  });

  refs.app.querySelectorAll('[data-action="station-slot-id"]').forEach((select) => {
    select.addEventListener("change", () => {
      const slotKey = String(select.getAttribute("data-slot-key") || "").trim();
      appActions.updateStationSlot(slotKey, () => ({
        stationId: String(select.value || "").trim(),
      }));
    });
  });

  refs.app.querySelectorAll('[data-action="station-slot-recording"]').forEach((select) => {
    select.addEventListener("change", () => {
      const slotKey = String(select.getAttribute("data-slot-key") || "").trim();
      const recordingId = String(select.value || "").trim();
      appActions.updateStationSlot(slotKey, () => ({
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
      appActions.updateStationSlot(slotKey, () => ({
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
      void appActions.exportCurrentStationHotspots();
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
        void appActions.importCurrentStationHotspots(file).finally(() => {
          importStationHotspotsInput.value = "";
        });
      });
  }

  if (stationTimelineAddButton) {
    stationTimelineAddButton.addEventListener("click", () => {
      appActions.addStationTimelineEvent(stationTimelineAddButton.getAttribute("data-slot-key"));
    });
  }

  refs.app.querySelectorAll('[data-action="station-timeline-remove"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.removeStationTimelineEvent(
        button.getAttribute("data-slot-key"),
        button.getAttribute("data-index")
      );
    });
  });

  refs.app.querySelectorAll('[data-action="station-timeline-move-up"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.moveStationTimelineEvent(
        button.getAttribute("data-slot-key"),
        button.getAttribute("data-index"),
        -1
      );
    });
  });

  refs.app.querySelectorAll('[data-action="station-timeline-move-down"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.moveStationTimelineEvent(
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
      appActions.updateStationTimelineEvents(slotKey, (events) => {
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
      appActions.updateStationTimelineEvents(slotKey, (events) => {
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
      appActions.useCurrentPlaybackTimeForTimelineEvent(
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
      appActions.seekStationPlaybackToMs(button.getAttribute("data-time-ms"));
    });
  });

  refs.app.querySelectorAll('[data-action="station-timeline-delete-highlight"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.deleteStationTimelineSelection(button.getAttribute("data-slot-key"));
    });
  });

  refs.app.querySelectorAll('[data-action="add-narration-node"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.addStationNarrationNode(button.getAttribute("data-slot-key"));
    });
  });

  refs.app.querySelectorAll('[data-action="select-narration-node"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.setActiveNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"));
      render();
    });
  });

  refs.app.querySelectorAll('[data-action="move-narration-node-up"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.moveStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), -1);
    });
  });

  refs.app.querySelectorAll('[data-action="move-narration-node-down"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.moveStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), 1);
    });
  });

  refs.app.querySelectorAll('[data-action="remove-narration-node"]').forEach((button) => {
    button.addEventListener("click", () => {
      appActions.removeStationNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"));
    });
  });

  refs.app.querySelectorAll('[data-action="narration-node-recording"]').forEach((select) => {
    select.addEventListener("change", () => {
      const slotKey = select.getAttribute("data-slot-key");
      const nodeId = select.getAttribute("data-node-id");
      const recordingId = String(select.value || "").trim();
      appActions.updateStationNarrationNode(slotKey, nodeId, {
        recordingId,
        stopIndex: null,
        stopName: "",
      });
      if (recordingId) {
        void ensureRecordingMeta(recordingId, { force: true });
      }
      appActions.setActiveNarrationNode(slotKey, nodeId);
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
      appActions.updateStationNarrationNode(slotKey, nodeId, {
        stopIndex,
        stopName: stopIndex != null && stopIndex >= 0 && stopIndex < stops.length ? String(stops[stopIndex] || "").trim() : "",
      });
      appActions.setActiveNarrationNode(slotKey, nodeId);
      render();
    });
  });

  refs.app.querySelectorAll('[data-action="play-narration-node"]').forEach((button) => {
    button.addEventListener("click", () => {
      void appActions.playNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), { rangeOnly: false });
    });
  });

  refs.app.querySelectorAll('[data-action="play-narration-node-highlight"]').forEach((button) => {
    button.addEventListener("click", () => {
      void appActions.playNarrationNode(button.getAttribute("data-slot-key"), button.getAttribute("data-node-id"), { rangeOnly: true });
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
      appActions.toggleNarrationNodeHotspotBinding(slotKey, activeNode.nodeId, button.getAttribute("data-hotspot-id"));
    });
  });

  saveStationConfigButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const activeSlot = getActiveStationSlot();
        const narrationNodes = getStationNarrationNodes(activeSlot);
        appActions.updateStationSlot(activeSlot.slotKey, () => ({ narrationNodes }));
        void appActions.saveSelectedStationConfig({ narrationNodes });
      });
    });

  if (stationBackgroundButton && stationBackgroundInput) {
    stationBackgroundButton.addEventListener("click", () => {
        stationBackgroundInput.click();
      });
      stationBackgroundInput.addEventListener("change", () => {
        const file = stationBackgroundInput.files && stationBackgroundInput.files[0] ? stationBackgroundInput.files[0] : null;
        if (!file) return;
        void appActions.uploadSelectedStationAsset(file, "background").finally(() => {
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
        void appActions.uploadSelectedStationAsset(file, "wireframe").finally(() => {
          stationWireframeInput.value = "";
        });
      });
  }

  if (stationHotspotProductSearchInput) {
    stationHotspotProductSearchInput.addEventListener("compositionstart", () => {
      appContext.runtime.hotspotSearchComposing = true;
    });
    stationHotspotProductSearchInput.addEventListener("compositionend", () => {
      appContext.runtime.hotspotSearchComposing = false;
      const nextText = String(stationHotspotProductSearchInput.value || "");
      const restoreSnapshot = captureHotspotSearchInputState(stationHotspotProductSearchInput);
      const scene = getSelectedScene();
      const draft = getSceneEditorDraftForScene(scene);
      const currentProduct = draft ? findProductById(draft.product_id) : null;
      const currentName = currentProduct ? String(currentProduct.product_name || "").trim() : "";
      appActions.updateSceneEditorDraft({
        product_id: currentName && String(nextText || "").trim() === currentName ? String(draft.product_id || "").trim() : "",
        product_search_text: nextText,
      }, { render: false });
      void appActions.searchStationHotspotProducts(nextText, { restoreSnapshot });
    });
    stationHotspotProductSearchInput.addEventListener("input", () => {
      if (appContext.runtime.hotspotSearchComposing) {
        return;
      }
      const scene = getSelectedScene();
      const draft = getSceneEditorDraftForScene(scene);
      const nextText = String(stationHotspotProductSearchInput.value || "");
      const restoreSnapshot = captureHotspotSearchInputState(stationHotspotProductSearchInput);
      const currentProduct = draft ? findProductById(draft.product_id) : null;
      const currentName = currentProduct ? String(currentProduct.product_name || "").trim() : "";
      appActions.updateSceneEditorDraft({
        product_id: currentName && String(nextText || "").trim() === currentName ? String(draft.product_id || "").trim() : "",
        product_search_text: nextText,
      }, { render: false });
      void appActions.searchStationHotspotProducts(nextText, { restoreSnapshot });
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
        appActions.upsertReferencedProduct({
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
        const nextDraft = appActions.updateSceneEditorDraft({
          product_id: nextProductId,
          product_search_text: matched ? String(matched.product_name || "").trim() : nextProductId,
        });
        appActions.clearHotspotProductSearch();
        if (draft && !draft.hotspot_id && nextDraft) {
          void appActions.saveSceneEditorHotspot();
        } else {
          render();
        }
    });
  });

  if (stationHotspotSortOrderInput) {
    stationHotspotSortOrderInput.addEventListener("change", () => {
      appActions.updateSceneEditorDraft({ sort_order: Number(stationHotspotSortOrderInput.value || 0) });
    });
  }

  if (saveStationHotspotButton) {
    saveStationHotspotButton.addEventListener("click", () => {
      void appActions.saveSceneEditorHotspot();
    });
  }

  const enterStationHotspotCreateButton = refs.app.querySelector('[data-action="enter-station-hotspot-create"]');
  if (enterStationHotspotCreateButton) {
    enterStationHotspotCreateButton.addEventListener("click", () => {
      appActions.enterStationHotspotCreateMode();
    });
  }

  if (clearStationHotspotDraftButton) {
    clearStationHotspotDraftButton.addEventListener("click", () => {
      state.sceneEditorDraft = null;
      state.sceneEditorActiveHotspotId = "";
      state.sceneEditorCreateMode = false;
      appActions.clearHotspotProductSearch();
      render();
    });
  }

  if (deleteStationHotspotButton) {
    deleteStationHotspotButton.addEventListener("click", () => {
      void appActions.deleteSceneEditorHotspot();
    });
  }

  if (createSceneButton && createSceneInput) {
    createSceneButton.addEventListener("click", () => {
      createSceneInput.click();
    });
    createSceneInput.addEventListener("change", () => {
        const file = createSceneInput.files && createSceneInput.files[0] ? createSceneInput.files[0] : null;
        if (!file) return;
        void appActions.createSceneFromUpload(
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
      void appActions.saveSelectedSceneMeta(sceneNameInput ? sceneNameInput.value : "", sceneSortInput ? sceneSortInput.value : "");
    });
  }

  if (sceneBackgroundButton && sceneBackgroundInput) {
    sceneBackgroundButton.addEventListener("click", () => {
      sceneBackgroundInput.click();
    });
      sceneBackgroundInput.addEventListener("change", () => {
        const file = sceneBackgroundInput.files && sceneBackgroundInput.files[0] ? sceneBackgroundInput.files[0] : null;
        if (!file) return;
        void appActions.replaceSelectedSceneBackground(file).finally(() => {
          sceneBackgroundInput.value = "";
        });
      });
  }

  if (deleteSceneButton) {
    deleteSceneButton.addEventListener("click", () => {
      void appActions.deleteSelectedScene();
    });
  }

  if (sceneDraftTitleInput) {
    sceneDraftTitleInput.addEventListener("input", () => {
      appActions.updateSceneEditorDraft({ title: String(sceneDraftTitleInput.value || "") });
    });
  }

  if (sceneDraftContentInput) {
    sceneDraftContentInput.addEventListener("input", () => {
      appActions.updateSceneEditorDraft({ content_text: String(sceneDraftContentInput.value || "") });
    });
  }

  if (sceneDraftSortInput) {
    sceneDraftSortInput.addEventListener("change", () => {
      appActions.updateSceneEditorDraft({ sort_order: Number(sceneDraftSortInput.value || 0) });
    });
  }

  if (saveSceneHotspotButton) {
    saveSceneHotspotButton.addEventListener("click", () => {
      void appActions.saveSceneEditorHotspot();
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
      void appActions.deleteSceneEditorHotspot();
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
        appActions.selectSceneHotspotForEditing(node.getAttribute("data-hotspot-id"));
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
        void appActions.toggleProductPlayback(productId);
      });
    });

  refs.app.querySelectorAll('[data-action="play-product-hotspot"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const controlAction = String(button.getAttribute("data-control-action") || "").trim();
      if (controlAction) {
        if (controlAction === "toggle_station") {
          appActions.toggleActiveStationSlot();
          return;
        }
          if (controlAction === "toggle_station_narration") {
            void appActions.toggleStationPlayback(getActiveStationSlot().slotKey);
            return;
          }
          if (controlAction === "enter_ops") {
            appActions.setMode("ops");
            return;
          }
          if (controlAction === "exit_app") {
            appActions.requestExit();
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
        void appActions.toggleProductPlayback(productId, hotspotId);
      });
    });
}
