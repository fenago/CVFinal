---
name: indexeddb-versioned-schema
description: Design and evolve a versioned IndexedDB database safely. Use when creating stores/indexes, bumping versions, writing transactions, or debugging blocked upgrades, onversionchange, TransactionInactiveError or data missing after refresh.
---

# Versioned IndexedDB

- `indexedDB.open(name, version)`. Schema changes **only** inside `onupgradeneeded`. Use a ladder: `if (e.oldVersion < 1) {...} if (e.oldVersion < 2) {...}`.
- MDN: opening a higher version while other connections are open fires **`onblocked`** "until they are closed or reloaded". So:
  - every connection sets `db.onversionchange = () => { db.close(); /* tell user to reload */ }`
  - `request.onblocked` shows "Close other tabs of this app to finish updating".
- Transactions: `readonly` / `readwrite`. Group related writes in one transaction and resolve on `oncomplete`, reject on `onerror`/`onabort`.
- **Auto-commit:** never `await` non-IndexedDB work inside a transaction. Prepare Blobs first.
- Errors bubble request → transaction → database. A single `db.onerror` can log them all.
- Indexes: `store.createIndex('createdAt','createdAt')`; read newest-first with `index.openCursor(null,'prev')` or `getAll()` + sort.
- `indexedDB.deleteDatabase(name)` has its own `onblocked`. Close your own connection first.
