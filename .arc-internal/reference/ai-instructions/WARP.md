# WARP.md

Guidance for Warp terminal when working in the ARC framework repository. For shared rules and architecture, defer to
the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v0.2.0-dev (hash: 4b3d89f2) – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) v0.2.0-dev – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Warp-Specific Notes

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory at repo
  root, no runtime containers, markdown linting available)
- **Shell syntax:** Use bash syntax for commands (Linux/WSL environment) - all commands in QUICK-REFERENCE assume
  repo root
- **Command focus:** Focus on markdown linting and git operations (no Docker, no backend/frontend services)
- **Quality gates shorthand:** Reference markdown linting commands from QUICK-REFERENCE; format as shell snippets when
  asked to run checks
- **Environment checks:** Confirm npx availability before proposing markdown linting operations
- **Hand-offs:** When finishing terminal work, update CURRENT-SESSION.md (or state "no update required") and note any
  long-running commands left active
- **Self-hosting:** Framework develops itself using ARC methodology - we are our own test case
