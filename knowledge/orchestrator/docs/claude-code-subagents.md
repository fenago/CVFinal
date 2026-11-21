# Claude Code subagents: notes for the orchestrator

Source: https://code.claude.com/docs/en/sub-agents (read 2026-11-21)

- Project subagents live in `.claude/agents/<name>.md` (YAML frontmatter + system prompt). Required fields are `name` and `description`. Optional fields include `tools`, `model` (`sonnet`, `opus`, `haiku`, `fable`, full id, or `inherit`), `skills`, `color`, `maxTurns`, `permissionMode`, `memory`, `effort`, `isolation`.
- `skills:` "The full content of each listed skill is injected into the subagent's context at startup."
- Delegation: the main conversation (or another agent) uses the Agent tool with the subagent's name. Users can type `@agent-<name>`.
- Nesting: "a subagent can spawn subagents of its own, up to three layers below the main conversation."
- Files are hot-reloaded: "the next delegation uses the updated definition, with no restart needed."
- A subagent only knows what its brief and its preloaded skills tell it, so every brief must be self-contained.
