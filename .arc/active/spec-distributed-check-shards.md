# Spec (`detailed` · `RFC`): Distributed Check Shards

- **Origin:** [internal]
- **Purpose:** Execute declared check shards through a provider-neutral runner while preserving native coverage,
  trustworthy parent results and correctly scoped pass reuse. Reduce check wait time without weakening evidence or
  exceeding the execution setup's existing resource admission.

---

## Introduction / Context

A check declaration describes a command, its selected inputs and optional shard arguments. Running the entire check
on one machine leaves a long check on the gate's critical path even when other execution capacity is idle. Several
concurrent gates also compete for that capacity, so an isolated speedup does not establish useful overall behavior.

`resolveCheckForecast` in `packages/arc-framework/src/lib/checks/forecast.ts` expands existing shard declarations
for CI. `executeSelectedCheck` and `executeCheckBatches` in `src/handlers/check/run.ts` currently execute ordinary
commands without expanding that shard metadata. The forecast appends shard arguments after computing file batches,
which is insufficient when those final arguments can exceed a worker's command-line budget.

This design adds the distributed consumer of a common runner foundation. The foundation has landed and is qualified
on Linux through a standalone example and the external arc-offload adapter (A1). Section 1 defines the contract this
consumer requires; no sibling planning document supplies missing behavior.

Source paths beginning with `src/` or `__tests__/` below are relative to `packages/arc-framework/`. Desired behavior
is normative; statements naming current actors describe the starting implementation and require re-grounding before
code changes.

## Goals

1. Execute one selected check's complete declared batch/shard plan against one common captured input basis.
2. Keep project declarations and ARC independent of any execution provider, machine inventory or native test tool.
3. Produce one correct parent verdict, preserving useful completed failures and explicit incomplete-work diagnostics.
4. Reuse a successful parent only when its scoped inputs, complete plan and applicable execution runtimes match.
5. Preserve native selection, partitioning, completion and artifact-ownership contracts for unit, integration,
   store and E2E checks, including their different legitimate-empty and no-evidence outcomes.
6. Qualify a public adapter independently, then qualify the personal arc-offload integration through the same seam.
7. Measure end-to-end gate latency and aggregate completion under five or six concurrent gates, including preparation
   and queueing costs rather than counting submitted jobs as performance evidence.
8. Judge concurrent benefit on a named realistic workload instead of Goal 7's five or six gates (A8): two concurrent
   merge gates that each select store plus one push gate, against the same gates routed unsharded, with any aggregate
   slowdown bounded and disclosed.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Defining a second provider protocol, source-capture format, environment-binding schema or runner configuration tier.
- Adding an ARC scheduler, machine registry, concurrency preference, fallback mode, automatic retry or fail-fast knob.
- Freezing a whole gate, replacing native test partitioners, distributing individual test cases, or changing shard
  counts outside project declarations.
- Adding durable per-shard records, a shared result database, lifecycle evidence or storage synchronization.
- Moving fixers, index-certifying checks, projected-state selections or local artifact-producing builds to runners.
- Redesigning artifact leases, scheduler fairness, suite timeout policy, CI wall balancing or test-cost budgeting.
- Requiring arc-offload, Bazel, REAPI, MCP, a CAS service or another team's infrastructure to use this feature.
- Changing ordinary native execution into local sharding when no eligible configured runner is selected.
- Amended 2026-10-28 — Routed E2E execution and routed E2E membership qualification are out of scope; E2E stays
  native and CI-only and keeps its existing shard membership validation (A3) — the reground found `test:e2e` neither
  routed nor locally gated.

## Proposed Design

### 1. Foundation contract and implementation boundary

The common runner foundation owns machine-local configuration, explicit check eligibility, captured source and
environment inputs, preparation, runtime observation, portable argument-budget primitives, single execution and
resource lifetime. This consumer owns shard expansion, group use, the runtime vector and parent key/reduction,
per-invocation reporting, native writer isolation and distributed qualification. These remain one consumer concern:
shard execution without complete parent accounting cannot deliver trustworthy check results.

The required foundation contract is:

| Surface       | Required behavior                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Configuration | A machine-local literal argv adapter setting, separate from project check commands.                    |
| Eligibility   | Project opt-in; no implicit routing of fixers, index certifiers or projection checks.                  |
| Capture       | One fixed source/selection definition, required code coordinates and explicit environment bindings.    |
| Prepare       | Bind the complete invocation plan to a context, confirm source identity and describe runtime coverage. |
| Run           | Execute one prepared invocation and return individually attributable terminal execution evidence.      |
| Run group     | Optional execution of the complete requested invocation set under the same prepared input definition.  |
| Cancel        | Request settlement; acknowledgement alone does not establish that children stopped.                    |
| Release       | Dispose after execution settlement and required output collection, or after a reusable hit.            |

The foundation launches one adapter subprocess per selected check. Its protocol uses JSON-RPC 2.0 envelopes over
newline-delimited stdio, with stdout reserved for protocol messages and stderr for adapter diagnostics. Exact wire
schemas and validation are foundation exports. This consumer uses those exports and does not implement a competing
message parser or native-test result grammar.

Preparation receives the fixed plan and returns a context/source binding, optional group capability and known or
unknown runtime coverage. Execution references prepared invocation identities rather than accepting a replacement
command or new source. Output notifications are separate from immutable terminal outcomes. A final execution reply
confirms settlement and exact expected-ID closure, including required output drainage.

Invocation records carry the engine-owned optional `commandContent` policy defined in section 4; source metadata
alone does not determine child bindings. The foundation preserves native cwd-scoped Git execution, including its
repository-local environment filter and reserved-input validation in section 4. It also supplies pre-work recovery
guidance and separate normal closure paths for granted contexts and settled preparation refusals, as defined in
section 8.

The landed foundation supplies these contracts (A1). `prepareSelectedCheckExecution` returns a prepared execution
whose `close()` performs release; a `buildPlan` seam receives captured inputs before preparation; `runGroup` dispatch,
plan-ordered runtime projection, shared outcome normalization/reduction and the native/CI environment capture helpers
are exported. Its routed handler still plays the foundation's own unsharded plan as serial singles. This consumer
supplies the shard plan through that seam and adds group dispatch. Missing behavior is a prerequisite gap to resolve
at its defining interface, not permission to add a private adapter path here. No storage-cutover or whole
configuration-program completion is required by this boundary.

### 2. Routing and native defaults

The prerequisite resolves machine-local `checks.runner` argv from `~/.arc/config.yml` and project eligibility from
`runner: true`. This consumer uses that resolved decision; it adds no configuration reader, override hierarchy or
provider executable to project declarations.

Expand a declared shard plan during ordinary execution only when the selected check is eligible, its declaration
opts in with `shards.routed: true`, and a configured runner is selected (A7). An eligible check without that opt-in
routes its single unsharded command through the foundation's path; the opt-in leaves CI's declared matrix unchanged.
With no configured runner, or for a check left on the native path, retain its existing single native command. Shard
metadata alone adds neither a source workspace nor local fan-out. Explicit environment-file bindings may still freeze
a small input file under the foundation's native execution contract.

A configured adapter that cannot start or obtain eligible capacity reports unavailable execution with an actionable
remedy. ARC does not bypass it. The adapter owns local placement, fallback and admission; a local placement uses the
same captured inputs as a remote placement. Required-remote policy remains effective.

With group capability, submit the complete check plan once. Without it, send the same invocations serially through
mandatory single execution within the prepared context. Serial playback remains sharded; never silently substitute
the unsharded command. The plan is fixed before preparation reports capability, so a basic adapter runs an opted-in
matrix serially and pays the native sharding overhead without parallel gain; the opt-in confines that cost to the
checks that chose it (A7). An eligible declaration without shards or without the routed opt-in continues through the
foundation's single-check path.

Existing CI forecasting and native job playback remain distinct from this routing decision. Preserve CI's declared
shard matrix even when its jobs use native execution rather than a configured adapter.

### 3. Canonical invocation planning

Reuse the existing declaration language and `resolveCheckForecast` expansion rather than creating another shard
count, template syntax or per-suite distribution script. `shards.count` supplies the positive count;
`shards.argument` expands `{index}` and `{count}` with one-based indices from 1 through that count. The boolean
`shards.routed` only admits the declared matrix to routed expansion; it adds no count, template or placement setting
(A7). Preserve the command's literal argument values, explicit shell intent, selected-path order, check cwd and
existing selection/deletion/widening rules.

Build the full plan before preparation or pass lookup. Each record has a canonical local coordinate consisting of
its file-batch ordinal and shard index/count, final argv, root-relative cwd and shell policy. Every expected pair
also has a unique wire invocation ID, including when command text is identical. Wire IDs are correlation handles;
the canonical coordinates and commands define reusable plan identity. Carry the selected engine-owned
`commandContent` with each invocation rather than asking an adapter to infer it from argv or source coordinates.

Use deterministic shard-index order and stable batch order. Planning, reporting and runtime-vector projection must
agree on that order. A plan consists of every expected batch/shard pair, not only commands that a provider happened
to start. No partial-parent reuse or independent shard pass publication is introduced.

`batchCheckPaths` and `checkArgumentBudget` in `src/lib/checks/batching.ts` currently preserve path order and budget
POSIX bytes or escaped Windows units. Consume the foundation's portable budgeting primitives and include final
shard arguments before partitioning paths into batches. The complete plan must fit every supported compatible
placement; use the most restrictive applicable budget rather than the caller's platform alone. Preserve one
no-path invocation where the declaration's mode/path policy requires it.

If a fixed command plus one path and its final shard argument cannot fit, refuse before launch with a shortening or
configuration remedy. An adapter must not secretly split one expected invocation into unreported commands. Resolve
cwd inside the captured source root; an escaping root requires an explicit eligibility/input-boundary remedy or an
intentional native declaration, never implicit sibling-directory capture or bypass fallback.

### 4. Common source, selection and external inputs

Acquire one captured context per selected check. ARC fixes the request's source basis, selected paths, required code
coordinates and explicit external inputs before any sibling runs. Index/commit-based requests must not acquire
later live working-tree bytes. Working-tree capture is the fixed result of reading those inputs, without claiming
an instantaneous filesystem-wide snapshot. Failed or inconsistent required reads refuse with a retry remedy.

The foundation presents self-contained source files with actual captured byte presentation, behavior-relevant
modes/links and required code-only Git coordinates. No pointer or object dependency may resolve only on the original
host. Git tree identity alone is insufficient for filters, LFS or line-ending presentation. Unsupported source or
platform cases must refuse explicitly rather than substitute other executable bytes.
Export only required code-coordinate objects; do not copy the live Git object-store directory or all refs as a
shortcut to preserving code metadata.

The consumer uses that artifact and its lease rather than independently calling a provider snapshot operation.
Editing the original checkout, branch or duration file after capture must not change any sibling. Do not transport
live store refs, Git notes, personal state or the operational projection to make code execution work. Incidental
pre-cutover tracked planning files are not lifecycle authority inside a workspace.

Use the foundation's single typed environment declaration:

```yaml
environment_inputs:
  ARC_STORE_CHECK: value
  ARC_TEST_DURATION_FILE: file
```

These are project-native examples, not protocol-reserved test fields. Declare each name only where that check reads
it. Capture once per selected check even when `cache: false`, and apply the same bindings to runtime probes and all
invocations. The binding rules are:

- Preserve absence by unsetting a worker's ambient value. Preserve a literal empty string as empty; it differs from
  absence and an existing zero-byte file.
- A `value` binding replays the captured literal selection value. Its name, presence and value enter scoped identity.
- A nonempty `file` value resolves against the check cwd. Open the target, follow a symlink to a regular file,
  confirm its type and freeze its bytes. Unreadable or nonregular targets refuse capture with a remedy.
- Materialize file bytes and rebind their environment name to an execution-local path. Key on captured state/content,
  not the original host pathname or materialization path.
- Incompatible worker policy reports unavailable execution rather than overriding declared selection. Engine-owned
  `ARC_CHECK_BASE`, `ARC_CHECK_TREE`, `ARC_CHECK_MERGED`, `ARC_CHECK_NOTICE` and the repository-local Git variables
  below cannot be shadowed by replayed caller bindings.

`checkEnvironment` in `src/lib/checks/process.ts` currently uses `environmentForGitCwd` in
`src/lib/git/process-executor.ts` to remove repository-local Git overrides. Preserve that complete native boundary
for routed commands and runtime probes. Reuse the foundation's shared native filter/name authority, which covers
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_OBJECT_DIRECTORY`,
`GIT_DIR`, `GIT_WORK_TREE`, `GIT_IMPLICIT_WORK_TREE`, `GIT_GRAFT_FILE`, `GIT_INDEX_FILE`, `GIT_NO_REPLACE_OBJECTS`,
`GIT_REPLACE_REF_BASE`, `GIT_PREFIX`, `GIT_SHALLOW_FILE` and `GIT_COMMON_DIR`. Reject these names as explicit
`environment_inputs`, including case variants, so replay cannot restore an override after ambient cleanup.

Clear those caller- and worker-inherited overrides before applying engine-owned captured-context bindings. Git
commands and probes must resolve the prepared source's code metadata rather than another repository selected by
ambient state. Native execution retains its current cwd filter and local engine-owned checked-index exception;
index-certifying checks remain ineligible for routing. Adapter control-plane configuration and unrelated ambient
variables remain provider policy.

Preserve the native distinction between source metadata and command-content exposure. A files check's invocations
carry `commandContent: {tree, base?, merged?}` from the selected check context; a project check omits it. This field
is engine-owned, not a declaration or caller binding. Validate supplied coordinates against the captured source's
required code coordinates. Runtime probes always omit command content.

For commands and probes, first clear `ARC_CHECK_BASE`, `ARC_CHECK_TREE` and `ARC_CHECK_MERGED` from ambient worker
state. A command with content sets tree, sets base only when present, and sets merged to the space-joined nonempty
list; otherwise the corresponding variable stays unset. A project command and every probe leave all three unset.
Keep the worker-local notice channel fresh and best effort; routed execution must not inherit a caller's index path.
The same argv can legitimately have different content policies, including a files check that withholds paths.

Dependency preparation and generated test artifacts are allowed in isolated execution views. They must not replace
the common captured membership inputs. Source identity validation covers the complete prepared input definition;
it does not turn every transported file into a dependency of every check.

### 5. Runtime qualification and the parent key

`resolveCheckKey` in `src/lib/checks/key-resolver.ts` currently gathers runtime-probe output before execution.
Routed reuse must describe actual prepared execution contexts rather than the caller's local runtime. Consume the
foundation's known runtime binding and probe observations, indexed by prepared invocation ID.

Project those observations onto the canonical invocation order. Reuse requires known applicable coverage for every
expected invocation. If complete coverage cannot be established, the adapter reports unknown runtime and the whole
parent executes without lookup/publication. It does not substitute a caller-local fingerprint or authorize partial
hits. Malformed claimed known coverage, including missing/duplicate/unknown invocation identities, is a protocol
failure, not an automatic downgrade to unknown. Source fidelity and native membership requirements still apply when
reuse is disabled.

Extend the common scoped single-check key with the complete canonical invocation matrix and applicable runtime
vector. Retain declaration, selected-content, required check coordinates and explicit-input scope. Different runtime
identities are permitted only within the native partition contract's compatibility requirements. The landed key
already binds the declaration, including `shards`, the received paths and the plan-ordered runtime vector, but not
invocation argv. Add explicit matrix coordinates only where those inputs do not determine the canonical matrix (A1).

Attempt-specific plan/context/request IDs, provider machine/queue labels and workspace locations do not enter the
key. The canonical batch/shard coordinates do. Unrelated repository or stored-state edits must not invalidate a
parent merely because the whole captured container has a new digest. A host pathname change for identical file
bytes also must not invalidate a semantically identical pass.

`commandContent` preserves execution bindings; it does not make its raw coordinate object IDs unconditional key
inputs. Retain the existing declared-content and historical-content dependency semantics when qualifying reuse.

Preparation can use an applicable binding instead of allocating an expensive worker solely for a cache lookup.
If placement or fallback would change a known prepared binding, report unavailable before launching affected work.
An explicit retry obtains a new context and qualification; this consumer adds no automatic retry or downgrade to
unknown identity. Never launch a changed context under a stale known binding.

A hit covers the entire plan, sends no execution request and releases its acquired context. A completed success
publishes one parent through the existing disposable pass-store contract. `createCheckPassStore` and
`checkRecordDirectory` in `src/lib/checks/record.ts` treat invalid/unavailable reads as misses and storage faults as
best effort. Preserve those semantics; a failed cache write does not erase an otherwise valid check result.

### 6. Execution, parent reduction and diagnostics

Correlate protocol output and terminal outcomes by context and invocation IDs. Preserve each independently valid
terminal outcome as it arrives; do not wait for a final group reply to learn that a check failed. Human output,
adapter process exit or cancellation acknowledgement cannot substitute for terminal evidence and settlement.

Unknown, duplicate, conflicting, wrong-context or missing IDs cannot close a plan successfully. Validate requested
source binding before admitting a verdict. Preserve an independently valid completed failure even if another
result or the final conversation is malformed or lost. Diagnostics identify every incomplete or unavailable pair.

Normalize outcomes through the existing declared/native check contract. `finalizeCheckRun` in
`src/handlers/check/run.ts` handles unavailable, killed, declared no-evidence, ordinary failure and success;
declared no-evidence status retains precedence over its special kill-status treatment. An exit value alone must
not discard the native notice or declared interpretation.

Preserve completed native exit statuses as exact unsigned 32-bit integers, from 0 through 4294967295. Do not narrow
them to eight bits or a signed representation. A valid larger nonzero Windows status remains a completed failure,
including beside missing work, rather than becoming a malformed result or a truncated zero. Retain current POSIX
signal normalization, declared no-evidence bounds and the existing special-status interpretations.

A declared no-evidence result contributes no useful evidence, rather than becoming an ordinary failed command.
Retain the existing batch contract: completed no-evidence results may coexist with useful acceptable results, but
an entirely no-evidence check cannot pass. Native unmatched/all-skipped failure statuses are not reclassified by
this rule.

| Accepted invocation evidence                                                       | Parent result                                   | Reusable pass                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Every expected invocation acceptable, with the native contract's required evidence | Passed                                          | Only with a complete applicable key |
| Any independently valid completed native failure, including beside missing work    | Failed, retaining incomplete-work detail        | Never                               |
| No completed failure, but required work missing, unavailable, cancelled or killed  | Couldn't run completely, with exact diagnostics | Never                               |
| All invocations complete, but the native contract reports no useful evidence       | Existing native no-evidence/failure result      | Never                               |

`executeCheckBatches` and `unavailableBatchResult` already preserve a completed batch failure beside a later reported
not-run result. Preserve that behavior within a parent. `declaredChecksExitCode` separately orders results across
different checks; do not replace that request-level behavior with the within-parent reducer.

After an ordinary nonzero check exit, continue serial playback and collect the complete planned diagnostic set.
Group submission likewise requests the whole matrix; ordinary failure does not trigger ARC cancellation or suppress
remaining planned work. Already-started siblings finish. Explicit interruption or unavailable execution may leave
not-executed dispositions; neither can produce a parent pass.

Retain existing parent-level CLI and JSON outcomes while making each invocation's batch/shard coordinate, status,
native exit/notice and relevant diagnostic available. Output remains attributable to its invocation. Progress and
best-effort log text do not become completion authority or durable per-shard pass records.

### 7. Native membership, completion and writable outputs

Native tools own discovery and partitioning. For each qualified tier/profile, the union of native shard assignments
must equal the native unsharded selection, and every selected member must occur exactly once. Use identical source,
filters, projects, shard count and captured duration input. Incompatible execution profiles must not claim that a
set of zero exits proves complete/disjoint membership.

`HeavyFirstSequencer` and `assignDurationShards` in `__tests__/helpers/heavy-first-sequencer.ts` consume duration
inputs and fallback weights. Keep those inputs frozen and separate from writable result caches. Native
collection/sharding APIs supply qualification evidence; the generic check engine gains neither a test inventory nor
a second scheduler.

`discoverVitestSelection` and `checkVitestCompletion` in `src/lib/vitest-discovery.ts` and
`src/lib/vitest-completion.ts` reject empty ordinary selections or runs without completed cases. Preserve standalone
unmatched-name, all-skipped and empty-execution failure behavior. An arbitrary nonzero exit or missing report is
never a successful empty share.

A native command may explicitly support a proved selection no-op or an empty assigned share. Preserve those
contracts, including the native reach-based store command's validated no-affected-suite and empty-share success.
Their completed selection/partition evidence is useful even when no test case executes. Do not impose a universal
tests-completed rule on all commands or invent a new generic empty-share status/report field. Qualification must
exercise actual native controllers, including closing; a native controller-close failure remains a failure.

Routed qualification covers the unit, integration and store tiers; E2E stays native and CI-only (A3). Store
qualification requires the native reach-based store check, which lands with `storage-ref-backend` (A2). Until then its
native cases remain unfulfilled qualification, rather than simulated proof of shipping behavior.

`createPool` in the installed Vitest runtime invokes the configured sequencer during execution;
`getRelevantTestSpecifications` does not pre-shard. Do not feed a pre-sharded selection back into native execution
with sharding still enabled. `HeavyFirstSequencer.shard` may expose its actual native assignment for qualification
when needed; that does not authorize a second partition pass in the generic engine.

Give concurrent invocations private writable execution views or serialize access to a shared writable view. Sharing
immutable dependency data is allowed; distinct cwd paths alone do not isolate mutable writers aliased through a
shared `node_modules` directory, so an adapter that shares one installation across views runs them serially. A
private copy per view needs no relocation (A5): native writers keep their default Vite `cacheDir` and
workspace-relative reporter locations, which must lie under a root the adapter's preparation established, because
adapters refuse an invocation after an earlier one created an unprepared path. The external adapter gives each
placement its own prepared copy and runs that placement's further siblings serially in it (A6). Store and integration
controllers sharing one checkout also queue on the checkout artifact lease, which `withTestArtifactOwnership` holds
for any selection beyond the unit projects.

`mergeDurationArtifacts` in `packages/arc-framework/__tests__/helpers/duration-artifacts.ts` finds native
`results.json` files recursively. Preserve tier-named artifact directories and the native result format while
moving writable caches. Preserve `withBuildArtifactOwnership` and `withTestArtifactOwnership` in
`src/lib/build-ownership.ts` through native controller completion. Safe preparation reuse must not weaken those leases.

### 8. Lifetime, interruption and recovery

Use the foundation's single lifecycle. Capture once, prepare, optionally reuse or execute, settle, collect required
output, then release a granted context. Release also occurs on cache hits and ordinary failures. Do not release a
workspace or common capture while launched work may still use it.

A preparation reply that reports unavailable with `settled: true` grants no context and is terminal. The adapter
settles and cleans its preparation work, sends that reply and exits zero. ARC drains the reply/output, closes stdin
and waits for exit zero before disposing its capture; it sends no release request without a context. Terminal
settlement makes an overlapping cancellation acknowledgement unnecessary; accept a valid late acknowledgement if
it arrives while draining. Missing settlement or abnormal closure retains uncertain-work handling.

ARC generates a fresh attempt UUID as `planId`, excluded from reusable identity. Before returning ready, and before
dispatching any preparation or execution work that may outlive the conversation, the adapter fully writes and
flushes `check/recovery {planId, instructions}`. A failed write forbids dispatch. Provider-owned work must already
be associated with that plan identity when launched. The documented instructions locate and inspect/settle the
plan's preparation and execution work after the adapter exits. A settled no-work preparation refusal may omit it.

ARC retains valid recovery guidance from ordered frames received before EOF, along with the plan/context, adapter
identity and retained capture location. Guidance is operator-facing information; ARC does not execute it
automatically. Consume the foundation's carrier and lifetime handling rather than adding a separate recovery
protocol or ARC job record.

Interruption requests cancellation and then waits for settlement. Lost transport after launch is uncertain
execution, not proof of stopped children. Retain already-observed native failures, report remaining work as
incomplete, preserve the capture needed by unsettled work and surface the provider's recovery diagnostic. Do not
automatically launch a replacement, retry locally or convert transport loss into a passing result.

Distinguish advisory disposal failure after settled, fully collected work from unsettled processes or lost required
output. A leftover temporary directory alone does not erase a valid native result. Missing required evidence or a
native controller-close failure retains substantive failure meaning. Best-effort log loss is diagnostic.

### 9. Forecast and CI integration

Preserve declaration-derived native CI shards and current job placement. Forecast/dry-run metadata describes
environment-binding names and kinds, never freezes setup-job absence or embeds captured file payloads. Actual job
dispatch captures after caller-owned preparation, including downloading the shared duration artifact.

The foundation's `environmentInputs` forecast field carries the name-to-kind map. Require agreement with the
selected declaration before binding; mismatch refuses with a regenerate-forecast remedy. A routed dry-run must not
start the adapter, allocate a source workspace or probe its execution runtime. Report reuse as unknown when it
requires preparation, rather than borrowing caller-local evidence.

`runForecastCheck` in `src/lib/ci-check-runner.ts` currently calls `runCheckProcess` directly. Consume the
foundation's shared dispatch-time binding helper and forecast metadata there rather than creating separate CI file
semantics. Each job uses the handed shared duration bytes; one local distributed group instead uses its one
per-check capture. Neither path may replace a later valid binding with earlier dry-run state.

Keep existing artifact names, native formats and build preparation ownership. Change CI clear/upload locations only
as required by the isolated native cache path in section 7. This feature does not redesign CI job balancing.

### 10. Public and personal integration qualification

Use a small independent adapter fixture to prove the public contract without importing arc-offload internals. Cover
optional group submission and serial single playback over the same fixed plan, including an unknown-runtime run
without reuse. The foundation's single-command fixture remains its own contract baseline.

Include identical-argv project/files commands and runtime probes to prove the command-content binding distinction.
Poison caller and worker Git selectors with a conflicting second repository, including worktree, object-directory
and config overrides; commands and probes must still resolve the captured source. Reject every repository-local
reserved name and case variant as an explicit input, with an actionable binding-removal remedy. Repair the
declaration and prove successful captured-source execution while ordinary explicit value/file bindings still work.
Exercise settled preparation refusal, cancellation racing that refusal, normal exit without a context/release and
a successful explicit retry after repair. Cut transport during preparation before context grant and during grouped
execution after pre-work recovery guidance; prove retained guidance locates the plan and its capture. A failed
recovery-notification write must launch no work. Include completed exit statuses 256 and a high-bit Windows failure,
preserving failure and exact diagnostics through parent reduction. No adapter routes checks on Windows (A4), so the
scheduled or dispatched Windows/macOS portability pair runs these fixture-backed consumer cases there.

Then qualify arc-offload through that same public seam for local and remote placements. Required changes to that
tool land in its own repository, preserve its use outside ARC/Vitest and receive no privileged ARC path. Its
existing measured pool, registry, shared job/heavy-job admission, memory ceilings, caller CPU policy and the Owner's
routing mode remain authoritative. Do not assume a fixed machine order or add those deployment settings to ARC.

The external adapter advertises group capability (A6). It verifies and materializes a check's captured plan once
locally, then uploads it to each placement that takes a sibling, where that placement prepares its own private copy. The
pool's existing admission places every sibling by estimated finish, one heavy job per machine and memory tokens,
longest expected sibling first, falling back to availability order where it holds no record for a command. The
adapter records each completed sibling's timings under that sibling's own command and reports each sibling's
placement and admission wait in its invocation output. A placement that takes a further sibling runs it after its
first, in the same prepared copy. Fan-out is therefore bounded by free heavy capacity: with fewer heavy-capable
placements free than siblings, a placement runs more than one sibling serially, which is expected rather than a
defect.

The group presents ARC one context (A6). The adapter tracks its own pending and prepared placements so no two
siblings target one placement at once, records every remote placement in its plan journal so recovery guidance
reaches all of them, rewrites backend context identities to the group's, and releases a placement's permits once its
last sibling settles. A placement that refuses admission before its backend starts does not fail its sibling: the
adapter waits for it or places the sibling elsewhere. At the group's first placement the adapter does so only for a
busy refusal, where admission refuses because the placement is occupied; a failed upload or a declining availability
guard there settles the check unavailable with a retry remedy, as the same refusal of an ungrouped plan does (A11).
That is pre-launch fallback the adapter owns, not a retry of launched work.

Opted-in checks whose native partitioner reads a duration file declare it as a file input (A6). A developer machine
usually holds none, so the binding is absent and the partitioner's fallback estimates apply; nothing here collects
durations.

Measure the complete selected gate with fixed source, native selection, duration inputs and requested check set.
Compare the same gate routed unsharded with the declared shard plan using fresh runs (A8); fully native local gate
runs are not part of the comparison (A9). The recorded comparison measured the store's four-shard declaration; a later
declared count is unmeasured and claims no benefit until it is compared the same way (A12). A qualification harness
may vary its in-memory plan without editing the source or adding a production sharding-toggle setting.

Interleave repeated baselines and distributed runs with an idle pool, then repeat under the named workload: two
concurrent forced merge gates that each select store, plus one concurrent push gate, under the routing mode in force,
which the record names (A8). Include capture, transport, preparation, runtime qualification, admission/queueing,
execution and collection. Report median/range, aggregate completion, native coverage and observed admission. Claim
idle-pool improvement only beyond observed run-to-run variation. Under the named workload, aggregate completion may
be at most 10% slower than the baseline, reported with its measured size; a larger regression remains unresolved
work, and an isolated faster gate does not conceal it. Serial basic adapters need no speedup claim, and unmeasured
deployments gain none by implication.

## Alternatives & Rationale

- **Independent wrapper calls per shard:** reuse transport but allow separate live snapshots, local cwd execution
  and duration paths to diverge. One common prepared context plus a complete plan supplies the missing guarantees.
- **Raw argv prefix as the execution boundary:** useful inside an adapter, but cannot alone provide captured source,
  applicable runtime identity, correlated outcomes and settlement. Consume the foundation's structured conversation.
- **Require every adapter to schedule groups:** excludes simple local resource wrappers. Mandatory single execution
  with serial playback preserves correctness; optional grouping supplies acceleration where supported.
- **Unconditionally shard native local checks:** adds capture/preparation and fan-out to ordinary local behavior.
  Retain native execution unless an eligible configured runner selects the distributed path.
- **ARC-owned per-test scheduling or a full remote-execution service:** duplicates native partitioners and existing
  infrastructure. Existing shard declarations, native APIs and a small provider seam suffice.
- **Whole-root cache keys or per-shard records:** make unrelated changes invalidate scoped checks or add partial-pass
  lifecycle complexity. Use one scoped parent record over the complete plan and actual applicable runtime vector.

The source/runtime discipline borrows established action/input ideas without adopting their infrastructure. The
native membership distinction follows native runner contracts rather than a generic test-count rule. Neither a
captured root nor runtime fingerprints make undeclared ambient/network dependencies hermetic.

## Cross-cutting Considerations

### Compatibility, authority and storage

Adapter configuration remains person/machine-local; source capture and ephemeral execution state do not sync through
notes or the future operational store. Pass records remain disposable checkout-local shortcuts, separate from
durable review/delivery evidence and lifecycle writes. Projection selection checks stay in their owning checkout.
Code tests needing operational state create disposable fixtures through storage APIs instead of copying live state.

Respect the storage program's serialized import/flip window and re-ground affected source as the ref backend and
projection land. There is no store-wide version, work-unit branch identity or append-only-history assumption in
execution identity. No cutover wait is otherwise required.

The public adapter must preserve requested inputs and execution constraints; unknown runtime disables caching, and
unsupported relocation refuses with a remedy. No new security service or network trust model is introduced. Shell
intent remains explicit, and executable paths/configuration come from the existing foundation boundary.

The shared `adr-039-use-provider-neutral-check-runners.md` was Accepted at the foundation's closeout (A1). This
consumer contributes its execution requirements; a change to that architecture lands as a forward amendment to the
record rather than a duplicate.

### Architecture alignment and user-facing behavior

This work serves PROJECT-PRD's **Operational friction down, judgment friction up** and **Configurable methodology,
open ecosystem** principles: reduce machine-check waiting while preserving check meaning, review boundaries and
replaceable execution tooling. It adds no autonomous application-code execution or team coordination methodology.

It fits TECHNICAL-OVERVIEW's **§ 2 Architecture Components — CLI Package / Customization Surfaces** and
**§ 3 Infrastructure / § 4 Testing Infrastructure**. Keep injectable logic in library modules and orchestration in
handlers, using the existing TypeScript/Node, runtime-schema, Git, Vitest and CI surfaces. The protocol/source
foundation is a landed prerequisite (A1), not a new service or dependency implemented here.

Native commands and gate deadlines remain recognizable. Routed checks gain attributable invocation diagnostics,
correct parent reuse and explicit unavailable/recovery outcomes. The unconfigured path keeps its normal single
command and cwd. Compatibility qualification covers supported OS argument/path rules and native execution profiles;
small Linux materialization probes do not establish Windows, LFS, submodule or shallow-history support.

### Testing and rollout

First consume the available foundation and qualify the independent adapter path, then integrate the personal
adapter and native tiers. Preserve existing local/CI behavior throughout. Align the landed store declaration and
reach catalogue with the ordinary runner contract before native qualification, including when they land after initial
declaration adoption. The foundation retired `scripts/check-runner.sh` (A1); migrating machine runner settings is
outside this consumer. Forced qualification must bypass successful-parent reuse so it observes actual execution.

Unit checks cover deterministic planning, portable final-argument budgeting, runtime-vector/key projection and
parent reduction. Integration checks use process-backed adapter fixtures for terminal evidence, source/input
fidelity, cancellation/settlement, output isolation and cache-hit release. Native tier qualification and measured
pool runs supply coverage and performance evidence beyond fixtures. Tests must exercise successful recovery after
repairing a refusal, not only the initial rejection.

## Success Criteria

1. **Routing/defaults:** Without an eligible configured runner, declared shards execute as the existing single
   native command without source-workspace preparation. Group-capable adapters receive the whole plan; basic
   adapters run the same plan serially. Configured-runner failure never triggers an ARC bypass.
2. **Planning:** Every expected batch/shard pair has one distinct correlation identity and stable canonical
   coordinate. Final argv fits supported Windows/POSIX limits, including shard arguments. Oversized commands and
   escaping cwd refuse before launch with an actionable successful-retry path.
3. **Common inputs:** Editing the original source, branch or duration file after capture does not change siblings.
   Source bytes/required coordinates, selected paths, absent/empty/value/file bindings and relative/symlink file
   behavior match the captured definition, including when caching is disabled. Identical-argv project/files checks
   receive their distinct native coordinate policy; every probe clears those coordinates. Repository-local Git
   overrides cannot redirect commands/probes away from captured code metadata, through ambient state or explicit
   input replay; reserved bindings refuse with a successful repair/retry path.
4. **Scoped reuse:** A complete parent hit launches no invocation and releases its context. Declared input,
   environment state/content, matrix or applicable runtime changes miss; unrelated source/state, host pathname and
   attempt/path changes do not miss. A valid unknown-runtime response executes without reuse; malformed claimed
   coverage refuses. Failed or incomplete plans publish no parent record; cache storage failure alone does not
   alter a valid verdict.
5. **Outcome closure:** Missing, duplicate, unknown/conflicting IDs, wrong source, lost transport, cancellation,
   killed work and required-output loss never pass. A valid completed native failure remains failed beside
   incomplete work, with both diagnostics retained. This includes exact native statuses above 255 through the full
   unsigned 32-bit range. Ordinary failure does not discard remaining planned results.
6. **Native membership:** For unit, integration, store and E2E, native shard assignments have complete/disjoint
   union against native unsharded selection under qualified profiles. Cover filters, deletion/widening and frozen
   available/absent/empty duration states. Preserve proved store reach no-ops/empty shares and ordinary
   unmatched-name, all-skipped and empty-execution failures; native closing errors remain failures.
7. **Writers/lifetime:** Concurrent execution views do not alias mutable native cache/report writers, including
   with shared dependencies. Native result artifacts still merge correctly. Existing build/test ownership holds
   through closing; hit, success, failure and interruption release only after required settlement/collection.
   Settled no-context preparation refuses and exits normally without release, including the cancellation race.
   Uncertain work retains the capture and pre-work recovery guidance usable by plan ID; a failed guidance write
   launches no work. Leftover-directory disposal alone is advisory.
8. **Forecast/CI:** Forecast metadata preserves binding names/types without capturing setup-time absence or payloads.
   Routed dry-run starts no execution context; mismatched forecast/declaration bindings require regeneration.
   Playback binds after shared artifact delivery, preserves native placement/shard coverage and uses updated private
   cache clear/upload paths with unchanged tier artifact names/native result format.
9. **Provider independence:** An independent fixture and arc-offload both satisfy the public consumer contract.
   Local/remote personal placements retain current resource/routing policy, and external changes remain usable
   outside ARC/Vitest. No provider-specific executable, inventory, scheduling mode or test grammar enters ARC.
10. **Measured benefit:** Repeated forced end-to-end comparisons report idle-pool and five-or-six-gate median/range,
    aggregate completion, coverage and admission. Any claimed speedup exceeds observed variation and includes all
    preparation/queue costs. An observed concurrent regression remains incomplete qualification to address; it is
    disclosed as unresolved rather than counted as success.
11. **Routed native membership (A3):** Criterion 6 applies to unit, integration and store. E2E stays native and
    CI-only, keeps its existing shard membership validation and carries no routed qualification.
12. **Group execution (A6):** The external adapter runs a complete group from one local materialization uploaded to
    each placement that takes a sibling. Each placement prepares a private copy; existing admission places siblings,
    at most one heavy sibling per machine, and a placement's further siblings run serially in its prepared copy.
13. **Routed shard opt-in (A7):** Only checks whose declaration sets `shards.routed: true` expand on the routed path.
    An opted-out check with shards routes one unsharded command, and CI's declared matrix and forecast are unchanged.
14. **Named-workload benefit (A8):** Repeated forced comparisons against the same gates routed unsharded show an
    idle-pool per-gate gain beyond observed variation. Under two concurrent store-selecting merge gates plus one push
    gate, aggregate completion is at most 10% slower than that baseline and is reported with its measured size.
15. **Group placement fallback (A6):** Two groups racing for one placement both complete; a refusal before a backend
    starts leads to waiting or another placement, never an unavailable sibling. Recovery guidance from a group
    reaches every remote placement it used.
16. **Group placement fallback (A11):** Two groups racing for one placement both complete. A refusal before a backend
    starts leads to waiting or another placement, never an unavailable sibling, except that a non-busy refusal at the
    group's first placement settles the check unavailable and retryable, as a single plan's refusal does. Recovery
    guidance from a group reaches every remote placement it used.
17. **Named-workload benefit (A12):** Repeated forced comparisons of the four-shard store plan against the same gates
    routed unsharded show an idle-pool per-gate gain beyond observed variation. Under two concurrent store-selecting
    merge gates plus one push gate, aggregate completion is at most 10% slower than that baseline and is reported
    with its measured size. Another declared shard count claims no benefit until it is compared the same way.

## Open Questions

Concrete function/module names and fixture organization may follow the landed foundation; they must preserve the
contracts above. A source-level mismatch that changes the prerequisite or consumer behavior returns to design before
implementation rather than becoming an undocumented task decision.

## Amendments

- **A1** — 2026-10-28 — spec-depth: re-ground against the landed foundation's seams, ADR acceptance and retired
  wrapper. _Supersedes:_ none. _Trigger:_ door. _Work:_ 1.1–2.1. _Revalidated:_ pending → 2.5.
- **A2** — 2026-10-28 — design: store qualification waits on `storage-ref-backend`, recorded as a dependency.
  _Supersedes:_ § Proposed Design 7 ¶5. _Trigger:_ door. _Work:_ 4.3. _Revalidated:_ pending → 4.4.
- **A3** — 2026-10-28 — design: routed membership qualification covers unit, integration and store; E2E stays native.
  _Supersedes:_ § Success Criteria 6 (tier list). _Trigger:_ door. _Work:_ 4.2, 4.4. _Revalidated:_ pending → 4.4.
- **A4** — 2026-10-28 — spec-depth: Windows status evidence comes from fixture-backed cases on the portability pair.
  _Supersedes:_ § Proposed Design 10 ¶2. _Trigger:_ door. _Work:_ 3.3.b. _Revalidated:_ pending → 4.4.
- **A5** — 2026-10-28 — design: cache placement and the external group design reopen pending measurement.
  _Supersedes:_ § Proposed Design 7 ¶7, § Open Questions ¶1. _Trigger:_ door. _Work:_ 3.1. _Revalidated:_ pending → 4.4.
- **A6** — 2026-10-28 — spec-depth: groups span runners, one heavy sibling per machine. _Supersedes:_ § Proposed Design
  7 ¶7, § Open Questions ¶1, § Success Criteria 8. _Trigger:_ door. _Work:_ 3.1, 5.1, 5.2. _Revalidated:_ pending → 6.4.
- **A7** — 2026-10-28 — design: routed shard expansion becomes a per-check declaration opt-in. _Supersedes:_ § Proposed
  Design 2 ¶2. _Trigger:_ door. _Work:_ 1.1, 4.2, 4.3. _Revalidated:_ pending → 2.5.
- **A8** — 2026-10-28 — design: concurrent benefit uses a named workload and a bounded slowdown. _Supersedes:_ § Goals
  7, § Proposed Design 10 ¶4–5, § Success Criteria 10. _Trigger:_ door. _Work:_ 6.1–6.3. _Revalidated:_ pending → 6.4.
- **A9** — 2026-10-30 — design: the gate comparison reports no fully native local context runs.
  _Supersedes:_ § Proposed Design 10 ¶7. _Trigger:_ door. _Work:_ 6.4. _Revalidated:_ pending → 6.4.
- **A10** — 2026-10-30 — task: routed checks report planning refusals with the planner's own reason and remedy.
  _Supersedes:_ none. _Trigger:_ 7.1 terminal. _Work:_ 2.R. _Revalidated:_ pending → 7.1.
- **A11** — 2026-10-30 — design: a group's first placement waits or moves only on a busy refusal. _Supersedes:_
  § Proposed Design 10 ¶5, § Success Criteria 15. _Trigger:_ D2 review. _Work:_ review-fix. _Revalidated:_ review-fix.
- **A12** — 2026-10-30 — design: the measured benefit claim binds to the four-shard store plan. _Supersedes:_
  § Proposed Design 10 ¶7, § Success Criteria 14. _Trigger:_ P2.1 review. _Work:_ review-fix. _Revalidated:_ review-fix.

---
