# Template: Task Lists

Templates and guidance for task lists created during the [generate-tasks.md][generate-tasks] workflow.

See [strategy-task-list-formatting.md][task-list-formatting] for the authoritative format rules, element
reference, test-first patterns, and annotated examples. The Quick Format Checklist in [generate-tasks.md
§ Finalize the task list][generate-tasks] covers the final-save checks.

---

## Work Unit Task List

`Design` is a bare filename — path is derived from the task list's directory, so backlog → active rotation needs
no field edit. The design is canonical for Scope (Will Do / Won't Do); the task list focuses on execution.

```markdown
# Task List: {Work Name}

- **Design:** `spec-{name}.md`

---

<!-- Optional before Phase 1: one unmarked provisional `## Delivery Plan` while authoring, or the
     renderer-owned canonical sentinel block. The delivery renderer owns canonical projection bytes. -->

## **Phase 1:** {Phase name}

<!-- With a Delivery Plan, insert this pointer before Purpose; repeat for each member represented in this phase:
**Delivery member:** {ordinal} — `{chunk-key}`
-->

_Purpose:_ {what this phase delivers and why this granularity}

<!-- `_Mode:_` appears on a segment's opening phase; add `through Phase N` for a multi-phase span.
     `_Exit criterion:_` appears on its closing phase. This single-phase example carries both. -->

_Mode:_ `slice` — closes on exercisable end-to-end capability.

_Exit criterion:_ {specific scenario that proves the segment's capability}

### `[ ]` **1.1 {Subtaskless parent task title}**

- _Goal:_ {one-line outcome the task targets — protected across completion}

- _Context:_ {representative peer descriptor that wraps across physical lines and therefore makes every entry
  in this root descriptor cluster loose}

- **Additional Context:** `{context-file.md}` § {specific section}

    - {description bullet — replaced by `_Outcome:_` at `[x]`}
    - {another description bullet}

### `[ ]` **1.2 {Parent-with-subtasks task title}**

- _Goal:_ {one-line outcome — protected across completion}

    - `[ ]` **1.2.a {Subtask description}**
        - {detail bullet — plan now, outcome at `[x]`}

    - `[ ]` **1.2.b {Subtask description}**
        - {detail bullet}

<!-- In a multi-segment plan, end every `slice` or `replication` segment with this ordinary parent task;
     `layer` segments need none, and the terminal task subsumes it for a single-segment plan:
### `[ ]` **{task-id} {Segment closing title}** — validate exit criterion at segment scope
     It is the closing phase's last non-member parent and immediately precedes a coincident member verifier. -->

<!-- With a Delivery Plan, end each member task range with an assigned verification parent. It is the final
     assigned task in that member range, and its title must end with this exact suffix:
### `[ ]` **{task-id} {Member closing title}** — validate criteria at member scope
     Repeat for every member. These member verifiers are distinct from the sole terminal work-unit verification
     task below. -->

## **Phase N:** Verification

### `[ ]` **N.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

<!-- With a Delivery Plan, replace the flat list below with this grouped form:
### Member {ordinal} — `{chunk-key}`

- `[ ]` {Verifiable outcome derived from Scope "Will Do"}
- `[ ]` {Another verifiable outcome}

### Cross-member seams

- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
-->

- `[ ]` {Verifiable outcome derived from Scope "Will Do"}
- `[ ]` {Another verifiable outcome}
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
```

### Optional Delivery Plan locus

A task list may carry one top-level `## Delivery Plan` between the header rule and Phase 1. During planning it is
an unmarked provisional section. Canonical publication replaces that whole locus with the exact
`<!-- arc:delivery-plan:start -->` / `<!-- arc:delivery-plan:end -->` sentinel block rendered from the canonical
plan record.

The renderer owns the complete canonical projection: plan metadata and plan-level stack landability; aligned
`### Members` identity and `#### Member coverage` tables; an aligned `### Named seams` topology table; and, when
seams exist, naturally wrapped `#### Acceptance` bullets outside tables. Task and design-element identifiers are
individually backticked and comma-separated. Workflow prose and templates do not hand-author that layout.

The locus is informative and non-executable. Scanners, cursors, tallies, and delivery task inventory ignore its
headings, rows, task-looking identifiers, and bullets; the first implementation phase remains the execution start.

Optional sections (Architecture Patterns, Current State, Testing Strategy, etc.) appear only when the work
needs them.

Task-local `- **Additional Context:** ...` lines are optional and rare. Add one only when the task has external
context the executor must read directly; point to exact sections rather than whole files when possible.

---

[generate-tasks]: ../../../../system/workflows/arc/generate-tasks.md
[task-list-formatting]: ../../../strategies/arc/strategy-task-list-formatting.md
