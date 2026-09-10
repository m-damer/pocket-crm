const CACHE_NAME = "crm-cache-v18";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/vendor/qrcode.js",
  "./js/vendor/jspdf.umd.min.js",
  "./js/db.js",
  "./js/i18n.js",
  "./js/contacts.js",
  "./js/photo-crop.js",
  "./js/vcard.js",
  "./js/schedule.js",
  "./js/qr.js",
  "./js/reports.js",
  "./js/pipeline.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];
// Cross-origin, best-effort only — cache.addAll() on the main ASSETS list
// is all-or-nothing, so if this one external request failed on a slow or
// offline first install, it must never be allowed to take the rest of the
// app's offline caching down with it. Fetched separately and swallowed on
// failure; the ordinary fetch handler below will pick it up and cache it
// on whatever later request actually succeeds anyway.
const BEST_EFFORT_ASSETS = [
  "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(ASSETS).then(() =>
          Promise.all(BEST_EFFORT_ASSETS.map((url) =>
            cache.add(url).catch(() => { /* offline or blocked — fetch handler covers it later */ })
          ))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first, falling back to network, so the app works fully offline
// after the first successful load.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});
