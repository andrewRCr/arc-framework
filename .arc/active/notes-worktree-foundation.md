# Notes: Worktree Foundation

Implementation-reference detail carried from planning that the PRD doesn't fully spell out. Read alongside
`spec-worktree-foundation.md` during task generation and execution.

## Lifecycle workflow touch-points (detail beyond R28)

- **`integrate-work-unit`** — a worktree cannot remove itself, so the removal runs from the **main**
  worktree. This composes with the batched-archive step (archive also runs in main): once the merge lands,
  the WU worktree is removable immediately. Keep the removal phrasing **origin-agnostic** — ARC-spawned and
  externally-spawned both reach the same advisory/offer, gated by the R29 marker.
- **`activate-work-unit`** — the branch rename (`plan/x` → type-prefix) runs *inside* the WU's worktree; the
  **worktree path is unchanged** by the rename (paths are creation-time artifacts, R26). `arc user open`
  reappearing here is **benign idempotence, not a leak**.
- **`init-work-unit`** — stays planning-welded; the life-phase generalization (Planning vs. Active at
  creation) is **AWL's seam**, not WF's. WF adds only the worktree-creating mode.
- **`archive-work-unit`** — worktree-neutral / low-risk: its sweep already lands on the WU branch before
  merge. Not separately reworked.

## Operational constraint (content for the R31 main-on-main strategy doc)

- **One worktree per IDE / language-server window.** Cross-worktree IDE/LSP coordination is largely outside
  ARC's control; document the constraint rather than engineer around it.
