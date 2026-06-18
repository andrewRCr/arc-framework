---
purpose: Drain the personal capture inbox to authoritative homes via a gated, phased pass — classify with no writes, confirm the routing plan, route to homes, and hand committed atomic execution to run-errand, leaving no un-triaged entries.
audience: agent
---

# Workflow: Drain Inbox

Routing body for the `arc-housekeep` skill, and the shared logic the `session-handoff` between-WUs path
dispatches — one workflow, two doors. It reads the personal capture inbox (`USER-INBOX`) and, in a **gated,
phased** pass, classifies each entry, **confirms the routing plan before any write**, routes every entry to its
authoritative home, and hands any committed atomic execution to `run-errand` — leaving `USER-INBOX` with **no
un-triaged entries**.

The drain **routes**; routing is not execution. Writing a multi-step note into its stub _is_ routing — the
content moves inbox → stub in a single write. Atomic _execution_ is never run inside the drain: a committed
atomic is handed to the [`run-errand`][run-errand] lifecycle as an explicit, opt-in transition _after_ routing
(`arc-session` is the sole top-level execution entrypoint). See
[DEV-RULES.ARC § Discovered Work Routing][dev-rules-arc] for the capture-vs-execution boundary this mechanism
enforces.

**Mode/tier-agnostic spine.** The phases below are the routing spine; they do not vary by protection mode or
tier. Only the **write mechanics** differ by protection mode, and they are isolated to one block (§ 5) that
defers to [strategy-work-organization § Cheap-branch path][cheap-branch] / [§ Auto-Merge Lane][auto-lane] —
never scattered through the spine.

## When This Workflow Applies

- **Between work units** (the primary sweep) — the lowest-isolation-cost moment, when the base branch makes
  shared-planning writes native.
- **Mid-WU on demand** — invoked deliberately to clear accumulated captures without waiting for the next
  between-WUs boundary. The precondition below governs _where_ the drain may write, not _when_ it runs.

## Precondition: base-branch write context

The drain writes shared base-branch paths — stub edits, freshly scaffolded `provisional/` stubs, and homeless
flushes to the shared inbox. Those writes must originate from a **base-branch write context**, never a work-unit
worktree's branch, or they land on the wrong branch and tangle an unrelated WU's PR with grooming.

This is a **machine-checked guard, not prose discipline**. Resolve the write context first:

```bash
arc housekeep check --json
```

The check resolves the current worktree path, the current branch, and the configured base branch
(`branch.base`) — the same context `arc errand check` resolves — and classifies the invocation:

- **Base-branch write context** → proceed to the drain steps. Under full protection, § 5 relocates onto a
  short-lived grooming branch cut from here before any shared-path write — the base context is the fork
  point, not the write target.
- **Work-unit branch** → **refuse and offer to relocate**: hop to a base-branch write context, run the sweep
  there, and return. The relocation mechanics follow protection mode — see
  [strategy-work-organization § Cheap-branch path][cheap-branch] and [§ Branch Protection Modes][branch-modes].
  Launching from any worktree is not a blocker; only _writing_ shared paths from a WU branch is.
- **Degenerate context** (detached HEAD, or no resolvable base) → **safe refusal**, never a silent write.

The guard is **guidance keyed on write context, not a gate on having an active WU**: the precondition is a
base-branch write context, _not_ "no active work unit." Housekeep is therefore invokable mid-WU — hop to the
primary worktree, sweep as a batched errand, and return. Let captures stack before a mid-WU sweep rather than
thrashing the drain per item.

## Drain steps

The drain is **gated and phased**: classify with no writes, **stop at the confirmation interlock**, then route,
then optionally transition to execution. The interlock is unconditional — the drain never routes straight from
classification.

### 1. Read the inbox

Read `USER-INBOX` in full — both `§ Atomic` (single-step captures) and `§ Backlog` (multi-step captures). These
are the entries to route; the shared inbox (`ATOMIC-INBOX`) is a _destination_, not a source.

### 2. First-pass classification — no writes

Classify every entry against the **logical model** — _entry · character · home_ — not its markdown shape, so a
later structured-record swap leaves the routing intact. This pass **makes no writes**; it produces the routing
plan the interlock (§ 3) confirms. Resolve, per entry:

- **Verify before routing.** A capture may already be **done or obsolete** — resolved inline by a later commit,
  or by the host WU itself. Confirm against the current tree before proposing a route; a resolved capture is
  _dismissed_ (removed at routing), not routed.
- **Character** — _atomic_ (single-step) or _multi-step_ (design-bearing or trackable; belongs in a stub).
- **Scope re-triage.** Capture-time character is intentionally coarse. A `§ Atomic` capture whose real scope is
  **larger than atomic** — load-bearing infra, multi-file, multi-commit, or carrying a design fork —
  **reclassifies to a stub** here (existing or new), not to standalone execution. This is the at-drain
  reclassification [DEV-RULES.ARC § Task Execution][dev-rules-arc] promises.
- **Home** — an **existing** stub (`active/` or `backlog/`), a **new** stub identifiable now, or **none**
  (homeless).
- **Group by concern.** Multiple homeless multi-step captures that share **one logical concern** consolidate
  into a **single** stub, not one-per-entry — concern-identity, not entry count (the anti-rider test applied to
  stub creation). Propose the grouping with rationale.
- **Commitment (new stubs).** Propose `planned` or `provisional` — the axis is _commitment_ (has a maintainer
  committed to sequencing the WU?), not maturity. A drain is a mechanical routing, not the maintainer-commitment
  moment, so an un-vetted capture defaults to `provisional`; a capture the maintainer commits to at the interlock
  warrants `planned`. The user decides; never hard-default silently.
- **Atomic disposition.** For each atomic, propose **execute-now**, **defer**, or **retain** (the escape-hatch) —
  acted on in § 5 / § 6.

### 3. Confirmation interlock

> [!IMPORTANT]
> Stop. Present the **full routing plan** — every entry's proposed route, the groupings, new-stub commitment levels,
> atomic dispositions, and the chunk plan (§ 4) if the sweep is large — and await explicit confirmation. **The
> drain makes no write before this gate.**

The user may adjust any proposal: regroup, change a commitment level, flip an atomic between execute-now / defer /
retain, or **retain** an entry that would otherwise route. Routing (§ 5) proceeds only on the confirmed plan.

### 4. Chunk if the sweep is large

Default a single routing batch. When the confirmed plan exceeds **one reviewable batch**, chunk by
**concern-coherence + review-reachability** — split only when one unit would exceed a reviewer's reach. The chunk
shape follows protection mode (§ 5): under full, one auto-merge PR per lane; under partial, coherent commit
boundaries (there are no routing PRs to chunk). Surface the chunk plan at the interlock; never silently truncate.

### 5. Route — write to homes

Each entry takes exactly one route. Routing **moves** the source line out of `USER-INBOX` (never copies); the
removal rides the same write.

- **Existing-stub home** — a multi-step entry whose home is a live `active/` or `backlog/` stub. Write the note
  into that stub's `draft-*` / `notes-*` in one of **two integration modes**:
    - **Holistic** — weave it into the draft body. Only when the fit is cheap, clear, and within your design
      authority (you own the WU, or it is a trivially-additive, on-topic addendum).
    - **Inbound-buffer note (the default)** — append it, with a `routed from <origin>, <date>` provenance line,
      to the stub's `## Inbound Buffer — Pending Integration` section (an interstitial right after the draft's
      Origin/Purpose block, set off by `---`; create it on demand). Use whenever integration is costly,
      design-bearing, or the draft is **foreign-owned** — _how a note fits the scope is the owning WU's design
      call at its next iteration, not yours mid-drain._ The buffer holds only items already routed to this WU as
      home, in transit (never at rest) — distinct from the WU's own `Open Questions`; it stays
      invariant-compliant because the obligation below drains it. An `## Inbound Buffer — Pending Integration`
      section is **mandatorily** integrated into the body at the WU's next planning iteration (minimal hook:
      `create-spec.md` § Resolve depth & Class); the richer iteration-time ceremony is `arc-plan-conductor`'s.
- **New stub** — a multi-step entry (or a grouped set) with no existing home, or a tier-reclassified atomic.
  Scaffold the stub at the confirmed commitment level (`meta-*`, plus `draft-*` when scope warrants) and write the note
  in. A `provisional` stub carries no design authority.
- **Homeless atomic — defer** — an atomic with no determinable home that is **not** being executed now. Flush it
  to the shared inbox (`ATOMIC-INBOX` under `pm.mode: arc-in-git`; the project's convention otherwise). The
  shared inbox is atomic-only.
- **Retain (escape-hatch)** — an atomic the user explicitly keeps in `USER-INBOX` (private-until-vetted, or
  imminent self-execution). **Never the default, never agent-suggested.** Set the managed field _Hold:_ to
  `true` and **re-stamp** _Created:_ to the retain date (both values backtick-delimited per the managed-field
  grammar), so the reminder floor (never same-day) applies from now. A retained entry is _triaged_ — it does not
  count toward `inboxState.housekeepNeeded`, and the reminder sweep keeps it from rotting.
- **Execute-now atomic** — held aside here; executed in § 6, not written by the drain.

**Write mechanics (protection-mode block).** This is the only mode-dependent step; it defers to
[§ Cheap-branch path][cheap-branch] / [§ Auto-Merge Lane][auto-lane]:

- **Fully protected** — **relocate first, then write.** Before any routing write, cut the short-lived
  grooming branch `chore/<slug>` off the configured base branch, using the same write-context primitive
  run-errand's Launch relocation uses — `arc housekeep check --json` resolves `baseBranch` +
  `primaryWorktreePath` (see [run-errand][run-errand] § Launch step 3). The base context the precondition
  established is the fork point, not the write target: full protection forbids committing the shared paths to
  the base branch itself. The planning-routing writes (existing-stub edits, new provisional stubs, the
  homeless-atomic flush) are then **one coherent concern** and batch into a **single auto-merge PR** per lane
  off that branch (chunked per § 4 if large). Open it with a **lean grooming-PR body** — a one-line Summary
  plus the § 3 routing plan (what routed where); no Spec / Out-of-Scope / Follow-Up sections, mirroring
  [run-errand][run-errand] § Ship step 3. A write touching a **foreign owner's** artifact is reviewed-lane
  and ships on its own.

  > [!IMPORTANT]
  > `integration-interlock`: Stop before arming auto-merge or merging the grooming PR. Surface PR status
  > (checks, resolved lane) and await explicit integration approval — never infer it from the § 3 routing
  > confirmation, which approved the _routing_, not the merge.
- **Partially protected** — every routing write is a **direct base-branch commit** with no PR or merge-wait;
  keep coherent commit boundaries (the § 4 chunk shape). No lanes, no review-chunking.

### 6. Execution transition — committed atomics → `run-errand`

For each **execute-now** atomic, hand off to the [`run-errand`][run-errand] lifecycle — the drain never executes
atomic work itself. Two explicit paths, the user's choice by context budget (never a structural gate):

- **Same session** — transition into `run-errand`, then **return here for the next**. Run the committed atomics
  **one at a time, sequentially** (batch only when they are genuinely one concern). `run-errand`'s Launch
  resolves and relocates its own execution locus off the base via the shared write-context primitive (the same
  `arc housekeep check` resolution this drain used); the isolation shape — a separate worktree where spawning is
  available, otherwise an in-place `chore/<slug>` branch in the primary base checkout — follows protection mode
  and worktree availability (see `run-errand`). Either way the errand never executes on the drain's launching
  branch, and control returns to the base context after each. No dependency on having entered through
  session-init's errand arm.
- **Fresh session** — leave the execute-now atomics in place and resume each via `arc-session --errand` later;
  the drain still closes (§ 7) with those entries triaged-but-pending.

**The drain does not block on merges.** `run-errand` commits and opens/arms the PR, but the slug-matched
`USER-INBOX` line is removed at the errand's **completion** (merge) — asynchronous on the auto-merge lane,
review-gated on the reviewed lane. So a dispatched atomic's line legitimately lingers; session-init's
in-flight-errand sweep is the backstop against orphaning (an abandoned errand keeps both its line and its pushed
branch — both swept). On an _unattended_ merge (auto-merge lane), `run-errand`'s completion does not fire
in-session; teardown and line-removal are replayed from base context by the same-session finalize pass or, next
session, by this sweep — idempotent backstops to the authoritative removal in [`run-errand`][run-errand]
§ Complete.

### 7. Confirm the drain is complete

The drain **closes on dispositions, not on a physically empty file.** Verify every entry has a terminal
disposition — **routed** / **dismissed** / **flushed** (line removed with the write), **retained** (`_Hold:_`,
line stays), or **execute-bound** (dispatched in-flight, or pending a fresh `--errand` — line stays until the
errand completes). No entry is left **un-triaged**. The lines that remain are only the retained and
execute-bound ones; their async tail is owned by `run-errand` plus session-init's in-flight sweep, not the
drain. Report what routed where, which entries were retained, and which errands are in flight. Surface
shared-inbox (`ATOMIC-INBOX`) aging as an advisory while there — reminder nudges for personal captures and
in-flight-errand staleness belong to session-init orientation, not the drain.

---

[run-errand]: run-errand.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[cheap-branch]: ../../../../reference/strategies/arc/strategy-work-organization.md#cheap-branch-path
[branch-modes]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
