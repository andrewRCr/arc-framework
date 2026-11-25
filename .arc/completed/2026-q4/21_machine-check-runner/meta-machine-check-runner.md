# Metadata: machine-check-runner

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-machine-check-runner.md`
- **Task List:** `tasks-machine-check-runner.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:ad2cac54a4fabec5d960d8a5363a4771eab210ef10cf12c7ba50e0e205e96700`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1159>
- **Completed:** 2026-10-28

## Release Notes Entry

Declared checks can now run through an adapter configured on the developer's machine, so containers or a remote pool
can execute them without provider commands in the project's check declarations.

### Added

- A `checks.runner` setting in `~/.arc/config.yml` names an adapter command, and checks marked `runner: true` run
  through it. Fixer, index-certifying and selection checks refuse the mark. With no runner configured, checks run
  locally as before; a configured runner that cannot run a check reports it as unavailable rather than running it
  locally.
- An `environment_inputs` check field declares the environment values and files a check reads. ARC freezes them
  before execution, in local runs and CI as well as through a runner.
- Version 1 of the check-runner adapter protocol: newline-delimited JSON-RPC 2.0 on the adapter's standard streams,
  covering preparation, reusable-result lookup, execution, cancellation and release.
- Checks routed through a runner execute against a captured copy of the selected worktree, index or commit. A command
  that changes source or Git state stops the next command, and a fresh run recovers.
- Reusable passes for routed checks are keyed to the runtime the adapter reports; an adapter that cannot name its
  runtime runs every check.
- A standalone Linux example adapter in the package's `examples/check-runner/`, with the protocol documented in the
  package README.

## Completion Notes

A declared check can now opt into a machine-configured adapter. ARC captures the selected source and the check's
explicit environment inputs, plans its invocations, and holds one JSON-RPC conversation with the adapter through
preparation, reusable-result lookup, execution and release; it keeps the verdict and distinguishes unavailable or
uncertain work from completed failures. Reusable passes bind the adapter-reported runtime and declared dependencies
only. Unconfigured machines, CI, and fixer, index-certifying and selection checks keep native execution. The nine
wrapper-prefixed repository declarations now use the ordinary `runner: true` route, the prototype wrapper and its
discovery are retired, and ADR-039 is Accepted with dated qualification for both adapters.

Grouped submission shipped as a protocol capability only; shard orchestration and aggregate shard evidence remain
outside this change. Routed execution is qualified on Linux through the packed standalone example and the external
arc-offload adapter; native Windows and macOS execution through an adapter is not established. ADR-039's 510-line
example figure was superseded by later review fixes and is corrected forward with the under-600-line bound.

Verification met all 21 success criteria over chunked scopes plus their seam, with hosted CI passing at the verified
head. The complete chunked review pass found 13 minor issues and the follow-up fix check 4 more, all fixed. The second
complete pass was declined, and review closed by Owner acceptance, so the fix check's four repairs were verified by
tests but not independently re-reviewed. After merging base `a5daf003e` (disjoint), the forced merge gate passed 18
checks at `932bc0b71` and CI run `40694138419` passed there on its second attempt, after a first-attempt Windows
setup-hook timeout in an untouched end-to-end test. Execution costs and their reproduction are recorded in
`notes-machine-check-runner.md`.

---
