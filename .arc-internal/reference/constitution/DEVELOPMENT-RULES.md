# Development Rules - ARC Agentic Development Framework

<!-- Version tracks project rule evolution, not the ARC framework version. -->
**Version:** 0.3.0-dev | **Updated:** 2025-12-26 | **Hash:** `8c5f2a91`

Core development rules and quality standards for the ARC framework. These rules are **non-negotiable** and must be followed
by all contributors, including AI assistants.

**For command patterns and environment context**, see [QUICK-REFERENCE.md][quick-ref].
**For session initialization protocol**, see [session-init.md][session-init].
**For development methodology** (commit standards, verification, session management, task protocols), see
[Development Methodology Strategy][dev-methodology].

## Quality Gates (Zero Tolerance)

Before any commit consideration, ALL of the following must pass with **zero exceptions**.
For specific commands, see [QUICK-REFERENCE.md][quick-ref].

**Zero Tolerance Policy:** All errors, violations, and failures must be fixed. No exceptions.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1),
integration checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and
pre-PR (Tier 3). See [Quality Gates Strategy][quality-gates]
for complete tier definitions, escalation guidance, and task list integration.

1. **Markdown Linting**: Zero violations
   - Command: `npx --yes markdownlint-cli2 "**/*.md"`
   - Auto-fix: `npx --yes markdownlint-cli2 --fix "**/*.md"`
   - Config: `.markdownlint-cli2.jsonc`

2. **CI Validation**: All checks pass
   - GitHub Actions runs automatically on push/PR
   - Markdown linting (zero violations policy)
   - Template structure validation
   - Internal link checking

## Testing Requirements

**N/A for documentation-only framework** - markdown linting serves as primary quality gate

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

## Framework-Specific Rules

### Documentation Standards

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- Template-first documents with comprehensive inline guidance and framework defaults
- Templates clearly marked as `.template.md` and copy-ready
- READMEs required for each directory
- ALWAYS run markdown linting after updating any documentation files

### File Organization

- `.arc/` = the deployable template system (permanent, versioned)
- `.arc-internal/` = framework development workspace (internal use only)
- Template-first documents in `.arc/reference/constitution/`, `.arc/system/agent/`
- Core workflows in `.arc/system/workflows/`

### Commit Standards

- **Pre-commit checks**: Run markdown linting before committing (zero tolerance)
- **Reference META-PRD context** and task documentation in commit messages
- **Use conventional commit format**: Required (feat:, docs:, fix:, refactor:, etc.)
- **Atomic commits** for single logical changes
- **Multi-line commits**: If `git commit -m` causes interactive editor issues, use file approach:

  ```bash
  # Create commit message file
  cat > /tmp/commit_msg.txt << 'EOF'
  type(scope): Brief description

  - Detailed change 1
  - Detailed change 2
  - Impact/rationale
  EOF

  # Commit using file
  git commit -F /tmp/commit_msg.txt
  rm /tmp/commit_msg.txt
  ```

- **Never commit if**:
    - Documentation is inconsistent
    - Markdown linting fails
    - CI checks would fail
    - Task documentation doesn't align with changes

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

**Format and guidance:** See [ADR Methodology Strategy][adr-methodology]

ADRs are immutable once accepted - new decisions require new ADRs that supersede old ones.

## Reference Documentation

This document provides project-specific rules and standards. See related documentation:

- [Development Methodology Strategy][dev-methodology] -
  Commit standards, verification, session management, task protocols
- [Quality Gates Strategy][quality-gates] - Tiered quality gate system
- [QUICK-REFERENCE.md][quick-ref] - Environment context, command patterns, and tool usage
- [Task Processing Workflow][process-task-loop] - Detailed task execution workflow
- [Commit Workflow][atomic-commit] - Complex commit scenarios,
  atomicity analysis
- [AI Agent Reference Card][agents] - Complete project context for AI
- [ADR Methodology Strategy][adr-methodology] - ADR guidance

---

[quick-ref]: ../QUICK-REFERENCE.md
[session-init]: ../../system/workflows/arc/supplemental/session-init.md
[dev-methodology]: ../../../.arc/reference/strategies/arc/strategy-development-methodology.md
[quality-gates]: ../../../.arc/reference/strategies/arc/strategy-quality-gates.md
[adr-methodology]: ../../../.arc/reference/strategies/arc/strategy-adr-methodology.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md
[atomic-commit]: ../../../.arc/system/workflows/arc/supplemental/atomic-commit.md
[agents]: ../../system/agent/AGENTS.md
