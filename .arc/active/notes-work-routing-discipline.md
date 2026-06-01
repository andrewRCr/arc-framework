# Notes: Work-Routing Discipline

Reference detail for task generation and execution: pre-decided concrete artifacts (verbatim section preambles,
the capture decision table, entry-grammar subtleties), design rationale the spec abstracts, and routing records
for concerns whose home is elsewhere. Cross-reference by filename + section heading from task descriptions
rather than re-deriving — the wording below is settled, not to be reinvented.

> **Naming — current vs. target.** This WU lands shape + behavior on the **current** file/section names; the
> renames are owned by `doc-naming-convention` (its draft § Renames) and are out of scope here. The design text
> below uses the **target** vocabulary for clarity — when authoring concrete edits, map to the current names:
>
> | Target (design vocabulary)     | Current (use in edits)                                                   |
> | ------------------------------ | ------------------------------------------------------------------------ |
> | `INBOX.USER`                   | `USER-INBOX.md` (`user/{identity}/`)                                     |
> | `INBOX.PROJECT`                | `ATOMIC-INBOX.md` (the surviving shared inbox; `BACKLOG-INBOX` retired)  |
> | `## Work Unit` (section)       | `## Backlog` (the current multi-step section in `USER-INBOX`)            |
>
> So the `## Work Unit` preamble below lands under the current `## Backlog` heading — same behavioral text, the
> lead word adapts. `USER-INBOX` already carries `## Atomic` / `## Backlog`, so this WU sharpens their preambles
> and adds the `WU_Target` grammar rather than creating the sections.

## Contents

- [Errand-model re-pivot (supersedes pre-pivot errand/queue refs below)](#errand-model-re-pivot)
- [Drain-mechanism correction (surfaced at first live run)](#drain-mechanism-correction)
- [Drain integration-mode (Inbound Buffer; surfaced at the live run)](#drain-integration-mode)
- [Inbox section preambles (verbatim — do not re-derive)](#inbox-section-preambles-verbatim--do-not-re-derive)
- [Capture decision table (verbatim)](#capture-decision-table-verbatim)
- [Entry-grammar subtleties](#entry-grammar-subtleties)
- [Drain timing and ownership](#drain-timing-and-ownership)
- [Surface roles — rationale](#surface-roles--rationale)
- [Merge-lane reasoning detail](#merge-lane-reasoning-detail)
- [Coordination write-back specifics](#coordination-write-back-specifics)
- [Routed elsewhere (records, not folded into this WU)](#routed-elsewhere-records-not-folded-into-this-wu)
- [Folded-capture provenance](#folded-capture-provenance)

## Errand-model re-pivot

> **Supersession.** This section reflects the corrected model (spec § Errand-model re-pivot, R24–31;
> ADR-021 Amendment 2026-05-31). Where the sections below mention the `ERRANDS.md` *queue* or a
> capture-flavored `arc-errand` (Capture decision table, Drain timing, Express lanes), read them as
> superseded: the queue retires, capture is inbox-only, and errands are execution-only. The reasoning
> in those sections about *capture/routing* (the inbox, the drain, the merge lane) still stands — only
> the errand *mechanism* changes.

**The fault.** Codifying the doctrine exposed that the errand *queue* is itself a capture surface holding
execution-bound items — the dual of the core invariant ("no known-home item rests in a capture surface"). A
committed errand's home *is* execution, which is writable now; letting it rest in a queue is exactly the smell
the invariant forbids, and the queue needed a bolted-on staleness sweep to keep it from rotting. The queue's
`chore/<slug>` key was also `branch.protection: full`-shaped (under partial an errand is a direct base commit,
no branch).

**The model.** An errand *is* its execution — `chore/<slug>` (full) / direct base commit (partial), tracked by
git history + the `standalone (...)` footer. **No queue, no `errand-*` file, no State field.** State is
*derived*: active = a `chore/` branch with no PR; awaiting-merge = an open PR; done = merged (teardown). Capture
is **inbox-only** — a committed-near-term errand-class concern is a reminder-flagged `§ Atomic` capture (entered
via `arc-inbox`), executed later.

**Orphans can't hide.** Every errand artifact is attached to a surface a sweep already sees — a notes-synced
inbox entry or a pushed branch — never a free-floating file. So an abandoned errand is a dangling `chore/`
branch (swept at orient), and a forgotten capture is a stale inbox item (swept at housekeep). Cross-session /
cross-machine continuity rides those two synced artifacts: the inbox entry (goal, retained until completion) +
the pushed branch commits (progress); handoff = `commit WIP + push`, resume via the Materialize arm extended to
`chore/` remote branches. No SESSION-NOTES for an errand.

**The shape.** One `run-errand` workflow (Launch → Execute → Integrate, re-enterable), dispatched by
`arc-session` (`--errand <blurb|slug>` or discovery), honoring the Review-Increment Invariant directly — *not*
`process-task-loop` (no task list). Launch resolves base and relocates the locus itself (reusing
`resolvePrimaryWorktreePath`), so launching from any worktree works. Integrate removes the slug-matched inbox
entry at **completion** (not start). Scope explosion → promote-to-WU via `init-work-unit`. The capture entry
point is `arc-inbox` (model-first: hand-managed markdown now, `operational-state-docs`' managed-write CLI later
— the `ROADMAP`-before-its-renderer pattern); `arc-session` stays the sole *execution* entrypoint. Net skill
ledger: retire `arc-errand`, add `arc-inbox`.

**Doc-boundary divide (the `arc-inbox` value).** Ambient always-relevant discipline (the routing decision, the
core invariant, holding-vs-execution) stays in `DEV-RULES.ARC § Discovered Work Routing` for pre-invocation
awareness; actionable construction specifics move into the `arc-inbox` skill; the inbox templates clean down to
surface-only.

## Drain-mechanism correction

> Reasoning behind spec `§ Drain-mechanism correction` (R32–R37), surfaced by the Phase 6 dry run (Task 6.1) and
> landing as remedial Phase 5.R. Records what the spec abstracts — chiefly *why* the corrections are what they
> are — so 5.R.2–5.R.5 cite settled reasoning rather than re-deriving.

**The fault.** `drain-inbox` as built (Phase 3) classified-then-routed in one uninterrupted pass: no
plan-confirmation gate, the atomic-errand route assumed commitment rather than eliciting it, execution
interleaved with routing, no at-drain tier re-triage, no grouping for homeless multi-step. The first live
classification of `andrew`'s real backlog (≈26 entries vs. the ≈17 estimate) exposed all five at once — and that
the volume itself needed a chunking answer.

**The execute path is by design, not an accident — but under-structured.** Spec R9 + this notes file's
§ Drain timing always had the drain dispatch standalone atomic *execution* via an errand at the low-isolation
between-WUs moment; § Holding ≠ commitment always located the commitment decision "at drain when housekeep
promotes a now-committed entry." So the drain *is* meant to execute atomic work. What was missing is the
**commitment gate** (the workflow assumed it) and the **phase separation** (the workflow interleaved it). The
real inconsistency is narrower: route-3 dispatching errands *inline* sits in tension with "`arc-session` is the
sole *top-level* execution entrypoint" (R29). Phase-separating execution into a transition that re-enters
`run-errand` is what restores that consistency — execution flows back through the one top-level door, as a
distinct tail.

**No coupling to session-init's errand arm.** `run-errand`'s Launch self-resolves its own locus via the shared
write-context primitive (`arc housekeep check --json` → `baseBranch` / `primaryWorktreePath` — the *same*
primitive the drain uses), so a drain → `run-errand` transition in-session has zero data dependency on having
entered through session-init. "Sole *top-level* entrypoint" means there is no standalone `arc errand` command —
*not* that `run-errand` has a single internal caller. Both transition-now and end-drain-then-fresh-`--errand`
are valid; the choice is the user's, on context budget, never structural.

**`arc-inbox` is not at fault for the mis-tiering.** Capture is character-only by design (atomic vs. multi-step);
tier and finer home are *drain-time* resolutions, and `DEV-RULES.ARC § Task Execution` already promises the
atomic-tier infra reclassification happens "at drain." Most current mis-tiered `§ Atomic` entries are *legacy*
(flat-shape captures predating `arc-inbox` and the two-section reshape). The fix is the missing **drain**
re-triage step (R33), optionally a light capture-time nudge — not hardening capture (capture must stay cheap).

**Escape-hatch — retained-marker resolved (`_Hold:_`).** Retention (R36) takes a distinct drain-set boolean
`_Hold:_`, not a reuse of `_Remind:_` (which means *nudge-until-drained* — reusing it would make every flagged
capture wrongly skip the housekeep offer, inverting the forcing function). `_Hold: true` excludes the entry from
`inboxState.housekeepNeeded`, so a deliberately-kept capture stops re-triggering the **Orient-time** housekeep
soft-offer — which is *not* daily-rate-limited (it fires on each between-WU orientation), unlike the reminder
nudge. Anti-rot rides the reminder sweep (`_Remind || _Hold`), which *is* once-per-calendar-day rate-limited.
Retaining re-stamps `_Created:_` to the retain date, so the existing reminder floor (never same-day) gives
"never reminded the day you held it" for free. Drain-time field → `arc-inbox` untouched; ripple is parser +
`inbox-state.ts` (exclude) + `inbox-reminders.ts` (include) + the `operational-state-docs` schema write-back.
Open only at the trivial level: the field name (`_Hold:_` vs `_Retain:_` / `_Keep:_`).

**Forward-compat (composable-workflows) — seams only, no machinery.** Author `drain-inbox` as a mode/tier-agnostic
routing spine plus a *whole* protection-mode write-mechanics block and a *whole* execution-transition block, each
liftable later without restructuring (the extraction rule: whole conditional blocks extract, intra-step branches
stay inline). The directory reshape / core-fragment boundary is `composable-workflows`' unresolved central
problem — build no fragment files or load machinery here. Stable heading-slug anchors for cross-workflow refs;
the new confirmation interlock takes a plain heading slug, **not** the extension fire-point `· #name` marker
(that marker is pre-commit-validated against `system/extensions/<name>.md`; misuse trips CHECK 16).

## Drain integration-mode

> Reasoning behind spec `§ Drain integration-mode` (R38–R39), surfaced by the Phase 6 *live* run (Task 6.1)
> routing into real, foreign-owned drafts. Records why routing gained a two-mode rule and the `Inbound Buffer`
> landing zone, and why the floor folds here while the ceiling offloads.

**The gap.** R8–R9 said routing writes the note "straight into" the stub but never said *how*. The live run
exposed two failure modes in holistic-by-default integration: it is **costly** (reading and reworking each
bespoke foreign draft does not scale across a sweep) and an **ownership overstep** — weaving a note into a
draft's scope is a design act the owning WU should perform at its next iteration with full context, not the
drainer ad hoc. Same category as the gated-phased correction: a mechanism-completeness gap surfaced by
dogfooding, not new scope. A *work-routing* WU cannot ship a drain whose terminal step is under-specified.

**Why `Inbound Buffer`, not `Inbox`.** The buffer holds only items already **routed to this WU as their home**
(no longer foreign), and the forcing function keeps them in **transit, never at rest**. That transit-not-rest
property is exactly what keeps it clear of `DEV-RULES.ARC § Planning artifacts aren't capture surfaces` — so the
name must *reinforce* it. "Buffer" does; "inbox" signals capture-and-hold and would reopen the very question the
buffer closes. "Inbound" names the feeder direction (the drain plus other routing) without baking in one feeder;
the per-entry `routed from <origin>` provenance carries the specific source.

**Floor folds, ceiling offloads.** The minimal floor that closes the pipeline lands here: the two-mode rule in
`drain-inbox § 5`, the `## Inbound Buffer — Pending Integration` convention, and the forcing-function hook at the
existing draft→PRD moment (`1_create-spec.md` Step 1; `2_generate-tasks.md` is downstream of that absorption, so
it needs none). The richer iteration-time ceremony — a first-class buffer-drain step in the conductor's refine
loop that supersedes the minimal hook — is **`arc-plan-conductor`'s**, routed there as a capture at this drain:
it is design-bearing and its domain.

**Placement.** The section is an interstitial after the Origin/Purpose metadata block, set off by `---` rules —
visually *buffered* between header and body, and high-visibility so the owner sees pending items on opening the
draft (the forcing function depends on that). Created on demand by the drain; a standard empty template slot is
an optional later add, not the floor.

## Inbox section preambles (verbatim — do not re-derive)

The one-line destination-preamble callouts that land under each `INBOX.USER` section heading. Headings stay the
stable character token (`## Atomic` / `## Work Unit`) — the anchor and reference key; routing destinations live
in the preamble (they evolve, and compressing them into the heading invites imprecision — e.g. "born
provisional" is wrong: most stubs start `planned/`).

> *Atomic — Single-step captures. Drain to execution — folded into a WU (inline absorption), or run as an errand
> via `arc-session --errand`, from the primary worktree's base, never a WU branch.*
>
> *Work Unit — Multi-step captures bound for a backlog stub. Route to an existing stub, or graduate to a new
> one — directly at housekeep; `arc-session --errand` only if needed mid-WU. Carries `WU_Target` (TBD ok); an optional
> `(planned|provisional)` parenthetical sets a new stub's dir (decided at drain if omitted).*

The **shared inbox** (`ATOMIC-INBOX`, atomic-only) uses only the `## Atomic` heading + its preamble — there is
no Work-Unit section there, ever.

## Capture decision table (verbatim)

The capture-time call is just *inline / errand-now / inbox-defer* — an urgency × isolation judgment. The finer
destination (existing stub · new stub · standalone errand · flush to shared) is a **drain-time** resolution,
not a capture-time one.

| X is…                       | Safe to write its home now?   | Action                                                                |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| This WU's own concern       | Yes — your branch             | Inline. **Never capture.**                                            |
| Anything else, and urgent   | No — needs isolation now      | **Errand** now (executes a fix, or writes the note into its stub)     |
| Anything else, not urgent   | No — defer the isolated write | **Capture to INBOX.USER**; housekeep routes it at its next drain      |

**Transit lounge, not resting place.** `INBOX.USER` holds known-home and homeless items alike — but only because
housekeep drains it *every* WU. A known-home item may **transit** the personal inbox; it may never **rest** in
the shared inbox, which has no forcing drain. That distinction keeps the core invariant true rather than
aspirational.

**Discovery re-triage.** The home can be discovered *after* capture. Draining is not only "flush by section" —
it re-evaluates each entry; any that now have a known home leave the buffer for it.

**Express lanes, never forced.** The inbox is the always-available, zero-friction default — and because both
`INBOX.USER` and `ERRANDS.md` live under gitignored `user/{identity}/`, *queuing* to either is equally free
mid-task on any branch (neither touches the tracked tree or the current PR). What costs isolation is *execution*
— running an errand, creating a stub — never capture. So "no bandwidth right now" never forces the inbox to save
cost; it only defers the routing *decision* to the drain, which is reliable. Take an express lane — the errand
queue for atomic work, a stub for multi-step — when you already hold the commitment and it's worth the execution
cost; otherwise capture and let housekeep route it. Nothing is lost either way.

## Entry-grammar subtleties

Beyond the grammar stated in the spec — the load-bearing edge rules:

- `WU_Target: <slug> (planned|provisional)` — the parenthetical is a **new-stub dir hint only**; ignored if the
  target already exists (its dir is a fact, not a capture-field assertion — housekeep may surface the mismatch).
- **No `new` keyword:** existence-at-drain decides route-vs-create, so the grammar never asserts novelty.
- `Atomic` entries take no `WU_Target`.
- The mental-model coherence lives in the *uniform entry grammar shared across both inboxes*, not in identical
  sections — that is why the asymmetric section shapes (two vs. one) are not a contradiction.

## Drain timing and ownership

Three drain points, each with a distinct owner and judgment:

- **Between-WUs (primary sweep).** The lowest-isolation-cost moment — the base branch makes shared-planning
  writes native. Routed captures go **directly** to their homes (stub edits written straight in; standalone
  errands for atomic execution); scope-emerged captures graduate to stubs; genuinely-homeless captures flush to
  the shared inbox. `INBOX.USER` ends empty. This is `arc-housekeep`, and it lives **off** the integration
  ceremony.
- **WU-start (backstop + forcing function).** Session-init checks `INBOX.USER` for routable entries and
  **soft-offers** housekeep. Absorption *from `INBOX.USER`* is the degenerate case (empty post-housekeep);
  absorption *from the shared inbox* (homeless items whose home turns out to be this WU) stays legitimate.
- **Planning-kickoff / activation (home-discovery for the homeless).** Shared-inbox items whose home is *now
  discoverable* as this WU pull into it. This is a **discovery judgment** ("does this homeless item belong to
  me?"), not a `WU_Target` field-match — a known-target item would never be in the shared inbox to begin with.

**Execution ≠ routing.** The "execution via `arc-errand`" rule governs *executing atomic work*. Routing a
multi-step note to its stub is **not** execution: between-WUs, housekeep writes it **directly** to the stub on
its own auto-merge branch — never inbox→`ERRANDS.md`→stub. A mid-WU errand is the *only* time note-routing needs
isolation; even then the content moves inbox→stub in one step and the `ERRANDS.md` line is an audit record, not
a resting home.

## Surface roles — rationale

The load-bearing axes: **committed vs uncommitted**, **atomic vs multi-step**, **personal vs shared**. The two
inboxes are *not* symmetric in shape, and that asymmetry encodes a real principle — each exists for a different
job:

- **`INBOX.USER`** exists for **branch-safety deferral**: it must hold *every* character you can't safely write
  right now, so it keeps **two sections** (`Atomic` / `Work Unit`). Picking one of two sections is trivial
  friction and a useful forcing function — the section *is* the routing fate. Survives post-AWL too: mid-WU you
  still can't create a stub from a WU branch, so the Work-Unit transit lounge stays.
- **Shared inbox (`ATOMIC-INBOX` → later `INBOX.PROJECT`)** exists for **homeless-only visibility**: it holds
  only what has *no* better home. Multi-step work *always* has a better home (a stub), so it is **atomic-only
  from day one** — the absence of a Work-Unit section is itself the statement "make a stub." Drained by **pull**
  at ceremonies (it can't push-drain — homeless items have nowhere to push *to*), not by housekeep.
- **WU stubs** are the authoritative domain home — fed by errands (mid-WU), by direct housekeep routing
  (between-WUs), and at kickoff by pull-in from the shared inbox.

**Why no transitional multi-step valve.** A shared Work-Unit append and a `provisional/` stub are the *same*
base-branch write behind the *same* isolation, so a valve never saved isolation cost — only meta-file authoring
effort, which `arc start`'s create-new mode erases anyway. The valve is pure redundancy with `provisional/`
stubs (already the project-visible home for under-evaluated multi-step), so it is cut now, not carried until
AWL. Homeless multi-step parks free in `INBOX.USER` § Work Unit and graduates to a provisional stub at
housekeep.

**Holding ≠ commitment.** Inbox entries are *commitment-untracked holding* (no staleness pressure) — an entry
may in fact be committed-but-parked, but the inbox neither tracks nor enforces that. Commitment is *expressed*,
not presumed: at capture by taking an express lane (`ERRANDS.md` for atomic work, a stub for multi-step), or at
drain when housekeep promotes a now-committed entry into one. `ERRANDS.md` is the *committed* queue — it drains
by execution and is staleness-checked; the inbox is not. A fuller atomic inbox does not mean more stale errands.

## Merge-lane reasoning detail

Supplements the spec's four-condition threshold and carve-out with the reasoning behind them:

- **One PR per lane, justified by review-coherence.** Mature practice gates PR scope by what one reviewer of
  uniform competence can certify as coherent — not by destination count or a fixed ratio. A planning-doc routing
  sweep is one coherent operation → one auto-merge PR; chunk only for review-reachability if very large.
  Code-errands stay 1:1. Lanes never mix in a single PR.
- **The lane classifies the PR that carries a change**, not the change in the abstract — an errand's PR, a WU's
  integration PR. So a ROADMAP-touching errand is reviewed *today* (interim hand-edit) but auto-merges
  *post-roadmap-tooling*.
- **Condition #4 is a sunset trigger.** "Unverifiable hand-edit of a derived surface" fires only *while* that
  surface is hand-maintained. Once a renderer produces it with a verify-against-source check (`roadmap-tooling`
  for ROADMAP, `operational-state-docs` for the managed surfaces), the derivation is verifiable and #4
  dissolves → it auto-merges. The same sunset applies to every managed/derived surface.
- **Why the carve-out holds.** A homeless-flush to the shared inbox and a disciplined ROADMAP regen trip none of
  the four conditions (no owner, no design authority, not constitutional; the ceremony's discipline / a
  regen-matches-source check stands in for #4). The shared inbox's blanket reviewed-lane status was a
  pre-owner-gate proxy; housekeep's discipline + optional *notification* (not gating) + git audit replace it.
- **Coordination note for CWC.** The general owner-graded merge doctrine (CODEOWNERS-from-`**Owner:**`) stays
  CWC's. Both the shipped advisory gate *and* CWC's planned owner-gate key on *in-flight*, whereas the
  stewardship concern argues for gating *dormant* foreign edits too — a refinement up to CWC, with
  review-vs-notification and granularity (substantive routing vs trivial fix) as sub-questions.

## Coordination write-back specifics

Beyond the three forward-compat write-backs already in the spec's requirements (doc-naming-convention,
operational-state-docs, CWC de-scope), two more coordination touches to honor during execution:

- **`handoff-optimization` (coordinate).** Owns SESSION-NOTES content/template cleanup (the "Working On" field,
  the post-WOR drift). Our between-WUs `session-handoff` path defines *when* SESSION-NOTES is/isn't written (not
  written with no active WU) — same file, adjacent concern. One coordinated sweep.
- **`composable-workflows` (consume interim).** New cross-file workflow references (session-init ↔ housekeep ↔
  session-handoff) use stable heading-slug anchors, never ordinal `Step N` refs, per the interim convention that
  WU will later codify.
- **Worktree Foundation / CWC (de-scope — isolation-write guards).** This WU hardens only housekeep's *own*
  precondition (refuse/relocate off a WU branch, reusing `arc errand`'s context resolution). The *general* guard
  — any base-branch-writing command (incl. AWL's `arc start`) guarding its context, plus a pre-commit backstop —
  is isolation enforcement, WF/CWC territory. The design detail (command-guard and hook sharing one
  write-context-classifier primitive) is **captured to `INBOX.USER` for routing to CWC**, not held here.

## Routed elsewhere (records, not folded into this WU)

Concerns surfaced during planning whose home is *not* this WU — recorded so they reach their homes at drain, not
lost:

- *H1 styling for the inbox/memory file family* (`ATOMIC-INBOX`) → `doc-naming-convention` (rides its rename
  cascade — guaranteed touch).
- *Archival ceremony tooling doesn't accommodate the post-sweep state* (`BACKLOG-INBOX`) + its duplicate facet
  *`arc release commit`/`push` refuse the archival commit* (USER-INBOX § Atomic) → **dedup into one entry;** out
  of this WU's domain (archival-ceremony mechanics). Splits at drain — the wrapper-refusal facet plausibly →
  `interlock-release-refinement`; the hook + `archive-work-unit` facets are a separate archival-tooling concern.
- *Incidental-scope marking + the post-errand fold-vs-errand bar* (the meta-gap that surfaced the anti-rider
  rule) → under anti-rider the "rider-marking" half is moot; what remains is the inline-vs-errand rule, which is
  in-thesis here. The general meta-observation is recorded, not separately tracked.

## Folded-capture provenance

The inbox-triage captures that spawned this WU and where each lands:

- USER-INBOX § Atomic: *dedicated between-WUs path in `session-handoff`* — built here (spec Req 15).
- USER-INBOX § Atomic: *reconcile USER-INBOX template↔parser* — mandatory consequence of the reshape (spec
  Req 6).
- USER-INBOX § Backlog: *codify the inbox→stub graduation threshold* — **settled (this session):** no
  depth-keyed shortcut. The direct stub is an *express lane* for committed multi-step work — never forced; inbox
  entries hold up to ~a paragraph, and volume past that *nudges* toward a stub rather than gating. Terminal
  shape: provisional stub directly; no shared multi-step valve (spec Req 7).
