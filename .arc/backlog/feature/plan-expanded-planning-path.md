# Plan: Expanded Planning Path

**Purpose:** Add an optional pre-PRD planning path for high-novelty, high-coupling work that needs
more structure than ARC's default freeform `plan-*` exploration, without making ordinary planning
heavier.

**Status:** Draft (problem framed, first-pass design lean captured)
**Created:** 2026-04-10
**Origin:** Live pressure from `plan-arc-modes.md` exposed a gap between ARC's intentionally light
plan stage and the needs of large greenfield shaping work. The existing planning pipeline handled
normal work well but provided little intermediate structure for turning a vague, far-reaching idea
into a watertight, PRD-ready plan.

> **Note:** The session-pointer reference to `WORK-STATUS.md` in § 12 ("Existing session
> pointers") predates the Work-Status Restructure WU (see
> [`prd-work-status-restructure.md`](../../active/technical/prd-work-status-restructure.md)),
> which replaces the singular project pointer with per-WU `status-{name}.md` files. The
> detection-order logic is unchanged — read "`WORK-STATUS.md` next action" as "the active
> WU's status file Next Action" under the restructure model.

---

## Problem Statement

ARC's planning strategy is intentionally light before PRD creation:

- `plan-*` documents are freeform exploration artifacts
- `arc-plan` facilitates elicitation and synthesis
- `create-prd` assumes the plan has reached formalization-ready shape

That works well for most work units. The gap appears when a work unit is unusually:

- **greenfield** — key concepts and system boundaries are still being invented
- **cross-cutting** — decisions span workflows, templates, skills, docs, CLI, config, and modes
- **high-coupling** — resolving one question exposes adjacent hidden decisions
- **large in planning surface** — one exploration stream may naturally split into multiple PRDs

In those cases, a single freeform `plan-*` document can become hard to use as both:

1. the readable synthesis artifact that should eventually feed one or more PRDs, and
2. the active workbench for surfacing gaps, validating assumptions, evaluating alternatives, and
   iteratively draining findings back into the plan.

The result is not planning failure, but planning friction:

- unresolved decisions are rediscovered repeatedly
- context becomes hard to contain
- gap resolution work becomes churn-heavy
- the path from "rough idea" to "formalization-ready plan" is under-supported

The current `working-*` experiment is a useful signal that the need is real, but it does not yet
prove ARC needs a new planning-specific companion artifact. ARC already has general-purpose
supporting-doc conventions (`analysis-*`, `research-*`) for material that legitimately belongs
outside the plan.

## Design Goal

Preserve ARC's current lightweight planning path as the default, while adding an **expanded
planning path** for work units that need deeper shaping before PRD creation.

The expanded path should:

- improve the quality and containment of pre-PRD exploration
- make progress visible when plans are still too rough for PRD creation
- support one-plan-to-many-PRD outcomes when scope naturally splits
- help agents avoid shallow or premature formalization
- add little or no burden to ordinary planning work

## Non-Goals

- Do **not** make all `plan-*` work more ceremonial
- Do **not** turn the plan stage into a gated approval workflow
- Do **not** replace `create-prd` as the formalization boundary
- Do **not** require a companion artifact for ordinary work
- Do **not** blur PRDs into implementation specs or task lists

## Working Thesis

ARC's current planning strategy is still directionally right:

- `plan-*` should remain freeform by default
- discovery quality matters more than document template rigidity
- structure should increase as fidelity increases
- planning should stay bounded at the level of a manageable refinement unit

The missing piece is not a heavier default template. The missing piece is an **optional escalation
path** between "freeform plan" and "PRD creation" for plans that show specific failure modes.

## Design Lean

### 1. Keep `plan-*` as the primary artifact

`plan-*` remains the authoritative synthesis document throughout pre-PRD work.

It should continue to hold the readable narrative:

- problem framing
- key design conclusions
- major trade-offs
- stable scope boundaries
- PRD-feeding conclusions

This avoids making the companion artifact, if any, the center of gravity.

### 2. Support two planning paths

ARC should explicitly recognize two valid pre-PRD paths:

1. **Standard planning path**
   - everything stays in `plan-*`
   - `arc-plan` facilitates elicitation and refinement
   - suitable for most work

2. **Expanded planning path**
   - still centered on `plan-*`
   - adds more structured shaping support when the work unit needs it
   - promotes the existing `plan-*` into a richer internal structure rather than introducing a new
     planning artifact by default

This makes the expanded path an escalation, not a new default.

### 3. Prefer inline promotion, not a planning-specific companion artifact

The first escalation step should be **promoting the `plan-*` document to a more structured internal
shape**, rather than immediately creating a second file.

Examples of promoted structure inside `plan-*`:

- explicit resolved decisions table
- open questions grouped by category
- assumptions requiring validation
- candidate PRD split map
- findings-to-land tracking section

This is the preferred simplification. If the shaping work still needs extra space, ARC already has
general-purpose supporting-doc conventions:

- `analysis-*` for deeper evaluation and option analysis
- `research-*` for external or synthesized research

Those should remain the escape valves. Expanded planning itself should not invent a new
planning-specific companion class unless one-file promotion proves inadequate in practice.

**Why this lean:** lower churn, fewer moving parts, less lifecycle ambiguity, easier continuity
across sessions, less risk of split-brain planning, and better alignment with ARC's existing
artifact model: the plan is the pre-PRD synthesis, the PRD is the stable requirements artifact, and
ADRs later capture implementation-phase rationale where needed.

### 4. `arc-plan` should detect likely graduation to expanded planning

`arc-plan` is already useful as a facilitation skill, but it currently stops short of helping the
user recognize when a plan has outgrown the standard path.

ARC should teach `arc-plan` to look for lightweight escalation signals, such as:

- the user describes the work as greenfield, novel, or architecture-shaping
- one plan is likely to feed multiple PRDs
- new design decisions keep surfacing while resolving old ones
- the same gaps or assumptions are rediscovered across sessions
- the plan spans many domains (workflow, CLI, templates, docs, config, modes)
- the user reports that the plan has become messy, churn-heavy, or hard to keep coherent

When those signals appear, `arc-plan` should not force a transition. It should surface a suggestion:

- continue in standard path
- promote the `plan-*` structure
- adopt the expanded planning path

That makes `arc-plan` materially more useful without turning it into a dispatcher or gatekeeper.

### 5. Expanded planning needs a visible exit condition

The expanded path should not become an endless design phase. ARC needs clear guidance for when a
plan is ready to return to the normal PRD pipeline.

Initial lean: a plan is ready to exit expanded planning when:

- the core problem framing is stable
- the main scope boundaries are explicit
- hidden design decisions have been surfaced and either resolved or deliberately deferred
- major assumptions are either validated or clearly named
- candidate PRD boundaries are understood if the work is too broad for one PRD
- the remaining open items are detail-design, not scope-defining unknowns

This is guidance, not a formal gate. `create-prd` remains the authoritative workflow boundary.

### 6. Expanded planning should be loop-driven

Expanded planning is not a one-pass document-writing exercise. It is an iterative process more like
task execution than like template filling:

- identify the highest-leverage unknowns
- investigate a bounded batch
- fold conclusions back into the plan
- reassess readiness

Current lean: ARC should support this with an optional workflow concept tentatively named
**`refine-plan-loop`**. It would be the planning-side analogue to `process-task-loop`:

- **not** a hard gate
- **not** a second authority beside `create-prd`
- **yes** a repeatable loop that supports multi-session refinement for expanded plans
- **yes** explicitly collaborative, following ARC's co-development posture rather than implying
  autonomous agent planning

The loop's contract would stay narrow:

1. resume and orient from the current `plan-*` and any carried-forward session pointer
2. assess current state
3. identify the highest-leverage open items
4. choose one bounded investigation batch
5. work that batch collaboratively
6. fold conclusions into the plan
7. reassess next step: continue, split, or formalize
8. report current state and stop for user direction

If the user explicitly wants another refinement pass in the same session, the loop returns to
**step 2**, not to a blank-slate restart. This mirrors ARC's execution loop pattern: one bounded
increment, report, wait, continue only with user approval.

This gives ARC a real planning loop without turning exploration into a bureaucratic workflow or
making planning look like autonomous agent work.

### 7. Expanded planning should detect plan-splitting pressure

PRD decomposition and plan splitting are different concerns.

- **PRD decomposition** asks: how many work units should implementation become?
- **Plan splitting** asks: is this problem space still a manageable refinement unit?

A single plan may be too dense to refine effectively even if the work later becomes one PRD. The
issue is planning manageability, not implementation count.

Current lean: `refine-plan-loop` should include explicit **plan-splitting detection**. Not based on
line count alone, but on structural signals such as:

- open findings cluster into weakly coupled subproblems
- different regions of the plan evolve semi-independently
- sessions repeatedly work one portion while the rest stays inert
- the plan has become hard to resume without loading too much context
- one region is nearing formalization while another is still exploratory
- keeping one plan coherent costs more than maintaining two smaller plans

When these signals appear, the loop should be able to recommend:

1. continue refining as one plan
2. split into multiple `plan-*` documents
3. move to `create-prd`

This keeps expanded planning bounded and prevents the template structure from becoming an excuse for
unlimited plan growth.

### 8. The expanded template should define a bounded refinement unit

The expanded structure should help organize substantial planning work, but it should not be
designed as an infinitely extensible mega-template. It should be optimized for one manageable
shaping unit.

Current first-pass structure:

1. **Problem / Motivation** — stable framing
2. **Current Lean** — current best synthesis, even if provisional
3. **Decision Surface** — the major questions or boundaries still blocking formalization
4. **Findings / Investigations** — the active register for bounded refinement batches
5. **Scope / Split Pressure** — scope boundaries, notable split pressure, and candidate PRD split
   notes only when relevant
6. **Formalization Readiness** — what still blocks `create-prd`
7. **Next Batch** — optional but strongly recommended pointer for the next refinement pass

Everything else should be conditional rather than mandatory:

- assumptions may live as a subsection inside findings when they are not substantial enough to
  warrant their own top-level section
- candidate PRD decomposition appears only when decomposition pressure exists
- split pressure should be visible when it matters, not ritualistically maintained at all times

The key design constraint is that this structure must remain useful without ballooning into a
second PRD. If it starts to fail, plan splitting is the answer before adding more artifact types.

### 9. The loop should reuse ARC's existing planning-state vocabulary

ARC already has plan-state language in `arc-plan`: `fresh`, `rough`, `maturing`,
`formalization-ready`.

Current lean: expanded planning should **reuse** that vocabulary rather than introducing a second
top-level state taxonomy. `refine-plan-loop` can add secondary descriptors for the current motion of
the work, for example:

- **motion:** expanding / converging
- **split pressure:** low / rising / high

This keeps ARC's planning language internally consistent while still giving the loop enough nuance
to describe what is happening.

### 10. The loop should be resume-aware, but session continuity stays with existing session workflows

`refine-plan-loop` should not assume a blank slate except on first entry. In most cases, the current
session will already have a lead from the previous pass:

- a recommended next batch
- the last batch completed
- a note that split pressure is rising

Current lean:

- `session-init` / `session-handoff` keep ownership of cross-session continuity mechanics
- `refine-plan-loop` defines what a good **next-pass pointer** looks like
- each loop pass should leave behind enough structured guidance for the next session to resume
  without rediscovering the planning landscape

Priority for selecting the next batch should be:

1. explicit carried-forward pointer from the prior pass
2. current user direction
3. the highest-leverage unresolved cluster visible in the plan

This preserves separation of concerns while making the loop materially better across many sessions.

### 11. Expanded planning should be session-init-detectable like task execution

If ARC adopts `refine-plan-loop` as a real workflow, the natural fit is to treat **expanded
planning** the same way session-init currently treats task execution.

Current lean:

- when session-init can tell that expanded planning is the likely focus of the session, it should
  conditionally load `refine-plan-loop`
- if the session later pivots into expanded planning, the workflow should be loaded then
- ordinary freeform planning should **not** trigger workflow loading by default

This mirrors the existing ARC architecture cleanly:

- **task execution active** → load `process-task-loop`
- **expanded planning active** → load `refine-plan-loop`

The important distinction is that this is about **expanded planning**, not all planning. Standard
freeform planning remains light-touch and should not be over-proceduralized.

### 12. Detection should prefer existing signals before new metadata

Expanded-planning detection should follow ARC's normal preference order: use the signals that
already exist before introducing new tracked metadata.

Current lean for detection order:

1. **User intent**
   - explicit `arc-plan` invocation for an existing rough plan
   - explicit request to continue or refine an expanded plan
2. **Existing session pointers**
   - `WORK-STATUS.md` next action
   - session notes / handoff guidance
   - prior next-pass pointer left by the previous refinement pass
3. **Artifact inspection**
   - a `plan-*` exists
   - it visibly uses expanded structure
   - it carries unresolved findings, assumptions, split pressure, or readiness tracking
4. **Only then consider explicit metadata**
   - e.g. a future `Planning Path: Expanded` marker, if the first three signal layers prove
     insufficient in practice

Current lean: explicit plan metadata should be treated as a **last resort**, not the default
mechanism.

### 13. First-pass workflow draft for `refine-plan-loop`

Current first-pass shape, aligned intentionally with ARC's existing loop-style workflows while
keeping planning collaborative rather than autonomous.

#### Purpose

Guide one bounded collaborative refinement increment on an expanded `plan-*` document, then stop for
direction.

#### Collaboration model

- The workflow is **co-development**, not autonomous plan generation
- One pass is one bounded refinement increment, analogous to one task increment in
  `process-task-loop`
- After each pass, the agent reports current state and **stops** for user direction unless the user
  explicitly requests continued passes in the same session

#### Proposed steps

1. **Resume and orient**
   - Read the current `plan-*`
   - Identify the current planning state (`rough` / `maturing` / `formalization-ready`)
   - Check for carried-forward guidance from the prior pass:
     - recommended next batch
     - last completed batch
     - split-pressure note
   - If no pointer exists (typical only on first entry), fall back to choosing from the open
     decision surface in the plan

2. **Assess current shape**
   - Identify the highest-leverage unresolved clusters
   - Assess current motion:
     - expanding
     - converging
   - Assess split pressure:
     - low
     - rising
     - high

3. **Select one refinement batch**
   - Choose one bounded batch for this pass
   - Batch selection priority:
     1. explicit carried-forward next batch
     2. current user direction
     3. highest-leverage unresolved cluster in the plan
   - The batch should be one coherent cluster, not "advance the whole plan a bit"

4. **Refine the batch collaboratively**
   - Clarify the question or boundary being worked
   - Evaluate alternatives and trade-offs
   - Validate assumptions where possible
   - Surface implications and adjacent hidden decisions
   - If new adjacent issues appear, capture them, but do not silently expand the batch beyond a
     manageable increment
   - If the batch reaches a user-judgment decision that cannot responsibly be folded into the plan
     without direction, stop early and surface it rather than guessing

5. **Fold conclusions back into the plan**
   - Update the current lean if it changed
   - Update findings / investigations for the batch
   - Update assumptions, scope boundaries, split pressure, or candidate PRD decomposition when
     affected
   - Record what is now resolved, what remains open, and what was deferred

6. **Reassess outcomes**
   - Decide which of the three outcomes best describes the post-pass state:
     1. continue refining as one plan
     2. split into multiple `plan-*` documents
     3. move to `create-prd`
   - If continuing, identify the recommended next batch

7. **Verify before reporting**
   - Confirm the plan file is updated and coherent
   - Confirm the current pass's batch has a visible disposition
   - Confirm the current lean / readiness / split assessment are current
   - Confirm a next-pass pointer exists if more refinement is needed

8. **Report and stop**
   - Report:
     - current planning state
     - what this pass resolved
     - what remains
     - recommended next step (continue / split / formalize)
   - ⛔ **Mandatory stop** — wait for user direction
   - If the user explicitly wants another refinement pass in the same session, loop back to
     **step 2**

#### Per-pass completion protocol

Planning needs a completion protocol parallel to task execution, but lighter and planning-specific.

Current lean:

1. finish one bounded refinement batch
2. update the `plan-*` file to reflect what became clearer
3. verify the pass is documented coherently
4. report current state to the user
5. stop for direction

**Draft pre-report checklist:**

```text
- [ ] Current batch is clearly identified
- [ ] Conclusions from this pass are reflected in the plan
- [ ] Current lean is updated if needed
- [ ] Readiness / split assessment is updated
- [ ] Recommended next batch is recorded if more refinement remains
- [ ] Ready to generate user-facing refinement summary
```

If any item is unchecked, complete it before reporting. This is the planning analogue to task-loop
"verify before report."

#### Stop conditions

The workflow should stop early and surface the issue when:

- a design decision needs explicit user judgment before the batch can proceed
- split pressure becomes high enough that continuing in one plan would be misleading or wasteful
- the current batch depends on external research or code/context reads that materially change the
  problem framing
- the plan reaches `formalization-ready` state before the session's intended scope ends
- the batch expands beyond a bounded increment and should be re-scoped before continuing

These are planning stop conditions, not failures. They exist to preserve bounded collaborative
refinement rather than to enforce ceremony.

#### Next-pass pointer

Current lean: each pass should leave behind a very small pointer for the next pass or next session.

Minimum shape:

- **Last batch completed**
- **Recommended next batch**
- **Why that batch is next**
- **Current split pressure** (only if notable)

This is intentionally lighter than a second session-state mechanism. It gives `session-handoff` and
future sessions something concrete to carry without creating a new tracked metadata system.

## Proposed ARC Changes

### Strategy and workflow

- Update `strategy-work-planning.md` to define standard vs expanded planning paths
- Add escalation guidance: when to stay freeform, when to promote the plan into expanded structure,
  and when existing `analysis-*` / `research-*` support docs are appropriate
- Add one-plan-to-many-PRD guidance as a first-class expected outcome for large shaping efforts
- Add plan-splitting guidance as distinct from PRD decomposition
- Clarify that expanded planning does not create a new default artifact class
- Introduce the optional `refine-plan-loop` workflow concept for expanded planning
- Align `refine-plan-loop` structurally with ARC's existing loop workflows while keeping planning
  explicitly collaborative and stop-based
- Extend session-init detection so expanded planning can conditionally load `refine-plan-loop`, in
  parallel with task execution loading of `process-task-loop`

### Skill behavior

- Extend `arc-plan` with lightweight expanded-planning detection and suggestion behavior
- Add synthesis categories specific to expanded planning:
    - masked design decisions
    - unvalidated assumptions
    - plan-splitting pressure
    - scope split pressure
    - suggested graduation to expanded structure
- Add a handoff path from `arc-plan` to `refine-plan-loop` when a plan has clearly graduated
- Reuse existing planning-state vocabulary (`rough`, `maturing`, `formalization-ready`) rather than
  adding a parallel top-level state model
- Prefer user intent, session pointers, and artifact inspection over new plan metadata when
  detecting expanded planning

### Templates and examples

- Revisit `template-plan.md`
    - keep freeform planning as the default ARC stance
    - evolve the template into the optional expanded-planning structure
    - allow existing freeform plans to graduate into that structure over time
- Decide whether ARC needs an example of promoted in-file structure beyond the template itself
- Ensure the template is optimized for a bounded refinement unit, not unbounded accumulation

### Docs and adoption guidance

- Update docs and strategy references so ARC users understand:
    - not all plans need expansion
    - expanded planning is for specific work-unit characteristics
    - one promoted `plan-*` document is the default expanded-planning shape
    - `analysis-*` / `research-*` remain available when genuinely needed

### CLI and install considerations

Likely modest, but not zero:

- the framework may need to ship updated template and strategy guidance
- `arc update` implications should be checked if file classification or examples change
- mode-aware guidance may be needed if planning behavior differs across `pm.mode` values

## Alternatives

### Option A — Keep everything in `plan-*`, no expanded path

The simplest answer: strengthen `arc-plan` and leave artifact structure entirely to user judgment.

**Pros:**

- zero new file conventions
- lowest process surface
- preserves current philosophy cleanly

**Cons:**

- does not give ARC a shared language for high-novelty planning trouble
- repeated churn patterns remain uncodified
- no explicit support for one-plan-to-many-PRD decomposition
- relies heavily on individual user discipline and ad hoc structure

**Current lean:** insufficient on its own.

### Option B — Make `plan-*` structurally graduatable, no planning-specific companion files

Keep a single artifact, but explicitly allow plans to "graduate" from freeform to structured
internally. Use existing `analysis-*` / `research-*` conventions only when deeper side work is
legitimately separate from the plan itself.

**Pros:**

- cleaner lifecycle
- simpler continuity
- avoids cross-file drift
- likely right for most expanded-planning cases
- reuses ARC's existing supporting-doc conventions instead of creating a new planning-specific one
- pairs naturally with an iterative `refine-plan-loop`
- allows plan splitting as the answer when one refinement unit becomes too dense

**Cons:**

- very large plans may still become hard to work in
- synthesis and transient investigation can still compete for space

**Current lean:** likely the first escalation step, even if ARC also supports companion artifacts.

### Option C — Introduce a formal expanded-planning companion artifact

Codify a second file for deeper shaping work.

**Pros:**

- separates synthesis from transient investigation
- makes structured gap-draining easier
- reduces pressure on the main plan document

**Cons:**

- more artifact churn
- more lifecycle rules
- risk that users maintain the companion and neglect the plan
- duplicates capability ARC already has through `analysis-*` / `research-*`

**Current lean:** not favored. ARC should first try to solve the problem with one promoted
`plan-*` document plus existing supporting-doc conventions.

## Open Questions

1. **Terminology:** Is "expanded planning path" the right ARC term, or is there a stronger term
   that is precise without sounding mandatory or overly generic?
2. **Thresholding:** Should `arc-plan` only suggest escalation, or should ARC also document hard
   triggers that strongly recommend expanded planning?
3. **Inline promotion shape:** What is the minimum promoted structure inside `plan-*` that helps
   without turning the plan into a pseudo-PRD?
4. **Loop workflow:** What is the right minimal workflow shape for `refine-plan-loop` now that the
   lean is a standalone workflow conditionally loaded by session-init?
5. **Per-pass pointer shape:** What is the lightest useful structure for the "next batch" pointer
   a loop pass should leave behind for the next session?
6. **Detection reliability:** Are user intent, session pointers, and artifact inspection sufficient
   to detect expanded planning reliably, or do real cases justify explicit metadata later?
7. **Readiness boundary:** What specific conditions are sufficient to move from expanded planning
   back into `create-prd`?
8. **Plan splitting:** What are the strongest non-line-count signals that a plan has ceased to be a
   manageable refinement unit?
9. **One-to-many PRDs:** What is the lightest useful way to capture candidate PRD splits during
   planning?

## Initial Scope Estimate

**Scope:** Medium

This is not just a skill tweak. It likely touches:

- planning strategy
- `arc-plan`
- plan template guidance
- file classification conventions
- docs and examples
- install/update content shipped by the framework

The implementation surface is still bounded because the core pipeline remains intact. This work is
about adding an optional path and codifying its use, not redesigning ARC's planning model from
scratch.
