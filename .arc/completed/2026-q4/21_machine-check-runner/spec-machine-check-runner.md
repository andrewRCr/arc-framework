# Spec (`detailed` · `RFC`): machine-check-runner

- **Origin:** [internal]
- **Purpose:** Execute eligible project checks through a machine-configured, provider-neutral adapter while
  preserving declared inputs, native verdicts and sound reusable passes. Teams retain ordinary check commands;
  their execution tools own placement and resource admission.

---

## Introduction / Context

Project declarations describe what to check. A developer's machine may need containers, a remote pool or local
resource controls to execute those commands. Encoding a provider executable into every declaration couples the
repository to one installation and can obscure the environment that produced a result.

`runDeclaredCliRequest` in `packages/arc-framework/src/handlers/check/run-cli.ts` currently binds command execution
and runtime probes to `runCheckProcess`. `executeSelectedCheck` in `src/handlers/check/run.ts` computes the reusable
key and looks for a pass before executing batches. A wrapper that relocates only the command therefore does not
establish that those local runtime observations describe the executor. Source paths below use the same package root
unless explicitly qualified.

The design introduces one configured subprocess boundary. ARC fixes inputs, plans invocations and interprets outcomes;
the adapter materializes the inputs, prepares dependencies, admits work and executes it. The boundary supports a
single command and optional grouped submission without teaching ARC a scheduler or any provider's inventory.

This remains one cohesive concern: machine configuration, fixed inputs, dispatch and reusable single-check evidence
must work together for ordinary check commands to relocate correctly. Grouped submission is a generic protocol
capability; declaration-driven shard orchestration and aggregate shard evidence are outside this implementation.

## Goals

1. Connect independent execution systems without provider commands in project checks or a required provider install.
2. Execute the intended argv, cwd, shell policy, source presentation and explicit environment inputs.
3. Qualify reusable passes against the environment that will execute, without expanding declared dependency scope.
4. Preserve native outcomes and distinguish unavailable or uncertain work from completed command failures.
5. Settle launched work and required output before releasing resources, with actionable recovery after uncertainty.
6. Preserve native operation and compose with machine-local configuration and projected operational state.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No scheduler, machine registry, capacity model, transport service, daemon or durable distributed job database in ARC.
- No ARC fallback modes, local-versus-remote races or implicit bypass around a configured adapter.
- No shard expansion during ordinary check execution, native test partitioning or reusable aggregate shard result.
- No relocation of fixers, index-certifying checks, projected-state selections or caller-checkout artifact producers.
- No gate-wide source snapshot, artifact-lock redesign, fairness policy or general environment/secret synchronization.
- No identity migration, global preference rewrite, project runner override hierarchy or configuration writer.
- No durable review/delivery evidence changes, lifecycle writes, remote ARC projections or dependency on storage cutover.
- No new test-report grammar in the protocol and no dependency on arc-offload inside ARC's installed runtime.

## Proposed Design

### 1. Machine configuration and project eligibility

Read the flat key `checks.runner` from `~/.arc/config.yml`, using the operating system's user-home directory. The
setting is a nonempty array of strings: its first member is a nonempty executable and its remaining members are
literal arguments, including intentionally empty arguments. Reject NUL characters. Do not expand shell syntax,
environment variables or tildes in these strings.

```yaml
checks.runner: ["team-check-runner", "--profile", "development"]
```

A bare executable name resolves through PATH. An absolute executable path stays absolute; a relative path with a
directory component resolves from the configuration file's directory. Launch the adapter without a shell. Its cwd
is the repository root; checks themselves use the captured-root-relative cwd in their invocation plan.

Missing file, empty YAML document or missing key means unconfigured. Removing the key disables runner use. An empty
array, scalar string, null runner value, unreadable file, malformed YAML or nonmapping document is a configuration
refusal when a selected eligible check needs the setting. Diagnose the file and field and explain removal or repair.
Do not launch the check locally in response. Leave other global keys outside this reader's ownership; it does not
write the file, migrate identity or require other settings to move. Unrelated native checks need no global-file read.

Add boolean `runner` to ordinary check declarations, default false. `runner: true` expresses eligibility, never a
provider name. Reject true together with `fixes: true` or `reads_index: true`, and reject runner opt-in for
`mode: selection`. The refusal explains the owning-checkout requirement and removal of the opt-in. Keep caller
artifact-producing builds unmarked; preparation inside an adapter's disposable workspace is a separate operation.

When no runner is configured, eligible checks retain native execution, current cwd and ordinary unsharded command
behavior. A configured runner affects only selected eligible checks. Invalid declarations remain invalid even on an
unconfigured machine. A configured executable that cannot start is unavailable execution with a repair/retry remedy.

Use a narrowly scoped machine-file reader alongside the existing project configuration readers. Do not add this key
to project YAML or Git-config precedence. `resolveGitConfigOverride` in `src/lib/config/resolve-override.ts` retains
its existing settings ownership. Validate this new reader with the existing YAML and Zod dependencies.

### 2. Explicit environment values and files

Add the following optional per-check map, default empty:

```yaml
environment_inputs:
  CHECK_MODE: value
  CHECK_WEIGHTS_FILE: file
```

Names follow `[A-Za-z_][A-Za-z0-9_]*`; reject case-insensitive duplicates for portable execution. Values are exactly
`value` or `file`. Reject bindings for `ARC_CHECK_BASE`, `ARC_CHECK_TREE`, `ARC_CHECK_MERGED`, `ARC_CHECK_NOTICE` and
the complete native repository-local Git environment set, including case variants. These names govern derived
execution channels or cwd-scoped repository selection; explicit value/file replay must not override that boundary.
The refusal names the declaration field and reserved binding, directs removal of that binding and provides the
retry route. Removing it must leave ordinary supported inputs and captured-source execution reachable.

The Git set is `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`,
`GIT_OBJECT_DIRECTORY`, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_IMPLICIT_WORK_TREE`, `GIT_GRAFT_FILE`, `GIT_INDEX_FILE`,
`GIT_NO_REPLACE_OBJECTS`, `GIT_REPLACE_REF_BASE`, `GIT_PREFIX`, `GIT_SHALLOW_FILE` and `GIT_COMMON_DIR`. Reuse/expose
the existing `GIT_REPOSITORY_LOCAL_ENVIRONMENT` / `environmentForGitCwd` authority in
`src/lib/git/process-executor.ts` for reserved-name validation and child-environment scoping, rather than maintaining
independent runtime lists. The adapter guide must state this complete policy for implementations in any language.

Capture once at actual dispatch, before runtime probes and commands, regardless of whether caching is enabled:

| Declaration | Captured caller state  | Child binding and reusable identity                                                       |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `value`     | Unset                  | Delete worker ambient value; key the name, kind and absence.                              |
| `value`     | Set, including empty   | Replay the literal value; key the name, kind and value.                                   |
| `file`      | Unset                  | Delete worker ambient value; key the name, kind and absence.                              |
| `file`      | Set to empty           | Replay an empty string; key explicit emptiness, without opening a file.                   |
| `file`      | Set to a nonempty path | Freeze regular-file bytes; rebind to a materialized path; key name, kind and byte digest. |

Resolve relative file paths against the check's cwd. Open the file, follow its symlink through the opened handle and
confirm a regular file with `fstat`; reject unreadable, nonregular or changing-during-read input with a capture retry
remedy. An external target is allowed because its bytes are explicitly declared. Stream copying and hashing rather
than retaining entire files in memory. A zero-byte file is distinct from an empty environment string.

Capture files into run-owned storage. The adapter receives those copies, never a requirement to reread original host
paths. Rebinding locations and original paths do not participate in reusable identity. Explicit values remain exact;
an adapter that cannot honor them reports unavailable rather than substituting its preferred selection. Apart from
the engine-owned channels and repository-local Git names above, undeclared ambient variables remain native/provider
policy. This governs execution commands and probes, not adapter control-plane configuration, and does not introduce
a blanket `GIT_*` ban or whole-process environment snapshot.

Apply the same small capture/bind helper on the native path, including native CI playback. It may create temporary
copies of declared files; it creates no source checkout or fan-out. Reuse one captured binding set across a check's
batches and probes, then dispose it after settlement. Keep existing fixer and checked-index behavior native.

Forecast and dry-run output contain declaration names and kinds, never captured values, paths or file digests.
They do not freeze absence before a CI job receives its artifacts. Capture from the execution step's environment
after artifact delivery. Do not print explicit values or file contents in routine notices or refusal messages.

### 3. Fixed source artifact

For a routed check, ARC produces a run-owned, self-contained source root bound to the request's resolved source
basis. A worktree-basis request freezes its actual materialized view: tracked files and nonignored untracked source,
including dirty bytes, deletions, executable modes and symlink targets. An index/commit-basis request captures that
selected code, never later live working-tree content. Materialize its faithful execution presentation on the caller
before freezing it; if that presentation cannot be established, refuse with a retry/keep-local remedy. This does
not change unconfigured native staged checks into isolated execution.

Ignored dependencies, generated artifacts and personal projections are not implicitly copied. Their preparation
belongs to the adapter, or they must be represented by an explicit declared input when applicable.

Record an ordered manifest of repository-relative paths, entry kinds, modes and file-byte digests or literal symlink
targets. Its digest identifies the materialized source presentation. Include the requested code coordinates and
self-contained code-only Git metadata for HEAD, base, checked tree and merge coordinates. The resulting `.git` must
resolve those objects and their required code history without an alternates path, linked-worktree pointer or other
dependency on the original machine. Do not copy caller Git config, hooks, credentials, notes, ARC store refs or
personal files. Support the repository's object format or refuse with a concrete unsupported-format remedy.

The descriptor supplies a separate readable manifest file; it is not inserted into the project's source paths. Its
public JSON shape is `{version: 1, coordinates, entries}`. Coordinates have `tree`, optional `head` and `base`, and
ordered `merged` object IDs; missing `head` means a verified unborn repository, never an unresolved read. Each entry
is `{path, kind: "file", mode, digest, bytes}` or `{path, kind: "symlink", target}`. Paths are unique valid UTF-8,
slash-separated relative paths outside `.git`, without empty, `.` or `..` components; modes are integer permission
bits and file digests cover raw bytes. Sort entries by UTF-8 path bytes. Reject unrepresentable names/links with a
keep-local remedy. Canonical manifest encoding is UTF-8 `JSON.stringify` without whitespace, using the field order
shown above and coordinate order `tree`, `head` when present, `base` when present, `merged`. The source digest hashes
that encoding. Generated Git metadata is validated by the required object coordinates and self-containment rather
than by packfile names or administrative timestamps. Document and test this encoding for non-Node adapters.

Preserve actual file presentation under clean/smudge filters, LFS and line-ending conversion for the selected basis.
A canonical blob ID alone does not prove that the command receives those bytes. Freeze the materialized bytes and
retain the code coordinates separately; do not run checkout filters on a worker and silently produce another view.
A source symlink that escapes the captured root cannot provide fixed inputs: refuse with a keep-local or
explicit-input remedy. Refuse unsupported file kinds or unrepresentable required links/modes instead of dropping them.

Check the enumerated paths, opened-file stability and code coordinates across capture. Refuse detected concurrent
changes with a retry remedy. Once capture succeeds, later edits to the original checkout must not alter execution.
This does not promise an atomic filesystem snapshot across arbitrary concurrent writers. The capture is the fixed
definition; the adapter must not independently recapture the original checkout.

Validate `check.root` both lexically and through resolved directory links. Its routed cwd must remain inside the
source root and becomes a slash-separated relative path, with `.` for the root. An escaping cwd gets a keep-local or
explicit-input-boundary refusal, rather than copying sibling directories or falling back locally.

The adapter receives a readable local source-root path and its digest, and copies or transports that root using its
own mechanism. It need not understand an internal Git-pack format. It confirms the requested source identity before
results can count, and preserves captured source inputs while preparing dependencies and writable outputs.
Verify manifest entries before each invocation. A prior invocation's writes cannot silently become the next one's
source: isolate/reset the writable view or report unavailable. Generated output outside the captured entry set is
permitted when it does not replace captured inputs or share concurrent mutable writers.

Source identity validates the whole artifact; it is not a blanket pass-cache dependency. Preserve the existing
declared input/global-input/received-path and historical-coordinate scope, augmented with raw-byte presentation and
the explicit environment inputs. Unrelated source or planning changes must not invalidate a scoped pass merely
because the transported root changed. Retain current divergence-based refusal of reusable keys.

### 4. Invocation planning and portable budgets

Construct an ordered, complete invocation plan before adapter placement. One invocation consists of an opaque ID,
literal argv, root-relative cwd, explicit shell boolean and optional engine-owned `commandContent`. A shell invocation
has a single command-string member in argv; a nonshell invocation has an executable followed by literal arguments.
Preserve path ordering and the declaration's `pass_paths` behavior. Do not infer shell intent from punctuation.

Export portable batching primitives using both existing budget calculations from `checkArgumentBudget` and
`batchCheckPaths` in `src/lib/checks/batching.ts`: every routed final command must fit both the conservative Windows
escaped UTF-16 budget and the POSIX byte budget. A fixed command or one path that cannot fit refuses planning with a
shorten-command/path remedy. Keep native platform budgeting for unconfigured execution.

The budget API accepts the complete fixed argv, including any final consumer-supplied arguments, before partitioning
paths. It does not expand shards here. `resolveCheckForecast` in `src/lib/checks/forecast.ts` currently appends shard
arguments after batching; a future shard consumer must use the final-argument primitive before forming its matrix.
Placement may not change the planned path partition or silently substitute one unsharded command.

Supply the plan plus global and check-specific runtime probes to preparation. Each probe has its own ID, argv and
root-relative cwd; run global probes from source root and check probes from check cwd. Probes use the captured
environment bindings too, but never carry `commandContent`. Probe output belongs to runtime qualification, not to
check terminal-outcome accounting.

### 5. Adapter protocol version 1

Start one adapter subprocess per selected routed check, using the configured literal argv. Keep one conversation
across preparation, cache lookup, execution and release. Use UTF-8 newline-delimited JSON-RPC 2.0 messages on
stdin/stdout; stdout contains protocol only, stderr adapter diagnostics. Embedded newlines are JSON escapes. RPC
batch arrays are unsupported; grouped execution is the explicit operation below. The first request is preparation
with `protocolVersion: 1`; unsupported versions refuse without executing checks.

ARC owns unique string request IDs. Replies match an outstanding ID and carry exactly one result or error. Notifications
have no RPC ID. Validate envelopes and operation payloads with exported Zod schemas. Unexpected identities, malformed
payloads, conflicting terminal outcomes or an unsupported operation are protocol failures, never successful checks.
Standard JSON-RPC parse/request/method/parameter errors describe protocol faults. Placement unavailability and
completed nonzero commands are normal application results, not RPC errors.

The following records define the public wire fields. Digests are `sha256:` followed by 64 lowercase hexadecimal
characters. ARC generates a fresh random UUID `planId` before launching the adapter for each attempt; an explicit
retry gets a new UUID. `contextId` and invocation/probe IDs are nonempty opaque strings scoped to this conversation.
These correlation handles are not cache identities. Relative cwd paths use source-root slash syntax and cannot
escape the root.

```ts
type CapturedBinding =
  | { kind: "value"; state: "unset" }
  | { kind: "value"; state: "set"; value: string }
  | { kind: "file"; state: "unset" | "empty" }
  | { kind: "file"; state: "file"; path: string; digest: string; bytes: number };

interface Invocation {
  id: string;
  argv: string[];
  cwd: string;
  shell: boolean;
  commandContent?: { tree: string; base?: string; merged?: string[] };
}

interface Probe {
  id: string;
  argv: string[];
  cwd: string;
}

interface PrepareParams {
  protocolVersion: 1;
  planId: string;
  source: {
    root: string;
    manifest: string;
    digest: string;
    coordinates: { tree: string; head?: string; base?: string; merged: string[] };
  };
  environment: Record<string, CapturedBinding>;
  probes: { global: Probe[]; check: Probe[] };
  invocations: Invocation[];
}

type QualifiedRuntime =
  | { kind: "unknown"; reason: string }
  | { kind: "known"; bindings: Array<{
      invocationId: string;
      identity: string;
      probes: Array<{ id: string; stdout: string }>;
    }> };

type PrepareResult =
  | { status: "ready"; planId: string; contextId: string; sourceDigest: string;
      runtime: QualifiedRuntime; capabilities: { runGroup: boolean } }
  | { status: "unavailable"; planId: string; reason: string; remedy: string;
      settled: true };

type TerminalOutcome =
  | { status: "completed"; exitCode: number; notice?: string; notRunReason?: string }
  | { status: "unavailable"; reason: string; remedy: string }
  | { status: "cancelled"; reason: string };
```

`source.root`, `source.manifest` and captured-file `path` name caller-side run-owned artifacts the adapter can read.
Verify the manifest digest, entries and matching coordinates before confirming source identity. Their locations
are transport handles, not child binding values or content identities. `bytes` is a nonnegative integer; verify
file bytes against the digest. Invocation IDs are unique; probe IDs are unique across both probe lists. A known runtime
binding contains every requested probe exactly once and covers every planned invocation exactly once. Probe stdout
is the exact decoded output with no trimming; undecodable output or a failed probe prevents known qualification.

`commandContent` is ARC's execution-environment policy, separate from source-object availability and captured caller
bindings. Populate it for files-mode commands, including `pass_paths: false`, using the existing `CheckContentContext`
shape from `src/handlers/check/run.ts`. Omit it for project commands and all probes. Before each child, clear
`ARC_CHECK_BASE`, `ARC_CHECK_TREE` and `ARC_CHECK_MERGED`. When content is present, set tree, set base only when
present, and set merged to the space-joined list only when nonempty; otherwise leave those variables unset. Never
infer this policy from argv, cwd or `source.coordinates`. Preserve existing scoped coordinate key semantics rather
than adding the full source or opaque IDs to keys.

Use a fresh execution-local notice channel per child, with the same best-effort availability and nonzero `not run:`
classification as `runCheckProcess`. Clear inherited `ARC_CHECK_NOTICE` before installing that channel. Clear
the complete native repository-local Git set from both caller- and worker-inherited environments for every routed
command and runtime probe, before applying engine-owned captured-context bindings. Use the shared authority from
§2; rejecting explicit bindings to those names prevents replay from recreating the overrides after filtering.
Any adapter-owned repository bindings must stay within the prepared source/code-object context and never select
another repository or original host paths. Native checked-index exceptions remain local and engine-owned;
index-certifying checks remain ineligible for routing. Unrelated ambient variables and adapter control-plane
settings retain their existing policy.

| Method           | Request params               | Result                                                                          |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `check/prepare`  | `PrepareParams`              | `PrepareResult`                                                                 |
| `check/run`      | `{contextId, invocationId}`  | Settled reply for that planned ID.                                              |
| `check/runGroup` | `{contextId, invocationIds}` | Settled reply for the unique requested planned IDs; optional capability.        |
| `check/cancel`   | `{planId, contextId?}`       | `{planId, accepted: true}`; acknowledgement only.                               |
| `check/release`  | `{contextId}`                | `{contextId, released: true, cleanupWarning?}` after required lifetime closure. |

A settled run reply is `{contextId, settled: true, outputComplete: true, invocationIds}`. Its ID set must equal the
request's expected IDs, each with one terminal notification already received. It supplies no replacement outcomes.
Single invocation is mandatory. Group requests require the advertised capability and may reference only the fixed
prepared plan. Without it, a consumer can submit planned singles sequentially through the same prepared context.
Only one execution request is outstanding per context; cancellation can overlap it. Each planned invocation executes
at most once in that context.

The adapter emits one pre-work notification:

- `check/recovery`: `{planId, instructions}`. Instructions are a nonempty actionable description of the adapter's
  documented inspect/settle procedure using that caller-known attempt UUID, covering preparation and execution.
  Fully write and flush this valid notification before a ready reply and before dispatching any preparation or
  execution work that may outlive the conversation. A failed notification write permits no such dispatch. Associate
  provider work with the plan ID before launching it; the procedure must remain usable after the adapter exits.
  ARC retains the received guidance for uncertain-execution diagnostics. A no-work settled preparation refusal may
  omit the notification. It is protocol data, not best-effort stderr; no acknowledgement or new ARC recovery command
  is introduced.

ARC validates its matching plan UUID and retains the instructions before accepting ready or submitting execution.
Missing or malformed recovery data cannot establish a valid ready context. Preparation work that may outlive the
conversation is already subject to the adapter's write-before-dispatch rule, including before a context exists.

During an execution request, it emits:

- `check/output`: `{contextId, invocationId, stream: "stdout" | "stderr", dataBase64}`. Preserve byte order within
  each stream; chunks must decode to at most 64 KiB. Decode for existing human logs without parsing it as control.
- `check/outcome`: `{contextId, invocationId, outcome: TerminalOutcome}`. Emit exactly one immutable terminal
  outcome per requested invocation as it becomes known, independently of the others. Completed exit codes are exact
  unsigned 32-bit integers from 0 through 4294967295. Preserve native status bits without low-byte truncation or
  signed narrowing; POSIX signal termination retains the native shell-style numeric convention. Zero alone denotes
  native command success. Existing declared no-evidence and special killed-status interpretation remain unchanged.

The final reply follows all required execution output, terminal notifications and settlement of work launched for
that request. `outputComplete` covers required execution output collection/delivery. It does not certify adapter
stderr diagnostics, parent terminal display or optional local log persistence, which remain best effort. If required
execution output cannot be collected completely, do not claim true: fail the request and preserve already observed
outcomes. No test counts, shard membership, report paths or native test-framework interpretation appear in these
messages. Optional short notices remain diagnostics; human output is never terminal execution evidence.

Normal closure has two arms. After granting a ready context, `check/release` replies and adapter exit zero close
that context. A settled unavailable preparation reply grants no context: the adapter sends that terminal reply and
exits zero without a release request. ARC drains protocol/output, closes its stdin and awaits exit zero before
disposing the capture. A cancel acknowledgement still pending at this terminal preparation settlement is not
required for closure; accept a valid late acknowledgement if it arrives. Missing settlement, abnormal exit or other
unexpected closure remains incomplete/uncertain execution.

A failure to remove an otherwise settled disposable directory uses `cleanupWarning` on the ready-context release
arm and exit zero; it does not invalidate the completed check. Neither arm permits cleanup while work remains active.

### 6. Runtime qualification and pass keys

Preparation establishes execution compatibility and source identity before lookup. A known runtime's `identity`
is a stable digest of the applicable prepared execution environment, not an adapter executable name, worker label,
temporary path or request token. It must bind the actual toolchain/platform/dependency environment that will execute
each named invocation. The adapter may use a provider guarantee instead of allocating a worker only when that
guarantee binds the eventual executor and requested probes. ARC trusts the explicitly configured adapter to implement
its contract; it does not introduce a remote attestation service.

Run declared global/check probes in the applicable execution environment with captured bindings before returning
their stdout. A failed or unavailable fingerprint probe or incomplete applicable environment coverage requires
`runtime.kind: "unknown"` with its reason, disabling reuse rather than substituting caller-local stdout. If source
and command compatibility are valid, unknown runtime still permits live execution; do not consult or publish a
reusable pass. A malformed claimed-known binding, including missing/duplicate/unexpected IDs, is a protocol failure.

For known runtimes, extend `checkContentKey` in `src/lib/checks/key.ts` with explicit environment identities,
scoped materialized-byte identities, applicable runtime identities and exact probe outputs. Preserve existing
declaration, selected content, global inputs, received paths and historical dependency semantics from
`resolveCheckKey` in `src/lib/checks/key-resolver.ts`. Version the disposable key representation instead of adding
migration readers. Native checks with an empty environment map retain their observable execution behavior.

Do not include the whole source digest, arbitrary store version, execution IDs, artifact paths, physical worker
names or queue policy in the reusable key. Changing captured file bytes, an explicit scalar value or actual runtime
must invalidate reuse; moving identical captured bytes to another path must not. Failure of scoped content reads or
existing divergent-content checks still means no reusable key.

A prepared known binding must remain applicable through execution. If placement, fallback or dependency preparation
would change it, the adapter must report unavailable before launching affected work; a later explicit retry obtains
fresh qualification. It cannot run under another environment and return success under the old binding. Unknown
runtime mode may place compatibly without reuse. Source identity and declared bindings remain mandatory in either mode.

Perform pass lookup only after these checks. On a hit, release the prepared context without running the check.
On live success, publish a pass only after complete required outcomes, output, settlement and normal adapter closure.
ARC owns that publication. Reports and contexts remain machine-local disposable execution resources.
Best-effort pass-store or local report persistence failure does not erase an otherwise valid completed check result.

### 7. Dispatch, cancellation and resource lifetime

The routed lifecycle is capture → prepare → optional reusable lookup → execution → settlement → release. A cache
hit omits execution. Settled preparation unavailability instead takes the no-context reply/exit closure arm, without
release. Track acquired contexts and captured artifacts through all normal and exceptional exits. Native execution
with no configured adapter omits source capture and this subprocess lifecycle.

The adapter owns admission, materialization, dependency preparation and compatible local/remote placement. Preparation
must preserve fixed source and explicit bindings. Concurrent invocations need independent writable views or
serialization of shared writers. Sharing immutable dependencies is allowed; separate cwd directories do not isolate
mutable cache/report paths aliased through the same dependency installation. No test-framework cache option enters
the protocol. An adapter may decline concurrent capability and run singles serially.

After an ordinary command failure, collect the remaining already-started work rather than cancelling it to hide
other outcomes. Explicit interruption sends `check/cancel`, including `planId` while preparation is pending and
`contextId` once known. An acceptance reply proves only receipt. The outstanding preparation or execution request
must still finish with its settlement evidence. Cancellation covers preparation children and all launched execution
descendants, including remote processes. An adapter receiving stdin EOF has the same settlement obligation.

Do not release a workspace while launched processes or required output may still use it. A source capture that
possibly remains in use survives loss of the conversation, along with an actionable diagnostic identifying the
plan/context, adapter and retained capture location. Use the pre-work `check/recovery` instructions and caller-known
plan UUID to inspect/settle preparation or execution, including when no context was returned. There is no automatic
reconnect, replacement execution or durable ARC job record. Recovery uses the provider's existing ownership and
lookup, not an ARC job database. Retain guidance with the diagnostic; it cannot depend on a settled refusal reply or
best-effort stderr to arrive after transport is lost. A second explicit interruption may terminate the local adapter
without proving remote settlement; retain the capture.

An unavailable preparation reply may say `settled: true` only after its own launched work is settled; it cleans up
any resources that were not handed out as a context, then follows the no-context normal closure above. Settled
cancellation during preparation uses that same arm. A started adapter that disappears without settlement/normal
closure is uncertain even if no check outcome arrived. A process that never started is unavailable without remote
uncertainty.

### 8. Native meaning and incomplete outcomes

Keep `finalizeCheckRun` in `src/handlers/check/run.ts` as the check-specific verdict authority, extending its input
to preserve structured terminal outcomes and incomplete-work detail. Retain declared no-evidence status, killed
execution semantics and existing notice classification. `checkEnvironment` and `readNotice` in
`src/lib/checks/process.ts` currently supply derived coordinates and classify nonzero `not run:` notices; native
execution retains those channels. The adapter applies `commandContent` only to execution commands and returns the
equivalent notice/result data without replaying stale caller channels. Source metadata alone never sets child
`ARC_CHECK_*` variables; project commands and probes keep the native absent-content policy.
`checkEnvironment` also calls `environmentForGitCwd`, which clears the complete repository-local Git set for a
cwd-scoped native child. Preserve that same repository boundary for routed commands and probes, including rejection
of explicit input replay that would bypass it; a valid source manifest alone does not scope a child's Git reads.

A completed native nonzero outcome is a command failure unless the declaration/native executor classifies it as
no evidence, killed or unavailable. Missing output, a native controller-close failure or unsettled work remains
substantive. A final cleanup-directory warning after real settlement is advisory. No universal tests-completed rule
is added: a native check may prove a valid selection no-op or empty assigned share, whereas all-skipped or unmatched
test selections keep their native nonpassing meaning.

For a check with several ordinary path batches, preserve completed failures even if another result is unavailable
or transport later fails. Retain terminal outcomes already received; final closure cannot erase or replace them.
No completed native failure plus missing required work yields `couldn't run` with incomplete detail. A completed
native failure plus missing work yields `failed`, with that detail alongside the failure. No incomplete set, wrong
source, unexpected/conflicting identity or missing settlement can publish a pass. Logs alone never prove failure.

The single-check foundation exposes per-invocation outcomes, runtime bindings and settlement to consumers. It does
not define shard success reduction or create per-shard durable records. Consumers must close their own complete
planned matrix and preserve this baseline rather than interpreting arbitrary console text.

### 9. Handler, forecast and native CI integration

Extend the injectable boundaries around `runDeclaredCliRequest` and `executeSelectedCheck` rather than embedding
provider branches in check-specific commands. Keep protocol parsing, source capture, environment capture, runtime
qualification and batch planning in cohesive library modules with filesystem/process dependencies injectable. Use
Node builtins, execa and Zod already in the package; add no network client, RPC framework or provider dependency.

`runCiCheckStep` and `runForecastCheck` in `src/lib/ci-check-runner.ts` currently play forecast batches through
`runCheckProcess`. Add names/types-only environment declaration metadata to `CheckForecast` and its parser, and use
the shared late capture/bind helper during this native playback. Read actual environment values after the workflow
delivers artifacts. Retain native CI placement, workflow-owned arguments and selected shard playback; this work does
not make a CI job invoke the machine adapter or add ordinary local shard expansion.
The forecast field is `environmentInputs`, containing the declaration's name-to-kind map. Require agreement with
the current selected declaration before capture; a mismatch refuses with a regenerate-forecast remedy.

For a selected eligible check with a configured adapter, forecast/dry-run must not start that adapter, allocate a
source workspace or probe its execution runtime. It may report eligibility, configuration disposition and binding
names. If routed reuse cannot be known without preparation, report that fact rather than presenting a caller-local
cached pass as applicable remote evidence. Ordinary native dry-run behavior remains unchanged apart from the
names/types metadata and does not capture explicit binding values/files.

Preserve current CLI outcome/exit-code conventions and selected gate deadlines. Expose actionable configuration,
capture, unavailable, protocol and uncertain-execution diagnostics in text and JSON without marking a check passed.
Use existing report and pass-store abstractions; `createCheckPassStore` / `checkRecordDirectory` in
`src/lib/checks/record.ts` remain separate from durable review and delivery records. No new lifecycle integration
boundary or state-projection reader is needed.

### 10. External qualification, documentation and closeout

Qualify two independent adapters through exactly this contract:

1. A small standalone local adapter using captured inputs and resource-controlled child execution. It implements
   mandatory singles, may advertise `runGroup: false`, and demonstrates both known and unknown runtime behavior.
2. An external arc-offload adapter integrating that personal tool's transport and admission. Required changes belong
   in its own repository. Demonstrate success, unavailable placement and runner-owned permitted local fallback;
   required remote policy must never be bypassed by ARC.

Neither gets private declaration fields, privileged hooks, provider selection inside ARC or different evidence rules.
Keep the example small enough to inspect and document its actual implementation burden. Provide the adapter guide
and literal configuration examples through the package README and the installed quality-gates strategy, with any
standalone example explicitly included in the package inventory. Keep the complete operation/schema and lifetime
contract accessible to teams; an SDK or Node implementation is not required to write an adapter.

Retire this repository's `scripts/check-runner.sh` provider discovery and command-prefix declarations only after
the new path qualifies. Replace those commands with their ordinary executable/arguments and appropriate eligibility
and explicit environment declarations. Keep formatters, index certifiers and local artifact producers local.
Retirement must retain the host's active runner placement policy through machine-local configuration and external
adapter preparation; do not change that policy to make qualification pass.

Include a final implementation task to reconcile approved implementation-time changes and actual qualification
evidence with `adr-039-use-provider-neutral-check-runners.md`, then mark it Accepted through the task's ordinary
review and commit. Keep it Proposed until that closeout. An architectural decision changes through an approved
forward amendment rather than editing pre-commitment into agreement with the implementation. Acceptance states any
still-unshipped optional consumers honestly; it does not certify their implementation.

## Alternatives & Rationale

- **Per-command provider prefixes:** Cheap lookup, but separate channels would still be required for fixed inputs,
  actual-runtime qualification and remote settlement. A prefix alone cannot satisfy the result contract.
- **A full remote execution service/CAS:** Explicit action identities are useful, but a service deployment and
  scheduler would burden local adapters and teams with existing infrastructure. A run-scoped subprocess composes
  those systems without making one an ARC prerequisite.
- **ARC-owned fallback modes:** Would duplicate provider admission and could defeat machine reservations. The
  configured adapter owns permitted fallback; missing configuration remains the explicit native default.
- **Separate processes for prepare/run/release:** Would require cross-process handle storage and recovery. One
  live conversation retains the check's context without a daemon or durable job database.
- **Caller-runtime keys or whole-root keys:** Caller observations can describe the wrong executor; whole-root
  hashing invalidates scoped evidence on unrelated edits. Qualify actual runtimes and hash only declared execution
  dependencies, while validating the complete transported source separately.
- **A second in-place routed mode:** Would add another input/lifetime contract and expose commands to live edits.
  All routed commands use captured inputs; unconfigured native execution retains its current behavior.

## Cross-cutting Considerations

### Trust and portability

Machine configuration explicitly authorizes an executable with the caller's privileges; ARC supplies no sandbox
claim. Repository declarations cannot select that executable. Captures exclude Git credentials and private state;
declared values/files are deliberately transmitted to the configured adapter. Do not expose their contents through
routine summaries. Validate adapter messages and source-root boundaries without introducing an attestation service.

Honor literal arguments and explicit shell intent across Linux, macOS and Windows. Provider-specific quoting,
remote delivery and process-tree settlement remain adapter responsibilities. Incompatible commands or source
presentations refuse visibly with a native/compatible-runner remedy; there is no implicit fallback.

### Performance and ownership

No configured adapter means no source capture, adapter process or new preparation cost. Explicit environment inputs
pay only their declared capture cost. Measure capture, dependency preparation, runtime qualification, execution and
release separately for cold/warm local and external adapters, including cache hits. Report that evidence rather
than promising preparation-free remote hits. Unknown runtime preserves correctness by executing without reuse.

Execution captures, contexts, reports and caches are machine-local disposable resources. They do not need store
refs, personal notes or an operational-state projection. A pre-cutover tracked planning file can be incidental code
tree content, but never lifecycle authority. Keep projected-state checks in their owning checkout and preserve
declared cache scope across unrelated store/projection changes. Re-ground integration against the landed storage
backend/projection when available; no cutover prerequisite or new lifecycle write is introduced.

### Testing and rollout

Use injected protocol/process/filesystem boundaries for focused lifecycle, result and key tests, plus executable
adapter conformance fixtures for real framing, signals and cleanup. Exercise actual filters, links and line-ending
presentation in disposable repositories. Include original-checkout edits after capture, malformed protocol, lost
transport after a completed failure, unavailable execution and successful retry after repair. Test optional group
schema/closure at the generic boundary without implementing declaration-driven shard orchestration.

Ship the foundation and example before converting the repository declarations. Qualify the external adapter against
the same protocol, then replace the old wrappers and verify the configured host policy. Clearing old disposable
passes is sufficient for changed key/schema representations; no development-cache migration or compatibility alias
is required. Changes remain source/config/protocol work, independent of operational-state cutover.

## Success Criteria

1. A team can configure a literal adapter argv and opt an ordinary check in without putting a provider command in
   its declaration. Missing configuration executes natively; invalid configuration/startup fails visibly with a
   successful retry after repair. Both independent adapters pass through the same public boundary.
2. Native execution without a runner retains cwd, command, fixer/index policy and unsharded behavior, with no source
   workspace or adapter spawn. Explicit bindings work natively and in CI after artifact delivery.
3. Routed commands receive their request-selected source bytes, modes, links and code coordinates. Index/commit
   requests never substitute later live content; post-capture edits do not change execution. Filter/LFS/line-ending
   and unsupported/escaping-input cases prove fidelity or actionable refusal.
4. Environment tests distinguish unset, empty, zero-byte file and nonempty file content; ignore worker ambient
   replacements; preserve literal values; rebind file paths; reject invalid/reserved names, including the complete
   native Git set and case variants, and unreadable/nonregular files. Forecasts expose names/types without prematurely
   freezing values or leaking contents. A reserved-binding refusal names the binding to remove and how to retry; the
   repaired declaration succeeds with ordinary permitted inputs rather than leaving a refusal-only path.
5. Reuse tests reject caller-runtime substitution and unknown/changed runtime bindings. Changed relevant source
   presentation, explicit values/files or actual tools invalidate a pass; unrelated content/store changes and
   identical file bytes at another host path do not. A cache hit releases its context without command execution.
6. Portable batching includes all final fixed arguments and satisfies both platform budgets. Literal argv, cwd, shell
   and path order survive adapter dispatch; incompatible execution refuses without changing the plan. Identical-argv
   project and files checks with `pass_paths: false` prove distinct derived coordinate bindings, and runtime probes
   prove cleared content variables. Notice/index channels never reuse original host paths. Conflicting
   second-repository `GIT_DIR`/`GIT_WORK_TREE`, object-directory/alternate-object and config overrides affect neither
   routed commands nor runtime probes. Explicit bindings cannot restore them; captured-source Git execution and
   ordinary permitted explicit inputs still succeed. Native checked-index behavior remains intact. Remove a rejected
   repository-selector binding and retry successfully, proving both commands and probes still select the captured
   repository under conflicting ambient overrides.
7. Protocol tests cover envelope/ID validation, streamed binary output, immutable terminal outcomes, optional group
   refusal and sequential singles, exact final closure, output completeness and both normal process-closure arms.
   Include settled unavailable/cancelled preparation, no release without a context and racing cancel acknowledgements.
   Fixtures and Windows qualification preserve statuses above 255, including 256 and high-bit DWORD values, as
   native failures without truncation; no-evidence/killed interpretations retain their existing precedence.
8. A completed native failure survives a later missing result or transport loss. Missing work without such failure
   is unavailable/incomplete; no incomplete/wrong-source/conflicting-result path records a pass. Native no-evidence,
   killed, valid no-op and controller-close meanings remain intact.
9. Cache hit and context-owning success, failure or interruption exercise release; settled preparation refusals use
   no-context closure. Cancellation acceptance alone never authorizes disposal; lost settlement retains the capture
   and recovery instructions. Settled-directory cleanup warnings are advisory. Cut transport after the pre-work
   recovery notification during preparation before a context exists and during execution; the plan UUID and received
   instructions still locate/settle work. A failed recovery write must launch no may-outlive child. Repair/retry paths
   never automatically duplicate ambiguous work.
10. Qualification records cold/warm and would-be-cache-hit costs for both adapters, while the unconfigured path
    proves absence of capture/preparation work. Concurrent writable views are isolated or serialized.
11. Repository check declarations use ordinary commands and eligibility after external qualification; the prototype
    wrapper is retired, the host's placement policy remains effective, and package documentation/examples expose the
    public contract without an arc-offload dependency.
12. At final implementation closeout, ADR-039 reflects approved changes and qualification evidence and is Accepted
    through ordinary task review. No durable lifecycle/review/delivery record or storage-cutover dependency was added.

## Open Questions

None blocking implementation. Internal module decomposition, source-root encoding/transfer optimization and fixture
organization remain implementation choices within the defined protocol, fidelity, lifetime and qualification rules.

---
