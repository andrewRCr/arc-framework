---
name: review-triage
description: Source-verified severity and disposition contract for review findings
override-active: false
---

# Method: review-triage

> - **Workflow:** [prepare-work-unit.md][prepare-work-unit], [integrate-work-unit.md][integrate-work-unit],
>   [verify-work-unit.md][verify-work-unit], [deliver-stack.md][deliver-stack], [run-errand.md][run-errand]
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

For each producer-backed finding, retain the producer's observation separately from ARC's source-verified judgment.
The response command copies `reportedSeverity` and optional `reportedNit` from the durable producer; callers supply
neither. Triage supplies `sourceVerification`, explicit nullable `verifiedSeverity`, optional `verifiedNit`, and the
verification references. `not-supported` requires `verifiedSeverity: null` and a `reject` disposition rather than an
invented ARC grade.

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

`reportedNit` and `verifiedNit` are legal only with their respective `minor` grades. Neither is a severity or a
disposition. A verified nit is always record-only. Other verified minor findings follow `minorGating: blocking |
record-only`; the package default is `record-only`. Any unresolved verified `critical` or `major` remains blocking.
Unsupported findings are record-only regardless of the reported grade. Record-only triage does not override a
carrier-native blocking state, required conversation, or host requirement.

### 3. Materialize and approve before mutation

For a producer-backed set, include one proposed verification scope — `targeted | focused | full` — beside the
complete author-owned judgments. This is a recommendation until the approver accepts the immutable set; it does not
itself skip or narrow any verification. Return the proposal input to the governing caller for the first
`arc review respond -` invocation. The command resolves the durable producer, constructs the canonical set, and
returns its default `payload.dispositionReportText`.

Emit that returned report verbatim unless a configured `review-triage` override replaces or extends presentation.
Its fixed set-level and per-finding field order is:

```text
Verification: <targeted | focused | full>

Finding F{ordinal}: <standalone account of the claim, stable locus, source evidence, and consequence>
Source: <native label when available> · source #{sourceOrdinal} · <originating reference>
Assessment: <CONFIRMED | NOT SUPPORTED> · <verified severity | no ARC severity> (ARC) · <reported severity> (reviewer)
Recommendation: <FIX | DEFER | REJECT> [<blocking | record-only>] — <complete proposed action and boundaries>
Open questions: <questions, when present>
```

Separate adjacent findings with `---`. The command assigns report-local `F` labels from canonical order while
retaining producer-native labels, capture ordinals, and references. ARC assessment appears before reviewer severity;
the author-owned rationale and recommendation must make each account understandable without the raw review.

Obtain complete-set approval over the report and canonical identity before the caller's second `arc review respond -`
invocation. Approval records the exact target, producer result, policy/rubric context, proposing actor, verification
scope, complete dispositions, approving actor, and approval time. Conversational approval need not recite the digest.
Any changed finding, judgment, scope, disposition, narrative, target, or newly surfaced mismatch requires a new
proposal and approval. A partial approval may never be widened, and no path may apply an individual fix early.

Author self-review remains a non-producer path. Identify its standalone report as author self-review, use report-local
`F` labels and separators, and include the claim, locus, verification evidence, ARC severity, disposition/action, and
open questions. Omit rather than fabricate a provider grade, native label, producer ordinal, source receipt, or
producer-bound identity. Preserve an initial/revised author grade distinction when one exists without implying a
separate evaluator. Its governing caller obtains complete-set approval directly and does not invoke the response
command.

After approval, `review-response` performs the selected author leaf. Preserve every approved fate in the
audience-visible record supplied by the caller. When a fix produces a commit, its body records
`Review disposition set: <identity>` and summarizes each included finding as
`<identity>: <verified severity or not-supported> / <disposition> — <rationale>`; the approved set remains the
authority when a channel has a richer durable record.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
