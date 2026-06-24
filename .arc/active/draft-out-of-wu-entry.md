# Draft: Out-of-WU Session Entry

**Purpose:** Realign `session-init`'s entry dispatch so **explicit out-of-WU (and cross-WU) intent routes
regardless of active-WU state** — generalizing the discarded-`--errand`-on-Resume bug into a single
**explicit-intent override**: a signal that outranks the implicit resume/orient dispatch, *preserves the active
checkout*, and routes to the chosen locus. The slot is populated by `--errand`, `--housekeep`, and
`--plan <stub>`, and left **slot-ready** for future signals (see § Deferred signals). The execution and locus
layers already work or need only thin changes — `run-errand` / the `arc-errand` warm skill / `drain-inbox` for
errand and housekeep, and (for `--plan`) in-place planning against a backlog-located draft. The gap is the cold
door through `arc-session` under-honoring explicit intent.

- **State:** Draft (pre-spec). Captured 2026-06-05 from a live investigation triggered by `arc-session --errand`
  failing to route while a planning WU was active. **Iterated 2026-06-24** — drift-audited against current source,
  scope consolidated, signal family settled. Spec-readiness is the next session's call, not asserted here.

- **Created:** 2026-06-05.

- **Origin:** [internal] — surfaced during `class-model-foundation` planning. The developer invoked
  `arc-session --errand` from the primary worktree (active planning WU checked out, clean tree); the
  session resolved to the **Resume** arm and discarded the `--errand` signal per
  `session-init.md` "Errand signal not consumed (non-Orient arms)". The warm `arc-errand` skill was then
  used to run *this* capture as an errand — itself confirming the gap is localized to the cold door.

- **Cohort:** agile-parallelism — a gap-correction descending from the **Errand Enablement →
  work-routing-discipline** lineage (the cold-errand-entry known gap was recorded in
  `cohort-agile-parallelism.md` but under-scoped; see § Root cause). Adjacent to Concurrent Work
  Conventions; **independently shippable, not gated on CWC/AWL** (see § Relationship to CWC and the cohort).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

*None pending.* (The three carried concerns were integrated at the 2026-06-24 iteration: in-place planning
iteration → the `--plan` pillar in § Scope; the `--new` / `--discover` sibling → § Deferred signals;
record-owned errand identity → the constraint in § Scope item 1 and § Dependencies.)

---

## Problem / Motivation

A developer should be able to be mid-work-unit — potentially with multiple WUs in flight — realize they
need to do an **errand** (an atomic out-of-WU fix) or a **housekeep** drain, and reach it through the
universal door (`arc-session --errand`, or cold `arc-session` then route) without first having to wind
down or abandon their active work. The framework should switch to the primary worktree, cut a
`chore/<slug>` branch off the base, run the increment, and let them return. That is the *stated* doctrine.
It is not what the entry plumbing does. The same shape generalizes: an explicit intent to **groom a backlog
stub** (`--plan`) — or, deferred, to **start new work** (`--new`) — is equally out-of-WU and equally discarded
on the Resume arm today.

### What the doctrine says (mid-WU out-of-WU entry is the normal case)

- `strategy-work-organization.md` § Entry path: an Errand "launches from **any worktree**: the workflow's
  Launch phase resolves the base branch and relocates the execution locus itself … so the caller need not
  pre-switch worktrees."
- `DEV-RULES.ARC.md` § Discovered Work Routing: *Out-of-WU, urgent → "Errand now — own session
  (`arc-session --errand`)."* That **is** the mid-WU path, stated as the primary route.
- `strategy-work-organization.md` § Main-on-Main: the primary worktree is "the launchpad for … Errand
  launches."
- `work-routing-discipline` (spec): housekeep's precondition is "a *base-branch write context*,
  **not** 'no active WU' — so housekeep is invokable mid-WU on demand (hop to primary, sweep as a batched
  errand, return)."
- `run-errand.md` Launch: launching from any worktree (a work unit's included) is fine; only *executing*
  there would tangle that branch — then it relocates per protection mode (`arc errand open <slug>` →
  ephemeral worktree off base under full protection; a direct base checkout under partial).
- The `arc-errand` skill (the **warm** door) already runs an errand from an active session correctly.

### What the plumbing does (honors it only with no active WU)

- `session-init.md` entry dispatch gates the `--errand` signal to the **Orient** arm
  (`active.resolution === "none"`, primary worktree). On the **Resume** arm (any active WU), the
  "Errand signal not consumed (non-Orient arms)" rule discards `--errand` and tells the user to "run it
  as its own errand **from the primary worktree** via a fresh `arc-session --errand`." That advice is
  **circular**: if you are already in the primary worktree on a WU branch (the common case), re-invoking
  `arc-session --errand` lands on the same Resume arm and is discarded again. (This is exactly the
  self-demonstrating failure that triggered this capture.)
- There is **no `--housekeep` priming door** at all. Housekeep surfaces only as a soft-offer on the
  Orient arm (`inboxState.housekeepNeeded`, primary worktree, no active WU); on a Resume arm it is
  suppressed entirely.
- There is **no `--plan` door** at all. Iterating a backlog stub's draft today forces graduation
  (`arc start` → `active/`, a `plan/` branch) then park-back, recording a **false** `parked` state for what
  is grooming-lane work — see the `--plan` pillar in § Scope.
- Net effect: you can only *cold-enter* explicit out-of-WU intent when you have **nothing in flight** —
  atypical — even though the execution machinery is ready and the doctrine blesses the mid-WU case.

### Why it's exposed now

Per-WU worktree-by-default is not yet in practice (it awaits the broader concurrent-work rollout). So
**every mid-WU session today is "Resume arm, primary worktree, on a WU branch"** — precisely the shape
the entry dispatch refuses to route. The gap is maximally exposed by the current pre-parallelism state.

---

## Root cause

`cohort-agile-parallelism.md` § "Known gap — cold errand entry (no originating session)" recorded the
cold-errand-entry problem, but **scoped it to the no-originating-session case only** — "an Errand that
arises with **no originating session to fork from** — you boot up wanting to do one." Its provisional
resolution grew the universal `arc-session` door a **no-WU / orient-and-await leaf** (the orphan path,
made Errand-aware), disambiguated by an explicit signal. That leaf was built faithfully — but it lives on
the **Orient (no-active-WU) arm**, so it structurally cannot serve the **dual** case the same doctrine
endorses: an explicit out-of-WU intent raised *while a WU is active*.

So the chain is: the **design record under-scoped** the problem → the **implementation matched the
record** → the **doctrine (which is broader) and the execution layer (which is ready) were left
contradicted** by the entry dispatch. This is not a `run-errand` bug and not a CLI bug; it is a
`session-init` orchestration gap inherited from an under-specified cohort known-gap entry.

It is **not** Concurrent Work Conventions' responsibility: CWC is parked for *delivery* reasons (the AWL
small-WU-pipeline prerequisite), explicitly **not runtime** — the runtime mechanism (errands, worktrees,
in-flight awareness) "is already in place." Mid-WU errand entry is supposed to work *today*.

---

## Signal family & the dispatch slot

The core design move is **one generic mechanism, not a pile of flags.** An explicit-intent signal expresses
out-of-WU (or cross-WU) intent that:

1. **outranks** the implicit resume/orient dispatch (the signal wins over "what the arm would otherwise do"),
2. **preserves** the active WU's checkout (relocate to a fresh locus; never clobber the resumed branch), and
3. **routes** to the signal's locus (errand → `run-errand`; housekeep → `drain-inbox`; plan → in-place
   planning on the backlog stub).

Building the slot + precedence rule once — and *populating* it with the signals that carry real correctness or
locus value — is what makes any future signal a one-line addition rather than a re-architecture. That is the
discipline that lets us populate conservatively now and defer the marginal signals (§ Deferred signals) without
fear of regret.

**Populated this WU:** `--errand`, `--housekeep` (design-bearing), `--plan <stub>`.
**Slot-ready, deferred:** `--new` / `--discover`, and others as demand surfaces.

A shared dispatch leaf is the likely shape: all three populated signals end in "establish the right scoped
context → relocate/locate → run the locus workflow." The spec should DRY the no-WU Orient leaf and the new
Resume route behind one signal-dispatch path reached from either arm (see § Open Questions).

---

## Scope

### In scope

1. **(Core) `session-init` entry dispatch honors explicit out-of-WU intent regardless of active-WU state.**
   On a **Resume** arm, an explicit `--errand` / `--housekeep` / `--plan` signal must route through the
   override (§ Signal family) rather than being discarded. The relocation/locus work is already owned
   downstream (`run-errand` for errands; `drain-inbox` for housekeep) — `session-init` only needs to *reach*
   it instead of resuming the WU and dropping the signal. Concretely:
    - Retire the "Errand signal not consumed (non-Orient arms)" rule (`session-init.md`). Replace the circular
      advice with an actual Resume-arm route per the override.
    - Define **precedence**: an explicit signal outranks the implicit resume but **preserves** the active WU's
      checkout (relocate via a fresh locus; never clobber the resumed branch's working state).
    - Reconcile the **linked-worktree** case: `--errand` from a linked WU worktree currently "falls through to
      discovery" (`session-init.md`). It should relocate to the primary's base and run the errand (which
      `run-errand` already supports).
    - **Constraint (errand identity is record-owned):** errand-lattice retired `errandSlugOf` and the
      `chore/`-prefix parse — the `chore/` prefix no longer signals errand-ness. Any errand identity this route
      needs must come from the record via `readErrandSlugByBranch` (`lib/errand/record.ts`), never a branch
      parse. (Confirmed in code at the 2026-06-24 audit; the planning-entry gate needs no errand identity at all.)

2. **Bare `--errand` validity + short-circuit semantics.** A bare `--errand` (no slug/description) is *intended*
   to be valid: it primes errand cold-entry, which loads **universal context only** and **skips** SESSION-NOTES,
   the active task list, and `process-task-loop`. Today the dispatch condition is written `--errand <blurb|slug>`
   *present* (`session-init.md`), implying an argument is required, while cold-entry's "seed … when present"
   anticipates its absence — an internal inconsistency (the `arc-session` skill already brackets the arg optional,
   compounding it). Fix the wording in the `arc-session` skill and `session-init` so absent-seed is explicitly
   supported (→ elicit the concern interactively, or adopt a flagged `USER-INBOX § Errand` capture).

3. **(New) `--plan <stub>` — in-place planning iteration on a backlog stub.** Add `--plan <stub>` as the third
   populated signal: enter a planning session against a `backlog/planned/` stub's draft **in place** — no
   graduation, the stub stays `planned`, no false `parked`. The 2026-06-24 probe confirmed both halves are thin:
    - **State-stays-put is free.** Editing a `planned` stub's draft is a *content mutation, not a lifecycle
      transition* — the state resolver reads (directory location + meta `State`), neither of which changes; the
      stub stays `planned` by construction. And `planned` is already excluded from the capacity-occupancy set
      (`OCCUPYING = [planning, active, integrating]`), so in-place grooming keeps it out of parallel-capacity math
      for free — the exact benefit the false-`parked` round-trip destroys. No state-machine change.
    - **Run-and-stop is a small CLI change.** `resolveDraftPresent()` (`handlers/plan.ts`) hardcodes
      `.arc/active/draft-{slug}.md`; path-parameterize it to also search `backlog/planned/`. "Stop at draft" is
      just *not advancing* — `repoint-design` / `set-stage` fire only on capture/forward-motion, so a stop is the
      absence of those, not a new code path. The `--plan` signal plus a "don't advance" marker is net-new but small.
    - **Degrades gracefully:** until/where the in-place backend is incomplete, `--plan <stub>` routes through the
      existing graduate→`arc-plan` path (legitimate when you intend to work the stub). Only the no-graduation
      grooming case needs the backend above.
    - **Boundary with `planning-iteration-mechanics`:** this WU owns the *entry/locus* (the signal + where
      planning runs); PIM owns the *content* mechanics (inbound-buffer drain ceremony, sizing correction). Adjacent
      at the `assess-draft-readiness`-at-init seam; cleanly separable.

4. **(Design-bearing) Symmetric `--housekeep` priming flag — evaluate.** Housekeep is doctrine-blessed mid-WU
   (base-branch write context, not no-WU), yet `session-init` only soft-offers it on the Orient arm and has no
   priming flag. A `--housekeep` flag symmetric to `--errand` would let a developer cold-enter or mid-WU-prime a
   drain — short-circuit the task-execution doc loads, relocate to base, run `drain-inbox`. This is a genuine
   design decision (see Open Questions), not a mechanical fix.

5. **(Ergonomic) Pre-focus a positional backlog-WU arg on the Orient arm.** A positional arg naming a backlog WU
   is currently "surfaced, not acted on" outside cold-start — the same not-consumed theme. Let the Orient/discovery
   arm **pre-focus** the named WU (and offer to init it), **confirm-only** — never auto-init. (This *is* the
   existing entry-seed mechanism extended to the discovery arm; low stakes.)

### Out of scope

- **Atomic-slug identity for captures.** The original "slug atomics at capture time" scope is dropped — OBE.
  Downstream mechanisms key on the entry **title**, not a slug (`arc errand open --from-inbox <entry-title>`;
  `arc errand close` drops the originating entry via the record's `originEntry` back-pointer). The future
  identity-on-`_Slug:_` migration is **OSD's** (`operational-state-docs`). Title-keying + the back-pointer already
  solve adoption and removal; nothing here needs a slug.
- **`--new` / `--discover` and `arc-shift`.** Deferred / dispositioned — see § Deferred signals.
- **`run-errand` / `arc-errand` execution mechanics** — already correct (relocation + "any worktree" handling).
  This WU changes *entry routing*, not execution.
- **`arc-housekeep` / `drain-inbox` execution mechanics** — the write-context guard and mid-WU invokability
  already exist; only the priming/entry door is in question (scope item 4).
- **In-place planning *content* mechanics** — the drain ceremony, depth-aware sizing correction →
  `planning-iteration-mechanics`. This WU owns only entry/locus (scope item 3).
- **`arc inbox add` deterministic write CLI** — OSD's. (Relevant to the routed-out capture-and-leave concern,
  not to this WU.)
- **Per-WU worktree-by-default rollout** — the broader cohort move; this WU works under both the current
  (in-primary) and future (per-WU-worktree) practice.
- **Parallelism conventions, merge-safety, async-merge, single-owner-WU model** — Concurrent Work Conventions.

---

## Deferred signals

The dispatch slot (§ Signal family) is built to be extended; these are deliberately **not populated** now.

### `--new` / `--discover` — deferred (slot-ready)

Start new work from a Resume arm by routing to discovery / new-WU-start. **Deferred** because, unlike the
populated three, it carries **no bug-fix or correctness value**: starting a new WU already works (`arc start B`
cuts B's own branch / spawns its worktree — isolation already enforced; or just direct the agent). There is no
discarded-signal bug (the signal doesn't exist today). Worse, pre-parallelism the underlying "start B while A is
active" is gated by the single-checkout occupancy model itself — `--new` would route to the same constrained
`arc start` and remove no real blocker; post-parallelism the natural flow is "spawn B's worktree, open a session
*there*," reducing `--new` to a minor shortcut. The generic slot makes it a one-line add if demand materializes.

### `arc-shift` — dispositioned to `finalize-parallelism`

The deferred in-session **shift** verb (`cohort-agile-parallelism.md` § Deferred — `/arc-shift`; originally WF
R13/R14/R15). **Related theme, orthogonal mechanism** — it does not belong in this WU's slot:

| | `--new` (and the populated signals) | `arc-shift` |
| --- | --- | --- |
| When | At session entry (dispatch override) | Mid-session detour |
| Context | Establishes *fresh* scoped context | *Carries + merges* the live session context |
| Target | New/relocated work locus | Another **worktree's runtime environment** |
| Return | No | Yes — short detour, return-intent |
| Mechanism | A case in the `arc-session` dispatch slot | A separate verb (`shift-work-unit.md`), not an entry signal |

`arc-shift`'s reason for existing is the **context-merge across a runtime hop**; none of the entry signals do
that. Its premise — operate in *another worktree's* runnable environment — also requires real worktrees-in-use,
which is gated on `finalize-parallelism` (worktree-by-default; `node_modules`-in-worktree still uncleared). Demand
is unverified. **Disposition:** route the revival decision to `finalize-parallelism` (where the substrate it
operates on becomes real and the as-built concurrent-work conventions exist to update against), not here. Fold a
note into `cohort-agile-parallelism.md` § Deferred resolving the dangling "ratify when an owner takes it."

---

## Layer map — where the fixes land

| Layer | Change | Weight |
| --- | --- | --- |
| **Doctrine** | The doctrine is already correct. Realign the cohort known-gap record (`cohort-agile-parallelism.md` § Known gap) to name the active-WU dual it under-scoped; add the `arc-shift` disposition note. | Light |
| **CLI / probe** | Small. The errand/housekeep core needs none (signals are skill/workflow tokens; the probe is agnostic; errand identity is record-owned via existing primitives). `--plan`'s in-place backend needs `resolveDraftPresent()` path-parameterized (`handlers/plan.ts`) plus a "don't advance" marker. No state-machine change (grooming is not a transition). | Light |
| **Workflows** | `session-init` entry dispatch (the core); retire/rewrite the "signal not consumed" rule; add the generic override + the three signals + pre-focus. `run-errand` / `drain-inbox` already correct. | Medium |
| **Skills** | `arc-session` (bare `--errand` wording; `--housekeep`; `--plan`). `arc-inbox` terminology only (no slug work). `arc-errand` already correct — the warm-path precedent. | Light–medium |

---

## Relationship to CWC and the cohort

- **Member of agile-parallelism**, descending from the Errand Enablement → `work-routing-discipline` lineage
  (the errand-model re-pivot to execution-only). It *completes* the cohort's recorded cold-errand-entry known gap
  by covering the active-WU dual.
- **Independently shippable; not gated on CWC or AWL.** It manifests with a *single* WU today and needs none of
  the parallelism mechanism. It should ship ahead of the parked CWC stack.
- **Soft prerequisite to CWC's coherence.** CWC's concurrency conventions assume mid-WU errand/housekeep entry
  already works (the in-session-fork matrix, the all-owner advisory gate at `errand-launch`). If this entry gap
  persists, that doctrine describes a path the plumbing won't take. A dependency note is folded into
  `draft-concurrent-work-conventions.md`.
- **Coordination (not blockers):** `planning-iteration-mechanics` (content vs. locus boundary, scope item 3);
  `operational-state-docs` (the `_Slug:_` identity migration the dropped slug-item routes to); and — for the
  routed-out capture-and-leave concern below — `skill-infrastructure-cleanup` (the warm/cold session marker).
- **Routed out — frictionless cold-session capture.** The "capture-and-leave with no ARC session" idea
  (verified demand) surfaced here but is a *different mechanism* (a cold `arc-inbox` skill path that removes the
  need for a session door, vs. this WU enriching it) — opposite ends of the "out-of-WU work shouldn't require
  winding down" spectrum, no shared mechanism. Captured to `USER-INBOX § Work Unit` (→ a `frictionless-capture`
  planned/P2 stub at the next housekeep).
- **Severity:** the errand/housekeep core is bugfix-grade (shipped doctrine + execution exist; only entry routing
  under-honors them); `--plan`'s backend is small-but-real; the `--housekeep` flag is design-bearing. Overall a
  **small WU** — multi-surface plus one real design decision — with `Class: Heavy` already recorded.

---

## Open Questions

- **`--housekeep` flag: build it, or rely on the warm path?** `arc-housekeep` already runs mid-WU via its warm
  skill, and `session-init` already soft-offers housekeep on the Orient arm. Is a `--housekeep` priming flag worth
  the symmetry, or is the right fix simply (a) un-suppress a housekeep *route* on the Resume arm and (b) lean on
  the warm skill? Decide whether errand and housekeep should be strictly symmetric at the entry door.
- **Precedence UX when a signal collides with a resolvable active WU.** Auto-relocate-and-enter, or
  confirm-before-relocate ("active WU `X` is checked out here; run this in an isolated locus and leave `X`
  untouched?")? Lean: confirm once, then relocate — the explicit flag signals intent, but relocating away from a
  resumed WU is worth a single visible beat. (Applies to `--errand` / `--housekeep` / `--plan` uniformly.)
- **`--plan` specifics.** How is the "don't advance / stop at draft" intent carried (a session marker vs. a
  transient flag)? And does `--plan <stub>` on a Resume arm follow the same confirm-then-relocate precedence as
  the others?
- **Bare `arc-session` (no flag) on a Resume arm — should it offer errand/housekeep/plan as routes?** Or keep the
  flags as the only priming door so bare resume stays fast and unambiguous?
- **One dispatch path for all signals.** Should the no-WU Orient leaf and the new Resume route share a single
  signal-dispatch leaf (§ Signal family), so the slot is genuinely one mechanism rather than per-arm duplication?

---

## Dependencies

- **Upstream (shipped):** Errand Enablement (`run-errand`, the `arc-errand` warm skill, the Errand decision
  matrix); work-routing-discipline (errand-model re-pivot; housekeep write-context guard); In-Flight Awareness
  (the oracle behind `arc errand check`); errand-lattice (record-owned errand identity — `readErrandSlugByBranch`,
  the retired `chore/`-prefix parse); the lifecycle state machine (state resolved from location + meta, so in-place
  grooming needs no new state); `planning-pipeline-readiness`. All shipped — this WU composes them.
- **Coordination (not blockers):** `planning-iteration-mechanics` (planning *content* mechanics);
  `operational-state-docs` (`arc inbox add` + the `_Slug:_` identity migration); `skill-infrastructure-cleanup`
  (warm/cold session marker — for the routed-out capture-and-leave follow-on).
- **Sibling:** Concurrent Work Conventions (parked) — soft downstream consumer; see § Relationship.
- **No blocking queue.** Ready to spec once prioritized.
