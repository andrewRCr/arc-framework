# Draft: Workflow Evaluation Harness

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); release-gates portfolio review identified the
  missing behavioral net over the agent-executed workflow layer.
- **Purpose:** Build a behavioral evaluation and regression harness for ARC's agent-executed workflows, beginning
  with a small pre-release scenario suite and growing toward CI-integrated coverage.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Reframe this WU as the type system for the prose layer**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: workflow-eval-harness`), housekeep drain (2026-07-18);
  captured during the architecture-direction discussion (2026-07-16).
- _Concern:_ the workflow corpus is a program with a stochastic interpreter. After determinism moves to the CLI
  (agenda compilation) and structure to typed contracts (`composable-workflows` D1), the judgment-prose residue
  cannot be statically verified at all — evals are its only correctness instrument. That makes the eval harness a
  correctness gate peer to typecheck/lint for the markdown corpus, not optional QA tooling.
- _Fold-in:_ fold this framing into the WU's motivation at grooming; reassess priority/sequencing relative to the
  `agent-context-optimization` cohort (evals become more load-bearing exactly as prose shrinks to judgment-only).

---

## Problem

The Markdown workflows are shipped product behavior, but today they are validated through self-hosted dogfooding and
manual burn-in only. Static checks cannot detect that a workflow, method, or rule edit changed agent behavior. Once
package updates reach external installations without a dogfooding-first window, that gap becomes a release-safety
problem as well as a quality gap.

`finalize-parallelism` burn-in probes provide a manual precedent to mechanize. The design space is not yet grounded:
scenario fixtures, assertion checks versus judge scoring, golden transcripts, and drift tolerance need a bounded
research pass before implementation.

## Proposed Direction

1. Survey current evaluation-harness idioms and choose a deterministic-first contract.
2. Build a minimal seed over the highest-traffic workflows: session initialization, task execution, and handoff.
3. Make the seed runnable on demand and before publish; expand toward CI only after its signal quality is proven.
4. Coordinate with `knowledge-lint`: static reference integrity and behavioral evaluation may form one operation
   family, but neither should absorb the other's distinct evidence model.
5. Coordinate fixture/golden placement with `knowledge-architecture` and pre-publish placement with the release
   flow.

## Release Posture

Research plus a minimal seed is strongly preferred before the first public gate; a fuller harness is required before
the later public-release gate. The WU is planned because that sequencing commitment is now explicit.

---
