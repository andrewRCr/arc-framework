---
name: assess-evidence-applicability
description: Resolve bounded residual evidence into a supplemental or fresh recommendation
override-active: false
---

# Method: assess-evidence-applicability

> - **Workflow:** [integrate-work-unit], [deliver-stack], [run-errand]
> - **When:** A typed evidence-applicability result explicitly requires judgment over a bounded residual
>
> - **Contract:** Recommend only `supplemental` or `fresh` for the supplied residual; deterministic results and
>   merge-safety decisions remain code-owned.

## assess-evidence-applicability.override

[No override configured]

## assess-evidence-applicability.default

Apply this method only when the caller supplies a typed review or verification applicability result that:

- has `judgmentRequired: true` and a non-empty bounded `residual`; and
- names `bounded-overlap` or `bounded-clean-divergence` as its reason.

Receive the supplied typed applicability result or projection as `act`. The caller owns the evidence-kind boundary:
`merge-safety` never fires this method. Do not reconstruct the normalized delta, cause, or evidence kind from
workflow context; none is required to judge the supplied residual.

If any condition does not hold, do not assess applicability. Dispatch the typed result and its supplied next action
unchanged; every `judgmentRequired: false` row is final.

Assess only the supplied residual against the evidence whose applicability is in question:

- Recommend `supplemental` when the residual can be evaluated independently without reopening the evidence's
  established premises or conclusion. Bound the follow-up to that residual.
- Recommend `fresh` when the residual interacts with those premises or conclusion, cannot be isolated with
  confidence, or makes the bounded evidence insufficient as a whole.

Return exactly `{ recommendation, residual, rationale }`, with the unchanged residual and one concise rationale
grounded in it. The
recommendation neither authorizes a merge nor mutates lifecycle, approval, review, or verification state; the calling
workflow owns the typed continuation and any fresh approval it requires.

---

[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
