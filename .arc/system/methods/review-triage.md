---
name: review-triage
description: Source-verified severity and disposition contract for review findings
override-active: false
---

# Method: review-triage

> - **Workflow:** [integrate-work-unit.md][integrate-work-unit]
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

For each verified finding record:

- severity: `blocker | major | minor`
- disposition: `fix | defer | reject`
- optional code-review-only `nit: true` for pure-polish findings

Severity measures materiality:

- `blocker` — correctness, safety, authority, or contract failure that independently prevents completion.
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
blocking | record-only`; the package default is `record-only`. Any unresolved `blocker` or `major` remains blocking.
Record-only triage does not override a carrier-native blocking state, required conversation, or host requirement.

### 3. Approve before mutation

Present the complete disposition set together: finding identity and stable locus, source-verification result,
severity, `nit` when present, proposed disposition, rationale, recommendation, and open questions. Obtain approval
for the complete disposition set before applying any `fix`. A partial approval, changed finding set, or changed
target requires a new proposal; no path may apply an individual fix early.

After approval, apply all authorized `fix` dispositions as one review-fix increment and verify the affected change.
`defer` and `reject` leave the target unchanged. Preserve every approved fate in the audience-visible disposition
record supplied by the caller.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
