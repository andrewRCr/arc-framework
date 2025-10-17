# GitHub Copilot Instructions

Copilot suggestions must align with the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v0.2.0-dev (hash: 4b3d89f2) – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) v0.2.0-dev – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Copilot-Specific Notes

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory at repo
  root, no runtime containers, markdown linting available)
- **Context snippets:** When prompting Copilot, include active task, acceptance criteria, and relevant files; keep
  prompts short to avoid stale context
- **Command hints:** Suggest markdown linting and git commands from QUICK-REFERENCE (assume repo root paths) and
  remind users to run quality gates before committing
- **Code style reminders:** N/A (documentation-only framework - no backend/frontend code)
- **Testing prompts:** N/A (documentation doesn't have unit tests - quality gate is markdown linting)
- **Deferrals:** If Copilot proposes complex tooling, remind that this is a documentation-only framework (markdown
  linting is the only automated quality check)
- **Self-hosting:** Framework develops itself using ARC methodology - we are our own test case
