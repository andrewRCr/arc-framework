---
name: review-triage
description: Four-way classification of review findings — fix-now, minor-fix, defer, reject
override-active: false
---

# Method: review-triage

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
> - **When:** Agent processes findings from any code review (self-review, AI tool, human reviewer)
>
> - **Contract:** Every review finding gets an explicit, documented disposition. No finding is silently ignored.
>   Multiple self-evident `MINOR FIX` findings may be documented as one concise roll-up.

## review-triage.override

[No override configured]

## review-triage.default

Four-way classification for each finding. Evaluate validity (real issue or preference?), context (conflicts with
documented deferrals? code scheduled for replacement?), and impact (functionality vs. code quality?).

**FIX NOW** (material findings that must be addressed in the current change) if:

- Bug, security issue, or failure-path gap affecting delivered behavior
- Documentation inconsistency that would make the delivered contract materially untrue
- Significant maintainability or coherence issue in the changed surface
- Any valid finding whose impact makes deferral incompatible with the current change's completion bar

**MINOR FIX** (valid, low-impact, safe-now findings) if:

- Typo, formatting, or local naming correction
- Small clarification or code-quality improvement with no material behavior change
- Self-evident cleanup that is safe to include in the current review-fix increment

**DEFER** (document reason) if:

- Code is scheduled for deletion in next phase
- Already documented as strategic deferral
- Requires substantial refactoring of temporary code
- Part of a different feature or phase

**REJECT** (note reason) if:

- Conflicts with project standards
- Out of scope for current work
- Reviewer misunderstands the context

**Documenting dispositions:** Include in the commit message that addresses the findings:

```text
Fixed:
- [Finding 1 description]

Minor fixes:
- [Concise finding or grouped roll-up]

Deferred:
- [Finding X]: [Brief reason]

Rejected:
- [Finding Y]: [Brief reason]
```

Every valid finding appears in the record. Several self-evident minor fixes may share one concise `Minor fixes`
entry; grouping reduces noise without making the disposition implicit.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
