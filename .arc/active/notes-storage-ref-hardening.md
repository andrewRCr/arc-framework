# Notes: storage-ref-hardening

## Coordination with `store-operation-git-access`

That work unit gives every public ref-store call one operation scope: a shared `cat-file --batch` reader and
remembered configuration lookups, refreshed at the events that can make them stale. Its spec,
`spec-store-operation-git-access.md`, is the authority on that scope, and the two sessions coordinate directly.

- **Order, not an edge.** The two land in an agreed operating order with no `Depends On` either way (Owner,
  2026-10-30), per `RELEASE-GATES.md`'s Stance. That unit was in verification when this task list finalized
  (2026-10-31), so it lands first, and this unit merges base once it lands and again before landing itself.
- **Port obligations, confirmed by that unit's session** (2026-10-30): its wrapped `execInput` keeps executor options
  unchanged, its wrapped `fs` keeps the full `lstat` result, and its planned wrapped `lock` forwards `waitMs` unchanged,
  zero included, each with a regression case. The spec's § 12 states these as contracts any wrapper keeps.
- **Ports this unit extends.** The type of `importSource.ports.fs` gains `realpath` (Task 5.2), which the default port
  already returns, and `lstat`'s result gains `mtimeMs` (Task 6.2). After merging base, that unit's wrapper carries
  both: it spreads `...context.fs` (`operation-scope.ts`), so `mtimeMs` rides the whole `lstat` result it keeps, and it
  passes `importSource` through unwrapped.
- **Uncached failures.** § 4 keeps the transport and designation lookups throwing on failure, so a caching wrapper
  caches no failure value. That unit's spec owns the property ("A thrown error is never remembered") and its
  regression case; this unit adds none.
- **Shared files.** That unit's diff (`141aa26f99..8d81a14144`) changes 14 files under `src/`. Whichever unit lands
  second merges the other's change in each file both change:
    - `pull.ts` and `push.ts`: its operation-scope refresh at each restart; this unit's local object check (Task 3.7),
      typed transport failures (Task 4.3), and lock mapping (Task 6.2).
    - `write.ts`: its refresh in `executeRefBatch`'s loop; this unit's `refBatchFailure` (Task 6.2),
      `commitLockedRefBatch` (Task 6.8), and loss count (Task 7.1).
    - `backend.ts`: its routing of `refReadOperations` through the operation scope; this unit's `version` lock mapping
      (Task 6.2).
    - `import/transient-publication.ts`: its configuration refresh inside `unpublishedImportClaims`; this unit's journal
      faults there (Task 3.8).
- **Read through, unchanged here.** `batch-read.ts` takes its `readBatchObjects` missing-answer check, which
  § Non-Goals leaves to it; this unit reads through `readRefTrees` and `readBatchObjects` as they are. Its other
  files (`batch-reader.ts`, `context.ts`, `designation.ts`, `effective-transport.ts`, `fetch-completeness.ts`,
  `operation-scope.ts`, `read-operation.ts`, `repository.ts`) this unit leaves unchanged.
- **Deadline behavior it relies on.** `sync-deadline.ts` and `ref-transaction.ts`, which this unit changes (Tasks 6.1
  and 6.6): an expired deadline still refuses the next Git process and the next lock.

## Coordination with `seam-delivery-review`

That work unit binds the review family's import mapping to `arc store migrate` (`reviewMapping: mapReviewRecords` in
`commands/store-migrate.ts` on its branch). Until this branch holds that binding, every review-gate source but
`arc/review-gate/identity/repository-identity.json` blocks the import as unmapped (spec § 11.1).

- **Order, not an edge.** It was in verification when this task list finalized (2026-10-31). Task 5.12's rehearsal and
  Task 5.13's clean trial run once it lands and this unit merges base. Nothing before Task 5.12 waits on it, so no
  `Depends On` edge; if it has not landed when the loop reaches Task 5.12, the loop waits there, since tasks run in
  document order and Phases 6 and 7 follow. If Task 5.12 records a fault in the mapping itself, the loop waits again
  at Task 5.13 until its fix lands and this unit merges base.
- **Until then.** Task 1.1's second trial sets the copy's other review-gate sources aside, and Task 1.3 records the
  unmapped-source notices under § Import state faults as cleared by the binding.

## Later work that reads § 1–§ 4

`storage-projection`'s and `cohort-identity-verbs`' ref-backend phases build on the listing scope, the fault classes and
remedies, and the pull-result consumer sweep. They are the work § 13's re-raise watches: if either becomes ready to start
while this unit's remaining work is more than about a week out, re-raise the cut of § 1–§ 4 into its own member.

## Review during execution

`storage-ref-backend` took eight standard passes before its review stopped under a rule fixed in advance. For this
unit: review code reachable from shipped commands first, in its own chunks; group findings by shared cause after the
first pass; and agree a stop rule with the Owner before the second pass.

## Evidence for § 5

The stranded ref lock that § 5 removes is recorded in `notes-storage-ref-backend.md` § A58, from hosted dispatch
`40794816270`: the Windows separate layout's publishing burst refused on a lock the sync deadline stranded. That burst
is the case § 5 unskips.

The default layout's burst failed the same way on Windows in hosted dispatch `41149894984` at `9e4149885`, from
`store-operation-git-access`'s verification (2026-10-31): 13 `tracking-update-failed` notices, then the push
`unreachable` at the deadline. It is the run spec § 5.4 means by a hosted Windows failure of the default-layout burst.

## Verification at the final head

SC 3, SC 8's Windows case, SC 9, and SC 12 take their evidence mid-change, and no gate at the final head takes it again:

- Task 3.10 runs § 1.4's search before Task 6.8 adds a `readRefTrees` read.
- Task 5.13's trial runs before Task 6.2's wrapper around the landing, Task 6.6's lock change, and the planned base
  merges.
- Task 6.10's dispatched portability pair runs before Task 7.3 rewrites the push exclusion's refusals that Task 6.9's
  recovery check reads, before Task 7.1 changes the write retry loop, and before the planned base merges. The
  portability pair runs only when dispatched with `run_portability_pair`, or on the weekly schedule.

Verification takes each again at the head it checks and records each result: § 1.4's search over `lib/store/ref/`; a
trial run as Task 5.13 runs it; and the Windows deadline-kill case and both layouts' publishing bursts, from its CI
dispatch at that head made with `-f run_portability_pair=true`, so one run carries them.

## Fault-site inventory

§ 1.4's search, run at `e334006519` under `lib/store/ref/`, `import/` included. Each site that refuses, reports, or
holds on an object fault, grouped by the Phase 3 task that moves it. Paths are under `lib/store/ref/` unless noted.

- **Missing** means the helper's row: recoverable `state-unresolvable`, the restore-or-fetch remedy, and `historyRefs`
  by § 1.6. **fwd** and **hist** name the remedy an **Unparseable** or **No metadata** object takes: the forward repair
  at a current tip, the historical remedy at a history commit or saved state.
- **Tolerates** keeps its fallback; **unchanged** has no § 1.1 fault or sits outside the flip.
- Fixtures: `removeLooseObject` and `plantMissingRef` (`__tests__/helpers/store/ref-plant.ts`) remove an object or
  plant a ref at an absent one; `plantRef` builds a tree holding any blob.

### Classification calls the sweep settled

- **Archive faults behind `completeSyncPlacements`.** It finds a side's folder in `archivedFolders(...).folders` and
  drops the capture's diagnostics, so a faulty folder makes its callers refuse with the item's own metadata fault.
  When no folder supplies the placement and a diagnostic owned by that item carries a § 1.1 fault, the caller takes
  that diagnostic's row, as `firstOwnedArchiveDiagnostic` does for the history merge. With no owned fault, the caller
  keeps today's refusal. Goal 1 and § 1.9's converter rule settle it.
- **The withdrawal's composed metadata.** `retainSelectedFormats` and `preserveInverseConflicts`
  (`sync-withdraw-inverse.ts`) read the metadata entry of the inverse tree being built. That entry is the current
  tip's, the journal's `before` entry that `restoreOriginalEntry` put back, or a blob this withdrawal wrote. Its side
  follows the entry's object ID: the current tip's takes fwd, and `before`'s takes hist, by § 1.1. A blob the
  withdrawal wrote from validated inputs cannot fault, so that arm stays an internal error. `before`'s entry stands
  only where neither the current tip nor the journal's `after` holds a metadata entry. `preserveInverseConflicts`
  meets neither fault: a conflict exists only once `entryDocument` parsed the current metadata, and the inverse never
  replaces that entry while it exists. It throws the fault rather than a raw error, with no failing-first case.
- **An item's end read at a ref's tip.** `readItemEndCandidates` (`sync-lifecycle-log.ts`) walks the item's log from
  its tip inclusive, so an end commit can be the tip of the ref read. § 1.3 and § 1.9 give an end's faults the
  historical remedy, since a forward commit cannot change the end, and § 1.1 states that an end is read as a history
  commit even at the tip.
- **`retiredHistoryHome`'s side.** Its first scan returns the first revision whose metadata yields a slug, so its
  fallback refuses only when no revision does, the tip included. A forward metadata commit at the tip clears that
  refusal whichever revisions are faulty, so its **Unparseable** and **No metadata** refusal takes fwd, as
  `sync-history.ts` already does for a history ref's own tip. § 1.1 lists it among the sites its rule decides.
- **`historyRefs` needs the clone's current tips.** `unavailableRefHistory` and `missingChangeState` name the history
  ref of any work or cohort ref, and `unavailableHistory` names none. As the helper's **Missing** row, each takes the
  clone's current tips, so it names a history ref only for an item with no live ref (§ 1.6).
- **`missingChangeState` serves two causes.** It reports object faults and coordinate gaps alike. The gaps have no
  § 1.1 fault: no tip for the item, an unindexed batch, no end commit, no older registry tip, unordered or
  unrecorded ends. They keep today's refusal and `historyRefs`.
- **`captureHistoricalNamespaces` hides a missing blob.** In a record-free tree, a present metadata entry whose blob is
  missing is counted `recordFree` today, and its `unavailable` set is never filled when `complete` is set. § 1.2's read
  reports a missing blob as its own fact whether or not the tree holds records, which `retiredHistoryHome`'s fix needs:
  it lands in a new `missing` set, a record-free revision in `recordFree` as well. The history reads, the change window,
  and the pull label walk read metadata for every revision but need none where a revision holds no record, since their
  answer there is no record (`historicalState`, `versionAt`). So they refuse **Missing** only on a `missing` revision
  whose tree holds records, and keep treating a record-free one as record-free; `retiredHistoryHome`'s fallback refuses
  any `missing` revision, since its revision scan skipped a missing blob that may hold the slug.
- **Git failures not confirmed as missing objects.** `checkRefHistoryDestinations` (`write-history.ts`) reports any
  completed `merge-base --is-ancestor` failure through `corruptRef`'s missing arm. It takes **Missing** only when
  `isUnavailableGraphFailure` confirms an absent object, as `readHistoricalGraph` does; any other failure keeps
  today's condition, naming Git's message, and its remedy, built in place once `corruptRef` loses that arm.
  `retirementCommit` (`changes-lifecycle.ts`) calls `syncRefIsAncestor` with no catch. The ends and the lower bound
  were already read (`:178`), but an object missing from the lower bound's ancestry, which the walk never read,
  escapes `changes` as a raw `GitProcessError`; it classifies the same way. That ancestry check is no search
  term; the Purpose reaches it as a raw exception `changes` meets.
- **Record-free write groups.** `readWriteGroups` (`write-build.ts`) gives a record-free tree fresh metadata when its
  metadata is absent or unusable. § 1.9 counts the site as refusing, and a point read of the same tree refuses
  **Missing**, so a present entry whose blob is missing refuses **Missing** here too, rather than replacing facts a
  restore could recover. An absent entry or unparseable metadata still starts fresh metadata, as today; only the
  missing blob changes.
- **Archive output controls.** `copyArchiveEntries` (`write-archive.ts`) reads its own metadata through § 1.2 and
  classifies an object fault before `archiveOutputControlRefusal`. Owner, role, placement, and end-batch mismatches
  carry no § 1.1 fault and keep `record-malformed`. The batch staged that metadata blob itself, so no public input
  reaches the fault arm.
- **Invariants.** Each of these re-reads an object the same operation already validated, or reads one it built, so
  only a concurrent object loss reaches it, and it stays:
    - the raw throws in `readStoredMergeLabel` (`side-labels.ts`), `quarterCommitReference`'s planned-quarter check
      (`quarter-provenance.ts`), `changeCommitMessage` (`changes-graph.ts`), and `anchorRefWriteManifest`
      (`write-manifest.ts`);
    - `originEndBefore`'s ancestry check (`changes-lifecycle.ts`), whose operands come from the history it walked;
    - `readLifecycleLog`'s walk (`sync-lifecycle-evidence.ts`), which pull primes and `changes` walks first through
      `readHistoricalGraph`.

### 3.1 Point reads, listings, and lookups

- `readBoundRecord` (`read.ts`) and `readUidRefRecord` with `unreadableUidTip` (`read-uid.ts`): a `missing` metadata
  answer resolves by the containing tree: present **Missing**, absent from a tree holding records **No metadata**,
  fwd. `holdsNoRecord` keeps `not-found`; `read-uid.ts`'s tip probe and pinned re-read tolerate.
- `refRecordAbsence` (`record-absence.ts`): a missing tree is **Missing**; its other arms already are.
- `checkRefTip` (`namespace-health.ts`), which history, changes, pull, and push run first: a missing tip or tree is
  **Missing**; its metadata entry **Missing**, **No metadata**, or **Unparseable**, hist when `saved` is set and fwd
  otherwise.
- `readArchivedRecord` (`read.ts`): unavailable quarter trees are **Missing**. `readArchivedFolder` (`read.ts`), the
  record-blob refusal in `read.ts`, `unavailableConflictEvidence` (`conflicts-read.ts`), and `claimPayloadRefusal`
  (`lookup-claims.ts`) already give **Missing** and call the helper. `readOpenConflicts`' structural refusals and its
  raw "Malformed conflict tree" error are unchanged.
- Listings — `listBoundRecords`, `decodeCapturedRef`, `capturedMetadata`, `decodeCapturedEntry`, and
  `decodeArchivedListing` (`read.ts`), and `archivedViewRecords` (`archive-view.ts`): metadata through § 1.2, each
  row an `unreadable` diagnostic with its own remedy, hist on a saved listing. `recordDiagnostic`
  (`content-read.ts`) gives a current listing's unavailable record blob the restore remedy (§ 1.6). `listView`
  (`write-views.ts`) joins its diagnostics' text and is unchanged.
- `readLineageOwners` (`lineage-resolution.ts`) and `readLiveRefOwners` (`live-owners.ts`): a missing tree is
  **Missing**; the metadata entry is looked up in the tree each holds: present **Missing**, absent **No metadata**;
  hist on the saved reads `changes-ends.ts` and `changes-scope.ts` make, fwd otherwise. `readLiveRefOwners`'
  record-free arm tolerates. `unreadableWriteTarget`, `resolveRefWrites`, and `unreadableNewClaim`
  (`write-resolution.ts`) pass its refusal on.
- `decodeLookupCapture` (`lookup-trees.ts`): a missing tip or tree is **Missing**; metadata rows, hist when
  `resolveRefName` reads a saved interval for `changes-scope.ts`. `revalidateLookupAcquisition`
  (`lookup-acquisition.ts`) drops a ref it cannot re-read, a tolerance.
- `projectOwnerFromEntries`, `projectOwnerFromObjects`, and `registryTreeUnavailable` (`project-identity.ts`): a
  missing identity blob, companion tree, or registry tree is **Missing**; no entry and an unparseable identity
  (`record-malformed`) are unchanged. Callers: `read.ts`, `readCapturedRefHistory` (`history.ts`),
  `compareBoundWindows` (`changes.ts`), `changeRestrictionProject` (`changes-scope.ts`), `anchorRefWriteManifest`
  (`write-manifest.ts`), `viewProjectOwner` (`write-views.ts`), `bindProjectMutations`, `projectIdFromTip`, and the
  migration and follow reads § 1.3 lists.
- `checkRefDesignationProject` (`designation-project.ts`): its incoming arm keeps the refusal's condition, led by the
  candidate registry's commit and its remote, so an unavailable tree is identifiable too, and gives a remedy for the
  remote's candidate registry, not the local registry that `projectIdFromTip` keys the read under and that has already
  parsed. For **Missing**, the **Missing** row's remedy: restore the object in this clone, or refetch it with
  `git fetch --refetch <target> refs/arc/project/registry`, with `--git-dir=<store>` where the layout is separate, as
  `refFetchRewriteRemedy` renders its commands, and the target the check's own fetch used (`fetchProjectCheck`'s
  `target`: a backing candidate's `remote.url` where it differs from the configured backing, otherwise what
  `refFetchTarget` resolves), since the clone already holds the candidate's commit and a plain retry fetches nothing,
  and a bare `--refetch` fetches only the remote's configured refspecs, which ARC never sets to name the registry; then
  retry the designation. For **Unparseable**, repair the registry on that remote. Either way, no role was set.
- `resolveArchivedReferences` (`archive-resolution.ts`): unavailable trees are **Missing**. In
  `archivedHistoryBatches`, a history tip that is not a commit (`readHistoryBatchIndex`) and `indexHistoryBatches`'
  default refusal are **Missing**, naming the history ref, since the ended item has no live ref.
  `missingArchivedHistory` is unchanged.

### 3.2 Archived folders

- `decodeArchiveFolderControls` and `folderPlacement` (`archive-read.ts`): § 1.5's three placement conditions become
  `malformed` with `rule: "placement"`, keyed `${ref}:${root}`, carrying **Misplaced**. `decodeArchiveFolder`'s
  metadata takes § 1.2's read: **Missing**, **Unparseable**, or **No metadata**.
- Archived record keys (`archive-view.ts`, `read.ts`): the key becomes `${ref}:${root}${path}` and the remedy names it.
- Converters of an archive capture's diagnostic, each taking the diagnostic's fault row while a diagnostic with no
  § 1.1 fault keeps its own text:
    - `captureArchivedFolders` and `selectEndedOwners` (`ended-owners.ts`): an empty quarter group and an unavailable
      quarter tree, which `archiveDiagnostic` builds through `corruptRef`'s missing arm, are **Missing**.
    - `readArchivedRecord` (`read.ts`) and `archivedViewRead` (`write-views.ts`, whose unavailable archive tree is
      **Missing**), hist by `state.saved`.
    - `resolveArchivedReferences` (`archive-resolution.ts`) and `appendArchivedLookupTrees` (`lookup-trees.ts`).
    - `collectArchivedParents` (`cohort-coordinates.ts`).
    - `endFolders` (`changes-ends.ts`), hist.
    - `checkArchiveTip` (`sync-tip.ts`), whose unavailable tree is **Missing**, fwd.
    - `incomingArchiveNotices` and `incomingArchiveHolds` (`sync-corrupt.ts`): an unavailable quarter is **Missing**;
      fwd.
    - `mergeArchiveTree` (`sync-archive.ts`): unavailable trees are **Missing**; the base decodes with `saved` set, so
      its diagnostics take hist; `local` and `incoming` take fwd.
    - `readSyncHistoryQuarters` (`sync-history.ts`), through `firstOwnedArchiveDiagnostic`: unavailable quarter trees
      are **Missing**; fwd.
- `completeSyncPlacements` (`sync-placement.ts`): an unreadable quarter tree and `historicalPlacement`'s walk are
  **Missing**. An owned faulty folder reaches its callers as above: `mergeGroupTree` (`sync-tree.ts`) holds the item
  ref with that row; `readSyncRecordPlacement` (`sync-label.ts`) and `conflictValue` (`sync-withdraw-entries.ts`)
  throw `RefSyncLabelError` with it.
- The sibling capture's rethrow (`siblingFolders`) moves with the withdrawal, 3.6.

### 3.3 Writes and their views

- `readWriteGroups` (`write-build.ts`): a present tip whose tree is missing is **Missing**, naming the history ref for
  a target with no live ref. `capturedGroupMetadata` takes § 1.2's read: missing blob **Missing**, absent entry in a
  tree holding records **No metadata**, bad bytes **Unparseable**, fwd. The record-free fallback as settled above.
- `staleMutation` (`write-current.ts`): a missing prior blob is **Missing**, no longer `version-conflict`.
- `checkRecord` (`write-checks.ts`): already **Missing**; calls the helper. `prepareAnchor` (`write-anchors.ts`)
  tolerates a missing prior blob; `resolvesManifest` reads a saved manifest and is unchanged.
- `readArchiveQuarters` and `copyArchiveEntries` (`write-archive.ts`), `completedQuarterTrees`
  (`write-completed.ts`), and `readReopenQuarters` (`write-reopen.ts`): unavailable quarter trees are **Missing**;
  `copyArchiveEntries`' own metadata as settled above.
- `planRefRetirements` (`write-retirement.ts`): an unavailable registry tree is **Missing**.
- `checkRefHistoryDestinations` (`write-history.ts`): as settled above. `historyDestinationFailure` refuses a
  destination that is not an ancestor, no object fault, and is unchanged here (§ 7 is Phase 7's).
- Unchanged: `refBatchFailure` (`write.ts`) passes refusals on; `appendRefConflicts`, `finalWriteNamespaceRefusal`,
  and `renamedEntryRefusal` refuse path faults.
- Views, fwd for a check view and hist for a saved read, by `state.saved`: `viewRefMetadata` (`view-state.ts`) takes
  § 1.2's read for `lookupViewTrees`, `readView`, and `missingViewMetadata` (`write-views.ts`) and for
  `preparedCohortParents`, `unavailableCohort`, and `collectParent` (`cohort-coordinates.ts`). A missing tree or blob
  is **Missing**, an absent entry **No metadata**, and bad bytes **Unparseable**. Record-free trees keep `not-found`
  or their skip, and a record-free cohort with no metadata keeps today's handling. `readViewRecord` already gives
  **Missing** and calls the helper; `viewOpenConflicts` passes `read.ts`'s refusals on.

### 3.4 History and changes

- The builders `unavailableRefHistory` (`history-graph.ts`), `unavailableHistory` (`history-snapshots.ts`), and
  `missingChangeState` (`changes-graph.ts`) become the **Missing** row, with `historyRefs` from current tips.
- `readRefHistoryDetails` (`history.ts`): its tip check is 3.1's `checkRefTip`, fwd; its graph walk is **Missing**.
  `readCapturedRefHistory`'s identity read is 3.1's.
- `indexHistoryBatches` (`history-batches.ts`): its default refusal is **Missing**.
- `captureHistoricalNamespaces` (`historical-namespace.ts`): as settled above. `readHistorySnapshots`,
  `historicalState`, and `stateMetadata` (`history-snapshots.ts`): unavailable trees, commits, and blobs are
  **Missing**; **Unparseable** and **No metadata** take hist.
- `retiredHistoryHome` (`retired-history.ts`): graph walks, trees, and blobs are **Missing**, naming the history ref;
  the tip's side as settled above. Its revision scan tolerates; an absent history ref and a history ref with no stored
  UID are unchanged.
- `compareBoundWindows` (`changes.ts`): identity through 3.1, hist; an unavailable saved manifest is unchanged.
- `captureChangeWindow` (`changes-graph.ts`): a non-commit endpoint, a refused walk, and missing trees and revisions are
  **Missing**. `checkWindowTips` passes `saved` to `checkRefTip`, so its rows take hist. `changeNamespaceFacts` refuses
  a **Missing** fact as **Missing** where the revision's tree holds records, keeps a record-free one record-free, and
  refuses a corrupt one with hist.
- `readEndSnapshots`, `lineageEndOwners`, and `captureRestoredOrigins` (`changes-ends.ts`): unavailable trees are
  **Missing**; metadata through § 1.2, hist.
- `changeWindowReferences` (`changes-records.ts`): metadata through § 1.2, hist; a `lineage/conflict-record` entry
  whose blob is missing is **Missing**, not a path that does not decode. `recordWindowStates` reaches
  `historicalState`.
- `resolveChangeRestrictions`, `restrictionOwners`, and `resolveComparedLineageReference` (`changes-scope.ts`): a
  manifest tip this clone lacks is **Missing**, as the unrestricted path already is; **Unparseable** and **No
  metadata** stay terminal with hist. The fallback to the interval's earlier side still fires only on `not-found`.
- `ownerChangeWindow`, `reopenedOriginWindow`, `originEndBefore`, `retirementCommit`, and `lifecycleBatchIndex`
  (`changes-lifecycle.ts`): commit reads and graph walks are **Missing**; the ancestry checks as settled above;
  coordinate gaps keep `missingChangeState`'s semantics, and `unrecordedRetirement` and `unorderedEnds` are
  unchanged.

### 3.5 Pull merges, tip checks, fetch checks, and push exclusion

- `checkSyncRefTip` (`sync-tip.ts`) reaches 3.1's `checkRefTip`; its missing-family refusal is unchanged.
- `excludeBrokenPushRefs` (`push-exclusion.ts`): each tip check's row rides the `refused` publish failure; its batch
  graph walk is **Missing**.
- `groupSides`, `sideMetadata`, and `metadataAt` (`sync-tree.ts`): a missing tree or blob is **Missing**; **No
  metadata** and **Unparseable** take hist at the base and fwd on `local` and `incoming`. `emptySideMetadata` and the
  control-source read tolerate; a side holding no records whose metadata is absent has no § 1.1 row and keeps its
  refusal; `mergeGroupTree`'s missing-family refusal is unchanged.
- `indexRecords` (`sync-records.ts`): an undecodable record on the base side takes hist, where it takes fwd today.
  `readableSyncReference`: a record object that is not a blob is **Missing**, a wrong-typed one included,
  by § Non-Goals' rule that such an object takes the row of the read that meets it.
- `mergeRefSets` (`sync-merge.ts`): an unavailable graph is **Missing**; `mergeCapturedSyncRef`'s non-commit endpoint
  is **Missing**; `heldMerge` holds with its callee's row.
- `prepareSyncHistoryFastForward` (`sync-history.ts`): an unavailable tree is **Missing**; the history ref's own tip
  metadata takes fwd.
- `captureSyncRecordHistory` and `versionAt` (`sync-label.ts`): graph walks, revisions, and trees are **Missing**; a
  `missing` revision whose tree holds records is **Missing**, and a record-free one stays record-free; corrupt
  namespaces take hist, `RefSyncLabelError`'s default. `readSyncRecordLabel` is unchanged.
- `readCorruptLifecycleBatchRefs` and `hasCompetingHistory` (`sync-corrupt.ts`), `primeLifecycleHolds`
  (`sync-lifecycle-holds.ts`), and `readUnpublishedRefBatches` (`sync-batches.ts`): an unavailable graph is
  **Missing**.
- `incomingLineageHolds` (`sync-corrupt.ts`) and `observeTerminalEndedTwice` (`sync-terminal-ended-twice.ts`):
  `readLineageOwners`' rows, fwd. `observeTerminalEndedTwice` reads the registry tree after a `missing` lineage
  record: present **Missing**, absent skips the owner. `observeOwnerEnds`' unavailable tree is **Missing**.
- `unavailableFetchGraphNotice` (`fetch-graph.ts`), from `checkRefFetchUpdates` and `rejectedFetchNotice`'s ancestry
  check (`fetch-check.ts`), `checkSeenRefFetch` (`fetch-seen.ts`), and `compareFetchedRefTips` (`fetch-graph.ts`): a
  graph missing an object is **Missing**.
- Tolerate: `readLifecycleFolders`, `publishedTerminalLineage`, `observeSyncEndedConflicts`, `publishedLineageRefs`
  (`fetch-seen-ended.ts`), `refMovementFamilies` and `archiveMovementFamilies` (`push-families.ts`), and
  `observeRefCarryCommitRace`.

### 3.6 The withdrawal

- `UnavailableWithdrawJournal` (`sync-withdraw-journal.ts`) carries the fault its throw names, and `heldWithdrawal`
  (`sync-withdraw-commit.ts`) takes the notice's condition and remedy from it; a throw that names no fault keeps
  today's text with the restore remedy. `commitWithdrawEnd` names the end's history ref for a **Missing** fault.
- Journal reads, each **Missing**: `describeWithdrawJournal`'s graph and `materializeWithdrawJournal`'s trees
  (`sync-withdraw-journal.ts`); `readWithdrawalAncestors`, `readWithdrawalTrees`, and `requireWithdrawalBlobs`, which
  also catches a non-blob (`sync-withdraw-prepare.ts`). `readLineageMessage` (`sync-withdraw-earlier-lineage.ts`)
  catches every completed failure today; it takes **Missing** only where `isUnavailableGraphFailure` confirms one.
- `inverseMetadata` (`sync-withdraw-inverse.ts`), § 9: reads its five inputs through § 1.2 instead of `JSON.parse`;
  **Unparseable** takes hist for `before`, `after`, and the ancestor, and fwd for the current and published sides.
- `withdrawRecordMetadata` (`sync-withdraw-records.ts`) takes the side of the snapshot it reads, passed by
  `entryDocument`, `sameWithdrawRecord`, and `selectedWithdrawFormat`; `entryDocument`'s missing record blob is
  **Missing**; `decodeEntryBytes` (`sync-withdraw-entries.ts`) already splits by side.
- `retainSelectedFormats` and `preserveInverseConflicts` (`sync-withdraw-inverse.ts`): sides as settled above;
  `preserveInverseConflicts`' raw errors for missing or unparseable metadata become the fault's throw, and its
  missing-family check stays an internal error. `repairWithdrawnLineage` (`sync-withdraw-lineage.ts`) reads metadata
  the same way.
- `registryMetadata`, `decodeConflict`, `preserveOwnerLineage`, and `preserveConflicts`
  (`sync-withdraw-preserved-lineage.ts`): an absent object is **Missing**, an undecodable one **Unparseable**, a
  non-empty registry tree with no metadata entry **No metadata**; a decoded record naming another origin keeps its
  condition with the restore remedy. A conflict coordinate `RecordReferenceSchema` rejects is unchanged.
- `entryLabel` (`sync-withdraw-entries.ts`): an unavailable graph is **Missing**.
- `laterSiblingEnds`, `siblingFolders`, `terminalOwner`, and `currentEndCandidates` (`sync-withdraw-sibling-ends.ts`):
  the walk's catch is **Missing**; `siblingFolders` rethrows its diagnostic's fault rather than discarding its remedy;
  `terminalOwner`'s registry tree is **Missing** and its lineage record **Missing** or **Unparseable**. An absent
  history coordinate and an end no candidate witnesses are unchanged.
- `readItemEndCandidates` (`sync-lifecycle-log.ts`), § 1.9: under `kind: "all"` it also returns the commits whose
  metadata blob is missing or undecodable, or whose non-empty tree has no metadata entry, each with its batch.
  `currentEndCandidates` holds on one that carries the folder's end batch, before the published-folder exemption,
  with hist; its re-read gives slugless metadata **Unparseable** with hist. `readItemEndBatches` discards the new
  sets.
- `conflictValue`'s placement fault is 3.2's. Tolerate: `withdrawRecordDefinition`, `inverseArchive`, the earlier
  lineage's `decodeConflict` (`sync-withdraw-lineage.ts`), `withdrawRefTargets` and `describeMovedEnds` through
  `readLifecycleFolders`. Unchanged: `prepareWithdrawEnd`'s empty journal and collision refusals,
  `preserveInverseConflicts`' family check, and `movedEnd`.

### 3.7 A missing local object after a fetch

- One helper, run only after a fetch ends in a completed Git failure with no porcelain rows, checks every ref and
  every worktree's `HEAD` with `cat-file --batch-check`, skipping a `HEAD` listed as the null object ID, a worktree
  on an unborn branch. A missing tip object is a **Local transport fault** naming its ref, `refused` with the restore
  remedy.
- When every tip is present, it takes the object IDs the failure's stderr names, by `isUnavailableGraphFailure`'s match
  (`history-graph.ts`), factored to take that stderr, and confirms them with one local-only commit walk,
  `rev-list --missing=print --all` without `--objects`. A named commit the walk lists as `?<oid>`, such as an ancestor
  the forced-update check read, is a **Local transport fault** naming it, its condition keeping the fetch's stderr. The
  fetch prints "Could not read <oid>" for each missing commit it reads before the transfer, marking recent commits of
  every local ref complete, a code branch's included, and negotiating, and carries on. Two later steps fail it with no
  porcelain rows (Git 2.55.0, ARC's own fetch arguments). Under the `--show-forced-updates` ARC passes, the
  forced-update check exits 128 with "could not parse commit <oid>" when it reads a commit an updated ref's old history
  lacks. When the remote's new history builds on a commit the clone has lost, in any ref (a rewind of that ref, or
  another ref merging it), the connectivity check exits 1 with "fatal: revision walk setup failed" and "did not send all
  necessary objects", with or without that flag. A lost commit in a ref whose history the fetch neither updates from nor
  builds new history on, or under a fetch with nothing new, exits 0; whether one deeper in an updated ref's old history
  is read depends on the setup. A remote that lacks an object it must send exits 128 with "remote: fatal: unable to read
  <oid>"; the walk never lists that object, so the failure keeps `unreachable`, unless the clone also lacks a commit the
  fetch read, which the stderr then names too and which is reported first, whether or not a read of it is what failed
  this fetch; a lost commit in a code branch can be named too, as one was in a branch newer than the store's tracking
  refs (Git 2.55.0). A commit-graph covering the lost commit serves it to both the fetch and the walk, so the fetch
  succeeds and the helper never runs; a test that removes a commit keeps it out of any commit-graph.
- It runs where `pullRemote` (`pull.ts`) meets the state fetch's and the history fetch's failures, gated on the mark
  `parseFetchPorcelain` sets on a rowless outcome from a completed failure; in `runMigrationFetch`
  (`migrate-remote-fetch.ts`, under `fetchMigrationRemote`); and in `runProjectFetch` (`designation-project.ts`, under
  `fetchProjectCheck`). `failedRemotePull` also reports timeouts as `unreachable`, so it takes the failure code from
  its caller.

### 3.8 The import's publication journal

- `unpublishedImportClaims` (`import/transient-publication.ts`) reads the blob tip of `IMPORT_PUBLICATION_REF`
  (`refs/arc/tmp/migrate/import-required`). A missing blob throws a raw error, and a blob that does not parse escapes
  through `JSON.parse` or the schema; both reach `retireOriginRefs`' caller as an untyped exception. Each returns the
  function's own `{condition, remedy}` pair, as the absent ref already does: missing restores the ref from the retained
  journal; unparseable names the unparseable journal with the same restore.
- Other `import/` reads: `firstPointerTime` tolerates; `committedAt` is § 11.2's; `readRequiredNote`
  (`import/personal-recent-notes.ts`) and `manifestFiles` (`import/personal-notes.ts`) read notes objects, not a state
  ref's, and report an unreadable note for that person, unchanged; `code-captures.ts` skips a code commit's unreadable
  objects, unchanged. `import/lineage.ts` and `import/source.ts` pass an `unreadable` listing on as the import's own
  refusal, unchanged.

### 3.9 Readers and `corruptRef`

The readers are § 1.8's table. `unavailableSnapshot` (`snapshot-read.ts`) is also a **Missing** producer: its
listing refusal for unavailable tips or root trees names a history ref only for an item with no live ref (§ 1.6).
Once every site above calls the helper, `corruptRef` keeps only its unparseable arm, and no caller passes it a missing
tip or tree.

### Outside the flip, unchanged

Moves between remotes (§ Non-Goals) reach these, and no change in this unit alters what they receive:
`readRemoteCopyReport` (`migrate-cleanup-report.ts`) and `readCopyJournal` (`migrate-copy-journal.ts`) throw on an
unreadable record; `reaches` (`migrate-copy-journal.ts`) and `migrate-remote-copy.ts`'s copy reads tolerate; the
`cat-file` reads in `follow-candidates.ts` serve follow alone; `readMoveRecord` and `readForwardingRecord` are § 1.3's
unchanged readers, and `prepareRefCopy` is § 1.8's.

## Held out of the import review's first pass

Observations from the sweep that touch 1.2's scope. 1.2's first pass gets none of them; 1.3 matches its findings
against them, and a match folds into the task named here.

- `unpublishedImportClaims` throws untyped on a missing or unparseable publication journal, reached through
  `retireOriginRefs` — 3.8.
- `manifestFiles` throws on an unreadable note blob, which `personal.ts` turns into a blocking per-person notice,
  while § 11.2 covers only `committedAt`'s throw. It reads a notes object, not a state ref's, so it has no Phase 3
  row, and 1.3 dispositions it whether or not the review raises it.

## Import state faults

Filled at 1.3 and by 5.12's rehearsal: each refusal or blocking notice a trial raises correctly about this repository's
state, with its condition, its remedy, and the state it names. Each is repaired with the Owner's approval, 1.3's by 5.11
and 5.12's within 5.12. The unmapped review-source notices are recorded here once, as cleared by the review mapping's
binding (§ Coordination with `seam-delivery-review`); they take no repair. A fault 5.12 finds in the review mapping
itself is recorded here as the mapping's; it takes no repair here, and 5.13 waits until its fix lands and this unit
merges base.

## Import review fixes

Filled as each fix lands, from whichever phase lands it: each commit that fixes an import review finding, by SHA, with
the finding and the task it landed in, a fold into any task and a corrective parent's fix included. 5.10's fix check,
and the `6.R` and `7.R` checks 1.3 adds for a Phase 6 or Phase 7 fold, take these commits as their target; base merges
are not on it.
