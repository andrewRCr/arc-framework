# CLAUDE.md

<!--
ARC Framework Template: Copy this file as CLAUDE.md and customize for your project
- This is a minimal template - most guidance lives in AGENTS.md
- Only add Claude-specific tips here (not general project context)
- Keep this file lean - reference AGENTS.md for shared context
-->

Guidance for Claude when working in this repository. For shared rules and architecture, defer to the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) {{RULES_VERSION}} – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) {{QUICKREF_VERSION}} – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Claude-Specific Notes

<!--
Customize this section with Claude-specific tips for your project:
- Session startup reminders
- Path awareness notes
- Communication preferences
- Tool availability notes
- Context management tips
-->

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory,
  runtime status, tool availability, paths)
- **Path awareness:** Commands in QUICK-REFERENCE assume repo root - adjust based on current working directory
  from Session Startup Protocol
- **Summaries first:** Lead responses with concise bullet findings before deep dives
- **Clarifying questions:** Offer numbered/lettered options to keep user replies short
- **Large diffs:** If a change won't fit in context, propose a chunking strategy and wait for approval
- **Tooling awareness:** {{TOOL_AVAILABILITY}} - check QUICK-REFERENCE for command patterns
- **Session handoffs:** Explicitly state whether CURRENT-SESSION.md was updated or left unchanged
