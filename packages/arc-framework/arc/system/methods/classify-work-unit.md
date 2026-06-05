---
name: classify-work-unit
description: Boundary-test triage and estimate-vs-realized ratchet for a work unit's Class
override-active: false
---

# Method: classify-work-unit

> - **Workflow:** [init-work-unit.md][init-work-unit], [activate-work-unit.md][activate-work-unit]
> - **When:** A work unit's `Class` is set or re-confirmed at a lifecycle touchpoint — graduation into
>   `backlog/planned/` (the forcing point), `init` as the WU enters active planning, `activate` at the
>   pre-implementation settle, and the planning stages.
>
> - **Contract:** Given a work unit, return its `Class` — `light` / `heavy`, or `[TBD]` when its weight is
>   genuinely not yet knowable — by applying the boundary tests, never resolving below the floor the ratchet
>   protects. The full model and reasoning live in
>   [strategy-work-organization][work-org]; this method is the single triage home every touchpoint declares.

## classify-work-unit.override

[No override configured]

## classify-work-unit.default

Boundary-test triage, then ratchet against any realized design-authoring work.

### Boundary tests

Apply in order. The first test sorts work below the wrapper out of the `Class` model entirely; the next two
each independently promote a WU to `heavy`.

1. **Errand vs. WU (the wrapper floor):** *"Does this need more than a single logical concern — more than one
   review increment — to do well?"*
    - **No** → it is an **Errand**, not a WU. `Class` does not apply: an Errand runs below the wrapper
      (`chore/<slug>` + PR, no meta file). Stop here.
    - **Yes** → it is a WU. Continue to the two `heavy` triggers.

2. **Derivation trigger (→ `heavy`):** *"Must a real design be authored — concerns, alternatives, tradeoffs
   that don't exist until someone works them out — before a competent engineer can start?"*
    - **Yes** → `heavy`. (Derivation also tracks how novel vs. routine execution is, and the validation rigor
      review demands.)

3. **Scale / complexity trigger (→ `heavy`):** *"Does producing a correct implementation plan require a
   **substantial** codebase-grounding / mapping pass — a large or intricate surface of symbols and
   relationships to verify — beyond the routine floor?"*
    - **Yes** → `heavy`. Guard the bar at *substantial*: most WUs carry some grounding, so a soft bar makes
      everything `heavy`.

**`light` iff both `heavy`-triggers are No.** A WU is `heavy` when *either* trigger fires. The axes decorrelate
— derivation loads drafting and spec authoring; scale / complexity loads task generation — so test both
independently rather than collapsing them into one judgment.

**What does not drive `Class`:** raw output volume (lines or files changed) and author preference. `Class` is
intrinsic demand — it indicates weight across planning, execution, *and* review, never planning alone, and what
stays invariant at every value is execution *discipline* (the review-increment gate, the quality gates), never
the depth or care the work demands.

### Resolving the estimate (and `[TBD]`)

`[TBD]` is the pre-classification sentinel: every WU *has* a `Class`, and `[TBD]` means it is merely unresolved
(distinct from `[none]`). It is legal only in `backlog/provisional/`. Wherever a start decision is imminent —
entry into `backlog/planned/` and everything downstream — resolve it to a real value.

When resolving without complete information, set a **best estimate** against the boundary tests — never a
blanket `heavy` stamp. A blanket stamp fabricates the very signal `Class` exists to carry, and the ratchet
below would pin the error. Estimating costs nothing (see the ratchet): estimating `heavy` and later correcting
down is not a loss, so there is no lowball incentive.

### Estimate-vs-realized ratchet

Estimate-then-ratchet — not strict one-way:

- The ratchet protects **realized** design-authoring work: once a stage has *authored* design at some depth,
  `Class` never drops below that floor.
- An **estimate** — a value set before that work exists — is freely revisable in *both* directions until
  planning substantiates a floor. Correcting a too-high estimate **down** is not a demotion: no work is
  discarded.

At each touchpoint this is a cheap **confirm-or-ratchet**, not a re-derivation: confirm the current value still
holds, ratchet *up* to a newly realized floor, or correct an unsubstantiated estimate in either direction.

---

[init-work-unit]: ../workflows/arc/work-unit-lifecycle/planning/init-work-unit.md
[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
[work-org]: ../../reference/strategies/arc/strategy-work-organization.md
