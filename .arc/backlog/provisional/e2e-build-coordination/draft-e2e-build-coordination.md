# Draft: E2E Build Coordination

- **Origin:** Two `USER-INBOX § Errand` captures grouped at the housekeep drain (2026-07-23), observed during
  `wu-rename` E2E convergence and concurrent `review-surface-binding` verification.
- **Purpose:** Give focused test invocations one unambiguous forwarding contract while ensuring concurrent E2E
  consumers never observe a missing or needlessly rebuilt CLI bundle.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Drive the end-to-end tier's CLI invocations in-process where no process boundary is asserted**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- _WU_Target:_ `in-process-cli-harness (planned)`

- _Observation:_ the E2E tier spawns the built CLI roughly a thousand times. Measured 2026-09-10,
  tier-isolated on a quiet machine: 280.3 s wall / 1 784 s summed CPU across 53 files and 528 cases — 79% of the
  full local run (~353 s) and the dominant CI compute cost. Per-spawn fixed cost is ~0.36 s. Nothing in
  `test-suite-right-sizing`'s scope moves this materially: lazy-loading handler modules reaches ~0.21 s per spawn
  (~42% of per-spawn cost, but only ~6% of the tier), CI leg rebalancing is worth ~25 s of critical path, and a
  tmpfs fixture root measured 0.5% on this tier. The only lever that materially moves CI compute is not spawning
  the CLI at all for most scenarios.

- _Approach:_ drive verb cores in-process for scenarios that only need handler-seam outcomes, reserving real
  subprocess spawns for the minority genuinely asserting process-boundary behavior — exit codes, stdout/stderr
  framing, signal handling, TTY detection — and for destructive verbs, which stay at E2E per `testing-standards`.
  External research on 2026-09-10 independently identified this as the highest-leverage move for a suite that
  spawns a CLI at this volume, ahead of any startup optimization.

- _Depends on:_ `test-suite-right-sizing`, on two distinct grounds. It needs that work unit's cost instrument to
  know which scenarios are worth converting and what each is worth; and its payoff is contingent on that work
  unit's lazy-loading direction, which already removes ~42% of the per-spawn cost this harness would eliminate
  entirely — so the remaining prize must be re-derived after that lands rather than assumed from today's numbers.

- _Closed alternatives (measured or sourced 2026-09-10 — recorded so they are not re-litigated):_ Node startup
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

- _Known risk:_ process isolation under Vitest's pools. An in-process harness shares module state, cwd, and
  process-level globals across tests within a worker; the design must settle per-test cwd, env and module-registry
  isolation, and what happens to tests that mutate process state. This is why it was recorded as an escalation
  rather than adopted directly.

- _Class:_ `Heavy` — a real design must be authored (the seam, the isolation model, the conversion criterion), but
  it composes from established in-process-harness patterns rather than inventing new concepts, so not `Novel`.

- _Routing note:_ create with `--commitment planned` **and** a real `draft-in-process-cli-harness.md` pointed to by
  `Design`. A bare planned stub emits `Design: [none]`, which start graduation then refuses with
  `planning-tuple: design-mismatch`.

- _Evidence:_ per-file measurement JSON for all three tiers plus tmpfs and no-isolate variants, published as
  `analysis-test-suite-cost-baseline.md` by `test-suite-right-sizing`.

- _Captured during:_ `test-suite-right-sizing` create-spec, 2026-09-10.

### `[ ]` **Place the rebuild-before-commit sequence in session-loaded guidance**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-08-10); captured during
  `delivery-slice-review-vehicle` execution.
- _Concern:_ the self-hosting staleness guard can correctly refuse a commit after source edits, but the recovery
  sequence is not stated where an agent preparing that commit already reads. Integrate the minimal
  build-before-commit instruction into the coordination contract and keep the behavior unchanged.

### `[ ]` **Define freshness inputs beyond first-party source files**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10); captured during
  `staleness-guard-policy` draft review.
- _Concern:_ the stamp hashes `src/**/*.ts`, while bundle output can also change through build configuration,
  dependency resolution, and other selected inputs. Hashing all of `node_modules` is not viable, and package-lock
  identity may be too coarse.
- _Fold-in:_ define what “fresh for this bundle” means, then align the stamp and E2E freshness proof with the
  minimal stable input set. Keep this separate from message wording and rebuild-publication mechanics.

---

## Problem / Motivation

The focused-test loop currently pays two separate coordination costs:

1. Root-level Vitest arguments can be consumed by npm configuration parsing or forwarded as positional filenames.
   A test-name filter such as `-t` therefore does not reliably reach Vitest, and path/flag combinations require
   repeated command-shape experiments.
2. E2E global setup rebuilds the CLI even after the caller has explicitly produced a fresh bundle. Concurrent test
   processes can also invoke the build together; because `tsup` cleans `dist/` before emitting, one process can
   remove `dist/cli.js` while another suite is spawning it and cause unrelated `ENOENT` failures.

The two failures share the E2E build/freshness boundary: one process should publish a proven-fresh bundle once, and
all consumers should observe either the prior complete bundle or the replacement, never an empty handoff.

## Direction

- Expose a repository-root test command whose Vitest paths and flags forward literally without npm interpreting
  them as configuration.
- Let E2E setup prove bundle freshness before rebuilding, while retaining a fail-safe rebuild for missing or stale
  output.
- Serialize cross-process builders with a lock or produce-and-atomically-swap strategy.
- Add regression coverage that overlaps two build consumers and proves both can spawn the CLI throughout the
  publication handoff.

## Composition

`workspace-tool-paths` owns repository-root versus workspace-relative path normalization. This WU owns Vitest flag
forwarding and the E2E build/freshness/publication boundary; planning should preserve that seam rather than duplicate
the focused-path contract.

## Open Questions

- Is a cross-process lock sufficient across every supported platform, or does atomic publication provide a simpler
  portability contract?
- What evidence establishes freshness without weakening the requirement that E2E tests exercise the current
  source?

---
