---
name: web-worker-offloading
description: Run heavy OpenCV.js work in a dedicated Web Worker so the page never freezes. Use when designing the worker, its message protocol, transferables, timeouts, restarts, or when the UI janks during a scan.
---

# Web Worker offloading

MDN: workers run scripts in background threads "without interfering with the user interface". They have **no DOM**, so use `cv.matFromImageData` + `OffscreenCanvas`, never `cv.imread`/`cv.imshow`, inside a worker.

**Design**
- A **classic** worker (`new Worker('scanner.worker.js')`), so `importScripts('vendor/opencv/.../opencv.js')` works.
- Protocol: worker → `{type:'ready'}` / `{type:'progress', id, stage}` / `{type:'result', id, ...}` / `{type:'error', id, message}`. Main → `{type:'scan', id, bitmap, options}`.
- Send `ImageBitmap`/`ArrayBuffer` in the **transfer list** (zero-copy). Blobs are passed by reference.
- Every handler is wrapped in try/catch and **always** replies.
- The client keeps a `Map(id → {resolve, reject, timer})`. On timeout: `worker.terminate()`, start a new worker, reject with a friendly error.
- One long-lived worker. Never one per scan.

**Check:** record a scan in DevTools Performance. The main thread should show no long task (>50 ms) from OpenCV.
