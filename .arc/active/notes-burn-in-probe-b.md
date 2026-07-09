# burn-in-probe-b Evidence Log

## Spawned-Worktree Boot

- `burn-in-probe-b` is running in linked worktree
  `/home/andrew/dev/repos/github.com/andrewRCr/arc-framework.burn-in-probe-b`.
- The worktree booted through `arc-session` after being spawned for the Wave 1 burn-in fixture.
- The branch has been activated as `chore/burn-in-probe-b` and tracks `origin/chore/burn-in-probe-b`.
- Planning artifacts exist under `.arc/active/`: `meta-burn-in-probe-b.md`,
  `spec-burn-in-probe-b.md`, and `tasks-burn-in-probe-b.md`.

## Notes Save/Load Convergence

- Baseline before the first handoff: `SESSION-NOTES.md` was seeded on disk for this work unit
  but had not yet been saved to the notes ref.
- After the July 9 resume and notes/sync fixes merged from `main`, `npx arc status --session-init --json`
  reported `state: clean`, `refState: same`, `localNoteFreshness.state: current-head`, and latest local
  user note `edc952d9`.
- Session-init detail lines: "Remote notes match local notes." and "Latest local user note is current with HEAD."
- `SESSION-NOTES.md` records that the notes-clobber fix is present in this worktree and a controlled
  `arc user save` -> `arc user sync` converged clean, with no resurrected tombstones.

## ROADMAP/Base Contention

- Activation refreshed `ROADMAP.md` and moved `burn-in-probe-b` from `Planning` to `Active` in the
  In Flight table.
- Base drift had already been reconciled by merging `main` before planning continued; no current
  base-overlap conflict was observed at activation.
- A later `main` merge into `chore/burn-in-probe-b` landed at `edc952d9` after project-state and notes/sync
  fixes. The merge reported a `ROADMAP.md` conflict, which was resolved before this resume; the worktree is
  currently clean and tracking `origin/chore/burn-in-probe-b`.

## Integration Ordering

- Not yet exercised.

## Cross-Worktree Notes Interleave (Wave-1 Induction)

- This commit is the deliberately-unpushed branch anchor for the wave-1 cross-worktree notes interleave: a
  probe-b note is saved at this commit while it exists only locally, the sibling worktree then runs its paired
  push, and the export gate's treatment of the unpushed-anchored note is observed before this branch pushes.

## Archival/Worktree Cleanup

- Not yet exercised.

## Observations Not Exercised

- Integration ordering remains open until the WU enters integration.
- Archival and worktree cleanup remain open until after integration.
