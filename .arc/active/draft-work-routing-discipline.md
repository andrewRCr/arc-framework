# Draft: Work-Routing Discipline

**Purpose:** Modernize ARC's work-routing doctrine for the errand era. Errand Enablement shipped the cheap
isolated-branch primitive; this WU updates the doctrine that primitive obsoletes. Two faces of one thesis,
both landing in `DEV-RULES.ARC § Leave it cleaner`: **deferred-capture routing** (capture surfaces become
transient write-deferral buffers; the drain moves off the integration ceremony into a between-WU `arc-housekeep`
flow) and **execution-incidental routing** (the opportunistic "rider" pattern retires in favor of errands).
Delivers the doctrine plus the `arc-housekeep` mechanism that makes it operational.

- **State:** Draft — active planning (in-place WU on `plan/work-routing-discipline`, 2026-05-29). Spawned
  post-errand-enablement while triaging the deferred USER-INBOX drain, whose repeated deferral exposed that the
  inbox/drain model predates errands and no longer fits.
- **Created:** 2026-05-29
- **Origin:** [internal] — surfaced diagnosing why the USER-INBOX / shared-inbox drain discipline stopped
  happening (deferred at Worktree Foundation and Errand Enablement integrations, then re-deferred as a single
  post-errand-enablement sweep). Root cause is two-layered: **process** (the drain lives in the most-deferrable
  slot of the most-PR-pressured ceremony, with no forcing function) and **design** (the whole capture/drain
  model is a pre-errand workaround that errands obsolete).

---

## Problem / Motivation

Capture surfaces exist to manage one thing: **isolation friction.** A capture is a write you could not make yet
without violating one-WU-per-branch isolation — you are on branch X and notice something about artifact Y, so
you defer the write rather than pollute X's branch/PR. The inbox is a **write-deferral buffer**, nothing more.

Two failures compounded:

1. **The drain stopped happening.** `integrate-work-unit` Step 10 (USER-INBOX → shared flush) was deferred at
   WOR integration to keep an already-large PR lean, re-deferred at errand-enablement kickoff, and skipped again
   at errand-enablement's own integration. The invariant "a WU begins with an empty USER-INBOX" is
   **unenforced** — nothing gates it — and the drain sits in the heaviest ceremony's most-deferrable slot. Soft
   step + max PR pressure + no forcing function = it gets skipped, and skipped ceremonies compound (each defers a
   bigger backlog, lowering the odds the next one runs).
2. **Routed concerns rot in purgatory.** The model has only one eager absorption path: into the WU *being
   activated*, for items scoped to *that* WU. A capture that names a *different, already-existing* stub has no
   eager home — it waits for that target's own planning-kickoff. The result: a WU's stub is **not** authoritative
   on its own domain, because some of its concerns sit in inboxes elsewhere.

Both are symptoms of a deeper fact: the capture/drain model was built **pre-errand**. Back then, "write to Y
while on branch X" was genuinely impossible, so capture-to-inbox + drain-at-ceremony was the only tool, and the
inbox became load-bearing for *routed* work. Errand Enablement shipped the missing primitive — a cheap isolated
branch that *can* make that write now, auto-merging on the planning lane — so the inbox's load-bearing role
evaporated, and the doctrine has not caught up.

## Thesis and core invariant

> A WU's stub/draft is the single authoritative source for its domain concerns. Capture surfaces are transient
> buffers, never authoritative. **No item with a known home may rest in a capture surface.**

Stub authority is the thing the whole discipline protects. If routed concerns linger in inboxes, no stub can be
trusted to hold all of its domain's known concerns. Capture surfaces are explicitly *not* authoritative — they
hold only the genuinely homeless.

## Model — deferred-capture routing

### Capture decision (at the moment of noticing X)

| X is… | Can you write its home now? | Action |
| --- | --- | --- |
| This WU's own concern | Yes — your branch | Inline / task. **Never capture.** |
| Another *existing* artifact (a WU stub, strategy, ADR) | No on your branch — **yes via errand** | Errand to it (now if urgent / target in-flight; else batch to WU-end) |
| A *new* unit, scope emerged | No — does not exist | Graduate to a stub |
| Genuinely homeless / undecided | No — no home exists | Capture (the only legitimate inbox resident) |

**Discovery re-triage.** The home can be discovered *after* capture. Draining is not only "flush by section" —
it re-evaluates each entry; any that now have a known home leave the buffer for it.

### Drain timing and ownership

- **Between-WUs (primary sweep).** The lowest-isolation-cost moment — no active branch blocks anything. Routed
  captures errand to their homes; scope-emerged captures graduate to stubs; genuinely-homeless captures flush to
  the shared inbox for project visibility. INBOX.USER ends empty. This is `arc-housekeep` (below). It lives
  **off** the integration ceremony.
- **WU-start (backstop + forcing function).** Session-init checks INBOX.USER for routable entries and **soft-
  offers** housekeep (see below). Activation-absorption *from INBOX.USER* becomes the degenerate case — by the
  time a WU activates, its concerns are already in its stub. Absorption *from the shared inbox* (homeless items
  whose home turns out to be this WU) stays legitimate.
- **Planning-kickoff (home-discovery for the homeless).** When a WU's planning starts, shared-inbox items that
  belong to it pull into its plan. Unchanged.

### Surface roles and the bucket trajectory

The axes that sort all of this are load-bearing — **committed vs uncommitted**, **atomic vs multi-step**,
**personal vs shared**. The redundancy is a fourth, weak axis (**maturity/structure**): there are three surfaces
for `{multi-step, uncommitted}` — personal §Backlog, shared BACKLOG-INBOX, and `provisional/` stubs — differing
only by scope and bullet-vs-directory.

- **INBOX.USER** — personal, transient write-deferral buffer. **Flatten to a single list** (entries may carry an
  optional character tag; housekeep classifies authoritatively at drain). Sorting at capture is premature
  cognitive load on a buffer emptied every WU-end. Trends to empty.
- **Shared project inbox** — project-visible holding for *homeless-but-acknowledged* items awaiting a home.
  Drained on home-discovery (errand / graduate / pull-in at kickoff).
- **WU stubs** — authoritative domain home. Fed continuously by errands; fed at kickoff from the shared inbox.

**Bucket trajectory (4 → 3 → 2):** today's four inbox buckets (USER §Atomic/§Backlog + ATOMIC-INBOX +
BACKLOG-INBOX) collapse to **three now** (single-list INBOX.USER + the shared inbox's two character sections) and
**two eventually** (atomic-only shared inbox; multi-step folded entirely into `provisional/` stubs). The full
collapse depends on **cheap-stub-creation tooling** (Agile WU Lifecycle's `arc start` create-new mode) — until
that lands, a thin multi-step holding section is the pressure-relief valve for embryonic-multistep-homeless
items. Do not force the collapse before its enabler exists. Note: this **conflicts with `doc-naming-convention`**,
which (pre-errand) settled a symmetric two-section INBOX.USER / INBOX.PROJECT; see Coordination.

**Holding ≠ commitment.** Inbox entries are *uncommitted holding* (no staleness pressure). An entry becomes an
errand only at the moment of commitment; `ERRANDS.md` is the *committed* queue that drains by execution and is
staleness-checked. A fuller atomic inbox does not mean more stale errands.

## Model — execution-incidental routing (anti-rider)

Errands obsolete a second pre-errand workaround: the **opportunistic rider** (folding a distinct concern into a
WU because you happen to be touching the same files). The only thing that ever justified a rider was branch/PR
overhead; post-errand that overhead is gone, leaving pure cost (concern-mixing, a PR that no longer represents
one logical intent). **Codify against riders.** The distinguishing test is **concern-identity, not
file-identity**:

- **Same-concern micro-cleanup** in a file you are already editing (a typo, a lint fix, improving the artifact
  you are working on) → **inline, always fine.** This is genuine "leave it cleaner"; it was never a rider.
- **Distinct concern** that merely shares a file/surface → **errand, never ride.**

This does not reintroduce errand-proliferation: the frequent case (same-concern) stays inline; the infrequent
case (distinct-concern) errands and drains by execution.

## The `arc-housekeep` mechanism

The operational form of the between-WU drain. Matches ARC's codified skill/workflow split (`arc-commit` →
`prepare-commits`, `arc-session` → `session-init`): a **thin `arc-housekeep` skill** dispatches a **drain/route
workflow** carrying the logic.

- **Preconditions: primary worktree + no active WU.** Draining writes to shared paths (stubs, shared inbox,
  `ERRANDS.md`) that belong on the primary tree's base branch, never a WU worktree. Mirrors the Errand
  cold-entry constraint.
- **Logic:** read INBOX.USER → classify each entry (existing-stub home? new stub? atomic errand? homeless?) →
  route via a batched drain → INBOX.USER ends empty. Also surface the `ERRANDS.md` staleness sweep while there.
- **DRY across two entry points:** the standalone `arc-housekeep` skill, and `session-handoff`'s between-WUs
  path. One workflow, two doors.
- **session-init integration = the soft-gate, made concrete.** An `inboxState` / `housekeepNeeded` probe field
  (routable count in INBOX.USER) lets the Orient/between-WUs arm carry a **third intent** beside discovery and
  errand: *"No active WU. INBOX.USER: N pending — housekeep?"* A suggested action, not a nag (decision: soft-
  encourage, never hard-block). The forcing function and the housekeep offer are the same mechanism.

Define housekeep's routing against the **logical** model (entry · character · home), not the markdown format, so
`operational-state-docs`' later structured-record swap does not break it.

## Lifecycle-workflow deltas

- **`integrate-work-unit` Step 10 → removed.** The drain leaves integration. Today it is bundled into the
  integration commit — exactly why it is skipped under PR-leanness pressure. Now integration ships only the WU;
  the drain is a separate post-integration housekeep flow. The failure mode is **structurally designed out**,
  and the session-init offer ensures the now-separate drain still happens.
- **`activate-work-unit` Step 6 → reframed.** Absorption from INBOX.USER is degenerate (empty post-housekeep);
  absorption from the shared inbox stays. Narrow the step accordingly.
- **`session-init` → gains** the `housekeep` intent + the `inboxState` probe field + the soft-offer.
- **`session-handoff` → gains a dedicated between-WUs path** (folds USER-INBOX §Atomic item): no SESSION-NOTES
  write (no active-WU subdir), no meta commit, review WORKING-MEMORY removals, **offer housekeep if captures
  pending**, sync, confirm. Wires to the shared drain logic.
- **`init-work-unit` → warns** (backstop): invoked with a non-empty INBOX.USER, emit a non-blocking "starting
  new work with N pending captures — consider housekeep first." Init, not activate — init is the begin-new-WU
  moment the invariant targets; activate is mid-WU.
- **`DEV-RULES.ARC § Leave it cleaner` → rewritten** for both faces of the thesis (capture routing table +
  anti-rider). **Strategies** (`planning-module` §Inbox Family / §Ceremony-Only Writes / §How Work Flows;
  `work-organization` §Incidental Work Model; `session-operations` §USER-INBOX) → aligned.
- **Templates** (inbox shapes) + **`parseUserInboxSection`** parser → reconciled to the flattened shape (folds
  USER-INBOX §Atomic item; the template↔parser mismatch must be fixed onto the managed-entry grammar anyway).
- **CLI** → the `inboxState` probe slot.

## Scope

### In scope

1. The errand-era work-routing doctrine — both faces — codified across the surfaces above.
2. `arc-housekeep` skill + drain/route workflow + the session-init probe field/offer + the `session-handoff`
   between-WUs path + the `init-work-unit` backstop warning.
3. INBOX.USER flatten-to-single-list; the shared-inbox role sharpening; the bucket trajectory (with the AWL
   collapse-gate noted, not forced).
4. The `parseUserInboxSection` ↔ template reconcile onto the managed-entry grammar (mandatory consequence of the
   reshape).
5. The graduation-threshold codification (USER-INBOX §Backlog item — the "bypass the inbox, make a stub
   directly" threshold; here it becomes the bucket trajectory).
6. Three forward-compat write-backs (Coordination): `doc-naming-convention`, `operational-state-docs`, the CWC
   de-scope.

### Out of scope

- **File renames** (`USER-INBOX → INBOX.USER`, the `ATOMIC/BACKLOG → INBOX.PROJECT` collapse, section renames) —
  `doc-naming-convention` owns these; we land shape + behavior on current names and write back. Full doc-surface
  uniformity waits for that WU.
- **Structured-record storage** for the inboxes — `operational-state-docs` (Move B), downstream of
  `cli-substrate-adoption`. We stay markdown-canonical and keep the shape schematizable.
- **The general errand↔PR packaging convention** — see Open Questions; durable home is likely Concurrent Work
  Conventions. We adopt an interim working answer for housekeep only.

### Folded captures (from the inbox triage that spawned this WU)

- USER-INBOX §Atomic: *dedicated between-WUs path in `session-handoff`* — built here.
- USER-INBOX §Atomic: *reconcile USER-INBOX template↔parser* — mandatory consequence of the reshape.
- USER-INBOX §Backlog: *codify the inbox→stub graduation threshold* — becomes the bucket trajectory.

## Coordination

- **`doc-naming-convention` (write-back + conflict reconcile).** Its pre-errand design keeps a symmetric
  two-section INBOX.USER / INBOX.PROJECT and pre-rejects restructuring ("growth is a drain-discipline signal").
  Reconcile: that is the correct *pre-AWL* shape; ours is the *post-AWL* shape — same trajectory, separated by
  cheap-stub tooling. Write back: flatten INBOX.USER to a single list; mark the multi-step shared section
  deprecating-to-atomic-only post-AWL; note the `Backlog → Work Unit` section rename may be moot for a section
  being deleted. The file/section *renames* stay that WU's job.
- **`operational-state-docs` (write-back).** Killing the multi-step shared section and flattening INBOX.USER
  *removes a surface/section* from its managed-doc member list — a simplification. The interim
  `parseUserInboxSection` fix here should adopt the slug-keyed managed-entry grammar so OSD's structured-record
  swap is clean. Subsumes the USER-INBOX "structured-storage + routed-write" capture (that stays OSD's).
- **`concurrent-work-conventions` (de-scope).** CWC's charter already owns the isolation doctrine ("capture
  surfaces are for not-yet-actionable pointers only; stub-ready or non-trivial work goes to its real home
  directly"). This WU pulls that slice forward (the pipeline must be trustworthy before `in-flight-awareness`),
  leaving CWC its concurrency-gate / merge-ordering / stacked-PR remainder. Also the likely durable home for the
  errand↔PR packaging convention (Open Questions).
- **`handoff-optimization` (coordinate).** Owns SESSION-NOTES content/template cleanup (the "Working On" field,
  the post-WOR drift). Our between-WUs `session-handoff` path defines *when* SESSION-NOTES is/isn't written (not
  written with no active WU) — same file, adjacent concern. One coordinated sweep.
- **`composable-workflows` (consume interim).** Our new cross-file workflow references (session-init ↔ housekeep
  ↔ session-handoff) use stable heading-slug anchors, never ordinal `Step N` refs, per the interim convention
  that WU will later codify.

### Routed elsewhere (not folded — recorded so they reach their homes)

- *H1 styling for the inbox/memory file family* (ATOMIC-INBOX) → `doc-naming-convention` (rides its rename
  cascade — guaranteed touch).
- *Archival ceremony tooling doesn't accommodate the post-sweep state* (BACKLOG-INBOX) + its duplicate facet
  *`arc release commit`/`push` refuse the archival commit* (USER-INBOX §Atomic) → **dedup into one entry;** out
  of our domain (archival-ceremony mechanics). Splits at drain — the wrapper-refusal facet plausibly →
  `interlock-release-refinement`; the hook + `archive-work-unit` facets are a separate archival-tooling concern.
- *Incidental-scope marking + the post-errand fold-vs-errand bar* (the meta-gap that surfaced the anti-rider
  rule) → under anti-rider the "rider-marking" half is moot; what remains is the inline-vs-errand rule, which is
  in-thesis here. The general meta-observation is captured, not separately tracked.

## Dependencies and sequencing

- **Errand Enablement** (shipped) — the cheap-branch + advisory-gate + auto-merge-lane primitives this doctrine
  rests on. Conceptual basis, not a blocking dependency.
- **Intended before `in-flight-awareness`** — so that WU starts from a clean, trustworthy capture pipeline.
  Soft sequencing preference, not a hard dependency (IFA does not block on this).
- **Agile WU Lifecycle** (downstream) — its `arc start` create-new mode is the enabler that retires the thin
  multi-step shared section (the 3 → 2 bucket collapse). This WU lands the trajectory; AWL completes it.
- **Two-component delivery:** (a) codify the doctrine + build housekeep; (b) clear current state by running the
  new housekeep flow against the real backlog. Component (b) is the first live run of (a) — the cleanup *is* the
  validation.

## Merge-lane interaction

The housekeep drain writes across the shipped auto-merge lane's classification (`strategy-work-organization`
§ Auto-Merge Lane), so the codification must say how. Three settled points plus one carve-out.

- **A drain is one PR *per lane* — not one per sweep, nor one per destination.** Routing to planning grooming
  (`draft-*`, `meta-*`, `tasks-*`, `notes-*`, `cohort-*` under `active/`|`backlog/`) auto-merges; routing that
  touches a reviewed-lane surface rides a separate reviewed PR. Per the research (review-coherence governs PR
  scope, not destination count or a fixed ratio), the grooming bulk is one coherent operation with uniform
  reviewer competence → one auto-merge PR; lanes never mix in a single PR.
- **A new *provisional* stub auto-merges.** It is `meta-*`/`draft-*` under `backlog/` — auto-merge prefix, no
  design authority. (A *planned* stub regenerates ROADMAP, historically reviewed — see the threshold.) So
  drain-created stubs auto-merge; the "new stub = never auto-merge" worry is unfounded and contradicts the rule.
- **The review threshold is principled, not path-blanket.** A planning-artifact change needs review iff it:
  (1) touches a **foreign owner's** artifact — *any* state, not only in-flight (ownership/stewardship: routing a
  concern into someone's draft reshapes their planning; the in-flight qualifier adds *concurrency* coordination
  on top, but ownership is the gate); (2) carries **design authority** (`spec-*`/`prd-*`); (3) hits a
  **constitutional** surface (rules/ADRs/strategies); or (4) is an **unverifiable hand-edit of a derived
  surface** — a *sunset* trigger that fires only while that surface is hand-maintained. Otherwise auto-merge.
  Once a renderer produces the surface with a verify-against-source check (`roadmap-tooling` for ROADMAP,
  `operational-state-docs` for the managed surfaces), the derivation is verifiable and #4 dissolves → it
  auto-merges. So a ROADMAP regen rides the reviewed lane *now* (interim hand-edit) but auto-merges
  *post-roadmap-tooling*; the same sunset applies to every managed/derived surface. (The lane classifies the
  PR that carries a change — an errand's PR, a WU's integration PR — so a ROADMAP-touching errand is reviewed
  today, auto-merge once the render is verifiable.)
- **Carve-out — housekeep's own/homeless writes auto-merge.** A homeless-flush to the shared inbox and a
  disciplined ROADMAP regen trip none of the four (no owner, no authority, not constitutional; the ceremony's
  discipline / a regen-matches-source check stands in for #4). The shared inbox's blanket reviewed-lane status
  is a pre-owner-gate proxy; housekeep's discipline + optional *notification* (not gating) + git audit replace
  it. `operational-state-docs` strengthens this — render-from-record makes these surfaces verifiable by
  construction.

**Coordination.** The general owner-graded merge doctrine (CODEOWNERS-from-`**Owner:**`) stays CWC's — but note
*for* it that both the shipped advisory gate *and* CWC's planned owner-gate key on *in-flight*, whereas the
stewardship concern (point 1) argues for gating *dormant* foreign edits too: a refinement up to CWC, with
review-vs-notification and granularity (substantive routing vs trivial fix) as sub-questions. Derived-surface
verification coordinates with `roadmap-tooling` / `operational-state-docs`. This WU adopts the interim; those
WUs generalize.

## Open Questions

- **Errand↔PR packaging — resolved (research-informed).** Batch by **review-coherence**, not destination count
  or a fixed ratio (mature practice gates PR scope by what one reviewer of uniform competence can certify as
  coherent). A planning-doc routing sweep is a coherent operation → **one auto-merge PR per drain** (chunked
  only for review-reachability if very large); **code-errands stay 1:1**; **lanes never mix**. See § Merge-lane
  interaction. The general two-lane convention routes to CWC for durable codification.
- **Strict-empty INBOX.USER — resolved.** Strict-empty is the target state housekeep nudges toward (flush even
  homeless items to the shared inbox at WU-end; trivial emptiness gate), with the thin multi-step shared section
  as the homeless-multistep valve, converging to "fold homeless-multistep into cheap provisional stubs once AWL
  lands."
- **Bucket-collapse AWL-gating — open.** Confirm the 3 → 2 collapse (retire the thin multi-step shared section)
  is gated on AWL's cheap-stub tooling, and pin the exact trigger.
- **Merge-lane sub-questions — open (settle at spec; coordinate with CWC).** (a) Is housekeep a *reviewed*
  ceremony for the shared inbox, or does its discipline earn auto-merge there? Lean auto-merge. (b) For
  foreign-owner edits: review (approval-to-merge) vs notification, and granularity (substantive routing vs
  trivial fix).
- **Name — resolved.** `work-routing-discipline` (broad concern, both faces); standalone (no cohort).

---
