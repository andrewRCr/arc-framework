---
name: disposition-report
description: Scannable presentation of a verified finding set, ending on what its approver decides
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
> - **Contract:** Present the complete verified set as one report the approver decides from: a header, a table when
>   there is more than one finding, one section per finding, then the trend and decisions that bear on what comes
>   next. Hold each finding's evidence out of the report and give it when the approver asks. Never fabricate a field
>   the finding's source does not supply.

## disposition-report.override

[No override configured]

## disposition-report.default

Render the report in this order. An optional element names its condition in brackets; leave it out when the
condition does not hold, and never render an element only to say it does not apply.

```markdown
**<review position>** · <verified grade counts, then any unsupported count>

| # | Grade | Finding | Action |                          [two or more findings]
|---|---|---|---|
| F{ordinal} | <verified grade, or —> | <title> | <FIX, DEFER, or REJECT, with a fix tag when supplied> |

### F{ordinal} — <title>

<verified grade, or —> · <action> · fails <rubric anchor>

**Finding:** <what is wrong and why it matters>               [when supplied]

**Action:** <proposed action and its boundaries>

**Detail:** <how the finding was verified>

**Trend:** <reading> — <its rationale>                       [two or more looks]
- <looks, origins, or a fired round signal>

**Decisions**                                               [something left to decide]
- <approval ask, or a decision with its recommendation>
- F{ordinal}: <open question>
```

**Header.** Bold the review position — `Pass 2 of 3`, `Fix check, round 1 since pass 2`, or the lane's own form —
then give each verified grade's finding count, most severe first, and the unsupported count, leaving out a zero count:
`**Pass 2 of 3** · 🟠 2 major · 🟡 1 minor · 1 not supported`. A reached limit or other stop reason joins the position.
Do not mark the result provisional or converged: every proposal is provisional, and its fixes show whether the look
converged.

**Labels and order.** Assign labels `F1`, `F2`, and onward in canonical decision order before sorting for display:
blocking findings first, then verified grade, unsupported findings last, then canonical source order. Keep a nit
after other minor findings. A label remains the same in the proposal, approved report, replay, open questions, and
evidence for one set. The labels replace no producer-native identity. Where tags are supplied, display new-design
fixes first within their grade, retaining each canonical label; without tags, display the canonical order.

**Table.** Render it only when the set has two or more findings; one finding's status line carries the same facts.
Grade is `🔴 critical`, `🟠 major`, or `🟡 minor`, with `nit` when supplied; an unsupported finding shows `—`. A fix's
action is `FIX (new design)` or `FIX (local correction)` where tags are supplied; other actions take no tag.

**Finding sections.** The status line mirrors the row — grade and action — and adds only what departs from a finding
confirmed at its reviewer's grade:

- after the grade, `Not supported · reviewer graded <grade>` for a refuted finding, or `reviewer graded <grade>` when
  verification changed the grade;
- last, `fails <anchor>`, naming the rubric item or success criterion the finding fails in the review's own terms. An
  anchor of `none` keeps its reason and drops `fails`.

Never add `Confirmed`, the finding's gating, or a note that a tag is advisory. Separate the fields with a blank line:
Finding states what is wrong and why it matters, Action gives the response and its boundaries, and Detail says how the
finding was verified — the source check, probe, or search behind the verdict. Separate adjacent sections with a blank
line, `---`, and another blank line.

**Trend.** Render it only when the lane has two or more looks; a first look has no trend. Lead with the
[review-model][review-model-trend] reading and its rationale, then give one bullet each for the looks and their
material counts, the findings' origins and new-design fixes, and any performed fix round whose observed change signal
fired.

**Decisions.** Render the block last, and only when something is left to decide: the caller's approval ask, the
decision a fix creates about the next pass, an offer, or a finding's open question. Give each its recommendation.

State each fact once. Do not repeat the header's counts, restate an ask, or label the agent's judgments as advisory.

An approved or replay report uses the reduced shape: a header naming the approved set and its verification scope, then
the tagged table and sections, with no rubric anchor, Trend, or Decisions. Omit missing source fields rather than
invent them.

Hold each finding's locus and source-verification references outside the report. Give the evidence when asked,
using the same label and display order:

```markdown
**Evidence**
- F{ordinal} · <locus> · verified at <source-verification references>
```

Show the report as text where the approver reads it, never a file path, link, or summary in its place. A caller may
extend a status or evidence line with fields its source supplies.

**Examples.** A first look with one finding has no table and no Trend:

```text
**Frontline pass 1 of 2** · 🟠 1 major

### F1 — Keep left and right delimiter alignment distinct

🟠 major · FIX (local correction) · fails Correctness and failure behavior

**Finding:** Removing every delimiter hyphen turns left-aligned `:---` and right-aligned `---:` cells into the same token, so opposing alignment edits merge silently instead of conflicting.

**Action:** Collapse each hyphen run to one hyphen, keeping colon positions, and add delimiter-only conflict regressions.

**Detail:** A delimiter-only probe with left and right alignment returns the current side with no conflict. No other delimiter normalization exists in the reviewed code.

**Decisions**
- Approve the complete disposition set with focused verification?
- After the fix: frontline pass 2 of 2. Recommended: the fix changes merge semantics, so check it before standard review.
```

A later round with two findings adds the table and the Trend:

```text
**Fix check, round 1 since pass 2** · 🟠 1 major · 🟡 1 minor

| # | Grade | Finding | Action |
|---|---|---|---|
| F1 | 🟠 major | Retry skips the lock it was meant to hold | FIX (local correction) |
| F2 | 🟡 minor | Remedy names a removed flag | FIX (local correction) |

### F1 — Retry skips the lock it was meant to hold

🟠 major · FIX (local correction) · fails Correctness and failure behavior

**Finding:** The round-one retry re-reads the record outside the lock, so two writers can both pass the version check.

**Action:** Move the re-read inside the locked section and add a two-writer regression.

**Detail:** Traced both call paths; the second writer's check runs against the pre-lock read.

---

### F2 — Remedy names a removed flag

🟡 minor · FIX (local correction) · fails Coherence and maintainability

**Finding:** The refusal tells the operator to pass `--force-retry`, which no longer exists, so the remedy cannot be followed.

**Action:** Name the current flag in the remedy text.

**Detail:** The flag was removed with the retry rewrite; the parser rejects it.

**Trend:** converging — both findings sit in the round-one repair, and no new defect class appeared.
- Looks: complete pass 1 of 3: 4 material → complete pass 2 of 3: 2 material → fix check, round 1 since pass 2: 1 material (provisional)
- Origins: earlier fixes 2 findings, 0 new-design fixes

**Decisions**
- Approve the complete disposition set with focused verification?
- After the fix: fix check, round 2 since pass 2, where its chain is proven. Recommended: the repair is local, and a fix check costs little.
- F2: Should the remedy also name the configuration key?
```

---

[review-model-trend]: review-model.md#trend
