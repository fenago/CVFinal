# Skill file format

Source: https://code.claude.com/docs/en/skills

Location: `.claude/skills/<name>/SKILL.md`. Frontmatter: `name` (defaults to the directory name), `description` ("What the skill does and when to use it"), `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork` + `agent`, `paths`, `hooks`, `metadata`.
- "Put the key use case first": description + when_to_use is truncated at 1,536 characters in the listing.
- Supporting files (reference.md, scripts/) can sit next to SKILL.md and are read only when needed.
- Subagents preload skills listed in their `skills:` field. A skill with `context: fork` runs in a forked subagent instead.
