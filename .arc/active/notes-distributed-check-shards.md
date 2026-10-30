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

### Native reach no-ops and closed empty shares

`store-no-affected.json` qualifies the actual staged no-change selection against its captured declaration, Git
coordinates and explicit selector bindings. The native parent and all five invocations succeed, with no execution
observations and successful closure. Changing the original empty selector to `full` after capture does not alter
playback. The previous helper's rejection of these same native successes is retained as `store-no-affected-red.json`.
No controller exists for this path, so it claims no observed native runtime profile.

`store-small-empty-shares.json` qualifies the actual anchors and as-of suites on Linux x64, Node 26.3.0 and Vitest
4.1.11. Recorded duration bytes produce assignments 1/1/0/0; every invocation and the parent succeed and close. An
unreachable comparison commit names the unchanged working content before the two selected suite edits, so the
captured reach diff contains only those suite paths without changing the branch or real index. Its coordinates live
in `store-small-empty-comparison.json`; original suite files are restored after collection.

An empty native share records the existing observation prefix only after its real controller's close fulfills. It
has a nonempty preflight selection, empty assignment, zero execution cycles and no worker events. Qualification
checks this narrow shape, the complete disjoint union, duration identity and matching observed profiles. A real
three-project fixture proves the previous missing observation, the repaired close witness, ordinary-empty rejection
and a synchronous native close-hook failure that retains exit one without emitting an empty-share observation.

The merged full-integration refresh first ran on m2-mini as history `f8a9e6fd54274f07b16ef88b7b80795e`. Its retained
`integration-full-merged-unset-first-refusal.json` has no native terminal outcomes and uncertain conversation closure;
history explicitly names an OOM kill under the runner's 3,072 MiB limit. Public inspection subsequently proves plan
`7a147032-7bfd-466d-960d-e06477687894` settled. The single fresh qualification retry uses the existing m4-mini pin;
the failed capture remains retained, and this refresh does not close the segment until native qualification succeeds.

The first m4-mini refresh completed all five native commands with exits 1/0/1/0/1 and normal runner closure. Its
`integration-full-merged-m4-failure.json` retains the two fixture causes: the store declaration assertion omitted the
new duration-file binding, and the npm-policy fixture omitted setup's new output-preparation script. The fixture
corrections preserve the production declarations and setup behavior; their focused cases execute those real inputs.

The fresh `integration-full-merged-unset.json` qualifies 482 native modules on Linux arm64, Node 26.3.0 and Vitest
4.1.11, assigned 121/121/120/120 with all five native exits zero, successful parent reduction and closed runner.
History `4eb7cbcb32004627a946f7e3d034b983`, plan `5bca6fa3-72ab-4d8e-bd20-9e6ac07a55be`, binds source HEAD
`945c390175e8234573e2c7f51658ac9ccdd6151b`, captured tree `a2dbfa29aa279b6ac2991648c124dea6c274a191` and base
`d5eff3e358756aee90fea3ee279653eca598c9d0`. It retains unset duration input and per-invocation stdout/stderr. Together
with the unit/store cases above and hosted portability status run `40781020166`, these are captured case/profile
qualifications; no exact-head work-unit verification or unmeasured deployment claim follows from them.

## External group qualification evidence

The provider implementation is isolated in `arc-offload.distributed-check-shards`, branch
`feat/distributed-check-shards`, through `6ffe3cfe6951acf53e9a2184695cfa4c14b59f41`. Its common capture feeds private
placement copies; one public context spans every journaled backend. Completed siblings sample their own argv histories,
admission uses the heaviest member, and each command keeps the existing memory-stall conversion. Normal remote closure
retains family-scoped maintenance; maintenance failure remains advisory. The final full provider suite passes in
`~/dev/arc-evidence/distributed-check-shards/provider-full-after-common-verify.log`.

Live case artifacts are under `~/dev/arc-evidence/distributed-check-shards/`. Each includes actual launch revisions,
reviewed harness source, raw protocol/output, source/input descriptors, public recovery and provider history:

- `native-store-group-e0c5dc60-5e87-4dc0-8241-2a29b38062ab`: owner plan `ffba5ab7-7140-4452-a0b0-86db6083f75d`, history
  `a06a93fb7a5e47c69ebc90f48b64d95f`, provider `807f105`. A baseline plus four-shard store group over anchors/as-of
  succeeds after the disposable originals are deleted and the handed duration file corrupted. Local executes baseline
  and two siblings serially; m4-mini and m2-mini each execute one sibling. Both empty shares prove native close; all
  five commands exit zero and owner closure is normal. Actual Linux x64/arm64, Node 26.3.0 and Vitest 4.1.11 profiles
  are corroborated by complete homogeneous baseline/matrix borrowers over the owner's genuine capture. The unchanged
  strict native validator checks each witness; the corroboration helper substitutes each actual row into its matching
  witness and checks the exactly-once union. Borrowers close before their owner. This establishes those profiles and
  that selection, not deployment-wide reuse.
- `negative-group-bbe10289-a915-478d-aead-246876c2785e`: plan `a3d437b8-d690-45e0-8e47-b4a83528ac0f`, history
  `418dc6cb99634d74aeee722c772e3639`, provider `6ffe3cf`. Generic captured-input Node work emits partial
  binary/stdout/stderr. Native exit 75 is accepted before two siblings start on distinct local/m2 placements;
  terminating only the frontend conversation preserves that failure beside missing terminal outcomes and uncertain
  closure. The actual capture remains retained. Public inspect/settle/inspect covers the same three registered
  local/m4/m2 backends, changing active/exit2 to settled/exit0 with no active members. The interrupted advisory history
  remains open; fresh public recovery, not that historical snapshot, proves settlement.
- `refusal-repair-7398d03e-9945-4016-b52b-f6d5925e0e26`: provider `6ffe3cf`; the genuine SDK-owned explicit-file capture
  is changed only after SDK verification, preserving its wire descriptor and the caller original. Plan
  `4d5607a3-60da-4525-92c4-4ff851d4d610` refuses captured bytes before backend/context/native ownership and exits
  normally; public inspection is settled. Separately planned fresh repair `a36e7892-2f0e-4b04-9b5b-0f857a5549bc`,
  history `1d395fbb5cd64bf7b31a09c645d99ccf`, uses the same source, scalar/file bytes and commands with a new UUID. Both
  commands complete zero on local/m4-mini, exact captured records are observed, parent reduction succeeds and
  closure/inspection are normal and settled. Native marker assertions preserve all provider placement/release stderr.

All live cases use the actual registry and Owner-selected speed mode without a host pin or configuration change. The
provider advertises unknown runtime, so these are execution/settlement qualifications without pass reuse. The original
negative statuses remain failures; their expected containment and recovery establish the negative cases. Earlier
refusal-probe attempts are retained: `refusal-repair-02e76601-5e08-49bf-b1ca-3e51775e325f` stopped its own tap before
forwarding because it assumed the standalone environment prefix; `refusal-repair-c3ef7b70-dcf3-42ea-a907-520b15040bbd`
proved refusal and successful work but rejected legitimate provider stderr. The final probe uses the real SDK source
storage prefix and counts exact native marker lines without discarding surrounding bytes. No failed artifact is
rewritten, no adapter retry is introduced, and no Phase 6 performance or final-head verification follows from these
cases.

## Whole-gate experiment inputs

The initial experiment is frozen under `~/dev/arc-evidence/distributed-check-shards/gate-experiment-acf51cc07/`.
`experiment-config.json`, `experiment-harness/`, `inventory.json` and `preflight.json` bind the actual requests and
implementation. Control and three independent trial clones retain source `acf51cc0743ef37f3e0c755a194a010911252268`,
tree `1972c585c8b871c0ac6733d5485448083291a00f` and production-resolved base
`d5eff3e358756aee90fea3ee279653eca598c9d0`. Ordinary clone-local main/upstream refs preserve the captured origin/main
context; installation/setup/build-fast receipts and source/dependency fingerprints remain outside the trial clock.
The controller imports committed code from its own prepared control clone, independently of later session edits.

Both arms request all inputs with CI unset: 23 cumulative merge entries and 17 push entries, including ordinary
CI-only exclusions. Store asks every, bursts are zero and the duration-file binding is unset. Merge observes actual
unit/store membership; push observes unit. The baseline disables only eligible in-memory routed shard expansion;
distributed retains declared unit-unsharded/store-four-shard defaults. Every gate forces fresh execution, retains
local/index checks, and includes the declared merge build. Native-local runs are context under observed speed mode,
using the existing local worker/heap ceilings; neither routing mode nor registry is changed.

The fixed schedule has three interleaved AB/BA/AB pairs for each idle gate, three matched named-workload rounds per
arm (two concurrent store-selecting merge gates plus one push), then two conditional native-local context runs.
The initial caller budget is 60 minutes per gate and 24 hours overall for at most 32 attempts; it precedes measurement
and does not change provider timeouts. The prior full-store five-command qualification took about 1,905 seconds, so
the whole-gate budget includes preparation and other declared checks. Failed, incomplete or coverage-unqualified
samples remain unsuccessful and stop later launches. Strict profile differences require actual corroboration; this
setup establishes no latency, throughput or performance qualification by itself.

The first attempt, `measurements-f5b4ac8b-0cd0-447d-8c0f-ee363dcf0665/experiment.json`, stops before any gate
launches: zero samples and no performance result. Its pool snapshot and retained histories identify active/queued
checks from `lifecycle-slug-selection` and a separate Errand. A fresh pool snapshot still observes other work.
Idle-pool and named-workload qualification therefore remain open pending a quiet measurement window.

`experiment-harness-capacity-v2/` and `experiment-config-capacity-v2.json` preserve the same fixed requests and
schedule for the next fresh attempt. The private driver corrects one status classification: guard deferral means
unavailable capacity under existing host policy, not proof of a foreign pool job. The provider maps memory/power
probe exit 75 to that flag before querying workers. Actual job/permit occupancy still prevents measurement, and
all unavailable observations remain recorded. The original driver, zero-sample attempt and hashes are preserved;
no routing policy, registry, shard count, source, requested coverage or timeout changes.

### Branch-range comparison after the all-scope gate failure

`measurements-b8a4049e-95f1-437a-af06-468376a13a72/` retains the first actual all-scope baseline. All six routed
checks pass; native unit covers 1,369 modules and store 316 on Linux arm64, Node 26.3.0 and Vitest 4.1.11. The complete
gate nevertheless fails: `lint:md:underwrap` reports 59 findings across 14 unchanged files, including protected site
content. No failing path changed in D5..acf. All captured lifetimes close normally, and no distributed trial starts.
`analysis-failed-baseline.json` retains one unsuccessful sample and zero eligible timing comparisons.

The approved fresh comparison uses explicit `range` scope from `d5eff3e358756aee90fea3ee279653eca598c9d0` in both
arms. `experiment-config-range-v3.json`, `experiment-harness-range-v3/` and `preflight-range-v3.json` bind that
request. Source, declaration, complete check sets, full unit/store suites, every/bursts-zero/unset-duration inputs,
shard defaults, pool policy, sample schedule and caller budgets are unchanged. File lints follow production range
selection; a focused forced range underwrap check passes before expensive gates resume. `resolveCheckRequest`
retains both actual merge coordinates as well as tree/base, so new captures are compared within this fresh profile.

The design still requires equivalent complete requested gates, which the existing range scope supports; only the
chosen measurement request changes. The amendment entry gate therefore selects its first, non-amendment arm.
The original all-scope setup and failed result remain preserved. This branch-range experiment qualifies neither
those failed all-scope gates nor their unchanged Markdown, and no unrelated files are edited to obtain a green result.

### First range pair and remote upload failure

`measurements-range-2f8deeea-9eff-48d6-8ff3-99c6ccf56a0f/experiment.json` retains the first range pair under
provider `6ffe3cf`. The routed-unsharded merge gate passes in 1,337.68 seconds with complete unit/store native
coverage and normal capture closure. Its distributed partner stops unsuccessfully after 248.375 seconds: store
placements on m2-mini and m5-air fail during upload before native launch, while cancellation ends the already
launched m4-mini and local siblings. A concurrent singleton contracts check on m2-mini also fails during upload.
No complete distributed native matrix or performance comparison results.

`distributed-upload-failure-evidence/identifiers.json` names the store plan
`d4cfc446-b362-48a7-9ea5-5637b340fdb3` and contracts plan `adca1b18-a59b-4dba-abf9-19698eb7b32d`, their run IDs,
raw histories, journals and public inspections. Both inspections prove settlement of registered ownership; that
settlement does not supply missing native results or normal SDK closure. Store's uncertain SDK capture remains
retained. Upload journals show cancellation and empty stderr, with placement durations near the existing 120-second
helper deadline; they do not establish whether deadline, cancellation, archive transfer or process drainage caused
failure. No OOM receipt is present. A fresh contracts diagnostic passes locally and therefore supplies no evidence
about the failed remote upload path.

Primary's `8f5e131` was absent from the feature provider. Merge `adc8251` brings its PID-birth-aware process-group
drainage into the isolated feature checkout; the live provider checkout is unchanged. This is a potentially relevant
mechanism, not an established cause of the upload failure. The first post-merge provider regression exposes a fixture
teardown race: a second fake runner can schedule detached pruning because only the first runner's daily marker was
seeded. Commit `75ecdf0` seeds every configured fake runner while explicit maintenance fixtures retain real pruning.
The fresh full regression passes all 433 tests; failed and passing logs remain under the evidence root. Commit
`bb89d87` separately documents actual grouped placement, recovery ownership and advisory records. A fresh provider
freeze and actual remote-path validation precede further measurements; the old pair remains unsuccessful evidence.

### Profile corroboration for whole-gate analysis

Whole-gate qualification can now consume actual homogeneous native witness matrices without changing measured
samples, runtime observations or strict validators. Routed matrices use the existing mixed-profile composition.
Ordinary unit rows remain ordinary: each unchanged row must pass the strict helper as the baseline against a
complete matching-profile witness's declared native shards. Captured basis, duration and selected membership must
agree across both measured arms and every supplied witness. Absent or invalid witnesses leave the pair unqualified;
provider runtime remains unknown and grants no reusable ARC pass.

The pure helper and gate-summary tests cover mixed routed matrices, ordinary cross-profile proof, missing or
incomplete witnesses, different captured input and failed rows. Behavioral red runs `66c8f4b352084014b5c7d4abf5683a8a`
and `da8f648a72ad4959a6b211c1f201699b` reject missing corroboration; green run
`dd4c2287bb154705b02cfc8e02133a59` passes all 20 focused cases. The real gate integration scenarios also pass under
`67b9ce89f5144ecdb95841434459f95d`. Synthetic profile rows are validation fixtures only; no full-gate mixed profile
is qualified by these tests. Actual full native witnesses and their SDK closure/inspection evidence remain required.

### Upload deadline repair and fresh comparison

A pinned M2 contracts diagnostic under `bb89d87` completes its actual remote upload and native check with normal
SDK closure. A separate four-command public group reproduces the concurrent failure: plan
`af4e1799-c5eb-4e68-8fab-21499b1a5882`, run `08cd9c2f8da2403a834338f0aac11d06`, loses M2's upload near the
120-second helper deadline while read-only process observations show archive streaming. M5 finishes uploading just
before group cancellation. The captured source and failed raw receipt remain retained; public inspection proves
settlement without supplying the missing native outcomes. The PID-reuse merge therefore does not resolve this case.

Provider commit `cf08920` allows five bounded minutes for uploads, preserves fixed materialization and command
deadlines, records upload phases and the first owned termination trigger, and includes the helper outcome in its
error. Real deadline/caller-cancellation cases fail before that diagnostic is implemented; the fresh full provider
regression passes all 434 tests. No live provider checkout, mode, registry, admission rule or automatic replay changes.

The same four-command reproduction passes on that committed provider: plan `18b438ec-8691-4bdf-b431-baaec5ffc411`, run
`cca1f680816e46a39958f35470809b2c`. All four actual placements (M4, M2, M5 and local) return zero, the SDK closes
normally and inspection proves the exact registered backend set settled. The two slower uploads each transfer an archive
offset of 192,187,904 bytes in roughly 135 seconds, beyond the former deadline.
`concurrent-upload-diagnostic-1d483ed0-83d4-41e6-bcb8-028c32723988/` retains progress, journals, raw protocol, history
and caller hashes. These short generic commands prove this transport continuation; they are neither full-store
membership evidence nor a measured performance sample.

`experiment-config-range-v4.json`, `experiment-harness-range-v4/` and `preflight-range-v4.json` freeze a wholly fresh
32-slot study on provider `cf08920` in both arms, with the unchanged acf source, explicit range, requests, schedule,
pool policy and caller budgets. Pure analysis is frozen separately from commit `19e3057e3`; measured gate children
still run from acf. Complete harness and collector inventories bind every executed helper. Only a successful closed
block awaiting actual profile witnesses may resume: original child artifacts remain hashed and immutable, completed
slots are skipped, and original attempt/wall budgets persist. Strict and composed native proof remain distinct.
The collector and nonempty receipt loader still require validation against actual fresh full-native witnesses.
Prelaunch setup establishes no new latency, throughput or mixed-profile qualification by itself.

### First repaired-provider pair and pending profile witnesses

The first v4 routed-unsharded merge gate completes successfully in 1,359.647 seconds; its distributed partner completes
in 682.51 seconds. All six captured contexts close normally in each gate, with no retained capture, reported execution
error or native parse gap. Unit observes 1,369 modules on Linux x64 in both arms. Store observes 316 modules on arm64 in
the baseline, then 79 in each of four declared shares: three arm64 and one x64. Node 26.3.0 and Vitest 4.1.11 match
across the observed rows. Available resource observations identify no foreign run IDs during either gate.

The strict runtime check leaves this pair unqualified, so no performance distribution or improvement claim follows from
these raw timings. The controller stops before the next slot with both original samples hashed and unchanged.
`analysis-range-v4-first-pair-unqualified.json` preserves that state. Three repetitions and actual homogeneous profile
corroboration remain required.

Two fresh public SDK witness contexts now match the measured captured source/environment/selection/duration basis before
native work. ARM plan `6d6e26a0-1270-4f3b-bbee-2a1be57c777c` uses the permitted M4 pin; plan
`6befd5b1-eaa4-4361-8b76-b1f315c0d5bc` uses the normal unpinned chooser and selects local while M4 owns the necessary
ARM work. Each complete plan has one unsharded store baseline and the four declared shards, submitted as mandatory
serial singles. The explicit caller budget is two hours per witness, plus bounded closing and inspection. These runs are
outside measured gate clocks and remain unfinished evidence.

Witness archives are `~/dev/arc-evidence/distributed-check-shards/native-store-arm-range-v4-a/` and
`native-store-x64-range-v4-a/`. The collector must still prove every native row, homogeneous membership, normal SDK
closure, exact registered-backend settlement and unchanged provider/source/policy. The receipt reader has not yet
accepted a nonempty real witness set; absent or invalid proof keeps the measured pair unqualified.

### Completed profile witnesses and availability interruption

The four fresh witness archives now prove their full homogeneous matrices: `native-store-arm-range-v4-a/` and
`native-store-x64-range-v4-a/` each contain baseline316 plus four 79-file shards; `native-unit-arm-range-v4-a/` and
`native-unit-intel-range-v4-a/` each contain baseline1369 plus 685/684-file shards. All actual native outcomes are zero,
SDK/frontend closure is normal, and public inspection proves every registered backend settled. Actual profiles are Linux
arm64/x64, Node26.3.0 and Vitest4.1.11; reusable provider runtime remains unknown.
Source/environment/selection/unset-duration bindings and provider `cf08920` are unchanged.

The frozen nonempty receipt validator accepts all four actual archives in `witness-index-range-v4.json`. Original raw
protocol/output, SDK manifest, immutable measured sample and actual configuration remain its authority. A separate
intentionally invalid stdout-copy fixture is rejected; disabling only that byte guard makes the same rejection assertion
fail. `analysis-range-v4-first-pair-witness-qualified.json` therefore qualifies the first complete merge pair without
changing either sample. Witnesses supply membership only, never original-gate closure, timing, pass or reuse.

The resumed v4 study returns seven samples: six complete gates and one incomplete second distributed merge. Both
completed push pairs have equivalent coverage and approximately 148–150-second complete timings. Store plan
`5e34a043-149b-4b7a-aa11-26e8c0b5e0d2`, run `4a35f3101f874a9a94a67cada7c0c2a7`, stops when M5's retained availability
guard reports offline or sleeping after upload. M2/M5 uploads complete successfully in about 132/136 seconds; the other
running siblings are cancelled. This is not a native check failure or another upload deadline. The SDK retains
`/tmp/arc-check-source-7Mxfc7/root`; uncertain closure remains unsuccessful.

Public inspection subsequently proves exactly four registered backends settled. Later pool/Tailscale observations and a
successful registered guard show M5 available again; they do not prove its earlier availability or repair the failed
sample. `availability-loss-idle-2-merge-v4/` retains history, inspection, journals, upload progress and later
observations with hashes. `analysis-range-v4-availability-loss.json` reports six complete gates, three equivalent pairs
and the incomplete row separately. No repeated-merge benefit or named-workload qualification is established.

### Fresh comparison after the availability interruption

`experiment-config-range-v5.json` and `experiment-harness-range-v5/` prepare one fresh 32-slot study with the same
24-hour bound, 60-minute gates, source, provider, range, native selections, every/bursts-zero/unset-duration
environment, registry, mode and AB/BA/AB schedule. All old samples remain in their original study and enter no fresh
timing pair. The destination is `measurements-range-availability-restart-6e338286-a274-46f6-8025-0491bd62213b/` under
the same evidence base. Preflight proves exact clean source/provider and complete check sets; the new harness manifest
hash is `dc9816b90b3f8de4f4311bc69461aacbb3e238998e492122708550a46dec86a0`.

A read-only membership handoff validates the exact original configuration hash, complete original harness, unchanged
receipt validator and all four original receipts against their own study. Its equivalence guard permits only experiment
identity, evidence destination and analysis-bundle identity to change, plus the explicit original-study locator. Every
runtime, selection, schedule, policy and collector field must match. The new gate samples still require their own
successful native execution, complete output, normal closure and matching basis. Eleven changed-input boundaries reject;
disabling only the basis guard in a separate invalid reconstruction makes the same assertion fail. Actual positive and
negative artifacts are in `membership-handoff-v5-validation/`. A further pool interruption stops for diagnosis rather
than starting an automatic qualification retry loop.

### Observed idle-pool gate latency

The fresh v5 case completes all twelve idle gates and six equivalent native comparison pairs. Both arms use source
`acf51cc07`, provider `cf08920`, the fixed D5 range, every/bursts-zero/unset-duration inputs, absent CI and observed
speed mode. Force-fresh execution retains the full declared merge/push check sets and their CI-only exclusions. Unit
remains unsharded; distributed store execution uses four declared shards.

| Gate  | Unsharded median (range), seconds | Distributed median (range), seconds |
| ----- | --------------------------------- | ----------------------------------- |
| Merge | 1,368.558 (1,344.113–1,370.758)   | 667.786 (667.739–670.573)           |
| Push  | 149.165 (144.132–149.792)         | 147.074 (146.506–147.686)           |

Each cell has three samples. Merge median elapsed time falls by 51.205%, about 701 seconds, against a largest within-arm
range of 26.645 seconds. Push differences remain within observed variation, so no push acceleration is established.
These are complete capture-through-collection timings, including the declared merge build and normal transport,
preparation, queueing, execution and closure costs.

Every measured native unit selection contains 1,369 modules; each store baseline contains 316, and each distributed
matrix has four disjoint 79-module shares. The frozen qualifier accepts all six pairs using the four genuine homogeneous
witnesses already recorded. Each measured gate independently supplies its own native outcomes and normal SDK closures;
witnesses transfer membership only. Unknown provider runtime remains unknown and grants no reusable pass.

Public store SDK preparation spans 66.101–123.547 seconds unsharded and 58.001–60.126 seconds distributed. Distributed
additional-placement costs remain inside the end-to-end measurement: twelve placement observations include transfers of
0–139.300 seconds, preparation of 12.002–18.478 seconds and native execution of 305.164–449.034 seconds. Unsharded store
native execution spans 1,212.146–1,242.587 seconds. These are advisory phase/service observations, not additive parallel
end-to-end costs.

Exact input hashes and compact idle arithmetic are in `analysis-range-v5-idle-compact.json`; the frozen full analysis is
`analysis-range-v5-at-owner-pause.json`. `comparison-results-at-owner-pause/` retains the concise summary, store phase
costs and resource audit. Initial dependency installation/preparation is outside timing; interleaved OS/npm cache state
is retained rather than represented as a cold-install benchmark. The result covers the frozen source, provider and
observed Linux profiles, without extrapolation to another deployment or final-head verification.

### Observed named-workload completion and admission

The same v5 freeze completes all eighteen named-workload gates and nine equivalent native pairs. Each arm launches
two forced merge gates selecting store and one push gate concurrently, with independent prepared clones and local
nice-15 controllers. Three interleaved rounds retain the unchanged speed mode, registry and resource ceilings.

| Round | Unsharded complete set, seconds | Distributed complete set, seconds | Elapsed reduction |
| ----- | ------------------------------- | --------------------------------- | ----------------- |
| 1     | 2,862.848                       | 1,443.003                         | 49.596%           |
| 2     | 2,938.562                       | 1,356.588                         | 53.835%           |
| 3     | 2,941.214                       | 1,406.527                         | 52.179%           |

Unsharded complete-set median is 2,938.562 seconds, range 2,862.848–2,941.214; distributed median is 1,406.527 seconds,
range 1,356.588–1,443.003. Paired elapsed reduction has median 52.179%, range 49.596–53.835%. All three complete sets
improve; none crosses the 10% slowdown boundary. Completion uses the local controller's final collection timestamps;
per-gate monotonic intervals agree within 0.6 seconds, without cross-runner clock arithmetic.

| Gate  | Unsharded median (range), seconds | Distributed median (range), seconds | Samples per arm |
| ----- | --------------------------------- | ----------------------------------- | --------------- |
| Merge | 2,848.926 (1,584.245–2,939.218)   | 1,266.940 (959.395–1,443.303)       | 6               |
| Push  | 1,615.447 (661.309–2,941.795)     | 251.433 (226.510–340.716)           | 3               |

These per-gate distributions include admission and overlap, so the acceptance comparison uses each complete set.
Every measured gate supplies its own native outcomes and normal SDK closure with no errors, coverage gaps or retained
captures. Unit selections contain 1,369 modules; store contains 316, with four disjoint 79-module distributed shares.
The same genuine homogeneous witnesses corroborate membership only; no previous timing or passing gate is reused.

Admission snapshots retain an unsharded store occupying M4's heavy permit and nine memory tokens, a second store
waiting for that permit, and fifteen-token unit plans waiting with eleven tokens free. Distributed snapshots show
ordinary concurrent M4, M2, M5 and local placements; a second group waits normally. Available resource observations
across twelve idle gates and six workload arms contain no visible foreign run IDs or truncated observations. This is
sampled evidence, not a reservation or continuous-idle guarantee; placement behavior is observed, not diagnosed as a bug.

Named-workload public store SDK preparation spans 218.273–1,724.228 seconds unsharded and 297.019–843.934 distributed.
Unsharded store admission spans 95.872–1,603.700 seconds and native execution 1,200.853–1,297.496. The twenty-four
distributed placement records span 0.001–720.200 seconds of admission, 0–138.228 transfer, 9.987–19.565 preparation
and 315.939–413.416 native execution. Initial placement is inside SDK preparation; later group placement can occur
inside its run interval. These advisory service spans must not be summed as parallel gate elapsed time.

`comparison-results-at-owner-pause/` retains summary, phase-cost arithmetic, resource audit, preservation record and
file hashes. The frozen full report's SHA-256 is `8ca40e094d4025e539c15a354a309446421b153eeb9465661a8254476741eedd`.
`operator-checkpoint-30-comparisons.json` binds all ninety child request/gate/sample files and the original study
state/config. The observed source, provider, clone trees, registry and mode remain unchanged at the preservation check.

At the requested pause, all thirty comparison gates are complete and all fifteen pairs qualify. The two planned
native-local context slots remain unstarted. The local coordinator was suspended at the collection boundary and then
deliberately stopped after every child had closed; its exit 137 records that operator action, not a native failure or
OOM. The original study remains thirty of thirty-two, with no active children; it is not rewritten as complete.
The separate operator-pause records retain that distinction. The segment closes without those slots (A9).

### Segment closure and observed limits

The Phase 5–6 slice closes on the evidence above. External provider cases on real placements cover a complete native
store group (`807f105`), generic loss and recovery across three backends, settled input refusal with a separate fresh
repair (`6ffe3cf`), and the concurrent remote upload that failed at the former 120-second deadline and completes on
`cf08920`. Four genuine homogeneous witnesses establish unit and store membership for Linux arm64 and x64 with Node
26.3.0 and Vitest 4.1.11. Every cited artifact remains under the evidence root. These cases qualify execution,
settlement and membership; provider runtime stays unknown and grants no reusable pass.

The frozen full report still matches its recorded SHA-256. Its summary returns thirty completed rows with no integrity
gap, launch failure or context refusal. Six idle and nine named-workload pairs qualify with equivalent native coverage:
1,369 unit modules, a 316-module store baseline and four disjoint 79-module distributed shares. The idle merge gain of
about 701 seconds exceeds the largest within-arm range of 26.645 seconds; no push gain is claimed. Every
named-workload round improves by 49.596–53.835%, so the 10% slowdown bound is not approached, and admission snapshots
show ordinary shared admission in both arms. The context phase holds no pairs (A9).

Both arms share the following costs, so they are limits of the current provider's placement and transport, not of the
consumer contract. Per-placement figures come from each gate's retained sample.

- **Placement concentrates on m4-mini.** On the idle pool, the distributed merges' `test:arc-contracts` waited about
  404 seconds to run for 7. Under the named workload, `test:unit` waited 948–2,781 seconds for a 39-second run, and
  m4-mini's store share waited 228–720 seconds while the other three placements started without waiting. No sample
  places work on the Intel MacBook.
- **Store shares are equal file counts on unequal machines.** With no duration file, idle executions run local
  305–309 seconds, m5-air 323–324, m4-mini 391–396 and m2-mini 444–449.
- **Every placement uploads the full materialization.** Each 192 MB upload takes about 3 seconds to m4-mini and
  110–139 seconds to m2-mini or m5-air. m2-mini's 595–599-second placement is the critical path of every 667–670-second
  idle distributed merge.
- **Fixed costs.** A remote check pays about 30 seconds of transfer, preparation and verification on the idle pool,
  and a gate's first check starts 27–81 seconds after launch.

The result covers frozen source `acf51cc07`, provider `cf08920` and the observed Linux profiles. It does not extend to
another deployment, establishes no push acceleration, and is not final-head verification. The last hosted CI run on
this branch, `40781020166` at `a84c27919`, predates later base merges, so the public fixture tiers at the final head
rest on the verification run.

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

### A9 — native local context runs

The Owner decided on 2026-10-30 not to run the two fully native local context slots. They were context only: no
success criterion, exit criterion or task rests on them. This machine's store speed is already observed through the
distributed arm: in each idle merge gate, local executed its 79-module store share in 305–309 seconds, beside m5-air at
323–324, m4-mini at 391–396 and m2-mini at 444–449. The slots were also the last measurement that needed a quiet pool.
The v5 study stays recorded as thirty of thirty-two attempts, with both slots unstarted rather than failed; no
qualification rests on them, so none is lost.

Superseded § Proposed Design 10 ¶7, second sentence, in its A8 form:

> Compare the same gate routed unsharded with the declared shard plan using fresh runs, and report fully native local
> runs as context (A8).

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
