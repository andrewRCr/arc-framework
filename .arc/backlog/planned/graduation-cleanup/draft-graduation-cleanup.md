# Draft: Graduation Cleanup

- **Origin:** Extracted from the retired `arc-plan-conductor` draft (§ 19) at the conductor decomposition
  (2026-06-12). It was never conductor-specific — it applies to all planning regardless of modality — so it
  graduates to a standalone planning-lifecycle ceremony.
- **Purpose:** Preserve implementation history on `main` while dropping planning noise from a WU branch's history
  at the Planning → Active state transition (and at park). Applies universally to all WUs that had a planning
  phase, regardless of synthesis modality.

---

## Why this exists

Under the single-branch-per-WU model, planning commits (`draft-*` iteration, spike commits under prototype
modality, ceremony commits) and execution commits (per-task atomic implementation commits) all accumulate on the
same branch. ARC's merge-commit PR strategy preserves individual commit history on `main`, which is essential for
the per-task atomicity discipline (traceability via Conventional Commits + context footers).

Without intervention, planning noise lands on `main` alongside implementation history. Modest under document
modality (a handful of `draft-*` iteration commits); substantial under prototype modality (spike commits can
dominate the planning phase in count). The cleanup ceremony rewrites the WU branch's history at graduation to
drop planning-noise commits while preserving meaningful planning-ceremony commits and leaving all execution
commits untouched (they haven't started yet at this point).

## State-gated execution

The ceremony fires at exactly one point in the WU lifecycle: the meta-file `**State:**` field flips from
`Planning` to `Active`. That flip is the binding gate — cleanup completes before state changes, so the state flip
itself is the workflow's completion signal.

Concrete ordering:

1. User signals readiness for state-flip (spec is locked, task list generated)
2. Pre-ceremony tag created: `pre-graduation-{wu-name}` for recovery
3. User reviews proposed rebase plan (commits to drop vs. keep)
4. User approves; interactive rebase executes
5. Branch is force-pushed (`--force-with-lease`) to remote
6. Meta-file `**State:**` flips Planning → Active; task list becomes active
7. Workflow-interlock fires; commit-interlock releases the state-flip commit

## Pattern-based drop rules

Default rules (refine at this stub's spec):

| Pattern                                              | Disposition                       |
|------------------------------------------------------|-----------------------------------|
| `chore(spike): ...`                                  | **Drop**                          |
| `chore(draft-iter): ...` or micro-edits to `draft-*` | **Drop**                          |
| `chore(plan): graduate draft → spec`                 | **Keep**                          |
| `chore(tasks): generate task list`                   | **Keep**                          |
| `chore(planning): ...` ceremony commits              | **Keep**                          |
| Anything not matching a drop pattern                 | **Keep** (conservative default)   |

Cleanup is conservative-by-default — only commits matching known noise patterns are dropped. Anything else stays.

## Configurable cleanup modes

Three modes, configurable per project (or per-invocation override):

| Mode                       | Behavior                                                                                            |
|----------------------------|-----------------------------------------------------------------------------------------------------|
| **Conservative** (default) | Drops only known noise patterns; user reviews and confirms the rebase plan before execution         |
| **Interactive**            | Shows the full commit list; user marks drop/keep per-commit                                         |
| **Off**                    | No cleanup; state-flip happens with planning history intact                                         |

## Safety mechanisms

The ceremony is a destructive operation on git history. Safety layers:

1. **Pre-ceremony tag** (`pre-graduation-{wu-name}`) preserves the pre-cleanup branch tip; recovery is
   `git reset --hard <tag>` if needed
2. **Reflog preservation** — git's reflog retains the original commits for 90 days under default config;
   rebased-away commits are recoverable from reflog
3. **User approval gate** — the rebase plan is surfaced before execution; user can abort or edit the plan
4. **`--force-with-lease`** on remote push — prevents overwriting unexpected remote state; ad-hoc `--force` is
   never used

## Workflow integration

Standalone workflow `graduation-cleanup.md` (or integrated as a final step in the spec-creation workflow; spec
decision). Invoked by the graduation workflow as the final step before state-flip; can also be invoked manually
if a user wants to clean up mid-planning before the natural graduation point.

Under release-wrapper routing, the state-flip commit fires through the `workflowCommit` class tag (already exists
in ARC's routing model) — the cleanup ceremony slots into existing infrastructure.

## `Class` interaction

- **Atomic (errand)**: no planning phase → no ceremony fires
- **`Light`**: minimal planning → ceremony likely no-op in most cases (still safe to run; just little to clean)
- **`Heavy` / `Novel`**: ceremony fires; primary benefit case

## Edges

- **Git-notes orphaning.** ARC's user-notes attach to commit SHAs via `refs/notes/arc/user/{identity}`. Dropping
  planning commits orphans their notes (still exist on the notes ref, unreachable from new branch tips). The next
  `arc user save` creates a fresh note on the new head; content isn't lost — just the SHA-pinned connection to the
  dropped commits. Acceptable degradation; documented in the workflow.
- **Force-push as ceremonial act.** ARC's existing commit-discipline permits `--force-with-lease` on feature
  branches with explicit user request. The cleanup ceremony is the *codified* form: explicit user approval gate,
  `--force-with-lease` always, never `--force`. Distinct from ad-hoc force-pushes.
- **"Ceremony" vs. "noise" boundary.** Initial pattern-rules cover the obvious cases. Spec work calibrates the
  boundary further — particularly the `chore(planning):` prefix's semantics and whether `draft-*` micro-edits get
  a distinct prefix or share one.

## Scope and sequencing

The cleanup ceremony is not prototype-modality-specific — it applies to all planning, including pure document
modality. Prototype modality (see `synthesis-modality`) creates the strongest case for it (spike commits are
higher-volume noise than `draft-*` iteration), but the ceremony is a universal improvement; the design dependency
is the modality-introduction that lifts noise volume to where cleanup is clearly worthwhile, not strict workflow
coupling.

**Seam with the merge gate.** The `concurrent-work-conventions` cohort already flags spec-graduation cleanup vs.
the lighter merge gate as a coordination point — settle which ceremony owns history-rewrite at which lifecycle
boundary before committing this stub's scope.

**Composition with park.** `graduation-cleanup` composes with park naturally: cleanup fires on park too, dropping
planning-iteration noise from history before merging to main, same shape as Planning → Active. See
`park-resume-lifecycle`.

## Scope Estimate

Small–Medium (days) — a single new workflow file across the package source and `.arc/` copy, plus drop-rule
calibration and the merge-gate seam resolution. No new code surface beyond the workflow.
