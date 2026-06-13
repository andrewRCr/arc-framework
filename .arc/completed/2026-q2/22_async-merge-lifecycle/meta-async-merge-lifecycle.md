# Metadata: async-merge-lifecycle

| **State**     | **Owner** | **Branch**                   | **Class** | **Priority** |
| ------------- | --------- | ---------------------------- | --------- | ------------ |
| `Shipped`     | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Task 7.1 — verification: full Tier 3 quality gates passed, all 8 success criteria
  validated against the spec; closes Phase 7 (the final phase). The WU is verified and ready for integration.
- **Next Task:** [none] — task list complete.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion.

---

## Release Notes Entry

ARC now handles work-unit and errand completion when a pull request merges outside an attended integration
ceremony. Session start surfaces your in-flight work units across the completion tail, the integration ceremony
can be suspended and resumed across the review wait, and post-merge cleanup of branches, worktrees, and saved
notes stays consistent whether you merge in-session or the merge lands unattended.

### Added

- Session start surfaces owned work units across the completion tail (awaiting review / mergeable / blocked /
  merged-and-unarchived), with a once-per-day staleness reminder; the same view is available from `arc status`.
- A same-session pass finalizes a pull request that merges mid-session — tearing down its branch and worktree,
  pruning the stale remote-tracking ref, and clearing its inbox capture — and surfaces a failed or blocked PR
  loudly for both the manual and auto-merge lanes.
- A post-merge step re-anchors your saved session notes onto the merged commit.
- A `Context: integration (...)` commit-footer kind for integration-ceremony commits with no work-unit chain to
  name.

### Changed

- The integration ceremony is resume-safe: it can be suspended while a PR is in review and re-entered later —
  including from another machine — without repeating completed steps.
- Post-merge branch teardown is symmetric across in-place and dedicated-worktree work units; archival no longer
  performs branch teardown.
- An auto-merged errand cleans up its branch, worktree, and inbox capture exactly once, with idempotent backstops.

### Fixed

- A merged work-unit branch in the primary worktree was not reaped after merge; it now is (merged-only-safe).
- Saved session notes no longer fall out of freshness after a post-merge base fast-forward.

## Completion Notes

Shipped the async-merge completion lifecycle — the machinery for finalizing a work unit or errand whose PR merges
outside an attended `integrate-work-unit` run. Eight units landed: the suspend/resume seam, the session-init
completion sweep, the same-session finalize pass, the post-merge notes-sync leg, the `integration` footer,
unattended-errand completion, and symmetric post-merge teardown.

Design intent held. The completion sweep reuses the shipped errand-sweep classifier pattern with its own 5-state
enum (the errand 4-state enum doesn't map onto the WU tail). The finalize pass is single-authored in
`session-handoff.md` and invoked by reference from `integrate-work-unit.md`, forward-compatible with the
`composable-workflows` shared-step hoist. The branch/worktree reaper was split with `coord-probe` — this WU owns
the `feat/` teardown facet (facet 2); `coord-probe` retains the cross-machine `plan/`-orphan facet (facet 1).

One review-driven change during integration: the mergeable-sharpening tier's `gh pr list` was scoped to the
operator's own PRs (`--author @me`) so its result cap survives team scale rather than being buried by other
authors' PRs under high repo throughput.

Verification: full Tier 3 gates green (md lint, code lint, typecheck, 2558 tests, build) and all 8 spec success
criteria met. CI caught one self-introduced markdown table-alignment lint on this meta file — the pre-commit
chain runs no markdown lint, so style violations surface only at the CI quality-checks job — fixed in-iteration.
