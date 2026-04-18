// Demo rendering helpers and scene/detail presentation.
function getAlternateStationSlotKey(slotKey) {
  const key = normalizeDemoLeftTabKey(slotKey);
  return key === "display_slot_1" ? "display_slot_2" : "display_slot_1";
}

function renderDemoAudienceControls() {
  const audience = appSelectors.getDemoAudienceViewModel();
  const slot = audience.slot;
  const stationButtonActive = audience.stationButtonActive;
  const stationButtonDisabled = audience.stationButtonDisabled ? " disabled" : "";
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

function renderDemoSceneTabs() {
  const scenes = appSelectors.getSceneTabViewModels();
  if (!scenes.length) {
    return '<div class="pad-demo-scene-tabs-empty">No scenes</div>';
  }
  return (
    '<div class="pad-demo-scene-tabs" role="tablist" aria-label="Scene switcher">' +
    scenes
      .map((scene) => {
        const thumbStyle =
          scene.backgroundUrl
            ? ' style="background-image:url(&quot;' + escapeHtml(scene.backgroundUrl) + '&quot;)"'
            : "";
        return (
          '<button type="button" class="pad-demo-scene-tab' +
          (scene.active ? " is-active" : "") +
          '" data-action="set-selected-scene" data-scene-id="' +
          escapeHtml(scene.sceneId) +
          '" role="tab" aria-selected="' +
          (scene.active ? "true" : "false") +
          '">' +
          '<span class="pad-demo-scene-tab__thumb"' +
          thumbStyle +
          "></span>" +
          '<span class="pad-demo-scene-tab__name">' +
          escapeHtml(scene.name) +
          "</span>" +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}

function renderSceneDialog() {
  const dialog = appSelectors.getSceneDialogViewModel();
  if (!dialog) return "";
  return (
    '<div class="pad-scene-dialog" data-action="close-scene-dialog">' +
    '<div class="pad-scene-dialog__card" data-scene-dialog-card="1">' +
    '<button type="button" class="pad-scene-dialog__close" data-action="close-scene-dialog">Close</button>' +
    '<div class="pad-scene-dialog__title">' +
    escapeHtml(dialog.title) +
    "</div>" +
    '<div class="pad-scene-dialog__content">' +
    escapeHtml(dialog.content || "No content configured yet.") +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

function renderDemoScenePanel() {
  const panel = appSelectors.getDemoScenePanelViewModel();
  const scene = panel.scene;
  if (panel.loading) {
    return '<div class="pad-loading">' + escapeHtml(TEXT.loading) + "</div>";
  }
  if (panel.empty) {
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
    escapeHtml(String(panel.hotspotCount) + " hotspots") +
    "</div>" +
    "</div>" +
    '<div class="pad-scene-panel__title">' +
    escapeHtml(panel.sceneName) +
    "</div>" +
    renderSceneStage(scene, { editor: false }) +
    (panel.hasHotspots
      ? ""
      : '<div class="pad-detail__hint">This scene has no hotspots yet.</div>') +
    renderSceneDialog() +
    "</section>"
  );
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
  const layoutOptions = appSelectors.getDemoLayoutOptionViewModels();
  return (
    '<section class="pad-panel pad-layout-panel">' +
    '<div class="pad-panel__header pad-layout-panel__header">' +
    "<div>" +
    '<div class="pad-panel__title">\u6f14\u793a\u5e03\u5c40</div>' +
    '<div class="pad-panel__hint">\u8bbe\u7f6e\u6f14\u793a\u6a21\u5f0f\u6bcf\u884c\u663e\u793a\u7684\u4ea7\u54c1 item \u6570\u91cf\u3002</div>' +
    "</div>" +
    '<div class="pad-layout-panel__options" role="group" aria-label="\u6f14\u793a\u6bcf\u884c item \u6570\u91cf">' +
    layoutOptions
      .map((option) => {
        return (
          '<button type="button" class="pad-layout-panel__btn' +
          (option.active ? " is-active" : "") +
          '" data-action="set-demo-columns" data-columns="' +
          String(option.count) +
          '" data-testid="demo-columns-' +
          String(option.count) +
          '">' +
          escapeHtml(String(option.count) + " \u5217") +
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
      appContext.runtime.lastFlashRenderLogKey = "";
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
  const fullscreen = appSelectors.getFullscreenSceneViewModel();
  return (
    '<main class="pad-shell pad-shell--demo pad-shell--demo-fullscreen">' +
    '<section class="pad-demo-workspace pad-demo-workspace--full">' +
    '<section class="pad-demo-main pad-demo-main--full">' +
    '<section class="pad-demo-panel pad-demo-panel--scene">' +
    (fullscreen.hasScene
      ? renderSceneStage(fullscreen.scene, { editor: false, showLabels: false, stretchToFit: true, interactiveOnly: true })
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
