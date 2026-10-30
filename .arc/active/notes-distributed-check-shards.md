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
preparation (`npm ci`, setup, `build:fast`) and runs its invocations serially under one job permit. On a remote
runner it runs from its own uploaded stage, holding the checkout tree lock only in shared mode (`lib/remote-worker.sh`),
and the stage is removed once the plan's closure is proved and recorded. Group integration reuses its compliant
primitives and the existing measured pool/admission; it adds no retry layer.

Preserve arc-offload's memory controls when extending groups. `2dc4ef1` adds `arc_placement.plan_cost`, charging
the heaviest invocation's memory-token share through `execution.request_for(..., token_cost=...)`; a group's
placement must retain its heaviest member's charge. `1578aee` adds one `MemoryStallWindow` around each command's
`journal.run` launch in `arc_adapter.run()`, with `stall_explains_failure` converting failed commands to
`notRunReason` after at least 10% fully stalled time. Keep that window and terminal conversion per command.
`test_arc_adapter.py` covers sustained-stall failure, lightly stalled failure and successful stalled execution.
These changes preserve the adapter protocol; re-ground them from `1578aee` or a later main before restructuring.

`PlanRecord` in `arc_offload/arc_record.py` records each routed plan in `remote-check history`
(`context.execution_source == "captured_plan"`). It carries caller-observed verification, placement, admission,
preparation, execution and transfer seconds, and writes a timing sample only when every invocation exited 0. A
single-argv plan samples under the same key as a legacy run of that command, so a mixed estimate understates routed
cost: one routed `typecheck` on m4-mini took 13.5 s preparation and 9.4 s transfer, against about 2 s and 0.6 s in
legacy samples.

`tests/test_cli.py` and `tests/fake_ssh.py` in arc-offload exercise six-client/fake-host contention and isolated
registry histories. They are useful harness patterns, not throughput evidence. `src/lib/test-cost/run.ts` measures
native test execution and is likewise not a complete capture-through-collection gate benchmark.

## Native qualification evidence

`qualify-native-check.ts` reads the actual declaration and machine runner, captures once through
`prepareSelectedCheckExecution`, then executes the unsharded baseline and declared matrix through the public facade.
It preserves npm prefixes, configured pool admission, native setup/closing and private adapter preparation. Its
in-memory unit clone enables the qualification matrix; the shipping unit declaration stays opted out. Native
observations and the parent/closure results are retained together, without cache reuse.

The first unit qualification records live under the gitignored identity directory
`.arc/user/andrew/.internal/distributed-check-shards-qualification/`:

- `unit-full-unset.json`: Linux arm64, Node 26.3.0, Vitest 4.1.11; 1,321 selected modules (1,280 `unit`, 41
  `unit-mocks`), assigned 659/662 with exact complete/disjoint union and successful parent/closure.
- `unit-full-available.json`: Linux x64 with the same Node/Vitest versions and the same 1,321-member union, assigned
  661/660. One captured 11,761-byte native duration file supplies 66 selected recorded durations plus fallback weights.
- `unit-filtered-unset.json`, `unit-filtered-empty.json`, `unit-filtered-empty-file.json`: actual named unit and
  unit-mocks filters retain two members, assigned one per shard. Empty environment input and an available zero-byte
  file remain distinct observed states; the latter ran on Linux x64, the empty-value case on Linux arm64.

Each record binds its captured source/selection/environment basis and actual native runtime observations. These
records qualify those native cases and profiles; they are not an exact-head work-unit verification or a performance
comparison. Native fixtures additionally cover deletion/widening, fixed input replay and recorded ordering. The
Windows/macOS process-status qualification remains the completed CI record in Task 3.3.b.2 of
`tasks-distributed-check-shards.md`.

Integration qualification with arc-offload `b272745` retains native CPU admission and artifact ownership:

- `integration-full-unset-post-fix.json`: Linux arm64, Node 26.3.0, Vitest 4.1.11; 455 selected modules, assigned
  114/114/114/113 with exact complete/disjoint union, unset duration input and successful parent/closure.
- `integration-filtered-available-post-fix.json`: the same profile; four selected modules, one per declared shard,
  partitioned from one captured 11,761-byte handed file, with successful parent/closure.
- `integration-selection-forecasts.json`: ordinary merge gates exclude the CI-only tier; named requests and `--ci`
  select it and expose the duration binding's name/kind. Native CI retains four shards.

Pre-fix native baselines passed but later invocations were refused when CPU admission left empty directories under
`.git/arc/test-suite`. The original full/filtered receipts are retained as `*-prepared-git-refusal.json`.
`admission-empty-directory-proof.json` reproduces that failure; `admission-directory-post-fix-proof.json` verifies
that ARC directories preserve identity while ARC files and directories elsewhere remain bound after the fix.

## Re-grounding against the landed store backend

The base merge takes `main` at `d5eff3e35`, including the backend landing (PR #1180) and archive (PR #1183),
over consumer head `7388b0993`. The storage flip has not occurred; capture and disposable pass records remain
independent of operational state. The storage cohort's new hardening work does not change this consumer's native
qualification boundary.

The landed `test:store` invokes `node --import tsx scripts/run-reach-check.mjs` with the actual
`__tests__/reach/store-suites.json` catalogue. It already uses `runner: true`, explicit value inputs for
`ARC_STORE_CHECK` and `ARC_STORE_BURSTS`, and four native shards. Its catalogue has no retired-wrapper dependency.
Task 4.3.a therefore adds only the planned routed-shard opt-in and `ARC_TEST_DURATION_FILE: file` binding, with
binding/forecast coverage; selector or catalogue migration is unnecessary on this base.

The actual selection forms are `full`, `every` and reach. An absent/empty ask follows the base/selection-change
rules; any other nonempty ask refuses. Only `ARC_STORE_BURSTS=1` includes the gated timing/burst suites. The three
separate-conformance suites are full-only. `reach-check.ts` includes deletions in its comparison, widens when its
selection or own check entry changes, and validates reach before a no-affected-suite success. An empty native share
closes its discovered controller; nonempty work executes the original full selection with native sharding enabled.
Qualification must observe that distinction and retain close failures, without treating absent execution as success.

The qualification helper currently accepts only unit/integration npm entries and one native shard/sort cycle. Store
adoption must preserve the landed node entry, account for the native reach controller's preliminary empty-share probe,
and observe the actual execution across the `integration`, `integration-timing` and `integration-bursts` groups.
The existing reach selection/shard/cleanup integration tests provide native building blocks, not captured public-runner
qualification. Tasks 4.3.b–c still own the real catalogue, captured selectors/source/durations, no-op and empty-share
evidence. No production scheduler or generic empty-work protocol is needed.

The merged integration/lane and pull-request portability commands exclude reach-store suites. Earlier unit/integration
records above retain their original captured basis; Task 4.4 must refresh native membership on the merged source rather
than carry those counts forward. The combined portability list retains both branches' boundaries. Handler routing
retains machine-configuration refusal containment, cancellation retains the fresh-attempt remedy, and runner session
settlement retains the landed request-write ordering fix. Merge verification covers those overlaps before task work
resumes. Phase 5's external adapter and Phase 6's complete-gate measurements remain separate later boundaries.

### Store qualification and prepared timing output

The native reach entry performs a preliminary shard selection before an execution run begins. The observer keeps
that preflight separate and requires its discovery and assignment to equal the single execution partition over all
three native project groups. A real reach fixture exercises the native sequencing seam; it does not substitute for
the landed catalogue's public-runner qualifications.

`store-selected-deletion-recorded.json` qualifies four actual store suites from one captured range, with a deleted
suite excluded and recorded durations retained. Removing the original selected files, widening the original catalogue,
changing caller selectors and corrupting the original handed file after capture do not change native playback. It
records Linux arm64, Node 26.3.0 and Vitest 4.1.11, with successful parent and closure.

The first burst-enabled full run is retained as `store-full-bursts-unset.json`, with failed runner history
`e9fe045f6a254cc19a73370978822373`. Its baseline selected 321 suites and failed one withdrawal case; the focused rerun
`fc618dc245a0451593a3ab4d2be0c8d6` passed all four variants without establishing the original cause. Primary owns that
investigation. The qualification collector now preserves per-invocation stderr separately from parsed stdout, including
when qualification fails; the original assertion details were not retained.

The baseline's timing suite also created `.test-cost-runs` after preparation, causing all later invocations to refuse
the changed source inventory. Repository setup now establishes that existing output root before generated additions
freeze. `check-output-boundary.py` and its log retain the original refusal and the repaired provider verification:
later timing and `duration-input/` output is allowed while new source files and captured-source changes still refuse.
The timing writer, duration-input helpers and native output paths are unchanged. This repair does not qualify the
failed full run; its fresh replacement is recorded separately.

The machine state path currently traverses an `arc-offload` directory symlink. An initial remote delivery failed
before any native command because transport relativized a resolved binding against the unresolved upload path.
`store-selected-deletion-recorded-state-alias-refusal.json` retains that closed failure. Subsequent store qualifications
use the runner's supported per-run `--state-root` operand with the same physical directory's canonical path, recorded
as a configuration override. Pool policy, capacity and global configuration are unchanged; the transport concern was
reported to primary. Unknown runtime bindings permit execution here but authorize no cached reuse.

`unit-full-merged-unset.json` refreshes ordinary membership on the merged source: Linux x64, Node 26.3.0 and Vitest
4.1.11; 1,367 members (1,323 unit and 44 unit-mocks), assigned 684/683 with successful parent and closure. Its three
separate stderr artifacts retain 31,208 bytes. `store-default-empty-duration.json` qualifies 319 actual store members
on Linux arm64 with the same Node/Vitest versions, assigned 80/80/80/79. The store ask is unset, bursts are a literal
empty string and the duration binding is an empty environment value; the native catalogue independently supplies the
expected set. These remain case/profile evidence on their recorded captures, rather than exact-head verification.

The fresh full-store qualification retained two further unsuccessful attempts. The first is
`store-full-bursts-post-preparation-admission-refusal.json`, history `1173ea3256ad4aec8378199cb275996e`: m2-mini refused
admission before native work. The single fresh-plan retry, `store-full-bursts-post-preparation.json`, history
`96aae45901154241a8dd2d95a0be644b`, received runner RPC error -32000 without any native terminal outcome. Its closure
was uncertain; subsequent public recovery inspection proves plan `5e562bbf-1f59-4c24-b6fc-8bb2c8d43a93` settled with
no active workers. The backend journal retained an owned baseline command without an outcome, and its worker receipt
records SIGTERM after about 30 minutes. Primary subsequently correlated the failure with a kernel OOM kill in the
attempt's 3,072 MiB cgroup at 22:16:30 UTC; SIGTERM followed that kill. The recorded store peak exceeded this cap, but
m2-mini's absent memory budget had allowed placement. The explicitly authorized fresh attempt, pinned to m4-mini,
is retained separately as `store-full-bursts-m4-pinned.json`. It qualifies all 321 native members on Linux arm64,
Node 26.3.0 and Vitest 4.1.11, with shard assignments 80/80/80/81, successful parent and closed runner. Its full/burst
inputs and absent duration file come from one capture; it does not change the failed attempts' evidence or diagnosis.

`store-every-zero-byte.json` also qualifies on Linux arm64 with Node 26.3.0 and Vitest 4.1.11: 316 native members,
assigned 79 per shard, with successful parent and closure. Its ask is `every`, bursts are `0` and the handed duration
file has zero bytes. Catalogue-derived expected membership excludes the gated timing/burst and full-only suites.

The isolated external worktree is `arc-offload.distributed-check-shards`, branch `feat/distributed-check-shards`,
re-grounded through `cb46a71`, including memory-stall attribution, peak-token charging and OOM diagnostics. The
unchanged baseline passed its adapter checks before group implementation. Independent implementation worktrees
isolate transport, placement and recorder changes; the configured live runner checkout remains untouched.

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

### A6 — group execution across runners

Measured on 2026-10-28 on an otherwise idle m4-mini through the legacy warm path (execution seconds):

| Suite                                        | Unsharded | Four shards           | Shard sum | Slowest shard |
| -------------------------------------------- | --------: | --------------------- | --------: | ------------: |
| store (`storage-ref-backend` at `3d0d4dcad`) |     1,396 | 266 / 393 / 358 / 278 |     1,295 |           393 |
| `test:integration`                           |       436 | 143 / 98 / 104 / 145  |       490 |           145 |

Integration sharding costs about 12% more work. Store's cost was not measurable: its shards summed 7% under the
unsharded run, inside the 6–8% run-to-run variance. On fallback duration estimates the slowest shard ran 1.19–1.21×
its suite's mean.

Two store shards run concurrently on m4-mini from separate checkouts took 483 s against 504 s back to back. Each
took 1.8× its solo time, CPU busy rose from about 66% to 88–90%, and the slowest timing-sensitive store case doubled
from 2.0 s to 4.0 s. The idle CPU in a solo run is not spare capacity, so one heavy job per machine stays and a
group's parallelism is bounded by free heavy-capable machines. Two jobs sharing one checkout also serialize inside
the repository, first on the heavy-test slot in `src/lib/local-test-admission.ts`, then on the checkout artifact
lease in `src/lib/build-ownership.ts`; private prepared copies are what let siblings overlap.

Per plan, dependency preparation took 4.4–5.5 s and a 182 MB upload 2.6 s on an idle runner; the adapter's local
materialization and verification about 4.7 s; ARC capture about 8 s after a repository repack, about 10 s from CLI
start to adapter start. Capture and local materialization happen once per check, so a group pays them once; upload
and preparation repeat per placement. Sharing an installation across views would save about 5 s per placement and
bring back the cache relocation A5 deferred, so each placement keeps a private copy. § Proposed Design 9 changes CI
clear/upload locations only as the native cache path requires. With no relocation, A6 supersedes Success Criterion 8's
"updated private cache clear/upload paths" clause and the task list's matching clause; the unchanged paths serve.

An independent review of the amended plan found the adapter built for one placement per plan: one placement choice,
one journal `remote`, one stage per plan ID, backend frames forwarded with their own context identity, a non-waiting
launch on runners with a wake probe, and no timing history on the routed path (`History.record` runs only in the
legacy `run_on`). Group placement bookkeeping, multi-placement recovery, pre-launch fallback and sibling timing
records are therefore new adapter work (5.1.b–5.1.d). Whole-plan recording has since landed in `PlanRecord`, so
5.1.d extends it per sibling. The duration file becomes a declared input, because the adapter passes undeclared
ambient variables to every placement uncaptured.

That first routed record also puts per-placement cost above the hand timings: 13.5 s preparation and 9.4 s transfer
for one `typecheck` on m4-mini, against 4.4–5.5 s preparation and a 2.6 s upload measured by hand. A shard group pays
that once per placement, in parallel. On store's modelled 7.5–11 minutes it is minor; on integration's 3–4 minutes
it is noticeable. Phase 6 measures it.

With m2-mini and m5-air about 1.45× and 1.3× slower than m4-mini on store, a four-shard store group is modelled at
about 7.5 minutes on four free heavy machines and 10–11 minutes on three, against 23 minutes unsharded on m4-mini;
integration at 3–4 minutes against 7.5. These come from shard times, not end-to-end runs; Phase 6 measures them.

Locally routed groups use the native partitioner's fallback estimates. No developer machine holds a current duration
file, and collecting one would be test-cost budgeting, which the Non-Goals exclude. Ordering siblings by expected
duration recovers part of the imbalance.

Superseded § Proposed Design 7 ¶7, in its A5 form:

> Give concurrent invocations private writable execution views or serialize access to a shared writable view.
> Sharing immutable dependency data is allowed; distinct cwd paths alone do not isolate mutable writers aliased
> through a shared `node_modules` directory. Where execution views share a dependency installation, give each view
> a private Vite `cacheDir` and private workspace-relative reporters; a private copy per view needs no relocation
> (A5). A private writable path must lie under a root the adapter's preparation established, because adapters refuse
> an invocation after an earlier one created an unprepared path. The external adapter's group design decides whether
> views share installations.

Superseded § Open Questions ¶1:

> Open, pending measurement (A5): how the external adapter executes a complete group. It advertises no group
> capability, prepares dependencies in a fresh copy for every plan and serializes plans from one worktree on each
> runner, while each machine admits one heavy job. Measured per-plan preparation cost and native shard execution
> splits decide fan-out of one context across placements, per-placement preparation and whether views share
> installations, sibling placement and checkout locking, and admission under five or six concurrent gates. A forward
> amendment settles that design before Phase 5 begins.

### A7 — routed shard opt-in

`test:unit` declares two shards for CI and routes on the push gate. Its unsharded run takes about 40 s on m4-mini,
so expanding it on the routed path would pay upload and preparation per placement for no useful gain. Store and
integration, at 23 and 7.5 minutes unsharded, opt in. The flag sits beside `runner: true` as declaration
eligibility. It sets no count, placement or concurrency preference, so the Non-Goals on concurrency preferences and
shard counts outside declarations do not apply. Unit keeps its native membership qualification: Phase 1 changes the
shard-argument expansion that CI's native unit shards share, so that check still guards behavior this work changes.

Superseded § Proposed Design 2 ¶2, first sentence:

> Expand a declared shard plan during ordinary execution only when the selected check is eligible and a configured
> runner is selected.

### A8 — named workload and bounded slowdown

Goal 7 and Success Criterion 10 required five or six concurrent gates with no concurrent regression. Push gates hold
nothing worth sharding, five or six concurrent store merge gates is not a load one developer produces, and a fixed
sharded plan always carries its measured overhead on a saturated pool, so the criterion was either unattainable or
uninformative. The named workload, two concurrent forced merge gates that each select store plus one push gate, is
the realistic contended case. It depends on store landing, already recorded as a dependency.

The baseline is the same gates routed unsharded, which is today's behavior under a configured runner; both forms pay
capture, so the comparison isolates sharding. Fully native local runs stay reported as context. The 10% bound sits
above the 6–8% run-to-run variance, below which nothing is measurable, and above store's unmeasurable overhead.
Integration's 12% does not enter the workload, since `test:integration` runs only in CI or on explicit request. A
slowdown beyond the bound means fan-out costs every concurrent session more than run-to-run noise.

Goal 7 and Success Criterion 10 remain in the spec unedited. Superseded § Proposed Design 10 ¶4, second sentence:

> Compare native unsharded execution with the declared shard plan using fresh runs.

Superseded § Proposed Design 10 ¶5:

> Interleave repeated baselines and distributed runs with an idle pool, then repeat under five or six concurrent
> gates. Include capture, transport, preparation, runtime qualification, admission/queueing, execution and
> collection. Report median/range, aggregate completion, native coverage and observed admission. Claim improvement
> only beyond observed run-to-run variation. A concurrent throughput regression remains unresolved work; an isolated
> faster gate does not conceal it. Serial basic adapters need no speedup claim, and unmeasured deployments gain none
> by implication.

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
