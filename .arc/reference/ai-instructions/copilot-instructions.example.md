# GitHub Copilot Instructions

<!--
ARC Framework Template: Copy this file as copilot-instructions.md and customize for your project
- This is a minimal template - most guidance lives in AGENTS.md
- Only add Copilot-specific tips here (not general project context)
- Keep this file lean - reference AGENTS.md for shared context
-->

Copilot suggestions must align with the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) {{RULES_VERSION}} – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) {{QUICKREF_VERSION}} – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Copilot-Specific Notes

<!--
Customize this section with Copilot-specific tips for your project:
- Context snippet guidance
- Command hint preferences
- Code style reminders
- Testing prompt patterns
- Tool deferral corrections
-->

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory,
  runtime status, tool availability, paths)
- **Context snippets:** When prompting Copilot, include active task, acceptance criteria, and relevant files; keep
  prompts short to avoid stale context
- **Command hints:** Suggest commands from QUICK-REFERENCE (assume repo root paths) and remind users to run quality
  gates before committing
- **Code style reminders:** {{CODE_STYLE_GUIDANCE}} (e.g., "Backend: Django + type hints, Frontend: React +
  TypeScript")
- **Testing prompts:** Encourage generating tests alongside implementation ({{TEST_FRAMEWORK_PATTERNS}})
- **Deferrals:** If Copilot proposes outdated tooling, correct suggestions per DEVELOPMENT-RULES quality gate tools
