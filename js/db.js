// Smart Document Scanner: IndexedDB library (owner: Ledger, indexeddb-expert).
//
// Database `docscanner`, versioned with an oldVersion ladder:
//   v1  scans    {keyPath:'id'}  index createdAt      (original + result + thumb Blobs, name, date)
//       settings {keyPath:'key'}
//   v2  scans    index name
//       history  {keyPath:'seq', autoIncrement}  index at   (what happened, for troubleshooting)
//
// Rules this file follows (indexeddb-versioned-schema skill):
//   - schema changes only in onupgradeneeded;
//   - onblocked / onversionchange handled so an upgrade never hangs the app;
//   - one transaction per user action; nothing non-IndexedDB is awaited inside a transaction
//     (Blobs are fully prepared before the write starts);
//   - transactions resolve on complete and reject on abort (e.g. QuotaExceededError).

export const DB_NAME = 'docscanner';
export const DB_VERSION = 2;

let dbPromise = null;          // one shared connection per page
let current = null;            // the open IDBDatabase, if any
const listeners = new Set();

/** Subscribe to connection events: 'blocked' | 'unblocked' | 'versionchange' | 'closed'. Returns an unsubscribe function. */
export function onDbEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit(type, detail) { for (const cb of listeners) { try { cb(type, detail); } catch (_) {} } }

function upgrade(db, tx, oldVersion) {
  if (oldVersion < 1) {
    const scans = db.createObjectStore('scans', { keyPath: 'id' });
    scans.createIndex('createdAt', 'createdAt');
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  if (oldVersion < 2) {
    tx.objectStore('scans').createIndex('name', 'name');
    const history = db.createObjectStore('history', { keyPath: 'seq', autoIncrement: true });
    history.createIndex('at', 'at');
  }
}

/** Open (or reuse) the connection. Resolves to an IDBDatabase. */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('This browser cannot save scans (IndexedDB is not available).')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    let wasBlocked = false;
    req.onupgradeneeded = (e) => upgrade(req.result, req.transaction, e.oldVersion);
    // Another tab still has an older version open. The request waits (it does not fail) until that tab closes.
    req.onblocked = () => { wasBlocked = true; emit('blocked'); };
    req.onsuccess = () => {
      const db = req.result;
      current = db;
      if (wasBlocked) emit('unblocked');
      // A newer version of the app (another tab) wants to upgrade: let it, and tell this page to reload.
      db.onversionchange = () => { db.close(); current = null; dbPromise = null; emit('versionchange'); };
      db.onclose = () => { current = null; dbPromise = null; emit('closed'); };   // browser closed it (e.g. storage cleared)
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open the scan library.'));
  });
  dbPromise.catch(() => { dbPromise = null; });   // allow a retry after a failure
  return dbPromise;
}

/** Run fn(tx) in one transaction; resolve with fn's value once the transaction COMPLETES. */
async function withTx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(stores, mode); } catch (e) { reject(e); return; }
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(friendly(tx.error) || new Error('The library change was cancelled.'));
    tx.onerror = () => {};   // do not preventDefault: the transaction must abort; onabort reports once
    try { value = fn(tx); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
  });
}

function friendly(err) {
  if (!err) return null;
  if (err.name === 'QuotaExceededError') {
    const e = new Error('Your device is out of space for scans. Delete some scans and try again.');
    e.name = 'QuotaExceededError';
    return e;
  }
  return err;
}

const reqValue = (req, box) => { req.onsuccess = () => { box.value = req.result; }; };

/**
 * Save a scan. rec = { name, original:Blob, result:Blob, thumb:Blob, width, height, corners, method, createdAt? }.
 * All Blobs must already exist (never await encoding inside the transaction). Resolves to the new id.
 */
export function addScan(rec) {
  for (const k of ['original', 'result', 'thumb']) {
    if (!(rec[k] instanceof Blob)) return Promise.reject(new TypeError(`addScan: ${k} must be a Blob`));
  }
  const id = (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = {
    id,
    name: String(rec.name || 'Scan').slice(0, 120),
    createdAt: rec.createdAt || Date.now(),
    original: rec.original, result: rec.result, thumb: rec.thumb,
    width: rec.width | 0, height: rec.height | 0,
    corners: rec.corners || null, method: rec.method || null,
  };
  return withTx(['scans', 'history'], 'readwrite', (tx) => {
    tx.objectStore('scans').add(record);
    tx.objectStore('history').add({ at: record.createdAt, action: 'saved', id, name: record.name });
    return id;
  });
}

/** All scans, newest first. Each record includes its Blobs (cheap: browsers store Blobs by reference). */
export function listScans() {
  const box = {};
  return withTx('scans', 'readonly', (tx) => {
    reqValue(tx.objectStore('scans').index('createdAt').getAll(), box);
  }).then(() => (box.value || []).reverse());
}

export function getScan(id) {
  const box = {};
  return withTx('scans', 'readonly', (tx) => { reqValue(tx.objectStore('scans').get(id), box); }).then(() => box.value || null);
}

export function countScans() {
  const box = {};
  return withTx('scans', 'readonly', (tx) => { reqValue(tx.objectStore('scans').count(), box); }).then(() => box.value || 0);
}

export function renameScan(id, name) {
  return withTx(['scans', 'history'], 'readwrite', (tx) => {
    const store = tx.objectStore('scans');
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      req.result.name = String(name || 'Scan').slice(0, 120);
      store.put(req.result);
      tx.objectStore('history').add({ at: Date.now(), action: 'renamed', id, name: req.result.name });
    };
  });
}

export function deleteScan(id) {
  return withTx(['scans', 'history'], 'readwrite', (tx) => {
    tx.objectStore('scans').delete(id);
    tx.objectStore('history').add({ at: Date.now(), action: 'deleted', id });
  });
}

export function getSetting(key, fallback) {
  const box = {};
  return withTx('settings', 'readonly', (tx) => { reqValue(tx.objectStore('settings').get(key), box); })
    .then(() => (box.value ? box.value.value : fallback));
}

export function setSetting(key, value) {
  return withTx('settings', 'readwrite', (tx) => { tx.objectStore('settings').put({ key, value }); });
}

/** Ask the browser not to evict the library under storage pressure. Resolves true/false. */
export async function requestPersistence() {
  try { return !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch (_) { return false; }
}

/** { usage, quota } in bytes, or null if unsupported. */
export async function estimateStorage() {
  try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (_) { return null; }
}

/**
 * "Reset app data": close our connection, delete the database, and wait.
 * If another tab keeps it open, emits 'blocked' (the delete finishes once that tab closes or reloads).
 * Also clears Cache Storage if the app ever used it. The caller reloads the page afterwards.
 */
export async function resetAppData() {
  if (current) { try { current.close(); } catch (_) {} }
  current = null;
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onblocked = () => emit('blocked', { during: 'reset' });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Could not delete the scan library.'));
  });
  try {
    if (self.caches && caches.keys) for (const k of await caches.keys()) await caches.delete(k);
  } catch (_) { /* Cache Storage is optional */ }
}
