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
later write takes. These are the entries to route; the project inbox is a _destination_, not a source. A `refused`
listing stops here until its remedy is applied.

A row carrying `survivor` was edited after an earlier route took it out. It takes no classification, only a carry to
its `survivor.home` at § 4.

### 2. First-pass classification — no writes

Classify every entry against the **logical model** — _entry · character · home_ — not its markdown shape, so a
later structured-record swap leaves the routing intact. This pass **makes no writes**; it produces the routing
plan the interlock (§ 3) confirms. Resolve, per entry:

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
> dispositions, survivor carries, and overlap advisories. Await explicit confirmation before routing (§ 4).

For each routed-into backlog stub, show the `retriage` offer `arc inbox <slug> --json` reports when the stub already
holds entries. The Owner picks targets; return their held entries to § 2's re-triage fire-point, with the picked stub
as `host`, and present the revised routing plan at this same stop before any write.

The Owner may adjust proposals within the method's door bounds: regroup, change a commitment level, choose an
unclear pair, flip an Errand between execute-now and defer, or retain an entry.

### 4. Route — write to homes

Carry out each confirmed concern's outcome through the method's binding, with each entry's ID and version from its
listing. A route moves its entry out of the personal inbox; every other outcome but a retain or a queue removes the
capture by ID once its writes land. Split a capture by adding each routed part as its own entry with
`arc route --to <destination>`, then removing the original or rewriting a retained or queued residual in place. Held
entries in a picked stub take the re-triage routes below instead.

- **Survivor** — carry each to its `survivor.home` through the move form.
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
- **Retain (escape-hatch)** — an atomic the user explicitly keeps in the personal inbox (private-until-vetted, or
  imminent self-execution). **Never the default, never agent-suggested.** Set the managed field _Hold:_ to `true`
  and **re-stamp** _Created:_ to the retain date (both values backtick-delimited per the managed-field grammar) in
  the inbox's file, then save with `arc save`, so the reminder floor (never same-day) applies from now. A retained
  entry is _triaged_ — it does not count toward `inboxState.housekeepNeeded`, and the reminder sweep keeps it from
  rotting.
- **Execute-now atomic** — queued in § 5, not written here.

**Picked-stub re-triage.** Carry out the confirmed outcomes over the stub's inbound list:

- `dismiss` removes the held entry.
- `hold <other>` moves it to another work unit's inbound list with its `_Shapes:_`.
- `new-stub` takes the new-stub route above and removes the old entry.
- `errand` takes the homeless-atomic route, moving the old entry.
- `hold <host>` keeps the entry, or rewrites only the residual of a split in place.

### 5. Execution transition — committed atomics → `run-errand`

Queue the execute-now atomics once before dispatch. Read the queue with `arc errand queue --json`, then replace it
with `arc errand queue set <file | ->`, keeping its members in order and appending each newly approved Errand's entry:

```json
{"schemaVersion":1,"members":[{"inbox":"personal","id":"<queued-id>"},{"inbox":"personal","id":"<new-id>"}]}
```

Continue only from `set`; `refused` surfaces its reason and remedy and halts before any Errand opens. The verb
replaces the whole queue in one write — never reorder it by hand.

For each **execute-now** atomic, hand off to the [`run-errand`][run-errand] lifecycle — the drain never executes
atomic work itself. The atomic's entry is the Errand's **origin**: pass `personal:<id>` to `run-errand` as its
`--from-inbox` selector. Two explicit paths, the user's choice by context budget (never a structural gate):

- **Same session** — transition into `run-errand`, then **return here for the next**. Run the committed atomics
  **one at a time, sequentially** (batch only when they are genuinely one concern). `run-errand`'s Launch takes its
  checkout from `arc errand open`; the isolation shape — a separate worktree where spawning is available, otherwise
  an in-place `chore/<slug>` branch in the primary base checkout — follows protection mode and worktree availability
  (see `run-errand`). Either way the Errand never executes on the drain's launching branch, and control returns to the
  drain's checkout after each. No dependency on having entered through session-init's errand arm.
- **Fresh session** — leave the execute-now atomics queued and resume each via `arc-session --errand` later; the
  drain still closes (§ 6) with those entries triaged-but-pending.

**The drain does not wait on an Errand.** Under full protection an Errand's start moves its entry out of the personal
inbox into the Errand's description and off the queue, and its abandon returns the entry to the inbox; under partial
protection the entry stays in the inbox until the Errand's close removes it.

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
