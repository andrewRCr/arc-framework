# Atomic Tasks — Session-Init Optimization

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [x] **Strip spurious extension-point marker from `integrate-work-unit.md` step 5** —
  Discovery during 3.R.k.b end-to-end sanity: the new `arc extensions status --all`
  flagged `pre-merge-inbox-review` (at `integrate-work-unit.md:166`) as an orphan.
  Root cause: step 5's heading carried the extension-point marker suffix
  (middle-dot plus backtick-hashtag name) for parallel visual structure with step
  6 (Pre-Merge Review), but step 5 is a PM-mode-conditional step with no
  `.actions` dispatch and no active-extensions list reference. The marker's
  contract (extension fire point) didn't apply. Fix: drop the suffix from step
  5's heading; markdown slug autogeneration preserves the
  `#pre-merge-inbox-review` anchor for link targets. Two-copy sync across `.arc/`
  and `packages/arc-framework/arc/`. Scanner now reports 0 orphaned refs repo-wide.

- [x] **D7a `.template.md` fallback in `validate-links.sh`** — D7a (Task 3.4) checked staged
  links against on-disk file existence but had no awareness of the package source's
  `.template.md` rename convention. Surfaced when Task 3.5's edits restaged
  `activate-work-unit.md` / `archive-work-unit.md` / `prepare-commits.md` /
  `strategy-session-operations.md` in `packages/arc-framework/arc/`: links targeting
  `session-init.md`, `session-handoff.md`, `3_process-task-loop.md`,
  `2_generate-tasks.md` failed because the source-tree files carry the `.template.md`
  suffix. Fix: in `validate_target()`, when a `.md` target doesn't exist, try
  `<base>.template.md` before emitting a diagnostic. Existence-based fallback — no
  source-location gating needed since `.arc/` carries no `.template.md` files. Two-copy
  sync to both script copies. Two new integration tests in `validate-links.test.ts`
  (happy-path fallback resolution + negative confirms fallback doesn't mask real
  breakage).
