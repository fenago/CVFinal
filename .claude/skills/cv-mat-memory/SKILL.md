---
name: cv-mat-memory
description: Free every cv.Mat / cv.MatVector so the WebAssembly heap never leaks. Use when writing or reviewing any OpenCV.js code, or when memory grows or 'Cannot enlarge memory arrays' appears.
---

# cv.Mat memory discipline

Official rule (docs.opencv.org, *Using OpenCV.js*): "You have to call delete method of cv.Mat to free memory allocated in Emscripten's heap." *Basic Operations*: delete cv.Mat, cv.MatVector **and the Mat you get from `MatVector.get(i)`**.

Why: the JS object is only a handle. The pixels live in WebAssembly linear memory, which the JS garbage collector never frees.

**Must delete:** `new cv.Mat()`, `cv.Mat.zeros/ones/eye`, `cv.matFromArray`, `cv.matFromImageData`, `cv.imread`, `.clone()`, `new cv.MatVector()`, `vec.get(i)`, the return value of `cv.getPerspectiveTransform`.
**No delete needed:** `cv.Size`, `cv.Point`, `cv.Scalar` (plain value objects).

**Pattern**
```js
const mats = []; const T = m => (mats.push(m), m);
try { const gray = T(new cv.Mat()); /* ... */ }
finally { for (const m of mats) if (!m.isDeleted()) m.delete(); }
```
**Review checklist**
- [ ] Every allocation goes through `T()` or has a matching `delete()` in `finally`.
- [ ] Loops over `contours.get(i)` delete each item.
- [ ] Returned Mats are documented as "caller deletes".
- [ ] Leak test: 30+ scans in a row; `performance.memory`/Wasm heap size stays flat.
