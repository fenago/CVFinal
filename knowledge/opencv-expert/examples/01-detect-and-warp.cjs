// Worked example: find a tilted "page" in a synthetic photo, flatten it, and
// clean it with adaptiveThreshold. Every Mat is freed in finally.
// Run from the repo root:  node knowledge/opencv-expert/examples/01-detect-and-warp.cjs
const loadCv = require('../../../tools/cv-node.cjs');

function orderCorners(pts) { // pts: [[x,y] x4] -> [TL, TR, BR, BL]
  const sum = (p) => p[0] + p[1], diff = (p) => p[1] - p[0];
  const by = (f, best) => pts.reduce((a, b) => (best(f(b), f(a)) ? b : a));
  return [by(sum, (a, b) => a < b), by(diff, (a, b) => a < b), by(sum, (a, b) => a > b), by(diff, (a, b) => a > b)];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

loadCv().then((cv) => {
  const mats = []; const T = (m) => (mats.push(m), m);
  try {
    // 1. Synthetic photo: dark table (800x600 RGBA) with a light page drawn as a tilted quad + "text" lines.
    const truth = [[180, 90], [610, 130], [570, 540], [140, 500]];
    const src = T(new cv.Mat(600, 800, cv.CV_8UC4, new cv.Scalar(60, 50, 40, 255)));
    const poly = T(cv.matFromArray(4, 1, cv.CV_32SC2, truth.flat()));
    const polys = T(new cv.MatVector()); polys.push_back(poly);
    cv.fillPoly(src, polys, new cv.Scalar(235, 232, 225, 255));
    for (let y = 170; y < 470; y += 30) cv.line(src, new cv.Point(220, y), new cv.Point(520, y + 10), new cv.Scalar(30, 30, 30, 255), 3);

    // 2. Find the page.
    const gray = T(new cv.Mat()), blur = T(new cv.Mat()), edges = T(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 75, 200);
    const contours = T(new cv.MatVector()), hierarchy = T(new cv.Mat());
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let quad = null, best = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i); // NEW Mat: must delete
      const approx = new cv.Mat();
      try {
        const area = cv.contourArea(c);
        if (area < 0.15 * src.rows * src.cols || area <= best) continue;
        cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const d = approx.data32S; quad = [[d[0], d[1]], [d[2], d[3]], [d[4], d[5]], [d[6], d[7]]]; best = area;
        }
      } finally { c.delete(); approx.delete(); }
    }
    if (!quad) throw new Error('no page found');
    const [tl, tr, br, bl] = orderCorners(quad);
    const err = Math.max(...[tl, tr, br, bl].map((p, i) => dist(p, truth[i])));
    console.log('corners TL,TR,BR,BL =', JSON.stringify([tl, tr, br, bl]), 'max error px =', err.toFixed(1));

    // 3. Flatten.
    const W = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const H = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
    const srcPts = T(cv.matFromArray(4, 1, cv.CV_32FC2, [...tl, ...tr, ...br, ...bl]));
    const dstPts = T(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W - 1, 0, W - 1, H - 1, 0, H - 1]));
    const M = T(cv.getPerspectiveTransform(srcPts, dstPts));
    const warped = T(new cv.Mat());
    cv.warpPerspective(src, warped, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    // 4. Clean up to black & white.
    const wg = T(new cv.Mat()), bw = T(new cv.Mat());
    cv.cvtColor(warped, wg, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(wg, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);
    const white = cv.countNonZero(bw) / (bw.rows * bw.cols);
    console.log(`warped ${W}x${H}, white ratio ${(white * 100).toFixed(1)}% (page should be mostly white)`);
    if (err > 6 || white < 0.8) { console.error('FAIL'); process.exitCode = 1; } else console.log('PASS');
  } finally {
    mats.forEach((m) => m.delete());
  }
});
