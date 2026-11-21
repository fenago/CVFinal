// scanner.worker.js skeleton: classic worker, load once, always reply, free Mats.
self.importScripts('vendor/opencv/4.12.0/opencv.js');
const cvReady = (async () => {
  let c = self.cv;
  if (c && typeof c.then === 'function' && !c.Mat) c = await new Promise((r) => c.then((m) => r(m)));
  if (!c.Mat) await new Promise((r) => (c.onRuntimeInitialized = r));
  if (typeof c.then === 'function') delete c.then;   // avoid thenable re-resolution loops
  self.cv = c; self.postMessage({ type: 'ready' }); return c;
})().catch((e) => self.postMessage({ type: 'fatal', message: String(e) }));

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const cv = await cvReady;
    if (type !== 'scan') throw new Error('unknown message ' + type);
    const bmp = data.bitmap;                                   // transferred ImageBitmap
    const oc = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = oc.getContext('2d'); ctx.drawImage(bmp, 0, 0); bmp.close();
    const src = cv.matFromImageData(ctx.getImageData(0, 0, oc.width, oc.height));
    try {
      /* ... call the pipeline, encode result with convertToBlob ... */
      self.postMessage({ type: 'result', id, ok: true });
    } finally { src.delete(); }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) });
  }
};
