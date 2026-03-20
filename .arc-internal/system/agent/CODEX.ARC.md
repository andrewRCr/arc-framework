# CODEX.ARC.md — Agent Configuration

Guidance for Codex CLI when working in the ARC framework repository. Shared rules and project
context live in:

- [AGENT-BRIEFING.ARC](AGENT-BRIEFING.ARC.md) – ARC framework orientation
- [AGENT-BRIEFING.PROJECT](AGENT-BRIEFING.PROJECT.md) – Project context and collaboration principles
- [DEV-RULES.ARC][dev-rules-arc] – Framework development methodology
- [DEV-RULES.PROJECT][dev-rules] – Project quality standards
- [QUICK-REFERENCE][quick-ref] – Environment context and command patterns
- [Process Task Loop][process-task-loop] – One-task workflow

## Codex-Specific Notes

- **Edit style:** Prefer precise, minimal patches. Use `apply_patch` for focused single-file edits
  and direct shell writes for larger multi-file text replacements.
- **Sandbox escalation:** Some commands need unrestricted execution (e.g., `npm install`). If a
  required command fails under sandbox constraints, re-run with escalation request.

## MCP Server Availability

_[None configured]_

## Sub-Agent Availability

_[None configured]_

---

[dev-rules-arc]: ../../../.arc/reference/constitution/DEV-RULES.ARC.md
[dev-rules]: ../../reference/constitution/DEV-RULES.PROJECT.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.template.md
