# Plan: arc-plan as Planning Conductor

**Purpose:** Reframe `arc-plan` as ARC's canonical planning conductor — the entry point for any
planning ceremony, with selectable depth (minimum / standard / expanded). Make planning ceremony
consistent regardless of branch protection mode, tier, or worktree configuration; close the
status-file creation gap that opens when planning happens without a planning-branch ceremony; and
add an expanded depth for high-novelty, high-coupling work that needs more structure than
freeform exploration.

- **State:** Draft — pre-PRD exploration captured 2026-04-10; reframed 2026-04-29 from "optional
  expanded path" to "canonical planning conductor with depth selection" during interlock-foundation
  PRD discussion.

- **Created:** 2026-04-10 (revised 2026-04-29)

- **Origin:** Live pressure from `plan-arc-modes.md` exposed a gap between ARC's
  intentionally light plan stage and the needs of large greenfield shaping work. The 2026-04-29
  conductor reframe emerged from interlock-foundation PRD discussion: that PRD's planning-session
  active-surface scope creates the status file at planning-branch activation, but no equivalent
  ceremony fires under partial protection or any path that bypasses planning-branch activation.
  `arc-plan` is the natural canonical invocation that closes the gap, while also providing the
  orchestration layer that downstream WUs (`plan-worktree-foundation.md`, `plan-agile-wu-lifecycle.md`)
  consume.

> **Cross-plan note:** Pointer references in this document use the per-WU `status-{name}.md` model
> (Work-Status Restructure WU, shipped). Under `plan-completion-status-consolidation.md` the
> status file persists post-archive as the WU's terminal record, which strengthens the conductor's
> case for treating it as the unified pointer artifact across the WU lifecycle.

---

## Problem Statement

ARC's planning entry experience has three concrete gaps:

### 1. No canonical entry point

Planning happens through workflow files (`activate-planning-branch.md`, `1_create-prd.md`) and
through the freeform `arc-plan` facilitation skill, but nothing ties them together. There is no
single discoverable invocation for "I want to start planning new work." Adopters arrive at planning
through whichever surface they happen to know — workflow-file-driven, skill-driven, or ad-hoc edits
to `plan-*.md` directly. The framework's planning-entry intent is implicit, not addressable.

### 2. Status-file creation is branch-ceremony-coupled

`plan-session-operational-flow.md`'s interlock foundation establishes that planning sessions
get a `status-{name}.md` as the active-surface pointer, with `State: Planning` and an optional
`**Spec:**` field. But the creation step lives in `activate-planning-branch.md`, which only fires
under `branch.protection: full` (or when explicitly invoked). Under partial protection, or any path
that skips planning-branch ceremony, no status file is created — and the active-surface gap the
foundation aims to close remains open in those cases.

The `activate-work-unit` fallback (defensive idempotent ensure-status-file) handles the absent-file
case at WU activation, but that's the safety net; the conductor's role is to make the entry-time
case work cleanly, not lean on a fallback.

### 3. No depth scaling for unusually complex planning work

ARC's planning strategy is intentionally light:

- `plan-*` documents are freeform exploration artifacts
- the existing `arc-plan` skill facilitates elicitation and synthesis
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

The result is not planning failure, but planning friction: unresolved decisions are rediscovered
repeatedly, context becomes hard to contain, gap resolution becomes churn-heavy, and the path from
"rough idea" to "formalization-ready plan" is under-supported.

---

## Design Goal

`arc-plan` becomes ARC's canonical planning conductor:

- **Single discoverable verb** for entering planning, regardless of mode, tier, or branch state
- **Depth selection** — minimum (structural setup only), standard (today's facilitation), expanded
  (refine-plan-loop deep shaping) — chosen at invocation time and adjustable mid-flight
- **Downstream orchestration** — invokes the right downstream operations for the configuration
  (planning-branch activation under full protection, worktree spawn when warranted, status-file
  creation when absent)
- **Consistent prereq guarantees** — when arc-plan returns control, the agent and user can proceed
  with planning knowing the structural prereqs are in place (status file exists, plan-doc skeleton
  exists, branch state is appropriate)

The expanded depth preserves everything from the original 2026-04-10 design: bounded refinement
loop, plan-splitting detection, exit conditions, structured promotion of `plan-*`. What changes is
that "expanded" is one selectable depth under a unified conductor, not an alternative path beside
"standard."

---

## Non-Goals

- Do **not** make all `plan-*` work more ceremonial — minimum depth must remain near-zero overhead
- Do **not** turn the plan stage into a gated approval workflow
- Do **not** replace `create-prd` as the formalization boundary
- Do **not** require a companion artifact for ordinary work
- Do **not** blur PRDs into implementation specs or task lists
- Do **not** block planning when arc-plan isn't invoked — direct edits to `plan-*.md` and
  workflow-file-driven planning remain valid; the conductor is the canonical surface but bypassing
  it is permitted (the activate-work-unit fallback catches structural omissions)

---

## Working Thesis

ARC's current planning strategy is still directionally right:

- `plan-*` should remain freeform by default
- discovery quality matters more than document template rigidity
- structure should increase as fidelity increases
- planning should stay bounded at the level of a manageable refinement unit

What's missing is **a canonical entry surface that guarantees structural integrity and offers
depth selection**. The arc-plan skill already exists as a facilitation surface; promoting it to
conductor extends its identity rather than introducing a new mechanism. The expanded depth is the
escalation path the original 2026-04-10 design proposed; minimum and standard depths cover the
cases that didn't need a new file then and still don't.

---

## Design Lean

### 1. arc-plan as canonical planning conductor

`arc-plan` becomes the verb for entering planning. When invoked, it:

1. **Assesses context** — current branch, branch protection mode, tier intent, presence of existing
   artifacts (status file, plan-doc, PRD), worktree state
2. **Determines required setup** — what structural prereqs are absent that must be created for
   planning to proceed cleanly
3. **Selects depth** — from explicit user signal (e.g., `/arc-plan --depth expanded`), inferred
   signals (high-novelty cues from the user's framing, existing expanded-structure plan-doc), or
   default (minimum for most invocations, standard when elicitation is the user's stated need)
4. **Invokes downstream operations** — planning-branch activation, worktree spawn, status-file
   creation — in the right order for the configuration
5. **Hands off or stays engaged** depending on depth — minimum returns control immediately after
   setup; standard remains for facilitation; expanded enters the refine-plan-loop

The conductor is the orchestration layer. The downstream workflows (`activate-planning-branch.md`,
`refine-plan-loop.md`, etc.) remain canonical specifications; the conductor invokes them.

### 2. Three depth modes under one conductor

| Depth        | Behavior                                                                                                                                        | Default for                                                          |
|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| **minimum**  | Structural setup (status file, plan-doc skeleton, branch/worktree as needed), then steps out of the way                                         | Routine planning, well-understood scope, user wants to drive         |
| **standard** | Minimum + collaborative elicitation and synthesis facilitation (today's `arc-plan` behavior)                                                    | User explicitly wants facilitation, or scope is medium-novelty       |
| **expanded** | Standard + `refine-plan-loop` workflow (bounded batched refinement, plan-splitting detection, formalization-readiness tracking)                 | High-novelty, high-coupling, cross-cutting, or large-surface work    |

Depth is selectable at invocation (`--depth minimum|standard|expanded`) and adjustable mid-flight
(escalation from minimum → standard → expanded as scope reveals itself). Demotion is also valid
(expanded → standard once the deep shaping resolves, before reaching create-prd).

### 3. Status-file creation contract

The conductor closes the planning-session active-surface gap left by
`plan-session-operational-flow.md`'s branch-ceremony-coupled creation step. Three converging entry
routes, all producing the same artifact:

- **Planning-branch route** (`branch.protection: full` + planning ceremony) —
  `activate-planning-branch.md` creates the status file (interlock-foundation requirement)
- **arc-plan route** (any mode, conductor-driven) — arc-plan creates the status file when absent
- **Activation fallback** — `activate-work-unit.md` Step 4 acts as the safety net (idempotent
  ensure-status-file)

All three converge on the same template (`State: Planning`, optional `**Spec:**`, optional
`**Sibling Work Unit(s):**`, no Task List). Idempotent creation is the contract — if the file
already exists, leave it alone or update specific fields per the invocation context, never
overwrite.

This depends on interlock-foundation's template and lifecycle plumbing landing first; the conductor
consumes that foundation rather than redefining it.

### 4. Tier-aware orchestration

The conductor reads tier intent (when `plan-agile-wu-lifecycle.md` lands) and adapts:

- **Atomic tier** — planning ceremony is largely skipped; arc-plan invocation may not even be
  appropriate. If invoked, the conductor advises the atomic-tier path (no plan-doc, no PRD) and
  exits without creating planning artifacts. Atomic work is fully captured by the commit + PR
  description.
- **Quick tier** — minimum depth by default. Conductor may generate a `## Scope` section in the
  task-list header (per agile-wu-lifecycle's quick-tier shape) rather than a separate plan-doc.
  No PRD; spec lives in the task list or external tracker.
- **Standard tier** — minimum, standard, or expanded depth as appropriate. Plan-doc generated;
  PRD path follows.

The `**Tier:**` field on the status file (introduced by agile-wu-lifecycle) is the signal source.
Until that lands, the conductor defaults to standard-tier behavior.

### 5. Worktree orchestration

When `plan-worktree-foundation.md` lands the spawn-vs-continue model, the conductor invokes spawn
(creating a worktree + branch + status file scaffold) when planning a new WU that warrants its own
worktree. The conductor doesn't redefine spawn semantics — it calls into the canonical spawn
operation. Tier-aware spawn applicability per worktree-foundation: atomic skips, quick optional
under partial protection, standard always under full.

The conductor's role is the "ok, we have an idea or know something we have to do and no artifacts
of any kind exist for it yet, or it's in one of the backlog bucket files but there's no plan doc
or anything formal" entry trigger. From there, it routes to the appropriate downstream operations
(spawn worktree if warranted, switch into it, create status file, generate plan-doc skeleton),
and the user / agent picks up planning in the new context.

### 6. Keep `plan-*` as the primary synthesis artifact

`plan-*` remains the authoritative synthesis document throughout pre-PRD work. It should continue
to hold the readable narrative:

- problem framing
- key design conclusions
- major trade-offs
- stable scope boundaries
- PRD-feeding conclusions

This avoids making the status file or any companion artifact the center of gravity for planning
content. The status file is the project pointer (state, branch, spec); the plan-doc is the
synthesis narrative; the conductor coordinates their creation but doesn't own their content.

### 7. Inline promotion before companion artifacts

When a plan needs more structure (under expanded depth), the first escalation step is **promoting
the `plan-*` document to a more structured internal shape**, rather than immediately creating a
second file.

Examples of promoted structure inside `plan-*`:

- explicit resolved decisions table
- open questions grouped by category
- assumptions requiring validation
- candidate PRD split map
- findings-to-land tracking section

If shaping work still needs extra space, ARC's general-purpose supporting-doc conventions
(`analysis-*`, `research-*`) remain the escape valves. Expanded depth itself does not invent a new
planning-specific companion class unless one-file promotion proves inadequate in practice.

**Why this lean:** lower churn, fewer moving parts, less lifecycle ambiguity, easier continuity
across sessions, less risk of split-brain planning, and better alignment with ARC's existing
artifact model: plan is the pre-PRD synthesis, PRD is the stable requirements artifact, ADRs later
capture implementation-phase rationale where needed.

### 8. Depth selection signals

The conductor selects depth from the strongest available signal:

1. **Explicit user signal** — `/arc-plan --depth <minimum|standard|expanded>` or natural-language
   equivalent ("I want to think out loud about this," "this is a quick one," "this needs deep
   shaping")
2. **Existing artifact shape** — if a `plan-*` already exists with expanded structure (resolved-
   decisions table, findings register, etc.), default to expanded depth on resume
3. **Inferred novelty cues** — user's framing mentions greenfield/novel/architecture-shaping;
   plan-to-many-PRD decomposition; new design decisions surfacing while resolving old ones; same
   gaps rediscovered across sessions; spans many domains; user reports plan has become messy or
   churn-heavy
4. **Tier context** — atomic skips planning, quick defaults to minimum, standard defaults to
   minimum or standard
5. **Default** — minimum depth

When inferred signals point at a heavier depth than the user's stated intent, the conductor
**surfaces the suggestion** rather than escalating silently:

- continue at current depth
- promote the `plan-*` structure
- adopt the next deeper depth

That keeps the conductor materially useful without making it a gatekeeper.

### 9. Visible exit conditions for expanded depth

Expanded depth should not become an endless design phase. ARC needs clear guidance for when a plan
is ready to return to the normal PRD pipeline.

A plan is ready to exit expanded depth when:

- the core problem framing is stable
- the main scope boundaries are explicit
- hidden design decisions have been surfaced and either resolved or deliberately deferred
- major assumptions are either validated or clearly named
- candidate PRD boundaries are understood if the work is too broad for one PRD
- the remaining open items are detail-design, not scope-defining unknowns

This is guidance, not a formal gate. `create-prd` remains the authoritative workflow boundary.

### 10. Loop-driven expanded depth

Expanded depth is not a one-pass document-writing exercise. It is an iterative process more like
task execution than like template filling:

- identify the highest-leverage unknowns
- investigate a bounded batch
- fold conclusions back into the plan
- reassess readiness

ARC supports this with the **`refine-plan-loop`** workflow — the planning-side analogue to
`process-task-loop`:

- **not** a hard gate
- **not** a second authority beside `create-prd`
- **yes** a repeatable loop that supports multi-session refinement for expanded plans
- **yes** explicitly collaborative, following ARC's co-development posture rather than implying
  autonomous agent planning

The loop's contract stays narrow:

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

### 11. Plan-splitting detection

PRD decomposition and plan splitting are different concerns:

- **PRD decomposition** asks: how many work units should implementation become?
- **Plan splitting** asks: is this problem space still a manageable refinement unit?

A single plan may be too dense to refine effectively even if the work later becomes one PRD. The
issue is planning manageability, not implementation count.

`refine-plan-loop` includes explicit **plan-splitting detection**, based on structural signals:

- open findings cluster into weakly coupled subproblems
- different regions of the plan evolve semi-independently
- sessions repeatedly work one portion while the rest stays inert
- the plan has become hard to resume without loading too much context
- one region is nearing formalization while another is still exploratory
- keeping one plan coherent costs more than maintaining two smaller plans

When these signals appear, the loop recommends one of:

1. continue refining as one plan
2. split into multiple `plan-*` documents
3. move to `create-prd`

This keeps expanded depth bounded and prevents the template structure from becoming an excuse for
unlimited plan growth.

### 12. Bounded refinement unit (template structure)

The expanded structure helps organize substantial planning work but is not designed as an
infinitely extensible mega-template. It is optimized for one manageable shaping unit.

First-pass structure:

1. **Problem / Motivation** — stable framing
2. **Current Lean** — current best synthesis, even if provisional
3. **Decision Surface** — major questions or boundaries still blocking formalization
4. **Findings / Investigations** — active register for bounded refinement batches
5. **Scope / Split Pressure** — scope boundaries, notable split pressure, candidate PRD split
   notes only when relevant
6. **Formalization Readiness** — what still blocks `create-prd`
7. **Next Batch** — optional but strongly recommended pointer for the next refinement pass

Everything else conditional rather than mandatory:

- assumptions may live as a subsection inside findings when they are not substantial enough to
  warrant their own top-level section
- candidate PRD decomposition appears only when decomposition pressure exists
- split pressure should be visible when it matters, not ritualistically maintained at all times

The key constraint: this structure must remain useful without ballooning into a second PRD. If it
starts to fail, plan splitting is the answer before adding more artifact types.

### 13. Reuse planning-state vocabulary

ARC already has plan-state language in the existing `arc-plan` skill: `fresh`, `rough`, `maturing`,
`formalization-ready`. The conductor reuses that vocabulary rather than introducing a second
top-level state taxonomy. `refine-plan-loop` adds secondary descriptors for current motion:

- **motion:** expanding / converging
- **split pressure:** low / rising / high

This keeps ARC's planning language internally consistent while still giving the loop enough nuance
to describe what is happening.

### 14. Resume-aware refinement

`refine-plan-loop` does not assume a blank slate except on first entry. In most cases, the current
session already has a lead from the previous pass:

- a recommended next batch
- the last batch completed
- a note that split pressure is rising

Continuity model:

- `session-init` / `session-handoff` keep ownership of cross-session continuity mechanics
- `refine-plan-loop` defines what a good **next-pass pointer** looks like
- each loop pass leaves behind enough structured guidance for the next session to resume without
  rediscovering the planning landscape

Priority for selecting the next batch:

1. explicit carried-forward pointer from the prior pass
2. current user direction
3. the highest-leverage unresolved cluster visible in the plan

### 15. Session-init detection of active planning

When `refine-plan-loop` is a real workflow, session-init treats expanded planning the same way it
currently treats task execution.

Detection model:

- when session-init can tell that expanded planning is the focus of the session, it conditionally
  loads `refine-plan-loop` (the empty `planning` slot in session-init item 10's lifecycle-workflow
  branch is the natural fit)
- if the session later pivots into expanded planning, the workflow loads then
- ordinary freeform planning (minimum / standard depth) does **not** trigger workflow loading by
  default

This mirrors the existing ARC architecture cleanly:

- **task execution active** → load `process-task-loop`
- **expanded planning active** → load `refine-plan-loop`

Distinction matters: this is about **expanded depth**, not all planning. Standard freeform planning
remains light-touch and is not over-proceduralized.

### 16. Detection signal order for expanded planning

Detection follows ARC's normal preference: existing signals before new metadata.

Signal order:

1. **User intent**
    - explicit `arc-plan --depth expanded` invocation
    - explicit request to continue or refine an expanded plan
2. **Existing session pointers**
    - active WU's status file (`State: Planning`, `**Spec:**` pointer)
    - SESSION-NOTES handoff guidance
    - prior next-pass pointer left by the previous refinement pass
3. **Artifact inspection**
    - a `plan-*` exists
    - it visibly uses expanded structure
    - it carries unresolved findings, assumptions, split pressure, or readiness tracking
4. **Only then consider explicit metadata**
    - e.g. a future `Planning Depth: Expanded` marker, if the first three signal layers prove
      insufficient in practice

Explicit plan metadata is treated as a **last resort**, not the default mechanism.

### 17. First-pass workflow draft for `refine-plan-loop`

Aligned with ARC's existing loop-style workflows while keeping planning collaborative rather than
autonomous. This is the workflow invoked when arc-plan enters expanded depth.

#### Purpose

Guide one bounded collaborative refinement increment on an expanded `plan-*` document, then stop
for direction.

#### Collaboration model

- The workflow is **co-development**, not autonomous plan generation
- One pass is one bounded refinement increment, analogous to one task increment in
  `process-task-loop`
- After each pass, the agent reports current state and **stops** for user direction unless the
  user explicitly requests continued passes in the same session

#### Proposed steps

1. **Resume and orient**
    - Read the current `plan-*`
    - Identify the current planning state (`rough` / `maturing` / `formalization-ready`)
    - Check for carried-forward guidance from the prior pass (recommended next batch, last
      completed batch, split-pressure note)
    - If no pointer exists (typical only on first entry), fall back to choosing from the open
      decision surface in the plan

2. **Assess current shape**
    - Identify the highest-leverage unresolved clusters
    - Assess current motion (expanding / converging) and split pressure (low / rising / high)

3. **Select one refinement batch**
    - Choose one bounded batch for this pass
    - Batch selection priority: explicit carried-forward next batch → current user direction →
      highest-leverage unresolved cluster
    - The batch is one coherent cluster, not "advance the whole plan a bit"

4. **Refine the batch collaboratively**
    - Clarify the question or boundary being worked
    - Evaluate alternatives and trade-offs
    - Validate assumptions where possible
    - Surface implications and adjacent hidden decisions
    - If new adjacent issues appear, capture them; do not silently expand the batch
    - If the batch reaches a user-judgment decision that cannot responsibly be folded into the plan
      without direction, stop early and surface it rather than guessing

5. **Fold conclusions back into the plan**
    - Update current lean if it changed
    - Update findings / investigations for the batch
    - Update assumptions, scope boundaries, split pressure, or candidate PRD decomposition when
      affected
    - Record what is now resolved, what remains open, what was deferred

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
    - Report current planning state, what this pass resolved, what remains, recommended next step
    - **Mandatory stop** — wait for user direction
    - If the user explicitly wants another refinement pass in the same session, loop back to
      **step 2**

#### Per-pass completion protocol

Planning needs a completion protocol parallel to task execution, but lighter and planning-specific:

1. finish one bounded refinement batch
2. update the `plan-*` file to reflect what became clearer
3. verify the pass is documented coherently
4. report current state to the user
5. stop for direction

**Pre-report checklist:**

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

The workflow stops early and surfaces the issue when:

- a design decision needs explicit user judgment before the batch can proceed
- split pressure becomes high enough that continuing in one plan would be misleading or wasteful
- the current batch depends on external research or code/context reads that materially change the
  problem framing
- the plan reaches `formalization-ready` state before the session's intended scope ends
- the batch expands beyond a bounded increment and should be re-scoped before continuing

These are planning stop conditions, not failures. They preserve bounded collaborative refinement
rather than enforce ceremony.

#### Next-pass pointer

Each pass leaves behind a small pointer for the next pass or next session:

- **Last batch completed**
- **Recommended next batch**
- **Why that batch is next**
- **Current split pressure** (only if notable)

This is intentionally lighter than a second session-state mechanism. It gives `session-handoff` and
future sessions something concrete to carry without creating a new tracked metadata system.

---

## Proposed ARC Changes

### Conductor identity and skill

- Promote `arc-plan` from facilitation skill to canonical planning conductor; update skill
  description and discovery surface accordingly
- Add `--depth <minimum|standard|expanded>` selection (or natural-language equivalents)
- Implement context assessment (branch, mode, tier, existing artifacts, worktree state) and
  downstream-operation orchestration
- Add depth-selection signal detection (explicit, artifact-shape-driven, novelty cues, tier-driven)
- Document the conductor's invocation contract and prereq guarantees

### Workflow integration

- Update `activate-planning-branch.md` to be conductor-callable as well as direct-invocable —
  same workflow, different entry surface
- Add conductor-driven status-file creation path for planning sessions outside the
  planning-branch ceremony
- Add `refine-plan-loop.md` workflow file for expanded depth (the first-pass draft in § Design
  Lean § 17)
- Extend session-init item 10's lifecycle-workflow branch — `planning` slot loads
  `refine-plan-loop.md` when expanded planning is the active session shape

### Strategy and constitution

- Update `strategy-work-planning.md` to define the conductor model and the three depth modes
- Add escalation guidance: when minimum suffices, when to escalate to standard, when to escalate
  to expanded
- Add one-plan-to-many-PRD guidance as a first-class expected outcome for large shaping efforts
- Add plan-splitting guidance as distinct from PRD decomposition
- Clarify that expanded depth does not create a new default artifact class
- Cross-reference the conductor's role from `DEV-RULES.ARC` § Verification and Discovery (or a new
  § Planning Entry section if appropriate at PRD time)
- Update `strategy-work-organization.md` § Spec-Flow Invariants > Deferred contract to name
  `arc-plan` (and the conductor model defined in this WU) as the surface owning per-mode ×
  per-tier spec-form selection. Currently phrased as "surfaces that orchestrate per-mode and
  per-tier policy" — adopter-safe abstraction pending this WU per audience-boundary discipline
  (no forward-pointers to unplanned future scope from adopter-facing strategies)

### Templates and examples

- Revisit `template-plan.md`:
    - keep freeform planning as the default ARC stance for minimum / standard depth
    - evolve the template into the optional expanded-depth structure
    - allow existing freeform plans to graduate into that structure over time
- Decide whether ARC needs an example of promoted in-file structure beyond the template itself
- Ensure the template is optimized for a bounded refinement unit, not unbounded accumulation

### Docs and adoption guidance

- Update docs and strategy references so ARC users understand:
    - `arc-plan` is the canonical entry verb for planning
    - depth selection is a first-class concept; minimum is the common case
    - not all plans need expanded depth
    - one promoted `plan-*` document is the default expanded-depth shape
    - `analysis-*` / `research-*` remain available when genuinely needed

### CLI and install considerations

- The framework ships updated template and strategy guidance
- `arc update` implications checked if file classification or examples change
- Mode-aware guidance may be needed if conductor behavior differs across `pm.mode` values
- Whether `arc-plan` becomes a CLI command (`arc plan`) in addition to the skill is a PRD
  decision — the skill is the primary surface; a CLI verb would be a convenience

---

## Dependencies and Sequencing

### Upstream

- **`plan-session-operational-flow.md` / Interlock Foundation WU (current planning):**
  hard upstream dependency. Conductor consumes the status-file template additions (`**Spec:**`,
  `State: Planning`, `**Sibling Work Unit(s):**`), the planning-active-surface lifecycle plumbing
  in `activate-planning-branch` / `integrate-planning-branch`, the probe sessionType inference
  reading `State: Planning`, and the activate-work-unit ensure-status-file fallback. The conductor
  is the canonical entry that complements those mechanics; without them landed, the conductor has
  no foundation to consume.

### Sibling (parallelizable)

- **`plan-completion-status-consolidation.md`:** strengthens the conductor's case for the
  status file as the unified pointer artifact (persisting post-archive). Either ordering works —
  conductor-first means status-file persistence is a forward-compatible enhancement;
  consolidation-first means the conductor inherits the persistent-pointer model from the start.

### Downstream

- **`plan-worktree-foundation.md`:** conductor invokes spawn-vs-continue when planning warrants its
  own worktree. Conductor doesn't redefine spawn semantics — calls into the canonical operation
  worktree-foundation establishes. Conductor ships before or after worktree-foundation; if before,
  worktree integration is a subsequent enhancement.
- **`plan-agile-wu-lifecycle.md`:** conductor reads `**Tier:**` field for tier-aware orchestration
  (atomic skips, quick defaults to minimum, standard supports all depths). Until agile-wu-lifecycle
  lands the field, conductor defaults to standard-tier behavior.

### Recommended sequencing

Interlock Foundation (WU-A of `plan-session-operational-flow.md`) → **arc-plan Conductor** ‖
Worktree Foundation ‖ Agile WU Lifecycle. Conductor is parallelizable with the worktree and
tier-model work; integration happens incrementally as those land.

---

## Relationship to Other Plans

This plan reframes a previously-narrow scope ("optional expanded planning path") into a broader
identity ("canonical planning conductor with depth selection") that interacts with several
recently-created backlog plans:

- **`plan-session-operational-flow.md`** — interlock-foundation WU establishes the
  status-file plumbing the conductor consumes. Hard upstream dependency.
- **`plan-completion-status-consolidation.md`** — proposed status-file persistence into
  archive aligns with the conductor's treatment of the status file as the unified pointer.
- **`plan-worktree-foundation.md`** — spawn-vs-continue model the conductor invokes when planning
  warrants worktree isolation.
- **`plan-agile-wu-lifecycle.md`** — `**Tier:**` field the conductor reads for tier-aware
  orchestration; `arc start` command and tier-aware activation paths the conductor coordinates
  with.
- **`plan-arc-modes.md`** — original pressure source. The conductor model honors the modes
  plan's lean toward configurable adoption (Lite vs Full) — minimum depth suits Lite cleanly;
  expanded depth is Full-mode territory.

---

## Alternatives

### Option A — Keep arc-plan as facilitation-only; resolve gaps via workflow edits

Strengthen `arc-plan`'s elicitation behavior, add status-file creation to `activate-work-unit` as
the primary path (not fallback), and leave artifact structure entirely to user judgment.

**Pros:**

- zero new conductor concept
- lowest process surface
- preserves current arc-plan identity

**Cons:**

- doesn't give ARC a canonical planning entry verb
- status-file creation responsibility scattered across multiple workflows
- repeated churn patterns remain uncodified
- no explicit support for one-plan-to-many-PRD decomposition
- relies heavily on individual user discipline and ad hoc structure

**Current lean:** insufficient. The conductor reframe is what unifies the entry experience.

### Option B — Conductor with two depths (standard / expanded), no minimum

Make arc-plan the canonical entry, but only support standard and expanded depths. Skip "minimum"
as a depth.

**Pros:**

- simpler depth model
- arc-plan invocation always means "facilitate"

**Cons:**

- forces facilitation overhead onto routine planning
- no clean fit for the "I just want the structural setup, then I'll drive" case
- adopters may bypass arc-plan to avoid forced facilitation, defeating the canonical-entry goal

**Current lean:** rejected. Minimum depth is what makes the conductor universally usable.

### Option C — Conductor with three depths (current lean)

Three-depth selection (minimum / standard / expanded) under one conductor.

**Pros:**

- canonical entry verb
- depth scales with need
- closes the status-file creation gap cleanly
- preserves freeform planning as the dominant case (minimum depth)
- expanded path available when work warrants it

**Cons:**

- depth model is one more concept to learn
- requires `--depth` flag or natural-language equivalent
- conductor's downstream orchestration is a real implementation surface

**Current lean:** preferred.

### Option D — Introduce a formal expanded-planning companion artifact

Codify a second file for deeper shaping work (the original 2026-04-10 alternative).

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

---

## Open Questions

### Conductor identity and ergonomics

1. **Naming:** Is `arc-plan` the right name now that the skill is conducting orchestration, not
   just facilitating? Alternatives: `arc-start-planning`, `arc plan`, `arc-orient`. Renaming has
   discoverability cost; current lean is keep `arc-plan` and document the elevated identity.
2. **Depth flag syntax:** `--depth minimum|standard|expanded` is verbose; alternatives include
   `-m / -s / -e` shorthand or natural-language inference. PRD decision.
3. **Invocation prereq guarantees:** After `arc-plan` returns control under minimum depth, what
   exactly is the agent allowed to assume? (Status file exists, plan-doc skeleton exists, branch
   appropriate, working tree clean — or some subset?)

### Bypass model

4. **Bypass tolerance:** When the user creates a `plan-*.md` directly without invoking arc-plan,
   does the framework warn at session-init? Block at activate-work-unit? Silently accept (relying
   on the activate-work-unit ensure-status-file fallback)? Current lean: silently accept; warn
   only if an obvious gap appears at session-init.

### Depth selection

5. **Thresholding:** Should `arc-plan` only suggest escalation, or should ARC also document hard
   triggers that strongly recommend expanded depth?
6. **Depth demotion ergonomics:** Once expanded depth completes deep shaping, how does the
   conductor signal "ready to drop to standard"? Implicit (plan reaches formalization-ready
   state)? Explicit user signal? Both?

### Expanded-depth mechanics

7. **Inline promotion shape:** What is the minimum promoted structure inside `plan-*` that helps
   without turning the plan into a pseudo-PRD?
8. **Loop workflow:** What is the right minimal workflow shape for `refine-plan-loop` now that the
   lean is a standalone workflow conditionally loaded by session-init?
9. **Per-pass pointer shape:** What is the lightest useful structure for the "next batch" pointer
   a loop pass should leave behind for the next session?
10. **Detection reliability:** Are user intent, session pointers, and artifact inspection
    sufficient to detect expanded depth reliably, or do real cases justify explicit metadata
    later?
11. **Readiness boundary:** What specific conditions are sufficient to move from expanded depth
    back into `create-prd`?
12. **Plan splitting:** What are the strongest non-line-count signals that a plan has ceased to be
    a manageable refinement unit?
13. **One-to-many PRDs:** What is the lightest useful way to capture candidate PRD splits during
    planning?

### Downstream orchestration

14. **Worktree-spawn invocation timing:** When the conductor identifies that a worktree spawn is
    appropriate, does it invoke spawn immediately (changing the working context within the
    invocation) or surface the suggestion and wait for user confirmation? Current lean: surface
    and wait — spawn is per worktree-foundation an explicit user act under all autonomy levels.
15. **Tier inference vs. tier prompting:** When the user invokes arc-plan without specifying tier,
    does the conductor infer tier from scope cues (and prompt to confirm) or always prompt? PRD
    decision after agile-wu-lifecycle's tier model lands.

---

## Initial Scope Estimate

**Large.** The conductor reframe elevates this from a skill enhancement to a planning-architecture
contribution. Touches:

- `arc-plan` skill (substantial extension — context assessment, depth selection, downstream
  orchestration)
- planning strategy (conductor model documentation, depth-mode guidance)
- `template-plan.md` (expanded-depth structure)
- `refine-plan-loop.md` (new workflow file)
- session-init lifecycle-workflow branch (planning slot wiring)
- `activate-planning-branch.md` (conductor-callable + direct-invocable)
- file classification conventions
- docs and examples
- install/update content shipped by the framework

The implementation surface is bounded because the core pipeline (PRD → tasks → execution) remains
intact. This work adds the canonical entry layer and codifies its use, not redesigning ARC's
planning model from scratch.

Sequencing: depends on Interlock Foundation WU landing the status-file plumbing first.
Parallelizable with Worktree Foundation and Agile WU Lifecycle.

---
