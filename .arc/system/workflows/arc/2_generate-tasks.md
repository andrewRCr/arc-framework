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

---

## Process

**Branch context:** Task generation happens on the WU's planning branch (`plan/<name>`) —
verify you're still on it. See [init-work-unit][init-work-unit] for how the planning branch
is created.

Before starting, read the spec thoroughly. If the spec has pre-activation metadata (`**State:**` and/or
`**Related Work:**` fields), check whether dependencies are resolved. If any show unresolved blockers, stop and
confirm with the user before proceeding — generating tasks against unresolved dependencies produces a plan that
can't execute. Pre-activation metadata is removed at activation (see `activate-work-unit.md` Step 4), not here —
leave the fields in place during task generation.

### Entry step: Resolve planning depth (one scale read)

Make **one evidence read** on the scale axis: inspect the implementation surface and the codebase-grounding
breadth required for a correct task plan. That single read drives both methods:

- [`resolve-planning-depth`][arc-methods-rpd] yields the **level** — `low` / `medium` / `high`. Which breadth
  reads which level is the method's to define; this stage initiates it on the scale axis and consumes the result.
- [`classify-work-unit`][arc-methods-cwu] confirms, ratchets, or corrects the recorded **`Class`** against that
  same read.

The resolved level is transient and drives this task-generation run. It is feed-forward-immune: no upstream
artifact carries scale, so task generation reads the work surface directly and cross-checks the result against
`Class`. The `**Class:**` decision is live from this read but its write defers to Step 4's ceremony commit, never
a mid-stage meta edit.

**Depth-selected pass structure with explicit stops.** Generation runs one task-list grammar parameterized by the
resolved level:

- **`low`** — one combined pass creates the single substantive phase, task bodies, always-present verification
  phase, and grounding revision before one review stop.
- **`medium`** — structural decomposition and content fill run as one merged draft pass over a few substantive
  phases, then grounding audit runs as its own pass.
- **`high`** — the full three-pass form: structural decomposition (Pass 1), content fill (Pass 2), and grounding
  audit (Pass 3), each with a deliverable the user reviews before the next begins.

The procedure is still one grammar, not a `light` fork: the same artifacts, checks, and review discipline apply;
depth changes how much is separated for review. This prevents the one-shot-to-impl-ready pattern where heavier
work masks design decisions and ungrounded assumptions until implementation.

**The task list file lives on disk from Pass 1 onward.** Pass 1 creates `tasks-{name}.md` at the
destination path resolved per Step 4's `Destination path` rule. Passes 2 and 3 edit the file in
place. Step 4 collapses to pre-save checklist verification + ceremony commit. The file is
in-progress until Step 4's checklist passes — staging
discipline keeps it from landing in commits before then. On-disk iteration keeps partial work
durable across handoffs and lets each pass's review happen against the rendered file rather than
reproduced conversation.

### Pass 1: Structural decomposition

Identify phases and parent-task skeletons. Boundaries first; no content fill yet.

**Depth variant:** At `high`, run Pass 1 as a standalone skeleton pass. At `medium`, merge this with Pass 2
before stopping. At `low`, fold structural decomposition, content fill, and grounding revision into one combined
pass.

#### Step 1.1: Assess codebase and relevant strategies

Review the existing codebase to understand what you're working with:

- Existing patterns and architecture to leverage
- Components or modules related to the spec scope
- Files that will need modification
- Testing patterns and quality standards in use

Check [STRATEGY-INDEX.md][strategy-index] for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

#### Step 1.2: Design phases and parent-task skeletons

Identify the depth-appropriate phase count that organizes the work into logical, testable milestones:

- **`low`** — one substantive phase plus the always-present verification phase.
- **`medium`** — a few substantive phases plus the always-present verification phase.
- **`high`** — 3-7 substantive phases plus the dedicated verification phase.

For each phase, draft parent-task skeletons — titles only, with anchors citing which part of the spec each parent
satisfies.

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- When test-first applies, group test and implementation together by module or concern
- **Always end with a verification phase** — single task pointing to `verify-work-unit.md`. See
  [task-list-formatting strategy][task-list-formatting] § Verification Phase for conventions

**Save before stopping.** Create `tasks-{name}.md` at the Step 4 destination path with the
Pass 1 file shape below. It stays on disk through Passes 2-3 and Step 4.

**Pass 1 file shape:**

- Header per [`template-tasks.md`][template-tasks] planned variant — the single `**Design:**`
  chain-of-authority pointer (bare spec filename). No `Purpose` / `Branch` / `Base Branch` on
  `tasks-*`: Purpose lives on the spec, branch on `meta-*`. See
  [strategy-task-list-formatting § Task List Headers][task-list-formatting]
- Phase shapes: `## **Phase X:**` headings with `_Purpose:_` line; optional `_Design decisions:_`
  block stating key calls
- Parent-task skeletons (titles only — H3 headings with backtick-wrapped marker per
  [strategy-task-list-formatting § Parent Tasks][task-list-formatting]), each citing spec anchors
  (which part of the spec does this parent satisfy?)
- Rough subtask-count signal per parent (1 / 2-3 / many) — flags decomposition asymmetry
- **At `high`:** no task bodies, descriptions, or Goals yet. Those land in Pass 2. At `medium` / `low`, this
  skeleton shape is immediately filled in the merged pass.

> [!IMPORTANT]
> `workflow-interlock`: At `high`, stop after the Pass 1 deliverable is drafted. Surface the phase
> decomposition with reflection woven in; await direction before proceeding to Pass 2. At `medium` / `low`, this
> stop is absorbed into the merged pass selected by depth.

**Surface the deliverable with reflection woven in.** Before surfacing, trace through the
lenses below as your own checks — don't present them as a separate review section. Weave
observations into the deliverable presentation: clean lenses get a one-line confirmation
in passing; borderline calls get a brief lean + rationale + explicit ask ("keeping X as one
parent because Y — thoughts?"). Surface non-obvious judgments where reasonable people might
differ; this is what catches asymmetries the user would otherwise raise cold.

**Internal lenses for this pass:**

- **Coverage** — every part of the spec covered by some task
- **Asymmetry** — single parents overcommitting (subtask-count signal flags candidates)
- **Ordering** — phase sequence minimizes dependencies

**Iterative.** User feedback can prompt revision before declaring this pass complete.
Proceed to the next pass only when the deliverable has settled.

### Pass 2: Content fill

For each parent task: write the body. Goal first (required); peer descriptors only when genuinely
load-bearing; subtasks if decomposing; Build test-first lists where applicable.

**Depth variant:** At `medium`, this is the merged Pass 1+2 draft stop. At `low`, it is part of the one combined
pass. At `high`, run it after the reviewed Pass 1 skeleton.

#### Step 2.1: Write Goals (required on every parent)

Goal articulates the outcome the task targets — not the change being made. Title describes the
change ("Wire validation into save handler"); Goal describes the outcome ("Save handler rejects
malformed input before disk write"). Goal opens the task body — first bullet at root.

**Diagnostic test for each Goal:** would removing it make verification harder? If yes, keep it.
If no, rewrite (title-restating Goal is noise) or drop (subtask-only).

For subtasks, Goal is opt-in. Default: no Goal on subtasks. Opt in when the subtask carries
separable sub-intent that doesn't reduce to "slice of parent Goal."

See [strategy-task-list-formatting § Goal/Note Lines][task-list-formatting] for the full rule.

#### Step 2.2: Write task bodies and subtasks

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

**Test-first grouping:** When the [test-first method][arc-methods-tf] applies (data models, API
endpoints, business logic, complex algorithms), group test and implementation together in each
task — named by module or concern, not by activity. Use the `Build \`test-first\` (one behavior at a time):`
marker line to introduce the behavior list; the executing agent treats this as the signal to apply the
red-green-refactor loop. See [DEV-RULES.ARC][dev-rules-arc] § Test-first assessment for the
decision tree, and [strategy-task-list-formatting][task-list-formatting] § Test-First Task
Structure for the full pattern.

**If your project has a testing methodology strategy** (e.g., `strategy-testing-methodology.md`),
consult it for project-specific test patterns and coverage expectations.

**Edit the file in place; save before stopping.** Open `tasks-{name}.md` from Pass 1 and add task
bodies. The Pass 1 file shape (header, phase preambles, parent-task skeletons) stays as-is unless
restructure is needed.

**Pass 2 additions to the file:**

- Full task bodies with `_Goal:_` first on every parent
- Peer descriptors (`_Context:_`, `_Rationale:_`, `_Approach:_`, `_Shape:_`, `_Note:_`) where
  framing is genuinely load-bearing — siblings of Goal at root, after Goal
- Subtasks with description bullets where work warrants decomposition
- Test-first lists where applicable

> [!IMPORTANT]
> `workflow-interlock`: At `medium` / `high`, stop after the Pass 2 draft is written. Surface with reflection
> woven in; await direction before proceeding to Pass 3. At `low`, this stop is absorbed into the one combined
> pass.

Same surfacing discipline as Pass 1 — weave observations into the deliverable, don't present
a separate review section. Surface borderline calls explicitly with the agent's lean and
rationale.

**Internal lenses for this pass:**

- **Goal articulation** — does each Goal name the outcome the task targets, not the change
  being made?
- **Meaningful intent** — does each task carry intent the title alone doesn't, or is it just
  step-shape?
- **Peer descriptor framing** — where present, do peer descriptors carry framing the Goal
  can't?

**Iterative.** User feedback can prompt revision before declaring this pass complete.

### Pass 3: Grounding audit + coherent revision

Per-phase pre-impl-readiness gate, run **one phase at a time, top-down**: audit the phase, surface its
findings and any design decisions, confirm before editing, then revise the phase coherently. Settling each
phase before the next keeps it commit- and handoff-able mid-pass, and surfaces cross-phase dependencies at the
boundaries. The **verification phase is audit-exempt** — its single `verify-work-unit.md` pointer has nothing
to ground.

Run Steps 3.1–3.3 for each non-verification phase in order; run Step 3.4 once, after the last phase.

**Depth variant:** The per-phase audit → confirm → revise gate is retained at every level — one gate per
substantive phase. At `low`, the one substantive phase makes this a single grounding/revision gate folded into
the combined pass: the gate collapses by phase count, not by relaxing the interlock. At `medium` / `high`, run it
after the content draft; the number of gates follows the substantive phase count.

#### Step 3.1: Audit the phase

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

#### Step 3.2: Surface findings + decisions, then confirm

> [!IMPORTANT]
> `workflow-interlock`: Surface the phase's findings — per-finding (category → severity → finding →
> recommendation), with reflection woven in — **plus any masked design decisions, each stated with a lean**.
> Stop and await direction **before editing**. Resolving the decisions first means corrections land coherently
> in one pass instead of as "(pending)" caveats re-edited later.

Don't apply edits in this step. Masked design decisions are confirmed here, not deferred into the task body.

#### Step 3.3: Revise the phase coherently

Apply the confirmed corrections so the phase reads **as if the design were always this way** — no audit /
correction / "pending" provenance in the task bodies (per [DEV-RULES.ARC][dev-rules-arc] § Write for the
reader: document what *is*, not what *was*). Fold "fix before starting" findings into Goals, bodies, and
subtasks directly; a corrected mechanism *becomes* the design statement, not an annotation on the old one.

**Spec-propagation.** When a finding corrects a *spec-level* assumption — a named mechanism, shape, or interface
was wrong — route the correction back to the spec (`spec-{name}.md`), not only the task list, so the whole WU
suite stays coherent (per [DEV-RULES.ARC][dev-rules-arc] § Design before implementation).

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

#### Step 3.4: Final suite-coherence pass (once, after all phases)

A coherence **read** across the full suite — `tasks-{name}.md`, `spec-{name}.md`, and `notes-{name}.md` — after
every phase has been revised. Not a re-audit: it checks cross-phase consistency (terminology, cross-references,
ordering language), suite-level alignment (the spec's Goals / Success Criteria / Open Questions match the
amended spec content; resolved open-questions reflected), dangling references, and that the task list reads as one
coherent forward artifact. Always read; **edit only on drift** — often a near-no-op when per-phase revision was
clean, heavier when phases interlock tightly. If this pass surfaces a *new design issue* (not mere inconsistency),
loop back to that phase's Step 3.2 — the coherence pass is not a second decision venue.

**Internal lenses:**

- **Fix-before-starting resolved** — every "fix before starting" finding folded into the design, not annotated
- **Coherent forward artifact** — no audit / correction / "pending" provenance survives in any task body
- **Suite coherence** — spec-level corrections propagated; tasks, spec, and notes read consistently
- **Impl-ready vs another cycle** — does the suite genuinely settle, or does another Pass 2 / Pass 3 cycle help?

**Iterative.** User feedback can prompt revision before declaring impl-ready.

### Step 4: Pre-save verification + ceremony commit

By Step 4, `tasks-{name}.md` is already on disk (created at Pass 1, iterated through Passes 2-3).
Implementation notes, technical context, and design rationale belong in the dedicated notes file
(`notes-{name}.md`), not in the task list. Step 4 verifies the file
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
- [ ] All "carry as context" findings from Pass 3 are durably captured (inline `_Note:_` or
      cross-reference to `notes-{name}.md` companion file)
- [ ] Task bodies read as a coherent forward artifact — no audit / correction / "pending" / amendment
      provenance (Pass 3 corrections folded into the design, per [DEV-RULES.ARC][dev-rules-arc] § Write for
      the reader)
- [ ] Task instructions targeting shipped or published files are written in the shipped-content
      register — no movable WU artifact references (`draft-*` / `spec-*` / `tasks-*` / `meta-*` /
      companions) that would survive verbatim execution into the target. See
      [strategy-task-list-formatting § Instruction Audience][task-list-formatting]
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

**Destination path** (referenced by Pass 1's file creation; depends on
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
