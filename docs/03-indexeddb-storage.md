# 03 — Storing Scans, Settings and History in IndexedDB

## 1. Why IndexedDB

MDN: "IndexedDB is a low-level API for client-side storage of significant amounts of structured data, including files/blobs." Key properties:

- **Transactional.** "IndexedDB is a transactional database system … you … retrieve and update data within a series of transactions."
- **Object store, not tables.** You can store anything the *structured clone* algorithm supports, and that includes **`Blob` and `File`**. Store the scan image as a `Blob`. Don't use base64 strings (they're about 33% bigger and slow to encode).
- **Asynchronous.** "Operations performed using IndexedDB are done asynchronously, so as not to block applications."
- **Same-origin.** Data belongs to the site's origin (for example `https://<site>.netlify.app`). A different Netlify URL, such as a deploy preview, gets a **separate, empty** library.
- **Works in Web Workers** ("This feature is available in Web Workers").

`localStorage` isn't suitable here. It holds strings only, it's synchronous, and it's limited to a few MB.

## 2. Proposed schema (database `docscanner`, version 1)

| Store | keyPath | Indexes | Record shape |
|---|---|---|---|
| `scans` | `id` (UUID via `crypto.randomUUID()`) | `createdAt`, `title`, `tags` (multiEntry) | `{id, title, createdAt, updatedAt, width, height, mode:'bw'|'gray'|'color', corners:[[x,y]×4], image: Blob, thumb: Blob, original?: Blob, sizeBytes, tags:[]}` |
| `settings` | `key` | — | `{key:'scan', blockSize:21, C:10, mode:'bw', keepOriginal:false}`, `{key:'ui', theme:'auto'}` |
| `history` | `autoIncrement` | `ts`, `scanId` | `{ts, action:'create'|'rename'|'delete'|'export', scanId, details}` |

Optional optimisation: keep the large Blobs in a separate `blobs` store keyed by `scanId`. Then listing the library only reads small metadata records.

## 3. Opening, versions and upgrades

```js
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('docscanner', 1);

    req.onupgradeneeded = (event) => {             // runs only when version increases
      const db = req.result;
      const old = event.oldVersion;                // 0 on first install
      if (old < 1) {
        const scans = db.createObjectStore('scans', { keyPath: 'id' });
        scans.createIndex('createdAt', 'createdAt');
        scans.createIndex('title', 'title');
        scans.createIndex('tags', 'tags', { multiEntry: true });
        db.createObjectStore('settings', { keyPath: 'key' });
        const hist = db.createObjectStore('history', { autoIncrement: true });
        hist.createIndex('ts', 'ts');
        hist.createIndex('scanId', 'scanId');
      }
      // if (old < 2) { ...future migration... }
    };

    req.onblocked = () => {
      // Another tab still has an older version open — see doc 05.
      showBanner('Please close other tabs of this app to finish updating.');
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {                 // a newer tab wants to upgrade
        db.close();
        showBanner('A new version is ready. Please reload.');
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}
```

Rules from MDN *Using IndexedDB*:
- `indexedDB.open(name, version)`: the version is an integer. Schema changes (`createObjectStore`, `createIndex`, `deleteObjectStore`) are **only** allowed inside `onupgradeneeded`, which runs in a special `versionchange` transaction.
- "When you call `open()` with a greater version than the actual version of the database, all other open databases must explicitly acknowledge the request before you can start making changes to the database (an `onblocked` event is fired until they are closed or reloaded)."
- So **every** connection must handle `onversionchange` by calling `db.close()`. MDN's example does exactly that and asks the user to reload.
- Use the `if (oldVersion < N)` ladder so users who skip a version still get every migration.

## 4. Transactions

- Modes: `readonly` (default; several can run at once), `readwrite` (serialised per store), `versionchange` (upgrades only).
- Group related writes in **one** transaction so they succeed or fail together. Example: save the scan **and** its history row:

```js
export function saveScan(db, scan) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['scans', 'history'], 'readwrite');
    tx.objectStore('scans').put(scan);
    tx.objectStore('history').add({ ts: Date.now(), action: 'create', scanId: scan.id });
    tx.oncomplete = () => resolve(scan.id);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
```

- **Transactions auto-commit** once there are no pending requests and control goes back to the event loop. **Don't `await` unrelated async work** (like `fetch` or `canvas.toBlob`) inside a transaction, or it commits early and the next request throws `TransactionInactiveError`. Produce the Blobs **first**, then open the transaction. (This follows from IndexedDB's auto-commit behaviour and is a very common bug.)
- Error bubbling (MDN): "Error events are targeted at the request that generated the error, then the event bubbles to the transaction, and then finally to the database object." A single `db.onerror` can log everything. Unless you call `stopPropagation()`/`preventDefault()`, "the entire transaction is rolled back."
- CRUD: `add()` (fails if the key exists), `put()` (insert or replace), `get(key)`, `delete(key)`, `getAll()`, `index('createdAt').openCursor(null, 'prev')` for newest-first lists.

Cursor example (MDN):

```js
objectStore.openCursor().onsuccess = (event) => {
  const cursor = event.target.result;
  if (cursor) { /* use cursor.value */ cursor.continue(); }
};
```

A small promise wrapper (or the tiny `idb` library) keeps the code readable. Either is fine for a static site.

## 5. Displaying stored Blobs

```js
const url = URL.createObjectURL(scan.thumb);   // <img src=url>
// when the card is removed:
URL.revokeObjectURL(url);
```

Export: `<a download="scan.png" href=URL.createObjectURL(scan.image)>`. To make a multi-page PDF later you'd need a library such as jsPDF (out of scope for this research).

## 6. Storage limits, persistence and eviction

From MDN *Storage quotas and eviction criteria*:

| Browser | Per-origin quota |
|---|---|
| Chrome / Chromium | Up to **60% of total disk size** (best-effort and persistent alike) |
| Firefox | Best-effort: smaller of **10% of disk** or **10 GiB** (group limit). Persistent: up to **50% of disk**, capped at 8 TiB |
| Safari (macOS 14 / iOS 17+) | About **60% of disk** per origin for the browser app (all origins together capped at 80%). Earlier Safari: 1 GiB, then it asks the user |

- **Best-effort vs persistent.** By default data is *best-effort*. Under storage pressure the browser evicts whole origins, **least recently used first**. Ask for persistence:

```js
if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
  await navigator.storage.persist();   // Chrome grants this based on engagement / installed PWA
}
const { usage, quota } = await navigator.storage.estimate();   // show "Using 34 MB of 2 GB"
```

- **Quota exceeded.** Writes fail with **`QuotaExceededError`**. Catch it in `tx.onabort`/`onerror` and tell the user to delete old scans.
- **Safari's 7-day rule.** With tracking prevention on, Safari deletes script-written storage for an origin that has had no user interaction in the last 7 days of browser use. Document this, and offer "Export all" as a backup.
- **Size budget.** A 2,500×3,500 B/W page saved as PNG is typically a few hundred KB. JPEG at 0.85 quality works better for gray or color modes. Keep a small thumbnail (about 300 px) for the grid. (These are our estimates; measure them in the app.)

## 7. Settings and history

- `settings` is read once at start-up (`get('scan')`) and written on change (`put`). Fall back to defaults when a key is missing.
- `history` is append-only (the `autoIncrement` key gives ordering). Trim it to the last N entries (for example 500) with a cursor on the `ts` index so it can't grow forever.

## Sources

- MDN, IndexedDB API — <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- MDN, Using IndexedDB — <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- MDN, Storage quotas and eviction criteria — <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
