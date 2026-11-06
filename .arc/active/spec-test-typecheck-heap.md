# Spec (`detailed` · `RFC`): test-typecheck-heap

- **Origin:** [internal]

- **Purpose:** Bound the memory each type-check process needs, so that the suite's growth stops moving heap
  ceilings every few weeks. The test type check becomes five shard programs run one after another. Both type checks
  run on TypeScript 7 under a memory bound their own script sets. Every type-check process, and `lint:ts`, reports
  its peak, so each ceiling can be read from ordinary runs.

---

## Introduction / Context

**The check.** `typecheck:test` runs `tsc --noEmit --project tsconfig.test.json` in `packages/arc-framework`. That
config's `include` puts `src`, `__tests__`, `examples`, `build-compiler.config.ts` and `vitest.config.ts` into one
program of about 935k lines (`src` about 346k, `__tests__` about 583k). It is a commit-gate check in
`.arc/system/arc-checks.yml`, CI's `typecheck-tests` step (mapped in `.github/check-plumbing.yml`), and the second half
of `typecheck:all`. `typecheck` checks `src` and `examples` alone over `tsconfig.json`.

Typed linting builds a different program. `eslint.config.js` turns type-aware rules off for `__tests__/**`
(`tseslint.configs.disableTypeChecked`). typescript-estree resolves each remaining file to the first
`parserOptions.project` entry whose program contains it (`getWatchProgramsForProjects`), and that is `tsconfig.json`
for every `src` and `examples` file. So `lint:ts` builds only the `src` program and grows with `src`, not the tests.

**Measured** cold on 2026-11-05, at `43a8680c1b`'s content outside `.arc/`. Peak RSS is the process's kernel
high-water mark. "Heap at end" is tsc's "Memory used": heap in use when the run ends, so below the peak.

| Program                                      | Heap at end (GiB) | Peak RSS (GiB) | Wall (desktop) |
| -------------------------------------------- | ----------------- | -------------- | -------------- |
| Test program, TS 6.0.3                       | 4.00              | 4.47           | 76 s           |
| Test program, TS 6, `declaration: false`     | 3.84              | 4.11           | 69 s           |
| Test program, TS 7.0.2, `GOMEMLIMIT=6000MiB` | —                 | 4.93           | 30 s           |
| `src` alone (`typecheck`), TS 6              | 2.19              | 2.41           | 27 s           |
| `src` alone, TS 7, `GOMEMLIMIT=6000MiB`      | —                 | 2.15           | 12 s           |

The same test program takes 37 s cold on m4-mini, the pool runner that hosts this check. CI failed it with an
out-of-memory error at a 4096 MiB V8 heap.

**Growth.** End-of-run heap grew 0.49 GiB a week for the whole test program between 2026-10-20 and 11-04. `src`
alone grew 0.24 GiB a week under `typecheck`, which includes a declaration pass. Each raise of the ceiling has bought
weeks. CI now runs the step at 6144 MiB, which lasts until about early December at that rate. The pool runs it on
m4-mini under a runner-wide 6144 MiB heap that every Node job there inherits. The desktop fallback has no room for
a 6 GiB check.

**What drives it.**

- **Program size.** Parsing and binding the whole program, before any checking, take about 1.7 GiB. One program over
  everything cannot stay bounded.
- **zod schema types.** Stubbing zod's types to `any` cuts the test program's end-of-run heap by 20% and its
  instantiations by 69%. That is an upper bound, since the stub also erases the types the tests check against.
- **Bloated declarations.** Emitting `src` declarations produces 612k lines from 346k source lines, 540k of them from
  zod-importing modules. `src/scripts/review-gate/status.ts` alone emits 238,705 lines from 1,662. A test program
  checked against those declarations ran out of memory at 4.81 GiB RSS, more than the same program checked against
  source.

**Where it runs.**

- In CI: a 16 GB GitHub-hosted runner, with the step running alone in the `lint-typecheck` job. Each step runs the
  command declared in `.arc/system/arc-checks.yml` (`runCiCheckStep` in `src/lib/ci-check-runner.ts`).
- In the commit gate: through arc-offload's pool or locally. Every gate run starts cold. The adapter materializes the
  plan from a Git tree into a fresh directory with no ignored files, so no incremental state survives between runs
  (`checkout-index` in `src/lib/checks/runner/source-materialize.ts`).
- The pool forwards only listed variables to a job: `ARC_*`, `VITEST*`, `CI`, `NO_COLOR`, `FORCE_COLOR`, plus a
  `NODE_OPTIONS` heap flag from the runner's `heap_mb` (`runner_environment` in arc-offload's
  `arc_offload/execution.py`). A Go process ignores V8's `--max-old-space-size`, so no forwarded setting gives a TS 7
  compiler a target to collect against. A runner's `memory_max_mb`, where set, reaches the job only as its cgroup's
  `memory.max` (§ 3.3).

## Goals

1. Each type-check process peaks below about 3 GiB RSS at landing, cold, and test growth is absorbed by adding a shard
   rather than raising a ceiling.
2. The type checks reach the same verdicts as the programs they replace. No strictness option, included test file,
   or `checkJs` setting changes.
3. A file added to `__tests__` is checked without a configuration change, and a partition edit that drops or doubles a
   file fails the unit tests.
4. Type checks on TypeScript 7 carry a memory bound that one rule in the script sets, in CI, in the pool and locally.
5. Every type-check process and `lint:ts` print their peak memory, so ceilings and charges can be re-read from ordinary
   runs.
6. `typecheck:test`'s cold time on m4-mini stays near today's 37 s.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No weakening of what is checked.** The shard configs drop the declaration pass (§ 1.2), and nothing else is
  removed.
- **No change to exported schema types or to declaration size.** Checking the shards against compact `src`
  declarations is a later step, which keeps this design's partition and coverage test (§ 1.5).
- **No test-suite consolidation or test removal.** A sampled audit found about 5–8% of test lines removable by
  consolidation, worth a few days of growth.
- **No change of linter, and no TypeScript 7 for typed linting, the declaration build or the TypeScript 6 deprecation
  bridge** (`ignoreDeprecations` in `tsconfig.json`).
- **No seeding of incremental state for gate runs.** Gate runs stay cold. Each shard keeps its own incremental state
  file, which helps only runs outside the gate.
- **No pool or machine configuration in the repository.** Runner heaps, admission charges, routes and the WSL
  memory limit are machine configuration the Owner sets. § Cross-cutting › Landing handoff proposes the values.
- **No splitting of `typecheck` or `lint:ts`.** Each stays one program over `src`.

## Proposed Design

### 1. Shard layout

#### 1.1 Configs

The test program becomes five shard configs at the package root, named `tsconfig.shard-<name>.json`. Each extends a
shared base, `tsconfig.shards.json`, a name the shard pattern does not match. The base extends `tsconfig.test.json`
and sets only `declaration: false` and `declarationMap: false`. Each shard sets its own `include`, `exclude` and
`tsBuildInfoFile`.

| Shard               | `include`                                                                  | `exclude` beyond `node_modules`, `dist`   |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| `unit-a`            | `__tests__/unit/scripts`, `__tests__/unit/lib`, `__tests__/unit/work-unit` | —                                         |
| `unit-b`            | `__tests__/unit`                                                           | `unit-a`'s three directories              |
| `integration-store` | `__tests__/integration/store-ref-*`, `__tests__/integration/store`         | —                                         |
| `integration`       | `__tests__/integration`                                                    | `integration-store`'s two patterns        |
| `rest`              | `__tests__`, `build-compiler.config.ts`, `vitest.config.ts`                | `__tests__/unit`, `__tests__/integration` |

- `exclude` replaces the inherited list rather than merging with it, so every shard restates `node_modules` and
  `dist`.
- `tsBuildInfoFile` is `node_modules/.cache/tsc/shard-<name>.tsbuildinfo`, with `incremental` inherited from
  `tsconfig.json`.
- A shard's roots are its test files only, plus the two config files in `rest`. `src` and `examples` are roots of no
  shard. A shard checks the `src` modules its roots import, under the test options.

**New files land in a shard without a config change.** A new directory under `__tests__/unit` lands in `unit-b`, one
under `__tests__/integration` lands in `integration`, and any other new directory under `__tests__` lands in `rest`.
`rest` therefore holds `e2e`, `benchmarks`, `helpers`, `fixtures` and `reach` today.

#### 1.2 Why the shards drop the declaration pass

`typecheck` (over `tsconfig.json`, with `declaration: true`) and the full build's declaration emit (`dts: true` in
`tsup.config.ts`) still check `src`'s declarations. A shard's declaration pass would only repeat those diagnostics,
and test files are never emitted.

#### 1.3 `tsconfig.test.json` stays

`tsconfig.test.json` keeps its current content. It remains:

- the whole-program reference the coverage test compares the shards against (§ 2);
- the base the shards inherit their options from;
- the second entry in `parserOptions.project` in `eslint.config.js`.

`src` files no test imports are checked only by `typecheck`, which includes all of `src` and `examples` under stricter
unused-code options.

#### 1.4 Partition target and measured peaks

The target: every shard's peak RSS stays below about 3 GiB at landing, about half of TS 6's 6144 MiB heap and of
TS 7's 6000 MiB soft limit (§ 3.3), which leaves each shard room to grow before a split. At the fastest growth measured
on TS 6, 0.43 GiB a week of end-of-run heap for `__tests__/integration` between 2026-10-20 and 11-04, a shard at 3 GiB
would reach 6 GiB in about seven weeks. TS 7's growth is unmeasured; its peak lines show it. When a shard's peak line
carries the split cue (§ 3.4), split that shard. Add a config, and add the new shard's patterns to the `exclude` of the
shard it came from. The coverage test catches a split that drops or doubles a file.

Measured cold on the WSL desktop on 2026-11-05 with `--incremental false` (TS 7: one checker, `GOMEMLIMIT=6000MiB`;
TS 6: 6144 MiB heap). Every run reported zero errors. The shipped shards inherit `incremental` and write their state
file on every run, so Success Criterion 3's landing figures are taken under the shipped configs.

| Shard               | TS 7 peak RSS | TS 7 wall | TS 6 peak RSS | TS 6 wall |
| ------------------- | ------------- | --------- | ------------- | --------- |
| `unit-a`            | 1.81 GiB      | 10.3 s    | 2.58 GiB      | 27.2 s    |
| `unit-b`            | 1.95 GiB      | 11.3 s    | 2.82 GiB      | 29.3 s    |
| `integration-store` | 1.13 GiB      | 9.2 s     | 1.65 GiB      | 18.2 s    |
| `integration`       | 1.73 GiB      | 13.0 s    | 2.53 GiB      | 26.3 s    |
| `rest`              | 1.58 GiB      | 8.8 s     | 2.12 GiB      | 21.9 s    |

Together the five take 52.6 s on TS 7 and 123 s on TS 6, against 76 s for the single TS 6 program on the same
machine. On TS 6 every shard also stays under the target on the desktop, `unit-b` by only 181 MiB.

#### 1.5 Forward compatibility

A later change can check the shards against `src`'s emitted declarations rather than its source, once declarations are
compact enough. The partition and the coverage test stay as they are. The change adds:

- a composite `src` project that emits declarations only, since a referenced project may not disable emit;
- a `references` entry in every shard config, since `extends` does not carry `references` (`applyExtendedConfig` in
  TypeScript's config parser copies only `include`, `exclude`, `files`, `compileOnSave`, `watchOptions` and compiler
  options);
- a build of that project before the shards run, in the script or through build mode, since a `-p` run fails on
  declarations not yet built.

### 2. Coverage test

A unit test under `__tests__/unit/` guards the partition, since tsc reports nothing when one `include` pattern matches
no file. It parses every shard config and `tsconfig.test.json` with `typescript` 6's config parser
(`ts.readConfigFile`, `ts.parseJsonConfigFileContent`), without building a program. It asserts:

1. at least one shard config exists;
2. the shards' root files, taken together, equal `tsconfig.test.json`'s root files outside `src/` and `examples/`;
3. each of those files is a root of exactly one shard;
4. each shard's parsed compiler options equal `tsconfig.test.json`'s, except the options the shards set
   (`declaration`, `declarationMap`, `tsBuildInfoFile`) and the parser's own path fields.

TS 7 resolves the same files from each shard config as TS 6's parser does: `--listFilesOnly` on both compilers gave
identical lists for all five shards on 2026-11-05.

Shard discovery and the comparison are exported functions. The script runs the shards from the same discovery
function (§ 3.1), so every shard the test covers is a shard that runs. The comparison is a pure function over file
lists and options, unit-tested with synthetic inputs: a missing file, a doubled file and a changed option each
produce a failure that names the file or option and the shard.

### 3. Type-check script

`src/scripts/run-typecheck.ts`, run with `node --import tsx` from the package root. It is a `src` module, so the
source size gate, TSDoc lint, `typecheck` and typed linting all cover it.

#### 3.1 Modes

| Mode          | Runs                                                                         | npm script       |
| ------------- | ---------------------------------------------------------------------------- | ---------------- |
| `src`         | one TS 7 process over `tsconfig.json`                                        | `typecheck`      |
| `test`        | one TS 7 process per shard, in turn, ordered by shard name                   | `typecheck:test` |
| `lint -- <a>` | one eslint process with arguments `<a>`, from the package's own `eslint` bin | `lint:ts`        |

- **Compiler arguments.** Each TS 7 process gets `--noEmit -p <config> --checkers 1`, plus any arguments after the
  mode, such as `--extendedDiagnostics` or `--incremental false` for a measurement
  (`npm run typecheck:test -- --extendedDiagnostics`).
- **Shard runs.** In `test`, a header line naming the shard precedes each shard's output. Every shard runs even after
  one fails, so one run reports every error.
- **Exit status.** The script exits with the first non-zero status a compiler process returned. In `lint`, it exits
  with eslint's own status: 0, 1, or 2 for an unused suppression; the suppressions baseline relies on all three. Any
  process ended by a signal, eslint included, counts as 128 plus the signal number (§ 3.4), as ARC's check runner
  reports one (`signalExitCode` in `src/lib/checks/process.ts`), so a signal never reads as eslint's status 1.
- **Repeated `src` errors.** A type error in a `src` module several shards import appears once per such shard and
  again in `typecheck`. That repetition is accepted.

#### 3.2 Compiler resolution

The script locates TS 7 by resolving the `typescript-7` package (§ 5) from its own module and runs the package's
`bin/tsc` launcher with the running Node. It never uses `node_modules/.bin/tsc`. The launcher finds the native binary
in the platform package (`lib/getExePath.js`) and, outside Windows, replaces itself with it through `process.execve`,
which needs Node 22.15 or later (`lib/tsc.js` in the `typescript` 7 package); `packages/arc-framework/package.json`'s
`engines` (Node ≥ 24) covers that. When `process.execve` is unavailable or fails, the launcher instead runs the binary
as its child (`execFileSync`). § 3.4's identity rule catches that case, a Node too old for `process.execve` included.

When `typescript-7` or its platform package does not resolve, as on a branch that merged base without `npm ci`
(§ 5), the script runs no compiler and exits 1 with a message naming the missing package and the remedy, `npm ci`,
as `captureBuildContext` in `src/lib/build-context.ts` names its own.

#### 3.3 Memory bound on TypeScript 7

TS 7's memory is the script's to bound, for `typecheck` and every shard. A runner's `heap_mb` reaches only V8. Its
`memory_max_mb`, where set, caps the job's cgroup (`MemoryMax` through `systemd-run` in arc-offload's
`worker_command`), which kills a Go process at the cap but gives Go nothing to collect against. The script reads that
cap and keeps Go's target under it.

- **One checker.** `--checkers 1`. Both under a 6000 MiB `GOMEMLIMIT`, `unit-b` peaked at 3,103 MiB in 4.9 s with the
  default four checkers and at 2,005 MiB in 9.7 s with one. Four checkers cost 55% more memory for half the time and
  put the shard over the target.
- **Soft limit.** The script sets `GOMEMLIMIT` in each compiler's environment and replaces any inherited value. Below
  the limit Go's peak follows demand. Go's own collector, at its default `GOGC=100`, lets the heap reach about twice
  its live set before collecting; near the limit, Go collects harder. The limit is 6000 MiB, or the job's cgroup bound
  less 512 MiB when that is lower.
    - **6000 MiB** keeps the envelope CI and m4-mini already host for this check under TS 6's 6144 MiB V8 heap, and
      sits far above the 3 GiB shard target, so it shapes no healthy run.
    - **Cgroup bound, Linux only:** the smallest numeric `memory.max` on the path from the script's own cgroup up to
      the root. The path is the `0::` entry of `/proc/self/cgroup`, read under `/sys/fs/cgroup`, which is how
      arc-offload's runner script finds its job's cgroup (`lib/remote-worker.sh`). A value of `max`, a missing file or
      no `0::` entry means no bound. On WSL, whose cgroup v2 hierarchy carries no memory controller, there is none.
    - **The 512 MiB** leaves room in the same cgroup for npm, the script's own Node process (about 0.1 GiB) and the
      native compiler's memory outside Go's heap. Where the cap is in force in the job's cgroup, m5-air's 5,120 MiB
      `memory_max_mb` gives a 4,608 MiB limit and m2-mini's 4,352 MiB gives 3,840 MiB. Both are above `typecheck`'s
      2,201 MiB peak and the 3 GiB shard target.
- **Backstop, Linux only.** `GOMEMLIMIT` is a soft target that Go grows past rather than fails at. The script runs each
  compiler under an address-space limit (`ulimit -v`) of the soft limit plus a margin, so the soft limit engages first
  and an overrun fails loudly. The margin covers the largest gap between `VmPeak` and `VmHWM` over the TS 7 runs
  under a 6000 MiB `GOMEMLIMIT`. On the WSL desktop that gap is 1,239–1,305 MiB across every shard,
  `typecheck`, the whole test program and both checker counts, about constant with program size. It is sampled once on
  m4-mini at landing. The margin is 0.5 GiB above the larger of the two gaps, and never below 1.3 GiB. The desktop gap
  gives a provisional margin of 1,817 MiB, a limit of 7,817 MiB at the 6000 MiB soft limit, which stands unless
  m4-mini's gap is larger; the script carries the margin as a constant. An overrun ends with Go's `fatal error: out of
  memory` and exit status 2. TS 7 exits 1 on a type error, but some configuration errors, such as a missing root
  file, also exit 2, so the output and the peak line, not the status, tell an overrun apart from them.
  When a cgroup bound sets the soft limit, the backstop lets the compiler's RSS reach about the bound before it trips,
  so the bound, which also counts the job's other processes, normally ends an overrun first. In the pool, systemd then
  stops the job's whole scope, the script included, so no peak line or later shard follows, and arc-offload's result
  reports the kill (`oom_kills` in `lib/remote-worker.sh`). If the backstop trips first, the run ends as any overrun
  does, with its peak line.
- **Inherited limits.** The backstop never raises an address-space limit the environment already set. When the
  inherited soft or hard limit is lower, the compiler runs under it.
- **Elsewhere.** On other platforms the script sets the 6000 MiB soft limit and `--checkers 1`, reads no cgroup and
  applies no backstop.

#### 3.4 Peak line

After each process exits, the script prints one line with the check, the shard where there is one, the peak RSS in
MiB and, for a TS 7 process, the soft limit it ran under (§ 3.3).

- **Process identity.** On Linux the script starts each compiler through `/bin/sh -c`, which sets the backstop (§ 3.3)
  and then `exec`s the launcher, and it starts eslint directly. One process id therefore passes through the shell, the
  launcher and the native binary, and the kernel restarts `VmHWM` at each exec: about 40 MiB in the launcher and
  1.1 GiB in the native binary, measured on `integration-store`. The reader counts `VmHWM` only while
  `/proc/<pid>/exe` is the expected program: the platform package's native `tsc` for a type check, `node` for eslint.
  If the process never became that program, the line reads `peak: unavailable` and names the program it saw.
- **RSS.** Read from the kernel's high-water mark (`VmHWM` in `/proc/<pid>/status`), polled at a fixed short interval
  until the process exits. It is a lower bound within one polling interval. One mechanism covers the native TS 7
  binary and the Node eslint process.
- **Node heap.** For the eslint process, the line also gives V8's heap in use at exit and its heap limit, in MiB. A
  preload loaded with `--import` into that process writes them at exit to a file whose path the script passes in an
  environment variable. A heap ceiling is judged on that figure, not RSS: under a V8 limit, RSS can sit at or above
  the limit through lazy collection alone (`lint:ts` passed at a 3,072 MiB heap with 3,256 MiB RSS and 2,248 MiB in
  use at exit).
- **Abnormal end.** When a process ends by a signal, including V8's abort on heap exhaustion, which runs no exit
  handler, the process counts as 128 plus the signal number (§ 3.1). Its peak line gives RSS, names the signal and
  reads the heap as `unavailable`. A cgroup's out-of-memory kill in the pool stops the script as well (§ 3.3).
- **Split cue.** A shard's peak at or above 2,765 MiB, 90% of the 3 GiB target, adds a marker to its peak line saying
  the shard is due for a split (§ 1.4). When `GITHUB_STEP_SUMMARY` is set, the script also appends the marked line to
  the CI step summary. The cue is advisory and never changes the exit status. `typecheck`'s line carries no marker,
  since it cannot split; Cross-cutting › Memory gives its response.
- **Unavailable.** Without `/proc` (any platform but Linux), the line reads `peak: unavailable`. Every runner of these
  checks is Linux: CI's `ubuntu-latest` job, the pool's Linux runners and WSL.
- **When a figure is valid.** A peak holds only for the ceiling it ran under, since a larger ceiling lets collection
  wait. Figures that set charges are read on m4-mini under its landing settings from cold runs.
    - **Landing settings** are the ones the landing handoff proposes. For a type check they are the script's own soft
      limit and backstop, whatever the runner's heap. For `lint:ts` it is a 4192 MiB V8 heap, passed explicitly as
      `NODE_OPTIONS=--max-old-space-size=4192` while m4-mini's runner-wide heap is still 6144 MiB; the lower of the
      caller's and the runner's heap applies (`runner_environment` in arc-offload's `arc_offload/execution.py`).
    - **Cold runs** have no incremental state file, as every gate run starts. A run that finds a shard's state file can
      skip work and report a lower peak and time.

### 4. npm scripts and check declarations

| Script           | Command                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `typecheck`      | `node --import tsx src/scripts/run-typecheck.ts src`                               |
| `typecheck:test` | `node --import tsx src/scripts/run-typecheck.ts test`                              |
| `typecheck:all`  | unchanged: `npm run typecheck && npm run typecheck:test`                           |
| `lint:ts`        | `node --import tsx src/scripts/run-typecheck.ts lint -- src/ __tests__/ examples/` |
| `lint:ts:file`   | unchanged: `eslint`                                                                |

npm appends a caller's extra arguments after the script's own, so `npm run lint:ts -- --prune-suppressions` reaches
eslint unchanged, and eslint runs with the package as its working directory.

`.arc/system/arc-checks.yml` and the root `package.json` do not change. The checks keep their names, commands
(`npm run -s typecheck:test` and so on), gates and inputs, so the pool's routes and command classes keep matching.
The existing declared inputs already cover every new file:

- the script, through each check's `packages/arc-framework/src/**/*.ts`;
- the shard configs and their base, through the `packages/arc-framework/tsconfig*.json` global input;
- the TS 7 install, through the `package-lock.json` global input and the `.package-lock.json` runtime input.

### 5. TypeScript 7 dependency

`packages/arc-framework/package.json` adds the devDependency `"typescript-7": "npm:typescript@^7.0.2"` beside
`"typescript": "^6.0.3"`.

- `typescript` 6 stays for typescript-eslint, tsup's declaration build, the coverage test's config parser, and the
  code that uses its compiler API:
    - in `src`: `src/lib/vitest-reach.ts`, `src/lib/build-configuration.ts`, `src/lib/syntax-bindings.ts`, and
      `src/lib/command-input/source-scanner.ts` and `prompt-source.ts`;
    - the project's ESLint rules, `eslint/architecture-imports.ts` and `eslint/module-doc-comment.ts`;
    - test code: `__tests__/helpers/copy-live-dependencies.ts` and 14 test files.

  Nothing in the repository depends on which of the two packages npm links as `node_modules/.bin/tsc`.
- The 7.0.2 package declares no install scripts, which suits `ignore-scripts=true` in `.npmrc`. Its native binaries
  arrive as platform optional dependencies, `@typescript/typescript-<platform>-<arch>`.
- The new devDependency changes the lockfile. Every in-flight branch runs `npm ci` after its next base merge, and the
  change's pull request says so.

### 6. CI

In `.github/workflows/ci.yml`'s `lint-typecheck` job:

- `typecheck-tests` drops its `NODE_OPTIONS: --max-old-space-size=6144`, since the compiler is no longer Node.
- `typescript` (`lint:ts`) and `typescript-files` (`lint:ts:file` over the merge gate's selection) set
  `NODE_OPTIONS: --max-old-space-size=4096`. That pins today's default heap of about 4 GiB on a 16 GB runner, so a
  change in runner defaults cannot move it.
- `typecheck` sets nothing.

### 7. Typed linting

`lint:ts` stays one eslint process over `src`, `__tests__` and `examples`, building only the `src` program, so its
memory follows `src`'s growth and shards do not apply to it. It prints the peak line with V8's heap in use (§ 3.4).
On m4-mini it passed in about a minute with its heap held to 3,072 MiB. When its heap in use at exit nears CI's 4096
MiB, the answer is to raise that heap. ESLint stays, since type-aware linting builds the whole program on any engine
and the setup depends on typescript-eslint's typed rules, `eslint-plugin-sonarjs`, `eslint-plugin-jsdoc`, the rules
under `packages/arc-framework/eslint/` and the bulk-suppressions baseline in `eslint-suppressions.json`.

### 8. Contingency: TypeScript 7 fails its landing check

TS 7 lands if, at the landing head, it reaches TS 6's verdicts (§ Success Criteria 4) and runs on m4-mini. If either
fails, the shards land on TS 6 with the same partition by amendment, and adopting TS 7 becomes follow-up work.

- **The script** runs TS 6 (`typescript`'s `bin/tsc`) without `--checkers`, an option TS 6 does not have, and
  without the soft limit or the backstop, whose margin is measured from Go's address-space gap, not V8's.
- **CI** keeps the `typecheck-tests` step's 6144 MiB pin, and its `typecheck` step gets an explicit
  `--max-old-space-size=4096`, like the lint steps. That has room: `typecheck` has passed cold in the pool under a
  2,144 MiB V8 limit.
- **The landing handoff** keeps m4-mini's `heap_mb` at 6144 MiB and `lint:ts`'s charge at 5,000 MB, and proposes no
  m5-air route for `typecheck`, which on TS 6 would run there under a 2048 MiB `heap_mb`.
- **The amendment** restates for TS 6 every passage that holds only on TS 7, wherever it sits. They are the Purpose;
  Goals 4 and 6; §§ 3.1–3.4; § 4's TS 7 input; § 5; § 6; § 9; § 10's `package.json`, `package-lock.json`, `ci.yml`
  and `TECHNICAL-OVERVIEW.md` rows; Alternatives' TS 7 entries; Cross-cutting › Performance, Memory, Testing, Rollout,
  Compatibility, Security, Verdict authority and Landing handoff; and Success Criteria 2–5, 8, 9 and 11.
- **The time bound:** Goal 6 and Success Criterion 5 restate it for TS 6, whose five shards take about 1.6 times the
  single program's time (123 s against 76 s on the desktop, so about 60 s on m4-mini).
- **The peaks:** the amendment re-reads the TS 6 shard peaks on m4-mini and splits any shard at the target.

A TS 7 shard that peaks at or above 3 GiB is no reason to fall back, since TS 6 peaks higher on every shard. It is
split, as § 1.4 describes.

### 9. Documentation and ADR

- **TECHNICAL-OVERVIEW.** `.arc/reference/TECHNICAL-OVERVIEW.md` § 3 Infrastructure (the TypeScript line) and § 4
  Testing Infrastructure › Quality Gates (TypeScript type checking) record TS 7 for the two type checks, run as
  shards by `src/scripts/run-typecheck.ts`, beside TS 6 for tooling.
- **A new ADR**, with the working title "Shard the test type check and run type checks on TypeScript 7". It records
  § 1 (sharding, the declaration pass, the check shape, the forward path), §§ 3.1–3.3 and 5 (one script running the
  checks, TS 7 beside TS 6, and a script-owned memory bound), § 7 (typed linting stays one process), the
  verdict-authority residual (§ Cross-cutting), and their alternatives. It is written with the implementation and
  reads Accepted in the change that delivers it.

**ADR dispositions:**

- **Covered by the new ADR:** §§ 1.1–1.3, 1.5, 3.1–3.3, 5 and 7.
- **`none`:** § 1.4's exact partition (tactical, re-split as the suite grows); § 2's coverage test (code-obvious);
  § 3.4's peak line (tactical); § 4's script wiring (code-obvious); § 6's CI heap pins (tactical tuning values);
  § 8's contingency (temporary: moot once TS 7 lands; a fallback lands by amendment, which revises the ADR).

### 10. Touched surfaces

**Boundary: stays one work unit.** One concern, bounded per-process type-check memory, in a small change set: configs,
one script and its tests, three CI steps and two documents, well under the project's size marks for a split (about
1,500 spec lines, 1,000 task-list lines or 10,000 changed lines). Giving exported schemas explicit types is a
separately reviewable `src` refactor and stays outside it (§ Non-Goals).

| Surface                                               | Change                                                |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `packages/arc-framework/tsconfig.shards.json`         | new shard base                                        |
| `packages/arc-framework/tsconfig.shard-*.json`        | five new shard configs                                |
| `packages/arc-framework/src/scripts/run-typecheck.ts` | new script, with any modules it splits into beside it |
| `packages/arc-framework/__tests__/unit/`              | coverage test and the script's unit tests             |
| `packages/arc-framework/package.json`                 | three scripts, one devDependency                      |
| `package-lock.json`                                   | TS 7 and its platform packages                        |
| `.github/workflows/ci.yml`                            | three steps' `NODE_OPTIONS`                           |
| `.arc/reference/TECHNICAL-OVERVIEW.md`                | §§ 3 and 4 (§ 9)                                      |
| `.arc/reference/adr/`                                 | the new ADR                                           |

Unchanged on purpose: `tsconfig.test.json`, `tsconfig.json`, `eslint.config.js`, `.arc/system/arc-checks.yml`,
`.github/check-plumbing.yml` and the root `package.json`. The coupling audit classifies the new `.json` configs as
config through its `declarative-config` rule (`classifySurface` in `src/lib/coupling-audit/surface-classifier.ts`).
Neither the configs nor the script ship: the package's `files` list omits them, and tsup bundles only `src/cli.ts`.

## Alternatives & Rationale

Every figure below was measured on 2026-11-05 rather than estimated.

- **`src` as a referenced composite project, tests checked against its declarations.** Rejected for now. Against
  today's declarations the test program ran out of memory at 4.81 GiB RSS, past the 4.47 GiB it needs against source,
  because the declarations are larger than the source they describe. Against compact declarations (a zod-stubbed
  proxy, 83k declaration lines) all the tests checked in 13% less end-of-run heap, since the tests themselves are most
  of the program. It becomes the lasting lever on the `src` share every shard pays once declarations are compact, and
  § 1.5 states what the switch adds.
- **Shards checked against `src` source — chosen.** Each shard parses only its slice of the tests plus the `src` it
  imports, and test growth is absorbed by splitting a shard. Every shard still pays for the `src` it imports, so
  `src`'s growth reaches every shard, and total CPU rises because each shard re-checks that `src`.
- **Three directory shards (unit, integration, the rest).** On TS 7 the largest peaks at 2.75 GiB, under the target
  but with little room, and on TS 6 the unit shard peaks at 3.31 GiB, over it. Five shards cost about 15 s more on the
  desktop on TS 7. They hold the target on both compilers on the desktop, so the contingency starts from the same
  partition, and they leave room for growth.
- **TypeScript 7 — adopted for the two type checks.** On the whole test program it reaches the same zero-error verdict
  as TS 6 in 30 s against 76 s, but its peak is no lower: 4.93 GiB against 4.47 GiB under a 6000 MiB limit. It is a
  speed lever, not a memory one, and it pays for the shards' extra CPU. On the shards it peaks 0.5–0.9 GiB below TS 6.
- **Keep TS 6 support in the script beside TS 7.** Rejected: once TS 7 lands, that path is code nobody runs. The TS 6
  figures are already measured, so § 8's fallback is a small, bounded amendment.
- **Shards as separate checks running in parallel across runners.** Set aside. Run as `npm run -s typecheck:test --
  --shard=i/N`, they would keep the existing routes and command class: arc-offload matches a route on a literal
  argument prefix (`Repository.route_for` in `arc_offload/config.py`) and a class on patterns anywhere in the
  arguments (`command_class` in `arc_offload/pool.py`). ARC's check declaration can already express a sharded check
  (`shards` in `src/lib/checks/declaration.ts`). It gains nothing while m4-mini is the check's only pool runner, and
  its memory charge would still be the largest shard's. One check that runs the shards in turn keeps its name, gate
  wiring and routes, and its charge is the largest shard, not the sum.
- **Bound TS 7 with the runner's `memory_max_mb` alone.** Set aside. It is arc-offload's only enforced job limit
  (applied by `systemd-run` in `worker_command`, `arc_offload/transport.py`), but it kills rather than guides
  collection, caps every job on a runner at one value, is unset on m4-mini, and reaches neither CI nor a local run. The
  script reads it instead, to keep its soft limit under it (§ 3.3).
- **One soft limit for every runner.** Set aside either way. A fixed 6000 MiB sits above m5-air's and m2-mini's job
  caps, so the routes keep `typecheck` on m4-mini and intel-mbp. On 2026-11-05, before that route change, m5-air ran
  63 of the 93 `typecheck` pool runs. A uniform limit near 4 GiB fits every runner, but it brings Go's harder
  collection closer on m4-mini and in CI too, where no cap requires it.
- **Keep raising ceilings.** The baseline this replaces. Each raise buys weeks, the desktop cannot host a 6 GiB check,
  and each raise on m4-mini cuts how many jobs its VM can hold at once.
- **Cut test bulk.** A few days of growth at most (§ Non-Goals).
- **Seed incremental state into gate runs.** Gate runs materialize a fresh directory and run `npm ci` on every
  placement, and a warm run still pays the 1.7 GiB parse-and-bind floor. Cold is the bound to design for.
- **Change linter.** It would not bound memory, since type-aware linting builds the whole program on any engine.

## Cross-cutting Considerations

**Performance.** On the desktop, `typecheck:test` drops from 76 s (one TS 6 program) to about 53 s (five TS 7
shards), and `typecheck` from 27 s to 12 s. Total CPU rises, because each shard re-checks the `src` it imports. The
gate charges `typecheck:test` for its largest shard rather than for one 4.5 GiB program, so m4-mini can run it beside
other jobs again.

**Memory.** Each compiler is bounded by its soft limit and, on Linux, the backstop. Under a pool job cap, the soft
limit sits below the cap. A residual remains: in the pool, a process whose demand outgrows its admission charge but
stays under the backstop can over-admit on m4-mini. For a shard, the cue is the split marker on its peak line
(§ 3.4), and the answer is a split. `typecheck` cannot split: its peak nearing its charge is answered by raising the
charge.

**Testing.**

- **Unit tests:** the coverage test (§ 2), plus the script's pure logic, each without spawning processes: shard
  discovery, exit-status aggregation including signal statuses, the refusal when `typescript-7` or its platform
  package does not resolve, the cgroup bound's parsing and the soft limit's computation, the backstop limit's
  computation including the never-raise rule, `/proc` status parsing, the process-identity rule, and peak-line
  formatting including the split cue.
- **Probes at verification:** the compiler runs themselves, the backstop's failure, eslint's exit statuses, a planted
  type error per shard, and a planted error in a `checkJs` root of each type check.
- **No new integration or E2E tier tests.** The gate runs the script on every commit.

**Rollout.** The lockfile change means each branch runs `npm ci` after merging base (§ 5). Check names, commands and
gates are unchanged, so gate wiring, CI's check plumbing and the pool's routes need no coordinated change.

**Compatibility.** Every runner of these checks is Linux. On macOS and Windows the checks run with the 6000 MiB soft
limit and one checker, without the backstop, and the peak line reads `peak: unavailable`. A developer environment that
already caps address space keeps its own lower cap (§ 3.3).

**Security.** The TS 7 launcher comes from the same npm package name as TS 6, under an alias. The binary that runs
comes from the separately published platform packages `@typescript/typescript-<platform>-<arch>`, new to the
dependency set. Each is pinned by its own lockfile integrity hash, and none runs install scripts. Adopting TS 7
therefore extends trust to those native binaries, as the `typescript` package already carries trust for the JavaScript
compiler. No credential or network access is added.

**Verdict authority.** After landing, TS 7 is the only compiler that type-checks these programs, and no TS 6 type check
runs over the tests. A class of diagnostic TS 7 misses, JavaScript checking under `checkJs` included, would go unseen.
Success Criterion 4 checks parity once, at landing. The residual is accepted with the adoption and recorded in the new
ADR (§ 9).

**Landing handoff (machine configuration, applied by the Owner).** The verification report proposes these values,
read from the peak lines of cold runs on m4-mini under its landing settings. They are not success criteria.

- **Admission charges:** `typecheck:test` from its largest shard's peak plus a margin; `typecheck` from its own peak
  plus a margin, replacing today's 2,800 MB; `typecheck:all` from the larger of the two. On m4-mini a charge costs
  ceil(MB / 512) of its 20 tokens (`capacity_cost` in arc-offload's `arc_offload/pool.py`), and a plan pays for its
  heaviest command (`plan_cost`).
    - A `typecheck:test` charge of 2,561–3,072 MB costs 6 tokens, so admission runs it beside `test:changed`
      (14 tokens), `lint:ts` (9 at 4,200 MB), the integration tier (11) or the store suites (9).
    - Beside `test:changed` the pair can exceed m4-mini's 11.9 GB VM. `test:changed`'s memory at peak follows its
      selection: 3.3–11.2 GB of the VM in use over 81 solo gate runs, 9.5 GB at the 90th percentile, against its fixed
      7,000 MB charge. How `test:changed` is charged is outside this change; whether to accept the pairing is the
      Owner's call.
    - `test:unit` charges 19 tokens on m4-mini (9,700 MB), so no type check runs beside it.
- **m4-mini's runner-wide `heap_mb`** returns from 6144 to 4192 MiB, since no type check needs a large V8 heap.
- **`lint:ts`'s charge** returns from 5,000 to 4,200 MB with that heap: under a 4096 MiB heap it peaked at 3,621 MiB.
  The landing runs check it against the peak over several m4-mini runs at that heap (§ 3.4, landing settings), and a
  higher figure goes to the Owner.
- **Routes:** add `m5-air-ac` and `m5-air-battery` to the `typecheck` route. Where m5-air's 5,120 MiB
  `memory_max_mb` is in force in the job's cgroup, the script's soft limit there is 4,608 MiB, about twice
  `typecheck`'s TS 7 peak. No run the routes admit before the edit can show a soft limit taken from a cgroup bound:
  m4-mini, CI and WSL carry none, and intel-mbp's 8,192 MiB bound leaves the limit at 6000 MiB. A route binds a pinned
  run whose arguments match its literal prefix (`_dispatch` in arc-offload's `arc_offload/cli.py`), so the check
  follows the edit. A pinned run under arguments no route matches, such as the script invoked directly, would reach
  m5-air sooner; that is the Owner's call. The first `typecheck` run there should report a 4,608 MiB soft limit. One
  reporting 6000 MiB means the script found no bound, either because the cap is not in force or because the script's
  cgroup read missed it; the job cgroup's own `memory.max` tells the two apart. On such a line the edit is undone
  until the cause is known. Whether the `typecheck:test` and `typecheck:all` routes follow, and whether they regain
  local fallback (`allow_local`), is the Owner's call.

## Success Criteria

1. The coverage test passes at the verified head. Its comparison reports a missing file, a doubled file and a changed
   option on synthetic inputs, each naming the file or option and the shard.
2. `npm run typecheck:test` runs the five shards of § 1.1 in turn on TypeScript 7, each with `--checkers 1` and the
   § 3.3 soft limit, 6000 MiB where no cgroup bound is lower. On Linux each runs under the § 3.3 backstop, its margin
   set from the desktop gap and the m4-mini sample. Each prints its peak line with the soft limit it ran under, and
   `npm run typecheck` does the same over `tsconfig.json`.
3. Cold (no incremental state file, § 3.4) on m4-mini under its landing settings, the peak lines of `typecheck` and of
   every shard each carry a figure read from the native compiler, and every figure is below 3 GiB (3,072 MiB). An
   `unavailable` line fails this criterion.
4. At the verified head, both type checks report zero errors on TS 7, as `tsc --noEmit` on TS 6 does over
   `tsconfig.json` and over `tsconfig.test.json`. A type error planted in one root of each shard, in a disposable copy,
   fails `typecheck:test`, which names that file. So does a type error planted in a `checkJs` root:
   `__tests__/fixtures/checks/runner-proxy.mjs` for `typecheck:test`, and `examples/check-runner/local.mjs` for
   `typecheck`.
5. Cold (§ 3.4) on m4-mini, `typecheck:test` completes in at most 45 s, against 37 s for today's single TS 6 program.
6. Under an inherited address-space limit too small for a shard (`ulimit -v` of 2 GiB), `npm run typecheck:test`
   fails with a non-zero status and a peak line for each shard, rather than raising the limit or passing.
7. CI's `typescript` step passes `lint:ts` at its explicit 4096 MiB heap, and the log shows `lint:ts`'s peak line
   with heap in use. `npm run lint:ts -- --prune-suppressions` reaches eslint, and `lint:ts` exits 2 when a
   suppression is unused.
8. In `ci.yml`, `typescript` and `typescript-files` set `NODE_OPTIONS: --max-old-space-size=4096`, and
   `typecheck-tests` sets no `NODE_OPTIONS`.
9. `TECHNICAL-OVERVIEW.md` records TS 7 for the type checks (§ 9), and the new ADR reads Accepted at the verified head.
10. Every declared gate passes, and hosted CI passes at the verified head.
11. Unit tests cover the cgroup bound's parsing (a numeric `memory.max`, the smallest of nested ones, `max`, a missing
    file and no `0::` entry) and the soft limit's computation, which gives 4,608 MiB under a 5,120 MiB bound,
    6000 MiB under an 8,192 MiB bound and 6000 MiB with none.

## Open Questions

[none]

## Amendments

[none]

---
