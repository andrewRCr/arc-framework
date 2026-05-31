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

Classify against the **logical model** — *entry · character · home* — not the entry's markdown shape, so
a later structured-record swap leaves the routing intact. Each entry resolves to a route from its
**character** (atomic single-step vs. multi-step work) and whether its **authoritative home** is writable
from here.

### 3. Route in one batched pass

Route every classified entry to its home in one pass, packaged per
[strategy-work-organization § Auto-Merge Lane][work-org]. Promotion **moves** the source entry rather than
copying it, so `USER-INBOX` ends empty.

### 4. Note shared-inbox aging

While draining, surface shared-inbox (`ATOMIC-INBOX`) aging as an advisory observation.

### 5. Confirm the drain is complete

Verify `USER-INBOX` holds no routable entries — every capture has moved to its home or flushed to the
shared inbox — and report what routed where.

---

[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
