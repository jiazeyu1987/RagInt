// Runtime mutations and scene editing flows.
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
  appContext.runtime.sceneEditorInteraction = {
    kind: kind,
    scene_id: String(scene.scene_id || ""),
    hotspot_id: String(hotspotId || "").trim(),
    start_point: point,
    origin_draft: Object.assign({}, state.sceneEditorDraft),
  };
  render();
}

function updateSceneEditorInteraction(event) {
  const interaction = appContext.runtime.sceneEditorInteraction;
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
  const interaction = appContext.runtime.sceneEditorInteraction;
  if (!interaction) return;
  appContext.runtime.sceneEditorInteraction = null;
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
