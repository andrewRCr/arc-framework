# ARC Methods

Default implementations for ARC's configurable conventions. Each method defines a contract (what must be
accomplished) and a default (how ARC does it out of the box).

**How overrides work:** To replace a default, fill in the method's `.override` section with your team's
implementation. The agent reads this file during session initialization — for each method, it checks `.override`
first. If populated, follow the override and skip `.default`. Contracts are advisory: your override should satisfy
the same invariant as the default.

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

---

## Contents

- [commit-format](#commit-format) — message structure, types, scope, body
- [commit-context-format](#commit-context-format) — context footer patterns
- [leave-it-cleaner](#leave-it-cleaner) — severity triage, fix-vs-defer decisions
- [test-first](#test-first) — decision tree by change type
- [task-completion](#task-completion) — recording task completion
- [session-state](#session-state) — reading and writing session state
- [quality-gate-commands](#quality-gate-commands) — project quality gate definitions

---

## commit-format

**Workflow:** [atomic-commit.md][atomic-commit] · **When:** Agent writes a commit message

**Contract:** Commits follow a consistent, communicative format that enables automated tooling and readable history.

### commit-format.override

[No override configured]

### commit-format.default

Conventional commit format.

```text
<type>(scope): Brief description (50-72 chars, imperative mood)

- Key change or rationale (1-2 lines per bullet)
- Impact if significant
```

**Types:** `feat` `fix` `docs` `content` `style` `refactor` `test` `chore` `perf` `build` `ci` `config` `revert`

**Scope:** Lowercase functional area (e.g., `auth`, `api`, `tests`, `config`, `arc`, `deps`).

**Body:** 10–15 lines max (20–25 for milestones). Focus on WHY and IMPACT, not what changed.

**Enforcement:** Git hooks validate format when `commit.format` is `conventional` or `custom`
in [`arc-config.yml`][arc-config]. See `system/githooks/README.md` for setup.

---

## commit-context-format

**Workflow:** [atomic-commit.md][atomic-commit] · **When:** Agent writes a commit message

**Contract:** Every commit includes a context footer linking it to its task or work context. Format must be
grep-searchable across commit history.

### commit-context-format.override

[No override configured]

### commit-context-format.default

`Context:` footer with task list reference or category.

**With task list:**

- `Context: tasks-[filename].md (Task X.Y)` — single task
- `Context: tasks-[filename].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[filename].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[filename].md (Tasks X.Y; planning)` — task + extra task list work
- `Context: tasks-[filename].md (incidental - discovered during Task X.Y)` — incidental fix
- `Context: tasks-[filename].md (planning)` — task list metadata only
- `Context: tasks-[filename].md (activation)` — backlog to active transition
- `Context: tasks-[filename].md (archival)` — active to archive transition

**Without task list:**

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — small one-off work

**Categories:** `planning`, `documentation`, `maintenance`, `refactor`.

**Enforcement:** Git hooks validate context footer when `commit.context_footer` is `required` or `custom`
in [`arc-config.yml`][arc-config].

---

## leave-it-cleaner

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Quality checks reveal issues in modified files

**Contract:** Pre-existing quality issues must be addressed — fix or document, but never ignore silently.

### leave-it-cleaner.override

[No override configured]

### leave-it-cleaner.default

Severity-based triage with documentation requirements.

**Assess severity and scope:**

- **Minor** (< 5 minutes): Fix immediately without asking
- **Moderate** (5–15 minutes): Fix immediately, document in commit message
- **Major** (> 15 minutes): Ask for direction before proceeding

**Choose one action:**

- **Fix immediately** — Preferred for all issues under 15 minutes
- **Document and defer** — Create incidental task with: clear description of issue, why deferred (time/scope
  constraints), estimated effort, file/line references
- **Ignore silently** — Never acceptable

**Document the outcome:**

- Fixed issues: Note in commit message ("Also fixed X pre-existing issues")
- Deferred issues: Create incidental task in the active work directory
- Undocumented issues: Never leave issues unaddressed

---

## test-first

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Agent begins implementing any task

**Contract:** Assess whether tests should be written before implementation. The assessment must inform task order.

### test-first.override

[No override configured]

### test-first.default

Decision tree by change type.

**Requires test-first** (write tests BEFORE implementation):

- New data models or schemas
- New API endpoints or endpoint modifications
- New service classes or business logic
- Complex algorithms or data transformations
- Non-trivial validation or processing logic

**Test-after acceptable:**

- Simple CRUD operations with no custom logic
- Presentational UI components
- Configuration file changes
- Trivial refactoring (renaming, moving files)
- Documentation-only changes

**If unsure, default to test-first.** Writing tests after implementation is harder and less effective.

**During task list creation:** Place test tasks BEFORE implementation tasks for test-first work. This makes the
ordering visible during execution.

---

## task-completion

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Agent marks a task as complete

**Contract:** Record that the specified task is complete. Status must be verifiable by both human and agent.

### task-completion.override

[No override configured]

### task-completion.default

Mark `[x]` in the markdown task list file, update task description with completion notes.

---

## session-state

**Workflow:** [session-init.md][session-init], [session-handoff.md][session-handoff] · **When:** Agent reads or
writes session state

**Contract:** Preserve session context across handoffs. State must be recoverable by a new agent or session.

### session-state.override

[No override configured]

### session-state.default

Read/write WORK-STATUS.md and SESSION-NOTES.md at session boundaries.

---

## quality-gate-commands

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Agent runs quality gates (Tier 1, Tier 2, or Tier 3)

**Contract:** Project-defined quality gate commands. Must return zero exit code on pass, non-zero on failure.

### quality-gate-commands.override

[No override configured]

### quality-gate-commands.default

Commands specified in [DEV-RULES.PROJECT][dev-rules-project] § Quality Gates.

---

[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
[atomic-commit]: arc/supplemental/atomic-commit.md
[process-task-loop]: arc/3_process-task-loop.md
[session-init]: arc/supplemental/session-init.md
[session-handoff]: arc/supplemental/session-handoff.md
[arc-config]: ../arc-config.yml
[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
