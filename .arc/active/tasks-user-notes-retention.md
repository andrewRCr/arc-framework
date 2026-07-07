# Task List: user-notes-retention

- **Design:** `spec-user-notes-retention.md`

---

## **Phase 1:** Export coherence — stop the bleeding

_Purpose:_ Halt the live divergence/bloat (spec Phase A) so every later phase works against a converging ref.
Independently shippable; closes with the live convergence check that is the phase's exit criterion.

_Design decisions:_ All four fixes land in the export/reconcile pair (`lib/user-sync/branch-bounded-notes-export.ts`,
`commands/user/push-fetch.ts`) without restructuring them — `user-sync-module-split` owns the decomposition
cut-map (see `notes-user-notes-retention.md` § Scope & sequencing).

### `[x]` **1.1 Adopt-if-superset push reconciliation**

- _Goal:_ A paired push whose pushed tip carries every local note adopts that tip locally, so the local ref
  stops re-diverging after every steady-state primary sync.
- _Outcome:_ `BranchBoundedNotesExportTarget` now carries a plan-time `supersedesLocal` verdict, so
  `adoptPushedTipIntoLocalRef` adopts temp exports that preserve every local `(blob, commit)` pair while still
  declining genuine subsets and preserving the `priorLocalTip` CAS guard.

### `[x]` **1.2 Identical-blob skip in the export overlay**

- _Goal:_ A steady-state export adds ~zero new note commits — origin's byte-identical notes are never re-added.
- _Outcome:_ `planBranchBoundedNotesExport` skips `git notes add -f` when the remote blob already matches the
  local blob, letting fully-identical exports collapse to a `noop` and keeping differing remote blobs on the
  existing refusal/overlay paths.

### `[x]` **1.3 Pinned-tip paired push**

- _Goal:_ The notes push ships exactly the tip the plan validated — a sibling save landing in the plan→push
  window can never widen the export.
- _Outcome:_ `pushBranchBoundedNotesExport` now pushes `${target.tip}:${destinationRef}` rather than the mutable
  source ref name, and the real-git regression proves a later local notes-ref advance remains local.

### `[x]` **1.4 Typed outcome for reconcile re-push failure**

- _Goal:_ `arc sync` can never report success while `arc user status` would report diverged — a second
  non-fast-forward during the reconcile re-push is a typed outcome, not an escaped throw.
- _Outcome:_ `reconcileAndRepush` now wraps the re-push, maps a second non-FF to the existing `conflict` outcome,
  maps other re-push failures through the existing outcome taxonomy, and deletes the `__incoming` temp ref from a
  `finally` path.

### `[x]` **1.5 Live steady-state convergence validation**

- _Goal:_ Phase A's exit criterion is observed on the live repo, and the standing operational guard retires on
  its recorded trigger.
- _Outcome:_ After rebuilding the CLI, the first sync settled current local-ahead notes, then a measured
  steady-state `arc sync -y --json` returned notes `noop`; the fetched remote notes tip stayed
  `9c362962c0c953a8628d3691582b9d7f504e5e78` and `git rev-list --count` stayed `11692` before/after. `arc user
  status --json` reported notes up to date, the divergence/bloat WORKING-MEMORY entry was retired, and the
  tombstone guard now names only the remaining Phase B trigger.

## **Phase 2:** Write discipline — concurrency model and ref serialization

_Purpose:_ Establish the written concurrency model and enforce its ref-level discipline — lock-serialized
reconcile, CAS-guarded rollback and fetch/pull, hardened lock breaks — plus the interleaving-test substrate the
guards are proven against.

_Design decisions:_ The model document lands first as the checkable statement of spec B1's per-mutator
assignments; the enforcement tasks implement it. Interleaving tests ride each guard's task (test-first,
grouped by concern) rather than pooling in a test phase; 2.2 builds the shared substrate and proves it on the
C3 interleaving.

### `[x]` **2.1 Concurrency-model document**

- _Goal:_ Every mutator of shared user-notes state has one written, assigned discipline that a maintainer
  changing this code can check a diff against.
- _Outcome:_ Added `strategy-user-notes-concurrency.md` with the lock-serialized / CAS-guarded /
  lock-free-by-design assignment for current user-notes mutators, plus the operation-triggered
  `STRATEGY-INDEX.md` consult entry for future shared-state writes.

### `[x]` **2.2 Interleaving test harness**

- _Goal:_ A two-writer interleaving against a temp repo is expressible as an ordinary deterministic
  integration test — no timing sleeps, no flake.
- _Outcome:_ Extended `multi-clone.ts` with same-common-dir worktree siblings, manual step barriers, and
  note-entry/ref-tip helpers; added `user-notes-interleaving.test.ts` proving a sibling save between plan and
  push is neither exported by the pinned notes push nor clobbered by the best-effort adopt.

### `[x]` **2.3 Reconcile critical-section serialization and CAS-guarded rollback**

- _Goal:_ A sibling save can never land between merge and rollback — a known-corrupt ref never survives with a
  save on top, and a rollback never erases a concurrent lock-guarded save.

    - `[x]` **2.3.a Lock the reconcile critical section**
        - `reconcileAndRepush` now acquires the repo-shared notes lock for remote-temp fetch, notes merge,
          corrupt-note scan, rollback decision, and temp cleanup; the re-push runs only after release.

    - `[x]` **2.3.b CAS-guard the rollback**
        - Corrupt-merge rollback now uses the expected-old `postMergeTip` (`update-ref <ref> <pre> <post>`,
          or guarded delete for a previously absent ref) and maps rollback failure to a typed conflict with
          no re-push.

    - `[x]` **2.3.c C2 interleaving tests**
        - `notes-reconcile-push.test.ts` pins the lock span ordering, clean corrupt rollback, merge-failure
          abort, second non-FF during re-push, and CAS-declined rollback-without-publish behavior.

### `[x]` **2.4 Ancestry-guarded fetch/pull**

- _Goal:_ `arc user fetch`/`pull` can only fast-forward the local ref — a local-ahead or diverged ref refuses
  with a typed outcome and reconcile instruction, never a silent force-reset.
- _Outcome:_ `runUserFetch` now fetches remote notes into a per-call temp ref, classifies ancestry, and moves
  the canonical notes ref only through an expected-old `update-ref`; local-ahead, diverged, and mid-fetch CAS
  races return typed refusals. `runUserPull`, `arc user fetch`/`pull`, and sync pull all skip disk load on
  declined fetches and surface the reconcile path instead of force-resetting local notes.

### `[x]` **2.5 Break-lock serialization for stale-lock breaks**

- _Goal:_ Two contenders judging a dead holder breakable converge on one winner — a stale-lock break can never
  delete a freshly-won live lock.
- _Outcome:_ Stale main-lock breaks now acquire a sibling `.notes.lock.break`, re-read the main holder inside it,
  unlink only an unchanged breakable holder, and release by token before re-racing normal acquisition. The
  break-lock carries its own dead-pid / TTL stale policy, with regressions for concurrent breakers, fresh-live
  re-read backoff, dead and aged break-lock cleanup, and live-holder preservation.

## **Phase 3:** Save-path guard and state coherence

_Purpose:_ Make C1 impossible by construction (the materialized-baseline stamp) and finish the invariant sweep
over disk, window, temp-ref, marker, and status state — the truth-telling half of spec Phase B. Phase B's exit
lifts the WORKING-MEMORY tombstone-hazard guard on its recorded trigger.

_Design decisions:_ The stamp lives in the machine's repo-shared user-internal store (lock-covered, updated by
any worktree's load or save) and records the materialized entry set — never a bare tip re-resolved through the
recency window. Both calls are the spec's (B2, with the per-worktree-scope alternative rejected as recreating
C11); tasks below implement, not re-decide.

### `[x]` **3.1 Materialized-baseline stamp save guard**

- _Goal:_ Tombstone synthesis diffs disk only against the entry set disk actually materialized — an entry
  merged into the ref but never written to disk can never read as a deletion.

    - `[x]` **3.1.a Stamp record and writers**
        - Added the repo-shared materialized-baseline stamp with projected manifest hash, notes-ref tip,
          materialized file hashes, and parsed cross-WU entry identities. Verified save/load write it under
          the notes lock, and a sibling-style load advances the same git-common-dir stamp.

    - `[x]` **3.1.b Rewire tombstone synthesis**
        - `applyRemovalTombstones` now diffs against the materialized-baseline stamp's recorded entry identities,
          ignores ref-only entries that disk never materialized, preserves tombstones for stamp-recorded missing
          entries, and synthesizes nothing when the stamp is absent after upgrade.

    - `[x]` **3.1.c Atomic one-lock-span diff inputs**
        - `runUserSave` now resolves `HEAD`, serializes disk, reads the stamp, synthesizes tombstones, writes
          and verifies the note, and advances the stamp inside one notes-lock span; concurrent saves prove the
          snapshot steps no longer overlap before lock acquisition.

    - `[x]` **3.1.d C1 interleaving tests**
        - Added real-git interleaving coverage proving reconcile-merged entries survive repeated saves before
          disk load, and a paused save racing a load/stamp advance does not synthesize a tombstone for the
          just-materialized entry.

- _Outcome:_ The save guard now records a repo-shared materialized baseline, diffs tombstones only against that
  materialized entry set, and locks save snapshot inputs with the stamp read/write so ref-only entries and
  concurrent load materialization cannot be misread as deletions.

### `[x]` **3.2 Atomic identity-global disk writes under lock**

- _Goal:_ A torn read of an identity-global file is impossible — materialization is atomic and lock-covered,
  removing C1's amplifier.

- _Outcome:_ User-sync file writes now go through a reusable temp-then-rename text writer, and `runUserLoad`
  holds the notes lock across materialization, readback verification, and baseline-stamp advancement. The
  integration race pins that a save cannot read a partial identity-global load write.

### `[x]` **3.3 Window/TTL alignment**

- _Goal:_ The tombstone TTL strictly dominates the merge window — a deletion can never resurrect because its
  tombstone expired while pre-deletion notes were still in-window.

- _Outcome:_ The recent-note reader is now count- and TTL-bounded using the exported tombstone TTL, filters
  notes older than the horizon, and skips zero-note merge commits without consuming the effective window. The
  sparse-save regression proves expired tombstones and their pre-deletion notes fall out together.

### `[x]` **3.4 Unique temp refs**

- _Goal:_ Concurrent probes and reconciles never delete each other's temp refs — no false
  `remote-unavailable` verdicts.

- _Outcome:_ Notes reconcile incoming refs and status probe refs now carry per-call `uniqueRefToken()` suffixes,
  with cleanup targeting the caller's exact ref. Unit coverage pins tokenized fetch/merge/delete lifecycles and
  concurrent status probes deleting only their own `arc-sync-temp` refs.

### `[x]` **3.5 Partial-push marker keying and versioned sync-state read-modify-write**

- _Goal:_ A sibling's save no longer invalidates another worktree's recovery state, and concurrent
  `.sync-state.json` writers can never drop each other's markers.

- _Outcome:_ Partial-push coherence now accepts an ancestor marker tip, while non-ancestor force-moved refs still
  invalidate the marker. Local sync-state writes run through an adjacent lock plus raw-file version check/retry,
  so concurrent notes and errand marker writers preserve both fields; the status copy already distinguishes
  concurrent-local-writer and partial-push recovery without the C10 mislabels.

### `[x]` **3.6 Status purity and scope corrections**

- _Goal:_ Status reads report and never mutate; verdicts scope worktree-local vs shared state truthfully; no
  status surface ever recommends a destructive action.

    - `[x]` **3.6.a Read purity**
        - Status no longer clears partial-push markers while reporting; marker clearing stays with the
          mutating operations that actually resolve recovery conditions.

    - `[x]` **3.6.b Scope and recommendation corrections**
        - Status now reads the repo-shared materialized-baseline stamp for identity-global disk truth, writes
          each worktree's notes-ref tip into local sync-state, and attributes local-ahead/diverged causes to
          the authoring worktree when the tip differs.

    - `[x]` **3.6.c Retired-subdir roster check**
        - Retired-subdir cleanup now preserves shipped subdirs when a same-machine roster entry for the WU is
          still in flight, while cross-machine shipped cleanup keeps the recoverable backup path.

    - `[x]` **3.6.d C12 folds**
        - Corrupt-note scans fail closed on list/show read failures, paired sync reports partial-publish
          recording only when the marker write succeeds, the errand sync leg records marker success in its
          outcome detail, and saved-note verification remains inside the notes-lock span.

    - `[x]` **3.6.e Worktree qualifier timeout isolation**
        - `arc user status` now awaits the branch-bounded worktree probe before starting the note-history
          workload, so the qualifier timeout measures the branch fetch rather than the full status scan.

- _Outcome:_ Status is read-only, shared-vs-worktree provenance is separated, ref-only note advances route to
  load/inspect instead of save, and Phase B's tombstone-hazard operating guard is retired.

## **Phase 4:** Retention and compaction

_Purpose:_ Compact accumulated history to a snapshot baseline and prune under the stated retention policy,
safely against lagging siblings (spec Phase C) — leaning on Phase 1's adopt primitive and Phase 2/3
invariants. Severable as its own ship if Large proves heavy (`notes-user-notes-retention.md`).

_Design decisions:_ Correctness rides the in-band cumulative prune manifest, never the marker seam or team
coordination; retention parameters are internal constants, not config keys. Never union-merge across a
compaction boundary.

### `[x]` **4.1 Compaction snapshot writer with cumulative prune manifest**

- _Goal:_ One lock-held operation compacts the ref to a snapshot whose tree itself states every pair ever
  deliberately pruned — recoverable, lease-pushed, and safe to interrupt.

    - `[x]` **4.1.a Prune manifest format and cumulativity**
        - Added the reserved non-SHA manifest entry with cumulative pruned `(blob, commit)` pairs,
          pre-compaction tip, and monotonic generation; note readers continue to expose only SHA-addressed notes.

    - `[x]` **4.1.b Snapshot build and publish**
        - Added the explicit retained/pruned snapshot writer: it backs up the pre-compaction ref, builds a
          root snapshot tree from retained notes plus the manifest, lease-pushes it, and rolls local state back
          on publish failure.

- _Outcome:_ Compaction now has a pure snapshot boundary, cumulative in-band prune proof, backup ref, and
  interruption-safe publish path covered by real-git regressions.

### `[x]` **4.2 Compaction-aware sibling adopt**

- _Goal:_ A sibling detecting a snapshot rewrite adopts it losslessly — manifest-pruned pairs drop, collisions
  union per-path, absent local notes re-export — and never union-merges across the boundary.

    - `[x]` **4.2.a Rewrite detection and disposition engine**
        - Added compaction-aware adopt that takes a fetched snapshot, drops manifest-pruned pairs, unions
          same-commit JSON-manifest collisions, re-exports absent local notes, and leaves the local ref untouched
          on unparseable collisions.

    - `[x]` **4.2.b Integrity warning**
        - Added advisory warnings for locally-provable pre-compaction omissions while preserving marker-absent
          adopt via the snapshot's in-band manifest.

- _Outcome:_ Lagging siblings adopt compacted snapshots without crossing the history boundary, and regressions
  cover local-only survival, pruned-pair dropping, collision conflict rollback, multi-generation lag, and
  integrity warnings.

### `[x]` **4.3 Export/push compaction-boundary guard**

- _Goal:_ A stale sibling's push can never resurrect pruned notes as a clean fast-forward of the snapshot.
- _Outcome:_ Branch-bounded export and non-fast-forward reconcile both fetch the remote generation before
  staging, adopt newer snapshots first, then stage from the post-adopt baseline so pruned notes stay pruned.

### `[x]` **4.4 Generation marker seam on the sync-state ref**

- _Goal:_ Siblings detect a rewrite cheaply — without walking the ref — while correctness stays with the
  in-band manifest.
- _Outcome:_ Added a typed `notes-compaction` sync-state entry plus reconcile-push publisher; `arc user compact`
  writes the latest generation marker, while snapshot-rooted adopt remains correct if the marker is absent.

### `[x]` **4.5 Retention policy**

- _Goal:_ Retain-or-prune is a pure, unit-tested rule over note entries, with the spec's parameter defaults
  as named internal constants.
- _Outcome:_ Added pure retention partitioning with named constants for newest-K retention, 30-day prune age,
  30-day backup retention, and the ~2,000-commit advisory threshold; tests cover newest, age-gated,
  in-flight, and legacy root-`SESSION-NOTES` behavior.

### `[x]` **4.6 `arc user compact` command**

- _Goal:_ Compaction is a manual, interlock-gated command with typed outcomes and an on-demand advisory
  signal in status.
- _Outcome:_ Added `arc user compact` with human/JSON outcomes, lock-held retention + snapshot composition,
  backup pruning, sync-state marker publication, and `arc user status` advisory output; the command integration
  proves compaction collapses history, lands the marker, and no-ops on a second run.

### `[x]` **4.7 Session-init compaction advisory**

- _Goal:_ Orientation nudges compaction when ref history exceeds the advisory threshold — once per calendar
  day, offer-only, never auto-run.
- _Outcome:_ Added the session-init compaction advisory slot with shared nudge-marker state and updated the
  package workflow template plus installed `.arc` copy to render the once-per-day offer without auto-running
  compaction.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A live steady-state primary `arc sync` converges: `arc user status` reports current immediately after,
  and the remote ref gains ~zero commits (vs. +886 today)
- `[ ]` C1 is impossible by construction: interleaving tests prove a save cannot tombstone an entry the disk
  never materialized (reconcile→save→save and load∥save both)
- `[ ]` The C2, C3, and C4 interleavings and the C9 verdict-coherence case are regression-tested
- `[ ]` `arc user fetch`/`pull` refuse with a typed outcome + reconcile instruction on a local-ahead/diverged
  ref — no silent force-reset
- `[ ]` Remote ref history is compacted to the snapshot baseline (order ~10² commits, not ~10⁴); the 427
  pre-migration root-`SESSION-NOTES` notes and retired-WU accumulation prune per the retention criterion
- `[ ]` A sibling clone with local-only notes adopts a compacted ref losslessly (verified by content diff)
- `[ ]` The WORKING-MEMORY interim guard entries (avoid notes-pushing syncs; never save over an un-materialized
  reconcile) have their recorded removal triggers met
- `[ ]` All quality gates pass (tests, linting, type checking, build)
- `[ ]` Ready for integration
