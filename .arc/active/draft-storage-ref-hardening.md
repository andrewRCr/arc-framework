# Draft: Ref Backend Hardening

- **Purpose:** Fix the ref backend's known defects that the cutover or its rehearsal exercises, before this repository's
  state flips onto it.
- **Origin:** [internal] — routed from `storage-ref-backend`'s eighth standard review pass, its fix checks, and defects
  found while fixing them (2026-10-29).
- **Commitment:** planned, P1, Heavy: three items need a design decision — the deadline's stranded lock, the keeper
  lock's scope, and the history write's lost compare-and-swap — and the import review sets its own scope.

---

## Problem / Motivation

`storage-ref-backend` landed with its review stopped under a rule fixed before its eighth pass: every material finding
in code that runs before the cutover was fixed, and so was every ref-backend major a local correction could repair. The
ref backend runs only through the hidden `arc store` commands until the flip, so its other findings were routed out
rather than fixed in place. Each item below was verified against source at the reviewed head. This work unit takes the
items the cutover exercises; `storage-ref-release-hardening` takes those it never does.

## Scope and Timing

- Implements after `storage-ref-backend` lands; `storage-cutover` depends on it.
- Land first what other work units' code observes — the listing scope, the fault classes and remedies, and the sweep of
  pull-result consumers — so `storage-projection`'s and `cohort-identity-verbs`' ref-backend phases can start once it
  does. The rest is internal to the backend and runs alongside them.
- Paths are under `packages/arc-framework/src/` unless they start with `__tests__/` (under `packages/arc-framework/`),
  and line numbers are as of the reviewed head; locate each again before planning.

## Routed Items

### Import

The import runs once, at the cutover, over this repository's real history, so a defect there lands in that history. The
cutover rehearsal on real state remains the gate.

- **Review the import before the rehearsal.** A focused review of the import's transform, landing, and transient
  cleanup, decided 2026-10-29; scope it at planning. At the import's entry point, `lib/store/ref/import/entry.ts`.
  Starting evidence: 22 of this repository's 141 tracked task lists fail the strict task-list scanner, so how the import
  treats records it cannot read matters on this repository's own state.
- **An execute-bound mark that is its capture's last line stays in the imported inbox while the capture is also
  queued.** Also match the mark at the end of the entry bytes, with a body-less capture case. At
  `lib/store/ref/import/pending-entries.ts:33` (the pattern requires a newline after the mark) and
  `lib/store/concurrency/entries.ts:36-37` (trailing newlines become the separator).
- **Personal symlinks are skipped silently, and a symlinked file that notes saving saves refuses with a remedy that
  cannot clear it.** Report each skipped link as a notice and give links an actionable remedy, or import the target as
  notes saving does. At `lib/store/ref/import/personal-disk.ts:68-69` (`isSymbolicLink()` continues with no notice),
  against `lib/io-context.ts:608,623`.
- **Compacted-note ordering refuses a whole identity when any retained note's annotated commit is unreadable.** Order
  unreadable annotated commits deterministically (last, by object ID) with a notice instead of throwing. At
  `lib/store/ref/import/personal-notes.ts:17-29,57-58` (`committedAt` throws on a missing or non-commit object inside
  the sort).
- **The captured-base mutation tests can pass without exercising the mutation they exist to test.** Assert that the
  mutation fired and that the restore path consumed it. At
  `__tests__/integration/store-ref-import-captured-bases.test.ts:130-144` (`changed` is never asserted) and :180-209.
- **A lost default-layout transient-source delete lease is reported as a change to the import's private gathering
  refs.** Return the failing ref from the landing transaction and report a lost transient lease as its own recoverable
  condition. At `lib/store/ref/import/land.ts:22-32` (a boolean result; a layout mismatch also returns false) and
  `entry.ts:72-83` (`landingRace` reports changed gathering refs).
- **A rebuild with no transient tips orphans the earlier attempt's import publication journal permanently.** Drop a
  stale publication journal when no kept tips remain. At `lib/store/ref/import/entry.ts:60` (the journal is written only
  when tips exist) and `transient-cleanup.ts:52-54` (`retireImportRemote` returns early with no kept tips;
  `dropKeptTips` at :94-98 deletes the journal).
- **Source retirement reports a publisher-side verification failure as an origin cleanup failure, discarding the typed
  refusal and its remedy.** Carry the publisher refusal's condition and remedy through `cleanupRefused`. At
  `lib/store/ref/import/transient-cleanup.ts:64-71,75-81` (`retireOriginRefs` runs `unpublishedImportClaims`, and its
  `MigrationRefusal` is caught and flattened into "Could not retire origin's transient refs").

### Fault class and remedy for missing or misplaced objects

One cause: a missing or misplaced object is reported as unparseable or corrupt state, with a repair remedy, where the
true remedy is to restore or fetch the object, or the fault is a placement fault with its own remedy. Fix these as one
item, with one classification every read shares. Consumers branch on these refusal kinds, so this group lands early.

- **Archive folder sequence and quarter faults are reported as missing metadata, with a remedy that cannot repair
  them.** Give sequence and quarter faults their own diagnostic and remedy. At
  `lib/store/ref/archive-read.ts:102,110,174-182` (`folderPlacement` returns null for a quarter mismatch or an invalid
  sequence, and the caller reports the metadata-unreadable diagnostic).
- **Archived record diagnostics prefix only the key, the remedy names the folder-relative path, and neither names the
  quarter.** Build archived diagnostics with the full stored path and the quarter in condition and remedy. At
  `lib/store/ref/archive-view.ts:19` (mirrored at `read.ts:192`) and `content-read.ts:29-35`.
- **Lookup and live-owner capture treat a missing metadata object as unparseable metadata with a forward-repair
  remedy.** Distinguish a missing blob and remedy it by restoring or fetching objects. At
  `lib/store/ref/lookup-trees.ts:70-72` (a missing object parses as no metadata and becomes `corruptRef(ref, false)`)
  and `live-owners.ts:34,39`.
- **Current listings give an unavailable record blob a repair remedy instead of object restoration.** Use the
  restoration remedy for an unreadable entry in every read. At `lib/store/ref/content-read.ts:29-36` (`recordDiagnostic`
  special-cases unreadable entries for saved state only).
- **Saved reads name history refs for live items whose tip is present but a nested tree is missing.** Name history refs
  only for refs whose tip is absent, and remedy a missing nested tree by object restoration. At
  `lib/store/ref/snapshot-read.ts:51-66` (`unavailableSnapshot` maps every unavailable work or cohort ref to its history
  ref).
- **Name-restricted changes refuse a manifest tip this clone lacks as terminal `namespace-corrupt`.** Classify an absent
  manifest tip as `state-unresolvable`, naming what to fetch. At `lib/store/ref/changes-scope.ts:16-30`
  (`resolveRefName` over the interval's saved states).
- **A local object missing during fetch negotiation is reported as `unreachable`, with a remote-connectivity remedy.**
  Report it as a missing local object with the restoration remedy. At the fetch failure parsing in
  `lib/store/ref/fetch.ts`; found while fixing a review finding and not yet located precisely.

### Listing scope

- **Live listings apply a different scope and absence rule than as-of listings and the reference backend.** Apply the
  listing's scope to diagnostics as the as-of path does, with a scoped-listing case. `storage-projection` reads through
  listings, so this lands early. At `lib/store/ref/read.ts:161-163` (selection by family) and :216-236
  (`decodeCapturedRef` returns diagnostics unconditionally).

### Pull-result consumers

- **Rename's and conflict's history retry ignores a designation question.** `pullHistoryForRetry` reads only the pull's
  `pulls`, never its `states`, so a designation-needed state alone, or beside a failed read source, retries and fails
  with the bare `state-unresolvable` refusal without naming the remote's missing role. It is the third consumer of pull
  results found re-deriving pull policy, so fix the family, not the site: move `pullHistoryForRetry` and every
  `store.pull()` caller outside `lib/store/` onto the one consumer-policy helper in `pull-consumption.ts`, reusing its
  `pullDesignation` lookup for the designation's remedy. `cohort-identity-verbs` builds its rename on this path, so this
  lands early. At `lib/store/ref/pull-consumption.ts` (`pullHistoryForRetry`, serving `rename-store.ts` and the conflict
  path; `pullDesignation`, which join and the history read retry already use).

### Sync, push, and withdrawal

- **Copy, delete, follow, departure, and withdrawal push loops restart without bound on an unverified lost-race
  classification.** As one item across the six loops: restart only when the lease listing shows the remote moved, and
  bound restarts with a recoverable refusal. At `lib/store/ref/migrate-remote-copy.ts:39-43,211-217`
  (`settleMigrationPush` restarts on any lost race), with the same loop in `migrate-remote-delete.ts`, `follow-copy.ts`,
  `follow-delete.ts`, `leave-source.ts`, and `leave-recorded-withdraw.ts`.
- **Non-JSON metadata on a withdrawal journal ref escapes as an untyped exception that rejects pull and push.** Parse
  through `parseRefMetadata` and hold the ref with a notice. At `lib/store/ref/sync-withdraw-inverse.ts:74-81`
  (`JSON.parse` directly); `commitWithdrawEnd` converts only label and journal errors.
- **Withdrawal conflict values pass a fresh live `refs/arc/` listing to the snapshot-based placement completer.** Pass
  the captured snapshot. At `lib/store/ref/sync-withdraw-entries.ts:84-95` (line 91 passes `readSyncRefs(context,
  'refs/arc/')`), against `completeSyncPlacements`' other callers, which pass captured maps.
- **A pending end the pull withholds without an end-pending seed makes push emit a schema-invalid failed publish with
  empty condition and remedy.** Build a refusal for every excluded ref, with a case for an unseeded pending end. At
  `lib/store/ref/push-exclusion.ts:21-24,43-46` (refusals are built only from `namespace-corrupt` and `end-pending`
  notices, while `listing.pending` seeds exclusion) and `push.ts:106-109`; a second trigger runs through
  `uniqueNotices`.
- **Transport failures escape as raw throws.** Target-resolution failures escape pull and push, discarding per-remote
  outcomes and notices; and `captureComparisonWitness` lets `EffectiveTransportError` escape, so follow's resume and
  cleanup throw instead of returning `move-unfinished`. As one item: turn target-resolution failures into per-remote
  failed outcomes or typed refusals, and map the error at capture as finalization does. At
  `lib/store/ref/push.ts:117-120,220-226` (`checkedPushTarget`), `pull.ts:33-43,85`, and `comparison-witness.ts:21-29`
  against :40-44.
- **Quarter provenance throws an internal error when a reopen or quarter move restores a removed completed primary in a
  single-put batch.** Attribute that quarter change to the restoring mutation, with a reopen-after-remove case. At
  `lib/store/ref/quarter-provenance.ts:26-34` (a subject is chosen only from mutations whose owner's folder holds the
  record path in the before or after snapshot, otherwise it throws); reachable from `write-reopen.ts:67`.

### Locks

- **The sync deadline can strand a ref lock.** When the deadline kills a prepared `update-ref --stdin` transaction, Git
  leaves its lock file, and every later publication is refused `lock-held` until the file is removed by hand. Git cleans
  lock files on ordinary exit and catchable signals, never on `SIGKILL` or `taskkill /F`, so this is not Windows-only.
  Two parts: the deadline must not strand a lock its own canceled transaction held; and reconcile the asymmetry where a
  stale lock on a fetch's `!` line is a retryable `tracking-update-failed` notice (`spec-storage-ref-backend.md` § 6.3)
  while the same lock on a keeper or tracking transaction is a top-level `lock-held` refusal that cannot tell stale from
  held. Reclassifying alone does not restore convergence, since no retry clears a stranded lock, and reclaiming a lock
  is unsafe while cancellation can report descendants unconfirmed. Once fixed, unskip the Windows separate-layout
  publishing burst in `__tests__/integration/store-ref-bursts.test.ts`. At `notes-storage-ref-backend.md` § A58, which
  holds the mechanism, the hosted runs that showed it, and the criteria it superseded.
- **Keeper-lock classification ignores `packed-refs.lock`.** Files-format deletion locks therefore escape pull and
  post-acceptance push tracking as raw exceptions. Add `packed-refs.lock` to the observed locks, with a files-format
  case. At `lib/store/ref/fetch-keeper-lock.ts:17-31` (the lock set at :20).
- **The per-remote keeper lock is held across the network fetch, with a 120 s wait.** That conflicts with the design's
  lock invariant (`spec-storage-ref-backend.md` § 11.4). Decide whether § 11.4 admits this lock, or restructure keeper
  release so it is not held across the fetch; the code's reason is that a sibling's release could drop a keeper another
  pruning fetch needs. At `lib/store/ref/fetch-seen.ts:17-25` and `fetch.ts:42-52`.
- **Registry anchor lock prediction misses a retirement started only by another owner's resolves.** Predict retirement
  for targeted work refs with terminal lineage, or take the registry lock whenever a targeted work ref may retire. At
  `lib/store/ref/write-manifest.ts:20-27` (`mayEnd` covers removes and completed placements only), against
  `write-build.ts:76` and `write-retirement.ts:29-31` (retirement planned under lock for every targeted work ref);
  `write.ts:141` takes the predicted locks.

### Write publication

- **A lost history-destination compare-and-swap is refused as terminal.** The spec says to retry from step 4; the code's
  comment states the opposite policy, that a destination changed outside its lock needs repair. Decide between the two,
  then align the code or amend the spec. At `lib/store/ref/write-publication.ts:9-17` with `write-history.ts:27-30`.

### First placement and designation

- **A declined automatic designation repeats `move-unfinished` for pull and loses it for push.** Append the unfinished
  state once and carry it to push. At `lib/store/ref/designation-first.ts:28-29` (appends `layout.unfinished` to the
  resolved states) and :132-136 (`admitAutomaticDesignation` already returns it).
- **First placement treats an ambiguous designation as the separate layout.** It then creates a store directory beside
  the code remote's push. Refuse placement on an ambiguous designation with its existing `role-conflict` remedy. At
  `lib/store/ref/repository.ts:63,69-70` (creates the directory unless `designatedStoreLayout` returns `default`) and
  `layout-designation.ts:7` (null for more than one push).

### Decomposition

- **Decomposition derives a verbatim companion's stored name without the slug-safe rule.** Apply the store's slug-safe
  stored-name rule when copying a companion, with a case for a companion name it rejects. At
  `lib/decompose/scaffold-copy.ts:47-48` (`companionArtifactName(owner.name, source.key)`).
