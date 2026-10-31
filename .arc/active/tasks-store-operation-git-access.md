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

### `[x]` **2.2 A call answers each configuration lookup once until something can change it — D3, D6**

- _Goal:_ Within one scoped call, each remembered lookup reads Git once and repeats its answer until a configuration
  change or a restart drops it. Under a lock or lease only answers read since it was taken are served, so push
  admission re-reads designation and transport under the comparison lock.

- _Outcome:_ Parsed configuration and transport answers are remembered by lookup, arguments, and repository, with
  common-directory designation shared across bindings. New locks set the freshness bound; settled configuration
  writes and restarts drop answers, including overlapping reads, and failures are not retained. Public cases cover
  repeated lookups, first-backing writes, comparison/keeper freshness, changed restart roles, and zero-wait forwarding.

## **Phase 3:** Commands hold one scope

_Purpose:_ Give the migrate and remote commands a scope and one identity resolution, with the refresh their nested
public calls and store-directory moves need.

### `[x]` **3.1 The migrate and remote commands hold one scope that nested calls and moves refresh — D1, D2, D3**

- _Goal:_ `runRefBackendMigrate` and `runRefBackendRemote` each run in one scope whose identity resolves once, whose
  nested public calls on the second backend instance are operations of their own, and whose store-directory renames
  and removals close its readers and drop its answers first.

    - _Amended in:_ 3.R (A1).

- _Outcome:_ Both commands share scoped identity, parsed lookups, and readers. Every method on their second backend
  yields command readers before calling and drops command answers on settlement. The filesystem wrapper preserves
  the complete port and refreshes before store-directory renames and removals. Public cases cover command reuse,
  nested push designation and remote cleanup, and reader release through layout moves in both directions.

### `[x]` **3.R Imported claims recheck publisher authority with fresh configuration — A1**

- _Goal:_ A1 preserves the existing publisher-disappearance refusal during import source retirement, including retained
  source refs and keepers and successful retry after repair, without adding a lock or ending the command's readers.

    - `[x]` **3.R.a Refresh configuration before the imported-claims publisher check**
        - `RefOperationScope.refreshConfiguration` exposes the existing invalidation used by configuration writes,
          nested calls, and restarts. `unpublishedImportClaims` refreshes after establishing required claims and before
          reading designation, preserving its existing refusal and retained source when the publisher disappears.

    - `[x]` **3.R.b Verify retained authority and repaired continuation**
        - The unchanged publisher-disappearance case preserves refusal, source refs, and keepers, then succeeds after
          repair. Transient import, operation configuration, command reader lifetime, and the full store check cover
          the correction; the evidence and its retained boundaries are in `notes-store-operation-git-access.md`.

## **Phase 4:** The measured cost

_Purpose:_ Measure the process drop by the analysis's attribution method and explain any shortfall, closing the slice
on the capability's benefit as well as its correctness.

_Exit criterion:_ Every refresh-event case passes through public store calls on Linux, every existing store suite
passes with no assertion removed or weakened, and the before-and-after attribution of the ten store files is recorded
and explained.

### `[x]` **4.1 Measure process counts and case time before and after on the ten store files**

- _Goal:_ The ten store files' process counts by subcommand and case times are recorded before and after this work.
  Each of the five prototype files meets its expectation, or its shortfall is explained from its per-subcommand split:
  14–25% fewer processes in `conformance-sync`, `withdraw-entry-inverse`, `cleanup-report`, and `follow-restart`, and
  under a tenth fewer in `conformance-reads`.

- **Additional Context:** `analysis-test-suite-cost-baseline.md` § Process measurement method and § Result at
  `f663af671`

    - `[x]` **4.1.a Measure the baseline at the merge base**
        - Measured `023a0636eddfc6f1862dcd0e801c4e8ab44ba246` in an independent checkout, with no base merge.
          All twenty timing and attribution runs completed; process totals and case times are recorded in
          `notes-store-operation-git-access.md`, and the machine-local logs remain beside the benchmark checkouts.

    - `[x]` **4.1.b Measure at the head and record the comparison**
        - Repeated all twenty runs at `84f6f08dc`, with matching completed and pending cases before and after.
          Per-file and per-subcommand counts, case times, and the sync-conformance shortfall are recorded in
          `notes-store-operation-git-access.md`; A1 is covered by the fresh head measurements and retained store checks.

### `[x]` **4.2 Give the nested-push import case a Windows time budget**

- _Goal:_ `store-ref-reader-lifetime.test.ts`'s nested-push import case passes on Windows, where hosted run
  `41149894984` timed it out at the 30-second default.

- _Outcome:_ The case takes the 60-second budget of its command-reader siblings; it needs about 33 seconds on Windows
  against 7 on macOS. The same run's default-layout publishing burst failed with a lock left behind when the sync
  deadline killed a fetch. That residual belongs to `storage-ref-hardening`'s D2, and the burst passes on Windows at
  this head.

### `[x]` **4.R Close the refresh-event and attribution gaps verification review found**

- _Goal:_ The spec's § 9.1 locks-and-leases row and its configuration-change row's separate-store variant each have a
  public case that fails without its refresh, and the `conformance-sync` shortfall is explained against the second
  prototype from its per-subcommand split.

    - `[x]` **4.R.a Add the lock and separate-store configuration cases**
        - `store-ref-operation-config.test.ts` adds both. A change another process makes before a push's next lock is
          read under that lock and served after release, in both layouts; `arc store remote backing read` re-reads the
          separate store's configuration after writing it. Each fails with its refresh removed.

    - `[x]` **4.R.b Restate the `conformance-sync` comparison**
        - The notes compare against the second prototype's 24,959 starts and attribute the shortfall to the push-URL
          read repeated under one comparison hold, which function-keyed lookups do not share.

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

- `[ ]` Imported-claims publisher authority is read fresh before source retirement; publisher disappearance preserves
  the existing refusal, source refs, and keepers, and retry succeeds after repair (A1).
