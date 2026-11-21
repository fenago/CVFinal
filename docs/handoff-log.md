# Hand-off log (kept by Atlas, orchestrator)

Every hand-off goes **expert → Atlas → next expert**. Each deliverable gets a peer review from a *different* expert before Atlas accepts it.

## How the experts were run in this session (read this first)

The orchestrator was itself started as a subagent. In that nested context the **Agent tool was not available** (only Read/Write/Edit/Bash/Glob/Grep were), so Atlas could not spawn the project subagents as separate processes. To keep the team process intact, Atlas ran each expert **in turn, in its own pass**: for every pass it loaded that expert's agent file (`.claude/agents/<agent>.md`) as the operating brief, read the expert's preloaded skills (`.claude/skills/<skill>/SKILL.md`) and knowledge folder (`knowledge/<agent>/`), wrote only the files in that expert's brief, and produced the expert's hand-off report. Peer reviews were done the same way: a separate pass under the *reviewer's* agent file and skills, against the reviewer's checklist, with commands actually run. Findings went back to the author's pass for fixes.

This is honest about one thing: the experts were **role passes by one model**, not independent processes. Everything else (briefs, contracts, reviews, re-reviews, evidence) followed the team protocol, and every verdict below is backed by a command that was run.

## Fixed interface contracts (set by Atlas before work started)

| Contract | Owner | Consumers |
|---|---|---|
| `js/pipeline.js`: classic/UMD script, defines `self.DocPipeline` (and `module.exports` in Node). `detectDocument(cv, rgba, opts) → {corners:[[x,y]×4] TL,TR,BR,BL, method:'contour'\|'mask'\|'minAreaRect'\|'full', confidence}`; `warpDocument(cv, rgba, corners) → Mat` (caller deletes); `cleanDocument(cv, rgba, opts) → Mat RGBA B/W` (caller deletes); `scanDocument(cv, rgba, opts, onStage) → {corners, method, confidence, warped, clean}` (caller deletes both). Never deletes its input. | Iris | Forge, Vera |
| `scanner.worker.js` (classic): `importScripts` opencv.js once, then `js/pipeline.js`. Worker → `{type:'ready', version}` / `{type:'fatal', message}` / `{type:'progress', id, stage:'finding'\|'flattening'\|'cleaning'\|'encoding'}` / `{type:'result', id, original, result, thumb, width, height, corners, method, confidence, ms, heapBytes}` / `{type:'error', id, message}`. Main → `{type:'scan', id, bitmap, options}` (bitmap transferred) and `{type:'stats', id}`. | Forge | Juniper, Vera |
| `js/scanner-client.js` (ES module): `createScanner({url, loadTimeout, jobTimeout}) → { ready: Promise<{version}>, scan(bitmap, options, onProgress) → Promise<result>, stats() → Promise<{heapBytes}>, restart(), onStatus(cb) }` | Forge | Juniper, Vera |
| `js/db.js` (ES module): `DB_NAME='docscanner'`, `DB_VERSION`; `openDB()`, `addScan(rec) → id`, `listScans() → newest first`, `getScan(id)`, `deleteScan(id)`, `countScans()`, `resetAppData()`, `onDbEvent(cb)` with events `blocked`, `versionchange`, `unblocked`; `requestPersistence()`, `estimateStorage()`. Record: `{id, name, createdAt, original:Blob, result:Blob, thumb:Blob, width, height, corners, method}` | Ledger | Juniper, Vera |
| DOM hooks for tests: `<body data-state="loading\|ready\|working\|done\|error">`, `#file-input`, `#library [data-scan-id]`, `#reset-btn`, `#reset-confirm`, `window.__scanner` (client, for the heap check). | Wren (names) / Juniper (build) | Vera |

## Hand-offs

| # | From → Atlas → To | What was handed over | Reviewer | Verdict |
|---|---|---|---|---|
