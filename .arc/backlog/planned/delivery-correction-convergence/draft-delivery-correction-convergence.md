# Draft: Delivery Correction Convergence

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-09-09); split from stacked-delivery correction-path
  dogfooding after `plan-segmentation` shipped.
- **Purpose:** Make a reviewed stacked-delivery correction converge across normalized rematerialization, public
  boundary renewal, machine-owned applicability effects, and hosted-response replay without weakening exact-head
  review authority.

---

## Inbound Buffer — Pending Integration

### Honor correction proof and supersession contracts during rematerialization

_Routed from `USER-INBOX § Errand`, 2026-09-09._

After record-to-coordinate projection was corrected locally, delivery suffix rematerialization refused only the
owning work unit's lifecycle paths. Canonical state binds the terminal member to the lifecycle-bearing work-unit
top, while eligibility deliberately closes its private candidate with those paths restored to the protected base.
Raw mechanical reapplication therefore contradicts the rematerializer's own normalized-completeness contract
before an otherwise-valid review fix can reserve. The design must settle how the already-derived lifecycle-path
group composes into terminal carry proof while every non-lifecycle divergence continues to refuse.

The first public member review exposes three related convergence failures:

- A correction verification acknowledgement requires the source boundary to have already advanced from
  `publication-pending` to `delivery-status-required`, but no documented transition establishes that future locus
  before the first correction.
- Persisting either `review-required` or record-only `covered` applicability moves the terminal head and immediately
  reopens applicability over the record effect itself, creating a self-invalidating loop even though the base did
  not move.
- Those later machine-owned Candidate-record commits make the durable correction target appear stale before the
  already-approved hosted response can replay.

Define one coherent correction path from rematerialization through verification acknowledgement, applicability
selection, record persistence, and final review request. Carry currentness across only proved machine-owned
record effects, keep the operator's selected outcome intact, and preserve the verified fix-response target across
the same exact record-only segment. Neither carry may represent a behavioral source delta as reviewed, and typed
operational refusals must remain distinguishable from unexpected executor failures.

---

## Pinned probes waiting on this work

`concurrent-integration-characterization` left two probes holding this boundary's behavior as it stands. They
**pass today** and the suite is green; each fails the moment the behavior changes, printing the sentence that
names what the probe was waiting for and the exact replacement:

> This now produces the result it was waiting for, so the hold is spent: replace this call with a plain
> assertion on `<result>`.

Retiring them is part of this work's scope rather than a regression — a fix here cannot merge while one is red,
and each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary.

- `delivery-position.test.ts` — "resumes the bound chain at a terminal top that advanced by an append-only commit"
- `delivery-terminal-recovery.e2e.test.ts` — "routes a record-only advance past the head the terminal binds"

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behavior neither shape names. That is a finding, not a retirement. The recorded
observations and the reasoning behind each awaited result are in
`notes-concurrent-integration-characterization.md` § Characterization ledger.
