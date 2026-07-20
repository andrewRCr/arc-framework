# Task List: cli-git-executor

- **Design:** `spec-cli-git-executor.md`

---

## **Phase 1:** Executor contract and prepared adapters

_Purpose:_ Establish the execa-backed failure contract and prove replacement adapters without changing the live
`GitExec` rejection ABI that existing production consumers still observe.

### `[x]` **1.1 Define the executor-owned error contract and normalization boundary**

- _Goal:_ Every Git rejection shape can be represented by one stable, lossless machine-readable contract before
  any production binding changes its process library.
    - `[x]` **1.1.a Add execa 10 as the supported Git process runtime**
        - Added the ESM-only execa 10 runtime dependency without changing the Node ≥24 engine contract, and recorded
          it as the Git process-execution runtime in `.arc/reference/TECHNICAL-OVERVIEW.md`.

    - `[x]` **1.1.b Implement the concrete `GitProcessError` ABI**
        - Added the six-kind `ArcError` taxonomy, immutable constructor contract, guard, complete process streams,
          4 KiB diagnostic projections, and a deterministic single-line display summary capped at 1 KiB.

    - `[x]` **1.1.c Normalize typed, execa, and injectable rejection shapes**
        - Added precedence-ordered normalization for typed, execa, legacy process, spawn, and unexpected failures;
          expected remote-ref and lease outcomes now classify only from matching Git invocation and stderr evidence.

- _Outcome:_ The public Git error surface now preserves lossless process evidence while exposing bounded diagnostics
  and narrowly classified expected outcomes, without coupling callers to execa's rejection objects.

### `[x]` **1.2 Build and prove the replacement core adapters without live cutover**

- _Goal:_ The replacement `GitExec` and `GitExecInput` implementations are integration-tested and ready for use
  while the exported production `gitExec` continues using its compatible legacy implementation.
    - `[x]` **1.2.a Build the captured-output `GitExec` adapter behind an internal construction seam**
        - Added an execa-backed constructor preserving argument arrays, environment scrubbing, `cwd`, alternate
          indexes, cancellation, output normalization, the 64 MiB ceiling, and normalized typed failures.

    - `[x]` **1.2.b Build the stdin-fed `GitExecInput` adapter behind the same substrate**
        - Added raw-stdout, shell-free execa stdin execution with the shared ceiling and typed partial-output
          failures; the live binding remains unchanged pending specialized-consumer migration.

- _Outcome:_ Candidate adapters now prove the existing injectable contracts at the real process boundary, and all
  process-backed `io-context` tests reside in the integration tier while filesystem-only tests remain unit-scoped.

## **Phase 2:** Specialized production binding migration

_Purpose:_ Move specialized raw Git processes onto the shared execa substrate while the generic production
`gitExec` binding remains on its old implementation for rejection-ABI compatibility.

### `[x]` **2.1 Migrate the specialized `io-context.ts` Git bindings**

- _Goal:_ Binary reads, stdin plumbing, note transport, and ref-verification leases retain their specialized
  contracts with no raw child-process implementation at those call sites.
    - `[x]` **2.1.a Migrate byte-preserving blob reads**
        - Routed exact index/tree lookup and binary blob retrieval through execa with literal paths, arbitrary bytes,
          scrubbed repository context, absent-path results, and typed invalid-ref failures preserved.

    - `[x]` **2.1.b Migrate stdin execution and note transport**
        - Switched production stdin plumbing and note writes to the prepared adapter, and note reads to captured
          execa execution while retaining large literal payloads and the established catch-all read contract.

    - `[x]` **2.1.c Migrate prepared ref-verification leases**
        - Rebuilt the held `update-ref --stdin` transaction on execa's child-process handle with its validation,
          prepare/abort handshake, idempotent release, and typed failure evidence intact.

- _Outcome:_ `io-context.ts` no longer owns raw child-process implementations for binary reads, stdin execution,
  note transport, or prepared ref leases; their specialized contracts now share the execa error substrate.

### `[ ]` **2.2 Migrate inherited-stdio worktree pushes**

- _Goal:_ Wrapped pushes continue streaming user-visible output and returning complete rejection evidence through
  the existing `PushWorktreeSpawn` seam without a raw `spawn()` implementation.

    - Replace `defaultSpawnPush` with a specialized execa adapter using `reject: false`, preserving inherited
      stdin/stdout, captured-and-teed stderr, `cwd`, ordered argument passthrough, exit-code results, and injected
      `spawnPush` tests. Only spawn, transport, output-limit, cancellation, or unexpected execution failures reject.
    - Extend the internal result source-compatibly with an optional normalized non-zero error. Have
      `pushWorktreeBranch()` preserve it while retaining the generic-error fallback for injected fakes that omit it.
    - Build `test-first` (one behavior at a time):
        - Successful and rejected pushes retain their existing `PushWorktreeBranchResult` shapes.
        - Stderr is displayed exactly once while remaining fully available within the process ceiling, typed
          non-zero evidence survives the result seam, and transport failures reject through the taxonomy.

### `[ ]` **2.3 Migrate direct handler Git invocations**

- _Goal:_ Installation diffing and release-commit orchestration use execa-backed bindings while preserving their
  user-facing exit, stream, hook, and retry behavior.

    - `[ ]` **2.3.a Move installation diff execution onto execa**
        - Use a specialized adapter with `reject: false` so `git diff --no-index` exit code `1` remains a successful
          difference result with complete stdout. Keep the injected `gitDiff` contract unchanged and normalize only
          transport, output-limit, cancellation, or unexpected execution failures.
        - Build `test-first` (one behavior at a time):
            - No differences, differences, and actionable Git failures retain their current handler outcomes.

    - `[ ]` **2.3.b Move release-commit Git processes onto execa**
        - Route hook-path, Git-directory, and `HEAD` reads through the prepared executor substrate with
          repository-local environment scrubbing intact.
        - Rebuild the wrapped `git commit` adapter with `reject: false`, preserving the `SpawnGit` contract,
          optional stdin, inherited editor input, stdout/stderr teeing and complete process-capped capture,
          transport-error handling, and exact exit code. Non-zero hook and commit exits remain control results.
          Output-limit, cancellation, spawn, and unexpected failures remain typed execution errors rather than
          ordinary commit-exit control results.
        - Build `test-first` (one behavior at a time):
            - Hook discovery, retry-file placement, post-commit hash resolution, interactive commit transport, and
              non-zero exits remain behaviorally compatible.

## **Phase 3:** Rejection consumer adoption and live cutover

_Purpose:_ Move every audited rejection-shape consumer onto the normalization utilities, then replace the
production `gitExec` binding only after its thrown-error contract is safe for all named consumers.

### `[ ]` **3.1 Normalize rejection-shape compatibility consumers**

- _Goal:_ Callers that depend on Node's numeric `code`, complete subprocess output, or raw failure text for domain
  decisions retain their behavior through explicit typed fields and the documented failure-text accessor.
- **Additional Context:** `notes-cli-git-executor.md` § Rejection ABI and cutover; § Compatibility classifier
  inventory

    - `[ ]` **3.1.a Convert ref and config rejection consumers**
        - Update strict ref reads and ancestry checks in `branch-bounded-notes-export.ts`, optional Git config lookup
          in `project-roadmap-render.ts`, and local branch existence in `errand/close.ts` to normalize the rejection
          and read `exitCode` directly.
        - Route `branch-bounded-notes-export.ts`'s remote-unavailable predicate through `gitFailureText()` instead of
          the normalized error summary.
        - Preserve each caller's current handling of its accepted non-zero status and propagate every other typed
          failure without parsing a formatted message. Keep faithful injected legacy shapes source-compatible.
        - Build `test-first` (one behavior at a time):
            - Each accepted exit remains its existing domain result; typed and faithful injected failures behave
              identically; message-only numeric lookalikes no longer select an exit-code branch.

    - `[ ]` **3.1.b Preserve release-push exit status**
        - Update `handlers/release/push-cli.ts` to normalize the inherited-stdio push failure and read `exitCode`
          directly instead of recovering it from the formatted helper error message.
        - Preserve the existing fallback exit `1` for injected `PushWorktreeBranchResult` failures without numeric
          evidence and keep successful plus rejected wrapper result shapes unchanged.
        - Build `test-first` (one behavior at a time):
            - Typed non-zero results retain their exact exit status; injected generic failures use `1`; message text
              containing an exit-like number is never parsed.

    - `[ ]` **3.1.c Preserve merge-file conflict output as domain data**
        - Update `gitMergeFile()` to normalize rejections, recognize its established conflict exit through
          `exitCode`, and return complete captured stdout rather than a bounded diagnostic projection.
        - Build `test-first` (one behavior at a time):
            - A merge conflict returns the full merged output even when it exceeds the diagnostic cap; clean merges
              retain the success shape; unrelated failures propagate as typed errors.

    - `[ ]` **3.1.d Convert guarded user-fetch classifiers**
        - Route guarded `update-ref` CAS, remote-unavailable, non-fast-forward, and reconcile-repush classification
          in `commands/user/push-fetch.ts` through `gitFailureText()` instead of `Error.message`.
        - Retain the current CAS retry bound, notes reconciliation, local-ref rollback, conflict, and `no-remote`
          outcomes. Classification-specific fixtures must exercise both typed stderr and the documented legacy
          fallback while ordinary mocks remain unchanged.
        - Build `test-first` (one behavior at a time):
            - Typed and faithful legacy CAS evidence retries identically; typed remote and non-fast-forward evidence
              keeps its current result; the bounded `GitProcessError.message` alone never selects a branch.

    - `[ ]` **3.1.e Convert shared-state CAS and read classifiers**
        - Update `lib/user-sync/cas-retry.ts`, `lib/git/ref-tree.ts`, and `lib/user-sync/notes-ref.ts` to pass
          `gitFailureText()` output into their established CAS, absent-tree-ref, and older-Git fallback predicates.
        - Preserve immediate failure for non-CAS writes, fail-open behavior only at the established read seams, and
          the Git 2.31-compatible `--since` fallback.
        - Build `test-first` (one behavior at a time):
            - Typed and faithful legacy evidence preserve each accepted domain branch; generic typed summaries and
              unrelated stderr do not trigger retries, absence, or compatibility fallback.

    - `[ ]` **3.1.f Convert publication reconciliation classifiers**
        - Update `lib/user-sync/sync-state-merge.ts` and `lib/errand/merge.ts` to use `gitFailureText()` for their
          remote-unavailable and non-fast-forward predicates rather than `Error.message`.
        - Preserve the existing retry bounds, merge ownership, conflict handling, and `no-remote` / `failed`
          distinctions with both the legacy production binding and the later typed binding.
        - Build `test-first` (one behavior at a time):
            - Typed and faithful legacy push evidence preserves reconciliation and remote-unavailable outcomes;
              unrelated typed failures remain `failed` without consuming a retry.

    - `[ ]` **3.1.g Preserve explicit force-push remote guidance**
        - Update `handlers/user.ts`'s explicit-force rejection path to pass `gitFailureText()` into
          `isRemoteError()` instead of classifying `Error.message`.
        - Preserve handled-error and `UserPushBlockedError` behavior, the existing missing-remote guidance and exit
          status, and propagation of unrelated failures.
        - Build `test-first` (one behavior at a time):
            - Typed stderr and faithful legacy fallback evidence produce the established missing-remote guidance;
              unrelated typed failures rethrow, and stdout-only text carried by the bounded summary never selects
              the branch.

### `[ ]` **3.2 Reclassify bounded cancellation and timeout outcomes**

- _Goal:_ Timer-owning callers distinguish their own timeout aborts from all other execution failures through the
  normalized cancellation contract rather than Node error names.

    - `[ ]` **3.2.a Update the shared bounded Git helpers**
        - Replace `AbortError` name checks in `boundedFetch()` and `boundedGitInvocation()` with normalized
          cancellation narrowing. Report caller-derived `timeout` only when the helper-owned signal has actually
          fired and the rejection is the typed cancellation caused by that signal.
        - Build `test-first` (one behavior at a time):
            - A timer-triggered cancellation becomes `timeout`; earlier cancellation, execa-originated timeout,
              output-limit, non-zero, spawn, and unexpected errors remain `error` with their normalized rejection
              attached.

    - `[ ]` **3.2.b Update bounded user-notes ref inspection**
        - Have `boundedNotesRefFetch()` communicate an explicit helper-owned timeout outcome to
          `inspectUserSyncRefsDetailed()` only when its signal fired and produced a normalized cancellation; revise
          comments and tests that promise an `AbortError` name.
        - Build `test-first` (one behavior at a time):
            - Full-mode notes fetches still carry an `AbortSignal`; timer cancellation reports
              `remote-unavailable` / `timeout`; earlier cancellation and other failures report
              `remote-unavailable` / `error`.

### `[ ]` **3.3 Replace expected remote-ref and stale-lease stderr branches**

- _Goal:_ Expected Git outcomes are interpreted once by the invocation-aware normalizer and consumed only through
  its `absent-remote-ref` and `stale-lease` discriminants.
- **Additional Context:** `notes-cli-git-executor.md` § Expected outcome classification matrix

    - `[ ]` **3.3.a Convert worktree-fetch and branch-reconciliation outcomes**
        - Update `worktree-sync.ts` to return `branch-gone` only from normalized `absent-remote-ref`, preserving
          transient remote failures.
        - Update remote branch deletion to return `absent` and leased deletion to return `stale` only from the
          applicable typed discriminant; propagate authentication, connectivity, and unrelated failures unchanged.
        - Build `test-first` (one behavior at a time):
            - Typed branch-gone, absent-delete, and stale-lease outcomes remain benign or idempotent as established;
              message-only and wrong-invocation lookalikes no longer trigger those paths.

    - `[ ]` **3.3.b Convert user-notes deletion and publication-lease outcomes**
        - Replace stderr/message helpers in `commands/user/compact.ts` and `lib/user-sync/compaction.ts` with
          normalized absent-ref and stale-lease narrowing while preserving rollback and backup-ref recovery.
        - Route the broader remote-availability and local-CAS predicates through `gitFailureText()` while preserving
          their domain rules and the merge-conflict classifier; only expected remote absence and leased-push
          rejection move to executor-owned discriminants.
        - Build `test-first` (one behavior at a time):
            - Remote-already-absent cleanup remains successful, stale publication remains `lease-declined`, and
              other typed failures preserve the existing `no-remote` / `failed` distinction.

    - `[ ]` **3.3.c Convert user-notes fetch-ref outcomes and reporting**
        - Replace the remote-ref-not-found message branch in `inspectUserSyncRefsDetailed()` with normalized
          `absent-remote-ref`, retaining `local-ahead` when a remote notes ref disappeared.
        - Update `reportUserFetchOutcome()` in `handlers/shared.ts` to render missing-notes guidance only from the
          same typed outcome rather than re-reading the error message.
        - Build `test-first` (one behavior at a time):
            - Typed absence produces `local-ahead` during inspection and the established handler guidance;
              message-only and unrelated failures remain `remote-unavailable` / `error`.

### `[ ]` **3.4 Cut the live `GitExec` binding over to execa**

- _Goal:_ Production callers receive the prepared typed rejection contract only after every audited
  rejection-shape dependency can consume it safely.

    - Switch the exported production `gitExec` to the Phase 1 adapter and rerun the migrated-consumer slices through
      the live binding; retain `GitExec`, `ExecResult`, `GitExecOptions`, and ordinary injected function mocks.
    - Update `GitExecOptions`, `GitExec`, and `GitExecInput` TSDoc to describe the stable executor contract and
      execa-backed production behavior without promising Node `AbortError` or `child_process` rejection fields.
    - Remove the remaining private `execFile` binding, exported `execFileAsync` scaffolding, and obsolete
      `node:child_process` / `node:util` imports from `io-context.ts`. Rework or retire
      `io-context-mocks.test.ts` and update `isolated-unit-mock-files.ts` so tests no longer mock
      `node:child_process`.
    - Run the real compaction lease-race slice through the production execa-backed executor so stale publication is
      proven without a message fallback.
    - Build `test-first` (one behavior at a time):
        - Live success, non-zero, cancellation, output-limit, spawn, environment, and consumer compatibility cases
          pass through the execa binding.
        - The production compaction race yields `stale-lease`; no migrated classifier depends directly on a legacy
          error field or parses `GitProcessError.message`.

### `[ ]` **3.5 Prove typed failures remain actionable on display surfaces**

- _Goal:_ Existing display and audit-record consumers retain useful bounded Git failure context without becoming
  classification dependencies or requiring production rewrites.

    - Inject representative typed failures through `sync-orchestrator.test.ts`, `sync.test.ts`, and `diff.test.ts`
      to cover the untouched rendering/recording paths in `handlers/sync.ts`, `handlers/user-sync.ts`, and
      `commands/diff.ts`.
    - Assert the rendered or recorded message retains the bounded invocation label, kind and exit/signal disposition,
      plus stderr-or-stdout diagnostic evidence; do not assert platform-specific quoting or parse the display text
      back into domain behavior.

## **Phase 4:** Integration coverage and residual audit

_Purpose:_ Prove the completed production seam against controlled processes and close the audited scope without
absorbing raw bindings reserved for the cohort tail.

### `[ ]` **4.1 Complete the executor's real-process integration slices**

- _Goal:_ The final adapter behavior is proven against controlled subprocesses and real Git repositories rather
  than only shaped errors or mocked process factories.

    - Complete `git-executor.test.ts` through the production bindings using temporary repositories and controlled
      child behavior; avoid incidental wall-clock timing and platform-specific prose assertions.
    - Exercise argument-array execution, stdin-fed Git plumbing, arbitrary-byte output, output overflow, non-zero
      exit, spawn failure, cancellation, caller-owned timeout relabeling, and an absent-ref fetch against a local
      bare remote. Treat Task 3.4's real compaction lease race as the stale-lease integration slice.
    - Assert only the stable taxonomy, complete process-capped streams, diagnostic-projection bounds, exit metadata,
      and public seam results so quoting and signal implementation details may vary across supported platforms.
    - Add `git-executor.test.ts` to `packages/arc-framework/package.json`'s `test:portability` selector so the
      existing Linux, Windows, and macOS CI jobs run the focused cross-platform contract.

### `[ ]` **4.2 Audit the in-scope raw Git and failure-classification residue**

- _Goal:_ The audited migration closes completely without expanding into the raw binding sets reserved for
  `cli-substrate-complete-migration`.

    - Re-run source searches for `child_process`, `execFile`, `spawn`, `AbortError`, numeric rejection `code`, direct
      Git-rejection `Error.message` classifiers, absent-remote-ref text, stale-lease text, and failure-message exit
      parsing across every named binding and consumer. Raw process calls must be gone from the audited bindings;
      expected-outcome strings may remain only in the normalizer and faithful tests, while broader domain text
      classifiers receive evidence through `gitFailureText()`.
    - Confirm that standalone dev/CI scripts, the review-gate production executor, and unrelated non-Git process
      checks remain untouched. The review-gate allowance includes the Git paths in `runtime/production-io.ts` and
      `run-qualification.ts`; the latter's general non-Git `ProcessRunner` responsibility remains intact for its
      later targeted migration. Reusable raw-Git test helpers remain part of the cohort tail's support convergence;
      only the focused production-binding integration file moves in this work unit.
    - Run the focused unit/integration suites, full `npm test`, `npm run typecheck:all`, `npm run lint:ts`, and
      `npm run build` before handing the implementation to work-unit verification.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every audited raw production Git binding executes through execa 10, with no in-scope `child_process`
  `execFile` or `spawn` call remaining.

- `[ ]` `GitExec`, `GitExecInput`, `ExecResult`, and `GitExecOptions` remain compatible injectable Promise seams.

- `[ ]` Executor failures use the six settled `GitProcessError.kind` / `ArcError.code` pairs with executable and
  argument identity, numeric `exitCode`, signal and execa flags, complete process-capped streams, bounded diagnostic
  projections, and the underlying cause.

- `[ ]` Every audited numeric-exit, failure-output, and text-classification consumer uses normalized typed fields or
  `gitFailureText()` while preserving its established behavior with production and faithful injected shapes;
  `GitProcessError.message` is not a parsing ABI.

- `[ ]` The bounded `GitProcessError.message` remains actionable for untouched display and record consumers by
  retaining invocation, failure kind/status, and stderr-or-stdout diagnostic evidence without complete raw streams.

- `[ ]` Expected `absent-remote-ref` and `stale-lease` outcomes follow the invocation/signature matrix and are
  consumed through typed discriminants without consumer-side stderr matching.

- `[ ]` Bounded operations classify normalized cancellation correctly and apply caller-owned timeout labeling only
  when their own signal fired.

- `[ ]` Real-process integration coverage exercises stdin-fed execution, cancellation, timeout, output-limit,
  non-zero exit, absent-ref, stale-lease, full failure-output preservation, and bounded diagnostics through the
  Linux, Windows, and macOS portability command.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
