# QA report: Smart Document Scanner

**Author:** Vera (qa-engineer) · **Date:** 2026-11-21 · **Browser:** headless Chromium (Playwright, pre-installed) · **Server:** `tools/serve-netlify.py` (applies `netlify.toml` headers, so the production CSP and cache rules were active during the run)

## Verdict

**PASS. 32/32 end-to-end checks**, plus three focused suites all green, zero console errors. Two UI bugs and one layout bug were found during QA, fixed by their owners through Atlas, and re-verified (see "Bugs found" below).

## How to reproduce

```bash
node tests/e2e.mjs                       # 32 checks, writes screenshots to docs/qa/ and tests/output/e2e-results.json
node tests/worker-check.cjs              # Forge's worker/Wasm suite (8 checks)
node tests/db-check.cjs                  # Ledger's IndexedDB suite (9 checks)
node tools/test-pipeline.cjs --leak 30   # Iris's pipeline suite in Node (4 checks)
```

## Results (final run, after all fixes)

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Load, OpenCV ready | Loading state, then `ready` within 30 s | `data-state=loading`, ready after ~0.5–1.0 s (local) | PASS |
| 2 | Scan `receipt.jpg` (real file upload) | 4-corner detection, not fallback | `method=contour`, max corner error **0.10%** of the diagonal vs `samples/ground-truth.json` | PASS |
| 3 | Receipt result | Upright page, mostly white | 644×1415, 92.9% white | PASS |
| 4 | Receipt saved | Original JPEG + result PNG + thumb JPEG in IndexedDB | `image/jpeg, image/png, image/jpeg` | PASS |
| 5 | Working state | Visible during a scan with stage progress | `data-state=working`, pill "Finding the page…" + progress bar (screenshot 03) | PASS |
| 6 | Main thread during a scan | No freeze | longest frame gap **17 ms**, **0** long tasks, focus answered in 0 ms | PASS |
| 7 | Scan `letter.jpg` | 4-corner detection, accurate, clean | `method=contour`, max error **0.12%**, 999×1322, 92.7% white | PASS |
| 8 | Library | Both scans with name + date | 2 cards, "Letter – Nov 21, 2026, 02:04 PM" (browser locale) | PASS |
| 9 | Reload | Library still there | 2 cards; `indexedDB.databases()` → `docscanner` v2 | PASS |
| 10 | Open + rename | Rename survives reload | "Grocery receipt" persisted | PASS |
| 11 | Delete + Undo | Card goes, Undo brings it back; delete persists after reload | 2 → 1 → 2 → 1, still 1 after reload | PASS |
| 12 | Not-an-image file | Error state with recovery | "That file isn't a photo this browser can open. Try a JPEG or PNG." + **Choose Another Photo** | PASS |
| 13 | Recovery | Next scan works | done | PASS |
| 14 | "Try a sample" button | Scans bundled letter | name "Letter – …", `contour` | PASS |
| 15 | Cancel mid-scan | Worker restarts, nothing saved | 3 → 3 scans, back to ready | PASS |
| 16 | Webcam (Chromium fake camera) | Capture → scan → saved; camera released | saved; `srcObject` cleared. The fake camera shows a test pattern with no page, so `method=full` and the fallback notice appear (correct behaviour) | PASS |
| 17 | Fallback notice | Shown when corners not found | visible | PASS |
| 18 | **Wasm heap, 20 repeated scans** | No growth from leaked Mats | heap 128 MB → 128 MB; **16 MB malloc probe address 7,093,328 → 7,093,328** (identical) | PASS |
| 19 | Blocked DB upgrade (old tab holds v1) | Banner, clears when old tab closes | "Scanner is open in another tab with an older version…" then hidden; app reached ready | PASS |
| 20 | versionchange (another tab opens v3) | Our tab closes its connection, offers Reload | "Scanner was updated in another tab…" + Reload | PASS |
| 21 | Reset confirmation → Cancel | Library kept | 4 scans kept | PASS |
| 22 | Reset app data → Reset | Page reloads, library empty, app works | 0 cards, library hidden, ready | PASS |
| 23 | Scan after reset | Works | 1 card | PASS |
| 24 | Phone 390 px | No horizontal overflow | none | PASS |
| 25 | How it works | Explains OpenCV.js, WebAssembly, IndexedDB | all three present | PASS |
| 26 | `/vendor/*` header | Long, immutable cache | `public, max-age=31536000, immutable` | PASS |
| 27 | HTML header + CSP | `no-cache`, CSP active | yes; app runs under the CSP | PASS |
| 28 | Console | Zero errors on every page/tab | 0 | PASS |

(The e2e script reports 32 checks because several rows above are split into two checks.)

### Why the leak check uses a malloc probe

The Wasm heap starts at 128 MB, so `HEAPU8.buffer.byteLength` alone can't see a leak until it exceeds that headroom. The probe mallocs a 16 MB block, records its address and frees it. Leaked Mats stay allocated below it and push the address up. Negative control (run by Forge in review): injecting one leaked 500×500 RGBA Mat per scan moved the probe by **16,925,376 bytes over 10 scans** while `byteLength` stayed at 128 MB. In the real app the probe address is identical before and after 20 scans.

### Focused suites (final run)

| Suite | Owner | Result | Key numbers |
|---|---|---|---|
| `tools/test-pipeline.cjs --leak 30` | Iris | 4/4 PASS | receipt 0.10%, letter 0.12% corner error; no-page image falls back to `full`; 30 scans, probe moved 0 bytes |
| `tests/worker-check.cjs` | Forge | 8/8 PASS | ready in ~0.55 s; 48 MP photo capped to 2400×3200 and scanned in ~1.1 s; longest frame gap 17 ms; `opencv.js` fetched once |
| `tests/db-check.cjs` | Ledger | 9/9 PASS | v1→v2 ladder keeps data; blocked → unblocked; versionchange closes; reset reports blocked then deletes |

## Screenshots (`docs/qa/`, deviceScaleFactor 1)

| File | State |
|---|---|
| `01-loading.png` | Loading the scanner (controls disabled, library usable) |
| `02-ready-empty.png` | Ready, empty library |
| `03-working.png` | Working: photo dimmed, "Finding the page…", progress, Cancel |
| `04-done-receipt.png` | Done: before (page outlined) / after, name, Download |
| `05-done-letter.png` | Done: letter |
| `06-library-after-reload.png` | Library after reload (full page) |
| `07-error-not-an-image.png` | Error with recovery |
| `08-blocked-upgrade-banner.png` | Blocked-upgrade banner |
| `09-reset-confirm.png` | Reset confirmation alert (Cancel / destructive Reset) |
| `10-after-reset.png` | After reset: empty, ready |
| `11-camera-sheet.png` | Camera sheet (fake camera) |
| `12-dark-done.png` | Dark mode, done |
| `13a-phone-ready.png`, `13b-phone-done.png` | 390 px phone |
| `14-how-it-works-phone.png` | How it works page on a phone |

## Bugs found and fixed during QA

| # | Bug (reproducible steps) | Owner | Fix | Re-test |
|---|---|---|---|---|
| Q1 | Upload a non-image file → the stage keeps a **broken image** icon with the alt text "Photo being scanned" (first run of 07). | Juniper | Return to the prompt view when decoding fails (`js/app.js`). | PASS (07 shows the prompt + error pill) |
| Q2 | Phone 390 px: the toolbar **wrapped to two rows**, so the floating layer was ~190 px tall and covered the "Letter" sample link (first run of 13a/13b). | Sable | One-row toolbar on ≤ 480 px (icon-only Camera button with an accessible name, "Gray" short label), extra tightening ≤ 360 px (`css/styles.css`). | PASS: 390 px toolbar 322 px wide, 320 px toolbar 283 px wide, no overflow |
| Q3 | Phone: the error pill's **Choose Another Photo** button overflowed the pill. | Sable | Pill wraps on ≤ 480 px; button takes a full row. | PASS (visual check) |

## Not covered / limits of this run

- Only Chromium was automated (Firefox/WebKit are not installed here). Safari note: `OffscreenCanvas` + `convertToBlob` in workers need Safari 16.4+.
- The samples are synthetic photos (see README). Real phone photos with cluttered backgrounds, a white page on a white table, or a hand covering a corner will fall back more often; the fallback is handled and explained in the UI, but there is no manual corner editor.
- `QuotaExceededError` was not forced in the browser run (the code path maps it to the spec copy; DevTools "Simulate custom storage quota" is the manual test).
- The deployed Netlify site was not tested (no Netlify access from this environment); headers were tested with the header-aware local server.
