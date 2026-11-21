// Loads the vendored opencv.js in Node.js and resolves to a ready `cv` object.
// Used by knowledge examples and quick pipeline checks outside the browser.
const path = require('path');

module.exports = function loadCv(file = path.join(__dirname, '..', 'vendor', 'opencv', '4.12.0', 'opencv.js')) {
  let cv = require(file);
  return new Promise((resolve) => {
    const done = (c) => {
      // Some builds return a "thenable" Module; strip `then` so `await` can't loop on it.
      if (c && typeof c.then === 'function') { try { delete c.then; } catch (_) { c.then = undefined; } }
      resolve(c);
    };
    if (cv && cv.Mat) return done(cv);
    if (cv instanceof Promise) return cv.then(done);
    if (cv && typeof cv.then === 'function') return cv.then((m) => done(m));
    cv.onRuntimeInitialized = () => done(cv);
  });
};

if (require.main === module) {
  const t0 = Date.now();
  module.exports().then((cv) => {
    console.log('ready in', Date.now() - t0, 'ms');
    console.log(cv.getBuildInformation().split('\n').filter((l) => /OpenCV|Emscripten|SIMD|Threads|Version/i.test(l)).slice(0, 8).join('\n'));
  });
}
