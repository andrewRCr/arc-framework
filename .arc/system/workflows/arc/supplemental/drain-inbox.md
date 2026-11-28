---
purpose: Drain the personal capture inbox to authoritative homes via a gated, phased pass — classify with no writes, confirm the routing plan, route to homes, and hand committed atomic execution to run-errand, leaving no un-triaged entries.
audience: agent
arc:
  methods:
    - route-discovered-work
    - assess-parallel-fit
---

# Workflow: Drain Inbox

Routing body for the `arc-housekeep` skill, and the shared logic the `session-handoff` between-WUs path
dispatches — one workflow, two doors. It reads the personal inbox and, in a **gated, phased** pass, classifies each
entry, **confirms the routing plan before any write**, routes every entry to its authoritative home, and hands any
committed atomic execution to `run-errand` — leaving the personal inbox with **no un-triaged entries**.

The drain **routes**; routing is not execution. Moving a multi-step note into its stub's inbound list _is_ routing —
one `arc route` moves it inbox → stub. Atomic _execution_ is never run inside the drain: a committed atomic is handed
to the [`run-errand`][run-errand] lifecycle as an explicit, opt-in transition _after_ routing (`arc-session` is the
sole top-level execution entrypoint). See [DEV-RULES.ARC § Discovered Work Routing][dev-rules-arc] for the
capture-vs-execution boundary this mechanism enforces.

Every routing write is a store write from the checkout the drain runs in, carried out through the
[route-discovered-work][route-discovered-work] binding; no branch, pull request, or merge carries it.

## When This Workflow Applies

- **Between work units** (the primary sweep) — the natural moment to clear captures.
- **Mid-WU on demand** — invoked deliberately, from the checkout in hand, to clear accumulated captures without
  waiting for the next between-WUs boundary. Let captures stack before a mid-WU sweep rather than thrashing the
  drain per item.

## Drain steps

The drain is **gated and phased**: classify with no writes, **stop at the confirmation interlock**, then route,
then optionally transition to execution. The interlock is unconditional — the drain never routes straight from
classification.

### 1. Read the inbox

Read the personal inbox in full with `arc inbox personal --json` — both its `Errand` section (errand-class captures)
and its `Work Unit` section (spec-worthy captures). Each row carries its entry's `id` and `version`, which every
later write takes. Read `arc errand queue --json` and match queue members to captures by inbox and entry ID when
the listings provide them. If a read is refused, surface the condition and apply the reported remedy. Use the
evidence and selectors the remedy supplies when it completes the read, or retry after repair before classifying.

A row carrying `survivor` goes to the carry step even if it is queued. Treat other matching queued captures as
already triaged and preserve their execution disposition unless the Owner explicitly asks to revisit it.

Read `arc inbox project --json` to resolve project-qualified members. If a queue member is missing from its
named inbox, inspect both inboxes and the available evidence of its prior disposition. Include interrupted moves
and removals in the confirmation plan. For a verified move, keep treating the entry as triaged and propose the new
qualified reference if it is still meant to run. For a verified removal or a move that ends execution, propose
dropping the stale reference. Ask the Owner to resolve missing or ambiguous evidence before changing or handing
off that member.

### 2. First-pass classification — no writes

Classify each entry except queued captures and survivors handled in § 1. Reclassify a queued capture here if the
Owner explicitly reopens it and it has no survivor home. Use the **logical model** — _entry · character · home_.
This pass **makes no writes**. It produces the routing plan the interlock (§ 3) confirms. Resolve, per entry:

**Method fire-point** · [route-discovered-work][route-discovered-work], for each capture:

```yaml
route-discovered-work:
  entry: each capture, with its WU_Target and _Shapes_ when present
  door: drain, routing a capture
```

For held entries in a backlog stub picked at § 3, run the same method at this re-triage fire-point:

```yaml
route-discovered-work:
  entry: each held entry in the picked backlog stub
  door: drain, re-triaging a backlog stub
  host: the picked backlog stub
```

- **Disposition and home.** Use the method's ordered gate and homing: verify against the current tree, re-assess
  the record floor regardless of capture-time character, and validate coupling and scope boundaries. `WU_Target`
  is the first candidate to check, never a destination decided by existence. Retain any unclear Errand pair with
  all four record answers for the Owner at § 3.
- **Started targets.** A gate-confirmed `hold` into a started work unit moves into its inbound list like any other
  `hold`, and its owner takes it up there. For a live target, draft the message that points its session at the
  routed entry for the plan. A failed or ambiguous status lookup stops with its diagnostic, never with a
  checkout-local path guess.
- **Decision-only holds.** For each held entry waiting only on a decision, put that decision to the Owner at § 3
  in this drain. Route the entry according to the answer in § 4 of the same drain.
- **Group by concern.** Consolidate `new-stub` outcomes sharing one logical concern into one stub, and propose the
  grouping with its rationale. Entry count alone never establishes concern identity.
- **Commitment (new stubs).** Propose `provisional` unless the Owner commits to sequencing the work unit at § 3,
  which warrants `planned`. Commitment is distinct from maturity; the Owner decides.
- **Execute-now bias.** For an `errand` outcome, prefer execute-now when it is a quick win cheaper than routing
  plus a later session. If this session cannot carry it, defer or propose fresh-session execution through § 5.
- **Atomic disposition.** An `errand` outcome takes execute-now or defer; retain remains the Owner's escape hatch.
  Carry the disposition to § 4 or § 5.
- **Overlap (advisory).** After destinations resolve and **before** the § 3 confirmation interlock, collect the
  paths each execute-now Errand will touch. Run the existing overlap read over those paths:

  ```bash
  arc errand check --target <path>... --json
  ```

  Apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only — no design-load). Include any shared-
  surface advisory in the routing plan presented at § 3 so sequencing and coordination are visible **before**
  edits land. **Non-gating:** never block the drain on overlap; surface and let the operator reorder, retain, or
  proceed. Do not build a second overlap oracle.

### 3. Confirmation interlock

> [!IMPORTANT]
> `workflow-interlock`: Stop before any write. Present the full routing plan — each concern's outcome or unclear
> Errand pair with its four record answers, `_Shapes:_` for each fold or hold, and the coupled target's CLI horizon
> advisory verbatim. Include groupings, new-stub commitment levels, any message to a live target, atomic
> dispositions, existing queued captures, queue repairs, survivor carries, and overlap advisories. Await explicit
> confirmation before routing (§ 4).

For each routed-into backlog stub, show the `retriage` offer `arc inbox <list> --json` reports when the stub already
holds entries. Use the stub's UID if its slug is `personal` or `project`. When the Owner picks targets, return their
held entries to § 2's re-triage fire-point, with the picked stub as `host`, and present the revised routing plan at
this same stop before any write.

The Owner may adjust proposals within the method's door bounds: regroup, change a commitment level, choose an
unclear pair, flip an Errand between execute-now and defer, or retain an entry.

### 4. Route — write to homes

Carry out each confirmed concern's outcome through the method's binding, with each entry's ID and version from its
listing. A move settles its source through `arc route`. For dismissals, folds, and mints, verify the binding's removal
result after the outcome's writes land. A `retained` removal result leaves a capture pending for another decision.

Split a capture by replacing it in its source list with all confirmed parts in one `arc save` before dispatching any
part. Keep the original ID on the retained or queued residual, if any, or on one part of a split with no residual.
Let the save stamp distinct IDs on the other parts. Re-list the source and verify the parts against the approved
split. If the unsplit entry remains, a part differs, or a part carries `survivor`, stop before dispatching or
carrying any part. Read any marked part's `survivor.home` to check whether the whole capture already landed.
Bring the current evidence back to the Owner. Preserve already routed work and agree which parts are redundant
and which still need routing. Use the persisted IDs and versions for confirmed moves and removals. If a destination
refuses, leave its part in the source, surface the condition and apply the reported remedy. Resume from the
remaining listed parts after the remedy completes the move or makes retry safe.

- **Survivor** — follow the binding's survivor check and carry to `survivor.home` through the move form. If the
  carry would narrow the work already routed, take the source and home back to the confirmation interlock.
  Once the carry settles the source, reconcile any queue reference in § 5.
- **Existing-stub home** — a gate-confirmed `fold` or `hold` into a backlog stub. The drain folds only a trivially
  additive, on-topic note into the stub's draft, saved with `arc save`; otherwise it moves the entry into the stub's
  inbound list with its `_Shapes:_`. The owner folds or dispositions every inbound entry before the draft is ready,
  at drafting's readiness exit and spec entry; the drain never performs that owner's pass.
- **Started-target home** — a gate-confirmed `hold` into a started work unit moves into its inbound list the same
  way. Once the writes are done, send each confirmed message to a live target, or hand it to the Owner to relay as
  the turn's last act.
- **New stub** — carry out a `new-stub` outcome, or one grouped set sharing a concern, through `arc stub` at the
  confirmed commitment level, with the minted design the binding names. A provisional stub carries no design
  authority.
- **Homeless atomic — defer** — every deferred `errand` outcome takes this route; an Errand-shaped concern has no
  work-unit home. Move it to the project inbox (`--to project`) under `pm.mode: arc-in-git`, which is atomic-only;
  follow the project's convention otherwise.
- **Retain (escape-hatch)** — the user can explicitly keep an atomic in the personal inbox to defer routing or
  execute it soon. **Never the default, never agent-suggested.** ARC accepts personal inbox writes only from the
  inbox's identity. Anyone with read access to the state remote can read retained entries published by `arc sync`.
  Set the managed field _Hold:_ to `true` and **re-stamp** _Created:_ to the retain date (both values backtick-delimited
  per the managed-field grammar) in the inbox's file, then save with `arc save`, so the reminder floor (never same-day)
  applies from now. A retained entry is _triaged_ and the reminder sweep stays active. It does not count toward
  `inboxState.housekeepNeeded`.
- **Execute-now atomic** — queued in § 5, not written here.

**Picked-stub re-triage.** Carry out the confirmed outcomes over the stub's inbound list:

- `dismiss` removes the held entry.
- `hold <other>` moves it to another work unit's inbound list with its `_Shapes:_`.
- `new-stub` takes the new-stub route above and removes the old entry.
- `errand` takes the homeless-atomic route, moving the old entry.
- `hold <host>` keeps the entry or leaves the saved split residual in place. For a split in another person's stub,
  ask its owner to replace the original with the confirmed parts and save them before routing from that list.

### 5. Execution transition — committed atomics → `run-errand`

Before dispatch, re-read `arc errand queue --json` and verify the affected entries when the confirmed plan changes
the queue. Remove or update a queue reference once its confirmed change of disposition lands, including an
interrupted change that landed before this drain and was confirmed in § 3. Drop an unverified missing reference
only if the Owner explicitly confirms dropping it and it is still missing. Use the resulting inbox and ID if the
entry remains queued. Write the changed queue with `arc errand queue set <file | ->`, keeping its members in order
and appending each newly approved Errand's entry once:

```json
{"schemaVersion":1,"members":[{"inbox":"personal","id":"<queued-id>"},{"inbox":"personal","id":"<new-id>"}]}
```

For a refused read, follow § 1. For a refused write, surface the condition and apply the reported remedy.
Continue to dispatch when `set` or the remedy completes the queue update. When the remedy only clears the refusal,
retry the refused step. The setter replaces the whole queue in one write.

For each **execute-now** atomic, hand off to the [`run-errand`][run-errand] lifecycle — the drain never executes
atomic work itself. The atomic's entry is the Errand's **origin**: pass `personal:<id>` to `run-errand` as its
`--from-inbox` selector when the read supplied an ID. If a remedy supplied the queue, match its resulting offer to
the confirmed atomic and use the offer's origin selector. Two explicit paths, the user's choice by context budget:

- **Same session** — transition into `run-errand`, then **return here for the next**. Run the committed atomics
  **one at a time, sequentially** (batch only when they are genuinely one concern). Launch from the
  `allocation.checkoutPath` returned by `arc errand open`. Under partial protection, use the free primary checkout
  and run directly on base. Under full protection, use the branch in the returned `identity`. Follow `run-errand` for
  checkout restoration after each Errand.
- **Fresh session** — leave the execute-now atomics queued and resume each via `arc-session --errand` later; the
  drain still closes (§ 6) with those entries triaged-but-pending.

**The drain does not wait on an Errand.** Under full protection an Errand's start moves its entry out of the personal
inbox into the Errand's description and off the queue. Abandon returns the entry to an inbox unless another open
Errand holds it. Under partial protection the entry stays in the inbox until the Errand's close removes it.

### 6. Confirm the drain is complete

The drain **closes on dispositions, not on an empty inbox.** Verify every entry has a terminal disposition —
**routed** (moved by `arc route`, a deferred atomic to the project inbox included), **dismissed** (removed),
**retained** (`_Hold:_`, entry stays), or **queued** (on the Errand queue until its Errand starts; a partial Errand's
entry stays until its close). No entry is left **un-triaged**. The entries that remain are only the retained and
queued ones; the queued ones' tail is owned by `run-errand`, not the drain. Report what routed where, which messages
went to which sessions, which entries were retained, and which Errands are queued or in flight. Surface the project
inbox's aging as an advisory while it holds entries — reminder nudges for personal captures and in-flight-errand
staleness belong to session-init orientation, not the drain.

---

[run-errand]: run-errand.md
[route-discovered-work]: ../../../methods/route-discovered-work.md
[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
