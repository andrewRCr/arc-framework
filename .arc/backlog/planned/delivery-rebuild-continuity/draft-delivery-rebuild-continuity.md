# Draft: Delivery Rebuild Continuity

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14). It consolidates two capture targets that were cut by
  lifecycle position — `delivery-authoring-rebuild` and `delivery-prepublication-evidence-applicability` — into the
  one mechanism they share.
- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified gate and
  Candidate evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a
  ceremony the covered inputs did not change.
- **Planning posture:** The failures are proven from captured field incidents; the mechanism needs design across
  authoring, gate provisioning, and evidence applicability, which establishes `Class: Heavy` and a `P1` slot.

---

## The consolidation, and its boundary

The steering map warns against absorbing the separate prepublication-authoring, post-landing-conflict, and
public-correction contracts into one uncut work unit. This consolidation reopens only the first of those three, on
two grounds the map itself supplies: prepublication evidence applicability **consumes verified rebuild endpoints**,
and its implementation must coordinate with authoring. Both are strictly private-chain and both are driven by base
movement, so they are one mechanism observed at two lifecycle positions.

Two neighbours stay out, deliberately:

- **`delivery-post-landing-conflict-recovery`** is public-side and post-landing. It also ships first, because it is
  the recovery route that makes a stacked landing safe to attempt at all.
- **`delivery-correction-convergence`** stays its own planned stub. Its draft records a failure that fires
  _"even though the base did not move"_ — its own record writes reopen applicability — so it is a convergence
  problem rather than a movement one, and it was already split from stacked-delivery dogfooding deliberately.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

All four routed captures are reproduced below in full and removed from the inbox, so this draft is the single
authoritative source for the concern. Their `_Routed from:_` lines preserve the pre-consolidation slug each named.

One integration note for the first planning iteration: the evidence-applicability capture's `_Boundary:_` defers
commit and tree construction, private-ref leases, and detached gate placement to `delivery-authoring-rebuild` as a
separate work unit. Under the consolidation that is an internal seam rather than a work-unit boundary. The text is
left as recorded rather than edited to agree with the merge.

### `[ ]` **Make initial stacked-delivery authoring rebuildable after base movement**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-authoring-rebuild (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Observation:_ the first post-ship consumer of `delivery-native-stack-composition` reached initial unpublished
  stack authoring after routine protected-base movement. The canonical plan remained valid, but the already-authored
  private member refs and detached gates were based on the prior base. The only initial-authoring command is the
  read-only `delivery authoring locate`; `deliver-stack.md` then says to "record each authored cut" without a typed
  constructor or rebuild continuation. Recovery required manually constructing normalized trees, excluding
  lifecycle and Candidate records, creating commits, lease-updating ARC-private refs, and repositioning detached
  gate worktrees before eligibility could be prepared again.

- _Prior intent:_ the completed native-stack design explicitly says base movement before materialization is an
  ordinary work-unit base merge followed by member verification reruns, commits that the protected base is never
  frozen, and budgets no manual recuts. It later exposed typed `authoring rematerialize` and `authoring rebind`
  verbs, but those require an already-bound Delivery State revision and were scoped to public review-fix replay.
  The unbound initial-publication case was neither implemented nor recorded as a deferral. The WU's own initial
  publication preceded its late exact-tree gate-admission amendments, so its later dogfood concentrated on bound
  correction and landing recovery and did not exercise this final prepublication path.

- _Approach:_ add one plan-aware typed operation that prepares or compare-and-swap rebuilds the complete unpublished
  candidate chain from an anchor compatible with the originating top and the observed protected-base relation, the
  canonical member boundaries, and authoritative lifecycle exclusions. For disjoint protected-base movement, retain
  the top's compatible chain base; do not silently import newer base-only bytes that the originating top lacks.
  It should own commit/tree construction, ARC-private candidate refs, detached gate placement, and the exact
  eligibility-ready coordinates or continuation; replay should converge, while conflicts, dirty or foreign gates,
  moved authority, and incomplete normalization refuse without a partial adopted chain. Compose the existing locator,
  materialization, lifecycle-normalization, private-gate, lease, and eligibility primitives rather than creating a
  parallel plan or state record. Return an unchanged chain when the existing cuts remain compatible under disjoint
  protected-base movement; a newer base OID alone must not trigger recutting. Preflight any proposed chain's
  predecessor relation and normalized completeness against the originating top before returning gate work, so a
  mechanically wrong anchor cannot consume a full gate cycle before `eligibility close` rejects it.

- _Field evidence (2026-09-13):_ `evidence-applicability` first rebuilt its unpublished chain directly on current
  `main` after the originating top had last reconciled an earlier base. Eligibility prepared, but close refused
  `completeness-mismatched`: two newer disjoint base PRs were present in the final member and absent from the top.
  Recutting on the top's existing base yielded `disjoint-ahead` with no overlapping paths and closed `eligible`
  without moving the top branch. Anchor selection must preserve this successful path rather than force a base merge.

- _Dogfood efficiency (2026-09-13):_ rebuilding three members (13 commits) took about 38 minutes end to end. The
  clean 13-commit rebase itself took under a second; time also went to semantic conflict resolution after an upstream
  test-file extraction, finding post-cut changes that belonged in specific members, and two complete sets of three
  Tier 2 gates after the wrong-anchor preflight gap. A clean, unbound stack should reach exact gate-ready coordinates
  through one typed operation with no per-member hand-authored Git steps; a real conflict should stop with its exact
  member and leave the old chain usable. The operation must not claim to make tests instantaneous or auto-resolve a
  semantic conflict. Gate-result carry and bounded re-verification belong to
  `delivery-prepublication-evidence-applicability`, not to this constructor.

- _Boundary:_ this owns prepublication delivery authoring and recovery ergonomics. It does not implement provider
  restacking, mutate public Delivery State, choose review policy, or widen the repository-wide integration lane.
  `integration-lane` may consume its exact base/currentness result at the handoff seam, but should not own candidate
  reconstruction or require a broad freeze while private gates run.

- _Captured during:_ `plan-segmentation`, the first stacked delivery after
  `delivery-native-stack-composition`, 2026-09-09.

### `[ ]` **Provision plan-owned delivery gate checkouts before verification**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-authoring-rebuild (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Observation:_ `worktree.post_create` provisions ARC-spawned WU worktrees, but initial delivery authoring exposes
  plan-derived `.git/arc/delivery-gates/<planId>/<chunkKey>` locators without constructing or provisioning those
  detached gate checkouts. `test-suite-right-sizing` found its gates lacked `node_modules` during Tier 2; another
  live plan's gates also lack them. A gate under the primary checkout's `.git` directory can instead silently
  resolve the primary checkout's dependencies, not its owning WU's, making a test failure misleading.

- _Approach:_ as initial authoring gains typed gate creation/rebuild, specify and enforce a project-configurable
  execution-environment contract before returning eligibility-ready gates: provision their own dependencies or
  intentionally bind them to the owning source checkout, with a clear refusal if neither is established. Do not
  treat arbitrary ignored `node_modules` presence or the primary checkout's dependencies as proof of readiness.
  Cover clean creation, re-entry, and different dependency versions across worktrees.

- _Boundary:_ initial private delivery gates; `review-checkout-lifecycle` has an adjacent capture for ephemeral
  review/conflict checkouts. The retired `wu-integration-target` projection and late plan revision did not create
  these plan-derived paths, and neither should be used as the cause or remedy.

- _Captured during:_ `test-suite-right-sizing` delivery preparation, surfaced while running
  `validate-delivery-lifecycle-paths-before-eligibility-gates`, 2026-09-12.

### `[ ]` **Make bound delivery corrections rebuild their private suffix**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-authoring-rebuild (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Observation:_ the stacked-delivery correction controller authorized a fix on the top authoring locus and told
  the session to cut the complete affected suffix, but exposed no typed operation that can construct that suffix.
  On re-entry it dispatched rematerialization against the unchanged private candidate refs, which deterministically
  refused `completeness-mismatched`. Recovery therefore requires manual Git object construction, lease-updating
  ARC-private refs, and repositioning detached gates during an already-bound public review correction.

- _Approach:_ extend the plan-aware candidate-chain builder to the bound review-fix route. After the authorized top
  correction is clean and committed, rebuild the selected member and every dependent private candidate from the
  current public ancestry and canonical member boundaries, place their managed gates, then resume rematerialization.
  Make replay convergent and refuse dirty or foreign gates, moved refs or public heads, stale authorization, and
  incomplete normalized coverage before partial adoption. Compose the same primitive with initial unpublished
  authoring rather than leaving two manual suffix constructors.

- _Boundary:_ this owns private candidate reconstruction after an approved delivery-member fix. It does not choose
  finding dispositions, weaken review or gate obligations, rewrite public history, or own provider restacking.

- _Captured during:_ `plan-segmentation`, the first stacked delivery after
  `delivery-native-stack-composition`, 2026-09-09.

### `[ ]` **Preserve evidence applicability throughout delivery prepublication**

- _Routed from:_ `USER-INBOX § Work Unit`
  (`WU_Target: delivery-prepublication-evidence-applicability (planned)`), routed at the
  `concurrent-integration-characterization` close-out, 2026-09-14.

- _Observation:_ Private-delivery dogfooding exposed three connected evidence losses after
  `evidence-applicability`. First, one narrowly verified Candidate fix changed a private suffix and made every
  descendant member owe complete Tier 2 again. Second, eligibility preparation and close are separate observation
  windows: a fresh preparation can retain the same exact member heads and trees, but workflow continuity discards
  the already-completed gate results and directs another run. Third, overlapping protected-base movement during
  prepublication requires a chain rebuild; the resulting authorized base reconciliation has no Candidate-
  applicability route at this lifecycle stage, so `arc attest` calls the delta unexplained and demands a full new
  root even when the bounded interaction may warrant only supplemental evidence. These gaps can repeatedly charge
  sibling integration to the active WU despite the doctrine that evidence follows covered content rather than head
  movement.

- _Publication-window edge (2026-09-13):_ Once `state.target` is bound, `materializeBoundDeliveryChain` skips its
  observed-tip check. Each retry freshly closes eligibility before mutation, but the protected ref can move between
  that close and later private-ref or draft-PR effects. This can leave stale publication artifacts without granting
  merge authority. D7 requires a tip proof before the initial chain-base record; its separately accepted
  observation-to-merge race concerns terminal merging, not this publication window. Determine whether a bounded
  in-call recheck materially improves the retry, or whether later review gates are the appropriate authority
  boundary; do not treat either outcome as implicit.

- _Approach:_ extend the existing path-treatment, typed-delta, reducer, evidence-reference, and operator-bound
  Candidate applicability substrate across one cohesive boundary: preservation and reassessment of evidence while
  private delivery preparation changes its observation window or exact targets. First prove the existing minimal
  contract—a prior gate result already binds deliverable ID, head, tree, and status and may be accepted by a fresh
  snapshot when those covered inputs are unchanged—before adding persistence. Retain that evidence through typed
  workflow continuations; for changed members or suffixes, reduce exact before/after contribution evidence to carry,
  bounded supplemental work, or fresh verification. Preserve an authoritative prepublication reconcile/rebuild
  cause through Candidate currentness so a recognized transformation reaches the existing
  `covered | targeted-check | changed` authority seam instead of degrading to unexplained solely because of its
  lifecycle stage.

- _Success criteria:_

  1. Disjoint protected-base movement reobserves eligibility without repeating member gates whose covered inputs
     remain unchanged; changed gate definitions or other actual covered inputs prevent unsupported reuse.
  2. Exact member and suffix transitions receive carry, bounded supplemental, or fresh treatment from verified
     before/after coordinates; ancestry or contribution similarity alone never establishes whole-gate applicability.
  3. An authorized prepublication base reconciliation or rebuilt-chain result reaches Candidate applicability through
     verified endpoints and does not become unexplained merely because it happened before publication.
  4. Bounded residuals use the existing operator-bound selection, and supplemental evidence binds to the current
     obligation; unavailable, unbounded, stale, or unrecognized transitions remain conservative.
  5. Preparation, eligibility close, private-review composition, publication/materialization, and private-review
     correction consume one coherent applicability result without turning it into review clearance, gate success, or
     publication authority.
  6. Movement, interruption, and replay preserve completed valid work, reject stale selections, and reobserve all
     mutation authority. In particular, an already-bound-target retry with protected-tip movement after eligibility
     close has a tested safe disposition or an explicit, evidence-backed non-authoritative residual; no recheck is
     claimed to eliminate every external race. Terminal integration retains its own current checkpoint evidence and
     exact-head approval.
  7. An end-to-end three-member case encounters disjoint movement and then overlapping reconciliation, repeating only
     the evidence justified by each delta and never forcing an unexplained full reset solely at a lifecycle seam.

- _Boundary:_ consume chain/rebuild endpoints but leave commit and tree construction, private-ref leases, and detached
  gate placement to `delivery-authoring-rebuild`. Do not redesign Tier 2 membership or cost, proposal-side review
  scope, host/checkpoint authorization, or general recovery orchestration. Add no generic evidence store, ancestry-
  only carry, or arbitrary evidence-kind framework; introduce persistence only if planning proves existing records
  and typed continuation cannot retain the required exact evidence.

- _Coordination:_ compose explicitly with `delivery-authoring-rebuild` across verified endpoints.
  `candidate-reroot-recovery-frame` may preserve resumability but owns no applicability decision. Keep **Make no-
  material Frontline follow-up effective across Candidate rerouting** independent unless source inspection proves its
  blocker is the same evidence-target binding rather than merely adjacent vocabulary. Concurrent gate-process
  exhaustion remains with `test-suite-contention-hardening`.

- _Class signal:_ provisionally Heavy because this crosses Candidate authority, delivery eligibility, exact gate
  identity, and every prepublication consumer through publication; planning may reduce the class only if the existing
  records and reducer make the work a mechanical extension with no new authority design.

- _Captured during:_ `evidence-applicability` private delivery verification and review dogfooding, with bounded Astra
  scope review, 2026-09-12.

---

## Problem / Motivation

Initial and correction-time private-chain recuts, gate placement, and gate provisioning remain manual or unproven.
When the protected base moves under a bound plan, the chain has to be rebuilt, and everything already justified
against the old chain — gate results, Candidate evidence, applicability — has to be re-established or carried. The
captured incidents show both halves failing independently, and the second consuming the first.

The evidence-applicability capture states the target shape directly: disjoint protected-base movement should
re-observe eligibility **without repeating member gates whose covered inputs remain unchanged**, while changed gate
definitions or other actual covered inputs continue to prevent unsupported reuse.

## Evidence from the characterization

`concurrent-integration-characterization` probed the delivery-member landing cells against a moving base. Two
observations bear on this design; each is a recorded ledger row.

- **The delivery shape narrows a refusal and never a tolerance.** A safe verdict over a non-empty substantive path
  set is reachable only through the `residual-contained` safety class; with no substantive overlap there is nothing
  for the residual scope to narrow, so the shape never enters and the payload carries no trace of it. Two of the
  four member cells therefore read identically to their singleton counterparts while genuinely running the delivery
  arm — the shape is visible only where the singleton path would have stopped.
- **The advisory disagrees with the decision it rides.** The checkpoint's register text is composed from the
  overlap partition alone, so on the very result that just _admitted_ a reviewable path under `residual-contained`
  it still reads "Merge the base before continuing edits on those paths". Only the decision knows about the
  residual. A separate Errand — **refusal remedy accuracy** — owns the message; the design question here is which
  component should be composing it.

One further observation was recorded rather than probed: an advance intersecting a landed member's span refuses as
a predecessor overlap, adding a stop the singleton shape has no analogue for. The first matrix enumerated no cell
for it.

## Recommendations, not decisions

Offered from the evidence above; this work unit's planning owns the actual design.

- Design the rebuild endpoint before the evidence carry, not beside it. The map's own interface note is the
  ordering: applicability consumes verified rebuild endpoints, so a carry contract written against an unproven
  rebuild would be specifying against a moving target.
- Make the residual scope legible in the payload. Its current invisibility on tolerant results is why the advisory
  and the decision can disagree without anything noticing.
- If this work unit lands as a stacked delivery and dogfoods its own fixes, record an explicit fallback to a plain
  single-branch landing up front. The failure mode is depending on the broken mechanism to ship its own fix; with
  post-landing recovery shipped first and a fallback recorded, a delivery bug degrades the evidence rather than
  blocking the work.

## What the characterization did not cover

Its enumerated matrix spans **base movement only** — boundary by movement kind — and the boundary list did not
include delivery authoring or rematerialization at all. So the authoring half of this work unit's surface was never
probed, and head movement, merge-base cardinality, and ceremony-concurrent writes were outside the axis entirely. A
second matrix covering those axes was added to that work unit after this stub was written; read its ledger rows in
`notes-concurrent-integration-characterization.md` before starting design, rather than treating the first matrix's
`tolerates` verdicts as coverage of this surface.
