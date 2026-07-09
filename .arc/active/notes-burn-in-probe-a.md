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
- After merging current `main` through PR #214 into this branch, session-init reported
  `andrew: session-init local notes match remote notes` and `Latest local user note is current with HEAD` at
  `aa682027`. The earlier seeded-on-disk / not-yet-saved message was gone because the notes ref had been
  re-anchored during the interim notes-sync recovery work.

### First Handoff Save And Resume Reprobe

- Ran the active-WU handoff path from a clean `chore/burn-in-probe-a` worktree. The handoff meta commit
  `f29419c9` advanced the next-session pointer from Task 1.1 to Task 1.2.
- Replaced the per-WU `SESSION-NOTES.md` with a minimal execution handoff anchored to `f29419c9`; no
  uncommitted work or extra step-zero context was needed.
- `npx arc sync --json` returned `cell: paired-push`; the worktree leg was `push/success` and the notes leg was
  `save+push/success`.
- The post-handoff session-init reprobe reported `andrew: session-init local notes match remote notes`, with
  local note freshness `current-head` at `f29419c9`, `recommendedCombinedPrompt: null`, and no false notes-drift
  or reconcile prompt. The recovered load set included
  `.arc/user/andrew/burn-in-probe-a/SESSION-NOTES.md` as a full read.

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
- The handoff meta commit `f29419c9` warned that `chore/burn-in-probe-b` and `feat/finalize-parallelism` also
  touch `meta-burn-in-probe-a.md`; the Task 1.2 evidence commit `39d3d505` warned that the same siblings also
  touch `notes-burn-in-probe-a.md` and `tasks-burn-in-probe-a.md`. Both checks passed and the warnings stayed
  advisory, explicit, and recoverable.

### Final Base And Coordination Reprobe Before Verification

- Refreshed `origin/main`; it still pointed at PR #214 (`fix/fix-notes-window-bulk-rewrites`) and was already
  contained in `HEAD`, so no base merge was needed. The ancestry check reported `HEAD...origin/main` as `11 0`.
- Final session-init reprobe for Task 1.3 resolved Task 1.3 as the active cursor, reported
  `baseBranchSync.state: clean`, `dirty.state: clean`, and `recommendedCombinedPrompt: null`.
- User notes state remained clean (`refState: same`) with no false drift or reconcile prompt. The saved user note
  was an ancestor at `f29419c9`, one commit behind `HEAD`, because the Task 1.2 evidence commit landed after the
  handoff save; this is expected until the next handoff or explicit sync.
- No silent lifecycle/state contention surfaced: sibling overlap was visible through pre-commit advisories, base
  freshness was explicit, and session-init recovered the current task cursor without ambiguity.
