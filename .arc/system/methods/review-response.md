---
name: review-response
description: Channel-neutral author response contract for normalized review findings
related:
  - review-triage
override-active: false
---

# Method: review-response

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **When:** A local or hosted review returns normalized findings
>
> - **Contract:** Given an exact review target, normalized findings, effective routing result, and adapter
>   capabilities, return the approved dispositions, verification and persistence evidence, old/new exact targets,
>   explicit blocking status, and authority-specific closure work. Provider commands and controller-private state
>   never enter this method.
> - **Related:** [review-triage](review-triage.md) — supplies the complete source-verified disposition set and exact
>   approval required before mutation

## review-response.override

[No override configured]

## review-response.default

The caller supplies:

- the exact current target and source-normalized findings with immutable loci;
- the effective `review-routing` result;
- the complete disposition set and approval when they exist;
- candidate-target, verification, and persistence evidence when fixes have run; and
- opaque capability handles for approval, mutation, persistence, channel closure, and rerouting. Hosted controller
  findings carry receipt/reply/thread-state handles; provider-native findings carry provider-reply/thread-state/
  decisive-review handles. Every handle binds one finding's immutable source locus.

The typed response planner emits exactly one state with precomposed next-action text and only the capabilities legal
in that state:

- `awaiting-approval` — present the complete disposition set; mutation is unavailable.
- `ready-to-fix` — apply only the approved `fix` set as one bounded increment.
- `ready-to-persist` — persist the verified candidate through the caller's release interlock.
- `ready-to-close` — return unchanged-target dispositions to the channel adapter.
- `reroute` — return the persisted changed target to `review-routing`.
- `blocked` — stop because an exact binding, evidence item, or required capability is absent.

Every result returns the approved disposition set when one exists, verification references, the old target, an
explicit nullable new target, and `blocking: true | false`. The method does not choose a provider, compose a provider
command, resolve host conversations, persist controller conclusions, or infer authority from thread state.

### Execute only the selected author leaf

Follow the planner state; do not infer or combine transitions:

- For `awaiting-approval`, verify and classify every finding with `review-triage`, present the complete proposal,
  and return the approval or blocking questions. Do not mutate the target.
- For `ready-to-fix`, apply exactly the approved `fix` findings as one review increment, run the affected quality
  gates, and return the candidate target plus verification evidence. Do not persist it inside this method.
- For `ready-to-persist`, report the verified candidate and return control to the caller's commit/push interlock.
- For `ready-to-close`, return approved unchanged-target dispositions to the adapter; do not author replies or
  resolve conversations here.
- For `reroute`, return the persisted changed target to the coordinator; do not choose or invoke a retrigger.
- For `blocked`, report the planner's next action and stop without mutation.

The cycle contains at most one fix increment. Any changed head re-enters through `reroute`; it never loops, selects a
review source, persists, or performs adapter-owned closure within this method.

### Keep response etiquette at the channel boundary

- **Local:** The approved disposition report is the complete audience-visible record. Emit no synthetic reply or
  closure surface.
- **Hosted:** Return reply or resolution work only for a finding whose adapter supplied an authoritative comment or
  thread capability. Controller actions return the receipt handle and only their declared reply/resolution handles.
  Provider-native actions return provider-reply, thread-state, and decisive-review handles without acquiring a
  resolution capability. A finding without its own conversation produces no hosted response; never create a roll-up
  comment.

Conversation resolution records host state only. It is not disposition approval or provider closure authority.
Never impersonate a provider, infer provider closure from a resolved thread, or let coordinator-authored text satisfy
source-confirmed closure.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
