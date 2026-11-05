# Draft: test-typecheck-heap

- **Origin:** [internal] — CI triage of the test type check's out-of-memory failure on `main` (`43a8680c1b`, run
  41952298959) and on #1274, 2026-11-04.
- **Purpose:** Keep the test type check's per-process memory bounded as the suite grows, so its heap ceilings stop
  moving every few weeks. One program checks all of `src` and all of `__tests__` together, and its peak has tracked
  its line count through three ceiling raises. This unit breaks that coupling for the tests: it splits the program
  into shards, so test growth is absorbed by adding a shard. The `src` share every shard still pays goes with
  `compact-schema-declarations`, which lets the shards consume `src` as a referenced project.

**Readiness:** formalization-ready. Resolved:

- the direction;
- the check shape;
- typed linting's shape;
- the scope boundary;
- the routed-out work;
- the landing stance.

Left to the spec:

- the exact shard partition, from measured peaks against the stated target;
- TS 7's dependency arrangement;
- the measured values: the admission charges, the TS 7 backstop's address-space gap, and the TS 7 partition and
  timing.

---

## Problem / Motivation

**The check.** `typecheck:test` runs `tsc --noEmit` over `packages/arc-framework/tsconfig.test.json`, which includes
`src`, `__tests__`, `examples` and two config files as one program: about 935k lines at `43a8680c1b` (`src` about
346k, `__tests__` about 583k). It is a commit-gate check in `.arc/system/arc-checks.yml`, CI's `typecheck-tests`
step, and the second half of `typecheck:all`.

Typed linting does not share that program. `lint:ts`, and `lint:ts:file` at the commit gate, build only the `src`
program:

- test files are linted without type information (`tseslint.configs.disableTypeChecked` on `__tests__/**` in
  `eslint.config.js`);
- typescript-estree's `getWatchProgramsForProjects` stops at the first project in `parserOptions.project` that
  contains a file, and for every type-linted file (`src`, `examples`) that is `tsconfig.json`.

So typed linting grows with `src`, not with the tests.

**Measured.** All figures were measured cold on 2026-11-05 at `43a8680c1b` content, unless noted. Raw output and the
full table are in `~/dev/arc-evidence/test-typecheck-heap/results/SUMMARY.md` on the WSL desktop. tsc's "Memory used"
is the heap in use at the end of the run (`process.memoryUsage().heapUsed` in TypeScript's `getMemoryUsage`, printed
in thousands of bytes and converted here), so it understates the peak; peak RSS is the process's real high-water mark.

| Program                                                    | Heap at end (GiB) | Peak RSS (GiB) | Wall |
| ---------------------------------------------------------- | ----------------- | -------------- | ---- |
| Test program as today (TS 6.0.3)                           | 4.00              | 4.47           | 76 s |
| Same, `declaration: false`                                 | 3.84              | 4.11           | 69 s |
| Same on TS 7.0.2, one checker, `GOMEMLIMIT=4500MiB`        | —                 | 4.16           | 28 s |
| `src` alone (`typecheck`)                                  | 2.19              | 2.41           | 27 s |
| `src` alone on TS 7.0.2, one checker, `GOMEMLIMIT=3000MiB` | —                 | 2.15           | 10 s |
| Shard: `__tests__/unit` and its imports                    | 3.03              | 3.31           | 44 s |
| Shard: `__tests__/integration` and its imports             | 2.72              | 2.96           | 40 s |
| Shard: `__tests__/e2e` and its imports                     | 1.44              | 1.71           | 45 s |

m4-mini measured about 3.9 GiB of end-of-run heap at the same content on 2026-11-04. A warm run there with nothing
changed needs about 1.7 GiB: parsing and binding the whole program, before any checking.

**Growth.** At `b2035d69c3` (2026-10-20) against today, in GiB of end-of-run heap per week: whole program 0.49,
integration shard 0.43, unit 0.15, e2e 0.06. `src` alone grew 0.24 under `typecheck`, which runs the declaration pass.
The shards and typed linting do not, so the `src` share they pay grows more slowly; each shard's rate above already
includes it. Integration passes unit in about eight days, and reaches a 4192 MiB ceiling around 11-27 unless split
further (6144 MiB around 12-28). Unit reaches 4192 MiB around 12-25. The rates come from one unusually fast
fortnight. End-of-run heap also counts what V8 had not yet collected under the measurement's large ceiling, so it can
exceed what a run needs, and these dates are on the early side: `typecheck`, at 2.19 GiB here, passes cold in the pool
under a 2144 MiB V8 limit (Landing). The gap is small for the whole test program, which failed in CI at 4096 MiB with
4.00 GiB of heap at the end.

**What drives it.**

- **Program size.** The parse-and-bind floor alone is 44% of the whole run's end-of-run heap on m4-mini, and it
  grows with every line in the program. One program over everything cannot stay bounded.
- **zod schema types.** Stubbing zod's types to `any` takes the test program's end-of-run heap to 3.05 GiB against
  3.84 (−20%), and instantiations down 69%. That is a ceiling on what typed schemas could save, since the stub also
  erased the output types the tests are checked against.
- **Bloated declarations.** Emitting `src` declarations produces 612k lines (29 MB) from 346k source lines, 540k of
  them from zod-importing modules. `src` exports 1,045 `*Schema` consts, and 6 carry an explicit type.
  `src/scripts/review-gate/status.ts` alone emits 238,705 lines from 1,662, because 22 internal status-variant
  schemas each spread `ReviewStatusBaseShape` and so inline the ~10k-line `RoutedReviewObligationSchema` type. The
  declaration pass costs `typecheck` 0.38 GiB of end-of-run heap (2.19 against 1.81 GiB without it).

**Where it runs, and the room there.**

- _CI_ — a 16 GB hosted runner with the step running alone. #1275, merged on `main`, raised its limit to 6144 MiB;
  this branch's `ci.yml` reads 4096 until it merges base.
- _Pool, until 2026-11-05_ — registry routes sent `typecheck:test` and `typecheck:all` to m4-mini, with the desktop
  as fallback (`allow_local: true`), both at a 4192 MiB heap ceiling. m4-mini's VM has a 10 GB admission budget
  shared by up to three jobs. It charged the check 4700 MB (`typecheck` alone: 2800 MB), and `typecheck:all` matched
  no rule, so it fell to the 3800 MB catch-all. In `speed` mode the pool also placed it on the desktop. Local runs on
  2026-11-04/05 peaked at about 4.3 GB of process-tree memory, with WSL already about 9.5 GB into swap and 3.9–5.3 GB
  available. On 2026-11-04 the pool's runs of the check had about 100 MiB of headroom, about two days of growth,
  and every gate run there starts cold (Unknowns § Warm start).
- _Pool, interim (2026-11-05)_ — registry changes; the first three hold the line until this lands:
    - m4-mini's `heap_mb` is 6144. The ceiling is runner-wide, so every Node process there gets it, not just this
      check.
    - The admission charge for `typecheck:test` is 6500 MB, and `typecheck:all` has its own rule at the same figure.
    - The ten `typecheck:test` and `typecheck:all` routes no longer fall back to the desktop (`allow_local: false`),
      so m4-mini is the check's only runner, and an m4-mini outage holds every commit gate that runs it. Grouped
      commit-gate plans obey these routes: arc-offload intersects the routes of every invocation in a plan
      (`Repository.route_for` in `arc_offload/config.py`, applied per invocation in `arc_offload/arc_placement.py`).
    - Later the same day, two changes meant to last: `typecheck` routes to m4-mini and intel-mbp, with local
      fallback, on either compiler; and `lint:ts`'s admission charge is 5,000 MB, up from 4,200, while `heap_mb`
      stays at 6144. Landing gives the reasons.

**Why now.** Each raise has bought weeks. The desktop has no room for a 6 GiB check, and each raise on m4-mini cuts
how many jobs its VM can hold at once. At the current rate CI's 6144 MiB lasts until about early December, sooner as
in-flight work adds tests. Placed P1 and fast-tracked, with no dependencies: expected to land within two to four
days, about 2026-11-07 to 11-09. About 2026-11-28 is only the latest safe date before the 6144 MiB ceilings run out:
a backstop, not the estimate.

## Alternatives

Each option was measured on 2026-11-05 rather than estimated.

- **Option A — `src` as a referenced composite project.** Rejected for now. The test program checked against
  emitted `src` declarations ran out of memory at 4.81 GiB RSS, past where the program checked against source
  finishes (4.47 GiB), because today's declarations are larger than the source they describe. With compact
  declarations it helps, but less than expected. In a zod-stubbed proxy (83k declaration lines), all the tests
  checked in 2.64 GiB of end-of-run heap against 3.05 GiB from source (−13%), because the tests themselves are most
  of the program. It becomes the lasting lever on the `src` floor once `compact-schema-declarations` makes
  declarations compact.
- **Option B — several test programs (shards), each checked against `src` source.** Chosen for this unit. Each
  shard parses only its slice of `__tests__` plus the `src` it imports. Three directory shards peak at 3.31, 2.96
  and 1.71 GiB RSS, against 4.47 GiB today. Test growth is absorbed by splitting a shard. Every shard still pays the
  `src` it imports, so `src`'s growth reaches every shard. Total CPU rises too, because each shard re-checks that `src`:
  113 s of check time for the three shards against 62 s for the whole program on TS 6.
- **Option C — A and B together.** The lasting shape: shards checked against compact `src` declarations, so each
  process costs about the declarations plus its slice. It waits on `compact-schema-declarations`. This unit's shard
  layout should let the switch be a configuration change (add `references`, drop `src` from each shard's program).
- **Option D — TypeScript 7 (the native compiler, stable since 2026-07-08).** Adopted for the type-check commands
  in this unit, if it fits the date. On the whole test program it gives the same zero-error verdict as TS 6 in 28 s
  against 76 s. Its peak is no lower: left alone it ran out of memory, and under a `GOMEMLIMIT` set below its demand
  the peak follows the limit (4.16 GiB at 4500 MiB). So it is a speed lever, not a memory one. It pays for the
  shards' extra CPU. Two cautions came out of the measurements:
    - Its default of four checkers ran out of memory at about 4.7 GiB in use under the measurement's 6 GiB
      address-space cap: each checker builds its own copy of the types.
    - Go's collector, left at its default, failed the same way with one checker.
  A Go process ignores V8's `--max-old-space-size`, so neither the pool's `heap_mb` nor CI's heap setting reaches it,
  and `GOMEMLIMIT` is a soft target that Go grows past rather than fails at. The Decision gives TS 7 its own bound.
- **Option E — keep raising ceilings.** The baseline this replaces: each raise buys weeks, the desktop cannot host a
  6 GiB check, and the m4-mini VM loses concurrency with each raise.
- **Cutting test bulk.** Considered and set aside as a lever. A sampled audit found the suite mostly sound. About
  5–8% of test lines could go by consolidation without losing protection, and about 1–2% are of doubtful value.
  All of it together is worth a few days of growth. Routed out as hygiene (Scope boundary below).

## Decision

**Shards.** Split `typecheck:test`'s program into shards by `__tests__` directory, and within integration by file
pattern, each checked against `src` source:

- unit in two;
- integration in two or three, with the `store-ref-*` and `store/` suites apart from the rest (the 416 `store-ref-*`
  suites sit directly in `__tests__/integration/`, so this split needs file patterns);
- e2e, with `benchmarks`.

One shard includes everything the others do not (`include: ["__tests__"]` with the other shards' directories and
patterns excluded), so a new directory is checked without a configuration change. That shard also carries
`build-compiler.config.ts` and `vitest.config.ts`. Each shard keeps its own incremental state file under
`node_modules/.cache/tsc/`, which helps runs outside the gate. Every gate run starts cold (Unknowns § Warm start), so
every bound here is set for a cold run. The spec sets the exact partition from peaks measured on the compiler that
lands. The target: every shard's peak RSS stays under about 3 GiB at landing, so that at TS 6's measured rates none
reaches 6144 MiB before about mid-January. TS 7 has no measured growth rate; there the peak line, read at each storage
landing, shows when a shard nears the target.

A unit test guards the partition, since each split edits several configs and tsc reports no error when one pattern
matches nothing. It parses every shard's config with TypeScript's config parser, without building a program. It
asserts that their root files together equal `tsconfig.test.json`'s roots outside `src/` and `examples/`: everything
in `__tests__` plus the two config files, each file in exactly one shard. A split that drops or doubles a file then
fails the unit tests.

The shard configs sit at the package root as `tsconfig.shard-*.json`, with their shared base under a name that
pattern does not match, and the script sits under `src/scripts/`. The checks' declared inputs cover both
(`packages/arc-framework/tsconfig*.json` in `global_inputs`, `src/**/*.ts` in each check's `inputs`, in
`.arc/system/arc-checks.yml`), so changing either invalidates a cached pass. The script and the coverage test both
find the shards by that one file pattern, so every shard the test covers is a shard that runs.

**Test configs drop the declaration pass** (`declaration: false`, `declarationMap: false` in a shared shard base).
The pass repeats `src`'s declaration diagnostics, which `typecheck` and the build's declaration gate still run, and
covers test files that are never emitted.

**`tsconfig.test.json` stays as it is**, the whole-program config the coverage test compares the shards against.
Its `src` and `examples` roots are then checked only by `typecheck`, which includes both (`tsconfig.json`) under
stricter unused-code options; a shard checks only the `src` its tests import. Coupling-audit lists it in
`PACKAGE_ROOT_CONFIG` (`src/lib/coupling-audit/surface-classifier.ts`). ESLint's `parserOptions.project` also keeps
it, though no type-linted file reaches it (Problem § The check).

**TypeScript 7 for `typecheck` and the shards, if it fits 11-07 to 11-09.**

- `typescript@6` stays the package for tooling: typescript-eslint and tsup's declaration build use its API.
- TS 7 joins beside it for the type-check commands. The spec picks the exact dependency arrangement.
- **Memory on TS 7 is the type-check script's to bound**, for `typecheck` and every shard (Check shape below). The
  pool forwards only its listed variables to a job (`runner_environment` in arc-offload's `execution.py`), and a Go
  process ignores V8's heap flag. So the script:
    - passes `--checkers 1`;
    - sets `GOMEMLIMIT` just under 6144 MiB, the ceiling V8's heap sets on TS 6, the same for every process. Below
      the limit, Go's peak follows demand: the `src`-only run peaked at 2.15 GiB under a 3000 MiB limit, while the
      whole program sat at 95% of its 4500 MiB. So the peak line tracks growth on either compiler. CI sets nothing
      of its own;
    - runs the compiler under `ulimit -v` as the backstop, set above `GOMEMLIMIT` by the gap between Go's address
      space and its RSS, so the limit engages first and Go collects harder before the backstop fails the run. The
      gap is real: the default-collector run ran out of a 6 GiB address cap with only about 4.7 GiB in Go's own
      accounting, while the 4500 MiB limit, about 1.6 GiB under the same cap, engaged. The spec measures the gap from
      one VmPeak/VmHWM sample of the largest shard under the landing `GOMEMLIMIT` on m4-mini. It sets the cap above
      the limit by that gap plus 0.5 GiB, and by no less than the 1.3 GiB the default-collector run showed. An overrun
      then fails loudly, as those runs did. Linux only, like every runner of this check; elsewhere the script runs
      without it, as its peak line reads `peak: unavailable`.
- TS 7's peaks are not TS 6's. Below the limit, Go's default pacing (`GOGC=100`) lets its heap reach about twice its
  live set. It peaked lower than TS 6 on `src` (2.15 against 2.41 GiB), but past TS 6 on the whole test program
  (4.71 against 4.47 GiB, out of the 6 GiB cap). So the partition is set from shard peaks on the compiler that lands,
  against the same 3 GiB target. A finer split costs little on TS 7, where `src` alone checks in 10 s.
- The alternative backstop, m4-mini's `memory_max_mb` (arc-offload's only enforced job limit, applied by
  `systemd-run` in `worker_command`), is set aside. It caps every job on that runner at one value and reaches
  neither CI nor a local run.
- Residual: between a process's admission charge and the backstop, a process whose demand outgrows its charge can
  over-admit on m4-mini, as it can under V8's 6144 MiB heap on TS 6. For a shard, its peak line nearing the 3 GiB
  target is the cue to split it, on either compiler. `typecheck` cannot split: its peak line nearing its charge is
  answered by raising the charge. Its heap in use nearing a heap ceiling is answered in CI by raising the step's pin,
  and in the pool by narrowing its route to m4-mini's 6144 MiB, since the pool's heaps are runner-wide (Landing).
- If it does not fit, the shards land on TS 6, and TS 7 becomes the next item at P1, because sharding on TS 6
  slows every session's commit gate.
- This adopts the held `USER-INBOX` item "Adopt TypeScript 7 and remove the TS6 deprecation bridge when the
  ecosystem is ready" for the type-check commands only. That item names the condition for a dual-compiler stack,
  type-check cost becoming material, and it is now met. Typed linting, the declaration build and the deprecation
  bridge stay with that item.

**Check shape: one `typecheck:test` check that runs the shards one after another as separate processes** (Owner,
2026-11-05).

- **Why:**
    - it keeps the check's name, gate wiring and registry routes;
    - its charge is the largest shard, not the sum;
    - on TS 7 its cold time is projected to stay near today's (see the success signal).
- **The alternative, set aside:** shards as separate checks running in parallel across runners. Run as
  `npm run -s typecheck:test -- --shard=i/N`, they would keep the existing routes and charge class. arc-offload
  matches a route on a literal argument prefix (`Repository.route_for` in `config.py`) and a class on patterns found
  anywhere in the arguments (`command_class` in `pool.py`), so the added argument changes neither. ARC's check
  declaration already expresses a sharded check (`shards` in `src/lib/checks/declaration.ts`). It gains nothing
  while m4-mini is the check's only runner, and its charge would still be the largest shard.
- **If TS 7 slips,** every gate run pays the TS 6 cost, since gate runs start cold. Each added shard re-checks the
  `src` it imports, about 20–30 s on the desktop against 69 s for the whole program there: about 2.2–3.6 times today's
  check time for five to seven shards. The three-directory split measured 1.85 times (128 s against 69 s).

One script runs both type checks on either compiler: `typecheck` as one program over `tsconfig.json`, and
`typecheck:test` as its shards in turn. Both get TS 7's memory settings and the one-line peak, and its peak reader
also wraps `lint:ts` (Typed linting below). `typecheck:all` keeps running `typecheck` and then `typecheck:test`.

**A one-line peak per type-check process** (`typecheck` and each shard) in the script's output, so that CI logs and
the pool give actual figures at every landing without a separate measurement.

- The script reads each compiler process's peak RSS from the kernel's high-water mark (`VmHWM` in
  `/proc/<pid>/status`), polled until the process exits.
- One mechanism covers the Node process on TS 6 and the Go binary that TS 7's launcher replaces itself with
  (`process.execve` in typescript@7's `lib/tsc.js`), which no exit hook could report.
- For a Node process the line also gives V8's heap in use at exit against its heap limit, from a `--require`
  preload, as the lint measurements' `peak-rss.cjs` did. A heap ceiling's cue reads that figure, not RSS: under a V8
  limit, RSS can sit near or above the limit through lazy collection alone (`lint:ts` passed at a 3,072 MiB heap
  with 3,256 MiB RSS and 2,248 MiB in use at exit).
- Linux only, like every runner of this check: CI's `ubuntu-latest` job, the pool (arc-offload's `runner_list`,
  which `place_plan` calls, lists only Linux runners by default) and WSL. Elsewhere the line reads
  `peak: unavailable`.
- Peaks that set charges are taken cold, on m4-mini under its landing settings: `heap_mb` on TS 6, the script's
  `GOMEMLIMIT` on TS 7. Under a larger ceiling V8 collects later, so a peak is only valid for the ceiling it ran
  under.

**Typed linting stays one process.** It builds only the `src` program (Problem § The check), so its memory follows
`src`'s growth and the shards do not apply to it. That growth is not `typecheck`'s 0.24 GiB a week, which includes a
declaration pass typed linting never runs; no lint rate is measured.

- `lint:ts` passes on m4-mini with its heap held to 3,072 MiB: 3,256 MiB peak RSS, about a minute (2026-11-05).
- Its 4,638 MiB peak under the runner's 6144 MiB heap was V8 collecting lazily because it had room.
- CI's `typescript` step runs it (`.github/check-plumbing.yml`) at Node's default heap, about 4 GiB on a 16 GB
  runner.
- `lint:ts:file`, which runs locally at the commit gate, loads no program for a test file (326 MiB on m4-mini) and
  the `src` program for a `src` file.

- **In this unit:** CI's `typescript` and `typescript-files` steps get an explicit `--max-old-space-size=4096`,
  pinning today's default so a change in runner defaults cannot move it. `typescript-files` runs `lint:ts:file` over
  the merge gate's selection (`.github/check-plumbing.yml`) in batches (`src/lib/checks/batching.ts`), and each
  batch with a `src` file builds the `src` program.
- **Its peak line:** `lint:ts` prints the same one-line peak as the type checks. It runs eslint through the script's
  peak reader, which keeps the package as working directory, passes eslint's arguments through
  (`--prune-suppressions` among them) and returns eslint's exit code, 2 on an unused suppression. The suppressions
  baseline relies on all three (`DEV-RULES.PROJECT` § Size and complexity baseline).
- **Its bound** follows `src`'s. Whether `compact-schema-declarations` lowers the cost of the `src` program typed
  linting builds is unmeasured. Until something does, its heap in use at exit nearing CI's 4096 MiB heap is
  answered by raising that heap.
- **ESLint stays.** A change of linter would not bound memory, because type-aware linting builds the whole program
  on any engine. The setup also depends on typescript-eslint's typed rules, `eslint-plugin-sonarjs`,
  `eslint-plugin-jsdoc`, the project rules under `packages/arc-framework/eslint/` and the bulk-suppressions
  baseline in `eslint-suppressions.json`.

**Success signal.** At landing, on the code then current:

- every type-check process peaks under about 3 GiB RSS, measured cold on m4-mini under its landing settings;
- `lint:ts` passes at CI's explicit 4096 MiB heap, and its peak is reported;
- each gate reaches the same verdict as the single program it replaces;
- on TS 7, the check's cold time on m4-mini stays near today's 37 s. That is a projection from the whole-program and
  `src`-only TS 7 runs, which the spec measures. On TS 6, it stays within about 2.2–3.6 times today's 37 s, by shard
  count (five to seven);
- the admission charges are reset from those peaks, and CI's ceilings are as Landing and Decision § Typed linting
  state.

**Boundary: stays one WU.** One concern: bounded per-process type-check memory. Configurations, scripts and CI
steps make a small change set, well under the size marks. Typing exported schemas is the other half of the lasting
fix. It goes to its own unit because it is a separately reviewable `src` refactor whose modules collide with the
storage chain before the cutover's deletions (project-manager.ARC, 2026-11-05, Owner-approved).

## Unknowns and Assumptions

Resolved on 2026-11-05, by measurement or at source:

- **Option A's real cut** — negative today; see Alternatives.
- **Hotspots** — zod schema types and declaration bloat, above. There is no single test file to fix.
- **Where the check runs** — grouped commit-gate plans follow the command routes (Problem § Where it runs).
- **Warm start** — every gate run starts cold, local or on the pool, and so does CI, so the cold peak is the bound to
  design for, and this unit does not pursue seeding incremental state:
    - a pool runner receives the plan as an uploaded stage (`RemoteSession` in arc-offload's `arc_transport.py`), and
      the worker's captured branch runs the adapter from that stage without touching the runner's checkout
      (`lib/remote-worker.sh`); a local gate run takes the adapter directly;
    - either way the adapter materializes the plan into a fresh directory (`materialize_plan` in `arc_inputs.py`)
      from source ARC captures from a Git tree, with no ignored files such as `node_modules/.cache/tsc`
      (`checkout-index` in `src/lib/checks/runner/source-materialize.ts`), and runs the `prepare_commands`, `npm ci`
      among them, on every placement (`_prepare_commands` in `arc_adapter.py`);
    - CI restores `node_modules` from a cache keyed on the lockfile, which its `setup` job saves without running a
      type check (`nm-cache` in `ci.yml`).

  Only runs outside the gate keep incremental state: a direct run in a checkout, or a direct `arc-offload` command,
  whose runner worktree keeps `node_modules` (`prepare` in `lib/remote-worker.sh`). A warm run still pays the
  parse-and-bind floor, the 1.7 GiB above.
- **TS 7 fit** — the same zero-error verdict as TS 6 on today's code, with both configs as they are:
  `tsconfig.test.json` and `tsconfig.json`. No shard has run on TS 7 yet.
- **Typed linting's growth** — it follows `src`, since it builds only the `src` program (Problem § The check).

Open:

- **TS 7 on the shards** — each shard's peak and time under the script's settings. They set the partition on TS 7,
  the charges and the success signal's TS 7 time, and the same runs give the address-space gap that sizes the
  backstop (Decision § TypeScript 7). The desktop had no memory free for the run on 2026-11-05.
- **Shard partition** — the exact unit and integration split, from peaks measured on the compiler that lands.
- **Assumption** — the growth rates hold roughly. project-manager.ARC re-reads the shard peaks at each storage
  landing from the one-line peak output.

## Landing: undo the interim ceilings

Reset from the new measured peaks, keeping headroom until `compact-schema-declarations` lands. This changed on
2026-11-05. The section first reset all four interim settings to the new peaks plus a small margin. After the
per-shard growth rates showed integration reaching 4192 MiB around 11-27, project-manager.ARC proposed keeping the
heap ceilings, and the Owner approved. How command memory takes part in pool admission in general belongs to the
planned `test-suite-contention-hardening`; this section only resets this check's figures.

- **Admission charges** — measured on m4-mini under the landing's settings, each plus a margin, so m4-mini can run
  these checks beside other jobs again:
    - `typecheck:test` from the largest shard's peak RSS;
    - `typecheck` from its own peak line, on either compiler, replacing today's 2,800 MB;
    - `typecheck:all`, which runs both, from the larger of the two.
- **Heap ceilings on TS 6** — CI's `typecheck-tests` step (6144 MiB since #1275) and m4-mini's `heap_mb` stay at
  6144 MiB. CI's `typecheck` step, at Node's default today, gets an explicit `--max-old-space-size=4096`, like the
  lint steps (Decision § Typed linting). That has room: `typecheck` passes cold in the pool under a 2144 MiB V8 limit
  (`typecheck`'s route below).
- **`typecheck`'s route** — routed on 2026-11-05 (Problem § Where it runs) to the runners with at least a 4096 MiB
  heap, m4-mini and intel-mbp, with local fallback (4192 MiB), on either compiler.
    - Before that, `typecheck` had no command route, so most of its pool runs landed on the m5-air runners (23 of 31
      in the pool's recent history). Their 2048 MiB `heap_mb` reaches every Node job (`runner_environment` in
      arc-offload's `execution.py`) and gives V8 a 2144 MiB limit.
    - Those were cold gate runs, and it passed 22 of 23 there (the other exited 2, tsc's code for type errors), but
      with a margin no run has measured: its 2.19 GiB end-of-run heap was taken under a larger ceiling.
    - Nothing catches an overrun: an unbudgeted runner charges one token whatever the figure (`capacity_cost` in
      arc-offload's `pool.py`), and a gate run is never re-placed. arc-offload records a cgroup kill so a later retry
      avoids that runner (`_note_memory_kill` in `arc_groups.py`), and a V8 heap abort is not even recorded.
    - Raising that `heap_mb` is no answer. A route carries only `argv_prefix`, `runners` and `allow_local`
      (`config.py`), so a heap is per runner, and a raise would lift the ceiling for every job there.
    - On TS 7 the route keeps `typecheck` off runners whose `memory_max_mb` (4352 or 5120 MiB) sits below the
      script's `GOMEMLIMIT`.
    - The cost: m5-air is the fastest runner, so those runs move to m4-mini at 2,800 MB (6 of its 20 tokens) and
      spill to intel-mbp (2.6 times slower) or the desktop when m4-mini is full.
- **Heap ceilings on TS 7** — the script bounds both type checks (Decision § TypeScript 7): `GOMEMLIMIT` just under
  6144 MiB, with the address-space backstop above it. CI's type-check steps need no setting for it. m4-mini's
  runner-wide `heap_mb` returns to 4192, guarding every other Node check there again; `lint:ts` already fits, passing
  at a 3,072 MiB heap.
- **`lint:ts`'s charge** — 5,000 MB since 2026-11-05 (Problem § Where it runs), while `heap_mb` stays at 6144 MiB:
  its RSS floats to 4,638 MiB there, about 4.9 GB against the former 4,200 MB.
    - The landing measurements check it against the peak over several m4-mini runs; a higher figure goes to the
      Owner.
    - It takes 10 of m4-mini's 20 admission tokens (`capacity_cost` in arc-offload's `pool.py`), so `lint:ts` no
      longer runs beside `test:integration` (11) but still runs beside the store suites (9) and a `typecheck:test`
      charge reset to its shard peak. Any charge that covers the measured peak costs that pairing: 9 tokens cap at
      4,608 MB.
    - Its revert to 4,200 MB goes with `heap_mb`'s return to 4192 once TS 7 lands; under a 4096 MiB heap it peaked
      at 3,621 MiB. Both are registry edits the Owner applies, not changes this unit's code lands.
- **Local fallback** — restoring `allow_local: true` on the `typecheck:test` and `typecheck:all` routes is the Owner's
  call. It is to be read after the WSL memory decision (project-manager.ARC's local-machine batch).

CI's steps are in the repository and ride the change. The rest is machine configuration
(`~/.config/arc-offload/registry.json`). The copy from before the interim changes is
`~/dev/scratch/ci-heap-triage/offload/registry.pre-2026-11-05.json`, and the copy from before the route and charge
edit is `~/.config/arc-offload/registry.before-typecheck-route-20261105.json`. The design proposes the values, and the
Owner applies or authorizes them.

## Scope boundary (Won't Do)

- **No weakening of what is checked.** Strictness options, the included test files and `checkJs` stay as they are.
  The declaration pass dropped from the test configs is the one removal, and the Decision says why it loses nothing.
- **Typing exported zod schemas** — its own work unit, `compact-schema-declarations` (planned, after this one).
  `src/scripts/review-gate/status.ts` is its pilot candidate.
- **Test-suite hygiene** — shared builders and the giant files' copied setup go to `test-setup-consolidation`
  (provisional); the lint baseline for internal mocks is held in `test-di-migration`'s draft.
- **The `/dev/shm` cache leak** — fixed separately (#1277, merged).
- **The rest of TypeScript 7 and any change of linter** — stays with the held TypeScript 7 inbox item.
- **Pool registry values** (`heap_mb`, `local_heap_mb`, admission figures, routes) and the WSL memory limit are
  machine configuration outside this repository. The design names what it needs from them, and the Owner sets them.
  The general admission model is `test-suite-contention-hardening`'s.
- **The interim CI ceiling raise** is its own change (#1275, merged).

No blocking dependency. `adr-accept-timing` landed first (#1276), with its own edits to `.arc/system/arc-checks.yml`
and the root `package.json`, so this branch merges base before landing. If TS 7 lands here, the lockfile changes,
and every in-flight branch runs `npm ci` after its next base merge; the change says so.
