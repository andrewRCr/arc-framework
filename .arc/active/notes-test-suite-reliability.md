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
