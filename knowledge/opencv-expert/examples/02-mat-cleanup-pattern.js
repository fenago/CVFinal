// Pattern: track every allocation, free everything in finally, return ownership explicitly.
export function toBlackAndWhite(cv, rgba, { blockSize = 25, C = 12 } = {}) {
  const mats = []; const T = (m) => (mats.push(m), m);
  try {
    const gray = T(new cv.Mat());
    const bw = T(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(gray, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize | 1, C);
    const out = new cv.Mat();            // NOT tracked: ownership passes to the caller
    cv.cvtColor(bw, out, cv.COLOR_GRAY2RGBA);
    return out;                          // caller must call out.delete()
  } finally {
    mats.forEach((m) => m.delete());
  }
}
