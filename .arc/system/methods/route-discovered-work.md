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

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec],
>   [activate-work-unit.md][activate-work-unit], [verify-work-unit.md][verify-work-unit], [drain-inbox.md][drain-inbox],
>   [run-errand.md][run-errand]
> - **When:** The drain classifies captures or re-triages picked backlog stubs, `arc-inbox` runs its route-now mode,
>   `run-errand` routes a concern discovered during an Errand, or the owner's planning pass clears inbound entries at
>   drafting's readiness exit or spec entry, and personal inbox captures naming the work unit at spec entry,
>   activation, or verification.
> - **Signature:** `route-discovered-work(entry, door, host?) → per concern, one outcome or an Owner-decided pair`
> - **Contract:** Decide disposition → homing → integration → re-triage. Decide only: callers execute outcomes
>   through verbs after their own interlock. Read lifecycle position, scope window, owner, and horizon advisory from
>   `arc status`, and design from `arc view`.

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
the scope boundary, and the named decision or section. For a routed-into target, also read its inbound list with
`arc inbox <list> --json` using the selector in the binding below for its pending count and oldest date.
Never infer lifecycle or owner from paths; use `arc status <slug> --json`.

Delegate pointed reads when they would flood context, under DEV-RULES' Sub-agent scope. They remain advisory until
the primary reads the named section. Give the reader no primary-side door or allowed-outcome set.

### Target lifecycle

Route a concern coupled to another work unit when it is raised, at the latest at the next report boundary, never held
for handoff or later; naming the owner without placing the concern is not a route. Read the target's position at that
moment, from the lifecycle position and `scopeWindow` that `arc status <slug> --json` reports, before proposing or
retaining any `fold` or `hold`, including own-work reconciliation, re-triage, and fallback holds. What the session
learned at its start is not a position. These rules govern the defaults below within each door's allowed outcomes.

- **`open`** (backlog or planning, a finished plan included): the door's outcomes apply. After its spec is approved,
  an addition costs an amendment and another review; name that cost at the door's Owner stop.
- **`gated`** (activated, before its verification phase): admit only what changes none of its pre-commitment text —
  no spec decision, goal, success criterion, or task phase; in practice, coordination on an interface it already
  exposes, or completing what its spec commits to. Route anything else out — `new-stub`, `hold` on a follow-on stub,
  `errand`, or `capture`, as the door permits — and carry admission as the alternative at the door's Owner stop. Only
  the Owner selects admission. The work unit's owner then writes a spec amendment through [amend-design][amend-design]
  or new tasks: `fold <wu>` at the owner's own door, otherwise `hold <wu>`, which its owner takes up from the inbound
  list.
- **`closed`** (verification phase onward, integrating included): takes no routed concern; route it out. Only the
  Owner can elect admission, through [amend-design][amend-design], which returns the work to its task loop; an
  Integrating unit is first withdrawn with `arc reopen`.
- **No window:** `arc status` names why; admit nothing until the target's session or owner confirms its position.

**Live target.** A work unit with a registered checkout (`worktreePath` in `arc status <slug> --json`) is live:
coordinate with its session by message beside the route. The message points the target's owner at the routed entry by
the ID `arc route` reports and adds no outcome of its own; a `closed` target takes no entry, so no message places a
concern there. A checkout usually, but not always, has a session working in it. Propose the message to the Owner, and
send it without asking only where the two sessions already have a conversation. Use the harness's session messaging
where it has one; otherwise give the Owner the message to relay. A message for the Owner to approve or relay ends the
turn it appears in: produce it when it is ready, then stop. Once it is sent or handed over, the Owner holds its
delivery, and the receiving session handles the concern as its own work unit's. Without a message, the entry waits in
the inbound list for its owner's next pass.

### Integration and re-triage

Subject to the lifecycle rules above, default to `fold` at the owner's own pass and where the binding permits an
Errand's route-to-home to weave into a backlog stub. Default to `hold` at the drain, on fast-path routes into another
work unit, and for a foreign owner. A started work unit takes no woven note from anyone but its owner. Carry-out
rules live in the binding below.

With `host`, apply own-work reconciliation above at the ready-making owner's pass; other concerns run the same
gate using the current home as incumbent: staying is `hold <host>`, folding is `fold <host>`, and leaving can name
another home, a new stub, an Errand, dismissal, or an owner rejection.

**Owner's planning pass:** fold or disposition every inbound entry at the pass that makes the draft
formalization-ready. It runs at drafting's readiness exit when inbound entries are the returned gap, and at
create-spec's entry check for arrivals while a ready draft waited. It takes every outcome except `hold <host>`
at that pass. Create-spec's entry check, activation, and verification also take each personal inbox capture naming
the work unit through this door; activation and verification exclude `hold <host>` too. Leave a compact dispositions
table in the draft for entries whose disposition no other record keeps: entry, outcome, fold location, and reason for
rejection or dismissal. Draft review reads the table; readiness checks only that nothing remains held. Retire the
table with the draft at create-spec. Activation and verification run after the draft is retired, so activation
records each rejection or dismissal, with its reason, in the notes companion, and verification in its verification
record's `_Captures:_` category. Row coverage is in the binding.

**Drain re-triage:** only backlog stubs may be groomed; only a started work unit's owner edits or removes its entries.
At the drain's confirmation interlock, offer each routed-into backlog stub already holding entries once, with the
`retriage` offer from `arc inbox <list> --json` using the selector in the binding below. Re-triage only targets the
Owner picks, through that door's bounded outcomes, then confirm the revised routing plan at the same stop. Keep its
dispositions in the routing plan, never the target's draft.

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

Each Owner stop shows the outcome, `_Shapes:_`, any pair, and the coupled target's horizon advisory before a write.
Cascade sweeps what was not routed when raised; it has no new stop and captures its routes. Its `errand`, and the fast
path's, Errand route-to-home's, and owner's-pass deferred `errand`, are `§ Errand` captures. The drain's deferred
`errand` takes its homeless-atomic route.

**Unclear Errand line:** at a door with an Owner stop, return both `errand` and the work-unit candidate with the four
record answers; the Owner picks there. Cascade instead returns `capture` for the drain to decide.

Any other caller takes a listed door; adding a door changes this list. A planning-kickoff or activation sweep
pulls in its change's same concern without the gate, uses the owner's-pass door for anything else it brings in,
and carries out anything for a sibling through the binding.

A `fold` outside the door's set becomes `hold` on the same work unit. A held entry the door may not fold or reject
stays `hold <host>`. At the ready-making owner's pass, fold or reject instead of leaving an entry held.

### Fast-path judgments

Gate before minting. A `new-stub` may not invent commitment, priority, a `Class` estimate from
[classify-work-unit][classify-work-unit], a legible slug, origin, or dependencies. Its design carries the concern
and opens with a one-sentence Purpose. Carry out minting through the binding below.

### Binding: carrying out outcomes

- **Inbound entries:** a work unit's inbound list, read with `arc inbox <list> --json`. Anyone adds an entry, and
  anyone moves one out of a backlog stub's list; only a started work unit's owner moves one out of its list, and only
  the work unit's owner edits its list's file. A `hold` into a started work unit is an entry like any other, which its
  owner takes up; admitted Active entries take the amendment or task route above.
- **Routes:** `arc route <id> --from <list> --expected-version <version> --to <destination>` moves a listed entry,
  with the ID and version `arc inbox <list> --json` reports; `arc route --to <destination>`, with the entry on standard
  input, adds a new one. The selectors `personal` and `project` are reserved for the inboxes. For a work item, use its
  slug or UID, and use its UID for reads, `--from`, and `--to` if its slug is reserved. `--section` names the personal
  inbox's `Errand` or `Work Unit` section. The verb stamps `_Id:_` and `_Created:_`, writes `_Routed from:_` into an
  inbound list, and drops fields the destination does not take.

  Before moving a `hold` entry, save any confirmed `_Shapes:_` change with `arc save`. For another person's stub,
  ask its owner to make that edit and save it. After the save, re-list the source and compare the entry's ID, section,
  and `raw` bytes against the reviewed row with only the confirmed `_Shapes:_` edit applied. Use the relisted version
  only on an exact match. If the row is missing or differs, take the current listing back to the Owner for a routing
  decision before moving anything for that entry. `already-home` is a completed route. If a refusal names a newer
  version, re-list the source and reconsider the route before retrying.
- **Removal:** a moved entry has already left its list. Remove a dismissed, folded, or minted personal capture with
  `arc user inbox-remove --id <id> --expected-version <version>`. The dispositions `removed` and `absent` both
  complete the removal. On `retained`, re-list the personal capture and compare its current content with any fold or
  mint already applied, then seek a disposition for the remaining work. Remove an entry from the project inbox, or
  from an inbound list whose work unit you own, by deleting it from the list's file, then save with `arc save`. To
  remove one from another person's backlog stub, move it into your personal inbox and remove it there.
- **Dispositions table:** no other record keeps an owner's-pass disposition, so give every entry a row.
- **Drain writes:** each is a store write from any checkout, with no branch or pull request. The store's history
  records what moved where, with a routing receipt for each move into or out of an inbox, never the target's draft. Its
  counts are shown, never compared; the re-triage offer is the one the listing reports.
- **Route-now and an Errand's route-to-home:** the session carries out its own confirmed route with these verbs and
  `arc stub`; no Errand carries it. An Errand's route-to-home may also weave a `fold` into a backlog stub's draft,
  saved with `arc save`.
- **Survivors:** a personal inbox row carrying `survivor` was edited after it was routed. Read the entry with the
  same ID at `survivor.home` before carrying. If the carry would drop an already routed concern, preserve the
  held entry and confirm how to reconcile it with the Owner. Otherwise carry through the move form to its named home,
  with no `--section`: every such home has one section.
- **Capture vehicles:** a deferred route is a pre-routed capture with `WU_Target` and `_Shapes:_`, and a deferred
  `errand` an Errand capture, each added with `arc route --to personal --section <"Work Unit" | Errand>`. `fold` into
  the session's own work unit and an `errand` execute directly. Every new capture gets the full gate at the drain;
  pre-routed values are first candidates, and disagreements enter its routing plan.
- **Cascade vehicles:** `hold <other>` and `new-stub` are pre-routed captures.
- **Minted design:** carry slug, commitment, priority, Class, and origin through
  `arc stub <name> --commitment ... --priority ... --class ... --origin ...`; dependencies have no CLI option and
  go into the minted meta's `Depends On`. Write a `draft-*` beside the minted meta, carrying the concern and opening
  with a one-sentence Purpose, and save it with `arc save`. Name it through `arc stub --design`, which records only
  the reference.

---

[amend-design]: ../workflows/arc/supplemental/amend-design.md
[classify-work-unit]: classify-work-unit.md
[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[drain-inbox]: ../workflows/arc/supplemental/drain-inbox.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
