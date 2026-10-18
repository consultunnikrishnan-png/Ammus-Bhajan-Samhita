# Sai Bhajans app

A website that also installs as a phone app (PWA). It lists every bhajan with
search, deity filters, favourites and a player with slower playback and repeat
for practice. Each bhajan has slots for gents shruthi, ladies shruthi, raga and tala.

## Where it lives (zero cost)

- **Website and app:** GitHub Pages, free for public repositories.
- **Recordings:** inside the same site, in `audio/`. The recordings are short
  phone recordings (1 to 2.5 minutes), about 0.7 MB each as 64 kbps mono mp3, so
  ~245 songs come to roughly 200 MB, well under GitHub Pages' 1 GB limit.
  Originals are kept in `/mnt/project-files/recordings-original/`.
- If the collection ever outgrows that, move the mp3s to GitHub Releases or
  archive.org and change `site.audioBase` in `bhajans.json`.

## Files

- `bhajans.json` holds all data. Per bhajan: `number`, `title`, `deity`, `language`,
  `audio` (file name under `site.audioBase`, or a full URL), `durationSec`,
  `raga`, `tala`, `shruthi.gents`, `shruthi.ladies`, `lyrics`, `notes`.
  Shruthi is stored as a Western note (`"C#"`) and shown as kattai (`1½ kattai (C#)`).
- `titles.txt` is the numbered master list of titles.
- `tools/import_titles.py titles.txt` adds or renames titles and guesses the deity.
- `tools/build_catalog.py <mp3 folder>` adds mp3 files to the catalogue.
- `tools/analyze_pitch.py <audio>` estimates Sa (shruthi) and the swaras used; results so far are in `pitch-estimates.json` and need confirming by ear.
- `sw.js` keeps the app usable offline; audio streams from its host.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000
