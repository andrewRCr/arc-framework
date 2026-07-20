# Spec (`outline`): cli-git-executor

- **Origin:** [internal]

- **Purpose:** Standardize the CLI's raw Git process execution on execa behind the existing injectable `GitExec`
  seam, centralizing expected-outcome stderr interpretation and replacing Node-error-shape dependencies with a
  typed, executor-owned error taxonomy.

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
   construction changes behind the seam. `normalizeGitRejection(value, { command, args })` accepts already-typed
   errors, execa results, and faithful legacy/injected rejection shapes, so consumers do not each learn a process
   library and ordinary function mocks remain source-compatible. Expected-outcome fixtures adopt typed or faithful
   process shapes; broader classifier fixtures may exercise the documented legacy fallback. `gitFailureText(value)`
   is the separate compatibility accessor for audited domain classifiers that still interpret non-expected Git
   failure text: it reads complete typed stderr, then legacy stderr, then a legacy message fallback. Expected-outcome
   classification never uses that fallback. Result composition stays inside adapters where it helps — it does not
   become the public executor contract.

2. **Adopt execa 10 for the audited production bindings.** Add execa 10 as this member's dependency and use its
   plain-Promise subprocess API for the in-scope bindings. The stdin-fed variant (`GitExecInput`, backing
   `hash-object --stdin` / `mktree` / `rev-list --stdin` and note writes) uses execa's input/stdin support with no
   shell interpolation. The package's declared Node ≥24 baseline satisfies execa 10; the existing 64 MiB output cap
   (`MAX_GIT_STDOUT_BYTES`) is preserved.

3. **Introduce one concrete executor-owned error ABI extending the kernel `ArcError` base.** `GitProcessError`
   carries a `kind` discriminant with six values and fixed `ArcError.code` mappings: `canceled` / `git.canceled`,
   `timed-out` / `git.timed-out`, `output-limit` / `git.output-limit`, `nonzero-exit` / `git.nonzero-exit`,
   `spawn-failure` / `git.spawn-failure`, and `unexpected` / `git.unexpected`. Numeric process status remains the
   separate optional `exitCode`. An exported immutable `GitProcessErrorInit` object is the constructor input:
   `kind`, `command: string`, `args: readonly string[]`, optional `exitCode: number`, optional `signal: string`,
   optional booleans `isCanceled` / `timedOut` / `isMaxBuffer`, optional string `stdout` / `stderr`, optional
   `expectedOutcome`, and optional `cause`. The class defaults source flags to `false` and streams to `""`, derives
   the fixed `code`, bounded `message`, `diagnosticStdout`, and `diagnosticStderr`, and rejects an `expectedOutcome`
   on any kind except `nonzero-exit`. `isGitProcessError(value)` is the public narrowing guard; consumers then branch
   on `kind` or `expectedOutcome`.

   `normalizeGitRejection()` returns `GitProcessError` by identity and otherwise applies this precedence:
   `timedOut`, `isMaxBuffer`, `isCanceled`, exited/signaled process, spawn failure, unexpected value. A
   signal-terminated process that is neither canceled nor timed out is a `nonzero-exit` with `signal` and no
   invented `exitCode`. Output overflow preserves whatever partial streams execa captured within the process cap,
   derives bounded diagnostics from them, and never receives an expected outcome. `GitProcessError.message` is a
   deterministic, single-line display summary: it retains a bounded invocation label (`command` plus the first
   argument when present), the `kind` and any available exit/signal disposition, and the first non-empty diagnostic
   projection (`diagnosticStderr`, then `diagnosticStdout`). The summary reserves space for invocation and disposition
   before truncating diagnostic evidence to the selected cap and never embeds the complete raw streams. It is an
   actionable display/record surface, not a compatibility parsing surface; classifiers use `isGitProcessError()`,
   typed fields, or `gitFailureText()`.

4. **Consumers classify expected outcomes through typed variants, not stderr text.** Expected-outcome
   interpretation reads complete stderr once in the normalizer and is constrained by exit status plus invocation
   shape: fetch exit 128 + the remote-ref-not-found signature and deletion push + the remote-ref-does-not-exist
   signature become `absent-remote-ref`; leased push + `stale info` becomes `stale-lease`; and the existing broader
   `would clobber` / `fetch first` / `[rejected]` compatibility signatures become `stale-lease` only for a non-delete
   leased publication. A signature carried only in `message`, a non-Git executable, and wrong-subcommand lookalikes
   remain ordinary unclassified non-zero exits. Consumers branch on the discriminant; no expected-outcome consumer
   re-parses human-readable Git output.

5. **Reclassify cancellation on execa's model.** At the audited in-scope sites, replace `err.name === "AbortError"`
   with execa's cancellation field (`isCanceled`). The `AbortSignal` semantics of `GitExecOptions` are preserved, so
   where a caller owns the timeout timer (`boundedFetch` / `boundedGitInvocation`), it derives the _timeout_ label
   only when its own signal has fired and the rejection is canceled. execa's own `timedOut` field is not relied on:
   it reflects execa's `timeout` option, which this migration does not adopt.

6. **Stage the live rejection-ABI cutover behind consumer adoption.** Build and test the execa-backed `GitExec`
   adapter without replacing the exported production binding. Migrate every rejection-shape consumer through the
   normalization utilities while the legacy binding remains live, then switch production `gitExec` to the prepared
   adapter and retire its final `child_process` implementation. This keeps each review increment behaviorally
   compatible rather than requiring a temporary broken state or one oversized atomic cutover.

7. **Run the executor integration slice on every supported CI platform.** Add the focused executor integration
   file to `test:portability`, which is already the command used by the Windows and macOS CI legs. Linux retains the
   normal integration run; the portability selector adds cross-platform coverage for the signal, cancellation,
   stdin, binary-output, and spawn behaviors whose implementation may vary by operating system.

## Scope boundary (No-gos)

- **In scope — the core first-party seam and its audited classification sites:**
    - _Raw production bindings to migrate onto execa:_ every raw `child_process` Git binding in `io-context.ts` —
      `gitExec` (execFile), the stdin-fed `gitExecInput` and `writeGitNote` (spawn), the `readGitNote` and
      `readGitBlobBytes` reads (execFile), and `prepareGitRefVerification` (the `update-ref --stdin` lease);
      `push-worktree.ts`; and the handlers that spawn Git directly (`handlers/installation.ts`,
      `handlers/release/commit-cli.ts`).
    - _Audited outcome-classification sites to update for the new error model:_ the bounded helpers in
      `lib/git/exec.ts` (`boundedFetch` / `boundedGitInvocation`), `lib/git/worktree-sync.ts`,
      `lib/work-unit/mutators/reconcile-branch.ts`, `commands/user/sync-status.ts`, `commands/user/compact.ts`,
      `lib/user-sync/compaction.ts`, and `handlers/shared.ts`.
    - _Rejection-shape compatibility consumers to migrate:_ `lib/git/exec.ts`'s `gitMergeFile()`,
      `lib/user-sync/branch-bounded-notes-export.ts`, `lib/status/project-roadmap-render.ts`,
      `lib/errand/close.ts`, and `handlers/release/push-cli.ts`; plus the broader non-expected failure-text
      classifiers in `handlers/user.ts`, `commands/user/push-fetch.ts`, `lib/user-sync/cas-retry.ts`,
      `lib/user-sync/sync-state-merge.ts`, `lib/errand/merge.ts`, `lib/git/ref-tree.ts`, and
      `lib/user-sync/notes-ref.ts`.
- **No alternative Git abstraction.** No simple-git, isomorphic-git, or repository object model; `GitExec` does not
  become Result-returning.
- **No higher-level rewrites.** Branch policy, Git workflows, and command result/guidance behavior are untouched
  beyond the classification and bounded-diagnostic sites named above.
- **No non-Git process execution.** Unrelated `child_process` use (e.g., `view-renderer.ts`'s tool `--version`
  availability check) stays as-is.
- **Deferred to the cohort tail member (`cli-substrate-complete-migration`).** Three peripheral raw-git binding sets
  that live outside the core seam are out of scope here and route to the tail's residual-migration sweep per the
  cohort's "any newly discovered wholesale migration target routes to the tail" contract: (a) the standalone dev/CI
  scripts with their own `promisify(execFile)` Git calls (`scripts/assert-roadmap-regenerated.ts`,
  `scripts/remedy-roadmap-conflict.ts`, `scripts/validate-decompose-record.ts`); and (b) the review-gate runtime
  executor surfaces (`scripts/review-gate/runtime/production-io.ts`'s `execFileGitExec`, a parallel `GitExec` impl,
  and `scripts/review-gate/run-qualification.ts`'s generic process runner; the subsystem is not operational yet);
  and (c) reusable raw-Git executors under `__tests__/helpers/`, whose convergence is test-support work rather than a
  production binding migration. The handoff is recorded as a `WU_Target` capture for the tail.

## Consequences & Risks

- **New package dependency.** execa 10 joins `@arc-framework/cli`'s dependencies; `TECHNICAL-OVERVIEW` § 3 gains an
  execa entry alongside the existing runtime-contracts line at this WU's integration (its event-driven
  "dependency added" trigger) — not before the dependency lands. Node ≥24 is already declared, so no engine change.
- **Behind-seam blast radius stays bounded.** The broad set of success-only `exec: GitExec` consumers is untouched;
  only the enumerated callers that inspect rejection shape migrate. The resolved success shape remains unchanged.
- **execa-major risk.** execa 10's API and error shapes differ from older majors; v10 behavior could be misread
  against stale assumptions. _Mitigation:_ pin execa 10 and test adapters against representative execa error objects.
- **Rejection-seam ripple.** Typed errors may surface at catch sites if the current rejection seam is inconsistent.
  _Mitigation:_ keep reject-on-failure and route adapter plus audited consumer handling through the single
  normalizer before the live binding changes.
- **Timing-flaky cancellation tests.** Cancel/timeout tests that depend on wall-clock timing rather than controlled
  child behavior can flake. _Mitigation:_ drive tests with controlled child behavior, not real delays.
- **Output/encoding drift.** Buffering or encoding defaults could alter diagnostics, merge conflict output, or
  large-output handling. _Mitigation:_ preserve complete captured streams up to `MAX_GIT_STDOUT_BYTES`, classify
  execa's `isMaxBuffer` result explicitly with its partial streams, expose separate bounded diagnostic projections,
  and retain current output normalization per binding.

## Success Criteria

- The audited in-scope bindings execute via execa 10; no raw `child_process` `execFile` / `spawn` Git call remains
  in the audited set — `io-context.ts`'s Git bindings (`gitExec`, `gitExecInput`, `writeGitNote`, `readGitNote`,
  `readGitBlobBytes`, `prepareGitRefVerification`), `push-worktree.ts`, `installation.ts`, and
  `release/commit-cli.ts`.
- `GitExec`, `GitExecInput`, `ExecResult`, and `GitExecOptions` are unchanged contracts; the rejection normalizer
  insulates ordinary injected function mocks, and classification-specific fixtures use typed or faithful shapes.
- Git failures surface as `GitProcessError` with the six fixed `kind` / `ArcError.code` pairs, invocation identity,
  process metadata, full process-capped streams, bounded diagnostic projections, and the underlying cause.
- Every enumerated numeric-code, failure-output, and message-classification consumer reads the normalized `exitCode`,
  full captured output, expected-outcome discriminant, or `gitFailureText()` compatibility accessor instead of Node
  error fields or `GitProcessError.message`.
- Untouched display and record consumers receive a bounded `GitProcessError.message` that preserves invocation
  identity, failure kind/status, and diagnostic stderr-or-stdout evidence without embedding complete raw streams.
- `reconcile-branch` and its audited siblings classify absent remote refs and stale leases from typed discriminants,
  with no stderr-substring test remaining at a consumer site.
- Non-zero Git exit, output overflow, spawn failure, user cancellation, execa timeout, and unexpected programming
  error are distinguished at the audited sites rather than through `err.name === "AbortError"`; timeout stays
  caller-derived at timer-owning sites (`boundedFetch` / `boundedGitInvocation`), which re-label an `isCanceled`
  abort they initiated.
- Real-process integration slices exercise stdin-fed invocation, cancellation, timeout, output overflow, non-zero
  exit, absent-ref, and stale-lease behavior; the focused executor file runs through `test:portability` on Windows,
  macOS, and Linux.

## Open items

- **Bounded diagnostic-output limits.** The stderr/stdout truncation size carried in the error variants settles
  during implementation from current error-reporting needs. The design is fixed (bounded diagnostic context;
  preserve the 64 MiB process cap); only the diagnostic-slice cap value is open.
- **execa 10 engine floor.** Confirm execa 10's published Node floor against the package `engines` at
  implementation; Node ≥24 is expected to satisfy it comfortably.
