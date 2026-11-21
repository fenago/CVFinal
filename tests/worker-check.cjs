// Forge's runtime check (wasm-expert): real Chromium, real worker, real opencv.js.
// Run from the repo root:  node tests/worker-check.cjs   (starts its own static server on :8091)
// Checks: OpenCV loads once in the worker; both samples scan with 4-corner detection;
// main thread keeps painting during a scan; 20 repeated scans leave the Wasm heap flat.
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 8091);
const ROOT = path.join(__dirname, '..');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  let failures = 0;
  const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    let opencvRequests = 0;
    page.on('request', (r) => { if (r.url().includes('opencv.js')) opencvRequests++; });

    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/tests/worker-harness.html`);
    await page.waitForFunction(() => /^(ready|failed)/.test(document.getElementById('log').textContent), null, { timeout: 60000 });
    const log = await page.textContent('#log');
    check('OpenCV ready in worker', log.startsWith('ready'), `${log} in ${Date.now() - t0} ms`);

    for (const s of ['receipt.jpg', 'letter.jpg']) {
      const r = await page.evaluate((u) => window.__scanUrl(u), `../samples/${s}`);
      check(`scan ${s}`, r.method === 'contour' || r.method === 'mask',
        `method=${r.method} out=${r.width}x${r.height} ${r.ms} ms blobs=${r.sizes.join('/')} ${r.types.join(',')}`);
    }

    // Huge photo (8000x6000 = 48 MP, made by upscaling the receipt): must be capped, not crash the heap.
    const big = await page.evaluate(async () => {
      const src = await createImageBitmap(await (await fetch('../samples/receipt.jpg')).blob());
      const c = new OffscreenCanvas(6000, 8000); c.getContext('2d').drawImage(src, 0, 0, 6000, 8000);
      const bmp = c.transferToImageBitmap();
      const r = await window.__scanner.scan(bmp, {});
      return { method: r.method, sourceWidth: r.sourceWidth, sourceHeight: r.sourceHeight, ms: r.ms };
    });
    check('48 MP photo is capped and scans', big.method === 'contour' && Math.max(big.sourceWidth, big.sourceHeight) <= 3200,
      `source used ${big.sourceWidth}x${big.sourceHeight}, method=${big.method}, ${big.ms} ms`);

    // Responsiveness: count animation frames and the longest gap between them while a scan runs.
    const resp = await page.evaluate(async () => {
      let frames = 0, last = performance.now(), maxGap = 0, run = true;
      const tick = (t) => { frames++; maxGap = Math.max(maxGap, t - last); last = t; if (run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const t0 = performance.now();
      await window.__scanUrl('../samples/letter.jpg');
      run = false;
      return { frames, maxGap: Math.round(maxGap), ms: Math.round(performance.now() - t0) };
    });
    check('main thread responsive during scan', resp.maxGap < 200, `${resp.frames} frames in ${resp.ms} ms, longest gap ${resp.maxGap} ms`);

    // Leak check: warm up, then 20 scans; heap size and malloc probe must not grow.
    for (let i = 0; i < 3; i++) await page.evaluate((u) => window.__scanUrl(u), '../samples/receipt.jpg');
    const before = await page.evaluate(() => window.__scanner.stats());
    for (let i = 0; i < 20; i++) await page.evaluate((u) => window.__scanUrl(u), i % 2 ? '../samples/letter.jpg' : '../samples/receipt.jpg');
    const after = await page.evaluate(() => window.__scanner.stats());
    check('no Wasm heap growth over 20 scans', after.heapBytes <= before.heapBytes && after.probe <= before.probe,
      `heap ${before.heapBytes / 1048576} MB -> ${after.heapBytes / 1048576} MB, probe ${before.probe} -> ${after.probe}`);

    check('opencv.js fetched once', opencvRequests === 1, `${opencvRequests} request(s)`);
    check('no console errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    failures++;
    console.log('FAIL  exception', e);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures ? `FAILED (${failures})` : 'ALL PASS');
  process.exitCode = failures ? 1 : 0;
})();
