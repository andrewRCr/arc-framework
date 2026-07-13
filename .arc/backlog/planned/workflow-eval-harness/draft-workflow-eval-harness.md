# Draft: Workflow Evaluation Harness

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); release-gates portfolio review identified the
  missing behavioral net over the agent-executed workflow layer.
- **Purpose:** Build a behavioral evaluation and regression harness for ARC's agent-executed workflows, beginning
  with a small pre-release scenario suite and growing toward CI-integrated coverage.

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
