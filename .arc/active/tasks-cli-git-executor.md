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

### `[x]` **2.2 Migrate inherited-stdio worktree pushes**

- _Goal:_ Wrapped pushes continue streaming user-visible output and returning complete rejection evidence through
  the existing `PushWorktreeSpawn` seam without a raw `spawn()` implementation.

    - Replaced the inherited-stdio push binding with a `reject: false` execa adapter that streams stdin/stdout, tees
      and captures stderr once, preserves ordered arguments and `cwd`, and rejects only non-control failures.
    - Extended the injected spawn result with optional normalized evidence; real non-zero exits now preserve their
      typed status while legacy fakes retain the established generic-error fallback.

### `[x]` **2.3 Migrate direct handler Git invocations**

- _Goal:_ Installation diffing and release-commit orchestration use execa-backed bindings while preserving their
  user-facing exit, stream, hook, and retry behavior.

    - `[x]` **2.3.a Move installation diff execution onto execa**
        - Replaced the raw installation diff with a `reject: false` execa adapter that keeps exit `1` and complete
          diff output as domain data while normalizing spawn and other execution failures.

    - `[x]` **2.3.b Move release-commit Git processes onto execa**
        - Routed hook, Git-directory, and `HEAD` reads through the prepared executor, and rebuilt wrapped commits on
          a `reject: false` execa binding with optional stdin, inherited editor input, tee-and-capture streams, exact
          control exits, scrubbed repository context, and typed transport failures.

- _Outcome:_ The remaining direct in-scope handler bindings now use execa without changing their injected contracts
  or treating expected diff, hook, and commit exit statuses as transport failures.

## **Phase 3:** Rejection consumer adoption and live cutover

_Purpose:_ Move every audited rejection-shape consumer onto the normalization utilities, then replace the
production `gitExec` binding only after its thrown-error contract is safe for all named consumers.

### `[x]` **3.1 Normalize rejection-shape compatibility consumers**

- _Goal:_ Callers that depend on Node's numeric `code`, complete subprocess output, or raw failure text for domain
  decisions retain their behavior through explicit typed fields and the documented failure-text accessor.
    - `[x]` **3.1.a Convert ref and config rejection consumers**
        - Strict ref, ancestry, optional config, and local-branch probes now normalize failures and use numeric
          `exitCode`; remote-unavailable classification reads complete compatibility evidence.

    - `[x]` **3.1.b Preserve release-push exit status**
        - Release push now preserves typed numeric exits directly, retains fallback exit `1` for generic injected
          failures, and never parses an exit-like message.

    - `[x]` **3.1.c Preserve merge-file conflict output as domain data**
        - Merge-file conflict exit `1` now returns complete captured stdout while unrelated failures propagate as
          typed errors.

    - `[x]` **3.1.d Convert guarded user-fetch classifiers**
        - Guarded CAS, remote, non-fast-forward, and reconcile-repush predicates now consume `gitFailureText()`
          without changing retry, rollback, conflict, or no-remote behavior.

    - `[x]` **3.1.e Convert shared-state CAS and read classifiers**
        - Shared-state CAS, absent-tree-ref, and older-Git fallback predicates now consume complete typed or faithful
          legacy evidence while unrelated failures retain their established paths.

    - `[x]` **3.1.f Convert publication reconciliation classifiers**
        - Sync-state and errand publication reconciliation now classify remote and non-fast-forward evidence through
          `gitFailureText()` with retry bounds and failure distinctions unchanged.

    - `[x]` **3.1.g Preserve explicit force-push remote guidance**
        - Explicit force-push guidance now recognizes typed stderr and faithful legacy evidence while unrelated
          typed failures continue to propagate.

- _Outcome:_ Every audited compatibility consumer now reads structured status or complete failure evidence; bounded
  `GitProcessError.message` is display-only and message lookalikes cannot select domain branches.

### `[x]` **3.2 Reclassify bounded cancellation and timeout outcomes**

- _Goal:_ Timer-owning callers distinguish their own timeout aborts from all other execution failures through the
  normalized cancellation contract rather than Node error names.

    - `[x]` **3.2.a Update the shared bounded Git helpers**
        - Shared bounded helpers label timeout only when their controller fired and normalization reports
          cancellation; every other rejection remains a typed error outcome.

    - `[x]` **3.2.b Update bounded user-notes ref inspection**
        - Bounded notes fetches preserve their signal and distinguish timer cancellation from earlier cancellation
          and all other failures through explicit timeout/error outcomes.

- _Outcome:_ Timeout is now caller-owned state derived from both the fired signal and typed cancellation, preventing
  coincident or name-only failures from being mislabeled.

### `[x]` **3.3 Replace expected remote-ref and stale-lease stderr branches**

- _Goal:_ Expected Git outcomes are interpreted once by the invocation-aware normalizer and consumed only through
  its `absent-remote-ref` and `stale-lease` discriminants.
    - `[x]` **3.3.a Convert worktree-fetch and branch-reconciliation outcomes**
        - Branch-gone, absent deletion, and leased stale deletion now consume only invocation-aware expected outcome
          discriminants; authentication, connectivity, and unrelated failures propagate.

    - `[x]` **3.3.b Convert user-notes deletion and publication-lease outcomes**
        - Notes cleanup and publication now consume typed absence and stale-lease outcomes while preserving rollback,
          backup recovery, broader remote classification, and local CAS behavior.

    - `[x]` **3.3.c Convert user-notes fetch-ref outcomes and reporting**
        - Notes-ref inspection and missing-notes guidance now share the typed absence discriminant; message-only and
          unrelated failures remain ordinary remote errors.

- _Outcome:_ Expected absence and lease races are classified once from matching invocation plus stderr evidence and
  consumed without downstream text matching, including leased deletion precedence.

### `[x]` **3.4 Cut the live `GitExec` binding over to execa**

- _Goal:_ Production callers receive the prepared typed rejection contract only after every audited
  rejection-shape dependency can consume it safely.

    - Switched the exported production binding to execa, retained the injectable Promise seams, removed the private
      `execFile` scaffolding and obsolete child-process mock, and updated contract documentation.
    - The real compaction publication race now runs through production execa bindings and returns `lease-declined`
      from the typed stale-lease outcome while restoring the local ref.

### `[x]` **3.5 Prove typed failures remain actionable on display surfaces**

- _Goal:_ Existing display and audit-record consumers retain useful bounded Git failure context without becoming
  classification dependencies or requiring production rewrites.

    - Representative typed failures through sync audit, user-sync logging, and diff recording retain the bounded
      invocation, kind/status, and stderr-or-stdout evidence without platform-specific quoting assertions.

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
