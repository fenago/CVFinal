# Example: hand-off log entries (docs/handoff-log.md)

| # | From → To | What was handed over | Review | Verdict |
|---|---|---|---|---|
| 3 | Iris → Atlas → Forge | `js/pipeline.js` (`scanDocument(cv, rgba, opts)`), corner test output | Forge reviewed Mat cleanup | CHANGES REQUESTED (1 leaked `approx` in early `continue`) |
| 4 | Iris → Atlas | fixed `js/pipeline.js` | Forge re-review | APPROVED |
