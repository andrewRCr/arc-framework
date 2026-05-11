# Plan: Work Organization Reform

**Purpose:** Rebuild ARC's WU lifecycle foundation around a single-branch-per-WU model with sweep-as-you-go
integration, retire the `feature/`/`technical/` category prefixes in favor of Conventional Branch alignment,
introduce optional group dirs in `backlog/` for codified multi-WU groups, and codify the status-file
location-by-state convention. Delivers per-worktree isolation as a precondition for the parallelism trio
(Worktree Foundation + Agile WU Lifecycle + Concurrent Work Conventions). Constitutional reform of WU
conventions; not a worktree-mechanism WU.

- **State:** Draft — pre-PRD exploration captured 2026-05-08 during worktree-DX sanity-check discussion.
  Identified as upstream foundation needed before the parallelism trio.

- **Created:** 2026-05-08

- **Origin:** Surfaced during a pre-PRD sanity-check on the upcoming parallelism trio
  (Worktree Foundation, Concurrent Work Conventions, Agile WU Lifecycle). The
  evaluation pulled three previously latent concerns into one coherent reform:

    1. **Branch-prefix friction.** Observed pattern of `technical/{name}` branches integrating as `feat:` PRs
       (and vice versa) — the internal category prefix gets contradicted by the conventional-commits PR title
       routinely enough that the categorization was costing more than it paid. WUs also cross the
       feature/technical boundary in practice often enough that the partition isn't honest.
    2. **Per-worktree isolation leak.** Tracing the four boundary workflows revealed that
       `integrate-planning-branch.md` leaves the status file in `active/` on main in `State: Planning`,
       and `activate-work-unit.md` transitions it on the WU branch only — main retains the stale Planning-
       state version through WU integration. New worktrees branched from main inherit those stale files.
       This is a structural blocker for the per-worktree isolation that Worktree Foundation needs.
    3. **Sibling-WU grouping.** Three related WUs in the parallelism trio (and earlier examples like the
       interlock-release-wrappers split) surface the value of an optional group-dir convention in `backlog/`
       — visual chunking by genuine relation, not arbitrary category.

  Walk-through of the four boundary workflows confirmed the leak is real and mechanically tractable to
  fix. Discussion converged on a single-branch-per-WU lifecycle model that resolves all three concerns
  cleanly and consolidates the boundary workflows in the process.

---

## Problem / Motivation

ARC's current WU lifecycle has three structural problems that compose:

### Per-worktree isolation is impossible under the current model

`integrate-planning-branch.md` Step 2 graduated path explicitly leaves the status file in
`active/{category}/status-{name}.md` on the planning branch, which then merges to main. Step 6 confirms:
*"The status file is on the base branch in `State: Planning`."* `activate-work-unit.md` Step 4 transition
path operates on the WU branch only — main still has the stale Planning-state status file until WU
integration eventually sweeps it to archive.

Practical consequence: any worktree branched from main inherits the stale Planning-state status files
of every in-flight WU whose planning has been integrated but whose execution hasn't archived. With three
WUs in flight (typical under the parallelism trio), every new worktree starts with three other WUs'
status files in its `active/` — visual clutter, but worse than that, those files are *actively
misleading and stale* relative to the WU branches that own them.

This is a structural blocker for the per-worktree isolation that Worktree Foundation needs.

### Branch-prefix categories are contradicted in practice

`feature/{name}` and `technical/{name}` were intended as a coarse "user-visible vs internal" signal
distinct from per-commit conventional-commit types. In practice:

- WUs categorized as `technical/` regularly integrate as `feat:` PRs, and vice versa. The internal
  category and the integration-time PR type contradict each other often enough to call the
  categorization into question.
- WUs cross the feature/technical boundary in practice. The parallelism-trio WUs are a clean example:
  Worktree Foundation is filed `technical/` but ships user-facing CLI/skill changes; Concurrent Work
  Conventions is filed `feature/` but is mostly strategy docs and conventions. The split is somewhat
  arbitrary in retrospect.
- Branch names are longer than they need to be. `feature/plan-concurrent-work-conventions` is 41 chars;
  `concurrent-work-conventions` is 27.
- The only durable benefit is visual chunking of `active/{category}/` and `backlog/{category}/`
  directories, which group dirs serve better and more honestly.

### Separate planning-branch PR adds ceremony without proportional value

Today's flow requires two PRs per WU: a `[PLAN]:` PR delivering planning artifacts, then an
implementation PR delivering execution. For solo + AI workflows (ARC's primary target), the
planning-PR review surface is rarely used substantively — self-review at handoff and AI review on the
PR cover the same ground. The two-PR cost is real (extra review cycle, branch-rotation friction at
activation) without proportional benefit at the typical scale.

Teams that *do* value planning review need an opt-in surface. ARC's configurability architecture
(config + extension + method-override pattern) handles this cleanly without forcing the ceremony on
everyone.

---

## Working Thesis: Single-Branch-Per-WU Lifecycle

ARC's WU artifacts live on the WU's branch through the entire lifecycle — planning, activation,
execution, integration. The branch merges to main *exactly once*, at WU integration, and that merge
sweeps the artifacts directly to `archive/` (sweep-as-you-go).

Under this model:

- **main carries no in-flight WU artifacts.** `backlog/` holds pre-branch incubation only (queued
  plan-docs that haven't been activated). `active/` is empty on main. `archive/` accumulates completed
  WUs.
- **Worktrees branched from main start clean.** Each worktree's `active/` contains only its own WU's
  files because main has nothing to inherit.
- **Per-worktree isolation is structural, not enforced.** Git's working-tree-per-branch semantics
  deliver it for free under this model.
- **One branch per WU, not two.** `plan/<name>` rotates to `<type>/<name>` at activation. No separate
  planning-branch PR; activation is an in-place state transition + branch rename + working-tree
  cleanup, all on the WU's branch.

The model satisfies execution-discipline invariants (mandatory stops, quality gates, atomic commits,
PR review at integration) while removing planning-merge ceremony and structural leaks.

---

## Scope

### In scope

1. **Branch convention reform — Conventional Branch alignment.** Retire `feature/`/`technical/`
   category prefixes for branches and directory structure. Adopt Conventional Branch alignment for
   execution branches (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `perf/`, etc. — full
   conventional-commit type set) with `plan/<name>` for planning state. At activation, branches rotate
   `plan/<name>` → `<type>/<name>` via local rename + remote replace. Type chosen at activation when
   PRD/spec is settled and dominant intent is informed.

    Cascade:

    - `arc-config.yml` `branch.protection` model unchanged; branch-prefix vocabulary updated.
    - `strategy-work-organization.md` — branching section rewritten around Conventional Branch
      alignment and `plan/` graduation.
    - Branching template (if any) updated.
    - `template-pull-request.md` — `[PLAN]:` PR-prefix retired (no separate planning PR exists);
      Conventional Commits PR titles already align with branch-prefix by design.
    - DEV-RULES.ARC § Commit Discipline — branch-naming convention reference updated.

2. **Single-branch-per-WU lifecycle model.** Planning branch IS the WU branch through entire
   lifecycle. Concrete shape:

    - **Initiate WU:** From base branch, `git checkout -b plan/<name>`. (Atomic-tier WUs may skip the
      planning state and create directly as `<type>/<name>` — atomic boundary detail belongs to AWL.)
    - **Planning happens on this branch only:** plan-doc, PRD, tasks evolve in `active/{cat}/` (or
      `backlog/{cat}/` for arc-in-git pre-branch incubation that gets `git mv`'d into `active/` on
      the branch). Never merged to main during planning.
    - **Activation = in-place state transition:** branch renames `plan/<name>` → `<type>/<name>`,
      status field flips `Planning → In Progress`, plan-doc `git rm` if graduated. All on the branch.
      No merge to main.
    - **Execution continues on the same branch:** tasks complete, commits accumulate, completion doc
      drafted at the end.
    - **Integration = first and only merge to main:** sweep `active/{cat}/<files>` → `archive/<dated>/<files>`
      on the branch (sweep-as-you-go), PR merges. main goes from "didn't have these files" to
      "has them in archive/" in one merge.

3. **Sweep-as-you-go integration model (foundation).** Lifted from Agile WU Lifecycle scope
   item 7a's foundation layer:

    - Integration PR includes the sweep commits (file moves from `active/` to `archive/`, status file
      delete) as separate commits per multi-commit-PR norms.
    - Single PR, multi-commit, reviewers focus per-commit (code commits → completion doc commit →
      sweep commit).
    - Default sweep cadence: `with-integration` (sweep bundled with integration PR). Config key
      `archive.cadence: with-integration | deferred | manual` (final shape at PRD).
    - Deferred-cadence variant retained: integration PR omits sweep; archival rides the next-WU
      planning batch (current pattern). Adopters who prefer staged sweep cadence keep that option.
    - Tier-aware sweep ceremony (atomic = trivial sweep, quick = standard, standard = full) is
      Agile WU Lifecycle's scope; the foundation is delivered here.

4. **Workflow consolidation.** Boundary workflows restructured around state transitions instead of
   branch creations:

    - **Retire `integrate-planning-branch.md`** entirely. Planning doesn't integrate as a separate
      step under single-branch-per-WU.
    - **`activate-planning-branch.md`** becomes "initiate-work-unit" (or similar — final naming TBD
      at PRD). Creates the WU branch and the initial planning-state status file on it. No assumption
      of later separate merge.
    - **`activate-work-unit.md`** becomes "graduate-to-execution" (or similar — final naming TBD).
      Operates only as a state transition + branch rename on the existing WU branch. No new branch
      creation, no `git mv` from `backlog/` to `active/` on activation (the move happens at planning
      kickoff on the WU branch when applicable).
    - **`integrate-work-unit.md`** retains its role as the single integration boundary. Bundles the
      sweep-as-you-go shape from scope item 3.
    - **`archive-work-unit.md`** under default `archive.cadence: with-integration` collapses into
      `integrate-work-unit.md` (sweep IS the archive operation). Under deferred cadence,
      `archive-work-unit.md` retains its current shape as a separate post-integration ceremony.

5. **Status-file location-by-state convention.** Status file always lives at
   `active/{cat}/status-{name}.md` (no rotation in/out of backlog). What changes is *which branch
   carries it*:

    - **Planning state:** status file exists on the WU branch (`plan/<name>`) only. main does not
      have it.
    - **In Progress state:** status file exists on the WU branch (`<type>/<name>`) only. main does
      not have it.
    - **Complete state:** status file exists on the WU branch briefly between sweep and merge; sweep
      moves it to `archive/<dated>/` before the merge under sweep-as-you-go.

    Per-worktree isolation: every worktree's `active/` contains exactly its own WU's status file,
    because no other branch's status file is reachable from main.

6. **Group-dir convention for `backlog/`.** Optional, codified-group only. Strict rules:

    - Group dirs exist only for genuine multi-WU groups with a codified group identity (term TBD
      at PRD — "work unit group" or "WU cohort" are candidates).
    - Members of a group co-locate at one level of nesting in `backlog/`: e.g.,
      `backlog/<group-name>/plan-foo.md`, `backlog/<group-name>/plan-bar.md`. No deeper nesting
      permitted.
    - **`backlog/` only.** `active/` stays flat; group identity tracked via the status file's
      `**Sibling Work Unit(s):**` field. Group-dir-on-activate rename costs outweigh the visual
      chunking benefit at active-side WU counts (typically 1-3, bounded at 3-4 under
      Concurrent Work Conventions's focus-role model).
    - **Default = no group.** Single WUs go directly under `backlog/<plan-name>.md` at the root of
      the per-pm.mode root (whatever `backlog/`'s pm-mode-aware shape becomes post-category-retirement).
    - Migration from existing `backlog/{category}/` shape: existing planning artifacts flatten or
      group-by-relation; existing sibling sets (e.g., the interlock-release-wrappers cluster, the
      parallelism trio) pick up group-dir treatment.

7. **Planning-checkpoint review opt-in.** Configuration surface for teams that value planning
   review even under single-branch-per-WU:

    - **Config setting** in `arc-config.yml`:

        ```yaml
        review.planning_checkpoint: disabled
        ```

        Values: `disabled` (default — planning flows directly into execution, no stop) | `required`
        (workflow stops at the planning → execution graduation moment, awaits explicit approval).
    - **Extension point:** `pre-execution-graduation` extension fires at the same checkpoint. Default
      no-op. Teams populate `.actions` for automated review steps (CodeRabbit invocation, custom
      validators, lint runs).
    - **Composition:** config and extension are independent axes — teams can have automated extension
      steps fire AND require human approval after, or either alone.
    - **Convention inventory entry** added to `strategy-configurability-architecture.md`:
      "Planning checkpoint review | P2/P4 | No checkpoint stop | Config setting +
      Extension". Follows the existing `review.pre_merge` precedent.

8. **Per-worktree isolation invariant codification.** Strategy doc statement that each worktree's
   `active/` contains only its own WU's files; cross-WU coordination is a cross-branch / cross-worktree
   read concern. Captured in `strategy-work-organization.md` as part of the WU lifecycle section.

9. **Atomic-tier infra-edit prohibition.** Smell flag in DEV-RULES.ARC and/or strategy doc:
   atomic-tier work shouldn't touch `.arc/system/`, `.arc/reference/strategies/`, `arc-config.yml`,
   or other load-bearing infra files. Such edits warrant quick-tier at minimum (multi-commit
   coordination, deliberate sequencing). Routes captured atomic surfaces (ATOMIC-INBOX) accordingly.

10. **Roster cascade implementation.** Cross-worktree read for Worktree Foundation's
    branch-gone detection cascade. The cascade enumerates WUs via `git worktree list` and per-worktree
    status-file reads, not via a single `active/` directory listing on main. Specific implementation
    delivered here so WF can consume it cleanly.

11. **Documentation cascade.** Strategy and rules updates flowing from the model change:

    - `strategy-work-organization.md` — full rewrite of branching, lifecycle, and category sections
    - `strategy-configurability-architecture.md` — convention inventory entry for planning-checkpoint
      review
    - `DEV-RULES.ARC.md` — branch-naming and lifecycle references; atomic-tier infra-edit smell flag
    - `template-status.md` — clarify location-by-state convention (always `active/`, branch carries it)
    - `template-pull-request.md` — retire `[PLAN]:` PR-prefix; remove planning-PR variant
    - Any other workflow / strategy that references `feature/`/`technical/` prefixes or the
      planning-branch separate-merge pattern

12. **Companion ADR.** Constitutional shift documented as ADR (parallel scale to ADR-016). Records
    the single-branch-per-WU model decision, the Conventional Branch alignment, and the rationale for
    retiring the separate planning-PR.

13. **Migration sweep.** One-time cleanup at WU activation for existing leaked Planning-state status
    files in `active/` on main (if any remain at activation time). Existing in-flight WUs retain their
    current paths through their natural integration; new WUs spun up post-conventions follow the new
    model.

### Out of scope

- **Worktree mechanism, shift lifecycle, branch-gone detection mechanism, inbox sync** — Worktree
  Foundation. This WU delivers the per-worktree isolation foundation that WF builds on; WF
  delivers the worktree-aware operations.
- **Tier model, `arc start` command, ceremony scaling per tier, atomic-companion retirement,
  incidental category retirement** — Agile WU Lifecycle. AWL's scope item 7a shrinks to retain
  only tier-aware adaptations on top of this WU's foundation.
- **Focus-role model and concurrent-work conventions** — Concurrent Work Conventions.
- **External-tracker integration for "what's @teammate working on"** — Coord Probe.
- **Lite mode lifecycle.** Lite is single-WU-at-a-time per project (`plan-arc-modes.md` §
  Lite Session Management) — no parallel-worktree concerns apply, no per-worktree isolation needed.
  Lite keeps its current shape and is unaffected by this reform.
- **Backend storage tier mapping.** `plan-arc-backend.md` notes the worktree-per-WU concept
  maps to per-WU materialized views in backend tier; the single-branch-per-WU model maps even cleaner
  (each WU is a coherent unit). Backend WU consumes this model as substrate but doesn't need
  modification.
- **Auto-promotion or auto-detection of group membership.** Group dirs are explicit-only; framework
  doesn't infer or suggest group membership.
- **Migration tooling / CLI helper for the existing-WU branch rename.** Existing in-flight WUs retain
  their current `feature/{name}`/`technical/{name}` branches through natural integration. Migration
  is forward-only (new WUs use new conventions); historical branches keep their names. No
  retroactive rename ceremony.

---

## Design Decisions

### Single-branch-per-WU as the load-bearing decision

The single-branch-per-WU model is the central decision; everything else (branch conventions,
sweep-as-you-go, workflow consolidation, status-file location) follows from it or composes with it.
Alternative models considered:

- **Status file in `backlog/` during planning.** Rejected — `backlog/` is pm.mode: arc-in-git only,
  doesn't generalize to `none` / `external`. Also semantically odd — a status file in backlog while
  the WU is actively being planned reads wrong.
- **Status file gitignored (per-developer like SESSION-NOTES).** Rejected — loses cross-WU coordination
  visibility. Status files are project state, not personal state.
- **Two branches with delayed planning-merge until activation.** Rejected — planning artifacts merge
  at activation moment instead of planning-integration moment, but main still gets them. Same leak,
  different timing.

Single-branch-per-WU avoids the leak structurally: artifacts only land on main at WU integration,
and sweep-as-you-go routes them through `active/` on the branch directly into `archive/` on main.

### Conventional Branch alignment over no-prefix

No-prefix execution branches were considered and rejected: scannability matters when many branches
exist (atomic chores blending with serious feature work was a real failure mode). Conventional Branch
alignment preserves visual scannability while removing the feature-vs-technical contradiction with
PR conventional-commit types. The arbitrariness concern (WUs cross types internally) is real but
mitigated: dominant-type pick at activation, when PRD/spec is settled, is informed; drift case
(rename mid-work) is rare and recoverable via the same `git branch -m` + remote-replace mechanism
used for the `plan/` → `<type>/` rotation.

`plan/<name>` is preserved as a separate branch state (not a conventional-commit type). Captures the
phase-of-life signal cleanly.

### Group dirs in `backlog/` only — strictness over symmetry

Symmetric group dirs in `active/` were considered: every group's WUs co-locate in both `backlog/` and
`active/`. Rejected on cost — group-dir on activation introduces a file-move ceremony at activation,
and active-side WU counts are bounded enough that visual chunking benefit is small. Group identity in
`active/` lives in the status file's `**Sibling Work Unit(s):**` field, not in the directory tree.
Asymmetry is intentional: `backlog/` accumulates over months and benefits from chunking; `active/`
holds 1-3 WUs typically and doesn't.

### Default `disabled` for planning-checkpoint review

Solo + AI workflows (ARC's primary target) don't substantively use planning-PR review; defaulting to
`required` would impose ceremony most adopters wouldn't benefit from. Default `disabled` matches
ARC's tier-2 convention pattern: minimal ceremony default, configurability available for teams that
want more.

### Sweep-as-you-go subsumed from Agile WU Lifecycle, not deferred

Agile WU Lifecycle's scope item 7a originally bundled the metadata-state foundation
(`State` + `Integration` field rollout, sweep cadence config, sweep-as-you-go shape, tier-aware sweep
ceremony, deferred-sweep variant). The foundation pieces — sweep-as-you-go shape and sweep cadence
config — are subsumed here because they're load-bearing for per-worktree isolation under
single-branch-per-WU. AWL retains tier-aware sweep ceremony (atomic vs quick vs standard scaling) and
the `**State:**`/`**Integration:**` field rollout (tier-aware semantics depend on the tier model).
Split logic: this WU lands the *model*; AWL lands the *tier-specific adaptations* on top.

### Migration is forward-only

Existing in-flight WUs retain their current `feature/`/`technical/` branches through natural
integration. Retroactive rename would force coordination across multiple in-flight branches and
provide no proportional benefit. New WUs spun up post-this-WU follow the new model. The repo's
historical archive (`archive/2026-q*/{category}/`) retains category-organized layout; new archive
entries follow group-dir conventions if applicable.

---

## Dependencies and Sequencing

### Upstream

- **Interlock Release Wrappers** (WU1 + WU2): closes session-operations friction before this
  WU lands. Branch-rename ergonomics under the new conventions benefit from low-friction commit/push
  surface. No hard mechanical dependency, but cleaner sequencing.
- **Session-Operational Flow § Phase 7 metadata-state foundation:** introduces the
  `**State:**` enum (`Planning | In Progress | Complete | ...`) that this WU consumes. Already
  shipped per ROADMAP.

### Downstream

- **Worktree Foundation:** consumes per-worktree isolation as a precondition. WF's scope items
  4 (branch-gone detection) and 8 (main-on-main pattern) compose cleanly on top of single-branch-per-
  WU. WF's scope item 7 (pause-pointer reconciliation) was already independent.
- **Agile WU Lifecycle:** consumes the consolidated boundary workflows and sweep-as-you-go
  foundation. AWL's scope item 7a shrinks to tier-aware adaptations only. Tier model and `arc start`
  command operate on top of single-branch-per-WU lifecycle.
- **Concurrent Work Conventions:** consumes the new branch conventions and per-worktree
  isolation. Focus-role model layers on cleanly.
- **ARCd Rebrand:** consumes stable branch-and-lifecycle terminology before rename pass.
- **ARC Operating Modes:** consumes new conventions; Lite mode unaffected (single-WU
  model has no per-worktree concerns).

### Recommended sequencing

[Interlock Release Wrappers WU1] → [Interlock Release Wrappers WU2] → **Work Organization Reform** →
parallelism trio ([Worktree Foundation] ‖ [Coord Probe] → [Agile WU Lifecycle] → [Concurrent Work
Conventions]).

---

## Pressure Points and Risks

### Boundary-workflow restructure scope

Retiring `integrate-planning-branch.md` and consolidating activate/integrate workflows is a
constitutional-level workflow change. Scope is comparable to ADR-016's session-operations
consolidation. Risk: orphaned references in DEV-RULES, strategies, and other workflows. Mitigation:
thorough grep + integration-test coverage on the new boundary workflows + ADR documenting the shift.

### `[PLAN]:` PR prefix retirement reverberations

Adopters who've configured PR templates, branch-protection rules, or CI workflows around the
`[PLAN]:` prefix need migration guidance. Retired entirely under single-branch-per-WU (no separate
planning PR exists). Mitigation: explicit migration note in adopter-facing release docs.

### Conventional Branch type-set decision

Full Conventional Branch spec includes `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `perf/`,
`test/`, `style/`, `build/`, `ci/`. ARC may not need the full set (e.g., `style/` doesn't map well
to ARC's WU shape). PRD-time decision: which subset is the canonical ARC set, and what's the
guidance for adopters who want to extend or restrict.

### Group-dir migration from existing categories

Existing `backlog/feature/` and `backlog/technical/` contents migrate at this WU's activation. Some
WUs are already siblings (parallelism trio, interlock-release-wrappers cluster) and pick up
group-dir treatment cleanly. Standalone WUs flatten. Risk: missing cross-references that point at
old paths. Mitigation: grep sweep + lint check + migration commit shape that records the path
changes for downstream reference.

### Planning-checkpoint review default

Default `disabled` is correct for solo + AI but adopters used to the `[PLAN]:` PR pattern may expect
the prior behavior by default. Mitigation: clear guidance in adopter-facing release notes and
strategy doc on the `review.planning_checkpoint: required` opt-in for teams that want planning
review back.

### Lite mode interaction

`plan-arc-modes.md` § Lite Session Management is in active design. Lite is single-WU-at-a-time
and unaffected by this reform, but Lite's branching shape and lifecycle workflows need confirmation
during PRD that the new conventions don't accidentally constrain Lite. Forward-compat check at PRD.

### Backend tier compatibility

`plan-arc-backend.md` notes worktree-per-WU maps to per-WU materialized views. Backend WU
PRD should verify the single-branch-per-WU model maps cleanly (it should — each WU is a coherent
branch-plus-artifacts unit, easier to materialize/dematerialize than a multi-branch lifecycle).

### Deferred sweep cadence interaction

Adopters using `archive.cadence: deferred` (current pattern: archive batched with next-WU planning)
keep their current shape. Per-worktree isolation under deferred cadence has a small
post-integration-pre-archive window where main has Complete-state files in `active/` until next
sweep. Window is bounded and factually accurate (the WU IS complete), but worth documenting as a
known transitional state for deferred-cadence adopters.

---

## Open Questions

### Conventional Branch type set

Which subset of conventional-commit types becomes ARC's canonical branch-prefix set? Candidates:
core (`feat`, `fix`, `chore`, `docs`, `refactor`, `perf`) vs extended (add `test`, `style`, `build`,
`ci`). Adopter extension/restriction guidance.

### `plan/` graduation rename ergonomics

`git branch -m plan/<name> <type>/<name>` + `git push origin :plan/<name> <type>/<name>` is the
mechanical operation. PRD-time question: helper command (`arc graduate <type>` or similar) or
documented manual sequence? Force-push-equivalent semantics on planning branches are benign
(pre-PR, no reviewers) but worth explicit acknowledgment.

### Group-dir codified term

"Work unit group" / "WU cohort" / "sibling cohort" — pick one constitutionally so adopters can't
drift toward grouping-everything. Naming research at PRD.

### Boundary-workflow naming under consolidation

"Initiate work unit" / "spawn work unit" / "activate work unit (planning)" for the renamed
`activate-planning-branch.md`. "Graduate to execution" / "begin execution" / "promote work unit" for
the renamed `activate-work-unit.md`. Final naming TBD at PRD.

### Sweep-as-you-go vs deferred default

Default `archive.cadence: with-integration` is the lean here (cleanest per-worktree isolation, no
post-integration-pre-archive window). But ARC's current pattern is deferred (archive batched with
next-WU planning under `branch.protection: full`). Default change is a real opinion shift. Confirm
at PRD that the lean holds, or pick deferred as default with `with-integration` opt-in.

### Atomic-tier worktree handling under single-branch-per-WU

Atomic WUs were specified in Worktree Foundation as "no worktree, no spawn — atomic work
happens in the current worktree on a side-branch." Under single-branch-per-WU, atomic still gets a
branch (one per WU), just no worktree. Open question: does the atomic land in the *current WU's
worktree* (disrupting that WU's working state) or the *main worktree* (per WF scope item 8's
main-on-main pattern, treating main worktree as atomic launchpad)? Lean: main worktree as launchpad.
Confirm at WF/AWL PRD time.

### Migration of existing planning artifacts

Specifically: WUs currently in `.arc/backlog/feature/` and `.arc/backlog/technical/` at this WU's
activation. Flatten? Group? Mixed? PRD-time pass to inventory current contents and decide
per-cluster.

### Atomic-tier infra-edit smell flag enforcement

Documentation-only (smell flag in DEV-RULES.ARC) or mechanical (pre-commit hook check)? Lean
documentation; mechanical enforcement adds hook surface. PRD decision.

---

## Scope Estimate

**Standard tier — Large.** Constitutional change scope plus broad sweep across boundary workflows,
strategies, templates, and migration. Smaller than `plan-agile-wu-lifecycle.md` (no tier model), but
load-bearing for the parallelism trio.

Phases (provisional):

1. **Constitutional foundation** — ADR drafting (single-branch-per-WU model + Conventional Branch
   alignment + planning-PR retirement); DEV-RULES.ARC amendments; alignment with existing strategy
   docs.
2. **Branch convention reform** — strategy-work-organization rewrite; branching template updates;
   `template-pull-request.md` PR-prefix retirement; cross-doc grep sweep for `feature/`/`technical/`
   references.
3. **Boundary-workflow restructure** — retire `integrate-planning-branch.md`; rename and rescope
   `activate-planning-branch.md` and `activate-work-unit.md`; consolidate sweep-as-you-go into
   `integrate-work-unit.md`; restructure `archive-work-unit.md` for default-cadence vs deferred-cadence
   variants.
4. **Sweep-as-you-go foundation** — `archive.cadence` config key; sweep commit shape; integration PR
   multi-commit ordering (code → completion → status flip → sweep); deferred-cadence variant
   preserved.
5. **Status-file location-by-state convention** — `template-status.md` clarification;
   `strategy-work-organization.md` documentation; per-worktree isolation invariant codified.
6. **Group-dir convention** — codified-group rules; `backlog/`-only convention; migration of
   existing planning artifacts.
7. **Planning-checkpoint review opt-in** — config setting (`review.planning_checkpoint`); extension
   point (`pre-execution-graduation`); convention inventory entry in
   `strategy-configurability-architecture.md`.
8. **Atomic-tier infra-edit smell flag** — DEV-RULES.ARC entry; documentation in strategy docs.
9. **Roster cascade implementation** — cross-worktree read for Worktree Foundation's
   branch-gone detection consumption.
10. **Migration sweep** — flatten/group existing `backlog/feature/` and `backlog/technical/`
    contents; one-time cleanup of any leaked Planning-state status files in `active/` on main.
11. **External research** — Conventional Branch spec adoption patterns, planning-review opt-in
    patterns from comparable methodologies, single-branch lifecycle examples (Stripe, Google, GitLab).
    Validates conventions against industry idiom; informs PRD-time language refinement.
12. **Documentation / tests / examples** — standard closing phase.

Phase 1 gates everything else. Phases 2-3 sequential (convention precedes workflows). Phase 4
depends on Phase 3. Phases 5-9 mostly independent of each other; can parallel. Phase 10 depends on
Phase 6's group-dir rules. Phase 11 informs Phase 1's language; can run alongside.

---

## Activation Audit

When this WU activates, audit plan content against current framework state for drift. Known concerns
as of 2026-05-08:

- **Existing in-flight WUs:** verify no WUs are mid-flight that would conflict with the migration
  pass. Recommended sequencing puts this WU after Interlock Release Wrappers WU2 ships, when no
  other parallelism-trio WUs are active.
- **`backlog/feature/` and `backlog/technical/` contents:** inventory at activation; decide
  group-dir treatment per cluster (parallelism trio is one obvious group; interlock-release-wrappers
  cluster is another; `notes-*.md` files are typically standalone).
- **`active/` leaked status files:** at activation time, scan main's `active/{cat}/status-*.md` for
  any Planning-state files that escaped the new model. Migration pass cleans them up.
- **Cross-references in active workflow / strategy docs:** grep `feature/`, `technical/`,
  `[PLAN]:`, `integrate-planning-branch`, `activate-planning-branch` to enumerate touch surface.

---
