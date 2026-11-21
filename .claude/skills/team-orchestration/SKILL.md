---
name: team-orchestration
description: Run a multi-agent team: plan, delegate, hand off through the orchestrator, review, accept. Use when coordinating experts, writing a delegation brief, logging hand-offs, or deciding whether work is done.
---

# Team orchestration

**Loop:** Plan → Assign → Build → Hand-off → Peer review → Fix → Accept.

**Delegation brief template**
```
TO: <agent-name> (<persona>)
GOAL: <one sentence>
READ FIRST: knowledge/<agent>/..., <files>
CONTRACT: <function signatures / message formats / file names you must honour>
CONSTRAINTS: static site, no servers/API keys, no frameworks/build step
RETURN: hand-off report (DID / FILES / EVIDENCE / OPEN ISSUES / NEXT)
```
- Hand-offs always go expert → orchestrator → next expert. Log each one in `docs/handoff-log.md`.
- Pick reviewers who own a neighbouring concern (Forge reviews Iris, Iris reviews Forge, Ledger reviews Juniper's DB use, Wren reviews Sable, Sable reviews Juniper, Vera tests everything).

**Definition of done:** runs locally from a static server; both sample images scan; library survives reload; reset works; no console errors; UI responsive during a scan; netlify.toml present; README + How it works written; QA report with evidence; all reviews approved; pushed.
