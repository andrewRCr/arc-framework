# Spec (`detailed` · `RFC`): storage-ref-hardening

- **Origin:** [internal] — routed from the ref backend's standard review, its fix checks, and defects found while
  fixing them (2026-10-29).

- **Purpose:** Make the ref backend safe to cut over to. Every defect that the import, the cutover rehearsal, or
  ordinary operation after the flip reaches ends in a typed refusal or outcome whose remedy can clear it, instead of a
  raw exception, a Git lock left behind, an unbounded retry, or a remedy that cannot repair the fault.

---

## Introduction / Context

The ref backend (`lib/store/ref/`) keeps ARC's operational and planning state in Git refs under `refs/arc/*`. Each work
item and cohort has one live ref (`refs/arc/work/<uid>`, `refs/arc/cohort/<uid>`). An ended item's history is kept
under `refs/arc/history/*`. Archived folders live in quarterly archive refs, and project and personal state have
refs of their own. In the **default layout** those refs live in the code repository. In the **separate layout** they
live in a bare repository at `<common-dir>/arc/store` (`writeRefRepository`, `lib/store/ref/repository.ts`). The
backend exchanges state with remotes through `pull` and `push`, fetching into tracking refs under
`refs/arc-remotes/<remote>/`. The import (`arc store migrate --import`) fills it once from today's tracked files and
Git notes.

Ordinary commands compose the in-repo backend today (`createStore`, `lib/store/create.ts`). `createRefStore` has no
caller outside tests, so only `arc store migrate`, `arc store remote`, and `arc store conflict` reach this code
(`runStoreMigrate`, `runStoreRemote`, `runStoreConflict`). When this repository's state flips onto the ref backend,
every store call reaches it. The backend's review left findings in code the flip exercises, and this specification
fixes them before the flip.

### What the flip exercises

The flip exercises three things:

- the import, run first as a trial (`--trial`) and then for real;
- the cutover rehearsal on this repository's real state;
- ordinary operation after the flip in the default layout: `read`, `list`, `lookup`, `write`, `batch`, `history`,
  `changes`, `version`, `pull`, and `push`.

Moving state between remotes, the separate layout's own paths, and test, race, and benchmark tooling are outside it
(§ Non-Goals). An item stays in scope when the import, the rehearsal, or post-flip operation reaches it. A path
reached only by a move between remotes also stays when a kept fix changes what that path receives (§ 4).

### Terms

- **Refusal class.** Every `StoreRefusal` (`lib/store/refusal.ts`) is `recoverable` or `terminal`. Callers branch on
  the class: a recoverable refusal invites a retry once its remedy is applied. A terminal one is a fault to repair.
  `state-unresolvable` is recoverable and carries `historyRefs`, the history refs a pull could fetch to supply what is
  missing, possibly none. `namespace-corrupt` is terminal. `lock-held` is recoverable and names its `lock`.
- **Sync deadline.** One `pull` or `push`, with every pull nested in it, runs under one deadline of
  `REF_SYNC_DEADLINE_MS` (120 seconds) (`withRefSyncDeadline`, `lib/store/ref/sync-deadline.ts`). `bindDeadline` binds
  it to the context: each Git call (`exec`, `execInput`, `rawExec`) carries the deadline's abort signal, and each lock
  wait is cut to the time remaining.
- **Ref transaction.** `updateRefTransaction` (`lib/git/ref-transaction.ts`) applies a set of expected-value ref
  changes in one `git update-ref --stdin` process: `start`, the changes, `prepare`, and `commit`. If Git fails and the
  refs are read back changed, it returns `lost-race`. If Git fails with every ref still at its expected value, it
  rethrows Git's error.
- **Git ref locks.** While a transaction holds a ref, Git keeps a lock file for it: `<ref>.lock` and
  `packed-refs.lock` in the files format, `reftable/tables.list.lock` in the reftable format. Git removes them on
  ordinary exit and on catchable signals only.
- **Advisory locks.** The store's own locks are files under `<common-dir>/arc/locks/`, taken through the context's
  `lock` port (`createRefLockFactory`, `lib/store/default-ports.ts`, over `acquireAdvisoryLock`,
  `lib/advisory-lock.ts`). Two matter here:
    - **The layout lock** (`layout`) is clone-wide, and writes and pull merges wait up to `DEFAULT_MAX_WAIT_MS`
      (10 seconds) for it.
    - **The keeper lease** (`refs/arc/tmp/seen/<remote>`) is per remote. Keepers are refs under
      `refs/arc/tmp/seen/<remote>/` that hold the last verified tracking heads across a pruning fetch
      (`withRefFetchKeepers`, `lib/store/ref/fetch-seen.ts`).
- **The move lock.** The lock a move of state between remotes holds. Before this change it was the only lock the
  store's rules let span a network call.

## Goals

1. A read that refuses or reports on a missing Git object says that it is missing and how to restore or fetch it. It
   does not report the object as unparseable state with a forward-repair remedy. A misplaced archive folder is
   reported as a placement fault with a remedy that names its placement, not as missing metadata (§ 1).
2. A live listing applies an as-of listing's owner scope and the absence rule of the in-repo tracked and personal
   listings (§ 2).
3. Every pull consumer surfaces a designation question, and a history-retry path stops on one rather than failing
   with a bare refusal (§ 3).
4. Transport failures become per-remote failed outcomes or typed refusals, never escaping exceptions (§ 4).
5. The sync deadline never kills a ref transaction it has launched. A Git ref lock left behind
   is reported as `lock-held`, with its path, its age, and a remedy that can clear it, at every site that runs a ref
   transaction (§ 5).
6. No path waits for the keeper lease while holding the layout lock on a post-flip operation. The keeper lease is
   stated as the one other lock held across a network call, bounded by the sync deadline (§ 6).
7. A lost compare-and-swap on a history destination retries within a bound, like any other lost ref (§ 7).
8. The remaining lock, sync, withdrawal, and decomposition defects end in typed outcomes (§ 8–§ 10).
9. The import is reviewed before the rehearsal, and every finding that an import of this repository's state can reach
   is fixed (§ 11).
10. No refusal code, pull-notice kind, publish-failure kind, or result schema changes.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This work does not:

- **change moving state between remotes, or the separate layout's own paths.** Each of these keeps today's behavior:
    - the copy, delete, follow, departure, and withdrawal push loops restart without bound on an unverified lost-race
      classification (`settleMigrationPush`, `lib/store/ref/migrate-remote-copy.ts`, and the counterless loops in
      `migrate-remote-copy.ts`, `migrate-remote-delete.ts`, `follow-copy.ts`, `follow-delete.ts`, `leave-source.ts`,
      and `leave-recorded-withdraw.ts`);
    - five paths hold the layout lock while waiting for the keeper lease. They are the same-layout arm of a remote
      switch (`prepareTarget`, reached from `migrate-remote-switch.ts` and `source-switch.ts`), the layout move
      (`moveRefLayoutAsSwitch`, `migrate-layout.ts`), the switch undo (`undoSwitch`, `migrate-switch-undo.ts`), and
      `arc store remote`'s backing setting (`applyBackingSetting`, `remote-backing.ts`). The backing setting refuses
      before the lease in the default layout;
    - a declined automatic designation repeats `move-unfinished` for pull and loses it for push
      (`designation-first.ts`; `push.ts`);
    - first placement treats an ambiguous designation as the separate layout (`writeRefRepository`, `repository.ts`;
      `designatedStoreLayout`, `layout-designation.ts`).
- **fix tests whose only defect is the test**, such as the captured-base mutation tests that never assert the mutation
  fired (`__tests__/integration/store-ref-import-captured-bases.test.ts`).
- **reduce Git processes per call, share results across calls, or drop a `readSyncRefs` capture inside a sync
  call.**
- **change how `readBatchObjects` (`lib/store/ref/batch-read.ts`) answers a `missing` query.** Today every `missing`
  answer becomes `null` (`:111`). A check that repeats the answer only when the store directory has gone may land there
  before or after this change. Either way, ordinary `missing` answers reach the classification in § 1, and this change
  leaves that check as it is.
- **add a type check for an object a ref or tree entry points at.** A ref or a tree entry can point at an object
  whose type its place does not hold. Only a writer other than ARC creates one, and every state ref in this repository
  points at a commit. No site gains a check or a row for one: it takes the row of the read that meets it. § 1.2's
  metadata read gives a present object that is not parseable metadata **Unparseable**, whatever its type. A site that
  reaches one through `corruptRef`'s missing-objects arm takes **Missing** with that arm (§ 1.4). A blob tip in
  `readRefTrees`, whose `<tip>^{tree}` query answers `missing`, is one such case, and a wrong-typed merge endpoint
  (`sync-merge.ts:74`) another. A site that reads one as present today, as `readRefTrees` does a tree or an
  annotated-tag tip, keeps doing so.
- **end a Git process gracefully, reclaim a lock a canceled call held, remove any lock automatically, or disable
  Git hooks.**
- **fix an import finding that an import of this repository's state cannot reach.** § 11.1 records such a finding
  here by amendment, without fixing it.
- **review the import's read-only transform modules in full.** A trial run surfaces their faults (§ 11.1).

## Proposed Design

Paths are under `packages/arc-framework/src/` unless they start with `__tests__/` (under `packages/arc-framework/`).
Line numbers are as of `90b6de349`.

§ 1–§ 4 change refusal kinds, remedies, or result shapes that callers branch on or that drive automatic retries. They
are built and reviewed first, and later work that builds on the ref backend reads them. § 11's import review runs as an
early phase, since its findings size the rest of the plan. § 5–§ 10 follow. The work lands as one change (§ 13).

### 1. One fault classification for missing, unparseable, and misplaced objects

#### 1.1 The classification

Every read classifies a fault by what is wrong with the object, not by where the read happened:

| Fault                                                                                                                                            | Point read or write                                                                                           | Listing diagnostic               | Pull: ref held             | Push: ref excluded        | Remedy                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------- | ------------------------- | ---------------------------------------------- |
| **Missing:** an object of the ref — its tip commit, its root or a nested tree, or a metadata or record blob — is absent from the object database | recoverable `state-unresolvable`; `historyRefs` names a history ref only for an item with no live ref (§ 1.6) | `unreadable`                     | `namespace-corrupt` notice | `refused` publish failure | restore or fetch the object                    |
| **Unparseable:** the object is present and does not parse                                                                                        | terminal `namespace-corrupt`                                                                                  | `unreadable`                     | `namespace-corrupt` notice | `refused` publish failure | forward repair, as today                       |
| **No metadata:** a readable tree that holds records has no metadata entry                                                                        | terminal `namespace-corrupt`                                                                                  | `unreadable`                     | `namespace-corrupt` notice | `refused` publish failure | forward repair, as today                       |
| **Misplaced:** an archive folder's placement disagrees with its archive (§ 1.5)                                                                  | terminal `namespace-corrupt`, with a placement condition                                                      | `malformed`, `rule: "placement"` | `namespace-corrupt` notice | `refused` publish failure | the folder's placement, per § 1.5              |
| **Local transport fault:** a local ref's tip object is missing, or a transport target cannot be resolved                                         | per-remote `failed` outcome, failure `refused`                                                                | —                                | —                          | —                         | restore the object, or repair the remote's URL |

Every cell names an existing code, kind, or field. `ListingDiagnosticSchema` (`lib/store/read.ts:47-54`) already
admits `rule: "placement"` on `malformed`. `PullNoticeSchema` (`lib/store/sync.ts:42-50`) already holds the
`namespace-corrupt` notice kind. `PublishFailureSchema` (`lib/store/refusal.ts:39-44`) and the per-remote pull failure
(`sync.ts:54`) already hold the `refused` code. A held or excluded ref keeps its notice kind or failure code and
carries its row's condition and remedy.

A forward repair cannot change an ancestor. So an **Unparseable** or **No metadata** object read from a history commit
or a saved state takes the historical remedy instead of the forward repair: `historicalMetadataFailure`'s, or
`unparsedMetadata`'s with `saved` set (`metadata.ts:52-62`). A history commit is any commit other than the current tip
of the ref it is read from. That is today's remedy at the history reads § 1.9 lists, and every site the search finds
(§ 1.4) follows it. Among the sites the rule decides:

- Three pull reads parse metadata at a merge base. The two merges read three sides each: `groupSides`
  (`sync-tree.ts:106-110`) and `mergeArchiveTree` (`sync-archive.ts:22-33`). The withdrawal reads its common ancestor
  (`sync-withdraw-prepare.ts:62-78`), which `inverseMetadata` (`sync-withdraw-inverse.ts:126`), `entryDocument`
  (`sync-withdraw-entries.ts:43-47`), and `sameWithdrawRecord` (`sync-withdraw-inverse.ts:109`) parse. Each merge base
  is a history commit and takes the historical remedy, and so do the withdrawal journal's `before` and `after`
  snapshots, which are saved states. The tips take the forward repair: each merge's `local` and `incoming` sides, as
  today, and the withdrawal's current and published ones.
- The withdrawal's metadata parser, `withdrawRecordMetadata` (`sync-withdraw-records.ts:55-60`), takes no side today
  and gives every side the historical remedy (`:58`). Only the entry-byte decode, `decodeEntryBytes`
  (`sync-withdraw-entries.ts:111-121`), splits by side. The parser takes the side of the snapshot it reads, and its
  callers pass it: `entryDocument` (`:102`), `sameWithdrawRecord` (`sync-withdraw-records.ts:63-69`), and
  `selectedWithdrawFormat` (`:72-76`).
- `mergeArchiveTree` today decodes all three sides unsaved (`archive-read.ts:67-68`). It decodes its base with `saved`
  set, so every diagnostic it builds there takes its saved remedy, a Misplaced folder's included (§ 1.5).
- `sync-history.ts:39` reads a history ref's own tip, so it keeps the forward repair.

`refRecordAbsence` (`lib/store/ref/record-absence.ts`) already reports a missing record blob as the first row does.
Point reads already give a missing record blob the restore remedy (`read.ts:350-353`, `record-absence.ts:14-17`,
`write-views.ts:167-169`).

#### 1.2 The metadata read keeps the fact

`parseRefMetadata` (`lib/store/ref/metadata.ts:28`) returns null for a missing object and for an unparseable one
alike, which erases what the classification needs. A metadata read gains a discriminated result, either missing (no
object), unparseable (present and not parseable, whatever its type), or parsed. `parseRefMetadata` stays as the
null-returning form for sites that tolerate both (§ 1.9).

`readRefTrees` (`lib/store/ref/batch-read.ts:148-166`) drops a ref whose tip object is missing and a ref whose nested
tree is missing alike, and keeps doing so: both are **Missing**, with one remedy.

#### 1.3 Point reads by `tip:path`

`git cat-file --batch` answers `missing` alike for a path absent from the tree and for a blob absent from the object
database. So a read addressed as `<tip>:<path>` cannot tell the **Missing** row from the **No metadata** row by its
answer alone. Each site that refuses or reports on a `missing` metadata or record answer reads the containing tree
only after that answer, as `refRecordAbsence` already does. It classifies a present entry as **Missing** and an
absent entry by the site's own rule. A present object costs no extra read. Sites that tolerate a `missing` answer
keep their fallback.

`readBatchObjects` (`batch-read.ts:49-80`) answers a `missing` query with an explicit `null` under its key (`:111`).
The `<rev>:<path>` reads § 1.4's search found under `lib/store/ref/` at `90b6de349`, `import/` included, by what each
does with that answer; § 1.9 covers the metadata reads by object ID:

**Refuses or reports — classifies by § 1.1.**

| Site                                                                                      | Reads                                     | On `missing` today                                                                                                                                                                    | After this change                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readBoundRecord` (`read.ts:55`, handled `:65-70`)                                        | the item's metadata                       | reads the tree; `holdsNoRecord` gives `not-found`; otherwise `corruptRef(ref, !entries)`, a forward repair when the tree is readable                                                  | an entry present is **Missing**; absent from a tree holding records is **No metadata**                                                                                                                                                                                                                                                                                                                                                      |
| `readUidRefRecord` (`read-uid.ts:20-21`; `unreadableUidTip`, `:61-64`)                    | the item's metadata, by its UID ref       | as `readBoundRecord`                                                                                                                                                                  | as `readBoundRecord`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `readLineageOwners` (`lineage-resolution.ts:22-25`)                                       | the registry's metadata                   | holds the tree (`:17`) but never looks up the entry; terminal `namespace-corrupt` with a forward repair, or the historical remedy on a saved read (`:25`)                             | looks up the entry in the tree it holds: present is **Missing**; absent is **No metadata**. A missing registry tree (`:18`) is **Missing** (§ 1.4). **Unparseable** and **No metadata** take the historical remedy on a saved read, which the change window asks for (`changes-ends.ts:75`, `changes-scope.ts:91`), and the forward repair otherwise                                                                                        |
| `readLiveRefOwners` (`live-owners.ts:23-39`)                                              | each live work and cohort ref's metadata  | holds the tree (`:25`) but never looks up the entry; `corruptRef(ref, !entries, saved)` (`:39`), a forward repair when the tree is readable, or the historical remedy on a saved read | as `readLineageOwners`, the saved read included                                                                                                                                                                                                                                                                                                                                                                                             |
| `currentEndCandidates` (`sync-withdraw-sibling-ends.ts:81-84`)                            | metadata at history commits               | throws `UnavailableWithdrawJournal` for a missing and an undecodable object alike, and `heldWithdrawal` gives both the restore remedy                                                 | its candidates' metadata is classified where `readItemEndCandidates` reads it (§ 1.9). This re-read reads the same blobs, so two inputs reach its throw: metadata with no slug, which the history namespace rejects (`metadata.ts:34`) and `:49`'s read admits, is **Unparseable** with the historical remedy (§ 1.1); an empty-tree end of the folder's end batch, whose path is absent, keeps today's hold by the absent-entry rule above |
| `observeTerminalEndedTwice` (`sync-terminal-ended-twice.ts:27-31`)                        | the registry's lineage record per owner   | a `namespace-corrupt` notice saying the registry is unavailable, for an absent path and a missing blob alike                                                                          | reads the registry tree: present is **Missing**; absent skips the owner, as an unparseable or unmatched record does                                                                                                                                                                                                                                                                                                                         |
| `retiredHistoryHome`'s fallback (`retired-history.ts:46-56`)                              | metadata entries across the ref's history | a present entry whose blob is missing counts as corrupt, giving terminal `namespace-corrupt` with `historicalMetadataFailure`                                                         | a missing blob takes `unavailableRefHistory`, as a missing tree already does (`:47`)                                                                                                                                                                                                                                                                                                                                                        |
| `projectOwnerFromEntries` (`project-identity.ts:59-73`), through `projectIdentityQueries` | the registry's `identity.json`            | reads the tree: no entry is a project owner with no UID; a missing blob or companion tree is terminal `namespace-corrupt` with a restore condition                                    | a missing blob or companion tree is **Missing**; the no-entry case is unchanged                                                                                                                                                                                                                                                                                                                                                             |
| `readOpenConflicts` (`read.ts:56-57`; `conflicts-read.ts:22-29`)                          | the conflicts directory                   | reads the parent tree; absent is no conflicts; otherwise `state-unresolvable` with the restore remedy                                                                                 | unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `refRecordAbsence` (`read.ts:54`; `read-uid.ts:29`)                                       | the record blob                           | reads the tree: present is `state-unresolvable` with the restore remedy; absent is `not-found`; a missing tree (`record-absence.ts:13`) is terminal `namespace-corrupt`               | a missing tree is **Missing** (§ 1.4); otherwise unchanged                                                                                                                                                                                                                                                                                                                                                                                  |

`heldWithdrawal` (`sync-withdraw-commit.ts:95-99`) gives every `UnavailableWithdrawJournal` the remedy of
`corruptRef(error.ref, true)`. A throw that names an object fault carries that fault's row instead, and
`heldWithdrawal` takes the notice's remedy from it:

- **Missing** for an absent object or tree: every throw that says one is unavailable, among them
  `sync-withdraw-preserved-lineage.ts:73`;
- **Unparseable** for a present object that does not decode (`sync-withdraw-preserved-lineage.ts:76,78`);
- the rethrown diagnostic's own fault at `sync-withdraw-sibling-ends.ts:52` (§ 1.9), or, for a diagnostic with no
  § 1.1 fault, its own condition and remedy.

`sync-withdraw-sibling-ends.ts:66` and `sync-withdraw-preserved-lineage.ts:39,52` fold several cases into one throw.
They read their objects by ID, so each tells an absent object (**Missing**) from one that does not decode
(**Unparseable**), and `sync-withdraw-preserved-lineage.ts:52` also tells a non-empty registry tree with no metadata
entry (**No metadata**). A record that decodes but disagrees with what the withdrawal needs, naming another
`origin.uid`, keeps today's condition, with the restore remedy the helper's **Missing** row gives, which is today's
text. So does every throw that names no object fault: an absent history coordinate (`sync-withdraw-sibling-ends.ts:29`),
no candidate that witnesses the end (`:79`), and a conflict coordinate that `RecordReferenceSchema` rejects
(`sync-withdraw-preserved-lineage.ts:66`).

`projectOwnerFromEntries` serves every project-identity read:

- `read.ts:58-59`, `history.ts:43`, `changes.ts:60`, `changes-scope.ts:39`, and `write-manifest.ts:40-42`;
- `bindProjectMutations` (`project-identity.ts:91`) and `projectIdFromTip` (`designation-project.ts:72`);
- the migration and follow reads, `migrate-registry.ts:14,30`, `migrate-remote-copy.ts:343`,
  `follow-candidates.ts:116`, `follow-copy.ts:62`, and `follow.ts:130`, which throw the refusal inside a
  `MigrationRefusal`.

**Tolerates — keeps its fallback.**

- `readHistoryPaths` (`history-paths.ts:10-13`) falls back to the parent commit, then to the owner's name.
- `retiredHistoryHome` (`retired-history.ts:34-38`) skips a revision whose metadata is missing.
- `readScopedPointTree` (`view-state.ts:55`) returns no tree. Its consumers classify the result: the write views
  (§ 1.6) and the saved-state snapshot (§ 1.8).
- `publishedTerminalLineage` (`sync-ended-twice.ts:48-50`) answers false.
- `readUidRefRecord`'s pinned metadata (`read-uid.ts:29`) restarts when the tip moved between its two reads.
- `readMoveReport` (`migrate-record.ts:86`) returns no report.
- `firstPointerTime` (`import/parked-source.ts:82-87`) stops at the last parked time it found.
- `projectListingBinding` (`project-identity.ts:143-148`, from `read.ts:166-168`) lists with an owner that has no UID
  and an `unreadable` diagnostic, which the **Missing** row already prescribes.

**Unchanged, outside the flip.** `readForwardingRecord` (`forwarding-record.ts:25-26`) and `readMoveRecord`
(`migrate-record.ts:74`) refuse `move-record-malformed` for a missing and a malformed record alike. Each record exists
only after a move between remotes (§ Non-Goals). `readRequiredNote` (`import/personal-recent-notes.ts:71`) reads a path
that `diff-tree --diff-filter=AM` found at the same commit, and reports any failure as an unreadable note for that
person.

#### 1.4 One fault helper

One helper maps a fault to its refusal, listing diagnostic, and remedy. It composes the existing pieces rather than
adding a kind:

- `corruptRef` (`namespace-health.ts:9-14`);
- `recordDiagnostic` (`content-read.ts:29-36`);
- `unreadableRef` (`read.ts:274-278`);
- `unavailableRefHistory` and `isUnavailableGraphFailure` (`history-graph.ts`);
- `missingChangeState` (`changes-graph.ts:88-93`);
- `metadataFailure`, `historicalMetadataFailure`, and `unparsedMetadata` (`metadata.ts`).

Every site that refuses, reports, or holds on a fault calls it, however it reads the object (by `tip:path` or by object
ID) and however it builds the result: through `corruptRef`, from a capture's diagnostic, or directly. A search finds
those sites, and the search binds. It runs under `lib/store/ref/`, `import/` included, and takes both where an object
is read and how a fault is reported:

- **Reads:** every call of `readBatchObjects`, `readRefTrees`, or `parseRefMetadata`, and every direct `cat-file` or
  `show`.
- **Reports:** every call of `corruptRef`; every construction of a `namespace-corrupt` or `state-unresolvable` refusal
  or notice, an `UnavailableWithdrawJournal`, or a `RefSyncLabelError`; and every use of the `unreadable` diagnostic
  kind.

A hit inside a function that only builds one of these results brings in that function's callers. A graph walk passes
its unavailable refusal to `readHistoricalGraph` as an argument, so the report terms find it. Each site the search
finds that refuses, reports, or holds on a missing object takes the **Missing** row through the helper. Task
generation runs the search and sweeps what it finds; the sweep, not any list in this spec, is the inventory. § 1.3,
§ 1.6, and § 1.9 record sites it found and classified at `90b6de349`, for orientation. So the next read written
against the metadata read cannot repeat the defect.

Its missing arm replaces `corruptRef`'s missing-objects arm. Today `corruptRef(ref, true)`, and `corruptRef(ref,
!entries)` when the tree read finds nothing, report a missing tip or tree as terminal `namespace-corrupt` whose remedy
says to restore or fetch the objects and retry. About forty sites across reads, writes, sync, and history do so, among
them `archivedViewRead`'s unavailable archive tree (`write-views.ts:244`), `refRecordAbsence`'s missing tree
(`record-absence.ts:13`), and `readLineageOwners`' missing registry tree (`lineage-resolution.ts:18`). Each returns
the **Missing** row through the helper instead, and `corruptRef` keeps only its unparseable arm. Sites that build the
same refusal without `corruptRef` call the helper too. Among them are `planRefRetirements`' unavailable registry tree
(`write-retirement.ts:35-36`); `registryTreeUnavailable` (`project-identity.ts:46-49`), which
`projectOwnerFromObjects` (`:52-55`) and `viewProjectOwner` (`write-views.ts:200`) reach; and `readableSyncReference`'s
missing record blob (`sync-records.ts:219-223`), held by the pull merge with a remedy that offers a forward repair.
Builders that already give the **Missing** row's code, class, and remedy call the helper as well and keep them. Among
them are the point reads § 1.1 names (`read.ts:350-353`, `record-absence.ts:14-17`, `write-views.ts:167-169`),
`claimPayloadRefusal` (`lookup-claims.ts:66-69`), `checkRecord` (`write-checks.ts:48-50`), `unavailableHistory`
(`history-snapshots.ts:91-95`), and the conflicts read (`conflicts-read.ts:113-114`). A saved manifest
(`readRefManifest`, `manifest-read.ts:8-22`) is no object of a ref, so the `state-unresolvable` refusals for an
unavailable one (`snapshot-read.ts:45`, `changes.ts:36`), and for an anchor naming a state version no manifest here
resolves (`write-anchors.ts:42-46`), are outside § 1.1 and keep their text. Every reader of the
codes and fields this moves is in § 1.8.

#### 1.5 Placement faults

`folderPlacement` (`lib/store/ref/archive-read.ts:174-184`) returns null for four conditions.
`decodeArchiveFolderControls` (`:97-112`) calls it only after `folderOwnerMismatch` (`:106-107`), whose folder-name
pattern already requires a cohort's closeout letter (`:126`). So a cohort folder with no closeout letter is a
`key-mismatch` with a rename remedy today, and stays one. The decoder reports each of the other three as the
`unreadable` metadata diagnostic. Its remedy, `metadataFailure` (`metadata.ts:45-49`), is a forward metadata repair
that cannot fix any of them. Each becomes a `malformed` diagnostic with `rule: "placement"`, keyed `${ref}:${root}`,
with its own condition and remedy. The **current** remedy repairs forward in a new commit. The **saved** remedy keeps
`historicalMetadataFailure`'s text, since a forward repair cannot change an ancestor. A saved state and a history
commit (§ 1.1), the archive merge's base among them, take the saved remedy.

| Condition (`folderPlacement`)                                                  | Condition text                                                                                                 | Current remedy                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The stored placement is not `completed`                                        | `The archive folder <key> holds metadata whose placement is <kind or "absent">, not completed.`                | `Record the folder's completed placement for quarter <archive quarter> in its metadata in a new commit, or, if the item has not ended, remove the folder from the archive; then retry.`    |
| The stored quarter differs from the archive's quarter                          | `The archive folder <key> is in quarter <archive quarter>, but its metadata records quarter <stored quarter>.` | `Move the folder to the archive for quarter <stored quarter>, or correct its metadata's quarter to <archive quarter>, whichever matches when the item ended, in a new commit; then retry.` |
| The folder name has no valid sequence (`ArchiveSequenceSchema`) before its `_` | `The archive folder <key> has no valid sequence prefix.`                                                       | `Rename the folder to <sequence>_<slug>/ (a cohort's <sequence><a or b>_cohort-<slug>/), restoring its assigned sequence and preserving its quarter, in a new commit; then retry.`         |

Only a digit prefix that `ArchiveSequenceSchema` rejects, such as `1_` or `00_`, reaches the sequence condition; any
other folder name fails `folderOwnerMismatch` first. A record-role work item (`work-item/record`) carries no sequence,
so only the first two conditions apply to it, as today. Every reader that captures archived folders reaches these
through `captureArchivedFolders` (`ended-owners.ts:34`): `list`, archived `read`, `lookup`, `write`, `changes`, `pull`,
and `push`.

#### 1.6 Site fixes

- **Archived record keys.** An archived record diagnostic prefixes only the key, its remedy names the folder-relative
  path, and neither names the archive (`archive-view.ts:19`, `read.ts:192`). The remedy comes from
  `recordDiagnostic(entry.path)` over the root-stripped path that `projectRefTreeEntry` gives (`archive-read.ts:93`).
  The key becomes `${ref}:${root}${path}`, and the remedy names that full key. Callers recover the ref with
  `key.split(":")[0]` and keep working. The prefix is applied at these sites, not inside `decodeCapturedRef`, which
  would break the `key === path` matches at `read.ts:349` and `write-views.ts:224`.
- **Missing metadata read as unparseable.** Every metadata read that refuses, reports, or holds on a null
  `parseRefMetadata` result treats a missing object as unparseable metadata, mostly with a forward-repair remedy;
  lookup and live-owner capture are among them (`lookup-trees.ts:70-72`, `live-owners.ts:34,39`). § 1.4's search
  finds them, and § 1.9 records those it found at `90b6de349`, by path or by object ID. Each takes § 1.2's metadata
  read and classifies by § 1.1.
- **Unavailable blob in a current listing.** `recordDiagnostic` (`content-read.ts:29-36`) gives the restore remedy
  only for saved state. A current listing's unavailable record blob takes the restore remedy too.
- **History refs for a missing nested tree.** `unavailableSnapshot` (`snapshot-read.ts:61-66`) maps every
  unavailable work or cohort ref to its history ref. So the automatic history pulls in `operational-sync.ts`
  (`historyRefs()`) and `readStateHistory` (`lib/handoff/state-history.ts`) fetch nothing useful for a live item whose
  tip is present and a nested tree is missing. `historyRefs` names an item's history ref only when the clone's current
  state holds no live ref for that item, so that its retained history is where the object can be found. For a live
  item it is empty, and the remedy says to restore or fetch the object. The rule applies to every **Missing**
  refusal, `unavailableSnapshot`'s listing refusal (`snapshot-read.ts:52`) among them.
- **Name-restricted changes.** A manifest tip this clone lacks is refused as terminal `namespace-corrupt`:
  `changes-scope.ts:24-26` resolves through `resolveRefName` to `corruptRef(ref, true, saved)`
  (`lookup-trees.ts:66`). The lineage-restricted path (`changes-scope.ts:85-95`) does the same, and `:25` falls back
  to the interval's earlier side only on `not-found`. Both return recoverable `state-unresolvable`, as the
  unrestricted path already does (`missingChangeState`), with `historyRefs` by the rule above.
- **A missing local tip.** Git's post-fetch connectivity check walks every ref and every worktree's `HEAD`. So a
  fetch exits 1 naming the ref, with no porcelain rows, when any of them has no local object, whether or not the fetch
  brings new objects. That includes a state ref under a `--negotiation-tip` pattern (`refFetchNegotiation`,
  `fetch-target.ts:30-39`), a code branch, a `refs/arc/tmp/*` ref, and a linked worktree's detached `HEAD`. Missing
  ancestors or blobs under a tip do not fail the fetch. `parseFetchPorcelain` (`lib/git/fetch.ts:29-30`) reports that
  failure as `unreachable`, and `failedRemotePull` (`pull.ts:186-192`) attaches the remote-connectivity remedy
  `refSyncTransportRemedy`. `migrate-remote-fetch.ts:60-69` and `designation-project.ts:115-121` parse the same way.
  The migration fetch (`fetchMigrationRemote`) stays in scope because the import's transient publication calls it
  (`import/transient-publication.ts:39-42`). `classifyRemoteFailure` (`lib/git/remote-ref-reader.ts:164-179`) reads
  only stderr text, so detection is by state. After a fetch ends in a completed Git failure (`isCompletedGitFailure`)
  with no porcelain rows, one helper checks the local tip objects once: every ref (`for-each-ref` with no pattern) and
  every worktree's `HEAD` (`worktree list --porcelain`), into `cat-file --batch-check`. A missing object takes the
  **Local transport fault** row, naming its ref. Any other failure keeps today's classification and condition text.
  The helper serves all three sites, runs only after such a failure, and reads no Git message text. A fetch the sync
  deadline killed is a canceled failure, not a completed one, so it never reaches the helper.

#### 1.7 Sync reach

A pull reaches the classification through `checkSyncRefTip` (`sync-tip.ts`), which calls `checkRefTip`, and through
`heldMerge` (`sync-merge.ts`), which holds a ref with a `namespace-corrupt` notice for any refusal. A ref held for a
missing object carries the **Missing** row's condition and remedy, so its notice says to restore or fetch the object.
A push reaches it through `excludeBrokenPushRefs` (`push-exclusion.ts`). That function runs `checkSyncRefTip` on every
changed ref and excludes the families a refusal touches with a `refused` publish failure, which stays terminal and
carries its row's condition and remedy.

#### 1.8 Readers whose behavior changes

A missing object moves from terminal `namespace-corrupt` to recoverable `state-unresolvable`. A local transport fault
moves a per-remote failure from `unreachable` to `refused`, and so moves the operational pull status from
`unreachable` to `incomplete` through `transportOnly` (`operational-sync-bindings.ts:44-46`). No helper in `src/`
branches on refusal class generically, and `RefusalCode` has no importer there.

**Readers that branch on what changes.** Every reader in `src/` that branches on a changed code, notice kind, failure
code, pull status, or refusal class:

| Reader                                                                                                                                                                                                                                                                                                     | Branches on                                                        | Today                                                                                                                                               | After this change                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshotView`'s point read (`snapshot-read.ts:54-58`)                                                                                                                                                                                                                                                     | `namespace-corrupt` on a ref whose tree was unavailable at capture | converts it to `state-unresolvable` (`unavailableSnapshot`, `:61-66`), naming the history ref of any work or cohort ref                             | every producer returns **Missing** for an unavailable tip or tree itself, `archivedViewRead`'s archive tree among them (§ 1.4). The wrapper adds the snapshot's `stateVersion` to any `state-unresolvable` from the saved view that has none and keeps the producer's `historyRefs`; it converts no code |
| `readStateHistory` (`lib/handoff/state-history.ts:23-28`)                                                                                                                                                                                                                                                  | `state-unresolvable`                                               | pulls non-empty `historyRefs`, then retries once; with none, retries once without a pull; any other code throws `StateHistoryRefusal` with no retry | a missing object now takes the retry: one more read, and a pull only for an item with no live ref (§ 1.6)                                                                                                                                                                                                |
| `resolveRecoveryStateBasis` (`lib/recover/state-basis.ts:29-34`)                                                                                                                                                                                                                                           | `state-unresolvable` inside `StateHistoryRefusal`                  | rebuilds the seed at the current version                                                                                                            | a missing object in the seed's change window now rebuilds the seed, where it threw. Recovery reloads from state it can read rather than trusting a window it cannot (Owner, 2026-10-30)                                                                                                                  |
| `runStoreRename` (`lib/work-unit/verbs/rename-store.ts:39-41`)                                                                                                                                                                                                                                             | `state-unresolvable` with non-empty `historyRefs`                  | pulls them through `pullHistoryForRetry` and retries once                                                                                           | a missing object with no history to pull returns its refusal unchanged                                                                                                                                                                                                                                   |
| `conflictHistory` (`conflict-command.ts:51-52`)                                                                                                                                                                                                                                                            | `historyRefs` present and non-empty                                | as `runStoreRename`                                                                                                                                 | as `runStoreRename`                                                                                                                                                                                                                                                                                      |
| `historyRefs` (`lib/store/operational-sync.ts:44-48`)                                                                                                                                                                                                                                                      | `state-unresolvable`                                               | returns its `historyRefs`                                                                                                                           | returns the classification's narrower `historyRefs`                                                                                                                                                                                                                                                      |
| `followCleanupFailure` (`follow-delete.ts:50-54`)                                                                                                                                                                                                                                                          | a wrapped `namespace-corrupt` or `command-line-capacity`           | rethrows those; wraps any other as recoverable `move-unfinished` with a remote-repair remedy                                                        | rethrows a wrapped `state-unresolvable` too, so a missing local object keeps its restore remedy and the move record stays for a resume. Its re-copy path still meets `namespace-corrupt` notices, unchanged                                                                                              |
| `adoptionFailure` (`pull.ts:126-131`)                                                                                                                                                                                                                                                                      | refusal class                                                      | recoverable refuses the whole pull; terminal reports the read source failed and continues                                                           | a missing project identity blob or registry tree refuses the whole pull with the restore remedy. Only a store whose remotes are all read sources reaches it (`adoptSourceProjectIdentity`, `adopt-source-project.ts:14`)                                                                                 |
| `commitWithdrawEnd` (`sync-withdraw-commit.ts:53-56`)                                                                                                                                                                                                                                                      | a `namespace` field                                                | names the refusal's namespace, else the end's history ref; holds the same refs either way                                                           | unchanged holds; a missing object names the end's history ref                                                                                                                                                                                                                                            |
| `listingFault` (`project-identity.ts:151`)                                                                                                                                                                                                                                                                 | `record-malformed` against any other                               | any other is an `unreadable` diagnostic                                                                                                             | unchanged; `unreadable` is what the **Missing** row prescribes                                                                                                                                                                                                                                           |
| `queryDisposition` (`lib/work-unit/store-reconcile-context.ts:54-55`)                                                                                                                                                                                                                                      | `ambiguous-match` against any other                                | any other is a `namespace-corrupt` disposition                                                                                                      | unchanged; a missing object reached it as `namespace-corrupt` already                                                                                                                                                                                                                                    |
| `appendArchiveHolds` (`sync-corrupt.ts:129-140`), `withdrawEndBatches` (`sync-pull-lifecycle.ts:133-135`), `publishRefAttempt` (`push.ts:106-109`), `excludeBrokenPushRefs` (`push-exclusion.ts:21-24`), `prepareRefCopy` (`migrate-copy.ts:41-43`), and `pullRemote`'s withholding (`pull.ts:97,147-162`) | notice kind `namespace-corrupt`                                    | hold, exclude, or abort the ref                                                                                                                     | unchanged; the notice kind stays (§ 1.7)                                                                                                                                                                                                                                                                 |
| `projectPull` (`operational-sync-bindings.ts:41-46`)                                                                                                                                                                                                                                                       | every failure `unreachable`                                        | status `unreachable`                                                                                                                                | a local transport fault gives `incomplete`. Its readers, `consumePull`, `pullSummary` (`store-user-pull.ts:24-26`), and `pullStoreStatus`, treat the two statuses alike, so only the label changes                                                                                                       |
| `timedOutPull` (`pull.ts:72,194-196`) and `publishRefAttempt` (`push.ts:100-102`)                                                                                                                                                                                                                          | `unreachable` with `cause: "timeout"`                              | skip the remaining remotes; publish nothing                                                                                                         | unchanged; a local transport fault is not a timeout                                                                                                                                                                                                                                                      |
| `readMigrationRemote` (`migration-read.ts:11`), `destinationAnswers` (`leave-recorded.ts:70`), `judgeRefFollow` (`follow-candidates.ts:61-63`), and `settleHistoricalCopy` (`migrate-copy-account.ts:38`)                                                                                                  | a wrapped `unreachable`                                            | treat the remote as unread                                                                                                                          | a missing local tip arrives as `refused` with the restore remedy, and each passes it on as it passes every code but `unreachable`                                                                                                                                                                        |

Readers that branch on a failure's role or on any failure, not on a code, are unchanged:

- `consumePull` and `pullHistoryForRetry` (`pull-consumption.ts`);
- archive's publication hold and failure (`archive-store.ts:132-150`);
- the import's publication (`import/finish.ts`);
- the catch-alls in `withdrawRecordedSource` (`leave-recorded-withdraw.ts:14-18`) and `deleteRemoteSource`
  (`migrate-remote-delete.ts:48-51`).

#### 1.9 Every metadata read, and the diagnostics that carry a fault

At `90b6de349`, § 1.4's search finds 35 `parseRefMetadata` call sites under `lib/store/ref/`. By what each does with a
null result:

**Classified in § 1.3**, as `<tip>:<path>` reads: `read.ts:65`, `read-uid.ts:24`, `lineage-resolution.ts:24`,
`live-owners.ts:34`, `sync-withdraw-sibling-ends.ts:82`, and `retired-history.ts:37`.

**Refuses, reports, or holds — takes § 1.2's metadata read and classifies by § 1.1:**

| Site                                                          | On null today                                                                                                                                                       | Reached from                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `captureHistoricalNamespaces` (`historical-namespace.ts:20`)  | counts a revision whose metadata entry is present as `corrupt`, which its callers refuse as terminal `namespace-corrupt` with `historicalMetadataFailure`           | `readHistorySnapshots` (`history-snapshots.ts:38`), `changeNamespaceFacts` (`changes-graph.ts:82`), the sync label walk (`sync-label.ts:78`), and `retiredHistoryHome` (§ 1.3) |
| `stateMetadata` (`history-snapshots.ts:87`)                   | terminal, `historicalMetadataFailure`                                                                                                                               | `historicalState` (`:64-65`)                                                                                                                                                   |
| `changeWindowReferences` (`changes-records.ts:41`)            | terminal, `historicalMetadataFailure`                                                                                                                               | `changes`                                                                                                                                                                      |
| `lineageEndOwners` (`changes-ends.ts:158`)                    | terminal, `historicalMetadataFailure`                                                                                                                               | `changes`                                                                                                                                                                      |
| `versionAt` (`sync-label.ts:91`)                              | `RefSyncLabelError` with the historical remedy (`sync-label.ts:26`)                                                                                                 | pull merges                                                                                                                                                                    |
| `sync-history.ts:39`                                          | `corruptRef(ref)`, a forward repair                                                                                                                                 | pull's history merge                                                                                                                                                           |
| `metadataAt`, through `sideMetadata` (`sync-tree.ts:149,170`) | `corruptRef(ref, !entries)`, a forward repair when the tree is present                                                                                              | `groupSides` (`:109-110`)                                                                                                                                                      |
| `withdrawRecordMetadata` (`sync-withdraw-records.ts:57`)      | `RefSyncLabelError` with the historical remedy, from `corruptRef(ref, false, true)` (`:58`)                                                                         | withdrawal: `entryDocument`, `sameWithdrawRecord`, and `selectedWithdrawFormat`, each passing its side (§ 1.1)                                                                 |
| `sync-withdraw-inverse.ts:154`                                | `RefSyncLabelError` with the historical remedy                                                                                                                      | withdrawal                                                                                                                                                                     |
| `sync-withdraw-inverse.ts:166`                                | a raw `Error`, which rejects the pull                                                                                                                               | withdrawal                                                                                                                                                                     |
| `sync-withdraw-lineage.ts:25`                                 | a raw `Error`, which rejects the pull                                                                                                                               | withdrawal                                                                                                                                                                     |
| `registryMetadata` (`sync-withdraw-preserved-lineage.ts:51`)  | `UnavailableWithdrawJournal`, held by `heldWithdrawal` (§ 1.3)                                                                                                      | withdrawal                                                                                                                                                                     |
| `viewRefMetadata` (`view-state.ts:98`)                        | `corruptRef(ref, !entries, saved)` from its callers (`write-views.ts:88,188`), a forward repair when the tree is present, or the historical remedy on a saved state | `write-views.ts:85`, `missingViewMetadata` (`write-views.ts:151,184-188`), and `cohort-coordinates.ts:26`                                                                      |
| `capturedGroupMetadata` (`write-build.ts:275`)                | a forward-repair refusal                                                                                                                                            | writes (`write-build.ts:257-262`)                                                                                                                                              |
| `capturedMetadata` (`read.ts:262`)                            | a forward-repair listing diagnostic, or the historical remedy on a saved state (`read.ts:271`)                                                                      | `list` (`read.ts:259-271`)                                                                                                                                                     |
| `lookup-trees.ts:71`                                          | `corruptRef(ref, false, saved)`                                                                                                                                     | `lookup`                                                                                                                                                                       |
| `namespace-health.ts:24`                                      | `corruptRef(ref, false, saved)`                                                                                                                                     | tip checks                                                                                                                                                                     |
| `write-archive.ts:149`                                        | `record-malformed`, `rule: "store.archive-controls"`, from `archiveOutputControlRefusal` (`archive-refresh.ts:79-89`)                                               | archive writes                                                                                                                                                                 |
| `decodeArchiveFolder` (`archive-read.ts:90`)                  | the `unreadable` diagnostic with `unparsedMetadata` (`:102-103`)                                                                                                    | every archived-folder capture, below                                                                                                                                           |

**Filters candidate ends — `readItemEndCandidates` (`sync-lifecycle-log.ts:49`).** It reads the metadata of every
commit in the item's history (`:30-43`). Under `kind: "all"` it keeps a commit as an end only when that metadata parses
and names the commit's batch; under `"retirement"` it consults no metadata and keeps only empty-tree ends. So today a
missing or undecodable blob drops its commit. When that commit is the folder's end, `currentEndCandidates`
(`sync-withdraw-sibling-ends.ts:72-79`) finds no candidate, then takes the published-folder exemption (`:78`) or holds
the ref saying the end cannot be witnessed (`:79`).

Under `kind: "all"` alone, it takes § 1.2's metadata read and also returns the commits whose blob is missing or
undecodable, or whose non-empty tree has no metadata entry, each with its batch, as facts with no policy.
`currentEndCandidates` holds the ref only when one of them carries the folder's end batch, and before `:78`: that commit
is the end in local history, which `:78`'s exemption for another machine's end rules out. A missing blob holds as
**Missing** with the restore remedy, and an undecodable one as **Unparseable** with the historical remedy (§ 1.1). A
fault at any other batch is no end, as today, and `unavailable` keeps only missing trees, so `:73` is unchanged. A
commit of the folder's end batch whose non-empty tree has no metadata entry holds the same way, as **No metadata** with
the historical remedy. At any other batch, such a commit is still no end.

Every reader that passes `"retirement"` sees no change, among them `observeOwnerEnds`
(`sync-terminal-ended-twice.ts:47-48`) and `currentEndCandidates`' folder-less arm (`:72`). `readItemEndBatches`
(`sync-lifecycle-log.ts:15-17`) discards the new sets, so `resolvePendingRefEnds` (`sync-lifecycle.ts:65`), the other
`kind: "all"` reader, is unchanged.

**Tolerates both — keeps `parseRefMetadata`:** `sync-ended-conflicts.ts:21`, the foreign-metadata probe (`read.ts:265`),
the scoped point read that falls back to the full tree (`view-state.ts:55`), `sync-withdraw-records.ts:34`,
`history-paths.ts:12`, `push-families.ts:61`, `sync-withdraw-targets.ts:32,33,50`, and `sync-tree.ts:149`'s
control-source read (`:111`).

**Diagnostics that carry a fault.** A capture diagnostic carries its § 1.1 fault beside its condition and remedy. The
fault stays internal: `ListingDiagnosticSchema` is unchanged, and a listing still shows **Missing** and
**Unparseable** as `unreadable`, each with its own remedy. Every site that turns a diagnostic into a refusal or notice
takes that fault's row through the helper. At `90b6de349` the search finds these among them:

- `readArchivedRecord` (`read.ts:326-328`);
- `readArchivedFolder` (`read.ts:350-353`), whose `unreadable` record diagnostic only a missing blob raises
  (`read.ts:244,249`), already the **Missing** row;
- `archivedViewRead` (`write-views.ts:246-248`);
- `resolveArchivedReferences` (`archive-resolution.ts:30-32`);
- `checkArchiveTip` (`sync-tip.ts:25-28`);
- `incomingArchiveNotices` (`sync-corrupt.ts:119-123`);
- `appendArchivedLookupTrees` (`lookup-trees.ts:90-93`);
- `collectArchivedParents` (`cohort-coordinates.ts:63-65`);
- the archived owners of a change window (`changes-ends.ts:127-129`);
- the archive merge's folder capture (`sync-archive.ts:31-33`);
- the history merge's quarter read (`readSyncHistoryQuarters`, `sync-history.ts:84-86`), through
  `firstOwnedArchiveDiagnostic`;
- the sibling capture's rethrow (`sync-withdraw-sibling-ends.ts:52`), through `heldWithdrawal` (§ 1.3).

So a missing folder metadata blob refuses as recoverable `state-unresolvable` on a point read or write, and a pull holds
its ref with the restore remedy. A Misplaced diagnostic keeps terminal `namespace-corrupt` with its placement remedy,
and an Unparseable or No metadata one keeps today's terminal refusal. Its remedy is the historical one on a saved
capture (`archive-read.ts:102`) or a history commit (§ 1.1), such as the archive merge's base, and the forward repair
otherwise. A diagnostic with no § 1.1 fault keeps its own condition and remedy, the saved one at the archive merge's
base (§ 1.1), and its converters keep today's terminal refusal: ambiguous owner metadata, a `key-mismatch`, an entry
outside an owner folder, or a malformed owner UID (`archive-read.ts:114-149`).

### 2. Listing scope

Today a live listing applies a different scope and absence rule than an as-of listing and the in-repo backend:

- Live listings select every ref in the family and every archive ref, whatever `input.owner` is (`read.ts:161-162`),
  and `decodeCapturedRef` (`:216-236`) passes every diagnostic through.
- As-of listings narrow by owner (`snapshot-read.ts:77,79`), and the in-repo listing skips other owners
  (`in-repo/list.ts:50`).
- An owner-only listing that finds nothing returns an empty `complete` here (`readableRefListing`, `read.ts:199-203`)
  and `absent` in-repo.

Since `acquireLifecycleRecords` (`lib/work-unit/prepared-lifecycle-write.ts:12-23`) refuses on any diagnostic, one
unreadable unrelated work ref blocks every lifecycle write through it. Live listings take the as-of path's owner
scope for records and diagnostics alike, and the absence rule of the in-repo tracked and personal listings
(`in-repo/list.ts:92`, `in-repo/personal.ts:81`): no records and no diagnostics is `absent`, whether or not the listing
names a kind. The absence rule applies on the live path (`listBoundRecords`);
`readableRefListing` keeps its kind-scoped rule for as-of and write-check listings. The write-check views
(`write-views.ts:96-118`) and as-of archived diagnostics (`archive-view.ts:14`) take the same owner scope.

### 3. Pull-result consumption

`consumePull` (`lib/store/pull-consumption.ts:15`) proceeds on a top-level `designation-needed` without rendering it.
`pullHistoryForRetry` (`:48-54`) reads only `pulls`, never `states`, so after a designation-needed pull a retry fails
with a bare `state-unresolvable`. The design:

- `consumePull` renders a designation question (`pullDesignation`, `:30-34`) as a notice for every consumer, with its
  remedy and command.
- The retry paths, `pullHistoryForRetry` and `readStateHistory`, stop on a designation question with its remedy, as
  `readStateHistory` already does. `pullHistoryForRetry` keeps its boolean result: on a designation question it writes
  the question and its remedy as a notice and returns false, so its caller returns the refusal it holds.
- Every pull consumer outside the store's sync internals moves onto `consumePull` with `pullDesignation`, through
  `pullSelectedStore` (`operational-sync-bindings.ts:12-17`). The consumers not on the helper today:
    - `rename-store.ts:41` and `conflict-command.ts:52`, through `pullHistoryForRetry`;
    - `store-user-pull.ts:59`;
    - `pullStoreStatus` (`handlers/status/store-locus.ts:22-29`).
- Sites that derive their own pull policy move onto the helper too: `import/finish.ts:31-39`, and archive's
  publication hold (`archivePublicationHold`, `lib/work-unit/verbs/archive-store.ts:144-150`).
- The helper's own callers that omit `pullDesignation` read local state past an unasked question:
  `errand/store-runtime.ts:73`, `errand/promote-store-runtime.ts:22`, and `handlers/errand-entry-storage.ts:26`. They
  receive the rendered notice from `consumePull`.

### 4. Transport failures

Transport failures escape as raw exceptions. `checkedPushTarget` (`push.ts:220-226`) calls `refPushTarget`
(`fetch-target.ts:42-48`), and `refFetchTarget` (`fetch-target.ts:10-17`) throws through `fetch.ts:60` and
`pull.ts:33-43,118-121`, discarding the per-remote outcomes and notices already gathered. `captureComparisonWitness`
(`comparison-witness.ts:21-30`) lets `EffectiveTransportError` escape where finalization (`:40-44`) maps it. So
follow's resume (`follow.ts:86`) and cleanup (`follow-delete.ts:24,78`) throw instead of returning `move-unfinished`.
`push.ts:194` and `follow-candidates.ts:38` are unmapped too.

Each becomes a per-remote failed outcome with failure `refused` and the remote-URL repair remedy, or, where no
per-remote outcome exists, a typed refusal. Typing happens at these call sites. The lookup functions beneath them
(`repositoryConfig`, `configOutput`, `readRemoteTransports`, `readNamedTransport`, `resolveLiteral`,
`refFetchNeedsCompleteness`) keep throwing on failure, so a caching wrapper over them caches no failure value. The
follow sites stay in scope although only moves between remotes reach them: typing failures in
`captureComparisonWitness`, which push admission needs, changes what they receive.

### 5. Ref transactions under the sync deadline

`bindDeadline` (`sync-deadline.ts:46-62`) puts the deadline's signal on every Git call. When the deadline fires,
`bindGitProcessCancellation` (`lib/git/process-cancellation.ts`) ends the process tree with `SIGKILL` on POSIX and
`taskkill /T /F` on Windows. A transaction killed after `prepare` leaves its Git ref lock behind, and every later
transaction that needs that lock fails until someone removes the file by hand.

Only the keeper and tracking transactions refuse `lock-held` today: `rethrowRefFetchKeeperLock`
(`fetch-keeper-lock.ts:17-31`) and `RefPushTrackingLockError` (`push-tracking.ts:13-18`). Several transactions throw
a raw `GitProcessError` instead, because `updateRefTransaction` rethrows and `refBatchFailure` (`write.ts:73-79`)
rethrows anything but an advisory-lock wait. They are writes, merges, withdrawals, the import's landing, and the
version token. The version token is the transaction that every live `list` and every `version` runs to save the
captured manifest (`saveCapturedManifest`, `manifest.ts`).

#### 5.1 A launched transaction finishes

- `GitExecOptions` (`lib/git/exec.ts:22`) gains `uninterruptible?: true`, and `GitExecInput`'s options admit it. It
  tells a deadline-bound wrapper that it may refuse to launch the call but must not cancel it once launched.
- `bindDeadline` honors it on `execInput`. If the deadline has expired at launch, the call refuses with the
  deadline's cancellation, as any other call does. Otherwise it calls the given port without the deadline's signal.
  A signal the caller supplied itself still applies.
- `updateRefTransaction` sets the option on its `update-ref --stdin` call alone. Its read-back
  (`readTransactionTips`) and version probe keep the signal.
- No check follows the call. A transaction that commits after the deadline stays committed and reports its result.
  The deadline stops the operation at its next Git process or lock, or at an existing check between attempts
  (`refSyncDeadlineExpired`, `push.ts:70`).
- Git's own lock wait bounds the transaction: five seconds per lock from `gitRefLockArgs`
  (`ref-transaction.ts:30-32`), and `core.packedRefsTimeout` for `packed-refs`.
- The call still goes through the bound context's ports.

#### 5.2 A held Git ref lock is classified at every transaction

One store-level wrapper around `updateRefTransaction` serves every transaction in `lib/store/ref/`. When a
transaction fails with every ref still at its expected value, the wrapper `lstat`s each candidate lock file in the
bound repository, through `context.fs`. The repository is `context.repository.gitDir ?? commonDir`: in the default
layout `gitDir` is null and shared refs lock in the common directory. The candidates are each ref's `<ref>.lock`,
`packed-refs.lock`, and `reftable/tables.list.lock`.

- **A lock found** throws one typed lock error carrying its path and its age, read from `mtimeMs`.
  `StoreFileAccess.lstat` (`lib/store/ports.ts:37`) adds `mtimeMs` to its result type. The default port passes
  Node's `fs.lstat` result through already, so only test fakes gain the field.
- **No lock found:** the failure rethrows as today.
- `rethrowRefFetchKeeperLock` becomes this classification. It also gains the `packed-refs.lock` case it lacks today
  (`:20`).
- `RefPushTrackingLockError` keeps the receiver's accepted refs and takes the wrapper's lock.

These sites map the new error to `lock-held`. The first three already map an advisory-lock wait; `list` and `version`
map none today and gain the mapping:

- `refBatchFailure`, for writes;
- `pullRefStore` and `pushRefStore`, for merges, withdrawals, keepers, and tracking;
- `withMigrationLock` (`commands.ts:195`), for the import;
- `listBoundRecords` (`read.ts`), for `list`;
- `refReadOperations` (`backend.ts`), for `version`, which wraps `refStateVersion`'s bare result.

`list` and `version` both save the version token, and the token keeps the manifest that `asOf` reads depend on, so a
lock on it refuses rather than passing silently. A site that already turns a failed transaction into its own result
keeps that result's shape and takes the lock's condition and remedy: `clearProjectCheck`
(`designation-project.ts`) still reports one remote's failed outcome. The wrapper changes an outcome only where
today's raw error escapes.

#### 5.3 What a Git ref lock refusal says

A `lock-held` refusal for a Git ref lock names the lock file and its age, and the store never removes the file.

- **Stale.** A lock older than `REF_SYNC_DEADLINE_MS` is almost certainly stale. Its remedy says to remove the file
  once no Git process is running in that repository.
- **Held.** A younger lock is probably held by another Git process. Its remedy says to retry first.

This matches the pull notice `tracking-update-failed` (`fetch-check.ts:43-45`), which fetch raises when Git could not
update a tracking ref whose history does not diverge. Its remedy already says to pull again, then stop the holder or
remove its stale lock. The notice gains the same evidence: `rejectedFetchNotice` (`fetch-check.ts:35-47`) `lstat`s the
tracking ref's candidate lock files as § 5.2's wrapper does, and names the lock it finds with its age and § 5.3's stale
or held remedy. Neither surface can tell a stale lock from a held one, and only removal clears a stale one.

#### 5.4 The Windows bursts

The Windows separate-layout publishing burst in `__tests__/integration/store-ref-bursts.test.ts` runs unskipped. A
deadline can still kill a fetch while it updates its own tracking refs, in either layout (§ 5.5). A hosted Windows run
failed the default-layout burst that way: one writer raised 13 `tracking-update-failed` notices, then its push ended
`unreachable` at the deadline, with its lock state uncaptured. So on Windows both layouts' publishing bursts check the
recovery as well. A clone whose publication refuses on a stranded lock passes when, after every writer has exited,
removing the lock its refusal names and pushing again converges it. Every other clone converges directly. That
recovery cannot tell a § 5.1 failure from the residual: a transaction killed after launch also strands a lock its next
refusal names, in the separate layout the same `tables.list.lock`, and removing it converges the clone. So § 5.1's own
deadline-kill case runs on Windows too (SC 8).

#### 5.5 Residuals

The store does not disable Git hooks, so a hung `reference-transaction` hook can hold an uninterruptible transaction
past the deadline. A fetch must stay abortable, so a deadline that kills a fetch while it updates its own tracking
refs can still leave a lock behind. The next transaction that needs that lock reports it with § 5.3's remedy,
wherever § 5.2 maps the lock error. The next fetch reports it as `tracking-update-failed`, naming the lock (§ 5.3), and
a push excludes the ref rather than retrying it to the deadline (§ 9).

### 6. The keeper lease across a fetch

`withRefFetchKeepers` (`fetch-seen.ts:23-25`) takes the keeper lease, waiting up to `REF_SYNC_DEADLINE_MS`.
`fetchRefPatterns` (`fetch.ts`) holds it across the basis capture, the network fetch, and the keeper release. Every
checkout of a clone shares one remote's keepers. A pull releases those whose tracking ref survived its fetch, so a
sibling's basis, fetch, and release must not interleave with it.

The lease also serializes:

- backing remote repoints (`repointBackingRemote`, `configureBackingRemote`, `backing-configuration.ts`), called under
  it from `remote-backing.ts`, `source-switch.ts`, `migrate-remote-switch.ts`, and `migrate-switch-undo.ts`;
- source switches and their undo (`source-switch.ts`, `migrate-remote-switch.ts`, `migrate-switch-undo.ts`);
- the release of ended keepers (`releaseCapturedKeepers`, `fetch-seen-ended.ts`);
- push admission's comparison witness (`captureComparisonWitness`, `withComparisonWitness`, `comparison-witness.ts`).

#### 6.1 The span rule

The store's lock rules gain one exception. The move lock spans a network call, and the keeper lease is the one other
lock that does: it is held across that remote's fetch, bounded by the sync deadline. A sibling that outwaits its own
remaining deadline ends with `RefSyncDeadlineError` and `refSyncDeadlineRemedy`'s retry remedy. The storage contract's
concurrency rules govern how stored surfaces take concurrent writes, not lock spans, so they do not change.

#### 6.2 No wait for the lease under the layout lock

Push admission and push tracking take the comparison scope (`withComparisonScope`, `comparison-witness.ts:51-58`).
Today it takes the layout lock and then waits for the lease up to the sync deadline. With the lease held across a
fetch, a push overlapping another checkout's pull on the same remote would hold the layout lock for that fetch. Every
write and pull merge waits 10 seconds for the layout lock (`commitRefStep`, `DEFAULT_MAX_WAIT_MS`), so each would
refuse `lock-held`. The design:

1. Under the layout lock, the comparison scope takes the lease with a zero wait, which means exactly one attempt.
2. If another holds the lease, the scope releases the layout lock, waits for the lease alone, releases it, and tries
   again from step 1.
3. The operation itself always runs under both locks, so a transport or designation lookup still reads fresh under
   the lease that guards its writers.
4. **Bound.** The retry is bounded by the remaining sync deadline, whose expiry ends a push with its existing timeout
   refusal. A caller with no sync deadline is bounded by `REF_SYNC_DEADLINE_MS` from its first attempt, the total that
   one lease wait allows today. Follow's comparison scopes (`follow-delete.ts`, `follow-candidates.ts`) are such
   callers. Their expiry throws the lease's `AdvisoryLockTimeoutError`, which `withMigrationLock` maps to `lock-held`.

#### 6.3 A zero wait means one attempt

- **First attempt before the deadline test.** `acquireAdvisoryLock` (`lib/advisory-lock.ts:193-223`) tests its
  deadline before its first attempt, so a zero wait never acquires. It changes to attempt once first. No lock request
  asks for a zero wait today: the store's `withRefLocks` callers pass `REF_SYNC_DEADLINE_MS` or the default, its direct
  `context.lock` calls pass none, and the waits outside the store are positive or unbounded.
- **Expiry refuses before the port.** Today `bindDeadline` passes a zero wait to the port only once its deadline has
  expired. It changes to refuse there before calling the port, whatever wait was asked, with `RefSyncDeadlineError`
  naming the lock's ref. Only the port knows the lock's file. Every existing request keeps today's result at expiry,
  its condition naming the ref rather than the file.
- **Release keeps the default wait.** `createRefLockFactory` gives a release its acquisition's wait today. A single
  try at a busy `.break` lock would throw a release-phase timeout that push does not map, so a lock taken with a zero
  wait releases under `DEFAULT_MAX_WAIT_MS`.

### 7. A lost history-destination compare-and-swap retries

A batch write reads the current tips, checks that each history destination is an ancestor of its live tip, builds the
commits, and publishes them in one ref transaction. A lost transaction retries from the tip read.
`publishRefBatchChanges` (`write-publication.ts:9-17`) handles one exception differently. A history destination found
off its expected value is refused as terminal `namespace-corrupt` through `historyDestinationFailure`
(`write-history.ts:27-30`), with a repair remedy. Every ARC writer of a history ref holds that ref's lock or the layout
lock, and the write holds both. So only a writer outside the lock protocol reaches this point:

- a hand-run `update-ref`;
- a fetch or push into `refs/arc/history/*`;
- an advisory lock wrongly judged abandoned.

The design:

- **Retry like any other lost ref.** A lost history destination retries from the tip read, like any other lost ref.
  The ancestry check (`checkRefHistoryDestinations`, `write-build.ts:79`) still refuses a destination that is not an
  ancestor, with its repair remedy.
- **A bound on consecutive history losses.** The retry loop in `commitLockedRefBatch` (`write.ts:145-153`) has no
  bound today, and ordinary contention drives it too: a changed admission basis (`refAdmissionBasisChanged`,
  `write-admission.ts:8-13`) and any other lost ref return `"retry"`. So the bound counts only consecutive attempts
  that lose a history destination. An attempt loses one when a history destination it writes has moved off its
  expected value since the attempt read its tips. Either the admission check finds the move, since it compares history
  refs too and runs first (`write-build.ts:86`), or the transaction does; the admission check reports which refs
  changed so the attempt can tell. The third consecutive such attempt refuses with `historyDestinationFailure`. An
  attempt that loses no history destination resets the count and retries as today.
- **The count survives a re-resolution.** When a history destination appears or disappears between attempts,
  `commitLockedRefBatch` returns `null` (`ownerLocationsChanged`, `write.ts:149,156-161`), and `executeRefBatch`
  resolves the batch again (`write.ts:117-124`). That change counts as a loss of a history destination, and the count
  carries across the re-resolution, so a writer that deletes and recreates a destination meets the same bound.
- **Why three.** Three matches the store's other bounded retries of a lost race (`PERSONAL_WRITE_ATTEMPTS`,
  `lib/store/personal-mutation.ts`; `TORN_LISTING_ATTEMPTS`, `lib/git/ref-listing.ts`). One outside writer that moves a
  destination forward once is absorbed. A writer that moves it on every attempt is a fault to repair.
- **The test.** `__tests__/integration/store-ref-history-destination.test.ts` pins the terminal refusal with an
  ancestor racer. It is rewritten for the retry, and gains a case that exhausts the bound.

### 8. Other lock defects

- **`packed-refs.lock` in the keeper path.** `rethrowRefFetchKeeperLock` observes only `reftable/tables.list.lock` and
  `<ref>.lock` (`fetch-keeper-lock.ts:20`). A files-format deletion lock therefore escapes pull and push tracking as a
  raw exception. § 5.2's wrapper covers it, and a files-format case pins it.
- **Registry anchor lock prediction.** `registryAnchorLockRefs` and `mayEnd` (`write-manifest.ts:20-28`) cover removes
  and completed puts. `planRefRetirements` (`write-retirement.ts:29-55`, called at `write-build.ts:76`) also retires
  a targeted live work ref when the registry holds its owner's lineage transition record and the batch leaves it no
  primary. Another owner's resolves can start that retirement alone. `write.ts:141` takes only the predicted locks,
  and `retirementLockRefs` (`write-retirement.ts:21-23`) adds history refs, not the registry. Compare-and-swap still
  protects the registry, so the cost is a broken lock invariant and retries, not lost data.
    - `registryAnchorLockRefs` predicts this retirement. It takes the registry lock when a targeted live work ref's
      owner has a lineage transition record in the registry tree at the batch's resolved tips, or the batch creates
      one.
    - It reads that tree only when some target is a live work ref, through `readRefTrees`, whose write evidence
      `planRefRetirements` then reuses.
    - A lineage record that appears after the prediction still meets the registry's compare-and-swap and retries, as
      today.
    - Writes to work items with no lineage record take no registry lock.

### 9. Sync, push, and withdrawal

- **Withdrawal journal metadata.** Non-JSON metadata on a withdrawal journal ref escapes as an untyped exception that
  rejects pull and push. `inverseMetadata` (`sync-withdraw-inverse.ts:74-86`) calls `JSON.parse` directly, and
  `commitWithdrawEnd` (`sync-withdraw-commit.ts:28-62`) catches only `UnavailableWithdrawJournal` and
  `RefSyncLabelError`. It parses through § 1.2's metadata read, and holds the ref with a `namespace-corrupt` notice
  carrying the **Unparseable** or **Missing** row. Of its five inputs (`sync-withdraw-inverse.ts:126`), an
  **Unparseable** one takes the historical remedy in the journal's `before` and `after` snapshots and the common
  ancestor, and the forward repair in the current and published sides (§ 1.1).
- **Withdrawal conflict placements.** `conflictValue` (`sync-withdraw-entries.ts:84-95`) passes a fresh live listing,
  `readSyncRefs(context, "refs/arc/")`, at `:92` to `completeSyncPlacements`. That function's other callers
  (`sync-tree.ts:75-76`, `sync-label.ts:58`) pass tip sets their operation captured. The withdrawal passes the tip sets
  it captured, threaded from `inverseEntryDocument` (`:34`) through `mergeDocumentStage` to `conflictValue`, and
  reads no fresh listing there.
- **A stranded tracking lock in the push loop.** `publishRefAttempt` (`push.ts:106-108`) refuses on
  `history-diverged` and seeds exclusion from `namespace-corrupt` and `end-pending`, but ignores
  `tracking-update-failed`. With a stranded tracking lock, the push's lease holds the stale tracking tip and loses on
  every attempt. The loop retries it as a lost race until the deadline, then reports `unreachable` with cause `timeout`
  and a retry remedy that cannot clear the lock (`push.ts:70-84`). `excludeBrokenPushRefs` (`push-exclusion.ts:21`)
  seeds exclusion from `tracking-update-failed` as well, so the push publishes the rest and reports the excluded ref's
  `refused` failure with the notice's condition and remedy.
- **A lock-failed tracking row read by Git's marking.** Once the push excludes on `tracking-update-failed`, a
  spurious notice refuses a ref that could publish. `markUncommittedUpdates` checks a failed fetch's rows against the
  tracking refs only when Git printed them as applied (`fetch-check.ts:55`), and Git's marking of a lock-failed row
  varies. Probed: it prints `!` at 2.50.0 in both ref formats and at 2.55.0 in the files format. It prints the row as
  applied at 2.51.0 to 2.53.0 in both formats and at 2.55.0 in reftable. So where Git prints `!`, a ref a sibling's
  fetch already advanced past the fetched tip still raises the notice. `markUncommittedUpdates` also checks a `!` row
  when its tracking ref has moved off the row's old value. A tracking ref that holds the fetched tip, itself or a
  descendant, makes the row applied, as `trackingContainsFetchedTip` (`:63-70`) already does for an applied row. A
  rejected rewrite leaves the tracking ref at its old value, so it keeps its refusal. That includes the ancestry
  suite's rewrite to an ancestor (`store-ref-ancestry.test.ts:39`), whose unchanged tracking tip contains the fetched
  one.
- **One rejected ref holding back the rest.** Git 2.51.0 to 2.52.0 leave every other ref of a fetch un-updated when
  one is rejected as non-fast-forward, in both ref formats; 2.50.0 and 2.53.0 update them. Each such ref would raise
  `tracking-update-failed` and be excluded. The exclusion therefore expects Git 2.53.0 or later (§ 13).
- **Seedless pending ends.** A pending end that the pull withholds without an end-pending seed makes push emit a
  schema-invalid failed publish with an empty condition and remedy. `excludeBrokenPushRefs` (`push-exclusion.ts:19-47`)
  seeds exclusion from `listing.pending`, and builds refusals from notices and tip checks, never for a ref that seed
  alone excludes. A seedless end arises at `sync-pull-lifecycle.ts:76`, and through `uniqueNotices`
  (`pull.ts:203-207`), which drops `end-pending` beside `history-diverged` or `tracking-update-failed`. Exclusion
  builds a refusal for every excluded ref.
- **Quarter provenance on a restore.** `quarterCommitReference` (`quarter-provenance.ts:10-28`) throws an internal
  error at `:26` when `folderHoldsRecord` (`:30-35`) matches neither snapshot. This happens when a reopen or quarter
  move restores a removed completed primary in a single-put batch, reachable from `write-reopen.ts:67`,
  `write-completed.ts:160`, and `write-archive.ts:122`. It attributes the quarter change to the restoring mutation.
  This is traced, not yet run, so its test reproduces it first.

### 10. Decomposition names a verbatim companion by its stored name

`copyCoordinates` (`lib/decompose/scaffold-copy.ts:47-48`) derives a verbatim companion's name with
`companionArtifactName`. The store places the record by `companionStoredName` (`lib/store/companion-name.ts:11-13`).
The record lands correctly, but the member meta's Design entry (`member-scaffold.ts:64,72-74`) and the decompose
report name a record that resolves to nothing. Both use `companionStoredName`. Only `arc decompose` under the ref
backend reaches it.

### 11. The import

The import runs once, at the cutover, over this repository's real history, so a defect there lands in that history.
`arc store migrate --import [--trial]` reaches `importTrackedState` (`import/entry.ts:21`) through `runRefMigrate`
(`commands.ts:29-32`). Its stages:

1. **Destination check** (`inspectImportDestination`).
2. **Transform**, `readImportSource` through `qualifyImportCodeLinks`, which blocks on any refusal or notice
   (`entry.ts:38`). A record that fails its kind's parser refuses the whole import (`reportImportAdmission`). Review
   candidates, integration boundaries, and task lists import verbatim. A Candidate whose supersession chain is broken
   still imports verbatim as evidence: `inspectCandidateChain` (`import/review.ts:9-21`) reports it in `brokenChains`,
   which the blocking check does not read. Derived task captures are skipped with a notice that never blocks. § 11.2's
   personal-link and unreadable-annotated-commit notices never block either: like the skipped-capture notices, they join
   the report after the blocking check.
3. **Landing** (`landImport`, `entry.ts:54`).
4. **Publication with transient cleanup** (`publishImport`, `finish.ts:11`).

A trial runs the transform and builds the import commits (`buildImportCommits`). It writes its private gathering refs,
then deletes them under the layout lock (`landImportRefs`, `import/land.ts:10-33`). It never lands the state refs,
keeps transients, publishes, or cleans up transient sources (`landImport`, `entry.ts:54-64`).

#### 11.1 The import review

One standard review pass and a fix check, scheduled as an early phase so its findings size the rest of the plan:

- **Scope.** Two parts:
    - the stages that write history and cannot be undone: landing (`landImport`, `buildImportCommits`,
      `landImportRefs`) and publication with transient cleanup (`publishImport`, `retireImportLocals`,
      `retireImportRemote`, `retireOriginRefs`, `dropKeptTips`);
    - the transform's admission rules: what refuses, what imports verbatim, and what is skipped with a notice.
- **Evidence.** A `--trial` import of this repository's real state, run in a disposable copy that carries every ref
  of this repository (state refs, `refs/notes/arc/user/*`, `refs/arc/user/*`, and local branches) and reads the
  personal directory of every registered checkout. A file copy of the primary checkout with its Git directory does
  both: it reads the linked worktrees in place and writes only its own refs. A plain clone carries none of these, so
  its trial never reaches the personal or transient stages. The destination landing, publication, and transient
  cleanup, which a trial never runs, are reviewed from source.
- **Stop rule.** Every finding that an import of this repository's state can reach is fixed. A finding it cannot
  reach is recorded in § Non-Goals by amendment, without a fix, since the import serves this repository alone. No
  import finding is deferred to later work.

The rehearsal on real state remains the gate. A full pass over all 33 modules (2,216 lines under
`lib/store/ref/import/`) was not taken, since the transform's read-only modules surface their faults in a trial run.

#### 11.2 Known import defects

- **A body-less execute-bound capture.** An execute-bound mark that is its capture's last line stays in the imported
  inbox while the capture is also queued. The pattern at `import/pending-entries.ts:33` requires a newline after the
  mark, and `splitEntryList` (`lib/store/concurrency/entries.ts:36-37`) moves trailing newlines into the separator. The
  pattern accepts a mark at the end of its entry, and a body-less capture case pins it.
- **Personal symlinks.** Personal symlinks are skipped silently, and a symlinked file that notes saving saves refuses
  with a remedy that cannot clear it. `walk` (`import/personal-disk.ts:68-69`) skips a link with no notice, while
  `readUserDir` (`lib/io-context.ts:601-623`) follows it. So `comparePersonalFile` (`import/personal.ts:51-64`) blocks
  on a `snapshot-only` file with an `arc user load` remedy. That remedy replaces a directly linked file with a regular
  one, and cannot clear a file reached through a linked directory. A linked file never saved is dropped with no
  notice. Where the notes snapshot holds a path through a link, the import follows that link to its target, as notes
  saving does, so the disk and notes copies compare as for any other file. It skips every other link, and every link
  whose target cannot be read, so a linked tree that notes never saved, such as another checkout's `node_modules`, is
  never imported. It reports each link it follows or skips with a notice that does not block (§ 11).
- **Unreadable annotated commits.** Compacted-note ordering refuses a whole identity when any retained note's
  annotated commit is unreadable. `committedAt` (`import/personal-notes.ts:57-61`) throws inside the sort at `:27-29`,
  and `personal.ts:24` turns that into a blocking notice that drops the person's records. Unreadable commits sort last,
  by object ID, with a notice that does not block (§ 11).
- **A lost transient-source delete lease.** A lost default-layout transient-source delete lease is reported as a
  change to the import's private gathering refs. `landImportRefs` (`import/land.ts:20-33`) returns false alike for a
  layout mismatch, present state refs, and a lost `importTransientDeletes` expectation. `landingRace`
  (`entry.ts:73-80`) reports all three as changed gathering refs. `landImportRefs` returns the failing ref, and a lost
  transient lease is reported as its own recoverable condition.
- **An orphaned publication journal.** A rebuild with no transient tips orphans the earlier attempt's import
  publication journal permanently. The journal is written only when tips exist (`entry.ts:61`). `retireImportLocals`
  and `retireImportRemote` (`transient-cleanup.ts:36,53-54`) return early with no kept tips, so `dropKeptTips`
  (`:94-102`), the journal's only deleter, never runs. A stale journal is dropped when no kept tips remain.
- **A flattened publisher refusal.** Source retirement flattens a refusal thrown inside publisher verification into an
  origin cleanup failure. `retireOriginRefs` (`transient-cleanup.ts:64-71`) carries a returned `{condition, remedy}`
  through, but catches a `MigrationRefusal` thrown by `fetchMigrationRemote` or `captureMoveRemote` and rewraps it. So
  `cleanupRefused` (`:131-134`) reports it as recoverable `move-unfinished` with the default remedy, losing a terminal
  class. It carries the thrown refusal's class, condition, and remedy.
- **A quadratic path check.** `checkRefBatchPaths` (`path-admission.ts:69-81`) runs `checkRefPathCollision` for each
  record against every record on the batch (`:51-58`), so its cost grows with the square of the batch. Measured over
  distinct personal documents, it takes 0.5 s at 500 records and 32.9 s at 4,000. The import reaches it before its
  blocking check (`import/build.ts:26`), and every batch write does too (`write.ts:56,138`). It groups the records by
  ref and runs `findRefNamespaceCollision` once per ref over that ref's paths. That pass is already linear
  (`findRefPathCollision`, `:22-39`). The grouping skips a repeat of one reference at one path, and the refusal names
  the colliding pair as today. A collision case pins the refusal. A case of 20,000 distinct personal paths, which the
  pairwise check cannot finish within the test's timeout, pins the cost.
- **A Git checkout inside personal state.** `walk` (`import/personal-disk.ts:64-74`) descends into every directory under
  `.arc/user/<identity>/`, so a Git checkout there imports as personal documents and refuses file by file. A trial of
  this repository's state took 17,793 records and 88 refusals from three registered worktrees then under one such
  directory; they have since moved out. The walk does not enter a directory that holds a `.git` entry, file or
  directory. The import reports it once, naming the path, with a notice that blocks, as its other personal-state faults
  do (`personal.ts:24`). The remedy is to move the checkout outside personal state (`git worktree move` for a registered
  worktree) or remove it.

### 12. Contracts any wrapper of the context's ports keeps

A layer may wrap a `RefBackendContext`'s ports, for instance to scope Git access to one operation. This design relies
on four properties of any such wrapper. Its tests pin each through `bindDeadline` over the default ports:

- **Locks go through the port.** Every lock and lease, the keeper lease among them, is taken through the context's
  `lock` port. A lease taken any other way escapes the wrapper's freshness bound.
- **Executor options pass through.** `execInput` passes every option the wrapper does not own to the underlying port,
  `uninterruptible` (§ 5.1) included. `bindDeadline` owns only `signal`.
- **`lstat` results pass through.** `fs.lstat`'s result reaches the caller whole, `mtimeMs` (§ 5.2) included.
- **Lock waits are never raised.** A wrapper passes `lock`'s `waitMs` through or lowers it, and passes zero as zero
  (§ 6.2–§ 6.3). `bindDeadline` lowers it to the deadline's remaining time. Dropped, the port's 10-second default would
  hold the layout lock while the scope waits for the lease.

Transport and designation lookups read fresh under whatever lease guards their writers (§ 6.2, step 3). Wrappers
call through the ports of the context they were given, as `bindDeadline` does.

### 13. Boundary

This change builds on the landed ref backend. It also expects ARC's Git floor to be 2.53.0 or later, refused up front
below it, by the cutover. Until then the ref backend is reached only through hidden `arc store` commands
(§ Cross-cutting Considerations). § 9 gives the reason. At `90b6de349` the floor reads 2.47 wherever it is set or
stated, among them `engines.git` (`packages/arc-framework/package.json:40`), its test
(`__tests__/unit/git/capability-contract.test.ts:13`), the version check (`lib/git/version-floor.ts:49-51`), both CI
floor jobs (`.github/workflows/ci.yml:981,1075`), the QUICK-REFERENCE template and its copy, and `CONTRIBUTING.md`. The
version check runs today only to explain a failure (`version-floor.ts:40-52`), so it refuses nothing up front. The raise
is made outside this change. The cutover of this repository's state waits on this change.

The boundary read keeps the change whole (`stays one WU`, Owner, 2026-10-30). The planning evidence crossed the size
mark that returns the boundary to the Owner: the nine defect groups forecast a task list near or over six phases. The
other marks are far off: about 1,900 changed lines are forecast before the import review's own findings, some 40% of
them source. The Owner's reason is that one review can hold the whole change set: two to three thousand lines in
independent groups, reviewed in chunks with code reachable from shipped commands first.

The alternative was a separate change for § 1–§ 4 that lands first. It was not taken. A cut before the flip runs by a
manual decomposition procedure with Owner direction at each workaround. Its benefit depends on later ref-backend work
waiting on § 1–§ 4 before this change can land whole, and none was ready to start (2026-10-30). Re-raise the cut at a
later planning boundary if work that builds on § 1–§ 4 becomes ready to start while this change's remaining work is
more than about a week out.

## Alternatives & Rationale

- **One classification against per-site fixes (§ 1).** Fixing each site's remedy text in place leaves the metadata
  read erasing the fact, so the next read written against it repeats the defect. The classification adds no
  refusal kind, schema, or recovery path. It composes the existing pieces (§ 1.4), and each row traces to a routed
  defect.
- **A tree read after a `missing` answer against a new primitive (§ 1.3).** The path-absent and blob-absent cases are
  indistinguishable from `cat-file`'s answer. `refRecordAbsence` already settles them by reading the tree, and does so
  only after a `missing` answer, so a present object costs nothing.
- **Detecting a missing local tip (§ 1.6).** Matching fetch's stderr would add a fourth place where Git's message
  text is read, beside a receiver without atomic pushes, a server's per-ref refusal line, and a remote failure's
  cause. Checking the tips before every fetch would cost processes on every pull. Checking state once after a rowless
  completed failure costs nothing on success. Checking only the negotiation patterns would miss every other ref the
  connectivity check walks.
- **Graceful abort of a ref transaction (§ 5).** Sending `SIGTERM`, or `abort` on the transaction's stdin, needs
  catchable termination. Node has none for a Windows child, where cancellation is `taskkill /F`, and the stranded-lock
  failure was observed on Windows. Not taken.
- **Reclaiming a lock the canceled call held (§ 5).** This is unsafe while cancellation can report descendants
  unconfirmed. Under Git for Windows' launcher the lock holder is a descendant. Not taken.
- **Removing a stale Git lock automatically (§ 5.3).** The store cannot tell a stale lock from one a live Git process
  holds. Removing a held lock would let two writers commit one ref. Not taken.
- **Closing the fetch's tracking-update residual (§ 5.5).** A fetch could write no tracking refs, landing its objects
  under a namespace of its own invocation, and apply the tracking updates, pruning, and fast-forward checks in one
  transaction the deadline cannot cancel (§ 5.1). That moves Git's fetch semantics into the store, across the tracking
  check (`fetch-check.ts`), the keeper basis (`fetch-seen.ts`), the completeness refetch, and § 1.6's missing-tip
  check. The residual already ends in a named lock with a removal remedy (§ 5.3). Not taken.
- **Per-operation keepers (§ 6).** These would let no lease span the fetch, but they would ripple through every
  operation the lease serializes. A new lease would also be needed to bound transport reads against backing repoints.
  Not taken.
- **Taking the lease before the layout lock (§ 6.2).** The source switches take the layout lock and then the lease,
  so reversing the order risks a deadlock between them. Not taken.
- **A bounded lease wait under the layout lock (§ 6.2).** This still holds the layout lock for its bound, racing
  writers' own 10-second wait. Not taken.
- **A try-acquire option on the lock port (§ 6.3).** This widens a port that wrappers must forward. Making a zero wait
  mean one attempt changes no port contract. Not taken.
- **Keeping the history-destination refusal terminal (§ 7).** The write algorithm retries every other lost ref from
  the tip read, and its ancestry check already refuses a destination that is truly wrong. A terminal refusal on the
  first loss reports an outside writer's one-time move as corruption. Not taken.
- **Taking the registry lock whenever a targeted work ref could retire (§ 8).** Every write to a live work item would
  then serialize on the registry lock. Predicting the retirement from the lineage record keeps that lock off ordinary
  writes, and compare-and-swap still covers a lineage record that races the prediction. Not taken.
- **Splitting § 1–§ 4 into their own change (§ 13).** Not taken; § 13 records why.
- **Reviewing all 33 import modules (§ 11.1).** Not taken. A trial run surfaces the read-only transform's faults,
  and the review concentrates on the stages that write history and cannot be undone.

## Cross-cutting Considerations

- **Testing.** Every item has a case that fails before its fix and passes after it.
    - Each case runs where the store check's reach selects it. A new runtime read joins the reach declaration
      (`__tests__/reach/store-suites.json`) or the check stops.
    - § 5.4's Windows bursts run in a dispatched portability pair, and § 5.1's deadline-kill case runs on Windows in
      the same pair, a `reference-transaction` hook holding its transaction at `prepared` until the deadline fires.
    - § 7's test is rewritten.
    - § 9's quarter-provenance case reproduces the throw before its fix.
    - § 9's lock-failed row check is pinned by a case that hands `checkRefFetchUpdates` a failed fetch's `!` rows
      directly, since whether Git prints the row `!` depends on its version and ref format. A row whose tracking ref
      moved to a descendant raises no notice, and a rewrite to an ancestor stays `history-diverged`.
    - § 12's four properties are pinned against the default ports.
- **Performance.** Success paths start no extra Git process:
    - § 1.3 reads a tree only after a `missing` answer;
    - § 1.6's local tip check runs only after a completed failure with no porcelain rows;
    - § 5.2's wrapper `lstat`s only after a failed transaction with no lost race;
    - § 8's registry prediction reads the registry tree only when `planRefRetirements` would, and reuses that read.
  § 6.2 can repeat a lease attempt under contention, bounded by the deadline. § 2 narrows live listings and so reads
  no more than today.
- **Locks and safety.** No path removes a lock automatically (§ 5.3). An uninterruptible transaction stays bounded by
  Git's own lock wait (§ 5.1). § 6.2 keeps every operation under both locks it held before.
- **Compatibility.** ARC is pre-public-release, and the ref backend is reached only through hidden `arc store` commands
  before the flip. No refusal code, notice kind, failure kind, or result schema changes, so callers keep compiling and
  branching as they do. The outcomes that move are listed in § 1.8: a missing object from terminal to recoverable, and
  a local tip or transport failure from `unreachable` to `incomplete`.
- **User-facing impact.** Remedies change wording: restore or fetch instead of forward repair, a placement remedy,
  and a lock file's path and age with a removal remedy. A designation question now appears in every pull consumer's
  output (§ 3).

## Success Criteria

1. Every item in § 1–§ 11 has a test that fails before its fix and passes after it, selected by the store check's
   reach.
2. No refusal, listing diagnostic, or notice gives a missing object a forward-repair or historical-metadata remedy,
   and no point read or write refuses on one as terminal. No read reports a misplaced archive folder as missing
   metadata: each § 1.5 condition yields a `malformed` diagnostic with `rule: "placement"` and its remedy.
3. Every site § 1.4's search finds that refuses, reports, or holds on a missing object of a ref (§ 1.1's **Missing**
   row) classifies it by § 1.1. No refusal or listing diagnostic reports a missing tip, tree, or metadata blob as
   `namespace-corrupt`: `corruptRef` has no missing-objects arm, no refusal, diagnostic, or notice for such an object is
   built outside § 1.4's helper, and a saved read of an ended item whose archive tree is unavailable returns
   `state-unresolvable`. A pull still holds such a ref with a `namespace-corrupt` notice (§ 1.7). Every reader in
   § 1.8's inventory behaves as that table states.
4. `StoreRefusalSchema`, `ListingDiagnosticSchema`, `PullNoticeSchema`, `PublishFailureSchema`, and the result
   schemas are unchanged.
5. A live listing scoped to one owner, or to a whole family, returns `absent` when it finds no records and no
   diagnostics. An unreadable ref of another owner does not appear in an owner-scoped listing.
6. A pull that raises a designation question shows it in every consumer listed in § 3. `pullHistoryForRetry` and
   `readStateHistory` stop on it with its remedy.
7. No transport failure in § 4 escapes as an exception. Each yields a per-remote failed outcome or a typed refusal,
   and follow's resume and cleanup return `move-unfinished`.
8. A ref transaction past `prepare` when the deadline fires commits or fails on Git's own terms, and leaves no lock.
   The case runs on Linux and in a dispatched Windows portability pair, where a `reference-transaction` hook holds the
   transaction at `prepared` until the deadline fires. A held Git ref lock at any § 5.2 site refuses `lock-held` naming
   the lock's path and age, with the stale or held remedy by age.
9. The Windows publishing bursts run unskipped in both layouts and pass in a dispatched portability pair: every clone
   converges, directly or after the stranded lock its refusal names is removed and it pushes again (§ 5.4).
10. A push that overlaps another checkout's pull on the same remote does not make concurrent writes or pull merges
    refuse `lock-held` on the layout lock. A zero-wait advisory lock request acquires a free lock in one attempt.
11. A history destination moved once by an outside writer is absorbed by the retry. One moved on three consecutive
    attempts refuses with the repair remedy, whether the admission check, the transaction, or a re-resolution finds
    each move.
12. Every import review finding that an import of this repository's state can reach is fixed, and any it cannot reach
    is recorded in § Non-Goals. A `--trial` import of this repository's state, run in a disposable copy as § 11.1
    describes, returns a report with no refused record, whose every notice is of a kind that does not block: a
    transient source, a skipped derived capture, the identity-mint notice, a personal link, or an unreadable
    annotated commit.
13. § 12's four port properties hold for the default ports, each pinned by a test.

## Open Questions

None. Module and helper names inside `lib/store/ref/` for § 1.2's metadata result, § 1.4's helper, and § 5.2's
wrapper are implementation detail.

## Amendments

None yet.

---
