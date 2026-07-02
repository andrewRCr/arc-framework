# Draft: Goal-Aware Direction — the `VECTOR` layer

- **Cohort:** [none]
- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-14); graduated to a
  `planned` stub (committed at drain). Surfaced live during `lifecycle-state-machine` draft-design (2026-06).
- **Purpose:** Give ARC a **direction layer**: one new authored primitive — the **target** — held on a
  scope-paired managed surface (`VECTOR.PROJECT` / `VECTOR.USER`), plus the graph derivations and the advisory
  recommender that answer "what should I do next, and *why*" at session-init discovery.
- **State:** Draft — groomed 2026-07-02 (holistic rewrite of the 2026-06-14 capture; research-grounded).
  Readiness: **maturing** — model, vocabulary, scope pair, authority, write model, and recommender posture are
  settled; open items are entry-grammar detail, verb naming, and sequencing.

---

## Problem / Motivation

ARC's planning model is **flat and local**: `Priority` + `Depends On` edges, nothing more. Between WUs,
session-init's discovery arm can only surface "N unblocked P1s" with no reason to prefer one. The
actually-correct next pick is often a *lower-priority* WU that is right for reasons ARC never captures —
`single-owner-wu-model` (a P2) was the correct pick only because it closed the `concurrent-work-conventions`
cohort and because the near-term goal was `finalize-parallelism`. None of that reasoning lives in any rendered
view, probe, or workflow — only in developer memory.

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
- **target** — the entry: an *outcome* ("parallelism fully operational"), never an output (a WU). Realized by
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

**Naming departure, owned:** research (2026-07-02) found no mainstream tool using a navigation metaphor as a
literal surface name (entry nouns are Initiative/Objective/Goal). `VECTOR` is chosen knowingly: ARC's managed-doc
names are already their own system (`WORKING-MEMORY` is no industry noun either), the sort constraint is real,
and the name is grounded in the design — magnitude is the horizon distance, and vectors *compose*, which is
precisely the recommender's two-scope fusion. The entry noun stays plain ("target") so prose keeps
idiom-legibility where it matters. The freed modern-idiom name ("roadmap" — which by current PM doctrine means
exactly this outcome-ordered doc) is deliberately not claimed: `ROADMAP.USER` is idiomatically broken, and
reusing a name whose meaning just flipped in-project is a transition hazard. It retires.

### `VECTOR.PROJECT`

Lives in `backlog/` beside the readiness view. Slug-keyed managed-entry grammar (OSD conventions) from day one —
the established render-before-renderer pattern. Sketch (shape settles at spec, with OSD):

- **slug** + one-line **outcome statement** (always required)
- **horizon** — Now / Next / Later
- **`Owner`** — the one name accountable for the outcome, who ratifies changes to the target. Reuses the
  existing field name deliberately (same concept, different record type): a WU's `Owner` *executes*; a target's
  `Owner` *answers for the outcome* and need not own any realizing WU. Follows `naming-conventions`' pending
  `Owner → DRI` evaluation if that lands.
- **realized-by** — WU/cohort slug refs (never errands — below the spec-worthiness floor)
- **done-signal** — optional falsifiable completion statement
- **Band gradient (from NNL practice):** Now requires realized-by + done-signal; Later requires only slug +
  outcome. Detail is added as a target migrates Later → Next → Now, never demanded up front.
- **Now soft cap:** ~3–5 targets (practitioner consensus WIP limit). Template guidance plus a soft nudge when
  Now bloats — "if everything is a priority, nothing is." Never gates.

### Authority (team-ready, degrading gracefully to solo)

The research-confirmed three-part shape, realized with machinery ARC already has:

1. **Role-gated write** — maintainer-writable, contributor-read (`arc.role`), enforced by a pre-commit
   consistency check (the drift-non-survivable-at-commit pattern), not keystroke prevention.
2. **Per-target `Owner`** — accountability distinct from write access (the OKR one-name-per-goal convention).
3. **Review-as-ratification** — the doc lives on base; direction changes ride the same reviewed base-writes as
   everything else. Merged review = canon; git history is the audit trail. No bespoke ledger.

Solo degradation is automatic: roles collapse onto one identity, gates become no-ops, and a self-merged change
is still a timestamped ratification record. At the backend tier this becomes server-side auth + version-checked
writes with no model change. **Cadence** (the drift-preventer per both OKR and OSS practice): a session-init
staleness nudge on the project vector — once-per-calendar-day advisory, same shape as `errandSweep` — prompting
a re-groom when targets age untouched. Deferred: permission tiers beyond maintainer/contributor (an ARC-wide
role-model question, not this WU's).

### `VECTOR.USER`

Private, identity-scoped, notes-synced (user-root cross-WU file, like `WORKING-MEMORY`); lazy — exists only once
used; **zero authority machinery ever** (single-writer by construction). Holds personal sequencing intent: "after
this WU — those three queued errands, then `foo`, asked-for this week."

The authored-vs-derived boundary is the load-bearing rule (per the personal-layer research: the strongest
precedents make the personal layer a *view over shared state*, and staleness kills authored copies):

- **Derived, never restated:** the developer's in-flight WUs (roster) and their queued inbox commitments (the
  `_Hold:_` → proposed `_Queued:_` set on `INBOX.USER`). Membership is resolved at render time —
  resolve-don't-store — so an executed or drained errand vanishes from the view with zero vector maintenance.
- **Authored — the only new data:** sequencing intents: ordering + a reason line over slug refs to things that
  already exist. Intents *position* derived members; they never restate them.
- **Graduation boundary:** a personal commitment that needs to be team-visible graduates to existing mechanisms —
  claim/start the WU, or take `Owner` of a project target. The personal vector is never a channel for
  team-facing promises. This keeps the privacy line crisp and blocks the two-sources-of-truth failure mode
  structurally.

Reconciliation ceremony (the GTD weekly-review analog): the housekeep drain sweeps `VECTOR.USER` — stale intents
flagged for repositioning or dropping — and handoff review touches it opportunistically.

## The recommender

Fuses project vector × personal view (authored intents ⊕ derived queued-set ⊕ roster) × dependency graph ×
`State` × `Priority` into **1–3 reasoned candidates — reasons, not scores**: "X next: on the critical path to
`parallelism-operational`, closes the `agile-parallelism` cohort, unblocks 3." Never a fully ordered backlog
(that re-imports the false precision the prioritization-framework critique warns against), never gates, never
reorders any surface by itself.

Where it surfaces: session-init's discovery arm (the "N unblocked P1s" gap); advisory input to
`assess-parallel-fit` (which ranks parallel *fit* today, not goal-progress); a candidate `arc next --why` verb.
Scope divergence is narrated, privately, in the operator's own session — "the project vector says X; your queue
commits `foo` first" — and the resolution stays human. Nothing writes back; project state is never shadowed.
(The one modest novelty the research flagged — narrated personal/project divergence — is contained here:
`VECTOR.USER` is unpublished, so no team-legible contradiction surface exists.)

Derivations the recommender (and the goal-aware render) share: critical-path-to-target over `Depends On`,
cohort-completion pull, unblock leverage (downstream fan-out). All pure computation — consumes the shipped
`arc status <slug>` state resolver, the roster, and the dep graph; builds no new stored state.

## Write model and drift

- **Writes:** deterministic CLI verbs for mechanical mutations (add / re-band / retire; names at spec time),
  hand-editing fully legal, and the conformance check validating the grammar at commit — OSD's codified
  CLI-mutate-plus-consistency-hook pattern. Malformation is caught loud, not prevented.
- **Drift resolves in three layers, no tied re-render:** (1) derived membership makes the big class structurally
  impossible — nothing stored to drift; (2) dangling slug refs in authored content (a consumed inbox entry, a
  renamed WU in realized-by) fail the corpus conformance gate — same treatment as `Depends On` edges; (3) the
  judgment tail rides the re-groom fire-points. Seam recorded with OSD: the slug-keyed inbox removal primitive
  may also flag matching vector refs at errand completion (idempotent, sweep as backstop).
- **Storage-evolution self-check (run 2026-07-02):** composes. Records storage-agnostic and entry-granular
  slug-keyed; the project vector is low-churn authored shared state (small-structured-records class, serialized
  base-branch writes interim, version-checked writes at the shared tier); `VECTOR.USER` stays notes-backed
  per-user state. No tracked-`.arc/` assumptions baked in; compose note recorded in `draft-arc-backend.md`.

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
- **Vocabulary hygiene:** a mechanical now/next/later banding over *WUs* is a readiness view, not an outcome
  NNL roadmap — naming must not overclaim (routed to `roadmap-tooling`).

## Priority interaction (watch item)

`Priority` stays authored local urgency; goal-distance is the global lens; the recommender composes both
narratively. Two ranking signals must not fight — if goal-distance in practice subsumes `Priority`, revisit
whether `Priority` weakens to a tiebreaker. Watch, don't pre-solve.

## Scope and decomposition seams

Held as **one WU** while the design matures (cohort-fit clears trivially at this stage). Predicted seams if a
later cut is warranted: (1) the primitive — surfaces, grammar, authority, write model; (2) the derivations —
graph computation over deps/roster/targets; (3) the recommender surfaces — discovery arm, `assess-parallel-fit`
input, `arc next`. Settle at spec time.

## Dependencies / Coordination

- **`roadmap-tooling`** — the tightest seam: owns the render engine, the `STATUS.PROJECT` rename, and the
  horizon render mode, which post-vector consumes the target (goal-aware "Next") or keeps readiness vocabulary.
  Buffer entry routed at this grooming: Direction's-home resolution, NNL vocabulary hygiene, and the
  multi-dep-cell recommendation (short names + `+N` overflow collapse; lossy-scan / lossless-source framing).
- **`operational-state-docs`** — owns the record substrate. `VECTOR.*` join as managed-record members: slug
  grammar from day one, schemas + round-trip harness + conformance-gate ref validation at OSD's layer, the
  removal-primitive seam above. Buffer entry routed at this grooming. Interim markdown-canonical is fine.
- **`naming-conventions`** — the `VECTOR.{PROJECT,USER}` names join the `TYPE.QUALIFIER` family; explorer-sort
  as a codified naming criterion; the standardized WU short-name field (`Short:`, with a collision guard at
  `arc stub` and a resolver) whose render consumption is roadmap-tooling's; the `Owner → DRI` coupling. Buffer
  entry routed at this grooming.
- **`shared-inbox-model`** — two seams, routed at this grooming: the `_Hold:_` → `_Queued:_` rename proposal
  (the queue disposition becomes membership in the personal vector view, and the drain fork's four dispositions
  all become destinations); its routing-disposition **horizon test** becomes cheaply answerable once targets
  exist (a WU on the now/next path has a near activation horizon).
- **`cli-substrate-adoption`** — sequencing preference only: typed parsing over hand-rolled; not a gate.
- **arc-backend / `strategy-storage-evolution`** — self-check run (above); compose note recorded.
- **Boundary — `cross-wu-coordination`:** distinct concern, kept distinct: design-time *relatedness* (pull
  related work in, push refinements back) vs. this WU's pick-time *direction*. Both add reads at planning
  fire-points; neither absorbs the other.
- **Consumes (shipped):** `arc status <slug>` lifecycle-state resolver; the roster probe; the dep-edge
  discharge behavior (`Depends On` as live gate).

## Class

**Heavy.** High derivation — a real design authored before work can start — but composition, not invention: the
research shows nearly every element adapts established practice (NNL horizons, OKR ownership, review-as-
ratification, pull-system recommendation). The one genuinely novel seam (narrated private divergence) is
deliberately contained. Persisted to the meta at this grooming's capture.
