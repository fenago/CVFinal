# Expert Roster: Smart Document Scanner Team

**Decision (fixed):** everything runs in the browser and is deployed to **Netlify as a static site**. There are no servers, no backend and no API keys. **OpenCV.js** does the computer vision. **WebAssembly** makes it fast, and it runs inside a **Web Worker**. **IndexedDB** keeps the scan library.

Because of that decision, the roster has **no** backend, database-admin, DevOps-for-servers, auth or API roles. Every role below exists because a browser-only app actually needs it.

## The team (11 agents)

| # | Agent (file name) | Persona | Required? | One-line job |
|---|---|---|---|---|
| 1 | `orchestrator` | **Atlas** | ✅ required | Runs the team: plans the work, hands each task to the right expert, passes results along, sets up peer reviews, and accepts or rejects the work. |
| 2 | `meta-agent` | **Quill** | ✅ requested | Builds and maintains the team itself: writes and updates agent files, skills and knowledge folders when a gap shows up. |
| 3 | `opencv-expert` | **Iris** | ✅ required | Owns the vision pipeline in OpenCV.js: find the page, flatten it with a perspective warp, clean it into a crisp black-and-white scan. |
| 4 | `wasm-expert` | **Forge** | ✅ required | Loads opencv.js (WebAssembly) exactly once, runs the pipeline in a Web Worker so the page never freezes, and makes sure every `cv.Mat` is deleted. |
| 5 | `indexeddb-expert` | **Ledger** | ✅ required | Owns the versioned IndexedDB library: scans (original and result Blobs), settings, history, blocked upgrades, quota, and "Reset app data". |
| 6 | `ux-designer-apple-hig` | **Wren** | ✅ requested | Designs the flow and every state (loading OpenCV, working, done, error, empty, blocked) following Apple's Human Interface Guidelines. |
| 7 | `ui-designer-apple-liquid-glass` | **Sable** | ✅ requested | Gives the UI an Apple look: Liquid-Glass-style floating controls, SF system type, light/dark, and accessible contrast. |
| 8 | `frontend-engineer` | **Juniper** | browser need | Builds the page itself: HTML, CSS, the main-thread JS, camera capture, and wiring the UI to the worker and the database. |
| 9 | `qa-engineer` | **Vera** | browser need | Tests the app in a real headless browser (Playwright + Chromium) with sample images: pipeline, persistence after reload, no main-thread freeze, no Mat leaks. |
| 10 | `netlify-deploy-engineer` | **Harbor** | static-hosting need | Makes the site deploy-ready on Netlify: `netlify.toml`, the `.wasm` MIME type, cache headers, file-size limits, and a local static-server check. |
| 11 | `technical-writer` | **Lark** | browser need | Writes the README with deploy steps and the plain-words "How it works" page about OpenCV.js, WebAssembly and IndexedDB. |

> **Roles we left out on purpose:** backend/API developer, database administrator, cloud/DevOps for servers, security engineer for auth and secrets (there are none), ML-model trainer (we use classical CV, not a trained model). Their browser-side concerns are covered by the roles above. For example, the Netlify engineer handles security headers and the QA engineer handles cross-browser checks.

## Skills, and which agents share them

Each skill is one reusable playbook in `.claude/skills/<skill-name>/SKILL.md`. ● = the agent has the skill preloaded.

| Skill | What it teaches | Atlas orch | Quill meta | Iris cv | Forge wasm | Ledger idb | Wren ux | Sable ui | Juniper fe | Vera qa | Harbor netlify | Lark writer |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `opencv-js-loading` | Get, load and detect readiness of opencv.js (both the Promise and `onRuntimeInitialized` styles) | | | ● | ● | | | | | ● | | |
| `cv-mat-memory` | Every `cv.Mat`/`MatVector` is freed with `delete()` in `try/finally`; finding leaks | | | ● | ● | | | | | ● | | |
| `document-scan-pipeline` | Gray → blur → Canny → contours → `approxPolyDP` → corner order → `warpPerspective` → `adaptiveThreshold` | | | ● | | | | | | ● | | |
| `web-worker-offloading` | Classic worker + `importScripts`, transferables, request ids, timeouts, restart a stuck worker, no DOM in the worker | | | ● | ● | | | | ● | | | |
| `wasm-static-serving` | `application/wasm`, the single-file vs split build, size, no pre-compression, caching | | | | ● | | | | | | ● | |
| `indexeddb-versioned-schema` | `open(name, version)`, `onupgradeneeded` ladder, `onblocked`, `onversionchange`, transactions, indexes | | | | | ● | | | ● | ● | | |
| `blob-image-storage` | Encoding images to Blobs (`convertToBlob`), storing Blobs, object URLs and revoking them, quota | | | | ● | ● | | | ● | | | |
| `devtools-recovery` | Why the app hangs, the in-app "Reset app data" button, Chrome DevTools Application → IndexedDB / Clear site data | | | | | ● | | | | ● | | ● |
| `apple-hig-ux` | HIG flows, progress indicators, alerts, destructive confirmations, accessibility (44 pt targets, contrast, Reduce Motion) | | | | | | ● | ● | ● | | | |
| `liquid-glass-styling` | The Liquid Glass functional layer vs the content layer, CSS `backdrop-filter` recipe, light/dark tokens, Reduce Transparency fallback | | | | | | | ● | ● | | | |
| `browser-qa-playwright` | Static server + headless Chromium, upload fixtures, assert states, check reload persistence and long tasks | ● | | | | | | | | ● | | |
| `netlify-static-deploy` | `netlify.toml` (publish folder, headers), deploy by Git/CLI/drag-and-drop, verify with `curl -I` | ● | | | | | | | | | ● | ● |
| `plain-language-explainers` | Explain OpenCV.js, WebAssembly and IndexedDB to non-experts with analogies and no jargon | | | | | | ● | | | | | ● |
| `team-orchestration` | Plan → assign → hand off → review → accept, the hand-off log format, the definition of done | ● | ● | | | | | | | | | |
| `agent-authoring` | Claude Code subagent and skill file formats, wiring skills to agents, knowledge folders | ● | ● | | | | | | | | | |
| `peer-review-protocol` | How one expert reviews another's work: a checklist, verdict (approve / changes-requested), evidence | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |

### Skill counts per agent

| Agent | Skills |
|---|---|
| Atlas (orchestrator) | browser-qa-playwright, netlify-static-deploy, team-orchestration, agent-authoring, peer-review-protocol |
| Quill (meta-agent) | team-orchestration, agent-authoring, peer-review-protocol |
| Iris (opencv-expert) | opencv-js-loading, cv-mat-memory, document-scan-pipeline, web-worker-offloading, peer-review-protocol |
| Forge (wasm-expert) | opencv-js-loading, cv-mat-memory, web-worker-offloading, wasm-static-serving, blob-image-storage, peer-review-protocol |
| Ledger (indexeddb-expert) | indexeddb-versioned-schema, blob-image-storage, devtools-recovery, peer-review-protocol |
| Wren (ux-designer-apple-hig) | apple-hig-ux, plain-language-explainers, peer-review-protocol |
| Sable (ui-designer-apple-liquid-glass) | apple-hig-ux, liquid-glass-styling, peer-review-protocol |
| Juniper (frontend-engineer) | web-worker-offloading, indexeddb-versioned-schema, blob-image-storage, apple-hig-ux, liquid-glass-styling, peer-review-protocol |
| Vera (qa-engineer) | opencv-js-loading, cv-mat-memory, document-scan-pipeline, indexeddb-versioned-schema, devtools-recovery, browser-qa-playwright, peer-review-protocol |
| Harbor (netlify-deploy-engineer) | wasm-static-serving, netlify-static-deploy, peer-review-protocol |
| Lark (technical-writer) | devtools-recovery, netlify-static-deploy, plain-language-explainers, peer-review-protocol |

## How work flows

All hand-offs go **through the orchestrator (Atlas)**. Experts never hand work directly to each other. Atlas passes each expert's output (files plus a short summary) to the next expert, and asks a *different* expert to review it before accepting it. See `CLAUDE.md` and `docs/agent-brains.md`.

```
Wren (flow & states) ─┐
                      ├─► Atlas ─► Iris (pipeline) ─► Atlas ─► Forge (worker + loader) ─► Atlas ─► Ledger (DB)
Sable (visual style) ─┘                                                                          │
                                                   Juniper (wire UI) ◄──────────── Atlas ◄────────┘
                                                          │
                     Atlas ◄─ peer reviews (Forge↔Iris, Ledger↔Juniper, Wren↔Sable) ◄─┘
                       │
                       ├─► Harbor (netlify.toml) ─► Lark (README + How it works) ─► Vera (browser QA) ─► Atlas accepts
```
