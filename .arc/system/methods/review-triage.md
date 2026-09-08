---
name: review-triage
description: Source-verified severity and disposition contract for review findings
override-active: false
---

# Method: review-triage

> - **Workflow:** [prepare-work-unit.md][prepare-work-unit], [integrate-work-unit.md][integrate-work-unit]
> - **When:** Agent processes findings from any code review
>
> - **Contract:** For every finding, verify it independently against source, record severity and disposition, and
>   include it in one complete disposition set. Present that set for approval before any fix or other mutation.
>   Findings are never accepted, ignored, or applied solely on reviewer authority.

## review-triage.override

[No override configured]

## review-triage.default

Process the complete finding set in three ordered legs.

### 1. Verify against source

Verify every finding against source using the primary agent's own judgment. Record whether the finding is valid and
the evidence that supports that decision. An invalid or misunderstood finding still receives an explicit `reject`
disposition with rationale.

### 2. Classify two independent axes

For each finding record the reviewer's reported severity and the primary-owned effective severity. When they
match, store and render one unqualified severity; when they differ, retain both and label them. Effective severity
controls gating. A `not-supported` verification records the reported severity plus the rejection rather than
inventing an effective grade.

Record the applicable grade shape:

- matching verified grades — severity: `critical | major | minor`
- different verified grades — `reviewerSeverity` and `arcSeverity`
- unsupported finding — `reviewerSeverity` and `sourceVerification: not-supported`

Then record:

- disposition: `fix | defer | reject`
- optional code-review-only `nit: true` for pure-polish findings

Severity measures materiality:

- `critical` — correctness, safety, authority, or contract failure that independently prevents completion.
- `major` — substantive correctness, coherence, compatibility, or verification gap that must settle before
  completion unless an explicitly approved durable deferral applies.
- `minor` — low-materiality defect or improvement that does not independently invalidate the change.

Disposition records the approved action:

- `fix` — correct it in the current bounded review-fix increment.
- `defer` — leave the target unchanged and record the authorized durable destination and rationale.
- `reject` — leave the target unchanged because the finding is invalid, conflicts with governing standards, or is
  outside the reviewed change's responsibility.

`nit` is valid only with `minor`. It is neither a severity nor a disposition, and the finding still requires one of
`fix | defer | reject`. A nit always resolves as record-only. Other minor findings follow effective `minorGating:
blocking | record-only`; the package default is `record-only`. Any unresolved `critical` or `major` remains blocking.
Record-only triage does not override a carrier-native blocking state, required conversation, or host requirement.

### 3. Approve before mutation

Present the complete disposition set together: finding identity and stable locus, source-verification result,
severity, `nit` when present, proposed disposition, rationale, recommendation, and open questions. Render
`Severity: major` when reviewer and effective grades agree; render both labels, for example
`Severity: Reviewer critical · ARC major`, only when they differ. For a rejected unsupported finding, render the
reported grade and `ARC not-supported`.

Obtain approval for the complete disposition set before applying any `fix`. Materialize the canonical set before
the normal approval prompt and show its identity with the content; the approver approves the surfaced content and
does not have to repeat its digest. The approval record binds that digest afterward. When the developer clearly
approves a complete set before deterministic materialization, the approval may bind the resulting identity only if
materialization is semantically unchanged and reveals no discrepancy. Any changed finding, grade, disposition,
rationale, target, policy, or newly surfaced mismatch requires a new proposal and approval. A partial approval may
never be widened, and no path may apply an individual fix early.

Use one channel-neutral report with this field order for every finding:

```text
Finding: <identity> · <stable locus>
Verified: <verified | not-supported> · <source evidence>
Severity: <unqualified grade when equal | Reviewer grade · ARC grade when different | Reviewer grade · ARC not-supported> [· nit]
Disposition: <fix | defer | reject> · <blocking | record-only>
Rationale: <why this fate follows from source and governing standards>
Recommendation: <recommended action>
Open questions: <questions or none>
```

The proposal record binds the exact target, policy and rubric identities, proposing actor, and the complete ordered
finding set into one disposition-set identity. Approval records that identity, the approving actor, and approval
time; conversational approval need not recite the digest. Do not begin a fix from ambiguous assent, a subset, or a
report whose target or contents changed.

After approval, apply all authorized `fix` dispositions as one review-fix increment and verify the affected change.
`defer` and `reject` leave the target unchanged. Preserve every approved fate in the audience-visible disposition
record supplied by the caller. When a fix produces a commit, its body records `Review disposition set: <identity>`
and summarizes each included finding as `<identity>: <severity> / <disposition> — <rationale>`; the approved set
remains the authority when a channel has a richer durable record.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
