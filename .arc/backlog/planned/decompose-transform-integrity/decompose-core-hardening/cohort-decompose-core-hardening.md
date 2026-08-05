# Cohort: `decompose-core-hardening`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `decompose-transform-integrity`

**Purpose:** Close the post-ship safety, operability, performance, and authoring gaps exposed when the v3
decomposition transform met real work-unit cuts. These members all harden the shipped core contract; they remain
separate because conservation, finalization diagnostics, execution cost, preflight cost, and authored cut-map
expressiveness can each land and be verified independently.

---

## Coordination

Every member consumes the shipped `decompose-transform-integrity` core. No member may weaken its pinned-ref,
conservation, receipt, prospective-projection, or fail-closed publication contracts to obtain a cheaper or more
convenient path.

### Sequencing

```text
decompose-transform-integrity (shipped core)
├── decompose-conservation-coverage
├── decompose-finalization-diagnostics
├── decompose-finalization-scaling
├── decompose-preflight-scaling
└── decompose-authoring-expressiveness
```

The members are independently deliverable, with one ordering constraint recorded in member metas: finalization
diagnostics and finalization scaling both measure themselves against the finalization pipeline that
`decompose-transition-record` reshapes, so they hold on that work unit. Optimizing or diagnosing a surface whose
shape is unsettled prices the wrong thing. Conservation coverage, preflight scaling, and authoring expressiveness
carry no such edge.

Beyond that, safety and operability findings should land before performance or authoring work when they touch the
same core surface; further dependency edges belong in member metas if implementation grounding reveals a hard
order.

### Shared contracts

- The shipped core remains authoritative for inventory, allocation, preparation, finalization, receipt,
  retirement, prospective projection, and publication semantics.
- Conservation coverage owns the definition of what content retirement must prove preserved. Diagnostics and
  authoring consume that boundary without redefining it.
- Scaling work may batch, cache, or bound concurrency only behind byte-identical and order-identical outcomes.
- Refusal improvements preserve fail-closed behavior while making locus, differing evidence, and the correct next
  action explicit.

### Soft coordination

Use real-domain executions as the evidence floor: these gaps survived synthetic fixtures and surfaced on the
first actual cuts. Rehearsals may operate on copies when a destructive transition would otherwise be required.

### Cross-cohort

- `decompose-transition-record` replaces the sealed receipt with a lean record of authored transition intent and
  retires the apparatus built around the heavier shape. Members consuming receipt, preparation, or finalization
  evidence should confirm which of those surfaces survive before designing against them.
- `decomposition-doctrine` owns when and at what maturity a cut is valid, including dependency-contract
  revalidation and scale-overrun prevention. This subcohort owns the transform after that decision.
- `delivery-intent-integrity` owns the general requirement that a delivered operation be exercised against a
  real domain instance; these members supply decomposition's field evidence.
- `roadmap-tooling` owns branch-carried projection and render-stamp architecture. Finalization diagnostics should
  consume its decisions rather than creating a decomposition-only projection rule.

### Closeout criteria

The subcohort closes when every member has shipped and a representative real cut demonstrates preserved complete
artifact-group content, bounded preflight and finalization cost, actionable refusals, and an authored cut map that
can express intended destination structure and external dependencies without post-publication repair.

## Members

### `decompose-conservation-coverage`

_Exposes:_ a retirement-aligned conservation boundary for every origin artifact whose content would be removed.

_Consumes:_ core inventory, allocation, retirement-delta, and receipt evidence.

Conservation proof carries more weight than its current draft assumes: once transaction verification is no longer
duplicating git's own record, this boundary is the only remaining net under a content-preserving split. Size the
member against that role rather than against the drafted scope.

### `decompose-finalization-diagnostics`

_Exposes:_ locus-aware refusals, actionable remedies, evidence differences, and scoped repository gating.

_Consumes:_ core finalization verdicts plus projection decisions owned by `roadmap-tooling`.

### `decompose-finalization-scaling`

_Exposes:_ bounded subprocess and concurrency behavior for managed-path projection and staged-path discovery.

_Consumes:_ core canonical ordering, Git pathspec semantics, and fail-closed finalization behavior.

### `decompose-preflight-scaling`

_Exposes:_ measured and bounded branch, locator, content-scan, and repository-hydration cost.

_Consumes:_ core preflight integrity and pinned-ref reread contracts.

### `decompose-authoring-expressiveness`

_Exposes:_ prospective destination placement and validated external dependency edges in the authored cut map.

_Consumes:_ core allocation, topology, scaffold, prospective-projection, and receipt contracts.

---
