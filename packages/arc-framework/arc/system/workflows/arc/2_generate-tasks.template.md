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

**Branch context:** Under full protection (`branch.protection: full`), task generation happens on
the same planning branch as the PRD — verify you're still on it. Under partial protection (the
default), this may happen directly on the base branch. See
[activate-planning-branch][activate-planning-branch] for how planning branches are set up.

Before starting, read the PRD thoroughly. If the PRD has pre-activation metadata (`**State:**` and/or
`**Related Work:**` fields), check whether dependencies are resolved. If any show unresolved blockers, stop and
confirm with the user before proceeding — generating tasks against unresolved dependencies produces a plan that
can't execute. Pre-activation metadata is removed at activation (see `activate-work-unit.md` Step 4), not here —
leave the fields in place during task generation.

### Step 1: Assess Codebase and Relevant Strategies

Review the existing codebase to understand what you're working with:

- Existing patterns and architecture to leverage
- Components or modules related to the PRD requirements
- Files that will need modification
- Testing patterns and quality standards in use

Check [STRATEGY-INDEX.md][strategy-index] for project-level strategies relevant to
this work (e.g., testing methodology, component patterns, service layer conventions). Read applicable
strategies before designing phases — they directly influence task structure and approach.

### Step 2: Design Phases

Identify 3-7 major phases that organize the work into logical, testable milestones. Present these
to the user for review before breaking down into sub-tasks.

**Principles:**

- Each phase should produce testable, verifiable progress
- Order phases to minimize dependencies and enable incremental delivery
- When test-first applies, group test and implementation together by module or concern
- **Always end with a verification phase** — two tasks: (1) run Tier 3 quality gates,
  (2) validate success criteria against PRD. See
  [task-list-formatting strategy][task-list-formatting] § Verification Phase for conventions

### Step 3: Break Down into Sub-Tasks

For each phase, define specific, actionable sub-tasks:

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

### Step 4: Write and Save Task List

Combine phases and sub-tasks into the final task list following the format described below.
Implementation notes, technical context, and design rationale belong in the dedicated notes
file (`notes-{name}.md`), not in the task list.

**Before saving, verify the draft against this checklist:**

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
- [ ] Subtaskless parents carry no descriptor bullets pre-completion — title alone (no `_Goal:_` /
      `_Note:_` / etc.; `_Outcome:_` allowed post-completion)
- [ ] Blank lines between every subtask (always — see § Blank-Line Discipline in the strategy doc)
- [ ] Unnumbered bullets for implementation details (no checkboxes, no numbers)
- [ ] Goal/Note lines as italic root-level bullets (`- _Goal:_`); subtasks indent 4 spaces under Goal
- [ ] Italic for non-actionable descriptors (`_Purpose:_`, `_Goal:_`, `_Outcome:_`, `_Note:_`,
      `_Rationale:_`, `_Approach:_`, `_Context:_`); bold for actionable titles (`**X.Y Title**`)
- [ ] Test-first tasks group test + implementation together (by concern, not activity)
- [ ] Test-first tasks use `Build \`test-first\` (one behavior at a time):` marker line before behavior list
- [ ] 4-space indentation per hierarchy level
- [ ] Backticks for all technical terms: `field_name`, `ClassName`, `/api/endpoint/`
- [ ] No time estimates anywhere (no duration emojis, minute counts)
- [ ] Verification phase as final phase (single task pointing to `verify-work-unit.md`)
- [ ] Atomic companion file created alongside task list (`atomic-{name}.md`, same directory)
- [ ] Success Criteria section at bottom with checkboxes (checked during verification phase)

**Save to** (location depends on [`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git** (backlog pipeline): `.arc/backlog/{category}/tasks-{{WORK_NAME}}.md`
- **none / external** (no backlog): `.arc/active/{category}/tasks-{{WORK_NAME}}.md`
  (create the directory first if it doesn't exist: `mkdir -p .arc/active/{category}/`)

Name should match the PRD (e.g., `prd-api-modernization.md` → `tasks-api-modernization.md`).

**Create companion file** alongside the task list: `atomic-{name}.md` (same directory, same
name stem). This is the capture surface for atomic tasks discovered during implementation —
see [process-task-loop § Where to Capture Atomic Tasks](3_process-task-loop.md#where-to-capture-atomic-tasks).
Create an empty file with a header:

```markdown
# Atomic Tasks: [Work Name]
```

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

The next step depends on whether you're on a planning branch:

**On a planning branch** (full protection, or partial protection with a planning branch):

**→ [integrate-planning-branch.md][integrate-planning-branch]** — PR the planning branch to base,
then activate from base

**On the base branch** (partial protection, direct commit):

**→ [activate-work-unit.md][activate-work-unit]** — Create implementation branch, move docs to
active, update tracking

Activation can be deferred if planning ahead. Activate when implementation is about to begin.

---

[strategy-index]: ../../../reference/strategies/STRATEGY-INDEX.md
[quality-gates]: ../../../reference/strategies/arc/strategy-quality-gates.md
[dev-rules-arc]: ../../../reference/constitution/DEV-RULES.ARC.md
[arc-methods-tf]: ../../methods/test-first.md
[task-list-formatting]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
[template-tasks]: ../../../reference/templates/template-tasks.md
[activate-planning-branch]: work-unit-lifecycle/planning/activate-planning-branch.md
[integrate-planning-branch]: work-unit-lifecycle/planning/integrate-planning-branch.md
[arc-config]: ../../arc-config.yml
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
<!-- arc:if team.mode == true -->
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
<!-- arc:endif -->
