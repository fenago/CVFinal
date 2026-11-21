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
// The 4.12.0 build returns a "thenable" Module whose then() hands back the Module itself.
// `await module` or `resolve(module)` would call then() again forever (verified: the worker never got ready).
// So strip `then` BEFORE resolving with the Module, and box it through the Promise chain.
const unthen = (m) => { if (m && typeof m.then === 'function') { delete m.then; if (m.then) m.then = undefined; } return m; };
async function cvReady() {
  let c = self.cv;
  if (c instanceof Promise) c = await c.then((m) => ({ m: unthen(m) })).then((b) => b.m);
  else if (typeof c?.then === 'function') c = await new Promise((r) => c.then((m) => r({ m: unthen(m) }))).then((b) => b.m);
  if (!c.Mat) await new Promise((r) => { c.onRuntimeInitialized = r; });
  self.cv = unthen(c); return c;   // returning a thenable from an async function has the same trap
}
```
Working reference: `scanner.worker.js` in the repo root.

**Checklist**
- [ ] Loaded exactly once (in the worker), never on every scan.
- [ ] A visible "Loading OpenCV…" state plus a timeout (≈30 s) that turns into an error with a retry.
- [ ] Sanity check after ready: `typeof cv.Mat === 'function'`.
