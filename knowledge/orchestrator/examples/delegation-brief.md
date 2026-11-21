# Example: a good delegation brief

```
TO: wasm-expert (Forge)
GOAL: Run Iris's pipeline (js/pipeline.js) inside a Web Worker and expose a promise API to the page.
READ FIRST: knowledge/wasm-expert/**, docs/02-webassembly-memory-workers.md, js/pipeline.js, docs/ux-spec.md (states)
CONTRACT:
  - scanner.worker.js (classic worker) importScripts('vendor/opencv/4.12.0/opencv.js') then posts {type:'ready'}
  - js/scanner-client.js exports createScanner() -> { ready: Promise, scan(file|Blob, opts) -> Promise<{original, result, thumb, width, height, corners, ms}>, onProgress(cb), restart() }
  - progress messages: {type:'progress', id, stage:'finding'|'flattening'|'cleaning'|'encoding'}
CONSTRAINTS: no DOM in the worker; every cv.Mat deleted; 30 s load timeout; 30 s per-scan timeout with restart
RETURN: hand-off report + a Node or browser run showing a scan of samples/receipt.jpg and a flat heap across 20 scans
```
Why it's good: one goal, exact files, an exact interface, explicit constraints, and evidence required.
