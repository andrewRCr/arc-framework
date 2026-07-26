# Draft: integration-boundary-accuracy

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 9) at its 2026-07-26
  formalization-readiness read. It arrived from a live integration report rather than that work unit's originating
  diagnosis, and is the only concern reaching the integration workflow's procedural shape rather than the review
  protocol's content.
- **Purpose:** Correct the integration boundary's procedural surfaces where they misdescribe what they do — an
  interlock that renders what it verified instead of what the approver decides, a lifecycle verb named for its
  phase's content instead of the scheduling act it performs, and a state transition that fires two steps before the
  state's documented meaning begins — and relocate the determinism those surfaces carry as prose into typed verbs
  that can enforce it.

- **State:** maturing. Pre-PRD.
- **Class:** `Heavy` (a real design was authored before extraction; the deliverable is new CLI surface).

---

## Problem / Motivation

**One root: the integration boundary's procedural surfaces misdescribe what they do.** Three of them are truthful
about the system and misleading about itself — an interlock that renders what it verified, a verb named for its
phase's content, a transition firing before its state's meaning begins. The fourth is the substrate underneath them:
determinism carried as prose, which no surface can describe accurately because prose cannot enforce a sequence.

Each defect was found independently, and they are one concern because the fixes interlock — the verb rename is a
precondition for naming the interlock's new verbs, the fire-point correction is what makes the rename true, and
relocating the determinism is what lets the interlock's surface be composed rather than narrated.

## The interlock surface and the prose program behind it

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
merge. Nearly every branch is machine-decidable over typed output from verbs this project owns. Three are not — the
review-applicability call after an append-only merge, the direction to retain surfaced advisories as intentional,
and the direction to correct the composition instead of authorizing merge. Those judgment leaves are the most
visible of the step's stops, but not the only kind; the boundary rule below names all three kinds and is what makes
the extraction tractable rather than total.
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

**The same defect at a second family of loci — PR resolution.** `run-errand.md`'s PR-resolution step hands the
agent a raw paginated `gh api` result plus a four-row classification table — no match, one open match, one merged
match at the current
head, and a residual stop class covering closed-unmerged, stale merged head, and multiple conflicting matches. That
classification is a pure function over the query result. In a live 2026-07-26 run the agent reached for `--jq`
against the shipped `--slurp` invocation, hit the incompatibility, and hand-rolled the parse. The shipped text does
not carry `--jq`, so the anecdote evidences improvisation around a raw query rather than a defective command — but
that is the same failure mode from the other side: handing an agent a raw result to classify invites exactly this.

**`integrate-work-unit.md` carries the same defect in a second shape, and the two together set the verb's
contract.** Its resume guard is a four-row classification table over resolver state × PR state, and the PR axis is
hand-parsed host output — `gh pr view {type}/{name} --json state,mergedAt`, falling back to
`gh pr list --head {type}/{name}`. Three further sites branch on the same question: skip the pre-create hook when
an open PR exists, resolve the one open PR at review entry, and skip the merge when the PR is already merged. Its
creation path is a bare `gh pr create`, not typed dispatch — the same primitive the errand path uses. It also lacks
the errand path's pre-create head validation, which reads `refs/heads/<branch>` from the remote and compares the
exact 40-hex SHA before creating; that asymmetry is itself a defect a shared verb settles.

So this is not one locus but two workflows and at least five sites, and the two shapes are **not the same
question**. The errand path asks a _pre-create enumeration_ question — does a PR already exist for this head, and
may I create one. The work-unit path asks a _resume-point_ question — given resolver state and PR state, which
incomplete step do I re-enter. A verb serving only the first would leave the second hand-parsing host output, so
the envelope must carry both: the resolved disposition (`none`, `open`, `merged-at-head`, `merged-stale-head`,
`ambiguous` with every candidate), the head validation that gates creation, and enough state for the caller to
select its resume point. The resolution is one typed verb both paths call — the same conclusion the seam and
clearance-await findings reach independently.

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

The `Coverage` field is the same defect in the public surface. It is prescribed at five sites across three files —
three in the pull-request template alone (the record skeleton, the optional-sections guidance, and the section
guidance), plus the integration step and the errand workflow — and it renders as prose like
"targeted verification carried prior complete coverage across the archive-only candidate tail." That is four
load-bearing internal terms addressed to a reader with no model for any of them, which `DEV-RULES.ARC` § Commit and
PR surface language already prohibits: pull-request prose reads as the operation performed, legible without
ARC-specific knowledge. `Local` and `Hosted PR` and `Triage` survive that test — they tell a reader who reviewed and
what happened to findings. `Coverage` is audit metadata whose only interested reader already approved it.
**Resolved: cut it from the pull-request record at every site and route the audit content to Completion Notes**,
which are internal and already exist. The routing needs a write point, and the obvious one is wrong: Completion
Notes are composed and committed well before the final step, while the coverage content is determined at the final
push and inside the reconcile arm — and no lifecycle-authored commit is permitted after the checkpoint. So the
content must be carried into the Notes composition from the later determinations rather than written where the
Notes are first authored, and the checkpoint envelope is the natural carrier since it already resolves the review
facts. Left unstated, an implementer would add a line to the composition guidance and silently lose exactly the
late applicability calls the field is for.

### Resolved — the deliverable is a typed spine around one human stop

**The boundary rule: a verb may absorb a span only if the span is _stopless_.** A stop is any point where control
must return to the agent, and there are exactly three kinds — a **judgment leaf** (no machine-decidable form), an
**interlock release** (a user control point, configurable per project), and an **extension fire point**
(project-authored free-form actions no CLI verb can execute). They differ in why they resist absorption but not in
whether they do, and treating only judgment as the boundary is the error that makes a verb look larger than it can
be.

This rule is the whole design center. Every cut below derives from it rather than being argued separately, and the
strongest evidence for it is already in source: the post-approval span is _declared_ stopless — no extension, review
action, lifecycle mutation, commit, push, fetch, or second human stop between the final drift read and the merge —
which is exactly why that span absorbs cleanly while others do not. The rule also retro-explains the control:
`verify-work-unit` is clean because it has one stop and no determinism between.

The cut therefore falls where the stops are, and the two spans that turn out to be stopless are the ones on either
side of the human:

- **`arc integrate checkpoint <name> --json`** absorbs the pre-stop sequence — the authoritative drift read and its
  validation, the reconcile decision, lifecycle and cadence resolution, and the readiness envelope. It returns one
  typed verdict: `ready` carrying the approved head, candidate-tail diff reference, requirement and status summary,
  merge method, and the composed review record; `reconcile` carrying the drift verdict; or `blocked` carrying a typed
  reason. **The merge method resolves as a configured preference validated against the repository ruleset**, and a
  selection the ruleset disallows stops with both values named rather than being silently rewritten. `merge.strategy`
  stays the authority on what the project _wants_ — it is an established setting with documented traceability
  consequences, and superseding it is not this concern's to do; the ruleset is the authority on what the host will
  _accept_. Today neither path validates: a 2026-07-26 errand run discovered a disallowed squash by attempting the
  merge and retrying. **The validation belongs on both paths**, since the failure occurred on the errand lane, which
  reads the setting and arms native auto-merge with the matching flag — placing the check only in the work-unit
  checkpoint would leave the observed failure live.
- **`arc integrate merge <name> --approved-head <sha> --json`** absorbs the post-approval sequence — head
  recomposition and comparison against the approved value, status re-read, unlock dispatch and clearance await, check
  re-read, review-summary replacement, the final drift read, and the pinned merge. It fails closed on any mismatch
  and returns `merged`, `invalidated` with a typed reason, or `blocked`. This span absorbs because the workflow
  already declares it stopless, which is the boundary rule reading a property the corpus had recorded without
  naming.

### Resolved — the behind-base reconcile arm is a path, not a verb

The reconcile arm is where the rule earns itself, because the arm looks absorbable and is not. Walked against
source it holds **five stops** across roughly sixty-five lines, and only two are judgment:

| Span | Content                                                             | Kind                       |
| ---- | ------------------------------------------------------------------- | -------------------------- |
| 1    | Drift read, envelope validation, safety predicate, host cross-check | deterministic              |
| 2    | Refresh, base-identifier compare, append-only merge                 | deterministic              |
| 3    | Gates, recompose → **review-applicability call** and its branch     | **judgment leaf**          |
| 4    | Push extension contract, `workflowPush` release                     | **fire point + interlock** |
| 5    | CI and routing re-read, base-moved loop-back                        | deterministic              |
| 6    | Current-WU reconcile dispatch → **retain-advisories direction**     | **direction leaf**         |
| 7    | Gates over the staged correction, `workflowCommit` release          | **interlock**              |
| 8    | Push extension contract, `workflowPush` release, restart            | **fire point + interlock** |

So it is not determinism with a leaf in it — it is an alternation, and the longest stopless run is a handful of
lines. No absorbing verb exists: one would swallow two extension fire points and three interlock releases, silently
deleting live control points from any project that populates them. Five micro-verbs would be worse than the prose
they replace.

**Resolved: the arm becomes a thin orchestration path over stopless procedures.** `composable-workflows`'s fragment
model already names this cut — separate procedure identity, which is invariant and _stopless_, from cadence, which
is the grouping of procedures plus its stops — and records that a thin orchestration path referencing procedures is
more DRY-aligned than a fat self-contained block. That is exactly the arm's shape:

- Span 1 is already absorbed: the checkpoint verb returns `reconcile` carrying the validated safety facts.
- Span 2 becomes **one new verb** — refresh, compare the base identifier, and merge append-only, returning `merged`,
  `skipped-clean`, `base-moved`, or `conflict`. This also removes a mechanics leak, since prose currently narrates
  the git merge itself rather than invoking a verb for it.
- Span 5's CI and routing re-read becomes a typed call.
- Span 6's dispatch verb already exists; what deletes is the prose validating its envelope — the same
  self-validation defect as the drift verb, and for the same reason.
- Spans 3, 4, 7, and 8 stay prose, because they _are_ the cadence.

What remains is the stops in order, each with the invariant that guards it — call it a fifth of the current length,
with one verb minted and a great deal of self-validation and mechanics narration deleted. Nothing swallows a
control point.

The approval binds to the head identifier as a token the second verb validates. That is what makes Defect C
structural rather than instructional: the invalidation rule stops being a paragraph the agent must remember and
narrate, and becomes a precondition the verb enforces. The agent no longer explains the pin because it no longer
carries it.

**What stays prose is the cadence**, and naming it is half the deliverable. Judgment is the part that is obvious:
review applicability, disposition decisions, whether an early reconcile is worth the pass, and the recommendation
accompanying the interlock — leaves with no machine-decidable form. The part that is easy to miss, and that the
boundary rule exists to keep visible, is that interlock releases and extension fire points stay prose too. Neither
is judgment, and neither may be absorbed: an interlock is the user's control point and an extension's actions are
the project's own. The invariants that survive as prose are the bias-guarding ones —
clearance never carries, advisory receipts are not merge authority, the interlock is the sole merge authority —
though they are currently restated six or seven times across the phase, which is itself a prose-substrate tell that
the author did not trust the substrate. Once the verbs enforce the sequence, one statement each is enough.

**Surface discipline lands as precomposed text, not as an instruction.** Per `strategy-procedure-evolution`
Principle 6, the checkpoint envelope carries the interlock's rendered surface already composed and already
exception-filtered — clean signals collapsed to a line, unclean ones expanded. This is deliberately not a prose rule
telling the agent to be brief: a template in markdown is untestable, and the same template in code is a unit test
away. It also makes Defect B mechanically enforced rather than re-litigated at each site.

### Resolved — the `pre-merge` seam fires between the verbs, and the envelope reserves a slot for it

The seam currently fires inside the span the checkpoint verb would absorb: after the lifecycle read and the
readiness envelope, but before the approved head is retained and the diff and `## Review` record are composed.

**The seam is a stop, so the boundary rule settles it directly**: `pre-merge.actions` are project-authored free-form
actions executed by the agent, which no CLI verb can execute and whose output has no typeable shape. The question
was never whether the seam stays in the workflow but which inter-verb gap it occupies — and **`run-errand` fires
`pre-merge` too, without any integration checkpoint.** Coupling the seam to the checkpoint verb in any form — a
parameter, a returned `seamPending` obligation, a three-verb split around it — would force the errand path to grow a
parallel mechanism for the same extension, so one contract would acquire two enactments.

**Resolved: the seam fires between `arc integrate checkpoint` returning `ready` and the integration-interlock stop,
verb-independent so both paths share one fire point.** Making that shared point real requires an edit to the errand
path rather than leaving it alone: `run-errand` currently carries **two** `pre-merge` fire instructions inside its
final step — one ahead of the `## Review` record composition, at exactly the ordering rejected below, and one after
the approved-head retention. Those collapse to a single fire at the shared position, which is the same
one-contract-one-enactment argument applied to the path that already violated it. This sits _later_ than the
current work-unit position;
diff and review-record composition author no head update, so the extension's contract — fire after review settlement
and after any lifecycle- or review-authored head update — holds at either position, and the later one strictly
shrinks the window between the seam and merge authorization.

**The envelope reserves an extension-report slot.** Precomposition and an agent-executed seam are otherwise in
tension: the seam's actions report checks, conversations, and requirements — evidence belonging in the interlock
surface — but produced after the verb composed it. Left implicit this becomes a specification-time surprise, where
either the agent appends free-form text to a precomposed surface (weakening the precomposition exactly where Defect
B's remedy leans on it) or the surface silently omits the seam's output. With the slot declared, the envelope owns
exception-filtering for everything it computed and names where the one thing it cannot compute goes.

**A prose collapse worth recording as evidence for Defect A.** Today's rule — any candidate mutation or review
action invalidates the checkpoint, so return to the authoritative lifecycle and drift reads, reconcile if needed,
and fire the final hook again — becomes: call `arc integrate checkpoint` again, then re-fire the seam. A paragraph
becomes a line because the verb owns the rebuild.

## Two supporting verbs the spine requires

Both are determinism removal under the boundary rule rather than new capability, and both are reached by the errand
path as well, so neither nests under `arc integrate`.

- **PR resolution.** The classification behind Defect A's second locus becomes one typed verb returning the
  resolved disposition — no match, reuse this open request, already merged at this head, or a typed stop carrying
  every candidate — replacing the raw query and the four-row table in `run-errand`.
- **Clearance await.** `arc review unlock` returns `dispatched / await-clearance`, and nothing in the system waits.
  The status itself is well defined — the shipped merge-gate workflow template posts it and the technical overview
  documents it as the lifecycle lock — but no CLI surface observes it, so the await exists as an instruction with no
  implementation behind it. The sibling hosted-review step
  supplies `arc review hosted await -` and forbids an agent polling loop, so the corpus currently forbids agent
  polling where a verb exists and mandates it by omission where none does. That is a rule with a hole, not a rule
  with an exception.

  The remedy instantiates the mechanism that already exists rather than inventing one. `awaitHostedReview` is a
  bounded in-process wait — exponential backoff, deadline abort, a stale-head guard comparing the observed head
  against the target, and typed terminal states — and none of that body is review-specific except its observation
  vocabulary. Extract the loop as a provider-agnostic primitive parameterized by observer and observation
  vocabulary; hosted-review await and clearance await both instantiate it. The stale-head guard earns its place here
  especially: clearance sits immediately before merge, where head movement invalidates everything downstream.

  **The clearance vocabulary needs a continue member, and that is the whole parameterization question.** The
  extracted loop polls only while the observation says _keep waiting_; every other kind is terminal for the call.
  So clearance observes `pending` (the status is absent or still running — poll again), `cleared`, `failed`, and
  `not-required` (the default-branch workflow is absent, so no status will ever arrive). Collapsing absence into a
  single terminal `absent` would return on the first tick and not be a wait at all; collapsing it into the continue
  signal would burn the full deadline whenever clearance is genuinely not required. The two instantiations differ
  in exactly this vocabulary and nowhere else, which is what the primitive is parameterized over.

  **The anti-polling rule is restated once, correctly.** The cost is not polling — the bounded wait polls. It is
  that a poll tick in the agent's turn loop is a full model inference over the whole conversation, where a tick
  inside the process costs nothing. The shape that follows is a coarse agent-level loop over a fine in-process one,
  and stating the reason keeps a future implementer from removing the bound or reading the prohibition as hostility
  to polling itself.

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

**Bare `arc integrate` becomes a signpost — resolved.** Retaining the word as a namespace changes what a bare
invocation means: it stops firing a lifecycle transition and becomes a container with no bare behavior. That is a
silent semantic change on a surviving name, which is this work unit's own defect class one level down, and it is not
hypothetical — a reader holding the design's context still reached for the old meaning. **Resolved: bare
`arc integrate` errors with a pointer to `arc submit` for the transition and lists its subcommands.** No caller
exists to break, so the cost is one error path; what it buys is that the one trap the namespace retention creates
answers the question it provokes instead of failing silently or, worse, appearing to succeed.

**Deprecation posture — resolved: the rename lands clean, with no alias window.** The project is pre-public-release
with no callers outside this repository, so no compatibility obligation exists to discharge; retaining `arc integrate`
as an alias would preserve exactly the misleading name the rename exists to remove. The rename is therefore a corpus
sweep with no deprecation surface, and the window for landing it that cheaply closes at first release.

## The transition fires before the state it claims to cover

**The workflow contradicts itself, and its own prose is the witness.** Step 1 states that "the `Integrating` state
covers PR open through review-response" — and fires the transition at Step 1. The pull request opens at **Step 3**,
with the local self-review preflight between them. A work unit is therefore `Integrating` through a window in which
nothing is public and no reviewer outside the author's machine can see it.

Verification is not the misplaced part, which is worth recording so it is not re-derived: the task list's
verification phase runs Tier 3 gates, success criteria, and the adversarial pass entirely under `**State:** Active`,
and only then does `arc finalize verify` write the handoff pointer. The transition already sits after verification.
What it sits before is publication.

**"The pull-request-open boundary" is three placements, not one, because the transition is a commit.** The verb
flips the state, writes the pointer fields, regenerates `ROADMAP`, and stages both — then a commit-interlock lands
`chore(arc): integrate {name}`. Step 3 pushes and only afterwards runs `gh pr create`, composing the proposed
target's head immediately before creation and the opened target's head immediately after. So the candidates carry
materially different mechanics:

- **After the push, before creation.** The flip commit is not on the pushed head, so it forces a second push and a
  recomposition of the proposed target before creation.
- **After creation.** The PR's opening head differs from the branch head, forcing a post-open push and a
  recomposition of the opened target before the `post-pr-open` hook's exact-head contract.
- **At the head of the publication step, before the push.** One commit, one push, no recomposition — the existing
  head compositions already sit on the correct side of it.

**Resolved: fire at the head of the publication step, immediately before the push.** It is the only candidate that
costs nothing mechanically, and it delivers what the defect asks for: the two steps the transition currently
precedes — the remainder of entry setup and the local diff preflight — move under `Active`, leaving `Integrating`
to cover push through review-response. The accurate name for the boundary is therefore _publication_, not
_pull-request-open_; the pull request is what publication produces, and binding the transition to the `gh pr create`
call itself is what generates the second push.

Two consequences the placement resolves rather than creates. Step 1's composed `next action` value is written by
the transition, so it moves with it and stays coherent. And the resume table's `integrating` / no-PR-open row stays
reachable rather than becoming dead: because the transition fires _before_ the push, that row now covers both a
transitioned-but-unpushed session and a pushed-but-uncreated one. Its resume point is therefore the publication step
from the push — which is idempotent — not PR creation directly; sending the unpushed arm straight to creation would
run it against a branch with no remote head.

This mints no state and re-keys nothing, and it is what makes `arc submit` accurate rather than approximately
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
  inside a cohort, staged large, and carries ten unintegrated buffer items, so waiting defers the fix indefinitely.
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
- **Retain `arc integrate` as an alias for a deprecation window.** Rejected — the project is pre-public-release with
  no callers outside this repository, so the alias would discharge no compatibility obligation while preserving the
  misleading name the rename exists to remove.
- **Absorb the `pre-merge` seam into the checkpoint verb** — as a callback, or as a returned `seamPending`
  obligation. Rejected on the contract: extension actions are project-authored free-form prose that no verb can
  execute, and `run-errand` fires the same extension without a checkpoint, so one contract would grow two
  enactments.
- **Split the pre-stop sequence into three verbs around the seam**, preserving its current ordering ahead of diff
  and review-record composition. Rejected — the seam's output has no typeable shape, so a downstream compose verb
  could not consume it, and the split buys ordering that the contract does not require while costing a verb.
- **Fire the seam before the checkpoint verb.** Rejected — it would fire before the readiness envelope its actions
  report against exists, and would burn a retry-safe fire whenever the checkpoint returns `reconcile`.
- **Build clearance await as its own mechanism.** Rejected — `awaitHostedReview` is already the shape, and a second
  independently-authored bounded wait would put two backoff-and-deadline implementations in one namespace. Extract
  the loop and instantiate it twice instead.
- **Leave clearance await to the agent** (the status quo). Rejected — it contradicts the sibling step's own
  prohibition on agent polling loops, and each tick costs a full model inference where an in-process tick costs
  nothing.
- **Exclude `run-errand`'s PR-resolution block** as out-of-boundary. Rejected — the diagnostic criterion that
  excludes `verify-work-unit` (the defect tracks machine-decidable branching) admits this, and the errand path is
  already in the change set for the `Coverage` cut, the seam, and clearance await.
- **Fire the state transition immediately before or immediately after `gh pr create`** — the literal reading of
  "at the pull-request-open boundary." Both rejected: the transition is a commit, so either placement puts it on
  the wrong side of the push and forces a second one, plus a recomposition of the proposed or opened target's exact
  head. The publication step's head is the boundary that costs nothing.
- **Leave the behind-base reconcile arm wholly in prose.** Rejected — roughly two-thirds of it is deterministic,
  including a mechanics-narrating merge and two envelope self-validations, so leaving it intact would apply the
  thesis to everything except its strongest instance.
- **Fold the whole reconcile arm into the checkpoint verb.** Rejected — it makes a read-and-verdict command
  mutating and swallows five stops, including two extension fire points and three interlock releases, which would
  silently delete live control points from any project that populates them.
- **Absorb the arm into a third `arc integrate reconcile` verb cut at the judgment leaf.** Rejected on the same
  ground once the stop inventory is complete: the leaf is not the only stop, so a span starting after it still
  swallows the push extension contract and the push and commit interlock releases. Treating judgment as the sole
  boundary is what made the arm look absorbable.
- **Resolve the merge method from the repository ruleset alone, superseding `merge.strategy`.** Rejected — the
  setting is an established configuration axis with documented traceability consequences, and superseding it is
  neither necessary to fix the observed failure nor this concern's to decide. Validation against the ruleset closes
  the failure while leaving the setting authoritative over intent.

## Unknowns and Assumptions

- **Open — how the merge verb represents a clearance wait that outlives its deadline.** The bounded wait returns a
  poll-again result at deadline by design, and the coarse loop over it is re-invocation; but the merge verb's own
  return set has no such member, and re-invoking it would re-fire the unlock dispatch rather than resume the wait.
  Either the verb grows a resume-shaped return and an idempotent unlock, or the wait sits outside it. An envelope
  question, not a boundary one — the stop inventory does not reach it.
- **Open — what the checkpoint-to-merge handoff carries.** The merge verb must post the record the approver
  previewed, which the checkpoint composed, while dispositions applied between the two calls change the inputs that
  record was composed from; the validated merge method has the same shape. Passing a checkpoint handle and
  recomposing inside the merge verb are materially different designs. This is the design's central new interface and
  is specification work rather than direction — but it must be settled deliberately, not discovered.
- **Assumption — the extracted await primitive's observation vocabulary generalizes.** Clearance await is the second
  instantiation, and two instances are thin evidence that the parameterization is the right one. If a third bounded
  wait later resists the shape, the primitive absorbs a variant rather than the callers bending to it.
- **Assumption — the review record's remaining fields are worth keeping.** Cutting `Coverage` is settled; `Local`,
  `Hosted PR`, and `Triage` are retained on the reading that a reader wants to know who reviewed and what became of
  the findings. That has not been tested against anyone outside this project, and the whole section is optional
  today, so the retention is a judgment rather than a validated requirement.

## Success Signals

Observable outcomes that would show the work landed — the seed of the spec's success criteria, not the criteria
themselves.

- **The final integration step reads as cadence, not as a program.** Every stopless run is a verb call; what
  remains is the stops in order — judgment leaves, interlock releases, extension fire points — each with the
  invariant that guards it. Countable rather than aspirational: the residual length is a function of the stop
  inventory, which the reconcile arm's table already fixes at five for that arm.
- **The interlock's clean-path surface is short.** A fully clean candidate renders what the approver decides on —
  what is merging, where review landed, the merge method — rather than all nine established facts, and the
  collapsing is done by the envelope rather than by agent discretion. Testable directly against the composer.
- **`arc integrate` no longer names a lifecycle transition.** The scheduling verb is `arc submit`; the corpus
  carries no invocation of the old name; `integrate` survives only as the namespace for `checkpoint` and `merge`,
  and a bare invocation names its replacement rather than failing silently.
- **`Integrating` begins when the work becomes public.** The transition fires at the head of the publication step, so
  no work unit occupies the state during the private verification-and-local-review window.
- **No agent hand-rolls a wait or a parse at either integration boundary.** Clearance await is a bounded verb call;
  PR resolution returns a typed disposition at every site in both workflows, including the work-unit resume guard;
  and no lane discovers a disallowed merge method by attempting the merge. These are the three places a live run had
  to improvise.
- **`Coverage` is absent from the pull-request record** at all five prescription sites, with its audit content in Completion
  Notes.

## Composition / Coordination

- **`composable-workflows` — adjacent owner, bounded by an explicit rule rather than an edge.** It owns the
  corpus-wide authoring pattern and the load-cost mechanism; this work unit owns one integration-specific enactment
  of `strategy-procedure-evolution` Principle 1. The boundary reduces to **remove determinism, do not restructure the
  remainder.** Extraction shrinks the surface that work unit later converts and therefore helps it; reshaping —
  signature-led contracts, fragment extraction, spine budgets — would pre-empt its deliverable. The operative test at
  specification time is whether a proposed change would look different depending on whether that work unit's
  authoring pattern had landed. If yes, it is theirs. No dependency edge in either direction. Its fragment model
  already names the taxonomy cell this lands in — a fixed public method implemented at the code tier — so this is
  dogfood rather than invention. The reconcile arm's shape is a second worked instance of its **procedure library
  plus thin orchestration path** extraction, alongside the `generate-tasks` example that model was derived from,
  and the boundary rule below supplies the missing predicate for where such a cut falls: a procedure is extractable
  exactly when it is stopless. That is evidence returned upstream rather than a competing convention, and it is why
  this work composes with the agenda compiler instead of needing to be undone by it — the compiler needs the stops
  visible to enforce interlocks mechanically, which is precisely what the path shape preserves. **Extracting the bounded-wait
  primitive is inside the boundary**, despite being a refactor: the operative test asks whether a change would look
  different had that work unit's authoring pattern landed, and a TypeScript wait loop is unaffected by a
  workflow-authoring convention.
- **`judgment-authority-model` — no reach.** Its discriminator sorts _prohibitions_ by what they guard against;
  this work unit is about _prescriptions_ — sequencing, not permission. The two do not meet: this step's
  prohibitions are bias-guarding and survive unchanged, because the defect is not any single prohibition but the
  125 lines between them. Defect C's framing half is genuinely that work unit's face (c) — authority located,
  capability or standing miscommunicated — and the fix here is the narrow enactment, not the model.
- **`wu-lifecycle-state-model` — it owns the vocabulary; this owns one command name.** It holds the `State` values
  and carries `project-state-integrity`'s contract to mint none and re-key none. Everything here respects it: the
  rename touches a CLI command, not a state, and the fire-point correction moves when an existing transition fires,
  not what it means. The `Candidate` state and the `propose` transition are that work unit's. **No dependency edge**:
  this work is correct under today's model and stays correct under theirs.
- **`stub-mint-to-launch` — a third consumer of the PR-resolution contract.** Its draft already plans to reuse the
  shipped PR-resolution, merge-strategy, and base-sync contracts rather than create a second PR controller, so the
  verb this work unit mints is one it will call. That is a contract-shape input, not a dependency: the envelope
  should be designed to serve a third caller rather than only the two workflows in this change set. Worth a read of
  its current tip at specification time; no edge in either direction.
- **`review-protocol-alignment` — the extraction source, sibling.** It retains the review protocol's content
  concerns, one of which edits `integrate-work-unit.md` at the review-applicability step while this work unit
  rewrites the final merge step. Different regions, so neither blocks the other — but if both run concurrently,
  sequence the edits rather than merging them blind.

## Scope Estimate

Large, and larger than the extraction source estimated. Two integration verbs absorbing the phase's two stopless
spans — checkpoint and merge — plus the reconcile arm's rework into an orchestration path over stopless procedures,
which mints one base-merge verb and one typed CI-and-routing read; two further supporting verbs — PR resolution
across five sites in both workflows, and clearance await instantiated from a bounded-wait primitive extracted out of
`awaitHostedReview`; merge-method validation against the repository ruleset on both lanes; a CLI
command rename sweeping the workflows and skills that invoke it, with no deprecation surface since the project is
pre-public-release; a transition fire-point move, which also updates the `State`-table entry recording where
`Integrating` fires; and a five-site cut to the pull-request record.

Both workflows are in the change set throughout — `run-errand.md` for the `Coverage` cut, the PR-resolution verb,
the seam collapse, merge-method validation, and the clearance-await gap; `integrate-work-unit.md` for all of the
above plus the spine. Every `.arc/**` edit doubles into `packages/arc-framework/arc/**` by the two-copy discipline,
which is mechanical rather than a design question but is real edit volume. This is the only concern in its
extraction source whose deliverable was new CLI surface rather than a correction to existing surface.

Delivery is plausibly a stack rather than a single review pass — the rename and fire-point move are separable from
the extraction and land ahead of it. That is a `chunked-delivery` question about review and merge topology, not a
work-unit boundary question; the concern stays one work unit, since the surfaces are coupled by design rather than
merely co-located and the upper rail protects coupled one-design work from a size-driven split.
