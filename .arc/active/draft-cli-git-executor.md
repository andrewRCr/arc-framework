# Draft: cli-git-executor

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Standardize raw Git process execution on execa while preserving the CLI's injectable execution seam.

---

## Problem / Motivation

The CLI binds Node's `execFile` in roughly eleven Git-facing modules, with repeated promise wrappers and error
interpretation. Some callers infer Git outcomes by matching stderr text, and timeout/abort handling assumes Node
error shapes that do not match the proposed process library. This makes process failures brittle and forces every
consumer to understand low-level execution details.

The migration should improve the executor boundary without changing the broad set of Git consumers or replacing
the test seam they already inject.

## Goals

- Add execa 10 and use it for the audited raw Git process bindings, including the stdin-fed variant.
- Preserve the current injectable `GitExec` promise/rejection contract and function-based test mocks.
- Translate execa failures into typed CLI error variants with stable machine-readable context.
- Replace stderr substring classification in branch reconciliation and equivalent audited callers.
- Correct cancellation and timeout classification for execa's actual error model.

## Non-Goals

- Adopt simple-git, isomorphic-git, or a repository object model.
- Change `GitExec` to return Result and ripple that contract through all consumers.
- Rewrite higher-level Git workflows, branch policy, or command output.
- Replace process execution unrelated to the audited Git bindings.

## Design Decisions

### Compatibility seam

- Keep `GitExec` as an injectable function that returns a plain Promise and rejects on execution failure.
- Existing function mocks remain valid; production construction changes behind the seam.
- Consumers continue receiving the established success shape unless a field is demonstrably unused and removed in
  the same characterized change.
- Result use stays inside adapters where helpful; it does not become the public executor contract.

### execa 10 integration

- Add execa 10 as this member's dependency.
- Use its plain Promise API and documented subprocess/result types.
- Account explicitly for the `nodeChildProcess` access path and the absence of older `execaCommand` assumptions.
- Rely on the repository's Node 22-or-newer baseline and verify package-engine compatibility.
- Implement the stdin-fed Git invocation through execa's input/stdin support without shell interpolation.

### Error taxonomy

Translate process failures into executor-owned variants extending the kernel's `ArcError` base. Preserve, when
available:

- failure kind;
- exit code and terminating signal;
- cancellation and timeout flags;
- bounded stderr/stdout context appropriate for diagnostics;
- the original cause.

Callers classify expected outcomes through these variants. `reconcile-branch` and sibling sites must not inspect
human-readable stderr to decide whether a branch is absent or another expected state occurred.

### Cancellation and timeout behavior

Replace checks based on `err.name === "AbortError"` with execa's documented `ExecaError` fields such as
`isCanceled` and the timeout classification. Tests must distinguish user cancellation, timeout, non-zero Git exit,
spawn failure, and unexpected programming error.

## Delivery and Verification

- Inventory and characterize all raw `execFile` Git bindings before editing; reconcile approximately eleven
  modules plus any source drift.
- Add focused adapter tests using representative execa error objects and command-level tests for expected Git
  failures.
- Retain injection-based unit tests and add one real-process integration slice for stdin, cancellation, timeout,
  and non-zero exit behavior.
- Run the full suite on supported platforms because quoting and signal behavior vary by operating system.

## Alternatives

- **Keep Node `execFile`:** viable but rejected because repeated wrappers and underspecified errors remain.
- **Return Result from `GitExec`:** rejected for this member because the consumer ripple outweighs the focused
  executor gain.
- **Adopt a high-level Git library:** rejected because ARC needs transparent Git semantics and already has domain
  orchestration.
- **Continue stderr matching:** rejected because localized Git output and version changes make it unreliable.

## Risks

- execa 10's API and error-shape changes can be mistaken for older major-version behavior.
- Typed executor errors may still cause a wider catch-site ripple if the current rejection seam is inconsistent.
- Cancellation and timeout tests can become flaky if they depend on wall-clock timing rather than controlled child
  behavior.
- Output buffering or encoding defaults could alter diagnostics or large-output behavior.

## Unknowns and Assumptions

- Confirm the final raw-binding inventory and whether any non-Git `execFile` helper is actually shared with it.
- Settle bounded diagnostic-output limits during spec formalization from current error-reporting needs.
- Assume Node 22 is the minimum supported runtime; verify package metadata and CI before implementation.

## Scope Estimate

Medium (days-week). Class `Light`: the adapter design is determinate and consumer compatibility is explicit.
Depends on `cli-schema-kernel`.
