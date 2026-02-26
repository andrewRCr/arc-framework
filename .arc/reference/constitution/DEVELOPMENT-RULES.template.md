# Development Rules - {{PROJECT_NAME}}

<!-- Version tracks your project's rule evolution, not the ARC framework version.
     Increment when rules change substantively. Use any scheme that works for your team. -->
**Version:** {{VERSION}} | **Updated:** {{DATE}} | **Hash:** `{{HASH}}`

Core development rules and quality standards for {{PROJECT_NAME}}. These rules are **non-negotiable** and must be
followed by all contributors, including AI assistants.

**For command patterns and environment context**, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).
**For session initialization protocol**, see [session-init.md](../../system/workflows/arc/supplemental/session-init.md).
**For development methodology** (commit standards, verification, session management, task protocols), see
[Development Methodology Strategy](../strategies/arc/strategy-development-methodology.md).

## Quality Gates

**Zero Tolerance Policy:** Whatever checks you run, they must pass. No ignoring failures, no exceptions.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1),
integration checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and
pre-PR (Tier 3). See [Quality Gates Strategy](../strategies/arc/strategy-quality-gates.md) for complete
tier definitions, escalation guidance, and task list integration.

**Full Suite (Tier 3)** - Required for phase completion and pre-PR.
For specific commands, see [QUICK-REFERENCE.md](../QUICK-REFERENCE.md).

<!-- List your project's quality checks here. The items below are examples for a
     web app with backend/frontend — adjust to match your project's stack. A CLI
     might have: build, unit tests, lint, type-check. A library might have: tests,
     lint, docs generation. The key is: list every check, with its command. -->

1. **{{QUALITY_CHECK_1}}**: {{PASS_CRITERIA}}
   - Command: `{{QUALITY_CHECK_CMD}}`

2. **{{QUALITY_CHECK_2}}**: {{PASS_CRITERIA}}
   - Command: `{{QUALITY_CHECK_CMD}}`

3. **Type Checking**: Zero errors
   - Command: `{{TYPE_CHECK_CMD}}`

4. **Markdown Linting**
   - Use markdownlint-cli2 via npx with auto-fix
   - Config: `.markdownlint-cli2.jsonc`

## Testing Requirements

- **Test-first protocol**: See [Development Methodology Strategy](../strategies/arc/strategy-development-methodology.md#test-first-protocol)
  for when to write tests before vs. after implementation
- **Integration focus**: Prefer flow-level coverage over isolated units when practical
- **All tests must pass** before any commit discussion (see quality gates above)
- **Command patterns**: See [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) for execution commands
- **Detailed guidance**: See your project's testing methodology strategy if you've created one
  (see [STRATEGY-INDEX.md](../strategies/STRATEGY-INDEX.md) for guidance on project strategies)

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

<!-- Add architecture-specific subsections relevant to your project. These should
     capture the non-negotiable patterns that apply across all work in that area.
     Examples:
     - Web app: Layered Architecture (Backend), Component Styling (Frontend), Import Standards
     - CLI: Command Structure, Configuration Patterns, Output Formatting
     - Library: Public API Conventions, Backward Compatibility, Extension Points
     - Monorepo: Package Boundaries, Shared Code Policy, Dependency Direction

     For each subsection: state the rule, give a brief rationale or "rule of thumb",
     and reference the relevant strategy doc if one exists. -->

### {{ARCHITECTURE_RULE_1}}

{{RULE_DESCRIPTION}}

**Rule of thumb:** {{QUICK_HEURISTIC}}

### {{ARCHITECTURE_RULE_2}}

{{RULE_DESCRIPTION}}

**Rule of thumb:** {{QUICK_HEURISTIC}}

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions in ADRs (`.arc/reference/adr/`). ADRs capture the context,
decision, and consequences of important design choices, serving as historical record and reference for
understanding system constraints.

**Write an ADR when:**

- Decision affects system structure or external contracts
- Multiple alternatives were considered
- Decision driven by external constraint (API limitations, regulatory requirements)
- Future developers will ask "why did we do it this way?"
- Decision could be reversed later (context needed for reversal)

**Don't write an ADR for:**

- Purely tactical implementation choices (variable names, loop constructs)
- Decisions obvious from reading code (standard CRUD, framework conventions)
- Temporary or experimental choices

**Format and guidance:** See [ADR Methodology Strategy](../strategies/arc/strategy-adr-methodology.md)
**Template:** See `.arc/reference/templates/template-adr.md`

ADRs are immutable once accepted - new decisions require new ADRs that supersede old ones.

## Reference Documentation

This document provides project-specific rules and standards. See related documentation:

- [Development Methodology Strategy](../strategies/arc/strategy-development-methodology.md) - Commit standards,
  verification, session management, task protocols
- [Quality Gates Strategy](../strategies/arc/strategy-quality-gates.md) - Tiered quality gate system
- [QUICK-REFERENCE.md](../QUICK-REFERENCE.md) - Environment context, command patterns, and tool usage
- [Task Processing Workflow](../../system/workflows/arc/3_process-task-loop.md) - Detailed task execution workflow
- [Commit Workflow](../../system/workflows/arc/supplemental/atomic-commit.md) - Complex commit scenarios and atomicity
  analysis
- [AI Agent Reference Card](../../system/agent/AGENTS.md) - Complete project context for AI
- [Technical Overview](TECHNICAL-OVERVIEW.md) - System architecture and technology stack
- [ADR Methodology Strategy](../strategies/arc/strategy-adr-methodology.md) - Architecture decision record guidance
- [STRATEGY-INDEX.md](../strategies/STRATEGY-INDEX.md) - Index of all strategy documents (ARC and project)
