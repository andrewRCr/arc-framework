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
- optional code-review-only `verifiedNit: true` for pure-polish findings

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

For a producer-backed set, include the caller's effective severity-gating policy as
`proposal.severityGatingPolicy` in the first `arc review respond -` request, with one proposed verification scope —
`targeted | focused | full` — and the complete author-owned judgments. The scope is a recommendation until the
approver accepts the immutable set; it does not itself skip or narrow any verification. Return that request to the
governing caller. The command resolves the durable producer, applies the input policy to each finding's canonical
`gating`, constructs the set, and returns `payload.proposal` with `payload.dispositionReportText`. The returned
`payload.proposal` does not repeat the input-only `severityGatingPolicy`; its exact canonical finding gates and
`policyVersion` are part of the approval binding.

Author each finding's narrative so the report stands without the raw review:

- `title` — the issue in a phrase; it heads the finding and its index line.
- `issue` — the reviewer's claim in plain words, before any judgment of it.
- `recommendation` — the proposed action and its boundaries.
- `rationale` — the source check and consequence behind the verdict.
- `openQuestions` — what remains for the approver, when anything does.

Emit that returned report verbatim unless a configured `review-triage` override replaces or extends presentation.
When the set holds more than one finding, an index of their head lines precedes them. Its fixed per-finding field
order is:

```markdown
**Verification:** <targeted | focused | full>

- F{ordinal} · <ARC grade> · <FIX | DEFER | REJECT> — <title>   [one index line per finding, when more than one]

### F{ordinal} · <ARC grade, or not supported> · <FIX | DEFER | REJECT> — <title>
**Issue:** <the reviewer's claim>
**Verdict:** <Confirmed | Not supported> · reviewer graded <severity> [when it differs] · <blocking | record-only>
**Action:** <proposed action and boundaries>
**Detail:** <source check and consequence>
**Open questions:** <questions, when present>
**Source:** <locus> · <native label, when available> · source #{sourceOrdinal} · <originating reference>
**Verified at:** <ARC source-verification references, distinct from the producer source>
```

Severity grades display with their symbols: `🔴 critical`, `🟠 major`, and `🟡 minor` (plus `nit` when present).
Separate adjacent findings with a blank line, `---`, and another blank line. The command assigns report-local `F`
labels from canonical order while retaining producer-native labels, capture ordinals, and references, and escapes
only the characters that would otherwise open inline Markdown. A not-supported verdict always names the reviewer's
grade; a confirmed one names it only when it differs from ARC's.

For a findings proposal, present the CLI's `provisionalPassAssessment.summaryText` beside the verbatim disposition
report in the same turn. It is the pass line — the lane, admitted pass, configured ceiling, and confirmed-finding
signal — and states where review stands; it is provisional until verified response and coverage resolve the next
action. Follow it with the agent's recommendation to stop or to request a named next pass, from the expected signal
and cost. Every decision the approver is asked to make carries that recommendation. When the set includes a fix, the
recommendation also covers the pass the fix will trigger: the fix moves the head, and the routed standard obligation
then runs another pass there unless this one reached the ceiling. Name that pass — its number, and complete or
incremental coverage per the obligation's `retrigger` — as spend the approver may decline. A decline leaves the
disposition approval unchanged; the governing caller honors it at the new head through its Owner review stop (an
Errand's Owner-directed review stop, a work unit's Owner-accepted terminus), confirmed there once before any pass is
dispatched. Keep disposition approval separate from next-pass authorization. A disposition approval alone never grants
a pass above the ceiling; follow the typed policy continuation and obtain explicit approval for the named activity and
pass if it returns `approval-required / obtain-ceiling-override`.

Obtain complete-set approval over the report and canonical identity before the caller's second `arc review respond -`
invocation. Approval records the exact target, producer result, policy/rubric context, proposing actor, verification
scope, complete dispositions, approving actor, and approval time. Conversational approval need not recite the digest.
Any changed finding, judgment, scope, disposition, narrative, target, or newly surfaced mismatch requires a new
proposal and approval. A partial approval may never be widened, and no path may apply an individual fix early.

Author self-review remains a non-producer path. Identify its standalone report as author self-review and follow the
same per-finding order with report-local `F` labels and separators: the issue, ARC's verdict and severity, the action,
the detail, open questions, then locus and verification evidence. Omit rather than fabricate a provider grade, native
label, producer ordinal, source receipt, or producer-bound identity. Preserve an initial/revised author grade
distinction when one exists without implying a separate evaluator. Its governing caller obtains complete-set approval
directly and does not invoke the response command.

After approval, `review-response` performs the selected author leaf. Preserve every approved fate in the
audience-visible record supplied by the caller. For a producer-backed fix commit, its body records
`Review disposition set: <identity>` and summarizes each included finding as
`<identity>: <verified severity or not-supported> / <disposition> — <rationale>`; the approved set remains the
authority when a channel has a richer durable record. For author self-review, use the canonical `(code review)`
context footer from `self-review`; its report-local labels do not create a producer disposition-set identity.

---

[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
