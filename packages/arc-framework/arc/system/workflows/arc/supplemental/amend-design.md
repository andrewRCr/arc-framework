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
depth. The adversarial rubric is [`assess-design-proportionality`][assess-design-proportionality] plus
[`design-audit`][design-audit] plus [`spec-review`][spec-review]'s coherence slice — the finalization rubric the
original cleared, minus nothing. Pass prior findings through `adversarial-review`'s `prior-findings` input so
untouched elements are never re-attacked. Closure re-runs the detecting check (§ Closure).

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
