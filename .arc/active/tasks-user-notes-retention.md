# Task List: user-notes-retention

- **Design:** `spec-user-notes-retention.md`

---

## **Phase 1:** Export coherence — stop the bleeding

_Purpose:_ Halt the live divergence/bloat (spec Phase A) so every later phase works against a converging ref.
Independently shippable; closes with the live convergence check that is the phase's exit criterion.

_Design decisions:_ All four fixes land in the export/reconcile pair (`lib/user-sync/branch-bounded-notes-export.ts`,
`commands/user/push-fetch.ts`) without restructuring them — `user-sync-module-split` owns the decomposition
cut-map (see `notes-user-notes-retention.md` § Scope & sequencing).

### `[ ]` **1.1 Adopt-if-superset push reconciliation**

- _Goal:_ A paired push whose pushed tip carries every local note adopts that tip locally, so the local ref
  stops re-diverging after every steady-state primary sync.

    - Compute the superset verdict at plan time — `planBranchBoundedNotesExport` already holds the local
      entries and the remote entry map — and thread it on `BranchBoundedNotesExportTarget` (e.g. a
      `supersedesLocal` boolean; trivially true on the fast path). Plan-time data is race-safe because the
      `priorLocalTip` compare-and-swap already declines on any post-plan local advance.
    - Replace the `omittedCommits.length > 0` decline in `adoptPushedTipIntoLocalRef`
      (`branch-bounded-notes-export.ts`) with that verdict: adopt when the pushed tip contains every local
      `(blob, commit)` pair; keep the existing no-adopt path (next-push reconcile) on a genuine subset.
    - Build `test-first` (one behavior at a time):
        - adopts the pushed tip when it holds every local `(blob, commit)` pair (the primary's steady case,
          `omitted > 0` but content-superset)
        - declines the adopt when the pushed tip lacks a local pair (genuine branch-bounded subset)
        - a concurrent local save between plan and push still fails the swap and is never clobbered

### `[ ]` **1.2 Identical-blob skip in the export overlay**

- _Goal:_ A steady-state export adds ~zero new note commits — origin's byte-identical notes are never re-added.

    - In the overlay loop (`planBranchBoundedNotesExport`, `branch-bounded-notes-export.ts:156-168`), skip the
      `git notes add -f` when `remoteBlob === entry.blob` instead of only checking it for refusal.
    - Verify the all-skipped case falls out: when every add skips, the staged ref's tip equals the fetched
      remote tip, and `pushBranchBoundedNotesExport` already resolves `remoteTip === target.tip` as `noop` —
      confirm rather than add code.
    - Build `test-first` (one behavior at a time):
        - a note whose remote blob is byte-identical is not re-added to the staged ref
        - a note with a differing remote blob still follows the existing refuse/overlay rules
        - a fully-identical export resolves to a no-op push

### `[ ]` **1.3 Pinned-tip paired push**

- _Goal:_ The notes push ships exactly the tip the plan validated — a sibling save landing in the plan→push
  window can never widen the export.

    - In `pushBranchBoundedNotesExport` (`branch-bounded-notes-export.ts:209`), push
      `${target.tip}:${destinationRef}` instead of `${target.ref}:${destinationRef}` — the fast path
      (`ref === destinationRef`) currently ships the ref by name, exporting whatever it points at by push time.

### `[ ]` **1.4 Typed outcome for reconcile re-push failure**

- _Goal:_ `arc sync` can never report success while `arc user status` would report diverged — a second
  non-fast-forward during the reconcile re-push is a typed outcome, not an escaped throw.

    - Wrap the re-push inside `reconcileAndRepush` (`push-fetch.ts:284`): a second non-FF returns the
      existing `NotesPushOutcome` `conflict` kind (message naming the reconcile path), and the `__incoming`
      temp ref is cleaned up on every exit path (today the raw throw skips the `update-ref -d`). Other
      re-push failures map to their existing outcome kinds (`blocked` / `no-remote` / `failed`) — only the
      non-FF mapping is new.
    - Verify each consumer maps `conflict` to failure — `pushNotesLeg` (`handlers/sync.ts:1201-1203`) and the
      single-leg push/user-sync handlers already do; no new envelope wiring expected.
    - Regression test: remote advances again mid-reconcile → typed conflict, local ref intact, no leaked
      `__incoming`, sync verdict and status verdict agree.

### `[ ]` **1.5 Live steady-state convergence validation**

- _Goal:_ Phase A's exit criterion is observed on the live repo, and the standing operational guard retires on
  its recorded trigger.

    - From this worktree's own rebuilt WU branch (`npm run build` — the primary checkout hosts this WU, and
      the notes ref is common-dir-shared, so no base-merge is needed for the live probe): run a steady-state
      `arc sync`; verify `arc user status` reports current immediately after, and the remote notes ref gains
      ~zero commits (vs. +886 today) — compare `git rev-list --count` on the fetched remote notes tip before
      and after the sync.
    - Retire the WORKING-MEMORY "notes-sync divergence/bloat" entry per its removal trigger; update the
      tombstone-hazard entry to reflect that only the Phase B trigger remains.
    - Tier 2 gate (full suite) closes the phase.

## **Phase 2:** Write discipline — concurrency model and ref serialization

_Purpose:_ Establish the written concurrency model and enforce its ref-level discipline — lock-serialized
reconcile, CAS-guarded rollback and fetch/pull, hardened lock breaks — plus the interleaving-test substrate the
guards are proven against.

_Design decisions:_ The model document lands first as the checkable statement of spec B1's per-mutator
assignments; the enforcement tasks implement it. Interleaving tests ride each guard's task (test-first,
grouped by concern) rather than pooling in a test phase; 2.2 builds the shared substrate and proves it on the
C3 interleaving.

### `[ ]` **2.1 Concurrency-model document**

- _Goal:_ Every mutator of shared user-notes state has one written, assigned discipline that a maintainer
  changing this code can check a diff against.
- **Additional Context:** `spec-user-notes-retention.md` § Phase B (B1 — the per-mutator assignment and its
  rationale)

    - Author `.arc/reference/strategies/project/strategy-user-notes-concurrency.md`: enumerate the shared
      state (canonical notes ref, identity-global disk files, `.sync-state.json`, partial-push markers, temp
      refs) and every mutator, each with its assigned discipline — lock-serialized, CAS-guarded, or
      lock-free-by-design — and the accepted residuals (B3's shrunk break race; stale-plan reconcile on the
      lock-free export).
    - Enumerate mechanically, not from the spec alone: sweep the mutation sites (`update-ref`, fetch
      refspecs, `writeNote`, `git notes` add/merge) and classify each — e.g.
      `lib/session-init/dead-ref-prune.ts` sits on the read/mutate boundary and needs an explicit call.
    - Include the Phase 4 compaction writer as an enumerated (lock-serialized) mutator so the model is
      complete when that phase lands.
    - Add the `STRATEGY-INDEX.md` entry authored as a directive firing condition anchored to the operation
      ("consult before adding or modifying any mutator of shared user-notes state — ref, identity-global
      disk, sync-state, markers, temp refs"), not a passive summary.

### `[ ]` **2.2 Interleaving test harness**

- _Goal:_ A two-writer interleaving against a temp repo is expressible as an ordinary deterministic
  integration test — no timing sleeps, no flake.

    - Extend the existing multi-clone fixture (`__tests__/helpers/multi-clone.ts` — bare origin plus two
      parameterizable clones, built for reuse) with a same-machine worktree-sibling topology and
      step-controlled operation drivers with barrier points between git steps; the injectable seams in
      `lib/user-sync/notes-lock.ts` (`AdvisoryLockOptions`: `exclusiveCreate`, `sleep`, `isProcessAlive`,
      `now`) give deterministic lock scheduling.
    - Assertion helpers: notes-ref content diff (blob-level), note listing, ref-tip comparison — the same
      0-local-only content check the spec's success criteria use.
    - Proving case — the C3 interleaving: a sibling save landing between plan and push is neither exported
      (pinned tip, 1.3) nor clobbered (adopt CAS, 1.1). Validates the harness and completes B7's C3
      coverage, which Phase 1's unit-level behaviors only half-carry.
    - Small deterministic fixtures only — the scale/perf harness rides `user-sync-module-split`
      (see `notes-user-notes-retention.md` § Scope & sequencing).

### `[ ]` **2.3 Reconcile critical-section serialization and CAS-guarded rollback**

- _Goal:_ A sibling save can never land between merge and rollback — a known-corrupt ref never survives with a
  save on top, and a rollback never erases a concurrent lock-guarded save.

    - `[ ]` **2.3.a Lock the reconcile critical section**
        - In `reconcileAndRepush` (`push-fetch.ts`), hold the per-identity notes lock
          (`acquireAdvisoryLock` / `getNotesLockPath`) across merge → corrupt-scan → rollback decision;
          the re-push runs after release (network never inside the bounded wait).
        - The advisory lock is non-reentrant (a same-pid second acquire waits into the timeout): keep the
          span flat — no nested acquire anywhere inside merge → scan → rollback.
        - Concurrent reconciles serialize, so the second no longer tears down the first's in-progress
          `NOTES_MERGE_*` state via `merge --abort`.

    - `[ ]` **2.3.b CAS-guard the rollback**
        - The corrupt-merge rollback (`push-fetch.ts:271-273`) becomes
          `update-ref <ref> <preMergeTip> <postMergeTip>` — expected-old-value guarded. On CAS decline,
          abort with a typed conflict outcome and never re-push (a known-corrupt ref is never published).
          Preserve the existing `preMergeTip !== null` guard — a null pre-merge tip takes the
          guarded-delete analogue (`update-ref -d <ref> <postMergeTip>`).

    - `[ ]` **2.3.c C2 interleaving tests**
        - Build `test-first` (one behavior at a time):
            - a sibling save during an in-progress reconcile waits (lock held) and lands after the rollback
              decision — never erased, never stacked on a corrupt ref
            - a corrupt merge rolls back cleanly and reports the typed conflict
            - CAS-declined rollback aborts without publishing anything

### `[ ]` **2.4 Ancestry-guarded fetch/pull**

- _Goal:_ `arc user fetch`/`pull` can only fast-forward the local ref — a local-ahead or diverged ref refuses
  with a typed outcome and reconcile instruction, never a silent force-reset.

    - Replace the force-refspec path (`runUserFetch` refspec in `push-fetch.ts:151-156`; the `force: hasLocal`
      arm in `handlers/user.ts:475-481`) with fetch-to-temp + ancestry-guarded `update-ref <ref> <new>
      <expected-old>` — the guard is the ref update itself, closing the inspect→fetch TOCTOU.
    - `runUserFetch` returns `void` today — introduce a discriminated fetch outcome (`fast-forwarded` /
      `created` / `refused-local-ahead` / `refused-diverged` / `remote-unavailable`) that `runUserPull` and
      all three consumers map (`handlers/user.ts:480` fetch, `:557` pull, `handlers/user-sync.ts:256`).
      Reuse the existing CAS vocabulary (`isCasRejectionError`, `notes-merge.ts:34`; the retry frame in
      `lib/user-sync/cas-retry.ts`) rather than minting a parallel idiom.
    - On decline (local-ahead / diverged): typed refusal naming the reconcile path (`arc user push` /
      `arc sync`); `runUserPull` skips its load step on a declined fetch.
    - Build `test-first` (one behavior at a time):
        - remote-ahead fast-forwards cleanly
        - local-ahead refuses with the typed outcome and leaves the ref untouched
        - diverged refuses identically; a mid-fetch local advance fails the guarded update rather than
          resetting it

### `[ ]` **2.5 Break-lock serialization for stale-lock breaks**

- _Goal:_ Two contenders judging a dead holder breakable converge on one winner — a stale-lock break can never
  delete a freshly-won live lock.

    - Add a secondary exclusive-create break-lock beside the main lockfile (`lib/user-sync/notes-lock.ts`):
      a breaker acquires it, re-reads the main lockfile inside it, unlinks only if the stale holder record
      is unchanged, then releases; the winner re-races the normal `O_EXCL` create.
    - The break-lock carries its own holder record and short staleness policy (~30s TTL + dead-pid check,
      removed via the same verify-then-unlink); wire into the breakable path at `notes-lock.ts:199-201`.
    - Record the accepted residual (break race re-admitted one level down, milliseconds-wide) in the 2.1
      model doc; note the `flock` upgrade path.
    - Build `test-first` (one behavior at a time):
        - two concurrent breakers of a dead holder: exactly one wins, the loser backs off and re-races
        - a slower breaker re-reading inside the break-lock sees the fresh live holder and backs off
        - a stale break-lock (dead holder or past TTL) is itself broken safely
        - a live main-lock holder is never evicted through the break path
    - Tier 2 gate (full suite) closes the phase.

## **Phase 3:** Save-path guard and state coherence

_Purpose:_ Make C1 impossible by construction (the materialized-baseline stamp) and finish the invariant sweep
over disk, window, temp-ref, marker, and status state — the truth-telling half of spec Phase B. Phase B's exit
lifts the WORKING-MEMORY tombstone-hazard guard on its recorded trigger.

_Design decisions:_ The stamp lives in the machine's repo-shared user-internal store (lock-covered, updated by
any worktree's load or save) and records the materialized entry set — never a bare tip re-resolved through the
recency window. Both calls are the spec's (B2, with the per-worktree-scope alternative rejected as recreating
C11); tasks below implement, not re-decide.

### `[ ]` **3.1 Materialized-baseline stamp save guard**

- _Goal:_ Tombstone synthesis diffs disk only against the entry set disk actually materialized — an entry
  merged into the ref but never written to disk can never read as a deletion.

    - `[ ]` **3.1.a Stamp record and writers**
        - Define the stamp — a schema-versioned record: materialized entry list + manifest hash, tip
          alongside for cheap comparison — in the machine's repo-shared user-internal store
          (`getRepoSharedUserInternalDir`, `lib/user-sync/repo-shared-paths.ts` — beside the notes lock
          that covers it); every load and save writes it under that lock. The load path acquires the lock
          for its stamp write here; 3.2 widens coverage to the full materialization span.
        - Build `test-first` (one behavior at a time):
            - a load writes the stamp matching what it materialized
            - a save updates the stamp to the saved entry set
            - a sibling worktree's load advances the shared stamp (identity-global, not per-worktree)

    - `[ ]` **3.1.b Rewire tombstone synthesis**
        - `applyRemovalTombstones` (`save-load.ts:530`) diffs against the stamp's recorded entry set instead
          of the recent-note window; absent stamp → synthesize nothing.
        - Build `test-first` (one behavior at a time):
            - an entry in the ref but absent from the stamp and disk synthesizes no tombstone
            - an entry the stamp records as materialized and now disk-absent still earns its tombstone
            - no stamp → no synthesis (first run after upgrade)

    - `[ ]` **3.1.c Atomic one-lock-span diff inputs**
        - Move disk serialization (`serializeSplitUserManifest`, `save-load.ts:112`) inside the lock span
          (today it runs before the acquire at `:128`), so a sibling's concurrent load can never advance the
          stamp past the disk snapshot the diff uses. HEAD resolve moves inside the span too (C12 fold).

    - `[ ]` **3.1.d C1 interleaving tests**
        - Build `test-first` (one behavior at a time):
            - reconcile → save → save: the reconcile-merged, never-materialized entry survives both saves
            - load∥save: the interleaved load cannot induce a spurious tombstone for the just-materialized
              entry

### `[ ]` **3.2 Atomic identity-global disk writes under lock**

- _Goal:_ A torn read of an identity-global file is impossible — materialization is atomic and lock-covered,
  removing C1's amplifier.

    - Identity-global file writes (`createUserIOContext().writeFile` — plain `fs.writeFile`,
      `io-context.ts:153`) become temp+rename; load's materialization runs under the notes lock.
    - Integration test: a reader mid-materialization sees either the old or the new content, never a torn mix.

### `[ ]` **3.3 Window/TTL alignment**

- _Goal:_ The tombstone TTL strictly dominates the merge window — a deletion can never resurrect because its
  tombstone expired while pre-deletion notes were still in-window.

    - The cross-WU window (`CROSS_WU_NOTE_WINDOW`, `lib/user-sync/notes-ref.ts:26`) becomes time+count
      bounded, co-designed with the `TOMBSTONE_TTL_MS` contract (`lib/user-sync/merge.ts:353`); reconcile
      merge commits (zero note-path delta) stop consuming window slots.
    - Build `test-first` (one behavior at a time):
        - a note older than the TTL bound falls out of the window regardless of count
        - sparse saves (< window-count in TTL span): expired tombstones and their pre-deletion notes leave
          the window together — the C7 resurrection case
        - merge commits do not shrink the effective window

### `[ ]` **3.4 Unique temp refs**

- _Goal:_ Concurrent probes and reconciles never delete each other's temp refs — no false
  `remote-unavailable` verdicts.

    - Propagate the per-call `uniqueRefToken()` pattern (already in `sync-state-merge.ts:140-145`) to the
      remaining shared identity-scoped temp refs: `incomingNotesRef` (`notes-merge.ts:39`) and the
      `arc-sync-temp` probe refs (`TEMP_SYNC_REF_PREFIX`, `sync-status.ts:53`); cleanup keyed to the
      caller's own token.
    - Integration behavior: two concurrent probes never delete each other's temp refs — pins the C8 fix
      rather than leaving it inspection-verified.

### `[ ]` **3.5 Partial-push marker keying and versioned sync-state read-modify-write**

- _Goal:_ A sibling's save no longer invalidates another worktree's recovery state, and concurrent
  `.sync-state.json` writers can never drop each other's markers.

    - Marker validity keyed by ancestry (marker's recorded tip is an ancestor of the current local ref)
      rather than exact-hash match (`resolveUserSyncCoherenceState`, `sync-status.ts:458`), with
      worktree-scoped provenance replacing bare `machineId`.
    - The `.sync-state.json` read-modify-write gains the B1-assigned serialization (lock + version check),
      so concurrent processes can't lose markers.
    - Verify C10's two self-clearing mislabels (same-host divergence labeled `cross-machine`; own-host
      marker framed as a sibling's) clear once Phase 1 lands; file a diagnostic follow-up if not.
    - Build `test-first` (one behavior at a time):
        - two concurrent sync-state writers each keep their marker (version-conflict retry, no lost update)
        - an ancestry-keyed marker survives a sibling save advancing the local ref
        - a marker whose recorded tip is no longer an ancestor (force-moved ref) still clears

### `[ ]` **3.6 Status purity and scope corrections**

- _Goal:_ Status reads report and never mutate; verdicts scope worktree-local vs shared state truthfully; no
  status surface ever recommends a destructive action.

    - `[ ]` **3.6.a Read purity**
        - Status reads stop clearing markers (`clearPartialPushMarker` calls inside
          `resolveUserSyncCoherenceState`, `sync-status.ts:459/466`) — clearing moves to the mutating
          operations that resolve the condition.

    - `[ ]` **3.6.b Scope and recommendation corrections**
        - Scope `materializedManifestHash` so worktree-local state and the shared identity-global store are
          not conflated (`sync-status.ts:1586-1609`); the post-reconcile state stops classifying
          `"local unsaved"` and stops recommending the destructive save — recommend load/inspect instead.
        - Attribute `local-ahead`/`diverged` to the authoring worktree rather than surfacing to every
          sibling — derive attribution from each worktree's own sync-state tip records (the note manifest
          does not record its authoring worktree).

    - `[ ]` **3.6.c Retired-subdir roster check**
        - The retired-subdir reconcile's "shipped on origin" trust gains a same-machine roster check — an
          in-flight sibling worktree on the WU blocks the reconcile (`lib/user-sync/retired-subdir.ts`);
          the cross-machine case stays accepted-with-net (pre-load `.internal/` backup).

    - `[ ]` **3.6.d C12 folds**
        - Corrupt-note scan fails closed (`findCorruptMergedNote`, `push-fetch.ts:316-334` — both arms: the
          per-note `show` catch-continue, and the `list`-failure arm, which must distinguish a genuinely
          failed listing (fail closed) from an empty or absent ref (valid)).
        - "Partial publish recorded" prints only when the marker write succeeded:
          `recordPartialPushMarker` already returns `boolean` (`sync-state.ts:419`) but both
          `paired-push.ts` call sites (`:155`, `:200`) discard it — thread success through
          `PairedPushResult` to the renderer (six print sites, `handlers/sync.ts:866-895`); mirror for the
          errand leg (`recordErrandPartialPushMarker`, `handlers/sync.ts:549-561`).
        - `verifySavedNote` runs inside the lock span (`save-load.ts:138`).

    - Tier 2 gate (full suite) closes the phase; retire the WORKING-MEMORY tombstone-hazard entry per its
      recorded trigger.

## **Phase 4:** Retention and compaction

_Purpose:_ Compact accumulated history to a snapshot baseline and prune under the stated retention policy,
safely against lagging siblings (spec Phase C) — leaning on Phase 1's adopt primitive and Phase 2/3
invariants. Severable as its own ship if Large proves heavy (`notes-user-notes-retention.md`).

_Design decisions:_ Correctness rides the in-band cumulative prune manifest, never the marker seam or team
coordination; retention parameters are internal constants, not config keys. Never union-merge across a
compaction boundary.

### `[ ]` **4.1 Compaction snapshot writer with cumulative prune manifest**

- _Goal:_ One lock-held operation compacts the ref to a snapshot whose tree itself states every pair ever
  deliberately pruned — recoverable, lease-pushed, and safe to interrupt.
- **Additional Context:** `spec-user-notes-retention.md` § Phase C — retention/compaction (mechanism and
  manifest rationale)

    - `[ ]` **4.1.a Prune manifest format and cumulativity**
        - Manifest at a reserved non-SHA path in the notes tree (inert to note resolution — readers filter
          on the SHA pattern: `parseNoteListLine` in `branch-bounded-notes-export.ts` and the
          `GIT_OBJECT_ID_PATTERN` filter in `notes-ref.ts` both drop non-SHA entries): pruned
          `(blob, commit)` set, pre-compaction tip, monotonic generation id; each compaction unions the
          prior manifest in.
        - Build `test-first` (one behavior at a time):
            - generation N's manifest contains every pair pruned in generations 1..N
            - the manifest entry survives an ordinary post-snapshot save and a same-generation sibling
              merge (identical blob unifies)
            - note-resolution readers never surface the manifest as a note

    - `[ ]` **4.1.b Snapshot build and publish**
        - The writer takes explicit retained/pruned sets as input — a pure boundary: the 4.5 policy
          computes them, the 4.6 command composes the two.
        - Under the notes lock: push the backup ref to origin (`refs/backup/…`), build the single squashed
          snapshot commit (tree = retained notes + manifest; in-band tombstones survive as content), push
          `--force-with-lease`; on any failure the local ref and origin are left pre-compaction.
        - Integration test: interrupted publish (lease decline / push failure) leaves both refs recoverable.

### `[ ]` **4.2 Compaction-aware sibling adopt**

- _Goal:_ A sibling detecting a snapshot rewrite adopts it losslessly — manifest-pruned pairs drop, collisions
  union per-path, absent local notes re-export — and never union-merges across the boundary.
- **Additional Context:** `spec-user-notes-retention.md` § Phase C — Sibling reconcile (the three
  dispositions and the all-or-nothing rule)

    - `[ ]` **4.2.a Rewrite detection and disposition engine**
        - Detect via generation marker or snapshot-rooted non-FF; classify every local tip-tree pair:
          manifest-pruned → drop with adopt; collision (different blob, same commit) → per-path content
          union (`cat_sort_uniq` + corrupt-scan semantics) committed on top; absent → re-export on top.
        - All-or-nothing: an unparseable collision union rolls the local ref back to its pre-adopt tip with
          the existing typed conflict outcome; otherwise adopt always proceeds.
        - Build `test-first` (one behavior at a time):
            - local-only unpushed notes survive the adopt (content-diff verified — the spec's
              sibling-adoption criterion)
            - a manifest-pruned pair drops and never re-exports
            - a collision unions per-path; an unparseable union rolls back whole with the typed conflict
            - a sibling lagging two generations adopts without resurrecting either generation's pruned set

    - `[ ]` **4.2.b Integrity warning**
        - When the pre-compaction tip's tree is locally resolvable, a provably pre-compaction absent pair
          surfaces an advisory warning naming the generation — never a gate; a sibling that never fetched
          the pre-compaction tip skips the diagnostic silently.

### `[ ]` **4.3 Export/push compaction-boundary guard**

- _Goal:_ A stale sibling's push can never resurrect pruned notes as a clean fast-forward of the snapshot.

    - Every export/push path checks the fetched remote tip's generation id against the local ref's before
      staging (`planBranchBoundedNotesExport` overlay path and `reconcileAndRepush` both); on a newer
      generation, run the 4.2 reconcile first and stage against the post-reconcile baseline.
    - Build `test-first` (one behavior at a time):
        - a stale sibling's branch-bounded export across the boundary resurrects nothing
        - a stale sibling's non-FF reconcile push across the boundary resurrects nothing
        - same-generation pushes stage without the extra reconcile

### `[ ]` **4.4 Generation marker seam on the sync-state ref**

- _Goal:_ Siblings detect a rewrite cheaply — without walking the ref — while correctness stays with the
  in-band manifest.

    - Publish a generation/epoch marker on the sync-state ref at compaction; readers treat it as a hint
      only (4.2's detection works with the marker absent). A deliberate seam the backend tier can upgrade —
      no handshake machinery now.
    - Checkable pair: the marker lands at compaction (asserted in 4.6's E2E); marker-absent detection is
      4.2's snapshot-rooted non-FF test — cross-referenced, not duplicated.

### `[ ]` **4.5 Retention policy**

- _Goal:_ Retain-or-prune is a pure, unit-tested rule over note entries, with the spec's parameter defaults
  as named internal constants.

    - Retain when any of: among the newest K notes (K ≥ the 3.3 window bound); younger than the prune age
      gate (30 days post-archival); anchor commit belongs to an in-flight WU (the retired-subdir oracle's
      shipped-and-reconciled test). Prune everything else — subsumes the 427 pre-migration
      root-`SESSION-NOTES` notes and retired-WU accumulation.
    - Pure decision module: input is the note-entry set plus WU state, output the retained/pruned sets the
      4.1.b writer consumes (composed at 4.6).
    - Constants module carries: prune age gate (30d), backup retention (until next verified compaction,
      min 30d), advisory threshold (~2,000 ref-history commits). No config keys.
    - Build `test-first` (one behavior at a time):
        - newest-K retention holds regardless of age
        - the age gate retains a recently-archived WU's notes; past it they prune
        - an in-flight WU's notes never prune; pre-migration root notes always prune

### `[ ]` **4.6 `arc user compact` command**

- _Goal:_ Compaction is a manual, interlock-gated command with typed outcomes and an on-demand advisory
  signal in status.

    - New `commands/user/` subcommand + handler registration: lock → backup ref → retention decision (4.5)
      → snapshot writer (4.1) → lease-push, JSON envelope outcomes (compacted / nothing-to-prune /
      lease-declined / conflict), non-TTY safe (no interactive prompt without a flag path).
    - Prune expired `refs/backup/…` refs — past the backup-retention constant, once a later compaction has
      verified convergence.
    - `arc user status` reports the advisory threshold signal (ref history > ~2,000 commits → suggest
      compaction) on demand.
    - E2E test: compact in a temp repo → history collapses to the snapshot baseline; the generation marker
      lands on the sync-state ref; a second run is a no-op.

### `[ ]` **4.7 Session-init compaction advisory**

- _Goal:_ Orientation nudges compaction when ref history exceeds the advisory threshold — once per calendar
  day, offer-only, never auto-run.

    - New `lib/session-init/` slot (pattern: `partial-push-marker-surface.ts`) emitting the advisory into
      the probe envelope, reusing the shared nudge-marker rate limit (`nudge-rate-limit.ts`).
    - Orientation surface in the session-init workflow (one conditional section offering the
      interlock-gated `arc user compact`): edit the package source copy and sync to `.arc/` per
      package-project sync discipline.
    - Tier 2 gate (full suite) closes the phase.

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
