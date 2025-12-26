# CLAUDE.md

Guidance for Claude when working in the ARC framework repository. For shared rules and architecture, defer to the
canonical docs:

- [AGENTS](AGENTS.md) – Project context and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v0.2.0-dev (hash: 4b3d89f2) – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) v0.2.0-dev – Environment context and command patterns
- [Process Task Loop](../../.arc/reference/workflows/3_process-task-loop.md) – One-subtask workflow

## Claude-Specific Notes

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory at repo
  root, no runtime containers, markdown linting available)
- **Path awareness:** Commands in QUICK-REFERENCE assume repo root - paths should already be correct
  (documentation-only framework)
- **Summaries first:** Lead responses with concise bullet findings before deep dives
- **Clarifying questions:** Offer numbered/lettered options to keep user replies short
- **Large diffs:** If a change won't fit in context, propose a chunking strategy and wait for approval
- **Session handoffs:** Explicitly state whether CURRENT-SESSION.md was updated or left unchanged
- **Self-hosting:** Framework develops itself using ARC methodology - we are our own test case
