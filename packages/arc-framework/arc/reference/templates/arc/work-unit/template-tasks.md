# Template: Task Lists

Templates and guidance for task lists created during the [2_generate-tasks.md][generate-tasks] workflow.

See [strategy-task-list-formatting.md][task-list-formatting] for the authoritative format rules, element
reference, test-first patterns, and annotated examples. The Quick Format Checklist in [2_generate-tasks.md
§ Step 4][generate-tasks] covers the final-save checks.

---

## Work Unit Task List

`Design` is a bare filename — path is derived from the task list's directory, so backlog → active rotation needs
no field edit. The design is canonical for Scope (Will Do / Won't Do); the task list focuses on execution.

```markdown
# Task List: {Work Name}

- **Design:** `spec-{name}.md`

---

## **Phase 1:** {Phase name}

_Purpose:_ {what this phase delivers and why this granularity}

### `[ ]` **1.1 {Subtaskless parent task title}**

- _Goal:_ {one-line outcome the task targets — protected across completion}

    - {description bullet — replaced by `_Outcome:_` at `[x]`}
    - {another description bullet}

### `[ ]` **1.2 {Parent-with-subtasks task title}**

- _Goal:_ {one-line outcome — protected across completion}

    - `[ ]` **1.2.a {Subtask description}**
        - {detail bullet — plan now, outcome at `[x]`}

    - `[ ]` **1.2.b {Subtask description}**
        - {detail bullet}

## **Phase N:** Verification

### `[ ]` **N.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` {Verifiable outcome derived from Scope "Will Do"}
- `[ ]` {Another verifiable outcome}
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
```

Optional sections (Architecture Patterns, Current State, Testing Strategy, etc.) appear only when the work
needs them.

---

[generate-tasks]: ../../system/workflows/arc/2_generate-tasks.md
[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
