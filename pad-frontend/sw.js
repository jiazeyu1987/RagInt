const SHELL_CACHE = "ragint-pad-shell-v12";
const AUDIO_CACHE = "ragint-pad-audio-v1";
const IMAGE_CACHE = "ragint-pad-image-v1";
const SHELL_ASSETS = ["/", "/index.html", "/app.css?v=20260418i", "/app.js?v=20260418i"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== AUDIO_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const url = new URL(request.url);
  const cacheName =
    url.pathname.startsWith("/api/pad/offline/images/") ||
    url.pathname.startsWith("/api/pad/offline/scenes/") ||
    url.pathname.startsWith("/api/pad/offline/stations/")
      ? IMAGE_CACHE
      : AUDIO_CACHE;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    await cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/index.html");
        return cached || Response.error();
      })
    );
    return;
  }

  if (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/app.css" ||
    url.pathname === "/app.js"
  ) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.pathname.startsWith("/api/pad/offline/audio/")) {
    if (request.headers.get("X-RagInt-Bypass-SW") === "1") return;
    event.respondWith(cacheFirst(request));
    return;
  }

  if (
    url.pathname.startsWith("/api/pad/offline/images/") ||
    url.pathname.startsWith("/api/pad/offline/scenes/") ||
    url.pathname.startsWith("/api/pad/offline/stations/")
  ) {
    if (request.headers.get("X-RagInt-Bypass-SW") === "1") return;
    event.respondWith(cacheFirst(request));
  }
});
