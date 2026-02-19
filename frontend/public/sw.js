const CACHE_NAME = "pantry-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/offline"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept API requests — let them fall through
  if (request.url.includes("/api/")) {
    return;
  }

  // For same-origin navigate requests, try network first then offline fallback
  if (
    request.mode === "navigate" &&
    request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline")
          .then((r) => r || new Response("You are offline", { status: 503 }))
      )
    );
  }
});
