// Domain helpers: products, scenes, hotspots, drafts, and mode transitions.
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
  appContext.runtime.latestHotspotSearchSeq += 1;
  state.hotspotSearchBusy = false;
  state.hotspotSearchQuery = "";
  state.hotspotSearchResults = [];
}

async function searchStationHotspotProducts(queryText, options) {
  const query = String(queryText || "").trim();
  const opts = options && typeof options === "object" ? options : {};
  const restoreSnapshot = opts.restoreSnapshot || null;
  appContext.runtime.latestHotspotSearchSeq += 1;
  const searchSeq = appContext.runtime.latestHotspotSearchSeq;
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
    if (searchSeq !== appContext.runtime.latestHotspotSearchSeq) return;
    state.hotspotSearchBusy = false;
    state.hotspotSearchResults = Array.isArray(payload && payload.items) ? payload.items : [];
    render();
    restoreHotspotSearchInputState(restoreSnapshot);
  } catch (_) {
    if (searchSeq !== appContext.runtime.latestHotspotSearchSeq) return;
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
  appContext.runtime.narrationNodeInteraction = {
    mode: "selection",
    slotKey: String(slotKey || "").trim(),
    nodeId: String(nodeId || "").trim(),
    anchorMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
    currentMs: getNarrationNodeTimeMsFromPointer(slotKey, nodeId, clientX),
  };
  setActiveNarrationNode(slotKey, nodeId);
  setNarrationNodeHighlightRange(slotKey, nodeId, appContext.runtime.narrationNodeInteraction.anchorMs, appContext.runtime.narrationNodeInteraction.currentMs);
  render();
}

function beginNarrationNodeHandleDrag(slotKey, nodeId, edge, clientX) {
  appContext.runtime.narrationNodeInteraction = {
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
  appContext.runtime.narrationNodeInteraction = {
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
  if (!appContext.runtime.narrationNodeInteraction) return;
  const nextMs = getNarrationNodeTimeMsFromPointer(
    appContext.runtime.narrationNodeInteraction.slotKey,
    appContext.runtime.narrationNodeInteraction.nodeId,
    clientX
  );
  appContext.runtime.narrationNodeInteraction.currentMs = nextMs;
  const node = findStationNarrationNode(appContext.runtime.narrationNodeInteraction.slotKey, appContext.runtime.narrationNodeInteraction.nodeId);
  if (!node) return;
  if (appContext.runtime.narrationNodeInteraction.mode === "highlight-start") {
    setNarrationNodeHighlightRange(
      appContext.runtime.narrationNodeInteraction.slotKey,
      appContext.runtime.narrationNodeInteraction.nodeId,
      nextMs,
      node.highlightEndMs
    );
  } else if (appContext.runtime.narrationNodeInteraction.mode === "highlight-end") {
    setNarrationNodeHighlightRange(
      appContext.runtime.narrationNodeInteraction.slotKey,
      appContext.runtime.narrationNodeInteraction.nodeId,
      node.highlightStartMs,
      nextMs
    );
  } else if (appContext.runtime.narrationNodeInteraction.mode === "playhead") {
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
      appContext.runtime.narrationNodeInteraction.slotKey,
      appContext.runtime.narrationNodeInteraction.nodeId,
      appContext.runtime.narrationNodeInteraction.anchorMs,
      nextMs
    );
  }
  render();
}

function endNarrationNodeInteraction() {
  if (!appContext.runtime.narrationNodeInteraction) return;
  appContext.runtime.narrationNodeInteraction = null;
  render();
}

function isStationSlotConfigured(slot) {
  const item = slot && typeof slot === "object" ? slot : {};
  return getStationNarrationNodes(item).some((node) => getNarrationNodeValidation(item.slotKey, node).valid);
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
  appContext.runtime.latestStationPlaybackSeq += 1;
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
