# Metadata: Projection Write-Back

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-projection`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30)
- **Design:** `spec-projection-write-back.md`
- **Task List:** `tasks-projection-write-back.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:45720436a2e55dbe870ded6980c642f67e87605e07dfd17b1b961af58e0de4a6`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1305>
- **Completed:** 2026-11-08

## Release Notes Entry

Off-branch projection backends can now accept hand edits through checked write-back and explicit save, with conflicts
kept visible and refused edits preserved. The tracked-file backend retains its existing behavior.

### Added

- `arc save`, including explicit conflict resolution, and `arc selection` with changed-file filtering.
- Editor settings support for VS Code and Zed, and checkout-rooted active layouts with a flat-layout option.
- Adoption of supported unindexed files after their stored ownership is established.

### Changed

- Prepared projection writes recheck current ownership, selection, conflict and history evidence at atomic publication.

### Fixed

- Accepted input remains available after handled read-back failure, preserving the basis for a later save.
- Stored entry conflicts preserve newer accepted text, and literal companion names retain distinct record identities.

## Completion Notes

Delivered the projection's edit path: command-start take-in and explicit save parse each edit, check merged content,
send it against its selected base, and retain refused or unsettled bytes with repair guidance. Stored conflicts are
rendered and resolved through index-bound identities; protected files, exact archived generations and established
adoption containers retain their authority. Selection, editor settings and physical path callers use the checkout's
capability and layout. The tracked-file backend remains dark; reference-backed engine and registered-handler tests,
native-layout integration tests and dark-path E2E tests establish the implemented boundary before activation.

Prepared writes now share deterministic selection and preparation with atomic admission. The fence covers exact
records and absences, selected conflict payloads, validated semantic inventory rows, consumed history and fresh
arrival decisions, including native publication retries. Final kind checks still inspect the merged result. Accepted
input recording remains separate from guarded installation, including ordinary and aside writes; handled failure
preserves the landed version and input rather than resending them. Native refusals retain their repair route.

The approved A3 parser deviation remains explicit: notes, personal documents and session context intentionally have
no parser-derived fields; checks, backend validation and write authority still apply. Literal root companion keys,
newer-entry conflict placement and unfinished accepted-input recording follow the forward amendments in
`spec-projection-write-back.md`. Refresh, fan-out, materialization, reprojection and removal integration remain with
`projection-worktrees`; activation and its live rehearsal remain with the cutover. The specification's accepted save,
editor and interruption residuals remain limits of the delivered behavior.

Required local checks and full non-diagnostic portability qualification passed at repaired source head `a5d6e9f337`:
run 42517854005 completed on its first attempt with all Windows and macOS store shards. The verification commit
retains the earlier captured Windows failures and authorized passing reruns without claiming their diagnosis.
Independent repair checks closed the approved admission repairs, and full standard Pass 4 completed at `de4b77b5b7`
with no supported finding across all 498 endpoints and the cross-group seams. Its sole unsupported scoped candidate
was withdrawn after primary-role canonicalization was checked and its record-only rejection was approved. These
results establish the reviewed source; final base reconciliation and exact-head readiness remain the checkpoint's.

---
