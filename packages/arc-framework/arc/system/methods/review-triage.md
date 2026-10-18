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

> - **Workflow:** [code-review](code-review.md), including its non-producer author check.
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

Supply the separate `report` beside `proposal`: one `tags` entry per fix (`new-design` or `local-correction`),
one `fails` anchor per finding, the `successorRecommendation`, origin counts, and one of
[review-model's loop readings][loop-reading] with its rationale. Key tags and anchors by finding identity. Lift a
local reviewer's `Fails:` line from its referenced report; for a hosted source, supply the rubric anchor while
verifying it, as the agent's reading. Use the supplied rubric's item names, or `none` with a reason. These judgments
are advisory and outside the canonical set's identity. The approved call carries the same tags again; only those tags
are stored, as an immutable advisory note beside the set. Verified-fix and settlement replays read that note.

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

The command assigns stable `F` labels in canonical grade and gating order before ordering the display by fix tag.
Labels remain the same in the proposal, approved report, and replay. Tags forecast what a fix implies; they are the
agent's reading, never an approved judgment. Keep them distinct from observed fix-round signals. Producer-native
labels, capture ordinals, and references remain beside the report-local labels.

The report's provisional header names the lane's position and signal: standard `complete pass N of M` or `fix check,
round N since pass M`, with frontline's recorded pass and ceiling. When a fix moves the head, the line names the fix
check or complete pass the fixed head then needs. Its single Decisions block carries complete-set approval, open
questions, bounded offers, and the agent's successor recommendation. Supply a clear recommendation for each decision
from expected signal and cost, including at the ceiling. When the pass line says a fix requires a fix check or complete
pass, the recommendation also covers that activity, as spend the approver may decline. Emit the composed report without
adding a second pass line or Decisions block. The loop reading combines the CLI's trend with the agent's origin counts
and reading; it is advice, never admission or convergence evidence.

A fix check verifies repairs and a complete pass looks for what remains undiscovered. Recommend the fix check on the
approved fixes' merits, even when a complete pass follows. Converge the rounds before a successor complete pass;
`full-final` stays open after a clean fix check, while incremental closure requires the policy's proved chain.
Disposition approval and each next activity's authorization remain distinct, even when one prompt asks both. A decline
leaves the approved set unchanged; the governing caller honors the Owner's stop at the new head (an Errand's
Owner-directed review stop or a work unit's Owner-accepted terminus), confirmed there once before any pass is
dispatched. Follow `approval-required / obtain-ceiling-override` for a complete pass beyond the ceiling. Fix and delta
checks spend no complete-pass allowance and neither consume nor inherit a conditional complete-pass authorization.

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
[review-increment-invariant]: ../rules/DEV-RULES.ARC.md#review-increment-invariant

[review-model]: review-model.md

[loop-reading]: review-model.md#loop-reading
