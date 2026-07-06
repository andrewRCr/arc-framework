# Notes: burn-in-probe-a

## Evidence Log

### Spawned Worktree And Session Bootstrap

- Worktree path: `/home/andrew/dev/repos/github.com/andrewRCr/arc-framework.burn-in-probe-a`.
- Initial planning branch: `plan/burn-in-probe-a`; activation later renamed it to `chore/burn-in-probe-a`.
- Seeded per-WU session notes were present on disk at `SESSION-NOTES.md` under the identity-scoped user
  workspace for this WU.
- Session-init loaded `meta-burn-in-probe-a.md` as the active pointer and resolved the WU through the normal
  linked-worktree path.

### Notes Status Reprobes

- Initial probe before the notes fixes surfaced a stale notes/disk drift advisory pointing at the historical
  `2ad2b83f` note lineage.
- After merging PR #201 into this branch and rebuilding, the drift advisory disappeared, but the user-status
  detail incorrectly said no local user note existed for the identity.
- After merging PR #202 into this branch and rebuilding, session-init reported the intended WU-scoped status:
  `SESSION-NOTES seeded on disk for this work unit; not yet saved to the notes ref (saves at first handoff).`
- Later reprobes after planning finalization and activation continued to report the same seeded-on-disk /
  not-yet-saved status, with no false notes-drift advisory.

### Base Merge And Reprobe History

- Merged `origin/main` at `f80be6b1` to pick up PR #201 (`fix/user-sync` notes nearest-match behavior) and rebuilt
  the CLI before probing.
- Merged `origin/main` at `a4e6a888` to pick up PR #202 (`fix/status` no-user-note message scoping), rebuilt the
  CLI, and confirmed the expected seeded-session-notes message.
- During planning, `npx arc status --session-init --json` initially failed to find the task list when the spec and
  tasks were saved under the backlog path. Moving `spec-burn-in-probe-a.md` and `tasks-burn-in-probe-a.md` into
  `active/` made the probe resolve Task 1.1 correctly; the workflow wording gap was captured to `USER-INBOX`.
- After activation, the branch rename briefly left `chore/burn-in-probe-a` tracking the deleted
  `origin/plan/burn-in-probe-a` upstream. Clearing the stale upstream changed the session-init surface from
  `branch-gone` to the expected no-upstream state for an unpushed activated branch.

### Sibling Coordination Observations So Far

- Planning and activation commits triggered foreign-owned-write warnings for surfaces also touched by
  `feat/finalize-parallelism` and `burn-in-probe-b`. The warnings were advisory and expected for this burn-in
  setup; later integration should record whether they remain loud and recoverable.
