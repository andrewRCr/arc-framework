# Draft: review-coverage-cadence — how much each re-review pass re-reads

- **Origin:** [internal] — a `USER-INBOX § Errand` capture taken during `seam-delivery-review` create-spec
  (2026-10-15) from the field evidence of `seam-lifecycle`'s review, then scoped and groomed in a design discussion
  with the Owner on 2026-10-16; minted planned, P1, `Heavy`, and pulled forward beside the storage seam the same day.
- **Purpose:** Decide how much each re-review pass re-reads after fixes — complete passes on a cadence, incremental
  fix checks between them, and a sibling sweep in both — and give code review and adversarial review one pass model,
  so a large `sensitive` change set stops paying a complete pass for every fix round without losing what later passes
  actually find. Widened by the Owner on 2026-10-16: give ARC's review family one operation per review type over that
  model, so each type is named, callable, and navigable (D10).

---

## Continuity

- **Readiness:** formalization-ready, re-assessed 2026-10-16 once the fresh adversarial loop closed. The second
  adversarial pass's fix check found two loci unsettled, and the loop ended `re-entered` to shape them with the Owner:
  coverage choice on every path (D1, D5, D6, D8) and chunking an incremental pass (D3), both settled that day and
  source-grounded by the author. The fresh loop's first pass then found nine, all folded with the Owner's dispositions:
  the fix-response test at an open pull request (D6), the routes that ask the coverage question (D5, D6), the pass after
  a minor-only round (D1, D4, D5), and a bounded check at the existing applicability stops in place of the counted merge
  check (D6). Its first fix-check round found six, folded too: the Candidate's record commit in the fix-response test,
  the singleton's third reader, the bounded check's outcome rule, and a base move after an unchecked fix breaking the
  fix-check chain (D6), with D7's decline rule and the caller inventory; its second through eighth found four, two,
  three, one, three, four, and two in those repairs, folded likewise. After four rounds in a row each found a major
  defect in the last repair to D6's bound-delivery case, that case was narrowed to what this work unit can ground, and
  its ordering against delivery's in-flight corrections was routed to delivery's owner. Before the second pass, each
  finding's `**Fails:**` anchor joined D7 and D10 on the Owner's proposal. The second pass found two, both in earlier
  repairs: the singleton's `coverage-required` arm keyed on `responseRequired`, and the bound-delivery re-ask, which
  source settles (D1, D6); its first and second fix-check rounds found two each in those repairs, folded likewise, and
  the loop closed there. The evidence — `seam-lifecycle`'s pass-by-pass analysis, the prior-art sources with their
  confidence, the hosted-review probes, and the base-movement research — is in `notes-review-coverage-cadence.md`;
  nothing here needs re-deriving.
- **Timing:** pulled forward ahead of the storage program's completion by Owner exception (2026-10-16), past both the
  pull-forward filter's work-unit clause and its before-the-seam clause. The exception holds on one condition: this
  work unit adds no stored record or record shape. Any shape its design turns out to need goes to
  `seam-delivery-review` rather than landing here. It lands ahead of that member's implementation (§ Coordination).
- **Storage forward compatibility:** the design stores nothing new. The convergence rule changes what a derived signal
  means (D1), the next-pass facts are computed (D5), and a complete pass's pointers are composed from records that exist
  (D9). D4 keeps `logicalPass` numbering every finished attempt and derives the ceiling's count from stored coverage,
  passing it to the driver as an internal input that no command request carries, so the review family's write check and
  import take it unchanged. D6's rule is source selection where each next pass is composed, from the terminal signal
  that is already derived. Its check at a base merge informs the applicability selections that exist and is stored
  nowhere, and its removals delete writers, not stored fields. While a delivery is bound, the fix that check prompts
  lands as a correction task under an existing plan revision, through the delivery's own correction route. D7's report
  inputs, the `**Fails:**` anchor among them, ride beside `proposal` as render-only inputs and are never stored. D10
  moves prose and adds and renames methods; it stores nothing, and keeps every stored literal that carries a renamed
  method's name.
- **Runs beside it:** the `review-sibling-sweep` Errand (PR #1028) — `review-triage` searches the reviewed change for
  other instances of each confirmed defect, and the incremental reviewer prompt asks whether each carried finding's
  defect recurs elsewhere in the complete change set. This work unit builds on it rather than repeating it.
- **Settled at the 2026-10-16 grooming:** D1–D7. **Settled at the 2026-10-16 draft-design session:** the convergence
  rule (D1), fix-check numbering, the ceiling's scope, and pass presentation (D4), the bounded next-pass offer (D5), the
  method home and agentic-only scope (D7), the Owner's standing decision (D8), and what a complete pass receives (D9),
  closing open questions 1, 2, 3, 4, and 8; then CodeRabbit's automatic reviews (D6), how fix checks are chunked (D3,
  revised in shaping), and where D9's pointers are composed, closing 6, 7, and 9; then, from the probes on pull request
  #1031, local fix checks with hosted sources on complete passes only, hosted incremental review removed, and the bare
  hosted request (D6, D9), closing 5 and 10; then, at the Owner's direction, the review family's three operations (D10)
  and the names it keeps (D7); then, at the readiness check, `code-review`'s sections and `amend-design`'s pass cap and
  closing delta (D10); then, at source grounding, the merge check in place of the supplemental pass, which the CLI could
  not run (D6), the rename kept at its full footprint (D7), and the mechanism corrections that grounding found in D1,
  D4, D6, and D8; then, in shaping after the second adversarial pass, one coverage question per moment and the agent's
  stop (D5), the singleton's local pass through ordinary local prepare and the delivery re-check (D6), and each pass
  chunked by the range it reviews (D3); then, at the fresh loop's first pass, the fix-response test at an open pull
  request and the bounded check at a base merge in place of the merge check (D6), and the pass after a minor-only round
  (D1); then, at its first fix-check round, a base move after an unchecked fix breaking the fix-check chain (D6); then,
  across its later rounds, D6's bound-delivery case narrowed to what this work unit can ground, with its ordering
  against delivery's in-flight corrections routed to delivery's owner; then, on the Owner's proposal, each finding's
  `**Fails:**` anchor (D7, D10); then, at the second pass and its fix checks, the singleton's `coverage-required` arm
  keyed on convergence, the workflow arms split on response performance (D1, D6), and the Owner's second choice over the
  fixed head at a bound stop (D6).
- **Entry reads (2026-10-16):** `Class` stays `Heavy`. Derivation fired — D1–D9 are authored design — and every
  concept composes from existing ones (adversarial review's fix check, the coverage chain, the terminal signal), so it
  is not `Novel`. Boundary: stays one work unit. The three segments are one concern, the pass model; segment 1 could
  land alone, but delivery is paused and the whole lands as one branch ahead of `seam-delivery-review`'s
  implementation. Re-read after D10 widened the work unit: `Class` stays `Heavy`, since the operations compose
  existing methods, and it stays one work unit with a fourth segment. D10 could follow as its own work unit, but its
  operations carry D1–D6's cadence and D7's model, and segments 1–3 already edit the same review fire-points, so landing
  together rewires them once.
- **Next:** create-spec. Re-confirm `seam-delivery-review`'s §4.3 wording, its folding of D4's numbering, its
  implementation timing, and its answer on D10's renames before the spec is approved (§ Coordination).

## Problem / Motivation

### The rule today

- `classify-review-risk` calls a change `sensitive` when a defect in it could be destructive, authoritative, or
  irreversible. Its list includes admission controls — review and merge gates, required checks, interlocks, and the
  evidence they read — so in this repository most code changes are `sensitive`.
- `reduceReviewRoutingBase` in `scripts/review-gate/policy/routing.ts` routes `sensitive` to `standardReview: required`
  with `retrigger: full-final`.
- Since `c30cfe735` (2026-10-13), `resolveOfferedCorrectionScope` in
  `scripts/review-gate/policy/local-review-coverage-selection.ts` returns no incremental scope under `full-final`, and
  its interaction text says "This route requires complete coverage". The Errand paths agree:
  `resolveErrandHostedCorrection` (`status-errand.ts`) requests complete coverage for any non-incremental route, and
  `errandNextPassCoverage` in `scripts/review-gate/runtime/respond-command.ts` reports `complete`. On those paths every
  pass after a fix re-reads the whole target, however small the fix, and the gate offers no path to a narrower check
  even when the Owner wants one.
- The work-unit path does not apply that cut, locally or hosted. `hosted-reservation-discharge.ts` resolves a
  correction scope from `currentCorrectionScopeCandidate` (`hosted-reservation-support.ts`) without checking
  `retrigger`, testing only that predecessor and current policies are equal, and `coverageSelectionChoices` then offers
  a `delegated-agent` incremental pass, `@coderabbitai review` on CodeRabbit, or a Codex request that Codex's
  `complete-upgrade` setting records as complete. `status.ts` carries that scope into a
  delivery member's local action, and delivery admission skips local coverage selection (`runtime/local-prepare.ts`).
  A `sensitive` work unit is offered fix checks there while the same route forces complete coverage everywhere else.
  Found by reading, not by a run.
- Neither hosted provider re-examines a finding it has already posted, yet ARC records each one's no-findings result
  as clean: Codex's "Didn't find any major issues" as a complete pass (`cleanForHead`, with `request()` returning
  complete coverage, `hosted/codex.ts`), and CodeRabbit's "No actionable comments were generated in the recent review"
  as whichever coverage was requested (`summaryReportsNoFindings`, `hosted/coderabbit.ts`; an incremental result is
  recorded only when its range evidence is established, `recordHostedAwaitAttempt`). A material fix to a hosted finding
  can therefore close the lane unverified, under either retrigger. Found by probes on pull request #1031 (D6).
- A pass converges unless its approved dispositions fix a verified major or critical finding (`fixesMaterialFinding`,
  `scripts/review-gate/core/review-convergence.ts`), so a pass returning only minor findings already completes the
  lane. The cost is in complete passes that keep returning material fixes.
- That is not what `full-final` was designed to mean. The `review-architecture` spec says "`full-final` may use
  incremental passes for feedback, but satisfaction requires a final full review of the settled target".
  `evidence-applicability` later found the value inert — no behavioral consumer read it — and `c30cfe735` gave it its
  every-pass reading.

### What it cost, and what complete passes found

`seam-lifecycle` ran eight complete standard passes over about 17.7k changed lines (326 files, 11 chunks), every one
on the `full-final` route. Its fix rounds changed 2–6% of that. Of 57 findings fixed in passes 2–8
(`notes-review-coverage-cadence.md` has every one):

- 9 sat inside the previous round's fix and 7 within 25 lines of it — both criticals among them.
- 6 sat in an earlier round's fix code that one to five complete passes had already read and passed.
- 21 were siblings: original code, in a defect class an earlier finding had already exposed.
- 14 were new defect classes in original code — 8 in pass 2, 3 in pass 3, 3 in pass 5, and none after.
- Separately, one rejected finding was raised again in each of passes 2–8.

Complete passes earned their cost through about pass 3. After that they mostly found fix-adjacent defects, which an
incremental check covers, and siblings, which a targeted sweep finds more cheaply than a whole re-read. A straight
switch to incremental would have kept only 16 of the 57, so the capture's original approach — route `sensitive` to
`retrigger: incremental` — is an overcorrection on this evidence. The middle ground is a cadence.

The review ended on incremental rounds the gate did not offer: the Owner directed, in conversation, a switch to
incremental review whatever ARC asked, and the agent ran the last two rounds that way, outside the gate. The final
round returned only minor findings.

### Prior art

Practice and research point the same way, but nearly all of it predates agents. Each line says how it transfers to a
reviewer with no memory between passes that catches part of the defects on each run. Sources, confidence, and what
remains unverified are in `notes-review-coverage-cadence.md`.

- **Inspection follow-up** (Fagan; Gilb and Graham; IEEE 1028): the moderator verifies the rework; trivial fixes may
  be accepted, and complicated or critical rework goes back to the team for re-inspection. The often-cited "re-inspect
  above 5% rework" is folklore — a secondary summary of Fagan 1976 reads the 5% the other way, as the band below which
  the moderator may verify alone. Transfer: the fix check is the moderator's verification, and the complete pass is
  the team's re-inspection.
- **Review hosts:** a substantive push resets approval — GitHub dismisses stale approvals, and Gerrit carries votes
  only across changes it can prove are not semantic, such as a trivial rebase — while the re-reviewer works from the
  interdiff. Transfer: the interdiff is safe for a reviewer who remembers the rest of the change. An LLM reviewer does
  not, so the fix check carries that context explicitly (D3), and a complete pass at the settled head closes review
  (D1).
- **Base movement** (Gerrit change kinds, GitHub since June 2023, GitLab `patch-id`, the Linux kernel's tag rules,
  `git range-diff` and `--remerge-diff`). Approval carries across a base move that leaves the change's own diff
  unchanged. A conflict resolution counts as new content: Gerrit treats a conflict-resolving rebase as `REWORK` and
  marks "rebase edits" for re-review, and kernel maintainers explain and show a resolution separately. In one study,
  code that needed a manual conflict resolution was about 26 times as likely to be buggy (Brindescu et al., EMSE 2020;
  an association). Semantic conflicts also arise outside the conflicted lines. LLMs resolve conflicts correctly about
  half the time, and no study of LLMs reviewing a resolution was found. Transfer: the applicability check already
  carries clean moves, and where it stops for the Owner, a bounded check of the resolution and the dependencies across
  its two sides informs the choice (D6).
- **Change impact analysis** (DO-178C, ISO 26262): re-verification is scoped to what a change affects and widens with
  criticality. Transfer: the fix check is impact-scoped, and the `sensitive` route keeps complete passes.
- **Remaining-defect estimation** (capture-recapture: Eick et al. 1992; Briand et al. 2000; Petersson et al. 2004):
  estimates remaining defects from the overlap between inspectors' findings, and underestimates with fewer than four
  inspectors. Repeated runs of one model share blind spots, and fixes change the code between passes, so on LLM passes
  it gives a lower bound at best. No validated stopping rule for repeated LLM review was found; "stop after k quiet
  passes" is untested, and this work unit's pass 4 followed by pass 5 rules out k = 1.
- **Variant analysis** (CodeQL, Project Zero): after one bug, hunt its variants across the codebase; incomplete fixes
  and variants are common. This is the sibling bucket.
- **Test impact analysis** (Google, Meta): run the tests a change affects, with a periodic or pre-release full run as
  the net for what selection misses. This is the fix-check-plus-cadence shape.
- **Repeated LLM review:** findings that match a reference set recur across runs, while about half of the others
  appear in one run of five (Snyk VulnBench); run-to-run overlap is low (SWR-Bench). A different source, model, or
  framing likely adds more than another run of the same one — an inference, not a finding.
- **Priming:** earlier review comments act as reminders for human reviewers — more detection of the flagged defect
  type, no loss elsewhere (Spadini et al., ICSE 2020). LLMs anchor on supplied verdicts, and telling them to ignore one
  barely helps (Lou 2024; Huang et al. 2025); in one preprint a "bug-free" framing cut vulnerability detection by
  16–93%.
- **Instruction literalness:** OpenAI's GPT-4.1 guide says that model follows instructions "more closely and more
  literally than its predecessors", and its GPT-5 guide that contradictory or vague instructions damage GPT-5 more than
  other models; Anthropic's guide says Claude generalizes from the reasons an instruction gives. Nothing found tests a
  split between enforced bounds and advisory considerations directly.
- **AI review tools:** CodeRabbit ships incremental and full review and leaves the choice to the requester; Codex's
  documentation does not say what a repeat review covers. Probed, each reviews the whole pull request but reports only
  what it has not already posted — CodeRabbit's full review included (D6). Copilot "may repeat the same comments".

## Decisions

### D1 — `full-final` means what its name says

Between complete passes, a fix gets an incremental fix check; a complete pass runs at the settled head. `sensitive`
keeps `retrigger: full-final` as its stored value, so this changes behavior, not routing. Two consequences:

- **No transition pass.** `compatibleStandardPolicy` and `resolveOfferedCorrectionScope` compare the predecessor's
  requirement, `retrigger` included, with the current one; they still match, so reviews already in flight keep their
  incremental basis. The capture's flip of `sensitive` to `incremental` would have cost one transition pass.
- **The surface promotions keep `full-final`** with no change to `reduceReviewRouting`'s `sensitive` guard, which the
  flip would have had to reopen.

**The convergence rule.** Under `full-final`, the standard lane completes only on a complete pass at the final head
whose approved dispositions fix no material finding — the `review-architecture` reading. A complete pass the
applicability check carries to the final head counts, as it does today, the Owner's `covered` at an applicability stop
included (D6). Under `full-final`, `deriveVerifiedTerminalSignal`
(`scripts/review-gate/policy/review-policy-evidence.ts`) reports `coverageAdequate` only when the terminal attempt's own
`effectiveCoverage` is complete. So a converged fix check resolves to the policy driver's existing `coverage-required`
state (`review-policy-driver.ts`) rather than `pass-complete`. An unconverged one lands there too, because the driver
reads coverage before the material fix; its response still runs before the next pass. The payload's `responseRequired`
says only that the terminal had findings, settled or not: the driver sets it from the last attempt's outcome before it
reads `terminalResponseSettled`, and `projectReviewPolicyAttempt` (`review-policy-attempt.ts`) folds `settled-findings`
into `findings`. So it separates neither a converged look from an unconverged one nor a pending response from a
performed one, and `continuationChoice` (`review-policy-evidence.ts`) already pairs it with whether the response was
performed. The composition splits on whether the last look converged, which the next-pass context reads (D4): after a
converged look, a clean one included, it re-resolves to the complete pass with the source D6's rank picks once any
response the terminal requires is performed (below; D8); after an unconverged one, it surfaces `coverage-required`. A
workflow arm cannot read that context and follows the driver's typed state (`run-errand.md`), so the arms that handle
`coverage-required` split on response performance instead, which lane progress records (`settled-findings`): while the
response is unperformed, which a converged fix check with minor fixes also reaches, they enter the disposition protocol;
once it is performed, the next pass goes to ordinary local prepare off the delivery path, which asks the coverage
question, and to status's selection on it, after which local prepare does not ask again (D5). `run-errand`'s resolve
dispatch has no `coverage-required` arm (`run-errand.md`), so it gains that one. Under `incremental`, the coverage chain
(`resolveIncrementalCoverageBasis`, `incremental-coverage-basis.ts`) keeps deciding adequacy as today.

- **One derivation, every path.** The signal is derived centrally, so the local, Errand, and work-unit paths inherit
  the rule; that is D6's parity. One reader predicts convergence on its own and changes with it:
  `projectFixConsequence` (`respond-command.ts`) tells a delivery member that approving minor fixes closes the lane
  ("moves the head without another standard pass"), which a fix check under `full-final` no longer does.
- **Meaning, not shape.** Before the flip, the field rides the resolve envelope the integration boundary stores, in
  two places (`CandidatePolicyReviewBoundarySchema.policy` and `CandidateFixBoundarySchema.policy`,
  `integration-boundary-locus.ts`). `seam-delivery-review` drops the stored envelope and recomputes it through the same
  derivation (its §9.1; confirmed with that session on 2026-10-16, and the second copy sent with the source grounding).
- **After a converged look, any next pass is complete, and nothing asks.** Under `full-final`, once a look converges —
  a fix check, or a complete pass whose minor fixes still need a pass, as an Errand's do after any fix
  (`projectFixConsequence`, `respond-command.ts`) — complete is the only coverage that can converge the lane, so the
  CLI admits the complete pass instead of stopping for a selection with one sensible choice: the next-pass context
  (D4) reads the predecessor as converged, the composition re-resolves as if complete were selected
  (`continuationChoice`, `review-policy-evidence.ts`), and D6's configured rank picks the source. No fix check is
  offered there, since one would re-read at most minor fixes that the complete pass reads anyway. Under `incremental`,
  the pass a subject still needs after a converged look is a fix check, as today. The Owner's alternative is the stop
  (D8), and D5 says when the agent asks for it.

**Where the savings come from.** In `seam-lifecycle`, 6 of the 7 later complete passes found a material defect that
neither a fix check nor a sweep targets — a new defect class, or a defect in earlier fix code; pass 6 was the
exception. Under this rule each such pass still calls for another complete pass. The rule saves complete passes two
ways: fix checks catch fix-adjacent defects and siblings before the next complete pass, and if fix checks also catch
defects in fix code — they read exactly that code, but this is untested — the complete passes would have converged
around pass 6 rather than past pass 8. Beyond that, the relief is the Owner's stop, which D5 informs and D8 keeps
available. The notes' counterfactual "complete through pass 3, then incremental plus a sibling sweep" reaches its 20 of
27 only through that stop.

Rejected:

- **Route `sensitive` to `incremental`** (the capture's approach) — it drops the complete passes that found 14 new
  defect classes, with nothing in their place.
- **A complete pass after the last new-design fix, then fix-check convergence.** The new classes found in passes 2, 3,
  and 5 sat in original code unrelated to any fix, so a rule keyed on the kind of fix cannot see them; it keeps only
  the incremental-plus-sweep figure, losing 20 findings, 14 of them major or critical. A variant gated on "the last
  complete pass found no new class and its fixes were local" would have stopped after pass 4 and missed pass 5's two
  majors, putting an unvalidated threshold into an admission control.
- **Recommendation and Owner decision only.** It makes `full-final` identical to `incremental` at the gate for the
  class most worth protecting, and a converged fix check does not establish what a complete pass does: fix code
  outlived one to five complete passes.

### D2 — Every fix check sweeps for siblings

A fix check asks, for each finding it re-examines, whether the same defect recurs elsewhere in the complete change
set. Triage does the same before approval, so an approved fix covers the class. `review-sibling-sweep` ships both
halves for today's incremental pass; this work unit carries the sweep into the fix check's rubric (D3) and the shared
model (D7).

### D3 — A code-review fix check composes adversarial review's fix check

`adversarial-review`'s fix check is an independent review of the folds, outside the pass cap, offered beside the
disposition set and declinable, in rounds that each check the previous round's repairs. A code-review fix check is
that procedure over code review's existing incremental attempt. It is the moderator's verification of rework
(§ Prior art), and it carries explicitly the context a reviewer with no memory of the earlier passes lacks:

- **From code review:** the correction scope and its basis head, and re-examination of every earlier material finding
  at its locus (`buildIncrementalCorrectionScope`, `localReviewerInstructions`). It always runs locally, on
  `delegated-agent`, whichever source ran the pass before it, because only the local reviewer takes ARC's instructions
  (D6). The local path already accepts a hosted pass as its predecessor (`standardPredecessorSourceId` and
  `resolveOfferedCorrectionScope`, `local-review-coverage-selection.ts`).
- **From adversarial review:** the four rubric axes — closure, behavioral grounding, propagation and completeness (the
  sweep, D2), and new failure — and the offer, decline, and round rules.

**A pass is chunked by the range it reviews.** A fix check is chunked like any pass when its own range is large, as
`review-chunking.md` already prescribes: its change set runs from the predecessor head to its head, the earlier range
stays covered by the coverage chain, and each carried finding is re-examined in the chunk whose scope holds its locus,
or in the seam. Chunked scope with incremental coverage is already admitted, stored, and replayed
(`DeliveryLocalReviewSelectionShape`, `delivery-local-review-admission.ts`), so nothing narrows. Size never trades a
fix check for a complete pass: the fix range's size against the target stays one of D5's facts, and it informs only
what follows converged fix checks (D7). This settles open question 7, revised with the Owner on 2026-10-16. The chunk
gates in `integrate-work-unit` and `deliver-stack` keep their rule; what they read changes (below).

What changes is the range the measure counts. Both measures count the whole target today:

- on the delivery path, status measures `baseRevision..headSha` after coverage is chosen but without it
  (`resolveDeliveryMemberScopeSelection`, `status-delivery-scope.ts`, called from `status-composition.ts`), so every
  fix check on a large member is chunked, and the source-less route applies that automatically;
- elsewhere, the agent runs `arc review changeset resolve -` (`resolveReviewChunkingCommand`,
  `review-chunking-command.ts`) over the envelope's target, `diffBaseSha..headSha`, before local prepare offers
  coverage.

The measure runs once the pass's coverage is known, over the range the pass reviews:

- **On the delivery path,** status passes the chosen coverage and its correction scope to the measure, which counts
  `predecessorHeadSha..headSha` for a fix check and the whole member for a complete pass. Local prepare's re-check
  (D6) measures the same way. The agent's `changeset resolve` runs on delivery only at materialization, over each
  member before its push gate (`deliver-stack.md`'s candidate preparation), which is a first pass's range. After a
  fix, the review-fix continuation (`arc delivery review-fix continue -`) returns to `arc review status` with no
  measure between; `deliver-stack.md` says later movement "requires another exact check" but names no step that runs
  it. Status's own measure is that check, and `deliver-stack.md` says so in place of that sentence. The chunk gate in
  `deliver-stack` and `integrate-work-unit`'s delivery route then reads one measure at a moved head, taken after the
  coverage choice. An agent-run whole-member check there would return `consider-chunks` on a large member, and the
  gate would refuse status's whole-target fix check.
- **Off it,** local prepare asks before it admits or stores anything (`settleLocalPreparation`,
  `runtime/local-prepare.ts`), so the workflow measures after the pick and before the call that carries it.
  `changeset resolve` takes the two commits verbatim (`resolveMemberCoordinates`, `hosts/local/repository-target.ts`),
  so for a fix check the request names the correction scope's `predecessorHeadSha` as `diffBaseSha`, and the command
  needs no new field; a probe on this branch measured a one-commit range at 52 lines and 5 files, as `git diff` counts
  it. The result's target is then the fix range, with its own `targetId`, so for a fix check the gate's "exact target"
  is that range; no check binds it to the review target, since the gate is workflow-only and local prepare takes its
  scope separately. The delivery-binding lookup that a tripped result with unavailable evidence falls back to
  (`resolveReviewChunkingCommand`) reads only the target's kind and head and the work unit
  (`delivery-binding-lookup.ts`), so it resolves a fix range as it would the whole target. The scope chosen then rides
  into local prepare as `policyJudgment.scopeMode` and into the procedure's `--lanes`. `prepare-work-unit` and
  `integrate-work-unit`'s singleton route say so. Today `prepare-work-unit`'s `ready / local-prepare` arm carries no
  scope, so local prepare runs whole-target whatever the gate chose, and the mismatch surfaces only at the next
  procedure call (`ReviewProducerScopeMismatchError`). The published singleton gains the measure it lacks:
  `integrate-work-unit`'s chunk gate refers to a result nothing in that step produces.
- **A first pass,** with no predecessor, measures the whole target, as today.

The bounded check at a base merge (D6) is not a pass and is never chunked. It reads a residual the applicability check
already bounds at 200 paths and 16 KiB of path text (`MAX_EVIDENCE_APPLICABILITY_PATHS` and
`MAX_EVIDENCE_APPLICABILITY_PATH_BYTES`, `lib/evidence-applicability/schema.ts`), and a complete pass the Owner's
choice sends the lane to chunks normally. An Errand stays unchunked (`run-errand.md`).

**When coverage changes at one head, scope follows the new pass.** One request carries one scope; the continuation's
terminal binding requires it to equal the terminal producer's (`ReviewProducerScopeMismatchError`,
`review-policy-evidence.ts`), and the fresh resolve reuses the request (`resolveEvidenceBoundReviewPolicyContinuation`).
So a complete pass after a clean fix check at the same head inherits the fix check's scope, a step D1 makes usual and
the coverage-aware measure makes differ. The continuation binds the terminal with the terminal's recorded scope and
resolves the successor with its own, the same split as D6's two source lists.

No new attempt kind, admission path, or record. It would become new machinery — the kind
`review-orchestration-right-sizing` exists to cut — if the fix check got its own attempt kind, counter, or
authorization records; that is out (§ Scope).

### D4 — The pass ceiling counts complete passes

The ceiling bounds discovery passes only. Its count derives from the outcomes' stored `effectiveCoverage`, so nothing
new is stored. Fix checks sit outside it, bounded as adversarial review bounds its rounds: no round cap, each round
approved. The approval rides the fix round's complete-set disposition approval ("approve these fixes, then fix-check
them"), composing with the queued Errand for one approval per review-fix round rather than adding a stop.

This changes the counted unit. Today `completedPasses` counts every finished pass, an incremental one included; under
D4 a finished incremental fix check is not counted, and only passes whose `effectiveCoverage` is complete are.
`seam-delivery-review` took the coordination into its spec (Owner, 2026-10-16): its §4.3 derives a lineage's pass
count in each lane from its stored outcomes "as the lane's pass policy counts them", and its §5.1 `extra-pass`
(`passCount`) and §5.5 consumption follow that count, so both follow whatever count this policy derives — and under
§5.5 a fix check spends no `extra-pass` decision.

- **Numbering.** `logicalPass` keeps numbering every finished attempt in a lane and lineage, fix checks included, so
  `validatePassCounts` (`core/lane-progress-state-validation.ts`) still holds one finished outcome per logical pass,
  and `seam-delivery-review`'s write check (its §4.8) with it. The ceiling's count is a separate, derived number: the
  finished passes whose `effectiveCoverage` is complete. Lane progress already derives it as `completePasses`
  (`countCompleteLogicalPasses`, `lane-progress.ts`), and a superseding Candidate already inherits it beside the
  finished-pass number (`readCandidateInheritedLaneProgress`, `lane-progress-supersession.ts`). It is the standard
  lane's ceiling; the frontline lane's ceiling and numbering are unchanged. Suggested by `seam-delivery-review`, whose
  import copies stored `logicalPass` values as they are (its §11.2).
- **Each number where it belongs.** A site that numbers or binds an attempt keeps `logicalPass`:
    - the next number the driver assigns (`completedPasses + 1`, `review-policy-driver.ts`);
    - lane progress's admission (`buildLaneAttempt`, `lane-progress.ts`) and the hosted admission's own numbering
      (`lane-progress-hosted-request.ts`);
    - the evidence binding (`validateTerminalResult`, `review-policy-evidence.ts`), which pins the request's
      `completedPasses` to the terminal producer's `logicalPass`;
    - `resolveOfferedCorrectionScope`'s predecessor match;
    - the conditional-pass authorization's producer and consumer bindings: `requireCaptureProducer`
      (`lane-progress-conditional.ts`), `validateAuthorizations` (`core/lane-progress-state-validation.ts`), the stored
      `ConditionalPassAuthorizationSchema` refinement that `nextPass` is `exhaustedPassCount + 1`
      (`core/operation-state-schema.ts`), and `bindConditionalPendingAdmission`;
    - the grant and extra-pass bindings, `compatibleTerminalGrants` (`review-policy-evidence.ts`) and
      `invalidAdditionalPassReason` (`review-additional-pass.ts`);
    - a ceiling override's `exhaustedPassCount`, which must equal the conditional authorization's
      (`respond-command.ts`).

  `exhaustedPassCount` keeps its stored meaning, the producing attempt's `logicalPass`. That stays sound because an
  authorization binds the attempt right after its producer, which `requireCaptureProducer` checks by number and not by
  coverage, and a ceiling decision arises only when that attempt is a complete pass (below). A comparison against
  `review.standard_max_passes`, or a decision whether an override is needed, reads the complete count. The rule applies
  per comparison, not per function, since some functions do both. Grounding found:
    - the driver's `approval-required` and `ceilingOverrideApplied`;
    - `resolveInvalidOverrideReason` (`review-policy-driver.ts`) and `missingHistoricalResultObligation`
      (`status-errand.ts`), which also bind an override's attempt numbers;
    - `composeDeliveryReviewObligation` (`status.ts`), which blocks a member when its own ceiling read disagrees with
      the driver's;
    - `candidateContinuationRequest` and `verifyCandidateAdditionalPassPredecessor`
      (`hosted-reservation-admission.ts`);
    - the provisional assessment's `capPosition` (`projectProvisionalPassAssessment`, `respond-command.ts`, with its
      refinements in `core/provisional-pass-assessment.ts`).

  The spec re-derives that inventory and classifies each comparison by this rule.
- **An internal input, never on the command request.** The command request carries only `completedPasses`
  (`ReviewPolicyRequestBaseShape`), and it is stored: each approved disposition's lineage node keeps the whole request
  (`ApprovedDispositionLineageNodeSchema.responsePolicyRequest`, `core/advisory-records.ts`), as does
  `seam-delivery-review`'s §6.4 snapshot. So the complete count, `completePasses`, joins `sources` and `maxPasses` as
  an internal driver input (`ReviewPolicyRequestSchema`, `review-policy-driver.ts`), carried by the next-pass context
  below. The agent never supplies it, so `run-errand.md`'s hand-built request is unchanged. No stored record, command
  request, or resolve-envelope payload carries it.
- **One next-pass context, computed once per composition.** Every composition that builds the driver's request derives
  three facts from stored records:
    - the complete count (above);
    - the predecessor's convergence, which D6's source selection reads;
    - whether a fix check is admissible: the correction scope `resolveIncrementalCorrectionScope`
      (`incremental-coverage-basis.ts`) resolves for the next attempt, which under `full-final` follows only an
      unconverged look (D1), or none.

  One shared helper computes them, and the driver takes all three as internal inputs. It replaces a mechanism per site,
  so every composition reaches the same answer from the same records. Grounding found these compositions, and the spec
  re-derives the list:
    - the Errand's continuations (`status-errand.ts`, `nextErrandPassObligation` among them);
    - `arc review resolve -` (`resolveConfiguredReviewPolicy`, `handlers/review.ts`), the Errand's main resolve and
      the ordinary singleton's continuation (`integrate-work-unit.md`), which today adds only `sources` and
      `maxPasses` and reads no lane progress. It takes the context from the request's lineage: the Errand claim's lane
      progress, as Errand status does, or the Candidate's;
    - local prepare (`runtime/local-prepare.ts`, `runtime/local-prepare-composition.ts`);
    - the discharge's request context and its `resolveTerminalPolicy` (`hosted-reservation-discharge.ts`);
    - the hosted reservation admission (`resolveEvidenceBoundHostedReservationPolicy` and
      `resolveEvidenceBoundSingletonHostedReservationPolicy`, `hosted-reservation-admission.ts`), which
      `status-composition.ts` and `status-singleton.ts` call for `status.ts`'s delivery and singleton routes;
    - `pre-publication-request.ts` and `pre-publication-composition.ts`;
    - `respond-composition.ts`;
    - the capacity-spend admission in `handlers/review.ts`.

  `scripts/integration/checkpoint-composition.ts` is not among them. It copies lane progress's `completedPasses` into
  the discharge for the terminus binding (`terminus.completedPasses === discharge.completedPasses`, `status.ts`),
  which binds an attempt and so stays on `logicalPass` (above).
- **The ceiling decision follows coverage selection.** Today each composition resolves policy before coverage is
  chosen, so at the ceiling the driver stops at `approval-required` even when the next step is a fix check, and an
  override granted there would be spent by the fix check. Local prepare's continuation
  (`runtime/local-prepare-composition.ts`) and the Errand's `nextErrandPassObligation` do this, and `status.ts`'s
  singleton and delivery routes return the admission's `approval-required` before any coverage step
  (`composeSingletonRequest`; the delivery route's `requestAdmission`). The ceiling applies only to a complete pass:
    - at the ceiling, when the next-pass context finds a fix check admissible, the driver returns the coverage
      choice, not `approval-required`;
    - choosing a complete pass there needs the ceiling override or an extra pass, so an override always binds to the
      complete pass that uses it, and a fix check never spends one (`seam-delivery-review`'s §5.5);
    - the chosen coverage reaches the driver as an internal input beside `completePasses`;
    - `projectFixConsequence` reports a ceiling decision only when no fix check will be admissible. It runs on the
      first `arc review respond -` call, before any fix exists, when no correction scope can resolve yet
      (`buildIncrementalCorrectionScope` requires a performed response), so it tests predictively: the lane's chain
      to this pass is adequate and the route runs a local fix check.
- **The ceiling counts complete passes only.** `review.standard_max_passes` bounds how many complete passes run on
  disposition approvals alone before the Owner makes an explicit decision to spend more. Fix checks get no cap and no
  configuration: each runs only after an approved, performed response that fixed something — under `full-final`,
  one that fixed a material finding (D1) — so every round already has its Owner approval. The CLI enforces that bound
  (D5): today `buildIncrementalCorrectionScope` also admits an incremental pass after a clean one, because
  `readIncrementalPredecessorResponseEvidence` reports a clean predecessor as performed. The bound lands in that
  producer, never in the reader, which the coverage chain's walker also asks about every earlier link. Fix-check spend
  stays visible as D5's fact of rounds since the last complete pass.
- **No extra-pass decision for a fix check.** A fix check cites no `extra-pass` decision; the approved disposition set
  it verifies admits it. The `approved-fix` extra pass stays a complete-pass mechanism, offered only when the next
  step is a complete pass past the ceiling; when a fix check comes first, the complete pass that follows takes a
  ceiling override if it is past the ceiling. Each decision then sits beside the head it binds instead of surviving
  later fix rounds. Under `seam-delivery-review`'s §5.5, a fix check citing the decision would have spent it.
- **Presentation follows D7's vocabulary.** A pass, in anything the Owner reads, is a counted complete pass shown
  against the ceiling ("complete pass 3 of 2, one past the ceiling, approved"); a fix check is reported in rounds
  since the last complete pass ("fix check, round 2 since pass 3"), each with its result. `logicalPass` stays
  internal, an attempt number never shown as a pass. Typed fields that carry the attempt number keep their shape and
  meaning: `pass` in the driver's payloads and the delivery member's local action, `admittedLogicalPass` and
  `configuredMaxPasses` in the provisional assessment (`core/provisional-pass-assessment.ts`), `consumedPass` and
  `completedPasses` on the coverage selection actions (`core/local-review-coverage.ts`, `review-coverage-selection.ts`),
  and `DeliveryReviewMemberProgressSchema`'s counts (`status.ts`), which already expose `completePasses` beside
  `completedPasses`. Text that renders them, or counts every pass, changes:
    - the response summary (`respond-command.ts`, "pass N of M" from `admittedLogicalPass`);
    - `fixConsequenceText` ("needs standard pass N");
    - both Errand status counts (`status-errand.ts`, "N of M configured standard-review passes", and
      `readErrandRoutedObligation`'s);
    - the local selection text's "Either consumes one pass" (`local-review-coverage-selection.ts`);
    - the ceiling-override consequence (`review-policy-driver.ts`, `status-errand.ts`,
      `hosted-reservation-admission.ts`);
    - the hosted failure diagnostic (`lane-progress-hosted-request.ts`, "hosted pass N");
    - "A completed attempt consumes that pass", in `run-errand.md` and `integrate-work-unit.md`, and "durable lane
      progress consumes the admitted pass", in `integrate-work-unit.md` and `deliver-stack.md`;
    - `prepare-work-unit.md`'s "An incremental choice still spends one logical pass", the workflow twin of the local
      selection text;
    - the `arc-config.yml` ceiling comment in both copies.

  Grounding found these; the spec re-derives the list.

### D5 — The next-pass offer: bounds, facts, and judgment

A recommendation, never a gate; the Owner decides, and the recommendation is clear either way, at the cap included.
The emitted offer keeps three layers apart:

- **Bounds — the CLI's, enforced.** The closed set of next steps that exist:
    - after a look whose approved fixes include a material one, a fix check, local (D6), offered first. A local
      complete pass stays admitted, as `coverageSelectionChoices` (`hosted-reservation-support.ts`) offers both today
      and D8 lets the Owner run one, and the offer says it does not replace the fix check (D7). Where the fix check's
      chain does not prove, a local complete pass is the only next step;
    - after a converged look, where the subject still needs a pass: under `full-final` a complete pass, which the CLI
      admits without a selection (D1), or the Owner's stop; under `incremental`, a fix check;
    - the ceiling on complete passes and its override;
    - the approval each needs.

  Bounds bind the agent, never the Owner (D8).
- **Facts — the CLI's, computed, stored nowhere new.**
    - complete passes run, against the ceiling;
    - fix-check rounds since the last complete pass, and their results;
    - the fix range's size against the target;
    - whether the chain is proven;
    - two observable signals of new design, per fix round: a round that changes code outside its findings' cited loci,
      and a round that adds files;
    - the material trend: the lane's looks in order, each labeled a complete pass or a fix check with its result,
      from lane progress (`effectiveCoverage`, a clean outcome included, since a clean look writes no disposition
      record), and each look's verified material count from its disposition records (`listDispositionRecords`,
      `core/ports.ts`) plus the proposed set, which is marked provisional.

  No record ties one fix to one finding, and loci are free text, so both signals are computed per round, with the
  loci read as heuristics.
- **Judgment — the agent's, labeled advisory.** It applies once the fix checks have converged, and chooses what
  follows them: recommend another complete pass while complete passes still find new defect classes in code earlier
  passes read, or when a fix round was new design rather than local correction; otherwise recommend stopping. It never
  weighs a complete pass against the fix check itself (D7). Weigh a complete pass from a different source over another
  run of the same one. The agent states its pick, its reasoning, and what would change it.

**Where the Owner hears it, and when the agent stops.** The ceiling (D4) is the one spend lever: complete passes under
it run on disposition approvals alone, the complete pass after converged fix checks included. A stop before each would
void the ceiling for the passes it exists to authorize. So the recommendation rides the stop that already exists.
Every fix check follows an approved response, and a converged fix check with minor findings ends at their disposition
approval, so the report (D7) states the next pass and the recommendation where the Owner already decides; an Owner who
answers "stop" there needs nothing more. The agent adds a stop in one direction only: when its judgment recommends
stopping, it asks before the pass spends, since stopping short of `full-final`'s rule is the Owner's call (D8). That
stop arises only after a clean fix check, which has no disposition approval, and it can only lower spend below what the
ceiling authorizes, never raise it. At the ceiling the agent stops and recommends, as `adversarial-review`'s cap
recommendation does. Settled with the Owner on 2026-10-16.

The CLI computes no verdict. The inputs are judgment and no validated stopping rule exists, and a computed
recommendation is what a literal-reading model carries out as a rule. The emitted text states the allowed steps once,
in plain words, before the considerations; gives each consideration its reason and the condition under which it
favors an option; and ends by asking for the recommendation. `localCoverageInteractionText`
(`local-review-coverage-selection.ts`) already has the bounds-plus-considerations shape inside local prepare, which an
Errand's local pass reaches too (`runtime/local-prepare-composition.ts`). The work-unit path's selection prompt
(`hosted-reservation-discharge.ts`) has no considerations, so the text is new there.

**One question per moment, each asked once.** The coverage question arises at two moments, and neither needs a new
surface:

- **After material fixes**, at the fixed head, the next pass is local (D6) and takes a fix check or a complete pass.
  Off the delivery path, local prepare asks, as it does today (`resolveLocalReviewCoverageSelection`,
  `local-review-coverage-selection.ts`). It fires on the driver's `ready` once an earlier terminal pass sits at another
  head, it already holds the Errand's and the Candidate's lineage, and the pick it takes is the `coverageAdmission` it
  already stores. The Errand before and after its pull request, pre-publication, and the published singleton (D6) all
  reach it. On the delivery path, status asks once, and the pick rides `deliveryAdmission` into local prepare, which
  then does not ask again (`resolveSettlementPolicyAdmission`, `runtime/local-prepare.ts`). Today the discharge builds
  that selection (`ReviewCoverageSelectionActionSchema`, `hosted-reservation-discharge.ts`) only at the driver's
  `coverage-required`. After a complete pass with material fixes it returns the next source and the correction scope
  with no selection, and status defaults to complete (`status.ts`), so nothing asks. The discharge therefore emits the
  selection whenever a correction scope resolves after material fixes, and the complete default stands otherwise. D6
  narrows the offer to `delegated-agent`.
- **After a converged look** under `full-final`, the next pass is complete (D1), and nothing asks: the CLI admits
  it with the source D6's rank picks. Local prepare's selection and the discharge's admit complete without emitting a
  selection when the next-pass context reads the predecessor as converged. Local prepare's one-choice stop
  (`localCoverageInteractionText`) then arises only where a fix check's chain fails, and its text there tells the agent
  to check why, so it stays.

What is missing is the workflow arms: no workflow names `coverage-required`, `select-coverage`, or `run-review` today.
`run-errand`, `prepare-work-unit`, and `integrate-work-unit`'s singleton route gain an arm for local prepare's
selection, and `deliver-stack` and `integrate-work-unit`'s delivery route one for status's. Each shows the choices with
the text above and the recommendation, takes the Owner's pick, and re-runs with it. A selection admits only a listed
choice (`resolveLocalReviewCoverageSelection`, `selectReviewCoverageChoice`); where status re-emits the selection
silently because `--source` and `--coverage` match no choice (`status-composition.ts`), it refuses instead. The resolve
envelope keeps its shape, since the boundary stores it until `seam-delivery-review`'s §9.1 drops that copy, and
nothing new is stored. D5's text replaces the delivery prompt (`hosted-reservation-discharge.ts`), which today names a
`--json` flag that `review status` rejects (`cli.ts`) and always names `--work-unit`, whatever route reached status.
Settled with the Owner on 2026-10-16, in place of a selection emitted on every path, which had no subject for an
Errand before its pull request and asked the Owner twice where local prepare also asks.

This is adversarial review's re-inspection test carried to code lanes, and it gives code review the cap
recommendation `adversarial-review` already states. Whether a fix was new design stays the agent's judgment, informed
by the observable signals; no tag is stored, which closes open question 3. Unverified residual: D3 and D5 change
judgment-layer behavior that no eval instrument covers yet (`workflow-eval-harness`), and the text pattern is untested
across model families.

### D6 — Fix checks run locally; hosted sources run complete passes

Hosted review follows D1 through the shared derivation. What changes is which passes a hosted source runs.

- **After an unconverged pass, the next pass is local.** When a pass's approved fixes include a material one, the next
  pass runs on `delegated-agent`, whichever coverage it takes: D5 offers a fix check first where its chain is proven,
  and a local complete pass is the only option where it is not. The chain fails when ARC cannot prove what changed since
  the reviewed head or that the earlier review still applies (`resolveOfferedCorrectionScope` and
  `resolveIncrementalCorrectionScope`): the routed obligation changed, the lane subject changed, the fixes have no
  recorded approved response, or the range holds more than fixes, as after any base merge or history rewrite since the
  reviewed head (below). A fix check over an unproven range could miss changes. A hosted source runs a complete pass
  only as a lane's first pass or after a pass that converged — under D1, the complete pass after a converged look, at
  the settled head. Every other selection keeps the configured rank order.
- **Where the rule applies.** The driver cannot derive it on its own. It reads the terminal signal only to classify
  the terminal attempt, and every composition that picks the next pass's source re-resolves without that signal, the
  continuation's fresh resolve (`resolveEvidenceBoundReviewPolicyContinuation`, `review-policy-evidence.ts`) among
  them. These are D4's compositions, `arc review resolve -` included, and D4's next-pass context hands the driver the
  predecessor's convergence at each. The driver's source selection then restricts to `delegated-agent` after an
  unconverged pass, and otherwise takes the configured rank. `sources` stays the configured list: the continuation
  validates the terminal attempt against that same list (`bindReviewPolicyEvidence`; `validateConfiguredAttempts`,
  `review-policy-driver.ts`), so narrowing it would reject a hosted terminal attempt with findings, the case the rule
  exists for. Two other paths pick the next source, and the same fact reaches both:
    - a forced source (`invocation.mode === "force"`), which today needs only to be configured
      (`review-policy-driver.ts`): after an unconverged pass the driver refuses a forced hosted source, with a remedy
      naming the local pass, since the Owner waives re-examination by stopping, not by choosing another source (D8);
    - the work-unit coverage offer, which `coverageSelectionChoices` builds from the discharge's configured
      `reservation.sources` (`hosted-reservation-discharge.ts`): after an unconverged pass the discharge passes it
      `delegated-agent` alone, so the offer never lists a choice the driver would refuse.

  When `delegated-agent` is not configured, both paths end at the stop below, with its remedies, rather than at an
  offer or a remedy naming a local pass that cannot run; an empty offer would also fail its schema
  (`ReviewCoverageSelectionActionSchema`'s `choices`, `review-coverage-selection.ts`). The Errand path's own ordering
  gives way to the driver's restriction, or the alternation below fails. Today it puts the source that reviewed the
  earlier head first while that source stays configured (`nextErrandPassObligation`, `status-errand.ts`;
  `errandNextPassCoverage`, `respond-command.ts`), and the same-head resolve passes a terminal-first list even when
  that source is no longer configured (`resolveErrandLaneAtHead`, `status-errand.ts`). The continuation uses one list
  for two jobs, binding the terminal (`bindReviewPolicyEvidence`) and choosing the fresh resolve's source
  (`resolveEvidenceBoundReviewPolicyContinuation`, `review-policy-evidence.ts`), so it takes them as two inputs. The
  binding list stays terminal-first on the Errand, so a terminal from a source no longer configured still binds
  (`validateConfiguredAttempts`). The selection list is always the configured list, which the restriction narrows;
  "`sources` stays the configured list" above is its rule. After a converged pass the fresh resolve therefore takes
  the configured order, and a hosted source can run the complete pass.
- **A fix proves its range at an open pull request too.** Before a pull request exists, an Errand's and a private
  Candidate's fix check prove each leg by the approved response that produced the head
  (`confirmErrandFixResponseApplicability` and `confirmPrivateCandidateCorrectionBasis`,
  `local-review-coverage-selection.ts`). Once one exists, four callers prove a leg by contribution applicability alone
  (`confirmNonDeliveryIncrementalApplicability`): local prepare's confirmation (`createLocalContributionConfirmation`,
  `runtime/local-prepare-composition.ts`), the `arc review resolve -` handler's (`handlers/review.ts`),
  `respond-composition.ts`, and `pre-publication-composition.ts` once a change request is open. The singleton's
  discharge does the same through `projectEarlierReviewApplicability` (`earlier-review-applicability.ts`), whose
  fix-response test is delivery-only (`verifiedDeliveryMemberFixResponse`). A fix commit changes reviewed code, so
  that proof returns `review-required` or `unavailable`, and no fix check after a hosted pass at an open pull request
  could prove. Under `incremental` that is a regression: today the Errand's hosted correction proves the leg
  (`fixProducedHead`, `status-errand.ts`).

  So all five prove a leg that holds a fix by the performed-response test: at an unchanged diff base, the predecessor's
  approved response was performed from its head and produced the current head (`readLaneResponsePerformance`,
  `lane-progress.ts`). That is `fixProducedHead`'s test, which `confirmErrandCorrectionPredecessor` already composes for
  the Errand's status, so it outlives the hosted correction D6 deletes (below). On a Candidate a record commit follows
  the fix: `persistCandidateResponse` (`respond-command.ts`) records the fix commit as the produced head and stages the
  Candidate record, which `prepare-work-unit` commits next. There the test also accepts a later head whose Candidate
  subject digest equals the fix head's. The digest leaves out the record and boundary (`candidateProjectionPaths`), the
  work unit's own planning artifacts, and the project documents `classifyPathTreatment` marks non-reviewable
  (`lib/evidence-applicability/path-treatment.ts`), so commits that touch only those carry no reviewable change. The
  pre-publication path proves a correction the same way, for a historical leg too
  (`confirmPrivateCandidateCorrectionBasis`); `confirmCandidateResponseHeadContinuation`
  (`candidate-response-head-continuation.ts`) proves one record-only commit only while it is the checked-out head, so it
  does not serve. Each leg is tested against the head that follows it, since the coverage chain re-confirms every
  earlier leg on each round (`resolveCoverageChain`, `incremental-coverage-basis.ts`). Once a record write is no commit
  (`seam-delivery-review`'s §14.3), the record commit no longer follows a fix, but the allowance stays: that member
  keeps a commit after a fix's response for the spec copy (its §12.5), and any commit with no reviewable change passes
  the same way. A leg that holds a fix and fails the test breaks the chain (below). Read from source, not yet run;
  Owner-approved 2026-10-16.
- **A published singleton runs its local pass through ordinary local prepare.** Today the driver's
  `ready / local-prepare` for a published singleton becomes a bare `review-required` (`composeSingletonRequest`,
  `status.ts`) whose `run-review` next action no workflow dispatches. The local action (`localAction`,
  `DeliveryLocalReviewSelectionSchema`) is delivery-only, and local prepare stores it once admitted
  (`deliveryAdmission`, `core/operation-state-schema.ts`). D6 makes a local pass mandatory after every unconverged
  hosted pass, so the singleton route instead names an ordinary `arc review local prepare -` request with no member
  selector, which reviews the work-unit branch (`LocalPrepareRequestSchema`, `runtime/local-prepare.ts`), and
  `integrate-work-unit` gains an arm for it in place of `run-review`. The status projection that names it is stored
  nowhere. Local prepare resolves the Candidate lineage from the submission boundary (`resolveLineage`,
  `runtime/local-prepare-composition.ts`), the lineage under which the singleton's discharge reads lane progress
  (`hosted-reservation-discharge.ts`), so the local pass continues the singleton's lane, and it asks the coverage
  question itself (D5). Three readers change, each of which today takes a local result only with a `deliveryAdmission`:
    - the discharge's recognition of an admitted local terminal (`admittedLocalTerminal`);
    - its naming of a local predecessor's source (`confirmIncrementalPredecessorApplicability`,
      `hosted-reservation-support.ts`);
    - the earlier-attempt query under the discharge's applicability reads (`queryEarlierReviewAttempts`,
      `earlier-review-attempts.ts`), which also requires a delivery-member vehicle and target, so a singleton's local
      attempt at an earlier head is never found.

  On a subject with no vehicle, all three accept a local result in the same lineage without one, as `delegated-agent`.
  The query counts the lineage's local passes from before the pull request too, as lane progress already reads across
  the lineage (`readLaneProgressAcrossLineage`), and takes the pull request from its own selector, since a local attempt
  carries none. The discharge reads terminals per reserved source (`reservation.sources`), so the route names local
  prepare only when the driver selects `delegated-agent` from the reservation's sources, and D6's no-`delegated-agent`
  stop covers the rest; a local pass run outside that route is one the discharge never reads. The singleton route also
  handles the driver's `coverage-required`, which today reaches it with no next source and falls to the same bare
  `review-required` (`status.ts`). It is reached only after an unconverged look, since after a converged one the
  composition has already re-resolved to the complete pass with the source D6's rank picks (D1), and it routes to
  ordinary local prepare, which asks the coverage question (D5). The discharge resolves terminal policy only over a
  `clean` or `settled-findings` terminal, after routing unsettled findings to their response
  (`hosted-reservation-discharge.ts`), so no response is pending when this arm is reached, whatever `responseRequired`
  says (D1). Read from source, not yet run; the segment's tests exercise it.
- **A delivery member's local pass keeps its source through the re-check.** Local prepare re-checks a delivery
  admission by re-running status with the admission's coverage but not its source (`validateDeliveryAdmission`,
  `runtime/local-prepare-composition.ts`), and the status port reads the source only from the request, never the
  `sourceId` it is built with (`createReviewStatusPort`, `status-composition.ts`). A selection matches only on both
  (`selectReviewCoverageChoice`), so a pick made with `--source delegated-agent` comes back as `coverage-required`,
  and local prepare refuses with "no longer has exact driver admission"; a forced local source loses its force the
  same way. The integration test replaces that re-check with one that passes the source
  (`review-fan-out-lifecycle.test.ts`), so nothing covers the real one. D6 sends every delivery pass after an
  unconverged one down this route, so the re-check passes the admission's source, and a test runs the real re-check.
  Read from source, not yet run. Owner-approved as part of this work unit on 2026-10-16.
- **A base merge that overlaps reviewed code gets a bounded check at the stop that already exists.** When the target
  moves by a base merge or a rewrite, the applicability check (`lib/evidence-applicability/reducer.ts`) already does
  what the review hosts do (§ Prior art):
    - it carries the review when the movement is disjoint from reviewed files or merges cleanly
      (`base-movement-disjoint`, `base-movement-clean-merge`, read with `git merge-tree`, `lib/git/merge-tree.ts`), and
      leaves what the combined code does to verification;
    - it asks for judgment only over a bounded residual of overlapping files (`bounded-overlap`,
      `bounded-clean-divergence`), where `assess-evidence-applicability` recommends `supplemental` or `fresh`.

  On the work-unit path a bounded residual already stops for the Owner, at two points:
    - during review, status returns `resolve-review-applicability`, whose choices are `covered`, which keeps the
      earlier review, and `review-required`, a complete pass (`ReviewApplicabilitySelectionOfferSchema`,
      `review-applicability-resolution.ts`);
    - at the final reconcile, the Candidate checkpoint offers `covered`, `targeted-check`, which records a completed
      bounded check's evidence (`targetedEvidenceRef`, `candidate-applicability-resolution.ts`), and `changed`, which
      establishes a new Candidate root.

  Between `covered` with no look and a complete pass over the whole change, nothing reads the resolution itself, and
  `supplemental` names a pass that cannot run. No correction scope exists for a movement that is not an approved fix,
  so the `--coverage incremental` arms in `integrate-work-unit.md` and `deliver-stack.md` end at
  `coverage-unsupported` (`status.ts`).

  At either stop, before the Owner chooses, the agent runs one fresh local check over what the movement changed in the
  reviewed change:
    - a merge's conflict resolution against Git's automatic merge, as `git log --remerge-diff` shows it, or a rewrite's
      interdiff, as `git range-diff` shows it;
    - the residual's files;
    - dependencies across the two sides — a rename or removal on one side that the other still uses.

  It carries that context explicitly, since the reviewer remembers nothing of the earlier pass, and its findings are
  shown beside `assess-evidence-applicability`'s `supplemental | fresh` recommendation. Its instructions join that
  method, which fires at both stops: `deliver-stack`'s member-rewrite stop fires it today, and `integrate-work-unit`'s
  pre-reconcile route, which says it does not, gains the fire-point. The check is not a pass: it takes no lane attempt,
  counts against no ceiling, and stores nothing the stop does not already record. The Owner's `covered`, or
  `targeted-check` at the reconcile with the check as its evidence, carries the earlier review; `review-required` or
  `changed` sends the lane to a complete pass. When the check finds a material defect, or prompts any fix, the agent
  recommends `review-required` (`changed` at the reconcile). At every stop, with a delivery bound or not, the check's
  findings go to the Owner as a complete disposition set (`DEV-RULES.ARC` § Review finding mutation guard). Outside a
  bound delivery, an approved fix lands before the Owner chooses: it is committed after `arc check gate commit` as an
  ordinary change, since the check leaves no review result for `arc review respond -` to bind. The Owner then
  chooses once, at the stop raised over the fixed head; the check does not run again there. The complete pass that
  follows reads the fix, so no fix check's range crosses the merge. `covered`, or `targeted-check` at the reconcile,
  stays the Owner's to choose there (D8), disclosed as resting on a fix no pass has read: the check that is
  `targeted-check`'s evidence read the movement, not the fix. The `--coverage incremental` arms go.

  While a delivery is bound, the Owner chooses first, with the recommendation above, and that choice governs only until
  the fix lands. A `covered` choice there, or `targeted-check` at the reconcile, is disclosed as holding only until
  then. Whatever the choice, while an approved fix from the check is unlanded, the agent requests no pass for that
  member, which `review-required`'s `request-review` would otherwise do, and takes it to no landing preparation, which
  `member-discharged / continue-reconcile` or `settled / continue-reconcile` would otherwise permit
  (`deliver-stack.md`). The approved fix then takes the delivery's own correction route: a correction task in the owning
  member's section, covered by a plan revision before it runs (`amend-design` § Under a bound delivery plan), through
  `arc delivery review-fix continue -`, which `deliver-stack.md` requires before any approved correction is authored
  while a delivery is bound. It lands before the complete pass, which reads it. The task is authored only when the
  continuation holds no other correction: none derived from an unsettled approved review response (`deliver-stack.md`)
  or a pending verification (`inspectDeliveryEntry`'s pending-verification arm, `lib/delivery/entry-inspection.ts`). The
  continuation is the authority on that state; a typed mark of it at the stop is delivery's to add (§ Coordination). A
  plan revision is the delivery plan's existing record, so the route adds no record shape.

  Status then asks again over the fixed head. A stored applicability selection binds its projection and residual
  (`projectionDigest`, `residualDigest`, `review-applicability-resolution.ts`), the projection includes the current
  head, and an earlier selection is found by that head (`earlier-review-applicability.ts`), so the correction's commit
  raises a fresh stop over a residual that includes the fix. The check does not run again there. The Owner chooses
  with the check's findings and the fix in view, and `covered`, or `targeted-check` at the reconcile, is disclosed there
  as resting on a fix no pass has read. Letting the first choice govern past the fix would need a stored link from it
  to the fix, which this work unit does not add, so a bound stop where the check prompts a fix asks the Owner twice.
  Whether a fix may land before the first choice is delivery's question (§ Coordination). This work unit adds no
  shortcut around the delivery's correction route (§ Scope).

  A base move in the middle of fix rounds, after a fix no pass has checked, breaks the fix check's chain whatever
  applicability or the Owner's choice says about the move, so the next pass is a local complete one. A fix check's range
  holds only fixes (D3). Were a carried or `covered` move to extend the chain, the fix check would read from the
  predecessor's head to the moved head, the whole base movement included (`buildIncrementalCorrectionScope` sets
  `predecessorHeadSha` to the predecessor's head, `incremental-coverage-basis.ts`). The refusal sits where a correction
  scope resolves, in the confirmations `resolveIncrementalCorrectionScope` takes, not in the shared applicability reads,
  which also carry a converged terminal across a base move. On delivery it replaces today's carry from a fix's produced
  head, which `verifiedDeliveryMemberFixResponse` re-anchors (`earlier-review-applicability.ts`), so a member restacked
  in the middle of its fix rounds also takes a complete pass; members are reviewed in stack order, so that is rare. At
  such a stop the check does not run, since a complete pass follows whatever the choice. Neither `integrate-work-unit`
  nor `run-errand` merges base during review: each gives base mutation to its terminal planner alone, after review
  settles (`integrate-work-unit`'s review iteration, `run-errand`'s Step 4). A mid-round move therefore comes only from
  outside the workflow, an Owner or host branch update or a delivery restack, and the Owner avoids its complete pass by
  not updating the branch from base during fix rounds. Above the residual's bound — 200 paths or 16 KiB of
  path text — the applicability check stops with `residual-unbounded` rather than offering a choice
  (`classifyReviewContributionApplicability`, `review-contribution-applicability.ts`; the Candidate checkpoint's own,
  `candidate-applicability.ts`), and the check does not run there.

  An Errand takes a complete pass after an overlapping base move. Before its pull request, its chain needs an unchanged
  diff base (`exactErrandResponseContext`, `local-review-coverage-selection.ts`). After it, a leg that holds a fix
  proves only by the performed-response test, so a base move after an unchecked fix takes a complete pass (above). On a
  leg with no fix, contribution applicability carries a disjoint move and returns `review-required` on an overlap,
  since an Errand has no applicability selection (`confirmNonDeliveryIncrementalApplicability`).
  Its applicability judgment exists only at merge (`errand-merge-composition.ts`, `run-errand.md`'s merge step), and
  an Errand's target is small, so `run-errand.md`'s supplemental arm asks for the complete pass the review status
  offers.

  Two costs stay. The Owner decides each overlapping merge, at a stop that exists today. And during review the stored
  selection reads `covered` without naming the check: a `targeted-check` choice there changes a stored shape. A counted
  merge check that needs no stop would likewise mark its scope in a stored record, and without that mark every reader
  has to recognize one by recomputing applicability leg by leg. Both shapes are `seam-delivery-review`'s, so the counted
  check waits for that member and is captured at draft close (§ Coordination). Owner-approved 2026-10-16.
- **Why local.** A fix check is defined by what it carries (D3), and only the local reviewer takes ARC's instructions.
  CodeRabbit's request must be the exact command (`requestCommandCoverage`, `hosted/coderabbit.ts`), and text after
  `@codex review` only narrows what Codex reports. A hosted fix check would be the provider's own incremental review,
  which ARC can neither shape nor verify, and on the probes neither provider re-examined anything (below). Alternating a
  local fix check with a hosted complete pass also puts a different source on each, which the prior art favors over
  repeat runs of one.
- **Neither hosted provider re-examines its own findings.** The probes on pull request #1031
  (`notes-review-coverage-cadence.md` § Codex probe and § CodeRabbit probe) found that each provider reviews the whole
  pull request but reports only defects it has not already posted there, and each remembers only its own.
    - **Codex** never re-reported an earlier finding across five runs: not on an unchanged head, not after an incomplete
      fix whether its thread was resolved or open, and not when asked by name to check the fix. ARC records its result
      as complete (`request()` returns complete coverage, `hosted/codex.ts`) and reads "Didn't find any major issues"
      with the reviewed-commit marker at the head as clean (`cleanForHead`).
    - **CodeRabbit's** incremental review read two incomplete fixes and posted nothing, and its full review then
      re-reported none of its six earlier findings, all still in the code; its summary comment meanwhile said the
      defects remained. ARC's clean reading never sees that: it takes the summary's "No actionable comments were
      generated in the recent review" line (`summaryReportsNoFindings`, `hosted/coderabbit.ts`) with the `CodeRabbit`
      commit status, the command reply, and, for a complete request, the reviewed-head range (`summaryCompletesHead`);
      an `approved` review with no findings reads as clean on its own. It would have recorded a clean fix check and
      then a clean complete pass.

  Today a material fix to a hosted finding can therefore close the lane unverified, under `incremental` as well as
  `full-final`. The rule above closes that: a hosted source runs again only after the fixes have passed a local fix
  check, and then it looks only for defects no pass has reported. Requests stay bare, with no focus hint and no
  pointers (D9). Codex reads both `## Review guidelines` and `## Code Review Rules` in `AGENTS.md`, and CodeRabbit reads
  `AGENTS.md` too, so the checked-in heading needs no change.
- **Hosted incremental review leaves the gate.** With no incremental pass on a hosted source, ARC never requests
  hosted incremental review, and its writer is removed rather than left dormant:
    - the correction-review capability (`hostedProviderAdmitsCoverage` and `hostedProviderReviewsIncrementally`,
      `hosted/correction-review-capability.ts`, and `correctionReview` in both registrations);
    - CodeRabbit's incremental request and its range-evidence writer (`nativeIncrementalCoverageEvidence`,
      `hosted/coderabbit.ts`), and Codex's `commands.incremental`;
    - the Errand path's hosted correction (`resolveErrandHostedCorrection` and `assertErrandHostedCorrectionRequest`,
      `status-errand.ts`; `HostedErrandCorrectionError` and its remedy, `review-policy-remedy.ts`);
    - the hosted incremental choice of `coverageSelectionChoices` (`hosted-reservation-support.ts`), whose hosted
      complete choice stays for the pass after a converged one, and the hosted arm of `errandNextPassCoverage`
      (`respond-command.ts`).

  Three symbols lose only their hosted incremental arm, because the local path runs through them:
    - `currentCorrectionScopeCandidate` and the `delegated-agent` arm of `coverageSelectionChoices` are the work-unit
      path's only local fix-check offer, and the builder of the selection D5 now emits on it after material fixes;
    - `errandNextPassCoverage`'s `attested-local` arm feeds `projectFixConsequence`.

  Hosted admission refuses incremental coverage outright where the capability check stood
  (`assertHostedCoverageAdmission`, `hosted-reservation-admission.ts`). It has to, because the request schema
  (`hosted/request.ts`) and the stored hosted records (`requestedCoverage`, `core/operation-state-schema.ts`) keep
  parsing incremental, and a hand-composed request would otherwise run. The two `status.ts` routes that compose a
  hosted action through the capability check, the singleton route and the delivery route, refuse an incremental
  request on a hosted source the same way, with a remedy naming the local fix check.

  The read side stays. CodeRabbit's observer keeps recognizing `@coderabbitai review` and its reply as a request
  generation (`requestCommandCoverage`, `earlierRequestGenerationsSettled`, `nextRequestBoundary`,
  `commandReplyCompleted`). The stored-record readers stay too (`lane-attempt-validation.ts`,
  `hosts/local/review-result-reader.ts`, `recordHostedAwaitAttempt`), with `HostedCoverageEvidenceSchema`
  (`hosted/await.ts`) parseable, because a stored operation record already holds one. So a hand-typed
  `@coderabbitai review` stays what it is today: a competing request generation that ARC recognizes, can fail ARC's own
  request with `provider-request-generation-overlap`, and never counts as a pass. CodeRabbit's automatic incremental
  reviews no longer move its baseline off an ARC predecessor head (`provider-incremental-range-mismatch`). An automatic
  review at a requested head can still be absorbed into ARC's complete pass by the observer's filter; this repository
  pins them off (`.coderabbit.yaml`). This settled open question 6. Help and prompt text that calls coverage hosted
  changes with it (`cli.ts`, `handlers/review.ts`, the discharge's selection prompt).
- **Without `delegated-agent` configured.** `review.standard_sources` stays the project's policy on which reviewers
  count, and ARC runs no source the project left out. A project that lists sources but omits `delegated-agent` cannot
  run the pass that follows an unconverged one, so the lane stops there with its remedy named:
    - add `delegated-agent` to the list;
    - take a complete pass where one is offered;
    - or take the Owner's stop (D8), disclosed as resting on fixes that no reviewer re-examined.

### D7 — One pass model for code review and adversarial review

The two families name one set of concepts twice:

| Adversarial review          | Code review                               |
| --------------------------- | ----------------------------------------- |
| pass cap (`Pass N of M`)    | pass ceiling (`completedPasses`)          |
| fold                        | fix, correction, response                 |
| fix check, in rounds        | incremental correction pass               |
| re-inspection test          | — (D5 adds it)                            |
| converged / `cap-exhausted` | `pass-complete` / ceiling override        |
| —                           | `full-final`, whose behavior drifted (D1) |

Define one model — pass, fix check, cap, convergence, re-inspection test, fold tags, and cadence — with per-type
defaults, each held by its type's operation (D10): a planning artifact is small, so a complete pass every time stays
cheap there; a large code change takes complete passes on a cadence with fix checks between. Records stay separate by
design: `seam-delivery-review` gives an adversarial pass a record of its own shape (`review/adversarial-pass`, its
§7) rather than the review gate's.

- **Home: a shared method, `review-model`,** declared by D10's three operations, `adversarial-review`, `review-triage`,
  and `review-response` at their fire-points. Every reader reads the model at a review operation, so a fire-point
  declaration — 85–95% adherence in `analysis-load-set-scoping`'s bands, against 60–75% for an index entry — fits better
  than a strategy and adds nothing to the always-loaded set; two families already justify extracting it. The method
  holds the model's definitions, the loop reading (below), and the family's map — D10's layers, its three operations,
  and where every review method sits — while each operation holds its type's defaults. Every constraint — a fix check
  runs only with approval, a cap never authorizes, a recommendation is not authorization — stays at its fire site. The
  method needs an `init-recipe.json` disposition, or it reaches no project. `review-orchestration-right-sizing` keeps
  its whole "Give review-lane doctrine a strategy home" charter.
- **A fix check and a successor pass are separate decisions, never traded.** A fix check verifies repairs; a complete
  pass looks for what no pass has found. The second does not do the first's job: in `seam-lifecycle`, 6 defects sat in
  fix code that one to five complete passes had read and passed. `adversarial-review` nonetheless teaches the trade in
  several places, and agents routinely decline a round because a pass follows, even after material fixes:
    - its first-round rule recommends declining "when all folds are local corrections and a full pass will follow";
    - "the exit gate's re-inspection test may recommend a full pass instead" frames the pass as a substitute;
    - repairs join the next pass's `prior-findings`, which agents read as coverage, though the method gives them as
      "context, not the search frontier";
    - "the next outer pass covers the last round's repairs" describes the residual after rounds converge, and reads
      as if the pass covered every round's.

  The model's rule, in both families:
    - recommend a fix check, and another round, whenever the last look's approved fixes include a material one,
      whatever follows;
    - decline only on the fixes' own merits: they fix minor findings only, or an accepted re-entry or a pending
      rewrite is about to supersede them. That applies where the subject needs no further pass; an Errand needs one
      after any fix (`projectFixConsequence`, `respond-command.ts`), and there the pass D5's bounds name runs;
    - a following pass, approved or under the cap, is never a reason to decline, and the method says so in those
      words;
    - fix-check rounds converge before the successor pass launches. The re-inspection test decides whether a full
      pass follows them, never whether one replaces them.

  A fix check is scoped to the change, so running both costs far less than two passes. In code review this is D5's
  offer: after material fixes it offers the fix check first and says a complete pass does not replace it, and its
  judgment chooses only what follows the converged fix check. Proposed by the Owner on 2026-10-16 from a pattern seen
  across planning reviews.
- **Reports render the model.** Today a report shows a finding's grade and action but not its fold tag. The pass
  position and the next-step offers sit in prose around the table, and the state of the loop is left to the reader.
  Every review report — an adversarial pass, a fix-check round, and a code-review findings round — takes one shape:
    - **a header line**: the pass (`Pass N of M`) or fix-check round, the result (converged, not converged, or the
      stop reason), marked provisional until the set is approved, since the approved set decides convergence, and the
      count of findings by grade;
    - **a table of `#`, `Grade`, `Finding`, and `Action`**, so a row reads as a sentence and the two columns the
      approver scans sit at its edges. A fix carries its tag in the action, `FIX (new design)` or
      `FIX (local correction)`; nothing else takes one. The new-design rows are the ones that take a proportionality
      read, weigh toward a full pass, and feed sustained non-convergence, so that is where the approver looks. The
      table has no verdict column: a graded finding is confirmed, and `—` marks one not supported. The rest of today's
      verdict cell (`renderVerdict`, `core/disposition-report.ts`) moves to the finding's section: the reviewer's
      grade where it differs, and code review's gating, except that a `record-only` finding stays marked in its grade
      cell, since blocking is the default;
    - **the order**: as today, code review's blocking findings first, then grade, with unsupported findings last;
      within a grade, new-design fixes lead, then the source's order;
    - **one section per finding**, in table order: its heading, a status line that mirrors the row and adds the
      verdict (`🟠 major · Confirmed · FIX (new design)`), then `**Finding:**`, `**Fails:**`, `**Action:**`, and
      `**Detail:**`. `**Finding:**` replaces `disposition-report`'s `**Issue:**`, so the field and the table's column
      share a name;
    - **what each finding fails**: `**Fails:**` names the rubric item the finding fails, in the review's own terms. In
      verification review it is the criterion's locus in `validate-criteria`'s form (`Success Criteria > … > N`); in
      code review, the rubric dimension (`implementation-audit`'s five, as a project's rubric extends them); in a fix
      check, its axis; in planning review, the item of the rubric its fire-point supplies. `none` is an answer, with
      its reason. In verification review the reason is either outside the criteria (the finding is code review's, so
      it goes to that lane or a capture) or a missing criterion (the spec is amended forward, since criterion text is
      immutable). A review that drifted from its lens then shows in the report: a verification review whose findings
      fail no criterion is doing code review. A local reviewer returns the field with each finding:
      `adversarial-review`'s report schema gains it, and the code-review reviewer prompt asks for it. For a hosted
      source the agent supplies it while verifying, marked as its reading. The agent verifies it with the rest of the
      finding. Proposed by the Owner after the loop's seventh fix-check round (2026-10-16);
    - **one Decisions block under the table** holding every ask: the approval, open questions, the fix-check offer,
      and the successor-pass recommendation, each with its recommendation. `disposition-report` already gathers open
      questions there "so everything asked of the approver sits in one place"; the offers join them;
    - **a loop reading**: the trend of material findings across passes and rounds (for example `P1: 6 → R1: 2`),
      where they came from (the original artifact or an earlier fold) and how many of their fixes are new design, then
      one reading with a one-line rationale and what it implies for the next decision. The reading is one of:
        - `baseline` — a first look, with no trend yet;
        - `converging` — material findings come from folds, sit next to fixes, or are siblings (instances of a class
          an earlier finding exposed); they are falling or flat, and their fixes are mostly local corrections, which
          points to stopping once the fix checks converge;
        - `discovering` — material findings keep arriving in code or text that earlier looks already read, as new
          defect classes rather than from folds, which points to another complete pass after the fix checks (D5). It
          takes precedence over `converging` wherever both could be read;
        - `sustained non-convergence` — the exit gate's existing definition: most material findings come from earlier
          new-design folds and their fixes are new design again, which points to the re-entry offer, in its top-level
          shape where the stage has no level above (below).

  In planning review the counts come from the pass record, which keeps each finding's origin and each fold's tag.
  Code review stores neither (D5), so there:
    - the material trend is D5's computed fact: lane progress orders and labels the looks, and the disposition
      records count them (`verifiedSeverity`, `core/disposition-records.ts`);
    - new design is read from D5's per-round signals beside the current round's tags;
    - origin is the agent's reading of whether a finding falls in an earlier round's fix range;
    - `sustained non-convergence` points to stopping for the Owner's decision on whether the spec's design needs
      `amend-design`, which is how a code-time finding reaches the design record; the re-entry offer belongs to
      planning stages (`adversarial-review`'s exit gate).

  The reading is labeled advisory, the same split as D5's facts and judgment. `disposition-report` takes the shape,
  with the header line and the Decisions block as fields its caller supplies; `review-model` defines the loop reading
  and its four readings; and `adversarial-review` and `code-review`'s findings round render them.

  In code review the CLI renders the report (`renderDispositionReport`), and the workflows emit it verbatim
  (`prepare-work-unit.md`, `integrate-work-unit.md`), so all of it comes through the CLI. The CLI renders the header
  from its provisional assessment, and one Decisions block from the approval, the open questions, and D5's bounded
  offers. The agent's parts reach it as render-only inputs on the first `arc review respond -` call: one tag per fix,
  one `**Fails:**` anchor per finding, the successor-pass recommendation, and the origin counts with the reading and its
  rationale; the CLI renders the trend from D5's fact. The CLI renders them and persists them nowhere. They sit on the
  request beside `proposal` (`RespondProposalRequestSchema`, `respond-command.ts`), the tags and anchors keyed by
  finding identity, never inside `AuthorDispositionSchema`: `prepareDispositionProposal` spreads each proposed finding
  into the disposition set stored at approval (`seam-delivery-review`'s §6.2), so D5's "no tag is stored" holds. A local
  result's findings hold no rubric field (`ReviewFindingContentSchema`, `core/finding-records.ts`), so the anchor
  travels in the reviewer's own report and reaches the CLI only this way. The approved call and the settlement replay
  render the report too (`renderDispositionReport`, `respond-command.ts`), with no render-only inputs; they take a
  reduced shape: a header naming the approved set, the table and sections with a plain `FIX` and no `**Fails:**`, and no
  Decisions block or loop reading. Proposed by the Owner after the first adversarial pass's report, and refined after
  the first two fix-check rounds (2026-10-16).
- **Re-entry where there is no level above.** `resolve-planning-depth` routes a floor-raising signal, once the offer
  is accepted, to the stage that owns its axis, re-entered one level higher, and "nowhere-up from `high`". At `high`
  in the owning stage the level part of the offer is empty, and an offer to re-enter higher reads as noise and ends
  up argued as a reason to decline, while the signal still calls for a response. There the offer changes shape:
    - **return to shaping** for the named locus: accepting it ends the review loop with the exit gate's existing
      `re-entered` stop reason, the locus is worked through the stage's own authoring loop — in `draft-design`, the
      facilitated shaping step, from the problem and its alternatives rather than a patch per finding — readiness
      re-runs, and the stage's adversarial offer starts a fresh loop with a fresh cap. The pass record keeps the
      ended loop's passes and findings, and they reach the new loop's first pass as context. Sustained non-convergence
      means the agent is writing design in folds for approval, which `draft-design`'s invariant that "the agent does
      not produce a finished design for sign-off" rules out; at `generate-tasks` it is a return to grounding the named
      surface;
    - the `Class` ratchet to `Novel`, when the read finds the design must be invented rather than composed;
    - `assess-boundary-fit`, when the design written in folds spans concerns that could stand apart, as the exit gate
      already offers.

  "Re-enter higher" never appears where nothing is higher. The top-level shape applies where the signal's own stage is
  at `high`: `draft-design` for derivation, `create-spec` for a signal about the spec's form alone, and
  `generate-tasks` for scale. A derivation signal at `create-spec` whose direction is unshaped, or at `generate-tasks`,
  keeps its offer to route upstream. Raised by the Owner after the second fix-check round (2026-10-16).
- **Scope: agentic review only.** Human review is out of band, follows once agentic review has closed (ADR-034), and
  is never a pass.
- **Prose aligned to it:** `adversarial-review` (its fix-check round recommendation, its re-inspection test, and its
  exit gate's re-entry offer among it), `resolve-planning-depth`'s § Mid-stage re-entry, `review-triage`,
  `review-response`, `classify-review-risk`'s "What the call changes", and D10's operations, in the package's `arc/`
  source and then the `.arc/` copies.
- **Names, weighed with the Owner on 2026-10-16** — while `seam-delivery-review`'s spec was open and before D10's
  rewiring touches every fire-point, the two moments a rename costs least:
    - **`adversarial-review` keeps its name.** Its identity contract makes the stance part of what it is ("The reviewer
      tries to break the artifact against the supplied rubric"), which the standard rubric does not frame, and beside
      D10's operations it reads as a vehicle: `planning-review` runs it with `design-audit`. `advisory-review` names its
      real line against the gate, authority, but collides with `frontline-review`'s "advisory pre-publication review"
      and reads as optional; `independent-review` and `fresh-review` name properties the gate's local passes share.
      `review/adversarial-pass` (`lib/store/catalog.ts`, `lib/store/registry.ts`) keeps its name with it.
    - **`standard-review` and `frontline-review` become `code-review-standard` and `code-review-frontline`.** As
      method names they read as peers of D10's types, though they are code review's satisfying and advisory lanes;
      the prefix groups them under `code-review`, and segment 4's rewiring already touches their call sites. The rubric
      identity `standard-review/v1` stays: it names a rubric, and as a schema literal (`rubricVersion`,
      `standard-review-guidance.ts`) carried in every stored requirement and compared by
      `resolveOfferedCorrectionScope`, renaming it would change a stored shape and cost in-flight chains one complete
      pass. The lane vocabulary (`review.standard_*`, `review.frontline_*`, `arc review frontline`) stays too, and so
      does every stored or schema literal and published schema ID that carries either name. Grounding found these,
      and the spec re-derives the inventory:
        - `frontline-review/v1` (`frontline-semantic.ts`, `frontline-outcome.ts`, `frontline-command.ts`);
        - `standard-review-reservation/v1` and `arc.standard-review.reservation/v1` (`integration-boundary-locus.ts`,
          `pre-publication-procedure.ts`);
        - `arc.standard-review.rubric-digest/v1` and the version pattern (`standard-review.ts`,
          `standard-review-schema.ts`) and `standard-review-guidance/v1`;
        - the requirement kind `"standard-review"` (`core/contracts.ts`, `core/gate-contract-v2.ts`,
          `core/gate-contract-v2-schema.ts`);
        - the `standard-review/v1` source qualifier (`local-review-policy.ts`, `runtime/local-prepare-composition.ts`);
        - the published schema IDs the tests pin.

      The rename is a code change, not only prose, though it needs no migration. `frontline-review` is a
      method-activation key (`lib/method-activation-registry.ts`, read by `policy/activity.ts`), this repository's copy
      carries `active: true`, and both files are Configurable (`classification.ts`). So these move with the files:
        - the activation key and its `method.<name>.*` diagnostic strings (`lib/method-activation.ts`);
        - the Configurable lists, including `strategy-package-project-sync.md`'s inventory;
        - `init-recipe.json` and both manifests;
        - the checks that tie a method file's name to its registry key (`lib/frontmatter/method.ts`,
          `validate-package-neutrality.ts`, `audit-method-triggers.ts`);
        - their tests.

      ARC is pre-release, so no alias or migration reader is added (`DEV-RULES.PROJECT` § Engineering Standards), and
      `docs/` is left to `docs-content-sweep`. The rename was weighed again at source grounding on 2026-10-16, and
      once more at the first adversarial pass with the fuller footprint; it was kept both times.
    - **`validate-criteria` keeps its name** as verification's check (D10).
    - **`full-final` and the verbs keep theirs:** renaming `full-final` would bring back the transition pass D1 avoids.

### D8 — The Owner decides at any point

Bounds constrain the agent, never the Owner. A bound that says which source can re-examine a fix (D6) is not one the
Owner overrides by choosing another source: the Owner can waive re-examination by stopping, but ARC never records a
pass that cannot re-examine as one that did. At any point the Owner may:

- run a fix check after material fixes wherever its chain is proven, whatever the recommendation — today `full-final`
  refuses one on local non-delivery prepare and the Errand path (`resolveOfferedCorrectionScope`,
  `resolveErrandHostedCorrection`, `errandNextPassCoverage`), which is why `seam-lifecycle`'s last rounds ran outside
  the gate. Under `full-final`, after a converged look the next pass is complete (D1);
- run a complete pass;
- run past the ceiling, by the ceiling override or an `additional` extra pass;
- stop with an Owner-accepted terminus — the expected end of a long `sensitive` review when D5 recommends stopping.

**The stop is reachable where D1 lands.** After a clean converged fix check the driver reports `coverage-required`,
which the composition then resolves to the complete pass (D1). Today the driver returns that state before it reads a
supplied terminus (`review-policy-driver.ts`), so the stop D1 and D5 offer cannot be taken there. The driver honors a
supplied terminus at `coverage-required` once any response the terminal pass requires is performed, before the
composition admits the complete pass. The surfaces that offer or carry the stop follow:

- the delivery path binds its terminus offer only on other states (`status.ts`), and counts a pending coverage
  selection as an intervention (`isDeliveryReviewMemberDischargedByOwnerTerminus`);
- pre-publication obtains a terminus only from the driver's `owner-accepted` state (`pre-publication-procedure.ts`);
- `run-errand.md` admits the Owner's stop only from `ready` or `approval-required`.

Known gaps, owned elsewhere: an acceptance is dropped once an approved fix advances the Candidate, and the frontline
lane cannot take one (`review-source-authority`, which owns the durable terminus); an Errand takes no terminus today,
and `seam-delivery-review` leaves that separate (its §5.6). Under D1 the stop usually lands at a settled head after
the last fix check, where an acceptance holds; a later base merge drops it.

### D9 — What a complete pass receives

- **Receives:** earlier reviewer-originated findings as pointers — locus and defect class — labeled "previously
  reported and fixed; the fix and the code around it stay in scope" and not a search boundary, with the instruction to
  search independently and to sweep for siblings of the listed classes. For human reviewers such comments act as
  reminders, without loss on other defect types. The label claims nothing about the fix, because the field data put
  22 of 57 later findings, both criticals among them, in or near earlier fix code.
- **Withholds:** rejections and their reasons, any global verdict ("converged", "clean so far"), clean status for
  files or areas, any claim that a fix closed its finding, and everything the standard rubric already withholds —
  author conclusions, preferred fixes, self-verification claims, and suspected weak spots. Verdicts are what LLMs
  anchor on.
- **A rejected finding raised again is caught at triage:** `review-triage` checks new findings against the lineage's
  rejections and asks whether each reason still holds, so no verdict enters the evaluator's context. No command
  supplies those rejections today, so the check would rest on conversation memory. A CLI read gives triage the
  lineage's rejected findings and their reasons, composed from the stored disposition records. It rides no stored
  envelope.

Today a complete pass receives only the guidance's reviewer instructions, while an incremental pass lists the findings
it must re-examine (`localReviewerInstructions`, `scripts/review-gate/core/local-prepare.ts`).

- **Where the pointers are composed:** at prepare, into `reviewerInstructions` — the string the local review operation
  already stores (`LocalReviewStateSchema`, `core/operation-state-schema.ts`) and replay reuses
  (`runtime/local-prepare.ts`) — as an incremental pass's required findings already are. The string's content
  changes; no shape does, and the source descriptor is untouched. This settled open question 9.
- **Which findings:** the lineage's verified findings approved as `fix`, by locus and the disposition's title, which
  new proposals require (`respond-command.ts`) and older stored items may lack; the finding's `sourceLabel` lives on
  the normalized finding (`finding-records.ts`), not the disposition. Some pointers therefore carry a locus only.
  Deferred findings are still live, so they are not "previously fixed", and rejected ones are withheld (above).
- **Hosted lanes:** CodeRabbit's request must be the exact command (`requestCommandCoverage`, `hosted/coderabbit.ts`),
  so it carries no pointers. Codex carries none either: it already holds its own findings on the pull request, and
  request text narrows what it reports (D6), so a pointer list could become the search boundary this decision rules
  out. Both providers already remember their own findings on the pull request.

When evals exist, check recall with and without the pointers, both of unlisted defects and of defects at the listed
loci.

### D10 — The review family: three operations over sites and checks

Every review type has three kinds of thing, and no method names the middle one today, so a type exists only as a
pattern its call sites repeat:

| Type         | Sites (lifecycle workflows)                                               | Operation             | Checks                                                                                                                     |
| ------------ | ------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Planning     | `draft-design`, `create-spec`, `generate-tasks`, `amend-design`           | `planning-review`     | `assess-draft-readiness`, `assess-design-proportionality`, `design-audit`, `source-grounding`, `spec-review`, `task-audit` |
| Code         | `run-errand`, `prepare-work-unit`, `integrate-work-unit`, `deliver-stack` | `code-review`         | `implementation-audit`, under `code-review-standard`'s satisfying standard                                                 |
| Verification | `verify-work-unit`, the task loop's delivery-member boundary              | `verification-review` | `validate-criteria`                                                                                                        |

- **A site** is a lifecycle workflow: its stops, gates, and state, including what is not review — `verify-work-unit`
  also runs the merge gate and attests the Candidate.
- **An operation** is the review type a site calls. Each runs author checks, then an independent pass, then findings
  handling: planning runs `spec-review`, grounding, and readiness before `adversarial-review`; code runs `self-review`
  before the frontline and standard lanes; verification runs the author's criteria walk before its independent
  companion. An ad-hoc request reaches the operation too, since a workflow is only where it occurs
  (`strategy-knowledge-evolution` Principle 3). An operation dispatches on what the CLI computes and holds no
  sequencing the CLI owns (`strategy-procedure-evolution` Principles 1 and 2), and it takes `adversarial-review`'s
  contract shape.
- **A check** is rubric content that runs in the author's context or goes to an independent evaluator as its rubric;
  independence is where a check runs, not a property of the check.
- **Vehicles, findings, and routing serve the operations:** `adversarial-review` (advisory, fresh context) and the
  review gate's lanes, `code-review-frontline` (advisory) and `code-review-standard` (satisfying) (D7); `review-triage`,
  `review-response`, and `disposition-report`; `classify-review-risk` and `review-chunking`.

Sites call the operation, never its checks. A site that wants evidence and no review calls the check directly:
`deliver-stack`'s review-fix verification and `amend-design`'s closing delta (below), and `decompose-work-unit`, which
runs `spec-review` over the specifications it authors or retains. Ad-hoc doors reach the operation too:
`arc-design-audit` and `arc-task-audit` run a check standalone, and `arc-amend-design` opens `amend-design`, all in
`.internal/skills`. Two methods sit beside the three operations. `self-review` is code review's author check.
`assess-evidence-applicability` is the judgment at a moved target's applicability stops, with the bounded check that
informs it (D6).

Each operation is shaped to what its call sites actually share (`notes-review-coverage-cadence.md` § Review call
sites):

- **`planning-review`** — new. `draft-design`, `create-spec`, and `generate-tasks` carry its block nearly verbatim
  today: the offer, orientation, authored-partition note, fix-check offer, pass record, and post-settle re-read. The
  site passes its artifact, which selects the rubric, artifacts, and the `Class`-scaled offer and pass cap.
  `amend-design` passes its depth instead, since an amendment scales by depth rather than `Class`, and gains the offer
  callout, signature block, and pass cap it lacks today: depth sets the offer (none at `low`, neutral at `medium`,
  recommended at `high`), and `Class` sets the pass cap, as at the other sites. The offer aligns at every stage gate —
  recommend at `Heavy` and `Novel`, neutral at `Light` — where `draft-design` recommends only at `Novel` today.
- **`code-review`** — new, as shared procedures rather than one sequence. Each site drives review through its own CLI
  command and state vocabulary — `arc review resolve` for an Errand, `arc review pre-publication` before
  publication, the integration boundary's `nextAction`, and `arc review status --target` for a stack member — with
  its own early stop and fix verification, which the CLI owns. What the sites share, and clone today, moves here: the
  findings round (triage, the disposition report, complete-set approval, response, fix, verification, commit, push,
  settlement, and re-entry), hosted await and settlement, and the common rules (convergence, the chunk gate, the
  ceiling override, and the stop line). Each site keeps a thin dispatch on its own command whose arms call in. It is
  one method with named sections that a dispatch arm cites by anchor, as workflows already cite `adversarial-review`
  § Pass record, so it does not pre-empt `composable-workflows`' private methods. D1–D6's cadence and source
  selection are its defaults. It keeps the common name for a review of the whole change set,
  design intent included: `implementation-audit` reviews "how a change realizes its intent".
- **`verification-review(scope)`** — new, at delivery-member and work-unit scope. `validate-criteria` becomes its pure
  check: criterion binding, the three-state model, immutability, and evidence. It is today the one check that declares
  its own vehicle (`arc.methods: adversarial-review`); the companion offer moves up into the operation, and
  `verify-work-unit` and `process-task-loop` stop restating it. Each of the companion's findings names the criterion it
  fails (D7's `**Fails:**`), so a finding outside the criteria reads as such rather than as a criterion gap.
  `deliver-stack`'s review-fix verification — "verification evidence for the exact correction delta, not a review
  verdict" — calls `validate-criteria` directly, which makes its exemption from the companion structural rather than
  unstated. `amend-design`'s closing criteria delta calls the check directly too: the amendment's independent pass is
  the `planning-review` over its footprint, and a second over the same delta would repeat it.

The family is discoverable by name and by one map: D7's `review-model` lists the three operations and places every
review method in its layer, and the methods index groups them.

**Drift fixed in the same pass**, each confirmed against source:

- `deliver-stack.md` tells a stack member to "Apply `frontline-review`", while `integrate-work-unit.md` says "Do not
  invoke frontline review" for the same member; the instruction goes.
- A block cloned into `integrate-work-unit.md` passes an override into "the named hosted, local, or frontline
  admission", and integration has no frontline admission.
- `prepare-work-unit.md` has `review-response` compose the proposal; everywhere else, and in the method, `review-triage`
  does.
- `create-spec.md` calls its `spec-review` pass "self-review", the name of another method.
- `integrate-work-unit.md` declares `adversarial-review` and never fires it; declarations follow the operations.
- The Errand's verified-fix replay — the exact approved request replayed with `verifiedFix` once the fix is committed
  (`respondToResolvedReviewCommand`, `respond-command.ts`), which records the performed response a fix check's chain
  needs — is stated only in `review-response`; `run-errand.md` leaves it out. `code-review`'s findings round names it.
- Pre-publication emits `run-self-review` while self-review is pending (`pre-publication-procedure.ts`), and the
  handler re-enters with self-review settled without checking that it ran (`handlers/review.ts`). No workflow arm
  handles the action, so `prepare-work-unit`'s dispatch gains one that runs `self-review` before re-entry.

Not here: one CLI driver for code review's four site commands (§ Coordination).

## Staging

Each segment closes on a capability that can be exercised:

1. **Cadence, local and hosted** (`slice`) — the first segment carries:
    - D1 with its convergence rule;
    - D5's bounded offer;
    - D6's source selection, carried to every composition by D4's next-pass context, with hosted incremental review
      removed and hosted admission refusing incremental coverage;
    - D6's fix-check chain, proved by the performed-response test at an open pull request and broken by a base move
      after an unchecked fix, the published singleton's local pass through ordinary local prepare with its three
      readers and its `coverage-required` route, and the delivery re-check keeping its source;
    - D5's one question per moment: local prepare's selection off the delivery path, status's on it after material
      fixes, and the complete pass admitted without a selection after a converged look;
    - D3's measure over the range each pass reviews, once its coverage is known, and the successor's own scope at one
      head;
    - D8's fix-check offer under `full-final`, and the Owner's stop at `coverage-required`;
    - D3's rubric in the incremental reviewer prompt, and D9's pointers in the complete one.

   It also carries the workflow prose they change:
    - the selection arms: local prepare's in `run-errand`, `prepare-work-unit`, and `integrate-work-unit`'s singleton
      route, and status's in `deliver-stack` and `integrate-work-unit`'s delivery route;
    - `integrate-work-unit`'s singleton local-pass arm in place of `run-review`;
    - the measure after the coverage pick, with the scope carried into local prepare and `--lanes`
      (`prepare-work-unit`, and `integrate-work-unit`'s singleton route, which gains the measure), and
      `deliver-stack`'s "another exact check" after movement naming status's own measure;
    - D6's bounded check at both applicability stops, with `assess-evidence-applicability` fired at
      `integrate-work-unit`'s pre-reconcile stop too, the arms that land a fix it prompts (complete-set approval at
      every stop; then outside a bound delivery `arc check gate commit` and an ordinary commit, and while one is bound
      the Owner's choice first, with `covered` or `targeted-check` holding only until the fix lands and no pass request
      or landing preparation for that member before it, then a correction task under a plan revision through
      `arc delivery review-fix continue -` once the continuation holds no other correction, and the second choice at the
      stop raised over the fixed head, with `covered`'s disclosure), and the `--coverage incremental` supplemental arms
      removed (`integrate-work-unit`, `deliver-stack`);
    - `run-errand`'s supplemental arm, which asks for the complete pass the review status offers, and its
      `coverage-required` arm (D1);
    - `run-errand`'s post-fix hosted arm ("carries `coverage: incremental` over only the fix range when that provider
      can");
    - the restated converged rule (`run-errand`, `prepare-work-unit`, `integrate-work-unit`), where `run-errand`'s "A
      converged result replays as complete" no longer holds for a converged fix check under `full-final`.

   Ships the main relief.
2. **Ceiling and fix-check approval** (`slice`) — D4's numbering, the ceiling's count carried to the driver by the
   next-pass context as an internal input, the ceiling decision after coverage selection, pass presentation, and the
   approval riding the disposition approval, verified against `seam-delivery-review`'s §4.3, §4.8, and §5.5.
3. **Shared model** (`layer`) — D7's method; its report surfaces, with the `**Fails:**` anchor in `adversarial-review`'s
   report schema and the code-review reviewer prompt; the prose aligned to it; and triage's rejection check with its CLI
   read (D9).
4. **Review family** (`replication`) — D10's three operations, `validate-criteria` narrowed to a check, the two
   renames (D7), and every site rewired to call them:
    - `run-errand` (with `drain-inbox`, which delegates to it), `prepare-work-unit`, `integrate-work-unit`, and
      `deliver-stack`;
    - `draft-design`, `create-spec`, `generate-tasks`, and `amend-design`;
    - `verify-work-unit` and `process-task-loop`;
    - `decompose-work-unit`'s direct check calls, and the `arc-design-audit`, `arc-task-audit`, and
      `arc-amend-design` doors.

   It closes when a step inventory re-derived on the then-current base shows every review step from before landing in
   exactly one place after, and D10's drift list is fixed.

## Open questions

None. Questions 1–10 settled on 2026-10-16 (D1, D3, D4, D5, D6, D9, and § Continuity); 5 and 10 by the probes on pull
request #1031, closed unmerged.

## Coordination

- **`seam-delivery-review`** — coordinated directly with its create-spec session (2026-10-16):
    - its §4.3 derives the pass count as the lane's pass policy counts it (D4; Owner-approved, in its spec);
    - the convergence rule needs nothing from it: its §9.1 drops the boundary's stored resolve envelope and
      recomputes it through the same derivation (D1);
    - no rework or origin tags are requested (D5 closed open question 3 without one);
    - D4's numbering is its suggestion and satisfies its §4.8 write check, which carries `validatePassCounts`; its
      Owner approved folding a fitting shape into its spec, and the shape was sent on 2026-10-16;
    - the `approved-fix` extra pass keeps its shape and key, and a fix check never cites it (D4);
    - its spec holds no `full-final` or incremental-policy text, and outcomes keep `requestedCoverage`,
      `effectiveCoverage`, and `correctionScope` as they are (§4.2);
    - file overlap, all in its §14.2: `local-review-coverage-selection.ts`, `core/local-prepare.ts`,
      `runtime/respond-command.ts`, `status-errand.ts`, and `hosted-reservation-discharge.ts`, plus
      `review-policy-driver.ts` and `review-policy-evidence.ts`, where it renames the `phase-closed` skip and reads
      extra-pass consumption — the convergence rule touches both. This work unit lands first; that member takes the
      base-merge conflicts;
    - `review/adversarial-pass` keeps its name, following the method's if that is renamed (D7; Owner-approved);
    - D6's source selection and its removal of hosted incremental review store nothing new: a hosted outcome simply
      never carries incremental coverage. Sent 2026-10-16 with the added file overlap (`hosted-reservation-support.ts`,
      `hosted-reservation-admission.ts`, `status.ts`, and `hosted/`'s CodeRabbit, Codex, and capability modules). Its
      spec relies on no hosted incremental coverage (its reply, 2026-10-16), and it asked that
      `HostedCoverageEvidenceSchema` stay parseable for the stored record holding one, which D6 keeps;
    - D10's method renames, new operations, and `validate-criteria`'s moved companion change nothing stored and keep
      `review/adversarial-pass` and the `standard-review/v1` rubric identity; sent 2026-10-16, asking whether its spec
      or task list names the renamed methods;
    - from source grounding, sent 2026-10-16:
        - the boundary stores the resolve envelope twice (`CandidatePolicyReviewBoundarySchema.policy` and
          `CandidateFixBoundarySchema.policy`), so its §9.1 drops both;
        - D4's complete count, `completePasses`, and the next pass's chosen coverage reach the driver as internal
          inputs beside `sources` and `maxPasses`, never on the command request your §6.4 snapshot stores (corrected
          after the first adversarial pass; the first message called it a request input);
        - D6's merge check would have stored an `IncrementalReviewScope` with a carried predecessor rather than a
          corrected one, which its outcomes carry as they are (its answer, 2026-10-16). The fresh loop's first pass
          replaced that check with a bounded check at the existing applicability stops, which stores nothing, so the
          note no longer applies; sent 2026-10-16, with the two shapes a counted merge check would need from it, both
          captured for after it (§ Scope's won't-do);
        - the renames keep every stored literal D7 lists;
        - its §4.3 says the lane's count "and the exhausted pass count with it" take only complete outcomes, which
          contradicts its own §5.1 (the next pass one past the exhausted count), the stored refinement that `nextPass`
          is `exhaustedPassCount + 1` (`core/operation-state-schema.ts`), and D4. Sent after the first fix-check round:
          the ceiling's comparison reads the complete count, and `exhaustedPassCount` stays the producing attempt's
          `logicalPass`. Its answer (2026-10-16): agreed and fixed in its working copy, uncommitted until its
          generate-tasks ceremony;
        - D7's render-only report inputs: its spec persists only the approved `DispositionSet` that
          `prepareDispositionProposal` builds (its §6.2), and the proposing call writes nothing, so inputs beside
          `proposal` are never stored (its answer, 2026-10-16). The `**Fails:**` anchor rides the same inputs; sent
          2026-10-16, and its answer confirmed they stay unstored;
        - added file overlap: `handlers/review.ts`, `runtime/review-policy-remedy.ts`, `lane-progress-conditional.ts`,
          `core/provisional-pass-assessment.ts`, and `delivery-local-review-admission.ts`;
        - sent 2026-10-16, the overlap shaping and the fresh loop added: `status-delivery-scope.ts`,
          `review-coverage-selection.ts`, `runtime/local-prepare-composition.ts`, `status-composition.ts`,
          `earlier-review-applicability.ts`, `earlier-review-attempts.ts`, `runtime/respond-composition.ts`,
          and `pre-publication-composition.ts`; and that the fix-check chain accepts a later Candidate head with the
          fix head's subject digest, an allowance its §14.3 deletion pass should keep, since its §12.5 spec-copy commit
          still follows a fix's response after the flip. Its answer (2026-10-16): the allowance survives, since §14.3
          names neither `confirmPrivateCandidateCorrectionBasis` nor this chain, and §12.5's wording that lands has the
          copy ride the commit after a fix's response; that text is under its own fix check, and it will say if a
          round changes it;
        - sent 2026-10-16, D6's reliance on delivery's correction route. Its answer: nothing there changes before its
          flip; from the flip, `commit-selection` and a review fix's record-effect settlement retire (its §14.3), which
          D6 does not rely on.
- **`delivery-rebuild-continuity`** — D6's check lands a fix under a bound delivery through the delivery's own
  correction route, authored only when the continuation holds no other correction. Two items are delivery's, routed by
  capture at draft close: a typed mark on the continuation's stops of the correction it holds, and of an approved fix
  from the check not yet authored, since today's `review-status-required` result carries neither
  (`handlers/delivery-execution.ts`) and `arc delivery position` reads neither a pending response nor a pending
  verification, so only the agent holds a member out of landing while such a fix waits; and whether a fix may land
  before the Owner's choice at a bound stop, which would spare the Owner the second choice D6 now asks there.
- **The storage program** — this work unit adds no stored record or record shape (§ Continuity). The review gate's
  machine-local state, lane progress included, sits under the storage register row `seam-delivery-review` owns, so
  D4's change to what the stored pass numbers count is coordinated there.
- **`review-orchestration-right-sizing`** — this work unit took its "Decide whether code-review lanes' next-pass
  recommendation adopts the re-inspection test" (D3, D5). Its "Give review-lane doctrine a strategy home" stays there
  whole, since D7's model is a method. Adjacent entries stay there: dropping correction obligations a later pass
  independently validated (a per-finding verdict is a record field), the fix-check sets in the adversarial-pass
  record, Errand scope conservation across review corrections, and review fixes that land outside a finding's cited
  file (delivery-member admission; the sibling sweep produces such fixes, so expect the guard there to matter when
  delivery resumes). D7's `review-model` and D10's operations now hold the review family's vocabulary and per-type
  defaults at their fire-points, so a strategy home there carries rationale and points to them rather than restating
  them; that entry's `_Split:_` line, which expects this work unit to mint a strategy, no longer holds. Routed by
  capture (2026-10-16).
- **`composable-workflows`** — D10's operations are instances of its D2 "procedure library + thin orchestration paths",
  written in `adversarial-review`'s contract shape, and D10's sites, operations, and checks answer its "uniform method
  interface" entry for review. Routed by capture so it consumes them rather than redesigning review's split.
- **One code-review driver** — code review's four site commands (D10) each carry their own state vocabulary; one
  typed driver or agenda would let `code-review`'s dispatch shrink further. CLI work beyond this scope, routed by
  capture with `WU_Target: TBD` (candidates: `composable-workflows`' agenda compiler, `review-protocol-alignment`).
- **`review-protocol-alignment`** — its chain's first member, `review-source-authority`, owns the durable
  Owner-accepted terminus D8's stop relies on. No other overlap is known.
- **`approval-flow-refinement`** — the queued Errand for one approval per review-fix round composes with D4's approval;
  neither should add a stop the other removes. Routed by capture to `autonomy-levels` (2026-10-16): D5's recommendation
  rides the disposition approval, and fix checks sit outside the ceiling with each round approved there (D4), so a level
  that lets the agent approve fixes may need a lever on fix-check rounds.

## Scope (provisional)

- **In:**
    - **Convergence and the next pass:**
        - the policy driver and evidence (`review-policy-driver.ts`, `review-policy-evidence.ts`);
        - `local-review-coverage-selection.ts` and `incremental-coverage-basis.ts`;
        - the next-pass context's shared helper (D4);
        - `core/local-prepare.ts`, `runtime/local-prepare.ts`, `runtime/local-prepare-composition.ts`,
          `runtime/respond-command.ts`, and `runtime/respond-composition.ts`;
        - `status-errand.ts`, `status.ts`, `status-composition.ts`, and `status-singleton.ts`;
        - the coverage selections (`review-coverage-selection.ts`), the singleton's route to local prepare and its
          three discharge readers (`hosted-reservation-support.ts`, `earlier-review-attempts.ts`), and the delivery
          re-check's source;
        - the delivery chunk measure (`status-delivery-scope.ts`);
        - the work-unit hosted path: `hosted-reservation-discharge.ts`, `hosted-reservation-support.ts`, and
          `hosted-reservation-admission.ts`;
        - pre-publication (`pre-publication-procedure.ts`, `pre-publication-request.ts`,
          `pre-publication-composition.ts`);
        - `handlers/review.ts`, the `arc review resolve -` handler included.
    - **The fix-check chain (D6):** the performed-response test at an open pull request in local prepare's confirmation,
      the `arc review resolve -` handler's, `runtime/respond-composition.ts`, `pre-publication-composition.ts`, and the
      discharge's earlier-review read (`earlier-review-applicability.ts`), with a later Candidate head accepted by
      subject digest; and the refusal of a leg whose fix a base move follows, delivery's included.
    - **Hosted incremental review removed:** `hosted/coderabbit.ts`, `hosted/codex.ts`,
      `hosted/correction-review-capability.ts`, `runtime/review-policy-remedy.ts`, and `cli.ts`'s help.
    - **Ceiling and presentation:**
        - lane progress's admission, validation, and conditional modules (`lane-progress.ts`,
          `core/lane-progress-state-validation.ts`, `lane-progress-conditional.ts`);
        - `lane-progress-hosted-request.ts`;
        - `review-additional-pass.ts`;
        - `core/provisional-pass-assessment.ts`.
    - **Configuration:** the `arc-config.yml` ceiling and standard-source comments in both copies, the latter naming
      `delegated-agent` as the source of fix checks.
    - **Methods:**
        - `review-model` and D10's three operations, with their recipe dispositions, `CONFIGURABLE_FILES` entries, and
          audit reachability;
        - `validate-criteria` narrowed to a check;
        - `frontline-review` and `standard-review` renamed, with the activation key, Configurable lists, recipe,
          manifest, and checks (D7);
        - prose in `classify-review-risk`, `review-triage`, `review-response`, `adversarial-review`,
          `resolve-planning-depth`, `review-chunking`, and `assess-evidence-applicability`;
        - `disposition-report`'s report shape, and the `fails` field in `adversarial-review`'s report schema (D7).
    - **Report rendering:** `renderDispositionReport` (`core/disposition-report.ts`), the material trend it renders
      (D5's fact), and the render-only inputs on the first `arc review respond -` call beside `proposal`
      (`RespondProposalRequestSchema`, `respond-command.ts`).
    - **Sites and references:**
        - D10's sites and doors;
        - the text that names the renamed methods: `AGENT-BRIEF.ARC.md`, `TECHNICAL-OVERVIEW.md`,
          `strategy-session-operations.md`, `strategy-configurability-architecture.md`,
          `strategy-package-project-sync.md`, `arc-checks.yml`, workflow and method frontmatter (`related:` included),
          `review-chunking.md` and `deliver-stack.md` body text, and the methods `README.md`; the spec re-derives
          the list.

  All of it lands in both copies, with tests. `routing.ts` should need no change (D1).
- **Won't do:**
    - a new record kind or field — it goes to `seam-delivery-review`;
    - stored rework or origin tags — observable facts suffice (D5);
    - a remaining-defect estimate or a quiet-pass stopping rule — none is validated;
    - per-path sensitivity — `seam-lifecycle`'s defects spread across all 11 chunks, so the evidence does not support
      it;
    - discharging correction obligations by independent validation — `review-orchestration-right-sizing`;
    - the durable Owner-accepted terminus — `review-source-authority` (D8);
    - human review — out of band (D7);
    - renaming `adversarial-review`, `validate-criteria`, `full-final`, or the `standard-review/v1` rubric identity —
      weighed and declined (D7);
    - one CLI driver for code review's four site commands — routed (§ Coordination);
    - a counted merge check, which needs a stored scope marker, and a `targeted-check` choice on the
      review-applicability selection — both shapes are `seam-delivery-review`'s, captured for after it (D6);
    - a typed base reconcile between fix rounds through the terminal planner, for overlapping drift under `full-final` —
      captured (D6);
    - delivery-member review-fix admission.
