// Keeps the app itself available offline. Songs are saved separately by app.js in the "sai-audio" cache.
const CACHE = "sai-bhajans-v3";
const SHELL = ["./", "index.html", "styles.css", "app.js", "bhajans.json", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "sai-audio").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || /\.mp3$/i.test(url.pathname)) return;
  // Network first, so new bhajans and pitch details show up as soon as they are published.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
