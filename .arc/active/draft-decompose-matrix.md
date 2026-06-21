# Draft: Decompose Matrix

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). **Absorbs the retired
  `decompose-work-unit-arms`** (its three transform-shape arms + the conservation-gate generalization were folded
  into the origin lifecycle draft this member carries forward).
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Model `decompose` as the full `{parent-position} × {transform-shape}` matrix it is — not the single
  symmetric shape shipped today — and rewrite the `decompose-work-unit` workflow to carry the whole matrix, with a
  conservation gate that holds under partial extraction and heterogeneous-home distribution.

> Shared context — the mutator bundle (this member consumes its teardown legs, never `relocate-artifacts`), the
> resolver (cohort-membership reads), and the cohort-level coordination — lives in
> `cohort-lifecycle-state-machine.md`.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration
> (`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **`decompose-work-unit` prescribes an invalid commit Context `(decomposition)`**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-14); captured during the
  `lifecycle-state-machine` decomposition ceremony.
- *Concern:* `decompose-work-unit.md` Step 10 prescribes `Context: meta-<name>.md (decomposition)`, but the
  commit-msg hook rejects `(decomposition)` (allowed meta parentheticals: handoff / activation / integration /
  archival / deactivation / maintenance). Precedent (the CWC decomposition, `f8429599`) used `(maintenance)`,
  which the `lifecycle-state-machine` decomposition matched. A workflow↔hook drift — same shape as the drained
  `(graduation)` context-category item (2026-06-11).
- *Resolve (at this member's rewrite of `decompose-work-unit`):* either fix the template to `(maintenance)`, OR
  add `decomposition` to the hook's allowed parentheticals if decomposition warrants its own Context category
  (pairs with the broader "reconcile the commit-footer meta-category set across method, hook, and test"
  concern).

---

## Problem / Motivation

The shipped `decompose-work-unit` handles only `live-plan-branch origin → fully-retired origin →
all-members-newly-minted`. Three other transform shapes — extraction-with-surviving-origin, backlog-stub-source,
heterogeneous-home — have no path and get hand-rolled (all three hit live during the 2026-06-12
`arc-plan-conductor` decomposition). The conservation/allocation gate assumes the whole origin draft is consumed,
so it doesn't cover partial extraction or atomic-edit homes.

## Resolved model — the full matrix

`decompose` is a `{parent-position} × {transform-shape}` matrix.

### Axis 1 — parent position (one-level nesting cap, ADR-024)

- **standalone → top-level cohort** (name preserved).
- **in-cohort → sub-cohort** under the parent (name preserved).
- **at-cap → lateral fan-out** into sibling WUs under the existing parent (no cohort node; provenance note).

### Axis 2 — transform shape

- **symmetric** (shipped) — live `plan/<name>` origin, cut-map in hand; origin retired (`git rm`), all members
  newly minted in `backlog/planned/`, whole draft distributed.
- **extraction / origin-survives** — origin **kept** (not retired), sheds one orthogonal sub-concern as a new
  sibling, adds the origin→member `Depends On` edge, distributes only the *extracted* sections, **skips** the
  symmetric retirement. The surviving (thinned) origin takes a **disposition fork**: keep-active (stays in
  `active/`) or park (`park@Planning` relocates it to `backlog/`).
- **backlog-stub source** — decompose a `planned/` stub **in place**, no activation, no `plan/` branch; origin
  retired from backlog, members minted in backlog.
- **heterogeneous-home** — members route to **mixed destinations**: a new stub, a fold into an existing artifact
  (sibling stub / `draft-design` block), or an atomic edit to a standing doc.

### The mechanical consequence

Across *every* arm the origin is either **retired** (`git rm`) or **kept in place** — **never `git mv`-relocated**.
So `decompose` composes `{retire | keep}(origin) + scaffold×N (or fold / atomic-edit) + distribute-design +
reconcile-branch/worktree(teardown, when a branch existed)`. It is **not** a `relocate-artifacts` caller; it shares
only the **teardown legs** with `park`. The fan-out (`scaffold × N`, children seeded from the parent's design,
never `git mv`'d — you can't move one source into N destinations) lives in decompose's orchestration.

**"Relocate the origin" is `park` composing on, not a decompose mechanic.** When an extraction's surviving origin
must return to backlog, that is `decompose(extraction) ∘ park@Planning(origin)` — two orthogonal primitives in
sequence, the relocate owned by `park`. The workflow may surface the disposition and compose the park
(a `--park-origin`-style convenience) but mints no relocate-the-origin primitive.

### Conservation gate generalizes

The four-step allocation gate (map every section + dependency edge to exactly one destination or
dropped-with-reason; conserve; retire only after green) must hold under **partial extraction** (only the extracted
subset is consumed; the rest stays on the surviving origin) and **atomic-edit homes** (a destination that is a
standing doc, not a member). `assess-cohort-fit`'s cut-map gains: an entry naming the *surviving origin* as a
member (extraction); entries naming *existing/atomic homes* (heterogeneous).

## Open questions (→ create-spec)

- Whether the four arms are one workflow with branching preconditions or warrant separate entry points — settle
  against the shared park/teardown mechanics (`lifecycle-transition-core`'s bundle + `composable-workflows`'
  park-exit-block hoist).
- The conservation gate's precise behavior under partial extraction and atomic-edit homes.
- Executor migration scope: does this member build the matrix executor, or does the workflow stay markdown over
  `lifecycle-transition-core`'s primitives? (Depends on member sizing at its spec.)

### Parked: the facilitation axis (carried from `decompose-work-unit-arms`, evaluate — not committed scope)

The origin lifecycle draft absorbed the three transform arms but left this residual as *"the arms WU's to spec."*
It is held here as a scoped open question, **not committed scope** — by the cohort's consistency-on-exit limit
test it is *un-enhanced, not inconsistent* (the decompose transitions are coherent without it):

- **Mid-implementation (Active-state) decomposition** — the genuinely-novel decompose-domain piece. The shipped
  model treats decomposition as a **Planning-state terminal act** ("a decomposing WU never activates"); decomposing
  a WU with code already written is an uncovered, costly **escape hatch**. The rest of the lifecycle-timing axis
  (decompose at design maturity) is already subsumed by `assess-cohort-fit`'s maturity gate + the predicted/emergent
  arms. **Evaluate at this member's create-spec** whether to absorb the escape-hatch case.
- **Ownership-distribution motivation** — decomposing to distribute pieces across single-owner devs is team-scale
  doctrine owned by `single-owner-wu-model` (a parked `concurrent-work-conventions` member). **Cross-cohort pointer
  only** — not this member's design.

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` (consumes the mutator-bundle teardown legs);
  reads the resolver's cohort-membership.
- **Coordination seam with `errand-lattice`:** `decompose`'s backlog-stub-source / heterogeneous-home arms *are*
  errand-class (multi-step, pure relocation, no design authored) — whether `decompose` itself runs as a
  multi-increment errand keys on `errand-lattice`'s character gate.
- **Forward-compat:** `composable-workflows` (park-exit-block hoist); `assess-cohort-fit` (the cut-map producer —
  gains the surviving-origin + existing/atomic-home entries).

## Continuity

- **Readiness:** formalization-ready for the matrix model; the facilitation-axis residual is explicitly a
  create-spec evaluation, not a fundamental open.
- **Next:** activate via `init-work-unit` Path A once `lifecycle-transition-core` ships → `create-spec`.

---
