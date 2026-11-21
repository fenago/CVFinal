// Worked example: show that forgetting delete() grows the WebAssembly heap,
// and that try/finally cleanup keeps it flat.
// Run from the repo root:  node knowledge/wasm-expert/examples/02-leak-check.cjs
const loadCv = require('../../../tools/cv-node.cjs');

loadCv().then((cv) => {
  const heapMB = () => (cv.HEAPU8.buffer.byteLength / 1048576).toFixed(1);
  const oneScan = (cleanUp) => {
    const src = new cv.Mat(1200, 900, cv.CV_8UC4, new cv.Scalar(200, 200, 200, 255)); // ~4.3 MB
    const gray = new cv.Mat(), blur = new cv.Mat();
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    } finally {
      if (cleanUp) { src.delete(); gray.delete(); blur.delete(); }
    }
  };

  console.log('start heap', heapMB(), 'MB');
  for (let i = 0; i < 40; i++) oneScan(true);
  const afterClean = heapMB();
  console.log('after 40 scans WITH delete():   ', afterClean, 'MB');
  for (let i = 0; i < 40; i++) oneScan(false);
  const afterLeak = heapMB();
  console.log('after 40 scans WITHOUT delete():', afterLeak, 'MB  <- leaked; only terminating the worker frees it');
  console.log(Number(afterLeak) > Number(afterClean) ? 'PASS (leak demonstrated, cleanup flat)' : 'UNEXPECTED');
});
