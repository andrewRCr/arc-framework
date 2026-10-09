# Draft: E2E Build Coordination

- **Origin:** Two `USER-INBOX § Errand` captures grouped at the housekeep drain (2026-07-23), observed during
  `wu-rename` E2E convergence and concurrent `review-surface-binding` verification.
- **Purpose:** Give focused test invocations one unambiguous forwarding contract while ensuring concurrent E2E
  consumers never observe a missing or needlessly rebuilt CLI bundle.

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
