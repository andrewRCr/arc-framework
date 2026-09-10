# Draft: plan-amendment — a standardized mid-implementation amendment procedure

- **Origin:** [internal] — minted 2026-08-24 from a session-init discussion of recurring mid-implementation
  verification gaps, alongside the same-day regrounding of `plan-segmentation`; regrounded 2026-09-10 against that
  work unit's shipped contracts and the archived `delivery-native-stack-composition` evidence.
- **Purpose:** Give ARC one procedure for the moment implementation evidence shows the plan record — task list,
  spec depth, or a settled design decision — cannot generate the work that is needed: enter from wherever the
  evidence surfaced, triage by the planning cut ARC already makes, record the amendment once, anchor the revision
  work away from the verifier that found it, sweep only the amendment's footprint, and close by re-running the
  check that opened it. Composed from existing mechanism rather than new machinery; cheap enough that nobody
  hand-rolls the detour, bounded enough that it never re-runs the planning workflows.

---

## Readiness

**State:** `maturing` — scope is known and the fundamentals are settled (2026-09-10 consolidation); the open items
below are naming, one vocabulary confirmation, and detail-design the spec resolves.

**Resolved (2026-09-10):** entry shape (responsive only; audit doors kept as detection); triage as the execution-time
instance of the existing planning cut, with extraction as the escape hatch; the three-way amendment record
(spec log, notes reasoning, task-list revision work); revision placement and monotonic recovery across a failed
segment verifier, a cross-member correction, and a review finding that reopens design; delta-only revalidation;
closure composed with the project's gate-selection rule and `evidence-applicability`'s scope vocabulary; no
lifecycle state and no meta field for the detour; one capture commit before corrective work; the three inbox
captures and both inbound-buffer concerns adopted; forward-compat self-checks run against the procedure,
knowledge, and composable-workflows check-docs; `Class` read as `Heavy`.

**Open:** the workflow and skill-door names; confirming the per-criterion reuse of `carries | supplemental | fresh`
with `evidence-applicability`; the exact log-row grammar; whether Non-Goals amendment lines carry the log id.

**Next:** settle naming and the row grammar, run `assess-draft-readiness`, offer the `Heavy` adversarial pass,
capture the draft and persist `Class`.

## Problem / Motivation

Mid-implementation plan gaps happen. `plan-segmentation` (shipped 2026-09-09) makes them rarer and surfaces them
earlier; this work unit makes the residue cheap and reliable when they happen anyway. The corpus now asserts the
_what_ from several directions and lacks the _how_:

- `plan-segmentation` D5 defines every verifier — segment, member, and terminal — as an **evidence sink** that never
  hosts corrective work, and explicitly routes the question "where does a failed exit criterion's correction land"
  to this work unit. `design-audit` names **mid-impl** as its escalation point and promises that a confirmed break
  "routes back into the design loop, not around it via downstream patches." Nothing defines what that routing is,
  operationally, from inside an execution session.
- Detection is now distributed across five sites, none of which owns the correction: the segment verifier (gated by
  the task interlock), the member verifier (`validate-criteria` at member scope, whose unresolved branch already ends
  in `Fix now or amend/defer?`), terminal verification (an unmet criterion stops the work unit), a review finding
  that implicates the plan, and the task loop's own must-stop on an unanticipated design decision. The archived
  delivery task list shows the loop also fires after terminal verification: its terminal task became a
  seventeen-entry correction ledger during delivery and integration.
- The same archived work unit is the corpus instance of every failure this procedure must prevent. Of 187 `.R`
  re-entry subtasks, nearly all hang off verifier tasks, nested four levels deep, so three verifiers hold most of a
  5,419-line file while the implementation tasks whose behavior changed stayed tidy and misdescribe the member. It
  carries 57 full criteria reports, one member's slice recorded sixteen times, mostly for criteria whose evidence had
  not changed. And it carries three overlapping amendment trails with no linkage — inline `Amended` blocks in the
  spec, a numbered decision record in the notes, and forward-amendment paragraphs in the task list — with the notes
  ledger becoming the de facto record because the spec's inline blocks could not carry the reasoning.

Every occurrence improvises how to record the amendment, where revision work goes, and what must be re-checked
before resuming. The cost is not only efficiency: an unstandardized detour leaves no durable amendment trail, no
assurance the fix did not strand debt in later phases, and no consistent shape for a fresh session to resume
through.

## Direction (settled)

### 1. One responsive procedure, entered from the sites that detect

A supplemental workflow (working name `amend-plan`; see § Unknowns) owns the detour start to finish. It is
**responsive only**: entry presupposes a finding, and "the plan holds, the finding was the implementation's" is a
legal triage exit, so entering commits to a proposal, never to a change. The five detection sites reference it as
their correction route with directive lines — enter it when a verifier reports an unmet criterion, a task cannot
complete as written, or a finding implicates the plan; do not patch inline and do not nest revision work under the
verifier. A small skill door covers ad-hoc entry, the common case of a developer saying mid-session that a task or
decision is wrong.

The standalone audit doors are kept as **detection**, not absorbed. `arc-task-audit` and `arc-design-audit` are
read-only rubric doors that end at findings; their route-onward now names this procedure instead of each other.
No tradition surveyed fuses audit with change control — audits detect, change control corrects — and
`planning-iteration-mechanics` still targets the task-audit door.

The workflow is authored method-shaped from the start — a one-line signature
(`amend-plan(finding, plan record) → amended record + revision work | plan holds | escalate`), a bounded spine, the
three triage arms as one-line gates with their sections beneath, stable section anchors for the sites that
reference it — because it is exactly the event-handler sub-protocol the loop model in `draft-composable-workflows.md`
describes, and it lifts into a shared fragment with no rewording. Its interlock stays inside it as a constraint.

### 2. Triage is the planning cut, applied at execution time

ARC already makes a three-way cut at task generation: fold a finding into the task list, propagate a wrong mechanism
to the spec **in place** (the decision holds, its statement was wrong or too shallow), or fire the **re-entry valve**
when design must be authored (`resolve-planning-depth` § Mid-stage re-entry; `generate-tasks` § Grounding audit).
The mid-implementation triage is the same cut with the same vocabulary, keyed to the derivation chain
intent → design → tasks → code and asking which artifact must change:

1. **Task gap** — the settled spec text could have generated the missing work; the task list missed it (unwired
   production callers, modules built but unreachable). Revision work only.
2. **Spec-depth gap** — the spec states _what_ but not deep enough on _how_; the decisions hold. In-place
   elaboration of the spec plus the revision work it induces; no design re-litigation.
3. **Design gap** — a settled decision is wrong or missing. Narrowed elicitation to settle the fix, then the spec
   amendment, then revision work. `design-audit` is the rubric; this procedure is its named mid-impl caller.

Each arm strictly contains the previous arm's tail, so this is one procedure with three entry depths. The mechanical
test: could the existing settled spec text have generated the missing work? Yes → task gap; no, but the decisions
hold → spec-depth gap; no, and a decision is implicated → design gap. Two boundary rules complete it:

- **The amendment target is a settled statement.** An amendment names the exact spec statement it supersedes. Still
  unsettled planning — an open question, a provisional segment, a sibling's in-flight design — is ordinary planning
  input, never an amendment target, so amendment structure cannot bind to something that was not yet a contract.
- **The escape hatch is extraction.** An amendment that invalidates the work unit's identity or a deliverable
  boundary exceeds the detour's authority. `decomposition-doctrine`'s keystone names the line — a design cut
  re-opens what the thing _is_, a delivery cut only how it lands — and the shipped `decompose-extraction` arm is the
  mechanism. Escalate out; never absorb silently.

Review findings enter triage like any other evidence: `integrate-work-unit`'s finding loop hands a finding that
implicates the plan to this procedure rather than patching around it, and the three-depth test is the authoritative
answer to "does this correction re-enter design", so no finding becomes a planning restart by default. Externally,
every mature change-control tradition puts a cheap classification gate before impact analysis — IETF errata versus
a bis document, EIA-649 Class II versus Class I, PRINCE2's tolerance breach as the escalation trigger — precisely so
small changes never trigger a full re-plan. The three arms and the hatch map onto `strategy-adr-methodology`'s
tiers: correction, amendment, and supersession, with the identity break as the supersession analogue.

### 3. The amendment record is one identity with three projections

Precedent splits by document type. Documents that steer active builders — Kubernetes KEPs, Oxide RFDs, Python PEPs
before Final — are edited **in place** and carry a terse dated log (KEP Implementation History, PEP Change History)
so "what was true when" is recoverable without duplicating the document; reasoning lives in the review discussion
and git. Documents that preserve rationale — ADRs, accepted Rust RFCs — are immutable and superseded. Google's
design-doc essay names the failure of the middle path: the rule is edit in place before ship, practice degrades to
addenda, and the result is a constitution with amendments that costs readers archaeology. The archived delivery spec
is that failure in this corpus, and `evidence-applicability`'s spec is already growing inline amended-after-review
paragraphs in its body before activation.

ARC's spec is both types and the corpus has already split it by section: Non-Goals are frozen with append lines,
Success Criteria are immutable and digest-bound, and the design body is what tasks derive from and what verification
opens as the upstream design. Implementation starting makes the body more of a builders' document, not less. So:

- **Spec — an `## Amendments` log.** One row per amendment, numbered (`A1`, `A2`, …), dated, one line: the delta,
  the superseded statement or its locus, the trigger site, the revision tasks, the revalidation task. The row is
  the amendment's identity and the only mandatory write. The design body **revises in place** so it always reads as
  the current design, with the row's id marked at the edited locus. Frozen surfaces keep their existing rules: a
  Non-Goals change appends its `Amended` line, a criterion is never edited (a new row appends at the end of its
  group per `validate-criteria`'s ordinal binding; a superseded one is dispositioned `[~]` at verification).
- **Notes — the reasoning**, only when it exceeds a few lines, in a `notes-*` section keyed by the id; the companion
  is created on first need, as `task-audit` already prescribes for significant findings. This is the ledger the
  archived work unit converged on, with the identity minted in the spec instead of the notes.
- **Task list — the revision work**, citing the id in the revision parent's `_Goal:_` or `_Context:_`. No
  forward-amendment paragraphs and no provenance in task bodies; the list stays a coherent forward artifact.

Ceremony scales with triage depth: a task gap is one log row plus revision tasks; a spec-depth gap adds an in-place
elaboration; a design gap adds a body rewrite and a notes entry. The row grammar is fixed so a later CLI can parse
and render it (record-versus-projection direction, ADR-022), and a row whose revalidation field is still empty is
the durable "detour in flight" a fresh session reads.

### 4. Revision work anchors to the work it corrects; verifiers only re-record

The R scheme already exists (`strategy-task-list-formatting` § Revision Numbering) and the cursor is document-order
and id-agnostic, so no new numbering or state is needed. The placement rules:

- **Corrective work** is `X.Y.R` under the implementation task whose Goal the correction serves, or an `X.R` parent
  inserted in the affected phase **before** that phase's verifiers. It is never nested under a verifier.
- **Revalidation** is `X.V.R` under the detecting verifier `X.V`, recording only the delta (§ 6). A revalidation is
  never a second suffixed parent: the segmentation scan requires exactly one segment-suffixed parent as the last
  non-member parent of a closing phase, and refuses a second as `segment-verifier-orphan`.
- **No revision phase by default.** A phase would need its own `_Mode:_` and `_Exit criterion:_` and would be a new
  segment. An amendment that adds a genuinely new capability is ordinary planning — a new segment authored through
  `resolve-plan-segmentation`, which is that procedure's recorded extraction trigger.
- **Recovery is monotonic without new state.** The cursor selects the first open leaf in document order, so an
  `X.R` inserted in an earlier phase becomes the current task deterministically, and handoff, compaction seed, and
  session-init derive from the same cursor.

The three cases the handoff notes named resolve under these rules. A **failed segment verifier** anchors its fix as
`X.Y.R` or `X.R` and re-records at `X.V.R`. A **cross-member correction** under a bound delivery plan keeps the
landed member's range immutable — the shipped amendment classifier refuses `landed-member-changed` — so the work
lands in an unlanded member or terminal, the plan revision passes through that classifier, and a review-driven fix
re-verifies through the shipped review-fix verification continuation; this procedure supplies the plan-record side
and re-derives none of the delivery mechanics. A **review finding that reopens design** takes the design arm and,
when the work unit was withdrawn, returns to execution through `arc reopen --task "Task X.Y.R — …"`, which already
accepts a revision task.

### 5. Exit gate: a propagation sweep bounded by the amendment's footprint

The amendment produces a diff of settled things. The sweep is `generate-tasks`' final suite-coherence pass bounded
to what references or depends on the changed elements — remaining tasks, later phases' exit criteria, other spec
sections, criteria rows — and classifies each hit: **unaffected** (recorded as checked), **fold into the same
revision batch** (one corrective loop, not many), or **reopens another design question** (stay in the loop; the
detour never exits carrying a known unsettled thing). Cost scales with the amendment's real coupling.

The hit list is greppable when task parents cite the design element they realize (`— D5` suffixes, already used by
two active task lists). This work unit codifies that suffix as a recommended convention for RFC-form specs in the
task-list formatting strategy — recommended, never scanned — and names a CLI footprint read over those citations as
a future seam. External grounding: traceability-based change impact analysis (Bohner and Arnold) and ECO closure
practice, which closes a change only when verified against the originating gap.

### 6. Closure re-runs the detecting check, recording a delta

The detour is done when the verification that opened it passes again — the TDD regression idiom and ECO
verification stated once. The re-record is a **delta against the prior boundary report**: the changed criteria, the
new span, and the summary. `validate-criteria` gains a narrow re-entry report form for this; unchanged criteria are
omitted, digests stay in the record where they exist and are never restated. Per criterion the delta uses
`evidence-applicability`'s verdict vocabulary — `carries` (omitted), `supplemental` or `fresh` (listed with new
evidence) — because the question is the same one that work unit defines, whether evidence bound to one target still
covers the next; the reuse is confirmed with that work unit at planning close rather than assumed.

Which gates re-run is the project's selection rule (`DEV-RULES.PROJECT` § Selecting what to run, extended by
`test-suite-right-sizing` and lifted later by `quality-gate-hooks`); this procedure names no tiers. Once a Candidate
exists, `evidence-applicability` owns whether prior review, verification, and merge evidence still holds and at what
scope (`targeted | focused | full`); this procedure defines no re-verification breadth of its own.

### 7. No detour state; one capture commit

The detour is represented by what already exists: the open log row, handoff's off-task-list `Next Action` prose for
a mid-triage session boundary, and the cursor once revision tasks exist. No lifecycle state, no meta field, no
marker. The amendment capture — log row, revision tasks, any body edit and notes entry — lands as **one commit
before corrective work begins**, approved at the procedure's interlock, so the point-in-time design is recoverable
from git, which is the mitigation every in-place precedent relies on.

## Alternatives

- **Re-enter the original planning workflows.** Rejected — the detour needs their _moves_ (elicitation, grounding,
  decomposition) at amendment scale, not their whole-work-unit scope, planning-session posture, and full adversarial
  gates.
- **Status quo (ad hoc handling).** Rejected — the motivating problem, now with the archived evidence above.
- **Scope to design gaps only.** Rejected — most observed instances are task or spec-depth gaps; a design-only
  workflow leaves the common case unowned and pulls agents into design elicitation for missing-wiring fixes.
- **A speculative entry mode absorbing the audit doors.** Rejected on regrounding — it fused detection with
  correction, retired a shipped door another work unit still targets, and no surveyed tradition does it. The doors
  stay and route onward.
- **Append amendment blocks inside the spec body.** Rejected — the corpus's own failure mode (the archived spec's
  inline blocks, the notes ledger that replaced them) and the documented one (design-doc archaeology). The body
  revises in place; the log carries history.
- **A separate amendment document per change.** Rejected — the same archaeology cost as body addenda, and it would
  sit outside the planning group that `evidence-applicability` treats as evidence-neutral.
- **A dedicated `.R` revision phase.** Rejected as the default — it is a new segment under the shipped scan and
  detaches the fix from the work it corrects; a new phase is reserved for a genuinely new capability.
- **A formal lifecycle state for "amending."** Deferred, not rejected — disproportionate for a quick detour; the
  lifecycle record belongs to `wu-lifecycle-state-model`, and the open log row already carries the in-flight fact.
- **Defensive full re-audit before resuming.** Rejected — repeats pre-impl planning cost on every amendment; the
  footprint-bounded sweep is the minimal sufficient middle.

## Forward-compat checks (2026-09-10)

- **Procedure evolution.** The only state dispatch — whether a delivery plan is bound — is already computed by
  `arc delivery entry inspect`; triage and the sweep are judgment; the log row grammar, amendment numbering, and the
  footprint read are named as CLI seams, not built. One prose-template residue: the interlock prompt line, which
  follows the existing `<Prefix> <Target>?` convention.
- **Knowledge evolution.** No new invariant is placed; the procedure composes constraints that already sit at their
  fire sites (verifier sink, criterion immutability, amend-forward). Triggers are authored as directive
  operation-anchored lines. The delta form lands in its owner (`validate-criteria`); the elicitation loop stays by
  reference; `resolve-plan-segmentation` is extracted only if fired. No brief vocabulary entry and no growth of the
  always-loaded set.
- **Composable workflows.** The procedure is a loop sub-protocol authored as a signature-led supplemental workflow
  with stable anchors; it lifts into a public fragment unchanged. It is not a session ceremony, so nothing compiles;
  the open log row is the seed a future agenda could read.

## Coordination

- **`plan-segmentation`** (shipped) — shared contracts, not "no overlap": the verifier-as-evidence-sink rule, the
  scan's positional rules for suffixed parents, lifecycle rows appending at group end, and the
  `resolve-plan-segmentation` extraction trigger. Its planning-close captures are adopted here.
- **`delivery-native-stack-composition`** (shipped) — the delivery amendment classifier and the review-fix
  verification continuation are the mechanics a cross-member or review-driven correction runs through; this
  procedure supplies the plan-record side only.
- **`evidence-applicability`** (active) — its path-treatment registry classifies the planning group as
  evidence-neutral, so an amendment record can never invalidate review, verification, or merge evidence, and the
  record must therefore live inside that group. Its scope and verdict vocabulary are consumed by name; the
  per-criterion verdict reuse is a planning-close confirmation. No dependency edge: an absent scope field already
  reduces to `full`.
- **`test-suite-right-sizing`** (planning) — owns which tiers a re-run includes and what it costs; this procedure
  cites the selection rule and names no tiers.
- **`delivery-correction-convergence`** and **`review-orchestration-right-sizing`** — own delivery-side correction
  convergence and the review-correction control loop respectively; orthogonal, cross-referenced.
- **`decomposition-doctrine`** (planning) — owns the boundary the escape hatch lands on; this draft names the exit
  and the shipped extraction mechanism, authoring no doctrine.
- **`composable-workflows`** (backlog) — the procedure's fragment shape; the supplemental-directory split carries
  this file with the session-adjacent class.
- **`strategy-storage-evolution` / ADR-022** — the log row is a projection-compatible record grammar; the
  CLI-owned record is that direction's, not this work unit's.
- **`planning-iteration-mechanics`** — keeps its task-audit door concern intact because the door is kept.
- **`task-list-conventions`** — owns the formatting strategy this work unit edits (revision placement, the
  design-element suffix); confirm edit ownership if it activates first.

## Unknowns and Assumptions

- **Naming.** Working name `amend-plan` for the workflow, reusing the corpus's existing amendment vocabulary now that
  entry is responsive only; the skill door's name is open. `reground` survives only as descriptive prose.
- **Row grammar.** The exact fixed shape of the `## Amendments` row, and whether Non-Goals `Amended` lines carry the
  row id or stay as they are; settle at spec.
- **Vocabulary reuse.** Per-criterion `carries | supplemental | fresh` is defined over path deltas today; the reuse
  is confirmed with `evidence-applicability` at planning close.
- **Design-element citation.** The `— Dn` suffix is adopted as a recommendation; whether task generation should
  author it by default for RFC-form specs is a `generate-tasks` question settled at spec.
- **Assumption:** the triage test is decidable at the moment of discovery. Unvalidated; if it proves ambiguous in
  live use, the arms may need a default-and-escalate rule.

## Boundary fit and Class

`assess-boundary-fit`: **stays one WU** — one concern (correcting the plan record mid-implementation) designed as a
whole; the seams above are coordination, not orthogonal deliverables, and the ship surface is prose plus one method
addition, so no delivery-plan candidate.

`classify-work-unit`: estimate corrected `Light → Heavy`. Derivation fires — the triage, record, placement, and
closure rules had to be authored before a competent engineer could start — and the design composes established
practice rather than inventing it, so not `Novel`. Scale does not fire. Persisted at the draft-capture ceremony.

## Scope boundary (Won't Do)

- No lifecycle state-model changes (`wu-lifecycle-state-model`).
- No change to when amendments _should_ happen — frequency is `plan-segmentation`'s concern.
- No re-authoring of the planning workflows beyond the fire-site lines and the composition seams this procedure
  calls into.
- No decomposition doctrine: the escape hatch names the exit; `decomposition-doctrine` owns what follows.
- No re-verification breadth, gate-tier selection, or delivery-correction mechanics — owned by
  `evidence-applicability`, `test-suite-right-sizing`, and the shipped delivery work respectively.
- No CLI-owned amendment record, footprint read, or scan of the log — named as seams only.

Dependencies: none hard. Author against `plan-segmentation`'s and `delivery-native-stack-composition`'s landed
contracts; `evidence-applicability` and `test-suite-right-sizing` are consumed by name and need not land first.
