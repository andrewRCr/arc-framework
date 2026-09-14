# Draft: Concurrent Integration Characterization

- **Origin:** [internal]
- **Purpose:** Establish where independent ARC checkouts can carry verified work through publication while `main`
  advances, without a protected-base freeze or redundant ceremony.

---

## Problem / Motivation

Concurrent work is viable only if another checkout's ordinary progress does not force unrelated sessions to halt or
repeat verification, preparation, review, and integration. Evidence applicability addresses part of that goal, but
the complete post-execution lifecycle has not been characterized against moving-base cases. The remaining stops need
concrete reproductions and ownership before the delivery-stabilization work is sequenced around them.

## Initial characterization direction

- Cover whole-work-unit verification, Candidate and private-delivery prepublication, public review and checks,
  member or singleton landing, closeout, and the Errand review/merge path.
- At each relevant boundary, use representative Git-backed disjoint, overlapping, and unknown base-movement probes.
  Include exact-target read isolation so one checkout's records cannot misdiagnose another's work.
- Record observed outcomes and the smallest owning fix for each stop. Distinguish shipped behavior from active or
  planned work, and rerun relevant cases after stabilization lands.

## Alternatives already bounded

An exhaustive state cross-product would obscure the ordinary concurrency path and make the characterization too
large. A live-provider harness would add external variability before the local boundary is understood. A merge
queue is not the proposed remedy for ARC-only re-ceremony under base movement.

## Unknowns and assumptions

- Which boundaries already tolerate disjoint movement, and which impose redundant or mechanically blocking work?
- Which overlapping cases genuinely need new evidence, and which merely need the existing exact-target proof read
  at the right boundary?
- Which observed gaps are already owned by shipped, active, or planned work, and which need a new capture?
- What is the smallest repeatable fixture set that can serve as an anti-freeze acceptance check later?

## Scope boundary (Won't Do)

This work characterizes and routes; it does not implement the downstream fixes, build a merge queue, rewrite
storage generically, or turn recovery convenience into a near-term work-unit dependency. It does not make a
live-provider integration harness the acceptance test.
