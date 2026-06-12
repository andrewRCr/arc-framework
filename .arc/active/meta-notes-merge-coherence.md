# Metadata: notes-merge-coherence

| **State**      | **Owner** | **Branch**                   | **Class** | **Priority** |
| -------------- | --------- | ---------------------------- | --------- | ------------ |
| `Integrating`  | `andrew`  | `fix/notes-merge-coherence`  | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-merge-coherence.md`
- **Task List:** `tasks-notes-merge-coherence.md`

- **Last Completed:** Task 5.1 — Complete verification (Tier 3 gates green; 8/8 success criteria met)
- **Next Task:** [none] — verification complete; WU ready for integration.
- **Blockers:** [none]

- **Next Action:** merge PR #87

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/87>
- **Completed:** 2026-06-12

---

## Release Notes Entry

ARC's user-state sync now handles removal-bearing saves coherently: repeated saves do not duplicate removal
markers, a clean tree stays clean after entry removal, and a note attached to a HEAD ancestor is recognized as
needing a follow-up save.

### Added

- A reusable tombstone-free manifest projection for user-state coherence checks.

### Fixed

- Removal tombstone synthesis is idempotent across recent-note windows that already record a removal.
- `arc user status` / `arc sync` no longer report spurious `local unsaved` state when disk and notes differ only by
  in-band removal tombstones.
- `arc user sync` treats a current disk plus a HEAD-ancestor note as an actionable save, so user notes attach to
  current `HEAD` instead of reporting "already up to date."
- Tombstone-free projection is limited to cross-WU flat files, preserving raw per-WU subdir content even when a
  subdir filename matches a cross-WU shape.

## Completion Notes

notes-merge-coherence shipped the single-machine user-notes engine fixes extracted from async-merge-lifecycle. The
work keeps the current note format intact while making the comparison and synthesis paths agree on one coherent
view of cross-WU files.

The merge path now shares `resolveCrossWuState` between `mergeCrossWuFile` and removal-tombstone synthesis, so live
entries, suppressed identities, and winning tombstones are resolved once by recency and TTL. That closes the
duplicate-tombstone defect at the resolution layer rather than by de-duplicating output.

`projectManifest` is exported from `lib/user-sync` as the tombstone-free rendered projection. Save and load record
`materializedManifestHash` over that projection, and status compares / classifies projected manifests while leaving
readback verification raw. Integration review tightened the projection boundary to use the user-sync path
classifier, so per-WU subdir files pass through unchanged even when their basename looks like a cross-WU file.

Freshness now participates in sync action selection: `inspectUserSyncState` threads local note freshness into
`UserSyncState`, and `decideSyncAction` returns save when the latest note sits on a HEAD ancestor while disk is
otherwise current. The workflow automation that invokes this during unattended merge remains with
async-merge-lifecycle.

Verification passed full local Tier 3 gates and PR #87 is open with green CI, green CodeRabbit, and mergeable
status. Pre-PR review found one material edge case, fixed in `620fb503`: projection must honor the cross-WU/per-WU
path class before stripping tombstones.
