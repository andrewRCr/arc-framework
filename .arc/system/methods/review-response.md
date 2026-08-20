---
name: review-response
description: Provider-neutral author response contract for normalized review findings
related:
  - review-triage
override-active: false
---

# Method: review-response

> - **Workflow:** [prepare-work-unit.md][prepare-work-unit], [integrate-work-unit.md][integrate-work-unit]
> - **When:** A local or hosted review returns normalized findings
>
> - **Contract:** Given an exact review target, normalized findings, effective routing result, and caller
>   capabilities, return the approved dispositions, verification and persistence evidence, old/new exact targets,
>   and explicit blocking status. Provider commands, host handles, and channel-private state never enter this method.
> - **Related:** [review-triage](review-triage.md) — supplies the complete source-verified disposition set and exact
>   approval required before mutation

## review-response.override

[No override configured]

## review-response.default

The caller supplies:

- the exact current target and source-normalized findings with immutable loci;
- the effective review-routing decision;
- the effective severity-gating policy (`minorGating: blocking | record-only`);
- the strict disposition state — absent, complete proposed set, or exact approved set;
- candidate-target, verification, and persistence evidence when fixes have run; and
- capability availability for approval, mutation, persistence, caller-owned closure, and rerouting.

The typed response planner emits exactly one state with precomposed next-action text and only the capabilities legal
in that state:

- `awaiting-approval` — present the complete disposition set; mutation is unavailable.
- `ready-to-fix` — apply only the approved `fix` set as one bounded increment.
- `ready-to-persist` — persist the verified candidate through the caller's release interlock.
- `ready-to-close` — return unchanged-target dispositions to the caller.
- `reroute` — return the persisted changed target for re-routing.
- `blocked` — stop because an exact binding, evidence item, or required capability is absent.

Every result returns the approved disposition state when one exists, verification references, the old target, an
explicit nullable new target, and `blocking: true | false`. `ready-to-fix` additionally returns one single-use
authorization over the old target, approved-set identity, and approved fix findings; it never predicts the resulting
target. Past-tense finding actions are settlement evidence, not approval state. The planner does not choose a
provider, compose a provider command, or infer authority from host state.

When building the disposition set, use one unqualified `severity` when the judgments agree; when they differ, use
the two labeled `reviewerSeverity` and `arcSeverity` fields instead. An unsupported finding carries only
`reviewerSeverity` plus `sourceVerification: not-supported`; ARC assigns it no effective grade. Derive every
verified item's gating from ARC's effective severity plus project policy: `blocker` and `major` are blocking, `nit`
is record-only, and an ordinary `minor` uses `minorGating`. Unsupported findings retain the reviewer's gating grade
for source fidelity. Keep every finding in the set. A blocking recurrence requests another round; a record-only
finding does not. Carrier-native requested changes and required conversations remain independent blockers outside
this planner, so ARC's record-only result cannot weaken host authority.

### Execute only the selected author leaf

Follow the planner state; do not infer or combine transitions:

- For `awaiting-approval`, verify and classify every finding with `review-triage`, present the complete proposal,
  and return the approval or blocking questions. Do not mutate the target.
- For `ready-to-fix`, require the planner's exact unconsumed authorization before the first mutation, apply exactly
  the approved `fix` findings as one review increment, run the affected quality gates, and return the candidate target
  plus verification evidence. Do not persist it inside this method.
- For `ready-to-persist`, report the verified candidate and return control to the caller's commit interlock. Bind the
  authorization consumption to the actual old/new target, applying actor, and verification references before any push
  interlock can release.
- For `ready-to-close`, return the exact approved unchanged-target dispositions to the caller. Do not author replies
  or resolve conversations here.
- For `reroute`, return the persisted changed target to the coordinator; do not choose or invoke a retrigger.
- For `blocked`, report the planner's next action and stop without mutation.

The cycle contains at most one fix increment. Any changed head re-enters through `reroute`; it never loops, selects a
review source, persists, or performs adapter-owned closure within this method.

### Keep response etiquette at the channel boundary

- **Local:** The approved disposition report is the complete audience-visible terminal record. Emit no synthetic
  reply or closure surface.
- **Hosted:** The caller may reply or resolve only when its adapter supplies an authoritative address and declares
  the operation supported. A finding without that capability produces no hosted response; never create a roll-up
  comment. A finding with `settlement: not-applicable` is always in this no-response class: `fix`, `defer`, and
  `reject` alike produce no reply, resolution, or compensating disposition comment.

Conversation state remains host-owned. Approval and an agent-authored explanation do not manufacture a host
capability or satisfy a carrier-native review requirement.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
