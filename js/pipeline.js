/* Smart Document Scanner: vision pipeline (owner: Iris, opencv-expert).
 *
 * Pure OpenCV.js functions. No DOM, no worker plumbing. Works as:
 *   - a classic script in the worker:  importScripts('js/pipeline.js') -> self.DocPipeline
 *   - a CommonJS module in Node tests:  require('./js/pipeline.js')
 *
 * Memory rule (cv-mat-memory skill): every Mat/MatVector created here is
 * deleted in try/finally. Functions never delete their input. Functions that
 * return a Mat say "caller deletes".
 *
 * Steps: downscale -> gray -> blur -> edges -> contours -> 4-point polygon
 *        -> order corners -> warpPerspective -> illumination flatten
 *        -> adaptiveThreshold -> despeckle.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DocPipeline = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    detectMaxSide: 1000,   // long side used for page detection (speed)
    minAreaRatio: 0.12,    // a page must cover at least 12% of the photo
    maxAreaRatio: 0.985,   // ...and not be the whole frame border
    outputMaxSide: 2400,   // cap on the flattened page size
    mode: 'bw',            // 'bw' (crisp black & white) | 'gray' (shadow-free grayscale)
    blockSize: 25,         // adaptiveThreshold neighbourhood (odd)
    C: 12,                 // adaptiveThreshold constant
  };

  /** Helper: track Mats so one finally block frees them all. */
  function tracker() {
    const mats = [];
    const T = (m) => (mats.push(m), m);
    T.free = () => { for (const m of mats) if (m && !m.isDeleted()) m.delete(); mats.length = 0; };
    return T;
  }

  /** Order 4 points as TL, TR, BR, BL (sum / difference rule). */
  function orderCorners(pts) {
    const s = (p) => p[0] + p[1], d = (p) => p[1] - p[0];
    const pick = (f, better) => pts.reduce((a, b) => (better(f(b), f(a)) ? b : a));
    const tl = pick(s, (a, b) => a < b), br = pick(s, (a, b) => a > b);
    const tr = pick(d, (a, b) => a < b), bl = pick(d, (a, b) => a > b);
    // Degenerate (e.g. a 45-degree diamond can pick the same point twice): fall back to angle sort.
    const uniq = new Set([tl, tr, br, bl]);
    if (uniq.size === 4) return [tl, tr, br, bl].map((p) => [p[0], p[1]]);
    const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
    const sorted = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    // atan2 order starts near -PI (left); rotate so the first is the top-left-most by sum
    let start = 0;
    sorted.forEach((p, i) => { if (s(p) < s(sorted[start])) start = i; });
    return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]).map((p) => [p[0], p[1]]);
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function polyArea(q) {
    let a = 0;
    for (let i = 0; i < q.length; i++) { const p = q[i], n = q[(i + 1) % q.length]; a += p[0] * n[1] - n[0] * p[1]; }
    return Math.abs(a) / 2;
  }

  /** How rectangular a quad looks (1 = all right angles). */
  function rectangularity(q) {
    let worst = 1;
    for (let i = 0; i < 4; i++) {
      const p = q[i], a = q[(i + 3) % 4], b = q[(i + 1) % 4];
      const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
      const cos = Math.abs((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1));
      worst = Math.min(worst, 1 - cos);
    }
    return worst;
  }

  /**
   * Look through the external contours of a binary image for the best convex
   * 4-point polygon. Returns {quad, area} in the binary image's pixels, or null.
   * Also reports the largest contour (for the minAreaRect fallback).
   */
  function bestQuad(cv, binary, opts, frameArea) {
    const T = tracker();
    try {
      const contours = T(new cv.MatVector()), hierarchy = T(new cv.Mat());
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      let best = null, largest = null;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);            // new Mat: must delete
        const hull = new cv.Mat(), approx = new cv.Mat();
        try {
          const area = cv.contourArea(c);
          if (!largest || area > largest.area) {
            const r = cv.minAreaRect(c);
            const pts = cv.RotatedRect.points(r).map((p) => [p.x, p.y]);
            largest = { area, rectQuad: pts };
          }
          if (area < opts.minAreaRatio * frameArea || area > opts.maxAreaRatio * frameArea) continue;
          cv.convexHull(c, hull, false, true);
          const peri = cv.arcLength(hull, true);
          // Try a few tolerances: noisy edges need a looser fit.
          for (const eps of [0.02, 0.03, 0.045, 0.06]) {
            cv.approxPolyDP(hull, approx, eps * peri, true);
            if (approx.rows === 4) break;
          }
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
          const d = approx.data32S;
          const quad = [[d[0], d[1]], [d[2], d[3]], [d[4], d[5]], [d[6], d[7]]];
          const qa = polyArea(quad);
          const fill = area / (qa || 1);        // contour should fill its quad
          const rect = rectangularity(orderCorners(quad));
          if (fill < 0.85 || rect < 0.35) continue; // not page-like (cos > ~0.65 = angle < ~50deg)
          const score = qa * fill * (0.5 + 0.5 * rect);
          if (!best || score > best.score) best = { quad, area: qa, score };
        } finally {
          c.delete(); hull.delete(); approx.delete();
        }
      }
      return { best, largest };
    } finally {
      T.free();
    }
  }

  /**
   * Find the page. Input: RGBA (CV_8UC4) Mat at full resolution (not deleted).
   * Returns { corners: [[x,y] TL,TR,BR,BL] in input pixels, method, confidence }.
   *   method 'contour'     - 4 corners found from edges (best)
   *          'mask'        - 4 corners found from a bright-paper mask
   *          'minAreaRect' - rotated box around the largest shape (fallback)
   *          'full'        - whole image (last resort)
   */
  function detectDocument(cv, rgba, options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const T = tracker();
    try {
      const scale = Math.min(1, opts.detectMaxSide / Math.max(rgba.cols, rgba.rows));
      // Convert to gray first, then shrink: a quarter of the bytes to resize, and no full RGBA copy.
      const full = T(new cv.Mat()), gray = T(new cv.Mat()), blur = T(new cv.Mat()), edges = T(new cv.Mat());
      cv.cvtColor(rgba, full, cv.COLOR_RGBA2GRAY);
      if (scale < 1) cv.resize(full, gray, new cv.Size(Math.round(rgba.cols * scale), Math.round(rgba.rows * scale)), 0, 0, cv.INTER_AREA);
      else full.copyTo(gray);
      const small = gray;
      const frameArea = small.cols * small.rows;

      // Median blur removes table texture (wood grain, fabric weave) but keeps the page edge sharp.
      cv.medianBlur(gray, blur, 7);
      cv.GaussianBlur(blur, blur, new cv.Size(5, 5), 0);
      const kernel = T(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));

      let found = null, method = null, largest = null;

      // Strategy 1: Canny edges (a few threshold pairs), closed with a small dilation.
      for (const [lo, hi] of [[75, 200], [40, 120], [20, 70]]) {
        cv.Canny(blur, edges, lo, hi);
        cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
        const r = bestQuad(cv, edges, opts, frameArea);
        if (r.largest && (!largest || r.largest.area > largest.area)) largest = r.largest;
        if (r.best) { found = r.best; method = 'contour'; break; }
      }

      // Strategy 2: the page is the bright region. Otsu threshold + morphology.
      if (!found) {
        const mask = T(new cv.Mat()), k2 = T(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
        cv.threshold(blur, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, k2);
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k2);
        const r = bestQuad(cv, mask, opts, frameArea);
        if (r.largest && (!largest || r.largest.area > largest.area)) largest = r.largest;
        if (r.best) { found = r.best; method = 'mask'; }
      }

      let quad;
      if (found) quad = found.quad;
      else if (largest && largest.area >= opts.minAreaRatio * frameArea && largest.area <= opts.maxAreaRatio * frameArea) { quad = largest.rectQuad; method = 'minAreaRect'; }
      else { quad = [[0, 0], [small.cols - 1, 0], [small.cols - 1, small.rows - 1], [0, small.rows - 1]]; method = 'full'; }

      const corners = orderCorners(quad).map(([x, y]) => [
        Math.min(rgba.cols - 1, Math.max(0, x / scale)),
        Math.min(rgba.rows - 1, Math.max(0, y / scale)),
      ]);
      const confidence = method === 'contour' ? 0.95 : method === 'mask' ? 0.8 : method === 'minAreaRect' ? 0.4 : 0;
      return { corners, method, confidence };
    } finally {
      T.free();
    }
  }

  /** Flatten the page. Returns a new RGBA Mat (caller deletes). */
  function warpDocument(cv, rgba, corners, options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const [tl, tr, br, bl] = corners;
    let W = Math.max(dist(tl, tr), dist(bl, br));
    let H = Math.max(dist(tl, bl), dist(tr, br));
    const k = Math.min(1, opts.outputMaxSide / Math.max(W, H));
    W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
    const T = tracker();
    try {
      const srcPts = T(cv.matFromArray(4, 1, cv.CV_32FC2, [...tl, ...tr, ...br, ...bl]));
      const dstPts = T(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W - 1, 0, W - 1, H - 1, 0, H - 1]));
      const M = T(cv.getPerspectiveTransform(srcPts, dstPts));
      const out = new cv.Mat();                                   // caller deletes
      try {
        cv.warpPerspective(rgba, out, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
      } catch (e) { out.delete(); throw e; }
      return out;
    } finally {
      T.free();
    }
  }

  /**
   * Clean the flattened page. Removes shadows/uneven light by dividing by a
   * blurred background estimate, then (mode 'bw') adaptive threshold + despeckle.
   * Returns a new RGBA Mat (caller deletes).
   */
  function cleanDocument(cv, rgba, options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const T = tracker();
    try {
      const gray = T(new cv.Mat()), bg = T(new cv.Mat()), flat = T(new cv.Mat());
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
      // Background (paper + lighting) estimate: close away the dark text, then blur heavily.
      const kSize = Math.max(15, (Math.round(Math.min(gray.cols, gray.rows) / 40) | 1));
      const kernel = T(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kSize, kSize)));
      cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, kernel);
      cv.GaussianBlur(bg, bg, new cv.Size(0, 0), kSize / 2);
      cv.divide(gray, bg, flat, 255);                              // ~255 on paper, darker on ink
      const out = new cv.Mat();                                    // caller deletes
      try {
        if (opts.mode === 'gray') {
          const norm = T(new cv.Mat());
          cv.normalize(flat, norm, 0, 255, cv.NORM_MINMAX);
          cv.cvtColor(norm, out, cv.COLOR_GRAY2RGBA);
        } else {
          const bw = T(new cv.Mat());
          let block = Math.max(3, opts.blockSize | 0); if (block % 2 === 0) block += 1;
          cv.adaptiveThreshold(flat, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, opts.C);
          cv.medianBlur(bw, bw, 3);                               // remove salt-and-pepper speckles
          // The outermost pixels often hold a sliver of table: paint a thin white frame.
          const m = Math.max(2, Math.round(Math.min(bw.cols, bw.rows) * 0.006));
          cv.rectangle(bw, new cv.Point(0, 0), new cv.Point(bw.cols - 1, bw.rows - 1), new cv.Scalar(255), m * 2);
          cv.cvtColor(bw, out, cv.COLOR_GRAY2RGBA);
        }
      } catch (e) { out.delete(); throw e; }
      return out;
    } finally {
      T.free();
    }
  }

  /**
   * Full pipeline. onStage(stage) is called with 'finding' | 'flattening' | 'cleaning'.
   * Returns { corners, method, confidence, warped, clean } - caller deletes warped and clean.
   * options.corners (optional) skips detection (user-adjusted corners).
   */
  function scanDocument(cv, rgba, options, onStage) {
    const stage = typeof onStage === 'function' ? onStage : () => {};
    stage('finding');
    const det = options && options.corners
      ? { corners: orderCorners(options.corners), method: 'manual', confidence: 1 }
      : detectDocument(cv, rgba, options);
    stage('flattening');
    const warped = warpDocument(cv, rgba, det.corners, options);
    let clean;
    try {
      stage('cleaning');
      clean = cleanDocument(cv, warped, options);
    } catch (e) { warped.delete(); throw e; }
    return { corners: det.corners, method: det.method, confidence: det.confidence, warped, clean };
  }

  return { DEFAULTS, orderCorners, detectDocument, warpDocument, cleanDocument, scanDocument };
});
