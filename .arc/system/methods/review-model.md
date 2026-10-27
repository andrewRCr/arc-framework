---
name: review-model
description: Shared pass, fix-check, convergence, and cadence model for agentic review
related:
  - planning-review
  - code-review
  - verification-review
  - adversarial-review
  - review-triage
  - review-response
override-active: false
---

# Method: review-model

> - **Workflow:** [planning-review](planning-review.md), [code-review](code-review.md),
>   [verification-review](verification-review.md), [adversarial-review][adversarial-review],
>   [review-triage][review-triage], and [review-response][review-response].
> - **When:** Running a pass, checking its fixes, or reading the resulting review loop.
>
> - **Contract:** Distinguish complete passes from fix-check rounds, keep approvals separate from recommendations,
>   and read convergence from the latest look's approved dispositions.

## review-model.override

[No override configured]

## review-model.default

### Review family

A site owns lifecycle, quality gates, and approval stops. It calls the review-type method at its review boundary;
the method selects checks and independent vehicles and returns evidence to the site. A check supplies a rubric or
criteria walk; where it runs determines independence. Evidence-only callers may invoke a check directly.

| Layer                     | Members                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sites                     | Planning stages and amendment capture; Errand, pre-publication, integration, and member review; work-unit and member verification boundaries                                                                                                                                                                                                                                                          |
| Review types              | [planning-review](planning-review.md), [code-review](code-review.md), [verification-review](verification-review.md)                                                                                                                                                                                                                                                                                   |
| Author checks and rubrics | [assess-draft-readiness](assess-draft-readiness.md), [assess-design-proportionality](assess-design-proportionality.md), [source-grounding](source-grounding.md), [spec-review](spec-review.md), [task-audit](task-audit.md), [design-audit](design-audit.md), [implementation-audit](implementation-audit.md), [validate-criteria](validate-criteria.md), [code-review-author](code-review-author.md) |
| Independent vehicles      | [adversarial-review](adversarial-review.md), [code-review-frontline](code-review-frontline.md) (advisory), [code-review-standard](code-review-standard.md) (satisfying)                                                                                                                                                                                                                               |
| Findings handling         | [review-triage](review-triage.md), [review-response](review-response.md), [disposition-report](disposition-report.md)                                                                                                                                                                                                                                                                                 |
| Routing and scope         | [classify-review-risk](classify-review-risk.md), [review-chunking](review-chunking.md)                                                                                                                                                                                                                                                                                                                |
| Moved-target judgment     | [assess-evidence-applicability](assess-evidence-applicability.md) at applicability stops, informed by its optional bounded check                                                                                                                                                                                                                                                                      |
| Shared model              | `review-model`: passes, fix checks, convergence, cadence, and trend readings                                                                                                                                                                                                                                                                                                                          |

[code-review-author](code-review-author.md) is code review's author check; [code-review](code-review.md#author-check)
owns its findings and approval procedure. Planning and verification can use the same independent vehicle without sharing
code review's lanes or stored operation records.

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

### Shared causes

A reviewer reports the instances it saw, and fixing each where it stands leaves the rest of its cause for later looks
to find one at a time. Before proposing dispositions, look across the verified findings for a shared cause: one rule,
decision, or module, or one earlier fix, behind two or more of them. Look too at any finding whose rule is implemented
in several places, since its siblings break the same way. Name the cause in each finding's rationale, and propose the
fix at the cause: every implementation of the rule, or one implementation in place of copies that diverge. A site
outside the reviewed change is named for the approver and routed as discovered work. Where no cause is shared, this
adds nothing.

### Convergence and permission

**Completeness** means every finding has an approved disposition, including unsupported findings. **Convergence**
means the latest look's approved set fixes no verified material finding: zero findings, minor-only findings, and
material findings deferred or rejected can converge. Fixing a verified major or critical finding withholds that look's
convergence. Performing its fixes does not retroactively change the result.

A cap alone never authorizes an invocation or settles a finding. A recommendation is not authorization.
Adversarial successor passes need explicit approval naming the activity and pass; code-review successors follow their
caller's disposition approvals and ceiling rules. Every fix-check round runs only with approval. Conditional successor
permission waits for complete response performance, including the offered fix check's resolution, and is consumed only
by its named complete-pass admission. A fix check neither spends nor inherits it.

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
new design reaches beyond a repair's locus, or a repair changed a rule that sites outside its fix range also
implement. Otherwise the response check verifies the rework where it stands. State a cost-and-signal rationale,
including at the cap, and obtain the separate approval before invoking a pass.

### Cadence and records

Planning artifacts are small enough for a complete pass each time. Large code changes use complete passes on their
policy's cadence with fix checks between. A full-final lane remains open after a clean fix check until a complete pass
closes it. Incremental closure requires the policy's proved chain. Human review follows agentic review out of band
and is never a pass.

Keep each family's records separate: adversarial review retains its `review/adversarial-pass` record; code review uses
its exact producer results, disposition sets, and lane progress. Shared vocabulary introduces no shared record or
approval authority.

### Trend

Once a lane has two or more looks, report its material trend: the critical and major findings at each look, each
complete pass followed by its fix checks (for example `Pass 1 of 3: 6 → 2`), or one line when no look found a critical
or major finding. Give one reading, and say in a sentence or two where the review stands and where what remains comes
from. Origins, tags, and change signals inform the reading and stay out of the report. Each reading points to a
decision:

- **`baseline`** — the first look has no trend yet; decide the fixes and their check from that look's own signal. A
  report shows no Trend for it.
- **`converging`** — material findings come from earlier folds, adjacent repair code, or siblings of a known defect
  class; counts fall or stay flat, and fixes are mostly local corrections. This supports stopping once fix checks
  converge.
- **`discovering`** — new material defect classes keep appearing in code or text earlier looks already read, rather
  than coming from folds. This supports another complete pass after fix checks. It takes precedence over `converging`
  wherever both readings fit.
- **`sustained non-convergence`** — most material findings originate in earlier new-design folds and need new design
  again. Stop for the Owner's decision: planning review offers the stage's re-entry or shaping route; code review asks
  whether the spec needs `amend-design`. Another round must not silently become design authoring.

A fix check reads its repairs, so a clean round shows those repairs hold, not that a rule repaired at one site holds at
its others. Material findings that are siblings an earlier repair missed show the repair fixed a site rather than its
rule: apply § Shared causes to that rule before reading the trend as `converging`.

Planning review derives the counts, origins, and tags from its pass record. In code review, keep the CLI's ordered
material trend separate from advisory interpretation: read the per-round change signals from `arc review lane read`
beside the tags each round's fixes carried and the tags being proposed. A tag forecasts what the proposed repair
implies; the signals describe what the performed round changed. Whether findings fall in an earlier fix range is the
agent's own reading. Neither a falling count nor a tag alone settles the trend reading, convergence, or authorization.

---

[adversarial-review]: adversarial-review.md
[review-triage]: review-triage.md
[review-response]: review-response.md
