# Notes: Class Model Foundation

Design reasoning behind the `Class` model — the full derivation the spec compresses. Load-bearing for
authoring the constitutional amendment (DEV-RULES.ARC) and the companion ADR, which must rebuild the reasoning,
not only restate the conclusions.

## Contents

- [The floor model](#the-floor-model)
- [Naming rationale](#naming-rationale)
- [Design decisions](#design-decisions)
- [Pressure points and risks](#pressure-points-and-risks)

---

## The floor model

The model rests on two distinct "floors" whose conflation is what made the whole question feel fuzzy. Anchors:
ADR-001 principles P1 / P2 / P4 / P7; ADR-020 (scalable core); ADR-021 (Errand threshold).

### Two floors, not one

- **Discipline floor (P2 / P4) — universal, sits *below* the wrapper, never scales.** Every increment of
  change — a WU task, an Errand commit, a loose off-WU commit — closes with a review-increment gate and passes
  its quality gates. The floor of *discipline* is the smallest **commit**, not the smallest WU. This is ARC's
  identity; it does not move.
- **Wrapper floor — the smallest thing that is a WU at all.** This is the question with real design content.

### The wrapper exists for spec-worthiness; tracking is downstream

Over a bare disciplined commit, a WU adds exactly two things: an **authored spec** (P1) and a **tracked
lifecycle** (P7). The defining trait is **spec-worthiness** — work that is *more than a single logical
concern* (more than one review increment), even if multi-step / multi-file. Tracking is a *consequence* of that,
never an independent cause: graduation (an Errand that reveals unforeseen complexity mid-impl → WU) trips on
discovered *complexity*; tracking comes along for the ride. There is no "needs tracking but the work doesn't
warrant it" case. Anchors: P1's own test ("Quick fixes with clear scope can rely on well-crafted git commits")
and ADR-021 threshold #1.

### The scaling axes — derivation and scale (design is always settled)

**Invariant (P1; DEV-RULES.ARC § Design before implementation):** all settle-able design is settled *before*
implementation — best reasonable effort, never a conscious deferral. What varies is **not whether design is
settled** but **how much pre-impl work settling it demands**, along **two axes**:

- **Derivation** — how much design must be *authored* versus read off existing inputs.
    - **Errand** — zero authoring. The intent *is* the design. ("Intent *to* design" disqualifies it.)
    - **determinate work** — design is determinate from existing inputs (issue / pattern / clear intent); the
      spec *records* it lightly, it does not *derive* it. `light` unless scale pushes it `heavy`.
    - **derived work** — settling *requires authoring* a real design (a PRD's worth): many concerns,
      alternatives, and tradeoffs that do not exist until someone works them out. Always `heavy`.
- **Scale** — how much codebase-grounding a correct impl plan demands. Co-equal: a determinate-but-large WU (a
  mechanical refactor) is `heavy` by grounding demand alone.

`Class` is `heavy` iff *either* axis is high.

### Topology — fixed floor → scalable middle → fixed ceiling (derived, not chosen)

Preference operates in the band between the demand-set floor and a fixed ceiling (max ceremony ARC offers).
**Band width shrinks as pre-impl demand rises** (along either axis), because the floor climbs toward the
ceiling:

- **Errand:** floor = ceiling = one disciplined commit. Band width **zero**.
- **Low demand (determinate, modest scale):** floor low, ceiling high. Band **wide** — preference has real room
  (`brief` ↔ `outline`).
- **High demand (a PRD-worth of derivation, or a large grounding surface):** floor near the ceiling. Band
  **≈ zero**.

Both endpoints are fixed for the same reason — degenerate bands — and only the middle scales. The derivation
line and the scale trigger are the two `heavy`-promotions.

### Atomic retires as a *tier*

Atomic-character work executes as an **Errand** below the wrapper, or graduates; ADR-020 §3's spec-in-commit
"floor exception" migrates *out of the tier model into the Errand class*, which reconciles the
ADR-020 ↔ ADR-021 tension. "Atomic" reverts to a pure character adjective. The `Class` set is
**{`light`, `heavy`}**.

### The ceremony stack — three lower-bound layers; `Class` tracks work-demand, not preference

1. **Work-demand → forced floor** (per-WU, objective, enforced via drift-promotion; either axis). *The work
   demands ≥ this.*
2. **Project preference → team floor** (set at init, trivially changeable). The consistency knob; likely a
   project-config setting per ADR-020 §8's guided-init walkthrough.
3. **User preference → personal investment *above* the team floor**; never below it.

Actual ceremony = the user's pick within `[max(demand_floor, project_floor), ceiling]`. **`Class` tracks layer
1 only** (work-demand) — neither preference layer inflates classification. A determinate WU specced heavily by
preference is still **`light`**: the *work* was light; the author simply likes rigor. This keeps `Class`
objective and useful for parallelism planning. (Intrinsic scale is not preference — a large refactor is `heavy`
by demand, not taste.)

### Invariant vs. convention (this is the "always feels like ARC")

The floor is **identical at every model position** — that invariance *is* the ARC feel; the model only moves
the convention layer on top.

- **Floor (principle-forced):** a spec in some form (P1); a task list when multi-increment (P2 + P7);
  intent-verification of completed work against the spec (P1); the discipline floor (P2 / P4). Always present,
  every tier above Errand.
- **Convention (opinionated, scalable, configurable):** spec *template weight*; phase count beyond one;
  pre-execution task-list audit (a strong default, not a floor); iteration passes.

The *machinery available is identical at every depth* — the same full-strength workflows, grounding audit,
review, and gates, **parameterized by depth rather than forked**. What differs is how much there is to apply it
to. (The grammar that realizes this — the spec template family and the task-list phase grammar — is
`scalable-authoring-pipeline`'s; this WU defines the model that says it must be parameterize-not-fork.)

### The historical "Required vs Available" rejection

The model explicitly answers the historical rejection — which was about making *execution discipline* optional
(interlocks removed, gates skipped). This model does none of that: discipline is enforced at every position.
What varies is design-authoring labor. Keep this distinction sharp in the constitutional amendment — the
scaled-ceremony framing must not read as license to make discipline optional.

## Naming rationale

Settled after a focused external-vocabulary research pass and a model-refinement pass. Research informed the
names; the calls are the project's. The rejections matter as much as the choices when authoring the
definitions.

- **`Class`, not `Complexity Tier` or bare `Tier`** — a binary *kind* of work (two characters, not rungs);
  sidesteps the quality-gate `Tier 1/2/3` collision; `Complexity Tier` under-describes a two-axis aggregate.
- **`light` / `heavy`, not `light` / `full`** — natural antonyms; `heavy` reads as the roadmap intuition and,
  since scale is now a legitimate component, "heavy = lots of total work" is *accurate*. Guardrail: `heavy` is
  about design-derivation or grounding scale, **not raw code volume**.
- **`planning depth` (low / medium / high), not `process intensity`** — resolved per stage; needs a *magnitude*
  vocabulary distinct from the spec-form names. `depth` is the noun; `planning` anchors it to the
  `State: Planning` stages it spans. Rejected: `rigor` (mis-frames the bottom — "low rigor" reads as permission
  to be sloppy), `process intensity`, `formulation depth`.
- **`brief` / `outline` / `detailed`, not `sketch`** — `sketch` connotes rough / will-be-redone, the opposite
  of a floor spec (concise *and* authoritative *and* complete at its scope). Only `detailed` splits by
  feature / technical into PRD / RFC, because only `detailed` derives.
- **`derivation` + `scale` stay explanation, never labels** — inverse-correlated with "weight" and loading
  different stages; surfacing them as labels would invert awkwardly. They live in the strategy doc's definition
  and the boundary tests.

## Design decisions

- **`Class` as structural differentiation, not opt-in optionality.** Each spec form has a distinct artifact
  shape (`brief` paragraph-spec vs `detailed` phased PRD/RFC); reviewers / agents / tooling read the explicit
  `**Class:**` field and the artifact shapes, not which optional steps were skipped. `Class` is not perfectly
  inferable from spec form (the `outline` straddle), which is exactly why it is recorded explicitly.
- **Scaffolding is `Class`-agnostic; the value is forced at readiness, not creation.** `arc start` /
  `init-work-unit` produce a uniform minimal Planning container defaulting `Class: [TBD]` (no `--class` flag, no
  quick tier). But `Class` must be *present* before a WU is a start candidate — so it is forced at **entry into
  `planned/`** (the `graduate-work-unit` workflow) and lightly re-tuned at each subsequent lifecycle touchpoint.
  "Born in planning" sharpens to "born at planned-entry / first real triage," not deferred to activation (too
  late — the start / balance decision precedes it).

- **Estimate-vs-realized ratchet (the lowball-incentive fix).** The one-way ratchet protects *realized*
  design-authoring work, not estimates: once a stage authors design at some depth, `Class` cannot drop below that
  floor; but a value set *before* that work (an estimate) is freely revisable in both directions. Correcting a
  too-high estimate down is not a demotion — no work is discarded. This is what lets the forcing function demand a
  real value at planned-entry without collapsing the signal: estimating `heavy` costs nothing if planning reveals
  `light` (you correct down), and an over-high estimate never forces over-heavy planning because depth re-resolves
  per stage from the axes — so there is no incentive to lowball. `[TBD]` is the pre-estimate sentinel, legal in
  `provisional/` (a rough capture shouldn't force a guess) but not in `planned/`.

- **`classify-work-unit` as the DRY triage home.** The boundary-test triage plus the ratchet rule are packaged
  once as a loadable method every touchpoint declares, rather than restated per surface. Methods are the existing
  loadable-fragment mechanism (no `composable-workflows` dependency); authored as a self-contained extractable
  block so it fragments cleanly when composition lands.

- **"Graduation" = the readiness ladder, not decomposition.** `provisional → planned → active` are graduation
  rungs (climbing readiness); `init-work-unit` already graduates `planned → active`, and `graduate-work-unit`
  adds the `provisional → planned` rung. A WU *splitting into a cohort* is decomposition — it yields a cohort, it
  is not a promotion — so `decomposition-machinery`'s `WU → cohort` workflow renames off "graduation" (its draft
  borrows the term by analogy to `init`'s usage; that analogy over-stretches). Routed to its inbound buffer;
  coordinated in the cohort doc.
- **The internal spec is always a separate doc.** The lightest spec is a separate `spec-{name}.md` at `brief`
  form — never a `## Scope` header section in the task list (ADR-020's invariant floor). "Spec lives in a doc,
  regardless of `Class`."
- **Discipline preserved below the wrapper.** The mandatory review-increment stop applies to Errand work too,
  at commit boundaries instead of task-checkbox boundaries. This *is* the discipline floor — it belongs to no
  tier.
- **Atomic-the-character vs atomic-the-shape.** "Atomic" describes the work's *character* (single bounded
  concern), not a tier. Under `partial`, atomic work goes direct-to-main; under `full`, the same intent becomes
  an **Errand** (`chore/<slug>` + PR), promoting to a WU only when the threshold trips. The word's meaning is
  consistent across modes; the framework's shape adapts. This WU owns only the *tier-side* reconciliation
  (atomic-character defaults to an Errand, promoted via `run-errand → init-work-unit`); the Errand operational
  path itself shipped (`errand-enablement` + `work-routing-discipline`).

## Pressure points and risks

For the companion ADR's risks section and the drift-mitigation guidance.

- **`Class` drift via under-specification.** Adopters may default to `light` to avoid `detailed`-spec ceremony.
  Mitigations: the estimate-vs-realized ratchet removes the *incentive* to lowball (a too-high estimate is freely
  correctable down, so an honest estimate costs nothing); the self-diagnosing depth-shift signal (a heavy
  downstream artifact over a minimal spec *is* the floor-was-too-low signal); the explicit `**Class:**` field
  invites reviewer scrutiny ("Class: light" on a complex change has the signal to push back); strategy-doc
  guidance with concrete examples on each side of the derivation line and scale trigger.
- **Constitutional change scope.** The `Class` definitions, boundary tests, and scaled-ceremony framing are
  constitutional-level additions to DEV-RULES.ARC, comparable to ADR-016. Companion ADR required.
- **Light WU discoverability.** Short-lived `light` WUs could make session-init's active-WU enumeration noisy.
  Mitigation: the STATUS.USER `Class` render (the in-flight view carries the heavy/light composition);
  auto-cleanup of completed-but-not-swept WUs. (Less acute than the original atomic-tier version, since
  atomic-character work is now an Errand, not a WU.)
