# CLAUDE.md: Smart Document Scanner (CV final project)

## What this project is
A **Smart Document Scanner** that runs 100% in the browser. The user uploads (or snaps with the webcam) a photo of a receipt or page. **OpenCV.js** finds the page, flattens it with a perspective warp and cleans it into a crisp black-and-white scan. **IndexedDB** keeps every scan in a library that survives a refresh.

## Fixed decisions (don't re-litigate)
- Static site on **Netlify**. No servers, no backend, no API keys, no build step.
- OpenCV.js is vendored at `vendor/opencv/4.12.0/opencv.js` (official single-file build, repackaged on npm as `@techstark/opencv-js@4.12.0-release.1`). It runs **only inside a Web Worker**. The main thread never calls `cv.*`.
- Every `cv.Mat` / `cv.MatVector` is deleted in `try/finally`.
- IndexedDB database `docscanner`, versioned, stores the original + result Blobs with name and date. Handles `onblocked`/`onversionchange`. Has a "Reset app data" button.
- Apple-style UX (HIG) and UI (Liquid Glass on the floating control layer only).

## The team
Project subagents live in `.claude/agents/`, skills in `.claude/skills/`, knowledge in `knowledge/<agent>/{docs,examples}`.

| Agent | Persona | Model | Owns |
|---|---|---|---|
| orchestrator | Atlas | opus | Plan, delegate, hand-offs, reviews, acceptance |
| meta-agent | Quill | opus | Agent/skill/knowledge files |
| opencv-expert | Iris | opus | Vision pipeline |
| wasm-expert | Forge | opus | opencv.js loading, Web Worker, Mat memory |
| indexeddb-expert | Ledger | sonnet | db.js, persistence, reset |
| ux-designer-apple-hig | Wren | sonnet | Flow, states, copy, accessibility |
| ui-designer-apple-liquid-glass | Sable | sonnet | Visual style, CSS |
| frontend-engineer | Juniper | sonnet | HTML shell, main-thread wiring, camera |
| qa-engineer | Vera | sonnet | Real-browser tests, QA report |
| netlify-deploy-engineer | Harbor | haiku | netlify.toml, headers |
| technical-writer | Lark | haiku | README, How it works page |

Details: `docs/expert-roster.md` (roles + skill matrix) and `docs/agent-brains.md` (models + personalities).

## How the team works
1. **The orchestrator (Atlas) is the only entry point.** The user talks to Atlas.
2. **Agents hand work to each other through the orchestrator, never directly.** An expert returns a hand-off report to Atlas. Atlas passes the files and summary to the next expert.
3. **Peer review before acceptance.** Atlas asks a *different* expert to review each deliverable (`peer-review-protocol` skill). Changes go back through Atlas.
4. **Every agent reads its knowledge folder first**, plus this file.
5. Hand-offs and review verdicts are logged in `docs/handoff-log.md`.

## Conventions
- Plain HTML/CSS/ES modules. The worker is a classic script (uses `importScripts`).
- Test locally with a static server (`python3 -m http.server 8080`), never `file://`.
- Browser tests use Playwright with the pre-installed Chromium (`require('playwright')`). Don't run `playwright install`.
- Research notes: `docs/00-architecture.md` … `docs/05-troubleshooting-devtools.md`.
