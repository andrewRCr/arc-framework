# Notes: review-chunking

## Contents

- [Terminology cascade — execution recipe](#terminology-cascade--execution-recipe)
- [Field evidence](#field-evidence)
- [Execution adjuncts routed elsewhere](#execution-adjuncts-routed-elsewhere)

## Terminology cascade — execution recipe

The spec keeps the cascade abstract ("grep at implementation time"); this is the concrete recipe so the executing
task does not re-derive it. **Re-grep at implementation time — that result is authoritative; the loci below are a
spec-time snapshot, not a hand list to apply blind.**

Reconcile the generic partitives that collide with the load-bearing `chunk` term — the **Work Unit** noun
("chunk of work") and the **review-increment** gloss ("bounded chunk of autonomous execution") — plus the existing
**delivery** usage ("chunk a routing sweep into multiple same-lane PRs"), which is a delivery split, not the
review-only `chunk`. Reconcile in **both** copies (`packages/arc-framework/arc/**` source and the `.arc/**`
instance); adopter-facing surfaces get the controlled term, internal-only surfaces (ADRs) get reconciled in the
`.arc/` copy only. Exclude `docs/` entirely: that stale, currently unmaintained publication surface is owned by the
dedicated `docs-content-sweep`, which will reconcile it in one coherent pass near public beta.

Known collision loci at spec time (grep `-i chunk`, then keep only the generic-partitive / routing-sweep hits —
the `review-chunking` / `chunked-delivery` / `chunk-scope-binding` files are the _new_ usages, not targets):

- `AGENT-BRIEF.ARC` — Work Unit vocabulary ("chunk of work") + review-increment gloss ("bounded chunk of work")
- `DEV-RULES.ARC` — review-increment "bounded chunk of autonomous execution"
- `strategy-work-organization` and `drain-inbox` — the "chunk a routing sweep … same-lane PRs" delivery usage
- `PROJECT-PRD` ("Work-unit PRDs, one per chunk of work"); accepted `adr-001`, `adr-019`, and `adr-021`
  (internal-only, exact meaning-preserving terminology corrections only)
- `assess-parallel-fit`; the templates `process-task-loop.template`, `PROJECT-PRD.template`,
  `TECHNICAL-OVERVIEW.template`

Preserve non-review technical uses such as context-retrieval/storage chunks in research and knowledge guidance.
Package templates follow their rendered classification: Framework outputs project normally; Scaffolded project
documents are edited independently and never overwritten from the package template.

Add the `chunk` entry to `AGENT-BRIEF.ARC` § Vocabulary (with the reserved `deliverable ⊂ chunk` / `stack` seam
note for `chunked-delivery`) as part of the same sweep.

## Field evidence

The motivating first-run field evidence — the 3-of-3 declaration-split false Criticals, the most-self-contained
372-line chunk reviewing most accurately, and the path-scoped / rate-limited provider regime the doctrine corrects
— lives in `analysis-review-chunking.md`. External-research synthesis remains in
`research-review-chunking.md`. The success signal's baseline expectation is seeded from the analysis; the paired
comparison re-runs both boundary strategies through independent carrier runs with the same local evaluator
configuration and identical fresh bounded-context protocol.

## Execution adjuncts routed elsewhere

Two field lessons are about _running_ a review, not _drawing_ a boundary, so they are **out of this WU's scope** —
routed to the `review-surface-binding` / `chunk-scope-binding` invocation seam. Keep them out of this WU's task
list and doctrine, but be aware they exist so they are not accidentally pulled in:

- **Type-check before triage** — discard compile-error findings wholesale before spending review judgment.
- **Guidance distinct from code criteria** — the review surface must present injected guidance and the
  code-evaluation criteria as separable, so guidance is not applied as a spec the code must satisfy.
