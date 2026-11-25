# Draft: mechanism-registers

**Purpose:** Define maintained inventories of recurring code mechanisms that design proportionality can consume.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** provisional; `P2`; `Heavy`. This capture draft carries unresolved design input; no approved
  design is implied.

---

## Concerns

### Keep a by-kind register of recurring mechanisms, and have the proportionality check read it

- _Observation:_ the method's `missed-composition` finding asks which current primitive supplies a need, but its
  `substrate-referents` input is optional, and otherwise existing substrate is discovered "narrowly from the problem and
  candidate". Same-kind mechanisms spread across modules under different names do not surface from one work unit's
  problem, so each design passes honestly and a family grows one shape at a time. The storage-coupling register in
  `cohort-state-storage.md` shows what works instead: every mechanism of one kind enumerated with an owner and a fate,
  under the rule that a mechanism with no row is a gap.

- _Proved (2026-10-15):_ the review gate's decision records, censused for `seam-delivery-review`, were seventeen shapes
  of one kind, and the census collapsed them into one envelope (`notes-seam-delivery-review.md` § Decision-record
  census) — the register changing a design, the condition set for generalizing it into the method.

- _Approach:_ a small register per recurring kind, read by the method as its substrate referents. Candidate kinds:
  decision and authorization records, typed stops and their retries, exact-subject bindings, recovery routes. A design
  that adds a mechanism of a registered kind names the row it extends, or says why none fits. Mechanical where the code
  allows: tag `core/schema-inventory.ts` entries with a kind and let a test refuse an unregistered decision shape.
  Triggered, not calendar-driven: the lookup runs at every design that adds a mechanism, a consolidation review fires
  when a kind reaches its third independent shape, and a census for unregistered kinds runs at program and cohort
  boundaries.

- _Open:_ where registers live (beside their kind's owning code, in a reference document, or both); who keeps them
  current; how a new kind gets noticed between censuses; and whether the method change ships to every project or the
  registers stay a convention of this repository.

- _Captured during:_ the `cli-compile-cache` Errand's close, 2026-10-11; routed out of `seam-delivery-review`'s draft at
  its owner's pass, 2026-10-15.

---
