# Draft: Delivery Rebuild Continuity

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14). It consolidates two capture targets that were cut by
  lifecycle position — `delivery-authoring-rebuild` and `delivery-prepublication-evidence-applicability` — into the
  one mechanism they share.
- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified gate and
  Candidate evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a
  ceremony the covered inputs did not change.
- **Planning posture:** The failures are proven from captured field incidents; the mechanism needs design across
  authoring, gate provisioning, and evidence applicability, which establishes `Class: Heavy` and a `P1` slot.

---

## The consolidation, and its boundary

The steering map warns against absorbing the separate prepublication-authoring, post-landing-conflict, and
public-correction contracts into one uncut work unit. This consolidation reopens only the first of those three, on
two grounds the map itself supplies: prepublication evidence applicability **consumes verified rebuild endpoints**,
and its implementation must coordinate with authoring. Both are strictly private-chain and both are driven by base
movement, so they are one mechanism observed at two lifecycle positions.

Two neighbours stay out, deliberately:

- **`delivery-post-landing-conflict-recovery`** is public-side and post-landing. It also ships first, because it is
  the recovery route that makes a stacked landing safe to attempt at all.
- **`delivery-correction-convergence`** stays its own planned stub. Its draft records a failure that fires
  _"even though the base did not move"_ — its own record writes reopen applicability — so it is a convergence
  problem rather than a movement one, and it was already split from stacked-delivery dogfooding deliberately.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

Four captures in `USER-INBOX § Work Unit` name the two consolidated slugs and route here at the next drain:
**Make initial stacked-delivery authoring rebuildable after base movement**, **Provision plan-owned delivery gate
checkouts before verification**, **Make bound delivery corrections rebuild their private suffix**, and **Preserve
evidence applicability throughout delivery prepublication**. They are left in the inbox rather than moved here,
because the drain owns that transit; this note exists so none is lost in the meantime. Their `WU_Target` values
still name the pre-consolidation slugs and resolve to this work unit at drain.

---

## Problem / Motivation

Initial and correction-time private-chain recuts, gate placement, and gate provisioning remain manual or unproven.
When the protected base moves under a bound plan, the chain has to be rebuilt, and everything already justified
against the old chain — gate results, Candidate evidence, applicability — has to be re-established or carried. The
captured incidents show both halves failing independently, and the second consuming the first.

The evidence-applicability capture states the target shape directly: disjoint protected-base movement should
re-observe eligibility **without repeating member gates whose covered inputs remain unchanged**, while changed gate
definitions or other actual covered inputs continue to prevent unsupported reuse.

## Evidence from the characterization

`concurrent-integration-characterization` probed the delivery-member landing cells against a moving base. Two
observations bear on this design; each is a recorded ledger row.

- **The delivery shape narrows a refusal and never a tolerance.** A safe verdict over a non-empty substantive path
  set is reachable only through the `residual-contained` safety class; with no substantive overlap there is nothing
  for the residual scope to narrow, so the shape never enters and the payload carries no trace of it. Two of the
  four member cells therefore read identically to their singleton counterparts while genuinely running the delivery
  arm — the shape is visible only where the singleton path would have stopped.
- **The advisory disagrees with the decision it rides.** The checkpoint's register text is composed from the
  overlap partition alone, so on the very result that just _admitted_ a reviewable path under `residual-contained`
  it still reads "Merge the base before continuing edits on those paths". Only the decision knows about the
  residual. A separate Errand — **refusal remedy accuracy** — owns the message; the design question here is which
  component should be composing it.

One further observation was recorded rather than probed: an advance intersecting a landed member's span refuses as
a predecessor overlap, adding a stop the singleton shape has no analogue for. The first matrix enumerated no cell
for it.

## Recommendations, not decisions

Offered from the evidence above; this work unit's planning owns the actual design.

- Design the rebuild endpoint before the evidence carry, not beside it. The map's own interface note is the
  ordering: applicability consumes verified rebuild endpoints, so a carry contract written against an unproven
  rebuild would be specifying against a moving target.
- Make the residual scope legible in the payload. Its current invisibility on tolerant results is why the advisory
  and the decision can disagree without anything noticing.
- If this work unit lands as a stacked delivery and dogfoods its own fixes, record an explicit fallback to a plain
  single-branch landing up front. The failure mode is depending on the broken mechanism to ship its own fix; with
  post-landing recovery shipped first and a fallback recorded, a delivery bug degrades the evidence rather than
  blocking the work.

## What the characterization did not cover

Its enumerated matrix spans **base movement only** — boundary by movement kind — and the boundary list did not
include delivery authoring or rematerialization at all. So the authoring half of this work unit's surface was never
probed, and head movement, merge-base cardinality, and ceremony-concurrent writes were outside the axis entirely. A
second matrix covering those axes was added to that work unit after this stub was written; read its ledger rows in
`notes-concurrent-integration-characterization.md` before starting design, rather than treating the first matrix's
`tolerates` verdicts as coverage of this surface.
