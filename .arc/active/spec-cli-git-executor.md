# Spec (`outline`): cli-git-executor

- **Origin:** [internal]

- **Purpose:** Standardize the CLI's raw Git process execution on execa behind the existing injectable `GitExec`
  seam, replacing stderr-substring and Node-error-shape classification with a typed, executor-owned error taxonomy.

---

## Problem / Context

The CLI spawns raw Git through Node's `child_process` (`execFile`, `spawn`) behind an injectable executor seam —
`GitExec` / `GitExecInput` in `lib/git/exec.ts`, wired in production by the bindings in `io-context.ts` and the
spawn-based `push-worktree.ts`. Two weaknesses ride on that raw layer:

- **Outcome classification by stderr text.** `reconcile-branch` decides an expected state from human-readable Git
  output — `/remote ref does not exist/i.test(err.stderr ?? err.message)` — which localized or version-varying Git
  output can silently break. Git signals these conditions only in stderr (no distinct exit code), so the fix is to
  interpret them once at the seam, not to scatter the match across consumers.
- **Cancellation/timeout keyed on Node's error shape.** Bounded invocations (`boundedFetch` / `boundedGitInvocation`)
  classify by `err.name === "AbortError"`, an assumption tied to `child_process`, not to the process library the
  executor should stand on.

The fix is a behind-the-seam standardization: move the audited raw bindings onto execa and give callers typed
outcomes to branch on — without disturbing the broad set of downstream consumers that inject `GitExec`, and without
replacing the test seam they already mock. This is one fan member of the `cli-substrate-adoption` cohort; it
consumes the `ArcError` base landed by `cli-schema-kernel` and owns the executor-specific error variants.

## Decision(s)

1. **Preserve the `GitExec` seam unchanged.** `GitExec`, `GitExecInput`, `ExecResult`, and `GitExecOptions` stay as
   injectable function types that return a plain `Promise` and reject on execution failure. Only the production
   construction changes behind the seam; existing function mocks remain valid. Result composition stays inside
   adapters where it helps — it does not become the public executor contract.

2. **Adopt execa 10 for the audited production bindings.** Add execa 10 as this member's dependency and use its
   plain-Promise subprocess API for the in-scope bindings. The stdin-fed variant (`GitExecInput`, backing
   `hash-object --stdin` / `mktree` / `rev-list --stdin` and note writes) uses execa's input/stdin support with no
   shell interpolation. The package's declared Node ≥24 baseline satisfies execa 10; the existing 64 MiB output cap
   (`MAX_GIT_STDOUT_BYTES`) is preserved.

3. **Introduce an executor-owned error taxonomy extending the kernel `ArcError` base.** Translate execa failures
   into typed variants that preserve, when available: failure kind, exit code, terminating signal, cancellation and
   timeout flags, bounded stderr/stdout diagnostics, and the original cause. The taxonomy names five process-level
   outcomes — user cancellation, timeout, non-zero Git exit, spawn failure, and unexpected programming error — and,
   on the non-zero-exit variant, a typed discriminant for the handful of _expected Git outcomes_ that Git signals
   only in stderr (an absent remote ref, a stale-info push rejection). The adapter reads those stderr signatures
   **once, at the executor boundary**, so no consumer re-parses Git's human-readable output.

4. **Consumers classify expected outcomes through typed variants, not stderr text.** With the expected-outcome
   interpretation centralized in the executor adapter (Decision 3), `reconcile-branch` and any equivalent audited
   caller branch on the typed discriminant rather than re-matching human-readable Git output. Because Git encodes
   these conditions only in stderr with no distinct exit code, the goal is to _centralize and type_ that
   interpretation at the seam — not to eliminate stderr reading everywhere.

5. **Reclassify cancellation on execa's model.** At the audited in-scope sites, replace `err.name === "AbortError"`
   with execa's cancellation field (`isCanceled`). The `AbortSignal` semantics of `GitExecOptions` are preserved, so
   where a caller owns the timeout timer (`boundedFetch` / `boundedGitInvocation`), an abort arrives as `isCanceled`
   and the caller derives the _timeout_ label from owning the timer — as today. execa's own `timedOut` field is not
   relied on: it reflects execa's `timeout` option, which this migration does not adopt.

## Scope boundary (No-gos)

- **In scope — the core first-party seam and its audited classification sites:**
    - _Raw production bindings to migrate onto execa:_ every raw `child_process` Git binding in `io-context.ts` —
      `gitExec` (execFile), the stdin-fed `gitExecInput` and `writeGitNote` (spawn), the `readGitNote` and
      `readGitBlobBytes` reads (execFile), and `prepareGitRefVerification` (the `update-ref --stdin` lease);
      `push-worktree.ts`; and the handlers that spawn Git directly (`handlers/installation.ts`,
      `handlers/release/commit-cli.ts`).
    - _Audited outcome-classification sites to update for the new error model:_ the bounded helpers in
      `lib/git/exec.ts` (`boundedFetch` / `boundedGitInvocation`) and the seam consumers that branch on the old
      model (e.g., `reconcile-branch`, and the `sync-status` fetch-ref sites). The exact set is pinned by the
      task-generation grounding audit (see Open items).
- **No alternative Git abstraction.** No simple-git, isomorphic-git, or repository object model; `GitExec` does not
  become Result-returning.
- **No higher-level rewrites.** Branch policy, Git workflows, and command output are untouched beyond the classification
  sites named above.
- **No non-Git process execution.** Unrelated `child_process` use (e.g., `view-renderer.ts`'s tool `--version`
  availability check) stays as-is.
- **Deferred to the cohort tail member (`cli-substrate-complete-migration`).** Two peripheral raw-git binding sets
  that live outside the core seam are out of scope here and route to the tail's residual-migration sweep per the
  cohort's "any newly discovered wholesale migration target routes to the tail" contract: (a) the standalone dev/CI
  scripts with their own `promisify(execFile)` Git calls (`scripts/assert-roadmap-regenerated.ts`,
  `scripts/remedy-roadmap-conflict.ts`, `scripts/validate-decompose-record.ts`); and (b) the review-gate runtime
  executor (`scripts/review-gate/runtime/production-io.ts`'s `execFileGitExec`, a parallel `GitExec` impl whose
  subsystem is not operational yet). The handoff is recorded as a `WU_Target` capture for the tail.

## Consequences & Risks

- **New package dependency.** execa 10 joins `@arc-framework/cli`'s dependencies; `TECHNICAL-OVERVIEW` § 3 gains an
  execa entry alongside the existing runtime-contracts line at this WU's integration (its event-driven
  "dependency added" trigger) — not before the dependency lands. Node ≥24 is already declared, so no engine change.
- **Behind-seam blast radius stays small.** The broad set of `exec: GitExec` consumers is untouched except the
  audited classification sites; the established success shape is unchanged, so no consumer ripple beyond those sites.
- **execa-major risk.** execa 10's API and error shapes differ from older majors; v10 behavior could be misread
  against stale assumptions. _Mitigation:_ pin execa 10 and test adapters against representative execa error objects.
- **Rejection-seam ripple.** Typed errors may surface at catch sites if the current rejection seam is inconsistent.
  _Mitigation:_ keep reject-on-failure; translate at the adapter boundary only.
- **Timing-flaky cancellation tests.** Cancel/timeout tests that depend on wall-clock timing rather than controlled
  child behavior can flake. _Mitigation:_ drive tests with controlled child behavior, not real delays.
- **Output/encoding drift.** Buffering or encoding defaults could alter diagnostics or large-output handling.
  _Mitigation:_ preserve the existing `MAX_GIT_STDOUT_BYTES` cap and output semantics.

## Success Criteria

- The audited in-scope bindings execute via execa 10; no raw `child_process` `execFile` / `spawn` Git call remains
  in the audited set — `io-context.ts`'s Git bindings (`gitExec`, `gitExecInput`, `writeGitNote`, `readGitNote`,
  `readGitBlobBytes`, `prepareGitRefVerification`), `push-worktree.ts`, `installation.ts`, and
  `release/commit-cli.ts`.
- `GitExec`, `GitExecInput`, `ExecResult`, and `GitExecOptions` are unchanged contracts; the existing
  function-mock unit tests pass without modification.
- Git failures surface as typed variants extending `ArcError`, carrying failure kind, exit code, signal,
  cancellation/timeout flags, bounded diagnostics, and the original cause.
- `reconcile-branch` (and any audited sibling) classifies an absent remote ref and a stale-info rejection from the
  typed discriminant the executor adapter produces, with no stderr-substring test remaining at the consumer site.
- Non-zero Git exit, spawn failure, user cancellation, and unexpected programming error are distinguished at the
  audited sites via execa's model rather than `err.name === "AbortError"`; timeout stays caller-derived at the
  timer-owning sites (`boundedFetch` / `boundedGitInvocation`), which re-label an `isCanceled` abort they initiated.
- A real-process integration slice exercises the stdin-fed invocation, cancellation, timeout, and non-zero exit;
  the full suite passes on the supported platforms (quoting and signal behavior vary by OS).

## Open items

- **Bounded diagnostic-output limits.** The stderr/stdout truncation size carried in the error variants settles
  during implementation from current error-reporting needs. The design is fixed (bounded diagnostic context;
  preserve the 64 MiB process cap); only the diagnostic-slice cap value is open.
- **Exact audited-site enumeration.** The full list of in-scope classification sites (the `AbortError`-keyed and
  stderr-keyed consumers within the seam, including the `sync-status` fetch-ref cases) is pinned by the
  task-generation grounding audit; the decision to reclassify every in-scope site is fixed.
- **execa 10 engine floor.** Confirm execa 10's published Node floor against the package `engines` at
  implementation; Node ≥24 is expected to satisfy it comfortably.
