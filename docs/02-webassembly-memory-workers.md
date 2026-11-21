# 02 — WebAssembly, Mat Memory, and Web Workers

## 1. What WebAssembly is and why it makes OpenCV.js fast

**Official definition** (webassembly.org):
> "WebAssembly (abbreviated *Wasm*) is a binary instruction format for a stack-based virtual machine. Wasm is designed as a portable compilation target for programming languages, enabling deployment on the web for client and server applications."

MDN (*WebAssembly concepts*):
> "WebAssembly is a low-level assembly-like language with a compact binary format that runs with near-native performance and provides languages with low-level memory models such as C++ and Rust with a compilation target so that they can run on the web."

**How OpenCV becomes OpenCV.js.** OpenCV's C++ source is compiled with **Emscripten** into a `.wasm` module, plus JavaScript "glue" that exposes `cv.Mat`, `cv.Canny` and so on. (See *Build OpenCV.js*.) Why that's fast:

1. **Near-native execution.** The same optimised C++ image loops run as compiled machine code. They aren't interpreted JavaScript.
2. **Compact binary.** The browser decodes and compiles the binary quickly. With `instantiateStreaming` it can even compile while the file is still downloading.
3. **Predictable memory.** Pixels live in one flat **linear memory** (MDN: "A growable buffer that contains the linear array of bytes read and written by WebAssembly's low-level memory access instructions"). That avoids per-pixel JS objects and garbage-collector pauses.
4. **Optional SIMD and threads builds.** `--simd` and `--threads` are build flags. The docs note SIMD is experimental and threads need browser support. Our worker-based design does **not** depend on either, so it works with the standard prebuilt `opencv.js`.

**MDN key concepts** (useful vocabulary for the team):
- **Module**: a Wasm binary the browser has compiled into executable machine code.
- **Memory**: a growable `ArrayBuffer` of linear bytes (the Emscripten heap where every `cv.Mat`'s pixels live).
- **Table**: a growable array of references (for example to functions).
- **Instance**: a Module plus its runtime state (Memory, Tables, imports).
- JS ↔ Wasm: "the WebAssembly JavaScript API wraps exported WebAssembly code with JavaScript functions that can be called normally."

**Single-file vs split build.** By default OpenCV.js bundles the wasm **inside** `opencv.js` as base64 (one file). `--disable_single_file` "reduces total size by writing the WebAssembly code to a dedicated `.wasm` file", which the JS loads automatically. A split build is smaller to download and can stream-compile, but the server must send `application/wasm`. See [04-netlify-deployment.md](04-netlify-deployment.md).

## 2. Why every `cv.Mat` must be deleted

The official note (*Using OpenCV.js*):
> "You have to call delete method of cv.Mat to free memory allocated in Emscripten's heap."

And (*Basic Operations*):
> "Don't forget to delete cv.Mat, cv.MatVector and cnt (the Mat you get from MatVector) when you don't want to use them any more."

**Why.** The JS `cv.Mat` object is just a small handle. The pixel buffer lives in the Wasm linear memory, and **the JavaScript garbage collector does not know about it**. If you drop the handle without calling `.delete()`, those bytes are lost until the page or worker is torn down. One 12 MP RGBA photo is about 48 MB. A scan pipeline creates 8–10 intermediate Mats, so a few scans without deletes can fill the heap. Then you get `Cannot enlarge memory arrays` or "out of memory" aborts, or a tab that slowly gets heavier.

**What needs `.delete()`:**
- every `new cv.Mat()`, `cv.Mat.zeros/ones/eye`, `cv.matFromArray`, `cv.matFromImageData`, `cv.imread`, `mat.clone()`
- every `new cv.MatVector()`, **and every Mat returned by `matVector.get(i)`**
- Mats returned by functions such as `cv.getPerspectiveTransform`
- `cv.VideoCapture` frames you allocated
- (`cv.Size`, `cv.Point`, `cv.Scalar` are plain value objects in the JS bindings and don't need deleting.)

**Patterns we'll use:**

```js
// 1. try/finally with a tracker
const mats = [];
const T = m => (mats.push(m), m);
try {
  const gray = T(new cv.Mat());
  ...
} finally {
  for (const m of mats) if (!m.isDeleted()) m.delete();
}

// 2. Reuse Mats across webcam frames (allocate once, delete on stop)
```

**How to check for leaks.** Run 50 scans in a loop and watch the worker's memory in the DevTools **Memory** panel or Task Manager (Shift+Esc in Chrome). It should stay flat. If the heap only grows, a Mat is leaking.

## 3. Running OpenCV in a Web Worker so the page never freezes

**Why.** OpenCV calls are **synchronous**. A full-resolution Canny + warp + adaptiveThreshold can take hundreds of milliseconds on a phone. On the main thread that blocks clicks, scrolling and the camera preview. MDN: "Web Workers are a simple means for web content to run scripts in background threads. The worker thread can perform tasks without interfering with the user interface."

**What workers can and can't do (MDN):**
- ✅ `postMessage` / `onmessage`, `fetch`, **IndexedDB**, `importScripts()` (classic workers), `OffscreenCanvas`, `createImageBitmap`
- ❌ "you can't directly manipulate the DOM from inside a worker". So **`cv.imread`/`cv.imshow` (which take canvas/img elements) can't be used in the worker.** Use `cv.matFromImageData` and `ImageData` instead.

**Transferables = zero copy.** MDN: "Transferable objects are transferred from one context to another with a zero-copy operation, which results in a vast performance improvement when sending large data sets." `ArrayBuffer` and `ImageBitmap` are transferable:

```js
worker.postMessage({ type: 'scan', id, bitmap }, [bitmap]);          // main → worker
self.postMessage({ type: 'result', id, buf }, [buf]);                // worker → main (ArrayBuffer)
```

(`Blob`s are cheap to post too. They're passed by reference, not copied.)

**Loading opencv.js inside a classic worker:**

```js
// scanner.worker.js
self.Module = { onRuntimeInitialized: () => {} };        // harmless if the build is promise-style
importScripts('/vendor/opencv/4.13.0/opencv.js');

let cvp = (async () => {
  let c = self.cv;
  if (c instanceof Promise) c = await c;
  if (!c.Mat) await new Promise(r => (c.onRuntimeInitialized = r));
  self.cv = c;
  self.postMessage({ type: 'ready' });
  return c;
})();

self.onmessage = async (e) => {
  const cv = await cvp;
  const { type, id, bitmap, settings } = e.data;
  try {
    const osc = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = osc.getContext('2d');
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const src = cv.matFromImageData(ctx.getImageData(0, 0, osc.width, osc.height));
    let out;
    try { ({ out } = scanPage(src, settings)); } finally { src.delete(); }
    try {
      const outCanvas = new OffscreenCanvas(out.cols, out.rows);
      outCanvas.getContext('2d').putImageData(
        new ImageData(new Uint8ClampedArray(out.data), out.cols, out.rows), 0, 0);
      const blob = await outCanvas.convertToBlob({ type: 'image/png' });
      self.postMessage({ type: 'result', id, ok: true, blob });
    } finally { out.delete(); }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err?.message ?? err) });
  }
};
```

**Main-thread manager (timeouts plus restarting a stuck worker):**

```js
let worker, ready;
function start() {
  worker = new Worker('/scanner.worker.js');           // classic (needs importScripts)
  ready = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('OpenCV load timeout')), 30000);
    worker.addEventListener('message', e => { if (e.data.type === 'ready') { clearTimeout(t); res(); } });
  });
  worker.onerror = e => console.error('worker error', e.message);  // runtime errors (ErrorEvent)
}
function run(msg, transfer, ms = 20000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { worker.terminate(); start(); rej(new Error('Scan timed out; worker restarted')); }, ms);
    const onMsg = e => { if (e.data.id !== msg.id) return;
      clearTimeout(t); worker.removeEventListener('message', onMsg);
      e.data.type === 'error' ? rej(new Error(e.data.message)) : res(e.data); };
    worker.addEventListener('message', onMsg);
    worker.postMessage(msg, transfer);
  });
}
```

MDN: `worker.terminate()` means "The worker thread is killed immediately." That also throws away its whole Wasm heap, which is the easy way to recover from a leak or an infinite loop.

**Notes and gotchas**
- Use a **classic** worker (`new Worker(url)`), because `importScripts` isn't available in module workers. If the team wants ES modules, load opencv.js through `fetch` + `eval`, or use an ESM build. That's more complex.
- The worker downloads opencv.js itself, so the main page doesn't need to load it at all unless you want `cv.imshow` for previews. If both load it, the browser HTTP cache (see doc 04) keeps the second load cheap.
- Each worker has its **own** Wasm heap (about 8–10 MB of code plus the image heap). Use one long-lived worker. Don't create one per scan.

## Sources

- WebAssembly — <https://webassembly.org/>
- MDN, WebAssembly concepts — <https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts>
- MDN, `WebAssembly.instantiateStreaming()` — <https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static>
- OpenCV, Build OpenCV.js — <https://docs.opencv.org/4.13.0/d4/da1/tutorial_js_setup.html>
- OpenCV, Using OpenCV.js — <https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html>
- OpenCV, Basic Operations — <https://docs.opencv.org/4.13.0/de/d06/tutorial_js_basic_ops.html>
- MDN, Using Web Workers — <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers>
