# PRD: Work Organization Reform

- **Origin:** [internal]

- **Purpose:** Rebuild ARC's WU lifecycle foundation around a single-branch-per-WU model with sweep-as-you-go
  integration, Conventional Branch alignment, meta-file location-by-state, codified field semantics, and aligned
  commit conventions — delivering per-worktree isolation as the precondition for the parallelism trio (Worktree
  Foundation, Agile WU Lifecycle, Concurrent Work Conventions).

---

## Introduction

ARC's current WU lifecycle has three composing structural issues, plus a commit-convention bloat that surfaces in the
same constitutional surface area.

### The structural issues

**Per-worktree isolation is impossible under the current model.** `integrate-planning-branch.md` Step 2 graduates
plan-doc artifacts onto main with the status file in `State: Planning`; `activate-work-unit.md` transitions the status
file on the WU branch only. Main retains stale Planning-state status files through WU integration. Any worktree branched
from main inherits those leaks. With three WUs in flight (typical under the parallelism trio), every new worktree starts
with three other WUs' status files in `active/` — not just visual clutter but actively misleading state.

**Branch-prefix categories contradict PR types in practice.** `feature/{name}` and `technical/{name}` were intended as a
coarse user-visible-vs-internal signal distinct from per-commit Conventional Commits types. In practice, `technical/`
branches integrate as `feat:` PRs and vice versa; WUs cross the partition often enough that the categorization isn't
honest. Branch names are also longer than they need to be.

**Separate planning-branch PR adds ceremony without proportional value.** Two PRs per WU costs a review cycle plus
branch-rotation friction at activation. Substantive planning review, when projects want it, is delivered better by an
opt-in configurable checkpoint than by a second merge-able PR.

### The commit-convention bloat

Empirical audit (last 200 commits) shows 7 of 13 supported CC types unused (`style`, `content`, `perf`, `build`, `ci`,
`config`, `revert`) and the `arc` scope used as a catch-all in ~29% of commits — describing ~90% of the repo and
signaling no intent. External research (2024-2026, captured in `research-commit-convention-reform.md`) confirms
convergence on a core-6 type set in current practice; CC-CB alignment requires explicit handling.

### Why now

Worktree Foundation (downstream WU; recommended sequencing) needs per-worktree isolation as a structural precondition.
Without WOR, WF builds on a leaking lifecycle model. Three other downstream WUs in the parallelism track (Agile WU
Lifecycle, Concurrent Work Conventions, ARCd Rebrand) consume conventions WOR codifies. The commit-convention surface is
best touched in the same constitutional moment as the branch conventions — CB and CC alignment together avoids two waves
of DEV-RULES.ARC + method-doc + hook churn.

---

## Goals

1. **Single-branch-per-WU lifecycle.** One WU = one branch from planning through integration; merges to main exactly
   once at integration.
2. **Conventional Branch alignment.** Retire `feature/` and `technical/` prefixes; adopt CB core-6 (`feat/`, `fix/`,
   `chore/`, `docs/`, `refactor/`, `perf/`) plus `plan/<name>` for planning state.
3. **Meta-file location-by-state.** Meta file always at `active/meta-{name}.md`; the branch carries it. Renamed from
   `status-{name}.md` to reflect composite role (metadata + state pointers + archive sections).
4. **Sweep-as-you-go integration default.** Integration PR includes sweep commits; meta-file moves to archive in the
   same PR. `archive.cadence: deferred` available for staged-cadence projects.
5. **Codified meta-file fields.** `**State:**` value-set, `**Owner:**` singular, `**Depends On:**` for dependency
   surfacing, `**Origin:**` orthogonal to `**Design:**` (per R68's field rename of `**Spec:**`), `**Cohort:**` for group
   membership.
6. **Completion-doc consolidation.** Eliminate `completion-{name}.md`; meta file carries archive-phase sections.
7. **Capture pipeline reform.** Four-surface model with ceremony-only writes to shared inboxes.
8. **Group-dir + state-dir conventions in backlog.** `plans/planned/` + `plans/provisional/` state-dirs; optional group
   dirs for codified cohorts.
9. **Commit-convention audit + CB-CC alignment.** Tune CC type set to 8; deprecate `arc` catch-all scope; codify `docs`
   discipline.
10. **PROJECT-PRD redesign — shape + content.** Codified template; ceremony fire-points wire it into the development
    loop; this repo's PROJECT-PRD content rewritten as dogfooding pass.
11. **ROADMAP as rendered view.** Algorithm codified; ROADMAP regenerated at ceremony fire-points from meta-file state;
    CLI deferred but hand-maintenance discipline ships.
12. **PROJECT-STATUS retirement.** Function decomposes across PROJECT-PRD, Release Notes Entries, and directory queries.
13. **Extension fire-point family aligned with lifecycle events.** Five-extension family at WU lifecycle
    (`pre-activation`, `pre-commit-review`, `pre-pr-review`, `pre-push-review`, `pre-merge-review`) with fire-point
    names honest about WHEN — event-names reflect the actual local fire-point, not an upstream UI-level event. Naming
    convention codified; reserved-for-future names documented.
14. **Meta-file shape minimizes redundancy.** `# Metadata: {wu-name}` H1 + blank-line-grouped field blocks; content H2s
    reserved for archive-phase sections (Release Notes Entry, Completion Notes). Session-init full-read replaces the
    `^## Work Unit Metadata` partial-read anchor.
15. **Instance files carry minimal anchoring pointers, not duplicated orientation.** SESSION-NOTES, WORKING-MEMORY,
    USER-INBOX, BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md` open with a 1-3 line `>` blockquote pointing at the
    authoritative strategy section — no in-file orientation duplication. Per-file pointer sizing reflects what a
    cold reader needs; mechanism (template vs. inline) follows file complexity.

---

## Use Cases

System scenarios illustrating the change.

### UC1: Per-worktree isolation under the parallelism trio

**Current:** Three WUs in flight (WF, AWL, CWC). Their planning-state status files have merged to main via the
integrate-planning-branch flow. A new worktree branched from main contains three stale status files in `active/` —
actively misleading.

**Under WOR:** Each WU's meta file lives on its own branch only; main has empty `active/`. A new worktree branched from
main starts clean.

### UC2: Activation under single-branch-per-WU

**Current:** WU has `plan-foo.md` in `active/technical/` on `technical/plan-foo`; planning-branch PR merges to main; new
`technical/foo` branch created via `activate-work-unit.md`; second PR opens at integration. Two PRs total.

**Under WOR:** WU has `meta-foo.md` and `plan-foo.md` (later `prd-foo.md`, `tasks-foo.md`) in `active/` on `plan/foo`
branch; activation renames `plan/foo` → `feat/foo` locally + remote, flips `**State:** Planning → Active` on the meta
file, removes the plan-doc; single PR opens at integration. One PR total.

### UC3: Cohort-based parallelism trio coordination

**Current:** No formalized cohort vocabulary; sibling WU listed in status-file's `**Sibling Work Unit(s):**` field as a
name list (maintenance burden when members change).

**Under WOR:** Each cohort member's meta file declares `**Cohort:** parallelism-trio`; cohort membership tracked in
backlog via cohort wrapper subdir `backlog/planned/parallelism-trio/<wu-name>/`; member discovery during planning by
`ls` on the cohort dir, during execution by `grep` on meta files.

### UC4: Commit-convention discipline

**Current:** Commit `docs(arc): update workflow` — describes ~90% of repo; `docs` lazy (the change adds a workflow
feature but file extension is `.md`).

**Under WOR:** Commit `feat(init-wu): add workflow for WU scaffolding` — informative scope (subsystem name); type
matches intent. Hook refuses `arc` scope; `commit-format.md` guides intent-based type selection.

### UC5: Integration with sweep-as-you-go

**Current:** Integration PR contains code + completion-doc + status flip. Sweep runs separately at archival (next-WU
planning batch). Main has Complete-state files in `active/` between integration and archive.

**Under WOR:** Integration PR contains code commits + completion-content commits (Release Notes Entry + Completion Notes
composed into meta file's archive-phase sections) + sweep commits (meta file moves to `archive/<dated>/{wu-name}/`).
Merge transitions main from "didn't have these files" to "has them in archive/" in one PR.

---

## Requirements

### Lifecycle and branch conventions (P0)

**R1.** WU branches follow a CB-style type prefix. Type list is methodized as the new `branch-format` method
(parallel to existing `commit-format`), making the type set overridable per project. ARC's default type set:
`feat/<name>`, `fix/<name>`, `chore/<name>`, `refactor/<name>`, `hotfix/<name>` (5 types).

**R1 amendment basis (2026-05-14):** Original R1 specified a "CB core-6" set of
`feat | fix | chore | docs | refactor | perf` framed as alignment with the Conventional Branch spec. Verification
against the canonical spec at <https://conventional-branch.github.io/> showed the framing was incorrect on multiple
counts: CB's actual recommended set is `feature|feat | bugfix|fix | hotfix | release | chore` (5 prefixes); `docs`,
`refactor`, `perf` are not in CB and originate from the Angular Conventional Commits extension. CB uses
"recommended set" terminology, not "core" or "canonical." Amended set above reflects: strict CB types ARC's WU model
actually supports (`feat | fix | chore | hotfix`) plus `refactor` (distinct from `fix` per ARC's planning practice;
`chore` is too coarse). Drops `release/` per release-lifecycle gap (see Pressure Points § Release-lifecycle model).
Drops `docs`, `perf` (bundled into `chore` per CB's actual recommendation; projects that want finer granularity use
method override).

**R2.** Planning branches use `plan/<name>` prefix; rotate to `<type>/<name>` at activation via local rename + remote
replace.

**R3.** WU artifacts (`meta-{name}.md`, `plan-{name}.md`, `prd-{name}.md`, `tasks-{name}.md`, companions) live in
`active/` on the WU branch through entire lifecycle. Main carries no in-flight WU artifacts.

**R4.** Activation is an in-place state transition + branch rename, not a new branch creation. `**State:**` field flips
`Planning → Active`; branch `plan/<name>` renames to `<type>/<name>`; plan-doc `git rm`'d when graduated.

**R5.** Integration is the single merge-to-main moment. Sweep-as-you-go (default) bundles file moves from `active/` to
`archive/<dated>/{wu-name}/` into the integration PR as separate commits per multi-commit-PR norms.

**R6.** `[PLAN]:` PR-prefix retired entirely. No separate planning PR exists under single-branch-per-WU.

**R7.** Boundary workflows restructured:

- `integrate-planning-branch.md` — **retired entirely**
- `activate-planning-branch.md` → renamed `init-work-unit.md` — WU + meta-file creation. Workflow body
  restructured for single-branch-per-WU: planning branch follows `plan/<name>` pattern per R2; meta file
  created from `template-meta.md` per R58 with `{arc.identity}` substitution per R10. Two-branch-model
  framing retired (separate impl-branch cleanup step; batch-flow arm with retired
  `integrate-planning-branch` reference)
- `activate-work-unit.md` — name preserved with new semantic (state transition + branch rename, no directory move).
  Carries `[!NOTE]` block redirecting to `init-work-unit.md` for cases where the workflow runs against a non-existent WU
- `integrate-work-unit.md` — restructured for sweep-as-you-go + single integration PR
- `archive-work-unit.md` — Tier-1 step for Release Notes Entry + Completion Notes composition; collapses into
  `integrate-work-unit.md` under default `archive.cadence: with-integration`

### Meta-file evolution (P0)

**R8.** `template-status.md` → `template-meta.md` rename. Template carries phase-labeled sections (life-phase fields +
archive-phase sections); R58 specifies the H1 / H2 / field-grouping shape.

**R9.** `**State:**` value-set codified: `Planning | Active | Integrating | Shipped` (four values; strict state
machine). Each value names one lifecycle phase; commitment level (provisional vs planned) lives in dir location, not in
State. `**Integration:**` retired (folds into State as the `Integrating` value).

State transitions fire at workflow ceremonies:

- `init-work-unit` → creates meta with `State: Planning` (in backlog or directly on branch)
- `activate-work-unit` → `Planning → Active` (branch rename + plan-doc removal fire alongside)
- `integrate-work-unit` → `Active → Integrating` (PR opens; review iterates)
- archive ceremony → `Integrating → Shipped` (post-review-approval; composition + sweep + ROADMAP regen commit lands
  on the WU branch as the final push before merge)

Branch creation does not fire a State transition — a WU keeps `State: Planning` whether it lives in
`backlog/{provisional,planned}/<wu>/` (no branch yet) or `active/<category>/` on a `plan/*` branch. The signal
"branched, planning is happening on a real branch" lives in branch existence and prefix, not in State. session-init's
sessionType inference reads a State and branch-prefix composite: `State: Planning` with branch `plan/*` →
`sessionType: planning`; `State: Active` → `sessionType: execution`; `State: Integrating` → `sessionType: integration`.

**R10.** `**Owner:**` field — singular per WU. Solo mode auto-populates from `arc.identity` via template-placeholder
approach (`{arc.identity}` substituted at meta-file creation). Team-mode handoff updates the field sequentially.

**R11.** `**Depends On:**` field — bare WU-name list; renders into ROADMAP tier grouping. `**Blocks:**` deferred
(redundant under explicit Depends On).

**R12.** `**Origin:**` field with default `[internal]`. Orthogonal to `**Design:**` (per R68 — was `**Spec:**`
pre-rename; `**Design:**` always points at ARC-owned planning artifacts: `draft-{name}.md` during Planning,
`spec-{name}.md` during Active+). External tracker references go in `Origin`, never `Design`. `pm.layer` value-set
update (`arc-pm | external | none` → `arc-pm | none`) lands in `plan-arc-modes.md`, not WOR direct scope; WOR ships
the conceptual framing.

**R13.** `**Cohort:**` field — single name string; `[none]` for solo WUs (matches ARC's null-value sentinel convention
used by `Sibling Work Unit(s):`, `Blockers:`, `Depends On:`). Cohort is source of truth; sibling list derived (no
`**Sibling Work Unit(s):**` field). Membership discovery via group dir during planning, `grep` on `**Cohort:**` field
during execution.

**R14.** Archive-phase sections on meta file: PR URL, Completed date, Release Notes Entry (categorized per R26),
Completion Notes (narrative). Eliminate `completion-{name}.md` as a distinct artifact.

**R15.** Per-worktree isolation invariant: each worktree's `active/` contains only its own WU's meta file, because no
other branch's meta file is reachable from main. Codified in `strategy-work-organization.md`.

### Sweep-as-you-go (P0)

**R16.** `archive.cadence` config key in `arc-config.yml`. Values: `with-integration` (default — sweep in integration
PR), `manual` (explicit invocation).

**R17.** Integration PR under `with-integration` includes multi-commit structure across two timing phases. Code
commits land at PR open (state `Integrating`); review iterates. Post-review-approval, the completion-content commit
(Release Notes Entry + Completion Notes composed into the meta file's archive-phase sections, reflecting final
reviewed scope) plus the sweep commit (file moves from `active/` to `archive/<dated>/{wu-name}/`) plus the ROADMAP
regen commit land as the final push before merge (state `Shipped`). Reviewers focus per-commit; the post-approval
commits represent the WU in its terminal form. Two workflow-interlocks bracket the composition middle: agent gates
entry into the ceremony, then surfaces composed content + planned sweep + ROADMAP delta for confirmation before
commit + push fires.

**R18.** Tier-aware sweep ceremony (atomic / quick / standard scaling) is Agile WU Lifecycle's scope; WOR ships
tier-agnostic foundation. Async-merge accommodation (handoff and cleanup behavior during awaiting-review latency) is
Concurrent Work Conventions' scope; WOR ships sync-merge primary flow.

### Capture pipeline and backlog layout (P0)

**R19.** Four-surface capture model:

- `user/{identity}/USER-INBOX.md` — per-user, gitignored, notes-synced. Replaces `ATOMIC-INBOX.md` at this path. Two
  sections (`## Atomic`, `## Backlog`) routing at drain time
- `backlog/ATOMIC-INBOX.md` — project-shared, tracked. Atomic-character entries
- `backlog/BACKLOG-INBOX.md` — project-shared, tracked. Multi-step entries (consolidates retired `BACKLOG-FEATURE.md` +
  `BACKLOG-TECHNICAL.md`)
- `backlog/{planned,provisional}/<wu-name>/` — per-WU subdirs for matured backlog WUs; carry `meta-<name>.md` (always)
  plus `plan-<name>.md` and other companions when present

**R20.** Ceremony-only write rule for shared inboxes: writes fire only at activation absorption, integration drain,
planning-kickoff promotion. Outside these moments, shared inboxes are read-only by convention. Absorbed entries are
deleted, not marked — routing record lives in deletion commit message plus absorbing artifact.

**R21.** Commitment-dir split at backlog root: `backlog/planned/` (committed + sequenced on ROADMAP) and
`backlog/provisional/` (drafted, not yet committed). Each commitment dir holds per-WU subdirs; backlog root holds the
two commitment dirs + `ATOMIC-INBOX.md` + `BACKLOG-INBOX.md` + `ROADMAP.md` only (no `plans/` interlude, no standalone
plan-\* files at the root level). Graduation `provisional/` → `planned/` fires when WU added to ROADMAP (`git mv` of the
WU subdir rides the same commit as the ROADMAP entry); symmetric demotion supported. Graduation/demotion is a dir move
only — `State: Planning` stays unchanged across the transition; commitment level lives in dir location, not in State.

**R22.** Cohort wrapper subdir convention: `backlog/{state}/<cohort>/<wu-name>/` for codified sibling sets (e.g.,
parallelism-trio). Optional — only for cohorts with formal codification. Standalone WUs sit directly at
`backlog/{state}/<wu-name>/`. `active/` stays flat (no cohort dirs in active; tracked via `**Cohort:**` field on the
meta file). Cohort membership is state-uniform (all members in same state-dir).

**R22a.** Meta-\* is the durable identity artifact across the entire WU lifecycle. Created at WU stub creation (alongside
plan-doc, or alone for external-tracker-origin WUs); persists through all state transitions; lands in
`archive/<dated>/<wu-name>/` at integration with archive-phase sections composed. Single source of truth for state,
owner, dependencies, cohort, and (when applicable) spec pointer — workflows, programmatic elements, and renderers
consume it across the lifecycle. ROADMAP renderer (R37/R38) walks `active/**` and `backlog/{planned,provisional}/**` for
`meta-*.md` files via the same parser path.

**R22b.** Spec-flow contract explicitly deferred. WOR codifies three invariants — `meta-*` always exists (R22a), task
list structure is invariant across tiers, a parseable spec exists in some form before tasks are generated — and the two
scaling axes that govern everything above them: **mode** (Lite vs Full; `pm.mode: arc-in-git` vs `none`) and **tier**
(atomic / quick / standard per Agile WU Lifecycle). The actual optionality contract (which spec form applies under which
mode × tier combination, plan-\* required vs optional, verification model under tier collapse) ships in arc-plan
Conductor + Agile WU Lifecycle. WOR's role is structural: provide the invariants and scaling hooks; don't codify rules
downstream WUs will need to override. Guardrail against escape-hatching lives in tier classification (one-way promotion;
explicit opt-in for atomic) and the tier-invariant disciplines (process-task-loop, quality gates, commit discipline)
that stay uniform across tiers.

**R22c.** `template-plan.md` framing clarified. The current "Using this template is not required ... Delete this file
after the PRD is written and stable" preamble revises to drop the "optional" hedge while preserving the deletion
behavior. Plan-\* is the pre-PRD synthesis artifact for substantive shaping work; deleted at PRD creation per
`1_create-prd.md` (with optional graduation of substantive persisting content into a `notes-*.md` companion); never
persists into execution. Under WOR's single-branch-per-WU model, activate-work-unit carries a safety-catch deletion
(Task 3.3.e: `git rm plan-{name}.md if present`) for paths that skipped the create-prd boundary. Whether plan-\* is
created at all scales with mode and tier downstream of WOR; the deletion-at-PRD-creation behavior doesn't (plan-\*
never persists into execution at any tier). Amendment landed 2026-05-14 — original R22c proposed plan-\* persistence
post-PRD, contradicting `1_create-prd.md` lines 92-104 and ARC's consistent historical behavior; corrected here.

### Constitutional codifications (P0)

**R23.** Vocabulary distinction codified in `DEV-RULES.ARC` (or `AGENT-BRIEF.ARC.md` § Vocabulary):

- **Work unit** — the wrapper noun. Any bounded chunk of work with a branch, status, and PR. Invariant across tiers
  (atomic / quick / standard from Agile WU Lifecycle)
- **Atomic** — describes work character. Single-bounded, indivisible, no internal stages. Applies to items
  (capture-tier), tasks (companion-file scope), and WUs (atomic-tier)
- Inboxes distinguish by work character (atomic vs multi-step), not by wrapper presence/absence

**R24.** Capture-routing rule constitutionalized — moves from `DEV-RULES.PROJECT.md § Capture Routing` to
`DEV-RULES.ARC § Leave it cleaner`. Project-specific routing overrides remain in `DEV-RULES.PROJECT.md` if needed.

### Commit conventions (P0)

**R25.** CC type set codified to 8: `feat | fix | chore | docs | refactor | test | perf | revert`. Drops `style`,
`content`, `build`, `ci`, `config` (fold to `chore` or other informative types). `system/githooks/commit-msg` regex
enforces.

**R26.** Scope governance:

- Convention: subsystem / artifact-type / WU-feature name; never the repo name
- `system/githooks/commit-msg` hook refuses `arc` as scope (uninformative catch-all)
- Scope remains optional (not all commits need a scope); when present, must be informative
- Hook denylist starts with `arc` only; expands organically as new catch-all patterns surface in PR review

**R27.** `docs` discipline codified in `commit-format.md` method (principle only; no examples in methods — methods stay
token-lean):

- Type chosen by intent, not file extension
- `feat` = new capability (workflow, method, strategy, template, convention codification — even when delivered entirely
  in `.md`)
- `fix` = correcting drift, stale references, or out-of-date language in methodology surface
- `refactor` = restructuring methodology surface without behavior/convention change
- `docs` = external-facing prose only (`README.md`, docs-site content, onboarding guides)
- Rule of thumb: "What changed in system behavior or capability? Yes → `feat` / `fix` / `refactor`; No → `docs`"

Final placement decision (between `commit-format.md`, `commit-context-format.md`, and arc-commit skill) at task
generation time — all three load each commit; only one carries the principle.

**R28.** CB-relationship framing in `strategy-work-organization.md` § Branching and in the `branch-format` method
preamble: ARC's default branch type set is **inspired by Conventional Branch and the Angular Conventional Commits
extension**, not strict alignment with either. Substantive divergence documented (per R1 amendment): ARC adopts
`feat | fix | chore | hotfix` from CB's recommended set; extends with `refactor` (Angular CC); drops `release` (no ARC
release-lifecycle model yet — see Pressure Points); bundles `docs` and `perf` into `chore` per CB convention. The
`commit-format` and `branch-format` methods compose independently — one mechanism per axis, both overridable per project.

**R29.** Forward-only migration. Historical commits keep their existing type/scope tags (git history immutable). New
conventions apply from WOR merge forward.

**R29a.** Footer-convention propagation. The `Context:` footer convention extends to align with WOR's chain model,
single-branch-per-WU rename, and meta-\* anchor:

- **Method rename:** `commit-context-format.md` → `commit-footer.md` (file rename; all references updated; config key
  `commit.context_footer` retained — slot identity decoupled from filename).
- **Chain naming in method preamble:** Footer names the deepest spec-shaped artifact under edit along the WU chain —
  `meta-{name}` (lifecycle/maintenance) → `plan-{name}` / `prd-{name}` (Spec) → `tasks-{name}` (execution spec) →
  `atomic-{name}` (atomic-companion scope). Falls back to anchor `standalone` when no active WU exists.
- **Status → meta filename token:** `status-{name}.md` references in method body + hook regex + hook error examples
  migrate to `meta-{name}.md`. Atomically coupled with the in-flight file rename (R50 / Phase 6.3) — same commit, single
  logical change.
- **Standalone anchor for off-WU work:** `Context: standalone (maintenance|planning|documentation|refactor)` replaces
  the prior `{category} (no associated task list)` and `{category} (atomic / no associated task list)` patterns. Anchor
  itself declares the off-WU semantic; parenthetical describes the kind of work.
- **Off-WU category vocabulary:** `maintenance | planning | documentation | refactor`. Drops `content` per R25's CC
  type-set tightening. Off-WU `(planning)` = queue-shaping (ROADMAP, BACKLOG-INBOX edits); distinct from file-pointer
  `(planning)` (spec iteration).
- **Discreteness test for `(incidental during X)` vs `standalone`:** active WU exists → file-pointer +
  `(incidental during X)`; no active WU → `standalone (...)`. Codified in method preamble as a single binary check.
- **Meta-file parenthetical additions:** `(maintenance)` (off-ceremony meta edits incl. review-driven); `(deactivation)`
  (peer with handoff/activation/integration/archival ceremonies). `(planning)` drops from `meta-*` parenthetical set —
  overlap-elimination with `(maintenance)` since `meta-*` is metadata-only per R22a.
- **Tightened phrasing:** `(incidental - discovered during X)` → `(incidental during X)`. Drops scaffolding word.
- **Smoke test lock:** Hook + method changes ship with positive smoke tests (one per matrix cell) and negative smoke
  tests (known-invalid patterns: old `status-` prefix; `(content)` parenthetical; `(maintenance)` on `plan-*`;
  `(planning)` on `meta-*`; etc.). Catches regex-vs-method drift.

Propagation surface: `system/githooks/commit-msg` (regex + error examples), `system/methods/commit-footer.md` (renamed
body), `system/methods/README.md`, `system/workflows/arc/supplemental/prepare-commits.md` (frontmatter + body refs),
`arc-commit` skill, `reference/constitution/DEV-RULES.ARC.md` (reference link), packages/ sync copies. Adopter-facing
`docs/**` references deferred to docs-content sweep (captured in `plan-docs-content-sweep.md`).

Sequencing: hook + method body propagation hoists to Phase 6.2 neighborhood (Task 6.2 expansion or new Task 6.2.5) so it
lands before Phase 3 lifecycle workflow restructures (which emit the new parentheticals). The status→meta filename-token
edit stays atomically coupled with the in-flight file rename at Phase 6.3.

### Per-WU Release Notes Entry (P0)

**R30.** Every shipped WU has a Release Notes Entry section in its archived `meta-{name}.md`. Categorized:
`Added | Changed | Removed | Fixed | Infrastructure | Deprecated | Security` (full Keep a Changelog 7-category set).
One-paragraph user-facing summary plus optional Breaking Changes callout.

**R31.** Composition fire-point: integration ceremony, **post-review-approval** (after the `pre-merge-review`
extension and review-response cycles have settled, before the final push that merges). The state transition
`Integrating → Shipped` rides the same archive ceremony commit that lands composition + sweep + ROADMAP regen.
Discipline enforced by `integrate-work-unit.md` workflow steps with two workflow-interlocks (entry into ceremony +
final review of composed content before commit). Optional CLI validation hook (e.g., `arc state set shipped` checks
section presence) deferred to downstream tooling.

**R32.** Post-`Shipped` edits to Release Notes Entry are errata only; no mechanical lock. Git history is the lock —
matches keep-a-changelog norms.

### PROJECT-PRD redesign (P0)

**R33.** PROJECT-PRD shape codified: Mission (1-3 sentences) + numbered principles (5-7, quotable as nouns) +
anti-goals + problem statement + design tradeoffs. Per R63 (one-shot template uniqueness), the shape lands in
`META-PRD.template.md` directly (renames to `PROJECT-PRD.template.md` per R35); no parallel
`reference/templates/template-project-prd.md` is created.

**R34.** Ceremony fire-points wire PROJECT-PRD into the development loop (hybrid placement):

- `1_create-prd.md` — **explicit** `## Step N: PROJECT-PRD alignment check` with halt-and-ask conditions; cites a
  specific principle by number when passing (not just "checked, passed")
- `activate-work-unit.md` — sub-bullet within existing review step (conditional supplementary check; fires only when
  PROJECT-PRD edited since PRD approved)
- `integrate-work-unit.md` — sub-bullet within existing review step (final flag check; soft, rarely blocks if create-PRD
  check passed)

**R35.** This repo's `.arc/reference/PROJECT-PRD.md` content rewritten per new shape (dogfooding pass) AND filename
renamed from `META-PRD.md` to `PROJECT-PRD.md` to resolve the `meta-*` file-class collision (meta-\* is the per-WU
pointer file class under R8 / R58; PROJECT-PRD is the single project-level vision artifact — distinct concepts deserve
distinct names). Package source template file `META-PRD.template.md` renames in parallel to `PROJECT-PRD.template.md`.
Inbound references in workflows, strategies, methods, hooks, and CLI code
(`packages/arc-framework/src/lib/classification.ts` hardcodes the template filename) update via the migration sweep.
Content rewrite surfaces shape ambiguities feeding back into `template-project-prd.md` v1.1 if needed.

**R36.** Update triggers consolidated: organic (PR-time clarification when conflict surfaces) + event-driven (major
release, scope shift, governance change). Not cadence-driven by default.

### ROADMAP as rendered view (P0)

**R37.** ROADMAP.md becomes a generated artifact rendered from `active/**` and `backlog/planned/**` meta-files. Source
of truth is the meta files (`**State:**`, `**Owner:**`, `**Depends On:**`). ROADMAP header carries "Generated by
`arc roadmap render` — do not edit by hand" note + last-rendered commit hash.

**R38.** Render algorithm codified in `strategy-work-organization.md`:

1. Walk `active/**` and `backlog/planned/**` for `meta-*.md` files (recursive glob handles both standalone subdirs
   `backlog/planned/<wu-name>/` and cohort-wrapped subdirs `backlog/planned/<cohort>/<wu-name>/`)
2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, title fields
3. Topologically sort by `**Depends On:**`
4. Group into tiers (In Flight / Foundation / Tier 2+ / Independent Tracks)
5. Render markdown per tier
6. Footer note pointing to `provisional/`

**R39.** Regeneration fire-points (ceremony-coupled): WU graduation (`provisional/` → `planned/`); WU activation
(`planned/` → `active/`); WU integration (`active/` → archive); dep-field edit on any planned/active meta-file. Each
ceremony workflow includes a regenerate-ROADMAP step. Interim discipline pre-CLI: hand-maintain per algorithm.

### Archive shape and PROJECT-STATUS retirement (P0)

**R40.** `.arc/reference/PROJECT-STATUS.md` deletes entirely. Function decomposes:

- Completed-work history → per-WU Release Notes Entry sections in archived meta files
- Project direction / themes → PROJECT-PRD (Mission + principles + anti-goals)
- Done-vs-left snapshot → directory query (`provisional/` + `planned/` + `active/` + archive)

No replacement artifact. Content not directly carried forward by Release Notes Entries or PROJECT-PRD logged in the
deletion commit message.

**R41.** New archive shape: `completed/<dated>/{NN}_{wu-name}/` (drop `{category}/` subdir; symmetric with backlog's
group-dir collapse; preserves `NN` completion-order prefix). Temporal grouping (`2026-q*`) retained.
**NN preserved** as a 2-digit completion-order prefix assigned at archival; resets per dated subdir. Provides
filesystem-browse-time ordering (`ls .arc/completed/<quarter>/` shows WUs by completion sequence) at zero UX cost —
alphabetical sort without NN scrambles intra-quarter completion order.

**R42.** Historical archive layout reshaped to R41 shape at WOR Task 6.9.e (`completed/<dated>/{NN}_{wu-name}/`) —
the `.arc/` root promotion via R62 made the prior categorical heterogeneity visible enough to motivate normalization.
**File contents preserved as-is** — `status-*.md` keeps its filename (no rename to `meta-*`); `completion-*.md` stays
in place (no fold into meta archive-phase per R30); no field backfill on historical meta files. Directory structure
changes only; no retroactive content migration. NN reconstructed from git history (first-add commit on primary
task list) for pre-WOR-layout content that lacked NN.

**R43.** Backward-compat tooling requirement: anything reading the archive (renderer, future CLI, search/audit) must
handle both legacy shape and new shape. Contract on downstream CLI work, stated here so future WUs honor it.

### Roster cascade (P1)

**R44.** Library function in `packages/arc-framework/src/lib/git/` (module name TBD at task generation —
`worktree-roster.ts` or `wu-roster.ts`). Returns list of
`{worktreePath, branch, identity?, metaFilePath, state, cohort?}` tuples from `git worktree list` + per-worktree
meta-file resolution. Synchronous worktree-list read; async per-worktree meta-file resolution; returns empty list when
no worktrees or no meta files surface (clean degradation).

**R45.** Vitest unit + integration tests. API surface settled at task generation time; consumer wiring (Worktree
Foundation's branch-gone detection) left to WF.

### Planning-checkpoint review opt-in (P1)

**R46.** _Deferred to `plan-customization-arch-realign.md`._ The originally proposed
`review.planning_checkpoint` config key surfaced a deeper smell in ARC's customization
architecture (config-as-method-toggle pattern with no method behind it). Resolution moved
out of WOR; see the customization-architecture plan for the reform that determines whether a
planning-checkpoint mechanism re-emerges (as a method with `active` flag, an extension-only
path, or not at all).

**R47.** Extension point `pre-activation` (renamed per R56 from the originally proposed
`pre-execution-graduation`) fires at the planning → execution boundary in `activate-work-unit.md`.
Default no-op; teams populate `.actions` for automated review steps or for a deliberate halt
prompt (CodeRabbit invocation, custom validators, lint runs, workflow-interlock pauses).

**R48.** Convention inventory entry added to `strategy-configurability-architecture.md`: "Planning
checkpoint review | P2/P4 | No checkpoint stop | Extension — `pre-activation`."

### Atomic-tier infra-edit smell flag (P1)

**R49.** Documentation-only smell flag in `DEV-RULES.ARC` (and strategy doc note). Atomic-tier work shouldn't touch
`.arc/system/`, `.arc/reference/strategies/`, `arc-config.yml`, or other load-bearing infra files. Such edits warrant
quick-tier at minimum (multi-commit coordination, deliberate sequencing). Routes captured atomic surfaces (ATOMIC-INBOX)
accordingly.

### Incidental WU model substrate retirement (P0)

**R49a.** Incidental WU model substrate retires implicitly under WOR's lifecycle + meta-file requirements; conceptual
retirement and workflow rewrite remain Worktree Foundation + Agile WU Lifecycle scope. The split exists because
incidental's function (interrupts another WU) needs shift lifecycle (WF) as its replacement and tier model (AWL) as its
lighter-ceremony replacement — both downstream of WOR.

**Substrate retired under WOR (by virtue of complete positive enumeration elsewhere):**

- **Branch prefix `incidental/`** — R1's CB core-6 is a positive enumeration; `incidental/` retires alongside `feature/`
  and `technical/`.
- **`active/incidental/` category dir** — R3 + R15 make `active/` flat (no category subdirs); the per-worktree isolation
  invariant forecloses category-bucketing.
- **Status-file pointer fields `Interrupts:` / `Paused At:` / `Paused To:`** — R8-R14 + R58 codify the complete
  meta-file field set; the pause-pointer fields are absent. (This overlaps Worktree Foundation's plan scope item 7
  "Pause-pointer reconciliation: option 2"; field-level retirement happens here, while WF retains migration of
  `manage-incidental-work.md`'s pause-state semantics to shift state.)

**Substrate retained for downstream retirement:**

- **`manage-incidental-work.md` workflow** — retains its function during the WOR→WF window (no shift lifecycle yet means
  no replacement for mid-execution interrupts). Workflow retirement itself is AWL scope.
- **Conceptual references in `strategy-work-organization.md` § Incidental Work Model + § Work Categories** — sections
  rewrite to current-state framing (branch-type selection via `branch-format` method; interrupt routing via
  DEV-RULES.ARC § Leave it cleaner). Touched shipped surfaces describe what's true now without "transitional" /
  "pending" framing; internal-roadmap sequencing (WOR→WF→AWL, full content retirement under AWL) stays in this PRD
  and other internal-dev surfaces.

**Transitional shape during WOR → WF → AWL window:** `manage-incidental-work.md` workflow continues to exist but its
substrate (branch prefix, category dir, status-file pointer fields) is gone. Shipped surfaces describe current state
in plain language; transitional framing stays in internal-dev surfaces (WU notes, Persistent Context). For
mid-execution interrupts during the WOR→WF window, inline-on-current-branch handling follows the established
Persistent Context pattern.

### Extension fire-point family (P0)

**R55.** Extension fire-point naming convention codified in `strategy-configurability-architecture.md`:

- Pattern: `{pre|post}-{lifecycle-event-name}` where event-name is the next concrete workflow step or git operation
- Event-names must reflect the actual local fire-point, not an upstream UI-level event (e.g., `pre-pr-review` not
  `pre-merge-review` for the pre-PR-creation push fire)
- Frequency must be wireable to match the name's semantic — if `pre-commit-review` is its name, it must fire at every
  commit pathway, not just one workflow
- Reserved-for-future names: family members defined in convention even when no default `.actions` yet (e.g.,
  `pre-push-review` reserved as the every-push fire-point name)

**R56.** Five-extension fire-point family at WU lifecycle, with wiring:

| Extension           | Fire-point                                               | Wired into                                   | Default                         |
| ------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------- |
| `pre-activation`    | `activate-work-unit.md` step 1 pre-condition gate        | activate-work-unit                           | inactive                        |
| `pre-commit-review` | After staging, before commit creation                    | `arc-commit` skill + `prepare-commits.md`    | inactive                        |
| `pre-pr-review`     | `integrate-work-unit.md` pre-PR-creation push            | integrate-work-unit                          | inactive                        |
| `pre-push-review`   | Any push via push wrapper                                | `arc release push` / `arc sync` push pathway | inactive; no default `.actions` |
| `pre-merge-review`  | `integrate-work-unit.md` post-review-response, pre-merge | integrate-work-unit                          | inactive; no default `.actions` |

Renames from existing extensions:

- `pre-execution-graduation` → `pre-activation` (R47's extension; renamed before file ships)
- `pre-stage-review` → `pre-commit-review` (wiring extended from prepare-commits-only to arc-commit + prepare-commits)
- `pre-merge-review` (current) → `pre-pr-review` (frees the `pre-merge-review` name for the genuine pre-merge
  fire-point)

New files (no prior counterpart; default-no-op shells):

- `pre-push-review.md`
- `pre-merge-review.md` (name freed by current `pre-merge-review` → `pre-pr-review` rename)

Three-extension family at `integrate-work-unit.md` aligns with `plan-review-method-family`'s `review-response` middle
piece: `pre-pr-review` (WOR; before PR creation) → `review-response` (plan-review-method-family scope; processes
received feedback) → `pre-merge-review` (WOR new; before actual merge). WOR ships the bookends; the method-family plan
ships the middle.

**R57.** Extension description/contract pass: while touching extensions for renames + new file creation, audit each
extension file's description, contract block, and "Use for" framing to ensure alignment with the WOR family conventions
and to clarify decision boundaries between extensions and adjacent mechanisms (e.g., `pre-commit-review` vs git
pre-commit hook — extensions carry agent procedures and `workflow-interlock` stops; hooks carry scriptable checks;
complement not duplicate).

### Meta-file shape (P0)

**R58.** Meta-file shape specification (supplements R8's "phase-labeled sections"; field names reflect R68 rename):

- H1: `# Metadata: {wu-name}`
- Body: blank-line-separated field blocks within H1 (no internal `## Work Unit Metadata` H2 wrapper):
    - Identity: `State`, `Owner`, `Branch`
    - Reference: `Origin`, `Design` (per R68, was `Spec` pre-rename)
    - Coordination: `Depends On`, `Cohort`
    - Task pointers: `Task List`, `Last Completed`, `Next Task`, `Blockers`
    - Directive: `Next Action`
    - Post-integration block (added at integration ceremony): `PR URL`, `Completed`
- Reference-group ordering puts `Origin` before `Design` to reflect the chain-of-authority direction
  (`Origin → Design → Task List → PR URL`); see R58a for the cross-file chain-model convention
- Content H2s added at Active → Integrating transition: `## Release Notes Entry`, `## Completion Notes`
- Session-init's `^## Work Unit Metadata` partial-read anchor retires; meta file becomes a full-read target (cost: 8
  additional concise fields per read; benefit: regex-anchor maintenance retired and archive-phase content gated by H2
  boundary)
- If named-section anchors become important later for cross-WU referencing, groups can be promoted to H2 then —
  reversible

**Retired from prior `status-{name}.md` shape (by positive enumeration above):**

- `**Branch(es):**` plural form → retired in favor of `**Branch:**` singular per R3 + R5 (single-branch-per-WU
  forecloses plural)
- `**Base Branch:**` → retired; invariant `main` under single-branch-per-WU + single integration merge per R5 makes the
  field carrier-less. Project-level base-branch override (if needed) is a project-level config concern, not per-WU state
- `**Sibling Work Unit(s):**` → retired by R13 (cohort is source of truth; siblings derived)
- `**Integration:**` → retired by R9's 4-state enum (folds into `State: Integrating`)
- `**Interrupts:**` / `**Paused At:**` / `**Paused To:**` → retired by R49a (incidental WU model substrate retirement)

**Deliberately not added:**

- `**Worktree:**` — per-machine + structurally duplicates host-directory location; worktree path resolution lives in
  R44's roster cascade (`git worktree list` + per-worktree meta-file resolution) and Worktree Foundation's
  `worktree.location_template` convention. Tracking machine-specific data in tracked content is wrong shape.
- `**Tier:**` — Agile WU Lifecycle scope (AWL plan item 4); WOR's Identity group leaves room for AWL to add `Tier:`
  later alongside `Branch:`. Both characterize WU shape; group cohesion holds.
- `**Created:**` / state-transition date fields (`Activated:`, etc.) — derivable from git log on meta-\* edits;
  metrics-flavor; not WOR scope. Could ship later if cycle-time tracking warrants.
- `**Title:**` / `**Description:**` — WU name in H1 covers identification; substantive WU thesis lives in co-located
  `draft-*` / `spec-*` (per R66/R67 file-class names + R58a chain-model); adding meta-level description would duplicate
  that.

### Cross-file header conventions (P0)

**R58a.** Cross-file header convention follows the chain-of-authority model. Each non-meta WU artifact carries its
immediate-upstream pointer as a header field; meta-\* carries the full chain as the canonical authority view. Field
names reflect R68 rename (`Spec` → `Design`; `Task List` retained) and file-class names reflect R66/R67
(`prd-*` → `spec-*`; `plan-*` → `draft-*`).

| File       | Header field(s)                                                              | Substantive opening                       |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `meta-*`   | Full R58 field set (Origin / Design / Task List + post-integration PR URL)   | (none — meta is structural)               |
| `draft-*`  | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `spec-*`   | `**Origin:**` (default `[Internal]`)                                         | `**Purpose:**` follows as document thesis |
| `tasks-*`  | `**Design:**` (the upstream spec artifact)                                   | (no thesis — derived execution surface)   |
| `notes-*`  | (none — companion to entire WU; no formal upstream)                          | (free-form content)                       |

**Principles:**

1. **Bounded duplication.** Each non-meta artifact carries exactly one 1-hop pointer to its immediate upstream. No
   two-hop or full-chain duplication outside meta-\*.
2. **Meta authority.** Meta is the only artifact carrying the full chain — Origin + Design + Task List +
   post-integration PR URL. Reading meta-\* alone gives a complete trace from work origin to delivered PR.
3. **Self-describing in isolation.** Opening a non-meta artifact cold tells the reader its immediate authority (Origin
   for draft / spec; Design for tasks) without needing to first read meta-\*.
4. **Drift surface bounded by immutability.** Origin is set at WU creation and effectively never changes; Design on
   `tasks-*` is fixed at task-list creation; `meta-*`'s Design is phase-varying (`draft-*` → spec-artifact at
   activation). Real-world drift risk near-zero.

**`Design:` field generalizability (deliberate forward-compat; was `Spec:` pre-R68).** `**Design:**` names the upstream
spec artifact regardless of artifact type. Today's standard-tier WUs have a PRD-shape spec; future tier variants per
AWL (atomic / quick / standard) or future modes per arc-plan Conductor / Lite mode may use lighter-templated spec
variants (e.g., a recycled `template-plan.md` middle-weight variant — see R66; `brief` is ruled out as a name, it
collides with `reference/briefs/`). The field
name does not lock to any single template variant — it points at whatever the spec artifact is for the WU's
tier × mode × template-variant combination. PRD-shape is the today-default heaviest variant; the contract is
generalizable.

**Retired duplications:**

- `**Purpose:**` field on `tasks-*` retires. It was a mirror of PRD's Purpose (drift surface) and is not a 1-hop pointer
  (substantive content duplication, not upstream-pointer convention). The spec doc (`spec-*`) remains canonical for
  purpose statement; readers reach it via `tasks-*`'s `Design:` pointer.
- `**PRD:**` field name on `tasks-*` renames to `**Design:**` for vocabulary alignment with `meta-*` (under R68; was
  scheduled as rename to `**Spec:**` pre-R68 — terminal target is `**Design:**`, one-step migration).

### Instance-file orientation slimming (P0)

**R59.** Instance files carry a minimal anchoring pointer — no substantive orientation duplication. Each file opens
with a 1-3 line `>` blockquote that anchors a cold reader: what the file is, the most load-bearing write-discipline
constraint, and a reference to the strategy section that carries the authoritative orientation. Purpose-built per
file, not a uniform preamble.

- Affected files: `user/{identity}/<wu-name>/SESSION-NOTES.md`, `user/{identity}/WORKING-MEMORY.md`,
  `user/{identity}/USER-INBOX.md`, `backlog/BACKLOG-INBOX.md`, `backlog/ATOMIC-INBOX.md` (file paths reflect post-R65
  structural reform — see § User workspace directory reform)
- Pointer sizing per file (driven by what a cold reader needs):
    - `<wu-name>/SESSION-NOTES.md` — 1 line. Loaded every session by session-init; the human reader gets a one-line
      anchor on manual open.
    - `WORKING-MEMORY.md` — 2-3 lines. Cross-WU eviction-triggered context; pointer surfaces the `_Remove when:_`
      per-entry convention.
    - `USER-INBOX.md` — 2-3 lines. Personal capture surface; pointer surfaces section semantics (`## Atomic` vs.
      `## Backlog`).
    - `backlog/ATOMIC-INBOX.md` + `backlog/BACKLOG-INBOX.md` — 2-3 lines each. Project-shared; pointer carries the
      ceremony-only-writes discipline (load-bearing — cold readers risk writing to the wrong surface otherwise).
- Authoritative orientation lives in strategy docs (`strategy-session-operations.md` for SESSION-NOTES and
  WORKING-MEMORY; `strategy-planning-module.md` for inboxes). Pointers reference these — they do not duplicate them.
- Seeding mechanism follows file complexity, not a blanket rule:
    - Per-user files (SESSION-NOTES re-seeded per WU activation; WORKING-MEMORY + USER-INBOX one-shot at init/join)
      use the post-init verbatim-copy mechanism — templates live under `packages/arc-framework/templates/user/`,
      seeded by `lib/setup.ts` / `commands/user/add.ts` (init/join) and `arc user open` (activation; see R65c).
    - Project-shared backlog files (BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md`) use the recipe-driven mechanism —
      `.template.md` files under `packages/arc-framework/arc/backlog/`, listed in `init-recipe.json`'s
      `pm.mode == arc-in-git` conditional `include_files`. Consistent with existing
      `BACKLOG-FEATURE.template.md` / `BACKLOG-TECHNICAL.template.md` precedent (which retire under R50's
      BACKLOG-INBOX merge).
- Migration: existing instance files in this repo replace bloated preambles with the new minimal-pointer shape during
  the migration pass.

**R59a.** Orientation-content precondition. The strategy sections that R59's pointers reference must exist before
pointers replace preambles — otherwise the pointer points at nothing. Confirmed via grep (2026-05-14) that
`strategy-session-operations.md` and `strategy-planning-module.md` do not currently carry the relevant SESSION-NOTES /
inbox-family orientation content. WOR authors the content into those strategies (SESSION-NOTES gets purpose /
lifecycle / portability; each inbox gets purpose, lifecycle, and write-discipline summary for USER-INBOX,
BACKLOG-INBOX, and `backlog/ATOMIC-INBOX.md`) as the R59 precondition. Lands in Phase 2 before Task 6.8's
instance-file shape migration fires; pointers land in working order with no broken references across the transition.

### User workspace directory reform (P0)

**R65.** The `user/{identity}/` directory adopts a path-structural classification reform that makes the worktree-default
world tractable. Pre-WOR, the directory carried a flat mix of WU-scoped files (SESSION-NOTES) and developer-scoped
cross-WU files (USER-INBOX, persistent-context entries embedded in SESSION-NOTES). Under WOR's per-worktree isolation
invariant + the parallelism trio's parallel-WU model, the two semantic classes (per-WU vs cross-WU) need structural
separation so each worktree sees its own WU-scoped content cleanly while developer-scoped content surfaces uniformly.
The reform applies the same convention pattern WOR establishes elsewhere (location-by-state, class-by-path): file
placement encodes semantic class.

WOR ships the structural foundation — file relocations, strategy + workflow doc updates, in-flight migration. Sync
mechanism implementation (path-driven dispatch in `arc user save/load`, value-level merge for cross-WU files,
tombstones, spawn → first-load handling) defers to Worktree Foundation (`plan-worktree-foundation.md` scope item 6
consumes this reform's structural foundation).

**R65a.** Per-WU subdir convention. WU-scoped personal content lives in `user/{identity}/<wu-name>/`, where `<wu-name>`
matches the standard WU identifier (the same token used in `meta-<wu-name>.md` and branch suffix). Files in scope:

- `user/{identity}/<wu-name>/SESSION-NOTES.md` — personal session context (was `user/{identity}/SESSION-NOTES.md`)
- `user/{identity}/<wu-name>/meta-<wu-name>.md` — contributor-role meta file when applicable (was
  `user/{identity}/active/status-<wu-name>.md`; both subdir location and filename-token migrate, the token piece
  composing with WOR's status-\* → meta-\* rename). Path convention codified here; **creation step + full
  contributor-flow lifecycle defer to `plan-contributor-path.md`** (see § Non-Goals).

Each worktree's `user/{identity}/` filesystem contains exactly one WU subdir at a time (its own WU's), giving immediate
at-a-glance worktree-correctness: `ls user/{identity}/` shows which WU this worktree serves. Multi-worktree concurrent
use: each worktree's filesystem has its own WU subdir; the subdirs never collide because worktrees are physically
separate. The `active/` subdir under `user/{identity}/` (current contributor-role location) retires with this reform.

**R65b.** Cross-WU files at root + WORKING-MEMORY.md extraction. Developer-scoped content lives flat at
`user/{identity}/`:

- `user/{identity}/USER-INBOX.md` — personal capture (unchanged location)
- `user/{identity}/WORKING-MEMORY.md` — new file extracted from SESSION-NOTES's prior `## Persistent Context` section.
  Carries the developer's cross-WU eviction-triggered context (constraints, things-to-watch, pragmatic tradeoffs pending
  downstream WUs). Each entry retains the explicit removal-trigger convention from its prior form
  (`_Remove when: [trigger]_`).

Naming rationale: "Working memory" captures the actively-held-with-eviction semantic — maps directly to the per-entry
removal trigger and differentiates from SESSION-NOTES (per-WU snapshot) and USER-INBOX (capture surface). Sorts after
USER-INBOX in alpha-order — inbox-first reading order preserved.

The session-handoff workflow updates: instead of writing one SESSION-NOTES.md with embedded `## Persistent Context`
section, it writes `<wu-name>/SESSION-NOTES.md` (session-volatile content) and updates `WORKING-MEMORY.md` (cross-WU
persistent entries) as separate file operations. session-init reads both as part of T2 state load.

**R65c.** Per-WU subdir lifecycle. R65a's "exactly one WU subdir per worktree's `user/{identity}/`" invariant requires
explicit enforcement at lifecycle transitions, since the subdir is gitignored and persists across operations that
otherwise clean up tracked artifacts.

- **Creation.** At WU activation (`activate-work-unit.md`, and `init-work-unit.md`'s planning-branch step), the
  workflow invokes `arc user open <wu-name>` to create `user/{identity}/<wu-name>/` and seed SESSION-NOTES inside
  from `templates/user/SESSION-NOTES.md`.
- **Retirement.** At integration (`integrate-work-unit.md`, post-merge), the workflow invokes
  `arc user close <wu-name>` to remove the per-WU subdir. Gitignored content; filesystem op only, no git ops.
- **Defensive retirement at activation.** Before `arc user open` proceeds, if `user/{identity}/` already contains a
  WU subdir for a different WU, the helper surfaces the stale subdir and prompts the developer before removing —
  covers the aborted-WU case where integration never ran, and the single-checkout sequential-WU case where reuse is
  the default (pre-Worktree Foundation). Prompt shape: `Stale subdir user/{identity}/<wu-name>/ from prior WU.
  Remove? (y / inspect)`. `inspect` lists the subdir contents (likely a stale SESSION-NOTES with potentially-valuable
  context) before re-prompting; `y` removes and proceeds.
- **Multi-worktree case** (Worktree Foundation, downstream): worktree removal at integration cleanup transitively
  removes the subdir along with the worktree. `arc user close` is moot when the whole worktree is going away; the
  helper exists for the single-checkout case (current default, pre-WF) and as the unambiguous explicit surface that
  WF inherits without redefining.
- **Helper command shape.** `arc user open <wu-name>` / `arc user close <wu-name>` follow the existing `arc user *`
  verb-only subcommand pattern (`arc user add` / `arc user pull` / etc.). Agent-run, workflow-invoked. Encapsulates
  path computation, idempotency, and the defensive-prompt logic in a unit-testable surface — same encapsulation
  benefit as `arc user add`.

### Spec form scaling and artifact rename (P0)

**R66.** `prd-*` → `spec-*` file-class rename. WU spec artifacts adopt `spec-{name}.md` filename
prefix across `active/`, `backlog/`, and historical references. The spec-creation workflow
`1_create-prd.md` renames to `1_create-spec.md` (both copies — package source + `.arc/`).

Template handling: `template-prd.md` preserves its filename and content (becomes the **default
heaviest spec template variant** — PRD-shape). Additional, lighter spec template variants are
**out of WOR scope** — they land with `plan-arc-plan-conductor.md` as part of the scalable planning
model (`brief` is ruled out as a variant name — it collides with `reference/briefs/`). The spec
doc's H1 carries form-signal (`# PRD: Foo` for full-PRD shape; lighter variants use their respective
form-name H1). Form variation lives in template choice + H1, not in filename — `spec-*` is uniform
regardless of template variant. The `reference/templates/` directory restructures to support this:
an `arc/` + `project/` split (framework-managed vs. adopter-owned), WU-artifact templates grouped
under `arc/work-unit/`, and spec-form templates under `arc/work-unit/spec/` — the home for
`template-prd.md` and the future lighter variants (Phase 7.3 execution).

The `**Design:**` field (per R68) accepts `spec-{name}.md` during Active / Integrating / Shipped
phases — phase-varying value-set documented at R58a's `Spec:` field generalizability clause
(retained under the new field name per R68).

Rationale: "PRD" is product-management-genre-specific; "spec" is the umbrella term for
intent-defining artifacts across software-engineering vocabulary (tech spec / product spec / design
spec / RFC / etc.). Unifying under `spec-*` decouples filename from form, enabling form scaling
through template variants without filename-class proliferation.

**R67.** `plan-*` → `draft-*` file-class rename. Pre-spec exploration artifacts adopt
`draft-{name}.md` filename prefix across `active/`, `backlog/`, and historical references. Template
`template-plan.md` renames to `template-draft.md` (both copies).

The `arc-plan` skill (planning conductor — see `plan-arc-plan-conductor.md`) operates on `draft-*`
docs — verb-noun pairing shifts from "arc-plan produces `plan-*`" to "arc-plan produces `draft-*`";
skill name preserved (the verb describes the act of planning, not the artifact form).

The `**Design:**` field accepts `draft-{name}.md` during Planning phase — phase-varying value-set
per R66.

Rationale: current `plan-*` name collides with WU `Planning` state, `arc-plan` skill,
`backlog/planned/` subdir (per R21), and conductor depth-mode vocabulary. `draft-*` cleanly
conveys "pre-spec exploration, evolving, may be rough but not impl-ready" — and is consistent
with the artifact's disposition (graduated via `git rm` at activation per R4).

Collateral consideration (out of WOR scope, deferred to conductor WU): the proposed
`refine-plan-loop.md` workflow (`plan-arc-plan-conductor.md` § Design Lean § 10, § 17) likely
warrants rename to `refine-draft-loop.md` for naming consistency. Decision at conductor PRD time.

**Filename-history note (forward-compat with conductor WU):** under R67, `template-plan.md`
retires (renamed `template-draft.md`). If the conductor WU re-introduces `template-plan.md` as a
_middle-weight spec template variant_ (templating `spec-*` content rather than `draft-*` content),
it would be a same-name re-introduction with different role. No git conflict (file is gone
post-WOR-rename); flagged in `plan-arc-plan-conductor.md` § WOR alignment note so the future
author understands the history.

**R68.** Meta-file field rename: `**Spec:**` → `**Design:**` (`**Task List:**` retained). The
upstream-design pointer shifts from artifact-type naming (`Spec`) to artifact-role naming
(`Design`), aligning with the other role-based meta-file fields (`Origin`, `State`, `Owner`,
`Depends On`, `Cohort`). The execution-decomposition pointer keeps its self-evident `Task List`
label. Per R58's field-grouping shape, the Identity / Reference / Coordination / Task-pointers /
Directive groups retain their structure; only the `Spec` label renames within them.

Field values per phase (composes with R66 + R67):

- `**Design:** [none]` — pre-draft state (no spec artifact yet)
- `**Design:** draft-{name}.md` — Planning phase (was `**Spec:** plan-{name}.md` pre-WOR)
- `**Design:** spec-{name}.md` — Active / Integrating / Shipped phases (was `**Spec:** prd-{name}.md`
  pre-WOR)
- `**Task List:**` is unchanged — `[none]` during Planning; `tasks-{name}.md` from Active onward.

The `tasks-*` header field per R58a renames `**Spec:**` → `**Design:**` for vocabulary alignment
with meta-*. Hook validators (`validate-meta-spec.ts` script + pre-commit hook), workflow files,
strategy docs, and method docs that reference the `Spec` field name update per the rename
(execution at Phase 7's cross-reference sweep).

Rationale (Design-only — the asymmetry is deliberate): `Design` earns the rename because it recurs
as a cross-file role — the 1-hop upstream pointer on every `tasks-*` (per R58a) — so a reader
opening a task list cold learns the design-directed posture from the field itself, repeatedly and at
the point of use; and `Design: spec-{name}.md` reads as meaningful where `Spec: spec-{name}.md` reads
as a stutter. `Task List` is retained because the alternative (`Blueprint`) recurs nowhere as a
cross-file role, over-claims for what a task list is, and is less self-evident than the plain term.
Rename only where the word does recurring semantic work; don't elevate a lone synonym.

Principle codification (load-bearing for the rename's teaching value):

- `template-meta.md` comment block frames the design-directed posture plainly — "`**Design:**`
  captures intent; the task list decomposes it into execution; design precedes implementation" —
  stating the convention, not the rejected alternative.
- `DEV-RULES.ARC` § Task Execution adds an explicit principle statement codifying
  design-before-implementation. (Currently implied through workflow structure; promoted to
  named principle.)
- `strategy-work-planning.md` adds the principle as a stated invariant in the pipeline
  framing.

These accompany the field rename, not as decorative additions — without explicit prose
codification, the label-level reinforcement lands too implicitly to do teaching work.

### Migration sweep (P0)

**R50.** One-time migration ops:

- Leaked Planning-state `status-*.md` files in `active/` on main — cleanup
- In-flight `status-*.md` → `meta-*.md` rename
- Per-user `ATOMIC-INBOX.md` → `USER-INBOX.md` rename (content moves under `## Atomic` section; `## Backlog` initially
  empty)
- `BACKLOG-FEATURE.md` + `BACKLOG-TECHNICAL.md` merge → `backlog/BACKLOG-INBOX.md`
- New empty `backlog/ATOMIC-INBOX.md`
- `backlog/feature/` + `backlog/technical/` contents migrate to per-WU subdirs under
  `backlog/{planned,provisional}/<wu-name>/` (per ROADMAP-inclusion test); each migrated WU gets a `meta-<name>.md` stub
  generated alongside (interactive backfill: `Origin` / `Owner` / `Depends On` / `Cohort`; all backlog WUs get
  `State: Planning` regardless of commitment dir); existing sibling sets pick up cohort wrapper subdir treatment within
  their respective commitment dir (`backlog/{provisional,planned}/<cohort>/<wu-name>/`); two backlog-stage PRDs
  (`prd-arcd-rebrand.md`, `prd-arcd-docs-site.md`) demote to plan-docs (`prd-*` → `plan-*`) with content reshaped from
  PRD commitment-language to plan-doc exploratory framing; the docs-site WU renames from `arcd-docs-site` to
  `docs-site-refresh` (the rebrand is decoupled and provisional; docs-site work is committed; not a cohort — two
  standalone WUs)
- `**Origin:**` backfill on in-flight meta files (default `[Internal]`; external URLs migrate from prior `**Spec:**`
  field when applicable)
- `**State:**` value recodification per mapping table
- `**Owner:**` backfill from `arc.identity`
- `**Depends On:** [none]` initialization (existing dep relationships extracted manually)
- `**Cohort:** [none]` initialization (or cohort name for known sibling sets)
- Instance-file preamble strip per R59 — existing SESSION-NOTES, USER-INBOX (post-rename) lose "About this file" /
  Lifecycle / Portability / Writing-guide blocks; meta-file convention applies
- `user/{identity}/` restructure per R65 — in-flight WUs' personal workspace relocates to the per-WU subdir + cross-WU
  flat root layout: `user/{identity}/SESSION-NOTES.md` → `user/{identity}/<wu-name>/SESSION-NOTES.md`;
  `user/{identity}/active/status-<wu-name>.md` (contributor-role, when present) →
  `user/{identity}/<wu-name>/meta-<wu-name>.md` (composes with status-\* → meta-\* token rename); `user/{identity}/active/`
  retires; `## Persistent Context` section extracts from SESSION-NOTES into new `user/{identity}/WORKING-MEMORY.md` at
  root (entries preserved with their `_Remove when:_` triggers)
- Extension renames per R56 — `pre-execution-graduation` → `pre-activation` (file shipping under new name; no migration
  needed since file doesn't exist yet); `pre-stage-review` → `pre-commit-review` (rename existing file in both copies);
  current `pre-merge-review` → `pre-pr-review` (rename existing file in both copies); new `pre-push-review.md` and
  `pre-merge-review.md` files created
- Meta-file shape migration per R58 — in-flight `meta-*.md` files restructure to `# Metadata:` H1 + blank-line-grouped
  field blocks; existing `## Work Unit Metadata` H2 wrapper retires
- Retired-field migration per R58 — in-flight meta files: `**Branch(es):**` plural → `**Branch:**` singular (drop plural
  form); `**Base Branch:**` field removed entirely; `**Sibling Work Unit(s):**` removed (cohort field carries authority
  per R13); `**Integration:**` field absorbed into State (per R9 4-state enum)
- Cross-file header shape migration per R58a — in-flight non-meta WU artifacts adopt chain-model headers: `tasks-*`
  rename `**PRD:**` → `**Spec:**`, drop `**Branch(es):**` / `**Base Branch:**` / `**Purpose:**`; `plan-*` adopt
  `**Origin:**` header field, retain `**Purpose:**` as substantive opening; `prd-*` adopt `**Origin:**` header field,
  retain `**Purpose:**` as substantive opening; retire `prd-*`'s "Optional: pre-activation lifecycle metadata for
  backlog stubs" comment-block (meta-\* covers it now under R22a)

**R51.** Doc retirements:

- `plan-roadmap-evolution.md` (tiered-horizons direction superseded by R37-R39)
- `plan-completion-status-consolidation.md` (absorbed into WOR)
- `template-completion-doc.md` (folded into `template-meta.md`)
- `.arc/reference/PROJECT-STATUS.md` (content not carried forward logged in commit message)
- `research-commit-convention-reform.md` (retired after PRD synthesizes findings per `1_create-prd.md` Step 5)
- `research-worktree-tool-convergence.md` (retired with plan; findings already absorbed into PRDs for parallelism trio)
- `rotate-branch.md` workflow (multi-branch WU + intermediate-merge premise eliminated by single-branch-per-WU per R1,
  R2, R4)

**R52.** Cross-reference sweep across workflows, strategies, rules, briefs, and templates for references to `feature/`,
`technical/`, `[PLAN]:`, `integrate-planning-branch`, `activate-planning-branch`, `status-*.md`, `completion-*.md`,
`template-completion-doc.md`, `PROJECT-STATUS.md`, `plan-roadmap-evolution.md`,
`plan-completion-status-consolidation.md`, `docs(arc):` example usage, the renamed extensions
(`pre-execution-graduation`, `pre-stage-review`, and the old `pre-merge-review` for its pre-PR-creation semantic —
distinguish from the new `pre-merge-review` at the post-review-response fire-point), the incidental WU model substrate
(`incidental/` branch prefix, `manage-incidental-work` workflow references), and the retired meta-file fields
(`**Branch(es):**` plural form, `**Base Branch:**`, `**Sibling Work Unit(s):**`, `**Integration:**`, `**Interrupts:**`,
`**Paused At:**`, `**Paused To:**` per R58 + R49a). Update or retire — with the action differing per pattern: the
incidental patterns rewrite to current-state references (describe what `manage-incidental-work.md` currently does;
remove substrate-dependent references like `incidental/` prefix; no internal-roadmap citations in shipped content); the
retired-field patterns retire entirely or migrate to their R58 successor (`Branch(es)` → `Branch`); other patterns
retire entirely.

**R52a.** Lifecycle workflow alignment for surviving workflows + `rotate-branch.md` retirement. Beyond the activate /
integrate / archive restructure (R5, R7, R14-R17), three additional WU-lifecycle workflows need WOR-induced updates:

- **`deactivate-work-unit.md` restructure** — premise breaks under single-branch-per-WU (no separate impl branch;
  activation doesn't move artifacts under in-place rename). New case matrix codified for the in-place rename model:
  state flip Active → Planning + branch rename `<type>/<name>` → `plan/<name>` (inverse of activation), OR full WU
  deletion. Footer emits `meta-{name}.md (deactivation)` per R29a. `manage-incidental-work.md` references retain —
  rewrite to current-state language describing the workflow's interrupt-routing function; drop substrate-dependent
  references (`incidental/` prefix, pause-pointer fields) and "transitional" / "pending" framing.
- **`clean-work-unit.md` body update** — `status-{name}.md` references migrate to `meta-{name}.md`;
  `**State:** Complete` references map to `**State:** Integrating` per R9 4-state enum; retired-field references
  (`Interrupts:`, `Paused:`, `Paused To:`, `Spawned:`) removed; tasks-\* "standard structure" header list reshapes per
  R58a chain model (header is `**Spec:**` only); completion-doc creation handoff redirects to integrate-work-unit's
  Release Notes Entry + Completion Notes composition (R14, Tasks 3.4.b/3.4.c).
- **`rotate-branch.md` retirement** — premise (multi-branch WU + intermediate merge to parent branch) eliminated by
  single-branch-per-WU per R1, R2, R4. Workflow file `git rm`-ed in both copies; inbound references swept and
  retired/redirected per R52. Listed in R51's retirement set.

`verify-work-unit.md` requires only the `status-` → `meta-` filename-token update — folds into R50's in-flight file
migration sweep, no dedicated workflow restructure needed.

**R53.** Inline-folds on touched workflows (per plan's `[!NOTE]` block — fold inline at the touch, not as separate
sweeps):

- Commit/push class-tag routing audit on touched fire-sites
- Workflow-interlock marker audit
- `arc sync` / `arc release push` auto-set-upstream behavior change (substantive code change riding the workflow trim —
  `pushability` matrix `blocked-no-upstream` cell resolves to `upstream-init` when `pushInterlock` permits)
- `integrate-work-unit` post-PR-create handoff guidance refresh (skip-threshold-aware language)
- Lifecycle Next Action pointer contract preservation in `session-init.md` / `session-handoff.md` (preserve ARC
  lifecycle workflow prefix; project-specific detail routes to SESSION-NOTES)

The broader sweeps across untouched workflows stay with their respective inbox entries' future WUs.

### Companion ADR (P0)

**R54.** Constitutional shift documented as ADR (parallel scale to ADR-016). Records:

- Single-branch-per-WU model decision
- Conventional Branch alignment + planning-PR retirement
- Meta-file rename + field codification
- Commit-convention reform + CB-CC alignment rationale

Stored in `.arc/reference/adr/` (next available ADR number).

### TECHNICAL-OVERVIEW WU-lifecycle wiring (P0)

**R60.** TECHNICAL-OVERVIEW receives the same WU-lifecycle wiring treatment as PROJECT-PRD (R33-R36) to address the
same drift problem (created at `define-project`, never re-touched). Three components:

- **Template shape evolution:** `TECHNICAL-OVERVIEW.template.md` (package source) — existing architecture / components /
  critical-path sections retained; new section added carrying update-trigger discipline (organic: PR-time clarification
  when conflict surfaces; event-driven: tech-stack changes, major refactors, dependency upgrades, infra shifts; not
  cadence-driven). Per R63 (one-shot template uniqueness), evolution happens in-place in the package source `.template`
  file; no parallel `reference/templates/template-technical-overview.md` is created.

- **Ceremony fire-points** (hybrid placement; mirrors R34's pattern for PROJECT-PRD):
    - `1_create-prd.md` — conditional alignment-check step sibling to the PROJECT-PRD check: fires only when PRD touches
      technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Halt-and-ask conditions:
      drift detected (PRD introduces tech not in TECHNICAL-OVERVIEW); TECHNICAL-OVERVIEW edited since PRD approved.
    - `activate-work-unit.md` — sub-bullet within existing review step (conditional supplementary check; fires only when
      TECHNICAL-OVERVIEW edited since PRD approved AND PRD touches technical surfaces).
    - `integrate-work-unit.md` — sub-bullet within existing review step (final flag check; soft, rarely blocks if
      create-PRD check passed).

  Scope distinction from PROJECT-PRD checks: PROJECT-PRD fires on PRDs touching mission / principles / anti-goals;
  TECHNICAL-OVERVIEW fires on PRDs touching technical surfaces. Independent triggers — a single PRD may trigger both,
  one, or neither.

**R61.** This repo's `.arc/reference/TECHNICAL-OVERVIEW.md` content rewritten per new shape (dogfooding pass; parallel
to R35 for PROJECT-PRD). No filename rename (TECHNICAL-OVERVIEW name is already correct). Content rewrite surfaces shape
ambiguities feeding back into `TECHNICAL-OVERVIEW.template.md` v1.1 if needed.

### Reference directory restructure (P0)

**R62.** Reference directory structural reform — two changes, both Phase 6 migrations:

- **Archive promotion + rename:** `.arc/reference/archive/` → `.arc/completed/` (top-level promotion + rename). Pipeline
  visibility: `backlog/` → `active/` → `completed/` becomes evident at top-level (symmetric with existing `active/` and
  `backlog/` placement). The verb "archive" is retained for workflow / method / strategy naming — `archive-work-unit.md`
  keeps its name; "archive" continues to describe the act of moving completion records to their durable home. The
  directory rename is purely structural. Historical content under `archive/2026-q*/{category}/` moves to
  `completed/2026-q*/{category}/` (preserving R42's read-only categorical layout intact). Scaling: `completed/` is
  present iff `pm.mode: arc-in-git` — same rule that gates `backlog/` today. Non-WU historical material (deprecated
  strategies, retired methods, deleted-but-preserved docs) is not archived under `completed/` — git history is the
  archive for such material.

- **Supplemental collapse:** `reference/research/` and `reference/analysis/` collapsed under
  `reference/supplemental/{research,analysis}/`. Mental model alignment with `system/workflows/arc/supplemental/` (same
  vocabulary, same "useful but not on the critical path" framing). Nested subdirectories preserved — research (external
  corpus synthesis) and analysis (internal codebase audit) are categorically distinguishable. The `supplemental/`
  parent reframes both as non-load-bearing (deliberation artifacts that informed strategies and ADRs but aren't read at
  session-init or workflow-fire), distinct from `adr/` / `constitution/` / `strategies/` / `templates/` (load-bearing).

R41 path references update from `archive/<dated>/{wu-name}/` to `completed/<dated>/{wu-name}/`. R42 path references
update from `archive/2026-q*/{category}/` to `completed/2026-q*/{category}/`. Inbound-reference sweep across workflows,
strategies, briefs, hooks, CLI code, backlog plans, and templates handled within Phase 6's directory-promotion phases
(new subtasks 6.9.b / 6.10.d — each migration phase is self-contained: rename → sweep → verify).

### One-shot template uniqueness (P0)

**R63.** Files instantiated exactly once per project at CLI init / join time (rendered from package-source
`*.template.md` files with mustache-token replacement, driven by
`packages/arc-framework/src/lib/classification.ts`) do not get a parallel `reference/templates/template-*.md` entry. The
package-source `.template` is the canonical template; no second template surface exists for the same file class.

Codification: principle added to `strategy-file-classification.md` (placement at execution) with explicit enumeration
of files governed — META-PRD / PROJECT-PRD, TECHNICAL-OVERVIEW, PROJECT-STATUS (retiring per R40), ROADMAP,
BACKLOG-FEATURE / BACKLOG-TECHNICAL (consolidating into BACKLOG-INBOX per R50; principle carries to the successor),
AGENT-BRIEF.PROJECT, QUICK-REFERENCE. The current `classification.ts` render list is the canonical source of governed
files.

Distinction from agent-facing templates in `reference/templates/template-*.md`: those are for content created
_repeatedly during work_ by agents / workflows (PRDs, plans, tasks, meta files, completion docs, ADRs, etc.).
Bracket-placeholder convention. The two surfaces address different needs and should not duplicate. Optional
optional starter templates (e.g., `template-dev-rules.md`, `template-contributing.md`) are a third category —
present in `reference/templates/` but not in the CLI render list, copied or referenced by projects as starting points
for optional files; this principle does not apply to those.

Amends R33: `template-project-prd.md` is NOT created in `reference/templates/`. `PROJECT-PRD.template.md` (per R35
rename) is the canonical PROJECT-PRD template; shape evolution happens in-place in the `.template` file (Task 4.2
reshape).

### Mode-scaling deliberation capture (P0)

**R64.** "arc-in-git as default; other modes scale around it" thesis captured as an exploratory `plan-*` doc —
`plan-arc-in-git-as-default.md` — in `backlog/feature/` (legacy layout). Graduates to
`backlog/provisional/arc-in-git-as-default/` once Phase 6's backlog restructure (Task 6.4) completes. Header explicitly
marks exploratory state: "Not yet committed — thesis-stage, not work-stage; describes a deliberation to evaluate, not
work to execute."

Content scope (sketched; refined at Task 6.11 execution):

- **Thesis** — arc-in-git as default; modes scale rather than swap shapes
- **Rationale** — research findings on out-of-band team coordination dissolving the original concurrency objection;
  smaller WUs + ceremony-boundary updates as the actual decoupling mechanism; ARC's "scale up / down rather than swap
  shapes" framing
- **Implication inventory** — `pm.mode: external` semantics (complement vs. replacement); `pm.mode: none` semantics;
  `pm.mode: lite` interaction with the question; `strategy-planning-module` reshape implications; `plan-arc-modes`
  consume / restructure implications; `plan-arc-backend` interaction
- **Decision gate** — explicit "deciding this requires X / Y / Z first" language; implementation sections conditional
  on thesis acceptance
- **Cross-references** — `plan-arc-modes` (independent consumer if thesis lands); `plan-arc-backend` (related); WOR
  (compatible with thesis but doesn't depend on it)

Capture surface justification: `notes-*` files in `backlog/` are companions to other files (e.g.,
`notes-arcd-rebrand.md` companions `plan-arcd-rebrand.md`). The exploratory shape (deliberation with implementation
tail) is plan-\* shape — the artifact is a plan that includes a decision phase before any execution scope is committed.
Backlog placement (vs. ROADMAP-tracked) reflects the not-yet-committed state.

---

## Non-Goals

- **Worktree mechanism, shift lifecycle, branch-gone detection, inbox sync** — Worktree Foundation
- **Stub-creation workflow, park/resume workflows, lightweight planning-entry surface** — arc-plan Conductor
  (`plan-arc-plan-conductor.md`). WOR delivers the structural shape (per-WU subdir, `meta-*` always); the workflows
  that operate on the shape for new-WU stub creation, mid-planning park (Planning → backlog), and parked-WU resume
  (backlog → Planning, new worktree) ship at conductor activation. WOR's tactical patch to `init-work-unit.md` Steps
  3-4 (Phase 6.14) handles the graduate-from-backlog case for the transitional window; new-stub-creation, park, and
  resume remain manual until conductor lands.
- **Tier model, `arc start` command, ceremony scaling per tier, atomic-companion retirement** — Agile WU Lifecycle
- **`manage-incidental-work.md` workflow retirement + conceptual references in workflows / strategies / templates that
  frame incidental as a distinct WU shape** — Agile WU Lifecycle (the `incidental/` branch prefix retires here under R1;
  substrate retires implicitly per R49a; the workflow + conceptual surface retires at AWL once shift + tier replacements
  land)
- **Migration of `manage-incidental-work.md`'s pause-state semantics to shift state** — Worktree Foundation (the
  pause-pointer field-level retirement happens under WOR per R49a; the workflow's semantics migrate to shift at WF)
- **`**Worktree:**` field on meta-\*** — per-machine + structurally duplicates host-directory location. Worktree path
  resolution lives in R44's roster cascade (`git worktree list` + per-worktree meta-file resolution) and Worktree
  Foundation's `worktree.location_template` convention; not duplicated in tracked content
- **`**Tier:**` field on meta-\*** — Agile WU Lifecycle scope. R58's Identity group leaves room for AWL to add `Tier:`
  alongside `Branch:` (both characterize WU shape); WOR does not preempt AWL's tier-model design by shipping the field
  early
- **WU-level cycle-time tracking fields** (`Created:`, state-transition dates like `Activated:`, `Started Integrating:`)
  — derivable from git log on meta-\* edits; metrics surfaces aren't WOR scope. Could ship later under a tooling WU if
  cycle-time tracking warrants
- **Focus-role model, concurrent-work conventions** — Concurrent Work Conventions
- **External-tracker integration** — Coord Probe
- **Lite mode lifecycle** — unaffected (single-WU model has no per-worktree concerns)
- **Backend storage tier mapping** — backend WU consumes WOR as substrate
- **Auto-promotion or auto-detection of group membership** — explicit-only
- **Migration tooling for existing-WU branch rename** — in-flight WUs retain current branches through natural
  integration
- **`arc roadmap render` CLI implementation** — codified algorithm + hand-maintenance discipline ship in WOR; CLI
  deferred to downstream WU
- **`arc cohort list` (or equivalent) CLI implementation** — codified field SoT + grep one-liner ship in WOR; CLI
  deferred to downstream WU
- **`arc graduate <type>` CLI helper for branch rename ergonomics** — documented inline commands ship in WOR; CLI
  deferred to downstream WU
- **OSS contributor path refinement** — contributor-meta creation step, fork-clone-create-WU-PR-merge ceremony,
  contributor-to-maintainer sync mechanics, contributor boundaries on package-source vs. instance-source edits.
  R65a's path convention (`user/{identity}/<wu-name>/meta-<wu-name>.md`) ships under WOR; full lifecycle is captured
  in `plan-contributor-path.md` (stub created in WOR; Phase 6 migration sweeps it into the new backlog
  structure with the rest). Revisit post-WOR once Worktree Foundation + Agile WU Lifecycle settle.
- **Public CHANGELOG aggregation tooling** — per-WU Release Notes Entry contract ships in WOR; CHANGELOG composition
  deferred to downstream npm-release WU
- **Release-tooling for `**State:**` transitions** — workflow-step discipline is MVP enforcement
- **Retroactive backfill of Release Notes Entries on historical archives** — forward-only
- **Scope-enum strict enforcement in commit-msg hook** — denylist of catch-alls (initially `arc`) ships; explicit
  allowlist of valid scopes deferred (evolution favored over fixed enumeration)
- **Agent vs human commit attribution via trailers** — captured as forward-pointer from research; not WOR scope
- **Method-naming reshape** (`diff-review` → `self-review`, new `peer-review` + `review-response` methods,
  override-mechanic extension to workflow-pointer variant) — `plan-review-method-family` scope. WOR locks extension
  fire-point naming convention; method-side naming + content continues in that plan
- **`review-response` extension `.actions` content + workflow-pointer override variant** — the middle of the 3-extension
  family at `integrate-work-unit.md` (bookended by WOR's `pre-pr-review` and `pre-merge-review`); ships in
  `plan-review-method-family`

---

## Technical Considerations

### Workflow class-tag routing on branch rename

The `plan/<name>` → `<type>/<name>` rename in `activate-work-unit.md` decomposes into three steps with different
routing:

- **Step 1** — `git branch -m plan/<name> <type>/<name>`. Always raw (no wrapper for local-only rename; no interlock
  applies, no audit-relevant event).
- **Step 2** — `git push -u origin <type>/<name>`. Class-tagged `workflowPush`; routes via `arc release push` when
  `arc.releaseOptedIn: true` AND `arc.pushInterlock: on-workflow`; raw `git` otherwise.
- **Step 3** — `git push origin --delete plan/<name>`. Always raw (wrapper refuses destructive flags `--delete`,
  `--force`, `--force-with-lease` by design per DEV-RULES.ARC § Commit Discipline).

Workflow body uses class-tag syntax for step 2, raw `git` for steps 1 and 3. Pre-condition check at top of
`activate-work-unit.md` verifies running on `plan/<name>` before step 1.

### Integration PR multi-commit shape

Under `archive.cadence: with-integration`:

1. Code commits (task-level work, accumulated through execution)
2. Completion-content commit (Release Notes Entry + Completion Notes composed into meta file's archive-phase sections)
3. Sweep commits (meta file moves from `active/` to `archive/<dated>/{wu-name}/`)

Reviewers focus per-commit. Single PR; multi-commit structure preserves reviewability.

### Cohort field as source of truth

`**Cohort:**` field on the meta file is canonical; sibling membership is a derived view. Discovery:

- During planning (members in `backlog/{state}/<cohort>/`): `ls` on the cohort wrapper dir
- During execution (`active/` is flat): `grep -l "^\*\*Cohort:\*\* <name>" .arc/active/**/meta-*.md`
- Across archive: `grep` extends to archive dirs

Aggregation CLI deferred. Interim grep one-liner documented in `strategy-work-organization.md`.

### Hook regex updates

`system/githooks/commit-msg` updates:

- Type-enum regex tightens to 8 types: `^(feat|fix|chore|docs|refactor|test|perf|revert)\([a-z][a-z0-9-]*\): .+`
- Scope denylist refuses `arc`: post-match check on captured scope rejects when matches `^arc$`
- Other denylist members added organically as catch-all patterns surface in PR review

The bash hook with `arc_config_get` pattern is preserved (no migration to commitlint). Hook continues to enforce subject
length, body line limits, Context: footer per existing rules.

### Forward-only migration discipline

All WOR-introduced changes apply forward-only — symmetric with existing § Design Decisions "Migration is forward-only"
in plan. Historical archive read-only; in-flight WUs migrate mechanically (rename + field backfill + State
recodification) without retroactive content rewriting. Mixed-format archive during transition is accepted.

### Inline-folds scope discipline

Five items from plan's `[!NOTE]` block ride Phase 3 (boundary workflow restructure) when the affected workflows are
touched. These are not separate scope items — they fold inline at the touch (per R53). The broader sweeps across
untouched workflows stay with their respective inbox entries' future WUs.

### Extension fire-point family wiring locations

Per R56, five extensions span the WU lifecycle. Wiring locations:

- `pre-activation` — `activate-work-unit.md` step 1 pre-condition gate (after gate passes, before state-flip + branch
  rename). Single-fire per WU.
- `pre-commit-review` — `arc-commit` skill (canonical commit pathway; fires per commit when active) AND
  `prepare-commits.md` workflow (complex-commit pathway). Wiring at both is what makes the every-commit naming honest;
  arc-commit alone misses prepare-commits's distinct invocation.
- `pre-pr-review` — `integrate-work-unit.md` pre-PR-creation push step. Single-fire per WU.
- `pre-push-review` — push wrapper / `arc release push` / `arc sync` push pathway. Reserved fire-point; no default
  `.actions` ships. When workflows push via the wrapper, the fire is inherited; raw `git push` invocations bypass.
- `pre-merge-review` — `integrate-work-unit.md` post-review-response, pre-merge step. The fire-point sits between
  `review-response` (plan-review-method-family scope) and the actual merge button. Single-fire per WU.

The `arc-commit` wiring change is a substantive functional extension — the existing `pre-stage-review` extension only
fires from `prepare-commits.md`, leaving the canonical commit pathway uncovered. Under the new convention, name and
behavior align.

### Meta-file shape restructure + session-init partial-read retirement

Per R58:

- H1 `# Metadata: {wu-name}` replaces `# Status: {wu-name}`
- Internal `## Work Unit Metadata` H2 wrapper retires; fields live directly under H1 in
  blank-line-separated blocks (identity / reference / coordination / task pointers / directive)
- Content H2s (`## Release Notes Entry`, `## Completion Notes`) added at Active → Integrating transition
- `session-init.md` workflow's `^## Work Unit Metadata` partial-read anchor retires; meta file becomes a full-read
  target. Cost is 8 additional concise fields per read; benefit is regex-anchor maintenance retired and archive-phase
  content gated by H2 boundary

If named-section anchors become important later for cross-WU referencing, groups can be promoted to H2 then —
reversible.

### Instance-file shape approach

Per R59:

- Files affected: SESSION-NOTES, WORKING-MEMORY, USER-INBOX, BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md`
- Files NOT affected: `meta-*.md` (already convention-aligned), `tasks-*.md` / `atomic-*.md` / `notes-*.md` /
  `plan-*.md` / `prd-*.md` (template-authored; carry header conventions)
- Approach: replace bloated preamble (current ATOMIC-INBOX style — 15-25 lines of duplicated orientation) with a
  minimal 1-3 line anchoring pointer in a `>` blockquote, per the per-file sizing in R59. Pointer references strategy
  sections; does not duplicate them.
- Authoritative orientation lives in `strategy-session-operations.md` (SESSION-NOTES, WORKING-MEMORY) and
  `strategy-planning-module.md` (inboxes); workflows carry write discipline at the operational level.
- Seeding mechanism diverges by file class (per R59 § Seeding mechanism):
    - **Per-user files** seeded via `templates/user/*.md` + verbatim copy by `lib/setup.ts` / `commands/user/add.ts`
      (init/join) and `arc user open` (per WU activation; see R65c). New templates added: `WORKING-MEMORY.md`,
      `USER-INBOX.md`. Existing `SESSION-NOTES.md` updated to new pointer shape. Existing `ATOMIC-INBOX.md` template
      retires (content migrates into USER-INBOX `## Atomic` section per R50).
    - **Project-shared backlog files** seeded via `arc/backlog/*.template.md` + recipe-driven copy. New templates
      added: `arc/backlog/ATOMIC-INBOX.template.md`, `arc/backlog/BACKLOG-INBOX.template.md`. Existing
      `BACKLOG-FEATURE.template.md` / `BACKLOG-TECHNICAL.template.md` retire (content migrates into BACKLOG-INBOX
      per R50).
- Workflow seeding strings (e.g., session-handoff's SESSION-NOTES seed body) audited and aligned with the new shape.

### Dependencies and sequencing

**Upstream:**

- **Interlock Release Wrappers WU1 + WU2** — closes session-operations friction; cleaner sequencing for branch-rename
  ergonomics
- **Session-Operational Flow § Phase 7 metadata-state foundation** — already shipped per ROADMAP

**Downstream:**

- **Worktree Foundation** — consumes per-worktree isolation as precondition; scope items 4 (branch-gone detection) and 8
  (main-on-main pattern) compose on top of single-branch-per-WU. WF enforces R11's hard-block on unresolved Depends On
  at activation. **Scope item 7 (pause-pointer reconciliation) shrinks under WOR's R49a:** the four pointer fields
  retire at WOR (via R8-R14 + R58's positive enumeration); WF's residual scope is migrating
  `manage-incidental-work.md`'s pause-state semantics to shift state
- **Agile WU Lifecycle** — consumes consolidated boundary workflows + sweep-as-you-go foundation; AWL scope item 7a
  shrinks to tier-aware adaptations only. **Scope item 9 (incidental concept retirement) composes with WOR's R49a:** the
  substrate retires at WOR; AWL retires `manage-incidental-work.md` workflow + the remaining conceptual references in
  strategies/templates/workflows once shift + tier replacements are in place
- **Concurrent Work Conventions** — consumes new branch conventions + per-worktree isolation; async-merge accommodation
  layered atop WOR's sync-merge primary flow
- **ARCd Rebrand** — consumes stable branch-and-lifecycle terminology before rename pass
- **ARC Operating Modes** — consumes new conventions; Lite mode unaffected

**Recommended sequencing:** Interlock Release Wrappers WU1 → WU2 → **Work Organization Reform** → parallelism trio
(Worktree Foundation ‖ Coord Probe → Agile WU Lifecycle → Concurrent Work Conventions).

### CLI tooling capture (downstream — must not be lost)

Captured here so PRD-time visibility prevents downstream loss:

- **`arc roadmap render` CLI** — sequencing target settled at task-generation time among WF, AWL, CWC, or dedicated
  tooling WU
- **`arc cohort list` (or equivalent) CLI** — same sequencing options as above
- **`arc graduate <type>` CLI** for branch-rename ergonomics — same sequencing options
- **Release Notes Entry validation hook** — optional CLI check (e.g., `arc state set integrating` validates section
  presence on meta file). Workflow-step discipline is MVP; hardens later
- **Public CHANGELOG aggregation** — for this repo's npm release engineering, scoped in downstream npm-release WU

### Phase shape (collapsed; informs task generation)

WOR ships as 7 phases:

1. **Constitutional foundation** — ADR + `DEV-RULES.ARC` (R1, R23-R24, R28, R49, R54)
2. **Strategy + convention codification + method/hook propagation** — strategy doc edits across work-organization
   (branching, isolation, archival, ROADMAP, chain-model headers, incidental retirement, spec-flow), planning-module
   (capture pipeline), configurability-architecture (extension naming + inventory), file-classification +
   task-list-formatting alignments, and session-ops / planning-module orientation absorption; plus `commit-format`
   `docs` discipline and `commit-context-format` → `commit-footer` rename per R27 + R29a (the method + hook propagation
   block hoists into Phase 2 because its execution must precede Phase 3 lifecycle workflow restructures which emit the
   new parenthetical patterns). Covers R15, R19-R22, R24, R27, R29a, R37-R39, R48, R55-R57, R58a, R59a.
3. **Boundary workflow restructure + ceremony fire-points** — workflow files + extension family wiring (R4-R7, R16-R18,
   R20-R21, R31, R34, R39, R47, R52a, R53 inline-folds, R56-R57 extension files and wiring, `arc-commit` skill wiring
   for `pre-commit-review`)
4. **Template evolution + PROJECT-PRD content rewrite** — templates + PROJECT-PRD content (R8-R14, R22, R30, R33-R36,
   R58 meta-file shape, R22c template-plan reframe, R35 file rename)
5. **Roster cascade + push wrapper wiring + CLI seeding update + CLI propagation** — TypeScript code (R44-R45, R56 push
   wrapper for `pre-push-review`, R59 CLI init/join preamble strip, plus CLI propagation for State value-set, filename
   prefix, flat `active/`, branch-pattern fallback, `classification.ts` hardcoded PROJECT-PRD reference)
6. **Migration & cross-reference sweep** — mechanical renames, retirements, doc cascade (R25-R26, R29, R40-R43, R49-R52,
   R59 instance-file slimming, hook regex, extension renames, PROJECT-PRD reference sweep)
7. **Verification** — `verify-work-unit.md` pointer + Tier-3 gates + per-worktree isolation acceptance test

Phase 1 gates everything else. Phase 2 depends on Phase 1 and additionally must complete its method/hook propagation
block before Phase 3 begins (the parenthetical patterns Phase 3 emits require the updated hook regex + method body).
Phase 3 depends on Phase 2. Phase 4 depends on Phase 3 (PROJECT-PRD ceremony fire-points + consolidated workflow shape
settled before templates encode them). Phase 5 depends on Phase 4's meta-file shape codification. Phase 6 consolidates
remaining migrations after Phases 1-5 land. Phase 7 closes.

---

## Success Criteria

### Structural invariants

1. **main carries no in-flight WU artifacts.** After WOR ships, `.arc/active/` on main is empty (or contains only
   inventory placeholder files like `README.md` if present); `.arc/backlog/` holds only pre-branch incubation;
   `.arc/completed/` (promoted from `reference/archive/` per R62) accumulates completed WUs.
2. **Per-worktree isolation acceptance test:** worktree branched from main contains only its own WU's `meta-*.md` file
   in `active/`. Verified by spawning a test worktree and asserting `active/` contents.
3. **No `[PLAN]:` PR pattern.** New WUs ship a single PR at integration; no separate planning PR.

### Artifact shape

4. **All in-flight WU meta files use new shape.** `# Metadata: {name}` H1 + blank-line-grouped field blocks;
   `**State:**` value-set codified; Owner, Depends On, Origin, Cohort fields present; no internal
   `## Work Unit Metadata` H2 wrapper.
5. **Completion-doc consolidation complete.** `template-completion-doc.md` deleted; new archives use meta-file
   archive-phase sections (`## Release Notes Entry` + `## Completion Notes` H2s added at Active → Integrating
   transition).
6. **PROJECT-STATUS.md retired.** File deleted; function distributed across PROJECT-PRD + Release Notes Entries +
   directory queries.
7. **PROJECT-PRD content reflects new shape.** Mission + numbered principles + anti-goals + problem + design tradeoffs.
8. **ROADMAP.md regenerates deterministically from meta-file state per algorithm.** Header carries generated-by marker +
   last-rendered commit hash.
9. **Instance files carry no preamble.** SESSION-NOTES, USER-INBOX, BACKLOG-INBOX, `backlog/ATOMIC-INBOX.md` read as
   content-only; orientation lives in strategy docs + workflows. CLI init/join strips preamble injection when seeding.

### Convention enforcement

10. **`system/githooks/commit-msg` enforces tuned type set.** Hook refuses commits with types outside
    `feat | fix | chore | docs | refactor | test | perf | revert`.
11. **Hook refuses `arc` as scope.** Verified by attempt + rejection.
12. **CB-CC alignment documented** in `strategy-work-organization.md` § branching with the cognitive-load rationale +
    intentional divergence on `test`, `revert`.

### Extension family

13. **Five-extension fire-point family ships** with honest fire-point names per the codified convention —
    `pre-activation`, `pre-commit-review`, `pre-pr-review`, `pre-push-review`, `pre-merge-review`. Naming convention
    documented in `strategy-configurability-architecture.md`.
14. **`pre-commit-review` wired into both `arc-commit` skill and `prepare-commits.md` workflow** — every-commit-fires
    naming honored by every-commit-pathway wiring.
15. **`pre-push-review` wired into push wrapper** — fires on any push routed through `arc release push` / `arc sync`
    pathway.
16. **New `pre-merge-review` wired into `integrate-work-unit.md`** at the post-review-response
    fire-point — sits between `review-response` (plan-review-method-family scope) and the merge action.
17. **Extension descriptions/contracts pass** — every touched extension file's description, contract block, and "Use
    for" framing audited and aligned with the WOR family conventions.

### Reference integrity

18. **No broken cross-references** after migration sweep. Grep across workflows, strategies, rules, briefs, and
    templates for retired references returns no orphans.
19. **Markdown lint passes** across the documentation surface (existing `npm run -s lint:md` policy).

### Code surface

20. **Roster cascade function ships** in `packages/arc-framework/src/lib/git/` with Vitest unit + integration test
    coverage. Function returns documented tuple shape; consumer wiring left to WF.
21. **CLI init/join strips instance-file preamble injection** — package source updated; seeded files in this repo
    migrated; lint passes.
22. **Build + typecheck + test passes.** `npm run build`, `npm run typecheck`, `npm test` all green.

### ADR

23. **Companion ADR landed** in `.arc/reference/adr/`. Records constitutional shift; parallel scale to ADR-016.

### Footer convention + lifecycle alignment

24. **`commit-context-format` method renamed to `commit-footer`.** File renamed in both copies; all references updated
    (hook comment, prepare-commits frontmatter, arc-commit skill, DEV-RULES.ARC reference link, methods/README); config
    key `commit.context_footer` retained.

25. **Hook regex accepts the new parenthetical matrix per R29a.** Smoke tests cover positive cases (one per matrix cell)
    and negative cases (known-invalid patterns: `status-` prefix; `(content)`; `(maintenance)` on `plan-*`;
    `(planning)` on `meta-*`; etc.). Method documentation aligns with hook regex (no drift).

26. **Cohort field default value is `[none]`** — not `[standalone]`. CLI tuple resolution (R44) treats `[none]` as
    undefined cohort.

27. **Lifecycle workflow alignment complete.** `deactivate-work-unit.md` restructured for single-branch model with new
    case matrix; `clean-work-unit.md` updated for 4-state enum + meta-\* file shape + redirected completion handoff;
    `rotate-branch.md` retired (R51).

### Spec-flow + planning-module + backlog migration

28. **§ Spec-Flow Invariants section landed** in `strategy-work-organization.md` — codifies the three invariants
    (`meta-*` always exists; task list structure invariant; parseable spec exists in some form before tasks) and the two
    scaling axes (mode + tier); spec-flow optionality contract explicitly deferred to arc-plan Conductor + AWL per R22b.

29. **`template-plan.md` framing clarified** per R22c — "optional" hedge in the preamble removed (deletion-at-PRD-
    creation behavior preserved); framing describes `plan-*` as the pre-PRD synthesis artifact deleted at PRD creation
    with optional `notes-*.md` graduation of substantive persisting content; chain-model header per R58a
    (`**Origin:**` + `**Purpose:**`).

30. **Backlog migration complete** — `backlog/feature/` and `backlog/technical/` retired; per-WU subdirs under
    `backlog/{planned,provisional}/<wu-name>/` carry meta + plan + companions; backlog root contains exactly `planned/`,
    `provisional/`, `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`.

31. **Backlog-stage PRDs demoted** — `prd-arcd-rebrand.md` and `prd-arcd-docs-site.md` renamed to `plan-*`; content
    reshaped from PRD commitment-language to plan-doc framing; the docs-site WU additionally renamed `arcd-docs-site` →
    `docs-site-refresh`; routing per commitment (rebrand → provisional; docs-site-refresh → planned).

### PROJECT-PRD rename + orientation absorption

32. **`META-PRD` → `PROJECT-PRD` rename complete per R35.** File renamed in both copies (`.arc/reference/META-PRD.md` →
    `.arc/reference/PROJECT-PRD.md`; package source template `META-PRD.template.md` → `PROJECT-PRD.template.md`);
    content rewritten per the new template shape; CLI `classification.ts` hardcoded reference updated; cross-reference
    sweep clean.

33. **Orientation-content precondition satisfied per R59a.** `strategy-session-operations.md` and
    `strategy-planning-module.md` carry the SESSION-NOTES / inbox-family orientation content (purpose, lifecycle,
    portability, write-discipline) before instance-file preambles are stripped. Zero net orientation loss across the R59
    transition.

### Folded-in scope amendments

34. **TECHNICAL-OVERVIEW content reflects new shape per R61.** Existing architecture / components / critical-path
    sections preserved or refreshed for accuracy; new update-trigger discipline section added. Dogfooding pass parallel
    to #7 for PROJECT-PRD.

35. **TECHNICAL-OVERVIEW ceremony fire-points wired per R60.** `1_create-prd.md` carries the alignment check when PRDs
    touch technical surfaces; `activate-work-unit.md` and `integrate-work-unit.md` carry the supplementary checks
    (sub-bullets within existing review steps; mirrors R34's pattern for PROJECT-PRD).

36. **Reference directory restructure complete per R62.** `.arc/completed/` present (promoted from `reference/archive/`
    with historical `2026-q*/{category}/` content moved intact); `.arc/reference/supplemental/{research,analysis}/`
    present (collapsed from `reference/research/` and `reference/analysis/` siblings); inbound-reference sweep clean
    (no references to old paths in active surfaces).

37. **One-shot template uniqueness principle codified per R63.** `strategy-file-classification.md` carries the principle
    and enumerates the governed files; no `reference/templates/template-project-prd.md` or
    `reference/templates/template-technical-overview.md` is created (shapes land in their respective `.template` files
    in package source).

38. **`plan-arc-in-git-as-default.md` created per R64.** Exploratory plan-\* doc in `backlog/feature/` (legacy layout;
    graduates to `backlog/provisional/<wu-name>/` once Task 6.4 completes); header explicitly marks exploratory state;
    Thesis + Rationale + Implication Inventory + Decision Gate + Cross-References sections present.

---

## Open Questions

### Resolve during work

- **Final exact prose for `[!NOTE]` redirect on `activate-work-unit.md`** — drafted at task generation. Conveys: "If the
  WU doesn't exist yet (no `plan/<name>` branch, no `meta-{name}.md` in `active/`), start with `init-work-unit.md`
  instead."
- **Roster cascade module name** — `worktree-roster.ts` vs `wu-roster.ts` settled at task generation.
- **Migration commit shape** — atomic-per-op default per existing ARC atomic-commit discipline; task generation
  specifies per-op grouping.
- **`docs` discipline placement** — `commit-format.md` is the leading candidate (all three candidate docs load each
  commit; only one needs to carry it). Final placement at task generation.
- **PROJECT-PRD content draft iteration** — initial draft surfaces shape ambiguities; v1.1 template revisions ride the
  same Phase 4 work.
- **Hook denylist expansion beyond `arc`** — surfaced during PR review or initial implementation; tracked as Phase 6
  detail.
- **Atomic-tier worktree handling under single-branch-per-WU** — main-worktree-as-launchpad lean per plan; final
  decision at WF/AWL PRD time (downstream).
- **`pm.layer` value-set update** — `arc-pm | external | none` → `arc-pm | none` resolution lands in
  `plan-arc-modes.md`, not WOR direct scope.

### Resolve during PRD review or before task generation

None — all substantive decisions locked during discovery.

---

## External Research

- `research-commit-convention-reform.md` (2026-05-13) — empirical audit of CC type and scope usage in 2024-2026
  agentic/framework/methodology repos. Findings synthesized into R25-R29 + § Technical Considerations § Hook regex
  updates. File retires alongside `plan-work-organization-reform.md` per `1_create-prd.md` Step 5.
- `research-worktree-tool-convergence.md` (2026-05-12) — worktree-trio dev-ergonomics pressure test resolution. Already
  absorbed into the parallelism-trio WU plan-docs.

Prior research already absorbed into plan-doc and carried into PRD:

- Conventional Branch spec + 2024+ adoption survey — closed core-6 type-set decision
- Roadmap / PROJECT-STATUS / PROJECT-PRD pattern survey (KEPs, Rust Project Goals, etc.) — informed R33-R39

---

## Activation Audit

When this WU activates, audit PRD content against current framework state for drift:

- **Existing in-flight WUs:** verify no WUs mid-flight that would conflict with the migration pass. Recommended
  sequencing puts WOR after Interlock Release Wrappers WU2 ships, when no other parallelism-trio WUs are active.
- **`backlog/feature/` and `backlog/technical/` contents:** inventory at activation; decide group-dir treatment per
  cluster (parallelism trio is one obvious group; interlock-release-wrappers cluster is another; `notes-*.md` files are
  typically standalone).
- **Leaked status files:** scan main's `active/{cat}/status-*.md` for any Planning-state files that escaped the new
  model. Migration pass cleans them up.
- **Cross-references in active workflow / strategy docs:** grep `feature/`, `technical/`, `[PLAN]:`,
  `integrate-planning-branch`, `activate-planning-branch` to enumerate touch surface.
- **PROJECT-STATUS.md content audit:** grep `.arc/reference/PROJECT-STATUS.md` for content not decomposed by R40's
  mapping. Anything not covered surfaces as scope-gap.
- **PROJECT-PRD content survey:** read existing `.arc/reference/PROJECT-PRD.md` before content rewrite. Preserve any
  content that the new shape genuinely subsumes; surface anything that doesn't fit as scope question.
- **Cross-references to retired artifacts:** grep `PROJECT-STATUS.md`, `plan-roadmap-evolution`,
  `plan-completion-status-consolidation`, `template-completion-doc`, `completion-*.md` for reference surface that needs
  update or retirement.
- **CLI tooling capture verification:** confirm § CLI tooling capture (downstream — must not be lost) entries are
  captured in target downstream WU plan-docs.
- **Commit-convention current state:** verify 7-of-13-unused empirical state still holds (or has shifted); re-run the
  audit if WOR activates more than a few weeks after PRD landing.
