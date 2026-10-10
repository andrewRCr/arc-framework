# Draft: Workflow Evaluation Harness

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); release-gates portfolio review identified the
  missing behavioral net over the agent-executed workflow layer.
- **Purpose:** Build a behavioral evaluation and regression harness for ARC's agent-executed workflows, beginning
  with a small pre-release scenario suite and growing toward CI-integrated coverage.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Take `amend-design` as an early eval fixture**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: workflow-eval-harness`

- _Observation:_ The procedure-evolution check-doc names evals as the judgment layer's only correctness
  instrument, peer to typecheck and lint. `amend-design` is about to ship as the largest new judgment surface the
  corpus has added — an outcome-keyed five-step decision tree, three arms with distinct authority, a depth ladder,
  and a ceiling — reached from five detection sites plus a skill door. Nothing statically checks any of it, and its
  failure mode is quiet: a wrong arm costs either ceremony on a trivial fix or an unreviewed design change.

- _Approach:_ use it as an early fixture rather than a later one. The tree's steps are keyed to outcomes and are
  meant to be exclusive, which makes them unusually testable for judgment prose: a case that matches two steps, or
  none, is a defect in the tree rather than in the reviewer.

- _Captured during:_ `plan-amendment` task generation, forward-compat check against the procedure-evolution
  check-doc, 2026-09-11.

### `[ ]` **Reframe this WU as the type system for the prose layer**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: workflow-eval-harness`), housekeep drain (2026-07-18);
  captured during the architecture-direction discussion (2026-07-16).
- _Concern:_ the workflow corpus is a program with a stochastic interpreter. After determinism moves to the CLI
  (agenda compilation) and structure to typed contracts (`composable-workflows` D1), the judgment-prose residue
  cannot be statically verified at all — evals are its only correctness instrument. That makes the eval harness a
  correctness gate peer to typecheck/lint for the markdown corpus, not optional QA tooling.
- _Fold-in:_ fold this framing into the WU's motivation at grooming; reassess priority/sequencing relative to the
  `agent-context-optimization` cohort (evals become more load-bearing exactly as prose shrinks to judgment-only).

### `[ ]` **Evaluate the planning grounding and fix-check behaviors**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-03).

- _WU_Target:_ `workflow-eval-harness`

- _Observation:_ `grounded-planning-review` adds judgment-layer behavior with no instrument: author-run behavior-grade
  grounding, independent grounding inside each pass's rubric, an Owner-held fix check in rounds over each pass's
  fixes, a fold tag, and the fix-check recommendation. Its success signal is observational — the fix-borne share of
  later passes' majors against `storage-contract`'s share across its successor passes.

- _Approach:_ candidate cases — a draft with planted behavioral and propagation slips, and fold-introduced slips the
  fix check should catch before the next pass does.

- _Captured during:_ `grounded-planning-review` draft-design close, 2026-10-01 (draft at `725ddeaa9`).

### `[ ]` **Take the spec reader standard as a behavioral eval fixture**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ § Proposed Direction — which behaviors become eval fixtures, beside the buffer entry "Take
  `amend-design` as an early eval fixture".

- _Observation:_ The spec reader standard changes authoring/review judgment: a spec must be understandable without
  planning history while retaining every binding obligation and settled design decision. Static checks and
  adversarial design review do not establish whether executing agents follow that instruction. The evaluation
  harness is still planned, so this work explicitly retains the runtime-adherence evidence gap.

- _Approach:_ Exercise fresh authoring/review contexts against the reader standard's representative cases: foreign
  planning dependencies; own notes supplying hidden requirements; technical identifiers and section references;
  header and amendment tracking; an accessible layered PRD/RFC; and an explicitly unshipped prerequisite or ARC
  artifact name used as actual subject matter. Check reader independence and preservation of binding obligations.
  Include a grounding-only low-depth amendment invocation so selecting one review slice cannot skip the common
  reader check, a task-generation spec correction, and decomposition that authors a new member spec outside
  `create-spec`. Include extraction that retains a requirement while allocating away its required definition;
  check the prospective retained contract and exact finish preview before apply. Check the shared review over
  the affected footprint before the native approval boundary, without
  widening a local correction into an unrelated whole-spec review. Judge agent outputs rather than merely
  matching instruction text.

- _Files:_ `spec-spec-reader-standard.md`, archived with `spec-reader-standard`, carries the reader contract and
  example judgments. Package `create-spec`, `generate-tasks.template`, `decompose-work-unit`,
  `amend-design`, `spec-review`, and the four spec templates carry the resulting instructions after implementation.

- _Scope:_ Fixture candidate for the existing evaluation-harness work; no mechanical reference detector or new
  evaluation framework in the spec-reader work unit.

- _Captured during:_ `spec-reader-standard` draft-design, procedure/knowledge strategy check, 2026-10-03.

### `[ ]` **Take the rules whose wording pins retire as candidate eval cases**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ § Proposed Direction — the fixture inventory and its ranking, read with
  `prose-test-realignment`'s retired-pin inventory.

- _Observation:_ `prose-test-realignment` retires the tests that pin shipped guidance wording verbatim
  (`softWrappedProse(...)` and literal `toContain` phrase assertions across about 190 Markdown-reading test files).
  Those pins were the corpus's only guard on whether a reviewed rule survives an edit, and they never tested whether
  an agent follows it. The rules they pinned are a ready list of judgment-layer behaviors with no instrument.

- _Approach:_ at grooming, take that work unit's retired-pin inventory as candidate cases, ranked by the cost of the
  rule's failure; neither work unit waits on the other.

- _Captured during:_ `quality-gate-hooks` task generation, Pass 3 grounding audit, 2026-10-08.

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
