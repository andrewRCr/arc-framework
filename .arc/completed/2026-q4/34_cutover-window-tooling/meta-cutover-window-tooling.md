# Metadata: cutover-window-tooling

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-cutover`
- **Depends On:** [none]

- **Origin:** [internal] — split from `cutover-flip` at its create-spec entry (2026-11-10)
- **Design:** `spec-cutover-window-tooling.md`
- **Task List:** `tasks-cutover-window-tooling.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:b7a38e11e04e20bca8b715aff8ddcbf689173d2eb50e04caf8533b65f2447c71`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1352>
- **Completed:** 2026-11-14

## Release Notes Entry

`arc user load` now refuses once a repository's state has been imported into the ref store, as the other notes writes
already do.

### Fixed

- `arc user load` and the load direction of user sync refuse after the store import, writing no file, instead of
  writing personal files from a notes copy the store has superseded.

## Completion Notes

Delivered the repository-only script family for this repository's move into the ref store, inert until a rehearsal or
the window runs it. The quiesce check refuses on its thirteen conditions, each naming its subject and remedy, and on a
pass records the import's inputs as digests and holds every tip under `refs/arc-window/`, its completion marker
written last. `recompute` and `last-read` stop on any change between the record and the merge; `compare`, `confirm`
and `close` hold each after-merge difference until its re-application is confirmed at the exact compared tip; and
`restore` returns every ref the window wrote, locally and on `origin`, leasing each push on what the window left. The
`lock` step, the copy driver with its copy safety, the rehearsal driver's two plans, the accounting case and the chain
comparison complete the family. Shipped code changes by one optional provenance field on the in-repo composition's
result, which no caller reads, and the sealing guard's call in `runUserLoad`, which reaches `arc user load` and the
user-sync load direction once the registry ref exists.

The design was amended forward six times, each from review: A1 has C1 refuse a skip-worktree or assume-unchanged flag
on a tracked-state path, A3 makes the import's address-space cap the caller's and requires it above the heap ceiling,
A4 has `compare` refuse an unrecorded branch that shares no history with `main`, and A2, A5 and A6 replace C4's
remedies with ones that run before the flip. Stage 1's first recorded runs predated the review fixes, so both plans ran
again at the converged head; the success-criteria record keeps each Deviation note beside the Met note that closes it.
The imports ran under the driver's inherited 8 GiB address-space limit, the runner pool's recommendation, which A3
leaves to the caller. This branch's update to its own entry in `cohort-storage-cutover.md` landed on `main` separately,
because editing it here moved the branch past its attested head.

All 21 success-criteria lines are met, eight of them after a Deviation note. Criteria verification ran one chunked pass
with a seam call; of its 24 findings, 22 were fixed, one was deferred to the Stage 1 rerun and one was rejected.
Pre-publication review ran two complete standard passes, read in chunks with a pass over the seams, and three fix
checks; it approved 49 fixes and rejected one finding, then closed by Owner acceptance, with frontline skipped by
direction because the change set is too large for it. Stage 1 at `ac35d74314`, whose tools are unchanged since
`6067f2c917`, passed every step of both plans: the imports took 768 s at 2,388 MiB and 775 s at 2,242 MiB peak resident
memory, and the live repository read the same before and after each run. The forced merge gate passed 20 checks at
`d3fde32cf9`, its store check reaching 459 of 472 suites, and hosted run `43646108580` passed every job it ran at that
head. Final base reconciliation and exact-head readiness remain the checkpoint's.

---
