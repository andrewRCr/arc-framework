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
- opaque capability handles for approval, mutation, persistence, channel closure, and rerouting.

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

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
