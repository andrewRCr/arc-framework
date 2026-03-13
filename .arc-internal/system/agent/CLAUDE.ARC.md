# CLAUDE.ARC.md — Agent Configuration

Guidance for Claude when working in the ARC framework repository. For shared rules and architecture, defer to the
canonical docs:

- [ARC-AGENTS](ARC-AGENTS.md) – Project context and collaboration principles
- [DEV-RULES.ARC][dev-rules-arc] – Framework development methodology
- [DEV-RULES.PROJECT][dev-rules] – Project quality standards
- [QUICK-REFERENCE][quick-ref] – Environment context and command patterns

Before starting task execution, load the [Process Task Loop][process-task-loop].

## Claude-Specific Notes

- **Bash commands:** Keep shell commands simple and separate — chained commands (`&&`, `||`, pipes)
  may not match auto-approve patterns even when the individual commands would be approved. Run
  independent commands as parallel tool calls instead of chaining them.
- **Never** degrade work quality or change approach due to context or token pressure
- **Never** make "efficiency" tradeoffs based on context window size

## MCP Server Availability

_[None configured]_

## Sub-Agent Availability

**External Research Analyst** - Available for web research and external documentation synthesis.

**When to use:**

- Researching third-party libraries or best practices
- Investigating security advisories or error messages from external sources
- Any web research expected to require 3+ WebFetch calls
- Tasks requiring synthesis across multiple external sources

**When NOT to use:**

- Simple 1-2 WebFetch queries with clear targets (use WebFetch directly)
- Checking a single documentation page
- Quick lookups of known information

---

[dev-rules-arc]: ../../../.arc/reference/constitution/DEV-RULES.ARC.md
[dev-rules]: ../../reference/constitution/DEV-RULES.PROJECT.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md
