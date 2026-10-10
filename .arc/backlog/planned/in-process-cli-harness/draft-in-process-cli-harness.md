# Draft: In-Process CLI Harness

- **Origin:** re-triaged out of `e2e-build-coordination`'s inbound buffer at the housekeep drain (2026-10-09); routed
  there from `USER-INBOX § Work Unit` (2026-09-16), captured during `test-suite-right-sizing` create-spec,
  2026-09-10.
- **Purpose:** Drive the end-to-end tier's CLI invocations in-process wherever no process boundary is asserted.

---

## Problem / Motivation

The E2E tier spawns the built CLI roughly a thousand times. Measured 2026-09-10,
tier-isolated on a quiet machine: 280.3 s wall / 1 784 s summed CPU across 53 files and 528 cases — 79% of the
full local run (~353 s) and the dominant CI compute cost. Per-spawn fixed cost is ~0.36 s. Nothing in
`test-suite-right-sizing`'s scope moves this materially: lazy-loading handler modules reaches ~0.21 s per spawn
(~42% of per-spawn cost, but only ~6% of the tier), CI leg rebalancing is worth ~25 s of critical path, and a
tmpfs fixture root measured 0.5% on this tier. The only lever that materially moves CI compute is not spawning
the CLI at all for most scenarios.

## Direction

Drive verb cores in-process for scenarios that only need handler-seam outcomes, reserving real
subprocess spawns for the minority genuinely asserting process-boundary behavior — exit codes, stdout/stderr
framing, signal handling, TTY detection — and for destructive verbs, which stay at E2E per `testing-standards`.
External research on 2026-09-10 independently identified this as the highest-leverage move for a suite that
spawns a CLI at this volume, ahead of any startup optimization.

## Dependencies

`test-suite-right-sizing`, on two distinct grounds. It needs that work unit's cost instrument to
know which scenarios are worth converting and what each is worth; and its payoff is contingent on that work
unit's lazy-loading direction, which already removes ~42% of the per-spawn cost this harness would eliminate
entirely — so the remaining prize must be re-derived after that lands rather than assumed from today's numbers.

`test-suite-right-sizing` has since shipped, so the remaining prize is re-derived against its lazy-loading result
at planning.

## Closed Alternatives

Node startup
snapshots and Single Executable Applications are dead for this CLI's shape — an ESM entry throws
`SyntaxError` outright, the builder loads built-ins "but not additional user-land modules" which excludes
externalized npm dependencies, `node:child_process` is unsupported and `execa` depends on it, the blob is locked
to an exact Node version, arch and platform, and SEA cannot back an npm `bin` that must stay a `.js` file
(`nodejs/node#44277` and `nodejs/help#3981` both closed "not planned"). `NODE_COMPILE_CACHE` caches compilation,
not module evaluation — measured 0.35 s to 0.29 s, with verified comparators at 6–20%. esbuild code splitting is
worth ~0.02 s per real-verb spawn; its apparent large win was a `--version`-path artifact, and the suite never
spawns `--version`. The irreducible floor short of in-process invocation is ~0.12 s per spawn: the bundle's 532
hoisted top-level imports of nine external dependencies, which ES module semantics evaluate before any module
body runs.

## Known Risk

Process isolation under Vitest's pools. An in-process harness shares module state, cwd, and
process-level globals across tests within a worker; the design must settle per-test cwd, env and module-registry
isolation, and what happens to tests that mutate process state. This is why it was recorded as an escalation
rather than adopted directly.

## Class

`Heavy` — a real design must be authored (the seam, the isolation model, the conversion criterion), but
it composes from established in-process-harness patterns rather than inventing new concepts, so not `Novel`.

## Evidence

Per-file measurement JSON for all three tiers plus tmpfs and no-isolate variants, published as
`analysis-test-suite-cost-baseline.md` by `test-suite-right-sizing`.
