# Subagent file format

Source: https://code.claude.com/docs/en/sub-agents

Location: `.claude/agents/` (project) or `~/.claude/agents/` (user). Official example:
```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```
Fields: `name` (required, ≤256 chars, no `:`), `description` (required: when to delegate), `tools` / `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills` (preloaded in full, first 32), `mcpServers`, `hooks`, `memory` (`user|project|local`), `background`, `effort`, `isolation: worktree`, `color` (`red, blue, green, yellow, purple, orange, pink, cyan`), `initialPrompt`.
Changes on disk are picked up without a restart.
