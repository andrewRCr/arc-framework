# Task List: Test Suite Reliability

- **Design:** `spec-test-suite-reliability.md`

---

## **Phase 1:** Baseline and measurement

_Purpose:_ Record the pre-change baseline every cost criterion scores against, and make hosted unit runs retain each
test's duration and effective timeout, before any optimizing commit.

_Mode:_ `layer` — closes on a settled measurement substrate and a recorded baseline.

_Exit criterion:_ The baseline is recorded in `notes-test-suite-reliability.md` with run IDs and capture paths, and a
hosted unit run's artifact carries every unit test's duration and effective timeout.

### `[x]` **1.1 Retain per-test unit durations and effective timeouts on hosted runs — D0**

- _Goal:_ Every hosted run of the unit job leaves a machine-readable report of each unit test's duration and the
  timeout it ran under, so the baseline and the reliability criterion read the same data.

    - `[x]` **1.1.a Record each unit test's effective timeout from one shared setup file**
        - Both unit projects register `unit-setup.ts`, which records `task.timeout` under the exported
          `TEST_COST_VITEST_TIMEOUT_META` key. Tests read their own metadata for default, positional, and
          options-object timeouts; hosted artifact inspection in Task 1.2.b proves both project registrations.

    - `[x]` **1.1.b Emit and upload the `json` report from the unit job**
        - The unit job names all three reporters and uploads `unit-test-report.json` under `!cancelled()` with
          `actions: write`. Its workflow contract checks the fixed report path and upload before the final budget step.

### `[~]` **1.2 Record the pre-change baseline — D0**

- _Goal:_ A baseline taken before any optimizing commit fixes every figure the cost criteria score against,
  together with the instruments and settings every later measurement reuses.

    - _Amended in:_ 1.2.R (A1)

- **Additional Context:** `analysis-test-suite-cost-baseline.md` § Method and its limits

    - `[~]` **1.2.a Capture the local baseline**
        - From `packages/arc-framework/`, three `npm run -s benchmark:test-cost -- --condition tier-isolated
          --project-set <unit|integration|e2e> --workers 12` runs per tier. Raw captures stay in the instrument's
          gitignored `.test-cost-runs/`, and `benchmark:test-cost:normalize` gives the medians.
        - Three-run medians of each tier's per-file and summed file time, and of native-tooling cost as the spec's
          § 0 defines it.

    - `[~]` **1.2.b Capture the hosted baseline**
        - At least three full-suite `workflow_dispatch` runs of `ci.yml` at one pushed head on the current layout,
          with `run_portability_pair` off. A dispatch run has no `before` commit, so the classifier
          (`scripts/classify-change.sh`, `cmd_decide`) runs it heavy and every test job runs.
        - Each run is dispatched after the previous one finishes: runs on one ref share a `concurrency` group with
          `cancel-in-progress` (`ci.yml`), so a second dispatch cancels the first.
        - Each run's unit artifact lists every test of both unit projects with its duration and recorded timeout.
        - Per run: run duration, each test job's elapsed time, and summed test-job time; per-file durations by
          project from each test job's log lines; and per-test unit durations from the artifact.
        - Pushes these runs need are approved with this task list and take no separate approval.

    - `[~]` **1.2.c List the near-timeout unit tests and write the baseline down**
        - List the unit tests whose hosted duration, scaled by the spec's observed 1.7× runner variance, reaches half
          their effective timeout (Task 2.4).
        - `notes-test-suite-reliability.md` § Baseline records the head, run IDs, capture paths, medians, and the
          instruments' settings.

### `[x]` **1.2.R Freeze the baseline evidence — D0**

- _Goal:_ Realize A1 by recording the already collected successful and failed observations before fixes, with
  comparable metrics, provenance, settings, and the single-sample E2E limitation.

    - `[x]` **1.2.R.a Derive and record the frozen observations**
        - `notes-test-suite-reliability.md` § Baseline records the frozen captures, local and hosted metrics,
          failed attempts, separate diagnosis, and 34 hosted near-timeout maxima. Native cost pairs corresponding
          unit/integration samples before taking its median; both unit projects retain timing/timeout metadata.

    - `[x]` **1.2.R.b Verify the frozen baseline is usable for fixes**
        - Raw captures and reports reconcile with A1's sample counts, conclusions, and settings. The single E2E
          sample is explicit; failed and diagnostic runs do not substitute for ordinary successes. Remaining
          calibration, layout, and final acceptance measurements consume the frozen references.

- _Outcome:_ A1 closes baseline collection without hiding the observed failures; fixes proceed against the recorded
  references and unchanged performance targets.

## **Phase 2:** Flakes and hermeticity

_Purpose:_ Remove the order- and environment-dependent failures so test outcomes stop depending on test order,
concurrent transient files, or the developer's shell.

_Mode:_ `layer` — closes on a hermetic unit tier.

_Exit criterion:_ `npm test` passes with `FORCE_COLOR=3`, the shared copy helper skips a transient while copying an
untracked module, and every test that reads a renewing lock retries an empty or unparsable read.

### `[x]` **2.1 Clear `FORCE_COLOR` from the lint-staged test's child environment — D1**

- _Goal:_ `focused-lint-staged.test.ts` passes in a shell that sets `FORCE_COLOR`, while
  `scripts/check-ts-quality.sh` prints unchanged output for developers.

- _Outcome:_ All three staged-check child commands clear `FORCE_COLOR`; plain TypeScript diagnostics remain stable
  when the calling shell enables color. Developer-facing script output is unchanged.

### `[x]` **2.2 Copy live source trees through one helper that skips bundle-require transients — D1**

- _Goal:_ Copying a live `src` tree never fails on a transient file vanishing mid-copy, and still copies exactly what
  is on disk, untracked modules included.

    - `[x]` **2.2.a Shared live-tree copy helper**
        - `copyLiveTree` filters loader transient names before Node reads their stats. Its regression copies an
          untracked plain temporary tree, including nested modules and ordinary `.mjs` files, while omitting the
          transient modules at both depths.

    - `[x]` **2.2.b Route both live-tree fixtures through it**
        - The native-build and focused-lint fixtures share `copyLiveTree` for each live source directory.

### `[x]` **2.3 Read renewing lock files tolerantly in tests — D1**

- _Goal:_ A test that reads a lock file while its holder renews it treats an empty or unparsable read as not yet
  readable and retries, so a renewal's in-place rewrite never fails the test.

    - `[x]` **2.3.a Export the lock module's holder classification and retry over it in tests**
        - `classifyAdvisoryLockRead` preserves the existing parser's holder/absent/empty/corrupt/unreadable states;
          `readHolder` delegates one observation to it. `readSettledLockHolder` retries only empty/corrupt records,
          up to 50 reads with 2 ms backoff, and names the file on failure.

    - `[x]` **2.3.b Use it at every read of a renewing lock**
        - Generation-lifetime, cancellation, and ownership tests use the settled-reader helper. The generated
          focused-runtime case puts both its admission-lock read and parse inside `vi.waitFor`; absence assertions
          keep direct reads.

### `[x]` **2.4 Name the remaining heavy unit timeouts and re-size fixed timing windows — D1**

- _Goal:_ Unit tests that keep heavy real work carry a named explicit timeout instead of leaning on the 5 s default,
  and fixture timing windows hold on a loaded runner without spending more fixed wall time than their assertions
  need.

    - `[x]` **2.4.a Named timeouts for heavy tests that stay in the unit tier**
        - Measured non-native cases use `REPOSITORY_SCAN_TIMEOUT`, sized above 3.4 times their frozen hosted
          maximum and rounded up to 5-second increments. Values range from 10 to 25 seconds; the tier default is
          unchanged. The excluded refusal-source-totality cases land separately in 2.4.R (A2).

    - `[x]` **2.4.b Derive the parallelism-readiness deadline from the test's timeout**
        - The inner thread test has an explicit 15-second timeout and spends at most half on readiness, allowing
          7.5 seconds for a second worker while retaining time for its assertion and cleanup.

    - `[x]` **2.4.c Shrink the exclusivity hold and the injected closing delay**
        - Both waits are 50 ms. Forced parallel execution still fails on the exclusive file; capturing elapsed time
          before controller close fails the new endpoint assertion. The closing test compares retained start plus
          elapsed and admission wait with the observed closing endpoint, so startup overhead cannot hide omission
          of the shorter closing interval.

### `[x]` **2.4.R Size the excluded scan cases' timeouts — D1**

- _Goal:_ Realize A2 by giving the two measured near-timeout cases in
  `decompose-v3-refusal-source-totality.test.ts` a named timeout above 3.4 times their hosted maximum, preserving
  every assertion and scan behavior.

- _Outcome:_ Both scan cases keep every assertion and scanning operation and use the same 10-second named
  timeout. The file diff changes only the constant and its two timeout arguments; the frozen 1.7× maxima remain
  below half the timeout.

## **Phase 3:** Native-tooling unit files

_Purpose:_ Prove native-tooling decision logic below the real stack, against fakes at the existing seams or against
the function that decides it, and keep one real run per outcome class in integration, family by family, starting from
one calibrating file.

_Mode:_ `replication` — closes when every native-tooling unit file is converted and batch-verified.

_Exit criterion:_ All 59 native-tooling unit files are converted or recorded as running no native work, every outcome
class the portability tier proves for real at the baseline head is still portability-selected, and native-tooling cost
is measured against the baseline.

### `[x]` **3.1 Directly test the Vitest controller's logic — D2**

- _Goal:_ The Vitest controller's option normalization, tier arguments, completion check, and runtime-evidence
  refusals each have direct tests, so moving the files that exercise them through real runs loses no proof of that
  logic.

    - `[x]` **3.1.a Option normalization and tier arguments**
        - Direct tests cover exclusion normalization, run/watch behavior, location overrides, every tier, and the
          complete portability selector list; `localVitestTierArguments` is exported without changing its behavior.

    - `[x]` **3.1.b The completion check**
        - Constructed public results cover collection, module, and worker failures, empty completion, healthy
          completion, and existing failure status. Every case restores `process.exitCode`.

    - `[x]` **3.1.c Runtime-evidence refusals before the build read**
        - Direct tests preserve malformed-evidence and missing-controller-key refusals before qualification reads.

### `[x]` **3.2 Convert `build-publication.test.ts` and calibrate the projected cut — D2**

- _Goal:_ The real outcome classes the portability tier proves are on record before any file changes,
  `build-publication.test.ts` proves its matrix at `publishStagedBuild` with one real run per outcome class left in
  integration, and its measured costs rebuild the phase's projection file by file.

    - `[x]` **3.2.a Record the portability tier's real outcome classes**
        - Recorded all nine basenames' baseline native and filesystem classes in `notes-test-suite-reliability.md`
          § Portability outcome classes, including the existing integration inventory probe.

    - `[x]` **3.2.b Publication without a compiler**
        - `staged-build-fixture.ts` creates completed staging, baseline-derived evidence, projected registry schemas,
          and a refusing or accepting artifact capability without launching a compiler or parser.

    - `[x]` **3.2.c Split the file by outcome class**
        - The nine-case unit matrix uses completed staging and the parser boundary; five integration cases preserve
          absent-output publication, actual owner loss/repair, one filesystem-validation refusal, native syntax
          refusal, and publication ordering. Their basename remains portability-selected.

    - `[x]` **3.2.d Measure the file and rebuild the projection**
        - Three focused before/after medians and the 59-file conservative projection are recorded in the notes.
          The early projection remains below 40%; under the expanded execution direction it is informational,
          with the deviation recorded. Task 3.8 retains the unchanged measured 40% acceptance requirement.

### `[x]` **3.3 Convert the remaining build files — D2**

- _Goal:_ Every other `build-` unit file proves its decisions below the real stack, leaving only one real run per
  outcome class, in integration.

    - `[x]` **3.3.a `build-coordinator.test.ts`**
        - Direct publication tests preserve all three write/cleanup failures and repaired publication; integration
          retains stable native generation, ancillary failure with regenerated repair, and changed-input refusal
          with stable retry. Both basenames remain portability-selected; the unit failure cases are the narrower
          proofs replacing native entry and obsolete-cleanup replays.

    - `[x]` **3.3.b `build-preparation.test.ts` and `build-command.test.ts`**
        - Preparation's refusal matrices now use prebuilt staging without generation; five native preparation
          classes and all four public scripts retain real integration runs. The root `build` row,
          `root build establishes absent output through its declared generation mode`, proves unchanged-input
          rebuilding in place of the three duplicate rebuild replays; notes record the full disposition.

    - `[x]` **3.3.c `build-generation.test.ts` and `build-generation-lifetime.test.ts`**
        - Both files move intact to integration: staging-only runtime/schema generation, full declaration success
          and refusal, compiler-blocked renewal, and owner-death recovery remain real. The lifetime basename stays
          portability-selected; no cases or assertions are removed.

    - `[x]` **3.3.d `build-context`, `build-evidence`, `build-inputs`, and `build-inventory`**
        - Context and evidence remain direct, process-free tests; their distinct refusal tables are retained.
          All input-capture cases move intact to integration. Inventory keeps filesystem decisions in unit and
          moves its native manifest-resolution case beside the existing preferred-source integration case.
          Context and both inventory basenames remain portability-selected.

    - `[x]` **3.3.e `build-ownership.test.ts` and `build-cancellation.test.ts`**
        - Ownership's filesystem/lock classes remain real in unit with scripted Git; its native-loaded control
          module case moves unchanged to integration. Cancellation moves intact to integration. All original
          acquisition, bypass, queue, replacement, cancellation, and repaired-retry classes remain portability-selected.

    - `[x]` **3.3.f `build-baseline`, `build-config`, and `build-configuration`**
        - Baseline interval decisions and runtime-only option assertions remain direct in unit. The unchanged
          real compiler interval and dynamic-import bundling cases run in integration. Inherited configuration
          capture remains process-free filesystem work; no cases or assertions are removed.

### `[x]` **3.4 Convert the CI-build files — D2**

- _Goal:_ `ci-build-recovery.test.ts` and `ci-build-transfer.test.ts` no longer bound a unit shard: their fault
  matrices run as direct calls, and each real outcome class runs once in integration under a basename the
  portability tier still selects.

    - `[x]` **3.4.a `ci-build-recovery.test.ts`**
        - The complete qualification and installation fault matrices run directly over transferred output from one
          real producer. One native controller refusal/preflight/repaired run per class remains, and the alternate
          Node scenario retains its original conditional skip. All classes stay portability-selected in integration.

    - `[x]` **3.4.b `ci-build-transfer.test.ts`**
        - Every consumer job checks transferred qualification and the actual shared preflight contract directly.
          Integration retains one native transfer/repair/skip-build consumption run plus full producer and
          platform-local declaration gates. The direct job rows replace equivalent native job replays; portability
          keeps the basename and all baseline classes.

### `[x]` **3.5 Convert the dev-build and dev-check files — D2**

- _Goal:_ The self-hosting freshness logic is proved against fakes, with the refresh path's real run in integration.

    - `[x]` **3.5.a `dev-check.test.ts` and `dev-build-qualification.test.ts`**
        - Existing fake-dependency verdicts remain in `dev-check`; the qualification matrix uses compiler-free
          staged output to preserve stamp decoding and selective invalidation. Two native integration cases retain
          actual rebuild and schema/runtime producer classes; the bounded fixture adjustment is recorded in Notes.

    - `[x]` **3.5.b `dev-build-refresh.test.ts`**
        - Both complete real refresh scenarios move unchanged to integration, preserving the basename.

### `[x]` **3.6 Convert the Vitest-runtime and local-Vitest files — D2**

- _Goal:_ The Vitest controller's discovery and execution paths are proved against a fake controller, with one real
  run per outcome class and one real run per test entry point left in integration.

    - `[x]` **3.6.a Controller-fixture files**
        - Public controller fakes prove discovery, pre-parsing, completion, closing/capture order, and environment
          initialization without native work. Native discovery classes, dynamic-skip refusal, four failure/success
          channels, and one environment run remain in integration; Notes names the direct replacement proofs.
        - `vitest-closing`, `vitest-completion-results`, and `vitest-worker-policy` remain process-free.

    - `[x]` **3.6.b Runtime-fixture files**
        - All six native families retain their ownership, preparation, failure, and repair classes in integration.
          Own-key context faults and runtime-free execution/cleanup composition use direct unit fixtures. CPU-bypass,
          context, reported-failure, and combined-closing native duplicates have named replacement proofs in Notes.

    - `[x]` **3.6.c `vitest-mixed-shard.test.ts`**
        - The complete mixed-shard ownership and generation-reuse scenario moves unchanged to integration.

    - `[x]` **3.6.d Focused-fixture files**
        - All ten root npm entries remain real in integration, alongside configured filtering/sharding and initial
          coverage. The repeated full-tier literal-option row has named narrower routing/forwarding proofs in Notes.
          Final class inspection also folds skipped discovery and execution-failure replays from earlier leaves.

### `[x]` **3.7 Convert the focused-test, focused-lint, and test-cost files — D2**

- _Goal:_ The focused controllers and the cost instrument are proved below the real stack, with their real runs
  folded to one per outcome class in integration.

    - `[x]` **3.7.a Focused test files**
        - Exported the unchanged exact-selection function for direct eligibility/order/deduplication proofs; fake
          discovery proves runtime need. Native mixed preparation/reuse, refined-selection refusals, and all four
          execution classes remain in integration. Notes names each dropped matrix row's narrower proof.
        - `focused-test-input` remains process-free.

    - `[x]` **3.7.b Focused lint files**
        - Direct normalization and refusal matrices run without ESLint; five native adapter classes remain in
          integration. Staged lint uses one combined fixture scenario with clean and collected-failure invocations,
          retaining every supported literal filename and both compiler failures. Notes records the bounded run shape.

    - `[x]` **3.7.c Test-cost native runs**
        - Native capture/closing/failure families and the real admission/artifact timing case move to integration.
          The unit run matrix retains fake controller, clock, and persistence boundaries and directly refuses empty
          completion; that proof replaces the all-skipped native replay. Other real outcome classes remain intact.

    - `[x]` **3.7.d The remaining thirteen test-cost files**
        - All thirteen remain process-free policy/capture/metadata checks. `shard-run` injects both its process
          launcher and workflow reader; comparison/retained import the run record only as a type. Notes records
          the source-grounded dispositions.

### `[x]` **3.8 Native-tooling conversion complete** — validate exit criterion at segment scope

- _Goal:_ Evidence that all 59 files are converted or recorded as running no native work, that every class in
  `notes-test-suite-reliability.md` § Portability outcome classes has a portability-selected real run, and that
  native-tooling cost, from the local instrument's `unit` and `integration` project sets as three-run medians, is
  measured against `notes-test-suite-reliability.md` § Baseline.

- _Outcome:_ All 59 baseline basenames have recorded dispositions and current locations; all nine portability
  basenames retain their real outcome classes. Three successful paired native-family samples yield a 656,069.528 ms
  median, a 41.92% reduction against the frozen baseline. Notes § Native conversion measurement retains the exact
  head, raw captures, sample spread, and inventory reconciliation.

## **Phase 4:** Source-scan tests

_Purpose:_ Stop spending real work on properties the compiler and linter already enforce, then measure what remains
before deciding on a shared parse.

_Mode:_ `layer` — closes on a settled source-scan layer.

_Exit criterion:_ Each deleted case records its survival-rule verdict, the one-hop bans are rows of one composed ESLint
ban table that a test proves each file carries, and the remaining scan cost and the shared-parse decision are
recorded.

### `[x]` **4.1 Record the source-scan set and delete cases the toolchain already enforces — D3**

- _Goal:_ The source-scan files and cases are on record with their baseline cost, and no source-scan case
  re-asserts what `tsc` or ESLint already fails on, each deletion recording its verdict under the survival rule.

    - `[x]` **4.1.a Record the source-scan set**
        - Notes § Source-scan cost records 26 live-code scan files and 123 expanded cases, with three-sample
          file/case medians reconciled against the frozen captures. The raw inventory retains every sample and
          source locus; shared setup cost is counted once per file. Complete-file baseline median is 49,744.319 ms.

    - `[x]` **4.1.b `lib/store/ship-guard.test.ts`**
        - The real bundle-metadata check and its raw/output/multiple-output proofs survive: native inclusion and
          traversal regressions are independent of list edits. Static/re-export/dynamic/type reference imports
          produce TS6059; their scan stays until Task 4.3.c proves the remaining bound-loader lint ban.

    - `[x]` **4.1.c Display-label checks in the meta inventories**
        - Reader display-label indexing/property branches and writer override-object checks are removed; the
          actual semantic exports and compiler options refuse them. Projection/identifier-list calls and producer
          contracts remain. The retired `MetaFieldOverrides` name pin fails the survival rule and is removed.

    - `[x]` **4.1.d CommonJS `require` detection**
        - Kernel/reference helper import-equals branches and kernel planted rows are removed: the resolved lint
          rule already reports them. Bound `require` and `module.require` remain until lint migration; their
          probes confirm the existing rule's gap, and their live boundary checks pass the survival rule.

- _Outcome:_ Notes § Source-scan deletion dispositions records each verdict and actual compiler/linter evidence.
  Packaging coverage and live boundary checks remain while compiler-owned branches and a retired-name pin are
  removed; the full-strength loader migration stays separately scoped to Task 4.3.

### `[x]` **4.2 Delete change-detectors that pin removed code — D3**

- _Goal:_ `decompose-v3-authority-boundary.test.ts` keeps only cases that would catch a plausible regression, with
  each verdict recorded.

- _Outcome:_ The three removed-module/retired-identifier cases and retired alternatives in the advancement ban
  fail the survival rule and are deleted. Live retirement-authority imports and two actual package/project
  synchronization checks survive; historical vocabulary/prose pins are removed. The same rule removes the
  inventoried `core/ports` retired-interface pin. Notes § Change-detector dispositions records each verdict.

### `[x]` **4.R Provide faithful binding-aware and filename-relative lint predicates — A3**

- _Goal:_ A3's local ESLint rule can enforce existing one-hop boundaries using each module's parsed syntax,
  filename, and binding/resolution data, with equivalent native forbidden/allowed proofs before case deletion.

    - `[x]` **4.R.a Define the local rule and its composed policy contract**
        - The registered `architecture-imports` rule accepts unique known predicate IDs and reads the native
          parser's original TypeScript source mapping. It preserves the kernel's resolver and store's lexical
          paths/type-only exceptions; the table subsequently supplies each file's matching-row union.

    - `[x]` **4.R.b Prove loader-binding and relative-target fidelity**
        - The shared native fixture proves aliases, returned/inline loaders, Result and package seams, both
          relative escape depths, unresolved imports, TSX, computed/CommonJS/factory refusals, and store privacy.
          Direct unit decisions prove all store exceptions; narrowed reconstructions fail every added behavior.

- _Outcome:_ Four predicate IDs provide the faithful substrate for the original migration without a source-tree
  walk or another parse. Native configuration refuses unknown IDs, and source-scan cases remain held until their
  composed rows and per-row lint proofs land. Notes § Local predicate substrate retains the evidence.

### `[x]` **4.3 Move one-hop import and syntax bans to ESLint — D3**

- _Goal:_ Every ban that reads only one module's own imports or syntax is a row of one composed ban table in
  `eslint.config.js`, each file's resolved configuration carries every ban that applies to it, and the source-scan
  case each row replaces is gone.

- _Amended in:_ 4.R (A3)

**Additional Context:** `spec-test-suite-reliability.md` § 3 step 3 (A3), and
`notes-test-suite-reliability.md` § Amendment A3: faithful one-hop lint predicates. The effective mechanism includes
local predicate IDs where built-in selectors cannot preserve the existing boundary.

    - `[x]` **4.3.a Inventory the one-hop bans**
        - Notes § One-hop ban inventory classifies all 26 files and preserves every expanded case in the raw
          inventory. Dependency/declaration bans migrate after native proofs; positive catalogs, export surfaces,
          transitive loading and explicit vocabulary properties survive. Incidental text branches are classified.

    - `[x]` **4.3.b The composed ban table**
        - One table composes disjoint directory/exact-file scopes into complete import, syntax and predicate-ID
          unions, including future modules and exceptions. Native configuration-only proofs cover both actual
          rows and all overlapping rule types. The coupling corpus recognizes the new executable tooling family.

    - `[x]` **4.3.c Express each ban and delete the case it replaces**
        - Every classified dependency/declaration ban has composed native scope and forbidden/allowed proofs;
          duplicated scans are gone while positive catalogs, export surfaces, transitive loading and vocabulary
          contracts survive. Notes § Migrated one-module bans records fidelity, deletion verdicts and lint cost.

- _Outcome:_ The complete table preserves loader bindings, resolver and lexical boundaries, scope exceptions and
  overlapping rule options without another parse or tree walk. Native lint proofs precede scan retirement;
  ordinary typed lint costs 51.20 s against 49.86 s before migration. Notes retain the source-grounded dispositions
  and bounded text/selector interpretations; A3's migration condition is revalidated.

### `[ ]` **4.4 Narrow the command-schema registry scan — D3**

- _Goal:_ The "registers every command-owned schema" case in `command-input/registry.test.ts` scans only what it
  reads.

    - It reads only `source.commands`, which `scanCommandInputSources` takes from `scanCommanderSource` on `cli.ts`
      (`loadCommandInputSourceSnapshot`), so it calls `scanCommanderSource` directly, as `cli-help-coverage.test.ts`
      does.

### `[ ]` **4.5 Measure the remaining scan cost and decide on a shared parse — D3**

- _Goal:_ Whether a shared cached parse earns its place is decided from a measurement taken after Tasks 4.1–4.4, not
  assumed.

    - The local instrument's unit-tier capture gives the summed time of the files in Task 4.1.a's list that remain.
    - `notes-test-suite-reliability.md` § Source-scan cost records that time, its share of the unit tier, and how
      many full `src` parses the remaining cases still repeat, with a recommendation at this task's gate. If a
      shared parse earns its place, its design and a task to build it are added at that gate before anything is
      built.

## **Phase 5:** E2E fixture cost and the managed-run staleness skip

_Purpose:_ Cut E2E's per-spawn and per-case fixture cost: skip the staleness check only for a managed run's own
processes, and build each repeated fixture once.

_Mode:_ `slice` — closes on a managed E2E run whose own CLI children skip the staleness check.

_Exit criterion:_ Under the test controller, CLI children skip the staleness check only with a matching token, a
test-controller operation, and a live lease; the `--no-input` matrix runs each distinct invocation once from a
template; and E2E summed file time is measured against the baseline.

### `[ ]` **5.1 Skip the per-spawn staleness check for a managed test run's own processes — D4**

- _Goal:_ A built-CLI process started by a managed test run skips `checkDevBuildStaleness` only while it carries the
  live test controller's token, and every other process runs the check as today: a build holder's, a developer's own
  `npx arc`, or one started after the run released its lock.

    - `[ ]` **5.1.a The skip decision over one tolerant holder read**
        - The classification Task 2.3.a exports sorts one synchronous read of the lock file without acquiring.
        - A decision beside `checkDevBuildStaleness` (`dev-check.ts`) takes the supplied token, that
          classification, and the clock.
        - Build `test-first` (one behavior at a time):
            - A matching token, a `tests (<tier>)` operation, and a live lease skip the check
            - A mismatched token runs the check
            - A build holder, whose `metadata.operation` is not a test controller's, runs the check
            - An expired lease (`leaseUntil` passed) runs the check
            - A holder with no `leaseUntil` runs the check, since a test controller always holds a lease
            - No token runs the check
            - An absent, empty, corrupt, or unreadable lock file runs the check

    - `[ ]` **5.1.b Export the controller's token to its children**
        - `withBuildArtifactOwnership` (`build-ownership.ts`) passes its lock handle's `token` on the
          `BuildArtifactLease`. `withTestArtifactOwnership` sets `process.env[TEST_CONTROLLER_TOKEN_ENV]`, an exported
          constant naming `ARC_TEST_CONTROLLER_TOKEN`, to that token around its action and restores the prior value
          after. Vitest workers, on either pool, and their children inherit it. `executeVitestSelection` is
          unchanged: a unit-only selection never calls `withTestArtifactOwnership`, so it exports nothing.
        - Build `test-first` (one behavior at a time), through `withTestArtifactOwnership`'s existing overrides:
            - The action sees the held lock's token in the environment
            - The prior value is restored after the action returns or throws

    - `[ ]` **5.1.c Consult it in the CLI's stale-build guard**
        - The `preAction` hook's body moves from `cli.ts` into an exported guard in `dev-check.ts`, with the lock
          read, the staleness check's dependencies, the stderr writer, and the exit injected; `cli.ts`'s hook calls
          it and stays synchronous. The guard reads `.arc-build.lock` in the package root, the running `dist`'s
          parent, once, and skips `checkDevBuildStaleness` when the decision holds. A skipped check leaves the
          command ineligible for the post-command refresh.
        - Build `test-first` (one behavior at a time):
            - When the decision skips, the staleness check's dependencies are never read and the command is not
              refresh-eligible
            - A `fresh` verdict makes a refresh command path eligible
            - A stale verdict refuses with today's message and exit status
            - A stale verdict under the compaction-seed write warns and continues
            - A `skip` verdict, an adopter install's, proceeds silently and leaves the command ineligible for the
              refresh

    - `[ ]` **5.1.d Prove the skip in a managed run**
        - The runtime fixture's `src/cli.ts` is a one-line marker, so this test's fixture replaces it with an entry
          that runs Task 5.1.c's guard and then prints a marker; `cli.ts`'s hook is a call to the same guard.
        - An integration test runs that fixture's controller. Its inner test edits the entry's source, then spawns
          the built CLI twice: with the inherited token it prints the marker, and with the token removed from its
          environment the guard refuses it as stale.

### `[ ]` **5.2 Run each distinct `--no-input` invocation once from a prepared template — D4**

- _Goal:_ `command-input-no-input.e2e.test.ts` runs each distinct invocation once against a copy of one prepared
  repository and still enforces the exact match between `NO_INPUT_MATRIX` and live interaction sites.

    - `[ ]` **5.2.a Run each distinct invocation once**
        - Every invocation of an entry that runs without a TTY resolves the same forbidden, non-interactive context,
          so they collapse into one; each invocation under a pseudo-TTY stays, since there its signal alone forbids
          interaction.
        - The 45 entries that take stdin or `--json` run all three invocations without a TTY and keep one. The six
          whose `--no-input` invocation runs under a pseudo-TTY (`base merge`, `integrate checkpoint`,
          `integrate merge`, `review change-request resolve`, `review pre-publication`, `review status`) keep it and
          one more. The other 29 run their `--no-input` and CI invocations under a pseudo-TTY and keep all three.

    - `[ ]` **5.2.b Build the initialized repository once**
        - `prepareRepositoryTemplate` builds the initialized repository the 75 initialized entries need, once, and
          each of their invocations runs in a `copyPreparedRepository` copy
          (`__tests__/helpers/prepared-repository.ts`). The three bare entries and the two stub entries (one with an
          origin, for `start`) keep building in place.
        - The `repository-inventory.test.ts` match between `NO_INPUT_MATRIX` and live interaction sites stays.

### `[ ]` **5.3 Build the remaining repeated E2E fixtures once — D4**

- _Goal:_ `session-init`, `teardown-stale-projection`, and `publication-spine` each build their repeated fixture
  once and copy it per case, with every case's outcome unchanged.

    - `[ ]` **5.3.a A prepared shape for a sibling linked worktree**
        - `copyPreparedRepository` gains a shape whose linked worktree sits outside the repository root, in its own
          parent directory. It copies both directories and rewrites the absolute paths each side records: the
          repository's `.git/worktrees/<name>/gitdir` and the worktree's `.git` file.
        - Build `test-first` (one behavior at a time):
            - A copied sibling worktree is listed by `git worktree list` at its new path
            - Git commands in the copied worktree resolve to the copied repository, never the template

    - `[ ]` **5.3.b Teardown veto cases from one prepared archived feature**
        - `prepareArchivedFeature` (`teardown-stale-projection.e2e.test.ts`) is built once; each of the 11 veto
          cases copies it with the sibling shape.

    - `[ ]` **5.3.c Session-init and publication-spine**
        - `session-init.e2e.test.ts` runs `init` in a fresh repository for all 30 cases, in five `beforeEach` hooks
          and inline in the four remote-acquisition cases. One initialized-repository template serves them all, and
          each group's remaining setup (a commit, a worktree parent, `setupStaleLocalBase`, a remote and publisher)
          stays per case.
        - `reachAtCapConvergence` (`publication-spine.e2e.test.ts`) is built once and copied for its three uses.

### `[ ]` **5.4 E2E cost cut** — validate exit criterion at segment scope

- _Goal:_ Evidence that a managed E2E run's CLI children skip the staleness check only under the three conditions,
  that the `--no-input` matrix runs each distinct invocation once from a template, and that E2E summed file time,
  from the local instrument's `e2e` project set as three-run medians, is measured against
  `notes-test-suite-reliability.md` § Baseline.

- **Additional Context:** `spec-test-suite-reliability.md` § 0

    - Closing three-run medians compare with the frozen single ordinary E2E sample; state its uncertainty (A1).

## **Phase 6:** Testing policy and the unit spawn guard

_Purpose:_ State the rules this work applies where agents load them, and hold the unit tier's no-spawn line with a
runtime guard and an allowlist floor.

_Mode:_ `layer` — closes on an enforced unit-tier policy.

_Exit criterion:_ A launch from a file off the allowlist fails its test even when the error is caught, a run fails
naming an allowlisted file that ran whole and launched nothing, and the override, strategy, and
`TECHNICAL-OVERVIEW.md` agree.

### `[ ]` **6.1 State the testing policy in the override, strategy, and technical overview — D6**

- _Goal:_ An agent writing tests loads the operative rules from the `testing-standards` override, the strategy
  carries their reasoning and worked examples, and `TECHNICAL-OVERVIEW.md` § 4 describes the same tier lines.

- _Note:_ The override is project-owned and not shipped: edit only `testing-standards.override` in
  `.arc/system/methods/testing-standards.md`, never `.default` or the package copy.

    - `[ ]` **6.1.a The override**
        - The three new rules in a few lines: architecture rules live in the linter when it can express them;
          matrices run below the real stack, against fakes at the seam or against a function that decides from
          files on a filesystem fixture, with one real run per outcome class and the outcome-class definition; and
          process-spawning tests are hermetic and time-honest.
        - The unit line becomes operative for `__tests__/unit/**`: no child processes, no real builds, no git
          repositories. The **Boundaries are** bullet drops `fs`, and the **Dependency injection** bullet injects
          `fs` only where a test must fail or observe it; otherwise a unit test uses a temporary directory.

    - `[ ]` **6.1.b The strategy**
        - `strategy-testing-methodology.md` gains each rule's reasoning and a worked example (the
          `build-publication.test.ts` classes).
        - § Test Tiers' unit line drops "no filesystem", § Mocking Rules drops the filesystem from its boundary
          list and its "Accept dependencies" bullet injects `fs` only where a test must fail or observe it, and the
          Integration tier is characterized by real module interactions, git repositories, and child processes
          rather than by filesystem use.

    - `[ ]` **6.1.c The technical overview**
        - `TECHNICAL-OVERVIEW.md` § 4's Unit and Integration lines follow the same tier lines.

### `[ ]` **6.2 Guard unit-tier launches from the shared setup file — D6**

- _Goal:_ In both unit projects, a process launch from a test file off the allowlist fails that test even when the
  error is caught, an allowlisted file still launches, and a file using esbuild is counted for its own service
  whatever ran before it in the worker.

- _Approach:_ The behaviors are proved through the guard's core with the running file injected, and once end to end by
  an integration test that runs a small Vitest project under both unit projects' settings. The guard installs through
  one exported function that takes its allowlist and sets up everything the guard does: the launch replacement, the
  hooks below, esbuild's stop, and Task 6.3.a's metadata write. The shared setup file calls it with the repository's
  allowlist module, and the test project's own setup file calls it with that project's files, so the shared setup file
  carries no override.

- **Additional Context:** `notes-test-suite-reliability.md` § Measurement and probe record

    - `[ ]` **6.2.a Replace the launch functions**
        - The install function, which the shared setup file (Task 1.1) calls, replaces `node:child_process`'s launch
          functions with guarded ones that throw unless the running file (`expect.getState().testPath`) is on the
          allowlist, and calls `syncBuiltinESMExports`. The replacement `execFile` carries its own guarded
          `util.promisify.custom`.
        - Build `test-first` (one behavior at a time):
            - A direct launch from a file off the allowlist throws
            - Named-import and `execa` launches are blocked the same way
            - `promisify(execFile)` in an allowlisted file resolves to `{ stdout, stderr }`, and is blocked elsewhere
            - An allowlisted file launches

    - `[ ]` **6.2.b Fail the test on a caught launch**
        - The guard records each blocked launch per file. The install function's `afterEach` fails the test that made
          one, and its `afterAll`, which runs after the file's own under Vitest's default `sequence.hooks: "stack"`,
          fails the file for a launch made outside any test.
        - Build `test-first` (one behavior at a time):
            - A launch whose error `execa` swallows under `reject: false` still fails its test
            - A launch whose error a helper catches still fails its test
            - A launch caught in a file's `beforeAll` or `afterAll` fails the file

    - `[ ]` **6.2.c Per-file esbuild service and the allowlist**
        - The install function's `afterAll` awaits esbuild's `stop()`, ending its cached service. The root `esbuild`
          serves tsup, bundle-require, and direct imports; tsx's nested copy runs only in child processes, so the root
          copy is the only one to stop.
        - The allowlist, a module beside `isolated-unit-mock-files.ts`, holds the unit files that still spawn. Its
          contents come from one full unit-tier run with the guard in place, plus the unit files whose launches run
          only on another platform, found by reading each platform-conditional test: today that is `fs.test.ts`,
          whose `powershell.exe` spawn runs only on Windows. This task records each file with its launch count, or
          with the platform its launch needs.
        - Build `test-first` (one behavior at a time):
            - A file using esbuild after another esbuild user in the same worker launches and is counted for its own
              service
            - That file is blocked when it is off the allowlist
            - A test in the `unit` project finds the guard installed with the repository's allowlist module, read
              back through state the install function exports

### `[ ]` **6.3 Fail a run whose allowlisted file ran whole and launched nothing — D6**

- _Goal:_ A run fails at its end naming every allowlisted file that ran whole and launched nothing, even when the run
  names its own reporters, so the allowlist stays a floor.

    - `[ ]` **6.3.a Write each test's launch count and allowlist membership into its metadata**
        - The guard keeps a running launch count per file and writes it, with whether the file is on the allowlist,
          into each test's metadata after the test.

    - `[ ]` **6.3.b Check the floor beside the completion check**
        - A check beside `checkVitestCompletion` in `vitest-completion.ts`, of the same shape, reads each
          test's `TestCase.meta()` and skip state from the result's `testModules`, logs each idle allowlisted file
          through the controller's logger, and sets `process.exitCode`. `executeVitestSelection`
          (`vitest-execution.ts`) calls it after the completion check on the `runTestSpecifications` result, so the
          tier runner, focused runs, and the cost instrument all check.
        - Build `test-first` (one behavior at a time), over constructed test modules:
            - An allowlisted file whose tests all ran with a zero launch count fails the run, named
            - An allowlisted file that launched passes
            - A file with any skipped test, including one a name filter skipped, is not checked
            - `fs.test.ts`, whose spawning test is skipped on every platform but Windows, is not checked there
        - End to end, Task 6.2's test project runs through `executeVitestSelection` with a command-line
          `--reporter json`, and an allowlisted file there that ran whole and launched nothing fails the run, named.

## **Phase 7:** CI layout trial and budget visibility

_Purpose:_ Retry duration-balanced layouts once the CPU work has landed, adopt one only on evidence, and put budget
overage where reviewers look.

_Mode:_ `slice` — closes on a layout decided by hosted evidence.

_Exit criterion:_ The trial's runs and verdict are recorded, only the winning layout (or none) remains on the branch,
and a test proves an `over` budget reading emits a `::warning` annotation naming the baseline and the budget.

### `[ ]` **7.1 Measure the trial's reference and its weights — D5**

- _Goal:_ The reference run duration, each project's estimate, and the hand-kept list's durations are all measured
  at the head the trial starts from, after the CPU work has changed the durations the baseline recorded.

    - `[ ]` **7.1.a Reference runs**
        - At least three full-suite `workflow_dispatch` runs at the head the trial starts from, on the current
          layout, with `run_portability_pair` off, dispatched one at a time as in Task 1.2.b. Their median run
          duration is the reference.
        - Per-file durations by project come from each test job's log lines, as Task 1.2.b reads them.
        - Pushes these runs need are approved with this task list and take no separate approval.

    - `[ ]` **7.1.b The estimates and the list's durations**
        - Each project's estimate is its median hosted file duration across the reference runs, and each file on
          `ecd8c8af3`'s hand-kept list (`HEAVY_FIRST_FILES`) takes its median hosted duration from the same runs.
        - `notes-test-suite-reliability.md` § Layout trial records the head, the run IDs, the reference, the
          estimates, and the list's durations.

### `[ ]` **7.2 Restore the duration-balanced sequencer — D5**

- _Goal:_ Given the same duration input, every shard process assigns each file to the same shard, so shards
  partition the suite exactly with heavy files spread by weight, and files with recorded durations start slowest
  first.

    - `[ ]` **7.2.a Rebuild the restored sequencer with a total-order `shard()` and a duration-weighted `sort()`**
        - `__tests__/helpers/heavy-first-sequencer.ts` and `__tests__/unit/heavy-first-sequencer.test.ts` return
          from `ecd8c8af3` as the starting point. There the sequencer overrides only `sort()`, moving
          `HEAVY_FIRST_FILES` to the front of their project's run through `promoteHeavyFirst`. A `shard()` override
          and a duration-weighted `sort()` replace `promoteHeavyFirst` and its tests; the check that every listed
          file exists stays.
        - The list carries each file's duration and the per-project estimates from Task 7.1.b.
        - Durations come from one source per run: the list, or the results file `setup` hands on, read from the
          path `ARC_TEST_DURATION_FILE` names and never through Vitest's own results cache.
        - Build `test-first` (one behavior at a time):
            - `shard()` orders files by weight descending, then project name, then package-relative path, whatever
              order Vitest supplies
            - Files go to the least-loaded shard in that order, the lowest-numbered on a tie, and the shards
              partition the files exactly
            - A file with no recorded duration, or one that is not a finite non-negative number, weighs its
              project's estimate
            - The cache source reads a Vitest results file's `<project>:<package-relative path>` entries, and an
              empty file gives every file its project's estimate
            - `sort()` starts files with a valid recorded duration first, slowest first, and leaves the rest in
              `BaseSequencer.sort`'s order

    - `[ ]` **7.2.b Register it only when a run selects a duration source**
        - `vitest.config.ts` installs the sequencer only when `ARC_TEST_DURATION_SOURCE` is `hand-kept-list` or
          `results-cache`, so runs on the current layout are unchanged. Registered, it decides the membership and
          order of every project in the run, integration's shards included.
            - _Retired in:_ Phase 7

### `[ ]` **7.3 Wire both duration sources and the trial selector into CI — D5**

- _Goal:_ A `workflow_dispatch` run can drive the sequencer from either duration source on a trial layout, every shard
  of one run reads the same input, and only writer runs save the cache.

    - `[ ]` **7.3.a The results-cache handoff**
        - The `setup` job restores the newest cache by key prefix and hands it to every test job as a run artifact;
          when none exists, it hands on an empty file, so the first run's shards still download one.
        - Each trial job removes Vitest's results directory (`packages/arc-framework/node_modules/.vite/vitest/`) before
          its run. The directory sits inside the `node_modules` the jobs restore from cache, a cache saved after any
          Vitest run carries one (on a light run that misses the key, `lint-typecheck` runs `test:arc-contracts` and
          then saves it), and Vitest loads the file it finds there at start and writes all of it back
          (`ResultsCache.readFromCache`, `ResultsCache.writeToCache`). The file Vitest writes then holds only that job's
          files.
        - In a writer run, each shard uploads that file, and a final job merges the sets into one file per tier, failing
          when two shards' sets overlap, and saves it under a run-unique key. Only writer runs save.
        - `setup` is otherwise artifact preparation only: `workflowHeavyCheckNames` (`classify-change.test.ts`) fails
          when it gains another step. The restore and the step that writes the empty file join the steps that test
          admits, and its rejection cases for any other command or action stay.

    - `[ ]` **7.3.b The selector and the trial jobs**
        - `workflow_dispatch` inputs: `duration_source` (a choice of `none`, the default, `hand-kept-list`, and
          `results-cache`) and the unit, integration, and E2E shard lists, each a JSON array that its trial matrix
          reads with `fromJSON`, so no step computes them.
            - _Retired in:_ Phase 7
        - Trial unit, integration, and E2E jobs run only on a dispatch with a source selected, carry no heavy-weight
          condition, so `workflowHeavyCheckNames` does not count them, and pass `ARC_TEST_DURATION_SOURCE` and
          `ARC_TEST_DURATION_FILE` to Vitest. The current jobs gain the opposite
          gate, so a run with no source selected runs the current layout unchanged.
        - Trial unit shards upload their `json` reports under per-shard artifact names, since `upload-artifact`
          refuses a second artifact with one name in a run. Each trial job reports its budget as
          `<tier>-<shard>`.
        - `review-gate-workflows.test.ts` follows: the current jobs' conditions and the trial jobs' steps.

### `[ ]` **7.4 Run the source runs and record the verdict — D5**

- _Goal:_ The layout that lands, or none, is chosen by the adoption bar on hosted evidence, with every counted run,
  source, and verdict recorded.

    - `[ ]` **7.4.a Source runs**
        - At least two counted runs per source, dispatched one at a time, at the head that carries the trial's
          wiring. Between it and the
          reference head, only the sequencer, its data, and the workflow change.
        - A source clears the bar when every counted run that uses it finishes at least 10% below the reference. A
          run's duration for the bar ends when its last job other than the merge-and-save job finishes.
        - A cache run that restored no saved file seeds the cache and does not count.
        - In each counted run, no integration shard is the last test job to finish. If one is, the trial adds an
          integration shard and that source's runs start over.
        - Pushes these runs need are approved with this task list and take no separate approval.

    - `[ ]` **7.4.b The verdict**
        - If both sources clear, the cache wins unless the hand-kept list's median run duration is more than 10%
          below the cache's. If one clears, it wins. If neither clears, no layout change lands.
        - `notes-test-suite-reliability.md` § Layout trial records the runs, their sources, their durations, and the
          verdict.

### `[ ]` **7.5 Land the winning layout, or none — D5**

- _Goal:_ Only the winning duration source remains, with the anchors, every reader of them, and the classifier's
  check list replaced; or, when neither cleared, the current layout, anchors, and single unit job stand with no
  sequencer.

    - `[ ]` **7.5.a Replace the anchors and their readers**
        - When a source won: the balanced layout replaces the anchor matrix and the current jobs in `ci.yml`, and
          `ci_ok`'s `needs` follows the job IDs.
        - `parseWorkflowE2EAnchors`, `parseWorkflowE2EExclusions`, and `validateE2EShardMembership`
          (`src/lib/test-cost/shards.ts`) and their tests in `test-cost-shards.test.ts` are replaced.
        - `deriveEffectiveE2EShards` (`shard-run.ts`) computes membership from the same duration input CI uses, for
          `benchmark:test-cost:shards`; for the cache, that is a run's handed file, passed as an argument.
          `test-cost-shard-run.test.ts` follows.
        - The adopted layout's shard matrices are literal, so `workflowHeavyCheckNames` expands them, and
          `HEAVY_CHECK_NAMES` (`scripts/classify-change.sh`) and its copy in `classify-change.test.ts` name every
          leg.
        - The anchor step assertions in `review-gate-workflows.test.ts` are replaced.

    - `[ ]` **7.5.b Remove the losing source and the selector**
        - Either way, the sequencer then registers on every run.
        - If the cache won, the hand-kept list and the selector go. The weekly scheduled run widens from
          portability alone to every test tier and becomes the cache's standing writer beside `workflow_dispatch`:
          `setup`'s and `unit`'s `github.event_name != 'schedule'` and the pull-request-or-dispatch condition on
          `integration` and `e2e` admit it, and the `unitCondition` and `broadSuiteCondition` assertions in
          `review-gate-workflows.test.ts` follow.
        - If the hand-kept list won, the cache's restore, results-directory removal, upload, merge, and save steps and
          the selector go, and the restore and handoff leave `workflowHeavyCheckNames`'s admitted setup steps.
        - _Note:_ When the cache won, pull request runs restore nothing until a writer run on `main` saves a file;
          one `workflow_dispatch` on `main` right after the merge seeds it.

    - `[ ]` **7.5.c Remove the trial when neither source won**
        - The sequencer, both sources, the selector, and the trial jobs go, the cache's steps leaving
          `workflowHeavyCheckNames`'s admitted setup steps; the anchors, their readers, and the single unit job stay.

### `[ ]` **7.6 Annotate budget overage on the pull request's checks — D5**

- _Goal:_ An `over` budget reading shows on the pull request's checks as a warning naming the job, its overage, its
  budget, its baseline, and its observed time, while `within` stays quiet and no job fails on its budget.

    - `createCiTestBudgetReport` (`ci-budget.ts`) returns a GitHub Actions `::warning` annotation beside its
      job-summary warning, and `report-test-budget.ts` writes it to stdout, where Actions reads workflow commands.
    - Build `test-first` (one behavior at a time):
        - An `over` reading returns a `::warning` annotation naming the job, the baseline, and the budget
        - The job-summary warning names the baseline beside the budget
        - A `within` reading returns neither
        - An `over` reading returns its report without throwing, the script's only failing path

### `[ ]` **7.7 Layout decided** — validate exit criterion at segment scope

- _Goal:_ Evidence that the trial's runs and verdict are recorded, that only the winning layout (or none) remains on
  the branch, and that a test proves an `over` reading's annotation.

## **Phase 8:** Declaration-bound prompter

_Purpose:_ Build the one prompter, its branded declarations, and declared-value discovery, and prove the path end to
end on one prompt site before migrating the rest.

_Mode:_ `slice` — closes on one prompt site reached only through its declaration.

_Exit criterion:_ The stale-subdir prompt runs through the prompter from its branded, exported declaration in every
interaction context with today's output and exit status, and the scanner refuses an inline declaration and an
unresolved site argument.

### `[ ]` **8.1 Declare prompt sites through a branded declaring function — D7**

- _Goal:_ Only a dedicated declaring function produces the branded prompt-site type, which carries its question's
  form, and `contradiction()` refuses a prompt site whose policy the prompter cannot execute.

    - `[ ]` **8.1.a The branded type and its declaring function**
        - In `lib/command-input/declaration.ts`, beside `declareInteractionSite`, which keeps stdin, subprocess, and
          environment-policy sites.
        - The function takes the site's literal `id`, its question form (`confirm`, `select`, `text`, or `multiselect`),
          the declaring module and exported constant (`source: { file, symbol }`, as `safety.indeterminate-lifecycle` in
          `handlers/start.ts` has today), and its policy. Since the brand is erased at runtime, it marks the site
          `origin: "prompt"`, which `CommandInputSiteSchema` gains beside `syntax` and `declaration`, and records the
          form in a `form` field the schema also gains, so `contradiction()` can read it. The brand carries the form as
          a type parameter too.
        - Build `test-first` (one behavior at a time):
            - The declaring function returns a site the prompter's parameter type accepts, with `origin: "prompt"`
              and its `form`
            - A structurally identical object literal does not type-check there (a `@ts-expect-error` case checked by
              `typecheck:test`)

    - `[ ]` **8.1.b Prompt-site checks in `contradiction()`**
        - The kind, syntax, form, and cancellation checks apply to sites with `origin: "prompt"`; the `form` check
          also refuses a `form` on any other site.
        - Build `test-first` (one behavior at a time):
            - A prompt site declaring a kind other than `use-default`, `require-explicit`, `require-authority`,
              `proceed`, or `refuse` is refused
            - `require-explicit` or `require-authority` with empty `acceptedSyntax` is refused at a prompt site
            - `proceed` or `require-authority` on a form other than `confirm` is refused
            - A prompt site's `cancellation` other than `stop` or `safe-default` is refused
            - A prompt site without a `form`, or a `form` on any other site, is refused
            - An option site declaring `require-authority` with empty syntax still passes

### `[ ]` **8.2 Build the prompter and its outcome contract — D7**

- _Goal:_ One prompter answers every prompt site from its declared policy and returns `answered`, `refused` with the
  declared syntax, or `cancelled`; apart from what its renderer draws, it writes no output, sets no exit status, and
  never throws for a policy outcome.

    - A prompter module under `lib/command-input/` that takes a branded site, the interaction context, and the call's
      message, options, runtime default, and explicit answer, typed by the site's form so the answer's type follows
      it. Clack sits behind a renderer seam in its own module, the one place the prompter reaches clack.
    - Build `test-first` (one behavior at a time), against a fake renderer:
        - An explicit answer wins in every context
        - An interactive context renders through the renderer and returns `answered`
        - Forbidden `use-default` returns the call's runtime default
        - Forbidden `use-default` with no runtime default returns `refused` carrying `acceptedSyntax`
        - Forbidden `require-explicit` returns `refused` carrying `acceptedSyntax`
        - Forbidden `require-authority` answers `true` when `context.confirmation` is `accept`, and otherwise returns
          `refused` carrying its syntax
        - Forbidden `proceed` answers `true`
        - Forbidden `refuse` returns `refused` with empty syntax, even when `context.confirmation` is `accept`
        - An interactive cancellation returns `cancelled` under `stop`, and `answered` with the runtime default under
          `safe-default`
        - A `safe-default` cancellation with no runtime default returns `cancelled`
        - Apart from the renderer, no outcome writes output or sets an exit status

### `[ ]` **8.3 Discover prompt sites by declared value in the scanner — D7**

- _Goal:_ The source scanner finds each prompt site by the declared constant its call passes, so the call that passes
  a site is its locus, and an inline declaration, a site passed twice, an unresolved site argument, or a declared site
  no call passes is refused.

    - In `source-scanner.ts`, a call's site argument resolves through the file's own declarations and imports to a
      declared site, with today's single-file parsing and no type checker. Declarations usually sit in the handler
      module that asks the question (`userCommandInputPolicyDeclarations` in `handlers/user.ts`).
    - `reconcileCommandInputInventory` joins each `origin: "prompt"` declaration to its passing call by id, and that
      call becomes the entry's live source. Today's join reaches only declarations that name a line or a call selector,
      so a `{ file, symbol }` site is checked by `sourceExists` alone; the new join refuses a prompt site no call passes
      as `command-input.inventory.stale-source`. One site may still be listed under several commands with one policy.
    - The scanner skips the prompter's renderer module: its clack calls are the policy boundary rather than prompt
      sites, as `scanInteractionSource` skips `interaction-context.ts` for `process.env.CI`.
        - _Retired in:_ Phase 9
    - Today's callee-and-occurrence discovery keeps finding the clack calls not yet migrated.
        - _Retired in:_ Phase 9
    - Build `test-first` (one behavior at a time):
        - A prompter call passing an imported exported constant resolves to its declared site, with that call as the
          locus
        - A prompter call passing a constant exported from its own file resolves the same way
        - Two callers passing different sites to one wrapper are two sites
        - A site passed by more than one call is refused
        - A declaring-function call anywhere but an exported constant's initializer is refused
        - A site argument that neither resolves to a declared constant nor is a parameter of an enclosing function is
          refused
        - A parameter of an enclosing function is accepted as pass-through, including from a nested callback, as in
          `resolveIdentityWithPrompt`
        - A declared prompt site no call passes is refused by `reconcileCommandInputInventory`
        - The renderer module's clack calls are not discovered as prompt sites

### `[ ]` **8.4 Migrate the stale-subdir prompt end to end — D7**

- _Goal:_ The stale-subdir prompt in `handlers/user.ts` runs through the prompter from its branded, exported
  declaration, with today's output and exit status in every interaction context.

    - The site is declared with the prompt-site function as an exported `select` constant and passed by name to the
      prompter.
    - When interaction is forbidden the caller still logs `Keeping stale subdir user/<id>/<subdir>/
      (non-interactive).`, and on a cancellation it still returns silently.
    - Its inventory entry's locus is the passing call. `repository-inventory.test.ts` pins this site by its old
      identity (`user open:interaction.handlers-user.ts-prompt-p.select-1`) and counts declared sites by
      `source.interaction` beside a fixed list of four semantic sites; it follows the new id and origin. Its exact
      match of interaction-capable commands to `NO_INPUT_MATRIX` finds them by an `interaction.` id or a `--no-input`
      flag, and `user open` has no other, so it also counts `origin: "prompt"` entries. `NO_INPUT_MATRIX` stays green.
    - The proof of today's behavior: `user-handlers.test.ts`'s stale-subdir cases (default-keep prompt, non-interactive
      keep with its log line, inspect re-prompt, remove, and cancel) pass unchanged through its module mock of
      `@clack/prompts`, which now reaches the renderer, and `user.e2e.test.ts`'s non-TTY keep case runs the real
      forbidden path.
    - Any drift between the declaration and today's behavior is recorded in this task.

### `[ ]` **8.5 Prompter path proven** — validate exit criterion at segment scope

- _Goal:_ Evidence that the stale-subdir prompt runs through the prompter in interactive, forbidden, and cancelled
  contexts with today's output and exit status, and that the scanner refuses an inline declaration and an unresolved
  site argument.

## **Phase 9:** Prompt-site migration

_Purpose:_ Move every remaining prompt behind the prompter and confine clack to it, surfacing any drift between a
site's declaration and its hand-coded behavior.

_Mode:_ `replication` — closes when every prompt site is migrated and batch-verified.

_Exit criterion:_ No `@clack/prompts` prompt call remains outside the prompter, no `context.interaction` branch chooses
an answer a prompt site declares, `no-restricted-imports` confines `@clack/prompts` to the terminal module and the
prompter, every prompting handler takes a required interaction context, and each drift found is recorded in its task.

### `[ ]` **9.1 Migrate the init, join, reconfigure, and removal prompts — D7**

- _Goal:_ The ten prompts in `prompts/` reach the prompter only through their declarations, each command keeping its
  output and exit status in every interaction context.

- _Shape:_ Every batch in this phase follows the same rule. Each site is declared with the prompt-site function as an
  exported constant and passed by name. The declared `cancellation` replaces the site's `p.isCancel` handling. The
  caller keeps its output and exits, reading `context.interaction` only to choose what it presents. A branch on
  `context.interaction` that chooses an acquired value goes: the prompt is asked in every context, the value the branch
  chose becomes the call's runtime default at a `use-default` site, and a missing input becomes a refusal the caller
  gathers into its present report. A refusal keeps the caller's present report and exit status. Each drift found is
  fixed toward the declaration, unless the declaration is the wrong one, and recorded in its task.

    - `[ ]` **9.1.a `prompts/init-prompts.ts`**
        - Four calls. The prompt sites written as plain objects in `commands/init-input.ts` move to the prompt-site
          function.
        - The tools prompt sits in `promptTools`, which init's and join's prompts both call, so it takes its caller's
          site and context, and `runInitPrompts` passes init's tools site.
        - `resolveInitCommandInput` (`commands/init-input.ts`) calls its prompt callback in every context, and the
          values its forbidden branch builds today (`basename(cwd)`, `[]`, `"none"`, `false`) become the calls'
          runtime defaults. The interactive project-name default is the title-cased directory name
          (`titleCase(basename(cwd))`) and the forbidden one the bare name: a known drift candidate, resolved and
          recorded here.
        - The "Project name" and "Project Management options" notes (`runInitPrompts`) and `promptTools`'s "Skill
          installation" note print only when interaction is allowed, as they do today.

    - `[ ]` **9.1.b `prompts/reconfigure-prompts.ts`**
        - Three calls. The opening line and the team-mode warning still print only when interaction is allowed.
        - `handleReconfigure` (`handlers/init.ts`) reaches the same resolver, whose forbidden branch answers from the
          current configuration today; those current values become the reconfigure prompts' runtime defaults.

    - `[ ]` **9.1.c `prompts/join-prompts.ts` and `prompts/removal-prompts.ts`**
        - One call and two calls.
        - `runJoinPrompts` passes join's own tools site to `promptTools`. It replaces the `semantic.tools` declaration
          in `commands/join-input.ts`, and `repository-inventory.test.ts`'s fixed list of semantic sites loses
          `join:semantic.tools`.
        - `resolveJoinCommandInput` calls its prompt callback in every context, and its forbidden-branch values (the
          role `maintainer` or the current role, the current tools or `[]`) become the calls' runtime defaults.
        - `handleReconfigure`'s `resolveRemovalsNonInteractive` branch goes: the bulk removal select's runtime default
          is the classification defaults, the answer that branch gives today.
        - Join's "Role: contributor (via --contributor flag)" line, the removal summary (`resolveRemovalsInteractive`),
          and `handleReconfigure`'s "File changes detected." and "Applying changes..." spinner messages around it print
          only when interaction is allowed, as they do today.

### `[ ]` **9.2 Migrate the stub and work-class prompts — D7**

- _Goal:_ The three `handlers/lifecycle.ts` prompts reach the prompter only through their declarations, and
  `handleStub` still collects missing `--commitment` and `--priority` into one `Missing required input:` report.

    - The stub commitment and priority prompts, and the work-class prompt, by Task 9.1's rule. `handleStub` asks
      both prompts in every context, and each refusal adds its syntax to the one `Missing required input:` report;
      `handlePromote`'s work-class prompt refuses through the prompter in the same way.
    - The reports' `--commitment <provisional|planned>`, `--priority <P1|P2|P3>`, and `--class <Light|Heavy|Novel>`
      against the declared `--commitment <tier>`, `--priority <priority>`, and `--class <value>` are known drift
      candidates, resolved and recorded here.

### `[ ]` **9.3 Migrate the start and identity wrappers — D7**

- _Goal:_ Each call that passes a site to `confirmStep` (`handlers/start.ts`) or `resolveIdentityWithPrompt`
  (`handlers/shared.ts`) is its own prompt site, with the wrapper passing its caller's site and context through, and
  nothing outside the prompter answers either question.

    - `[ ]` **9.3.a `confirmStep` and its seven callers**
        - `confirmStep` takes the site and context from its caller, and its seven callers in `start.ts` are seven
          sites.
        - Start's indeterminate-lifecycle gate (`safety.indeterminate-lifecycle`) declares `interactive-only-override`
          with `refuse`. A refusal keeps `p.log.error(reason)` and exit status 1, and a decline or cancellation still
          logs `Start cancelled.`.
        - The other six are courtesy confirmations declaring `proceed`. `skipConfirm` and `courtesyAccepted` retire:
          start declares `--yes` as `compatibility`, which already forbids interaction, so the prompter's `proceed`
          answers wherever they skipped the question.
        - `repository-inventory.test.ts`'s fixed list of semantic sites loses `start:safety.indeterminate-lifecycle`.

    - `[ ]` **9.3.b The identity prompt**
        - Only `handlers/init.ts` and the fresh path of `handlers/join.ts` pass sites. The wrapper's `interactive` flag
          gives way to the site and context, and it hands `resolveIdentity` a prompt function that always asks the
          prompter, mapping `refused` and `cancelled` to no identity so the caller's present `--identity <name>`
          report stands.
        - Join's reconfigure path, which never resolves an identity, stops passing an identity callback.
        - The callers that pass `false` and never prompt (nine in `handlers/errand.ts`, two in `handlers/active.ts`)
          call `resolveIdentity({ exec })` directly.
        - The identity sites declare `use-default` (acquisition `safe-default`, `defaultSource` the slug of
          `git config user.name`) with `--identity <name>` as accepted syntax, replacing the `require-explicit`
          declarations in `commands/init-input.ts` and `commands/join-input.ts`. The declaration was the wrong one, so
          this drift resolves toward today's behavior.
        - `repository-inventory.test.ts`'s fixed list of semantic sites loses `join:semantic.identity`.

### `[ ]` **9.4 Migrate the sync and user prompts — D7**

- _Goal:_ The `sync`, `user sync`, and remaining `user` prompts reach the prompter only through their declarations,
  and the sync declaration that names one question twice retires.

    - `[ ]` **9.4.a `SyncOutput.confirm` and its caller**
        - `SyncOutput.confirm` (`lib/sync-output.ts`) passes its caller's site through, and its JSON-mode fallback that
          answers `false` and its `isCancel` retire. The declaration naming the question as both `ctx.output.confirm`
          (`handlers/sync.ts`) and `p.confirm` retires.
        - The notes-push prompt declares `require-authority`, but `handleSync` decides before it asks: `--yes`, which
          `sync` declares as `authority`, turns the `prompt` policy into `on-sync`, and a forbidden context degrades it
          to `manual`, saving only, with a warning. The prompter's `accept` answer matches today's push; the save-only
          degradation is a known drift candidate, resolved and recorded here.

    - `[ ]` **9.4.b `handlers/user-sync.ts` and `handlers/user.ts`**
        - Three calls and the remaining one; `user pull` still asks for a re-run with `--yes`.
        - `handleUserSync`'s notes push declares `require-authority` and skips its prompt on `--yes`, matching the
          prompter's `accept` answer, but degrades the `prompt` policy to `manual` in a forbidden context. That
          degradation is a known drift candidate, resolved and recorded here.
        - The conflict select declares `use-default` with a save-only default but offers only push, inspect, and
          cancel, and `handleConflict` saves only, before asking, when interaction is forbidden. That is a known
          drift candidate, resolved and recorded here.

### `[ ]` **9.5 Migrate the release-setup prompts — D7**

- _Goal:_ The `release setup install` and `uninstall` prompts reach the prompter only through their declarations,
  with install still writing its own `error:` line on a refusal.

    - `handlers/release/setup/install.ts` (five calls) and `uninstall.ts` (one call), by Task 9.1's rule.
    - `handleReleaseSetupInstall` asks its prompts in every context and gathers the refusals into its one
      `error: missing required input:` line, in today's order.
    - Its idempotency prompt declares `require-explicit` (`--idempotency-action <action>`) but answers `exit` when
      interaction is forbidden, and its report's `--mode <default-prompt|bypass>` names other syntax than the declared
      `--mode <mode>`. Both are known drift candidates, resolved and recorded here.
    - `handleReleaseSetupUninstall`'s cleanup-verification prompt refuses through the prompter, and the caller keeps
      its missing-evidence result.

### `[ ]` **9.6 Confine clack to one terminal module and the prompter — D7**

- _Goal:_ `@clack/prompts` is importable only by one terminal module and the prompter's renderer module, held there by
  `no-restricted-imports`, while handlers' presentation calls stay unchanged.

- _Note:_ A test file's `vi.mock("@clack/prompts")` (13 files today) still intercepts every importer through the
  re-export, since a module mock replaces the module for the test's whole module graph.

    - A terminal module re-exports clack's presentation calls (`log`, `intro`, `outro`, `note`, `spinner`,
      `cancel`), and every module still importing `@clack/prompts` (29 today) imports `p` from it. `isCancel` is not
      re-exported, since declared cancellation replaces each use.
    - `no-restricted-imports` confines `@clack/prompts` to that module and the renderer module, the prompter's only
      route to clack, as a row of Task 4.3's composed ban table, and the table test gains its scope.

### `[ ]` **9.7 Require the interaction context in prompting handlers and retire the prompt selector kinds — D7**

- _Goal:_ No prompting handler can run without an interaction context supplied by its caller, and the scanner
  identifies prompt sites only by their declared values.

    - The `suppliedContext ?? resolveProcessInteractionContext({ noInput: false, … })` fallback leaves the handlers
      that prompt; handlers that never prompt keep it.
    - Tests pass the context explicitly. About 140 direct test calls of prompting handlers pass none today
      (`handleStart` 42, `handleSync` 43, `handleUserSync` 30, the rest in single digits), and `start.test.ts`,
      `sync.test.ts`, `sync-orchestrator.test.ts`, and `user-handlers.test.ts` choose interactivity by mocking
      `resolveProcessInteractionContext`. One shared test helper builds an `InteractionContext` through the real
      `resolveInteractionContext` from named signals, and those mocks retire.
    - The `prompt` and `prompt-helper` kinds retire from `declareInteractionSite`, `declaration.ts`, and
      `source-scanner.ts`, along with callee-and-occurrence prompt discovery and, with nothing left for it to skip,
      the scanner's skip of the renderer module.

### `[ ]` **9.8 Reduce the no-input matrix's prompt-only entries — D7**

- _Goal:_ `NO_INPUT_MATRIX` runs each prompt policy kind once through the real CLI, each run naming the prompt site it
  reaches, while every command with another interaction kind still has its entry.

    - A prompt-kind entry names the prompt site its run reaches and asserts that kind's outcome when interaction is
      forbidden: the refusal's report for `require-explicit` and `require-authority`, the runtime default for
      `use-default`, the action taken for `proceed`, and the gate's message for `refuse`.
    - The reconciliation in `repository-inventory.test.ts` splits in two, replacing the `origin: "prompt"` count
      Task 8.4 added. Every command with an explicit stdin, subprocess, or environment-policy site, or a `--no-input`
      flag, has an entry, and the entries that name no prompt site belong to those commands, one per command. A
      command's prompt-kind entries count as its entry, so `start`, whose `proceed` and `refuse` sites take separate
      runs, carries those two entries and no third. The named sites cover every policy kind a prompt site declares, once
      each, and each belongs to its entry's command.
    - Entries of the seven prompt-only commands (`init`, `join`, `release setup install`, `release setup uninstall`,
      `user open`, `user pull`, `user sync`) that no kind needs are removed.
    - No entry today reaches a `require-authority`, `proceed`, or `refuse` prompt: `user pull` stops at `Remote
      unavailable`, `user sync` at `No remote configured`, and `start` at `cannot start`. Those kinds take runs that
      reach their sites, such as an unreachable origin for start's indeterminate-lifecycle gate, prepared through
      Task 5.2's templates.

### `[ ]` **9.9 Every prompt site migrated** — validate exit criterion at segment scope

- _Goal:_ Evidence that no clack prompt call remains outside the prompter, that no `context.interaction` branch
  chooses an answer a prompt site declares, that clack is confined, that every prompting handler takes a required
  context, and that each drift is recorded in its task.

## **Phase 10:** Closing measurement

_Purpose:_ Measure the final head with the baseline's instruments and settings, and re-record the budgets from it.

_Mode:_ `layer` — closes on the recorded closing measurement.

_Exit criterion:_ The closing measurement is recorded in `notes-test-suite-reliability.md` beside the baseline, and
`test-cost-budgets.json` holds rows re-recorded by the spec's budget rule.

### `[ ]` **10.1 Run the closing hosted runs**

- _Goal:_ Five consecutive first-attempt passes at the final head show the suite reliable on hosted runners, give the
  hosted cost medians, and confirm the Windows and macOS legs.

    - `[ ]` **10.1.a Five consecutive dispatch runs**
        - Full-suite `workflow_dispatch` runs at the final head, dispatched one at a time as in Task 1.2.b, every
          job green on its first attempt. A failed run
          restarts the count at the head that fixes it.
        - From each run's unit artifacts, every unit test's duration is under half its effective timeout.
        - The medians of run duration and summed test-job time are compared with the baseline's against the 20% bars.
        - `notes-test-suite-reliability.md` § Closing measurement records the head, the run IDs, and the medians.
        - Pushes these runs need are approved with this task list and take no separate approval.

    - `[ ]` **10.1.b The portability pair**
        - One further dispatch run at the final head with `run_portability_pair` on passes its Windows and macOS
          portability legs, and its run ID is recorded beside the five.

### `[ ]` **10.2 Re-measure every tier locally**

- _Goal:_ Native-tooling cost and E2E summed file time at the head the closing runs passed on are measured with the
  baseline's instrument and settings, for comparison with the 40% and 20% bars.

    - Three `npm run benchmark:test-cost` runs each for the `unit`, `integration`, and `e2e` project sets, with the
      baseline's settings, and three for `lane`, which only the budget file's `lane` row reads. Three-run medians are
      recorded in `notes-test-suite-reliability.md` § Closing measurement.

### `[ ]` **10.3 Re-record the test-cost budgets — D5**

- _Goal:_ `test-cost-budgets.json` reflects the final suite: one CI row per test job of the adopted layout and one
  tier-isolated row for each of the `unit`, `integration`, `lane`, and `e2e` project sets, each budgeted by the spec's
  rule.

    - CI-job rows come from Task 10.1's five runs and tier-isolated rows from Task 10.2's captures; each row's
      baseline is the median of its measurements.
    - `allowanceFraction` becomes the smallest multiple of 5% under which every one of those measurements falls
      within its row's budget, and each `budgetMs` is its baseline times one plus that allowance, rounded as the
      present rows are. `budget.ts` only loads and evaluates the file, so the rows are written by hand.
    - One dispatch run at the recording head confirms the re-recorded file changes no test outcome.
    - Pushes this run needs are approved with this task list and take no separate approval.

## **Phase 11:** Verification

### `[ ]` **11.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The baseline is recorded in `notes-test-suite-reliability.md`, with run IDs and capture paths, before the
  first commit of any optimizing phase, and every hosted unit-job run uploads a report carrying each test's duration
  and effective timeout

- `[ ]` Five consecutive full-suite `workflow_dispatch` runs at the final head pass with every job green on its first
  attempt, and in each, every unit test's duration is under half its effective timeout

- `[ ]` One further dispatch run at the final head, with `run_portability_pair` on, passes its Windows and macOS
  portability legs

- `[ ]` `npm test` passes with `FORCE_COLOR=3` set, and a unit test proves the shared copy helper skips a transient
  `*.bundled_*.mjs` file while copying an untracked module

- `[ ]` Native-tooling cost is at least 40% below its baseline (local instrument, three-run medians)

- `[ ]` E2E summed file time is at least 20% below its baseline (local instrument, three-run medians)

- `[ ]` The median run duration of the five closing runs is at least 20% below the baseline median

- `[ ]` The median summed test-job time of the five closing runs is at least 20% below the baseline median

- `[ ]` The layout trial's runs and verdict are recorded, and either only the winning duration source landed, with
  the anchors and their readers replaced, or the current layout, anchors, and single unit job stand with no
  sequencer

- `[ ]` `test-cost-budgets.json` holds rows re-recorded by the budget rule for every job of the final layout and
  every tier, and a test proves an `over` reading emits a `::warning` annotation naming the baseline and the budget

- `[ ]` Tests prove, in both unit projects, that a launch from a file off the allowlist fails its test even when the
  error is caught, that an allowlisted file can launch, that a file using esbuild is counted for its own service
  whatever ran before it in the worker, and that a run in which an allowlisted file ran whole and launched nothing
  fails naming it, even when the run names its own reporters

- `[ ]` The one-hop bans are ESLint rules in `eslint.config.js`, the source-scan cases they replace are gone, and
  each deleted change-detector or toolchain-redundant case records its survival-rule verdict in its task

- `[ ]` Tests prove the staleness check is skipped only with a matching token, a test-controller operation, and a
  live lease, and that a build holder, an expired lease, a missing token, or a lock file that is absent, empty,
  corrupt, or unreadable runs it

- `[ ]` No `@clack/prompts` prompt call remains outside the prompter, and `no-restricted-imports` confines
  `@clack/prompts` to the terminal module and the prompter

- `[ ]` No branch on `context.interaction` chooses an answer a prompt site declares; each such site is asked in every
  interaction context

- `[ ]` A unit table test runs the real prompter against a fake renderer and covers each policy kind, each outcome,
  and each cancellation kind

- `[ ]` Every prompting command keeps its present output and exit status in each interaction context, except drift
  fixes recorded in their tasks

- `[ ]` `contradiction()` refuses a prompt site with an unsupported kind, with a syntax-carrying kind and empty
  `acceptedSyntax`, with `proceed` or `require-authority` on a form other than `confirm`, or with a `cancellation`
  other than `stop` or `safe-default`

- `[ ]` Every prompt site is reached only through its branded, exported declaration, and each drift found during
  migration is recorded in its task

- `[ ]` The `testing-standards` override and `strategy-testing-methodology.md` carry the testing rules and tier
  lines, and `TECHNICAL-OVERVIEW.md` § 4 agrees with them

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

- `[ ]` A1's frozen baseline records the head, retained local and hosted attempts, conclusions, settings, capture
  paths, and sample limits before fixes; no diagnostic substitutes for an ordinary sample (supersedes the original
  baseline sampling criterion)

- `[ ]` Closing E2E summed file time's three-run median is at least 20% below the frozen single ordinary baseline
  sample with its missing noise estimate explicit (A1; supersedes the original E2E comparison criterion)

- `[ ]` A2 changes only the two measured refusal-source-totality cases' named timeout; their assertions and scan
  behavior stay intact, and the timeout exceeds 3.4 times their frozen hosted maximum

- `[ ]` A3's native ESLint proofs preserve loader aliases, inline factories, relative-target resolution, and
  type-only/eager exceptions while accepting valid lookalikes and Result/store seams; resolved configuration
  composes every matching predicate ID, and equivalent native lint proof precedes each source-scan replacement
