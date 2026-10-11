---
name: disposition-report
description: Decision-first presentation of a verified finding set put to its approver
related:
  - review-triage
  - adversarial-review
override-active: false
---

# Method: disposition-report

> - **When:** A caller presents a verified finding set for complete-set approval — a code-review set under
>   [review-triage](review-triage.md), or a planning or verification pass under
>   [adversarial-review](adversarial-review.md).
>
> - **Contract:** Present the complete verified set as one report the approver decides from: a decision table with
>   every open question beneath it, then one section per finding. Hold each finding's evidence out of the report and
>   give it when the approver asks. Never fabricate a field the finding's source does not supply.

## disposition-report.override

[No override configured]

## disposition-report.default

Lead with the decision and layer the rest beneath it: the approver decides from the table and opens a finding's
section only to drill in. The report's shape is:

```markdown
| # | Grade | Verdict | Action | Finding |
|---|---|---|---|---|
| F{ordinal} | <verified grade, or —> | <verdict> | <FIX, DEFER, or REJECT> | <title> |

**Open questions**                                       [only when any finding carries one]
- F{ordinal}: <question>

### F{ordinal} — <title>

**Issue:** <the finding as raised>

**Action:** <proposed action and boundaries>

**Detail:** <source check and consequence>
```

Every set gets the table, one row per finding. Label the findings `F1`, `F2`, and onward in decision order — most
severe verified grade first, unsupported findings last, the source's order kept among equals. The labels are
report-local and replace no label the source assigned. Grade is the verified grade with its symbol — `🔴 critical`,
`🟠 major`, or `🟡 minor` — or `—` when the finding is not supported. Verdict is `Confirmed` or `Not supported`; when
the source supplies the reviewer's grade, a not-supported verdict names it (`reviewer graded <grade>`), and a
confirmed one names it only when it differs. Action is the proposed disposition; the section carries the full action.

Gather every open question beneath the table under its finding's label, so everything asked of the approver sits in
one place. Then give one section per finding, in table order. The title names the issue in a phrase; the issue states
the finding as raised, before any judgment of it; the action gives the proposed response and its boundaries; and the
detail gives the source check and consequence behind the verdict. Separate a section's fields with a blank line, and
adjacent sections with a blank line, `---`, and another blank line.

Hold the evidence behind the set — each finding's locus and the references its source check rests on — out of the
report. Give it when the approver asks, before or after approving, one line per finding under its label:

```markdown
**Evidence**
- F{ordinal} · <locus> · verified at <source-verification references>
```

Show the report as text where the approver reads it — never a file path, link, or summary in its place — because the
approver decides from the report itself. A caller may lead the report with a line of its own, extend a verdict or an
evidence line with fields its source supplies, and set a finer decision order. Omit any field a finding's source does
not supply rather than fabricate it.
