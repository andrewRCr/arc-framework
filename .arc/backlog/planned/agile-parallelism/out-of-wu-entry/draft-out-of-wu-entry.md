# Draft: Out-of-WU Session Entry

**Purpose:** Close the gap between ARC's **errand/housekeep doctrine** (an out-of-WU concern can be
entered *now*, from any worktree, while other WUs are in flight) and ARC's **session-entry plumbing**
(`session-init`'s entry dispatch honors an explicit `--errand` signal only on the Orient arm — when there
is *no* active WU — and discards it on the Resume arm; housekeep has no priming door at all). The
execution layer (`run-errand`, the `arc-errand` warm skill, `drain-inbox`) already supports mid-WU
out-of-WU work correctly; only the **cold door through `arc-session`** under-honors it. This WU realigns
the entry dispatch so explicit out-of-WU intent routes regardless of active-WU state, and folds in the
capture-side and ergonomics gaps that surfaced alongside it.

- **State:** Draft (pre-spec) — captured 2026-06-05 from a live investigation triggered by
  `arc-session --errand` failing to route while a planning WU was active. Design direction sketched;
  iteration expected before PRD/spec promotion.

- **Created:** 2026-06-05.

- **Origin:** [internal] — surfaced during `class-model-foundation` planning. The developer invoked
  `arc-session --errand` from the primary worktree (active planning WU checked out, clean tree); the
  session resolved to the **Resume** arm and discarded the `--errand` signal per
  `session-init.md` "Errand signal not consumed (non-Orient arms)". The warm `arc-errand` skill was then
  used to run *this* capture as an errand — itself confirming the gap is localized to the cold door.

- **Cohort:** agile-parallelism — a gap-correction descending from the **Errand Enablement →
  work-routing-discipline** lineage (the cold-errand-entry known gap was recorded in
  `cohort-agile-parallelism.md` but under-scoped; see § Root cause). Adjacent to Concurrent Work
  Conventions; **independently shippable, not gated on CWC/AWL** (see § Relationship to CWC).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Add a `--new` / `--discover` Resume-arm override (3rd explicit-intent sibling)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: out-of-wu-entry`), housekeep drain (2026-06-12); captured
  during `async-merge-lifecycle` planning (parallelism entry-path review).
- *Concern:* this WU already owns the pattern — realign `session-init`'s entry dispatch so an explicit out-of-WU
  signal *outranks* the implicit Resume, preserves the active checkout, and routes onward — but it enumerates only
  `--errand` and (future) `--housekeep`. Starting a **new parallel WU** from a Resume arm (a session opened on an
  active WU / non-primary worktree, wanting to start something new without manually hopping to primary) is the
  uncaptured third sibling of the same realignment.
- *Proposed:* extend the signal set with a `--new` / `--discover` override that redirects a Resume-arm session to
  the discovery / new-WU-start surface (which already consults `assess-parallel-fit`). Same precedence rule
  (outrank resume, preserve checkout) as `--errand` / `--housekeep`.
- *Caveat (don't over-invest):* acuteness is largely a **pre-parallelism artifact** — under worktree-by-default a
  new parallel WU spawns its own worktree (cold-enter fresh), so the `--new` need softens. Still a reasonable
  ergonomic; size accordingly.
- *Scope:* signal-set extension on this WU's own dispatch realignment.

### `[ ]` **First-class in-place planning iteration on backlog stubs (no activation round-trip)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: out-of-wu-entry`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` create-spec handoff discussion (2026-06-14).
- *Concern:* there is no first-class way to run a dedicated planning-iteration session against a backlog stub *in
  place*. Iterating a stub's draft today forces `init-work-unit` (graduate to `active/`, cut a `plan/` branch) →
  draft → park back, which records a **false state** (`parked`, excluded from parallel-capacity math) for what is
  grooming-lane work, and churns a branch + trips the worktree-occupancy guard.
- *Proposed:* two sub-cases. (1) Exploratory→capture largely closes once the first-class `stub` verb + Orient +
  `arc-inbox` ship. (2) In-place planning iteration — the real gap — needs three things: an **entry signal** (a
  `--plan <stub>` sibling of `--errand` / `--housekeep`, this WU's explicit-intent family); a **run-and-stop
  planning affordance** (`arc-plan` / `draft-design` on a backlog-located draft, deliberately stopping at the draft
  stage — cross-ref `planning-pipeline-readiness`); and **state-stays-put** semantics (grooming a `planned` stub is
  *not* `park` — cross-ref `lifecycle-state-machine`).
- *Open question:* how far should in-place planning proceed (draft? spec? task list?) — a spec / task list authored
  with no intent to activate drifts harder than a draft. Possible backstop: a "time since last planning" staleness
  signal surfaced at session-init / `arc-plan` re-entry, advisory not blocking.

---

## Problem / Motivation

A developer should be able to be mid-work-unit — potentially with multiple WUs in flight — realize they
need to do an **errand** (an atomic out-of-WU fix) or a **housekeep** drain, and reach it through the
universal door (`arc-session --errand`, or cold `arc-session` then route) without first having to wind
down or abandon their active work. The framework should switch to the primary worktree, cut a
`chore/<slug>` branch off the base, run the increment, and let them return. That is the *stated* doctrine.
It is not what the entry plumbing does.

### What the doctrine says (mid-WU out-of-WU entry is the normal case)

- `strategy-work-organization.md` § Entry path: an Errand "launches from **any worktree**: the workflow's
  Launch phase resolves the base branch and relocates the execution locus itself … so the caller need not
  pre-switch worktrees."
- `DEV-RULES.ARC.md` § Discovered Work Routing: *Out-of-WU, urgent → "Errand now — own session
  (`arc-session --errand`)."* That **is** the mid-WU path, stated as the primary route.
- `strategy-work-organization.md` § Main-on-Main: the primary worktree is "the launchpad for … Errand
  launches."
- `work-routing-discipline` (spec, R10): housekeep's precondition is "a *base-branch write context*,
  **not** 'no active WU' — so housekeep is invokable mid-WU on demand (hop to primary, sweep as a batched
  errand, return)."
- `run-errand.md` Launch step 3: "launching from any worktree (a work unit's included) is fine; only
  *executing* there would tangle that branch" — then it mechanically relocates (ephemeral worktree off
  base, or the primary's base checkout).
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
- Net effect: you can only *cold-enter* an errand or housekeep when you have **nothing in flight** —
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

## Scope

### In scope

1. **(Core) `session-init` entry dispatch honors explicit out-of-WU intent regardless of active-WU
   state.** On a **Resume** arm, an explicit `--errand` (and a future `--housekeep`) signal must route to
   the relocation-then-execute path rather than being discarded. The relocation itself is already
   `run-errand`'s job (ephemeral worktree off base under full protection; primary base checkout
   otherwise) — `session-init` only needs to *reach* it instead of resuming the WU and dropping the
   signal. Concretely:
    - Revise/retire the "Errand signal not consumed (non-Orient arms)" rule (`session-init.md`). Replace
      the circular advice with an actual Resume-arm errand route.
    - Define **precedence**: an explicit `--errand`/`--housekeep` signal expresses out-of-WU intent that
      **outranks** the implicit resume — but must **preserve** the active WU's checkout (relocate via a
      fresh locus; never clobber the resumed branch's working state).
    - Reconcile the **linked-worktree** case: `--errand` from a linked WU worktree currently "falls
      through to discovery" (`session-init.md`). It should relocate to the primary's base and run the
      errand (which `run-errand` already supports).

2. **Bare `--errand` validity + short-circuit semantics.** A bare `--errand` (no slug/description) is
   *intended* to be valid: it primes errand cold-entry, which loads **universal context only** and
   **skips** SESSION-NOTES, the active task list, and `process-task-loop` (the agent is told "we're doing
   an errand; don't read WU-execution docs, then I'll direct"). Today the dispatch condition is written
   `--errand <blurb|slug>` *present* (`session-init.md`), implying an argument is required, while
   cold-entry's "seed … when present" anticipates its absence — an internal inconsistency. Fix the
   wording in the `arc-session` skill and `session-init` so absent-seed is explicitly supported
   (→ elicit the concern interactively, or adopt a flagged `USER-INBOX § Atomic` capture).

3. **Atomic captures carry a stable slug.** `arc-inbox` assigns a slug only to `§ Backlog` `WU_Target`
   routing, never to `§ Atomic` (errand-class) entries — so a captured atomic has no slug. But two
   downstream mechanisms key on one: `--errand <slug>` adoption of a flagged capture, and `run-errand`
   Complete's "remove the **slug-matched** originating `USER-INBOX` entry." Atomics are precisely the
   errand-class captures; they should carry a stable slug at capture time. Fix the `arc-inbox` guidance
   to slug atomics (and decide backfill for existing unslugged ones).

4. **(Design-bearing) Symmetric `--housekeep` priming flag — evaluate.** Housekeep is doctrine-blessed
   mid-WU (base-branch write context, not no-WU), yet `session-init` only soft-offers it on the Orient
   arm and has no priming flag. A `--housekeep` flag symmetric to `--errand` would let a developer
   cold-enter or mid-WU-prime a drain — short-circuit the task-execution doc loads, relocate to base, run
   `drain-inbox`. This is a genuine design decision (see Open Questions), not a mechanical fix.

### Out of scope

- **`run-errand` / `arc-errand` execution mechanics** — already correct (the relocation and "any
  worktree" handling exist). This WU changes *entry routing*, not execution.
- **`arc-housekeep` / `drain-inbox` execution mechanics** — the write-context guard and mid-WU
  invokability already exist; only the priming/entry door is in question (sub-finding 4).
- **Per-WU worktree-by-default rollout** — the broader cohort move; this WU works correctly under both
  the current (in-primary) and future (per-WU-worktree) practice.
- **Parallelism conventions, merge-safety, async-merge, single-owner-WU model** — Concurrent Work
  Conventions.

---

## Layer map — where the fixes land

| Layer | Change | Weight |
| --- | --- | --- |
| **Doctrine** | The doctrine is already correct. Realign the cohort known-gap record (`cohort-agile-parallelism.md` § Known gap) to name the active-WU dual it under-scoped. | Light |
| **CLI / probe** | Likely **none** for the core. `--errand` is a skill/workflow token that never reaches the CLI; the probe is agnostic; `detectErrandResume` is per-branch with no "no active WU" encoding. Confirm at spec time whether any probe assist helps the Resume-arm errand route (e.g. surfacing base/primary resolution) — but the existing `arc housekeep check` / `arc errand check` primitives already cover relocation inputs. | None–light |
| **Workflows** | `session-init` entry dispatch (the core); retire/rewrite the "signal not consumed" rule. `run-errand` already correct. | Medium |
| **Skills** | `arc-session` (bare `--errand` wording; optional `--housekeep`), `arc-inbox` (atomic slug). `arc-errand` already correct — reference it as the warm-path precedent. | Light–medium |

---

## Relationship to CWC and the cohort

- **Member of agile-parallelism**, descending from the Errand Enablement → `work-routing-discipline`
  lineage (the errand-model re-pivot to execution-only). It *completes* the cohort's recorded
  cold-errand-entry known gap by covering the active-WU dual.
- **Independently shippable; not gated on CWC or AWL.** It manifests with a *single* WU today and needs
  none of the parallelism mechanism. It should ship ahead of the parked CWC four-WU stack.
- **Soft prerequisite to CWC's coherence.** CWC's concurrency conventions assume mid-WU errand/housekeep
  entry already works (the in-session-fork matrix, the all-owner advisory gate at `errand-launch`). If
  this entry gap persists, that doctrine describes a path the plumbing won't take. A dependency note is
  folded into `draft-concurrent-work-conventions.md`.
- **Severity:** the core errand route is bugfix-grade (shipped doctrine + execution exist; only entry
  routing under-honors them); the `--housekeep` flag is design-bearing. Overall a **small WU**, not an
  errand to implement (multi-surface + one real design decision).

---

## Open Questions

- **`--housekeep` flag: build it, or rely on the warm path?** `arc-housekeep` already runs mid-WU via its
  warm skill, and `session-init` already soft-offers housekeep on the Orient arm. Is a `--housekeep`
  priming flag worth the symmetry, or is the right fix simply (a) un-suppress a housekeep *route* on the
  Resume arm and (b) lean on the warm skill? Decide whether errand and housekeep should be strictly
  symmetric at the entry door.
- **Precedence UX when `--errand` collides with a resolvable active WU.** Auto-relocate-and-enter, or
  confirm-before-relocate ("active WU `X` is checked out here; run the errand in an isolated locus and
  leave `X` untouched?")? Lean: confirm once, then relocate — the explicit flag already signals intent,
  but relocating away from a resumed WU is worth a single visible beat.
- **Bare `arc-session` (no flag) on a Resume arm — should it offer errand/housekeep as routes?** Or keep
  the flags as the only priming door so bare resume stays fast and unambiguous?
- **Atomic slug format + backfill.** Derive from the title, or require user-supplied? How to handle
  existing unslugged atomics (the one that triggered this capture has none) — backfill on next
  housekeep, or tolerate slug-less legacy entries in the removal path?
- **Does the no-WU Orient leaf and the new Resume route share one code path?** Both end in "load
  universal context only → relocate → `run-errand`." Spec should DRY them behind one errand-entry leaf
  reached from either arm, not two parallel implementations.

---

## Dependencies

- **Upstream (shipped):** Errand Enablement (`run-errand`, the `arc-errand` warm skill, the Errand
  decision matrix), work-routing-discipline (errand-model re-pivot; housekeep write-context guard),
  In-Flight Awareness (the oracle behind `arc errand check`). All shipped — this WU composes them.
- **Sibling:** Concurrent Work Conventions (parked) — soft downstream consumer; see § Relationship.
- **No blocking queue.** Ready to spec once prioritized.
