# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 3.R.j.c — Label + spinner + summary consistency (line ~1599)
- **Last Completed:** 3.R.j.b — `conflict` vs `divergence` canonical language. Canonicalized
  `conflict` as the user-facing term for "refs both moved from common ancestor"; added
  presentation-mapping JSDoc on `UserSyncRefState` flagging `"diverged"` as code-level-only and
  pointing at `UserStatusHeadline`. Swept user-facing strings across `push-recovery.ts`,
  `handleConflict`, session-init detail line, `cli.ts --force` help text, and the two
  `UserPushOptions.force` / `UserFetchOptions.force` JSDoc siblings. Module/function JSDoc in
  `push-recovery.ts` and `sync.ts` updated ("divergence" → "conflict"). `isDivergentPushError`
  helper retained (names git topology, not user-facing). `UserUnsavedDirection` JSDoc moved off
  overloaded "divergence" → "mismatch" (disk-vs-note, different semantic domain). Tests updated.
  Two-copy sync on `session-handoff.md` — folded in stale "pull-first" option reference
  (replaced with current "merge" option added in a prior task).
- **Blockers:** none
- **Next Action:** Begin 3.R.j.c — unify `handlePullDirection` spinner/label verb ("Pulled");
  document verb-tense convention in `runWithSpinner` JSDoc; split
  `determineUserStatusAction` for `local unsaved` sub-cases (save vs push);
  `session-handoff.md` exit-code paragraph; two-copy sync.
