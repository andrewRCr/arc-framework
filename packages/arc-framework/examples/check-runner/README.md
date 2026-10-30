# Standalone local check runner

This independent executable implements ARC check-runner protocol version 1 using Node builtins and three sibling
modules. See the [public adapter guide][guide] for configuration, source-manifest encoding vectors, explicit inputs and
the complete wire/lifetime contract. Implementations in other languages require no Node SDK or ARC-private imports.

## Configure and run

Set the flat machine-local key in `~/.arc/config.yml`:

```yaml
checks.runner: ["node", "/absolute/path/to/examples/check-runner/local.mjs"]
```

Mark eligible repository checks with `runner: true` in `.arc/system/arc-checks.yml`, then run their ordinary ARC check
commands. The example reads JSON-RPC objects one per line on stdin; stdout contains protocol only. It consumes ARC's
captured root/files without recapturing the caller checkout. Singles are mandatory and supported; it advertises
`runGroup: false`.

This example requires Linux `/proc` and POSIX process groups. Other platforms receive a settled preparation refusal.
Commands must keep descendants in their supervised group; commands creating independent sessions need stronger provider
containment. For heavy checks, use launcher-owned admission and resource controls. Children inherit CPU priority,
affinity and operating-system limits. The example installs no dependencies, runs serially, limits each command/probe to
five minutes and retains at most 1 MiB of probe stdout.

Sequential invocations share a captured view. Before each invocation, the example verifies original source inventory,
bytes, explicit files and Git's repository state: top-level files such as `HEAD` and `config`, `refs`, `objects`,
`hooks`, `info` and the index's staged entries. A mutation, including a newly added source file, causes refusal
before the next command. Git commands may refresh the index's stat cache or add logs, locks and tool directories. The
example does not reset the view or prepare mutable dependency installations. Providers needing such behavior must
preserve fixed inputs and source absence through isolation or equivalent controls. Every planned command directory
must exist inside the captured source before ready.

## Play an opted-in shard plan serially

After configuring `local.mjs` above, an existing self-contained command may opt its native shard arguments into routed
playback. This declaration assumes `scripts/verify.mjs` already implements `--shard=INDEX/COUNT` and reads the two
explicit inputs; substitute your existing native command and declare only the inputs it actually reads:

```yaml
checks:
  verify:
    command: ["node", "scripts/verify.mjs"]
    mode: project
    runner: true
    environment_inputs:
      CHECK_MODE: value
      CHECK_WEIGHTS_FILE: file
    shards:
      routed: true
      count: 2
      argument: "--shard={index}/{count}"
```

Run `arc check run verify`. ARC captures source and both bindings once, prepares one context and sends the two native
invocations through `check/run` in order. The basic example still advertises `runGroup: false`: opted-in shards run
serially at their native overhead. Without `shards.routed: true` or a configured eligible runner, ordinary execution
keeps the unsharded command. CI's declared matrix remains unchanged.

Unset inputs remove ambient worker values; an empty string stays empty. A nonempty file binding freezes regular-file
bytes and is rebound to an execution-local path; an existing zero-byte file differs from an empty binding. Original
host paths and later caller edits do not alter siblings. Declare a partitioner's duration file this way when it reads
one. The example installs no dependencies and refuses source additions or mutations between invocations; choose a
provider with suitable preparation/output isolation when the native command needs more.

The [group contract][guide] separately allows an adapter to advertise optional `runGroup` and accept the complete
matrix in one request. This example demonstrates serial conformance and recovery, not distributed membership or
performance qualification. Default unknown runtime permits execution without reusable lookup/publication; named,
measured execution profiles are the boundary for broader compatibility or performance claims.

## Runtime qualification

Default mode reports unknown runtime: compatible live execution remains possible, with reusable lookup/publication
disabled. Add `--known-node-runtime` to the machine argv only when the check's external runtime is this Node
installation. It covers nonshell commands/probes using the adapter's own `process.execPath`. Other tools, custom module
paths and unsupported Node startup options remain unknown. Package/dependency environments need their provider's own
qualification.

Known mode hashes Node's executable, platform, architecture, component versions and supported startup options. It runs
actual requested probes with captured cwd/environment and exact UTF-8 stdout. Failed, oversized or undecodable probes
make runtime unknown. It repeats qualification before known execution and refuses drift; retry requires a fresh
attempt. Invocation IDs, temporary paths and worker labels are excluded from runtime identity.

## Inspect, settle and retry

Recovery notifications give the exact executable/state-root arguments for:

```sh
node /absolute/path/to/local.mjs --inspect PLAN_UUID --state-root /absolute/state/root
node /absolute/path/to/local.mjs --settle PLAN_UUID --state-root /absolute/state/root
```

The default state root is `~/.cache/arc-local-check-runner`; `--state-root` selects another absolute directory.
Settlement signals the process groups that attempt records name, skipping groups that already drained or whose ID a
later process now holds, so preparation refuses a root that is not a directory owned by the current user and writable
by no one else. Each attempt owns private process records. Normal release removes them; unsuccessful conversations
retain recovery records usable after the protocol process exits.

Supervisors record process identity before accepting work. Cancel/EOF stops owned groups and waits for descendants,
even after the original process exits or output pipes close. Termination escalates after one second. Inspect reports
`settled` only after the protocol owner and execution groups stop. If work remains active, retain source and explicit
files, settle and inspect again. Only then remove retained captures and leftover recovered records or retry explicitly.
A cancellation acknowledgement alone is not settlement.

Completed native failures are reported when known while remaining required output/descendants settle. Later
cancellation cannot replace them. Missing required output or terminal delivery leaves execution incomplete.
Cleanup-only warnings after proven settlement remain advisory. ARC owns pass lookup/publication; these local ownership
records introduce no automatic reconnect, replacement execution or ARC job database.

## Implementation size

The four runtime modules and their declaration companion total 842 lines, including comments and blank lines and
excluding READMEs:

| Module              | Responsibility                                  |
| ------------------- | ----------------------------------------------- |
| `local.mjs`         | Conversation and protocol ordering              |
| `local-inputs.mjs`  | Source/files verification and child environment |
| `local-process.mjs` | Descendant supervision and recovery             |
| `local-runtime.mjs` | Supported Node runtime qualification            |
| `local-types.d.mts` | Wire records and private worker types           |

The declaration companion supports JavaScript typechecking and adds no runtime dependency. The count measures
implementation size, not preparation timing or a minimum adapter size. Remote transport,
dependency preparation, provider admission and broader runtime qualification add their own implementation work.

---

[guide]: ../../README.md
