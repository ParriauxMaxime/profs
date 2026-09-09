// Substituted at build time by the CopyRspackPlugin transform in
// rspack.config.ts — the commit sha in CI, a timestamp locally. A fixed name
// would make `activate` a no-op and let superseded hashed assets accumulate
// forever, on the same device quota as the pupil photos.
const CACHE = "profs-__BUILD_ID__";

// `addAll` is atomic: one 404 rejects the whole install and the app has no
// service worker at all. So this list is the boot path and nothing else —
// every entry must exist, and every entry must be worth failing over.
//
// The other icons, the screenshots and the share card are deliberately absent.
// A launcher icon is fetched when the app is installed and the screenshots
// when the install dialog opens, both of which happen online; precaching them
// would spend the device quota the pupils' photos share, to save a request
// that is never made offline.
const SHELL = ["./", "./index.html", "./manifest.json", "./icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const isNavigation = request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          // Only successful same-origin responses are worth keeping: caching a
          // 404 or an opaque cross-origin response would serve it back forever.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
