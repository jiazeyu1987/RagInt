// Ops/shared rendering helpers.
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
  const presets = appSelectors.getHallPresetViewModels();
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
    presets.map((preset) => {
      return (
        '<button type="button" class="pad-ops-hall-btn' +
        (preset.active ? " is-active" : "") +
        '" data-action="switch-hall" data-client-id="' +
        escapeHtml(preset.clientId) +
        '">' +
        '<span class="pad-ops-hall-btn__tag">' +
        escapeHtml(preset.orderLabel) +
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
  const presets = appSelectors.getHallPresetViewModels();
  return (
    '<div class="pad-ops-inline-switches" aria-label="' +
    escapeHtml(TEXT.quickSwitchTitle) +
    '">' +
    presets.map((preset) => {
      return (
        '<button type="button" class="pad-ops-inline-switch' +
        (preset.active ? " is-active" : "") +
        '" data-action="switch-hall" data-client-id="' +
        escapeHtml(preset.clientId) +
        '">' +
        '<span class="pad-ops-inline-switch__tag">' +
        escapeHtml(preset.orderLabel) +
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
  const shell = appSelectors.getOpsShellViewModel();
  const audioReadyCount = shell.audioReadyCount;
  const opsStationTab = shell.opsStationTab;
  const annotateTargetLabel = shell.annotateTargetLabel;
  const syncSummary = shell.syncSummary;
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
  const presets = appSelectors.getHallPresetViewModels();
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
    presets.map((preset) => {
      return (
        '<button type="button" class="pad-hall-switcher__btn' +
        (preset.active ? " is-active" : "") +
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
