// Keeps the app available offline. Songs are saved by app.js in the "sai-audio" cache;
// this worker also serves them from there, so a saved song plays with no internet.
const CACHE = "sai-bhajans-v8";
const AUDIO_CACHE = "sai-audio";
const SHELL = ["./", "index.html", "styles.css", "app.js", "bhajans.json", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

// Swami's photos are kept with the songs (that cache is never cleared), so they show offline.
async function savePhotos() {
  try {
    const data = await (await fetch("bhajans.json", { cache: "no-cache" })).json();
    const base = data.site?.photoBase || "photos/";
    const files = new Set([...(data.site?.photos || []), ...(data.bhajans || []).map((b) => b.photo).filter(Boolean)]);
    const keep = await caches.open(AUDIO_CACHE);
    await Promise.all([...files].map(async (f) => {
      if (!(await keep.match(base + f))) await keep.add(base + f);
    }));
  } catch (_) {}
}
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(savePhotos)
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// A weak signal can hang for a long time, so give up on the network after a few seconds.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

// The audio player asks for byte ranges; answer them from the saved copy.
async function fromAudioCache(req) {
  const hit = await (await caches.open(AUDIO_CACHE)).match(req.url, { ignoreSearch: true });
  if (!hit) return null;
  const range = req.headers.get("range");
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = m[1] ? +m[1] : 0;
  const end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (/\.mp3$/i.test(url.pathname)) {
    e.respondWith(fromAudioCache(req).then((r) => r || fetch(req)));
    return;
  }
  if (/\/photos\//.test(url.pathname)) {
    // Photos rarely change: use the saved copy, and save any new one the first time it loads.
    e.respondWith(caches.match(req.url, { ignoreSearch: true }).then((hit) => hit || fetch(req.url).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(AUDIO_CACHE).then((c) => c.put(req.url, copy)); }
      return res;
    })));
    return;
  }
  // Network first (always checking for a newer copy), so new bhajans show up as soon as they are published.
  const fresh = fetch(req.mode === "navigate" ? req.url : req, { cache: "no-cache" });
  e.respondWith(
    withTimeout(fresh, 5000).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then((r) => r || (req.mode === "navigate" ? caches.match("./") : Response.error())))
  );
});
