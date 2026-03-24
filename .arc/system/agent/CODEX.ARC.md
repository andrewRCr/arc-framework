# CODEX.ARC.md — Agent Configuration

Shared rules and project context live in:

- [AGENT-BRIEFING.ARC](AGENT-BRIEFING.ARC.md) – ARC framework orientation
- [AGENT-BRIEFING.PROJECT](AGENT-BRIEFING.PROJECT.md) – Project context and collaboration principles
- [DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md) – Framework development methodology
- [DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md) – Project quality standards
- [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) – Environment context and command patterns
- [Process Task Loop](../workflows/arc/3_process-task-loop.md) – One-task workflow

## Codex-Specific Notes

- **Edit style:** Prefer precise, minimal patches. Use `apply_patch` for focused single-file edits
  and direct shell writes for larger multi-file text replacements.
- **Sandbox escalation:** Some commands need unrestricted execution (e.g., `npm install`). If a
  required command fails under sandbox constraints, re-run with escalation request.

## MCP Server Availability

_[None configured]_

## Sub-Agent Availability

_[None configured]_
