# Standalone local check runner

This independent executable implements ARC check-runner protocol version 1 using Node builtins and four sibling
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
bytes, explicit files and Git administration. A mutation, including a newly added source file, causes refusal before
the next command. It does not reset the view or prepare mutable dependency installations. Providers needing such
behavior must preserve fixed inputs and source absence through isolation or equivalent controls. Every planned command
directory must exist inside the captured source before ready.

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

The default state root is `arc-local-check-runner` under the operating system's temporary directory. Set `--state-root`
to select another machine-local directory. Each attempt owns private process records. Normal release removes them;
unsuccessful conversations retain recovery records usable after the protocol process exits.

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

The current example totals 510 lines and 29,507 bytes, including comments/blank lines and excluding READMEs:

| Module              | Responsibility                                  | Lines | Bytes |
| ------------------- | ----------------------------------------------- | ----: | ----: |
| `local.mjs`         | Conversation and protocol ordering              |   161 | 9,739 |
| `local-inputs.mjs`  | Source/files verification and child environment |   162 | 9,620 |
| `local-process.mjs` | Descendant supervision and recovery             |   151 | 7,883 |
| `local-runtime.mjs` | Supported Node runtime qualification            |    36 | 2,265 |

These are implementation-size measurements, not preparation timings or a minimum adapter size. Remote transport,
dependency preparation, provider admission and broader runtime qualification add their own implementation work.

---

[guide]: ../../README.md
