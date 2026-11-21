# UX spec: Smart Document Scanner

**Author:** Wren (ux-designer-apple-hig) · **Consumers:** Sable (visuals), Juniper (build), Vera (tests), Lark (copy reuse)
**Sources:** `knowledge/ux-designer-apple-hig/docs/` (HIG Progress indicators, Alerts, Accessibility, Typography) and the `apple-hig-ux` skill.

The app does one job: turn a photo of a page into a clean, flat scan, and keep it. Everything happens on the device. The design keeps the photo and the scan in front, and puts the controls on one floating layer.

## 1. Layout (one page, two layers)

**Content layer (solid surfaces, scrolls):**
1. **Header**: title "Scanner", one-line subtitle "Turn a photo of a page into a clean scan. Everything stays on this device.", link **How it works** (to `how-it-works.html`).
2. **Stage** (`#stage`): shows the empty prompt, the photo being worked on, or the before/after result.
3. **Library** (`#library`): heading "Library" + count, a grid of saved scans, newest first.
4. **Footer**: storage line ("Using 4.2 MB on this device"), **Reset app data** (destructive text button, `#reset-btn`), link **How it works**.

**Functional layer (Liquid Glass, floats bottom-centre, never scrolls away):**
- **Status pill** (`#status`, `role="status"`, `aria-live="polite"`): one line that always says what the app is doing.
- **Toolbar** (`role="toolbar"`, `aria-label="Scan controls"`): **Choose Photo** (primary), **Camera**, and a segmented control **B&W | Grayscale** (`aria-label="Scan style"`).

The body carries the state for styling and tests: `<body data-state="loading|ready|working|done|error">`.

## 2. Flow

```
open app ─► Loading OpenCV ─► Ready (empty or library) ─► pick / capture / sample ─► Working (4 steps) ─► Done (auto-saved)
                │                                                         │                         │
                └─► Load error [Try Again]                                └─► Scan error [Try Again] [Choose Another Photo]
```
- Picking a photo, taking one with the camera, or tapping a sample all start the same scan.
- A finished scan is **saved automatically** (no "Save" step to forget). The toast says so.
- Opening a library item shows it in the stage in the Done layout.

## 3. States (exact copy)

| State | Trigger | What the user sees | Copy | Actions |
|---|---|---|---|---|
| **Loading OpenCV** (`loading`) | Page opens; the worker is loading opencv.js (~3.5 MB download) | Stage shows the empty prompt, dimmed; buttons that need the scanner are disabled (`aria-disabled`), the library is already usable. Status pill shows an indeterminate spinner. | Pill: "Loading the scanner…" After 8 s add a second line: "First load can take a moment on slow connections." | none (library still works) |
| **Load error** (`error`) | Worker posts `fatal`, or no `ready` within 45 s | Pill turns to an error style **with an icon and text** (not colour alone). | "Couldn't load the scanner. Check your connection and try again." | **Try Again** (restarts the worker) |
| **Ready, empty** (`ready`, library empty) | `ready` received, no scans | Stage: a large solid card with a document glyph. | Title "Scan your first page". Body "Choose a photo of a receipt or a page. Place it on a darker surface for best results." Buttons **Choose Photo**, **Use Camera**. Under them: "No photo handy? Try a sample: **Receipt** · **Letter**" | Choose Photo, Use Camera, sample links |
| **Ready, with library** (`ready`) | `ready` and ≥ 1 scan | Same stage prompt, smaller; library grid below. | Pill: "Ready" | same |
| **Working** (`working`) | A photo was picked | Stage shows the photo dimmed 20%. Pill shows a **determinate** 4-step progress bar plus the step text. | "Finding the page…" → "Flattening…" → "Cleaning up…" → "Saving…" | **Cancel** (in the pill): restarts the worker, returns to Ready, pill "Scan cancelled." |
| **Working, slow** | > 30 s for one scan | Switch to Scan error. | "This is taking longer than expected, so the scanner was restarted." | Try Again, Choose Another Photo |
| **Done** (`done`) | Result received and saved | Stage: **Before** (photo with the detected page outlined) and **After** (clean scan) side by side (stacked on narrow screens). Editable name field. | Toast: "Saved to Library." Name default: "Receipt – 21 Nov 2026, 14:32" (from the file name if useful, else "Scan – date, time"). | **Download** (PNG/JPEG), **Scan Another**, rename (Enter or blur saves) |
| **Done, corners not found** | `method` is `minAreaRect` or `full` | Same as Done, plus a notice above the images (icon + text). | "We couldn't find all four corners, so we used the whole photo. For a better result, place the page on a darker, plain surface and try again." | same |
| **Scan error** (`error`) | Worker returned `error` | Stage keeps the photo; pill error style. | "Couldn't scan this photo. Try another photo, or try again." | **Try Again**, **Choose Another Photo** |
| **Unsupported file** | Decode fails (not an image / HEIC in a browser that can't read it) | Pill error | "That file isn't a photo this browser can open. Try a JPEG or PNG." | Choose Another Photo |
| **Storage full** | `QuotaExceededError` on save | The scan stays visible (download still works). | "Your device is out of space for scans. Delete some scans and try again." | Download, Delete in library |
| **Blocked upgrade** | `db` event `blocked` | A solid banner at the top of the page (`role="alert"`). | "Scanner is open in another tab with an older version. Close the other tab to finish updating." | none; banner disappears on `unblocked` |
| **Updated elsewhere** | `db` event `versionchange` | Banner (`role="alert"`). | "Scanner was updated in another tab. Reload to keep using your library." | **Reload** |
| **Library closed by the browser** | `db` event `closed` (site data cleared in DevTools, or storage evicted) — added after Ledger's review | Banner (`role="alert"`). | "Your library was closed by the browser. Reload to continue." | **Reload** |
| **Camera** | **Use Camera** | A sheet (modal `<dialog>`) with the live preview. | Title "Take a Photo". Hint "Hold the page flat and fill the frame." | **Capture** (primary), **Cancel**. Esc = Cancel. Tracks are stopped when the sheet closes. |
| **Camera denied / missing** | `getUserMedia` fails | Inside the sheet | Denied: "Camera access is off. Allow it in your browser's site settings, or choose a photo instead." Missing: "No camera was found. Choose a photo instead." Insecure: "The camera needs a secure (https) page." | **Choose Photo**, **Cancel** |
| **Reset confirmation** | **Reset app data** | Alert (`<dialog id="reset-confirm">`, `role="alertdialog"`) | Title "Reset app data?" Message "This deletes all saved scans and settings on this device and restarts the scanner. It can't be undone." | **Cancel** (default, focused) · **Reset** (destructive) |
| **Resetting** | Reset pressed | Pill: spinner | "Resetting…" → if blocked: "Close other Scanner tabs to finish resetting." | then the page reloads |

## 4. Library

- Card: thumbnail (solid surface, 3:4 crop, `object-fit: contain` on white), name (one line, ellipsis), date in the user's locale ("21 Nov 2026, 14:32").
- Card actions (always visible, not hover-only): **Open**, **Download**, **Delete** (icon buttons with `aria-label` "Open Receipt…", "Download …", "Delete …").
- **Delete is common and undoable, so no alert** (HIG Alerts): the card disappears and a toast shows "Scan deleted." with **Undo** for 6 seconds.
- Empty library: the Ready-empty stage prompt is the only thing shown; the library heading is hidden.
- Each card has `data-scan-id`. The grid is a list (`<ul>`), with the count in the heading ("Library · 3").

## 5. Interaction details

- **Drag and drop** a photo anywhere on the stage = Choose Photo. The stage shows "Drop to scan" while dragging.
- **Paste** an image (Ctrl/Cmd+V) also starts a scan.
- Only one scan at a time: while Working, Choose Photo/Camera/samples are disabled.
- After Done, focus moves to the name field; after Delete, focus moves to the next card (or the stage prompt).
- Toasts stack in the functional layer above the toolbar and do not steal focus (`role="status"`).

## 6. Accessibility

- Hit targets ≥ 44×44 px for every button, link and segment.
- Text: body 17 px, minimum 13 px for captions; layout survives 200% zoom (no fixed heights on text).
- Contrast ≥ 4.5:1 for text, 3:1 for large/bold text and for control outlines; errors use an icon + text, never colour alone.
- Status pill is `aria-live="polite"`; banners use `role="alert"`; the progress bar is a `<progress>` with `aria-label="Scan progress"`.
- Keyboard: everything reachable with Tab in visual order; dialogs trap focus and return it to the opener; Esc cancels.
- Images: before image `alt="Original photo"`, after image `alt="Cleaned scan"`, thumbnails `alt=""` (the name is right next to them).
- Reduce Motion: no spinner rotation (show a static "…" glyph), no slide-in toasts, no image cross-fade.
- Reduce Transparency / Increase Contrast: the glass layer becomes solid with a visible border (Sable's tokens).

## 7. Copy rules

- Verbs on buttons: Choose Photo, Use Camera, Capture, Download, Scan Another, Try Again, Reset, Reload, Undo.
- Errors say what happened, then what to do next. No jargon in the UI: say "the scanner", not "OpenCV", "Wasm" or "IndexedDB" (those words live on the How it works page).
- Title case for buttons, sentence case for messages.

## 8. Test hooks (contract with Juniper and Vera)

`body[data-state]`, `#file-input` (`<input type="file" accept="image/*">`), `#camera-btn`, `#sample-receipt`, `#sample-letter`, `#status`, `#stage`, `#result-img`, `#name-input`, `#download-btn`, `#library`, `#library li[data-scan-id]` with `.delete-btn` / `.open-btn` / `.download-link`, `#toast-undo`, `#reset-btn`, `#reset-confirm` with `#reset-cancel` / `#reset-ok`, `#banner`, `window.__scanner` (scanner client, for the heap check).
