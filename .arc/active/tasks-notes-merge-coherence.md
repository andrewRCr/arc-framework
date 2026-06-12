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

### `[ ]` **2.1 Route `appendRemovalTombstones` through `resolveCrossWuState`**

- _Goal:_ An identity already resolved-removed by a live tombstone in the window is no longer counted as a live
  prior entry, so it is not re-synthesized; the first removal earns exactly one marker and subsequent
  removal-bearing saves add none for that identity.
- _Approach:_ Reconstruct both the prior window and the current content through `resolveCrossWuState` (entries +
  live tombstones), and synthesize over `prior.liveEntries` vs `current.liveEntries` instead of the
  tombstone-blind `okEntries` union. Live-vs-live comparison is what makes synthesis idempotent and lets an
  identity the saved file already tombstones be recognized rather than re-marked.
- _Note:_ The `appendRemovalTombstones` signature and its call site in `applyRemovalTombstones`
  (`commands/user/save-load.ts`) are unchanged — only the prior/current reconstruction inside the function moves
  onto the shared resolution.

    - Build `test-first` (one behavior at a time):
        - Two consecutive removal-bearing saves over the same window produce exactly one `## Removed:` marker per
          removed identity (idempotency).
        - The first removal still earns exactly one marker — the no-op applies only once the window records it.
        - An identity the saved file already tombstones is recognized rather than re-marked.

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

### `[ ]` **3.1 `projectManifest` primitive and `stripTombstoneSections` lift**

- _Goal:_ One exported pure function returns the tombstone-free manifest — cross-WU `## Removed:` sections
  stripped, per-WU subdir files passed through unchanged — and is consumable by `cross-machine-sync-coherence`
  as-is.
- _Shape:_ `projectManifest(manifest: SyncManifest) → SyncManifest` in a new `lib/user-sync/projection.ts`,
  surfaced through `lib/user-sync/index.ts`.

    - `[ ]` **3.1.a Create `projection.ts` and lift `stripTombstoneSections`**
        - Move `stripTombstoneSections` from `merge.ts` into `projection.ts` as a self-contained function with its
          own local `## Removed:` boundary regex; `mergeCrossWuFile` imports it back (it still strips the base at
          reconstruction time). `parseTombstones` / `isLiveTombstone` and their `TOMBSTONE_HEADING` constant stay
          in `merge.ts`, so the dependency runs one-directional `merge → projection` with no cycle.
        - Implement `projectManifest`: for each cross-WU file return its `stripTombstoneSections` content; leave
          per-WU subdir files untouched. Pure function of an existing manifest — no new git calls, no hashing.
        - Build `test-first` (one behavior at a time):
            - A tombstone-bearing cross-WU file projects to its stripped content.
            - Tombstone-free content round-trips byte-identical through the projection.
            - Per-WU subdir files pass through unchanged.

    - `[ ]` **3.1.b Export `projectManifest` from `lib/user-sync`**
        - Add `projectManifest` (and its module) to `lib/user-sync/index.ts` alongside the existing merge
          exports; confirm no import path reaches back into `commands/` or `handlers/`.

### `[ ]` **3.2 Route all coherence bases through the projection**

- _Goal:_ Every coherence comparison and every stored hash derives from `projectManifest`, so a clean post-sync
  tree reads `current` with no `arc user load` needed, and the save basis, load basis, and status basis are one
  projection.
- _Approach:_ Project both sides before comparing; preserve the existing direction logic
  (`computeUnsavedDirection`, the `note.commit !== sourceCommit` ancestor / mixed branches) and only project the
  manifests handed to it, keeping all hash comparisons within one basis.
- _Note:_ `hashSyncManifest` (`commands/user/save-load.ts`) and `SyncManifest` (`lib/git/user-sync.ts`) are
  unchanged; hashing stays at the call sites so `projectManifest` keeps no command-layer dependency.

    - `inspectDiskVsLocalSnapshot` (`commands/user/sync-status.ts`): the disk-vs-note equality test compares
      `projectManifest(noteManifest)` against `projectManifest(diskManifest)` (was raw
      `manifestsEqual(noteManifest, diskManifest)`); the note hash and disk hash in the materialized-basis
      branches are hashed over their projections.
    - `materializedManifestHash` (`commands/user/save-load.ts`): the hash passed to `writeLocalSyncState` is
      `hashSyncManifest(projectManifest(...))` at both `runUserSave` and `runUserLoad`.

    - Build `test-first` (one behavior at a time):
        - A removal-bearing save followed by `arc user status` reads `current` on an unmodified tree (no false
          `local unsaved`).
        - A save → status loop with no edits stays `current` across repeats.
        - Existing direction classifications are preserved under the projected bases, including the
          `note.commit !== sourceCommit` ancestor / `mixed` branches (which compare `diskHash` against
          `materializedHash` — both now projected): projecting changes the equality verdict on tombstone-only
          differences, not the direction taxonomy (`behind` / `mixed` / `modified` / `missing`).

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
