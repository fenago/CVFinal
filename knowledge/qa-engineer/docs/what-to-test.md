# What to test (derived from the project docs)

Sources: docs/00-architecture.md, docs/05-troubleshooting-devtools.md, https://developer.chrome.com/docs/devtools/storage/indexeddb

1. OpenCV ready state appears (worker posted `ready`) within 30 s.
2. Each sample image: corners detected (not the full-image fallback), result Blob is a page-shaped, mostly white B/W image.
3. The library shows the new scan with its name and date. After `page.reload()` it's still there (IndexedDB).
4. The main thread stays responsive during a scan (rAF / longtask observer).
5. Delete a scan → gone after reload. Reset app data → library empty, the app still works.
6. No `pageerror`, no console errors.
7. Error path: a non-image file shows the error state with a recovery action.
8. Inspect with DevTools-equivalent checks: the `docscanner` DB version and store count via `page.evaluate(indexedDB.databases)`.
