/* Smart Document Scanner: classic Web Worker (owner: Forge, wasm-expert).
 *
 * - Loads opencv.js (WebAssembly, single-file build) exactly once, here, off the main thread.
 * - Runs Iris's pipeline (js/pipeline.js) on a transferred ImageBitmap.
 * - Encodes the original, the clean scan and a thumbnail to Blobs with OffscreenCanvas.
 * - No DOM in here: no cv.imread / cv.imshow. Every Mat is deleted before any await.
 *
 * Protocol (see docs/handoff-log.md, "Fixed interface contracts"):
 *   worker -> main  {type:'ready', version} | {type:'fatal', message}
 *                   {type:'progress', id, stage} | {type:'result', id, ...} | {type:'error', id, message}
 *   main -> worker  {type:'scan', id, bitmap, options}  (bitmap in the transfer list)
 *                   {type:'stats', id}
 */
'use strict';

const OPENCV_URL = 'vendor/opencv/4.12.0/opencv.js';
const THUMB_MAX = 360;
const MAX_SOURCE_SIDE = 3200;   // Iris's review: cap huge photos (50 MP = 200 MB of RGBA) before they reach the Wasm heap

let loadError = null;
try {
  self.importScripts(OPENCV_URL, 'js/pipeline.js');
} catch (e) {
  loadError = e;
}

/** Resolve the cv object whatever style the build uses (Promise, thenable Module, or onRuntimeInitialized). */
const cvReady = (async () => {
  if (loadError) throw loadError;
  let c = self.cv;
  if (!c) throw new Error('opencv.js loaded but did not define cv');
  // The 4.12.0 build returns a "thenable" Emscripten Module whose then() hands back the Module itself.
  // Resolving a Promise with a thenable makes the Promise call then() again, forever. So strip `then`
  // from the Module BEFORE resolving with it (or before returning it from an async function).
  const unthen = (m) => { if (m && typeof m.then === 'function') { try { delete m.then; } catch (_) {} if (typeof m.then === 'function') m.then = undefined; } return m; };
  if (c instanceof Promise) c = await c.then((m) => ({ m: unthen(m) })).then((box) => box.m);
  else if (typeof c.then === 'function') c = await new Promise((resolve) => c.then((m) => resolve({ m: unthen(m) }))).then((box) => box.m);
  if (!c.Mat) await new Promise((resolve) => { c.onRuntimeInitialized = resolve; });
  unthen(c);
  if (typeof c.Mat !== 'function') throw new Error('OpenCV runtime did not initialise');
  self.cv = c;
  return c;
})();

cvReady.then(
  (cv) => {
    const m = /OpenCV\s+(\d+\.\d+\.\d+)/.exec(cv.getBuildInformation ? cv.getBuildInformation() : '');
    self.postMessage({ type: 'ready', version: m ? m[1] : 'unknown' });
  },
  (err) => self.postMessage({ type: 'fatal', message: 'Could not load OpenCV: ' + (err && err.message ? err.message : String(err)) }),
);

/** Wasm heap numbers for the leak check. probe = address of a fresh 16 MB block: leaked Mats push it up. */
function heapStats(cv) {
  let probe = -1;
  if (typeof cv._malloc === 'function') { const p = cv._malloc(16 << 20); probe = p; cv._free(p); }
  return { heapBytes: cv.HEAPU8.buffer.byteLength, probe };
}

/** Copy an RGBA Mat's pixels out of the Wasm heap into an ImageData (safe to keep after delete()). */
function matToImageData(mat) {
  return new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows);
}

async function handleScan(cv, id, data) {
  const t0 = performance.now();
  const options = data.options || {};
  const bmp = data.bitmap;
  if (!bmp || !bmp.width || !bmp.height) throw new Error('No image was received.');
  const progress = (stage) => self.postMessage({ type: 'progress', id, stage });

  // 1. Pixels: ImageBitmap -> OffscreenCanvas -> ImageData -> Mat.
  const shrink = Math.min(1, MAX_SOURCE_SIDE / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * shrink), H = Math.round(bmp.height * shrink);
  const photo = new OffscreenCanvas(W, H);
  const pctx = photo.getContext('2d', { willReadFrequently: true });
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(bmp, 0, 0, W, H);
  bmp.close();                                         // free the transferred bitmap's memory now

  let cleanImage, corners, method, confidence;
  const src = cv.matFromImageData(pctx.getImageData(0, 0, W, H));
  try {
    const r = self.DocPipeline.scanDocument(cv, src, options, progress);
    try {
      cleanImage = matToImageData(r.clean);            // copy out before the Mats are deleted
      corners = r.corners; method = r.method; confidence = r.confidence;
    } finally {
      r.warped.delete();
      r.clean.delete();
    }
  } finally {
    src.delete();
  }
  // No Mat is alive past this point, so the awaits below cannot leak Wasm memory.

  // 2. Encode Blobs (original photo as JPEG, scan as PNG or JPEG, small JPEG thumbnail).
  progress('encoding');
  const out = new OffscreenCanvas(cleanImage.width, cleanImage.height);
  out.getContext('2d').putImageData(cleanImage, 0, 0);
  const k = Math.min(1, THUMB_MAX / Math.max(out.width, out.height));
  const thumbCanvas = new OffscreenCanvas(Math.max(1, Math.round(out.width * k)), Math.max(1, Math.round(out.height * k)));
  const tctx = thumbCanvas.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(out, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const resultType = options.mode === 'gray' ? 'image/jpeg' : 'image/png';
  const [original, result, thumb] = await Promise.all([
    photo.convertToBlob({ type: 'image/jpeg', quality: 0.9 }),
    out.convertToBlob(resultType === 'image/jpeg' ? { type: resultType, quality: 0.92 } : { type: resultType }),
    thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 }),
  ]);

  return {
    type: 'result', id, original, result, thumb,
    width: cleanImage.width, height: cleanImage.height,
    sourceWidth: W, sourceHeight: H,
    corners, method, confidence,
    ms: Math.round(performance.now() - t0),
    ...heapStats(cv),
  };
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    const cv = await cvReady;
    if (data.type === 'scan') {
      self.postMessage(await handleScan(cv, id, data));     // Blobs are passed by reference
    } else if (data.type === 'stats') {
      self.postMessage({ type: 'stats', id, ...heapStats(cv) });
    } else {
      throw new Error('Unknown message type: ' + data.type);
    }
  } catch (err) {
    if (data.bitmap && typeof data.bitmap.close === 'function') { try { data.bitmap.close(); } catch (_) {} }
    self.postMessage({ type: 'error', id, message: err && err.message ? err.message : String(err) });
  }
};
