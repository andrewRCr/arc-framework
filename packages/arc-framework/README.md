# ARC check runners

ARC project checks keep ordinary commands. A machine-local adapter can execute eligible checks in a container, a remote
pool or a resource-controlled local process. ARC captures inputs, fixes the invocation plan and interprets native
results. The adapter owns dependency preparation, admission, placement, execution and settlement.

## Configure a machine and opt in a project check

Put the flat `checks.runner` key in `~/.arc/config.yml`, under the operating system's user-home directory:

```yaml
checks.runner: ["team-check-runner", "--profile", "development"]
```

The first string is a nonempty executable. Subsequent strings are literal arguments, including empty arguments. NUL
characters are rejected. ARC does not expand shell syntax, environment variables or tildes. A bare executable resolves
through PATH; an absolute path stays absolute. A relative executable with a directory component resolves from the
machine configuration directory. ARC starts the adapter without a shell, with the repository root as its cwd.

The setting belongs to this machine file. It has no project YAML or Git-config override. Other machine keys remain
outside this reader's ownership. ARC does not rewrite or migrate the file.

Declare eligibility in the repository's `.arc/system/arc-checks.yml`:

```yaml
checks:
  typecheck:
    command: ["npm", "run", "-s", "typecheck"]
    mode: project
    runner: true
    environment_inputs:
      CHECK_MODE: value
      CHECK_WEIGHTS_FILE: file
```

`runner` defaults to false. It expresses eligibility, not a provider name. `environment_inputs` defaults to an empty
map. Checks with `fixes: true`, `reads_index: true`, or `mode: selection` cannot opt in: they require their owning
checkout. Keep artifact-producing builds that update the caller checkout native. An adapter may prepare dependencies or
builds inside its disposable execution workspace.

A missing machine file, empty YAML document or missing key means unconfigured. Eligible checks then retain native cwd,
platform batching and ordinary unsharded execution. Unrelated native checks do not read the machine file. Malformed
YAML, unreadable files, nonmapping documents and null/scalar/empty runner values refuse eligible execution with a
repair or removal remedy. An executable that cannot start is unavailable. ARC never bypasses a configured adapter to
run locally. Removing the key disables the adapter. Invalid project opt-ins remain invalid even when no adapter is
configured.

## Explicit environment inputs

Names match `[A-Za-z_][A-Za-z0-9_]*`; case-insensitive duplicates are rejected. Each kind is exactly `value` or `file`.
ARC captures declared bindings once at actual dispatch, before runtime probes or commands, even when caching is off.
Commands, probes and batches share that frozen binding set.

| Kind  | Caller state         | Execution binding and identity                                                          |
| ----- | -------------------- | --------------------------------------------------------------------------------------- |
| value | Unset                | Remove worker ambient value; identity records absence.                                  |
| value | Set, including empty | Replay exact string; identity records the value.                                        |
| file  | Unset                | Remove worker ambient value; identity records absence.                                  |
| file  | Empty string         | Replay empty string; do not open a file.                                                |
| file  | Nonempty path        | Freeze regular-file bytes; rebind to a materialized copy; identity records byte digest. |

Resolve relative file paths against the check cwd. Follow a file symlink through its opened handle, verify regular-file
status with `fstat`, stream copying and hashing, and check opened-file stability. Unreadable, nonregular or changing
inputs refuse with retry guidance. An external file is supported because its bytes are explicitly declared. A zero-byte
file differs from an empty environment string. Original paths and materialization locations do not affect identity.

The adapter receives run-owned copies and must not reread the original host paths. If it cannot honor a literal value,
it reports unavailable. Forecast and dry-run expose names/kinds only; they do not capture values, paths, digests or
absence. Native execution and native CI playback use the same late capture/bind semantics, after workflow artifact
delivery. Routine diagnostics must not disclose values or file contents.

The following names, including all case variants, are reserved and forbidden as explicit bindings:

```text
ARC_CHECK_BASE
ARC_CHECK_TREE
ARC_CHECK_MERGED
ARC_CHECK_NOTICE
GIT_ALTERNATE_OBJECT_DIRECTORIES
GIT_CONFIG
GIT_CONFIG_PARAMETERS
GIT_CONFIG_COUNT
GIT_OBJECT_DIRECTORY
GIT_DIR
GIT_WORK_TREE
GIT_IMPLICIT_WORK_TREE
GIT_GRAFT_FILE
GIT_INDEX_FILE
GIT_NO_REPLACE_OBJECTS
GIT_REPLACE_REF_BASE
GIT_PREFIX
GIT_SHALLOW_FILE
GIT_COMMON_DIR
```

Before every routed command and probe, clear the repository-local Git names from caller- and worker-inherited execution
environments. Explicit replay cannot restore them. Any adapter-owned Git bindings must select only the prepared
source/code-object context. Native checked-index exceptions stay engine-owned and native. This is not a blanket `GIT_*`
ban: unrelated ambient variables and adapter control-plane configuration retain provider/native policy.

Clear all four inherited `ARC_CHECK_*` channels above. Install a fresh best-effort notice channel for each child. Apply
`commandContent` only when present: set tree, set base only when supplied, and set merged to space-joined IDs only when
nonempty. Otherwise leave those derived variables absent. Project commands and all probes omit `commandContent`.
Files-mode commands include it even with `pass_paths: false`. Source coordinates alone never authorize these bindings.

## Fixed source and its manifest

ARC supplies a readable run-owned source root. Worktree requests freeze tracked and nonignored untracked source,
including dirty bytes, deletions, executable permissions and literal symlink targets. Index/commit requests freeze the
selected code's faithful caller-side execution presentation rather than later live files. Required filters, LFS tools,
line endings, modes and links must be established faithfully or execution refuses with repair/keep-local guidance.
Ignored dependencies, generated artifacts and personal projections are not implicitly copied.

The adapter transports this root using its own mechanism; it must not independently recapture the caller checkout or
rerun checkout filters to substitute different bytes. Later edits to the original checkout cannot affect execution.
Capture detects enumerated-path, opened-file and coordinate changes; it does not claim atomic snapshots against all
possible concurrent writers. Unsupported kinds, unrepresentable paths/links and escaping source links refuse.

The root contains self-contained code-only `.git` metadata for HEAD, base, checked tree and merged coordinates and
their required history. It has no alternates or original-worktree dependency. Caller config, hooks, credentials, notes
and private operational refs are excluded. Object formats must be supported faithfully or refused explicitly.

The manifest is a separate readable file outside project source paths:

```ts
interface Coordinates {
  tree: string;
  head?: string;
  base?: string;
  merged: string[];
}
interface FileEntry {
  path: string;
  kind: "file";
  mode: number;
  digest: string;
  bytes: number;
}
interface SymlinkEntry {
  path: string;
  kind: "symlink";
  target: string;
}
interface Manifest {
  version: 1;
  coordinates: Coordinates;
  entries: Array<FileEntry | SymlinkEntry>;
}
```

Object IDs are lowercase hexadecimal SHA-1 or SHA-256 IDs (40 or 64 characters). Missing HEAD means verified unborn
repository state, not a failed revision read. `merged` order is retained. File bytes are raw presentation bytes, not
canonical Git blobs. File modes are integer permission bits from 0 through octal 7777; byte counts are nonnegative
integers. A digest is `sha256:` followed by exactly 64 lowercase hexadecimal characters.

Entry paths are unique, valid UTF-8, slash-separated relative names with no empty, `.` or `..` component and no `.git`
component. Preserve literal names without Unicode normalization. Sort entries by UTF-8 path bytes, not UTF-16 or locale
ordering. Windows capture rejects catalog backslashes before native path interpretation; POSIX backslashes remain
literal filename characters. Routed cwd must remain contained lexically and through directory links; `.` means root.

Canonical encoding is UTF-8 JSON without whitespace or trailing newline, equivalent to `JSON.stringify` of these fields
in this exact order: `version`, `coordinates`, `entries`; coordinates `tree`, optional `head`, optional `base`,
`merged`; file entry `path`, `kind`, `mode`, `digest`, `bytes`; symlink entry `path`, `kind`, `target`. Omit absent
optional fields. Hash that encoding with SHA-256. Generated pack names or administrative timestamps do not define
source identity.

Verify canonical bytes/digest, coordinate agreement, every entry's bytes/mode or literal target, spelling and
containment before confirming source identity. Verify frozen inputs before every invocation. Preserve source absence as
well as listed inputs: a previous command's new source files cannot silently become another command's inputs.
Isolate/reset writable views or refuse execution. Provider-generated dependencies/outputs are allowed when they do not
replace frozen inputs or create concurrent mutable-writer sharing. Separate cwd directories alone do not isolate
aliased caches/reports.

### Exact cross-language encoding vectors

Each fenced JSON line below is the exact encoding, with no final newline included in the digest. The first vector tests
literal JSON escaping, UTF-8 ordering across supplementary characters, file modes and symlink targets. The second tests
unborn coordinates with SHA-256 object IDs. These are encoding vectors, not executable repository fixtures.

**unicode**

```json
{"version":1,"coordinates":{"tree":"1111111111111111111111111111111111111111","head":"2222222222222222222222222222222222222222","base":"3333333333333333333333333333333333333333","merged":["5555555555555555555555555555555555555555","4444444444444444444444444444444444444444"]},"entries":[{"path":"links/current","kind":"symlink","target":"../"},{"path":"quote\"\\é\nname","kind":"file","mode":384,"digest":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","bytes":0},{"path":"","kind":"file","mode":420,"digest":"sha256:06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8","bytes":2},{"path":"𐀀","kind":"file","mode":493,"digest":"sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb","bytes":1}]}
```

Digest: `sha256:1d4b1b9589752bf95137063ff3f9f0b1f49fb7a2368b6bfb1fb1f5d9dc5c7e60`.

**unborn-sha256**

```json
{"version":1,"coordinates":{"tree":"6666666666666666666666666666666666666666666666666666666666666666","merged":[]},"entries":[]}
```

Digest: `sha256:b3b16bee2f8b11f0d343309ce65cffedf9f42526f1160e3a4830600e51d010b1`.

The whole-source digest validates transport integrity. It is not a blanket reusable-pass dependency. Reusable identity
retains declared inputs, global inputs, received paths and historical scope, augmented by relevant raw presentation,
explicit bindings and qualified runtime/probe identity. Unrelated transported content, temporary locations, plan IDs,
queue policy, worker labels and arbitrary storage versions must not broaden that scope.

## Protocol version 1

Start one adapter subprocess per selected routed check and keep one conversation through preparation, cache lookup,
execution and release. Exchange UTF-8 newline-delimited JSON-RPC 2.0 objects on stdin/stdout. Embedded newlines are
JSON escapes; ARC refuses an adapter line longer than 128 MiB. Stdout is protocol only; stderr is adapter diagnostics.
RPC batch arrays are unsupported.

ARC assigns unique nonempty string RPC request IDs. Replies echo an outstanding ID and carry exactly one `result` or
`error`; notifications omit the RPC ID. Errors have integer `code`, nonblank `message` and optional `data`. Standard
JSON-RPC parse/request/method/parameter errors describe protocol faults. Placement unavailability and native nonzero
commands are ordinary application results. Unsupported operations, malformed payloads and conflicting identities fail
protocol validation. Objects have only their documented fields.

```json
{"jsonrpc":"2.0","id":"rpc:0","method":"check/prepare","params":{}}
{"jsonrpc":"2.0","id":"rpc:0","result":{}}
{"jsonrpc":"2.0","id":"rpc:0","error":{"code":-32602,"message":"Invalid params"}}
{"jsonrpc":"2.0","method":"check/recovery","params":{}}
```

The empty payloads above illustrate envelopes only. The following records define actual required payloads. Type aliases
use plain JSON strings/numbers; IDs are opaque nonempty strings except `planId`, a fresh random UUID for each attempt.
Context/invocation/probe handles are conversation-scoped correlations, not cache identities. Source and file paths are
readable caller-side transport handles. A new explicit retry always receives a new UUID.

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
interface Probe { id: string; argv: string[]; cwd: string }
interface PrepareParams {
  protocolVersion: 1;
  planId: string;
  source: { root: string; manifest: string; digest: string; coordinates: Coordinates };
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
  | { status: "unavailable"; planId: string; reason: string; remedy: string; settled: true };
type TerminalOutcome =
  | { status: "completed"; exitCode: number; notice?: string; notRunReason?: string }
  | { status: "unavailable"; reason: string; remedy: string }
  | { status: "cancelled"; reason: string };
```

The first request is `check/prepare`. Unsupported versions refuse before check execution. ARC supplies the complete
ordered plan before placement. Nonshell argv begins with a nonempty executable followed by literal arguments; shell
argv has exactly one command string, including an intentionally empty string if declared. No argv member contains NUL.
Do not infer shell intent from punctuation. Preserve path order, `pass_paths` behavior, argv, cwd and shell policy. ARC
budgets complete final commands against both POSIX bytes and conservative Windows escaped UTF-16 limits. Placement
cannot repartition batches, append undeclared consumer arguments or substitute an unsharded command.

Global probes use source root; check probes use check cwd. All probes are nonshell and omit `commandContent`.
Invocation IDs are unique; probe IDs are unique across both probe lists. The two namespaces may contain the same opaque
string.

For known runtime, each invocation has exactly one binding containing every requested probe exactly once. `identity` is
a stable digest of the actual toolchain/platform/dependency environment applicable to that invocation. A provider
guarantee may bind eventual execution without allocating a worker, but must cover the actual executor and probes. Probe
stdout is exact decoded Unicode, without trimming. Failed/unavailable probes or undecodable/incomplete coverage require
unknown runtime, disabling lookup/publication while still permitting compatible live execution. Malformed claimed-known
coverage is a protocol error. Never substitute local caller probes for executor evidence.

Known qualification must remain applicable through launch. If placement, fallback or dependency preparation changes it,
report unavailable before launching affected work. Do not execute under a different environment and claim the old
identity. Unknown runtime still requires fixed source and explicit bindings.

### Operations and notifications

| Method           | Request params               | Result                                        |
| ---------------- | ---------------------------- | --------------------------------------------- |
| `check/prepare`  | `PrepareParams`              | `PrepareResult`                               |
| `check/run`      | `{contextId, invocationId}`  | Settled run result below                      |
| `check/runGroup` | `{contextId, invocationIds}` | Settled run result below                      |
| `check/cancel`   | `{planId, contextId?}`       | `{planId, accepted:true}`                     |
| `check/release`  | `{contextId}`                | `{contextId, released:true, cleanupWarning?}` |

```ts
interface SettledRunResult {
  contextId: string;
  settled: true;
  outputComplete: true;
  invocationIds: string[];
}
interface RecoveryParams { planId: string; instructions: string }
interface OutputParams {
  contextId: string;
  invocationId: string;
  stream: "stdout" | "stderr";
  dataBase64: string;
}
interface OutcomeParams { contextId: string; invocationId: string; outcome: TerminalOutcome }
```

`check/run` is mandatory. Groups are optional and require `capabilities.runGroup:true`; otherwise consumers run fixed
singles sequentially through the same context. Group ID lists contain unique planned IDs. Only one execution request is
outstanding per context; cancellation may overlap it. Each planned invocation is requested/executed at most once.

Before accepting ready, ARC must receive one matching `check/recovery` notification with nonblank actionable
instructions for inspecting and settling preparation/execution by its caller-known UUID after adapter exit. Associate
provider work with that UUID before launch. Fully write and flush recovery before ready and before dispatching any work
that may outlive the conversation, including preparation. Failed recovery delivery permits no such launch. A settled
no-work preparation refusal may omit recovery. Stderr and a cancellation acknowledgement cannot substitute for
recovery.

During execution, send `check/output` notifications containing base64 bytes, at most 64 KiB decoded per chunk. Preserve
byte order within stdout and within stderr. Standard padded or unpadded base64 is accepted; invalid encodings, nonzero
unused padding bits and oversized chunks refuse. Binary output remains bytes on the wire and has no control authority.

Send exactly one immutable `check/outcome` notification per requested invocation as soon as its terminal result is
known. Completed exit codes are exact unsigned 32-bit integers from 0 through 4294967295. Preserve Windows DWORD bits,
including 256 and high-bit values; do not truncate to one byte or narrow to signed integers. POSIX signals retain
native shell-style numeric status. Zero alone means native success; declared no-evidence and killed-status
interpretation remain ARC's responsibility. A declared no-evidence status reports no evidence rather than a pass.
Status 137 means killed before completion unless declared as no evidence. A completed native failure remains a failure
beside later unavailable or missing work; incomplete work without a completed failure cannot pass. Later cancellation
cannot replace an already completed native failure.

A best-effort per-child notice may accompany completion. Read nonzero `not run:` notice markers as `notRunReason`; a
zero exit with that advisory is not unavailable. Bound/redact routine notices appropriately. Notices, logs and human
output are diagnostics, never terminal-result evidence.

The run reply follows all required output, terminal notifications and settlement of launched work. Its invocation ID
set equals the requested set exactly, with one terminal notification already retained for each. It supplies no
replacement outcomes. `outputComplete:true` certifies complete required execution-output collection/delivery, not
adapter stderr, parent terminal display or optional local report persistence. If required output is lost, fail rather
than claiming true; retain already observed outcomes. No framework test counts, report paths or shard grammar belong in
this protocol.

### Closure, interruption and recovery

The normal sequence is capture, prepare, optional reusable lookup, execution, settlement, release and drained exit
zero. A reusable hit omits execution but still releases/closes the prepared context. ARC alone publishes reusable
passes after all required outcomes/output/settlement and normal closure. Best-effort report/pass persistence errors do
not erase otherwise valid completed results.

A ready context closes only after its release reply, drained streams and adapter exit zero. Cleanup-only trouble uses
`cleanupWarning` and exit zero after settlement; it remains advisory. Do not release/remove inputs while children,
remote descendants or required output still use them. Ordinary failures drain remaining already-started work.

Settled unavailable or cancelled preparation grants no context. Clean its owned resources, return the unavailable arm,
then drain/exit zero without release. ARC closes stdin and waits for exit. A pending cancel acknowledgement does not
hold this terminal closure; a valid late acknowledgement is accepted. A started adapter disappearing without proven
settlement/normal closure is uncertain even if no check outcome arrived. Never-started execution is unavailable.

Cancellation acknowledges receipt only. Before context, use plan UUID; after ready, include context. The outstanding
prepare/run request must still settle. Stdin EOF has the same descendant/output settlement obligation. A second
explicit interruption may terminate the local adapter, but does not prove remote work stopped. A third stops ARC
without waiting and names the retained plans.

On POSIX, ARC starts the adapter in its own session and process group, so a terminal interrupt reaches ARC alone and
becomes cancellation. On Windows the adapter shares ARC's console and also receives Ctrl+C; it must not exit before the
outstanding request settles.

After transport loss, retain source and explicit files plus UUID/context, adapter location and recovery instructions.
Inspect and settle provider ownership before removal or fresh retry. ARC does not reconnect automatically, race local
and remote execution, or launch replacement work after uncertainty. Admission, capacity, resource limits, dependency
preparation and compatible fallback remain provider-owned. A configured adapter may decline placement; ARC does not
silently bypass it. Any provider fallback must preserve fixed inputs and applicable qualification and execute each
planned invocation at most once.

## Run or adapt the standalone example

The [standalone local example][local-example] uses only Node builtins and sibling modules. Implementers in any language
can consume the JSON protocol; no installed Node SDK or framework-private imports are required.

```yaml
checks.runner: ["node", "/absolute/path/to/examples/check-runner/local.mjs"]
```

The example supports Linux `/proc` and POSIX process groups. Unsupported platforms receive settled preparation refusal.
Commands must keep descendants in the supervised group; independent sessions need stronger provider containment. Heavy
checks need launcher-owned admission/resource controls; children inherit CPU priority, affinity and OS limits. The
example runs singles serially, advertises `runGroup:false`, imposes five minutes per command/probe and caps retained
probe stdout at 1 MiB. It installs no dependencies. It verifies original source inventory, explicit files and Git
administration before each invocation, refusing mutations rather than resetting the view. All planned command
directories must already exist.

Default runtime is unknown. `--known-node-runtime` covers only the example's Node executable and supported Node startup
policy; other tools, custom module paths and unsupported options remain unknown. It hashes the executable/platform/
architecture/component versions/options, runs actual probes and repeats qualification before a known invocation.

```sh
node /absolute/path/to/local.mjs --inspect PLAN_UUID --state-root /absolute/state/root
node /absolute/path/to/local.mjs --settle PLAN_UUID --state-root /absolute/state/root
```

Recovery notifications provide the exact command. The default state root is `~/.cache/arc-local-check-runner`;
`--state-root` chooses another absolute directory. Preparation refuses a root that is not a directory owned by the
current user and writable by no one else. Private attempt records identify ownership, not
reusable passes. Supervisors record identity before accepting work, stop process groups on cancel/EOF and await
descendants even after the original process exits or closes pipes. Termination escalates after one second. Inspect must
report settled before retained captures are removed; recovered leftover records may then be removed manually.

Measured from the four shipped `.mjs` files, the example comprises 557 lines and 32,382 bytes: conversation 175 lines /
10,541 bytes; input verification/environment 188 / 11,113; process/recovery 158 / 8,446; runtime qualification 36 /
2,282. These counts include comments and blank lines, exclude this guide, and describe implementation size rather than
runtime cost or a minimum adapter size. Deployment, remote transport and provider-specific dependency qualification are
additional implementation responsibilities for providers that need them.

---

[local-example]: examples/check-runner/README.md
