# Draft: review-orchestration-right-sizing

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-27);
  captured during `review-protocol-alignment` create-spec.
- **Purpose:** Right-size the review gate's **orchestration layer** against its merge-safety core — cut
  ceremony that does not earn its cost while preserving exact-head identity, structural provenance, and
  the "reviewed head A, merged head B" failure prevention.
- **State:** Draft — pre-groom capture (2026-07-27). Ready to ground independently; do not start concurrent with
  the live review-protocol stack (`review-protocol-alignment`, `review-checkout-lifecycle`).
- **Created:** 2026-07-27

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Retire superseded private Frontline response authority without losing its audit trail**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-orchestration-right-sizing`

- _Observation:_ An older private M2 Frontline disposition record retained `candidate: null`, an approved
  `fixAuthorization`, and no fix response after the exact approved fixes landed in commit `73cb57cf6` (which names
  disposition set `sha256:96525f1a4b08dbe78ecea66a898b47fbce7a81714eceb97e6bbc0f80870ccfe0`) and a
  later Candidate root was attested. `delivery entry inspect` still selected that stale record as pending delivery
  correction and refused `review-fix-response-invalid`, blocking publication before push. New private-member
  Frontline responses carry Candidate binding, but old repository-common records can remain live indefinitely.

- _Approach:_ fold into the existing terminal ownership and collection design. Define a typed, monotonic
  supersession or retirement path for an approved private Frontline fix whose exact disposition is proved landed
  and covered by a later Candidate; preserve the original evidence for audit and fail closed when proof is absent.
  Do not silently filter all Frontline fix authorizations or rely on manual removal from the active evidence
  namespace. Cover prepublication-to-integration entry with a stranded legacy record and a still-pending fix.

- _Field workaround:_ after proving the exact disposition-set commit is an ancestor of the WU head, the old record
  was moved byte-for-byte to Git-common `review-gate/quarantine/` (SHA-256
  `049c7d47b4b651e5babdd3052be5cb79193985c10321a45805c0cc900162529f`); typed entry then returned
  `validate-canonical / validate-eligibility`. This is recoverable operational quarantine, not the design.

- _Recurrence:_ During public M2 correction verification, a second, Candidate-bound private Frontline disposition
  (`sha256:7285138c757d088f121b6900622280d56d3874bfeb29a14b40ef3412c0028133`) remained unanswered even
  though its exact fix commit `df32ad3bc` was an ancestor of the current WU head. The acknowledgment treated it and
  the current attested-local M2 disposition as two live responses and refused `review-fix-response-ambiguous` at
  Delivery State revision 30. Extend retirement through public correction acknowledgment; prove supersession before
  excluding old authority, while preserving the current response and the audit trail.

- _Recurrence workaround:_ the old record was moved byte-for-byte to Git-common `review-gate/quarantine/` (SHA-256
  `acb85cf0cb44dd95258de4d776ec8d9b3e098f9465e9663d8ab054e2a7be7e9c`); the typed acknowledgment then
  consumed the current local fix authorization and cleared pending verification at Delivery State revision 32.

- _Captured during:_ `evidence-applicability` delivery publication, 2026-09-13.

### `[ ]` **Include carrier-native review blockers in integration readiness**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- WU_Target: review-orchestration-right-sizing

- _Observation:_ the final `plan-segmentation` checkpoint reported `ready`, green checks, and both delivery-member
  reviews discharged, but GitHub rejected the exact-SHA merge with HTTP 405 because CodeRabbit still had a formal
  `CHANGES_REQUESTED` review. The underlying findings had already been corrected or explicitly owner-rejected;
  clearing the stale host review still required manual provider inspection and dismissal. ARC's machine-evidence
  surface omitted the blocker entirely.

- _Direction to settle:_ make final readiness observe carrier-native required-review and conversation state in
  addition to ARC lane settlement. Return a typed blocker with exact host loci, and decide explicitly whether an
  owner-accepted disposition may compose a bounded dismissal into the approved settlement plan or must surface a
  separate host action. Never auto-dismiss an unmatched or undecided carrier finding.

- _Captured during:_ `plan-segmentation` terminal integration, PR #580, 2026-09-09.

- _Additional evidence during:_ `test-suite-right-sizing` native landing, PRs #605–#609, 2026-09-12. ARC
  reported all six member reviews discharged and prepared the five-member atomic effect after readiness checks,
  but GitHub's async merge failed: `1 review requesting changes by reviewers with write access.` PR #606 retained
  a CodeRabbit `CHANGES_REQUESTED` review on an older head after its exact-head Owner-accepted terminus. Dismissing
  only the latest stale review (ID `5188891084`) cleared the host block; ARC had already proved no landing and
  cleared the failed reservation. The pre-native readiness gap costs a failed effect and a second attended interlock.

### `[ ]` **Require delivery evidence beyond review-surface separation**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- WU_Target: review-orchestration-right-sizing

- _Observation:_ `assess-boundary-fit` permits an independently reviewable surface to trigger a delivery-plan
  candidate, while integration doctrine defines delivery members as independently landable merge boundaries. In
  `plan-segmentation`, two coherent review surfaces became two members, improving reviewer attention but doubling
  per-member review and landing overhead even though one hosted change request could carry the combined diff.

- _Approach:_ make review-only separation prefer review chunks within one merge boundary. Require a delivery-plan
  candidate to establish a coherent intermediate landing plus a material merge-topology benefit such as dependency
  ordering, rollback value, distinct ownership, or a review-carrier limitation. Decide whether canonicalization
  should revalidate that stronger evidence when planning records only independent reviewability.

- _Files:_ `assess-boundary-fit.md`, `review-chunking.md`, `strategy-integration.md`, and delivery-plan authoring and
  canonicalization surfaces as the resulting policy requires.

- _Captured during:_ `plan-segmentation` pre-publication review, 2026-09-08.

### `[ ]` **Carry explicit whole-target review scope through delivery-member admission**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- WU_Target: review-orchestration-right-sizing

- _Observation:_ delivery-member status currently turns changeset-size attention directly into chunked scope,
  which can exclude hosted sources and select delegated local review even when the Owner would choose coherent
  whole-target review. Unlike the ordinary command path, delivery has no exact-target Owner selection to persist
  and replay through status and admission.

- _Approach:_ design the authority, persistence, stale-target invalidation, and source-capability behavior for an
  explicit whole-target delivery-member choice. Preserve review obligations, convergence evidence, pass ceilings,
  and fail-closed admission; scope choice must not become review exemption or extra-pass authority.

- _Field evidence (2026-09-12):_ private prepublication admitted a default whole-target Frontline run over an exact
  13,381-line delivery member even though the existing sizing resolver returned `consider-chunks`. The workflow
  instruction was bypassable because neither prepublication policy nor `review frontline run` requires the sizing
  result or an exact-target scope decision. The run timed out once, then consumed a second provider invocation before
  the oversized target was recognized. The interim Errand **Guard delivery-member scale before expensive verification
  and review** adds a workflow stop; this WU should consume that field evidence and replace the prose-only rail with
  typed admission shared by private prepublication and public delivery status.

- _Field evidence (2026-09-12):_ private prepublication then selected `standard / chunked / delegated-agent` for an
  exact member and returned `ready / local-prepare`, but supplied no local-review admission. Passing the selected
  private member head to `arc review local prepare` refused `delivery-member-unbound` because authority resolution
  recognizes only an already-public Delivery State member. The required review could run only outside the durable
  local-review operation, leaving exact-target Owner acceptance as the remaining typed terminus. Add a private-plan
  admission carrying the selected deliverable, base/head coordinates, Candidate binding, scope, and source so the
  policy's advertised local action is executable before publication and stale replay still fails closed.

- _Files:_ delivery status composition, delivery local-review admission, governing preparation/integration
  workflows, and end-to-end fan-out coverage.

- _Captured during:_ `planning-grooming-review-exemption` Errand routing follow-up, 2026-09-07.

### `[ ]` **Model provider-aware required-check attempt authority**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-orchestration-right-sizing`

- _Observation:_ GitHub rulesets identify a required check by context plus `integration_id`, but ARC's current
  observation boundary projects host rows immediately to `{ name, state }`. During PR #561 reruns, an older failed
  `merge-ok` and a newer running replacement were therefore indistinguishable attempts, and failure-dominant
  aggregation selected the stale result. Check runs and legacy statuses also expose different provenance and
  ordering fields, so name-only local recency would invent authority the host has not supplied.

- _Interim extraction:_ `hosted-review-ci-failure-surfacing` conservatively keeps conflicting duplicate rows
  pending until GitHub's rollup converges; it does not claim which attempt is latest or collapse distinct providers.

- _Approach:_ carry provider/integration identity and host-supported attempt ordering through the check observation
  boundary, define fail-closed treatment for missing or incomparable provenance, and select the latest authoritative
  attempt without combining evidence across heads. Coordinate the model with aggregate review status and the
  hosted-pending diagnostic path rather than adding a second check-state authority.

- _Captured during:_ `hosted-review-ci-failure-surfacing` boundary recon, 2026-09-07.

### `[ ]` **Collapse approved review correction into one resumable action**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-orchestration-right-sizing`

- _Observation:_ One verified finding plus one directly related CI-matrix omission on PR #561 required separate
  proposal materialization, conversational approval, canonical approval replay, clean-old-head authorization,
  fix restoration, verification, persistence, hosted settlement, and review rerouting. The authorization record is
  valuable; requiring the caller to reconstruct and sequence every internal state transition made the orchestration
  substantially longer and more failure-prone than the correction.

- _Approach:_ preserve explicit Owner approval, the immutable old target, single-use fix authority, verified new
  target, and provider settlement, while letting one durable operation reference drive the approved
  fix/verify/persist/re-enter cycle. The caller should supply only judgments and actual verification evidence, never
  replay canonical records or maintain controller state in prose.

- _Interim extraction:_ ready-to-submit approval and continuation actions remain with the pulled-forward Errand;
  this WU owns any semantic reduction of phases, clean-tree policy, or review retrigger authority.

- _Additional evidence:_ PR #575 completed a hosted pass against its originating exact head after the local branch
  had already advanced. The stale-target guard correctly refused to ingest that result as current-head evidence,
  but no continuation exposed the concluded old-head findings for response and settlement. Two unresolved hosted
  conversations remained invisible to ARC progress until the host rejected the final merge release.

- _Fold-in:_ preserve stale-target refusal for current-head clearance while making a concluded pass inspectable and
  settleable against its originating target, and surface unresolved earlier-target conversations before merge
  release. The caller should not need provider API archaeology to recover a completed review result.

- _Captured during:_ `batch-execute-bound-marking` review correction, PR #561, 2026-09-07.

- _Additional evidence captured during:_ `serialize-subprocess-heavy-local-test-tiers` review correction, PR #575,
  2026-09-08.

### `[ ]` **Conserve Errand scope across successive review corrections**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- WU_Target: review-orchestration-right-sizing

- _Observation:_ PR #584 began as a determinate Errand, then successive complete review passes expanded its
  correction chain into seven review-driven commits across 13 files and roughly 900 added lines. The findings exposed
  adjacent arms of one delivery-recovery state machine piecemeal, so individually plausible fixes accumulated new
  reservation state, recovery, rematerialization, workflow guidance, and tests without an explicit Work Unit boundary
  decision. Review thereby became an ungoverned substitute for design and scope-amendment discipline.

- _Approach:_ establish an Errand scope-conservation boundary in review response. When a proposed disposition crosses
  the Work Unit floor through a new architectural concept, multi-seam protocol design, material scope expansion, or a
  growing correction chain, stop before fix authorization and require an explicit choice: reject it as outside the
  Errand's responsibility, defer it durably to an existing or new Work Unit, or promote the Errand and establish or
  amend a design and scope guard before resuming. Surface repeated complete passes, cumulative review-driven delta,
  and cross-seam growth as escalation evidence; do not reduce the judgment to a line-count or file-count threshold.

- _Scope:_ compose with the target Work Unit's existing Owner-accepted Errand terminus and resumable stacked correction
  loop. Preserve review's ability to correct a bounded Errand within its existing concern, and treat successive passes
  discovering adjacent protocol arms as a whole-contract coverage warning as well as a scope signal.

- _Captured during:_ `review-signal-convergence` Member 5 adversarial verification, from live PR #584 evidence,
  2026-09-10.

### `[ ]` **Admit review fixes that correctly land outside a finding's cited file**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: delivery-review-fix-locus-applicability (provisional)`

- _Observation:_ A PR #609 finding cited `.github/workflows/ci.yml:345`, but its approved correction belonged
  in the shared CI budget reporter and its unit test. The stacked-delivery authoring rebind refused
  `authoring-rebind-finding-path-missing` because no changed path equaled the cited workflow file. A truthful
  workflow comment about the new warning was added to satisfy that file-presence check; the actual behavioral
  fix and tests were already committed. The current check proves path overlap, not correction relevance.

- _Approach:_ preserve the exact approved finding, authoring locus, and changed-head checks while allowing a
  source-verified cross-file fix. Assess whether the normal path can establish a bounded relationship from
  changed files and approved disposition evidence, or whether an explicit Owner/operator override should
  authorize the nonlocal correction. Any override should name the exact finding, changed paths, and head
  rather than silently disabling the guard.

- _Boundary:_ delivery review-fix admission only; do not relax review finding provenance, disposition approval,
  or general delivery-member authoring scope.

- _Captured during:_ `test-suite-right-sizing` member 5 correction, PR #609, 2026-09-12.

### `[ ]` **Give exact Errand targets an Owner-accepted review terminus**

- _Routed from:_ `USER-INBOX § Errand`, housekeep execution recon (2026-09-07); promoted when the attempted
  pull-forward crossed the design floor.
- _Concern:_ an ordinary Errand can retain exact-head review progress but has no typed way for the agent to
  recommend that further frontline or standard review is disproportionate and for the Owner to accept that
  residual risk. The existing terminus is inseparable from a delivery member's Candidate boundary. Correct Errand
  support therefore has to settle strict identity and canonical-target binding, portable versus local authority,
  replay and invalidation, and resumable completion; a workflow-only conversational bypass would preserve the
  brittleness this mechanism is meant to remove.
- _Fold-in:_ emit one submit-ready, lane-specific recommendation bound to exact Errand key, claim, branch, base,
  head, review progress, and rationale; accept only explicit Owner judgment; invalidate every material movement;
  resume the accepted operation by reference; and preserve accepted risk as distinct from provider clean or
  convergence. Coordinate provider-neutral native-review dismissal with `review-source-authority`'s existing
  hosted-blocker concern rather than duplicating that authority design here.

### `[ ]` **Define terminal ownership and collection for review evidence**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-22); captured during `decompose-extraction`
  integration checkpoint recovery.
- _Concern:_ repository-common disposition records and their operation, outcome, and source evidence have no
  terminal ownership boundary. Already-landed residue survived a development schema change and blocked an unrelated
  Candidate because integration parsed the entire evidence directory before lineage scoping.
- _Immediate extraction:_ an Errand isolates unrelated malformed residue while preserving strict failure for
  evidence named by the current Candidate or Errand.
- _Fold-in:_ decide which review records remain live through settlement and replay, when terminal paths collect
  them, and how development-only schema changes reset the repository-common state without compatibility readers.
  Keep the records storage-agnostic per `strategy-storage-evolution.md`; do not widen the managed-document WU into
  a second review-orchestration owner.

### `[ ]` **Give review-lane doctrine a strategy home**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-08-22).
- _Concern:_ no adopter-facing strategy owns review architecture, so obligation, applicability, findings,
  clearance, lane precedence, and carrier ranking land wherever a Work Unit happens to need them. The recurring
  principle that review applicability follows covered semantic content rather than head movement likewise has no
  durable strategy home.
- _Fold-in:_ decide whether the review cohort should mint a review-architecture strategy and charter it against the
  integration strategy. Own placement and charter here; preserve the cohort members as the doctrine's substantive
  sources rather than re-authoring them in this WU.

### `[ ]` **Prune the interlock, status, discharge, and Candidate surfaces against their live readers**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-08-20).
- _Concern:_ the checkpoint carries hard-coded-clean signals and a permanently-null extension slot while omitting
  review facts prose must remember; status duplicates host reads; hosted discharge is checkout-local despite host
  evidence; Candidate stores a large per-path manifest over facts Git already carries; three wait policies diverge.
- _Fold-in:_ compose only variable signals and required review facts, collapse host reads, prefer host-observed
  discharge, re-encode Candidate subject identity proportionately, and state one bounded-wait policy. Consume
  `host-policy-evidence`'s truthful host-read shape rather than pruning correctness work into this WU.

### `[ ]` **Rename the review-gate module for the architecture that remains**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10).
- _Concern:_ `src/scripts/review-gate/` now contains review architecture after the required-status gate was retired;
  its name collides with ARC's technical use of “gate” and deepens with every new module.
- _Approach:_ settle directory-only versus vocabulary-wide rename scope, then sequence the mechanical move after
  `review-protocol-alignment` so in-flight branches do not all conflict on imports and paths.

### `[ ]` **Make the review-exempt route reachable from caller-held facts**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ the review-exempt fast path exists behind internal schemas and projections that ordinary workflow
  callers cannot compose without source archaeology.
- _Fold-in:_ preserve strict exemption authority while reducing the route to discoverable caller-held facts and a
  typed refusal when the exemption does not apply.

### `[ ]` **Treat stacked review correction as one resumable control loop**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ review correction across a delivery stack repeatedly re-enters member selection, reviewability,
  response, verification, and progression as separate ceremonies, losing the active correction position and
  multiplying manual reconstruction.
- _Fold-in:_ compose one resumable correction loop with an explicit member-reviewability checkpoint and typed
  continuation. The `tier1Reuse` vocabulary cleanup is extracted as an Errand; local-coverage truthfulness remains
  with `review-signal-convergence`.

### `[ ]` **Retire a retained attempt when a later clean pass proves complete residual coverage**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ retained attempts remain live even when a later clean pass can prove it covered their complete
  residual, leaving redundant review state to settle manually.
- _Fold-in:_ define the proof and terminal collection boundary for safe supersession without converting temporal
  sequence into an ungrounded assumption of coverage.

### `[ ]` **Let project policy set the review floor for documentation, and let an Owner waive a recommended pass**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-30); captured during `land-storage-direction-record` Errand, 2026-09-24.
- _Observation:_ ADR-035 and its two analyses landed as an Errand (PR #706, 2026-09-24) with no review, by Owner
  decision. The planning-grooming exemption refused them (`non-planning-change`): ADRs and analyses are not plain
  planning artifacts. Self-owned routine documentation then routes to `standardReview: recommended`, and a
  `design-authority` judgment would promote it to `required` with a `full-final` retrigger. Project routing policy
  can only promote (`applyProjectPromotion` in `routing.ts`, deliberately promote-only), so no project can relax
  that floor. On a solo repository there is no second reviewer, and `run-errand` had no route for the Owner's
  decision: its Owner-directed review stop presumes at least one completed standard pass. The merge proceeded on
  explicit Owner acceptance at the integration interlock, disclosed as crossing that guard. `arc review status`
  read `review-required` ("No standard review is recorded for this Errand head") with no obligation level.
- _Approach:_ make review of ADRs, analyses, research, and planning artifacts project policy. ARC's default should
  not force it; a team that wants it opts in. Engage the recorded rationale for promote-only routing before
  relaxing it. Extend the Errand Owner terminus (sibling entry "Give exact Errand targets an Owner-accepted review
  terminus") to a zero-pass waiver of a `recommended` obligation, recorded as accepted residual risk and kept
  distinct from a provider-clean result. Have `arc review status` report the routed obligation rather than
  `review-required` for every unrecorded head.
- _Boundary:_ ADR-035 takes planning state off code branches, which removes most planning artifacts from PR review
  on the default backend. ADRs, analyses, and research stay tracked (its item 3), so this survives the storage
  program.
- _Recurred:_ `state-storage-register-batch-2` Errand (PR #742, 2026-09-29) — register rows plus an ADR-035
  amendment, refused as `non-planning-change`, merged on Owner acceptance at zero passes composed by hand at the
  integration interlock; `arc review status` again read `review-required` with no obligation level.
- _Recurred:_ `state-storage-register-batch-3` Errand (PR #743, 2026-09-29) — register rows plus ADR-035 and
  ADR-022 amendments, the same refusal, merged on Owner acceptance at zero passes; `arc review status` read
  `review-required` with no obligation level.

---

## Problem / Motivation

The review gate's machinery divides along a legible seam, and only one side earns its cost:

- **Merge-safety core** — request a review at an exact head, lock until that exact head clears, record what
  the human approved. Genuinely needs exact-head identity and structural provenance separation.
- **Orchestration layer** — requirement records carrying policy-version digests, admission construction,
  attestation ceremony, pass/ceiling bookkeeping — where ambition outran substrate.

**Evidence:** every defect `review-protocol-alignment` found sits on the orchestration side (e.g. `kind`
baked into a requirement record's canonical digest; derivability failures in requirement/projection
composition; unbacked-capability defects in the policy layer's self-description). Terminal action for a
hosted review is one PR comment; hosted adapters inject no guidance.

**Prior art:** `review-gate-right-sizing` already cut a resident controller, GitHub App path, provider
qualification, and admission machinery. These findings are a second wave — a signal about the layer rather
than any single decision.

**Scale note:** plausibly program-scale rather than WU-scale. Resolve that boundary during planning rather than
gating this concern on the provisional `retrospective-right-sizing` wrapper.

**Coordination:** `review-protocol-alignment` sequenced its `D4` (schema registrations, `--schema` flag,
routing-facts input path) last as a hedge — the unit most exposed if request contracts collapse under a
reduction. If this WU starts before that unit executes, that is the seam to talk about first.

---

## Scope (provisional)

- Audit orchestration ceremony against the merge-safety core criterion.
- Propose a reduction that preserves exact-head lock and provenance separation.
- Leave this change available as a concrete future input if `retrospective-right-sizing` activates; it is not a
  prerequisite for grounding or executing the reduction.

## Non-goals (provisional)

- Replacing the merge-safety core.
- Concurrent open-ended drafting while the live review-protocol stack is still in flight.
