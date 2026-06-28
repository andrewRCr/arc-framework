# Notes: lifecycle-ux-polish

Reference context for task generation and execution — repro/test setup detail and coordination breadcrumbs the
spec omits.

## Contents

- Facet 5 — errand-close reap: test context
- Facet 6 — foreign-write false-positive: repro/test context
- Coordination — sibling cleanup boundary
- Delivery sequencing

## Facet 5 — errand-close reap: test context

- The fix is the delete-if-exists reap: with the local branch already gone (after `gh pr merge
  --delete-branch`), `closeErrand`'s unconditional `git branch -D` errors and leaves the record orphaned even
  under `--force`. Test that `--force` clears the record when no local branch is present (delete-if-exists), and
  that a normal close with the branch present still reaps it then removes the record. Also test that the
  non-`--force` refusal on an absent branch names `--force` (actionable message).
- No reap-safety auto-fallback is added: `assessReapSafety` already proves containment for a branch-present
  pruned-upstream merge via `isLandedInBase` (`git cherry`, patch identity — covers merge-commit / fast-forward
  / rebase / single-squash). Once `--delete-branch` removes the local branch there is no ref or stored SHA left
  to check, so `--force` is the gate. Auto-confirm-without-`--force` (persist a tip SHA) is routed to
  `operational-state-docs` (a `USER-INBOX § Work Unit` capture).
- The earlier "refuses on a real merge commit" observation predated the shipped `isLandedInBase` fallback; the
  live symptom was the deleted local branch, not a merge-commit blind spot.

## Facet 6 — foreign-write false-positive: repro/test context

- Why the stale ref is live at commit time: the activate ceremony deletes the renamed-from `origin/plan/<slug>`
  remote-tracking ref only at its final step, *after* the activation commit — so at the foreign-write hook's
  commit-time check it is still a live local remote-tracking ref. `runActiveInFlight({ localOnly: true })`
  counts it as a distinct in-flight entry (`name = <slug>`, `worktreePath: undefined`), projected by
  `projectInFlightToOverlapRoster` to the same `meta-<slug>.md` the current WU owns.
- Test setup: stage a work-unit-surface artifact at an activation commit while a matching `origin/plan/<slug>`
  remote-tracking ref exists; assert no foreign-write warning. Cover the `arc errand check` consumer too — it
  passes no originating meta/slug (errands carry no meta) and must stay unaffected.
- Originating-meta resolvability: the current WU's meta is resolvable via the active-WU resolver
  (`resolveActiveWu` in `lib/release/wu-resolution.ts`, already used by `arc release commit`, or the active
  meta-reader) — symmetric with the `currentWorktreePath` the hook already resolves, no extra derivation cost.
  (Not `lifecycle-resolver.ts`, which resolves slug→state, not branch→slug.)

## Coordination — sibling cleanup boundary

- Companion to `cold-start-init-polish` (graduation-cleanup mold; no cohort membership). That stub owns the
  cold-start WU-*init* seams; this WU owns the *handoff / errand / activate / session-entry* seams. Keep task
  decomposition within this surface. If the two ever warrant a two-member cleanup cohort, that is a planning
  call, not an execution-time one.

## Delivery sequencing

- The doc lobe (Decisions 1, 3, 4, 7) can land first on its own, ahead of the code lobe (Decisions 2, 5, 6).
  This is a natural task-phase boundary within the one WU, not a decomposition cut.
