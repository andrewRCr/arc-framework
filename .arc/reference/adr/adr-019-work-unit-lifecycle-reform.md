# ADR-019: Reform Work Unit Lifecycle Around Single-Branch Model and Aligned Conventions

## Status

Accepted

## Context

ARC's work-unit (WU) lifecycle accreted three composing structural issues, plus a commit-convention bloat that
surfaces in the same constitutional surface area. The four are entangled: each touches branch conventions, the
status/meta-file shape, or commit format, and fixing any one without the others leaves an inconsistent rule set
on the same constitutional surface (DEV-RULES.ARC, AGENT-BRIEF.ARC, the strategy suite, boundary workflows,
template suite, hooks).

### The structural issues

**Per-worktree isolation is impossible under the current model.** `integrate-planning-branch.md` Step 2 graduates
plan-doc artifacts onto main with the status file in `State: Planning`; `activate-work-unit.md` transitions the
status file on the WU branch only. Main retains stale Planning-state status files through WU integration. Any
worktree branched from main inherits those leaks. Under the parallelism trio (Worktree Foundation, Agile WU
Lifecycle, Concurrent Work Conventions — all downstream of this decision), every new worktree starts with N
other WUs' status files in `active/` — not visual clutter but actively misleading state.

**Branch-prefix categories contradict PR types in practice.** `feature/{name}` and `technical/{name}` were
intended as a coarse user-visible-vs-internal signal distinct from per-commit Conventional Commits types. In
practice, `technical/` branches integrate as `feat:` PRs and vice versa; the categorization isn't honest. Branch
names are also longer than they need to be.

**Separate planning-branch PR adds ceremony without proportional value.** Two PRs per WU costs a review cycle
plus branch-rotation friction at activation. Substantive planning review, when adopters want it, is delivered
better by an opt-in configurable checkpoint than by a second merge-able PR.

### The commit-convention bloat

Empirical audit (last 200 commits) shows 7 of 13 supported CC types unused (`style`, `content`, `perf`, `build`,
`ci`, `config`, `revert`) and the `arc` scope used as a catch-all in ~29% of commits — describing ~90% of the
repo and signaling no intent. External research (2024-2026) confirms convergence on a core-6 type set in current
practice; CB-CC alignment requires explicit handling because Conventional Branch's emergent spec
(conventional-branch.github.io) deliberately omits `test/` and `revert/` from its canonical set on cognitive-load
grounds, while Conventional Commits retains both.

### Why now

Worktree Foundation needs per-worktree isolation as a structural precondition. Without this reform, downstream
WUs in the parallelism track build on a leaking lifecycle model. The commit-convention surface is best touched
in the same constitutional moment as the branch conventions — CB and CC alignment together avoids two waves of
DEV-RULES.ARC + method-doc + hook churn.

### Alternatives considered

- *Meta file in `backlog/` during planning.* Rejected — `backlog/` is `pm.layer: arc-pm` only; doesn't
  generalize to `none`. Also semantically odd: meta file in backlog while WU is actively being planned reads
  wrong.
- *Meta file gitignored (per-developer like SESSION-NOTES).* Rejected — loses cross-WU coordination visibility.
  Meta files are project state, not personal state.
- *Two branches with delayed planning-merge until activation.* Rejected — planning artifacts merge at activation
  moment instead of planning-integration moment, but main still gets them. Same leak, different timing.
- *No-prefix execution branches.* Rejected — scannability matters when many branches exist (atomic chores
  blending with serious feature work was a real failure mode). CB alignment preserves visual scannability while
  removing the feature-vs-technical contradiction with PR conventional-commit types.
- *Maintain `feature/` and `technical/` prefixes; tighten CC type set independently.* Rejected — the prefix
  problem is structural (categorical signal that doesn't honestly partition the work). Keeping the prefixes
  bakes in the contradiction.
- *Keep `status-{name}.md`; rely on `**Integration:**` field to express archive phase.* Rejected — the file's
  role expanded beyond status (carries metadata, life-state pointers, and archive-phase content); rename
  acknowledges the composite role. The rename moment is active, not passive: with completion-status
  consolidation absorbed into this reform, rename and lifecycle extension land together rather than across two
  WUs.
- *Rename "work unit" entirely* (epic, story, initiative). Rejected — industry alternatives don't fit ARC's
  flat, technical-or-feature-agnostic shape. Cost of renaming high; benefit unclear. Resolved instead by
  separating "work unit" (wrapper noun) from "atomic" (work character) — see § Decision.

## Decision

Adopt a single-branch-per-WU lifecycle as the structural foundation, with three aligned convention reforms
following from it.

**Constitutional surface 1 — Single-branch-per-WU model.**

One WU = one branch from planning through integration; merges to main exactly once at integration. WU artifacts
(`meta-{name}.md`, `plan-{name}.md`, `prd-{name}.md`, `tasks-{name}.md`, companions) live in `active/` on the WU
branch through the entire lifecycle. Main carries no in-flight WU artifacts. Activation is an in-place state
transition + branch rename, not a new branch creation. Integration is the single merge-to-main moment;
sweep-as-you-go (default) bundles file moves from `active/` to `archive/<dated>/{wu-name}/` into the integration
PR as separate commits.

Boundary workflows restructured:

- `integrate-planning-branch.md` — retired entirely
- `activate-planning-branch.md` → renamed `init-work-unit.md` (WU + meta-file creation)
- `activate-work-unit.md` — name preserved with new semantic (state transition + branch rename, no directory
  move)
- `integrate-work-unit.md` — restructured for sweep-as-you-go + single integration PR
- `archive-work-unit.md` — Tier-1 step for Release Notes Entry + Completion Notes composition; collapses into
  `integrate-work-unit.md` under default `archive.cadence: with-integration`

`[PLAN]:` PR-prefix retired entirely. No separate planning PR exists under single-branch-per-WU.

**Constitutional surface 2 — Conventional Branch alignment + planning-PR retirement.**

WU branches follow CB core-6: `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`, `refactor/<name>`,
`perf/<name>`. Planning branches use `plan/<name>`; rotate to `<type>/<name>` at activation via local rename +
remote replace. Contested types (`test/`, `style/`, `build/`, `ci/`) treated as adopter-extension; not in
ARC's canonical set. Legacy prefixes (`feature/`, `technical/`, `incidental/`) retire.

CB-CC alignment is intentionally non-total: CB omits `test/` and `revert/` while CC retains both. Tests aren't
branched separately under ARC's conventions; reverts produce Conventional Commit shape but not Conventional
Branch shape. The divergence is intentional and cognitive-load-aware per CB spec rationale.

**Constitutional surface 3 — Meta-file rename + field codification.**

`status-{name}.md` → `meta-{name}.md` rename across the codebase. `template-status.md` → `template-meta.md`.
Field set codified:

- **`**State:**`** — 4-value enum: `Planning | Active | Integrating | Shipped`. Strict state machine; each value
  names exactly one lifecycle phase. `**Integration:**` retired (folds into State as the `Integrating` value).
  Commitment level (provisional vs planned) lives in dir location, not in State.
- **`**Owner:**`** — singular per WU. Solo mode auto-populates from `arc.identity`. Concurrent multi-owner
  deprecated.
- **`**Depends On:**`** — bare WU-name list; renders into ROADMAP tier grouping.
- **`**Origin:**`** — default `[Internal]`. Orthogonal to `**Spec:**` (which always points at ARC-owned
  planning artifacts). External tracker references go in `Origin`, never `Spec`.
- **`**Cohort:**`** — single name string; `[none]` for solo WUs. Source of truth for sibling membership; the
  prior `**Sibling Work Unit(s):**` field retires (derived, not authored).

Archive-phase sections on the meta file: PR URL, Completed date, Release Notes Entry (categorized per Keep a
Changelog 7-category set), Completion Notes (narrative). `completion-{name}.md` retires as a distinct artifact.
Meta file becomes the durable identity artifact across the entire WU lifecycle — created at WU stub creation,
persists through all state transitions, lands in archive with archive-phase sections composed.

Per-worktree isolation invariant: each worktree's `active/` contains only its own WU's meta file, because no
other branch's meta file is reachable from main.

**Constitutional surface 4 — Commit-convention reform + CB-CC alignment.**

CC type set tightened to 8: `feat | fix | chore | docs | refactor | test | perf | revert`. Drops `style`,
`content`, `build`, `ci`, `config` (fold to `chore` or other informative types). `system/githooks/commit-msg`
regex enforces.

Scope governance:

- Convention: subsystem / artifact-type / WU-feature name; never the repo name.
- Hook refuses `arc` as scope (uninformative catch-all). Denylist starts with `arc` only; expands organically as
  new catch-all patterns surface in PR review.
- Scope remains optional; when present, must be informative.

`docs` discipline codified in the `commit-format.md` method (principle only; methods stay token-lean):

- Type chosen by intent, not file extension.
- `feat` = new capability (workflow, method, strategy, template, convention codification — even when delivered
  entirely in `.md`).
- `fix` = correcting drift, stale references, or out-of-date language in methodology surface.
- `refactor` = restructuring methodology surface without behavior/convention change.
- `docs` = external-facing prose only (`README.md`, docs-site content, adopter onboarding).
- Rule of thumb: "What changed in system behavior or capability? Yes → `feat` / `fix` / `refactor`;
  No → `docs`."

`Context:` footer convention extends to align with the new lifecycle:

- `commit-context-format.md` → `commit-footer.md` (file rename; config key `commit.context_footer` retained —
  slot identity decoupled from filename).
- Chain naming: footer names the deepest spec-shaped artifact under edit along the WU chain — `meta-{name}`
  (lifecycle/maintenance) → `plan-{name}` / `prd-{name}` (Spec) → `tasks-{name}` (execution spec) →
  `atomic-{name}` (atomic-companion scope). Falls back to anchor `standalone` when no active WU exists.
- Off-WU category vocabulary: `maintenance | planning | documentation | refactor`.

**Vocabulary distinction codified.**

Resolves a long-standing tangle where "atomic" was doing two jobs (item-shape AND tier-shape) and "work unit"
was getting stretched ("is an atomic WU really a work unit?"):

- **Work unit** — the wrapper noun. Any bounded chunk of work with a branch, status, and PR. Invariant across
  tiers (atomic / quick / standard from Agile WU Lifecycle).
- **Atomic** — describes work character. Single-bounded, indivisible, no internal stages. Applies to items
  (capture-tier), tasks (companion-file scope), and WUs (atomic-tier).
- Inboxes distinguish by work character (atomic vs multi-step), not by wrapper presence/absence.

Lands in `AGENT-BRIEF.ARC.md` § Vocabulary (orientation layer; DEV-RULES.ARC references the terms but doesn't
redefine them).

**Capture-routing constitutionalized.**

The capture-routing rule moves from `DEV-RULES.PROJECT.md § Capture Routing` to `DEV-RULES.ARC § Leave it
cleaner`. Four-surface capture model:

- `user/{identity}/USER-INBOX.md` — per-user, gitignored, notes-synced. Two sections (`## Atomic`, `## Backlog`)
  routing at drain time.
- `backlog/ATOMIC-INBOX.md` — project-shared, tracked. Atomic-character entries.
- `backlog/BACKLOG-INBOX.md` — project-shared, tracked. Multi-step entries.
- `backlog/{planned,provisional}/<wu-name>/` — per-WU subdirs for matured backlog WUs.

Boundary-materialization for shared inboxes: writes fire only at lifecycle ceremonies (activation absorption,
integration drain, planning-kickoff promotion). Outside these moments, shared inboxes are read-only by
convention.

**Cascading rules:**

- *Sweep-as-you-go default.* `archive.cadence: with-integration` (default — sweep in integration PR);
  `archive.cadence: deferred` (sweep at next-WU planning batch — pre-WOR pattern); `archive.cadence: manual`
  (explicit invocation).
- *ROADMAP as rendered view.* ROADMAP.md becomes a generated artifact rendered from meta-file fields walked
  across `active/**` and `backlog/planned/**`. Render algorithm codified in `strategy-work-organization.md`;
  hand-maintenance discipline ships pre-CLI.
- *PROJECT-STATUS retirement.* `.arc/reference/PROJECT-STATUS.md` deletes entirely. Function decomposes across
  PROJECT-PRD, per-WU Release Notes Entries, and directory queries.
- *Forward-only migration.* Historical commits keep their existing type/scope tags. In-flight WUs retain
  current `feature/`/`technical/` branches through natural integration (branch rename would force coordination
  across multiple in-flight branches); the `status-*` → `meta-*` rename is mechanical and low-risk. Historical
  archive read-only.
- *Per-WU Release Notes Entry.* Every shipped WU has a Release Notes Entry section in its archived meta file,
  categorized per Keep a Changelog (Added / Changed / Removed / Fixed / Infrastructure / Deprecated / Security).
  Composition fires at integration ceremony when `**State:**` transitions `Active → Integrating`. CHANGELOG
  aggregation tooling deferred; per-WU entries ship now.
- *Atomic-tier infra-edit smell flag.* Documentation-only flag in DEV-RULES.ARC: atomic-tier work touching
  load-bearing infra (`.arc/system/`, `.arc/reference/strategies/`, `arc-config.yml`) warrants quick-tier at
  minimum.

## Consequences

### Positive

- Per-worktree isolation is achievable as a structural property, not a discipline. Worktree Foundation and the
  rest of the parallelism trio gain a clean substrate.
- Branch conventions align with industry CB/CC standards; the feature-vs-technical contradiction is removed;
  branch names are shorter and more honest about intent.
- One PR per WU eliminates the planning-PR review cycle and branch-rotation friction at activation. Planning
  review remains available as an opt-in configurable checkpoint for adopters who want it.
- Meta file becomes the durable identity artifact across the entire lifecycle. ROADMAP is renderable from meta
  files; per-WU Release Notes Entries are composable into a CHANGELOG by downstream tooling; cross-WU
  references (dependencies, cohort membership) resolve through structured fields.
- Vocabulary tangle resolved. "Atomic WU" becomes coherent (wrapper noun + work character); inboxes route by
  character without wrapper confusion.
- Commit-convention surface tightens to lived practice. The `arc` catch-all scope retires; `docs` discipline
  prevents the type from absorbing all methodology edits regardless of intent.
- Capture-routing constitutionalization clarifies the principle/project boundary. The routing rule is ARC
  methodology; project-specific routing overrides remain in DEV-RULES.PROJECT only where they actually differ.
- Status-file shape evolution aligns with consumer boundaries (composite role acknowledged, archive-phase
  sections composed inline) rather than churning per-commit.

### Negative

- Constitutional surface is broad. DEV-RULES.ARC, AGENT-BRIEF.ARC, multiple strategy documents
  (`strategy-work-organization.md`, `strategy-planning-module.md`, `strategy-configurability-architecture.md`,
  `strategy-file-classification.md`, `strategy-task-list-formatting.md`), the template suite, all boundary
  workflows, the commit-msg hook, and CLI substrate (`classification.ts`, hook regex, template references) all
  touch in this reform.
- In-flight WUs operate in a mixed-shape transitional state during the execution window — workflows /
  strategies / templates land new shape incrementally while in-flight WU artifacts still reflect pre-reform
  conventions. Transitional persistent context is required to read in-flight WU state correctly.
- Boundary-workflow restructure has high blast radius. `integrate-planning-branch.md` retirement,
  `activate-planning-branch.md` rename, and `activate-work-unit.md` semantic shift each touch core lifecycle
  paths.
- `archive.cadence: deferred` remains for adopters who prefer staged-cadence; renderers and other downstream
  tooling must handle both shapes (and the legacy archive shape, per backward-compat tooling requirement).
- Vocabulary distinction propagation requires touching every doc that uses "work unit" or "atomic" loosely —
  bounded surface but real edit volume.
- `Context:` footer convention extension (`commit-context-format.md` → `commit-footer.md`, chain-naming, off-WU
  vocabulary) requires atomically coupled hook + method + skill edits to avoid regex/method drift; smoke-test
  lock required.

### Risks

- *Commit-convention reform may surface latent project-specific scope governance needs.* Mitigation: denylist
  starts with `arc` only and expands organically as new catch-all patterns surface in PR review. Strict
  scope-enum enforcement is explicitly deferred (evolution favored over fixed enumeration).
- *ROADMAP hand-maintenance discipline pre-CLI is a known gap.* Mitigation: algorithm codified in
  `strategy-work-organization.md`; ceremony fire-points (graduation, activation, integration, dep-field edit)
  trigger regenerate-ROADMAP steps in workflow bodies. CLI implementation deferred to downstream WU.
- *Forward-only migration creates legacy/new shape coexistence in archive.* Mitigation: backward-compat tooling
  requirement codified — anything reading the archive (renderer, future CLI, search/audit) must handle both
  legacy and new shape. Historical archive remains read-only.
- *Sweep-as-you-go produces multi-commit integration PRs.* Mitigation: commit shape codified (code commits →
  completion content → sweep commits) so reviewers can navigate per-commit. `deferred` cadence remains for
  adopters who prefer single-commit-per-PR review posture.
- *Boundary-workflow restructure may surface dependencies not anticipated in planning.* Mitigation: phased
  rollout (Phase 1 constitution → Phase 2 strategy codification → Phase 3 workflow restructure → Phase 4
  templates → Phase 5 cascade → Phase 6 migration sweep → Phase 7 verification) means workflow changes land
  after strategy guidance is in place to inform them.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model (strategy-adr-methodology.md).
     Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-05-22):** The "CB core-6 alignment / intentional `test` + `revert` divergence per CB spec
rationale" framing in § Context and § Decision (surface 2) rested on a misreading of the Conventional Branch
spec, caught during implementation. ARC's branch-prefix set is *inspired by* Conventional Branch, not aligned to
a fixed "core-6"; the corrected "inspired-by, not aligned-with" framing lives in the `branch-format` method
preamble, with `strategy-work-organization.md` § Branching treating `branch-format` and `commit-format` as
independent axes. The branch-prefix decision itself is unchanged — only its rationale is corrected.
