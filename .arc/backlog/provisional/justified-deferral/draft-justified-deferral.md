# Draft: justified-deferral

- **Origin:** [internal] — captured during `lifecycle-closeout` planning (generate-tasks, 2026-06-23); surfaced
  when a deferral recommendation was made against the cohort's own closeout/terminus member.
- **State:** Provisional — methodology principle, not yet sequenced or vetted.
- **Purpose:** Author the **dual of anti-rider** — a "when deferral isn't justified" principle guarding against
  reflexive buck-passing, the way anti-rider guards against bloat.

---

## Problem / Motivation

ARC codifies **anti-rider** (guards against a distinct concern riding the current change) but has no **dual**
guarding against reflexive buck-passing — a *belonging* concern routed out when it has no home or is the work's
own terminus. The deferral machinery (inbox, errands, stubs, the routing table) is legible and easy to justify,
so judgment calls drift toward routing-out. Surfaced live when a deferral was recommended against the cohort's
own closeout/terminus member (which, by definition, has no downstream home).

## Approach

A DEV-RULES.ARC § Discovered Work Routing subsection stating the **flip-conditions** where the route-out burden
inverts from expansion (the default — correct for most work) to deferral:

1. the work is the designated **terminus** for the concern (closeout / the WU whose charter *is* this concern);
2. **no concrete existing home** AND the concern is uniform with the work in hand (spawning a WU/errand to
   justify the defer creates a home just to leave through it);
3. deferring would leave the substrate **inconsistent**, not merely un-enhanced (consistency-on-exit, generalized
   to WU/errand scale).

The design challenge is calibrating the flip-conditions so it counteracts reflexive deferral *without* becoming
"absorb everything" (re-creating the rider / PR-pollution failure mode anti-rider exists to prevent).

## Scope

The methodology principle (DEV-RULES.ARC § Discovered Work Routing, adopter-facing) kept **separate** from an
agent-calibration note (why agents over-defer: a trained scope-minimization prior + ARC's legible deferral
vocabulary — agent-guidance, lighter touch, likely an agent-brief surface). Both package source and the `.arc/`
copy. Design fork (exact flip-condition set; where the agent-calibration note lives) → reviewed lane.
