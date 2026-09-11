# Test Suite Cost Baseline

Instrument-produced baseline of the CLI package's test-suite cost, taken 2026-09-11 during
`test-suite-right-sizing` execution. It grounds every later target in retained measurement rather than projection.

**Status: authoritative first instrument baseline.** Local figures are medians of three complete retained runs
captured at `3548ac2ca` with the repository-owned `benchmark:test-cost` entry after the member-boundary review
corrections. Every schema-v3 record carries a successful outcome established from Vitest's completed module states
and empty run-level unhandled-error set; raw runs remain regenerable and gitignored, while the normalized evidence
below is the durable record.

## Contents

- [Method and its limits](#method-and-its-limits)
- [Tier baselines](#tier-baselines)
- [Post-cost baseline](#post-cost-baseline)
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
npm run -s benchmark:test-cost:compare -- <comparison-request.json>
```

Per-file cost is `collectDuration + setupDuration + module duration` from Vitest's completed reported task graph.
The module duration includes all tests and hooks; individual test durations are retained separately and are not
added again. `collectDuration` already includes imports, so `importDurations` is never added either. "Summed" adds
those complete file costs and exceeds wall clock because files run in parallel; wall clock is measured around the
in-process Vitest action and excludes admission wait.

The superseded hand baseline used a test-time-only reporter window, so its summed figures were lower bounds. The
reporter derives that old window from
test results alone — `min(start)` to `max(start + duration)` — so a file's transform, module import, and
file-level hooks fall outside it, and the window sums to the file's test durations. On one unit-tier run the
summed window was 123.5 s against the same run's reported 78.8 s of transform and 131.3 s of import. The omission
matters most for levers that act on that fixed term: module-registry reuse across files moves almost nothing else,
and splitting a file re-pays it once per new file. A per-file figure that counts it is `collectDuration +
setupDuration + duration`, read from the run's file task rather than the JSON payload — `duration` includes the
file's tests and hooks, `collectDuration` already includes its import time, and the payload carries no run-level end
time, so wall clock has to be taken from the run itself. The instrument implements that complete metric directly.

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
established. The comparison entry refuses a lever when condition, project set, or worker sizing differs, and exposes
deliberate worker variation only through its distinct sizing-sweep operation.

One raw JSON payload per run is retained under package-local `.test-cost-runs/`, whose ignore rule was verified
with `git check-ignore`. What is committed here is the normalized ranking, mode, and derivation.

Only successful captures are eligible. Before persistence, every reported module must be terminal (`passed` or
`skipped`) and `ok()`, and Vitest must report no run-level unhandled errors. The JSON normalizer refuses legacy
records or any record without schema v3's explicit `outcome: "passed"` and zero-error stamps.

## Tier baselines

| Project set           | Wall clock | Summed file time | Files | Executed cases | Mode                              |
| --------------------- | ---------- | ---------------- | ----- | -------------- | --------------------------------- |
| `unit` + `unit-mocks` | 23.47 s    | 141.02 s         | 697   | 9,916          | tier-isolated / unit / 12 workers |
| `integration`         | 42.63 s    | 361.01 s         | 137   | 1,247          | tier-isolated / integration / 12  |
| Routine lane (no E2E) | 57.33 s    | 548.18 s         | 834   | 11,163         | tier-isolated / lane / 12         |
| `e2e`                 | 257.56 s   | 1,624.01 s       | 53    | 528            | tier-isolated / e2e / 12          |

Every row is a three-run median. The lane is one admitted combined invocation, not unit plus integration
arithmetic; its projects interleave in one worker pool. Executed-case counts exclude the one environment-gated
skipped case; the file count and summed time retain that file's collection/setup cost.

**Wall clock is floored by the longest file.** Files run in parallel and tests within a file run sequentially, so
no tier finishes before its longest file. Integration's median wall is 42.63 s against `user.test.ts` at 41.10 s,
while its 361.01 s summed time over 12 workers is a 30.08 s arithmetic floor. Unit's 23.47 s wall is floored by
`classify-change.test.ts` at 22.70 s. Reducing summed time does not move these tiers' wall clock until the longest
files shrink or split.

`build:fast`, which the integration global setup runs on every invocation, costs 1.2 s warm.

## Post-cost baseline

The post-Phase 5 baseline was captured at `8f6d655c5` on the same WSL2 host and with the same local mode as the
first instrument baseline. Each local row is the median of three successful retained schema-v3 runs; one E2E
sample waited 9.85 s for admission, and that wait remains separate from its timed window.

| Project set           | Wall clock | Summed file time | Files | Executed cases | Change from first baseline |
| --------------------- | ---------- | ---------------- | ----- | -------------- | -------------------------- |
| `unit` + `unit-mocks` | 11.12 s    | 112.50 s         | 696   | 9,766          | -52.6% wall / -20.2% sum   |
| `integration`         | 40.04 s    | 338.72 s         | 138   | 1,379          | -6.1% wall / -6.2% sum     |
| Routine lane (no E2E) | 44.93 s    | 457.99 s         | 834   | 11,145         | -21.6% wall / -16.5% sum   |
| `e2e`                 | 215.31 s   | 1,248.16 s       | 55    | 563            | -16.4% wall / -23.1% sum   |

The tier moves explain the changed file and case populations. Integration's movement is inside the 10% noise
band and is not claimed as a separate lever. The routine lane is above the earlier 44 s bar by 0.93 s; worker
sizing is deliberately unsettled at this point, so the sizing sweep must resolve the scored bar before the member
closes.

### Post-cost concentration

The integration top decile and the E2E head below are the cost-ranked audit input. Share is of the post-cost
tier's normalized summed file time.

| Integration file                        | Seconds | Cases | Share |
| --------------------------------------- | ------- | ----- | ----- |
| `decompose-v3-repository-plan.test.ts`  | 38.35   | 53    | 11.3% |
| `review-fan-out-lifecycle.test.ts`      | 35.34   | 15    | 10.4% |
| `user.test.ts`                          | 34.81   | 94    | 10.3% |
| `classify-change.test.ts`               | 27.43   | 122   | 8.1%  |
| `harness-hooks/codex-cli.test.ts`       | 18.92   | 37    | 5.6%  |
| `delivery-field-runs.test.ts`           | 11.21   | 9     | 3.3%  |
| `init.test.ts`                          | 10.22   | 39    | 3.0%  |
| `github-provider-refresh.test.ts`       | 8.27    | 5     | 2.4%  |
| `user-notes-compaction.test.ts`         | 7.84    | 18    | 2.3%  |
| `teardown.test.ts`                      | 7.10    | 22    | 2.1%  |
| `notes-export-state-coherence.test.ts`  | 7.09    | 13    | 2.1%  |
| `one-shot-script-entrypoints.test.ts`   | 6.86    | 3     | 2.0%  |
| `command-surface-documentation.test.ts` | 4.95    | 8     | 1.5%  |
| `delivery-member-six-lifecycle.test.ts` | 4.81    | 7     | 1.4%  |
| `start-dispatch.test.ts`                | 4.78    | 17    | 1.4%  |

| E2E file                                 | Seconds | Cases | Share |
| ---------------------------------------- | ------- | ----- | ----- |
| `candidate-lineage.e2e.test.ts`          | 204.77  | 33    | 16.4% |
| `delivery-position.e2e.test.ts`          | 122.64  | 23    | 9.8%  |
| `command-input-no-input.e2e.test.ts`     | 99.55   | 77    | 8.0%  |
| `errand.e2e.test.ts`                     | 90.85   | 47    | 7.3%  |
| `lifecycle-exit.e2e.test.ts`             | 90.41   | 24    | 7.2%  |
| `delivery-plan.e2e.test.ts`              | 78.60   | 18    | 6.3%  |
| `session-init.e2e.test.ts`               | 65.88   | 29    | 5.3%  |
| `review-protocol.e2e.test.ts`            | 38.82   | 8     | 3.1%  |
| `delivery-terminal-recovery.e2e.test.ts` | 35.67   | 18    | 2.9%  |
| `publication-spine.e2e.test.ts`          | 26.22   | 7     | 2.1%  |
| `rename.e2e.test.ts`                     | 25.52   | 8     | 2.0%  |
| `delivery-authoring.e2e.test.ts`         | 22.07   | 4     | 1.8%  |
| `user.e2e.test.ts`                       | 21.22   | 13    | 1.7%  |
| `locus-errand-roundtrip.e2e.test.ts`     | 20.77   | 7     | 1.7%  |
| `decompose-command-modes.e2e.test.ts`    | 19.49   | 4     | 1.6%  |

The top four E2E files remain `candidate-lineage`, `delivery-position`, `command-input-no-input`, and `errand`.
`lifecycle-exit` is fifth by 0.44 s, so the measured anchor correction remains the one identified by the first
baseline.

### Worker sizing sweep

The lane was measured in three-run alternating samples at 50%, 75%, and native sizing. On this 24-logical-CPU
host, those modes resolved to 12, 18, and 23 workers respectively.

| Requested sizing | Effective workers | Wall clock | Summed file time | Wall change from 50% |
| ---------------- | ----------------- | ---------- | ---------------- | -------------------- |
| 50%              | 12                | 44.93 s    | 457.99 s         | baseline             |
| 75%              | 18                | 45.13 s    | 573.62 s         | +0.5%                |
| native           | 23                | 46.12 s    | 701.69 s         | +2.7%                |

Neither raised setting improves wall clock, and both increase the work performed as contention grows. Because no
candidate cleared the 10% adoption band, the conditional sibling-session degradation probe did not fire. The
local runner keeps the configuration's 50% default, no runner-only override is added, and the CI cap remains
unchanged.

### Post-cost CI run

Workflow dispatch `34651274160` ran successfully on the two-slot `arc-ci-mini` at the same exact head. This is one
CI-job sample rather than a median; the dispatch exercises every heavy job but skips the PR-only `ci-ok` and
`merge-ok` rollups.

| Job                                | Seconds   |
| ---------------------------------- | --------- |
| Classify lane & weight             | 7         |
| Shared setup                       | 18        |
| Lint & Typecheck                   | 66        |
| Unit Tests                         | 40        |
| Integration Tests                  | 186       |
| E2E Tests (1)                      | 151       |
| E2E Tests (2)                      | 221       |
| E2E Tests (3)                      | 268       |
| E2E Tests (4)                      | 154       |
| Portability (concurrency guards)   | 20        |
| **Summed successful job duration** | **1,131** |

Against the six-run 1,377 s first baseline, the observed reduction is 246 job-seconds (17.9%). The run therefore
misses the derived 1,077 s bar by 54 s. That difference is recorded as measured rather than attributed to a lever
from one CI sample; later member validation must resolve the criterion from the evidence then available.

### Recorded budgets

`test-cost-budgets.json` is the single tracked record for the instrument and CI. Each limit is the observed
post-cost baseline plus the full 10% noise allowance, rounded upward to the next millisecond. Complete measurement
modes keep local and CI observations disjoint; the E2E CI entries additionally name the shard job.

| Tier        | Mode                              | Baseline  | Budget    |
| ----------- | --------------------------------- | --------- | --------- |
| Unit        | tier-isolated / unit / 12 workers | 11.116 s  | 12.228 s  |
| Integration | tier-isolated / integration / 12  | 40.035 s  | 44.039 s  |
| Lane        | tier-isolated / lane / 12         | 44.925 s  | 49.418 s  |
| E2E         | tier-isolated / e2e / 12          | 215.309 s | 236.840 s |

| CI job      | Mode                     | Baseline | Budget  |
| ----------- | ------------------------ | -------- | ------- |
| Unit        | CI job / unit / 1 worker | 40 s     | 44.0 s  |
| Integration | CI job / integration / 1 | 186 s    | 204.6 s |
| E2E 1       | CI job / e2e / 1         | 151 s    | 166.1 s |
| E2E 2       | CI job / e2e / 1         | 221 s    | 243.1 s |
| E2E 3       | CI job / e2e / 1         | 268 s    | 294.8 s |
| E2E 4       | CI job / e2e / 1         | 154 s    | 169.4 s |

These are the initial post-Phase 5 budgets. The integration, lane, and affected E2E entries are refreshed after
the cost-ranked conversions, so accepted Phase 7 movement does not present as regrowth.

## Where the time concentrates

Cumulative share is of that tier's summed file time.

### `unit` — 141.02 s over 697 files

| File                                         | Seconds | Cases | Cumulative |
| -------------------------------------------- | ------- | ----- | ---------- |
| `classify-change.test.ts`                    | 22.70   | 122   | 16%        |
| `harness-hooks/codex-cli.test.ts`            | 17.99   | 37    | 29%        |
| `command-input/repository-inventory.test.ts` | 8.82    | 15    | 35%        |
| `command-input/registry.test.ts`             | 8.82    | 4     | 41%        |
| `decompose-v3-authority-boundary.test.ts`    | 2.82    | 5     | 43%        |
| `kernel/import-boundary.test.ts`             | 2.78    | 8     | 45%        |
| `meta-reader-inventory.test.ts`              | 2.61    | 1     | 47%        |
| `user-status.test.ts`                        | 2.52    | 172   | 49%        |

The first two files are 29% of the complete-cost tier. Neither spawns the ARC CLI: `classify-change` drives
`classify-change.sh` through
`bash`, and `codex-cli` spawns `git` 18 times and `sh` once. Both use `it.each`, so static `it(` counts understate
their case counts — `classify-change` declares 63 `it(` calls but executes 122 cases.

### `integration` — 361.01 s over 137 files

| File                                   | Seconds | Cases | Cumulative |
| -------------------------------------- | ------- | ----- | ---------- |
| `user.test.ts`                         | 41.10   | 94    | 11%        |
| `decompose-v3-repository-plan.test.ts` | 41.05   | 53    | 23%        |
| `review-fan-out-lifecycle.test.ts`     | 36.80   | 15    | 33%        |
| `config-validate.test.ts`              | 33.88   | 13    | 42%        |
| `review-cli-surfaces.test.ts`          | 14.89   | 22    | 46%        |
| `init.test.ts`                         | 11.95   | 39    | 50%        |
| `delivery-field-runs.test.ts`          | 11.47   | 9     | 53%        |
| `github-provider-refresh.test.ts`      | 9.00    | 5     | 55%        |
| `user-notes-compaction.test.ts`        | 8.50    | 18    | 58%        |
| `teardown.test.ts`                     | 7.90    | 22    | 60%        |
| `one-shot-script-entrypoints.test.ts`  | 7.69    | 3     | 62%        |
| `notes-export-state-coherence.test.ts` | 7.65    | 13    | 64%        |

**Only four files in this tier spawn the ARC CLI at all** — `config-validate`, `review-cli-surfaces`,
`decompose-v3-repository-plan`, and `scripts/remedy-roadmap-conflict`. They hold about 90.2 s, or **25.0%** of tier
cost. The other 133 files hold about 270.8 s (**75.0%**), and their dominant term is git fixture construction: 112
of the 137 files carry a repo-building signal. Any lever aimed at CLI startup reaches at most the 25.0%.

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
| `user.test.ts` | 41.10 s             | 94    | 11.53 s       | 28.1%                 |
| `init.test.ts` | 11.95 s             | 39    | 3.67 s        | 30.7%                 |

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

### `e2e` — 1,624.01 s over 53 files

| File                                     | Seconds | Cases | Cumulative |
| ---------------------------------------- | ------- | ----- | ---------- |
| `candidate-lineage.e2e.test.ts`          | 246.80  | 33    | 15%        |
| `delivery-position.e2e.test.ts`          | 151.29  | 23    | 25%        |
| `command-input-no-input.e2e.test.ts`     | 137.16  | 77    | 33%        |
| `errand.e2e.test.ts`                     | 123.60  | 47    | 41%        |
| `lifecycle-exit.e2e.test.ts`             | 116.95  | 24    | 48%        |
| `delivery-plan.e2e.test.ts`              | 107.47  | 18    | 54%        |
| `session-init.e2e.test.ts`               | 87.69   | 29    | 60%        |
| `review-protocol.e2e.test.ts`            | 48.58   | 8     | 63%        |
| `delivery-terminal-recovery.e2e.test.ts` | 44.88   | 18    | 66%        |
| `rename.e2e.test.ts`                     | 34.04   | 8     | 68%        |
| `publication-spine.e2e.test.ts`          | 32.69   | 7     | 70%        |
| `user.e2e.test.ts`                       | 31.75   | 13    | 72%        |

**Anchor-set gap.** At the first baseline, CI pinned four anchor files per leg and sharded the remainder by path
hash. The pinned set was `candidate-lineage`, `errand`, `command-input-no-input`, and `lifecycle-exit`. Measured,
the four largest were `candidate-lineage`, `delivery-position`, `command-input-no-input`, and `errand` — so
`delivery-position` (2nd, 151.29 s) was unpinned while `lifecycle-exit` (5th, 116.95 s) was pinned.

This ranking is mode-sensitive: an earlier under-load run put `command-input-no-input` 7th rather than 3rd. Anchor
selection must be made from tier-isolated data.

## Effective E2E shard membership

`benchmark:test-cost:shards` read the corrected ordered anchor assignment and four live workflow exclusions, then
asked Vitest's collecting `list --json` form for the filtered tier and each `--shard` leg. The 51-file remainder
partitioned exactly once, 13/13/13/12; each complete leg below is its pinned anchor plus that remainder.

| Leg | Pinned anchor            | Vitest-derived remainder                                                                                                                                                                                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1/4 | `errand`                 | `delivery-authoring`, `lifecycle-exit`, `log`, `publication-spine`, `reconfigure`, `review-chunking`, `review-protocol`, `session-init-remote-boundary`, `smoke`, `sync-inbound`, `sync-state-producer`, `teardown`, `wu-reconcile`                    |
| 2/4 | `candidate-lineage`      | `anchored-sequence`, `attest`, `base-sync`, `commit-message-consumers`, `housekeep`, `plan`, `pre-push`, `rename`, `schema-artifact`, `session-envelope-compat`, `session-init`, `status-lifecycle`, `sync-purity`                                     |
| 3/4 | `command-input-no-input` | `base-drift`, `decompose-command-modes`, `delivery-plan`, `delivery-transfer`, `health-diff`, `lifecycle`, `locus-errand-roundtrip`, `markdown-formatting`, `precompact-locus-anchor`, `release-commit`, `state-ref-race`, `user-inbox-remove`, `user` |
| 4/4 | `delivery-position`      | `base-merge`, `candidate-applicability`, `commit-msg`, `config-validate`, `delivery-terminal-recovery`, `init`, `review-cli-surfaces`, `run-cli`, `stale-build-guard`, `update`, `user-inbox-mark-execute-bound`, `view`                               |

Names omit the common `.e2e.test.ts` suffix. The instrument refuses a different anchor count, duplicate or
non-contiguous leg assignments, or any mismatch between the mapped anchors and the exclusion set.

## Timeout, admission, and substrate signals

The instrument resolves whole-test headroom from the Vitest task timeout. A `runCli` timeout is retained separately:
it bounds one subprocess invocation, not fixture work or several sequential invocations within the same test.
The table uses each test's median duration across the three exact-mode runs, then selects the tightest fraction.

| Project set | Tightest observed headroom                                             | Effective ceiling | Remaining headroom |
| ----------- | ---------------------------------------------------------------------- | ----------------- | ------------------ |
| Unit        | `harness-hooks/codex-cli.test.ts` valid seed command case, 15.33 s     | 30 s              | 14.67 s (48.9%)    |
| Lane        | same unit case, 15.33 s                                                | 30 s              | 14.67 s (48.9%)    |
| Integration | `review-fan-out-lifecycle.test.ts` eight-member conjunction, 10.97 s   | 30 s              | 19.03 s (63.4%)    |
| E2E         | `delivery-position.e2e.test.ts` review-correction progression, 62.30 s | 90 s              | 27.70 s (30.8%)    |

Admission wait ends when the lock is acquired and is excluded from wall and summed time. Eleven schema-v3 baseline
runs acquired immediately and omit the optional field. One E2E run waited 305.24 s behind another worktree's full
test run, then recorded its uncontended run cost and the wait separately.

The settled substrate rule matches user, the complete user-sync family, user-notes, notes publication/export,
sync-state, selected sync E2E, and multi-clone families, while excluding unrelated `framework-sync` files.

| Project set | Substrate-bound summed time | Share of tier |
| ----------- | --------------------------- | ------------- |
| Unit        | 1.03 s                      | 0.73%         |
| Integration | 73.95 s                     | 20.49%        |
| Lane        | 85.96 s                     | 15.77%        |
| E2E         | 36.49 s                     | 2.23%         |

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

The instrument moved the file baselines to 41.10 s and 11.95 s, making those absolute savings 28.1% and 30.7% of
the new readings. The target retains the directly probed absolute saving and rounds down to **15 s**, or 4.2% of
the 361.01 s integration baseline.

### Routine lane wall clock: at most 44 seconds at 12 workers

The lane's 548.18 s summed baseline loses the two all-spawn files that re-tier to E2E (`config-validate`, 37.80 s;
`review-cli-surfaces`, 15.70 s) and the 15.19 s fixture saving:

```text
548.18 s - 37.80 s - 15.70 s - 15.19 s = 479.49 s
479.49 s / 12 workers = 39.96 s inclusive summed-time floor
39.96 s × 1.10 noise allowance = 43.96 s → 44 s bar
```

The file-splitting work must put every remaining file under that floor, so the post-work longest-file floor cannot
be larger. The resulting bar is **≤44 s at 12 workers**, the larger-floor rule plus the full 10% noise allowance,
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
| Fixture template copy, `user` / `init`     | ≤26–30% of those files' time            | High — probe; share is the bound |
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

_This is the authoritative schema-v3 first instrument baseline. Later comparisons must preserve its complete mode
stamps and normalization discipline._
