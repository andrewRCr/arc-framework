# Notes: test-suite-reliability

## Hosted CI before this work

An informal profile from the five most recent full-lane pull-request runs on the current layout (`37491029911`,
`37487788677`, `37473165224`, `37465313819`, `37417731917`, all 2026-10-06). It orients the work; the spec's recorded
baseline is what the criteria score against.

| Job group                        | Runner time per run | Notes                                                    |
| -------------------------------- | ------------------- | -------------------------------------------------------- |
| Unit (one job)                   | ~330 s (255–406)    | Native-tooling files are 93% of its summed file time     |
| Integration (two shards)         | ~475 s              | Shards run ~180–330 s each                               |
| E2E (four anchored shards)       | ~1,250 s            | Shard 2 runs ~480 s (anchor ~270 s, remainder ~200 s)    |
| Lint, setup, portability, others | ~330 s              | Lint & Typecheck ~130–170 s; Linux portability ~90–150 s |
| **Total**                        | **~2,400 s**        | Test jobs alone ~2,060 s                                 |

- **Full lane:** about 560–575 s from first job to last on the cleaner runs. E2E shard 2 is the long pole, which
  includes the anchored heavy file. Per-job fixed overhead (checkout, Node setup, cache) is about 10–15 s.
- **Light lane** (pushes to `main` and light pull requests: classify, setup, unit, lint): about 384 s, with the unit
  job as the long pole. Of the five pushes to `main` on 2026-10-06 from #825 to #829, four failed their unit job
  (`37419184257`, `37467686598`, `37478013154`, `37489414096`); `37492536892` passed.
- **Rough projection by job group, made while finalizing the spec:** unit to ~100–140 s; integration up ~90–125 s
  from the relocated real runs; E2E down ~300–450 s; total runner time down ~16–25% (test jobs ~20–29%); full-lane
  duration down ~35–45%, with integration likely the new long pole; light-lane duration down ~45%, with lint and
  typecheck the new long pole. The E2E figure rests on the staleness-check probes below and is the least certain.

## Measurement and probe record

- **Staleness-check cost:** two local best-of-six probes of a real `check commit-msg` spawn on 2026-10-06 measured
  0.80 s with the check against 0.42 s without, and 0.53 s against 0.28 s. The 1,815-spawn E2E count dates from
  2026-09-11 (`analysis-test-suite-cost-baseline.md`). Re-measure both on hosted runners before leaning on them.
- **Hosted unit maxima recorded while drafting, before the explicit timeouts landed:** `in-repo-boundary.test.ts`
  5.04 s, `ci-build-transfer.test.ts:65` 5.01 s, `ship-guard` 4.88 s, `meta-reader-inventory` 4.59 s.
- **Native-tooling projection:** the 55–60% cut comes from a per-file read of the 29 slowest native-tooling files
  during the hosted-test-reliability Errand's audit, not from a prototype.
- **Vitest 4.1.8 probes during spec review:**
    - Per-test metadata written from a shared setup file reaches `TestCase.meta()` in the `runTestSpecifications`
      result, with each test's skip state, while a command-line reporter list is in force, under `isolate: false`
      and across files in one worker. A name filter leaves non-matching tests `skipped` with empty metadata.
      Module metadata set from a setup file's `afterAll` did not reach a reporter.
    - `task.meta` set in a setup file's `beforeEach` reaches the `json` report in both isolation modes, for default,
      positional, and options-object timeouts.
    - A command-line `reporter` list replaces configured reporters (`resolveConfig`); Vitest adds `default` and, on
      GitHub Actions, `github-actions` only when the list is empty.
    - A per-project `configureVitest` plugin hook runs after config resolution and before reporters are created, so
      it can append a reporter without displacing the others. The hook must sit in each inline project's `plugins`;
      one on the root config did not fire for inline projects. The controller-held floor check was chosen instead.
    - The spawn guard blocked direct, named-import, and `execa` launches, including in a later file in the same
      worker, while an allowlisted file still spawned.

## Already landed

- **#828 (`de2536e01`):** explicit timeouts on four unit tests in three files (`ci-build-transfer.test.ts` 30 s;
  `lib/store/in-repo-boundary.test.ts`, two tests; `active/meta-reader-inventory.test.ts`,
  `REPOSITORY_SCAN_TIMEOUT`).
- **#829 (`2e6c5ad61`):** `arc-lane-attestation.yml` checks the inert pull-request data out at
  `.cache/arc-lane-change-data`, outside the build inventory. It was drafted into this work as a scope expansion and
  landed as its own Errand instead.
- Both merged to `main` after this planning branch was cut; the spec's counts and loci were taken on `main`.

## Boundaries owned elsewhere

- `lib/store/in-repo-boundary.test.ts` enforces `storage-contract`'s `lib/store/` boundary, so only its mechanism
  may change.
- The decomposition machinery (`decompose-v3-*`) is rewritten by `storage-seam`'s decomposition member and the
  storage cutover, which is why its tests and typed refusal reasons stay out of this work.
- The storage cutover removes `arc-lane-attestation.yml` (`cohort-state-storage.md`'s storage-coupling register).
- The selection rule for Markdown-pinning tests and the prose-pin rewrap sweep remain separate `USER-INBOX`
  captures.

## Decisions taken while drafting

- **Scope expansions accepted by the Owner:** the Vitest results cache as a second duration source, budget-overage
  visibility, and the unit-tier spawn guard. The `USER-INBOX` captures behind the first two were retired into the
  draft; the spec now carries all three.
- **Prompter:** the case for it is that declared and executed `--no-input` behavior are two hand-maintained copies.
  The 33 handler fallbacks that hard-code `noInput: false` turned out to be unreachable from the CLI, so making the
  context required narrows to the handlers that prompt. The prompter phase stays in this work by Owner direction.
- **Class `Heavy`, on both triggers.** Scale: about 60 test files across three tiers, the CI workflow, and 12
  prompt-bearing modules. Derivation: the prompter's design. Both compose existing declarations, seams, and helpers
  with established practice, so derivation does not reach `Novel`.

## Amendment A1: freeze evidence and begin fixes

Baseline collection encountered the failures this work is meant to remove: an ordinary local E2E attempt refused a
build as stale, and the third hosted attempt timed out in `ship-guard`. The one instrumented E2E diagnosis passed
without reproducing an unqualified read; the derived CLI was restored byte-for-byte. Further clean pre-fix samples
would delay the fixes without resolving either cause. Freeze the collected evidence, retaining failures honestly.

Superseded § 0 sampling text:

> - **Local:** the `benchmark:test-cost` instrument, with the discipline of `analysis-test-suite-cost-baseline.md`:
>   schema v4 captures, tier-isolated, 12 workers, three runs per tier, medians, and a 10% noise band. It records
>   per-file and summed file time for the unit, integration, and E2E tiers.
> - **Hosted:** at least three full-suite `workflow_dispatch` runs of `ci.yml` on the current layout (unit one job,
>   integration two shards, E2E four anchored shards). They record each run's duration, each test job's elapsed time,
>   per-file durations, and per-test unit durations. They leave `run_portability_pair` off, as every measured run
>   does, so the Windows and macOS legs never enter a duration.

Superseded criterion 5:

> **E2E summed file time** is at least 20% below its baseline (local instrument, three-run medians).

Original criteria 1 and 5 remain verbatim; appended criteria 15 and 16 define their replacement obligations.
The E2E baseline is one ordinary success, so there is no three-sample estimate of its noise. Hosted baseline medians
include all three attempts, including the failed unit job. Targets remain native cost −40% and E2E/hosted cost −20%.
Final reliability, native calibration, and the layout trial retain their evidence requirements: they decide whether
the fixes work, while further pre-fix baseline repetitions are closed.

Propagation checked: § 0, the closing measurement, baseline/E2E criteria, Task 1.2 and its replacement 1.2.R, and
Task 5.4's baseline interpretation change together. Native calibration (3.2), native exit measurement (3.8), source-scan
cost inventory (4.1), post-CPU layout reference (7.1), final acceptance measurements (10.1–10.3), and their criteria
are unaffected: they can consume the frozen references and remain required decision or acceptance evidence.

## Baseline

Frozen head: `88fefb20c43ac580855c5a4d0e6f0232a21e1361`. No optimizing change precedes these captures.

Schema v4; `tier-isolated`, 12 workers, project sets `unit`, `integration`, and `e2e`. Local cost is complete
per-file cost: environment setup, preparation, collection, setup, and module execution once. Hosted file timings
are Vitest display durations; they are retained separately and are not compared with local complete file cost.

| Local project | Ordinary successes | Wall time, ms | Summed file time, ms | Files | Cases |
| ------------- | ------------------ | ------------- | -------------------- | ----- | ----- |
| unit          | 3                  | 120,372       | 1,286,728.681        | 844   | 13604 |
| integration   | 3                  | 130,389       | 1,177,872.804        | 238   | 2804  |
| e2e           | 1                  | 343,095       | 2,787,941.456        | 67    | 701   |

Unit and integration rows are three-run medians. E2E is one ordinary success; it provides no measured noise
estimate. The 10% noise band remains a comparison convention, rather than evidence that this E2E sample is stable.

Native-tooling paired sums (unit + integration): 1,127,826.286, 1,129,643.991, 1,150,557.864 ms.
Baseline native-tooling cost: **1,129,643.991 ms** (median of paired sums). Prefixes follow § 0.

Local captures, all relative to `packages/arc-framework/.test-cost-runs/`:

- `post-guard-baseline-unit-{1,2,3}.json` and `.log`; `post-guard-baseline-unit-normalized.json`.
- `post-guard-baseline-integration-{1,2,3}.json` and `.log`; `post-guard-baseline-integration-normalized.json`.
- `post-guard-baseline-e2e-1.json` and `.log`: passed, 2,266 helper-recorded CLI launches.
- `post-guard-baseline-e2e-2.log`: failed; no successful retained JSON. The no-input matrix setup received the
  complete stale-build refusal from `arc init`. The first qualification reason was not captured; its cause remains
  unproven. Sample 3 was not started.
- `diagnostic-e2e-qualification.json`: instrumented diagnosis passed (340,756 ms); it is excluded from the ordinary
  baseline. No unqualified primary-checkout read was captured. The derived CLI was restored byte-for-byte.
- `post-guard-baseline-stop.json` and `post-guard-baseline-head.txt` preserve the stop and exact head.

Unit CLI count zero is uninstrumented and is not evidence of no native launch. Integration reports two helper
launches per run; helper counts do not establish an exhaustive native-process inventory. E2E counting is enabled.

| Hosted run    | First-attempt conclusion | Run seconds | Summed test-job seconds |
| ------------- | ------------------------ | ----------- | ----------------------- |
| `37560883490` | success                  | 445         | 2080                    |
| `37561522037` | success                  | 557         | 2141                    |
| `37562304308` | failure                  | 540         | 2225                    |

All-attempt baseline medians: **540 s** run duration; **2141 s** summed test-job time.
The third unit job failed on `ship-guard` at its 5,000 ms timeout; all other test jobs passed. These are pre-fix
observations, including that failure, rather than a passing acceptance gate. No retry replaces the failed sample.

Each run used `ci.yml` on the current layout, sequential dispatches, and `run_portability_pair` off. Its unit report
has timing and effective-timeout metadata for all 13,604 completed cases of both unit projects; the third has one
failed case. Hosted captures are `hosted-baseline/1-37560883490`, `2-37561522037`, and `3-37562304308`, each with
`run.json`, `jobs.json`, `log.txt`, `artifacts.json`, and `unit-report/unit-test-report.json`. The batch head is in
`hosted-baseline/post-guard-head.txt`; the older generic `head.txt` belongs to the earlier historical batch.

`post-guard-hosted-observations.json` retains every job elapsed time and per-file duration for these three runs,
plus the per-test near-timeout maxima. All-skipped integration files have no duration and are not assigned zero.
The shared `unit-setup.ts` records `task.timeout` as `arcTestCostVitestTimeoutMs`; inspection confirms all 32 isolated
unit-mock files also have populated reports. `normalizeRetainedTestCostRuns` preserves sample count and single-run
versus median normalization in the local normalized reports.

### Hosted near-timeout maxima

A case is listed when its maximum duration across the three attempts × 1.7 reaches half its recorded timeout.
The failed case is retained. Native families will be converted or relocated; remaining cases inform timeout sizing.
Full test names, maximum-run IDs, status, and minimum proposed timeouts are retained in the observations JSON.

- `__tests__/unit/lib/store/ship-guard.test.ts` — reference backend import boundary finds no production import into
  the test-only reference backend; max 5058.304 ms, timeout 5,000 ms, non-native, failed.
- `__tests__/unit/work-unit/decompose-v3-authority-boundary.test.ts` — decomposition v3 authority boundary exposes no
  legacy preparation, finalization, or execution identifiers; max 2902.400 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/build-command.test.ts` — root build establishes absent output and rebuilds unchanged inputs; max
  16585.786 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-command.test.ts` — package build establishes absent output and rebuilds unchanged inputs; max
  15971.032 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/work-unit/decompose-v3-authority-boundary.test.ts` — decomposition v3 authority boundary carries no
  receipt-era transaction vocabulary in production; max 2570.285 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/work-unit/decompose-v3-refusal-source-totality.test.ts` — decomposition refusal source totality maps
  every production refusal literal to a specific remedy; max 2550.469 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/active/meta-writer-inventory.test.ts` — semantic meta writer boundary rejects display labels in
  inline renderMetaFile override objects and the retired override type; max 2472.895 ms, timeout 5,000 ms, non-native,
  passed.
- `__tests__/unit/build-inputs.test.ts` — native compiler input capture keeps actual schema producer sources outside
  shared config dependencies; max 2300.613 ms, timeout 5,000 ms, native, passed.
- `__tests__/unit/work-unit/decompose-v3-refusal-source-totality.test.ts` — decomposition refusal source totality
  admits only stable outward reason producers; max 2284.781 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/kernel/schema-generation.test.ts` — kernel schema artifact generation projects the composed
  production families with stable references and bytes; max 2266.543 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/command-input/registry.test.ts` — command-input schema adapter and registry registers every
  command-owned schema in the live Commander tree; max 6346.541 ms, timeout 15,000 ms, non-native, passed.
- `__tests__/unit/build-coordinator.test.ts` — refuses failed ancillary publication and permits repaired generation;
  max 12411.464 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-command.test.ts` — root build:fast establishes absent output and rebuilds unchanged inputs;
  max 11988.126 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-command.test.ts` — package build:fast establishes absent output and rebuilds unchanged inputs;
  max 11546.805 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/lib/store/in-repo-boundary.test.ts` — repository store import boundaries keeps tests on the public
  composition and fixture boundaries; max 5762.548 ms, timeout 15,000 ms, non-native, passed.
- `__tests__/unit/build-coordinator.test.ts` — refuses failed obsolete cleanup publication and permits repaired
  generation; max 11508.351 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-coordinator.test.ts` — refuses failed entry publication and permits repaired generation; max
  11217.656 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/dev-build-refresh.test.ts` — retains the prior entry after failed compilation and supports repaired
  refresh; max 10643.588 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-preparation.test.ts` — refuses and repairs directory build metadata before test preparation;
  max 10521.041 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-preparation.test.ts` — refuses and repairs empty build metadata before test preparation; max
  10395.690 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-preparation.test.ts` — reuses full runtime output while explicit requests still generate anew;
  max 9778.910 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/build-preparation.test.ts` — refuses and repairs missing build metadata before test preparation; max
  9688.141 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/layout/import-boundary.test.ts` — layout import boundary exposes layout consumers only through the
  downward public library barrel; max 1613.327 ms, timeout 5,000 ms, non-native, passed.
- `__tests__/unit/vitest-prebuilt-runtime.test.ts` — enforces prebuilt qualification and permits repaired supported
  execution; max 19180.681 ms, timeout 60,000 ms, native, passed.
- `__tests__/unit/vitest-prebuilt-runtime.test.ts` — enforces prebuilt qualification and permits repaired native
  execution; max 19087.963 ms, timeout 60,000 ms, native, passed.
- `__tests__/unit/active/meta-reader-inventory.test.ts` — semantic meta reader boundary keeps first-party consumers on
  semantic fields and normalized identifier arrays; max 4695.140 ms, timeout 15,000 ms, non-native, passed.
- `__tests__/unit/ci-build-transfer.test.ts` — repairs transferred output before lint-typecheck consumes it with
  generation disabled; max 18600.086 ms, timeout 60,000 ms, native, passed.
- `__tests__/unit/vitest-native-closing.test.ts` — retains native worker failure through closing; max 9281.511 ms,
  timeout 30,000 ms, native, passed.
- `__tests__/unit/kernel/import-boundary.test.ts` — kernel import boundary keeps the live source graph within the
  kernel boundary; max 4634.001 ms, timeout 15,000 ms, non-native, passed.
- `__tests__/unit/ci-build-transfer.test.ts` — repairs transferred output before e2e consumes it with generation
  disabled; max 18353.256 ms, timeout 60,000 ms, native, passed.
- `__tests__/unit/vitest-failure-ownership.test.ts` — closes a native collection failure before releasing CPU and
  artifacts; max 9056.612 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/vitest-failure-ownership.test.ts` — closes a native setup failure before releasing CPU and
  artifacts; max 8993.420 ms, timeout 30,000 ms, native, passed.
- `__tests__/unit/ci-build-transfer.test.ts` — repairs transferred output before portability consumes it with
  generation disabled; max 17740.680 ms, timeout 60,000 ms, native, passed.
- `__tests__/unit/vitest-failure-ownership.test.ts` — closes a native execution failure before releasing CPU and
  artifacts; max 8850.605 ms, timeout 30,000 ms, native, passed.

## Amendment A2: timeout sizing without decomposition changes

The decomposition exclusion conflicts with the hosted headroom requirement for two refusal-source-totality cases.
Their frozen maxima are 2,550.469 ms and 2,284.781 ms under the 5,000 ms default; 1.7× runner variation exceeds half
that timeout. A 10,000 ms named timeout resolves the conflict without changing assertions, scanning, or machinery.
This bounded adjustment preserves the design intent under the expanded implementation direction.

Superseded exclusion:

> **Decomposition tests and machinery**, including the 120 s `integration/decompose-v3-repository-plan.test.ts` and
> `decompose-v3-refusal-source-totality.test.ts`, which stay as they are. § 3's survival rule still classifies
> `decompose-v3-authority-boundary.test.ts`, a source-scan test.

Grounding and propagation: the retained hosted maxima identify both cases; Task 2.4's blanket timeout rule and the
Non-Goal gain a bounded exception in 2.4.R. All decomposition contracts and the source-scan survival rule are
unaffected. The 5-second unit default and numerical cost targets stand.

## Implementation direction

Phases 1–10 run under deferred review with atomic commits where viable; pushes and hosted runs required for
implementation are preapproved. Bounded adjustments preserving the specification's intent are recorded in the task
record and completion report. Phase 11 remains outside that scope.
