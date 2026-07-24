# Draft: review-durability-hardening

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
