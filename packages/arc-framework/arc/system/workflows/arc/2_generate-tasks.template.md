---
purpose: Transform a reviewed PRD into an executable task list with phases, sub-tasks, and test-first ordering.
audience: collaborative (human and agent)
arc:
  methods:
    - test-first
---

# Workflow: Generate Task List

**When to use**: After a PRD has been created and reviewed, when work is ready for implementation
planning.

---

## Process

**Branch context:** Task generation happens on the WU's planning branch (`plan/<name>`) —
verify you're still on it. See [init-work-unit][init-work-unit] for how the planning branch
is created.

Before starting, read the PRD thoroughly. If the PRD has pre-activation metadata (`**State:**` and/or
`**Related Work:**` fields), check whether dependencies are resolved. If any show unresolved blockers, stop and
confirm with the user before proceeding — generating tasks against unresolved dependencies produces a plan that
can't execute. Pre-activation metadata is removed at activation (see `activate-work-unit.md` Step 4), not here —
leave the fields in place during task generation.

**Three passes with explicit stops.** Generation runs structural decomposition (Pass 1), content
fill (Pass 2), and grounding audit (Pass 3) — each pass has a deliverable the user reviews before
the next begins. This prevents the one-shot-to-impl-ready pattern that masks design decisions and
ungrounded assumptions until impl time.

**The task list file lives on disk from Pass 1 onward.** Pass 1 creates `tasks-{name}.md` (and the
empty `atomic-{name}.md` companion) at the destination path resolved per Step 4's `Destination
path` rule. Passes 2 and 3 edit the file in place. Step 4 collapses to pre-save checklist
verification + ceremony commit. The file is in-progress until Step 4's checklist passes — staging
discipline keeps it from landing in commits before then. On-disk iteration keeps partial work
durable across handoffs and lets each pass's review happen against the rendered file rather than
reproduced conversation.

### Pass 1: Structural decomposition

Identify phases and parent-task skeletons. Boundaries first; no content fill yet.

#### Step 1.1: Assess codebase and relevant strategies

Review the existing codebase to understand what you're working with:

- Existing patterns and architecture to leverage
- Components or modules related to the PRD requirements
- Files that will need modification
- Testing patterns and quality standards in use

Check [STRATEGY-INDEX.md][strategy-index] for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

#### Step 1.2: Design phases and parent-task skeletons

Identify 3-7 major phases that organize the work into logical, testable milestones. For each phase,
draft parent-task skeletons — titles only, with R-ID anchors citing which PRD requirements each
parent satisfies.

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- When test-first applies, group test and implementation together by module or concern
- **Always end with a verification phase** — single task pointing to `verify-work-unit.md`. See
  [task-list-formatting strategy][task-list-formatting] § Verification Phase for conventions

**Save before stopping.** Create `tasks-{name}.md` at the Step 4 destination path with the
Pass 1 file shape below; create the empty companion `atomic-{name}.md` in the same directory
(skeleton per [`template-tasks.md`][template-tasks] § Atomic Companion File). Both stay on disk
through Passes 2-3 and Step 4.

**Pass 1 file shape:**

- Header per [`template-tasks.md`][template-tasks] Feature/Technical variant — PRD ref,
  Branch(es), Base Branch, Purpose; fill from PRD
- Phase shapes: `## **Phase X:**` headings with `_Purpose:_` line; optional `_Design decisions:_`
  block stating key calls
- Parent-task skeletons (titles only — H3 headings with backtick-wrapped marker per
  [strategy-task-list-formatting § Parent Tasks][task-list-formatting]), each citing R-ID
  anchors (which PRD requirements does this parent satisfy?)
- Rough subtask-count signal per parent (1 / 2-3 / many) — flags decomposition asymmetry
- **No task bodies, no descriptions, no Goals yet.** Those land in Pass 2.

> [!IMPORTANT]
> `workflow-interlock`: Stop after the Pass 1 deliverable is drafted. Surface the phase
> decomposition with reflection woven in; await direction before proceeding to Pass 2.

**Surface the deliverable with reflection woven in.** Before surfacing, trace through the
lenses below as your own checks — don't present them as a separate review section. Weave
observations into the deliverable presentation: clean lenses get a one-line confirmation
in passing; borderline calls get a brief lean + rationale + explicit ask ("keeping X as one
parent because Y — thoughts?"). Surface non-obvious judgments where reasonable people might
differ; this is what catches asymmetries the user would otherwise raise cold.

**Internal lenses for this pass:**

- **Coverage** — every PRD requirement covered by some task
- **Asymmetry** — single parents overcommitting (subtask-count signal flags candidates)
- **Ordering** — phase sequence minimizes dependencies

**Iterative.** User feedback can prompt revision before declaring this pass complete.
Proceed to the next pass only when the deliverable has settled.

### Pass 2: Content fill

For each parent task: write the body. Goal first (required); peer descriptors only when genuinely
load-bearing; subtasks if decomposing; Build test-first lists where applicable.

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
> `workflow-interlock`: Stop after the Pass 2 draft is written. Surface with reflection woven
> in; await direction before proceeding to Pass 3.

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

### Pass 3: Grounding audit

Phase-by-phase pre-impl-readiness gate. Catches assumptions, codebase drift, and masked design
decisions before they become impl-time surprises.

#### Step 3.1: Invoke arc-task-audit per phase

For each phase in the Pass 2 draft, invoke the [arc-task-audit][arc-task-audit] skill scoped to
that phase. The skill is the meat of Pass 3 — it surfaces the eight categories of issues
(unexposed assumptions, masked design decisions, codebase drift, ordering risks, scope ambiguity,
interface contracts, test strategy gaps, missing acceptance criteria).

Generation-time framing differs from the skill's typical pre-impl use:

- **Greenfield:** the task list was just authored. Codebase drift is unlikely; file-path /
  symbol assumptions are common. Focus on grounding (verifying named files and symbols exist).
- **Phase-by-phase:** audit one phase at a time, top-down. Phase-internal ordering risks
  surface naturally; cross-phase dependencies appear at boundaries.
- **Pre-impl-ready gate:** the phase isn't ready until "fix before starting" findings are
  addressed. "Carry as context" findings can ride.

#### Step 3.2: Apply corrections

For each "fix before starting" finding, edit `tasks-{name}.md` in place — update file paths,
clarify scope, add subtasks for masked design decisions, etc. Save after each phase's
corrections land.

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

> [!IMPORTANT]
> `workflow-interlock`: Stop after the audit findings and corrections are applied per phase.
> Surface findings with reflection woven in; await direction before declaring the task list
> impl-ready.

Same surfacing discipline — weave observations into the findings presentation. Per-finding
shape (category → severity → finding → recommendation) keeps fix-before-starting and
carry-as-context handled distinctly.

**Internal lenses for this pass:**

- **Fix-before-starting addressed** — every "fix before starting" finding applied as a
  task-body edit
- **Carry-as-context durably captured** — every carry-as-context finding has a durable home
  (inline `_Note:_` or `notes-{name}.md` cross-reference)
- **Impl-ready vs another cycle** — does the task list genuinely settle here, or does
  another Pass 2 / Pass 3 cycle help?

**Iterative.** User feedback can prompt revision before declaring impl-ready.

### Step 4: Pre-save verification + ceremony commit

By Step 4, `tasks-{name}.md` and `atomic-{name}.md` are already on disk (created at Pass 1,
iterated through Passes 2-3). Implementation notes, technical context, and design rationale belong
in the dedicated notes file (`notes-{name}.md`), not in the task list. Step 4 verifies the file
against the pre-save checklist and bundles the commit.

**Verify the file against this checklist:**

- [ ] Header includes `**Purpose:**` field — one-line summary; full Scope lives in the PRD
      (Feature/Technical only; Incidental retains `## Context` + `## Scope`)
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
- [ ] Task instructions targeting shipped or published files are written in the shipped-content
      register — no movable WU artifact references (`plan-*` / `prd-*` / `tasks-*` / `status-*` /
      companions) that would survive verbatim execution into the target. See
      [strategy-task-list-formatting § Instruction Audience][task-list-formatting]
- [ ] Atomic companion file created alongside task list (`atomic-{name}.md`, same directory)
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

**Destination path** (referenced by Pass 1's file creation; depends on
[`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git** (backlog pipeline): `.arc/backlog/{provisional,planned}/{{WORK_NAME}}/tasks-{{WORK_NAME}}.md`
- **none / external** (no backlog): `.arc/active/tasks-{{WORK_NAME}}.md`
  (create the directory first if it doesn't exist: `mkdir -p .arc/active/`)

Name matches the PRD (e.g., `prd-api-modernization.md` → `tasks-api-modernization.md`).

**Companion file** at `atomic-{name}.md` (same directory, same name stem) — created at Pass 1
as the empty capture surface for atomic tasks discovered during implementation. Skeleton per
[`template-tasks.md`][template-tasks] § Atomic Companion File; see
[process-task-loop § Where to Capture Atomic Tasks](3_process-task-loop.md#where-to-capture-atomic-tasks).

> [!IMPORTANT]
> `workflow-interlock`: Stop after the pre-save checklist passes. Surface the task list location
> for review; await direction before updating the status file and committing (`workflowCommit`).

See [Task Processing Loop](3_process-task-loop.md) for how task lists are executed.

---

## Task List Format

See [template-tasks.md][template-tasks] for the header and body skeleton (header with Purpose,
Tasks with phase preambles, Verification Phase, Success Criteria). See
[strategy-task-list-formatting.md][task-list-formatting] for formatting rules and conventions.

The PRD path should reflect the PRD's current location (matching the task list's save location).
In arc-in-git mode, [activation][activate-work-unit] updates both paths when documents move to
`active/`.

---

## Next Step

**→ [activate-work-unit.md][activate-work-unit]** — Flip `**State:**` to `Active` and rename
`plan/<name>` to `<type>/<name>`. Implementation begins on the renamed branch.

Activation can be deferred if planning ahead. Activate when implementation is about to begin.

---

[strategy-index]: ../../../reference/strategies/STRATEGY-INDEX.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[arc-methods-tf]: ../../methods/test-first.md
[task-list-formatting]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-task-audit]: ../../skills/arc-task-audit/SKILL.md
[template-tasks]: ../../../reference/templates/template-tasks.md
[init-work-unit]: work-unit-lifecycle/planning/init-work-unit.md
[arc-config]: ../../arc-config.yml
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
<!-- arc:if team.mode == true -->
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
<!-- arc:endif -->
