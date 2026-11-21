# Smart Document Scanner — Research Docs

Research notes for the CV final project: a **Smart Document Scanner** that runs 100% in the browser with **OpenCV.js** (OpenCV compiled to WebAssembly), keeps every scan in **IndexedDB**, and is deployed as a **static site on Netlify**.

These docs are written as shared context for the agent team that will build the app. Each file covers one topic. Facts taken from official docs are cited at the bottom of each file. Where we made a design decision or a judgment call that the docs don't state directly, the file says so.

## What the app does

1. The user uploads a photo of a receipt or page, or takes one with the webcam.
2. The app finds the four page edges (grayscale → blur → Canny → contours → `approxPolyDP`).
3. It flattens the page with a perspective warp (`getPerspectiveTransform` + `warpPerspective`).
4. It cleans the page up into a crisp black-and-white scan (`adaptiveThreshold`).
5. It saves every scan (image Blobs + metadata) in an IndexedDB library that is still there after a page refresh.

## Index

| # | File | Topic |
|---|------|-------|
| 0 | [00-architecture.md](00-architecture.md) | End-to-end architecture, file layout, message flow, and a team checklist |
| 1 | [01-opencvjs-pipeline.md](01-opencvjs-pipeline.md) | Which OpenCV.js functions the scanner needs, their signatures, and how to load opencv.js and know it's ready |
| 2 | [02-webassembly-memory-workers.md](02-webassembly-memory-workers.md) | Why WebAssembly makes OpenCV.js fast, why every `cv.Mat` must be deleted, and running the work in a Web Worker |
| 3 | [03-indexeddb-storage.md](03-indexeddb-storage.md) | Storing scans (Blobs), settings and history in IndexedDB: versions, transactions, storage limits |
| 4 | [04-netlify-deployment.md](04-netlify-deployment.md) | Serving opencv.js and its WebAssembly from Netlify: file size, MIME types, caching headers |
| 5 | [05-troubleshooting-devtools.md](05-troubleshooting-devtools.md) | Why the app can hang (stuck worker, blocked DB upgrade, memory) and how a user fixes it in Chrome DevTools |

## Key decisions at a glance

- **Self-host opencv.js** on the Netlify site (pinned to 4.13.0), don't hot-link docs.opencv.org.
- **All OpenCV work runs in a dedicated Web Worker.** The main thread only handles UI, the camera and display.
- **No DOM in the worker**, so `cv.imread`/`cv.imshow` are only used on the main thread (previews). The worker uses `cv.matFromImageData` and `ImageData`/`OffscreenCanvas` instead.
- **Every `cv.Mat`/`cv.MatVector` is freed in a `try … finally`.**
- **IndexedDB database `docscanner`**, version 1, with stores `scans`, `settings`, `history`. Images are stored as `Blob`s, not base64.
- **Call `navigator.storage.persist()`** so the browser doesn't evict the library under storage pressure.
- **Handle `onblocked` and `onversionchange`** so a schema upgrade never hangs the app.
- **Netlify `_headers`**: `application/wasm` for `.wasm`, long immutable caching for versioned vendor files, `no-cache` for HTML. Don't pre-compress files; Netlify compresses for you.

## Official sources read

- OpenCV.js tutorials (4.13.0): <https://docs.opencv.org/4.13.0/d5/d10/tutorial_js_root.html>, including *Using OpenCV.js*, *Getting Started with Images*, *Basic Operations*, *Changing Colorspaces*, *Smoothing*, *Canny*, *Thresholding*, *Contours: Getting Started*, *Contour Features*, *Geometric Transformations*, *Getting Started with Videos*, *Build OpenCV.js*
- WebAssembly: <https://webassembly.org/>, MDN *WebAssembly concepts*, MDN `WebAssembly.instantiateStreaming()`
- MDN *IndexedDB API*, *Using IndexedDB*, *Storage quotas and eviction criteria*, *Using Web Workers*
- Chrome DevTools: *View and change IndexedDB data*, *Application panel overview*
- Netlify docs: *Custom headers*, *Caching overview*, plus Netlify Support Forum answers on file size and pre-compressed files

*Research compiled 2026-11-21.*
