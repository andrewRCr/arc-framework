# Notes: Class Model Foundation

Design reasoning behind the `Class` model — the full derivation the spec compresses. Load-bearing for
authoring the constitutional amendment (DEV-RULES.ARC) and the companion ADR, which must rebuild the reasoning,
not only restate the conclusions.

## Contents

- [The floor model](#the-floor-model)
- [Naming rationale](#naming-rationale)
- [Design decisions](#design-decisions)
- [Pressure points and risks](#pressure-points-and-risks)
- [Resolved: the `novel` tier (within-`heavy` calibration)](#resolved-the-novel-tier-within-heavy-calibration)

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

### The scaling axes — derivation and scale / complexity (design is always settled)

**Invariant (P1; DEV-RULES.ARC § Design before implementation):** all settle-able design is settled *before*
implementation — best reasonable effort, never a conscious deferral. What varies is **not whether design is
settled** but **how much work the two axes demand** — concentrated in pre-implementation authoring, but also
surfacing as execution novelty / care and review rigor — along **two axes**:

- **Derivation** — how much design must be *authored* versus read off determinate inputs. Also tracks how novel
  vs. routine the execution is, and the validation rigor at review.
    - **Errand** — zero authoring. The intent *is* the design. ("Intent *to* design" disqualifies it.)
    - **determinate work** — design is determinate from existing inputs (issue / pattern / clear intent); the
      spec *records* it lightly, it does not *derive* it. `light` unless scale / complexity pushes it `heavy`.
    - **derived work** — settling *requires authoring* a real design (a PRD's worth): many concerns,
      alternatives, and tradeoffs that do not exist until someone works them out. Always `heavy`.
- **Scale / complexity** — how large or intricate an existing-code surface a correct impl plan *and execution*
  must navigate (the codebase-grounding demand). Co-equal: a determinate-but-large refactor is `heavy` by
  grounding demand alone, and that largeness carries into careful execution and heavier review.

`Class` is `heavy` iff *either* axis is high. It is *driven* by these intrinsic axes alone — never raw output
volume or preference — and *indicates* the work's weight across planning, execution, and review; what stays
invariant at every `Class` is execution *discipline*, never the depth, novelty, or care the work demands.

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
**{`light`, `heavy`, `novel`}** (see § Resolved: the `novel` tier). Atomic is *not* a fourth `Class` value: it
is a *character* (cardinality — one logical concern) below the wrapper, where no meta records a `Class`; `Class`
is *weight* and begins at the `light` floor. The two are the two questions of one work-sizing spectrum
(Errand floor → `novel` ceiling), surfaced as framing, never flattened into a single scale.

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

- **`Class`, not `Complexity Tier` or bare `Tier`** — a *kind* of work (not rungs); sidesteps the quality-gate
  `Tier 1/2/3` collision; `Complexity Tier` under-describes a two-axis aggregate.
- **`light` / `heavy`, not `light` / `full`** — natural antonyms; `heavy` reads as the roadmap intuition and,
  since scale / complexity is now a legitimate component, "heavy = lots of total work" is *accurate*. Guardrail:
  `Class` is *driven* by design-derivation or grounding scale / complexity, **not raw code volume** — though a
  `heavy` WU does *indicate* heavier execution and review.
- **`novel`, not `heavy+` or a `light` / `moderate` / `heavy` ordinal** — it names the *cause* (invention) where
  `light` / `heavy` name *weight*; that register break is *kept on purpose*, because the top is a distinct kind
  (invention vs. composition), not just more weight, so the word carries the signal and retroactively sharpens
  what `heavy` is. An ordinal was rejected: it implies uniform single-axis spacing (false — `light↔heavy` and
  `heavy↔novel` are two different tests, and the asymmetry is a feature), and `moderate`/`heavy` would collide
  with the `planning depth` ordinal. `heavy+` works structurally but tells the reader nothing about what the top
  *is*. Mild caveat acknowledged (`novel` names the cause, not the weight); rejected alternatives if it grates:
  `foundational` (too narrow — implies infra), `deep`, `generative`.
- **`planning depth` (low / medium / high), not `process intensity`** — resolved per stage; needs a *magnitude*
  vocabulary distinct from the spec-form names. `depth` is the noun; `planning` anchors it to the
  `State: Planning` stages it spans. Rejected: `rigor` (mis-frames the bottom — "low rigor" reads as permission
  to be sloppy), `process intensity`, `formulation depth`.
- **`brief` / `outline` / `detailed`, not `sketch`** — `sketch` connotes rough / will-be-redone, the opposite
  of a floor spec (concise *and* authoritative *and* complete at its scope). Only `detailed` splits by
  feature / technical into PRD / RFC, because only `detailed` derives.
- **`derivation` + `scale / complexity` stay explanation, never labels** — inverse-correlated with "weight" and
  loading different stages; surfacing them as labels would invert awkwardly. They live in the strategy doc's
  definition and the boundary tests.

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

## Resolved: the `novel` tier (within-`heavy` calibration)

**Status:** **resolved** — `Class` becomes three-value (`light` / `heavy` / `novel`), with `novel` a distinct
*kind* (invention vs. composition) reached through the derivation axis alone. Surfaced by the model's first
dogfood (best-estimate `Class` across the 42 `planned/` metas during the Phase 5 migration); resolved in design
discussion before integrate. **Phase 5.R** executes it — the model-surface amendments, the validation re-run,
and the WU re-stamp. The reasoning below records the derivation; the decision is no longer open.

### What the dogfood exposed

Stamping 42 WUs produced **6 `light` / 36 `heavy`**, and the `heavy` band is wide: within the 36, **23 fired
`both` axes · 9 `derivation`-only · 4 `scale`-only** — and even `both` hides a `both`-high vs `both`-moderate
gradient. Two WUs an order of magnitude apart in design demand — a from-scratch methodology-model synthesis (this
very WU) vs. a compose-a-routing-scheme-from-known-surfaces WU (e.g. `arc-reinforce`) — both read a flat `heavy`.

That is signal loss against one of `Class`'s two stated purposes. `Class` is not only the design-authoring ceremony
gate; it is also **the signal roadmap and parallelism planning read to balance a worklist** (§ Class Model) — a
*magnitude / cognitive-load* signal that lets a developer judge "is my plate full?" when opening parallel work. A
wide, flat `heavy` degrades exactly that load-balancing at the top of the range, where it matters most (a second
`heavy` of moderate derivation is a different commitment than a second from-scratch synthesis).

### Diagnosis — ceiling, not threshold

The derivation trigger is *correctly* a low bar: any real design-authoring promotes to `heavy`, because the
consequence (a derived spec, heavier review) is binary. The gap is that `heavy` has **no ceiling on derivation**.
The two axes are asymmetric in this respect, and the asymmetry falls out of the model rather than being bolted on:

- **Scale = breadth** — determinate, chunkable, parallelizable, "endurance." It also *self-caps*: runaway breadth
  trips the *decompose* threshold (multiple concerns → cohort) rather than climbing without bound. The exception —
  a single coherent high-breadth WU (a 200-file rename) — stays one concern, but its load is endurance, not
  juggling. So scale has a natural ceiling at `heavy`.
- **Derivation = depth** — novel, serial, context-saturating, **uncapped**. Depth is what actually saturates a
  person's plate, so it is the load-dominant dimension for parallelism.

So the missing resolution is **on the derivation axis only**.

### The decision: a three-value `Class` — `light` / `heavy` / `novel`

- `light` ↔ `heavy` is **unchanged**: either axis (derivation OR scale) promotes `light → heavy`. The existing
  boundary tests stay intact.
- `heavy → novel` is reachable **only through derivation**, at a second (higher) threshold — a single-trigger top
  tier. Scale never reaches `novel` (it caps at `heavy`, per the breadth-ceiling above).
- `novel` is a **second threshold on the same derivation axis**, not a distinct "invention" trigger. This keeps
  the boundary-test reading clean — derivation resolves `not-fired → fired (heavy) → high (novel)` on one axis —
  rather than introducing a parallel trigger.
- **It is a *kind*, not a magnitude** — which is what licenses a third *value* (rather than a `heavy` sub-marker)
  and makes the register break honest. Its **primary** recorded purpose is parallelism / sequencing balance (you
  can hold ~one genuinely-novel stream; one novel + one mechanical-heavy + a couple of lights is a full but
  *balanced* plate); its **secondary** purpose is to open an advisory distinct planning shape (research /
  discovery phase + ADR expectation). The balance purpose is why we record it; the kind is why it is a value.
- The change is **additive** to the data: one new test on one axis, reclassifying a subset of existing `heavy`
  upward — no `light` value or the `light`/`heavy` boundary disturbed, no Phase-5 stamp thrown away.

### Why it clears the "is it a real tier?" bar (not just a sizing label)

A third value must gate a *distinct consequence* on at least one of `Class`'s jobs. `novel` clears it
**primarily on parallelism** and **secondarily on planning shape** — both real, neither merely modal:

- **Parallelism (primary):** the strongest "this one fills the plate by itself / don't double up" signal — a
  *behavioral / sequencing* consequence (it changes what you pick up next), not a rigor/speed one. This is why
  the felt-difference test must widen to admit sequencing, and why `novel` passes it even when its spec artifact
  equals a `detailed`/`heavy` one. (The earlier notes framed ceremony and parallelism as co-equal "both jobs";
  the discussion resolved that parallelism is the load-bearing one and ceremony the advisory second.)
- **Planning shape (secondary):** opens a distinct *available* path — a discovery / research phase before
  drafting + a companion ADR expectation — a different planning *shape* than ordinary `heavy`, **suggested not
  forced** (it preserves `Class`'s suggest-not-dictate stance toward the non-recorded, per-stage planning-depth
  axis; it does not pin depth).
- **Ratchet:** extends cleanly — `novel` ↔ `heavy` stays revisable until realized synthesis-depth sets a floor;
  estimate-then-ratchet is unbroken.

### The `heavy → novel` test (agreed leading formulation)

*Does settling the design require **inventing concepts / models that do not yet exist in the problem domain**
(synthesis, external research, discovery) — versus **composing a real design from existing ARC patterns and
primitives**?* Invent → `novel`; compose → `heavy`. Worked anchors: this WU **invented the `Class` model itself**
(→ `novel`); `arc-reinforce` **assembles a routing scheme from existing ARC surfaces** (→ `heavy`). This border is
inherently a *magnitude* cut *within* "derivation fired," so it will always read slightly fuzzier than the
`light`/`heavy` fired-or-not line — that fuzziness is the tier's principal cost, accepted because the top-end
signal is worth it.

### Refinements settled in discussion

Five points the dogfood and the model-revision discussion sharpened, all folded into Phase 5.R's surface edits:

- **Derivation floor.** Derivation counts only *spec-worthy* design — decisions a competent engineer must settle
  *before starting* — never in-flight implementation choices (naming a variable, local structure). This is the
  design-vs-implementation line (R7) viewed from classification; it keeps a pedantic "we had to decide
  *something*" from tripping `heavy`, and gives the derivation axis a real floor beneath both its thresholds.
- **No ratchet-back from realized authoring.** "Execution turned out light" ≠ "the design was determinate." If a
  real design *was* authored, realized authoring floors `Class` at `heavy` even over a tiny surface; only an
  over-high *estimate* (no authoring realized) corrects down. The derivation-heavy/scale-light cell feels
  front-loaded, but it was genuinely heavy *when both jobs read it* (at planning) — `Class` is a decision-time
  signal, not a post-hoc effort descriptor.
- **`heavy` stays demand-not-volume.** The single `heavy` bit drops *where* the weight sits (planning vs.
  execution vs. throughout); per-stage planning depth recovers it, so the field is **not** split by
  axis-of-origin. Adding `novel` *de-strains* `heavy` (it no longer stretches to cover from-scratch synthesis).
- **Advisory depth, hard floors structural.** ARC forces *presence and the weight-signal* (a spec must exist;
  the `Class` value is forced at planned-entry) and *suggests* shape and depth. `novel`'s discovery/ADR path is
  an *available, suggested* path, never forced — which is why the dropped spec-vs-`Class` enforcement hook was
  the right call, and why the fuzzy invent/compose border is low-stakes.
- **One-spectrum framing, no flattening.** Surface the shared ceremony-scaling thesis (Errand floor → `novel`
  ceiling) as *two questions of one sizing pipeline* — the Errand-vs-WU character line (cardinality) and `Class`
  (weight) — while keeping `Class` WU-scoped and atomic a character. The felt-difference test widens to admit a
  *sequencing* consequence (not rigor/speed alone), or a literal read would reject `novel`.

### The validation gate (Phase 5.R) — result

Ran via parallel read-only triage of the 38 `planned/` heavies against the invent-vs-compose test (the same
prompt seeds the `classify-work-unit` method update — it dogfooded clean). **Confirmed `novel` set (7):**
backlog — `decomposition-machinery`, `arc-plan-conductor`, `cross-machine-sync-coherence`, `release-lifecycle`,
`commit-increments`, `coord-probe`; active — `class-model-foundation` (the canonical, invented the model). A
recognizable minority with a **stable core** (`decomposition-machinery`, `arc-plan-conductor`,
`class-model-foundation` — clear from-scratch model invention) and a **fuzzy band** (the rest — discovery-shaped
or new-conceptual-axis work); `coord-probe` is the weakest, held `novel` as an honest high-uncertainty estimate
that may ratchet down (the extent of the external-coordination pattern is a live unknown).

The pre-run eyeballed guess was substantially off **in both directions** — five of seven eyeballed WUs came back
`heavy` (they *realize* an already-invented model — ADR-022's record model, the `Class` model — or consolidate
existing rules), and five confirmed novels were missed — which is the systematic gate earning its keep. The bar
was **recognizability**, not crispness; the fuzzy edge is cheap because depth is advisory. (Fallback, had it come
back smeary: binary `Class` + a richer STATUS.USER view — not triggered.)

### Why no Phase-5 stamp is throwaway

The Phase-5 `light`/`heavy` stamps remain correct: the `novel` tier is **purely additive to the data** — it
reclassifies a *subset of existing heavies upward* without disturbing any `light` value or the `light`/`heavy`
boundary. Phase 5.R re-stamps only the confirmed `novel` set; every other Phase-5 estimate stands.

**Related:** the always-loaded `AGENT-BRIEF.ARC` `Class` definition omits the parallelism / worklist-balancing
purpose (it states only ceremony-scaling) — the omission is what muddied the framing while this was first
discussed. The one-clause balance-purpose fix rides Phase 5.R's doctrine update (5.R.3), which already touches
that entry for `novel`; the broader `minimum/standard/expanded` → `low/medium/high` planning-depth vocabulary
staleness and the `session-init.md` forward-pointer stay `doc-cascade-sweep`'s (captured via `USER-INBOX`).
