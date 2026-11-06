# Task List: test-typecheck-heap

- **Design:** `spec-test-typecheck-heap.md`

---

## **Phase 1:** One shard on TypeScript 7, bounded and measured

_Purpose:_ The first shard type-checks through the new script on the real native compiler, under its soft limit and
backstop, and prints its peak, on WSL and on m4-mini. This settles the parts no unit test can: the alias launcher's
`process.execve`, the shell that sets the backstop, the `/proc/<pid>/exe` identity rule, and the platform package on
m4-mini. Each settles before the partition is built out.

_Mode:_ `slice` through Phase 4 — closes on both type checks and typed linting running through one script, each process
bounded where it runs TypeScript 7 and each printing its peak.

_Design decisions:_ The script's logic lives in modules under `packages/arc-framework/src/scripts/typecheck/`, beside a
thin entry at `src/scripts/run-typecheck.ts`. The npm scripts stay as they are until Phase 2 has every shard and the
coverage test, so no commit before then narrows what the commit gate checks.

### `[ ]` **1.1 Install TypeScript 7 beside TypeScript 6 — D5**

- _Goal:_ `typescript-7` resolves to TS 7.0.x with its platform package installed, while `typescript` stays 6.0.x
  for every tool and compiler-API user.

- _Note:_ The change's pull request says that in-flight branches run `npm ci` after their next base merge.

    - Add `"typescript-7": "npm:typescript@^7.0.2"` to `packages/arc-framework/package.json`'s `devDependencies`,
      beside `"typescript": "^6.0.3"`, through a workspace install from the repository root, so `package-lock.json`
      gains the alias and its `@typescript/typescript-<platform>-<arch>` optional packages with integrity hashes
    - `ignore-scripts=true` in `.npmrc` holds; `npm run setup` still passes `check:install`
    - Confirm `require("typescript").version` is still 6.0.x from the package root, and that `typescript-7`'s
      launcher is `bin/tsc` with `lib/tsc.js` and `lib/getExePath.js` beside it
    - After `npm ci`, confirm `node_modules/.bin/tsc` still links `typescript`'s own `bin/tsc`. Until 2.4 switches
      them, `typecheck` and `typecheck:test` run the bare `tsc`. If the link were TS 7, every gate in between would
      run it with four checkers and no `GOMEMLIMIT`, which ran out of memory under a 6 GiB cap. A TS 7 link stops the
      task

### `[ ]` **1.2 Add the shard base and the `integration-store` shard — D1**

- _Goal:_ One shard config parses to `tsconfig.test.json`'s options without the declaration pass, with the store
  integration tests as its only roots.

    - `tsconfig.shards.json`: extends `./tsconfig.test.json`; `compilerOptions` sets only `declaration: false` and
      `declarationMap: false`
    - `tsconfig.shard-integration-store.json`: extends `./tsconfig.shards.json`; `include`
      `__tests__/integration/store-ref-*` and `__tests__/integration/store`; `exclude` `node_modules` and `dist`;
      `tsBuildInfoFile` `node_modules/.cache/tsc/shard-integration-store.tsbuildinfo`
    - `integration-store` comes first because it is the smallest shard and its `include` stands alone, with no
      `exclude` that another shard's patterns feed

### `[ ]` **1.3 Resolve the TypeScript 7 compiler or refuse with its remedy — D3**

- _Goal:_ The script finds TS 7's launcher and native binary from its own module and never uses
  `node_modules/.bin/tsc`. When either package does not resolve, it runs no compiler and exits 1 naming the missing
  package and `npm ci`.

    - New module `src/scripts/typecheck/compiler.ts`
    - Resolve `typescript-7/package.json`, which the package's `exports` exposes (`bin/tsc` it does not), and take
      the launcher from its `bin.tsc` entry
    - Resolve `@typescript/typescript-${process.platform}-${process.arch}/package.json` from `typescript-7`'s own
      location, as the launcher's `getExePath` does; the native binary is its `lib/tsc` (`tsc.exe` on Windows). The
      identity rule (1.5) compares against this path
    - The refusal names the package and the remedy, in the shape of `captureBuildContext`'s own (`run npm ci`)
    - Unit tests in `__tests__/unit/scripts/typecheck/compiler.test.ts`, with resolution injected
    - Build `test-first` (one behavior at a time):
        - Both packages resolve: the launcher and native binary paths come from the two package manifests
        - On Windows the native binary carries `.exe`
        - `typescript-7` missing: the refusal names `typescript-7` and `npm ci`
        - The platform package missing: the refusal names `@typescript/typescript-<platform>-<arch>` and `npm ci`

### `[ ]` **1.4 Launch a compiler under its soft limit and backstop — D3**

- _Goal:_ Each TS 7 process runs `--noEmit -p <config> --checkers 1` plus any forwarded arguments. The script's soft
  limit replaces any inherited `GOMEMLIMIT`. On Linux the process runs under an address-space limit of the soft limit
  plus the margin, never above an inherited limit. One process id passes through the shell, the launcher and the
  native binary.

    - New module `src/scripts/typecheck/memory-bound.ts` for the soft limit, margin and backstop; process launch in
      `src/scripts/typecheck/processes.ts`
    - Soft limit here is the fixed 6000 MiB; the cgroup term joins in 3.1
    - Margin constant `1817` MiB, from the desktop's largest `VmPeak` − `VmHWM` gap (1,305 MiB) plus 512 MiB, never
      below 1,331 MiB; 3.4 sets the final value from m4-mini's sample
    - Inherited limits: soft and hard "Max address space" from `/proc/self/limits`, `unlimited` meaning none. The
      backstop is the soft limit plus margin, and none is set when either inherited limit is already lower, so the
      compiler runs under the inherited one
    - Linux launch: `/bin/sh -c` with a fixed script that sets `ulimit -v` in KiB and then `exec`s the running Node
      on the launcher, the paths and arguments passed as positional parameters, never interpolated into the script
    - Elsewhere: spawn the running Node on the launcher directly, with `GOMEMLIMIT` and `--checkers 1`, and no
      backstop
    - Unit tests in `__tests__/unit/scripts/typecheck/memory-bound.test.ts` and `processes.test.ts`
    - Build `test-first` (one behavior at a time):
        - The compiler arguments are `--noEmit -p <config> --checkers 1`, then the forwarded arguments in order
        - The child environment's `GOMEMLIMIT` is the soft limit as `<n>MiB`, replacing an inherited value
        - With unlimited inherited limits, the backstop is the soft limit plus the margin, in KiB for `ulimit -v`
        - An inherited soft limit below that sets no backstop; so does an inherited hard limit below it
        - `/proc/self/limits` parsing reads both columns of the address-space row, with `unlimited` as none
        - On Linux the launch is `/bin/sh -c` with the fixed script and positional arguments; elsewhere it is the
          launcher directly, with no backstop

### `[ ]` **1.5 Read the native compiler's peak and print its line — D3**

- _Goal:_ After a compiler exits, one line gives the check, the shard where there is one, the peak RSS in MiB from
  `VmHWM` counted only while `/proc/<pid>/exe` is the native `tsc`, and the soft limit it ran under. A process that
  never became the native binary reads `peak: unavailable`, naming the program seen, and so does any platform
  without `/proc`.

    - New module `src/scripts/typecheck/peak.ts`: `/proc/<pid>/status` parsing, the identity rule, polling at a
      fixed short interval until exit, and line formatting
    - The kernel restarts `VmHWM` at each exec (about 40 MiB in the launcher, then the native binary's own), so
      samples taken before the process becomes the native binary never count
    - `/proc/<pid>/exe` reads as a resolved path, so compare it with the real path of the binary 1.3 resolved
    - Unit tests in `__tests__/unit/scripts/typecheck/peak.test.ts`, with `/proc` reads injected
    - Build `test-first` (one behavior at a time):
        - `VmHWM` parses from a status text to MiB
        - Samples count only while the exe is the expected program; the peak is the largest counted sample
        - A process that never becomes the expected program reads `peak: unavailable` and names the exe seen
        - No `/proc`: `peak: unavailable`
        - The line carries the check, the shard when present, the MiB figure and the soft limit

### `[ ]` **1.6 Run the first shard through the script on WSL and m4-mini — D3**

- _Goal:_ `node --import tsx src/scripts/run-typecheck.ts test`, run from the package root, discovers the shard
  configs and runs `integration-store` with zero errors and a peak line read from the native compiler, on WSL under
  the backstop and on m4-mini.

    - Thin entry `src/scripts/run-typecheck.ts`, as `run-build.ts` and `run-local-test-tier.ts` are; it parses the
      mode, and an unknown mode exits 1 naming it
    - The package root comes from the script's own location, as `run-build.ts` takes it from `import.meta.dirname`,
      so the same command also runs from the repository root
    - Shard discovery in `src/scripts/typecheck/shards.ts`: exported, returning the `tsconfig.shard-*.json` files in
      the package root sorted by shard name; the base `tsconfig.shards.json` falls outside the pattern
    - Build `test-first` (one behavior at a time):
        - Discovery returns shard configs in name order, with the shard name taken from the file name
        - The base config and other `tsconfig*.json` files are not shards
    - On WSL, read `/proc/<pid>/limits` of the running native `tsc` once and confirm its "Max address space" is the
      soft limit plus the margin, 8,196,718,592 bytes at 6000 + 1,817 MiB; any other value stops the phase. The run
      needs an inherited limit above that, so under the host's memory gate use `memcap_gated -m 8G`, not a lower cap,
      which by 1.4's rule sets no backstop
    - On m4-mini, through a pinned `arc-offload` run of the same command whose placement its `exit … on m4-mini` line
      proves, the peak line must name a figure read from the native binary of the runner's own platform package;
      `unavailable` there stops the phase. See `notes-test-typecheck-heap.md` § Measuring on m4-mini › Placement

## **Phase 2:** The five-shard partition replaces the single test program

_Purpose:_ The test type check becomes the five shards of the spec's partition, guarded by the coverage test, and both
type-check npm scripts switch to the script. This is the first point at which TS 7's landing condition, the same
verdicts as TS 6 and a clean run on m4-mini, can be tested across the whole partition.

### `[ ]` **2.1 Add the remaining four shard configs — D1**

- _Goal:_ `unit-a`, `unit-b`, `integration` and `rest` carry the `include` and `exclude` of the spec's shard table, so
  that every test root falls in one shard and a new directory lands without a config change.

    - Each extends `./tsconfig.shards.json`, restates `node_modules` and `dist` in its `exclude`, and sets its own
      `tsBuildInfoFile` under `node_modules/.cache/tsc/`
    - `unit-b` excludes `unit-a`'s three directories; `integration` excludes `integration-store`'s two patterns;
      `rest` excludes `__tests__/unit` and `__tests__/integration` and includes the two config files

### `[ ]` **2.2 Guard the partition with the coverage test — D2**

- _Goal:_ The shards' roots taken together equal `tsconfig.test.json`'s roots outside `src/` and `examples/`, each a
  root of exactly one shard, with options equal to the reference's apart from the three the shards set. On synthetic
  inputs the comparison reports a missing file, a doubled file and a changed option, each naming the file or option
  and the shard.

    - Exported pure comparison in `src/scripts/typecheck/shards.ts`, over file lists and parsed options. The module
      imports no `typescript`, so the script's own process never loads the TS 6 compiler (about 110 MiB measured)
    - The coverage test parses every discovered shard config and `tsconfig.test.json` with `typescript` 6's
      `ts.readConfigFile` and `ts.parseJsonConfigFileContent` against absolute paths, building no program
    - Options compared apart from `declaration`, `declarationMap`, `tsBuildInfoFile` and the parser's own
      `configFilePath`
    - Synthetic cases in `__tests__/unit/scripts/typecheck/shards.test.ts`; the live partition in
      `__tests__/unit/scripts/typecheck/shard-coverage.test.ts`, which uses the same discovery function the script
      runs
    - Build `test-first` (one behavior at a time):
        - No shard configs fails
        - A file the reference has and no shard has fails, naming the file
        - A file two shards both have fails, naming the file and both shards
        - A shard root the reference lacks fails, naming the file and the shard
        - A changed option fails, naming the option and the shard
        - The three set options and `configFilePath` never fail
        - A matching partition passes
        - The live shard configs pass against `tsconfig.test.json`

### `[ ]` **2.3 Run every shard in turn and aggregate their exits — D3**

- _Goal:_ `test` runs each discovered shard in name order with a header line before its output, runs every shard
  after one fails, and exits with the first non-zero status. `src` runs one process over `tsconfig.json`. A process
  ended by a signal counts as 128 plus the signal's number.

    - Move `signalExitCode` out of `src/lib/checks/process.ts` into a leaf module, `src/lib/checks/signal-exit-code.ts`,
      that both import, so the script reports a signal as ARC's check runner does. Importing `process.ts` itself would
      load its `execa` and Git-environment graph into the script's process (about 36 MiB and 0.3 s measured)
    - The run loop in `src/scripts/typecheck/run.ts` takes the launch function as a parameter, `processes.ts`'s in
      production. Its unit tests in `__tests__/unit/scripts/typecheck/run.test.ts` script exits and signals through a
      fake launch and start no process, as the unit tier's guard (`installUnitProcessGuard` in
      `__tests__/helpers/unit-setup.ts`) requires
    - Build `test-first` (one behavior at a time):
        - `test` runs the shards in name order, each preceded by a header naming it
        - A failing shard does not stop the later ones
        - The exit status is the first non-zero one; all zero exits 0
        - A signal-ended process counts as 128 plus its number and wins if it is the first non-zero
        - `src` runs one process over `tsconfig.json`, its peak line naming no shard

### `[ ]` **2.4 Switch both type checks to the script and check TS 7's verdicts — D4, D8**

- _Goal:_ `npm run typecheck` and `npm run typecheck:test` run through the script on TS 7 and report zero errors where
  TS 6's `tsc --noEmit` reports zero over `tsconfig.json` and `tsconfig.test.json`. A planted error in a root of each
  shard and in each `checkJs` root fails its check, naming the file. If TS 7 misses a verdict, or fails on m4-mini,
  work stops for the spec's TypeScript 6 amendment.

    - `packages/arc-framework/package.json`: `typecheck` and `typecheck:test` as the spec's script table gives them;
      `typecheck:all` unchanged
    - TS 6's verdicts from `typescript`'s own `bin/tsc` over both configs at the same tree, at a 6144 MiB V8 heap on a
      host with room for it, as `notes-test-typecheck-heap.md` § Measuring on m4-mini gives the TS 6 baseline
    - Planted errors in a disposable copy, one per shard root; `__tests__/fixtures/checks/runner-proxy.mjs` for
      `typecheck:test` and `examples/check-runner/local.mjs` for `typecheck`
    - The commit's gate places `typecheck:test` on m4-mini by its route. From the check's saved log, confirm its
      `running sibling on m4-mini` line and that the check passed with five peak lines; the same notes section says
      where a passing check's log is

## **Phase 3:** Bounds that follow the runner and peaks that flag a split

_Purpose:_ Completes the memory bound and the peak line: the soft limit drops under a job's cgroup bound, abnormal ends
keep their peak line, a shard near the target says it is due for a split, and the backstop margin takes m4-mini's
measured gap.

### `[ ]` **3.1 Keep the soft limit under the job's cgroup bound — D3**

- _Goal:_ On Linux the soft limit is 6000 MiB, or the smallest numeric `memory.max` on the path from the script's own
  cgroup to the root less 512 MiB when that is lower. No bound applies for `max`, a missing file or no `0::` entry.

    - In `src/scripts/typecheck/memory-bound.ts`: the path is the `0::` entry of `/proc/self/cgroup`, read under
      `/sys/fs/cgroup` from that cgroup up to the root; reads are injected
    - Build `test-first` (one behavior at a time):
        - A numeric `memory.max` bounds the soft limit
        - Of nested numeric bounds, the smallest applies
        - `max`, a missing file and a missing `0::` entry each mean no bound
        - A 5,120 MiB bound gives 4,608 MiB; an 8,192 MiB bound gives 6000 MiB; no bound gives 6000 MiB
        - The backstop follows the bounded soft limit

### `[ ]` **3.2 Keep the peak line for a process that ends abnormally — D3**

- _Goal:_ A compiler ended by a signal gets a peak line with its RSS that names the signal. An overrun that ends with
  Go's `fatal error: out of memory` and status 2 keeps its peak line, so the output and that line tell it from the
  configuration errors TS 7 also ends with status 2, such as a missing root file; a type error exits 1.

    - Build `test-first` (one behavior at a time):
        - A signal-ended process's line gives RSS and names the signal
        - A status-2 exit is reported with its peak line like any other exit

### `[ ]` **3.3 Mark a shard due for a split — D3**

- _Goal:_ A shard whose peak is at or above 2,765 MiB carries a marker saying it is due for a split. When
  `GITHUB_STEP_SUMMARY` is set, the marked line is also appended to the step summary. The marker never changes the exit
  status, and `typecheck`'s line never carries it.

    - The threshold compares the same whole-MiB figure the line prints
    - Build `test-first` (one behavior at a time):
        - 2,764 MiB carries no marker; 2,765 MiB does
        - `src`'s line never carries it, whatever its peak
        - With `GITHUB_STEP_SUMMARY` set, a marked line is appended to that file; unset, nothing is written
        - An unmarked line is never appended
        - The exit status is unchanged by a marker

### `[ ]` **3.4 Set the backstop margin from m4-mini's gap and probe the backstop — D3**

- _Goal:_ The margin constant is 512 MiB above the larger of the desktop's gap and m4-mini's, never below 1,331 MiB.
  Under an inherited `ulimit -v` of 2 GiB, `npm run typecheck:test` fails with a non-zero status and a peak line for
  each shard.

- _Note:_ See `notes-test-typecheck-heap.md` § Measuring on m4-mini for how the sample is taken and recorded.

    - Sample `VmPeak` − `VmHWM` of the native binary once on m4-mini, under a 6000 MiB `GOMEMLIMIT` and one checker,
      through a one-off pinned `arc-offload` command whose placement its `exit … on m4-mini` line proves, as the notes'
      Placement bullet reads it; record the figure in the notes
    - Update the constant only when m4-mini's gap is larger than the desktop's 1,305 MiB
    - Probe: `ulimit -v 2097152` around `npm run typecheck:test` on WSL; every shard fails and prints its peak line

## **Phase 4:** Typed linting through the script, CI heaps and the records

_Purpose:_ `lint:ts` runs through the same script and reports V8's heap as well as RSS, CI's three steps take their
explicit heaps, and the technical overview and a new ADR record what landed. Cold runs on m4-mini then give the
figures behind the landing-handoff proposals.

_Exit criterion:_ At the phase's head, `npm run typecheck`, `npm run typecheck:test` and `npm run lint:ts` each run
through `run-typecheck.ts` and pass. Every process prints its peak line: each TS 7 line carries its soft limit, and
`lint:ts`'s carries V8's heap in use and heap limit. The commit and push gates pass them in the pool.

### `[ ]` **4.1 Run eslint through the script with its peak and heap — D3, D7**

- _Goal:_ `lint -- <args>` runs one eslint process from the package's own eslint bin with a heap preload. It exits
  with eslint's own status (0, 1, or 2 for an unused suppression), or 128 plus the signal's number. Its peak line gives
  RSS counted while the process is `node`, plus V8's heap in use at exit and its heap limit in MiB, or `unavailable`
  heap after a signal.

    - Resolve `eslint/package.json` (exported) and take its `bin.eslint`; start
      `process.execPath --import <preload> <eslint bin> <args>` directly, with no shell, in the package root that 1.6
      derives, so eslint finds its config and suppressions baseline and its arguments stay package-relative, as
      `lint:ts` passes them
    - The `--` after `lint` ends the script's own arguments; everything after it reaches eslint unchanged, including
      what npm appends from the caller
    - Preload `src/scripts/typecheck/heap-report.ts`: erasable syntax only and no relative imports, so Node 24 loads it
      natively; at exit it writes `v8.getHeapStatistics()`'s heap in use and heap limit to the file an environment
      variable names. Being `.ts` under `src`, it falls within the checks' declared `src/**/*.ts` inputs
    - The eslint plan (argv, working directory and heap-file variable), the heap-file parse and the run live in
      `src/scripts/typecheck/lint.ts`, which takes the launch function as 2.3's run loop does; unit tests in
      `__tests__/unit/scripts/typecheck/lint.test.ts`
    - Build `test-first` (one behavior at a time):
        - The eslint argv is the running Node, the preload import, the eslint bin and the caller's arguments in order
        - Statuses 0, 1 and 2 pass through unchanged
        - A signal-ended eslint counts as 128 plus its number, never 1
        - The heap file parses to heap in use and heap limit in MiB, and the line carries both
        - A signal-ended eslint's line gives RSS, names the signal and reads the heap as `unavailable`
        - A missing heap file reads the heap as `unavailable`
        - Identity for eslint is `node`, the running Node's executable

### `[ ]` **4.2 Switch `lint:ts` to the script — D4, D7**

- _Goal:_ `npm run lint:ts` runs eslint over `src/`, `__tests__/` and `examples/` through the script and prints its peak
  line with heap. `npm run lint:ts -- --prune-suppressions` reaches eslint, and an unused suppression exits 2.

    - `packages/arc-framework/package.json`: `lint:ts` as the spec's script table gives it; `lint:ts:file` unchanged
    - Probe: one unused entry added to `eslint-suppressions.json` in a disposable copy exits 2

### `[ ]` **4.3 Pin CI's lint heaps and release the test type check's — D6**

- _Goal:_ In `ci.yml`'s `lint-typecheck` job, `typescript` and `typescript-files` set
  `NODE_OPTIONS: --max-old-space-size=4096`, `typecheck-tests` sets no `NODE_OPTIONS`, and `typecheck` sets nothing.

### `[ ]` **4.4 Record TypeScript 7 for the type checks in the technical overview — D9**

- _Goal:_ `TECHNICAL-OVERVIEW.md` § 3's TypeScript line and § 4's Quality Gates entry say that the two type checks
  run on TypeScript 7 through `src/scripts/run-typecheck.ts`, `typecheck:test` as five shards and `typecheck` as one
  process, beside TypeScript 6 for tooling.

### `[ ]` **4.5 Write the ADR for sharding and TypeScript 7 — D9**

- _Goal:_ A new ADR, working title "Shard the test type check and run type checks on TypeScript 7", records the spec's
  sharding, declaration-pass, check-shape and forward-path decisions. It also records the script-owned memory bound,
  TS 7 beside TS 6, typed linting as one process, and the verdict-authority residual with their alternatives. It reads
  `Accepted (YYYY-MM-DD)` in this change, so `lint:adr:status` and `lint:adr:numbers` pass at the merge gate.

- **Additional Context:** `strategy-adr-methodology.md`

    - Number: the next free one against the base at the time of writing
    - Covers the spec's "Covered by the new ADR" set; the `none` dispositions stay out

### `[ ]` **4.6 Measure the landing figures on m4-mini and draft the handoff — D3**

- _Goal:_ Cold runs on m4-mini under its landing settings give the peaks of `typecheck`, every shard and `lint:ts`,
  and `typecheck:test`'s wall time against Success Criterion 5's 45 s. From the peaks, `notes-test-typecheck-heap.md`
  § Landing handoff records the spec's landing-handoff proposals with the figures behind each. Verification keeps that
  section and § Measuring on m4-mini through its notes consolidation, and its commit body carries the whole handoff to
  the Owner: the proposals, the Owner's calls and the m5-air first-run check.

- _Note:_ The pool registry is the Owner's. This task proposes values and applies none, and they stay out of Success
  Criteria.

    - Take every run as `notes-test-typecheck-heap.md` § Measuring on m4-mini describes: pinned, cold, and its
      placement proven by its `exit … on m4-mini` line as the Placement bullet reads it
    - Open § Landing handoff with a line saying verification keeps the section through its notes consolidation and
      carries all of it, proposals, Owner's calls and the m5-air check, into the verification commit body
    - `typecheck` and `typecheck:test` under the script's own soft limit and backstop, timing the cold
      `typecheck:test` run as the notes' Timing bullet says; `lint:ts` three times with
      `NODE_OPTIONS=--max-old-space-size=4192`, reading V8's heap in use and RSS from each peak line
    - Write § Landing handoff: each figure with its run and head, then every proposal and Owner's call the spec's
      Cross-cutting › Landing handoff gives, which is the authority for the list below
    - The proposals: the charges, `typecheck:test` from its largest shard's peak plus a margin, `typecheck` from its
      own peak plus a margin, and `typecheck:all` from the larger of the two; m4-mini's `heap_mb` from 6144 to
      4192 MiB; `lint:ts`'s charge from 5,000 to 4,200 MB or the higher figure the runs support; and `m5-air-ac` and
      `m5-air-battery` added to the `typecheck` route
    - The Owner's calls: whether to accept `typecheck:test` running beside `test:changed` on m4-mini, whose pair can
      exceed its VM; whether a pinned run under arguments no route matches, such as the script invoked directly, may
      reach m5-air before the route edit does; and whether the `typecheck:test` and `typecheck:all` routes follow and
      regain `allow_local`
    - The first m5-air `typecheck` run's check: its peak line should show a 4,608 MiB soft limit. A 6000 MiB line
      means the script found no bound; the job cgroup's own `memory.max` tells whether the cap was not in force or the
      script's read missed it, and the route edit is undone until the cause is known

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The coverage test passes at the verified head, and on synthetic inputs its comparison reports a missing file, a
  doubled file and a changed option, each naming the file or option and the shard.

- `[ ]` `npm run typecheck:test` runs the five shards in turn on TypeScript 7, each with `--checkers 1` and the soft
  limit (6000 MiB where no cgroup bound is lower). On Linux each runs under the backstop, whose margin comes from the
  desktop gap and m4-mini's sample. Each prints its peak line with its soft limit, and `npm run typecheck` does the same
  over `tsconfig.json`.

- `[ ]` Cold (no incremental state file) on m4-mini under its landing settings, the peak lines of `typecheck` and of
  every shard each carry a figure read from the native compiler, and every figure is below 3,072 MiB; an
  `unavailable` line fails this.

- `[ ]` At the verified head both type checks report zero errors on TypeScript 7, as TypeScript 6's `tsc --noEmit` does
  over `tsconfig.json` and `tsconfig.test.json`. A type error planted in one root of each shard fails
  `typecheck:test` naming that file. So does one in `__tests__/fixtures/checks/runner-proxy.mjs` for `typecheck:test`,
  and one in `examples/check-runner/local.mjs` fails `typecheck`.

- `[ ]` Cold on m4-mini, `typecheck:test` completes in at most 45 s.

- `[ ]` Under an inherited `ulimit -v` of 2 GiB, `npm run typecheck:test` fails with a non-zero status and a peak line
  for each shard.

- `[ ]` CI's `typescript` step passes `lint:ts` at its explicit 4096 MiB heap, and the log shows `lint:ts`'s peak line
  with heap in use. `npm run lint:ts -- --prune-suppressions` reaches eslint, and `lint:ts` exits 2 when a suppression
  is unused.

- `[ ]` In `ci.yml`, `typescript` and `typescript-files` set `NODE_OPTIONS: --max-old-space-size=4096`, and
  `typecheck-tests` sets no `NODE_OPTIONS`.

- `[ ]` `TECHNICAL-OVERVIEW.md` records TypeScript 7 for the type checks, and the new ADR reads Accepted at the
  verified head.

- `[ ]` Unit tests cover the cgroup bound's parsing (a numeric `memory.max`, the smallest of nested ones, `max`, a
  missing file and no `0::` entry) and the soft limit's computation: 4,608 MiB under a 5,120 MiB bound, 6000 MiB under
  an 8,192 MiB bound and 6000 MiB with none.

- `[ ]` All quality gates pass, and hosted CI passes at the verified head.

- `[ ]` Ready for integration.
