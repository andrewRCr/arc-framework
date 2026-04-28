---
name: pre-merge-review
description: Additional review ceremony before merge, on top of the diff-review method
active: true
---

# Extension: pre-merge-review

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **Fires:** After the [diff-review method][diff-review] completes, before push and PR creation
>
> - **Contract:** Add review ceremony on top of the default diff review. The [diff-review
>   method][diff-review] defines the base review activity (lightweight diff review by default, overridable);
>   this extension adds additional actions. Both are gated by `review.pre_merge` in
>   [`arc-config.yml`][arc-config] — when disabled, neither method nor extension fires.

Use for: AI review tool integration (CodeRabbit, Copilot, etc.), multi-pass review strategies, structured
human review protocols, or any additional ceremony beyond the method's review. When processing findings from
any review source, use the [review-triage method][review-triage] for classification
(fix-now/defer/reject/silent-fix).

## pre-merge-review.actions

**CodeRabbit AI code review** — at least one pass, optionally more based on findings.

1. Run CodeRabbit review on the aggregate diff against the parent branch
2. Process findings using the [review-triage method][review-triage] (fix-now/defer/reject/silent-fix)
3. If fixes were made, optionally run a second pass to verify — use judgment based on fix scope

**Invocation options (choose one):**

- **IDE extension** (preferred for smaller diffs): Run CodeRabbit review from VS Code extension
- **Agent subagent** (preferred for larger diffs or headless): Launch the `coderabbit:code-reviewer`
  subagent directly — do NOT use the CodeRabbit CLI plugin, which fails on WSL auth

The agent should propose which invocation path based on diff size, but the user decides.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[diff-review]: ../methods/diff-review.md
[review-triage]: ../methods/review-triage.md
[arc-config]: ../arc-config.yml
