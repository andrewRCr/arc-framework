# Task List: store-operation-git-access

- **Design:** `spec-store-operation-git-access.md`

---

## **Phase 1:** Read and write calls hold one scope

_Purpose:_ Open the operation scope in the coordinator's read and write calls, which already hold a reader, with the
refresh hooks those calls meet: restarts and a departed store's missing answer.

_Mode:_ `slice` through Phase 4 — closes on every public call holding one scope with no stale state served, and the
process drop measured.

### `[x]` **1.1 A read or write call's readers belong to one operation scope — D1, D2**

- _Goal:_ `read`, `list`, `lookup`, `write`, and `batch`, on `createRefBackend` and on `createRefReadSourceBackend`,
  each run inside one operation scope that supplies the context's `batchReader` and closes every reader before the
  call returns, with every result unchanged.

- _Outcome:_ The coordinator owns a `RefOperationScope` unless its context already carries one. Public lookup and
  read-source read/list/lookup traces cover both layouts alongside the existing read/write/batch lifetime guards.

### `[x]` **1.2 `history`, `changes`, and `version` hold the scope and yield to maintenance — D2, D4**

- _Goal:_ `history`, `changes`, and `version` run through the coordinator's `read`, so each holds a scope, and an
  explicit `maintain` on the same backend instance waits for an in-flight one, and it for `maintain`, as `read` and
  `list` already do.

- _Outcome:_ History, changes, and version now enter the read coordinator on both backends. Traces prove shared
  history/changes readers, no version reader, and maintenance waiting for history before admitting the later read.

### `[x]` **1.3 A read or write call's restart closes its readers — D2, D3**

- _Goal:_ A read or write call that starts again after another process moved its store reads through a fresh reader,
  as the per-call reads it replaces would: no reader the abandoned attempt opened survives into the restarted one.

    - `[x]` **1.3.a `GitBatchReadScope` closes its readers mid-call and stays usable**
        - `reset` drains prior exchanges and awaits every reader exit before allowing a new exchange to reopen a
          reader. Failed exits propagate; final `close` still rejects later reads.

    - `[x]` **1.3.b Restarts in `restartOnVanishedStore` and `executeRefBatch` refresh the scope**
        - Both retry loops close the abandoned attempt's readers before resolving again, for vanished stores and
          changed layouts or bases. Public list/write traces prove exit before the restarted attempt's first process.

### `[x]` **1.4 A departed store's missing answer fails as a per-read `cat-file` — D3, D5**

- _Goal:_ A reader that outlived its store directory never turns a departed store into a not-found answer: the read
  fails with the `GitProcessError` naming the departed `--git-dir`, as a per-read `cat-file` does, so the call meets
  the same failure and takes the same restart, while a present store's not-found read starts no further process.

- _Outcome:_ Scoped missing answers check the selected store directory without Git. A departed directory retries
  through the one-shot executor's existing failure and write restart; a present store's absent record keeps one reader.
  The exposing write returned a refusal before the change and preserves its update after the fix.

## **Phase 2:** Sync calls hold one scope

_Purpose:_ Open the scope for `pull`, `push`, and `maintain`, which hold no reader today, then remember configuration
answers in every scoped call with all the refresh rules that keep them current.

### `[x]` **2.1 `pull`, `push`, and `maintain` hold one scope that fetches and restarts refresh — D2, D3, D4**

- _Goal:_ A `pull`, `push`, or `maintain` reads every object through one reader per bound repository between refresh
  events: its readers close before each `fetch`, `maintenance`, or `gc` invocation and at each restart, and its merges
  read through the call's reader across their locks.

    - `[x]` **2.1.a The scope opens inside the coordinator's maintenance, and a fetch closes its readers**
        - Sync calls own a scope inside the maintenance coordinator. Wrapped executors drain readers before fetch,
          maintenance, or gc and forward every option unchanged. Public traces cover shared readers, their own new
          commits, due history-fetch maintenance, and preservation of an unknown `execInput` option in both layouts.

    - `[x]` **2.1.b A sync call's restart starts with a fresh reader**
        - Pull restarts and publication retries refresh the scope. Public pull/push traces cover vanished stores and
          changed layouts, require the abandoned readers to exit before fresh designation reads, and require push
          retries to release readers before backoff. Resumed calls observe the moved store's role.

### `[ ]` **2.2 A call answers each configuration lookup once until something can change it — D3, D6**

- _Goal:_ Within one scoped call, each remembered lookup reads Git once and repeats its answer until a configuration
  change or a restart drops it. Under a lock or lease only answers read since it was taken are served, so push
  admission re-reads designation and transport under the comparison lock.

- _Note:_ Remembering, routing, and the refresh rules land as one task. Routed lookups without the lock bound and the
  drops serve stale answers existing store suites catch: `writeRefRepository` re-reads designation under the layout
  lock, and a pull's restart resolves designation again after a move. The rules without routing cannot fail first,
  since every lookup still reads Git. So route first, then add each rule behind its case, which fails with the lookups
  routed and that rule absent.

    - A helper in the scope module remembers what a lookup function returns. The key is the function, its arguments,
      and the repository the context is bound to: `context.repository?.gitDir`, or the checkout root when none.
      `repositoryConfig` is keyed by the function and its own `--git-dir` argument, so every context reading one common
      directory shares its answer.
    - An answer includes `configOutput`'s empty answer for a completed exit 1. A thrown error is never remembered, so a
      cancelled, timed-out, or failed lookup runs again. With no scope open, the helper reads Git as today.
    - Route `repositoryConfig` (`designation.ts`); `configOutput`, and so `urlRewrites`, `readRemoteTransports`,
      `readNamedTransport`, the remote listing `selectLiteralTransport` reads first, and `resolveLiteral`'s
      `ls-remote --get-url` and `remote show -n` (`effective-transport.ts`); and `refFetchNeedsCompleteness`
      (`fetch-completeness.ts`).
    - Leave per call the inline reads beside a write or under a lock (`configureBackingRemote`, `repointBackingRemote`,
      `removeBacking`, `publicationTargetMatches`, `noBackingPointer`), the import's listing of its source's remotes
      (`import/code-links.ts`), `arc.identity`, and `readObjectFormat`'s file read.
    - A `config` invocation is a read only with `--get`, `--get-all`, `--get-regexp`, or `--list`. A `remote` invocation
      is a read with no subcommand, with or without `-v`, or with `get-url` or `show`. Every other `config` or `remote`
      invocation, and every `init`, is a configuration change.
    - A configuration change drops every remembered answer once it settles, whether it succeeds, fails, or is
      cancelled, and whichever repository it wrote. An answer whose read overlapped the change is not served after it.
      No case checks a failed or cancelled write, since no lookup after one can show whether it dropped answers: such a
      write ends the call or restarts it, which drops answers itself, and the one failed write a call continues past,
      `clearBackingPushUrls`' exit 5, follows successful writes that already dropped every answer, with no lookup
      between.
    - The scope wraps `lock` and records each acquisition in order and its release. A lookup counts as read under a
      lock only if its read began after the newest held acquisition; after the release the fresher answer stays
      remembered. `withRefLocks`, `withRefFetchKeepers`' leases, and `bindDeadline`'s lock all reach the wrapped port;
      `prepareRefCopy`'s no-op lock records nothing.
    - Forward `lock`'s optional `waitMs` unchanged, including zero. Add a public-call case proving that a zero wait
      reaches the underlying port without falling back to its default wait.
    - The restart refresh of 1.3.b and 2.1.b also drops every remembered answer.
    - A sync call's configuration write through a context bound to the separate store is `installFirstBacking`'s
      `remote add backing` (`designation-first.ts`), run through the store-bound `selected`, after which
      `resolveFirstDesignation` reads designation again in the same pull. `follow-due.ts` (`physical`) and
      `backing-configuration.ts` (`target`) also write through a store-bound context, but only commands reach them.
    - Build `test-first` (one behavior at a time):
        - A sync call's repeated lookups outside any lock start one Git process per key.
        - A pull that installs the first backing: after `remote add backing`, the designation lookup reads Git and sees
          the `backing` remote.
        - A lookup under a newly taken lock, after another process changed its value, reads the new value; a repeat
          under the same hold starts no process; after the release the fresher answer is served. Cover push's
          comparison lock, where `captureComparisonWitness` re-reads designation and `publicationTargetMatches` re-reads
          push transport, and a sync fetch's keeper lease.
        - The layout move of 2.1.b carries a role setting: after each restart, during a pull and during a push, the role
          lookup reads Git and sees the new role.

## **Phase 3:** Commands hold one scope

_Purpose:_ Give the migrate and remote commands a scope and one identity resolution, with the refresh their nested
public calls and store-directory moves need.

### `[ ]` **3.1 The migrate and remote commands hold one scope that nested calls and moves refresh — D1, D2, D3**

- _Goal:_ `runRefBackendMigrate` and `runRefBackendRemote` each run in one scope whose identity resolves once, whose
  nested public calls on the second backend instance are operations of their own, and whose store-directory renames
  and removals close its readers and drop its answers first.

- _Note:_ The scope and its refreshes land as one task. A command holding a scope without them would keep the build's
  reader open past its rename and serve the role a nested push replaced, since the nested backend instance runs on the
  unwrapped ports. Open the scope first, behind the identity and one-reader cases and the nested-call case's
  repeated-lookup assertion, which fail today. Until the scope opens, the commands hold no reader and remember nothing,
  so the nested-call case's role and reader-order assertions hold and the directory case finds no reader open at the
  rename: add those once the scope is open, where each fails until its refresh lands.

    - `runRefBackendMigrate` and `runRefBackendRemote` (`backend.ts`) apply `withOperationIdentity` to the context
      `createRefBackendContext` builds and open a scope around `runRefMigrate` and `runRefRemote`.
    - The import's source reads go around the wrapped ports. `import/personal-notes.ts`, `import/parked-source.ts`, and
      `import/code-captures.ts` give `readBatchObjects` the source's `rawExec` on a copy of the command context, so once
      the scope opens they carry its `batchReader`, whose readers close with the scope.
    - `runRefBackendConflict` builds no context, so each store call it makes stays its own operation.
    - The scope wraps the `Store` handed to `runRefMigrate` and `runRefRemote` so that each of its methods closes the
      command's readers before the call and drops the command's remembered answers after it. The nested call opens its
      own scope through its own coordinator.
    - The scope wraps `fs.rename` and `fs.removeDirectory`. Before a rename to or from, or a removal of, `arc/store`,
      `arc/store-migrate-build`, or `arc/store-migrate-old` under the common Git directory, it closes its readers and
      drops its remembered answers. The `object-stage-*` directory `flushRefBlobStage` removes and the `store-init-*`
      temporary `createStoreDirectory` removes refresh nothing; `createStoreDirectory`'s rename into `arc/store`
      refreshes.
    - Spread the filesystem port and replace only the wrapped methods. Preserve `lstat` and its complete result,
      including additional fields such as `mtimeMs`.
    - `switchLayout` renames through `code.fs`, from `migrationCodeContext` (`migrate-record.ts`), which binds through
      `bindRefRepository` and keeps the scoped command context as its `source`. `deleteLayoutSource` removes the
      set-aside and build directories through the move's own `context.fs`. Both reach the wrapped `fs`.
    - The directory cases go in `store-ref-reader-lifetime.test.ts`. Their outcome checks are guards, since each move
      completes today: the move the other way completes, and on Windows the move completes in each direction.
    - Build `test-first` (one behavior at a time):
        - A migrate command and a remote command each resolve identity through their identity port once.
        - Each command starts at most one reader per bound repository between refresh events and closes every reader
          before it returns, through a move whose copy reads once per ref it merges, with at least two records: the
          migrate command's layout move from the default layout to the separate one, and the remote command's role
          setting on a code remote that moves the layout (`applyCodeSetting` through `moveDesignatedLayout`). Today each
          of those reads starts its own `cat-file`.
        - A migration whose nested push makes the clone's first automatic role assignment: a repeated command lookup
          before the nested call starts no process, which fails today; then, failing until the `Store` wrapper lands, a
          lookup the command makes afterwards sees the new role, and the command's reader `exit` precedes the nested
          call's first Git process.
        - The command's layout move from the default layout to the separate one, failing until the `fs` wrapper lands:
          `prepareRefCopy`'s reader on the build is still open when `switchLayout` renames the build into `arc/store`,
          and its `exit` precedes the `rename` in the `fs` port the case supplies.

    - After 3.1, dispatch CI at the pushed head with `run_portability_pair` set for Windows feedback. The run that
      attests belongs to verification.

## **Phase 4:** The measured cost

_Purpose:_ Measure the process drop by the analysis's attribution method and explain any shortfall, closing the slice
on the capability's benefit as well as its correctness.

_Exit criterion:_ Every refresh-event case passes through public store calls on Linux, every existing store suite
passes with no assertion removed or weakened, and the before-and-after attribution of the ten store files is recorded
and explained.

### `[ ]` **4.1 Measure process counts and case time before and after on the ten store files**

- _Goal:_ The ten store files' process counts by subcommand and case times are recorded before and after this work.
  Each of the five prototype files meets its expectation, or its shortfall is explained from its per-subcommand split:
  14–25% fewer processes in `conformance-sync`, `withdraw-entry-inverse`, `cleanup-report`, and `follow-restart`, and
  under a tenth fewer in `conformance-reads`.

- **Additional Context:** `analysis-test-suite-cost-baseline.md` § Process measurement method and § Result at
  `f663af671`

    - `[ ]` **4.1.a Measure the baseline at the merge base**
        - Record the merge base's commit, and re-run the baseline if base is merged in before the after-measurement.
        - The ten files are `store-ref-<name>.test.ts` for `cleanup-report`, `conformance-reads`, `conformance-sync`,
          `follow-copy-handoff`, `follow-restart`, `import-errands`, `import-observation-failures`, `remote-delete`,
          `separate-conformance-reads`, and `withdraw-entry-inverse`.
        - Run each file alone with the spawn-timing preload and again with the attribution preload, under
          `nicecap -n 19 -r 8` after checking `memcap_policy`, and write the runs under `~/dev/`.
        - The prototype runs' script (`~/dev/scratch/store-op-git-access/bench/run-proto2.sh`), its attribution preload
          (`~/dev/scratch/store-suite-cost/bench/spawn-origin.mjs`), and the `compare*.py` summaries beside the script
          are machine-local working references.

    - `[ ]` **4.1.b Measure at the head and record the comparison**
        - Repeat 4.1.a's runs at the head.
        - Record per file, before and after, the process counts by subcommand and the case time in a new section of
          `notes-store-operation-git-access.md`.
        - Read a shortfall from the per-subcommand split, reader starts against configuration lookups, rather than
          assuming a call left without its scope. The second prototype's attribution logs
          (`~/dev/scratch/store-op-git-access/runs/proto2-origins`) are the expected shape for the five files.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every public call in the spec's § 3.2 table holds one scope: a traced case shows at most one reader per bound
  repository between refresh events and every reader closed before the call returns.

- `[ ]` The migrate and remote command contexts resolve identity through their identity port once.

- `[ ]` Each refresh-event case passes on Linux in the store check.

- `[ ]` The fetch-and-maintenance and store-directory cases in `store-ref-reader-lifetime.test.ts` pass on Windows with
  their outcome checks, in a CI run dispatched at the verified head with `run_portability_pair` set and neither
  diagnostic input set.

- `[ ]` Every existing store suite passes with no assertion removed or weakened, and `lib/store/contract.ts` and
  `lib/store/refusal.ts` are unchanged.

- `[ ]` A departed store meets the per-read failure and its restart, and a present store's not-found read starts no
  further process.

- `[ ]` The before-and-after attribution is recorded per file in `notes-store-operation-git-access.md`, and each of the
  five prototype files meets its expectation or its shortfall is explained from its per-subcommand split.

- `[ ]` No file under `packages/arc-framework/src/` changes outside `lib/store/ref/` and `lib/git/batch-reader.ts`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
