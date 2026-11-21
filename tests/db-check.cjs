// Ledger's storage check (indexeddb-expert): real Chromium IndexedDB.
// Run from the repo root:  node tests/db-check.cjs   (own static server on :8094)
// Checks: schema v2 via the ladder (v1 -> v2 upgrade keeps data), Blobs round-trip, survives reload,
// delete, blocked upgrade is reported and then completes, versionchange closes the old tab,
// resetAppData deletes everything (and reports 'blocked' while another tab holds it open).
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 8094);
const ROOT = path.join(__dirname, '..');
const URL = `http://127.0.0.1:${PORT}/tests/db-harness.html`;

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  let failures = 0;
  const check = (name, ok, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(URL); await p.waitForFunction(() => window.__db);
    return p;
  };
  try {
    // 1. An "old app version" (v1 schema, written by hand) with one record: the v2 ladder must keep it.
    const a = await open();
    await a.evaluate(() => new Promise((res, rej) => {
      const r = indexedDB.open('docscanner', 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('scans', { keyPath: 'id' }); s.createIndex('createdAt', 'createdAt'); r.result.createObjectStore('settings', { keyPath: 'key' }); };
      r.onsuccess = () => { const tx = r.result.transaction('scans', 'readwrite');
        tx.objectStore('scans').add({ id: 'old-1', name: 'From v1', createdAt: 1, original: new Blob(['a']), result: new Blob(['b']), thumb: new Blob(['c']) });
        tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    }));
    const up = await a.evaluate(async () => {
      const db = await window.__db.openDB();
      return { version: db.version, stores: [...db.objectStoreNames], indexes: [...db.transaction('scans').objectStore('scans').indexNames], n: await window.__db.countScans() };
    });
    check('v1 -> v2 upgrade keeps data', up.version === 2 && up.stores.includes('history') && up.indexes.includes('name') && up.n === 1, JSON.stringify(up));

    // 2. Add with real image Blobs, list newest first, Blob types survive.
    const added = await a.evaluate(async () => {
      const c = new OffscreenCanvas(40, 30); c.getContext('2d').fillRect(0, 0, 10, 10);
      const png = await c.convertToBlob({ type: 'image/png' }), jpg = await c.convertToBlob({ type: 'image/jpeg' });
      const id = await window.__db.addScan({ name: 'Receipt test', original: jpg, result: png, thumb: jpg, width: 40, height: 30, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], method: 'contour' });
      const list = await window.__db.listScans();
      return { id, names: list.map((r) => r.name), types: [list[0].original.type, list[0].result.type], size: list[0].result.size };
    });
    check('addScan + listScans (newest first, Blobs intact)', added.names[0] === 'Receipt test' && added.types[1] === 'image/png' && added.size > 0, JSON.stringify(added));

    // 3. Survives reload.
    await a.reload(); await a.waitForFunction(() => window.__db);
    const afterReload = await a.evaluate(async () => (await window.__db.listScans()).map((r) => r.name));
    check('library survives reload', afterReload.length === 2 && afterReload[0] === 'Receipt test', JSON.stringify(afterReload));

    // 4. Delete.
    const afterDelete = await a.evaluate(async (id) => { await window.__db.deleteScan(id); return window.__db.countScans(); }, added.id);
    check('deleteScan', afterDelete === 1, `count=${afterDelete}`);

    // 5. Blocked upgrade: tab B holds the DB open and ignores versionchange (like an old app version).
    const b = await open();
    await b.evaluate(() => new Promise((res) => { const r = indexedDB.open('docscanner'); r.onsuccess = () => { window.__raw = r.result; res(); }; }));
    await a.evaluate(() => { window.__db.onDbEvent(() => {}); });
    // Close a's own connection, then try to open a higher version from a fresh page using a patched DB_VERSION.
    const c = await ctx.newPage();
    c.on('pageerror', (e) => errors.push(String(e)));
    await c.goto(URL); await c.waitForFunction(() => window.__db);
    await a.close();
    const blockedP = c.evaluate(() => new Promise((res) => {
      const events = [];
      const r = indexedDB.open('docscanner', 3);    // simulates the next app version
      r.onblocked = () => events.push('blocked');
      r.onsuccess = () => { events.push('success v' + r.result.version); r.result.close(); res(events); };
    }));
    await new Promise((r) => setTimeout(r, 500));
    await b.evaluate(() => window.__raw.close());   // the old tab goes away
    const blocked = await blockedP;
    check('blocked upgrade reported, then completes', blocked[0] === 'blocked' && blocked[1] === 'success v3', JSON.stringify(blocked));

    // 5b. Same, but through db.js: an old tab holds v1 open, db.js asks for v2 -> emits 'blocked', then 'unblocked'.
    await c.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('docscanner'); r.onsuccess = res; }));
    const old = await ctx.newPage();
    await old.goto(URL);
    await old.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('docscanner', 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('scans', { keyPath: 'id' }); s.createIndex('createdAt', 'createdAt'); r.result.createObjectStore('settings', { keyPath: 'key' }); };
      r.onsuccess = () => { window.__raw = r.result; res(); };   // no onversionchange: an old app version
    }));
    const e = await open();
    const openP = e.evaluate(async () => { const db = await window.__db.openDB(); return { v: db.version, events: window.__events.slice() }; });
    await new Promise((r) => setTimeout(r, 500));
    const midEvents = await e.evaluate(() => window.__events.slice());
    await old.evaluate(() => window.__raw.close());
    const opened = await openP;
    check('db.js reports blocked upgrade, then unblocks', midEvents.includes('blocked') && opened.v === 2 && opened.events.includes('unblocked'), `during=${JSON.stringify(midEvents)} after=${JSON.stringify(opened)}`);
    await e.evaluate(() => window.__db.resetAppData());
    await e.close(); await old.close();

    // 6. Our own connection handles versionchange: it closes itself and emits the event.
    //    (DB is now v3; db.js asks for v2, which is lower -> VersionError. Reset first to get back to a clean v2.)
    const vc = await c.evaluate(async () => {
      await window.__db.openDB();
      const r = indexedDB.open('docscanner', 4);
      return await new Promise((res) => {
        let blocked = false;
        r.onblocked = () => { blocked = true; };
        r.onsuccess = () => { r.result.close(); res({ events: window.__events.slice(), blocked }); };
      });
    });
    check('versionchange closes our connection (no blocking)', vc.events.includes('versionchange') && !vc.blocked, JSON.stringify(vc));

    // 7. resetAppData while another tab holds the DB: emits 'blocked', finishes when that tab closes.
    await c.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('docscanner'); r.onsuccess = res; }));
    const d = await open();
    await d.evaluate(async () => { await window.__db.addScan({ name: 'x', original: new Blob(['1']), result: new Blob(['2']), thumb: new Blob(['3']) }); });
    const holder = await ctx.newPage();
    await holder.goto(URL);
    await holder.evaluate(() => new Promise((res) => { const r = indexedDB.open('docscanner'); r.onsuccess = () => { window.__raw = r.result; res(); }; }));
    const resetP = d.evaluate(async () => { window.__events.length = 0; await window.__db.resetAppData(); return window.__events.slice(); });
    await new Promise((r) => setTimeout(r, 500));
    await holder.evaluate(() => window.__raw.close());
    const resetEvents = await resetP;
    const remaining = await d.evaluate(async () => (await indexedDB.databases()).map((x) => x.name));
    check('resetAppData reports blocked, then deletes the DB', resetEvents.includes('blocked') && !remaining.includes('docscanner'), `events=${JSON.stringify(resetEvents)} dbs=${JSON.stringify(remaining)}`);

    check('no console errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    failures++; console.log('FAIL  exception', e);
  } finally {
    await browser.close(); server.kill();
  }
  console.log(failures ? `FAILED (${failures})` : 'ALL PASS');
  process.exitCode = failures ? 1 : 0;
})();
