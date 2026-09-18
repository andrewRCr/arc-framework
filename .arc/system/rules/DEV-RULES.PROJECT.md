# Development Rules (Project)

Project-specific development standards for the ARC framework. Quality gates, testing requirements,
documentation style, file organization, and architecture rules.

For ARC methodology rules (commit discipline, task execution, session management, verification), see
[DEV-RULES.ARC][dev-rules-arc].

---

## Quality Gates

**Zero Tolerance Policy:** All quality checks must pass before any commit, no exceptions · `[invariant]`.

**Tiered approach** — T1 per-task, T2 per-unit, T3 pre-PR. See [Quality Gates Strategy][quality-gates].
Commands, config, and their measured cost: [QUICK-REFERENCE][quick-ref] § Quality Gate Commands.

Four gate behaviors that reference does not carry, each of which fails quietly:

- `lint:md:staged` certifies the **git index**, not the worktree — the false-green trap is index-versus-worktree
  bytes, not a second rule set; **re-stage after every fix**, or findings target already-corrected lines.
- `lint:md` **fails closed** when a staged Markdown-gate path still differs in the worktree, so a green worktree
  run cannot hide a dirty index.
- Run **both** type checks before declaring types green. Vitest's esbuild transpile skips type-checking, so a
  test-only type error passes a source-only check and surfaces only at commit.
- `test:changed` must select at least one affected unit test. An empty selection is its own non-passing outcome,
  not evidence that the changed code passed.

### Size and complexity baseline

`src/**` gates on function length, file length, cyclomatic complexity, nesting depth, and nested callbacks;
`__tests__/**` gates on file length only, because `describe` bodies make a per-function limit meaningless there.
The thresholds live in `eslint.config.js`, which is their only authority. Violations that predate the gate are
recorded in `packages/arc-framework/eslint-suppressions.json`, which the lint run reads automatically.

That record is a **floor — "no worse than this" — not a backlog.** It bounds new debt; reducing what it already
holds is separate, owned work, and nothing about the record's size is a commitment.

Four behaviors decide whether the gate tells the truth:

- **Run it through the npm scripts.** Baseline keys are relative to the directory ESLint runs in, so a bare
  `npx eslint <path>` from the repository root finds no baseline and reports every recorded violation as new.
  `lint:ts` and `lint:ts:file` both run with the package as their working directory.
- **Only a whole-project run can shrink the record.** Pruning examines just the files in the current run, so a
  per-file run can never notice that a violation was fixed. After reducing one, run `lint:ts` — it exits 2 and
  names the unused suppression — then re-run it with `--prune-suppressions` and commit the shrunk record.
- **A new violation surfaces its whole bucket.** Suppressions count violations per file per rule, never per
  line, so exceeding a recorded count reports _every_ violation of that rule in the file. Attribute by diff:
  the violations on lines the branch changed are its own, and the rest are pre-existing. The count delta
  against the recorded entry is only the minimum the gate will accept — it under-reports a change that fixed
  one violation while adding two.
- **Never re-run `--suppress-rule` to clear a red gate.** That records the new violation as permanent debt,
  which is the one thing the record exists to prevent.

The record cannot see two things, and both close by remediation rather than by more gate. An already-recorded
unit can grow worse while its count stays put. And a swap is invisible: fix one violation of a rule in a file
while adding another of the same rule to the same file, and the bucket stays exactly full — the run stays green
and pruning finds nothing to report.

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

**Test-lane selection — derive it from changed paths.** Changes confined to one test lane run that lane's command:
`test:changed` selects both `unit` and `unit-mocks`, while integration and E2E have separate commands. Source or
tooling changes reach every tier through the routine local lane plus required CI.

| Changed paths                                     | Local test command            | Required remainder                 |
| ------------------------------------------------- | ----------------------------- | ---------------------------------- |
| `__tests__/unit/**` or isolated unit-mock files   | `npm run -s test:changed`     | none                               |
| `__tests__/integration/**` only                   | `npm run -s test:integration` | none                               |
| `__tests__/e2e/**` only                           | `npm run -s test:e2e`         | none                               |
| `src/**`, build/test config, or unrecognized code | `npm test`                    | E2E and portability in required CI |

`npm test` is the routine local lane: unit, unit-mocks, and integration in one admitted run. E2E is enforced by
the heavy CI lane before merge; run it locally only when E2E files changed or when explicitly requested. Run
`npm run test:full` when a deliberate whole-project local test pass is useful.

The ARC contract checks (`lint:arc:triggers`, `lint:arc:domain-rules`, `lint:arc:section-refs`) validate
methodology artifacts rather than code, are corpus-wide by design, and cost ~0.7s combined — so they ride with
any Markdown change and never earn a relevance carve-out of their own. They are also required in CI: omitting
them locally produces a false green rather than a saving.

Build and tooling config (`package.json`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`) counts as
code: it reaches every check.

**Unchanged tree — a completed tier is not re-executed over an unchanged tree.** A green result stays valid
until an input it covers changes. When a boundary calls for a tier that already ran green and the delta since
reaches nothing that tier covers, report it as already satisfied instead of re-running it; a skip that goes
unrecorded reads as coverage nobody actually has. This narrows repeat runs of the same tier; complete every
project-designated check in the selected gate.

Re-running **is** warranted after a base merge, after any review-driven fix, and at the first composed-work
attestation — each introduces state no prior run saw.

## Testing Requirements

**Coverage expectations:** Business logic and core libraries should have unit test coverage.
Commands are validated through integration and E2E tests. No hard coverage percentage target —
meaningful assertions over line counting.

## Engineering Standards

**Pre-public-release compatibility posture:** ARC is currently pre-public-release. Until its first public release,
unpublished project-owned contracts and development-only persisted state may change in place. Do not add
backward-compatibility aliases, migration readers, or data migrations for them; clear or regenerate development state
instead.

**External-seam enforcement test:** At a host or provider seam, claimed or demanded external authority must match the
enforcement the platform actually offers. Keep stronger exactness in ARC-controlled validation — derive the authorized
expectation, observe fresh external state, refuse mismatches, and disclose any residual race — and do not disable a
capability merely because the platform cannot enforce a guarantee ARC does not require at comparable seams. This does
not relax distrust of agent self-attestation or exactness over ARC-owned single-writer records.

**Recovery-complete refusals:** An operational refusal is incomplete unless it distinguishes terminal failure from a
recoverable stop. A recoverable refusal must preserve a safe retry or restart route, report the observed condition,
name an actionable remedy, and keep the normal success path reachable after repair. At material boundaries,
verification must cover both the refusal and successful continuation after the condition is repaired. Do not add
guard-only dead ends.

**TypeScript standards:**

- Strict mode with `noUncheckedIndexedAccess` — no `any` types except at validated system boundaries
- ESM throughout (`type: "module"`, Node16 module resolution)
- Prefer explicit return types on exported functions
- Use `unknown` over `any` for external data; validate and narrow before use
- Shared helpers return only what they establish; each caller applies its own failure policy
  (never bake one consumer's "safe default" into a shared resolver — e.g. identity helpers)
- TSDoc on exported API surface: `@param`, `@returns` on exported functions; file-level doc comment
  describing the module's purpose
- Write inside the size gate rather than against it: functions ≤100 lines and cyclomatic complexity ≤15,
  files ≤1000 lines, nesting depth and nested callbacks ≤4 — blank lines and comments do not count, and
  `eslint.config.js` is the authority

## Self-Hosting Defects

This repository uses ARC to build ARC, so an ARC refusal or workflow dead end may expose an unfinished or defective
control, not a final veto. Diagnose it and make safe, in-scope repairs and retries. If the repair is not already owned
or planned, propose a proportionate Errand or work-unit capture at the next natural report boundary; routing the defect
does not itself halt the present task. Continue by the narrowest sound path. Before crossing a failed ARC control,
disclose why it appears defective and what remains unverified, then obtain explicit Owner direction for that specific
workaround. Never report a failed check as passed or bypass higher-priority instructions or independently required
quality and merge gates.

## Documentation Standards

### Markdown quality

- Template-first documents with comprehensive inline guidance and framework defaults
- READMEs required for each directory
- **Line length**: 120 characters — wrap at natural phrase boundaries near the target width. Linting catches
  overflow but not underfill — consistently short lines (60-90 chars) are the more common failure than overflow.
  Bullet continuations, multi-line field values, and SESSION-NOTES entries follow the same target.

### Documentation style

- **Collaborative voice**: Commits, task lists, and project docs read as the work's author would write them — an
  author or team perspective, never a transcript of human-AI interaction. "Approved after review", "Pending
  review", "Decided to defer this" — not "The user approved the approach", "Pending user review".

- **Reference-style links**: Prefer reference-style links for cross-file references, with the definitions collected
  after one trailing `---` per file — the separator doubles as the EOF indicator, since link definitions render
  invisibly. Names are lowercase, descriptive, hyphenated (`[dev-rules]`); short links (same directory or one level
  up) may stay inline; movable ARC WU artifacts use filename-only references per [DEV-RULES.ARC][dev-rules-arc].

### Workflow prose economy

Write workflow prose for the executing session — full convention in [strategy-workflow-authoring][workflow-authoring].

### Verbs over mechanics — the framework-author degree of freedom

A mechanics-narrating line no verb covers is a **verb-gap signal** — surface it for `arc-inbox` capture.

## Commit Conventions (self-hosting)

The universal format lives in the [commit-format][commit-format] and [commit-footer][commit-footer] methods. One
project-specific adherence rule applies on top, because this repository is ARC:

**`(arc)` is not the default scope here.** It marks edits to installed ARC artifacts, which is no signal in a repo
where everything is ARC. Prefer the narrowest descriptive locus — `fix(brief)`, `fix(hook)`, `fix(strategy)`,
`fix(method)`, `chore(backlog)`, `feat(session-init)` — and reserve `(arc)` for genuinely cross-cutting changes with
no narrower home; lifecycle-ceremony commits (`chore(arc): verify/integrate/archive/handoff …`) remain legitimate.

**`docs` is external-facing prose only** — `README.md`, docs-site content, onboarding. Methodology-artifact edits
are `fix` / `refactor` / `feat` by intent, never `docs`.

## Package-Project Sync

This repo has two copies of ARC framework content: `packages/arc-framework/arc/` (authoritative
source, ships to adopters) and `.arc/` (project instance). Methodology edits to Framework files
go through the package source and sync to `.arc/` — not the other way around. Configurable files
are edited in `.arc/` (project-specific sections) or package source (framework sections); never
`cp` between copies — that overwrites project-specific overrides silently.

Pre-commit hooks catch the two mechanical failures of that rule. See [Package-Project Sync
Strategy][package-sync] for what they check, the harness skill-directory drift hazard, the file
inventory and dependency map, and template handling.

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

### Referencing across the boundary

Adopter-facing content cannot reference an internal-only surface — an ADR, a `strategies/project/` document — because
the reader doesn't have it and the link goes nowhere. `strategies/arc/**` is packaged via `npx arc update`, so it is
bound by this too; `strategies/project/` ships as an empty surface and may reference internal material freely.
Operational rationale adopters need must stand alone in the adopter-facing source; rationale that doesn't earn that
placement stays in the ADR itself, or routes to whatever capture surface the project uses for docs-site content.

### Package-source mirror inheritance

Anything mirrored to `packages/arc-framework/arc/**` is adopter-facing by definition (it ships).
The `.arc/` copy inherits the classification.

### Relationship to DEV-RULES.ARC § Documentation Boundaries

DEV-RULES.ARC § Documentation Boundaries and § Audience Boundaries above both apply, on orthogonal concerns.

---

## Capture Routing

Using `pm.mode: arc-in-git` — deferred work routes through ARC's built-in capture surfaces.
See [DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing for the full routing table.

### Surface agent-side friction and idiom divergence

**Dev-internal to this repository only** — elsewhere an ARC-improvement observation is something the reader cannot
act on. Two trigger classes, both floored at systemic or likely-recurring rather than one-off trivia: **friction**
(factual — the harness or methodology made the job measurably harder) and **idiom divergence** (marked as judgment,
stricter floor — ARC departs from established industry idiom _at an observable cost_ or leaves unhandled a case the
norm covers, never aesthetic preference, and never before engaging the recorded rationale in ADRs and strategies).

**Protocol:** batch to the next natural report boundary (completion report, handoff) as one proposed line each —
"hit friction X — capture?" — never a mid-execution interrupt. On confirmation, route via `arc-inbox`. When
running unattended (deferred review), capture directly and note it in the report, so a missing approval moment
never loses the thought.

## Architecture Documentation

### Architecture Decision Records (ADRs)

Document significant architectural decisions as ADRs in `.arc/reference/adr/`. See [ADR Methodology
Strategy][adr-methodology] for decision criteria, the three-tier stability model, and amendment vs. supersession.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[quality-gates]: ../../reference/strategies/arc/strategy-quality-gates.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
[commit-format]: ../methods/commit-format.md
[commit-footer]: ../methods/commit-footer.md
[package-sync]: ../../reference/strategies/project/strategy-package-project-sync.md
[workflow-authoring]: ../../reference/strategies/arc/strategy-workflow-authoring.md
