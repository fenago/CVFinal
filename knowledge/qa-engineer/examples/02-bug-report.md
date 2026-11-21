# Example bug report

**Title:** Library is empty after reload when a scan was saved within 1 s of page load
**Owner suggestion:** indexeddb-expert (Ledger)
**Steps:** 1) Fresh profile 2) Upload samples/receipt.jpg 3) Reload immediately after the "Saved" toast
**Expected:** 1 item. **Actual:** 0 items.
**Evidence:** screenshot qa/shots/reload-empty.png, console: `TransactionInactiveError` at db.js:42
**Suspected cause:** `await canvas.convertToBlob()` inside the open transaction (auto-commit).
