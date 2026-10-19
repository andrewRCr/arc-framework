# Draft: Goal-Aware Direction — the `VECTOR` layer

- **Cohort:** [none]
- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-14); graduated to a
  `planned` stub (committed at drain). Surfaced live during `lifecycle-state-machine` draft-design (2026-06).
- **Purpose:** Give ARC a **direction layer**: one new authored primitive — the **target** — held on a scope-paired
  managed surface (`VECTOR.PROJECT` / `VECTOR.USER`), plus the graph derivations and the advisory recommender that
  answer "what should I do next, and _why_" at session-init discovery.
- **State:** Draft — groomed 2026-07-02 (holistic rewrite of the 2026-06-14 capture; research-grounded); regroomed
  2026-10-11 (boundary, timing, the recommender's scope, configurability, the steering map's retirement). Readiness:
  **maturing** — § Continuity.

---

## Continuity

- **Readiness:** maturing. The model, vocabulary, scope pair, authority shape, and recommender posture are settled.
  Each surface's record shape, write path, and authority check, and the recommender's inputs, re-derive against the
  storage contract after the cutover.
- **Timing:** `Depends On: storage-cutover` (2026-10-11). The design is done whole once the store's record kinds,
  typed listings, and Errand queue exist, rather than against prose and scraped fields now and redone later
  (§ Scope and decomposition seams).
- **Settled at the 2026-10-11 grooming:**
    - the boundary read and its predicted cut (§ Scope and decomposition seams);
    - the recommender over work items, its capacity mode, its Errand-queue arm, and the goal source
      (§ The recommender);
    - a fixed design that adds no settings (§ Configurability);
    - this work unit retires the personal steering map (§ Retires the steering map).
- **Open:**
    - each surface's record shape, write path, and authority check against the contract (§ The surfaces);
    - the two held inbound entries below;
    - entry-grammar detail and verb naming, carried from 2026-07-02.
- **Next:** after `storage-cutover` lands, re-enter draft-design: re-run the boundary read against the predicted cut,
  re-derive the surfaces against the contract, re-run the steering-map mapping, and integrate the held entries.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Add a value/leverage counterpart to `Class`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: goal-aware-direction`), housekeep drain (2026-07-18);
  captured during the architecture-direction discussion (2026-07-16). Split at drain: the appetite/continuation
  tripwire and grooming-mechanics pieces routed to `draft-planning-iteration-mechanics.md`.
- _Concern:_ `Class` prices cost (Light/Heavy/Novel) and scales ceremony to it, but nothing records what the effort
  buys — the pipeline faithfully executes low-leverage Heavy work with full discipline. Case study:
  `husk-lifecycle-drivers` — edge-case completion of an already-shipped DX convenience, several review cycles,
  correctly priced Heavy, never value-questioned. Industry prioritization frames (Shape Up appetite, WSJF, RICE)
  are all value-over-effort; ARC has only the denominator.
- _Fold-in:_ a coarse leverage enum (e.g. `Core / Multiplier / Comfort`) recorded beside `Class` at
  classification — the signal is the pair (`Heavy × Comfort` must justify itself at pick time). The value axis is
  this WU's domain; coordinate the enum's read surface with the recommender posture.

### `[ ]` **`VECTOR.PROJECT` / `VECTOR.USER` join the managed-record members (goal-aware-direction)**

- _Redistributed:_ moved from `operational-state-docs` under `storage-contract` C2, the record-aware seam (2026-09-30);
  both become store surfaces (its storage-coupling register row).
- _Routed from:_ `goal-aware-direction` grooming (2026-07-02).
- _Concern:_ `goal-aware-direction` mints a scope-paired direction surface — `VECTOR.PROJECT` (authored targets
  at Now/Next/Later horizons, per-target `Owner`, maintainer-gated) and `VECTOR.USER` (private, notes-synced
  sequencing intents). Both adopt the slug-keyed managed-entry grammar from day one (the render-before-renderer
  pattern) and are markdown-canonical interim; the structured schemas, round-trip harness membership, and any
  deterministic verbs' record backing land here.
- _Substrate asks:_ (1) schema membership — including a band/horizon axis whose **required-field set varies by
  band** (Now requires realized-by + done-signal; Later only slug + outcome); (2) the corpus conformance gate
  validates vector slug refs (realized-by WUs/cohorts, intent refs to `INBOX.USER` entries) like `Depends On`
  edges — dangling refs fail loud; (3) seam — the slug-keyed inbox removal primitive (one authoritative
  remover + idempotent backstops) may also flag matching `VECTOR.USER` intent refs at errand completion, with
  the housekeep sweep as backstop.

### Dispositions — owner's pass, 2026-10-11

| Entry                                                                                       | Outcome | Where, or why                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Derive `VECTOR.USER`'s queued Errands from the Errand queue                                 | fold    | § `VECTOR.USER`, derived members; § The recommender, The Errand-queue arm                                                                     |
| Re-point the horizon-test seam at the routing method's advisory                             | fold    | § Dependencies / Coordination, `inbound-routing-method`                                                                                       |
| Managed-record members, ask: the queued set read from `INBOX.USER`                          | dismiss | Superseded by the Errand-queue fold: members derive from the queue, and the derived-not-stored rule already stands in § `VECTOR.USER`         |
| Managed-record members, ask: the `_Hold:_` → `_Queued:_` rename                             | dismiss | The contract's Errand queue (`spec-storage-contract.md` D11) replaces execute-bound marks, so queue membership is no inbox flag for this unit |
| `USER-INBOX`: Give the recommender a capacity mode for when the goal's own path is occupied | fold    | § The recommender, Capacity mode; § Problem / Motivation                                                                                      |

### `[ ]` **Fit the vector design to what the RELEASE-GATES trial could not hold**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: goal-aware-direction`), housekeep drain (2026-10-11).

- _Shapes:_ § The surfaces (`VECTOR.PROJECT`'s target fields, `VECTOR.USER`'s intents) and § Retires the steering
  map (its mapping table).

- _Observation:_ `RELEASE-GATES.md` was restructured on 2026-10-11 as a trial of the leaned shape, keeping every
  item: § Targets (would-be `VECTOR.PROJECT`), § Intents (would-be `VECTOR.USER`), § Stance, and an appendix for what
  is not direction. What the shape could not hold:
    - **Targets nest.** `storage-program` is one of `gate-a-private-beta`'s must-haves, and the stream targets are
      its "Shipping enablement"; realized-by takes work-unit and cohort refs only, so a target cannot name a target.
    - **Bands inside a target.** Gate A's must-have / strong-prefer / nice-to-have have no field (the mapping
      table's open row, confirmed).
    - **Open decisions before a target** have no home (the other open row, confirmed); the trial lists them under
      the target.
    - **Holds are not parks.** The mapping table sends "Held and paused" to the readiness record's
      `scheduling: "parked"`, but the map's holds are Owner choices no `arc park` records —
      `delivery-rebuild-continuity` is held "in place: no park and no lifecycle action". Solo they read as personal
      intents (the trial's § Intents, Holds); on a team, a hold others must respect is a project fact.
    - **Resume instructions** — what to re-validate or re-derive when a hold releases — belong in each work unit's
      meta, not in direction; the trial kept them under Holds only to keep every item.
    - **Stream exits fit as done-signals** (review's and decomposition's authored exits), but each stream target
      wraps one cohort reaching a cut: weigh a cohort-level exit against a wrapping target.
    - **The stage diagram is derivable** from `Depends On` edges, so drawing it is the horizon render's job; the
      trial keeps it as a glance, marked derivable.
    - **"How this map decides" splits:** part is recommender stance (favor completing verified open work), part is
      project doctrine — hard dependency versus operating order, core versus deferred — whose home is the project's
      rules or PRD, not a vector.
    - **Partial refs.** Gate A names parts of work units — `wu-lifecycle-state-model`'s front half, the
      inventory-guard half of `self-hosting-manifest-freshness`, the high-traffic portion of
      `instruction-optimization`, the seed of `workflow-eval-harness` — and a tag-defined set (the follow-ons
      `storage-contract` tags as core). Slug-valued realized-by holds neither: accept a scoped ref, or require the
      cut first.
    - **Ordered, ruled realization.** Targets carry an order and rules over their realizing work — delivery's
      recovery runway and its rules that stand, the review protocol chain, the seam's design order with its
      spec-approval gating — while realized-by is an unordered set. The seam's order already lives in
      `cohort-storage-seam.md`, so the trial restates it.
    - **Placement buckets are not outcomes.** "Post-B by design" places work units past a target; Later holds
      outcomes, so a deferred-by-design set has no home (the trial keeps it as a Later section).
    - **Window-scoped rules.** Exclusions and admission rules that hold for a target's duration — never alongside
      the seam, the pull-forward filter, the storage boundaries on pulled-forward work — are neither stance nor
      `Depends On` edges, and have no field.
    - **Resolve-don't-store, confirmed:** the pre-trial map listed `quality-gate-hooks` and `inbound-routing-method`
      as Active; both had shipped.

- _Approach:_ at post-cutover design, settle each as a field or a deliberate non-goal, and re-run the mapping table
  against the trial layout rather than the pre-trial one.

- _Captured during:_ the RELEASE-GATES vector-shape trial, 2026-10-11.

### `[ ]` **Read an Owner's holds as pauses**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: goal-aware-direction`), housekeep drain (2026-10-13).

- _Shapes:_ the inbound entry "Fit the vector design to what the RELEASE-GATES trial could not hold" (its "Holds are
  not parks" item), and § The recommender › Inputs, its Parked row.

- _Observation:_ from the flip a pause is a project-scope record on the work item holding its reason, what it waits on,
  resume notes, and whether its owner opens it to takers (`draft-seam-lifecycle.md` § Lifecycle, "Lifecycle moves from
  the flip"; Owner, 2026-10-12). An Owner's hold is a pause, and its resume instructions are the pause's resume notes,
  so `RELEASE-GATES` § Holds retires into records; the recommender can offer resumable pauses and those open to takers.

- _Captured during:_ `seam-lifecycle` draft-design close, 2026-10-12.

- _Drain note:_ a stub cannot be paused (`spec-seam-lifecycle.md` § 8.1), so a hold on a stub stays something other
  than a pause.

### `[ ]` **Give the vector shape a place for gate-qualified edges, apart from sequencing intents**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ VECTOR.USER and recommender Inputs: typed gate-qualified edges versus personal sequencing intents

- _Observation:_ the steering map's 2026-10-15 refresh, run as the vector trial, added a Stage 2 "Orderings" block that
  mixes hard edges' gate points — when each dependency holds: activation, a named task, or landing — with the Owner's
  sequencing intents. The vector shape had no slot for the first, so the map restated it in prose, which is the drift
  the trial avoids elsewhere. The gate points are now `work-item-relations`' concern; the intents stay `VECTOR.USER`'s.
- _Approach:_ keep intents in `VECTOR.USER` and read gate points from typed edges once `work-item-relations` lands;
  until then, name the misfit at the steering map's next refresh.
- _Captured during:_ the 2026-10-15 housekeep session, the dependency-model discussion.

### `[ ]` **Take the recommender's inputs from lifecycle's typed view, not the project composition or `--json` facts**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Recommender Inputs: lifecycle typed view replaces retired readiness composition

- _Observation:_ `resolveProjectReadinessComposition` (`lib/status/project-view.ts`) stays in-repo and leaves at the
  storage cutover; from the flip `arc status --project` acquires from lifecycle's typed view (`readLifecycleView`,
  `lib/store/lifecycle-index.ts`), which returns each meta's parsed owner, cohort, dependencies, priority, `Class`, and
  pause with its placement. The `arc status --project --json` facts (`ProjectReadinessFact`) carry no priority, cohort,
  `Depends On`, `Class`, or pause, so they cannot feed the recommender (`draft-seam-status-roadmap.md` § Coordination).

- _Captured during:_ `seam-status-roadmap` draft-design close, 2026-10-16.

---

## Problem / Motivation

ARC's planning model is **flat and local**: `Priority` + `Depends On` edges, nothing more. Between WUs,
session-init's discovery arm can only surface "N unblocked P1s" with no reason to prefer one. The
actually-correct next pick is often a _lower-priority_ WU that is right for reasons ARC never captures —
`single-owner-wu-model` (a P2) was the correct pick only because it closed the `concurrent-work-conventions`
cohort and because the near-term goal was `finalize-parallelism`. None of that reasoning lives in any rendered
view, probe, or workflow — only in developer memory.

The same gap opens when the work in motion is occupied or blocked. On 2026-10-11 `seam-record-kinds` was the only
work unit in motion, with `storage-ref-backend` and `storage-projection` blocked on it, and `arc status --project`
reported 111 planned or provisional work units as `ready` — their dependencies met, nothing more: 2 P1, 5 P2, 70 P3,
and 34 with no priority shown. The facts that would narrow that set — a program's "never alongside" exclusions,
each draft's maturity, overlap with in-flight work, the kind of capacity on offer — are prose or judgment, so
finding a good use of spare capacity is an unguided hunt.

## Resolves the settled lean (rather than reopening it)

`roadmap-tooling` § Unknowns "Direction's home" leaned "now/next/later is derivable from `State × Depends-On ×
Priority` — a pure render mode, no separate directional doc." The counter-evidence above shows the derivation is
insufficient — but not because the render-mode decision was wrong. It fails because **the goal itself is not
data**. Once "what we are steering toward" exists as one small authored datum, everything this WU wants becomes
derivable again: critical-path-to-goal, cohort-completion pull, unblock leverage, and the recommendation are all
pure computation over the dependency graph + roster + the target. The render mode is repaired, not reopened:
"Next = Ready, priority-ordered" becomes goal-aware. (Resolution routed to `roadmap-tooling`'s buffer at this
grooming.)

## The model — one authored primitive; everything ranked is derived

Three-term vocabulary, each word doing distinct work:

- **`VECTOR`** — the surface (one managed doc per scope). Direction plus magnitude: each entry points at an
  outcome and carries a coarse distance.
- **target** — the entry: an _outcome_ ("parallelism fully operational"), never an output (a WU). Realized by
  WUs/cohorts via reference; survives their renames and decompositions; the degenerate one-WU case stays cheap.
  Deliberately not "milestone" (industry reads that as date/version-anchored release vocabulary).
- **horizon** — the band: **Now / Next / Later** as coarse distance with a confidence/detail gradient (Now is
  spec'd and few; Later is legitimately hazy boulders).

This keeps ADR-020's derived-vs-mutated split intact across the whole surface map: authored inputs (meta fields,
drafts/specs, PROJECT-PRD, the vectors) → derived views (`STATUS.*`, horizon render, recommendation) → transient
buffers (the inboxes). The vector is an **input** like meta files — hand-editable at will, CLI-parsed — never a
derived render. Direction is input; status is output.

Not a sequencing doc, on four axes: entries are destinations, not steps; the order is banded and partial, not
total; it bends the derived sequence and never enumerates it; destinations move on week/month scale while
sequences churn per-merge.

## The surfaces — `VECTOR.PROJECT` / `VECTOR.USER`

A scope pair under the `TYPE.QUALIFIER` convention, completing the third layer's symmetry with `STATUS.*`
(derived) and `INBOX.*` (buffers). Explorer sort order is a deliberate design input (routed to
`naming-conventions` as a general criterion): `INBOX` → `STATUS` → `VECTOR` in both scopes, status/vector
adjacent — where you are, then where you're heading.

**Re-derived against the storage contract after the cutover.** This section, § Authority, and § Write model and
drift were written in July for tracked files and notes. ADR-035 moves operational and planning state into the store,
and the storage register's row for this work unit (`cohort-state-storage.md`) rewrites both surfaces as store
surfaces. What each surface holds, who may change it, and what is derived rather than stored are settled; the
mechanisms are open:

- **Where each surface lives:** records in the store, with the projection's files as the working copy, in place of
  `backlog/` and notes. `VECTOR.USER` joins the personal surfaces the contract keeps per identity — the inboxes,
  working memory, personal documents, and the Errand queue.
- **Document or projection:** whether a surface is an authored document at all, or the projection of target and
  intent records, and with it the entry grammar (July assumed `operational-state-docs`' managed-entry grammar). The
  `TYPE.QUALIFIER` name and the explorer-sort argument hold for the projected files either way.
- **The authority check:** a commit-time role check and review-on-base ratification assume base-branch writes; the
  register row calls for a store-side write check or the backing-repository backend.

**Naming departure, owned:** research (2026-07-02) found no mainstream tool using a navigation metaphor as a
literal surface name (entry nouns are Initiative/Objective/Goal). `VECTOR` is chosen knowingly: ARC's managed-doc
names are already their own system (`WORKING-MEMORY` is no industry noun either), the sort constraint is real,
and the name is grounded in the design — magnitude is the horizon distance, and vectors _compose_, which is
precisely the recommender's two-scope fusion. The entry noun stays plain ("target") so prose keeps
idiom-legibility where it matters. The freed modern-idiom name ("roadmap" — which by current PM doctrine means
exactly this outcome-ordered doc) is deliberately not claimed: `ROADMAP.USER` is idiomatically broken, and
reusing a name whose meaning just flipped in-project is a transition hazard. It retires.

### `VECTOR.PROJECT`

Project-scoped and team-visible. A sketch of each target's fields (the record shape settles against the contract):

- **slug** + one-line **outcome statement** (always required)
- **horizon** — Now / Next / Later
- **`Owner`** — the one name accountable for the outcome, who ratifies changes to the target. Reuses the
  existing field name deliberately (same concept, different record type): a WU's `Owner` _executes_; a target's
  `Owner` _answers for the outcome_ and need not own any realizing WU. Follows `naming-conventions`' pending
  `Owner → DRI` evaluation if that lands.
- **realized-by** — WU/cohort slug refs (never errands — below the spec-worthiness floor)
- **done-signal** — optional falsifiable completion statement
- **Band gradient (from NNL practice):** Now requires realized-by + done-signal; Later requires only slug +
  outcome. Detail is added as a target migrates Later → Next → Now, never demanded up front.
- **Now soft cap:** ~3–5 targets (practitioner consensus WIP limit). Template guidance plus a soft nudge when
  Now bloats — "if everything is a priority, nothing is." Never gates.

### Authority (team-ready, degrading gracefully to solo)

The research-confirmed three-part shape; each part's mechanism re-derives against the contract (§ The surfaces):

1. **Role-gated write** — maintainer-writable, contributor-read (`arc.role`), enforced by a consistency check
   rather than keystroke prevention. July's form was a pre-commit check on base-branch writes.
2. **Per-target `Owner`** — accountability distinct from write access (the OKR one-name-per-goal convention).
3. **Ratification** — a direction change leaves a record of who approved it. July's form was review-as-ratification
   on base: merged review is canon and git history the audit trail, with no bespoke ledger.

Solo degradation is automatic: roles collapse onto one identity, gates become no-ops, and a solo change still
records who made it. At the backend tier this becomes server-side auth + version-checked writes with no model
change. **Cadence** (the drift-preventer per both OKR and OSS practice): a session-init staleness nudge on the
project vector — once-per-calendar-day advisory, same shape as `errandSweep` — prompting a re-groom when targets
age untouched. Deferred: permission tiers beyond maintainer/contributor (an ARC-wide role-model question, not this
WU's).

### `VECTOR.USER`

Private and identity-scoped, a personal surface (§ The surfaces); lazy — exists only once used; **zero authority
machinery ever** (single-writer by construction). Holds personal sequencing intent: "after this WU — the queued
errands, then `foo`, asked-for this week."

The authored-vs-derived boundary is the load-bearing rule (per the personal-layer research: the strongest
precedents make the personal layer a _view over shared state_, and staleness kills authored copies):

- **Derived, never restated:** the developer's in-flight work (the roster) and their Errand queue — the contract's
  ordered list of references to entries in either inbox (`spec-storage-contract.md` D11), read in its order. The
  contract makes the queue the one ordered list of a person's Errands: a view that sequences them reads it rather
  than keeping an order of its own. Membership is resolved at render time — resolve-don't-store — so a started or
  dropped Errand vanishes from the view with zero vector maintenance.
- **Authored — the only new data:** sequencing intents: ordering + a reason line over slug refs to things that
  already exist. Intents _position_ derived members; they never restate them. They place the queue as a block —
  "after this work unit, the queued Errands, then `foo`" — and never reorder Errands among themselves: that order is
  the queue's, changed by a queue write (§ The recommender, The Errand-queue arm).
- **Graduation boundary:** a personal commitment that needs to be team-visible graduates to existing mechanisms —
  claim/start the WU, or take `Owner` of a project target. The personal vector is never a channel for
  team-facing promises. This keeps the privacy line crisp and blocks the two-sources-of-truth failure mode
  structurally.

Reconciliation ceremony (the GTD weekly-review analog): the housekeep drain sweeps `VECTOR.USER` — stale intents
flagged for repositioning or dropping — and handoff review touches it opportunistically.

## The recommender

Fuses the goal source × personal view (authored intents ⊕ the Errand queue ⊕ in-flight work) × dependency graph ×
`State` × `Priority` into **1–3 reasoned candidates — reasons, not scores**: "X next: on the critical path to
`parallelism-operational`, closes the `agile-parallelism` cohort, unblocks 3." Never a fully ordered backlog
(that re-imports the false precision the prioritization-framework critique warns against), never gates, never
reorders any surface by itself.

### Over work items

It ranks **work items** — the storage contract's term for a work unit or an Errand. Work units come from the
project's readiness composition and Errands from the person's queue, and the same reasons apply to both: on the path
to a target, feeds the occupied path, touches files an in-flight work unit is about to rewrite, unblocks a held item.

### The goal source

The recommender reads goals through one source boundary: a goal is a label plus the work units and cohorts that
realize it.

- **Standalone:** `VECTOR.PROJECT`'s targets.
- **Composed with a tracker:** a project whose tracker already holds its goals (initiatives, milestones) reads them
  from there, and ARC keeps no second mutable copy. How a tracker's facts map to a goal belongs to
  `external-pm-composition` (`strategy-pm-composition-evolution.md`: one mutable fact, one authority; standalone and
  composed use both first-class). This work unit keeps the seam, not the mapping.
- **None:** graph-only reasons — priority, dependencies, cohort-completion pull, unblock leverage, exclusions — and
  no claim of direction.

The same boundary is the predicted cut's seam (§ Scope and decomposition seams).

### Capacity mode

Invoked on demand when the work on the path is occupied or blocked. It takes the kind of capacity on offer —
planning attention, a parallel execution session, or Errand time — and returns one to three candidates across three
lanes, in this order:

1. **Feed the bottleneck:** work that prepares the occupied path's next inputs — a census, re-verifying a later
   member's consumer map against current code, research. Prefer prep that reduces uncertainty without committing
   decisions that depend on an upstream's unfinished shape (Lean's last responsible moment): planning against
   another work unit's draft rather than its finished implementation tends to be redone.
2. **Independent work with float** that passes program exclusions and the overlap read (`assess-parallel-fit`).
3. **Queued Errands.**

"Start nothing new" is a legitimate answer. The grounding is the Theory of Constraints: spare capacity serves the
constraint before it starts unrelated work in progress.

### The Errand-queue arm

Housekeep may offer a reordering of the person's Errand queue with a reason for each move; on approval it is written
through `arc errand queue set` (`spec-storage-contract.md` D11, from the flip). The recommender itself still writes
nothing: the queue changes only through its own verb, on the person's approval, as the contract has a session and its
person agree on the queue and set it whole. Today's equivalent is reordering execute-bound marks by hand
(`arc user inbox-mark-execute-bound`; `listExecuteBoundInboxEntries` reads them in file order). Too thin to stand as
its own work unit, it is the recommender's reasons applied to the queue at one fire-point.

### Inputs

The recommender reads typed data only, never scraped Markdown: through `resolveProjectReadinessComposition`
(`lib/status/project-view.ts`) — the composition `seam-status-roadmap` reroutes through the store — or through the
store's typed listings. Each ranking input, where it is read today, and where it comes from after the
cutover:

| Input                                  | Today                                                                                                             | After the cutover          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Priority, cohort, `Depends On`         | on `ProjectReadinessRecord`; absent from the `ProjectReadinessFact` rows that `arc status --project --json` emits | typed listings             |
| `Class`                                | absent: the readiness composition does not read it                                                                | typed listings             |
| Parked                                 | `scheduling: "parked"` on `ProjectReadinessRecord`                                                                | typed listings             |
| Draft maturity                         | draft prose (a `Readiness:` line)                                                                                 | open: a field, or judgment |
| Program exclusions ("never alongside") | cohort prose                                                                                                      | open: data, or judgment    |
| Value / leverage                       | absent (held entry: Add a value/leverage counterpart to `Class`)                                                  | a field beside `Class`     |
| Errand order                           | execute-bound marks in file order (`listExecuteBoundInboxEntries`)                                                | the Errand queue (D11)     |
| Goals                                  | absent                                                                                                            | the goal source            |
| In-flight work and overlap             | the worktree roster (`lib/git/worktree-roster.ts`); `assess-parallel-fit`                                         | unchanged                  |

Reasons are composed by the CLI, as `projectHorizonAdvisory` (`lib/status/project-horizon.ts`) composes each row's
`horizonAdvisory`; the agent adds judgment only over facts still in prose (`strategy-procedure-evolution.md`
Principles 1 and 6).

Derivations the recommender (and the goal-aware render) share: critical-path-to-target over `Depends On` (which needs
a goal), cohort-completion pull, unblock leverage (downstream fan-out). All pure computation — consumes the shipped
`arc status <slug>` state resolver, the roster, and the dependency graph; builds no new stored state.

### Where it surfaces

First as its own command, invoked on demand (a candidate `arc next --why`). Then session-init's discovery arm (the
"N unblocked P1s" gap), once `seam-locus` and the session-init agenda (`composable-workflows`) settle what
session-init reads and how its result reaches the agent; and as advisory input to `assess-parallel-fit` (which judges
parallel _fit_ today, not goal-progress). Scope divergence is narrated, privately, in the operator's own session —
"the project vector says X; your queue commits `foo` first" — and the resolution stays human. Nothing writes back but
the Errand-queue arm's approved queue write; project state is never shadowed. (The one modest novelty the research
flagged — narrated personal/project divergence — is contained here: `VECTOR.USER` is unpublished, so no
team-legible contradiction surface exists.)

### Naming

Nothing named for direction ships without goals: with no goal source the recommender is the readiness derivation
plus graph reasons, which § Resolves the settled lean calls insufficient for direction (and § Research grounding's
vocabulary hygiene forbids overclaiming). The predicted cut's member is `next-work-recommender` for that reason.

## Configurability

A fixed design driven by data, adding no settings (`strategy-storage-evolution.md` Principle 9, avoid axis
explosion):

- **Presence is the switch.** No goals: graph-only reasons. No `VECTOR.USER`: no personal layer, since it exists only
  once used.
- **Tuning values** — the Now cap, the candidate count, the staleness nudge's cadence — are fixed defaults and
  template guidance.
- **Judgment is customized by method override,** the mechanism every method already carries, not by settings: the
  recommender's prose judgment lands as a method.
- **Write permission** reuses `arc.role`.
- **Tracker composition is the one real variation,** and it is not a new setting: where goals come from follows the
  project's tracker binding (§ The recommender, The goal source).
- **User level:** `VECTOR.USER` is the personalization, held as data. A preference such as session-init offering
  picks unprompted waits on the session-init agenda.

## Retires the steering map

`RELEASE-GATES.md` — the Owner's personal, gitignored steering map — fills this layer's gap by hand: it orders the
storage program, names the release gates, and records what is held and why. This work unit retires it, a
done-signal, and its sections are the design's best usage evidence (the July research was external). Mapping as of
2026-10-11, to re-run at design time since the map keeps changing:

| Section                                                 | Goes to                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Gates A and B                                           | project targets with done-signals                                                      |
| The sequence; Resumption                                | horizons, and each target's realizing work                                             |
| How this map decides                                    | the recommender's stance — favor completing verified open work over starting new Heavy |
| Held and paused                                         | the readiness record's `scheduling: "parked"`                                          |
| Refresh rule                                            | the staleness nudge                                                                    |
| Where things live                                       | neither: a pointer table, not direction                                                |
| Landing rules; Decomposition until the cutover          | neither: operational workarounds that retire with the cutover                          |
| Gate A queue (must-have / strong-prefer / nice-to-have) | open: priority bands inside one target have no field                                   |
| Decisions pending before Gate A                         | open: no home in the design                                                            |

It also argues for the scope pair: a personal file holds project-level content — the gates — because nothing
project-scoped can.

## Write model and drift

- **Writes:** deterministic CLI verbs for mechanical mutations (add / re-band / retire; names at spec time),
  hand-editing legal, and a conformance check validating the grammar — OSD's codified
  CLI-mutate-plus-consistency-hook pattern. Malformation is caught loud, not prevented. Where hand edits land and when
  the check runs re-derive with § The surfaces.
- **Drift resolves in three layers, no tied re-render:** (1) derived membership makes the big class structurally
  impossible — nothing stored to drift; (2) dangling slug refs in authored content (a consumed inbox entry, a
  renamed WU in realized-by) fail the corpus conformance gate — same treatment as `Depends On` edges; (3) the
  judgment tail rides the re-groom fire-points. A started Errand leaves the queue in the same write (D11), so an
  intent naming it dangles and layer (2) catches it.
- **Storage-evolution self-check (re-run 2026-10-11).** The July run found the design composed with the then-planned
  contract while holding `VECTOR.USER` on notes and `VECTOR.PROJECT` on base-branch writes. ADR-035 retired both: state
  moves to the store, notes retire at the cutover, and the register's row rewrites both surfaces as store surfaces.
  The records are entry-granular and slug-keyed and the derived members store nothing, so the model composes; the
  mechanisms in § The surfaces, § Authority, and this section re-derive against the contract.

## Research grounding (2026-07-02, three-facet external pass)

- **Outcome-vs-output split is doctrine** (Cagan / Perri / Bastow / Torres): roadmaps order outcomes; delivery
  plans order outputs — distinct artifact types. Validates the vector/`STATUS.*` split from both sides, and
  `STATUS.PROJECT` as the industry-correct name for a readiness view.
- **Authority three-part shape confirmed near-verbatim** (role-gated write + named owner + recorded review
  event; git-native form: "merged RFC = canon" — Rust/Python govern direction this way). Solo = roles collapse,
  record persists. Recurrence of review, not the gate, prevents drift.
- **Reasons-not-scores is the mature school** (Kanban pull, Shape Up betting table, RICE/WSJF false-precision
  critique, explainable next-best-action trend). Sharpened: surface 1–3 candidates, never an ordered backlog.
- **Personal layer is precedented with named guardrails** (Linear My Issues = view-over-shared-state; GTD
  weekly review = reconciliation ceremony; Gothelf: personal layer read only by the individual). Our privacy +
  reference-don't-restate + housekeep sweep match all three.
- **Vocabulary hygiene:** a mechanical now/next/later banding over _WUs_ is a readiness view, not an outcome
  NNL roadmap — naming must not overclaim (routed to `roadmap-tooling`).

## Priority interaction (watch item)

`Priority` stays authored local urgency; goal-distance is the global lens; the recommender composes both
narratively. Two ranking signals must not fight — if goal-distance in practice subsumes `Priority`, revisit
whether `Priority` weakens to a tiebreaker. Watch, don't pre-solve.

## Scope and decomposition seams

**Boundary read, 2026-10-11: stays one work unit.** The July read held it whole while the design matured. Two things
have changed since: the storage register made the vector surfaces store records, so the primitive waits on the store,
and the capacity case gave the derivations and recommender a use that needs no goals. The pieces are orthogonal — the
primitive is records, authority, and writes; the recommender is computation over the readiness composition — and they
meet at one narrow seam, the goal source. But most of the recommender's inputs (§ The recommender, Inputs) become
typed only with the storage program, so cutting now would design it against prose and scraped fields and redo it.
Held whole, and designed together after the cutover, when the cut is real.

**Predicted cut,** to re-check at that design:

- **The vector primitive** — the surfaces, the target grammar and horizons, authority, the write verbs, the
  conformance check, `VECTOR.USER`, and the goal source's standalone arm.
- **`next-work-recommender`** — the derivations, the recommender over work items, the capacity mode, the
  Errand-queue arm, and its surfaces. It works without goals and reads them through the goal source once they exist.
- **Placement:** a cohort, with a strong lean for `roadmap-tooling` to join it: its horizon render consumes targets
  and its readiness view is the recommender's base, so the three design together.
- **Shape:** retire this work unit into new members, or extract the recommender and keep this one as the primitive;
  decided at the cut, with the cohort's name.

## Dependencies / Coordination

- **`storage-cutover`** — a `Depends On` edge (2026-10-11), not an operating order: the surfaces become store records
  (the storage register's row), and the recommender's inputs become typed with the program's record kinds, typed
  listings, and Errand queue. Until it ships, the readiness view shows this work unit blocked rather than ready;
  grooming continues.
- **`roadmap-tooling`** — the tightest seam and the predicted cohort sibling (§ Scope and decomposition seams): owns
  the render engine, the `STATUS.PROJECT` rename, and the horizon render mode, which post-vector consumes the target
  (goal-aware "Next") or keeps readiness vocabulary. Routed to its buffer at the July grooming: Direction's-home
  resolution, NNL vocabulary hygiene, and the multi-dep-cell recommendation (short names + `+N` overflow collapse;
  lossy-scan / lossless-source framing). The cohort lean is routed to it as a capture (2026-10-11).
- **`seam-status-roadmap`** — reroutes `resolveProjectReadinessComposition` through the store and has derived views
  read typed listings; the recommender reads its inputs the same way.
- **`external-pm-composition`** — owns how a tracker's goals map onto the goal source; this work unit keeps the seam
  (§ The recommender, The goal source).
- **`operational-state-docs`** — `VECTOR.*` join its managed records (held entry above). The records engine moved
  into the parsers `storage-seam` builds for each family it reroutes, and its user-surface residue is deferred past
  the cutover (`cohort-state-storage.md`).
- **`naming-conventions`** — the `VECTOR.{PROJECT,USER}` names join the `TYPE.QUALIFIER` family; explorer-sort
  as a codified naming criterion; the standardized WU short-name field (`Short:`, with a collision guard at
  `arc stub` and a resolver) whose render consumption is roadmap-tooling's; the `Owner → DRI` coupling. Buffer
  entry routed at the July grooming.
- **`shared-inbox-model`** — keeps the inbox model and waits on the cutover. Queued Errands now derive from the Errand
  queue (§ `VECTOR.USER`), so its retention-line semantics no longer reach this work unit.
- **`inbound-routing-method`** (shipped) — the horizon test lives there as an advisory, never a gate: when a coupled
  entry targets a provisional, P3, or parked work unit, routing tells the Owner the entry will wait there.
  `projectHorizonAdvisory` composes it on each `arc status --project --json` row from the target's lifecycle state,
  priority, and scheduling, and the routing method only shows it. Now/Next targets are its refined input.
- **`seam-locus` and the session-init agenda (`composable-workflows`)** — settle what session-init reads and how its
  result reaches the agent; the discovery-arm surface waits on them.
- **arc-backend / `strategy-storage-evolution`** — self-check re-run (§ Write model and drift).
- **Boundary — `cross-wu-coordination`:** distinct concern, kept distinct: design-time _relatedness_ (pull
  related work in, push refinements back) vs. this WU's pick-time _direction_. Both add reads at planning
  fire-points; neither absorbs the other.
- **Consumes (shipped):** `arc status <slug>` lifecycle-state resolver; the worktree roster; `Depends On` edges and
  their satisfaction as the readiness composition classifies them; `resolveProjectReadinessComposition`;
  `projectHorizonAdvisory`.

## Class

**Heavy.** High derivation — a real design authored before work can start — but composition, not invention: the
research shows nearly every element adapts established practice (NNL horizons, OKR ownership, review-as-
ratification, pull-system recommendation). The one genuinely novel seam (narrated private divergence) is
deliberately contained. Confirmed 2026-10-11: the July design is realized authoring, which floors it at Heavy, and
the regroom composes existing substrate rather than inventing.
