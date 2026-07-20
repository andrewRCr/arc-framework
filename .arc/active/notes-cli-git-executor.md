# Notes: cli-git-executor

## execa 10 integration specifics

- ESM-only; the package is already `"type": "module"`, so import execa directly.
- Use the plain-Promise `(file, args[])` subprocess API. Older-major helpers are gone — no `execaCommand` or
  string-template forms; do not port assumptions from execa < 10.
- When a caller needs the raw child-process handle, reach it through execa's `nodeChildProcess` access path rather
  than a top-level property.
- Feed the stdin-fed bindings (`gitExecInput`, `writeGitNote`) through execa's `input` / stdin support — never shell
  interpolation.
- Cancellation surfaces as `isCanceled`; there is no `AbortError`-named rejection. `timedOut` reflects only execa's
  own `timeout` option (not adopted here — the seam keeps the `AbortSignal` timeout the caller owns).

## Alternatives considered (rejected)

- **Keep Node `execFile`:** viable, but repeated promise wrappers and under-specified errors remain.
- **Return `Result` from `GitExec`:** rejected for this member — the consumer ripple outweighs the focused executor
  gain (Result stays behind adapters).
- **Adopt a high-level Git library (simple-git / isomorphic-git):** rejected — ARC needs transparent Git semantics
  and already owns the domain orchestration.
- **Continue stderr matching:** rejected — localized / version-varying Git output is unreliable; centralize the
  interpretation at the executor seam instead.
