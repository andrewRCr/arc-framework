---
name: arc-task-review
description: "Review at the task-interlock: surfaces spec deviations, ambiguity interpretations, and judgment calls beyond the completion report."
disable-model-invocation: false
---

# ARC Task Review

Post-implementation analysis at the review increment boundary. Surfaces
structured information for independent human judgment — not the agent's
narrative (that's the completion report), but the raw material the human needs
to form their own view of the completed increment.

Not a substitute for the integration workflow's final `pre-merge-review` (work-unit
scope) or external code review tools. Does not present the diff — the user has
the code open. Does not recommend whether to approve or reject — it surfaces
information for the human to decide.

Invoked at user discretion, not every review increment.

1. Identify the completed work to review.

   - Default: the task just reported as complete at the current review
     increment boundary.
   - If the user specifies a different scope (a prior task, a batch from
     deferred review), use that instead.
   - Read the task's completion notes from the task list. If the task list has
     uncommitted changes, compare the current file against git to see the
     original task description alongside the updated version.

2. Gather file change evidence.

   - Identify all files modified during the task — use `git status` and
     `git diff --stat` for uncommitted work, or `git diff --stat` against the
     pre-task commit if changes are already committed.
   - Cross-reference against the task description: separate expected changes
     (files mentioned or implied by the task) from unexpected ones.

3. Analyze across five dimensions.

   - **Spec deviations** — Where did the implementation diverge from the task
     description? What was specified but not done? What was done but not
     specified? Where did the approach differ from what the task implied?
     Include deviations that were reasonable — flag them as such. The human
     decides whether they matter.

   - **Unexpected file changes** — Files modified that aren't mentioned or
     implied by the task description. For each: what was the reason?
     Leave-it-cleaner fix, dependency discovered during implementation, or
     scope expansion?

   - **Ambiguity interpretations** — Where was the task spec ambiguous or
     underspecified? What interpretation did the agent choose, and what
     alternatives existed? This is often the most valuable dimension — it
     surfaces decision points the completion report may not have highlighted.

   - **Judgment calls** — Implementation decisions not dictated by the spec
     where alternatives existed and the choice has non-trivial consequences:
     architectural choices, naming, error handling approach, scope boundary
     decisions, trade-offs between competing concerns. Include the reasoning,
     not just the decision.

   - **Unaddressed observations** — Issues noticed during implementation but
     not acted on or captured: code quality concerns in adjacent code,
     potential improvements outside the task's scope, patterns that seemed
     inconsistent. These would normally route through the issue-triage method
     during execution — this dimension catches anything that slipped through.

4. Produce structured findings.

   - Group by dimension (not by file or by chronology).
   - For each finding, note severity:
     - **Informational** — likely fine, surfaced for completeness
     - **Warrants discussion** — the human should actively consider this
       before proceeding
   - Omit dimensions with no findings — don't pad with non-issues.
   - If the review is clean across all dimensions, say so briefly — don't
     manufacture concerns.
