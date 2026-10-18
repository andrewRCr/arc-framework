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

### Check the movement at a review applicability stop

At status's `resolve-review-applicability` or the final Candidate checkpoint's bounded review stop, have a
fresh-context local evaluator check the movement before the Owner chooses. Supply the exact movement coordinates,
reviewed evidence and its premises, residual files, and dependencies across both sides explicitly. For a merge,
include its conflict resolution against Git's automatic merge (`git log --remerge-diff`); for a rewrite, include its
interdiff (`git range-diff`). Check dependencies such as a rename or removal that the other side still uses.

Run this check once for the movement. It is not a review pass: create no lane attempt, charge no ceiling, and store
nothing beyond the stop's existing record. It does not run at an Errand's merge step, on a verification residual, or
at `residual-unbounded`; dispatch those callers' existing actions. When the driver already requires a local complete
pass after an unchecked fix's base move, dispatch that pass instead.

Show the check's findings as a complete disposition set beside the recommendation; obtain disposition approval
before applying any fix. Recommend `fresh` whenever the check finds a material defect or prompts any fix. Otherwise
apply the residual judgment above. `supplemental` recommends `covered` during review, or `targeted-check` at the
reconcile with the check as its evidence; `fresh` recommends `review-required`, or `changed` at the reconcile. The
caller owns the fix route and the Owner's choice over the resulting head. Do not repeat the check at the fresh stop
raised after that fix; disclose that `covered` or `targeted-check` there rests on a fix no pass has read.

#### Land an approved fix outside a bound delivery

Use the calling workflow's typed delivery-entry result to select the fix route. With `not-applicable`, apply the
approved fix as an ordinary change, request `arc check gate commit`, and commit through the caller's ordinary commit
boundary. This check supplies no review result for `arc review respond -` to bind.

Re-enter the same applicability route over the fixed head. The Owner chooses once there, with the findings and fix
in view; do not run the movement check again. Recommend `review-required`, or `changed` at the reconcile. Disclose
that `covered` or `targeted-check` accepts a fix no pass has read; the earlier check read the movement, not this fix.
Follow the returned typed continuation after the Owner chooses.

#### Land an approved fix under a bound delivery

Present the findings and recommend `review-required`, or `changed` at the reconcile. Obtain the Owner's
applicability choice before authoring the fix; disclose that `covered` or `targeted-check` governs only until the
fix lands. While this approved fix remains unlanded, request no pass for its member and take it to no landing
preparation, whatever the choice returns.

Enter the selector-free `arc delivery review-fix continue -` procedure in [deliver-stack] before authoring a
correction. Follow any existing correction through that procedure; do not interleave a new task with an open
correction, a `pending-review-response` derivation, or a `review-fix-verification-required` continuation. Preserve
this approved fix and its prohibition on review and landing until the outstanding correction is resolved.

Only at `idle / continue-work-unit`, author the correction task in the stop's owning member section, covered by a
plan revision through [amend-design] § Under a bound delivery plan. Land that revision before corrective execution.
Then re-enter the delivery-owned continuation, follow only its returned authoring and resume actions, and let it
carry the fix through the owning member's correction route. Never reconstruct a member or operation selector.

After the fix lands, follow the returned applicability route over the fixed head. The Owner chooses again with the
findings and fix in view; do not repeat the movement check. Disclose that `covered` or `targeted-check` there rests
on a fix no pass has read. Only the new typed choice controls the fixed head's continuation.

Return exactly `{ recommendation, residual, rationale }`, with the unchanged residual and one concise rationale
grounded in it. The recommendation neither authorizes a merge nor mutates lifecycle, approval, review, or verification
state; the calling workflow owns the typed continuation and any fresh approval it requires.

---

[amend-design]: ../workflows/arc/supplemental/amend-design.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
