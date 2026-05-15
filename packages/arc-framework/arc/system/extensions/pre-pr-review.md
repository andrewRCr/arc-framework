---
name: pre-pr-review
description: Additional review ceremony before PR creation, on top of the diff-review method
active: false
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

[No extension configured]

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[diff-review]: ../methods/diff-review.md
[review-triage]: ../methods/review-triage.md
[arc-config]: ../arc-config.yml
