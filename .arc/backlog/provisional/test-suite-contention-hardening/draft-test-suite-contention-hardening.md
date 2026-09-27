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
