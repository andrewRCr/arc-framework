---
purpose: Drain the personal capture inbox to authoritative homes via a gated pass that confirms routes before writing and hands committed atomic execution to run-errand.
audience: agent
---

# Workflow: Drain Inbox

Routing body for the `arc-housekeep` skill, and the shared logic the `session-handoff` between-WUs path
dispatches — one workflow, two doors. It reads the personal capture inbox (`USER-INBOX`) and, in a **gated,
phased** pass, classifies each entry, **confirms the routing proposal before any write**, routes every entry to its
authoritative home, and hands any committed atomic execution to `run-errand` — leaving `USER-INBOX` with **no
un-triaged entries**.

The drain **routes**; routing is not execution. Writing a multi-step note into its stub _is_ routing — the
content moves inbox → stub in a single write. Atomic _execution_ is never run inside the drain: a committed
atomic is handed to the [`run-errand`][run-errand] lifecycle as an explicit, opt-in transition _after_ routing
(`arc-session` is the sole top-level execution entrypoint). See
[DEV-RULES.ARC § Discovered Work Routing][dev-rules-arc] for the capture-vs-execution boundary this mechanism
enforces.

**Mode/tier-agnostic spine.** The routing judgment does not vary by protection mode or tier. The open/close
verbs own mode-specific allocation and settlement; the workflow consumes their typed paths and results.

## When This Workflow Applies

- **Between work units** (the primary sweep) — the lowest-isolation-cost moment, when the base branch makes
  shared-planning writes native.
- **Mid-WU on demand** — invoked deliberately to clear accumulated captures without waiting for the next
  between-WUs boundary. The precondition below governs _where_ the drain may write, not _when_ it runs.

## Entry

Housekeeping may enter between WUs or warm from a WU. Do not relocate or select a write branch before the routing
proposal is confirmed: `arc housekeep open` owns protection-aware allocation and preserves the optional WU parent.
Read-only classification and overlap checks may run from the current frame. Let captures accumulate before a
mid-WU sweep rather than thrashing the drain per item.

## Drain steps

The drain is **gated and phased**: classify with no writes, **stop at the confirmation interlock**, then route,
then optionally transition to execution. The interlock is unconditional — the drain never routes straight from
classification.

### 1. Read the inbox

Read `USER-INBOX` in full — both `§ Errand` (errand-class captures) and `§ Work Unit` (spec-worthy captures).
These are the entries to route; the shared inbox (`ATOMIC-INBOX`) is a _destination_, not a source.

### 2. First-pass classification — no writes

Classify every entry against the **logical model** — _entry · character · home_ — not its markdown shape, so a
later structured-record swap leaves the routing intact. This pass **makes no writes**; it produces the routing
proposal the interlock (§ 3) confirms. Resolve, per entry:

- **Verify before routing.** A capture may already be **done or obsolete** — resolved inline by a later commit,
  or by the host WU itself. Confirm against the current tree before proposing a route; a resolved capture is
  _dismissed_ (removed at routing), not routed.
- **Character** — _atomic_ (one indivisible concern, single session — possibly an extended errand) or
  _multi-step_ (needs durable cross-session decomposition; belongs in a stub).
- **Scope re-triage.** Capture-time character is intentionally coarse. A `§ Errand` capture whose real scope
  crosses a wrapper floor — load-bearing infra or a large/intricate surface (scale), or a design worth
  recording (derivation) — **reclassifies to a stub** here (existing or new), not to standalone execution; a
  determinate sweep crossing neither floor stays errand-class (atomic, possibly extended), however many
  passes. This is the at-drain reclassification [DEV-RULES.ARC § Task Execution][dev-rules-arc] promises.
- **Home** — an **existing** stub (`active/` or `backlog/`), a **new** stub identifiable now, or **none**
  (homeless).
- **In-flight target adoption.** When an entry carries `WU_Target`, resolve the slug with
  `arc status <slug> --json` before proposing a home. An in-flight target defaults to **owner adoption**: leave
  the capture in `USER-INBOX`, mark it `_Hold: true` with `_Created:` re-stamped to the adoption date, surface the
  handoff at the confirmation interlock, and let the target's owning session absorb it. The managed hold keeps the
  triaged entry out of repeated `housekeepNeeded` offers while retaining the normal delayed reminder. The user may
  explicitly override the default, but the drain never writes to a graduated stub's main-side ghost. A failed or
  ambiguous status lookup is a stop-and-surface diagnostic, not permission to fall back to checkout-local path
  inference.
- **Group by concern.** Multiple homeless multi-step captures that share **one logical concern** consolidate
  into a **single** stub, not one-per-entry — concern-identity, not entry count (the anti-rider test applied to
  stub creation). Propose the grouping with rationale.
- **Commitment (new stubs).** Propose `planned` or `provisional` — the axis is _commitment_ (has a maintainer
  committed to sequencing the WU?), not maturity. A drain is a mechanical routing, not the maintainer-commitment
  moment, so an un-vetted capture defaults to `provisional`; a capture the maintainer commits to at the interlock
  warrants `planned`. The user decides; never hard-default silently.
- **Execute-now bias.** When an atomic is a genuine quick win and executing it now is cheaper than routing plus a
  later session, prefer **execute-now** over defer. Keep the bias bounded by errand character: if it crosses a
  wrapper floor, reclassify to a stub; if context budget cannot carry it now, choose defer or fresh-session
  execute-bound per § 7.
- **Atomic disposition.** For each atomic, propose **execute-now**, **defer**, or **retain** (the escape-hatch) —
  acted on in § 5 / § 7.
- **Destination-path overlap (advisory).** After destinations resolve and **before** the § 3 confirmation
  interlock, collect the write paths the proposal will touch (stub drafts / notes, shared inbox, errand targets when
  execute-now). Run the existing overlap read over those paths:

  ```bash
  arc errand check --target <path>... --json
  ```

  Apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only — no design-load). Include any shared-
  surface advisory in the routing proposal presented at § 3 so sequencing and coordination are visible **before**
  edits land. **Non-gating:** never block the drain on overlap; surface and let the operator reorder, retain, or
  proceed. Do not build a second overlap oracle.

### 3. Confirmation interlock

> [!IMPORTANT]
> Stop. Present the **full routing proposal** — every entry's proposed route, the groupings, new-stub commitment
> levels,
> in-flight owner-adoption handoffs, atomic dispositions, any destination-path overlap advisories from § 2, and
> the batch shape (§ 4) if the sweep is large — and await explicit confirmation. **The drain makes no write before
> this gate.**

The user may adjust any proposal: regroup, change a commitment level, flip an atomic between execute-now / defer /
retain, or **retain** an entry that would otherwise route. Routing (§ 5) proceeds only on the confirmed proposal.

After confirmation, establish the one routing occupancy before any routing write or visible execute marking:

```bash
arc housekeep open <sweep-slug> --json
```

On `applied` / `idempotent`, render `recommendedPromptText`, route only from `activeLocusPath`, and retain
`sessionHomePath` plus exact IDs. A retry opens the same slug and re-confirms the remaining live inbox entries
before further writes. When the rendered text asks for directed-command confirmation, confirm the current session
can run there; otherwise recommend a cold session at that checkout and stop before routing. On `refused` / `error`,
render the supplied text and stop.

When the confirmed proposal contains execute-now entries, mark the complete selected title set in one operation:

```bash
arc housekeep mark-execute "<title>"... --json
```

The verb revalidates every title under one notes lock and writes all markings through one atomic replacement. A
failure leaves the occupancy and inbox evidence visible for explicit retry or abandonment; never mark entries one
at a time.

### 4. Split if the sweep is large

Default a single routing increment. When the confirmed proposal exceeds **one reviewable increment**, split by
**concern-coherence + review-reachability** — split only when one unit would exceed a reviewer's reach. Under full
protection, ordered commits and review passes stay inside the sweep's one branch and PR; under partial protection,
use coherent commit boundaries. Surface the batch shape at the interlock; never silently truncate.

### 5. Route — write to homes

Each entry takes exactly one route. Routing **moves** the source line out of `USER-INBOX` (never copies):
`arc user inbox-remove <entry-title>` drops it (matched on the title in v1; idempotent); use
`--inbox-entry-file <path>` (`-` reads stdin) for Markdown- or shell-active titles. Pair the removal with each
routing write.

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
- **In-flight owner adoption** — the default for an entry whose resolved `WU_Target` is in flight. Make no routing
  write; set `_Hold: true`, re-stamp `_Created:` to the adoption date, and leave the entry in `USER-INBOX` for the
  owning session to adopt. This reuses the retain route's managed-field grammar without reclassifying the Work Unit
  entry as atomic. In particular, never append to the stale backlog copy left on the base branch after
  `backlog/ → active/` graduation. An explicit override may route the entry only through the live target resolved
  by `arc status`, with owner coordination; it never licenses a write to the main-side ghost.
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
- **Execute-now atomic** — held aside here; executed in § 7, not written by the drain.

Perform every routing write from the returned active checkout. The confirmed sweep is one routing generation;
splitting changes only commit/review increments. Full mode ships the pure-routing diff in one PR. At close, classify
its lane from the routes actually landed (`reviewed` if any write needs owner review, otherwise `auto`). Partial mode
pushes the direct-base commits. Never open an Errand branch for routing or split foreign-owner writes into a second
sweep generation.

> [!IMPORTANT]
> `integration-interlock`: Under full protection, stop before arming auto-merge or merging the routing PR. Surface
> checks and the close-derived lane; await explicit integration approval. Routing confirmation did not approve merge.

After approval, re-read the PR's exact base and head SHAs and run
`arc review planning-lane <base-sha> <head-sha>`. Only literal `planning` permits arming auto-merge; `reviewed`
follows the reviewed-lane settlement in [`run-errand`][run-errand], while command failure or malformed output
stops. Foreign ownership or another confidently recognized review condition may still move a planning result to
reviewed without another permission stop, but never the reverse.

### 6. Close routing occupancy

After the routing commits are pushed and any full-mode PR is open, invoke
`arc housekeep close <sweep-slug> --json`. The verb validates the pure-routing write set and the pushed partial base
or full review tail, then closes only this routing occupancy. Render its text and consume
`restoredParent`, `sessionHomePath`, and `nextOffer`. A full awaiting-merge identity may be finalized later by
replaying the same close after merge; sibling execution does not wait for that tail. On explicit abandonment, use
`arc housekeep abandon <sweep-slug> --json`. Abandonment preserves execute-bound markings as the next session's
recovery trail; never clear markings or session locus records by hand.

### 7. Execution transition — exact next-offers → `run-errand`

Only after housekeeping occupancy closes, offer the returned `nextOffer`. On acceptance, open that exact sibling
through [`run-errand`][run-errand] using its `key` and `parentCheckoutPath`; do not invent another sibling. Each
completed Errand returns the next well-formed execute-bound entry in file order, producing a sequential chain. On
decline or insufficient context budget, leave the remaining execute-bound entries in place for a fresh session;
their visible markings plus the inbox-state projection own continuation.

Each execute-bound capture remains the Errand's originating entry until that Errand completes. Full-mode async
review tails and unattended merges therefore leave the line legitimately present; exact close/finalize replay is
the idempotent removal backstop. Errand abandonment retains the capture and clears only that entry's marking.

### 8. Confirm the drain is complete

The drain **closes on dispositions, not on a physically empty file.** Verify every entry has a terminal
disposition — **routed** / **dismissed** / **flushed** (line removed with the write), **retained** (`_Hold:_`,
line stays), **owner-adoption** (live target; line stays for its owning session), or **execute-bound** (dispatched
in-flight, or pending a fresh `--errand` — line stays until the errand completes). No entry is left
**un-triaged**. The lines that remain are only the retained, owner-adoption, and execute-bound entries; their async
tail is owned by the target's session or by `run-errand` plus session-init's in-flight sweep, not the drain. Report
what routed where, which entries were retained or handed to live owners, and which errands are in flight. Surface
shared-inbox (`ATOMIC-INBOX`) aging as an advisory while there — reminder nudges for personal captures and
in-flight-errand staleness belong to session-init orientation, not the drain.

---

[run-errand]: run-errand.md
[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
