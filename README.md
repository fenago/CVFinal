# Scanner: a smart document scanner that runs in your browser

Take a photo of a receipt or a page, and get back a flat, clean, black-and-white scan. The app finds the page, straightens it, removes shadows, and keeps every scan in a library on your device. There is no server, no account and no upload: everything happens in the browser.

- **OpenCV.js** finds the four corners of the page, flattens it with a perspective warp and cleans it with adaptive thresholding.
- **WebAssembly** runs OpenCV at near-native speed, inside a **Web Worker**, so the page never freezes.
- **IndexedDB** stores each scan (the original photo and the result, as image files, with a name and date), so the library survives a refresh.
- A plain-words explainer is built in: open **How it works** in the app (`how-it-works.html`).

It is a static site (plain HTML, CSS and JavaScript modules, no build step), ready for Netlify.

## Try it locally

You need Python 3 (for a tiny web server). Browsers won't run workers or modules from `file://`, so always use a server.

```bash
git clone <this repo> && cd CVFinal
python3 -m http.server 8080
# open http://localhost:8080
```

To run with the **same headers Netlify will send** (Content-Security-Policy, cache rules), use the bundled server, which reads `netlify.toml`:

```bash
python3 tools/serve-netlify.py 8080
```

Then click **Receipt** or **Letter** under "No photo handy? Try a sample", or choose your own photo. The camera works on `localhost` and on HTTPS.

### Sample photos

`samples/receipt.jpg` (a receipt on a wooden table) and `samples/letter.jpg` (an A4 letter on blue fabric) are **synthetic test photos**. They were rendered by `tools/make-samples.py` (real fonts, perspective, shadows, uneven light, blur, sensor noise, JPEG) because this project's build environment could not download real photos. `samples/ground-truth.json` holds the true page corners, so the tests can check that detection is accurate.

## Deploy to Netlify

`netlify.toml` is already set up: publish directory `.`, no build command, and the headers below. Pick one way:

**1. From Git (recommended).**
1. Push this repository to GitHub (or GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project →** pick the repository.
3. Leave **Build command** empty. **Publish directory** is `.` (Netlify reads it from `netlify.toml`).
4. Click **Deploy**. The site is live at `https://<name>.netlify.app` with HTTPS, so the camera works. Every push redeploys.

**2. With the Netlify CLI.**
```bash
npx netlify-cli login
npx netlify-cli deploy --dir=.            # draft URL to check first
npx netlify-cli deploy --dir=. --prod     # publish
```

**3. Drag and drop.** Open https://app.netlify.com/drop and drop the project folder. (`.git`, `tests/` and `docs/` are harmless to include.) After a drag-and-drop deploy, check the headers with the `curl` commands below; if the cache or security headers are missing, deploy with Git or the CLI instead, which always read `netlify.toml`.

### What `netlify.toml` sets, and why

| Path | Header | Why |
|---|---|---|
| `/*` | `Content-Security-Policy` (same-origin only; `'wasm-unsafe-eval'` + `'unsafe-eval'` in `script-src`) | Locks the site to its own files. OpenCV.js compiles WebAssembly and its glue code generates small functions at runtime; without those two keywords the scanner can't start (verified). |
| `/*` | `Permissions-Policy: camera=(self), microphone=()…`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy` | Camera only for this site; no sniffing, no framing. |
| `/vendor/*` | `Cache-Control: public, max-age=31536000, immutable` | OpenCV lives in a versioned folder (`vendor/opencv/4.12.0/`), so browsers keep it for a year. A new version gets a new folder. |
| `/`, `/*.html`, `/js/*`, `/css/*`, `/scanner.worker.js` | `Cache-Control: no-cache` | A new deploy shows up on the next visit (cheap 304 revalidation). |
| `/*.wasm` | `Content-Type: application/wasm` | Only matters if you switch to a split OpenCV build; streaming compilation needs this exact type. |

**Check a deploy:**
```bash
curl -sI https://<your-site>.netlify.app/vendor/opencv/4.12.0/opencv.js | grep -iE 'HTTP|cache-control|content-type|content-encoding'
curl -sI https://<your-site>.netlify.app/ | grep -iE 'cache-control|content-security-policy'
```

### A note on the size of `opencv.js`

`vendor/opencv/4.12.0/opencv.js` is the official OpenCV 4.12.0 single-file build (WebAssembly embedded as base64, no threads). It is **10,872,779 bytes (~10.4 MiB)**, about **3.5 MB** on the wire because Netlify compresses it. Netlify's staff guidance is to keep individual deploy files at or under about 10 MB; this is a recommendation, not a hard limit, and the file is right at that edge. If a deploy ever rejects or truncates it, the fixes are:
- a **split build** (`--disable_single_file`): `opencv.js` + `opencv_js.wasm` (the `.wasm` rule in `netlify.toml` is already there), or
- a **trimmed custom build** with only the modules this app uses (imgproc + core).

Never upload pre-compressed `.gz`/`.br` copies: Netlify compresses again and the browser fails with `CompileError: expected magic word 00 61 73 6d`.

Each deploy-preview URL is a separate website as far as the browser is concerned, so it starts with an empty library.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Stuck on "Loading the scanner…" | The first load downloads ~3.5 MB. Wait, or press **Try Again** when it appears. Check DevTools → **Network** that `opencv.js` returns 200 (not 404). On your own server, make sure you didn't add a stricter Content-Security-Policy. |
| "Couldn't scan this photo" or a scan never finishes | Press **Try Again**: after 30 seconds the app restarts its background scanner by itself. Try a smaller photo. |
| "We couldn't find all four corners" | Put the page on a darker, plain surface, with all four corners in view. |
| Banner: "Scanner is open in another tab with an older version" | Close the other Scanner tab. The update finishes by itself. |
| Banner: "Scanner was updated in another tab" | Press **Reload**. |
| The library looks wrong, or the app seems stuck | Scroll to the bottom and press **Reset app data** (this deletes all saved scans on this device). |
| Reset doesn't finish | Close other Scanner tabs; the reset waits for them. |

**Chrome DevTools, step by step**
1. Open the app, then DevTools (F12, or Cmd+Option+I on a Mac) → **Application**.
2. **Storage → IndexedDB → `docscanner`** shows the database version (currently 2) and its stores: `scans` (your library), `settings`, `history`. Click **Refresh** (it doesn't update live). Select a row and press **Delete Selected** to remove one scan.
3. To wipe everything: **Application → Storage →** keep IndexedDB ticked → **Clear site data**, then hard-reload (Shift+Reload).
4. **Console** shows any errors; **Network** shows whether `opencv.js` loaded (and from cache on later visits); **Performance** shows that scans don't block the main thread.
5. **Storage → Simulate custom storage quota** lets you test the "out of space" message.

## How it is built

```
index.html            app shell (states, library, dialogs)
how-it-works.html     plain-words explainer
css/styles.css        Apple-style look: solid content layer, Liquid-Glass-style floating controls, light/dark
js/app.js             main thread: UI states, uploads, camera, library (never calls OpenCV)
js/scanner-client.js  talks to the worker: request ids, progress, 30 s timeout, restart
scanner.worker.js     classic Web Worker: loads opencv.js once, runs the pipeline, encodes Blobs
js/pipeline.js        OpenCV.js pipeline: detect page → perspective warp → shadow removal → adaptive threshold
js/db.js              IndexedDB `docscanner` v2: scans + settings + history, blocked/versionchange handling, reset
vendor/opencv/4.12.0/ official opencv.js (Apache 2.0, see LICENSE there)
netlify.toml          publish ".", headers
samples/              two synthetic test photos + ground-truth corners
tests/                e2e test and focused checks (Playwright + Chromium)
tools/                sample generator, Node pipeline test, header-aware local server
docs/                 research notes, UX spec, hand-off log, QA report and screenshots
```

### Tests

```bash
node tests/e2e.mjs              # full end-to-end run in headless Chromium (32 checks, screenshots to docs/qa/)
node tests/worker-check.cjs     # worker + Wasm: readiness, 48 MP photo, responsiveness, 20-scan heap check
node tests/db-check.cjs         # IndexedDB: upgrade ladder, reload, delete, blocked upgrade, versionchange, reset
node tools/test-pipeline.cjs --leak 30   # pipeline in Node: corner accuracy + Wasm heap check
```
Requires Node 18+ and Playwright with Chromium. Results and screenshots are summarised in `docs/qa-report.md`.

## The team and credits

This app was planned and built by a team of Claude Code agents defined in `.claude/agents/` (skills in `.claude/skills/`, reference notes in `knowledge/`). Atlas, the orchestrator, planned the work and passed every hand-off between experts; each deliverable was peer-reviewed by a different expert before it was accepted. The full record, including review verdicts, is in `docs/handoff-log.md`.

| Expert | Role | Built |
|---|---|---|
| Atlas (orchestrator) | Plan, interface contracts, hand-offs, acceptance | `docs/handoff-log.md` |
| Iris (opencv-expert) | Vision pipeline, sample photos | `js/pipeline.js`, `tools/make-samples.py`, `tools/test-pipeline.cjs`, `samples/` |
| Forge (wasm-expert) | Worker, OpenCV loading, Wasm memory | `scanner.worker.js`, `js/scanner-client.js`, `tests/worker-check.cjs` |
| Ledger (indexeddb-expert) | Library database, reset | `js/db.js`, `tests/db-check.cjs` |
| Wren (ux-designer-apple-hig) | Flow, states, copy, accessibility | `docs/ux-spec.md` |
| Sable (ui-designer-apple-liquid-glass) | Visual design | `css/styles.css` |
| Juniper (frontend-engineer) | App shell and wiring | `index.html`, `js/app.js` |
| Harbor (netlify-deploy-engineer) | Netlify config, header-aware local server | `netlify.toml`, `tools/serve-netlify.py` |
| Lark (technical-writer) | Docs | `README.md`, `how-it-works.html` |
| Vera (qa-engineer) | Browser testing | `tests/e2e.mjs`, `docs/qa-report.md`, `docs/qa/` |
| Quill (meta-agent) | Team maintenance | fixed a defect in the team's worker example (see hand-off log) |

OpenCV is © the OpenCV team, Apache License 2.0 (`vendor/opencv/4.12.0/LICENSE`). The vendored file is the official build, repackaged on npm as `@techstark/opencv-js@4.12.0-release.1`.
