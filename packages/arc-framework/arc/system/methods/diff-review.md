---
name: diff-review
description: Local author-side aggregate diff preflight — generic and composable
related:
  - review-triage
override-active: false
---

# Method: diff-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit] (primary caller)
> - **When:** When a workflow or skill invokes local diff preflight — notably before opening a change request
>
> - **Contract:** The authoring agent reviews its aggregate local diff for cross-cutting issues that per-task review
>   misses. This preflight is not peer/independent review evidence and cannot satisfy a review requirement. Generic
>   activity contract — callers decide when to invoke and what gating applies. The primary caller
>   (integrate-work-unit.md) gates on `review.pre_merge` in [`arc-config.yml`][arc-config]; other callers apply
>   their own gating.
> - **Related:** [review-triage](review-triage.md) — use for finding classification

## diff-review.override

[No override configured]

## diff-review.default

Lightweight author-side diff preflight. It catches issues that only emerge at the aggregate level; it invokes no
external review provider by default and authors no independent evidence.

**Review the aggregate diff against the parent branch:**

```bash
git diff {parent-branch}...HEAD
```

**Check for:**

- **Scope**: Does every change serve the stated purpose? Look for unrelated modifications within legitimately
  changed files, not just accidentally staged files
- **Consistency**: Cross-task inconsistencies in naming, patterns, or approaches that diverged during
  incremental work
- **Cleanup**: Debug artifacts (logging statements, commented-out code, temp scaffolding), dead code from
  refactoring (unused imports, orphaned functions, stale references)
- **Documentation drift**: Docs or comments that no longer match the implementation
- **Unresolved markers**: TODO/FIXME items that should be resolved before merge
- **Correctness**: The aggregate behavior satisfies its declared contract, including boundary conditions
- **Error paths**: Failures are handled explicitly and do not silently weaken invariants

**AI-assisted code** (when an agent performed implementation): Verify business logic correctness — does the
aggregate change actually solve the stated problem? Check exception handling paths explicitly — AI-generated
code systematically underperforms on error cases and edge conditions.

**Process findings** using the [review-triage method](review-triage.md) (fix-now/defer/reject/silent-fix). Run Tier 3
quality gates on modified files. Commit fixes using the context footer appropriate to the invoking workflow (e.g.,
`(integration)` when called from integrate-work-unit.md).

For structured review workflows, configure lifecycle extensions separately; do not reinterpret this author-side
preflight as independent evidence.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[arc-config]: ../arc-config.yml
