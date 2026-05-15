---
name: pre-pr-review
description: Additional review ceremony before PR creation, on top of the diff-review method
active: true
---

# Extension: pre-pr-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After the [diff-review method][diff-review] completes, before the push that opens the PR
>
> - **Contract:** Add review ceremony on top of the default diff review. The [diff-review
>   method][diff-review] defines the base review activity (lightweight diff review by default, overridable);
>   this extension adds additional actions. Both are gated by `review.pre_merge` in
>   [`arc-config.yml`][arc-config] — when disabled, neither method nor extension fires.

Use for: AI review tool integration (CodeRabbit, Copilot, etc.), multi-pass review strategies, structured
human review protocols, or any additional ceremony beyond the method's review. When processing findings from
any review source, use the [review-triage method][review-triage] for classification
(fix-now/defer/reject/silent-fix).

## pre-pr-review.actions

**CodeRabbit AI code review** — at least one pass, optionally more based on findings.

1. Launch the `coderabbit:code-reviewer` subagent against the aggregate diff vs parent branch
2. Process findings using the [review-triage method][review-triage] (fix-now/defer/reject/silent-fix)
3. **`workflow-interlock`:** Stop after surfacing findings and recommended dispositions. Await direction
   before applying review fixes
4. If fixes were made, optionally run a second pass to verify — use judgment based on fix scope

**Auth prerequisite.** The subagent invokes the CodeRabbit CLI underneath, which requires a one-time
`coderabbit auth login` (browser flow). If a run fails on authentication, verify with
`coderabbit auth status` and re-login if needed.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[diff-review]: ../methods/diff-review.md
[review-triage]: ../methods/review-triage.md
[arc-config]: ../arc-config.yml
