# ADR-029: Right-Size Review Authority

## Status

Accepted (2026-07-24).

## Context

[ADR-028] chose an App-owned evidence gate that would deterministically reconstruct review evidence, qualification,
findings, and closure into merge truth. Implementation exposed a proportionality problem: proving every review
judgment mechanically required a resident controller, receipt ledger, provider-specific reconstruction, repair
machinery, and operational rollout substantially larger than the review behavior it protected.

Some review decisions are inherently contextual. Whether an exact later-head delta preserves prior coverage, needs a
focused supplement, or warrants a complete pass depends on interaction risk and the substance of the change. Making
those decisions machine-provable does not remove judgment; it adds proxy rules and evidence churn around judgment
that an operating agent can usually make directly. Defaulting uncertain mechanics to a human permission turn would
also add friction without improving authority when the choice is bounded by existing permissions and budgets.

The repository still needs deterministic execution, reliable source ordering, exact-head invalidation, and a
deliberate merge lock. It does not need advisory review output to become autonomous merge truth.

## Decision

We will divide review authority by the kind of decision being made.

1. The CLI owns deterministic mechanics: immutable target and guidance bindings, source ordering, one-source-per-pass
   dispatch, bounded await, safe availability fallback, result normalization, thread settlement, pass accounting,
   lifecycle readiness, and exact-head lock/unlock operations.
2. The operating agent owns bounded applicability and review-strength judgment. It may select targeted verification,
   focused supplementation, or complete review within existing authority and budgets, proceeds without a permission
   stop when confident, and discloses the choice. Material uncertainty, new authority, or exceptional cost surfaces
   to the human.
3. The human retains mutation and commitment authority: finding-driven fixes, durable deferrals, external settlement,
   exceptional pass-ceiling overrides, final disposition, and integration.
4. `arc-cleared` is a thin lifecycle lock for the exact current candidate. A push re-locks the reviewed head, and the
   pinned default-branch workflow unlocks only a lifecycle-ready exact head after the final human interlock. The
   status is not proof of provider evidence and grants no autonomous merge authority.
5. No resident review controller, dedicated GitHub App, evidence ledger, eligibility oracle, or fix-carry proof model
   is part of this architecture. Review remains visible through the final pull-request disclosure record.

## Consequences

### Positive

- Review mechanics remain deterministic and testable without forcing contextual judgment into proxy evidence rules.
- Confident bounded decisions do not consume a human permission turn, while their rationale and effect remain visible.
- The merge guard has one narrow purpose and fails closed on head movement without claiming stronger review truth.
- Provider adapters can evolve or fail over without changing the authority model.

### Negative

- Review applicability is not mechanically reproducible from a ledger; reviewers must evaluate the disclosed
  judgment against the actual delta.
- Agent quality matters at the judgment boundary, so material uncertainty must be surfaced rather than hidden behind
  a nominally deterministic verdict.
- The thin guard enforces lifecycle sequencing only; repository policy must not describe it as evidence-grade review
  enforcement.

### Risks

- An operating agent could under-scope a follow-up review. Exact-head invalidation, explicit disclosure, targeted
  verification, and the final human integration interlock make the decision inspectable without pretending to prove
  it mechanically.
- Teams that require evidence-grade regulated review need a separate system with that explicit operating and audit
  commitment; this architecture does not silently approximate one.

---

[ADR-028]: adr-028-compose-review-evidence-under-app-gate.md
