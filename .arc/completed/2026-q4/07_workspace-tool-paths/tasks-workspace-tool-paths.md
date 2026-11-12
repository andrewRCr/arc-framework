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

### `[x]` **2.1 Share renewable lease lifetime with checkout artifact ownership — D4**

- _Goal:_ CPU admission and checkout artifact ownership share reliable renewal/release handling while retaining
  distinct scopes; loss of confirmed ownership prevents continued owned work.

    - `[x]` **2.1.a Preserve existing CPU admission through shared lifetime handling**
        - Shared renewable ownership retains process identity, deadlines, exit cleanup, and contention behavior.
          Checked release refuses silent removal failures; renewal and exit protection remain through pending or failed
          release, and the existing CPU-admission cases retain their behavior.

    - `[x]` **2.1.b Add checkout-scoped artifact ownership using the same primitive**
        - Checkout-local leases exclude builders through consuming actions and retain useful cancellable diagnostics.
          Heavy ownership acquires CPU first and artifacts second; CPU bypasses retain artifact exclusion, native-loaded
          controls share one process identity, and replaced ownership cannot authorize publication.

### `[x]` **2.2 Compile full and fast builds into owned asynchronous staging — D4, D5**

- _Goal:_ Full and fast compilation can complete without blocking the owning process's renewal, and compiler
  children can write only unique staging output.

    - `[x]` **2.2.a Invoke an internal asynchronous compiler route under existing ownership**
        - A native-loaded parent invokes a staging-only Node compiler asynchronously under its existing lease.
          Compiler blocking leaves renewal active; owner death permits staging completion without live publication.
          Ownership confirmation shares pending renewal and never revives authority after a stopping decision.

    - `[x]` **2.2.b Complete requested full/fast artifacts before reporting generation success**
        - Both native configuration roots load once and feed captured options; schema generation remains isolated.
          Fast output supplies runtime/schema graphs, while full output awaits declarations. A real declaration failure
          rejects the request, cleans its staging, preserves the previous live entry, and supplies the rebuild remedy.

### `[x]` **2.3 Publish qualified generations with failure and recovery handling — D3, D4, D5**

- _Goal:_ Only stable, validated output owned by the coordinator becomes a qualified live generation; publication
  failures prevent test execution and retain a usable repair route.

    - `[x]` **2.3.a Validate and publish staged output with evidence last**
        - Native parent controls certify the complete generation interval and validate staged CLI/schema/declarations.
          Initial publication creates absent output; confirmed ownership covers ancillary/entry replacement and required
          old-output cleanup before evidence becomes live. Invalid output, input drift, and owner loss refuse publication.

    - `[x]` **2.3.b Recover safely from compilation or partial publication failure**
        - Preparation rechecks recorded inputs and complete required files without loading a compiler; qualified full
          output serves runtime reuse, while explicit requests regenerate. Interrupted publication removes prior authority
          and repaired invocations qualify anew; private staging-disposal failures warn without revoking successful reuse.

### `[x]` **2.4 Route explicit builds and self-hosting refresh through one coordinator — D4, D9**

- _Goal:_ Root/package builders and post-command self-hosting refresh use one non-recursive ownership boundary,
  and CLI freshness retains runtime-only selectivity and actionable refusal/retry behavior.

    - `[x]` **2.4.a Wire explicit full/fast builders and staged self-refresh to the coordinator**
        - Root/package full and fast scripts use the owning Node adapter and always generate explicitly requested
          output. Self-refresh uses that same non-recursive coordinator, retains the prior entry on failed compilation,
          queues behind same-checkout consumers, and preserves independent progress in another checkout.

    - `[x]` **2.4.b Read runtime identity in the self-hosting freshness guard and refresh proof**
        - The compiler-free runtime reader determines CLI freshness; mtimes supply diagnostic ages only. Schema-only
          edits remain selective, unusable evidence refuses with the complete repair command, and successful refresh
          proves the published runtime identity. Disposable stale-guard fixtures retain native dependency resolution.

## **Phase 3:** Prepared controller execution and cleanup

_Purpose:_ Prove the controller, global setups, build coordinator, and closing policy together on the integration path.

_Exit criterion:_ A supported integration command uses one qualified runtime/schema generation without nested build
acquisition. A manual build waits through controller closing, and an ownership-losing or dead controller cannot leave
a compiler child that publishes. Stable repaired inputs restore successful preparation and execution.

### `[x]` **3.1 Discover projects before admission and owned runtime preparation — D2, D3, D4**

- _Goal:_ Actual discovered projects determine build/admission needs, and the same controller owns each heavy
  run's qualified generation until its closing path finishes.

    - `[x]` **3.1.a Discover configured specifications before admission or preparation**
        - Public controller discovery bootstraps the native environment before configuration, initializes reporting
          once, and optionally applies the validated native pre-parse skip predicate. Refined project membership
          determines CPU admission; empty selection and native parsing failure close before setup or admission.
          Disposable controller/worker fixtures retain explicit environment values and match native cross-file `.only`.

    - `[x]` **3.1.b Prepare and execute selected specifications under the controller's ownership**
        - `executeVitestSelection` acquires CPU then artifacts for heavy selections, validates and provides the
          qualified runtime/schema generation, and executes refined specifications with native initial-run semantics.
          Closing remains inside both leases on preparation, setup, collection, and execution failures; CPU bypass
          retains artifact ownership.

### `[x]` **3.2 Wire prepared tier execution and evidence-aware global setups — D2, D3, D9**

- _Goal:_ Global setups consume validated controller evidence without nested ownership/building; direct native
  setup can ensure a generation, and skip-build always forbids generation.

    - `[x]` **3.2.a Wire prepared tier execution and controller-provided setup evidence together**
        - Integration and E2E setups validate the exact current generation through public provided context. Own-key
          presence rejects malformed and mismatched values without nested repair; multiple heavy projects share
          the controller's prepared generation. Ordinary E2E preparation no longer depends on the lifecycle name.

    - `[x]` **3.2.b Compose direct native preparation and the prebuilt-only route**
        - Absent context uses artifact ownership for direct preparation, without pinning unmanaged execution.
          Every preparation path forbids generation with skip-build enabled; qualified prebuilt reuse and repaired
          continuation preserve that flag and avoid native compiler configuration loading.

### `[x]` **3.3 Preserve execution and final cleanup failure status — D8**

- _Goal:_ Passing cases cannot hide empty completion or closing failures, and later cleanup handling never clears
  an existing native failure or replaces setup/collection diagnostics.

    - `[x]` **3.3.a Interpret completion through public reports and case results**
        - Public module reports and nested case results count only passed or failed execution. Unmatched names,
          skips, todos, and pending cases cannot establish completion; native parsing, setup, collection, and
          completed failures retain their status and diagnostics.

    - `[x]` **3.3.b Observe close errors and final unhandled state in a shared scoped adapter**
        - `closeVitestController` forwards public error logging during closing, restores the logger, and checks
          final unhandled state before ownership release. Rejected or swallowed closing errors preserve prior
          failures and remain non-passing even with native ignored-error options; real teardown and worker fixtures
          exercise the shared discovery and execution closing paths.

### `[x]` **3.4 Validate owned integration — D2, D3, D4, D5, D8** — validate exit criterion at segment scope

- _Goal:_ An executable supported integration path demonstrates qualified preparation, test/build exclusion through
  cleanup, loss-safe compiler behavior, and successful repaired continuation.

- _Outcome:_ Native integration barriers queued public builders through execution and closing under both CPU
  bypasses, while an independent checkout built successfully. Killed and ownership-replaced controllers left
  surviving compilers confined to staging; repaired qualified output restored prebuilt integration execution.
  Native compile, invalid-output, input-drift, and incomplete-promotion fixtures retained refusal and repair behavior.
  Real swallowed teardown and final worker errors remained non-passing; the full live generation qualified declarations.

## **Phase 4:** Focused repository-root interfaces

_Purpose:_ Make exact root test selection and focused lint exercise the established execution and package-cwd contracts.

_Mode:_ `slice` — closes on working root npm invocations with explicit targets and native option values.

_Exit criterion:_ One ordinary npm separator selects exact files/cases, rejects each ineligible operand, and supports
unit, integration, E2E, and mixed targets with configured defaults and deliberate native overrides. Root TypeScript
lint and its staged-file caller preserve package-cwd suppression and option-value semantics; literal Markdown remains.

### `[x]` **4.1 Validate focused test operands and native execution flags — D1, D2**

- _Goal:_ The root helper resolves explicit repository-relative targets and native values unambiguously, and each
  target contributes eligible configured specifications before any build or heavy ownership is requested.

    - `[x]` **4.1.a Normalize root targets and enforce the fixed native run interface**
        - The root input helper retains every explicit file/directory operand and native literal execution value,
          validates existing test-tree targets, and rejects configuration/source/mode overrides and extra separators.
          Long spellings are checked before public parsing can discard unknown fields; parsed aliases, value types,
          and inherited option names are validated before discovery.

    - `[x]` **4.1.b Constrain discovery to exact operands and eligible configured projects**
        - Focused discovery selects exact files and directory descendants from native configured specifications,
          requires every operand to contribute after project filtering, and preserves native specification identity.
          The exact-selection boundary precedes optional pre-parsing; broad tier discovery retains native filters.

### `[x]` **4.2 Execute exact focused selections through the root npm interface — D1, D2, D3, D8, D9**

- _Goal:_ One ordinary root npm separator runs exactly the requested tests through the shared controller boundary,
  with native execution defaults/overrides and correct runtime needs for unit, heavy, and mixed selections.

    - `[x]` **4.2.a Add the direct Node root entry and compose the prepared runner**
        - Root `test:file` resolves literal operands before entering fixed package cwd and composes exact discovery
          with the prepared controller. Native isolation, pool, file-parallelism, and worker overrides retain precedence;
          focused ownership has its own diagnostic label without becoming a broad tier command.

    - `[x]` **4.2.b Prove focused unit/heavy/mixed execution and preparation outcomes**
        - Real root npm fixtures prove unit execution without preparation or leases and heavy/mixed execution against
          one reusable qualified generation through controller closing. Empty runtime case selection remains non-passing;
          native pre-parsing refines runtime needs without invalidating initially eligible operands.

### `[x]` **4.3 Normalize focused TypeScript lint and staged-hook targets — D1, D9**

- _Goal:_ Root focused TypeScript lint and the staged-file hook select their intended files while retaining native
  package-cwd suppression, option-value, and exit semantics.

    - `[x]` **4.3.a Add explicit root-target normalization at the focused ESLint boundary**
        - The direct root lint entry requires explicit repository-relative targets, normalizes file/directory/glob
          bases, and executes installed ESLint in package cwd. Tokens after the optional delimiter retain native
          option-value and positional-pattern bases, suppression behavior, and exit status.

    - `[x]` **4.3.b Update the staged-file caller with the root operand contract**
        - The staged hook reads NUL-delimited Git records and forwards literal repository-relative paths, preserving
          spaces, Unicode, tabs, and newlines through native lint and suppression lookup. Native lint failure still
          rejects the check, and both type checks report after earlier failures.

### `[x]` **4.4 Validate focused root invocations — D1, D2, D3, D8** — validate exit criterion at segment scope

- _Goal:_ Real root npm invocations prove exact focused execution and lint selection with native values/defaults,
  while invalid targets, empty cases, and cleanup failures yield non-passing results.

- _Outcome:_ Real root npm invocations established exact focused execution, native defaults and overrides, owned
  runtime reuse, and package-cwd lint semantics including literal staged filenames. Each ineligible operand and
  fixed-interface override refused before preparation; empty and cleanup outcomes remained non-passing despite
  native success/ignore permissions. The retained Markdown helper linted exactly its named file.

## **Phase 5:** Supported command and CI composition

_Purpose:_ Exhaust the remaining production entry points and prebuilt consumers, then align developer guidance.

_Mode:_ `replication` — closes on every supported run-mode route using the shared lifetime and qualification boundary.

_Exit criterion:_ Broad tier, changed-test, portability, and retained cost-measurement runs use the shared controller
contract while preserving their selections and purposes. CI prebuilt consumers retain qualified evidence and obey
skip-build without generation. The full declaration gate and documented root/native command boundaries remain intact.

### `[x]` **5.1 Compose all remaining run-mode tier entry points — D2, D3, D8, D9**

- _Goal:_ Every remaining supported tier entry preserves its native coverage, filtering, exclusion, and sharding
  while using discovery-driven preparation and common completion handling.

    - `[x]` **5.1.a Migrate remaining direct run-mode entries and tier argument composition**
        - Unit, changed-unit, and macOS portability scripts now use the shared controller with their native selections.
          Root tier wrappers preserve literal options through one separator; configured refinement, repeated excludes,
          line filters, and pre-shard ownership remain shared. The direct native watch and collecting-list routes remain.

    - `[x]` **5.1.b Verify route-wide ownership and completion behavior**
        - Real npm routes retain tier membership, literal flags, native line selection, sharding, and initial coverage.
          Parsed exclusions reach each project's public configuration before native discovery, preserving its defaults.
          Mixed shards retain prepared heavy setup and shared ownership; shared refinement and failure fixtures remain.

### `[x]` **5.2 Share prepared execution and closing with retained cost runs — D2, D3, D8, D9**

- _Goal:_ Retained cost runs keep their configured selections, timing capture, record format, and reporting purpose,
  while preparation or final cleanup failure cannot leave a successful retained run.

    - `[x]` **5.2.a Compose cost measurement with the prepared controller lifetime**
        - Measurements share discovery, refinement, prepared execution, and closing; capture runs before owned release.
          Timing includes creation through capture, subtracts reported CPU queue time, and excludes release/persistence.
          The script preserves output-path bases before entering package cwd; native metadata and record axes remain.

    - `[x]` **5.2.b Retain measured output only after common completion succeeds**
        - Failed, empty, missing-timing, all-skipped, logged-close, and late-worker-error runs retain no passed record.
          Public module diagnostics and native timing/spawn metadata remain usable by existing retained-run consumers.
          Default cost output is excluded from build inventory, so successful retention preserves qualified reuse.

### `[x]` **5.3 Qualify CI artifacts and prebuilt consumer recovery — D3, D6, D7, D9**

- _Goal:_ CI consumers execute only matching qualified prebuilt runtime/schema output, and recovery does not
  silently generate artifacts while skip-build is enabled.

    - `[x]` **5.3.a Carry evidence through producer upload and consumer download contexts**
        - Every downloaded-artifact and platform-local consumer prepares qualified runtime/schema output before
          skip-build execution. Native full-build transfer proves matching reuse and consumer-local repair while
          retaining producer/platform declaration gates and existing CI scheduling.

    - `[x]` **5.3.b Verify prebuilt mismatch remedies and repaired consumer success**
        - Native prebuilt refusals retain output until artifact/installation repair; repaired retries share qualified
          evidence without compilation. Real Node mismatch, builder cancellation/retry, and CI-owned setup/teardown
          are covered; portability selects installation, owner loss, link inventory, and file-replacement scenarios.

### `[x]` **5.4 Align developer command guidance and declaration gates — D1, D3, D4, D9**

- _Goal:_ Developer examples accurately describe root operands, native option-value bases, supported artifact
  lifetime, direct native convenience, and the separate declaration gate.

    - `[x]` **5.4.a Align focused and native command examples with the implemented interfaces**
        - Project command guidance documents exact root operands, native option bases and execution overrides,
          literal lint/fix helpers, and mandatory selection/completion guards. Executed examples cover one-case
          selection, project/worker overrides, quoted lint globs, and the optional lint delimiter.

    - `[x]` **5.4.b Align preparation, ownership, CI, and quality-gate guidance**
        - Guidance distinguishes owned runtime/schema reuse, queued explicit builds, CI preflight/skip-build, and
          direct native generation-only convenience while retaining declarations and both type checks. Package
          development tooling now declares `tsx` directly with the existing range and locked version.

### `[x]` **5.5 Validate supported routes — D2, D3, D4, D8, D9** — validate exit criterion at segment scope

- _Goal:_ The enumerated supported writer/consumer and CI routes are exhausted with executable evidence that
  coverage, runtime qualification, ownership, and final failure handling remain coherent.

- _Outcome:_ Both manifests, managed controllers, setups, self-refresh, staged lint, and CI routes compose the shared
  boundaries. Native tier, changed-test, retained-cost, and artifact-transfer/recovery scenarios preserve selections,
  failure handling, and owned generations. The full declaration build qualifies; changed stale-build-guard E2E
  execution reuses that generation with skip-build enabled and releases ownership after closing. Required remote
  E2E/portability enforcement remains at the CI/merge boundaries.

## **Phase 6:** Verification

### `[x]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Complete quality-gate and success-criterion evidence supports integration of the finished work unit.

- _Quality gates:_ 13,496 tests passed; both type checks, TypeScript/Markdown/shell lint, all three ARC contract
  checks, the full declaration build, and all three changed E2E cases passed.

- _Success criteria:_ All 14 met, none superseded or unresolved. Author review and fresh criteria review found
  no findings; Pass 1 of 2 converged. Complete evidence is retained with the personal work-unit criteria report.

---

## Success Criteria

- `[x]` Exact root files/directories and native name filters work through one npm separator; every operand contributes
  an eligible specification, and invalid/excluded/empty operands fail before admission or build. Tasks `4.1`, `4.2`.

- `[x]` Configured project placement and isolation/worker defaults hold; explicit native execution overrides retain
  precedence without relaxing adapter guards. Unit-only runs acquire no heavy/artifact lease and request no build;
  heavy/mixed runs retain ordered ownership through closing. Tasks `3.1`, `3.4`, `4.2`.

- `[x]` Root TypeScript targets and the staged-file hook preserve package-cwd suppressions, literal option values,
  and the optional delimiter. The retained Markdown helper lints only its named file. Tasks `4.3`, `4.4`.

- `[x]` Integration and E2E require runtime/schema artifacts regardless of outer lifecycle name; qualifying full
  output is reusable. Full declaration failure prevents publication, and fast output never satisfies that separate
  gate. Tasks `2.2`, `2.3`, `3.2`, `5.4`.

- `[x]` Qualified unchanged inputs reuse runtime/schema output; selected inputs, config, installation/tool/runtime
  identity, or membership changes invalidate it. Ordinary schema-only content changes retain CLI freshness, and
  unrelated ordinary source-content edits retain selective reuse. Tasks `1.1`, `1.2`, `1.4`, `2.3`.

- `[x]` Native resolution-changing siblings refresh the graph. Internal file/directory link retargeting, entry-kind
  replacement, and nested resolver-manifest edits invalidate even with unchanged old input digests; unused manifest
  edits may conservatively invalidate both identities. Tasks `1.1`, `1.3`, `2.3`.

- `[x]` Observed source/config/install or rich-inventory changes during generation discard staging; missing baseline
  dependency inputs prevent certification. Stable repaired inputs build successfully using baseline evidence.
  Tasks `1.4`, `2.3`.

- `[x]` Supported manual builds queue through heavy-controller closing in the same checkout; other worktrees have
  independent artifact ownership. CI and concurrency bypasses skip only CPU admission. Tasks `2.4`, `3.4`, `5.5`.

- `[x]` Dead or ownership-losing controllers cannot leave publishing compiler children. Failed compilation retains
  the prior entry; invalid output or incomplete promotion prevents tests, and repaired preparation succeeds with
  qualified live evidence. Tasks `2.3`, `3.4`.

- `[x]` Controller evidence is validated and shared without nested acquisition/building. Skip-build permits only
  matching prebuilt evidence and required files; mismatch names a concrete remedy, and repair restores execution
  while generation remains forbidden. Direct native preparation retains its generation-only boundary.
  Tasks `3.2`, `5.3`, `5.4`.

- `[x]` Rejected/logged close errors and errors appearing only in final worker state make passing cases non-passing;
  clean closing preserves success and any existing failure status. Zero completed cases fail without replacing
  native setup/collection diagnostics. Cost runs retain successful output only after clean closing.
  Tasks `3.3`, `3.4`, `4.4`, `5.2`.

- `[x]` Existing broad/changed/portability and cost-measurement routes preserve their selections and purposes while
  using the shared execution contract. CI retains qualified artifacts, and guidance accurately distinguishes root
  targets, native values, supported lifetime, direct convenience, and declaration gates. Tasks `5.1`–`5.5`.

- `[x]` All required quality gates pass.

- `[x]` Ready for integration.

---
