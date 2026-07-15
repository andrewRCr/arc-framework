# Metadata: worktree-teardown-decoupling

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-worktree-teardown-decoupling.md`
- **Task List:** `tasks-worktree-teardown-decoupling.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Verify completion
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/246>
- **Completed:** 2026-07-14

---

## Release Notes Entry

ARC now preserves a live terminal session when a shipped work unit tears down its own linked worktree. The session
continues in a detached, disposable husk while ref cleanup completes, and physical removal moves to a safe outside
caller or a later primary-worktree cleanup offer.

### Added

- Typed terminal subjects and exact-HEAD husk stamps for ARC-owned worktrees, with fail-closed replay and cleanup
  decisions.
- Primary-worktree sweep reporting and current-session orientation for stamped detached husks.

### Changed

- Linked self-teardown now preflights preservation and user surfaces, detaches the current worktree, reaps refs, and
  leaves the invoking directory intact.
- Session initialization distinguishes stamped husks from ordinary detached checkouts and routes ARC-managed cleanup
  through typed `arc teardown` commands.

### Fixed

- Detached-husk replay preserves identity-global user files written after husk creation and refuses physical removal
  when those files cannot be reconciled safely.
- Ref-delete failures retain truthful retry state without deleting the live session or promising automatic cleanup for
  externally managed husks.

## Completion Notes

The shipped teardown path now separates logical completion from physical worktree disposal. A linked worktree that
tears itself down proves preservation and user-surface safety before any directional mutation, detaches at the exact
terminal commit, extends an existing ARC ownership marker when possible, and proceeds with presence-guarded local,
remote, and prune operations. The primary and already-absent paths remain unchanged.

Detached replay and primary-side sweep discovery share typed subjects, exact stamped branch projections, and the same
clean/exact-HEAD removability oracle. Outside replay performs a final identity-global user-surface reconciliation
before removal, covering writes made by a still-live husk after its initial transition. CLI and session-init surfaces
distinguish created husks, outside disposal, retained refs, refusal causes, and ordinary detached worktrees without
widening the branch-only roster contract.

The implementation deliberately leaves markerless, malformed-marker, and stamp-write-failure husks externally
managed; ARC never mints provenance during teardown. The marker schema reserves an errand subject, but wiring a
separately spawned errand driver remains outside this work. Occupancy-aware automatic disposal and bounded
parallelization of detached scans were routed to `session-locus-model`; this work keeps cleanup offer-only when live
session occupancy is unknown.

Verification covered the marker schema, topology scan, cleanup oracle, self-husk transition, exact replay identity,
retry behavior, user-surface preservation, stale-worktree sweep, session-init orientation, workflow rendering, and
real Git/CLI paths. The final local suite passed 5,370 tests with one intentional skip; Markdown, TypeScript, and shell
lint, full type checking, build, portability CI, and integration/E2E CI passed. CodeRabbit's incremental review of the
final implementation produced no new actionable findings, and all review threads were resolved.
