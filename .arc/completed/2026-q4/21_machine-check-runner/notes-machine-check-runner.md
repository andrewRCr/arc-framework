# Machine Check Runner Notes

## Contents

- [Implementation map](#implementation-map)
    - [Native integration constraints](#native-integration-constraints)
    - [Lifecycle scenario assignment](#lifecycle-scenario-assignment)
    - [Qualification evidence](#qualification-evidence)
- [External adapter boundary](#external-adapter-boundary)
- [Repository adoption inventory](#repository-adoption-inventory)
- [Store prerequisite adoption](#store-prerequisite-adoption)
- [Execution cost measurements](#execution-cost-measurements)
    - [Observed phase costs](#observed-phase-costs)
    - [Reproduction](#reproduction)
- [Reference Material](#reference-material)

## Implementation map

Paths beginning `src/`, `__tests__/` or `examples/` below and in `tasks-machine-check-runner.md` are relative to
`packages/arc-framework/`. Proposed module/API names express implementation responsibilities, not an installed Node SDK
or a requirement to retain a name when source-grounded implementation calls for a smaller composition.

| Responsibility                  | Existing actor / proposed boundary                                                                      | Tasks    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Repository selector authority   | Extend `GIT_REPOSITORY_LOCAL_ENVIRONMENT` / `environmentForGitCwd` in `src/lib/git/process-executor.ts` | 1.1–1.2  |
| Explicit binding scope          | New `src/lib/checks/environment-inputs.ts`: capture, identity, bind and disposal                        | 1.3–1.5  |
| Shared wire authority           | New `src/lib/checks/runner/contract.ts`: exported Zod DTOs plus correlated-plan validation              | 2.2      |
| Selected source evidence        | Extend `ResolvedCheckRequest`, `checkedContent` and routed HEAD validation in `resolve-request.ts`      | 2.3      |
| Fixed raw source                | New `runner/source*.ts`: opaque capture, public manifest, scoped byte view and ownership                | 2.4–2.5  |
| Final argv partition            | Extend `checkArgumentBudget` / `batchCheckPaths` in `batching.ts`                                       | 2.6      |
| Process conversation            | New `runner/session.ts`: `createCheckRunnerSession`, framing, RPC and closure evidence                  | 3.1–3.2  |
| Consumer preparation            | New `runner/execution.ts`: `prepareSelectedCheckExecution` returning `PreparedCheckExecution`           | 3.3      |
| Scoped key material             | Factor `resolveCheckKeyMaterial`; native `resolveCheckKey` composes runtime; `checkContentKey` hashes   | 4.1      |
| Generic native outcome baseline | New `checks/result.ts`: `normalizeCheckInvocationOutcome` / `reduceCheckInvocationOutcomes`             | 4.3      |
| Real fixture seam               | New `__tests__/fixtures/checks/runner.ts` above `createDeclaredCheckRepository`                         | 3.4      |
| Independent executable          | New `examples/check-runner/local.mjs`, conformance launches actual shipped bytes                        | 3.4, 5.3 |

`PreparedCheckExecution` consumes a complete generic invocation/probe plan, source-basis evidence and captured binding
scope. Its owned result distinguishes ready from settled unavailable and retained uncertainty. A ready context exposes
applicable runtime bindings, mandatory single execution, optional grouped execution, cancellation, release/closure and
immutable per-ID outcomes with incomplete detail. The consumer owns its plan/matrix and pass key; the facade owns
capture/session lifetime. Correlation and closure use the RFC's wire fields directly rather than a second provider
protocol. Later consumers extend this substrate instead of recapturing source, reimplementing recovery or reducing
console text.

### Native integration constraints

These constraints record the native code as found at planning, which routed execution had to extend without changing
native behavior.

`executeSelectedCheck` currently calls `selectedCheckKey` and pass lookup before dry-run/batch execution.
`runDeclaredCliRequest` supplies `runCheckProcess` for execution and a separate raw-stdout runtime closure. Capture and
routed preparation must enter before key lookup, rather than only replacing `io.execute`.

`checkEnvironment` installs intentional checked-index `GIT_INDEX_FILE` after `environmentForGitCwd`; retain that native
exception. `environmentForRawGit` in `src/lib/change-facts.ts` carries another existing fifteen-name list for its
standalone raw Git process. Include that caller in the authority/dependency trace before factoring shared sanitization;
do not create a third list in runner code or change that caller's raw-output/removal policy. `CheckDeclarationSchema`
composes a separate selection codec, so fields must survive input, decoded output and encode. `CiForecastEnvelopeSchema`
reconstructs forecast fields, so changing only the TypeScript forecast interface would drop `environmentInputs` during
CI parsing.

`executeCheckBatches` currently collapses batches and its catch path returns a nonstarted result;
`unavailableBatchResult` preserves an earlier failure only for a later notice-based unavailable result. The shared
reducer must cover every later unavailable/throw/transport path without weakening native killed/no-evidence rules.
`finalizeCheckRun` retains check verdict/publication authority; `installGap` inspects caller dependency files and must
not reinterpret a routed executor using that unrelated installation.

`WorktreeSnapshot` retains a temporary Git index/tree. Its canonical tree is useful code evidence, but it cannot prove
raw dirty/filter/EOL presentation. `checkedContent` distinguishes source basis internally while `ResolvedCheckRequest`
currently omits the discriminator and HEAD. Preserve both for routed capture and verify unborn explicitly; leave
unrelated native refusal policy intact.

### Lifecycle scenario assignment

These are executable production-path obligations, consumed by the task-list criteria at work-unit verification. The
segment verifiers record scenario evidence; implementation and any correction stay in preceding owning tasks.

| Lifecycle row                                       | Production composition                                        | Executable evidence task |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| Native explicit binding / late CI capture           | `executeSelectedCheck`, `runForecastCheck`                    | 1.6                      |
| Routed prepare before reusable lookup               | `executeSelectedCheck` plus prepared facade                   | 4.6                      |
| Cache hit without execution, then release           | Same check handler and facade                                 | 4.6                      |
| Context-owning success and ordinary failure         | Handler result/publication plus release                       | 4.6                      |
| Failure beside later missing work                   | Generic reducer and handler text/JSON                         | 4.6                      |
| Settled unavailable/cancelled preparation           | Session no-context drain/exit arm                             | 4.6                      |
| Cancel during preparation/execution and stdin EOF   | CLI signal handling, facade and real adapter children         | 4.6, 5.5                 |
| Transport loss before context / during execution    | CLI diagnostics, retained capture and provider inspect/settle | 4.6, 5.5                 |
| Failed recovery write before may-outlive work       | Actual example and external adapter launch boundary           | 3.4, 5.2                 |
| Cleanup-only warning / optional persistence failure | Settled release and existing local stores                     | 4.6                      |
| Repository ordinary declaration adoption            | Actual configured and isolated-native command entry           | 6.4                      |

### Qualification evidence

Use injected unit boundaries for schemas, pure planning/reduction and deterministic lifecycle faults. Real Git,
filesystem, framing, signals, filters and process cleanup belong in integration/E2E fixtures; use the existing
retry-safe temporary repository cleanup and built-CLI helpers. Keep new fixture/module directory READMEs current. Real
Windows status qualification is required in addition to wire fixtures on Linux. Task 4.5 owns platform-aware real
process cases and their `localVitestTierArguments` execution selectors plus `isPortabilitySurfacePath` classification.
Selection regression tests exercise the production route; classifier tests cover the actual new source/test paths. The
existing Windows/macOS portability job runs only on schedule or explicit dispatch with `run_portability_pair`. Task 4.6
records a completed Windows run through that route or another qualified Windows environment; green Linux fixtures or a
cross-platform job that never selected the new cases do not establish the required evidence.

The `files` inventory in `package.json` and CLI-only `baseOptions.entry` in `tsup.config.ts` do not expose private
TypeScript modules as an installed adapter API. Ship the standalone executable and readable contract intentionally; do
not add public schema commands or SDK exports solely to make test fixtures work. The package README is a new file.
Render the package-source quality-gates strategy through `npm run render:framework -- <package-source-path>` and verify
installed inventory, rather than copying configurable instance content.

Expected projection-layout fixtures and landed backend/projection code, when available during open implementation,
exercise cache/report independence. This adds no completion wait on storage or durable operational-state writer.

## External adapter boundary

Installed arc-offload revision `a70242d` carries the provider's command-routing policy. Its README § Command routing
safeguards and `Repository.route_for(argv)` define literal-prefix, first-match repository command routes. The adapter
must apply these routes to planned argv before preparation and runner-dependent runtime/cache qualification, retain
the eligible placement through execution, and prevent pins or fallback from broadening eligibility. A grouped plan must
satisfy every invocation's route; local placement requires every applicable rule to allow it and the active provider
mode to permit it. Resolve routes before transport/shell wrapping rather than losing the original argv's restriction.
These remain provider-owned policy, with no new ARC protocol/resource fields; live registry contents remain outside
tracked evidence.

Required arc-offload changes land in that independent repository under its own instructions and checks. Proposed files
are `arc_offload/arc_adapter.py` and `tests/test_arc_adapter.py`; qualify the same public executable boundary from ARC
and record the exact external revision with evidence. Keep registry, provider capacity, local admission, transport
selection and fallback there. ARC has no provider dependency or privileged execution hook.

`Checkout.current` reads original checkout coordinates and `snapshot` stages/canonicalizes that checkout in
`arc_offload/repository.py`. Adapter execution must instead consume the delivered captured artifact. Original cwd may
identify repository registration/control-plane policy; it cannot authorize a fresh source capture.

`run_on` in `arc_offload/execution.py` calls provider `ensure` and `deliver` before creating its legacy run attempt ID,
then may retry once after a lost result and confirmed stop. The adapter's plan-UUID recovery association must cover that
earlier preparation window, and adapter mode must not replace a launched planned invocation, even after settling it.
Reuse suitable primitives while preserving ordinary remote-check behavior outside the new adapter.

External unknown runtime is a valid initial qualification result: report it honestly and disable reusable evidence.
Claim known only with applicable executor/probe coverage and stability through launch. Explicit values are literal;
provider resource ceilings cannot silently rewrite a declared input. If an explicit value conflicts with supported
resource policy and cannot be honored, report unavailable with a remedy. Undeclared resource controls remain provider
policy.

Qualify permitted local fallback through isolated test configuration; never change or override the owner's live
required-remote mode. Record timings/revisions/results without credentials, live host inventory or registry data.

## Repository adoption inventory

Before adoption, the `checks` in `.arc/system/arc-checks.yml` carried nine command prefixes using the prototype
`scripts/check-runner.sh` wrapper. This baseline inventory was re-grounded at retirement against every then-landed
command and data consumer:

| Check                      | Ordinary executable / script                  | Current placement detail to preserve            |
| -------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `typecheck`                | `npm run -s typecheck`                        | Commit gate                                     |
| `typecheck:test`           | `npm run -s typecheck:test`                   | Commit gate                                     |
| `lint:ts`                  | `npm run -s lint:ts`                          | Push gate                                       |
| `test:changed`             | `npm run -s test:changed --`                  | Files mode, package root, no-evidence status    |
| `test:unit`                | `npm run -s test:unit --`                     | Push gate; declared two-way CI shard forecast   |
| `test:integration`         | `npm run -s test:integration --`              | Merge gate; declared four-way CI shard forecast |
| `test:integration:content` | `npm run -s test:integration`                 | Files mode without paths, no cache              |
| `test:arc-contracts`       | `npm run -s test:arc-contracts`               | Commit gate                                     |
| `test:e2e:local`           | `node --import tsx scripts/run-local-e2e.mjs` | Files mode, deletion selection, no cache        |

The wrapper also appeared in `global_inputs`; that dependency was removed with the executable. Preserve ordinary
native unsharded execution and CI's existing forecast playback. During adoption, inventory actual selection/data readers
in the command stack and declare their supported environment inputs; provider mode/registry/admission variables are
control-plane configuration, not a new framework selector hierarchy. Keep builds, formatters, index-certifying checks
and projected-state selections outside routing.

## Store prerequisite adoption

Available storage-ref-backend source adds `test:store` through the prototype wrapper. Its native `selectReachCheck`
reads the catalogue's `ask` binding `ARC_STORE_CHECK`, and `selectReachSuites` gates additional suite membership on
`ARC_STORE_BURSTS`. Both are explicit `value` inputs for routed adoption. Preserve the native reach command, files mode
without passed paths, shard declaration, legitimate no-op/empty-share semantics and applicable runtime probes; runner
eligibility changes placement, not native selection meaning.

The available `__tests__/reach/store-suites.json` names `scripts/check-runner.sh` as an exact widening path.
`selectReachSuites` always calls `ReachGraph.pathSet` and `throwProblems`; `requireFile` rejects a missing exact path in
full and reach modes. Removing only the command prefix is insufficient for a consumer carrying that catalogue. At wrapper
retirement (Task 6.1), the base and execution checkout contained no store declaration, reach catalogue or store
environment reader, so no catalogue reference needed removal.

This adds no foundation wait on the backend. When store is present at retirement, the foundation adopts it with the
other landed consumers. If it arrives afterward, the native-store consumer aligns that later profile's ordinary command,
eligibility, explicit inputs and catalogue before its own qualification. Prototype executable retirement, provider
discovery and machine configuration migration remain foundation responsibilities; no closed foundation work is queued to
reopen. Re-ground actual landed source rather than copying the available prerequisite's schema or claiming its
qualification early.

## Execution cost measurements

Measured with ARC `58944c71b450560612511de9867dcc0736ad63da` and external arc-offload `cc6c43e`. The reproducible
drivers are `__tests__/benchmarks/check-runner.ts` and `check-runner-native.ts` in the CLI package. Their SHA-256
digests are respectively `29593263154f158cc43d4d01bfc1f5c74035f9a7b9e4eb301c395e41400babbc` and
`bb16b6beb6ad9f879b2f43b431f35426c20c990bc93cea1c8932b53e2f27bc23`. Raw observations stay in the identity's ignored
internal directory; they contain literal machine paths and are not package content.

The caller was WSL2/Linux x64, Node `v26.3.0`, Git `2.55.0`, under `nicecap` at niceness 15 with 18 available logical
CPUs. Three independent fixture samples each ran cold, warm and hit-candidate turns. Cold starts a fresh committed
fixture and context; OS, Git, npm and pool caches remain available. Warm forces another execution of the same fixture
through a fresh context. The hit candidate uses ordinary lookup after those successful runs. No performance threshold
was imposed. Integration and merge-gate workloads are excluded from these measurements.

The builtin workload hashes fixed input 10,000 times, consumes a 64-byte explicit file and a fixed scalar, and requests
an actual Node-version probe. Six committed files total 1,818 bytes locally and 1,730 bytes externally; the command's
literal executable spelling accounts for the difference. JSON observations record every fixture file's byte digest.
The standalone uses known Node runtime. External runtime remains unknown, and its isolated repository profile runs
real `npm ci --ignore-scripts --no-audit --no-fund` against the empty dependency lock before every context. The active
owner mode was `speed`, with no environment override; the isolated route forbids local placement. Live configuration,
capacity and mode were left untouched.

### Observed phase costs

All values below are milliseconds, reported as the median of three samples per row. Capture includes explicit
bindings, source presentation, independent Git metadata, planning and preverification. Preparation includes process
startup, provider materialization/admission/transport/dependencies/probes and caller postverification. Run includes
validation, required output and settlement; known-runtime requalification also occurs there. Close counts the first
release, drained exit and input cleanup once. Total also includes selection and key/store/report work; stage medians
are not additive estimates of total.

| Adapter           | Turn                    | Capture | Preparation |   Run | Close |   Total | Total range     |
| ----------------- | ----------------------- | ------: | ----------: | ----: | ----: | ------: | --------------- |
| Standalone, known | Cold forced             |   113.4 |       682.9 | 767.9 |  12.5 | 1,639.6 | 1,524.1–1,687.1 |
| Standalone, known | Warm forced             |   109.7 |       665.2 | 797.1 |  10.2 | 1,648.5 | 1,485.4–1,661.6 |
| Standalone, known | Reused                  |   121.2 |       642.2 |   0.0 |  10.5 |   797.5 | 795.6–824.9     |
| External, unknown | Cold forced             |   122.4 |     2,389.5 | 159.5 | 772.5 | 3,482.5 | 3,429.5–3,506.2 |
| External, unknown | Warm forced             |   120.5 |     2,263.7 | 164.3 | 788.6 | 3,363.5 | 3,260.4–3,474.5 |
| External, unknown | Hit candidate, executed |   107.4 |     2,257.0 | 163.2 | 814.8 | 3,370.4 | 3,369.4–3,372.1 |

Ordinary workload diagnostics record monotonic inner-probe-child and dependency-body durations separately. Probe
stdout remains the stable Node version, so timing variation cannot invalidate a reusable key. Receipt files are
outside captured source, fixed by an explicit value per fixture, and are cleaned after settlement. A hit reads fresh
local preparation receipts rather than timing data from cached command output.

| Adapter    | Body                           |  Cold |  Warm | Hit candidate |
| ---------- | ------------------------------ | ----: | ----: | ------------: |
| Standalone | First probe's inner Node child |  24.0 |  23.4 |          23.2 |
| External   | Probe's inner Node child       |  13.6 |  13.6 |          14.7 |
| External   | npm dependency preparation     | 140.4 | 140.2 |         147.2 |

Standalone live turns execute two probes, during preparation and prelaunch qualification; reused turns execute only
the preparation probe. External turns execute one probe each. The standalone performs no dependency installation.
Body timers exclude the outer probe process/supervisor. Public preparation timings do not identify pure copy time
separately from admission, transport, verification and supervision; those costs remain in the measured aggregate
rather than being assigned unsupported component values.

Every one of the 18 contexts launched an adapter and closed normally. The nine known-runtime contexts executed six
invocations, published six passes and performed three successful lookups with no invocation on each hit. All nine
external contexts executed; runtime was unknown and lookup/publication counts were both zero.

Three real eligible-but-unconfigured native requests had median total 44.5 ms, range 44.4–52.3 ms. Counters recorded
zero routed preparation calls, source-capture directories, adapter spawns or empty-map explicit captures, alongside
three ordinary command spawns. Independent declared-file capture used 64 KiB read buffers, verified copied bytes and
cleanup, and measured these medians separately:

| Declared file | Capture | Disposal |
| ------------- | ------: | -------: |
| 64 bytes      |  0.8 ms |   0.4 ms |
| 1 MiB         |  3.2 ms |   0.6 ms |

### Reproduction

Run the committed drivers from the repository root, supplying output paths under an ignored local directory:

```sh
. ~/.memcap.sh
nicecap node --import tsx packages/arc-framework/__tests__/benchmarks/check-runner-native.ts /path/under/repo/native.json
nicecap node --import tsx packages/arc-framework/__tests__/benchmarks/check-runner.ts --samples 3 --output /path/under/repo/local.json
nicecap node --import tsx packages/arc-framework/__tests__/benchmarks/check-runner.ts --samples 3 --output /path/under/repo/external.json --origin https://example.invalid/arc/check-runner-cost.git --runner '["/path/to/arc-check-runner","--config","/private/benchmark-registry.json"]'
```

For the external run, copy the current owner registry to a private test file and append this repository profile,
substituting eligible runner IDs from that copy. Keep the owner mode unchanged. The preparation program is one literal
line because provider configuration rejects newline-containing arguments:

```json
{
  "id": "check-runner-benchmark",
  "origins": ["https://example.invalid/arc/check-runner-cost.git"],
  "prepare_commands": [["node", "-e", "const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');const directory=process.env.CHECK_BENCH_DIR;if(!directory)process.exit(2);fs.mkdirSync(directory,{recursive:true,mode:0o700});const started=performance.now();const result=cp.spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'ignore'});fs.appendFileSync(path.join(directory,'events.jsonl'),JSON.stringify({phase:'dependency',elapsedMs:performance.now()-started})+'\\n');if(result.status!==0)process.exit(result.status??1);"]],
  "build_commands": [],
  "command_classes": [{"arguments": ["workload.cjs"], "class": "slot"}],
  "command_routes": [{"argv_prefix": ["node"], "runners": ["ELIGIBLE_RUNNER"], "allow_local": false}]
}
```

The drivers use actual declaration reading, machine-file parsing, Git, pass stores, child execution and the prepared
facade. Unavailable or uncertain work stops sampling and retains its fixture for inspection; it is never replaced
implicitly. These small fixture observations describe measured setup/reuse costs rather than full-project workload
speed or billing.

## Reference Material

- [Cargo runner configuration][cargo]
- [Remote Execution API][reapi]
- [Bazel remote caching][bazel-cache]
- [Buck2 remote execution][buck2]
- [Buck2 executor configuration][buck2-config]
- [Bazel dynamic execution][bazel-dynamic]
- [JSON-RPC 2.0 specification][json-rpc]
- [MCP stdio transport][stdio-transport]

---

[cargo]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[bazel-cache]: https://bazel.build/remote/caching
[buck2]: https://buck2.build/docs/users/remote_execution/
[buck2-config]: https://buck2.build/docs/api/build/CommandExecutorConfig/
[bazel-dynamic]: https://bazel.build/remote/dynamic
[json-rpc]: https://www.jsonrpc.org/specification
[stdio-transport]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
