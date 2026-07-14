# Draft: Synthesis Modality (document / prototype / hybrid)

- **Origin:** Extracted from the retired `arc-plan-conductor` draft (§ 18) at the conductor decomposition
  (2026-06-12). The conductor framed modality as one axis of its monolithic orchestration; with depth selection
  (`resolve-planning-depth`) and the document-iteration loop (`draft-design`) now shipped, modality stands as an
  orthogonal axis layered onto them — `composable-workflows`-shaped. References to the conductor's now-retired
  sibling sections have been re-anchored to their shipped equivalents (`resolve-planning-depth`, `draft-design`,
  `init-work-unit` / `run-errand`, session-init planning detection).
- **Purpose:** Add a **modality** axis to pre-spec synthesis, orthogonal to planning depth: *how* the synthesis
  happens — through document iteration, through bounded code spikes, or through both interleaved. Where depth
  selects how heavily planning engages, modality selects whether the dominant unknowns are resolved by refining a
  document or by testing the world with code.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Extend modality selection through the planning terminus**

- *Routed from:* `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured from the
  `reviewed-lane-review-gate` planning-terminus spikes.
- *Concern:* empirical unknowns can crystallize after spec and tasks are drafted but before finalization. Decide
  whether modality remains selectable through that boundary or a final "empirical assumptions validated?" check
  may trigger a bounded spike. Preserve the distinction: unknowns that reshape implementation spike before it;
  rollout probes select among pre-built fallback paths.

### `[ ]` **Record compaction-recovery as a prototype-modality live instance**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: synthesis-modality`), housekeep drain (2026-06-30);
  captured during the between-WU post-mortem after `compaction-recovery` shipped.
- *Concern:* `compaction-recovery` was planned through the normal document-first draft/spec/tasks path, but its
  original design failure surfaced only during late live e2e verification of the harness compaction path. That is
  a concrete instance where the dominant unknown was empirical rather than purely conceptual: whether the harness
  hooks and post-compaction recovery carrier behaved the way the design assumed.
- *Approach:* use this as a live motivating example for selecting prototype or hybrid modality during pre-spec
  synthesis. Signal: when a design depends on harness behavior, external tool lifecycle events, or a live e2e
  integration seam, run a bounded spike before declaring the design settled. This complements, rather than
  replaces, `planning-iteration-mechanics`' open-question and writable-task checks.

---

## Concept

ARC's existing planning model is document-driven: a `draft-*` doc is iterated through collaborative refinement
passes (`draft-design`) until it reaches formalization-ready shape, then graduates to a spec. This works cleanly
when the dominant unknowns are *conceptual* — "what is this, what's the shape, what are the boundaries" — but it
under-supports work where the dominant unknowns are *empirical*: "will library X behave the way I think under
load Y? what's the right integration shape when the external system's actual behavior is ambiguous? can this even
be built the way the document is describing?"

For empirical unknowns, document iteration becomes circular — you can't refine the document past the point where
you don't know how the world will respond. The fix is to **test the world**: build bounded, hypothesis-framed
code spikes that resolve empirical unknowns, capture learnings, and feed back into the synthesis.

Modality applies only to the pre-spec synthesis phase. The downstream pipeline (spec → tasks → execution) is
unchanged.

## Three modalities

| Modality      | Synthesis activity                                                                               | Best for                                                                         |
|---------------|--------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| **Document**  | Iterate `draft-*` through collaborative refinement passes (`draft-design`)                       | Conceptual unknowns; integration shape known; "do I understand the problem?"     |
| **Prototype** | Build bounded code spikes, capture learnings between iterations (`refine-prototype-loop`)        | Empirical unknowns; integration shape unclear; "will this work the way I think?" |
| **Hybrid**    | Spikes inform document iteration; planning flips loop per pass based on next unknown's character | Most genuinely novel work — mix of conceptual and empirical unknowns             |

Hybrid is not a separate workflow file. It's the emergent pattern when planning selects one loop for one pass,
then the other loop for a subsequent pass, within the same planning effort. Each individual pass has one coherent
shape; modality flips between passes as the highest-leverage next unknown changes character. Per-pass coherence
with inter-pass flexibility — that's `arc-plan`'s job.

Modality is selectable at invocation (`--modality document|prototype|hybrid` or natural-language equivalents) and
adjustable mid-flight, mirroring depth selection. Default is `document` — the existing behavior remains the
default case.

## Anchor vocabulary: spike

For prototype modality, the unit of work is the **spike** — a bounded, hypothesis-framed investigation producing
empirical learning. ARC reclaims XP's original meaning explicitly:

- **Bounded** — time-boxed (default ~2-4 hour blocks; one focused review-increment scale) and scope-boxed (one
  hypothesis per spike; artifact-bounded where possible)
- **Hypothesis-framed** — every spike has an answerable question
- **Learning-oriented** — spike output is *empirical answers*, not production code
- **Default-throwaway disposition** — spike code is scratch unless explicitly elected to evolve (see
  § Disposition lifecycle below)

This explicitly *reclaims* "spike" from its drifted contemporary meaning (which has often become "week-long
investigation that might ship"). Modern practice has lost the bounded / throwaway / learning-oriented
constraints; ARC restores them and documents the qualification in the glossary so the term reads through ARC's
lens, not the drifted one.

> **XP spike-type taxonomy:** XP distinguishes *technical* (implementation feasibility), *functional* (UX or
> requirements), and *architectural* (design viability) spikes. ARC treats these as descriptive categories rather
> than required metadata — the hypothesis carries the structural meaning. Glossary entries explain the typology;
> spike artifacts are not required to carry a type field.

## Spike contract

Each spike is one review increment (workflow-interlock fires at completion). The spike's contract declares four
explicit fields before code begins:

1. **Hypothesis** — the question being answered
2. **Acceptance criteria** — what answers the question (concrete signal of success)
3. **Scope cap** — time-box, file/layer bounds, or both
4. **Disposition commitment** — default throwaway; explicit opt-in to evolve under stabilization contract

The contract is the spike's analogue to a task description in execution mode. The workflow-interlock at spike
completion gates on contract satisfaction — hypothesis answered (or explicitly reframed), acceptance criteria
evaluated, learning captured, disposition acted on.

## Modality selection signals

Modality is selected from the strongest available signal, parallel to depth selection (`resolve-planning-depth`):

1. **Explicit user signal** — `--modality prototype` or natural-language equivalent ("I want to test some things
   in code before specifying," "let me prototype this first")
2. **Unknown character** — the user's framing surfaces empirical questions ("I'm not sure if this will work," "I
   need to see how it behaves") vs. conceptual questions ("what's the right shape," "how should this be organized")
3. **Artifact inspection** — if a `draft-*` already has substantive findings from prior spikes, default to
   prototype/hybrid on resume
4. **`Class` context** — atomic (errand) skips planning; `Light` may use single-spike-no-loop; `Heavy` / `Novel`
   support full modality range
5. **Default** — document modality (preserves existing default behavior)

When inferred signals point at a different modality than the user's stated intent, `arc-plan` surfaces the
suggestion rather than switching silently — same posture as depth-selection mismatches.

## Disposition lifecycle

Three canonical stances for spike code:

| Disposition             | When it applies                                                               | Mechanics                                                                                                             |
|-------------------------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| **Throwaway** (default) | Empirical question answered; code's value was the learning                    | Code dropped at the `graduation-cleanup` ceremony; learnings preserved in `draft-*` findings + ADRs                   |
| **Evolutionary**        | Spike code has validated value AND a stabilization contract is committed      | Code carries into implementation; stabilization contract enumerates refactoring + tests + docs requirements pre-merge |
| **Reference**           | Spike's investigation path itself has documentation value beyond the decision | Code archived on a non-merging branch or tag; main implementation rewritten fresh                                     |

**Default to throwaway.** This enforces the boundary: spike code is learning, not implementation. Carrying spike
code forward via the evolutionary path requires *explicit decision* and a *stabilization contract* — refactoring
requirements, test coverage, doc expectations enumerated before the spike code is considered part of
implementation.

This default actively prevents "tracer-bullet syndrome" (spike code calcifies into production through inertia)
and "sunk-cost fallacy" (we built it so we should keep it). The decision is deliberate, not accidental.

## Learning capture pipeline

Spike learnings flow through ARC's existing artifact surfaces, depth-dependent:

| Depth    | Capture pipeline                                                                                                     |
|----------|----------------------------------------------------------------------------------------------------------------------|
| Minimum  | Spike findings → ADRs (for significant decisions); spec written directly from learnings; no `draft-*`                |
| Standard | Spike findings → `draft-*` findings section + ADRs for significant decisions; `draft-*` graduates to spec normally   |
| Expanded | Spike findings → `draft-*` (promoted structure with findings register) + ADRs; per-spike pointer for loop continuity |

ADRs are the durable record across all depths — they survive spike code disposal and serve as the long-term
decision archeology. Spike commits are *not* a substitute for ADRs (they're scratch by design and don't carry
decision rationale reliably; they're dropped at graduation-cleanup).

## refine-prototype-loop workflow

Planning-side analogue to `draft-design` (the document-iteration loop) and `process-task-loop`. One pass equals
one bounded spike plus learning capture plus disposition decision. Stop for direction at each pass.

### Per-pass shape

1. **Resume and orient** — read current `draft-*` (if exists), check carried-forward pointer from prior pass
   (last spike completed, recommended next spike, open empirical questions), assess current planning state
2. **Identify next unknown** — highest-leverage empirical question. Priority: carried-forward pointer → current
   user direction → highest-leverage open empirical cluster
3. **Frame spike contract** — hypothesis + acceptance criteria + scope cap + disposition commitment. User
   confirms the contract before code begins.
4. **Build the spike collaboratively** — work the hypothesis; honor the scope cap; surface adjacent findings
   without silently expanding scope
5. **Verify against acceptance criteria** — did the spike answer the hypothesis? If inconclusive, reframe (smaller
   hypothesis, different approach) or escalate
6. **Capture learning** — fold into `draft-*` findings section; write ADR for any significant decision the spike
   resolves; commit-interlock releases the capture commit at workflow-interlock approval
7. **Decide disposition** — throwaway / evolve / reference. Default throwaway; explicit opt-in to evolve under
   stabilization contract
8. **Reassess outcomes** — three options parallel to the document-iteration loop:
    1. continue with another spike (recommended next pointer captured)
    2. switch to document modality for next pass (empirical unknowns resolved; conceptual work remains)
    3. graduate to `create-spec` (sufficient learning to write the spec)
9. **Report and stop** — current planning state, what this spike resolved, what remains, recommended next step.
   Mandatory stop — wait for user direction.

### Pre-report checklist

```text
- [ ] Spike contract was honored (hypothesis answered or explicitly reframed)
- [ ] Acceptance criteria evaluation is documented
- [ ] Disposition decision is recorded
- [ ] Learning is captured in `draft-*` findings (when `draft-*` exists) and/or ADR
- [ ] Spike commit(s) marked per planning-commit convention
- [ ] Recommended next step is identified
```

If any item is unchecked, complete it before reporting — same gate-shape as `draft-design` and
`process-task-loop`.

### Visible exit conditions (parallel to `draft-design`'s exit conditions for document mode)

A spike cycle is ready to graduate to `create-spec` when:

- empirical questions raised by the work have been answered or deliberately deferred
- a coherent implementation approach is now clear
- significant decisions are captured in ADRs
- the `draft-*` (if it exists) or graduate-direct-to-spec material is informed by spike findings
- remaining unknowns are detail-design risk, not scope-defining empirical risk

This is guidance, not a formal gate. `create-spec` remains the authoritative workflow boundary.

## Soft spike-cap recommendations

Iterating spikes endlessly is a real failure mode ("prototype-as-procrastination"). Soft caps, surfaced as loop
guidance rather than hard gates:

- **`Light` `Class`**: 1-2 spikes typical; often single-spike-no-loop
- **`Heavy` / `Novel` `Class`**: 3-5 spikes typical per planning effort
- **`high` planning depth**: cap can rise but the loop flags at ~5+ spikes — pause to assess whether learning is
  still arriving or whether `create-spec` is the right next move

Caps are guidance in the loop's reporting layer. Users may exceed; the loop prompts reflection rather than
blocking. No hard gate; no configurability earned at this stage.

## Workflow-interlock and commit-interlock integration

Both planning loops (the document-iteration `draft-design` and the new `refine-prototype-loop`) hook into ARC's
existing interlock + release-wrapper machinery, calibrated differently from the execution loop but using the same
mechanisms:

- **Workflow-interlock** fires at end of each loop pass (refinement batch in document modality; spike completion
  in prototype modality). Structural fire-site, always-stop.
- **Commit-interlock release** at workflow-interlock approval. Under
  `commit.interlock ∈ {on-task-approval, on-workflow}` plus `arc.releaseOptedIn`, commits fire through
  `arc release commit` per the `workflowCommit` class-tag routing that already exists in ARC's machinery.
- **Within-pass commit cadence** is exploratory — no per-edit gates inside a spike or inside a refinement batch.
  Planning is not task execution; commit atomicity at the pass boundary is sufficient.

This calibration preserves exploration velocity inside each pass while honoring ARC's commit-discipline contract
at the pass boundary. No new interlock types needed.

## Failure-mode coverage

The following failure modes are *actively prevented* by the design above:

- **Sunk-cost fallacy** — throwaway-default + explicit stabilization contract for evolve
- **Scope creep ("just one more spike")** — soft cap + spike-cycle exit conditions tied to empirical questions
  specifically
- **Tracer-bullet syndrome** — throwaway default prevents accidental calcification
- **Prototype without learning capture** — workflow-interlock pre-report checklist gates on learning being
  captured
- **Prototype-as-procrastination** — soft cap + visible exit conditions + spike contract forces hypothesis-framing
  (no exploratory spiking)
- **Spike-without-hypothesis** — contract requires hypothesis before code begins; `arc-plan` refuses to enter
  prototype mode without one

## Modality interaction with existing surfaces

- **Planning depth (`resolve-planning-depth`)**: orthogonal to modality. Each (depth, modality) combination is
  valid; both are selected at entry, both adjustable mid-flight
- **`Class`-aware orchestration**: `Class` interacts with both axes. Atomic (errand) skips planning entirely (no
  modality applies); `Light` may use single-spike-no-loop or document-only depending on signal; `Heavy` / `Novel`
  support full range
- **Worktree orchestration (`init-work-unit` / `run-errand`)**: no change. Spike commits live on the WU's existing
  branch (in the WU's worktree under `Heavy` / `Novel` `Class` + full protection); no second worktree needed for
  spikes
- **`draft-*` primacy**: under prototype modality, `draft-*` still serves as the synthesis narrative when it
  exists. Spike learnings flow INTO `draft-*` rather than competing with it
- **Session-init planning detection**: the detection signals for active planning extend naturally to detect
  prototype activity (spike commits, populated findings register)

## Scope Estimate

Medium (days-week) — a new `refine-prototype-loop.md` workflow plus glossary (`spike` reclaim) and modality-axis
wiring into `arc-plan` / `draft-design`, across the package source and `.arc/` copy. The `composable-workflows`
seam (how the prototype loop composes with the document-iteration loop and the depth ladder) is the main design
risk to settle at spec time.
