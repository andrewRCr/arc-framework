---
name: diff-review
description: Aggregate diff review activity — generic contract invokable from any composable moment
related:
  - review-triage
override-active: false
---

# Method: diff-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit] (primary caller)
> - **When:** When a workflow or skill invokes diff review — notably at integrate-work-unit after Phase 1 docs
>   are committed, before push and PR creation
>
> - **Contract:** Review an aggregate diff to catch cross-cutting issues that per-task review misses. Generic
>   activity contract — callers decide when to invoke and what gating applies. The primary caller
>   (integrate-work-unit.md) gates on `review.pre_merge` in [`arc-config.yml`][arc-config]; other callers apply
>   their own gating.
> - **Related:** [review-triage](review-triage.md) — use for finding classification

## diff-review.override

[No override configured]

## diff-review.default

Lightweight diff review. Catches issues that only emerge at the aggregate level — cross-task inconsistencies,
documentation drift, cleanup artifacts. Research consistently shows that self-review before submission eliminates
a significant proportion of review comments and catches issues that are trivial to fix but compound if left for
reviewers.

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

**AI-assisted code** (when an agent performed implementation): Verify business logic correctness — does the
aggregate change actually solve the stated problem? Check exception handling paths explicitly — AI-generated
code systematically underperforms on error cases and edge conditions.

**Process findings** using the [review-triage method](review-triage.md) (fix/defer/reject/silent-fix). Run Tier 3
quality gates on modified files. Commit fixes using the context footer appropriate to the invoking workflow (e.g.,
`(integration)` when called from integrate-work-unit.md).

For structured review workflows (multi-pass, AI tool integration, team review protocols), override this method.
Workflows invoking diff-review at the pre-merge moment may also configure the [pre-merge-review
extension][pre-merge-review-ext] for additional ceremony at that specific moment.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[arc-config]: ../arc-config.yml
[pre-merge-review-ext]: ../extensions/pre-merge-review.md
