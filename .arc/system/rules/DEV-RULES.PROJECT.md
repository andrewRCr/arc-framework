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
- [Commit Conventions (self-hosting)](#commit-conventions-self-hosting) — scope and type adherence in this repo
- [Package-Project Sync](#package-project-sync) — two-copy discipline for framework files
- [Audience Boundaries](#audience-boundaries) — adopter-facing vs. internal-dev-facing surfaces
- [Capture Routing](#capture-routing) — where deferred issues go
- [Architecture Documentation](#architecture-documentation) — ADRs and design records

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit. No exceptions.

**Tiered approach** — T1 per-task, T2 per-unit, T3 pre-PR. See [Quality Gates Strategy][quality-gates].
Commands and their measured cost: [QUICK-REFERENCE][quick-ref] § Quality Gate Commands.

### Selecting what to run

Zero tolerance governs what must **pass**, not how often each check is **re-executed**. Two conditions narrow a
run, and both resolve mechanically from `git diff --name-only` — never from a judgment call about blast radius.
When neither settles it cleanly, run everything: the deciding is not worth more than the checks cost.

**Relevance — run what the change reaches.** Deliberately asymmetric. Skip the expensive checks a change
provably cannot affect; never spend thought on the cheap ones.

| Changed paths                  | Run                                     | Skip                                     |
| ------------------------------ | --------------------------------------- | ---------------------------------------- |
| Markdown only                  | Markdown lint + the ARC contract checks | the code checks (~100s of them at T2/T3) |
| No Markdown touched            | The code checks                         | nothing — the Markdown side costs ~7.6s  |
| Mixed, config, or unrecognized | Everything                              | nothing — fail closed                    |

The ARC contract checks (`lint:arc:triggers`, `lint:arc:domain-rules`, `lint:arc:section-refs`) validate
methodology artifacts rather than code, are corpus-wide by design, and cost ~0.7s combined — so they ride with
any Markdown change and never earn a relevance carve-out of their own. They are also required in CI: omitting
them locally produces a false green rather than a saving.

Build and tooling config (`package.json`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`) counts as
code: it reaches every check.

**Unchanged tree — a completed tier is not re-executed over an unchanged tree.** A green result stays valid
until an input it covers changes. When a boundary calls for a tier that already ran green and the delta since
reaches nothing that tier covers, report it as already satisfied instead of re-running it; a skip that goes
unrecorded reads as coverage nobody actually has. This narrows repeat runs of the same tier — it never licenses
running a tier partially, and Tier 3 in particular is still run whole.

Re-running **is** warranted after a base merge, after any review-driven fix, and at the first full-suite
attestation of composed work — each introduces state no prior run saw.

1. **Markdown Linting**: Zero violations
    - **Authoritative gate (pre-commit):** `npm run -s lint:md:staged` — certifies the **git index** (what will
      commit), not the worktree. Same rule config as the worktree run (`.markdownlint-cli2.jsonc`); the false-
      green trap is **index vs worktree bytes**, not a second rule set. After every fix, **re-stage** before
      re-running — otherwise findings target already-corrected worktree lines and look spurious.
    - Worktree check: `npm run -s lint:md` — mid-edit composition over worktree files. On a clean lint it also
      **fails closed** when any staged Markdown-gate path still differs in the worktree (so a green worktree
      run cannot hide a dirty index). Still not a substitute for `lint:md:staged` before commit when you want
      the full index certification (deps + checker alignment).
    - Auto-fix: `npm run -s lint:md:fix` clears many rules (including MD049 emphasis-style) but **not**
      MD060 table alignment — use `npm run format:tables -- <file> [<file> ...]` (explicit tracked paths;
      source-first Framework projection; does not rewrite surrounding prose).
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

6. **ARC Contract Checks**: Zero violations
    - Commands: `npm run -s lint:arc:triggers`, `npm run -s lint:arc:domain-rules`,
      `npm run -s lint:arc:section-refs`
    - Validate methodology artifacts — declared method fire-points, domain-rules frontmatter, and `§` section
      references across the corpus. **Required in CI**, and the family most often missed locally; see
      [QUICK-REFERENCE][quick-ref] § Quality Gate Commands for the parity rule.

## Testing Requirements

**Test framework:** Vitest. Three test tiers under `packages/arc-framework/__tests__/`
(unit / integration / e2e).

**Coverage expectations:** Business logic and core libraries should have unit test coverage.
Commands are validated through integration and E2E tests. No hard coverage percentage target —
meaningful assertions over line counting.

**Testing methodology:** Operational rules live in the methods — [`test-first`][test-first] (planning-time
test sequencing) and [`testing-standards`][testing-standards] (execution-time assertion / mocking / isolation
discipline). See [Testing Methodology Strategy][testing-methodology] for the deep-dive — rationale, tier
details, and worked examples.

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

When authoring or editing a workflow, write for the agent _executing_ it, not a reader evaluating the
design. Judge each line by one test: **does a session executing this need it to act correctly?** Keep
procedure and load-bearing constraints — the rule, the format, when to skip; cut author-facing justification
— "what this is / isn't" framing, why-a-rule-exists rationale, and restatements an adjacent inline hint
already carries. Full convention: [strategy-workflow-authoring][workflow-authoring] § Body Conventions
(Prose economy).

### Verbs over mechanics — the framework-author degree of freedom

The shipped rule ([strategy-workflow-authoring][workflow-authoring] § Body Conventions, Verbs over
mechanics) gets one extra degree of freedom here that adopters lack: the `arc` CLI is ours to grow. A
mechanics-narrating line that exists because no verb covers the operation is a **verb-gap signal** — surface
it for potential `arc-inbox` capture rather than accepting the coupling as permanent.

## Commit Conventions (self-hosting)

The universal format lives in the [commit-format][commit-format] and [commit-footer][commit-footer] methods.
One project-specific adherence rule applies on top, because this repository is ARC:

**`(arc)` is not the default scope here.** `commit-format` § Subject scope reserves `(arc)` for cross-cutting
framework concerns and ARC lifecycle-ceremony invocations — "not a default-when-uncertain catch-all." In an
adopter repo `(arc)` carries real signal (it scopes edits to installed ARC artifacts); **in this repo everything
is ARC, so it carries none.** Prefer the narrowest descriptive locus: `fix(brief)`, `fix(hook)`, `fix(strategy)`,
`fix(method)`, `chore(backlog)`, `feat(status)`, `feat(session-init)`. Reserve `(arc)` for genuinely cross-cutting
changes with no narrower home; lifecycle-ceremony commits (`chore(arc): verify/integrate/activate/archive/handoff
…`) remain a legitimate use.

**`docs` is external-facing prose only** — `README.md`, docs-site content, onboarding. Methodology-artifact edits
are `fix` / `refactor` / `feat` by intent, never `docs`.

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

**npm spikes rewrite the root `package.json` under workspaces:** a throwaway `npm init` / `install` run from the
repo root rewrites the workspaces root `package.json` (injecting the flattened dep tree and a wrong
`"type": "commonjs"` — this project is ESM), and `--prefix <dir>` does **not** isolate it. For an out-of-tree spike,
`cd` fully outside the repo tree (or avoid npm); recover a stray edit with `git restore package.json` before it lands
in a commit.

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

### Surface agent-side friction and idiom divergence

**Dev-internal to this repository only** — never carry this to other ARC projects, where an
ARC-improvement observation is something the reader cannot act on. Two trigger classes:

- **Friction (factual).** The harness or methodology made the job measurably harder — you had to hunt for
  something, a surface misled you, a workaround or retry loop was needed. Floor: systemic or likely-recurring,
  never one-off trivia.
- **Idiom divergence (opinion — stricter floor).** ARC's design departs from established industry idiom _at an
  observable cost_, or leaves unhandled a case the norm covers. Never aesthetic preference. Engage any recorded
  rationale (ADRs, strategies) before raising it — an observation that ignores a recorded decision is noise; one
  that engages it is signal. Mark these as judgment, not fact.

**Protocol:** batch to the next natural report boundary (completion report, handoff) as one proposed line each —
"hit friction X — capture?" — never a mid-execution interrupt. On confirmation, route via `arc-inbox`. When
running unattended (deferred review), capture directly and note it in the report, so a missing approval moment
never loses the thought.

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
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
[testing-methodology]: ../../reference/strategies/project/strategy-testing-methodology.md
[test-first]: ../methods/test-first.md
[testing-standards]: ../methods/testing-standards.md
[commit-format]: ../methods/commit-format.md
[commit-footer]: ../methods/commit-footer.md
[package-sync]: ../../reference/strategies/project/strategy-package-project-sync.md
[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
