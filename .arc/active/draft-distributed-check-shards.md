# Draft: Distributed Check Shards

- **Origin:** [internal] — runner-pool qualification and gate timing discussion, 2026-10-25.
- **Purpose:** Run declared check shards across available execution capacity through a generic runner contract,
  shortening gates while preserving complete coverage and reliable check evidence.
- **Readiness:** formalization-ready — author assessment and joint independent review, 2026-10-26: the shared
  logical contract, ownership, input/key semantics, native outcomes and qualification plan are settled. The review's
  sole minor citation finding is corrected, and draft capture is approved. Native and performance qualification
  remain implementation obligations, not completed evidence.

---

## Problem / Motivation

The runner pool can distribute whole checks, but a long individual check still occupies one machine until it
finishes. The complete store suite recently passed in approximately ten minutes on the primary mini; the controlled
comparison measured 608.86 seconds on WSL. Distributing other checks reduced the earlier full gate from 1,072.05 to
665.62 seconds, leaving integration and store as long parallel steps. Those measurements used a frozen historical
source and establish motivation, not a forecast for a newer head.

Several agent sessions often run checks concurrently. The objective includes both a short gate with spare capacity
and useful aggregate throughput under five or six concurrent sessions. More submitted jobs alone do not establish
either benefit; preparation cost, queueing, heterogeneous machines and existing resource admission all matter.

CI already uses declaration-driven shards: two unit shards, four integration shards and four E2E shards on the
starting base. The near-shipping storage-ref-backend change adds four store shards. The local check controller does
not currently expand that metadata during execution.

## Resolved Direction

Consumer repositories declare checks and shard argument templates. They should not need offload-specific test
implementations, duplicated shard counts in a machine registry, or a bespoke distribution script for each suite.

ARC's reusable check engine owns declaration interpretation and the meaning and recording of a complete check
result. A generic execution boundary must convey the required invocations and shared input context. The configured
runner owns machine selection, distribution and machine admission. Teams supply an implementation for their own
execution setup; ARC's contract must stand on its own without arc-offload configuration, commands or dependencies.

**Owner clarification, 2026-10-26:** arc-offload is personal tooling, not an ARC component. Making it work through
the public generic contract is part of this deliverable, including an external implementation change if needed.
That integration must consume the same contract available to any team, with no privileged ARC path. Arc-offload
must also remain usable with repositories that do not use ARC or Vitest.

**Owner decision, 2026-10-26:** without a configured runner, retain the existing single native command. Declared
shard metadata does not by itself enable local fan-out or add capture/preparation work to ordinary local checks.

**Owner decision, 2026-10-26 — captured-input ownership:** ARC fixes one selected check's source, selection and
explicit external inputs and expands its complete invocation plan. The runner prepares/materializes those inputs
and executes the invocations. ARC owns runtime-qualified pass lookup and the parent verdict; when applicable
runtime identity is unavailable, execute without reuse rather than substitute the caller's local fingerprint.
Editing the original checkout after capture must not change any sibling's inputs. The wire format and capture
representation remain open.

**Forward clarification, 2026-10-26:** those details were open at the ownership decision. The logical protocol and
captured-input boundary are now settled below; exact field names and private artifact encoding crystallize in the
runner specification.

Keep this one cohesive Heavy work unit: correct distributed execution and its parent verdict form one concern.
The known primitives suggest composition rather than invention. An arc-offload implementation change, if needed,
belongs on a separate branch in that repository; its public-contract qualification determines the required changes.

The capture boundary is one context per selected check. Whole-gate freezing has a broader existing home. Each
sibling, including a WSL execution, uses the same captured source and selection basis, and the parent cache key
describes those actual inputs. The common capture API is the runner foundation's; current key computation does not
yet supply these distributed guarantees.

## Existing Substrate and Constraints

- `resolveCheckForecast` in `packages/arc-framework/src/lib/checks/forecast.ts` already expands declared shard counts
  and argument templates into independently runnable command batches for CI. Reuse the expansion rather than create
  a second shard declaration language.
- `executeSelectedCheck`, `executeCheckBatches` and `finalizeCheckRun` in
  `packages/arc-framework/src/handlers/check/run.ts` own parent lookup, execution, reporting and pass publication.
  Execution currently ignores `check.shards`. `checkContentKey` in `src/lib/checks/key.ts` includes the declaration,
  but a captured execution still needs a key matching the source and runtime inputs actually checked.
- `runCheckProcess` in `packages/arc-framework/src/lib/checks/process.ts` receives a command and limited execution
  policy. It does not currently receive the forecast's shard group or expose an abort contract. Determine the
  smallest generic capability needed instead of teaching the engine an arc-offload command line.
- `snapshot` in arc-offload's `arc_offload/repository.py` captures one immutable snapshot per invocation. Separate
  CLI calls from an edited original checkout do not establish one common sibling snapshot. `local_run` in
  `arc_offload/cli.py` executes in the caller's working directory; local execution needs the common frozen context too.
- `runner_environment` in arc-offload's `arc_offload/execution.py` forwards ARC environment strings. It does not
  deliver or rebase the file named by `ARC_TEST_DURATION_FILE`, and `ARC_CHECK_TREE` is not a source capture API.
- `HeavyFirstSequencer` and `assignDurationShards` in
  `packages/arc-framework/__tests__/helpers/heavy-first-sequencer.ts` use a handed duration file and checked-in
  fallback weights. Source, discovery filters, project selection, shard count and duration bytes must agree across
  sibling discovery. Frozen membership inputs must remain separate from writable result caches.
- `withBuildArtifactOwnership` in `packages/arc-framework/src/lib/build-ownership.ts` protects runtime artifacts
  through test-controller completion. Same-checkout integration/store/E2E controllers serialize on that lease;
  distinct runners have distinct checkouts. Keep the protection initially. Unit-only controllers bypass runtime
  ownership, but their native results and cache paths still need isolation before concurrent execution.
- For personal integration qualification, existing offload machine job, memory and heavy-job permits cover
  repositories and worktrees. Retain these limits, measured placement, caller CPU policy and the Owner's routing
  mode. Current admission provides no strict FIFO guarantee; contention behavior must be measured. These are
  properties of that runner deployment, not fields or requirements of ARC's public execution contract.

Paths beginning with `src/` above are relative to `packages/arc-framework/`. Arc-offload source paths are relative
to that separate repository. Re-ground these pointers before implementation, especially after storage-ref-backend
lands; the reconnaissance is an orientation aid, not a frozen implementation plan.

## Execution Alternatives Considered

### Compose the current transport around one frozen execution context

Create a common frozen checkout/input bundle, then submit sibling commands through existing runner calls. This
may preserve the current transport and admission machinery. It must also handle WSL execution, Git selection
coordinates, duration-file delivery, generated files and output isolation without relying on changing live inputs.

A disposable transport probe with arc-offload supports investigating this option, but has not qualified native
suites or parent pass recording. Its compatibility result does not establish a portable execution contract.

### Add a small generic execution-group capability

If composition requires fragile shared state, give the runner a generic invocation group and immutable input
reference. A configured runner could distribute that group while ARC retains check semantics and one result. Settle
which layer expands the invocation matrix and reduces execution outcomes, and which observations cross the interface.
The contract should not contain ARC check names, Vitest-specific flags, or machine inventory.

The existing forecast may provide sufficient invocation data. Test that route before adding a new runner capture
API, group scheduler, or durable state. The need for a first-class machine configuration setting is separately owned.

The working choice is the runner draft's single process/structured conversation, using existing declaration
expansion rather than a second shard language. A raw argv wrapper would need separate channels for source,
runtime identity and lifecycle handling. The shared schema remains proposed until its defining design closes;
this choice does not introduce a scheduler or require a particular remote-execution service.

## Prior Art and Reuse

A bounded Luna research pass examined action identity, prepared workspaces and native partitioning alongside the
runner-contract research coordinated with `draft-machine-check-runner.md`. These are design inputs, not a completed
compatibility qualification or a decision to adopt their infrastructure.

- **Cargo's configured runner.** Its executable/argument runner setting, including array form, is a lightweight
  precedent for invoking team-owned tooling without a project-written wrapper in every declaration. Adapt literal
  invocation and configuration separation; Cargo's compilation-target model does not define ARC's routing policy.
  See [Cargo runner configuration][cargo-runner].
- **Remote Execution API.** Its `Command` and `Action` separate the command, environment, working directory and
  content-addressed input root. Use that established action vocabulary when designing the generic boundary, and
  leave room for an adapter to existing REAPI infrastructure. Requiring its CAS/RPC stack is a separate decision
  that the current requirements do not justify. See the [REAPI definitions][reapi].
- **Bazel action identity.** Its remote cache binds actions to declared inputs, commands and environment; its
  documented untracked-tool caveat shows why a source digest alone cannot qualify cross-machine reuse. Adapt the
  action-input discipline and explicit runtime requirements. Do not require teams to run Bazel or a remote cache.
  See [Bazel remote caching](https://bazel.build/remote/caching).
- **LUCI Swarming workspaces.** Its task model separates functional inputs from attempt metadata, materializes task
  inputs into a disposable working directory, and separates output collection from reusable input caches. Adapt
  the workspace lifetime and writer isolation. A CAS service, bot registry and central scheduler are not necessary
  consequences of those patterns. See the [Swarming user guide][swarming-guide] and [bot documentation][swarming-bot].
- **Bazel's native sharding contract.** Test runners participate through explicit shard coordinates and a sharding
  support marker. This is a precedent for qualifying native partition support rather than assuming any command
  accepting shard-shaped arguments supplies coverage. See [Bazel test sharding][bazel-sharding].
- **cargo-nextest partitions.** It applies filters before partitioning, offers slice and hash policies, and documents
  possible imbalance. Its separate no-tests policy illustrates why empty-share completion and no selected work
  overall are different outcomes. Adapt those distinctions; keep the project's existing native partitioner rather
  than introducing an ARC-owned test scheduler. See [nextest partitioning][nextest-partitioning] and
  [running tests][nextest-running].
- **pytest-xdist collection consistency.** Its controller checks matching worker collections before distributing
  indices, receives worker reports and handles worker loss explicitly. Adapt its correctness questions in native
  membership qualification: shared selection, complete/disjoint membership and explicit missing results. ARC can
  account for expected command invocations without adopting xdist's per-test scheduling or Python runtime.
  See [xdist's execution model][xdist-model] and [crash handling][xdist-crashes].
- **Buck2 execution policy.** Its remote-only and hybrid execution modes distinguish placement from the separate
  choice to fall back after a command failure. Adapt the explicit policy distinction. Where ARC's policy ends and
  the adapter's begins is settled by the shared ownership split: the runner owns placement/fallback policy and ARC
  owns the declared check outcome. A failed check, unavailable execution and a possibly still-running attempt must
  remain distinguishable. See [Buck2 remote execution][buck2-remote] and [executor configuration][buck2-executor].

**Selected direction:** reuse `resolveCheckForecast` for the invocation matrix, let the native test runner own
partition membership, and make ARC close the expected invocation set before publishing one parent pass. Use a small
process-level structured conversation, with a single-invocation baseline and optional grouping. Neither a new
scheduler nor wholesale REAPI/CAS adoption is justified by the current requirements. An existing executor may
implement the adapter where it fits, but its infrastructure and domain-specific test runner must not become
dependencies of ARC or adopting projects.

The source/runtime model is a design inference from these examples. Checks with undeclared ambient or network
inputs do not become hermetic merely by running from a captured tree. Runtime observations must describe the actual
prepared execution context; an unknown runtime cannot justify reuse under a caller-local fingerprint. A mismatched
source or missing required invocation cannot justify parent success, even when reuse is disabled.

## Shared Design with Machine Check Runner

`draft-machine-check-runner.md` and this draft converge on one public execution boundary. Both sessions refined the
implementation ownership on 2026-10-26 to keep the single-command guarantee independent of a later grouped consumer:

- **Runner foundation:** machine configuration/discovery, eligibility, fallback policy, reusable source capture,
  generic environment-value/file capture/binding, the scoped single-check key, common portable argument budgeting,
  wire/lifetime behavior and single-adapter qualification belong to the runner work.
- **Distributed consumer:** command-batch/shard expansion, shard-aware final argument accounting, one shared context
  across the group, the complete runtime vector and parent key/verdict, per-invocation reporting, native writer
  isolation and distributed native/performance qualification belong here.

The capture investigation and local probes in this draft are contributions to that foundation, not a second
capture implementation owned by this work. DCS consumes its prepared artifact and generic bindings.

Planning can proceed in parallel against the settled shared contract. Shared-handler implementation consumes the
landed runner foundation; that is a concrete interface/order requirement, distinct from an assumed dependency on
the whole configuration program or storage cutover. This prevents a cycle in which single-check qualification
waits for DCS to introduce its necessary generic file-input support.

Runner-setting scope, location and precedence are coordinated by `draft-machine-check-runner.md` with
`draft-config-storage-architecture.md`. This work consumes the resolved runner and its capabilities, keeping path
discovery out of shard execution. The configuration cohort's existing tier sketch does not settle a cross-project,
machine-local runner setting. Settle that narrow interface without assuming the cohort's complete migration or the
storage cutover must land first; leave the configuration decision and its rationale with those owners.

The shared interface provides ordinary single-invocation execution and an optional group capability over the same
ARC-prepared input definition. A basic adapter remains useful without implementing a distributed scheduler. A raw
argv prefix alone does not supply the source/runtime and lifetime guarantees; a small local protocol adapter can
wrap it, and qualification must demonstrate that burden concretely.

`resolveCheckKey` invokes runtime-input commands through `CheckKeyIO.runtime` before `executeSelectedCheck` calls
the execution boundary. A remote run therefore needs an explicit account of which runtime those fingerprints
describe. The prepared runtime binding qualifies reuse through the execution flow below; a caller-local observation
does not qualify an unknown remote context.

### Execution Flow

The Owner accepted the capture/preparation ownership split and identity-before-reuse sequence on 2026-10-26.
The steps below elaborate that direction. The outcome and cleanup semantics below were accepted on 2026-10-26;
the shared request schema remains to be finalized. Native commands retain their normal outcome carriers.

1. **Resolve and capture in ARC.** Select one eligible check using its existing scope rules, then bind its source,
   selected paths, required Git coordinates and explicit external inputs to one immutable execution context. Capture
   the duration input once when the native partitioner uses it. The no-runner path keeps its native execution.
2. **Expand in ARC.** Derive the full command-batch/shard matrix from the declaration and give every expected
   invocation a distinct identity. The native runner continues to own test discovery and partition membership.
3. **Prepare through the runner.** Hand the captured input definition to the adapter, which transports/materializes
   it and establishes a run-scoped execution context. It must preserve the same input basis across local and remote
   siblings, isolate writable outputs and execute within its placement/resource policy. Preparing this logical
   context need not mean an unconditional heavyweight checkout or reserving a worker merely to examine a cache.
4. **Qualify reuse in ARC.** Look up a reusable parent only when source, selection and applicable execution-runtime
   identity are known for the entire invocation plan. An adapter may supply a binding that remains valid through
   execution; otherwise obtain observations in the actual prepared contexts or run without a reusable key. A caller's
   local runtime fingerprint must not stand in for an unknown remote runtime.
5. **Execute through the runner.** Run the outstanding invocation set against those contexts. Placement changes must
   preserve the qualified input/runtime requirements or force new qualification. Keep invocation results and logs
   separate, and retain completed failures when another invocation is unavailable or incomplete.
6. **Close in ARC.** Account for every expected invocation and apply the native check's completion/no-evidence
   contract. Missing, failed or incomplete work cannot become a successful parent. Apply the accepted outcome
   rules below and retain native empty-share/no-op contracts. Consume the runner foundation's stop/settlement path.
7. **Release resources.** Release all run-scoped execution contexts on a cache hit, success, failure or interruption.
   ARC owns the lifetime boundary and the adapter implements cleanup for resources it allocated. Emit one parent
   result and publish a reusable pass only after the required execution closure is established.

The accepted ownership split is **ARC defines and identifies the common captured inputs; the adapter materializes
and executes them**. This prevents independent provider snapshots from selecting different live inputs while
leaving transport, dependency preparation and machine placement with the infrastructure owner. Compare packaging
and transfer costs before settling the representation; provider-side materialization must consume the already
fixed input definition rather than independently recapture the live original checkout.

The shared Proposed `adr-039-use-provider-neutral-check-runners.md` is owned by `draft-machine-check-runner.md`,
with this work supplying capture, group and parent-result requirements (Owner agreement, 2026-10-26). It remains
Proposed through implementation; that work's final implementation task reconciles approved updates and then marks
it Accepted at closeout. The proposed record does not itself settle an open interface or authorize implementation.

### Concrete Group Contract — Working Direction

Keep one adapter process scoped to one selected check. The runner draft owns its exact request/result schema;
the shared working direction is a JSON-RPC conversation over newline-delimited stdio, with protocol output on
stdout and adapter diagnostics on stderr. There is no daemon or provider registry. Logical preparation precedes
ARC's optional pass lookup; the next step is execution on a miss, or context release on a hit. Command failures
remain command results, distinct from a protocol error or unavailable execution.

This work contributes these requirements to that boundary:

- Preparation receives the fixed input identity and complete expected invocation plan. Each batch/shard pair has
  its own identity, even if two commands happen to have identical text. A group is the plan for one check, not a
  JSON-RPC batch and not a list of independently reusable shard passes.
- Prefer an opaque capture identity plus a path to ARC's prepared source and explicit input bindings. The adapter
  copies/transports those inputs without knowing how ARC produced them. A path named by an environment variable,
  such as the duration file, needs explicit byte capture and destination rebinding; forwarding its string is
  insufficient. The runner specification defines descriptor fields for the value/file bindings settled below.
- An adapter advertising group execution receives the complete invocation matrix once and owns its placement,
  queueing and admission. With only single-invocation execution, ARC can play back the same plan serially within
  the prepared context. This remains sharded execution; it must not silently substitute the unsharded command.
  Group acceleration requires a group-capable adapter, while a basic adapter remains a correct serial implementation.
- Resolve invocation working directories inside the prepared source root. `check.root` is currently a string, and
  `executeSelectedCheck` resolves it without a captured-root boundary. A root escaping the source artifact cannot
  qualify for relocation by implication; report an actionable eligibility refusal or leave that check local.
- Keep file-argument batches valid at the execution boundary. `checkArgumentBudget` distinguishes POSIX and Windows,
  while `resolveCheckForecast` appends shard arguments after its current batch computation. Reuse and extend the
  existing batching/expansion helpers to account for the final shard argument and conservative supported-platform
  limits for routed plans. A runner must not silently re-batch one expected invocation into unreported work.
- Every expected invocation gets a terminal result or an explicit not-executed disposition. Unknown, duplicate
  or missing invocation identities cannot close the plan successfully. Preserve any independently valid completed
  failure when another result is malformed or missing. Do not infer completion from adapter process exit alone.
- Runtime identity may be common to the plan or vary by invocation. Parent reuse binds the complete applicable
  identity vector, source, selection, command matrix and explicit external bytes. A placement change must preserve
  the prepared binding or requalify it before the changed execution can support reuse.
- Keep stable content identity separate from a run's context handle, request IDs, workspace paths and queue labels.
  Source validation can cover the complete captured root without making every file in that root a check dependency.
  The reusable key preserves declared dependency scope and includes the relevant captured working bytes, selection,
  external inputs and runtime observations. Unrelated source or stored-state changes must not invalidate it merely
  because they changed the capture container's identity.
- Outputs and progress correlate to invocation identities. Per-invocation writable caches/reports must not change
  sibling partition inputs. An adapter may reuse safe preparation internally without relaxing source identity or
  the existing runtime artifact leases. Progress text and best-effort logs do not become completion authority.
- User interruption asks the adapter to stop and settle active work before releasing its context. The concrete
  cooperative-cancellation operation belongs to the runner draft. Loss of the stdio conversation leaves an
  unavailable/incomplete check, not a pass and not permission to duplicate a possibly running attempt.

The initial controller adds no per-machine inventory, separate shard count or concurrency preference. The runner
owns capacity policy. Serial playback bounds the basic adapter to one outstanding command; group-capable runners
bound their own launches through admission. Validate latency and five-or-six-session throughput with the actual
qualified runner rather than infer fairness or speed from the number of submitted invocations.

### Captured Source — Foundation Requirements and Evidence

This subsection records the distributed consumer's requirements and capture investigation. The runner work owns
the common artifact format, construction and single-execution implementation.

ARC can prepare a self-contained source root before handing it to an adapter. Materialization must preserve the
fixed file content and required code-history coordinates while excluding live operational state. Read-only check
eligibility does not prohibit native dependency preparation and generated test artifacts; those writes belong to
isolated execution workspaces and cannot replace the captured membership inputs.

A local disposable fixture demonstrated that `git pack-objects` over the selected code head/base/captured-tree roots,
followed by `git index-pack` and materialization into independent repositories, can retain the original head/base
and dirty/untracked captured content. It also retained an executable, a symlink, a deletion and separately captured
duration bytes, without changing the caller's real index or copying its ignored projection and state-ref names.
This is a representation probe, not the final export format or cross-platform qualification.

The final representation must not assume that a Git object tree alone equals the working bytes the command reads:
Git filters, LFS and line-ending conversion can distinguish those. Preserve actual captured source bytes and their
identity when reconstructing code metadata, or explicitly refuse unsupported materialization with a safe remedy.
Submodules, sparse/shallow checkouts and platform file semantics require qualification before claiming support.
Do not copy a live object-store directory or all refs as a shortcut to preserving the required code coordinates.

The probe exports ancestry reachable from selected code commits; its transfer/preparation cost on this repository
is unmeasured. Compare raw captured-file materialization with an appropriate code-object transport before finalizing
the representation. The public adapter receives a prepared artifact identity and location, so that choice does not
become a second provider protocol or a new canonical storage family.

The second local fixture exercised `text eol=lf` with CRLF working bytes. Git canonicalized the blob, and Git-only
materialization changed the bytes; a frozen raw-byte overlay restored them while preserving the original code head,
captured tree and caller index. This establishes the need to distinguish working-byte identity from Git object
identity, without requiring a new storage service or provider-specific export format.

The construction direction supplied to that owner is:

1. Resolve the request's checked-content basis and required code coordinates once. A pushed-commit or index-tree
   request must not silently acquire later live working-tree bytes. For a worktree-based request, enumerate the
   captured code set using existing tracked/nonignored-source rules; ignored projection state remains outside it.
2. Create ARC-owned frozen source files and explicit external-input bindings. Compute the source manifest and
   captured selection/key inputs from that same artifact, rather than hash one live read and copy a different one.
   Capture is a fixed result of reading the source, not a claim of an instantaneous filesystem-wide snapshot.
   A failed or inconsistent required read refuses capture with the source path and a retry remedy.
3. Supply only the required code-history objects/coordinates alongside the files. Materialization can use a code
   object pack and a frozen file overlay when appropriate; the adapter receives the prepared root and need not
   interpret that packaging. Do not attach the live checkout's notes/store refs or operational configuration.
4. Bind raw source bytes and behavior-relevant file semantics to the immutable artifact. Derive reusable identity
   over declared dependencies, not a random artifact path or an unconditional digest of the whole repository.
5. Keep the artifact alive through preparation, execution settlement and output collection. Each invocation gets
   writable output space that cannot change the common source, selection or duration basis. Release the source
   artifact after the adapter has settled/released its contexts, including the cache-hit path.

The precise export implementation and supported Git/platform cases still need qualification. The two probes support
composition from Git object transport and ordinary file materialization; they do not justify claiming a general
capture implementation complete or freezing the wire schema around a Git-pack representation.

### Native Input Use, Writers and Parent Identity

The common foundation supplies one generic `environment_inputs` map with `value` and `file` entries. The native
checks declare `ARC_STORE_CHECK: value` where it controls reach selection and `ARC_TEST_DURATION_FILE: file` where
the partitioner reads durations. These names are project input data, not special cases in the public adapter.
Literal values preserve the caller's requested selection; evaluating a fingerprint command in a different worker
environment cannot substitute for transporting the request. Freeze input values and file bytes once per selected
check, even with `cache: false`, then replay the same bindings for each sibling. Apply them to runtime probes as
well as execution. An unset variable must remain unset in every execution environment; a literal empty value remains
empty, distinct from an unset variable and an existing zero-byte file. Relative paths resolve from the check's cwd,
as the native reader does. A present unreadable/nonregular file refuses capture with a remedy rather than silently falling
back to different weights. A symlink to a regular file supplies the opened target bytes.

The map's names and presence/value/content enter the scoped key; an original host pathname does not replace a file
content identity. An incompatible worker policy reports unavailable execution rather than overriding the caller's
declared selection inputs. ARC-generated coordinates and notice/index channels remain engine-owned, so a caller
binding cannot shadow them. The unconfigured path stays native and unsharded; explicitly declared file bindings may
still require a small file capture for their own semantics, without introducing a source checkout or fan-out.

Dry-run and CI forecast report binding names, not a frozen absent value or file payload. The current CI workflow
generates its forecast before preparing duration inputs, then downloads one shared duration artifact in test jobs.
Actual playback captures/binds the declared input after that artifact is available. Preserve that ownership and
ordering; do not freeze a setup-job environment and override the later job's valid input. CI's existing cross-job
artifact supplies its common duration bytes; a local distributed group supplies its one per-check capture.

Give every concurrent invocation a private writable execution view or serialize access to a shared view. Reusing
immutable dependency data is compatible with this, but sharing a mutable result cache is not. In this repository,
Vitest's default result cache under `node_modules/.vite/vitest` can alias through a shared `node_modules` symlink.
Use supported Vite `cacheDir` configuration at the package workspace's ignored `.test-cache/vite/` instead, add its
ignore entry, and update CI's clear/upload paths. `mergeDurationArtifacts` finds native `results.json` documents
recursively within tier-named artifacts, so retain those artifact names and native file format. Keep the handed
duration input separate from these writable results. Workspace-relative reporters stay private with the execution
view, and the existing runtime-build artifact lease continues to apply.

Parent reuse extends the common scoped key with the canonical complete invocation matrix and the runtime binding
applicable to each invocation. Batch/shard identities and order are stable plan data. Materialization paths, request
IDs and provider queue/machine labels are attempt data and do not enter the key unless a declared runtime input
establishes behavior dependence. Different runtime identities are permissible only within the native partition
contract's compatibility requirements; disabling reuse does not waive membership preconditions. Qualification proves
common native membership across the actual execution profiles, not merely that every subprocess exited zero.

Publish one parent using the existing disposable pass-store contract; there is no need for durable shard records.
A complete parent hit covers the entire encoded plan and launches no shard. Incomplete or failed groups never
publish a pass. Failure to save an otherwise valid parent cache record retains the existing best-effort storage
semantics rather than changing the check verdict.

### Shard Outcomes and Cleanup

**Owner agreement, 2026-10-26:** retain the outcome and cleanup semantics below. Most follow directly from reliable
check evidence. Early cancellation versus collecting sibling results is a genuine scheduling tradeoff; the initial
baseline lets already-started siblings finish. A future change to that policy must preserve incomplete-work detail
and settle cancelled work before releasing its resources.

`discoverVitestSelection` in `src/lib/vitest-discovery.ts` rejects an empty configured selection, and
`checkVitestCompletion` in `src/lib/vitest-completion.ts` rejects a run with no completed cases. The integration
coverage in `local-vitest-selection.test.ts` explicitly retains that rejection for an empty native shard, even with
native empty-success permission. `assignDurationShards` can nevertheless produce an empty share of a nonempty
selection. Distributed qualification must distinguish those states; it cannot reinterpret an arbitrary nonzero
exit or an absent report as successful empty work.

Accepted rules, preserving ordinary standalone completion requirements:

- A qualified native empty-share result means the partitioner completed against the common input basis and assigned
  no work to that invocation. Account for it explicitly, while retaining the whole check's requirement for useful
  evidence. Preserve a native contract's proved selection no-op as useful evidence. Unmatched name filters,
  all-skipped cases, unqualified no-work results and absent results do not gain successful meaning from sharding.
  Existing native statuses carry these meanings; no additional generic result carrier is required.
- ARC tracks every expected batch/shard invocation; transport success or one passing share does not complete the
  check. Validate requested source identity before admitting an invocation's verdict. Preserve failures and missing
  work separately in diagnostics, regardless of which parent label applies.
- Interpret native empty/no-evidence/kill outcomes through the declared/native contract, rather than teaching the
  infrastructure adapter test semantics. `finalizeCheckRun` currently gives declared no-evidence status precedence
  over its special SIGKILL status. Preserve that distinction when normalizing each invocation.

| Qualified invocation set                                                                     | Parent result                                                      | Reusable pass                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Every expected invocation completed acceptably, with required evidence overall               | Passed                                                             | Only with applicable input/runtime key |
| At least one completed check failure, including when another share is missing or unavailable | Failed, with incomplete-share detail when present                  | Never                                  |
| No completed failure, but a required share is missing, unavailable, cancelled or killed      | Couldn't run completely, with exact invocation diagnostics         | Never                                  |
| Every invocation completed but the whole check produced no evidence                          | Existing native/declared non-passing no-evidence or failure result | Never                                  |

`executeCheckBatches` and `unavailableBatchResult` already preserve a completed batch failure over a later reported
runner-unavailable result; `declaredChecksExitCode` separately gives unavailable execution precedence across
different checks. Preserve that distinction rather than deriving a parent policy from the request-level exit code.

For the initial group policy, collect the complete planned diagnostic set after an ordinary check failure. Serial
playback continues with remaining invocations, matching `executeCheckBatches`' existing behavior after a nonzero
command exit. Group submission asks for the complete matrix and lets already-started siblings finish. User
interruption or unavailable execution can leave explicit not-executed dispositions; no such group can pass.
There is no separate ARC fail-fast setting, automatic rerun or speculative local fallback after a shard failure.
An explicit interruption uses the runner's stop/settlement path; lost transport after launch is uncertain execution,
not proof that the process stopped.

Release context resources only after launched processes have settled and required outputs have been collected.
An acquired context also releases on a cache hit. A leftover disposable directory after otherwise complete work
is a cleanup diagnostic, not a reason by itself to erase a valid result; unsettled processes or missing required
outputs still prevent successful completion. Keep live native controller-close failures authoritative through
`closeVitestController`; the advisory disposal distinction does not convert those failures into passing tests.

**Forward clarification, 2026-10-26 — evidence is native-contract-relative.** The earlier agreed wording included:

> Zero tests selected overall, unmatched name filters, all-skipped cases and absent results do not gain
> successful meaning from sharding.

The blanket zero-selection clause is too broad for a reach-based check. In the not-yet-landed ref-backend source at
`82579e9f0ff38613e9cb3d8456d5f6d8e7498884`, `runReachCheck` in `src/lib/reach-check.ts` returns success after a
validated selection proves the change reaches no suites. `runReachSuites` also returns success after the configured
sequencer assigns an empty share and the controller closes without failure. `reach-check-shards.test.ts` covers
both cases. Preserve those existing successful no-op contracts: their selection evidence is useful even though no
test case executes. Unmatched filters, all-skipped tests, incomplete work and missing results retain their existing
non-passing meanings. This clarifies the accepted useful-evidence requirement; it does not authorize weakening a
native check's completion floor.

This source also removes the current need for a new generic empty-share exit code, result file or per-test-count
field in the adapter protocol. The native command owns its selection/partition/completion contract and returns its
normal status and report; ARC applies that declared status contract while closing the full invocation matrix.
Qualify successful empty shares and successful reach no-ops through real native controllers rather than parsing
their human output or inventing native-test semantics inside the infrastructure adapter.

For ordinary Vitest tiers, `getRelevantTestSpecifications` does not apply sharding; the installed native pool calls
the configured sequencer before execution. Feeding a pre-sharded list into `runTestSpecifications` with sharding
still enabled would partition twice. `HeavyFirstSequencer.shard` can expose its actual assignment if further native
completion support proves necessary; do not add a second scheduler or a preview pass to the generic check engine.

## Storage Forward Compatibility

Design and implementation need no dependency on the storage cutover while this remains check execution work.
`RELEASE-GATES.md`'s Stage 2 stance keeps gate results as machine-local execution shortcuts, separate from durable
review/delivery evidence, lifecycle writes and projected-state validation. The storage program's serialized cutover
window still applies; its upcoming schedule is a coordination constraint, not a reason to delay this design.

`checkRecordDirectory` resolves the checkout's own Git directory for disposable pass records, and
`createCheckPassStore` treats an unavailable or invalid cached record as a miss. Keep that disposable behavior:
do not add synced shard records, notes-backed execution state, work-unit placement keys, or invalidation against a
whole-store version. Capture leases and process outputs are execution resources, not new canonical state families.

Repository code and explicit external execution inputs form the distributed input boundary. Operational state is
read through its owning storage/selection interface; a Git source capture must not be presented as capturing the
future gitignored projection. Keep projected-state selection checks in their owning checkout for this feature.
Do not copy live state refs, personal notes or the session's projection into runner workspaces to make code tests
work. Tests needing ARC state use their disposable fixtures through the same storage APIs as other tests.
Pre-cutover source trees may incidentally include tracked planning files; the execution contract must not depend
on their presence or interpret them as authoritative lifecycle state.

`createWorktreeSnapshot` captures a tree and private index; it does not materialize an executable checkout. A source
materialization lease, if selected, must preserve the required code/base coordinates and explicitly bound external
inputs without depending on a work-unit branch name or append-only code history. Rewriting the original branch or
editing unrelated stored state must not change an already captured run's inputs.

Re-ground against the ref backend and projection as they land. Qualify the code-execution path with projected state
absent from the source snapshot, keep selection checks on their existing local path, and serialize any actual
overlapping check-engine changes with their owners. No storage-program record shape or lifecycle write is in scope.

## Design Closure and Qualification

**Design closure, 2026-10-26:** both sessions have aligned the shared source/binding, runtime-key and
prepare/run/group/stop/release semantics. There is no remaining material shared architecture fork. Exact schema
fields and private source encoding crystallize in the runner specification, which owns that public interface;
this specification consumes the same contract. The distributed behavior above supplies the consumer requirements
rather than a competing lower-level schema.

The author's readiness assessment clears the three criteria: materially divergent design choices have been closed,
observable success is stated below, and this draft has no unintegrated inbound buffer. The identity-global inbox
contains coordination captures for the configuration and contention owners, not an unintegrated DCS capture.
The joint independent review of both drafts and Proposed ADR-039 found no material design issue and one minor
citation finding, now corrected. The additional independent fix check was declined for that URL-only repair.
Draft capture is approved; neither the review nor that approval is implementation evidence.

The remaining verification work below belongs in the implementation plan. It does not require a production
executor or a full benchmark to exist before the design can be formalized. The ref-backend source read is pinned
and read-only; re-ground its native store contract against the public base when it lands. Shared-handler execution
starts after the common runner foundation lands, while design/spec work can proceed in parallel.

### Qualification Plan and Observable Success

**Public-contract fixture.** Use a small independent adapter, not arc-offload internals, to run the complete
batch/shard plan against captured fixture inputs. Exercise group capability and serial single-invocation playback.
Confirm one parent pass only after every expected acceptable result, including a cache-hit path that launches no
invocation. Missing, duplicate and unknown results, a completed failure alongside unavailable work, adapter loss,
killed commands and explicit interruption must retain their distinct non-passing outcomes and recovery routes.
Required output loss prevents success; best-effort log loss and leftover-directory disposal remain diagnostics.

**Identity and reuse.** Edit the live source and duration file after capture; every launched sibling must still
observe the same captured bytes and selection. Changing a declared source dependency, file-input presence/content,
invocation matrix or applicable runtime identity must miss the old parent key. Changing only an unrelated file,
original host pathname, request/context handle or materialization directory must not invalidate a semantically
identical pass. Unknown runtime disables reuse without relaxing source or native-partition requirements.

**Native membership and outcomes.** For unit, integration, store and E2E, compare the native unsharded selection
with the union of native shard assignments under the actual supported execution profiles. The union must match
and each selected member must occur exactly once. Include filtered selections, deletions/widening, legitimately
empty store shares and a reach selection proving no affected suites. Preserve unmatched/all-skipped/empty-execution
failures where the native contract requires them. Test both available duration bytes and the captured absent/empty
states that select native fallback behavior. This harness uses native discovery/partition APIs; it does not add
test-specific parsing or a per-test scheduler to the generic adapter.

**Writer and lifetime isolation.** Exercise concurrent invocations with a shared dependency install and distinct
execution views. Confirm native cache/report/duration writers do not alias, handed duration inputs do not change,
and runtime-build artifact ownership remains effective. Settle launched work before release on success, failure,
cache hit or interruption, preserving an actionable diagnostic when the adapter conversation is lost.

**Personal integration.** Qualify arc-offload through the same public adapter contract, including local and remote
placements under the Owner's routing/resource policy. External changes remain in that repository. This work tests
the grouped path and parent result; the runner work qualifies its single-command path. Use the live measured pool
and registry, not a fixed runner order, and retain shared admission across repositories and worktrees.

**Measured benefit.** Benchmark the same fixed source, native selection, duration inputs and requested check set
with unsharded native invocations and the declared shard plan. A benchmark harness can vary the in-memory plan
without changing captured source files or adding a production sharding-toggle setting. Force fresh runs; include
capture, preparation, runtime qualification, queueing, execution and collection in end-to-end cost. Interleave
repeated baselines and grouped runs, then repeat with five or six concurrent gates. Report median/range, aggregate
completion time, native coverage and resource admission. Claim latency improvement only beyond observed run-to-run
variation; do not claim a general speedup for serial basic adapters or unmeasured execution setups. A concurrent
throughput regression remains an unresolved result to address, not a speedup hidden by one fast idle-pool gate.

## Evidence Already Gathered

The disposable probe used a small frozen repository and a static two-way manifest. One sibling ran directly on WSL;
then the original source and duration input were edited; the second sibling ran through the registered primary
runner with the existing shared capacity admission and a temporary registry. Both reported identical source,
duration, manifest and Git HEAD identities. The manifest's union was complete and its shares were disjoint. A forced
remote command failure retained exit status 7.

This was an input-transport proof, not native Vitest membership qualification, an ARC gate, parent pass publication,
cancellation coverage or a speed benchmark. Its owned remote fixture was removed. The original live registry and
routing mode were not edited. Local evidence and the reproducible harness are under
`.arc/user/andrew/.internal/distributed-check-shards-recon/` in this worktree.

One requested Astra advisor consultation is complete. It recommended per-check capture, ARC-owned check semantics,
generic execution adaptation, existing offload scheduling, preserved artifact leases and output isolation. Its
question, result and limits are preserved with the local evidence. Additional consultation is not implied by this
completed request.

The local code-object/materialization probe is preserved as `capture-objects-probe.py` and
`capture-objects-result.json` in that same reconnaissance directory. Both independently materialized siblings used
the same captured tree, original head/base and external duration bytes after the live fixture changed; the original
index remained unchanged. The probe used a tiny Linux fixture and an 808-byte object pack. It did not run remote
transport, native suites, runtime identity probes, cache reuse, cancellation or parent pass publication, and it did
not qualify Git filters/LFS, submodules, shallow history or Windows behavior.

The separate `capture-raw-bytes-probe.py` and `capture-raw-bytes-result.json` cover one Linux text-conversion case:
Git-only materialization changed the captured CRLF bytes, and applying the frozen raw bytes restored them without
changing the code head, captured tree or original index. This narrows the text-conversion gap for that fixture;
arbitrary filters, LFS and the other platform/history cases remain unqualified.

## Scope Boundary

Cover generic declared-shard execution across the sharded tiers when those checks are requested. The feature must
serve unit, integration, store and E2E invocations through the same abstraction, while retaining each tier's existing
selection and completion rules. Preserve configured runner routing policies and resource ceilings. Qualify the
public contract independently of arc-offload, then qualify the personal arc-offload integration against it; no
adopting team should need that tooling or a repository-specific distribution script to implement the contract.

Leave broader whole-gate snapshots, test-cost budgeting, CI wall balancing and suite timeout hardening with
`draft-test-suite-contention-hardening.md`. Leave first-class per-machine runner settings and retirement of the
existing declaration wrappers with `draft-machine-check-runner.md`. Coordinate their interfaces without making
either entire program a prerequisite by assumption.

There is no current justification for durable per-shard pass records, a distributed database, an artifact-lock
redesign, or a scheduler fairness rewrite. Reconsider only against concrete requirements or observed failures.

## Next Session

Formalize the settled distributed behavior into the specification. Public schema details crystallize in the
defining runner spec; DCS remains aligned with it and consumes the landed foundation before shared-handler
execution. The joint review and its approved citation correction are complete. Implementation and full-suite
benchmarks have not started.

Verification should prove complete/disjoint native membership; one common source/selection/duration basis across
WSL and remote siblings; parent failure behavior without false pass publication; cleanup and output isolation; and
matching native coverage when comparing unsharded and distributed gates under idle and concurrent load.

---

[swarming-guide]: https://chromium.googlesource.com/infra/luci/luci-py.git/+/HEAD/appengine/swarming/doc/User-Guide.md
[swarming-bot]: https://chromium.googlesource.com/infra/luci/luci-py/+/show/refs/heads/main/appengine/swarming/doc/Bot.md
[bazel-sharding]: https://bazel.build/versions/9.2.0/reference/test-encyclopedia
[nextest-partitioning]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/ci-features/partitioning.md
[nextest-running]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/running.md
[xdist-model]: https://pytest-xdist.readthedocs.io/en/stable/how-it-works.html
[xdist-crashes]: https://pytest-xdist.readthedocs.io/en/stable/crash.html
[cargo-runner]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[buck2-remote]: https://buck2.build/docs/users/remote_execution/
[buck2-executor]: https://buck2.build/docs/api/build/CommandExecutorConfig/
