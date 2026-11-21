// Node test for js/pipeline.js (Iris, opencv-expert). Run from the repo root:
//   node tools/test-pipeline.cjs            -> corner accuracy + timings on samples/*.jpg
//   node tools/test-pipeline.cjs --leak 30  -> also 30 repeated scans, Wasm heap must stay flat
// JPEGs are decoded with Python/PIL (Node has no image decoder) into raw RGBA.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const loadCv = require('./cv-node.cjs');
const P = require('../js/pipeline.js');

const ROOT = path.join(__dirname, '..');
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'ground-truth.json'), 'utf8'));
const outDir = process.env.OUT_DIR || path.join(ROOT, 'tests', 'output');

function decode(file) {
  const py = 'import sys;from PIL import Image,ImageOps;im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGBA");' +
    'sys.stdout.buffer.write(im.size[0].to_bytes(4,"little")+im.size[1].to_bytes(4,"little")+im.tobytes())';
  const buf = execFileSync('python3', ['-c', py, file], { maxBuffer: 1 << 28 });
  return { w: buf.readUInt32LE(0), h: buf.readUInt32LE(4), data: buf.subarray(8) };
}
function savePng(cv, mat, file) {
  const raw = Buffer.from(mat.data);
  const py = 'import sys;from PIL import Image;w,h=int(sys.argv[1]),int(sys.argv[2]);' +
    'Image.frombytes("RGBA",(w,h),sys.stdin.buffer.read()).convert("RGB").save(sys.argv[3])';
  execFileSync('python3', ['-c', py, String(mat.cols), String(mat.rows), file], { input: raw, maxBuffer: 1 << 28 });
}
function toMat(cv, img) {
  const m = new cv.Mat(img.h, img.w, cv.CV_8UC4);
  m.data.set(img.data);
  return m;
}

loadCv().then((cv) => {
  fs.mkdirSync(outDir, { recursive: true });
  let failures = 0;
  const imgs = {};
  for (const name of Object.keys(truth)) {
    const img = (imgs[name] = decode(path.join(ROOT, 'samples', name)));
    const src = toMat(cv, img);
    try {
      const t0 = Date.now();
      const r = P.scanDocument(cv, src, {}, () => {});
      const ms = Date.now() - t0;
      try {
        const gt = truth[name].corners;
        const diag = Math.hypot(img.w, img.h);
        const errs = r.corners.map((c, i) => Math.hypot(c[0] - gt[i][0], c[1] - gt[i][1]));
        const maxErrPct = (100 * Math.max(...errs)) / diag;
        const white = (() => { const g = new cv.Mat(); try { cv.cvtColor(r.clean, g, cv.COLOR_RGBA2GRAY); return cv.countNonZero(g) / (g.rows * g.cols); } finally { g.delete(); } })();
        const ok = r.method === 'contour' || r.method === 'mask';
        const pass = ok && maxErrPct < 2 && white > 0.8;
        if (!pass) failures++;
        console.log(`${name}: method=${r.method} corners=${JSON.stringify(r.corners.map((p) => p.map(Math.round)))} ` +
          `maxErr=${Math.max(...errs).toFixed(1)}px (${maxErrPct.toFixed(2)}% of diag) out=${r.clean.cols}x${r.clean.rows} ` +
          `white=${(white * 100).toFixed(1)}% time=${ms}ms -> ${pass ? 'PASS' : 'FAIL'}`);
        savePng(cv, r.clean, path.join(outDir, name.replace('.jpg', '-scan.png')));
      } finally { r.warped.delete(); r.clean.delete(); }
    } finally { src.delete(); }
  }

  // No page at all (plain gradient): must not throw, must fall back to the full image.
  {
    const blank = new cv.Mat(600, 800, cv.CV_8UC4, new cv.Scalar(120, 110, 100, 255));
    try {
      const r = P.scanDocument(cv, blank, {});
      const pass = r.method === 'full' && r.clean.cols > 0;
      if (!pass) failures++;
      console.log(`no-page image: method=${r.method} -> ${pass ? 'PASS (full-image fallback)' : 'FAIL'}`);
      r.warped.delete(); r.clean.delete();
    } finally { blank.delete(); }
  }

  const li = process.argv.indexOf('--leak');
  if (li > 0) {
    const n = Number(process.argv[li + 1] || 30);
    const heapMB = () => cv.HEAPU8.buffer.byteLength / 1048576;
    const names = Object.keys(imgs);
    const once = (i) => {
      const src = toMat(cv, imgs[names[i % names.length]]);
      try { const r = P.scanDocument(cv, src, {}); r.warped.delete(); r.clean.delete(); } finally { src.delete(); }
    };
    // The heap starts at 128 MB, so byteLength alone can hide leaks smaller than the headroom.
    // Probe (suggested by Forge in review): malloc a 16 MB block and read its address. Leaked
    // Mats stay allocated below it, so a leak pushes the probe address up.
    const probe = () => { const p = cv._malloc(16 << 20); cv._free(p); return p; };
    for (let i = 0; i < 4; i++) once(i);         // warm-up: heap grows to its working size
    const before = heapMB(), p0 = probe();
    for (let i = 0; i < n; i++) once(i);
    const after = heapMB(), p1 = probe();
    const flat = after <= before && p1 <= p0;
    if (!flat) failures++;
    console.log(`leak check: ${n} scans, Wasm heap ${before.toFixed(1)} MB -> ${after.toFixed(1)} MB, ` +
      `malloc probe ${p0} -> ${p1} (${p1 - p0} bytes) -> ${flat ? 'PASS (flat)' : 'FAIL (grew)'}`);
  }
  console.log(failures ? `FAILED (${failures})` : 'ALL PASS');
  process.exitCode = failures ? 1 : 0;
});
