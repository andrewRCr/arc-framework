---
name: arc-task-audit
description: "Pre-implementation audit: surfaces assumptions, design decisions, scope gaps, and codebase drift."
disable-model-invocation: false
---

# ARC Task Audit

Pre-implementation analysis pass. Read-only — no edits, no implementation. The user decides
when the cost of an audit is justified; never invoke this proactively before starting tasks.

**Also invoked by [2_generate-tasks.md][generate-tasks]'s grounding-audit procedure** as the
grounding-audit gate at generation time, phase-by-phase, at the depth its resolved level selects. In that context the
workflow is the trigger; the same audit logic below applies.

**Two caller inputs: scope and depth.** _Scope_ is which tasks to audit (step 1). _Depth_ selects how far
the analysis goes:

- **`full`** (default) — grounding plus the full eight-category analysis (steps 2–5).
- **`grounding-only`** — the grounding floor alone (step 2): verify the referenced files and symbols exist and
  note drift, then report exists / missing. Skip the eight-category analysis (step 3); steps 4–5 cover only the
  grounding findings.

Absent an explicit depth, audit at `full`.

1. Determine audit scope and depth.

   - The user specifies which tasks to audit: a single task, a range, a phase, or the full
     task list — and the audit depth (`full` or `grounding-only`; default `full`).
   - Read the active status file to locate the active task list, then read the relevant sections.
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

3. Analyze each task against the following issue categories. **Skip this step at `grounding-only` depth** —
   step 2's grounding results are the entire finding set.

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
     - **Carry as context** — Not a blocker, but the implementer must be aware of this during
       execution. The implementer may be a _different, later session_ — possibly several
       sessions downstream — so a carry-as-context finding is useful only if recorded durably
       (below), never left in the audit conversation alone.
   - **Give carry-as-context findings a durable home.** Surfacing one in the audit output is not
     enough — record it where the implementing session will meet it: absorbed into the relevant
     task's description, or, when a `notes-{name}.md` companion exists, documented there and
     cross-referenced **explicitly from the task-level description** (not the phase) so it is
     read at impl time. A significant finding with no notes file is a signal to create one. Sole
     exception: an audit scoped to a single task the auditing agent is about to implement
     directly — the context lives in its own working memory.
   - For multi-task audits, include a brief cross-cutting summary at the top: overall
     readiness assessment, highest-risk tasks, and any systemic patterns across findings.
   - If the audit is clean (no findings), say so briefly — don't manufacture concerns.

5. Recommend actions.

   - For "fix before starting" findings: suggest specific task description edits, missing
     subtasks, or design decisions to resolve.
   - For ordering risks: suggest concrete resequencing with rationale.
   - Do not implement fixes — present findings and wait for the user to decide how to
     proceed.

[generate-tasks]: ../../../workflows/arc/2_generate-tasks.md
