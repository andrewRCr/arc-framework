# Spec (`detailed` · `RFC`): review-coverage-cadence

- **Origin:** [internal]

- **Purpose:** Make re-review after fixes proportional without losing what later passes find: a fix gets a local
  incremental fix check, a commit after convergence that answers no finding gets a local delta check, a `full-final`
  lane closes only on a complete pass at the settled head, and hosted sources run complete passes only. Code review
  and adversarial review share one pass model, and each review type — planning, code, verification — gets one named
  method that its lifecycle sites call.

---

## Introduction / Context

### The rule today

- `classify-review-risk` calls a change `sensitive` when a defect in it could be destructive, authoritative, or
  irreversible. Its list includes admission controls — review and merge gates, required checks, interlocks, and the
  evidence they read — so in this repository most code changes are `sensitive`. `reduceReviewRoutingBase`
  (`scripts/review-gate/policy/routing.ts`) routes `sensitive` to `standardReview: required` with
  `retrigger: full-final`.
- On the local non-delivery and Errand paths, `full-final` makes every pass after a fix re-read the whole target.
  `resolveOfferedCorrectionScope` (`policy/local-review-coverage-selection.ts`) returns no incremental scope under it,
  and the selection text rendered from that (`localCoverageInteractionText`) says "This route requires complete
  coverage"; `resolveErrandHostedCorrection` (`status-errand.ts`) requests complete coverage for any non-incremental
  route, and `errandNextPassCoverage` (`runtime/respond-command.ts`) reports `complete`. The gate offers no narrower
  check however small the fix, even when the Owner wants one.
- The work-unit path does not apply that cut, locally or hosted. `hosted-reservation-discharge.ts` resolves a correction
  scope from `currentCorrectionScopeCandidate` (`hosted-reservation-support.ts`) without checking `retrigger`, testing
  only that predecessor and current policies are equal. At the driver's `coverage-required`, `coverageSelectionChoices`
  offers a `delegated-agent` incremental pass, `@coderabbitai review` on CodeRabbit, or a Codex request that Codex's
  `complete-upgrade` setting records as complete; after a complete pass with material fixes nothing asks, status
  defaults to complete, and `--coverage incremental` takes the scope (`status.ts`). `status.ts` carries that scope into
  a delivery member's local action, and delivery admission skips local coverage selection (`runtime/local-prepare.ts`).
  A `sensitive` work unit is admitted to fix checks there while the same route forces complete coverage everywhere else.
- Probed on a throwaway pull request (§ Prior art), neither hosted provider re-examined a finding it had already posted
  there, yet ARC records each one's no-findings result as clean: Codex's "Didn't find any major issues" as a complete
  pass (`cleanForHead`, with `request()` returning complete coverage, `hosted/codex.ts`), and CodeRabbit's "No
  actionable comments were generated in the recent review" as whichever coverage was requested
  (`summaryReportsNoFindings`, `hosted/coderabbit.ts`; an incremental result is recorded only when its range evidence is
  established, `recordHostedAwaitAttempt`). A material fix to a hosted finding can therefore close the lane with no
  reviewer having re-read it, under either retrigger.
- A pass converges unless its approved dispositions fix a verified major or critical finding (`fixesMaterialFinding`,
  `scripts/review-gate/core/review-convergence.ts`), so on the work-unit path a pass returning only minor findings
  already completes the lane; on an Errand, whose fixed head starts unreviewed, any fix needs another pass
  (`projectFixConsequence`, `respond-command.ts`). The cost sits in complete passes that keep returning material fixes.
- A commit after a converged look that answers no finding — a CI or quality-gate fix — can take only a complete pass.
  Lane attempts bind a head, no approved response proves a fix check's range, and the ceiling counts every pass
  (`resolveReviewPolicy`, `review-policy-driver.ts`). PR #1034 converged on a clean CodeRabbit complete pass; a two-line
  change to an E2E test's expected object then needed a complete pass, which at the Errand's ceiling of two became a
  ceiling-override stop. The three paths answer "does the earlier review still apply?" three ways: an Errand offers no
  choice, pre-publication drops the earlier attempt, and the published singleton stops for the Owner (§ 3.5).
- `full-final` was introduced to mean that incremental passes may serve as feedback while satisfaction requires a final
  complete review of the settled target. Its first reader (`core/forward-coverage.ts`) required that final review and
  was removed with the shadow controller it served; the only readers since give it the every-pass reading above
  (`resolveOfferedCorrectionScope`, `resolveErrandHostedCorrection`, `errandNextPassCoverage`).
- In planning review, `resolve-planning-depth` re-enters a floor-raising signal one level higher, with nowhere up from
  `high`. This work unit's own draft review, at `high` in `draft-design`, met that edge twice: a re-entry offer was
  declined with "already at `high`" among its reasons, and when review stopped converging at two loci, the response that
  worked — returning those loci to shaping — is one no method names (`notes-review-coverage-cadence.md` § Planning
  review of this work unit).

### What complete passes found

One large `sensitive` change set in this repository — 326 files, about 17.7k changed lines, reviewed in 11 chunks — ran
eight complete standard passes on the `full-final` route. Each fix round changed 2–6% of the change set. Of the 57
findings fixed in passes 2–8 (`notes-review-coverage-cadence.md` lists every one, with the classification method):

- 9 sat inside the previous round's fix and 7 within 25 lines of it, both criticals among them;
- 6 sat in an earlier round's fix code that one to five complete passes had already read and passed;
- 21 were siblings: original code, in a defect class an earlier finding had already exposed;
- 14 were new defect classes in original code — 8 in pass 2, 3 in pass 3, 3 in pass 5, and none after;
- separately, one rejected finding was raised again in each of passes 2–8.

Complete passes earned their cost through about pass 3. After that they mostly found fix-adjacent defects, which an
incremental check targets, and siblings, which a targeted sweep finds more cheaply than a whole re-read. A straight
switch to incremental review would have kept only 16 of the 57. The review ended on two incremental rounds the gate did
not offer, run outside it at the Owner's direction; the last returned only minor findings.

### Prior art

Nearly all of it predates agents. Each line says how it transfers to a reviewer with no memory between passes that
catches part of the defects on each run; sources and their confidence are in `notes-review-coverage-cadence.md`.

- **Inspection follow-up** (Fagan; Gilb and Graham; IEEE 1028): the moderator verifies rework, and complicated or
  critical rework goes back for re-inspection. The fix check is the moderator's verification, and the complete pass is
  the re-inspection. The often-cited "re-inspect above 5% rework" threshold is folklore.
- **Review hosts:** a substantive push resets approval — GitHub dismisses stale approvals, and Gerrit copies votes only
  across changes it proves are not semantic — while the re-reviewer reads the interdiff. An interdiff is safe for a
  reviewer who remembers the rest of the change. An LLM reviewer does not, so the fix check carries that context
  explicitly (§ 3.1), and a complete pass at the settled head closes review (§ 2.1).
- **Base movement** (Gerrit change kinds, GitHub, GitLab's `patch-id`, the Linux kernel's tag rules, `git range-diff`,
  `git log --remerge-diff`): approval carries across a base move that leaves the change's own diff unchanged, while a
  conflict resolution counts as new content; code that needed a manual resolution was about 26 times as likely to be
  buggy in one study (an association). The applicability check already carries clean moves; where it stops for the
  Owner, a bounded check of the resolution informs the choice (§ 7.7).
- **Change and test impact analysis** (DO-178C, ISO 26262; Google, Meta): re-verification is scoped to what a change
  affects and widens with criticality, with a periodic complete run as the net for what selection misses. This is the
  fix-check-plus-cadence shape, and the `sensitive` route keeps its complete passes.
- **Remaining-defect estimation** (capture-recapture) underestimates with fewer than four inspectors, and repeated runs
  of one model share blind spots, so on LLM passes it gives a lower bound at best. No validated stopping rule for
  repeated LLM review was found; "stop after k quiet passes" is untested, and in the change set above a pass that found
  no new class was followed by one that found three.
- **Variant analysis** (CodeQL, Project Zero): after one bug, hunt its variants. This is the sibling sweep.
- **Repeated LLM review** shows low run-to-run overlap. A different source, model, or framing likely adds more than
  another run of the same one — an inference, not a finding.
- **Priming:** earlier review comments act as reminders for human reviewers, raising detection of the flagged type with
  no loss elsewhere, while LLMs anchor on supplied verdicts and are barely helped by being told to ignore them. A
  complete pass may receive pointers to earlier findings; it never receives verdicts (§ 9).
- **Instruction literalness:** current model guides warn that literal-reading models are damaged by contradictory or
  vague instructions, and that the reason behind an instruction helps a model generalize. Nothing found tests a split
  between enforced bounds and advisory considerations directly.
- **AI review tools:** probed on a throwaway pull request, Codex and CodeRabbit each reviewed the whole pull request but
  reported only defects they had not already posted there — CodeRabbit's full review included — and each remembered only
  its own findings.

## Goals

1. **A `full-final` lane closes on a complete pass at the settled head.** Between complete passes a fix gets an
   incremental fix check, and convergence on a fix check alone never satisfies `full-final`.
2. **Every material fix is re-examined by a reviewer that can re-examine it.** A fix check carries the context a
   memoryless reviewer lacks, sweeps for siblings, and runs on the local reviewer; no lane closes on a material fix that
   only a hosted source has seen.
3. **The pass ceiling bounds complete passes.** Fix checks run outside it, each round admitted by the disposition
   approval it verifies.
4. **The Owner decides with facts and a labeled recommendation, at stops that already exist.** The CLI computes bounds
   and facts but no verdict, the agent's judgment is labeled advisory, and each coverage question is asked once.
5. **The rule holds on every path:** an Errand before and after its pull request, pre-publication, the published
   singleton, and a delivery member.
6. **Code review and adversarial review share one pass model,** held in one method and rendered in one report shape; a
   fix check and a successor pass are never traded for each other; and a loop that stops converging is pointed to a
   response that exists at its stage's level.
7. **A complete pass receives earlier findings as pointers and no verdicts,** and triage catches a rejected finding
   raised again.
8. **Each review type has one named method** that its lifecycle sites call, every review step sits in exactly one
   place, and the known drift between sites is fixed.
9. **One stored addition, an advisory note.** No stored record kind or shape is added, and the one field added is a
   fix's tag: optional, outside the approved set's identity, and written once by the approved respond call (§ 10.4).
   Every other new fact derives from records that exist.
10. **A commit after convergence that answers no finding gets a scoped look, not a complete pass,** on an Errand, in
    pre-publication, and on the published singleton, wherever Git proves its range: under `incremental` a delta check
    that closes the lane when it converges, and under `full-final` a look before the Owner's stop wherever one follows.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **add a stored record kind, field, or shape beyond § 10.4's optional advisory fix-tag note,** or change what
  `review/adversarial-pass` or any review-gate operation record holds. Where a choice would need another stored addition
  — a counted base-merge check marking its scope in a stored record, or a `targeted-check` choice on the
  review-applicability selection — that choice is not made here (§ 7.7).
- **change routing.** `sensitive` keeps `retrigger: full-final`, and `routing.ts` needs no change.
- **store origin tags or other rework state beyond that advisory fix-tag note.** Whether a fix was new design stays
  the agent's judgment, informed by observable signals (§ 6.1).
- **compute a remaining-defect estimate, a quiet-pass stopping rule, or a verdict on the next pass.**
- **vary sensitivity by path** within a change set.
- **discharge a correction obligation** because a later pass independently validated the fix.
- **make an Owner-accepted terminus durable, or add one where none is taken today.** An acceptance is still dropped once
  an approved fix advances the Candidate, the frontline lane still takes none, an Errand still takes no terminus, and
  neither the published singleton after publication nor `deliver-stack`'s member review takes one (§ 8.3).
- **model human review,** which follows agentic review out of band and is never a pass.
- **rename** `adversarial-review`, `validate-criteria`, `full-final`, the `standard-review/v1` rubric identity, the lane
  vocabulary (`review.standard_*`, `review.frontline_*`, `arc review frontline`), the store kind
  `review/adversarial-pass`, or any stored or schema literal or published schema ID that carries a renamed method's name
  (§ 12).
- **give code review one CLI driver** across its four site commands; each site keeps a thin dispatch on its own command
  (§ 11.3).
- **add a shortcut around a bound delivery's correction route,** let a fix the bounded check prompts land before the
  Owner's first choice at a bound stop, or add a typed mark of a held correction to the delivery continuation's stops
  (§ 7.7).
- **offer a typed base reconcile between fix rounds** for overlapping drift.
- **carry an earlier review across a commit with no look,** or by the kind of path the commit touches, except by the
  Owner's choice where a stop takes it; **change the Candidate checkpoint** a moved Candidate meets before review; or
  give a delivery member the delta check (§ 3.5).
- **change delivery-member review-fix admission.**
- **shape a hosted request.** No focus hint, pointer list, or fix-check text rides `@codex review` or
  `@coderabbitai full review` (§ 7.10, § 9.3).
- **edit `docs/`.**

## Proposed Design

§ 1 bounds the change and orders it. § 2–9 settle code review's half of the pass model: convergence, the fix check, the
next-pass context, the ceiling, the offer, source selection, the Owner's decisions, and what a complete pass receives.
§ 10 states the shared model and its report, § 11 the review family's methods, § 12 the names, and § 13 the remaining
references.

### 1. Boundary, segments, and storage

#### 1.1 One work unit

The boundary read keeps the change whole (`stays one WU`). Its concern is one: how much each review pass re-reads, and
the model and methods that carry that rule. The four segments edit the same review fire-points: segment 4's review-type
methods carry segments 1–3's cadence and model, so rewiring the sites once, after the rule settles, costs less than
rewiring them twice. Segment 1 could land alone, but the change lands as one branch with chunked review and carries no
delivery plan.

#### 1.2 Segments

1. **Cadence, local and hosted** (`slice`) — § 2, § 3, § 4's convergence and admissibility facts, § 6, § 7, § 8, and
   § 9's pointers and lane read, with the workflow arms they change. It closes when, on every path Goal 5 names, a
   `full-final` lane takes a local fix check after material fixes, does not close on it, and closes on a complete pass
   at the settled head, and when a plain commit after a converged look takes § 3.5's delta check wherever it is
   admissible.
2. **Ceiling and fix-check approval** (`slice`) — § 4's complete count and § 5. It closes when a lane at the ceiling
   runs fix checks with no override and a complete pass past the ceiling requires one.
3. **Shared model** (`layer`) — § 10 and its report surfaces. It closes on a settled `review-model` method and a report
   shape that both families render.
4. **Review family** (`replication`) — § 11 and § 12's renames, with every site rewired. It closes when a step inventory
   re-derived on the then-current base shows every review step from before landing in exactly one place after, and
   § 11.5's drift list is fixed.

#### 1.3 One stored addition

Every new fact but one derives from records that already exist; the one is a fix's tag, kept as an advisory note
(§ 10.4):

- convergence (§ 2) changes what a derived signal reports, not its shape. The integration boundary stores the resolve
  envelope in two places (`CandidatePolicyReviewBoundarySchema.policy` and `CandidateFixBoundarySchema.policy`,
  `integration-boundary-locus.ts`), and both keep their shape;
- the next-pass context (§ 4) is computed per composition and passed to the driver as internal inputs that no command
  request, stored record, or resolve-envelope payload carries;
- the complete count derives from stored `effectiveCoverage`, and `logicalPass` keeps numbering every finished attempt
  (§ 5.2). The provisional assessment gains one field, on a respond envelope that is stored nowhere;
- the delta check (§ 3.5) writes the incremental attempt a fix check writes, and its basis is computed by the
  confirmation that proves its leg;
- source selection (§ 7) happens where each next pass is composed, from the terminal signal that is already derived;
- the bounded check at a base merge (§ 7.7) is stored nowhere, and a fix it prompts under a bound delivery lands as a
  correction task under an existing plan revision, through the delivery's own correction route;
- removing hosted incremental review (§ 7.9) deletes writers, not stored fields; every reader of a stored incremental
  hosted record stays;
- a complete pass's pointers (§ 9) are composed into the reviewer-instructions string the local review operation already
  stores, and the lane read (§ 9.4) composes its rejections and facts from lane progress and the disposition records of
  an Errand's, a Candidate's, or a delivery member's lineage;
- the report's render-only inputs (§ 10.4) ride beside `proposal` on the first respond call and are never stored,
  except each fix's tag, which the approved call stores on the disposition record's lineage node, outside the approved
  set's identity, as an optional field;
- the review family (§ 11) moves prose and adds and renames methods, keeping every stored literal that carries a renamed
  method's name (§ 12).

### 2. Convergence under `full-final`

#### 2.1 The rule

Under `full-final`, the standard lane completes only on a complete pass at the final head whose approved dispositions
fix no material finding. A complete pass the applicability check carries to the final head counts, as today, including
one the Owner's `covered` carries at an applicability stop (§ 7.7): that choice becomes the `owner-covered` authority,
which retains the prior attempt (`reviewApplicabilityConsumerAction`, `review-applicability-authority.ts`), and the
discharge keeps that attempt as the terminal (`hosted-reservation-discharge.ts`). Between complete passes, a fix gets an
incremental fix check (§ 3).

`sensitive` keeps `retrigger: full-final` as its stored value, so this changes behavior, not routing:

- **No transition pass.** `compatibleStandardPolicy` and `resolveOfferedCorrectionScope` compare the predecessor's
  requirement, `retrigger` included, with the current one. They still match, so reviews already in flight keep their
  incremental basis.
- **The surface promotions keep `full-final`,** with no change to `reduceReviewRouting`'s `sensitive` guard.

Under `incremental`, the coverage chain (`resolveIncrementalCoverageBasis`, `incremental-coverage-basis.ts`) keeps
deciding adequacy as today.

#### 2.2 The derivation

Under `full-final`, `deriveVerifiedTerminalSignal` (`policy/review-policy-evidence.ts`) reports `coverageAdequate` only
when the terminal attempt's own `effectiveCoverage` is `complete`. A converged fix check therefore resolves to the
policy driver's existing `coverage-required` state (`review-policy-driver.ts`) rather than `pass-complete`. An
unconverged one lands there too, because the driver reads coverage before the material fix; its response still runs
before the next pass. The signal is derived centrally, so the local, Errand, and work-unit paths all inherit the rule.

Today the payload's `responseRequired` cannot separate those cases. The driver sets it from the last attempt's outcome
without consulting `terminalResponseSettled`, which only pre-publication supplies, and `projectReviewPolicyAttempt`
(`review-policy-attempt.ts`) folds `settled-findings` into `findings`, so it says only that the terminal had findings,
settled or not; `continuationChoice` (`review-policy-evidence.ts`) pairs it with whether the response was performed.
The next-pass context therefore derives `responseDue` from the response evidence it reads for convergence
(`readIncrementalPredecessorResponseEvidence`, `review-policy-evidence.ts`): true while the predecessor's findings
response is unapproved or unperformed, false otherwise. `responseRequired` reads that fact, which is what a workflow
arm keys on (§ 2.4). `terminalResponseSettled` remains pre-publication's own input, whose fall-through is its successor
(`composePrePublicationReviewRequest`, `pre-publication-request.ts`); other compositions do not set it. The composition
splits on whether the last look converged, which the next-pass context supplies (§ 4):

- **after a converged look,** a clean one included, it re-resolves to the complete pass with the source § 7.1's rank
  picks, once any response the terminal requires is performed (§ 2.3, § 8.2), unless a plain commit followed and the
  next-pass context admits § 3.5's delta check first;
- **after an unconverged look,** it surfaces `coverage-required`.

#### 2.3 After a converged look the next pass is complete, and nothing asks

Under `full-final`, once a look converges — a fix check, or a complete pass whose minor fixes still need a pass, as an
Errand's do after any fix (`projectFixConsequence`, `respond-command.ts`) — complete is the only coverage that can
converge the lane. The CLI admits the complete pass instead of stopping for a selection with one sensible choice: the
next-pass context reads the predecessor as converged, the composition re-resolves as if complete were selected
(`continuationChoice`), and § 7.1's rank picks the source. No fix check is offered there, since one would re-read at
most minor fixes that the complete pass reads anyway. Under `incremental`, the pass a subject still needs after a
converged look is a fix check, as today. The Owner's alternative is the stop (§ 8.2) wherever a surface takes one
(§ 8.3), and § 6.2 says when the agent asks for it. A plain commit after a converged look, one that answers no finding,
takes § 3.5's delta check where it is admissible, before the complete pass under `full-final`.

#### 2.4 Workflow arms on `coverage-required`

A workflow arm cannot read the next-pass context; it follows the driver's typed state. The arms added for
`coverage-required` therefore split on response performance, which lane progress records (`settled-findings`) and the
payload's `responseRequired` reports (§ 2.2):

- **while the response is unperformed,** which a converged fix check with minor fixes also reaches, they enter the
  disposition protocol;
- **once it is performed,** the next pass goes to ordinary local prepare off the delivery path, which asks the coverage
  question, and to status's selection on it, after which local prepare does not ask again (§ 6.4).

No workflow has such an arm today. `run-errand`'s resolve dispatch gains one, and so does `prepare-work-unit`'s
pre-publication policy dispatch, to which the procedure forwards `coverage-required` as an unsettled standard state
(`isSettledStandard`, `pre-publication-procedure.ts`). Status's routes handle it as § 6.4 and § 7.5 describe.

#### 2.5 Readers that predict convergence

- `projectFixConsequence` (`respond-command.ts`) tells a delivery member that approving minor fixes closes the lane,
  which `fixConsequenceText` renders as "moves the head without another standard pass". A fix check under `full-final`
  no longer does, so the consequence follows the rule.
- The converged rule restated in `run-errand`, `prepare-work-unit`, and `integrate-work-unit` follows it too;
  `run-errand`'s "A converged result replays as complete" no longer holds for a converged fix check under `full-final`.

### 3. The fix check

#### 3.1 What it is

A code-review fix check is adversarial review's fix check run over code review's existing incremental attempt: an
independent review of the approved repairs, outside the pass ceiling (§ 5), offered beside the disposition set and
declined only on the fixes' own merits (§ 10.2), in rounds that each check the previous round's repairs. It carries
explicitly what a reviewer with no memory of earlier passes lacks:

- **from code review:** the correction scope and its basis head, and re-examination of every earlier material finding at
  its locus (`buildIncrementalCorrectionScope`, `localReviewerInstructions`);
- **from adversarial review:** the four rubric axes — closure, behavioral grounding, propagation and completeness, and
  new failure;
- **the sibling sweep,** as its propagation axis: for each finding it re-examines, whether the same defect recurs
  elsewhere in the complete change set. `review-triage` already sweeps the reviewed change for other instances of each
  confirmed defect before approval, so an approved fix covers the class, and today's incremental reviewer prompt already
  asks the recurrence question; the fix check's rubric carries it.

A fix check always runs locally, on `delegated-agent`, whichever source ran the pass before it, because only the local
reviewer takes ARC's instructions (§ 7.10). The local path already accepts a hosted pass as its predecessor
(`standardPredecessorSourceId` and `resolveOfferedCorrectionScope`, `local-review-coverage-selection.ts`). It is no new
attempt kind, admission path, counter, or authorization record.

#### 3.2 Admitted only after a fix

A fix check runs only after an approved, performed response that fixed something. Today
`buildIncrementalCorrectionScope` also admits an incremental pass after a clean predecessor, because
`readIncrementalPredecessorResponseEvidence` reports a clean predecessor as performed. The bound lands in the producer,
`buildIncrementalCorrectionScope`, never in that reader's performed reading, which the coverage chain's walker also
consults for every earlier link. The reader also reports whether the approved set holds a `fix` disposition, which it
computes today (`hasFix`) without returning it; the producer bounds on that, and the walker ignores it. Under
`full-final`, the next-pass context additionally admits a fix check only after an unconverged look (§ 2.3, § 4).
§ 3.5's delta check is the bound's sibling: after a converged predecessor, where no performed response produced the
head, a scope resolves only with its range proof.

#### 3.3 Chunked by the range it reviews

A fix check is chunked like any pass when its own range is large, as `review-chunking` already prescribes: its change
set runs from the predecessor head to its head, the earlier range stays covered by the coverage chain, and each carried
finding is re-examined in the chunk whose scope holds its locus, or in the seam. Chunked scope with incremental coverage
is already admitted, stored, and replayed (`DeliveryLocalReviewSelectionShape`, `delivery-local-review-admission.ts`).
Size never trades a fix check for a complete pass: the fix range's size against the target is one of § 6.1's facts, and
informs only what follows converged fix checks. The chunk gates in `integrate-work-unit` and `deliver-stack` keep their
rule; what they read changes.

Both measures count the whole target today:

- on the delivery path, status measures `baseRevision..headSha` after coverage is chosen but without it
  (`resolveDeliveryMemberScopeSelection`, `status-delivery-scope.ts`, called from `status-composition.ts`), so every fix
  check on a large member is chunked;
- elsewhere, where the workflow runs it — `prepare-work-unit` skips it while a recorded `stays one WU` decision's
  evidence is unchanged — the agent runs `arc review changeset resolve -` (`resolveReviewChunkingCommand`,
  `review-chunking-command.ts`) over the envelope's target, `diffBaseSha..headSha`, before local prepare offers
  coverage.

The measure instead runs once the pass's coverage is known, over the range the pass reviews:

- **On the delivery path,** status passes the chosen coverage and its correction scope to the measure, which counts
  `predecessorHeadSha..headSha` for a fix check and the whole member for a complete pass; local prepare's re-check
  (§ 7.6) measures the same way. The agent's `changeset resolve` runs on delivery only at materialization, before
  publication, over each member before its push gate (`deliver-stack`'s candidate preparation). Once the delivery is
  published, after a fix the review-fix continuation (`arc delivery review-fix continue -`) returns to
  `arc review status` with no measure between, and `deliver-stack` says that later movement "requires another exact
  check" without naming a step that runs it. Status's own measure is that check, and `deliver-stack` says so in place of
  that sentence. The chunk gate in `deliver-stack` and in `integrate-work-unit`'s delivery route then reads one measure
  at a moved head, taken after the coverage choice; an agent-run whole-member check there would return `consider-chunks`
  on a large member, and the gate would refuse status's whole-target fix check.
- **Off the delivery path,** local prepare asks before it admits or stores anything (`settleLocalPreparation`,
  `runtime/local-prepare.ts`), so the workflow measures after the pick and before the call that carries it.
  `changeset resolve` takes the two commits verbatim (`resolveMemberCoordinates`, `hosts/local/repository-target.ts`),
  so for a fix check the request names the correction scope's `predecessorHeadSha` as `diffBaseSha`, and the command
  needs no new field. The result's target is then the fix range, with its own `targetId`, and for a fix check the gate's
  exact target is that range; nothing binds it to the review target, since the gate is workflow-only and local prepare
  takes its scope separately. The delivery-binding lookup that a tripped result with unavailable evidence falls back to
  reads only the target's kind and head and the work unit (`delivery-binding-lookup.ts`), so it resolves a fix range as
  it would the whole target. The chosen scope rides into local prepare as `policyJudgment.scopeMode` and into the
  procedure's `--lanes`, and `prepare-work-unit` and `integrate-work-unit`'s singleton route say so. Today
  `prepare-work-unit`'s `ready / local-prepare` arm carries no scope, so local prepare runs whole-target whatever the
  gate chose, and the mismatch surfaces only at the next procedure call (`ReviewProducerScopeMismatchError`).
  `integrate-work-unit`'s singleton route gains the measure its chunk gate refers to, which nothing in that step
  produces today. Materialization repeats after a pre-publication fix (`prepare-work-unit`) and retains a whole-member
  selection for the pre-publication review (`deliver-stack`); that selection serves only a complete pass, and a fix
  check there takes the fix-range measure.
- **A first pass,** with no predecessor, measures the whole target, as today.

The bounded check at a base merge (§ 7.7) is not a pass and is never chunked: it reads a residual the applicability
check already bounds at 200 paths and 16 KiB of path text (`MAX_EVIDENCE_APPLICABILITY_PATHS` and
`MAX_EVIDENCE_APPLICABILITY_PATH_BYTES`, `lib/evidence-applicability/schema.ts`). An Errand stays unchunked, as
`run-errand` already prescribes.

#### 3.4 When coverage changes at one head

Scope follows the new pass. One request carries one scope: the continuation's terminal binding requires it to equal the
terminal producer's (`ReviewProducerScopeMismatchError`, `review-policy-evidence.ts`), and the fresh resolve reuses the
request (`resolveEvidenceBoundReviewPolicyContinuation`). A complete pass after a clean fix check at the same head would
therefore inherit the fix check's scope — a step § 2.3 makes usual and the coverage-aware measure makes differ. The
continuation binds the terminal with the terminal's recorded scope and resolves the successor with its own, the same
split as § 7.2's two source lists.

#### 3.5 A plain commit after convergence: the delta check

A commit after a converged look that answers no finding leaves the lane needing a pass, and today that pass can only be
complete (§ The rule today). A **delta check** is the scoped look it takes instead: an incremental local look, on
`delegated-agent`, whose range Git proves, where a fix check's range is proven by the response that made it (§ 7.4).

- **The range proof.** The predecessor converged, as the next-pass context reads it (§ 4): its approved response, if
  any, is performed and fixed no material finding. The current target's base ref, diff base, and diff-base tree equal
  the predecessor's. The current head differs from the predecessor's head and descends from it with no merge commit
  between them (`readAncestry`, `lib/work-unit/git-decomposition-object-readers.ts`; `readCheckMerges`,
  `lib/checks/merged.ts`), so the proof never holds at the converged look's own head. A minor fix the converged look
  approved may sit in the range, and the look reads the whole range.
- **Its record.** The attempt a fix check writes: incremental, with an `IncrementalReviewScope` from the predecessor's
  head carrying the predecessor's required findings (`buildIncrementalCorrectionScope`). Nothing stored tells a fix
  check from any other incremental attempt (`IncrementalReviewScopeSchema`, `LocalReviewCoverageAdmissionSchema`), so
  the readers that label looks by coverage — § 6.1's trend, § 6.2's arm, and § 10.4's report — read a delta check as a
  fix check, and what follows a converged one is the same.
- **Its instructions.** The incremental reviewer prompt already asks for the whole range to be reviewed and the clean
  rules applied to it (`localReviewerInstructions`, `core/local-prepare.ts`). The delta check takes that and the
  required findings' re-examination, without § 3.1's closure axis, which needs a fix to close. Nothing stored tells a
  delta check from a fix check, so the context's basis reaches `publishLocalReviewPreparation` beside its guidance, in
  an instruction input that is never persisted, and the stored schemas are unchanged.
- **Admission.** The range proof is the chain proof's last ground (§ 4), which reaches every chain confirmation. A
  confirmation reports which ground held: one it accepts today, such as an equal subject digest
  (`noPullRequestCandidatePriorApplicability`, `pre-publication-composition.ts`), contribution applicability
  (`projectGitReviewContributionApplicability`), or a recorded Candidate selection
  (`candidateReviewApplicabilitySelections`); the performed-response test (§ 7.4); or the range proof. It tests today's
  grounds and the performed-response test first and reports the range proof only when none of them holds, so every leg
  that holds today keeps its ground. The next-pass context's basis is a delta check when the current leg's ground is the
  range proof (§ 4), and is never stored. The range proof is a result of its own, `range-proven`, that only the
  resolution of a correction scope and the coverage chain's re-confirmation on every later round accept
  (`resolveIncrementalCorrectionScope` and `resolveCoverageChain`, `incremental-coverage-basis.ts`); every other check
  of a confirmation's result treats it as not applicable. It never carries an earlier attempt to a later head, since no
  consumer that carries an attempt from its own head to the current head calls the chain proof: pre-publication's
  historical-attempt carry (`applicableHistoricalAttempt`, `pre-publication-request.ts`); the discharge's branches that
  settle on an earlier attempt `projectEarlierReviewApplicability` marks `retain-prior-attempt` (`cleanApplicable` and
  `settledApplicable`, `hosted-reservation-discharge.ts`), and hosted request admission's `applicabilityAction`
  (`handlers/review.ts`), which reads the same mark; and Errand status's carry check (`readCarriedErrandReview`), whose
  contribution applicability never takes it. The exclusion covers that one leg: it never blocks a delta check's own
  attempt at its head, so under `incremental` a converged one closes the lane there, and a carried attempt's own
  coverage chain still accepts a delta leg. A delivery member's confirmation
  (`confirmDeliveryMemberIncrementalApplicability`) never takes the range proof.
- **Cost.** It sits outside the ceiling, as a fix check does (§ 5.3, § 5.4), and takes no approval: the commit already
  passed its review-increment approval gate, and the look is local. Where it is admissible nothing asks: local prepare
  and status admit it without a selection (§ 6.4), and source selection limits to `delegated-agent` whatever the
  configured rank (§ 7.2). It is admissible only where `delegated-agent` can run — the configured list names it, or is
  empty and local prepare falls back to it (§ 7.3) — so the limit never empties the selection. Elsewhere nothing changes
  from today: the complete pass runs on an Errand and in pre-publication, and the published singleton meets the
  review-applicability stop. The limit names `delegated-agent` because an incremental look is local-only (§ 7.9,
  § 7.10). It has no exception, so every composition derives it from stored records as it derives the delta check (§ 4),
  and no choice has to travel between them; honoring another source would need the choice carried to each, which needs a
  stored choice (§ Alternatives & Rationale). While a delta check is admissible the driver therefore refuses a forced
  source other than `delegated-agent`, with a remedy naming the delta check (§ 7.2). The Owner's other outcomes come in
  a fixed order (§ 8.1):
    - a local complete pass instead, by complete coverage supplied in local prepare's request (`coverageAdmission`),
      where every path's local pass runs, the published singleton's included (§ 7.5), with no correction scope
      (`LocalReviewCoverageAdmissionSchema` refuses one) and counted against the ceiling. Status's `--coverage` does not
      reach that request: where status routes the singleton to a local pass it returns `review-required` without the
      coverage today (`composeSingletonRequest`, `status.ts`), and it refuses a supplied `--coverage` there instead,
      with a remedy naming local prepare's `coverageAdmission`, rather than dropping it (§ 6.5). Local prepare's
      coverage default assumes complete today when the request supplies none (`resolveLocalPreparationContext`,
      `runtime/local-prepare.ts`); the coverage selection's `ready` result instead returns the coverage and scope it
      admits (`resolveLocalReviewCoverageSelection`), which settlement and its replay adopt (`settleLocalPreparation`),
      so with none supplied local prepare takes the delta check wherever one is admissible (§ 6.4);
    - under `full-final`, the hosted complete pass that follows the delta check by the configured rank (§ 2.3);
    - under `incremental`, on an Errand and in pre-publication, a hosted complete pass after a converged delta check
      closes the lane, through an additional pass (`additionalPassAuthorization`, which Errand status and
      pre-publication's lane request carry). On the published singleton a converged delta check settles the lane, as a
      converged look does today: its discharge takes no additional-pass authorization
      (`HostedReservationDischargeReaderArgs`, `hosted-reservation-support.ts`). A hosted complete pass after a plain
      commit, which today's review-applicability stop reaches through `review-required`, is therefore reachable there
      only by re-rooting the Candidate through the Candidate checkpoint's `changed`, after which the complete pass runs
      as today; the local complete pass is the Owner's lighter alternative.

**Under `incremental`,** a converged delta check closes the lane; findings take the ordinary response, then fix checks.

**Under `full-final`,** the delta check runs only where a stop follows it, and never closes the lane (§ 2.1):

- on an Errand with an open pull request and in pre-publication, it runs as a lane attempt, and § 6.2's arm acts after
  a clean one as after a clean fix check, offering `run-errand`'s Owner-directed review stop or pre-publication's
  terminus when the judgment recommends stopping; otherwise the complete pass runs;
- on the published singleton the review-applicability stop stays, with § 7.7's bounded check before the Owner's choice,
  and `covered` carries the last complete pass (§ 2.1);
- an Errand before its pull request takes no stop, since `run-errand`'s Owner-directed review stop needs an open pull
  request, so the complete pass runs with no delta check first.

**Where it applies:**

- **an Errand,** before and after its pull request. Local prepare's confirmations
  (`confirmErrandFixResponseApplicability` before; `createLocalContributionConfirmation`, through
  `confirmNonDeliveryIncrementalApplicability`, after), the `arc review resolve -` handler's, Errand status's
  (`confirmErrandCorrectionPredecessor`, `status-errand.ts`, and its resolve at a new head), respond's Errand chain
  (`runtime/respond-composition.ts`), and hosted request admission's Errand branch take the range proof through the
  chain proof. None admits that leg today: the confirmations require the predecessor to have had findings
  (`exactErrandResponseContext`, `local-review-coverage-selection.ts`; `sharesCorrectionBase`) and its fix to have
  produced the current head, and with a pull request open contribution applicability returns `review-required`; the two
  with no confirmation admit no incremental leg at a new head (§ 7.4). Errand status still never carries the earlier
  review without a look (`readCarriedErrandReview`);
- **pre-publication.** A moved Candidate first meets the Candidate checkpoint, which guards the Candidate's own
  currentness and which this change leaves alone. Once `covered` or `targeted-check` advances the same Candidate to the
  new head, the historical-attempt carry still drops the earlier attempt, since the subject changed. The next pass's
  correction scope resolves through local prepare's private correction basis (`confirmPrivateCandidateCorrectionBasis`),
  which today refuses a predecessor without findings (`privateCandidateTargetsMatch`) and takes the range proof, and
  respond's chain confirmation re-confirms that leg, so the complete pass becomes a delta check. After `changed`, which
  roots a new Candidate, the complete pass runs as today;
- **the published singleton.** The Candidate checkpoint still comes first. Today the discharge then returns
  `resolve-review-applicability` before coverage or the ceiling is read (`projectEarlierReviewApplicability`,
  `earlier-review-applicability.ts`), whose `decision-required` maps to `stop` (`reviewApplicabilityConsumerAction`,
  `review-applicability-authority.ts`). Under `incremental`, when the earlier terminal converged and the range proof
  holds, the discharge requests the delta check in place of whichever stop the plain commit's classification would
  raise, bounded or not, since the delta check reviews the range itself: `delegated-agent`, with the correction scope
  its `confirmCurrentApplicability` resolves by the range proof. It and `confirmIncrementalPredecessorApplicability`
  (`hosted-reservation-support.ts`) test the range proof directly, never through the earlier-attempt read that maps a
  retained attempt to `applicable` (`incrementalApplicabilityFromEarlierRead`). The request carries no invocation the
  discharge recovers from an earlier attempt (`retainedOwnerCleanAttempt`, `hosted-reservation-support.ts`) and no
  source list cut from one (`configuredSourceSuffix`, `hosted-reservation-admission.ts`), so an earlier pass's forced
  source neither reaches the driver nor drops `delegated-agent`. The earlier attempt is never retained across the
  commit. So `covered` is not offered there for a plain commit; it would save only a local look. Under `full-final` the
  stop is unchanged.

**Delivery members keep today's behavior.** A member's head moves only through the delivery's correction route or a
restack (`arc delivery review-fix continue -`, `deliver-stack`), and a moved member meets the review-applicability stop.

**Base merges stay out.** A merge's residual is not a linear range of commits, so carrying review across one without a
stop would need the stored scope marker § 7.7 declines. A delta check needs none: the coverage chain re-proves its range
from Git on every round.

### 4. The next-pass context

Every composition that builds the policy driver's request derives three facts from stored records, through one shared
helper:

1. **the complete count** — the lane's finished passes whose `effectiveCoverage` is `complete`. Lane progress already
   derives it as `completePasses` (`countCompleteLogicalPasses`, `lane-progress.ts`), and a superseding Candidate
   already inherits it beside the finished-pass number (`readCandidateInheritedLaneProgress`,
   `lane-progress-supersession.ts`);
2. **the predecessor's convergence and response state,** which § 2.2's composition split and § 7.1's source selection
   read: `none` before a first pass, `converged` after a clean look or a performed response that fixes no material
   finding, `unconverged` once an approved response fixes a material finding, and `pending` while a response that fixes
   none is unapproved or unperformed. Beside convergence, `responseDue` is true while the predecessor's findings response
   is unapproved or unperformed, false otherwise, derived from the same response evidence
   (`readIncrementalPredecessorResponseEvidence`, `review-policy-evidence.ts`);
3. **whether an incremental look is admissible, and on which basis** — the correction scope
   `resolveIncrementalCorrectionScope` (`incremental-coverage-basis.ts`) resolves for the next attempt, with the basis
   the ground of the current leg's confirmation sets: a fix check, which under `full-final` follows only an unconverged
   look (§ 2.3); a delta check after a plain commit, admissible only where `delegated-agent` can run, and under
   `full-final` only on an Errand with an open pull request and in pre-publication (§ 3.5); or none.

The driver takes all three as internal inputs, beside `sources` and `maxPasses` (`ReviewPolicyRequestSchema`,
`review-policy-driver.ts`), and the chosen coverage joins them once selected (§ 5.3). None rides the command request,
which carries only `completedPasses` (`ReviewPolicyRequestBaseShape`) and is stored — each approved disposition's
lineage node keeps the whole request (`ApprovedDispositionLineageNodeSchema.responsePolicyRequest`,
`core/advisory-records.ts`). The agent never supplies them, so `run-errand`'s hand-built request is unchanged. One
helper replaces a mechanism per site, so every composition reaches the same answer from the same records.

The admissibility fact rests on one chain proof the helper shares. Each composition's confirmations keep their call
sites and today's grounds, and take the chain proof for every correction scope and chain re-confirmation: the
performed-response test for a leg that holds a fix (§ 7.4), and § 3.5's range proof as a result of its own. A
composition with no confirmation of its own takes the chain proof alone, and a consumer that carries an earlier attempt
to the current head never calls it. The context's `responseDue` supplies response state (§ 2.2);
`terminalResponseSettled` stays pre-publication's own input, unchanged, rather than being supplied by every composition.

The compositions, each of which builds the driver's request directly or through the evidence binders:

- **the evidence binders** (`review-policy-evidence.ts`): `bindReviewPolicyEvidence`, whose two parse sites build the
  internal request, and `resolveEvidenceBoundReviewPolicyContinuation`, whose fresh resolve today rebuilds the request
  from the caller's (`{ ...request, attempts: [], sources, maxPasses }`) and drops every proven fact. The context's
  facts reach the fresh resolve too, beside § 7.2's selection list;
- **Errand status** (`status-errand.ts`): `resolveErrandLaneAtHead`, whose callers `readErrandRoutedObligation` and
  `readCarriedErrandReview` read lane progress, and `nextErrandPassObligation`, through `readUnreviewedErrandHead`;
- **`arc review resolve -`** (`resolveConfiguredReviewPolicy`, `handlers/review.ts`), described below;
- **hosted request admission** (the `authorizeCapacity` closure in `executeDefaultHostedRequest`, `handlers/review.ts`),
  in its delivery-member, Candidate, and Errand branches;
- **local prepare** (`validateLocalPolicyAdmission`, `runtime/local-prepare-composition.ts`, fed by
  `resolveSettlementPolicyAdmission`, `runtime/local-prepare.ts`). A delivery admission bypasses the driver there and
  carries status's pick (§ 6.4);
- **the singleton's discharge** (`resolveTerminalPolicy`, `hosted-reservation-discharge.ts`);
- **the hosted reservation admission** (`resolveEvidenceBoundHostedReservationPolicy`,
  `resolveEvidenceBoundSingletonHostedReservationPolicy`, `verifyCandidateAdditionalPassPredecessor`, and
  `candidateContinuationRequest`, `hosted-reservation-admission.ts`), which `status-composition.ts`'s delivery route and
  `status-singleton.ts`'s `resolveSingletonRequest` call for `status.ts`'s routes;
- **pre-publication** (the lane composition in `composePrePublicationReviewRequest`, `pre-publication-request.ts`, with
  the lane-progress and lane-policy dependencies `pre-publication-composition.ts` binds).
  `applyCarriedStandardReviewReservation` and `applyCarriedOwnerAcceptedTerminus` re-parse the bound request before
  `projectPrePublicationReview` (`pre-publication-procedure.ts`) resolves it, and the facts survive both re-parses. The
  procedure resolves the bound request directly (`resolveReviewPolicy`) and never reaches the continuation, so the lane
  composition applies § 2.2's split through the same decision (`continuationChoice`): after a converged look whose
  response is settled, it hands the procedure the fresh successor request the continuation builds, and the complete pass
  resolves by rank;
- **respond** (the `resolvePolicy` closure in `createRespondDependencies`, `runtime/respond-composition.ts`).

Two driver wrappers that only tests reach today — `assertStandardReviewExecutionAdmission`
(`review-execution-admission.ts`) and `resolveHostedReservationPolicy` (`hosted-reservation-admission.ts`) — take the
same inputs, so no path to the driver omits them. The inputs are standard-lane: the driver's internal request requires
them on the standard lane and refuses a standard-lane request without them rather than reading it as today's behavior.
The frontline lane, whose ceiling and numbering are unchanged (§ 5.1), takes none and refuses them, as it refuses a
terminus, so its direct calls stay as they are (`acceptedSingletonFrontlineSkip`, `handlers/review.ts`; the member
frontline resolve in `composePrePublicationReviewRequest`, `pre-publication-request.ts`; and the procedure's frontline
resolve in `projectPrePublicationReview`, `pre-publication-procedure.ts`).

Three counts of complete passes exist today. `countCompleteLogicalPasses` (`lane-progress.ts`) and the supersession
module's own count (`completePasses`, `lane-progress-supersession.ts`), which yields `inheritedCompletePasses`, share
one filter. `projectHostedReservationPolicyProgress`'s (`hosted-reservation-admission.ts`) also requires a verdict
outcome, has no frontline branch, and counts only one delivery member's attempts across lane-progress records. The
helper's count is the one derivation, and the other two take it — the third over the same member's attempts — so no
ceiling read can disagree with the driver's; `composeDeliveryReviewObligation` (`status.ts`) blocks a member when they
do.

`arc review resolve -` (`resolveConfiguredReviewPolicy`, `handlers/review.ts`) serves an Errand's main resolve and the
ordinary singleton's continuation (`integrate-work-unit`). It adds only `sources` and `maxPasses` today and reads no
lane progress; it takes the context from the request's lineage: the Errand claim's lane progress, as Errand status does,
or the Candidate's. It resolves the standard lane through the continuation
(`resolveEvidenceBoundReviewPolicyContinuation`) rather than `resolveEvidenceBoundReviewPolicy`, so a converged look
re-resolves to its successor there as it does elsewhere; its frontline resolve stays as it is, since the frontline lane
takes none of the context.

`scripts/integration/checkpoint-composition.ts` is not a composition: it reaches the driver only through the discharge
reader above. It copies lane progress's `completedPasses` into the discharge for the terminus binding
(`terminus.completedPasses === discharge.completedPasses`, `status.ts`), which binds an attempt and so stays on
`logicalPass` (§ 5.2).

### 5. The pass ceiling

#### 5.1 It counts complete passes

`review.standard_max_passes` bounds how many complete passes run on disposition approvals alone before the Owner makes
an explicit decision to spend more. A finished fix check is not counted; only passes whose `effectiveCoverage` is
`complete` are. Fix checks get no cap and no configuration: each follows an approved, performed response that fixed
something (§ 3.2), so every round already has its Owner approval. The approval to fix-check rides the fix round's
complete-set disposition approval — "approve these fixes, then fix-check them" — rather than adding a stop. Fix-check
spend stays visible as § 6.1's count of rounds since the last complete pass. The frontline lane's ceiling and numbering
are unchanged.

#### 5.2 Two numbers, each where it belongs

`logicalPass` keeps numbering every finished attempt in a lane and lineage, fix checks included, so `validatePassCounts`
(`core/lane-progress-state-validation.ts`) still holds one finished outcome per logical pass. The ceiling's count is
§ 4's complete count. The rule applies per comparison, not per function, since some functions do both.

A site that numbers or binds an attempt keeps `logicalPass`:

- the driver's own numbering (`review-policy-driver.ts`): the next pass (`completedPasses + 1`, at `ready` and at a
  pending chunk series), a terminal state's `pass`, and the approval consequence's `exhaustedPassCount` and `nextPass`;
- lane progress's admission and counting: `buildLaneAttempt` and `buildNextLaneProgress` (`lane-progress.ts`), the
  hosted admission's numbering (`recordHostedRequestAdmission` and `readHostedRequestAdmissionReplay`,
  `lane-progress-hosted-request.ts`), and local prepare's (`runtime/local-prepare.ts`);
- the evidence binding, which pins the request's `completedPasses` to the terminal producer's `logicalPass`
  (`validateTerminalResult` and `correctedTerminalRequest`, `review-policy-evidence.ts`), and respond's equivalent
  (`validateApprovedResponsePolicyBinding`, `respond-command.ts`);
- the next-pass context's predecessor match (§ 4), which replaces `resolveOfferedCorrectionScope`'s own
  (`local-review-coverage-selection.ts`) once it takes its predecessor from the context;
- the conditional-pass authorization's producer and consumer bindings: `requireCaptureProducer` and
  `bindConditionalPendingAdmission` (`lane-progress-conditional.ts`), `validateAuthorizations`
  (`core/lane-progress-state-validation.ts`), and the stored refinement that `nextPass` is `exhaustedPassCount + 1`
  (`ConditionalPassAuthorizationSchema`, `core/operation-state-schema.ts`);
- the grant and extra-pass bindings: `compatibleTerminalGrants` (`review-policy-evidence.ts`),
  `invalidAdditionalPassReason` (`review-additional-pass.ts`), `withCeilingOverride` (`pre-publication-request.ts`),
  `verifyCandidateAdditionalPassPredecessor` (`hosted-reservation-admission.ts`), and a ceiling override's
  `exhaustedPassCount`, which must equal the conditional authorization's (`RespondApprovedRequestSchema`,
  `respond-command.ts`);
- the terminus binding (`isDeliveryReviewMemberDischargedByOwnerTerminus`, `status.ts`) and the hosted owner index's
  `completedPassesAtAdmission` (`hosts/local/hosted-request-owner-index.ts`, read in `handlers/review.ts`).

`exhaustedPassCount` keeps its stored meaning, the producing attempt's `logicalPass`. That stays sound because an
authorization binds the attempt right after its producer, which `requireCaptureProducer` checks by number and not by
coverage, and a ceiling decision arises only when that attempt is a complete pass (§ 5.3).

A comparison against `review.standard_max_passes`, or a decision whether an override is needed, reads the complete
count:

- the driver's `approval-required` and `ceilingOverrideApplied`, whose additional-pass arm also compares the ceiling,
  and `resolveInvalidOverrideReason`'s `ceiling-not-exhausted` (`review-policy-driver.ts`). That function also binds
  an override's attempt numbers from one base, `completedPasses` less a recorded terminal, which it splits: the
  override's `exhaustedPassCount` and `nextPass` still bind that `logicalPass` base, and `ceiling-not-exhausted`
  compares the complete count, less the terminal only when the terminal is a complete pass;
- `missingHistoricalResultObligation` (`status-errand.ts`), which also binds the next pass's number;
- `composeDeliveryReviewObligation` (`status.ts`), which blocks a member when its own ceiling read disagrees with the
  driver's `ceilingOverrideApplied`;
- `candidateContinuationRequest` (`hosted-reservation-admission.ts`), which synthesizes a ceiling override at the
  ceiling and binds its attempt numbers;
- the provisional assessment's `capPosition` (`projectProvisionalPassAssessment`, `respond-command.ts`), the refinements
  that repeat it (`ProvisionalPassAssessmentSchema`, `core/provisional-pass-assessment.ts`), and
  `projectFixConsequence`'s ceiling test, which reads it.

The provisional assessment is emitted on the respond envelope (`review-command-envelope.ts`) and stored nowhere. Its
refinements compute the position from `admittedLogicalPass`, which a fix check now advances without moving the ceiling,
so it gains one field, `ceilingPassCount`: the passes the lane's ceiling counts once the admitted attempt finishes — the
complete count on the standard lane, and `admittedLogicalPass` on the frontline lane, whose counting is unchanged.
`capPosition` compares `ceilingPassCount` with `configuredMaxPasses`. The consequence refinement follows § 5.3:
`ceiling-decision` requires a position at or above the ceiling, `next-pass` with `complete` or `null` coverage requires
one below it, and `next-pass` with `incremental-when-proven` holds at any position, since a fix check sits outside the
ceiling.

#### 5.3 The ceiling decision follows coverage selection

Today, after a complete pass with material fixes, each composition resolves policy before coverage is chosen, so at the
ceiling the driver stops at `approval-required` even when the next step is a fix check, and an override granted there
would be spent by the fix check. (After a pass whose coverage chain is inadequate, the driver returns
`coverage-required` first.) Local prepare's continuation (`runtime/local-prepare-composition.ts`) and the Errand's
`nextErrandPassObligation` do this, and `status.ts`'s singleton and delivery routes return the admission's
`approval-required` before any coverage step (`composeSingletonRequest`; the delivery route's `requestAdmission`). The
ceiling applies only to a complete pass:

- the chosen coverage reaches the driver as an internal input beside the complete count. Local prepare supplies its
  `coverageAdmission`, status's singleton and delivery routes the pick or `--coverage`, and every hosted admission —
  hosted request admission, the hosted reservation admission, and Errand status where it composes a hosted action —
  supplies `complete`, since a hosted pass is complete. Pre-publication supplies none, since it learns of a hosted
  reservation only from the driver's result; its hosted pass meets the ceiling at hosted request admission;
- at the ceiling, while the next-pass context admits an incremental look and no complete coverage is chosen, the driver
  returns `ready`, not `approval-required`: the composition's selection then asks after material fixes (§ 6.4), or
  admits the delta check (§ 3.5). `coverage-required` keeps its one meaning, an inadequate chain;
- once complete coverage is chosen there, the driver returns `approval-required`, and the pass needs the ceiling
  override or an `additional` extra pass, so an override always binds to the complete pass that uses it, and neither a
  fix check nor a delta check spends one. The driver refuses an override beside chosen incremental coverage, as it
  refuses an invalid override today, with its own diagnostic code and a remedy whose command re-runs without it; with no
  coverage chosen, it returns `ready` without applying the override;
- `projectFixConsequence` reports a ceiling decision only when no fix check will be admissible. It runs on the first
  `arc review respond -` call, before any fix exists, when no correction scope can resolve yet
  (`buildIncrementalCorrectionScope` requires a performed response), so it tests predictively: the lane's chain to this
  pass is adequate and `delegated-agent` is selectable on the route (§ 7.2). Respond reads both, with § 6.1's facts, from
  one dependency its composition binds from the next-pass context (`createRespondDependencies`,
  `runtime/respond-composition.ts`), so the provisional assessment's projection stays pure over what it returns.

#### 5.4 No extra-pass decision for a fix check

A fix check cites no extra-pass decision and spends none; the approved, performed response it verifies admits it, which
its `correctionScope` names by that response's result (`predecessorProducerId`). A delta check cites none either; its
range proof admits it, and its `correctionScope` names the converged predecessor's result (§ 3.5).

An approved response at the ceiling can carry a ceiling override with a conditional next-pass authorization
(`conditionalNextPassAuthorization`, `RespondApprovedRequestSchema`, `respond-command.ts`), stored on the producing
attempt (`ConditionalPassAuthorizationSchema`, `core/operation-state-schema.ts`) and named by the override's
`conditionalPassAuthorizationId`. Today `bindConditionalPendingAdmission` (`lane-progress-conditional.ts`) consumes it
at whichever attempt is admitted next at the produced head: it matches the pass number, head, and disposition set, but
not coverage, so a fix check could spend it. It keeps its shape and becomes a complete-pass mechanism:

- it is offered only when `projectFixConsequence` reports a ceiling decision, which § 5.3 limits to a next step that is
  a complete pass;
- the binding refuses an admission whose pending attempt requests anything but `complete` coverage (`requestedCoverage`,
  on the attempt's `local` or `hosted` binding), with a remedy naming the complete pass or the authorization's
  withdrawal (`conditionalNextPassWithdrawal`).

An authorization stays pending until an admission's ceiling override names it, and only the binding and its
withdrawal read it. When a fix check comes first, it names none, so the authorization lapses once the fix check moves
`logicalPass` past the authorization's `nextPass`, and the complete pass that follows takes a ceiling override at the
driver's `approval-required` if it is past the ceiling, so each decision sits beside the head it binds instead of
surviving later fix rounds.

#### 5.5 Presentation

A pass, in anything the Owner reads, is a counted complete pass shown against the ceiling ("complete pass 3 of 2, one
past the ceiling, approved"); a fix check is reported in rounds since the last complete pass ("fix check, round 2 since
pass 3"), each with its result. `logicalPass` stays internal, an attempt number never shown as a pass. Typed fields that
carry the attempt number keep their shape and meaning:

- `pass` in the driver's payloads (`ReviewResolveEnvelopeSchema`, `review-policy-driver.ts`) and in the delivery
  member's local action (`DeliveryLocalReviewSelectionShape`, `delivery-local-review-admission.ts`);
- `admittedLogicalPass` and `configuredMaxPasses` in the provisional assessment, beside its new `ceilingPassCount`
  (§ 5.2);
- `pass`, `completedPasses`, and `consumedPass` on the coverage selection actions
  (`LocalReviewCoverageSelectionActionSchema`, `core/local-review-coverage.ts`; `ReviewCoverageSelectionActionSchema`,
  `review-coverage-selection.ts`);
- `exhaustedPassCount`, `nextPass`, and `completedPasses` on the ceiling override and the additional-pass authorization
  (`review-ceiling-override.ts`, `review-additional-pass.ts`);
- `DeliveryReviewMemberProgressSchema`'s counts (`status.ts`), which already expose `completePasses` beside
  `completedPasses` and `passCeiling`.

Text that renders them, or counts every pass, changes:

- the response summary's "pass N of M" and its next-pass number (`projectProvisionalPassAssessment`,
  `respond-command.ts`) and `fixConsequenceText`'s "needs standard pass N", all computed from `admittedLogicalPass`;
- the Errand status counts — `nextErrandPassObligation`'s "N of M configured standard-review passes" and
  `readErrandRoutedObligation`'s "used N standard-review passes" — and `missingHistoricalResultObligation`'s ceiling
  text (`status-errand.ts`);
- the local selection text's "Either consumes one pass" (`localCoverageInteractionText`,
  `local-review-coverage-selection.ts`);
- the hosted failure diagnostic's "hosted pass N" (`hostedPassHold`, `lane-progress-hosted-request.ts`);
- the admission corrections in `review-policy-remedy.ts` ("Another pass exceeds the configured ceiling"), whose Errand
  hosted-correction invariant goes with § 7.9;
- workflow text: "A completed attempt consumes that pass" (`run-errand`, `integrate-work-unit`); "durable lane progress
  consumes the admitted pass" (`integrate-work-unit`, `deliver-stack`); `prepare-work-unit`'s "An incremental choice
  still spends one logical pass", the workflow twin of the local selection text, and its "inherited completed standard
  passes still count toward the ceiling"; and every step that surfaces a ceiling override's or an additional pass's
  consequence, which renders it as the complete pass it admits;
- method text: `review-triage`'s pass line and its example prompt ("standard pass 2"), with that prompt's copy in
  `strategy-session-operations.md` § Disposition-Approval Release, and `standard-review`'s "counts as one
  standard-review pass";
- the `arc-config.yml` ceiling comment in both copies (§ 13).

### 6. The next-pass offer

A recommendation, never a gate: the Owner decides, and the recommendation is clear either way, at the ceiling included.

#### 6.1 Bounds, facts, and judgment

The emitted offer keeps three layers apart:

- **Bounds — the CLI's, enforced.** The closed set of next steps that exist:
    - after a look whose approved fixes include a material one, a fix check, local (§ 7.1), offered first. A local
      complete pass stays admitted, as `coverageSelectionChoices` (`hosted-reservation-support.ts`) offers both today
      and § 8.1 lets the Owner run one, and the offer says it does not replace the fix check (§ 10.2). Where the fix
      check's chain does not prove, a local complete pass is the only next step;
    - after a converged look where the subject still needs a pass: under `full-final` a complete pass, which the CLI
      admits without a selection (§ 2.3), or the Owner's stop where a surface takes one (§ 8.3); under `incremental`, a
      fix check;
    - after a plain commit that follows a converged look, § 3.5's delta check where it is admissible, with the
      complete pass after it under `full-final`;
    - the ceiling on complete passes and its override (§ 5);
    - the approval each needs.

  Bounds bind the agent, never the Owner (§ 8).
- **Facts — the CLI's, computed, stored nowhere new:**
    - complete passes run, against the ceiling;
    - fix-check rounds since the last complete pass, and their results;
    - the fix range's size against the target;
    - whether the chain is proven;
    - two observable signals of new design, per fix round: a round that changes code outside its findings' cited loci,
      and a round that adds files. No record ties one fix to one finding, and loci are free text, so both signals are
      computed per round, with the loci read as heuristics;
    - the material trend: the lane's looks in order, each labeled a complete pass or a fix check with its result, from
      lane progress (`effectiveCoverage`, a clean outcome included, since a clean look writes no disposition record:
      respond refuses a result without findings, `respond-command.ts`), and each look's verified material count from its
      disposition records (`listDispositionRecords`, `core/ports.ts`) plus the proposed set, marked provisional.

  One derivation computes them, into one typed shape, from lane progress, the lineage's disposition records, the
  next-pass context (§ 4), whose incremental fact is whether the chain is proven, and Git: each fix round's range is
  its performed response's heads (`originatingHeadSha..producedHeadSha`, `LaneResponsePerformanceSchema`,
  `core/operation-state-schema.ts`), tied to its disposition set by `dispositionSetId`, and a locus's leading path
  token is read as the file it cites. Three surfaces carry them: the offer's text (§ 6.3), the report (§ 10.4), and the
  lane read (§ 9.4).
- **Judgment — the agent's, labeled advisory.** It applies once the fix checks have converged, and chooses what follows
  them: recommend another complete pass while complete passes still find new defect classes in code earlier passes read,
  or when a fix round was new design rather than local correction; otherwise recommend stopping. It never weighs a
  complete pass against the fix check itself (§ 10.2), and it weighs a complete pass from a different source over
  another run of the same one. The agent states its pick, its reasoning, and what would change it.

The CLI computes no verdict: the inputs are judgment, no validated stopping rule exists, and a computed recommendation
is what a literal-reading model carries out as a rule.

#### 6.2 Where the Owner hears it, and when the agent stops

The ceiling (§ 5) is the one spend lever: complete passes under it run on disposition approvals alone, the complete pass
after converged fix checks included, since the driver asks for no authorization below the ceiling: its
`approval-required` fires only there (`review-policy-driver.ts`). A stop before each would void the ceiling for the
passes it exists to authorize, so the recommendation rides the stops that already exist. Every fix check follows an
approved response, and a converged fix check with minor findings ends at their disposition approval, so the report
(§ 10.3) states the next pass and the recommendation where the Owner already decides; an Owner who answers "stop" there
needs nothing more wherever a surface takes the stop and the acceptance holds. The published singleton after publication
and `deliver-stack`'s member review take none, and pre-publication drops one once the approved fixes advance the
Candidate, requiring fresh direction (`consumeOwnerAcceptedTerminus`, `pre-publication-request.ts`;
`prepare-work-unit`), so there the Owner gives the stop again at the fixed head (§ 8.3).

The agent adds a stop in one direction only: when its judgment recommends stopping, it asks before the pass spends,
since stopping short of `full-final`'s rule is the Owner's call (§ 8). That stop arises only after a clean fix check,
which has no disposition approval, and it can only lower spend below what the ceiling authorizes, never raise it.

No envelope carries § 6.1's facts there: a clean result gets no respond report, the driver's `ready` payload carries
none, and the resolve envelope keeps its shape (§ 6.5). The agent reads them from the lane read (§ 9.4). No typed state
marks a next pass as following a clean fix check either, so the arm keys on the read's typed result rather than on
memory, as § 2.4 has arms follow typed state: `run-errand`, `prepare-work-unit`, `integrate-work-unit`, and
`deliver-stack` each gain an arm at every next-pass step of a `full-final` standard lane — the driver's `ready`;
pre-publication's hosted-first reservation; or status's request where status composes the next pass (the delivery path
and the published singleton). At the reservation, the driver's `awaiting-change-request` reserves the complete pass for
a hosted source, and pre-publication counts that state as settled, so its envelope shows it not as a `policy` state but
as a non-null `reservation` at `candidate-convergence-verification-pending` or `candidate-publish-ready`, before
`run-convergence-verification` or `publish-candidate` (`projectPrePublicationReview`, `pre-publication-procedure.ts`); a
step `integrate-work-unit`'s `continue-pre-publication-review` also reaches. The arm keys on that `reservation`, and
`prepare-work-unit`'s `awaiting-change-request / open-change-request` row, which sits under the policy dispatch a null
`policy` never reaches, moves there. The arm runs the lane read, and acts only when the read's
last look is a clean fix check: it applies the judgment, and when the judgment recommends stopping, the agent stops and
offers the Owner's stop (§ 8.2) before the pass is dispatched. At the reservation step that is before publication: the
stop rides `lanes.standard.terminus: { mode: "owner-accepted" }`, which the driver reads before it reserves a hosted
source (`review-policy-driver.ts`) and the boundary carries through publication, while the published singleton takes no
new one (§ 8.3). At the ceiling the agent stops and recommends from the same read, as `adversarial-review`'s cap
recommendation does. In `deliver-stack`'s member review and on the published singleton the stop does not arise (§ 8.3):
there the arm states the recommendation and the limit, and the complete pass runs.

#### 6.3 The text

The emitted text states the allowed steps once, in plain words, before the considerations; gives each consideration its
reason and the condition under which it favors an option; and ends by asking for the recommendation. The considerations
are § 6.1's facts, one each with its value; the new-design signals and the trend weigh the pass after the fix checks
converge, never one in place of the fix check (§ 10.2). `localCoverageInteractionText`
(`local-review-coverage-selection.ts`) already has the bounds-plus-considerations shape inside local prepare, which an
Errand's local pass reaches too (`runtime/local-prepare-composition.ts`). The work-unit path's selection prompt
(`hosted-reservation-discharge.ts`) has no considerations, so the text is new there. It replaces that prompt, which
today names a `--json` flag that `review status` rejects (`cli.ts`) and always names `--work-unit`, whatever route
reached status. The discharge has no route, so it emits the text with no command, and status's route composition appends
the argv that re-runs status by the route that reached it, as its refusal's remedy does (§ 7.3).

#### 6.4 One question per moment, each asked once

The coverage question arises at three moments, and none needs a new surface:

- **After material fixes,** at the fixed head, the next pass is local (§ 7.1) and takes a fix check or a complete pass.
    - Off the delivery path, local prepare asks, as it does today (`resolveLocalReviewCoverageSelection`,
      `local-review-coverage-selection.ts`). It fires on the driver's `ready` once an earlier terminal pass sits at
      another head, it already holds the Errand's and the Candidate's lineage, and the pick it takes is the
      `coverageAdmission` it already stores. An Errand before and after its pull request, pre-publication, and the
      published singleton (§ 7.5) all reach it.
    - On the delivery path, status asks once, and the pick rides `deliveryAdmission` into local prepare, which then does
      not ask again (`resolveSettlementPolicyAdmission`, `runtime/local-prepare.ts`). Today the discharge builds that
      selection (`ReviewCoverageSelectionActionSchema`, `hosted-reservation-discharge.ts`) only at the driver's
      `coverage-required`; after a complete pass with material fixes it returns the next source and the correction scope
      with no selection, and status defaults to complete (`status.ts`), so nothing asks. The discharge therefore emits
      the selection whenever a correction scope resolves after material fixes, and the complete default stands
      otherwise. § 7.2 narrows the offer to `delegated-agent`.
- **After a converged look** under `full-final`, the next pass is complete (§ 2.3), and nothing asks: the CLI admits it
  with the source § 7.1's rank picks. Local prepare's selection and the discharge's admit complete without emitting a
  selection when the next-pass context reads the predecessor as converged. Local prepare's one-choice stop
  (`localCoverageInteractionText`) then arises only where a fix check's chain fails, and its text there tells the agent
  to check why, so it stays.
- **After a plain commit** that follows a converged look, nothing asks either: where § 3.5 admits a delta check, local
  prepare and status admit it without a selection.

#### 6.5 The workflow arms

No workflow names `coverage-required`, `select-coverage`, or `run-review` today. `run-errand`, `prepare-work-unit`, and
`integrate-work-unit`'s singleton route gain an arm for local prepare's selection, and `deliver-stack` and
`integrate-work-unit`'s delivery route one for status's. Each shows the choices with § 6.3's text and the
recommendation, takes the Owner's pick, and re-runs with it. A selection admits only a listed choice
(`resolveLocalReviewCoverageSelection`, `selectReviewCoverageChoice`); where status today re-emits the selection
silently because `--source` and `--coverage` match no choice (`status-composition.ts`), it refuses instead, naming the
listed choices; a lone `--coverage` that matches exactly one listed choice selects it. The resolve envelope keeps its
shape, and nothing new is stored.

This carries adversarial review's re-inspection test to code lanes, and gives code review the cap recommendation
`adversarial-review` already states.

### 7. Source selection and hosted review

Hosted review follows § 2 through the shared derivation. What changes is which passes a hosted source runs.

#### 7.1 After an unconverged pass, the next pass is local

When a pass's approved fixes include a material one, the next pass runs on `delegated-agent`, whichever coverage it
takes: § 6.1 offers a fix check first where its chain is proven, and a local complete pass is the only option where it
is not. The chain fails when ARC cannot prove what changed since the reviewed head or that the earlier review still
applies (`resolveOfferedCorrectionScope` and `resolveIncrementalCorrectionScope`): the routed obligation changed, the
lane subject changed, the fixes have no recorded approved response, or the range holds more than fixes, as after any
base merge or history rewrite since the reviewed head (§ 7.8). A fix check over an unproven range could miss changes.

A hosted source runs a complete pass only as a lane's first pass or after a pass that converged — under § 2.3, the
complete pass after a converged look, at the settled head. A plain commit after a converged look whose delta check the
next-pass context admits takes that look on `delegated-agent` too, since an incremental look is local-only, and the
limit has no exception, for the reason § 3.5 gives. Every other selection keeps the configured rank order.

#### 7.2 Where the rule applies

The driver cannot derive the rule on its own. It reads the terminal signal only to classify the terminal attempt, and
every composition that picks the next pass's source re-resolves without that signal, the continuation's fresh resolve
(`resolveEvidenceBoundReviewPolicyContinuation`, `review-policy-evidence.ts`) among them. These are § 4's compositions,
`arc review resolve -` included, and the next-pass context hands the driver the predecessor's convergence at each. The
driver's source selection then restricts to `delegated-agent` after an unconverged pass and when the next-pass context
admits a delta check (§ 3.5), and otherwise takes the configured rank. The restriction applies before the hosted-first
reservation, which searches only the sources selection draws from (`reservedHostedSource`, `review-policy-driver.ts`),
so a restricted selection reserves no hosted source before a pull request.

`sources` stays the configured list. The continuation validates the terminal attempt against that same list
(`bindReviewPolicyEvidence`; `validateConfiguredAttempts`, `review-policy-driver.ts`), so narrowing it would reject a
hosted terminal attempt with findings — the case the rule exists for. Two other paths pick the next source, and the same
fact reaches both:

- **a forced source** (`invocation.mode === "force"`), which today needs no convergence check, only to be configured and
  not to precede recorded source progress (`ReviewPolicyRequestSchema`, `review-policy-driver.ts`): after an unconverged
  pass the driver refuses a forced hosted source, with a remedy naming the local pass, since the Owner waives
  re-examination by stopping, where a surface takes the stop, not by choosing another source (§ 8.1, § 8.3). Where a
  delta check is admissible the driver likewise refuses a forced source other than `delegated-agent`, with a remedy
  naming the delta check: the delta check is the next pass, honoring another source there would need a stored choice,
  and a hosted complete pass follows it where § 3.5's fixed order reaches one (§ 3.5). Each refusal is the existing
  `unavailable / stop`, with a diagnostic code of its own, so the resolve envelope keeps its shape, and the remedy is
  attached where each surface reports it;
- **the work-unit coverage offer,** which `coverageSelectionChoices` builds from the discharge's configured
  `reservation.sources` (`hosted-reservation-discharge.ts`): after an unconverged pass the discharge passes it
  `delegated-agent` alone, so the offer never lists a choice the driver would refuse. Where the discharge requests a
  delta check it emits no offer (§ 6.4); the choice of a complete pass instead is made in local prepare's request, and
  status refuses a `--coverage` it cannot carry there (§ 3.5). Status's `--source` naming a hosted source
  (`resolveSingletonRequest`, `status-singleton.ts`) meets the refusal above.

The Errand path's own ordering gives way to the driver's restriction. Today `nextErrandPassObligation`
(`status-errand.ts`) puts the source that reviewed the earlier head first while that source stays configured, and
`errandNextPassCoverage` (`respond-command.ts`) predicts the next pass's coverage from that source; the same-head
resolve passes a terminal-first list even when that source is no longer configured (`resolveErrandLaneAtHead`,
`status-errand.ts`). The continuation uses one list for two jobs — binding the terminal (`bindReviewPolicyEvidence`) and
choosing the fresh resolve's source (`resolveEvidenceBoundReviewPolicyContinuation`) — so it takes them as two inputs:

- **the binding list** stays terminal-first on the Errand, so a terminal from a source no longer configured still binds
  (`validateConfiguredAttempts`);
- **the selection list** is the configured list — on hosted request admission's Errand branch, the requested provider's
  suffix of it (`configuredSourceSuffix`), as today — which the restriction narrows. After a converged pass the fresh
  resolve therefore takes the configured order, and a hosted source can run the complete pass, except where a delta
  check is admissible (§ 3.5).

At a head that already holds a review, Errand status composes the hosted action for the driver's `ready` as it does at
a new head (`readErrandRoutedObligation`, `errandHostedRequestObligation`), so the complete pass after a converged look
at the same head reaches a hosted source by rank; today, for a `ready` there, it returns `review-required` with no
action.

#### 7.3 Without `delegated-agent` configured

`review.standard_sources` stays the project's policy on which reviewers count, and where it lists any, ARC runs no
source the project left out; an empty list already makes local prepare fall back to `delegated-agent`
(`runtime/local-prepare-composition.ts`). A project that lists sources but omits `delegated-agent` cannot run the pass
that follows an unconverged one, so both paths in § 7.2 end at a stop with its remedies named, rather than at an offer
or a remedy naming a local pass that cannot run; an empty offer would also fail its schema
(`ReviewCoverageSelectionActionSchema`'s `choices`, `review-coverage-selection.ts`). The remedies:

- add `delegated-agent` to the list;
- or take the Owner's stop (§ 8.1), disclosed as resting on fixes no reviewer re-examined.

No command adds a source, so the remedy's text names both and its command re-runs the call. Status carries the stop
as a refusal holding the driver's diagnostic code and that one remedy, which re-runs status; where the surface takes no
stop, its text names only the first.

On the published singleton after publication and in `deliver-stack`'s member review only the first remedy applies,
since neither takes a terminus (§ 8.3). Without `delegated-agent` no delta check is admissible either (§ 3.5), so a
plain commit after a converged look meets today's behavior: the complete pass on an Errand and in pre-publication, and
the review-applicability stop on the published singleton and a delivery member.

#### 7.4 A fix proves its range by the response that made it

Before a pull request exists, local prepare and pre-publication prove an Errand's or a private Candidate's leg by the
approved response that produced the head (`confirmErrandFixResponseApplicability` and
`confirmPrivateCandidateCorrectionBasis`, `local-review-coverage-selection.ts`), and the `arc review resolve -` handler
(`handlers/review.ts`) does so for an Errand. Two do not: the handler sends a private Candidate's leg to contribution
applicability (`confirmNonDeliveryIncrementalApplicability`), which is unavailable without a pull request, and respond
(`respond-composition.ts`) sends it to `confirmNoPullRequestCandidatePriorProducer` (`pre-publication-composition.ts`),
which refuses once the reviewed target has changed, as a fix changes it. Once a pull request exists, four callers prove
a leg by contribution applicability alone: local prepare's confirmation (`createLocalContributionConfirmation`,
`runtime/local-prepare-composition.ts`), the handler's, respond's, and pre-publication's once a change request is open.
The singleton's discharge does the same through `projectEarlierReviewApplicability` (`earlier-review-applicability.ts`),
whose fix-response test is delivery-only (`verifiedDeliveryMemberFixResponse`). A fix commit changes reviewed code, so
that proof returns `review-required` or `unavailable`, and no fix check after a hosted pass at an open pull request
could prove. Under `incremental` that would be a regression: today the Errand's hosted correction proves the leg
(`confirmErrandCorrectionPredecessor`, `status-errand.ts`).

Every one of these confirmations therefore proves a leg that holds a fix by the performed-response test, through the
chain proof § 4 shares, before a pull request and after, so respond's predictive consequence (§ 5.3) and the next pass's
admission read the same chain: at an unchanged diff base, the predecessor's approved response was performed from its
head and produced the current head (`readLaneResponsePerformance`, `lane-progress.ts`). Where a confirmation also
serves a carry (`confirmPriorProducerApplicability`, `pre-publication-composition.ts`), the chain proof enters through
its chain role alone. `confirmErrandCorrectionPredecessor` already composes that test for the Errand's status — the
diff base through `sharesCorrectionBase`, the response through `fixProducedHead` — so it outlives the hosted correction
§ 7.9 deletes. Hosted request admission's Errand branch (`handlers/review.ts`), Errand status's resolve at a new head,
and pre-publication's current leg have no confirmation today and take the chain proof alone.

On a Candidate a record commit follows the fix: `persistCandidateResponse` (`respond-command.ts`) records the fix commit
as the produced head and stages the Candidate record, which `prepare-work-unit` commits next. There the test also
accepts a later head whose Candidate subject digest equals the fix head's. The digest leaves out the record and boundary
(`candidateProjectionPaths`), the work unit's own planning artifacts, and the project documents `classifyPathTreatment`
marks non-reviewable (`lib/evidence-applicability/path-treatment.ts`), so any commit that touches only those carries no
reviewable change and passes. The pre-publication path proves a correction the same way, for a historical leg too
(`confirmPrivateCandidateCorrectionBasis`); `confirmCandidateResponseHeadContinuation`
(`candidate-response-head-continuation.ts`) proves one record-only commit only while it is the checked-out head, so it
does not serve. Each leg is tested against the head that follows it, since the coverage chain re-confirms every earlier
leg on each round (`resolveCoverageChain`, `incremental-coverage-basis.ts`). A leg that holds a fix and fails the test
breaks the chain (§ 7.8). A leg after a converged look whose head no response produced proves instead by § 3.5's range
proof, the chain proof's `range-proven` result, which only the resolution of a correction scope and a chain's
re-confirmation accept; a consumer that carries an earlier review to the current head never accepts it.

#### 7.5 The published singleton's local pass

Today the driver's `ready / local-prepare` for a published singleton becomes a bare `review-required`
(`composeSingletonRequest`, `status.ts`) whose `run-review` next action no workflow dispatches. The local action
(`localAction`, `DeliveryLocalReviewSelectionSchema`) is delivery-only, and local prepare stores it once admitted
(`deliveryAdmission`, `core/operation-state-schema.ts`). § 7.1 makes a local pass mandatory after every unconverged
hosted pass, so the singleton route instead names an ordinary `arc review local prepare -` request with no member
selector, which reviews the work-unit branch (`LocalPrepareRequestSchema`, `runtime/local-prepare.ts`), and
`integrate-work-unit` gains an arm for it in place of `run-review`. The status projection that names it is stored
nowhere; it names the request's target, the lineage boundary, and the reservation's obligation, and the agent supplies
`evaluatorIdentity`, as on delivery. Local prepare resolves the Candidate lineage from the submission boundary
(`resolveLineage`, `runtime/local-prepare-composition.ts`), the lineage under which the singleton's discharge reads lane
progress (`hosted-reservation-discharge.ts`), so the local pass continues the singleton's lane, and it asks the coverage
question itself (§ 6.4). With no `deliveryAdmission`, local prepare routes the obligation from the caller's routing
facts, while the discharge binds terminals to the reservation's (`resolveTerminalPolicy`), so where a hosted reservation
binds the submission boundary local prepare takes the obligation from it, as `validateDeliveryAdmission` binds it for
delivery, and refuses routing facts that route elsewhere.

Three readers change, each of which today takes a local result only with a `deliveryAdmission`:

- the discharge's recognition of an admitted local terminal (`admittedLocalTerminal`);
- its naming of a local predecessor's source (`confirmIncrementalPredecessorApplicability`,
  `hosted-reservation-support.ts`);
- the earlier-attempt query under the discharge's applicability reads (`queryEarlierReviewAttempts`,
  `earlier-review-attempts.ts`), which also requires a delivery-member vehicle and target, so a singleton's local
  attempt at an earlier head is never found.

On a subject with no vehicle, all three accept a local result in the same lineage without one, as `delegated-agent`. The
query counts the lineage's local passes from before the pull request too, as lane progress already reads across the
lineage (`readLaneProgressAcrossLineage`), and takes the pull request from its own selector, since a local attempt
carries none. The discharge reads terminals per reserved source (`reservation.sources`), so the route names local
prepare only when the driver selects `delegated-agent` from the reservation's sources, and § 7.3's stop covers the rest;
a local pass run outside that route is one the discharge never reads.

The singleton route also handles the driver's `coverage-required`, which today reaches it with no next source and falls
to the same bare `review-required` (`status.ts`). It is reached only after an unconverged look, since after a converged
one the composition has already re-resolved to the complete pass (§ 2.3), and it routes to ordinary local prepare, which
asks the coverage question (§ 6.4). The discharge resolves terminal policy only over a `clean` or `settled-findings`
terminal, after routing unsettled findings to their response (`hosted-reservation-discharge.ts`), so no response is
pending when this arm is reached, whatever `responseRequired` says (§ 2.2).

#### 7.6 A delivery member's local pass keeps its source

Local prepare re-checks a delivery admission by re-running status with the admission's coverage but not its source
(`validateDeliveryAdmission`, `runtime/local-prepare-composition.ts`), and the status port reads the source only from
the request, never the `sourceId` it is built with (`createReviewStatusPort`, `status-composition.ts`). A selection
matches only on both (`selectReviewCoverageChoice`), so a pick made with `--source delegated-agent` comes back as
`coverage-required`, and local prepare refuses with "no longer has exact driver admission"; a forced local source loses
its force the same way. The integration test replaces that re-check with one that passes the source
(`review-fan-out-lifecycle.test.ts`), and the suite that runs the real one (`delivery-position-suite.ts`) admits no
selected source, so no test drives a source-bearing admission through the real re-check. § 7.1 sends every delivery pass
after an unconverged one down this route, so the re-check passes the admission's source, and a test runs the real
re-check.

#### 7.7 A base merge that overlaps reviewed code

When the target moves by a base merge or a rewrite, the applicability check (`lib/evidence-applicability/reducer.ts`)
already does what review hosts do:

- it carries the review when the movement is disjoint from reviewed files or merges cleanly (`base-movement-disjoint`,
  `base-movement-clean-merge`, read with `git merge-tree`, `lib/git/merge-tree.ts`), and leaves what the combined code
  does to verification;
- it asks for judgment only over a bounded residual of overlapping files (`bounded-overlap` for a base movement,
  `bounded-clean-divergence` for a rewritten contribution), where `assess-evidence-applicability` recommends
  `supplemental` or `fresh`.

On the work-unit path a bounded residual already stops for the Owner, at two points, each of which judges the
contribution as rewritten (`member-rewrite`, so its judgment reason is `bounded-clean-divergence`):

- during review, status returns `resolve-review-applicability`, whose choices are `covered`, which keeps the earlier
  review, and `review-required`, a complete pass (`ReviewApplicabilitySelectionOfferSchema`,
  `review-applicability-resolution.ts`);
- at the final reconcile, the Candidate checkpoint offers `covered`; `targeted-check`, which records a completed bounded
  check's evidence (`targetedEvidenceRef`, `candidate-applicability-resolution.ts`); and `changed`, which establishes a
  new Candidate root.

Between `covered` with no look and a complete pass over the whole change, nothing reads the resolution itself, and
`supplemental` names a pass that cannot run: no correction scope exists for a movement that is not an approved fix, so
the `--coverage incremental` arms run nothing. The delivery arms, in `deliver-stack` and `integrate-work-unit`'s
delivery route, end at `coverage-unsupported` (`status.ts`); `integrate-work-unit`'s singleton arm ends at
`status-unavailable` on a hosted source and, on a local one, at a bare `review-required` that drops the coverage
(`composeSingletonRequest`).

**The bounded check.** At either stop, before the Owner chooses, the agent has a fresh-context local evaluator run one
check over what the movement changed in the reviewed change:

- a merge's conflict resolution against Git's automatic merge, as `git log --remerge-diff` shows it, or a rewrite's
  interdiff, as `git range-diff` shows it;
- the residual's files;
- dependencies across the two sides — a rename or removal on one side that the other still uses.

It carries that context explicitly, since the reviewer remembers nothing of the earlier pass, and its findings are shown
beside `assess-evidence-applicability`'s `supplemental | fresh` recommendation, whose return contract stays as it is.
It runs only at these two review stops, not at `run-errand`'s merge step or on a verification residual, which the method
also serves. `supplemental` recommends `covered`, or `targeted-check` at the reconcile; `fresh` recommends
`review-required`, or `changed` at the reconcile. Its instructions join that method, which
fires at both stops: `deliver-stack`'s member-rewrite stop fires it today, and `integrate-work-unit`'s pre-reconcile
route, which says it does not, gains the fire-point. The check is not a pass: it takes no lane attempt, counts against
no ceiling, and stores nothing the stop does not already record. It does not run where the applicability check stops
with `residual-unbounded` above the residual's bound — 200 paths or 16 KiB of path text — rather than offering a choice
(`classifyReviewContributionApplicability`, `review-contribution-applicability.ts`; the Candidate checkpoint's own,
`candidate-applicability.ts`), nor at a stop § 7.8 settles.

**The choice.** The Owner's `covered`, or `targeted-check` at the reconcile with the check as its evidence, carries the
earlier review; `review-required`, or `changed` at the reconcile, sends the lane to a complete pass. When the check
finds a material defect, or prompts any fix, the agent recommends `review-required` (`changed` at the reconcile). At
every stop, with a delivery bound or not, the check's findings go to the Owner as a complete disposition set
(`DEV-RULES.ARC` § Review finding mutation guard). The `--coverage incremental` arms go.

**A fix outside a bound delivery** lands before the Owner chooses. It is committed after `arc check gate commit` as an
ordinary change, since the check leaves no review result for `arc review respond -` to bind. The Owner then chooses
once, at the stop raised over the fixed head; the check does not run again there. The complete pass that follows reads
the fix, so no fix check's range crosses the merge. `covered`, or `targeted-check` at the reconcile, stays the Owner's
to choose there (§ 8.1), disclosed as resting on a fix no pass has read: the check that is `targeted-check`'s evidence
read the movement, not the fix.

**A fix under a bound delivery.** The Owner chooses first, with the recommendation above, and that choice governs only
until the fix lands; a `covered` choice there, or `targeted-check` at the reconcile, is disclosed as holding only until
then. Whatever the choice, while an approved fix from the check is unlanded, the agent requests no pass for that member,
which `review-required`'s `request-review` would otherwise do, and takes it to no landing preparation, which
`member-discharged / continue-reconcile` or `settled / continue-reconcile` would otherwise permit (`deliver-stack`). The
approved fix takes the delivery's own correction route: a correction task in the owning member's section, covered by a
plan revision before it runs (`amend-design` § Under a bound delivery plan), through
`arc delivery review-fix continue -`, which `deliver-stack` requires before any approved correction is authored while a
delivery is bound. The task is authored only when the continuation holds no other correction — none derived from an
unsettled approved review response (`deliver-stack`) or a pending verification (`inspectDeliveryEntry`'s
`review-fix-verification-required` arm, `lib/delivery/entry-inspection.ts`); the continuation is the authority on that
state. A plan revision is the delivery plan's existing record, so the route adds no record shape. The fix lands before
the complete pass, which reads it.

Status then asks again over the fixed head. A stored applicability selection binds its projection and residual
(`projectionDigest`, `residualDigest`, `review-applicability-resolution.ts`), the projection includes the current head,
and an earlier selection is found by that head (`earlier-review-applicability.ts`), so the correction's commit raises a
fresh stop over a residual that includes the fix. The check does not run again there. The Owner chooses with the check's
findings and the fix in view, and `covered`, or `targeted-check` at the reconcile, is disclosed there as resting on a
fix no pass has read. Letting the first choice govern past the fix would need a stored link from it to the fix, which
this change does not add, so a bound stop where the check prompts a fix asks the Owner twice.

**What stays.** The Owner decides each overlapping merge, at a stop that exists today. During review the stored
selection reads `covered` without naming the check, since a `targeted-check` choice there would change a stored shape. A
counted merge check that needs no stop would likewise have to mark its scope in a stored record, since without that mark
every reader would have to recognize one by recomputing applicability leg by leg. Neither is added. A plain commit at an
unchanged base needs neither: § 3.5's delta check proves its linear range from Git.

#### 7.8 A base move during fix rounds

A base move in the middle of fix rounds, after a fix no pass has checked, breaks the fix check's chain whatever
applicability or the Owner's choice says about the move, so the next pass is a local complete one. A fix check's range
holds only fixes (§ 3.3): were a carried or `covered` move to extend the chain, the fix check would read from the
predecessor's head to the moved head, the whole base movement included (`buildIncrementalCorrectionScope` sets
`predecessorHeadSha` to the predecessor's head, `incremental-coverage-basis.ts`). The refusal sits where a correction
scope resolves, in the confirmations `resolveIncrementalCorrectionScope` takes, not in the shared applicability reads,
which also carry a converged terminal across a base move. On delivery it replaces today's carry from a fix's produced
head, which `verifiedDeliveryMemberFixResponse` re-anchors (`earlier-review-applicability.ts`), so a member restacked in
the middle of its fix rounds also takes a complete pass; members are reviewed in stack order, so that is rare. At such a
stop the bounded check does not run, since a complete pass follows whatever the choice.

Neither `integrate-work-unit` nor `run-errand` merges base during review: each gives base mutation to its terminal
planner alone, after review settles (`integrate-work-unit`'s review iteration, `run-errand`'s Step 4). A mid-round move
therefore comes only from outside the workflow — an Owner or host branch update, or a delivery restack — and the Owner
avoids its complete pass by not updating the branch from base during fix rounds.

An Errand takes a complete pass after an overlapping base move. Before its pull request, its chain needs an unchanged
diff base (`exactErrandResponseContext`, `local-review-coverage-selection.ts`). After it, a leg that holds a fix proves
only by the performed-response test (§ 7.4), so a base move after an unchecked fix takes a complete pass. On a leg with
no fix, contribution applicability carries a disjoint move and returns `review-required` on an overlap, since an Errand
has no applicability selection (`confirmNonDeliveryIncrementalApplicability`); a plain commit at an unchanged base is
§ 3.5's case instead. Its applicability judgment exists only at merge (`errand-merge-composition.ts`, `run-errand`'s
merge step), and an Errand's target is small, so `run-errand`'s supplemental arm asks for the complete pass the review
status offers.

#### 7.9 Hosted incremental review leaves the gate

With no incremental pass on a hosted source, ARC never requests hosted incremental review, and its writers are removed
rather than left dormant:

- the correction-review capability (`hostedProviderAdmitsCoverage` and `hostedProviderReviewsIncrementally`,
  `hosted/correction-review-capability.ts`, and `correctionReview` in both registrations);
- CodeRabbit's incremental request and its range-evidence writer (`nativeIncrementalCoverageEvidence`,
  `hosted/coderabbit.ts`), and Codex's `commands.incremental`;
- the Errand path's hosted correction (`resolveErrandHostedCorrection` and `assertErrandHostedCorrectionRequest`,
  `status-errand.ts`; `HostedErrandCorrectionError` and its remedy, `review-policy-remedy.ts`);
- the hosted incremental choice of `coverageSelectionChoices` (`hosted-reservation-support.ts`), whose hosted complete
  choice stays for the pass after a converged one, and the hosted arm of `errandNextPassCoverage`
  (`respond-command.ts`).

Two symbols lose only their hosted incremental arm, because the local path runs through them:
`coverageSelectionChoices`, whose `delegated-agent` arm, over the scope the discharge resolves from
`currentCorrectionScopeCandidate`, is the work-unit path's only local fix-check offer and builds the selection § 6.4 now
emits after material fixes; and `errandNextPassCoverage`, whose `attested-local` arm feeds `projectFixConsequence`.
`currentCorrectionScopeCandidate` has no coverage arm and stays whole: it reads a local or hosted predecessor's target,
which a local fix check after a hosted complete pass needs (§ 7.10).

Hosted admission refuses incremental coverage outright where the capability check stood
(`assertHostedCoverageAdmission`, `hosted-reservation-admission.ts`). It has to: the request schema
(`hosted/request.ts`) and the stored hosted records (`requestedCoverage`, `core/operation-state-schema.ts`) keep parsing
incremental, and a hand-composed request would otherwise run. The two `status.ts` routes that compose a hosted action
through the capability check, the singleton route and the delivery route, refuse an incremental request on a hosted
source the same way, with a remedy naming the local fix check.

The read side stays. CodeRabbit's observer keeps recognizing `@coderabbitai review` and its reply as a request
generation (`requestCommandCoverage`, `earlierRequestGenerationsSettled`, `nextRequestBoundary`,
`commandReplyCompleted`). The stored-record readers stay too (`lane-attempt-validation.ts`,
`hosts/local/review-result-reader.ts`, `recordHostedAwaitAttempt`), with `HostedCoverageEvidenceSchema`
(`hosted/await.ts`) parseable, because a stored operation record may already hold one. CodeRabbit's
`COMMANDS.incremental` stays for those reads; only `request()`'s incremental arm goes. A terminal CodeRabbit incremental
result requires that evidence (`validateHostedTerminalCoverage`, `hosted/await.ts`), which only the deleted writer
produced, so an incremental request already in flight ends as a terminal failure with a remedy naming the complete pass
or the local fix check. A hand-typed `@coderabbitai review` therefore stays what it is today: a competing request
generation that ARC recognizes, that can fail ARC's own request with `provider-request-generation-overlap`, and that
never counts as a pass. CodeRabbit's automatic incremental reviews no longer move its baseline off an ARC predecessor
head (`provider-incremental-range-mismatch`); an automatic review at a requested head can still be absorbed into ARC's
complete pass by the observer's filter, and this repository pins them off (`.coderabbit.yaml`). Help text that calls
coverage hosted changes with it (`cli.ts`'s "Requested hosted coverage"); the type names that say hosted
(`HostedReviewCoverage`) stay with the stored schema.

Workflow text that lets a hosted pass be incremental changes too. `run-errand`'s hosted arm says a request after an
approved fix "carries `coverage: incremental` over only the fix range when that provider can"; after § 7.1 a hosted
source runs only a lane's first pass or the pass after a converged one, and that pass is complete. `integrate-work-unit`
says "only the explicit supplemental route below returns incremental coverage"; § 7.7 removes that route, and the local
fix check is now offered by status's selection on the delivery route and by local prepare's own question on the
singleton route (§ 6.4, § 7.5).

#### 7.10 Why fix checks are local, and hosted requests stay bare

A fix check is defined by what it carries (§ 3.1), and only the local reviewer takes ARC's instructions. CodeRabbit's
request must be the exact command (`requestCommandCoverage`, `hosted/coderabbit.ts`), and text after `@codex review`
only narrows what Codex reports. A hosted fix check would be the provider's own incremental review, which ARC can
neither shape nor verify. Alternating a local fix check with a hosted complete pass also puts a different source on
each, which the prior art favors over repeat runs of one.

Neither hosted provider re-examines its own findings. Probed on a throwaway pull request
(`notes-review-coverage-cadence.md` § Codex probe and § CodeRabbit probe), each reviewed the whole pull request but
reported only defects it had not already posted there, and each remembered only its own:

- **Codex** never re-reported an earlier finding across five runs — not on an unchanged head, not after an incomplete
  fix whether its thread was resolved or open, and not when asked by name to check the fix. ARC records its result as
  complete (`request()`, `hosted/codex.ts`) and reads "Didn't find any major issues" with the reviewed-commit marker at
  the head as clean (`cleanForHead`).
- **CodeRabbit's** incremental review read two incomplete fixes and posted nothing, and its full review then re-reported
  none of its six earlier findings, all still in the code, while its summary comment said the defects remained. ARC's
  clean reading never sees that: it takes the summary's "No actionable comments were generated in the recent review"
  line (`summaryReportsNoFindings`, `hosted/coderabbit.ts`) with the `CodeRabbit` commit status, the command reply, and,
  for a complete request, the reviewed-head range (`summaryCompletesHead`); an `approved` review with no findings reads
  as clean on its own.

So a hosted source runs again only after the fixes have passed a local fix check, and then it looks only for defects no
pass has reported. Requests stay bare, with no focus hint and no pointers (§ 9.3). On the same probes Codex read both
`## Review guidelines` and `## Code Review Rules` in `AGENTS.md`, and CodeRabbit read `AGENTS.md` too, so the checked-in
heading needs no change.

### 8. The Owner's decisions

#### 8.1 What the Owner may do

Bounds constrain the agent, never the Owner. A bound that says which source runs a pass — the pass that re-examines a
fix, or the delta check while one is admissible (§ 3.5, § 7) — is not one the Owner overrides by choosing another
source: the Owner can waive re-examination by stopping where a surface takes the stop (§ 8.3), and take a complete pass
in place of a delta check in § 3.5's fixed order, but ARC never records a pass that cannot re-examine as one that did.
At any point the Owner may:

- run a fix check after material fixes wherever its chain is proven, whatever the recommendation — today `full-final`
  refuses one on local non-delivery prepare and the Errand path (`resolveOfferedCorrectionScope`,
  `resolveErrandHostedCorrection`, `errandNextPassCoverage`). Under `full-final`, after a converged look the next pass
  is complete (§ 2.3);
- run a complete pass — while a delta check is admissible, a local one at once and a hosted one where § 3.5's fixed
  order reaches it;
- run past the ceiling, by the ceiling override or an `additional` extra pass;
- stop with an Owner-accepted terminus — the expected end of a long `sensitive` review when § 6.1's judgment recommends
  stopping — wherever a surface takes one (§ 8.2), which excludes the published singleton after publication and
  `deliver-stack`'s member review (§ 8.3).

#### 8.2 The stop is reachable at `coverage-required`

After a clean converged fix check the driver reports `coverage-required`, which the composition then resolves to the
complete pass (§ 2.2). Today the driver returns that state before it reads a supplied terminus
(`review-policy-driver.ts`), so the stop § 2.3 and § 6.2 offer cannot be taken there. The driver honors a supplied
terminus at `coverage-required` once any response the terminal pass requires is performed, before the composition admits
the complete pass. The surfaces that offer or carry the stop follow:

- the delivery path binds its terminus offer only on other states (`status.ts`), and counts a pending coverage selection
  as an intervention (`isDeliveryReviewMemberDischargedByOwnerTerminus`). After a converged fix check status names the
  complete pass (§ 6.4), whose request already carries the offer, so status's `coverage-required` arises only after
  material fixes; the offer it binds there is disclosed as resting on fixes no reviewer re-examined;
- pre-publication obtains a terminus only from the driver's `owner-accepted` state (`pre-publication-procedure.ts`);
- `run-errand` admits the Owner's stop only from `ready` or `approval-required`.

#### 8.3 Limits kept

An acceptance is dropped once an approved fix advances the Candidate (`consumeOwnerAcceptedTerminus`,
`pre-publication-request.ts`), the frontline lane cannot take one (`review-policy-driver.ts`), an Errand takes no
durable terminus (`run-errand`), and the published singleton takes no new terminus after publication:
`arc review terminus accept` takes one exact delivery member's (`cli.ts`), `integrate-work-unit` accepts only a delivery
member's, and the singleton's discharge reads none (`composePublishedSingletonReview`, `status-singleton.ts`), so it
holds only a terminus carried from pre-publication; and `deliver-stack`'s member review takes none, since it reviews
through `arc review status --target`, and only the work-unit route attaches the member's terminus offer
(`bindDeliveryReviewTerminusOffer`, called from `resolveReviewStatusForWorkUnit`, `status-composition.ts`). This change
alters none of them. On the published singleton and in `deliver-stack`'s member review, § 6.2's stop therefore does not
arise: the agent states its recommendation and this limit where it reports, and the complete pass runs. Under § 2 the
stop usually lands at a settled head after the last fix check, where an acceptance holds. A later base merge drops it
unless Candidate currentness proves the movement non-semantic (`review-terminus.ts`).

### 9. What a complete pass receives

#### 9.1 Pointers, not verdicts

Today a complete pass receives only the guidance's reviewer instructions, while an incremental pass lists the findings
it must re-examine (`localReviewerInstructions`, `scripts/review-gate/core/local-prepare.ts`). A complete pass instead:

- **receives** earlier reviewer-originated findings as pointers — locus and defect class — labeled "previously reported
  and fixed; the fix and the code around it stay in scope" and not a search boundary, with the instruction to search
  independently and to sweep for siblings of the listed classes. The label claims nothing about the fix: in the change
  set the context describes, 22 of the 57 later findings, both criticals among them, sat in or near earlier fix code;
- **withholds** rejections and their reasons, any global verdict ("converged", "clean so far"), clean status for files
  or areas, any claim that a fix closed its finding, and everything the standard rubric already withholds — author
  conclusions, preferred fixes, self-verification claims, and suspected weak spots.

#### 9.2 Where they are composed, and which findings

The pointers are composed at prepare into `reviewerInstructions` — the string the local review operation already stores
(`LocalReviewStateSchema`, `core/operation-state-schema.ts`) and replay reuses (`runtime/local-prepare.ts`) — as an
incremental pass's required findings already are. The string's content changes; no shape does, and the source descriptor
is untouched. The pointers reach the preparation beside its guidance, in the instruction input that carries a delta
check's basis (§ 3.5), which is never persisted.

They list the lineage's verified findings approved as `fix`, from every lane, read as the lane read reads the
lineage's records (§ 9.4), by locus and the disposition's title, which new proposals
require (`respond-command.ts`) and older stored items may lack; the finding's `sourceLabel` lives on the normalized
finding (`finding-records.ts`), not the disposition, so some pointers carry a locus only. Deferred findings are still
live, so they are not "previously fixed", and rejected ones are withheld.

#### 9.3 Hosted lanes carry none

CodeRabbit's request must be the exact command (`requestCommandCoverage`, `hosted/coderabbit.ts`), so it carries no
pointers. Codex carries none either: it already holds its own findings on the pull request, and request text narrows
what it reports (§ 7.10), so a pointer list could become the search boundary § 9.1 rules out.

#### 9.4 The lane read: rejections for triage, facts for the agent

`review-triage` gains a check of new findings against the lineage's rejections, so no verdict enters the evaluator's
context: while it verifies new findings against source, the primary agent asks of each rejection whether its reason
still holds against current source. No command supplies those rejections today, so the check would rest on conversation
memory. It applies to a lane's findings, not to a review run outside any lane, such as `verify-work-unit`'s author
check.

A read-only CLI read, the lane read (`arc review lane read -`), supplies them. Its request names nothing the agent does
not hold — `{ schemaVersion: 1, memberHeadObjectId? }` — and it resolves the subject as local prepare does: the vehicle
from the checkout's live context, with an optional member selector (`resolveLocalReviewVehicle`,
`hosts/local/review-authority.ts`), then the lineage, an Errand claim's, a Candidate's, or a delivery member's
(`LaneSubjectLineageSchema`'s three kinds, `core/lane-admission.ts`), through one resolver both share. A Candidate's read
covers the Candidates its lane progress inherits from (`readCandidateInheritedLaneProgress`). Where no subject resolves,
or the member selector does not authenticate, it refuses with the resolver's reason (`LocalReviewAuthorityError`) and a
remedy naming the checkout or member head to use.

Its result carries the lineage; the lineage's rejected findings from the stored disposition records, from every lane,
each with its finding identity, locus, title where stored, its `rationale` as the reason, and its `sourceVerification`,
so an observation that did not hold at source reads as one (`DispositionReportItemSchema`,
`core/disposition-records.ts`); § 6.1's facts for the standard lane, a delivery member's counted against its own ceiling
as status already counts them (`DeliveryReviewMemberProgressSchema`, `status.ts`), from the derivation the report renders
them from (§ 10.4); and the last look's coverage and outcome, for the agent's stop after a clean fix check and at the
ceiling (§ 6.2). It rides no stored envelope and stores nothing.

### 10. One pass model

#### 10.1 The `review-model` method

The two families name one set of concepts twice:

| Adversarial review          | Code review                                |
| --------------------------- | ------------------------------------------ |
| pass cap (`Pass N of M`)    | pass ceiling (`completedPasses`)           |
| fold                        | fix, correction, response                  |
| fix check, in rounds        | incremental correction pass                |
| re-inspection test          | — (§ 6 adds it)                            |
| converged / `cap-exhausted` | `pass-complete` / ceiling override         |
| —                           | `full-final`, whose behavior drifted (§ 2) |

A new shared method, `review-model`, defines one model — pass, fix check, cap, convergence, re-inspection test, fold
tags, cadence, and the loop reading (§ 10.3) — and the family's map: § 11's layers, its three review-type methods, and
where every review method sits. Each review-type method holds its type's defaults: a planning artifact is small, so a
complete pass every time stays cheap there; a large code change takes complete passes on a cadence with fix checks
between. Records stay separate by design; an adversarial pass keeps its own record shape (`review/adversarial-pass`).

`review-model` is declared by § 11's three review-type methods, `adversarial-review`, `review-triage`, and
`review-response`, at their fire-points. Every reader reads the model where a review runs, so a fire-point declaration
fits better than a strategy and adds nothing to the always-loaded set. Every constraint — a fix check runs only with
approval, a cap never authorizes, a recommendation is not authorization — stays at its fire site. The method takes an
`init-recipe.json` disposition, a Configurable-list entry, and audit reachability, or it reaches no project.

#### 10.2 A fix check and a successor pass are separate decisions

A fix check verifies repairs; a complete pass looks for what no pass has found. The second does not do the first's job:
in the change set the context describes, 6 defects sat in fix code that one to five complete passes had read and passed.
`adversarial-review` nonetheless teaches the trade in several places:

- its first-round rule recommends declining "when all folds are local corrections and a full pass will follow";
- "the exit gate's re-inspection test may recommend a full pass instead" frames the pass as a substitute;
- repairs join the next pass's `prior-findings`, which agents read as coverage, though the method gives them as
  "context, not the search frontier";
- "the next outer pass covers the last round's repairs" describes the residual after rounds converge, and reads as if
  the pass covered every round's.

The model's rule holds in both families, stated in `review-model` and in `adversarial-review` § Fold verification:

- recommend a fix check, and another round, whenever the last look's approved fixes include a material one, whatever
  follows;
- decline only on the fixes' own merits: they fix minor findings only, or an accepted re-entry or a pending rewrite is
  about to supersede them. That applies where the subject needs no further pass; an Errand needs one after any fix
  (`projectFixConsequence`, `respond-command.ts`), and there the pass § 6.1's bounds name runs;
- a following pass, approved or under the cap, is never a reason to decline, and the method says so in those words;
- fix-check rounds converge before the successor pass launches. The re-inspection test decides whether a full pass
  follows them, never whether one replaces them.

A fix check is scoped to the change, so running both costs far less than two passes. In code review this is § 6's offer:
after material fixes it offers the fix check first and says a complete pass does not replace it, and its judgment
chooses only what follows the converged fix check.

#### 10.3 Reports render the model

Every review report — an adversarial pass, a fix-check round, and a code-review findings round — takes one shape:

- **a header line:** the pass (`Pass N of M`) or fix-check round; the result (converged, not converged, or the stop
  reason), marked provisional until the set is approved, since the approved set decides convergence; and the count of
  findings by grade;
- **a table of `#`, `Grade`, `Finding`, and `Action`,** so a row reads as a sentence and the two columns the approver
  scans sit at its edges. A fix carries its tag in the action, `FIX (new design)` or `FIX (local correction)`; nothing
  else takes one. The tag is the agent's reading of what the fix implies, never an approved judgment. The new-design
  rows are the ones that take a proportionality read, weigh toward a full pass, and feed sustained non-convergence, so
  that is where the approver looks. The table has no verdict column: a graded finding is confirmed, and `—` marks one
  not supported. The rest of today's verdict cell (`renderVerdict`, `core/disposition-report.ts`) moves to the finding's
  section — the reviewer's grade where it differs, and code review's gating — except that a `record-only` finding stays
  marked in its grade cell, since blocking is the default;
- **the order:** as today, code review's blocking findings first, then grade, with unsupported findings last, then the
  source's order. Each finding's label is assigned in that order, so it is the same in every render of one set, the
  evidence block's included; the display then puts new-design fixes first within a grade wherever tags are given, each
  keeping its label;
- **one section per finding,** in table order: its heading; a status line that mirrors the row and adds the verdict
  (`🟠 major · Confirmed · FIX (new design)`); then `**Finding:**`, `**Fails:**`, `**Action:**`, and `**Detail:**`.
  `**Finding:**` replaces `disposition-report`'s `**Issue:**`, so the field and the table's column share a name;
- **what each finding fails:** `**Fails:**` names the rubric item the finding fails, in the review's own terms — in
  verification review, the criterion's locus in `validate-criteria`'s form (`Success Criteria > … > N`); in code review,
  the rubric dimension (`implementation-audit`'s five, as a project's rubric extends them); in a fix check, its axis; in
  planning review, the item of the rubric its fire-point supplies. `none` is an answer, with its reason. In verification
  review that reason is either outside the criteria — the finding is code review's, so it goes to that lane or a capture
  — or a missing criterion, which amends the spec forward, since criterion text is immutable. A review that drifted from
  its lens then shows in the report: a verification review whose findings fail no criterion is doing code review. A
  local reviewer returns the field with each finding — `adversarial-review`'s report schema gains a `fails` field, and
  the code-review reviewer prompt asks for it. For a hosted source the agent supplies it while verifying, marked as its
  reading, and verifies it with the rest of the finding;
- **one Decisions block under the table** holding every ask — the approval, open questions, the fix-check offer, and the
  successor-pass recommendation — each with its recommendation. `disposition-report` already gathers open questions
  there "so everything asked of the approver sits in one place"; the offers join them;
- **a loop reading:** the trend of material findings across passes and rounds (for example `P1: 6 → R1: 2`), where they
  came from (the original artifact or an earlier fold), and how many of their fixes are new design; then one reading
  with a one-line rationale and what it implies for the next decision. The reading is one of:
    - `baseline` — a first look, with no trend yet;
    - `converging` — material findings come from folds, sit next to fixes, or are siblings (instances of a class an
      earlier finding exposed); they are falling or flat, and their fixes are mostly local corrections, which points to
      stopping once the fix checks converge;
    - `discovering` — material findings keep arriving in code or text that earlier looks already read, as new defect
      classes rather than from folds, which points to another complete pass after the fix checks (§ 6.1). It takes
      precedence over `converging` wherever both could be read;
    - `sustained non-convergence` — the exit gate's existing definition: most material findings come from earlier
      new-design folds and their fixes are new design again, which points to the re-entry offer, in its top-level shape
      where the stage has no level above (§ 10.5).

The reading is labeled advisory, the same split as § 6.1's facts and judgment. In planning review the counts come from
the pass record, which keeps each finding's origin and each fold's tag. Code review stores no origin, and keeps a fix's
tag only as an advisory note (§ 10.4), so there:

- the material trend is § 6.1's computed fact: lane progress orders and labels the looks, and the disposition records
  count them (`verifiedSeverity`, `core/disposition-records.ts`);
- new design is read from § 6.1's per-round signals beside the stored tags of earlier rounds and the current round's; a
  tag is the proposal's forecast, and the signals are what the round was;
- origin is the agent's reading of whether a finding falls in an earlier round's fix range;
- `sustained non-convergence` points to stopping for the Owner's decision on whether the spec's design needs
  `amend-design`, which is how a code-time finding reaches the design record; the re-entry offer belongs to planning
  stages (`adversarial-review`'s exit gate).

`disposition-report` takes the shape, with the header line and the Decisions block as fields its caller supplies;
`review-model` defines the loop reading and its four readings; and `adversarial-review` and `code-review`'s findings
round render them.

#### 10.4 Code review's report through the CLI

In code review the CLI renders the report (`renderDispositionReport`), and the workflows emit it verbatim
(`prepare-work-unit`, `integrate-work-unit`), so all of it comes through the CLI. The CLI renders the header from its
provisional assessment, and one Decisions block from the approval, the open questions, and § 6.1's bounded offers. The
agent's parts reach it on the first `arc review respond -` call as one `report` object beside `proposal`
(`RespondProposalRequestSchema`, `respond-command.ts`), keyed by finding identity:

- `tags`, `new-design` or `local-correction`, exactly one per fix;
- `fails`, the `**Fails:**` anchor — a rubric item, or `none` with its reason — exactly one per finding;
- `successorRecommendation`;
- `origin`, the counts by where the findings came from and the new-design fixes among them;
- `reading`, one of § 10.3's four, with its rationale.

A missing, extra, or duplicate key is refused with a remedy naming the identities. The CLI renders the trend from
§ 6.1's fact. None of it sits inside `AuthorDispositionSchema`: `prepareDispositionProposal` spreads each proposed
finding into the disposition set, whose digest the approval binds (`dispositionSetId`, `ApprovedDispositionSetSchema`,
`core/disposition-records.ts`), so anything placed there would be approved and stored with the set.

The tags alone are kept, as an advisory note outside that identity. The approved call (`RespondApprovedRequestSchema`)
carries them again, checked against the approved set's fixes the same way, and stores them on the record's lineage node
beside the approved set (`ApprovedDispositionLineageNodeSchema`, `core/advisory-records.ts`), as an optional field, so a
record without them still parses. Only that call writes them, at the response's first write, and no later advance of the
record changes them. A tag can be disputed or wrong with no consequence: nothing re-proposes or re-approves for it, and
the report presents it as the agent's reading. The other inputs render on the first call and are stored nowhere.

A local result's findings carry no text (`ReviewFindingContentSchema`, `core/finding-records.ts`); the reviewer's own
report, which the result's `evidenceUrlOrId` references, gives a `Fails:` line with each finding, and the agent lifts it
into `fails`. The approved call, the verified-fix call, and the settlement replay render the report too
(`renderDispositionReport`, `respond-command.ts`), reading the stored tags; they take a reduced shape: a header naming
the approved set, the table and sections ordered and tagged as the proposal was, and no `**Fails:**`, Decisions block,
or loop reading.

#### 10.5 Re-entry where there is no level above

`resolve-planning-depth` routes a floor-raising signal, once the offer is accepted, to the stage that owns its axis,
re-entered one level higher, and "nowhere-up from `high`". At `high` in the owning stage the level part of the offer is
empty: an offer to re-enter higher reads as noise and ends up argued as a reason to decline, as it did in this work
unit's own draft review (§ The rule today), while the signal still calls for a response. There the offer changes shape:

- **return to shaping** for the named locus. Accepting it ends the review loop with the exit gate's existing
  `re-entered` stop reason; the locus is worked through the stage's own authoring loop — in `draft-design`, the
  facilitated shaping step, from the problem and its alternatives rather than a patch per finding; in `create-spec`, its
  discovery step over the named section at the resolved form; readiness re-runs, which in `create-spec` is spec-review
  over that section; and the stage's adversarial offer starts a fresh loop with a fresh cap. The pass record keeps the
  ended loop's passes and findings, and its findings, not its folds, reach the new loop's first pass as
  `prior-findings`, labeled as the ended loop's and given as context rather than the search frontier — the one exception
  to `adversarial-review`'s rule that pass one takes none, which guards against inheriting the primary's focus and does
  not reach findings fresh reviewers raised. Sustained non-convergence means the agent is writing design in folds for
  approval, which `draft-design`'s rule that the agent does not produce a finished design for sign-off rules out. At
  `generate-tasks` it is a return to grounding the named surface;
- **the `Class` ratchet to `Novel`,** when the read finds the design must be invented rather than composed;
- **`assess-boundary-fit`,** when the design written in folds spans concerns that could stand apart, as the exit gate
  already offers.

"Re-enter higher" never appears where nothing is higher. The top-level shape applies where the signal's own stage is at
`high`: `draft-design` for derivation, `create-spec` for a signal about the spec's form alone, and `generate-tasks` for
scale. A derivation signal at `create-spec` whose direction is unshaped, or at `generate-tasks`, keeps its offer to
route upstream. `resolve-planning-depth` § Mid-stage re-entry and `adversarial-review`'s exit gate say so.

#### 10.6 Agentic review only

Human review is out of band, follows once agentic review has closed (ADR-034), and is never a pass.

#### 10.7 Prose aligned to the model

These change to state the model, in the package's `arc/` source and then the `.arc/` copies: `adversarial-review` (its
fix-check round recommendation, its re-inspection test, its exit gate's re-entry offer, and its report schema's `fails`
field), `resolve-planning-depth`'s § Mid-stage re-entry, `review-triage`, `review-response`, `classify-review-risk`'s
"What the call changes", `disposition-report`'s report shape, and § 11's review-type methods.

### 11. The review family

#### 11.1 Sites, review-type methods, and checks

Every review type has three kinds of thing, and no method names the middle one today, so a type exists only as a pattern
its call sites repeat:

| Type         | Sites (lifecycle workflows)                                               | Method                | Checks                                                                                                                     |
| ------------ | ------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Planning     | `draft-design`, `create-spec`, `generate-tasks`, `amend-design`           | `planning-review`     | `assess-draft-readiness`, `assess-design-proportionality`, `design-audit`, `source-grounding`, `spec-review`, `task-audit` |
| Code         | `run-errand`, `prepare-work-unit`, `integrate-work-unit`, `deliver-stack` | `code-review`         | `implementation-audit`, under `code-review-standard`'s satisfying standard                                                 |
| Verification | `verify-work-unit`, the task loop's delivery-member boundary              | `verification-review` | `validate-criteria`                                                                                                        |

- **A site** is a lifecycle workflow: its stops, gates, and state, including what is not review — `verify-work-unit`
  also runs the merge gate and attests the Candidate.
- **A review-type method** is what a site calls for its review. Each runs the author checks its site runs at the stage
  gate, then an independent pass, then findings handling. Planning runs the checks its artifact selects before
  `adversarial-review`: readiness for a draft (`assess-draft-readiness`), the proportionality re-run and `spec-review`
  for a spec, and `spec-review` over an amendment's footprint; a task list takes none, since `generate-tasks` audits
  each phase in its own loop. Code runs `code-review-author` before the frontline and standard lanes, and verification
  runs the author's criteria walk before its independent companion. An ad-hoc request reaches the method too, since a
  workflow is only where review occurs (`strategy-knowledge-evolution` Principle 3), so each method's When line names
  its trigger rather than its sites. A review-type method dispatches on what the CLI computes and holds no sequencing
  the CLI owns (`strategy-procedure-evolution` Principles 1 and 2), and it takes `adversarial-review`'s contract shape:
  a When line, a Signature, a Contract, named inputs, and a return schema. A site calls `planning-review` and
  `verification-review` with a YAML callsite keyed by the method's name, as `adversarial-review`'s callsites are.
  "Operation" keeps the sense the code sites' prose already gives it, a stored CLI operation
  (`core/operation-state-schema.ts`), and never names this layer.
- **A check** is rubric content that runs in the author's context or goes to an independent evaluator as its rubric;
  independence is where a check runs, not a property of the check.
- **Vehicles, findings handling, and routing serve the review-type methods:** `adversarial-review` (advisory, fresh
  context) and the review gate's lanes, `code-review-frontline` (advisory) and `code-review-standard` (satisfying)
  (§ 12); `review-triage`, `review-response`, and `disposition-report`; and `classify-review-risk` and
  `review-chunking`.

At the stage gate a site calls its type's method, never its checks. A site keeps the checks it runs inside its own
authoring loop — `generate-tasks`' per-phase `task-audit`, the `spec-review` after each batch of specification edits —
and declares them. A site that wants evidence and no review calls the check directly: `deliver-stack`'s review-fix
verification and `amend-design`'s closing criteria delta (§ 11.4), and `decompose-work-unit`, which runs `spec-review`
over the specifications it authors or retains. Ad-hoc doors reach a review-type method or a check: `arc-design-audit`
and `arc-task-audit` run a check standalone, and `arc-amend-design` opens `amend-design`, all under `.internal/skills`
with their harness copies under `.claude/skills`. Two methods sit beside the three review-type methods:
`code-review-author` is code review's author check, stated once in `code-review` § Author check (§ 11.3), and
`assess-evidence-applicability` is the judgment at a moved target's applicability stops, with the bounded check that
informs it (§ 7.7).

Declarations follow the review-type methods: a site declares the method it calls, and a review-type method declares the
checks, vehicles, findings methods, and `review-model` it fires. Methods' "Workflow:" callouts name their real callers.
`review-model` lists the three review-type methods and places every review method in its layer, and the methods index
(`system/methods/README.md`) groups them.

A review step is in exactly one place when its text is stated in one method or workflow section and every other site
that runs it cites that section by a reference link carrying the heading's fragment. The link audit, a commit-gate check
(`lint:arc:links`, `audit-links.ts`), refuses a fragment that names no heading in its target, so renaming a cited
heading fails at commit; a prose `§` citation alone is checked by nothing.

Each review-type method is a new method file, so, like `review-model` (§ 10.1), it takes an `init-recipe.json`
disposition, a `CONFIGURABLE_FILES` entry (`lib/classification.ts`) with its line in
`strategy-package-project-sync.md`'s Configurable inventory, and the regenerated manifest, or it reaches no project; its
sites' declarations keep it reachable for the method-trigger audit (`audit-method-triggers.ts`). `drain-inbox` is no
site: it enters code review through `run-errand`'s reviewed-lane settlement, which it cites, so its citation follows
that settlement wherever the rewiring puts it.

#### 11.2 `planning-review`

A new method. `draft-design`, `create-spec`, and `generate-tasks` carry its block nearly verbatim today: the offer
callout, the orientation block, the authored-partition note, the fix-check sentence, the pass-record paragraph, and the
post-settle re-read. The site calls it with a YAML callsite keyed by `planning-review` and passes its artifact, which
selects the author checks (§ 11.1), the rubric, the artifacts, the `Class`-scaled offer, and the pass cap.
`amend-design` passes its depth instead, since an amendment scales by depth rather than `Class`, and gains the offer
callout, signature block, and pass cap it lacks today: depth sets the offer (none at `low`, neutral at `medium`,
recommended at `high`), and `Class` sets the pass cap, as at the other sites. At `draft-design`, `create-spec`, and
`generate-tasks`, the offer aligns — recommend at `Heavy` and `Novel`, neutral at `Light` — where `draft-design`
recommends only at `Novel` today. A `Heavy` draft is where its design is written, which is where a fresh attack pays:
this work unit's own `Heavy` draft, reviewed on the Owner's call, drew a critical and five majors on its first pass
(`notes-review-coverage-cadence.md` § Planning review of this work unit). The post-settle re-read runs as the last step
before each site's commit.

#### 11.3 `code-review`

A new method, as shared procedures rather than one sequence. Each site drives review through its own CLI command and
state vocabulary — `arc review resolve` for an Errand, `arc review pre-publication` before publication, the integration
boundary's `nextAction`, and `arc review status --target` for a stack member — with its own early stop and fix
verification, which the CLI owns. What the sites share, and clone today, moves here:

- **the author check:** `code-review-author` over the aggregate diff, its findings through triage as a non-producer
  report. `verify-work-unit` runs it before its merge gate, so its fixes land before verification's evidence, and
  `prepare-work-unit` runs it when pre-publication returns `run-self-review` (§ 11.5); both cite this section;
- **the findings round:** triage, the disposition report, complete-set approval, response, fix, verification, commit,
  the verified-fix replay, push, settlement, and re-entry. The replay — the exact approved request replayed with
  `verifiedFix` once the fix is committed (`respondToResolvedReviewCommand`, `respond-command.ts`;
  `reentryCommand: respond-verified-fix`) — records the performed response a fix check's chain needs (§ 7.4), and runs
  before any push interlock releases, as `review-response` states;
- **hosted await and settlement,** with the checks diagnostic;
- **the common rules:** convergence (§ 2), the coverage selection arm (§ 6.5), the chunk gate (§ 3.3), the ceiling
  override (§ 5), and the stop line (§ 8).

Each site keeps a thin dispatch on its own command whose arms call in. `code-review` is one method with named sections
that a dispatch arm cites by a reference link carrying the section's heading fragment (§ 11.1), as workflows already
cite `adversarial-review` § Pass record. Each section reads on its own: it opens with a one-line signature — when it
fires, what it takes, and what it leaves — and leans on no text above it. § 2–9's cadence and
source selection are its defaults. It keeps the common name for a review of the whole change set, design intent
included: `implementation-audit` reviews "how a change realizes its intent".

#### 11.4 `verification-review(scope)`

A new method, at delivery-member and work-unit scope. `validate-criteria` becomes its pure check: criterion binding, the
three-state model, immutability, and evidence. It is today the one check that declares its own vehicle
(`arc.methods: adversarial-review`, with § Adversarial companion); the companion offer moves up into
`verification-review`, stated once with `validate-criteria`'s current posture, and `verify-work-unit` and
`process-task-loop` call it with a YAML callsite keyed by `verification-review`, passing their scope, and stop restating
it. Each of the companion's findings names the criterion it fails (§ 10.3's `**Fails:**`), so a finding outside the
criteria reads as such rather than as a criterion gap.

Two sites call the check directly:

- `deliver-stack`'s review-fix verification — "verification evidence for the exact correction delta, not a review
  verdict" — which makes its exemption from the companion structural rather than unstated;
- `amend-design`'s closing criteria delta: the amendment's independent pass is the `planning-review` over its footprint,
  and a second over the same delta would repeat it.

#### 11.5 Drift fixed in the same pass

Each confirmed against source:

- `deliver-stack` tells a stack member to "Apply `frontline-review`, then `standard-review` or `implementation-audit` as
  applicable", while `integrate-work-unit` says "Do not invoke frontline review" for the same member; the instruction
  goes.
- `integrate-work-unit` and `deliver-stack` pass a ceiling override into "the named hosted, local, or frontline
  admission", where neither reaches a frontline admission; the frontline alternative goes there and stays in
  `run-errand`, which runs frontline.
- `prepare-work-unit` has `review-response` compose the proposal; everywhere else, and in both methods, `review-triage`
  does.
- `create-spec` calls its `spec-review` pass "self-review", which reads as code review's author check, in five places.
- `adversarial-review` § Pass record says a planning pass "creates no lane-progress record, code-review operation,
  Candidate, policy binding, or receipt", meaning a stored review-gate operation; beside a method named `code-review`
  the phrase reads as that method, so the sentence says which it means.
- Declarations that nothing fires, and fire-points nothing declares: `integrate-work-unit` declares `adversarial-review`
  and `implementation-audit` and fires neither; `run-errand` declares `implementation-audit` and never fires it;
  `prepare-work-unit` declares `self-review` and never runs it; `verify-work-unit` and `process-task-loop` fire
  `adversarial-review` undeclared, citing `validate-criteria`'s declaration; `create-spec`, `generate-tasks`, and
  `amend-design` cite `source-grounding` undeclared; `generate-tasks` cites `validate-criteria` undeclared; and
  `adversarial-review`'s "Workflow:" callout names `prepare-work-unit` and `integrate-work-unit`, which never fire it.
- The verified-fix replay is stated only in `review-response`; `run-errand` leaves it out, and the hosted arms of
  `run-errand` and `integrate-work-unit` push before the continuation that carries it. `code-review`'s findings round
  names it, before the push (§ 11.3).
- Pre-publication emits `run-self-review` while self-review is pending (`pre-publication-procedure.ts`), and the handler
  re-enters with self-review settled without checking that it ran (`handlers/review.ts`). No workflow arm handles the
  action, so `prepare-work-unit`'s dispatch gains one that runs `code-review`'s author check before re-entry (§ 11.3).
- `verify-work-unit` and `process-task-loop` restate `validate-criteria`'s companion callout with "decline keeps the
  primary report" where the method says "decline proceeds normally"; § 11.4 states it once.
- `draft-design` places its post-settle re-read after the text describing what follows its commit, and `generate-tasks`
  places its re-read under its delivery-authoring step, worded for delivery; § 11.2 places it once, before each site's
  commit.
- `integrate-work-unit` carries an Owner's decision for another named pass after a converged result with
  `--additional-pass` "on the same status scope", which includes an ordinary singleton's `--target`. The singleton's
  discharge takes no additional-pass authorization (`HostedReservationDischargeReaderArgs`,
  `hosted-reservation-support.ts`), so status returns `settled` there (`composePublishedSingletonReview`,
  `status-singleton.ts`); the paragraph states that limit for the singleton (§ 3.5).

### 12. Names

#### 12.1 Names kept

- **`adversarial-review`** keeps its name, and the store kind `review/adversarial-pass` (`lib/store/catalog.ts`,
  `lib/store/registry.ts`) with it.
- **`validate-criteria`** keeps its name as verification's check (§ 11.4).
- **`full-final`** keeps its name; renaming it would change the routed requirement and cost every in-flight chain a
  transition pass (§ 2.1).
- **The rubric identity `standard-review/v1`** keeps its name. It names a rubric, and as a schema literal
  (`rubricVersion`, `standard-review-guidance.ts`) it is carried in every stored requirement and compared by
  `resolveOfferedCorrectionScope`.
- **The lane vocabulary** keeps its names: `review.standard_*` and `review.frontline_*`, `arc review frontline`, "the
  standard lane", and the review gate's TypeScript modules named `standard-review*.ts`.

#### 12.2 Three renames

The methods `frontline-review` and `standard-review` become `code-review-frontline` and `code-review-standard`. As
method names they read as peers of the review types, though they are code review's advisory and satisfying lanes; the
prefix groups them under `code-review`, and segment 4's rewiring already touches their call sites. `self-review`
becomes `code-review-author`: its name says who runs the pass but not what it covers, and ARC uses the phrase in plain
prose for other passes, as `create-spec` does for its `spec-review` pass (§ 11.5), while the new name places it as code
review's author check (§ 11.1). Each rename is a code change as well as prose, though none needs a migration, and each
is all-or-nothing, because several checks tie a method file's name to other places:

- `name` must equal the file's basename, and `active` is allowed only when the basename is an activation-registry key
  (`lib/frontmatter/method.ts`);
- activation diagnostics are built from the name, as `method.<name>.*` (`lib/method-activation.ts`);
- the package-neutrality check looks up the registry default by basename and requires a `## <basename>.override` section
  (`validate-package-neutrality.ts`);
- the trigger audit requires a method that declares `active` to be a registry key, and the reverse
  (`audit-method-triggers.ts`);
- the local method-file reader reads `<name>.md` by registry key (`hosts/local/method-files.ts`).

So these move with the files, in both copies:

- each method file's `name`, title, and `.override` and `.default` section headings;
- the activation-registry keys (`lib/method-activation-registry.ts`) and their caller's keys (`resolveMethodActivation`,
  `scripts/review-gate/policy/activity.ts`), with the activation diagnostics built from each name;
- `CONFIGURABLE_FILES` (`lib/classification.ts`) and `strategy-package-project-sync.md`'s Configurable inventory;
- `init-recipe.json`'s `include_files` entries, and the tracked generated manifest
  (`.arc/system/.internal/manifest.json`), regenerated rather than hand-edited;
- `.arc/system/arc-checks.yml`'s table-format inputs;
- `related:` and `arc.methods:` entries (`adversarial-review`, `review-chunking`, `deliver-stack`, `run-errand`,
  `prepare-work-unit`, `integrate-work-unit`, `verify-work-unit`), as § 11.1's declarations leave them;
- prose naming the methods: `review-chunking`, `review-triage`, `design-audit`, `verify-work-unit`, `prepare-work-unit`,
  `integrate-external-content`, the `arc-design-audit` skill and its harness copy, the methods `README.md`,
  `AGENT-BRIEF.ARC.md`, `strategy-session-operations.md`'s method table, and
  `strategy-configurability-architecture.md`'s package-default line, while a plain-English "self-review" that names no
  method stays;
- the tests that pin any of these — framework sync, init and update, the PR-lifecycle and legacy-sweep integration
  tests, the frontmatter, neutrality, trigger-audit, method-file, activity, assurance, and planning-grooming unit tests,
  the pre-publication frontline-skip integration test and the Candidate lineage suite, which write `frontline-review.md`
  to set activation, the pre-publication workflow, review-fix release, and review-gate workflow integration tests and an
  author self-review triage fixture, which read `self-review.md`, and the init end-to-end test, which pins the method
  names.

This repository's Configurable `.arc/` copy of `frontline-review.md` carries `active: true` where the package default is
`false`, and moves under the new name with that value. `docs/` is left as it is.

#### 12.3 Literals that keep a renamed name

Every stored or schema literal and published schema ID that carries an old name stays, since each is a stored shape or a
published contract:

- the requirement kind `"standard-review"` (`core/contracts.ts`, `core/gate-contract-v2.ts`,
  `core/gate-contract-v2-schema.ts`) and the blocker code built from it (`core/projection.ts`);
- `frontline-review/v1` (`frontline-semantic.ts`, `frontline-outcome.ts`, `frontline-command.ts`);
- `standard-review-reservation/v1` (`integration-boundary-locus.ts`, `pre-publication-procedure.ts`) and
  `arc.standard-review.reservation/v1` (`integration-boundary-locus.ts`);
- the rubric: `standard-review/v1` and `arc.standard-review.rubric-digest/v1` (`standard-review.ts`), the version
  pattern and the schema IDs `standard-review-rubric-digest-preimage` and `standard-review-contract`
  (`standard-review-schema.ts`), `standard-review-guidance/v1` and its `rubricVersion` literal
  (`standard-review-guidance.ts`), and the schema ID `standard-review-obligation-projection`
  (`standard-review-projection-schema.ts`);
- the `standard-review/v1` source qualifier (`local-review-policy.ts`, `runtime/local-prepare-composition.ts`);
- the `frontlineReview` and `selfReview` method-activity fields of the published `review-method-activity` schema
  (`policy/assurance-schema.ts`);
- the author check's routing and pre-publication literals: the `authorSelfReview` fields of the routing decision and the
  project promotion (`policy/routing-schema.ts`, `policy/project-promotion-schema.ts`), the `self-review-inactive`
  reason (`policy/routing-schema.ts`), the `run-self-review` boundary action (`integration-boundary-locus.ts`), and
  `arc review pre-publication`'s `--self-review settled` option (`cli.ts`);
- the rubric line in `AGENTS.md` and `.coderabbit.yaml`, and the method text "The baseline version is
  `standard-review/v1`", which tests pin;
- the published schema IDs the tests pin, and every stored record that holds these literals.

### 13. Configuration, documentation, and copies

- **`arc-config.yml`,** both copies. The shared ceiling comment ("Positive safe-integer pass ceilings. An exceptional
  extra pass requires explicit approval.") covers `review.frontline_max_passes` and `review.standard_max_passes`; it
  states that the standard ceiling counts complete passes, with fix checks outside it, and that the frontline ceiling is
  unchanged. The standard-sources comment names `delegated-agent` as the source of fix checks, without which the lane
  stops after an unconverged pass (§ 7.3).
- **`TECHNICAL-OVERVIEW.md` § Self-Hosting Review Gate** states that fix checks run locally and hosted sources run
  complete passes, and replaces "focused supplementation" with the bounded check at an applicability stop (§ 7.7). Its
  "standard-review stream" is lane vocabulary and stays.
- **Workflow and method text** changes in the package's `arc/` source and syncs to `.arc/`, never the reverse;
  Configurable copies keep their project-specific lines.

## Alternatives & Rationale

- **Route `sensitive` to `retrigger: incremental`.** It drops the complete passes that found 14 new defect classes, with
  nothing in their place: incremental review plus a sibling sweep keeps 37 of the 57 later findings and loses 20, 14 of
  them major or critical and 11 from passes 2–3. A changed `retrigger` also breaks `compatibleStandardPolicy`, costing
  every in-flight review a transition pass, and would reopen `reduceReviewRouting`'s `sensitive` guard for the surface
  promotions.
- **A complete pass after the last new-design fix, then fix-check convergence.** The new classes found in passes 2, 3,
  and 5 sat in original code unrelated to any fix, so a rule keyed on the kind of fix cannot see them; it keeps only the
  incremental-plus-sweep figure. A variant gated on "the last complete pass found no new class and its fixes were local"
  would have stopped after pass 4 and missed pass 5's two majors, putting an unvalidated threshold into an admission
  control.
- **Recommendation and Owner decision only, with no convergence rule.** It makes `full-final` identical to `incremental`
  at the gate for the class most worth protecting, and a converged fix check does not establish what a complete pass
  does: fix code outlived one to five complete passes.
- **Where the savings come from.** Under § 2, a complete pass that finds a new defect class or a defect in earlier fix
  code still calls for another complete pass, and 6 of the 7 later passes in the change set did. The rule saves complete
  passes two ways: fix checks catch fix-adjacent defects and siblings before the next complete pass; and if fix checks
  also catch defects in fix code — they read exactly that code, though this is untested — the complete passes would have
  converged around pass 6 rather than past pass 8. Beyond that, the relief is the Owner's stop, which § 6 informs and
  § 8 keeps available wherever it exists today — not on the published singleton after publication or in
  `deliver-stack`'s member review (§ 8.3); the counterfactual "complete through pass 3, then incremental plus a sibling
  sweep" keeps 20 of the 27 later findings only through that stop.
- **Counting fix checks, or giving them an attempt kind.** Counting them would spend the Owner's one spend lever on
  verifying repairs that each already carry an approval. An attempt kind, counter, or authorization record of their own
  would be new machinery for what code review's incremental attempt already carries.
- **Fix-check approval as its own stop.** It would double the stops per fix round; riding the complete-set disposition
  approval keeps one approval per round.
- **A hosted fix check.** The provider's own incremental review takes no ARC instructions and, as probed, re-examines
  nothing it has already posted; ARC could neither shape nor verify it (§ 7.10).
- **Narrowing `sources` after an unconverged pass.** The continuation validates the terminal attempt against `sources`,
  so a narrowed list would reject the hosted terminal the rule exists for; the restriction applies at selection instead
  (§ 7.2).
- **A CLI-computed recommendation, or a stopping rule.** The inputs are judgment, no validated stopping rule exists, and
  a literal-reading model executes a computed recommendation as a rule. The CLI computes bounds and facts, and the
  agent's judgment is labeled advisory (§ 6.1).
- **A coverage selection emitted on every path.** It had no subject for an Errand before its pull request, and asked the
  Owner twice where local prepare also asks; one question per moment reuses the two surfaces that exist (§ 6.4).
- **Additional stored rework state or origin tags.** Observable per-round signals and the agent's reading suffice for
  an advisory loop reading. The optional fix-tag note (§ 10.4) preserves report ordering and tags outside the approved
  set's identity; it drives no decision.
- **A supplemental incremental pass, or a counted check, at a base merge.** No correction scope exists for a movement
  that is not an approved fix, so a supplemental pass cannot run, and a counted check that needs no stop would mark its
  scope in a stored record. The bounded check at the existing stops informs the Owner's choice with neither (§ 7.7).
- **Carrying an earlier review across a plain commit, or asking at each one.** Carrying it with no look would have the
  agent judge whether review applies to its own commit (`DEV-RULES.ARC` § Rule Authority), and carrying by the kind of
  path a commit touches fails where a test edit hides a regression. The bounded check plus the Owner's choice on every
  path, stored nowhere, leaves the CLI no result to read, so the Owner would be asked at every such commit; a scoped
  look under `incremental` alone would leave `full-final` nothing. The delta check is recorded, so under `incremental`
  the configuration the Owner chose settles the next step. Under `full-final` the stop stays, since a fix after a
  converged look takes a complete pass (§ 2.3), and a plain commit carried on a scoped look alone would cost less than a
  fix (§ 3.5).
- **Letting the Owner's choice of another source or of complete coverage lift the delta check's source limit.** The
  choice would have to reach every composition that applies the limit — Errand status, both branches of hosted request
  admission, and the singleton's discharge and its re-read — yet an Errand's hosted request refuses an invocation
  (`hosted/request.ts`) and the discharge input carries no coverage choice (`composePublishedSingletonReview`,
  `status-singleton.ts`), so carrying it would need a stored choice (§ 1.3). The limit holds with no exception instead,
  and the Owner's other outcomes come in a fixed order: a local complete pass at once, and a hosted one after the delta
  check on an Errand and in pre-publication (§ 3.5). What it costs the Owner is one local look there, and on the
  published singleton under `incremental` the hosted complete pass today's review-applicability stop reaches, short of
  re-rooting the Candidate, since its discharge takes no additional-pass authorization.
- **A strategy home for the model.** Every reader reads the model where a review runs, so a fire-point declaration
  adheres better than an index entry — about 85–95% against 60–75% in `analysis-load-set-scoping`'s adherence bands —
  and adds nothing to the always-loaded set. A strategy can carry the family's rationale and point to the method.
- **One code-review sequence instead of shared procedures.** The four sites drive review through four CLI commands with
  different state vocabularies, early stops, and fix verification, so one sequence would re-own sequencing the CLI owns.
  Shared sections cited by anchor remove the clones without that.
- **Other names.** `adversarial-review`'s identity contract makes the stance part of what it is ("The reviewer tries to
  break the artifact against the supplied rubric"), which the standard rubric does not frame, and beside the review-type
  methods it reads as a vehicle: `planning-review` runs it with `design-audit`. `advisory-review` names its real line
  against the gate, authority, but collides with `frontline-review`'s "advisory pre-publication review" and reads as
  optional; `independent-review` and `fresh-review` name properties the gate's local passes share.
- **Other names for the author check and the layer.** `author-review` would read as a peer of the review types, as the
  old lane names did, and keeping `self-review` keeps a name that says who runs the pass, not what it covers.
  "Operation" for the layer would share a word with the stored CLI operation the code sites already name
  (`prepare-work-unit`'s "Retain any returned operation ID"), and `adversarial-review` § Pass record's "code-review
  operation" would name both.
- **The review family as a separate change.** It could follow on its own, but its review-type methods carry this
  change's cadence and model, and the other segments already edit the same review fire-points; landing together rewires
  them once.

## Cross-cutting Considerations

- **Storage and compatibility.** Nothing new is stored but a fix's optional advisory tag (§ 1.3, § 10.4), which a record
  without it still parses. Stored records keep parsing: hosted records holding incremental coverage,
  `HostedCoverageEvidenceSchema`, the boundary's resolve envelopes, and every stored literal carrying a renamed method's
  name (§ 12.3). In-flight reviews keep their incremental basis, since the routed requirement does not change (§ 2.1).
  ARC is pre-release, so the renames add no alias or migration reader (`DEV-RULES.PROJECT` § Engineering Standards).
- **Trust and authority.** Bounds bind the agent, never the Owner (§ 8.1). ARC never records a pass that cannot
  re-examine a fix as one that did: a hosted source after an unconverged pass is refused, forced or offered, and the
  Owner waives re-examination only by stopping, which is disclosed, and only where a surface takes the stop (§ 8.3).
  Hosted admission refuses incremental coverage outright, since the schemas keep parsing it (§ 7.9). A delta check
  carries review across a commit only on a look that read it, over a range the coverage chain re-proves from Git on
  every round, and while one is admissible a forced hosted source is refused, with a local complete pass at once and a
  hosted one after it where § 3.5's fixed order reaches one (§ 3.5, § 8.1).
- **Cost.** A fix check reads the fix range and runs locally, so a fix round costs a fraction of a complete pass.
  Complete passes still run until one converges at the settled head, so the saving depends on fix checks catching what
  the next complete pass would otherwise find, and on the Owner's stop.
- **Testing.** Each segment's tests exercise its rule on every path Goal 5 names; § 3.5's delta check is tested on the
  three paths Goal 10 names, with its refusal when the base moved, a merge commit sits in the range, or the Candidate
  re-rooted. The delivery re-check gains a test that runs the real re-check (§ 7.6). The singleton's local route, the
  open-pull-request chain proof, and the bound-delivery arms are traced from source and not yet run, so their tests
  carry them. Content integration tests run over the whole branch before its first push, since workflow and method
  Markdown changes. Judgment-layer behavior — the fix check's rubric, § 6.3's text, and § 9's pointers — has no eval
  instrument yet, and the bounds-plus-considerations text pattern is untested across model families; when evals exist,
  check recall with and without the pointers, both of unlisted defects and of defects at the listed loci.
- **Audience boundaries.** Method and workflow text ships, so it states what is, with no transitional framing and no
  internal work-unit names.
- **Rollout.** One branch with chunked review, landing all four segments together. A hand-typed `@coderabbitai review`
  stays a competing request generation that never counts as a pass (§ 7.9).

## Success Criteria

1. **A `full-final` lane does not close on a fix check.** On an Errand before and after its pull request,
   pre-publication, the published singleton, and a delivery member: after a pass with a material fix, the next pass
   offered is a local fix check, with a local complete pass also listed; a converged fix check resolves to
   `coverage-required`, not `pass-complete`; the complete pass that follows at the same head is admitted without a
   selection; and a complete pass at the settled head with no material fix completes the lane. Under `incremental`,
   adequacy is unchanged (§ 2, § 6.4).
2. **No hosted source runs the pass after an unconverged one.** After a hosted pass with a material fix, the driver
   selects `delegated-agent` and refuses a forced hosted source with a remedy naming the local pass, and the work-unit
   offer lists only `delegated-agent`; with `delegated-agent` not configured, the lane stops there with § 7.3's
   remedies. After a converged pass the configured rank picks the source, and a hosted source can run the complete pass.
   A delta check runs on `delegated-agent` whatever the rank, with no hosted-first reservation, and while one is
   admissible the driver refuses a forced hosted source with a remedy naming it; complete coverage supplied in local
   prepare's request runs a local complete pass instead, with no correction scope; and with `delegated-agent` not
   configured none is admitted and today's behavior holds (§ 3.5, § 7.1–7.3).
3. **No incremental hosted request runs.** Hosted admission and both `status.ts` hosted routes refuse incremental
   coverage with a remedy naming the local fix check; § 7.9's writers are gone; and a stored hosted record with
   incremental coverage still parses and replays.
4. **The fix-check chain proves on either side of the pull request and breaks on a mid-round base move.** A fix check
   proves a leg that holds a fix by the performed-response test on every confirmation § 7.4 names, before a pull request
   and after, including after a hosted pass at an open pull request and on a Candidate whose record commit follows the
   fix; a base move after an unchecked fix makes the next pass a local complete one on every path, delivery included;
   and no incremental pass is admitted after a clean predecessor but a delta check, by § 3.5's range proof (§ 3.2,
   § 3.5, § 7.4, § 7.8).
5. **The published singleton runs its local pass.** Its route names an ordinary local prepare request in place of
   `run-review` and handles `coverage-required`, and its discharge reads the local terminal, its source, and earlier
   local attempts with no `deliveryAdmission`. A delivery admission chosen with `--source delegated-agent` survives
   local prepare's real re-check (§ 7.5, § 7.6).
6. **The ceiling counts complete passes.** A lane at the ceiling runs a fix check with no override; a complete pass past
   the ceiling requires an override or extra pass, which no fix check spends, and a conditional next-pass authorization
   binds only to a complete pass's admission; `logicalPass` still numbers every finished attempt and
   `validatePassCounts` holds; every comparison § 5.2 lists reads the complete count and every binding it lists still
   reads `logicalPass`; and no text the Owner reads shows an attempt number as a pass (§ 5).
7. **Each coverage question is asked once.** Off the delivery path local prepare asks after material fixes; on it status
   asks and local prepare does not ask again; after a converged look under `full-final` nothing asks; and status refuses
   a `--source` and `--coverage` pair that matches no listed choice, and a `--coverage` where it routes the singleton to
   a local pass (§ 3.5, § 6.4, § 6.5).
8. **The Owner's stop is reachable at `coverage-required`** once the terminal's response is performed, on the delivery
   path's work-unit route, in pre-publication, and in `run-errand` (§ 8.2, § 8.3).
9. **A fix check is chunked by its own range,** on and off the delivery path; `prepare-work-unit` and
   `integrate-work-unit`'s singleton route carry the chosen scope into local prepare and `--lanes`; and a complete pass
   after a fix check at the same head resolves with its own scope (§ 3.3, § 3.4).
10. **A complete pass receives pointers and no verdicts, and the lane read serves triage and the agent's stop.** Triage
    reads the lineage's rejected findings and their reasons from the lane read. After a clean fix check under
    `full-final`, each workflow's arm, keyed on the read rather than on memory, runs it before the complete pass is
    dispatched — before publication where pre-publication's envelope carries a hosted-first `reservation` ahead of
    `run-convergence-verification` or `publish-candidate` — and offers the Owner's stop when the judgment recommends
    stopping; in `deliver-stack`'s member review and on the published singleton the arm reports the limit instead
    (§ 6.2, § 8.3, § 9).
11. **The bounded check runs at both applicability stops,** with `assess-evidence-applicability` fired at
    `integrate-work-unit`'s pre-reconcile stop; the `--coverage incremental` supplemental arms are gone; and the arms
    that land a fix it prompts follow § 7.7, outside and inside a bound delivery.
12. **The shared model is in one method, and every report renders it.** `review-model` exists in both copies with its
    recipe disposition, Configurable entry, and fire-point declarations; `adversarial-review` § Fold verification states
    that a following pass is never a reason to decline a fix check; and an adversarial pass, a fix-check round, and a
    code-review findings round render § 10.3's shape, with `fails` in `adversarial-review`'s report schema and the
    render-only inputs persisted nowhere but each fix's tag, kept as an advisory note outside the approved set's
    identity, and each finding's label the same in every render of one set; and `resolve-planning-depth` § Mid-stage
    re-entry and `adversarial-review`'s exit gate offer § 10.5's top-level shape where the signal's own stage is at
    `high`, with no offer to re-enter higher there (§ 10).
13. **Each review step is in exactly one place.** A step inventory re-derived on the then-current base before landing
    shows every review step from before in exactly one place after; the three review-type methods exist in both copies
    with their recipe dispositions and Configurable entries, and every site in § 11.1 calls its type's method; and every
    item in § 11.5 is fixed (§ 11).
14. **The renames are complete, and nothing stored moved.** No `frontline-review.md`, `standard-review.md`, or
    `self-review.md` remains in either copy; the activation keys, Configurable lists, recipe, generated manifest,
    `arc-checks.yml`, and every § 12.2 reference follow; every § 12.3 literal is unchanged; and `npm run -s lint:md`,
    both type checks, and the test tiers pass (§ 12).
15. **One stored addition.** No stored schema under the review gate, the store, or the operation records gains a field,
    kind, or literal but the optional fix-tag note on the disposition record's lineage node, outside the approved set's
    identity and written once by the approved respond call (§ 10.4); § 4's driver inputs ride only the driver's internal
    request (§ 1.3).
16. **A plain commit after convergence takes a delta check.** On an Errand before and after its pull request, in
    pre-publication once the Candidate checkpoint advances the same Candidate, and on the published singleton: after a
    converged look and a commit at the same base with no merge commit in range, the next pass under `incremental` is a
    local incremental look on `delegated-agent`, whatever the configured rank, scoped from the converged head, outside
    the ceiling and admitted without a selection, and it closes the lane when it converges; complete coverage supplied
    in local prepare's request runs a local complete pass instead, a forced hosted source is refused with a remedy
    naming the delta check, and on the singleton no forced source recovered from an earlier pass reaches the driver. No
    consumer that carries an earlier attempt to the current head accepts the range proof for that leg, so the converged
    look alone never closes the lane at the new head, while the exclusion never blocks the delta check's own attempt at
    its head, and a carry that holds today on another ground still holds. Under `full-final` it runs only on an Errand
    with an open pull request and in pre-publication, never closes the lane, and is followed by § 6.2's arm; the
    published singleton returns the review-applicability stop. The converged look's own head, a moved base, a merge
    commit in range, or a re-rooted Candidate admits none, and the attempt it writes is the one a fix check writes
    (§ 3.5).

## Open Questions

None. Every design question this change raises is settled above; what remains open is implementation detail.

## Amendments

- **A1** — 2026-10-18 — task: let `replayPendingLocalAdmission` admit a clean fix check's complete successor.
  _Supersedes:_ none. _Trigger:_ 4.7 segment. _Work:_ 4.R. _Revalidated:_ pending → 4.7.

---
