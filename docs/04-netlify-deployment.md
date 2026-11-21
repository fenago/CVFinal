# 04 — Deploying opencv.js + WebAssembly on Netlify (Static Site)

The app is pure static files (HTML, JS, opencv.js, optional `.wasm`). There's no server code, so Netlify's static hosting is a natural fit. Netlify also gives us **HTTPS** automatically, which `getUserMedia` (webcam) needs.

## 1. Self-host opencv.js, don't hot-link it

- Download `opencv.js` 4.13.0 once (from the release docs package or `https://docs.opencv.org/4.13.0/opencv.js`) and commit it to `/vendor/opencv/4.13.0/opencv.js`.
- Why: the docs site isn't a CDN made for production traffic. Self-hosting keeps the version pinned, works offline once cached, and keeps everything same-origin. Same-origin is required for `importScripts` in our worker without extra CORS work.
- Putting the **version in the path** lets us cache it forever (`immutable`). A new OpenCV version means a new folder.

## 2. File size

- The default prebuilt `opencv.js` is a **single file with the wasm embedded as base64**. It's **roughly 8–10 MB uncompressed**. (A community measurement of an OpenCV.js build reported 8.1 MB for wasm and 9.0 MB for threads+SIMD. Measure our actual copy with `ls -lh`.)
- Netlify staff guidance: "Regarding individual files, the recommended size for uploading to deploys is no more than 10MB." The standard opencv.js is right at that edge. It usually deploys fine, but keep it in mind.
- **Ways to shrink it** (optional, if load time matters):
  1. **Split build** (`--disable_single_file`). The wasm goes into a separate `.wasm` file. That removes about 33% base64 overhead and allows streaming compilation.
  2. **Custom build** that only includes the modules we use (core + imgproc). The OpenCV repo has a JS whitelist config (`platforms/js/opencv_js.config.py`) for this. That's from the OpenCV source tree, not the tutorial page, so check it against the 4.13.0 source before relying on it.
  3. Netlify automatically compresses text responses (gzip/Brotli) on the wire, so a JS file shrinks a lot in transit.
- **Don't upload pre-compressed `.br`/`.gz` files.** A Netlify forum thread documents that Netlify compresses them *again* without the right `Content-Encoding`. The browser then gets double-compressed bytes and WebAssembly fails with `CompileError: … expected magic word 00 61 73 6d`. Netlify staff recommended letting Netlify do the compression.

## 3. MIME types

- `opencv.js` must be served as JavaScript (`text/javascript` / `application/javascript`). Netlify does this by extension.
- If we use a split build, the `.wasm` file **must** be `application/wasm`. MDN on `instantiateStreaming`: "If the response has an incorrect MIME type (instead of `application/wasm`), the promise rejects with a `TypeError`." Emscripten's loader usually falls back to a slower array-buffer instantiation, but it's best to set the type explicitly so we never depend on that.
- Check after deploying:

```bash
curl -sI https://<site>.netlify.app/vendor/opencv/4.13.0/opencv.js | grep -iE 'content-type|cache-control|content-encoding'
```

## 4. Caching headers

Netlify's **defaults** (from the *Caching overview* docs):

```
Cache-Control: public, max-age=0, must-revalidate
Netlify-CDN-Cache-Control: public, s-maxage=31536000, must-revalidate
```

So by default browsers revalidate every file on every load. That means a cheap 304 request for opencv.js each time, not a re-download, but still a round trip. Netlify's CDN keeps files at the edge until the next deploy.

For a versioned, never-changing vendor file we can tell browsers to cache it for a year (`immutable` means "don't even revalidate"; see MDN `Cache-Control`).

## 5. Config files

Custom headers can go in a `_headers` file in the **publish directory**, or in `netlify.toml`. Path syntax: `*` wildcards match anything within a path segment. `:placeholders` match one segment.

**`_headers`** (put it at the site root, next to `index.html`):

```
# Versioned third-party library: cache forever
/vendor/*
  Cache-Control: public, max-age=31536000, immutable

# If using a split OpenCV build
/vendor/opencv/*/*.wasm
  Content-Type: application/wasm

# App shell must update immediately after each deploy
/index.html
  Cache-Control: no-cache
# (app.js / scanner.worker.js keep Netlify's default "max-age=0, must-revalidate";
#  don't add a broad /*.js rule — it could also match /vendor/** and the two
#  Cache-Control values would be concatenated.)

# Good hygiene
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self)
```

**Equivalent `netlify.toml`:**

```toml
[build]
  publish = "."          # or "public" / "dist" if the team uses a folder

[[headers]]
  for = "/vendor/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/vendor/opencv/*/*.wasm"
  [headers.values]
    Content-Type = "application/wasm"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"
```

Notes:
- If several rules match the same path with the same header, Netlify **concatenates** multi-value headers. Avoid having two rules set `Cache-Control` for the same file.
- Our own app JS (`app.js`, `scanner.worker.js`) isn't fingerprinted, so keep it on the default revalidation. Otherwise users could run a stale worker against a new page.
- **Threads build only:** a multithreaded OpenCV.js needs `SharedArrayBuffer`, which needs the page to be cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). Our plan uses the standard non-threaded build plus a Web Worker, so we **don't** need these headers. Note it in case someone swaps in a threads build.

## 6. Deploy options

- **Git-connected site** (recommended): connect the GitHub repo in the Netlify UI. Build command: none. Publish directory: repo root or `public/`. Every push to `main` deploys, and pull requests get deploy previews. Remember each preview URL is a different origin with its own empty IndexedDB.
- **Netlify CLI:** `npx netlify-cli deploy --dir=. --prod`.
- **Drag-and-drop** of the folder in the Netlify UI works for a quick demo.

## 7. Optional: offline / PWA

A service worker that caches `/vendor/opencv/...` with Cache Storage would make the scanner work fully offline after the first visit. It also helps Chrome grant `navigator.storage.persist()`. This is optional, but it's a strong final-project feature. Beware: a buggy service worker is another way the app can "hang" on old code (see doc 05).

## Sources

- Netlify, Custom headers — <https://docs.netlify.com/manage/routing/headers/>
- Netlify, Caching overview — <https://docs.netlify.com/build/caching/caching-overview/>
- Netlify Support Forums, max object size — <https://answers.netlify.com/t/what-is-the-maximum-allowed-object-size/145182>
- Netlify Support Forums, double compression of pre-compressed wasm — <https://answers.netlify.com/t/netlify-corrupting-served-data-files-by-compressing-already-compressed-files/69428>
- MDN, `WebAssembly.instantiateStreaming()` — <https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static>
- MDN, Cache-Control — <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control>
- OpenCV, Build OpenCV.js — <https://docs.opencv.org/4.13.0/d4/da1/tutorial_js_setup.html>
- intel/webml-polyfill#1348 (OpenCV.js size measurement) — <https://github.com/intel/webml-polyfill/issues/1348>
