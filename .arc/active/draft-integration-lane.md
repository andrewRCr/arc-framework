# Draft: integration-lane — protected-base movement policy

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the 2026-07-19 housekeep drain; captured during
  post-`finalize-parallelism` CI and merge-concurrency review, 2026-07-18. Reframed 2026-09-09 after grounding showed
  the waiting is ARC-imposed rather than host-imposed. Rename to `base-movement-policy` after capture.
- **Purpose:** Stop concurrent work from pausing on each other's integration. ARC treats any advance of the protected
  base as invalidation of an integrating work unit or Errand, which is stricter than the host it runs on and stricter
  than industry practice. The correction is a proportionate base-movement policy — non-overlapping movement is
  merge-safe, overlapping movement reconciles at the terminal boundary only — plus doctrine that no session ever waits
  for another. A repository-scoped queue is explicitly not the answer; the terminal merge already serializes.

- **State:** Planning — `draft-design`, readiness **maturing**. The base-movement design is settled through two
  adversarial passes (2026-09-09); scope then widened to own the unified evidence-applicability classification and
  method (§ Open design), which the next drafting pass authors before a fresh readiness read.

---

## Problem / Motivation

Three verified work units and the Errand queue are idle while one work unit integrates. Nothing refused; the hold is
a habit adopted after an earlier integration (a long review cycle overlapping a series of quick Errands) forced the
integrating session to stop repeatedly and re-run ceremony, and the recommended remedy was "have the other session
pause". That remedy turned a policy defect into a lifecycle convention: serialize whole lifecycles upstream of
publication so the base never moves under an integrating branch.

The defect is that ARC binds three decisions to **base containment** (is the current base OID an ancestor of the
head) rather than to **overlap** (did the base's advance touch anything this change touches):

- The checkpoint's drift verdict is `reconcile` whenever `behind > 0`, regardless of path overlap
  (`base-distance.ts`, module doc: "raw Git distance exclusively controls the verdict"). `arc integrate checkpoint`
  refuses to compose on `reconcile`. When the overlap is empty and the host reports mergeable, it offers the typed
  `arc base merge`, after which the workflow runs Tier 1 gates, a push, and a full checkpoint recompose; the merge
  commit moves the head, so "clearance never carries" and a review-applicability judgment fires. When there is any
  substantive overlap, or the host is not yet resolved, the checkpoint stops on `unsafe-reconcile` with no typed
  route at all (`reconcileSafety`). So the loop today runs on exactly the movement that is harmless, and the movement
  that needs a merge has only a manual stop.
- Review status independently returns `base-moved / rerun-checkpoint` when the fetched base OID is not contained by
  the head (`status.ts`, `baseContained`), again with no overlap read.
- Delivery eligibility pins the bottom member's predecessor to the live protected-base tip (`eligibility.ts`,
  predecessor ancestry), so any base advance after private chain authoring refuses with `wrong-predecessor` and owes a
  chain rebuild. This is what `plan-segmentation` hit.
- The Errand path has no typed base reconcile at all: on `reconcile` it "returns to Step 5", re-runs chunking, and
  re-enters the review-applicability judgment.

Every landing anywhere in the repository therefore costs every integrating branch either a merge, a gate run, a
push, a recompose, and an attended judgment, or a manual stop; a delivery can owe a manual rebuild. Under concurrent
landings the loop repeats.

The host does none of this. The live `main` ruleset has `strict_required_status_checks_policy: false` (branches need
not be up to date), does not dismiss stale reviews on push, requires one check (`merge-ok`), and CI runs on every push
to `main`. The PR check runs on GitHub's test-merge ref, so it already exercises the head combined with the base as of
run time. ARC is applying a policy equivalent to "require branches to be up to date" plus a review re-judgment on
top, on a host configured for the opposite.

Why now: three work units are waiting on one, the Errand execution queue is frozen, and in a team of any size the
same convention would mean every contributor pausing for every other contributor's landing window.

## Discovery — what the substrate already has

- **Overlap evidence is computed and then ignored for the verdict.** `analyzeBaseOverlap` intersects the branch's
  changed paths with the base's changed paths since their merge-base and classifies each as substantive or regenerable;
  `reconcileSafety` in the checkpoint uses the result only to decide whether the typed `arc base merge` may run.
  Surfacing that computation beside the verdict is composition, not new mechanism.
- **The classifier's inert set is one path, and that is the only shared ceremony surface.** Only `ROADMAP` is
  regenerable (`current-adapters.ts`). Archives land in distinct per-work-unit directories under `.arc/completed/`
  and never overlap by path; the one file two sibling ceremonies both touch is the tracked readiness projection.
  `ROADMAP` merges locally through a custom driver (`.gitattributes`, `merge=arc-roadmap`) that the host's
  server-side merge never runs, so two regenerated renders reach the host as a textual conflict.
- **Branch-carried projections are already a recorded defect.** `roadmap-tooling` holds the target that a work-unit
  branch should not carry a project-level `ROADMAP` diff at all, `operational-state-docs` and the storage evolution
  classify `ROADMAP` as materialized operational state, and `project-state-integrity` shipped regenerate-wins. The
  policy here must compose toward that target, not build around the projection.
- **Path-intersection carry already exists in the review core.** `core/applicability.ts` derives
  `treatment: carry | incremental` from `reviewedPaths ∩ deltaPaths`; `review-applicability-authority.ts` carries an
  Owner `covered` selection across a mechanically-proved segment. The semantic precedent for "non-overlapping movement
  is safe" is already in code.
- **The Candidate attestation is already safe.** It binds the work unit's own subject digest; unrelated base movement
  leaves it `applicable / recognize-current`. Verification does not go stale — only the checkpoint, review status, and
  delivery coordinates do.
- **`retrigger: full-final` is inert.** No behavioral consumer reads it; it participates only in requirement identity
  digests. The re-review pressure on head movement comes from the containment arms and workflow prose, not routing
  policy.
- **The terminal instant is already serialized.** `arc base merge --expected-base --expected-head` and
  `arc integrate merge --checkpoint` are compare-and-swap on exact heads; the draft lock (ADR-031) keeps the unlocked
  window seconds wide. Git's ref update serializes the merge itself on every host.
- **The delivery terminal classifier has no disjoint arm.** `classifyDeliveryTerminalDrift` is reached only on a
  `reconcile` verdict and always returns reconcile or refuses; it folds regenerable paths into the predecessor-overlap
  refusal, so an unrelated `ROADMAP` regeneration can refuse a delivery whose member touched `ROADMAP`.
- **Merge queues are already a recorded non-goal in three places** (ADR-025 "doctrine over mechanism"; the
  delivery-stack spec's `queue-not-atomic` downgrade; the concurrent-work research note). The one code mention,
  `native-landing.ts` `mergeAction === "queue"`, refuses or downgrades. That refusal is the minimal seam.
- **Prior decisions already point this way.** ADR-025 names the behind-base check at integration as the real safety
  net, so it must be proportionate, not merely present. ADR-034 separates member review and checks (incremental) from
  merge acts (the `Integrating` window): the window is a merge window, never a review window. The native-stack design
  commits that "the protected base is never frozen" and budgets no manual recuts. The review cohort's shared goal
  ("mechanics preserve proportional judgment"; D7.4 "exact-head movement … does not by itself invalidate the
  applicability of prior complete coverage") states the same principle from the review side.

## Alternatives

- **A. Repository-scoped integration lane / queue (the original direction).** A claim in git refs or a host label,
  head-of-line, priority, exclusive final-integration window. Rejected: it serializes a merge git already serializes,
  automates a re-check ARC has made too expensive rather than removing it, adds coordination state the storage
  evolution would later have to fold into a backend, and contradicts ADR-025. No queue in industry re-reviews; a
  queue would still pay ARC's judgment cost at the queue head.
- **B. Proportionate base-movement policy (selected).** Distinguish _disjoint_ movement (base advanced, no substantive
  path overlap with this change) from _overlapping_ movement, and let the host's mergeability settle what git can
  combine. Disjoint movement on a mergeable host is merge-safe: no pre-merge base merge, no review re-judgment, no
  rebuild, no recompose beyond the exact-head revalidation the merge verb already performs. Overlapping movement on a
  mergeable host takes one typed base merge, then one checkpoint and one approval. A conflicting host is a
  conflict-resolution stop on every path. Unavailable overlap evidence classifies as `unknown` and never unlocks the
  disjoint arm (fail closed).
- **C. Defer entirely to the host's own signals.** Read `mergeStateStatus` and let the host decide. Insufficient
  alone: the host cannot express overlap (only textual conflict or "behind") and ARC's own gates must know whether to
  run. But the host read composes: where the host enforces strict currency, ARC's disjoint arm is moot and must
  observe that.
- **D. Keep the policy, make the wait unattended.** Automate the reconcile loop so nobody notices. Rejected: it
  preserves a cost with no safety return and still owes delivery rebuilds.

## Design

1. **Additive movement classification, verdict unchanged.** The base-drift analyzer keeps its four-valued verdict
   (`clean | reconcile | unavailable | skipped`) with `clean` versus `reconcile` driven by raw distance alone — the
   recorded invariant stands unamended — and gains an orthogonal `movement` field:
   `disjoint` (overlap evidence available, `substantivePaths` empty), `overlapping` (any substantive overlap), or
   `unknown` (overlap unavailable). Integration-evidence completeness is not a precondition; it exists to authorize a
   mutating merge, not to classify a reading, and requiring it would disable the arm on any history with an unproven
   single-parent commit. Consumers that never read `movement` keep today's fail-closed behavior. The spec enumerates
   every `verdict` consumer (checkpoint, merge verb, review status, eligibility, both workflows, the session-init
   advisory, and `arc base drift` reads) and states which consult `movement`. **Open:** `movement` is the
   base-movement projection of the unified delta classification (§ Open design), not a third vocabulary beside
   `candidate-applicability`'s structural facts; its final name and shape are settled there.
2. **Overlap grain.** Path-level substantive intersection between the base's advance and this change's contribution,
   since their merge-base, using the existing classifier unchanged (`ROADMAP` is the sole inert path). CI on the base
   is the backstop for semantic interaction, as it is everywhere else.
3. **The checkpoint decides merge-safety from movement × host, with three typed arms.** On `reconcile`,
   `arc integrate checkpoint` reads host mergeability through one shared typed read (step 7 gives the Errand path the
   same read). Path disjointness is not Git mergeability in general, so the host read is load-bearing, not a nicety.
    - **Disjoint + host mergeable → compose normally.** `arc integrate merge` proceeds to the exact-head merge; the
      host's merge commit combines the trees, as on any non-strict repository. No base merge, no re-judgment; clearance
      carries. The ready surface's base-drift line renders "behind N, disjoint, host mergeable" as a decision-bearing
      fact for the approver rather than asserting a clean read.
    - **Overlapping + host mergeable → the typed `arc base merge` arm.** This retargets today's `reconcile-base`
      (which was reachable only for the no-overlap case and would otherwise become dead code): git can three-way merge
      cleanly, the merge commit carries interaction, so Tier 1 gates, one push, one checkpoint, one approval follow,
      and the review-applicability judgment is owed — this is the one arm where "clearance never carries" still
      applies. The mutating merge keeps its integration-evidence-completeness guard; the read-only classification
      (step 1) does not. That asymmetry is accepted: completeness protects a mutation, not a reading.
    - **Host conflicting → a conflict-resolution stop.** The local merge would conflict too; the remedy names the
      conflicting paths from the host read, not "substantive overlap". Inert-only overlap resolves the same way: a
      mergeable `ROADMAP` three-way merge lands a hybrid render on the base, accepted under `project-state-integrity`'s
      regenerate-wins posture (the next ceremony regenerates it); a conflicting one is the local merge plus regen path
      that exists today. No projection-specific mechanism is added, and the rule degenerates to "nothing inert" once
      `roadmap-tooling` retires branch-carried projections.
    - **Host unresolved (`mergeable: null`, the common first read after a push) → bounded re-read, then a typed
      `host-pending / retry` result.** Never the overlap remedy. Retryable path, light handling.
   The delivery terminal classifier gains the same disjoint arm and stops counting inert paths toward predecessor
   overlap.
4. **A typed exit from a host merge refusal.** GitHub answers a strict-currency `BEHIND`, a protection refusal, or a
   conflict with an HTTP error, which the merge verb today folds into `blocked / operation-failed` alongside transport
   failures. Fix: the pinned-merge port classifies host HTTP refusals into a typed host-refusal state distinct from
   transport failure; the merge verb's final drift read returns base OID and movement, not only the verdict, and
   re-classifies at merge time (disjoint → proceed; overlapping → `drift-reconcile`); a host refusal after a
   disjoint checkpoint returns `invalidated / reconcile-base` carrying expected base and head, so the workflow offers
   the typed `arc base merge` instead of looping through re-checkpoint and re-approval. Transport failure stays
   `operation-failed`. When `host-policy-evidence` lands native merge-state, `BEHIND` is observed before the merge is
   offered and this exit becomes the rare path.
5. **Delivery eligibility tolerates disjoint movement without falsifying a member's base.** A bottom member stays
   eligible when a merge-base with the observed protected-base tip exists and the base delta from that merge-base to
   the tip shares no substantive path with the member's diff; inert overlap resolves as in step 3. The member's
   `coordinates.base` stays its real ancestor (that merge-base) — downstream consumers diff from it, pass it as the
   three-way merge base, and check chain consistency against it — while the observed tip is recorded separately as
   the landing target. The spec enumerates every consumer that assumes the bottom member's `base` equals the observed
   protected-base head. The terminal checkpoint then reads disjoint drift and step 3 handles it. Overlapping movement
   still refuses and owes a rebuild. This work unit decides _when_ a rebuild is owed; `delivery-authoring-rebuild`
   owns _how_.
6. **Review status stops treating containment as movement.** The `base-moved` arm fires only on overlapping movement;
   disjoint movement neither invalidates the retained attempt nor demands an applicability judgment. The judgment
   itself is the unified method (§ Open design); this step wires its base-movement instance at the review-status
   arm and the checkpoint, and leaves the review-fix fire-points to the review cohort as seams.
7. **Errand path gets the same policy through the same read.** The host-mergeability fact is exposed once, as a slot
   on the base-drift read whenever a change request is bound; the checkpoint consumes it internally and the Errand
   invokes it before lock release, dispatching on the same arms: disjoint and mergeable → release and merge;
   overlapping and mergeable → the typed `arc base merge` (replacing the implicit "append-only base reconcile"),
   gates, push, and the applicability judgment; conflicting → the conflict stop with the lock still held; unresolved
   → bounded re-read. An Errand never reaches `gh pr merge` on a refusal the read would have shown.
8. **Strictness comes from the host, not a new key.** Where the host enforces up-to-date branches, ARC observes it
   and takes the typed base-merge arm instead of offering a disjoint merge it cannot complete. Until the native merge-state
   read ships (`host-policy-evidence`), the host's own refusal at the merge verb is the enforcement and step 4 is the
   typed route out. No dependency edge; consume the host-read shape when it lands.
9. **Doctrine.** `strategy-concurrent-work` § Merge ordering and § Worktree operations, and `strategy-integration`
   § Terminal Integration Authority, state the invariant plainly: sessions never coordinate around each other's landing
   windows; disjoint landings invalidate nothing; overlapping landings reconcile at the terminal boundary only. The
   "merge from one designated worktree", "refresh the others after a merge", and "Errand branches wait their turn"
   conventions are revised (the first has no identity rationale and is already stale against the self-teardown step;
   the second contradicts § Append-only). "Clearance never carries" narrows in `integrate-work-unit.md` to the
   overlapping arm. Doctrine states the CI contract the disjoint arm relies on: pre-merge
   evidence is the host's test-merge check as of run time, and post-merge evidence is CI on the base — which must
   therefore run the same legs that gate a pull request, or the project accepts the reduced coverage knowingly.
10. **Native queue seam stays where it is.** The terminal action remains a closed typed value (`merge`);
   `queue-not-atomic` remains the delivery refusal. A future `enqueue` arm is additive after lock release, with
   asynchronous completion handled by the existing `merged-at-head` resume path. Nothing is built for it here.

## Decisions

- Non-overlapping base movement is merge-safe. ARC will not be stricter than industry norms by default; stricter is a
  choice a team makes at the host, never a consequence ARC imposes.
- No repository-scoped queue, lane record, priority, head-of-line visibility, or exclusive cross-work-unit window.
  Serialization is the terminal compare-and-swap that already exists.
- **No ARC-side strictness key, now or in the spec.** Strictness is read from the host's own merge-state policy.
  Reasoning, recorded so it is not re-proposed: every mainstream host already exposes the "require branches to be up
  to date" knob, so an ARC key would be a second authority for one fact (PM-composition principle 1) and speculative
  capability with no requesting team (proportionality); the storage checkdoc's axis test asks whether a need can be a
  property of an existing surface, and here the existing surface is the host. The only condition that reopens this is
  a team without host branch protection asking for ARC-only strictness, and that team's answer is host protection.
- The terminal-verb split (a distinct await verb before a green-only merge) is dropped: its motivating failure is
  fixed (`4cff6d787` keeps checks waits locked and bounded — the routed inbound concern's immediate extraction) and
  no concrete pain remains; a split now would be unsupported machinery.
- The classifier's inert set is not widened. There is no shared completed index to protect, and the only shared
  ceremony surface (`ROADMAP`) is handled by the host-in-the-loop rule rather than by classification.
- The typed base-merge arm is retargeted from "no overlap, host mergeable" (now the disjoint compose path) to
  "overlapping, host mergeable"; substantive overlap no longer refuses a merge git can perform cleanly. The
  review-applicability judgment is owed on that arm and nowhere else in this design.
- Host mergeability is read once, through a typed slot on the base-drift read, for every path that offers a merge.
  Unresolved mergeability is retried within a bound, never treated as overlap.
- The unified evidence-applicability policy is **this work unit's**, not a separate one. Review clearance,
  verification currentness, and merge safety share one question ("does evidence bound to target T0 still cover T1")
  and one three-way answer, and `candidate-applicability` already computes a delta classification
  (`mechanical-reapply` / `clean-divergence` / `interaction`) that a base-movement-only `movement` field would
  duplicate under a third vocabulary. So this work unit owns the one CLI-computed delta classification and the one
  judgment method, with base movement as the first fully wired instance. The review-fix fire-points and verification
  re-root remain seams their owners wire (§ Open design); this work unit does not edit the review cohort's workflows.
- Movement rides beside the verdict as an additive field; the verdict enum is not extended. Preserves the recorded
  "raw distance controls the verdict" invariant and keeps unaware consumers fail-closed.
- The hybrid `ROADMAP` render a mergeable host three-way merge can leave on the base is an accepted consequence, not
  a new mechanism: regenerate-wins already governs it. Retiring branch-carried projections is `roadmap-tooling` and
  `operational-state-docs` work, on the storage-evolution line; this policy composes toward it by adding nothing
  projection-specific.
- The Candidate attestation and its subject-digest applicability are untouched. Exact-head merge authorization, the
  integration interlock, the draft lock, and the append-only invariant are untouched.
- Delivery reconstruction stays a separate work unit (`delivery-authoring-rebuild`, to be minted from its capture
  with the narrowed boundary below). The two are orthogonal subsystems: this work unit owns the predicate that says
  whether a rebuild is owed; that one owns the typed rebuild operation for the overlapping and interrupted-authoring
  cases. Flat siblings with a sequenced seam, not one work unit and not a cohort.
- Boundary fit: stays one work unit. Delivery-plan candidate noted (analyzer and checkpoint arm; review-status arm;
  eligibility relaxation; workflows and doctrine) — re-raise at the spec's boundary read, not before.
- Class: `Heavy` confirmed — a real design composed from existing primitives across three integration paths and two
  strategies; nothing invented.

## Open design — unified evidence applicability

Authored in the next drafting pass; recorded here so the session resumes without re-deriving the scope decision.

- **The question.** Evidence E (a review clearance, a verification attestation, a quality-gate result, a merge-safety
  reading) was bound to target T0. The target is now T1. Does E cover T1 (carries), cover it with a bounded
  supplemental check, or not at all (fresh)?
- **One classification, CLI-computed.** Unify the existing inputs into one typed delta classification:
  `candidate-applicability`'s structural facts (accepted → mechanical reapply; diverged; conflicted), path overlap
  (disjoint / overlapping, inert paths), subject-digest equality, and host mergeability where a merge is the act.
  The classification is cause-agnostic — base movement, an author's fix, a base merge, a member rewrite all produce
  a delta — but records the cause, because merge safety exists only for base movement. Inventory first: `core/
  applicability.ts` (`carry | incremental`), `review-contribution-applicability.ts`, `review-applicability-authority.ts`
  (`covered | targeted-check | changed` with mechanical carry), `candidate-applicability.ts`, and the prose judgments
  in `integrate-work-unit.md`, `run-errand.md`, `deliver-stack.md`. Decide which are projections of the one
  classification and which are retired.
- **One judgment method.** Signature takes the classification, the evidence kind, and the act the evidence gates;
  returns carries / supplemental / fresh with the residual the caller must disclose. The residual judgment (does a
  bounded interaction deserve a supplemental pass) stays prose; everything computable stays in the CLI
  (procedure-evolution principle 1). Forward-compatible with `composable-workflows` by being a method.
- **Fire-points this work unit wires** — the reachability rule: a method a workflow needs but never marks silently
  never loads, and the corpus audit cannot tell a missing marker from a deliberate one. So the design states where
  the method fires _today_: the integration checkpoint's base-drift arms, the review-status `base-moved` arm, the
  Errand pre-release read, and delivery eligibility. Each is a marked fire-point in a workflow this work unit edits.
- **Seams other owners wire.** The review-fix applicability step in `integrate-work-unit.md` and `run-errand.md`
  (`review-activity-contracts` D7.1 plants a statement there; it should invoke the method), verification re-root (the
  "resume scoped review-fix verification" Errand), and `retrigger` semantics. Capture each to its owner at planning
  close with the method's signature, so adoption is a marker, not a redesign. `review-orchestration-right-sizing`'s
  doctrine-home item is discharged by the principle landing in `strategy-integration`.
- **Doctrine.** The principle — evidence applicability follows covered content, never head movement as such —
  lands in `strategy-integration` § Review Admission and Head Movement (already the nearest statement) and is cited,
  not restated, from `strategy-concurrent-work`.
- **Delivery-plan candidate, firmed.** Deliverable A: base movement on the unified classification (the relief).
  Deliverable B: the method, the doctrine, and the seams. Re-raise at the readiness read.
- **Class.** Composition of existing classifications and an existing method pattern; stays `Heavy`.

## Success signal

Three verified work units publish and integrate concurrently while Errands land throughout, with no session pausing
for another. An integrating work unit whose base advanced only disjointly, on a host that reports it mergeable,
reaches `ready / request-approval` with zero reconcile commits, zero re-judgments, and (for a delivery) zero
rebuilds; one whose base advanced with overlap, or whose host refuses, takes the typed base-merge arm once, then one
fresh checkpoint and one fresh approval — no cycle, and no manual stop short of a real conflict.

## Unknowns and assumptions

- Assumes the PR required check runs on the host's test-merge ref for `pull_request` events (true for the current CI
  workflow). A project whose checks run on the head ref alone gets weaker pre-merge evidence under the disjoint arm
  and must rely on base CI; doctrine says so.
- Assumes path-level overlap is the right safety grain. Semantic interaction across disjoint files is caught by CI on
  the base after merge, as on every non-strict host. This is the deliberate industry trade, not an oversight.
- Known gap in this repository's backstop: push-to-`main` CI runs only lint, typecheck, and unit; integration, e2e,
  and portability are pull-request-only. The doctrine contract (step 9) names what base CI must cover; bringing this
  project's own `main` CI up to that contract is a project CI change captured for an Errand or the in-flight CI
  work, not this work unit's scope.

## Scope boundary (Won't Do)

- No queue, lane record, priority, head-of-line visibility, or exclusive cross-work-unit window.
- No native `merge_group` adapter; no change to the delivery-stack `queue-not-atomic` posture beyond confirming it.
- No typed chain-rebuild operation (commit and tree construction, ARC-private ref leases, detached gate placement,
  eligibility re-preparation) — `delivery-authoring-rebuild` owns it for the overlapping and interrupted-authoring
  cases. This work unit owns only the predicate that says whether a rebuild is owed.
- No Candidate re-root or scoped verification changes — the "resume scoped review-fix verification before Candidate
  re-root" Errand and the review cohort own currentness-versus-verification.
- No edits to the review cohort's workflows' review-fix fire-points, no `retrigger` semantics, no review-fix collapse —
  `review-activity-contracts` and `review-orchestration-right-sizing` own those; they adopt the method as a seam.
- No host merge-state signal redesign — `host-policy-evidence` owns replacing the lazy `mergeable` boolean with
  native `mergeStateStatus`. This work unit only exposes the existing boolean through one typed slot with a bounded
  re-read on `null`; when the native signal lands it flows through the same slot.
- No configuration key (see Decisions).
- No projection retirement, dematerialization, or `ROADMAP`-specific merge machinery — `roadmap-tooling` and
  `operational-state-docs` own branch-carried projection retirement on the storage-evolution line.
- No change to this repository's CI workflow (which legs run on push to `main`); captured separately.

**Coordination.** Sequence edits to `integrate-work-unit.md` with `review-signal-convergence` (Step 3/4 regions) and
`review-activity-contracts` (applicability step); this work unit edits Step 10 and the drift arms. At planning close,
capture via `USER-INBOX`: the review-lane doctrine sentence to the review cohort; the narrowed
`delivery-authoring-rebuild` boundary ("integration-lane says when, rebuild says how") so its stub is minted
correctly; the `baseContained` ownership decision to `review-activity-contracts`; the push-to-`main` CI coverage
gap as an Errand-sized item (or to `ci-defer-heavy-reconciliation` if it is already in its scope); the unified
method's signature to `review-activity-contracts` (D7.1's statement becomes an invocation), to the "resume scoped
review-fix verification" Errand, and to `review-orchestration-right-sizing` (its doctrine-home item is discharged
here); and the `cohort-chunked-delivery.md` reference that names `integration-lane` as co-owner of final-window
behavior with `integration-boundary-accuracy`, which the rename orphans.

## Scope Estimate

Heavy — the design composes existing analyzer, checkpoint, eligibility, review-status, applicability, and
host-adapter primitives into one classification and one method, but it crosses the work-unit, Errand, and delivery
integration paths plus two strategies, and must be sequenced against an in-flight review cohort.

## Continuity

- **Readiness:** maturing. The base-movement design is settled through two adversarial passes (pass one's
  host-mergeability blocker and five majors; pass two's fallback-arm blocker and four majors, all folded). Scope
  then widened to own the unified evidence-applicability classification and method; § Open design is the unauthored
  part.
- **Next:** re-enter `draft-design` at `high`; inventory the existing applicability surfaces named in § Open design;
  author the classification and method with their marked fire-points; re-run the readiness read, which carries a
  fresh adversarial offer. Then the capture commit with the stage advance, then
  `arc rename integration-lane base-movement-policy` on the clean tree (it relocates this checkout — hand off and
  re-enter in the renamed worktree rather than continuing in place); then create-spec. Reconsider the slug once the
  method is named.
