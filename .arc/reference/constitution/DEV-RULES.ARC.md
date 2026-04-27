# Development Rules (ARC)

Behavioral rules for human-AI collaboration under the ARC methodology. These rules apply to every
ARC project regardless of technology stack.

Your project-specific standards — quality gate commands, testing requirements, architecture rules,
documentation style — live in [DEV-RULES.PROJECT][dev-rules-project].

> **How configurable rules work**
>
> Rules marked `[configurable]` point to a specific override mechanism in [`arc-config.yml`][arc-config]
> or a file in [`system/methods/`][arc-methods-dir] — ARC ships a default, your team can replace it.
> See [Configurability Architecture Strategy][config-arch] for the full model. For how rules trace to
> ARC's 11 principles, see [rule → principle mapping][TODO-docs-site].

---

## Contents

- [Commit Discipline](#commit-discipline) — control, format, atomicity
- [Task Execution](#task-execution) — one at a time, sub-agent scope, quality gates, leave-it-cleaner, test-first
- [Session Management](#session-management) — state control, context quality
- [Verification and Discovery](#verification-and-discovery) — verify, consult strategies, load methods/extensions
- [Documentation Boundaries](#documentation-boundaries) — code and methodology separation
- [When to Load Additional Guidance](#when-to-load-additional-guidance) — on-demand reference

---

## Commit Discipline

### Commit control

- **AI never initiates commits** without explicit user approval or instruction; AI reports
  completion and awaits instructions. User controls all git operations.
- **Never use `--no-verify`** to bypass commit hooks — hooks exist to catch errors
- **Check before reverting files:** Before `git checkout -- <file>`, review
  `git diff <file>` — other tasks may have uncommitted work in the same file
- **Task list accuracy:** Before committing, verify task documentation reflects completed work
  (parent task marked `[x]` if all subtasks complete). Stage task list updates with the commit
- **Work status accuracy:** When committing work that changes project state, update the active
  WU's `status-{name}.md` (at `active/{category}/`) to reflect the post-commit state and stage
  it alongside the other changes. This applies to task completion (advance Next Task, Last
  Completed, Next Action), but also to planning-phase commits (PRD creation, task generation,
  activation, archival) that change the branch, next action, or active work unit. Session
  handoff catches missed updates as a fallback, but commit-time is primary.
  **Contributor override:** Contributors (`arc.role = contributor`) do not update project-level
  status files at commit-time — those are maintainer-managed. Contributors maintain their own
  personal active status file at `.arc/user/{identity}/active/status-{name}.md`, which is
  gitignored; the update trigger is session handoff (parallel to SESSION-NOTES), not commit-time.
  See [AGENT-BRIEF.CONTRIBUTOR][contributor-briefing] for contributor boundaries.

**For complex commits** (multi-session accumulated work, interleaved concerns), load the
[prepare-commits workflow][prepare-commits].

### Commit format · `[configurable]`

Commits must follow a consistent, communicative format with a context footer linking each commit
to its task or work context.

ARC ships conventional commit format — `type(scope): description` — with a structured
`Context:` footer. The full format specification, context footer patterns, and type catalog
are in the [commit-format][arc-methods-cf] and [commit-context-format][arc-methods-ccf] methods.

Format enforcement is set in [`arc-config.yml`][arc-config] → `commit.format`,
`commit.context_footer`. Git hooks validate automatically.

### Atomicity

One logical change per commit. When multiple tasks are completed between commits, separate code
changes by task; commit shared documentation (task list updates) last.

---

## Task Execution

### One task at a time

Each checkbox in the task list is one review increment — a bounded chunk of autonomous execution
between human review points. In team mode, this applies per developer-agent pair — concurrent
pairs may work on different tasks simultaneously. See [Team Coordination Strategy][team-coordination]
for task ownership, branching patterns, and handoff conventions.

> **Contributor note:** This section covers maintainer-managed ARC task lists. Contributors
> (`arc.role = contributor`) work on project code, not ARC task lists — see
> [AGENT-BRIEF.CONTRIBUTOR][contributor-briefing].

- **Complete one review increment** — never bundle multiple deliverables
- **Mark complete immediately** when work is done (quality checks pass)
- **Mandatory stop** after reporting completion — wait for user approval to proceed
- **Implied permission:** User approval ("looks good", "proceed") implies permission to continue
  UNLESS explicitly stated otherwise. Address any stated concerns before moving to the next task.

**For the full task execution protocol** (completion steps, quality gate checkpoints, deferred
review), load the [process-task-loop workflow][process-task-loop].

### Sub-agent scope

**Task-list work stays in the primary agent's context.** Delegating a task to a sub-agent bypasses
the co-development loop and the mandatory review stop — the developer can't contribute context,
judgment, or course correction to work they don't see. See [when sub-agents are
appropriate][TODO-docs-site] for the broader guidance on supplementary sub-agent work.

### Task granularity

Break down a task into subtasks if it requires:

- More than 3 files to be modified
- More than 50 lines of core logic changes
- Multiple interdependent changes
- Complex debugging or investigation

### Quality gate failure

If quality gates fail after task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to the next task until resolved or the user approves

### Leave it cleaner

When you encounter an issue that needs addressing — whether in a file you're modifying,
during analysis, or anywhere in the course of work — take responsibility for it.

**If you can fix it now** (in the file, manageable scope): · `[configurable]`

Assess severity via the [issue-triage method][arc-methods-it].

**If you can't fix it now** (not in the file, too large, or would derail current work):

Route to an actionable capture surface — a location that gets reviewed as part of a workflow.

| Intent                   | Size       | Destination                                                       |
|--------------------------|------------|-------------------------------------------------------------------|
| Will do during this WU   | Atomic     | Atomic companion file (`atomic-{name}.md`)                        |
| Will do during this WU   | Multi-step | Propose placement in existing task structure — user approves      |
| For later (arc-in-git)   | Atomic     | `user/{identity}/ATOMIC-INBOX.md`                                 |
| For later (arc-in-git)   | Multi-step | Appropriate backlog file or existing plan-\* doc                  |
| For later (other modes)  | Any        | Per project convention (DEV-RULES.PROJECT) — default: ask user    |

**Multi-step in current work unit:** Search the active task list for a natural home — fold
into an existing incomplete task, add a subtask, or insert a new task at a logical point. If
the work needs a new phase, it may not belong in this work unit — present to user and
consider escalating via [manage-incidental-work][manage-incidental].

**Always propose placement to the user before acting.** The agent suggests, the user decides.

**Anti-pattern:** Task completion notes and session notes are not capture surfaces for
deferred work. They document what was done and contextual observations — they are not
reviewed until integration prep, which is too late for actionable items.

### Test-first assessment · `[configurable]`

Before implementing any task, assess whether tests should be written first — see the
[test-first method][arc-methods-tf] for the decision tree.

During task list creation, group test and implementation together by module or concern. See the
[test-first method][arc-methods-tf] for execution discipline, [process-task-loop][process-task-loop]
for the full loop.

---

## Session Management

### Session state control

Session state uses two files with different update triggers:

- **`status-{name}.md`** (tracked, `active/{category}/`) — the active WU's project pointer,
  updated at commit time and session handoff only
    - **Commit time**: The trigger is a user-initiated commit request (not anticipation of one).
      Advance alongside task list changes (§ Commit Discipline, "Work status accuracy"). Staged
      as part of the commit — not a separate operation.
    - **Session handoff**: If dirty with no pending commit, propose a standalone commit.
    - **Not at other times** — mid-session updates are churn.
- **SESSION-NOTES.md** (gitignored, `user/{identity}/`) — written only at session handoff.
  Personal working context for the next session. Per-developer directory (`user/{identity}/`);
  see [Session Operations Strategy][session-ops] § Portability for cross-machine portability
  via git notes.

AI reports progress throughout the session; session state files capture the summary at commit
and handoff boundaries.

### Context quality

**Never** degrade work quality or change approach due to context pressure — work at full
specification throughout the session regardless of context window size or utilization.

**Prefer shorter, focused sessions that reset at natural boundaries.** See
[Session Operations Strategy][session-ops] for [why session length degrades
quality][TODO-docs-site] and duration guidance.

**Natural session boundaries:**

- **Mode transitions** — design to implementation, investigation to fix, planning to
  execution. Analysis context carried forward crowds the window without serving the new work.
- **Structural boundaries** — phase or work unit completion, clean commit points. A fresh
  session starts with focused context even when the current session has headroom. At these
  points, note the handoff opportunity if significant context has accumulated.
- **Quality signals** — output becoming less precise, early-session guidance being missed,
  re-deriving decisions already established in this session

When a boundary is reached or the user initiates handoff:

1. Complete the current work item — don't stop mid-edit
2. **Stop and ask** — summarize completed and remaining work
3. User decides: continue, commit completed work, or begin handoff

**End-of-session:** Commit complete work, leave partial work uncommitted, perform session
handoff.

---

## Verification and Discovery

### Verify before assuming

**When uncertain about implementation details, file locations, or existing content:**

1. **Search first** — verify from source (Grep, Glob, Read)
2. **Ask clarifying questions** — when the request is understood but design decisions need input
3. **Stop and ask** — if still unclear after searching

**Never generate or assume:**

- File paths or directory structure
- What code "probably does" — read the actual implementation
- Task phase content or summaries — read the task list
- Implementation approaches without understanding requirements

**Clarifying questions improve outcomes.** When you mostly understand a request but see
ambiguities, edge cases, or design alternatives that need decisions — ask.

### Consult strategy guidance

Before implementing work in codified domains, consult the relevant strategy document.

1. Identify if your work touches a domain with codified guidance
2. Check [STRATEGY-INDEX][strategy-index] for relevant strategies
3. Read relevant section(s) before implementing
4. Follow documented patterns

When uncertain if a strategy applies, ask. For large multi-topic strategies, search for the
specific topic rather than reading the entire document.

### Method and extension loading

When a workflow declares method or extension dependencies in its YAML frontmatter
(`arc.methods` / `arc.extensions`), load the declared content before executing the workflow.
Don't proceed from intuition when the declared content is one read away.

---

## Documentation Boundaries

### No meta-project references in code

Never reference task IDs, phase numbers, or `.arc/` documentation in production code — comments,
docstrings, or variable names. Code should explain "what" and "why" independently of project
management context.

### Task references in `.arc/` docs

When referencing tasks in `.arc/` documentation, include both the task identifier and the task
list filename: "Task X.Y - `tasks-name.md`" or "Phase X - `tasks-name.md`". Use only the
filename (no path) since task lists move between active/, backlog/, and archive/ directories.

### Write for the reader, not the author

When removing or restructuring content, don't leave notes explaining what was removed or where
it went — future readers have no context for the old state. Document what *is*, not what *was*.
Historical context belongs in commit messages and task list completion notes, not in the living
document.

**Also applies to communication artifacts** — PR descriptions, notes files, and documentation
handoffs describe what the artifact delivers, not the author's workflow continuity. Workflow
continuity (post-merge activation, next actions, session boundaries, file-retirement metadata
tied to specific commits) belongs in the active WU's `status-{name}.md` and SESSION-NOTES,
not in the artifact body.

**Examples of reader-hostile patterns:**

- "Previously this section covered X, which has moved to Y" (reader never saw X here)
- "Next action after merge: invoke activate-work-unit.md" in a PR description — author-side
  workflow state, not reader-relevant for reviewing the change

See [more reader-hostile patterns][TODO-docs-site] for additional examples.

---

## When to Load Additional Guidance

Load these documents when you reach the relevant work — not during session initialization.

- **Before starting task execution:** The [process-task-loop workflow][process-task-loop] loads
  conditionally at session-init when the active `status-{name}.md` shows active task work (see
  session-init item 10). If it wasn't loaded at init, load it before beginning any task
- **Before complex commits:** Load the [prepare-commits workflow][prepare-commits] — multi-session
  work, interleaved concerns, atomicity analysis
- **Before work in a codified domain:** Check [STRATEGY-INDEX][strategy-index] for relevant
  strategy documents
- **Before authoring a workflow:** Consult [Workflow Authoring Strategy][workflow-authoring] —
  frontmatter schema, author-side declaration rule, body conventions
- **For method defaults and overrides:** Workflow documents include method dependencies blocks
  that trigger loading of the relevant [`system/methods/`][arc-methods-dir] files on-demand
- **For quality gate tier definitions:** Load the [Quality Gates Strategy][quality-gates] —
  Tier 1/2/3 boundaries, escalation guidance

---

[dev-rules-project]: DEV-RULES.PROJECT.md
[arc-config]: ../../system/arc-config.yml
[arc-methods-cf]: ../../system/methods/commit-format.md
[arc-methods-ccf]: ../../system/methods/commit-context-format.md
[arc-methods-it]: ../../system/methods/issue-triage.md
[arc-methods-tf]: ../../system/methods/test-first.md
[arc-methods-dir]: ../../system/methods/README.md
[config-arch]: ../strategies/arc/strategy-configurability-architecture.md
[workflow-authoring]: ../strategies/arc/strategy-workflow-authoring.md
[session-ops]: ../strategies/arc/strategy-session-operations.md
[process-task-loop]: ../../system/workflows/arc/3_process-task-loop.md
[prepare-commits]: ../../system/workflows/arc/supplemental/prepare-commits.md
[strategy-index]: ../strategies/STRATEGY-INDEX.md
[quality-gates]: ../strategies/arc/strategy-quality-gates.md
[manage-incidental]: ../../system/workflows/arc/supplemental/manage-incidental-work.md
[contributor-briefing]: ../../system/briefs/AGENT-BRIEF.CONTRIBUTOR.md
[team-coordination]: ../strategies/arc/strategy-team-coordination.md

[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
