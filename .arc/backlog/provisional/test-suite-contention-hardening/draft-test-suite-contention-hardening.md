# Draft: Test-Suite Contention Hardening

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-10); accumulated from repeated full-suite failures
  during `merge-readiness-control` and related work.
- **Purpose:** Make full-suite verification reliable under the scheduling pressure created by concurrent worktrees
  and CI jobs.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Harden resource-heavy local gates against concurrent exhaustion**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- _Observation:_ Three concurrent full-project ESLint runs in detached delivery-gate worktrees each exited nonzero
  without diagnostics; serial reruns of all three passed. Concurrency correlation is established, but the exhausted
  resource or failure mechanism is not.

- _Approach:_ Reproduce concurrent versus serialized full-project ESLint with process exit, stderr, and host-resource
  evidence; then decide whether the existing heavy-test admission guard should generalize to resource-heavy gates or
  gate guidance and dispatch should serialize affected commands. Coordinate any gate-dispatch change with
  `quality-gate-hooks`.

- _Captured during:_ `test-suite-right-sizing` pre-verification discussion, from `evidence-applicability`
  dogfooding, 2026-09-12.

- _WU_Target:_ `test-suite-contention-hardening`

### `[ ]` **Make the end-to-end subprocess budget tolerant of a loaded machine**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: test-suite-contention-hardening`), housekeep drain (2026-09-30);
  captured during `local-ci-capacity-qualification` Task 3.3, 2026-09-08.
- _Observation:_ `__tests__/e2e/helpers.ts` kills a spawned CLI after a fixed 10 000 ms and the tests assert it did
  not time out; `command-input-no-input.e2e.test.ts` alone passes that budget at twelve call sites. The subprocesses
  finish in roughly 5.6 s at rest, so the margin is about 2x. Measured on the Mac mini guest: two of 36 jobs failed
  the assertion when three anchors ran concurrently (1.90x slowdown, implying ~10.6 s), while 13 solo, 8 two-slot,
  and 16 four-slot jobs passed. The CLI behaved correctly in every failure — right stderr, right exit code — only
  slowly.
- _Observation:_ not currently reached in CI. Every failed job across the last 120 workflow runs was checked on both
  routes and none carries the signature; hosted gives each job a dedicated machine. It becomes reachable the moment
  several jobs share one host, which is exactly what a local runner does.
- _Approach:_ settle a load-relative or environment-scaled budget that keeps the prompt-termination guard while
  removing machine-load fragility, including whether other suite wall-clock assumptions share the exposure. A
  simple unconditional increase would weaken the guard it is meant to preserve.
- _Observation:_ blocks nothing today, but it is what caps the Mac mini at two runner slots rather than three — a
  9.4 percent throughput difference — so it has a concrete payoff if the local runner ships.
- _Follow-up evidence:_ PR #588's first E2E shard-3 run timed out after 30 seconds in
  `errand.e2e.test.ts`'s foreign-generation promotion test while the self-hosted runner was loaded. The complete
  file passed locally (47 tests in 77.38 seconds), and the unchanged shard passed on its one-job rerun (5m05s).
  This exposes the same load-relative fragility at Vitest's per-test budget, not only the helper's 10-second
  subprocess budget, and should be included when auditing other fixed wall-clock assumptions.
- _Additional evidence captured during:_ `recover-integration-context-across-staged-archive-sweep` Errand,
  PR #588, 2026-09-10.

---

## Evidence

Intermittent failures appeared across unrelated subprocess-heavy integration and E2E tests, passed in isolation,
and reproduced locally and on the self-hosted runner. Observed modes included 5-second integration timeouts, a
150-second E2E timeout, a missing holder PID, a subprocess validation error, and cleanup racing a write into a temp
directory.

The strongest common trigger was concurrent full suites: under machine load, every failure in one captured run was
a timeout and the affected files passed immediately in isolation. Two frequent offenders also ran with little
margin against their configured ceilings; raising those ceilings removed known pressure-sensitive failures without
loosening behavioral assertions. Some non-timeout sightings may remain distinct and should not be explained away by
contention alone.

## Direction

- Measure duration-to-timeout headroom across the suite before pursuing test-specific theories.
- Reproduce contention deliberately with concurrent suites from separate worktrees and compare against a serialized
  control.
- Decide between repository-wide suite serialization, contention-aware CI scheduling, and timeout sizing with a
  documented safety margin.
- Audit remaining non-timeout failures separately for inherited environment, missing readiness waits, and temp-tree
  cleanup ownership.
- Preserve strict stderr and behavioral assertions; address scheduling and synchronization rather than accepting
  unexplained output.

## Commitment Boundary

This remains provisional until controlled reproduction distinguishes the shared contention class from the residual
test-specific failures and establishes which coordination layer should own the remedy.

---
