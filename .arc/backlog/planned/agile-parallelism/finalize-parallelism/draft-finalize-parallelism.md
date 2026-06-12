# Draft: Finalize Parallelism

- **Cohort:** agile-parallelism
- **Origin:** [internal]
- **Purpose:** Own the end-to-end verification and GA gate for ARC's parallelism story — worktree-by-default,
  multiple in-flight work units + errands, and cross-machine resume — delivered across ~6+ work units in two
  cohorts that each ship and integrate independently. Shipping all members is not the same as a
  verified-watertight-end-to-end system; this is the cohort closeout that proves the seams between independently
  shipped members and blesses the worktree-by-default flip for general use.

---

## Problem / Motivation

Parallelism is delivered piecemeal: worktree-default, multi-in-flight WUs/errands, and cross-machine coherence
span the `concurrent-work-conventions` and `cross-machine-coherence` cohorts plus `out-of-wu-entry`, each landing
on its own schedule. Seams *between* those members will otherwise only surface in actual multi-WU practice — the
friction-after-the-fact this closeout exists to pre-empt. Nothing today owns the end-to-end verification or a
GA-readiness checklist; per-cohort closeout criteria are narrower than the cross-cohort whole.

## Scope (audit + verify + flip + gate — NOT a redesign catch-all)

- **End-to-end trace-through** of every parallelism path — start/discovery → `init-work-unit` (worktree spawn) →
  planning → execution → integration / merge / completion → cross-machine resume — hunting seams *between* the
  independently shipped members. Known seam suspects:
    - the three-remover `USER-INBOX`-line reconciliation (`run-errand` § Complete, same-session finalize,
      session-init errand sweep);
    - the projection-builder consumer contract between `async-merge-lifecycle` and `cross-machine-sync-coherence`;
    - base-drift across worktrees;
    - errand-vs-WU teardown symmetry.
- **Verify the worktree-default flip in real practice** — `async-merge-lifecycle` *lands* it (create-new
  `arc start` + `init-work-unit` default); this WU *exercises* it across genuinely concurrent WUs.
- **Own the parallelism GA-readiness checklist** — the single enumeration of what-must-be-true for
  worktree-by-default + multi-in-flight to be blessed. Exists nowhere today.

## Resolution model for discovered seams

This WU **gates** completion, so it cannot route a fix back to an already-shipped owning WU. For each seam found:

- **Absorb-if-relatively-atomic** into this WU's own spec / task list as a general "resolve discovered seams"
  phase; **else**
- **Spawn a direct follow-up WU draft** as an explicit dependency.

(Hope it isn't needed; plan for it.)

## Dependencies

Explicit — it is the closeout:

- `concurrent-work-conventions` members: `concurrent-work-doctrine` (shipped), `merge-safety-mechanism` (shipped),
  `async-merge-lifecycle`, `single-owner-wu-model`.
- `cross-machine-coherence` members: `cross-machine-sync-coherence`, `coord-probe`.
- `out-of-wu-entry`.
- The worktree-default flip (within `async-merge-lifecycle`'s scope).

Natural **agile-parallelism cohort closeout** — the cohort archives on its ship.

## Scope Estimate

Large (week+) — broad cross-cohort surface; size firms up once the member set has substantially shipped and the
real seam count is visible.
