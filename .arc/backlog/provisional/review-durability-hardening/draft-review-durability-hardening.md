# Draft: review-durability-hardening

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Bind readiness attestation to the head it attests**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-08-10).
- _Concern:_ `arc merge lock release` verifies Completion Notes and Release Notes from the working tree while the
  merge target is the pushed head. A readiness refusal naturally prompts an uncommitted correction and retry, so
  the happy recovery path can attest different bytes from those that merge.
- _Approach:_ bind readiness-relevant reads to the exact head, or refuse when HEAD/dirty relevant paths differ;
  preserve the pre-open path where no head exists and state the commit/push/recheck sequence after artifact fixes.

### `[ ]` **Separate exact-target invalidation from review-applicability invalidation**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-durability-hardening`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ after complete CodeRabbit review and a clean incremental follow-up, a later head changed only one
  strict unit-test mock (14 added lines; no production code). The agent requested another hosted incremental
  review solely because the exact review target had moved, despite the errand workflow already permitting prior
  complete coverage to carry across a narrow non-interacting delta with targeted verification.
- _Fold-in:_ make the operational distinction explicit wherever new-head review is selected — target movement
  invalidates an attestation bound to the old SHA, but does not by itself require another evaluator pass. Apply
  review-applicability judgment first; carry prior complete coverage across demonstrably non-interacting test,
  record-only, or lifecycle deltas with targeted verification; retrigger only for behavioral, authority,
  contract, interacting, or uncertain changes. Treat the incident as evidence for the provisional WU's
  re-review-cost trigger, not as a mandate for the larger durable-ledger design.

---

## Provenance

Deferred from `review-surface-binding` (RSB) at its create-spec planning close (2026-07-23). RSB shipped an
**advisory** local review lane and deliberately did **not** build durable fix-carry or mid-fix crash recovery — see
its Non-Goals and its Alternatives entry "A durable fix ledger, rejected in favor of re-review at the new head".

## The deferred tier

RSB's fix path is deliberately simple: an approved fix is applied under the ordinary review-increment and commit
interlock, producing a **new head**. A new head is a new review target, so nothing carries across a fix — the review
re-enters at the new head. That trades **one extra evaluator pass per fixed head** for the absence of a durable fix
ledger, fix-phase verbs, and their interrupt surface.

This work unit is the durability tier RSB set aside: a **durable fix-carry-across ledger** (settled dispositions
surviving a fix), **fix-phase verbs**, and **mid-fix crash recovery** — so a crash between approving a disposition
and landing its fix cannot lose the settled disposition, and a fixed change need not re-earn its whole review from
scratch.

## Grooming trigger (why this is provisional)

Groom this **only if practice shows the trade going the other way** — either:

- mid-fix crashes are observed **losing settled dispositions**, or
- the **re-review-at-new-head cost proves material** (the extra evaluator pass per fixed head is a real burden).

Absent those signals, the advisory re-review-at-new-head model stands and this tier stays deferred. Do not groom on
appeal to completeness alone; the deletion-on-a-consumer-test posture applies.

## Boundary

- **Extends RSB's local lane** — its `respond` / `reduce` fix path and durable records. A `Depends On`, not a fresh
  design.
- **Distinct from tamper-resistance**, which RSB rejects **permanently** (not deferred): local evidence is process
  attestation; stronger guarantees live at hosted import. This tier is about durability of settled dispositions
  across a fix, not resistance to a motivated local operator.
- **Stays advisory.** RSB shed the evidence-grade tier after `review-gate-right-sizing` declined the downstream gate
  that would have consumed local review as satisfying proof. Any durability added here remains advisory unless a
  future downstream consumer re-appears — this is not a back door to the declined evidence-grade rung.

---
