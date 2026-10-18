---
name: review-model
description: Shared pass, fix-check, convergence, and cadence model for agentic review
related:
  - adversarial-review
  - review-triage
  - review-response
override-active: false
---

# Method: review-model

> - **Workflow:** Called through [adversarial-review][adversarial-review], [review-triage][review-triage], and
>   [review-response][review-response] where a review runs.
> - **When:** Running a pass, checking its fixes, or reading the resulting review loop.
>
> - **Contract:** Distinguish complete passes from fix-check rounds, keep approvals separate from recommendations,
>   and read convergence from the latest look's approved dispositions.

## review-model.override

[No override configured]

## review-model.default

### Passes and fix checks

A **complete pass** searches the whole exact subject against its complete rubric, including defects earlier looks
have not found. A **fix check** attacks approved repairs for closure, grounding, propagation, and new failure, reading
the whole subject for context. A **delta check** covers an eligible ordinary change range. Neither incremental look
is a complete pass. A following complete pass never replaces a fix check.

Number complete passes against their cap or ceiling. Number fix checks as rounds since their complete pass. Code
review's `logicalPass` numbers every attempt for identity and approval binding; it is not the complete-pass count.
A pending or failed invocation spends no completed pass. A complete aggregate invocation counts once, regardless of
its partition count. Standard review counts only completed complete-coverage looks against its ceiling; frontline
retains its own completed-pass accounting.

A **fold** is a change made to a reviewed artifact before the next look: an approved repair, a grounding correction,
or another approved change. Fix checks inspect those changes. Each round checks the previous round's repairs;
rounds run outside the complete-pass cap and have no round cap.

### Convergence and permission

**Completeness** means every finding has an approved disposition, including unsupported findings. **Convergence**
means the latest look's approved set fixes no verified material finding: zero findings, minor-only findings, and
material findings deferred or rejected can converge. Fixing a verified major or critical finding withholds that look's
convergence. Performing its fixes does not retroactively change the result.

A cap bounds autonomy, never authorizes an invocation or settles a finding. A recommendation is not authorization.
Every successor pass needs explicit approval naming the activity and pass; every fix-check round runs only with
approval. Conditional successor permission waits for complete response performance, including the offered fix check's
resolution, and is consumed only by its named complete-pass admission. A fix check neither spends nor inherits it.

Recommend a fix check, and another round, whenever the last look's approved fixes include a material one. Decline only
on the fixes' own merits: minor-only repairs, or an accepted re-entry or pending rewrite that will supersede them.
A following pass, approved or under the cap, is never a reason to decline. Where the subject requires a successor after
any fix, run the look that its policy names. Converge the rounds before launching the successor pass; the re-inspection
test decides whether a complete pass follows, never whether it replaces them.

### Tags and the re-inspection test

A fix's tag describes what it implies: **local correction** corrects an existing decision where it stands;
**new design** adds a concept, rule, type, field, or decision beyond the finding's locus. Tags guide proportionality,
display order, and recommendations; severity still decides materiality. In code review tags are advisory notes outside
the approved set's identity. Planning review retains its tagged folds in its own pass record.

Recommend another complete pass when the changes make the last complete assessment cease to hold, especially when
new design reaches beyond a repair's locus. Otherwise the response check verifies the rework where it stands.
State a cost-and-signal rationale, including at the cap, and obtain the separate approval before invoking a pass.

### Cadence and records

Planning artifacts are small enough for a complete pass each time. Large code changes use complete passes on their
policy's cadence with fix checks between. A full-final lane remains open after a clean fix check until a complete pass
closes it. Incremental closure requires the policy's proved chain. Human review follows agentic review out of band
and is never a pass.

Keep each family's records separate: adversarial review retains its `review/adversarial-pass` record; code review uses
its exact producer results, disposition sets, and lane progress. Shared vocabulary introduces no shared record or
approval authority.

### Loop reading

Report the material trend across passes and rounds, finding origins, and new-design fixes. Give one advisory reading
with its rationale and the next decision it suggests: `baseline`, `converging`, `discovering`, or `sustained
non-convergence`. Discovery takes precedence over convergence; sustained new design calls for the Owner's shaping
or amendment decision rather than another round of design through fixes.

---

[adversarial-review]: adversarial-review.md
[review-triage]: review-triage.md
[review-response]: review-response.md
