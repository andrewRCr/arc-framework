# Draft: plan-amendment — a standardized mid-implementation design-amendment procedure

- **Origin:** [internal] — minted 2026-08-24 from a session-init discussion of recurring mid-implementation
  verification gaps, alongside the same-day regrounding of `plan-segmentation`; regrounded 2026-09-10 against that
  work unit's shipped contracts and the archived `delivery-native-stack-composition` evidence.
- **Purpose:** Give ARC one procedure for the moment implementation evidence falsifies the design record — the
  artifact the meta's `Design` field names — or its derivation into tasks: enter from wherever the evidence
  surfaced, triage by the planning cut ARC already makes against the statements and criteria the record already
  carries, record the amendment once, anchor the revision work away from the verifier that found it, run the
  canonical planning procedures at the amendment's own scope and depth, sweep only its footprint, and close by
  re-running the check that opened it. Composed from existing mechanism rather than new machinery; cheap enough
  that nobody hand-rolls the detour, bounded enough that it never re-runs a planning workflow whole and never
  regresses lifecycle state.

---

## Readiness

**State:** `maturing` — scope is known and the fundamentals are settled (2026-09-10 consolidation); one `Heavy`
adversarial pass run the same day, seven findings verified and folded (see § Adversarial pass). The open items below
are one vocabulary confirmation and detail the spec resolves; a second pass over the repaired draft is owed before
capture.

**Resolved (2026-09-10):** naming (`amend-design`; skill door `arc-amend-design`); responsive entry with the audit
doors kept as detection; the entry floor, the statement-and-criteria decision tree, and the authority split by arm;
the depth axis and the rigor ladder, with canonical procedures re-entered at scope and never whole; extraction as
the ceiling, never lifecycle regression; the assurance invariant and the accretion guard; the three-way amendment
record and its row grammar; revision placement and monotonic recovery across a failed segment verifier, a
cross-member correction, and a review finding that reopens design; delta-only revalidation; closure composed with
the project's gate-selection rule and `evidence-applicability`'s vocabulary; no lifecycle state and no meta field
for the detour; one capture commit before corrective work; the three inbox captures and both inbound-buffer concerns
adopted; forward-compat self-checks run against the procedure, knowledge, and composable-workflows check-docs;
`Class` read as `Heavy`.

**Open:** confirming the per-criterion reuse of `carries | supplemental | fresh` with `evidence-applicability`
(planning-close coordination, not a design gap).

**Next:** second adversarial pass over the repaired draft (re-attack the outcome-keyed tree and the placement
rules), fold, post-settle coherence re-read, capture the draft and persist `Class`.

## Problem / Motivation

Mid-implementation design gaps happen. `plan-segmentation` (shipped 2026-09-09) makes them rarer and surfaces them
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
  that implicates the design, and the task loop's own must-stop on an unanticipated design decision. The archived
  delivery task list shows the loop also fires after terminal verification: its terminal task became a
  seventeen-entry correction ledger during delivery and integration.
- The same archived work unit is the corpus instance of every failure this procedure must prevent. Of 187 `.R`
  re-entry subtasks, nearly all hang off verifier tasks, nested four levels deep, so three verifiers hold most of a
  5,419-line file while the implementation tasks whose behavior changed stayed tidy and misdescribe the member. It
  carries 57 full criteria reports, one member's slice recorded sixteen times, mostly for criteria whose evidence had
  not changed. And it carries three overlapping amendment trails with no linkage — inline `Amended` blocks in the
  spec, a numbered decision record in the notes, and forward-amendment paragraphs in the task list — with the notes
  ledger becoming the de facto record because the spec's inline blocks could not carry the reasoning.
- The two failure directions are both real. Too liberal, and every implementation detail becomes a spec amendment
  with ceremony attached. Too conservative, and amendments never get the rigor the original design got, so the
  work unit's assurances erode one small change at a time — or a substantial revision reaches for a full lifecycle
  re-entry, which this project has tried and found to regress state painfully.

Every occurrence improvises how to record the amendment, where revision work goes, how much rigor the change
deserves, and what must be re-checked before resuming.

## Success signal

The procedure has worked when, on the next work unit that hits a mid-implementation gap: the amendment lands as one
log row plus revision work, and for a task gap nothing else; no revision work nests under a verifier, no completed
task's marker reverses, every re-record is a delta; the spec body reads as the current design at every point, with the
row as the only history inside it; a session resuming mid-detour orients from the open row and the cursor alone; and
the amended elements carry the same gate evidence the originals did, at the amendment's depth, with no whole-design
re-review and no lifecycle regression. The archived delivery task list is the counter-example each clause is measured
against.

## Direction (settled)

### 1. One responsive procedure, entered from the sites that detect

A supplemental workflow, `amend-design`, owns the detour start to finish. Its target is the design record — the
artifact the meta's `Design` field names, draft or spec — and its derivation, the task list; it never touches
delivery-plan vocabulary. It is **responsive only**: entry presupposes a finding, and "the design holds, only its
derivation was incomplete" is the shallow answer, so entering asks a question and commits to nothing. The five
detection sites reference it as their correction route with directive lines — enter it when a verifier reports an
unmet criterion, a task cannot complete as written, or a finding implicates the design; do not patch inline and do
not nest revision work under the verifier. The skill door `arc-amend-design` covers ad-hoc entry, the common case of
a developer saying mid-session that a task or decision is wrong.

The standalone audit doors are kept as **detection**, not absorbed. `arc-task-audit` and `arc-design-audit` are
read-only rubric doors that end at findings; their route-onward now names this procedure instead of each other, so
the pairing reads as audit the design, then amend the design. No tradition surveyed fuses audit with change
control — audits detect, change control corrects — and `planning-iteration-mechanics` still targets the task-audit
door.

The workflow is authored method-shaped from the start — a one-line signature
(`amend-design(finding, design record) → amended record + revision work | design holds | escalate`), a bounded
spine, the arms as one-line gates with their sections beneath, stable section anchors for the sites that reference
it — because it is exactly the event-handler sub-protocol the loop model in `draft-composable-workflows.md`
describes, and it lifts into a shared fragment with no rewording. Its interlock stays inside it as a constraint.

### 2. Entry gate: a floor, a decision tree keyed to the record, and authority by arm

What separates this procedure from the task loop's ordinary "minor deviation, continue with note" is whether the
evidence falsifies the design record or its derivation. That is the **floor**, and the tree below is keyed to
**outcomes** — the loop's own test — so its steps are exclusive. Run it top-down at the stop the agent is already at,
first match wins, citing the statement or criterion that decided it:

1. **The tasks as written still produce every stated outcome; only how changes.** Not an amendment: the loop's
   existing minor-deviation path.
2. **A stated outcome is not produced, and a statement already requires it.** A Success Criterion, exit criterion,
   lifecycle row, or design element covers the missing behavior; the task list failed to realize it (unwired
   production callers, modules built but unreachable). **Task arm** — derivation incomplete; revision work only.
3. **A needed outcome is not produced, no statement requires it, and it sits inside the Goals.** The design's
   intent requires it but nothing is deep enough to generate it. **Spec-depth arm** — in-place elaboration, and the
   amendment **appends a criterion** to the affected group so the hole becomes checkable.
4. **A settled statement must change.** A decision reversed, a criterion superseded, a Non-Goal breached.
   **Design arm** — narrowed elicitation to settle the fix, then supersession recorded, then revision work.
5. **Outside the Goals, or it changes what the work unit is** — its purpose, a deliverable boundary, a landed
   member's contract. **Escalate** (§ 4).

The criterion test is what makes arms 2 and 3 a lookup rather than a judgment: if the criterion that would have
caught the gap exists, the derivation failed, not the design; if it does not, the record has a hole, and the
amendment's first duty is to add the criterion. Segment exit criteria, member groups, and lifecycle rows all count
as coverage, which is why segmentation shipping makes this tree sharper. **Coarse coverage routes to arm 3:** when
the criteria are too coarse to decide whether the missing outcome is covered, treat it as uncovered and append the
criterion, so the next occurrence is decidable; that is the conservative direction and costs one row and one
criterion. Every amendment above the task arm therefore **adds or supersedes a criterion** — the surface that delta
revalidation (§ 8) and the propagation sweep (§ 7) anchor on. Each arm strictly contains the previous arm's tail, so
this is one procedure with three entry depths; the mechanical restatement is the draft's original test — could the
existing settled text have generated the missing work?

**Authority follows the arm**, by ARC's own rule-authority reading. Changing pre-commitment text commits the Owner,
so it is never the agent's to discharge; adding revision subtasks inside the current increment is already
agent-doable under discovered-work routing and is reported at the interlock.

- **Task arm** — the agent proceeds within the increment; the log row and revision work ride the increment's task
  commit the way task-list edits already do, and land in the ordinary completion report. No prompt.
- **Spec-depth and design arms** — Owner-authorized at a stop that already exists. Four of the five detection sites
  stop today (the member branch's `Fix now or amend/defer?`, terminal verification's unmet criterion, the finding
  loop's approval before any fix, the loop's must-stop on a design decision); the segment site's stop is the
  directive line this work unit authors, since a failed scenario is not a completion and the loop carries no
  segment text yet. The agent's report at the stop carries the triage read, the cited statement or criterion, the
  depth read (§ 3), and a lean, and the Owner's direction is the authorization. No new prompt shape. The procedure
  is never agent-invoked into design.
- **Escalation** — Owner, always.

User direction overrides any arm at any time. When the read is torn between arms 2 and 3, the agent asks in one line
at the stop it is already at, since spec text needs the Owner anyway; the costly arm has the crispest test.

Two boundary rules complete the gate. **The amendment target is a settled statement**: an amendment names the exact
statement it supersedes, and still-unsettled planning — an open question, a provisional segment, a sibling's
in-flight design — is ordinary planning input, never an amendment target. **Review findings enter here like any
other evidence**: `integrate-work-unit`'s finding loop hands a finding that implicates the design to this procedure
rather than patching around it, and the tree is the authoritative answer to "does this correction re-enter design",
so no finding becomes a planning restart by default.

Externally, every mature change-control tradition puts a cheap classification gate before impact analysis — IETF
errata versus a bis document, EIA-649 Class II versus Class I, PRINCE2's tolerance breach as the escalation
trigger — precisely so small changes never trigger a full re-plan. The arms and the ceiling map onto
`strategy-adr-methodology`'s tiers: correction, amendment, and supersession, with the identity break as the
supersession analogue. The corpus's own planning-time cut is the same three ways — fold into the task list,
propagate a wrong mechanism to the spec in place, fire the re-entry valve when design must be authored
(`resolve-planning-depth` § Mid-stage re-entry; `generate-tasks` § Grounding audit) — and this gate is that cut
applied past activation, with the same vocabulary.

### 3. Rigor scales by the amendment's own depth, through the canonical procedures at scope

The arm says what changes and who decides; **depth** says how much must be derived and sets the rigor. Every
planning stage opens with one derivation read yielding `low` / `medium` / `high`; the amendment takes the same read
over the finding and the gap, and that read — not the work unit's `Class` — governs:

- **`low`** — a determinate correction. The Owner's approval at the existing stop is the gate; no adversarial pass;
  grounding-only `task-audit` over the revision tasks.
- **`medium`** — a bounded set of decisions to compose. The canonical procedures run **at scope, never whole**:
  `create-spec`'s authoring moves and its coherence self-review over the affected elements, `generate-tasks`'
  per-phase grounding audit over the affected phases, and its segmentation read only when a new segment appears. A
  neutral adversarial offer over the footprint.
- **`high`** — design that must be authored, not corrected. The same procedures at scope with the adversarial pass
  recommended, and the work unit's `Class` ratchets to the realized floor, persisted at the amendment capture
  commit — realized authoring floors `Class` wherever it happens.

This is `resolve-planning-depth`'s re-entry valve applied past activation: route to the stage that owns the signal's
axis, re-entered at the depth the signal demands. Its line between re-entry and in-place correction — must new
design be authored, or an existing decision corrected — is the boundary between the design arm at `low` and at
`high`. The stage procedures carry no lifecycle prerequisite beyond the artifacts existing, so running them at scope
inside an `Active` work unit moves no state, advances no stage pointer, and repoints nothing; their ceremony steps
are skipped by reference until `composable-workflows` lands the procedure-library cut that makes the scoping
structural.

**The assurance invariant:** an amendment's artifacts pass the gates the originals passed, over the amendment's
footprint, at the amendment's depth. The adversarial rubric is `design-audit` plus the spec coherence slice, with
prior findings carried through the method's existing `prior-findings` input so untouched elements are never
re-attacked; closure re-runs the detecting verification. Nothing is skipped and nothing is repeated. Two guards
cover the two failure directions: the floor and the silent task arm make a `low` amendment cost an approval that
was being given anyway, and the **accretion guard** covers many `low` amendments summing to a design nobody re-read —
the log makes that visible, and the response is the lean `draft-design` already applies to accreting drafts, a
suggested consolidation read (one coherence pass plus the adversarial offer over the union) when the log's footprint
has touched a material share of the design. Suggest, never enforce.

### 4. The ceiling is extraction, never lifecycle regression

The planning workflows are never re-entered whole inside an `Active` work unit, and `draft-design` is never
re-entered at all. An amendment that invalidates the purpose, most of the design, or a landed member's contract
re-opens what the thing _is_ rather than how it lands — this draft's boundary reading, with `decomposition-doctrine`
owning the doctrine — and the principled instrument is the shipped `decompose-extraction` arm: the origin keeps its
implementation and ships as the surviving, still-valid part, and the invalidated concern becomes a new work unit
that gets the full canonical process from the headwater. Earlier full-lifecycle re-entry was painful because it
regressed state to re-plan the same identity; extraction keeps state monotonic and gives a new design the rigor a
new design deserves.

Two consequences are accepted consciously. Extraction moves scope, not code: a landed member's contract is immutable
by definition (the delivery classifier refuses `landed-member-changed`), so when the invalidated part has already
landed, the origin ships it as-is and the new work unit corrects it post-merge — unless a later unlanded member can
carry the correction in-WU, in which case the design arm applies and the ceiling does not. And a hole so large it
is really an unauthored design area, while the identity still holds, is the Owner's call between the design arm at
`high` and re-entering the planning stage; the procedure never makes that call.

### 5. The amendment record is one identity with three projections

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

- **Spec — an `## Amendments` log.** One row per amendment, the amendment's identity and the only mandatory write.
  The design body **revises in place** so it always reads as the current design, with the row's id marked in
  parentheses at the edited locus. Frozen surfaces keep their existing rules and cross-reference the row: a Non-Goals
  change appends its `Amended` line carrying the id; a criterion is never edited — a new row appends at the end of
  its group per `validate-criteria`'s ordinal binding, and a superseded one is dispositioned `[~]` at verification.
- **Notes — the reasoning**, only when it exceeds a few lines, in a `notes-*` section keyed by the id, with the
  superseded text quoted there when the arm is design; the companion is created on first need, as `task-audit`
  already prescribes for significant findings. This is the ledger the archived work unit converged on, with the
  identity minted in the spec.
- **Task list — the revision work**, citing the id in the revision parent's `_Goal:_` or `_Context:_`. No
  forward-amendment paragraphs and no provenance in task bodies; the list stays a coherent forward artifact.

The row is a bullet with fixed labels in the corpus's descriptor idiom, two lines at most, parseable later:

```markdown
## Amendments

- **A1** — 2026-09-12 — design: exact-head correction verification enters the existing Candidate transition
  sequence. _Supersedes:_ § Non-Goals ¶3. _Trigger:_ 7.7 member verifier. _Work:_ 7.R. _Revalidated:_ 7.R.c.
- **A2** — 2026-09-14 — task: wire the import command to its production callsite. _Supersedes:_ none.
  _Trigger:_ 2.3 segment verifier. _Work:_ 2.R. _Revalidated:_ pending.
```

The arm token is `task`, `spec-depth`, or `design`, so ceremony depth is visible per row; `_Supersedes:_` is a
section-and-paragraph locus or `none`; `_Revalidated:_ pending` is the open-detour marker a fresh session reads and
becomes the task id at closure. Ceremony scales with the arm and the depth read: a task gap is one row plus revision
tasks; a spec-depth gap adds an in-place elaboration and a criterion; a design gap adds a body rewrite and a notes
entry. The grammar is fixed so a later CLI can parse and render it (record-versus-projection direction, ADR-022).

### 6. Revision work anchors to the work it corrects; verifiers only re-record

The R scheme already exists (`strategy-task-list-formatting` § Revision Numbering) and the cursor is document-order
and id-agnostic, so no new numbering or state is needed. One invariant governs placement: a task-list `[x]` is
terminal derived state and never reverses, which is also why the cursor treats a parent's marker as authoritative
and never looks beneath a completed parent. The older R-scheme practice of reopening a completed parent to hang
revision work under it conflicts with that invariant and is retired here. The placement rules:

- **Corrective work** is an `X.R` parent inserted in the affected phase **before** that phase's verifiers, with its
  own Goal naming the amendment id and the task it corrects, and its increments as subtasks. `X.Y.R` is used only
  while `X.Y` is still open — the gap surfaced inside the increment in flight — so no marker moves either way.
  Revision work is never nested under a verifier.
- **A corrected task points forward.** When an amendment changes the behavior a completed task recorded, append
  `_Amended in:_ X.R (An)` beneath that task — one additive line, protected after completion exactly as
  `_Retired in:_` is — so the task's record stays honest without reversing its marker, and the sweep reads in both
  directions.
- **Revalidation** is the `X.R` parent's closing subtask, recording only the delta against the detecting verifier's
  report (§ 8). The verifier itself is not touched: it stays the evidence sink it was, and a revalidation is never a
  second suffixed parent — the segmentation scan requires exactly one segment-suffixed parent as the last non-member
  parent of a closing phase and refuses a second as `segment-verifier-orphan`.
- **No revision phase by default.** A phase would need its own `_Mode:_` and `_Exit criterion:_` and would be a new
  segment. An amendment that adds a genuinely new capability is ordinary planning at scope — a new segment authored
  through `resolve-plan-segmentation`, which is that procedure's recorded extraction trigger.
- **Recovery is monotonic without new state.** The cursor selects the first open parent in document order and its
  first open subtask, so an `X.R` inserted in an earlier phase becomes the current task deterministically, and
  handoff, compaction seed, and session-init derive from the same cursor. That the cursor silently skips an open
  child under a `[x]` parent instead of diagnosing it is a separate seam, captured for its owner.

The three cases the handoff notes named resolve under these rules. A **failed segment verifier** anchors its fix as
`X.R` (or `X.Y.R` while `X.Y` is open), marks the corrected task `_Amended in:_`, and re-records the delta as
`X.R`'s closing subtask. A **cross-member correction** under a bound delivery plan keeps the
landed member's range immutable — the shipped amendment classifier refuses `landed-member-changed` — so the work
lands in an unlanded member or terminal, the plan revision passes through that classifier, and a review-driven fix
re-verifies through the shipped review-fix verification continuation; this procedure supplies the design-record
side and re-derives none of the delivery mechanics. A **review finding that reopens design** takes the design arm
and, when the work unit was withdrawn, returns to execution through `arc reopen --task "Task X.Y.R — …"`, which
already accepts a revision task.

### 7. Exit gate: a propagation sweep bounded by the amendment's footprint

The amendment produces a diff of settled things. The sweep is `generate-tasks`' final suite-coherence pass bounded
to what references or depends on the changed elements — remaining tasks, later phases' exit criteria, other spec
sections, criteria rows — and classifies each hit: **unaffected** (recorded as checked), **fold into the same
revision batch** (one corrective loop, not many), or **reopens another design question** (stay in the loop; the
detour never exits carrying a known unsettled thing). Cost scales with the amendment's real coupling, and the
footprint is also what bounds the adversarial pass in § 3.

The hit list is greppable when task parents cite the design element they realize (`— D5` suffixes, already used by
two active task lists). This work unit codifies that suffix as a recommended convention for RFC-form specs in the
task-list formatting strategy — recommended, never scanned — and names a CLI footprint read over those citations as
a future seam. External grounding: traceability-based change impact analysis (Bohner and Arnold) and ECO closure
practice, which closes a change only when verified against the originating gap.

### 8. Closure re-runs the detecting check, recording a delta

The detour is done when the check that opened it passes again — the TDD regression idiom and ECO verification
stated once. `_Revalidated:_` names that check; when the entry site had none (the loop's must-stop, the skill door),
it names the next verifier in the plan that covers the amended statement. At a **segment** site the re-record is
the scenario's outcome, as the verifier's own completion is, not a criteria delta. At a **member** site the
re-record is a **delta against the member's boundary report**: the changed criteria (including any the amendment
appended, with their own evidence), the new span, and the summary; unchanged criteria are omitted, digests stay in
the record where they exist and are never restated. Per criterion the delta uses `evidence-applicability`'s
verdict vocabulary — `carries` (omitted), `supplemental` or `fresh` (listed with new evidence) — because the
question is the same one that work unit defines, whether evidence bound to one target still covers the next; the
reuse is confirmed with that work unit at planning close rather than assumed.

The delta is a **supplement to** the member's report, never a second report. `validate-criteria` gains one
composition rule alongside the re-entry form: a member's **effective report** is its base boundary report plus its
ordered deltas — same-locus entries overridden by the latest delta, appended criteria present only in the delta,
the span the latest delta's — and the work-unit-scope walk consumes the effective report where it consumes the base
one today. Terminal closure itself is unchanged: after a terminal gap is fixed, `verify-work-unit` reruns its walk
against the current work-unit subject as it already prescribes; the delta form is for member and segment
re-records, and `verify-work-unit` is edited only for its entry directive.

Which gates re-run is the project's selection rule (`DEV-RULES.PROJECT` § Selecting what to run, extended by
`test-suite-right-sizing` and lifted later by `quality-gate-hooks`); this procedure names no tiers. Once a Candidate
exists, `evidence-applicability` owns whether prior review, verification, and merge evidence still holds and at what
scope (`targeted | focused | full`); this procedure defines no re-verification breadth of its own. The same
principle — applicability follows covered content — is what "over the footprint" means for design evidence in § 3:
prior passes over unchanged elements carry, changed elements need fresh.

### 9. No detour state; one capture commit

The detour is represented by what already exists: the open log row, handoff's off-task-list `Next Action` prose for
a mid-triage session boundary, and the cursor once revision tasks exist. No lifecycle state, no meta field, no
marker. On the **spec-depth and design arms** the amendment capture — log row, revision tasks, body edit, criterion,
notes entry, plus a `Class` ratchet when § 3 requires one — lands as **one commit before corrective work begins**,
released at the stop where the Owner authorized it, so the point-in-time design is recoverable from git, which is
the mitigation every in-place precedent relies on. That commit is a planning ceremony, so a `Class` write there
honors meta-file timing (a hand edit today; no CLI writes `Class` outside start and task finalization, a seam
rather than a defect). On the **task arm** nothing in the spec changes, so there is nothing to recover: the row and
the revision tasks ride the increment's task commit as task-list edits always do.

## Adversarial pass (2026-09-10, pass one of two)

Seven findings, all verified against source and folded: the task-arm commit shape contradicted the capture rule
(§ 9 now scopes the pre-corrective commit to the spec-changing arms); the decision tree's first step was not
exclusive of the next two (§ 2 is re-keyed to outcomes, with the coarse-coverage rule); the cursor never looks
beneath a completed parent, so `X.Y.R` under a `[x]` task broke recovery (§ 6 now defaults to an `X.R` parent, adds
the `_Amended in:_` pointer, and retires marker reversal); the delta did not compose with the terminal carry (§ 8
now defines the effective report); closure was undefined at sites with no detecting check (§ 8); the segment site's
stop was asserted rather than authored (§ 2); and the ceiling was silent on landed-but-invalidated code and
misattributed the design-cut reading (§ 4). Withstood: the segmentation-scan claims, the R-scheme ids, the delivery
classifier and reopen contracts, the row grammar against lint, every `evidence-applicability` citation, the Class
ratchet's authority, and proportionality. A second pass over the repaired draft is owed before capture.

## Alternatives

- **Re-enter the original planning workflows whole, or regress lifecycle state to re-plan.** Rejected — the detour
  needs their _moves_ at amendment scope, not their whole-work-unit scope and ceremony, and lifecycle regression
  has been tried here and found painful. The procedures run at scope; the identity-breaking case exits by
  extraction.
- **Status quo (ad hoc handling).** Rejected — the motivating problem, now with the archived evidence above.
- **Scope to design gaps only.** Rejected — most observed instances are task or spec-depth gaps; a design-only
  workflow leaves the common case unowned and pulls agents into design elicitation for missing-wiring fixes.
- **Name it for the plan (`amend-plan`).** Rejected — "plan" is the overloaded word (planning phase, task plan,
  delivery plan, `arc plan check`); the meta's `Design` field is the corpus term for what this amends, and the
  audit-then-amend pairing reads on it.
- **A speculative entry mode absorbing the audit doors.** Rejected on regrounding — it fused detection with
  correction, retired a shipped door another work unit still targets, and no surveyed tradition does it.
- **Scale rigor by the work unit's `Class` instead of the amendment's depth.** Rejected — a `Light` work unit can
  take a `high` amendment and a `Heavy` one a `low` fix; keying to `Class` would either over-tax the common case or
  under-review the rare one. `Class` ratchets from the depth read instead.
- **Append amendment blocks inside the spec body.** Rejected — the corpus's own failure mode and the documented one
  (design-doc archaeology). The body revises in place; the log carries history.
- **A separate amendment document per change.** Rejected — the same archaeology cost, and it would sit outside the
  planning group that `evidence-applicability` treats as evidence-neutral.
- **A dedicated `.R` revision phase.** Rejected as the default — a new segment under the shipped scan, detached
  from the work it corrects; reserved for a genuinely new capability.
- **A formal lifecycle state for "amending."** Deferred, not rejected — disproportionate for a detour; the
  lifecycle record belongs to `wu-lifecycle-state-model`, and the open log row carries the in-flight fact.
- **Defensive full re-audit before resuming.** Rejected — repeats pre-impl planning cost on every amendment; the
  footprint-bounded sweep and pass are the minimal sufficient middle.

## Forward-compat checks (2026-09-10)

- **Procedure evolution.** The only state dispatch — whether a delivery plan is bound — is already computed by
  `arc delivery entry inspect`; the decision tree, the depth read, and the sweep are judgment over the record; the
  log row grammar, amendment numbering, and the footprint read are named as CLI seams, not built. One
  prose-template residue: the interlock prompt line, which follows the existing `<Prefix> <Target>?` convention.
- **Knowledge evolution.** No new invariant is placed; the procedure composes constraints that already sit at their
  fire sites (verifier sink, criterion immutability, amend-forward, rule authority). Triggers are authored as
  directive operation-anchored lines. The delta form lands in its owner (`validate-criteria`); the elicitation loop
  and the stage procedures stay by reference; `resolve-plan-segmentation` is extracted only if fired. No brief
  vocabulary entry and no growth of the always-loaded set.
- **Composable workflows.** The procedure is a loop sub-protocol authored as a signature-led supplemental workflow
  with stable anchors; it lifts into a public fragment unchanged, and "procedures at scope" is the procedure-library
  cut that work unit designs. It is not a session ceremony, so nothing compiles; the open log row is the seed a
  future agenda could read.

## Coordination

- **`plan-segmentation`** (shipped) — shared contracts, not "no overlap": the verifier-as-evidence-sink rule, the
  scan's positional rules for suffixed parents, lifecycle rows appending at group end, exit criteria as coverage in
  the decision tree, and the `resolve-plan-segmentation` extraction trigger. Its planning-close captures are adopted.
- **`delivery-native-stack-composition`** (shipped) — the delivery amendment classifier and the review-fix
  verification continuation are the mechanics a cross-member or review-driven correction runs through; this
  procedure supplies the design-record side only.
- **`evidence-applicability`** (active) — its path-treatment registry classifies the planning group as
  evidence-neutral, so an amendment record can never invalidate review, verification, or merge evidence, and the
  record must therefore live inside that group. Its scope and verdict vocabulary are consumed by name and its
  principle bounds the design-evidence pass; the per-criterion verdict reuse is a planning-close confirmation. No
  dependency edge: an absent scope field already reduces to `full`.
- **`test-suite-right-sizing`** (planning) — owns which tiers a re-run includes and what it costs; this procedure
  cites the selection rule and names no tiers.
- **`delivery-correction-convergence`** and **`review-orchestration-right-sizing`** — own delivery-side correction
  convergence and the review-correction control loop respectively; orthogonal, cross-referenced.
- **`decomposition-doctrine`** (planning) — owns the boundary the ceiling lands on; this draft names the exit and the
  shipped extraction mechanism, authoring no doctrine.
- **`composable-workflows`** (backlog) — the procedure's fragment shape and the procedure-library cut that makes
  at-scope re-entry structural; the supplemental-directory split carries this file with the session-adjacent class.
- **`strategy-storage-evolution` / ADR-022** — the log row is a projection-compatible record grammar; the
  CLI-owned record is that direction's, not this work unit's.
- **`planning-iteration-mechanics`** — keeps its task-audit door concern intact because the door is kept.
- **`task-list-conventions`** — owns the formatting strategy this work unit edits (revision placement, the
  `_Amended in:_` protected bullet, the design-element suffix); confirm edit ownership if it activates first.

## Unknowns and Assumptions

- **Vocabulary reuse.** Per-criterion `carries | supplemental | fresh` is defined over path deltas today; the reuse
  is confirmed with `evidence-applicability` at planning close.
- **Design-element citation.** The `— Dn` suffix is adopted as a recommendation; whether task generation should
  author it by default for RFC-form specs is a `generate-tasks` question settled at spec.
- **Cursor diagnostic.** An open child under a `[x]` parent is skipped silently today; a diagnostic would make the
  derived-state invariant visible. Captured for its owner; this work unit does not depend on it.
- **Accretion threshold.** "A material share of the design" is a lean, not a number; the spec may name a heuristic
  (row count, footprint union) but never a gate.
- **Assumption:** the decision tree is decidable at the moment of discovery because it keys to statements and
  criteria the record already carries. Unvalidated; the one-line ask between arms 2 and 3 is the relief valve.

## Boundary fit and Class

`assess-boundary-fit`: **stays one WU** — one concern (correcting the design record mid-implementation) designed as
a whole; the seams above are coordination, not orthogonal deliverables, and the ship surface is prose plus one
method addition, so no delivery-plan candidate.

`classify-work-unit`: estimate corrected `Light → Heavy`. Derivation fires — the gate, the depth ladder, the record,
placement, and closure rules had to be authored before a competent engineer could start — and the design composes
established practice rather than inventing it, so not `Novel`. Scale does not fire. Persisted at the draft-capture
ceremony.

## Scope boundary (Won't Do)

- No lifecycle state-model changes (`wu-lifecycle-state-model`), and no lifecycle regression path.
- No change to when amendments _should_ happen — frequency is `plan-segmentation`'s concern.
- No re-authoring of the planning workflows beyond the fire-site lines and the at-scope composition seams this
  procedure calls into; the structural procedure-library cut is `composable-workflows`'.
- No decomposition doctrine: the ceiling names the exit; `decomposition-doctrine` owns what follows.
- No re-verification breadth, gate-tier selection, or delivery-correction mechanics — owned by
  `evidence-applicability`, `test-suite-right-sizing`, and the shipped delivery work respectively.
- No CLI-owned amendment record, footprint read, or scan of the log — named as seams only.

Dependencies: none hard. Author against `plan-segmentation`'s and `delivery-native-stack-composition`'s landed
contracts; `evidence-applicability` and `test-suite-right-sizing` are consumed by name and need not land first.
