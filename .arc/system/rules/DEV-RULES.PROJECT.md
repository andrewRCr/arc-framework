# Development Rules (Project)

Project-specific development standards for the ARC framework. Quality gates, testing requirements,
documentation style, file organization, and architecture rules.

For ARC methodology rules (commit discipline, task execution, session management, verification), see
[DEV-RULES.ARC][dev-rules-arc].

---

## Contents

- [Quality Gates](#quality-gates) — checks and enforcement
- [Testing Requirements](#testing-requirements) — test strategy and coverage
- [Code Quality Principles](#code-quality-principles) — engineering standards
- [Documentation Standards](#documentation-standards) — markdown quality, style conventions
- [Package-Project Sync](#package-project-sync) — two-copy discipline for framework files
- [Audience Boundaries](#audience-boundaries) — adopter-facing vs. internal-dev-facing surfaces
- [Capture Routing](#capture-routing) — where deferred issues go
- [Architecture Documentation](#architecture-documentation) — ADRs and design records

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit. No exceptions.

**Tiered approach** — T1 per-task, T2 per-unit, T3 pre-PR. See [Quality Gates Strategy][quality-gates].

1. **Markdown Linting**: Zero violations
    - Command: `npm run -s lint:md`
    - Auto-fix: `npm run -s lint:md:fix`
    - Table alignment (`MD060`): `lint:md:fix` does **not** realign table columns — fix the affected file with
      `npx --yes markdown-table-formatter <file>` (explicit single file; never argless — it cwd-globs `**/*.md`
      and can rewrite unrelated tables). Interim until `markdown-formatting` ships a scoped `format:tables`.
    - Config: `.markdownlint-cli2.jsonc`

2. **Code Linting**: Zero violations
    - TypeScript: `npm run lint:ts` — config: `packages/arc-framework/eslint.config.js`
      (typescript-eslint recommended-type-checked)
    - Shell: `npm run lint:sh` — requires system-installed `shellcheck` on developer machines

3. **TypeScript Type Checking**: Zero errors
    - Source: `npm run typecheck` — config `packages/arc-framework/tsconfig.json` (strict; excludes `__tests__`)
    - Tests: `npm run typecheck:test` — config `packages/arc-framework/tsconfig.test.json`
    - Both at once: `npm run typecheck:all`
    - Test files typecheck under a separate config; Vitest's esbuild transpile skips type-checking, so a
      test-only type error passes a source-only check and surfaces only at commit. Run both before declaring
      types green — especially after editing a shared or exported type.

4. **Tests**: All pass
    - Command: `npm test` (full suite), `npm run test:unit` (unit only)
    - Framework: Vitest
    - Config: `packages/arc-framework/vitest.config.ts`

5. **Build**: Succeeds
    - Command: `npm run build`
    - Tooling: tsup (ESM output, declarations, shebang injection)

## Testing Requirements

**Test framework:** Vitest. Three test tiers under `packages/arc-framework/__tests__/`
(unit / integration / e2e).

**Coverage expectations:** Business logic and core libraries should have unit test coverage.
Commands are validated through integration and E2E tests. No hard coverage percentage target —
meaningful assertions over line counting.

**Testing methodology:** See [Testing Methodology Strategy][testing-methodology] — TDD decision
tree, tier details, mocking rules (including Vitest mock mechanics), vertical slice workflow,
test naming conventions.

## Code Quality Principles

Apply standard software engineering principles:

- **DRY** (don't repeat yourself)
- **SOLID** (single responsibility, open/closed, dependency inversion)
- **KISS** (keep it simple)
- **YAGNI** (you aren't gonna need it)

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
- **Line length**: 120 characters — wrap at natural phrase boundaries near the target width. Linting catches
  overflow but not underfill — consistently short lines (60-90 chars) are the more common failure than overflow.
  Bullet continuations, multi-line field values, and SESSION-NOTES entries follow the same target.

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
    - Exception: movable ARC WU artifacts use filename-only references per [DEV-RULES.ARC][dev-rules-arc]

### Workflow prose economy

When authoring or editing a workflow, write for the agent *executing* it, not a reader evaluating the
design. Judge each line by one test: **does a session executing this need it to act correctly?** Keep
procedure and load-bearing constraints — the rule, the format, when to skip; cut author-facing justification
— "what this is / isn't" framing, why-a-rule-exists rationale, and restatements an adjacent inline hint
already carries. Full convention: [strategy-workflow-authoring][workflow-authoring] § Body Conventions
(Prose economy).

## Package-Project Sync

This repo has two copies of ARC framework content: `packages/arc-framework/arc/` (authoritative
source, ships to adopters) and `.arc/` (project instance). Methodology edits to Framework files
go through the package source and sync to `.arc/` — not the other way around. Configurable files
are edited in `.arc/` (project-specific sections) or package source (framework sections); never
`cp` between copies — that overwrites project-specific overrides silently.

Pre-commit hooks (a) warn when Framework files are edited in `.arc/` without the package
counterpart staged, and (b) error when a Configurable file in `.arc/` is staged byte-identical to
the package source after diverging at HEAD (the blind-`cp` signature). See
[Package-Project Sync Strategy][package-sync] for the full architecture, dependency map, and
template handling guidance.

**Self-hosting skill-file drift:** The harness-local skill directories (`.claude/skills/`,
`.codex/skills/`, `.gemini/skills/`, etc. — all gitignored) are regenerated deterministically by
`arc update` for adopters. This repo doesn't run `arc update` against itself, so those harness
copies can drift from canonical sources in `.arc/system/.internal/skills/` and
`packages/arc-framework/arc/system/.internal/skills/` when canonical content changes. On a fresh
self-hosting session, if a skill's behavior surprises you, suspect drift — hand-sync by copying
the canonical `SKILL.md` into the harness subdirectory. Adopters aren't affected; their harness
copies regenerate on every `arc update`.

## Audience Boundaries

The two-copy architecture (see § Package-Project Sync) creates two distinct audiences. Content
appropriate for one is often inappropriate for the other.

### Surface taxonomy

**Adopter-facing** — read by users of ARC; ships via the package source:

- `.arc/system/**`
- `.arc/reference/strategies/arc/**`
- `.arc/system/rules/DEV-RULES.ARC.md`
- `.arc/reference/templates/**`
- `.arc/reference/QUICK-REFERENCE.md`

State what is. Don't describe how the methodology arrived at its current shape, what's
in-flight, or what's coming.

**Internal-dev-facing** — read only by people developing ARC; doesn't ship:

- `.arc/reference/strategies/project/**`
- `.arc/reference/adr/**`
- `.arc/reference/PROJECT-PRD.md`
- `.arc/system/rules/DEV-RULES.PROJECT.md` (this file)
- `.arc/active/**`, `.arc/backlog/**`, `.arc/user/**`
- `.arc/reference/briefs/AGENT-BRIEF.PROJECT.md`
- Any `notes-*.md` companion to a WU

These reference internal WU names, in-flight scope, transitional state, and project-internal
concerns freely.

### Leak patterns to avoid in adopter-facing content

- Transitional framing ("under the old model", "until X ships", "pre-CLI",
  "now hand-maintained")
- Project-internal migration concerns for ARC's own evolution ("forward-only migration",
  "backward-compat tooling")
- Forward-pointers to internal-roadmap scope (active or backlog WUs — planned or provisional) —
  adopters don't share ARC's internal roadmap
- `adopter`/`adopters` — framework-author POV on the reader. Use neutral framing ("projects",
  "teams", actor-omitted). Internal-dev surfaces keep it (their audience).

Route such concerns to internal-dev surfaces instead: WU notes for in-flight context; ADR or
PROJECT-PRD for directional decisions; project strategies for conventions that don't apply to
adopters.

### Package-source mirror inheritance

Anything mirrored to `packages/arc-framework/arc/**` is adopter-facing by definition (it ships).
The `.arc/` copy inherits the classification.

### Relationship to DEV-RULES.ARC § Documentation Boundaries

Planning-artifact references — task IDs, R-IDs, phase numbers, ADR numbers, named processes /
methods / workflows, `.arc/` doc paths — are handled by DEV-RULES.ARC § Documentation
Boundaries; that rule prohibits them across code, tests, and durable documentation including
strategies. This section adds the orthogonal **adopter vs. internal-dev** concerns above
(transitional framing, project-internal migration, future-scope pointers) within methodology
surfaces. Both apply.

---

## Capture Routing

Using `pm.mode: arc-in-git` — deferred work routes through ARC's built-in capture surfaces.
See [DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing for the full routing table.

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions as ADRs in `.arc/reference/adr/`.
See [ADR Methodology Strategy][adr-methodology] — decision criteria, three-tier stability model,
amendment vs. supersession.

**ADRs are internal-only.** They live in `.arc/reference/adr/` and don't ship to adopters. Don't
reference ADRs from `strategies/arc/` (packaged via `npx arc update`), docs-site content, or any
other adopter-facing material — adopters don't have them and following the link goes nowhere.
Project strategies (`strategies/project/`) and other internal-only docs may reference ADRs freely;
that directory ships to adopters as an empty surface for their own strategies. Operational
rationale that adopters need must stand alone in the adopter-facing source; rationale that doesn't
earn that placement stays in the ADR itself or routes to whatever capture surface the project uses
for docs-site content.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[quality-gates]: ../../reference/strategies/arc/strategy-quality-gates.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
[testing-methodology]: ../../reference/strategies/project/strategy-testing-methodology.md
[package-sync]: ../../reference/strategies/project/strategy-package-project-sync.md
[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
