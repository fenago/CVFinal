# 00 — Architecture and Team Checklist

This is the big picture that ties the other five docs together. It is our proposed design. It is not copied from any one official source.

## Layers

```
┌──────────────────────────── Main thread (index.html + app.js) ─────────────────────────────┐
│  UI: upload <input type=file>, webcam <video>, preview <canvas>, corner editor, library grid │
│  db.js  ── IndexedDB wrapper (open/upgrade, scans, settings, history)                       │
│  scanner-client.js ── owns the Worker, sends jobs, adds timeouts, restarts a stuck worker   │
└───────────────┬──────────────────────────────────────────────────────────▲─────────────────┘
                │ postMessage({type:'scan', id, bitmap, settings}, [bitmap])│ postMessage({id, ok, blobs, corners, ms})
┌───────────────▼──────────────────────────────────────────────────────────┴─────────────────┐
│  scanner.worker.js (classic worker)                                                          │
│  importScripts('/vendor/opencv/4.13.0/opencv.js') → wait for runtime → post {type:'ready'}  │
│  detectPage() → warpPage() → cleanPage() → encode PNG/JPEG via OffscreenCanvas.convertToBlob │
│  Every cv.Mat freed in try/finally                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Suggested file layout (static site, no build step needed)

```
/index.html
/app.js                 main-thread UI
/db.js                  IndexedDB wrapper
/scanner-client.js      worker manager (timeouts, restart)
/scanner.worker.js      all OpenCV code
/vendor/opencv/4.13.0/opencv.js   (+ opencv_js.wasm if you use a split build)
/_headers               Netlify headers (MIME + caching)
/netlify.toml           optional; publish dir, headers can live here instead
/docs/                  these research notes
```

## Flow of one scan

1. **Input.** The user picks a file (`<input type="file" accept="image/*" capture="environment">`) or grabs a webcam frame (`getUserMedia` → `<video>` → draw it to a canvas).
2. **Downscale for detection.** Big phone photos (12 MP and up) are slow. Detect edges on a copy whose long side is about 1000 px, then scale the four corners back up and warp the full-resolution image. (This is our performance choice.)
3. **Send to worker.** `createImageBitmap(file)` gives an `ImageBitmap`. Transfer it to the worker (zero-copy).
4. **Worker pipeline.** See [01-opencvjs-pipeline.md](01-opencvjs-pipeline.md):
   `cvtColor(RGBA2GRAY)` → `GaussianBlur(5×5)` → `Canny(75,200)` → `findContours(RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)` → sort by `contourArea` → `arcLength` + `approxPolyDP(0.02·peri)` → first convex 4-point polygon → order corners → `getPerspectiveTransform` → `warpPerspective` → gray → `adaptiveThreshold(GAUSSIAN_C, blockSize 11–31, C≈10)`.
5. **Fallback.** If no 4-point contour is found, use the whole image (or `minAreaRect` of the largest contour) and let the user drag the corners.
6. **Return.** The worker encodes the clean scan and a small thumbnail as Blobs, then posts `{ok, corners, scanBlob, thumbBlob, width, height, ms}`.
7. **Persist.** The main thread writes a record to `scans` and a row to `history` in **one** `readwrite` transaction. See [03-indexeddb-storage.md](03-indexeddb-storage.md).
8. **Render library.** Read `scans` by the `createdAt` index and show the thumbnails with `URL.createObjectURL(blob)`. Revoke the URLs when they're removed from the page.

## Message protocol (proposal)

| Direction | Message | Notes |
|---|---|---|
| worker → main | `{type:'ready', version}` | Sent once the OpenCV runtime is initialised |
| worker → main | `{type:'error', id?, message, stack}` | Any caught exception |
| main → worker | `{type:'scan', id, bitmap, settings}` | Transfer list `[bitmap]` |
| main → worker | `{type:'detect', id, bitmap}` | Corners only (live webcam overlay) |
| main → worker | `{type:'warp', id, bitmap, corners, settings}` | After the user adjusts the corners |
| worker → main | `{type:'result', id, ok, …}` | Matched to a request by `id` |

## Team checklist (definition of done)

- [ ] opencv.js is self-hosted, version pinned, and served with correct headers (`curl -I` checked on the deployed URL).
- [ ] A loading indicator stays up until the worker posts `ready`. Show an error if `ready` hasn't arrived within about 30 s.
- [ ] Every OpenCV call lives in the worker. The UI stays responsive during a scan (check in the DevTools Performance panel: no long tasks).
- [ ] Every `cv.Mat`/`MatVector` is deleted in `finally`. Scanning 50 images in a row doesn't grow memory without limit.
- [ ] Each job has a timeout. On timeout: `worker.terminate()`, start a new worker, tell the user.
- [ ] IndexedDB: `onupgradeneeded`, `onblocked`, `onversionchange` and `QuotaExceededError` are all handled. `navigator.storage.persist()` is requested.
- [ ] The library is still there after a reload. Delete-scan and Clear-library both work.
- [ ] A "Troubleshooting" section in the UI or README points users to DevTools → Application → Storage → **Clear site data**.
