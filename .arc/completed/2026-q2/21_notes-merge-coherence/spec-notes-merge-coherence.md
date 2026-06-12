# Spec (`detailed` · `RFC`): notes-merge-coherence

- **Origin:** [internal] — extracted from `async-merge-lifecycle` at create-spec (the `lib/user-sync/`
  correctness work that member originally absorbed under option A).

- **Purpose:** Make single-machine user-notes merge **coherent** — idempotent removal-tombstone resolution and a
  canonical tombstone-free projection shared by the save, load, and status paths — so a clean tree reads clean
  after a removal-bearing sync, removals never re-synthesize duplicate tombstones, and a HEAD-ancestor note is
  recognized as actionable rather than "already up to date."

---

## Introduction / Context

ARC's per-developer working state (`user/{identity}/` — SESSION-NOTES, WORKING-MEMORY, inboxes) syncs across
machines as git notes under `refs/notes/arc/user/{identity}`. Cross-WU flat files (WORKING-MEMORY, the inboxes)
can be edited in parallel worktrees, so the load path unions entries by identity across the recent-note window
rather than letting the most-recent note clobber siblings (`mergeCrossWuFile`, `lib/user-sync/merge.ts`).
Deletions are carried as in-band `## Removed:` tombstones that suppress a removed entry's reappearance from an
older note in the window, then GC at a 7-day TTL.

Two confirmed defects in that engine make **removal-bearing** syncs misbehave on a single machine — and a
removal-bearing sync is exactly the shape WU completion produces, when a WORKING-MEMORY or USER-INBOX entry is
deleted as the unit closes:

1. **Duplicate `## Removed:` tombstones.** `appendRemovalTombstones` rebuilds prior state **tombstone-blind**
   (it unions `okEntries` across the window, which ignore tombstones), then re-synthesizes markers. A second
   removal-bearing save re-synthesizes a tombstone for a removal the window already records, appending a
   duplicate.
2. **False `local unsaved` on a clean tree.** `inspectDiskVsLocalSnapshot` (`commands/user/sync-status.ts`)
   compares disk against the **raw** note manifest. After a removal-save the note carries a fresh tombstone the
   disk does not, so the manifests differ and a clean post-sync tree reports `local unsaved`.

A third, related rough edge: post-merge the latest local note can sit on the archived branch tip one commit
behind HEAD (`localNoteFreshness.state === "ancestor"`), and `arc user sync` reports "already up to date" even
though no note is attached to current HEAD — because `decideSyncAction` keys only on remote-ref × disk state and
never consults freshness.

All three are benign and self-healing today (duplicates GC at TTL; the false status clears on `arc user load`;
the stale-attachment is advisory), and WORKING-MEMORY carries an interim-posture workaround. But they are a
**deterministic** break under the removal-bearing sync that rides WU completion. Any workflow that wires a
notes-sync step at completion — `async-merge-lifecycle`'s finalize and unattended-merge legs — ships a broken
sync without these fixes first. That is the prerequisite relationship: this work lands the engine correctness;
`async-merge-lifecycle` consumes it.

This is a deliberate **bridge**. `operational-state-docs` (ADR-022 §4 record/projection model) eventually takes
tombstones out of the rendered file entirely, dissolving both defects at the root, at which point this fix
retires. The forward target is tombstones-as-record-field — **not** a `user/{identity}/.internal/` sidecar, which
`operational-state-docs` explicitly rejects (the dotfile ⇒ never-synced rule is intentional). This spec's
projection is authored as that eventual tombstone-free rendered content, so it composes forward rather than being
torn out.

## Goals

- A clean working tree reads **clean** (`current`) from `arc user status` / `arc sync` immediately after a
  removal-bearing sync, with no `arc user load` needed to clear a false `local unsaved`.
- A removal-tombstone synthesis is **idempotent**: re-running it over a window that already records the removal
  produces no new marker and no duplicate.
- The save-path hash, the load-path materialization basis, and the status comparison basis all derive from **one
  canonical projection** — there is exactly one definition of the rendered file's coherent content, and every
  coherence comparison reads through it.
- `arc user sync` recognizes a HEAD-ancestor note as **actionable** (a save will attach a note to current HEAD)
  rather than reporting "already up to date."
- The canonical projection is an **exported, reusable primitive** that `cross-machine-sync-coherence` extends for
  its cross-machine layer, not a status-local helper it must re-author.

## Non-Goals

- **Removing tombstones from the rendered file.** In-band `## Removed:` rendering on disk and TTL GC stay as they
  are; this work makes coherence comparisons tombstone-insensitive, it does not change what is written to disk.
  Tombstones-as-record-field is `operational-state-docs`.
- **Wiring the completion-time save+push.** The *engine* recognizes HEAD-ancestor freshness as actionable here;
  the *workflow* that actually runs save+push in an unattended finalize sequence stays with
  `async-merge-lifecycle`'s finalize leg.
- **Cross-machine coherence.** Local base-ref staleness, partial-push trust, and notes-ref coherence across
  machines are `cross-machine-sync-coherence`. This work is single-machine, and builds the projection primitive
  CMSC consumes.
- **Changing the merge strategy or the TTL constant.** The list-union-by-identity merge and the 7-day TTL are
  unchanged; only the tombstone-resolution reuse and the comparison basis change.

## Proposed Design

The design is three engine changes plus one shared extraction, over `lib/user-sync/` and the two user commands.
Each numbered unit below is an independently-reviewable surface the task list is built from.

### 1. Shared tombstone-aware resolution (extraction)

`mergeCrossWuFile` already resolves each `(section, key)` identity by recency across the window's entries **and**
live tombstones (the `decided` map: most-recent mention wins; an entry suppresses, a winning tombstone carries
forward; TTL-expired tombstones drop). `appendRemovalTombstones` does **not** — it reconstructs prior state via
`okEntries`, which parse entries only and ignore tombstones.

Extract the resolution into one shared, module-private function in `lib/user-sync/merge.ts` — shape roughly:

```text
resolveCrossWuState(perNoteEntries, perNoteTombstones, now)
  → { liveEntries: CrossWuEntry[], suppressed: Set<id>, winningTombstones: Tombstone[] }
```

`mergeCrossWuFile` is refactored to consume it (behavior-preserving — same materialized output, validated by the
existing merge tests). Unit 2 then routes `appendRemovalTombstones` through the same resolution. This removes the
duplicated, divergent resolution that is the root of defect 1.

### 2. Idempotent removal-tombstone synthesis (defect 1)

`appendRemovalTombstones` rebuilds prior state through the shared resolution from Unit 1 — resolving prior
identities across the window's entries **and** live tombstones — instead of the tombstone-blind `okEntries`
union. An identity already resolved-removed by a live tombstone in the window is no longer counted as a live
prior entry, so it is not re-synthesized. The current content is parsed the same way, so an identity the saved
file already tombstones is recognized rather than re-marked.

Result: synthesizing removal tombstones over a window that already records the removal is a **no-op**. The first
removal still earns exactly one marker; subsequent removal-bearing saves add none for that identity. The
function's signature and call site in `applyRemovalTombstones` (`commands/user/save-load.ts`) are unchanged.

### 3. Canonical tombstone-free projection (defect 2)

Define the single source of truth for the rendered file's coherent content as an **exported** primitive in a new
`lib/user-sync/projection.ts` (surfaced through `lib/user-sync/index.ts`):

```text
projectManifest(manifest: SyncManifest) → SyncManifest
```

For each cross-WU file it returns the **tombstone-free** content (`## Removed:` sections stripped — the existing
`stripTombstoneSections`, lifted out of `merge.ts` into the projection module and reused there); per-WU subdir
files pass through unchanged. The result is exactly the rendered file the forward `operational-state-docs` model
will write — so the bridge's comparison basis is the eventual rendered content.

`inspectDiskVsLocalSnapshot` (`commands/user/sync-status.ts`) moves **every** coherence comparison onto the
projection:

- the disk-vs-note equality test compares `projectManifest(noteManifest)` against `projectManifest(diskManifest)`
  (was: raw `manifestsEqual(noteManifest, diskManifest)`);
- the note hash and disk hash used in the materialized-basis branches are hashed over their projections;
- `materializedManifestHash`, written by `writeLocalSyncState` at both save and load, is the hash of
  `projectManifest(...)` (save: `commands/user/save-load.ts:runUserSave`; load:
  `runUserLoad`).

Because both sides are projected before comparison, a clean post-sync tree — where disk and note hold the same
entries but possibly different in-band tombstone sets — compares **equal** and reads `current`. The stored hash,
the load materialization basis, and the status comparison basis are then one projection.

Existing direction logic (`computeUnsavedDirection`, the `note.commit !== sourceCommit` ancestor/mixed branches)
is preserved; only the manifests it is handed are projected, keeping all hash comparisons within one basis.

### 4. Freshness — HEAD-ancestor note is actionable

`inspectUserSyncState` (`commands/user/sync-status.ts`) does not currently surface
`localNoteFreshness`, so `decideSyncAction` (`handlers/user-sync.ts`) cannot see that the latest note sits on a
HEAD ancestor. Thread the freshness state (reusing `inspectSessionLocalNoteFreshness`, generalized off the
session-init-only path) into `UserSyncState`, and add one arm to `decideSyncAction`: when remote is `in sync`
and disk is `current` but freshness is `ancestor`, return the save direction (`push`) rather than `noop` — so a
follow-up save attaches a note to current HEAD instead of reporting "already up to date." Every other freshness
state (`current-head`, `missing`, `outside-head-ancestry`) leaves the existing decision unchanged.

The *engine* recognizes the condition here; the *workflow* that runs save+push in an unattended finalize stays
with `async-merge-lifecycle`.

### Build-general rationale (CMSC seam)

`projectManifest` is authored exported and reusable, not status-local, because `cross-machine-sync-coherence`
consumes it directly: its sync-state-aware drift detection needs exactly the projection-aware comparison to
distinguish "intentional retirement at source" from "real local drift," and it already dissects the same
`inspectDiskVsLocalSnapshot` / `computeSessionInitLoadNeeded` path this work rewrites. Following the
build-general-once precedent of the behind-base primitive (`lib/git/base-distance.ts` reused the
ref-parameterized `countAheadBehindRef` rather than inventing a parameterized framework), generality here is a
**clean exported primitive with one definition**, not speculative parameter axes — CMSC adds parameters where it
concretely needs them when it lands. A write-back rides to CMSC: moving the status comparison basis raw →
projection changes the classifier behavior CMSC's defect analysis was written against, so CMSC re-grounds its
scope once this lands (tracked in USER-INBOX for CMSC).

## Alternatives & Rationale

- **Re-materialize the note (tombstones re-appended) and compare to disk, instead of a tombstone-free
  projection.** Rejected: after a removal-save the fresh tombstone lands in the note but not on disk (disk is not
  re-materialized at save), so a re-materialized note still carries a tombstone the disk lacks — the comparison
  still mismatches. Only a tombstone-*free* basis makes a genuinely-clean tree compare equal. The tombstone-free
  basis is also the forward-compatible one (it is the eventual rendered file).

- **Strip tombstones from disk too (stop rendering them in-band now).** Rejected for this WU: in-band rendering
  is load-bearing for the current merge mechanism (tombstones must persist across save round-trips to keep
  suppressing within the window), and removing them requires the record/projection split that is
  `operational-state-docs`. Doing it here would pull that WU's scope forward. The bridge keeps disk rendering
  unchanged and makes only the *comparison basis* tombstone-free.

- **Fix `appendRemovalTombstones` by de-duplicating its own output (scan current content for an existing
  marker).** Rejected as a patch over the symptom: the root cause is the second, divergent resolution path.
  Routing it through the same tombstone-aware resolution `mergeCrossWuFile` uses removes the divergence and makes
  idempotency fall out, rather than bolting a dedupe pass onto a tombstone-blind rebuild.

- **A status-local strip helper instead of an exported `projectManifest`.** Rejected: it would force CMSC to
  re-author the projection it must extend, violating the build-general-once contract and risking a second
  divergent definition of "the rendered file's content" — the exact failure mode (two resolutions) this WU
  exists to remove.

- **Auto-run save on `ancestor` freshness inside `arc user sync` itself.** The engine returning the `push`
  direction already drives `arc user sync` to save when invoked directly. The *unattended* finalize wiring (a
  workflow running it without a prompt) stays a consumer concern (`async-merge-lifecycle`), keeping this WU's
  surface to engine recognition.

## Cross-cutting Considerations

- **Testing.** Regression anchors, one per buildable: (1) two consecutive removal-bearing saves over the same
  window produce exactly one `## Removed:` marker per removed identity (idempotency); (2) a removal-bearing save
  followed by `arc user status` reads `current` on an unmodified tree (no false `local unsaved`); (3) a
  save→status loop with no edits stays `current` across repeats; (4) post-merge with the note on a HEAD ancestor,
  `arc user sync` selects the save direction and a follow-up status reads `current with HEAD`. Plus a
  behavior-preserving check that the Unit 1 extraction leaves `mergeCrossWuFile` output byte-identical on the
  existing merge fixtures. Tests live under `packages/arc-framework/__tests__/` per the existing user-sync
  suites.
- **Migration / data.** None. No note format change, no manifest version bump (`SyncManifest.version` unchanged),
  no on-disk migration. Existing notes — tombstone-bearing or not — project identically; the change is purely in
  the comparison/hash basis and the synthesis path.
- **Backward compatibility.** Notes written before this change load and compare correctly; notes written after
  remain readable by the unchanged merge path. The projection is a pure function of an existing manifest.
- **Performance.** `projectManifest` is a per-file string strip over the already-loaded manifest — negligible
  against the existing serialize / git-notes I/O. No new git calls; the freshness thread reuses an inspection the
  status path already performs at session-init.
- **User-facing impact.** `arc user status` / `arc sync` stop reporting a spurious `local unsaved` after WU
  completion, and `arc user sync` offers a save instead of "already up to date" when the note trails HEAD. No CLI
  surface, flag, or output-shape change beyond the corrected classifications.
- **Scope of edit.** `lib/user-sync/merge.ts` (extract + route), new `lib/user-sync/projection.ts` (+ `index.ts`
  export), `commands/user/sync-status.ts` (projection-based comparison + freshness thread),
  `commands/user/save-load.ts` (projection-based `materializedManifestHash`), `handlers/user-sync.ts`
  (`decideSyncAction` freshness arm). Single subsystem; single-copy code under `packages/arc-framework/src` (no
  two-copy mirror).

## Success Criteria

- Two consecutive removal-bearing saves over a window already recording the removal add **zero** new
  tombstones; the raw note carries exactly one `## Removed:` marker per removed identity.
- `arc user status` and `arc sync` report `current` on an unmodified tree immediately after a removal-bearing
  save — no `arc user load` required to clear it.
- The save-path `materializedManifestHash`, the load-path `materializedManifestHash`, and the status comparison
  all derive from `projectManifest`; a grep finds exactly one definition of the tombstone-free projection and no
  remaining raw-manifest coherence comparison in `inspectDiskVsLocalSnapshot`.
- `projectManifest` is exported from `lib/user-sync` and has no dependency on command-layer code (consumable by
  `cross-machine-sync-coherence` as-is).
- With the latest note on a HEAD ancestor and the tree otherwise clean, `arc user sync` selects the save
  direction and a subsequent status reads `current with HEAD`.
- The Unit 1 extraction leaves `mergeCrossWuFile`'s materialized output unchanged on the existing merge fixtures.
- All quality gates pass: `npm run -s lint:md`, `npm run lint:ts`, `npm run typecheck:all`, `npm test`,
  `npm run build`.

## Open Questions

None blocking. The one design fork the draft left implicit — how *general* `projectManifest` is built — is
resolved above (a single exported primitive following the behind-base precedent, parameter axes deferred to CMSC
where they are concrete), and the freshness behavioral boundary (engine recognizes vs. workflow acts) is settled
against the `async-merge-lifecycle` split.
