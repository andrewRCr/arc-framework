# burn-in-probe-b Evidence Log

## Spawned-Worktree Boot

- `burn-in-probe-b` is running in linked worktree
  `/home/andrew/dev/repos/github.com/andrewRCr/arc-framework.burn-in-probe-b`.
- The worktree booted through `arc-session` after being spawned for the Wave 1 burn-in fixture.
- The branch has been activated as `chore/burn-in-probe-b` and tracks `origin/chore/burn-in-probe-b`.
- Planning artifacts exist under `.arc/active/`: `meta-burn-in-probe-b.md`,
  `spec-burn-in-probe-b.md`, and `tasks-burn-in-probe-b.md`.

## Notes Save/Load Convergence

- Current baseline before the first handoff: `SESSION-NOTES.md` is seeded on disk for this work unit
  but has not yet been saved to the notes ref.
- Session-init reported: "SESSION-NOTES seeded on disk for this work unit; not yet saved to the
  notes ref (saves at first handoff)."
- Convergence after handoff/resume is not yet exercised.

## ROADMAP/Base Contention

- Activation refreshed `ROADMAP.md` and moved `burn-in-probe-b` from `Planning` to `Active` in the
  In Flight table.
- Base drift had already been reconciled by merging `main` before planning continued; no current
  base-overlap conflict was observed at activation.

## Integration Ordering

- Not yet exercised.

## Archival/Worktree Cleanup

- Not yet exercised.

## Observations Not Exercised

- Handoff-to-resume notes convergence remains open for Task 1.2.
- Integration ordering remains open until the WU enters integration.
- Archival and worktree cleanup remain open until after integration.
