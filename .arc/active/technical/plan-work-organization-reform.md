# Plan: Work Organization Reform

**Purpose:** Rebuild ARC's WU lifecycle foundation around a single-branch-per-WU model with sweep-as-you-go
integration, retire the `feature/`/`technical/` category prefixes in favor of Conventional Branch alignment,
introduce optional group dirs in `backlog/` for codified multi-WU groups, and codify the meta-file
location-by-state convention (renaming `status-{name}.md` → `meta-{name}.md` in the process).
Delivers per-worktree isolation as a precondition for the parallelism trio (Worktree Foundation +
Agile WU Lifecycle + Concurrent Work Conventions). Constitutional reform of WU conventions; not a
worktree-mechanism WU.

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

> [!NOTE]
> **Inline folds on touched workflows and lifecycle docs.** When this WU edits a workflow
> or lifecycle-adjacent document already in scope, several adjacent items fold in at the same
> edit — not as a separate sweep, only inline with the touches:
>
> 1. **Commit/push class-tag routing** (per the `user/{identity}/ATOMIC-INBOX.md` entry
>    "Audit workflow/extension/method/skill fire-sites for wrapper-vs-raw consistency",
>    2026-05-11): categorize each touched fire-site (ceremony / review-fix / sweep /
>    off-ceremony) and settle the class tag — `` `taskCommit` `` / `` `workflowCommit` `` /
>    `` `workflowPush` `` or intentionally untagged. The broader sweep across untouched
>    workflows stays with the inbox entry's own future WU.
> 2. **Workflow-interlock markers**: verify the workflow's interlock stops
>    (`workflow-interlock`, `integration-interlock`, etc.) sit at the codified points and use
>    canonical marker prose. Drift gets corrected inline rather than as a separate cleanup
>    later.
> 3. **`arc sync` / `arc release push` auto-set-upstream behavior.** Substantive code change
>    (not just an audit pointer) that rides this WU's reshape of `activate-planning-branch.md`
>    Step 6 and `activate-work-unit.md` Step 8 — the "optional first push" steps retire once
>    new-branch pushability auto-sets upstream when push is authorized. Design: extend the
>    pushability matrix so the `blocked-no-upstream` cell resolves to an `upstream-init`
>    outcome when `pushInterlock` permits the worktree leg, running `git push -u origin <branch>`
>    at the `pushWorktreeBranch` seam instead of refusing. Both `arc sync` (matrix dispatch)
>    and `arc release push` (handler consumes pushability via the same seam) benefit; the
>    refusal hit during this WU's own activation push validated the friction is real. Watchouts
>    retained from the original capture: branch-protection refusals stay (existing invariant);
>    stacked-PR / multi-remote flows still opt out via raw `git push -u <other-remote> <branch>`;
>    remote-unavailable handling unchanged; notes-leg paired-push contract unchanged. Forward
>    compat: WOR's single-branch-per-WU lifecycle retires the "optional first push" surface
>    entirely from both step targets, so the fold lands as a natural step deletion rather than
>    a step rewrite. Replaces the standalone `arc sync: auto-set-upstream when push is
>    authorized` ATOMIC-INBOX entry (2026-04-30).
> 4. **`integrate-work-unit` post-PR-create handoff guidance** (per the
>    `user/{identity}/ATOMIC-INBOX.md` entry "Retire the `integrate-work-unit`
>    post-PR-create handoff warning", surfaced 2026-05-07): when `integrate-work-unit.md`
>    is reworked for sweep-as-you-go, replace the stale warning with skip-threshold-aware
>    language. Handoff in the PR-create-to-first-review window is fine when pre-advance
>    plus handoff skip-threshold produce no branch commit; caution remains only for handoff
>    after Step 8/review-fix work has started if minimizing review cycles matters.
> 5. **Lifecycle `Next Action` pointer contract** (per the `user/{identity}/ATOMIC-INBOX.md`
>    entry "Clarify lifecycle `Next Action` pointers when project-specific workflows
>    implement a step"): when session-init/session-handoff/status-pointer guidance is touched,
>    preserve the ARC lifecycle workflow prefix as the session-type inference contract
>    (`integrate-work-unit Step 8 — ...`). Project-specific workflow detail belongs in
>    SESSION-NOTES or trailing detail, not as the leading meta-file prefix.
>
> Scope discipline: inline-with-touches only. Items 1 and 2 are audit-derived corrections;
> item 3 is a substantive behavior change that rides the workflow trim; items 4 and 5 are
> lifecycle-contract cleanups that ride the same workflow/doc surfaces. Workflows and docs
> untouched by this WU stay for their respective inbox entries.

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
implementation PR delivering execution. The two-PR cost is real and accrues per WU at any
team size — an extra review cycle plus branch-rotation friction at activation. Substantive
planning review, when adopters want it, is delivered better by an opt-in checkpoint at the
planning → execution transition than by a second merge-able PR: the checkpoint composes with
automated reviewers (CodeRabbit, custom validators, lint runs) more flexibly than a PR-review
surface, and avoids materializing planning state in main's integrated history.

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

### Positioning relative to agentic-coding practice

Markdown-in-repo planning is idiomatic across current agentic-coding practice (Spec-Kit, BMAD-Method,
AgentOS, Cursor Project Rules, CLAUDE.md / AGENTS.md conventions) — driven by agent-nativeness: agents
read the same workspace as the developer, so co-located context has near-zero friction. ARC inherits
that surface; what it adds is structural discipline (single-branch-per-WU lifecycle, planning →
execution rotation without separate-PR ceremony, sweep-as-you-go integration, meta-file
location-by-state). The substrate is conventional; the discipline is constructed.

The worktree-trio direction (Worktree Foundation + Agile WU Lifecycle + Concurrent Work Conventions)
tracks the convergent field response to *intra-WU* concurrency. *Inter-WU* coordination — cross-WU
references where one WU depends on another's evolving planning state — is a distinct concern; the
field's modal answer is out-of-band human coordination (Slack, standup, discussion). ARC treats
out-of-band coordination as the interim default and defers any codified inter-WU sync mechanism to
Concurrent Work Conventions downstream.

---

## Scope

### In scope

1. **Branch convention reform — Conventional Branch alignment.** Retire all internal category
   prefixes (`feature/`, `technical/`, `incidental/`) for branches and directory structure. Adopt
   Conventional Branch alignment for execution branches — core 6 (`feat/`, `fix/`, `chore/`, `docs/`,
   `refactor/`, `perf/`) as ARC's canonical set, with `plan/<name>` for planning state. Contested
   types (`test/`, `style/`, `build/`, `ci/`) treated as adopter-extension territory, not baseline
   (per Pressure Points § "Conventional Branch type-set decision" — external research closed the
   question). At activation, branches rotate `plan/<name>` → `<type>/<name>` via local rename +
   remote replace. Type chosen at activation when PRD/spec is settled and dominant intent is informed.

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
    - **Planning happens on this branch only:** plan-doc, PRD, tasks evolve in `active/` (or in
      `backlog/plans/` for arc-in-git pre-branch incubation that gets `git mv`'d into `active/` on
      the branch). Never merged to main during planning.
    - **Activation = in-place state transition:** branch renames `plan/<name>` → `<type>/<name>`,
      status field flips `Planning → In Progress`, plan-doc `git rm` if graduated. All on the branch.
      No merge to main.
    - **Execution continues on the same branch:** tasks complete, commits accumulate, completion doc
      drafted at the end.
    - **Integration = first and only merge to main:** sweep `active/<files>` → `archive/<dated>/<files>`
      on the branch (sweep-as-you-go), PR merges. main goes from "didn't have these files" to
      "has them in archive/" in one merge.

3. **Sweep-as-you-go integration model (foundation).** Lifted from Agile WU Lifecycle scope
   item 7a's foundation layer:

    - Integration PR includes the sweep commits (file moves from `active/` to `archive/`, meta file
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
      at PRD). Creates the WU branch and the initial planning-state meta file on it. No assumption
      of later separate merge.
    - **`activate-work-unit.md`** becomes "graduate-to-execution" (or similar — final naming TBD).
      Operates only as a state transition + branch rename on the existing WU branch. No new branch
      creation, no `git mv` from `backlog/` to `active/` on activation (the move happens at planning
      kickoff on the WU branch when applicable).
    - **`integrate-work-unit.md`** retains its role as the single integration boundary. Bundles the
      sweep-as-you-go shape from scope item 3. **Downstream layering contract:** WOR ships this
      workflow with sweep-as-you-go bundled and tier-agnostic structure. Agile WU Lifecycle
      layers tier-aware sweep ceremony (atomic trivial / quick standard / standard full);
      Concurrent Work Conventions layers async-merge accommodation (handoff and cleanup
      behavior during awaiting-review latency). WOR's edits preserve those extension points by
      keeping the primary flow sync-merge plus tier-agnostic, with downstream-specified
      additive treatment.
    - **`archive-work-unit.md`** under default `archive.cadence: with-integration` collapses into
      `integrate-work-unit.md` (sweep IS the archive operation). Under deferred cadence,
      `archive-work-unit.md` retains its current shape as a separate post-integration ceremony.

5. **Meta-file location-by-state convention.** Meta file always lives at
   `active/meta-{name}.md` (no category nesting under WOR; no rotation in/out of backlog; rename
   per item 15). What changes is *which branch carries it*:

    - **Planning state:** meta file exists on the WU branch (`plan/<name>`) only. main does not
      have it.
    - **In Progress state:** meta file exists on the WU branch (`<type>/<name>`) only. main does
      not have it.
    - **Complete state:** meta file exists on the WU branch briefly between sweep and merge; sweep
      moves it to `archive/<dated>/` before the merge under sweep-as-you-go.

    Per-worktree isolation: every worktree's `active/` contains exactly its own WU's meta file,
    because no other branch's meta file is reachable from main.

6. **Group-dir convention for `backlog/plans/`.** Optional, codified-group only. Strict rules:

    - Group dirs exist only for genuine multi-WU groups with a codified group identity (term TBD
      at PRD — "work unit group" or "WU cohort" are candidates).
    - Group dirs sit at one level inside `backlog/plans/{planned,provisional}/` (see item 14's
      `plans/` interlude); their members sit directly inside the group dir. No nesting below the
      group dir. Example: `backlog/plans/planned/<group-name>/plan-foo.md`,
      `backlog/plans/planned/<group-name>/plan-bar.md`.
    - **`backlog/` only.** `active/` stays flat; group identity tracked via the meta file's
      `**Sibling Work Unit(s):**` field. Group-dir-on-activate rename costs outweigh the visual
      chunking benefit at active-side WU counts (typically 1-3, bounded at 3-4 under
      Concurrent Work Conventions's focus-role model).
    - **Default = no group.** Single WUs go directly under
      `backlog/plans/{planned,provisional}/plan-<name>.md` (at the respective state-dir root, no
      group nesting).
    - **Group membership is state-uniform.** A group's WUs sit in the same state-dir — either all
      `planned/` (group committed/sequenced) or all `provisional/` (group co-explored). Mixed-state
      groups would split awkwardly across dirs; the cleaner answer is group identity moves with
      commitment state. Open question (PRD): graduation pattern when a single member is ready
      before its siblings — promote-group-together vs. exit-group-and-graduate-alone.
    - Migration from existing `backlog/{category}/` shape: existing planning artifacts route to
      `provisional/` by default (current `plans/` contents are mostly substantive thinking, not
      all yet sequenced on `ROADMAP.md`); known-committed entries (already on `ROADMAP.md`) route
      to `planned/`; existing sibling sets (e.g., the interlock-release-wrappers cluster, the
      parallelism trio) pick up group-dir treatment within their respective state-dir.

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
    - **Fire-site:** the planning → execution state transition fires both the config check
      (`review.planning_checkpoint`) and the `pre-execution-graduation` extension. Under WOR's
      consolidated workflow shape (item 4), this is the renamed `activate-work-unit.md`
      ("graduate-to-execution" per item 4's TBD naming). Single State-flip moment on the WU
      branch; workflow halts there when config is `required` and resumes after explicit
      approval. Atomic and quick tiers bypass planning entirely (Agile WU Lifecycle's
      `arc start` path), so the checkpoint applies only to the standard-tier path.
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
    meta-file reads, not via a single `active/` directory listing on main.

    **Shape:** library function in `packages/arc-framework/src/lib/git/` (module name TBD at PRD —
    candidates: `worktree-roster.ts`, `wu-roster.ts`). Returns a list of
    `{worktreePath, branch, identity?, metaFilePath, state}` tuples. Synchronous read of
    worktree list, async per-worktree meta-file resolution; returns empty list when no worktrees
    or no meta files surface (clean degradation).

    **Consumers (initial):** Worktree Foundation's branch-gone detection; session-init's
    next-work-unit discovery (potentially — WF PRD decides); future `arc roster` or
    `arc workspaces` CLI surface if added (not in this WU's scope). Specific API surface settled
    at PRD; this WU ships the function plus tests, leaving consumer-side wiring to WF.

    **Out of scope for this item:** identity-filter logic (lives in WF's branch-gone consumer);
    recency-window filtering (consumer concern); team-mode `(@identity)` parsing (consumed from
    the meta file's `**Branch:**` field per WF item 4's existing description).

11. **Documentation cascade.** Strategy and rules updates flowing from the model change:

    - `strategy-work-organization.md` — full rewrite of branching, lifecycle, and category sections;
      add section on Origin/Spec orthogonality and "ARC planning discipline applies regardless of
      external tracker presence"
    - `strategy-work-planning.md` — new section codifying the four-surface capture model
      (per-user `USER-INBOX.md` + shared `ATOMIC-INBOX.md` / `BACKLOG-INBOX.md`), ceremony-only
      write rule, drain conventions, read-staleness framing
    - `strategy-configurability-architecture.md` — convention inventory entry for planning-checkpoint
      review
    - `DEV-RULES.ARC.md` — branch-naming and lifecycle references; atomic-tier infra-edit smell
      flag; capture-routing rule constitutionalized (moved from `DEV-RULES.PROJECT.md`);
      vocabulary distinction (WU as wrapper, atomic as work-character); Origin/Spec orthogonality
      codified (Origin = where the need came from; Spec = what we're building; always orthogonal —
      external trackers go in Origin, never Spec)
    - `template-status.md` → `template-meta.md` (rename per item 15). Clarify location-by-state
      convention (always `active/`, branch carries it); add `**Origin:**` field with default
      `[Internal]`; title updated to reflect metadata framing
    - `template-pull-request.md` — retire `[PLAN]:` PR-prefix; remove planning-PR variant
    - `session-init.md` / `session-handoff.md` — preserve lifecycle workflow prefixes in meta-file
      `Next Action` pointers; route project-specific workflow details to SESSION-NOTES or trailing detail
    - `integrate-work-unit.md` — replace stale post-PR-create handoff warning with skip-threshold-aware guidance
    - `template-meta.md` (renamed from `template-status.md` per item 15) — phase-labeled
      sections: life-phase fields plus archive-phase sections (PR URL, Completed date, Release
      Notes Entry, Completion Notes per items 16-17); codified `**State:**` value-set, `**Owner:**`
      field, `**Depends On:**` field per item 20
    - `template-meta-prd.md` (new — META-PRD shape codification per item 18) — Mission, numbered
      principles, anti-goals, problem statement, design tradeoffs sections
    - `1_create-prd.md` — add alignment gate against META-PRD principles (item 18)
    - `activate-work-unit.md` — add conditional supplementary META-PRD check (item 18) and
      ROADMAP regeneration step (item 19)
    - `archive-work-unit.md` — Tier-1 step for Release Notes Entry + Completion Notes
      composition (item 16); ROADMAP regeneration step (item 19)
    - `strategy-team-coordination.md` — clarify singular Owner + `(@name)` task-level
      composition; deprecate concurrent multi-owner pattern (item 20)
    - `strategy-work-organization.md` — document ROADMAP rendering algorithm (item 19) so
      hand-maintenance can follow it pre-CLI; document archive shape new vs legacy (item 21)
    - Any other workflow / strategy that references `feature/`/`technical/` prefixes, the
      planning-branch separate-merge pattern, `backlog/{category}/` paths, `status-*.md` files,
      `completion-*.md` files, `template-completion-doc.md`, `PROJECT-STATUS.md`,
      `plan-roadmap-evolution.md`, or `plan-completion-status-consolidation.md`

12. **Companion ADR.** Constitutional shift documented as ADR (parallel scale to ADR-016). Records
    the single-branch-per-WU model decision, the Conventional Branch alignment, and the rationale for
    retiring the separate planning-PR.

13. **Migration sweep.** One-time cleanup at WU activation:

    - Existing leaked Planning-state `status-*.md` files in `active/` on main (if any remain at
      activation time). Existing in-flight WUs retain their current paths through their natural
      integration; new WUs spun up post-conventions follow the new model.
    - **In-flight meta-file rename** (per item 15): `status-{name}.md` → `meta-{name}.md` for any
      WUs active at WOR's activation. Mechanical rename committed as part of WOR's migration
      commits. Historical archives keep their `status-*.md` filenames (read-only).
    - Per-user `ATOMIC-INBOX.md` → `USER-INBOX.md` rename. Existing content moves under the
      `## Atomic` section of the new file. `## Backlog` section initially empty.
    - `BACKLOG-FEATURE.md` + `BACKLOG-TECHNICAL.md` merge → `backlog/BACKLOG-INBOX.md`. Entries
      reclassified during the migration pass (some may route to `backlog/ATOMIC-INBOX.md` instead
      based on shape; some may promote directly to draft `plan-*` docs if matured during inventory).
    - New empty `backlog/ATOMIC-INBOX.md` created.
    - All existing `plan-*` docs in `backlog/` move into `backlog/plans/{planned,provisional}/`
      (and into their group dirs where applicable, per item 14's `plans/` interlude).
      Classification: entries currently sequenced on `ROADMAP.md` route to `planned/`; remaining
      plan-docs route to `provisional/` by default. PRD-time review confirms or reclassifies
      per-doc.
    - **Origin field backfill** (per item 11 cascade): existing in-flight meta files default to
      `**Origin:** [Internal]` unless an external tracker reference exists in their prior `**Spec:**`
      field — in which case the external URL/ID migrates to `**Origin:**` and `**Spec:**` resets
      to its internal artifact reference (or `[no spec yet]` during planning state).
    - **State value recodification** (per item 20): in-flight meta files' `**State:**` values
      map to the new canonical set (`Provisional | Planned | Active | Integrating | Shipped`).
      Existing values (`Planning`, `Draft`, `In Progress`, `Complete`, etc.) translate
      mechanically per a one-time mapping table at activation. `**Integration:**` field removed
      from in-flight meta files (folded into State).
    - **Owner field backfill** (per item 20): in-flight meta files default `**Owner:**` to
      `arc.identity` (single-developer repo). Multi-identity repos populate per current
      ownership.
    - **Depends On field initialization** (per item 20): in-flight meta files default
      `**Depends On:** [none]`. Existing dep relationships (encoded today in `**Sibling Work
      Unit(s):**` or in prose) extracted manually at activation time.
    - **PROJECT-STATUS.md deletion** (per item 21). Content not directly carried forward to
      Release Notes Entries or META-PRD logged in the deletion commit message as historical
      record.
    - **`plan-roadmap-evolution.md` deletion** (per item 19). Tiered-horizons direction
      superseded by item 19's rendered-view shape.
    - **`plan-completion-status-consolidation.md` deletion** (per item 16). Plan absorbed into
      WOR; standalone WU retired.
    - **`template-completion-doc.md` deletion** (per item 16). Content folded into
      `template-meta.md` archive-phase sections.
    - **META-PRD content rewrite** (per item 18). Existing `.arc/META-PRD.md` content replaced
      with new shape (Mission + numbered principles + anti-goals + problem statement + design
      tradeoffs). Dogfooding pass on the framework template.

14. **Capture pipeline and `backlog/` layout reform.** Redesign pre-plan-doc capture surfaces and
    `backlog/` directory layout to handle multi-WU and worktree-era concurrency without backend
    infrastructure, consolidate the retired `feature/`/`technical/` bucket inbox files, and codify
    the vocabulary distinction between work-unit-as-wrapper and atomic-as-work-character.

    **Four-surface capture model.** Capture splits by visibility and write cadence:

    - **`user/{id}/USER-INBOX.md`** — per-user, gitignored, notes-synced. Replaces today's
      `ATOMIC-INBOX.md` at this path. Two sections (`## Atomic`, `## Backlog`) routing to the two
      shared destinations at drain time. Live writes during any session.
    - **`backlog/ATOMIC-INBOX.md`** — project-shared, tracked. Receives atomic-character entries
      (single-bounded; fold into commits or become atomic-tier WUs). Ceremony-only writes.
    - **`backlog/BACKLOG-INBOX.md`** — project-shared, tracked. Consolidates retired
      `BACKLOG-FEATURE.md` + `BACKLOG-TECHNICAL.md`. Receives multi-step entries (candidates for
      plan-doc promotion). Ceremony-only writes.
    - **`backlog/plans/...`** — mature `plan-*` docs (see `plans/` interlude below). Live writes
      during planning sessions on the WU branch.

    Naming rationale: prefix within each directory disambiguates the file from its neighbors.
    `user/{id}/` has multiple non-inbox files (SESSION-NOTES, etc.) → `USER-` scope prefix.
    `backlog/` has two inboxes distinguished by content → `ATOMIC-` / `BACKLOG-` type prefixes.
    `BACKLOG-INBOX` in `backlog/` is mild path redundancy doing real semantic work: it marks this
    file as *the* inbox of the directory's primary content (planned WUs), with `ATOMIC-INBOX`
    named explicitly as the carve-out for items that don't fit that pipeline.

    **Ceremony-only write rule.** The two shared inbox files at `backlog/` root are written only at
    three lifecycle moments:

    - **Activation absorption** — agent reads `backlog/ATOMIC-INBOX.md`, identifies entries the
      activating WU's scope absorbs, stages deletions alongside activation. Captured atomic items
      land as task list entries, commits within the activating WU, or atomic-tier WUs spawned
      separately.
    - **Integration drain** — agent reads per-user `USER-INBOX.md`, routes each remaining entry to:
      drop / fold-into-this-WU-last-minute / push-to-`backlog/ATOMIC-INBOX.md` /
      push-to-`backlog/BACKLOG-INBOX.md` / promote-to-`plan-*` doc. Writes the appropriate shared
      inbox alongside integration sweep.
    - **Planning-kickoff promotion** — when drafting a new `plan-*` doc, agent reads
      `backlog/BACKLOG-INBOX.md` for entries the plan absorbs; stages deletions alongside plan-doc
      creation.

    Outside these moments, shared inboxes are read-only by convention. Hook-enforced check deferred
    to a later atomic if drift surfaces. Absorbed entries are deleted, not marked — the routing
    record lives in the deletion commit message plus the absorbing artifact (commit, task list,
    plan-doc).

    **`plans/` interlude with planned/+provisional/ split.** `backlog/` root holds three
    top-level overview docs only: `ATOMIC-INBOX.md`, `BACKLOG-INBOX.md`, `ROADMAP.md`. All
    `plan-*` docs and their group dirs nest under `backlog/plans/`, split into two state-dirs:

    ```text
    backlog/
    ├── ATOMIC-INBOX.md
    ├── BACKLOG-INBOX.md
    ├── ROADMAP.md
    └── plans/
        ├── planned/                   (committed + sequenced — on ROADMAP)
        │   ├── <group-name>/
        │   │   └── plan-*.md
        │   └── plan-*.md (standalone)
        └── provisional/               (drafted, not yet committed to sequencing)
            ├── <group-name>/
            │   └── plan-*.md
            └── plan-*.md (standalone)
    ```

    **Semantic axis.** Presence in `planned/` means the WU is sequenced on `ROADMAP.md` and
    committed to. Presence in `provisional/` means the plan-doc exists as substantive thinking but
    hasn't been committed to scheduling — could be next-up, could sit indefinitely, could be
    dropped. The split serves two purposes: (a) gives `ROADMAP.md` an alignment axis (it should
    reference only `planned/` entries; anything in `provisional/` doesn't belong on the roadmap),
    (b) separates committed-direction from exploratory-thinking visually and structurally.

    **Graduation trigger.** A plan-doc graduates `provisional/` → `planned/` when added to
    `ROADMAP.md` as a sequenced entry. The roadmap inclusion IS the commitment signal; the
    `git mv` rides the same commit that adds the roadmap entry. Symmetric inverse: a `planned/`
    doc demoted off `ROADMAP.md` (deprioritized, parked indefinitely) demotes back to
    `provisional/` via the same mechanism. No separate ceremony.

    **Notation.** `plan-*` filename prefix is unchanged across the split. The `planned/` /
    `provisional/` dirs hold the same artifact type; only the dir indicates lifecycle state. The
    mild lexical collision (`planned/plan-foo.md`) is accepted; semantic ambiguity does not arise
    in practice — the dir indicates state, the file is the plan-doc.

    Rationale: (a) backlog root stays scannable regardless of plan count, (b) the three top-level
    docs read as a project-overview triad rather than being sandwiched between group dirs and
    standalone plan files in dirs-first explorer sort, (c) `ROADMAP.md` no longer sits orphaned
    among individual plan files, (d) the state-dir split eliminates the drift hazard of
    "everything in `plans/` should be on the roadmap" being interpreted loosely.

    **Vocabulary distinction — work unit vs atomic.** Codify in `DEV-RULES.ARC` (or
    `AGENT-BRIEF.ARC.md` § Vocabulary):

    - **Work unit** is the wrapper noun — any bounded chunk of work with a branch, status, and PR.
      Invariant across tiers (atomic / quick / standard from Agile WU Lifecycle).
    - **Atomic** describes work character — single-bounded, indivisible, no internal stages. Items
      can be atomic (capture-tier), tasks can be atomic (companion-file scope), WUs can be
      atomic-tier (minimal-ceremony WU).
    - Capture inboxes distinguish by **work character** (atomic vs multi-step), not by wrapper
      presence/absence. An atomic-character item may fold into existing commits OR become an
      atomic-tier WU on its own branch.

    **Read-staleness framing.** Shared inboxes represent *committed direction as of the last
    ceremony*, not real-time capture. Live capture lives in per-user `USER-INBOX.md`; cross-team
    visibility materializes at the next ceremony boundary. For "what's the current shared inbox
    state across the project?" reads, workflows fetch and read against `origin/main` (local
    working tree shows the branch's view; `origin/main` shows the project's latest committed
    view).

    Forward-compat: the future backend (`plan-arc-backend.md`) replaces the materialized inbox
    files with a live-queried view. The conceptual model — per-user capture, ceremony-boundary
    materialization, read-staleness as bounded-not-arbitrary — survives the transition cleanly.

    Cascade:

    - **Item 6** (group-dir convention): nesting rule rephrased to sit under `plans/` rather than
      directly under `backlog/` (already applied above).
    - **Item 11** (documentation cascade): adds touches for the four-surface model in
      `strategy-work-planning.md` (or new strategy section), capture-routing constitutionalization
      in `DEV-RULES.ARC`, vocabulary distinction codification.
    - **Item 13** (migration sweep): expanded to include inbox renames, plan-doc moves into
      `plans/`, and entry reclassification during merge (already applied above).
    - **`DEV-RULES.PROJECT.md` § Capture Routing**: the routing rule becomes constitutional and
      moves to `DEV-RULES.ARC`. Project-specific routing overrides remain in
      `DEV-RULES.PROJECT.md` if needed.
    - **Workflows touched**: `activate-work-unit.md` (absorption drain step at activation),
      `integrate-work-unit.md` (escalation drain step at integration), `1_create-prd.md` or
      planning-kickoff workflow equivalent (promotion drain step), `clean-work-unit.md` (no drain
      step at handoff per design decision — handoff stays focused).

15. **Meta-file rename — `status-{name}.md` → `meta-{name}.md`.** Rename the WU manifest file
    across the framework. Reflects the file's actual role: project-pointer metadata (primary
    content header is `## Work Unit Metadata`), not just current-state. The file carries metadata
    fields (Branch, Spec, Origin, Sibling WUs, Task List, plus Owner and Depends On per item 20),
    active-state pointers (Last Completed, Next Task, Blockers, Next Action, State per item 20),
    and — under item 16's absorption of `plan-completion-status-consolidation.md` — archive-phase
    sections (PR URL, Completed date, Release Notes Entry, Completion Notes). "Status" undersold
    the composite role; "meta" matches the content header and the file's actual function as the
    durable WU manifest.

    Cascade:

    - `template-status.md` → `template-meta.md`. Title updated to reflect metadata framing
      (final phrasing at PRD).
    - All workflow, strategy, rules, brief, and template references updated:
      `active/status-{name}.md` → `active/meta-{name}.md` everywhere.
    - `arc status` CLI command name unchanged — its semantic ("show current ARC state") is
      broader than the meta file's role; the command reads from the meta file but doesn't need
      to share its prefix.
    - Downstream consumers (`plan-completion-status-consolidation.md`,
      `plan-agile-wu-lifecycle.md`, `plan-worktree-foundation.md`,
      `plan-concurrent-work-conventions.md`) inherit the new naming. Consistency updates land in
      those plan docs as part of WOR's planning sweep.

    Sort-order benefit: with `atomic-*` companions retiring (AWL scope item 8) and the new
    `meta-*` prefix, `active/` ordering becomes:

    ```text
    active/
    ├── meta-{name}.md      (sorts first — agent's primary orientation target)
    ├── plan-{name}.md      (during planning state)
    ├── prd-{name}.md       (post-PRD)
    └── tasks-{name}.md     (post-task-generation)
    ```

    Agent-bootstrap target leads any directory listing. Within a single WU's artifact group and
    across the directory, the meta file is the natural entry point.

    Migration: forward-only. Existing in-flight WUs at WOR's activation rename their `status-*.md`
    files to `meta-*.md` as part of item 13's migration sweep. Historical archives keep their
    `status-*.md` filenames — past archives are read-only and don't benefit from the rename.

16. **Completion-doc consolidation — absorbed from `plan-completion-status-consolidation.md`.**
    Eliminate `completion-{name}.md` as a distinct artifact. The meta file (per item 15's rename)
    survives into archive as the durable WU manifest, carrying both life-phase content and
    archive-phase content in phase-labeled sections of one template. Absorbs the standalone
    `plan-completion-status-consolidation.md` plan-doc entirely — that plan retires as part of
    WOR's migration sweep (item 13).

    **Archive-phase sections of `meta-{name}.md`:**

    - **Release Notes Entry** — structured, categorized record of what changed for users/adopters.
      Categories: `Added | Changed | Removed | Fixed | Infrastructure`. One-paragraph summary plus
      optional Breaking Changes callout. Composed at integration ceremony; this is the
      aggregation-source slice that downstream release-tooling reads (per item 17).
    - **Completion Notes** — narrative. Lessons learned, deferred items, plan-vs-shipped delta,
      PRD success-criteria deviations, supersessions, decisions worth capturing for future
      planners. Optional but encouraged; composed at archive ceremony.

    **Template shape — single template, phase-labeled sections.** Life-phase fields (existing:
    Branch, Spec, Origin, Sibling WUs, Task List, Last Completed, Next Task, Blockers, Next
    Action, State, Integration, Owner, Depends On) and archive-phase sections (PR URL, Completed
    date, Release Notes Entry, Completion Notes) coexist in one template, clearly labeled by
    phase. Both shapes are short; one document covers both.

    **Authorship-gap mitigation.** Tier-1 step in `archive-work-unit.md` ceremony: compose
    Release Notes Entry + Completion Notes before archive completion. Matches the absorbed plan's
    lean. Authorship happens close to merge while context is fresh.

    **Workflow updates** (absorbed verbatim from `plan-completion-status-consolidation.md`,
    refined for WOR's scope):

    - `integrate-work-unit.md` — remove the completion-metadata creation step (today's Step 3)
      and the completion freshness check (today's Step 6b); rewrite the push-and-PR step to drop
      completion-doc-as-PR-source framing. PR URL captured at archive, not pre-merge — eliminates
      the standalone PR-URL-fill-in commit currently sitting between PR creation and merge. Add
      step: compose Release Notes Entry section on the meta file before commit.
    - `archive-work-unit.md` — change "delete meta file" to "transform meta file" (clear
      life-phase fields, populate archive-phase sections, compose summary). Tier-1 step at archive
      for Release Notes Entry + Completion Notes composition.
    - `clean-work-unit.md` — Mode 2 currently produces fields the completion doc reads; under the
      new model those fields feed the Release Notes Entry composition instead.
    - `template-completion-doc.md` — delete. Content folds into `template-meta.md` (renamed per
      item 15) as the archive-phase sections.

    **Migration: forward-only.** Existing archived WUs keep their `completion-{name}.md` files as
    historical artifacts. New WUs use the consolidated model. Mixed-format archive during
    transition is accepted (see item 21).

    **Surface sweep additions** (folded into item 11 cascade): references to
    `template-completion-doc.md` and `completion-*.md` files across workflows, strategies, rules,
    briefs, and templates retire alongside item 11's existing cascade scope.

17. **Per-WU Release Notes Entry contract — framework-universal, aggregation-optional.** Codifies
    the per-WU completion record at integration ceremony as the framework's universal contract;
    downstream aggregation into a public-facing CHANGELOG.md or equivalent is deferred to opt-in
    tooling, not framework-default.

    **Framework-scope (universal contract):**

    - Every shipped WU has a Release Notes Entry section in its archived `meta-{name}.md` (per
      item 16). Categorized (`Added | Changed | Removed | Fixed | Infrastructure`); one-paragraph
      user-facing summary plus optional Breaking Changes callout.
    - Composition fire-point: integration ceremony, when `**State:**` transitions
      `Active → Integrating` (per item 20).
    - Discipline enforced by `integrate-work-unit.md` workflow step (compose entry before
      commit). Optional CLI validation hook (e.g., `arc state set integrating` checks
      section presence) deferred to downstream tooling.
    - Post-`Shipped` edits are errata only; no mechanical lock. Git history is the lock —
      matches keep-a-changelog norms ("changelogs are append-only after publication; corrections
      are documented in commits").

    **Out of WOR scope (deferred to downstream WUs):**

    - Public `CHANGELOG.md` at repo root — adopter-dependent. Some adopters publish via npm
      and maintain a CHANGELOG.md; some don't. Generating one by default would pre-empt
      adopters' format choice (KaC / Conventional Commits / changesets) and collide with
      existing tooling. Framework provides the per-WU record; aggregation is per-adopter.
    - Aggregation CLI command (`arc release notes` or similar) — opt-in framework feature in a
      future WU after dogfooding this repo's own CHANGELOG composition.
    - This repo's own public `CHANGELOG.md` (ARC ships as npm package) — project-specific
      release engineering, scoped in a downstream WU (npm-release WU or similar). WOR codifies
      the per-WU entry contract; this repo's aggregation tooling rides in its own WU.

    **Composition with Conventional Commits (ARC's existing commit-format default).** Per-WU
    Release Notes Entry sits at WU granularity; Conventional Commits sits at commit granularity.
    They compose, not compete. ARC keeps Conventional Commits for commit-level format discipline
    (per `commit-format.md` method); per-WU entry handles the WU-level user-facing summary that
    aggregation tools would consume. Conventional Branches (downstream consideration in the
    worktree-trio plans) is similarly orthogonal — branch-naming convention at branch-creation,
    independent of either commit or WU granularity.

18. **META-PRD redesign — shape (framework) + content (this repo).** ARC's existing `META-PRD.md`
    artifact exists from early development as the "authoritative project-vision-goal" reference,
    but has sat unreferenced and unmaintained — naive shape, no ceremony integration, no
    discipline keeping it live. WOR reshapes META-PRD into a load-bearing alignment artifact and
    rewrites this repo's content as the dogfooding pass.

    **Shape — codified template for adopters.** META-PRD carries:

    - **Mission** — 1-3 sentences. What this project is and why it exists.
    - **Numbered design principles** (5-7) — quotable, referenceable as nouns in decision-making.
      Discoverable: principle violations get cited by number ("this conflicts with principle 3").
    - **Anti-goals** — explicit non-goals. What this project intentionally doesn't try to do.
      Strongest differentiator between useful and ornamental vision docs per external research.
    - **Problem statement** — why this project exists vs. existing alternatives.
    - **Design tradeoffs** — why each principle is what it is. Prevents principles from feeling
      arbitrary; explains the cost paid for each.

    The shape ships as `template-meta-prd.md` (or equivalent — final naming at PRD) for adopter
    use. Existing `META-PRD.md` in this repo is the dogfooding instance.

    **Ceremony integration — the liveness mechanism.** External research's strongest finding:
    vision docs rot in isolation; stay live when referenced as nouns in development ceremonies.
    Three fire-points:

    - **PRD creation gate** (`1_create-prd.md`). Hard alignment check: does this PRD serve a
      META-PRD principle? If conflict, decide: course-correct the PRD, or propose META-PRD
      clarification in the same PR (proven pattern from Node.js TSC, Rust RFC review).
    - **Integration verification** (`integrate-work-unit.md`). Final flag check: if alignment
      flagged earlier or scope drifted during impl, verify and propose action. Soft check;
      rarely blocks if create-PRD check passed.
    - **Activation supplementary check** (`activate-work-unit.md` / "graduate-to-execution" per
      item 4). Conditional: fires only when META-PRD has been edited since the PRD was approved,
      indicating context shift between shaping and activation. Light prompt, not default
      ceremony cost.

    **Update triggers** (consolidated):

    - Event-driven: major release, scope shift, governance change. Codified release/PR-time
      ceremony.
    - Organic: when a PR conflicts with an unstated or stale principle, the submitter proposes a
      META-PRD clarification in the same PR. Lowest-friction maintenance pattern; matches the
      proven liveness mechanism across surveyed projects.
    - Not cadence-driven by default — periodic review is acceptable but isn't the load-bearing
      trigger.

    **Content rewrite (this repo, dogfooded).** Existing META-PRD's content is replaced under
    this WU. Net new prose; takes the new shape; codifies ARC's actual design principles and
    anti-goals. The content rewrite is the dogfooding pass — surfaces shape ambiguities that
    feed back into the framework template (shape v1 may revise to v1.1 based on content-rewrite
    findings).

    **Surface location.** META-PRD lives at `.arc/META-PRD.md` (existing location preserved).
    Referenced from `AGENT-BRIEF.PROJECT.md`, `README.md`, and adopter-facing onboarding docs;
    cited by number in PRD reviews and WU activations.

19. **ROADMAP as rendered view — meta-file source of truth + dep-tier rendering.** Replaces the
    retired `plan-roadmap-evolution.md` (collapsed into WOR; its tiered-horizons direction
    conflicts with the rendered-view pattern). ROADMAP.md becomes a generated artifact rendered
    from in-flight (`active/`) and planned (`backlog/plans/planned/`) meta-files.

    **Source of truth.** Meta files carry the per-WU state (`**State:**`, `**Owner:**`,
    `**Depends On:**` per item 20). ROADMAP.md is the rendered view; never hand-edited. Header
    comment: "Generated by `arc roadmap render` — do not edit by hand. Last rendered from
    commit <hash>."

    **Render algorithm** (codified in WOR; CLI implementation deferred):

    1. Walk `.arc/active/**` and `.arc/backlog/plans/planned/**` for `meta-*.md` files.
    2. Parse `**State:**`, `**Owner:**`, `**Depends On:**`, title fields.
    3. Topologically sort by `**Depends On:**` (resolved deps point to either Shipped WUs in
       archive or other in-flight/planned WUs).
    4. Group into tiers: In Flight (State: Active or Integrating) → Foundation (no unresolved
       deps among planned WUs) → Tier 2+ (depend on Foundation tier) → Independent Tracks
       (parallel-safe; no inter-deps with above).
    5. Render markdown with tier sections, per-WU lines (name, Owner, brief Depends On).
    6. Footer note pointing to `provisional/` for exploratory plan-docs not yet on roadmap.

    **Parallelizability — inferred from absence of dependency.** External research's strongest
    finding: no surveyed project expresses parallelism explicitly; all infer from absence of
    blocking relationships (Bazel principle: explicit deps reveal parallelism). ROADMAP tiers
    that contain multiple WUs with no inter-deps are parallel-safe for worktree-per-WU
    activation. The renderer doesn't tag parallelism; the tier structure surfaces it.

    **Regeneration fire-points** (ceremony-coupled, not continuous):

    - WU graduation (`provisional/` → `planned/`, per item 14's graduation trigger).
    - WU activation (`planned/` → `active/`, per item 4's renamed workflow).
    - WU integration (`active/` → archive).
    - Dep field edit on any planned/active meta-file.

    Each ceremony's workflow includes a regenerate-ROADMAP step. Between ceremonies, ROADMAP is
    the snapshot from the last fire — drift bounded by ceremony cadence, not by hand-discipline.

    **CLI command deferred** to a downstream WU. Captured here explicitly so it isn't lost:
    `arc roadmap render` (or equivalent CLI surface) ships as part of either Worktree Foundation,
    Agile WU Lifecycle, or a dedicated tooling WU — sequencing decision at PRD time. **Interim
    discipline (pre-CLI):** ROADMAP.md hand-maintained following the documented rendering
    algorithm above. ARC currently has very few in-flight + planned WUs at any moment, so manual
    rendering is trivial until automated. When the CLI ships, deterministic output should
    produce minimal diff against hand-maintained ROADMAP — a useful sanity check.

    **Render shape (illustrative):**

    ```markdown
    # ROADMAP

    _Generated by `arc roadmap render` — do not edit by hand. Last rendered from commit abc123._

    ## In Flight (active/)
    - WU-foo (Owner: andrew) — depends on: (none)
    - WU-bar (Owner: andrew) — depends on: WU-baz [Shipped]

    ## Foundation (no unresolved deps)
    - WU-worktree-foundation (Owner: andrew)

    ## Tier 2 (depends on Foundation)
    - WU-agile-lifecycle (Owner: andrew) — depends on: WU-worktree-foundation
    - WU-concurrent-conventions (Owner: andrew) — depends on: WU-worktree-foundation

    ## Independent Tracks (no inter-deps with above; parallel-safe)
    - WU-some-other-thing (Owner: andrew)

    ---
    _Provisional exploration lives in `backlog/plans/provisional/` — not yet on roadmap._
    ```

    `plan-roadmap-evolution.md` retires as part of WOR's migration sweep (item 13). Its
    tiered-horizons (Now / Next / Later) direction is superseded — Rust abandoned that pattern
    at hundreds-of-contributors scale per external research; the rendered-from-source-of-truth
    pattern subsumes everything tiered-horizons was trying to do.

20. **Meta-file field codification — State values, Owner, Depends On.** Codifies and extends the
    meta file's field set. Composes with item 15 (meta rename) and item 5 (location-by-state).

    **`**State:**` codified value-set.** Today's values are uncodified (`Planning`, `Draft`,
    `In Progress`, `Complete`, others ad-hoc). New canonical value-set, KEP-inspired:

    | Value         | Meaning                                                        |
    |---------------|----------------------------------------------------------------|
    | `Provisional` | Plan-doc exists in `provisional/`; not committed to sequencing |
    | `Planned`     | Plan-doc in `planned/`; on ROADMAP; not yet started            |
    | `Active`      | WU under execution on its branch (per item 5)                  |
    | `Integrating` | WU under integration ceremony (PR open or sweep in progress)   |
    | `Shipped`     | WU merged + archived                                           |

    **`**Integration:**` retired.** The existing `**Integration:**` field (today's `Merged` /
    other values) folds into State. `Integrating` covers in-flight integration; `Shipped` covers
    post-merge. Field disappears from the template.

    **`**Owner:**` field added.** Singular per WU — exactly one identity at any moment.

    - **Solo mode:** auto-populated from `arc.identity` config; tautological but codifies the
      shape forward-compat.
    - **Team mode:** explicit; identifies the WU-level point-of-contact / accountability lead.
      Handoff during impl updates the Owner field (sequential ownership; per § Singular Owner
      design decision below).
    - **Composition with `(@name)` task-level convention** (existing): Owner = WU-level
      shepherd; `(@name)` checkbox markers = task-level granularity *under* the Owner. Different
      surfaces, different granularities; no collision (per `strategy-team-coordination.md`
      which scopes `(@name)` to task lists only).

    **`**Depends On:**` field added.** Bare WU-name list. Renders into ROADMAP's tier grouping
    (per item 19). Operationally defined: X is `Depends On Y` if Y's `Shipped` state is required
    before X can safely activate (worktree-per-WU under item 5 means deps are evaluated against
    base-branch availability of dependency artifacts).

    **`**Blocks:**` deferred.** The inverse field (X blocks Y means Y depends on X) is
    redundant under explicit Depends On — adding both creates bidirectional maintenance burden
    without surfacing new information. Skip for now; revisit if downstream tooling demands it.

    **Worktree-foundation hard-block on unresolved deps.** WU activation under worktree-per-WU
    hard-blocks if any of the activating WU's `**Depends On:**` entries are not yet `Shipped`.
    Worktree Foundation enforces this at activation ceremony — per the locked sequencing
    decision (WF is the next WU after WOR; no point designing the gate twice).

    **Multi-dev concurrency model — singular Owner; concurrent same-WU co-ownership
    deprecated.** Worktree-per-WU + KEP-style single-owner makes concurrent multi-owner
    operationally redundant (per Design Decisions § Singular Owner below). Existing patterns
    that survive: task-level distribution within a WU under singular Owner (via `(@name)`),
    sequential handoff (Owner field updates). Patterns deprecated: two devs equally owning and
    concurrently editing one WU's files. Light edit to `strategy-team-coordination.md` clarifies
    this (per item 11 cascade).

21. **Archive shape forward-only consolidation + PROJECT-STATUS retirement.** Locks the
    forward-only migration position across all WOR-introduced changes; collapses archive's
    category subdir under group-dir collapse symmetry with backlog; retires PROJECT-STATUS.md
    entirely with its function decomposed across the other artifacts.

    **All WOR changes apply forward-only.** Historical archive
    (`.arc/reference/archive/2026-q*/{category}/`) is read-only: retains categorical layout,
    `status-*` and `completion-*` filenames, and uncodified field values. No retroactive
    migration of archived WUs; the format evolution itself becomes part of the historical
    record visible in archive structure. Generalizes the position already in Design Decisions §
    "Migration is forward-only" — extends it to cover Release Notes Entry / Completion Notes
    sections (item 16), codified State values + Owner + Depends On fields (item 20), and the
    archive group-dir collapse (this item).

    **New archive shape — strict mirror of backlog group-dir collapse.** New archive entries
    drop the `{category}/` subdir; structure becomes `archive/<dated>/{wu-name}/`. Temporal
    grouping (`2026-q*`) stays — useful for "when did this ship." Archive shouldn't carry
    vestigial categories the live system has rejected; symmetry with backlog wins.

    **Backward-compat tooling requirement.** Anything that reads the archive — renderer (item
    19), future `arc roadmap render`, completion-history aggregator (item 17 deferred), search
    or audit tooling — must handle both legacy shape (`archive/<dated>/{category}/{wu-name}/`
    with separate `status-*` / `completion-*` files) and new shape (`archive/<dated>/{wu-name}/`
    with single `meta-*` file). Contract on downstream CLI work, not WOR's implementation
    scope; WOR states the requirement so future WUs honor it.

    **PROJECT-STATUS.md retirement.** `.arc/reference/PROJECT-STATUS.md` retires entirely. Its
    function decomposes:

    - **Completed-work history** → per-WU Release Notes Entry section (item 16); future opt-in
      aggregation to a public CHANGELOG (item 17 deferred); the directory tree query (which WUs
      have shipped) answers "what's been done."
    - **Project direction / themes** → META-PRD (item 18). Mission + principles + anti-goals
      carry the "where this project is going" content that PROJECT-STATUS was conflating with
      historical record.
    - **Done-vs-left snapshot** → query across `provisional/` + `planned/` + `active/` +
      archive. The directory tree IS the snapshot; no separate hand-maintained doc.

    No replacement artifact; the function lives across the artifacts above. Existing
    PROJECT-STATUS.md content not directly carried forward by Release Notes Entries or META-PRD
    is logged in the deletion commit message as historical record.

    **Reference integrity sweep** (folds into item 11 cascade). Grep for references to
    `PROJECT-STATUS.md`, `plan-roadmap-evolution.md`, `plan-completion-status-consolidation.md`,
    `template-completion-doc.md`, and `completion-*.md` files across workflows, strategies,
    rules, briefs, and templates. None should break under forward-only migration of archive (no
    archived paths change); active references update or retire alongside the deletions.

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
- **`arc roadmap render` CLI command implementation.** Item 19 codifies the rendering algorithm
  and contract; the CLI command that mechanically renders ROADMAP.md ships in a downstream WU
  (Worktree Foundation, Agile WU Lifecycle, or a dedicated tooling WU — sequencing decision at
  PRD time). **Must not be lost in downstream WU sequencing** — captured explicitly here so
  the dependency is visible at WOR PRD time. Interim hand-maintenance discipline per item 19.
- **Public `CHANGELOG.md` aggregation tooling.** Item 17 codifies the per-WU Release Notes Entry
  contract; aggregation into a public-facing CHANGELOG.md (whether for this repo's npm package
  release or as opt-in framework feature for adopters) ships in a downstream WU. Adopter
  release engineering is out of framework-default scope by intent (per item 17's framework-vs-
  adopter boundary).
- **Release-tooling for `**State:**` transitions.** Optional CLI validation (e.g.,
  `arc state set integrating` checks Release Notes Entry section presence) deferred to downstream
  tooling. Workflow-step discipline is the MVP enforcement mechanism per item 17.
- **Retroactive backfill of Release Notes Entries on historical archives.** Historical archived
  WUs are read-only per item 21; their `status-*` / `completion-*` files remain in place. No
  effort to retrofit Release Notes Entry sections onto archived meta-files.

---

## Design Decisions

### Single-branch-per-WU as the load-bearing decision

The single-branch-per-WU model is the central decision; everything else (branch conventions,
sweep-as-you-go, workflow consolidation, meta-file location) follows from it or composes with it.
Alternative models considered:

- **Meta file in `backlog/` during planning.** Rejected — `backlog/` is `pm.layer: arc-pm` only,
  doesn't generalize to `none`. Also semantically odd — a meta file in backlog while the WU is
  actively being planned reads wrong.
- **Meta file gitignored (per-developer like SESSION-NOTES).** Rejected — loses cross-WU coordination
  visibility. Meta files are project state, not personal state.
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

The Conventional Branch convention has an emergent spec (conventional-branch.github.io) that
explicitly limits the canonical set to core types and rejects expansion on cognitive-load grounds.
ARC's core-6 choice (scope item 1, Pressure Points § "Conventional Branch type-set decision") aligns
with that intentional-scarcity philosophy. Contested types (`test/`, `style/`, `build/`, `ci/`) are
treated as adopter-extension territory rather than baseline.

### Group dirs in `backlog/` only — strictness over symmetry

Symmetric group dirs in `active/` were considered: every group's WUs co-locate in both `backlog/` and
`active/`. Rejected on cost — group-dir on activation introduces a file-move ceremony at activation,
and active-side WU counts are bounded enough that visual chunking benefit is small. Group identity in
`active/` lives in the meta file's `**Sibling Work Unit(s):**` field, not in the directory tree.
Asymmetry is intentional: `backlog/` accumulates over months and benefits from chunking; `active/`
holds 1-3 WUs typically and doesn't.

### Default `disabled` for planning-checkpoint review

Defaults calibrate to the framework's current validation surface — solo dev with a focused tool
set, where planning-PR review isn't substantively exercised. Team mode and concurrent-pair
coordination are designed-for but not yet validated; the framework is built to scale across
dev+agent-pair governance at any team size, with public-release positioning transparent about
the validation scope. `required` is the opt-in for adopters who want a planning-review gate
back. Default `disabled` matches ARC's general tier-2 convention pattern: minimal ceremony
default, configurability available for teams that want more.

The `disabled | required` framing reads as a **per-team governance stance**, not a per-task knob —
chosen once at adoption based on the team's risk tolerance and review-bandwidth posture. Comparable
methodologies (RFC processes, big-org design-doc culture) embed governance in project culture rather
than per-task configuration; ARC's choice to expose it as config is the explicit-configurability
axis, but the *decision shape* (one-time team stance) is consistent with field practice.

### Sweep-as-you-go subsumed from Agile WU Lifecycle, not deferred

Agile WU Lifecycle's scope item 7a originally bundled the metadata-state foundation
(`State` + `Integration` field rollout, sweep cadence config, sweep-as-you-go shape, tier-aware sweep
ceremony, deferred-sweep variant). The foundation pieces — sweep-as-you-go shape and sweep cadence
config — are subsumed here because they're load-bearing for per-worktree isolation under
single-branch-per-WU. AWL retains tier-aware sweep ceremony (atomic vs quick vs standard scaling) and
the `**State:**`/`**Integration:**` field rollout (tier-aware semantics depend on the tier model).
Split logic: this WU lands the *model*; AWL lands the *tier-specific adaptations* on top.

### Migration is forward-only

All WOR-introduced structural changes apply forward-only across the board. The principle:
retroactive migration of historical artifacts rewrites the historical record without
proportional benefit; the format evolution itself becomes part of that record, visible in
archive structure.

**In-flight WUs at WOR's activation:**

- Retain their current `feature/`/`technical/` branches through natural integration (branch
  rename would force coordination across multiple in-flight branches).
- Rename `status-*` → `meta-*` mechanically (item 15; small, low-risk).
- Backfill `**Origin:**` field per item 11 cascade.
- Recodify `**State:**` values to the canonical set + retire `**Integration:**` field per item
  20's mapping table.
- Backfill `**Owner:**` field from `arc.identity` (item 20).
- Initialize `**Depends On:** [none]` field (item 20); existing dep relationships extracted
  manually at activation time.

**Historical archive** (`.arc/reference/archive/2026-q*/{category}/`) is **read-only**:

- Retains categorical layout (`{category}/` subdir preserved on existing archive entries).
- Retains `status-*` and `completion-*` filenames.
- Retains uncodified `**State:**` / `**Integration:**` values.
- No retroactive Release Notes Entry backfill (item 21 deferral).
- No content rewrite to match new META-PRD shape.

**New archive entries** (post-WOR-activation) follow the new model:

- Drop `{category}/` subdir — `archive/<dated>/{wu-name}/` (item 21 — strict mirror of
  backlog's group-dir collapse).
- Single `meta-*.md` with archive-phase sections (Release Notes Entry, Completion Notes) per
  item 16; no separate `completion-*` file.
- Codified `**State:** Shipped`; Owner + Depends On fields populated.

**Backward-compat tooling requirement** (per item 21): renderer, future `arc roadmap render`,
completion-history aggregator, search/audit tooling must handle both legacy and new shapes.
Contract on downstream CLI work, stated in WOR so future WUs honor it.

### Boundary-materialization over append-only or backend-only

The shared backlog inboxes write only at lifecycle ceremonies (activation absorption, integration
drain, planning-kickoff promotion). Alternatives considered:

- **Append-only structured convention with continuous writes.** Per-entry blocks (dated, authored),
  conflict-tolerant additions. Rejected — works under solo and well-disciplined teams but breaks
  the first time two writers edit the same existing entry simultaneously. The "discipline" load
  is real and unbounded; concurrency safety relies on convention rather than mechanism.
- **Per-WU intermediate captures merged at integration.** Each WU branch carries its own captures
  file; integration sweeps merge into main's shared inbox. Rejected as redundant — the per-user
  `USER-INBOX.md` already serves the "personal in-flight capture" role; a per-WU file added a tier
  without distinct semantic value.
- **Defer to the backend.** Document the staleness limitation and live with it pre-backend.
  Rejected — worktree-era multi-WU is downstream of WOR; the current backlog inbox shape becomes
  genuinely broken (not just suboptimal) the moment two worktrees both want to write.

Boundary-materialization sacrifices write immediacy for write isolation. Shared inboxes represent
*committed direction as of the last ceremony*, not real-time capture. Live capture lives in
per-user `USER-INBOX.md`, made cross-team visible at the next ceremony boundary. The future
backend replaces the materialized files with a live-queried view; the conceptual model — per-user
capture, ceremony-boundary materialization, bounded read-staleness — survives the transition.

### Work-unit-as-wrapper, atomic-as-work-character

The worktree trio and tier model surfaced a vocabulary tangle: "atomic" was doing two jobs
(item-shape AND tier-shape) and "work unit" was getting stretched ("is an atomic WU really a
work unit?"). Separating the two concepts resolves both:

- **Work unit** is the wrapper noun — applies to any bounded chunk of work with a branch, status,
  and PR. Invariant across tiers (atomic / quick / standard from Agile WU Lifecycle).
- **Atomic** describes work character — single-bounded, indivisible, no internal stages. Applies
  to items (capture-tier), tasks (companion-file scope), and WUs (atomic-tier).

Consequence for the capture pipeline: inboxes distinguish work *character* (atomic vs multi-step),
not wrapper presence/absence. An atomic-character item may fold into commits OR become its own
atomic-tier WU; both are valid paths from `ATOMIC-INBOX.md`.

Alternative considered:

- **Rename "work unit" entirely.** Industry alternatives (epic, story, initiative) don't fit ARC's
  flat, technical-or-feature-agnostic shape. The compound noun does real work — explicit,
  unoverloaded. Cost of renaming high; benefit unclear.

### Status → meta rename

`status-*` files evolved beyond their original "current state" role. They now carry:

- **Metadata** (Branch, Spec, Origin, Sibling WUs, Task List, Owner, Depends On per item 20) —
  properties of the WU itself, invariant during life
- **Active-state pointers** (Last Completed, Next Task, Blockers, Next Action, State per item 20)
  — current state
- **Archive-phase sections** (PR URL, Completed date, Release Notes Entry, Completion Notes) —
  populated at integration/archive per item 16's absorbed completion-doc consolidation

The file's primary content header is `## Work Unit Metadata`. "Status" undersells the composite
role; "meta" matches the content header and the file's actual function as the durable WU
manifest across both life-phase and archive-phase.

Alternatives considered:

- **Keep `status-*`.** Familiar; would have passed through completion-status consolidation by
  default in the pre-fold shape. Rejected: the rename moment is active, not passive. With
  completion-status consolidation now absorbed into WOR (item 16), the rename and the lifecycle
  extension land together rather than across two WUs.
- **`metadata-*`.** Direct synonym but reads colder/more bureaucratic in prose. Composes worse
  with `{wu-name}` than the shorter `meta-`.
- **`manifest-*`.** Captures the role but carries connotations from other domains (package
  manifests, container manifests) that don't fit.
- **`wu-*` / `unit-*`.** Too short, loses semantic content.

Sort-order benefit: with `atomic-*` companions retiring per AWL, the new `meta-*` prefix puts the
WU's primary orientation target first in `active/` listings (meta-, plan-, prd-, tasks-). Concrete
UX win for any directory listing (CLI, IDE explorer, GitHub web view).

Blast radius: wide (every workflow ref, strategy doc, template, brief, and migration of in-flight
WUs), but narrower now than after AWL ships more meta-file work and consolidation ships its
template rewrite. Renaming during WOR rides existing documentation cascade touches (item 11) and
benefits from the migration sweep already shaped for other rename work (item 13's
ATOMIC-INBOX → USER-INBOX, BACKLOG-FEATURE/TECHNICAL → BACKLOG-INBOX).

The `arc status` CLI command keeps its name. Command semantic ("show current ARC state") is
broader than the meta file's role; the command reads from the meta file but doesn't need to share
its prefix.

Prose-reading watchout: "the meta file" reads slightly more abstract than "the status file" in
isolation, but composes cleanly with `{wu-name}` and habituates quickly. Document-hygiene note:
workflow prose talking about "the meta level" or "metaprogramming" near meta-file references
should disambiguate.

### Origin ⊥ Spec orthogonality

ARC's existing `**Spec:**` field (introduced upstream in plan-session-operational-flow, planned
for tier-aware value semantics in `plan-agile-wu-lifecycle.md`) was specified to accept
external-tracker URLs (`https://github.com/.../issues/123`) as one possible value alongside
internal artifact references (`plan-*`, `prd-*`, `tasks-*`). That conflation was a category
error.

**The principle:**

- **`Origin:`** — where the need for this WU came from. An external tracker issue, a customer
  request, an internal initiative. Default: `[Internal]`. Accepted values: free-text (URL,
  tracker ID, prose). Validated only loosely; structured-form deferred unless tooling demand
  surfaces.
- **`Spec:`** — what the WU is building. Always points at an ARC-owned planning artifact
  (`plan-*.md` during planning state; `prd-*.md` post-PRD; `tasks-*.md` with Scope section for
  quick tier under arc-in-git per AWL). Never points at an external tracker.

They are orthogonal: a WU can have an external Origin AND an internal Spec; an internal Origin
AND an internal Spec; an external Origin AND `[no spec yet]` (during early planning); etc.

**ARC's planning discipline applies regardless of Origin.** Having a GitHub issue, Jira ticket,
or Linear card doesn't substitute for plan-doc → PRD → task-list → execution. The external
tracker is intake, not specification. Even simple atomic work has an Origin (which may be
`[Internal]`); the work's spec is the work itself (atomic-tier framing per AWL).

**Consequence for `pm.layer` semantics.** The current `pm.layer` value-set (renamed from
`pm.mode` per plan-arc-modes) `arc-pm | external | none` collapses to `arc-pm | none`. The
`external` value tried to encode two distinct concerns ("we have a tracker" AND "skip ARC's
planning pipeline") and ended up coherent at neither. Under the new framing, tracker presence is
a per-WU concern captured in `Origin:` (and the project-level adapter axis in `coord.adapter`
per `plan-coord-probe.md`); planning-pipeline presence is the binary `pm.layer: arc-pm | none`.

The `pm.layer` value-set update lands in `plan-arc-modes.md`, not WOR's direct scope. WOR ships
the conceptual framing; `plan-arc-modes.md` consumes it and resolves its existing open question
on "Lite + `pm.layer: external` interaction" (line ~245 of that plan).

Alternatives considered:

- **Keep Spec as the only field; codify "external URLs allowed."** Rejected — perpetuates the
  conflation; AWL's quick-tier-spec-shape open question shows the design space straining under
  the dual role.
- **Add Origin only; leave Spec semantics ambiguous.** Rejected — Spec's role stays unclear
  without explicit orthogonality codification.
- **Introduce Origin and rename Spec.** Considered (e.g., Spec → Plan, Spec → Brief). Rejected as
  scope creep; "Spec" is established ARC vocabulary and the semantic-tightening is what changes,
  not the name.

Migration handling lives in item 13 (Origin field backfill) + item 11 cascade (template addition,
constitutional codification).

### `plans/` interlude in `backlog/`

`backlog/` root holds three top-level overview docs only (the two shared inboxes + `ROADMAP.md`);
all `plan-*` docs and their group dirs nest under `backlog/plans/`, with a second-level
`planned/` / `provisional/` state-dir split (see item 14 for the detailed shape). Alternatives
considered:

- **Flat layout (no interlude).** Plan-* docs and group dirs mixed at backlog/ root alongside the
  inbox files. Rejected — in dirs-first explorer sort, inbox files end up sandwiched between
  group subdirs (above) and standalone plan files (below), losing their "project-overview
  entrypoint" position. `ROADMAP.md` also orphans among individual plans.
- **`_inbox/` subdir for the inbox files only.** Inbox files grouped together but plans stay at
  `backlog/` root. Rejected — solves the inbox-sandwich problem but leaves `ROADMAP.md` orphaned
  and doesn't scale: with many plans, `backlog/` root remains noisy.
- **Single-level `plans/` with no state-dir split.** Plan-docs co-mingled regardless of
  roadmap-commitment state. Rejected — loses `ROADMAP.md`'s alignment axis (provisional thinking
  drifts onto the roadmap; sequenced commitments lose their distinguishing signal). The split's
  benefit (drift-resistance + roadmap-alignment-by-construction) outweighs the second-level
  verbosity cost.

The interlude pays a path-verbosity cost (two extra directory levels on every `plan-*` reference)
for three durable benefits: (a) `backlog/` root stays scannable regardless of plan count, (b) the
three top-level overview docs read as a project-overview triad rather than a sandwich, (c) the
state-dir split aligns roadmap presence with directory presence by construction.

### Single source of truth at the meta file; ROADMAP and CHANGELOG are rendered views

Load-bearing principle across items 16, 17, 19, 20: the meta file is the canonical artifact per
WU. Everything else (ROADMAP, future CHANGELOG aggregation, "done vs left" queries) is rendered
or derived from meta files. External research's convergent finding across KEPs (Kubernetes),
Project Goals (Rust), and changesets-pattern tooling: a per-WU persistent artifact carrying both
forward intent (state, deps, owner) and backward record (release notes, completion notes) is
the proven structural mechanism that avoids drift between artifacts.

Alternatives considered:

- **ROADMAP.md as hand-maintained source of truth + meta files as derived.** Rejected — drift
  between roadmap and per-WU state is exactly the failure mode the rendered-view pattern
  eliminates. Surveyed projects that try this (OpenStack blueprints in Launchpad, abandoned)
  consistently report staleness.
- **Separate "completion record" doc per WU + meta file lifecycle ending at integration.**
  Today's shape (`completion-{name}.md` + `status-{name}.md`). Rejected — two artifacts where
  one suffices; the meta file's content header (`## Work Unit Metadata`) is the natural home
  for archive-phase content. Codifies the "doubles as" framing the absorbed
  `plan-completion-status-consolidation.md` was already converging toward.
- **Defer rendered-view pattern; keep ROADMAP hand-edited.** Rejected — without explicit dep
  fields and a documented rendering algorithm, ROADMAP can't surface parallelizability for
  worktree-per-WU operationally; the alignment axis (`planned/` ↔ ROADMAP) deteriorates into
  hand-discipline.

Consequence: every WU has exactly one persistent artifact (`meta-*.md`), with phase-labeled
sections corresponding to its lifecycle position. Single artifact per WU; multiple rendered
views derived from the artifact set.

### META-PRD as load-bearing reference, not standalone document

ARC's existing META-PRD has sat unreferenced and unmaintained because nothing in the
development loop quoted it. External research's strongest finding on vision doc liveness: live
vision docs are **referenced as nouns in ceremonies** — RFC gates, PR review checks, onboarding
teaching tools. Stale vision docs sit unquoted in isolation.

The decision: META-PRD's value comes from ceremony integration, not from periodic standalone
review. Three fire-points per item 18 (PRD creation, integration verification, conditional
activation) wire META-PRD into the development loop. Update triggers are organic (PR-time
clarification when conflict surfaces) and event-driven (major release, scope shift), not
cadence-driven.

Alternatives considered:

- **Quarterly META-PRD review cadence.** Rejected — surveyed projects that try cadence-driven
  vision review without ceremony integration consistently let it slip (PSF mission review is
  the rare counter-example; required dedicated governance role to sustain). Cadence without
  reference becomes ceremony cost without payoff.
- **Single repo-root mission statement; no separate META-PRD.** Rejected — ARC's PRD-per-WU
  pattern needs a higher-level alignment artifact for the cross-WU principles question. README
  doesn't carry that load.
- **Fold META-PRD content into DEV-RULES.ARC.** Rejected — rules and principles are different
  artifacts. Rules govern execution mechanics; principles govern design direction. Conflation
  would dilute both.

Consequence: META-PRD's redesign is shape-and-content under item 18. The shape ships as a
framework template for adopters; the content is this repo's dogfooding pass.

### Singular Owner per WU; concurrent same-WU co-ownership deprecated

Worktree-per-WU (downstream Worktree Foundation) + KEP/Project-Goals single-owner convention
together make concurrent multi-owner operationally redundant. The decision: `**Owner:**` field
is singular; one identity at any moment.

Existing patterns that survive:

- **Task-level distribution under singular Owner.** `(@name)` checkbox markers (per existing
  `strategy-team-coordination.md`) continue to express per-task collaboration. Owner shepherds
  the WU; collaborators do tasks under that shepherding.
- **Sequential handoff during impl.** Owner field updates when accountability transfers. Live
  scenario in team mode.

Patterns deprecated:

- **Two devs equally owning and concurrently editing one WU's files.** Decomposes naturally
  into separate WUs (different scope per dev) or task-level distribution (`(@name)` markers,
  one Owner). Concurrent worktrees on the same WU is structurally incoherent under
  worktree-per-WU.

Alternatives considered:

- **Plural Owner field (list).** Rejected — surveyed projects' single-owner pattern (KEP
  author, Rust goal POC) is the proven structural shape. Plural ownership pushes accountability
  into ambiguity; concurrent edits push toward merge conflict; both costs are real.
- **Implicit Owner (whoever's branch the WU is on).** Rejected — works in solo mode by
  accident; breaks the moment team mode handoff occurs mid-flight. Explicit Owner field
  surfaces accountability transitions cleanly.

`strategy-team-coordination.md` gets a light edit (item 11 cascade) clarifying this; the doc
currently allows "multiple developers assigned to the same WU" which survives under the
reframing (task-level under singular Owner), but the conceptual default needs explicit
correction.

### Release Notes Entry composability with Conventional Commits

ARC's existing `commit-format.md` method defaults to Conventional Commits. Per-WU Release Notes
Entry (item 17) sits at a different granularity and composes, not competes.

| Mechanism                | Granularity | Source of truth         | Purpose                                         |
|--------------------------|-------------|-------------------------|-------------------------------------------------|
| Conventional Commits     | Per-commit  | Commit message          | Commit-level format discipline; scope/type tags |
| Per-WU Release Notes     | Per-WU      | Section in `meta-*.md`  | WU-level user-facing summary; aggregation source|

In ARC's WU-spans-many-commits model, each commit within a WU follows Conventional Commits;
the WU's Release Notes Entry summarizes the aggregate at the right granularity for a release
reader. Aggregation tooling (deferred per item 17) reads the per-WU entries, not commit
history.

External research's framing "Conventional Commits vs. changesets" was oppositional because
projects often pick one *or* the other for CHANGELOG generation; ARC's KEP-analog model
("WU artifact carries the summary") makes it neither — Conventional Commits stays at commit
granularity (unchanged), per-WU entry handles the feature-level summary. Same composition
logic applies to Conventional Branches (downstream worktree-trio consideration): branch-naming
at branch-creation, orthogonal to commit format and WU-level summary.

No conflict; no inconsistency introduced.

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
  WU. WF's scope item 7 (pause-pointer reconciliation) was already independent. **WF also
  enforces item 20's hard-block on unresolved Depends On at activation ceremony** (per locked
  sequencing decision — no point designing the gate twice).
- **Agile WU Lifecycle:** consumes the consolidated boundary workflows and sweep-as-you-go
  foundation. AWL's scope item 7a shrinks to tier-aware adaptations only. Tier model and `arc start`
  command operate on top of single-branch-per-WU lifecycle.
- **Concurrent Work Conventions:** consumes the new branch conventions and per-worktree
  isolation. Focus-role model layers on cleanly.
- **ARCd Rebrand:** consumes stable branch-and-lifecycle terminology before rename pass.
- **ARC Operating Modes:** consumes new conventions; Lite mode unaffected (single-WU
  model has no per-worktree concerns).

### Downstream — CLI tooling capture (must not be lost)

- **`arc roadmap render` CLI command** (item 19). Mechanically renders ROADMAP.md from
  meta-file state. Sequencing target — one of WF, AWL, CWC, or a dedicated tooling WU — settled
  at PRD time. Until the CLI ships, ROADMAP is hand-maintained following item 19's documented
  algorithm.
- **Release Notes Entry validation hook** (item 17 deferred). Optional CLI check
  (e.g., `arc state set integrating` validates section presence on the meta file).
  Workflow-step discipline is sufficient as MVP; CLI hook hardens later. Target downstream WU
  TBD.
- **Public CHANGELOG aggregation** (item 17 deferred). For this repo's npm release engineering
  (composes per-WU Release Notes Entries into a public CHANGELOG.md at repo root). Scoped in a
  downstream npm-release WU — project-specific, not framework-shipped by default. Captured here
  so it doesn't get lost.

### Absorbed / retired by WOR

- **`plan-completion-status-consolidation.md`** — absorbed into item 16. Standalone plan-doc
  retires; content folds into WOR. Deletion lands in item 13's migration sweep.
- **`plan-roadmap-evolution.md`** — retired. Tiered-horizons (Now / Next / Later) direction
  superseded by item 19's rendered-view shape. Deletion lands in item 13's migration sweep.

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

External research closes most of this gap: core 6 (`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`,
`perf/`) is held as ARC's canonical set; contested 4 (`test/`, `style/`, `build/`, `ci/`) treated as
adopter-extension territory. Rationale: the Conventional Branch spec (conventional-branch.github.io)
explicitly rejects expansion beyond core on cognitive-load grounds; the contested types lack
documented adoption as branch prefixes in major project conventions and fail the WU-coherence test
(work in those categories typically rides alongside feature/fix branches rather than forming
standalone units). PRD-time work: codify the guidance shape — "ARC canonical: core 6;
adopter-extension: contested 4 or any project-local addition."

### Group-dir migration from existing categories

Existing `backlog/feature/` and `backlog/technical/` contents migrate at this WU's activation. Some
WUs are already siblings (parallelism trio, interlock-release-wrappers cluster) and pick up
group-dir treatment cleanly. Standalone WUs flatten. Risk: missing cross-references that point at
old paths. Mitigation: grep sweep + lint check + migration commit shape that records the path
changes for downstream reference.

### Planning-checkpoint review default

Default `disabled` reflects current validation scope; adopters used to the `[PLAN]:` PR pattern
may expect the prior behavior by default. Mitigation: clear guidance in adopter-facing release
notes and strategy doc on the `review.planning_checkpoint: required` opt-in for teams that want
planning review back.

### Opt-in framing — codification ahead of curve

Configurable planning-review (`review.planning_checkpoint: disabled | required`) is novel as a
methodology-level config among comparable frameworks. RFC processes (Rust RFC, Python PEP, Kotlin
KEEP, Ember RFC) and big-org design-doc culture (Google) gate review by *change scope* ("is this
substantial?"), not by *team configuration*. AI-coding peers (Cursor Plan Mode, Aider `/architect`)
have planning surfaces but no codified governance gate. ARC's opt-in config places it ahead of
where AI-coding peers have codified governance, and bridges — rather than replicates — pre-agent
RFC norms. Risk: adopters bringing pre-agent mental models may expect mandatory-or-not-applicable
framing and read "configurable" as either under-discipline or over-engineering. Mitigation:
strategy doc framing positions the choice as a per-team governance stance (see Design Decision §
"Default `disabled`"), with explicit acknowledgment that the field is still codifying its
conventions for agentic-coding governance.

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

### Per-WU Release Notes Entry authorship gap

Item 16/17's Release Notes Entry composition happens at integration ceremony (per the
absorbed completion-status consolidation plan's authorship-gap analysis: post-merge timing means
the summary is composed later than today's pre-PR creation). Risk: with the integration
workflow doing additional work, Release Notes Entry composition gets perfunctory or skipped.
Mitigation: Tier-1 step in `archive-work-unit.md` blocks ceremony completion until the section
is composed (per item 16's lean). Optional CLI validation hook (item 17 deferred) hardens this
mechanically later. The user-facing summary discipline is the load-bearing concern; narrative
Completion Notes are encouraged but not blocking.

### META-PRD live-vs-stale tension

Item 18's ceremony integration is the liveness mechanism, but the failure mode is real: agents
running PRD review may treat the alignment check as procedural rather than substantive, and
META-PRD drifts into ornament. Mitigation strategies (PRD-time refinement): (a) require the
alignment check to *cite* a specific META-PRD principle by number when passing — not just
"checked, passed"; (b) PR-time META-PRD-clarification proposals get fast-track review treatment
to lower friction; (c) failure to cite during PRD review surfaces as a flag at integration
verification. The mechanism only works if the agent and human treat META-PRD as a load-bearing
reference, not box-check.

### ROADMAP rendering CLI sequencing risk

Item 19 codifies the rendering contract; CLI command implementation is deferred to a downstream
WU. Risk: the CLI implementation gets lost in downstream WU sequencing (Worktree Foundation,
Agile WU Lifecycle, Concurrent Work Conventions each have their own priority pressure), leaving
ROADMAP hand-maintained indefinitely. Hand-maintenance discipline is acceptable interim per
item 19 (current planned/active WU count is low) but degrades as the queue grows. Mitigation:
the CLI command is captured in Out of Scope and in Dependencies and Sequencing below; PRD-time
sequencing decision must commit a target downstream WU rather than leaving it floating. If no
target WU absorbs it, scope a dedicated tooling WU.

### Scope growth — research-driven absorption

WOR's scope has expanded substantially from initial framing through three research-driven
passes (worktree concerns, then plan-roadmap-evolution + completion-status consolidation
absorption, then META-PRD redesign + CHANGELOG contract + dep fields). Scope-size estimate
remains "Standard tier — Large" per the Scope Estimate section, but the load-bearing-decisions
list and surface-sweep size both grew. PRD-time evaluation: does WOR need WU-split before PRD
promotion? Pre-approved split is not yet declared; the decision moment is post-planning,
pre-PRD-drafting. Lean: keep as one WU until PRD drafting surfaces a natural split boundary
(e.g., constitutional foundation vs. workflow restructure vs. content rewrites), then split if
warranted.

### Inter-WU planning freshness — model raises but doesn't solve

Single-branch-per-WU isolates each WU's planning artifacts to its branch (Working Thesis, scope
item 5). Cross-WU references — one WU depending on another's evolving planning state — require the
dependent worktree to see the upstream WU's current state, which it does not by default (it holds
the upstream state as of its branch creation, plus whatever it fetches). Mechanisms available:
cross-branch reads (`git show <branch>:<path>` — ergonomically rough), cross-worktree filesystem
reads (requires colocated worktrees + naming convention), or out-of-band coordination (humans
discuss the dependency at planning time).

External research (2024-2026) confirms the field's modal answer is out-of-band coordination — there
is no codified inter-WU planning-freshness pattern in agentic-coding practice (Spec-Kit, BMAD,
Cursor, Claude Code adopter conventions). Emerging research proposals (consensus layer, task-graph
orchestration) address project-wide governance rather than freshness specifically. Prior synthesis
that framed "teams solve concurrency with worktrees + consensus layers" as field consensus was
conflated; worktrees and consensus layers address intra-WU file reconciliation, not inter-WU
planning state.

Posture: WOR treats out-of-band human coordination as the interim default and defers any codified
inter-WU sync mechanism to Concurrent Work Conventions WU downstream. CWC's remit (multi-pair
coordination) is the natural home; codifying it here would be solving a problem the field hasn't
named, and would overload WOR's already-large scope.

---

## Open Questions

### Conventional Branch type set

Closed by external research: core 6 (`feat`, `fix`, `chore`, `docs`, `refactor`, `perf`) is the
canonical ARC set; contested 4 (`test`, `style`, `build`, `ci`) treated as adopter-extension.
PRD-time work: validate the lean against any current-state evidence in this repo's branching
history and codify the adopter-extension guidance phrasing.

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

### Release Notes Entry category set finalization

Item 16/17 codifies `Added | Changed | Removed | Fixed | Infrastructure` as the canonical
category set, adapted from Keep a Changelog for ARC's methodology/tooling domain. Open
sub-questions at PRD time:

- **Should `Deprecated` be a separate category** (KaC default) or fold into `Changed`?
- **Should `Security` be separate** (KaC default) or fold into `Fixed` / `Infrastructure`?
- **Does `Infrastructure` need internal-vs-external split** (some changes are framework-internal
  refactors with no adopter impact)?

Lean: minimal category set as codified; add categories only when first WU genuinely doesn't
fit. KaC's 6-category default is overkill for ARC's domain by current evidence.

### META-PRD ceremony fire-point exact phrasing

Item 18 names three fire-points (PRD creation gate, integration verification, conditional
activation check). PRD-time decision: exact workflow-step phrasing for each — agent-readable
prompt, halt-and-ask conditions, what counts as a "conflict" worth flagging vs. surfaceable
drift. Lean: codify the prompts in each workflow's existing review/audit step rather than as
new ceremony steps, to keep ceremony cost flat.

### Owner field auto-population behavior

Item 20 specifies `**Owner:**` auto-populates from `arc.identity` in solo mode. PRD-time
decision: does the template show the field with a `[arc.identity]` placeholder that the
agent/CLI substitutes at meta-file creation, or does the CLI inject the value programmatically
at template instantiation? Both work; the template-placeholder approach reads more
human-friendly. Forward-compat for team mode: the field is always explicit, never inferred.

### Pre-release / unreleased aggregation pattern

Item 17 codifies the per-WU Release Notes Entry contract. The pre-release window —
"between Integrating and the next published release" — needs a discipline for ARC's own npm
publishing (the dogfood pass). Options: maintain an `Unreleased` section in this repo's
CHANGELOG.md that the npm-release WU manages, or aggregate only at release time. Decision
belongs to the downstream npm-release WU; flagged here so the contract from item 17 doesn't
need to specify the pre-release shape.

### Worktree-trio dev-ergonomics pressure test (forward-compat watch)

The parallelism trio (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions) is
well-aligned as a set against current scope, but the trio's user-facing shape hasn't been
pressure-tested against emerging tools in this space (conductor.build, Claude Code's agent view,
similar) and against ARC's stance that task work should not be far from the human
(primary-agent-as-orchestrator models are explicitly out of scope).

This isn't a WOR PRD-blocker on its own — WOR delivers the per-worktree isolation foundation
regardless of how the trio's ergonomics resolve. But forward-compat watch: trio PRDs should
incorporate this pressure test, and if it surfaces shape changes that bleed back into WOR scope
(e.g., affecting `plans/` interlude layout, group-dir convention, meta-file location-by-state,
or the capture pipeline drain steps), WOR's PRD readiness gates pause until the bleed is resolved.

Document as a known forward-compat dependency on trio research; do not block this WU's PRD
drafting on the research outcome.

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
5. **Meta-file location-by-state convention + meta rename** — `template-status.md` → `template-meta.md`
   rename and clarification; `Origin:` field addition; in-flight `status-*.md` → `meta-*.md` rename
   sweep; `strategy-work-organization.md` documentation (incl. Origin/Spec orthogonality);
   per-worktree isolation invariant codified.
6. **Meta-file field codification** — State value-set (`Provisional | Planned | Active |
   Integrating | Shipped`); `**Integration:**` field retirement; `**Owner:**` field addition with
   solo-mode auto-population; `**Depends On:**` field addition; in-flight meta-file backfill for
   all three; template updates.
7. **Completion-doc consolidation (absorbed from `plan-completion-status-consolidation.md`)** —
   eliminate `completion-{name}.md`; meta file phase-labeled sections; archive-phase sections
   (PR URL, Completed date, Release Notes Entry, Completion Notes); Tier-1 step in
   `archive-work-unit.md` for summary composition; workflow edits (integrate, archive, clean);
   `template-completion-doc.md` deletion; surface sweep.
8. **Group-dir + state-dir conventions** — codified-group rules; `backlog/plans/` interlude with
   `planned/` + `provisional/` state-dir split; graduation trigger (roadmap inclusion = promotion);
   group-membership state-uniformity rule.
9. **Planning-checkpoint review opt-in** — config setting (`review.planning_checkpoint`); extension
   point (`pre-execution-graduation`); convention inventory entry in
   `strategy-configurability-architecture.md`.
10. **Atomic-tier infra-edit smell flag** — DEV-RULES.ARC entry; documentation in strategy docs.
11. **Roster cascade implementation** — cross-worktree read for Worktree Foundation's
    branch-gone detection consumption.
12. **ROADMAP rendering contract** — render algorithm codified in `strategy-work-organization.md`;
    ROADMAP.md regeneration steps added to graduate/activate/integrate workflows; interim
    hand-maintenance discipline documented; `plan-roadmap-evolution.md` retirement (deletion plus
    reference sweep). CLI command implementation deferred (downstream WU).
13. **META-PRD redesign — shape + content** — `template-meta-prd.md` shape codification (Mission,
    numbered principles, anti-goals, problem statement, design tradeoffs); ceremony integration
    steps in `1_create-prd.md`, `activate-work-unit.md`, `integrate-work-unit.md`; this repo's
    META-PRD content rewrite (dogfooding pass); README + AGENT-BRIEF.PROJECT references.
14. **PROJECT-STATUS retirement + archive shape consolidation** — `.arc/reference/PROJECT-STATUS.md`
    deletion (content not carried forward logged in commit message); new archive shape
    `archive/<dated>/{wu-name}/` (drop `{category}/` subdir for new entries; historical
    untouched); backward-compat tooling requirement codified; reference integrity sweep.
15. **Migration sweep** — flatten/classify existing `backlog/feature/` and `backlog/technical/`
    contents into `backlog/plans/{planned,provisional}/` per ROADMAP-inclusion test; one-time
    cleanup of any leaked Planning-state `status-*.md` files in `active/` on main; inbox renames
    and merges (`ATOMIC-INBOX` → `USER-INBOX`, `BACKLOG-FEATURE`/`-TECHNICAL` → `BACKLOG-INBOX`);
    in-flight meta-file rename, Origin-field backfill, State recodification, Owner backfill,
    Depends On initialization; doc retirements (`plan-roadmap-evolution.md`,
    `plan-completion-status-consolidation.md`, `template-completion-doc.md`, `PROJECT-STATUS.md`).
16. **External research** — Conventional Branch spec adoption patterns, planning-review opt-in
    patterns from comparable methodologies, single-branch lifecycle examples (Stripe, Google, GitLab).
    Roadmap/PROJECT-STATUS/META-PRD pattern survey already complete (Linux/Postgres,
    Rust/Kubernetes, solo-to-small-team OSS; vision-doc idiomatic practice; CHANGELOG
    conventions; dependency/parallelism expression). Remaining research validates Conventional
    Branch and planning-review opt-in conventions against industry idiom.
17. **Documentation / tests / examples** — standard closing phase.

Phase 1 gates everything else. Phases 2-3 sequential (convention precedes workflows). Phase 4
depends on Phase 3. Phase 6 depends on Phase 5 (field codification rides the rename). Phase 7
depends on Phases 5-6 (consolidation needs the meta rename + field set settled). Phase 12
depends on Phase 6 (rendering reads codified fields). Phase 13 depends on Phase 12 (META-PRD
ceremony integration touches the same workflows ROADMAP rendering does). Phase 14 depends on
Phases 7 + 13 (PROJECT-STATUS function decomposition needs Release Notes Entry + META-PRD
landed). Phase 15 depends on Phases 6, 7, 12, 13, 14 (consolidates all migrations). Phase 16
can parallel; Phase 17 closes. Phases 8-11 mostly independent of the META-PRD/ROADMAP track;
can parallel with 12-13.

---

## External Research Citations

Sources captured from research passes informing WOR's design. Interim retention — PRD graduation
trims to load-bearing references only.

### Conventional Branch type-set scrutiny

- [Conventional Commits Specification](https://www.conventionalcommits.org/en/v1.0.0/)
- [Conventional Branch Specification](https://conventional-branch.github.io/) — intentional-scarcity
  philosophy; rejects expansion beyond core types
- [DEV Community: Simplified Git conventions](https://dev.to/varbsan/a-simplified-convention-for-naming-branches-and-commits-in-git-il4)
- [kindatechnical: Branch naming standards](https://kindatechnical.com/git-version-control/branch-naming-conventions.html)
- [Pull Panda: CI/CD branch practices](https://pullpanda.io/blog/git-branch-naming-conventions-best-practices)
- [ToolsMint 2026: Git branch conventions](https://www.toolsmint.com/learn/git-branch-naming-conventions)

### Single-branch lifecycle / trunk-based context (pre-agent corpus, with conflation caveats)

- [Trunk Based Development](https://trunkbaseddevelopment.com/)
- [Short-Lived Feature Branches](https://trunkbaseddevelopment.com/short-lived-feature-branches/)
- [Atlassian: Trunk-based development](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development)
- [How Google Does Monorepo (QE Unit)](https://qeunit.com/blog/how-google-does-monorepo/)
- [Design Docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/)
- [Adopting a Structured RFC Process at Diamond](https://blog.diamond.la/adopting-a-structured-rfc-process)
- [Phil Calcado: A Structured RFC Process](https://philcalcado.com/2018/11/19/a_structured_rfc_process.html)
- [Increment: Planning with RFCs](https://increment.com/planning/planning-with-requests-for-comments/)

These sources document pre-agent industry idiom. ARC's single-branch-per-WU model is novel atop a
different substrate (agent-native markdown-in-repo planning); these sources establish what mental
model adopters trained on big-shop trunk-based dev will bring, not what ARC's pattern is measured
against.

### Planning-review opt-in patterns (pre-agent corpus)

- [Rust RFC Process](https://rust-lang.github.io/rfcs/0002-rfc-process.html)
- [Python PEP Guidelines](https://peps.python.org/pep-0001/)
- [Kotlin language evolution](https://blog.jetbrains.com/kotlin/2024/10/the-evolution-of-the-kotlin-language-and-how-emyou-em-can-contribute/)
- [Ember RFC Stages](https://rfcs.emberjs.com/id/0617-rfc-stages/)
- [Cursor: Agent Best Practices](https://cursor.com/blog/agent-best-practices)
- [Aider: Coding Conventions](https://aider.chat/docs/usage/conventions.html)
- [SQLite Engineering](https://dev.to/lovestaco/sqlite-a-simple-database-with-serious-engineering-inside-31dp)

### Agentic-coding idiom and planning-artifact storage (2024+)

- [Anthropic: 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf)
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [On the Impact of AGENTS.md Files (arxiv)](https://arxiv.org/html/2601.20404v1) — 60K figure
  sourced externally from agents.md, not from independent measurement
- [Claude.md - On the Use of Agentic Coding Manifests (arxiv)](https://arxiv.org/html/2509.14744v1)
- [GitHub Spec Kit overview](https://developer.microsoft.com/blog/spec-driven-development-spec-kit)
- [Applied BMAD - Reclaiming Control](https://bennycheung.github.io/bmad-reclaiming-control-in-ai-dev)
- [Linear MCP Server](https://github.com/tacticlaunch/mcp-linear)
- [Notion hosted MCP server](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look)
- [Cognition: Devin 2.0](https://cognition.ai/blog/devin-2)
- [Devin 2025 Performance Review](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [Why Cursor Rules Failed and Claude Skill Succeeded](https://lellansin.github.io/2026/01/27/Why-Cursor-Rules-Failed-and-Claude-Skill-Succeeded/)
- [Karpathy: 2025 LLM Year in Review](https://karpathy.bearblog.dev/year-in-review-2025/)

### Inter-WU planning concurrency

- [AgenticFlict dataset (arxiv)](https://arxiv.org/html/2604.03551) — measures intra-WU code-level
  merge conflicts only (27.67% rate); does not measure planning-artifact concurrency
- [Scaling Human-AI Coding Collaboration Requires a Governable Consensus Layer (arxiv)](https://arxiv.org/html/2604.17883v1)
  — project-wide structural governance scope; does not address inter-WU planning freshness
- [Using Git Worktrees for Multi-Feature Development](https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/)
- [Simon Willison: Parallel coding agents](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)
- [Claude Code branching feature request (GitHub)](https://github.com/anthropics/claude-code/issues/32631)
- [Worktrunk CLI](https://worktrunk.dev/)
- [Cursor 2.0 hierarchical coordination](https://cursor.com/blog/scaling-agents)
- [Slack engineering: managing agent context](https://slack.engineering/managing-context-in-long-run-agentic-applications/)
- [SiliconAngle: Agentic coding comes to Slack (Dec 2025)](https://siliconangle.com/2025/12/08/agentic-coding-comes-slack-anthropic-launches-claude-code-integration/)
- [MindStudio: Context rot in agentic systems](https://www.mindstudio.ai/blog/context-rot-ai-coding-agents-how-to-prevent)

---

## Activation Audit

When this WU activates, audit plan content against current framework state for drift. Known concerns
as of 2026-05-12:

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
- **Plans absorbed/retired by WOR:** verify `plan-completion-status-consolidation.md` and
  `plan-roadmap-evolution.md` haven't drifted since absorption decision. Re-read at activation;
  fold any new content into WOR scope or surface as scope deltas before PRD drafting.
- **PROJECT-STATUS.md content audit:** grep `.arc/reference/PROJECT-STATUS.md` for content not
  decomposed by item 21's mapping (Release Notes Entry / META-PRD / directory query). Anything
  not covered surfaces as a scope-gap at PRD time. Today's known content overlaps with what the
  new artifacts carry; audit confirms.
- **META-PRD content survey:** read existing `.arc/META-PRD.md` before content rewrite (item 18,
  Phase 13). Preserve any content that the new shape (Mission / principles / anti-goals /
  problem / tradeoffs) genuinely subsumes; surface anything that doesn't fit the new shape as a
  scope question — either revise the shape or carry the content forward in a different
  artifact.
- **Cross-references to retired artifacts:** grep `PROJECT-STATUS.md`, `plan-roadmap-evolution`,
  `plan-completion-status-consolidation`, `template-completion-doc`, `completion-*.md` for
  reference surface that needs update or retirement at PRD time.
- **CLI tooling capture verification:** confirm Dependencies and Sequencing § "Downstream — CLI
  tooling capture (must not be lost)" entries are captured in target downstream WU plan-docs
  (or scoped as a new tooling WU). The `arc roadmap render` capture is particularly load-bearing
  — interim hand-maintenance is acceptable but degrades over time.
- **Scope-size review:** WOR's scope has grown through three research-driven absorptions; PRD
  drafting should evaluate whether the WU needs split before PRD promotion. See Pressure Points
  § "Scope growth — research-driven absorption."

---
