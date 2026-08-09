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

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit, no exceptions · `[invariant]`.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1),
integration checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and
pre-PR (Tier 3). See [Quality Gates Strategy][quality-gates] for tier definitions, escalation guidance,
and task list integration.

<!-- Record each gate's command in QUICK-REFERENCE § Quality Gate Commands, not here. -->

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

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

<!-- Add language-specific or framework-specific standards below. Examples: -->
<!-- "Strict TypeScript with no `any` types except at validated system boundaries" -->
<!-- "Python type hints on all public functions" -->
<!-- "Go error handling: always check, never ignore" -->

## Documentation Standards

### Markdown quality

- **Line length**: 120 characters (enforced by markdownlint) — wrap at natural phrase boundaries near the target
  width. Linting catches overflow but not underfill — consistently short lines (60-90 chars) are the more common
  failure. Bullet continuations, multi-line field values, and bulleted-list entries follow the same target.

### Documentation style

- **Collaborative voice**: Commits, task lists, and project docs read as the work's author would write them — an
  author or team perspective, never a transcript of human-AI interaction. "Approved after review", "Pending
  review", "Decided to defer this" — not "The user approved the approach", "Pending user review".

- **Reference-style links**: Prefer reference-style links for cross-file references, with the definitions collected
  after one trailing `---` per file — the separator doubles as the EOF indicator, since link definitions render
  invisibly. Names are lowercase, descriptive, hyphenated (`[dev-rules]`); short links (same directory or one level
  up) may stay inline; movable ARC WU artifacts use filename-only references per [DEV-RULES.ARC][dev-rules-arc].

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

- **Atomic work for this work unit** → fold into the commit, or spin an Errand
- **Atomic work for later** → resolver-backed identity-global `user/{identity}/USER-INBOX.md` § Errand
- **Multi-step work for later** → appropriate backlog file or existing draft document

See [DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing for the full routing table.

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions as ADRs in `.arc/reference/adr/`. See [ADR Methodology
Strategy][adr-methodology] for decision criteria, the three-tier stability model, and amendment vs. supersession.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[quality-gates]: ../../reference/strategies/arc/strategy-quality-gates.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
