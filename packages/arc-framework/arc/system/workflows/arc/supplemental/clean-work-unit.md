---
purpose: Toolkit for work-unit content cleanup — notes-file consolidation and task-list temporal-noise removal.
audience: agent
---

# Workflow: Clean Work Unit

A precision toolkit for work-unit content cleanup. Sections are independently invocable; no linear
top-to-bottom flow is required.

## When to Use

- **From [`integrate-work-unit.md`][integrate] Step 5.** Invoked as a delegated subroutine when integrate's
  disposition decision is "keep + clean" for an existing notes file (`§ Notes File Consolidation`), or when
  integrate's survey finds temporal markers / accumulated scratchpad content in the task list
  (`§ Task List Temporal-Noise Pass`).

- **Standalone, as needed.** For mid-work tidying when a task list or notes file has accumulated drift that
  hampers session loading or scanning. Genuine need; not part of the strict lifecycle pipeline.

State transitions (`Active → Integrating`) are owned by [`integrate-work-unit.md`][integrate]; this workflow
does not touch the meta file's `**State:**` field.

## Notes File Consolidation

Notes files accumulate repetition during work — the same decision explained in multiple places, duplicate
code examples, scattered information about the same topic. Consolidate when keeping the notes file for
archival.

**Step 1: Deduplicate.**

1. Read through the entire notes file identifying repeated information.
2. For duplicates: keep the most complete version, delete clear duplicates, consolidate related sections.
3. **Bias toward preservation:** different perspectives on the same decision, chronological progression, and
   investigation journeys all have value. Only remove exact duplicates and redundant restatements.

**Step 2: Format for archival.**

- **Add Table of Contents** at top (after metadata). Group by category; use markdown anchor links.
- **Update section headers** — remove task or phase scope prefixes (e.g., "Task 5.5: Token Validation
  Implementation" → "Token Validation Issue Resolution"; "Phase 2.R Audit Findings" → "Sync Invariants
  Audit"). Make headers descriptive and standalone.
- **Remove temporal markers** — delete "To be filled", "Pending approval", "Status: PENDING". Update
  decision records to show final outcomes.
- **Consolidate verbose explorations** — preserve the journey but add a summary at the top of long sections.
- **Verify consistency** — check anchor links and metadata.

## Task List Temporal-Noise Pass

> [!WARNING]
> **This is NOT a content reduction exercise.** Don't try to make the task list "scannable" — that's the
> meta file's archive-phase Release Notes Entry + Completion Notes job. The task file preserves the detailed
> sub-task record (can be 500-3000+ lines).
>
> **Task lines are historical records — NEVER modify task descriptions or outcomes.** A task line is the
> checkbox with its description and inline outcome notes (e.g., `- [x] 4.3.3 Consider adding alert
> threshold — DEFERRED to observability sprint`). These document what actually happened and must stay
> verbatim.

**What gets removed:** Temporal markers and scaffolding that only made sense during active work.

**What stays:** All task lines verbatim, research summaries, detailed completion notes, decision rationale,
implementation findings, quality gate results.

**Two-step process — structure first, then fine-grained:**

**Step A: Section-level evaluation.** Scan the task file top to bottom. For each section heading (`##`,
`###`), decide: **KEEP**, **REMOVE**, or **EVALUATE CONTENTS**.

Standard task list structure to preserve:

- Header metadata (`**Spec:**` — single pointer to PRD or plan-doc per chain-model header)
- Overview / Scope (Will Do / Won't Do)
- Tasks (phases with subtasks)
- Success Criteria

Non-standard sections — evaluate each:

- **Temporal scaffolding** (urgency rationale, status snapshots, "next steps", coordination notes) → Remove
- **Substantive content** (implementation findings, research, architectural decisions not captured
  elsewhere) → Keep in place
- **Completion summaries** → Belong in the meta file's archive-phase composition (Release Notes Entry +
  Completion Notes), not the task file

Before removing research or decision content, verify it's captured in ADRs or strategy docs. If not
captured elsewhere and substantive, keep it.

⛔ **Complete section evaluation before proceeding to Step B.**

**Step B: Fine-grained cleanup (grep patterns).** Find inline temporal markers within kept sections:

```bash
# Next Steps references (meaningless after completion)
grep -in "next step\|next:\|**next" tasks-*.md

# Temporal status markers
grep -in "status:.*complete\|status:.*pending\|status:.*blocked\|status:.*[0-9]/[0-9]" tasks-*.md

# Resume/Continue markers
grep -in "resume at\|continue with\|pick up at\|blocked on" tasks-*.md

# References to deleted notes file (if notes file was deleted)
grep -in "notes-.*\.md" tasks-*.md

# Inline subtask completion dates (header date is fine, subtask dates are noise)
grep -in "\*\*completed:\*\*.*202[0-9]" tasks-*.md
```

For each match: read context, verify it's temporal noise (not substantive), remove.

## Quality Checks

After invoking any section, run the project's markdown lint command on the affected files (see
[QUICK-REFERENCE][quick-ref] § Quality Gate Commands). Review the diff to ensure no accidental task-checkbox
edits.

**Verify temporal noise removed (after § Task List Temporal-Noise Pass):**

```bash
# Should return 0-2 matches (header metadata only)
grep -in "status:\|completed:.*202" tasks-*.md

# Should return 0 matches
grep -in "next step\|resume at\|blocked on" tasks-*.md
```

---

[integrate]: ../work-unit-lifecycle/integrate-work-unit.md
[quick-ref]: ../../../../reference/QUICK-REFERENCE.md
