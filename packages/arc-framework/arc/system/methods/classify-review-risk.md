---
name: classify-review-risk
description: Routine-or-sensitive call for one exact change set's review-risk routing fact
override-active: false
override-mode: extend
---

# Method: classify-review-risk

> - **Workflow:** [run-errand.md][run-errand], [prepare-work-unit.md][prepare-work-unit]
> - **When:** ALWAYS apply when composing review routing facts for an exact change set — wherever a review request
>   carries the risk fact; do not default it to `routine`.
>
> - **Contract:** Given one exact change set, return `routine` or `sensitive` for its review-risk routing fact,
>   with the criterion that decided it. The call is an author judgment the repository cannot read; this method is
>   its single home, and a project extends its criteria through the override.

## classify-review-risk.override

[No override configured]

## classify-review-risk.default

### What the call changes

Both answers are reviewed. `sensitive` makes standard review **required**, so an incomplete pass blocks the merge
gate, and re-reviews the complete change set after a fix. `routine` leaves the obligation to the other routing facts:
ordinary code still requires a standard pass, while atomic code and most documentation get a **recommended** one —
it runs by default but does not block merge when it does not complete — and fixes are re-reviewed incrementally. A
wrong `routine` call silently lowers the obligation; a wrong `sensitive` call spends one more review.

### Sensitive

Call the change `sensitive` when a defect in it could be destructive, authoritative, or irreversible — when it alters
the behavior of:

- **Trust and authority boundaries** — authentication, authorization, identity or ownership resolution, and the
  handling of input from outside the trust boundary: parsing, validation, command and path construction.
- **Admission controls** — whatever decides that work is admitted: review and merge gates, required checks,
  interlocks and approval gates, commit and push hooks, quality-gate selection, and the evidence those controls
  read. A defect here lets other defects through.
- **Secrets and credentials** — reading, storing, transmitting, logging, or redacting them.
- **Destructive or irreversible operations** — deletion, history rewrite, publication or release, external side
  effects that cannot be recalled, and the format or migration of persisted data.

Content kind does not exempt a change. Prose that instructs one of these behaviors — a workflow step that authorizes
a merge, a runbook that deletes data — is `sensitive` like the code that performs it.

### Routine

Everything else is `routine`, including, inside a listed area:

- a change whose preserved behavior is evident from the diff itself — a rename, a comment, formatting. A refactor
  whose equivalence takes reasoning to establish is `sensitive`.
- added or strengthened tests. Weakening or removing a test that guards a listed behavior is `sensitive`.

Planning artifacts that describe future work instruct nothing, so they are `routine`.

### What the call does not weigh

- **Size and difficulty.** A large mechanical sweep can be `routine`; a one-line change to a permission check is
  `sensitive`.
- **Where the change sits or who owns it.** A design-authority or constitutional surface, and a foreign, mixed, or
  unknown owner, each raise the obligation through their own routing facts. Do not count them again here.

### When unsure

Call it `sensitive`. The costs are asymmetric, and an absent or malformed risk fact already routes as `sensitive`.

Disclose a `routine` call on a change inside a listed area — name the area and why the change stays routine — where
the developer is already reading, so the lowered obligation stays visible.

---

[run-errand]: ../workflows/arc/supplemental/run-errand.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
