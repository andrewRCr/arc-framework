# Test Suite Cost Baseline

Instrument-produced baseline of the CLI package's test-suite cost, taken 2026-09-11 during
`test-suite-right-sizing` execution. It grounds every later target in retained measurement rather than projection.

**Status: authoritative first instrument baseline.** Local figures are medians of three complete retained runs
captured at `88f8345bd` with the repository-owned `benchmark:test-cost` entry. The companion invocation-count
sample was captured after `403c04fa`. Raw runs remain regenerable and gitignored; the normalized evidence below is
the durable record.

## Contents

- [Method and its limits](#method-and-its-limits)
- [Tier baselines](#tier-baselines)
- [Where the time concentrates](#where-the-time-concentrates)
- [Effective E2E shard membership](#effective-e2e-shard-membership)
- [Timeout, admission, and substrate signals](#timeout-admission-and-substrate-signals)
- [CLI startup cost](#cli-startup-cost)
- [CI on the mini](#ci-on-the-mini)
- [Derived targets](#derived-targets)
- [Levers measured](#levers-measured)
- [Alternatives closed by measurement or source](#alternatives-closed-by-measurement-or-source)

---

## Method and its limits

Environment: WSL2 on Linux 5.15, Node 26.3.0, ext4 on a virtual disk, `/tmp` on that same ext4 filesystem,
`/dev/shm` a tmpfs with ~7.8 GB free. Warm caches throughout.

Commands, run from `packages/arc-framework/`:

```bash
npm run -s benchmark:test-cost -- --condition tier-isolated --project-set unit --workers 12
npm run -s benchmark:test-cost -- --condition tier-isolated --project-set lane --workers 12
npm run -s benchmark:test-cost -- --condition tier-isolated --project-set integration --workers 12
npm run -s benchmark:test-cost -- --condition tier-isolated --project-set e2e --workers 12
npm run -s benchmark:test-cost:normalize -- .test-cost-runs/<same-mode-run>...
```

Per-file cost is `collectDuration + setupDuration + sum(executed test durations)` from Vitest's completed reported
task graph. `collectDuration` already includes imports, so `importDurations` is never added again. "Summed" adds
those complete file costs and exceeds wall clock because files run in parallel; wall clock is measured around the
in-process Vitest action and excludes admission wait.

The superseded hand baseline used a test-time-only reporter window, so its summed figures were lower bounds. The
reporter derives that old window from
test results alone — `min(start)` to `max(start + duration)` — so a file's transform, module import, and
file-level hooks fall outside it, and the window sums to the file's test durations. On one unit-tier run the
summed window was 123.5 s against the same run's reported 78.8 s of transform and 131.3 s of import. The omission
matters most for levers that act on that fixed term: module-registry reuse across files moves almost nothing else,
and splitting a file re-pays it once per new file. A per-file figure that counts it is `collectDuration +
setupDuration` plus the file's test durations, read from the run's file tasks rather than the JSON payload —
`collectDuration` already includes the file's import time, and the payload carries no run-level end time, so wall
clock has to be taken from the run itself. The instrument now implements that complete metric directly.

**Five measurement conditions, and their complete modes are not interchangeable.** Every retained mode also
names its project set and worker sizing. Mixing modes produced two wrong conclusions during planning.

- **single-file** — one file, nothing else running. `config-validate.test.ts` measures 23.5 s this way.
- **tier-isolated** — one whole tier, quiet machine. The same file measures 37–40 s this way, because files within
  the tier contend.
- **under load** — full suite, or a tier running while other work competes for the machine. The same file measured
  4.4 s per test in an earlier under-load run against 1.8 s per test tier-isolated, a 2.4× spread.
- **standalone probe** — one non-tier process measurement, used for CLI startup.
- **CI job** — hosted or self-hosted workflow-job duration, which no local condition describes.

Every figure below is **tier-isolated on a quiet machine** unless stated otherwise.

Normalization is the median. A single retained run stays labeled `single-run`; only multiple exact-mode samples
are `median`. The noise band is an absolute change below 10% over the before value, with exactly 10% treated as
established. The instrument refuses lever comparison when condition, project set, or worker sizing differs.

One raw JSON payload per run is retained under package-local `.test-cost-runs/`, whose ignore rule was verified
with `git check-ignore`. What is committed here is the normalized ranking, mode, and derivation.

## Tier baselines

| Project set           | Wall clock | Summed file time | Files | Executed cases | Mode                              |
| --------------------- | ---------- | ---------------- | ----- | -------------- | --------------------------------- |
| `unit` + `unit-mocks` | 23.55 s    | 143.58 s         | 695   | 9,902          | tier-isolated / unit / 12 workers |
| `integration`         | 45.46 s    | 376.47 s         | 137   | 1,247          | tier-isolated / integration / 12  |
| Routine lane (no E2E) | 55.32 s    | 520.80 s         | 832   | 11,149         | tier-isolated / lane / 12         |
| `e2e`                 | 264.65 s   | 1,674.31 s       | 53    | 528            | tier-isolated / e2e / 12          |

Every row is a three-run median. The lane is one admitted combined invocation, not unit plus integration
arithmetic; its projects interleave in one worker pool. File and case counts exclude the one environment-gated
skipped case while retaining its file's collection/setup cost.

**Wall clock is floored by the longest file.** Files run in parallel and tests within a file run sequentially, so
no tier finishes before its longest file. Integration's median wall is 45.46 s against `user.test.ts` at 43.22 s,
while its 376.47 s summed time over 12 workers is a 31.37 s arithmetic floor. Unit's 23.55 s wall is floored by
`classify-change.test.ts` at 22.90 s. Reducing summed time does not move these tiers' wall clock until the longest
files shrink or split.

`build:fast`, which the integration global setup runs on every invocation, costs 1.2 s warm.

## Where the time concentrates

Cumulative share is of that tier's summed file time.

### `unit` — 143.58 s over 695 files

| File                                         | Seconds | Cases | Cumulative |
| -------------------------------------------- | ------- | ----- | ---------- |
| `classify-change.test.ts`                    | 22.90   | 122   | 16%        |
| `harness-hooks/codex-cli.test.ts`            | 17.98   | 37    | 28%        |
| `command-input/registry.test.ts`             | 9.03    | 4     | 35%        |
| `command-input/repository-inventory.test.ts` | 6.60    | 15    | 39%        |
| `kernel/import-boundary.test.ts`             | 2.79    | 8     | 41%        |
| `decompose-v3-authority-boundary.test.ts`    | 2.75    | 5     | 43%        |
| `user-status.test.ts`                        | 2.59    | 172   | 45%        |
| `meta-reader-inventory.test.ts`              | 2.49    | 1     | 47%        |

The first two files are 28% of the complete-cost tier. Neither spawns the ARC CLI: `classify-change` drives
`classify-change.sh` through
`bash`, and `codex-cli` spawns `git` 18 times and `sh` once. Both use `it.each`, so static `it(` counts understate
their case counts — `classify-change` declares 63 `it(` calls but executes 122 cases.

### `integration` — 376.47 s over 137 files

| File                                   | Seconds | Cases | Cumulative |
| -------------------------------------- | ------- | ----- | ---------- |
| `user.test.ts`                         | 43.22   | 94    | 11%        |
| `decompose-v3-repository-plan.test.ts` | 42.85   | 53    | 23%        |
| `review-fan-out-lifecycle.test.ts`     | 38.86   | 15    | 33%        |
| `config-validate.test.ts`              | 35.33   | 13    | 43%        |
| `review-cli-surfaces.test.ts`          | 15.89   | 22    | 47%        |
| `init.test.ts`                         | 12.41   | 39    | 50%        |
| `delivery-field-runs.test.ts`          | 11.84   | 9     | 53%        |
| `github-provider-refresh.test.ts`      | 9.57    | 5     | 56%        |
| `user-notes-compaction.test.ts`        | 9.04    | 18    | 58%        |
| `teardown.test.ts`                     | 8.46    | 22    | 60%        |
| `notes-export-state-coherence.test.ts` | 8.28    | 13    | 63%        |
| `one-shot-script-entrypoints.test.ts`  | 8.14    | 3     | 65%        |

**Only four files in this tier spawn the ARC CLI at all** — `config-validate`, `review-cli-surfaces`,
`decompose-v3-repository-plan`, and `scripts/remedy-roadmap-conflict`. They hold about 102 s, or **27%** of tier
cost. The other 133 files hold about 274 s (**73%**), and their dominant term is git fixture construction: 112 of
the 137 files carry a repo-building signal. Any lever aimed at CLI startup reaches at most the 27%.

`config-validate` is the exception that pays a different tax: it spawns the CLI from TypeScript source through the
`tsx` loader, at ~1.4 spawns per test.

### Fixture construction probe (`user.test.ts`, `init.test.ts`)

Both files build one fixture per test through `__tests__/helpers/integration.ts`, which delegates repository
creation to `createTempRepoCore` in `temp-repo.ts`. Spawn counts were verified with a logging `git` shim on
`PATH`; timings are ten sequential builds on an idle machine (mode: **single**, not comparable to in-tier figures)
under the config's hermetic environment (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`).

| Fixture shape                               | git spawns | Mean build | Used by                        |
| ------------------------------------------- | ---------- | ---------- | ------------------------------ |
| `createTempRepo` only                       | 4          | 9.5 ms     | `init` — 5 cases               |
| `createTempRepo` + `runInit`                | 9          | 106.4 ms   | `init` — 34 cases; `user` — 12 |
| `initInTempRepo` + `makeCommit`             | 11         | 110.5 ms   | `user` — 33 cases              |
| `initInTempRepo` + commit + `addBareRemote` | 14         | 137.6 ms   | `user` — 48 cases              |
| `fs.cpSync` of a built `user` fixture       | 0          | 7.3 ms     | 3.5 MB, 187 files              |

A single `git --version` costs 2.4 ms and `git init -q` 4.5 ms, so the nine spawns in the `runInit` path are
~24 ms of its ~106 ms; the remainder is the init command writing the `.arc/` tree. Spawn batching is therefore not
a lever; a template copy is, bounded by the fixture share below.

| File           | Instrument baseline | Cases | Probed saving | Share of new baseline |
| -------------- | ------------------- | ----- | ------------- | --------------------- |
| `user.test.ts` | 43.22 s             | 94    | 11.53 s       | 26.7%                 |
| `init.test.ts` | 12.41 s             | 39    | 3.67 s        | 29.5%                 |

**Absolute-path audit.** A built `initInTempRepo` + `makeCommit` fixture contains no occurrence of its own
absolute path anywhere, `.git/` included. The `addBareRemote` shape does: `.git/config` records the remote's
absolute `/tmp/arc-remote-*` path, and the remote is a sibling temp directory, not nested in the fixture. Note
that `ugrep`-backed `grep` functions skip hidden files under `-r` and return a false clean; use `/usr/bin/grep`.

**Remote leak.** `addBareRemote` returns its temp directory and leaves removal to the caller. Eleven integration
files call it and effectively all of them clean up — via `afterEach`, a cleanup set, or per-test removal. Exactly
two call sites discard the return and therefore cannot: one in `user.test.ts`, one in `sync-state-ref.test.ts`.
The removal primitive throws after its retries rather than failing quietly, so silent teardown failure is not a
further cause. The measuring machine held 1,210 leaked `arc-remote-*` directories (213 MB) from prior runs —
those two sites across many runs, plus runs killed at a timeout before teardown.

### `e2e` — 1,674.31 s over 53 files

| File                                     | Seconds | Cases | Cumulative |
| ---------------------------------------- | ------- | ----- | ---------- |
| `candidate-lineage.e2e.test.ts`          | 253.79  | 33    | 15%        |
| `delivery-position.e2e.test.ts`          | 156.78  | 23    | 25%        |
| `command-input-no-input.e2e.test.ts`     | 142.09  | 77    | 33%        |
| `errand.e2e.test.ts`                     | 127.39  | 47    | 41%        |
| `lifecycle-exit.e2e.test.ts`             | 119.94  | 24    | 48%        |
| `delivery-plan.e2e.test.ts`              | 110.45  | 18    | 54%        |
| `session-init.e2e.test.ts`               | 90.36   | 29    | 60%        |
| `review-protocol.e2e.test.ts`            | 50.12   | 8     | 63%        |
| `delivery-terminal-recovery.e2e.test.ts` | 45.74   | 18    | 66%        |
| `rename.e2e.test.ts`                     | 35.35   | 8     | 68%        |
| `publication-spine.e2e.test.ts`          | 33.92   | 7     | 70%        |
| `user.e2e.test.ts`                       | 32.67   | 13    | 72%        |

**Anchor-set gap.** CI pins four anchor files per leg and shards the remainder by path hash. The pinned set is
`candidate-lineage`, `errand`, `command-input-no-input`, and `lifecycle-exit`. Measured, the four largest are
`candidate-lineage`, `delivery-position`, `command-input-no-input`, and `errand` — so `delivery-position` (2nd,
156.78 s) is unpinned while `lifecycle-exit` (5th, 119.94 s) is pinned.

This ranking is mode-sensitive: an earlier under-load run put `command-input-no-input` 7th rather than 3rd. Anchor
selection must be made from tier-isolated data.

## Effective E2E shard membership

`benchmark:test-cost:shards` read the four live workflow exclusions, then asked Vitest's collecting
`list --json` form for the filtered tier and each `--shard` leg. The 49-file remainder partitioned exactly once,
13/12/12/12; the excluded anchors appeared in no remainder leg.

| Leg | Effective remainder membership                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1/4 | `delivery-authoring`, `log`, `publication-spine`, `reconfigure`, `rename`, `review-chunking`, `review-protocol`, `session-init-remote-boundary`, `smoke`, `sync-inbound`, `sync-state-producer`, `teardown`, `wu-reconcile`    |
| 2/4 | `anchored-sequence`, `attest`, `base-sync`, `commit-message-consumers`, `housekeep`, `plan`, `pre-push`, `schema-artifact`, `session-envelope-compat`, `session-init`, `status-lifecycle`, `sync-purity`                       |
| 3/4 | `base-drift`, `delivery-plan`, `delivery-transfer`, `health-diff`, `lifecycle`, `locus-errand-roundtrip`, `markdown-formatting`, `precompact-locus-anchor`, `release-commit`, `state-ref-race`, `user-inbox-remove`, `user`    |
| 4/4 | `base-merge`, `candidate-applicability`, `commit-msg`, `decompose-command-modes`, `delivery-position`, `delivery-terminal-recovery`, `init`, `run-cli`, `stale-build-guard`, `update`, `user-inbox-mark-execute-bound`, `view` |

Excluded anchors: `candidate-lineage`, `errand`, `command-input-no-input`, and `lifecycle-exit`. Names above omit
the common `.e2e.test.ts` suffix.

## Timeout, admission, and substrate signals

The instrument resolves each test's effective ceiling from Vitest's task timeout and any tighter `runCli` timeout.
The minimum headroom is not the same artifact in every tier.

| Project set | Tightest observed headroom                                         | Effective ceiling | Remaining headroom |
| ----------- | ------------------------------------------------------------------ | ----------------- | ------------------ |
| Unit        | `harness-hooks/codex-cli.test.ts` valid seed command case, 15.33 s | 30 s              | 14.67 s (48.9%)    |
| Lane        | same unit case, 15.33 s                                            | 30 s              | 14.67 s (48.9%)    |
| Integration | `review-cli-surfaces.test.ts` machine Git read case, 0.85 s        | 2 s               | 1.15 s (57.7%)     |
| E2E         | `delivery-position.e2e.test.ts` review-correction case, 70.31 s    | 90 s              | 19.69 s (21.9%)    |

Admission wait is retained but excluded from wall and summed time. Most baseline runs acquired immediately; one
of the three E2E runs waited 573.06 s. Separate live captures also observed 93.10 s before a 23.54 s unit run,
324.22 s before a 45 s integration run, and 286.43 s before a 264 s E2E run. These are contention readings, not
suite-runtime regressions.

The settled substrate rule matches user, user-notes, notes publication/export, sync-state, selected sync E2E, and
multi-clone families, while excluding unrelated `framework-sync` files.

| Project set | Substrate-bound summed time | Share of tier |
| ----------- | --------------------------- | ------------- |
| Unit        | 0.55 s                      | 0.40%         |
| Integration | 77.94 s                     | 20.72%        |
| Lane        | 82.37 s                     | 15.83%        |
| E2E         | 36.63 s                     | 2.19%         |

Companion post-instrument captures counted 29 built CLI invocations in integration and 1,815 in E2E. Those counts
are annotations on the same helpers used by the duration runs; they are not inferred from static source calls.

## CLI startup cost

Per-spawn fixed cost, warm, minimum of 5–7 runs. "Real verb" means a command that loads a handler.

| Configuration                             | `--version` | `view`  | `status` | RSS     |
| ----------------------------------------- | ----------- | ------- | -------- | ------- |
| Built bundle as shipped today             | 0.38 s      | ~0.36 s | 0.36 s   | 205 MB  |
| Built bundle + `NODE_COMPILE_CACHE`       | 0.29 s      | —       | —        | —       |
| Lazy handlers, `splitting: false`         | 0.14 s      | 0.21 s  | 0.25 s   | ~100 MB |
| Lazy handlers, code splitting on          | 0.03 s      | 0.19 s  | 0.23 s   | ~55 MB  |
| External dependencies alone, nothing else | 0.12 s      | —       | —        | 78 MB   |
| Bare `node -e ""`                         | 0.01 s      | —       | —        | 46 MB   |
| Spawned via `tsx` from TypeScript source  | 1.23 s      | —       | —        | —       |

**The 0.12 s dependency floor is structural.** `dist/cli.js` carries 532 top-level `import` statements — the nine
npm dependencies are external, not inlined — and ES module semantics evaluate hoisted imports before any importing
module's body runs. Deferring handler bodies cannot defer them.

**Code splitting's apparent advantage is a `--version` artifact.** It is worth 0.11 s on a `--version`-class path
but only ~0.02 s on a real verb, because a handler chunk pulls the dependency floor in regardless. The test suite
spawns real verbs, never `--version`.

`tsup` defaults `splitting` to `true` for ESM output and `tsup.config.ts` sets no `splitting` key, so today's
single-file `dist/` is a consequence of the bundle having no dynamic imports rather than a configured contract.
Keeping one output file once dynamic imports exist requires setting `splitting: false` explicitly.

## CI on the mini

The self-hosted runner is a Linux guest on an M4 Mac mini with two runner slots at one Vitest worker each; the
slot decision and its saturation evidence belong to `local-ci-capacity-qualification`. This baseline is the median
of six comparable successful heavy-lane workflow runs routed to `arc-ci-mini` (condition: **CI job**). The older
1,054-job-second capacity-qualification run used a different tree/run series and is not mixed into this baseline.

| Workflow run  | Total job-seconds |
| ------------- | ----------------- |
| `34498802526` | 1,364             |
| `34512577885` | 1,390             |
| `34548112571` | 1,358             |
| `34551373916` | 1,329             |
| `34558187114` | 1,414             |
| `34563562971` | 1,397             |

The median total is **1,377 job-seconds**, with a 1,329–1,414 range. Component medians are shown below; their
sum is 1,376 s because the median of each component need not equal the median of the row totals.

| Job                    | Median seconds |
| ---------------------- | -------------- |
| Classify lane & weight | 7              |
| Shared setup           | 18             |
| Lint & Typecheck       | 66             |
| Unit Tests             | 74             |
| Integration Tests      | 173.5          |
| E2E Tests (1)          | 206            |
| E2E Tests (2)          | 280            |
| E2E Tests (3)          | 334            |
| E2E Tests (4)          | 189.5          |
| Portability (linux)    | 22             |
| ci-ok, merge-ok        | 6              |

With two slots, wall time is roughly total job-seconds over two plus the serial head, so summed savings anywhere
in the heavy lane translate to wall time; per-leg balance only trims the makespan's tail.

## Derived targets

These bars are fixed before any optimizing phase scores them. Every input is either the retained first baseline or
a standalone probe on the artifact the later phase changes; re-tiering itself is not counted as a CI saving because
moving work between heavy jobs does not reduce total job-seconds.

### Integration summed file time: reduce by at least 15 seconds

The prepared-fixture probe saved 28.6% of the old 40.3 s `user` file and 31.6% of the old 11.6 s `init` file:

```text
(40.3 s × 28.6%) + (11.6 s × 31.6%) = 15.19 s
```

The instrument moved the file baselines to 43.22 s and 12.41 s, making those absolute savings 26.7% and 29.5% of
the new readings. The target retains the directly probed absolute saving and rounds down to **15 s**, or 4.0% of
the 376.47 s integration baseline.

### Routine lane wall clock: at most 42 seconds at 12 workers

The lane's 520.80 s summed baseline loses the two all-spawn files that re-tier to E2E (`config-validate`, 35.33 s;
`review-cli-surfaces`, 15.89 s) and the 15.19 s fixture saving:

```text
520.80 s - 35.33 s - 15.89 s - 15.19 s = 454.39 s
454.39 s / 12 workers = 37.87 s inclusive summed-time floor
37.87 s × 1.10 noise allowance = 41.65 s → 42 s bar
```

The file-splitting work must put every remaining file under that floor, so the post-work longest-file floor cannot
be larger. The resulting bar is **≤42 s at 12 workers**, the larger-floor rule plus the full 10% noise allowance,
rounded upward. If the later sizing sweep adopts a different worker count, it must forward-amend this bar before
scoring against it.

### CI heavy lane: reduce by at least 300 job-seconds

The conservative projection counts only fixed-cost changes with measured rates:

```text
E2E built CLI:       1,815 spawns × (0.36 s - 0.21 s) = 272.25 s
Integration built:     29 spawns × (0.36 s - 0.21 s) =   4.35 s
config-validate:       21 spawns × (1.23 s - 0.21 s) =  21.42 s
fixture sharing:                                           15.19 s
projected total:                                          313.21 s
```

The fixed target rounds that projection down to **300 job-seconds**, 21.8% of the 1,377-job-second CI baseline.
It excludes any anchor-balance benefit, any file-deletion/consolidation benefit, and the tier move itself, avoiding
double counting and leaving those later measurements as upside rather than prerequisites.

## Levers measured

| Lever                                      | Effect                                  | Confidence                       |
| ------------------------------------------ | --------------------------------------- | -------------------------------- |
| Taking E2E off the routine local path      | full local 297.67 s → 58.21 s (**80%**) | High — clean-tree paired runs    |
| Lazy-loading CLI handler modules           | per-spawn 0.36 s → 0.21 s (**42%**)     | High — probe on real handlers    |
| `tsx` → built bundle for `config-validate` | ~1.0 s per spawn on ~21 spawns          | High — direct measurement        |
| tmpfs fixture root, `integration`          | 47.4 s → 43.1 s (~9%)                   | **Low — within noise band**      |
| `--no-isolate`, `integration`              | ~6–12%, all 1,248 cases passed          | **Low — within noise band**      |
| tmpfs fixture root, `e2e`                  | 280.3 s → 278.9 s (**0.5%**)            | High — effectively nil           |
| CI anchor re-selection                     | ~25 s of critical path                  | Medium — from tier-isolated rank |
| Code splitting, on top of lazy loading     | ~0.02 s per real-verb spawn             | High — direct measurement        |
| Running the lane as one command            | 68.2 s → 55.5 s (**~15%**)              | High — same-session pair         |
| Fixture template copy, `user` / `init`     | ≤26–36% of those files' time            | High — probe; share is the bound |
| Skipping `build:fast` when `dist/` fresh   | 1.2 s                                   | High — effectively nil           |
| Batching git spawns per fixture            | ~24 ms of ~106 ms per build             | High — effectively nil           |

The two low-confidence rows are the reason the variance caveat matters: both sit at or below the ~8% run-to-run
spread and neither is established by the single runs recorded here.

Fixtures already root on `/tmp`, which is ext4 on WSL2's native virtual disk — **not** the `/mnt/*` 9p bridge that
would dominate everything else. That failure mode is already avoided.

`--no-isolate` passed all 1,248 integration cases including the three files using `vi.mock`, which suggests the
quarantine the unit tier applies may be unnecessary here. Mock-state leakage is order-sensitive, so one green run
is not proof.

## Alternatives closed by measurement or source

- **Node startup snapshots and Single Executable Applications** — not viable for this CLI's shape. An ESM entry
  point throws `SyntaxError` outright; the snapshot builder loads built-ins "but not additional user-land
  modules", which excludes externalized npm dependencies; `node:child_process` is unsupported and `execa` depends
  on it; the blob is locked to an exact Node version, architecture, and platform; and SEA cannot back an npm `bin`
  that must remain a `.js` file. The tracking issues for lifting the user-land-module restriction
  (`nodejs/node#44277`, `nodejs/help#3981`) are both closed "not planned".
- **`NODE_COMPILE_CACHE`** — caches compilation, not module evaluation, so it cannot touch the evaluation half of
  the dependency floor. Measured 0.38 s → 0.29 s standalone; published comparators sit at 6–20%. Its benefit also
  largely disappears once lazy loading removes the modules it was caching.
- **Code splitting** — measured above at ~0.02 s per real-verb spawn, against a `dist/` layout change.
- **Duration-aware CI shard membership** — Vitest 4.1.8 derives shard membership from `hash("sha1", specPath)`,
  sorted and sliced, with no duration input. Filters apply before sharding, so an explicit file argument cannot
  compose with `--shard`: `vitest list --project unit classify-change --shard=1/4` fails with
  `--shard <count> must be a smaller than count of test files`. Duration-aware membership would require a custom
  `sequence.sequencer`.

---

_This is the authoritative first instrument baseline. Later comparisons must preserve its complete mode stamps and
normalization discipline._
