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

The runner foundation is an implementation prerequisite. Its task-generation session proposes the following
package-relative seams; these are unshipped names to re-ground after landing, not an installed Node SDK:

- `src/lib/checks/runner/contract.ts`: shared validated protocol DTOs.
- `src/lib/checks/runner/execution.ts`: `prepareSelectedCheckExecution` and `PreparedCheckExecution`, accepting the
  complete generic invocation plan and exposing source/runtime qualification, singles, optional groups,
  cancellation, release and retained terminal outcomes.
- `src/lib/checks/runner/session.ts`: `createCheckRunnerSession`, owning the adapter process and conversation.
- `src/lib/checks/key-resolver.ts`: `resolveCheckKeyMaterial`, separating scoped captured-content/environment
  material from runtime observation; `resolveCheckKey` remains the native wrapper.
- `src/lib/checks/result.ts`: `normalizeCheckInvocationOutcome` and `reduceCheckInvocationOutcomes`, preserving
  generic native/no-evidence/failure interpretation. The handler's `finalizeCheckRun` remains pass authority.
- `__tests__/fixtures/checks/runner.ts`: `createRunnerCheckRepository` and `createScriptedRunnerFixture`, building
  on the declared-check repository fixture. The standalone baseline is `examples/check-runner/local.mjs`.
- In arc-offload, the proposed single-command baseline is `arc_offload/arc_adapter.py` with
  `tests/test_arc_adapter.py`; the distributed consumer extends that qualified adapter rather than adding another.

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
The foundation retires wrapper consumers present at its adoption; any later store addition is aligned by this
consumer without reopening prototype executable retirement or migrating machine settings. Capture the actual
selection readers, including `ARC_STORE_CHECK` and `ARC_STORE_BURSTS`, and the handed duration file when read.
Remove obsolete retired-wrapper catalogue dependencies and prove native full/reach selection with the wrapper absent.
This division adds no storage-backend completion wait to the generic foundation.

`localVitestTierArguments` in `src/lib/local-vitest-runner.ts` selects portability suites explicitly.
`isPortabilitySurfacePath` in `src/lib/change-facts.ts` classifies their source changes; these are separate surfaces.
The Windows/macOS portability pair in `.github/workflows/ci.yml` runs on its schedule or explicit dispatch, not
automatically because a pull request receives a portability classification. Consumer selector/matcher additions
must complement the landed foundation entries and actual platform qualification must name its completed run.

The existing arc-offload `local_run`, `dispatch`, `snapshot`, `runner_environment` and `run_on` actors are in
`arc_offload/cli.py`, `repository.py` and `execution.py`. Their legacy path snapshots per command, forwards selected
environment strings and may retry after confirmed stop. The foundation's qualified adapter must already replace
that path where it conflicts with fixed captures, explicit inputs, pre-work recovery or at-most-once execution.
Group integration reuses its compliant primitives and the existing measured pool/admission; it adds no retry layer.

`tests/test_cli.py` and `tests/fake_ssh.py` in arc-offload exercise six-client/fake-host contention and isolated
registry histories. They are useful harness patterns, not throughput evidence. `src/lib/test-cost/run.ts` measures
native test execution and is likewise not a complete capture-through-collection gate benchmark.

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
