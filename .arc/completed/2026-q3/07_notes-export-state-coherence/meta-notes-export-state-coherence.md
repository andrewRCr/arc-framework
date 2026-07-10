# Metadata: notes-export-state-coherence

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-export-state-coherence.md`
- **Task List:** `tasks-notes-export-state-coherence.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — verification complete; all 12 success criteria and Tier 3 gates passed
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/217>
- **Completed:** 2026-07-09

---

## Release Notes Entry

ARC user-state sync now distinguishes reconcilable branch-export notes divergence from genuine content conflicts.
Compatible note sets reconcile safely at the next paired push, while status, session-init, and sync guidance agree
on the relation and no longer offer a pull operation that must fail.

### Added

- Five-way content-relation inspection for diverged user-notes refs, backed by strict SHA-addressed note-tree
  listing and compaction-aware entry filtering.

### Changed

- Branch-bounded notes exports now create a lossless, compare-and-swap-protected union when local and pushed note
  sets can be reconciled safely.
- `arc user status`, `arc user sync`, and session-init now share relation-aware guidance for subset,
  mixed-uncontested, and conflicting note sets.

### Fixed

- Expected branch-export residue no longer appears as a pull-able notes conflict.
- Repeated paired pushes avoid redundant union commits, and older compaction residue cannot resurrect pruned note
  entries or distort relation classification.

## Completion Notes

notes-export-state-coherence shipped the two-sided correction defined by the spec. The producer path now replaces
the branch-bounded export skip with a deterministic two-parent union whenever the local and pushed trees are
zero-contested or ancestry-resolvable. The canonical notes ref moves only through an expected-old compare-and-swap;
strict read, plumbing, manifest, and concurrent-update failures preserve the successful remote push and leave both
sides intact. No-op guards prevent repeated pushes from minting redundant commits.

The read path now classifies diverged refs as `remote-subset`, `local-subset`, `equal`, `mixed-uncontested`, or
`conflicting` using strict SHA-addressed tree reads. Compaction manifests are resolved by generation, and pruned
pairs are excluded from both classification and union construction. The relation is threaded through status,
session-init, and sync dispatch so compatible divergence receives next-push reconciliation guidance while genuine
content conflicts remain blocked without an impossible pull option.

The implementation stayed within the planned boundaries: diverged pull remains refusal-only, partial-push markers
remain topology-based, the existing sync-status decomposition was not expanded, and synthetic burn-in residue was
left to its owning cleanup. Review tightened the result by pinning divergence inspection to the fetched remote SHA
instead of the mutable temp-ref name and by hardening dispatcher coverage for every reconcilable relation; no spec
criterion was superseded.

All 12 success criteria passed. Tier 3 verification covered Markdown, TypeScript, and shell linting; source and
test typechecking; build; and 4,173 passing tests across 303 passing files, with one test file and one test skipped.
The final review-response head has zero unresolved review threads, all required CI checks pass, and the PR is
mergeable.
