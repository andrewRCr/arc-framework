# Metadata: Projection Worktrees

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-projection`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30)
- **Design:** `spec-projection-worktrees.md`
- **Task List:** `tasks-projection-worktrees.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:d88163843943dc3a1ba735a9bda9f676fcad64943df9399297c4a6ec101143b0`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1354>
- **Completed:** 2026-11-16

## Release Notes Entry

Off-branch projection backends now keep every checkout's projected files current across worktrees and hold a checkout's
removal until its edits persist. The tracked-file backend retains its existing behavior.

### Added

- Command-start refresh that takes only what the store changed since the checkout's recorded state, leaving unchanged
  files in place.
- Fan-out of each landed write, batch, pull and push to every other worktree that holds a projection.
- Full projection of a newly spawned work-item checkout, and `arc sync` rebuilding deleted projected files.
- Removal and release steps that persist a checkout's authored files before ARC removes or releases it, and refuse with
  repair guidance when they cannot.
- A projected copy of the identity's personal records, scratch included, in every checkout.

### Changed

- Projection cost follows what changed: the index is partitioned by root and the archive by quarter.

## Completion Notes

Delivered the projection across worktrees over the substrate's engine and the write-back path: command-start refresh and
reprojection, the composed store's fan-out of landed writes and pulls to every sibling, full materialization of a
spawned checkout with its tripwires, `arc sync`'s rebuild of deleted files, the three removal slots and the release
step, per-checkout user surfaces and scratch, and the index's root and quarter partitions. Every projection entry keys a
checkout by its native real path, so a command, Git's worktree list and a caller reach one identity. Over the
tracked-file backend the slots pass and nothing projects; activation and its live rehearsal remain with the cutover.

The amendments refine the design. A4 replaced the original no-change budgets with per-platform full-round bounds; A8
defers protection in a failed work-unit spawn's cleanup, which removes its new checkout without the removal slots; A9
accepts the changed marks a contended end loses; A7, A10 and A11 bound held rebuilds, pending reprojection retries and
rewrites of unchanged files; A1, A2, A5 and A6 settle smudging, path reuse, inert removal bindings and unindexed
personal files. Of the 20 success criteria, 16 are met and four are superseded by those amendments, whose narrowed forms
are met: the original performance criterion by A4, the removal and unindexed-retirement criteria by A8, and the
changed-mark criterion by A9. The specification's accepted residuals remain limits of the delivered behavior.

Verification re-qualified at `5a4eec5afc`: the forced merge gate with the full store run, and full non-diagnostic hosted
CI run 43806300912 with the portability pair, whose one Windows failure, a Git-executor cancellation timeout in a test
this change did not touch, passed on rerun and is captured. Every timing median fit its bound with no Git credit on the
Linux reference machine, Windows and macOS; macOS counted through a same-head timing-only run under the Owner's rule
after the sharded run and a first timing-only run missed the start bound. The Windows qualification first found three
non-portable tests and a fan-out that re-proved every sibling's ignore guard because Git and commands spelled a checkout
differently; both were fixed. Independent criteria passes 1–3 and three standard review passes with their fix checks
closed with every finding fixed or dispositioned, and the review stopped at an Owner-accepted terminus. A bounded check
of the changes after the reviewed head found a test gap in the spelling fix and four minor findings; `039cd69aa6` fixed
them, hosted CI run 43879215265 passed with the portability pair, and the Owner recorded the Candidate's applicability
on that evidence. The forced merge gate then passed at `db584bf763` for the full-scope convergence attestation. Two
merges of `main` followed. Hosted Windows runs of the retirement suites, which the portability tier does not select,
then found tests comparing checkouts by Git's raw spelling and, once `main` gave a checkout its native spelling, by the
old one; `58d16b043d`, `e0c5a71074` and `7c49516eb8` fixed them. At run `43964135813` the change's retirement suites
passed on Windows, and the suites shared with `main` failed no worse than on `main` (`43960905230`). Full hosted CI run
`43974177580` passed at `2af9772aa6`. Exact-head readiness remains the checkpoint's.

---
