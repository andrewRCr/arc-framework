# Notes: cli-git-executor

## execa 10 integration specifics

- ESM-only; the package is already `"type": "module"`, so import execa directly.
- Use the plain-Promise `(file, args[])` subprocess API. Older-major helpers are gone — no `execaCommand` or
  string-template forms; do not port assumptions from execa < 10.
- Keep the default `GitExec` adapter rejecting on non-zero exit. Specialized diff, commit, and inherited-stdio push
  bindings use `reject: false` where a non-zero exit is domain data rather than an exceptional transport failure.
- When a caller needs the raw child-process handle, reach it through execa's `nodeChildProcess` access path rather
  than a top-level property.
- Feed the stdin-fed bindings (`gitExecInput`, `writeGitNote`) through execa's `input` / stdin support — never shell
  interpolation.
- Disable execa's final-newline stripping where current contracts preserve raw output, then apply the existing
  task-specific normalization.
- Cancellation surfaces as `isCanceled`; there is no `AbortError`-named rejection. `timedOut` reflects only execa's
  own `timeout` option (not adopted here — the seam keeps the `AbortSignal` timeout the caller owns). A caller labels
  timeout only after its own signal has fired and produced a canceled rejection.

## Rejection ABI and cutover

- Use one `GitProcessError` class with a fixed `kind` union and `ArcError.code` mapping:

| `kind`          | `ArcError.code`     | Meaning                                                                  |
|-----------------|---------------------|--------------------------------------------------------------------------|
| `canceled`      | `git.canceled`      | Canceled through the supplied signal                                     |
| `timed-out`     | `git.timed-out`     | execa's own timeout fired                                                |
| `output-limit`  | `git.output-limit`  | Captured output exceeded `maxBuffer`                                     |
| `nonzero-exit`  | `git.nonzero-exit`  | Process exited unsuccessfully or ended through an unrelated signal       |
| `spawn-failure` | `git.spawn-failure` | Process could not be started                                             |
| `unexpected`    | `git.unexpected`    | Rejection did not match a supported process or legacy/injected ABI shape |

- Numeric process status is optional `exitCode`; do not overload the kernel's string `code`. The exported immutable
  `GitProcessErrorInit` constructor object carries `kind`, `command: string`, `args: readonly string[]`, optional
  `exitCode: number`, optional `signal: string`, optional booleans `isCanceled` / `timedOut` / `isMaxBuffer`,
  optional string `stdout` / `stderr`, optional `expectedOutcome`, and optional `cause`. The class defaults
  flags/streams, derives `code`, bounded `message`, and diagnostic projections, and permits `expectedOutcome` only
  for `nonzero-exit`. `isGitProcessError(value)` is the public guard before narrowing by `kind` or
  `expectedOutcome`.
- Typed failures retain complete captured `stdout` / `stderr` up to the 64 MiB process ceiling because merge-file
  conflicts and push orchestration consume those streams as domain data. Separate truncated projections are the
  safe diagnostic/reporting surface.
- `normalizeGitRejection(value, { command, args })` accepts typed errors by identity, execa failures, and faithful
  legacy/injected rejection shapes. Precedence is typed identity, `timedOut`, `isMaxBuffer`, `isCanceled`,
  exited/signaled process, spawn failure, then unexpected. A non-cancellation signal is a `nonzero-exit` with no
  invented numeric status.
- `GitProcessError.message` is a deterministic, single-line display summary. It retains a bounded invocation label
  (`command` plus the first argument when present), the `kind` and available exit/signal disposition, and the first
  non-empty diagnostic projection (`diagnosticStderr`, then `diagnosticStdout`). Invocation and disposition retain
  reserved space while diagnostic evidence truncates to the selected cap; complete raw streams never enter the
  summary. `gitFailureText(value)` remains the explicit compatibility accessor for the audited non-expected
  classifiers: complete typed stderr, then legacy stderr, then legacy message. The expected outcome matrix reads
  only typed complete stderr and never the message fallback.
- On `isMaxBuffer`, preserve the partial `stdout` / `stderr` execa returns within the process ceiling, derive the
  diagnostic projections from those partial streams, and classify as `output-limit` without an expected outcome.
- Build and integration-test the execa-backed `GitExec` adapter first, migrate rejection-shape consumers through the
  normalization utilities while the legacy production binding remains live, then cut over the exported binding and
  remove its remaining `child_process` implementation.

## Compatibility classifier inventory

The expected remote-ref and lease outcomes move to `expectedOutcome`. These broader existing classifiers retain
their domain rules but receive evidence through `gitFailureText()` rather than `Error.message`:

- guarded ref-update CAS in `commands/user/push-fetch.ts` and `lib/user-sync/cas-retry.ts`;
- non-fast-forward and remote-unavailable reconciliation in `commands/user/push-fetch.ts`,
  `lib/user-sync/sync-state-merge.ts`, and `lib/errand/merge.ts`;
- remote-unavailable and local-CAS handling in `lib/user-sync/branch-bounded-notes-export.ts`,
  `commands/user/compact.ts`, and `lib/user-sync/compaction.ts`;
- absent tree-ref reads in `lib/git/ref-tree.ts`;
- the older-Git `--since-as-filter` fallback in `lib/user-sync/notes-ref.ts`;
- explicit force-push remote guidance in `handlers/user.ts`.

Expected-outcome fixtures use a typed error or a faithful legacy shape with process evidence. Broader classifier
fixtures may cover `gitFailureText()`'s documented legacy message fallback; that fallback is never promoted to an
expected outcome.

## Expected outcome classification matrix

| Executable and invocation context                | Exit evidence | Complete stderr signature                       | Outcome             |
|--------------------------------------------------|---------------|-------------------------------------------------|---------------------|
| `git fetch ...`                                  | `128`         | Remote ref cannot be found                      | `absent-remote-ref` |
| `git push` deletion (`--delete` or empty source) | Non-zero      | `remote ref does not exist`                     | `absent-remote-ref` |
| `git push` carrying `--force-with-lease...`      | Non-zero      | `stale info`                                    | `stale-lease`       |
| `git push` non-delete leased publication         | Non-zero      | `would clobber`, `fetch first`, or `[rejected]` | `stale-lease`       |

Classify against complete stderr before producing bounded diagnostic projections. The same executable arguments on
a non-Git command, a signature carried only in `message`, the same text on the wrong Git subcommand, or the broader
rejection signatures on a deletion push remain an ordinary unclassified non-zero exit.

## Alternatives considered (rejected)

- **Keep Node `execFile`:** viable, but repeated promise wrappers and under-specified errors remain.
- **Return `Result` from `GitExec`:** rejected for this member — the consumer ripple outweighs the focused executor
  gain (Result stays behind adapters).
- **Adopt a high-level Git library (simple-git / isomorphic-git):** rejected — ARC needs transparent Git semantics
  and already owns the domain orchestration.
- **Continue scattered expected-outcome stderr matching:** rejected — localized / version-varying Git output is
  unreliable; centralize the remote-ref and lease interpretation at the executor seam. Broader domain classifiers
  retain their established predicates but receive evidence through `gitFailureText()`.
