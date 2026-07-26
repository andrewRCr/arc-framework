# Draft: integration-boundary-accuracy

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 9) at its 2026-07-26
  formalization-readiness read. It arrived from a live integration report rather than that work unit's originating
  diagnosis, and is the only concern reaching the integration workflow's procedural shape rather than the review
  protocol's content.
- **Purpose:** Correct three surfaces at the integration boundary that describe themselves inaccurately — an
  interlock that renders what it verified instead of what the approver decides, a lifecycle verb named for its
  phase's content instead of the scheduling act it performs, and a state transition that fires two steps before the
  state's documented meaning begins.

- **State:** maturing — inherited settled at extraction. Pre-PRD.
- **Class:** `Heavy` (a real design was authored before extraction; the deliverable is new CLI surface).

---

## Problem / Motivation

**One root, three surfaces: the integration boundary's procedural surfaces misdescribe what they do.** In each case
the surface is truthful about the system and misleading about itself. Each defect was found independently, and they
are one concern because the fixes interlock — the verb rename is a precondition for naming the interlock's new verbs,
and the fire-point correction is what makes the rename true.

## The interlock surface

**The observed instance.** A work unit's final integration interlock rendered a nine-part wall: approved head,
complete candidate-tail diff, lifecycle state, base-drift reading, pull-request status and requirements, merge
method, review convergence history, a proposed `## Review` record, and a closing paragraph informing the approver
that any head movement invalidates the approval being requested. **None of it was the agent improvising.** The
`integration-interlock` callout prescribes that surface list verbatim, the surrounding step adds "surface this exact
diff, not excerpts alone," and the `Coverage` line came from the pull-request template. The agent complied exactly.

Three defects are conflated there, and they want different fixes — which is why they resolve together rather than as
three captures.

### Defect A — determinism encoded as prose

The final integration step runs roughly 125 lines of sequencing: read drift, validate the returned object's typed
fields, refresh, compare the object identifier, merge, rerun gates, recompose, push, re-run checks, resolve lifecycle
state, compose the change-request handle, invoke readiness, fire the pre-merge seam, retain the head identifier,
compose the diff, compose the review record, stop, apply dispositions, recompose, compare against the approved head,
re-read status, invoke unlock, follow its typed action, re-read checks, replace the summary, read drift once more,
merge. Every branch is machine-decidable over typed output from verbs this project owns.
`strategy-procedure-evolution` Principle 1 names this exact anti-pattern — code wearing prose, unexecutable and
uncheckable where it sits — and illustrates it with a _one-line_ condition. This is that anti-pattern at 125-line
scale, in the workflow carrying the corpus's highest imperative density.

The clearest tell is self-validation: the step instructs the agent to confirm that the drift verb returned a
well-formed object with the required typed fields. We wrote that verb. If it can emit a malformed envelope that is a
defect in the verb, and asking the agent to re-check its own tool's contract violates both Principle 1 and
Principle 4 in a single paragraph.

**This is not the load-cost disease, and the distinction decides the remedy.** Nothing here is carried-and-skipped:
the workflow loads only when integrating, and every line applies when it does. The cost is execution fidelity under a
stochastic interpreter, paid only by the sessions that run it — and it _worsens_ with accretion, because prose
constraints do not compose. Each added imperative dilutes the attention available to the others, so a 125-line prose
program is less reliable than a five-line verb call. The accretion defeated the goal it was added for. The remedy is
therefore relocation, not relaxation: loosening the constraints would trade a fidelity problem for a correctness one.

### Defect B — the interlock renders everything it verified

Nine things must be _established_; the approver's decision turns on perhaps three — what is merging, where review
landed, and anything not clean. There is no notion anywhere in the step of _checked and clean therefore silent_. The
precedent already exists in this project: session initialization states "only mention gaps in orientation if they
exist" and carries an explicit never-include list covering clean freshness and passed environment checks. The
integration interlock holds the exact inverse posture, and nothing records that as a decision.

### Defect C — the approval-invalidation narration, and the `Coverage` leak

The exact-head pin is sound and stays: it is a compare-and-swap guarding a real failure mode, an agent helpfully
pushing a fix in the window between approval and merge. What is wrong is telling the approver that their approval is
conditional. The pin constrains the _agent_, not the human, and any change in that window would have come from the
human anyway. Keep the mechanism, delete the explanation, and let the invalidation path speak only when it actually
fires.

The `Coverage` field is the same defect in the public surface. It is prescribed in three places — the integration
step, the pull-request template's optional-sections guidance, and the errand workflow — and it renders as prose like
"targeted verification carried prior complete coverage across the archive-only candidate tail." That is four
load-bearing internal terms addressed to a reader with no model for any of them, which `DEV-RULES.ARC` § Commit and
PR surface language already prohibits: pull-request prose reads as the operation performed, legible without
ARC-specific knowledge. `Local` and `Hosted PR` and `Triage` survive that test — they tell a reader who reviewed and
what happened to findings. `Coverage` is audit metadata whose only interested reader already approved it.
**Resolved: cut it from the pull-request record at all three loci and route the audit content to Completion Notes**,
which are internal and already exist.

### Resolved — the deliverable is two verbs around one human stop

The cut falls where the human does:

- **`arc integrate checkpoint <name> --json`** absorbs the pre-stop sequence — the authoritative drift read and its
  validation, the reconcile decision, lifecycle and cadence resolution, and the readiness envelope. It returns one
  typed verdict: `ready` carrying the approved head, candidate-tail diff reference, requirement and status summary,
  merge method, and the composed review record; `reconcile` carrying the drift verdict; or `blocked` carrying a typed
  reason.
- **`arc integrate merge <name> --approved-head <sha> --json`** absorbs the post-approval sequence — head
  recomposition and comparison against the approved value, status re-read, unlock dispatch and clearance await, check
  re-read, review-summary replacement, the final drift read, and the pinned merge. It fails closed on any mismatch
  and returns `merged`, `invalidated` with a typed reason, or `blocked`.

The approval binds to the head identifier as a token the second verb validates. That is what makes Defect C
structural rather than instructional: the invalidation rule stops being a paragraph the agent must remember and
narrate, and becomes a precondition the verb enforces. The agent no longer explains the pin because it no longer
carries it.

**What stays prose is the judgment**, and naming it is half the deliverable: review applicability, disposition
decisions, whether an early reconcile is worth the pass, and the recommendation accompanying the interlock. Those are
judgment leaves with no machine-decidable form. The invariants that survive as prose are the bias-guarding ones —
clearance never carries, advisory receipts are not merge authority, the interlock is the sole merge authority —
though they are currently restated six or seven times across the phase, which is itself a prose-substrate tell that
the author did not trust the substrate. Once the verbs enforce the sequence, one statement each is enough.

**Surface discipline lands as precomposed text, not as an instruction.** Per `strategy-procedure-evolution`
Principle 6, the checkpoint envelope carries the interlock's rendered surface already composed and already
exception-filtered — clean signals collapsed to a line, unclean ones expanded. This is deliberately not a prose rule
telling the agent to be brief: a template in markdown is untestable, and the same template in code is a unit test
away. It also makes Defect B mechanically enforced rather than re-litigated at each site.

## The lifecycle verb names the wrong axis

**`arc integrate` reads as the merge because it is named for its phase's content rather than for the act it
performs.** Its own help string already disclaims the reading — "marks phase entry, not the merge" — which is a name
requiring a disclaimer.

The lifecycle `State` is the **scheduling axis**, a contract `project-state-integrity` states explicitly and
`wu-lifecycle-state-model` owns. Read that way, the transition family has one invariant: **each verb names a
scheduling act.** `activate` schedules into implementation, `park` and `resume` deschedule and reschedule,
`materialize` schedules onto this machine, `abandon` and `archive` are terminal scheduling acts. `integrate` alone
names what happens _during_ the phase its act schedules into. It is the only member on the wrong axis, which is why
it is the only member whose name misleads.

**Resolved: rename to `arc submit`.** It names the scheduling act, matches the family's form, and carries no merge
reading. The objection that it does not itself open the pull request dissolves on the same axis argument that
diagnoses the defect: `activate` does not implement anything either. Both name the act of scheduling work into a
phase; the phase's work then happens. The rename also frees `integrate` as a namespace, which is what makes the
`arc integrate checkpoint` and `arc integrate merge` verbs above honest rather than nested beneath a command that
disclaims being the merge — a benefit, not the justification.

**The state keeps its name.** `**State:** Integrating` is unchanged. Renaming it would re-key an existing meaning,
which the axis contract prohibits, and the wide sweep buys little once the command stops competing for the word. The
result is a three-way split where one word currently does three jobs: `arc submit` is the transition, `Integrating`
is the phase, and `integrate-work-unit` plus the `arc integrate` namespace are the phase's procedure.

**Deprecation posture — resolved: the rename lands clean, with no alias window.** Self-hosting makes this project the
only caller today, and retaining `arc integrate` as an alias would preserve exactly the misleading name the rename
exists to remove.

## The transition fires before the state it claims to cover

**The workflow contradicts itself, and its own prose is the witness.** Step 1 states that "the `Integrating` state
covers PR open through review-response" — and fires the transition at Step 1. The pull request opens at **Step 3**,
with the local self-review preflight between them. A work unit is therefore `Integrating` through a window in which
nothing is public and no reviewer outside the author's machine can see it.

Verification is not the misplaced part, which is worth recording so it is not re-derived: the task list's
verification phase runs Tier 3 gates, success criteria, and the adversarial pass entirely under `**State:** Active`,
and only then does `arc finalize verify` write the handoff pointer. The transition already sits after verification.
What it sits before is publication.

**Resolved: move the fire point to the pull-request-open boundary**, so the state begins when its documented meaning
begins. This mints no state and re-keys nothing, and it is what makes `arc submit` accurate rather than approximately
right — at that boundary the work genuinely goes from private to public, which is precisely what submitting means.

**Forward-compatible with `wu-lifecycle-state-model` by construction.** Shrinking `Integrating` to the public phase
carves out exactly the private-but-implementation-complete window a `Candidate` state would later occupy, so the two
compose rather than collide. `submit` also keeps its meaning under that model, because it names the public transition
either way. The private-side transition — `propose`, entering verification and local review — is deliberately **not**
proposed here: it requires a state to transition into, and that state is not ours to mint.

## The control — `verify-work-unit` is clean, and that is evidence

The sibling workflow in the same lifecycle phase shows none of this. It is short, runs three steps with no branching
over typed output, calls one verb, and its imperatives are bias-guarding rather than procedural — "criterion text is
immutable; never rewrite a criterion to match what was built." There is no prose program in it because it has no
deterministic sequencing to encode.

That makes it a natural control, and it narrows the diagnosis: the defect tracks the presence of machine-decidable
branching, not a workflow's importance, ceremony, or lifecycle position. A remedy aimed at "lifecycle workflows are
over-specified" would be aimed at the wrong property. Its two real issues are already owned elsewhere — the
`Next Action` string-prefix coupling routed to `wu-lifecycle-state-model`, and the unconditional adversarial stop at
every `Class`, which belongs to `review-protocol-alignment`'s stop-discipline concern. **Not in scope, deliberately.**

## Alternatives

- **Relax the integration step's constraints rather than relocate them** — the intuitive reading of an
  over-specified procedure. **Rejected**: the sequencing is deterministic, so loosening it trades a fidelity problem
  for a correctness one. The constraints are not wrong; they are in the wrong substrate.
- **Trim the interlock's rendered surface in prose** — instruct the agent to summarize when everything is clean.
  Rejected as the same defect one level up: a rendering rule written in markdown is untestable and re-litigated at
  every site, where the precomposed-envelope form is a unit test away and enforces itself.
- **Generalize this to every workflow interlock.** Rejected — `composable-workflows` owns the corpus-wide authoring
  pattern and records a graduation trigger covering exactly this class of workflow. Fixing one site in a way that
  generalizes locally would mint the competing convention its adoption ladder exists to prevent. The integration
  workflow is taken as a single dogfooded instance instead, under the remove-determinism boundary.
- **Wait for `composable-workflows` before touching the integration workflow at all.** Rejected — it is `planned`
  inside a cohort, staged large, and carries six unintegrated buffer items, so waiting defers the fix indefinitely.
  Extraction is also the one change that is safe ahead of it: it shrinks what that work unit later converts rather
  than pre-empting the shape of the conversion.
- **Keep `Coverage` in the pull-request record but reword it for a general reader.** Rejected — the wording is not
  what fails. The field reports on the review process rather than on the change, so no phrasing makes it relevant to
  the audience the surface addresses; the internal reader it does serve is served by Completion Notes.
- **Rename the lifecycle command to a compound — `enter-integration` / `begin-integrating`.** Rejected — no sibling
  transition verb is compound, and putting the phase noun back into the command re-couples the act to the phase,
  which is the defect. A compound is the right shape only when no domain verb fits the act; here one does.
  `activate` is not `enter-active`.
- **Noun-ify the command to `arc integration`.** Rejected — it fixes the misread but breaks the family's verb form,
  and standing alone it does not say what it does to the state. It also fails to free the word, so the new merge
  verbs would still nest beneath a phase-entry command.
- **Fold verification and integration under one generic name such as `finalization`.** Rejected on two independent
  grounds: `arc finalize` already exists as a planning-ceremony verb — including `arc finalize verify`, the command
  that closes verification — and collapsing two phases under one name would re-key existing `State` meanings, which
  the axis contract prohibits.
- **Rename the `Integrating` state alongside the command.** Rejected — it re-keys an existing meaning against the
  axis contract, spans every meta file plus the resolver, session type, and cadence checks, and buys little once the
  command stops competing for the word.
- **Also mint the private-side `propose` transition and a `Candidate` state.** Rejected as out-of-owner rather than
  wrong — the framing is sound and was routed to `wu-lifecycle-state-model`, which owns the vocabulary and is fenced
  by the same contract that permits the command rename.
- **Extend this to `verify-work-unit`** as the other integration-phase workflow. Rejected on inspection: it has no
  deterministic sequencing to relocate, its imperatives are bias-guarding, and its two real issues are already owned
  elsewhere. It is retained as the diagnostic control instead.
- **Retain `arc integrate` as an alias for a deprecation window.** Rejected — self-hosting makes this project the
  only caller today, and the alias would preserve the misleading name the rename exists to remove.

## Unknowns and Assumptions

- **Open — how much of the integration step survives extraction.** The judgment leaves are named, and the
  bias-guarding invariants are known to survive, but the residual line count is not established until the verb
  boundaries are specified. It decides whether this work also earns a prose-economy pass over what remains or leaves
  that to the corpus-wide sweep. Not a direction question.
- **Open — where the pre-merge seam sits relative to the merge verb.** The seam currently fires inside the sequence
  the verb would absorb, and an extension is a project-authored surface the verb cannot execute blindly. The likely
  shape is that the checkpoint verb returns before the seam and the merge verb resumes after it, leaving the
  fire-point in the workflow where the agent can honor its declared contract. To be settled against the extension
  contract, not assumed.
- **Assumption — the review record's remaining fields are worth keeping.** Cutting `Coverage` is settled; `Local`,
  `Hosted PR`, and `Triage` are retained on the reading that a reader wants to know who reviewed and what became of
  the findings. That has not been tested against anyone outside this project, and the whole section is optional
  today, so the retention is a judgment rather than a validated requirement.

## Composition / Coordination

- **`composable-workflows` — adjacent owner, bounded by an explicit rule rather than an edge.** It owns the
  corpus-wide authoring pattern and the load-cost mechanism; this work unit owns one integration-specific enactment
  of `strategy-procedure-evolution` Principle 1. The boundary reduces to **remove determinism, do not restructure the
  remainder.** Extraction shrinks the surface that work unit later converts and therefore helps it; reshaping —
  signature-led contracts, fragment extraction, spine budgets — would pre-empt its deliverable. The operative test at
  specification time is whether a proposed change would look different depending on whether that work unit's
  authoring pattern had landed. If yes, it is theirs. No dependency edge in either direction. Its fragment model
  already names the taxonomy cell this lands in — a fixed public method implemented at the code tier — so this is
  dogfood rather than invention, supplying a second instance and returning evidence.
- **`judgment-authority-model` — no reach.** Its discriminator sorts _prohibitions_ by what they guard against; this
  work unit is about _prescriptions_ — sequencing, not permission. Its own corpus sweep audited this workflow and
  rated it least affected because its twenty-plus prohibitions are all bias-guarding and survive unchanged. That
  reading is correct and is exactly why the sweep could not see this: the defect is not any single prohibition but
  the 125 lines between them. Defect C's framing half is genuinely that work unit's face (c) — authority located,
  capability or standing miscommunicated — and the fix here is the narrow enactment, not the model.
- **`wu-lifecycle-state-model` — it owns the vocabulary; this owns one command name.** It holds the `State` values
  and carries `project-state-integrity`'s contract to mint none and re-key none. Everything here respects it: the
  rename touches a CLI command, not a state, and the fire-point correction moves when an existing transition fires,
  not what it means. The `Candidate` state and the `propose` transition are that work unit's. **No dependency edge**:
  this work is correct under today's model and stays correct under theirs.
- **`review-protocol-alignment` — the extraction source, sibling.** It retains the review protocol's content
  concerns, one of which edits `integrate-work-unit.md` at the review-applicability step while this work unit
  rewrites the final merge step. Different regions, so neither blocks the other — but if both run concurrently,
  sequence the edits rather than merging them blind.

## Scope Estimate

Large. Two new lifecycle verbs absorbing the integration workflow's final phase, the prose extraction that follows, a
CLI command rename reaching the workflows and skills that invoke it plus the published package's compatibility
posture, a transition fire-point move, and a three-locus cut to the pull-request record. This is the only concern in
its extraction source whose deliverable was new CLI surface rather than a correction to existing surface.
