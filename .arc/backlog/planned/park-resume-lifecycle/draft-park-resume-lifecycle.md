# Draft: Park / Resume Lifecycle

- **Origin:** Extracted from the retired `arc-plan-conductor` draft (§ 20) at the conductor decomposition
  (2026-06-12). The conductor framed park/resume around its own worktree-spawn flow; with worktree orchestration
  now shipped (WU spawn via `init-work-unit`, errands via `run-errand`), park/resume stands as its own
  planning-lifecycle pair.
- **Purpose:** Codify two symmetric inverse operations — **park** (`Planning → backlog/{state}/<wu-name>/`) and
  **resume** (`backlog → Planning`) — so planning that pauses indefinitely relocates to backlog *with* visibility,
  instead of orphaning worktrees and branches. Planning often pauses at first-pass synthesis and returns weeks or
  months later; park/resume is the codified flow for that.

---

## The two operations

- **Park** (`arc-plan --park`) — `Planning → backlog/{state}/<wu-name>/`. PR + merge to main with draft-doc +
  meta-file landing in the per-WU backlog subdir; branch + worktree cleanup follows. Meta-file `**State:**` stays
  `Planning`; `**Branch:**` clears to `[none]`. Commitment level lives in dir choice (`provisional/` vs
  `planned/`) — user picks at park time.

- **Resume** (`arc-plan <wu-name>` when `<wu-name>` resolves to a backlog subdir) — spawn worktree, create new
  `plan/<wu-name>` branch, `git mv backlog/{state}/<wu-name>/* active/`, reconcile meta-file `**Branch:**` field.
  Continue planning at chosen depth + modality.

Park makes parked WUs **more visible**, not less. The ROADMAP renderer picks them up when `planned/`;
`ls backlog/{state}/` shows them; `arc-plan` resolves them by name. Indefinite orphan worktrees + branches are
the wrong default — they hide parked work and accumulate dead refs.

`graduation-cleanup` composes with park naturally: cleanup fires on park too, dropping planning-iteration noise
from history before merging to main, same shape as Planning → Active.

## `Class`-aware applicability

- **`Heavy` / `Novel`** — primary case. Substantial planning that may pause for weeks or months between
  first-pass synthesis and spec-ready maturity. Park/resume is the dominant flow.
- **Atomic (errand)** — skips entirely (no planning phase to park).
- **`Light`** — rarely parks (planning is light enough that direct flow to impl is the norm). Available but
  uncommon; park supports the case where `Light` planning surfaces `Heavy` complexity and the user wants to step
  back before promotion.

## Cross-worktree coordination

Park PR landing on main is structurally identical to any other PR — concurrent WU worktrees see main advance by
one commit, same as any integration. No special coordination needed; standard "pull main before integrating"
discipline (codified in `concurrent-work-conventions`) covers it. If the parked WU was on ROADMAP (`planned/`
destination), the park PR also regenerates ROADMAP — same one-line touch as any ROADMAP-regen commit.

## Workflow shape (spec-time codification)

Two new workflow files: `park-work-unit.md` (Planning → backlog) and `resume-work-unit.md` (backlog → Planning),
invoked by `arc-plan`. Spec work codifies:

- **Park ordering** — graduation-cleanup → state + field updates → file moves → PR + merge → branch + worktree
  cleanup
- **Resume ordering** — backlog lookup → worktree spawn → branch creation → file moves → meta-file reconcile →
  ROADMAP regen (if `planned/`) → planning resumption
- **Idempotency contracts** — partial park / partial resume handling
- **State transitions** — `**State:**` stays `Planning` across both operations; `**Branch:**` field is the
  lifecycle pointer
- **Resume-to-activate path** — resume followed immediately by `create-spec.md` + `activate-work-unit.md` when the
  parked draft is already spec-ready (no further planning needed)

## Relationship to `init-work-unit.md`

`init-work-unit.md` Step 3 handles the graduate-from-backlog case. Once `resume-work-unit.md` lands,
`init-work-unit.md` may become a sub-procedure of `arc-plan` (handling the mechanical branch + meta-file
scaffolding while `arc-plan` owns upstream intent assessment) or retire entirely — spec-time decision based on
whether direct-invocation paths remain useful alongside `arc-plan` invocation.

**DRY constraint (resume half).** `init-work-unit.md` Step 3 already performs resume's mechanical half —
`git mv backlog/{state}/{name}/* → active/`, branch creation, `**Branch:**` reconcile. `resume-work-unit.md` must
call that primitive, not re-implement it; the file-move/branch logic stays in exactly one place. This biases the
resolution toward the sub-procedure path (resume delegates the mechanics; `arc-plan` owns upstream intent) over a
second workflow that duplicates the moves.

**Life-phase-agnostic init (open).** `init-work-unit.md` is currently planning-only — it hardcodes the
`plan/{name}` branch and sets `**State:** Planning`. An atomic (errand) or direct-impl WU that skips Planning has
no codified init through it. When this stub iterates, decide whether init should accept a life-phase parameter
(Planning vs Active → branch-prefix follows) or whether atomic-WU init is a distinct entry path (e.g.,
`arc start`).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's first planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **`park-work-unit.md` / `resume-work-unit.md` reuse decompose-work-unit's park blocks**

- *Routed from:* `arc-plan-conductor` draft Inbound Buffer (origin: `decomposition-machinery` task-generation
  grounding audit 2026-06-09, Phase 4 / F5), re-homed here at the conductor decomposition (2026-06-12).
- *Concern:* `decompose-work-unit` (shipping ahead of this stub) authors the `active/ → backlog/` + park-PR +
  worktree-kind-teardown choreography single-source, as named extractable blocks — because no `park-work-unit.md`
  exists yet. decompose is park-*shaped* but not park (it deletes the origin / transforms it into a cohort), so it
  uses only the sub-mechanic, not a park workflow.
- *Scope:* when this stub authors `park-work-unit.md` / `resume-work-unit.md`, reuse decompose-work-unit's
  `active/ → backlog/` + teardown blocks (stable-heading-slug reference, or mechanical include once
  `composable-workflows` lands) rather than re-authoring — consistent with the "must call the primitive, not
  re-implement it" discipline above. This is the **inverse half's** shared source: resume's backlog→active half
  already reuses `init-work-unit` Path A; park's active→backlog half reuses decompose's teardown blocks.
