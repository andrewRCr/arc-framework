# WARP.md

<!--
ARC Framework Template: Copy this file as WARP.md and customize for your project
- This is a minimal template - most guidance lives in AGENTS.md
- Only add Warp-specific tips here (not general project context)
- Keep this file lean - reference AGENTS.md for shared context
-->

Guidance for Warp terminal when working in this repository. For shared rules and architecture, defer to the
canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) {{RULES_VERSION}} – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) {{QUICKREF_VERSION}} – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Warp-Specific Notes

<!--
Customize this section with Warp-specific tips for your project:
- Shell syntax preferences
- Command focus areas
- Environment verification
- Hand-off practices
- Quality gate shortcuts
-->

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory,
  runtime status, tool availability, paths)
- **Shell syntax:** Prefer cross-platform command syntax (e.g., `docker compose` over `docker-compose` for broader
  compatibility)
- **Command focus:** {{COMMAND_FOCUS_GUIDANCE}} (e.g., "Prioritize Docker-based workflows" or "Focus on native
  Python/Node scripts")
- **Quality gates shorthand:** Reference commands from QUICK-REFERENCE (assume repo root paths); format as shell
  snippets when asked to run checks
- **Environment checks:** Confirm Docker/runtime availability before proposing actions that depend on them
- **Hand-offs:** When finishing terminal work, update CURRENT-SESSION.md (or state "no update required") and note any
  long-running commands left active
