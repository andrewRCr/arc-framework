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

Lead with the caller's header, then the complete decision table, one Decisions block, and the finding sections.
The caller supplies the header and its approval and continuation asks; omit optional fields it does not supply.

```markdown
<caller-supplied header line>                              [when supplied]

| # | Grade | Finding | Action |
|---|---|---|---|
| F{ordinal} | <verified grade, or —> | <title> | <FIX, DEFER, or REJECT, with a fix tag when supplied> |

**Decisions**                                            [when there are asks]
- <caller-supplied approval and continuation asks>
- F{ordinal}: <open question>                             [when supplied]

### F{ordinal} — <title>

<verified grade, or —> · <verdict, with source grade and gating when supplied> · <action>

**Finding:** <the finding as raised>                       [when supplied]

**Fails:** <rubric item, or none with its reason>           [when supplied]

**Action:** <proposed action and boundaries>

**Detail:** <source check and consequence>
```

Assign labels `F1`, `F2`, and onward in canonical decision order before sorting for display: blocking findings first,
then verified grade, unsupported findings last, then canonical source order. Keep a nit after other minor findings.
A label remains the same in the proposal, approved report, replay, open questions, and evidence for one set.
The labels replace no producer-native identity.

Where tags are supplied, display new-design fixes first within their grade, retaining each canonical label. A fix's
action is `FIX (new design)` or `FIX (local correction)`; other actions take no tag. Mark the tags as the agent's
advisory reading, never an approved judgment. Without tags, display the canonical order.

Grade is `🔴 critical`, `🟠 major`, or `🟡 minor`, with `nit` when supplied and `· record-only` when that standing
applies. An unsupported finding shows `—`. The table has no verdict column. Each section's status line mirrors its
row and adds `Confirmed` or `Not supported`, the reviewer's grade when different or unsupported, and gating where
supplied. The section's title names the finding; Finding states the claim before judgment, Fails names the rubric
anchor, Action gives the response and boundaries, and Detail gives the source check and consequence. Separate fields
with a blank line, and adjacent sections with a blank line, `---`, and another blank line.

Gather approval, open questions, the fix-check offer, and the successor recommendation in the one Decisions block
under the table, each with its recommendation. The caller supplies the loop reading after the findings. An approved
or replay report may use the reduced shape: a header naming the approved set, tagged table and sections, and no Fails,
Decisions, or loop reading. Omit missing source fields rather than invent them.

Hold each finding's locus and source-verification references outside the report. Give the evidence when asked,
using the same label and display order:

```markdown
**Evidence**
- F{ordinal} · <locus> · verified at <source-verification references>
```

Show the report as text where the approver reads it, never a file path, link, or summary in its place. A caller may
extend a status or evidence line with fields its source supplies.
