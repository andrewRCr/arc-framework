# Task List: Notes Merge Coherence

- **Design:** `spec-notes-merge-coherence.md`

---

## **Phase 1:** Shared tombstone-aware resolution

_Purpose:_ Extract the recency × live-tombstone resolution that `mergeCrossWuFile` already performs into one
shared, module-private function in `merge.ts`, and refactor `mergeCrossWuFile` to consume it. Behavior-preserving
— this is the foundation Phase 2 routes the synthesis path through, removing the divergent second resolution that
is the root of the duplicate-tombstone defect.

### `[x]` **1.1 Extract `resolveCrossWuState` and route `mergeCrossWuFile` through it**

- _Goal:_ A single module-private resolution function owns the recency × live-tombstone decision, and
  `mergeCrossWuFile` consumes it with byte-identical materialized output on the existing merge fixtures.

- _Outcome:_ `merge.ts` gains two module-private helpers — `parseNotesForResolution(notes, shape)` (per-note
  entries + all well-formed tombstones + malformed reasons) and `resolveCrossWuState(perNoteEntries,
  perNoteTombstones, now) → { liveEntries, suppressed, winningTombstones }` (the recency walk). TTL liveness moved
  entirely into `resolveCrossWuState`, so `parseNotesForResolution` is time-independent and drops the `now`
  param the task sketched — cleaner parse/resolve seam, and the same place Phase 2 routes synthesis through.
  `mergeEntries` union, `malformed` collection, and base reconstruction are unchanged. A four-case inline-snapshot
  guard added to `user-sync-merge.test.ts` pins byte-identical output (entry fold, USER-INBOX section fold,
  tombstone suppression, TTL-expired drop); all 31 merge tests green.

## **Phase 2:** Idempotent removal-tombstone synthesis

_Purpose:_ Route `appendRemovalTombstones` through Phase 1's shared resolution instead of the tombstone-blind
`okEntries` union, so synthesizing removal tombstones over a window that already records the removal is a no-op.
Closes the duplicate `## Removed:` defect at its root rather than de-duplicating the symptom.

### `[x]` **2.1 Route `appendRemovalTombstones` through `resolveCrossWuState`**

- _Goal:_ An identity already resolved-removed by a live tombstone in the window is no longer counted as a live
  prior entry, so it is not re-synthesized; the first removal earns exactly one marker and subsequent
  removal-bearing saves add none for that identity.

- _Outcome:_ `appendRemovalTombstones` reconstructs both the prior window and the current content through
  `parseNotesForResolution` + `resolveCrossWuState`, replacing the tombstone-blind `okEntries` union (now
  deleted). Synthesis runs over `prior.liveEntries` minus the current state's present-or-recorded identities
  (`current.liveEntries ∪ current.suppressed`) — the suppressed term is what makes "an identity the saved file
  already tombstones" recognized rather than re-marked, which `liveEntries` alone would miss (a prior-live,
  current-tombstoned identity is absent from `current.liveEntries`). `synthesizeTombstones` now takes an
  `accountedFor` identity set. Signature and the `applyRemovalTombstones` call site (`commands/user/save-load.ts`)
  unchanged. Three new tests pin idempotency, first-removal-one-marker, and no-re-mark; 34 merge tests green.

## **Phase 3:** Canonical tombstone-free projection

_Purpose:_ Introduce `projectManifest` as the single exported source of truth for the rendered file's
tombstone-free content, then move every coherence comparison and every `materializedManifestHash` write onto it.
A clean post-sync tree — same entries, possibly different in-band tombstone sets — then compares equal and reads
`current`, closing the false `local unsaved` defect.

_Design decisions:_ The projection is authored as the eventual tombstone-free rendered content (the forward
`operational-state-docs` target), and exported from `lib/user-sync` with no command-layer dependency so
`cross-machine-sync-coherence` extends it rather than re-authoring it. The comparison basis and the stored hash
basis move onto the projection together (Task 3.2) — splitting them would leave a mid-sequence state where one
side is projected and the other raw, which still mismatches.

### `[x]` **3.1 `projectManifest` primitive and `stripTombstoneSections` lift**

- _Goal:_ One exported pure function returns the tombstone-free manifest — cross-WU `## Removed:` sections
  stripped, per-WU subdir files passed through unchanged — and is consumable by `cross-machine-sync-coherence`
  as-is.

    - `[x]` **3.1.a Create `projection.ts` and lift `stripTombstoneSections`**
    - `[x]` **3.1.b Export `projectManifest` from `lib/user-sync`**

- _Outcome:_ New `lib/user-sync/projection.ts` holds `projectManifest(manifest) → SyncManifest` (cross-WU files,
  keyed by `shapeForFile(path) !== null`, return their `stripTombstoneSections` content; per-WU subdir files and
  any shapeless path pass through; version preserved) plus the lifted `stripTombstoneSections` with its own
  local `## Removed:` heading regex. `mergeCrossWuFile` imports it back, so the dependency runs one-directional
  `merge → projection` (no cycle; build clean). `projectManifest` is exported from `index.ts`; the helper is not —
  merge consumes it by direct module import, keeping the public surface minimal and command-layer-free. Four
  tests pin strip / byte-identical round-trip / subdir passthrough / version; merge byte-identical guards still
  green (38 tests across both suites).

### `[x]` **3.2 Route all coherence bases through the projection**

- _Goal:_ Every coherence comparison and every stored hash derives from `projectManifest`, so a clean post-sync
  tree reads `current` with no `arc user load` needed, and the save basis, load basis, and status basis are one
  projection.

- _Outcome:_ `inspectDiskVsLocalSnapshot` (`commands/user/sync-status.ts`) now projects both sides before
  comparing: `noteHash` / `diskHash` hash over `projectManifest(...)`, the equality test runs
  `manifestsEqual(projectedNote, projectedDisk)`, and `computeUnsavedDirection` is handed the projected
  manifests — one basis throughout, including the `note.commit !== sourceCommit` ancestor / mixed branches.
  `materializedManifestHash` written by `writeLocalSyncState` is `hashSyncManifest(projectManifest(...))` at both
  `runUserSave` and `runUserLoad`, so the stored basis matches. The readback-integrity hashes
  (`verifyMaterializedUserDir` / `verifySavedNote`) stay raw — they verify the on-disk/note round-trip
  byte-for-byte, tombstones included. `hashSyncManifest` and `SyncManifest` unchanged; hashing stays at the call
  sites, so `projectManifest` keeps no command-layer dependency. Two unit tests (tombstone-only diff reads
  `current`; a genuine cross-WU edit still reads `local unsaved` under projection) plus one end-to-end
  integration test (removal-bearing save → status `current`, stable across a repeat save) cover it; all existing
  direction classifications preserved.

## **Phase 4:** HEAD-ancestor freshness recognition

_Purpose:_ Thread `localNoteFreshness` into `UserSyncState` (generalizing `inspectSessionLocalNoteFreshness` off
its session-init-only caller) and add one arm to `decideSyncAction`, so a note sitting on a HEAD ancestor is
recognized as actionable — `arc user sync` selects the save direction instead of reporting "already up to date."
The engine recognizes the condition here; the unattended finalize wiring stays with `async-merge-lifecycle`.

### `[ ]` **4.1 Recognize a HEAD-ancestor note as actionable**

- _Goal:_ With the latest note on a HEAD ancestor and the tree otherwise clean, `decideSyncAction` returns the
  save (`push`) direction so a follow-up save attaches a note to current HEAD, and a subsequent status reads
  `current with HEAD`.
- _Note:_ The new behavior is sync-action-only. `arc user status`'s full headline (`runUserStatus`, which does
  not consume `UserSyncState`) already surfaces ancestry via `savedFromAncestor` / `ancestorDistance` and stays
  unchanged.

    - `[ ]` **4.1.a Thread freshness into `UserSyncState`**
        - Generalize `inspectSessionLocalNoteFreshness` off the session-init-only path (currently called only by
          `runUserSessionInitStatus`) so `inspectUserSyncState` can reuse it.
        - Add `localNoteFreshness` to the `UserSyncState` interface (`commands/user/types.ts`) and populate it in
          `inspectUserSyncState` (`commands/user/sync-status.ts`).

    - `[ ]` **4.1.b Add the `ancestor` arm to `decideSyncAction`**
        - In `decideSyncAction` (`handlers/user-sync.ts`), when `remoteStatus` is `in sync` and `diskStatus` is
          `current` but freshness is `ancestor`, return `push` rather than `noop`. Every other freshness state
          (`current-head`, `missing`, `outside-head-ancestry`) leaves the existing decision unchanged.
        - Build `test-first` (one behavior at a time):
            - `ancestor` freshness + `in sync` + `current` disk → `push`.
            - `current-head`, `missing`, and `outside-head-ancestry` leave the prior decision unchanged.
            - Post-merge with the note on a HEAD ancestor, `arc user sync` selects the save direction and a
              follow-up status reads `current with HEAD`.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Two consecutive removal-bearing saves over a window already recording the removal add zero new
  tombstones; the raw note carries exactly one `## Removed:` marker per removed identity.
- `[ ]` `arc user status` and `arc sync` report `current` on an unmodified tree immediately after a
  removal-bearing save — no `arc user load` required to clear it.
- `[ ]` The save-path `materializedManifestHash`, the load-path `materializedManifestHash`, and the status
  comparison all derive from `projectManifest`; a grep finds exactly one definition of the tombstone-free
  projection and no remaining raw-manifest coherence comparison in `inspectDiskVsLocalSnapshot`.
- `[ ]` `projectManifest` is exported from `lib/user-sync` and has no dependency on command-layer code.
- `[ ]` With the latest note on a HEAD ancestor and the tree otherwise clean, `arc user sync` selects the save
  direction and a subsequent status reads `current with HEAD`.
- `[ ]` The Phase 1 extraction leaves `mergeCrossWuFile`'s materialized output unchanged on the existing merge
  fixtures.
- `[ ]` All quality gates pass (tests, linting, type checking, build).
- `[ ]` Ready for integration.

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
