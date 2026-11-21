# Web Workers and transferables

Sources: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers · https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static

- Create: `new Worker("worker.js")`. Communicate with `postMessage()` / `onmessage`, and the payload is in `event.data`.
- Classic workers can call `importScripts()` to load scripts (that's how we load opencv.js).
- "you can't directly manipulate the DOM from inside a worker". Workers **can** use IndexedDB and `fetch()`, and `OffscreenCanvas` exists for drawing.
- Transferables: "transferred from one context to another with a zero-copy operation" → `worker.postMessage(buf, [buf])`. `ImageBitmap` is transferable too.
- Errors: "When a runtime error occurs in the worker, its `onerror` event handler is called."
- `myWorker.terminate()`: "The worker thread is killed immediately." This frees its entire Wasm heap, so it's the last-resort recovery.
- `URL.createObjectURL` is available in workers (not service workers). Always `revokeObjectURL` when done.
