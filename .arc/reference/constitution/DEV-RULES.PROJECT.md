# Development Rules (Project)

Project-specific development standards for the ARC framework. Quality gates, testing requirements,
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
- [Package-Project Sync](#package-project-sync) — two-copy discipline for framework files
- [Architecture Documentation](#architecture-documentation) — ADRs and design records

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit. No exceptions.

**Tiered Approach:** Quality gates follow a tiered system — fast incremental checks per-task (Tier 1),
integration checkpoints at coherent unit boundaries (Tier 2), and full suite for phase completion and
pre-PR (Tier 3). See [Quality Gates Strategy][quality-gates] for tier definitions, escalation guidance,
and task list integration.

1. **Markdown Linting**: Zero violations
    - Command: `npm run -s lint:md`
    - Auto-fix: `npm run -s lint:md:fix`
    - Config: `.markdownlint-cli2.jsonc`

2. **Code Linting**: Zero violations
    - TypeScript: `npm run lint:ts` — config: `packages/arc-framework/eslint.config.js`
      (typescript-eslint recommended-type-checked)
    - Shell: `npm run lint:sh` — shellcheck on githooks and system scripts. Requires
      system-installed `shellcheck` (`apt-get install shellcheck`, `brew install shellcheck`,
      or equivalent) on developer machines; CI runners provide it preinstalled.

3. **TypeScript Type Checking**: Zero errors
    - Command: `npm run typecheck`
    - Config: `packages/arc-framework/tsconfig.json` (strict mode)

4. **Tests**: All pass
    - Command: `npm test` (full suite), `npm run test:unit` (unit only)
    - Framework: Vitest
    - Config: `packages/arc-framework/vitest.config.ts`

5. **Build**: Succeeds
    - Command: `npm run build`
    - Tooling: tsup (ESM output, declarations, shebang injection)

6. **CI Validation**: All checks pass
    - GitHub Actions runs automatically on push/PR
    - Markdown linting, code linting (zero violations policy)
    - TypeScript type checking, test suite, build verification
    - Template structure validation
    - Internal link checking

## Testing Requirements

**Test framework:** Vitest with three test tiers matching the directory structure:

- **Unit** (`__tests__/unit/`): Pure function and module tests, no filesystem or process side effects.
  Fast, isolated, run on every change.
- **Integration** (`__tests__/integration/`): Module interaction tests. May touch the filesystem
  via temp directories but no external services.
- **E2E** (`__tests__/e2e/`): Full CLI invocation tests. Run `arc init`, `arc update`, etc. against
  real (temporary) git repos to validate end-to-end behavior.

**Coverage expectations:** Business logic and core libraries should have unit test coverage. Commands
are validated through integration and E2E tests. No hard coverage percentage target — focus on
meaningful assertions over line counting.

**Testing methodology:** See [Testing Methodology Strategy][testing-methodology] for the full
approach — TDD decision tree, mocking rules, vertical slice workflow, test naming conventions.

**Mock hygiene (Vitest unit tests):**

- **Hoist every `vi.fn()` to an external `const`.** Never inline `vi.fn()` inside a `vi.mock(...)`
  factory return — the factory returns arrow-function forwarders to externally-declared mocks
  instead. Without this, a test can't reset the mock's state because it holds no reference.
- **Use `vi.resetAllMocks()` in `beforeEach`, not `vi.clearAllMocks()`.** `clearAllMocks` wipes
  call history but preserves `.mockResolvedValue` / `.mockImplementation` across tests, silently
  leaking state. `resetAllMocks` blanks both.
- **Re-establish defaults after reset.** `vi.resetAllMocks()` also wipes construction-time
  defaults passed to `vi.fn(impl)` (Vitest 3.x behavior). Every mock with a default must have it
  re-established in `beforeEach` — preferably via a single `resetMockDefaults()` helper at the
  top of the file.

Why this matters: mock bleed across tests produces order-dependent failures that are hard to
diagnose and easy to paper over with ad-hoc resets. The uniform rule eliminates the footgun
class entirely.

**Markdown linting** remains the primary quality gate for `.arc/` documentation alongside code quality.

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

Separate concerns, prefer composition over duplication, favor readability when principles conflict.

**TypeScript standards:**

- Strict mode with `noUncheckedIndexedAccess` — no `any` types except at validated system boundaries
- ESM throughout (`type: "module"`, Node16 module resolution)
- Prefer explicit return types on exported functions
- Use `unknown` over `any` for external data; validate and narrow before use
- TSDoc on exported API surface: `@param`, `@returns` on exported functions; file-level doc comment
  describing the module's purpose

## Documentation Standards

### Markdown quality

- All `.md` files must be well-formed Markdown (zero tolerance for linting failures)
- Template-first documents with comprehensive inline guidance and framework defaults
- READMEs required for each directory
- Always run markdown linting after updating documentation files
- **Line length**: 120 characters (enforced by markdownlint). Use the full target width — don't wrap prematurely at
  80-90 characters. Linting catches overflow but not underfill; consistently short lines waste space, hurt readability
  in wide content (tables, task lists, rationale blocks), and compound over time as subsequent edits match the short
  pattern. Wrap at natural phrase boundaries near the target width.

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

## File Organization

- `.arc/` = the ARC methodology (reference/, system/, active/, backlog/)
- `packages/arc-framework/` = CLI npm package (`@arc-framework/cli`)
- Separate concerns: keep production code, tests, and configuration in distinct directories

## Package-Project Sync

This repo has two copies of ARC framework content: `packages/arc-framework/arc/` (authoritative
source, ships to adopters) and `.arc/` (project instance). Methodology edits to Framework files
go through the package source and sync to `.arc/` — not the other way around. Configurable files
are edited in `.arc/` (project-specific sections) or package source (framework sections).

A pre-commit hook warns when Framework files are edited in `.arc/` without the package counterpart
staged. See [Package-Project Sync Strategy][package-sync] for the full architecture, dependency
map, and template handling guidance.

## Capture Routing

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
[testing-methodology]: ../strategies/project/strategy-testing-methodology.md
[package-sync]: ../strategies/project/strategy-package-project-sync.md
