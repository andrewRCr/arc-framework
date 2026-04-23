---
active: true
---

# CLAUDE.ARC.md — Agent Configuration

Shared rules and project context live in:

- [AGENT-BRIEFING.ARC](AGENT-BRIEFING.ARC.md) – ARC framework orientation
- [AGENT-BRIEFING.PROJECT](AGENT-BRIEFING.PROJECT.md) – Project context and collaboration principles
- [DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md) – Framework development methodology
- [DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md) – Project quality standards
- [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) – Environment context and command patterns
- [Process Task Loop](../workflows/arc/3_process-task-loop.md) – One-task workflow

## Claude-Specific Notes

- **Bash commands:** Keep shell commands simple and separate — chained commands (`&&`, `||`, pipes)
  may not match auto-approve patterns even when the individual commands would be approved. Run
  independent commands as parallel tool calls instead of chaining them.

## MCP Server Availability

_[None configured]_

## Sub-Agent Availability

**External Research Analyst** — Available for web research and external documentation synthesis.

**When to use:**

- Researching third-party libraries or best practices
- Investigating security advisories or error messages from external sources
- Any web research expected to require 3+ WebFetch calls
- Tasks requiring synthesis across multiple external sources

**When NOT to use:**

- Simple 1-2 WebFetch queries with clear targets (use WebFetch directly)
- Checking a single documentation page
- Quick lookups of known information
