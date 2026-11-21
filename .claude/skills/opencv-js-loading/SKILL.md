---
name: opencv-js-loading
description: Load opencv.js and know exactly when it is ready, in a page or a Web Worker. Use when adding, upgrading or debugging the opencv.js script, a 'cv is not defined' error, or a loader that never finishes.
---

# OpenCV.js loading

**Where the file comes from:** vendored at `vendor/opencv/<version>/opencv.js` (single file, Wasm embedded as base64). Never hot-link docs.opencv.org in production. In this environment the copy comes from the npm package `@techstark/opencv-js` (a repackaged official build), because docs.opencv.org downloads are blocked here.

**Official loading patterns** (docs.opencv.org, *Using OpenCV.js*):
```html
<script async src="opencv.js" onload="onOpenCvReady();" type="text/javascript"></script>
```
Emscripten hook, which must be defined before the script runs: `var Module = { onRuntimeInitialized() { /* ready */ } };`
Newer builds expose a Promise: `cv = (cv instanceof Promise) ? await cv : cv;`

**Robust readiness check (handles every build style):**
```js
async function cvReady() {
  let c = self.cv;
  if (c instanceof Promise || typeof c?.then === 'function') c = await c;
  if (!c.Mat) await new Promise(r => { c.onRuntimeInitialized = r; });
  self.cv = c; return c;
}
```
Note: some builds return a "thenable" Module whose `then` resolves to itself. Delete `then` after awaiting (or wrap it) so `await` does not loop.

**Checklist**
- [ ] Loaded exactly once (in the worker), never on every scan.
- [ ] A visible "Loading OpenCV…" state plus a timeout (≈30 s) that turns into an error with a retry.
- [ ] Sanity check after ready: `typeof cv.Mat === 'function'`.
