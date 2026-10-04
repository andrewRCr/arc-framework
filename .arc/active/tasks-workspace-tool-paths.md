# Task List: Workspace-Aware Focused Tools and Test Builds

- **Design:** `spec-workspace-tool-paths.md`

---

## **Phase 1:** Build input and generation evidence

_Purpose:_ Establish the complete qualification substrate before a controller can reuse or certify runtime artifacts.

_Mode:_ `layer` — closes on actual producer graphs, selective input identities, and generation-interval validation.

_Exit criterion:_ Disposable native-producer fixtures establish both input identities, selective ordinary-content
invalidation, resolver-control invalidation, and rejection of observed changes during generation.

### `[x]` **1.1 Capture actual CLI, schema, and build-control graphs — D6, D7, D9**

- _Goal:_ Recorded dependency sets identify the first-party files the actual CLI, schema, and build-control producers
  consume, including runtime-resolved JavaScript and JSON.

    - `[x]` **1.1.a Retain the CLI compiler's actual first-party input graph**
        - Native input selection retains normalized first-party TS, JS, and JSON paths while excluding installed and
          external sources. A real compiler fixture captures a resolving JS sibling and its later content changes.

    - `[x]` **1.1.b Retain schema and build-control loader graphs at their producer seams**
        - Config capture retains native loader dependencies and executes captured options with `config: false`.
          Both configs keep schema sources outside their shared graph; an isolated native producer generates the
          production schema and retains its actual registry/writer dependencies.

    - `[x]` **1.1.c Declare and verify the development-tool dependency boundary**
        - Declared `bundle-require` and `esbuild` at the package development boundary with matching lockfile entries;
          compiler/loader imports remain outside the production freshness reader.

### `[x]` **1.2 Qualify runtime and runtime-plus-schema input identities — D6, D7**

- _Goal:_ CLI freshness and test reuse distinguish their source closures while both detect relevant configuration,
  installation, tool, and runtime changes; malformed evidence never supplies qualification.

    - `[x]` **1.2.a Compose the two selective content identities**
        - Repository-relative producer closures distinguish runtime and runtime-plus-schema content; shared inputs
          remain in both identities, while unrelated ordinary content and ordering do not alter qualification.

    - `[x]` **1.2.b Include configuration, installation, and tool/runtime context**
        - Native TypeScript config parsing retains inherited inputs. Shared controls include workspace manifests,
          committed/installed npm metadata, actual consuming tool boundaries, and Node/platform/architecture.
          Missing or unusable installation evidence names installation and build repair commands.

    - `[x]` **1.2.c Validate disposable cache evidence and artifact qualification**
        - Current-format evidence validates producer paths, distinct identities, and published qualification;
          malformed/legacy records refuse and regenerated records recover. Declaration qualification remains
          explicit and separate from runtime identity.

### `[x]` **1.3 Account for source membership, links, and resolver manifests — D7**

- _Goal:_ Resolver-changing membership, filesystem entry kinds, link targets, and first-party manifests invalidate
  reuse even when previously consumed source digests remain equal.

    - `[x]` **1.3.a Inventory first-party source/config membership and link identity**
        - Sorted entries retain filesystem kinds and raw link targets before traversal; source directories remain
          distinct from package output exclusions. Internal file/directory retargeting and same-content link
          replacement invalidate, while live/staged output, leases, and installed contents stay outside the inventory.

    - `[x]` **1.3.b Hash inventoried first-party resolver manifests as shared controls**
        - Nested and unused manifests contribute shared identity even when compiler metadata omits them. A native
          side-effects fixture proves resolver invalidation with unchanged old input digests; ordinary contents and
          timestamps remain selective, and normal qualification reads only resolver contents from this inventory.

### `[x]` **1.4 Check baseline inputs before certifying generated output — D5, D6, D7**

- _Goal:_ A generated record certifies baseline inputs that remained stable during generation, rather than source
  read retrospectively after compilation.

    - `[x]` **1.4.a Capture baseline source/config/install maps before compiler startup**
        - Baselines retain broad first-party contents, native configuration reads, installation/runtime context, and
          rich inventory before producer startup; eventual dependency inputs absent from that baseline cannot certify.

    - `[x]` **1.4.b Reject unstable generations and support a subsequent stable build**
        - Complete interval comparisons reject observed input/control/inventory changes with a rerun remedy. A native
          compiler fixture reads old source before an edit and late metadata cannot certify that mixed generation;
          stable retry returns evidence derived from its new baseline.

## **Phase 2:** Owned build generation and publication

_Purpose:_ Compose existing renewable ownership and staging into the writer boundary the test controller will use.

_Mode:_ `slice` through Phase 3 — closes on a supported integration run retaining qualified artifacts through cleanup.

### `[ ]` **2.1 Share renewable lease lifetime with checkout artifact ownership — D4**

- _Goal:_ CPU admission and checkout artifact ownership share reliable renewal/release handling while retaining
  distinct scopes; loss of confirmed ownership prevents continued owned work.

- _Approach:_ Factor the lifetime composed by `withLocalHeavyTestAdmission` around existing advisory-lock primitives;
  keep metadata diagnostic and the artifact lease beside output, outside compiler-cleaned directories.

    - `[ ]` **2.1.a Preserve existing CPU admission through shared lifetime handling**
        - Retain process scope/instance, renewal deadlines, exit cleanup, cancellation, and contention diagnostics.
        - Build `test-first` (one behavior at a time):
            - Existing `local-test-admission` and `advisory-lock` renewal, ownership-loss, and release cases remain valid.
            - Action failure and asynchronous release preserve cleanup until ownership is actually released.

    - `[ ]` **2.1.b Add checkout-scoped artifact ownership using the same primitive**
        - Compose CPU-then-artifact acquisition for heavy controllers; keep artifact ownership enforced under CI and
          `ARC_TEST_ALLOW_CONCURRENCY=1`. Owning actions use their existing lease instead of reacquiring it.
        - Build `test-first` (one behavior at a time):
            - Same-checkout owners contend with useful cancellable diagnostics; separate checkouts have separate leases.
            - Renewal loss or confirmed-dead ownership prevents publication, while repaired ownership can be acquired.

### `[ ]` **2.2 Compile full and fast builds into owned asynchronous staging — D4, D5**

- _Goal:_ Full and fast compilation can complete without blocking the owning process's renewal, and compiler
  children can write only unique staging output.

    - `[ ]` **2.2.a Invoke an internal asynchronous compiler route under existing ownership**
        - Compose `DEV_BUILD_OUTPUT_DIRECTORY_ENV` and unique staging with actual producer capture; public npm build
          wrappers are not invoked recursively from the coordinator or self-refresh build action.
        - Build `test-first` (one behavior at a time):
            - A running compiler leaves live `dist` untouched and permits lease renewal and cancellation handling.
            - A surviving child after owner death/replacement can finish staging but cannot promote live files.

    - `[ ]` **2.2.b Complete requested full/fast artifacts before reporting generation success**
        - Preserve `baseOptions`/`fastOptions` composition, runtime/schema output, and the full declaration requirement.
        - Build `test-first` (one behavior at a time):
            - Fast generation produces runtime/schema evidence without declaration proof.
            - A full declaration failure leaves the requested generation unsuccessful and prevents promotion.
            - Failed compilation retains the previous live entry and gives the concrete rebuild remedy.

### `[ ]` **2.3 Publish qualified generations with failure and recovery handling — D3, D4, D5**

- _Goal:_ Only stable, validated output owned by the coordinator becomes a qualified live generation; publication
  failures prevent test execution and retain a usable repair route.

- _Approach:_ Reuse `promoteStagedDevBuild`'s per-file replacement substrate. Consumer exclusion supplies consistency;
  the output set is not a directory-wide atomic transaction.

    - `[ ]` **2.3.a Validate and publish staged output with evidence last**
        - Support initial publication with no live `dist`: create the output root and treat its missing inventory as empty.
        - Check baseline stability, required runtime/schema output, and confirmed ownership; promote ancillary files and
          the complete CLI entry, finish required live-output cleanup, then publish qualification evidence.
        - Build `test-first` (one behavior at a time):
            - A first build with absent live output publishes complete qualified artifacts; missing-output repair can
              establish a generation without requiring an existing CLI entry or stamp.
            - Successful publication exposes complete required output before its new evidence.
            - Invalid staged output, observed input changes, or ownership loss prevents publication and test admission.

    - `[ ]` **2.3.b Recover safely from compilation or partial publication failure**
        - Recheck live evidence and required files on the next invocation; clean only the owning staging output and
          avoid certifying an interrupted promotion.
        - After successful publication, dispose of leftover owned staging best-effort; report disposal failures without
          failing the completed request, revoking qualification, or rebuilding otherwise reusable output.
        - Build `test-first` (one behavior at a time):
            - Ancillary/entry replacement or required live-output cleanup failures do not publish a successful new stamp.
            - Post-publication staging-disposal failure retains successful qualification and permits normal test reuse.
            - The failed requesting run cannot execute tests; a repaired subsequent build/preparation qualifies live output.
            - Reusable qualified full output serves runtime preparation, while explicit build requests still rebuild.

### `[ ]` **2.4 Route explicit builds and self-hosting refresh through one coordinator — D4, D9**

- _Goal:_ Root/package builders and post-command self-hosting refresh use one non-recursive ownership boundary,
  and CLI freshness retains runtime-only selectivity and actionable refusal/retry behavior.

    - `[ ]` **2.4.a Wire explicit full/fast builders and staged self-refresh to the coordinator**
        - Update both manifests and `refreshDevBuildAfterAction`/`runFastDevBuild` composition together; invoke the
          internal compiler under already-owned actions and retain the prior entry on failed compilation.
        - Build `test-first` (one behavior at a time):
            - Explicit root/package full and fast commands always build, including over qualifying unchanged inputs.
            - Root/package builders establish their first qualified generation when live output is absent.
            - Refresh and preparation avoid public-wrapper reacquisition; same-checkout builds wait behind test ownership.
            - A different checkout's build has independent artifact ownership and can make progress.

    - `[ ]` **2.4.b Read runtime identity in the self-hosting freshness guard and refresh proof**
        - Adapt `createDevCheckDeps` and stamp-reading consumers; preserve published-install skipping and the complete
          stale-build refusal/remedy. Update existing unit and disposable stale-guard fixtures for the new format.
        - Build `test-first` (one behavior at a time):
            - Schema-only ordinary source edits retain CLI freshness; runtime/shared-control edits refuse stale output.
            - Old or unusable evidence cannot claim qualification; explicit repair restores freshness.
            - A failed or still-stale refresh remains unsuccessful with its actionable retry command.

## **Phase 3:** Prepared controller execution and cleanup

_Purpose:_ Prove the controller, global setups, build coordinator, and closing policy together on the integration path.

_Exit criterion:_ A supported integration command uses one qualified runtime/schema generation without nested build
acquisition. A manual build waits through controller closing, and an ownership-losing or dead controller cannot leave
a compiler child that publishes. Stable repaired inputs restore successful preparation and execution.

### `[ ]` **3.1 Discover projects before admission and owned runtime preparation — D2, D3, D4**

- _Goal:_ Actual discovered projects determine build/admission needs, and the same controller owns each heavy
  run's qualified generation until its closing path finishes.

    - `[ ]` **3.1.a Discover configured specifications before admission or preparation**
        - Replace run-mode startup composition with public `createVitest` and `getRelevantTestSpecifications` in package
          cwd; preserve configured membership/defaults and explicit native execution precedence.
        - Mirror `prepareVitest`'s environment bootstrap before configuration/controller creation: set `TEST` and
          `VITEST` to `"true"` and apply `NODE_ENV ??= "test"` in the owning process.
        - Initialize reporting/coverage once through `standalone`; when configured `experimental.preParse` is enabled,
          call public `experimental_parseSpecifications` and apply `Vitest.start`'s skip predicate. Retain specs with
          no `testModule` or with `testModule.task.mode` other than `skip`; classify this refined set before ownership.
          Preserve native parsing diagnostics and leave native sharding to execution.
        - Build `test-first` (one behavior at a time):
            - Disposable config, global-setup, and worker fixtures observe native test-environment defaults and native
              handling of explicitly supplied `NODE_ENV`; the shared bootstrap runs before configuration is evaluated.
            - Empty discovery fails without CPU/artifact acquisition or building, and its controller is still closed.
            - Cross-file `.only` matches native `startVitest`; optional pre-parsing can refine mixed discovery to unit
              only without heavy/artifact acquisition, building, or excluded integration setup/module execution.
            - Disabled pre-parsing preserves the discovered set; an empty refined set fails before ownership/building.
              Native parsing failures retain their diagnostics rather than becoming an empty-selection explanation.
            - Unit/unit-mocks-only refined selection takes no heavy/artifact lease and requests no build regardless of
              tier label. Integration/E2E and mixed refined selections determine the heavy path from their projects.

    - `[ ]` **3.1.b Prepare and execute selected specifications under the controller's ownership**
        - Acquire CPU then artifacts for heavy selections, ensure qualified runtime/schema, `provide` evidence before
          setup, and execute refined specs with `runTestSpecifications(specifications, true)` to preserve native
          initial-run coverage semantics. Do not repeat the reporting/coverage initialization from discovery.
        - Validate the preparation result and require the supported heavy runner to provide valid evidence before
          execution; its setup cannot enter the direct-native fallback through an omitted evidence key.
        - Build `test-first` (one behavior at a time):
            - Qualified unchanged output is reused; required generation occurs under the already-held artifact lease.
            - Native setup/collection/execution failure still closes the controller before releasing either lease.
            - CI/concurrency bypasses affect CPU admission only.

### `[ ]` **3.2 Wire prepared tier execution and evidence-aware global setups — D2, D3, D9**

- _Goal:_ Global setups consume validated controller evidence without nested ownership/building; direct native
  setup can ensure a generation, and skip-build always forbids generation.

    - `[ ]` **3.2.a Wire prepared tier execution and controller-provided setup evidence together**
        - Update `run-local-test-tier.ts`, the runner, and both integration/E2E `setup` functions coherently;
          read evidence with `getProvidedContext` and validate current runtime/schema qualification and required files.
        - Select the provided-evidence branch by own-key presence; reject any present malformed or mismatched value.
        - Build `test-first` (one behavior at a time):
            - Multiple heavy projects share the provided generation without reacquiring leases or invoking builds.
            - Present `undefined`, `null`, missing record fields, or mismatched evidence prevents execution without a
              nested repair build; supported-runner preparation establishes the key before setup.
            - Ordinary E2E no longer selects full/fast preparation through its outer npm lifecycle name.

    - `[ ]` **3.2.b Compose direct native preparation and the prebuilt-only route**
        - Only when the evidence key is absent, ensure runtime/schema through build ownership only; with
          `ARC_E2E_SKIP_BUILD=1`, require qualified prebuilt evidence and files in every preparation path.
        - Build `test-first` (one behavior at a time):
            - Direct setup can generate qualifying runtime but claims no artifact pin through an unmanaged run.
            - Matching prebuilt output executes without generation; mismatch fails with a build/download/install remedy.
            - Repair restores execution while skip-build remains enabled and still generates nothing.

### `[ ]` **3.3 Preserve execution and final cleanup failure status — D8**

- _Goal:_ Passing cases cannot hide empty completion or closing failures, and later cleanup handling never clears
  an existing native failure or replaces setup/collection diagnostics.

    - `[ ]` **3.3.a Interpret completion through public reports and case results**
        - Distinguish successful collection with zero completed cases from native setup, collection, and execution
          failure. Optional pre-parsing can eliminate specifications before preparation; ordinary runtime name
          filtering occurs after required preparation. Preserve native pre-parsing failure diagnostics as well.
        - Enumerate nested cases through `TestModule.children.allTests`; count only `passed` and `failed` states from
          `TestCase.result`, keeping skipped/pending cases separate from collection size and `ok` status.
        - Build `test-first` (one behavior at a time):
            - Unmatched names and all-skipped selections fail even when native empty-run options would allow success.
            - Todo, dynamic skips, nested skipped suites, and pending cases contribute no completed cases; a mixed
              passed/skipped selection establishes completion, while a completed failed case retains native failure.
            - Collection/setup errors retain their diagnostics/status; passing and failed completed cases stay distinct.

    - `[ ]` **3.3.b Observe close errors and final unhandled state in a shared scoped adapter**
        - Forward every public `logger.error` call during `close`, restore the method in `finally`, then read
          `state.getUnhandledErrors` before releasing ownership. Preserve any existing nonzero status.
        - Build `test-first` (one behavior at a time):
            - Rejected close, swallowed/logged teardown errors, and worker errors recorded only during closing fail.
            - A prior execution/setup/collection failure remains primary when close also fails; final unhandled state
              is still checked after a rejected close and its diagnostic is retained alongside the original failure.
            - Clean closing permits success; logger restoration and lease release still occur on failures.
            - Native ignored-unhandled-error options do not relax the adapter's final error checks.
        - Pair faithful public-boundary fakes with disposable real-controller teardown/worker fixtures.

### `[ ]` **3.4 Validate owned integration — D2, D3, D4, D5, D8** — validate exit criterion at segment scope

- _Goal:_ An executable supported integration path demonstrates qualified preparation, test/build exclusion through
  cleanup, loss-safe compiler behavior, and successful repaired continuation.

    - Run disposable controller/compiler fixtures with readiness and release barriers, using the production
      integration adapter and coordinator; observe the actual CLI entry/schema consumed by the passing test.
    - Queue a supported manual build during execution and during closing; confirm it publishes only after release.
      Confirm another worktree's build progresses independently and CPU bypass leaves artifact exclusion enforced.
    - Kill or replace ownership while compilation is blocked; allow the surviving child to complete and prove it
      cannot publish. Exercise compile, invalid-output, input-change, and incomplete-promotion refusals plus repair.
    - Include clean closing, swallowed/logged teardown, and final worker-state failures; record outcomes at this segment.
      Complete the routine lane, both type checks, and the full declaration build at the coherent checkpoint.

## **Phase 4:** Focused repository-root interfaces

_Purpose:_ Make exact root test selection and focused lint exercise the established execution and package-cwd contracts.

_Mode:_ `slice` — closes on working root npm invocations with explicit targets and native option values.

_Exit criterion:_ One ordinary npm separator selects exact files/cases, rejects each ineligible operand, and supports
unit, integration, E2E, and mixed targets with configured defaults and deliberate native overrides. Root TypeScript
lint and its staged-file caller preserve package-cwd suppression and option-value semantics; literal Markdown remains.

### `[ ]` **4.1 Validate focused test operands and native execution flags — D1, D2**

- _Goal:_ The root helper resolves explicit repository-relative targets and native values unambiguously, and each
  target contributes eligible configured specifications before any build or heavy ownership is requested.

    - `[ ]` **4.1.a Normalize root targets and enforce the fixed native run interface**
        - Use public `parseCLI` for native parsing, then validate supported option fields/values for the focused
          interface; resolve targets before package cwd and validate test-tree containment.
        - Reject unknown/malformed options, config/root overrides, alternate commands, discovery/source overrides
          including `changed`, `related`, `dir`, `include`, and `typecheck`, and watch/browser/UI modes.
        - Reject an additional literal `--` in adapter arguments before discovery; retain every explicit operand in
          target validation. This focused interface does not restrict broad tiers' existing changed/source filtering.
        - Build `test-first` (one behavior at a time):
            - Repository-relative files/directories and multiple operands resolve without package-base guessing.
            - Native option values remain literal; unsupported interface controls fail with actionable diagnostics.
            - Unknown parsed fields, malformed required values, override aliases and `--config=false`, and targets
              following an extra separator fail before discovery, admission, or building.

    - `[ ]` **4.1.b Constrain discovery to exact operands and eligible configured projects**
        - Restrict to named files or directory descendants; require each operand to contribute after native project
          filtering and before optional pre-parsing, while leaving broad tier filters under their native semantics.
        - Build `test-first` (one behavior at a time):
            - Substring-adjacent files are not selected; valid operands cannot mask invalid, excluded, or empty operands.
            - Native project filters restrict configured membership, and rejected/empty requests neither build nor admit.

### `[ ]` **4.2 Execute exact focused selections through the root npm interface — D1, D2, D3, D8, D9**

- _Goal:_ One ordinary root npm separator runs exactly the requested tests through the shared controller boundary,
  with native execution defaults/overrides and correct runtime needs for unit, heavy, and mixed selections.

    - `[ ]` **4.2.a Add the direct Node root entry and compose the prepared runner**
        - Add root `test:file` without workspace npm reparsing; keep fixed package config/cwd and the validated
          specification set through execution. Preserve native project placement and explicit execution precedence.
        - Compose the shared native environment bootstrap before the focused entry loads configuration.
        - Validate each target's initial filename/project contribution before shared optional pre-parsing; use the
          refined selection for preparation/execution without treating a natively skipped file as an invalid operand.
        - Build `test-first` (one behavior at a time):
            - A real npm invocation forwards a root file plus literal `-t` value and runs only its selected case.
            - Default mock isolation and explicit isolation/pool/parallelism/worker overrides retain native precedence
              while target, preparation, ownership, and completion guards remain authoritative.

    - `[ ]` **4.2.b Prove focused unit/heavy/mixed execution and preparation outcomes**
        - Exercise the new entry through disposable root/workspace fixtures and the actual controller/coordinator.
        - Build `test-first` (one behavior at a time):
            - Unit-only selection uses neither build nor heavy/artifact lease; integration/E2E and mixed selections
              use one qualified generation and retain ownership through closing.
            - Repeated qualifying requests reuse output; unmatched runtime names after preparation remain non-passing
              without being reported as pre-build empty discovery. Optional pre-parsing can reject a refined empty
              selection before ownership/building while each exact operand's initial eligibility still holds.

### `[ ]` **4.3 Normalize focused TypeScript lint and staged-hook targets — D1, D9**

- _Goal:_ Root focused TypeScript lint and the staged-file hook select their intended files while retaining native
  package-cwd suppression, option-value, and exit semantics.

    - `[ ]` **4.3.a Add explicit root-target normalization at the focused ESLint boundary**
        - Require at least one file, directory, or glob target before the optional adapter `--`; normalize its base
          from the checkout root while preserving native glob syntax, then run installed ESLint in package cwd.
        - Forward later tokens unchanged, including any additional native positional patterns with package-cwd bases;
          retain the package-local helper and native option/value, glob, ignore, and failure semantics.
        - Build `test-first` (one behavior at a time):
            - Native ESLint fixtures establish targeted-file selection and the package-relative suppression baseline.
            - Root file/directory/glob targets select their intended native matches; an empty root-target span fails
              before ESLint can default to whole-package linting.
            - Literal option values and explicit extra patterns retain package-cwd interpretation; native failures
              propagate and the adapter adds no implicit targets.

    - `[ ]` **4.3.b Update the staged-file caller with the root operand contract**
        - Stop `scripts/check-ts-quality.sh` from stripping `packages/arc-framework/`; adjust its invocation commentary
          while preserving staged-file selection, quoted argv, both type checks, and failure aggregation.
        - Read `git diff --cached --name-only --diff-filter=ACMR -z` with a NUL-delimited loop and select TypeScript
          paths from literal records. Preserve Unicode, tabs, newlines, and spaces through the root helper's argv.
        - Use real staged-file fixtures to verify literal paths reach the helper and existing suppression behavior remains.
          Run shell lint for the touched script; retain the Markdown literal/fix helper definitions unchanged.

### `[ ]` **4.4 Validate focused root invocations — D1, D2, D3, D8** — validate exit criterion at segment scope

- _Goal:_ Real root npm invocations prove exact focused execution and lint selection with native values/defaults,
  while invalid targets, empty cases, and cleanup failures yield non-passing results.

    - Run the focused test adapter against file, directory, multiple-target, unit-mock, integration/E2E, and mixed
      fixtures; inspect actual selected cases, generation/build counters, and lease lifetime.
    - Exercise one ordinary separator with `-t`, project filters, isolation/pool/worker options, and unsupported mode
      controls. Confirm ignored-error or empty-success options cannot relax target/admission/preparation/closing guards.
    - Run the focused ESLint entry and staged-hook fixture with optional delimiter, root glob targets, package-relative
      option values/extra patterns, and literal Git filenames; confirm native suppression behavior. Check the retained
      Markdown literal helper on exactly one named file.
    - Record the segment outcomes and complete the relevant code, shell, Markdown, and contract checks.

## **Phase 5:** Supported command and CI composition

_Purpose:_ Exhaust the remaining production entry points and prebuilt consumers, then align developer guidance.

_Mode:_ `replication` — closes on every supported run-mode route using the shared lifetime and qualification boundary.

_Exit criterion:_ Broad tier, changed-test, portability, and retained cost-measurement runs use the shared controller
contract while preserving their selections and purposes. CI prebuilt consumers retain qualified evidence and obey
skip-build without generation. The full declaration gate and documented root/native command boundaries remain intact.

### `[ ]` **5.1 Compose all remaining run-mode tier entry points — D2, D3, D8, D9**

- _Goal:_ Every remaining supported tier entry preserves its native coverage, filtering, exclusion, and sharding
  while using discovery-driven preparation and common completion handling.

    - `[ ]` **5.1.a Migrate remaining direct run-mode entries and tier argument composition**
        - Enumerate both manifests and `run-local-test-tier.ts`; cover lane/full, unit/changed, arc-contracts,
          integration/E2E/focused E2E, portability, and the direct macOS portability route.
        - Retain `localVitestTierArguments`/`ARC_CONTRACT_SUITES` semantics and native package-relative forwarding;
          preserve the native watch convenience outside this run-mode boundary.
        - Normalize repeated excludes to `cliExclude` before discovery and preserve native initial-run coverage semantics.
          Compose shared configured pre-parsing and native skip filtering; classify ownership from refined projects
          before native sharding, then pass specs to native execution once.
        - Mirror native `normalizeCliOptions` for package-native filters containing a colon before controller
          creation/discovery: default unset `includeTaskLocation` to `true` while retaining explicit option values.
        - Update `e2e-global-setup.test.ts` assertions tied to the migrated unit/changed script strings. Keep
          `deriveEffectiveE2EShards` on native collecting-list calls with qualified prebuilt output, preserving collection.
        - Verify the argument/project/exclude/shard table and representative disposable npm invocations for each batch.

    - `[ ]` **5.1.b Verify route-wide ownership and completion behavior**
        - Reuse the shared runner's behavioral fixtures instead of duplicating lifetime implementations.
        - Verify a migrated package invocation with `file:line` selects the requested case; explicit disabled location
          support retains the native rejection diagnostic. Root `test:file` keeps its literal existing-target contract.
        - Verify unit-only bypass, actual heavy/mixed discovery, shared generations, empty results, native failures,
          and common closing status under ordinary, CI, and concurrency-override entry points.
        - Verify cross-file `.only` parity with native pre-parsing enabled, disabled-mode behavior, heavy-to-unit
          refinement without preparation/setup, refined-empty refusal, and preserved native parsing diagnostics.
        - Prove repeated excludes remain effective with sharding, native too-many-shards diagnostics survive, and an
          empty executed shard is non-passing. A mixed refined set retains heavy ownership even for a unit-only shard,
          because `Vitest.runFiles` initializes global setup before `createPool` shards. Verify the initial-run coverage
          flag through the shared API.

### `[ ]` **5.2 Share prepared execution and closing with retained cost runs — D2, D3, D8, D9**

- _Goal:_ Retained cost runs keep their configured selections, timing capture, record format, and reporting purpose,
  while preparation or final cleanup failure cannot leave a successful retained run.

    - `[ ]` **5.2.a Compose cost measurement with the prepared controller lifetime**
        - Update `runTestCostMeasurement` and its script caller to use shared discovery, refinement, admission,
          preparation, and closing; retain requested/effective worker sizing, project sets, and `captureTestCost`'s
          public-module diagnostics.
        - Compose the shared native environment bootstrap within the timed controller-creation interval, before
          measurement configuration is loaded.
        - Measure controller creation/discovery, optional pre-parsing, and the admitted artifact wait,
          qualification/generation, execution, closing, and capture; pause for CPU admission wait and exclude lease
          release and persistence. Capture and finish timing after common closing/status checks while ownership
          remains held; retain the existing format, budgets, and reporting without new metrics or record fields.
        - Build `test-first` (one behavior at a time):
            - Unit and heavy measurement modes use the same selection/build ownership rules as their ordinary runs.
              Optional pre-parsing uses the shared native predicate and determines ownership from the refined projects.
            - A deterministic clock fixture assigns distinct elapsed periods to discovery, CPU/artifact waits,
              preparation, execution, closing, capture, release, and persistence; only CPU wait is separately reported.
            - A real-controller run establishes that closing contributes to measured wall time.

    - `[ ]` **5.2.b Retain measured output only after common completion succeeds**
        - Preserve existing atomic retention and budget/report consumers; defer successful persistence until closing,
          final error status, and ownership release have completed.
        - Build `test-first` (one behavior at a time):
            - Failed, empty, missing-timing, logged-close, and late-worker-error runs retain no passed measurement record.
            - All-skipped modules containing test cases retain no successful record, even when public timing is present.
            - A clean real-controller run retains the existing timing/test/spawn metadata and feeds existing consumers.

### `[ ]` **5.3 Qualify CI artifacts and prebuilt consumer recovery — D3, D6, D7, D9**

- _Goal:_ CI consumers execute only matching qualified prebuilt runtime/schema output, and recovery does not
  silently generate artifacts while skip-build is enabled.

    - `[ ]` **5.3.a Carry evidence through producer upload and consumer download contexts**
        - Review `.github/workflows/ci.yml` setup and every artifact/local-build consumer; retain the regenerated record
          with required output and verify matching source, installation/tool, Node/platform/architecture context.
        - After each consumer's installation/download, invoke shared coordinator preparation as a local preflight
          with `ARC_E2E_SKIP_BUILD` unset. Reuse matching runtime/schema output; regenerate mismatches under artifact
          ownership in the actual consumer context before its skip-build test command.
        - Preserve the producer's full-build declaration gate and platform-local full builds; preflight does not
          replace that gate. Retain existing CI triggers and cross-platform scheduling.
        - Verify the downloaded record and required outputs against actual generated fixture evidence, including
          matching reuse and consumer-local repair; workflow directory-path assertions alone do not prove retention.

    - `[ ]` **5.3.b Verify prebuilt mismatch remedies and repaired consumer success**
        - Exercise skip-build consumers with missing files, malformed evidence, and mismatched input/install/runtime
          context, then repair through the consumer-local preflight outside the generation-prohibited run. Missing or
          unusable installation evidence refuses until installation repair; a subsequent preflight and skip-build run pass.
        - Confirm retries execute without generation or nested acquisition; CI/CPU bypass still retains artifact
          ownership. Ensure portability CI selects the required installation, cancellation, and file-replacement
          scenarios alongside its existing coverage.

### `[ ]` **5.4 Align developer command guidance and declaration gates — D1, D3, D4, D9**

- _Goal:_ Developer examples accurately describe root operands, native option-value bases, supported artifact
  lifetime, direct native convenience, and the separate declaration gate.

- _Approach:_ Update project-specific sections of configurable `QUICK-REFERENCE.md` and `DEV-RULES.PROJECT.md`;
  preserve their package/project classifications and avoid replacing template defaults with repository-specific prose.

    - `[ ]` **5.4.a Align focused and native command examples with the implemented interfaces**
        - Document one-separator `test:file`, TypeScript targets before optional `--`, package-local/native bases,
          literal Markdown/fix helpers, and actionable fixed-interface diagnostics.
        - Describe configured defaults versus explicit native execution overrides and their mandatory adapter guards.

    - `[ ]` **5.4.b Align preparation, ownership, CI, and quality-gate guidance**
        - Explain runtime/schema reuse, explicit-build behavior, same-checkout queuing through cleanup, independent
          worktree artifacts, CI preflight versus prebuilt-only execution, and generation-only direct native preparation.
        - Retain the full declaration build and both type checks; verify development-tool dependency declarations at
          their owning boundaries and examples against the implemented scripts. Run Markdown and ARC contract checks.

### `[ ]` **5.5 Validate supported routes — D2, D3, D4, D8, D9** — validate exit criterion at segment scope

- _Goal:_ The enumerated supported writer/consumer and CI routes are exhausted with executable evidence that
  coverage, runtime qualification, ownership, and final failure handling remain coherent.

    - Walk both manifests, supported controller callers, global setups, self-refresh, the staged-lint caller, and CI
      artifact/local-build routes; exercise representative disposable scenarios for each command/consumer batch.
    - Confirm changed/arc-contract/portability selections, explicit full/fast build behavior, retained-cost failure
      gating, skip-build repair, and independent worktree artifacts; no supported build script bypasses the coordinator.
    - Complete the routine local gate including both type checks, shell lint, ARC checks, and full declaration build;
      run changed E2E coverage locally and consume required CI portability/E2E results at their normal boundaries.
    - Record the segment scenario results; route any correction to its owning task rather than implementing it here.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Complete quality-gate and success-criterion evidence supports integration of the finished work unit.

    - Load and follow `verify-work-unit.md`; walk the saved criteria and complete the designated quality gates.
    - Record the required quality-gate and success-criterion completion evidence through that workflow.

---

## Success Criteria

- `[ ]` Exact root files/directories and native name filters work through one npm separator; every operand contributes
  an eligible specification, and invalid/excluded/empty operands fail before admission or build. Tasks `4.1`, `4.2`.

- `[ ]` Configured project placement and isolation/worker defaults hold; explicit native execution overrides retain
  precedence without relaxing adapter guards. Unit-only runs acquire no heavy/artifact lease and request no build;
  heavy/mixed runs retain ordered ownership through closing. Tasks `3.1`, `3.4`, `4.2`.

- `[ ]` Root TypeScript targets and the staged-file hook preserve package-cwd suppressions, literal option values,
  and the optional delimiter. The retained Markdown helper lints only its named file. Tasks `4.3`, `4.4`.

- `[ ]` Integration and E2E require runtime/schema artifacts regardless of outer lifecycle name; qualifying full
  output is reusable. Full declaration failure prevents publication, and fast output never satisfies that separate
  gate. Tasks `2.2`, `2.3`, `3.2`, `5.4`.

- `[ ]` Qualified unchanged inputs reuse runtime/schema output; selected inputs, config, installation/tool/runtime
  identity, or membership changes invalidate it. Ordinary schema-only content changes retain CLI freshness, and
  unrelated ordinary source-content edits retain selective reuse. Tasks `1.1`, `1.2`, `1.4`, `2.3`.

- `[ ]` Native resolution-changing siblings refresh the graph. Internal file/directory link retargeting, entry-kind
  replacement, and nested resolver-manifest edits invalidate even with unchanged old input digests; unused manifest
  edits may conservatively invalidate both identities. Tasks `1.1`, `1.3`, `2.3`.

- `[ ]` Observed source/config/install or rich-inventory changes during generation discard staging; missing baseline
  dependency inputs prevent certification. Stable repaired inputs build successfully using baseline evidence.
  Tasks `1.4`, `2.3`.

- `[ ]` Supported manual builds queue through heavy-controller closing in the same checkout; other worktrees have
  independent artifact ownership. CI and concurrency bypasses skip only CPU admission. Tasks `2.4`, `3.4`, `5.5`.

- `[ ]` Dead or ownership-losing controllers cannot leave publishing compiler children. Failed compilation retains
  the prior entry; invalid output or incomplete promotion prevents tests, and repaired preparation succeeds with
  qualified live evidence. Tasks `2.3`, `3.4`.

- `[ ]` Controller evidence is validated and shared without nested acquisition/building. Skip-build permits only
  matching prebuilt evidence and required files; mismatch names a concrete remedy, and repair restores execution
  while generation remains forbidden. Direct native preparation retains its generation-only boundary.
  Tasks `3.2`, `5.3`, `5.4`.

- `[ ]` Rejected/logged close errors and errors appearing only in final worker state make passing cases non-passing;
  clean closing preserves success and any existing failure status. Zero completed cases fail without replacing
  native setup/collection diagnostics. Cost runs retain successful output only after clean closing.
  Tasks `3.3`, `3.4`, `4.4`, `5.2`.

- `[ ]` Existing broad/changed/portability and cost-measurement routes preserve their selections and purposes while
  using the shared execution contract. CI retains qualified artifacts, and guidance accurately distinguishes root
  targets, native values, supported lifetime, direct convenience, and declaration gates. Tasks `5.1`–`5.5`.

- `[ ]` All required quality gates pass.

- `[ ]` Ready for integration.

---
