# Draft: Store Operation Git Access

- **Origin:** [internal] — the store-suite cost measurement of 2026-10-29 at `f663af671`, recorded in
  `analysis-test-suite-cost-baseline.md` § Store-suite process cost, and the configuration measurement handed over when
  the Errand "Read Git config and remote transport once per ref-store operation" was folded into this unit.
- **Purpose:** Start fewer Git processes per ref-store call by giving every public store call the shared object reader
  that read and write calls already hold, and by answering each Git configuration lookup once until something can change
  it — without changing how any call publishes or which refusal it reports, and changing what it observes only where
  another process writes configuration while the call holds no lock (§ Unknowns and Assumptions).

---

## Problem / Motivation

The store suites (`test:store`) run in CI as four shards of 13–22 minutes each, and process cost dominates them: in the
ten slowest files child processes account for about 86% of case time, and a spawn blocks the test worker for a median
3.2 ms before Git runs for about 2 ms. The same cost slows every store command. Across the nine files the analysis
attributes, `batch-read.ts` starts 23.5% of 224,996 Git processes — 25,581 `cat-file`, 15,629 `for-each-ref`, and 11,761
`diff-tree` — configuration and remote lookups about 19%, and the write plumbing about 16%.

The capture framed this as reads that are "batched within the read but never across reads", with each write step one
process. Source corrects both halves, and two throwaway prototypes measured what correcting them is worth. Together
they set this unit's scope:

- **Read and write calls already share a reader.** `createRefReadCoordinator` (`read-operation.ts`) opens a
  `GitBatchReadScope` for each `read`, `list`, `lookup`, `write`, and `batch` call, and `readBatchObjects` sends its
  `cat-file --batch` through that scope, so one call reuses one native reader. The calls without one are `pull`, `push`,
  and `maintain`, which `createRefBackend` runs under `operations.maintenance` with the bare context; `history`,
  `changes`, and `version`, which `refReadOperations` calls directly; and `runRefBackendMigrate` and
  `runRefBackendRemote`, which pass a fresh `createRefBackendContext`. There every `readBatchObjects` call starts its own
  `cat-file --batch`. The two commands also call public methods on a second backend instance they construct with
  `createRefBackend(ports)`, whose coordinator is its own: `store.push()` in `import/finish.ts`, `store.version()` in
  `buildLayoutMove`, `store.read` and `store.list` in `import/occupied.ts`. The largest `cat-file` callers measured are
  `namespace-health.ts` (4,957), `sync-merge.ts` (3,468), `lineage-resolution.ts` (3,211), and `push-families.ts`
  (2,414); the attribution stops at the first store frame, so it does not split them by entry call.
- **Tips are listed about once per call.** A read lists them once (`readBoundRecord` → `readRefTips`). A write lists them
  before its lock in `codeHoldsState`, which hands the capture to `resolveRefWrites` through `captured`; again under the
  lock in `commitLockedRefBatch`; and again inside the publication boundary in `refAdmissionBasisChanged`. The last two
  are exactness checks the compare-and-swap relies on. When the store already has its own directory,
  `writeRefRepository` selects it before `codeHoldsState` runs, so only resolution lists tips. Within one call there is
  no tip listing left to share.
- **Configuration is read again and again, within calls and across them.** Measured sources: `readRefDesignation`
  (`designation.ts`, `config --null --list --includes`, 10,482); `effective-transport.ts` (22,231, part of it because
  `urlRewrites` is read again for each candidate in `selectLiteralTransport` and `readRemoteTransports`); `arc.identity`
  reads in `lib/git/identity.ts` (4,129); `fetch-completeness.ts` (3,160); `backing-configuration.ts` (1,141); and
  `comparison-witness.ts` (624). Stack attribution counted 4.5–5.4k identical reads within one call, but it loses
  callers across unawaited promises; the first prototype removed about 13,000 `config` and `remote` starts within calls
  in four files alone. Identity is resolved through the store's identity port over its own executor, and
  `withOperationIdentity` (`operation-identity.ts`) already memoizes it for each backend public call; the migrate and
  remote command contexts do not apply it.
- **Tree enumeration is one process per `readRefTrees` call.** `enumerateTrees` lists every requested tree with one
  `diff-tree --stdin`; `readRefTrees` has 46 call sites in 36 files, and only `writeEvidence.trees`, which write and
  sync attempts create, keeps listings within a call. Its output is not length-framed, so it cannot join the shared
  reader as it is.
- **Writes are already batched within each step.** `flushRefBlobStage` writes a step's staged blobs with one
  `hash-object -w --no-filters --stdin-paths`, `writeObjectTrees` writes a tree and its subtrees with one
  `mktree --batch`, and `updateRefTransaction` publishes with one `update-ref --stdin`. What remains per changed ref is
  in `prepareRefCommits`: one `mktree --batch` (`writeRefTree`) and one `commit-tree` (`commitRefTreeOid`).

**Where shared state can go stale.** Today every `pull` and `push` read and every configuration lookup is a fresh
process, so nothing it learned outlives it. A reader or a remembered answer that spans a call meets these events:

- _Fetch and maintenance._ `maintainBoundStore` runs `git maintenance run --auto`, and every store fetch can trigger it:
  the fetches `refFetchArgs` builds (`runRefFetch`, `runProjectFetch`, `runMigrationFetch`) and `fetchLayoutObjects`
  all leave `--no-auto-maintenance` out. `a5b94f81d` drains read calls' readers before it ("drain owned readers before
  explicit or fetch-triggered maintenance"), because open pack handles stop pack deletion on Windows.
- _Configuration writes._ Twenty writers in eight files plus two `git init --bare` (`createStoreDirectory`,
  `buildLayoutMove`): `git config` role and URL writes, and `remote add`, `set-url`, and `remove`. Most run from the
  checkout root with no `--git-dir`, while `repositoryConfig` reads `--git-dir=<commonDir>`; a linked worktree's local
  configuration is the common directory's `config` file, so a write through one changes what the other reads.
  `admitAutomaticDesignation` writes a role and reads the designation again under the same lock; `remote-setting.ts`
  reads it again after `moveRefLayout` releases its lock.
- _Locks and keeper leases._ Twelve direct `context.lock` calls and six `withRefLocks` callers, all through the
  context's lock port: sync paths pass `context.lock` on as `options.lock`, keeper leases are ref locks
  (`withRefFetchKeepers`), and `prepareRefCopy` passes a no-op lock under the move's layout lock. Writes and merges carry
  their reader and evidence across their locks (`executeRefBatch` creates `writeEvidence` before `withRefLocks`,
  `mergeCapturedSyncRef` carries its context in). Only `sync-withdraw-commit.ts` starts fresh under its lock ("Prior
  reads may retain objects that disappeared before the lock was acquired"). `withComparisonWitness` and
  `admitAutomaticDesignation` read designation and transport again under a lock to see a writer that changed them.
- _Directory renames and removals._ A layout move builds a bare repository at `arc/store-migrate-build` under the common
  directory, reads it through `prepareRefCopy`, and renames it into place at `arc/store` (`buildLayoutMove`,
  `switchLayout`), or sets the store aside at `arc/store-migrate-old`; `deleteLayoutSource` and `cleanUnrecordedLayout`
  remove those directories. Other directories come and go inside ordinary calls: `flushRefBlobStage` creates and
  removes an `object-stage-*` directory in every commit step that stages blobs, and `createStoreDirectory` renames a new
  store into place and removes its `store-init-*` temporary.
- _Restarts._ A call starts again when it finds that another process changed what it bound. `pull.ts`, `push.ts`, and
  `write.ts` restart when a thrown error names a store directory that has vanished (`storeDirectoryVanished`), and read
  calls, `history`, `changes`, `version`, and `maintain` also check after success (`restartOnVanishedStore`), since a
  reader can return what the departing copy held. A commit step that finds the layout moved returns `layout-changed`
  (`commitRefStep`); `mergeCapturedSyncRef` maps that and a lost race to `restart`, and `pullRefStoreOnce` then resolves
  designation again outside any lock. `executeRefBatch` starts a write again on a changed layout or basis, and
  `publishRefStore` retries a lost race.
- _Missing answers from a departed store._ A per-read `cat-file` fails on a missing `--git-dir`; a reader started
  before the move can instead answer that an object is missing, for any query shape. `readRefTrees` peels each tip
  through the reader (`${tip}^{tree}`) and drops a ref whose tree is missing, which `checkRefTip` and `refRecordAbsence`
  report as a corrupt namespace, as `mergeCapturedSyncRef` does for a missing endpoint.
- _Absence._ Only `isUnavailableGraphFailure` confirms a missing object with a fresh reader and no retained evidence.

**Prototype evidence.** Both prototypes were throwaway patches measured with the analysis's attribution preload against
its attribution logs (the timing run's table counts `withdraw-entry-inverse` at 47,612 instead). The first (at
`f0606e2db`) gave `pull`, `push`, `maintain`, `history`, `changes`, `version`, and the two commands a per-call reader and
remembered every configuration-only invocation, with no refresh rules. The second (at `10d222dd6`) implements D1–D6,
with three of D3's rows in an earlier form described after the table.

| File                     |  Before | First prototype | Change | Second prototype | Change | Tests   |
| ------------------------ | ------: | --------------: | -----: | ---------------: | -----: | ------- |
| `conformance-sync`       |  29,037 |          22,634 |   −22% |           24,959 |   −14% | 139/139 |
| `withdraw-entry-inverse` |  47,849 |          35,655 |   −26% |           38,495 |   −20% | 92/92   |
| `cleanup-report`         |  18,320 |          13,449 |   −27% |           13,791 |   −25% | 30/30   |
| `follow-restart`         |  24,642 |          18,167 |   −26% |           18,741 |   −24% | 29/29   |
| `conformance-reads`      |  18,690 |          17,037 |    −9% |           17,172 |    −8% | 526 ✓   |
| All five                 | 138,538 |         106,942 |   −23% |          113,158 |   −18% |         |

`conformance-reads` skipped its other 32 cases on this platform in both runs. The second prototype closed readers and
dropped lookups at every directory removal, the blob stage in each commit step included, where D3 now governs only the
store's own directories; it dropped lookups only at vanished-store restarts, where D3 now drops them at every restart,
which are rare; and it confirmed a missing bare object ID with a fresh reader, where D3 now checks the store directory
without a process. So −18% understates D3 as drafted. D3 costs the second prototype about five points against the first.
Closing readers at fetches, nested calls, and renames adds up to about 500 `cat-file` starts per file, and lookups read
Git again under each newly taken lock: `conformance-sync` keeps 1,831 designation reads against the first prototype's
958. An earlier form of D3, which read Git for every lookup while any lock was held, measured −12.5% over the five
files: transport is resolved inside each fetch's keeper lease, so it never reused an answer. What remains in the
sync-heavy files after the first prototype is led by `for-each-ref` (about 42%); two-thirds of those listings have
`readSyncRefs`' shape (`--format=%(refname) %(objectname)`, which `updateRefTransaction`'s post-update check shares),
both exact by design.

## Direction

Numbered for the spec to inherit.

- **D1 — One operation is one public store call.** Each call stays a fresh view of current state. A caller that needs
  one consistent view across calls already has it: `version()` captures a state anchor and `asOf` reads resolve against
  it (`readSnapshotRecord`, `listSnapshotRecords`). A public call a command makes on its second backend instance is its
  own operation, with its own scope from that instance's coordinator. Settled with the Owner, 2026-10-29.
- **D2 — Every public call holds an operation-owned scope.** The scope holds the call's reader and its remembered
  configuration lookups. `pull`, `push`, `maintain`, `history`, `changes`, `version`, and the migrate and remote commands
  gain the scope the coordinator already gives `read` and `write`; the command contexts also gain
  `withOperationIdentity`, so a command resolves identity once. The coordinator opens a scope only when the context
  carries none, so a scope owned above one call can later supply it without reworking this unit (§ Scope boundary). The
  scope binds the context's ports — its three executors, its filesystem, and its lock — so D3's port events reach it
  from every call site. Its other events are control flow, not port calls: a command's nested calls reach a second
  backend instance built from the raw ports, and restarts are loops inside the calls. D3 names where each is hooked.
- **D3 — The scope refreshes at the events that can make its state stale.**

  | Event                                                                                                                                                 | Hooked at                                                                                                    | Readers                                                                                | Remembered lookups                                                |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
  | A `fetch`, `maintenance`, or `gc` invocation                                                                                                          | the bound executors                                                                                          | closed before it; the next read reopens                                                | kept                                                              |
  | A configuration change: `config` without `--get`, `--get-all`, `--get-regexp`, or `--list`; `remote` other than listing, `get-url`, or `show`; `init` | the bound executors                                                                                          | kept                                                                                   | dropped after it, whatever its outcome                            |
  | Renaming to or from, or removing, `arc/store`, `arc/store-migrate-build`, or `arc/store-migrate-old` under the common directory                       | the bound filesystem, by path                                                                                | closed before it                                                                       | dropped                                                           |
  | Work while any lock or keeper lease is held                                                                                                           | the bound lock                                                                                               | kept, under each site's existing rule                                                  | only answers read since the newest held lock was taken are served |
  | A command's nested public call                                                                                                                        | the `Store` that `runRefBackendMigrate` and `runRefBackendRemote` hand to `runRefMigrate` and `runRefRemote` | closed before it                                                                       | dropped after it                                                  |
  | A restart that resolves the operation again                                                                                                           | `pullRefStoreOnce`'s restart, `publishRefStore`'s retry, `executeRefBatch`'s loop, `restartOnVanishedStore`  | closed before it                                                                       | dropped                                                           |
  | A reader bound to a separate store answers that an object is missing                                                                                  | `readBatchObjects`                                                                                           | its store directory is checked; if gone, the call fails as a per-read `cat-file` would | —                                                                 |

  A configuration change drops every remembered lookup whether it succeeds, fails, or is cancelled: a cancelled write
  can still have landed, as `admitAutomaticDesignation`'s timeout remedy says ("its automatic role setting may already
  have completed").

  The bound executors classify an invocation by its subcommand: the first argument after Git's leading options, where
  `-c` also takes the argument after it. Store code puts options first: `-c` pairs from `gitRefLockArgs` and
  `refFetchArgs` before every store fetch, and from the commit identity before `commit-tree`; `--git-dir=<path>` from
  `bindRefRepository` and `repositoryConfig`; and `--no-replace-objects`. Reading the first argument alone, as
  `classifyExpectedOutcome` does, would miss every store fetch and every configuration write to a separate store.

  A lock or lease can guard configuration: backing's URL changes under that remote's keeper lease
  (`repointBackingRemote` and `configureBackingRemote` run inside `withRefFetchKeepers` in `source-switch.ts` and
  `migrate-remote-switch.ts`). So an answer remembered before a lock was taken is not served under it: the first lookup
  under it reads Git, and repeats under the same hold reuse that answer — `urlRewrites` alone is read several times
  within one `refFetchTarget`. After the lock is released, the fresher answer stays remembered.

  Objects keep each site's existing lock rule. A reader may cross a lock where the locked work re-checks the tips it
  builds on, as `executeRefBatch` and `mergeCapturedSyncRef` already do; `sync-withdraw-commit.ts` still starts fresh,
  since its basis can become unreachable. Publication stays guarded: `commitRefStep` re-checks the layout under the
  layout lock, so an answer from a departed store cannot publish.

  Only directories a reader can be bound to are governed. The `object-stage-*` directory `flushRefBlobStage` removes in
  each commit step and the `store-init-*` temporary `createStoreDirectory` removes hold no repository a reader reads, so
  neither refreshes the scope.

  A restart is where a call acts on another process's change. After a commit step returns `layout-changed`,
  `pullRefStoreOnce` resolves designation again outside any lock, and the move that caused it may have rewritten roles
  (`setLayoutRole`); today that resolution reads Git. So every restart closes the call's readers and drops what it
  remembered, and the restarted attempt reads as the per-call reads it replaces would.

  A reader that outlived its store directory answers `missing` where a per-read `cat-file` would fail on the departed
  `--git-dir`, and it can do so for any query shape: a bare object ID, a peeled `${tip}^{tree}`, or a `<tip>:<path>`
  whose tip is gone. So on any `missing` answer from a reader bound to a separate store, `readBatchObjects` checks the
  bound directory with `storeDirectoryVanished`, a filesystem check that starts no process. If the directory is gone,
  it raises an error naming it in the form `storeDirectoryVanished` already recognizes, so the call meets the failure a
  per-read `cat-file` raises today and takes the same restart. If the directory is there, the answer stands: an ordinary
  not-found read costs one filesystem check and keeps its single read, and `isUnavailableGraphFailure` keeps its own
  fresh confirmation. A reader bound to the code repository needs no check, since that directory never departs.
- **D4 — A scope yields to maintenance; it never blocks it.** `operations.maintenance` waits for every active read
  call before it starts. A sync call holding its own reader closes it at the maintenance point (D3) rather than
  holding it across, so no call waits on itself. A command closes its readers before each nested public call, so the
  second instance's maintenance never meets them. A scope owned above one call inherits the same rule.
- **D5 — Fault reporting is unchanged.** A failed exchange makes `GitBatchReadScope.run` drop that reader and rethrow the
  `GitProcessError` the per-call executor would raise (cancellation with `descendantsUnconfirmed`, nonzero exit, output
  limit). `GitBatchOutput.read` bounds each exchange on its own, so `readBatchObjects`' output-limit split behaves as
  before. No refusal kind or remedy changes here; `storage-ref-hardening`'s missing-object classes land on this path.
- **D6 — A call answers each configuration lookup once until something can change it.** The scope remembers the parsed
  answers of the lookup functions, not raw invocations: `repositoryConfig` (designation), `configOutput` and so
  `urlRewrites`, the `remote get-url` reads in `readRemoteTransports` and `readNamedTransport`, the remote listing in
  `selectLiteralTransport`, `resolveLiteral`'s `ls-remote --get-url` and `remote show -n`, and the configuration list
  in `fetch-completeness.ts`. A key is the function, its arguments, and the repository the context is bound to. An
  answer is what the function returns, `configOutput`'s empty answer for a completed exit 1 included; a thrown error is
  never remembered, so a cancelled, timed-out, or failed lookup runs again. Invalidation is D3's: any configuration
  change in the call drops every remembered lookup, whatever its outcome and whichever repository it wrote, so a write
  through the checkout root and a read of the common directory never disagree; every restart drops them too; and under
  a lock or lease, only answers read since it was taken are served.

## Alternatives

- **Operation boundary.**
    - _One public call (chosen, D1)._ No contract change; the coordinator's existing unit.
    - _A scope above one call._ What repeats across calls survives D2 and D6: in the first prototype's four sync-heavy
      files, configuration and remote lookups are still 16% of processes and `cat-file` starts 5%, about as much again
      as this unit removes. Objects and listed trees are addressed by object ID, so sharing them across calls needs only
      D3's lifetime rules; tips are already shareable through `version()` and `asOf`; configuration would need a rule
      for noticing another writer between calls. It could be owned by the backend instance, which needs no caller change
      and so reaches the store suites, or held by callers through a contract handle, which reaches only callers that
      adopt it. Deferred to a follow-on work unit built on D2–D4.
- **When state refreshes.**
    - _At the events that can make it stale (chosen, D3)._ Each site keeps its existing object rule, and configuration
      reads Git again once under each newly taken lock.
    - _Read Git for every lookup while a lock is held._ Equally safe, since repeats under one hold see the same guarded
      configuration, but it never reuses transport answers, which are resolved inside each fetch's keeper lease:
      measured −12.5% over the five files against the chosen rule's −18%. Not taken.
    - _Drop every remembered lookup whenever a lock or lease is taken._ Simpler to state, but a sync call takes ref
      locks for each merged ref and the layout lock for each commit step, so every lookup between them would read Git
      again; the chosen rule keeps an answer for use outside the lock. Not measured; not taken.
    - _Drop everything at every lock and structural event._ Simpler to state, but it fires at every keeper lease, merged
      ref, and commit step, and gives back an unmeasured share of the saving. Not taken.
- **Readers across a fetch.**
    - _Close before each fetch and reopen after (chosen, D3)._ Matches the existing drain; costs one reader start per
      fetch.
    - _Pass `--no-auto-maintenance` to store fetches._ Lets a reader live across a fetch, but moves the repository's
      automatic maintenance off store fetches onto `maintain` alone — a change to repository behavior, not to process
      cost. Not taken.
- **Where configuration answers are remembered.**
    - _At the lookup functions, as parsed answers (chosen, D6)._ The functions already turn exit codes and locale-bound
      output into answers, so the key needs no output options and no list of which failures count.
    - _At the executor, by exact arguments._ Reaches every configuration-only invocation, but must classify which
      completed failures are answers, key on every output option, and tell the checkout root and the common directory
      apart. Not taken.
    - _Pass designation and rewrites along the call path_, as `RefDesignationResolution` already flows into
      `pullRefStore`. Reaches only the paths it is threaded through and changes their signatures; remembered lookups
      reach every caller through the context. Not taken.
- **Tree enumeration.**
    - _Keep `diff-tree --stdin` (chosen)._ One process per `readRefTrees` call, about 5% of the measured total.
    - _Keep listed trees within a call._ Trees are addressed by object ID, so the scope could keep listings as
      `writeEvidence.trees` already does for write and sync attempts. Bounded by the same 5%; not taken.
    - _Walk trees through the shared reader._ Read tree objects with `cat-file --batch` and parse them in-process, level
      by level. It must keep `enumerateTrees`' contract: a ref with any traversed tree missing reads as unreadable, a
      missing root object raises the repository's error, and names Git admits but UTF-8 cannot decode keep
      `invalidName` and `rawPath`. That is the missing-object surface `storage-ref-hardening` reclassifies, and the
      largest change in the set. Deferred: the after-measurement decides whether `diff-tree` earns its own work.
- **Cheaper process starts instead of fewer.** A spawn blocks the test worker for 3.2–3.8 ms against about 1.2 ms
  from a bare Node process, because libuv forks the caller and a larger resident heap costs more to fork: a bare
  process with a 500 MB V8 heap blocks for about 2.1 ms. But end to end, a short Git call took 3.9–4.3 ms whether
  spawned directly from a 5 MB or a 500 MB process or relayed through a small helper process (2026-10-29, 300 calls
  per case, two rounds): the caller waits for Git to start either way. Spawning from a helper would add a long-lived
  process and a relay to the shared Git executor for no measurable gain. Not taken; the lever is the number of
  processes.
- **Writes.**
    - _Leave as they are (chosen)._ Each write step already uses one process per kind of object.
    - _Write a commit step's trees in one process._ Saves processes only when one step changes several refs, which
      nothing measured shows to be common; a single-record write changes one ref. Not taken.
    - _Hash commit objects in-process and write them in one process._ This would reproduce Git's identity, date, and
      environment handling for author and committer, risk out of proportion to its share. Not taken.

## Unknowns and Assumptions

- **A long-lived reader sees objects written after it started.** Assumed: `cat-file --batch` finds new loose objects by
  path and rescans packs on a miss, so a reader still reads objects its own call wrote after opening it. D3 closes the
  reader around maintenance and fetches anyway. Verify with a case that writes, then reads the new object through the
  same reader.
- **Configuration staleness outside locks is acceptable.** Two identical lookups in one call today can see another
  process's configuration write between them; with D6 the second sees the first's value. Under a lock or lease every
  lookup is fresh as of that lock, and a restart drops every remembered lookup (D3), so a call still sees another
  process's change wherever it holds one or restarts. One unlocked check exists: `checkedPushTarget` re-reads
  designation after `capturePushListing` releases its locks, and again as `admit`'s first check, and retries the push
  when it changed. With D6 both reads repeat the attempt's answer. The push still detects the change one step later:
  `captureComparisonWitness` re-reads designation under the layout lock and keeper lease (`readComparisonSource`), which
  refreshes the same `repositoryConfig` lookup, so `admit`'s second check compares against the fresher answer, and
  `publicationTargetMatches` re-reads push transport under that lock. The spec keeps that as an invariant: push's
  admission re-reads designation and transport under the comparison lock. Confirm any other reader of a remembered
  lookup during spec grounding.
- **Automatic maintenance finishes before a fetch returns on Windows.** D3 reopens a reader right after a fetch, which
  is safe only if the maintenance the fetch may trigger has finished. No store fetch passes `--no-auto-maintenance` or
  sets a detach option; on Windows Git cannot detach that maintenance, so it runs in the foreground, and on POSIX an
  open handle does not stop a pack's deletion. Assumed, as the existing drain before maintenance already assumes it. No
  store suite is shown to exercise it: the test helpers set `gc.auto 0` in the code repositories and clones they create
  (`temp-repo.ts`, `multi-clone.ts`), and a separate store, created by `git init --bare` under an empty system and
  global configuration, keeps Git's default thresholds, which no suite is shown to reach. Verify with a Windows
  portability case that makes maintenance due in the repository the fetch writes — the store, in the separate layout —
  as `verify-integrity.test.ts` does with `gc.auto 1` and `gc.autoPackLimit 1`, while the call holds a reader.
- **A remembered answer can outlast the call's deadline.** A lookup served from the scope starts no process, so it
  passes a sync deadline that has expired; the call's next Git process still refuses with the deadline's error.
  Assumed harmless.
- **Another process's layout move can meet a reader.** D3 closes the call's own readers before its renames, but a
  `pull` or `push` now holds a reader for most of its call, as read and write calls already do. On Windows another
  process's rename can then meet open handles. Assumed recoverable: the failed move keeps its record, and the next run
  finishes the recorded direction (`commands.ts` resumes it through `moveRefLayout`). Confirm in spec grounding.
- **The suite-wide share is an estimate.** The prototypes measured five files; the other store files' mix of sync and
  read calls is unmeasured, so the suite-wide reduction — about 12–16% of processes, roughly 2 minutes off a four-shard
  store job — rests on the slowest files standing in for the rest. The minutes also rest on the analysis's 86% process
  share of case time, which it calls an upper bound, since concurrent calls count twice.

## Scope boundary (Won't Do)

- **No change to the store contract, and nothing shared across calls.** A scope above one call is the follow-on
  above, built on D2–D4.
- **`readSyncRefs` stays exact.** `sync-graph.ts` (19.9% of processes) captures the ref set fresh at each
  reconciliation step, which reconciliation's correctness relies on.
- **Tree enumeration and writes** stay as they are (§ Alternatives).
- **`store/in-repo/` per-read branch scans** retire at the cutover.
- **Test assertions and fixtures** (10.6%) stay as they are.
- **Refusal classification** for missing or misplaced objects is `storage-ref-hardening`'s.

## Decisions

- **Boundary — stays one work unit.** One concern: the Git processes one ref-store call starts for object and
  configuration reads, and the rules that keep what it shares current. The forecast is a few hundred lines of source
  and tests across about twenty files, far below this project's size marks.
- **`Class: Heavy`.** Raised from `Light` after the independent review: the lifetime rules had to be designed against
  an intricate existing surface — locks within locks, a second backend instance inside commands, layout moves, store
  restarts — that a correct plan and execution must navigate. The design still composes existing patterns (the reader
  scope, the maintenance drain, the per-site refresh rules, `withOperationIdentity`), so not `Novel`.
- **Sequencing.** A member of `state-storage`, landing before `storage-ref-hardening`'s implementation. The two touch
  some of the same files (`push.ts`, `fetch.ts`, `read.ts`, `repository.ts`, `designation-first.ts`,
  `migrate-remote-copy.ts`) and two of its items meet D3: whether the keeper lock stays held across the fetch, which
  moves where D3's fetch and lock events fall, and one missing-object classification every read shares, which sits on
  D3's missing-answer check. D5 leaves the refusal surface hardening reclassifies untouched. The ordering is recorded in
  `cohort-state-storage.md` at this draft's capture, and hardening's notes carry it as a `Depends On` edge for that unit
  to take, with the invariant its keeper decision must keep: transport and designation lookups stay fresh under
  whatever lease replaces the keeper lock.
- **Priority P1.** Every store-touching change in the storage program pays the store suites' CI time, about 24 minutes
  a run against 8 before them; this unit takes roughly 2 minutes of it, and the follow-on builds on its scope.

## Signal

- **Behavior.** The store suites pass unchanged, and each D3 row has a case that fails without its refresh: on Windows,
  a fetch that finds maintenance due in the repository it writes while the call holds a reader; a configuration write
  through a context bound to the separate store, and a cancelled one, followed by the same lookup; on Windows, the
  command's own layout move in each direction, which renames a directory its reader was reading, followed by a read
  after the rename; a lookup under a newly taken lock after another process changed it; a command's nested public call,
  a push that makes the first automatic role assignment, after which a lookup the command makes sees the new role;
  another process's layout move that carries a role setting, during a pull and during a push, both its `layout-changed`
  restart and its vanished-store restart; and a missing answer from a reader whose store directory departed. Where a row
  both closes readers and drops lookups (the directory, nested-call, and restart rows), its case checks both in the
  recorded process trace: the reader exits before the event, and the first configuration lookup after it starts a Git
  process.
- **Cost.** Re-run the analysis's attribution method on the same ten store files, before at this unit's merge base and
  after at its head, and state per file the process counts by subcommand and the case time. For the five files the
  prototypes measured, expect the second prototype's result or better: 14–25% fewer processes in `conformance-sync`,
  `withdraw-entry-inverse`, `cleanup-report`, and `follow-restart`, and under a tenth fewer in `conformance-reads`,
  with `cat-file`, `config`, `remote`, and `ls-remote` carrying the drop. The other five are reported without an
  expectation; the import files among them are dominated by `store/in-repo/` scans this unit leaves alone. A shortfall
  is read from the per-subcommand split — reader starts against configuration lookups — not assumed to be a call left
  without its scope.

## Continuity

- **Readiness:** formalization-ready — the second review loop converged at its second pass, whose three minor gaps (how
  the executors find a subcommand, push's unlocked target check, which refresh each Signal case observes) are folded;
  its first pass's three under-specified D3 rows and five smaller gaps, and the fix check's two, were folded before it.
- **Resolved (Owner, 2026-10-29):** D1; readers close around fetches; tree enumeration and writes left out; cheaper
  process starts rejected on measurement; the scope above one call deferred to a follow-on; the configuration Errand
  folded in; priority P1 and cohort placement; after the first review, the return to shaping, `Class: Heavy`,
  event-driven refresh (D3), and lookup-level remembering (D6); after the second prototype, the per-acquisition lock
  rule; after the second loop's first pass, refresh at every restart, the directory event scoped to the store's own
  directories, and a missing answer checked against its store directory instead of confirmed by a fresh reader.
- **Open:** none beyond the assumptions above.
- **Next:** the capture, then `create-spec`.
