---
name: wasm-static-serving
description: How to serve opencv.js and WebAssembly from a static host. Use when configuring MIME types (application/wasm), caching, file size, compression or a split vs single-file opencv build.
---

# Serving Wasm statically

- MDN `instantiateStreaming`: a wrong MIME type "instead of `application/wasm`" makes the promise reject with a `TypeError`. Serve any `.wasm` as `application/wasm`.
- The default opencv.js is a **single file** with the Wasm embedded as base64 (no separate .wasm request). It's about 10–11 MB raw and about 3.5 MB gzip on the wire.
- Netlify guidance: keep individual deploy files at or under ~10 MB. Single-file opencv.js is at the edge, so document it. The fix is a split (`--disable_single_file`) or trimmed custom build.
- **Do not upload pre-compressed .br/.gz.** Netlify compresses again, and you get `CompileError: expected magic word 00 61 73 6d`.
- Cache: versioned path (`vendor/opencv/4.12.0/`) → `Cache-Control: public, max-age=31536000, immutable`. HTML → `no-cache`.
- A threads build needs COOP/COEP (SharedArrayBuffer). We use the non-threaded build, so these aren't needed.
