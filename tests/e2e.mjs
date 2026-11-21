// End-to-end test of the Smart Document Scanner (owner: Vera, qa-engineer).
//
// Run from the repo root:   node tests/e2e.mjs
// It starts tools/serve-netlify.py (a static server that applies netlify.toml's headers,
// including the Content-Security-Policy) and drives headless Chromium with Playwright.
// Screenshots go to docs/qa/ (deviceScaleFactor 1). Exit code 0 = all checks passed.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'docs', 'qa');
const truth = JSON.parse(readFileSync(path.join(ROOT, 'samples', 'ground-truth.json'), 'utf8'));
mkdirSync(SHOTS, { recursive: true });
mkdirSync(path.join(ROOT, 'tests', 'output'), { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, name), ...opts });

const server = spawn('python3', [path.join(ROOT, 'tools', 'serve-netlify.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const browser = await chromium.launch({
  // A fake camera so the optional webcam path can be tested headless.
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] ${e.message}`));
  return page;
}

/** Read the newest record's metadata straight from IndexedDB (DevTools-equivalent check). */
const newestRecord = (page) => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('docscanner');
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('scans').objectStore('scans').index('createdAt').getAll();
    q.onsuccess = () => {
      const all = q.result; const s = all[all.length - 1]; db.close();
      res(s ? { name: s.name, method: s.method, corners: s.corners, width: s.width, height: s.height,
        types: [s.original.type, s.result.type, s.thumb.type], count: all.length } : null);
    };
    q.onerror = () => rej(q.error);
  };
}));

/** Fraction of white pixels in the result image shown on the page (page-shaped, mostly white scan). */
const whiteness = (page) => page.evaluate(async () => {
  const img = document.querySelector('#result-img');
  await img.decode();
  const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight); const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let white = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200) white++;
  return { white: white / (d.length / 4), w: c.width, h: c.height };
});

function cornerError(sample, corners) {
  const gt = truth[sample].corners; const diag = Math.hypot(truth[sample].width, truth[sample].height);
  return (100 * Math.max(...corners.map((c, i) => Math.hypot(c[0] - gt[i][0], c[1] - gt[i][1])))) / diag;
}

async function scanUpload(page, file, sample, shotName) {
  await page.setInputFiles('#file-input', path.join(ROOT, 'samples', file));
  const sawWorking = await page.waitForSelector('body[data-state="working"]', { timeout: 5000 }).then(() => true, () => false);
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  await page.waitForTimeout(300);
  if (shotName) await shot(page, shotName);
  const rec = await newestRecord(page);
  const w = await whiteness(page);
  const err = cornerError(sample, rec.corners);
  check(`scan ${file}: 4-corner detection (not fallback)`, rec.method === 'contour' || rec.method === 'mask',
    `method=${rec.method}, max corner error ${err.toFixed(2)}% of diagonal`);
  check(`scan ${file}: corners within 2% of the true page`, err < 2, `corners=${JSON.stringify(rec.corners.map((p) => p.map(Math.round)))}`);
  check(`scan ${file}: result is a clean page`, w.white > 0.8 && w.h > w.w, `${w.w}x${w.h}, ${(w.white * 100).toFixed(1)}% white`);
  check(`scan ${file}: saved to IndexedDB with Blobs`, rec.types.join() === 'image/jpeg,image/png,image/jpeg', `types=${rec.types.join(',')}, name="${rec.name}"`);
  return { rec, sawWorking };
}

try {
  // ------------------------------------------------------------ 1. load + OpenCV ready
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const page = watch(await ctx.newPage(), 'main');
  const t0 = Date.now();
  await page.goto(BASE + '/');
  await shot(page, '01-loading.png');
  const loadingState = await page.getAttribute('body', 'data-state');
  await page.waitForSelector('body[data-state="ready"]', { timeout: 30000 });
  check('loading state shown, then OpenCV ready', loadingState === 'loading', `ready after ${Date.now() - t0} ms`);
  await shot(page, '02-ready-empty.png');

  // ------------------------------------------------------------ 2. both samples, real uploads
  const r1 = await scanUpload(page, 'receipt.jpg', 'receipt.jpg', '04-done-receipt.png');
  check('working state is shown during a scan', r1.sawWorking);

  // Responsiveness during the second scan: rAF gaps + long tasks on the main thread.
  await page.evaluate(() => {
    window.__perf = { frames: 0, maxGap: 0, long: [] };
    let last = performance.now();
    const tick = (t) => { window.__perf.frames++; window.__perf.maxGap = Math.max(window.__perf.maxGap, t - last); last = t; if (!window.__perf.stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
  });
  const t1 = Date.now();
  await page.setInputFiles('#file-input', path.join(ROOT, 'samples', 'letter.jpg'));
  await page.waitForSelector('body[data-state="working"]', { timeout: 5000 }).catch(() => {});
  await shot(page, '03-working.png');
  // Click something while the scan runs: the UI must answer at once.
  const clickMs = await page.evaluate(() => new Promise((res) => {
    const t = performance.now(); const b = document.querySelector('.nav-link');
    b.addEventListener('focus', () => res(Math.round(performance.now() - t)), { once: true }); b.focus();
  }));
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  const perf = await page.evaluate(() => { window.__perf.stop = true; return window.__perf; });
  const maxLong = Math.max(0, ...perf.long);
  check('main thread stays responsive during a scan', perf.maxGap < 150 && maxLong < 150 && clickMs < 50,
    `${perf.frames} frames in ${Date.now() - t1} ms, longest frame gap ${Math.round(perf.maxGap)} ms, long tasks [${perf.long.join(', ')}] ms, focus answered in ${clickMs} ms`);
  await page.waitForTimeout(300);
  await shot(page, '05-done-letter.png');
  const rec2 = await newestRecord(page);
  const w2 = await whiteness(page);
  const err2 = cornerError('letter.jpg', rec2.corners);
  check('scan letter.jpg: 4-corner detection (not fallback)', rec2.method === 'contour' || rec2.method === 'mask', `method=${rec2.method}, max corner error ${err2.toFixed(2)}% of diagonal`);
  check('scan letter.jpg: corners within 2% of the true page', err2 < 2, `corners=${JSON.stringify(rec2.corners.map((p) => p.map(Math.round)))}`);
  check('scan letter.jpg: result is a clean page', w2.white > 0.8, `${w2.w}x${w2.h}, ${(w2.white * 100).toFixed(1)}% white`);

  const cards = await page.locator('#library li[data-scan-id]').count();
  const firstCard = await page.locator('#library li[data-scan-id]').first().innerText();
  check('library lists both scans with name + date', cards === 2 && /Letter/.test(firstCard) && /\d{4}/.test(firstCard), JSON.stringify(firstCard.replace(/\s+/g, ' ')));

  // ------------------------------------------------------------ 3. reload persistence
  await page.reload();
  await page.waitForSelector('body[data-state="ready"]', { timeout: 30000 });
  const cardsAfter = await page.locator('#library li[data-scan-id]').count();
  const dbs = await page.evaluate(() => indexedDB.databases());
  check('library survives reload (IndexedDB)', cardsAfter === 2, `cards=${cardsAfter}, databases=${JSON.stringify(dbs)}`);
  await shot(page, '06-library-after-reload.png', { fullPage: true });

  // Open from library, rename, reload, still renamed.
  await page.click('#library li[data-scan-id] >> nth=1 >> .open-btn');
  await page.waitForSelector('body[data-state="done"]');
  await page.fill('#name-input', 'Grocery receipt');
  await page.press('#name-input', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('#library .name')].some((n) => n.textContent === 'Grocery receipt'));
  await page.reload(); await page.waitForSelector('body[data-state="ready"]');
  const renamed = await page.locator('#library .name', { hasText: 'Grocery receipt' }).count();
  check('open from library + rename persists', renamed === 1);

  // ------------------------------------------------------------ 4. delete (+ undo)
  await page.click('#library li[data-scan-id] >> nth=0 >> .delete-btn');
  await page.waitForSelector('#toast-undo');
  const afterDelete = await page.locator('#library li[data-scan-id]').count();
  await page.click('#toast-undo');
  await page.waitForFunction(() => document.querySelectorAll('#library li[data-scan-id]').length === 2);
  check('delete removes a card; Undo restores it', afterDelete === 1);
  await page.click('#library li[data-scan-id] >> nth=0 >> .delete-btn');
  await page.waitForFunction(() => document.querySelectorAll('#library li[data-scan-id]').length === 1);
  await page.reload(); await page.waitForSelector('body[data-state="ready"]');
  check('delete persists after reload', (await page.locator('#library li[data-scan-id]').count()) === 1);

  // ------------------------------------------------------------ 5. error path: not an image
  const bogus = path.join(ROOT, 'tests', 'output'); mkdirSync(bogus, { recursive: true });
  writeFileSync(path.join(bogus, 'not-a-photo.jpg'), 'this is not an image');
  await page.setInputFiles('#file-input', path.join(bogus, 'not-a-photo.jpg'));
  await page.waitForSelector('body[data-state="error"]', { timeout: 10000 });
  const errText = await page.textContent('#status');
  const hasRecovery = await page.locator('#choose-another-btn').isVisible();
  await shot(page, '07-error-not-an-image.png');
  check('non-image shows an error with a recovery action', /isn't a photo/.test(errText) && hasRecovery, errText.trim());
  // Recover: scan a real photo after the error.
  await page.setInputFiles('#file-input', path.join(ROOT, 'samples', 'receipt.jpg'));
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  check('app recovers after an error', true);

  // ------------------------------------------------------------ 6. sample button + optional camera
  await page.click('#again-btn').catch(() => {});
  await page.keyboard.press('Escape');      // close the file chooser that "Scan Another" opens (headless: no-op)
  await page.waitForSelector('body[data-state="ready"]');
  await page.click('#sample-letter');
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  const sampleRec = await newestRecord(page);
  check('"Try a sample" button scans the bundled letter', sampleRec.name.startsWith('Letter') && sampleRec.method === 'contour', `name="${sampleRec.name}"`);

  // Cancel mid-scan: worker restarts, nothing is saved, the next scan works.
  const countBeforeCancel = await page.locator('#library li[data-scan-id]').count();
  await page.setInputFiles('#file-input', path.join(ROOT, 'samples', 'letter.jpg'));
  await page.waitForSelector('#cancel-btn', { timeout: 5000 });
  await page.click('#cancel-btn');
  await page.waitForSelector('body[data-state="ready"]', { timeout: 30000 });
  const countAfterCancel = await page.locator('#library li[data-scan-id]').count();
  check('Cancel during a scan restarts the scanner and saves nothing', countAfterCancel === countBeforeCancel, `${countBeforeCancel} -> ${countAfterCancel} scans`);

  await page.click('#camera-btn');
  await page.waitForSelector('#camera-capture:not([disabled])', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, '11-camera-sheet.png');
  const before = (await newestRecord(page)).count;
  await page.click('#camera-capture');
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  await page.waitForFunction((n) => document.querySelectorAll('#library li[data-scan-id]').length === n + 1, before);
  const camRec = await newestRecord(page);
  const camTracksStopped = await page.evaluate(() => !document.querySelector('#camera-video').srcObject);
  check('webcam capture (fake camera) scans and saves; camera released', camRec.count === before + 1 && camTracksStopped,
    `method=${camRec.method} (a synthetic test pattern has no page, so a fallback is expected)`);
  if (camRec.method === 'full' || camRec.method === 'minAreaRect') {
    const notice = await page.locator('#fallback-notice').isVisible();
    check('fallback notice shown when corners are not found', notice);
  }

  // ------------------------------------------------------------ 7. Wasm heap: repeated scans, no growth
  const heap = await page.evaluate(async () => {
    const blobs = await Promise.all(['samples/receipt.jpg', 'samples/letter.jpg'].map(async (u) => (await fetch(u)).blob()));
    const once = async (i) => { const bmp = await createImageBitmap(blobs[i % 2], { imageOrientation: 'from-image' }); await window.__scanner.scan(bmp, {}); };
    for (let i = 0; i < 3; i++) await once(i);
    const a = await window.__scanner.stats();
    for (let i = 0; i < 20; i++) await once(i);
    const b = await window.__scanner.stats();
    return { a, b };
  });
  check('20 repeated scans: no Wasm heap growth (no leaked Mats)',
    heap.b.heapBytes <= heap.a.heapBytes && heap.b.probe <= heap.a.probe,
    `heap ${heap.a.heapBytes / 1048576} MB -> ${heap.b.heapBytes / 1048576} MB; 16 MB malloc probe address ${heap.a.probe} -> ${heap.b.probe}`);

  // ------------------------------------------------------------ 8. blocked DB upgrade + versionchange (two tabs)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const oldTab = watch(await ctx2.newPage(), 'old-tab');
  await oldTab.goto(BASE + '/samples/ground-truth.json');
  await oldTab.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('docscanner', 1);     // an "old app version" that never closes its connection
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('scans', { keyPath: 'id' }); s.createIndex('createdAt', 'createdAt'); r.result.createObjectStore('settings', { keyPath: 'key' }); };
    r.onsuccess = () => { window.__raw = r.result; res(); };
  }));
  const newTab = watch(await ctx2.newPage(), 'new-tab');
  await newTab.goto(BASE + '/');
  await newTab.waitForSelector('#banner:not([hidden])', { timeout: 10000 });
  const bannerText = await newTab.textContent('#banner-text');
  await shot(newTab, '08-blocked-upgrade-banner.png');
  await oldTab.evaluate(() => window.__raw.close());
  await newTab.waitForSelector('#banner[hidden]', { state: 'attached', timeout: 10000 });
  await newTab.waitForSelector('body[data-state="ready"]', { timeout: 30000 });
  check('blocked upgrade: banner shown, clears when the old tab closes', /another tab/.test(bannerText), bannerText);
  // A future version (v3) opened elsewhere: our tab closes its connection and offers Reload.
  await oldTab.evaluate(() => new Promise((res) => { const r = indexedDB.open('docscanner', 3); r.onsuccess = () => { r.result.close(); res(); }; }));
  await newTab.waitForSelector('#banner:not([hidden])', { timeout: 10000 });
  const vcText = await newTab.textContent('#banner-text');
  check('versionchange: old tab steps aside and offers Reload', /updated in another tab/.test(vcText) && await newTab.locator('#banner-btn').isVisible(), vcText);
  await ctx2.close();

  // ------------------------------------------------------------ 9. Reset app data
  await page.click('#reset-btn');
  await page.waitForSelector('#reset-confirm[open]');
  await shot(page, '09-reset-confirm.png');
  await page.click('#reset-cancel');
  const stillThere = await page.locator('#library li[data-scan-id]').count();
  check('reset confirmation: Cancel keeps the library', stillThere > 0, `${stillThere} scans kept`);
  await page.click('#reset-btn');
  await page.waitForSelector('#reset-confirm[open]');
  await Promise.all([page.waitForEvent('load'), page.click('#reset-ok')]);
  await page.waitForSelector('body[data-state="ready"]', { timeout: 30000 });
  const afterReset = await page.locator('#library li[data-scan-id]').count();
  const libHidden = await page.locator('#library-section').isHidden();
  await shot(page, '10-after-reset.png');
  check('Reset app data empties the library and the app still works', afterReset === 0 && libHidden);
  await page.click('#sample-receipt');
  await page.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  check('scan works again after reset', (await page.locator('#library li[data-scan-id]').count()) === 1);
  await ctx.close();

  // ------------------------------------------------------------ 10. visual checks: dark, phone, explainer
  const dark = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const dp = watch(await dark.newPage(), 'dark');
  await dp.goto(BASE + '/'); await dp.waitForSelector('body[data-state="ready"]');
  await dp.click('#sample-receipt'); await dp.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  await dp.waitForTimeout(300); await shot(dp, '12-dark-done.png');
  await dark.close();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const pp = watch(await phone.newPage(), 'phone');
  await pp.goto(BASE + '/'); await pp.waitForSelector('body[data-state="ready"]');
  await shot(pp, '13a-phone-ready.png');
  await pp.click('#sample-letter'); await pp.waitForSelector('body[data-state="done"]', { timeout: 60000 });
  await pp.waitForTimeout(300); await shot(pp, '13b-phone-done.png', { fullPage: true });
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('phone layout (390 px): no horizontal overflow', !overflow);
  await pp.goto(BASE + '/how-it-works.html');
  await shot(pp, '14-how-it-works-phone.png', { fullPage: true });
  const howText = await pp.textContent('main');
  check('How it works page explains OpenCV.js, WebAssembly and IndexedDB', /OpenCV\.js/.test(howText) && /WebAssembly/.test(howText) && /IndexedDB/.test(howText));
  await phone.close();

  // ------------------------------------------------------------ 11. production headers seen by the browser
  const hp = watch(await (await browser.newContext()).newPage(), 'headers');
  const resp = await hp.goto(BASE + '/vendor/opencv/4.12.0/opencv.js');
  const h = resp.headers();
  check('vendor cache header is long + immutable', /max-age=31536000/.test(h['cache-control']) && /immutable/.test(h['cache-control']), h['cache-control']);
  const hr = await hp.goto(BASE + '/');
  check('HTML is no-cache and the CSP is active', hr.headers()['cache-control'] === 'no-cache' && /wasm-unsafe-eval/.test(hr.headers()['content-security-policy'] || ''));

  check('zero console errors across all pages', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) {
  check('test run completed without exceptions', false, e.stack || String(e));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(path.join(ROOT, 'tests', 'output', 'e2e-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — ${failed.length} FAILED` : ''}`);
process.exitCode = failed.length ? 1 : 0;
