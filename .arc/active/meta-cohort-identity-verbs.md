# Metadata: cohort-identity-verbs

| **State**     | **Owner** | **Branch**                   | **Class** | **Priority** |
| ------------- | --------- | ---------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/cohort-identity-verbs` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cohort-identity-verbs.md`
- **Task List:** `tasks-cohort-identity-verbs.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:185862db6f3ccd48c19190a0d797f8e0026ef231bc5aaa42b72ad214ee7c3a15`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Off-branch storage backends gain commands that repair a slug two owners hold and that retire cohorts. The tracked-file
backend keeps its existing behavior apart from the order of one rename refusal; the new commands refuse there, naming
what serves.

### Added

- `arc cohort close` and `arc cohort remove`, which retire a cohort once no record holds it.

### Changed

- `arc rename` accepts an exact UID and renames a cohort as well as a work unit, including under a clash of its own
  slug.
- `arc errand close` and `arc errand abandon` accept an Errand's UID, and the retry either prints repeats it.
- A slug-clash refusal names a command that repairs it: a UID rename, an Errand's close or abandon by UID, or the edit
  that re-points a reference.
- A cohort path or `Parent` names a cohort only by its current slug.

## Completion Notes

Delivered identity commands for owners sharing the store's namespace. `arc rename <slug|uid> <new-slug>` selects a work
unit or a cohort by slug or exact UID and lands under a clash of its own slug; its branch, checkout and remote steps
follow the subject's own link, and a failed catch-up push recovers as Git's own does. A cohort rename writes the
document under its new name and every member `Cohort` and subcohort `Parent` naming it alone in one batch. Both renames
rewrite another record's reference only where the old slug resolves to their subject alone, and report the rest with
the edit that re-points it. `arc cohort close` and `arc cohort remove` retire a cohort while no record holds it,
counting holders by resolving each path segment, as archive's closeout now does. `arc errand close` and `abandon` take
a UID; every clash refusal, status's slug-clash warning and Start readiness name a repair that runs; and `Cohort` paths
and `Parent` admit a cohort only by its current slug. The tracked-file backend is unchanged but for one refusal order,
and the new commands refuse `unsupported` there. Command fixtures over the ref backend exercise the store behavior;
activation remains with the storage flip.

The design was amended forward eleven times. A1–A4 settled the branch step's recovery and remedies. A5, A6 and A8–A11
qualified the cohort rename: it retains a coupled `Parent`/member group or a path that disagrees with its leaf's
`Parent`, reports unproved companion edits to their owners, and refuses before writing, naming exits that land,
wherever the Parent check would refuse a `Parent` it moves. A7 makes both renames prepare their batch again at
admission and refuse where the result differs. The changes to the storage seam's shared decisions are recorded in
`cohort-storage-seam.md` § Shared contracts, items 1, 3, 7 and 11. A11 records two exits that can themselves refuse in
states only a sync forms, as source-inferred. Three further limits in such states are held for follow-up before the
flip: an Errand clash between two owners names a close only one of them can run, two Errands left awaiting merge on
one branch name each name the other's close, and cohort retirement advice can suggest an edit the membership check
refuses where an open subcohort's `Parent` names another cohort.

The task list's success-criteria record holds 29 lines: 25 met, criterion 16 among them under the approved A3
deviation, and four superseded or qualified by amendments (criteria 10, 20, 23 and 27). Prepublication review ran nine
complete standard passes and thirteen fix checks against a ceiling of two, each pass past it approved. Critical and
major findings across the complete passes ran 1, 2, 2, 1, 1, 2, 1 and 1, then none at the ninth. An independent fix
check of the ninth pass's repairs, run outside the recorded review, found three minors, two fixed and one held for
follow-up, and review closed there by Owner acceptance; the boundary records frontline as skipped under that decision.
The convergence merge gate passed 20 checks at `175f36bf7f`, the store suites' full run included, and hosted run
`42546456114` passed every job it ran at that head; a dispatched run leaves out the Windows and macOS pair. Final base
reconciliation and exact-head readiness remain the checkpoint's.

---
