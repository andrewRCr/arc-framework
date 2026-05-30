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

- [Inbox section preambles (verbatim — do not re-derive)](#inbox-section-preambles-verbatim--do-not-re-derive)
- [Capture decision table (verbatim)](#capture-decision-table-verbatim)
- [Entry-grammar subtleties](#entry-grammar-subtleties)
- [Drain timing and ownership](#drain-timing-and-ownership)
- [Surface roles — rationale](#surface-roles--rationale)
- [Merge-lane reasoning detail](#merge-lane-reasoning-detail)
- [Coordination write-back specifics](#coordination-write-back-specifics)
- [Routed elsewhere (records, not folded into this WU)](#routed-elsewhere-records-not-folded-into-this-wu)
- [Folded-capture provenance](#folded-capture-provenance)

## Inbox section preambles (verbatim — do not re-derive)

The one-line destination-preamble callouts that land under each `INBOX.USER` section heading. Headings stay the
stable character token (`## Atomic` / `## Work Unit`) — the anchor and reference key; routing destinations live
in the preamble (they evolve, and compressing them into the heading invites imprecision — e.g. "born
provisional" is wrong: most stubs start `planned/`).

> *Atomic — Single-step captures. Drain to execution — folded into a WU (inline absorption), or run standalone
> via `arc-errand`. Never executed directly from here.*
>
> *Work Unit — Multi-step captures bound for a backlog stub. Route to an existing stub, or graduate to a new
> one — directly at housekeep; `arc-errand` only if needed mid-WU. Carries `WU_Target` (TBD ok); an optional
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
| Anything else, not urgent   | No — defer the isolated write | **Capture to INBOX.USER**; housekeep routes it next between-WUs       |

**Transit lounge, not resting place.** `INBOX.USER` holds known-home and homeless items alike — but only because
housekeep drains it *every* WU. A known-home item may **transit** the personal inbox; it may never **rest** in
the shared inbox, which has no forcing drain. That distinction keeps the core invariant true rather than
aspirational.

**Discovery re-triage.** The home can be discovered *after* capture. Draining is not only "flush by section" —
it re-evaluates each entry; any that now have a known home leave the buffer for it.

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

**Holding ≠ commitment.** Inbox entries are *uncommitted holding* (no staleness pressure). An entry becomes an
errand only at the moment of commitment; `ERRANDS.md` is the *committed* queue that drains by execution and is
staleness-checked. A fuller atomic inbox does not mean more stale errands.

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
- USER-INBOX § Backlog: *codify the inbox→stub graduation threshold* — becomes the terminal-shape decision
  (provisional stub directly; no shared multi-step valve) (spec Req 7).
