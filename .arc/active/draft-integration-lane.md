# Draft: integration-lane — base movement and evidence applicability

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the 2026-07-19 housekeep drain; captured during
  post-`finalize-parallelism` CI and merge-concurrency review, 2026-07-18. Reframed 2026-09-09 after grounding showed
  the waiting is ARC-imposed rather than host-imposed. Rename after capture (§ Continuity).
- **Purpose:** Stop concurrent work from pausing on each other's integration. ARC treats any advance of the protected
  base as invalidation of an integrating work unit or Errand, which is stricter than the host it runs on and stricter
  than industry practice. The correction is a proportionate base-movement policy — non-overlapping movement is
  merge-safe, overlapping movement reconciles at the terminal boundary only — plus doctrine that no session ever waits
  for another, and one evidence-applicability policy so that neither base movement nor an approved review fix repeats
  verification or review beyond what the delta touched. A repository-scoped queue is explicitly not the answer; the
  terminal merge already serializes.

- **State:** Planning — **formalization-ready** (2026-09-09), crossing into `create-spec`. The base-movement design
  is settled through two adversarial passes. Scope then widened to own evidence applicability — one delta envelope,
  one judgment method, and its verification instance — authored the same day from a surface inventory and the
  `plan-segmentation` review-fix evidence, attacked by a third adversarial pass, folded, and passed the readiness read.

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
- Verification currentness has the same defect on a different axis. An approved review fix that touches any
  reviewable path flips the Candidate lineage to `convergence pending`, and the only exit is "one final Tier 3 over
  the converged lineage" (`pre-publication-procedure.ts`). The `targeted | focused | full` scope the primary records
  with the fix is stored and never consulted; the sole discriminator is the boolean `implementationChanged`. On
  `plan-segmentation` (2026-09-08) a one-line code fix and, ninety minutes later, a six-line documentation sync each
  forced a Candidate re-root. The first re-ran the full suite and re-walked every success criterion, because the
  approved response could not be recorded (a delivery-member target-typing defect, captured as the "resume scoped
  review-fix verification" Errand) and the attestation verb then read an explained delta as unexplained.

Every landing anywhere in the repository therefore costs every integrating branch either a merge, a gate run, a
push, a recompose, and an attended judgment, or a manual stop; a delivery can owe a manual rebuild; and every approved
review fix costs a convergence Tier 3 regardless of what it touched. Under concurrent landings the loop repeats.

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
  is safe" is already in code, even where that code is uncalled.
- **The Candidate attestation is already safe against base movement.** It binds the work unit's own subject digest;
  unrelated base movement leaves it `applicable / recognize-current`. Under base movement, verification does not go
  stale — only the checkpoint, review status, and delivery coordinates do. (Its staleness under an approved fix is the
  separate defect in § Problem.)
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
- **The applicability surfaces are ten, and they answer one question in five vocabularies** (inventory 2026-09-09).
  "Prior evidence still holds" is `carry`, `recognize-prior-review`, `recognize-current`, `current`, and
  `retain-prior-attempt` across `core/applicability.ts`, `review-contribution-applicability.ts`,
  `candidate-applicability.ts`, `candidate-attestation.ts`, and `review-applicability-authority.ts`. "Base moved" is
  detected four independent ways (`behind`, `merge-base --is-ancestor`, OID inequality, re-observed heads). Path-set
  intersection is implemented three times with three result vocabularies. The review-contribution and Candidate
  classifiers are the same D4 algorithm twice, differing only in baseline (head versus subject digest) and in the
  Candidate side filtering by path treatment. `core/applicability.ts`'s three classifier functions have no caller;
  the module survives only to register a `review-applicability` v2 schema in the closed durable-record inventory, and
  no such record exists on disk.
- **Two path-treatment registries answer "does this path count" incompatibly.** The base-drift classifier knows
  `substantive | regenerable` and only `ROADMAP`; the Candidate subject knows `reviewable | operational |
  candidate-projection` and also excludes the work unit's own meta, the Candidate record, the submission boundary, and
  vacated relocations. Nothing shares them.
- **Cause-awareness is inverted relative to authority.** The base-drift read names which work unit landed and by what
  proof, and feeds only an advisory line and a set intersection; the surfaces that gate authority discard cause and
  ask a human. Only the Candidate lineage reducer knows a delta's cause (its transition kind), and it uses that for one
  thing: an unexplained delta blocks.
- **Verification and review clearance are already separate objects with separate staleness.** The Candidate
  attestation is keyed to the reviewable subject digest and survives head movement; review clearance is keyed to the
  exact head and never carries. The three-valued owner choice (`covered | targeted-check | changed`) exists on the
  verification side only; the review side offers two. The scoped re-verification transition kind
  (`verification-response`) exists and is reachable only from the delivery-member correction path.
- **The success-criteria walk repeats only on the unexplained-delta path.** The normal convergence arm demands gates,
  not criteria. Nothing in the review-fix gate — the disposition set, `review-triage`, `review-response` — refers to
  success criteria; a comment typo and a fix that reverses a criterion produce the same outcome. Criterion text is
  already immutable and `validate-criteria` already digests criterion identity; neither is connected to the fix path.

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
   advisory, and `arc base drift` reads) and states which consult `movement`. `movement` is the base-drift read's
   projection of the evidence-delta envelope's `overlap` axis (step 11), not a third vocabulary beside the Candidate
   classifier's structural facts.
2. **Overlap grain.** Path-level substantive intersection between the base's advance and this change's contribution,
   since their merge-base, classified through the registry of step 12 with today's inert set unchanged (`ROADMAP` is
   the sole regenerable path). CI on the base is the backstop for semantic interaction, as it is everywhere else.
3. **The checkpoint decides merge-safety from movement × host, with three typed arms.** On `reconcile`,
   `arc integrate checkpoint` reads host mergeability through one shared typed read (step 7 gives the Errand path the
   same read). Path disjointness is not Git mergeability in general, so the host read is load-bearing, not a nicety.
   The read is bound, not bare: the host slot carries the host-observed base and head OIDs from the pull-request
   payload beside `mergeable`, and a mismatch with the drift read's base OID or the local head classifies
   `unresolved`, never `mergeable` — today's read maps only the boolean, so a mergeability computed against a
   different base tip could otherwise pair with a disjoint overlap computed against this one.
    - **Disjoint + host mergeable → compose normally.** `arc integrate merge` proceeds to the exact-head merge; the
      host's merge commit combines the trees, as on any non-strict repository. No base merge, no re-judgment; clearance
      carries. The ready surface's base-drift line renders "behind N, disjoint, host mergeable" as a decision-bearing
      fact for the approver rather than asserting a clean read.
    - **Overlapping + host mergeable → the typed `arc base merge` arm.** This retargets today's `reconcile-base`
      (which was reachable only for the no-overlap case and would otherwise become dead code): git can three-way merge
      cleanly, the merge commit carries interaction, so Tier 1 gates, one push, one checkpoint, one approval follow,
      and the review-applicability judgment is owed — this is the one arm where "clearance never carries" still
      applies. The mutating merge keeps its integration-evidence-completeness guard; the read-only classification
      (step 1) does not. That asymmetry is accepted: completeness protects a mutation, not a reading. This arm
      commits and pushes the merge commit ahead of its structured review under the Review-Increment Invariant's
      "typed safe base reconcile" exception, whose text today reads "safe" as no substantive overlap; step 9 amends
      that reading (maintainer decision, 2026-09-09).
    - **Host conflicting → a conflict-resolution stop.** The local merge would conflict too; the remedy names the
      conflicting paths from the host read, not "substantive overlap". Inert-only overlap resolves the same way: a
      mergeable `ROADMAP` three-way merge lands a hybrid render on the base, accepted under `project-state-integrity`'s
      regenerate-wins posture (the next ceremony regenerates it); a conflicting one is the local merge plus regen path
      that exists today. No projection-specific mechanism is added, and the rule degenerates to "nothing inert" once
      `roadmap-tooling` retires branch-carried projections.
    - **Host unresolved (`mergeable: null`, the common first read after a push, or host-observed OIDs that do not
      match the drift read) → bounded re-read, then a typed `host-pending / retry` result.** Never the overlap
      remedy. Retryable path, light handling.
   The delivery terminal classifier gains the same disjoint arm and stops counting inert paths toward predecessor
   overlap.
4. **A typed exit from a host merge refusal.** GitHub answers a strict-currency `BEHIND`, a protection refusal, or a
   conflict with an HTTP error, which the merge verb today folds into `blocked / operation-failed` alongside transport
   failures. Fix: the pinned-merge port classifies host HTTP refusals into a typed host-refusal state distinct from
   transport failure; the merge verb's final drift read returns base OID and movement, not only the verdict, with the
   host slot bound to the same observed OIDs as in step 3, and re-classifies at merge time (disjoint → proceed;
   overlapping → `drift-reconcile`); a host refusal after a disjoint checkpoint returns `invalidated /
   reconcile-base` carrying expected base and head, so the workflow offers the typed `arc base merge` instead of
   looping through re-checkpoint and re-approval. Transport failure stays `operation-failed`. When
   `host-policy-evidence` lands native merge-state, `BEHIND` is observed before the merge is offered and this exit
   becomes the rare path.
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
   itself is the method in step 13; this step wires its base-movement instance at the review-status arm and the
   checkpoint, and leaves the review-fix fire-points to the review cohort as seams.
7. **Errand path gets the same policy through the same read.** The host-mergeability fact is exposed once, as a slot
   on the base-drift read whenever a change request is bound; the checkpoint consumes it internally and the Errand
   invokes it before lock release, dispatching on the same arms: disjoint and mergeable → release and merge;
   overlapping and mergeable → the typed `arc base merge` (replacing the implicit "append-only base reconcile"),
   gates, push, and the applicability judgment; conflicting → the conflict stop with the lock still held; unresolved
   → bounded re-read. An Errand never reaches `gh pr merge` on a refusal the read would have shown.
8. **Strictness comes from the host, not a new key.** Where the host enforces up-to-date branches, ARC observes it
   and takes the typed base-merge arm instead of offering a disjoint merge it cannot complete. Until the native
   merge-state read ships (`host-policy-evidence`), the host's own refusal at the merge verb is the enforcement and
   step 4 is the typed route out. No dependency edge; consume the host-read shape when it lands.
9. **Doctrine.** `strategy-concurrent-work` § Merge ordering and § Worktree operations, and `strategy-integration`
   § Terminal Integration Authority, state the invariant plainly: sessions never coordinate around each other's landing
   windows; disjoint landings invalidate nothing; overlapping landings reconcile at the terminal boundary only. The
   "merge from one designated worktree", "refresh the others after a merge", and "Errand branches wait their turn"
   conventions are revised (the first has no identity rationale and is already stale against the self-teardown step;
   the second contradicts § Append-only). "Clearance never carries" narrows in `integrate-work-unit.md` to the
   overlapping arm. `DEV-RULES.ARC` § Review-Increment Invariant's fourth exception, "a typed safe base reconcile",
   is amended (through package source; the maintainer chose this over a pre-push stop on 2026-09-09) so that "safe"
   means host-mergeable with the overlap disclosed and Tier 1 green, with the review-applicability judgment owed at
   the checkpoint and exact-head authorization still gating the merge — the merge commit is git-generated content the
   checkpoint approval already sees, so a separate stop before its push is a stop with one answer. Doctrine states
   the CI contract the disjoint arm relies on: pre-merge evidence is the host's test-merge check as of run time, and
   post-merge evidence is CI on the base — which must therefore run the same legs that gate a pull request, or the
   project accepts the reduced coverage knowingly.
10. **Native queue seam stays where it is.** The terminal action remains a closed typed value (`merge`);
   `queue-not-atomic` remains the delivery refusal. A future `enqueue` arm is additive after lock release, with
   asynchronous completion handled by the existing `merged-at-head` resume path. Nothing is built for it here.

### Evidence applicability

The three decisions above — review clearance, verification currentness, merge safety — ask one question: evidence E
was bound to target T0; the target is now T1; does E cover T1 (carries), cover it with a bounded supplemental check,
or not at all (fresh)? This work unit owns the one typed answer and the one judgment over it, with base movement as
the first fully wired instance and the review-fix verification scope as the second.

11. **One evidence-delta envelope, emitted from existing producers.** A typed shape every fire-point composes from
    computations that already exist — not a new classifier. Four axes: `cause` (`base-movement` | `approved-fix` |
    `base-merge` | `member-rewrite` | `unexplained`), from the Candidate lineage's transition kinds and the base-drift
    read's integration evidence; `relation` (`equal` | `mechanical-reapply` | `clean-divergence` | `interaction` |
    `unavailable` | `not-applicable`), from the D4 proofs and subject-digest equality the two existing classifiers
    already return — produced for the movement causes only, since D4 is defined over a reapply across a changed
    predecessor, and `not-applicable` for `approved-fix`, whose in-place edit is never D4-classified (after a
    response the durable baseline is the new target) and is described instead by its reviewable path delta and the
    approved scope (step 15); `overlap` (`disjoint` | `overlapping` | `unknown`, with the inert paths named), from
    the one registry in step 12; and `host` (`mergeable` | `conflicting` | `unresolved` | `not-applicable`), from
    step 3's bound read, carrying the host-observed base and head OIDs. The bounded residual paths ride with it. The
    Git axes are composed from one observation of head and base, and the host axis is admitted only when its observed
    OIDs match that observation, so the four existing base-movement detectors cannot disagree inside one envelope.
    Every cause has a consuming arm: the three movement causes take the relation-driven arms of step 13, with
    `base-movement` alone additionally unlocking merge-safety carry; `approved-fix` takes the approved scope;
    `unexplained` is fresh and is the one arm no judgment may soften. The two D4 classifiers keep producing their
    projections unchanged and are not merged here (§ Decisions). The review-gate `core/applicability.ts` module, its
    `review-applicability` v2 inventory row, and the caller-inventory test expectation are removed together: the
    classifier has no callers, the schema has no records, and there are no adopters to carry.
12. **One path-treatment registry.** The base-drift `substantive | regenerable` classifier and the Candidate subject's
    `reviewable | operational | candidate-projection` treatment become one registry that both producers call:
    `reviewable` (counts everywhere), `operational` (the work unit's own meta, the Candidate record, the submission
    boundary, vacated relocations, and project documents), with `regenerable` the operational subset the host may
    three-way merge into a hybrid render (today `ROADMAP` alone). The registry takes the work-unit identity as input,
    because the own-artifact and Candidate-projection paths are keyed by it and every caller — the checkpoint, the
    merge verb, `arc base drift` in a work-unit checkout, the subject collector — already holds it. Operational paths
    are excluded from `overlap` entirely; only the regenerable subset carries the hybrid-render consequence of
    step 3. The set is not widened; the two answers stop disagreeing.
13. **One judgment method, `assess-evidence-applicability`.** Signature: `(delta, evidence, act) -> { verdict:
    carries | supplemental | fresh, residual }`, where `evidence` is `review-clearance` | `verification` |
    `merge-safety` (quality-gate results fold under verification) and `act` is the operation the evidence gates. Its
    deterministic arms are stated in the method and computable from the envelope: `relation: equal` carries;
    `cause: unexplained` is fresh; `merge-safety` on `overlap: disjoint` with a mergeable host carries;
    `cause: approved-fix` maps the approved scope to the verdict (`targeted` carries, `focused` supplemental, `full`
    fresh); on `interaction` the method never recommends carry — fresh for verification, supplemental at minimum
    for review clearance. The residual judgment — whether a bounded `clean-divergence` or overlapping delta deserves
    a supplemental pass or a fresh one — stays prose, disclosed with the residual it was made over. Where an
    authority already holds the choice (the checkpoint's `covered | targeted-check | changed`, the disposition set's
    approved scope), the method's verdict is the recommendation that authority sees, made before the choice, and the
    recorded selection is what acts afterward — an approver may select more narrowly than the recommendation, and
    that is the holder's decision, not a softened arm; the agent's own verdict never releases a check over its own
    work (Rule Authority). A method rather than a verb so `composable-workflows` can lift it unchanged.
14. **Fire-points this work unit marks.** `integrate-work-unit.md` at the checkpoint drift arms, the review-status
    `base-moved` arm, and the Step 10 host-refusal exit; `deliver-stack.md` at eligibility and the terminal
    classifier; `run-errand.md` at the pre-release read; `verify-work-unit.md` and `prepare-work-unit.md` at the
    attest/convergence arm. Each is a marked fire-point in a workflow this work unit edits, because a method a workflow
    needs but never marks silently never loads.
15. **Verification instance: the lineage carries and consumes the approved scope.** `review-signal-convergence`
    carries the proposal-side field (adopted 2026-09-09): a required `proposedVerification` at the root of the
    canonical disposition set, valued from the existing `targeted | focused | full` enum, in immutable disposition
    content so it participates in the disposition-set identity, approval binding, and fix authorization; the post-fix
    `verifiedFix.applicability` must be equal or broader. The lineage must carry that approved value itself, because
    the durable baseline reducer is a pure function over the Candidate record — it cannot reach the disposition store,
    and the transition's existing `applicability` is the primary's own selection, which may not release a check over
    the primary's own work. So the `review-response` transition gains `approvedVerification`, copied from the
    approved disposition set at the one write site that already holds it (the response writer, where the ≥ floor is
    enforced — one pass-through field, adopted by `review-signal-convergence` into its Task 4.3 on 2026-09-09);
    this work unit owns the transition schema and constructor, the reducer, and every consumer. The reducer
    dispatches on `approvedVerification`, and since all eight `convergenceVerification` readers derive from that one
    reducer they agree by construction. `targeted`: convergence is satisfied by the fix increment's own Tier 1
    evidence (the transition's `verificationEvidenceRefs`) — no convergence Tier 3, no criteria walk, no attestation,
    the lineage advances. `focused` and `full` both close through `arc attest` writing a lineage attestation that
    gains a `scope` field mirroring the approved scope: `focused` over the bounded check's evidence, `full` over
    today's Tier 3. The delivery-member `verification-response` kind is not reused — its guard requires an
    already-satisfied baseline and it records a correction delta, the inverse of what a same-subject bounded check
    needs. A transition without `approvedVerification` reduces to `full`, which is today's behavior; that is the
    fail-closed default, real because every record written before the field exists lacks it, and it makes landing
    order against `review-signal-convergence` immaterial. The transition preimage and the attestation shape change,
    which the pre-release posture permits; development Candidate records regenerate. The unexplained-delta path is
    untouched: `blocked / establish-new-root` still follows fresh full verification, and that is the only path on
    which the success-criteria walk repeats. Criterion-text immutability and the `validate-criteria` digest stand.
    ADR-034's reopening clause names this change ("carries structural equivalence into the attestation lineage") and
    requires an explicit amendment: a Tier 2 dated annotation records that the lineage advances on an approver-bound
    scope, with the disposition-set approval as the authority. The liveness Errand ("resume scoped review-fix
    verification before Candidate re-root") fixes the route by which an explained delivery-member delta reaches its
    transition; without it that path degrades to `full`, never to a wrong answer, so it is sequencing, not a
    dependency.
16. **Doctrine.** The principle — evidence applicability follows covered content, never head movement as such — lands
    in `strategy-integration` § Review Admission and Head Movement and is cited, not restated, from
    `strategy-concurrent-work`. `review-orchestration-right-sizing`'s doctrine-home item is discharged by it.

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
  "overlapping, host mergeable"; substantive overlap no longer refuses a merge git can perform cleanly. Among the
  base-movement arms, the review-applicability judgment is owed on that one and nowhere else.
- Host mergeability is read once, through a typed slot on the base-drift read, for every path that offers a merge.
  Unresolved mergeability is retried within a bound, never treated as overlap.
- The unified evidence-applicability policy is **this work unit's**, not a separate one. Review clearance,
  verification currentness, and merge safety share one question ("does evidence bound to target T0 still cover T1")
  and one three-way answer, and `candidate-applicability` already computes a delta classification
  (`mechanical-reapply` / `clean-divergence` / `interaction`) that a base-movement-only `movement` field would
  duplicate under a third vocabulary. So this work unit owns the one CLI-computed delta envelope and the one judgment
  method, with base movement as the first fully wired instance and the review-fix verification scope as the second.
  The review-fix applicability fire-points in the review cohort's workflows remain seams their owners wire.
- Evidence applicability is one envelope over existing producers and one method, not a new classifier. Rewriting the
  two D4 classifiers into one type is unsupported by any chartered goal and collides with `review-signal-convergence`
  building on them now; their merger is captured for after that work unit lands. `core/applicability.ts` is removed
  with its inventory row because its classifier has no callers and its schema has no records. One path-treatment
  registry replaces two because two registries answering one question is the concrete mismatch that keeps the
  base-drift and Candidate reads from agreeing.
- The overlapping base-merge arm stays inside the Review-Increment Invariant's "typed safe base reconcile"
  exception by amending what "safe" means (step 9), rather than adding a pre-push stop. Maintainer decision,
  2026-09-09: the alternative was a stop with one answer.
- The verification instance is this work unit's. The consumer is a durable authority change (ADR-034's reopening
  clause), which the liveness Errand is scoped to exclude, and it is one design with the proposal-side field: the
  scope call decides whether a check applies to the agent's own work, so it must be approved at the gate where the fix
  is approved. The field itself is carried by `review-signal-convergence` because that work unit is reshaping the
  disposition set now; this work unit consumes it fail-closed, so neither depends on the other's landing order. No
  dependency edge is recorded in either direction.
- Verification is not "never repeated". Gates run on the head that merges (Tier 1 on every fix here, the required
  check on the host); `full` and the unexplained-delta root stay fresh. What changes is that the repeat is scaled to
  the approved scope of what the fix touched, and an explained delta is never treated as an unexplained one.
- Movement rides beside the verdict as an additive field; the verdict enum is not extended. Preserves the recorded
  "raw distance controls the verdict" invariant and keeps unaware consumers fail-closed.
- The hybrid `ROADMAP` render a mergeable host three-way merge can leave on the base is an accepted consequence, not
  a new mechanism: regenerate-wins already governs it. Retiring branch-carried projections is `roadmap-tooling` and
  `operational-state-docs` work, on the storage-evolution line; this policy composes toward it by adding nothing
  projection-specific.
- The Candidate root attestation and its subject-digest applicability are untouched; the `review-response`
  transition and the lineage attestation each gain one field (step 15). Exact-head merge authorization, the
  integration interlock, the draft lock, and the append-only invariant are untouched.
- Delivery reconstruction stays a separate work unit (`delivery-authoring-rebuild`, to be minted from its capture
  with the narrowed boundary below). The two are orthogonal subsystems: this work unit owns the predicate that says
  whether a rebuild is owed; that one owns the typed rebuild operation for the overlapping and interrupted-authoring
  cases. Flat siblings with a sequenced seam, not one work unit and not a cohort.
- Boundary fit: stays one work unit. Delivery-plan candidate noted — the three deliverables in § Scope Estimate —
  re-raise at the spec's boundary read, not before.
- Class: `Heavy` confirmed — a real design composed from existing primitives across three integration paths, the
  attest/convergence arm, and two strategies; nothing invented.

## Success signal

Three verified work units publish and integrate concurrently while Errands land throughout, with no session pausing
for another. An integrating work unit whose base advanced only disjointly, on a host that reports it mergeable,
reaches `ready / request-approval` with zero reconcile commits, zero re-judgments, and (for a delivery) zero
rebuilds; one whose base advanced with overlap, or whose host refuses, takes the typed base-merge arm once, then one
fresh checkpoint and one fresh approval — no cycle, and no manual stop short of a real conflict. An approved narrow
review fix advances the Candidate on its own Tier 1 evidence with no repeated suite and no criteria walk; a `focused`
fix records one bounded check; an unexplained delta still roots fresh.

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
- `review-signal-convergence`'s `proposedVerification` field and the one-field pass-through into the transition
  (step 15) are adopted (Tasks 4.3 / 4.4) but not landed; the consumer here is fail-closed against their absence, so
  the only assumption is that the adopted shape holds.
- The liveness Errand has not run. Until it does, an explained delta on the delivery-member prepublication path still
  reaches the attestation verb as unexplained and takes `full` plus a new root.

## Scope boundary (Won't Do)

- No queue, lane record, priority, head-of-line visibility, or exclusive cross-work-unit window.
- No native `merge_group` adapter; no change to the delivery-stack `queue-not-atomic` posture beyond confirming it.
- No typed chain-rebuild operation (commit and tree construction, ARC-private ref leases, detached gate placement,
  eligibility re-preparation) — `delivery-authoring-rebuild` owns it for the overlapping and interrupted-authoring
  cases. This work unit owns only the predicate that says whether a rebuild is owed.
- No change to the unexplained-delta path (`blocked / establish-new-root` and fresh full verification), and no change
  to the route defect the "resume scoped review-fix verification before Candidate re-root" Errand owns.
- No proposal-side disposition-set schema, `review-triage` / `review-response` method, or `respond-command.ts` edits —
  `review-signal-convergence` carries `proposedVerification` (Tasks 4.3 / 4.4); this work unit reads it.
- No merger of the review-contribution and Candidate D4 classifiers — captured for after `review-signal-convergence`
  lands. No edits to the review cohort's workflows' review-fix fire-points, no `retrigger` semantics, no review-fix
  collapse — `review-activity-contracts` and `review-orchestration-right-sizing` own those; they adopt the method as
  a seam.
- No criterion-digest or criterion-immutability changes.
- No host merge-state signal redesign — `host-policy-evidence` owns replacing the lazy `mergeable` boolean with
  native `mergeStateStatus`. This work unit only exposes the existing boolean through one typed slot with a bounded
  re-read on `null`; when the native signal lands it flows through the same slot.
- No configuration key (see Decisions).
- No projection retirement, dematerialization, or `ROADMAP`-specific merge machinery — `roadmap-tooling` and
  `operational-state-docs` own branch-carried projection retirement on the storage-evolution line.
- No change to this repository's CI workflow (which legs run on push to `main`); captured separately.

**Coordination.** Sequence edits to `integrate-work-unit.md` with `review-signal-convergence` (Step 3/4 regions, and
every presentation site of the disposition set — which now includes `prepare-work-unit.md`'s review-fix paragraph)
and `review-activity-contracts` (applicability step); this work unit edits Step 10, the drift arms, and the
convergence arm. Direct coordination with the in-flight `review-signal-convergence` session (2026-09-09) adopted the
proposal-side `proposedVerification` field and its pass-through into the `review-response` transition, both in its
Task 4.3, as recorded in step 15 (the transition constructor and schema are this work unit's). Two further asks to
it: consume applicability only through the public verbs (`arc review status`, `arc candidate applicability
resolve`), never classifier internals, because the envelope composes beneath them; and the method's output
vocabulary, so its coverage-basis language matches. At planning
close, capture via `USER-INBOX`: the review-lane doctrine sentence to the review cohort; the narrowed
`delivery-authoring-rebuild` boundary ("this work unit says when, rebuild says how") so its stub is minted
correctly; notice to `review-activity-contracts` that the `baseContained` arm's ownership is decided here (step 6
rewires it) so its D7.4 statement cites rather than re-decides; the push-to-`main` CI coverage gap as an
Errand-sized item (or to `ci-defer-heavy-reconciliation` if it is already in its scope); the method's signature to
`review-activity-contracts` (D7.1's statement becomes an invocation) and to
`review-orchestration-right-sizing` (its doctrine-home item is discharged here); the D4 classifier merger as a
post-`review-signal-convergence` item; and the `cohort-chunked-delivery.md` reference that names `integration-lane`
as co-owner of final-window behavior with `integration-boundary-accuracy`, which the rename orphans.

## Scope Estimate

Heavy — the design composes existing analyzer, checkpoint, eligibility, review-status, applicability, lineage, and
host-adapter primitives into one envelope, one registry, and one method, but it crosses the work-unit, Errand, and
delivery integration paths, the attest/convergence arm, two strategies, and one ADR amendment, and must be sequenced
against an in-flight review cohort. Delivery-plan candidate: A — base movement on the envelope (the relief); B — the
registry, the method, doctrine, and the seams; C — the verification instance and the ADR amendment. Re-raise at the
readiness read.

## Continuity

- **Readiness:** maturing. Base movement is settled through two adversarial passes (pass one's host-mergeability
  blocker and five majors; pass two's fallback-arm blocker and four majors, all folded). Evidence applicability
  (steps 11–16) was authored 2026-09-09 from the surface inventory and the `plan-segmentation` evidence, with the
  proportionality method applied at its entry (one `revise` finding folded: an envelope over existing producers rather
  than a classifier rewrite). A third adversarial pass (2026-09-09, by the developer's call past the Heavy cap) ran
  over the whole draft and returned one blocker (the approved scope had no carrier in the lineage), five majors (the
  `focused` arm's transition reuse, the dead-module claim, host-read base binding, the Review-Increment Invariant
  carve-out, no `relation` producer for an approved fix), and three minors; all nine were verified against source and
  folded, the carve-out by maintainer decision. Steps 1–10 otherwise withstood.
- **Next:** `arc rename integration-lane evidence-applicability` on the clean tree (settled 2026-09-09: the slug
  names the one question every step answers; the rename relocates this checkout — hand off and re-enter in the
  renamed worktree rather than continuing in place); then create-spec, whose entry re-reads the derivation axis with
  this draft as its evidence and owns the two consumer enumerations steps 1 and 5 assign to it.
