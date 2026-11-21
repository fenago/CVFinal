# 05 — Why the App Can Hang, and How to Fix It in Chrome DevTools

## Part A — Why a browser app like this can hang

| # | Symptom | Likely cause | Prevention in code |
|---|---|---|---|
| 1 | "Loading OpenCV…" spinner never ends | opencv.js failed to download (404, wrong path), the wasm failed to compile (wrong MIME, double-compressed file; see doc 04), or the code waits for `onRuntimeInitialized` that already fired | Detect readiness with the helper in doc 01. Set a 30 s timeout with an error message. Listen to `worker.onerror`. |
| 2 | A scan never finishes, spinner forever | **Stuck worker**: an exception that's never posted back, an infinite loop, or a huge image that takes a very long time | Wrap the handler in `try/catch` and always reply. Downscale before detection. Use a per-job timeout → `worker.terminate()` + restart. |
| 3 | Whole page freezes, clicks ignored | OpenCV running on the **main thread** (synchronous Wasm calls block the UI) | All CV work in the worker. Main thread only does UI. |
| 4 | Gets slower and slower, then the tab crashes ("Aw, Snap!" / out of memory) or the console shows `Cannot enlarge memory arrays` / `abort(OOM)` | **Memory leak**: `cv.Mat`s not deleted (Wasm heap only grows), object URLs never revoked, webcam streams never stopped | `try/finally` deletes (doc 02). `URL.revokeObjectURL`. `track.stop()` on camera close. Restart the worker after N scans if needed. |
| 5 | App stuck on "Opening library…" after an update | **Blocked IndexedDB upgrade**: another tab still holds the old DB version open, so `open()` fires `onblocked` and waits | Every connection handles `onversionchange` → `db.close()`. Handle `onblocked` with a "close other tabs" banner. |
| 6 | Saves fail silently, library empty after reload | `QuotaExceededError`, transaction auto-committed early (`TransactionInactiveError`), private/incognito window, or data evicted (best-effort storage, Safari 7-day rule) | Handle `tx.onabort`. Don't `await` inside a transaction. Call `navigator.storage.persist()`. Offer export. |
| 7 | Old behaviour after a deploy | Browser or service-worker cache serving a stale `app.js`/worker | `no-cache`/revalidate for app files (doc 04). Update service workers carefully. |
| 8 | Webcam black or permission error | Not HTTPS, permission denied, or another app/tab using the camera | Serve over HTTPS (Netlify does). Catch `getUserMedia` errors. Show instructions. |

## Part B — How a user fixes it in Chrome DevTools

Open DevTools with **F12**, or **Ctrl+Shift+I** (Windows/Linux) / **Cmd+Option+I** (macOS). Then open the **Application** tab. (If you can't see it, use the `»` overflow menu.)

### B1. Look at the scan library (IndexedDB)

From the official *View and change IndexedDB data* guide:

1. Click the **Application** tab to open the **Application** panel.
2. Expand the **IndexedDB** menu to see which databases are available. (For us: `docscanner`.)
3. Click a database to see its **origin and version number**. A version mismatch here explains a blocked upgrade.
4. Click an object store (`scans`, `settings`, `history`) to see its key-value pairs. **Total entries** shows the count. **Key generator value** is the next auto-increment key (in `history`).
5. Click an index (for example `createdAt`) to sort the store by that index.
6. Click a cell in the **Value** column to expand a record. Blobs show as Blob entries.
7. **The data does not update in real time.** Click **Refresh** (object store) or **Refresh database** after the app writes.

### B2. Delete one broken scan or reset settings

1. View the object store.
2. Click the key-value pair you want to delete. It turns blue when selected.
3. Press **Delete** or click **Delete Selected**.

To reset all settings: open the `settings` store → **Clear object store**.

### B3. Delete the whole database (fixes a corrupted or stuck schema)

1. View the `docscanner` database.
2. Click **Delete database**.
3. **Close other tabs of the app first.** A delete, like an upgrade, is blocked while another tab holds a connection. Then reload. The app recreates an empty version-1 database.

### B4. Clear site data (the "factory reset")

The **Application → Storage** pane shows a usage breakdown (IndexedDB, Cache Storage, service workers) and lets you clear everything:

1. Open **Application → Storage**.
2. Make sure the **IndexedDB** checkbox is checked. To fix stale-code problems, also check **Cache storage** and **Unregister service workers**.
3. Click **Clear site data**.
4. Reload the page (hard reload: **Ctrl+Shift+R** / **Cmd+Shift+R**).

⚠️ This **permanently deletes all saved scans** for that origin. Export anything important first.

### B5. Check storage usage and test low-quota behaviour

- **Application → Storage** shows how much the origin uses compared with its quota.
- Check **Simulate custom storage quota** and enter a small number (for example 5 MB) to test that the app handles `QuotaExceededError` properly. (Added in Chrome 88.)

### B6. Diagnose a stuck worker or loading problem

- **Console:** errors from the worker show up here, with the worker's file name. Look for `CompileError`, `TypeError: … MIME type`, `Cannot enlarge memory arrays`, `TransactionInactiveError`, `QuotaExceededError`.
- **Network:** filter by `opencv`. Check status 200/304, size, `Content-Type`, and that `Content-Encoding` isn't applied twice. Tick **Disable cache** to rule out stale files.
- **Sources → Threads** (or the context dropdown in Console): pick `scanner.worker.js` to pause or debug inside the worker.
- **Performance:** record a scan. Long tasks on the *Main* track mean CV code leaked onto the main thread.
- **Memory**, or Chrome **Task Manager** (Shift+Esc): watch the tab's and worker's memory across repeated scans. A steady climb means Mats aren't being deleted.
- **Application → Service workers:** check **Update on reload**, or click **Unregister**, if a stale service worker is serving old code.

### B7. Quick user-facing fix list (for the app's Help page)

1. Reload the page.
2. Close any other tabs of the scanner, then reload (fixes "stuck on Opening library…").
3. Hard reload (Ctrl/Cmd+Shift+R) to fetch the latest version.
4. DevTools → Application → IndexedDB → `docscanner` → **Delete database**, then reload (resets the library).
5. DevTools → Application → Storage → **Clear site data**, then reload (full reset; deletes all scans).

## Sources

- Chrome DevTools, View and change IndexedDB data — <https://developer.chrome.com/docs/devtools/storage/indexeddb>
- Chrome DevTools, Application panel overview — <https://developer.chrome.com/docs/devtools/application>
- Chrome DevTools, What's New in DevTools (Chrome 88): simulate storage quota — <https://developer.chrome.com/blog/new-in-devtools-88>
- MDN, Using IndexedDB (`onblocked`, `onversionchange`) — <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- MDN, Storage quotas and eviction criteria — <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- MDN, Using Web Workers (`terminate`, `onerror`) — <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers>
- OpenCV, Using OpenCV.js (Mat delete) — <https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html>
