// Runtime loading, caching, and offline sync flows.
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

  const syncSeq = appContext.runtime.latestSyncSeq + 1;
  appContext.runtime.latestSyncSeq = syncSeq;
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

    if (syncSeq !== appContext.runtime.latestSyncSeq) return;

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

    if (syncSeq !== appContext.runtime.latestSyncSeq) return;

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
    if (syncSeq !== appContext.runtime.latestSyncSeq) return;
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
  const loadSeq = appContext.runtime.latestLoadSeq + 1;
  appContext.runtime.latestLoadSeq = loadSeq;
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

      if (loadSeq !== appContext.runtime.latestLoadSeq) return;

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
      if (loadSeq !== appContext.runtime.latestLoadSeq) return;
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
    if (loadSeq !== appContext.runtime.latestLoadSeq) return;
    preloadStationSlotRecordingMeta();
    preloadNarrationStopDurations();
    state.loading = false;
    state.errorMessage = "";
    state.errorDetail = "";
    render();
  } catch (_) {
    if (loadSeq !== appContext.runtime.latestLoadSeq) return;
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
  const playbackSeq = appContext.runtime.latestStationPlaybackSeq;
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
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
    state.audioBusy = false;
    state.audioError = "";
    state.pendingPlaybackProductId = "";
    state.playingProductId = String(product.product_id || "");
    recordProductPlay(product);
    render();
  } catch (_) {
    if (playbackSeq !== appContext.runtime.latestStationPlaybackSeq) return;
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
