# Distributed Check Shards — Notes

## Historical performance context

Earlier runner-pool measurements put a complete store run at approximately ten minutes on the primary mini and
608.86 seconds on WSL. Distributing whole checks reduced the measured full gate from 1,072.05 to 665.62 seconds.
Those runs used a frozen historical source. They motivate investigating the remaining long checks; they do not
predict performance at a newer head or qualify distributed execution.

## Supplemental investigation

Local harnesses and results live under `.arc/user/andrew/.internal/distributed-check-shards-recon/` in this checkout:

- `probe.py` and `input-transport-result.json`: one frozen tiny repository and static two-way manifest, with one
  direct WSL sibling and one admitted remote sibling. Source, duration, manifest and HEAD identities matched after
  editing the original fixture; membership was complete/disjoint and a forced remote failure retained status 7.
  The temporary fixture retained inherited runner path mappings; the live registry and routing mode were unchanged.
- `capture-objects-probe.py` and `capture-objects-result.json`: two independent materializations retained captured
  dirty/untracked bytes, original head/base, executable mode, symlink, deletion and external duration input. The
  original index was unchanged and private state/projection data was absent. The tiny Linux object pack was
  808 bytes; production ancestry-transfer and preparation costs were not measured.
- `capture-raw-bytes-probe.py` and `capture-raw-bytes-result.json`: one Linux `text eol=lf` fixture demonstrated
  that Git-only materialization changed CRLF working bytes, while a frozen raw-byte overlay restored them without
  changing the code coordinates or original index.

These fixtures establish limited transport/materialization observations. They did not qualify native Vitest
membership, runtime identity, cache reuse, parent pass publication, cancellation or performance. They also did not
qualify arbitrary filters, LFS, submodules, sparse/shallow history or Windows file semantics.

The native reach-based store observations used source revision `82579e9f0ff38613e9cb3d8456d5f6d8e7498884`.
`runReachCheck`, `runReachSuites` and `reach-check-shards.test.ts` are useful starting pointers for selection no-ops
and empty-share behavior; inspect the landed implementation before native qualification.

## Implementation starting points

The runner foundation has landed. Its package-relative seams:

- `src/lib/checks/runner/contract*.ts`: validated protocol DTOs; `contract-operations.ts` carries the unsigned
  32-bit exit range.
- `src/lib/checks/runner/execution.ts`: `prepareSelectedCheckExecution`, the `buildPlan` seam and
  `PreparedCheckExecution` (`run`, `runGroup`, `supportsRunGroup`, `observedOutcomes`, `cancel`, `terminate` and
  `close`, which performs release). `execution-run.ts` dispatches singles and groups.
- `src/lib/checks/runner/planning.ts`: `planCheckExecution`, the unsharded batch plan with captured path spelling.
- `src/lib/checks/runner/key.ts`: `composePreparedCheckKey`, projecting known runtime per invocation in plan order.
- `src/lib/checks/key-resolver.ts`: `resolveCheckKeyMaterial`, the runtime-free key material; `resolveCheckKey`
  remains the native wrapper.
- `src/lib/checks/result.ts`: `normalizeCheckInvocationOutcome` and `reduceCheckInvocationOutcomes`. The handler's
  `finalizeCheckRun` remains pass authority.
- `src/handlers/check/run.ts`: `executeRoutedSelectedCheck` and `executeRoutedSingles`, the routed branch this
  consumer extends.
- `__tests__/fixtures/checks/prepared-execution.ts` (scripted adapters, including group modes) and `runner.ts`
  (`createRunnerCheckRepository`, `LOCAL_RUNNER_EXAMPLE`). The standalone example is `examples/check-runner/`.
- In arc-offload, `arc_offload/arc_adapter.py` (entry `arc-check-runner`) with `tests/test_arc_adapter.py`; it
  advertises `runGroup: false` and unknown runtime. The distributed consumer extends it rather than adding another.

The 2026-10-28 reground fact sheet, with source loci for every claim, is
`.arc/user/andrew/.internal/distributed-check-shards-recon/reground-2026-10-28.md` in this checkout.

Current `resolveCheckForecast` in `src/lib/checks/forecast.ts` appends shard arguments after batching. Its
`checkArgumentBatches`/`batchCheckPaths` inputs in `src/lib/checks/batching.ts` therefore need the complete final
fixed argv before the shard matrix is formed. Preserve native platform budgeting outside routed execution.

Current `executeSelectedCheck` in `src/handlers/check/run.ts` computes local runtime/key information before
execution. The consumer instead uses the foundation's prepared source/probe material and projects its complete
runtime coverage onto canonical batch/shard order. Keep attempt IDs distinct from those stable coordinates.

`HeavyFirstSequencer.shard` is the native assignment observation point; `getRelevantTestSpecifications` does not
pre-shard. The process-backed helpers in `__tests__/helpers/vitest-controller-fixture.ts` and
`focused-vitest-fixture.ts` provide native controller seams. An observed assignment is qualification data, never a
pre-partitioned execution input with sharding still enabled.

Native store adoption is checked against the landed declaration and reach catalogue before qualification.
The foundation retired the wrapper consumers present at its adoption; this consumer aligns the store addition from
`storage-ref-backend` without reopening prototype executable retirement or migrating machine settings. Capture the
actual selection readers, including `ARC_STORE_CHECK` and `ARC_STORE_BURSTS`, and the handed duration file when read.
Remove obsolete retired-wrapper catalogue dependencies and prove native full/reach selection with the wrapper absent.
This division adds no storage-backend completion wait to the generic foundation.

`localVitestTierArguments` in `src/lib/local-vitest-runner.ts` selects portability suites explicitly.
`isPortabilitySurfacePath` in `src/lib/change-facts.ts` classifies their source changes; these are separate surfaces.
The Windows/macOS portability pair in `.github/workflows/ci.yml` runs on its schedule or explicit dispatch, not
automatically because a pull request receives a portability classification. Consumer selector/matcher additions
must complement the landed foundation entries and actual platform qualification must name its completed run.

The qualified adapter replaces arc-offload's legacy `snapshot`/`deliver`/`run_on` path for ARC plans and reuses its
placement, admission and transport primitives. Each plan gets a fresh copy of the captured root and full dependency
preparation (`npm ci`, setup, `build:fast`), runs its invocations serially under one job permit, and on remote
runners takes the worktree's checkout lock exclusively. Group integration reuses its compliant primitives and the
existing measured pool/admission; it adds no retry layer.

`tests/test_cli.py` and `tests/fake_ssh.py` in arc-offload exercise six-client/fake-host contention and isolated
registry histories. They are useful harness patterns, not throughput evidence. `src/lib/test-cost/run.ts` measures
native test execution and is likewise not a complete capture-through-collection gate benchmark.

## Amendment reasoning

### A2 — store dependency

The store check is absent from `main`. It exists on `storage-ref-backend` as `test:store` (merge gate, four shards),
still invoking the retired wrapper and supplying `ARC_STORE_CHECK` / `ARC_STORE_BURSTS` through a runtime probe.
Its suite has grown toward twenty minutes, which makes it the clearest sharding beneficiary, so store qualification
stays in scope and this work unit records the dependency rather than carving store out.

### A3 — E2E leaves routed qualification

Superseded success criterion 6 read: "For unit, integration, store and E2E, native shard assignments have
complete/disjoint union against native unsharded selection under qualified profiles." `test:e2e` declares four shards
but no `runner: true` and is `ci_only`, so no routed E2E execution exists to qualify; this was a planning gap rather
than drift. CI keeps native E2E membership validation (`validateE2EShardMembership`). Forecast changes still reach
E2E CI playback and stay covered by the forecast/CI criteria.

### A5 — cache placement and the external group design

Both adapters verify the captured root before each invocation and refuse one after an earlier invocation created a
path outside the roots established during preparation; the standalone example refuses any new path. A relocated
`.test-cache/vite/` would trip that check on serial playback. The aliasing it guards against does not arise while
each plan has a private copy, but returns if the adapter shares dependency installations across views to avoid
repeated preparation. Placement is therefore decided with the external group design.

That design is reopened pending measurement. Locally placed plans spend a median of about 24 s from adapter start to
first command (66 journals), including copy, dependency preparation and verification; remote preparation was not
recorded. Remote runners admit one heavy job per machine, and same-worktree captured plans serialize on the checkout
lock. The measurement covers real remote preparation cost, native shard execution splits for unit, integration and
store, and whether same-worktree plans can overlap, before Phase 5's tasks are rewritten.

## Prior-art references

- [Cargo runner configuration][cargo-runner]: executable/argument configuration.
- [Remote Execution API definitions][reapi]: command, environment, working directory and input-root vocabulary.
- [Bazel remote caching][bazel-caching]: action inputs and untracked-tool caveats.
- [Swarming user guide][swarming-guide] and [bot documentation][swarming-bot]: task workspaces and retained caches.
- [Bazel test sharding][bazel-sharding]: native runner participation in a shard contract.
- [Nextest partitioning][nextest-partitioning] and [running tests][nextest-running]: partition and no-tests policies.
- [pytest-xdist execution model][xdist-model] and [crash handling][xdist-crashes]: collection agreement and worker loss.
- [Buck2 remote execution][buck2-remote] and [executor configuration][buck2-executor]: placement/fallback policy.

---

[cargo-runner]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[bazel-caching]: https://bazel.build/remote/caching
[swarming-guide]: https://chromium.googlesource.com/infra/luci/luci-py.git/+/HEAD/appengine/swarming/doc/User-Guide.md
[swarming-bot]: https://chromium.googlesource.com/infra/luci/luci-py/+/refs/heads/main/appengine/swarming/doc/Bot.md
[bazel-sharding]: https://bazel.build/versions/9.2.0/reference/test-encyclopedia
[nextest-partitioning]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/ci-features/partitioning.md
[nextest-running]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/running.md
[xdist-model]: https://pytest-xdist.readthedocs.io/en/stable/how-it-works.html
[xdist-crashes]: https://pytest-xdist.readthedocs.io/en/stable/crash.html
[buck2-remote]: https://buck2.build/docs/users/remote_execution/
[buck2-executor]: https://buck2.build/docs/api/build/CommandExecutorConfig/
