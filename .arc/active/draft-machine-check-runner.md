# Draft: Machine Check Runner

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from two captures: "Let a machine run declared
  checks through a configured runner" (2026-10-11), and "Let `arc check` route declared checks through a machine's
  runner without a per-declaration wrapper" (2026-10-12), which outgrew its original Errand placement.
- **Purpose:** Let teams execute ordinary declared checks through their own configured runner, with correct results
  and reusable evidence, without encoding a particular provider in ARC or in each check command.
- **Readiness:** formalization-ready — shared ownership, configuration, fallback and logical execution semantics
  are settled. Author readiness, proportionality and grounding checks are complete; joint independent review closed
  with its sole minor citation correction applied and verified.

---

## Problem / Motivation

Check declarations should say what the project checks, while a machine's runner determines how eligible commands
execute. Remote pools, containers and local resource wrappers are possible implementations. Repositories should not
need offload-specific test implementations, command wrappers in each declaration or duplicate shard configuration.

The top-level `exec` dispatch in `scripts/check-runner.sh` currently wraps nine declarations, discovers a machine-local
executable and runs locally when that file is not executable. This is a repository prototype, not a landed ARC
configuration tier. The wrapper's `bash` prefix also requires Bash on a native Windows host even when the check
itself needs no shell. Moving lookup into ARC must preserve argv, cwd, input and failure semantics.

Execution evidence needs attention too: a result from another runtime must not be cached under a fingerprint
observed only on the caller's machine.

## Resolved Direction

- **Provider independence.** Arc-offload is personal tooling, not an ARC dependency, built-in provider or assumed
  installation. Adopting teams can connect their own setup through the same public boundary.
- **Portable declarations.** Keep normal check commands and existing shard declarations. Declare execution
  eligibility where needed; keep provider executable paths, inventory and scheduling policy outside those commands.
- **Authority boundary.** ARC owns check selection, declaration interpretation, verdicts and check evidence. Runners
  own execution placement and resource admission. Generic invocation data should carry no work-unit identities or
  test-framework-specific interpretation.
- **Captured input ownership.** ARC defines and fixes the common source, selection, explicit external inputs and
  complete invocation plan. The adapter materializes, prepares and executes that definition. ARC decides reuse from
  applicable execution-runtime identity, conservatively running without reuse when that identity is unknown. This
  is the shared architectural direction carried from the DCS discussion; request schemas remain open.
- **Fallback ownership.** The runner decides whether local placement is permitted and admits that work itself.
  ARC preserves its outcome and does not bypass an unavailable or broken configured adapter. With no runner
  configured, retain native execution. Accepted on 2026-10-26 after discussing the four concrete cases below.
- **Configuration.** Use machine-local `~/.arc/config.yml` with `checks.runner` as literal argv, and project-side
  `runner: true` to opt in checks without changing their commands. Accepted on 2026-10-26. Coordinate this narrow
  global-tier addition with `config-storage-architecture`; it does not require that whole migration to land first.
- **Integration proof.** Qualifying arc-offload through the public seam is part of the deliverable. Changes needed
  in that tool belong in its own repository. This work owns single-command qualification; distributed sibling
  qualification belongs with `draft-distributed-check-shards.md`.
- **Native default.** With no configured runner, retain current native, unsharded execution. DCS records the explicit
  decision that declared sharding is selected through a configured runner.
- **Concern boundary.** Keep one Heavy work unit: configuration, dispatch and trustworthy single-check results form
  one concern, composed from existing primitives. DCS separately owns shard expansion and aggregate parent completion.

### Implementation ownership and landing

Land the common single-check foundation here before its grouped consumer. This completes the accepted runner/input
contract rather than adding an independent concern or waiting for a new work unit:

- This work owns the reusable source artifact, generic environment-bound external-file capture and rebinding,
  declaration/key support for those inputs, single-check runtime qualification, portable argument-budget primitives,
  adapter protocol/configuration and single-command qualification. A typed `environment_inputs` map captures explicit
  scalar selection values and file inputs through one declaration, replacing the earlier file-only sketch.
- DCS owns declaration-driven shard expansion, shard-aware use of the portable batching primitives, common sibling
  context use, runtime-vector/group reuse, complete-set outcome reduction and native distributed qualification.
  Final shard arguments participate in batching before placement.
- Both can design and specify in parallel. Shared handler implementation in DCS follows the common foundation's
  landing and re-grounding against that source. The single-check implementation and wrapper retirement here must
  not depend on DCS later supplying the generic file-input capture needed to make those checks correct.

The existing portable declarations remain the source of checks and shards. Adapters consume the same fixed input
definition and generic invocations whether their caller requests one command or a group.

## Existing Substrate

Source paths below are relative to `packages/arc-framework/` unless repository-root paths are given. Observations
were grounded during the 2026-10-26 planning pass; re-ground affected source before implementation.

- `runDeclaredCliRequest` in `src/handlers/check/run-cli.ts` binds both execution and runtime probes to native
  `runCheckProcess`. That function in `src/lib/checks/process.ts` accepts argv, cwd, file-check coordinates and
  shell/index policy; its current input carries no selected check or prepared runner context.
- `checkEnvironment` and `readNotice` in that module manage the local `ARC_CHECK_NOTICE` channel. A nonzero status
  with a `not run:` notice means unavailable execution. Notices are diagnostics, not source or runtime assurance.
- `executeSelectedCheck` in `src/handlers/check/run.ts` computes `selectedCheckKey` and looks for a reusable pass
  before executing batches. `resolveCheckKey` in `src/lib/checks/key-resolver.ts` gathers runtime-probe stdout;
  `checkContentKey` in `src/lib/checks/key.ts` hashes those observations with declarations and selected content.
  The CLI observes the local runtime even when a declaration wrapper relocates execution.
- `finalizeCheckRun` distinguishes unavailable, killed, no-evidence, failed and successful executions.
  `createCheckPassStore` and `checkRecordDirectory` in `src/lib/checks/record.ts` keep disposable successful-pass
  shortcuts in the current checkout's Git directory, separate from durable review or delivery records.
- `OrdinaryCheckSchema` in `src/lib/checks/declaration.ts` has no eligibility field. `SelectionInputSchema` prevents
  projected-state selections from enabling caching, gates or index access. `finishCheckRewrites` in the execution
  handler observes fixer changes in the caller's checkout; a remote result cannot satisfy that mutation contract.
- `resolveCheckForecast` in `src/lib/checks/forecast.ts` already expands declared shard argument templates. DCS owns
  using that declaration-driven expansion during execution and reducing the complete outcome set.
- `checkArgumentBudget` and `batchCheckPaths` in `src/lib/checks/batching.ts` budget for the supplied platform;
  `resolveCheckForecast` currently appends shard arguments after batching. Routed plans need a portable budget
  accounting for their final arguments before placement, rather than assuming the caller's platform matches a worker.
- `resolveGitConfigOverride` in `src/lib/config/resolve-override.ts` resolves Git config, project YAML and defaults.
  It does not supply the proposed cross-project machine setting. `draft-config-storage-architecture.md` proposes
  global identity, project user preferences and project-local machine state; runner placement needs an explicit
  coordinated decision, rather than claiming that draft already defines the needed tier.

## Storage Compatibility and Sequencing

Proceed alongside the storage program; no cutover dependency has been established. `RELEASE-GATES.md` explicitly
permits gate work before the cutover when results remain machine-local execution shortcuts and lifecycle writes,
review/delivery record shapes and projected-state gates remain outside the change.

- Keep pass caches and reports disposable and machine-local, rather than promoting them into durable evidence.
- Scope source captures and execution handles to a run. Bind code evidence to code and explicit input content, not a
  work-unit branch, Git note, planning-artifact location or whole-store version. Git tree identities may name code
  without becoming durable work-item identities.
- Do not require copying `refs/arc/*`, notes or personal state to execute code. A pre-cutover tree may incidentally
  contain tracked planning files; their placement must not be used as the authority for lifecycle state.
- Keep projected-state `selection` checks in their owning checkout using the projection's selection. Remote
  projections and new Markdown gates over operational state are outside this work.
- Runner executable configuration is machine-local tool configuration. Do not sync it through notes now and move it
  into the store later. Settle its home with `config-storage-architecture` without taking on that whole migration.
- Respect the cutover's serialized import/flip window. Otherwise plan and implement in parallel, re-grounding against
  the landed ref backend and projection as they arrive. Entering lifecycle-write code would require reassessment;
  elapsed time alone does not create a dependency edge.

## Prior Art and Alternatives

The bounded Luna research pass used official documentation and source, without an independent verification pass.
These precedents inform the design; they do not imply a new package or service dependency.

- **Configured command runner.** Cargo's `target.<triple>.runner` accepts a program and arguments, including an array
  form, and appends the executable and arguments to run. Borrow literal argv and configured-executor semantics;
  Cargo's target model does not settle source capture, invocation groups or check evidence. [Cargo config][cargo]
- **Structured action.** REAPI's `Command` describes arguments, environment and cwd relative to an input root;
  `Action` binds it to an input-root digest. Borrow explicit invocation/input identity and the distinction between
  execution status and command exit status. Its full CAS/RPC stack is disproportionate unless a concrete adapter
  targets infrastructure that already implements it. [Remote Execution API][reapi]
- **Cache before execution.** Bazel documents unsound sharing when host tools outside the workspace are untracked.
  A caller-local runtime digest cannot qualify a different execution environment. Establish an applicable execution
  identity before reuse or run without a reusable key. [Remote caching][bazel-cache]
- **Fallback as policy.** Buck2 distinguishes remote-only and hybrid execution and separately configures fallback
  after command failure. Bazel dynamic execution races local and remote work, cancels the other attempt and manages
  the resulting resource cost. Borrow those distinctions; racing is not ordinary fallback. [Buck2 execution][buck2],
  [executor configuration][buck2-config], [Bazel dynamic execution][bazel-dynamic]

### Working protocol design

Use one adapter subprocess per selected check, launched with the configured executable and literal arguments. Keep
one stdio conversation alive across preparation, ARC's cache lookup, execution and release. Separate process calls
carrying a handle would require cross-process context storage and recovery without an established need.

Use JSON-RPC 2.0 envelopes over newline-delimited stdin/stdout. Request IDs and separate
result/error envelopes are useful here because output and cancellation overlap an outstanding execution request.
Use stdout only for protocol messages and stderr for adapter diagnostics. A check that completed with a nonzero
exit is an ordinary RPC result carrying that status; a malformed request is a protocol error.
[JSON-RPC specification][json-rpc]

Newline-delimited subprocess communication with separate stderr diagnostics has a concrete precedent in MCP's stdio
transport. This adopts that transport pattern without requiring an MCP server, its handshake or its tool model.
Neither JSON-RPC nor stdio establishes child-process cleanup; the adapter contract must do that explicitly.
[Stdio transport][stdio-transport]

The logical operations below define the interface; exact message schemas crystallize in the spec:

| Operation            | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| Prepare              | Confirm captured inputs, capabilities and runtime identity.    |
| Run                  | Execute one planned invocation.                                |
| Run group (optional) | Execute a named set, returning individual outcomes.            |
| Cancel               | Request settlement; acknowledgement does not prove completion. |
| Release              | Dispose after settlement, or after a cache hit.                |

Output notifications identify their invocation and stream. ARC checks response identities against its invocation
plan and keeps output separate from control messages. A JSON-RPC batch is not the grouped execution operation:
generic RPC batching supplies neither common captured inputs nor complete invocation accounting.

Grouped execution emits a terminal execution-outcome notification for each invocation as its result becomes known.
Its final reply confirms process settlement and closes the expected ID set. ARC retains already-observed terminal
outcomes if the group conversation later fails: a completed native failure remains a failure, with incomplete-work
detail for missing siblings. Human output is not terminal evidence. Conflicting or unexpected result identities
cannot establish successful completion. These are ephemeral execution results, not durable per-shard records.

Single-invocation execution is mandatory; group submission is optional. Without group support, ARC can send the
planned singles sequentially through the same prepared context. It must not silently replace a declared shard plan
with one unsharded command. The provider still owns admission and placement for each invocation.

Explicit interruption uses the adapter's cancellation/settlement path. EOF also requires the adapter to settle work
it launched before releasing its resources. If the conversation is lost without settlement evidence, report
incomplete execution and retain the provider's recovery diagnostic; do not infer that remote children stopped or
automatically relaunch the check. Keep a source artifact that unsettled work may still use. Cancellation acceptance
is distinct from terminal outcomes and settlement; release follows the latter. Exact fields and native process
handling belong in the spec, preserving those lifetime semantics.

An argv-prefix-only boundary remains the rejected alternative for relocated execution: it would need separate
capture, provenance and lifecycle channels to meet the accepted contract. A bare executable such as `nice` is not a
protocol adapter; a small adapter can invoke that executable internally. Demonstrating that adapter's implementation
burden is part of qualification, rather than assuming every existing wrapper can be used unchanged.

### Shared execution flow

The capture, execution and verdict ownership below is the shared architectural direction. The logical capability
and outcome rules are settled; the specs supply their exact typed representation.

1. **ARC fixes the inputs and invocation plan.** For an eligible check sent to a runner, bind one source and
   selection basis, required Git coordinates and explicit external input bytes. ARC expands its declaration into
   the expected generic invocations. A runner materializes this captured definition rather than independently
   recapturing the changing original checkout for each invocation. The unconfigured native path stays unchanged.
2. **The runner establishes an execution context.** The adapter owns materialization, dependency preparation,
   placement and resource admission. It preserves captured inputs while isolating writable outputs. This is a
   logical preparation boundary; it need not unconditionally allocate a remote workspace before every cache lookup.
3. **ARC qualifies reuse.** Establish an execution-runtime identity applicable to the complete invocation plan
   before looking up a reusable pass. A provider guarantee may avoid expensive preparation only when it binds the
   environment that will actually execute. Otherwise observe prepared runtimes or execute without reuse. Distinct
   workers may have distinct runtime identities; a caller-local probe cannot substitute for those observations.
   Preserve declared dependency scope in the reusable key. Whole-root source validation does not make unrelated
   repository content a check dependency. Ephemeral context/request IDs, materialization paths and queue labels
   identify attempts, not reusable content; keep them out of the key.
4. **The runner executes; ARC interprets.** Return the identity, output and execution outcome of each expected
   invocation. ARC applies check-specific failure, killed and no-evidence semantics and, for DCS, closes the complete
   invocation set before producing one parent verdict. Wrong source cannot count as success. A placement or fallback
   change must preserve the qualified runtime binding or require fresh qualification.
5. **ARC closes the lifetime.** Release acquired contexts on cache hit, completion, failure and interruption. The
   adapter implements disposal of its resources; ARC owns the obligation to request it. Launched work must settle
   and required output must be collected before releasing its workspace. Failure to prove work has stopped is
   different from an advisory failure to remove a leftover directory after execution has settled.

The split is ARC-owned input definition and result meaning, with adapter-owned materialization and execution. The
initial contract uses captured inputs for every routed check, including a local resource wrapper. It adds no second
mode that silently runs configured invocations against the changing original checkout. The unconfigured native path
retains its current cwd and single-command behavior.

### Captured source representation

ARC supplies a self-contained source-root artifact and stable content identity. The artifact presents the actual
captured execution bytes and the code-only Git metadata needed for the requested HEAD, base, tree and merge
coordinates. It must not contain a Git worktree pointer or object dependency that only resolves on the caller's
machine. Adapters copy or transport this root without understanding an internal Git-pack format.

Source fidelity is about materialized bytes, file modes and required links/coordinates, not just equality of a
canonical Git tree ID. Preserve filters, LFS and line-ending presentation rather than reconstructing a different
execution view from canonical blobs. If the capture cannot establish the required view, refuse with a remedy
instead of dropping inputs or claiming success. Encoding, transfer optimization and retention implementation are
internal choices bounded by that observable contract and its conformance tests.

Separate stable content identity from attempt handles and artifact locations. Source validation may cover the
whole artifact, while the pass key retains declared dependency, selection, explicit environment and runtime scope.

### Declared environment inputs

The common foundation owns one per-check typed map:

```yaml
environment_inputs:
  CHECK_MODE: value
  CHECK_WEIGHTS_FILE: file
```

`value` captures a literal selection value; `file` captures a file named by that variable. Both preserve presence
and empty-value semantics, and apply before runtime probes as well as check commands. This avoids inferring paths
from probe stdout and preserves the caller's selection rather than substituting a remote worker's defaults.

- An unset variable is captured as absent and remains unset in the executing child, regardless of worker ambient
  environment. A literal empty value remains explicitly empty; it is distinct from absence and from a zero-byte file.
- For `value`, hash the variable name, captured state and literal value, and replay it unchanged. An adapter whose
  policy cannot honor a declared selection reports unavailable execution rather than silently replacing that value.
- For `file`, a nonempty value names a regular file. Resolve a relative path against the check's cwd, follow a
  symlink through the opened file and confirm its type, then freeze its bytes. Unreadable or nonregular inputs
  refuse capture with an actionable retry route; they do not silently become native fallback inputs.
- Bindings identify their environment name, captured state and content identity. The adapter materializes file
  bytes and rebinds the variable to its own path. Host paths and temporary materialization locations are not content
  identities. Capture needed to preserve execution inputs applies even when reusable caching is disabled.
- Derived check coordinates, the notice channel and checked-index location remain engine-owned. Declarations do not
  replay stale caller values over `ARC_CHECK_BASE`, `ARC_CHECK_TREE`, `ARC_CHECK_MERGED`, `ARC_CHECK_NOTICE` or
  `GIT_INDEX_FILE`. Undeclared ambient variables are not a blanket environment snapshot.
- Forecast and dry-run plans describe binding names; they do not freeze current absence or bytes. Actual dispatch
  captures the values after any caller-owned preparation, including CI artifact delivery, and before execution.

This work supplies declaration/capture/binding and scoped single-check key support. DCS consumes it for shared
selection/duration inputs and grouped keys; no native-test fields are added to the infrastructure protocol. Explicit
bindings can freeze small input files on the native path too, without adding a source checkout or shard fan-out.

### Adapter walkthroughs

**Local resource wrapper.** ARC captures one eligible check and starts a small local adapter. The adapter prepares a
local workspace from that captured definition and prefixes child commands with its resource-control program. It
needs no remote scheduler or group implementation. It may provide runtime observations from that workspace for
reuse, or explicitly disable reuse. ARC runs each requested invocation and releases the context. This example must
measure capture/preparation overhead; ordinary checks with no configured runner pay no source-workspace cost.

**Remote pool.** ARC sends the same input definition and invocation records to a pool adapter. The adapter delivers
the fixed inputs to its chosen workers, applies its own admission and fallback rules, and reports actual execution
identities and outcomes. Optional group submission lets it distribute the entire plan. A local placement chosen by
the pool uses the same captured inputs rather than the changing original checkout. ARC alone decides the check's
verdict and reusable parent key. The personal arc-offload qualification exercises this path through the public seam.

**Reusable hit.** After preparation establishes applicable source/runtime identity, ARC finds an existing pass and
releases the acquired context without sending execution requests. An opaque adapter with unknown runtime skips this
lookup and executes. No adapter is required to allocate an expensive worker merely to claim a reusable identity.

### Shared outcome baseline

The DCS discussion established the following outcome and lifetime rules; the wire representation remains open:

- Preserve a completed check failure when another invocation is unavailable; report the missing work alongside it.
  Without a completed failure, missing required work means incomplete execution. Neither case publishes a pass.
- Require acceptable results for the complete invocation set and the native check's own evidence requirements.
  Qualified empty shares need explicit native support. Preserve valid native selection no-ops; do not impose a
  universal tests-completed rule on every check. Infrastructure adapters do not interpret native test reports.
- Let already-started siblings finish after a failure and collect their results. Explicit interruption still
  requires cancellation and settlement. Lost transport does not prove that work stopped.
- Collect required outputs and settle launched processes before releasing workspaces. Failure to remove an otherwise
  finished disposable directory is advisory; missing outputs, unsettled processes and native controller-close
  failures retain their substantive failure meaning.
- Independent writable execution views are required for concurrent invocations. Shared immutable dependencies are
  allowed, but separate cwd paths are insufficient when they alias mutable cache/report writers through shared
  dependency directories. Isolate those writers or serialize access to the shared view. Native tools own their
  cache/report options; the adapter protocol gains no test-report grammar from this requirement.

### Configuration

Accepted on 2026-10-26: extend the configuration cohort's planned `~/.arc/config.yml` with a machine-local runner
command, represented as literal executable/argument data. This work implements only the runner reader, leaving
identity bootstrap and the broader preference migration with `config-storage-architecture`.
This reuses the planned global home rather than introducing another long-term configuration directory.

The file is local to this person on this machine and does not sync through notes or the store. Reading the runner
setting must not require migrating identity or changing how existing settings resolve. The initial design needs
no project override hierarchy: project declarations opt checks into runner eligibility, and the machine selects its
adapter. Missing runner configuration retains native execution; malformed configuration or a configured executable
that cannot start is a visible configuration/execution problem, rather than implicit permission to run locally.

The prototype's XDG executable discovery retires with its repository wrapper. No configuration-cohort implementation
dependency has been established.

The configuration handoff is captured for `config-storage-architecture` in the identity-global inbox as "Preserve
the machine-local check runner in the global configuration model". Its owner adopts that global-tier addition during
planning; the accepted setting below and the shared ADR retain the decision.

The setting is one argv array in that global file:

```yaml
checks.runner: ["team-check-runner", "--profile", "development"]
```

The executable is a protocol adapter; its remaining arguments are passed literally. A bare executable name resolves
through PATH, while a relative executable path resolves from the configuration file's directory. Arguments remain
opaque to ARC. Removing the key disables runner use; an empty array or a shell command string is invalid rather
than a second way to specify the same setting. Other global keys are outside this reader's ownership, so the later
configuration work can extend the file without this work claiming its whole schema or identity bootstrap.

Project declarations express eligibility separately, with a boolean marker whose absence retains local execution.
The spelling is `runner: true`; the project never supplies a provider executable through it.
Refuse opt-in for fixers, index-certifying checks and projected-state selection checks. Checkout artifact producers
stay unmarked. A machine with no configured adapter retains native execution even for an eligible declaration.

### Fallback ownership

Accepted on 2026-10-26: the runner owns fallback policy and resource admission; ARC does not fall through around it.

Fallback is useful when remote execution is an optional accelerator and the local host is eligible and available.
It is inappropriate when a runner enforces a machine reservation, an isolation requirement or a toolchain unavailable
locally. Completed command failure and a lost execution response also require different treatment.

Invoke the configured runner and preserve its result. The runner may fall back locally under its own policy and
admission controls; ARC does not silently bypass it after an error. This accommodates both
prefer-remote and required-remote setups without copying their scheduling modes into ARC. Missing configuration is
distinct from a configured executable that cannot start.

The accepted cases are:

- No runner configured: execute natively, preserving the unsharded default.
- Runner configured and local fallback allowed: the runner admits and executes local work under its policy.
- Runner configured with required remote placement: unavailable remote execution remains unavailable.
- Configured runner cannot start: report the problem without bypassing it through local execution.

Rerunning after an ambiguous transport failure can duplicate still-running work; a successful local retry must not
silently erase a completed failure from another environment. A completed command failure remains a check failure by
default. Keep scheduling modes in the runner rather than adding a separate ARC fallback switch.

## Specification Handoff

The remaining specification work crystallizes the settled logical contract, rather than choosing a different
execution architecture:

- Derive exact message schemas from the prepare/run/group/cancel/release semantics, including output and terminal
  notifications, protocol errors, source/runtime identities and expected invocation closure.
- Specify the source artifact, required code coordinates and declared environment bindings against the fidelity
  contract above. Put concrete filter/LFS/line-ending and cache-scope cases in the qualification plan.
- Apply the accepted eligibility marker and refusals. Routed cwd stays inside the captured source root; an escaping
  `check.root` gets a keep-local or explicit-input-boundary remedy, not capture of sibling directories or an automatic
  local fallback. Fixers, index-certifying and projection-selection checks retain their local path; artifact-producing
  builds stay unmarked.
- Use conservative portable argument budgeting, including final shard arguments, to keep the planned matrix stable
  across compatible placements. Preserve configured argv and explicit shell intent; adapters report unavailable
  when no compatible execution environment can honor them.
- Encode actual runtime observations or an applicable prepared-runtime binding before reuse. Unknown identity runs
  without reuse; a bare adapter name is insufficient. Qualification measures preparation cost without changing this
  rule or making an unknown remote runtime inherit the caller's identity.
- Implement the common single-check foundation here first, including configuration behavior and environment input
  support; DCS consumes that landed surface for grouped execution. The configuration handoff is already captured.

Full native/performance qualification belongs to implementation. Its observable requirements are settled here; the
draft does not claim that the small capture probes already qualify production execution.

## Scope and Verification

Cover the generic runner contract, machine configuration, explicit eligibility, execution diagnostics and
single-check evidence. Retire this repository's command wrappers once the path is qualified. Preserve gate deadlines
and native operation. Document the adapter contract so teams can connect tooling without rewriting checks.

Qualify arc-offload through the public seam, including success and unavailable paths and the agreed fallback policy.
External changes stay in its repository. DCS owns shard expansion, common sibling inputs, complete sibling outcomes
and one parent result.

Verify literal argv/cwd/environment handling; native defaults; eligibility refusals; configuration and runner
failures; source/runtime identity and conservative caching; diagnostics; and cleanup. Also demonstrate a small
independent runner implementation. Qualify against the storage projection as it becomes available.

Leave broader configuration migration, gate-wide snapshots, contention hardening, artifact-lock redesign and
scheduler fairness with their existing owners. This work adds no durable distributed result store or lifecycle record.

### Task-generation requirement: ADR closeout

Keep `adr-039-use-provider-neutral-check-runners.md` Proposed through implementation. Include a final implementation
task in this work unit that incorporates approved implementation-time updates, verifies the ADR against the resulting
public contract and actual qualification evidence, and marks it Accepted through that task's ordinary review and
commit. Record any still-pending consumer implementation honestly; accepting the architecture does not claim all
optional consumers have shipped.

The design still settles before implementation. A changed approved decision goes through forward amendment rather
than silently rewriting its pre-commitment into agreement with the code. After acceptance, the ADR methodology's
correction, amendment and supersession rules apply.

## Next

Formalize the settled single-check foundation in the specification. Joint drafting-stage review of this draft, the
DCS draft and the shared Proposed ADR is complete, with its sole minor citation correction applied and verified.
The configuration handoff and shared logical contract are closed; production qualification remains implementation
work. No production implementation has begun.

The shared ADR is led by this work, with DCS contributing capture, group and parent-evidence requirements. Keep exact
implementation schemas and flags in the specs. Resolve architectural questions before implementation, and leave the
ADR Proposed until the implementation-closeout task above.

---

[cargo]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[bazel-cache]: https://bazel.build/remote/caching
[buck2]: https://buck2.build/docs/users/remote_execution/
[buck2-config]: https://buck2.build/docs/api/build/CommandExecutorConfig/
[bazel-dynamic]: https://bazel.build/remote/dynamic
[json-rpc]: https://www.jsonrpc.org/specification
[stdio-transport]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
