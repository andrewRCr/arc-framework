# Notes: Integration Boundary Delivery

**Design:** `spec-integration-boundary-accuracy.md`

## Delivery Decision

This work unit delivers as a **stack**: one concern, one spec, dependency-ordered members each independently
landable to `main` (the delivery-plan record's `stack-to-main` projection). Decomposition was assessed and
declined — the surfaces are coupled by design, and a component cut would distribute one cohesive design into
cross-referencing sibling specs. Delivery topology absorbs the size; the work-unit boundary does not move.

The delivery plan is authored from the finalized task list at the end of task generation
(`arc delivery plan from-tasks` → author slots → `arc delivery compose`; the `stack-to-main` projection requires
two or more members, every member `independently-landable`, the verification task assigned to none). Plan
authoring is available now; the landing machinery (materialize / land / rewrite / teardown and the member-review
admission seam) ships with `delivery-stack-topology`, so integration holds until that work unit lands. The
`from-tasks` entry requires a strict design-inventory JSON; a schema-emitting verb is planned there — hand-build
the inventory if task generation finishes first.

## Sizing Evidence

- The original high-depth Pass 1 skeleton read 26 substantive parents across seven phases, implying roughly
  64–77 executable leaves, with a likely delivery range of 9,000–13,000 changed lines against historical
  per-leaf calibration (roughly 106–121 lines per leaf on PRs #310, #313, #329).
- The re-grounded spec should land below that range: Goal 5 now deletes obligations rather than relocating them
  (the post-approval re-validation cascade beyond one status read, duplicate drift reads, the readiness verb's
  forensic posture), and D2 composes the shipped `arc merge lock` verbs rather than minting a dispatch and
  provenance subsystem. Re-estimate at task generation; every plausible estimate still exceeds a single-PR
  ceiling, so the stack decision does not hinge on the re-estimate.

## Stack-Member Seed

The six groups below seed the stack members and task-list phases (phase-aligned boundary is the offered
convenience; explicit segments remain available). Task generation may ground, revise, split, or reorder, but
should not rederive the structure from an empty file. Order is dependency order; every member must stay
independently landable.

### 1. `candidate-review-attestation`

**Outcome:** Candidate as a storage-neutral verified lineage; private review progress machine-owned.

- Define Candidate attestation, currentness, and projection records — E1-E2, E4 · `many`
- Replace verification finalization with idempotent `propose` — E1-E2, E4, E6 · `2-3`
- Drive pre-publication review and convergence verification — E3-E4, E6 · `many`
- Project Candidate and review loci into status and session initialization — E9 · `2-3`

### 2. `submission-publication-boundary`

**Outcome:** Attestation separated from publication scheduling; lifecycle vocabulary true in every lock mode.

- Rename the lifecycle transition to `submit` and free the `integrate` namespace — E5, E7-E8 · `many`
- Enforce Candidate-aware, reservation-preserving submission — E3, E5-E6, E9 · `2-3`
- Move the transition to the publication-step head and preserve exact resume loci — F1-F4 · `many`

### 3. `integration-review-primitives`

**Outcome:** Typed, provider-neutral integration-boundary primitives shared by both publication lanes.

- Resolve exact-head change-request disposition and next action, host-anchored — D1 · `many`
- Resolve configured merge method against live repository policy — B4, D3 · `2-3`
- Extract and expose the provider-neutral bounded wait primitive — D2 · `2-3`
- Instantiate the required-checks await on the exact head — B8, D2 · `2-3`

### 4. `integration-checkpoint-composition`

**Outcome:** The stopless pre-approval span collapsed into a fail-closed checkpoint composing only
decision-relevant evidence.

- Build the typed integration checkpoint and readiness verdicts, folding lifecycle readiness — A, B1, B4 · `many`
- Shrink `arc review readiness` contract-preservingly for its remaining consumers — B1 · `2-3`
- Persist digest-bound approval composition and settlement plans — B3 · `many`
- Compose exception-filtered machine evidence with an extension boundary — B5, B7 · `2-3`
- Place the shared `pre-merge` seam after a ready checkpoint — B6 · `2-3`

### 5. `integration-settlement-merge`

**Outcome:** Exactly the approved settlement and record execute before a policy-revalidated, pinned merge, with
re-lock as the fail-closed exit.

- Execute persisted review settlements idempotently — B2-B3 · `many`
- Release the lock, await required checks, revalidate policy and drift, merge pinned — B2, B4, D2, H · `many`
- Re-lock on every approval-voiding exit; leave a deadline yield released — B2, D2 · `2-3`
- Post the checkpointed review record without `Coverage` — B3, G · `2-3`

### 6. `integration-workflow-convergence`

**Outcome:** Both integration workflows reduced to typed procedures plus their real stops; every control
obligation preserved or its deletion covered.

- Merge the base only against the checkpointed revision — C1-C2 · `2-3`
- Resolve exact-target review status after head-changing reconciliation — C3 · `2-3`
- Recast the work-unit reconcile arm as thin orchestration — A, C4-C7 · `many`
- Converge the errand lane: seam placement, record cut, pin disclosure, lane arms — B4, B6, D1-D3, G-H · `many`
- Restore the errand tail's terminal-exit semantics and check-cadence honesty — B8, I · `2-3`
- Replace prose-string pins with typed contract and cross-lane scenario coverage — B-I · `many`

The task list carries one terminal verification phase pointing to `verify-work-unit.md`, assigned to no member —
the `stack-to-main` projection requires the sole verification task unassigned (`spec-delivery-plan-record.md`
§ 2); per-member verification at landing is the landing machinery's ceremony, not task-list structure.

## Process-Shape Projection

The operator-experience measure the finished suite is judged against (Success Criteria 1, 2, 4, 6, 16, 17
carry the checkable forms):

- **Work-unit lane today:** a 14-step workflow whose final step runs ~176 lines of prose sequencing — three
  drift reads, three independent lifecycle readers, a nine-part interlock surface, a workflow-wide re-lock
  invariant — with full CI firing on every pushed head from PR open onward.
- **Target:** checkpoint (one verb, one typed verdict) → one human stop over the decision surface → merge (one
  verb that releases, awaits checks, revalidates, merges, and re-locks on failure). The reconcile arm is five
  stop-bearing spans of orchestration over typed procedures. The no-review path adds zero commands, commits,
  approvals, or judgments over today's.
- **Errand lane today:** ship path leaves at PR open and re-enters blind, repeatedly, through CI and review.
- **Target:** in-session to merge or armed auto-merge; leave fires only on a session-ending tail.

Recount at verification: residual step length must be a function of the stop inventory alone.

## Baseline-Coherence Rule

Before task generation resumes — and again if substantial base lands while this branch idles — compare the spec
against the delivered implementation of every predecessor it composes (`merge-readiness-control`'s lock verbs,
`delivery-slice-review-vehicle`'s vehicle kinds, `delivery-stack-topology` once landed). Amend stale factual
assumptions and substrate references; preserve settled design unless delivered behavior materially invalidates
it, and route any such invalidation back through spec review. Last run 2026-08-12 (spec re-ground).

## Verification Findings

Recorded 2026-08-15 at the verification boundary, from the advisory adversarial pass (`adversarial-review`, pass
one of two, `Heavy` cap). Every finding below was verified against source before it was recorded; the pass ran
from fresh context with the implementer's success-criteria markings withheld. Phase 7 remediates them.

**Why the self-verify missed the blocker class.** The implementer pass validated each criterion against the new
typed modules and their unit suites, which pass because they inject their dependencies. It did not trace whether a
production caller reaches those modules. Every blocker below is invisible to that method and visible to a
call-graph read — the durable lesson for this boundary is that a criterion naming a runtime behavior needs a
reachability check, not a contract check.

### The blocker class — production wiring absent

Phase 1's typed surfaces landed with their contracts and tests; the CLI registration and write paths that reach
them did not. The spine `propose → pre-publication → submit → checkpoint → merge` has no executable path.

| # | Defect                                                                                   | Verified evidence                                                                                                                                                                                                                                                        | Criteria |
| - | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1 | `arc submit` refuses unconditionally on first call                                       | `handlers/lifecycle.ts:1654` refuses when `readSubmissionBoundary` is null; the sole production `writeSubmissionBoundary` caller is `:1706`, inside `handleSubmit` after `runSubmit` succeeded                                                                           | 4, 6, 9  |
| 2 | The pre-publication procedure is unreachable and its next-action command is unregistered | `pre-publication-procedure.ts` has zero `src/` importers; four production sites emit `arc review pre-publication <wu> --json` while `cli.ts` registers no such subcommand; `createStandardReviewReservation` has no production caller, so no reservation is ever created | 6, 7, 15 |
| 3 | The checkpoint composes no review record and no settlement plan                          | `checkpoint-composition.ts:276` hardcodes `reviewRecord: { markdown: null, … }`; `:279` hardcodes an empty `composeSettlementPlan`                                                                                                                                       | 3        |
| 4 | Candidate lineage never advances                                                         | `responses` is written in production only as the literal `[]` at `propose.ts:129`; the appender lives in the unreachable module                                                                                                                                          | 5, 7     |

Defects 3 and 4 interlock: the always-empty `responses` keeps `dispositionIds` empty, so the record/plan
invariants at `checkpoint.ts:88` and `:377` hold vacuously and the composition fails **silently** rather than
throwing. Restoring the lineage writer without also composing the record would convert this into a hard
`composition-unavailable` block, so the two land together.

### Obligation losses

- **The `G2` disclosure the `Coverage` cut was priced against.** `main`'s interlock callout enumerated "every
  review applicability call and targeted verification" and the complete candidate-tail diff. The rewritten
  work-unit callout surfaces the nine-signal composer text alone, and no signal kind covers review applicability
  or targeted verification. Spec § G2 licenses "nothing replaces it" precisely because those facts stay surfaced
  live at the stop. The errand lane still carries the item, so the two lanes diverge. Criterion 12's literal
  text holds; its justification does not.
- **The lifecycle-artifact readiness gate under `merge.lock: none`.** `main` ran `arc status --json` product
  validation and `arc review readiness -` before merge, independent of lock mode; both are deleted from the
  workflow. The only surviving production reach is through the lock release, and `merge-lock.ts:214` returns
  `noLock("lock-disabled")` before `gateCandidateReadiness` at `:230`. Under that supported configuration a work
  unit can merge with no Completion Notes. Not one of Goal 5's four authorized relocations, and no covering
  enforcement was named — Criterion 14 classes that as a defect.
- **The errand lane's pre-create head re-validation.** `main` re-read the remote head and compared it to
  `proposedChangeRequest.headSha` immediately before `gh pr create`, after the `pre-pr-open` actions ("Never
  create against a head that changed after validation"). The rewrite deletes it and leaves head validation only
  at `arc review change-request resolve`, which runs _before_ those actions. `pre-pr-open` is project-authored
  and guaranteed only retry-safe, so the window the deleted sentence closed is open again. Spec D1 authorizes
  folding the _work-unit_ lane's _missing_ check into the resolver; it does not authorize relocating the errand
  lane's existing one earlier.

### Surface residue

- Checkpoint and merge refusals fix `nextAction: "stop"` for every blocked reason and carry no corrective
  command, against Criterion 15's closing clause.
- `QUICK-REFERENCE` presents bare `arc integrate` as invocable — it errors — and omits `checkpoint` and `merge`,
  which landed here.

### Raised and not confirmed

The pass flagged two further `integrate` residues that are not defects: `draft-roadmap-tooling.md`, which the
spec's own inventory classes as a forward-reference rather than an invocation, and a `reopen.test.ts` docstring
outside the five inventoried test files.

### Why lane-progress persistence is part of the remediation

Established while scoping the pre-publication wiring, and the reason Phase 7 opens with a persistence task rather
than the registration it was first planned as.

`projectPrePublicationReview` needs, per lane, `completedPasses` and an ordered `attempts[]` whose outcomes come
from a twelve-value vocabulary. `isSafeUnavailable` reads exactly two of those values — `rate-limited` and
`transient-unavailable` — to decide whether a lane may fall through to the next configured source, and the request
schema enforces that structurally. So outcome fidelity is load-bearing, not descriptive.

Three facts decide the shape:

- `awaitHostedReview` already returns the driver's exact vocabulary, including the four unavailable-class values
  the fall-through decision turns on. The information exists at attempt time.
- The standard lane persists nothing per attempt — no receipt append, no operation publish anywhere under the
  hosted or GitHub host paths. That fidelity is computed and dropped.
- Where outcomes are persisted, they are collapsed: receipts to `clean | findings | unavailable | failed`, the
  frontline run state to eight values. Both fold two fall-through-safe and two unsafe outcomes into one
  `unavailable`, so the distinction cannot be recovered from **storage**.

**Correction, recorded during 7.1.c.** The third point above is true of what each lane _persists_ and was wrongly
generalized to what the frontline lane _computes_. `FrontlineExecutionOutcome` carries a `reason.class` beside its
`outcome`, and that class holds the full distinction: `unavailable` splits into `rate-limited`,
`transient-unavailable`, `source-unbound`, and `capability-unsupported`, and `failed` into six classes including
`invalid-output` and `authorization-rejected`. The original read checked `outcome.outcome`, saw the eight-value
enum, and concluded no finer axis existed upstream. It does. The consequence is that the frontline lane needs no
schema widening — only the same shape of mapping the hosted lane uses — and that the fidelity problem is
consistently one of _persistence_, not of computation, across both lanes.

Deriving lane progress from existing records therefore does not close, and the alternative — having the agent
supply the progress facts in a composed request — reintroduces exactly what Goal 6 places with the CLI (`source
order, pass ceilings … are CLI-owned`) and what Task 1.4's Goal forbids (`no parsing of … pass counts`). The
remedy is to stop discarding a fact the system already computes at the right fidelity: a `lane-progress` variant on
the existing `ReviewOperationStateSchema` union, written where each lane already knows its outcome. Composing the
existing versioned operation store keeps this a record variant and its write sites rather than new storage.

## Verification Findings — pass two

Recorded 2026-08-15 at the reopened verification boundary, from the second advisory adversarial pass
(`adversarial-review`, pass two of two, `Heavy` cap). Tier 3 was green when the pass ran: md lint over 664 files,
the three `lint:arc:*` contract checks, `lint:ts`, `lint:sh`, both type checks, 9956 tests passing with one
skipped, and a clean build. The pass ran from fresh context with the implementer's success-criteria markings
withheld; every finding below was verified against source by the primary before disposition.

**Why pass one's lesson did not generalize.** Pass one's recorded lesson was that a criterion naming a runtime
behavior needs a reachability check rather than a contract check. That lesson was applied — to Phase 7, the region
where it was learned. Every Phase 7 remediation traces to a production caller and holds. But F5 below is an
unreachable enumerated state in a module Phase 7 never touched, and F2 is an unimported export. The lesson was
applied to the instance and not to the class.

**The self-verify's structural blind spot.** Pass two's findings are almost entirely **completeness** questions —
which cases do not reach this, which value has no writer, which inventoried site was not converted, whether the
composed artifact reaches a human. The self-verify asked "is there code that does X" and found it every time. That
method finds what exists and cannot find what is missing: presence has a signature, absence does not. Two passes,
two distinct defect strata, no sign of convergence.

### Confirmed findings and dispositions

| #   | Finding                                                                                       | Severity           | Criteria | Disposition                                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------ | -------- | ----------------------------------------------------------------- |
| F1  | The approver never previews the `## Review` record approval is said to cover                  | blocker            | 3        | Dissolved by the § G reduction; a **residue** remains — see below |
| F3  | Approved no-fix disposition sets reach neither the record nor the settlement plan             | major              | 3        | Fix the **plan** half; record half dissolved                      |
| F4  | The `Hosted PR` line reports the frontline advisory lane; hosted review is unrepresentable    | major              | 3        | Dissolved by the § G reduction                                    |
| F5  | `hosted-review-pending` is read in five places and written in none                            | major              | 15       | Fix — derive the locus                                            |
| F6  | The checkpoint asserts the hosted reservation satisfied without reading it; nothing clears it | major              | 6, 2     | Fix — compute the requirement                                     |
| F7  | PR-state branch site 3 was never converted to the typed resolver (4/5 delivered)              | major              | 10       | Fix — mechanical                                                  |
| F8  | Task 7.6's restored disclosure ships unpinned; `candidateTailDiff.reference` never rendered   | minor              | 12, 2    | Fix — add the pin                                                 |
| F9  | Pre-publication refusals name no corrective command                                           | minor              | 15       | Fix — extend `spineRemedy`                                        |
| F2  | Hosted settlement composer has no production caller                                           | minor (downgraded) | —        | Capture; dead capability, not a correctness gap                   |
| F10 | `--change-set` / `--lanes` are `<file \| ->` inputs § Coordination commits against            | minor              | —        | Capture                                                           |

**F2's downgrade.** The pass called it a blocker on the reasoning that hosted settlements never reach any plan.
The evidence is right and the inference is not: `integrate-work-unit.md` § 4 settles hosted findings inline via
`arc review hosted settle -` through `handlers/review.ts:1525`, before the checkpoint. The plan legitimately
carries no hosted actions, so Criterion 3 holds. What remains is dead capability — a schema arm, a composer, and
the merge executor's `settleHosted` binding with no producer — plus a loose interlock disclosure, corrected under
F1's residue.

**F1's residue, which the § G reduction does not touch.** `main`'s interlock callout surfaced "the proposed final
dispositions"; the convergence rewrite dropped it and Task 7.6 did not restore it. This matters because
`integrate-work-unit.md` explicitly permits a complete no-action record-only set to remain **proposed** for the
final combined gate — so disposition sets can reach the integration interlock unapproved, receiving their first
and only approval there. Having no approved-disposition record, they also never enter the checkpoint's count. They
are invisible on both surfaces, and the approver is asked to approve dispositions never shown. The errand lane
still surfaces them (`run-errand.md` § 5), confirming a loss rather than a design change. Already-approved sets
need no expansion — each was individually approved upstream and the interlock authorizes execution rather than
re-deciding; what the checkpoint adds is deterministic, verb-validated target binding.

### The precedent review

Run before deciding F4, because the alternative to fixing the record was cutting it, and that choice turns on
whether the shape has precedent. Three parallel external passes, no verification tier.

- **No established convention records, in a pull-request body, what review a change received.** Checked across
  major PR/MR template collections, the contributing guides of Kubernetes, Rust, Node.js, Envoy, Chromium and
  others, published conventions (Conventional Commits, Conventional Comments), public engineering handbooks, and
  regulated-context practice (SOC 2, FedRAMP, IEC 62304), where audit evidence comes from platform approval
  records or a separate QMS rather than PR prose.
- **Two real traditions exist, and neither is prose in a PR body.** Commit trailers — kernel
  `submitting-patches.rst`, Git's `SubmittingPatches`, Gerrit's auto-appended footers, and on hosted platforms
  Node.js's required `Reviewed-By:` and GitLab's `approved_by` — attest **who** reviewed, never what was found.
  Detached signed attestations — SLSA Source Track, in-toto, VSAs — are explicitly not prose; in-toto's
  human-review predicate has been an open issue since December 2021, and SLSA names a code-review attestation as
  an example then declines to define its schema.
- **A structured findings-and-disposition summary is genuinely unprecedented**, on-platform or off. Stated
  independently by two of the three passes.
- **Three AI reviewers do write to the PR body** — CodeRabbit (appended summary, regenerated every push, or
  anchored at `@coderabbitai summary`), Sourcery ("Summary by Sourcery", and it can rewrite the title), and Qodo's
  `/describe` when it holds write access. All three write a **description of the change**, not a record of review
  received. Everything else surveyed uses comments, Check Runs, or commit statuses.
- **`Reviewed-by:` is human and consent-gated.** Kernel docs require the named reviewer's permission and treat
  fabrication as a serious trust violation. No tool-as-reviewer trailer standard exists; `Assisted-by:` and
  `Coding-Agent:` cover AI **authorship**, not AI **review**. ARC must not put a carrier in `Reviewed-by:`.
- **Local, pre-PR review carry-forward is a settled negative.** CodeRabbit CLI, Qodo's IDE review, and Semgrep's
  pre-commit hook were each checked: when they run before a PR exists, the review leaves no trace on the eventual
  PR unless a human pastes something in. No vendor recommends anything.
- **Where durable machine-readable evidence lives when it exists**: Check Runs (coarse) and SARIF via platform
  code scanning (finding-level, with structured dismissal reasons including `won't fix`). Both platform-owned and
  vendor-independent — the standard to meet rather than parallel, if finding-level disposition is ever wanted.
- **`gittuf`'s Reference State Log** is the one purpose-built answer to review evidence the forge cannot see: an
  append-only, individually-signed hash chain in a repo-local ref, positioned as the platform-agnostic route to
  SLSA Source L3. Structurally close to `refs/notes/arc/user/{identity}`; long-horizon, routed to capture.

### The four decisions

**F3 — compose from approved-disposition records, scoped to the Candidate.** The Candidate lineage answers "has
the implementation moved, and was the movement explained"; the review record and settlement plan answer "which
approved dispositions exist". Task 7.5.a indexed the second off the first, and a `defer`/`reject`-only set moves
no implementation, so it correctly appends nothing to the lineage and wrongly vanishes from the plan. The lineage
is behaving as § E designed; the plan was hung off the wrong axis.

Rejected: widening the lineage to append no-fix sets. `projectCandidateCurrentness` reduces old/new target pairs to
decide `implementationChanged`, which drives B1's convergence gate and Criteria 5 and 7 — both of which hold today.
Degenerate members in that reduction risk working machinery, and a currentness ledger carrying non-currentness
entries to serve a second consumer is the second-ledger shape (see `USER-INBOX` "Census the hosted-lane record
family against the no-second-ledger doctrine").

Two sub-decisions settled with it. **Scope is the full Candidate span** (`attestation.baseRevision..approvedHead`),
not the candidate-tail span — `checkpoint-composition.ts` computes `fromRevision` from the last response, correct
for the tail diff and wrong here, because a defer/reject review that ran before a fix landed falls outside the tail
and would be dropped again. **Ordering needs an explicit deterministic key** — resolved origin-target revision,
tiebroken by `dispositionSetId` — because the handle digests the composed plan and lineage order no longer
supplies it.

Why the plan half survives the record cut: `settleApprovedReplay` is compare-and-confirm, not state-change. It
reads the durable disposition record, returns `missing-record` if absent, throws `corrupt-state` if the stored set
differs, and otherwise idempotently re-asserts. Excluding a set means the merge verb never re-verifies it — the
Criterion 3 guarantee, not record cosmetics.

**F4 — cut the record; keep an attestation-shaped marker.** Recorded as § G's amendment. The decision boundary
matters and is recorded there: the defects prompted the question, the precedent answers it.

**F1 — restore proposed final dispositions to the work-unit interlock callout**, alongside what 7.6 restored, and
scope the "channel settlement" clause to the review-response channel, since hosted settlement already ran at § 4.

**F5 / F6 — derive, do not store.** § E9 settles the direction: the loci are "operational loci, not stored
lifecycle states." `projectPublicationBoundary` takes `state` as a caller-supplied literal that drives the locus,
the `nextAction.kind`, and the emitted command; all three production callers pass `"publication-pending"`, so the
entire hosted arm is dead and a hosted-first WU interrupted mid-review is told to run `arc submit` — a transition
that already fired.

Rejected: giving the reservation an explicit discharge write. A write needs a caller who remembers to call it, and
"nobody wrote it" is exactly the realized failure — F6b is that approach's failure mode, already observed.
Derivation cannot drift.

Also ruled out: checking only at the approved head. Cheap, but it hard-blocks the checkpoint after any head
movement until hosted review re-runs, overriding § 4's review-applicability judgment leaf with a CLI gate — the
wrong side of the line Goal 6 draws.

**Discharge semantics:** the reserved `sourceId` produced a verdict-bearing attempt (`clean` or `findings`) on the
hosted lane within the Candidate span. Task 7.1's `lane-progress` already persists exactly this, and
`pre-publication-composition.ts` already binds `readLaneProgress`; `checkpoint-composition.ts` does not yet reach
it. The span read is the real implementation cost, since `lane-progress` is keyed `(lane, repositoryId, headSha)`.

**One activation hazard to carry.** `checkpoint.ts` throws when `requirementSummary.conclusion !== "satisfied"`.
That is dead code today because the requirement is hardcoded satisfied. Computing it activates a **throw**, which
surfaces as untyped `operation-failed` — the class Tasks 7.9 and 7.12 worked to eliminate. Activation must land
with a typed blocked reason (`hosted-reservation-pending`, remedy `arc review pre-publication <wu> --json`); 7.9
made both reason sets derive from the refusal schemas, so a reason without a remedy fails to compile.

## Verification Findings — third-entry falsification pass

Recorded 2026-08-16 at the third entry of the verification boundary. Method per the Resume Procedure below:
falsification over confirmation, structured as eleven delegated read-only lenses — six criterion clusters, three
failure-class sweeps (reachability, inventory, human-surface), seams, and a configuration-matrix scenario walk —
with every finding below verified against source by the primary before recording. This is the boundary's
structured self-verify, not a third `adversarial-review` pass; the `Heavy` pass cap remains spent. Tier 3 ran
green first at `f4cbf34ff`: md lint over 664 files, the three `lint:arc:*` checks, both lint passes, both type
checks, 9969 tests
passing (1 skipped), clean build.

**The stratum this pass mined.** Pass one found unreachable code; pass two found incomplete code. This pass's
blockers are **composition-over-time** defects: each verb is locally correct, and the failure appears only when
the spine's own ceremony writes (a transition commit, a regenerated projection) become inputs to a later verb's
validation. Static per-verb review cannot see them; walking the state machine across real sequences can.

### Blockers

**V3-B1 — defer/reject-only settlements permanently invalidate the merge.** Pass two's F3 remediation fixed
composition and broke execution. A no-fix disposition set composes with `fixTarget: null`
(`lineage-review-composition.ts:150`); the merge adapter therefore omits `settledFixTarget` from the replay
(`merge-composition.ts:106`); the replay hits the stale-target gate (`respond-command.ts:559`) **before** the
already-settled record read (reachable only inside the `settledFixTarget !== undefined` branch, `:601`); the
executor maps that to `stale` (`settlement-execution.ts:57`) and the merge verb returns `invalidated`. The head
always moves past the review origin — the `arc submit` transition commit at minimum — and the schema refinement
(`response-plan-schema.ts:108`) forbids attaching a fix target to no-fix sets, so there is no request-shape
workaround; re-checkpointing recomposes the identical plan. Any work unit whose review produced one defer- or
reject-only set can never merge. Fail-closed, no in-band escape. No test executes a defer-only replay against a
moved head (the e2e covers composition only). Criteria 3 (intent: the executed settlement is exactly what
approval covered — here a validly approved settlement never executes).

**V3-B2 — `arc submit`'s own ROADMAP render deadlocks the spine under arc-in-git.** The lifecycle executor
renders ROADMAP on every transition and stages it into the transition commit; the In Flight table's `State`
column changes on `Active → Integrating`, so the render changes tracked content. `git-candidate-subject.ts:59-63`
classifies only `meta-{name}.md` as operational and the record/boundary as projections — the regenerated
`.arc/backlog/ROADMAP.md` is **reviewable**, enters `subjectDigest` (`createCandidateSubjectSnapshot` digests
reviewable entries only, which is why meta churn survives), and no response explains it →
`projectCandidateCurrentness` returns `blocked` (`candidate-attestation.ts:288`) → checkpoint blocked. `arc
propose` runs the same projection first (`propose.ts:77`) so it blocks identically; a new lineage root mints only
when the record is absent (`propose.ts:116`), i.e. out-of-band deletion of the managed record — which resets
`responses` to `[]` and drops every prior approved disposition set from the settlement plan (outside both `named`
and the new span). This repository will hit the deadlock at this work unit's own submit. Criteria 5 (operational
churn must not block), 3 (coverage loss on the escape path).

### Majors

| #      | Finding                                                                                      | Criteria |
| ------ | -------------------------------------------------------------------------------------------- | -------- |
| V3-M1  | `checkpoint-missing` returns `invalidated` without re-locking (`merge.ts:235-244`)           | 11       |
| V3-M2  | Three of six E9 loci never surface at `arc status` / session-init; dead store-accept branch  | 15       |
| V3-M3  | Handler-synthesized refusals omit `remedy` and violate the published result schemas          | 15       |
| V3-M4  | Commit-unpushed fix-loop resume dead-ends at the resolver's `ambiguous / stop`               | 15, 9    |
| V3-M5  | Clean interlock surface omits "where review landed" from the composed decision line          | 2        |
| V3-M6  | Merge-failure catch path re-drafts without checking whether the merge landed                 | 11       |
| V3-M7  | E4 verification applicability is persisted but read by no production path                    | 7        |
| V3-M8  | Five of eight next-action kinds have no consumer (three unreachable by the prose's own rule) | 15       |
| V3-M9  | `arc submit` authorizes a stale pre-publication boundary after a lineage advance             | 6        |
| V3-M10 | Post-PR typed next action stays frozen at `arc submit`; prose recovers by bypassing it       | 15, 6    |

- **V3-M1.** Narrow window: a resume after an `awaiting-checks` yield whose gitignored checkpoint store is gone
  (machine switch) leaves the release standing while the approval is void. Routing through the `invalidated()`
  helper is safe in both directions (`holdLock` accepts already-held / no-lock).
- **V3-M2.** `commands/active/status.ts:349-353` projects `candidate-review-pending` unconditionally for Active,
  ignoring a persisted `candidate-submit-ready` boundary; `:336` accepts a stored `hosted-review-pending` nothing
  writes; `changeRequest: null` at `status.ts:345` and `subject-meta.ts:121` means the hosted derivation cannot
  fire at these surfaces. Deliberate-conservatism reading exists (docstring); E9/SC15's text says otherwise.
- **V3-M3.** `handlers/integration.ts:122-130, 158-166` — no `remedy`, unvalidated `workUnit` echo; consumers
  validating the published schemas reject the envelopes. Compounding: `merge.ts:234` calls `readCheckpoint`
  outside its try and the store **throws** on malformed/mismatched records (`checkpoint-store.ts:126,137`) with
  no handler catch — a corrupt store file is an unhandled crash, not a typed refusal.
- **V3-M4.** `change-request.ts:82` classifies an open PR with a moved (locally committed, unpushed) head as
  `ambiguous / stop`; the resume table maps it to "stop on the resolver's typed action". The remedy — push, then
  re-resolve — is projected nowhere.
- **V3-M5.** Criterion 2 enumerates three decision facts; `interlock-surface.ts:62-63` renders head + candidate
  tail + method + `repo#PR`. On the clean path the hosted-discharge detail collapses into "9 checks clean" and no
  line names where review landed (local carrier vs which hosted source).
- **V3-M6.** `merge.ts:307-331` — `mergePinned` throws on a nonzero `gh pr merge`; the catch holds the lock
  without a merged-state re-read, so a merged-but-command-failed race ends `blocked/relock-failed` against a
  merged PR. The pre-hold merged-state re-read existed on `main` and was dropped.
- **V3-M7.** `candidate-attestation.ts:215` persists the primary's targeted/focused/full choice;
  `projectCandidateCurrentness` (the sole consumer of `record.responses`) reads only `implementationChanged`.
  A primary could always answer `targeted` and nothing downstream would object.
- **V3-M8.** `continue-frontline-review` / `continue-standard-review` / `respond-to-findings` are structurally
  unreachable (the prose's null-policy rule bypasses them whenever they are emitted); `continue-publication` /
  `continue-hosted-review` appear in no workflow — Step 1/Step 4 re-derive the routing from the resolver and
  `integrationBoundary.reservation` directly.
- **V3-M9.** `authorizeSubmission` (`submit.ts:49-64`) validates candidateId + locus only — no head binding; the
  boundary's only writers are the pre-publication settle (`review.ts:1593`) and submit itself
  (`lifecycle.ts:1726`); `propose` never touches it and its blocked/convergence arm routes straight to
  `arc submit` (`propose.ts:111`). After a fix + re-attestation at H2, submit accepts the H1 boundary and the
  standard lane never re-enters — against E3's changed-target re-entry.
- **V3-M10.** `submit.ts:248-255` hardcodes `changeRequest: null` (comment acknowledges it) and nothing promotes
  the stored boundary after the PR opens, so the typed next action reproduces the `arc submit` unchanged-loop
  forever; the workflow recovers only by reading `.reservation` raw and calling the resolver live.

### Minors

Dangling "exact-head mutability action" narration (`integrate-work-unit.md` Step 13, ~line 476 — the
`assert-head-mutable` launcher it names was removed before this work unit); the bounded checks wait is invoked by
prose that never names `arc review checks await`; `--json` refusals on submit/propose emit prose, not JSON; the
`awaiting-checks` payload carries `elapsedMs` while the prose promises "the returned deadline"; refusals without
corrective commands on the propose active-record guard, `parseLifecycleCommand`, the errand lane's merge-method
resolve, and review status blocked; `session-handoff.md:662`'s finalize pass still hand-rolls `gh pr view`;
`composeHostedSettlementAction` remains production-uncalled (pass-two F2 residue); `persistBoundary` skips the
convergence-pending locus (one extra pre-publication round-trip); the errand lane's integration-interlock text is
not content-pinned by tests while the work-unit lane's is.

**Phase 9 disposition.** The bounded workflow, refusal-envelope, remedy, persistence, and content-pin findings
above close in Task 9.9. Two deliberate residues remain at their existing `USER-INBOX` captures:
`session-handoff.md`'s raw `gh pr view` parse needs a separate workflow refactor, and the production-uncalled
`composeHostedSettlementAction` stays census input for `review-source-authority` rather than gaining an artificial
caller here.

**Phase 9 disposition amendment.** The session-handoff item is the same typed PR-resolution concern despite
sitting outside the original five-site inventory. Task 9.9's follow-up converts that finalize pass as well. Only
the production-uncalled `composeHostedSettlementAction` remains deliberate residue for the record-family census.

### Adjudicated not-defects

The errand lane's retained `git ls-remote` pre-create head check (flagged independently by three lenses as a
hand-rolled parse against Criterion 10) is the deliberate Phase 7 restoration of pass one's third obligation
loss; spec D1 authorizes folding the work-unit lane's missing check into the resolver and does not authorize
relocating the errand lane's existing one. The `pre-merge.md` copy divergence predates this branch (project
instance vs shipped template). `draft-roadmap-tooling.md` and the `reopen.test.ts` docstring remain the
pass-one-adjudicated non-defects.

### Verified clean

Criteria 8 (verb rename, exhaustive across all inventoried surfaces), 12 (`Coverage` absent at all five sites,
nothing replaces it, three non-record families untouched), 13 (all five § H loci conditionality-free with the
disclosure retained; mismatched-head merge returns typed `invalidated`), 16 (leave trigger, replay references no
retained checkout), and C1's stop count (five spans, seven stops), C4's accounting (`finalize verify` deleted in
this diff, not dormant; the pre-create resolve is D1-chartered), C9's interruption projections, C10's six
disposition classes at every inventoried site with one shared wait primitive, and C7's prose side. Every pass-one
and pass-two remediation checked (F1 residue, F8, G2 disclosure, lock-none lifecycle gate, lane-progress writers,
site-3 conversion, pre-publication remedies) landed. The reachability census closed clean: every new module has a
production importer, every emitted command is registered, provider vocabulary matches the reservation's, and both
package mirrors are byte-identical to `.arc/system/` for the touched workflows.

## Verification Findings — fourth entry, over the Phase 9 tree

Recorded 2026-08-17 at the fourth entry of the verification boundary. Scope per the Phase 10 preamble: Tier 3 over
the remediated tree, then a targeted re-validation of the eight criteria the third entry's findings touched, each
confirmed against its recorded finding at source, plus the four named seams. Tier 3 ran green first at `6668cf53c`:
md lint over 664 files, the three `lint:arc:*` checks, both lint passes, both type checks, 9987 tests passing
(1 skipped), clean build.

Both findings below are defects in Phase 9's own remediations, not new strata — the composition-over-time class
again, and in both cases the remediation bound a **revision** where the invariant it protects is about the
**reviewable change set**. Criteria 2, 5, 7, 9, 11, and 15 re-validated clean, as did all four seams (the
`arc integrate` namespace error, the checkpoint handle as the merge's only composition source, and one shared
wait primitive and PR-resolution path across both lanes, now including the session-handoff finalize pass).

### V4-B1 — a no-fix settlement composed at the approved head refuses composition

Task 9.1 made every composed settlement action pin the settled target, including no-fix sets, and relaxed the
`response-plan-schema` refinement that forbade a target on those sets. It left the adjacent clause intact:
`response-plan-schema.ts:108` rejects `fixTarget.targetId === originTarget.targetId` unconditionally. That clause
was written when the field meant "the target the fix moved to", where a changed target is definitional. Under the
field's widened meaning a no-fix set's settled target legitimately **equals** its origin, because nothing moved the
head between the review and the checkpoint — so `composeReviewResponseSettlementAction` throws
`must be a changed target in the originating repository`, and `checkpointIntegration`'s catch reports
`composition-unavailable` whose remedy re-runs the same composition.

Reachability is post-submission review specifically: a defer- or reject-only approved set, with no commit after it.
No fix means no commit of its own, and re-attestation fires only on implementation change, so nothing advances the
head. Pre-publication is safe for the opposite reason — `arc submit`'s transition commit always moves the head past
any pre-publication review — which is why Task 9.1's own e2e passes: it inserts an `--allow-empty`
`submit transition` commit before composing. Verified by real-CLI probe against the 9.1 fixture with that commit
removed. Same fail-closed shape as V3-B1, relocated from settlement time to composition time. Criterion 3.

### V4-M1 — the submission boundary binds raw `HEAD`, not the reviewed change set

Task 9.3 bound `authorizeSubmission` to `currentness.recognizedRevision`. On the `current` path that value is
always the current `HEAD`: `projectCandidateCurrentness` returns `current.revision` under an operational-only
advance and the lineage revision otherwise, and the latter equals `HEAD` whenever the advance flag is false. So the
check reads "the boundary was written at the current `HEAD`", while the invariant M9 protects is "the boundary
covers the reviewable change set being submitted" — strictly narrower than E1/E2's own doctrine, under which a
code-owned operational-only delta preserves Candidate mechanically.

Consequence: any commit between `arc review pre-publication` and `arc submit` that touches only operational
content — a `chore(arc)` reconcile, the convergence-verification attestation, a task-list update, committing the
staged boundary itself — refuses submission and sends the operator back through pre-publication to rewrite a
boundary whose review evidence never went stale. Fail-closed with a one-command remedy rather than a wrong merge,
which is why it reads as friction; it is still an accuracy defect on a routine path. The reviewable-subject digest
is the exact statement of the binding, is immune to the `HEAD`-tracking substitution, and is already computed on
both sides. Criterion 6.

### V4-M2 — a re-attestation the primary ran cannot satisfy the gate it was run for

Found by the fourth entry's adversarial pass — a scoped conformance pass over Criteria 3 and 6 and the two
remediation commits, run as a deliberate override of the spent `Heavy` cap. The pass cleared both criteria for the
mechanisms they bind and returned this one finding, in the gate immediately above the one V4-M1 fixed.

`projectCandidateCurrentness` matched a lineage attestation against `revision` — the last approved response's
`newTarget.revision` — while `runPropose` writes its attestation at `recognizedRevision`, which under an
operational-only advance is the current head (`candidate-attestation.ts:292`, `propose.ts:97`). So an
operational-only commit between a verified-fix response and `arc propose` left propose attesting at a revision the
gate never looked for. Confirmed by real-CLI probe: propose returns `attested` / `convergence` /
`candidate-submit-ready` at exit 0 while the very next checkpoint still refuses `candidate-convergence-pending`;
repeating propose appends another attestation and changes nothing. `arc submit` refuses on the same gate with
`arc propose` as its remedy — the call that just no-opped. Permanent and fail-closed, the shape V3-B1 and V4-B1
share, and untested because the suite's own fixture commits the response record and then reaches the composer
directly rather than through the convergence gate.

The two gates had come to disagree about what an operational-only advance means: submission authorization is
content-bound and tolerant, convergence was revision-bound and intolerant. Criteria 7 and 15 both bear on it;
Criterion 7's stated claim survives (readiness does reject an unattested head — this was over-rejection), while
Criterion 15's idempotency clause genuinely failed until Task 9.12 landed.

**Fourth-entry disposition.** Tasks 9.10 (V4-B1), 9.11 (V4-M1), and 9.12 (V4-M2) in
`tasks-integration-boundary-accuracy.md`, all three inside chunk 9. V4-M2's remedy sits outside both commits and
outside V4-M1's evidence chain, so it was recorded and dispositioned by the maintainer as a scope decision rather
than folded into 9.11 as hardening. No spec amendment is owed for any of the three: the spec constrains what the
boundary must guarantee, never which identity implements the binding, and each fix moves the delivered code toward
the recorded E1/E2/E3 doctrine rather than away from it.

**What the three share.** Each was a gate binding a **revision** where its own invariant is about **content**: the
settlement action demanded a changed revision from a set that changed none, submission demanded the boundary's
revision equal the current head, and convergence demanded an attestation's revision equal the response's. Every
fix moved the same direction — key the check to the reviewable subject, keep the revision as provenance — because
the spine advances the head for its own ceremony writes, so any revision equality it does not own decays. Three
instances is the signal worth carrying into a fifth entry: prefer suspecting this duality over deriving each
locus fresh, and if a fourth instance appears, the proportionate response is a design pass over the two notions of
"same work" rather than a fourth point fix.

## Resume Procedure

_Superseded 2026-08-15 — the planning-stage procedure below is complete and retained for provenance. The live
resume path is Phase 9 in `tasks-integration-boundary-accuracy.md`._

1. Resume `generate-tasks` from the stack-member seed above under the amended spec — structural skeleton from
   the seed, then content fill and grounding per the resolved level.
2. At finalization, author the delivery plan from the finalized task list (`stack-to-main`, phase-aligned
   boundary as the starting candidate) and compose it into the task list's `## Delivery Plan` projection.
3. Hold integration until `delivery-stack-topology` ships the landing machinery; plan authoring and
   implementation need not wait.

## Resume Procedure — verification remediation

1. Implement Phase 8 in order. 8.1 (§ G reduction) is load-bearing for 8.2 and 8.3: it removes the composed
   record, which is what shrinks F3 to its plan half and dissolves F4 entirely.
2. Success criteria stay unmarked and `arc propose` stays un-run until Phase 9 completes. Criterion 3 is judged
   against its **amended** text.
3. In Phase 9, apply the falsification method rather than the confirmation method that failed twice:
   for each criterion, construct the case that would break it before looking for the code that satisfies it; walk
   every count the spec's § Inventory states as an exhaustive checklist rather than a number to reach; and for any
   criterion naming a human-facing surface, trace to the human rather than to the writer.
4. The `adversarial-review` pass cap for `Heavy` is 2 and both passes are spent. A third pass is a deliberate
   cap override, not an automatic loop continuation — the exit gate requires surfacing unresolved findings at the
   stage interlock for the user's call instead.
