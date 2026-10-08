# Notes: test-suite-reliability

Implementation and closing measurement are complete as recorded in
[Closing confirmation](#closing-confirmation-and-implementation-boundary). A14/A15 retain five first-attempt hosted
CI passes and twelve local captures at `9b3856d4d`; the original fifth-run ESLint headroom violation stays recorded.
Combined confirmation `37686035937` at `a916d0e1a33dfab99caf0f029d6fd058f2b0ad50` passes all nineteen jobs, both
portability legs and current unit headroom. Retained reductions are 44.05% native-tooling, 38.00% E2E summed file
time, 44.26% hosted duration and 20.36% summed test-job time. The E2E baseline remains a single ordinary success.

The sections preserve the investigation and decisions in their original sequence. Intermediate forecasts, pending
actions and failed attempts describe their recorded stage; the retained measurements and closing confirmation give
the final implementation outcome. Verification and independent review have separate boundaries.

## Contents

- **Context and baseline:** [Hosted CI](#hosted-ci-before-this-work),
  [Drafting decisions](#decisions-taken-while-drafting), [Frozen baseline](#baseline),
  [Implementation direction](#implementation-direction).
- **Native and architecture work:** [Portability outcomes](#portability-outcome-classes),
  [Native dispositions](#native-file-dispositions), [Native conversion](#native-conversion-measurement),
  [One-hop inventory](#one-hop-ban-inventory), [Migrated bans](#migrated-one-module-bans),
  [Source-scan result](#remaining-source-scan-cost-and-shared-parse-decision).
- **Runtime, CI and prompt policy:** [Managed freshness](#managed-freshness-decision),
  [E2E fixture result](#e2e-fixture-exit-measurement), [Unit launch admission](#unit-native-launch-admission),
  [Layout trial](#layout-trial), [Prompt substrate](#declared-prompt-policy-substrate),
  [Prompt migration closure](#prompt-migration-closure).
- **Closing corrections:** [Windows publication](#amendment-a5-windows-publication-keys),
  [Fixture source closure](#amendment-a6-synthetic-native-fixture-source-closure),
  [Local resource tuning](#default-local-gate-resource-tuning),
  [Repeated parsing](#amendment-a9-repeated-fixture-parsing),
  [Candidate decision setup](#amendment-a10-candidate-decision-fixture-work),
  [Candidate file tail](#amendment-a12-native-candidate-file-tail),
  [ESLint deadline](#amendment-a13-cold-eslint-configuration-load-deadline),
  [Evidence preservation](#amendment-a14-retain-evidence-through-a-deadline-only-correction),
  [Windows continuation](#amendment-a15-windows-native-fixture-continuation).
- **Accepted closing record:** [Measurements](#closing-measurement), [Budgets](#re-recorded-budgets),
  [Combined confirmation](#closing-confirmation-and-implementation-boundary),
  [Verification evidence](#verification-evidence).

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

## Portability outcome classes

Recorded from source at frozen head `88fefb20c43ac580855c5a4d0e6f0232a21e1361` before converting native files.
A filesystem run is real even when it launches no child. Each basename remains selected by the portability tier.
The existing integration inventory case is included alongside the original unit file.

- **`build-context`:** installed source-loader manifest and npm metadata invalidate context; nested tool resolution
  works without manifest subpath exports; missing, malformed, or empty installation metadata refuses and repairs;
  equivalent roots agree; Node, platform, and architecture change identity. All remain real filesystem/resolve
  runs in the original unit basename, with no process launch, build, or Git repository.
- **`build-cancellation`:** queued public builder cancellation preserves entry, owner, and unloaded configuration;
  a fresh public retry qualifies and releases ownership. The unchanged case now runs in
  `__tests__/integration/build-cancellation.test.ts`, selected by its original portability basename.
- **`build-generation-lifetime`:** asynchronous ownership renewal during a blocked compiler; owner death allows a
  surviving child to finish staging without publication, with repaired acquisition. Both real classes now run in
  `__tests__/integration/build-generation-lifetime.test.ts`, selected by the unchanged portability basename.
- **`build-coordinator`:** stable native generation publishes actual control graphs; failed publication removes
  qualification and a repaired generation succeeds (ancillary, entry, obsolete cleanup variants); changed compiler
  inputs refuse before publication and a stable retry qualifies. Locations: `__tests__/unit/build-coordinator.test.ts`
  proves all publication faults directly; its integration basename retains all three real classes.
- **`build-publication`:** absent live output is established and qualified; replaced native owner refuses before live
  mutation and repaired ownership publishes; malformed filesystem artifacts refuse before mutation; invalid CLI syntax
  refuses through the native parser; required output and obsolete cleanup precede evidence. All five real classes land
  in `__tests__/integration/build-publication.test.ts`; the full nine-case matrix remains in the unit basename.
- **`build-inventory`:** cache exclusion; non-input directory exclusion during baseline and qualification; preferred JS
  sibling membership; raw dangling/external/empty-directory links and supporting controls; file and directory retargeting;
  same-content replacement by link; derived output exclusion; source artifact-directory names remain inputs; timestamp
  independence and content selectivity; resolver-only qualification reads; unused first-party manifest invalidation;
  native metadata-omitted resolver manifests change both identities; native preferred-source resolution agrees with
  membership while irrelevant directories do not change output. All filesystem classes remain in the unit basename;
  both native resolver classes now run in `__tests__/integration/build-inventory.test.ts`.
- **`build-ownership`:** CPU admission precedes artifact acquisition and both release; same-checkout builders queue;
  CI and explicit concurrency bypass CPU alone; same-process exclusion survives a native-loaded control module;
  another checkout progresses; replaced ownership stops publication and repaired acquisition succeeds.
  Locations: all filesystem/lock cases stay real in `__tests__/unit/build-ownership.test.ts`; the native-loaded
  control module case runs unchanged in its integration basename. Both remain portability-selected.
- **`ci-build-transfer`:** producer builds full declarations; transferred qualified output is reused without generation;
  source-changed output is repaired before skip-build consumption; prepared integration/E2E setup and teardown retain
  the repaired generation and ownership; a second controller reuses output; platform-local install/full/preflight/
  consumption ordering retains declarations. All direct consumer rows and both real integration classes now run
  in `__tests__/integration/ci-build-transfer.test.ts`, selected by the original portability basename.
- **`ci-build-recovery`:** missing runtime/schema, malformed evidence, source/manifest/installation identity changes
  refuse without generation and resume after local preflight; missing/malformed/empty npm evidence refuses both
  controller and preflight without mutation, then repaired installation permits reuse; optional alternate-Node producer
  mismatch refuses, rebuilds locally, and resumes (baseline conditional skip retained). All matrices and real
  refusal/repair representatives now run in `__tests__/integration/ci-build-recovery.test.ts`, portability-selected.

## Native-tooling calibration

Publication calibration uses the existing local instrument with `single-file / lane / 12` and the exact basename
`build-publication.test.ts`. The injected CLI parser adds only that file selector; admission, runtime preparation,
closing, and schema-4 capture remain unchanged. Three focused before/after samples include both unit and integration
membership. These samples calibrate the conversion; they are not substitutes for the frozen whole-tier baseline or
Task 3.8's native-tooling acceptance measurement. Raw captures retain their complete file and test metrics.

### Publication result and conservative forecast

Focused summed medians: **24,123.348 ms before**,
**13,891.872 ms after**; the paired unit/integration file conversion cuts
**42.41%**. Focused wall medians are 24,301 and 15,011 ms.
The compiler-free nine-case file costs 547.815 ms including import/setup; case-only median cost is
14.964 ms. Five real integration cases retain every publication class listed above.

Captures: `publication-calibration-before-{1,2,3}.json` and `publication-calibration-after-{1,2,3}.json`, all in
`packages/arc-framework/.test-cost-runs/`. The fixture carries valid captured baseline/evidence and registry-projected
schemas; filesystem faults and a parser-boundary refusal are direct. All nine unit cases failed against a temporary
no-publication reconstruction and passed after byte-for-byte source restoration. The relocation retains the native
owner replacement/repair and actual `node --check` refusal.

The table preserves baseline timing for each real representative, all import/setup costs, and execution overhead
(including shared producer hooks), then adds the measured helper-file cost for each selected conversion. Unsettled
representatives receive their entire original file cost, so unknown work never scores as zero. Existing integration
`build-inventory.test.ts` cost is also retained. This is an upper-cost forecast, not achieved savings or a commitment
to delete the unselected cases; each later task must name its narrower proof and record its actual outcome mapping.

Paired whole-prefix baseline median: **1,129,643.991 ms**; conservative forecast median: **839,480.304 ms**
(**25.69%** projected reduction). Raw per-sample calculations and selected title fragments are retained in
`native-tooling-calibration-projection.json`.

**Bounded execution adjustment:** the preliminary forecast is informational while conversion representatives remain
unsettled. Task 3.2.d's projection-stop direction is satisfied by the expanded authority to use judgment through
Phases 1–10; execution continues without claiming that the forecast met 40%. This changes the early stop cadence,
not the specification's 40% native-tooling acceptance criterion, portability outcome coverage, unit spawn prohibition,
or Task 3.8's three-run whole-tier measurement. No success criterion is marked by this calibration.

| Baseline unit file                     | Baseline median ms | Forecast median ms | Basis                           |
| -------------------------------------- | -----------------: | -----------------: | ------------------------------- |
| `build-baseline.test.ts`               |            202.495 |            202.495 | Full cost retained              |
| `build-cancellation.test.ts`           |          8,034.715 |          8,034.715 | Full cost retained              |
| `build-command.test.ts`                |         68,374.895 |         68,374.895 | Full cost retained              |
| `build-config.test.ts`                 |            392.337 |            392.337 | Full cost retained              |
| `build-configuration.test.ts`          |             35.759 |             35.759 | Full cost retained              |
| `build-context.test.ts`                |             86.217 |             86.217 | Full cost retained              |
| `build-coordinator.test.ts`            |         43,902.284 |         25,151.971 | Retained cases + hooks + helper |
| `build-evidence.test.ts`               |             25.205 |             25.205 | Full cost retained              |
| `build-generation-lifetime.test.ts`    |         12,634.209 |         12,634.209 | Full cost retained              |
| `build-generation.test.ts`             |         17,271.956 |         17,271.956 | Full cost retained              |
| `build-inputs.test.ts`                 |          2,529.190 |          2,529.190 | Full cost retained              |
| `build-inventory.test.ts`              |            168.824 |            168.824 | Full cost retained              |
| `build-ownership.test.ts`              |            555.005 |            555.005 | Full cost retained              |
| `build-preparation.test.ts`            |         79,226.547 |         39,315.247 | Retained cases + hooks + helper |
| `build-publication.test.ts`            |         47,617.704 |         29,963.049 | Retained cases + hooks + helper |
| `ci-build-recovery.test.ts`            |        119,599.440 |         30,329.408 | Retained cases + hooks + helper |
| `ci-build-transfer.test.ts`            |         83,481.685 |         83,481.685 | Full cost retained              |
| `dev-build-qualification.test.ts`      |         30,303.634 |         15,990.970 | Retained cases + hooks + helper |
| `dev-build-refresh.test.ts`            |         18,313.002 |         18,313.002 | Full cost retained              |
| `dev-check.test.ts`                    |             40.215 |             40.215 | Full cost retained              |
| `focused-lint-staged.test.ts`          |         19,606.667 |          3,726.928 | Retained cases + hooks + helper |
| `focused-lint.test.ts`                 |         11,903.942 |         11,903.942 | Full cost retained              |
| `focused-test-execution.test.ts`       |         23,986.958 |         23,986.958 | Full cost retained              |
| `focused-test-input.test.ts`           |            409.006 |            409.006 | Full cost retained              |
| `focused-test-runtime.test.ts`         |         66,847.971 |         41,687.789 | Retained cases + hooks + helper |
| `focused-test-selection.test.ts`       |         26,504.253 |          8,281.975 | Retained cases + hooks + helper |
| `local-vitest-entry.test.ts`           |         27,279.392 |         27,279.392 | Full cost retained              |
| `local-vitest-routes.test.ts`          |         61,209.088 |         61,209.088 | Full cost retained              |
| `local-vitest-runner.test.ts`          |         10,217.476 |         10,217.476 | Full cost retained              |
| `local-vitest-selection.test.ts`       |         28,497.883 |         28,497.883 | Full cost retained              |
| `test-cost-budget.test.ts`             |             27.240 |             27.240 | Full cost retained              |
| `test-cost-capture.test.ts`            |             28.491 |             28.491 | Full cost retained              |
| `test-cost-ci-budget.test.ts`          |             54.683 |             54.683 | Full cost retained              |
| `test-cost-cli.test.ts`                |             31.535 |             31.535 | Full cost retained              |
| `test-cost-comparison-request.test.ts` |             28.400 |             28.400 | Full cost retained              |
| `test-cost-comparison.test.ts`         |             51.190 |             51.190 | Full cost retained              |
| `test-cost-metrics.test.ts`            |             21.473 |             21.473 | Full cost retained              |
| `test-cost-mode.test.ts`               |             24.705 |             24.705 | Full cost retained              |
| `test-cost-native-failure.test.ts`     |         35,198.624 |         35,198.624 | Full cost retained              |
| `test-cost-native.test.ts`             |         43,365.704 |         43,365.704 | Full cost retained              |
| `test-cost-normalize.test.ts`          |             19.453 |             19.453 | Full cost retained              |
| `test-cost-retained.test.ts`           |             33.488 |             33.488 | Full cost retained              |
| `test-cost-run.test.ts`                |          7,167.266 |          7,167.266 | Full cost retained              |
| `test-cost-shard-run.test.ts`          |             50.171 |             50.171 | Full cost retained              |
| `test-cost-shards.test.ts`             |             44.529 |             44.529 | Full cost retained              |
| `test-cost-timeout.test.ts`            |             37.211 |             37.211 | Full cost retained              |
| `vitest-closing.test.ts`               |             26.490 |             26.490 | Full cost retained              |
| `vitest-completion-results.test.ts`    |             52.123 |             52.123 | Full cost retained              |
| `vitest-completion.test.ts`            |         47,417.200 |         17,676.340 | Retained cases + hooks + helper |
| `vitest-direct-runtime.test.ts`        |          7,681.297 |          7,681.297 | Full cost retained              |
| `vitest-discovery.test.ts`             |         25,696.398 |         25,696.398 | Full cost retained              |
| `vitest-failure-ownership.test.ts`     |         25,159.575 |         25,159.575 | Full cost retained              |
| `vitest-initial-coverage.test.ts`      |          6,956.859 |          6,956.859 | Full cost retained              |
| `vitest-mixed-shard.test.ts`           |         11,998.765 |         11,998.765 | Full cost retained              |
| `vitest-native-closing.test.ts`        |         25,203.745 |         25,203.745 | Full cost retained              |
| `vitest-prebuilt-runtime.test.ts`      |         39,366.548 |         39,366.548 | Full cost retained              |
| `vitest-runtime-context.test.ts`       |         21,987.399 |         12,569.003 | Retained cases + hooks + helper |
| `vitest-runtime-ownership.test.ts`     |         26,587.012 |         13,732.113 | Retained cases + hooks + helper |
| `vitest-worker-policy.test.ts`         |             28.642 |             28.642 | Full cost retained              |

Real integration case medians in the focused mode:

- `establishes required output and qualification when live dist is absent`: 2,203.871 ms.
- `refuses a lost native owner before any live mutation and permits a repaired build`: 3,201.861 ms.
- `refuses missing schema before changing live output`: 1,795.572 ms.
- `refuses invalid CLI before changing live output`: 1,970.217 ms.
- `exposes complete required output and removes obsolete output before evidence`: 1,902.735 ms.

## Native file dispositions

- **`build-publication`:** compiler-free unit matrix; five real integration classes retain all baseline portability
  outcomes. The four removed native filesystem replays are proved by the same named refusal cases in the unit matrix.
- **`build-coordinator`:** compiler-free publication-failure matrix; three real integration classes retain all baseline
  portability outcomes. The unit cases `refuses failed entry publication and permits repaired publication` and
  `refuses failed obsolete cleanup publication and permits repaired publication` replace their native replays.
- **`build-preparation`:** unit prebuilt reuse and both complete refusal matrices use valid manually staged output.
  The direct cases refuse with generation disabled, preserve evidence, and accept restored artifacts. Five native
  integration classes remain: full/fast explicit generation with qualified reuse, unqualified prebuilt refusal and
  built repair, artifact repair, metadata refusal and generated repair, and successful publication despite private
  staging disposal failure. The real `repairs missing CLI before returning preparation` represents the four artifact
  faults; the corresponding unit refusal cases prove schema absence, old evidence, and edited runtime separately.
  `refuses and repairs missing build metadata before test preparation` is the real metadata representative; unit
  `refuses empty metadata and reuses repaired prebuilt output` and `refuses directory metadata and reuses repaired
  prebuilt output` prove the other variants. All eight unit behaviors failed under a narrow prebuilt-return
  reconstruction and passed after byte-for-byte restoration.
- **`build-command`:** all six cases move to integration. Each root/package full/fast script still runs for real with
  its declaration contract, plus independent-checkout progress and same-checkout queuing. Only the root/full row
  repeats its public invocation on unchanged inputs: `root build establishes absent output through its declared
  generation mode` proves that shared coordinator outcome in place of the other three repeated builds. No public
  build-script entry is dropped, and this file has no remaining unit file.
- **`vitest-controller-logic`:** newly added pure coverage beyond the baseline 59-file set; direct results and early
  evidence refusals request no native work.

- **`build-generation` and `build-generation-lifetime`:** complete files relocate unchanged to integration. Every
  original staging, declaration, renewal, and owner-death scenario remains real; relocation alone claims no cost cut.

- **`build-context` and `build-evidence`:** all direct cases remain process-free. Context's missing/malformed/empty
  installation data and runtime dimensions, and evidence's legacy/path/digest/qualification faults, are distinct
  cheap policy checks; no named narrower proof replaces them, so the candidate tables are retained.
- **`build-inputs`:** all native producer/configuration and resolver cases move intact to integration.
- **`build-inventory`:** all real filesystem membership/link classes remain in unit without compilation. The
  metadata-omitted manifest case moves unchanged beside the existing preferred-source integration case; both real
  compiler outcomes and every filesystem class stay selected by the portability basename.

- **`build-ownership`:** real filesystem/advisory-lock cases remain in unit with scripted Git and no child. Only the
  native-loaded control module case moves to integration, unchanged. All baseline classes remain portability-selected.
- **`build-cancellation`:** the complete public-builder cancellation and repaired-retry case moves intact to
  integration; no outcome or native step is dropped, and the basename stays portability-selected.

- **`build-baseline`:** all baseline interval/source/configuration/installation/link decisions remain direct in unit;
  the complete real compiler interval case moves unchanged to integration.
- **`build-config`:** four direct runtime-only option assertions remain in unit; the complete dynamic-import
  bundling case moves unchanged to integration.
- **`build-configuration`:** inherited configuration content and target changes remain process-free filesystem
  checks. No compiler work, child process, or Git repository is requested.

- **`ci-build-recovery`:** one actual producer is shared by all direct qualification and installation fault rows.
  `refuses missing CLI without generation and resumes after local preflight` retains the real skip-build refusal,
  preservation, authorized generation, and repaired controller class. `requires installation repair for missing npm
  evidence before preflight can resume` retains the real terminal installation refusal and repaired reuse class.
  `qualification refuses missing schema/malformed evidence/CLI input/schema input/manifest/installation metadata
  without generating or mutating transferred output` are the narrower direct matrix proofs replacing those native
  replays; the installation matrix directly proves malformed and empty metadata with restored qualification.
  The alternate-Node producer scenario moves unchanged with its conditional skip. All ten direct fault behaviors
  failed against an always-qualified reconstruction of the public reader and passed after restoration in a temporary
  module/test copy. Primary source and derived CLI were untouched by that reconstruction.

- **`ci-build-transfer`:** one actual full producer backs every direct consumer row. The native integration job
  `repairs transferred output before integration consumes it with generation disabled` retains transfer, qualified
  reuse, changed-source repair, owned integration/E2E setup/teardown, and repeated skip-build consumption. The
  retained-producer/platform-local declaration case remains unchanged. The other three native job replays are
  replaced by `qualifies transferred output and its preflight contract for lint-typecheck/e2e/portability`, each
  checking the actual workflow command/environment, transferred full qualification, source-change refusal without
  generation, and restored full qualification. The four direct rows failed separately against stale-evidence
  acceptance and incorrect preflight wiring reconstructions, then passed after restoration. Workflow bytes and
  primary CLI output were preserved; the basename retains every baseline portability class.

- **`dev-check`:** existing `DevCheckDeps` fakes prove the complete freshness decision without native work.
- **`dev-build-qualification`:** the four-case unit matrix uses manually staged, qualified output and a fake
  publication parser. This bounded adjustment from the planned fake verdict table preserves actual absent,
  malformed, and legacy stamp decoding plus schema/runtime selectivity without a compiler. Existing `dev-check`
  fakes already prove the boolean dependency seam. All four behaviors failed against a narrow always-fresh
  reconstruction and passed after byte-for-byte restoration. Integration retains `refuses absent qualification
  despite newer output and permits repaired freshness` and the real selective producer-input case; the direct
  malformed/old rows replace their otherwise identical native rebuilds.
- **`dev-build-refresh`:** both real refresh cases move unchanged to integration, preserving live output during
  generation, failed-compilation preservation, repaired refresh, qualification, and private-staging cleanup.

- **`vitest-discovery`:** six direct public-controller cases prove empty/skipped refusal, retained parsing diagnostics,
  pre-parsed membership, and exact initial selection. Native empty configured discovery, parser error, cross-file-only
  refinement, and no-preparse heavy refusal remain in integration. `refuses skipped discovery and closes before
  execution` replaces the all-skipped native replay; the cross-file-only case retains real native skip-mode production.
- **`vitest-completion`:** eight fake-selection cases prove completion status and closing before capture without
  preparation or ownership. Integration retains `rejects dynamic skip despite native empty-run success` plus mixed
  passing, completed failure, collection failure, and setup failure. Removed unmatched-name, static-skip, todo, and
  nested-skipped native rows share the empty-completion class: `refuses unexecuted public states []/[skipped]/
  [pending]/[pending, skipped] and closes before capture` directly proves every public result state; native dynamic
  skip proves the external worker channel. Native name-filter/shard refusal also remains in `local-vitest-selection`.
- **`local-vitest-runner`:** both default and explicit `NODE_ENV` bootstrap decisions use the controller-creation
  boundary directly. `initializes a controller with NODE_ENV=explicit-native-environment` replaces that repeated
  native environment row; the default row retains actual configuration, setup, workers, and exactly one reporter
  initialization in integration. The exported tier-argument matrix remains covered by `vitest-controller-logic`.
- **`vitest-closing`, `vitest-completion-results`, and `vitest-worker-policy`:** existing public closing/result and
  worker-policy cases launch no native work. The sixteen new controller behaviors failed against narrow policy,
  bootstrap, and capture-order reconstructions and passed after restoration in temporary source/test copies.
  Primary source and derived CLI stayed untouched. Initial fixture row-spreading and diagnostic formatting mistakes
  were corrected before the retained behavioral red/green runs.

- **`vitest-runtime-ownership`:** the CI row keeps actual shared generation, both runtime projects, ownership through
  teardown, release, and reused generation. The repeated concurrency-override row shares that class; `bypasses local
  serialization under the deliberate-contention override` in `local-test-admission` and `retains artifact exclusion
  when CPU admission is bypassed by ARC_TEST_ALLOW_CONCURRENCY` in `build-ownership` preserve the distinct bypass policy
  and real artifact-lock exclusion without replaying compilation and workers.
- **`vitest-failure-ownership`:** native setup rejection and reported collection failure remain in integration, retaining
  both locks through controller closing and proving their final release. The execution-failure replay is replaced by
  `retains a module failure through completion` and `retains a collection failure through completion` in
  `vitest-controller-logic`, alongside the real reported-failure representative. Vitest `runFiles` awaits global setup
  before its pool error catch, so a thrown setup rejects while worker collection/execution return public failure
  reports; setup remains a distinct operation path. The new runtime-free selection
  `preserves execution failure and cleanup diagnostics without preparing a runtime` directly proves original-error
  preservation, one close, both cleanup diagnostic channels, failed status, and no capture after failure.
- **`vitest-runtime-context`:** all four own-key fault decisions run directly over compiler-free qualified output,
  preserve stamp bytes, and create neither lock nor configuration-load counter. Native undefined and mismatched
  context representatives remain in integration. Direct `refuses present null/missing fields evidence without
  replacing qualified output` replaces those repeated malformed-evidence native rows; qualified mismatch remains a
  separate real evidence-comparison class.
- **`vitest-prebuilt-runtime` and `vitest-direct-runtime`:** complete files move unchanged. Both supported and unmanaged
  native prebuilt refusal/repair routes stay real; direct setup still proves owned generation followed by an unpinned
  unmanaged run.
- **`vitest-native-closing`:** actual teardown logging and final worker cleanup remain real in integration. The
  combined collection/teardown row is replaced by `preserves execution failure and cleanup diagnostics without
  preparing a runtime` in the unit `vitest-failure-ownership` plus `fails rejected worker closing without losing
  diagnostics` and `retains the original thrown failure and its existing status when closing also fails` in
  `vitest-closing`. Native collection failure remains under real ownership in integration `vitest-failure-ownership`.
- **`vitest-mixed-shard`:** the complete real mixed-selection/unit-only-shard ownership and generation-reuse scenario
  moves unchanged to integration. Relocation alone claims no cost cut.

All five new context/composed-failure behaviors failed against narrow routing/closing reconstructions and passed
following restoration in temporary module/test copies; primary source and derived CLI were untouched.

- **`local-vitest-routes` and `local-vitest-entry`:** all ten root npm entries remain real in integration: `test`,
  `test:full`, `test:integration`, `test:arc-contracts`, `test:e2e`, `test:e2e:focused`, `test:portability`, `test:unit`,
  `test:changed`, and `test:portability:macos`. Native membership, owned setup, and all-skipped refusal remain.
  The repeated full-tier literal-options row is replaced by `retains literal native root options for test:unit`
  (same npm forwarding/selection class), direct `selects configured tier full`/`selects configured tier unit` in
  `vitest-controller-logic`, and `preserves native root test:full tier membership and owned setup` in the routes file.
- **`local-vitest-selection`:** the complete file moves unchanged. File:line execution, explicit location refusal,
  repeated exclusions across both actual shards, excessive-shard diagnostics, and empty-executed-shard refusal need
  the native configured globber/worker and remain real. Their adapter normalization policy is direct in
  `vitest-controller-logic`; no fake asserts the native engine's globbing or sharding result.
- **`vitest-initial-coverage`:** the complete custom-provider scenario moves unchanged. It compares actual public
  partial execution with supported initial execution and proves unexecuted source reaches the coverage report.

The bounded advisor consultation confirmed that native channel names alone do not establish separate outcome classes.
Primary source inspection verified the global-setup rejection path and the public direct replacement proofs before
folding the two additional replays. This refines the conversion within its existing design intent.

- **`focused-test-selection`:** `selectExactSpecifications` is exported with documentation; its body is unchanged.
  This bounded visibility adjustment exposes the existing decision rather than adding a controller injection layer.
  Seven direct cases prove exact files/directories, noncontributing operands, project-filtered refusal, configured
  order, object identity, and deduplication. Native exact-file, excluded-target, project-filtered refusal, and mixed
  eligible selection classes remain in integration. `selects exactly unit/dir without adjacent configured files`
  replaces the repeated directory row, alongside actual directory execution in `focused-test-execution`;
  `refuses noncontributing unit/helper.ts/unit/empty beside a valid operand` replaces those repeated refusal rows.
- **`focused-test-runtime`:** five fake-controller project combinations decide runtime need without preparation.
  The mixed unit/integration/E2E row retains one actual shared generation, both heavy setup/teardown paths, CPU/artifact
  ownership, qualification, reused generation without another configuration load, and final lease release. It replaces
  the integration-only/E2E-only native replays, whose different membership inputs are directly proved by `derives
  runtime need true for configured integration/e2e`. Unit-only unowned execution, unmatched-name refusal after
  preparation, refined-empty refusal before preparation, and cross-file-only refinement stay real in integration.
- **`focused-test-execution`:** the complete file moves unchanged. Literal npm separator/package cwd, native mock
  isolation and its override, native thread-pool parallelism, and explicit file serialization are distinct real
  execution classes; none is replaced by a fake.
- **`focused-test-input`:** native-option parsing and filesystem operand validation remain process-free. The twelve
  new selection/runtime behaviors failed against narrow empty-selection and constant-runtime reconstructions and
  passed after restoration in temporary source/test copies, with primary source and derived CLI left untouched.

- **`focused-lint`:** twelve direct `normalizeFocusedLintInput` cases prove root file/directory/glob normalization,
  empty/options-first/absolute refusals, unchanged delimited native options and additional patterns, and literal
  spaces/Unicode/tab/newline bytes. Five native classes remain in integration: successful suppression, selected lint
  failure, pre-load empty-target refusal, successful native options/additional patterns, and unmatched-pattern failure.
  `normalizes repository-relative src/targets/*.ts in package cwd` plus the retained actual additional-pattern case
  replaces the duplicate directory/glob native row; `refuses invalid root-target span [--,--format,json] before native
  loading` replaces the duplicate delimited-empty native refusal.
- **`focused-lint-staged`:** one fixture/scenario stages all supported literal names together. A native ESLint rule
  records parsed file identities, so a skipped filename cannot appear passed merely because nothing linted it.
  The clean hook invocation proves all names and suppression; the same fixture then adds an unsuppressed lint fault
  and source/test type faults and proves the hook collects all failures. This bounded refinement of the planned
  single real run uses two hook invocations, one for each required operational end state, within one scenario instead
  of six independent native scenarios on Linux (four on Windows). It preserves clean success and collected refusal
  without another fixture or a fake compiler. The script itself is unchanged, and `FORCE_COLOR` remains cleared.

All twelve normalization behaviors failed against an empty-result reconstruction and passed following restoration.
The combined staged case failed when its copied real hook forwarded only the first staged filename, then passed with
original hook bytes. The obsolete ESLint observer method was corrected before these retained native red/green runs;
primary production source, shell script, and derived CLI were untouched by either reconstruction.

- **`test-cost-native`:** the complete file moves unchanged to integration, retaining actual prepared setup/teardown
  and closing before retention, generation reuse across default output, wall-clock closing endpoint and native case
  metadata, unit-only refinement without runtime ownership, and repository-root script configuration.
- **`test-cost-native-failure`:** native teardown logging, zero-completion name filtering, failed execution, and late
  worker cleanup still refuse a passed record and release ownership. `refuses a passed record for empty failure` in
  unit `test-cost-run` replaces the repeated all-skipped native row: it runs the actual measurement function with a
  faithful skipped result, proves closing, and proves neither persistence nor a passed record occurs. The native
  dynamic-skip completion class also remains in integration `vitest-completion`.
- **`test-cost-run`:** six unit controller/clock/persistence cases request no native work. The complete actual
  preparation plus CPU/artifact waiting, renewal, release-before-persistence, and clock-accounting case moves to its
  integration basename. The new empty-completion retention refusal failed when the actual completion policy's zero
  count branch was removed, then passed after restoration in temporary module/test copies. Primary source and
  derived CLI were untouched by that reconstruction.

- **Remaining thirteen `test-cost` files:** `budget`, `capture`, `ci-budget`, `cli`, `comparison-request`, `comparison`,
  `metrics`, `mode`, `normalize`, `retained`, `shard-run`, `shards`, and `timeout` remain process-free. They construct
  in-memory policy/capture data; the run-record imports in comparison/retained are type-only. `shard-run` supplies
  both `execute` and `readWorkflow`, so its default execa/filesystem boundary is never invoked. Timeout helpers only
  annotate injected current-test metadata. Source inspection and the targeted file set establish their dispositions.

## Native conversion measurement

Conversion head: `a7ce5626ebbc5b0b91ae145e08858e5656fa7cfc`. All six ordinary schema-v4 captures passed at
`tier-isolated`, 12 workers, against the unchanged committed tree. The frozen head and instruments match § Baseline.

| Project     | Wall median, ms | Summed file median, ms | Files | Cases |
| ----------- | --------------- | ---------------------- | ----- | ----- |
| unit        | 16,702          | 178,512.159            | 826   | 13549 |
| integration | 162,377         | 1,887,502.322          | 275   | 2925  |

Native-family paired sums (unit + integration): **651,914.156, 656,069.528, 663,304.402 ms**.
Their median is **656,069.528 ms**, down **41.92%** from 1,129,643.991 ms, exceeding the required 40% reduction.
The after-sample range is 1.74% of its median; the baseline range is 2.01%. The 10% noise band remains the
comparison convention. Complete file duration includes fixed setup/preparation/collection cost, and every retained
native run follows its prefix into integration; relocation alone receives no saving credit.

The inventory reconciles all 59 frozen unit basenames to existing unit/integration files and the dispositions above.
The current prefix set includes the added `vitest-controller-logic` basename: 39 unit files and 38 integration files,
with 60 distinct basenames in their union. All nine portability basenames remain literal tier selectors, and every
baseline real class retains the real filesystem or native scenario recorded in § Portability outcome classes.
No class is replaced by a fake-only portability assertion.

Capture paths are relative to `packages/arc-framework/.test-cost-runs/`:
`native-conversion-{unit,integration}-{1,2,3}.json` and `.log`, `native-conversion-manifest.json`, and
`native-conversion-summary.json`. The summary retains baseline and after samples, medians, exact configuration,
threshold result, and each baseline basename's current locations. No failed attempt or diagnostic substitutes for
an ordinary sample. Full code checks and the full declaration build already cover this unchanged conversion tree;
this closure adds only the measurement record.

## Source-scan cost

Frozen inventory: 26 unit files and 123 expanded cases that inspect actual production/test code. Synthetic parser
fixtures, runtime JSON contracts, manifest-only reads, and methodology-only scans are outside this set. Paths below
are package-relative. The exact names and all three raw per-case/file durations are retained in
`packages/arc-framework/.test-cost-runs/source-scan-inventory-baseline.json`, reconciled against all three ordinary
`post-guard-baseline-unit-{1,2,3}.json` captures at the frozen head.

The complete-file sums are **50,181.960, 49,744.319, 48,506.898 ms** (median **49,744.319 ms**).
Selected case-time sums are **32,235.744, 31,484.541, 30,344.893 ms** (median **31,484.541 ms**).
Task 4.5 compares the same complete-file set, counting deleted files as removed. Shared `beforeAll` scans in
repository-inventory and help-coverage contribute setup cost once per file; their dependent cases are all listed,
without pretending the case durations alone include that shared work. Other non-scan cases remain in those files,
so the complete-file total measures this fixed file set, rather than attributing every millisecond to parsing.

Every case duration below is its three-sample median in milliseconds; each file duration includes fixed cost.

**`__tests__/unit/active/meta-reader-inventory.test.ts`** — file median 2,873.241 ms.

- semantic meta reader boundary > keeps first-party consumers on semantic fields and normalized identifier arrays —
  2,590.173 ms.

**`__tests__/unit/active/meta-reader-store.test.ts`** — file median 151.193 ms.

- active-meta store delegate > has only dynamic store imports so importing meta parsers closes no backend cycle —
  9.273 ms.

**`__tests__/unit/active/meta-writer-inventory.test.ts`** — file median 1,464.827 ms.

- semantic meta writer boundary > keeps full-record producers off projection override contracts — 1.147 ms.
- semantic meta writer boundary > rejects display labels in inline renderMetaFile override objects and the retired
  override type — 1,446.648 ms.

**`__tests__/unit/cli-loading-boundary.test.ts`** — file median 271.771 ms.

- CLI loading boundary > keeps import-time registrations outside the lazy module set — 206.784 ms.
- CLI loading boundary > loads the representative view handler only when its command runs — 16.468 ms.
- CLI loading boundary > loads every implementation module only when its command runs — 14.589 ms.
- CLI loading boundary > defers path-conditional active candidate projection modules — 7.425 ms.
- CLI loading boundary > loads the active status authority without initializing the broader command barrel — 4.556 ms.
- CLI loading boundary > loads git operations from their owning modules instead of the broad barrel — 10.494 ms.

**`__tests__/unit/command-input/registry.test.ts`** — file median 10,325.361 ms.

- command-input schema adapter and registry > registers every command-owned schema in the live Commander tree —
  4,097.929 ms.

**`__tests__/unit/command-input/repository-inventory.test.ts`** — file median 10,000.020 ms.

- repository command-input inventory > reconciles every live syntax site and declared interaction use — 6.029 ms.
- repository command-input inventory > excludes rejection-only review JSON flags from accepted inputs — 0.785 ms.
- repository command-input inventory > requires every discovered interaction policy to come from a command-owned
  declaration — 0.672 ms.
- repository command-input inventory > requires semantic syntax policy to come from a command-owned declaration —
  0.684 ms.
- repository command-input inventory > routes every machine-readable command through the interaction-context adapter —
  0.348 ms.
- repository command-input inventory > routes merge-lock JSON commands under a constant machine-mode policy — 0.328
  ms.
- repository command-input inventory > routes review resolve-family JSON commands under a constant machine-mode policy
  — 0.467 ms.
- repository command-input inventory > routes hosted review JSON commands under a constant machine-mode policy — 0.329
  ms.
- repository command-input inventory > routes local review and response JSON commands under a constant machine-mode
  policy — 0.520 ms.
- repository command-input inventory > declares JSON mode on attest, publish, and locus — 0.326 ms.
- repository command-input inventory > routes value-bearing human-output commands through the interaction adapter —
  0.297 ms.
- repository command-input inventory > routes release opt-in and opt-out through the interaction adapter — 0.233 ms.
- repository command-input inventory > routes every terminal-prompt subprocess command through the interaction-context
  adapter — 0.370 ms.
- repository command-input inventory > routes the close-stdin frontline provider through the interaction-context
  adapter — 0.183 ms.
- repository command-input inventory > assigns the byte-preserving raw Git boundary to its command families — 0.383
  ms.
- repository command-input inventory > assigns the post-action development build refresh to its head-moving command
  families — 0.297 ms.
- repository command-input inventory > assigns the close-stdin hosted GitHub boundary to every reachable command
  family — 0.280 ms.
- repository command-input inventory > routes lifecycle and errand command boundaries through the interaction-context
  adapter — 0.280 ms.
- repository command-input inventory > renders a stable descriptive table without writing a tracked artifact — 0.746
  ms.
- repository command-input inventory > maps every schema-owned inventory site to a real command-schema field — 5.674
  ms.
- repository command-input inventory > maps every registered syntax site to a real command-schema field — 5.584 ms.
- repository command-input inventory > represents every command-schema field in the authoritative inventory — 3.540
  ms.
- repository command-input inventory > exact-matches every interaction-capable command to the real-process matrix —
  0.539 ms.
- repository command-input inventory > rejects duplicate explicit policy ownership instead of silently taking the last
  declaration — 3.821 ms.

**`__tests__/unit/config/inventory.test.ts`** — file median 43.280 ms.

- ARC configuration inventory > finds no unowned consumed key or parallel default table in policy adapters — 5.422 ms.

**`__tests__/unit/git/configured-identity-boundary.test.ts`** — file median 58.485 ms.

- configured identity read boundary > keeps direct arc.identity Git reads inside the identity owner — 22.380 ms.

**`__tests__/unit/isolated-mock-files.guard.test.ts`** — file median 74.316 ms.

- module-mocking unit files are quarantined > matches the isolated-tier list exactly — 16.141 ms.

**`__tests__/unit/kernel/import-boundary.test.ts`** — file median 3,297.719 ms.

- kernel import boundary > exposes exactly the designed value and type surface from an explicit barrel — 8.553 ms.
- kernel import boundary > keeps the canonical digest core free of Zod imports — 14.358 ms.
- kernel import boundary > keeps the live source graph within the kernel boundary — 2,968.384 ms.

**`__tests__/unit/layout/import-boundary.test.ts`** — file median 1,032.610 ms.

- layout import boundary > depends only on local modules, the kernel, Zod, and host path semantics — 6.109 ms.
- layout import boundary > exposes layout consumers only through the downward public library barrel — 1,014.749 ms.

**`__tests__/unit/lib/cli-help-coverage.test.ts`** — file median 152.579 ms.

- help inventory > has intentional summaries for the entire visible registered tree — 0.757 ms.
- help inventory > detects newly registered visible commands and excludes hidden commands — 19.201 ms.
- help inventory > explains file/stdin and JSON output on registered request pages without copying schemas — 1.191 ms.
- help inventory > exactly covers immediate visible children of  — 0.276 ms.
- help inventory > exactly covers immediate visible children of review — 0.086 ms.
- help inventory > exactly covers immediate visible children of user — 0.049 ms.
- help inventory > exactly covers immediate visible children of errand — 0.040 ms.
- help inventory > exactly covers immediate visible children of release — 0.108 ms.
- help inventory > exactly covers immediate visible children of delivery — 0.071 ms.
- help inventory > renders review in the settled group and member order — 4.335 ms.
- help inventory > renders user in the settled group and member order — 1.603 ms.
- help inventory > renders errand in the settled group and member order — 2.750 ms.
- help inventory > renders release in the settled group and member order — 1.135 ms.
- help inventory > renders delivery in the settled group and member order — 1.444 ms.

**`__tests__/unit/lib/store/concurrency/import-boundary.test.ts`** — file median 53.669 ms.

- concurrency dependency boundary > imports only its own modules, kernel, store core, and the line merge dependency —
  14.503 ms.

**`__tests__/unit/lib/store/concurrency/line-merge-api.test.ts`** — file median 55.427 ms.

- exports text and contract types without exposing the dependency's types — 33.834 ms.

**`__tests__/unit/lib/store/in-repo-boundary.test.ts`** — file median 7,963.683 ms.

- repository store import boundaries > keeps backend implementation imports inside the store and reaches the backend
  entry only through its factory — 3,310.150 ms.
- repository store import boundaries > keeps tests on the public composition and fixture boundaries — 4,496.252 ms.
- repository store import boundaries > defers every heavy active projection until a kind or operation needs it —
  139.379 ms.

**`__tests__/unit/lib/store/registry.test.ts`** — file median 46.767 ms.

- role-based storage registry > keeps presentation filenames out of the production store core — 1.286 ms.

**`__tests__/unit/lib/store/ship-guard.test.ts`** — file median 3,321.537 ms.

- reference backend import boundary > finds no production import into the test-only reference backend — 3,039.983 ms.

**`__tests__/unit/locus/role-authority-boundary.test.ts`** — file median 45.232 ms.

- checkout role authority boundary > keeps derivation free of durable locus storage and liveness imports — 15.243 ms.

**`__tests__/unit/scripts/review-gate/core/canonical-caller-inventory.test.ts`** — file median 43.033 ms.

- review-gate canonical serializer inventory > closes the kernel-backed helper caller set — 4.344 ms.
- review-gate canonical serializer inventory > closes the frozen version-one caller set — 3.639 ms.
- review-gate canonical serializer inventory > keeps kernel canonicalize direct and removes parallel serializers —
  11.181 ms.
- review-gate canonical serializer inventory > keeps NUL-delimited identities outside JSON serialization — 0.242 ms.

**`__tests__/unit/scripts/review-gate/core/ports.test.ts`** — file median 107.107 ms.

- review adapter ports > keeps the core source independent of adapter and runner vocabulary — 88.072 ms.
- review adapter ports > does not retain the retired host-controller port surface — 0.997 ms.

**`__tests__/unit/scripts/review-gate/review-schema-boundary.test.ts`** — file median 86.780 ms.

- review schema ownership boundary > derives every exported owner type from Zod and exposes only registrar functions —
  50.333 ms.
- review schema ownership boundary > pins every handwritten validator importer to the schema-v1 compatibility boundary
  — 5.554 ms.

**`__tests__/unit/scripts/review-gate/review-schema-registration.test.ts`** — file median 42.235 ms.

- review schema registration > keeps review imports and vocabulary out of kernel schema modules — 0.361 ms.

**`__tests__/unit/session-envelope/type-authority.test.ts`** — file median 218.716 ms.

- session-envelope type authority > derives 'LoadSetManifest' from its runtime schema — 15.571 ms.
- session-envelope type authority > derives 'TaskListCursor' from its runtime schema — 8.629 ms.
- session-envelope type authority > derives 'TaskListCursorFileResult' from its runtime schema — 5.884 ms.
- session-envelope type authority > derives 'CompactionSeed' from its runtime schema — 3.268 ms.
- session-envelope type authority > derives 'LoadSetAuditVerdict' from its runtime schema — 3.426 ms.
- session-envelope type authority > derives 'RecoveryAuditVerdict' from its runtime schema — 8.487 ms.
- session-envelope type authority > derives 'RecoverAuditReport' from its runtime schema — 1.830 ms.
- session-envelope type authority > derives 'InboxStateResult' from its runtime schema — 2.023 ms.
- session-envelope type authority > derives 'ErrandStalenessSweepResult' from its runtime schema — 2.542 ms.
- session-envelope type authority > derives 'NotesCompactionSessionAdvisoryResult' from its runtime schema — 1.378 ms.
- session-envelope type authority > derives 'MaterializableWorkUnitDiscoveryResult' from its runtime schema — 2.025
  ms.
- session-envelope type authority > derives 'OrphanBranchSweepResult' from its runtime schema — 4.049 ms.
- session-envelope type authority > derives 'RetiredSubdirDetectionResult' from its runtime schema — 2.396 ms.
- session-envelope type authority > derives 'PartialPushMarkerSurfaceResult' from its runtime schema — 2.203 ms.
- session-envelope type authority > derives 'ClassComposition' from its runtime schema — 0.825 ms.
- session-envelope type authority > derives 'CascadeResolution' from its runtime schema — 2.104 ms.
- session-envelope type authority > derives 'BaseBranchSnapshotAnalysisResult' from its runtime schema — 3.444 ms.
- session-envelope type authority > derives 'DirtyStateResult' from its runtime schema — 1.164 ms.
- session-envelope type authority > derives 'WorktreeSyncStatusResult' from its runtime schema — 7.202 ms.
- session-envelope type authority > derives 'WorktreeSnapshotAnalysisResult' from its runtime schema — 5.785 ms.
- session-envelope type authority > derives 'WorktreeRosterResult' from its runtime schema — 3.094 ms.
- session-envelope type authority > derives 'BaseDriftResult' from its runtime schema — 1.501 ms.
- session-envelope type authority > derives 'BaseDistanceSnapshotAnalysisResult' from its runtime schema — 3.203 ms.
- session-envelope type authority > derives 'BaseDistanceNotApplicableResult' from its runtime schema — 2.415 ms.
- session-envelope type authority > derives 'WorktreeIdentity' from its runtime schema — 0.894 ms.
- session-envelope type authority > derives 'SupersessionResult' from its runtime schema — 1.311 ms.
- session-envelope type authority > derives 'SupersessionSnapshotAnalysisResult' from its runtime schema — 1.185 ms.
- session-envelope type authority > derives 'CurrentHuskAdvisory' from its runtime schema — 1.212 ms.
- session-envelope type authority > derives 'ExtensionsSessionInitResult' from its runtime schema — 0.554 ms.
- session-envelope type authority > derives 'ActiveSessionInitResult' from its runtime schema — 0.966 ms.
- session-envelope type authority > derives 'ConfigSessionInitResult' from its runtime schema — 0.703 ms.
- session-envelope type authority > derives 'ReleaseRoutingValue' from its runtime schema — 0.682 ms.
- session-envelope type authority > derives 'DomainRulesSessionInitResult' from its runtime schema — 0.397 ms.
- session-envelope type authority > derives 'StatusIdentity' from its runtime schema — 2.869 ms.
- session-envelope type authority > derives 'CompactionSeedWriteStatus' from its runtime schema — 3.029 ms.
- session-envelope type authority > keeps 'StaleWorktreeSweepResult' under handwritten authority — 2.730 ms.
- session-envelope type authority > keeps 'WorkUnitStateResult' under handwritten authority — 2.449 ms.
- session-envelope type authority > keeps 'ErrandStateResult' under handwritten authority — 3.499 ms.
- session-envelope type authority > keeps 'UserSessionInitStatusResult' under handwritten authority — 2.773 ms.
- session-envelope type authority > keeps 'SessionInitProbeResult' under handwritten authority — 2.312 ms.
- session-envelope type authority > keeps 'SessionRecoverProbeResult' under handwritten authority — 2.458 ms.
- session-envelope type authority > retains one-way producer compatibility proofs beside the thin top-level schemas —
  0.330 ms.

**`__tests__/unit/view/import-boundary.test.ts`** — file median 64.097 ms.

- viewer import boundary > keeps corrected lib modules free of command imports and directly bound production effects —
  9.481 ms.

**`__tests__/unit/work-unit/decompose-v3-authority-boundary.test.ts`** — file median 3,745.421 ms.

- decomposition v3 authority boundary > ships no legacy authoring or executor modules — 0.507 ms.
- decomposition v3 authority boundary > exposes no legacy preparation, finalization, or execution identifiers —
  2,198.541 ms.
- decomposition v3 authority boundary > carries no receipt-era transaction vocabulary in production — 1,447.184 ms.
- decomposition v3 authority boundary > keeps receipt-free base advancement independent of retired codecs and
  authorities — 0.548 ms.

**`__tests__/unit/work-unit/decompose-v3-refusal-source-totality.test.ts`** — file median 3,510.852 ms.

- decomposition refusal source totality > maps every production refusal literal to a specific remedy — 1,967.978 ms.
- decomposition refusal source totality > admits only stable outward reason producers — 1,370.701 ms.

## Source-scan deletion dispositions

- **Reference packaging survives.** `referenceBundleInputs` inspects raw inputs and every output attribution;
  the real `store-reference-packaging` case applies it to native build metadata. A future bundle/plugin inclusion
  or metadata traversal regression is observable independently of an edit to the expected list. Its synthetic
  raw/output/multiple-output cases and the helper therefore remain. The production import scan is redundant for
  static, re-exported, dynamic, and type imports: the actual TypeScript config's `rootDir` refuses the reference
  source with TS6059. Its bound-loader gap remains pending the lint row, so the import cases are retained until
  that row is demonstrated in Task 4.3.c.
- **Meta display-label branches go.** A virtual source probe against the real compiler options and actual
  `MetaRecord`/`MetaRenderOverrides` exports produces TS2551 for both indexing and property access to `State`,
  and TS2561 for `renderMetaFile`'s inline `State` override. The reader retains projection-record and repeated
  identifier-list call checks. The writer retains full-record producers' projection-contract boundary.
- **Retired `MetaFieldOverrides` pin goes.** Re-declaring that arbitrary retired name says nothing about whether
  the live semantic contract regressed. Only changing the retired-name list changes its intended target, so it
  fails the survival rule; deleting the combined writer case removes both this pin and the compiler-owned branch.
- **Import-equals branches go.** The configured `@typescript-eslint/no-require-imports` rule resolves to error,
  and native rule probes report global `require` and `import x = require()`. Kernel and reference helper branches
  duplicating import-equals detection are removed, along with the kernel's planted import-equals rows. Bound
  `require` and `module.require` probes produce no such diagnostic, so their existing checks remain pending lint
  migration. A module loader can violate the live dependency boundary independently of any expected-list edit;
  its detector survives until that boundary is proved by lint.

The compiler probe uses a virtual compiler-host input and leaves primary source/build bytes untouched. Native lint
probes use the resolved rule and parser without a whole-project lint pass. Logs are
`/tmp/arc-source-toolchain-proof.log` and `/tmp/arc-require-toolchain-proof.log`. These are enforcement observations,
not newly added regression tests; no fail-first claim is made for test deletion.

## Change-detector dispositions

`decompose-v3-authority-boundary` drops the eleven removed-path pins, sixteen legacy preparation/execution
identifiers, and eleven receipt-era identifiers. Reintroducing an arbitrary retired name is not evidence that the
live transition regressed; these detectors follow their own lists instead of current behavior. The retired-codec,
receipt, preparation, and finalization alternatives in the base-advancement text ban go for the same reason.
Its `retirement-authority` alternative matches live authority modules and remains until its one-hop lint row lands.

The methodology case retains the two exact package/project equality checks: independently editing one copy produces
an actual synchronization failure. Its literal historical vocabulary and selected prose fragments go; changing
those fragments provides no behavioral proof of the current procedure. No shipped methodology or decomposition
implementation is changed.

The same survival rule removes `core/ports`' retired host-controller interface-name pin. This bounded extension to
Task 4.2 applies its existing deletion rule to an additional inventoried change-detector; live port contract tests
and the core dependency/vocabulary boundary remain. Re-declaring one old name does not itself violate those contracts.

## Amendment A3: faithful one-hop lint predicates

The superseded mechanism selected “`no-restricted-imports` plus `no-restricted-syntax` … entries scoped by `files`
globs.” Source inspection of `literalReferences` and `auditKernelBoundary` establishes arbitrary aliased factory,
returned loader, and inline factory forms that fixed selectors cannot relate across declarations. Kernel resolution
uses TypeScript; store privacy uses importer-relative lexical paths and type-only/eager distinctions. Replacing
these with string includes or callee-name selectors would weaken the established boundaries.

A bounded local rule carries those predicates in the same composed table; built-in rules retain the simple bans.
The adjustment changes the lint mechanism and preserves all architecture, coverage, performance, and CLI intent.
It uses the existing preauthorization for intent-preserving adjustments. The narrow advisor consultation supported
this route after primary verification; it is implementation advice, not an independent review result.

Author grounding and task audit cover the rule contract, existing alias fixtures, lexical versus TypeScript
resolution, store type-only/eager semantics, configuration composition, and migration ordering. Source-probe
claims name the actual helpers; desired rule behavior is stated as a future contract. The revision produces the
native rule and equivalent forbidden/allowed proofs before the original migration deletes any affected case.
The footprint reaches Task 4.3, its resolved-config proof, Task 4.5's fixed-set measurement, and the later Clack
row. Native-file conversion, managed staleness, CI design, prompter behavior, and acceptance cost thresholds are
unaffected. Criterion 11 still requires toolchain-held architecture; criterion 18 makes fidelity checkable.

### Local predicate substrate

`eslint/architecture-imports.ts` exports `createArchitectureImportsRule` and the direct
`findArchitectureImportViolations` decision. The root ESLint config registers the rule; matching-row options are
supplied by the subsequent table composition. The four current IDs are `neverthrow`, `kernel`, `store-production`,
and `store-tests`. Native configuration resolution refuses unknown IDs. The rule reads the TypeScript parser's
original source-file mapping and reports native source locations without reparsing or walking the source tree.

The existing alias/returned-loader/inline-factory extraction and kernel's Node16 TypeScript module resolution
remain intact, including unresolved-source refusal, TSX traversal, computed imports, CommonJS loaders, and factory
acquisition. Store predicates preserve whole-clause/named type-only imports, type exports, ordinary/mixed imports,
dynamic imports, the public factory, and tests' public composition seam. The transitive eager-closure check remains
in its original test and is not migrated. Store comparisons normalize platform separators, preserving the intended
relative-target boundary on Windows as well as POSIX.

Eight process-free unit decisions prove the store exceptions. One shared native ESLint fixture proves sixteen
configuration/reference scenarios, including all eight existing forbidden-package forms. Source-scan cases remain
until their actual table rows and native per-row lint proofs land. Native Node loading of the typed tooling module
and config succeeds on the installed runtime; the declared project engine is Node >=24.

Behavioral fail-first evidence:

- `arc-lint-bindings-first-red.log` / `-green.log`: every forbidden reference missing from an inert rule, then present.
- `arc-lint-predicate-schema-red.log` / `-green.log`: unknown ID accepted during native resolution, then refused.
- `arc-lint-allowed-{ordinary,result}-red.log` / `-restored-green.log`: overbroad calls and lost Result exception refuse
  valid inputs; restoration accepts them. The later kernel Result path is separately reconstructed and proved.
- `arc-lint-kernel-relative-red.log` / `-green.log`: both escape depths and missing relative source fail before repair.
- `arc-lint-kernel-{corpus,result,nested,packages}-red.log` / `-restored-green.log`: lost kernel checks and overly narrow
  local/package allowances fail the native corpus; restoration accepts the established valid cases.
- `arc-lint-store-private-red.log` / `-green.log`: outside source, wrong backend entry, mixed type/value, and test-private
  references fail before their predicates are implemented.
- `arc-lint-store-{types,factory,local,public}-red.log` / `-restored-green.log`: all eight unit exceptions and both native
  allowed representatives fail under narrowed reconstructions, then pass after restoration.

These logs are under `/tmp/`; reconstruction scripts clone the actual module and tests, preserve exports/signatures,
and remove their temporary test copies. Primary source and derived CLI bytes are not altered by reconstructions.
Tests share one parser/fixture because their behaviors belong to the same module walker and policy contract.
The installed TypeScript API deprecates import-clause `isTypeOnly`; the implementation uses its equivalent
`phaseModifier === TypeKeyword`, and the complete allowed-type matrix is rerun after that mechanical correction.

## One-hop ban inventory

Classification is bound to the 26-file, 123-expanded-case baseline inventory. Every original case is retained in
`packages/arc-framework/.test-cost-runs/source-ban-inventory.json` with its file-level split and source-scope
classification. This inventory is a migration plan, not evidence that a lint replacement already passed.

One-module dependency and declaration bans move only after native forbidden/allowed proof. Positive inventories,
export surfaces, transitive graphs and explicitly textual vocabulary properties remain tests. The incidental
comment/example branches named below fail the survival rule for executable dependency/default/caller properties:
a comment does not introduce the forbidden dependency or operation. This bounded interpretation is recorded
under the existing authority for intent-preserving adjustments; it does not narrow the store or schema vocabulary
contracts whose stated property includes text.

- `active/meta-reader-inventory` — **move remaining calls**. Bare calls to parseMetaProjectionRecord and
  parseIdentifierList become syntax rows with their existing authorized producers. Compiler-held display fields were
  removed in 4.1.

- `active/meta-reader-store` — **move static import ban**. The meta reader forbids static store imports, including
  type-only; its permitted dynamic delegate remains permitted.

- `active/meta-writer-inventory` — **move live identifier bans**. The five full-record producers forbid
  executable/type references to MetaProjectionOverrides and renderMetaProjectionFile. Comment/example mentions are
  incidental name matching, not use of a projection contract; classify that textual branch as change detection. The
  retired-name branch was removed in 4.1.

- `cli-loading-boundary` — **split bans and inventories**. Move runtime-static implementation/projection imports and
  broad active/git barrels. Keep exact positive eager/lazy inventories, required module presence, and import-time
  registration semantics; type-only imports remain allowed where runtime loading is the property.

- `command-input/registry` — **retain; narrow in 4.4**. Live command-owned schema registration is a positive
  inventory; call the cli.ts Commander scanner directly.

- `command-input/repository-inventory` — **retain semantic inventory**. Interaction declaration, schema, discovery
  and no-input reconciliation require a live cross-module catalog, not an import prohibition.

- `config/inventory` — **split declaration and catalog**. Move const DEFAULTS declarations in the eight adapters to
  syntax rows. Keep consumed-key membership against ARC_CONFIG_FIELDS. Comment/example DEFAULTS mentions do not
  declare duplicate defaults.

- `git/configured-identity-boundary` — **move direct-read syntax**. Preserve direct gitConfigGet reads and
  config/--get/arc.identity argument-array order coverage outside lib/git/identity.ts. Comments/examples do not
  perform Git reads; their textual matches are incidental change detection.

- `isolated-mock-files.guard` — **retain positive inventory**. Exact module-mock file equality against isolated-tier
  ownership is a catalog property.

- `kernel/import-boundary` — **split native predicates and exports**. Move kernel dependency/resolution/loading and
  global neverthrow bans through A3 predicates, plus the canonical-json zod ban. Preserve ts/tsx/cts/mts coverage
  and kernel/result.ts exemption. Keep explicit barrel value/type export surfaces; native binding and
  relative-target fidelity is established by 4.R.

- `layout/import-boundary` — **split dependencies and presence**. Move lexical layout dependency allowlist,
  outside-module private-import ban and command/handler barrel constraint. Keep required init/start consumers.
  Preserve lexical path semantics; add the specified type/dynamic/loader reference forms without replacing the
  allowlist with normalized containment.

- `lib/cli-help-coverage` — **retain semantic inventory**. Live Commander/help tree equality, member order, and
  visible child summaries remain tests.

- `lib/store/concurrency/import-boundary` — **split dependencies and package contract**. Move importer-relative
  containment, immediate store-core allowance, node-diff3 allowance and computed-reference refusal. Keep package
  version, license and development-dependency checks. Preserve normalization and add specified reference forms.

- `lib/store/concurrency/line-merge-api` — **retain export surface**. Actual emitted declarations must hide
  third-party implementation types; this is a public API proof.

- `lib/store/in-repo-boundary` — **split privacy and transitive loading**. Move production/test private-store
  references and sole public factory exemption using A3 predicates, preserving type-only and mixed-value semantics.
  Keep the heavy-projection eager transitive closure. No reduction of privacy strength is permitted.

- `lib/store/registry` — **retain text property**. Presentation filename exclusion from store-core source expressly
  concerns filenames, including documentation. No source evidence establishes an executable-only contract; preserve
  the complete text assertion rather than silently narrow it.

- `lib/store/ship-guard` — **split residual loader and packaging**. Move bound require reference-backend checks only
  after equivalent TypeScript resolver/root-membership native proof. Static forms were compiler-held. Keep actual
  bundle-input traversal, malformed metadata and multiple-output cases.

- `locus/role-authority-boundary` — **split dependencies and authority**. Move the one-module import/reexport
  allowlist; preserve required worktree-roster presence and live runtime/key-type projections.

- `scripts/review-gate/core/canonical-caller-inventory` — **split negative syntax and inventories**. Move prohibited
  helper identifier use outside owning modules and forbidden barrel reexports. Retain exact positive allowed
  callers, canonicalize importer set, serializer declaration inventory and NUL-delimited identity assertions.
  Comments/examples alone are not callers; their negative text branch is incidental change detection.

- `scripts/review-gate/core/ports` — **split dependency and vocabulary**. Move host/provider/runtime dependency
  bans. Keep the explicit host/runner vocabulary property; it includes conceptual coupling beyond executable
  imports. Retired interface pins were removed in 4.2.

- `scripts/review-gate/review-schema-boundary` — **split syntax and export contracts**. Move validation.js
  dependencies, handwritten interface bans and parse/project/validate declarations in eight schema owners. Keep
  z.infer/export registration surfaces and exact allowed importer presence. Comment mentions of validation.js do not
  create dependencies; classify those text matches as incidental change detection.

- `scripts/review-gate/review-schema-registration` — **retain vocabulary property**. Kernel dependency rows cover
  review imports; the separate change-facts/review-routing/finding-disposition/review-gate vocabulary assertion
  survives at full textual strength.

- `session-envelope/type-authority` — **retain export authority**. Schema-owned versus handwritten named exports and
  compatibility-proof definitions are structural contracts.

- `view/import-boundary` — **move imports and syntax**. Move command/effect import bans and dotted process property
  reads in the five viewer modules; retain runtime compatibility exports. Computed process access was outside the
  original scanner.

- `work-unit/decompose-v3-authority-boundary` — **split live dependency and sync**. Move live retirement-authority
  references in base advancement. Comment/example mentions do not load an authority; that text branch is incidental
  change detection. Preserve both actual package/project synchronization equalities; retired branches were removed
  in 4.2.

- `work-unit/decompose-v3-refusal-source-totality` — **retain typed semantic property**. Both type-checked refusal
  inventories and per-reason remedy specificity remain unchanged; A2 adjusts only their named timeouts.

## Composed architecture table

The table in `packages/arc-framework/eslint.config.js` names scope globs, exact-file exclusions, import paths and
patterns, syntax selectors, and local predicate IDs. Its initial rows enable the global `neverthrow` and kernel
predicates. `eslint/architecture-config.ts` partitions rooted directory scopes and exact-file anchors; each partition
has one option set per rule containing every matching row. It enumerates scope boundaries rather than source files,
so a future nested TSX/CTS/MTS file receives the same policy. Exact exceptions receive the remaining outer bans.
The intentionally bounded scope grammar refuses unsupported wildcard shapes rather than silently miscompose them.

Native `ESLint#calculateConfigForFile` proofs perform no lint pass. They cover actual global/kernel scopes and a
synthetic overlapping scope with all three option unions, including a future nested TSX module and an exact-file
exception. `arc-ban-table-single-{red,green}.log` and `-overlap-{red,green}.log` record missing real scope options,
then their presence. `arc-ban-table-{union,exception}-red.log` records behavioral failures under narrow copied
composer reconstructions; `-composition-green.log` and `-final-targeted.log` record restored native resolution.
An initial reconstruction invocation was rejected for a second npm separator; it was corrected before either
behavioral failure was recorded. No rejected invocation is counted as fail-first evidence.

The ordinary pre-table `lint:ts` command passes in 49,858.146 ms against the exact config at `5dec84dee`, recorded
in `/tmp/arc-ban-table-before-lint.{json,log}`. The measurement temporarily restores only that configuration and
then restores the current bytes in `finally`; production source and derived CLI are untouched. Final migration
cost is measured after all rows land, rather than inferred from this substrate's marginal cost.

The first routine suite after the predicate substrate became tracked found the coupling corpus classifier did not
own `packages/arc-framework/eslint/*.ts`. Its earlier green run preceded tracking that new directory, so this later
failure is retained rather than described as an unchanged green. The existing executable-code family now includes
that tooling directory; Markdown retains prose classification. Both concrete helper paths fail before the one-line
family registration and pass afterward, and the real checked-in corpus integration case passes. Evidence is in
`/tmp/arc-ban-table-corpus-{red,green}.log`; the final routine suite is rerun over the corrected, staged helper set.
This is a bounded integration adjustment required by the new lint tooling, with no taxonomy or audit-policy change.

## Migrated one-module bans

All dependency/declaration bans classified in § One-hop ban inventory are composed rows of the existing table.
Built-in import and syntax rules enforce simple references, type imports, import-equals, reexports, dynamic imports,
loader calls and declarations. The local rule adds lexical layout boundaries, importer-relative concurrency paths,
resolver-based reference-store loader membership and configured-identity argument sequences. It shares the native
parser's module and the existing reference collection; no tree enumeration, second parse or cache is introduced.

Native configuration-only assertions cover each added scope. The actual composed config's parser-only fixtures
prove forbidden syntax and scope exceptions without creating a type program for fabricated source. Ordinary full
`lint:ts` retains its type-checked configuration. The first full-type synthetic fixture run stalled and was cancelled;
a native stdin probe also failed in an unrelated size-rule source lookup. Neither is claimed as behavioral evidence.
The fixture-only `disableTypeChecked` override preserves the architecture rules and original native TypeScript node
mapping. CLI proofs use that temporary configuration solely for planted stdin; production source and CLI bytes stay
unchanged.

Fail-first evidence includes ten newly enabled predicate failures (`/tmp/arc-migrated-predicates-red.log`), 28 built-in
row failures (`/tmp/arc-simple-ban-rows-reconstructed-red.log`), eight missing predicate scopes and 25 missing built-in
scope assertions (`/tmp/arc-all-ban-scopes-red.log`). Narrow allowance reconstructions retain callable exports and
prove each exception's wrong-refusal before restoration; logs are `/tmp/arc-migrated-*-red.log` and
`/tmp/arc-simple-allowance-*-red.log`. Literal-named imports/reexports and computed named members fail before their
symbol selectors are added (`/tmp/arc-literal-symbols-red.log`). Case-insensitive retirement references fail before
matching the original `/iu` boundary (`/tmp/arc-retirement-case-red.log`). Nested identity argv built with `.flat()`
fails before ordered nested-array extraction (`/tmp/arc-nested-identity-red.log`). Reference-store membership keeps
both a basename beginning with two dots and exclusion of a similarly named sibling directory; their narrow behavioral
proofs are `/tmp/arc-reference-membership-red.log` and `/tmp/arc-reference-sibling-red.log`.

All 38 original row/predicate examples produce native `lint:ts:file` refusals before deleting the corresponding scan.
Raw JSON, stderr, sources, expected rules and exit codes are retained in `/tmp/arc-native-ban-cli-proofs/manifest.json`.
Extra native stdin proofs for the nested identity read and case-insensitive retirement reference are retained in
`/tmp/arc-native-extra-ban-proofs/`. A mistaken retirement probe filename was corrected before the actual proof; the
rejected path check is not lint evidence.

Deletion verdict: executable dependency/declaration bans still catch plausible future violations, now through the
native linter; their duplicated source walks and scanner-fixture cases do not survive as a second mechanism. The
three exhausted meta-reader/writer/identity scan files and the kernel audit helper are removed. Mixed files keep the
explicit kernel barrel, required init/start layout imports, config consumed-key catalog, concurrency package/license
contract, heavy-projection transitive closure, actual bundle metadata, role authority/runtime projections, exact
canonical caller/importer/declaration inventories and NUL identities, schema owner export contracts and legacy
importer presence, CLI positive module/loading inventory, viewer compatibility, and package/project sync. The
meta-reader's real legacy/runtime cases remain after deleting only its static-store import branch. Store filename and
review vocabulary assertions retain their full text properties. Incidental comment/example identifier matches have
the previously recorded survival-rule disposition; no executable authority or explicit vocabulary contract is waived.

Scope fidelity includes the original lexical `./` layout allowance, sole qualified public layout barrel, immediate
store-core directory allowance, exact TypeScript reference-store root membership, type-only store/loading exceptions,
dotted viewer process access and case-insensitive retirement module match. These bounded interpretation and selector
corrections preserve the specification's intent under the recorded implementation direction.

The ordinary full typed lint gate passes in 51,195.162 ms after migration, compared with 49,858.146 ms before:
+1,337.016 ms (+2.68%). `/tmp/arc-migration-after-lint.{json,log}` retains the actual command, exit and wall time.
The measured run is serial with no concurrent suite/type/build process; it is a single before/after observation,
not a median or a claim about hosted variance.

The first final routine run fails its tracked-corpus coupling audit because removed scan files were still listed in
Git's index (`ENOENT`), with 16,578 other cases passing. Staging all migration deletions corrects that mechanical
corpus input; the complete suite is rerun over the staged tree. The failed run remains
`/tmp/arc-migration-final-routine-tests.log`, rather than being counted as a pass.

Final checks pass over the staged migration tree: full typed lint, focused helper/test lint, both type programs,
full build, Markdown and all ARC contract checks. Shell inputs are unchanged, so the earlier passing shell gate
remains applicable. `/tmp/arc-migration-staged-routine-tests.log` records the successful complete routine rerun;
`/tmp/arc-migration-final-{focused-lint,all-types,build,md}.log` retains the other command evidence. A3 is revalidated
at 4.3.c after the composed native proofs and replacement-case deletions close.

## Narrow registry discovery

The registry test's command/schema-ID equality now reads cli.ts and calls `scanCommanderSource` directly, the same
function from which `loadCommandInputSourceSnapshot` derives its commands. It avoids whole-source text collection,
reachable-import discovery and interaction parsing, without changing either expected inventory. The old 25-second
repository-scan timeout is removed because that scan is gone. This is a trivial scope refactor with existing behavioral
assertions retained, so test-after applies; no new behavior or reconstruction is claimed.

The affected unit selection passes 369 files and 7,515 cases; the final exact registry file also passes after removal
of the named timeout. Focused lint and test types pass. Source types, full build, and unaffected integration/shell
inputs retain the preceding completed results. Evidence is `/tmp/arc-registry-narrow-unit.log` and
`/tmp/arc-registry-narrow-final-{targeted,lint,types}.log`.

## Remaining source-scan cost and shared-parse decision

Three ordinary 12-worker unit/unit-mock captures at `b30ec13fab356ac0ca4a9462381186de0da57306` pass without
unhandled errors. Raw schema-v4 captures are `.test-cost-runs/post-source-scan-unit-{1,2,3}.json`; the instrument's
normalization is `post-source-scan-unit-normalized.json`, and `post-source-scan-summary.json` reconciles every
original path and all 123 original expanded case names against current names. Removed/renamed names are distinguished
from current cases; preserved properties are classified in § One-hop ban inventory and § Migrated one-module bans.
Each actually deleted file costs zero; surviving files count their complete cost, including non-scan/runtime cases and
shared setup. The methodology-only decompose authority file therefore retains its measured cost.

| Metric                                  | Three successful samples              | Median      |
| --------------------------------------- | ------------------------------------- | ----------- |
| Fixed 26-file complete cost (ms)        | 19,185.035; 20,522.104; 19,307.791    | 19,307.791  |
| Full unit summed file time (ms)         | 154,566.537; 154,518.983; 150,755.268 | 154,518.983 |
| Fixed-set share of the same unit sample | 12.412%; 13.281%; 12.807%             | 12.807%     |
| Unit wall time (ms)                     | 14,813; 14,686; 14,424                | 14,686      |

The frozen fixed-set median is 49,744.319 ms; the complete-file cost falls **61.19%**. The sample range is 6.93%
of the median, below the existing 10% noise convention. This is summed file time, not a claim that wall time falls
by the same percentage. Largest retained file medians are repository input inventory (11,097.313 ms), registry
(3,062.927 ms), and refusal-source totality (2,931.394 ms); their complete costs include retained contract work and
imports, so none is attributed wholly to AST parsing.

Primary source inspection finds **zero explicit full-src AST walks**. The one repository inventory beforeAll makes
one whole-src text snapshot; its reachable graph is parsed for import discovery and interaction discovery. The registry
now parses cli.ts directly. Two refusal-source cases separately create typechecked Programs rooted in the work-unit
subtree; these may load dependencies and are not two full-src AST enumerations. Other AST work is named modules or the
store's eager closure; store/review vocabulary, canonical catalogs and mock-file ownership remain text inventories.
The raw summary records each original file's current parse scope, keeping these unlike operations distinct.

Decision: **do not introduce a shared parse cache**. No repeated full-src AST walk remains, the repository snapshot
already shares its setup, and typechecked Programs, declaration emission, text catalogs and named/eager-closure scans
do not share one interchangeable parse contract. The measurement does not identify a repeated parser cost sufficient
to justify the cache's lifetime, invalidation and fixture mechanism. This is the specification's permitted decision
at 4.5, made under the existing implementation direction; no follow-on design or task is needed.

## Managed freshness decision

`shouldSkipDevBuildStaleness` consumes the existing synchronous `classifyAdvisoryLockRead` result, inherited token and
clock. It skips only for a matching nonempty token, a `tests (<tier>)` operation and a lease strictly after now. The
native unit proof first fails the positive decision (`/tmp/arc-managed-skip-positive-red.log`), then fails all ten
invalid ownership/read conditions against the positive-only implementation
(`/tmp/arc-managed-skip-refusals-red.log`). Restored decisions and existing freshness behavior pass 41 cases in
`/tmp/arc-managed-skip-decision-green.log`; focused lint and both type programs pass in
`/tmp/arc-managed-skip-decision-{lint,types}.log`. The function performs no I/O or acquisition, and is not yet wired
into the CLI; the complete managed-run slice supplies token propagation, guard wiring and the real-child proof.

### Scoped controller token

The acquired artifact handle's token is preserved on `BuildArtifactLease`; `withTestArtifactOwnership` exports it
around the owning action and restores the exact preceding environment value or absence in finally. Unit-only native
execution is unchanged and never enters that ownership wrapper. The existing compiler-free staged fixture gains its
fake capability token to satisfy the extended lease contract.

The real lock/action proof fails before propagation (`/tmp/arc-controller-token-red.log`) and succeeds afterward.
All four return/throw × prior-value/absence restoration cases fail before finally restoration
(`/tmp/arc-controller-token-restoration-red.log`), then all 22 ownership/decision cases pass in
`/tmp/arc-controller-token-final-green.log`. Both type programs pass; focused lint rejects computed deletes, corrected
mechanically to `Reflect.deleteProperty`, then passes (`/tmp/arc-controller-token-{types,lint}.log`).

### Synchronous command guard

The CLI preAction calls `runDevBuildGuard` with `createDevBuildGuardDeps`. Native dependencies classify one
synchronous package-root lock read and preserve the existing freshness factory, output and exit. The managed decision
precedes every freshness callback. Its explicit boolean keeps managed/adopter/compaction continuations ineligible for
post-command refresh; fresh commands retain the existing command-family discriminator. Stale diagnostics, age
rendering, remedy and the compaction-seed exception are extracted unchanged.

Three direct guard outcomes fail before implementation (`/tmp/arc-dev-guard-first-red.log`). Narrow copied-module
reconstructions fail silent adopter output and managed avoidance of freshness dependencies
(`/tmp/arc-dev-guard-{adopter,managed}-red.log`), with every export and signature retained and copies removed afterward.
All 46 guard/decision/freshness cases pass in `/tmp/arc-dev-guard-green.log`; focused lint and both type programs pass
in `/tmp/arc-dev-guard-{lint,types}.log`. The real managed-controller source-edit proof closes the remaining slice.

### Real managed child source drift

The runtime fixture's marker entry now invokes the same guard as cli.ts. Its actual integration controller prepares
and owns the fixture's bundle; the inner worker edits src/cli.ts, then runs that bundle with the inherited environment
and with the token removed. The first prints `new-native-runtime`; the second exits 1 with the ordinary stale-build
refusal and build remedy. Each child has a 10-second native deadline, inside the fixture controller's 30-second
process deadline and the outer 60-second case timeout.

The inherited path fails when only the copied fixture's managed-decision branch is removed
(`/tmp/arc-managed-controller-native-red.log`). The ordinary path fails when only that fixture wrongly permits a
missing token (`/tmp/arc-managed-controller-tokenless-red.log`). Both reconstructions keep every export/signature and
alter no primary source or bundle; the temporary probe specification is removed. The actual test then passes in
`/tmp/arc-managed-controller-native-green.log`, with raw child outcomes asserted inside the real worker and observed
by the outer integration case. Focused lint and both type programs also pass before complete-slice gates.

Complete managed-run slice gates pass: 1,105 routine files and 16,601 cases, full typed lint, both type programs,
qualified full build, Markdown and all ARC checks. Shell inputs are unchanged and retain their preceding completed
gate. `/tmp/arc-managed-run-final-{routine,lint,types,build,md}.log` retains the command evidence. The complete token,
guard and native-child behavior is one atomic concern; no production command behavior beyond the specified managed
freshness skip changes.

## Distinct no-input invocations

The transport selector is shared by the existing built-CLI helper and `selectNoInputInvocations`. It preserves the
leading-flag behavior of implicit machine payloads, exact argv and stdin bytes. The plan keeps each pseudo-TTY signal
plus the first pipe representative. Six new pure scheduling cases fail against the legacy three-invocation result
(`/tmp/arc-distinct-invocations-red.log`), then pass in `/tmp/arc-distinct-invocations-green.log`; focused lint and both
type programs pass. These coupled descriptors share one transport/filter implementation.

All 80 entries remain, with unchanged output/exit/worktree assertions and exact live interaction-site reconciliation.
Linux retains the specified 45 one-invocation, six two-invocation and 29 three-invocation groups (144 total). The existing
helper allocates no pseudo-TTY on Windows/macOS, so all 80 entries there collapse to one pipe invocation. This bounded
platform interpretation follows the specification's distinct-context rule; its numeric 45/6/29 split describes the
Linux baseline rather than introducing redundant signals elsewhere. No production interaction policy changes.

The initialized template is built and committed once for 75 ordinary entries, then copied independently for each
invocation. Three bare and two stub entries retain their original setup; progress-TTY and exact stdin cases stay
separate. The complete file passes all 83 cases (`/tmp/arc-no-input-template-targeted.log`). Both type programs and
focused lint pass before closure. Complete gates pass: 1,106 routine files / 16,607 cases and all 67 E2E files / 701
cases, full typed lint, Markdown and ARC checks. The unchanged production/build and shell inputs retain their preceding
completed gates. Evidence is in `/tmp/arc-no-input-{template,final}-*.log`; the final E2E run takes 249.47 seconds.

## Remaining prepared E2E fixtures

The sibling shape extends the existing helper through typed overloads: ordinary shapes retain their string return;
sibling copies return root, parent and worktree paths for cleanup. The two real-Git outcomes fail against copies with
both original pointers unchanged (`/tmp/arc-sibling-red.log`), then all ten prepared-fixture cases pass after both links
are rewritten (`/tmp/arc-sibling-green.log`). Both type programs and focused lint pass. The two references comprise one
copy operation, so their coupled tests precede its implementation together.

The first full E2E capture attempt fails only publication-spine's new beforeAll: moving convergence setup out of its
120-second cases accidentally subjected it to the 10-second hook default. The targeted three-file run had passed
63 cases, but the contended full run times the hook out; 66 files / 685 cases pass and 16 cases skip. No successful
capture is retained. `/tmp/arc-post-e2e-fixture-1.log` preserves this failure. The shared hook now carries the original
120-second allowance of its convergence cases; this same-concern deadline correction changes no tier default.

The corrected full E2E capture passes all 67 files / 701 cases in `/tmp/arc-post-e2e-fixture-1-green.log`; it retains
`post-e2e-fixture-1.json`. All 63 targeted E2E cases and ten native prepared-fixture cases pass. The routine lane passes
1,106 files / 16,609 cases; full typed lint, both type programs, Markdown and ARC checks pass. Production/build and
shell inputs are unchanged and retain the preceding completed gates. Final evidence uses
`/tmp/arc-remaining-{final,hook}-*.log` and `/tmp/arc-sibling-final-targeted.log`.

Capture 1 runs on the completed fixture patch before commit, based on `fc9a5b13f6c3a5ad0614cab06ab25351f2def71a`;
its staged test-patch object is `141f2983464b3bfa8ecad9f3702f1690896c9267`. It overlaps the final typed lint/type gates.
Remaining E2E samples retain this same test code and settings, with other checks finished before sampling. The failed
10-second-hook attempt is retained separately and contributes no successful cost observation.

## E2E fixture exit measurement

The completed fixture code at `b46f641d59b115933351573afdd118d0c40923ed` retains the managed admission's token,
test-controller operation and live lease together (Task 5.1's native guard/child proofs); the distinct invocation plan
and initialized template (5.2); and the remaining per-case copies (5.3). The final committed test patch has the same
`141f2983464b3bfa8ecad9f3702f1690896c9267` object as capture 1's staged patch. Captures 2 and 3 run after the commit,
with no concurrent checks. All three ordinary captures pass 67 files / 701 cases, with zero unhandled errors and
matching schema-v4 `tier-isolated` / `e2e` / 12-worker modes.

Summed file times are 1,923,630.339, 1,898,572.279 and 1,872,788.019 ms; median **1,898,572.279 ms**. Compared with the
frozen single ordinary baseline's 2,787,941.456 ms, this is **31.9006% lower**. The successful samples' range is 2.6779%
of their median, inside the 10% comparison convention. Wall times are 255,216, 251,709 and 250,752 ms; median 251,709 ms
(26.6358% below the baseline's 343,095 ms). Helper-recorded CLI counts are 1,854 in every sample, versus 2,266 at baseline;
these counts do not inventory launches outside the instrumented helper's active-test scope.

The baseline remains one ordinary success, with no empirical estimate of its noise; the failed baseline attempt and
the diagnostic remain separate. Capture 1 also overlaps final lint/type gates, while the later captures are free of
other checks. The small observed spread supports the closing comparison but cannot establish baseline stability.
The failed first closing attempt is retained as a hook-deadline failure and is excluded from successful captures.

Raw captures are `.test-cost-runs/post-e2e-fixture-{1,2,3}.json`; native normalization is
`post-e2e-fixture-normalized.json`, and `post-e2e-fixture-summary.json` retains sample outcomes, medians, reference,
spread and uncertainty. Logs are `/tmp/arc-post-e2e-fixture-{1-green,2,3}.log`, with the failed first attempt at
`/tmp/arc-post-e2e-fixture-1.log`. The segment exit scenario passes without changing its verifier or criteria.
Unchanged code/build/shell inputs retain the completed fixture gates; Markdown and ARC checks close this record.

## Unit native launch admission

The core takes a package root, allowlist and injected current-file authority. Refusal fails before admission is
implemented (`/tmp/arc-unit-guard-admission-red.log`), and an inverted-admission reconstruction fails the admitted
operation's output (`/tmp/arc-unit-guard-allowed-red.log`). The actual core passes both cases without launching a child.

The installer retains its installation on the builtin child_process object and refreshes admission for each setup
import, so default and named importers share one wrapper layer. It guards spawn/spawnSync, exec/execSync,
execFile/execFileSync and fork; each existing promisify custom form gets a guarded delegate, preserving native output
and child handles. The real supported Vitest fixture runs unit with isolate false and unit-mocks with isolate true,
using a command-line JSON reporter. Its direct, named, execa and promisified off-list launches fail, while the admitted
promisified child returns stdout/stderr in both projects. The controller's child environment clears FORCE_COLOR.

Without installation the native outcome fails (`/tmp/arc-unit-guard-native-red.log`). Narrow copied-installer
reconstructions fail the native stdout/stderr shape when custom wrapping is removed
(`/tmp/arc-unit-guard-promisify-red.log`) and fail promisified refusal when only that custom delegate bypasses admission
(`/tmp/arc-unit-guard-custom-bypass-red.log`). Root source and exports remain intact; temporary probe specifications
are removed. The restored core/native tests pass in `/tmp/arc-unit-guard-admission-complete-green.log`; focused lint and
both type programs pass in `/tmp/arc-unit-guard-admission-final-{lint,types}.log`.

### Caught native refusals

The core records attempts and blocks by file, and the installer captures a starting snapshot per test task. The
helper-caught test fails before ledger enforcement (`/tmp/arc-unit-guard-caught-core-red.log`), then passes. The native
fixture's helper/execa catches initially pass incorrectly (`/tmp/arc-unit-guard-caught-native-red.log`). Installing
only afterEach makes those fail, while caught beforeAll/afterAll files still pass
(`/tmp/arc-unit-guard-caught-file-red.log`). The file-ending ledger check then closes that second outcome. All six
core/native cases pass in `/tmp/arc-unit-guard-caught-green.log`; both type programs and focused lint pass in
`/tmp/arc-unit-guard-caught-{types,lint}.log`. The native fixture continues to run both actual isolation settings and
command-line JSON reporting; its teardown and failure assertions use native file results rather than spies.

### Per-file service lifetime and final launch inventory

Each setup import refreshes file accounting without stacking native wrappers. The installer awaits esbuild's stop at
file end and at the next setup boundary; the latter repairs cleanup skipped when another suite hook throws. Both
settings retain per-case cumulative counts and allowlist membership, and final suite metadata includes launches after
the last case. These two intent-preserving additions cover observed hook behavior and avoid false idle-file results.

The same-worker fixture initially reports counts `[1,0,1,1]` without service cleanup
(`/tmp/arc-unit-guard-service-count-red.log`). With the restored installer it reports `[1,1,1,1]`, and the two unit
files share a PID. Isolated unit-mocks files use separate workers; no PID-sharing claim applies there. Removing stop
only in the copied fixture installer before its second run lets an excluded unit file ride the warm service and pass
with count zero (`/tmp/arc-unit-guard-service-bypass-valid-red.log`). The restored core/native cases pass in
`/tmp/arc-unit-guard-service-complete-green.log`; both types and focused lint pass in the corresponding final logs.
Earlier sequencer-path and hook-context fixture failures collected no useful behavioral proof and are excluded.

The first full guarded unit audit (`/tmp/arc-unit-launch-inventory.json` and `.log`) identified three additional
existing launcher files. Source reads confirmed their native operations; these are legacy exceptions, not new launch
coverage. The completed audit (`/tmp/arc-unit-launch-inventory-complete.json` and `.log`) passed 13,598 cases. Counts
below are cumulative native API launch attempts, not an exhaustive descendant-process inventory.

| Allowlisted unit file                                            | Launch attempts on Linux | Platform exception                                              |
| ---------------------------------------------------------------- | -----------------------: | --------------------------------------------------------------- |
| `portability-build-selection.test.ts`                            |                        1 | —                                                               |
| `scripts/review-gate/policy/pre-publication-composition.test.ts` |                       85 | —                                                               |
| `handlers/delivery-review-fix-release-effects.test.ts`           |                       12 | —                                                               |
| `work-unit/composed-lifecycle-index.test.ts`                     |                        1 | `mkfifo` excludes Windows                                       |
| `handlers/view-editor.test.ts`                                   |                       11 | —                                                               |
| `handlers/release/commit-cli.test.ts`                            |                        3 | —                                                               |
| `git/process-executor.test.ts`                                   |                        1 | —                                                               |
| `fs.test.ts`                                                     |                        0 | `powershell.exe` launches only on Windows; stable skip accepted |

### Controller-held launch floor

The floor consumes each public module's case states, cumulative metadata and final suite metadata. It checks only
nonempty wholly completed files with explicit allowlist evidence, uses the maximum count, and names every idle file
even when another failure already set the run status. Skipped/pending cases, name-filtered partial files and the
accepted platform skip remain exempt. Unguarded integration/E2E modules carry no allowlist evidence.

The idle-file case fails against the initial no-op check (`/tmp/arc-unit-floor-idle-red.log`). A narrow reconstruction
that declares every module idle fails all seven boundary cases (`/tmp/arc-unit-floor-boundaries-red.log`); source is
restored byte-for-byte. The JSON-reporter native fixture first passes all four cases and exits zero without controller
wiring (`/tmp/arc-unit-floor-native-red.log`). With wiring, it exits one and names only the two idle-file instances;
its afterAll-only launcher remains admitted despite every per-case count being zero. The restored three-file proof
passes 20 cases in `/tmp/arc-unit-floor-complete-green.log`.

The first routine gate retained six failures, all in the older unit/integration cost-measurement fakes: their public
module/case objects omitted `meta()`, so the new consumer raised `module.meta is not a function`. Both fakes now expose
empty native metadata and module identities; their timing, retention and failure assertions remain unchanged. The
focused repair passes all seven cases (`/tmp/arc-unit-policy-fixture-repair.log`), both types and focused lint pass.
The original failure remains in `/tmp/arc-unit-policy-routine.log`; it is not reported as a passing gate.

The corrected routine gate passes 1,109 files and 16,626 cases, with one file and 1,188 cases skipped
(`/tmp/arc-unit-policy-routine-corrected.log`, 190.56 s). Full typed lint, both type programs, Markdown and all three ARC
contract checks pass; the full declaration build reports qualified artifacts. Focused policy proof passes 25 cases.
The unchanged shell surface reuses its previous passing gate. E2E/portability remain required hosted enforcement;
no E2E file changed in this policy increment. Admission and its floor land as one concern because the shared setup,
metadata producer and controller consumer jointly enforce the legacy exception policy.

## Layout trial

The reference head is `7fd1ecf07a278579e009b1ee36172a698e64d8d7`, with the current single unit job, two integration
shards and four anchored E2E shards. The three references run sequentially with portability pairing off. Reference 1,
`37596723471`, passed in 496 seconds; its API run/jobs, full log and unit artifact are retained under
`.test-cost-runs/layout-reference/1-37596723471`. References 2 and 3 are `37597799916` and `37599011266`; all three
passed at the exact reference head, in
496, 607 and 519 seconds. The reference median is **519 seconds**; the per-run adoption ceiling is **467.1 seconds**.
Their raw directories use the same numbered run-ID convention and `layout-reference/observations.json` retains every
job elapsed time and per-file observation. These are post-fix layout references, distinct from the frozen baseline.

A mistyped capture-command SHA was corrected against the actual pushed head without replacing the hosted run. The
first log download failed because gh's default cache directory was read-only; XDG_CACHE_HOME now points to
`/tmp/arc-gh-cache-test-suite`, and the same completed run's logs/artifact were collected. The original capture errors
remain in `/tmp/arc-layout-reference-runs{,-corrected}.log`; the resumed collector is
`/tmp/arc-layout-reference-runs-resumed.log`. Local sequencer and handoff preparation proceeds while the remote stays
fixed at the reference head. No trial or provisional duration weights are published before all references complete.

### Sequencer and handoff preparation evidence

The restored six-file heavy list remains checked for existence. The new assignment's order first fails in
`/tmp/arc-duration-order-red.log`; sorting and complete-key cache reading first fail in
`/tmp/arc-duration-sort-cache-red.log`. A narrow assignment/native-wrapper reconstruction fails partition, fallback
and native shard-index cases (`/tmp/arc-duration-assignment-wrapper-red.log`); returning only BaseSequencer's order
fails cross-project duration priority in `/tmp/arc-duration-native-sort-red.log`. Source is restored byte-for-byte.
The restored eight-case proof passes in `/tmp/arc-duration-all-green.log`. The complete reference data supplies
project estimates (pooled median file milliseconds): unit 7,
unit-mocks 32, integration 995 and E2E 12,739. Missing/all-skipped durations are not assigned zero. The six hand-kept
E2E weights are candidate-lineage 254,635; publication-spine 156,052; errand 94,341; command-input-no-input 69,433;
lifecycle-exit 64,718; integrate-base-movement 73,120 ms. `heavy-first-durations.ts` contains these measured values;
no provisional zero weights are published.

The merge's native tier output and overlap refusal both fail before implementation
(`/tmp/arc-duration-merge-red.log`). Handed-file preparation and hashed artifact discovery first fail with missing
required output files (`/tmp/arc-duration-artifacts-red.log`); a truncating reconstruction separately fails restored
input preservation (`/tmp/arc-duration-preservation-red.log`). The restored four data-artifact cases pass. Native
results remain outside the writable Vitest cache, with exact complete-key overlap checks before writer persistence.

The dispatched-selector, shared-input and writer-persistence workflow cases first fail against the current layout
(`/tmp/arc-duration-workflow-red.log`) and then pass. Existing workflow contracts initially reject the new setup
preparer/restore and changed current-job conditions (`/tmp/arc-duration-existing-workflows-red.log`). The classifier
now admits only the exact preparation command and cache restore subaction, retaining arbitrary command/action
rejections; a broad helper-command admission reconstruction fails its new rejection case
(`/tmp/arc-duration-setup-admission-red.log`). All 198 workflow/classifier cases pass in
`/tmp/arc-duration-workflow-contracts-green.log`. Focused typed lint and both type programs pass; the recursive
filesystem reader explicitly selects utf8 to satisfy the native overload. A config-file lint operand was outside the
configured TypeScript projects, so the corrected lint invocation uses the gate's actual source/test domain; native
configuration parsing is exercised by the selected runs.

The coherent trial preparation passes the full routine gate: 1,113 files and 16,642 cases, with one file and 1,188
cases skipped (`/tmp/arc-duration-trial-routine.log`, 201.66 s). Full typed lint, both type programs, Markdown and all
ARC contract checks pass; the full declaration build reports qualified artifacts. The unchanged shell surface reuses
its passing gate. The measured data, sequencer and dispatch handoff form one atomic trial concern; the hosted source
comparison decides whether any of this layout remains. Deferred review now covers phases 1–10, with atomic commits,
needed pushes and hosted runs preapproved; phase 11 remains outside that scope. Intent-preserving adjustments are
recorded here and in task outcomes rather than introducing additional approval stops.

### Counted source runs and adoption

The immutable trial head is `8c3404c115f832d3872747ff02012423855a6797`. Four dispatches run sequentially with
portability pairing off. All finish successfully at that exact head, below the 467.1-second ceiling, and no integration
shard finishes last among test jobs. Durations end at the last non-merge job, using complete API job timestamps.

| Source         | Run         | Duration (s) | Last test job       | Restored duration key                |
| -------------- | ----------- | ------------ | ------------------- | ------------------------------------ |
| Hand-kept list | 37600975918 | 367          | E2E Trial Tests (1) | —                                    |
| Hand-kept list | 37601774469 | 336          | E2E Trial Tests (4) | —                                    |
| Results cache  | 37602468936 | 301          | E2E Trial Tests (1) | arc-test-durations-Linux-37601774469 |
| Results cache  | 37603107755 | 399          | E2E Trial Tests (1) | arc-test-durations-Linux-37602468936 |

Both cache runs restore saved inputs and count; neither is a seed-only run. The hand-kept median is **351.5 seconds**,
the cache median **350 seconds**. Both sources clear, and the hand-kept list is not more than 10% faster, so **cache
wins**. Raw run/job/log data, per-shard unit artifacts and observations remain under `.test-cost-runs/layout-trial/` in
source-and-run-ID directories. `layout-trial/verdict.json` retains the derivation; `/tmp/arc-duration-trials.log` retains
the coordinator output. Independent budget and prompter implementation stayed unpushed until this comparison ended.

The winning layout replaces the canonical jobs with literal two-unit/four-integration/four-E2E matrices. Every shard
reads one handed artifact outside its cleared native results directory. Successful dispatch/schedule writers merge all
tiers and save a unique cache key; pull requests never write. The source selector, trial jobs, heavy-file list and
anchor/exclusion readers are removed. With no handed file, local runs use measured project fallback weights. Writer
triggers also override light classification for unit jobs, ensuring a complete cache; this intent-preserving adjustment
keeps dispatch/schedule writers coherent. After merge, one `main` dispatch must seed the cache visible to pull requests.

Native collection with `results-cache-2-37603107755/duration-input/e2e.json` produces disjoint memberships of
16, 17, 17 and 17 files, whose union is all 67 E2E files. Every leg exactly matches that run's hosted file log.
`/tmp/arc-adopted-native-membership.log` retains native JSON. The first comparison script stripped only real ANSI bytes;
correcting it to also strip the log's literal `^[[` encoding resolves the capture mismatch without rerunning tests.

Partition/parser, native-collector and adopted-workflow behaviors first fail in
`/tmp/arc-balanced-membership-red.log`, `/tmp/arc-balanced-collector-red.log` and
`/tmp/arc-adopted-workflow-red.log`. Corrected focused unit checks pass 19 cases and workflow/classifier checks pass
198 cases. The type gate identified array table rows being spread into callback arguments; wrapping each row in an
object fixes the fixture shape. The corrected ten partition cases pass in
`/tmp/arc-adopted-membership-final-green.log`; earlier wrong-shape successes are not partition proof.

The coherent adoption passes 1,116 routine files and 16,688 cases, with one file and 1,188 cases skipped
(`/tmp/arc-adopted-routine.log`, 201.54 s). Full typed lint, both type programs and changed shell checks pass, with logs
`/tmp/arc-adopted-full-lint.log`, `/tmp/arc-adopted-types-corrected.log` and `/tmp/arc-adopted-shell.log`.
The full declaration build qualifies (`/tmp/arc-adopted-full-build.log`); Markdown and all ARC contracts pass
after mechanically aligning the recorded timing table. Runtime checks remain valid after the comment-only header fix.

### Budget annotation evidence

The independent budget annotation change is prepared while the source-run sequence stays on the published trial head;
no later implementation is pushed during that comparison. Missing baseline text and the absent Actions command each
fail first in `/tmp/arc-budget-annotation{,-command}-red.log`. A narrow reconstruction that annotates `within` and
throws for `over` fails three cases (`/tmp/arc-budget-policy-reconstruction-red.log`), then source is restored
byte-for-byte. All four budget cases pass in `/tmp/arc-budget-annotation-restored-green.log`. A native invocation of
`report-test-budget.ts` exits zero and emits the matching annotation, standing JSON and baseline-bearing step summary
(`/tmp/arc-budget-native-stdout.log`, `/tmp/arc-budget-native-summary.md`). Overage remains advisory. The report's
single message supplies both outputs, and workflow-command data escapes percent signs and line endings.

The warning change passes the complete routine gate: 1,113 files and 16,643 cases, with one file and 1,188 cases skipped
(`/tmp/arc-budget-annotation-routine.log`, 205.34 s). Full typed lint, both type programs, Markdown and all ARC contracts
pass; the full declaration build qualifies. The unchanged shell surface retains its earlier passing gate. Its atomic
commit stays local until the four trial dispatches finish, keeping their remote head fixed. Implementing this independent
visibility change during hosted layout waiting preserves the design and avoids idle execution time.

### Layout segment scenario

`/tmp/arc-layout-segment-scenario.log` confirms four counted exact-head runs, restored cache evidence, E2E critical
paths, the cache winner, recorded run IDs and removal of losing selectors/trial jobs/anchors. The focused budget
scenario passes all four cases (`/tmp/arc-layout-segment-budget.log`), including the exact Actions warning with job,
overage, budget, baseline and observation, quiet within-budget behavior and advisory success. The existing native
reporter proof retained under Budget annotation evidence covers matching stdout and step summary. Adoption is committed
as `4f26a0413`; the segment closes on that implementation and the retained native shard-membership proof.

## Declared prompt policy substrate

Independent declaration/prompter work proceeds locally while the hosted layout comparison stays fixed at `8c3404c11`;
no later commit is pushed during that sequence. This sequencing adjustment changes neither design nor adoption rules.
The dedicated factory's normalized, immutable branded site first fails in `/tmp/arc-prompt-declaration-red.log`, then
passes. Ten policy contradictions first fail in `/tmp/arc-prompt-policy-red.log`. A narrow option-authority
reconstruction fails its non-prompt compatibility case (`/tmp/arc-prompt-option-scope-red.log`); source is restored
byte-for-byte. The declaration/domain proof passes 86 cases. Its first routine gate passes 1,114 files and 16,655
cases (`/tmp/arc-prompt-declaration-routine.log`, 196.37 s), with one file and 1,188 cases skipped. Both types pass;
typed lint finds one forbidden non-null assertion, removed mechanically before the combined gate.

The prompter's explicit, interactive, forbidden and cancelled outcomes first fail against the minimal policy stub
(`/tmp/arc-prompter-policy-red.log`, 12 failing cases). A narrow renderer/refusal/output/exit reconstruction fails five
cases (`/tmp/arc-prompter-boundary-reconstruction-red.log`), then source is restored byte-for-byte. The restored
policy/declaration proof passes all 28 cases. The policy matrix shares one outcome function and renderer boundary;
its tightly coupled behaviors are implemented as a test batch. Form-specific overloads preserve boolean, string,
selection and multiselection answers; false, empty text and empty arrays retain their meaning. The private brand
carries only validated prompt policy kinds, allowing the runtime switch to remain exhaustive.

The initial focused lint rejects an unnecessary renderer assertion and a switch typed over the wider non-prompt
policy vocabulary; the brand now narrows that validated vocabulary, and the explicit refusal case is exhaustive.
Full typed lint and both type programs pass on the corrected substrate. The factory and typed consumer form one
atomic declaration-bound prompt concern; the Clack renderer is separate from policy and caller-owned output.

The combined substrate passes 1,115 files and 16,671 cases, with one file and 1,188 cases skipped
(`/tmp/arc-prompter-routine.log`, 191.96 s). Full typed lint, both type programs, Markdown and all ARC contracts pass;
the full declaration build qualifies. The unchanged shell surface retains its earlier passing gate. A final type-only
fixture refinement gives the structural lookalike the factory's exact normalized automation type. Removing only the
private brand makes `typecheck:test` fail solely with unused `@ts-expect-error` (TS2578,
`/tmp/arc-prompt-brand-type-red.log`); restoring source byte-for-byte returns both type programs and the focused unit
proof to green. This distinguishes brand enforcement from incidental structural type differences.

### Declared-value scanner evidence

Ten discovery cases first fail against selector-only discovery (`/tmp/arc-prompt-scanner-red.log`). The scanner resolves
named-import aliases and own exported constants, finds concrete callers of wrappers, and rejects factory calls outside
exported constant initializers. Parameter resolution walks outward past nested callbacks and stops at intervening local
bindings. A narrow duplicate/parameter reconstruction fails four cases, including the cross-module duplicate case
(`/tmp/arc-prompt-binding-reconstruction-red.log`); source is restored byte-for-byte. The first combined run's two
remaining mismatches were diagnostic capitalization, corrected without changing refusal behavior.

Both inventory-join cases first fail: the passing call is unclaimed, and a symbol-only dangling declaration is accepted
(`/tmp/arc-prompt-inventory-red.log`). The new prompt-origin lookup joins by declared id and retains the existing
cross-command policy consistency check, now including form. The complete command-input proof passes 116 cases.
`prompt-source.ts` reuses its parsed files in interaction scanning from the same immutable source snapshot, introducing
no type checker or extra whole-source parse pass. Generic call arguments are resolved only when they name a known
prompt constant, avoiding lexical work over unrelated calls.

The initial focused lint found an AST-parent conditional inconsistent with TypeScript's parent typing and a 105-line
interaction scanner. The parent walk now terminates explicitly at its source file, and import binding collection is
extracted. Both type programs and full typed lint pass. The first full routine gate passes 1,116 files and 16,685 cases,
with one file and 1,188 cases skipped (`/tmp/arc-prompt-scanner-routine.log`, 196.84 s); the full build qualifies.
Final source review found the new inventory lookup growing its pre-existing suppressed function, so that lookup is
extracted before closure. Its parent loses branches and lines rather than growing within an unchanged suppression count;
the final gates rerun on that refactor.

The extracted lookup's final routine gate passes the same 1,116 files and 16,685 cases, with one file and 1,188 cases
skipped (`/tmp/arc-prompt-scanner-final-routine.log`, 192.74 s). Both type programs and full typed lint pass, with no
suppression added or widened. The unchanged shell surface retains its passing gate. Metadata completion preserves the
renderer and legacy-discovery retirement markers verbatim; the terminal migration remains a separate increment.

### Stale-subdirectory prompt path

The new inventory contract first fails on the old callee identity (`/tmp/arc-stale-subdir-inventory-red.log`: one
behavioral failure, 23 passes). `staleSubdirPromptSite`, an exported branded select declaration, retains the original
`use-default`/safe cancellation policy. Its passing call receives `keep` as runtime default in every context. The
forbidden branch only prints the existing keep message; the prompter supplies the answer. Inspect re-prompts, explicit
remove still removes, and cancellation returns silently with the safe default. No declaration/behavior drift is found.

All 64 existing handler/inventory cases pass (`/tmp/arc-stale-subdir-focused-green.log`), with the stale-subdir handler
cases unchanged. The exact interaction-command matrix follows prompt origin and retains every existing matrix entry.
The real non-TTY stale-subdir case passes (`/tmp/arc-stale-subdir-e2e-green.log`, one completed case; twelve unselected),
retaining both the old workspace and newly opened workspace with exit zero. All 14 scanner cases pass
(`/tmp/arc-prompter-path-scanner.log`), including inline declaration and unresolved argument refusals. These unchanged
runtime scenarios plus the inventory join close the declaration-bound prompt slice.

Focused lint and both type programs pass (`/tmp/arc-stale-subdir-lint.log`, `/tmp/arc-stale-subdir-types.log`).
The coherent migration passes the full routine gate: 1,116 files and 16,688 cases, with one file and 1,188 cases
skipped (`/tmp/arc-stale-subdir-routine.log`, 201.63 s). Full typed lint passes
(`/tmp/arc-stale-subdir-full-lint.log`); Markdown and all ARC contracts pass. The unchanged shell surface retains its
adoption gate. The full declaration build is retained in `/tmp/arc-stale-subdir-full-build.log`.

## Installer prompt migration

The ten physical calls in init, reconfigure, join and removal prompts now use exported branded declarations, with
separate init/join caller-owned tools sites passed through `promptTools`. Existing policies move without reinterpretation
from command-input declarations into prompt modules. The init/join input resolvers invoke their callbacks in every
context; their forbidden-value branches and unused current-value fields retire. Handler callbacks supply current
configuration, role and tools to the prompt sequence, while removal always reaches one declaration-bound resolver.

Presentation stays interaction-dependent: init's name/PM notes, the tools note and selection message, reconfigure's
opening line/team warning, join's contributor line, removal summary and reconfigure's file-change/apply spinner messages
remain interactive-only. Explicit empty tools and false team settings remain values rather than absent inputs.
Cancellation still returns null and preserves the existing setup/reconfigure messages and silent removal cancellation.
Identity acquisition and its existing reports remain the later identity-wrapper task's concern.

The planned project-name drift resolves toward the declaration: fresh interactive init now defaults to the bare
`basename(cwd)` just as forbidden init does, rather than title-casing it. This changes the interactive default display
name (`example-project` rather than `Example Project`); explicit names and current reconfigure names retain their values.
The runtime default is executable data; `defaultSource` stays descriptive. Reconfigure carries its current tools through
the callback, retaining the final installed configuration rather than the old intermediate resolver's empty tools list.

Four forbidden-sequence scenarios fail against the old callbacks/prompts (`/tmp/arc-install-sequences-red.log`) before
passing with the new declarations. Two resolver tests fail when forbidden interaction bypasses the prompt callback
(`/tmp/arc-install-resolver-red.log`) and pass after that bypass is removed. Existing handler/config/removal checks pass
114 cases (`/tmp/arc-install-existing-green.log`). The first inventory run finds the retired `join:semantic.tools`
expectation; the fixed semantic inventory follows its prompt origin.

A narrow renderer reconstruction that treats cancellation as an answer fails all four installer cancellation scenarios
(`/tmp/arc-install-cancellation-red.log`), then the renderer is restored byte-for-byte. The title-cased name reconstruction
fails the declared-default case (`/tmp/arc-init-name-drift-red.log`) before byte-for-byte restoration. All nine sequence
cases and the resolver/inventory contracts pass in `/tmp/arc-install-focused-final.log`. The real init/reconfigure E2E
suites pass 22 cases (`/tmp/arc-install-e2e-green.log`).
The first routine run completes with one isolation-list failure: the new Clack-mocking sequence test is absent from
`ISOLATED_UNIT_MOCK_FILES` (`/tmp/arc-install-routine.log`: 1,116 files pass, one fails; 16,698 cases pass). Adding the
file to the isolated tier is the mechanical same-concern correction; the corrected routine log is
`/tmp/arc-install-routine-corrected.log`. The concurrently started lint attempt encounters a schema loader's disappearing
`build-schema.bundled_*.mjs` file (`/tmp/arc-install-full-lint.log`) and produces no lint verdict. The final full lint is
scheduled after artifact generation; the first attempt is retained as an operational failure, never reported green.
The corrected routine gate passes 1,117 files and 16,699 cases, with one file and 1,188 cases skipped
(`/tmp/arc-install-routine-corrected.log`, 194.73 s). The corrected isolated-tier/sequence check passes all ten cases
(`/tmp/arc-install-isolation-green.log`). Both corrected type programs pass (`/tmp/arc-install-types-corrected.log`);
Markdown passes after removing one extra trailing blank line. The final lint retry waits for test preparation to finish.
The full lint retry passes (`/tmp/arc-install-full-lint-corrected.log`) after preparation ends. No lint violation was
waived, and the earlier loader failure remains recorded. The unchanged shell surface retains the adoption gate.
The full declaration build qualifies (`/tmp/arc-install-full-build.log`). The lint-loader race is captured separately
as a held tooling Errand in the personal inbox, alongside the existing loader-transient build-input capture; its
ordering mitigation preserves every required gate and changes no installer policy.
The final source head also passes both native E2E files and all 22 cases (`/tmp/arc-install-e2e-final.log`, 9.62 s),
retaining the first capture and confirming the final declaration-bound installer runtime.

## Lifecycle prompt migration

`stubCommitmentPromptSite`, `stubPriorityPromptSite` and `promoteClassPromptSite` replace callee selectors with
exported declaration-bound select questions. Explicit command values enter the prompter as explicit answers; no branch
on interaction chooses values. Stub asks both questions and aggregates their refused syntax in its existing single
`Missing required input:` report. Promotion asks its class question when the recorded class remains unresolved,
retaining explicit-class validation, conflicts and cancellation behavior.

All three known message/declaration drifts resolve toward policy: missing commitment now names `--commitment <tier>`,
priority `--priority <priority>`, and promotion class `--class <value>`. The old reports named concrete value sets;
accepted value validation and CLI help retain those sets. Output prefix and exit status remain unchanged. The real
no-input matrix now pins those exact declaration-based reports.

The two stub report tests fail first against the old acquisition/reporting (`/tmp/arc-lifecycle-prompts-red.log`), then
126 focused lifecycle/inventory/isolation cases pass (`/tmp/arc-lifecycle-prompts-green.log`). The new Clack-mocking
report fixture enters the isolated tier from the outset. A narrow promotion-report reconstruction fails the real CLI
expectation (`/tmp/arc-promote-native-refusal-red-corrected.log`); the source is restored byte-for-byte. Its first overly
specific name filter selects no cases (`/tmp/arc-promote-native-refusal-red.log`) and is excluded from fail-first proof.
The restored native stub and promotion cases both pass (`/tmp/arc-lifecycle-native-refusals-green.log`, two completed
cases, 81 unselected). Focused source/test lint and matrix lint pass, retaining their `arc-lifecycle-*-lint.log` files.
The complete routine gate passes 1,118 files and 16,701 cases, with one file and 1,188 cases skipped
(`/tmp/arc-lifecycle-prompts-routine.log`, 188.29 s). Both type programs pass
(`/tmp/arc-lifecycle-prompts-types.log`); Markdown and all ARC contracts pass. Full lint runs after preparation ends,
retaining the already proved ordering mitigation for disposable loader siblings.
Full typed lint passes (`/tmp/arc-lifecycle-prompts-full-lint.log`) with no suppression changes. The lifecycle handler
file shrinks overall, and its question logic removes the old interaction branch without growing the recorded debt.
The full declaration build qualifies (`/tmp/arc-lifecycle-prompts-full-build.log`). The unchanged shell surface retains
its adoption gate, and the native refusal capture already covers the final restored source. The completed batch
preserves all accepted value validation while recording the three visible report-placeholder corrections.

## Start and identity prompt wrappers

Seven caller-owned start declarations now pass through `confirmStep`: six courtesy confirmations use `proceed`, and
`safety.indeterminate-lifecycle` uses `refuse`. `skipConfirm` and `courtesyAccepted` retire. The safety refusal keeps
its existing reason and failing exit; declined or cancelled confirmations retain their caller's cancellation text.
The declarations live beside the handler in `start-prompt-sites.ts`, avoiding growth of the previously oversized
handler. The full lint prune removes its obsolete file-length suppression without adding or widening any debt.

Fresh init and join each own a text site passed through `resolveIdentityWithPrompt`. The wrapper always supplies
`resolveIdentity` a prompter callback and maps refusal/cancellation to an empty acquisition, which resolves to null.
Configured identity still wins before acquisition. The nine Errand and two active callers that never prompt use
`resolveIdentity({ exec })` directly; join reconfiguration no longer supplies an unused identity callback. Identity
constants live in `prompts/identity-prompt-sites.ts`, keeping command-input registration free of a handler import cycle.
The settled declaration drift resolves toward existing behavior: both sites declare `use-default` with the Git user-name
slug rather than `require-explicit`, retaining the existing missing-identity report when there is no usable default.

The seven-site inventory join fails against the old caller map (`/tmp/arc-start-sites-red.log`). A signature-preserving
reconstruction of the old identity callback bypass incorrectly returns `alice-smith` for a caller requiring explicit
input; the regression fails behaviorally (`/tmp/arc-identity-policy-red.log`) before the shared prompter path passes.
The identity test uses the shared argument-scripted Git boundary with a typed absent-config failure. Existing Errand
and active handler fixtures now provide configured identity through their Git seam rather than mocking the retired
wrapper. All 88 focused cases pass (`/tmp/arc-start-identity-focused.log`). Both type programs and focused typed lint
pass (`/tmp/arc-start-identity-types.log`, `/tmp/arc-start-identity-lint.log`).
The complete routine gate passes 1,119 files and 16,703 cases, with one file and 1,188 cases skipped
(`/tmp/arc-start-identity-routine.log`, 191.15 s). The initial prune invocation through the root script does not forward
its option and remains failed; the corrected workspace invocation passes
(`/tmp/arc-start-sites-corrected-prune.log`), removing only the obsolete start file-length suppression. Markdown,
all three ARC contract checks and shell lint pass; the full build and final typed lint run after test artifact ownership
ends, retaining the established ordering mitigation for disposable loader siblings.
The full build qualifies (`/tmp/arc-start-identity-build.log`) and whole-project typed lint passes
(`/tmp/arc-start-identity-full-lint.log`). The finalized task record preserves its Goal and records both caller-owned
wrapper migrations without advancing the verification phase.

## Sync and user prompt migration

Five caller-owned declarations replace sync's duplicate helper/physical question, user-sync's three prompts, and
user-pull's overwrite prompt. `SyncOutput.confirm` forwards site, context and question to the prompter in both output
modes; its JSON false answer and `isCancel` retire. The capturing output helper preserves this real policy path.
Overwrite refusals retain the existing `--yes` remedy, exit status and cancellation text. User-sync conflict selection
always asks with runtime default `save-only`; the existing non-interactive save/warnings follow that returned value.
The interactive options remain push, inspect and cancel. Explicit conflict push approval enters the downstream
question as an explicit answer, rather than synthesizing invocation authority.

The two notes-push degradation drifts resolve toward their `require-authority` declarations: local saving still occurs,
but an unavailable authority now reports `Notes saved locally; re-run with --yes to authorize the push.` and fails.
Interactive decline/cancellation retain their successful cancellation outcomes and manual-push guidance. Sync's
`interlockState` retains the configured `prompt` value; JSON and dry-run metadata no longer replace it with `manual`
or `on-sync`. Both authority and unavailable contexts reach the prompter, keeping terminal output pure in JSON mode.

The authority-accepted worktree/notes pair retains its existing paired executor. A narrow advisor consultation identifies
that the single-leg route would lose save-before-publication, immutable export planning and partial-push recovery
markers. Source confirms those guarantees in `commands/user/paired-push.ts`. Sync first obtains the affirmative
prompter outcome, then derives execution-only `save+push` intent for that pair while keeping configured policy in the
interlock snapshot. Ordinary interactive prompt timing is preserved; no paired recovery machinery is duplicated.
The original prompt-plus-authority paired-adapter regression remains, rather than moving it to an on-sync fixture.

Both new notes-refusal cases fail against the old branches (`/tmp/arc-sync-prompts-red-corrected.log`). An initial
extra npm separator is rejected before executing tests and is excluded from fail-first evidence. Five policy/metadata
cases fail against the narrow old rewrite reconstruction (`/tmp/arc-sync-policy-reconstruction-red.log`). The first
native restoration reaches an earlier worktree block because installation leaves its clone ahead of origin;
`/tmp/arc-sync-native-final-green.log` remains failed. Aligning the fixture with origin reaches the actual prompt.
That final native fixture fails against the old rewrite (`/tmp/arc-sync-native-reconstruction-prepared-red.log`) and
passes after byte-for-byte source restoration (`/tmp/arc-sync-native-prepared-green.log`, one completed case).
All 170 focused cases pass with paired execution preserved (`/tmp/arc-sync-prompts-preserved-pair-green.log`).
The capturing helper's new real-propmter import exposes an unhoisted direct Clack log mock; hoisting it is the
same-concern fixture correction. Both type programs pass (`/tmp/arc-sync-prompts-types-final.log`). Whole-project lint
first reports obsolete suppressions, then its prune passes (`/tmp/arc-sync-prompts-prune.log`), reducing sync's recorded
complexity count from two to one and removing user-sync's recorded function-length violation. No debt is added.
The complete routine gate passes 1,119 files and 16,704 cases, with one file and 1,188 cases skipped
(`/tmp/arc-sync-prompts-routine.log`, 200.03 s). The entire native E2E tier passes all 67 files and 701 cases
(`/tmp/arc-sync-prompts-e2e.log`, 247.91 s). The full declaration build qualifies
(`/tmp/arc-sync-prompts-build.log`). Markdown and all three ARC contract checks pass
(`/tmp/arc-sync-prompts-md.log`); the unchanged shell inputs retain the preceding wrapper slice's passing gate.

## Release setup prompt migration

Five exported install sites and one cleanup site replace the last raw prompt calls in release setup. Every question
passes its declared site, context and explicit supplied value to the prompter. Absent boolean evidence remains absent,
rather than an explicit false answer. Installation acquisition retains interactive early-stop behavior for cancellation
and declined trust/workflow evidence, while collecting all forbidden-context refusals in harness, mode, trust, workflow
order. Missing harness/mode only supply presentation placeholders for later forbidden questions; they never become
canonical installation values. Cleanup retains missing-evidence, cancellation and declined-cleanup results.

The two known drifts resolve toward declarations: recorded setup without an explicit idempotency action now refuses
with `--idempotency-action <action>` instead of silently choosing `exit`, and the mode placeholder in the combined
report becomes `--mode <mode>`. Interactive idempotency cancellation still acknowledges exit, supplied values retain
schema validation, and successful affirmative evidence reaches the existing marker/opt-in operations.

The aggregation unit case fails against the old early cancellation (`/tmp/arc-release-prompts-aggregate-red.log`). Two
real CLI cases fail against the old mode report and implicit idempotency exit (`/tmp/arc-release-prompts-native-red.log`).
Their producer copies the initialized repository template and creates recorded setup through the real explicit setup
command. All 51 focused install/uninstall/inventory cases pass (`/tmp/arc-release-prompts-focused-faithful.log`), and
all four selected native release cases pass (`/tmp/arc-release-prompts-native-final.log`, 81 unselected). The acquisition
fixtures use interactive contexts for cancellation/decline and forbidden context for unavailable requirements.
The first lint/type attempt reports retired unused Clack imports; lint also detects a new aggregation complexity count.
Removing those imports and extracting repeated refusal/stop handling fixes both issues without widening suppressions.
Both corrected type programs pass (`/tmp/arc-release-prompts-types-final.log`). Targeted lint then reports only obsolete
suppressions; the whole-project run and prune retain their own verdicts before commit.
Whole-project typed lint reports only the obsolete install function-length suppression, then its prune passes
(`/tmp/arc-release-prompts-full-lint-unpruned.log`, `/tmp/arc-release-prompts-prune.log`), removing that suppression.
The complete routine gate passes 1,119 files and 16,705 cases, with one file and 1,188 cases skipped
(`/tmp/arc-release-prompts-routine.log`, 215.30 s). The full declaration build qualifies
(`/tmp/arc-release-prompts-build.log`); Markdown and all three ARC contracts pass
(`/tmp/arc-release-prompts-md.log`). The unchanged shell inputs retain their preceding passing gate. Required CI
provides the complete E2E remainder; the local release cases prove the changed runtime paths.

## Terminal presentation boundary

`lib/terminal.ts` re-exports exactly Clack's `log`, `intro`, `outro`, `note`, `spinner` and `cancel`. All 27 remaining
presentation importers route through it; release setup's two imports already retired with its prompt migration.
The renderer retains the only direct question/cancellation import. A new composed architecture row restricts
`@clack/prompts` across source, with exact terminal/renderer exceptions; overlapping paths, syntax and predicates
remain combined by the existing scope composition. Module mocks continue to intercept the underlying Clack boundary.

The two handler/library path cases fail before the ban (`/tmp/arc-terminal-ban-red.log`). A global ban without
exceptions makes both boundary allowance cases fail (`/tmp/arc-terminal-exceptions-red.log`); adding only the two
exceptions restores them while retaining all global architecture predicates. All 66 focused configuration,
composition and inventory cases pass (`/tmp/arc-terminal-focused-green.log`), and the existing native architecture
suites pass all 88 cases (`/tmp/arc-terminal-native-lint-green.log`). Both type programs and targeted lint pass
(`/tmp/arc-terminal-types.log`, `/tmp/arc-terminal-targeted-lint.log`). The new source module is staged before the
complete routine gate so Git-based source inventories include it. Whole-project typed lint passes without suppression
changes (`/tmp/arc-terminal-full-lint.log`), and the full declaration build qualifies (`/tmp/arc-terminal-build.log`).
The complete routine gate passes 1,119 files and 16,709 cases (one file and 1,188 cases skipped) in 206.75 seconds
(`/tmp/arc-terminal-routine.log`). Markdown and all three ARC contract checks pass (`/tmp/arc-terminal-md.log`);
unchanged shell inputs retain their preceding passing gate. Required CI supplies the E2E and portability remainder.

## Required interaction contexts and declared-only discovery

All eleven prompting entrypoints require their caller's `InteractionContext`: init, join, start, stub, promote,
sync, user sync, user open, user pull, and release setup install/uninstall. Non-prompting handlers retain their
process fallback. `handleSync` preserves its separately injected output parameter and takes context third.
`handleUserSync` retains its options position for the handler adapter; resolving authority belongs to the caller
and removed its last options read. The shared test helper uses the real `resolveInteractionContext` with named
invocation signals; the four process-context module mocks retire, with terminal facts reset explicitly for each case.
Direct tests and repository-suite producers thread context explicitly; existing policy-bearing contexts stay intact.

Legacy prompt and prompt-helper occurrence selectors are rejected by the declaration schema. The scanner's raw
Clack namespace discovery, output-helper matching and renderer exception retire together; declared prompt values
remain discoverable by id. Stdin, subprocess and environment-policy discovery retain their existing selectors, and
occurrence reconciliation tests now use the real subprocess syntax class. Existing declared-prompt joins remain
covered independently. The new selector/refusal and undeclared-call tests fail three cases against the preceding
implementation (`/tmp/arc-context-scanner-red.log`) and pass after retirement. The first mixed-discovery fixture
used an unrecognized factory/import; correcting it to exported `declarePromptSite` constants at canonical imports
restores the faithful discovery test (`/tmp/arc-required-context-scanner-green.log`: 63 cases across five files).
All 122 command-input cases across 13 files and all 316 focused handler cases across seven files pass
(`/tmp/arc-required-context-inventory.log`, `/tmp/arc-required-context-handlers.log`). The first source type check
found the now-unused user-sync options parameter; the same-signature correction restores both type programs
(`/tmp/arc-required-context-types.log`). Tests are adjusted after the signature-only refactor; scanner retirement
and schema rejection have the explicit fail-first evidence above.
The first whole-project lint rejects constant expressions in generated context calls and the unused options
parameter (`/tmp/arc-required-context-lint.log`); literal signals and an explicit discard preserve the adapter
signature. The initial complete routine passes 1,119 files and 16,712 cases in 217.05 seconds before that mechanical
cleanup (`/tmp/arc-required-context-routine.log`); the corrected final tree receives a fresh routine gate.
The final complete routine gate passes 1,119 files and 16,712 cases (one file and 1,188 cases skipped) in 203.46 seconds
(`/tmp/arc-required-context-routine-final.log`). Whole-project lint and both type programs pass after the mechanical
cleanup (`/tmp/arc-required-context-lint-final.log`, `/tmp/arc-required-context-types-final.log`); the final full
build qualifies (`/tmp/arc-required-context-build-final.log`). Markdown and all ARC contract checks pass; unchanged
shell inputs retain their preceding passing gate. Required CI supplies the E2E and portability remainder.

## Prompt-kind matrix reachability

The new command-versus-policy reconciliation fails both cases against the preceding matrix
(`/tmp/arc-prompt-matrix-reconcile-red.log`); naming the candidate cases and removing unnecessary prompt-only entries
passes all 26 repository inventory cases (`/tmp/arc-prompt-matrix-reconcile-green.log`). The first native run passes
three kinds but fails both start fixtures (`/tmp/arc-prompt-matrix-native-initial.log`). A reachable start creates its
worktree but its fixture-installed hooks lack the adopter dependencies needed to commit; the existing fixture hook
configuration pattern fixes that setup and the full ceremony passes (`/tmp/arc-prompt-matrix-start-green.log`).
All spawned paths are registered before assertions; independent invocation closures settle before cleanup even when
one fails. One recorded worktree from the earlier diagnostic assertion was cleaned explicitly.

An unreachable origin does not reach `safety.indeterminate-lifecycle`: `handleStart` refuses incomplete candidate
expansion before composing lifecycle state. A reachable remote carrying branch-consistent rendered metadata with an
unrecognized State also fails before the site: `analyzeInFlightSnapshot` throws on classification-failure warnings
(`/tmp/arc-prompt-matrix-native-green.log`: four kinds pass, refusal fixture fails). Both upstream guards predate this
work unit (`497bfbcfdb`, with the warning selector refined by `2220146afa`, August 7). The claimed refusal fixture is
not a completed policy proof.

`resolveSuppliedSnapshotInputs` initializes empty disagreement sets, marks and warnings; `expandActiveInFlight`
uses that immutable advertised-OID path and `handleStart` passes its result into composition. The comparison-based
`input-snapshot-disagreement` path belongs to `resolveAgreedInputs`, which start does not use. Classification failures,
partial/unreachable expansion, incomplete transient indexes and incomplete worktree/ref reads all stop before the
prompt gate. A read-only scout corroborates the reachability gap; primary source inspection confirms the guards and
immutable-input construction. No production guard has been relaxed and no native refusal-kind coverage is claimed.

## Amendment A4: native prompt reachability

Superseded testing clause:

> - **Tests follow the policy rule.** Unit table tests run the real prompter against a fake renderer at the clack
>   boundary, covering each policy kind, each outcome, and each cancellation kind. `NO_INPUT_MATRIX` keeps one real-CLI
>   run per prompt policy kind in place of one entry per prompt-only command. Each such entry names the prompt site its
>   run reaches and asserts that kind's outcome when interaction is forbidden, and the reconciliation checks that the
>   named sites cover every policy kind a prompt site declares, each on its entry's own command. Every command with an
>   explicit stdin, subprocess, or environment-policy site, or a `--no-input` flag, still has an entry, and an entry that
>   names no prompt site stays one per command; a command's prompt-kind entries count as its entry, so `start` carries its
>   separate `proceed` and `refuse` runs and no third.

The unchanged § 7 intent is centralized declaration-driven prompt policy and truthful native behavior coverage.
Its ordinary-CLI-per-kind claim cannot produce `safety.indeterminate-lifecycle` under the strict acquisition path
shown in § Prompt-kind matrix reachability. `handleStart`, `expandActiveInFlight`, `analyzeInFlightSnapshot`, and
`resolveSuppliedSnapshotInputs` establish the earlier refusals and exclude disagreement marks. An advisor consultation
corroborates that timing or upload-pack fixtures have no supported observation boundary for that kind on this path.
The failed unknown-State fixture remains a failed attempt, not refusal-site evidence.

A4 takes the design arm at low amendment depth: a determinate verification-boundary correction, with no production
behavior change or weakened guard. The four reachable kinds retain ordinary real-CLI proof of their declared outcome;
the unreachable kind retains existing direct handler/prompter proof, and a separately labelled native case establishes
the earlier acquisition safety refusal. The original Task 9.8 Goal stays verbatim and is superseded rather than
marked fulfilled. Task 9.8.R carries the replacement; appended criterion 19 makes the exact evidence boundary visible.
Authorization is the standing direction to resolve intent-preserving adjustments during phases 1–10, recording them
at completion. Existing optimization thresholds, phase 9's source-boundary scenario, and phase 11 remain unchanged.

The primary's grounding-only footprint check traces the four functions above, verifies the direct start refusal
scenarios and generic prompter cases, and checks propagation across § 7, criterion 19 and Task 9.8.R. Reader
independence and binding completeness retain the exception and the required native/direct proofs in the spec itself.
No independent amendment-review pass is claimed; the two narrow consultations are advisory source evidence.
The Markdown-only capture passes whole-corpus Markdown and all three ARC contracts
(`/tmp/arc-amendment-a4-gates.log`); code inputs are unchanged from the passing Task 9.7 tree.

### Revised matrix implementation

The revised matrix contains 76 command/scenario entries: four named ordinary prompt sites and the singular
`upstreamRefusalFor: safety.indeterminate-lifecycle` case, with five unnecessary prompt-only command entries removed.
Start's two cases replace its old generic cannot-start case. Command reconciliation excludes prompt origin from its
non-prompt coverage set, while policy reconciliation accounts for the one declared exception explicitly and binds
all five policies to their own command. Both revised reconciliation cases fail against the old descriptors
(`/tmp/arc-prompt-matrix-a4-reconcile-red.log`), then the inventory/real-prompter/direct-start selection passes all
83 cases (`/tmp/arc-prompt-matrix-a4-focused-green.log`).

Init's tools case omits `--tools` and asserts the persisted empty `install_config.tools` default. Template preparation
supplies the explicit empty tools list, keeping producer setup independent from that omitted-input behavior. User
pull's fixture saves real notes through the CLI, reaches overwrite refusal without authority, and retains its exact
notes ref. Reachable start commits and publishes the planning ceremony, with its actual branch, meta, remote ref and
commit asserted. The upstream case observes incomplete-expansion refusal, no new worktree/local branch, unchanged
refs and tracked state; it does not claim to have reached `safety.indeterminate-lifecycle`. Prepared repositories
are reused before scenario setup, and all invocation closures settle before fixture cleanup.

The first blanket cancellation reconstruction also affected template initialization and completed no cases
(`/tmp/arc-prompt-matrix-policy-reconstruction-red.log`); it is excluded from behavioral fail-first evidence.
A site-limited reconstruction preserving every export and explicit-answer path then fails all four native prompt
cases with incorrect output or exits (`/tmp/arc-prompt-matrix-policy-reconstruction-red-corrected.log`). A separate
same-signature start reconstruction returning success from incomplete expansion fails the one native upstream case
(`/tmp/arc-prompt-matrix-upstream-reconstruction-red-corrected.log`). Both source modules are restored byte-for-byte;
all five cases pass again (`/tmp/arc-prompt-matrix-a4-native-restored.log`, 76 unselected). No production change lands.

The full routine run catches three stale literal transport-count assertions in `no-input-invocations.test.ts`
(80 entries versus 76; Linux groups 45/6/29 versus 43/6/27). They are mechanically reconciled with the reduced
matrix, preserving all transport assertions. All other 16,710 routine cases pass in that attempt. The full E2E
run passes 67 files and 699 cases in 258.20 s (`/tmp/arc-prompt-matrix-a4-e2e.log`).

Final routine validation passes 1,119 files and 16,713 cases in 216.34 s, with the existing one-file/1,188-case
skip set (`/tmp/arc-prompt-matrix-a4-routine-final.log`). Both type checks, whole-project typed lint, and the focused
six-case transport selection pass after count reconciliation. The earlier full E2E result remains applicable: only
the isolated unit count assertions changed afterward. The full declaration build and shell gate retain their
passing Task 9.7 results because their source/configuration inputs are unchanged. No suppression record changes.

## Prompt migration closure

The primary source-boundary scenario records exactly two Clack imports: `lib/terminal.ts` exposes only presentation
and `lib/command-input/prompt-renderer.ts` owns all four question forms. The source-wide composed
`no-restricted-imports` rule exempts exactly those modules; the completed routine suite includes its real native
lint refusal/exception cases. All eleven prompting handler signatures require `InteractionContext`.
`/tmp/arc-phase9-source-boundary.txt` retains the import, signature and interaction-branch loci.

Every remaining branch in `prompts/` draws a note, message or warning; init's branches pause/restart its spinner,
user-open's branch logs the safe keep, and user-sync's branch displays the conflict warning. Init/join input
resolvers classify provenance and pass a legacy interactive boolean to identity callbacks; the actual handlers'
callbacks ignore that boolean and always reach the declaration-bound identity prompter. Both acquisition callbacks
run in every context. The renderer-bound prompter owns policy outcomes. Legacy `acquirePromptInput` and
`resolveConfirmation` have no production callers. Other interaction checks authorize editors, stdin transport or
subprocess presentation, and do not answer a declared question.

Task 9.1 records the project-name default drift; 9.2 records missing-input syntax; 9.3 records identity defaults;
9.4 records authority-dependent notes publication while preserving paired save/publication/retry behavior; 9.5
records release mode syntax and explicit idempotency. Task 9.8.R retains four ordinary native policy proofs plus
A4's sole unreachable-site exception, its direct handler/prompter proof and distinct native acquisition refusal.
A4 is revalidated at 9.9; no production guard is weakened. This scenario closes only the prompt-migration segment.

Code checks retain the passing 9.8.R tree: 1,119 routine files/16,713 cases, 67 E2E files/699 cases, both type checks,
whole-project typed lint, and unchanged full declaration-build/shell results. Only completion records change here;
whole-corpus Markdown and the three ARC contracts run over those final records. Success Criteria remain unchanged.

## Amendment A5: Windows publication keys

At `67f6d9b7b10f6295e2e9d75856b5ad8c05df545c`, five sequential Linux dispatches pass on their first attempts:
`37622802291`, `37623893388`, `37624682442`, `37625427884`, and `37626223423`. Every run retains half-timeout
headroom for all 13,689 completed unit cases. Median run duration is 316 s and summed test-job time is 1,697 s,
reductions of 41.48% and 20.74% against the frozen baseline. All twelve local captures also pass: E2E summed median
is 2,059,173.491 ms (26.14% reduction), while native paired median is 767,182.911 ms (32.09%, below the 40% target).
They remain historical captures under `closing-hosted/` and `closing-local/`, not final corrected-head evidence.

The sixth dispatch, `37627102347`, fails its Windows full build before portability tests. Its failed job log
(`/tmp/arc-closing-windows-build-failure.log`, job `112811584397`) reports required `schemas/kernel.json` missing.
`listRelativeFiles` returns native `relative(root, file)` keys, while `validateStagedOutput` compares exact portable
`schemas/kernel.json`; Windows returns `schemas\kernel.json`. The generator writes through native `join` into
correct owned staging. The same enumerator governs prior-live obsolete-output comparisons. Git blame and a
baseline-to-closing source comparison show this mismatch predates the WU; it is not a schema-generation regression.

A5 takes the task arm at low depth: existing Windows/macOS portability obligations require this output, and no
settled decision changes. Revision 10.1.R normalizes the native enumerator's artifact keys and retains every
publication guard. The original measurement Goals, success criteria, thresholds and final-head requirement remain
unchanged. Closing samples therefore restart at the corrected committed head; no pre-fix baseline sample repeats.
Standing phase 1–10 authority covers this bounded prerequisite correction and its necessary hosted runs.

The primary grounding footprint traces `listRelativeFiles`, `validateStagedOutput`, `publishStagedBuild`,
`generateRuntimeSchema` and `writeKernelSchemaArtifact`; the narrow scout independently corroborates the mismatch.
Task ordering places the correction before the hosted obligation it enables. Reader independence and binding
completeness retain the existing portability and exact-head obligations; no independent amendment-review pass is claimed.

The native-cost comparison with the earlier 41.92% result remains unresolved: four added native-family files add
8,915.546 ms, and the existing 77 files add 102,197.836 ms in the median-defining pair comparison. A 234-file
non-native integration cohort with identical test-name lists also slows by 11.91%. Retained timings establish broad
slowdown with limited native workload growth; they do not distinguish environment from intervening implementation
or scheduling changes. The primary reproduces the advisor's decomposition from raw captures and does not substitute
the earlier result for the closing sample. Refreshed final-head sampling will retain its own result.

The regression case replaces only the external path library's relative-key/separator behavior with its real Windows
implementation; native fixture filesystem joins stay on the host. It reproduces the exact missing-schema refusal
before the fix (`/tmp/arc-windows-publication-path-red.log`). The correction normalizes native relative keys with
`split(sep).join("/")`, preserving valid POSIX backslash filename characters and using the same representation for
staged validation, live retained-output comparison and publication joins. No publication check is relaxed.

The corrected publication selection passes 15 cases across its unit and native integration files
(`/tmp/arc-windows-publication-path-green.log`). The new external-path mock is registered in `unit-mocks`, preserving
the quarantine guard. Both final type checks, whole-project typed lint, shell checks and full declaration build pass.
The initial forced-color routine attempt also exposes eight inherited-formatting failures plus that missing mock
registration; its failed record remains `/tmp/arc-windows-publication-routine.log`. The formatting correction follows
as its own atomic Task 10.1.R2 change. The combined worktree passes all 1,120 routine files/16,714 cases with
`FORCE_COLOR=3` in 234.01 s (`/tmp/arc-closing-repairs-routine-final.log`), retaining the existing skip set.
The source/build inputs remain unchanged after those checks; final completion records receive Markdown/ARC checks.

## Inherited subprocess formatting

The forced-color routine run exposes eight failures in script/CLI fixtures whose child stderr must be empty or
start with a domain error. Vitest's inherited `NO_COLOR` and the parent's `FORCE_COLOR=3` make Node emit its
formatting-conflict warning before that output. The failure capture remains `/tmp/arc-windows-publication-routine.log`.

`runCli` and `runScript` now clear inherited `FORCE_COLOR` before applying explicit invocation overrides. The four
direct Node/npm fixture callers in one-shot entrypoints, current-workflow validation, cohort consistency and the
roadmap remedy clear it in their child environments. No source CLI/script, decomposition behavior, timeout, output
assertion or verdict is changed. The focused six-file selection passes all 131 cases with the forced-color parent
(`/tmp/arc-forced-color-child-green.log`); the complete routine run passes 1,120 files and 16,714 cases with
`FORCE_COLOR=3` in 234.01 s (`/tmp/arc-closing-repairs-routine-final.log`).

Both type checks and whole-project typed lint pass on the final combined repair tree; the full declaration build
and shell checks remain green with unchanged inputs. No suppression changes. The publication and formatting repairs
land in separate atomic commits; only their completion records change after code validation. Final corrected-head
measurement resumes after both commits, preserving all earlier captures and the failed Windows attempt.

## Amendment A6: Synthetic native fixture source closure

The corrected-head paired native median is 737,715.564 ms, a 34.69% reduction against the frozen baseline; the
40% requirement remains unmet. `makeNativeBuildFixture` copies every production source, then replaces `src/cli.ts`
and `src/scripts/build-schema.ts` with tiny fixture inputs. Unrelated source is repeatedly copied and inventoried
although the actual native workload is build/control tooling. A conservative read-only closure probe identifies
roughly 402 reachable files out of 1,081; that is a candidate footprint, not a measured saving or completeness proof.

A6 supersedes this settled § 1 text:

> The two fixtures that copy live `src` directories recursively, `makeNativeBuildFixture` (all of `src`) and
> `makeFocusedLintFixture` (`src/scripts` and `src/lib`), copy through one shared helper. It keeps the recursive copy
> of what is on disk, with a `cp` filter that skips bundle-require's transient `*.bundled_*.mjs` files, so the copy
> never reaches for a file that vanishes mid-copy. Both directories receive transients during the unit tier
> (`build-inputs.test.ts` bundles `src/scripts/build-schema.ts`; `build-ownership.test.ts` bundles
> `src/lib/build-ownership.ts`). Copying what is on disk keeps dirty trees working: a tracked-file list
> (`git ls-files`) would still name a deleted, unstaged file and would omit a new untracked module.

The design arm corrects the all-source synthetic fixture mechanism, preserving its hermeticity intent and every
real native outcome class. Depth is low: traversal composes the installed TypeScript resolver with ordinary file
copying; path-loaded build roots are explicit in `buildOwnedArtifacts`, `generateOwnedBuildStaging` and the compiler
bootstrap. No production inventory, qualification rule, compiler, assertion, timing threshold or measurement setting
changes. Owner direction authorizes intent-preserving adjustments within phases 1–10 and their atomic commits.

The primary grounding traces `makeNativeBuildFixture`, `makeVitestControllerFixture`, `makeFocusedVitestFixture`,
`makeNativeTestCostFixture`, `runBuildCommand`, the build loader boundaries and `loadSchemaProducer`. The production
schema proof remains separate in `build-inputs.test.ts`. Reader independence and binding completeness place the
copy contract, loader roots, dirty-tree behavior, missing-edge refusal and retained native obligations in the spec.
The revision task sits before final measurements; its test-first cases cover the changed copy behavior. The sweep
finds Task 2.2.b's completed all-source fixture route, which takes an additive amendment marker. Phase 3's real
native outcomes and all closing-measurement thresholds remain unchanged. No independent amendment pass is claimed.

The hosted collector stops before dispatching more samples; its already launched fifth run may finish independently.
Local collection finishes before source-input edits. Any later fixture change requires
fresh final-head evidence; these samples cannot silently become its acceptance record. Bounded calibration precedes
that expensive collection, and no pre-fix baseline sampling repeats.

## Repository-inventory deadlines

The third corrected-head closing `lane` sample fails: `one-shot-script-entrypoints.test.ts`'s inventory-output case
exceeds its 15 s test deadline, and `command-surface-documentation.test.ts`'s repository-snapshot setup exceeds its
10 s hook deadline. The 314.72 s run reports 1,118 passing files, two failing files, one failed case and thirteen
cases skipped by the failed hook. No capture JSON is produced; `closing-local-a5/lane-3.log` retains the failures,
and only the first two lane captures succeeded. These failures cannot enter a successful closing median.

Both paths load the real repository command-input snapshot, parsing the reachable source graph and reconciling the
inventory. Revision 10.R2 gives only these measured scans a named 30 s deadline. The remaining process deadlines,
project defaults, all listener/output assertions, source traversal and documentation checks stay intact. This is
an intent-preserving timing correction within standing phase 1–10 authority, with no criterion or design reversal.
The failed existing cases supply red evidence; corrected focused and routine runs must establish completion.

A6's behavioral reconstruction delegates to the old recursive copy and fails both new cases: unrelated sources
remain copied and unresolved relative imports do not refuse (`/tmp/arc-a6-source-copy-red.log`). The dependency
copier passes both cases (`/tmp/arc-a6-source-copy-green.log`), including type/re-export/JSON edges, on-disk runtime
JavaScript siblings, explicit loader seeds and independent writable copies. The installed TypeScript resolver and
exact on-disk runtime alternative are both retained, preventing a `.ts` preference from hiding a native `.js` edge.

The unchanged native build-command, CI transfer/recovery, local-route and native-measurement files pass all 36 cases
(`/tmp/arc-a6-native-proofs.json`). Their focused timings are not comparable tier-isolated acceptance medians.
A three-pair copy-only calibration (`/tmp/arc-a6-copy-calibration.json`) compares broad versus closure copying:
median copy time falls from 538.181 to 302.262 ms, inventory traversal from 18.524 to 6.484 ms, and cleanup from
26.731 to 12.516 ms. Inventory entries fall from 1,158 to 455. These observations establish actual fixture savings;
they do not establish the native-family 40% criterion, which still requires final tier-isolated measurements.

Both corrected repository-scan files pass their 17 cases in the focused run
(`/tmp/arc-repository-scan-deadlines-focused.log`). The bound grows only where full-repository work actually timed
out; no output or documentation assertion changes. Routine concurrency validation remains required before commit.

The first combined routine attempt overlaps whole-project typed lint. It finishes with twelve failed files and
eleven failed cases, including native build-command/local-route and unrelated Git/review cases at their existing
deadlines despite passing the preceding focused selection. This attempt remains
`/tmp/arc-a6-routine.log`; overlap is recorded as an uncontrolled contention source, not established causation.
Typed lint finishes successfully (`/tmp/arc-a6-lint-whole.log`), and both final type checks pass. The routine gate
will run alone over unchanged code before any completion claim. Prior full declaration-build and shell results
remain valid because their source, configuration and shell inputs are unchanged.

At the earlier `a4b370c81172c2d96c5cb64c30f380a902bb84af` head, five sequential first-attempt Linux dispatches
finish successfully: `37630292370`, `37631088411`, `37632019650`, `37633042026`, and `37634020611`. The collector
retains half-timeout headroom for 13,690 unit cases in the first four; the fifth conclusion is retained separately
in `/tmp/arc-a5-hosted-run5-final.json`. No portability pair follows this historical sequence. All three unit,
integration and E2E local captures pass; only two lane captures pass before the recorded third-sample failures.
A6 and 10.R2 change test inputs, so these observations do not replace their final-head closing obligations.

The standalone forced-color routine finishes in 217.00 s with six failed native files/six failed cases and 1,115
passing files; `build-preparation`, `local-vitest-routes`, `test-cost-native`, `vitest-failure-ownership`,
`vitest-mixed-shard` and `vitest-native-closing` hit their existing 30 s bounds. Its evidence remains
`/tmp/arc-a6-routine-standalone.log`. No success or closing-cost claim uses either failed routine attempt.

During that run the Owner reports significant machine slowdown, then confirms responsiveness improved when it
ended. A subsequent host-visible five-second sample finds no surviving Vitest, tsup or native-fixture processes
(`/tmp/arc-host-process-sample.json`). `vmstat` reports about 98% idle CPU with negligible current swap activity,
and roughly 12 GiB of memory is available. This supports transient test-load pressure rather than an observed
runaway process; it does not establish the dependency copier as the cause of the deadline failures. The local
configured 50% pool maps to twelve workers on this 24-CPU machine, each capable of spawning native compiler/test
children. Routine validation therefore uses the existing `VITEST_MAX_WORKERS` override at lower concurrency and
serializes heavy checks. Closing acceptance measurements retain the frozen instrument's twelve-worker setting.

## Default local gate resource tuning

Owner direction makes ordinary development responsiveness part of the local-gate requirement: this is a shared
WSL2 primary workstation with Windows browsing, IDE and email active, and three to six implementation sessions
may run concurrently. Avoid a blanket two-worker correction; identify the WU's changes and select an efficient
balanced default from a small, profiled comparison. WSL configuration remains outside this correction.

The Owner supplies 32 GB physical RAM, no WSL `memory` or `processors` override, and a 16 GiB swap setting.
The observed VM exposes 24 logical CPUs and 16,246,280 kB of memory, with approximately 3.2 GiB swapped at the
post-run observation. The commented experimental reclaim setting does not establish the running WSL version's
reclaim behavior. Windows-side process queries fail in this session's interop, so Linux resource measurements
cannot independently attest total Windows headroom.

The primary baseline-to-current source comparison confirms `npm test` still runs unit, unit-mocks and integration;
E2E is not newly part of routine validation. `resolveVitestMaxWorkers` still defaults to 50% locally and honors
explicit overrides; no percentage increase occurred. Retained native files relocate from non-isolated unit to
integration's isolated execution, losing cross-file module reuse and joining integration's scheduling/tmpfs context.
`HeavyFirstSequencer`'s unsharded sort preserves native order when no `ARC_TEST_DURATION_FILE` is provided.
New unit launch accounting and native guard proofs add work; A6 adds measured graph preprocessing/resolution while
reducing copy/inventory work. These are concrete changes, not an attribution of each timeout to one of them.

The six failed native files pass all 22 cases at two workers in 52.42 s
(`/tmp/arc-a6-native-deadlines-two-workers.log`), showing a lower-pressure valid execution but not an optimal default.
Tuning starts with one complete routine run at four workers, then a higher candidate only if its headroom permits.
The fixed code/environment and first-attempt conclusions, wall time, task-tree CPU/process counts, proportional
resident memory and VM memory/swap behavior determine the tradeoff. These are named resource-calibration runs,
not new pre-fix baselines or substitutions for the closing measurement's fixed twelve-worker instrument.

The first four-worker profile uses an environment override and finishes in 319.41 s with 1,119 passing files,
two failing files and three failed cases. The failures are semantic worker/serial mismatches, with no native
30 s deadline failure. `VITEST_MAX_WORKERS=4` leaks into the shared native fixture children: installed Vitest applies
that environment setting after normal options, defeating a requested one-worker mock-isolation scenario, explicit
serial execution, and the unit guard's same-worker esbuild-service proof. The assertions are correct; the fixture
seams must clear the inherited control before explicit caller overrides. `10.R3` records that bounded hermeticity
repair. The failed full run supplies red evidence in `/tmp/arc-local-tune-4.log`.

The process-tree profile records 42 peak processes, 477% peak aggregate CPU (approximately 4.8 logical CPU cores),
3,784.7 MiB peak proportional resident memory, 8,428.3 MiB minimum VM available memory and zero swap growth
(`/tmp/arc-local-tune-4-resources.json`). These describe this explicit environment-override run, including its
unintended inner workers; they cannot establish the healthy ordinary default or the final tuning choice. The next
calibration uses native CLI sizing so only the outer run changes, after the two shared fixture seams are repaired.

The two corrected fixture seams pass all eight focused controller/guard cases under `VITEST_MAX_WORKERS=4`
(`/tmp/arc-fixture-worker-env-green.log`, 15.83 s). They clear only the inherited worker control; explicit
per-invocation overrides remain available. The full CLI-sized six-worker calibration runs without a concurrent
heavy gate. The Owner's later no-impact observation occurred after the four-worker run ended and therefore
cannot attest Windows responsiveness during that run.

During the CLI-sized six-worker routine calibration, the Owner reports Windows impact between normal and
noticeable-but-acceptable: barely perceptible, likely unnoticed without actively checking. This is direct
concurrent host feedback, unlike the earlier idle observation; final pass and resource totals remain pending.

The fixed-code CLI-sized six-worker run passes all 1,121 executed files and 16,716 cases in 252.45 s
(`/tmp/arc-local-tune-6-cli.log`). Its profile records 38 peak processes, 754.4% peak CPU (one-core scale),
4,753.8 MiB peak proportional resident memory, 7,548.6 MiB minimum VM available memory and 2.7 MiB swap growth
(`/tmp/arc-local-tune-6-cli-resources.json`). Together with concurrent host feedback, six is a viable candidate.
The remaining headroom warrants one eight-worker comparison over identical code/environment, checking whether
additional throughput earns its additional host load. No default changes or optimality claim precedes that result.

The eight-worker comparison completes in 214.17 s with 1,120 passing files and one failed case
(`/tmp/arc-local-tune-8-cli.log`). The native closing-measurement fixture requests a 50 ms timer and observes
49 ms against its 50 ms floor. The WU reduced both the original 800 ms timer and floor to 50 ms, leaving no
measurement margin. This is a timer-precision flake, not a native deadline failure or established capacity limit.
Revision 10.R4 pads only the synthetic request to 75 ms while preserving the 50 ms floor and every retained-time
and metadata assertion. The failed full run remains red evidence and cannot be reported as a passing gate.

Its profile records 47 peak processes, 871.4% peak CPU, 4,822.3 MiB peak proportional resident memory,
7,428.3 MiB minimum VM available memory and zero swap growth (`/tmp/arc-local-tune-8-cli-resources.json`).
The Owner reports Windows responsiveness about the same as six workers. Eight is about 15.2% faster in this
single comparison with nearly identical peak memory; it remains a candidate requiring the timing fix and a
passing ordinary gate, not an asserted universal optimum.

One Luna light-research pass finds native bounded workers are established test-runner practice; participating
nested tools can share a global job budget as in GNU Make/Gradle. A universal numeric cap is not established.
The bounded local worker policy retains the current heavy admission lock and explicit CI/worker overrides;
a global descendant jobserver or new adaptive memory scheduler would exceed the demonstrated need.

## Amendment A7: Bounded local default worker sizing

The existing Goals cover cheaper reliable shared development, but no criterion specifies an ordinary local
resource bound. Owner direction requests balanced routine tuning and authorizes intent-preserving adjustments
through phases 1–10. The amendment therefore takes the spec-depth arm at low depth: add a ceiling to the existing
policy, without reversing a stated outcome, changing selected tests, adding a scheduler or changing WSL settings.

The primary traces `resolveVitestMaxWorkers`, the root Vitest config and `runLocalVitestTier`: the config owns one
shared default pool, native forwarded CLI flags can override it, and independent project limits with identical
Vitest group order are refused by the installed runner. A global eight-worker ceiling on the existing half-capacity
local default is the minimal grounded change; smaller CPU counts retain proportional sizing with a one-worker floor.
CI and explicit capacity overrides remain unchanged. Closing instruments deliberately request twelve workers.

Author-run grounding and reader/binding checks cover that policy, its CI/CLI precedence, existing admission,
isolation and timeouts, and the added criterion/revision task. No independent amendment pass is claimed at low
depth. The propagation sweep finds the worker-policy unit assertions and explanatory config comment; other tiers,
CI workflow sizing, source build inputs and measurement criteria retain their obligations. The ordinary default
run closes the detour; the failed eight-worker timing capture remains failed, not substituted into a success median.

The 75 ms injected closing delay passes all five existing native measurement cases without assertion changes
(`/tmp/arc-closing-timer-margin-green.log`, 18.57 s). The later twelve-worker timing question distinguishes its
217.00 s failed current-code run from the previous-head 234.01 s passing run; neither is a paired same-code
speed comparison that establishes a twelve-worker advantage over the current eight-worker observation.

A7's revised worker-policy case fails behaviorally against the former percentage default
(`/tmp/arc-local-worker-ceiling-red.log`) and all four policy cases pass after the numeric capacity bound
(`/tmp/arc-local-worker-ceiling-green.log`). The new ordinary `npm test` run clears inherited worker overrides;
its resource profile and first-attempt result will close the local policy obligation. Heavy lint/build/type work
remains serialized after this run to avoid contaminating the workstation comparison.

External primary guidance: [Vitest worker sizing](https://v4.vitest.dev/config/maxworkers),
[Vitest parallelism](https://vitest.dev/guide/parallelism.html),
[GNU Make job slots](https://www.gnu.org/software/make/manual/html_node/Job-Slots.html), and
[Gradle native parallel compilation](https://docs.gradle.org/current/userguide/native_software.html#sec:parallel_compilation).
These establish bounded workers and shared participating-tool budgets as prior art, not an eight-worker universal
optimum. The selected ceiling is a local measured policy; per-project grouping or a new process jobserver is not added.

The ordinary forced-color `npm test` command, with no worker override, passes all 1,121 executed files and
16,717 cases in 216.90 s (`/tmp/arc-local-default-eight.log`). The default policy profile records 51 peak
processes, 859.7% peak CPU, 5,231.3 MiB peak proportional resident memory, 6,887.6 MiB minimum VM available
memory and zero swap growth (`/tmp/arc-local-default-eight-resources.json`). This closes A7's ordinary local gate
on the corrected timer fixture and also validates the source-copy, repository-deadline and worker-environment
repairs together. It is an ordinary gate result, not a replacement twelve-worker closing-cost capture.

Both type checks, whole-project typed lint, the full declaration build and shell checks pass after the local
policy/fixture corrections (`/tmp/arc-local-tuning-{types,lint,build,shell}.log`). Heavy checks run after native
testing rather than alongside it. The worker-policy API receives documentation after its behavioral gate;
that comment adds no runtime behavior. A7 closes on the ordinary default run, with all Success Criteria markers
left for terminal verification. Atomic content commits carry their task completion updates; no meta/session
state is written. The final-code closing measurements still own native/E2E/hosted cost acceptance and budgets.

## Closing measurement at the locally committed correction head

The clean code head is `20b094ffeb64e2fd2604a80bc1e5dbfdf93c4cc0`. The six retained unit/integration captures
in `.test-cost-runs/closing-local-a7/` use schema v4, tier-isolated selection and the frozen twelve-worker setting.
All pass: unit has 842 files/13,693 cases, integration 280 files/3,024 cases. Native-family paired sums are
679,665.264297, 672,887.930917 and 645,182.476387 ms; their 672,887.930917 ms median is 40.43362898% below
the frozen 1,129,643.991052 ms baseline. `native-summary.json` retains the calculation. This meets the native
40% comparison without further fixture caching or a threshold change; E2E/lane and hosted closing remain pending.

Native unit/integration collection precedes expensive hosted dispatch as a bounded ordering adjustment: checking
the previously unmet native bar first prevents another full hosted sequence for a candidate that misses it. All
captures retain final-head binding and original settings; no pre-fix baseline repeats. The ordinary local default
remains the separately validated eight-worker policy, not the measurement setting.

Three normal wrapped pushes receive remote Internal Server Error refusals, at 15:12:54, 15:13:37 and 15:14:34 UTC.
Both Git ref discovery and GitHub's ref API still show remote `a4b370c81172c2d96c5cb64c30f380a902bb84af`.
ARC qualification and local hooks do not refuse these pushes. GitHub subsequently posts
[the Git Operations/Actions incident](https://www.githubstatus.com/incidents/djlmxz2zd0j7), created at 15:14:45 UTC;
its 15:21 update reports degraded Git Operations and major Actions/Pull Requests outages. Further publication and
hosted sampling wait for service recovery while local captures continue. No failed push or unavailable hosted
result is represented as successful.

## Amendment A8: Real CLI overlay dependency closure

The first E2E closing run fails `stale-build-guard.e2e.test.ts`'s content-hash reason case before the guard executes:
`contentStaleBundle` replaces the synthetic CLI with production `src/cli.ts`, but A6 no longer supplies its unrelated
handler/command sources. The actual compiler reports missing CLI help, command-routing and dynamically imported
handlers. The 237.59 s run has 66 passing files, one failed file, 698 passing cases and one failed case; its log is
`closing-local-a7/e2e-1.log`, with no successful capture JSON. Later E2E/lane samples do not start.

A6's source-copy consumer sweep missed this real-CLI overlay. A8 takes the task arm at low depth: the settled live
reachable-source contract would preserve this native outcome, but the consumer failed to request its additional
root. `contentStaleBundle` now uses `copyLiveDependencies` for the actual CLI entrypoint before qualification and
content mutation. Synthetic controller/build fixtures keep their small graph. All content-hash reason, ordinary
stale refusal and compaction-seed exemption assertions remain intact; no test or production behavior is removed.

Primary grounding traces the overlay, copier and real build/guard path; advisor consultation audits other fixture
source replacements for missing additional roots. The revision lives before closing verifiers, with its record
riding the implementation commit. The earlier native 40.43% result remains evidence for its recorded head, but
corrected final-head captures will establish closing acceptance. No host sequence was launched for the failed head.

The bounded advisor audit finds no second missing source root among the other fixture overlays. Primary source
reads confirm the generated owner imports are retained by the base roots and that the real-CLI copy occurs before
qualification and deliberate mutation. The focused stale-guard file passes all three cases in 9.45 s.

An additional E2E stress invocation mistakenly carries `FORCE_COLOR=3`, which the spec requires for the routine
lane only. It fails 48 cases across seven files in 229.58 s: output-sensitive cases retain Node's conflicting
`NO_COLOR` warning, including the installed lifecycle fixture's clean-stderr assertion. The failed log is retained at
`/tmp/arc-a8-e2e-gate.log`; it is neither closing evidence nor a green gate. The ordinary E2E gate is rerun without
the unintended formatting override. All reported failures are grounded in that conflicting-environment warning.

The ordinary E2E gate passes all 67 files and 699 cases in 232.44 s (`/tmp/arc-a8-e2e-normal-gate.log`), including
the real-CLI stale-guard case. This green run preserves the output assertions and confirms the formatting failures
came from the added stress environment; the failed run remains retained separately.

Both type checks and targeted typed lint pass for the E2E-only code delta; Markdown and all ARC contract checks
pass. The prior full build, shell lint and passing forced-color routine lane cover unchanged inputs under the
project's unchanged-tree rule. The repair and forward task amendment form one atomic commit; A8's closing
revalidation remains with Task 10.2 and all Success Criteria stay unmarked.

## Closing measurement at the corrected final code head

The repair head is `31c26574ed4dc7ccd02d9e4bced30e0b3cfe338d`; normal wrapped publication succeeds after GitHub's
partial recovery. At 15:49:57 UTC the incident moves to monitoring with Git Operations and Actions operational.
Fresh captures live under `closing-local-a8/`, retaining the frozen schema v4, twelve-worker and tier-isolated
settings. All six unit/integration runs pass. Native-family paired sums are 645,223.513930, 646,737.758524 and
628,120.127634 ms; the 645,223.513930 ms median is 42.88257902% below the frozen 1,129,643.991052 ms baseline.
`native-summary.json` retains the calculation. E2E/lane collection and sequential hosted closing now use this same
head; earlier-head measurements remain historical evidence rather than substitutes for these captures.

## Amendment A9: Repeated fixture parsing

Hosted runs 37647928217, 37648904674 and 37649708162 all pass on attempt one at `31c26574e`, and each report
contains 13,693 completed unit cases with no half-timeout violation. Their elapsed times excluding the duration-cache
tail are 390, 295 and 346 s; summed test-job times are 1,886, 1,751 and 1,727 s. Every summed time exceeds the
1,712.8 s limit from the frozen 2,141 s baseline. Three such observations mathematically prevent a five-run median
from clearing the 20% bar, regardless of the last two observations. Further dispatch stops; already-started run
37650528528 is cancelled and retained separately. No cancelled run counts as a pass. The local lane collector can
finish at its unchanged head, but those captures will remain historical after any implementation change.

The amend-design gate takes the task arm at low depth: the existing hosted cost criterion requires the missing
outcome, and the live-source fixture contract permits avoiding repeated parsing without caching contents or resolved
graphs. `copyLiveDependencies` currently runs `ts.preProcessFile` again after every live read. Earlier calibration
attributes about 106 ms of 153 ms traversal to parsing; the bounded advisor consultation identifies repeated fixtures
within isolated files as the available reuse boundary, without claiming enough hosted savings before measurement.

The correction retains one latest content/specifier entry per absolute source filename. Each copy still reads actual
bytes, re-runs `ts.resolveModuleName` and runtime `fileExists`, and independently copies the graph. Exact content
changes invalidate parsing reuse; new/deleted resolution candidates remain live. The footprint is the copier,
its repeated-source tests and native consumers; thresholds, isolation, admission, compiler outcomes, CI layout and
all Success Criteria remain unchanged. Author grounding traces these paths and the existing fixture graph fidelity
criterion; the new task states the source/resolution/independence obligations directly. The amendment row and task
record ride the implementation commit, with fresh closing evidence required afterward.

The repeated-copy tests pass against the original uncached implementation, then fail the two bounded unsafe-cache
reconstructions: stale import parsing omits the new untracked dependency, and cross-call resolution caching omits
a newly created TypeScript candidate. Restoring content-keyed parsing and fresh resolution passes all four graph
cases. Logs are `/tmp/arc-a9-content-red.log`, `/tmp/arc-a9-resolution-red.log` and `/tmp/arc-a9-live-green.log`.

Three paired warm-copy calibrations compare uncached and memoized parsing with identical live source roots and
independent destinations. SHA-256 inventories match for every one of the 405 files. Median copy time falls from
200.883566 to 154.669295 ms (about 23%); `/tmp/arc-a9-memo-calibration.json` retains all samples. This bounds the
local saving, without claiming a hosted result before fresh measurement. Only parsing is memoized; TypeScript
resolution and runtime candidate checks remain uncached across invocations.

Cancellation settles as `cancelled` in the retained run record; run/job/artifact metadata remain under
`closing-hosted-a8/4-37650528528/`. GitHub cannot provide a complete cancelled-run log (`log not found`), recorded
in `log-unavailable.txt`. The three passing runs keep their complete logs and unit-headroom reports.

The ordinary default routine lane passes 1,121 executed files and 16,719 cases with `FORCE_COLOR=3` in 212.80 s
(`/tmp/arc-a9-routine.log`). Both type checks and whole-package typed lint pass with no suppression change.
The unchanged full-build and shell inputs retain their prior passing witnesses. Fresh hosted collection will
start alongside the fresh local unit/integration captures: those preceding captures already clear the native bar,
and the new correction targets the observed hosted cost miss. All final-head captures still rerun with the frozen
instrument/settings. The temporary hosted collector now stops before another dispatch once three summed-cost
samples make the five-run median mathematically unable to clear its unchanged target.

The real-CLI stale-guard file also passes all three cases in 9.40 s with the corrected copier
(`/tmp/arc-a9-stale-guard.log`). Author grounding over the A9 row, task and affected live-source contract finds no
contradiction: source bytes, runtime candidates and TypeScript resolution remain live, while the memo retains only
one latest content/specifier entry per filename. No outcome class, threshold or production input inventory changes.

## Closing collector continuity

An unintended interactive interruption stops the local collector shells at unchanged head `5fd09e0c5`. Eight
successful captures (three unit, three integration, two E2E) remain. The incomplete E2E third-run log is preserved
as `closing-local-a9/e2e-3-interrupted.log`, with no passing capture emitted. No local native run remains before
resuming that third sample and the pending lane triplet. Hosted sample 3, run 37654352610, continues remotely;
the resumed collector binds to that exact run/head/attempt instead of dispatching a replacement. Earlier hosted
runs retain their original ordinal, complete metadata and unit-headroom reports. No implementation bytes change.

Hosted samples 1–3 at `5fd09e0c5` pass on attempt one, each with 13,695 unit cases retaining half-timeout
headroom. Their summed job times are 1,709, 1,809 and 1,787 s: one under and two above the 1,712.8 s target.
A five-run median is still undecided; both remaining observations must be under the target to clear it. Sample 4
fails to dispatch twice with GitHub API HTTP 500. Fresh run listings show no fourth run; the three existing
successes and their ordinal/head bindings remain. Local lane collection continues without further dispatch retries
while the service recovers. The official incident is resolved at 16:25:14 UTC; that status does not negate the
observed later API refusals.

A bounded read of sample 3's duration handoff and native outputs confirms `assignDurationShards` receives the
handed estimates and assigns estimated E2E totals of 585.4, 585.3, 585.4 and 585.2 s. Actual file totals differ
(554.2, 541.1, 433.6 and 391.2 s); `candidate-lineage.e2e.test.ts` is the largest file on the longest shard.
This is observed runtime variance, not evidence of a broken cache handoff. No new optimization or criterion change
is inferred from the service failure.

All twelve successful local closing captures at `5fd09e0c5` are retained under `closing-local-a9/`, using schema v4,
tier-isolated selection and twelve workers. Unit wall times are 14,839/14,887/14,851 ms; integration
158,910/160,226/159,022; E2E 233,537/236,535/239,846; lane 177,625/174,608/177,739. Unit has 13,695 completed
cases, integration 3,024, E2E 699 and lane 16,719 in each capture. The native paired median is 623,782.140966 ms,
44.78064364% below baseline. E2E summed median is 1,785,396.643046 ms, 35.96003822% below baseline. The interrupted
third E2E attempt is retained separately and excluded from these medians.

A third delayed dispatch retry creates exact run 37655947941 as sample 4 after fresh run listings prove no prior
fourth run. The first three passing observations retain their order. The bounded candidate-lineage consultation
finds meaningful file-partition seams, but file splitting is not applied: the remaining hosted median is undecided,
and parallelizing one long file does not by itself establish lower aggregate job work. Current case bodies,
registration, initialization/cleanup, concurrency and timeouts stay unchanged.

## Amendment A10: Candidate decision fixture work

Hosted sample 4, run 37655947941, passes on attempt one at `5fd09e0c5`, with 13,695 completed unit cases and
half-timeout headroom. Its summed test-job time is 1,920 s. Together with 1,709/1,809/1,787 s from samples 1–3,
three observations exceed the unchanged 1,712.8 s target, so the five-run median cannot pass. The collector stops
before sample 5; no fifth or portability-pair run is dispatched, and no five-run closing median is claimed.
The successful local triplets remain historical at that head after the next implementation change.

The amend-design gate takes the task arm: the hosted summed-cost criterion remains unmet, while the Proposed
Design's general rule and § 6 already require decision variants below the real stack. Low depth follows the
existing `registerCandidateLineageSuite` selector and its supported public-handler adapters; no new seam, cache,
record fabrication or concurrency mechanism is required. Only E2E fixture startup work moves; integration-file
optimization, acceptance thresholds, admission, isolation, CI layout and every Success Criterion remain unchanged.

`settledReviewLineage` produces its records through public handlers with real Git in integration mode.
`runArc` preserves attestation options, including the moved-root fixture's `--new-root`; `runArcWithStdin` passes
the same explicit JSON requests to review handlers. The deciding readers and composers remain production code.
The thirteen additional integration selections are:

| Group                      | Cases                                                                                            | Deciding boundary                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Composition                | Approved responses; checkpoint-validated base after a ref move                                   | `composeLineageReview`                              |
| Applicable record refusals | Missing local source; malformed Candidate-named disposition                                      | `composeLineageReview`                              |
| Residue filtering          | Unavailable unrelated source; malformed unrelated record                                         | `composeLineageReview`                              |
| Merge refusals             | Final drift; substituted checkpoint handle                                                       | `mergeIntegration` with production checkpoint reads |
| Routed obligations         | Settled findings; missing verdict; moved-head source order; singleton selection; absent boundary | `readRoutedObligation`                              |

Real Git mutations and production durable-store writes remain in every selected body. The drift case retains its
production `executeSettlement` dependency. A bounded advisor read agrees these thirteen assertions are internal
decisions rather than CLI output assertions; primary source inspection confirms the classification. The mixed
no-fix/fix full-span response case remains native, alongside hosted fix convergence, local response replay,
both no-fix settlement cases, persisted settlement idempotence, frontline and explicit CLI refusal/continuation
proofs. Native re-root refusal and successful continuation remain separately exercised.

The footprint is the existing selector, its extracted case-name list, two wrappers and the closing measurement.
The case union remains
thirty-eight: eighteen integration and twenty native E2E cases. Bodies, names, timeout arguments, cleanup and
prepared-template ownership do not change. Static union comparison and both wrapper runs must confirm that claim;
fresh closing measurements decide whether the optimization achieves the unchanged hosted target. No file split
or projected saving is substituted for measured aggregate job work.

Author grounding over the A10 row, `10.R8`, the general decision-tier rule and its source footprint finds no
contradiction. Existing adapters support every producer command in the selected cases; native case bodies retain
the external output and mutation outcomes above. Immediate corrective-task neighbors and closing tasks remain
ordered, with no bound delivery plan or new segment. Reader independence and binding completeness retain the
unchanged case union, external systems and cost criteria. This is author-run evidence, not an independent pass.

The selector's name set moves into `candidate-lineage-cases.ts`, so the existing oversized suite becomes seven
lines shorter instead of growing. `/tmp/arc-a10-union-check.json` verifies identical test bodies, names and timeout
arguments after removing only the selector/import projection, and an exact partition of all thirty-eight names.
The tier change is configuration/refactoring with no added behavioral assertion, so existing proofs run after it;
no newly authored fail-first proof is claimed.

Both Candidate wrappers pass all thirty-eight cases in 97.87 s (`/tmp/arc-a10-candidate-pair.log`). The thirteen
moved cases account for 105 built-CLI launches and 93,229.450239 ms of case time in the retained A9 E2E third
sample; those are historical attribution, not a matched speed comparison or a promised hosted saving.
The ordinary eight-worker routine lane passes 16,732 cases in 1,121 executed files with `FORCE_COLOR=3` in
219.46 s (`/tmp/arc-a10-routine.log`). Both type checks, whole-package typed lint and Markdown/ARC checks pass;
no lint suppression changes. Unchanged build and shell inputs retain their previous passing witnesses.

The ordinary E2E gate passes all 67 files and 686 cases in 177.35 s (`/tmp/arc-a10-e2e.log`). With the thirteen
integration additions, the overall completed-case union is unchanged. The corrective parent closes on its own
coverage and quality evidence; hosted cost closure remains open at Task 10.1 and all local final-head captures
remain required at Task 10.2. A10's revalidation stays pending, and no Success Criteria marker changes.

## Closing measurement at 6284a12a6

Fresh collection binds to `6284a12a6eb6f4b436a4fb0eb769795654363f5f`, with local schema-v4 tier-isolated
captures at twelve workers and hosted dispatch attempt one. All three unit captures pass 13,695 cases, with
wall times 14,737/15,010/14,704 ms. Integration samples 1 and 2 pass; the third and all E2E/lane triplets remain
pending. Artifacts live under `closing-local-a10/` and `closing-hosted-a10/`.

Hosted sample 1, run 37659999690, passes with 13,695 completed unit cases and no half-timeout violation.
Summed test-job time is 1,562 s, below the unchanged 1,712.8 s limit. Sample 2, run 37660822741, is underway;
no five-run median, portability result or final closing acceptance is claimed before collection completes.

## Amendment A11: Repository inventory setup deadline

Hosted sample 4, run 37662415404, fails `Unit Tests (1)` at `6284a12a6`: the `beforeAll` hook in
`command-input/repository-inventory.test.ts` times out at Vitest's 10,000 ms hook default, leaving all twenty-six
cases skipped. Every other required job passes. The complete log, run/job/artifact records and both unit reports
remain under `closing-hosted-a10/4-37662415404/`; no fifth or portability-pair run is dispatched. Samples 1–3
remain three first-attempt passes, with wall times 346/299/331 s and summed job times 1,562/1,748/1,650 s.
They cannot stand for the required five consecutive passes after the failure.

All twelve local captures complete before corrective source changes. Their native paired median is
619,665.218093 ms (45.14508792% below baseline); the E2E summed median is 1,696,340.325063 ms
(39.15437782% below baseline), with wall times 161,620/162,188/162,923 ms and exactly 1,738 CLI launches each.
Those captures remain historical after the timeout-only corrective commit, with no final-head substitution claimed.

The amend-design gate takes the task arm at low depth. § 1 requires named deadlines for heavy real repository work;
the shared `beforeAll` setup was missed. `loadRepositoryCommandInputSnapshot` invokes
`loadCommandInputSourceSnapshot`, which reads the TypeScript tree, traverses CLI-reachable imports, constructs the
prompt index and scans interactions. `buildRepositoryCommandInputInventoryFromSnapshot` then reconciles the actual
command registrations and declarations. The operation is finite source discovery, not an external-host wait.
The equivalent one-shot inventory and documentation scans already use named 30-second deadlines.

Only this hook receives `REPOSITORY_SCAN_TIMEOUT = 30_000`. Its body, immutable snapshot, twenty-six test bodies,
assertions, test deadlines and all tier defaults stay unchanged. Increasing a ceiling adds no fixed wait to a
successful scan. Production source discovery and prompt behavior do not change. The footprint is the unit hook,
its selected coverage and the closing reliability check; local measurement settings and all acceptance targets
remain unchanged. No new behavior or independent review is claimed; this is determinate configuration correction.

Author grounding over A11, `10.R9` and the affected heavy-work statement confirms the actual scanner path and the
existing thirty-second precedent. Reader independence and binding completeness retain the complete inventory proof
and the unchanged reliability/cost criteria. Task neighbors keep the corrective parent before closing measurement;
no delivery plan, segment or other design element changes. All Success Criteria markers remain unchanged.

Static comparison (`/tmp/arc-a11-body-check.json`) proves only the named hook limit changes; setup and all
cases remain byte-identical. Affected unit coverage passes 404 files and 7,800 cases in 9.14 s
(`/tmp/arc-a11-unit.log`), and the direct inventory run passes all twenty-six cases in 8.35 s
(`/tmp/arc-a11-inventory.log`). Both type checks and Markdown/ARC checks pass. The unit-only selection rule applies;
unchanged integration, E2E, full-build and shell inputs retain their preceding passing witnesses. No tier default,
assertion, source-scanning behavior or timeout metadata for ordinary cases changes.

Whole-package typed lint passes without suppression changes (`/tmp/arc-a11-lint.log`). The corrective parent closes
on its own selected coverage; A11 revalidation remains pending at the fresh five-run reliability check. The failed
fourth run is retained, never replaced or counted green, and all final-head measurements remain required.

## Amendment A12: Native Candidate file tail

At `2a98d3856`, all five hosted runs pass on attempt one with 13,695 completed unit cases and no half-timeout
violation. Run IDs are 37664029839, 37664794940, 37665559219, 37666249546 and 37667337053. Wall times excluding
the cache-save tail are 305/319/297/439/335 s; their median is 319 s, 40.92592593% below the frozen 540 s baseline.
Summed test-job times are 1,667/1,835/1,598/1,752/1,730 s; their median is 1,730 s, 19.19663709% below baseline,
missing the unchanged 1,712.8 s limit by 17.2 s. The collector stops before portability dispatch.

All twelve local captures pass at that head. Native paired median is 621,213.653098 ms (45.00801509% reduction);
E2E summed median is 1,708,091.676299 ms (38.73287143% reduction), with 1,738 CLI launches in each sample.
Unit wall times are 14,877/15,041/15,118 ms; integration 166,874/166,260/165,700; E2E
163,486/165,242/162,157; lane 184,033/182,600/183,541. Case counts are 13,695/3,037/686/16,732 respectively.
Those complete observations remain historical after the next corrective commit; none substitutes for its final head.

The bounded advisor read identifies an observable intra-job tail, independently checked against every retained log:
`candidate-lineage.e2e.test.ts` finishes last in its shard, 6.24/13.035/34.263/45.667/35.631 s after the last
other file, median 34.263119 s. This is unused file-parallel capacity inside summed job wall, even when another
workflow job controls total duration. Step timing also locates most time in actual balanced test execution rather
than artifact transfer. The earlier refusal to infer aggregate savings from file size alone still holds; this
new five-run tail evidence supplies the missing basis.

The amend-design gate takes the task arm at low depth: the unchanged hosted aggregate criterion is not produced,
while existing file parallelism and independent repository fixtures supply the mechanism. Only registration splits,
at existing behavioral seams. `registerCandidateLineageSuite` retains serial cases, module-local roots and one
initialized template per file. The correction wrapper selects five frontline/local-response cases, currentness
selects nine lineage/archive/ownership cases, and settlement selects six convergence/composition/replay cases.
The integration wrapper retains its eighteen cases. No case changes tier, body, timeout or native outcome.

`selectsCandidateLineageCase` projects the explicit disjoint native name sets and refuses an unclassified native
case; integration names remain distinct. Three isolated native wrappers give separate fixture and process state,
so `inRepository`'s process directory changes do not gain within-file concurrency. Two added templates/imports
are measured overhead, not claimed free work. Cache source, shard counts, worker policy, admission, isolation,
acceptance targets and every Success Criterion remain unchanged. The footprint is registration and its wrappers,
with fresh closing data required to establish any aggregate saving.

Author grounding over the A12 row and corrective parent confirms the actual serial fixture lifecycle, native
selection sets, and hosted tail timestamps. Reader independence and binding completeness retain all thirty-eight
cases and external outcomes. No delivery plan or new segment appears; prior fixture and tier outcomes remain valid,
and closing measurement stays open. This is a scheduling refactor with existing behavioral proofs, not a new
assertion or an independent review verdict.

`/tmp/arc-a12-union-check.json` confirms exact eighteen/five/nine/six selection and byte-identical test bodies and
case deadlines after removing only registration changes. All four wrappers pass thirty-eight cases in 55.88 s
(`/tmp/arc-a12-candidate-groups.log`); import/setup duplication is included, not excluded. Source inspection and
installed Vitest defaults confirm integration/E2E file isolation. Both type checks, whole-package typed lint and
Markdown/ARC checks pass without suppression changes. The ordinary eight-worker routine lane passes 1,121 files
and 16,732 cases with `FORCE_COLOR=3` in 217.67 s (`/tmp/arc-a12-routine.log`). Unchanged full-build and shell
inputs retain their prior passing witnesses. Fresh closing evidence remains required at the corrective head.

The ordinary E2E gate passes all sixty-nine files and 686 cases in 177.72 s (`/tmp/arc-a12-e2e.log`). The
completed-case union stays unchanged. The corrective parent closes on its own gates and coverage, while A12
revalidation stays pending at the fresh hosted cost measurement; no Success Criteria marker changes.

## Amendment A13: Cold ESLint configuration-load deadline

At `9b3856d4d`, all five hosted runs pass every CI job on attempt one: 37671294422, 37672118170,
37672791138, 37673602736 and 37674420368. Wall times excluding the cache-save tail are
324/285/301/328/295 s; the median 301 s is 44.25925926% below baseline. Summed test-job times are
1,705/1,645/1,736/1,768/1,550 s; the median 1,705 s is 20.36431574% below baseline. The unchanged
hosted cost criteria pass, but the fifth run has one unit half-timeout violation. Its first resolved architecture
configuration case takes 2,716.278498 ms against the 5,000 ms default, exceeding the 2,500 ms headroom boundary.
All 13,695 cases complete in each run; the first four have no violation. Portability is not dispatched.

All twelve local captures pass at that head. Native paired samples are
632,008.633577/627,704.585094/635,671.620851 ms; the median gives 44.05240602% reduction. E2E summed
median is 1,728,540.790237 ms, 37.99938710% below the frozen single ordinary sample; its limited baseline
remains explicit. Unit/integration/E2E/lane wall medians are 14,662/167,261/147,402/182,047 ms. Counts are
13,695/3,037/686/16,732; each E2E sample records 1,738 CLI launches. Complete captures and failed headroom
observations remain under `.test-cost-runs/closing-local-a12/` and `closing-hosted-a12/`; none is replaced.

The amend-design gate takes the task arm at low depth. The retained-heavy-work statement in § 1 already requires
named explicit deadlines. `architectureOptions` calls `ESLint#calculateConfigForFile` on the shared native ESLint
instance. Installed `ConfigLoader#calculateConfigArray` caches the array after the initial dynamic configuration
load; `eslint.config.js` imports `typescript-eslint` and the local architecture implementation, which imports
TypeScript. The first full-file case pays this cold initialization, though source inspection alone does not assign
all observed elapsed time to imports. Its prior four observations are 1,379.987922/1,054.970909/805.232808/
634.349975 ms. This remains the spec's required resolved-native-configuration proof, not a redundant lint pass.

Only this case receives `ESLINT_CONFIG_LOAD_TIMEOUT = 10_000`. Its real load, measured duration and assertion stay
inside the case; no work moves into a hook or outside measurement. Every other body and deadline, the 5 s tier
default, assertion set and outcome stays unchanged. `unit-setup.ts` retains the explicit `task.timeout` in its
artifact metadata. This is a deadline correction, not a performance improvement. A filtered later case can still
pay cold loading; the first-case distinction concerns the required full-file runs. No scheduler, tier or acceptance
criterion changes, and fresh closing evidence remains required at the correction head.

Author grounding over the A13 row, corrective parent and immediate neighbors confirms the native loader path,
metadata projection and existing named-deadline requirement. Reader independence and binding completeness retain
the full architecture composition proof and all closing checks. Forward and backward sweep finds no changed
production behavior, delivery plan or segment. All Success Criteria markers remain unchanged; the advisor's
source-read consultation is advisory, not an independent review verdict. Static comparison at
`/tmp/arc-a13-body-check.json` confirms only the named first-case deadline changes.

## Amendment A14: Retain evidence through a deadline-only correction

The closing data at `9b3856d4d` establish all four unchanged cost bars and five consecutive first-attempt CI
passes. Only the fifth report's first resolved ESLint case exceeds half its old default timeout. Repeating the
five hosted runs and twelve local captures after a deadline-only correction would discard unaffected evidence
without measuring changed work. Direction at the existing stop accepts the correction and retains the evidence,
with one combined confirmation rather than restarting collection. The design arm is determinate at low depth.

The bounded exception names exactly A13: `ESLINT_CONFIG_LOAD_TIMEOUT` changes a deadline argument, while
`architectureOptions`, its native load, every assertion and all other work/deadlines remain identical. The
original violation remains explicit and is never reported as a headroom pass. A14's appended criterion supersedes
only the original final-head/repeated-headroom reliability obligation; cost targets, instruments, settings and
all other criteria remain. One full-suite dispatch at the budget-recording head must pass every job on attempt
one, retain all completed unit cases below half their recorded effective timeouts and pass both Windows/macOS
portability legs. It also confirms the re-recorded budgets. Any further workload change requires new evidence.

Author grounding compares the deadline-only diff with the byte-identical body witness and the retained artifacts;
`unit-setup.ts` projects the current explicit deadline. Reader independence and binding completeness retain the
missing headroom check as a required live confirmation, instead of inheriting it from the old reports. The sweep
covers closing measurement, criterion 2, Tasks 10.1–10.3 and the additive task criterion. The earlier cost
reductions and outcome witnesses are unaffected; no delivery plan or new segment appears. All original Goal and
criterion text and every Success Criteria marker remain untouched. The capture precedes budget recording and
combined confirmation; A14 revalidation stays pending at Task 10.3.

A13's affected unit selection passes 404 files and 7,800 cases in 8.92 s (`/tmp/arc-a13-unit.log`). Both
source/test type checks and whole-package typed lint pass (`/tmp/arc-a13-types.log`, `/tmp/arc-a13-lint.log`),
without suppression changes. Markdown/ARC checks pass after mechanical blank-line cleanup. Unit-only gate
selection applies: unchanged integration, E2E, full-build and shell inputs retain their preceding passing witnesses.
No new behavior or assertion is introduced; existing coverage checks the deadline correction after the change.

## Closing measurement

The retained workload head is `9b3856d4def281d63c6f675fdb123277e109efd3`. A14 permits only the subsequent
A13 deadline correction and budget recording to reuse its observations; the original fifth-run headroom failure
remains a failed reading. Five hosted first-attempt full-suite CI passes and twelve local captures supply the cost
record. Current unit headroom, both portability legs and budget confirmation were subsequently established by the
combined confirmation recorded below. The frozen baseline head is `88fefb20c43ac580855c5a4d0e6f0232a21e1361`;
no new baseline is collected.

Local schema-4 captures use the same tier-isolated instrument and explicit twelve-worker setting. This is comparison
capacity, while ordinary development defaults remain capped at eight. Complete files are in
`.test-cost-runs/closing-local-a12/{unit,integration,e2e,lane}-{1,2,3}.json`; hosted run metadata, jobs, artifacts,
full logs and both unit reports are in `.test-cost-runs/closing-hosted-a12/`. The derived
`.test-cost-runs/closing-summary-a14.json` retains the failed headroom state instead of claiming it passed.

| Project set | Wall samples (ms)           | Wall median (ms) | Summed-file median (ms) | Completed cases |
| ----------- | --------------------------- | ---------------- | ----------------------- | --------------- |
| unit        | 14,752 / 14,591 / 14,662    | 14,662           | 153,145.822198          | 13,695          |
| integration | 166,972 / 167,261 / 169,150 | 167,261          | 1,947,231.788491        | 3,037           |
| e2e         | 148,206 / 147,402 / 146,064 | 147,402          | 1,728,540.790237        | 686             |
| lane        | 182,650 / 181,679 / 182,047 | 182,047          | 2,105,568.683820        | 16,732          |

Native-tooling paired median is 632,008.633577 ms versus 1,129,643.991052 ms, a 44.05240602% reduction.
E2E summed median is 37.99938710% below the frozen 2,787,941.456145 ms baseline. That baseline has only one
ordinary passing sample and no measured noise estimate; three closing samples cannot remove that limitation.
E2E captures have sixty-nine files and 1,738 measured CLI launches each. Capture file counts are
842/280/69/1,122 respectively; completed-case counts agree across each triplet.

| Sample | Hosted run ID | Attempt | Run duration excluding cache-save tail (s) | Summed test-job time (s) |
| ------ | ------------- | ------- | ------------------------------------------ | ------------------------ |
| 1      | 37671294422   | 1       | 324                                        | 1,705                    |
| 2      | 37672118170   | 1       | 285                                        | 1,645                    |
| 3      | 37672791138   | 1       | 301                                        | 1,736                    |
| 4      | 37673602736   | 1       | 328                                        | 1,768                    |
| 5      | 37674420368   | 1       | 295                                        | 1,550                    |

All ten test jobs and every other required job pass in each run. Hosted duration median is 301 s versus 540 s,
44.25925926% lower. Summed test-job median is 1,705 s versus 2,141 s, 20.36431574% lower. All four unchanged
cost bars pass. Every run retains 13,695 completed unit cases; four have no half-timeout violation, and the fifth
has exactly the recorded ESLint cold-load violation. A13 changes its deadline transparently; these reports are never
rewritten to inherit the corrected timeout. The combined confirmation supplies current headroom separately;
these original reports remain unchanged.

### Re-recorded budgets

Four local rows use the retained triplet wall medians and ten CI rows use the five elapsed-job medians, preserving
2/4/4 job coverage. The global allowance is 35%, the smallest multiple of 5% covering every observed value.
Integration shard 3's 237,000 ms maximum exceeds its 178,000 ms median plus 30% (231,400 ms), while 35%
gives 240,300 ms and every other row also contains every observation. Budgets round upward as existing rows do.
The observational allowance changes no test outcome or cost target; budget overage remains advisory.

| Row           | Median baseline (ms) | Budget (ms) |
| ------------- | -------------------- | ----------- |
| unit          | 14,662               | 19,794      |
| integration   | 167,261              | 225,803     |
| lane          | 182,047              | 245,764     |
| e2e           | 147,402              | 198,993     |
| unit-1        | 55,000               | 74,250      |
| unit-2        | 52,000               | 70,200      |
| integration-1 | 218,000              | 294,300     |
| integration-2 | 214,000              | 288,900     |
| integration-3 | 178,000              | 240,300     |
| integration-4 | 196,000              | 264,600     |
| e2e-1         | 175,000              | 236,250     |
| e2e-2         | 214,000              | 288,900     |
| e2e-3         | 227,000              | 306,450     |
| e2e-4         | 200,000              | 270,000     |

`/tmp/arc-budget-observations-a12.json` retains every observation and the median/allowance derivation. Primary checks
bind twelve passed captures and five attempt-one CI passes to the exact retained head, verify both unit reports
per run and the original one-violation boundary, and recompute all four cost targets. Budget recording and combined
confirmation subsequently completed as recorded in
[Closing confirmation](#closing-confirmation-and-implementation-boundary).

Budget-recording gates pass: both type checks, whole-package typed lint, shell lint, full build, full Markdown
lint (750 files), and all three ARC contract checks. The ordinary eight-worker routine lane passes 1,121 files
and 16,732 cases under `FORCE_COLOR=3` in 222.46 s (`/tmp/arc-budget-routine.log`). The one skipped file and
1,188 skipped cases remain excluded from completed counts. Gate logs are `/tmp/arc-budget-{types,lint,shell,
build,full-markdown,markdown}.log`. No suppression changes or further workload changes occur. At this checkpoint,
only the combined hosted recording-head confirmation remained for Tasks 10.1.b and 10.3; its result is recorded below.

## Amendment A15: Windows native fixture continuation

Combined run 37677834734 at `f0285502cc081ff52907122c9505dde4c5373191` passes every Linux job and the
macOS portability leg on attempt one, but Windows has two failures. The full run is failed and never counted green.
Both unit reports retain 13,695 completed cases with no half-timeout violation; the corrected ESLint case takes
1,395.455343 ms with its recorded 10,000 ms deadline. The budget-recording Linux outcomes and current headroom
are confirmed. Full run/jobs/artifacts/logs and unit reports remain in
`.test-cost-runs/closing-confirmation-a14/6-37677834734/`; `unit-headroom.json` records the actual check.

`build-inventory.test.ts` expects the raw empty-directory link target `../empty`, while Windows records
`..\empty`. `captureBuildInventory` correctly retains that raw native target. The fixture should create its
relative target through `join("..", "empty")`; Linux gets the same bytes and all inventory assertions stay intact.
`build-generation-lifetime.test.ts` reaches compiler readiness, kills the owner, reacquires artifact ownership and
then cannot read `compiler-generation-report.json` within fifteen seconds. Its sibling renewal case completes,
so ordinary native generation works. The failure alone proves neither child death nor a broken pipe.

The native schema barrier executes in tsup's `onSuccess`, after its normal bundle/success logging. After release,
`compileCapturedStaging` writes schema, returns from tsup and reads the metafile, and `runCompilerBootstrap` writes
the compiler report. Owner death and replacement ownership do not remove staging. Author traces and advisory
consultation therefore reject a speculative pipe repair, blind deadline increase or skipped outcome.

The next hosted run is one instrumented diagnosis at the same native boundary. On Windows only,
`startBlockedBuildController` writes release/schema-finished markers and synchronous bootstrap-error, uncaught-error
and exit records from its generated compiler. The existing case records child liveness immediately after owner
death and includes liveness and file-backed observations if its unchanged report assertion times out. Observation
handlers preserve the default failure behavior. The Linux generated fixture is unchanged and its passing case
executes no diagnostic filesystem work. A successful diagnosis may close the proof; otherwise the observed cause
gets a bounded repair, with owner death, replacement ownership, report completion, staged runtime and unchanged
live output all retained.

The design arm is determinate at low depth: criterion 22's deadline-only continuation needs a forward exception for
Windows-native fixture assumptions, without invalidating untouched Linux workload evidence. A15's appended criterion
preserves all heads, original failed readings, current unit-headroom proof and every cost threshold. Both portability
legs still must pass current native assertions. Author grounding covers native path representation, the real compiler
barrier/report ordering, diagnostic failure-only execution and immediate task neighbors. Reader independence and
binding completeness retain the unresolved Windows proof rather than asserting a repair not yet established.
Forward/backward sweep finds no production, Linux scheduling, budget or delivery change. All original Goals,
criterion text and Success Criteria markers remain untouched; no new segment or speculative mechanism is selected.

The raw-path correction and passive diagnostic fixture pass both local native files, fifteen cases in 7.37 s
(`/tmp/arc-windows-fixture-local.log`). The eight-worker routine gate passes 1,121 files and 16,732 cases with
`FORCE_COLOR=3` in 228.49 s (`/tmp/arc-windows-fixture-routine.log`). Both type checks and whole-package typed
lint pass, including the final PID-bearing observation strings, without suppression changes. Unchanged full-build
and shell inputs retain their recording-head witnesses. Markdown/ARC checks cover the amendment and this record.

A temporary ESM probe enables the Windows observer generation on Linux, then runs the same real owner/compiler to
normal completion. It records release observed, schema finished and zero-code exits with process IDs
(`/tmp/arc-windows-observer-probe-final.log`). This validates generated observation syntax and normal failure-neutral
execution, not Windows child survival. A static comparison confirms Linux's generated native fixture stays
byte-identical and the unit fixture changes only its native path construction (`/tmp/arc-windows-fixture-delta.json`).
Every native assertion and deadline remains unchanged. The compiler's Windows cause is still unresolved; the
instrumented hosted dispatch is required before selecting a repair or closing the corrective parent.

Instrumented run 37681430303 at `4c9e3c5b9892ed45f55468e04a425ac5984ed878` again passes Linux and macOS,
and the raw-link case now passes Windows. The only failure is the survivor case: compiler PID 7012 is unavailable
immediately after confirmed owner death (owner PID 8972) and at report timeout; no release, normal exit or uncaught
record is written. These are failed PID probes, whose original error codes were not retained, rather than a claimed
Win32 error classification. Complete failed-run records remain in
`.test-cost-runs/windows-fixture-diagnosis-a15/6-37681430303/`; no replacement sample or greener result is claimed.

The hosted Windows version is Node v24.21.0. Primary source confirms `uv__init_global_job_handle` puts non-detached
`uv_spawn` children in its per-process Windows job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; killing the Node
owner closes that private handle and terminates its compiler child. `UV_PROCESS_DETACHED` bypasses this assignment,
while `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK` permits Node's own children to create detached descendants. This does
not guarantee escape from arbitrary outer runner jobs. See
[the exact bundled libuv source](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/win/process.c#L69)
and [Node's detached-process contract](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html#optionsdetached).
Node's actual `execFile` implementation does not forward detached/stdio options to `spawn`, so adding those options
to the existing invocation would not arrange the precondition.

Only the Windows survivor fixture requests `startBlockedBuildController(true)`. Its copied compiler launch boundary
uses real `spawn` with the same binary, arguments, cwd and environment, `detached: true` and file-backed output.
The real compiler bootstrap, sources, staging destination and artifact-owner logic remain. The fixture awaits actual
exit during ordinary completion and retains nonzero output in its rejection. The ordinary renewal case uses the
production launch path; production code and Linux's generated fixture remain unchanged. This arranges a genuinely
surviving child, without claiming production Windows children normally survive their parent's death.

The case additionally asserts immediate Windows child liveness after owner death. All existing assertions and
thirty-second case/fifteen-second observation deadlines remain. The copied launcher replacement preserves trailing
source rather than discarding everything after the method. It records the actual compiler PID at launch, and a
bounded caller-owned cleanup terminates an unfinished detached compiler before fixture removal; completed exit
records avoid unnecessary termination. Nonzero-exit diagnostic reads cannot throw outside the promise rejection.
File-removal retries accommodate Windows handle closing. These controls complete the owned detached resource's
cleanup rather than weakening the native proof. Advisory source review surfaced those two concrete cleanup/error
pitfalls, which primary inspection confirmed and corrected; it is not an independent review verdict.

A real-process probe of the generated detached launcher on Linux forces the Windows fixture construction, kills
its real owner, acquires replacement artifact ownership, releases the schema barrier and verifies the actual report,
staged new runtime and unchanged live output. The compiler exits normally and cleanup completes
(`/tmp/arc-windows-survivor-probe.log`). This validates the launch implementation and fixture ownership mechanics;
the next hosted Windows run still must establish the platform-specific outcome. No timeout increase, platform skip,
production launch change, new Linux sampling or budget change is introduced.

The final launcher and bounded cleanup pass both type checks and whole-package typed lint without suppression edits
(`/tmp/arc-windows-survivor-types.log`, `/tmp/arc-windows-survivor-lint.log`). The eight-worker routine lane with
`FORCE_COLOR=3` passes 1,121 files and 16,732 cases in 222.98 s (`/tmp/arc-windows-survivor-routine.log`). The final
real detached-launch probe preserves staging and live-output assertions and observes normal compiler exit
(`/tmp/arc-windows-survivor-probe-final.log`). A separate blocked-compiler probe invokes owned cleanup, verifies
actual compiler termination and predictable owner rejection, and retains live output
(`/tmp/arc-windows-survivor-cleanup-probe.log`). These probes exercise actual processes on Linux; current Windows
portability remains the outstanding platform witness. Unchanged full-build and shell inputs retain their earlier
passing witnesses. Closing cost observations and advisory budget rows are preserved under A14/A15.

### Closing confirmation and implementation boundary

Run 37686035937 at `a916d0e1a33dfab99caf0f029d6fd058f2b0ad50` passes all nineteen jobs on its first attempt,
including the ten Linux test jobs and both current Windows/macOS portability legs. Each targeted portability run
passes twenty-eight files and 252 cases, with the two existing skipped cases unchanged; the macOS-specific lane
also passes fourteen files and 119 cases. Both platforms execute and pass the two real build-generation lifetime
cases and thirteen inventory unit cases. Windows now establishes actual compiler survival, replacement ownership,
completed compiler report, new staged runtime and unchanged live runtime under the original deadlines.

Complete run/jobs/artifact records, full logs and both unit reports are retained in
`.test-cost-runs/closing-portability-a15/6-37686035937/`. The reports contain 13,695 completed unit cases and zero
half-timeout violations, independently confirming the prior recording-head witness. The budgets are byte-identical
to their recording at `f0285502c`. This single combined confirmation closes current portability and unchanged test
outcomes; it is not substituted into the retained five-run cost medians or used to erase either failed Windows run.

A14/A15 preserve the exact five hosted cost passes and twelve local captures at `9b3856d4d`, the original fifth-run
ESLint headroom failure, the corrected recording-head unit witness, and both failed platform attempts. No five-run
restart or local resampling follows the fixture repair. The retained reductions remain 44.05240602% native-tooling,
37.99938710% E2E summed file time, 44.25925926% hosted run duration and 20.36431574% summed test-job time. The
single-sample E2E baseline limitation stays explicit. Fourteen budget rows retain the derived 35% advisory allowance.

Tasks 10.R13, 10.1.b, 10.1 and 10.3 close on this effective evidence. A5 and A9–A15 are revalidated at their recorded
closing tasks. At the implementation handoff, phases 1–10 were complete; phase 11 verification and every Success
Criteria marker remained untouched, with Candidate preparation, independent review and integration outside that
deferred execution scope. The default local worker cap remains eight, with explicit overrides and the heavy-run
admission lock preserved.

## Verification evidence

This is author-side work-unit verification, not independent code-review evidence. The complete flat Success Criteria
section of `tasks-test-suite-reliability.md` is the selected scope; there is no Delivery Plan. The upstream spec and
all amendments are compared against the complete change set and reachable tree. Every entry below binds the
immutable criterion by its 1-based ordinal under `Success Criteria` and the SHA-256 of its parsed text, excluding
checkbox state and Markdown layout. No criterion is rewritten.

### Shared evidence span

- **Diff:** `c009ab1984cae0da2b9a61104c6842dc749824ef` through
  `826973800f47af332909d5f4de8aa291960f3785`, covering all 257 changed paths.
- **Reachability:** the complete tree at `826973800f47af332909d5f4de8aa291960f3785`,
  `80f1a8bafcc0c27521167610b3af34ad255e35d0`.
- **Boundary-order deviation:** none. Subsequent verification edits affect this notes file and the task list;
  Candidate attestation supplies its managed projection. These edits preserve source, test and measurement inputs.
- **Artifact paths:** `.test-cost-runs/` paths in this record are relative to `packages/arc-framework/`.

### Author preflight and proof boundaries

The author aggregate preflight establishes no finding requiring a source change. Read-only inventories cover all
180 changed test/helper sections and all 44 production prompt-migration paths; primary source inspection resolves
native-to-direct witness mappings, changed assertion authority, source-predicate equivalence, prompt policy, fixture
independence and the Windows continuation. These inventories support author judgment and carry no independent
review verdict. Production/tooling/configuration and documentation seams are included in the aggregate walk.

The Candidate scenario registration functions compare byte-for-byte with the baseline. Their exact 38-case union
remains partitioned into 18 integration and 20 native E2E cases, with native groups of 5/9/6. Other narrowed native
matrices keep explicit direct witnesses and real representatives for distinct native outcomes; recorded deletion
verdicts identify compiler, lint or narrower behavioral authority. Passing counts alone are not used as preservation
proof, and independent review still must examine the complete transformation.

Retained executable negative controls establish that material regressions produce failures: bypassing per-file
esbuild ownership fails the native guard proof (`/tmp/arc-unit-guard-service-bypass-valid-red.log`); erasing restored
duration inputs fails preservation (`/tmp/arc-duration-preservation-red.log`); degrading prompt publication authority
to a silent save-only result fails sync behavior (`/tmp/arc-sync-prompts-red-corrected.log`). The corresponding
restored implementations pass the fresh final routine gate. These existing checks establish sensitivity without
another repository-wide mutation campaign.

Fresh serial Tier 3 at `826973800` passes Markdown, all three ARC contract checks, whole-package typed lint, shell
lint, both source/test type programs, the ordinary routine lane and full declaration build. With `FORCE_COLOR=3`
and no worker override, routine execution completes 1,121 files and 16,732 cases in 227.34 s; one file and 1,188
cases remain skipped. Logs are `/tmp/arc-verify-final-{markdown,triggers,domain,sections,lint,shell,types,routine,
build}.log`; `/tmp/arc-verify-final-gates-passed.txt` records every command's zero exit. Markdown/ARC checks run again
over the verification-document delta. Required E2E and native portability retain run `37686035937` at `a916d0e1a`;
no later source change invalidates that witness.

Primary recomputation (`/tmp/arc-verify-measurement-check.json`) checks all twelve local captures, five exact-head
first-attempt hosted cost passes, original headroom violation, all fourteen budget medians and exact upward rounding,
minimum covering allowance, four unchanged cost targets and current 13,695-case zero-violation unit confirmation.
Original reports are preserved. The single ordinary E2E baseline lacks a noise estimate. Windows/macOS behavior is
proven by native hosted legs; Linux construction probes alone are not treated as Windows proof.

The optional fresh-context verification adversarial pass was offered and declined. The primary walk closes on
empirical evidence and explicit forward amendments. Independent code review will use local delegated agents with
contract-cohesive chunks, complete union coverage and a dedicated seam; it remains separate from verification.
No essential implementation intent is deferred or left without an owner. The post-merge cache-seeding operation
recorded under Layout trial remains an operational follow-up at integration, not a completed measurement claim.

### Criteria report

**Disposition:** 31 criteria — 27 met, four superseded, none unresolved.

- **Success Criteria > 1** — `[~]`
    - **criterion-digest:** `sha256:2f69bca590298895d5eb0c94aac5bdca1e7406b5aec4bbe119aaeb5272030661`
    - **Evidence:** A1 replaces original baseline sampling with criterion 23; retained hosted unit duration/timeout
      uploads are established in CI configuration and the raw unit reports.

- **Success Criteria > 2** — `[~]`
    - **criterion-digest:** `sha256:bf08e54699879d05c6cd3b37102cc8f54f1496b1112c2a4788d69be08445ec6f`
    - **Evidence:** A14 then A15 replace the original final-head five-run/headroom demand with criterion 31. Five cost
      passes remain at 9b3856d4d; the fifth original headroom violation is retained.

- **Success Criteria > 3** — `[x]`
    - **criterion-digest:** `sha256:c948e87e4e913290a2315a14a9cce5f888bed3f0c3a77efbac8ae94f5f5a8cc2`
    - **Evidence:** Run 37686035937 at a916d0e1a passes both native portability legs on attempt one. The later 826973800
      commit changes only the closing documentation.

- **Success Criteria > 4** — `[x]`
    - **criterion-digest:** `sha256:c502fa8b4f0f8bd51991e84e9f7dabe93bd764b44e0cc88076392043a3536643`
    - **Evidence:** Fresh final routine gate at 826973800 completes 16,732 cases under FORCE_COLOR=3 and the ordinary
      eight-worker default. copy-live-tree.test.ts proves transient bundled-file exclusion and untracked-module copying.

- **Success Criteria > 5** — `[x]`
    - **criterion-digest:** `sha256:09e9c44822ce0e619ffff031c4cf3ff594bb7715bae8db630f5f1a8ed9ebe6a5`
    - **Evidence:** Retained unit/integration triplets recompute to native median 632,008.633577 ms versus
      1,129,643.991052 ms: 44.05240602% lower, using the frozen native-family prefix set.

- **Success Criteria > 6** — `[~]`
    - **criterion-digest:** `sha256:201f0201f65cd15dd1928682218b2f636ce05013aa7ad9fd4f276f2f5f55b39c`
    - **Evidence:** A1 replaces the original three-sample E2E baseline comparison with criterion 24; one ordinary frozen
      success supplies the baseline and its missing noise estimate remains explicit.

- **Success Criteria > 7** — `[x]`
    - **criterion-digest:** `sha256:f12542374e5bc87e0fd4f17929e420ad3dfbff59541b4346d273cf587e88440a`
    - **Evidence:** Five exact-head attempt-one closing runs have durations 324/285/301/328/295 s; median 301 versus
      frozen 540 s is 44.25925926% lower.

- **Success Criteria > 8** — `[x]`
    - **criterion-digest:** `sha256:9be5cfb38a716581aa2377094644fdac1b88eb56e7c2d45b35c81938d92d6a7a`
    - **Evidence:** Their summed ten-job durations are 1705/1645/1736/1768/1550 s; median 1705 versus frozen 2141 s is
      20.36431574% lower.

- **Success Criteria > 9** — `[x]`
    - **criterion-digest:** `sha256:6fbfe795be0a4e08cf22625d5a3ece25e92383b16a0a7d262da90fbd09c9e2cd`
    - **Evidence:** Layout trial records three references and two counted runs per source. Both sources meet the
      adoption bar; cache wins 350 versus 351.5 s. Current CI has literal 2/4/4 matrices, one handed input and writer-
      only persistence; losing selectors, weights and anchor readers are absent.

- **Success Criteria > 10** — `[x]`
    - **criterion-digest:** `sha256:fb6e5b714a5d02a205c4f137c03ea023970414c3d40cda530f1427b0ec132f54`
    - **Evidence:** Fresh recomputation from twelve local captures and five hosted job records matches every median and
      all fourteen rows. Exact decimal upward rounding uses the minimum global 35% allowance; integration-3 exceeds 30%.
      test-cost-budget.test.ts and native annotation logs prove advisory warning text includes baseline and budget.

- **Success Criteria > 11** — `[x]`
    - **criterion-digest:** `sha256:dcd6f71d9c46b4eb4aa4f203c1262b8050419599402fb080c93ba8a38d03ab75`
    - **Evidence:** unit-process-guard native integration proofs cover both unit projects, caught launches,
      named/promisified/execa paths, allowlisted admission, per-file esbuild service ownership and reporter-independent
      zero-launch floor. Final routine passes their composed controller path.

- **Success Criteria > 12** — `[x]`
    - **criterion-digest:** `sha256:c92780bd07ebdc629ffa4c3d7a8badb4e5261d90a0605bccc8aede969d7a63f0`
    - **Evidence:** eslint.config.js composes the one-hop predicate table. Native architecture rules preserve relative
      resolution and exceptions; replaced scans are removed. Tasks 3.2/4 and native-file/source-scan/change-detector
      note inventories record each retained, moved, replaced or retired witness.

- **Success Criteria > 13** — `[x]`
    - **criterion-digest:** `sha256:1a32a5eada13cfb69b67b0588a093201dd0d6e3394d2c3d7538ca98ef9dbfe2b`
    - **Evidence:** dev-check.ts accepts only matching token, test-controller operation and unexpired classified lease.
      dev-check-managed.test.ts covers build holders, mismatch/missing token, expired/deadline/no lease and
      absent/empty/corrupt/unreadable reads; native guard/child cases retain refusal and repair continuation.

- **Success Criteria > 14** — `[x]`
    - **criterion-digest:** `sha256:d0e6bd2e38c4b69596c0025da12f0d2588cfa2439f1ffad50be3a0375ce36df7`
    - **Evidence:** Only command-input/prompt-renderer.ts and terminal.ts import @clack/prompts. The native ESLint
      restriction and repository inventory run in final lint/tests; command callers use declarations and terminal
      presentation.

- **Success Criteria > 15** — `[x]`
    - **criterion-digest:** `sha256:a7252dd71ab766380d8a906a0392660c5c8383ef5b45d854518b47c403813caa`
    - **Evidence:** Complete prompting-production diff and declared-site inventory show every acquisition invokes the
      shared prompter. Remaining interaction branches render reports or diagnose availability; explicit inputs enter
      explicitAnswer. The no-input matrix and unit handler witnesses cover the migrated sites.

- **Success Criteria > 16** — `[x]`
    - **criterion-digest:** `sha256:8728dab525bb23ca6b25b58c456877142dade5bee1bd8e5a436413aa9b132fe8`
    - **Evidence:** Real prompter unit tables use fake renderers across default, require-explicit, refuse, proceed and
      require-authority, resolved/refused/cancelled results, and stop/safe-default cancellation. Final routine executes
      these tests.

- **Success Criteria > 17** — `[x]`
    - **criterion-digest:** `sha256:b75b557439f68b8d3b2b9d8f989d2e8e04279388305adddd281489a20e5a9115`
    - **Evidence:** Handler/unit and native command-context matrices cover output and exit behavior. Tasks 9.1–9.6 and
      their notes record intentional name/identity, missing-syntax, notes-publication authority and release-install
      drift; cancellation and decline remain non-mutating.

- **Success Criteria > 18** — `[x]`
    - **criterion-digest:** `sha256:c8d4f6fdcba9f8cd0ae8a69329c1bc4d9d229ef21eeba022a038271f730dfab7`
    - **Evidence:** Branded declaration constructor and contradiction unit/type proofs reject unsupported policies,
      empty required syntax, invalid form-policy pairs and invalid cancellation while preserving false/empty explicit
      values.

- **Success Criteria > 19** — `[x]`
    - **criterion-digest:** `sha256:29bfa9da55ac9343ce1b6523f3ccaceffd157726ec9d9924dcbe9e5991162259`
    - **Evidence:** Frozen branded exported declarations are the only accepted prompt argument. Scanner/inventory cases
      cover aliases, wrappers, duplicates, shadowing and dangling declarations; type checking rejects unbranded values.
      Migration task records preserve every intentional drift.

- **Success Criteria > 20** — `[x]`
    - **criterion-digest:** `sha256:ec6ce02c18e9dd30b96bbb83150f4b6aaa4b6b7dced7cb480d5f150d885f50a1`
    - **Evidence:** testing-standards project override, strategy-testing-methodology.md, DEV-RULES.PROJECT and
      TECHNICAL-OVERVIEW §4 agree on unit doubles, native integration, routine lane and required hosted E2E/portability.

- **Success Criteria > 21** — `[x]`
    - **criterion-digest:** `sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c`
    - **Evidence:** Fresh serial Tier 3: Markdown, all three ARC contracts, whole-package typed lint, shell lint, both
      type programs, ordinary FORCE_COLOR=3 routine lane and full declaration build all exit zero. Required E2E and
      portability retain current all-green hosted confirmation.

- **Success Criteria > 22** — `[x]`
    - **criterion-digest:** `sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f`
    - **Evidence:** Execution and criteria are closed for Candidate preparation. Independent Candidate review,
      publication/admission and explicit exact-head integration authorization remain separate prerequisites; this
      criterion grants no merge authority.

- **Success Criteria > 23** — `[x]`
    - **criterion-digest:** `sha256:fa963d7a87aa30484eb6bfaac777001626b2e1f3c2fc8a79a2d3141ef14e8904`
    - **Evidence:** Frozen evidence at 88fefb20c records ordinary/failed/unstarted attempts and sample limits. History
      places baseline-record commit eca93f4e3 before first optimization 2ea041425. Diagnostics stay excluded; raw
      captures and hosted duration/timeout reports are retained.

- **Success Criteria > 24** — `[x]`
    - **criterion-digest:** `sha256:e4630f7ccb024d525d0236123af98cfd1eb6e83add235fcd8962275945bc3548`
    - **Evidence:** Three closing E2E samples yield median 1,728,540.790237 ms versus the single ordinary frozen sample
      2,787,941.456145 ms: 37.99938710% lower. No baseline variance/noise estimate is claimed.

- **Success Criteria > 25** — `[x]`
    - **criterion-digest:** `sha256:4493ab29a9a7f82f8163b39add8ee19b328da6ccb1bd9bfedc158f1e46711e34`
    - **Evidence:** A2 changes only two named refusal-source-totality deadlines to 10,000 ms. Frozen hosted maxima
      2550.469 and 2284.781 ms give 3.4× maxima below 10,000; source/assertion bodies stay intact.

- **Success Criteria > 26** — `[x]`
    - **criterion-digest:** `sha256:494f71f48cfc348574ddc485bb943002305a42a3e097b9af7f244901e42b5990`
    - **Evidence:** Native ESLint equivalence proofs and composed-config tests cover aliased loaders, inline factories,
      relative targets, type-only/eager exceptions, valid lookalikes, approved kernel packages and Result/store seams.
      The configuration unions matching predicate IDs; retained RED controls precede scan replacement.

- **Success Criteria > 27** — `[x]`
    - **criterion-digest:** `sha256:c5bdde61f87cbe3c69c69e5bed6c64ffb5bfbc437f1a46bfc13a7694f1b3a8a6`
    - **Evidence:** command-input-no-input.e2e.test.ts reaches own-command default/refuse/proceed/require-authority
      sites. Indeterminate start has direct handler/prompter proof and distinctly labelled upstream native refusal with
      refs/worktrees/tracked state preserved; no native prompt-reach claim is made.

- **Success Criteria > 28** — `[x]`
    - **criterion-digest:** `sha256:e68942a202b9f85fa8d6eb55d674b5aeb7247821b2f34c52e812c1d3451fda49`
    - **Evidence:** copy-live-dependencies.ts resolves the current dependency graph and explicit loader roots on every
      copy, including dirty/untracked modules; cached parsing binds exact source bytes only. Independent copies preserve
      actual compiler/controller/qualification/recovery proofs and missing/escape failures.

- **Success Criteria > 29** — `[x]`
    - **criterion-digest:** `sha256:3cebe4887a43a6cb4cd74069bb7cf8b7e2fcdc87c84d6d0a638f307c29fcc518`
    - **Evidence:** Worker-policy tests prove floor one, half parallelism, local cap eight, explicit numeric/percentage
      overrides and CI native sizing. Fresh ordinary routine gate passes at cap eight; heavy admission lock remains
      unchanged.

- **Success Criteria > 30** — `[~]`
    - **criterion-digest:** `sha256:8342a0a309d00ecfceddd0892ffde073e3c7da4e4b29e3d4bbf9f6b9efa8bcce`
    - **Evidence:** A15 replaces A14’s deadline-only confirmation restriction with criterion 31 after native Windows
      fixture failures. A14 cost preservation, original failure and budget derivation remain valid and unchanged.

- **Success Criteria > 31** — `[x]`
    - **criterion-digest:** `sha256:3de12fbdd5d467cb19260eb4b67d5fbaa4fd134a9f0744f17374941d2ed4eb43`
    - **Evidence:** A15 retains all five Linux cost passes and twelve captures at 9b3856d4d, plus f0285502c unit reports
      with 13,695 cases and zero half-timeout violations. Windows-only real detached compiler fixture repair at
      a916d0e1a passes both native legs in 37686035937; failed 37677834734 and 37681430303 attempts remain recorded.

Integration readiness here means execution verified for Candidate preparation. Independent review, publication,
host admission and explicit exact-head integration authorization are still required. Verification grants no merge
authority and is not a satisfying independent-review result.

## Amendment A16: review-correction confirmation

The approved six-finding review response changes Linux guard/scanner behavior and the native refusal fixture, so
A15's unchanged-Linux exception cannot describe this correction. The design arm is limited to closing evidence,
with low derivation depth: retain measured historical improvements and confirm the corrected workload once.
Superseded closing-measurement text:

> **Windows fixture continuation (A15).** The Linux closing observations and recording-head unit headroom remain
> valid through platform-native fixture corrections and Windows-only failure diagnostics. Preserve their exact heads
> and outcomes; Linux workload, assertions, deadlines, shard layout and worker policy remain unchanged. A failed
> Windows leg is never counted as a portability pass. Repair the actual Windows fixture failure and confirm both
> portability legs with current native assertions; a further full-suite dispatch may also confirm unchanged Linux
> outcomes, but does not restart the five-run cost sample or twelve local captures.

The twelve local captures and five first-attempt hosted passes at `9b3856d4d`, original headroom violation,
recording-head witness at `f0285502c` and pre-review portability run 37686035937 at `a916d0e1a` remain historical
exact-head evidence. They do not measure the corrected workload. Acceptance bars, medians, fourteen budgets,
worker/shard policy, budget formulas and deadlines remain unchanged. A16 appends spec criterion 24 and task
criterion 32; the original criterion 23/31 text remains intact and is superseded. Current local gates and the
single corrected-head hosted confirmation remain pending until their actual results are recorded.

### Approved review corrections

Complete disposition set: `sha256:3ec1dd18e899c16498b710693f696b86cbc794f3079ff8139a91df652579e7ae`.
All six findings were approved FIX with full verification; one incremental local delegated standard pass 2 was
separately authorized. No hosted review or repeat five-run/twelve-capture measurement batch is authorized here.

- `cc0f52386`: explicit tools arguments preserve note/Selected presentation; four initial regression failures,
  then all sixteen presentation cases pass.
- `410c049b6`: missing fixture-local origin removes DNS/proxy timing; all 81 native no-input cases pass with
  existing diagnostics and repository-preservation assertions.
- `25ca8079a`: actual ESLint rejects dynamic Clack imports outside both owners; two initial failures, then 97
  selected config/lint cases pass, including exceptions and overlapping architecture restrictions.
- `e17055960`: namespace discovery and concrete declaration provenance close inventory gaps; five initial
  failures, then all 128 selected command-input cases pass, preserving aliases, wrappers and shared commands.
- `21530ff27`: native runner finalization covers returned beforeAll cleanups, file fixtures, aroundAll and
  afterAll. All six new native regression cases fail before correction and pass afterward across both unit
  projects and list/stack/parallel hook ordering; fifteen selected guard cases pass, including existing esbuild
  service ownership. Final metadata is published before native task updates flush.

Each correction passed targeted TypeScript lint and both whole-program type checks, then normal commit hooks.

### Corrected implementation local gates

At code head `21530ff27`, full Markdown lint, all three ARC contract checks, whole-package TypeScript lint,
shell checks, both whole-program type checks, the ordinary routine lane and full declaration build pass. The
routine lane completes 1,121 passing files and 16,757 passing cases, with one file and 1,188 cases intentionally
skipped, in 226.66 seconds using the unchanged local worker policy. Build artifacts qualify. Hosted confirmation
and task criterion 32 remain pending. Targeted logs and full gate output are retained under
`/tmp/arc-test-suite-review`; this local result supplies no independent review conclusion.

### Current corrected-head hosted confirmation and criteria closure

Run 37698035019 at `84d17b343de3a7683dfdd346e5691dc6deca9d73` completes on attempt one with overall success:
seventeen applicable jobs pass; the two PR-only rollups (`ci-ok`, `merge-ok`) are event-disabled for this dispatch.
Both unit shards, all four integration and four E2E shards, lint/types, setup, classification, Linux portability,
both native portability legs and duration merge pass. Each Windows/macOS leg completes 28 files and 252 cases with
two intentional skips; macOS's additional guard selection completes 14 files and 119 cases. All ten CI-job budget
comparisons are within the unchanged limits. Their summed budget clocks are 1,585,009 ms; this is one confirmation,
not a replacement cost sample or a revised median.

The two native unit reports retain 13,707 completed cases, effective timeouts and launch metadata. Every completed
case is strictly below half its effective timeout; all 13,624 off-allowlist cases record zero launches, with no
missing metadata. The tightest case is 2,237.230588 ms against its 10,000 ms deadline. Reports, the native run/attempt
records, job logs and derived headroom/launch/budget checks are retained at package-relative
`.test-cost-runs/closing-review-a16/37698035019`.

The earlier explicit raw-push authorization was used with normal hooks to make the committed correction available
for this approved hosted verification. The performed Candidate response waits for these actual results rather than
recording the pending confirmation as complete. No source, scheduling, timeout or budget inputs changed afterward.

The primary correction criteria walk preserves all thirty-one existing criterion digests and appends only criterion
32: `sha256:b925fd04798dfe5f314d5305406d357caf610f6c40da89a6aaf39734f716b0f1`. Criterion 31 is superseded by A16;
criterion 32 is met by the focused fail-first proofs, full local gates, run 37698035019 and its retained reports.
The effective thirty-two-criterion report is twenty-seven met, five superseded, none unresolved. Historical cost
criteria remain tied to their measured heads and sample limits; this confirmation makes no new median claim.
Current launch admission (11), one-hop/Clack confinement (12/14/26), presentation (17), exported declaration identity
(19), quality gates (21), native no-input proof (27) and worker sizing (29) have supplemental correction evidence.
The full prior criterion report remains in § Verification evidence; its immutable bindings and unaffected evidence
carry forward, while the affected boundaries were inspected against the correction and current reachable tree.
Primary-only verification remains the approved choice. Candidate advancement and incremental independent standard
review remain pending; this criteria result supplies no evaluator or merge authority.

## Standard-review pass 2 corrections

The completed incremental delegated pass at `c9424b1fa` covered all seventeen changed paths, six closure scopes,
the dedicated seam and fresh aggregation. Three source-confirmed major findings were approved FIX with full
verification in disposition set `sha256:fc31ce2ffc08378436c36be4147273f2c44618c46d59bcda4ab19ac5fc269d5b`.
One further incremental delegated standard pass 3 was separately authorized above the configured two-pass ceiling.
Its conditional allowance is `sha256:cbc0209003d9956ffec86590deb5c017940f31c5e7c95d021833586df5c701e9`;
it authorizes only that named pass, not publication or merge.

- `7594c4430` closes literal namespace element discovery and refusal. Five new cases fail before the correction;
  all 133 command-input cases pass afterward. Namespace fixtures use the actual declaration and prompter exports.
- `6936341e4` applies the existing binding-aware module reference collector to the Clack row. Three supported
  template/named/inline-loader cases fail before correction. Narrow reconstructions also make both owner exceptions
  and the harmless returned-loader case fail; restoration passes all 113 native/configuration cases. The predicate
  joins the existing composed table without changing other restrictions.
- `fc33590b6` finalizes file admission through native before/after-suite hooks without replaying completion.
  Reconstruction of the previous runner fails all twelve module-completion comparisons and the aggregate count.
  The corrected runner passes all eleven native guard cases and five guard-core cases, retaining the four late
  teardown forms, three hook orderings and both unit projects. Native skipped labels remain native; a caught
  collection refusal still retains failed admission through the module's `ok()` result and counted attempt.

Each atomic correction passes targeted lint, both type programs and normal commit hooks. The amendment entry gate
selects the ordinary review-fix path: existing native-preservation, identify-or-refuse and owner-confinement outcomes
already require these corrections. No criterion, deadline, worker default, shard layout or budget is changed.
The original setup-afterAll mechanism described in the spawn-guard design is realized by native suite hooks instead;
the late-teardown outcomes and final launch accounting remain the required contract.

The normal-hook raw push uses the standing explicit authorization for hosted verification. Full ordinary local gates
pass at `fc33590b6bbb27c4a44fc6e9da3e2233cc75cd06`: Markdown, all three ARC checks, whole-package typed lint,
shell checks, both type programs, 1,121 passing files and 16,769 passing cases with one file and 1,188 intentional
case skips, and the full qualified declaration build. Routine duration is 235.36 seconds at the unchanged
eight-worker default; this single confirmation does not replace the measured cost sample.

First-attempt hosted confirmation 37703453112 at the same correction head succeeds. All seventeen applicable jobs
pass, including both native portability legs; the two PR-only rollups are event-disabled. Both unit shards retain
13,712 completed cases strictly below half their effective timeouts and 13,629 off-allowlist cases with zero
launches, with no missing metadata. The tightest case is 2,472.734604 ms against its 10,000 ms deadline. All ten
CI-job comparisons are within the unchanged budgets; summed budget clocks are 1,508,513 ms. Native run/attempt
records, job logs, unit reports and derived checks are retained at package-relative
`.test-cost-runs/closing-review-pass2/37703453112`. Historical captures and confirmations retain their original
heads; no five-run or twelve-capture measurement batch is repeated.

The primary criteria walk retains all thirty-two immutable criterion identities: twenty-seven met, five superseded,
none unresolved. Existing historical color/cost evidence remains head-bound; the affected admission, confinement,
declaration and current-confirmation criteria have fresh supplemental proof. Primary-only verification remains the
approved choice. Candidate response and independent incremental standard pass 3 remain pending; this verification
does not supply an evaluator conclusion or merge authority.

## Standard-review pass 3 corrections

The incremental delegated pass at `8985cae76` covers all nineteen admitted paths, six closure scopes, the dedicated
seam and fresh aggregation. Its two source-confirmed findings are approved FIX with full verification in disposition
set `sha256:bb84572e1e26ff16394f33d4415564bc98afb07190aee52d24034bdbf259a9fe`: one major prompt-discovery gap and one
record-only minor loader-provenance false rejection. Incremental local delegated standard pass 4 is separately
authorized above the configured two-pass ceiling. Its single-use conditional allowance is
`sha256:3790ec21ba930df73d12ea820c19c149b7d48bb3e4024569f196c9273349cdf0`; no later pass, publication or merge is granted.

- `1eb48500c` refuses unsupported references to canonical prompt imports instead of guessing additional key spellings.
  Module-local syntax binding distinguishes genuine imports from shadowing locals. Computed namespace members,
  escaping factory/prompter values and additional facades refuse; named imports, literal members, concrete declaration
  provenance and wrapper pass-through remain supported. Thirteen primary refusal/shadowing cases and two additional
  facade cases fail before their corrections; all 160 selected command-input/confirmation cases pass afterward.
  Both existing sync-output adapters now call the prompter explicitly with their site parameter rather than passing
  its function value through. This is required caller completion, with output and confirmation semantics preserved.
- `b4b8b716f` resolves actual Node factory imports and returned loader declarations by lexical identity. Eight harmless
  method/shadowing cases fail under the previous collector; a narrow namespace-support reconstruction fails both
  real namespace/default acquisition cases. Restoration passes all 160 architecture cases, including named, inline,
  namespace/default loaders, both exact owners and composed restrictions. The earlier collector's property-name and
  module-wide spelling recognition did not establish lexical Node provenance; this correction supplies that fact.

Both corrections pass targeted lint, both type programs and normal hooks. The module-local lexical helper is shared
by prompt scanning and the native lint rule; native ESLint loads its TypeScript source while production imports keep
emitted JavaScript paths. The amendment entry gate selects the ordinary review-fix arm: the existing identify-or-refuse
and faithful one-hop requirements already require these outcomes. No design statement, criterion, worker default,
deadline, shard layout, acceptance bar or budget changes.

Full local gates pass at `b4b8b716f4326c5b79cfd1442064ec69fe87652b`: Markdown, all three ARC checks, whole-package
typed lint, shell lint, both type programs, the ordinary routine lane and qualified full declaration build. Routine
execution completes 1,121 passing files and 16,794 passing cases, with one file and 1,188 intentional case skips,
in 231.13 seconds at the unchanged eight-worker default. This one confirmation is not a revised cost sample.

First-attempt hosted confirmation 37707974563 at the same correction head succeeds: all seventeen applicable jobs
pass, and the two PR-only rollups are event-disabled. Both native portability legs complete 28 files and 252 cases
with two intentional skips; macOS's additional selection completes 14 files and 119 cases. The retained native unit
reports contain 13,727 completed cases strictly below half their effective timeouts and 13,644 off-allowlist cases
with zero launches, with no missing metadata. The tightest case is 2,571.705128 ms against its 10,000 ms deadline.
All ten CI-job comparisons are within unchanged budgets; summed budget clocks are 1,505,587 ms. Native run/attempt
records, logs, reports and derived checks are retained at package-relative
`.test-cost-runs/closing-review-pass3/37707974563`. The normal-hook raw push uses the standing explicit hosted-run
authorization. Historical failures, five hosted cost samples and twelve local captures retain their exact heads;
none is relabelled or repeated.

All thirty-two immutable criterion identities and states are preserved: twenty-seven met, five superseded, none
unresolved. The affected discovery, confinement, faithful lint, current gates and confirmation criteria gain current
supplemental proof; unchanged historical color and cost claims retain their original evidence. Primary-only verification
remains the approved choice. Candidate advancement and incremental independent standard pass 4 remain pending; this
verification supplies neither an evaluator conclusion nor merge authority.
