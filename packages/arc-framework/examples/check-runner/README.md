# Standalone local check runner

Run `node /absolute/path/to/local.mjs` as the configured adapter executable and arguments. It reads one JSON-RPC object
per line on stdin and writes protocol messages on stdout. Commands receive the captured source and explicit bindings;
the adapter does not read the original checkout to reconstruct them. It implements protocol version 1, mandatory singles
and `runGroup: false`.

This example supports Linux with `/proc` and POSIX process groups. Other platforms receive a settled preparation refusal.
Commands must keep their descendants in the supervised process group. Commands that create independent sessions require
a provider with containment suitable for those commands. Use host admission in the launcher for heavy checks; children
inherit its CPU priority, affinity and operating-system limits. The example runs one invocation at a time, applies a
five-minute wall-time limit to each command or probe, and limits retained probe stdout to 1 MiB.

The implementation comprises four small modules: `local.mjs` owns the conversation, `local-inputs.mjs` verifies artifacts
and binds child environments, `local-process.mjs` supervises descendants and recovery, and `local-runtime.mjs` qualifies
the supported Node environment. All dependencies are Node builtins or these sibling files.

## Runtime qualification

Default mode returns unknown runtime and permits live execution without reusable evidence. Add `--known-node-runtime`
only for checks whose external runtime is this Node installation. It covers nonshell commands and probes whose executable
is the adapter's own `process.execPath`; other executables, custom module paths and unsupported Node startup options remain
unknown. It installs no dependencies. Package or other-tool environments need qualification appropriate to their provider.

Known mode hashes the Node executable and its platform, architecture, component versions and supported startup options.
It runs the actual requested probes in their captured directories and environment, preserving exact UTF-8 stdout. Failed,
oversized or undecodable probes make runtime unknown. Before executing a known invocation it repeats qualification and
refuses changes; a new attempt must be requested explicitly. Invocation IDs, temporary locations and physical worker names
do not enter the runtime digest.

## Inspect and settle by plan UUID

The recovery notification includes the exact executable and state-root arguments for these commands:

```sh
node /absolute/path/to/local.mjs --inspect PLAN_UUID --state-root /absolute/state/root
node /absolute/path/to/local.mjs --settle PLAN_UUID --state-root /absolute/state/root
```

The default state root is `arc-local-check-runner` under the operating system's temporary directory; set `--state-root`
to choose another machine-local directory. Each attempt owns a private directory containing process ownership records,
not check results or reusable passes. Normal release removes it. An unsuccessful conversation retains its records so the
same commands work after the protocol process exits.

Each supervisor records its process identity before accepting work. Cancellation and stdin EOF stop the owned process
groups; supervisors wait for descendants even when the original command has exited or descendants closed their output
pipes. Termination escalates after one second when necessary. `--settle` requests cancellation and checks remaining owned
groups. `--inspect` reports `settled` only when the protocol owner and execution groups have stopped. If it reports active
work, keep the captured source and explicit files, settle the attempt and inspect again. Remove retained captures only
after settlement. Records left after recovery can then be removed manually.

The example is a local provider implementation, separate from ARC's pass lookup and publication. Its process records do
not add an ARC job database, automatic reconnect or replacement execution.
