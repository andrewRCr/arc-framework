# Draft: arc-plan as Planning Conductor

**Purpose:** Reframe `arc-plan` as ARC's canonical planning conductor — the entry point for any
planning ceremony, with selectable `planning depth` (`low` / `medium` / `high`). Make planning
ceremony consistent regardless of branch protection mode, `Class`, or worktree configuration; close
the status-file creation gap that opens when planning happens without a planning-branch ceremony; and
add a `high`-depth path for high-derivation, high-coupling work that needs more structure than
freeform exploration.

- **State:** Draft — pre-PRD exploration captured 2026-04-10; reframed 2026-04-29 from "optional
  expanded path" to "canonical planning conductor with depth selection" during interlock-foundation
  PRD discussion. Updated 2026-05-19 with WOR-induced terminology shifts (see § WOR alignment note
  below).

- **Created:** 2026-04-10 (revised 2026-04-29, terminology refresh 2026-05-19)

## Scope-boundary note — spec-form work is AWL's, not the conductor's (2026-06-02)

> The split below has since shipped (the scalable-authoring-pipeline / class-model-foundation
> cohort); it stands as the settled boundary the conductor builds on:
>
> - **AWL owns the grammar that scales** — the spec template family (`brief` / `outline` /
>   `detailed` PRD/RFC) and the scalable `create-spec` / `generate-tasks` workflows. That is
>   artifact-shape scaling, the scalable-core concern AWL owns. Spec form follows the work's
>   derivation depth, with `Class` constraining the available forms — no `Class` → spec-form
>   coupling for the conductor to redefine.
> - **This conductor owns facilitation** — the canonical pre-spec elicitation verb, planning-depth
>   selection (`low` / `medium` / `high`), and *invoking* the shape AWL defines. It reads `Class` /
>   planning depth and selects among AWL's templates; it does not ship them.
>
> This pulls the headline "scalable work units" value into AWL and keeps the conductor focused on
> the planning-conductor element. Body content below still predates ADR-020/021 in other respects —
> read it as the 2026-04-29 conception except where it speaks of `Class` / planning depth.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Forward-compat / cross-WU coordination as a standard planning consideration**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`), work-routing-discipline housekeep drain (2026-06-01).
- *Concern:* make "does other planned backlog work bear on this?" a built-in step during pre-impl planning
  (create-spec, generate-tasks, arc-plan) and the pre-impl audit (`arc-task-audit`), not an after-the-fact
  execution discovery. Bidirectional: pull downstream planned designs *into* current work where they should
  inform it; push refinements *back out* when current work changes assumptions a downstream WU rests on. The
  write-back half is the one most easily dropped.
- *Motivation:* recurring manual pattern — `worktree-foundation`'s 2026-05-26 cohort/downstream forward-compat
  cross-check hand-did exactly this (reserving extension points for `cross-machine-sync-coherence`, keeping
  logic extractable for `user-sync-module-split`).
- *Open:* efficiency — needs a cheap relevance filter (most WUs won't relate) + a bounded read; may key off
  `Depends On` / `Cohort` to scope the candidate set before any design read.
- *Routing:* candidate homes — this conductor (orchestration owner), the planning workflows (codified step),
  `arc-task-audit` (surfacing point), or a new WU; likely also a `strategy-work-planning` convention regardless.
  Related to but distinct from `in-flight-awareness` (active WUs vs. planned backlog WUs).

### `[ ]` **Collaborative team planning — single-author-draft + review model**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`), agile-wu-lifecycle cohort housekeep drain
  (2026-06-04). Re-homed here at drain (capture was TBD): it names a conductor seam and transforms this draft's
  Open Question 23. Candidate target `strategy-team-coordination` noted below; cohort-grouping flag carried,
  **not decided**. Captured during `concurrent-work-conventions` planning (2026-06-03).
- *Concern:* ARC's planning pipeline (`arc-plan` → `create-spec` → `generate-tasks`) and this draft's
  `refine-plan-loop` assume human+agent co-development, never multi-human team planning — a genuine gap.
  Idiomatic collaborative planning is single-author/scribe-drives-the-doc + others contributing via
  review / comments / discussion (the RFC model) — the same single-owner + review pattern CWC blessed for code
  WUs, applied to planning artifacts.
- *Proposed:* candidate homes — `strategy-team-coordination` (the "how teams plan together" framing) + a
  conductor seam (the single-author-draft-plus-review mechanism). Partly subsumes/transforms Open Question 23
  ("cleanup under team mode — multiple developers on a planning branch"), premised on the multi-dev-per-WU model
  CWC retires: under single-owner, a planning branch has one owner and collaboration is review, not co-located
  commits.
- *Flag (do not decide):* a possible "planning machinery / conventions" cohort grouping the conductor +
  graduation-cleanup + decomposition + this concern + the contested spec-form templates — this draft is already
  self-generating split pressure (OQ21 / scope estimate flag "possible split").

---

## WOR alignment note (2026-05-19)

This plan was authored when WU artifact prefixes were `plan-*` (exploration) and `prd-*` (spec)
with meta-file fields `**Spec:**` / `**Task List:**`. Work Organization Reform (WOR R66-R68)
renames the file classes to `draft-*` / `spec-*` and the meta-file field `**Spec:**` → `**Design:**`
(`**Task List:**` retained), with spec form variation routed through template choice (heaviest
variant `template-prd.md` preserved; lighter variants deferred to this WU's scope — `brief` ruled
out as a name, it collides with `reference/briefs/`).

This plan's body content predates the rename. Comprehensive content sweep (`plan-*` → `draft-*`;
`prd-*` → `spec-*`; `**Spec:**` field → `**Design:**`; `**Task List:**` retained;
`template-plan.md` → `template-draft.md`) **defers to this WU's activation** (Activation Audit
pattern, following `plan-worktree-foundation.md` convention). Readers of this draft today should
substitute terms inline. References to "PRD" as the artifact-form name remain appropriate where
contextually used — a PRD is now one template variant under the unified `spec-*` filename class.

Conductor-WU implications of the rename (substantive content captured here, not deferred):

1. **Template-variant scaling under unified `spec-*`.** WOR locks the unified prefix and establishes
   the spec-form template home at `reference/templates/arc/work-unit/spec/` (WOR Phase 7), with
   `template-prd.md` preserved there as the heaviest variant; this WU ships the lighter variants
   alongside it. Recommended: recycle `template-plan.md` as a *middle-weight spec variant*
   (templating `spec-*` content — see filename-history note below). A lightest-weight variant is
   needed too; name TBD, but **not `brief`** (collides with `reference/briefs/`). Other forms as
   patterns surface during PRD work.
2. **`template-plan.md` filename-history note.** Under WOR, `template-plan.md` retires (renamed
   `template-draft.md` since `plan-*` → `draft-*`). If this WU re-introduces `template-plan.md` as
   a middle-weight spec template variant (templating `spec-*` content rather than `draft-*`
   content), it would be a same-name re-introduction with different role. No git conflict (file is
   gone post-WOR-rename), but worth flagging so the future author understands the history.
3. **`refine-plan-loop.md` workflow collateral rename.** The proposed planning-side loop workflow
   (§ Design Lean § 10, § 17) is named for the pre-WOR `plan-*` artifact. Under WOR's rename, the
   workflow likely warrants rename to `refine-draft-loop.md` for naming consistency. Decision at
   this WU's PRD time — note that the workflow's scope (operating on `draft-*` docs through
   refinement passes) matches `refine-draft-loop` more cleanly than `refine-plan-loop` does
   post-rename.
4. **`1_create-spec.md` body still PRD-framed.** WOR renamed the workflow file (`1_create-prd.md` →
   `1_create-spec.md`) and the spec file class (`prd-*` → `spec-*`), but deliberately left the
   workflow *body* PRD-centric — H1 "Workflow: Create PRD", PRD-shaped prose throughout (WOR Task
   7.1.c). The form-agnostic reframe — generalizing the workflow beyond PRD, paired with the lighter
   spec-form templates (§ 1) — is this WU's scope. Until then the filename leads the content: a
   reader opening `1_create-spec.md` finds a create-PRD workflow. Sequence the body reframe with the
   template-variant work (§ 1) so the workflow generalizes as the forms it targets land.

**Scalable-core alignment (ADR-020).** ADR-020 steers this WU to extend depth-selection / single-entry
beyond the planning entry point to the *lifecycle* workflows (init / activate / integrate / archive) —
"resolve-then-load over carry-and-skip," anchored on the existing extension / active-set mechanism so
simple cases don't carry complex-case instructions. The mechanism's design (and the `system/workflows/`
navigability question) is owned by `plan-composable-workflows.md`; the conductor is the integration point.
ADR-020 §9 carries the requirement.

- **Origin:** Live pressure from `plan-arc-modes.md` exposed a gap between ARC's
  intentionally light plan stage and the needs of large greenfield shaping work. The 2026-04-29
  conductor reframe emerged from interlock-foundation PRD discussion: that PRD's planning-session
  active-surface scope creates the status file at planning-branch activation, but no equivalent
  ceremony fires under partial protection or any path that bypasses planning-branch activation.
  `arc-plan` is the natural canonical invocation that closes the gap, while also providing the
  orchestration layer that delegates to upstream WF's spawn primitive (per 2026-05-20 resequence,
  WF ships before this WU) and that downstream `plan-agile-wu-lifecycle.md` populates with
  `Class`-aware depth defaults.

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

- **Single discoverable verb** for entering planning, regardless of mode, `Class`, or branch state
- **Planning-depth selection** — `low` (structural setup only), `medium` (today's facilitation),
  `high` (refine-plan-loop deep shaping) — chosen at invocation time and adjustable mid-flight
- **Downstream orchestration** — invokes the right downstream operations for the configuration
  (planning-branch activation under full protection, worktree spawn when warranted, status-file
  creation when absent)
- **Consistent prereq guarantees** — when arc-plan returns control, the agent and user can proceed
  with planning knowing the structural prereqs are in place (status file exists, plan-doc skeleton
  exists, branch state is appropriate)

The `high`-depth path preserves everything from the original 2026-04-10 design: bounded refinement
loop, plan-splitting detection, exit conditions, structured promotion of `plan-*`. What changes is
that `high` planning depth is one selectable resolution under a unified conductor, not an alternative
path beside `medium`.

---

## Non-Goals

- Do **not** make all `plan-*` work more ceremonial — `low` planning depth must remain near-zero overhead
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
planning-depth selection**. The arc-plan skill already exists as a facilitation surface; promoting
it to conductor extends its identity rather than introducing a new mechanism. The `high`-depth path
is the escalation the original 2026-04-10 design proposed; `low` and `medium` depths cover the
cases that didn't need a new file then and still don't.

---

## Design Lean

### 1. arc-plan as canonical planning conductor

`arc-plan` becomes the verb for entering planning. When invoked, it:

1. **Assesses context** — current branch, branch protection mode, `Class` intent, presence of
   existing artifacts (status file, plan-doc, PRD), worktree state
2. **Determines required setup** — what structural prereqs are absent that must be created for
   planning to proceed cleanly
3. **Selects planning depth** — from explicit user signal (e.g., `/arc-plan --depth high`), inferred
   signals (high-derivation cues from the user's framing, existing high-depth-structure plan-doc), or
   default (`low` for most invocations, `medium` when elicitation is the user's stated need)
4. **Invokes downstream operations** — planning-branch activation, worktree spawn, status-file
   creation — in the right order for the configuration
5. **Hands off or stays engaged** depending on depth — `low` returns control immediately after
   setup; `medium` remains for facilitation; `high` enters the refine-plan-loop

The conductor is the orchestration layer. The downstream workflows (`activate-planning-branch.md`,
`refine-plan-loop.md`, etc.) remain canonical specifications; the conductor invokes them.

### 2. Three planning-depth levels under one conductor

The conductor selects the planning stage's `planning depth` — the shipped `low` / `medium` / `high`
resolution — and engages proportionally:

| Depth        | Behavior                                                                                                                        | Default for                                                          |
|--------------|---------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| **`low`**    | Structural setup (status file, plan-doc skeleton, branch/worktree as needed), then steps out of the way                         | Routine planning, well-understood scope, user wants to drive         |
| **`medium`** | `low` + collaborative elicitation and synthesis facilitation (today's `arc-plan` behavior)                                      | User explicitly wants facilitation, or scope is moderate-derivation  |
| **`high`**   | `medium` + `refine-plan-loop` workflow (bounded batched refinement, plan-splitting detection, formalization-readiness tracking) | High-derivation, high-coupling, cross-cutting, or large-surface work |

Depth is selectable at invocation (`--depth low|medium|high`) and adjustable mid-flight
(escalation from `low` → `medium` → `high` as scope reveals itself). Demotion is also valid
(`high` → `medium` once the deep shaping resolves, before reaching create-prd), bounded by the
work's `Class` floor — the conductor floats depth within the band, never below it.

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

### 4. `Class`-aware orchestration

The conductor reads the WU's `Class` and adapts:

- **Atomic work character** — an `atomic` concern below the WU wrapper is an Errand, not a planning
  WU: planning ceremony is skipped and arc-plan invocation may not even be appropriate. If invoked,
  the conductor advises the errand path (no plan-doc, no spec) and exits without creating planning
  artifacts. Atomic work is fully captured by the commit + PR description.
- **`light`** — `low` planning depth by default. The lightest spec is the `brief` form
  (`template-spec-brief.md`) — always a separate doc, never inlined into the task-list header.
- **`heavy` / `novel`** — `low`, `medium`, or `high` planning depth as appropriate. Plan-doc
  generated; the `outline` or `detailed` spec form follows.

The `**Class:**` field on the meta file is the signal source. The spec form follows the work's
derivation depth (`low` → `brief`, `medium` → `outline`, `high` → `detailed` PRD/RFC), with `Class`
constraining the valid forms (`brief` ⇒ `light`; `detailed` ⇒ `heavy` / `novel`; `outline`
straddles) — no `Class` → spec-form coupling for the conductor to redefine.

### 5. Worktree orchestration

When `plan-worktree-foundation.md` lands the spawn-vs-continue model, the conductor invokes spawn
(creating a worktree + branch + status file scaffold) when planning a new WU that warrants its own
worktree. The conductor doesn't redefine spawn semantics — it calls into the canonical spawn
operation. `Class`-aware spawn applicability per worktree-foundation: atomic (errand) skips, `light`
optional under partial protection, `heavy` / `novel` always under full.

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

When a plan needs more structure (under `high` planning depth), the first escalation step is **promoting
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

The conductor selects planning depth from the strongest available signal:

1. **Explicit user signal** — `/arc-plan --depth <low|medium|high>` or natural-language
   equivalent ("I want to think out loud about this," "this is a quick one," "this needs deep
   shaping")
2. **Existing artifact shape** — if a `plan-*` already exists with high-depth structure (resolved-
   decisions table, findings register, etc.), default to `high` on resume
3. **Inferred derivation cues** — user's framing mentions greenfield/novel/architecture-shaping;
   plan-to-many-PRD decomposition; new design decisions surfacing while resolving old ones; same
   gaps rediscovered across sessions; spans many domains; user reports plan has become messy or
   churn-heavy
4. **`Class` context** — atomic (errand) skips planning, `light` defaults to `low`, `heavy` /
   `novel` default to `low` or `medium`
5. **Default** — `low` planning depth

When inferred signals point at a heavier depth than the user's stated intent, the conductor
**surfaces the suggestion** rather than escalating silently:

- continue at current depth
- promote the `plan-*` structure
- adopt the next deeper depth

That keeps the conductor materially useful without making it a gatekeeper.

### 9. Visible exit conditions for `high` planning depth

`high` planning depth should not become an endless design phase. ARC needs clear guidance for when a
plan is ready to return to the normal PRD pipeline.

A plan is ready to exit `high` planning depth when:

- the core problem framing is stable
- the main scope boundaries are explicit
- hidden design decisions have been surfaced and either resolved or deliberately deferred
- major assumptions are either validated or clearly named
- candidate PRD boundaries are understood if the work is too broad for one PRD
- the remaining open items are detail-design, not scope-defining unknowns

This is guidance, not a formal gate. `create-prd` remains the authoritative workflow boundary.

### 10. Loop-driven `high` planning depth

`high` planning depth is not a one-pass document-writing exercise. It is an iterative process more
like task execution than like template filling:

- identify the highest-leverage unknowns
- investigate a bounded batch
- fold conclusions back into the plan
- reassess readiness

ARC supports this with the **`refine-plan-loop`** workflow — the planning-side analogue to
`process-task-loop`:

- **not** a hard gate
- **not** a second authority beside `create-prd`
- **yes** a repeatable loop that supports multi-session refinement for `high`-depth plans
- **yes** explicitly collaborative, following ARC's co-development posture rather than implying
  autonomous agent planning

> **Dependency:** the canonical loop pattern these workflows inherit is delivered by
> `loadset-composition` (its `process-task-loop` core/detail redesign — see that plan § The Loop
> Canon). `refine-plan-loop` / `refine-prototype-loop` consume it, so this WU sequences after
> loadset-composition. Reflected in `Depends On`.

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

This keeps `high` planning depth bounded and prevents the template structure from becoming an excuse
for unlimited plan growth.

### 12. Bounded refinement unit (template structure)

The high-depth structure helps organize substantial planning work but is not designed as an
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

When `refine-plan-loop` is a real workflow, session-init treats `high`-depth planning the same way it
currently treats task execution.

Detection model:

- when session-init can tell that `high`-depth planning is the focus of the session, it conditionally
  loads `refine-plan-loop` (the empty `planning` slot in session-init item 10's lifecycle-workflow
  branch is the natural fit)
- if the session later pivots into `high`-depth planning, the workflow loads then
- ordinary freeform planning (`low` / `medium` depth) does **not** trigger workflow loading by
  default

This mirrors the existing ARC architecture cleanly:

- **task execution active** → load `process-task-loop`
- **`high`-depth planning active** → load `refine-plan-loop`

Distinction matters: this is about **`high` planning depth**, not all planning. Ordinary freeform
planning remains light-touch and is not over-proceduralized.

### 16. Detection signal order for `high`-depth planning

Detection follows ARC's normal preference: existing signals before new metadata.

Signal order:

1. **User intent**
    - explicit `arc-plan --depth high` invocation
    - explicit request to continue or refine a `high`-depth plan
2. **Existing session pointers**
    - active WU's status file (`State: Planning`, `**Spec:**` pointer)
    - SESSION-NOTES handoff guidance
    - prior next-pass pointer left by the previous refinement pass
3. **Artifact inspection**
    - a `plan-*` exists
    - it visibly uses high-depth structure
    - it carries unresolved findings, assumptions, split pressure, or readiness tracking
4. **Only then consider explicit metadata**
    - e.g. a future `Planning Depth: high` marker, if the first three signal layers prove
      insufficient in practice

Explicit plan metadata is treated as a **last resort**, not the default mechanism.

### 17. First-pass workflow draft for `refine-plan-loop`

Aligned with ARC's existing loop-style workflows while keeping planning collaborative rather than
autonomous. This is the workflow invoked when arc-plan enters `high` planning depth.

#### Purpose

Guide one bounded collaborative refinement increment on a `high`-depth `plan-*` document, then stop
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
- Add `--depth <low|medium|high>` selection (or natural-language equivalents)
- Add `--modality <document|prototype|hybrid>` selection (or natural-language equivalents);
  default `document` (preserves existing behavior). See § 18.
- Implement context assessment (branch, mode, `Class`, existing artifacts, worktree state) and
  downstream-operation orchestration
- Add depth-selection signal detection (explicit, artifact-shape-driven, derivation cues, `Class`-driven)
- Add modality-selection signal detection (explicit, unknown-character, artifact inspection,
  `Class`-driven). See § 18 § Modality selection signals.
- Document the conductor's invocation contract and prereq guarantees

### Workflow integration

- Update `activate-planning-branch.md` to be conductor-callable as well as direct-invocable —
  same workflow, different entry surface
- Add conductor-driven status-file creation path for planning sessions outside the
  planning-branch ceremony
- Add `refine-plan-loop.md` workflow file for `high` planning depth, document modality (the first-pass
  draft in § Design Lean § 17)
- Add `refine-prototype-loop.md` workflow file for prototype modality — bounded spike + learning
  capture + disposition decision per pass (see § Design Lean § 18)
- Add `park-work-unit.md` workflow file for Planning → backlog transition (see § Design Lean § 20)
- Add `resume-work-unit.md` workflow file for backlog → Planning transition with worktree spawn
  (see § Design Lean § 20)
- Add `graduation-cleanup.md` workflow file for the Planning → Active state-flip cleanup ceremony
  (see § Design Lean § 19); invoked by `1_create-prd.md` as the final step before state-flip, or
  runnable standalone for mid-planning cleanup
- Extend session-init item 10's lifecycle-workflow branch — `planning` slot loads
  `refine-plan-loop.md` or `refine-prototype-loop.md` based on detected modality (signal order:
  existing planning-modality pointer → spike artifact presence → `plan-*` shape)

### Strategy and constitution

- Update `strategy-work-planning.md` to define the conductor model and the three depth modes
- Update `strategy-work-planning.md` to define the modality model (document / prototype / hybrid),
  modality-selection guidance, and the spike contract shape (hypothesis + acceptance criteria +
  scope cap + disposition commitment)
- Add escalation guidance: when `low` suffices, when to escalate to `medium`, when to escalate
  to `high`
- Add modality-selection guidance: when document modality suffices, when empirical unknowns
  warrant prototype, when hybrid is the right fit
- Add soft spike-cap recommendations per `Class` / depth (`light`: 1-2; `heavy` / `novel`: 3-5;
  `high` depth: 5+ as reflection trigger)
- Add one-plan-to-many-PRD guidance as a first-class expected outcome for large shaping efforts
- Add plan-splitting guidance as distinct from PRD decomposition
- Clarify that `high` planning depth does not create a new default artifact class
- Reclaim `spike` vocabulary in ARC glossary with explicit qualification: bounded,
  hypothesis-framed, learning-oriented, default-throwaway (contrasted with the drifted
  contemporary meaning)
- Document the graduation-cleanup ceremony in `strategy-work-organization.md` (or equivalent) —
  its role in the Planning → Active lifecycle transition, the pattern-based drop rules, safety
  scaffolding
- Cross-reference the conductor's role from `DEV-RULES.ARC` § Verification and Discovery (or a new
  § Planning Entry section if appropriate at PRD time)
- Update `strategy-work-organization.md` § Spec-Flow Invariants > Deferred contract to name
  `arc-plan` (and the conductor model defined in this WU) among the authoring-pipeline surfaces that
  realize the per-stage `planning depth` → spec-form selection the contract leaves downstream. That
  contract already abstracts the hand-off ("the per-stage realization ... and the per-mode artifact
  orchestration ... lives with the authoring-pipeline surfaces") — adopter-safe per audience-boundary
  discipline (no forward-pointers to unplanned future scope from adopter-facing strategies)

### Templates and examples

- Revisit `template-plan.md`:
    - keep freeform planning as the default ARC stance for `low` / `medium` depth
    - evolve the template into the optional `high`-depth structure
    - allow existing freeform plans to graduate into that structure over time
- Decide whether ARC needs an example of promoted in-file structure beyond the template itself
- Ensure the template is optimized for a bounded refinement unit, not unbounded accumulation

### Docs and adoption guidance

- Update docs and strategy references so ARC users understand:
    - `arc-plan` is the canonical entry verb for planning
    - planning-depth selection is a first-class concept; `low` is the common case
    - modality selection is a first-class concept alongside depth; document is the default case
    - not all plans need `high` planning depth or prototype modality
    - one promoted `plan-*` document is the default `high`-depth shape; spike findings flow
      into the same document under prototype modality when `plan-*` exists
    - `analysis-*` / `research-*` remain available when genuinely needed
    - the graduation-cleanup ceremony is a universal improvement — planning history is dropped
      from `main` at state-flip; implementation history is preserved per ARC's atomicity
      discipline

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

- **`plan-agile-wu-lifecycle.md`:** conductor reads the `**Class:**` field for `Class`-aware
  orchestration (atomic/errand skips, `light` defaults to `low`, `heavy` / `novel` support all
  depths). The `Class` model has since shipped (class-model-foundation), so the field is available.

### Upstream-by-sequence (added 2026-05-20)

- **`plan-worktree-foundation.md`:** sequencing antecedent. Conductor invokes spawn-vs-continue
  when planning warrants its own worktree but doesn't redefine spawn semantics — calls into
  whatever spawn primitive WF ships. Under the resequence, WF ships first so the spawn primitive
  is available when this WU activates.

### Recommended sequencing

Interlock Foundation (WU-A of `plan-session-operational-flow.md`) → Work Organization Reform →
Worktree Foundation → **arc-plan Conductor** ‖ CLI Substrate Adoption ‖ Coord Probe (post-WF
parallel candidates) → Agile WU Lifecycle → Concurrent Work Conventions. Final parallel-pair
selection at activation time per file-scope disjoint and cognitive-load match — Conductor reads
as design-heavy, CSA as mechanical, Coord Probe as intermediate.

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
- **`plan-agile-wu-lifecycle.md`** — the `**Class:**` field the conductor reads for `Class`-aware
  orchestration; `arc start` command and `Class`-aware activation paths the conductor coordinates
  with.
- **`plan-arc-modes.md`** — original pressure source. The conductor model honors the modes
  plan's lean toward configurable adoption (Lite vs Full) — `low` planning depth suits Lite cleanly;
  `high` planning depth is Full-mode territory.

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

### Option B — Conductor with two depths (`medium` / `high`), no `low`

Make arc-plan the canonical entry, but only support `medium` and `high` depths. Skip `low`
as a depth.

**Pros:**

- simpler depth model
- arc-plan invocation always means "facilitate"

**Cons:**

- forces facilitation overhead onto routine planning
- no clean fit for the "I just want the structural setup, then I'll drive" case
- adopters may bypass arc-plan to avoid forced facilitation, defeating the canonical-entry goal

**Current lean:** rejected. `low` planning depth is what makes the conductor universally usable.

### Option C — Conductor with three depths (current lean)

Three-depth selection (`low` / `medium` / `high`) under one conductor.

**Pros:**

- canonical entry verb
- depth scales with need
- closes the status-file creation gap cleanly
- preserves freeform planning as the dominant case (`low` planning depth)
- `high`-depth path available when work warrants it

**Cons:**

- depth model is one more concept to learn
- requires `--depth` flag or natural-language equivalent
- conductor's downstream orchestration is a real implementation surface

**Current lean:** preferred.

### Option D — Introduce a formal `high`-depth-planning companion artifact

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
2. **Depth flag syntax:** `--depth low|medium|high` is verbose; alternatives include
   `-l / -m / -h` shorthand or natural-language inference. PRD decision.
3. **Invocation prereq guarantees:** After `arc-plan` returns control under `low` planning depth, what
   exactly is the agent allowed to assume? (Status file exists, plan-doc skeleton exists, branch
   appropriate, working tree clean — or some subset?)

### Bypass model

4. **Bypass tolerance:** When the user creates a `plan-*.md` directly without invoking arc-plan,
   does the framework warn at session-init? Block at activate-work-unit? Silently accept (relying
   on the activate-work-unit ensure-status-file fallback)? Current lean: silently accept; warn
   only if an obvious gap appears at session-init.

### Depth selection

5. **Thresholding:** Should `arc-plan` only suggest escalation, or should ARC also document hard
   triggers that strongly recommend `high` planning depth?
6. **Depth demotion ergonomics:** Once `high` planning depth completes deep shaping, how does the
   conductor signal "ready to drop to `medium`"? Implicit (plan reaches formalization-ready
   state)? Explicit user signal? Both?

### `high`-depth mechanics

7. **Inline promotion shape:** What is the smallest promoted structure inside `plan-*` that helps
   without turning the plan into a pseudo-PRD?
8. **Loop workflow:** What is the right minimal workflow shape for `refine-plan-loop` now that the
   lean is a standalone workflow conditionally loaded by session-init?
9. **Per-pass pointer shape:** What is the lightest useful structure for the "next batch" pointer
   a loop pass should leave behind for the next session?
10. **Detection reliability:** Are user intent, session pointers, and artifact inspection
    sufficient to detect `high` planning depth reliably, or do real cases justify explicit metadata
    later?
11. **Readiness boundary:** What specific conditions are sufficient to move from `high` planning depth
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
15. **`Class` inference vs. `Class` prompting:** When the user invokes arc-plan without specifying
    `Class`, does the conductor infer `Class` from scope cues (and prompt to confirm) or always
    prompt? PRD decision (the `Class` model has since shipped).

### Modality

16. **Modality detection reliability.** Are user intent, framing language, and artifact inspection
    sufficient to detect prototype-appropriate work, or do real cases justify explicit metadata
    (e.g., a `**Modality:**` field on the meta file)? Current lean: detection-based, last-resort
    metadata — same posture as `high`-depth detection (§ 16).
17. **Single-spike-no-loop variant for `light` `Class`.** Does `light` work under prototype modality
    skip refine-prototype-loop entirely (single bounded spike followed directly by PRD write), or
    always loop with a cap of 1? PRD decision.
18. **Modality and `template-plan.md`.** Does prototype modality benefit from a structurally
    different `plan-*` template (findings-register prominent), or does the existing template
    absorb spike findings cleanly? Current lean: existing template absorbs; promoted structure
    under `high` planning depth (§ 12) covers the findings-register case for both modalities.
19. **Stabilization contract specifics.** When a spike opts into evolutionary disposition, what's
    the minimal content of the stabilization contract? Refactoring checklist, test coverage
    requirements, documentation expectations — what's required vs. recommended at PRD time.
20. **Hybrid signaling.** How is "hybrid" expressed at invocation when modality flips mid-flight
    is the canonical way to compose document and prototype passes? Is `--modality hybrid` a real
    flag or just a documentation concept (the conductor flips per pass either way)? Current lean:
    documentation concept only — flag accepts `document` or `prototype` at invocation; hybrid
    emerges from inter-pass flips, not from an initial declaration.

### Cleanup ceremony

21. **Cleanup ceremony scope vs. split.** Does the ceremony ship with the conductor WU, or split
    into a sibling WU? Modality work creates the strongest case for it, but it's a universal
    improvement. Lean: ship together for design coherence; sibling-WU split is an option if scope
    pressure surfaces during PRD work.
22. **Drop-pattern resolution.** Initial drop rules cover obvious cases (`chore(spike):`,
    `chore(draft-iter):`). What's the principled boundary between "noise commit" and "ceremony
    commit"? Are there ARC-wide commit-subject conventions that need to land first (e.g., a
    `chore(planning):` family of subjects)?
23. **Cleanup behavior under team mode.** Multiple developers on a planning branch accumulate
    notes-refs across identities. How does cleanup interact with cross-identity notes
    preservation? Probably defers to per-identity post-cleanup `arc user save`; PRD confirms.
24. **Cleanup default for projects not opted into wrappers.** If `arc.releaseOptedIn: false`, the
    ceremony still applies but doesn't fire through the wrapper. Cleanup invokes raw
    `git rebase --interactive` or programmatic equivalent. Behavior identical; just the routing
    differs. PRD confirms wording in the workflow.
25. **Mid-planning cleanup invocation.** When a user invokes cleanup manually before the natural
    graduation point, what state does the meta file enter? Stays `Planning` (cleanup just rebases;
    state is independent), or does the cleanup workflow refuse to run pre-graduation? Lean: stays
    Planning; cleanup is a pure history operation when invoked standalone. PRD confirms.

---

## Initial Scope Estimate

**Larger than originally estimated.** The conductor reframe plus modality plus graduation-cleanup
expand the WU touch points significantly:

- `arc-plan` skill (substantial extension — context assessment, depth + modality selection,
  downstream orchestration)
- planning strategy (conductor model, depth + modality model, spike contract, spike-cap guidance,
  graduation-cleanup model)
- `template-plan.md` (`high`-depth structure; modality-neutral)
- `refine-plan-loop.md` (new workflow file — document modality)
- `refine-prototype-loop.md` (new workflow file — prototype modality)
- `graduation-cleanup.md` (new workflow file — cleanup ceremony)
- `park-work-unit.md` (new workflow file — Planning → backlog transition; see § 20)
- `resume-work-unit.md` (new workflow file — backlog → Planning transition with worktree spawn; see § 20)
- session-init lifecycle-workflow branch (planning slot wiring for both loop workflows)
- `activate-planning-branch.md` (conductor-callable + direct-invocable)
- `1_create-prd.md` (integrates graduation-cleanup step before state-flip)
- meta-file template updates (state-flip semantics if not already covered by Interlock Foundation)
- file classification conventions
- ARC glossary (spike vocabulary reclaim with explicit qualification)
- docs and examples (modality concept, spike vocabulary, cleanup ceremony)
- install/update content shipped by the framework

The implementation surface is bounded because the core pipeline (PRD → tasks → execution) remains
intact. This work adds the canonical entry layer, codifies its use across two synthesis
modalities, and lands a universal cleanup mechanism. Not redesigning ARC's planning model from
scratch — substantially extending it.

Sequencing: depends on Interlock Foundation WU landing the status-file plumbing first.
Parallelizable with Worktree Foundation and Agile WU Lifecycle. **Possible split**: the
graduation-cleanup ceremony can land as a sibling WU if scope pressure during PRD work warrants
it; current lean is ship together since modality creates the strongest case for cleanup and the
two designs interact at the spike-commit-disposition boundary.

---

## Backlog Inbox Absorption (2026-05-19, WOR Task 6.3.b)

*Entry folded from retired `backlog/technical/BACKLOG-TECHNICAL.md` during WOR Task 6.3.b
inbox-drain to the four-surface model. Originally paired with a "Related Work Units
cross-linking convention" item that WOR subsumed via `**Cohort:**` (R13) + `**Depends On:**`
(R11) meta-file fields — dropped. PR-sized boundary estimation remains as standalone
planning-methodology refinement. Integration into plan body deferred to a focused
iteration session.*

### Codify PR-sized boundary estimation in `strategy-work-planning.md`

- **Problem:** Soft 6–7 phase target for WUs lacks codified estimation guidance. Planning
  works from intuition; size-risk surfaces at integration time rather than at planning
  time when splitting is cheap.
- **Approach:** Add a "Reviewability and Work-Unit Sizing" section to the discovery
  checklist with 5 estimation cues (file-breadth, test-surface, dependency-direction,
  explainability test, system-interaction count) and a smell-test checklist (too-big /
  too-small / right-sized signals). Wire reference into `1_create-prd.md` discovery step
  and `2_generate-tasks.md` validation. Empirical anchor: 200–400 LOC review-effectiveness
  sweet spot.
- **Research:** `research-pr-sizing-and-wu-boundary-estimation.md` (under
  `.arc/reference/supplemental/research/`) — synthesizes SmartBear/Cisco, Google (Sadowski et al.),
  Microsoft (Bacchelli & Bird), and GitHub-scale studies, plus SPIDR/INVEST methodological
  frames. Includes draft section text ready to lift.
- **Effort estimate:** S (atomic — strategy edit + workflow cross-references)

## Coordination — ADR-022

Replace the stale `status-{name}.md` references with `meta-*` (post-WOR, the per-WU file is the
meta). Per ADR-022 the meta-creation paths converge on one code-owned schema and `**State:**`
transitions are schema events; the conductor's park/resume edits go through the model, not
free-text field writes. See `adr-022-managed-operational-state-documents.md` § Coordination.
