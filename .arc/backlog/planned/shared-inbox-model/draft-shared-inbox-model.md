# Draft: Shared-Inbox Model — `INBOX.PROJECT` Semantics, Consumption, and Concurrency

- **Origin:** [internal] — surfaced at the follow-up housekeep drain (2026-06-01) as a re-homing sweep for rotting
  `ATOMIC-INBOX` entries; reframed at the 2026-07-02 grooming pass to decide the shared-inbox *model* first — the
  sweep is one deliverable inside it, in service of the model rather than the assumed status quo.
- **Purpose:** Codify the two-inbox model — the semantics separating the personal and project inboxes, the
  consumption wiring that keeps the project inbox from rotting, and the concurrency shape that holds identically
  from solo to team and lifts onto the arc-backend substrate without reshaping.
- **Renamed (2026-07-02):** `shared-inbox-housekeep` → `shared-inbox-model` — the name signals "own the model,"
  not "maintain the assumed one." The `ATOMIC-INBOX` → `INBOX.PROJECT` *surface* rename stays
  naming-conventions' (coordinated, not blocked on).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration.*

### `[ ]` **Multi-entry errand drain only tombstones the `--from-inbox`-adopted capture**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: shared-inbox-model`), housekeep drain (2026-07-18);
  captured during FP wave-4 burn-in (2026-07-17).
- *Concern:* the CI-billing errand (PR #281) executed **two** inbox captures — "Cut CI billed minutes" (adopted
  via `--from-inbox`) and "Wire ci-defer-heavy awareness" (folded into the same errand's scope, commit
  `726ba38b`). At close, only the adopted entry landed in `## Removed:` with a tombstone; the second vanished
  from `USER-INBOX` with **no tombstone**. No outcome lost (both shipped), but the removal was untracked — a
  tombstone-free disappearance is exactly the shape that reads as silent loss on inspection.
- *Fold-in:* first confirm the mechanism vs. operator error — did the executing agent drop the second entry via
  `arc user inbox-remove` (which should tombstone) or a raw file edit (which wouldn't)? If the former, the drop
  path has a tombstone gap; if the latter, the lesson is "always route removals through the verb." Either way an
  errand carries a single inbox back-pointer (`origin`), so a drain that executes N captures auto-drops only 1 —
  the N>1 case needs either explicit multi-adopt or a documented remove-the-siblings-via-the-verb step.

### `[ ]` **Give disciplined drains machine-readable lane provenance**

- *Routed from:* `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured after PR #221 was classified as
  reviewed despite being a disciplined routing PR.
- *Concern:* settle a machine-readable drain provenance/attestation shape, then let reviewed-lane classification
  consume it without baking inbox paths or mutable labels into provider policy. Coordinate the eventual shared
  inbox rename so path churn cannot silently regress classification.

### `[ ]` **Make inbox-to-stub routing interruption-safe**

- *Routed from:* `USER-INBOX § Work Unit`, housekeep drain (2026-07-15); captured during wave-3 housekeep routing
  PR #255.
- *Concern:* A ten-entry housekeep batch required ten hand-authored destination writes followed by ten sequential
  `arc user inbox-remove` calls. The workflow describes each pair as a move, but no primitive binds the tracked
  destination and the notes-backed source: interruption can leave duplicate entries, and removing the source
  before the grooming PR merges can strand the only routed copy on an abandoned branch. Define the drain's
  idempotent cross-store move protocol and recovery states — prefer an explicit pending-route/finalize-or-heal
  shape over two-phase commit: retain enough source or receipt state until the destination commit is durably
  landed, make retries no-op-safe, and reconcile copied-but-not-removed and removed-but-not-landed outcomes.
  Consume `operational-state-docs`' paired managed add/remove primitives and `arc-backend`'s established
  eventual-consistency-plus-heal posture rather than duplicating either substrate. Scope: design-bearing drain
  semantics plus CLI/record support and failure-path coverage; this WU owns routing/re-home semantics, while OSD
  owns deterministic entry I/O and arc-backend supplies the long-term cross-store consistency contract.

---

## Problem / Motivation

The core invariant — *no item with a known home may rest in a capture surface* — is enforced at **write-time**
(capture / drain) but never **maintained as the stub landscape evolves**. A new stub lands; an atomic that was
legitimately homeless when captured now has a home — and nothing re-checks. The invariant silently decays.

A telling asymmetry proves it:

- **USER-INBOX is actively re-triaged** every `arc-housekeep` run against the current stubs (a capture can route
  to a stub that didn't exist at capture time — observed live).
- **ATOMIC-INBOX is only pull-consumed** at WU init/activation by domain-match. There is no push-based
  "re-home against current stubs" sweep, so it rots — entries sit while homes become available.

**Diagnosis (2026-07-02): the rot is a missing-consumer bug, not evidence the surface is wrong.** `USER-INBOX`
has three structural consumers (the housekeep drain, session-init's `inboxState` probe + soft-offer, errand
adoption); `ATOMIC-INBOX` has zero probes, zero nudges, no sweep. Retiring the surface fails structurally: the
personal inbox's closing semantics ("drain to empty / triaged") need a downstream for homeless items, and
`_Hold:_` means "retained for imminent self-execution," not a terminal home. So: keep the surface, fix
consumption, and sharpen the semantics so the two surfaces cannot blur.

## The Model — two inboxes split by scope and tenure

The primary axis is **scope + tenure**, not "personal vs. shared" — multi-writer sharing is a *consequence* of
project scope, not the definition:

- **`INBOX.USER`** (`USER-INBOX` today) — private, **volatile, near-term**. A working buffer: live capture at
  any moment, plus entries the owner is *actively committing to executing personally, soon*. Tenure is measured
  in days-to-a-few-drains. Single-writer by construction (identity-scoped, notes-backed).
- **`INBOX.PROJECT`** (`ATOMIC-INBOX` today) — project-scoped, **durable-until-claimed**. The project's holding
  surface for homeless atomic concerns: anything worth keeping that no stub owns and no one is committing to
  near-term. Tenure is "until a WU absorbs it, someone executes it, or a sweep re-homes it." Multi-writer in
  team configurations; write-disciplined (§ Concurrency).

A project of one still has a project: solo, `INBOX.PROJECT` is the cross-session shared brain (rotating agent
sessions are the "team members"); in a team it is additionally cross-person. Same surface, same semantics.

WU-tier work never rests in either surface beyond capture: multi-step concerns always have a stub home (existing
invariant), and the direct-stub express lane stays open — the holding ground is for **atomic homeless** items
only, which resolves the previously-open holding-ground-vs-direct-stub tension.

**Capture lands personal-first, always.** Every capture path — warm `arc-inbox`, and `frictionless-capture`'s
cold fast-path when it lands — writes `INBOX.USER` only; the drain is the **sole promotion point** into
`INBOX.PROJECT`. This preserves the project surface's write discipline (no ad-hoc multi-writer appends), keeps
capture zero-coordination-cost, and costs at most one drain of promotion latency. An obviously-project-scoped
capture still enters personal and promotes at the next drain.

## Solo ≡ team (mechanical identity)

The operating discipline never branches on team size — solo is the **single-writer configuration of the same
model**, the workflow-layer analogue of `strategy-storage-evolution` Principle 7 (team-mode is the multi-writer
config of one substrate, never a separate axis). Concretely:

- The same fire-points nudge, drain, sweep, and absorb in both configurations; no team-only ceremony, no
  solo-only shortcut. "I'm solo, so I operate only out of my personal inbox" must not be a stable equilibrium —
  if it is, a team deployment inherits a surface nobody has the habit of reading.
- The forcing function is the drain fork below: personal retention requires an explicit self-commitment, so
  homeless not-self-committed items flow to `INBOX.PROJECT` mechanically, solo or not.
- Design constraint: if any of this feels like added ceremony solo, that is a **model failure to fix in the
  mechanics** — consumption rides *existing* fire-points; there is nothing new to remember.

## The retention line (drain fork, sharpened)

At the housekeep drain, every `§ Errand` item resolves to exactly one of four dispositions:

1. **Route** — a concrete home exists (existing stub / new stub / current-WU fold), subject to the disposition
   rubric below (routing is also a scheduling decision).
2. **Execute now** — queued for the drain's exit transition (errand).
3. **Retain** (`_Hold:_`) — an **explicit near-term self-commitment**: "I am doing this myself, soon." Never the
   default; per-entry; **aging-enforced** — an entry surviving N consecutive drains (default 2) without
   execution gets a promote-to-project nudge: the commitment claim has been falsified by revealed behavior.
4. **Promote to `INBOX.PROJECT`** — homeless + not self-committed. The **default** for "worth keeping, will
   think about later": later-thinking is precisely what the project surface exists for — where a sweep, another
   session, or another person can pick it up.

This flips today's implicit default (retain-in-personal) to **promote-by-default**, which keeps the personal
surface volatile and makes the project surface the single place homeless concerns accumulate — solo or team.

## Consumption wiring (the rot fix)

Four consumers, all riding existing fire-points:

1. **Session-init staleness probe + nudge.** A `projectInboxState` probe (entry count + oldest-entry age),
   surfaced as a once-per-calendar-day advisory when entries age past a threshold — the same shape as
   `errandSweep` / `inboxState`. Never gates. (Corrects the "sweep-based and nudge-free" assumption recorded in
   `draft-operational-state-docs.md`'s `_Awaiting:_` buffer entry — see Coordination.)
2. **Housekeep shared-scope sweep leg** — the original deliverable, now one consumer among four. The between-WUs
   drain gains the project scope: re-home entries against the *current* stub landscape. Closing semantics differ
   by scope: `INBOX.USER` closes at *empty / triaged*; `INBOX.PROJECT` closes at *swept against current stubs* —
   still-homeless entries legitimately stay.
3. **WU-init / activation domain-match absorption** — unchanged; becomes the pull-based fallback rather than the
   only consumer.
4. **Discovery-at-WU-start sweep** (the fracturing fix). A new stub / WU checks capture surfaces + sibling stubs
   for in-domain prior thinking and consolidates — right-place-*eventually* over right-place-*immediately*.
   Candidate scope; may land via `inbound-routing-method`'s `assess-wu-target` family (see Coordination).

**Sweep mechanics the project scope owns** (integrated from prior captures):

- **Aggregation discovery** — noticing N errand-class captures that *combined* are either a WU (aggregate needs
  design) or one extended errand. The classification rule is errand-lattice's (the spec-worthiness gate applied
  to the aggregate); the *discovery* is the sweep's.
- **Deterministic completion-order reorder** — incomplete `[ ]` on top, blank-line gap, completed in
  chronological completion order; currently hand-run in `process-task-loop` § Atomic Task Completion (steps
  2–3), no CLI owner. A deterministic partition+sort the sweep owns.
- **Mechanics-vs-judgment CLI split** — lift only genuinely-deterministic, currently-hand-run steps into
  `arc housekeep` / `arc inbox` verbs (executing a decided routing, flushing promoted entries, the reorder); the
  routing *decision* stays judgment in the drain workflow. `arc housekeep` remains a weaker CLI-verb candidate
  than the errand lattice for exactly this reason.

## Routing disposition (over-routing / under-execution)

Routing a capture to a backlog WU is a **scheduling decision disguised as a filing decision**: the concern
inherits that WU's activation horizon, which is opaque at routing time. Today's rubric optimizes domain fit and
the WU-floor only, producing two observed failure modes: **over-routing** — a capture lands in the only backlog
surface touching its domain (the bucket problem) and the eventual WU inherits an accreted mess — and
**under-execution** — a good-fit but errand-shaped, high-value concern parks behind a WU that may not activate
for months, when it could simply be executed.

Two tests gate the route-to-WU disposition, ahead of homing:

- **Coupling test** — does the concern *shape the target WU's design* (a design input that must be decided with
  the WU → route), or merely *share its domain* (a neighbor → don't route on fit alone)?
- **Horizon test** — is the target WU's (opaque) activation horizon acceptable for this concern's value?
  High-value + errand-shaped + separable → the execute lane (personal errand if self-committed, else
  `INBOX.PROJECT`), with at most a cross-reference to the WU.

Ownership: the codified rubric belongs to **`inbound-routing-method`** — completing a disposition → homing
(`assess-wu-target`) → integration method family; routed to its buffer at this grooming (2026-07-02). The
principle backstop is **`justified-deferral`** (anti-rider's dual). This WU owns the *surfaces* the dispositions
route onto and their semantics.

## Concurrency (consumes shipped `concurrent-work-doctrine`)

The hard dependency shipped (2026-q2). Its doctrine this WU consumes rather than re-derives: mutated shared
state is **not in-git-solvable** — conventions interim, the backend owns the mechanism (R14); foreign entry
writes ride the entry-level all-owner gate (R22); foreign-owned overlap → coordinate.

- **Entry-granular, slug-keyed operations.** Every mutation is an entry-level append / remove / re-home keyed on
  the OSD slug grammar, idempotent (no-op-when-absent, honoring `async-merge-lifecycle`'s contract). Never
  file-granular rewrites.
- **Two writer classes.** The drain *appends* (promotions flowing in); the sweep *removes / re-homes* — a
  second, heavier writer class. Interim (in-repo tier): both run serialized as base-branch ceremonies — today's
  write isolation, extended to the sweep. Concurrent drain + sweep across two developers is the known interim
  hazard the serialization convention bounds, with git text-merge as the backstop.
- **Foreign entries.** Re-homing another owner's promoted entry is sweep-sanctioned (the sweep *is* the
  coordination point); outside the sweep, foreign-entry writes surface the R22 gate.
- **Backend lift.** Entry-granular ops map 1:1 onto the arc-backend event log (append-plus-tombstone), and
  per-entry version-checked writes replace the serialization convention at the shared tier. Compose notes
  recorded in `draft-arc-backend.md` (2026-07-02).

## Workflow shape (fork resolved)

**Dual-mode `drain-inbox`** — one triage spine with a `scope: user | project` parameter; the mode governs the
three divergences (closing condition; homeless handling — user scope promotes up to project, project scope has
no downstream; the concurrency envelope). The DRY direction and a clean `composable-workflows` case; the
two-paths alternative is rejected.

## Errand adoption from `INBOX.PROJECT` (conditional scope)

With promote-by-default, `INBOX.PROJECT` entries are executable by anyone — adopting an errand directly from the
project inbox becomes a real path. Today adoption is bound to the personal inbox in three coupled places, all
internally consistent: the `--from-inbox <entry-title>` flag, the errand record's binary
`origin: "description" | "inbox"` (where `"inbox"` *means* user-inbox — `lib/errand/record.ts`, `version: 1`),
and the close drop-leg's hardwired `runUserInboxRemove` (`handlers/errand.ts`). Build scope (integrated from the
2026-06-24 capture): an inbox discriminator via a forward record-version migration (a new `origin` value or a
source-surface field), route the close-drop on it, qualify the flag. Nothing forecloses this today (flag
additively extensible, record versioned, drop-leg teachable); build when the model lands.

## Why it wasn't built originally (not necessarily a miss)

A deliberate scope boundary: the shared inbox was designed for pull-based consumption (WU-init absorption +
execution-when-claimed); write-time invariant enforcement shipped while maintenance-over-time was the unbuilt
follow-on, and the foreign-owner concurrency model was reasonably deferred until the doctrine existed to lean
on (it now does). The visible consequence — entries rotting — is the trigger to build the model now.

## Deliverables (shape at spec time)

1. **Model codification** — `strategy-planning-module` § Inbox Family rewrite (scope + tenure semantics, the
   drain fork, solo ≡ team); DEV-RULES.ARC § Discovered Work Routing touch-ups (promote-by-default, `_Hold:_`
   as explicit self-commitment + aging).
2. **Consumption wiring** — session-init probe + nudge; dual-mode `drain-inbox` with the project sweep leg;
   the discovery-at-WU-start seam (placement per Coordination).
3. **Sweep mechanics** — aggregation discovery, the deterministic reorder, the decided deterministic verb lifts.
4. **Errand-adoption discriminator** (conditional, above).
5. **Dogfood** — the first project-scope sweep clears the currently-rotting `ATOMIC-INBOX` entries rather than
   hand-re-homing them ad hoc.

## Dependencies / Coordination

- **`concurrent-work-doctrine`** — shipped; the meta edge is satisfied (discharge lands at activation).
- **`operational-state-docs`** — owns the record substrate: the slug-keyed grammar, `arc inbox add` +
  `removeInboxEntry` as a paired I/O surface, `_Awaiting:_` codification. **Seam correction owed:** its buffer's
  `_Awaiting:_` entry records the shared inbox as "sweep-based and nudge-free"; this model adds the staleness
  nudge — OSD consumes the corrected assumption at its next iteration. The entry-granular record shape is
  load-bearing for the backend lift (recorded in `draft-arc-backend.md`).
- **`inbound-routing-method`** — receives the disposition rubric (coupling + horizon) as a buffer entry (routed
  2026-07-02); coordinate the disposition → homing → integration family boundary, and the
  discovery-at-WU-start placement.
- **`justified-deferral`** (provisional) — the principle backstop; cross-referenced, not depended on.
- **`naming-conventions`** — the `INBOX.USER` / `INBOX.PROJECT` surface renames plus this WU's own rename
  cascade.
- **`roadmap-tooling`** — optional visibility composition: pending project-inbox count / age as a derived
  `STATUS.*` line (zero mutation, concurrency-free); decide at its render-standard pass.
- **`goal-aware-direction`** — two seams (routed at its 2026-07-02 grooming). (1) **`_Hold:_` → `_Queued:_`
  rename proposal:** its `VECTOR.USER` composed view derives membership from the retained set, making "retain"
  a real destination — the personal queue. `_Queued:_` names what the entry *is* (queued in my vector view)
  rather than what it isn't, and the drain fork's four dispositions all become destinations (Route / Execute /
  Queue / Promote); the aging nudge reads as a falsified commitment claim unchanged. This WU owns the call (the
  retention-line semantics are its); OSD codifies the flag schema downstream. (2) **The horizon test gains its
  missing input:** routing disposition's "is the target WU's activation horizon acceptable?" becomes cheaply
  answerable once `VECTOR.PROJECT` exists — a WU realizing a Now/Next target has a near horizon; a WU tied to
  no target or Later has an opaque-to-distant one.
- **`frictionless-capture`** — composes cleanly and reinforces the model: its cold fast-path is another
  `INBOX.USER`-only writer (capture-personal-first invariant above); higher capture volume raises the value of
  the drain's promote-by-default fork and OSD's deterministic `arc inbox add`. Its capture-time judgment
  (errand-vs-WU, `WU_Target` suggestion) stays a *provisional hint* — the drain's disposition gate is
  authoritative.
- **`composable-workflows`** — the dual-mode spine is a forward-compat case (coordinate-with, not blocked-on).
- **arc-backend / `strategy-storage-evolution`** — self-check run at this grooming (2026-07-02): entry-granular
  ops, append-plus-tombstone, per-entry sweep version-checks recorded there; the model lifts without reshaping.
- **Boundary (standing, re-cut 2026-06-19):** the **personal** surface — its section relabels, the
  spec-worthiness classification, and the coupled code — is `errand-lattice`'s (shipped). The deterministic
  managed-write `arc inbox add` stays `operational-state-docs`'.

## Scope Estimate

Medium: strategy + rules codification, the dual-mode workflow, the session-init probe + nudge, sweep mechanics
and deterministic verb lifts, plus the coordination seams. Grows if the errand-adoption discriminator and
discovery-at-WU-start land in-scope rather than deferring; the CLI record work stays OSD's.
