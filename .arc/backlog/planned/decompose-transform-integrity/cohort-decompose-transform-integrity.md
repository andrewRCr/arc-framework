# Cohort: `decompose-transform-integrity`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Preserve one durable mental and delivery anchor for the program split from
`decompose-transform-integrity`. The shipped origin owns the trustworthy v3 retirement core; direct members
deliver independently safe extensions, while `decompose-core-hardening` coordinates post-ship safety,
operability, performance, and authoring gaps exposed by real cuts.

---

## Coordination

The shipped core and each remaining member's spec and meta are the planning authorities for this program.
Transform receipts govern individual cuts; they do not replace cohort coordination or member lifecycle state.

### Sequencing

```text
decompose-transform-integrity (shipped core)
├── decompose-base-mobility ─────────┐
├── decompose-extraction             ├── ready after the core
├── decompose-durable-consumers ─────┘
├── decompose-planning-lane ◀────────── after base mobility
└── decompose-core-hardening ────────── independently deliverable post-core members
```

Base mobility, extraction, durable consumers, and the hardening members are independently ready after the shipped
core. Planning-lane admission remains reviewed and disabled until base mobility lands.

Current readiness is derived from member metas and `Depends On`, not from this orientation view.

### Shared contracts

- `decompose-transform-integrity` owns the closed v3 cut-map, preparation, receipt, validator, exact-base
  retirement, topology, planning-profile, finalization, publication, overlay, exact-base integration anchor, and
  workflow contracts consumed by every member.
- `decompose-base-mobility` owns movement of a canonical finalized candidate across base advancement and extends
  the shared integration anchor to a descendant current base.
- `decompose-extraction` reuses the core inventory, allocation, profile, topology, and exact-base result substrate
  without importing retirement evidence. Its surviving origin remains the durable anchor and it creates no
  extraction receipt.
- `decompose-planning-lane` consumes canonical v3 validation plus base mobility to grant an optional host-side
  exception. Until it lands and is explicitly installed, decomposition remains reviewed.
- `decompose-durable-consumers` consumes finalized v3 transition authority without changing authoring,
  finalization, or landing semantics.
- `decompose-core-hardening` consumes the same shipped core and closes real-cut gaps without folding optional
  performance or authoring changes back into the core's already-landed authority spine.

### Soft coordination

The receipt-backed launch handoff stores logical anchor identity, exact publication entries, and the distribution
interlock's typed initial-continuation disposition. Member metas remain authoritative for current membership,
dependencies, priority, workflow, and lifecycle state; launch and status surfaces recompute ready and blocked
frontiers from the landed base.

Extraction intentionally has no retirement receipt. Its separate member must retain that conservative boundary
and must not fabricate publication evidence merely to automate launch.

### Closeout criteria

The cohort closes when every direct member and every `decompose-core-hardening` member has shipped, ordinary
installs still default to reviewed decomposition, and the transform presents an origin-addressable anchor plus an
exact current launch frontier without a scheduler or status record.

## Members

### `decompose-base-mobility`

_Exposes:_ append-only committed-unlanded refresh, descendant-base landing, and descendant-current-base extension
of the shared integration anchor.

_Consumes:_ canonical v3 evidence, transition patch, validation verdicts, and typed recovery actions from
`decompose-transform-integrity`.

### `decompose-extraction`

_Exposes:_ additive-first extraction and independently retryable byte-preserving source finish.

_Consumes:_ the core inventory, allocation, profile, topology, result-planning, and workflow contracts without
retirement receipt authority.

### `decompose-planning-lane`

_Exposes:_ an explicitly installed, exact-head `arc-cleared` planning-lane exception for one canonical
decomposition receipt.

_Consumes:_ core v3 validation and base-mobility exact-ref/descendant-base proof.

### `decompose-durable-consumers`

_Exposes:_ bounded receipt enumeration, narrow historical narrative reconciliation, and live-ancestry-safe remote
teardown.

_Consumes:_ canonical finalized receipt decoding, terminal transition resolution, integration-anchor proof, and
receipt-backed retirement authority.

---
