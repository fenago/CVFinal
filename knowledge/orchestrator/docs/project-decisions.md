# Fixed project decisions (from the user)

Source: user decision recorded in `CLAUDE.md` and `docs/expert-roster.md`; research in `docs/00-architecture.md` … `docs/05-troubleshooting-devtools.md`.

- 100% browser app, deployed to Netlify as a static site. No servers, no API keys, no build step required.
- OpenCV.js (vendored `vendor/opencv/4.12.0/opencv.js`, the official single-file build repackaged on npm as `@techstark/opencv-js@4.12.0-release.1`) does the CV.
- OpenCV runs only in a classic Web Worker (`scanner.worker.js`). The main thread never calls cv.*.
- IndexedDB keeps the library (original + result Blobs, name, date) in a versioned database.
- Apple-style UX (Wren, HIG) and UI (Sable, Liquid Glass).
- Every hand-off goes through the orchestrator. Every deliverable gets a peer review before it's accepted.
