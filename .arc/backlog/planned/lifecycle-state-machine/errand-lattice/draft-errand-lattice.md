# Draft: Errand Lattice

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). **Absorbs the retired
  `maintenance-errand-class`** (its errand-vs-WU character gate, the "relocates-never-authors" invariant, and its
  vocabulary/definition cascade were folded into the origin lifecycle draft this member carries forward).
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Model the errand lifecycle as a **distinct lattice adjacent to** the `(phase, location)` WU
  lattice, name its crossing edges, redefine the errand-vs-WU gate from *increment-count* to **character**, and
  cascade that definition across the load-bearing docs — so a gapless lifecycle machine has a real entry predicate
  where multi-step single-concern maintenance currently falls through.

> Shared context — the WU lattice, the crossing-edge firing points (`lifecycle-transition-core` owns them), and
> the cohort-level coordination — lives in `cohort-lifecycle-state-machine.md`.

---

## Problem / Motivation

Errands cross the WU lattice unmodeled, and the gate that admits them is wrong. The old implicit gate
(`atomic → errand`, `multi-step → WU`) leaves **multi-step single-concern maintenance homeless** — one logical
concern, several increments, no design to author: a decomposition, a housekeep drain that fans out, a doc-grooming
sweep, a ROADMAP re-render cascade. Forced into the WU wrapper each gets an empty `spec` + a `tasks` list that just
restates the inbox; forced into the atomic-errand wrapper it doesn't fit (not one increment). So it's hand-rolled
off-script every time. That hole sits exactly where the lattice's **entry predicate** belongs — a gapless model
needs the character gate.

## Resolved model

### The errand lattice (distinct, adjacent)

An errand has **no meta, no phase, no commitment-location**; its state is **derived from its `chore/<slug>` branch
and PR** (the shape session-init's `errandState` already computes): `in-progress` / `awaiting-merge` /
`merged-cleanup` / `stale`, plus `materializable` (remote-only, no local worktree). Under partial protection there
is no branch — the errand is a direct base commit and its lifecycle collapses to commit-then-done.

### Crossing edges (the borders the gapless machine must name)

- **inbox → errand** (`drain-inbox` execution transition): a committed atomic in `USER-INBOX` enters the errand
  `Launch → Execute → Integrate` lifecycle. Capture *holds*; the errand *is* its execution.
- **errand → WU promotion** (`init-work-unit` Promote Errand path): a `chore/<slug>` that crosses the WU threshold
  renames to `<type>/<name>`, mints a meta (`scaffold`), and enters the WU lattice at `Active` (commits already
  exist; no activation ceremony). The reverse is never modeled — a WU never demotes to an errand.
- **errand → completed/abandoned**: an errand ships (merge / direct base commit) or is dropped; neither writes a
  `completed/` archive (no meta to sweep) — the record is its branch + PR + merged commit.

The crossing edges fire the character gate at their judgment points; the firing points themselves live in
`lifecycle-transition-core`.

### The errand-vs-WU character gate

The gate is **character**, two paired questions:

1. **Does the work author/settle design, or relocate already-settled design?** A `spec` earns its keep only when
   there is design to *settle*; a `tasks` list only when there is settled design to *decompose into ordered steps*.
   Pure relocation/maintenance has neither.
2. **Does it write durable surfaces** (code, rules, strategies, methods, workflows) **or only movable planning
   artifacts** (drafts, metas, stubs, buffers, ROADMAP, inbox)?

**Author-no-design + touch-only-movable ⇒ errand-class even when multi-increment.** Size / increment-count is not
the gate. This pairs with the `Atomic` (capture-character) vs `Errand` (execution-wrapper) vocabulary split.

### The invariant that keeps it honest

A maintenance errand **relocates / grooms; it never authors at the home.** A destination needing real authoring is
routed *as* a future increment (a new stub, an inbound-buffer note, a spawned atomic errand), so the errand stays
errand-class even when one destination is a durable surface. (Live confirmation: the 2026-06-12 conductor
decomposition routed PR-sized boundary estimation *out* as its own atomic errand rather than editing a strategy
inline.) The errand envelope already has the right shape (chore-branch isolation, no `meta`/`spec`/`tasks`, derived
state) — the change is to the **gate's definition**, not a new wrapper.

### The cascade (this member's durable-surface deliverable)

The gate **design** is owned here; its prose cascade across the load-bearing definitions is this member's
deliverable (absorbed from `maintenance-errand-class` under the consistency-on-exit standard — leaving it deferred
would ship a lifecycle whose authoritative definitions still describe the old count-based gate):

- **`strategy-work-organization` § Errand Work Class** — restate the gate as character (author-vs-relocate +
  movable-vs-durable), not increment-count; name the multi-increment maintenance shape.
- **`DEV-RULES.ARC` "Atomic" vocabulary** — stop implying *errand ⇒ one increment*; settle whether "Atomic" stays
  the capture-character word while "Errand" (the execution wrapper) widens to admit multi-increment maintenance.
- **`AGENT-BRIEF.ARC`** — the Errand / Atomic vocabulary entries follow.
- **`run-errand` lifecycle** — admit a multi-increment single-concern maintenance errand (gated in chunks, one PR),
  not only the atomic one-increment shape.

## Open questions (→ create-spec)

- The vocabulary split (Atomic = capture character vs. Errand = execution wrapper) — does widening "Errand" muddy
  the `ATOMIC-INBOX` (atomic-only) semantics? Likely not (multi-step work never lives in the atomic inbox), but
  confirm.
- Whether the multi-increment maintenance shape earns a distinct *name* in the vocabulary, or is just "an errand
  that spans increments."

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-transition-core` (the crossing-edge firing points — errand→WU
  promotion's `scaffold`/mint, inbox→errand — live there).
- **Coordination seam with `decompose-matrix`:** that member's backlog-stub-source / heterogeneous-home arms *are*
  errand-class decomposition; whether `decompose` runs as a multi-increment errand keys on this gate.
- **Relationship to `drain-inbox`:** already multi-increment and spec-less — this redefinition legitimizes the
  shape it already has rather than treating it as a special case.

## Continuity

- **Readiness:** formalization-ready. The gate (two paired questions), the invariant, the lattice, and the cascade
  targets are settled; the vocabulary-boundary open questions are create-spec detail.
- **Next:** activate via `init-work-unit` Path A once `lifecycle-transition-core` ships → `create-spec`.

---
