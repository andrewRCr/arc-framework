---
name: review-triage
description: Source-verified severity and disposition contract for review findings
arc:
  methods:
    - review-model
    - disposition-report
related:
  - disposition-report
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

Apply [review-model][review-model] before running or assessing this review.

Process the complete finding set in three ordered legs.

### 1. Verify against source

Before verifying findings from a review lane, run `arc review lane read -`, deriving its request from
`arc review lane read --schema`. For a delivery member, supply its exact head as `memberHeadObjectId`. Follow a refusal's
remedy before continuing. Compare each new finding with the lineage's earlier rejections and check whether each
applicable rejection's reason still holds against current source. Keep the returned rejections, reasons, and earlier
verdicts in the primary agent's triage context; withhold them from the evaluator. Author self-review outside any lane
does not run this read.

Verify every finding against source using the primary agent's own judgment. Record whether the finding is valid and
the evidence that supports that decision. An invalid or misunderstood finding still receives an explicit `reject`
disposition with rationale.

For each valid finding, search the reviewed change for other instances of the same defect — the same missing check,
wrong assumption, or misused interface at another call site — before proposing its disposition. A reviewer reports the
instance it saw, and the rest otherwise surface one at a time across later passes. Name every instance in the finding's
`recommendation`, so the approved fix covers the defect rather than one site, and say in its `rationale` where the
search ran. An instance outside the reviewed change is not this round's fix: name it for the approver and route it as
discovered work.

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
`gating`, constructs the set, and returns `payload.proposal` with `payload.dispositionReportText` and
`payload.dispositionEvidenceText`. The returned `payload.proposal` does not repeat the input-only
`severityGatingPolicy`; its exact canonical finding gates and `policyVersion` are part of the approval binding.

Author each finding's narrative so the report stands without the raw review:

- `title` — the issue in a phrase; it names the finding in the decision table and heads its section.
- `issue` — the reviewer's claim in plain words, before any judgment of it.
- `recommendation` — the proposed action and its boundaries.
- `rationale` — the source check and consequence behind the verdict.
- `openQuestions` — what remains for the approver, when anything does.

The command renders `payload.dispositionReportText` and `payload.dispositionEvidenceText` in the
[disposition-report][disposition-report] shape. Emit the report verbatim unless a configured `disposition-report`
override replaces or extends presentation. Show it as text in your reply to the approver — never a file path, link, or
summary in its place — because approval binds to the report the approver read. Emit the evidence text verbatim when
the approver asks for it; its references are part of the canonical set the approval binds, and once approved the
durable disposition record holds them. A code-review report adds three things to the shared shape:

- a leading `**Verification:** <targeted | focused | full>` line naming the proposed scope;
- each finding's gating after its verdict — `<verdict> · <blocking or record-only>` — and `nit` after a `minor` grade
  that carries one;
- the producer source on each evidence line, between the locus and ARC's own verification references:

```markdown
- F{ordinal} · <locus> · <native label, when available> · source #{sourceOrdinal} · <originating reference> · verified at <ARC source-verification references>
```

The command orders findings blocking before record-only, then by ARC grade, with a nit after other minor findings and
unsupported findings last, keeping canonical order among equals. It retains producer-native labels, capture ordinals,
and references beside the report-local `F` labels, and escapes only the characters that would otherwise open inline
Markdown, plus `|` in a table cell.

For a findings proposal, present the CLI's `provisionalPassAssessment.summaryText` beside the verbatim disposition
report in the same turn. It is the pass line — the lane, confirmed-finding signal, and what approving a `FIX` does. The
standard lane shows `complete pass N of M` or `fix check, round N since pass M`; frontline retains its admitted pass and
configured ceiling. For the standard lane: the head moves, and the line names the fix check or complete pass the fixed
head then needs, or says the lane closes, another complete pass needs a ceiling decision, or review status at that head
decides. It states where review stands and is provisional until verified response and coverage resolve the next action.
Follow it with the agent's recommendation to stop or to request a named next pass, from the expected signal and cost.
Every decision the approver is asked to make carries that recommendation. When the pass line says a fix requires a fix
check or complete pass, the recommendation also covers that activity, as spend the approver may decline. A decline
leaves the disposition approval unchanged; the governing caller honors it at the new head through its Owner review stop
(an Errand's Owner-directed review stop, a work unit's Owner-accepted terminus), confirmed there once before any pass is
dispatched. Disposition approval and next-pass authorization stay distinct decisions, though one prompt may ask both:
the approver may approve the set and decline the pass. Disposition approval alone never overrides either lane's ceiling;
follow the typed policy continuation and obtain explicit approval for the named activity and pass if it returns
`approval-required / obtain-ceiling-override`.

Obtain complete-set approval over the report and canonical identity before the caller's second `arc review respond -`
invocation. Approval records the exact target, producer result, policy/rubric context, proposing actor, verification
scope, complete dispositions, approving actor, and approval time. Conversational approval need not recite the digest.
Any changed finding, judgment, scope, disposition, narrative, target, or newly surfaced mismatch requires a new
proposal and approval. A partial approval may never be widened, and no path may apply an individual fix early.

For a set with a `fix`, the complete-set approval is the fix round's structured gate ([DEV-RULES.ARC § Review-Increment
Invariant][review-increment-invariant]). Close the report with a prompt that names what approval releases under the
caller's `arc.commitInterlock` and `arc.pushInterlock` settings, and only that — for example `Approve: 3 fixes → verify
→ commit → push → settle 2 threads → local fix check, round 1 since pass 1?`. After the round, report the fix, its
commit, the settled threads, and the next pass as information, not a gate. The round returns to the approver when the
performed fix exceeds the approved scope, a verification or gate failure is not a deterministic same-concern correction,
host state is ambiguous, or a new finding arrives.

Author self-review remains a non-producer path. Identify its standalone report as author self-review and compose it in
the [disposition-report][disposition-report] shape, giving each verdict its gating as the command does. Omit rather than
fabricate a provider grade, native label, producer ordinal, source receipt, or producer-bound identity. Preserve an
initial/revised author grade distinction when one exists without implying a separate evaluator. Its governing caller
obtains complete-set approval directly and does not invoke the response command.

After approval, `review-response` performs the selected author leaf. Preserve every approved fate in the
audience-visible record supplied by the caller. For a producer-backed fix commit, its body records
`Review disposition set: <identity>` and summarizes each included finding as
`<identity>: <verified severity or not-supported> / <disposition> — <rationale>`; the approved set remains the
authority when a channel has a richer durable record. For author self-review, use the canonical `(code review)`
context footer from `self-review`; its report-local labels do not create a producer disposition-set identity.

---

[disposition-report]: disposition-report.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
[review-increment-invariant]: ../rules/DEV-RULES.ARC.md#review-increment-invariant

[review-model]: review-model.md
