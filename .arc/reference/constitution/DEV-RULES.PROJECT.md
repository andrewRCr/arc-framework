# Development Rules (Project)

Project-specific development standards. Quality gates, testing requirements, documentation style, file
organization, and architecture rules.

For ARC methodology rules (commit discipline, task execution, session management, verification), see
[DEV-RULES.ARC][dev-rules-arc].

**Domain-scoped rules:** Teams can split domain-specific rules into separate files — e.g.,
`DEV-RULES.FRONTEND.md`, `DEV-RULES.AUTH.md`. Domain rule files live alongside this file in
`constitution/` and are loaded on-demand when work touches the relevant domain, not every session.
Use this when a domain's rules are substantial enough to warrant separation.

---

## Contents

- [Quality Gates](#quality-gates) — checks and enforcement
- [Testing Requirements](#testing-requirements) — test strategy and coverage
- [Code Quality Principles](#code-quality-principles) — engineering standards
- [Documentation Standards](#documentation-standards) — markdown quality, style conventions
- [File Organization](#file-organization) — directory structure and boundaries
- [Architecture Documentation](#architecture-documentation) — ADRs and design records

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit. No exceptions.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1), integration
checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and pre-PR (Tier 3). See
[Quality Gates Strategy][quality-gates] for tier definitions, escalation guidance, and task list integration.

<!-- Customize: List your project's quality checks with their commands. Replace or extend these examples.
     Common checks by project type:
     - Web app: linting, type checking, unit tests, E2E tests, build
     - CLI: build, unit tests, lint, type-check
     - Library: tests, lint, docs generation
     - Docs-only: markdown linting, link checking -->

1. **Linting**: Zero violations
   - Command: `npm run lint`

2. **Type Checking**: Zero errors
   - Command: `npm run typecheck`

3. **Tests**: All passing
   - Command: `npm test`

4. **CI Validation**: All checks pass
   - Runs automatically on push/PR

## Testing Requirements

<!-- Customize: Define your project's testing strategy. -->

- **Test-first assessment**: See [DEV-RULES.ARC][dev-rules-arc] for when to write tests before vs. after
  implementation
- **Integration focus**: Prefer flow-level coverage over isolated units when practical
- **All tests must pass** before any commit (see Quality Gates above)
- **Detailed guidance**: Create a project testing strategy as patterns emerge
  (see [STRATEGY-INDEX][strategy-index] for guidance on project strategies)

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

<!-- Customize: Add architecture-specific subsections for your project's non-negotiable patterns.
     Examples: Layered Architecture, Component Styling, Import Standards, Command Structure,
     Public API Conventions. State the rule, give a brief rationale, and reference the relevant
     strategy doc if one exists. -->

## Documentation Standards

### Markdown quality

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- **Line length**: 120 characters (enforced by markdownlint). Use the full target width — don't wrap prematurely.
- Always run markdown linting after updating documentation files

### Documentation style

<!-- These conventions ship as ARC defaults. Customize by editing this section directly. -->

- **Collaborative voice**: Commits, task lists, and project docs should read naturally from an author or team
  perspective — not as a transcript of human-AI interaction. Write as the work's author would.
    - ❌ "The user approved the approach", "Pending user review", "User requested we defer this"
    - ✅ "Approved after review", "Pending review", "Decided to defer this to next phase"

- **Reference-style links**: Prefer reference-style links for cross-file references. Collect link definitions at
  the end of the file after a `---` separator. The separator doubles as a consistent EOF indicator — link
  definitions are invisible in rendered output, so the horizontal rule is the last visible element.
    - Reference names: lowercase, descriptive, hyphenated (e.g., `[dev-rules]`, `[process-loop]`)
    - One `---` + link block per file, always at the very end
    - Short links (same directory or one level up) may remain inline at author discretion

## File Organization

<!-- Customize: Define your project's directory structure and boundaries. -->

- `.arc/` = ARC methodology files (reference/, system/, active/, backlog/)
- Separate concerns: keep production code, tests, and configuration in distinct directories
- Template files clearly marked as `.template.md` and copy-ready

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions in ADRs (`.arc/reference/adr/`). ADRs capture the context, decision,
and consequences of important design choices, serving as historical record and reference for understanding system
constraints.

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

ADRs are stable once accepted — corrections and amendments are permitted under the three-tier model
in [ADR Methodology Strategy][adr-methodology], but the decision itself changes only through supersession.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[quality-gates]: ../strategies/arc/strategy-quality-gates.md
[strategy-index]: ../strategies/STRATEGY-INDEX.md
[adr-methodology]: ../strategies/arc/strategy-adr-methodology.md
