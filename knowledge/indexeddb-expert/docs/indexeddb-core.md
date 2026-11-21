# IndexedDB core

Sources: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API · https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB

- "IndexedDB is a low-level API for client-side storage of significant amounts of structured data, including files/blobs." It's transactional and object-oriented, and "any objects supported by the structured clone algorithm can be stored". It's asynchronous, same-origin, and "available in Web Workers".
- Open: `const request = indexedDB.open("MyTestDatabase", 3);` with `onerror`, `onsuccess` and `onupgradeneeded`. Schema changes happen in `onupgradeneeded` (a `versionchange` transaction).
- Stores: `db.createObjectStore("customers", { keyPath: "ssn" })` or `{ autoIncrement: true }`. Indexes: `objectStore.createIndex("email", "email", { unique: true })`.
- Transactions: `db.transaction(["customers"], "readwrite")`. Modes are `readonly`, `readwrite`, `versionchange`. Use `oncomplete` / `onerror`.
- CRUD: `add`, `put`, `get`, `delete`. Cursors: `openCursor()` → `cursor.continue()`.
- **Blocked:** "When you call open() with a greater version than the actual version of the database, all other open databases must explicitly acknowledge the request before you can start making changes to the database (an onblocked event is fired until they are closed or reloaded)."
- **Version change:** `db.onversionchange = () => { db.close(); /* ask user to reload */ }`.
- **Errors bubble:** request → transaction → database. A single `db.onerror` handler works. Unless handled with `stopPropagation()`, "the entire transaction is rolled back."
