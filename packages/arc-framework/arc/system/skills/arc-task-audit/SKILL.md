---
name: arc-task-audit
description: Pre-implementation audit of task list entries — surfaces assumptions, design decisions, scope gaps, and codebase drift before work begins. Use only when the user explicitly requests a task audit or pre-implementation review.
disable-model-invocation: false
---

# ARC Task Audit

Pre-implementation analysis pass. Read-only — no edits, no implementation. The user decides
when the cost of an audit is justified; never invoke this proactively before starting tasks.

1. Determine audit scope.

   - The user specifies which tasks to audit: a single task, a range, a phase, or the full
     task list.
   - Read WORK-STATUS.md to locate the active task list, then read the relevant sections.
   - For single-task audits, read the task and its immediate neighbors (predecessor and
     successor) for ordering context.
   - For phase or multi-task audits, read the full phase and skim adjacent phases for
     cross-phase dependencies.

2. Read the codebase context that each task touches.

   - For every file, function, module, or interface referenced or implied by the task
     description, verify it exists and inspect its current state.
   - Note any drift between the task description and what the code actually looks like —
     renamed functions, moved files, changed signatures, deleted modules.
   - Check imports, exports, and call sites to understand the dependency surface.

3. Analyze each task against the following issue categories.

   - **Unexposed assumptions** — Task assumes something about codebase state, available
     APIs, data shapes, or environmental conditions that isn't verified or stated. Flag what
     the assumption is and what would break if it's wrong.
   - **Masked design decisions** — Implementation will force a choice (naming, interface
     shape, error handling strategy, module boundary) that the task doesn't acknowledge.
     Surface the decision and its alternatives.
   - **Codebase drift** — Gap between the task description and actual code. Renamed
     functions, moved files, changed interfaces, deleted modules, or new code added since
     the task was written.
   - **Ordering and dependency risks** — Task assumes a prior task's output without saying
     so, or would be materially easier in a different sequence. Flag hidden dependencies and
     suggest reordering if warranted.
   - **Scope ambiguity** — Task description could reasonably be interpreted as two or more
     different scopes of work. Flag where the boundary is unclear and what interpretation
     differences would mean for effort and impact.
   - **Interface contracts** — Task creates something a later task consumes, but the
     shape, contract, or API surface isn't specified. The later task will have to guess or
     the implementer will backtrack.
   - **Test strategy gaps** — Task has a `test-first` marker but the behavior list doesn't
     cover error paths or edge cases. Or: task modifies shared code but no integration test
     coverage is mentioned. Or: behavior list tests imagined interfaces rather than actual
     ones.
   - **Missing acceptance criteria** — No clear definition of "done" beyond "implement X."
     Flag tasks where completion is ambiguous.

4. Produce structured findings.

   - Group findings by category (not by task), with each finding referencing the specific
     task(s) it applies to.
   - Assign severity to each finding:
     - **Fix before starting** — Task description should be updated or a design decision
       resolved before implementation begins.
     - **Carry as context** — Not a blocker, but the implementer should be aware of this
       during execution.
   - For multi-task audits, include a brief cross-cutting summary at the top: overall
     readiness assessment, highest-risk tasks, and any systemic patterns across findings.
   - If the audit is clean (no findings), say so briefly — don't manufacture concerns.

5. Recommend actions.

   - For "fix before starting" findings: suggest specific task description edits, missing
     subtasks, or design decisions to resolve.
   - For ordering risks: suggest concrete resequencing with rationale.
   - Do not implement fixes — present findings and wait for the user to decide how to
     proceed.
