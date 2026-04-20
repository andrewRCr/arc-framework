---
name: pre-stage-review
description: Additional staging verification before commit — security scans, license headers, generated file checks
active: false
---

# Extension: pre-stage-review

> - **Workflow:** [prepare-commits.md][prepare-commits]
> - **Fires:** After staging changes, before creating the commit
>
> - **Contract:** Add staging verification steps beyond ARC's default `git diff --cached --stat` check. Use
>   for project-specific validations on staged content (security scanning, license headers, generated file
>   checks).

## pre-stage-review.actions

[No extension configured]

---

[prepare-commits]: ../workflows/arc/supplemental/prepare-commits.md
