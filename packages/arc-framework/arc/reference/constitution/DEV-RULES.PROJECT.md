# Development Rules (Project)

<!-- Project-specific development standards — filled during project definition
     (02_define-project § Step 5). Quality gates, testing, code quality, and architecture
     rules for YOUR project. ARC methodology rules (commit discipline, task execution,
     session management) live in DEV-RULES.ARC.md and apply universally. -->

Project-specific development standards for [project name]. Quality gates, testing requirements,
documentation style, file organization, and architecture rules.

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
- [Capture Routing](#capture-routing) — where deferred issues go
- [Architecture Documentation](#architecture-documentation) — ADRs and design records

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit. No exceptions.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1),
integration checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and
pre-PR (Tier 3). See [Quality Gates Strategy][quality-gates] for tier definitions, escalation guidance,
and task list integration.

<!-- List your quality gate tools. Each gate needs: name, command, config location. -->
<!-- Commands here should match QUICK-REFERENCE § Quality Gate Commands. -->

1. **[Linter/Formatter]**: Zero violations
   - Command: `[lint_command]`
   - Config: `[config_path]`

2. **[Type Checker]**: Zero errors
   - Command: `[typecheck_command]`
   - Config: `[config_path]`

3. **[Test Runner]**: All pass
   - Command: `[test_command]`

4. **[Build Tool]**: Succeeds
   - Command: `[build_command]`

<!-- Add or remove gates to match your stack. Common additions: -->
<!-- security scanning, license checking, bundle size limits, API schema validation -->

## Testing Requirements

<!-- Describe your test strategy: framework, directory structure, what each tier covers. -->

**Test framework:** [framework name]

<!-- Example structure — adapt to your project: -->
<!-- - **Unit**: Pure function tests, no side effects -->
<!-- - **Integration**: Module interaction tests, may use test databases -->
<!-- - **E2E**: Full application tests against running services -->

**Coverage expectations:** [your coverage philosophy — percentage targets, meaningful assertions,
or focus areas]

**Markdown linting** remains the primary quality gate for `.arc/` documentation alongside code quality.

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

<!-- Add language-specific or framework-specific standards below. Examples: -->
<!-- "Strict TypeScript with no `any` types except at validated system boundaries" -->
<!-- "Python type hints on all public functions" -->
<!-- "Go error handling: always check, never ignore" -->

## Documentation Standards

### Markdown quality

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- Always run markdown linting after updating documentation files
- **Line length**: 120 characters (enforced by markdownlint). Use the full target width — don't wrap prematurely at
  80-90 characters. Linting catches overflow but not underfill; consistently short lines waste space, hurt readability
  in wide content (tables, task lists, rationale blocks), and compound over time as subsequent edits match the short
  pattern. Bullet continuations, multi-line field values, and bulleted-list entries (SESSION-NOTES, status-file
  fields) are common over-wrapping sites — same target applies. Wrap at natural phrase boundaries near 120.

### Documentation style

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
    - Exception: movable ARC WU artifacts use filename-only references per DEV-RULES.ARC

## File Organization

<!-- Describe your project's directory structure — what goes where and why. -->

- `.arc/` - Development documentation (constitution, strategies, workflows, active tasks)
- `[src_dir]/` - [description]
- `[test_dir]/` - [description]

## Capture Routing

<!-- How deferred issues are tracked depends on your PM mode. -->
<!-- arc-in-git: use ARC's built-in capture surfaces (shown below). -->
<!-- external: route to your tracker per project convention. -->
<!-- none: define your convention or ask the user. -->

Using `pm.mode: arc-in-git` — deferred work routes through ARC's built-in capture surfaces:

- **Atomic tasks for this work unit** → atomic companion file (`atomic-{name}.md`)
- **Atomic tasks for later** → `user/{identity}/ATOMIC-INBOX.md`
- **Multi-step work for later** → appropriate backlog file or existing plan document

See [DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner for the full routing table.

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

ADRs are stable once accepted — corrections and amendments are permitted under the three-tier model
in [ADR Methodology Strategy][adr-methodology], but the decision itself changes only through supersession.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[quality-gates]: ../strategies/arc/strategy-quality-gates.md
[adr-methodology]: ../strategies/arc/strategy-adr-methodology.md
