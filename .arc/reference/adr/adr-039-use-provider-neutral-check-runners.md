# ADR-039: Use Provider-Neutral Check Runners

## Status

Accepted

## Context

Project checks describe commands, selected inputs and completion requirements. The machine executing those checks
may need a remote pool, a container or local resource controls. Embedding a provider command in every declaration
couples project checks to a deployment and obscures which environment produced a result.

ARC's native executor, `runCheckProcess`, accepts command arguments, cwd and check-content policy.
`runDeclaredCliRequest` binds runtime probes to that same local executor. `executeSelectedCheck` performs reusable
pass lookup before execution, using `resolveCheckKey` and the runtime observations it obtains. Relocating only the
check command therefore does not establish that the key describes the environment that actually executed it.

Configured command runners offer a lightweight precedent; explicit command, environment and input-root identities
offer a useful remote-execution model. Cargo's runner configuration and the Remote Execution API supply these
patterns respectively. Adopting an entire remote scheduler, CAS service or RPC deployment would add requirements
that ordinary local adapters and existing team infrastructure do not share. [Cargo runner][cargo], [REAPI][reapi]

The considered alternatives are per-declaration wrapper commands, provider-specific execution inside ARC, and one
generic execution adapter. The generic adapter preserves project declarations while allowing concrete execution
systems to provide transport, preparation and resource admission.

## Decision

We use one provider-neutral execution boundary for eligible declared checks. Projects retain ordinary command and
shard declarations. A machine configures its adapter with a literal argv array at `checks.runner` in
`~/.arc/config.yml`; a check opts in with `runner: true`. This setting remains local to that person and machine.
It does not require moving existing identity or user preferences, and does not synchronize through notes or the store.

ARC owns selection, fixed source and explicit environment-input definitions, complete invocation plans, native outcome
interpretation and reusable pass publication. Adapters materialize and prepare those inputs, select execution
capacity, enforce admission and report individually attributable execution outcomes. ARC supplies one common input
basis; an adapter does not independently recapture the live original checkout for each sibling.

Use one per-check `environment_inputs` map to declare literal values and environment-bound files. Capture absence,
empty values and file bytes explicitly, applying the captured bindings before probes and execution. Worker ambient
values do not replace a caller's declared selection. File bindings name content rather than original host paths;
the adapter rebinds them to materialized files. Derived execution coordinates remain engine-owned.

ARC presents a self-contained source-root artifact with actual captured execution bytes and required code-only Git
coordinates. Adapters need not understand its internal object encoding. Preserve byte presentation under filters,
LFS and line endings; an unsupported capture refuses rather than substituting different executable inputs. Concurrent
invocations use independent writable views or serialize their shared writers. Immutable dependencies may be shared,
but aliased mutable cache/report paths do not become isolated merely because their callers have different cwd paths.

An adapter must establish that it executed the requested source before its result can count. Reuse additionally
requires an applicable execution-runtime identity; an unknown runtime disables reuse rather than substituting a
caller-local fingerprint. Captured-source validation and reusable dependency scope remain distinct. Unrelated
repository files, attempt IDs and temporary paths do not become cache dependencies merely because a whole source
root was transported. `checkContentKey`'s declared-input model remains the basis of that scope.

The public contract supports a single invocation and optional grouped submission using the same generic invocation
records. ARC expands declarations and accounts for the complete expected set. Native commands retain their own
partition and completion semantics, including qualified empty shares and valid selection no-ops; adapters do not
interpret test-framework reports. A completed failure remains visible when another invocation is unavailable, and
missing required work cannot produce a successful parent pass.

Report terminal execution outcomes as they arrive, separately from output notifications, and finish grouped execution
with settlement and expected-ID closure. If the conversation fails, ARC retains already-observed native failures and
reports the remaining work as incomplete. Human output is not a substitute for terminal execution evidence.

The adapter owns local-versus-remote placement and fallback. With no configured adapter, ARC retains native,
unsharded execution. A configured adapter may execute locally under its own policy, but ARC does not bypass a runner
that cannot start or obtain a result. Required placement therefore remains effective. A transport failure after
launch is uncertain execution, not proof that work stopped or permission to launch a replacement.

ARC owns the execution lifetime boundary; the adapter implements settlement and disposal of resources it allocates.
Already-started siblings initially finish after a check failure so their results can be collected. Interruption
requires settlement. Required outputs must be collected and launched work settled before releasing workspaces;
failure to delete an otherwise finished disposable directory is an advisory cleanup problem. An acknowledgement of
cancellation is not settlement. Retain a capture that uncertain work may still use, with the adapter's recovery
diagnostic, rather than inferring that lost transport stopped its children.

Execution contexts and pass caches remain disposable machine-local resources, separate from durable review,
delivery and lifecycle state. Runners do not require ARC store refs, Git notes or live personal projections.
Projected-state selection checks, index-certifying checks and fixers retain their owning-checkout execution path.
This boundary composes with ADR-035 without depending on the storage cutover. [Storage direction][adr-035]

The wire design uses a run-scoped adapter subprocess with JSON-RPC envelopes over newline-delimited stdio,
covering preparation, ARC's optional cache lookup, execution and release. Group execution is an application operation,
not generic RPC batching. The logical lifecycle is settled; exact message schemas belong in the implementation
specifications and production qualification verifies that implementations honor this contract.

## Consequences

### Positive

- Teams can use their own execution infrastructure through one contract, keeping project check commands portable.
- Existing execution systems can supply placement and capacity without ARC duplicating a scheduler or inventory.
- Actual source and runtime identities govern result meaning and reuse, preserving declared dependency scope.
- One lifetime and outcome model covers single commands and distributed siblings while retaining native semantics.
- The machine-local configuration choice can ship independently and be consumed by the broader configuration model.

### Negative

- An argv-prefix wrapper alone cannot implement the relocated-input and evidence contract; adapters need protocol,
  source, runtime and settlement support. A small local reference adapter must demonstrate the practical burden.
- Capturing inputs and preparing execution environments adds cost. Qualification must measure that overhead and the
  cost of establishing runtime identity before a would-be cache hit.
- Unknown execution-runtime identity prevents reusable pass lookup, even when the live execution can return a valid
  result for known source. Lost execution conversations require explicit incomplete-result diagnostics and recovery.
- Compatible source presentation needs qualification for filters, LFS, line endings and execution-platform argument
  limits. A simple Git-tree transport probe does not establish those properties.

### Qualification and acceptance

Qualify the public contract with a small independent local adapter and the personal arc-offload adapter, using the
same boundary available to other teams. Arc-offload remains external tooling, with no privileged path or required
installation. The distributed consumer additionally qualifies common sibling inputs and complete parent outcomes.

Keep this ADR Proposed through implementation. At implementation closeout, reconcile approved changes and the
contract's actual qualification evidence, then mark it Accepted. Architectural decisions settle before implementation;
the delayed status change preserves room for documented implementation learnings rather than deferring design.

**Qualification (2026-10-27):** `prepareSelectedCheckExecution` implements the version-one subprocess boundary;
the package README publishes its wire and lifetime contract without requiring a private SDK. The packed standalone
example and external arc-offload revision `29ac002` qualify that same boundary. Both advertise mandatory singles
without grouped execution. Declaration-driven distributed orchestration and parent-result reduction remain unshipped
consumers; declared CI shards retain native, workflow-owned playback.

Qualification covers captured source/history and explicit bindings, refused preparation and repaired retry, native
failure, cancellation/EOF, UUID settlement and actual mutable cache-file identities. Independent standalone writers
overlap; external qualification also exercises serialized writer turns. Repository adoption uses ordinary commands
with the live placement policy retained. `resolveArcRoot` distinguishes machine-only configuration from a project,
including a real project at the configured home; identity and preference migration remain outside this reader.

The external adapter reports unknown runtime. `composePreparedCheckKey` excludes unknown execution environments from
reusable lookup and publication. The example defaults to unknown; `qualifyNodeRuntime` optionally qualifies its own
Node executable, supported startup policy and exact probes, with revalidation before execution. This supplies no
general dependency-environment qualification.

Both concrete adapters are qualified on Linux with `/proc` identities and supervised process groups. Commands must
keep descendants in those groups; independently detached sessions need stronger provider containment. External
ownership records and minimal recovery packages remain machine-local after finished inputs are removed, outside the
legacy pruner. They add no durable review, delivery or lifecycle authority.

The standalone implementation is four JavaScript files totaling 510 lines. Reproducible fixture measurements in
`notes-machine-check-runner.md` distinguish capture, preparation, execution and release, with their precision limits.
Known hits still incur capture and preparation; unknown runtimes execute every selected request. These costs and the
provider's recovery burden are accepted consequences of qualifying inputs and lifetime before reusable evidence.

**Correction (2026-10-27):** The 510-line figure above predates later review fixes to the standalone example, whose
four files now stay under 600 lines. The package and example READMEs state that bound instead of an exact count.

---

[cargo]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[adr-035]: adr-035-keep-operational-state-in-repository-refs.md
