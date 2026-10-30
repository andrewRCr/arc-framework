# Draft: Ref Backend Hardening

- **Purpose:** Fix the ref backend's known defects that the cutover or its rehearsal exercises, before this repository's
  state flips onto it.
- **Origin:** [internal] — routed from `storage-ref-backend`'s eighth standard review pass, its fix checks, and defects
  found while fixing them (2026-10-29).
- **Commitment:** planned, P1, Heavy. Derivation: three lock and publication decisions and one missing-object
  classification shared by every read had to be authored. Scale: about thirty defects across some forty files of
  `lib/store/ref/`. The design composes existing refusal, lock, and remedy patterns rather than inventing a model, so it
  is not Novel.
- **Readiness:** settled in drafting (2026-10-30); every decision is in § Decisions, and § Open lists only spec-time
  detail.

---

## Problem / Motivation

`storage-ref-backend` landed with its review stopped under a rule fixed before its eighth pass: every material finding
in code that runs before the cutover was fixed, and so was every ref-backend major a local correction could repair. The
ref backend runs only through the hidden `arc store` commands until the flip, so its other findings were routed out
rather than fixed in place. This work unit takes the items the cutover exercises; `storage-ref-release-hardening` takes
those it never does.

Every item below was re-verified at `40815f094` (2026-10-30), and every one still holds. Ordinary commands compose the
in-repo backend through `createStore` (`lib/store/create.ts`), and `createRefStore` has no caller outside tests, so
before the flip only `arc store migrate`, `arc store remote`, and `arc store conflict` reach this code. After the flip
every store call does.

## Scope and Timing

- **What "the cutover exercises" means here:** the import, the rehearsal, and this repository's ordinary operation after
  the flip in the default layout — `read`, `list`, `lookup`, `write`, `batch`, `history`, `changes`, `version`, `pull`,
  and `push`. Moving state between remotes, tests that guard working behavior, and the race and benchmark kit belong to
  `storage-ref-release-hardening` (§ Decisions, D5).
- **Order.** Implements now that `storage-ref-backend` has landed; `storage-cutover` depends on it. The unit lands
  whole, on one branch (D1). Its phases order the caller-observable group first (§ Caller-observable items): built and
  reviewed first, since `storage-projection`'s and `cohort-identity-verbs`' ref-backend phases build on it, and
  separable as its own member if D1's re-raise fires. The internal items follow.
- **Review.** `storage-ref-backend` took eight standard passes. Review code reachable from shipped commands first, in
  its own chunks; group findings by shared cause after the first pass; agree a stop rule with the Owner before the
  second pass.
- **Paths** are under `packages/arc-framework/src/` unless they start with `__tests__/` (under `packages/arc-framework/`).
  Line numbers are as of `40815f094`.

### Coordination with `store-operation-git-access`

That work unit gives every public ref-store call one operation scope: a shared `cat-file --batch` reader and
remembered configuration lookups, refreshed at the events that can make them stale. Its spec,
`spec-store-operation-git-access.md`, is the authority; the two sessions coordinate directly (Owner, 2026-10-30).

- **Order, not an edge.** The two land in an agreed operating order with no `Depends On` either way (Owner,
  2026-10-30), per `RELEASE-GATES.md`'s Stance: a chosen order never becomes a `Depends On` field. This design holds
  under either order. Which whole unit lands first is settled when this unit's task list finalizes: that unit if it is
  in verification by then, otherwise this one. The unit landing second merges base first.
- **Constraints this design keeps** (its § 4.4, § 4.8, § 7.4, and Non-Goals):
    - Every lock and lease, the keeper lease among them, is taken through the context's `lock` port; a lease taken any
      other way escapes its scope's freshness bound.
    - Transport and designation lookups read fresh under whatever lease guards their writers (its § 7.4 invariant).
    - The lookup functions it remembers (`repositoryConfig`, `configOutput`, `readRemoteTransports`,
      `readNamedTransport`, `resolveLiteral`, `refFetchNeedsCompleteness`) keep throwing on failure; this unit types
      transport failures above them, at `refFetchTarget`, `checkedPushTarget`, and `captureComparisonWitness`.
    - Wrappers call through the ports of the context they were given, as `bindDeadline` does today.
    - Missing-object classification is this unit's. That unit's check in `readBatchObjects` repeats a missing answer
      without the reader only when the store directory has gone, so the classification here still sees ordinary
      missing answers.
- **Shared files.** `batch-read.ts` (its `readBatchObjects` check; this unit's `readRefTrees` change), `pull.ts` and
  `push.ts` (its restart hooks; this unit's typed transport failures and lock mapping), `write.ts` (its restart of
  `executeRefBatch`'s loop; this unit's `refBatchFailure` and `commitLockedRefBatch`), `backend.ts` (its routing of
  `refReadOperations` through the coordinator; this unit's `version` lock mapping), and `fetch-seen.ts`. Whichever unit
  lands second merges the other's change there. D2 and D3 also change `sync-deadline.ts`, and D2 changes
  `ref-transaction.ts`, whose deadline behavior that unit's § 7.5 relies on: an expired deadline still refuses the next
  Git process and the next lock, so its conclusion holds.
- **Port contracts that unit's scope wraps.** D2 widens two: `execInput`'s options gain the deadline option
  (`GitExecInput`, `lib/git/exec.ts`), and `StoreFileAccess.lstat`'s result gains `mtimeMs` (`lib/store/ports.ts`). The
  wrapped `execInput` passes the option through, and the wrapped `fs` passes `mtimeMs` through. D3 widens none, but its
  zero-wait lease attempt needs the wrapped `lock` to pass `waitMs` through unchanged, zero included; dropped, the
  port's 10-second default would hold the layout lock while the scope waits for the lease.

## Decisions

### D1 — Stays one work unit (Owner, 2026-10-30)

The size override returned the boundary to the Owner: the nine item groups forecast a task list near or over six
phases. The other marks are far off. The kept items forecast about 1,900 changed lines, some 40% of them source, before
the import review's own findings, and the spec should run well under 1,500 lines.

The alternative was to split the caller-observable group into its own member that lands first. Program work units
land single-branch, so a first landing before the whole unit is only possible as a separate member. The split was not
taken now:

- A cut before the cutover runs only by `RELEASE-GATES.md` § Decomposition until the cutover: a kit re-run, Owner
  direction at each workaround, and an extraction arm never rehearsed.
- Its benefit depends on `storage-projection`'s or `cohort-identity-verbs`' ref-backend phases waiting on this unit
  before it can land whole. On 2026-10-30 projection had not started implementation and `cohort-identity-verbs` was 985
  commits behind.
- One review can hold the whole change set: about two to three thousand lines in independent groups, reviewed in
  chunks with shipped-command code first.

Re-raise the split at draft close or a later planning boundary if either work unit's ref-backend phases become ready
to start while this unit's remaining work is still more than about a week out.

### D2 — In-flight ref transactions finish past the sync deadline; a stale Git lock gets a removal remedy

**Mechanism** (`notes-storage-ref-backend.md` § A58, hosted dispatch `40794816270`). `bindDeadline`
(`lib/store/ref/sync-deadline.ts`) puts the sync deadline's signal on every `exec`, `execInput`, and `rawExec`.
`updateRefTransaction` (`lib/git/ref-transaction.ts`) sends `start`, its changes, `prepare`, and `commit` as one input.
An abort runs `bindGitProcessCancellation` (`lib/git/process-cancellation.ts`), which ends the process tree with
`SIGKILL` on POSIX and `taskkill /T /F` on Windows. Git cleans its lock files only on ordinary exit and catchable
signals, so a transaction killed after `prepare` leaves `reftable/tables.list.lock` or a `<ref>.lock`, and every later
transaction that needs that lock fails until someone removes it by hand. Only the keeper and tracking transactions
refuse `lock-held` (`rethrowRefFetchKeeperLock`, `RefPushTrackingLockError`). Writes, merges, withdrawals, the
import's landing, and the version token that every live `list` and every `version` saves (`saveCapturedManifest`,
`manifest.ts`) throw a raw `GitProcessError`: `updateRefTransaction` rethrows a failure that left every ref at its
expected value, and `refBatchFailure` (`write.ts`) rethrows anything but a lock wait.

**Decision.**

1. An `update-ref --stdin` transaction started under the deadline runs without the deadline's signal. `execInput` takes
   an option that `bindDeadline` honors: if the deadline has expired at launch, the call refuses with the deadline's
   cancellation as any other call does; otherwise `bindDeadline` calls the given port without the deadline's signal.
   `updateRefTransaction` sets the option on its `update-ref` call alone. Its read-back and version probe share one
   execution object with that call today, and they keep the signal. No check follows the call: a transaction that
   commits after the deadline stays committed and reports its result, and the deadline stops the operation at its next
   Git process or at an existing between-attempt check (`refSyncDeadlineExpired`, `push.ts:70`). Git's own lock wait
   bounds the transaction: five seconds per lock from `gitRefLockArgs`, and `core.packedRefsTimeout` for
   `packed-refs`. The call still goes through the bound context's ports.
2. One store-level wrapper around `updateRefTransaction` classifies a held Git lock for every transaction in
   `lib/store/ref/`. When a transaction fails with every ref still at its expected value, the wrapper `lstat`s each
   candidate lock file in the bound repository (`context.repository.gitDir ?? commonDir`, through `context.fs`): each
   ref's `<ref>.lock`, `packed-refs.lock`, and `reftable/tables.list.lock`. A lock found throws one typed lock error
   carrying its path and age, read from `mtimeMs`, which `StoreFileAccess.lstat` (`lib/store/ports.ts`) adds to its
   result type; the default port already passes Node's `fs.lstat` through, so only test fakes gain the field. Any
   other failure rethrows as today. `rethrowRefFetchKeeperLock` (`fetch-keeper-lock.ts`) becomes this classification,
   and `RefPushTrackingLockError` (`push-tracking.ts`) carries the wrapper's lock beside the receiver's accepted refs.
   The sites that already map a lock wait map the new error to `lock-held`: `refBatchFailure` for writes,
   `pullRefStore` and `pushRefStore` for merges, withdrawals, keepers, and tracking, and `withMigrationLock`
   (`commands.ts`) for the import. `list` (`listBoundRecords`, `read.ts`) and `version` (`refReadOperations`,
   `backend.ts`, which wraps `refStateVersion`'s bare result) map it too, since both save the version token: the
   token keeps the manifest that `asOf` reads depend on, so a lock on it refuses rather than passing silently. A site
   that already turns a failed transaction into its own result keeps that result shape and takes the lock's condition
   and remedy: `clearProjectCheck` (`designation-project.ts`) still reports one remote's failed outcome. The wrapper
   changes an outcome only where today's raw error escapes.
3. A `lock-held` refusal for a Git ref lock names the lock file and its age, and never removes it. A lock older than
   the sync deadline (`REF_SYNC_DEADLINE_MS`) is almost certainly stale, and its remedy says to remove the file when no
   Git process is running in that repository; a younger one is probably held by another Git process, and its remedy
   says to retry first. This reconciles the top-level `lock-held` with the fetch `!` line's retryable
   `tracking-update-failed` notice (`spec-storage-ref-backend.md` § 6.3): neither can tell stale from held, and only
   removal clears a stale one.
4. Unskip the Windows separate-layout publishing burst in `__tests__/integration/store-ref-bursts.test.ts`.

**Alternatives.**

- _Graceful abort_ (`SIGTERM`, or `abort` on the transaction's stdin): Node has no catchable termination for a Windows
  child, where cancellation is `taskkill /F`, and A58's failure was on Windows. Not taken.
- _Reclaim a lock the canceled call held_: unsafe while cancellation can report descendants unconfirmed, and under Git
  for Windows' launcher the lock holder is a descendant (A58). Not taken.

**Residuals.** The store does not disable hooks, so a hung `reference-transaction` hook can hold an exempted
transaction past the deadline. A fetch must stay abortable, so a deadline that kills a fetch while it updates its own
tracking refs can still strand a lock; the next transaction that needs it reports it, with part 3's remedy, wherever
D2 part 2 maps the lock error.

### D3 — The keeper lease is admitted across its remote's fetch

`withRefFetchKeepers` (`lib/store/ref/fetch-seen.ts`) takes the advisory lock on `refs/arc/tmp/seen/<remote>`, waiting
up to `REF_SYNC_DEADLINE_MS`, and `fetchRefPatterns` (`lib/store/ref/fetch.ts`) holds it across the basis capture, the
network fetch, and the keeper release. That contradicts `spec-storage-ref-backend.md` § 11.4, where only the move lock
spans a network call.

The lease does more than protect keepers. It is the per-remote lease that also serializes:

- backing remote repoints (`repointBackingRemote` and `configureBackingRemote`, defined in `backing-configuration.ts`
  and called under the lease from `remote-backing.ts`, `source-switch.ts`, `migrate-remote-switch.ts`, and
  `migrate-switch-undo.ts`);
- source switches and their undo (`source-switch.ts`, `migrate-remote-switch.ts`, `migrate-switch-undo.ts`);
- the release of ended keepers (`releaseCapturedKeepers`, `fetch-seen-ended.ts`);
- push admission's comparison witness (`captureComparisonWitness` and `withComparisonWitness`,
  `comparison-witness.ts`).

**Decision.** This unit's spec states the lease as the one other lock held across a network call, that remote's
fetch, bounded by the sync deadline. A sibling that outwaits its own remaining deadline ends with
`RefSyncDeadlineError` and `refSyncDeadlineRemedy`'s retry remedy. The change touches no storage-contract decision:
the contract's D11 governs how stored surfaces take concurrent writes, not lock spans, and the rule that only the move
lock spans a network call lives in `spec-storage-ref-backend.md` § 11.4, a shipped member's spec this unit's spec
states forward.

**No wait on the lease under the layout lock.** Push admission and push tracking take the comparison scope
(`withComparisonScope`, `comparison-witness.ts`), which today takes the clone-wide layout lock and then waits for the
lease up to the sync deadline. With the lease held across a fetch, a push overlapping another checkout's pull on the
same remote would hold the layout lock for that fetch, and every write and pull merge, which waits 10 seconds for the
layout lock (`commitRefStep`, `DEFAULT_MAX_WAIT_MS`), would refuse `lock-held`. So the comparison scope takes the lease
with a zero wait while it holds the layout lock, and a zero wait means one attempt: `acquireAdvisoryLock`
(`lib/advisory-lock.ts`) today tests its deadline before its first attempt, so a zero wait never acquires; it changes to
attempt once first. No caller asks for a zero wait today. Today `bindDeadline` passes one only once its deadline has
expired, and it changes to refuse there before calling the port, whatever wait was asked, with `RefSyncDeadlineError`
naming the lock's ref, since only the port knows the lock's file: every existing request keeps today's result at expiry,
its condition naming the ref rather than the file. A lock taken with a zero wait releases under `DEFAULT_MAX_WAIT_MS`:
`createRefLockFactory` (`default-ports.ts`) gives a release its acquisition's wait today, and a single try at a busy
`.break` lock would throw a release-phase timeout that push does not map. The lock port and `bindDeadline` pass the wait
through today, and `store-operation-git-access`'s wrapped `lock` must (§ Coordination), so no port contract widens. If
another holds the lease, the scope releases the layout lock, waits for the lease alone, releases it, and tries again.
The retry is bounded by the remaining sync deadline, whose expiry ends a push with its existing timeout refusal; a
caller with no sync deadline, such as follow's comparison scopes (`follow-delete.ts`, `follow-candidates.ts`), is
bounded by `REF_SYNC_DEADLINE_MS` from its first attempt, the total one lease wait allows today, and its expiry throws
the lease's `AdvisoryLockTimeoutError`, which `withMigrationLock` maps to `lock-held`. The operation still runs under
both locks, so `store-operation-git-access`'s § 7.4 invariant holds. Taking the lease before the layout lock was not
taken: the source switches take the layout lock and then the lease, so reversing the order risks a deadlock between
them. A bounded wait under the layout lock was not taken either: it still holds the layout lock for its bound, racing
writers' own 10-second wait. A try-acquire option on the lock port was not taken, since it widens a port the other unit
wraps.

Five other paths hold the layout lock while waiting for the lease: the same-layout arm of a remote switch
(`prepareTarget` under `migrate-remote-switch.ts:61-62` and `source-switch.ts:50-51`), the layout-move arm
(`moveRefLayoutAsSwitch`, `migrate-layout.ts:63,108`), the switch undo (`undoSwitch`, `migrate-switch-undo.ts:32,41-43`,
through `restoreBacking` and `dropCarriedHeads`), and `arc store remote`'s backing setting (`applyBackingSetting`,
`remote-backing.ts:58,67`). `arc store migrate` and `arc store remote` reach each only with a separate store or a move
between remotes; the backing setting refuses before the lease in the default layout (`remote-backing.ts:66`). They
move to `storage-ref-release-hardening` (§ Scope boundary).

**Alternative.** Per-operation keepers, so that no lease spans the fetch, would ripple through every operation the
lease serializes. `store-operation-git-access`'s § 7.4 invariant would also need a new lease to bound transport reads
against backing repoints. Not taken.

### D4 — A lost history-destination compare-and-swap retries, within a bound

`publishRefBatchChanges` (`lib/store/ref/write-publication.ts`) handles one lost `update-ref` transaction two ways.
A history destination off its expected value is refused as terminal `namespace-corrupt` through
`historyDestinationFailure` (`write-history.ts`), with a repair remedy. Any other ref returns `"retry"`.
`spec-storage-ref-backend.md` § 5.1 step 7 says to retry from step 4.

Every ARC writer of history refs holds that ref's lock or the layout lock, and the write holds both here. So only a
writer outside the lock protocol reaches this point: a hand-run `update-ref`, a fetch or push into
`refs/arc/history/*`, or an advisory lock wrongly judged abandoned.

**Decision.** The code aligns with the spec and retries from step 4 like the other refs. Step 5's
`checkRefHistoryDestinations` still refuses a destination that is not an ancestor, with its repair remedy. The retry
loop in `commitLockedRefBatch` (`write.ts`) has no bound today, and ordinary contention drives it too: a changed
admission basis (`refAdmissionBasisChanged`, `write-build.ts:86`) and any other lost ref return `"retry"`. So the
bound counts only consecutive history-destination losses. Past it the write refuses with the existing repair refusal
(`historyDestinationFailure`); contention retries as today, and a contention retry resets the count.
`__tests__/integration/store-ref-history-destination.test.ts`, which pins the terminal policy with an ancestor racer,
is rewritten for the retry.

**Alternative.** Keep the terminal refusal as this unit's own recorded decision. A shipped member's spec is not
amended, so either way this unit's spec states the policy. Not taken.

### D5 — The scope line for the deadline (Owner, 2026-10-30)

Smallest cut that still lets the rehearsal and the import run. Items on the import, on the rehearsal, or on ordinary
post-flip operation stay; items with none of those reaches move to `storage-ref-release-hardening`, whose scope holds
tests, the race and benchmark kit, and moving state between remotes. § Scope boundary lists what moved.

Homing refined the line (Owner, 2026-10-30). `storage-ref-release-hardening`'s design has no section the registry
anchor or quarter-provenance items would shape, and both sit on post-flip write paths, so they stay here. The migration
push loops reach only moves between remotes, which that unit's § Moving state between remotes holds, so they move. A
site reached only by moves stays when a kept item's own fix changes what it receives: typing transport failures in
`captureComparisonWitness`, which push admission needs, changes what follow's resume and cleanup get, so those call
sites stay with § Transport failures. The migration fetch (`migrate-remote-fetch.ts`) stays on its own reach: the
import's transient publication calls it (`import/transient-publication.ts:39-42`). The routed items reach that unit as
pre-routed `USER-INBOX § Work Unit` captures, since only a routing change off the base may write its draft.

### D6 — One fault classification for missing, unparseable, and misplaced objects (Owner, 2026-10-30)

Every read classifies by what is wrong with the object, not by where the read happened:

| Fault                                                                                                                                                                    | Point read or write                                                                                    | Listing diagnostic               | Pull (held ref)            | Remedy                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------------------- | ---------------------------------------------- |
| An object is missing: a metadata or record blob, or a nested tree                                                                                                        | recoverable `state-unresolvable`, naming `historyRefs` only when an ended item's history can supply it | `unreadable`                     | `namespace-corrupt` notice | restore or fetch the object                    |
| An object is present but does not parse                                                                                                                                  | terminal `namespace-corrupt`                                                                           | `unreadable`                     | `namespace-corrupt` notice | forward repair, as today                       |
| A readable tree that holds records has no metadata entry                                                                                                                 | terminal `namespace-corrupt`                                                                           | `unreadable`                     | `namespace-corrupt` notice | forward repair, as today                       |
| An archive folder is misplaced: its recorded placement kind or quarter disagrees with its archive, its sequence is invalid, or a cohort folder lacks its closeout marker | terminal `namespace-corrupt`, with a placement condition                                               | `malformed`, `rule: "placement"` | `namespace-corrupt` notice | name the folder's expected placement           |
| A negotiation tip's object is missing locally, or a transport target cannot be resolved                                                                                  | per-remote `failed` with `refused`                                                                     | —                                | —                          | restore the object, or repair the remote's URL |

`refRecordAbsence` (`record-absence.ts`) already reports a missing record blob as the first row does. Two primitives
change so the fact reaches every site: `parseRefMetadata` reports a missing object apart from an unparseable one, and
`readRefTrees` reports a missing tip object apart from a missing nested tree. One helper maps a fault to its refusal,
diagnostic, and remedy, composing `corruptRef`, `recordDiagnostic`, and `unavailableRefHistory`. No refusal code or
schema changes: the listing diagnostic schema already admits `rule: "placement"` on `malformed`
(`ListingDiagnosticSchema`, `lib/store/read.ts:47-54`), and the pull failure union already holds `refused`.

**Reads by `tip:path`.** `git cat-file --batch` answers `missing` alike for a path absent from the tree and for a
blob absent from the object database, so a point read cannot tell the first row from the third by its answer alone.
Each site that refuses or reports on a `missing` metadata or record answer — `read.ts:55,65`, `read-uid.ts:20-24`,
and `sync-withdraw-sibling-ends.ts:81-82` — reads the tree only after that answer and classifies by whether the entry
is there, as `refRecordAbsence` already does. The withdrawal site today throws `UnavailableWithdrawJournal` for a
missing and an unparseable object alike, and `heldWithdrawal` gives both the restore remedy. `lineage-resolution.ts:17`
and `live-owners.ts:23` already hold the tree and classify from its entries. A present object costs no extra read.
Sites that tolerate a `missing` answer keep their fallback: `readHistoryPaths` (`history-paths.ts:10-12`) falls back
to the requested name, `retired-history.ts:34-39` skips the revision, `readScopedPointTree` (`view-state.ts:55`)
returns no tree, and `publishedTerminalLineage` (`sync-ended-twice.ts:48-49`) answers false. The spec inventories every
`tip:path` read.

**Sync.** A pull reaches the classification through `checkSyncRefTip` (`sync-tip.ts`), which calls `checkRefTip`, and
through `heldMerge` (`sync-merge.ts`), which holds the ref with a `namespace-corrupt` notice for any refusal.
`PullNoticeSchema` has no missing-object kind, and none is added: a held ref keeps that notice kind, carrying its row's
condition and remedy, so a ref held for a missing object says to restore or fetch it. A push reaches it through
`excludeBrokenPushRefs` (`push-exclusion.ts`), which runs `checkSyncRefTip` on every changed ref and excludes the
families a refusal touches with a `refused` publish failure. `PublishFailureSchema` makes `refused` terminal, and no
schema changes, so the failure keeps that class and carries its row's condition and remedy.

**Callers that branch on the class.** A missing tree moves from terminal to recoverable, and a negotiation or
transport failure moves `PullResult.status` from `unreachable` to `incomplete` through `transportOnly`
(`operational-sync-bindings.ts:44-46`). Readers of `state-unresolvable` change with it:

- `readStateHistory` (`handoff/state-history.ts`) re-runs a `state-unresolvable` read once even with no history refs,
  at the cost of one read and no pull.
- Recovery (`resolveRecoveryStateBasis`, `recover/state-basis.ts:33`) rebuilds its seed from current state when a
  missing object falls in the seed's change window, where today it throws. Accepted (Owner, 2026-10-30): recovery
  reloads from state it can read rather than trusting a window it cannot.
- Rename (`runStoreRename`, `work-unit/verbs/rename-store.ts:39`) retries only when `historyRefs` is non-empty, so a
  missing object with no history to pull returns its refusal unchanged.
- `snapshot-read.ts:56` and `follow-delete.ts:51` branch on `namespace-corrupt` (§ Open).
- Pull's identity adoption (`adoptionFailure`, `pull.ts:126-131`) branches on refusal class: a recoverable refusal
  stops the whole pull, a terminal one fails that remote. A missing project identity object read by
  `adoptSourceProjectIdentity` now stops the pull with the restore remedy, as the code's recoverable route intends.
  Only a store whose remotes are all read sources reaches it.

The spec carries the full inventory of readers of `state-unresolvable` and `namespace-corrupt`, and of readers that
branch on refusal class.

**Proportionality.** Every row traces to a routed defect. The helper composes the existing pieces rather than adding a
refusal kind, a schema, or a recovery path. The alternative, fixing each site's remedy text in place, leaves the two
primitives erasing the fact, so the next read written against them repeats the defect.

### D7 — A risk-focused import review (Owner, 2026-10-30)

One standard pass and a fix check, scheduled as an early phase so its findings size the rest of the plan:

- **In scope:** the stages that write history and cannot be undone — landing (`landImport`, `buildImportCommits`,
  `landImportRefs`) and publication with transient cleanup (`publishImport`, `retireImportLocals`,
  `retireImportRemote`, `retireOriginRefs`, `dropKeptTips`) — and the transform's admission rules: what refuses, what
  imports verbatim, and what is skipped with a notice.
- **Evidence:** a `--trial` import of this repository's real state. A trial runs the transform, builds the import
  commits, and writes its private gathering refs, then deletes them under the layout lock. It never lands the state
  refs, keeps transients, publishes, or cleans up transient sources, so the destination landing, publication, and
  transient cleanup are reviewed from source.
- **Stop rule:** fix every finding an import of this repository's state can reach. Record a finding it cannot reach in
  this unit's scope boundary without fixing it, since the import serves this repository alone (`cohort-state-storage.md`
  § Soft coordination). No import finding routes to `storage-ref-release-hardening`, which the cutover does not wait
  for.

The rehearsal on real state remains the gate. A full pass over all 33 modules was the alternative, not taken for the
deadline: the transform's read-only modules surface their faults in a trial run.

## Caller-observable items

These change refusal kinds, remedies, or result shapes that callers branch on or that drive automatic retries, so they
are built and reviewed first (§ Scope and Timing).

### Fault class and remedy for missing or misplaced objects

One cause: a missing or misplaced object is reported as unparseable or corrupt state, with a repair remedy, where the
true remedy is to restore or fetch the object, or the fault is a placement fault with its own remedy. Fix these as one
item, with the one classification D6 sets.

No shared classification exists today, because two primitives erase the fact it needs. `parseRefMetadata`
(`metadata.ts:28-29`) returns null both for a missing object and for an unparseable one. `readRefTrees`
(`batch-read.ts:148-166`) drops a ref whose tip object is missing and one whose nested tree is missing alike. Partial
pieces exist: `corruptRef` (`namespace-health.ts:9-14`), `recordDiagnostic` (`content-read.ts:29-36`),
`unreadableRef` (`read.ts:274-278`), `isUnavailableGraphFailure` and `unavailableRefHistory` (`history-graph.ts`),
`missingChangeState` (`changes-graph.ts:88-93`), and `historicalMetadataFailure` (`metadata.ts:52-57`).

- **Archive folder sequence and quarter faults are reported as missing metadata, with a remedy that cannot repair
  them.** `folderPlacement` (`archive-read.ts:174-184`) returns null for a placement-kind or quarter mismatch, an
  invalid sequence, or a cohort with no closeout, and `decodeArchiveFolderControls` (:97-112) reports each as the
  `unreadable` metadata diagnostic whose `metadataFailure` remedy (`metadata.ts:45-49`) is a forward repair. Reaches
  `list`, archived `read`, `lookup`, `write`, `changes`, `pull`, and `push` through `captureArchivedFolders`
  (`ended-owners.ts:34`).
- **Archived record diagnostics prefix only the key, the remedy names the folder-relative path, and neither names the
  quarter.** At `archive-view.ts:19` and `read.ts:192`, with the remedy from `recordDiagnostic(entry.path)` over the
  root-stripped path `projectRefTreeEntry` gives (`archive-read.ts:93`). A key of the form `${ref}:${root}${path}` keeps
  the callers that recover the ref with `key.split(":")[0]` working; prefixing inside `decodeCapturedRef` would break
  the `key === path` matches at `read.ts:349` and `write-views.ts:224`.
- **Lookup, live-owner capture, and other metadata reads treat a missing metadata object as unparseable metadata with
  a forward-repair remedy.** At `lookup-trees.ts:70-72` and `live-owners.ts:34,39`, and by the same conflation at
  `write-views.ts:84-87,184-188`, `read.ts:65-70,259-271`, `namespace-health.ts:22-24`, and `write-build.ts:257-262`.
- **Current listings give an unavailable record blob a repair remedy instead of object restoration.**
  `recordDiagnostic` (`content-read.ts:29-36`) restores only for saved state; point reads already restore
  (`read.ts:350-353`, `record-absence.ts:14-17`, `write-views.ts:167-169`).
- **Saved reads name history refs for live items whose tip is present but a nested tree is missing.**
  `unavailableSnapshot` (`snapshot-read.ts:61-66`) maps every unavailable work or cohort ref to its history ref, so the
  automatic history pulls in `operational-sync.ts` (`historyRefs()`) and `readStateHistory`
  (`handoff/state-history.ts`) fetch nothing useful.
- **Name-restricted changes refuse a manifest tip this clone lacks as terminal `namespace-corrupt`.**
  `changes-scope.ts:24-26` resolves through `resolveRefName` to `corruptRef(ref, true, saved)` (`lookup-trees.ts:66`);
  the lineage-restricted path (`changes-scope.ts:85-95`) does the same, and :25 falls back to the interval's earlier
  side only on `not-found`. The unrestricted path already returns `state-unresolvable` with `historyRefs`
  (`missingChangeState`).
- **A local object missing during fetch negotiation is reported as `unreachable`, with a remote-connectivity remedy.** A
  ref under a `--negotiation-tip` pattern (`refFetchNegotiation`, `fetch-target.ts:30-39`) whose object is missing makes
  fetch exit 1 naming the ref, with no porcelain rows; `parseFetchPorcelain` (`lib/git/fetch.ts:29-30`) turns that into
  `unreachable`, and `failedRemotePull` (`pull.ts:186-192`) attaches `refSyncTransportRemedy`. The same parsing
  misclassifies at `migrate-remote-fetch.ts:60-69` and `designation-project.ts:115-121`. Missing ancestors or blobs of a
  negotiated tip do not fail the fetch. `classifyRemoteFailure` (`lib/git/remote-ref-reader.ts:164-179`) reads only
  stderr text, so detection is by state: after a fetch ends in a completed Git failure (`isCompletedGitFailure`) with no
  porcelain rows, one helper checks the local negotiation-tip objects once (`for-each-ref` over the negotiation patterns
  into `cat-file --batch-check`). A missing object takes D6's negotiation row; any other failure keeps today's
  classification. The helper serves all three sites, runs only after such a failure, and reads no further message text,
  so the cohort's three named places where Git's message text is read stay three. Matching the fetch's stderr (a fourth
  such place) and checking the tips before every fetch (processes on every pull) were not taken.

### Listing scope

- **Live listings apply a different scope and absence rule than as-of listings and the reference backend.** Live
  listings select every ref in the family and every archive ref whatever `input.owner` is (`read.ts:161-162`), and
  `decodeCapturedRef` (:216-236) passes every diagnostic through. As-of listings narrow by owner
  (`snapshot-read.ts:77,79`) and the in-repo listing skips other owners (`in-repo/list.ts:50`). An owner-only listing
  returns an empty `complete` here and `absent` in-repo (`readableRefListing`, `read.ts:199-203`). Because
  `acquireLifecycleRecords` (`work-unit/prepared-lifecycle-write.ts:16-19`) refuses on any diagnostic, one unreadable
  unrelated work ref blocks every lifecycle write through it. Live listings take the as-of path's owner scope for
  records and diagnostics alike, and the in-repo backend's absence rule: no records and no diagnostics is `absent`. The
  write-check views (`write-views.ts:96-118`) and as-of archived diagnostics (`archive-view.ts:14`) take the same
  scope.

### Pull-result consumers

- **Rename's and conflict's history retry ignores a designation question.** `pullHistoryForRetry`
  (`lib/store/pull-consumption.ts:48-54`) reads only `pulls`, never `states`, so a designation-needed state retries and
  fails with the bare `state-unresolvable`. Move it and every `store.pull()` caller outside `lib/store/` onto
  `consumePull` with `pullDesignation`, through `pullSelectedStore` (`operational-sync-bindings.ts`). Callers not on the
  helper: `work-unit/verbs/rename-store.ts:41` and `ref/conflict-command.ts:52` (through `pullHistoryForRetry`),
  `session-init/store-user-pull.ts:59`, and `handlers/status/store-locus.ts:21-28`. Re-derived policy also sits in
  `ref/import/finish.ts:31-39` and `work-unit/verbs/archive-store.ts:131-145`. The family includes the helper's own
  callers: `consumePull` proceeds on a top-level `designation-needed` without rendering it, so the three that call it
  without `pullDesignation` (`errand/store-runtime.ts:73`, `errand/promote-store-runtime.ts:22`,
  `handlers/errand-entry-storage.ts:26`) read local state past an unasked question. `consumePull` renders the
  question as a notice for every consumer, and the retry paths, `pullHistoryForRetry` and `readStateHistory`, stop on
  it with its remedy, as `readStateHistory` already does.

### Transport failures

- **Transport failures escape as raw throws.** `checkedPushTarget` (`push.ts:220-226`) calls `refPushTarget`
  (`fetch-target.ts:42-48`), and `refFetchTarget` (`fetch-target.ts:10-17`) throws through `fetch.ts:60` and
  `pull.ts:33-43,118-121`, discarding per-remote outcomes and notices. `captureComparisonWitness`
  (`comparison-witness.ts:21-30`) lets `EffectiveTransportError` escape where finalization (:40-44) maps it, so follow's
  resume (`follow.ts:86`) and cleanup (`follow-delete.ts:24,78`) throw instead of returning `move-unfinished`. Also
  unmapped: `push.ts:194` and `follow-candidates.ts:38`. Turn each into a per-remote failed outcome or a typed refusal,
  typed at these call sites rather than in the lookup functions beneath them (§ Coordination).

## Import

The import runs once, at the cutover, over this repository's real history, so a defect there lands in that history. The
cutover rehearsal on real state remains the gate.

- **Review the import before the rehearsal.** A focused review of the import's transform, landing, and transient
  cleanup, decided 2026-10-29 and scoped by D7. The surface is 33 modules and 2,216 lines under
  `lib/store/ref/import/`: `arc store migrate --import [--trial]` reaches `importTrackedState` (`import/entry.ts:21`)
  through `runRefMigrate` (`commands.ts:29-32`). A trial runs the transform, builds the import commits
  (`buildImportCommits`), and writes its private gathering refs, then deletes them under the layout lock
  (`landImportRefs`, `import/land.ts:10-33`). It never lands the state refs, keeps transients, publishes, or cleans up
  transient sources (`landImport`, `entry.ts:54-64`). Stages: destination check (`inspectImportDestination`),
  transform (`readImportSource` through `qualifyImportCodeLinks`, blocked on any refusal or notice at `entry.ts:38`),
  landing (`landImport`, `entry.ts:54`), and publication with transient cleanup (`publishImport`, `finish.ts:11`). A
  record that fails its kind's parser refuses the whole import (`reportImportAdmission`); review candidates,
  integration boundaries, and task lists import verbatim; derived task captures are skipped with a notice that never
  blocks. The starting evidence the item was routed with, 22 task lists failing the strict scanner, no longer blocks
  the import (`3634dd5be`, `92b0de26b`).
- **An execute-bound mark that is its capture's last line stays in the imported inbox while the capture is also
  queued.** The pattern at `import/pending-entries.ts:33` requires a newline after the mark, and `splitEntryList`
  (`lib/store/concurrency/entries.ts:36-37`) moves trailing newlines into the separator; add a body-less capture case.
- **Personal symlinks are skipped silently, and a symlinked file that notes saving saves refuses with a remedy that
  cannot clear it.** `walk` in `import/personal-disk.ts:68-69` skips a link with no notice, while `readUserDir`
  (`lib/io-context.ts:601-623`) follows it, so `comparePersonalFile` (`import/personal.ts:51-64`) blocks on a
  `snapshot-only` file with an `arc user load` remedy. That remedy replaces a directly linked file with a regular one,
  and cannot clear a file reached through a linked directory; a linked file never saved is dropped with no notice.
  Report each skipped link and give links an actionable remedy, or import the target as notes saving does.
- **Compacted-note ordering refuses a whole identity when any retained note's annotated commit is unreadable.**
  `committedAt` (`import/personal-notes.ts:57-61`) throws inside the sort at :27-29, and `personal.ts:24` turns that
  into a blocking notice that drops the person's records. Order unreadable commits deterministically (last, by object
  ID) with a notice.
- **A lost default-layout transient-source delete lease is reported as a change to the import's private gathering
  refs.** `landImportRefs` (`import/land.ts:20-33`) returns a boolean that is false for a layout mismatch, present
  state refs, or a lost `importTransientDeletes` expectation alike, and `landingRace` (`entry.ts:73-80`) reports all as
  changed gathering refs. Return the failing ref and report a lost transient lease as its own recoverable condition.
- **A rebuild with no transient tips orphans the earlier attempt's import publication journal permanently.** The
  journal is written only when tips exist (`entry.ts:61`), and `retireImportLocals` and `retireImportRemote`
  (`transient-cleanup.ts:36,53-54`) return early with no kept tips, so `dropKeptTips` (:94-102), the journal's only
  deleter, never runs. Drop a stale journal when no kept tips remain.
- **Source retirement flattens a refusal thrown inside publisher verification into an origin cleanup failure.**
  `retireOriginRefs` (`transient-cleanup.ts:64-71`) carries a returned `{condition, remedy}` through, but catches a
  `MigrationRefusal` thrown by `fetchMigrationRemote` or `captureMoveRemote` and rewraps it, so `cleanupRefused`
  (:131-134) reports it recoverable `move-unfinished` with the default remedy, losing a terminal class. Carry the thrown
  refusal's class, condition, and remedy.

## Sync, push, and withdrawal

- **Non-JSON metadata on a withdrawal journal ref escapes as an untyped exception that rejects pull and push.**
  `inverseMetadata` (`sync-withdraw-inverse.ts:74-86`) calls `JSON.parse` directly, and `commitWithdrawEnd`
  (`sync-withdraw-commit.ts:28-62`) catches only `UnavailableWithdrawJournal` and `RefSyncLabelError`. Parse through
  `parseRefMetadata` and hold the ref with a `namespace-corrupt` notice.
- **Withdrawal conflict values pass a fresh live `refs/arc/` listing to the snapshot-based placement completer.**
  `conflictValue` (`sync-withdraw-entries.ts:84-95`) passes `readSyncRefs(context, "refs/arc/")` at :92, where
  `completeSyncPlacements`' other callers (`sync-tree.ts:75-76`, `sync-label.ts:58`) pass captured maps.
- **A pending end the pull withholds without an end-pending seed makes push emit a schema-invalid failed publish with
  empty condition and remedy.** `excludeBrokenPushRefs` (`push-exclusion.ts:19-47`) seeds exclusion from
  `listing.pending` but builds refusals only from notices and tip checks, never for a ref that seed alone excludes; a
  seedless end arises at `sync-pull-lifecycle.ts:76` and through `uniqueNotices` (`pull.ts:203-207`), which drops
  `end-pending` beside `history-diverged` or `tracking-update-failed`. Build a refusal for every excluded ref.
- **Quarter provenance throws an internal error when a reopen or quarter move restores a removed completed primary in a
  single-put batch.** `quarterCommitReference` (`quarter-provenance.ts:10-28`) throws at :26 when `folderHoldsRecord`
  (:30-35) matches neither snapshot; reachable from `write-reopen.ts:67`, `write-completed.ts:160`, and
  `write-archive.ts:122`. Attribute the quarter change to the restoring mutation. Traced, not yet run.

## Locks

- **The sync deadline can strand a ref lock** — D2.
- **The keeper lease is held across the network fetch** — D3.
- **Push admission and tracking wait on the lease while holding the layout lock** — D3.
- **Keeper-lock classification ignores `packed-refs.lock`.** `rethrowRefFetchKeeperLock` (`fetch-keeper-lock.ts:17-31`)
  observes only `reftable/tables.list.lock` and `<ref>.lock` (:20), so a files-format deletion lock escapes pull and
  push tracking as a raw exception. D2's wrapper checks `packed-refs.lock`; add a files-format case.
- **Registry anchor lock prediction misses a retirement started only by another owner's resolves.**
  `registryAnchorLockRefs` and `mayEnd` (`write-manifest.ts:20-28`) cover removes and completed puts, while
  `planRefRetirements` (`write-retirement.ts:29-55`, called at `write-build.ts:76`) retires any targeted work ref with
  terminal lineage and `write.ts:141` takes only the predicted locks. Compare-and-swap still protects the registry, so
  the cost is a broken lock invariant and retries, not lost data. Predict the retirement, or take the registry lock
  whenever a targeted work ref may retire.

## Write publication

- **A lost history-destination compare-and-swap is refused as terminal** — D4.

## Decomposition

- **Decomposition derives a verbatim companion's stored name without the slug-safe rule.** `copyCoordinates`
  (`lib/decompose/scaffold-copy.ts:47-48`) uses `companionArtifactName`, while the store places the record by
  `companionStoredName` (`lib/store/companion-name.ts:11-13`). The record lands correctly, but the member meta's
  Design entry (`member-scaffold.ts:64,72-74`) and the decompose report point at a name that resolves to nothing.
  Reachable through `arc decompose` under the ref backend only.

## Success signal

- Every kept item has a case that fails before its fix and passes after it, run by the store check's reach.
- No read reports a missing object with a forward-repair remedy, or a misplaced archive folder as missing metadata
  (D6), and neither a refusal code nor a result schema changes.
- The Windows separate-layout publishing burst runs unskipped and passes in a dispatched portability pair (D2).
- Every import review finding an import of this repository's state can reach is fixed, and a `--trial` import of that
  state passes (D7).
- `storage-projection` and `cohort-identity-verbs` can build their ref-backend phases on the caller-observable items
  as landed.

## Unknowns and Assumptions

- **Git's lock wait bounds an exempted transaction** (D2): `gitRefLockArgs` sets five seconds per lock. A
  `reference-transaction` hook is the unbounded residual.
- **D1 assumes** that neither `storage-projection` nor `cohort-identity-verbs` will be ready for its ref-backend phases
  long before this unit can land whole.
- **The import review's findings are unsized.** The forecast above excludes them.
- **The quarter-provenance throw** was traced through the code, not reproduced.

## Open

None blocks formalization. Settled at spec time:

- the value of D4's bound on consecutive history-destination losses;
- how `snapshot-read.ts:56` and `follow-delete.ts:51`, which branch on `namespace-corrupt`, take a missing tree once D6
  makes it recoverable;
- the placement remedy's wording for each folder fault D6 names.

## Scope boundary (Won't Do)

- **Routed to `storage-ref-release-hardening`** (Owner, 2026-10-30), since nothing the cutover runs reaches them:
    - the captured-base mutation tests that never assert the mutation fired
      (`__tests__/integration/store-ref-import-captured-bases.test.ts:130-144,180-209`) — tests only;
    - a declined automatic designation repeating `move-unfinished` for pull and losing it for push
      (`designation-first.ts:28-29,114,134-136`; `push.ts:90-93`) — needs a clone with no remote roles and a recorded
      move;
    - first placement treating an ambiguous designation as the separate layout (`writeRefRepository`,
      `repository.ts:55-70`; `designatedStoreLayout`, `layout-designation.ts:7`) — needs two or more push remotes, and
      its fix adds a `StoreRefusal` code;
    - the copy, delete, follow, departure, and withdrawal push loops that restart without bound on an unverified
      lost-race classification (`settleMigrationPush`, `migrate-remote-copy.ts:211-217`, and six counterless loops in
      `migrate-remote-copy.ts`, `migrate-remote-delete.ts`, `follow-copy.ts`, `follow-delete.ts`, `leave-source.ts`,
      and `leave-recorded-withdraw.ts`) — reached only by moves between remotes;
    - the switch, undo, and backing-setting paths that hold the layout lock while waiting for the keeper lease (D3
      names all five), so one overlapping a pull's fetch makes writes and merges refuse `lock-held` after their
      10-second layout wait — reached only by moves between remotes or a separate store (D3).
- **Store performance.** Fewer Git processes per call is `store-operation-git-access`'s; sharing across calls is its
  follow-on's. The `USER-INBOX` capture asking whether every `readSyncRefs` capture in a sync call is needed is
  declined here (§ Dispositions).
- **The missing-answer check in `readBatchObjects`** belongs to `store-operation-git-access`.

**Dependencies.** `Depends On: storage-ref-backend`, landed; the pending reconcile drops the satisfied edge.
`storage-cutover` depends on this unit.

## Dispositions

| Entry                                                                                          | Outcome | Reason                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `USER-INBOX § Work Unit`: "Find whether every `readSyncRefs` capture in a sync call is needed" | reject  | A process-count question, not a defect the cutover exercises; `store-operation-git-access`'s Non-Goals keep those listings exact. Its home stays the drain's call, `store-cross-call-sharing` the first candidate. |

## Next

Create the spec.
