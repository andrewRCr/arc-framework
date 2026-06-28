# Notes: lifecycle-ux-polish

Reference context for task generation and execution — repro/test setup detail and coordination breadcrumbs the
spec omits.

## Contents

- Facet 5 — errand-close reap-safety: test context
- Facet 6 — foreign-write false-positive: repro/test context
- Coordination — sibling cleanup boundary
- Delivery sequencing

## Facet 5 — errand-close reap-safety: test context

- The refusal (case 1) was verified live on a real **merge commit**, not a squash — the reap-safety fallback
  must recognize merge-commit containment via `git merge-base --is-ancestor <tip> <base>`, not only
  upstream/cherry equivalence. Test both the merge-commit and squash shapes.
- The broken `--force` (case 2) is a distinct failure from the refusal: with the local branch already gone,
  `--force` errors on `git branch -D` and leaves the record orphaned. Test that `--force` clears the record
  when no local branch is present (delete-if-exists reap).

## Facet 6 — foreign-write false-positive: repro/test context

- Why the stale ref is live at commit time: the activate ceremony deletes the renamed-from `origin/plan/<slug>`
  remote-tracking ref only at its final step, *after* the activation commit — so at the foreign-write hook's
  commit-time check it is still a live local remote-tracking ref. `runActiveInFlight({ localOnly: true })`
  counts it as a distinct in-flight entry (`name = <slug>`, `worktreePath: undefined`), projected by
  `projectInFlightToOverlapRoster` to the same `meta-<slug>.md` the current WU owns.
- Test setup: stage a work-unit-surface artifact at an activation commit while a matching `origin/plan/<slug>`
  remote-tracking ref exists; assert no foreign-write warning. Cover the `arc errand check` consumer too — it
  passes no originating meta/slug (errands carry no meta) and must stay unaffected.
- Slug resolvability: `lifecycle-state-resolver` has shipped, so the originating slug/meta the core
  self-exclusion needs is cheaply resolvable from the current branch — no extra derivation cost.

## Coordination — sibling cleanup boundary

- Companion to `cold-start-init-polish` (graduation-cleanup mold; no cohort membership). That stub owns the
  cold-start WU-*init* seams; this WU owns the *handoff / errand / activate / session-entry* seams. Keep task
  decomposition within this surface. If the two ever warrant a two-member cleanup cohort, that is a planning
  call, not an execution-time one.

## Delivery sequencing

- The doc lobe (Decisions 1–4) can land as a clean Light increment ahead of the reviewed-lane code lobe
  (Decisions 5–6). This is a natural task-phase boundary within the one WU, not a decomposition cut.
