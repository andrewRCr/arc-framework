# Development Rules (ARC)

Behavioral rules for human-AI collaboration under the ARC methodology. These rules apply to every
ARC project regardless of technology stack.

Your project-specific standards — quality gate commands, testing requirements, architecture rules,
documentation style — live in [DEV-RULES.PROJECT][dev-rules-project].

> **How rules work in ARC**
>
> Every rule traces to one of ARC's 11 principles (P1–P11). Rules marked `[configurable]` point
> to a specific override mechanism in [`arc-config.yml`][arc-config] or
> [`arc-methods.md`][arc-methods] — ARC ships a default, your team can replace it. All other
> rules are followed as stated.
>
> For the full principle definitions, see the [Philosophy][core-philosophy] docs.
> For all configuration mechanisms, see [Configurability Architecture Strategy][config-arch].

---

## Contents

- [Commit Discipline](#commit-discipline) — control, format, atomicity
- [Task Execution](#task-execution) — one at a time, sub-agent scope, quality gates, leave-it-cleaner, test-first
- [Session Management](#session-management) — state control, context quality
- [Verification and Discovery](#verification-and-discovery) — verify, consult strategies, re-check
- [Documentation Boundaries](#documentation-boundaries) — code and methodology separation
- [When to Load Additional Guidance](#when-to-load-additional-guidance) — on-demand reference

---

## Commit Discipline

### Commit control · P2, P6

- **AI never initiates commits** without explicit user approval or instruction
- **AI can execute commits** when the user explicitly approves or instructs
- **User approval required** for all git operations
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
  status files — see [AGENT-BRIEFING.CONTRIBUTOR][contributor-briefing] for contributor boundaries.
- AI reports completion, then awaits commit instructions

**For complex commits** (multi-session accumulated work, interleaved concerns), load the
[commit guide][prepare-commits].

### Commit format · P6 · `[configurable]`

Commits must follow a consistent, communicative format with a context footer linking each commit
to its task or work context. Format enforcement and traceability are required; the specific
format is a strong default.

ARC ships conventional commit format — `type(scope): description` — with a structured
`Context:` footer. The full format specification, context footer patterns, and type catalog
are in [`arc-methods.md`][arc-methods] → `#commit-format`, `#commit-context-format`.

Format enforcement is set in [`arc-config.yml`][arc-config] → `commit.format`,
`commit.context_footer`. Git hooks validate automatically.

### Atomicity · P6

One logical change per commit. When multiple tasks are completed between commits, separate code
changes by task; commit shared documentation (task list updates) last.

---

## Task Execution

### One task at a time · P2, P7

Each checkbox in the task list is one review increment — a bounded chunk of autonomous execution
between human review points (P2 — human-agent co-development). The checkpoint is
always at the checkbox level. In team mode, this applies per developer-agent pair — concurrent
pairs may work on different tasks simultaneously. See [Team Coordination Strategy][team-coordination]
for task ownership, branching patterns, and handoff conventions.

> **Contributor note:** This section applies to maintainer-managed ARC task lists. Contributors
> (`arc.role = contributor`) work on project code, not ARC planning artifacts — task execution
> rules apply to contributor work through project-level conventions, not ARC task lists. See
> [AGENT-BRIEFING.CONTRIBUTOR][contributor-briefing] for contributor boundaries.

- **Complete one review increment** — never bundle multiple deliverables
- **Mark complete immediately** when work is done (quality checks pass)
- **Mandatory stop** after reporting completion — wait for user approval to proceed
- **Implied permission:** User approval ("looks good", "proceed") implies permission to continue
  UNLESS explicitly stated otherwise. Address any stated concerns before moving to the next task.

**For the full task execution protocol** (completion steps, quality gate checkpoints, deferred
review), load the [process-task-loop workflow][process-task-loop].

### Sub-agent scope · P2, P3

Many agent platforms support sub-agents — supplementary processes that run alongside the primary
agent. Sub-agents are valuable for bounded, well-defined work that doesn't need to be in the
primary context: parallel investigation, external research, token-heavy analysis that feeds
results back for synthesis. The developer remains the continuity thread, directing the primary
work while incorporating supplementary results.

**Not for review-increment-level work.** Each task in the task list is a review increment —
delegating it to a sub-agent bypasses the co-development loop and the mandatory review stop.
The human can't contribute context, judgment, or course correction to work they don't see
happening. Task-list work stays in the primary agent's context where the developer is present.

### Task granularity · P7

Break down a task into subtasks if it requires:

- More than 3 files to be modified
- More than 50 lines of core logic changes
- Multiple interdependent changes
- Complex debugging or investigation

### Quality gate failure · P4

If quality gates fail after task completion:

1. **Report the failure** with specific details
2. **Identify suspected causes** and investigation areas
3. **Ask for guidance** on whether to fix immediately or defer
4. **Never proceed** to the next task until resolved or the user approves

### Leave it cleaner · P4

When you encounter an issue that needs addressing — whether in a file you're modifying,
during analysis, or anywhere in the course of work — take responsibility for it. Don't pass
over an issue because it's outside your current task.

**If you can fix it now** (in the file, manageable scope): · `[configurable]`

Assess severity via the [`issue-triage`][arc-methods] method in `arc-methods.md`. The method
determines fix-vs-defer thresholds; teams can override the triage defaults while keeping the
principle intact.

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

### Test-first assessment · P4 · `[configurable]`

Before implementing any task, assess whether tests should be written first. Test-first produces
better coverage and catches design issues earlier.

ARC ships a decision tree based on change type — test-first for new models, endpoints, business
logic, and complex transformations; test-after acceptable for simple CRUD, presentational
components, config changes, and trivial refactoring. If unsure, default to test-first. The
full decision tree is in [`arc-methods.md`][arc-methods] → `#test-first`.

During task list creation, group test and implementation together by module or concern — not as
separate "write tests" and "implement" tasks. The executing agent applies the red-green-refactor
loop within each task — one behavior at a time, never batching all tests before implementing
(see [`arc-methods.md`][arc-methods] → `#test-first` for execution discipline,
[process-task-loop][process-task-loop] for the full loop).

---

## Session Management

### Session state control · P2, P5

Session state uses two files with different update triggers:

- **`status-{name}.md`** (tracked, `active/{category}/`) — the active WU's project pointer,
  updated at commit time and session handoff only
    - **Commit time**: Advance alongside task list changes (§ Commit Discipline, "Work status
      accuracy"). Staged as part of the commit — not a separate operation.
    - **Session handoff**: If dirty with no pending commit, propose a standalone commit.
    - **Not at other times** — mid-session updates are churn. The next session recovers state
      from the committed `status-{name}.md`, git log, and task list checkboxes.
- **SESSION-NOTES.md** (gitignored, `user/{identity}/`) — written only at session handoff.
  Personal working context for the next session. Each developer has their own directory
  (`user/{identity}/`), so concurrent developers don't conflict on session state. Portability
  across machines via git notes — see [Session Operations Strategy][session-ops] § Portability.

AI reports progress throughout the session; session state files capture the summary at commit
and handoff boundaries.

### Context quality · P5

**Never** degrade work quality or change approach due to context pressure — work at full
specification throughout the session regardless of context window size or utilization.

**Prefer shorter, focused sessions.** Context quality degrades over session length — not
just as windows fill, but as accumulated context pushes early guidance toward weaker retrieval
positions. Focused sessions that reset at natural boundaries maintain higher quality than
marathon sessions that technically fit in the window. See
[Session Operations Strategy][session-ops] for the evidence base and duration guidance.

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

### Verify before assuming · P2

Wrong information is worse than no information.

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

### Consult strategy guidance · P10

Before implementing work in codified domains, consult the relevant strategy document.

1. Identify if your work touches a domain with codified guidance
2. Check [STRATEGY-INDEX][strategy-index] for relevant strategies
3. Read relevant section(s) before implementing
4. Follow documented patterns

When uncertain if a strategy applies, ask. For large multi-topic strategies, search for the
specific topic rather than reading the entire document.

### Re-check core documents

Core documents are read during session initialization. Re-check mid-session when triggered:

**QUICK-REFERENCE — re-check when:**

- Commands fail with path or environment errors
- Uncertain which quality gate command or tool path to use
- Working directory context seems wrong

**DEV-RULES — re-check when:**

- Uncertain about quality standards or the zero-tolerance policy
- Approaching context limits (verify protocol and agent-specific guidance)
- Confused about verification, strategy, or task management protocols

**Don't re-check for** operations with dedicated workflow docs (commits, session handoffs) —
workflows are authoritative for their domain.

---

## Documentation Boundaries

### No meta-project references in code · P9

Never reference task IDs, phase numbers, or `.arc/` documentation in production code — comments,
docstrings, or variable names. Meta-project information belongs only in `.arc/` documentation.
Code should explain "what" and "why" independently of project management context.

### Task references in `.arc/` docs · P9

When referencing tasks in `.arc/` documentation, include both the task identifier and the task
list filename: "Task X.Y - `tasks-name.md`" or "Phase X - `tasks-name.md`". Use only the
filename (no path) since task lists move between active/, backlog/, and archive/ directories.

### Write for the reader, not the author · P9

When removing or restructuring content, don't leave notes explaining what was removed or where
it went — future readers have no context for the old state. Document what *is*, not what *was*.
Historical context belongs in commit messages and task list completion notes, not in the living
document.

**Also applies to communication artifacts** — PR descriptions, notes files, and documentation
handoffs describe what the artifact delivers, not the author's workflow continuity. A PR
reader is reviewing a change set; they don't need a map of which session comes next. Workflow
continuity (post-merge activation, next actions, session boundaries, file-retirement metadata
tied to specific commits) belongs in the active WU's `status-{name}.md` and SESSION-NOTES,
not in the artifact body.

**Examples of reader-hostile patterns:**

- "Previously this section covered X, which has moved to Y" (reader never saw X here)
- "Removed the FooBar handler" as a code comment (reader doesn't know FooBar)
- Explaining why an item is absent from a list (reader only sees the list as it is)
- "Next action after merge: invoke activate-work-unit.md" in a PR description — author-side
  workflow state, not reader-relevant for reviewing the change
- "Plan doc retired with this PRD commit" in a notes file header — reader doesn't need the
  workflow context; the file's existence and contents are self-explanatory
- "Purpose: detailed rationale carved out to keep the PRD crisp" in a notes file header —
  frames the file narrowly as author-side bookkeeping instead of the living scratchpad it is

---

## When to Load Additional Guidance

These documents contain detailed procedures for specific activities — procedural content (T3) in the
[Session Operations Strategy][session-ops]. Load them when you reach the relevant work — not during
session initialization.

- **Before starting task execution:** The [process-task-loop workflow][process-task-loop] loads
  conditionally at session-init when the active `status-{name}.md` shows active task work (see
  session-init item 11). If it wasn't loaded at init (no active task list, or session pivoted
  to task execution), load it before beginning any task. The workflow's method dependencies
  block triggers loading of issue-triage, quality-gate-commands, and (conditionally) test-first
- **Before complex commits:** Load the [commit guide][prepare-commits] — multi-session
  work, interleaved concerns, atomicity analysis. The workflow's method dependencies block triggers
  loading of commit-format and commit-context-format
- **Before work in a codified domain:** Check [STRATEGY-INDEX][strategy-index] for relevant
  strategy documents
- **Before authoring a workflow:** Consult [Workflow Authoring Strategy][workflow-authoring] —
  frontmatter schema, author-side declaration rule, body conventions
- **For method defaults and overrides:** Workflow documents include method dependencies blocks
  that trigger loading of the relevant [`arc-methods.md`][arc-methods] sections on-demand. Follow
  the workflow — method loading is embedded in the steps
- **For quality gate tier definitions:** Load the [Quality Gates Strategy][quality-gates] —
  Tier 1/2/3 boundaries, escalation guidance

---

[dev-rules-project]: DEV-RULES.PROJECT.md
[arc-config]: ../../system/arc-config.yml
[arc-methods]: ../../system/workflows/arc-methods.md
[core-philosophy]: https://andrewrcr.github.io/arc-framework/philosophy/
[config-arch]: ../strategies/arc/strategy-configurability-architecture.md
[workflow-authoring]: ../strategies/arc/strategy-workflow-authoring.md
[session-ops]: ../strategies/arc/strategy-session-operations.md
[process-task-loop]: ../../system/workflows/arc/3_process-task-loop.md
[prepare-commits]: ../../system/workflows/arc/supplemental/prepare-commits.md
[strategy-index]: ../strategies/STRATEGY-INDEX.md
[quality-gates]: ../strategies/arc/strategy-quality-gates.md
[manage-incidental]: ../../system/workflows/arc/supplemental/manage-incidental-work.md
[contributor-briefing]: ../../system/agent/AGENT-BRIEFING.CONTRIBUTOR.md
[team-coordination]: ../strategies/arc/strategy-team-coordination.md
