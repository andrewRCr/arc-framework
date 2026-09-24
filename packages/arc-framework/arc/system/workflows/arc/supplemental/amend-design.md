---
purpose: Decide what an implementation-time finding changes in the design record and its derivation, then record the amendment, revise, and close on the check that opened it.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
    - resolve-plan-segmentation
    - task-audit
    - spec-review
    - adversarial-review
    - assess-design-proportionality
    - design-audit
    - validate-criteria
---

# Workflow: Amend Design

> **Signature:** `amend-design(finding, design record) → amended record + revision work | design holds | escalate`

Entered when implementation evidence meets the **design record** — the artifact the meta's `Design` field names,
draft or spec — or its derivation into tasks. **Responsive only:** entry presupposes a finding and commits to
nothing. The first answer the gate returns is usually that the design holds and only its derivation was incomplete.

Run it at the stop you are already at. It moves no lifecycle state, advances no stage pointer, and never re-enters
a planning workflow whole.

**The section headings below are load-bearing.** The detection sites and the ad-hoc door enter this workflow by
anchor. Rename a heading only with every citing site updated in the same change.

**`adversarial-review` is declared here in its own right.** The depth ladder fires it directly; that
[`validate-criteria`][validate-criteria] also owns it as a dependency does not make this declaration redundant.

## The spine

1. **Gate** — run the tree over the finding. It returns an arm, or that this is not an amendment. § Entry gate
2. **Depth** — resolve the amendment's own derivation depth; it sets the rigor. § Depth and rigor
3. **Capture** — write the record; on the spec-changing arms commit it before corrective work.
   § The amendment record, § The capture commit
4. **Revise** — place the corrective work against the task it corrects. § Placement of revision work
5. **Sweep** — propagate over the footprint, forward and backward. § The propagation sweep
6. **Close** — re-run the check that opened the detour. § Closure

## Vocabulary

- **Amendment** — a change to a settled statement in the design record, or to the derivation that realizes it,
  made after that statement settled. Narrower than the append-only `Amendments` tier an ADR carries, and not a
  delivery plan revision; either may accompany an amendment, neither is one.
- **Arm** — which kind of change the evidence selects: `task`, `spec-depth`, or `design`. The gate returns one.
- **Footprint** — the settled elements one amendment changes, plus what cites or depends on them. It bounds the
  sweep and the adversarial pass; nothing outside it is re-attacked.
- **Detour** — the span from entry to closure. It is open while its corrective parent is open and carries no
  lifecycle state of its own.

**Effective report** and **delta** are defined in [`validate-criteria`][validate-criteria] and used here unchanged.

## Entry gate

The floor is whether the evidence **falsifies the design record or its derivation**. Below that floor the finding
is the task loop's ordinary minor deviation.

Run the steps top-down at the stop you are already at. **First match wins**, and the match cites the statement or
criterion that decided it.

1. **The tasks as written still produce every stated outcome; only how changes.** Not an amendment — continue on
   the minor-deviation path.
2. **A stated outcome is not produced, a statement already requires it, and the settled design would have produced
   it.** A Success Criterion, exit criterion, lifecycle row, or design element covers the missing behavior and the
   task list failed to realize it — modules built but unreachable, production callers left unwired. → **task
   arm**: the derivation was incomplete; revision work only. If producing the outcome means reversing a settled
   decision, this step does not match — go to step 4.
3. **A needed outcome is not produced, no statement requires it, and it sits inside the Goals.** The intent
   requires it but nothing is deep enough to generate it. → **spec-depth arm**: elaborate the record in place, and
   append a criterion to the group whose validator can see its evidence, so the hole becomes checkable.
4. **A settled statement must change** — a decision reversed, a criterion superseded, a Non-Goal breached. →
   **design arm**: settle the fix through narrowed elicitation, record the supersession, then revision work.
5. **Outside the Goals, or it changes what the work unit is** — its purpose, a deliverable boundary, a landed
   member's contract. → **escalate**. § The ceiling.

Steps 2 and 3 are a lookup against the record: where the settled design would have produced the outcome, an
existing statement means the derivation failed, and no statement means the record has a hole the amendment's first
duty is to close. Neither step settles whether the design itself is wrong — a criterion can exist, be faithfully
derived, and still name a decision that must be reversed. That is step 4's question.

**Coarse coverage routes to step 3.** When the criteria are too coarse to decide between steps 2 and 3, treat the
outcome as uncovered and append the criterion, so the next occurrence is decidable.

Every arm above the task arm therefore adds or supersedes a criterion — what the sweep and the closing delta
anchor on.

**Two boundary rules.**

- **The target is a settled statement.** An amendment names the exact statement it supersedes. Still-unsettled
  planning — an open question, a provisional segment, a sibling's in-flight design — is ordinary planning input,
  never an amendment target.
- **A review finding enters like any other evidence**, at triage, over a `fix` disposition before the set is
  approved. Steps 1 and 2 exit to the ordinary review-fix path and write no record: the disposition set, the fix
  commit, and its verification already carry the correction, and there is no revision work to point at. Steps 3
  and 4 record a row, proposed inside the disposition set so the approved set already binds the amended target.
  Step 5 escalates.

## Authority by arm

Changing pre-commitment text commits the Owner and is never the agent's to discharge. Adding revision subtasks
inside the current increment is agent-doable under discovered-work routing, reported at the interlock.

- **Task arm** — proceed within the increment. The record row and the revision work ride the increment's task
  commit and reach the ordinary completion report. The row is a record rather than pre-commitment text, so
  appending it needs no authorization of its own.
- **Spec-depth and design arms** — Owner-authorized at a stop that already exists. The report at that stop carries
  the triage read, the cited statement or criterion, the depth read, and a lean; the Owner's direction is the
  authorization. No new prompt shape, and the procedure is never agent-invoked into design.
- **Escalation** — the Owner's, always.

User direction overrides any arm at any time. When the read is torn between steps 2 and 3, ask in one line at the
stop you are already at.

**At the member verifier** the three answers to the unresolved-criteria prompt are that direction: `Fix now` is the
task arm, `amend` the spec-depth or design arm, and `defer` a supersession on the design arm. All three enter this
gate, and none lands work inside the verifier's own increment.

> [!IMPORTANT]
> `task-interlock`: Stop before the spec-depth or design arm writes anything. Surface the triage read, the cited
> statement or criterion, the depth read, and the recommended arm; await approval before proceeding to the
> amendment capture.

## Depth and rigor

The arm says what changes and who decides; **depth** says how much must be derived, and it is what sets the rigor.
Run [`resolve-planning-depth`][resolve-planning-depth] over the finding and the gap — not over the work unit — and
take the level it returns. The work unit's `Class` does not govern here.

- **`low`** — a determinate correction. The Owner's approval at the existing stop is the gate and no adversarial
  pass runs. Run [`task-audit`][task-audit] at grounding-only depth over the revision tasks.
- **`medium`** — a bounded set of decisions to compose. The canonical procedures run **at scope, never whole**:
  the spec stage's authoring moves and [`spec-review`][spec-review]'s coherence slice over the affected elements;
  [`task-audit`][task-audit] over the affected phases; and
  [`resolve-plan-segmentation`][resolve-plan-segmentation] only when a new segment appears. Offer
  [`adversarial-review`][adversarial-review] over the footprint, neutrally.
- **`high`** — design that must be authored rather than corrected. The same procedures at scope, with the
  adversarial pass recommended. Run [`classify-work-unit`][classify-work-unit] to ratchet `Class` to the realized
  floor; the write itself lands at the capture commit (§ The capture commit).

**Stage procedures at scope move nothing.** They carry no lifecycle prerequisite beyond the artifacts existing, so
running them inside an active work unit moves no lifecycle state, advances no stage pointer, and repoints nothing.
Skip their ceremony steps by reference.

### The assurance invariant

An amendment's artifacts pass the gates the originals passed, over the amendment's footprint, at the amendment's
depth. The depth ladder governs whether an adversarial pass is omitted, offered, or recommended. When an eligible
pass is authorized, run it on the finalization rubric the original cleared, minus nothing —
[`assess-design-proportionality`][assess-design-proportionality], [`design-audit`][design-audit], and
[`spec-review`][spec-review]'s coherence slice — and pass prior findings through `adversarial-review`'s
`prior-findings` input so untouched elements are never re-attacked. Closure re-runs the detecting check
(§ Closure).

### The accretion guard

Many `low` amendments can sum to a design nobody re-read. The log makes that visible, and the response is the
consolidation read [`draft-design`][draft-design] already applies to an accreting draft: one coherence pass, one
proportionality pass over the accreted union, and the adversarial offer over that union — once the log's footprint
has touched a material share of the design. Suggest it, never enforce it; no threshold is named.

## The ceiling

An amendment that invalidates the purpose, most of the design, or a landed delivery member's contract re-opens
what the work unit **is** rather than how it lands. Exit by extraction — [`decompose-work-unit`][decompose] in its
extraction mode, invoked per that workflow's own shape, since a complete extraction stages an additive result from
a cut map and then thins the source. The origin keeps its implementation and ships as the surviving, still-valid
part; the invalidated concern becomes a new work unit that takes the full canonical process from the headwater.

Never a whole planning-workflow re-entry, and never a lifecycle regression.

Two consequences are accepted.

- **Extraction moves scope, not code.** A landed member's contract is immutable, so where the invalidated part has
  already landed, the origin ships it as-is and the new work unit corrects it after merge — unless a later
  unlanded member can carry the correction in this work unit, in which case the design arm applies and the ceiling
  does not.
- **"Can carry" is a judgment read.** The delivery classifier refuses any change to a landed member, which narrows
  the question to the unlanded members and the terminal; nothing computes the answer. And a hole large enough to
  be an unauthored design area, while the work unit's identity still holds, is the Owner's call between the design
  arm at `high` and re-entering the planning stage — this procedure never makes that call.

## The amendment record

One amendment has one identity in three projections: a log row in the design record, reasoning in the notes
companion when it runs past a few lines, and revision work in the task list.

### The log

`## Amendments` is the last section of the design record — a trailing `**Amendments:**` label on the brief form —
and the first amendment adds it when the record's template predates it. One row per amendment, and on every arm
the row is the only mandatory write.

```markdown
- **A1** — 2026-09-12 — design: exact-head correction verification enters the existing transition sequence.
  _Supersedes:_ § Non-Goals ¶3. _Trigger:_ 7.7 member. _Work:_ 7.R. _Revalidated:_ 7.R.c.
- **A2** — 2026-09-14 — task: wire the import command to its production callsite. _Supersedes:_ none.
  _Trigger:_ 2.3 segment. _Work:_ 2.R. _Revalidated:_ pending → 2.5.
```

The grammar is closed and defined here only. A row runs two lines at most, in this order:

- **id** — `A{n}`, sequential within the record.
- **date** — ISO.
- **arm token** — `task` | `spec-depth` | `design`.
- **summary** — one sentence.
- `_Supersedes:_` — a section-and-paragraph locus, or `none`.
- `_Trigger:_` — a site token, `segment` | `member` | `terminal` | `must-stop` | `review` | `door`, preceded by
  the detecting task id where one exists, or by the finding id at `review`.
- `_Work:_` — the corrective parent's id, or `review-fix` when the correction is a review-fix increment.
- `_Revalidated:_` — the closing check: a task id, `verify-work-unit`, `review-fix`, or `pending → X.Z` while the
  detour is open.

### Where the change lands in the record

- **The body revises in place**, so the record always reads as the current design, with the row's id marked in
  parentheses at the edited locus.
- **Frozen surfaces keep their own rules and cross-reference the row.** A Non-Goals change appends its `Amended`
  line carrying the id. A criterion is never edited: a new one appends at the end of its group, and a superseded
  one is dispositioned `[~]` at verification.
- **An appended criterion joins the group whose validator can see its evidence** — under a bound plan, the group
  of the member carrying the corrective parent, or the seam group when the correction lands at the terminal. A
  criterion appended to a closed member's group never resolves.
- **Landed-element exception.** A design element covered by a landed delivery member is bound by digest and is not
  revised in place. Append its supersession line carrying the row id **outside the digested extent**, and author
  the replacing design as a new element in an unlanded member or the terminal.

### Notes and task-list projections

Reasoning lands in the `notes-{name}.md` companion, in a section keyed by the row id and only when it runs past a
few lines; on the design arm, quote the superseded text there. Create the companion on first need, as
[`task-audit`][task-audit] already prescribes.

The task list carries the revision work, citing the row id in the corrective parent's `_Goal:_`. No
forward-amendment paragraphs and no provenance in task bodies — the list stays a coherent forward artifact.

## The capture commit

On the **spec-depth and design arms** the capture — log row, revision tasks, body edit, criterion, notes entry,
and the `Class` ratchet where the depth read requires one — lands as **one commit before corrective work begins**,
released at the stop where the Owner authorized it, so the point-in-time design is recoverable.

Write the `Class` ratchet with `arc finalize create-spec --class <Class>` rather than editing the meta by hand:
the capture is a planning ceremony and that verb performs the write with no lifecycle guard.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): amend design for {name} — A{n}

Context: spec-{name}.md (planning)
```

On the **task arm** nothing in the record's body changes — the row is the one write, and a record rather than
pre-commitment text — so the row and the revision tasks ride the increment's task commit and reach the ordinary
completion report.

At the **review site** there is no separate capture commit: on the spec-changing arms the row and the body edit
ride the review-fix increment's single commit, approved with the disposition set.

Under a bound delivery plan the capture and its plan revision land together, before corrective work, on every arm
(§ Under a bound delivery plan).

## Placement of revision work

The id series, the R scheme's placement mechanics, and the retirement of parent reopening live in
[the task-list formatting strategy][task-list-formatting]. What the amendment decides:

- **Which parent takes the work.** A new `X.R` parent in the affected phase, ahead of that phase's verifiers.
  `X.Y.R` applies only while `X.Y` is still open — the gap surfaced inside the increment in flight. Revision work
  is never nested under a verifier.
- **One parent per amendment.** A completed corrective parent never absorbs the next amendment; that one gets its
  own.
- **A corrected task's `_Goal:_` is never edited.** A bound plan digests parent Goal text, so a rewrite is refused
  at the next revision for a landed member and forces a replacement for an unlanded one.
- **A corrected task points forward.** Where an amendment changes the behavior a completed task recorded, append
  `_Amended in:_ X.R (An)` beneath it as a Goal-child detail bullet — one additive line, preserved verbatim after
  completion and outside the digested extent — so the record stays honest without reversing a marker. A passed
  segment verifier whose recorded outcome the amendment changes takes the same line.
- **No revision phase by default.** A phase would need its own mode and exit criterion, which makes it a new
  segment. An amendment adding a genuinely new capability is ordinary planning at scope: a new segment resolved
  through [`resolve-plan-segmentation`][resolve-plan-segmentation].

**Three worked cases.**

- **A failed segment verifier** branches on whether the task it corrects is still open: `X.Y.R` beneath an open
  `X.Y`, otherwise an `X.R` parent with the corrected task taking the `_Amended in:_` line. It closes by re-running
  the scenario.
- **A cross-member correction under a bound plan** keeps the landed range immutable, lands the work in an unlanded
  member or the terminal, passes the plan revision through the classifier, and re-verifies a review-driven fix
  through [`deliver-stack`][deliver-stack]'s review-fix continuation. This procedure supplies the design-record
  side only.
- **A review finding that reopens design** takes the design arm. Where the work unit was withdrawn, it returns to
  execution through [`reopen-work-unit`][reopen-work-unit], anchored on the cursor leaf rather than the parent;
  that path refuses a coherently bound delivery, so a bound stack's correction runs through the review-fix
  continuation instead. Author and commit the corrective parent before the reopen runs.

## The propagation sweep

The amendment produces a diff of settled things. Sweep what references or depends on the changed elements, bounded
by the footprint, in both directions:

- **Forward** — remaining tasks, later phases' exit criteria, other record sections, and criteria rows.
- **Backward** — evidence already recorded for the amended behavior. The case that matters is a segment verifier
  that already passed: its recorded scenario outcome feeds downstream criteria, so it takes the additive
  `_Amended in:_` line rather than a rewritten outcome.

Classify each hit as **unaffected** (recorded as checked), **fold into the same revision batch** (one corrective
loop, not many), or **reopens another design question** (stay in the loop). The detour never exits carrying a
known unsettled thing.

The hit list is greppable wherever parent titles cite the design element they realize.

## Closure

The detour is done when the check that opened it passes again. Two facts the row carries are distinct: the detour
is **open** while its corrective parent is open, and `_Revalidated:_` names the check that closes the loop. They
coincide at the member site and diverge elsewhere.

| Site                   | `_Revalidated:_`                            | What the re-record contains                                 |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| member verifier        | the delta subtask's id                      | a delta against the member's boundary report                |
| segment verifier       | the re-run verifier's own id                | the scenario's outcome — the verifier's ordinary completion |
| terminal verification  | the verification rerun                      | none — the walk reruns against the current subject          |
| review finding         | the review-fix increment's verification     | none — the increment's own evidence at its scope            |
| must-stop / skill door | `pending → X.Z`, the next covering verifier | the parent closes on its own evidence                       |

**Member-site closure.** The corrective parent's closing subtask records the delta — run
[`validate-criteria`][validate-criteria] over the changed criteria and the amendment's span; that method defines
the delta's shape, a supplement to the preserved report rather than a second one. The member's closing task, left
`[ ]` at the stop with its boundary report preserved, then closes on the **effective report**: a marker flip whose
completion note cites the delta subtask. **A closing task that already carries a preserved boundary report does
not re-walk** — it closes on the effective report. That rule reads a fact on the task being executed, never the
log.

**Review-site closure.** On the spec-changing arms at review there is no corrective parent: the correction is the
review-fix increment, `_Work:_` is `review-fix`, and `_Revalidated:_` is that increment's verification at the
scope the fix disclosed. Where the finding warrants withdrawal, the work unit reopens and the ordinary rules
apply.

**Terminal closure is unchanged** — [`verify-work-unit`][verify-work-unit] reruns its walk against the current
work-unit subject as it already prescribes; the delta form is for member re-records.

Which gates re-run is the project's own selection rule; this procedure names no tiers. Once a Candidate exists,
whether prior review, verification, and merge evidence still holds — and at what scope — is settled by the
review-applicability disclosure [`prepare-work-unit`][prepare-work-unit] prescribes, never here. An amendment
landing after attestation closes its own check and still owes that disclosure.

## Under a bound delivery plan

This procedure authors no delivery mechanics. Whether a delivery plan is bound is a typed result, not a prose
comparison: take it from the execution-mode `arc delivery entry inspect` the task loop already runs and dispatch
on that result; never re-derive plan state by reading the plan.

An amendment perturbs plan state on five axes.

- **Task ids and contiguity.** A corrective parent is an assignable task, so a bound plan must cover it. Leaving
  it unassigned refuses as an uncovered assignable task; assigning it to a landed member refuses as a
  landed-member change; assigning it to a later member while it sits inside an earlier member's range breaks
  contiguity. Placement therefore yields to member immutability, and every corrective parent under a bound plan
  costs a plan revision.
- **Design-element digests.** The plan binds each design element by an author-supplied digest, so revising a
  landed member's element in place breaks that binding silently — nothing revalidates recorded digests against the
  live record. The landed-element exception exists for this. Parent task Goals are frozen the same way but bound
  differently: their digests are derived from the `_Goal:_` extent, so a rewrite surfaces at the next revision,
  refused for a landed member and replacement-forcing for an unlanded one.
- **Seams.** A seam's acceptance and design coverage are guarded as a member's are, and a change touching a landed
  incident refuses. An amendment reaching a seam takes the same landed/unlanded split, and its criteria compose
  through the same effective report.
- **Authoring snapshots.** A delivery-authoring pass pins the parent-task inventory, and inserting a corrective
  parent invalidates that pin. An amendment does not land while an authoring pass is open — finish or discard the
  pass first.
- **Revision before execution.** The plan revision lands **before the corrective parent executes**. An unassigned
  parent would otherwise run outside member coverage and never reach the member whose request and verifier should
  carry it.

Two consequences. An amendment under a bound plan never costs only a row plus revision work: a plan revision rides
along, and a revision the classifier answers with a replacement reaches every deliverable at or above the affected
one on a stack. And where no unlanded member or the terminal can carry a landed element's replacement, the ceiling
applies (§ The ceiling).

**Digest extent convention.** A design element's digest covers the element's settled statement text, excluding
appended supersession lines — the same extent rule parent Goals follow. Stated, not enforced.

---

[validate-criteria]: ../../../methods/validate-criteria.md
[resolve-planning-depth]: ../../../methods/resolve-planning-depth.md
[classify-work-unit]: ../../../methods/classify-work-unit.md
[resolve-plan-segmentation]: ../../../methods/resolve-plan-segmentation.md
[task-audit]: ../../../methods/task-audit.md
[spec-review]: ../../../methods/spec-review.md
[adversarial-review]: ../../../methods/adversarial-review.md
[assess-design-proportionality]: ../../../methods/assess-design-proportionality.md
[design-audit]: ../../../methods/design-audit.md
[draft-design]: ../draft-design.md
[decompose]: ../work-unit-lifecycle/decompose-work-unit.md
[reopen-work-unit]: ../work-unit-lifecycle/reopen-work-unit.md
[deliver-stack]: deliver-stack.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[verify-work-unit]: ../work-unit-lifecycle/verify-work-unit.md
[prepare-work-unit]: ../work-unit-lifecycle/prepare-work-unit.md
