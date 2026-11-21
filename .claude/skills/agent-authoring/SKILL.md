---
name: agent-authoring
description: Create or modify Claude Code project subagents and skills, and their knowledge folders. Use when adding an agent, changing an agent's model/tools/skills, writing a SKILL.md, or fixing team wiring.
---

# Agent and skill authoring (code.claude.com docs)

**Subagent** = `.claude/agents/<name>.md`
```markdown
---
name: code-reviewer            # required, unique, no ':'
description: When Claude should delegate to it   # required
tools: Read, Glob, Grep        # optional; inherits all if omitted
model: sonnet                  # sonnet | opus | haiku | fable | full id | inherit
skills:                        # full SKILL.md content preloaded at startup
  - some-skill
color: blue
---
System prompt…
```
Other fields: `disallowedTools, permissionMode, maxTurns, memory, effort, isolation, hooks, mcpServers, background`. Files are picked up live (no restart). Invoke with `@agent-<name>`. Subagents can spawn subagents (up to 3 levels deep by default).

**Skill** = `.claude/skills/<name>/SKILL.md`, with frontmatter `name`, `description` (key use case first; description + when_to_use is truncated at 1,536 chars), and optional `allowed-tools, disable-model-invocation, user-invocable, context: fork, agent, paths, model`. Supporting files can sit next to it.

**Our conventions:** every agent body tells it to read `knowledge/<name>/docs` + `examples` first; every agent has `peer-review-protocol`; keep `docs/expert-roster.md` and `docs/agent-brains.md` in sync.
