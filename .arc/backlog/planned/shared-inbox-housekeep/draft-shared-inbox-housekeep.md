# Draft: Shared-Inbox Housekeep — Consolidation Sweep for the Shared Atomic Inbox

- **Origin:** [internal] — surfaced at the follow-up housekeep drain (2026-06-01); several `ATOMIC-INBOX`
  entries were observed to now have plausible stub homes that didn't exist when they were captured.
- **Purpose:** Give the project-shared `ATOMIC-INBOX` the same active re-homing maintenance `USER-INBOX` already
  gets, so homeless atomics don't rot when new stubs make homes available — keeping the backlog consolidated and
  the core "no item with a known home rests in a capture surface" invariant true over time.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Evaluate whether `arc housekeep` warrants verbs beyond `check`**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: shared-inbox-housekeep`), housekeep drain (2026-06-17);
  captured during `lifecycle-transition-core` close-out (2026-06-17).
- *Concern:* the same WU-vs-adjacent CLI asymmetry the errand note raises — `arc housekeep` exposes only `check`
  (the write-context / baseBranch probe), no mutators, while the WU lattice now has a full verb set.
- *Proposed:* likely a **weaker** candidate than errands — the housekeep drain is judgment-heavy (where does each
  inbox entry route?), and its deterministic mechanics largely reuse existing primitives (`arc stub` for new stubs,
  the inbox capture). Apply the cohort's mechanics-vs-judgment test: lift only genuinely-deterministic,
  currently-hand-run steps (e.g. executing a decided routing / flushing homeless atomics to the shared inbox) if any
  clear the bar; the routing decision stays judgment in the drain workflow.
- *Home note:* closest planned home; re-route if `shared-inbox-housekeep` isn't the exact owner of the housekeep CLI.

### `[ ]` **Atomic-inbox completion-order reorder — deterministic sort the sweep could own**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: shared-inbox-housekeep`), housekeep drain (2026-06-19);
  captured during `lifecycle-mechanics-tail` audit (2026-06-18).
- *Concern:* atomic-inbox completion ordering (incomplete `[ ]` on top, blank-line gap, then completed in
  chronological completion order, oldest→newest) is a deterministic partition+sort, currently hand-run in
  `process-task-loop` § Atomic Task Completion (steps 2–3). No CLI owns it — `lib/classification.ts` has no
  reorder/sort and `handlers/housekeep.ts` has no writer.
- *Proposed:* a deterministic reorder the shared-inbox sweep owns — partition by checkbox state, then sort
  completed entries by completion order.
- *Home note:* classified out-of-scope at the lifecycle-tail audit (inbox/housekeep substrate, not the
  lifecycle/transition CLI surface), routed to its owner.

### `[ ]` **Reframe this WU — decide the shared-inbox *model* first; own the inbox/routing architecture**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: shared-inbox-housekeep`), housekeep drain (2026-06-21);
  surfaced examining errand-lattice's drain disposition (2026-06-19).
- *Concern:* this stub currently *assumes* `ATOMIC-INBOX` lives and only needs a rot-fix re-homing sweep. Elevate
  it to first decide **whether the shared atomic inbox should exist at all** — retire is a legitimate outcome (it
  looks like the same "capture surface holding execution-bound items" anti-pattern the 2026-05-31 errand-queue
  re-pivot retired). The rot-fix sweep becomes a *conditional* deliverable (only if keep wins).
- *Proposed rename:* `shared-inbox-model` (or similar) — the name should signal "decide the model," not "maintain
  the assumed one."
- *Scope it should own (the routing/inbox-architecture cluster, all surfaced during errand-lattice planning):*
    - **Shared-atomic-inbox fate** — examine whether it fills a real gap (atomic items with no owning WU that can't
      execute now *and* benefit from *shared* vs. personal visibility) or is a rot-pile to retire.
    - **The bucket problem** — captures pile into "the only backlog surface touching that domain," accreting
      unrelated concerns until the eventual WU inherits a mess.
    - **The fracturing problem (most disruptive)** — a capture lands in a so-so home; a better-fitting WU later
      spawns but never *discovers and absorbs* the prior scattered thinking. Implies a **discovery-at-WU-start**
      sweep (a new stub/WU checks capture surfaces + sibling stubs for in-domain thinking and consolidates).
      Principle: right-place-*eventually* > right-place-*immediately* when the immediate home isn't obvious.
    - **Holding-ground vs. direct-stub tension** — a swept-regularly intermediate holding ground aids
      eventually-correct routing, but obviously-WU-tier work should skip holding and become a stub directly.
      Unresolved.
    - **Aggregation discovery** — N errand-class captures that *combined* are either a WU (if the aggregate needs
      design) or one "big errand" (if it doesn't). The classification rule is errand-lattice's (the
      spec-worthiness gate applied to the aggregate); the *discovery* ("notice they belong together") is
      housekeep's.
- *Boundary (re-cut during errand-lattice create-spec, 2026-06-19):* the **personal** `USER-INBOX` surface — its
  section relabel (`## Atomic`/`## Backlog` → `## Errand`/`## Work Unit` + preambles), the
  `arc-inbox`/`arc-housekeep` classification keyed on spec-worthiness, and the coupled code — is **errand-lattice's**
  (shipped). This WU owns only the **shared** inbox model (the bullets above). The deterministic managed-write
  `arc inbox add` stays `operational-state-docs`'.

---

## Problem / Motivation

The core invariant — *no item with a known home may rest in a capture surface* — is enforced at **write-time**
(capture / drain) but never **maintained as the stub landscape evolves**. A new stub lands; an atomic that was
legitimately homeless when captured now has a home — and nothing re-checks. The invariant silently decays.

A telling asymmetry proves it:

- **USER-INBOX is actively re-triaged** every `arc-housekeep` run against the current stubs (a capture can route
  to a stub that didn't exist at capture time — observed live this session).
- **ATOMIC-INBOX is only pull-consumed** at WU init/activation by domain-match. There is no push-based
  "re-home against current stubs" sweep, so it rots — entries sit while homes become available.

Domain-absorption-at-WU-init is the right *fallback*, but it only fires when a relevantly-scoped WU happens to
activate; it is not a proactive consolidation mechanism. The shared inbox needs the maintenance pass.

## Shape (candidate directions — not yet chosen)

The triage **spine is shared** with the user-scoped drain: read entries → classify (character · home) → confirm
plan → route to existing/new stub, or queue execute-now for the exit transition. Three things differ by **scope
mode**:

1. **Closing condition.** USER-INBOX drains to *empty / triaged*; an ATOMIC-INBOX consolidation is a **sweep** —
   entries with still no home legitimately **stay** (the shared inbox is their terminal home). "No un-triaged
   entries" becomes "swept against current stubs."
2. **Homeless handling.** USER-INBOX flushes homeless atomics *down* to ATOMIC-INBOX; ATOMIC-INBOX has nowhere
   downstream — homeless stays put. The flush leg doesn't exist in shared mode.
3. **Concurrency / foreign-owner.** Re-homing another developer's atomic, or editing a shared tracked surface
   others may touch, raises concerns the private, single-owner, notes-backed USER-INBOX drain never faces. Hard
   dependency on `concurrent-work-conventions` (see its Inbound Buffer consumer note).

**Open fork:** make `drain-inbox` **dual-mode** (a `scope: user | shared` parameter over one spine) vs. **two
paths** sharing an extracted spine. The parameterized shape is the DRY direction and a clean `composable-workflows`
case (extract the triage spine as a composable unit; user-scope and shared-scope are arms) — forward-compat with
that WU.

## Why it wasn't built originally (not necessarily a miss)

A deliberate scope boundary: the shared inbox was designed for **pull-based consumption** (WU-init absorption +
execution-when-claimed); write-time invariant enforcement shipped while maintenance-over-time was the unbuilt
follow-on; and the foreign-owner concurrency model was reasonably deferred until CWC exists to lean on. The
visible consequence (entries rotting) is the trigger to build the maintenance pass now.

## Dependencies / Cross-refs

- **`concurrent-work-conventions`** (hard dependency) — the foreign-owner / shared-surface concurrency doctrine
  this sweep consumes; flagged in CWC's Inbound Buffer for entry-level re-homing coverage.
- **`composable-workflows`** — the dual-mode / shared-spine decomposition is a forward-compat case.

## Scope Estimate

Quick-tier minimum — a workflow mode/parameter + closing-semantics + the shared-surface concurrency handling;
grows with the dual-mode-vs-two-paths decision and the CWC dependency. The mechanism can later **dogfood** itself
to clear the currently-rotting ATOMIC-INBOX entries rather than hand-re-homing them ad-hoc.
