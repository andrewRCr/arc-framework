# Metadata: decomposition-hardening

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/decomposition-hardening` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decomposition-hardening.md`
- **Task List:** `tasks-decomposition-hardening.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 6 complete — Task 6.1 completed verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC lifecycle transforms now operate against composed project truth and finish through typed, receipt-backed
reconciliation and cleanup. Decomposition supports flat sibling cuts without a cohort, while rename, abandon,
and decompose conserve dependent references across worktrees.

### Added

- A version-checked `arc wu reconcile` plan/apply surface for repairing a work unit's own dependencies and
  mechanically rewritable references from authoritative retirement evidence.
- Cohortless decomposition placement for flat sibling cuts joined only by dependency edges.
- Session-entry discovery of landed transform residue, deferred rename moves, and ready decomposition successors.

### Changed

- Lifecycle transforms resolve semantic inventories across the composed project view while limiting writes to
  exact current-checkout projections.
- Retirement records use the canonical internal receipt namespace, versioned evidence, and authenticated
  subject-specific discovery.
- ROADMAP regeneration follows the complete staged transition instead of live branch timing.

### Fixed

- Branch-private dependents no longer retain silent dangling references after rename, decompose, or abandon.
- Transform cleanup waits for landed evidence and remains replayable across branch, worktree, and user-workspace
  legs; parked abandon preserves its branch until that authority exists.
- Spawned rename operations no longer move a live worktree from beneath its running session, and exact artifact
  identity headings remain aligned with renamed files.
- Failed reconcile and retirement operations restore exact worktree and index state instead of leaving partial
  mutations.

## Completion Notes

Delivered the four designed substrate areas as one shared lifecycle implementation: composed cross-worktree truth
and dependent-owned reconciliation, cohortless decomposition, receipt-backed transform terminals, and deterministic
reference and readiness projection. Decompose, rename, abandon, and park now share the same authority boundaries
without introducing new lifecycle-state vocabulary or a second merge-readiness criterion.

Planning widened the original decomposition-specific concern after the same parallel-worktree failure classes were
confirmed across the transform family. The implementation extended the existing composed index, lifecycle executor,
retirement receipt, notes-lock, and teardown mechanisms; it did not add a parallel store, lock system, or cleanup
engine. The separate retirement-record relocation concern was absorbed because record versioning, discovery, and
namespace authority were inseparable from the hardened receipt contract.

Review-driven corrections strengthened exact-index rollback, receipt enumeration and replay, mixed dependent
reconciliation, session and lifecycle failure handling, and parked-branch retirement authority. The final
correction preserves a parked branch until its unchanged retirement projection lands on base and suppresses
teardown guidance when a branchless retirement has no cleanup leg.

Verification covered unit, integration, E2E, portability, lint, type checking, and production build paths. The
final code tree passed 7,969 tests with one intentional skip, including real-Git coverage of pre-landing teardown
refusal and post-landing parked-branch cleanup.
