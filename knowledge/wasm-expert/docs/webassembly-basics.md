# WebAssembly basics

Sources: https://webassembly.org/ · https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts · https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static · https://docs.opencv.org/4.13.0/d4/da1/tutorial_js_setup.html

- webassembly.org: "WebAssembly (abbreviated Wasm) is a binary instruction format for a stack-based virtual machine. Wasm is designed as a portable compilation target for programming languages".
- MDN: "a low-level assembly-like language with a compact binary format that runs with near-native performance".
- Concepts (MDN): **Module** ("a WebAssembly binary that has been compiled by the browser into executable machine code"), **Memory** ("A growable buffer that contains the linear array of bytes"), **Table**, **Instance** ("A Module paired with all the state it uses at runtime").
- JS ↔ Wasm: "the WebAssembly JavaScript API wraps exported WebAssembly code with JavaScript functions that can be called normally".
- `WebAssembly.instantiateStreaming()` "compiles and instantiates a WebAssembly module directly from a streamed underlying source", which is the most efficient path. "If the response has an incorrect MIME type (instead of `application/wasm`), the promise rejects with a TypeError."
- OpenCV.js build flags: `--build_wasm` (default), `--simd` (experimental), `--threads`, `--disable_single_file` ("writing the WebAssembly code to a dedicated .wasm file" instead of base64 in the JS).
- Our build: single file, no threads → no `.wasm` request, no COOP/COEP needed. Heap starts at 128 MB and grows (measured: `cv.HEAPU8.buffer.byteLength`).
