# Spec (`detailed` · `RFC`): plan-amendment

- **Origin:** [internal] — minted 2026-08-24 from a session-init discussion of recurring mid-implementation
  verification gaps; regrounded 2026-09-10 against `plan-segmentation`'s and `delivery-native-stack-composition`'s
  shipped contracts.

- **Purpose:** Give ARC one procedure for the moment implementation evidence falsifies the design record or its
  derivation into tasks: enter from the site that detected it, triage against the statements and criteria the record
  already carries, record the amendment once, anchor revision work away from the verifier that found it, run the
  canonical planning procedures at the amendment's own scope and depth, sweep only its footprint, and close by
  re-running the check that opened it. Composed from existing mechanism; never re-runs a planning workflow whole and
  never regresses lifecycle state.

---

## Introduction / Context

Mid-implementation design gaps happen. `plan-segmentation` makes them rarer and surfaces them earlier; this work unit
makes the residue cheap and reliable when they happen anyway. The corpus asserts the _what_ from several directions
and lacks the _how_:

- `plan-segmentation` defines every verifier — segment, member, and terminal — as an **evidence sink** that never
  hosts corrective work, and routes the question "where does a failed exit criterion's correction land" to this work
  unit. `design-audit` names **mid-impl** as its escalation point and promises that a confirmed break routes back
  into the design loop rather than around it. Nothing defines that routing operationally from inside an execution
  session.
- Detection is distributed across five sites, none of which owns the correction: the segment verifier, the member
  verifier (whose unresolved branch ends in `Fix now or amend/defer?`), terminal verification (an unmet criterion
  stops the work unit), a review finding that implicates the design, and the task loop's must-stop on an
  unanticipated design decision. The archived delivery task list shows the loop also fires after terminal
  verification.
- The archived `delivery-native-stack-composition` task list is the corpus instance of every failure this procedure
  prevents: 187 `.R` re-entry subtasks nested up to four deep under three verifier tasks that came to hold most of a
  5,419-line file while the implementation tasks whose behavior changed stayed tidy and misdescribed the member; 57
  full criteria reports, one member's slice recorded sixteen times for criteria whose evidence had not changed; and
  three overlapping amendment trails with no linkage — inline `Amended` blocks in the spec, a numbered decision
  record in the notes, forward-amendment paragraphs in the task list — with the notes ledger becoming the de facto
  record because the spec's inline blocks could not carry the reasoning.
- Both failure directions are real. Too liberal, and every implementation detail becomes a spec amendment with
  ceremony attached. Too conservative, and amendments never get the rigor the original design got, so assurances
  erode one small change at a time — or a substantial revision reaches for a full lifecycle re-entry, which this
  project has tried and found to regress state painfully.

Every occurrence today improvises how to record the amendment, where revision work goes, how much rigor the change
deserves, and what must be re-checked before resuming.

## Goals

- One responsive procedure, entered from every site that detects a gap, that answers "does this evidence falsify the
  record" before committing to any change — so the common case (the derivation was incomplete) costs one log row and
  revision work, and nothing more.
- Rigor scaled by the amendment's own depth rather than the work unit's `Class`, with the amended elements passing
  the gates the originals passed over the amendment's footprint — no whole-design re-review, no erosion.
- One amendment identity with three projections — spec log row, notes reasoning, task-list revision work — so the
  spec body reads as the current design at every point and history is recoverable without archaeology.
- Revision work anchored to the work it corrects, never nested under a verifier; completed markers never reverse;
  every re-record a delta; a session resuming mid-detour orients from the open row and the cursor alone.
- A ceiling that exits by extraction, never by re-entering a planning workflow whole or regressing lifecycle state.
- Correct interaction with a bound delivery plan: every perturbation the shipped classifier refuses or prices is
  stated, sequenced, and composed against the shipped contracts rather than re-derived.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No lifecycle state-model changes (`wu-lifecycle-state-model`), no new lifecycle state or meta field for the
  detour, and no lifecycle regression path.
- No change to when amendments _should_ happen — frequency is `plan-segmentation`'s concern.
- No re-authoring of the planning workflows beyond the fire-site directive lines, the at-scope composition seams
  this procedure calls into, the segmentation extraction, and one title-convention recommendation line; the
  structural procedure-library cut is `composable-workflows`'.
- No decomposition doctrine: the ceiling names the exit; `decomposition-doctrine` owns what follows.
- No re-verification breadth, gate-tier selection, or delivery-correction mechanics — owned by
  `evidence-applicability`, `test-suite-right-sizing`, and the shipped delivery work respectively.
- No CLI-owned amendment record, footprint read, log scan, digest derivation, or cursor diagnostic — each is named
  as a seam, not built.

## Proposed Design

### D1 — One responsive procedure, entered from the sites that detect

A supplemental workflow, `amend-design`, owns the detour start to finish. Its target is the **design record** — the
artifact the meta's `Design` field names, draft or spec — and its derivation, the task list. It authors no
delivery-plan mechanics; it perturbs plan state when one is bound, and D10 owns that interaction.

It is **responsive only**: entry presupposes a finding, and entering commits to nothing — "the design holds, only
its derivation was incomplete" is the shallow answer the gate returns first. The workflow is authored method-shaped
from the start: a one-line signature, a bounded spine, the arms as one-line gates with their sections beneath, and
stable section anchors the detection sites reference. Its interlock stays inside it as a constraint.

```text
amend-design(finding, design record) → amended record + revision work | design holds | escalate
```

**Five detection sites** reference it with directive lines — enter it when a verifier reports an unmet criterion, a
task cannot complete as written, or a finding implicates the design; do not patch inline and do not nest revision
work under the verifier:

| Site                       | Where the directive lands                                                      | Existing stop                   |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| segment verifier           | task loop — a failed scenario is not a completion; stop and enter              | none today — authored here      |
| member verifier            | task loop — every answer to the unresolved prompt, mapped to an arm (D2)       | `Fix now or amend/defer?`       |
| terminal verification      | `verify-work-unit` — the unmet-criterion stop                                  | stop on `[ ]`                   |
| review finding             | `review-response` — a `fix` whose correction would change the spec (D2)        | approval before any fix         |
| loop must-stop             | task loop — the unanticipated-design-decision stop                             | must-stop                       |

The **skill door** `arc-amend-design` covers ad-hoc entry — a developer saying mid-session that a task or decision is
wrong. The standalone audit doors are kept as **detection**, not absorbed: `arc-task-audit` and `arc-design-audit`
run a broad rubric over an artifact and end at findings; this procedure takes a specific finding and decides what
kind of change it is.

**Which door — specificity, then chain link.** When the caller can point at the thing — a stated outcome not
produced, a task that cannot complete as written, a decision that looks falsified — the door is `amend-design`,
confirmed or not: its gate is cheap, step 1 returns "not an amendment", and the `design holds` return is the exit
for a suspicion that does not pan out; the design arm's narrowed elicitation is where a suspected decision is
actually tested. When the caller cannot point at it, the door is an audit, keyed by the chain link it examines: "is
this task still right" is `arc-task-audit`, "is this design still right" (the world moved, many amendments
accreted, a reopened fundamental) is `arc-design-audit`. Confidence never picks the door. Each audit's
route-onward carries this rule: a specific finding enters `amend-design`; a broad design implication surfaced by a
task audit escalates to the design audit as it does today. A verified finding from either door enters this
procedure like any other evidence.

The workflow's prose is adopter-facing: it names no internal work unit, cites no corpus history, and carries the
procedure only; the rationale lives in this spec and its notes companion.

### D2 — Entry gate: a floor, a decision tree keyed to the record, and authority by arm

What separates this procedure from the loop's ordinary "minor deviation, continue with note" is whether the evidence
**falsifies the design record or its derivation**. That is the floor. The tree is keyed to **outcomes** — the loop's
own test — so its steps are exclusive; run it top-down at the stop the agent is already at, first match wins, citing
the statement or criterion that decided it:

1. **The tasks as written still produce every stated outcome; only how changes.** Not an amendment — the loop's
   minor-deviation path.
2. **A stated outcome is not produced, a statement already requires it, and the settled design would have produced
   it.** A Success Criterion, exit criterion, lifecycle row, or design element covers the missing behavior and the
   task list failed to realize it (unwired production callers, modules built but unreachable). **Task arm** —
   derivation incomplete; revision work only. If producing the outcome means reversing a settled decision, this step
   does not match; go to step 4.
3. **A needed outcome is not produced, no statement requires it, and it sits inside the Goals.** The intent requires
   it but nothing is deep enough to generate it. **Spec-depth arm** — in-place elaboration, and the amendment
   **appends a criterion** to the group whose validator can see its evidence (D5) so the hole becomes checkable.
4. **A settled statement must change.** A decision reversed, a criterion superseded, a Non-Goal breached. **Design
   arm** — narrowed elicitation to settle the fix, supersession recorded, then revision work.
5. **Outside the Goals, or it changes what the work unit is** — its purpose, a deliverable boundary, a landed
   member's contract. **Escalate** (D4).

The criterion test makes arms 2 and 3 a lookup: where the settled design would have produced the outcome, an
existing criterion means the derivation failed; where none exists, the record has a hole and the amendment's first
duty is to add the criterion. The test never settles whether the design itself is wrong — a criterion can exist, be
faithfully derived, and still name a decision that must be reversed; that is step 4's question, and step 2 defers to
it. Segment exit criteria, member groups, and lifecycle rows all count as coverage. **Coarse coverage routes to arm
3:** when the criteria are too coarse to decide, treat the outcome as uncovered and append the criterion, so the next
occurrence is decidable. Every amendment above the task arm therefore adds or supersedes a criterion — the surface
delta revalidation (D8) and the propagation sweep (D7) anchor on.

**Authority follows the arm.** Changing pre-commitment text commits the Owner and is never the agent's to discharge;
adding revision subtasks inside the current increment is agent-doable under discovered-work routing and is reported
at the interlock.

- **Task arm** — the agent proceeds within the increment; the log row and revision work ride the increment's task
  commit and land in the ordinary completion report. The row is a record, not pre-commitment text, so appending it
  needs no authorization of its own. No prompt on an unbound work unit; under a bound delivery plan the parent's
  assignment is a plan revision, an attended ceremony that lands before the parent executes (D10).
- **Spec-depth and design arms** — Owner-authorized at a stop that already exists (four of the five sites stop
  today; the segment site's stop is the directive line D1 authors). The agent's report at the stop carries the triage
  read, the cited statement or criterion, the depth read (D3), and a lean; the Owner's direction is the
  authorization. No new prompt shape. The procedure is never agent-invoked into design.
- **Escalation** — Owner, always.

User direction overrides any arm at any time. When the read is torn between arms 2 and 3, the agent asks in one line
at the stop it is already at. At the member site the three shipped answers are that direction: `Fix now` is the
task arm, `amend` the spec-depth or design arm, `defer` a supersession on the design arm — all three enter the gate,
and none lands work inside the verifier's own increment, which the evidence-sink rule forbids.

Two boundary rules complete the gate. **The amendment target is a settled statement**: an amendment names the exact
statement it supersedes; still-unsettled planning — an open question, a provisional segment, a sibling's in-flight
design — is ordinary planning input, never an amendment target. **Review findings enter like any other evidence**,
at triage: the tree runs over a `fix` disposition before the set is approved. Steps 1 and 2 exit to the ordinary
review-fix path with no row — the review lane's digest-bound disposition set, the fix commit, and its verification
are the correction's record, and there is no revision work to point at. Steps 3 and 4 record a row, proposed inside
the disposition set so the approved set already binds the amended target and no rationale changes after approval.
Step 5 escalates. Withdrawal and reopen remain the substantial-work case the reopen judgment already owns, where a
corrective parent exists and the ordinary rules apply. The tree is the authoritative answer to "does this correction
re-enter design" — no finding becomes a planning restart by default.

### D3 — Rigor scales by the amendment's own depth, through the canonical procedures at scope

The arm says what changes and who decides; **depth** says how much must be derived and sets the rigor. The amendment
takes the derivation read — `low` / `medium` / `high`, per `resolve-planning-depth` — over the finding and the gap,
and that read, not the work unit's `Class`, governs:

- **`low`** — a determinate correction. The Owner's approval at the existing stop is the gate; no adversarial pass;
  grounding-only `task-audit` over the revision tasks.
- **`medium`** — a bounded set of decisions to compose. The canonical procedures run **at scope, never whole**:
  `create-spec`'s authoring moves and `spec-review`'s coherence slice over the affected elements; `generate-tasks`'
  per-phase grounding audit over the affected phases, and its segmentation read only when a new segment appears. A
  neutral adversarial offer over the footprint.
- **`high`** — design that must be authored, not corrected. The same procedures at scope with the adversarial pass
  recommended, and the work unit's `Class` ratchets to the realized floor, persisted at the amendment capture commit.

This is `resolve-planning-depth`'s re-entry valve applied past activation. The stage procedures carry no lifecycle
prerequisite beyond the artifacts existing, so running them at scope inside an `Active` work unit moves no state,
advances no stage pointer, and repoints nothing; their ceremony steps are skipped by reference until
`composable-workflows` makes the scoping structural.

**The assurance invariant:** an amendment's artifacts pass the gates the originals passed, over the amendment's
footprint, at the amendment's depth. The adversarial rubric is `assess-design-proportionality` plus `design-audit`
plus `spec-review`'s coherence slice — the finalization rubric the original cleared, minus nothing. Prior findings
carry through `adversarial-review`'s `prior-findings` input so untouched elements are never re-attacked; closure
re-runs the detecting verification (D8).

**The accretion guard** covers many `low` amendments summing to a design nobody re-read: the log makes accretion
visible, and the response is the lean `draft-design` already applies to accreting drafts — a suggested consolidation
read (one coherence pass, one proportionality pass over the accreted union, the adversarial offer over that union)
when the log's footprint has touched a material share of the design. Suggest, never enforce; the spec names no
threshold.

### D4 — The ceiling is extraction, never lifecycle regression

The planning workflows are never re-entered whole inside an `Active` work unit, and `draft-design` is never
re-entered at all. An amendment that invalidates the purpose, most of the design, or a landed member's contract
re-opens what the thing _is_ rather than how it lands, and the instrument is `decompose-work-unit`'s shipped
extraction mode — an additive result staged from a cut map, then source thinning: the origin keeps its
implementation and ships as the surviving, still-valid part; the invalidated concern becomes a new work unit that
gets the full canonical process from the headwater.

Two consequences are accepted. **Extraction moves scope, not code:** a landed member's contract is immutable (the
classifier refuses `landed-member-changed`), so when the invalidated part has already landed, the origin ships it
as-is and the new work unit corrects it post-merge — unless a later unlanded member can carry the correction in-WU,
in which case the design arm applies and the ceiling does not. And a hole so large it is really an unauthored design
area, while the identity still holds, is the Owner's call between the design arm at `high` and re-entering the
planning stage; the procedure never makes that call.

The delivery classifier sharpens the ceiling on one side without deciding it. When an amendment supersedes a design
element covered by a landed member, the classifier refuses any change to that member, so the replacement can only
live in an unlanded member or the terminal — and one always exists before merge, because the terminal lands last.
Whether that remainder can carry the replacement is the judgment read above, narrowed to the unlanded members;
nothing in the classifier computes "can carry".

### D5 — The amendment record is one identity with three projections

- **Spec — an `## Amendments` log.** One row per amendment: the amendment's identity and the only mandatory write,
  on every arm. The design body **revises in place** so it always reads as the current design, with the row's id
  marked in parentheses at the edited locus. Frozen surfaces keep their existing rules and cross-reference the row: a
  Non-Goals change appends its `Amended` line carrying the id; a criterion is never edited — a new row appends at
  the end of its group per `validate-criteria`'s ordinal binding, and a superseded one is dispositioned `[~]` at
  verification.
    - **Appended-criterion group.** Under a bound plan the group is the one whose validator can see the evidence —
      the formatting strategy's assignment rule: the group of the member carrying the corrective parent, or the seam
      group when the correction lands at the terminal. A criterion appended to a closed member's group never
      resolves, because the terminal walk dispositions member groups from their recorded reports and never
      re-derives one.
    - **Landed-element exception.** A design element covered by a **landed** delivery member is frozen because the
      bound plan binds it by digest (D10). It is not revised in place: the amendment appends its supersession line
      carrying the row id outside the digested extent and authors the replacing design as a new element in an
      unlanded member or the terminal. In-place revision is given up exactly where a landed member froze the design.
- **Notes — the reasoning**, only when it exceeds a few lines, in a `notes-*` section keyed by the id, with the
  superseded text quoted there on the design arm. The companion is created on first need, as `task-audit` already
  prescribes for a significant finding with no notes file.
- **Task list — the revision work**, citing the id in the revision parent's `_Goal:_`. No forward-amendment
  paragraphs and no provenance in task bodies; the list stays a coherent forward artifact.

The row is a bullet with fixed labels in the corpus's descriptor idiom, two lines at most, parseable later:

```markdown
## Amendments

- **A1** — 2026-09-12 — design: exact-head correction verification enters the existing Candidate transition
  sequence. _Supersedes:_ § Non-Goals ¶3. _Trigger:_ 7.7 member. _Work:_ 7.R. _Revalidated:_ 7.R.c.
- **A2** — 2026-09-14 — task: wire the import command to its production callsite. _Supersedes:_ none.
  _Trigger:_ 2.3 segment. _Work:_ 2.R. _Revalidated:_ pending → 2.5.
```

Grammar, closed so a later CLI can parse and render it: id `A{n}`, sequential per spec; ISO date; arm token
`task` | `spec-depth` | `design`; a one-sentence summary; `_Supersedes:_` a section-and-paragraph locus or `none`;
`_Trigger:_` a site token — `segment` | `member` | `terminal` | `must-stop` | `review` | `door` — preceded by the
detecting task id where one exists (`7.7 member`) or by the finding id at `review`; `_Work:_` the corrective
parent's id, or `review-fix` when the correction is a review-fix increment (D8); `_Revalidated:_` the closing check
per D8 — a task id, `verify-work-unit`, `review-fix`, or `pending → X.Z` while open. The log is the last section of
every spec form — `## Amendments` on the three sectioned forms, a trailing `**Amendments:**` label on the `brief` —
added by the first amendment when the form's template predates it.

### D6 — Revision work anchors to the work it corrects; verifiers only re-record

The R scheme already exists and the cursor is document-order and id-agnostic, so no new numbering or state is
needed. One invariant governs placement: a task-list `[x]` is terminal derived state and never reverses — the cursor
treats a parent's marker as authoritative and never looks beneath a completed parent. The older practice of
reopening a completed parent to hang revision work under it is retired.

- **Corrective work** is an `X.R` parent inserted in the affected phase **before** that phase's verifiers, with its
  own Goal naming the amendment id and the task it corrects, and its increments as subtasks. `X.Y.R` is used only
  while `X.Y` is still open — the gap surfaced inside the increment in flight. Revision work is never nested under a
  verifier.
- **Placement yields to member immutability.** Under a bound plan the affected phase may sit inside a landed
  member's range; the parent then goes in the earliest unlanded member that can carry it, or the terminal. A yielded
  parent takes the **host** phase's id and the ordinary position inside it — before the host member's verifier —
  with its Goal naming the corrected task; the id stays positional, and the Goal plus the back-link carry the
  correction's identity. Placing it earlier in the host member's range is the Owner's call when that member's
  remaining tasks depend on the correction.
- **A second amendment gets its own parent.** Ids run `X.R`, `X.R2`, `X.R3` — one parent per amendment, reused only
  while still open; a completed `X.R` can never absorb the next amendment, because the cursor skips any parent whose
  marker is not open.
- **A corrected task's `_Goal:_` is never edited** — a bound plan digests parent Goal text; a rewrite is refused at
  the next revision for a landed member and forces a replacement for an unlanded one (D10).
- **A corrected task points forward.** When an amendment changes the behavior a completed task recorded, append
  `_Amended in:_ X.R (An)` beneath that task as a Goal-child detail bullet at the depth `_Retired in:_` takes — one
  additive line, preserved verbatim after completion exactly as that bullet is, outside the digested extent — so the
  record stays honest without reversing its marker. A passed segment verifier whose recorded outcome the amendment
  changes takes the same line (D7).
- **Revalidation** closes the corrective parent; what it records is per-site (D8). The verifier never hosts
  corrective work, and a revalidation is never a second suffixed parent — the segmentation scan requires exactly
  one segment-suffixed parent as the last non-member parent of a closing phase and refuses a second as
  `segment-verifier-orphan`.
- **No revision phase by default.** A phase would need its own `_Mode:_` and `_Exit criterion:_` and would be a new
  segment. An amendment that adds a genuinely new capability is ordinary planning at scope — a new segment authored
  through `resolve-plan-segmentation`, which this work unit extracts to a method so `amend-design` can declare and
  fire it at scope (D12) — the extraction trigger the segmentation work recorded.
- **Recovery is monotonic without new state.** The cursor selects the first open parent in document order and its
  first open subtask, so an `X.R` inserted in an earlier phase becomes the current task deterministically; handoff,
  compaction seed, and session-init derive from the same cursor.

**The three worked cases.** A **failed segment verifier** branches on whether the task it corrects is still open:
`X.Y.R` beneath an open `X.Y`, else an `X.R` parent with `X.Y` taking the `_Amended in:_` line; it closes by
re-running the scenario. A **cross-member correction** under a bound plan keeps the landed range immutable, lands
the work in an unlanded member or the terminal, passes the plan revision through the classifier, and re-verifies a
review-driven fix through the shipped review-fix continuation; this procedure supplies the design-record side only.
A **review finding that reopens design** takes the design arm and, when the work unit was withdrawn, returns to
execution through `arc reopen --task` — available only to an unbound work unit or a coherently unbound plan, since
`arc reopen` refuses a coherently bound delivery; a bound stack's correction runs through the review-fix
continuation. The reopen anchor is the **cursor leaf** (`Task X.R.a — …`, never the parent), and `--task` is refused
while the list is closed, so the corrective parent is authored and committed before `arc reopen` runs; `X.Y.R` is
unavailable there.

### D7 — Exit gate: a propagation sweep bounded by the amendment's footprint

The amendment produces a diff of settled things. The sweep is `generate-tasks`' final suite-coherence pass bounded to
what references or depends on the changed elements, in **both directions**: forward over remaining tasks, later
phases' exit criteria, other spec sections and criteria rows; backward over evidence already recorded for the amended
behavior. The backward case that matters is a segment verifier that already passed — its recorded scenario outcome
feeds downstream Success Criteria, so it takes the additive `_Amended in:_` line rather than a rewritten outcome.

The sweep classifies each hit: **unaffected** (recorded as checked), **fold into the same revision batch** (one
corrective loop, not many), or **reopens another design question** (stay in the loop; the detour never exits carrying
a known unsettled thing). The footprint is also what bounds the adversarial pass in D3.

The hit list is greppable when task parents cite the design element they realize. The `— Dn` suffix on a parent's
title becomes a recommended convention for RFC-form specs in the task-list formatting strategy's parent-task
section, and `generate-tasks`' parent-task skeleton step recommends authoring it in the title when a parent realizes
one design element — recommended, never scanned; a CLI footprint read over those citations is a named seam.

### D8 — Closure re-runs the detecting check, recording a delta

The detour is done when the check that opened it passes again. Two facts the row carries are distinct: the **detour
is open** while its corrective parent is open; **`_Revalidated:_`** names the check that closes the loop. They
coincide at a member site and diverge elsewhere. Per site:

| Site                   | `_Revalidated:_`                            | What the re-record contains                                 |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| member verifier        | the delta subtask's id                      | a delta against the member's boundary report                |
| segment verifier       | the re-run verifier's own id                | the scenario's outcome — the verifier's ordinary completion |
| terminal verification  | the `verify-work-unit` rerun                | none — the walk reruns against the current subject          |
| review finding         | the review-fix increment's verification     | none — the increment's own evidence at its scope            |
| must-stop / skill door | `pending → X.Z`, the next covering verifier | the parent closes on its own evidence                       |

**Member-site closure.** The corrective parent's closing subtask carries the delta. The member's closing task, left
`[ ]` at the stop with its boundary report preserved, then closes on the **effective report** — a marker flip whose
completion note cites the delta subtask. The member-boundary step's rule is keyed to a fact local to the task it is
executing: a closing task that already carries a preserved boundary report does not re-walk; it closes on the
effective report. Every answer at the member prompt routes through the gate (D2), so by the time the cursor returns
a preserved report always has a delta recorded against it. The loop as shipped re-runs the walk whenever the cursor
reaches a member's last assigned task, and a second walk is the second full report the delta form exists to prevent.
A log scan that turns this into a probe slot is the named seam; until then the rule reads the task, never the log.

**Review-site closure.** On the spec-changing arms at review there is no corrective parent: the correction is the
review-fix increment, `_Work:_` is `review-fix`, and `_Revalidated:_` is that increment's verification at the
applicability scope the fix disclosed — the review lane's own evidence, with no re-record. When the finding warrants
withdrawal, the work unit reopens and the ordinary rules apply (D6).

**The delta form.** A delta is a **supplement to** the member's report, never a second report: the changed criteria
(including any the amendment appended, with their own evidence), the new span, and the summary; unchanged criteria
are omitted, digests stay in the record where they exist and are never restated. `validate-criteria` gains one
composition rule alongside its report schema: a member's **effective report** is its base boundary report plus its
ordered deltas — same-locus entries overridden by the latest delta, appended criteria present only in the delta, the
span the latest delta's — and the work-unit-scope walk consumes the effective report where it consumes the base one
today. **The walk finds the deltas through the log:** the `## Amendments` rows are the index, and each row's
`_Work:_` locates the corrective parent whose closing subtask carries the delta. A walk that discovered deltas
positionally, or by scanning every revision parent in a member's range, would be a second authority over the same
fact.

**Per-criterion verdict.** Each delta entry carries a verdict that says **why** it is present or absent, borrowing
`evidence-applicability`'s three tokens: `carries` is why an unchanged criterion is omitted; `supplemental` or
`fresh` is why one is listed with new evidence. The tokens are borrowed as vocabulary only — the delta applies them
by judgment per criterion and never invokes that work unit's reducer, whose inputs are a typed path delta and an
evidence kind this question does not have. The verdict never replaces the entry's `state`, which stays `[x]` / `[~]`
/ `[ ]` as the schema requires; a criterion superseded by the amendment is `[~]` citing the row id and carries no
verdict.

**Seam groups compose the same way.** A seam group takes the same effective-report composition and the same log
linkage; a seam's delivery-side constraints are D10's.

**Terminal closure is unchanged.** After a terminal gap is fixed, `verify-work-unit` reruns its walk against the
current work-unit subject as it already prescribes; the delta form is for member re-records, and `verify-work-unit`
is edited only for its entry directive.

**Which gates re-run** is the project's selection rule (`DEV-RULES.PROJECT` § Selecting what to run); this
procedure names no tiers. Once a Candidate exists, `evidence-applicability` owns whether prior review, verification,
and merge evidence still holds and at what scope; this procedure defines no re-verification breadth of its own.

### D9 — No detour state; one capture commit

The detour is represented by what already exists: the open log row, handoff's off-task-list `Next Action` prose for
a mid-triage session boundary, and the cursor once revision tasks exist. No lifecycle state, no meta field, no
marker.

On the **spec-depth and design arms** the amendment capture — log row, revision tasks, body edit, criterion, notes
entry, plus a `Class` ratchet when D3 requires one — lands as **one commit before corrective work begins**, released
at the stop where the Owner authorized it, so the point-in-time design is recoverable from git. That commit is a
planning ceremony, so a `Class` write there honors meta-file timing. `arc finalize create-spec --class <Class>`
performs that write — it persists `Class` only and carries no lifecycle guard — so the workflow invokes the verb
rather than narrating a hand edit; an `amend-design` fire-point on that verb, so the ceremony is named for what it
is, is a seam captured at planning close. The commit routes as `workflowCommit`:

```text
chore(arc): amend design for {name} — A{n}

Context: spec-{name}.md (planning)
```

On the **task arm** nothing in the spec **body** changes — the row is the one spec write, a record rather than
pre-commitment text — and there is no point-in-time design to recover, so the row and the revision tasks ride the
increment's task commit and reach the ordinary completion report. Under a bound delivery plan they land with the plan
revision before the parent executes (D10) on every arm.

At the **review site** there is no separate capture commit: on the spec-changing arms the row and the body edit ride
the review-fix increment's single commit, approved with the disposition set (D2); steps 1 and 2 of the tree write
nothing there.

### D10 — Under a bound delivery plan

The procedure authors no delivery mechanics; it states the interaction and composes against the shipped contracts.
An amendment perturbs plan state on five axes:

- **Task ids and contiguity.** A corrective parent is an assignable task, so a bound plan must cover it. Leaving it
  unassigned refuses as an uncovered assignable task on a task-derived plan; assigning it to a landed member refuses
  as a landed-member change; assigning it to a later member while it sits inside an earlier member's range breaks
  contiguity. Placement therefore yields to member immutability (D6), and **every** corrective parent under a bound
  plan costs a plan revision — accepted rather than replacement-forcing when it lands in an unlanded member.
- **Design-element digests.** The plan binds each design element by an author-supplied digest, so revising a landed
  member's element in place breaks that binding **silently**: nothing revalidates recorded digests against the live
  record, and the break surfaces only when a later inventory author re-derives the digest — possibly never. D5's
  landed-element exception exists for this. Parent task Goals are frozen the same way but bound differently: their
  digests are CLI-derived from the `_Goal:_` extent, so a rewrite surfaces at the next revision — refused for a
  landed member, replacement-forcing for an unlanded one.
- **Seams.** A seam's acceptance and design coverage are guarded as a member's are, and a change touching a landed
  incident refuses. An amendment reaching a seam is bounded by the same landed/unlanded split, and its criteria
  compose through the same effective report (D8).
- **Authoring snapshots.** A delivery-authoring pass pins the parent-task inventory, and inserting a corrective
  parent invalidates that pin. An amendment does not land while an authoring pass is open — finish or discard the
  pass first.
- **Revision before execution.** The plan revision lands **before the corrective parent executes**. Execution-mode
  entry inspection passes an open task outside member coverage through as `not-applicable` — ordinary execution on
  the work-unit branch — so an unassigned parent would run on the terminal top and never reach the member whose
  request and verifier should carry it; the uncovered-task refusal fires only when a revision is next constructed.
  Under a bound plan the capture and the plan revision therefore land together before corrective work on every arm.

Two consequences follow. The **cost** of an amendment under a bound plan is never only a row plus revision work: a
plan revision rides along, and a revision the classifier answers with a replacement reaches every deliverable at or
above the affected one on a stack. And when a landed element's replacement cannot be carried by any unlanded member
or the terminal, the ceiling applies (D4).

**Digest extent convention.** Design-element digests are supplied by whoever authors the inventory, so what the
digest covers is a convention this procedure sets: the element's settled statement text, excluding appended
supersession lines — the same extent rule parent Goals follow. Stated, not enforced; a checker that derives the
digest from the record is a named seam.

### D11 — Naming and vocabulary

The workflow is `amend-design` and the skill door `arc-amend-design`: the meta's `Design` field is the corpus term
for what this amends, and the audit-then-amend pairing reads on it. The three doors are named by verb on purpose —
an audit examines and never edits; an amendment changes. `plan` is the overloaded word (planning phase, task plan,
delivery plan, `arc plan check`) and is avoided. The procedure's load-bearing terms — amendment, arm, footprint,
detour — are defined once, in the workflow, before use; effective report and delta are defined in
`validate-criteria`, their owner. No brief vocabulary entry is added and the always-loaded set does not grow; the
procedure composes constraints that already sit at their fire sites.

### D12 — Ship surface

Each framework edit lands in the package source and the project copy together; the task loop is edited in its
package template and rendered.

Prose:

- `system/workflows/arc/supplemental/amend-design.md` (new) — the procedure, D1–D10, authored per the
  workflow-authoring strategy with the signature, the arms as gates, stable anchors, its interlock, and the
  `workflowCommit` fire site; declares `resolve-planning-depth`, `classify-work-unit`, `task-audit`, `spec-review`,
  `adversarial-review`, `assess-design-proportionality`, `design-audit`, `validate-criteria`, and
  `resolve-plan-segmentation` as the methods its arms may fire.
- `system/methods/resolve-plan-segmentation.md` (new) — the procedure `generate-tasks` carries inline today,
  extracted with its content unchanged so a second consumer can declare it; `generate-tasks` keeps a declared
  signature callsite. This is the extraction trigger the segmentation work recorded.
- `system/.internal/skills/arc-amend-design/SKILL.md` (new) — the ad-hoc door, dispatching into the workflow; its
  description is a directive firing condition naming the trigger and the default it suppresses (a specific finding
  or suspected gap: enter the gate, which decides whether it is an amendment; do not patch inline or nest revision
  work under a verifier), and it carries D1's door rule.
- the task-loop workflow template — the segment-site directive (a failed scenario is not a completion), the three
  answers of the unresolved member-report prompt mapped to arms, the no-re-walk rule in the member-boundary step,
  and the must-stop directive.
- `verify-work-unit` — the unmet-criterion entry directive; `review-response` — the `fix`-disposition directive;
  `reopen-work-unit` — the entry directive and the corrected `--task` example anchor.
- the `arc-task-audit` and `arc-design-audit` skills — route-onward lines carrying D1's door rule: a specific
  finding enters `amend-design`; the task audit's broad design escalation to the design audit stays.
- `validate-criteria` — the effective-report composition rule, the delta form, and the log linkage beside the
  report schema.
- the task-list formatting strategy — § Revision Numbering gains the `X.R2` ids, the placement rules, and the
  retirement of parent reopening; `_Amended in:_` joins `_Retired in:_` as a protected post-completion bullet; the
  appended-criterion group rule joins § Success Criteria; the `— Dn` suffix recommendation.
- the task-list template — `_Amended in:_` shown as a Goal-child detail bullet; it is the first protected
  detail bullet the template carries, and that shape is what keeps the parent's Goal digest stable.
- `generate-tasks` — the `— Dn` recommendation in the parent-task skeleton step, the segmentation section
  becoming a declared callsite of the extracted method, and one pre-save checklist clause excepting `_Amended in:_`
  from the no-amendment-provenance rule, which the checklist otherwise forbids in the task bodies D6 requires it in.
- `DEV-RULES.ARC` § Method and extension loading — the same rule in its always-loaded form, restated
  conditionally (A1). Leaving it categorical while the strategy read conditionally would make this work unit's own
  direct `adversarial-review` declaration read as a violation against the surface an executing session has loaded.
- `strategy-workflow-authoring.md` — the method-declaration rule restated conditionally. Its categorical form
  ("a workflow never redeclares those dependencies") does not disambiguate a method the declaring body fires
  directly, which `amend-design` is the first case of; loading is fire-point-gated and the resolved graph dedupes,
  so what the rule protects is encapsulation rather than context. The refinement ships with this work unit rather
  than after it, so the first instance does not land ahead of the wording that licenses it.
- the four spec templates — a trailing `## Amendments` section carrying the heading and one example row; the
  grammar itself is defined once, in the workflow's record section (D5), never restated per template.
- the formatting strategy's evidence-sink rule — gains the one forward pointer it lacks: where a failed exit
  criterion's correction lands (`amend-design`).
- the package-project sync strategy's file inventory — its Framework and Configurable counts and its enumerated
  Configurable list are hand-maintained and move with the three added files.

Code, in the CLI package — registration only, no behavior:

- `lib/skills/resolution.ts` — `arc-amend-design` joins `CANONICAL_SKILLS`;
- `lib/classification.ts` — the extracted method joins the Configurable set; the list is hand-maintained and
  Framework is the default, so an omission mis-classifies the file rather than failing loudly;
- `init-recipe.json` — the workflow, the method, and the skill join the install set; the skills README, which
  enumerates every skill, gains a row, and the project instance's manifest gains an entry per file. The methods
  README lists only methods carrying related methods, so an independent method adds no row there;
- the explicit init/update inventory tests that enumerate skills, methods, and supplemental workflows, plus the
  sync test's direct-planning-consumer list, which `amend-design` joins by declaring
  `assess-design-proportionality`.

## Alternatives & Rationale

- **Re-enter the original planning workflows whole, or regress lifecycle state to re-plan.** Rejected — the detour
  needs their _moves_ at amendment scope, not their whole-work-unit ceremony, and lifecycle regression has been
  tried here and found painful. The procedures run at scope; the identity-breaking case exits by extraction.
- **Status quo (ad hoc handling).** Rejected — the motivating problem, with the archived evidence above.
- **Scope to design gaps only.** Rejected — most observed instances are task or spec-depth gaps; a design-only
  workflow leaves the common case unowned and pulls agents into design elicitation for missing-wiring fixes.
- **Name it `amend-plan`.** Rejected — `plan` is overloaded; `Design` is the corpus term for the target.
- **An entry mode absorbing the audit doors.** Rejected — it fused detection with correction, retired a shipped door
  another work unit still targets, and no surveyed change-control tradition does it: audits detect, change control
  corrects.
- **Scale rigor by the work unit's `Class` instead of the amendment's depth.** Rejected — a `Light` work unit can
  take a `high` amendment and a `Heavy` one a `low` fix; keying to `Class` over-taxes the common case or
  under-reviews the rare one. `Class` ratchets from the depth read instead.
- **Append amendment blocks inside the spec body.** Rejected — the corpus's own failure mode and the documented one
  (design-doc archaeology). The body revises in place and the log carries history, with one mechanical exception
  where a landed member froze an element by digest.
- **A separate amendment document per change.** Rejected — the same archaeology cost, and it would sit outside the
  planning group `evidence-applicability` treats as evidence-neutral.
- **A dedicated `.R` revision phase.** Rejected as the default — a new segment under the shipped scan, detached from
  the work it corrects; reserved for a genuinely new capability.
- **A formal lifecycle state for "amending."** Deferred — disproportionate for a detour; the lifecycle record belongs
  to `wu-lifecycle-state-model`, and the open log row carries the in-flight fact.
- **Defensive full re-audit before resuming.** Rejected — repeats pre-implementation planning cost on every
  amendment; the footprint-bounded sweep and pass are the minimal sufficient middle.
- **A mechanical ceiling trigger decided by the classifier.** Rejected on verification — the classifier refuses only
  changes to landed members, and an unlanded home always exists before merge, so "can carry" is a judgment read the
  classifier narrows rather than makes.
- **The corrected phase's id for a yielded parent.** Rejected — ids are positional; a `3.R` inside phase 6 breaks the
  document-order reading, and the `X.R2` counter would collide across host placements. The Goal and the back-link
  already carry the correction's identity.
- **A fresh three-way vocabulary for the delta verdict.** Rejected — the question is the one `evidence-applicability`
  defines, and two vocabularies for one concept is the worse outcome; the borrow is stated as vocabulary-only.

Externally, every mature change-control tradition puts a cheap classification gate before impact analysis — IETF
errata versus a bis document, EIA-649 Class II versus Class I, PRINCE2's tolerance breach — so small changes never
trigger a full re-plan. Documents that steer active builders (KEPs, RFDs, PEPs before Final) are edited in place with
a terse dated log; documents that preserve rationale (ADRs, accepted RFCs) are immutable and superseded. ARC's spec
is both, already split by section, and D5 follows that split. Closure follows the TDD regression idiom and ECO
verification practice: a change closes only when verified against the originating gap.

## Cross-cutting Considerations

**Audience boundary.** The workflow, skill, method edits, strategy edits, and templates are adopter-facing: they
carry the procedure only and name no internal work unit, corpus figure, or transitional state. Rationale stays in
this spec and its notes companion.

**Testing.** The ship surface is prose plus registration. What is mechanically testable: the skill and workflow
resolve in the install set (the existing inventory tests), every edited Framework-classified surface is
byte-identical across the package source and the project copy (the existing sync test) and every edited
Configurable method's `.default` section is identical by diff, the row grammar and the `_Amended in:_` line lint
clean under the descriptor rules, and a task list carrying an `X.R2` parent and an `_Amended in:_` bullet parses
through the structural and segmentation scans, the cursor, and the delivery task inventory without refusal. No new
lint rule, scan, or CLI verb is added.

**Migration and rollout.** Existing specs carry no `## Amendments` section; the first amendment adds it. Active work
units whose task lists predate the `_Amended in:_` convention gain it on first use; nothing back-fills. The retired
practice of reopening a completed parent is stated in the formatting strategy as retired, not migrated.

**Performance.** None — no runtime path changes.

**Security and authority.** The procedure moves no authority: pre-commitment text stays the Owner's, revision
subtasks stay agent-doable under discovered-work routing, and the classifier's refusals are consumed, never
bypassed. A row is a record, never a gate or a satisfying-evidence claim.

**Forward compatibility** (checked 2026-09-11 against the procedure-evolution and knowledge-evolution check-docs and
the `composable-workflows` draft). The only state dispatch — whether a delivery plan is bound — is already computed
by `arc delivery entry inspect`; the tree, the depth read, and the sweep are judgment over the record; the no-re-walk
rule reads a fact on the task being executed, never the log (D8). The row grammar, amendment numbering, footprint
read, digest derivation, log scan, the `amend-design` finalize fire-point, and cursor diagnostic are named as CLI
seams. The workflow is a loop
sub-protocol authored as a signature-led supplemental workflow with heading anchors — the contract shape's Level 1
and the fragment test's procedural kind, with five consumers — so it lifts into a public method-shaped fragment
unchanged; "procedures at scope" is the procedure-library cut that work unit designs. Triggers are
operation-anchored directive lines; the skill description names its trigger and suppressed default; the grammar and
each load-bearing term have one definition site. Two accepted prose residues: the segment-site stop line is a prose
template, because nothing observes a segment-verifier failure today and there is no slot to precompose from; and the
at-scope re-entry of `create-spec` and `generate-tasks` runs by reference until the procedure-library cut makes it
structural. The resident loop core grows by the four directive lines the loop model requires to stay in the core.
No new invariant is placed, and the always-loaded rule set changes by one line: `DEV-RULES.ARC` § Method and
extension loading restates the method-declaration rule conditionally, so the always-loaded surface and the strategy
read alike (A1).

**Coordination.** `plan-segmentation` and `delivery-native-stack-composition` (shipped) supply the contracts D6, D8,
and D10 compose against — read at the source. `evidence-applicability` (active) is consumed by name for the verdict
tokens and the planning-group evidence-neutral classification; no dependency edge. `test-suite-right-sizing`
(planning) owns tier selection; `decomposition-doctrine` (planning) owns the boundary the ceiling lands on;
`composable-workflows` (backlog) owns the fragment cut; `task-list-conventions` (backlog) owns later formatting
conventions and folds this work unit's strategy edits, which land here because the procedure needs them first;
`planning-iteration-mechanics` keeps its task-audit door concern intact. `delivery-correction-convergence` and
`review-orchestration-right-sizing` are orthogonal and cross-referenced. The cursor's silent skip of an open child
under a `[x]` parent is captured for its owner and not depended on.

**Boundary fit and Class.** `assess-boundary-fit`: stays one work unit — one concern designed as a whole; the seams
above are coordination, and the ship surface is prose, two method edits, one extracted method, registration, and
templates, so no delivery-plan candidate. `classify-work-unit`: `Heavy` — derivation fired (the gate, the ladder,
the record, placement, and closure had to be authored) and the design composes established practice rather than
inventing it; scale does not fire.

## Success Criteria

- `amend-design.md` ships as a supplemental workflow with the D1 signature, the D2 tree with its five steps, three
  arms, and authority rules, the D3 ladder and assurance invariant, the D4 ceiling, the D5 record, the D6 placement
  rules, the D7 sweep, the D8 per-site closure table, the D9 capture commit, and the D10 interaction — each under a
  stable anchor, with no internal work-unit reference in its prose.
- `arc-amend-design` ships as a canonical skill, resolves in `CANONICAL_SKILLS` and the install recipe, and
  dispatches into the workflow.
- All five detection sites carry a directive line that enters `amend-design` by anchor: the task loop's segment-site
  stop, the three answers of its member-report prompt, and its must-stop; `verify-work-unit`'s unmet-criterion
  stop; `review-response`'s `fix` disposition. The task loop's member-boundary step carries the no-re-walk rule.
- `arc-task-audit` and `arc-design-audit` route onward to `amend-design`; `reopen-work-unit`'s example anchors a
  cursor leaf and its entry directive names the bound-delivery refusal.
- `validate-criteria` carries the effective-report composition rule, the delta form with the borrowed three-token
  verdict stated as vocabulary-only, and the log-driven delta linkage.
- `resolve-plan-segmentation` ships as a method with its content unchanged, declared and fired from both
  `generate-tasks` and `amend-design`, and resolves in the install set.
- The task-list formatting strategy carries the `X.R2` ids, the placement rules including yielded placement, the
  retirement of parent reopening, `_Amended in:_` as a protected post-completion bullet, the appended-criterion group
  rule, the `— Dn` recommendation, and the evidence-sink rule's forward pointer; the task-list template carries
  `_Amended in:_`; `generate-tasks` carries the `— Dn` recommendation in its parent-task skeleton step and the
  checklist clause excepting `_Amended in:_` from its no-amendment-provenance rule.
- `strategy-workflow-authoring.md`'s method-declaration rule reads conditionally — a workflow declares what its
  own body fires, never what it would carry only on a declared method's behalf — with the striking test stated, and
  no existing corpus declaration changes under it.
- The three sectioned spec templates carry a trailing `## Amendments` section and the brief a trailing
  `**Amendments:**` label, each with a placeholder row; the grammar is defined once, in the workflow.
- A task list declaring more than one segment, carrying an `X.R` inside a segment-closing phase ahead of that
  phase's verifier plus an `X.R2`, an `X.Y.R`, and an `_Amended in:_` bullet under a `[x]` parent, parses without
  refusal through the structural and segmentation scans, the task cursor, and the delivery task inventory, with the
  Goal digest unchanged by the appended bullet.
- Every edited framework surface's shipped content is identical in the package source and the project copy —
  Framework files and the two edited Configurable methods by the sync test's whole-file equality, other
  Configurable files by `.default` diff — with the task loop and `generate-tasks` edited in their templates.
- All quality gates pass (tests, linting, type checking).
- Ready for integration.
- `DEV-RULES.ARC` § Method and extension loading reads the method-declaration rule conditionally, matching
  `strategy-workflow-authoring.md`, in both the package source and the project copy.

## Open Questions

- **Whether the five detection sites are complete.** The archived evidence and the shipped verifier family name
  these five; a sixth would surface as a site with no directive, and the skill door covers it until it is named.
  Resolved by use.
- **The accretion threshold.** "A material share of the design" is a lean the spec deliberately leaves unnumbered;
  a heuristic (row count, footprint union) may be recorded after the first accreting work unit, never a gate.
- **Whether `evidence-applicability`'s tokens survive as a per-criterion label.** The borrow is vocabulary-only and
  disclaimed as such; if that work unit's shipped vocabulary shifts, the delta form renames without design change.

## Amendments

- **A1** — 2026-09-11 — design: the work unit does change always-loaded content, so the claim that it does not is
  superseded. _Supersedes:_ § Cross-cutting Considerations ¶Forward compatibility. _Trigger:_ door. _Work:_ 2.6.
  _Revalidated:_ verify-work-unit.
- **A2** — 2026-09-11 — task: the shipped meta-reference pattern refuses the `X.R2` ids the placement rules settle.
  _Supersedes:_ none. _Trigger:_ door. _Work:_ 5.R. _Revalidated:_ pending → 6.1.
- **A3** — 2026-09-12 — task: the shipped closure section carries the Candidate-applicability ownership D8 states
  and its derivation dropped. _Supersedes:_ none. _Trigger:_ door. _Work:_ 2.R. _Revalidated:_ pending → 6.1.
