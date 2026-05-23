---
name: pre-commit-review
description: Pre-commit verification at the agent layer — review-style checks complementary to git pre-commit hooks
active: false
---

# Extension: pre-commit-review

> - **Workflow:** [`arc-commit` skill][arc-commit-skill] + [`prepare-commits.md`][prepare-commits]
> - **Fires:** After staging changes, before commit creation
>
> - **Contract:** Sequential execution with halt-on-fail. Extension-vs-hook decision boundary: extensions
>   carry agent procedures and `workflow-interlock` stops — they operate at the agent layer, can surface
>   findings, and pause for user direction. Git pre-commit hooks carry scriptable per-commit checks — they
>   operate independently of any agent and are purely mechanical. Use this extension for agent-layer review
>   (security scans, license-header verification, generated-file checks, structured review ceremonies);
>   keep mechanical per-file checks in git hooks.

## pre-commit-review.actions

[No extension configured]

---

[arc-commit-skill]: ../.internal/skills/arc-commit/SKILL.md
[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
