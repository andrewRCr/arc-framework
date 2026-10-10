---
name: route-discovered-work
description: Decide disposition, home, integration, and re-triage for each discovered concern.
arc:
  methods:
    - classify-work-unit
related:
  - classify-work-unit
override-active: false
---

# Method: route-discovered-work

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec], [drain-inbox.md][drain-inbox],
>   [run-errand.md][run-errand]
> - **When:** The drain classifies captures or re-triages picked backlog stubs, `arc-inbox` runs its route-now mode,
>   `arc-errand` gates a directly invoked route shape, `run-errand` routes a discovery or re-checks a route-only
>   Errand before writing, or the owner's planning pass clears inbound entries at drafting's readiness exit or spec
>   entry.
> - **Signature:** `route-discovered-work(entry, door, host?) → per concern, one outcome or an Owner-decided pair`
> - **Contract:** Decide disposition → homing → integration → re-triage. Decide only: callers execute outcomes
>   through verbs after their own interlock. Read lifecycle position, owner, and horizon advisory from `arc status`,
>   and design from `arc view`.

## route-discovered-work.override

[No override configured]

## route-discovered-work.default

| Input   | Kind     | Contents                                                                                             |
| ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `entry` | required | Capture, inbound entry, cascade item, or held concern, with `WU_Target` and `_Shapes:_` when present |
| `door`  | required | One door in the closed list below                                                                    |
| `host`  | optional | Incumbent work unit holding the entry; present only for re-triage                                    |

Return each concern's **outcome**, its **deciding test or own-work coverage**, and for `fold` or `hold`,
`_Shapes:_ <decision or section>`. Where the Errand line is unclear at an Owner stop, return the pair described below
with all four record answers.

Split an entry carrying multiple concerns, or a resolved part and a residual, by the anti-rider concern-identity
rule first. Give each part one outcome. A horizon advisory's separable part follows the same split.

When a work unit starts planning or activates, pull in items its own change already covers by that same-concern
test; these take no routing outcome.

At the ready-making owner's pass, first split and verify each entry as the still-live test requires. A live part
already covered by the host's own change is reconciliation of that change: return `fold <host>`, with **own-work
coverage** as its deciding reason and `_Shapes:_` naming the covered section, before the record-floor test. Sharing
a file or domain alone does not establish concern identity. Independent residuals and other concerns run the gate.

### Disposition gate

Apply these tests in order to each concern:

1. **Still live.** Verify against the current tree. `dismiss` a resolved or obsolete concern, naming what resolved
   it. Split partly resolved entries and run the residual through the gate independently.
2. **Errand-shaped stays an Errand.** Load [classify-work-unit][classify-work-unit] and apply boundary test 1.
   Touching load-bearing infrastructure is a review-lane signal, never a wrapper floor. An Errand-shaped concern
   returns `errand` whatever its target; show the four answers when proposing an unclear pair to the Owner.
3. **Coupling.** A work-unit home must name the decision or section the concern shapes as
   `_Shapes:_ <decision or section>`. Shared domain alone identifies a neighbor, never a home.
4. **Scope boundary.** Check the target's Out of scope, Won't Do, or Non-Goals. An exclusion defeats that candidate
   even when the concern shares its domain or names a decision there.

A live spec-worthy concern with no candidate passing tests 3 and 4 returns `new-stub`, provisional at the drain
unless the Owner commits at its interlock; on the fast path without commitment it returns `capture`.

Show a coupled target's listing-row `horizonAdvisory` verbatim at the door's Owner stop. It is advisory, never a
gate: the method evaluates no tier, priority, or horizon itself.

### Homing

Shortlist from the entry's `WU_Target` hint and the purpose rows of `arc status --project --json`. A hint is the
first candidate to check, never a destination decided by existence.

Validate at most three finalists with `arc view design --for <slug>`: map headings first, then read Purpose,
the scope boundary, and the named decision or section. For a routed-into target, also read its held entries for
their count and oldest date. Never infer lifecycle or owner from paths; use `arc status <slug> --json`.

Delegate pointed reads when they would flood context, under DEV-RULES' Sub-agent scope. They remain advisory until
the primary reads the named section. Give the reader no primary-side door or allowed-outcome set.

### Integration and re-triage

Default to `fold` at the owner's own pass and where the binding permits an Errand's route-to-home to weave into a
backlog stub. Default to `hold` at the drain, on fast-path routes into another work unit, and for a foreign owner.
A started work unit takes no woven note from anyone but its owner. Carry-out rules live in the binding below.

With `host`, apply own-work reconciliation above at the ready-making owner's pass; other concerns run the same
gate using the current home as incumbent: staying is `hold <host>`, folding is `fold <host>`, and leaving can name
another home, a new stub, an Errand, dismissal, or an owner rejection.

**Owner's planning pass:** fold or disposition every inbound entry at the pass that makes the draft
formalization-ready. It runs at drafting's readiness exit when inbound entries are the returned gap, and at
create-spec's entry check for arrivals while a ready draft waited. It takes every outcome except `hold <host>`
at that pass. Leave a compact dispositions table in the draft for entries whose disposition no other record keeps:
entry, outcome, fold location, and reason for rejection or dismissal. Draft review reads the table; readiness checks
only that nothing remains held. Retire the table with the draft at create-spec. Row coverage is in the binding.

**Drain re-triage:** only backlog stubs may be groomed; only a started work unit's owner edits or removes its entries.
At the drain's confirmation interlock, offer each routed-into backlog stub already holding entries once, showing
its count and oldest date. Re-triage only targets the Owner picks, through that door's bounded outcomes, then confirm
the revised routing plan at the same stop. Split a large set by the drain's existing packaging discipline.
Keep its dispositions in the routing plan and the binding's write record, never the target's draft.

**Cascade:** a work-unit cascade routes only when it names the decision it shapes in the affected work unit.
Never reopen that work unit's body mid-pass or route on shared domain alone.

### Outcome vocabulary

| Outcome     | Meaning                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `fold <wu>` | Weave into that work unit's body                                                                   |
| `hold <wu>` | Hold as an inbound entry in that one work unit                                                     |
| `new-stub`  | Mint a work unit through `arc stub`, with a design carrying the concern and a one-sentence Purpose |
| `errand`    | Run as an Errand or defer by the door's route                                                      |
| `capture`   | Capture with home undecided (`WU_Target: TBD`)                                                     |
| `dismiss`   | Resolved or obsolete; name what resolved it                                                        |
| `reject`    | Declined on design grounds; state the reason                                                       |

A hold names one work unit, never a group of owners.

### Doors and Owner stops

| Door                              | Allowed outcomes                                                                                           | Owner stop                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Drain, routing a capture          | All except `reject` and `capture`; `fold` only for a trivially additive, on-topic note into a backlog stub | Routing-plan confirmation             |
| Drain, re-triaging a backlog stub | `dismiss`, `errand`, `hold <other>`, `new-stub`, `hold <host>`                                             | Revised routing-plan confirmation     |
| Fast path                         | All except `reject`; `fold` only into the session's own work unit; `capture` only without commitment       | Proposal before route-now             |
| Errand route-to-home              | Fast-path outcomes, subject to the binding                                                                 | Errand's proposal before routing      |
| Owner's planning pass             | All; at the pass that makes the draft ready, exclude `hold <host>`                                         | Owner's pass                          |
| Cascade at draft close            | `hold <other>`, `new-stub`, `errand`, `capture`, `dismiss`                                                 | Captures reach the Owner at the drain |

Each Owner stop shows the outcome, `_Shapes:_`, any pair, the coupled target's horizon advisory, and any wait named
by the binding before a write. Cascade has no new stop and captures its routes. Its `errand`, and the fast path's,
Errand route-to-home's, and owner's-pass deferred `errand`, are `§ Errand` captures. The drain's deferred `errand`
takes its homeless-atomic route.

**Unclear Errand line:** at a door with an Owner stop, return both `errand` and the work-unit candidate with the four
record answers; the Owner picks there. Cascade instead returns `capture` for the drain to decide.

Any other caller takes a listed door; adding a door changes this list. A planning-kickoff or activation sweep
pulls in its change's same concern without the gate, uses the owner's-pass door for anything else it brings in,
and follows the binding's writer line for a sibling stub.

A `fold` outside the door's set becomes `hold` on the same work unit. A held entry the door may not fold or reject
stays `hold <host>`. At the ready-making owner's pass, fold or reject instead of leaving an entry held.
An allowed outcome the binding cannot carry waits by its named gap.

### Fast-path judgments

Gate before minting. A `new-stub` may not invent commitment, priority, a `Class` estimate from
[classify-work-unit][classify-work-unit], a legible slug, origin, or dependencies. Carry the first five through
`arc stub <name> --commitment ... --priority ... --class ... --origin ...`; dependencies have no CLI option and
go into the minted meta's `Depends On`. Its design carries the concern and opens with a one-sentence Purpose.

### Binding: carrying out outcomes

- **Inbound entries:** the draft's `## Inbound Buffer — Pending Integration` section. A held entry carries
  `routed from <origin>, <date>` and `_Shapes:_`. Owner adoption carries only a gated `hold` into a started work
  unit. A capture owned by that target's owner is transit to their session, never rest in a capture surface.
- **Writer line:** only a change off the base whose one concern is routing — the drain's or a route-only Errand's —
  writes another work unit's draft, and only a backlog stub's. Other routes reach a sibling as a pre-routed
  `USER-INBOX` capture, re-gated by the drain. A started target takes owner adoption, subject to the gap below.
  Owner stops hold this line; no enforcement is claimed.
- **Dispositions table:** no other record keeps an owner's-pass disposition, so give every entry a row.
- **Drain writes:** use its grooming PR off the base under full protection, direct base commit under partial.
  Record what moved where in the PR body or commit message, never the target's draft. Its counts are shown, never
  compared; the re-triage offer is judgment over the entries already read.
- **In-flight new home:** when re-triage's `hold <other>` names a started target owned by the drain's runner
  (`owner` from `arc status`), remove the old entry into a pre-routed `_Hold` capture for owner adoption.
  Another person's started target instead waits by the gap below, rewritten in place as `hold <host>` naming
  its decided destination.
- **Route-now vehicles:** routes outside the session's own work unit that write a backlog stub or mint a stub run
  as a route-only Errand's own change off the base, its own branch and PR under full protection, direct base commit
  under partial. Its Launch classifies the routing change, not the carried concern, and does not show that concern's
  record answers. The existing review threshold selects the planning-grooming or reviewed lane by ownership.
  Before writing, re-check coupling and scope, and for `new-stub` the shortlist, in the Errand's checkout against
  the base's current copies. A changed result returns to the Owner. Invoked directly, the route shape runs the
  fast-path gate before opening; a result other than a now-route goes to arc-inbox's hand-off with the confirmed
  outcome, without re-gating.
- **Capture vehicles:** deferred routes, routes into a started target, and routes where no Errand can open are
  pre-routed captures with `WU_Target` and `_Shapes:_`. This includes partial protection's `primary-occupied`
  refusal. `fold` into the session's own work unit and an `errand` execute directly. Every new capture gets the full
  gate at the drain; pre-routed values are first candidates, and disagreements enter its routing plan.
- **Cascade vehicles:** `hold <other>` and `new-stub` are pre-routed captures.
- **Minted design:** write a `draft-*` beside the meta in the minting change, carrying the concern and opening with a
  one-sentence Purpose. Name it through `arc stub --design`, which records only the reference.
- **Named gap:** nothing carries a route into another person's started work unit. Keep a held entry rewritten in
  place with its decided target, or keep a new concern as the capturer's `_Hold` capture. Name the wait at the door's
  Owner stop. Confirmation there authorizes that wait under both the known-home invariant and its planning-artifact
  dual; never silently waive either.

---

[classify-work-unit]: classify-work-unit.md
[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[drain-inbox]: ../workflows/arc/supplemental/drain-inbox.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
