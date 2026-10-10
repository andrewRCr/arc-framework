---
name: self-review
description: Local author-side aggregate diff preflight — generic and composable
arc:
  methods:
    - review-triage
related:
  - review-triage
active: true
override-active: false
---

# Method: self-review

> - **Workflow:** [prepare-work-unit.md][prepare-work-unit] (primary caller)
> - **When:** When a workflow or skill invokes local diff preflight — notably before opening a change request
>
> - **Contract:** The authoring agent reviews its aggregate local diff for cross-cutting issues that per-task review
>   misses. This preflight is not peer/independent review evidence and cannot satisfy a review requirement. Callers
>   decide when to invoke it and what gating applies. As agent-side ergonomics, it does not structurally enforce
>   merge safety.
> - **Related:** [review-triage](review-triage.md) — use for finding classification

## self-review.override

[No override configured]

## self-review.default

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

**Process findings** using the [review-triage method](review-triage.md). Present the author self-review as a standalone
non-producer report with report-local `F` labels, faithful claims and loci, source-verification evidence, ARC judgment,
proposed action, and open questions. Obtain complete-set approval before applying fixes. This path does not fabricate
a distinct reviewer grade, native label, producer ordinal, receipt, or canonical producer identity. Request `arc check increment`
once over the approved fixes. Commit finding-driven fixes with the canonical `(code review)` context footer; reserve lifecycle-phase
footers for ceremony commits rather than the fixes review produced.

For structured review workflows, configure lifecycle extensions separately; do not reinterpret this author-side
preflight as independent evidence.

---

[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
