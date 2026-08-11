# Cohort: `decompose-core-hardening`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** `decompose-transform-integrity`

**Purpose:** Close the post-ship safety, operability, performance, and authoring gaps exposed when the v3
decomposition transform met real work-unit cuts. Two members harden the shipped core contract: the
conservation/authoring spine (safety, expressiveness, and refusal quality as one deliverable with separable arms)
and a measure-first cost stub. They remain separate because content-safety work and cost work land and verify
independently.

---

## Coordination

Every member consumes the shipped `decompose-transform-integrity` core. No member may weaken its pinned-ref,
conservation, receipt, prospective-projection, or fail-closed publication contracts to obtain a cheaper or more
convenient path.

### Sequencing

```text
decompose-transform-integrity (shipped core)
├── decompose-conservation-coverage ──── conservation boundary + cut-map expressiveness + refusal remedies
└── decompose-scaling ────────────────── measure first; bound or retire each half on the numbers
```

Both members are independently deliverable and carry no dependency edges. The set was consolidated at the
2026-08-11 residuals consolidation, after `decompose-transition-record` shipped and settled the finalization
pipeline the former hold was waiting on (see § Retired and merged members). Safety and operability arms land
before performance work when they touch the same core surface; further dependency edges belong in member metas if
implementation grounding reveals a hard order.

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

The subcohort closes when every member has either shipped or been retired against a recorded disposition, and a
representative real cut demonstrates the properties its shipped members own — preserved complete artifact-group
content, bounded preflight and finalization cost, actionable refusals, and an expressive authored cut map —
without post-publication repair. A retired member's property is recorded as out of scope with the retirement
rather than demonstrated.

## Members

### `decompose-conservation-coverage`

_Exposes:_ a retirement-aligned conservation boundary for every origin artifact whose content would be removed,
prospective destination placement and validated external dependency edges in the authored cut map, and actionable
refusals — differing evidence, precomposed remedies, and scoped repository gating.

_Consumes:_ core inventory, allocation, retirement-delta, topology, scaffold, and prospective-projection
contracts, plus projection decisions owned by `roadmap-tooling`.

Conservation proof is the only remaining net under a content-preserving split now that transaction verification no
longer duplicates git's own record; size the member against that role rather than the drafted scope. The
refusal-baseline arm proceeds independently; the explicit-disposal-record alternative would carry an authored
disposition in the transition record, which is unsealed, so coordinate with that landed schema before adopting it.

### `decompose-scaling`

_Exposes:_ measured and bounded subprocess, concurrency, and hydration cost across the command's read-only
preflight and terminal execute halves.

_Consumes:_ core preflight integrity, pinned-ref reread, canonical ordering, Git pathspec semantics, and
fail-closed finalization behavior.

Measurement precedes design: the execute-half numbers predate the transition record's projection retirement, and
that half may retire on fresh evidence. Bounding lands only behind byte-identical, order-identical outcomes.

## Retired and merged members

Recorded dispositions per the closeout criteria, applied at the 2026-08-11 residuals consolidation:

- **`decompose-finalization-diagnostics`** — absorbed into `decompose-conservation-coverage`. Its hidden-locus
  gap retired with `--finalize` (the surviving modes leave no second locus to mis-name); the surviving
  mismatch-evidence, refusal-remedy (92 typed codes), and scoped-gating scope moved to the spine, resolving the
  refusal-text duplication with the former authoring member.
- **`decompose-authoring-expressiveness`** — absorbed into `decompose-conservation-coverage`. The locator and
  external-edge gaps survive and moved to the spine; the meta-edit half retired with the sealed projection that
  defined it.
- **`decompose-finalization-scaling`** and **`decompose-preflight-scaling`** — merged into `decompose-scaling`.
  One measurement harness and one Git-subprocess-fan-out concern across two halves of the same command; the
  execute half's recorded numbers are stale against the lean record and re-measure before any design.

---
