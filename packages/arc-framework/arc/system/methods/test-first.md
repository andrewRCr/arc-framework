---
name: test-first
description: Decision tree for test-first vs test-after by change type
override-active: false
---

# Method: test-first

> - **Workflow:** [process-task-loop.md][process-task-loop]
> - **When:** Agent begins implementing any task
>
> - **Contract:** Assess whether tests should be written before implementation. The assessment must inform
>   task structure.

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

**Execution discipline — one behavior at a time:** The behavior list under the marker is a discovery guide, not
a batch spec. The default is vertical slices: write one test, make it pass, then write the next — each cycle
informs the next. Avoid writing all tests upfront then implementing; that tests *imagined* behavior, not actual
behavior. When behaviors are tightly coupled and slicing adds no discovery value, batching is acceptable — note
the rationale in the completion report to the user (not in task list completion notes; see
[process-task-loop][process-task-loop] § Batching judgment).

**During task list creation:** Group test and implementation together — by module or concern, not by activity.
A test-first task covers both writing tests and writing the code that makes them pass. Use the
`Build \`test-first\` (one behavior at a time):` marker line to introduce the behavior list — this signals the
executing agent to apply the red-green-refactor loop (see [process-task-loop][process-task-loop] for execution
details).

---

[process-task-loop]: ../workflows/arc/3_process-task-loop.md
