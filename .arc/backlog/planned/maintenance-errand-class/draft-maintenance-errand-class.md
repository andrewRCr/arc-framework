# Draft: Maintenance Errand Class

- **Origin:** Surfaced during the `arc-plan-conductor` decomposition (2026-06-12) — the design discussion behind
  that hand-run decomposition exposed that ARC's errand/work-unit split has no slot for the work being done. The
  general facet of that insight is promoted here; the concrete decomposition-mechanics facet stays in
  `decompose-work-unit-arms` (its consumer).
- **Purpose:** Redefine the **gate** that decides errand vs. work-unit from *increment-count* to **character**, so
  that multi-step **pure-maintenance / artifact-grooming** work is errand-class even when it spans several gated
  increments. Today's implicit mapping (`atomic capture → errand`, `multi-step capture → work unit`) is a clean
  1:1 with no home for the large middle: one logical concern, several increments, no design to author.

---

## Problem / Motivation

ARC's wrappers split by an *implicit* rule: atomic work runs as an errand (one review increment, chore-branch,
no `meta`/`spec`/`tasks`); anything multi-step becomes a work unit (`meta` + `spec` + `tasks` + PR). That leaves
no slot for work that is **multi-step but errand-class** — recurring in practice:

- a decomposition (relocate a draft's surviving designs to homes, retire it, sweep refs)
- a housekeep drain that fans out to many homes
- a doc-grooming sweep across several files
- a cross-reference / ROADMAP re-render cascade

Forced into the work-unit wrapper, each gets a `spec` that would be empty (no design to settle) and a `tasks`
list that would just restate the inbox — ceremony with nothing to hold. Forced into the atomic-errand wrapper,
it doesn't fit either (it isn't one increment). So it gets hand-rolled off-script every time (the conductor
decomposition is the live example — run as a bespoke grooming operation precisely because no wrapper fit).

## The discriminator (the real axis)

The gate is **character**, two paired questions:

1. **Does the work author/settle design, or relocate already-settled design?** A `spec` earns its keep only when
   there is design to *settle*; a `tasks` list only when there is settled design to *decompose into ordered
   steps*. Pure relocation/maintenance has neither.
2. **Does it write durable surfaces (code, rules, strategies, methods, workflows) or only movable planning
   artifacts (drafts, metas, stubs, buffers, ROADMAP, inbox)?**

Work that authors no design and touches only movable artifacts is errand-class **even when multi-increment**.
Size / increment-count is *not* the gate.

## Why the errand envelope already fits

The errand wrapper already has the right shape — chore-branch isolation, no `meta`/`spec`/`tasks`, state derived
from branch + PR. The only thing that breaks is the word *atomic* in the current definition ("a single logical
concern that fits one review increment"). Decouple "one concern" from "one increment" and the existing primitive
absorbs multi-step maintenance with no new machinery — the change is to the **gate's definition**, not a new
wrapper.

## The invariant that keeps it honest

A maintenance errand **relocates / grooms; it never authors at the home.** A destination that needs real
authoring is routed *as* a future increment (a new stub, an inbound-buffer note, or a spawned atomic errand), so
the errand stays errand-class even when one of its destinations is a durable surface. (Live confirmation: the
2026-06-12 conductor decomposition routed PR-sized boundary estimation *out* as its own atomic errand rather than
editing `strategy-work-planning.md` inline.)

## Cascade (what this WU changes)

- **`strategy-work-organization` § Errand Work Class** — the authoritative definition; restate the gate as
  character (author-vs-relocate + movable-vs-durable), not increment-count. Name the multi-increment maintenance
  shape (the "grooming / decomposition ceremony" is the instance).
- **`DEV-RULES.ARC` "Atomic" vocabulary** — "a single logical concern that fits one review increment" needs to
  stop implying *errand ⇒ one increment*. Decide whether "Atomic" stays the *capture-character* word while
  "Errand" (the *execution wrapper*) widens to admit multi-increment maintenance.
- **`AGENT-BRIEF.ARC`** — the Errand / Atomic vocabulary entries follow.
- **`run-errand` lifecycle** — admit a multi-increment single-concern maintenance errand (gated in chunks, one
  PR), not only the atomic one-increment shape.

## Consumers / relationships

- **`decompose-work-unit-arms`** — its backlog-stub-source and heterogeneous-home arms *are* errand-class
  decomposition; they **depend on** this redefinition (decomposition becomes errand-class because of it). That
  WU owns the decompose-workflow mechanics; this WU owns the wrapper-gate definition they consume.
- **The housekeep drain (`drain-inbox`)** — already multi-increment and spec-less; this redefinition legitimizes
  the shape it already has rather than treating it as a special case.

## Unknowns and Assumptions

- The vocabulary split (Atomic = capture character vs. Errand = execution wrapper) — does widening "Errand" muddy
  the `ATOMIC-INBOX` (atomic-only) semantics? Likely not (multi-step work never lives in the atomic inbox), but
  confirm.
- Whether the multi-increment maintenance shape earns a distinct *name* in the vocabulary, or is just "an errand
  that happens to span increments."

## Scope Estimate

Small–Medium — primarily a definition/vocabulary cascade across `strategy-work-organization`, `DEV-RULES.ARC`,
and `AGENT-BRIEF.ARC` (each two-copy), plus a `run-errand` clause admitting the multi-increment shape. No new
code surface; the design risk is the vocabulary boundary, not the mechanics.
