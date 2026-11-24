// Offline support: the app keeps working without internet once it has loaded once.
// Pages and config: network first (updates arrive), cache as fallback.
// Model and onnxruntime files: served from cache, refreshed in the background.
const CACHE = "adhan-app-v2";
const CORE = ["app.html", "prayer.js", "config.json", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
              "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const heavy = url.pathname.endsWith(".onnx") || url.hostname === "cdn.jsdelivr.net";
  e.respondWith(heavy ? staleWhileRevalidate(req) : networkFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const fresh = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}
