---
name: test-first
description: Decision tree for test-first vs test-after by change type
related:
  - testing-standards
override-active: false
---

# Method: test-first

> - **Workflow:** [generate-tasks.md][generate-tasks]
> - **When:** Agent structures tasks during task-list generation
>
> - **Contract:** Decide whether each task's tests come before or after its implementation, and let that
>   decision shape how the task list is structured.
> - **Related:** [testing-standards](testing-standards.md) — the execution-time counterpart; the two partition
>   the testing apparatus along the planning / execution seam.

## test-first.override

[No override configured]

## test-first.default

Decision tree by change type.

**Requires test-first** (red-green-refactor within the task):

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

**During task list creation:** Group test and implementation together by the segment's mode: behavior path for
`slice`, module or concern for `layer`, repeatable transformation batch for `replication` — never by
testing-versus-implementation activity. A test-first task covers both writing tests and writing the code that makes
them pass. Use the ``Build `test-first` (one behavior at a time):`` marker line to introduce the behavior list and
declare the red-green-refactor cycle boundary. When several coupled behaviors share one indivisible implementation,
put their tests in one batch before implementation so every test can genuinely fail first. See
[process-task-loop][process-task-loop] for execution details.

---

[generate-tasks]: ../workflows/arc/generate-tasks.md
[process-task-loop]: ../workflows/arc/process-task-loop.md
