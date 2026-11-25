# Metadata: Projection Substrate

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-projection`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30)
- **Design:** `spec-projection-substrate.md`
- **Task List:** `tasks-projection-substrate.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:83564838a59030eba181b95579265e4cc82ae4a0b0b9ef2562ee53cc819557ff`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1247>
- **Completed:** 2026-11-02

## Release Notes Entry

Managed linked checkouts gain removal protection, and ARC's ignore policies keep its working files discoverable by
search tools.

### Added

- Removal locks for linked checkouts ARC creates or retains, with guarded teardown and recovery instructions when
  provisioning or retirement stops.
- A managed root `.ignore` block for searchable ARC files and npm exclusion rules for ARC personal state.

### Fixed

- Preserve worktree protection after a failed removal, and retain lock-owner and literal-path details in repair
  instructions. Manual husk cleanup requires inspection and saving personal state before unlocking and removal.

## Completion Notes

Delivered the four substrate boundaries: Git exclusion and its configuration-bound guard; the projection's index,
renewable lock, change detection and base recovery; settled reads, guarded replacement, aside-copy recovery, rebuilds
and removals through the take-in port; and linked-worktree removal protection. The projection engine remains dormant
before the storage capability changes. Worktree locks and the managed search and personal-state ignore policies run
before that change; write-back, refresh and cross-worktree materialization remain the following members' scope.

Forward amendments retain empty aside copies for recovery, bind complete ordered ignore settings and their actual
rule sources, preserve Git's path traversal semantics, and protect retained checkouts through later failures. The
save-loss assurance is bounded: randomized trial writers finish before the final cleanup check. A write after an aside
copy's final content read can still escape recovery, before or after unlink; that accepted residual includes a single
save descheduled after opening the file. Holding its handle across unlink was considered and not taken because it
would move the boundary and require durable recovery state plus Windows sharing and deletion coverage.

Reconciled main's compiled session initialization with the removal contracts: published teardown actions remain
offers, owner-held unlock repairs remain manual, and manual husk guidance preserves the save/unlock/remove sequence.
Both lock-repair regression sets and the new initialization spine are retained.

Full local qualification passed at `63af73bab9`: 21,665 unit tests and all 320 selected store suites (4,906 tests),
both typechecks, lint, build and ARC contracts. Related feedback also passed 1,350 local E2E cases. The committed tree
matches the full-gate tree, and the committed-head check passed. Normal hosted qualification passed on its first
attempt as CI `41573802387`, with the Windows/macOS portability pair enabled and no diagnostic narrowing or retry.

Standard review stopped by Owner acceptance after four complete passes; the latest complete pass reported zero
critical, one major and one minor finding, both repaired. Subsequent fix and bounded checks closed the repairs. The
fresh-context removal/agenda reconciliation check at `63af73bab9` is complete and clean within its bounded scope.
That evidence and the accepted stop do not claim a final clean whole-target pass.

---
