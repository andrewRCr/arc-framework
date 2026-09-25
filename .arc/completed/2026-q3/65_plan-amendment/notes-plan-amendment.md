# Notes: plan-amendment

## Contents

- [Precedent survey](#precedent-survey--why-the-record-is-edit-in-place-plus-a-log)
- [Adversarial-pass history](#adversarial-pass-history)
- [Forward-compat check detail](#forward-compat-check-detail-2026-09-11)
- [A1 — the always-loaded footprint claim](#a1--the-always-loaded-footprint-claim)

## Precedent survey — why the record is edit-in-place plus a log

Precedent splits by document type. Documents that steer active builders — Kubernetes KEPs, Oxide RFDs, Python PEPs
before Final — are edited **in place** and carry a terse dated log (KEP Implementation History, PEP Change History)
so "what was true when" is recoverable without duplicating the document; reasoning lives in the review discussion
and git. Documents that preserve rationale — ADRs, accepted Rust RFCs — are immutable and superseded. Google's
design-doc essay names the failure of the middle path: the rule is edit in place before ship, practice degrades to
addenda, and the result is a constitution with amendments that costs readers archaeology. The archived
`delivery-native-stack-composition` spec is that failure in this corpus, and `evidence-applicability`'s spec was
growing inline amended-after-review paragraphs in its body before activation.

ARC's spec is both types and the corpus had already split it by section: Non-Goals frozen with append lines, Success
Criteria immutable and digest-bound, and the design body the thing tasks derive from and verification opens as the
upstream design. Implementation starting makes the body more of a builders' document, not less — hence D5's split:
body revises in place, frozen surfaces cross-reference the row, the log carries history, and reasoning beyond a few
lines lands here.

Change-control traditions consulted for the gate: IETF errata versus a bis document, EIA-649 Class II versus Class
I, PRINCE2's tolerance breach as the escalation trigger — each puts a cheap classification before impact analysis so
small changes never trigger a full re-plan. The arms map onto `strategy-adr-methodology`'s correction / amendment /
supersession tiers, with the identity break as the supersession analogue. Closure follows the TDD regression idiom
and ECO verification practice (a change closes only when verified against the originating gap); the propagation
sweep follows traceability-based change impact analysis (Bohner and Arnold).

## Adversarial-pass history

Four fresh-context passes shaped the design: three at draft readiness (one past the `Heavy` cap by deliberate
extension, because pass two's second-order rate — four of nine findings were breaks introduced by pass one's
repairs — was itself the evidence) and one at spec finalization. Every finding was verified against source before
disposition; the withstood lists are as valuable as the findings when a later amendment re-attacks this design.

### Draft pass one (2026-09-10) — seven findings

The task-arm commit shape contradicted the capture rule (D9 scopes the pre-corrective commit to the spec-changing
arms); the decision tree's first step was not exclusive of the next two (D2 is keyed to outcomes, with the
coarse-coverage rule); the cursor never looks beneath a completed parent, so `X.Y.R` under a `[x]` task broke
recovery (D6's `X.R` default, `_Amended in:_`, marker reversal retired); the delta did not compose with the terminal
carry (D8's effective report); closure was undefined at sites with no detecting check (D8's forward pointer); the
segment site's stop was asserted rather than authored (D1 authors it); the ceiling was silent on landed-but-invalid
code (D4). Withstood: the segmentation-scan claims, the R-scheme ids, the delivery classifier and reopen contracts,
the row grammar against lint, every `evidence-applicability` citation, the `Class` ratchet's authority,
proportionality.

### Draft pass two (2026-09-10) — nine findings plus a delivery-plan sweep

Two blockers: the default `X.R` placement was unsatisfiable under a bound plan (placement yields to member
immutability); the criterion-exists inference routed settled-decision reversals to the unprompted task arm (step
2's qualifying clause moved into its bold condition). Seven majors: the assurance rubric had dropped
`assess-design-proportionality`; the task arm's "nothing in the spec changes" contradicted the mandatory row; a
flat revalidation rule held at one of five sites; nothing told the criteria walk how to find deltas, and the verdict
vocabulary could not express `[~]`; the `arc reopen` clause named an anchor the CLI refuses; a second amendment in
one phase had no id; the sweep looked only forward. The pass's reordering of the tree was rejected (the clause move
sufficed) and its revision-phase evidence for the id gap was narrower than reported. A follow-on sweep of the bound
delivery surface found design-element digests bound silently, seams absent, an open authoring snapshot invalidated
by a corrective parent, and `replacement-required`'s stack-wide cost unpriced — folded into D5 and D10.

### Draft pass three (2026-09-11) — ten findings

Four majors, three of them second-order breaks in the bound-delivery surface pass two opened: the member-site
closure was masked (the loop re-runs the member walk at the last assigned task, so the still-open verifier would
produce the second full report the delta forbids); the "mechanical" ceiling trigger was vacuous (the classifier
refuses only landed members and the terminal lands last, so an admissible home always exists before merge); an
appended criterion's group was undefined under a bound plan (a criterion appended to a closed member's group never
resolves); a corrective parent could execute before its plan revision landed (execution-mode entry inspection passes
an uncovered open task through as ordinary work). Minors: `arc reopen` refuses a coherently bound delivery; a yielded
parent's id and position; author-supplied element digests versus CLI-derived Goal digests; three substrate slips;
`reopen-work-unit`'s `X.Y.R` example. Withstood: the classifier's refusal shapes, contiguity, seam guards,
`_Amended in:_` digest safety, cursor selection, the reopen anchor rule, R-scheme parsing, the segmentation scan.

### Spec pass one (2026-09-11) — ten findings

Three majors: the review site had no closure row, row form, or placement for the ordinary non-withdrawn case (D8's
review row and `review-fix` work form; D2's rule that only spec-changing findings write a row, since the review
lane's digest-bound record already carries ordinary fixes and there is no revision work to point at); the no-re-walk
rule, re-keyed from the log to a task-local fact for forward-compat reasons, would have swallowed the shipped
`Fix now` and `defer` answers (all three answers now route through the gate mapped to arms, so every route
produces a delta and the key is sound — this retires fixing inside the verifier's own increment, which the
evidence-sink rule already forbade); D6 fired `resolve-plan-segmentation`, the extraction trigger the segmentation
work recorded, without shipping the extraction (D12 extracts it). Minors: `arc finalize create-spec --class` already
performs the `Class` write with no lifecycle guard; a Goal rewrite is refused only for landed members; the row
grammar's token sets were open; `_Amended in:_` needed one bullet shape; the `— Dn` recommendation's home; the brief
form's log shape; which sync mechanism covers Configurable methods. Withstood: every CLI and contract claim in D6,
D8, D10; the draft-to-spec carry; proportionality.

## Forward-compat check detail (2026-09-11)

Checked against the procedure-evolution and knowledge-evolution check-docs and the `composable-workflows` draft.
Principle-level results the spec summarizes in one paragraph; the residues worth remembering at task generation:

- **Prose never evaluates state.** The one hit was the original no-re-walk key (an open log row's `_Work:_` in this
  member); re-keyed to the closing task's preserved report. The decision tree, depth read, and sweep are judgment
  over the record, which is the prose layer's legitimate content.
- **Verbs over mechanics.** The `Class` ratchet uses `arc finalize create-spec --class`, whose fire-point name is
  borrowed; an `amend-design` fire-point on that verb is a capture, not a build.
- **Schemas generated, one source.** The row grammar is defined once in the workflow; templates carry a placeholder
  row only.
- **Emitted text precomposed.** The segment-site stop line is a prose template by necessity — nothing observes a
  segment-verifier failure today, so there is no slot to precompose from. When one exists, the line becomes a
  `render`.
- **Loops don't compile agendas.** The four directive lines stay in the resident loop core (stops are constraints);
  the procedure is the event-handler fragment loaded at its trigger. `amend-design` passes the procedural-fragment
  test (inputs and an outcome) with five consumers, so it lifts as a public method-shaped fragment.
- **Directive firing conditions.** The skill description names its trigger and the default it suppresses; audit
  route-onward lines carry the specificity rule.

## A1 — the always-loaded footprint claim

Superseded text, § Cross-cutting Considerations ¶Forward compatibility:

> No new invariant is placed and no always-loaded content grows.

The rule-coherence edit at `6b70c6d4f` rewrote `DEV-RULES.ARC` § Method and extension loading, replacing "callers
never redeclare those dependencies" with "Declare what your own body fires, never what you would carry only on a
declared method's behalf" — one net line of always-loaded content, which the claim above ruled out.

**Amended rather than reverted.** The categorical form is what made the edit necessary: this work unit's own
workflow declares `adversarial-review` directly as well as through `validate-criteria`, and against a categorical
always-loaded rule that reads as a violation no matter what the strategy says. Reverting would leave the shipped
surface self-contradicting on the first artifact the work unit produces. The footprint claim was the cheaper thing
to give up, and giving it up is visible rather than silent.

D11 ¶final is deliberately **not** superseded. Its claim is narrower — no brief vocabulary entry, and no growth in
the always-loaded _set_ — and neither a new always-loaded document nor a new section was added. The propagation
sweep recorded it as checked.
