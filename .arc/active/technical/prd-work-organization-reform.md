# PRD: Work Organization Reform

**Purpose:** Rebuild ARC's WU lifecycle foundation around a single-branch-per-WU model with
sweep-as-you-go integration, Conventional Branch alignment, meta-file location-by-state, codified field
semantics, and aligned commit conventions — delivering per-worktree isolation as the precondition for the
parallelism trio (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions).

---

## Introduction

ARC's current WU lifecycle has three composing structural issues, plus a commit-convention bloat that
surfaces in the same constitutional surface area.

### The structural issues

**Per-worktree isolation is impossible under the current model.** `integrate-planning-branch.md` Step 2
graduates plan-doc artifacts onto main with the status file in `State: Planning`; `activate-work-unit.md`
transitions the status file on the WU branch only. Main retains stale Planning-state status files through
WU integration. Any worktree branched from main inherits those leaks. With three WUs in flight (typical
under the parallelism trio), every new worktree starts with three other WUs' status files in `active/` —
not just visual clutter but actively misleading state.

**Branch-prefix categories contradict PR types in practice.** `feature/{name}` and `technical/{name}` were
intended as a coarse user-visible-vs-internal signal distinct from per-commit Conventional Commits types. In
practice, `technical/` branches integrate as `feat:` PRs and vice versa; WUs cross the partition often
enough that the categorization isn't honest. Branch names are also longer than they need to be.

**Separate planning-branch PR adds ceremony without proportional value.** Two PRs per WU costs a review
cycle plus branch-rotation friction at activation. Substantive planning review, when adopters want it, is
delivered better by an opt-in configurable checkpoint than by a second merge-able PR.

### The commit-convention bloat

Empirical audit (last 200 commits) shows 7 of 13 supported CC types unused (`style`, `content`, `perf`,
`build`, `ci`, `config`, `revert`) and the `arc` scope used as a catch-all in ~29% of commits — describing
~90% of the repo and signaling no intent. External research (2024-2026, captured in
`research-commit-convention-reform.md`) confirms convergence on a core-6 type set in current practice;
CC-CB alignment requires explicit handling.

### Why now

Worktree Foundation (downstream WU; recommended sequencing) needs per-worktree isolation as a structural
precondition. Without WOR, WF builds on a leaking lifecycle model. Three other downstream WUs in the
parallelism track (Agile WU Lifecycle, Concurrent Work Conventions, ARCd Rebrand) consume conventions WOR
codifies. The commit-convention surface is best touched in the same constitutional moment as the branch
conventions — CB and CC alignment together avoids two waves of DEV-RULES.ARC + method-doc + hook churn.

---

## Goals

1. **Single-branch-per-WU lifecycle.** One WU = one branch from planning through integration; merges to
   main exactly once at integration.
2. **Conventional Branch alignment.** Retire `feature/` and `technical/` prefixes; adopt CB core-6
   (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `perf/`) plus `plan/<name>` for planning state.
3. **Meta-file location-by-state.** Meta file always at `active/meta-{name}.md`; the branch carries it.
   Renamed from `status-{name}.md` to reflect composite role (metadata + state pointers + archive
   sections).
4. **Sweep-as-you-go integration default.** Integration PR includes sweep commits; meta-file moves to
   archive in the same PR. `archive.cadence: deferred` available for staged-cadence adopters.
5. **Codified meta-file fields.** `**State:**` value-set, `**Owner:**` singular, `**Depends On:**` for
   dependency surfacing, `**Origin:**` orthogonal to `**Spec:**`, `**Cohort:**` for group membership.
6. **Completion-doc consolidation.** Eliminate `completion-{name}.md`; meta file carries archive-phase
   sections.
7. **Capture pipeline reform.** Four-surface model with ceremony-only writes to shared inboxes.
8. **Group-dir + state-dir conventions in backlog.** `plans/planned/` + `plans/provisional/` state-dirs;
   optional group dirs for codified cohorts.
9. **Commit-convention audit + CB-CC alignment.** Tune CC type set to 8; deprecate `arc` catch-all
   scope; codify `docs` discipline.
10. **META-PRD redesign — shape + content.** Codified template; ceremony fire-points wire it into the
    development loop; this repo's META-PRD content rewritten as dogfooding pass.
11. **ROADMAP as rendered view.** Algorithm codified; ROADMAP regenerated at ceremony fire-points from
    meta-file state; CLI deferred but hand-maintenance discipline ships.
12. **PROJECT-STATUS retirement.** Function decomposes across META-PRD, Release Notes Entries, and
    directory queries.

---

## Use Cases

System scenarios illustrating the change.

### UC1: Per-worktree isolation under the parallelism trio

**Current:** Three WUs in flight (WF, AWL, CWC). Their planning-state status files have merged to main
via the integrate-planning-branch flow. A new worktree branched from main contains three stale status
files in `active/` — actively misleading.

**Under WOR:** Each WU's meta file lives on its own branch only; main has empty `active/`. A new worktree
branched from main starts clean.

### UC2: Activation under single-branch-per-WU

**Current:** WU has `plan-foo.md` in `active/technical/` on `technical/plan-foo`; planning-branch PR
merges to main; new `technical/foo` branch created via `activate-work-unit.md`; second PR opens at
integration. Two PRs total.

**Under WOR:** WU has `meta-foo.md` and `plan-foo.md` (later `prd-foo.md`, `tasks-foo.md`) in `active/` on
`plan/foo` branch; activation renames `plan/foo` → `feat/foo` locally + remote, flips `**State:** Planning
→ Active` on the meta file, removes the plan-doc; single PR opens at integration. One PR total.

### UC3: Cohort-based parallelism trio coordination

**Current:** No formalized cohort vocabulary; sibling WU listed in status-file's `**Sibling Work
Unit(s):**` field as a name list (maintenance burden when members change).

**Under WOR:** Each cohort member's meta file declares `**Cohort:** parallelism-trio`; cohort membership
tracked in backlog via group-dir `backlog/plans/planned/parallelism-trio/`; member discovery during
planning by `ls` on the group dir, during execution by `grep` on meta files.

### UC4: Commit-convention discipline

**Current:** Commit `docs(arc): update workflow` — describes ~90% of repo; `docs` lazy (the change adds a
workflow feature but file extension is `.md`).

**Under WOR:** Commit `feat(init-wu): add workflow for WU scaffolding` — informative scope (subsystem
name); type matches intent. Hook refuses `arc` scope; `commit-format.md` guides intent-based type
selection.

### UC5: Integration with sweep-as-you-go

**Current:** Integration PR contains code + completion-doc + status flip. Sweep runs separately at
archival (next-WU planning batch). Main has Complete-state files in `active/` between integration and
archive.

**Under WOR:** Integration PR contains code commits + completion-content commits (Release Notes Entry +
Completion Notes composed into meta file's archive-phase sections) + sweep commits (meta file moves to
`archive/<dated>/{wu-name}/`). Merge transitions main from "didn't have these files" to "has them in
archive/" in one PR.

---

## Requirements

### Lifecycle and branch conventions (P0)

**R1.** WU branches follow Conventional Branch core-6: `feat/<name>`, `fix/<name>`, `chore/<name>`,
`docs/<name>`, `refactor/<name>`, `perf/<name>`. Contested types (`test/`, `style/`, `build/`, `ci/`)
treated as adopter-extension; not in ARC's canonical set.

**R2.** Planning branches use `plan/<name>` prefix; rotate to `<type>/<name>` at activation via local
rename + remote replace.

**R3.** WU artifacts (`meta-{name}.md`, `plan-{name}.md`, `prd-{name}.md`, `tasks-{name}.md`, companions)
live in `active/` on the WU branch through entire lifecycle. Main carries no in-flight WU artifacts.

**R4.** Activation is an in-place state transition + branch rename, not a new branch creation.
`**State:**` field flips `Planning → Active`; branch `plan/<name>` renames to `<type>/<name>`; plan-doc
`git rm`'d when graduated.

**R5.** Integration is the single merge-to-main moment. Sweep-as-you-go (default) bundles file moves
from `active/` to `archive/<dated>/{wu-name}/` into the integration PR as separate commits per
multi-commit-PR norms.

**R6.** `[PLAN]:` PR-prefix retired entirely. No separate planning PR exists under single-branch-per-WU.

**R7.** Boundary workflows restructured:

- `integrate-planning-branch.md` — **retired entirely**
- `activate-planning-branch.md` → renamed `init-work-unit.md` (WU + meta-file creation)
- `activate-work-unit.md` — name preserved with new semantic (state transition + branch rename, no
  directory move). Carries `[!NOTE]` block redirecting to `init-work-unit.md` for cases where the
  workflow runs against a non-existent WU
- `integrate-work-unit.md` — restructured for sweep-as-you-go + single integration PR
- `archive-work-unit.md` — Tier-1 step for Release Notes Entry + Completion Notes composition;
  collapses into `integrate-work-unit.md` under default `archive.cadence: with-integration`

### Meta-file evolution (P0)

**R8.** `template-status.md` → `template-meta.md` rename. Template carries phase-labeled sections
(life-phase fields + archive-phase sections).

**R9.** `**State:**` value-set codified: `Provisional | Planned | Active | Integrating | Shipped`.
Existing `**Integration:**` field retired (folds into State).

**R10.** `**Owner:**` field — singular per WU. Solo mode auto-populates from `arc.identity` via
template-placeholder approach (`[arc.identity]` substituted at meta-file creation). Team-mode handoff
updates the field sequentially.

**R11.** `**Depends On:**` field — bare WU-name list; renders into ROADMAP tier grouping. `**Blocks:**`
deferred (redundant under explicit Depends On).

**R12.** `**Origin:**` field with default `[Internal]`. Orthogonal to `**Spec:**` (which always points
at ARC-owned planning artifacts). External tracker references go in `Origin`, never `Spec`. `pm.layer`
value-set update (`arc-pm | external | none` → `arc-pm | none`) lands in `plan-arc-modes.md`, not WOR
direct scope; WOR ships the conceptual framing.

**R13.** `**Cohort:**` field — single name string; `[standalone]` for solo WUs. Cohort is source of
truth; sibling list derived (no `**Sibling Work Unit(s):**` field). Membership discovery via group dir
during planning, `grep` on `**Cohort:**` field during execution.

**R14.** Archive-phase sections on meta file: PR URL, Completed date, Release Notes Entry (categorized
per R26), Completion Notes (narrative). Eliminate `completion-{name}.md` as a distinct artifact.

**R15.** Per-worktree isolation invariant: each worktree's `active/` contains only its own WU's meta
file, because no other branch's meta file is reachable from main. Codified in
`strategy-work-organization.md`.

### Sweep-as-you-go (P0)

**R16.** `archive.cadence` config key in `arc-config.yml`. Values: `with-integration` (default — sweep
in integration PR), `deferred` (sweep at next-WU planning batch — current pattern), `manual` (explicit
invocation).

**R17.** Integration PR under `with-integration` includes multi-commit structure: code commits →
completion content (Release Notes Entry + Completion Notes composition into meta file) → sweep commits
(file moves from `active/` to `archive/<dated>/{wu-name}/`). Reviewers focus per-commit.

**R18.** Tier-aware sweep ceremony (atomic / quick / standard scaling) is Agile WU Lifecycle's scope;
WOR ships tier-agnostic foundation. Async-merge accommodation (handoff and cleanup behavior during
awaiting-review latency) is Concurrent Work Conventions' scope; WOR ships sync-merge primary flow.

### Capture pipeline and backlog layout (P0)

**R19.** Four-surface capture model:

- `user/{identity}/USER-INBOX.md` — per-user, gitignored, notes-synced. Replaces `ATOMIC-INBOX.md`
  at this path. Two sections (`## Atomic`, `## Backlog`) routing at drain time
- `backlog/ATOMIC-INBOX.md` — project-shared, tracked. Atomic-character entries
- `backlog/BACKLOG-INBOX.md` — project-shared, tracked. Multi-step entries (consolidates retired
  `BACKLOG-FEATURE.md` + `BACKLOG-TECHNICAL.md`)
- `backlog/plans/{state}/` — mature `plan-*` docs

**R20.** Ceremony-only write rule for shared inboxes: writes fire only at activation absorption,
integration drain, planning-kickoff promotion. Outside these moments, shared inboxes are read-only by
convention. Absorbed entries are deleted, not marked — routing record lives in deletion commit message
plus absorbing artifact.

**R21.** `backlog/plans/` interlude with state-dir split: `planned/` (committed + sequenced on ROADMAP)
and `provisional/` (drafted, not yet committed). Graduation `provisional/` → `planned/` fires when WU
added to ROADMAP (`git mv` rides the same commit as the ROADMAP entry); symmetric demotion supported.

**R22.** Group-dir convention in `backlog/plans/{state}/<cohort>/`. Optional, codified-group only.
`active/` stays flat (no cohort dirs in active; tracked via `**Cohort:**` field). Group-membership is
state-uniform (all members in same state-dir).

### Constitutional codifications (P0)

**R23.** Vocabulary distinction codified in `DEV-RULES.ARC` (or `AGENT-BRIEF.ARC.md` § Vocabulary):

- **Work unit** — the wrapper noun. Any bounded chunk of work with a branch, status, and PR.
  Invariant across tiers (atomic / quick / standard from Agile WU Lifecycle)
- **Atomic** — describes work character. Single-bounded, indivisible, no internal stages. Applies to
  items (capture-tier), tasks (companion-file scope), and WUs (atomic-tier)
- Inboxes distinguish by work character (atomic vs multi-step), not by wrapper presence/absence

**R24.** Capture-routing rule constitutionalized — moves from `DEV-RULES.PROJECT.md § Capture Routing`
to `DEV-RULES.ARC § Leave it cleaner`. Project-specific routing overrides remain in
`DEV-RULES.PROJECT.md` if needed.

### Commit conventions (P0)

**R25.** CC type set codified to 8: `feat | fix | chore | docs | refactor | test | perf | revert`.
Drops `style`, `content`, `build`, `ci`, `config` (fold to `chore` or other informative types).
`system/githooks/commit-msg` regex enforces.

**R26.** Scope governance:

- Convention: subsystem / artifact-type / WU-feature name; never the repo name
- `system/githooks/commit-msg` hook refuses `arc` as scope (uninformative catch-all)
- Scope remains optional (not all commits need a scope); when present, must be informative
- Hook denylist starts with `arc` only; expands organically as new catch-all patterns surface in
  PR review

**R27.** `docs` discipline codified in `commit-format.md` method (principle only; no examples in
methods — methods stay token-lean):

- Type chosen by intent, not file extension
- `feat` = new capability (workflow, method, strategy, template, convention codification — even when
  delivered entirely in `.md`)
- `fix` = correcting drift, stale references, or out-of-date language in methodology surface
- `refactor` = restructuring methodology surface without behavior/convention change
- `docs` = external-facing prose only (`README.md`, docs-site content, adopter onboarding)
- Rule of thumb: "What changed in system behavior or capability? Yes → `feat` / `fix` / `refactor`;
  No → `docs`"

Final placement decision (between `commit-format.md`, `commit-context-format.md`, and arc-commit
skill) at task generation time — all three load each commit; only one carries the principle.

**R28.** CB-CC alignment documented in `strategy-work-organization.md` § branching: CB-core-6 omits
`test` and `revert` deliberately (tests not branched separately; reverts produce conventional commit
shape but not branch shape). The divergence is intentional and cognitive-load-aware per CB spec
rationale.

**R29.** Forward-only migration. Historical commits keep their existing type/scope tags (git history
immutable). New conventions apply from WOR merge forward.

### Per-WU Release Notes Entry (P0)

**R30.** Every shipped WU has a Release Notes Entry section in its archived `meta-{name}.md`.
Categorized: `Added | Changed | Removed | Fixed | Infrastructure | Deprecated | Security` (full Keep
a Changelog 7-category set). One-paragraph user-facing summary plus optional Breaking Changes callout.

**R31.** Composition fire-point: integration ceremony, when `**State:**` transitions
`Active → Integrating`. Discipline enforced by `integrate-work-unit.md` workflow step (compose entry
before commit). Optional CLI validation hook (e.g., `arc state set integrating` checks section
presence) deferred to downstream tooling.

**R32.** Post-`Shipped` edits to Release Notes Entry are errata only; no mechanical lock. Git history
is the lock — matches keep-a-changelog norms.

### META-PRD redesign (P0)

**R33.** `template-meta-prd.md` codifies the shape: Mission (1-3 sentences) + numbered principles
(5-7, quotable as nouns) + anti-goals + problem statement + design tradeoffs.

**R34.** Ceremony fire-points wire META-PRD into the development loop (hybrid placement):

- `1_create-prd.md` — **explicit** `## Step N: META-PRD alignment check` with halt-and-ask
  conditions; cites a specific principle by number when passing (not just "checked, passed")
- `activate-work-unit.md` — sub-bullet within existing review step (conditional supplementary
  check; fires only when META-PRD edited since PRD approved)
- `integrate-work-unit.md` — sub-bullet within existing review step (final flag check; soft, rarely
  blocks if create-PRD check passed)

**R35.** This repo's `.arc/META-PRD.md` content rewritten per new shape (dogfooding pass). Surfaces
shape ambiguities feeding back into `template-meta-prd.md` v1.1 if needed.

**R36.** Update triggers consolidated: organic (PR-time clarification when conflict surfaces) +
event-driven (major release, scope shift, governance change). Not cadence-driven by default.

### ROADMAP as rendered view (P0)

**R37.** ROADMAP.md becomes a generated artifact rendered from `active/**` and
`backlog/plans/planned/**` meta-files. Source of truth is the meta files (`**State:**`, `**Owner:**`,
`**Depends On:**`). ROADMAP header carries "Generated by `arc roadmap render` — do not edit by hand"
note + last-rendered commit hash.

**R38.** Render algorithm codified in `strategy-work-organization.md`:

1. Walk `active/**` and `backlog/plans/planned/**` for `meta-*.md` files
2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, title fields
3. Topologically sort by `**Depends On:**`
4. Group into tiers (In Flight / Foundation / Tier 2+ / Independent Tracks)
5. Render markdown per tier
6. Footer note pointing to `provisional/`

**R39.** Regeneration fire-points (ceremony-coupled): WU graduation (`provisional/` → `planned/`); WU
activation (`planned/` → `active/`); WU integration (`active/` → archive); dep-field edit on any
planned/active meta-file. Each ceremony workflow includes a regenerate-ROADMAP step. Interim
discipline pre-CLI: hand-maintain per algorithm.

### Archive shape and PROJECT-STATUS retirement (P0)

**R40.** `.arc/reference/PROJECT-STATUS.md` deletes entirely. Function decomposes:

- Completed-work history → per-WU Release Notes Entry sections in archived meta files
- Project direction / themes → META-PRD (Mission + principles + anti-goals)
- Done-vs-left snapshot → directory query (`provisional/` + `planned/` + `active/` + archive)

No replacement artifact. Content not directly carried forward by Release Notes Entries or META-PRD
logged in the deletion commit message.

**R41.** New archive shape: `archive/<dated>/{wu-name}/` (drop `{category}/` subdir; symmetric with
backlog's group-dir collapse). Temporal grouping (`2026-q*`) retained.

**R42.** Historical archive (`archive/2026-q*/{category}/`) read-only — retains categorical layout,
`status-*` and `completion-*` filenames, uncodified field values. No retroactive migration.

**R43.** Backward-compat tooling requirement: anything reading the archive (renderer, future CLI,
search/audit) must handle both legacy shape and new shape. Contract on downstream CLI work, stated
here so future WUs honor it.

### Roster cascade (P1)

**R44.** Library function in `packages/arc-framework/src/lib/git/` (module name TBD at task generation
— `worktree-roster.ts` or `wu-roster.ts`). Returns list of `{worktreePath, branch, identity?,
metaFilePath, state, cohort?}` tuples from `git worktree list` + per-worktree meta-file resolution.
Synchronous worktree-list read; async per-worktree meta-file resolution; returns empty list when no
worktrees or no meta files surface (clean degradation).

**R45.** Vitest unit + integration tests. API surface settled at task generation time; consumer
wiring (Worktree Foundation's branch-gone detection) left to WF.

### Planning-checkpoint review opt-in (P1)

**R46.** Config setting `review.planning_checkpoint` in `arc-config.yml`. Values: `disabled` (default;
planning flows directly into execution) | `required` (workflow stops at planning → execution
graduation, awaits explicit approval).

**R47.** Extension point `pre-execution-graduation` fires at the same checkpoint. Default no-op;
teams populate `.actions` for automated review steps (CodeRabbit invocation, custom validators, lint
runs). Composition: config + extension are independent axes.

**R48.** Convention inventory entry added to `strategy-configurability-architecture.md`: "Planning
checkpoint review | P2/P4 | No checkpoint stop | Config setting + Extension." Follows
`review.pre_merge` precedent.

### Atomic-tier infra-edit smell flag (P1)

**R49.** Documentation-only smell flag in `DEV-RULES.ARC` (and strategy doc note). Atomic-tier work
shouldn't touch `.arc/system/`, `.arc/reference/strategies/`, `arc-config.yml`, or other load-bearing
infra files. Such edits warrant quick-tier at minimum (multi-commit coordination, deliberate
sequencing). Routes captured atomic surfaces (ATOMIC-INBOX) accordingly.

### Migration sweep (P0)

**R50.** One-time migration ops:

- Leaked Planning-state `status-*.md` files in `active/` on main — cleanup
- In-flight `status-*.md` → `meta-*.md` rename
- Per-user `ATOMIC-INBOX.md` → `USER-INBOX.md` rename (content moves under `## Atomic` section;
  `## Backlog` initially empty)
- `BACKLOG-FEATURE.md` + `BACKLOG-TECHNICAL.md` merge → `backlog/BACKLOG-INBOX.md`
- New empty `backlog/ATOMIC-INBOX.md`
- `backlog/feature/` + `backlog/technical/` contents flatten/classify into
  `backlog/plans/{planned,provisional}/` (per ROADMAP-inclusion test); existing sibling sets pick
  up group-dir treatment within their respective state-dir
- `**Origin:**` backfill on in-flight meta files (default `[Internal]`; external URLs migrate from
  prior `**Spec:**` field when applicable)
- `**State:**` value recodification per mapping table
- `**Owner:**` backfill from `arc.identity`
- `**Depends On:** [none]` initialization (existing dep relationships extracted manually)
- `**Cohort:** [standalone]` initialization (or cohort name for known sibling sets)

**R51.** Doc retirements:

- `plan-roadmap-evolution.md` (tiered-horizons direction superseded by R37-R39)
- `plan-completion-status-consolidation.md` (absorbed into WOR)
- `template-completion-doc.md` (folded into `template-meta.md`)
- `.arc/reference/PROJECT-STATUS.md` (content not carried forward logged in commit message)
- `research-commit-convention-reform.md` (retired after PRD synthesizes findings per
  `1_create-prd.md` Step 5)
- `research-worktree-tool-convergence.md` (retired with plan; findings already absorbed into PRDs
  for parallelism trio)

**R52.** Cross-reference sweep across workflows, strategies, rules, briefs, and templates for
references to `feature/`, `technical/`, `[PLAN]:`, `integrate-planning-branch`,
`activate-planning-branch`, `status-*.md`, `completion-*.md`, `template-completion-doc.md`,
`PROJECT-STATUS.md`, `plan-roadmap-evolution.md`, `plan-completion-status-consolidation.md`,
`docs(arc):` example usage. Update or retire.

**R53.** Inline-folds on touched workflows (per plan's `[!NOTE]` block — fold inline at the touch,
not as separate sweeps):

- Commit/push class-tag routing audit on touched fire-sites
- Workflow-interlock marker audit
- `arc sync` / `arc release push` auto-set-upstream behavior change (substantive code change riding
  the workflow trim — `pushability` matrix `blocked-no-upstream` cell resolves to `upstream-init`
  when `pushInterlock` permits)
- `integrate-work-unit` post-PR-create handoff guidance refresh (skip-threshold-aware language)
- Lifecycle Next Action pointer contract preservation in `session-init.md` / `session-handoff.md`
  (preserve ARC lifecycle workflow prefix; project-specific detail routes to SESSION-NOTES)

The broader sweeps across untouched workflows stay with their respective inbox entries' future WUs.

### Companion ADR (P0)

**R54.** Constitutional shift documented as ADR (parallel scale to ADR-016). Records:

- Single-branch-per-WU model decision
- Conventional Branch alignment + planning-PR retirement
- Meta-file rename + field codification
- Commit-convention reform + CB-CC alignment rationale

Stored in `.arc/reference/adr/` (next available ADR number).

---

## Non-Goals

- **Worktree mechanism, shift lifecycle, branch-gone detection, inbox sync** — Worktree Foundation
- **Tier model, `arc start` command, ceremony scaling per tier, atomic-companion retirement,
  incidental category retirement** — Agile WU Lifecycle
- **Focus-role model, concurrent-work conventions** — Concurrent Work Conventions
- **External-tracker integration** — Coord Probe
- **Lite mode lifecycle** — unaffected (single-WU model has no per-worktree concerns)
- **Backend storage tier mapping** — backend WU consumes WOR as substrate
- **Auto-promotion or auto-detection of group membership** — explicit-only
- **Migration tooling for existing-WU branch rename** — in-flight WUs retain current branches through
  natural integration
- **`arc roadmap render` CLI implementation** — codified algorithm + hand-maintenance discipline ship
  in WOR; CLI deferred to downstream WU
- **`arc cohort list` (or equivalent) CLI implementation** — codified field SoT + grep one-liner
  ship in WOR; CLI deferred to downstream WU
- **`arc graduate <type>` CLI helper for branch rename ergonomics** — documented inline commands
  ship in WOR; CLI deferred to downstream WU
- **Public CHANGELOG aggregation tooling** — per-WU Release Notes Entry contract ships in WOR;
  CHANGELOG composition deferred to downstream npm-release WU
- **Release-tooling for `**State:**` transitions** — workflow-step discipline is MVP enforcement
- **Retroactive backfill of Release Notes Entries on historical archives** — forward-only
- **Scope-enum strict enforcement in commit-msg hook** — denylist of catch-alls (initially `arc`)
  ships; explicit allowlist of valid scopes deferred (evolution favored over fixed enumeration)
- **Agent vs human commit attribution via trailers** — captured as forward-pointer from research;
  not WOR scope

---

## Technical Considerations

### Workflow class-tag routing on branch rename

The `plan/<name>` → `<type>/<name>` rename in `activate-work-unit.md` decomposes into three steps with
different routing:

- **Step 1** — `git branch -m plan/<name> <type>/<name>`. Always raw (no wrapper for local-only rename;
  no interlock applies, no audit-relevant event).
- **Step 2** — `git push -u origin <type>/<name>`. Class-tagged `workflowPush`; routes via
  `arc release push` when `arc.releaseOptedIn: true` AND `arc.pushInterlock: on-workflow`; raw `git`
  otherwise.
- **Step 3** — `git push origin --delete plan/<name>`. Always raw (wrapper refuses destructive flags
  `--delete`, `--force`, `--force-with-lease` by design per DEV-RULES.ARC § Commit Discipline).

Workflow body uses class-tag syntax for step 2, raw `git` for steps 1 and 3. Pre-condition check at top
of `activate-work-unit.md` verifies running on `plan/<name>` before step 1.

### Integration PR multi-commit shape

Under `archive.cadence: with-integration`:

1. Code commits (task-level work, accumulated through execution)
2. Completion-content commit (Release Notes Entry + Completion Notes composed into meta file's
   archive-phase sections)
3. Sweep commits (meta file moves from `active/` to `archive/<dated>/{wu-name}/`)

Reviewers focus per-commit. Single PR; multi-commit structure preserves reviewability.

### Cohort field as source of truth

`**Cohort:**` field on the meta file is canonical; sibling membership is a derived view. Discovery:

- During planning (members in `backlog/plans/{state}/<cohort>/`): `ls` on the group dir
- During execution (`active/` is flat): `grep -l "^\*\*Cohort:\*\* <name>" .arc/active/**/meta-*.md`
- Across archive: `grep` extends to archive dirs

Aggregation CLI deferred. Interim grep one-liner documented in `strategy-work-organization.md`.

### Hook regex updates

`system/githooks/commit-msg` updates:

- Type-enum regex tightens to 8 types:
  `^(feat|fix|chore|docs|refactor|test|perf|revert)\([a-z][a-z0-9-]*\): .+`
- Scope denylist refuses `arc`: post-match check on captured scope rejects when matches `^arc$`
- Other denylist members added organically as catch-all patterns surface in PR review

The bash hook with `arc_config_get` pattern is preserved (no migration to commitlint). Hook continues
to enforce subject length, body line limits, Context: footer per existing rules.

### Forward-only migration discipline

All WOR-introduced changes apply forward-only — symmetric with existing § Design Decisions "Migration
is forward-only" in plan. Historical archive read-only; in-flight WUs migrate mechanically (rename +
field backfill + State recodification) without retroactive content rewriting. Mixed-format archive
during transition is accepted.

### Inline-folds scope discipline

Five items from plan's `[!NOTE]` block ride Phase 3 (boundary workflow restructure) when the affected
workflows are touched. These are not separate scope items — they fold inline at the touch (per R53).
The broader sweeps across untouched workflows stay with their respective inbox entries' future WUs.

### Dependencies and sequencing

**Upstream:**

- **Interlock Release Wrappers WU1 + WU2** — closes session-operations friction; cleaner sequencing
  for branch-rename ergonomics
- **Session-Operational Flow § Phase 7 metadata-state foundation** — already shipped per ROADMAP

**Downstream:**

- **Worktree Foundation** — consumes per-worktree isolation as precondition; scope items 4
  (branch-gone detection), 7 (pause-pointer reconciliation), 8 (main-on-main pattern) compose on
  top of single-branch-per-WU. WF enforces R11's hard-block on unresolved Depends On at activation
- **Agile WU Lifecycle** — consumes consolidated boundary workflows + sweep-as-you-go foundation;
  AWL scope item 7a shrinks to tier-aware adaptations only
- **Concurrent Work Conventions** — consumes new branch conventions + per-worktree isolation;
  async-merge accommodation layered atop WOR's sync-merge primary flow
- **ARCd Rebrand** — consumes stable branch-and-lifecycle terminology before rename pass
- **ARC Operating Modes** — consumes new conventions; Lite mode unaffected

**Recommended sequencing:** Interlock Release Wrappers WU1 → WU2 → **Work Organization Reform** →
parallelism trio (Worktree Foundation ‖ Coord Probe → Agile WU Lifecycle → Concurrent Work
Conventions).

### CLI tooling capture (downstream — must not be lost)

Captured here so PRD-time visibility prevents downstream loss:

- **`arc roadmap render` CLI** — sequencing target settled at task-generation time among WF, AWL,
  CWC, or dedicated tooling WU
- **`arc cohort list` (or equivalent) CLI** — same sequencing options as above
- **`arc graduate <type>` CLI** for branch-rename ergonomics — same sequencing options
- **Release Notes Entry validation hook** — optional CLI check (e.g., `arc state set integrating`
  validates section presence on meta file). Workflow-step discipline is MVP; hardens later
- **Public CHANGELOG aggregation** — for this repo's npm release engineering, scoped in downstream
  npm-release WU

### Phase shape (collapsed; informs task generation)

WOR ships as 7 phases (per § Scope Estimate in the retired plan-doc):

1. **Constitutional foundation** — ADR + `DEV-RULES.ARC` (R1, R23-R24, R28, CB-CC alignment refs)
2. **Strategy and convention codification** — strategy doc edits (R15, R20, R28, R38, R48, all
   `strategy-*.md` references)
3. **Boundary workflow restructure + ceremony fire-points** — workflow files (R4-R7, R16-R18,
   R20-R21, R31, R34, R39, R53 inline-folds)
4. **Template evolution + META-PRD content rewrite** — templates + META-PRD content (R8-R14, R22,
   R30, R33-R36)
5. **Roster cascade implementation** — TypeScript code (R44-R45)
6. **Migration & cross-reference sweep** — mechanical renames, retirements, doc cascade (R25-R27,
   R29, R40-R43, R49-R52, hook regex)
7. **Verification** — `verify-work-unit.md` pointer + Tier-3 gates + per-worktree isolation
   acceptance test

Phase 1 gates everything else. Phase 2 depends on Phase 1; Phase 3 depends on Phase 2. Phase 4
depends on Phase 3 (META-PRD ceremony fire-points + consolidated workflow shape settled before
templates encode them). Phase 5 depends on Phase 4's meta-file shape codification. Phase 6
consolidates all migrations after Phases 1-5 land. Phase 7 closes.

---

## Success Criteria

### Structural invariants

1. **main carries no in-flight WU artifacts.** After WOR ships, `.arc/active/` on main is empty
   (or contains only inventory placeholder files like `README.md` if present); `.arc/backlog/`
   holds only pre-branch incubation; `.arc/reference/archive/` accumulates completed WUs.
2. **Per-worktree isolation acceptance test:** worktree branched from main contains only its own
   WU's `meta-*.md` file in `active/`. Verified by spawning a test worktree and asserting `active/`
   contents.
3. **No `[PLAN]:` PR pattern.** New WUs ship a single PR at integration; no separate planning PR.

### Artifact shape

4. **All in-flight WU meta files use new shape.** Template-meta with phase-labeled sections;
   `**State:**` value-set codified; Owner, Depends On, Origin, Cohort fields present.
5. **Completion-doc consolidation complete.** `template-completion-doc.md` deleted; new archives use
   meta-file archive-phase sections.
6. **PROJECT-STATUS.md retired.** File deleted; function distributed across META-PRD + Release
   Notes Entries + directory queries.
7. **META-PRD content reflects new shape.** Mission + numbered principles + anti-goals + problem +
   design tradeoffs.
8. **ROADMAP.md regenerates deterministically from meta-file state per algorithm.** Header carries
   generated-by marker + last-rendered commit hash.

### Convention enforcement

9. **`system/githooks/commit-msg` enforces tuned type set.** Hook refuses commits with types outside
   `feat | fix | chore | docs | refactor | test | perf | revert`.
10. **Hook refuses `arc` as scope.** Verified by attempt + rejection.
11. **CB-CC alignment documented** in `strategy-work-organization.md` § branching with the
    cognitive-load rationale + intentional divergence on `test`, `revert`.

### Reference integrity

12. **No broken cross-references** after migration sweep. Grep across workflows, strategies, rules,
    briefs, and templates for retired references returns no orphans.
13. **Markdown lint passes** across the documentation surface (existing `npm run -s lint:md` policy).

### Code surface

14. **Roster cascade function ships** in `packages/arc-framework/src/lib/git/` with Vitest unit +
    integration test coverage. Function returns documented tuple shape; consumer wiring left to WF.
15. **Build + typecheck + test passes.** `npm run build`, `npm run typecheck`, `npm test` all green.

### ADR

16. **Companion ADR landed** in `.arc/reference/adr/`. Records constitutional shift; parallel scale
    to ADR-016.

---

## Open Questions

### Resolve during work

- **Final exact prose for `[!NOTE]` redirect on `activate-work-unit.md`** — drafted at task
  generation. Conveys: "If the WU doesn't exist yet (no `plan/<name>` branch, no `meta-{name}.md`
  in `active/`), start with `init-work-unit.md` instead."
- **Roster cascade module name** — `worktree-roster.ts` vs `wu-roster.ts` settled at task
  generation.
- **Migration commit shape** — atomic-per-op default per existing ARC atomic-commit discipline;
  task generation specifies per-op grouping.
- **`docs` discipline placement** — `commit-format.md` is the leading candidate (all three
  candidate docs load each commit; only one needs to carry it). Final placement at task generation.
- **META-PRD content draft iteration** — initial draft surfaces shape ambiguities; v1.1 template
  revisions ride the same Phase 4 work.
- **Hook denylist expansion beyond `arc`** — surfaced during PR review or initial implementation;
  tracked as Phase 6 detail.
- **Atomic-tier worktree handling under single-branch-per-WU** — main-worktree-as-launchpad lean
  per plan; final decision at WF/AWL PRD time (downstream).
- **`pm.layer` value-set update** — `arc-pm | external | none` → `arc-pm | none` resolution lands
  in `plan-arc-modes.md`, not WOR direct scope.

### Resolve during PRD review or before task generation

None — all substantive decisions locked during discovery.

---

## External Research

- `research-commit-convention-reform.md` (2026-05-13) — empirical audit of CC type and scope usage in
  2024-2026 agentic/framework/methodology repos. Findings synthesized into R25-R29 + § Technical
  Considerations § Hook regex updates. File retires alongside `plan-work-organization-reform.md` per
  `1_create-prd.md` Step 5.
- `research-worktree-tool-convergence.md` (2026-05-12) — worktree-trio dev-ergonomics pressure test
  resolution. Already absorbed into the parallelism-trio WU plan-docs.

Prior research already absorbed into plan-doc and carried into PRD:

- Conventional Branch spec + 2024+ adoption survey — closed core-6 type-set decision
- Roadmap / PROJECT-STATUS / META-PRD pattern survey (KEPs, Rust Project Goals, etc.) — informed
  R33-R39

---

## Activation Audit

When this WU activates, audit PRD content against current framework state for drift:

- **Existing in-flight WUs:** verify no WUs mid-flight that would conflict with the migration pass.
  Recommended sequencing puts WOR after Interlock Release Wrappers WU2 ships, when no other
  parallelism-trio WUs are active.
- **`backlog/feature/` and `backlog/technical/` contents:** inventory at activation; decide
  group-dir treatment per cluster (parallelism trio is one obvious group; interlock-release-wrappers
  cluster is another; `notes-*.md` files are typically standalone).
- **Leaked status files:** scan main's `active/{cat}/status-*.md` for any Planning-state files that
  escaped the new model. Migration pass cleans them up.
- **Cross-references in active workflow / strategy docs:** grep `feature/`, `technical/`,
  `[PLAN]:`, `integrate-planning-branch`, `activate-planning-branch` to enumerate touch surface.
- **PROJECT-STATUS.md content audit:** grep `.arc/reference/PROJECT-STATUS.md` for content not
  decomposed by R40's mapping. Anything not covered surfaces as scope-gap.
- **META-PRD content survey:** read existing `.arc/META-PRD.md` before content rewrite. Preserve
  any content that the new shape genuinely subsumes; surface anything that doesn't fit as scope
  question.
- **Cross-references to retired artifacts:** grep `PROJECT-STATUS.md`, `plan-roadmap-evolution`,
  `plan-completion-status-consolidation`, `template-completion-doc`, `completion-*.md` for
  reference surface that needs update or retirement.
- **CLI tooling capture verification:** confirm § CLI tooling capture (downstream — must not be
  lost) entries are captured in target downstream WU plan-docs.
- **Commit-convention current state:** verify 7-of-13-unused empirical state still holds (or has
  shifted); re-run the audit if WOR activates more than a few weeks after PRD landing.
