---
purpose: Drain the personal capture inbox to authoritative homes — classify each entry by character and home, route it in one batched pass, and leave the inbox empty.
audience: agent
---

# Workflow: Drain Inbox

Routing body for the `arc-housekeep` skill, and the shared logic the `session-handoff` between-WUs path
dispatches — one workflow, two doors. It reads the personal capture inbox (`USER-INBOX`), classifies each
entry by character and home, and routes every entry to its authoritative home in a single batched pass,
leaving the inbox empty.

The drain clears captures; it does not *execute* them. Routing a multi-step note to its stub is not
execution — the drain writes it straight to the stub. Standalone atomic *execution* is delegated to a
`run-errand` errand; the drain never runs atomic work itself. See
[DEV-RULES.ARC § Discovered Work Routing][dev-rules-arc] for the capture-vs-execution boundary this
mechanism enforces.

## When This Workflow Applies

- **Between work units** (the primary sweep) — the lowest-isolation-cost moment, when the base branch
  makes shared-planning writes native.
- **Mid-WU on demand** — invoked deliberately to clear accumulated captures without waiting for the next
  between-WUs boundary. The precondition below governs *where* the drain may write, not *when* it runs.

## Precondition: base-branch write context

The drain writes shared base-branch paths — stub edits, freshly scaffolded `provisional/` stubs, and
homeless flushes to the shared inbox. Those writes must originate from a **base-branch write context**,
never a work-unit worktree's branch, or they land on the wrong branch and tangle an unrelated WU's PR
with grooming.

This is a **machine-checked guard, not prose discipline**. Resolve the write context first:

```bash
arc housekeep check --json
```

The check resolves the current worktree path, the current branch, and the configured base branch
(`branch.base`) — the same context `arc errand check` resolves — and classifies the invocation:

- **Base-branch write context** → proceed to the drain steps.
- **Work-unit branch** → **refuse and offer to relocate**: hop to a base-branch write context, run the
  sweep there, and return. The relocation mechanics follow protection mode — see
  [strategy-work-organization § Cheap-branch path][work-org] and
  [§ Branch Protection Modes][work-org]. Launching from any worktree is not a blocker; only *writing*
  shared paths from a WU branch is.
- **Degenerate context** (detached HEAD, or no resolvable base) → **safe refusal**, never a silent write.

The guard is **guidance keyed on write context, not a gate on having an active WU**: the precondition is
a base-branch write context, *not* "no active work unit." Housekeep is therefore invokable mid-WU — hop
to the primary worktree, sweep as a batched errand, and return. Let captures stack before a mid-WU sweep
rather than thrashing the drain per item.

## Drain Steps

### 1. Read the inbox

Read `USER-INBOX` in full — both `§ Atomic` (single-step captures) and `§ Work Unit` (multi-step
captures). These are the entries to route; the shared inbox (`ATOMIC-INBOX`) is a *destination*, not a
source.

### 2. Classify each entry

Classify against the **logical model** — *entry · character · home* — not the entry's markdown shape, so a
later structured-record swap leaves the routing intact. Two questions resolve the route:

- **Character** — *atomic* (single-step work, drained to execution) or *multi-step* (design-bearing or
  trackable work, which belongs in a stub).
- **Home** — the authoritative destination: an **existing** stub, a **new** stub identifiable now, or
  **none** (homeless).

Character and home together select one of the four routes below.

### 3. Route in one batched pass

Each entry takes exactly one route:

1. **Existing-stub home** — a multi-step entry whose home is a live `active/` or `backlog/` stub. Write the
   note **straight into** that stub's `draft-*` / `notes-*`. This is routing, not execution: the content
   moves inbox → stub in a single write.
2. **New stub** — a multi-step entry with no existing home. Scaffold a `provisional/` stub (`meta-*`, plus
   `draft-*` when scope warrants) and write the note in. A provisional stub carries no design authority.
3. **Atomic errand** — an atomic entry that is a committed standalone execution. Dispatch it to
   `run-errand`; the drain **never executes atomic work itself**, it hands the item off as its own errand.
4. **Homeless** — no determinable home. A homeless **atomic** flushes to the shared `ATOMIC-INBOX`; a
   homeless **multi-step** graduates to a `provisional/` stub (route 2). The shared inbox is atomic-only,
   so multi-step never lands there.

**PR packaging.** Lane assignment follows [strategy-work-organization § Auto-Merge Lane][work-org] and
applies under full protection only — under partial protection every route is a direct base-branch commit
with no merge-wait ([§ Branch Protection Modes][work-org]). Under full protection:

- The planning-routing writes — routes 1, 2, and the homeless-atomic flush — are **one coherent concern**
  ("route these captures to their homes") and batch into a **single auto-merge PR** off a short-lived
  grooming branch: one PR per lane, bounded by concern-coherence, not destination count. A write that
  touches a **foreign owner's** artifact is reviewed-lane per the threshold and ships on its own, outside
  the batch.
- Each code errand (route 3) is its **own concern → its own PR (1:1)**, carried by `run-errand`. Code is
  never auto-batched, and the two lanes **never mix** in one PR.

**Move, not copy.** Routing **removes the source line from `USER-INBOX`**, never duplicates it. For routes
1, 2, and the homeless flush the removal rides the same write. A route-3 errand is the one deferral: it
removes its slug-matched line at errand **completion**, not at dispatch — so the line doubles as the
in-flight record and an abandoned errand never orphans the capture. Once the batch lands and its errands
merge, `USER-INBOX` is empty.

### 4. Note shared-inbox aging

While draining, surface shared-inbox (`ATOMIC-INBOX`) aging — items long-resident there — as an advisory
observation. Reminder nudges for personal captures and staleness of in-flight errands belong to
session-init orientation, not the drain.

### 5. Confirm the drain is complete

Verify `USER-INBOX` holds no entry still awaiting routing — every capture has been written to a stub,
flushed to the shared inbox, or dispatched as an errand — and report what routed where.

---

[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
