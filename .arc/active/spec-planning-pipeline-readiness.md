# Spec (`detailed` · `RFC`): planning-pipeline-readiness

- **Origin:** [internal]

- **Purpose:** Make the planning-pipeline readiness surface coherent — extract one shared `assess-draft-readiness`
  formalization-ready judgment, split `create-spec`'s collapsed Finalize interlock into review-then-proceed gates
  (with a general overlay-recommendation norm), and replace session-init's free-form `Next Action` prose-parse with
  code-owned planning-stage-pointer mechanics (a `Current Workflow` encoding field + event-driven `Design`), folding
  the `init-work-unit` readiness-pointer fix into the field model.

---

## Introduction / Context

The planning pipeline runs three authoring stages — `draft-design` → `create-spec` → `generate-tasks` — across
which one judgment recurs: **is this draft ready to formalize into a spec?** Today that judgment, and the machinery
that tracks where a work unit sits in the progression, are duplicated, mis-placed, and under-gated:

- **The readiness judgment is re-implemented in two places.** `draft-design` owns the
  `fresh / rough / maturing / formalization-ready` ladder plus the formalization-ready bar inline; `create-spec`
  re-implements a lighter entry backstop and separately owns the inbound-buffer drain. Two implementations of one
  judgment drift apart.
- **`init-work-unit` pre-judges readiness mechanically.** It writes a `Next Action` workflow pointer at init time —
  a guess about where the work is that the consuming session frequently finds untrue.
- **`create-spec` Finalize collapses two gates into one.** Spec-review / iteration approval and proceed-to-finalize
  approval (draft retirement + meta update + commit) share a single `workflow-interlock`. In practice, answering an
  advisory overlay question (e.g. the Novel-ADR scope prompt) reads as authorization to finish Finalize, leaving no
  clean gate for a full spec read, feedback, or iteration.
- **session-init prose-parses the planning sub-stage.** Between phases it resolves the lifecycle workflow
  deterministically from the meta `State` (`execution` → `process-task-loop`, `integration` →
  `integrate-work-unit`), but at `State: Planning` it reads the free-form `Next Action` to pick
  `draft-design` / `create-spec` / `generate-tasks`, with an artifact-existence guess as fallback. The fallback is
  lossy — a draft with no spec can't distinguish "still drafting" from "drafting done, starting spec" — which is
  exactly why `Next Action` ends up overloaded.

These four defects share one seam: *when is a draft formalization-ready, who decides, and where does the stage
pointer live?* This work unit cuts that spine coherently in a single iteration rather than patching each defect in
isolation. The iteration-*content* concerns (inbound-buffer-drain ceremony, depth-aware navigation,
oversized-increment audit) were split out to `planning-iteration-mechanics`; the cold-start-init cleanup to
`cold-start-init-polish`. What remains here is the readiness / stage-pointer spine.

This work unit is a member of the `lifecycle-state-machine` cohort. Its § C mechanics build on
`lifecycle-transition-core`'s executor encoding pattern and `lifecycle-state-resolver`'s state model; that
dependency is a live gate discharged at `lifecycle-transition-core`'s activation, not a hard blocker on authoring
this spec (see Cross-cutting Considerations § Dependencies).

## Goals

- **One readiness judgment, one home.** The "is this draft formalization-ready?" criterion is defined once and
  consumed at both live fire points (`draft-design` loop-exit, `create-spec` entry) — no second implementation to
  drift.
- **The readiness call lands against the draft's actual state.** No mechanical upstream step pre-judges readiness;
  the consuming session evaluates it when it runs.
- **A clean review gate at spec finalization.** A full spec read, feedback, and iteration are possible before any
  irreversible Finalize action (draft retirement, commit).
- **Advisory forks carry a recommendation.** Every advisory accept/decline (or either-or) prompt in the planning
  pipeline states the recommended option with rationale — never a bare fork.
- **session-init resolves the planning sub-stage deterministically.** It reads one code-owned field, never
  prose-parsing `Next Action`, and the read is not lossy.
- **The substrate pointers are drift-proof by construction.** Reads resolve from state (nothing stored to drift);
  writes are CLI-mutated and consistency-checked at commit.

## Non-Goals

- **The inbound-buffer-drain *act*.** This work unit's readiness method only *checks* that the buffer is drained; it
  never performs the integration. The first-class mandatory drain step is `planning-iteration-mechanics`' concern;
  the existing `create-spec` inline hook remains the drain's working home until then. No drain machinery is built or
  moved here.
- **Iteration-content mechanics** — depth-aware `Class` navigation, the oversized-increment audit, the
  iteration-time inbound-buffer ceremony. Routed to `planning-iteration-mechanics`.
- **Cold-start init polish.** Routed to `cold-start-init-polish`.
- **The concrete CLI verb spelling for the planning-stage events.** The verb *names* coordinate with
  `idiomatic-alignment` and the `cli-substrate-adoption` substrate; this spec pins the event→write *contract*, not
  the surface spelling (see Open Questions).
- **Re-opening any settled design direction.** The three sections' directions are settled in the draft; this spec
  crystallizes them. Discovery surfacing unsettled *design* would be a derivation signal routed back to drafting,
  not resolved here.
- **A generic transition engine or the executor itself.** `Current Workflow` writes ride
  `lifecycle-transition-core`'s executor; this work unit specifies the planning-stage events and field semantics,
  not the executor.

## Proposed Design

Three coupled sections sharing the readiness seam. Each is independently buildable once its dependency is met;
together they make the surface coherent.

### A. Shared `assess-draft-readiness` formalization-ready method

**A1 — The method.** Author a new method `system/methods/assess-draft-readiness.md` (with its package-source mirror
at `packages/arc-framework/arc/system/methods/assess-draft-readiness.md`), following the standard method shape
(frontmatter `name` / `description` / `override-active: false`, an `.override` slot, and a `.default` body). It is
**conductor-independent**: a `Next Action` points at a skill or workflow, never a method, so the
readiness *owner* the consuming session runs is `arc-plan` → `draft-design`; the method is the judgment those
fire points share.

**A2 — The formalization-ready bar (the single criterion set).** The method evaluates a draft (or its determinacy
confirmation) against one bar, identical at every planning depth:

1. **All settle-able design is settled** — no open decision that could and should be made pre-implementation
   (an open *implementation detail* is fine; a masked *design* decision is not).
2. **A stateable success signal exists** — the author can state how they'll know it worked.
3. **The inbound buffer is drained** — the draft carries no un-integrated `## Inbound Buffer — Pending Integration`
   section.

A draft clearing all three is **formalization-ready**; otherwise the method returns **not-ready** plus the specific
gaps. The bar is depth-relative in *distance* only — reached faster at `low` / `medium`, crossed over more passes
at `high` — never in *height*.

**A3 — Checks-only on the buffer (the settled seam).** Criterion 3 is a *check*: the method reads whether the
buffer section is present and un-integrated; it **never performs the drain**, at either fire point. The drain *act*
is not this work unit's at all — the first-class mandatory `draft-design` drain step (the "ceiling") is
`planning-iteration-mechanics`' concern; until it ships, the existing minimal `create-spec` inline hook (the
"floor") remains the drain's working home. There is **no hard dependency edge in either direction**: because
routing iteration through `draft-design` fires `assess-draft-readiness` *earlier* (loop-exit) than the drain's
current home (`create-spec` entry), an undrained buffer simply yields a correct *not-ready* verdict — the planner
drains inline (prompted by that verdict, using the floor's guidance) before declaring ready, with the `create-spec`
hook as backstop. The interim is coherent, not a gap.

**A4 — Two fire points, one contract.** Both fire points call the method with the same inputs and read the same
verdict; they differ only in what they do with **not-ready**:

| Fire point               | Input passed                          | On **ready**          | On **not-ready**                                   |
|--------------------------|---------------------------------------|-----------------------|----------------------------------------------------|
| `draft-design` loop-exit | the evolving `draft-*` + WU context   | exit the shaping loop | keep iterating (re-synthesize against the gaps)    |
| `create-spec` entry      | the `draft-*` (or `[none]`) + context | proceed to discovery  | surface gaps; resolve inline or return to drafting |

The **contract**: given the draft (or its absence) and the WU context, return `{ ready: boolean, gaps: [...] }`.
The caller owns the routing; the method owns the criterion.

**A5 — Edits to the consuming workflows.**

- `draft-design.md` — replace the inline formalization-ready bar (the readiness-states block) with a call to
  `assess-draft-readiness` at loop-exit. The `fresh / rough / maturing / formalization-ready` ladder *labels* stay
  in `draft-design` as continuity vocabulary; the *bar* moves to the method.
- `create-spec.md` — replace the inline entry backstop (the "assess readiness: unresolved design decisions, open
  unknowns, missing concrete detail" paragraph) with a call to `assess-draft-readiness` at entry. The inline
  buffer-drain hook stays (it is the drain floor, per A3) but the *readiness check* over it delegates to the method.
- Both workflows declare `assess-draft-readiness` in their `arc.methods` frontmatter.

### B. `create-spec` review/proceed interlock split + overlay-recommendation norm

The concern splits by tier for one DRY reason: an interlock is workflow control flow; an ambient behavior with no
owning procedure is a rule.

**B1 — Interlock split → `create-spec.md` (the workflow body).** `create-spec` Finalize's single `workflow-interlock`
becomes two sequential gates:

1. **Review / iterate gate.** After the spec is saved and self-reviewed (`spec-review`), stop and surface the spec
   location + self-review findings for a **full read, feedback, and iteration**. Iteration loops here against the
   saved spec. This gate's approval means "the spec is right," not "finish Finalize."
2. **Proceed-to-finalize gate.** Only after the review gate clears, proceed to the irreversible Finalize actions —
   draft retirement (`notes-*` migration + draft delete), meta update, and the `workflowCommit`. This gate's
   approval authorizes those actions.

This stays in the workflow body — a shared method carrying `create-spec`'s specific two-gate structure would be
*less* reusable, and methods don't own interlocks.

**B2 — Recommend-on-overlay-prompts → a behavioral norm in `DEV-RULES.ARC`.** Add a short always-on rule. Candidate
phrasing (final wording settled at authoring):

> **Recommend on advisory forks.** When surfacing an advisory accept/decline (or either-or) fork — not a mandatory
> approval gate — state the recommended option with a one-line rationale; never a bare fork.

The rule lands in `DEV-RULES.ARC` (with its package-source mirror) because the advisory overlays are scattered
across four sites in two tiers — `create-spec.md` (the ADR companion), `draft-design.md` (the Novel overlay),
`resolve-planning-depth` (depth re-entry), `spec-review` (findings) — with **no single owning method**. That
scatter is the signal it is a *behavior*, not a *procedure*: a method needs an owner and an invocation point; an
ambient norm has neither. Being always-loaded operational context (unlike an authoring-time strategy), the rule
covers all four sites at once. **Authoring constraints:** the phrasing must generalize to *every* advisory fork
(not Novel- or planning-specific) and stay token-tight, since it is always loaded.

**Forward-compat with `composable-workflows`.** The rule is the *policy* (you must recommend). If
`composable-workflows` later wants a reusable *mechanism* — a `public + fixed` "present-overlay" fragment that
formats the recommendation — that fragment *implements* this policy. Different tiers; they compose. This work unit
authors the norm, not the mechanism.

### C. Planning-stage-pointer mechanics — `Current Workflow` field + event-driven `Design`

Split the operational substrate pointer (where the work is, machine-resolved) from free-form judgment (what to do
next, human prose).

**C1 — `Current Workflow` (new code-owned encoding field).** A new meta field naming the active lifecycle workflow,
meaningful only under `State: Planning` (between phases; the `State` → coarse-bucket resolution for
`execution` / `integration` is unchanged). Properties:

- **Encoding format: bare workflow basename** — `draft-design` / `create-spec` / `generate-tasks`, and `[none]`
  outside planning. (Decision: bare basename over a separate state token — it is directly consumable by
  session-init's lifecycle-workflow load, human-legible, and matches the executor's event writes. See Alternatives.)
- **Single-owner: written only by the executor** at each planning-stage transition; never hand-edited.
- **session-init reads one deterministic field** to resolve the planning sub-stage — no prose-parse.

**C2 — `Next Action` loses the workflow pointer.** It becomes pure within-stage judgment (what the author should do
next *inside* the current stage), or, at a clean stage boundary, the bracketed sentinel **`[begin current
workflow]`** — semantically correct (the workflow *name* lives in `Current Workflow`, so no duplication), and
distinct from `[none]` (which reads as parked).

**C3 — `Design` becomes an event-driven pointer** (not a presence-scan):

- `[none] → draft-<name>` at draft creation.
- `draft-<name> → spec-<name>` **at `create-spec` finalization** — not at spec existence (a spec can exist
  half-written while the draft is still authoritative).
- No forced draft-first: a `Light` WU may go `[none] → spec-<name>` directly.
- The optional `notes-*` content migration is orthogonal — `Design` never points at `notes-*`. The mandatory
  draft-delete + repoint is the mechanical part, riding the finalization edge.

**C4 — `init-work-unit` folds in.** With the field model above, `init-work-unit` no longer writes a `Next Action`
workflow pointer at all. It writes `Current Workflow` (via the executor) and leaves the readiness call to the
consuming session (`arc-plan` → `draft-design`), which already does assess-then-route against the draft's actual
state. "Stop pre-judging spec-readiness" falls out for free. (The rejected alternative — an extractable
judgment block *inside* `init-work-unit` — is the wrong altitude; see Alternatives.)

**C5 — Planning sub-stages become CLI-recognized events.** For the executor to advance the pointers, the planning
sub-stages (`draft-design` / `create-spec` / `generate-tasks`) must be **CLI-recognized events** — they are
markdown-only today. This is **in scope**: deferring it would leave session-init prose-parsing the sub-stage
*behind* the new field — the very defect § C exists to kill, shipped half-dressed. The executor writes two
field-families across the planning stages — `Current Workflow` (via `set-stage`) and `Design` (via
`repoint-design`) — each riding an existing workflow moment (no new ceremony); `Next Action` is hand-set by the
workflow alongside them.

**`Current Workflow` advances at the preceding stage's finalization, not at each stage's entry.** The advance fires
at a stage's *finalization* (`set-stage <next>`), because the typical flow finalizes a stage, hands off, then runs
the next stage in a fresh session — so the field must point at the next stage *at handoff*, not only once it is
entered. Advancing at entry would strand `Current Workflow` on the just-finished stage across that gap,
mis-resolving the read. At a finalization that advances, `Next Action` is set to the `[begin current workflow]`
boundary sentinel; the `generate-tasks` terminus has no next planning stage (activation clears the field), so its
finalization sets a within-stage `Next Action` instead.

**Exactly one entry write survives: `create-spec`, gated on draft-absence.** `draft-design` is the only skippable
stage, so `create-spec` is the only stage reachable "cold" — entered without its predecessor having advanced the
pointer. The tell is a missing draft (`draft-{name}.md` absent): draft-design was skipped, so `Current Workflow`
still reads the scaffold default `draft-design`. `create-spec`'s entry corrects it (`set-stage create-spec`) so a
mid-stage handoff resolves correctly. When a draft exists, draft-design's finalization already advanced the pointer
here, so the entry write is skipped. The other two stages need no entry write — `draft-design` is set by the init
scaffold, and `generate-tasks` is only ever reached through create-spec's finalization-advance.

Event writes (each rides an existing workflow moment — no new ceremony):

- **Init scaffold** → `Current Workflow = draft-design` (the entry default; written at scaffold, not by the
  draft-design workflow).
- **Draft created** (first draft) → `Design: [none] → draft-<name>` (conditional — only when a draft is produced).
- **`draft-design` finalization** (draft crosses into create-spec) → `Current Workflow = create-spec`;
  `Next Action → [begin current workflow]`.
- **Enter `create-spec` without a draft** → `Current Workflow = create-spec` (skip-draft correction; idempotent on
  the no-draft `low` path).
- **`create-spec` finalization** → `Design: draft-<name> → spec-<name>`; `Current Workflow = generate-tasks`;
  `Next Action → [begin current workflow]`.
- **`generate-tasks` finalization** → `Next Action = Task list finalized — ready to activate` (terminus — no next
  planning stage; `activate` clears the field).
- **Planning exit (`activate`)** → `Current Workflow → [none]` (`State: Active` takes over; rides activate).

The `Current Workflow` writes (finalization-advance plus the one create-spec entry correction) are the core that
kills the prose-parse defect (what session-init reads to resolve the sub-stage); the two `Design` repoints are the
presence-scan → event improvement. All ride `lifecycle-transition-core`'s `Branch`-field executor precedent — a
write bolted to each existing edge.

**C6 — The drift-control principle.** *Resolve-don't-store for reads, CLI-mutate + consistency-hook for writes.*
session-init resolves the sub-stage by reading `Current Workflow` directly (no derived scan to go stale). The write
side is guarded by an **encoding-consistency test** asserting `Current Workflow` agrees with the rest of the meta
state — under `State: Planning`, `Current Workflow ∈ {draft-design, create-spec, generate-tasks}` and is consistent
with the `Design` pointer (e.g. `Current Workflow = generate-tasks` implies `Design` points at a `spec-*`); under
any non-`Planning` state, `Current Workflow = [none]`. Redundant-but-machine-verified beats derived-but-fragile.

**C7 — session-init read-path.** session-init's lifecycle-workflow resolution (the planning-branch arm of its
context-load step) reads `Current Workflow` to select the workflow directly, replacing the `Next Action`
prose-parse. A meta with no usable field value (a legacy meta predating the field, or a fresh in-place scaffold)
resolves to the `draft-design` entry stage — the conservative default. No artifact-existence scan is attempted:
presence is too ambiguous to refine the stage (a draft coexists with a spec mid-`create-spec`), and a fresh init
genuinely starts at `draft-design`; the encoding-consistency guard (C6) catches a stale field on the write side.

## Alternatives & Rationale

**`Current Workflow` encoding — bare basename vs. a separate state token.** *Chosen: bare workflow basename.* A
distinct abstract state token (e.g. `planning.drafting`) would add an indirection layer between the field and the
workflow session-init must load, and a token→workflow mapping table to maintain. The bare basename is already what
the executor writes in the event table, is directly consumable by session-init's existing
`sessionType` → workflow load, and is human-legible in the meta. The consistency test (C6) supplies the validation
a token's type-safety would otherwise motivate. Cost: the field couples to workflow *filenames*; mitigated because
those names are stable lifecycle anchors and the consistency test catches a stale value.

**Readiness judgment — one shared method vs. keep two implementations vs. inline-at-each-site.** *Chosen: one shared
method.* Two implementations are the status-quo defect (they drift). Inlining the criterion at each fire point
duplicates a judgment that has a natural single home and is conductor-independent. A method — "a procedure with a
contract" — is the right shape: one criterion set, two callers, each owning its own routing.

**Overlay-recommendation home — `DEV-RULES.ARC` norm vs. a new method vs. inline-then-extract.** *Chosen: a
behavioral norm in `DEV-RULES.ARC`.* A new method is the wrong shape — no procedure, no owner, no single invocation
point; the recommendation content is runtime-situational, not pre-bakeable in workflow text. Inline-at-each-site
duplicates a norm that has a natural single home today and defers the extraction. An always-loaded ambient rule
covers all four sites at once and is the correct tier for a behavior (vs. a procedure).

**Interlock split — workflow body vs. a shared method.** *Chosen: workflow body.* An interlock is workflow control
flow. A method carrying `create-spec`'s specific two-gate structure would be *less* reusable, not more — methods
don't own interlocks.

**`init-work-unit` readiness — fold into the field model vs. an extractable judgment block inside init.** *Chosen:
fold in.* The field model makes the readiness pre-judgment unnecessary: init writes `Current Workflow` and the
consuming session evaluates readiness against the real draft. An extractable judgment block inside `init-work-unit`
is the wrong altitude — it preserves the pre-judgment and just relocates it.

**CLI event-recognition — in scope vs. deferred to `cli-substrate-adoption`.** *Chosen: in scope, with a guard.*
Deferring leaves session-init prose-parsing the sub-stage behind the new field — the defect shipped half-dressed,
the *inconsistent-if-deferred* case the cohort's consistency-on-exit standard says to absorb. **Guard:** if
create-spec-time / build-time discovery shows the event-recognition surface is genuinely a separable
`cli-substrate-adoption` concern, revisit the cut then. The lean is **include**.

## Cross-cutting Considerations

### Dependencies (cohort coordination)

- **`lifecycle-transition-core` (live gate, discharged at its activation).** § C's executor writes ride
  transition-core's executor encoding pattern (the `Branch`-field write is the worked precedent) and its planning
  sub-stage transitions. § C cannot land in code before transition-core's executor exists; A and B have no such
  dependency and can land independently. The edge is a live gate, not a hard blocker on authoring this spec or its
  task list.
- **`lifecycle-state-resolver`.** § C's reads compose over the resolver's `(phase, location)` state model and its
  slug→state projection. Planning *maturity* (draft/spec/tasks presence) is a derived readiness overlay owned here +
  `roadmap-tooling`, **not** a state value — consistent with the cohort's shared-contracts record.
- **`planning-iteration-mechanics` (contract, not gate).** Owns the first-class buffer-drain step (the ceiling); the
  seam is checks-only here with the `create-spec` floor as interim home (A3). No dependency edge either way.
- **`idiomatic-alignment` + `cli-substrate-adoption`.** The concrete CLI verb spelling for the planning-stage events
  coordinates with idiomatic verb-naming and the CSA substrate; this spec pins the contract, not the spelling.
- **`composable-workflows`.** B2's norm is policy that a future CW present-overlay mechanism would implement.

### Forward-compat (arc-backend / OSD)

Per the cohort's design guard: the `Current Workflow` field and the `Design` pointer are modeled as **logical meta
fields**, resolved/written without inferring state from `git branch` / `git log`. This keeps them arc-backend-safe
(ADR-022) — when `operational-state-docs` re-homes transition behaviors onto structured records, the field model
lifts onto records with zero reshape. No new per-artifact boolean or baked-in "tracked in the code repo" assumption
is introduced.

### Testing

- **Encoding-consistency test (C6)** — asserts `Current Workflow` agrees with `(State, Design-pointer)` across the
  planning sub-stages and resolves to `[none]` outside planning. This is the write-side drift guard.
- **session-init read-path** — covered by the resolution test surface for the planning-branch lifecycle-workflow
  selection (reads `Current Workflow`; falls back on absent field).
- **Event writes** — each of the six events asserts the correct field-family write at its edge.
- Method / workflow / rule edits are documentation-tier (markdown lint + reference-integrity); the CLI event +
  field machinery is code-tier (Vitest, per the testing tiers). Exact test placement is `generate-tasks`-grade.

### Migration / rollout

- **Legacy metas** (no `Current Workflow` field) — session-init's artifact-existence fallback (C7) handles them;
  no forced backfill. New transitions write the field going forward.
- **`Next Action` semantics shift** — existing metas with a workflow pointer in `Next Action` still parse under the
  fallback; the field model takes over as transitions re-write the metas.

### User-facing process impact

The readiness-method extraction and the interlock split change the *planner's* experience (a clean spec-review gate;
advisory forks that recommend), not an end-user API. This is the secondary dimension riding the RFC; the dominant
derivation is the technical pointer-mechanics design.

## Success Criteria

1. `system/methods/assess-draft-readiness.md` exists (+ package mirror), defining the three-criterion
   formalization-ready bar and the `{ ready, gaps }` contract, and is declared in both `draft-design.md` and
   `create-spec.md` frontmatter.
2. `draft-design.md` and `create-spec.md` each call `assess-draft-readiness` at their fire point; neither retains a
   second inline implementation of the readiness bar.
3. The buffer criterion is checks-only — no drain *act* is added to or moved by this work unit; the `create-spec`
   inline drain hook remains as the floor.
4. `create-spec.md` Finalize presents two sequential gates (review/iterate, then proceed-to-finalize); approving the
   first does not authorize draft retirement or commit.
5. A general overlay-recommendation rule is present in `DEV-RULES.ARC` (+ package mirror), phrased to generalize to
   every advisory fork and token-tight.
6. The meta `Current Workflow` field is written by the executor at stage entry and advanced at the preceding stage's
   finalization, and read by session-init to resolve the planning sub-stage; `Next Action` no longer carries a
   workflow pointer (it carries within-stage judgment or the `[begin current workflow]` boundary sentinel).
7. `Design` repoints event-drivenly (`[none] → draft` at draft creation; `draft → spec` at create-spec
   finalization), never by presence-scan.
8. `init-work-unit` writes `Current Workflow` and no longer writes a `Next Action` workflow pointer.
9. The encoding-consistency test passes and fails correctly on an injected mismatch.
10. session-init resolves the planning sub-stage from `Current Workflow` with no prose-parse on a current-format
    meta, and defaults to the `draft-design` entry stage when the field is absent.

## Open Questions

Implementation detail, resolved during the work (not deferred design debt). Each carries a **lean** so the
direction is set even where the surface spelling waits for build time.

- **CLI verb shape for the planning-stage events** — the concrete verb spelling that fires the six events;
  coordinates with `idiomatic-alignment`'s verb-naming and the `cli-substrate-adoption` substrate. The event *set*
  and the write *contract* are pinned (C5).
    - **Lean:** a single parameterized stage-pointer mutator in `lifecycle-transition-core`'s mutator bundle — one
      `Current Workflow` write keyed by the target stage — invoked by the planning workflows at their existing
      transition edges, rather than minting bespoke per-stage top-level verbs. The two `Design` repoints ride the
      edges that already exist (draft-create, create-spec-finalize, activate). The mechanism is settled
      (mutator-bundle extension); only the user-facing spelling waits on `idiomatic-alignment`.
- **Consistency-test harness specifics** — the assertion mechanics and placement (test tier, fixture shape). The
  invariant it asserts is settled (C6).
    - **Lean:** implement the invariant as a pure validator over the parsed `(State, Current Workflow, Design)`
      tuple in `lib`, unit-tested (no fs/git side effects). The single-owner executor write plus that unit test is
      the floor here; the pre-commit-hook wiring that would also catch hand-edits is a forward-compat seam routed
      to `quality-gate-hooks` (the meta-layout hook infra isn't shipped yet), hardening the guard later.
- **Event-recognition cut (guarded)** — whether the CLI event-recognition surface is separable as a
  `cli-substrate-adoption` concern.
    - **Lean:** include here and hand-roll the minimal event recognition on `lifecycle-transition-core`'s executor
      (per the cohort's "hand-roll now, CSA migrates the mechanics later" posture); never split the surface out.
      Revisit only if build-time discovery shows the recognition genuinely cannot be hand-rolled without CSA's
      substrate — in which case build the minimal version here anyway and let CSA migrate it, keeping the WU whole.
