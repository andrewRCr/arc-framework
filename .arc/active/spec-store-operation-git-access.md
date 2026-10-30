# Spec (`detailed` · `RFC`): store-operation-git-access

- **Origin:** [internal] — the store-suite process-cost measurement of 2026-10-29 at `f663af671`, recorded in
  `analysis-test-suite-cost-baseline.md` § Store-suite process cost, and a measurement of repeated configuration and
  remote-transport lookups within one ref-store call.

- **Purpose:** Start fewer Git processes per ref-store call. Every public store call holds one operation scope that
  shares an object reader and remembers configuration lookups, and the scope refreshes at each event that can make what
  it holds stale. No call changes what it returns, how it publishes, or which refusal it reports; what a call observes
  changes only where another process writes configuration while the call holds no lock (§ 7.5).

---

## Introduction / Context

The ref backend's cost is its own process volume. Measured at `f663af671` on 2026-10-29, child processes account for
about 86% of case time in the ten slowest store files. That share is an upper bound, since concurrent calls count twice.
Each spawn blocks the test worker for a median 3.2 ms before Git runs for about 2 ms. On CI run `40928051907` the same
day, the 319 store files that ran took 197.9 minutes of file time across four shards. Since then `main` spreads the
store suites over six shards (`9c3616655`), which shortens each job but leaves the total unchanged. The same per-call
cost slows every store command outside tests.

Across the nine files the analysis attributes, `batch-read.ts` starts 23.5% of 224,996 Git processes: 25,581
`cat-file`, 15,629 `for-each-ref`, and 11,761 `diff-tree`. Configuration and remote lookups start about 19%, the
write plumbing about 16%, and `sync-graph.ts`'s reconciliation listings 19.9%.

### What one call already shares

- **Read and write calls share a reader.** `createRefReadCoordinator` (`read-operation.ts`) opens a `GitBatchReadScope`
  (`lib/git/batch-reader.ts`) for each `read`, `list`, `lookup`, `write`, and `batch` call. `readBatchObjects` sends
  its `cat-file --batch` through that scope, which the raw executor routes to one native reader per repository
  (`process-executor.ts`). The calls without one are `pull`, `push`, and `maintain`, which `createRefBackend` runs
  under the coordinator's `maintenance` with the bare context; `history`, `changes`, and `version`, which
  `refReadOperations` calls directly; and `runRefBackendMigrate` and `runRefBackendRemote`, which each pass a fresh
  `createRefBackendContext`. Each of their `readBatchObjects` calls starts its own `cat-file --batch`. The two commands
  also call public methods on a second backend instance they build with `createRefBackend(ports)`, whose coordinator is
  its own: `store.push()` in `import/finish.ts`, `store.version()` in `buildLayoutMove`, and `store.read` and
  `store.list` in `import/occupied.ts`.
- **Tips are listed about once per call.** A read lists them once (`readRefTips`). A write lists them before its lock
  in `codeHoldsState`, which hands the capture to resolution through `captured`; again under the lock in
  `commitLockedRefBatch`; and again inside the publication boundary in `refAdmissionBasisChanged`. The last two are the
  exactness checks the compare-and-swap relies on. No tip listing within one call is left to share.
- **Writes are batched within each step.** `flushRefBlobStage` writes a step's staged blobs with one `hash-object -w
  --no-filters --stdin-paths`, `writeObjectTrees` writes a tree and its subtrees with one `mktree --batch`, and
  `updateRefTransaction` publishes with one `update-ref --stdin`. What remains per changed ref is one `mktree --batch`
  (`writeRefTree`) and one `commit-tree` (`commitRefTreeOid`) in `prepareRefCommits`.
- **Trees are enumerated once per `readRefTrees` call.** `enumerateTrees` lists every requested tree with one `diff-tree
  --stdin`. `readRefTrees` has 46 call sites in 36 files, and only `writeEvidence.trees`, which write and sync attempts
  create, keeps listings within a call.

### What repeats

Configuration is read again and again, within calls and across them. The measured sources are `readRefDesignation`
(`designation.ts`, `config --null --list --includes`, 10,482 processes); `effective-transport.ts` (22,231, partly
because `urlRewrites` is read again for each candidate `selectLiteralTransport` resolves through `resolveLiteral`, and
once more in each call of `effectiveTransportCandidates` and `validateNamedTransport`, whose `configOutput` read repeats
for each setting it checks); `arc.identity` reads in `lib/git/identity.ts` (4,129); `fetch-completeness.ts` (3,160);
`backing-configuration.ts` (1,141); and `comparison-witness.ts` (624). Identity resolves through the store's identity
port over its own executor. `withOperationIdentity` (`operation-identity.ts`) memoizes it for each backend public call,
but the migrate and remote command contexts do not apply it.

### Where shared state can go stale

Today every object read outside the coordinator's calls and every configuration lookup is a fresh process, so nothing
learned outlives it. A reader or a remembered answer that spans a call meets these events:

- **Fetch and maintenance.** `maintainBoundStore` runs `git maintenance run --auto`, and every store fetch can trigger
  it: the fetches `refFetchArgs` builds (run by `runRefFetch`, `runProjectFetch`, and `runMigrationFetch`) and
  `fetchLayoutObjects` all leave `--no-auto-maintenance` out. The coordinator's `maintenance` already drains read
  calls' readers before explicit maintenance.
- **Configuration writes.** Twenty writers in eight files: `git config` role and URL writes in
  `backing-configuration.ts`, `migrate-layout.ts`, `migrate-remote-switch.ts`, `migrate-switch-undo.ts`,
  `source-switch.ts`, `follow-due.ts`, and `designation-first.ts`, and `remote add`, `set-url`, and `remove` in
  `backing-configuration.ts`, `designation-first.ts`, `remote-setting.ts`, and `migrate-remote-switch.ts`. Two more
  processes create a repository's configuration with `git init --bare` (`createStoreDirectory`, `buildLayoutMove`).
  Most writers run from the checkout root with no `--git-dir`, while `repositoryConfig` reads
  `--git-dir=<commonDir>`. A linked worktree's local configuration is the common directory's `config` file, so a write
  through one changes what the other reads.
- **Locks and keeper leases.** Every lock is taken through the context's `lock` port: twelve direct calls and the sorted
  acquisitions in `withRefLocks`, which include the keeper leases `withRefFetchKeepers` (`fetch-seen.ts`) takes as ref
  locks. Sync paths pass `context.lock` on as `options.lock`, `bindDeadline` (`sync-deadline.ts`) wraps it with the
  deadline's wait bound, and `prepareRefCopy` passes a no-op lock under the move's layout lock. Writes carry their
  reader and evidence across their locks: `executeRefBatch` creates `writeEvidence` before `withRefLocks`. Merges carry
  evidence: `mergeCapturedSyncRef` reads its endpoints and history quarters before `withRefLocks` and re-checks the tip
  and quarters under it, in a pull that holds no reader today. Only `sync-withdraw-commit.ts` starts fresh under its
  lock, clearing `batchReader` and `writeEvidence`. A lock can guard configuration as well as refs:
  `withComparisonWitness` and `admitAutomaticDesignation` read designation and transport again under a lock to see a
  writer that changed them, and backing's URL changes under that remote's keeper lease (`repointBackingRemote` and
  `configureBackingRemote` inside `withRefFetchKeepers`).
- **Directory renames and removals.** A layout move builds a bare repository at `arc/store-migrate-build` under the
  common Git directory, reads it through `prepareRefCopy`, and renames it into place at `arc/store` (`buildLayoutMove`,
  `switchLayout`), or sets the store aside at `arc/store-migrate-old`. `deleteLayoutSource`, `cleanUnrecordedLayout`,
  and `cleanRefusedUnrecordedLayout` remove those directories. Other directories come and go inside ordinary calls:
  `flushRefBlobStage` creates and removes an `object-stage-*` directory in every commit step that stages blobs, and
  `createStoreDirectory` renames a new store into place and removes its `store-init-*` temporary.
- **Restarts.** A call starts again when it finds that another process changed what it bound. `pull.ts`, `push.ts`,
  and `write.ts` restart when a thrown error names a store directory that has vanished (`storeDirectoryVanished`).
  Read calls, `history`, `changes`, `version`, and `maintain` also check after success (`restartOnVanishedStore`),
  since a reader can return what the departing copy held. A commit step that finds the layout moved returns
  `layout-changed` (`commitRefStep`); `mergeCapturedSyncRef` maps that and a lost race to `restart`, and
  `pullRefStoreOnce` then resolves designation again outside any lock. `executeRefBatch` starts a write again on a
  changed layout or basis, and `publishRefStore` retries a lost race.
- **Missing answers from a departed store.** A per-read `cat-file` fails on a missing `--git-dir`. A reader started
  before the store moved instead answers that an object is missing, for any query shape. `readRefTrees` peels each tip
  through the reader (`${tip}^{tree}`) and drops a ref whose tree is missing, which `checkRefTip` and
  `refRecordAbsence` report as a corrupt namespace, as `mergeCapturedSyncRef` does for a missing endpoint. Only
  `isUnavailableGraphFailure` (`history-graph.ts`) confirms a missing object with a fresh reader.

### Prototype evidence

Two throwaway prototypes were measured with the analysis's attribution preload against its attribution logs. The
first (at `f0606e2db`) gave `pull`, `push`, `maintain`, `history`, `changes`, `version`, and the two commands a
per-call reader and remembered every configuration-only invocation, with no refresh rules. The second (at `10d222dd6`)
implements this design, with three of § 4's rows in an earlier form described after the table.

| File                     |  Before | First prototype | Change | Second prototype | Change | Tests   |
| ------------------------ | ------: | --------------: | -----: | ---------------: | -----: | ------- |
| `conformance-sync`       |  29,037 |          22,634 |   −22% |           24,959 |   −14% | 139/139 |
| `withdraw-entry-inverse` |  47,849 |          35,655 |   −26% |           38,495 |   −20% | 92/92   |
| `cleanup-report`         |  18,320 |          13,449 |   −27% |           13,791 |   −25% | 30/30   |
| `follow-restart`         |  24,642 |          18,167 |   −26% |           18,741 |   −24% | 29/29   |
| `conformance-reads`      |  18,690 |          17,037 |    −9% |           17,172 |    −8% | 526 ✓   |
| All five                 | 138,538 |         106,942 |   −23% |          113,158 |   −18% |         |

The analysis's timing run counts `withdraw-entry-inverse` at 47,612; the table uses the attribution logs throughout.
`conformance-reads` skipped its other 32 cases on that platform in both runs. The second prototype closed readers and
dropped lookups at every directory removal, the blob stage in each commit step included, where § 4.5 governs only the
store's own directories. It dropped lookups only at vanished-store restarts, where § 4.7 drops them at every restart,
which are rare. And it confirmed a missing bare object ID with a fresh reader, where § 4.8 checks the store directory
without a process. So −18% understates the design.

The refresh rules cost the second prototype about five points against the first. Closing readers at fetches, nested
calls, and renames adds about 500 `cat-file` starts per file, and lookups read Git again under each newly taken lock:
`conformance-sync` keeps 1,831 designation reads against the first prototype's 958. An earlier lock rule, which read
Git for every lookup while any lock was held, measured −12.5% over the five files, since a sync fetch resolves its
transport inside its keeper lease (`refFetchTarget` within `fetchRefPatterns`), where that rule never reused an answer.
In the sync-heavy files, `for-each-ref` leads what remains after the first prototype (about 42%). Two-thirds of those
listings have `readSyncRefs`' shape (`--format=%(refname) %(objectname)`, which `updateRefTransaction`'s post-update
check shares), and both are exact by design.

## Goals

1. **Fewer processes per call.** Every public ref-store call reads objects through one shared reader per bound
   repository and answers each configuration lookup once until something can change it.
2. **Unchanged results.** Each call returns, publishes, and refuses as it does today and raises the same Git process
   errors. The one observable difference is the staleness bound of § 7.5.
3. **No stale state is served.** The scope refreshes at every event § 4 enumerates, and each event has a case that
   fails without its refresh.
4. **A measured result.** Before-and-after process counts and case times for the ten store files the analysis measured
   (§ 9.4).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No contract change, and nothing shared across calls.** `Store` (`lib/store/contract.ts`), its inputs and results,
  and the refusal vocabulary (`lib/store/refusal.ts`) stay as they are. A scope spanning several calls is separate work
  built on this one.
- **Exact listings stay exact.** `readSyncRefs` captures the ref set fresh at each reconciliation step, and
  `commitLockedRefBatch` and `refAdmissionBasisChanged` list tips again under the lock; reconciliation and the
  compare-and-swap rely on each.
- **Tree enumeration and writes stay as they are.** `enumerateTrees` keeps one `diff-tree --stdin` per `readRefTrees`
  call, and the write plumbing keeps its processes (§ Alternatives).
- **The in-repo implementation is untouched** (`lib/store/in-repo/`), its per-read branch scans included.
- **No refusal changes.** No refusal code, class, condition, or remedy changes. How a missing or misplaced object is
  classified stays as it is: a ref whose tree is missing still reads as a corrupt namespace.
- **Automatic maintenance stays where it is.** No store fetch gains `--no-auto-maintenance` or a detach option.
- **Test assertions and fixtures keep their processes** (10.6% of the measured total).
- **No change to how a process starts.** The number of processes is the lever (§ Alternatives).

## Proposed Design

### 1. Boundary and placement

#### 1.1 One work unit

One concern: the Git processes one ref-store call starts for object and configuration reads, and the rules that keep
what it shares current. It stays one work unit. Its forecast is a few hundred lines of source and tests across about
twenty files, well under this project's size marks, and it has one review surface. The derivation it needed is
realized: the lifetime rules had to be designed against an intricate surface (locks within locks, a second backend
instance inside commands, layout moves, store restarts). That puts the work at `Heavy`. It is not `Novel`, since the
design composes existing patterns: the reader scope, the maintenance drain, the per-site lock rules, and
`withOperationIdentity`.

#### 1.2 Placement

The scope, its port wrapping, the invocation classifier (§ 4.1), and the remembered-lookup helper (§ 7) live in one new
module under `lib/store/ref/`. `GitBatchReadScope` gains a mid-call close (§ 3.1). The lookup functions of § 7.1 route
their reads through the helper. `createRefReadCoordinator`, `createRefBackend`, `refReadOperations`,
`runRefBackendMigrate`, `runRefBackendRemote`, the restart sites of § 4.7, and `readBatchObjects` (§ 4.8) change to open
or refresh the scope. No source outside `lib/store/ref/` and `lib/git/batch-reader.ts` changes.

### 2. The operation (D1)

One operation is one public store call. That means `read`, `list`, `lookup`, `write`, `batch`, `history`, `changes`,
`version`, `pull`, `push`, or `maintain` on a backend `createRefBackend` or `createRefReadSourceBackend` returns, or one
run of the migrate or remote command (`runRefBackendMigrate`, `runRefBackendRemote`). Each call stays a fresh view of
current state. A caller that needs one consistent view across calls already has it: `version()` captures a state
anchor, and `asOf` reads resolve against it (`readSnapshotRecord`, `listSnapshotRecords`).

A public call a command makes on its second backend instance is its own operation, with its own scope from that
instance's coordinator (§ 4.6). `runRefBackendConflict` builds no context of its own, so each store call it makes is its
own operation, as today.

### 3. The operation scope (D2)

#### 3.1 What it holds

- **The call's object readers.** One `GitBatchReadScope`, supplied to `readBatchObjects` through the context's
  `batchReader` field as the coordinator supplies it today. It keeps one native reader per bound repository.
- **The call's remembered configuration answers** (§ 7).
- **Its lock bookkeeping.** The order in which the call took its locks and leases, and which it still holds (§ 4.4).

Closing the readers mid-call, at the events of § 4, ends every reader child and waits for it to exit, so its pack
handles are released before the event. The scope stays usable: the next read starts a fresh reader. A close failure
propagates as the call's failure, as it does when a read call's reader closes today. A reader's nonzero exit is the
failure a per-read `cat-file` would have raised on that read. Closing the scope when the call ends is final, as
`GitBatchReadScope.close` is today.

#### 3.2 Which calls open one

| Call                                                | Today                                               | With this design                                                        |
| --------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `read`, `list`, `lookup`, `write`, `batch`          | the coordinator's `read` opens a reader             | the coordinator's `read` opens the scope                                |
| `history`, `changes`, `version`                     | called directly, no reader                          | run through the coordinator's `read`, which opens the scope             |
| `pull`, `push`, `maintain`                          | the coordinator's `maintenance`, bare context       | the scope opens inside the coordinator's `maintenance`                  |
| Each read operation of `createRefReadSourceBackend` | as the first two rows, on its own coordinator       | as the first two rows, on its own coordinator                           |
| `runRefBackendMigrate`, `runRefBackendRemote`       | a fresh `createRefBackendContext`, no identity memo | the command's context opens a scope and applies `withOperationIdentity` |

`history`, `changes`, and `version` join the coordinator's `read` because they now hold a reader. Explicit
maintenance waits for every active read call before it starts, so it must see them (§ 5). A `pull`, `push`, or
`maintain` on the same backend instance now waits for an in-flight `history`, `changes`, or `version`, and they for
it, as `read` and `list` already do. None of the three fetches or runs maintenance.

#### 3.3 Composition

The coordinator opens a scope only when the context carries none; a context already carrying one runs the operation in
it. Every scope's context resolves identity at most once: the backend's calls already apply `withOperationIdentity`,
and the two command contexts gain it.

#### 3.4 What it binds

The scope wraps the context's ports: `exec`, `execInput`, `rawExec`, `fs`, and `lock`. Every context the call derives
for its stores calls the wrapped ports. That includes the repository binding (`bindRefRepository`, which keeps the
`source` it was given), the deadline wrapper (`bindDeadline`) and its cleanup context (`refSyncCleanupContext`), the
`options.lock` sync paths pass on, and `withRefLocks`. So every port event of § 4 reaches the scope from every site. The
two other events, nested public calls and restarts, are control flow rather than port calls; § 4.6 and § 4.7 name where
each is hooked.

The import's reads of its source repository go around the wrapped ports: every context and port call it builds from
`context.importSource`. Three sites give `readBatchObjects` a context carrying the source's `rawExec` and the scope's
`batchReader` (`import/personal-notes.ts`, `import/parked-source.ts`, `import/code-captures.ts`). The rest call the
source's ports (`source.ports`) or its in-repo store (`source.store`) directly. All of these are reads, so no event of
§ 4 passes through them, and a reader they open belongs to the scope's `GitBatchReadScope` and closes with the others.

The scope supplies its reader only through the context's `batchReader` field, never inside an executor. A site that
clears the field still runs a one-shot process: `isUnavailableGraphFailure` passes `batchReader: undefined` to confirm
absence with a fresh reader, and keeps doing so.

### 4. Refresh events (D3)

| Event                                                                                                                                                           | Hooked at                                                                                                    | Readers                                                                          | Remembered answers                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A `fetch`, `maintenance`, or `gc` invocation (§ 4.2)                                                                                                            | the bound executors                                                                                          | closed before it; the next read reopens                                          | kept                                                              |
| A configuration change: `config` without `--get`, `--get-all`, `--get-regexp`, or `--list`; `remote` other than a listing, `get-url`, or `show`; `init` (§ 4.3) | the bound executors                                                                                          | kept                                                                             | dropped once it settles, whatever its outcome                     |
| Work while a lock or keeper lease is held (§ 4.4)                                                                                                               | the bound lock                                                                                               | kept, under each site's existing rule                                            | only answers read since the newest held lock was taken are served |
| Renaming to or from, or removing, `arc/store`, `arc/store-migrate-build`, or `arc/store-migrate-old` under the common Git directory (§ 4.5)                     | the bound filesystem, by path                                                                                | closed before it                                                                 | dropped                                                           |
| A command's nested public call (§ 4.6)                                                                                                                          | the `Store` that `runRefBackendMigrate` and `runRefBackendRemote` hand to `runRefMigrate` and `runRefRemote` | closed before it                                                                 | dropped after it                                                  |
| A restart that resolves the operation again (§ 4.7)                                                                                                             | `pullRefStoreOnce`'s restart, `publishRefStore`'s retry, `executeRefBatch`'s loop, `restartOnVanishedStore`  | closed before it                                                                 | dropped                                                           |
| A reader bound to a separate store answers that an object is missing (§ 4.8)                                                                                    | `readBatchObjects`                                                                                           | its store directory is checked; if gone, the read is repeated without the reader | —                                                                 |

#### 4.1 Classifying an invocation

The bound executors classify an invocation by its subcommand: the first argument after Git's leading options, where `-c`
also takes the argument after it. Store code puts options first. `refFetchArgs` puts `-c` pairs before `fetch`
(`gitRefLockArgs`, then the remote's `negotiationInclude`), `codeCommitIdentityArgs` puts them before `commit-tree`, and
`fetchLayoutObjects` starts at `fetch`. `bindRefRepository` and `repositoryConfig` put `--git-dir=<path>` first, and
some reads lead with `--no-replace-objects`. Reading the first argument alone, as `classifyExpectedOutcome` does, would
miss every fetch `refFetchArgs` builds, every fetch into a separate store, and every configuration write to one. The
classifier sees the arguments the executor receives, so the raw executor's own `--no-lazy-fetch` prefix
(`process-executor.ts`) never reaches it.

A `config` invocation is a read only when it carries `--get`, `--get-all`, `--get-regexp`, or `--list`. A `remote`
invocation is a read when it has no subcommand (a listing, with or without `-v`), or its subcommand is `get-url` or
`show`. Every other `config` or `remote` invocation, and every `init`, is a configuration change. The rule fails safe:
a read it misclassifies costs a dropped answer, never a stale one.

#### 4.2 Fetch and maintenance

Before a `fetch`, `maintenance`, or `gc` invocation, the scope closes its readers, and the next read reopens one. This
extends the coordinator's existing drain before explicit maintenance to the call's own fetches. Each costs one reader
start, and remembered answers are kept, since neither event writes configuration. Where a fetch runs under a lock or
lease, as `fetchRefPatterns` runs `runRefFetch` inside the remote's keeper lease, the close happens under it and waits
only for the scope's own children to exit.

No store fetch passes `--no-auto-maintenance` or sets a detach option, so the maintenance a fetch triggers may run
detached on POSIX, where an open handle does not stop a pack's deletion. Git on Windows runs it in the foreground, so a
reader reopened after the fetch never overlaps it there. A probe on Windows with Git 2.56.0 (2026-10-30) found that an
open `cat-file --batch` reader stopped neither a repack's removal of the pack it was reading nor a rename of its store
directory, as on POSIX. The close before a fetch therefore guards no reproduced failure. It is kept, at one reader start
per fetch, for consistency with the coordinator's existing drain before explicit maintenance, and because Git's Windows
behavior at ARC's floor (2.47) is untested. § 9.2 pins the foreground behavior on CI's Git.

#### 4.3 Configuration changes

A configuration change drops every remembered answer once it settles, whether it succeeds, fails, or is cancelled. A
cancelled write can still have landed, as `admitAutomaticDesignation`'s timeout remedy says ("its automatic role setting
may already have completed"). The drop is not per repository: a write through the checkout root and a read of the
common directory reach the same `config` file. An answer whose read overlapped the change is not served after it, even
if that read finishes later.

#### 4.4 Locks and leases

A lock or lease can guard configuration, so an answer remembered before a lock was taken is not served under it. The
first lookup under a newly taken lock reads Git. Repeats under the same hold reuse that answer: `urlRewrites` alone is
read several times within one `refFetchTarget`. A lookup counts as read under a lock only if its read began after the
lock was taken. After the lock is released, the fresher answer stays remembered. With several locks held, the newest
acquisition sets the bound.

Objects keep each site's existing lock rule, with one addition. A reader may cross a lock where the locked work
re-checks the tips it builds on. Writes already let theirs cross (`executeRefBatch`). This design adds the reader to
merges, whose captured evidence already crosses: `mergeCapturedSyncRef` re-checks the tip and history quarters under
the lock, which makes the crossing safe. `sync-withdraw-commit.ts` still starts fresh under its lock, since its basis
can become unreachable. Publication stays guarded: `commitRefStep` re-checks the
layout under the layout lock, so an answer from a departed store cannot publish.

`prepareRefCopy`'s no-op lock takes nothing, so it records no acquisition; the move's layout lock it runs under is
recorded.

#### 4.5 Store directories

Before a rename to or from, or a removal of, `arc/store`, `arc/store-migrate-build`, or `arc/store-migrate-old` under
the common Git directory, the scope closes its readers and drops its remembered answers. A layout move's own command
reads the build through `prepareRefCopy` before `switchLayout` renames it, and the rename's destination becomes the
store a later read binds to. Only directories a reader can be bound to are governed. The `object-stage-*` directory
`flushRefBlobStage` removes in each commit step and the `store-init-*` temporary `createStoreDirectory` removes hold no
repository a reader reads, so neither refreshes the scope. `createStoreDirectory`'s rename into `arc/store` does.

#### 4.6 Nested public calls

`runRefBackendMigrate` and `runRefBackendRemote` hand `runRefMigrate` and `runRefRemote` a second backend instance.
The command's scope wraps that `Store` so that each of its methods closes the command's readers before the call and
drops the command's remembered answers after it. The nested call opens its own scope through its own coordinator. A
nested `push` can make a clone's first automatic role assignment, and a nested call's maintenance never meets the
command's readers (§ 5).

#### 4.7 Restarts

A restart is where a call acts on another process's change. After a commit step returns `layout-changed`,
`pullRefStoreOnce` resolves designation again outside any lock, and the move that caused it may have rewritten roles
(`setLayoutRole`). So every restart closes the call's readers and drops what it remembered, and the restarted attempt
reads as the per-call reads it replaces would. The hooks are `pullRefStoreOnce`'s recursion, `publishRefStore`'s retry,
`executeRefBatch`'s loop, and `restartOnVanishedStore`'s loop.

#### 4.8 Missing answers from a departed store

A reader that outlived its store directory answers `missing` where a per-read `cat-file` would fail on the departed
`--git-dir`. It can do so for any query shape: a bare object ID, a peeled `${tip}^{tree}`, or a `<tip>:<path>` whose tip
is gone. So on any `missing` answer read through a context bound to a separate store, `readBatchObjects` checks that
directory (`context.repository.gitDir`) with `storeDirectoryVanished`, a filesystem check that starts no process. If the
directory is gone, it repeats the read without the reader. That per-read `cat-file` fails on the departed `--git-dir`
exactly as today, and its `GitProcessError` names the directory, so the call meets the same failure and takes the same
restart. If the directory is there, the answer stands: an ordinary not-found read costs one filesystem check and no
further process, and `isUnavailableGraphFailure` keeps its own fresh confirmation. A reader bound to the code repository
needs no check, since that directory never departs. An import context that reads its source repository while still bound
to the store (§ 3.4) repeats a `missing` read only when the store's directory is gone, and the repeat returns the same
answer, so the result stands at the cost of one rare process.

### 5. Maintenance (D4)

Within one backend instance, a scope yields to maintenance; it never blocks it. The coordinator's `maintenance` waits
for every active read call on its instance before it starts, which now includes `history`, `changes`, and `version` (§
3.2). A `pull` or `push` holding its own reader closes it at each fetch (§ 4.2) rather than holding it across, so no
call waits on itself, and `maintain` closes its own readers before `git maintenance run --auto`. A command closes its
readers before each nested public call (§ 4.6), so the second instance's maintenance never meets them. A scope owned
above one call inherits the same rule.

### 6. Fault reporting (D5)

Fault reporting is unchanged. A failed exchange makes `GitBatchReadScope.run` drop that reader and rethrow the
`GitProcessError` the per-call executor would raise: cancellation with `descendantsUnconfirmed`, a nonzero exit, or the
output limit. `GitBatchOutput.read` bounds each exchange on its own, so `readBatchObjects`' output-limit split behaves as
before. A departed store fails as a per-read `cat-file` does (§ 4.8). No refusal code, class, or remedy changes.

### 7. Remembered configuration lookups (D6)

#### 7.1 Which lookups

The scope remembers the parsed answers of these lookup functions, not raw invocations:

| Lookup                                                          | Function                                         | Module                   |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| `config --null --list --includes` under `--git-dir=<commonDir>` | `repositoryConfig`, behind `readRefDesignation`  | `designation.ts`         |
| `config` reads with `--get-all` or `--get-regexp`               | `configOutput`, and so `urlRewrites`             | `effective-transport.ts` |
| `remote get-url`, with or without `--push --all`                | `readRemoteTransports`, `readNamedTransport`     | `effective-transport.ts` |
| `remote` (the listing)                                          | the listing `selectLiteralTransport` reads first | `effective-transport.ts` |
| `ls-remote --get-url` and `remote show -n`                      | `resolveLiteral`                                 | `effective-transport.ts` |
| `config --null --list`                                          | `refFetchNeedsCompleteness`                      | `fetch-completeness.ts`  |

These start most of the measured configuration processes, and every caller reaches them through the context.

#### 7.2 Key and answer

A key is the function, its arguments, and the repository the context is bound to (`context.repository?.gitDir`, or the
checkout root when none), except for `repositoryConfig`. Its own `--git-dir` argument names the file it reads and comes
after any `--git-dir` a bound context puts first, and Git honors the last one. So its key is the function and that
argument, and every context reading one common directory shares its answer. An answer is what the function returns,
including `configOutput`'s empty answer for a completed exit 1. A thrown error is never remembered, so a cancelled,
timed-out, or failed lookup runs again. The functions already turn exit codes and locale-bound output into answers, so
the key needs no output options and no list of which failures count.

#### 7.3 Invalidation

Invalidation is § 4's. Any configuration change in the call drops every remembered answer, whatever its outcome and
whichever repository it wrote. Every restart, store-directory event, and nested public call drops them too. Under a
lock or lease, only answers read since it was taken are served.

#### 7.4 Push admission re-reads under the comparison lock

One unlocked check reads designation to see another process's change. `checkedPushTarget` (`push.ts`) re-reads it after
`capturePushListing` releases its locks, and `admit` calls it again before and after `captureComparisonWitness`. With
remembered answers, both unlocked reads repeat the attempt's answer, and the push still detects the change one step
later. `captureComparisonWitness` re-reads designation under the layout lock and keeper lease (`withComparisonScope`,
`readComparisonSource`). That refreshes the same `repositoryConfig` key, so `admit`'s second check compares against the
fresher answer. `publicationTargetMatches` re-reads push transport under that lock. That is an invariant of this
design: **push admission re-reads designation and transport under the comparison lock.** The same holds for any lease
that replaces the keeper lock: transport and designation lookups read fresh under whatever lease guards their writers.

Every other re-read of designation that looks for another process's change already runs under the layout lock. These
are `installFirstBacking` and `admitAutomaticDesignation` (`designation-first.ts`), `writeRefRepository`
(`repository.ts`) before it creates the store, `applyBackingSetting` (`remote-backing.ts`), and the `prepare` callbacks
`moveRefLayout` runs under its lock (`reconcileNoTarget` in `commands.ts`, `moveDesignatedLayout` in
`remote-setting.ts`). The rest follow a configuration write or a nested call that drops what was remembered, or a read
under the layout lock whose fresher answer stays remembered (§ 4.4): `resolveFirstDesignation` re-reads after
`installFirstBacking` returns without writing, and `automaticallyDesignate` after `admitAutomaticDesignation` returns
null. Where `installFirstBacking` finds no pointer it reads nothing, and the re-read repeats an answer nothing in the
call could have changed.

#### 7.5 Staleness outside locks

Two identical lookups in one call today can see another process's configuration write between them. With remembered
answers the second sees the first's value. A call still sees another process's change wherever it holds a lock or
lease, or restarts, and § 7.4 covers push's one unlocked detection. This is the design's one observable difference.

A remembered answer can also outlast the call's sync deadline. A lookup served from the scope starts no process, so
it passes a deadline that has already expired. The call's next Git process still refuses with the deadline's error
(`bindDeadline` signals every invocation), so the call ends as it would have.

#### 7.6 What stays per call

- **Inline reads beside a write or under a lock.** Remembering them buys almost nothing:
    - `configureBackingRemote` and `repointBackingRemote` (`backing-configuration.ts`) each list remotes, and
      `repointBackingRemote` reads `remote.backing.url` with `config --get`, just before their configuration writes and
      under the caller's backing keeper lease.
    - `removeBacking` (`migrate-remote-switch.ts`) lists remotes just before its `remote remove`.
    - `publicationTargetMatches` (`comparison-witness.ts`) lists remotes under the comparison lock, where § 7.4 requires
      a fresh read.
    - `noBackingPointer` (`remote-backing.ts`) lists remotes once, on its way to a refusal.
- **The import's listing of its source's remotes** (`import/code-links.ts`), on the source's ports (§ 3.4).
- **`arc.identity`.** It resolves through the context's identity port, and `withOperationIdentity` already answers it
  once per call (§ 3.3). The import's read of its source's identity (`source.ports.identity()` in
  `import/transient.ts`) goes through the source's own port and stays per call.
- **`readObjectFormat`'s read of a repository's `config` file.** It reads the file and starts no process.

### 8. A reader sees its own call's writes

The design assumes a reader can read objects its own call wrote after the reader opened. A long-lived `cat-file
--batch` finds loose objects by path and rescans packs on a miss, so a new object is visible to it. A sync call now
holds a reader across the merges and commits it writes, and § 4.2 closes the reader around fetches and maintenance
regardless. A case pins the assumption for a sync call's scope (§ 9.1).

### 9. Verification

#### 9.1 A case for each event

Each case runs through public store calls and records a process trace (`GIT_TRACE2_EVENT`, as
`store-ref-reader-lifetime.test.ts` does). It asserts the refresh on the trace: the reader's `exit` comes before the
event's `start`, and the first lookup after the event starts a Git process. Three events start no Git process of their
own, so their cases assert against a marker instead: a `rename` in the `fs` port the case supplies, which the scope's
wrapper calls after its close; the nested call's first Git process; and the restarted attempt's first Git process. At
each marker the old reader's `exit` is already in the trace. Without the refresh, each case fails on every platform.
Where a row both closes readers and drops answers (the nested-call and restart rows), its cases check both. The
directory row's case checks its readers alone, for the reason its row gives.

| Event                 | Case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch and maintenance | A pull whose fetch, made while the call holds a reader, finds maintenance due in the repository the fetch writes (the store, in the separate layout). The store keeps every fetched pack (`fetch.unpackLimit 1`, `transfer.unpackLimit 1`) and Git's default maintenance thresholds until that fetch starts, when the case sets `gc.auto 1` and `gc.autoPackLimit 1` in the store. The fetch's maintenance is then the store's first due run, which an earlier fetch of the call would otherwise consume. On Linux it also sets `gc.autoDetach` and `maintenance.autoDetach` to `false`, as `verify-integrity.test.ts` does, so the maintenance finishes inside the case; on Windows it leaves them at their defaults (§ 9.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Configuration change  | A configuration write through a context bound to the separate store, then the same lookup. No case checks a failed or cancelled write, since no lookup after one can show whether it dropped answers. A failed write ends the call, or restarts it when it names a departed store (§ 4.7), which drops answers itself. The one failed write a call continues past, `clearBackingPushUrls`' tolerated exit 5, follows successful writes that already dropped every answer, with no lookup between. A cancellation a sync call reports as a timeout is followed by no lookup, and the one `automaticallyDesignate` returns as a pull failure comes only when no remote has a role, so the pull is left with no source and a push with no read source to pull. The drop on any outcome stays, one step in the wrapper's settle, since a cancelled write can still have landed (§ 4.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Locks and leases      | A lookup under a newly taken lock after another process changed its value reads the new value; a repeat under the same hold starts no process; after release the fresher answer is served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Store directories     | The command's layout move from the default layout to the separate one: `prepareRefCopy`'s reader on the build is still open when `switchLayout` renames the build into `arc/store`, and its `exit` precedes the case's `rename` marker. The move the other way closes its readers at `switchLayout`'s `fetchLayoutObjects` (§ 4.2), before the rename, so that direction checks only that the move completes. No case checks the answer half. A public call cannot isolate it: between the rename and `deleteLayoutSource`'s removals of the set-aside and build directories, which drop answers themselves (§ 4.5), a move makes only configuration writes, which drop them too, and per-call listings (§ 7.6), except a switch's undo, whose lookups (`restoreBacking` in `restoreDesignation`) run under a keeper lease taken after the rename and so read Git either way (§ 4.4). Every later lookup, `applyCodeSetting`'s among them, follows the removals, and `createStoreDirectory`'s rename follows its own `git init`, a configuration change. A unit case cannot reach it either: the store's test boundary (`storeViolations` in `eslint/architecture-imports.ts`) refuses a test's runtime import of any module under `lib/store/ref/`. The drop stays, one call in the wrapper that already closes the readers, since a rename points `arc/store` at a different repository |
| Nested public call    | A migration whose nested push makes the clone's first automatic role assignment, after which a lookup the command makes sees the new role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Restarts              | Another process's layout move that carries a role setting, during a pull and during a push, through both its `layout-changed` restart and its vanished-store restart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Missing answer        | A reader whose store directory departed answers missing; the call fails or restarts as with a per-read `cat-file`. With the directory present, a not-found read starts no further process                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Maintenance ordering  | `maintain` on a backend instance waits for an in-flight `history` on the same instance, and neither holds a reader across the other                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Own writes            | A sync call writes an object, then reads it through the same reader                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

#### 9.2 Windows

The store job runs on Linux only, and a pull request's portability run leaves the store suites out
(`reachSuiteExclusions`, `local-vitest-runner.ts`). The Windows portability leg, which runs when CI is dispatched with
`run_portability_pair` or on its schedule, runs a fixed list of files, the portability arm of
`localVitestTierArguments`, and `store-ref-reader-lifetime.test.ts` is among them. The fetch-and-maintenance case and
the store-directory case go in that file, which also matches the store check's `store-ref-*` reach, so both run on
Linux and on Windows.

Their trace assertions discriminate the refresh on every platform. On Windows the two cases also check the outcome. The
fetch case leaves the detach settings at their defaults and asserts that the packs the triggered maintenance replaced
are gone when the fetch returns, which pins § 4.2's foreground behavior. The layout-move case asserts that the command's
move completes in each direction. On Git 2.56 those outcomes hold even without the refresh (§ 4.2), so they guard the
platform behavior the design rests on, not the refresh itself.

#### 9.3 The store suites

Every existing store suite passes with no assertion removed or weakened. Contract and refusal types are unchanged.

#### 9.4 Cost

Re-run the analysis's attribution method on the same ten store files, before at this work unit's merge base and after
at its head. State per file the process counts by subcommand and the case time. For the five files the prototypes
measured, expect the second prototype's result or better: 14–25% fewer processes in `conformance-sync`,
`withdraw-entry-inverse`, `cleanup-report`, and `follow-restart`, and under a tenth fewer in `conformance-reads`, with
`cat-file`, `config`, `remote`, and `ls-remote` carrying the drop. The other five are reported without an expectation;
the import files among them are dominated by in-repo scans this design leaves alone. A shortfall is read from the
per-subcommand split (reader starts against configuration lookups), not assumed to be a call left without its scope.

## Alternatives & Rationale

- **Operation boundary.**
    - _One public call (chosen, § 2)._ No contract change; the coordinator's existing unit.
    - _A scope above one call._ What repeats across calls survives this design. In the first prototype's four
      sync-heavy files, configuration and remote lookups are still 16% of processes and `cat-file` starts 5%, about as
      much again as this design removes. Objects and listed trees are addressed by object ID, so sharing them across
      calls needs only § 4's lifetime rules. Tips are already shareable through `version()` and `asOf`. Configuration
      would need a rule for noticing another writer between calls. Such a scope could be owned by the backend instance,
      which needs no caller change and so reaches the store suites, or held by callers through a contract handle, which
      reaches only callers that adopt it. Left to separate work built on §§ 3–5; the composition rule of § 3.3 lets it
      supply the scope.
- **Which calls join the coordinator.**
    - _Run `history`, `changes`, and `version` through the coordinator's `read` (chosen, § 3.2)._ They hold a reader
      now, and explicit maintenance must wait for every reader on its instance.
    - _Give them a scope outside the coordinator._ Saves the ordering change, but an explicit `maintain` could then run
      while one of them holds a reader, the overlap the existing drain exists to prevent. Not taken.
- **When state refreshes.**
    - _At the events that can make it stale (chosen, § 4)._ Each site keeps its existing object rule, and configuration
      reads Git again once under each newly taken lock.
    - _Read Git for every lookup while a lock is held._ Equally safe, since repeats under one hold see the same guarded
      configuration. But it never reuses transport answers, which a sync fetch resolves inside its keeper lease:
      measured −12.5% over the five files against the chosen rule's −18%. Not taken.
    - _Drop every remembered answer whenever a lock or lease is taken._ Simpler to state, but a sync call takes ref locks
      for each merged ref and the layout lock for each commit step, so every lookup between them would read Git again.
      The chosen rule keeps an answer for use outside the lock. Not measured; not taken.
    - _Drop everything at every lock and structural event._ Simpler to state, but it fires at every keeper lease, merged
      ref, and commit step, and gives back an unmeasured share of the saving. Not taken.
- **Readers across a fetch.**
    - _Close before each fetch and reopen after (chosen, § 4.2)._ Matches the existing drain; costs one reader start per
      fetch.
    - _Pass `--no-auto-maintenance` to store fetches._ Lets a reader live across a fetch, but moves the repository's
      automatic maintenance off store fetches onto `maintain` alone. That changes repository behavior, not process cost.
      Not taken.
- **A missing answer from a departed store.**
    - _Check the store directory, then repeat the read without the reader (chosen, § 4.8)._ An ordinary not-found read
      costs one filesystem check. A departed store meets exactly today's failure at the cost of one process, and only
      when the directory is gone.
    - _Raise a constructed error naming the directory._ Saves that process, but every site that catches what a
      per-read `cat-file` raises would have to be checked against a new error shape. Not taken.
    - _Confirm every missing bare object ID with a fresh reader._ What the second prototype did. It misses peeled and
      path queries, and it costs a process on every ordinary not-found read. Not taken.
- **Where configuration answers are remembered.**
    - _At the lookup functions, as parsed answers (chosen, § 7)._ The functions already turn exit codes and locale-bound
      output into answers.
    - _At the executor, by exact arguments._ Reaches every configuration-only invocation, but it must classify which
      completed failures are answers, key on every output option, and tell the checkout root and the common directory
      apart. Not taken.
    - _Pass designation and rewrites along the call path_, as `RefDesignationResolution` already flows into
      `pullRefStore`. Reaches only the paths it is threaded through and changes their signatures, while remembered
      answers reach every caller through the context. Not taken.
- **Tree enumeration.**
    - _Keep `diff-tree --stdin` (chosen)._ One process per `readRefTrees` call, about 5% of the measured total.
    - _Keep listed trees within a call._ Trees are addressed by object ID, so the scope could keep listings as
      `writeEvidence.trees` already does for write and sync attempts. Bounded by the same 5%; not taken.
    - _Walk trees through the shared reader._ Read tree objects with `cat-file --batch` and parse them in-process, level
      by level. It must keep `enumerateTrees`' contract: a ref with any traversed tree missing reads as unreadable, a
      missing root object raises the repository's error, and names Git admits but UTF-8 cannot decode keep
      `invalidName` and `rawPath`. That touches the missing-object classification, the largest change in the set.
      Deferred: the after-measurement decides whether `diff-tree` earns its own work.
- **Cheaper process starts instead of fewer.** A spawn blocks the test worker for 3.2–3.8 ms against about 1.2 ms from a
  bare Node process, because libuv forks the caller and a larger resident heap costs more to fork. A bare process with a
  500 MB V8 heap blocks for about 2.1 ms. But end to end, a short Git call took 3.9–4.3 ms whether spawned directly from
  a 5 MB or a 500 MB process or relayed through a small helper process (2026-10-29, 300 calls per case, two rounds): the
  caller waits for Git to start either way. Spawning from a helper would add a long-lived process and a relay to the
  shared Git executor for no measurable gain. Not taken.
- **Writes.**
    - _Leave as they are (chosen)._ Each write step already uses one process per kind of object.
    - _Write a commit step's trees in one process._ Saves processes only when one step changes several refs, which
      nothing measured shows to be common; a single-record write changes one ref. Not taken.
    - _Hash commit objects in-process and write them in one process._ This would reproduce Git's identity, date, and
      environment handling for author and committer, a risk out of proportion to its share. Not taken.

## Cross-cutting Considerations

- **Performance.** The prototypes put the five measured files at 8–25% fewer processes. The other store files' mix of
  sync and read calls is unmeasured, so the suite-wide reduction (about 12–16% of processes) rests on the slowest files
  standing in for the rest. Converting that to case time rests on the 86% process share, an upper bound. The saving
  applies to file time, so its effect on each CI job shrinks as the shard count grows. Store commands outside tests gain
  in the same proportion.
- **Concurrency and correctness.** The refresh rules keep every check the store's exactness relies on: tips under each
  lock, layout under the layout lock, configuration fresh under any lock or lease that guards it, and push admission's
  re-read under the comparison lock (§ 7.4). The one observable difference is § 7.5's staleness bound.
- **Windows.** The design closes readers wherever an open handle could matter on Windows, though the probe with Git
  2.56 found none that does (§ 4.2). Git's Windows behavior at ARC's floor (2.47) is untested, which leaves two
  residuals, each as it stands today against read and write calls' readers. This design widens their window.
    - A `pull` or `push` now holds a reader for most of its call, and another process's layout move renames
      `arc/store` aside and later removes the set-aside copy (`deleteLayoutSource`), whether it moves the layout alone
      or as part of a remote or source switch (`moveRefLayoutAsSwitch`). If either step fails, the move's record
      survives it. A standalone layout move saves its own before `switchLayout` and removes it only after the removal,
      and a move a switch carries runs under its parent move's record. Rerunning `arc store migrate` resumes the
      recorded move (`runRefMigrate`).
    - Maintenance outside the backend instance, in another process or another instance in this process, gets no wait
      against a scope's reader (§ 5). If an open reader stops a pack's removal, the stale pack's files stay behind.
- **Compatibility and rollout.** No contract, persisted state, configuration key, or command surface changes, so there
  is nothing to migrate and nothing to switch on. `createStore` still composes the in-repo implementation, so the change
  reaches callers through `createRefStore`, `createReadSourceStore`, and the `arc store` commands.
- **Security.** No trust boundary moves. Remembered answers live in process memory for one call and are never
  persisted.
- **Testing.** § 9. The cases are store integration files named `store-ref-*`, so the store check selects them by
  reach on every change to the ref backend; a case in a file outside that pattern would not run there. Tests reach
  the scope only through public calls (§ 9.1's store-directory row). The two cases that also run on Windows sit in
  `store-ref-reader-lifetime.test.ts`, which the portability leg's list names (§ 9.2).

## Success Criteria

1. **Every public call holds one scope.** For each call in § 3.2's table, a traced case shows at most one reader per
   bound repository between refresh events, every reader closed before the call returns, and the command contexts
   resolve identity through their identity port once.
2. **Every refresh event holds.** Each case of § 9.1 passes on Linux in the store check. The two cases § 9.2 places in
   `store-ref-reader-lifetime.test.ts` pass on Windows with their outcome checks, in a CI run dispatched at the
   verified head with `run_portability_pair` set and neither diagnostic input set.
3. **Results are unchanged.** Every existing store suite passes with no assertion removed or weakened, and
   `lib/store/contract.ts` and `lib/store/refusal.ts` are unchanged.
4. **A departed store fails as before.** § 9.1's missing-answer case passes in both directions: a departed store meets
   the per-read failure and its restart, and a present store's not-found read starts no further process.
5. **The cost is measured and explained.** § 9.4's before-and-after attribution is recorded per file in
   `notes-store-operation-git-access.md`. Each of the five prototype files meets its expectation, or its shortfall is
   explained from its per-subcommand split.
6. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The module's name and the internal shape of the scope's lock bookkeeping are implementation
detail.

## Amendments

None.

---
