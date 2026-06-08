---
purpose: Transform a reviewed spec into an executable task list scaled by planning depth.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
    - test-first
---

# Workflow: Generate Task List

**When to use**: After a spec has been created and reviewed, when work is ready for implementation
planning.

**Branch context:** Task generation happens on the WU's planning branch (`plan/<name>`) —
verify you're still on it. See [init-work-unit][init-work-unit] for how the planning branch
is created.

Before starting, read the spec thoroughly. If the spec has pre-activation metadata (`**State:**` and/or
`**Related Work:**` fields), check whether dependencies are resolved. If any show unresolved blockers, stop and
confirm with the user before proceeding — generating tasks against unresolved dependencies produces a plan that
can't execute. Pre-activation metadata is removed at activation (see `activate-work-unit.md` Step 4), not here —
leave the fields in place during task generation.

---

## Resolve depth & Class

Make **one scale-axis read** — the implementation surface and the codebase-grounding breadth a correct task plan
needs — then run [`resolve-planning-depth`][arc-methods-rpd] and [`classify-work-unit`][arc-methods-cwu] off it:
one read drives both, yielding this run's **level** (`low` / `medium` / `high`) and confirming, ratcheting, or
correcting **`Class`** against that same read. The methods own how the read maps to a level, and the mid-stage
re-entry valve.

The level is transient and feed-forward-immune — no upstream artifact carries scale, so this stage reads the work
surface directly and cross-checks against `Class`. The `**Class:**` decision is live from this read, but its write
defers to the Finalize ceremony commit, never a mid-stage meta edit.

**No Novel overlay.** `Novel` is a derivation-axis kind; task generation is scale-driven and adds no Novel overlay
(it reaches novelty only indirectly, through scale). Stated explicitly so no phantom path is introduced here.

## Generate in the resolved level

The resolved level selects one of the three paths below. **The path is the execution driver:** it names which
procedures run and where you stop. The procedure sections that follow — **Structural decomposition**, **Content
fill**, **Grounding audit & coherent revision** — are shared reference detail your path invokes; do **not**
execute them as a standalone linear sequence. Follow your path top to bottom, expanding each procedure as the
path calls for it.

Every path runs the **same** procedures, artifacts, checks, and review discipline — a lower depth separates
_less for review_, it does not do _less work_. Depth changes only how the work is sliced into passes and where
the review stops fall. This prevents the one-shot-to-impl-ready pattern where heavier work masks design
decisions and ungrounded assumptions until implementation.

**Surfacing discipline (every stop).** Surface the deliverable with reflection woven in: trace the relevant
procedure's internal lenses as your own checks and weave observations into the deliverable presentation, rather
than presenting a separate review section. Clean lenses get a one-line confirmation in passing; borderline calls
get a brief lean + rationale + explicit ask ("keeping X as one parent because Y — thoughts?"). Surface
non-obvious judgments where reasonable people might differ. A stop may iterate on user feedback before the path
proceeds.

**The task list file lives on disk from the first pass onward.** The **Structural decomposition** procedure
creates `tasks-{name}.md` at the destination path resolved per Finalize's `Destination path` rule; the later
procedures edit it in place. Finalize collapses to pre-save checklist verification + ceremony commit. The file
is in-progress until the Finalize checklist passes — staging discipline keeps it from landing in commits before
then. On-disk iteration keeps partial work durable across handoffs and lets each pass's review happen against
the rendered file rather than reproduced conversation.

### `low` — one combined pass

One pass, straight through: run **Structural decomposition**, **Content fill**, and **Grounding audit & coherent
revision** over the single substantive phase (plus the always-present verification phase). There is **no
inter-pass stop** — the procedures flow into each other. The one review stop is the grounding audit's per-phase
confirm gate, which fires once for the single substantive phase; resolve it, finish the revision, then
**Finalize the task list**. Audit depth is `grounding-only`.

### `medium` — merged draft pass, then grounding pass

Two passes:

- **Pass 1 — merged draft.** Run **Structural decomposition**, then **Content fill**, over a few substantive
  phases (plus the verification phase) as one draft.

  > [!IMPORTANT]
  > `workflow-interlock`: Stop after the merged draft is written. Surface it with reflection woven in (lenses
  > from both procedures); await direction before the grounding pass.

- **Pass 2 — Grounding audit.** Run **Grounding audit & coherent revision**; its per-phase confirm gate fires
  once per substantive phase. Audit depth is `full`.

Then **Finalize the task list**.

### `high` — full three passes

Three passes, each producing a deliverable the user reviews before the next begins:

- **Pass 1 — Structural decomposition.** Run **Structural decomposition** over 3-7 substantive phases (plus the
  dedicated verification phase) — phases and parent-task skeletons only, no content fill.

  > [!IMPORTANT]
  > `workflow-interlock`: Stop after the skeleton is drafted. Surface the phase decomposition with reflection
  > woven in (lenses per the procedure); await direction before Pass 2.

- **Pass 2 — Content fill.** Run **Content fill** against the reviewed skeleton.

  > [!IMPORTANT]
  > `workflow-interlock`: Stop after the Pass 2 draft is written. Surface with reflection woven in; await
  > direction before Pass 3.

- **Pass 3 — Grounding audit.** Run **Grounding audit & coherent revision**; its per-phase confirm gate fires
  once per substantive phase. Audit depth is `full`.

Then **Finalize the task list**.

---

## Structural decomposition

Identify phases and parent-task skeletons — boundaries first, no content fill yet. This procedure creates the
on-disk task list file.

### Assess codebase and relevant strategies

Review the existing codebase to understand what you're working with:

- Existing patterns and architecture to leverage
- Components or modules related to the spec scope
- Files that will need modification
- Testing patterns and quality standards in use

Check [STRATEGY-INDEX.md][strategy-index] for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

### Design phases and parent-task skeletons

Identify the depth-appropriate phase count that organizes the work into logical, testable milestones:

- **`low`** — one substantive phase plus the always-present verification phase.
- **`medium`** — a few substantive phases plus the always-present verification phase.
- **`high`** — 3-7 substantive phases plus the dedicated verification phase.

For each phase, draft parent-task skeletons — titles only, with anchors citing which of the spec's **enumerable
units** each parent satisfies — the form's traceable elements: numbered Requirements (PRD), structured Proposed
Design elements (RFC), settled Decisions (`outline`), or the single falsifiable signal (`brief`).

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- When test-first applies, group test and implementation together by module or concern
- **Always end with a verification phase** — single task pointing to `verify-work-unit.md`. See
  [task-list-formatting strategy][task-list-formatting] § Verification Phase for conventions

**Save the file.** Create `tasks-{name}.md` at the Finalize destination path with the structural skeleton shape
below. It stays on disk through the remaining procedures and Finalize.

**Structural skeleton — the file shape this procedure produces:**

- Header per [`template-tasks.md`][template-tasks] planned variant — the single `**Design:**`
  chain-of-authority pointer (bare spec filename). No `Purpose` / `Branch` / `Base Branch` on
  `tasks-*`: Purpose lives on the spec, branch on `meta-*`. See
  [strategy-task-list-formatting § Task List Headers][task-list-formatting]
- Phase shapes: `## **Phase X:**` headings with `_Purpose:_` line; optional `_Design decisions:_`
  block stating key calls
- Parent-task skeletons (titles only — H3 headings with backtick-wrapped marker per
  [strategy-task-list-formatting § Parent Tasks][task-list-formatting]), each citing the spec's enumerable
  units (which units does this parent satisfy?)
- Rough subtask-count signal per parent (1 / 2-3 / many) — flags decomposition asymmetry
- When **Content fill** runs as a separate pass (the `high` path), the skeleton carries no task bodies,
  descriptions, or Goals yet — those land in that procedure. When the two run as one merged pass (`medium` /
  `low`), this skeleton shape is filled immediately.

**Internal lenses:**

- **Coverage** — every enumerable unit covered by some task (the task list is validated against the form's
  enumerable substrate; implementation is validated separately against Success Criteria)
- **Asymmetry** — single parents overcommitting (subtask-count signal flags candidates)
- **Ordering** — phase sequence minimizes dependencies

→ **Pass boundary:** if your path places a stop after this procedure, stop and surface now (per the surfacing
discipline above) before continuing.

## Content fill

For each parent task, write the body: Goal first (required); peer descriptors only when genuinely load-bearing;
subtasks if decomposing; Build test-first lists where applicable. Edit `tasks-{name}.md` in place — the
structural skeleton (header, phase preambles, parent-task skeletons) stays as-is unless restructure is needed.

### Write Goals (required on every parent)

Goal articulates the outcome the task targets — not the change being made. Title describes the
change ("Wire validation into save handler"); Goal describes the outcome ("Save handler rejects
malformed input before disk write"). Goal opens the task body — first bullet at root.

**Diagnostic test for each Goal:** would removing it make verification harder? If yes, keep it.
If no, rewrite (title-restating Goal is noise) or drop (subtask-only).

For subtasks, Goal is opt-in. Default: no Goal on subtasks. Opt in when the subtask carries
separable sub-intent that doesn't reduce to "slice of parent Goal."

See [strategy-task-list-formatting § Goal/Note Lines][task-list-formatting] for the full rule.

### Write task bodies and subtasks

For each parent task, fill in the body:

- Small enough to complete in a single work session (typically < 3 files modified)
- Include quality checkpoints at appropriate stages
  (see [Quality Gates Strategy][quality-gates] for tier guidance)
- Reference specific files, patterns, or approaches where helpful
- No time estimates — focus on clear scope and completion criteria
- **Note relevant strategies** when a task touches a domain with codified guidance. Add a
  `**Strategies:**` line under the task description listing applicable strategy filenames
  (e.g., `**Strategies:** strategy-testing-methodology.md`). This helps the executing agent
  know what to consult without re-scanning STRATEGY-INDEX. Use when the connection isn't
  obvious from the task title.

<!-- arc:if team.mode == true -->
**Task ownership:** In team mode, add `(@name)` markers to task checkboxes to assign ownership.
Place markers at the end of the checkbox line: `- [ ] **1.1 Task description** (@alice)`. Phase
headers can carry area-level ownership: `### Phase 3: Auth Layer (@alice)`. Markers are optional
during generation — tasks can be assigned later. See
[strategy-task-list-formatting][task-list-formatting] § Task Ownership Markers and
[Team Coordination Strategy][team-coordination] § Task Ownership for conventions.
<!-- arc:endif -->

**Test-first grouping:** When the [test-first method][arc-methods-tf] applies (data models, API
endpoints, business logic, complex algorithms), group test and implementation together in each
task — named by module or concern, not by activity. Use the `Build \`test-first\` (one behavior at a time):`
marker line to introduce the behavior list; the executing agent treats this as the signal to apply the
red-green-refactor loop. See [DEV-RULES.ARC][dev-rules-arc] § Test-first assessment for the
decision tree, and [strategy-task-list-formatting][task-list-formatting] § Test-First Task
Structure for the full pattern.

**If your project has a testing methodology strategy** (e.g., `strategy-testing-methodology.md`),
consult it for project-specific test patterns and coverage expectations.

**Content-fill additions to the file:**

- Full task bodies with `_Goal:_` first on every parent
- Peer descriptors (`_Context:_`, `_Rationale:_`, `_Approach:_`, `_Shape:_`, `_Note:_`) where
  framing is genuinely load-bearing — siblings of Goal at root, after Goal
- Subtasks with description bullets where work warrants decomposition
- Test-first lists where applicable

**Internal lenses:**

- **Goal articulation** — does each Goal name the outcome the task targets, not the change
  being made?
- **Meaningful intent** — does each task carry intent the title alone doesn't, or is it just
  step-shape?
- **Peer descriptor framing** — where present, do peer descriptors carry framing the Goal
  can't?

→ **Pass boundary:** if your path places a stop after this procedure, stop and surface now (per the surfacing
discipline above) before continuing.

## Grounding audit & coherent revision

A per-phase pre-impl-readiness gate, run **one phase at a time, top-down**: audit the phase, surface its
findings and any design decisions, confirm before editing, then revise the phase coherently. Settling each
phase before the next keeps it commit- and handoff-able mid-pass, and surfaces cross-phase dependencies at the
boundaries. The **verification phase is audit-exempt** — its single `verify-work-unit.md` pointer has nothing
to ground.

Run **Audit the phase** → **Surface findings + decisions, then confirm** → **Revise the phase coherently** for
each non-verification phase in order; run **Final suite-coherence pass** once, after the last phase. The
per-phase confirm gate below is intrinsic — it fires once per substantive phase at **every** depth, the number
of gates following the substantive phase count rather than the resolved level.

### Audit the phase

Invoke the [arc-task-audit][arc-task-audit] skill scoped to the phase, at the depth the resolved level selects:
`grounding-only` at `low`, `full` at `medium` / `high`. The skill defines each depth — `grounding-only` is the
named-files-and-symbols-exist floor, never dropped.

The level only sets a generation-time default, not a ceiling — the full audit stays available on demand
mid-implementation, regardless of the resolved level or `Class`.

Generation-time framing differs from the skill's typical pre-impl use:

- **Greenfield:** the task list was just authored. Codebase drift is unlikely; file-path / symbol assumptions
  are common. Focus on grounding (verifying named files and symbols exist).
- **Pre-impl-ready gate:** the phase isn't ready until "fix before starting" findings are resolved.
  "Carry as context" findings can ride.

### Surface findings + decisions, then confirm

> [!IMPORTANT]
> `workflow-interlock`: Surface the phase's findings — per-finding (category → severity → finding →
> recommendation), with reflection woven in — **plus any masked design decisions, each stated with a lean**.
> Stop and await direction **before editing**. Resolving the decisions first means corrections land coherently
> in one pass instead of as "(pending)" caveats re-edited later.

Don't apply edits in this step. Masked design decisions are confirmed here, not deferred into the task body.

**Re-entry valve (the loop's floor-raising back-edge):** when a finding is a floor-raising signal rather than a
local fix, fire it per
[`resolve-planning-depth`][arc-methods-rpd] § Mid-stage re-entry — a **scale** surprise (the grounding surface is
wider than the level assumed) re-resolves `generate-tasks` higher; a **derivation** surprise (a masked design
decision needing fresh design) routes to the spec. A merely-wrong mechanism is the in-place case below
(Revise the phase coherently → spec-propagation), not a re-entry.

### Revise the phase coherently

Apply the confirmed corrections so the phase reads **as if the design were always this way** — no audit /
correction / "pending" provenance in the task bodies (per [DEV-RULES.ARC][dev-rules-arc] § Write for the
reader: document what _is_, not what _was_). Fold "fix before starting" findings into Goals, bodies, and
subtasks directly; a corrected mechanism _becomes_ the design statement, not an annotation on the old one.

**Spec-propagation.** When a finding corrects a _spec-level_ assumption — a named mechanism, shape, or interface
was wrong — route the correction back to the spec (`spec-{name}.md`), not only the task list, so the whole WU
suite stays coherent (per [DEV-RULES.ARC][dev-rules-arc] § Design before implementation). This is the **in-place**
sibling of the re-entry valve (Surface findings + decisions, then confirm): an existing decision was wrong and is
corrected in place — distinct from re-entering the spec to _author_ design that does not yet exist (see
[`resolve-planning-depth`][arc-methods-rpd] § Mid-stage re-entry).

**Generation-time durable-capture discipline.** "Carry as context" findings need a durable
home before save — at generation time, no implementing-session context exists to absorb them
later. Routing convention:

- **Inline `_Note:_` peer descriptor on the affected parent / leaf** — brief one-liners
  (≤ 2 lines) where context fits next to the task without bulking the body
- **`notes-{name}.md` companion file** — substantive findings (multi-bullet, design rationale,
  alternatives, edge-case enumerations, mapping tables) where inline would crowd the task list.
  Each affected task body cross-refs via `_Notes:_ See \`notes-{name}.md\` § <section>`

Differs from pre-impl audit invocations during task-list execution, where carry-as-context
lives in the implementing agent's session memory. Generation-time durability is mandatory —
the implementing agent will be a different session, possibly different agent, weeks or months
from now.

### Final suite-coherence pass (once, after all phases)

A coherence **read** across the full suite — `tasks-{name}.md`, `spec-{name}.md`, and `notes-{name}.md` — after
every phase has been revised. Not a re-audit: it checks cross-phase consistency (terminology, cross-references,
ordering language), suite-level alignment (the spec's Goals / Success Criteria / Open Questions match the
amended enumerable units; resolved open-questions reflected), dangling references, and that the task list reads as one
coherent forward artifact. Always read; **edit only on drift** — often a near-no-op when per-phase revision was
clean, heavier when phases interlock tightly. If this pass surfaces a _new design issue_ (not mere inconsistency),
loop back to that phase's confirm gate (Surface findings + decisions, then confirm) — the coherence pass is not a
second decision venue.

**Internal lenses:**

- **Fix-before-starting resolved** — every "fix before starting" finding folded into the design, not annotated
- **Coherent forward artifact** — no audit / correction / "pending" provenance survives in any task body
- **Suite coherence** — spec-level corrections propagated; tasks, spec, and notes read consistently
- **Impl-ready vs another cycle** — does the suite genuinely settle, or does another content / audit cycle help?

→ This is the terminal procedure — proceed to **Finalize the task list**.

## Finalize the task list

By now, `tasks-{name}.md` is already on disk (created during **Structural decomposition**, iterated through the
content-fill and grounding procedures). Implementation notes, technical context, and design rationale belong in
the dedicated notes file (`notes-{name}.md`), not in the task list. Finalize verifies the file
against the pre-save checklist and bundles the commit.

**Verify the file against this checklist:**

- [ ] Header is the single `**Design:**` chain-of-authority pointer (bare spec filename) — no
      `Purpose` / `Branch` / `Base Branch` on `tasks-*` (Purpose lives on the spec, branch on
      `meta-*`). Incidental retains `## Context` + `## Scope` (it is its own spec)
- [ ] Phase headers use `## **Phase X:** Description` format (H2; no `## Tasks` wrapper)
- [ ] Phase preambles open with `_Purpose:_` line (italic); optional `_Design decisions:_` block
      links to `notes-{name}.md` for full rationale; soft cap ~12 lines per preamble
- [ ] Parent tasks are H3 headings with backtick-wrapped marker — see
      [strategy-task-list-formatting § Parent Tasks][task-list-formatting] for the canonical form
- [ ] Subtasks use letter numbering with backtick-wrapped markers (matching parent task heading
      style — keeps preview rendering consistent across parent and subtask). Bold when detail
      bullets follow.
- [ ] Third level uses letters (`X.Y.a`, `X.Y.b`), not numbers (`X.Y.1`, `X.Y.2`) — letters signal depth
- [ ] Every parent task has `_Goal:_` first at root, articulating outcome (not restating title);
      diagnostic test passes (would removing the Goal make verification harder?)
- [ ] Subtask Goals (when present) carry separable sub-intent — diagnostic test passes
- [ ] Peer descriptors (`_Context:_`, `_Rationale:_`, `_Approach:_`, `_Shape:_`, `_Note:_`) at
      root as siblings of Goal, after Goal — only when framing is genuinely load-bearing
- [ ] Subtasks and description bullets indent 4 spaces under the root-level descriptor block
- [ ] Blank lines between every subtask (always — see § Blank-Line Discipline in the strategy doc)
- [ ] Unnumbered bullets for implementation details (no checkboxes, no numbers)
- [ ] Italic for non-actionable descriptors (`_Purpose:_`, `_Goal:_`, `_Outcome:_`, `_Note:_`,
      `_Rationale:_`, `_Approach:_`, `_Context:_`, `_Shape:_`); bold for actionable titles
      (`**X.Y Title**`)
- [ ] Test-first tasks group test + implementation together (by concern, not activity)
- [ ] Test-first tasks use `Build \`test-first\` (one behavior at a time):` marker line before behavior list
- [ ] 4-space indentation per hierarchy level
- [ ] Backticks for all technical terms: `field_name`, `ClassName`, `/api/endpoint/`
- [ ] No time estimates anywhere (no duration emojis, minute counts)
- [ ] Verification phase as final phase (single task pointing to `verify-work-unit.md`)
- [ ] All "carry as context" findings from the grounding audit are durably captured (inline `_Note:_` or
      cross-reference to `notes-{name}.md` companion file)
- [ ] Task bodies read as a coherent forward artifact — no audit / correction / "pending" / amendment
      provenance (grounding-audit corrections folded into the design, per [DEV-RULES.ARC][dev-rules-arc] § Write
      for the reader)
- [ ] Task instructions targeting shipped or published files are written in the shipped-content
      register — no movable WU artifact references (`draft-*` / `spec-*` / `tasks-*` / `meta-*` /
      companions) that would survive verbatim execution into the target. See
      [strategy-task-list-formatting § Instruction Audience][task-list-formatting]
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

**Destination path** (referenced by **Structural decomposition**'s file creation; depends on
[`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git** (backlog pipeline): `.arc/backlog/{provisional,planned}/{{WORK_NAME}}/tasks-{{WORK_NAME}}.md`
- **none / external** (no backlog): `.arc/active/tasks-{{WORK_NAME}}.md`
  (create the directory first if it doesn't exist: `mkdir -p .arc/active/`)

Name matches the spec (e.g., `spec-api-modernization.md` → `tasks-api-modernization.md`).

> [!IMPORTANT]
> `workflow-interlock`: Stop after the pre-save checklist passes. Surface the task list location
> for review; await direction before updating the status file and committing (`workflowCommit`).

See [Task Processing Loop](3_process-task-loop.md) for how task lists are executed.

---

## Task List Format

See [template-tasks.md][template-tasks] for the header and body skeleton (header with the single
`**Design:**` pointer, Tasks with phase preambles, Verification Phase, Success Criteria). See
[strategy-task-list-formatting.md][task-list-formatting] for formatting rules and conventions.

`**Design:**` is a bare spec filename — the path derives from the task list's directory, so a
backlog → active move needs no field edit.

---

## Next Step

**→ [activate-work-unit.md][activate-work-unit]** — Flip `**State:**` to `Active` and rename
`plan/<name>` to `<type>/<name>`. Implementation begins on the renamed branch.

Activation can be deferred if planning ahead. Activate when implementation is about to begin.

---

[strategy-index]: ../../../reference/strategies/STRATEGY-INDEX.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[arc-methods-rpd]: ../../methods/resolve-planning-depth.md
[arc-methods-cwu]: ../../methods/classify-work-unit.md
[arc-methods-tf]: ../../methods/test-first.md
[task-list-formatting]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-task-audit]: ../../.internal/skills/arc-task-audit/SKILL.md
[template-tasks]: ../../../reference/templates/arc/work-unit/template-tasks.md
[init-work-unit]: work-unit-lifecycle/planning/init-work-unit.md
[arc-config]: ../../arc-config.yml
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
<!-- arc:if team.mode == true -->
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
<!-- arc:endif -->
