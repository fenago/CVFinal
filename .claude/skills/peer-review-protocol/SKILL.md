---
name: peer-review-protocol
description: How one expert reviews another expert's work before the orchestrator accepts it. Use whenever asked to review, approve or critique a deliverable.
---

# Peer review protocol

1. Read the brief, the author's hand-off report, and the changed files.
2. Check against: correctness (run it if you can), your own domain's rules (for example cv-mat-memory, HIG contrast, IndexedDB auto-commit), the interface contract, and the static-site constraints.
3. Each finding has a severity (**blocker** / **should-fix** / **nit**), a file:line, and a concrete fix.
4. Verdict: **APPROVED**, or **CHANGES REQUESTED** (any blocker means changes requested).

```
REVIEWER: <persona> (<agent>)  REVIEWED: <author persona> — <deliverable>
VERDICT: APPROVED | CHANGES REQUESTED
FINDINGS:
- [blocker] path:line — problem — fix
EVIDENCE: <what you ran / looked at>
```
Return it to the orchestrator, never straight to the author.
