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
        - _Amended in:_ 10.R (A6)

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

### `[x]` **4.4 Narrow the command-schema registry scan — D3**

- _Goal:_ The "registers every command-owned schema" case in `command-input/registry.test.ts` scans only what it
  reads.

- _Outcome:_ The live registry assertion reads and parses only cli.ts through `scanCommanderSource`, preserving
  command-path and schema-ID equality without the repository interaction snapshot. Its named scan timeout is
  removed; the same case runs under the ordinary unit default.

### `[x]` **4.5 Measure the remaining scan cost and decide on a shared parse — D3**

- _Goal:_ Whether a shared cached parse earns its place is decided from a measurement taken after Tasks 4.1–4.4, not
  assumed.

- _Outcome:_ Three ordinary unit captures reconcile the original 26-file set at 19,307.791 ms median, a 61.19%
  reduction and 12.807% median share of unit summed file time. No repeated full-src AST walk remains; the one shared
  snapshot and unlike subtree/named scans do not justify a cache. Notes § Remaining source-scan cost and
  shared-parse decision records the evidence and decision; no additional mechanism is introduced.

## **Phase 5:** E2E fixture cost and the managed-run staleness skip

_Purpose:_ Cut E2E's per-spawn and per-case fixture cost: skip the staleness check only for a managed run's own
processes, and build each repeated fixture once.

_Mode:_ `slice` — closes on a managed E2E run whose own CLI children skip the staleness check.

_Exit criterion:_ Under the test controller, CLI children skip the staleness check only with a matching token, a
test-controller operation, and a live lease; the `--no-input` matrix runs each distinct invocation once from a
template; and E2E summed file time is measured against the baseline.

### `[x]` **5.1 Skip the per-spawn staleness check for a managed test run's own processes — D4**

- _Goal:_ A built-CLI process started by a managed test run skips `checkDevBuildStaleness` only while it carries the
  live test controller's token, and every other process runs the check as today: a build holder's, a developer's own
  `npx arc`, or one started after the run released its lock.

    - `[x]` **5.1.a The skip decision over one tolerant holder read**
        - `shouldSkipDevBuildStaleness` accepts one existing holder classification and requires the inherited token,
          test-controller operation and future lease together. Every absent/unsettled read and invalid ownership
          condition retains the ordinary check; Notes § Managed freshness decision records native fail-first proof.

    - `[x]` **5.1.b Export the controller's token to its children**
        - The artifact capability carries its acquired token; test ownership exports `ARC_TEST_CONTROLLER_TOKEN`
          only during its action and restores the prior value or absence on return and throw. Native lease/environment
          proofs cover propagation and restoration; the staged publication fixture supplies its fake token.

    - `[x]` **5.1.c Consult it in the CLI's stale-build guard**
        - The synchronous `runDevBuildGuard` owns holder/freshness/output/exit boundaries; cli.ts calls it and
          assigns explicit refresh eligibility. Matching managed children bypass freshness reads; ordinary refusal,
          compaction continuation, silent adopter handling and fresh refresh-command eligibility remain intact.

    - `[x]` **5.1.d Prove the skip in a managed run**
        - A real fixture controller owns and prepares its guard-calling CLI; its inner worker changes source and
          observes the inherited child succeed while the tokenless child refuses as stale. Narrow fixture-only
          reconstructions fail each outcome before the actual proof passes; Notes retain the native evidence.

- _Outcome:_ Managed CLI children avoid freshness work only while their matching test-controller lease is live;
  unavailable holder reads and every ordinary process retain qualification. Token lifetime, synchronous admission,
  diagnostics and refresh eligibility are proved together, with the existing controller/closing protocol unchanged.

### `[x]` **5.2 Run each distinct `--no-input` invocation once from a prepared template — D4**

- _Goal:_ `command-input-no-input.e2e.test.ts` runs each distinct invocation once against a copy of one prepared
  repository and still enforces the exact match between `NO_INPUT_MATRIX` and live interaction sites.

    - `[x]` **5.2.a Run each distinct invocation once**
        - The actual CLI transport predicate selects one pipe representative and every pseudo-TTY signal: Linux
          runs 144 invocations across 45/6/29 groups; Windows/macOS run 80 because all transports are pipes. Exact
          argv, stdin, outcome and worktree-preservation assertions remain; Notes record the platform interpretation.

    - `[x]` **5.2.b Build the initialized repository once**
        - One initialized template serves 75 ordinary entries through independent per-invocation copies. Three
          bare and two stub fixtures retain their own setup; the standalone progress/stdin cases and exact live
          interaction-site match remain unchanged.

- _Outcome:_ The matrix preserves every entry and outcome while sharing initialized setup and selecting only distinct
  interaction contexts. The CLI helper and invocation planner share transport authority, with platform differences
  recorded in Notes § Distinct no-input invocations.

### `[x]` **5.3 Build the remaining repeated E2E fixtures once — D4**

- _Goal:_ `session-init`, `teardown-stale-projection`, and `publication-spine` each build their repeated fixture
  once and copy it per case, with every case's outcome unchanged.

    - `[x]` **5.3.a A prepared shape for a sibling linked worktree**
        - The sibling shape returns independently owned repository, parent and worktree paths. Copying both
          directories rewrites the linked checkout's Git pointer and the primary registry's gitdir; real Git proves
          the copied path appears in its own registry and commands resolve to its copied common directory.

    - `[x]` **5.3.b Teardown veto cases from one prepared archived feature**
        - One archived-feature template serves all 11 veto cases through sibling copies. Each copy still runs
          teardown to produce its own husk before mutating evidence, then retains the original refusal/repair outcome.

    - `[x]` **5.3.c Session-init and publication-spine**
        - One uncommitted initialized template serves all 30 session-init cases, preserving each case's commits,
          worktree, remote and publisher setup. The three at-cap convergence cases copy one complete template and
          retain its candidate identity, reviewed head, staged state and continuation payload.

- _Outcome:_ All repeated fixtures now build once and give each case independent paths and state. Existing assertions
  remain intact across sibling teardown, uncommitted initialization and at-cap publication; Notes § Remaining prepared
  E2E fixtures records the native proofs and preservation of the convergence setup's original deadline.

### `[x]` **5.4 E2E cost cut** — validate exit criterion at segment scope

- _Goal:_ Evidence that a managed E2E run's CLI children skip the staleness check only under the three conditions,
  that the `--no-input` matrix runs each distinct invocation once from a template, and that E2E summed file time,
  from the local instrument's `e2e` project set as three-run medians, is measured against
  `notes-test-suite-reliability.md` § Baseline.

- _Outcome:_ The three-condition managed admission, distinct-context matrix and independent fixture copies close
  together. E2E summed file time has a three-run median of 1,898,572 ms, 31.9% below the frozen ordinary sample;
  Notes § E2E fixture exit measurement retains the comparison, raw evidence and single-sample uncertainty.

## **Phase 6:** Testing policy and the unit spawn guard

_Purpose:_ State the rules this work applies where agents load them, and hold the unit tier's no-spawn line with a
runtime guard and an allowlist floor.

_Mode:_ `layer` — closes on an enforced unit-tier policy.

_Exit criterion:_ A launch from a file off the allowlist fails its test even when the error is caught, a run fails
naming an allowlisted file that ran whole and launched nothing, and the override, strategy, and
`TECHNICAL-OVERVIEW.md` agree.

### `[x]` **6.1 State the testing policy in the override, strategy, and technical overview — D6**

- _Goal:_ An agent writing tests loads the operative rules from the `testing-standards` override, the strategy
  carries their reasoning and worked examples, and `TECHNICAL-OVERVIEW.md` § 4 describes the same tier lines.

    - `[x]` **6.1.a The override**
        - The project-only override states linter ownership, outcome-class matrices and hermetic bounded processes;
          unit excludes native launches/builds/Git beyond its explicit legacy floor, and filesystem injection is
          reserved for fault/observation tests. The universal default and package copy remain byte-identical.

    - `[x]` **6.1.b The strategy**
        - The strategy explains local lint enforcement and native outcome classes, using the five filesystem
          publication refusals and separate node-check refusal. Unit admits temporary filesystem fixtures;
          integration owns native processes and Git, with filesystem injection only where the proof requires it.

    - `[x]` **6.1.c The technical overview**
        - The overview's unit and integration descriptions match the operative tier boundaries and explicit legacy
          spawn floor, including filesystem fixtures in unit and native tools in integration.

- _Outcome:_ The operative override, rationale and tier map agree on where each proof belongs. Filesystem fixtures
  remain lightweight unit evidence; native runs prove distinct external outcome classes, and existing launch exceptions
  are explicit shrinking debt rather than permission for new unit launches.

### `[x]` **6.2 Guard unit-tier launches from the shared setup file — D6**

- _Goal:_ In both unit projects, a process launch from a test file off the allowlist fails that test even when the
  error is caught, an allowlisted file still launches, and a file using esbuild is counted for its own service
  whatever ran before it in the worker.

    - `[x]` **6.2.a Replace the launch functions**
        - One stable builtin installation refreshes the current-file admission across repeated setup imports and
          guards all seven native launch functions, including their own promisify custom forms. Native fixture cases
          cover direct/named/execa and promisified refusal plus admitted output under both isolation settings.

    - `[x]` **6.2.b Fail the test on a caught launch**
        - Per-file attempt/block ledgers and per-test starting snapshots make swallowed refusals fail afterEach;
          a file-ending check catches collection and suite-hook refusals. Native fixtures prove helper/execa catches
          and caught beforeAll/afterAll launches fail in both unit projects, with the original admission cases intact.

    - `[x]` **6.2.c Per-file esbuild service and the allowlist**
        - The installer stops esbuild at file end and the next setup boundary. Same-worker native fixtures prove
          each file starts its own service and an excluded later file cannot reuse it. The full guarded unit audit
          and platform reads establish eight legacy files; Notes records their launch counts and platform exceptions.

- _Outcome:_ Both unit projects enforce native admission, including swallowed and suite-hook refusals. Builtin
  installation survives repeated imports without stacking wrappers, and esbuild lifetime follows each file;
  Notes § Unit native launch admission retains the inventory and behavioral reconstruction evidence.

### `[x]` **6.3 Fail a run whose allowlisted file ran whole and launched nothing — D6**

- _Goal:_ A run fails at its end naming every allowlisted file that ran whole and launched nothing, even when the run
  names its own reporters, so the allowlist stays a floor.

    - `[x]` **6.3.a Write each test's launch count and allowlist membership into its metadata**
        - The guard writes cumulative launch counts and membership after each case, with final file metadata
          retaining suite-hook launches after the last case. Shared metadata keys connect the guard and controller.

    - `[x]` **6.3.b Check the floor beside the completion check**
        - `checkVitestUnitLaunchFloor` reads native result metadata after completion and names every wholly-run idle
          exception, preserving earlier failure status and partial-file exemptions. Native JSON-reporter fixtures
          prove idle refusal and afterAll-only admission; older controller fakes now expose the consumed public API.

- _Outcome:_ Tier, focused and cost controllers apply the same floor independently of reporter selection. A final
  suite-hook launch prevents false idle reporting, while skipped/name-filtered files keep their accepted exemption;
  Notes § Controller-held launch floor retains the evidence and fixture correction.

## **Phase 7:** CI layout trial and budget visibility

_Purpose:_ Retry duration-balanced layouts once the CPU work has landed, adopt one only on evidence, and put budget
overage where reviewers look.

_Mode:_ `slice` — closes on a layout decided by hosted evidence.

_Exit criterion:_ The trial's runs and verdict are recorded, only the winning layout (or none) remains on the branch,
and a test proves an `over` budget reading emits a `::warning` annotation naming the baseline and the budget.

### `[x]` **7.1 Measure the trial's reference and its weights — D5**

- _Goal:_ The reference run duration, each project's estimate, and the hand-kept list's durations are all measured
  at the head the trial starts from, after the CPU work has changed the durations the baseline recorded.

    - `[x]` **7.1.a Reference runs**
        - Three sequential current-layout dispatches at `7fd1ecf07`, portability pairing off, establish the
          reference. Raw run/job/log evidence and unit artifacts are retained in `layout-reference/`.

    - `[x]` **7.1.b The estimates and the list's durations**
        - Pooled project medians and six heavy-file medians populate `heavy-first-durations.ts`.
          `notes-test-suite-reliability.md` § Layout trial records the head, observations and adoption ceiling.

### `[x]` **7.2 Restore the duration-balanced sequencer — D5**

- _Goal:_ Given the same duration input, every shard process assigns each file to the same shard, so shards
  partition the suite exactly with heavy files spread by weight, and files with recorded durations start slowest
  first.

    - `[x]` **7.2.a Rebuild the restored sequencer with a total-order `shard()` and a duration-weighted `sort()`**
        - The restored sequencer partitions stable project/path identities by descending weight and least load,
          reads one immutable duration source, and prioritizes recorded files over native fallback order.
          Native-wrapper tests cover assignment and sorting; the six-file existence check remains.

    - `[x]` **7.2.b Register it only when a run selects a duration source**
        - Native configuration selects the sequencer only for either trial source, leaving reference runs intact.
            - _Retired in:_ Phase 7

### `[x]` **7.3 Wire both duration sources and the trial selector into CI — D5**

- _Goal:_ A `workflow_dispatch` run can drive the sequencer from either duration source on a trial layout, every shard
  of one run reads the same input, and only writer runs save the cache.

    - `[x]` **7.3.a The results-cache handoff**
        - Setup restores or prepares one tier input artifact; shards clear inherited native results before running.
          A successful writer run merges disjoint complete-key memberships and saves a unique cache key.
          Setup admission permits only its exact preparer and restore action, retaining rejection coverage.

    - `[x]` **7.3.b The selector and the trial jobs**
        - Dispatch selects either source and JSON shard matrices. Trial jobs share inputs and retain per-shard unit
          reports; ordinary jobs use the opposite gate. Portability conditions remain intact.
            - _Retired in:_ Phase 7

### `[x]` **7.4 Run the source runs and record the verdict — D5**

- _Goal:_ The layout that lands, or none, is chosen by the adoption bar on hosted evidence, with every counted run,
  source, and verdict recorded.

    - `[x]` **7.4.a Source runs**
        - Four sequential counted dispatches at `8c3404c11` finish below the measured adoption ceiling;
          both cache runs restore a saved input and every last test job is E2E. Raw evidence retains each run.

    - `[x]` **7.4.b The verdict**
        - Both sources clear. Cache wins the specified median comparison; Notes § Counted source runs and adoption
          retains the exact heads, timings, cache keys, critical paths and verdict.

### `[x]` **7.5 Land the winning layout, or none — D5**

- _Goal:_ Only the winning duration source remains, with the anchors, every reader of them, and the classifier's
  check list replaced; or, when neither cleared, the current layout, anchors, and single unit job stand with no
  sequencer.

    - `[x]` **7.5.a Replace the anchors and their readers**
        - Canonical jobs use literal balanced matrices: two unit, four integration and four E2E legs.
          Native collection uses the handed duration file; partition readers, workflow contracts and classifier
          check names follow the matrices, with `ci_ok` retaining the canonical job IDs.

    - `[x]` **7.5.b Remove the losing source and the selector**
        - The unconditional sequencer reads only the handed native cache and measured project fallback weights.
          Dispatch and weekly schedules write complete tier caches; pull requests only consume shared inputs.
          The hand-kept list, source selector and trial jobs are removed.

    - `[~]` **7.5.c Remove the trial when neither source won**
        - Inapplicable because the cache source won; the balanced layout remains.

- _Outcome:_ The adopted collector exactly reproduces all four hosted E2E memberships from the winning run's
  handed file. Writer triggers admit every tier even for a light classification; after merge, one dispatch on `main`
  seeds its pull-request cache. Notes § Counted source runs and adoption retains the evidence and trigger adjustment.

### `[x]` **7.6 Annotate budget overage on the pull request's checks — D5**

- _Goal:_ An `over` budget reading shows on the pull request's checks as a warning naming the job, its overage, its
  budget, its baseline, and its observed time, while `within` stays quiet and no job fails on its budget.

- _Outcome:_ The report supplies one baseline-bearing overage message to its Actions warning and step summary;
  the native reporter writes the warning to stdout and preserves advisory success. Within-budget results stay quiet.
  `notes-test-suite-reliability.md` § Budget annotation evidence retains the policy and native-output proofs.

### `[x]` **7.7 Layout decided** — validate exit criterion at segment scope

- _Goal:_ Evidence that the trial's runs and verdict are recorded, that only the winning layout (or none) remains on
  the branch, and that a test proves an `over` reading's annotation.

- _Outcome:_ The segment scenario confirms four counted runs, the cache verdict and only its adopted layout.
  The budget contract proves the baseline-bearing warning and advisory outcome; Notes § Layout segment scenario
  records the executable checks.

## **Phase 8:** Declaration-bound prompter

_Purpose:_ Build the one prompter, its branded declarations, and declared-value discovery, and prove the path end to
end on one prompt site before migrating the rest.

_Mode:_ `slice` — closes on one prompt site reached only through its declaration.

_Exit criterion:_ The stale-subdir prompt runs through the prompter from its branded, exported declaration in every
interaction context with today's output and exit status, and the scanner refuses an inline declaration and an
unresolved site argument.

### `[x]` **8.1 Declare prompt sites through a branded declaring function — D7**

- _Goal:_ Only a dedicated declaring function produces the branded prompt-site type, which carries its question's
  form, and `contradiction()` refuses a prompt site whose policy the prompter cannot execute.

    - `[x]` **8.1.a The branded type and its declaring function**
        - `declarePromptSite` validates and freezes exported-site policy, recording prompt origin and form.
          Its erased private brand carries the form and validated policy kinds; structural lookalikes fail types.

    - `[x]` **8.1.b Prompt-site checks in `contradiction()`**
        - Prompt-only checks reject unsupported kinds, missing syntax, incompatible forms and cancellation policy;
          forms on other origins are refused. Non-prompt option authority with empty syntax remains valid.

### `[x]` **8.2 Build the prompter and its outcome contract — D7**

- _Goal:_ One prompter answers every prompt site from its declared policy and returns `answered`, `refused` with the
  declared syntax, or `cancelled`; apart from what its renderer draws, it writes no output, sets no exit status, and
  never throws for a policy outcome.

- _Outcome:_ `prompter.ts` owns policy, `prompt-types.ts` binds invocation values to forms, and `prompt-renderer.ts`
  owns Clack. Explicit false/empty values remain answers; refused syntax is carried for caller-owned reports.
  `notes-test-suite-reliability.md` § Declared prompt policy substrate retains the boundary proofs.

### `[x]` **8.3 Discover prompt sites by declared value in the scanner — D7**

- _Goal:_ The source scanner finds each prompt site by the declared constant its call passes, so the call that passes
  a site is its locus, and an inline declaration, a site passed twice, an unresolved site argument, or a declared site
  no call passes is refused.

- _Outcome:_ `prompt-source.ts` resolves constants/imports and lexical parameters from shared parsed files;
  the inventory joins prompt ids to passing calls, refusing duplicate and dangling sites while preserving shared policy.
    - The renderer's Clack calls are excluded from command-owned discovery.
        - _Retired in:_ Phase 9
    - Remaining Clack calls retain callee-and-occurrence discovery.
        - _Retired in:_ Phase 9

### `[x]` **8.4 Migrate the stale-subdir prompt end to end — D7**

- _Goal:_ The stale-subdir prompt in `handlers/user.ts` runs through the prompter from its branded, exported
  declaration, with today's output and exit status in every interaction context.

- _Outcome:_ `staleSubdirPromptSite` carries the existing safe keep policy, and every context reaches its passing
  `prompt` call. Forbidden interaction retains the keep log; cancellation returns silently through the safe default.
  Inventory counts prompt origin and names the new id; existing handler cases and the real non-TTY case retain behavior.
  No policy drift was found; Notes § Stale-subdirectory prompt path retains the evidence.

### `[x]` **8.5 Prompter path proven** — validate exit criterion at segment scope

- _Goal:_ Evidence that the stale-subdir prompt runs through the prompter in interactive, forbidden, and cancelled
  contexts with today's output and exit status, and that the scanner refuses an inline declaration and an unresolved
  site argument.

- _Outcome:_ Existing interactive keep/inspect/remove/cancel cases and the native forbidden case exercise the
  declaration-bound path. Scanner scenarios refuse inline declarations and unresolved arguments, closing the slice;
  Notes § Stale-subdirectory prompt path retains the scenario evidence.

## **Phase 9:** Prompt-site migration

_Purpose:_ Move every remaining prompt behind the prompter and confine clack to it, surfacing any drift between a
site's declaration and its hand-coded behavior.

_Mode:_ `replication` — closes when every prompt site is migrated and batch-verified.

_Exit criterion:_ No `@clack/prompts` prompt call remains outside the prompter, no `context.interaction` branch chooses
an answer a prompt site declares, `no-restricted-imports` confines `@clack/prompts` to the terminal module and the
prompter, every prompting handler takes a required interaction context, and each drift found is recorded in its task.

### `[x]` **9.1 Migrate the init, join, reconfigure, and removal prompts — D7**

- _Goal:_ The ten prompts in `prompts/` reach the prompter only through their declarations, each command keeping its
  output and exit status in every interaction context.

    - `[x]` **9.1.a `prompts/init-prompts.ts`**
        - Four exported declarations reach the prompter with explicit values and runtime defaults. The resolver
          invokes its callback in every context, and presentation notes remain interactive-only.
          The directory-name drift resolves to the declared bare name; Notes § Installer prompt migration records it.

    - `[x]` **9.1.b `prompts/reconfigure-prompts.ts`**
        - Three exported declarations use current settings as runtime defaults; opening and team-mode warning
          messages remain interactive-only. Reconfigure always reaches the common acquisition callback.

    - `[x]` **9.1.c `prompts/join-prompts.ts` and `prompts/removal-prompts.ts`**
        - Join passes its own tools site through the shared wrapper, replacing `semantic.tools`. Both removal
          declarations use classification defaults through one resolver; presentation and spinner messages retain
          their interactive gates. Join's callback runs in every context with current role/tools defaults.

- _Outcome:_ Every installer prompt now answers from declared policy instead of a forbidden-context value branch.
  Existing cancellation/reporting contracts remain, and the shared tools wrapper preserves caller-owned sites.
  Notes § Installer prompt migration retains the behavior proofs and the project-name drift correction.

### `[x]` **9.2 Migrate the stub and work-class prompts — D7**

- _Goal:_ The three `handlers/lifecycle.ts` prompts reach the prompter only through their declarations, and
  `handleStub` still collects missing `--commitment` and `--priority` into one `Missing required input:` report.

- _Outcome:_ Three exported select sites own commitment, priority and promotion class acquisition. Stub asks both
  required questions in every context and collects refused syntax into its existing single report; promotion uses
  the same outcome path for unresolved class. Missing-input placeholders now match the declarations; Notes § Lifecycle
  prompt migration records all three drift corrections and native refusal proofs.

### `[x]` **9.3 Migrate the start and identity wrappers — D7**

- _Goal:_ Each call that passes a site to `confirmStep` (`handlers/start.ts`) or `resolveIdentityWithPrompt`
  (`handlers/shared.ts`) is its own prompt site, with the wrapper passing its caller's site and context through, and
  nothing outside the prompter answers either question.

    - `[x]` **9.3.a `confirmStep` and its seven callers**
        - Seven caller-owned declarations pass site/context through `confirmStep`; courtesy skip state retires.
          Safety refusals and all cancellation reports retain their behavior. The inventory joins each caller by id;
          Notes § Start and identity prompt wrappers records declaration placement and the shrunk size baseline.

    - `[x]` **9.3.b The identity prompt**
        - Fresh init/join pass their own text site and context; non-prompting callers use the plain identity resolver,
          and join reconfiguration drops its identity callback. Both sites declare the settled Git-name default,
          replacing the incorrect explicit-only policies. Notes § Start and identity prompt wrappers retains proof.

### `[x]` **9.4 Migrate the sync and user prompts — D7**

- _Goal:_ The `sync`, `user sync`, and remaining `user` prompts reach the prompter only through their declarations,
  and the sync declaration that names one question twice retires.

    - `[x]` **9.4.a `SyncOutput.confirm` and its caller**
        - One exported notes-push site replaces duplicate declarations; the output wrapper forwards policy/context
          in both modes. Configured prompt policy stays in metadata, and prompter-accepted authority preserves the
          paired executor's save-before-publication and partial-push recovery guarantees.

    - `[x]` **9.4.b `handlers/user-sync.ts` and `handlers/user.ts`**
        - All four questions use their own sites. Conflict selection returns the declared save-only default;
          explicit push direction enters the downstream question as an explicit answer. Overwrite refusals retain
          their reports, and interactive decline/cancellation retain their behavior.

- _Outcome:_ Both notes-push degradation drifts resolve toward declared authority: local saves remain, while
  unavailable publication authority now reports a failing refusal and `--yes` remedy. Sync policy metadata retains
  configuration rather than a substituted answer. Notes § Sync and user prompt migration records behavior and proof.

### `[x]` **9.5 Migrate the release-setup prompts — D7**

- _Goal:_ The `release setup install` and `uninstall` prompts reach the prompter only through their declarations,
  with install still writing its own `error:` line on a refusal.

- _Outcome:_ Six exported sites acquire release setup values/evidence through the prompter. Install aggregates
  unavailable inputs in its existing order, while cancellation/decline stop immediately; cleanup retains its results.
  Recorded setup now requires an explicit idempotency choice, and the mode report matches `--mode <mode>`.
  Notes § Release setup prompt migration records both drift corrections and the real CLI proofs.

### `[x]` **9.6 Confine clack to one terminal module and the prompter — D7**

- _Goal:_ `@clack/prompts` is importable only by one terminal module and the prompter's renderer module, held there by
  `no-restricted-imports`, while handlers' presentation calls stay unchanged.

- _Outcome:_ `lib/terminal.ts` exposes the six presentation exports; all 27 remaining presentation importers
  route through it. The composed source-wide Clack ban exempts exactly that module and the prompt renderer while
  retaining the other architecture restrictions. See `notes-test-suite-reliability.md` § Terminal presentation boundary.

### `[x]` **9.7 Require the interaction context in prompting handlers and retire the prompt selector kinds — D7**

- _Goal:_ No prompting handler can run without an interaction context supplied by its caller, and the scanner
  identifies prompt sites only by their declared values.

- _Outcome:_ All eleven prompting entrypoints require caller-supplied contexts. One shared test helper uses the
  real resolver; the four process-context mocks retire and 140 direct calls pass context explicitly. Prompt occurrence
  selectors, raw Clack/output-helper discovery and the renderer exception retire together; declared-value joins remain.
  See `notes-test-suite-reliability.md` § Required interaction contexts and declared-only discovery.

### `[~]` **9.8 Reduce the no-input matrix's prompt-only entries — D7**

- _Goal:_ `NO_INPUT_MATRIX` runs each prompt policy kind once through the real CLI, each run naming the prompt site it
  reaches, while every command with another interaction kind still has its entry.

    - _Amended in:_ 9.8.R (A4)

- _Outcome:_ Superseded by A4's explicit separation of reachable native prompt cases and the stricter upstream
  start refusal. The original refusal-site reach claim is not fulfilled or counted as native prompt evidence.

### `[x]` **9.8.R Cover reachable prompt kinds and retain the native start safety refusal — A4**

- _Goal:_ A4's matrix proves the four reachable prompt kinds through their own named sites, preserves non-prompt
  command coverage, and records the sole unreachable prompt's direct proof separately from native upstream refusal.

- _Outcome:_ Four named native cases reach their own command’s declared prompt policy; the separate start
  upstream case proves the earlier safety refusal without claiming prompt reachability. Reconciliation retains
  every non-prompt command and the sole direct-proof exception. See `notes-test-suite-reliability.md` § Amendment A4.

### `[x]` **9.9 Every prompt site migrated** — validate exit criterion at segment scope

- _Goal:_ Evidence that no clack prompt call remains outside the prompter, that no `context.interaction` branch
  chooses an answer a prompt site declares, that clack is confined, that every prompting handler takes a required
  context, and that each drift is recorded in its task.

- _Outcome:_ The source-boundary scenario confines Clack to presentation and renderer modules, confirms all eleven
  prompting handlers require context, and finds no remaining caller-owned policy answer branch. Migration tasks
  retain their drift records; A4’s native/direct evidence distinction is revalidated. Notes § Prompt migration closure.

## **Phase 10:** Closing measurement

_Purpose:_ Measure the final head with the baseline's instruments and settings, and re-record the budgets from it.

_Mode:_ `layer` — closes on the recorded closing measurement.

_Exit criterion:_ The closing measurement is recorded in `notes-test-suite-reliability.md` beside the baseline, and
`test-cost-budgets.json` holds rows re-recorded by the spec's budget rule.

### `[x]` **10.1.R Normalize native publication artifact keys — A5**

- _Goal:_ A5's Windows publication correction keeps required and obsolete artifact comparisons on one portable key
  representation, so the full build and existing portability cases can publish valid nested schema output.

- _Outcome:_ The native enumerator emits portable artifact keys for staged and prior-live inventories. The real
  Windows path boundary reproduces the old missing-schema refusal and now publishes schema, runtime and qualification
  while removing obsolete output. Guards remain intact; Notes § Amendment A5 records the failed hosted attempt.

### `[x]` **10.1.R2 Isolate inherited child-process output formatting**

- _Goal:_ CLI and script subprocess fixtures keep their output contracts when the parent sets `FORCE_COLOR=3`, while
  explicit per-invocation environment overrides remain available and every behavioral assertion stays intact.

- _Outcome:_ Shared pipe helpers clear inherited formatting before explicit overrides; four direct Node/npm fixture
  callers clear it too. Plain output and failure contracts survive a forced-color parent, with every assertion retained.
  See `notes-test-suite-reliability.md` § Inherited subprocess formatting.

### `[x]` **10.R Bound synthetic native fixture sources — A6**

- _Goal:_ A6 removes unrelated production sources from each independent native fixture while preserving live
  reachable modules, explicit loader roots and every real compiler, controller and artifact-recovery outcome.

- _Outcome:_ Independent native fixtures copy reachable dirty-tree source and loader roots, reject missing relative
  edges and omit unrelated/transient files. The installed compiler, controller and artifact-recovery proofs retain
  their outcomes; copy/inventory calibration and native proof evidence are recorded in `notes-test-suite-reliability.md`.

### `[x]` **10.R2 Size the observed repository-inventory deadlines**

- _Goal:_ The one-shot inventory-output case and documentation setup complete their real repository scan under the
  routine lane's concurrency, preserving listener, output, documentation and reconciliation assertions.

- _Outcome:_ Only the measured repository inventory case and documentation setup use named 30 s deadlines;
  listener/output/reconciliation assertions and all tier defaults remain intact. Both scans complete in the routine lane.

### `[x]` **10.R3 Isolate fixture worker controls from the parent run**

- _Goal:_ Native controller and focused-test fixtures retain their declared worker/serial-execution contracts when
  the outer run sets a worker override, while deliberate per-invocation environment overrides remain available.

- _Outcome:_ Shared controller/focused fixture execution clears inherited worker sizing before explicit caller
  overrides. Native isolation, serial-execution and same-worker launch proofs retain their assertions.

### `[x]` **10.R4 Give the native closing delay a measurement margin**

- _Goal:_ The real controller-closing measurement proves at least 50 ms of retained teardown without expecting
  a timer requested at that exact threshold to meet a precise wall-clock duration.

- _Outcome:_ The injected closing delay is 75 ms while its proven floor remains 50 ms. Native endpoint retention,
  metadata, ownership and cleanup assertions all remain; the exact-threshold timer flake is recorded in Notes.

### `[x]` **10.R5 Bound default local workers — A7**

- _Goal:_ A7's local worker policy preserves workstation responsiveness while retaining measured throughput,
  explicit capacity overrides, CI native sizing and the existing admission/isolation contracts.

- _Outcome:_ The existing policy uses half available parallelism with a one-worker floor and eight-worker ceiling.
  Explicit capacity overrides and CI sizing remain available; the ordinary lane preserves admission/isolation
  contracts. `notes-test-suite-reliability.md` records source changes, profiled comparisons and host feedback.

### `[x]` **10.R6 Retain the real CLI overlay dependencies — A8**

- _Goal:_ A8 restores the content-stale native CLI fixture's full reachable source graph while preserving the
  synthetic build fixture's reduced workload and the existing stale-build reason assertions.

- _Outcome:_ The content-stale consumer copies the real CLI's reachable graph before qualification and mutation;
  generic native fixtures retain their reduced workload. Other overlays require no extra root, and stale-guard
  assertions remain intact. The failed closing run is retained in `notes-test-suite-reliability.md` § Amendment A8.

### `[x]` **10.R7 Reuse unchanged fixture import parsing — A9**

- _Goal:_ A9 reduces repeated native-fixture parsing while preserving current dirty/untracked source contents,
  fresh dependency resolution, independent writable destinations and unresolved-edge refusals.

- _Outcome:_ Exact-content import parsing is reused while every copy reads current bytes and resolves current
  candidates. Repeated source edits and candidate creation/deletion retain independent graphs and refusal behavior;
  byte-matched calibration and stopped hosted evidence are recorded in `notes-test-suite-reliability.md` § Amendment A9.

### `[x]` **10.R8 Run Candidate decision variants through their handler seam — A10**

- _Goal:_ A10 removes repeated CLI fixture preparation from thirteen internal composition, routing and refusal
  cases while preserving real Git, public-handler producers, every case body and timeout, and the native CLI
  advancement, convergence, replay, full-span and mutating-settlement outcome proofs.

- _Outcome:_ Thirteen decision variants use the existing handler/Git tier; the extracted name list preserves an
  exact eighteen-integration/twenty-E2E partition without growing the shared suite. Every body and timeout is
  unchanged; `notes-test-suite-reliability.md` § Amendment A10 retains the union proof and native outcome mapping.

### `[x]` **10.R9 Name the repository inventory setup deadline — A11**

- _Goal:_ A11 lets the real repository inventory setup scan finish on a loaded hosted runner, preserving its
  immutable snapshot, all twenty-six inventory assertions and every tier timeout default.

- _Outcome:_ Only the shared repository inventory setup hook uses a named 30-second deadline. Its snapshot,
  twenty-six cases and all tier defaults stay unchanged; the retained hosted failure and exact body comparison are
  recorded in `notes-test-suite-reliability.md` § Amendment A11.

### `[x]` **10.R10 Partition native Candidate coverage by behavior — A12**

- _Goal:_ A12 makes existing file parallelism available during the observed Candidate shard tail, retaining the
  same twenty native cases, eighteen integration cases, every body and deadline, and independent fixture ownership.

- _Outcome:_ Three native wrappers retain the exact five/nine/six partition and independent fixture state;
  integration retains eighteen cases. All bodies and deadlines are unchanged, with unclassified native cases
  refused; `notes-test-suite-reliability.md` § Amendment A12 records the observed tail and union proof.

### `[x]` **10.R11 Name the cold ESLint configuration-load deadline — A13**

- _Goal:_ A13 gives the retained real ESLint configuration load an explicit deadline while preserving its measured
  duration, complete architecture scope assertions, remaining case deadlines and every tier default.

- _Outcome:_ The first native ESLint configuration case has a named ten-second deadline, with its load, duration
  and assertion retained inside measurement. Other cases and defaults stay unchanged; the original headroom failure
  and deadline-only comparison are recorded in `notes-test-suite-reliability.md` § Amendment A13.

### `[x]` **10.R12 Bind retained closing evidence to deadline-only confirmation — A14**

- _Goal:_ A14 preserves the measured cost and outcomes at `9b3856d4d` while binding one recording-head dispatch
  to the corrected ESLint deadline, all unit half-timeout headroom, budget confirmation and both portability legs.

- _Outcome:_ The complete prior-head observations retain their original outcomes and headroom failure. A14's
  bounded deadline-only exception keeps their cost medians and binds all missing confirmation to one recording-head
  dispatch; `notes-test-suite-reliability.md` § Closing measurement records the evidence.

### `[x]` **10.R13 Ground and repair the Windows native fixture failures — A15**

- _Goal:_ A15 retains native raw-link and surviving-compiler staging proofs on Windows, with unchanged production
  behavior and Linux workload, while preserving the prior closing observations and current unit-headroom witness.

- _Outcome:_ The raw link uses native path bytes, and the Windows survivor fixture launches a real detached compiler
  with owned cleanup and a liveness precondition. Current native portability confirms staging without publication;
  production and Linux work stay unchanged. `notes-test-suite-reliability.md` § Amendment A15 retains the source
  diagnosis, failed attempts and passing confirmation.

### `[x]` **10.1 Run the closing hosted runs**

- _Goal:_ Five consecutive first-attempt passes at the final head show the suite reliable on hosted runners, give the
  hosted cost medians, and confirm the Windows and macOS legs.

    - _Amended in:_ 10.1.R (A5)

    - _Amended in:_ 10.R12 (A14)

    - _Amended in:_ 10.R13 (A15)

    - `[x]` **10.1.a Five consecutive dispatch runs**
        - Five complete first-attempt passes at `9b3856d4d` supply the hosted cost medians under A14. The fifth
          run's original unit half-timeout failure remains explicit; A15 retains the separately confirmed current
          headroom. `notes-test-suite-reliability.md` records all five IDs and observations.

    - `[x]` **10.1.b The portability pair**
        - Run 37686035937 at `a916d0e1a` confirms both current portability legs under A15. Prior failed Windows
          attempts remain recorded separately in `notes-test-suite-reliability.md`.

### `[x]` **10.2 Re-measure every tier locally**

- _Goal:_ Native-tooling cost and E2E summed file time at the head the closing runs passed on are measured with the
  baseline's instrument and settings, for comparison with the 40% and 20% bars.

    - _Amended in:_ 10.R12 (A14)

- _Outcome:_ Twelve captures at the retained workload head provide three-run medians for every project set,
  clearing the native-tooling and E2E bars with A14's deadline-only continuation. The single-sample E2E baseline
  limitation and complete local observations remain explicit in `notes-test-suite-reliability.md`.

### `[x]` **10.3 Re-record the test-cost budgets — D5**

- _Goal:_ `test-cost-budgets.json` reflects the final suite: one CI row per test job of the adopted layout and one
  tier-isolated row for each of the `unit`, `integration`, `lane`, and `e2e` project sets, each budgeted by the spec's
  rule.

- _Outcome:_ Four local and ten CI rows use retained measurement medians and the smallest covering allowance,
  35%, with budget overage advisory. The recording-head Linux confirmation and current combined confirmation
  preserve test outcomes under A14/A15; derivation and exact heads remain in `notes-test-suite-reliability.md`.

## **Phase 11:** Verification

### `[x]` **11.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Fresh serial Tier 3 passes Markdown/ARC checks, typed and shell lint, both type programs,
  16,732 routine cases under `FORCE_COLOR=3` at the eight-worker default, and the full declaration build.
  Current hosted E2E/portability evidence is retained; verification-document Markdown/ARC checks pass separately.
  The A16 correction passes all full local gates with 16,757 routine cases and the full build, plus first-attempt
  hosted full-suite/Windows/macOS confirmation 37698035019; historical colored-run evidence remains head-bound.
  The second review correction passes all full local gates with 16,769 routine cases, the qualified full build
  and first-attempt full-suite/Windows/macOS confirmation 37703453112, retaining the unchanged worker policy and
  all historical measurement bindings.
  The third review correction passes all full local gates with 16,794 routine cases, the qualified full build
  and first-attempt full-suite/Windows/macOS confirmation 37707974563; all thirty-two criterion identities,
  eight-worker sizing and historical measurement bindings remain unchanged.
  The fourth review correction passes all full local gates with 16,829 routine cases, the qualified full build
  and first-attempt full-suite/Windows/macOS confirmation 37712193158; unchanged budgets, criterion identities
  and historical measurement bindings are retained.
  The fifth review correction passes all full local gates with 16,854 routine cases, the qualified full build
  and first-attempt full-suite/Windows/macOS confirmation 37717649195; the classifier corrections retain all
  criterion identities, budgets, worker sizing and historical measurement bindings.
  The sixth review correction passes all full local gates with 16,865 routine cases, the qualified full build
  and first-attempt full-suite/Windows/macOS confirmation 37721286878. All criterion identities and historical
  measurement bindings remain unchanged; the corrected Candidate has an explicitly accepted review stop.

- _Success criteria:_ 32 criteria: 27 met, five superseded by A1/A14/A15/A16, none unresolved. Exact criterion digests,
  evidence span, author preflight and limitations are recorded in `notes-test-suite-reliability.md` § Verification
  evidence. Optional adversarial verification was declined; independent local chunked code review remains required.

---

## Success Criteria

- `[~]` The baseline is recorded in `notes-test-suite-reliability.md`, with run IDs and capture paths, before the
  first commit of any optimizing phase, and every hosted unit-job run uploads a report carrying each test's duration
  and effective timeout

    - **Superseded:** A1 replaces baseline sampling with criterion 23; hosted report retention remains required.

- `[~]` Five consecutive full-suite `workflow_dispatch` runs at the final head pass with every job green on its first
  attempt, and in each, every unit test's duration is under half its effective timeout

    - **Superseded:** A14/A15 replace final-head sampling and headroom with criterion 31; original failures stay
      recorded.

- `[x]` One further dispatch run at the final head, with `run_portability_pair` on, passes its Windows and macOS
  portability legs

- `[x]` `npm test` passes with `FORCE_COLOR=3` set, and a unit test proves the shared copy helper skips a transient
  `*.bundled_*.mjs` file while copying an untracked module

- `[x]` Native-tooling cost is at least 40% below its baseline (local instrument, three-run medians)

- `[~]` E2E summed file time is at least 20% below its baseline (local instrument, three-run medians)

    - **Superseded:** A1 replaces the comparison with criterion 24 and preserves the single-sample limitation.

- `[x]` The median run duration of the five closing runs is at least 20% below the baseline median

- `[x]` The median summed test-job time of the five closing runs is at least 20% below the baseline median

- `[x]` The layout trial's runs and verdict are recorded, and either only the winning duration source landed, with
  the anchors and their readers replaced, or the current layout, anchors, and single unit job stand with no
  sequencer

- `[x]` `test-cost-budgets.json` holds rows re-recorded by the budget rule for every job of the final layout and
  every tier, and a test proves an `over` reading emits a `::warning` annotation naming the baseline and the budget

- `[x]` Tests prove, in both unit projects, that a launch from a file off the allowlist fails its test even when the
  error is caught, that an allowlisted file can launch, that a file using esbuild is counted for its own service
  whatever ran before it in the worker, and that a run in which an allowlisted file ran whole and launched nothing
  fails naming it, even when the run names its own reporters

- `[x]` The one-hop bans are ESLint rules in `eslint.config.js`, the source-scan cases they replace are gone, and
  each deleted change-detector or toolchain-redundant case records its survival-rule verdict in its task

- `[x]` Tests prove the staleness check is skipped only with a matching token, a test-controller operation, and a
  live lease, and that a build holder, an expired lease, a missing token, or a lock file that is absent, empty,
  corrupt, or unreadable runs it

- `[x]` No `@clack/prompts` prompt call remains outside the prompter, and `no-restricted-imports` confines
  `@clack/prompts` to the terminal module and the prompter

- `[x]` No branch on `context.interaction` chooses an answer a prompt site declares; each such site is asked in every
  interaction context

- `[x]` A unit table test runs the real prompter against a fake renderer and covers each policy kind, each outcome,
  and each cancellation kind

- `[x]` Every prompting command keeps its present output and exit status in each interaction context, except drift
  fixes recorded in their tasks

- `[x]` `contradiction()` refuses a prompt site with an unsupported kind, with a syntax-carrying kind and empty
  `acceptedSyntax`, with `proceed` or `require-authority` on a form other than `confirm`, or with a `cancellation`
  other than `stop` or `safe-default`

- `[x]` Every prompt site is reached only through its branded, exported declaration, and each drift found during
  migration is recorded in its task

- `[x]` The `testing-standards` override and `strategy-testing-methodology.md` carry the testing rules and tier
  lines, and `TECHNICAL-OVERVIEW.md` § 4 agrees with them

- `[x]` All quality gates pass (tests, linting, type checking)

- `[x]` Ready for integration

    - **Deviation:** Execution verified for Candidate preparation; independent review and exact-head merge authorization
      remain required.

- `[x]` A1's frozen baseline records the head, retained local and hosted attempts, conclusions, settings, capture
  paths, and sample limits before fixes; no diagnostic substitutes for an ordinary sample (supersedes the original
  baseline sampling criterion)

- `[x]` Closing E2E summed file time's three-run median is at least 20% below the frozen single ordinary baseline
  sample with its missing noise estimate explicit (A1; supersedes the original E2E comparison criterion)

- `[x]` A2 changes only the two measured refusal-source-totality cases' named timeout; their assertions and scan
  behavior stay intact, and the timeout exceeds 3.4 times their frozen hosted maximum

- `[x]` A3's native ESLint proofs preserve loader aliases, inline factories, relative-target resolution, and
  type-only/eager exceptions while accepting valid lookalikes and Result/store seams; resolved configuration
  composes every matching predicate ID, and equivalent native lint proof precedes each source-scan replacement

- `[x]` A4's matrix reaches one own-command site for each of the four reachable prompt kinds. The indeterminate
  start refusal has direct handler/prompter proof and separately labelled native upstream-guard coverage, with refs,
  worktrees and tracked state preserved and no claim that the native run reached the prompt.

- `[x]` The synthetic native fixture copies its live first-party dependency closure and explicit loader roots,
  retains dirty-tree dependencies and independent writable sources, and preserves the real build, controller,
  qualification and artifact-recovery proofs (A6)

- `[x]` Default local worker sizing follows the half-parallelism rule with a one-worker floor and eight-worker
  ceiling; capacity overrides and CI native sizing remain available, and the ordinary routine gate passes (A7).

- `[~]` A14 preserves the five hosted first-attempt passes and twelve local captures at `9b3856d4d`, records the
  original fifth-run headroom violation, and uses their medians for unchanged cost bars and budgets. Only A13's
  named first-case deadline changes; one full-suite recording-head dispatch passes every job on attempt one,
  every completed unit case remains below half its effective timeout, and both Windows/macOS portability legs
  pass (supersedes the original five-run final-head/headroom criterion).

    - **Superseded:** A15 replaces the deadline-only continuation with criterion 31 after native Windows fixture
      failures.

- `[~]` A15 preserves prior Linux cost observations and the `f0285502c` recording-head unit reports with all
  13,695 completed cases below half their effective timeouts. Only platform-native fixture representation,
  Windows-only failure diagnostics and the source-grounded Windows fixture repair may follow without replacing
  Linux samples; both current Windows/macOS portability legs pass native assertions and the failed attempt stays
  recorded (supersedes A14's deadline-only confirmation criterion).

    - **Superseded:** A16 permits the approved review corrections while retaining exact-head historical evidence.

- `[x]` A16 retains exact-head historical measurements, their explicit failures and unchanged acceptance bars and
  fourteen budgets without claiming that old captures measure the revised workload. Focused enforcement,
  presentation and native-fixture regression proofs, ordinary full local quality gates, and one current
  first-attempt full-suite hosted dispatch including both Windows/macOS legs pass. Current unit zero-spawn and
  half-timeout reports are retained; a material regression reopens only affected evidence without restarting
  five hosted samples or twelve local captures (supersedes A15's unchanged-Linux confirmation criterion).
