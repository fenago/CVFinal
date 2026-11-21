---
name: devtools-recovery
description: Diagnose and recover a stuck browser app: stuck worker, blocked IndexedDB upgrade, memory leaks, stale cache. Use when the app hangs, the library won't open, or a user needs the 'Reset app data' button or Chrome DevTools steps.
---

# Recovery playbook

**Why it hangs**
1. The worker is stuck or crashed → per-job timeout + `terminate()` + restart.
2. A blocked DB upgrade (another tab holds the old version) → `onblocked` banner, `onversionchange` → `close()`.
3. Memory: Mats not deleted or object URLs not revoked → the tab slows down and then crashes.
4. Stale code from cache → `no-cache` HTML, hard reload.

**In-app "Reset app data" button** (Wren's copy, Ledger's code): confirm with a destructive alert ("Reset app data?" / "This deletes all saved scans on this device." / [Cancel] [Reset]). Then terminate the worker, close the DB, `indexedDB.deleteDatabase`, handle `onblocked` ("close other tabs"), clear Cache Storage if any, and reload.

**Chrome DevTools** (developer.chrome.com, *View and change IndexedDB data*)
- Application → IndexedDB → database (shows origin + **version**) → object store → click a row → **Delete Selected**. Or **Clear object store**, or **Delete database**.
- Values don't update in real time, so click **Refresh**.
- Application → Storage → tick IndexedDB → **Clear site data**. Then hard reload.
- Storage → **Simulate custom storage quota** to test `QuotaExceededError`.
