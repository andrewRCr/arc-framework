---
name: review-triage
description: Four-way classification of review findings — fix-now, defer, reject, silent-fix
override-active: false
---

# Method: review-triage

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **When:** Agent processes findings from any code review (self-review, AI tool, human reviewer)
>
> - **Contract:** Every review finding gets an explicit disposition. No finding is silently ignored.
>   `FIX NOW`, `DEFER`, and `REJECT` are documented in the commit message that addresses them;
>   `SILENT FIX` may be omitted when the change is self-evident.

## review-triage.override

[No override configured]

## review-triage.default

Four-way classification for each finding. Evaluate validity (real issue or preference?), context (conflicts with
documented deferrals? code scheduled for replacement?), and impact (functionality vs. code quality?).

**FIX NOW** if:

- Legitimate bug affecting current functionality
- Documentation inconsistency causing confusion
- Simple fix (<10 lines, low risk)
- Improves code being actively maintained

**DEFER** (document reason) if:

- Code is scheduled for deletion in next phase
- Already documented as strategic deferral
- Requires substantial refactoring of temporary code
- Part of a different feature or phase

**REJECT** (note reason) if:

- Conflicts with project standards
- Out of scope for current work
- Reviewer misunderstands the context

**SILENT FIX** (minor findings — explicit per-finding documentation optional) if:

- Typo corrections, formatting improvements
- Minor code quality enhancements
- Simple clarifications that don't need justification

**Documenting dispositions:** Include in the commit message that addresses the findings:

```text
Fixed:
- [Finding 1 description]

Deferred:
- [Finding X]: [Brief reason]

Rejected:
- [Finding Y]: [Brief reason]
```

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
