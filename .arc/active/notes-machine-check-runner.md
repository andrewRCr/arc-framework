# Machine Check Runner Notes

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

The current `checks` in `.arc/system/arc-checks.yml` contain nine command prefixes using `scripts/check-runner.sh`. This
is the baseline inventory; retirement re-grounds all then-landed command and data consumers:

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

The wrapper also appears in `global_inputs`; remove that dependency when retiring the executable. Preserve ordinary
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
full and reach modes. Removing only the command prefix is insufficient. Before wrapper deletion, Task 6.1 updates every
then-landed consumer and removes obsolete exact catalogue references, with real wrapper-absent reach selection
regression coverage.

This adds no foundation wait on the backend. When store is present at retirement, the foundation adopts it with the
other landed consumers. If it arrives afterward, the native-store consumer aligns that later profile's ordinary command,
eligibility, explicit inputs and catalogue before its own qualification. Prototype executable retirement, provider
discovery and machine configuration migration remain foundation responsibilities; no closed foundation work is queued to
reopen. Re-ground actual landed source rather than copying the available prerequisite's schema or claiming its
qualification early.

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
