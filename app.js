(() => {
  "use strict";

  // Kattai is the pitch notation most bhajan singers use: C = 1 kattai, C# = 1½, and so on.
  const KATTAI = {
    "C": "1", "C#": "1½", "Db": "1½", "D": "2", "D#": "2½", "Eb": "2½", "E": "3",
    "F": "4", "F#": "4½", "Gb": "4½", "G": "5", "G#": "5½", "Ab": "5½",
    "A": "6", "A#": "6½", "Bb": "6½", "B": "7"
  };
  const SPEEDS = [1, 0.9, 0.75];
  const FAV_KEY = "saiBhajans.favourites";

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const state = {
    site: {}, all: [], deity: "All", query: "", view: "all",
    favs: new Set(), queue: [], current: null, speedIdx: 0, repeat: false
  };

  // ---------- storage (best effort) ----------
  try { state.favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch (_) {}
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs])); } catch (_) {} };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  // Pitch is either Sai Rhythms style ("2 Madhyam / G": harmonium setting, then Sa)
  // or a plain Sa note ("C#"), shown as kattai.
  const parsePitch = (p) => {
    if (!p) return null;
    const m = p.match(/^\s*([\d.]+)\s+(Pancham|Madhyam)\s*\/\s*(.+?)\s*$/i);
    if (m) return { label: `${m[1].replace(".5", "½")} ${m[2]}`, sa: m[3] };
    const k = KATTAI[p.trim()];
    return k ? { label: `${k} kattai`, sa: p.trim() } : { label: p, sa: null };
  };
  const shruthiText = (p) => parsePitch(p)?.label || null;
  const audioUrl = (b) => {
    if (!b.audio) return null;
    if (/^https?:\/\//.test(b.audio)) return b.audio;
    return (state.site.audioBase || "") + b.audio;
  };

  // ---------- offline songs ----------
  // Songs are kept in their own cache: each one is saved the first time it plays with internet,
  // or when the student taps "Save for offline". Saved songs play from the phone with no internet.
  const AUDIO_CACHE = "sai-audio";
  const saved = new Set();
  const hasCaches = "caches" in window;
  const abs = (url) => new URL(url, location.href).href;
  const isSaved = (b) => !!audioUrl(b) && saved.has(abs(audioUrl(b)));
  async function loadSaved() {
    if (!hasCaches) return;
    try {
      const keys = await (await caches.open(AUDIO_CACHE)).keys();
      keys.forEach((r) => saved.add(r.url));
    } catch (_) {}
  }
  async function saveSong(url) {
    if (!hasCaches || !url || saved.has(abs(url))) return true;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      await (await caches.open(AUDIO_CACHE)).put(abs(url), res);
      saved.add(abs(url));
      navigator.storage?.persist?.().catch(() => {});
      return true;
    } catch (_) { return false; }
  }
  async function unsaveSong(url) {
    try { await (await caches.open(AUDIO_CACHE)).delete(abs(url)); } catch (_) {}
    saved.delete(abs(url));
  }
  let objectUrl = null;
  async function sourceFor(url) {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    if (!hasCaches || !saved.has(abs(url))) return url;
    try {
      const hit = await (await caches.open(AUDIO_CACHE)).match(abs(url));
      if (hit) { objectUrl = URL.createObjectURL(await hit.blob()); return objectUrl; }
    } catch (_) {}
    return url;
  }

  // ---------- filtering ----------
  // Bhajan names are spelled many ways (Shambho/Shambo, Vittala/Vithale, Sayee/Sai, Sairam/Sai Ram),
  // so search compares a loose spelling: no spaces or "h", w as v, long vowels shortened, doubles merged.
  const loose = (s) => String(s || "").toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/h/g, "").replace(/w/g, "v").replace(/z/g, "j")
    .replace(/ee/g, "i").replace(/oo/g, "u").replace(/ay/g, "ai")
    .replace(/(.)\1+/g, "$1");
  // Looser still, for spellings that drop or add vowels (Shirdi/Shiridi): consonants only.
  const skeleton = (s) => loose(s).replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");

  function visible() {
    const q = state.query.trim();
    const pool = state.all.filter((b) =>
      (state.view !== "fav" || state.favs.has(b.id)) &&
      (state.deity === "All" || b.deity === state.deity));
    if (!q) return pool;
    if (/^\d+$/.test(q)) return pool.filter((b) => String(b.number) === q);
    const lq = loose(q), sq = skeleton(q);
    const close = [], rough = [];
    for (const b of pool) {
      const text = [b.title, b.deity, b.raga, b.lyrics].join(" ");
      if (loose(text).includes(lq)) close.push(b);
      else if (sq.length >= 3 && skeleton(text).includes(sq)) rough.push(b);
    }
    return close.length >= 3 ? close : close.concat(rough);
  }

  // ---------- rendering ----------
  function renderChips() {
    // Traditional bhajan order: Ganesha first, then Guru, then the rest.
    const ORDER = ["Ganesha", "Guru", "Sai", "Devi", "Shiva", "Subrahmanya", "Rama", "Krishna", "Vishnu", "Hanuman", "Sarva Dharma"];
    const present = [...new Set(state.all.map((b) => b.deity).filter(Boolean))];
    present.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    const deities = ["All", ...present];
    $("chips").innerHTML = deities.map((d) =>
      `<button class="chip" type="button" data-deity="${esc(d)}" aria-pressed="${d === state.deity}">${esc(d)}</button>`
    ).join("");
  }

  function tagsFor(b) {
    const g = shruthiText(b.shruthi?.gents), l = shruthiText(b.shruthi?.ladies);
    const parts = [`<span class="tag">${esc(b.deity || "")}</span>`];
    if (b.raga) parts.push(`<span class="tag">Raga <b>${esc(b.raga)}</b></span>`);
    if (g || l) {
      if (g) parts.push(`<span class="tag">Gents <b>${esc(g)}</b></span>`);
      if (l) parts.push(`<span class="tag">Ladies <b>${esc(l)}</b></span>`);
    } else {
      parts.push(`<span class="tag pending">Pitch to be added</span>`);
    }
    if (b.sample) parts.push(`<span class="tag sample">Sample entry</span>`);
    return parts.join("");
  }

  const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';

  function renderList() {
    const items = visible();
    $("countAll").textContent = `(${state.all.length})`;
    $("countFav").textContent = `(${state.favs.size})`;
    $("list").innerHTML = items.map((b) => `
      <li class="row${state.current?.id === b.id ? " playing" : ""}" data-id="${esc(b.id)}">
        <span class="num">${esc(b.number)}</span>
        <button class="row-main" type="button" data-open="${esc(b.id)}">
          <span class="row-title">${esc(b.title)}</span>
          <span class="row-meta">${tagsFor(b)}</span>
        </button>
        <button class="row-play${isSaved(b) ? " saved" : ""}" type="button" data-play="${esc(b.id)}" ${audioUrl(b) ? "" : "disabled"}
          aria-label="${audioUrl(b) ? "Play " + esc(b.title) + (isSaved(b) ? " (saved on this phone)" : "") : "Recording not added yet"}">${PLAY_ICON}</button>
      </li>`).join("");
    const empty = $("empty");
    empty.hidden = items.length > 0;
    if (!items.length) {
      empty.textContent = state.view === "fav" && !state.favs.size
        ? "No favourites yet. Open a bhajan and tap Add to favourites."
        : "No bhajans match that search.";
    }
  }

  // ---------- details sheet ----------
  let sheetSong = null;
  function setFact(id, value, pendingText) {
    const el = $(id);
    el.classList.toggle("pending", !value);
    if (!value) { el.textContent = pendingText; return; }
    el.innerHTML = value;
  }
  function shruthiHtml(p) {
    const x = parsePitch(p);
    if (!x) return null;
    return esc(x.label) + (x.sa ? `<small>Sa = ${esc(x.sa)}</small>` : "");
  }
  // A bhajan can name its own photo; otherwise the site's photos rotate by bhajan number.
  function photoFor(b) {
    const list = state.site.photos || [];
    const file = b.photo || (list.length ? list[(b.number - 1) % list.length] : null);
    return file ? (state.site.photoBase || "photos/") + file : null;
  }
  function openSheet(b) {
    sheetSong = b;
    const img = $("sheetPhoto"), photo = photoFor(b);
    img.hidden = !photo;
    if (photo) img.src = photo; else img.removeAttribute("src");
    $("sheetNum").textContent = `Bhajan ${b.number}${b.sample ? " · sample entry" : ""}`;
    $("sheetTitle").textContent = b.title;
    $("sheetDeity").textContent = [b.deity, b.language].filter(Boolean).join(" · ");
    setFact("fGents", shruthiHtml(b.shruthi?.gents), "To be added");
    setFact("fLadies", shruthiHtml(b.shruthi?.ladies), "To be added");
    setFact("fRaga", b.raga && esc(b.raga), "To be added");
    setFact("fTala", b.tala && esc(b.tala), "To be added");
    $("sheetPlay").disabled = !audioUrl(b);
    $("sheetPlay").textContent = audioUrl(b) ? "Play" : "Recording not added yet";
    $("sheetVersions").innerHTML = (b.versions || []).map((v, i) =>
      `<button class="primary alt" type="button" data-version="${i}">Play ${esc(v.label.toLowerCase())} version</button>`).join("");
    updateFavBtn(); updateOfflineBtn();
    $("sheetMsg").textContent = "";
    $("sheetLyrics").textContent = b.lyrics || "";
    $("sheetNotes").textContent = b.notes || "";
    $("sheetTeacher").hidden = !b.teacherShruthi;
    $("sheetTeacher").textContent = b.teacherShruthi ? `The recording is sung at ${b.teacherShruthi}.` : "";
    const src = $("sheetSource");
    src.hidden = !b.sourceUrl;
    if (b.sourceUrl) src.href = b.sourceUrl;
    const d = $("sheet");
    if (!d.open) { try { d.showModal(); } catch (_) { d.setAttribute("open", ""); } }
    if (location.hash !== "#" + b.id) history.replaceState(null, "", "#" + b.id);
  }
  function closeSheet() {
    const d = $("sheet");
    if (d.open) d.close();
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  function updateOfflineBtn() {
    const btn = $("sheetOffline");
    btn.hidden = !hasCaches || !sheetSong || !audioUrl(sheetSong);
    if (btn.hidden) return;
    const on = isSaved(sheetSong);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Saved for offline" : "Save for offline";
  }
  function updateFavBtn() {
    const on = sheetSong && state.favs.has(sheetSong.id);
    $("sheetFav").setAttribute("aria-pressed", String(!!on));
    $("sheetFav").textContent = on ? "In favourites" : "Add to favourites";
  }

  // ---------- player ----------
  // `version` is an extra take of the same bhajan, e.g. { label: "Fast", audio: "b052-fast.mp3" }.
  async function play(b, queue, version) {
    const url = version ? audioUrl(version) : audioUrl(b);
    if (!url) return;
    state.queue = (queue || visible()).filter(audioUrl);
    state.current = b;
    $("player").hidden = false;
    $("npTitle").textContent = version ? `${b.title} (${version.label})` : b.title;
    const offlineMiss = !navigator.onLine && !saved.has(abs(url));
    $("npMeta").textContent = offlineMiss
      ? "No internet. This song plays offline once it has been played or saved with internet."
      : [b.deity, shruthiText(b.shruthi?.gents) && "Gents " + shruthiText(b.shruthi.gents)].filter(Boolean).join(" · ");
    setMediaSession(b);
    renderList();
    audio.src = await sourceFor(url);
    audio.playbackRate = SPEEDS[state.speedIdx];
    audio.play().catch(() => {});
    if (!saved.has(abs(url)) && navigator.onLine) {
      saveSong(url).then((ok) => { if (ok) { renderList(); updateOfflineBtn(); updateSaveAll(); } });
    }
  }
  function step(dir) {
    if (!state.current || !state.queue.length) return;
    const i = state.queue.findIndex((x) => x.id === state.current.id);
    const next = state.queue[(i + dir + state.queue.length) % state.queue.length];
    if (next) play(next, state.queue);
  }
  function setMediaSession(b) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: b.title, artist: state.site.teacher || state.site.title || "Sai Bhajans", album: b.deity || "",
        artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }]
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    } catch (_) {}
  }

  audio.addEventListener("play", () => { $("player").classList.add("is-playing"); $("playBtn").setAttribute("aria-label", "Pause"); });
  audio.addEventListener("pause", () => { $("player").classList.remove("is-playing"); $("playBtn").setAttribute("aria-label", "Play"); });
  audio.addEventListener("loadedmetadata", () => { $("tDur").textContent = fmt(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    $("tCur").textContent = fmt(audio.currentTime);
    if (audio.duration) $("seek").value = Math.round((audio.currentTime / audio.duration) * 1000);
  });
  audio.addEventListener("ended", () => {
    if (state.repeat) { audio.currentTime = 0; audio.play().catch(() => {}); }
    else step(1);
  });
  $("seek").addEventListener("input", (e) => {
    if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration;
  });
  $("playBtn").addEventListener("click", () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); });
  $("prevBtn").addEventListener("click", () => {
    if (audio.currentTime > 5) audio.currentTime = 0; else step(-1);
  });
  $("nextBtn").addEventListener("click", () => step(1));
  $("speedBtn").addEventListener("click", () => {
    state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
    const r = SPEEDS[state.speedIdx];
    audio.playbackRate = r;
    $("speedBtn").textContent = `${r}×`;
  });
  $("repeatBtn").addEventListener("click", () => {
    state.repeat = !state.repeat;
    $("repeatBtn").setAttribute("aria-pressed", String(state.repeat));
  });

  // ---------- events ----------
  $("q").addEventListener("input", (e) => { state.query = e.target.value; renderList(); });
  $("chips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-deity]");
    if (!btn) return;
    state.deity = btn.dataset.deity;
    renderChips(); renderList();
  });
  const setView = (v) => {
    state.view = v;
    $("tabAll").setAttribute("aria-selected", String(v === "all"));
    $("tabFav").setAttribute("aria-selected", String(v === "fav"));
    renderList();
  };
  $("tabAll").addEventListener("click", () => setView("all"));
  $("tabFav").addEventListener("click", () => setView("fav"));
  $("list").addEventListener("click", (e) => {
    const p = e.target.closest("[data-play]");
    if (p) { play(byId(p.dataset.play)); return; }
    const o = e.target.closest("[data-open]");
    if (o) openSheet(byId(o.dataset.open));
  });
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
  $("sheet").addEventListener("close", () => {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  });
  $("sheetPlay").addEventListener("click", () => { if (sheetSong) { play(sheetSong); closeSheet(); } });
  $("sheetVersions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-version]");
    if (btn && sheetSong) { play(sheetSong, null, sheetSong.versions[+btn.dataset.version]); closeSheet(); }
  });
  $("sheetFav").addEventListener("click", () => {
    if (!sheetSong) return;
    state.favs.has(sheetSong.id) ? state.favs.delete(sheetSong.id) : state.favs.add(sheetSong.id);
    saveFavs(); updateFavBtn(); renderList();
  });
  $("sheetOffline").addEventListener("click", async () => {
    if (!sheetSong) return;
    const b = sheetSong, urls = [b, ...(b.versions || [])].map(audioUrl).filter(Boolean);
    const msg = $("sheetMsg");
    if (isSaved(b)) {
      await Promise.all(urls.map(unsaveSong));
      msg.textContent = "Removed from this phone. It will need internet again.";
    } else {
      msg.textContent = "Saving…";
      const ok = (await Promise.all(urls.map(saveSong))).every(Boolean);
      msg.textContent = ok ? "Saved. This bhajan now plays without internet." : "Could not save. Check your internet or phone storage.";
    }
    updateOfflineBtn(); renderList(); updateSaveAll();
  });
  $("saveAll").addEventListener("click", async () => {
    const btn = $("saveAll"), urls = state.all.flatMap((b) => [b, ...(b.versions || [])]).map(audioUrl).filter(Boolean);
    const todo = urls.filter((u) => !saved.has(abs(u)));
    btn.disabled = true; savingAll = true;
    let done = 0, failed = 0;
    for (const u of todo) {
      if (!(await saveSong(u))) failed++;
      done++;
      btn.textContent = `Saving ${done} of ${todo.length}…`;
      if (done % 10 === 0) renderList();
    }
    savingAll = false; renderList(); updateSaveAll();
    if (failed) $("saveAllMsg").textContent = `${failed} could not be saved. Check your internet or phone storage, then tap again.`;
  });
  let savingAll = false;
  function updateSaveAll() {
    const btn = $("saveAll");
    if (savingAll) return;
    if (!hasCaches) { $("offlineBox").hidden = true; return; }
    const urls = state.all.flatMap((b) => [b, ...(b.versions || [])]).map(audioUrl).filter(Boolean);
    const left = urls.filter((u) => !saved.has(abs(u))).length;
    btn.disabled = left === 0;
    btn.textContent = left === 0 ? "All songs saved on this phone" : `Save all ${left} songs for offline (about ${Math.max(1, Math.round(left * 0.75))} MB)`;
    $("saveAllMsg").textContent = "";
  }
  $("sheetShare").addEventListener("click", async () => {
    if (!sheetSong) return;
    const url = location.href.split("#")[0] + "#" + sheetSong.id;
    const msg = $("sheetMsg");
    if (navigator.share) {
      try { await navigator.share({ title: sheetSong.title, url }); return; } catch (_) {}
    }
    try { await navigator.clipboard.writeText(url); msg.textContent = "Link copied. Paste it into WhatsApp or email."; }
    catch (_) { msg.textContent = url; }
  });
  window.addEventListener("hashchange", openFromHash);
  $("helpBtn").addEventListener("click", () => {
    const d = $("help");
    try { d.showModal(); } catch (_) { d.setAttribute("open", ""); }
  });
  $("helpClose").addEventListener("click", () => $("help").close());
  $("help").addEventListener("click", (e) => { if (e.target === $("help")) $("help").close(); });

  const byId = (id) => state.all.find((b) => b.id === id);
  function openFromHash() {
    const id = location.hash.slice(1);
    const b = id && byId(id);
    if (b) openSheet(b);
  }

  // ---------- install ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null; $("installBtn").hidden = true;
  });
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $("iosHint").hidden = false;
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // ---------- boot ----------
  fetch("bhajans.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      state.site = data.site || {};
      state.all = (data.bhajans || []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      if (state.site.title) { $("siteTitle").textContent = state.site.title; document.title = state.site.title; }
      const sub = state.site.tagline || (state.site.teacher ? `Sung by ${state.site.teacher}` : state.site.subtitle);
      if (sub) $("siteSubtitle").textContent = sub;
      renderChips(); renderList(); openFromHash();
      loadSaved().then(() => { renderList(); updateSaveAll(); });
      // Keep Swami's photos on the phone with the saved songs, so they show offline.
      const pics = new Set([...(state.site.photos || []), ...state.all.map((b) => b.photo).filter(Boolean)]);
      pics.forEach((f) => saveSong((state.site.photoBase || "photos/") + f));
    })
    .catch(() => {
      $("empty").hidden = false;
      $("empty").textContent = "The bhajan list could not load. Check your connection and refresh.";
    });
})();
