// Keeps the app’s own files on the phone so it opens instantly and starts without a connection.
// Map data and other services always come fresh from the network.
const CACHE = "idkdates-v2";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./manifest.webmanifest", "./favicon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // The page itself: newest when online, the saved copy when offline.
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./", copy)); return res; })
        .catch(() => caches.match("./"))
    );
    return;
  }

  // Scripts, styles, fonts and icons have unique names per version, so the saved copy is always right.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
