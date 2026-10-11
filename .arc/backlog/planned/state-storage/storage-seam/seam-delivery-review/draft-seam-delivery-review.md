# Draft: Seam Delivery and Review Records

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route delivery and review records — Candidate records with their supersession, retirement, and
  withdrawal, and the review gate's durable evidence, outcomes, and termini — through the storage contract, so a work
  unit's own record writes stop moving its head.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Offer an Errand the work-unit review-applicability selection once the seam stores its review records**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: seam-delivery-review`), housekeep drain (2026-10-11).

- _Shapes:_ its Errand review records, and the Candidate review-applicability selection it carries for work units.

- _Observation:_ after a base reconcile absorbs overlapping base movement, Errand review status carries the earlier
  review to the new head only when no movement overlaps the reviewed paths (`readCarriedErrandReview` in
  `status-errand.ts`); otherwise it asks for another review pass, or for the Owner's review stop once the pass
  ceiling is spent. A work unit facing the same bounded residual gets a typed covered-or-review-required selection
  (`ReviewApplicabilitySelectionOffer`, `resolveReviewApplicability`) recorded on its Candidate record. Errands
  cannot take that selection before the seam, since the program's pull-forward filter admits no stored record or
  record shape. `errand-overlap-continuation` made the reconcile reachable and left this decision as the remaining
  divergence.

- _Approach:_ once Errand review records live in the store, offer Errands the same selection from the same producer,
  bound to the same selector, projection, and residual digests, rather than a parallel Errand mechanism;
  `review-required` keeps the ordinary next-pass path.

- _Drain note (2026-10-11):_ since `808c8181e`, an Errand's review carries across base movement that merges
  without a substantive conflict, even where both sides edit a file; the selection asked for here now covers only
  movement that conflicts.

- _Captured during:_ Errand `errand-overlap-continuation`, 2026-10-10.

### `[ ]` **Compose `arc errand merge` and the work-unit integration checkpoint through one terminal sequence**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-10-11).

- _Shapes:_ § Delivery and review records — the Candidate review-applicability selection this member carries for
  work units, which the two terminal sequences call in different orders. A weak fit: the capture also names
  `delivery-rebuild-continuity`; re-route at this member's planning if the terminal sequence reads as its.

- _Observation:_ both terminal paths use the shared movement planner (`composeCheckpointMovementPlan`) and
  applicability reducer (`reduceEvidenceApplicability`), but each sequences them itself, in `errand-merge.ts` and
  `checkpoint.ts`. That is how the Errand path came to judge review applicability before reconciling while the
  work-unit checkpoint reconciled first, a divergence `errand-overlap-continuation` closed by hand. Nothing keeps the
  two orders from drifting again.

- _Approach:_ extract one terminal sequence (blocked plan, then reconcile, then review applicability for a direct
  merge), with each vehicle supplying its own gates: delivery's residual containment and the Candidate selection for
  a work unit, the base-movement reduction for an Errand.

- _Scope:_ delivery machinery, so the program's pull-forward filter holds it behind the seam as a work unit;
  candidate homes are `seam-delivery-review` and `delivery-rebuild-continuity`.

- _Captured during:_ Errand `errand-overlap-continuation`, 2026-10-10.

### `[ ]` **Let a frontline admission that never ran be withdrawn or superseded**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: seam-delivery-review`), housekeep drain (2026-10-11).

- _Shapes:_ § Delivery and review records — Errand frontline skip. That item records an accepted skip keyed by the
  review subject's lineage; declining an admission whose run never started is that skip, and a superseded one is
  the same record's other arm.

- _Observation:_ an Errand's frontline progress is keyed to its claim, not its head: `laneProgressOperationId`
  (`review-gate/lane-progress.ts`) hashes `laneSubjectOwner`, which drops `headSha` from a `head-bound` lineage
  (`review-gate/core/lane-admission.ts`). `resolveFrontlineCommandWithinLock` (`policy/frontline-command.ts`) resumes
  any pending admission it finds through `resumePendingFrontlineAdmission` without comparing that admission's target to
  the request's. So once the head moves past a resolved-but-unrun admission, every resolve returns the stale admission
  as `ready / run-frontline`, and `arc review frontline run -` at the current head refuses it with a bare
  `invalid-input` "frontline ready admission is unavailable" (`runtime/frontline-run-command.ts:118`). Neither names a
  way out. The only exit is running the stale admission against its own old head, which closes the Errand's opening
  frontline phase: harmless for a word-identical rewrap, wrong for a substantive change, since later heads then skip
  frontline.

- _Observation (2026-10-11):_ the same trap holds at an unchanged head, and for a work unit. `frontline resolve`
  writes the admission itself, as a `pending` lane attempt (`recordLaneAttempt`, `policy/frontline-command.ts:197`),
  before any run. The pending check (`:355`) returns ahead of `resolveFrontlineSelection`, so the request's
  `invocation` is never read and `{ mode: "skip" }` cannot decline an admission once made. In `seam-record-kinds`, an
  agent resolved frontline although chunking resolution had tripped the thresholds, and its run never started. A
  work unit's pre-publication keeps routing to frontline while that lane is unsettled
  (`policy/pre-publication-procedure.ts:190`), so the only way out was deleting the review record by hand. That
  worked, but nothing checked that the lane's remaining records stayed consistent. An Errand's status and merge never
  read frontline, so there the trap costs a stuck lane rather than a blocked landing.

- _Observation (2026-10-11, unverified):_ a run that started and died may not have a reachable retry either. The
  replay refuses with `uncertain-provider-execution` and asks for a new request carrying `retryOfOperationId`, but
  that retry needs a fresh admission at a higher `retryGeneration`, and resolve keeps returning the old pending one.

- _Approach:_ withdraw or supersede an admission only when its run provably never started, meaning no operation state
  is published under its `operationId`. Do it through the ordinary resolve: an explicit `skip` at the same head
  withdraws it, and a different target supersedes it and admits fresh, or refuses with a typed reason whose remedy
  names that choice. Never delete or rewrite a run that started; that keeps its Owner-decided retry, which should be
  confirmed reachable. Give the run refusal a typed reason that tells a stale target from a missing admission. No
  general review-record cancel or cleanup verb: review records are evidence. Related: "Make a refused frontline
  retry name its remedy" above covers the `operator-repair` retry path, not a pending admission. CLI source —
  reviewed lane.

- _Routed:_ held in `§ Errand` until 2026-10-11: the fix needs a record-lifecycle decision, which the storage
  program's pull-forward filter keeps out of Errands, and the seam has since started. Routed here by Owner direction.

- _Captured during:_ Errand `re-review-spend-decline`, 2026-10-01, after a rewrap commit landed between frontline
  resolve and run; extended 2026-10-11 from the `seam-record-kinds` hand removal.

### `[ ]` **Census the review gate's decision records before their field schemas are designed**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: seam-delivery-review`), housekeep drain (2026-10-11).

- _Shapes:_ § Delivery and review records — Open, the review records' field schemas (D5); and its Coordination
  item on the Owner-accepted terminus's durable form with `review-protocol-alignment` and `review-source-authority`.

- _Observation:_ the review gate has about ten separate shapes for a decision about an exact review subject:
  `ReviewCeilingOverrideSchema`, `ReviewAdditionalPassAuthorizationSchema`, `ConditionalPassAuthorizationSchema`,
  `FixAuthorizationFieldsSchema`, `DispositionApprovalSchema`, `OwnerAcceptedReviewTerminusSchema`, the
  `DeliveryReviewTerminusAcceptance*` set, `FrontlineInvocationOverrideSchema`, and
  `CandidateResponseConfirmationActionSchema`. The Owner-directed review stop has no record at all. They have
  drifted:
    - the ceiling override and the additional-pass authorization carry nearly the same fields (target, lane, pass
      count, next pass);
    - only some record who decided (`authorizedBy`, `acceptedBy`);
    - only the conditional-pass authorization has a lifecycle (pending, bound, consumed, invalidated);
    - each sets its own reach: one call, one head, or everything after.

  The Owner-accepted terminus defects in `WORKING-MEMORY` are this drift. Two pending captures would add two more
  shapes: a whole-change review acknowledgment and the withdrawal of an unrun frontline admission.
  `core/schema-inventory.ts` lists durable records by identity rather than role, and most of these shapes are request
  inputs, so nothing shows them as one family.

- _Approach:_ before this member settles the review records' field schemas, census every decision shape. For each,
  record the subject it binds, who decided, its reach, its lifecycle, where it is stored (or that it is not), and
  its consumers. Then decide whether they share an envelope (subject binding, decided-by, reach, lifecycle) with
  kind-specific payloads; differences with a real reason stay separate. The census is read-only, so it can run ahead
  of this member's draft-design as preparation. It is also the first register for the by-kind mechanism register
  capture below.

- _Evidence:_ schema names and a handful of field lists compared on 2026-10-11; not every consumer path traced.

- _Captured during:_ the `cli-compile-cache` Errand's close, discussing a `seam-record-kinds` frontline report,
  2026-10-11.

### `[ ]` **Keep a by-kind register of recurring mechanisms, and have the proportionality check read it**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-10-11).

- _Shapes:_ § Delivery and review records, **Open** — the review records' field schemas (D5), on whose census
  this entry's timing proves the register first. Generalizing it into `assess-design-proportionality` stays
  open, and re-routes if this member's design does not use the register.

- _Observation:_ `assess-design-proportionality`'s `missed-composition` finding asks which current primitive
  supplies a need. But its `substrate-referents` input is optional, and otherwise existing substrate is discovered
  "narrowly from the problem and candidate". Same-kind mechanisms spread across modules under different names do not
  surface from one work unit's problem, so each design passes honestly and a family grows one shape at a time. The
  review gate's decision records are the worked example: about ten shapes (census capture above). The
  storage-coupling register in `cohort-state-storage.md` shows what works instead: every mechanism of one kind
  enumerated with an owner and a fate, under the rule that a mechanism with no row is a gap.

- _Approach:_ a small register per recurring kind, read by `assess-design-proportionality` as its substrate
  referents. Candidate kinds: decision and authorization records, typed stops and their retries, exact-subject
  bindings, recovery routes. A design that adds a mechanism of a registered kind names the row it extends, or says
  why none fits.
    - Mechanical where the code allows: tag `core/schema-inventory.ts` entries with a kind, add decision-shaped
      request inputs, and let a test refuse an unregistered decision shape (an architecture fitness function).
    - Triggered, not calendar-driven: the lookup runs at every design that adds a mechanism; a consolidation review
      fires when a kind reaches its third independent shape (rule of three); a census for unregistered kinds runs
      at program and cohort boundaries.

- _Timing:_ prove it on one kind first, the review decision census, before `seam-delivery-review` designs those
  schemas. Generalize into the method only if that register changes that design.

- _Open:_ where registers live (beside their kind's owning code, in a reference document, or both); who keeps them
  current; how a new kind gets noticed between censuses; and whether the method change ships to every project or the
  registers stay a convention of this repository.

- _Captured during:_ the `cli-compile-cache` Errand's close, discussing a `seam-record-kinds` frontline report,
  2026-10-11.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, from a draft
  the readiness check found formalization-ready for the cut (2026-10-09); what stays open is this member's own detail
  design.
- **Next:** draft-design, at its turn in the seam's design order (`cohort-storage-seam.md` § Coordination): re-verify
  its consumer-map rows against the current code and settle its open items.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's design record: items 1–8 and 11 in
`spec-seam-record-kinds.md`, whose `§ Shared decisions` maps those numbers to their current contract sections; item 9 in
`draft-seam-locus.md`; and items 10 and 12 in `draft-seam-lifecycle.md`. `§ Record kinds` resolves to
`spec-seam-record-kinds.md`'s `§ Proposed Design`. `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`,
`§ Locus`, and `§ Status and roadmap` name the member sections of `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Members

### Delivery and review records

- **Rows and keys.** Candidate records and their retirement and withdrawal (01's Candidate half); the Git-history
  supersession read in `candidate-response-confirmation.ts` and `candidate-record-store.ts`, whose `recordRevision`
  becomes a store version (02); a singleton's own record writes staling its publication boundary (34); review and
  delivery writers completing through a code commit (45); readiness and integration reads of lifecycle state (48); and
  the durable review facts of the register's machine-local row — evidence, outcomes, and termini — becoming stored
  records at project scope, the review gate's repository ID mapping onto the project ID; Candidate applicability
  resolution (`handleCandidateApplicabilityResolve`), whose Git staging and commit-selection continuation stay until the
  flip; mechanical applicability carry's before-and-after Candidate reads (`gitCandidateRecordAtHead`,
  `recordsOwnSelection`), which move to `read` and `history` at bound state versions, with the reader's two other
  importers in the review gate, which no map row names (`earlier-review-applicability.ts`,
  `local-review-coverage-selection.ts`); and the review gate's listing protocols over Errands and claims
  (`hosts/local/live-context.ts`, `runtime/respond-composition.ts`; key 62), keeping D4's refusal to authorize review
  from incomplete evidence.
- **From the contract's Part B.** The Candidate review subject becomes the code in the Git index alone from the cutover
  (D18). `collectGitCandidateSubject` (`lib/work-unit/git-candidate-subject.ts`) selects reviewable entries through
  `classifyPathTreatment`, which the cutover removes once its consumers move off it. This member builds D18's export,
  effective at the flip, since until then specs ride the branch: `storage.track_design_docs`, the copy at
  `.arc/specs/<slug>/` that lifecycle's prepublication and candidate-tail steps add, re-export, and delete, and the
  `merge-ok` guard. It also builds the narrow arm that keeps the delete from reopening review. Nothing has it today —
  `classifyPathTreatment` takes a path alone and has no export case — so it lives in subject construction, which knows
  the paths the subject deletes (`absentPaths`): deleting the copy is evidence-neutral, and adding or re-exporting it
  stays reviewable. Completion Notes and the Release Notes Entry come from the stored meta under every export option,
  never from the export or the pull-request head tree (D18), which settles the register row's "integration-time record
  decision". The delivery family's kinds split with `delivery-observe-attest`. Adversarial-pass records (D5): their
  field schema over the review gate's disposition set, approval, rubric binding, and lineage, and the verbs that write
  and render them and compose a later pass's prior findings, held to the one-call bound — the evaluator's report and one
  disposition per finding in; versions, pass number, and lineage derived; the input schema published. The method's
  fire-points switch to those verbs in the flip rewrite.
- **Candidate retirement.** `candidate-record-store.ts` has no deletion path, and archival leaves each record and its
  `.boundary.json` behind (16 files for 8 archived work units when captured). `subject-meta.ts` resolves the record
  live, and the confirmation read takes it from history. Clearing today's files rides the mechanism, never precedes it,
  since a backfill alone re-accumulates.
- **Withdrawal is a recorded fact.** A withdrawn one-member Candidate was observed being rediscovered from surviving
  topology and treated as publishable (captured 2026-09-07); the code path is not yet traced, and the member traces it
  when it plans. Record withdrawal so nothing revives implicitly; a successor needs a new authorized public boundary,
  with history preserved.
- **Retained review decisions versus withdrawn publication authority.** Native `reopen` returns an Integrating work unit
  to Active but keeps its Candidate and stored public boundary, which attestation's `repairCurrent: true` paths can
  carry again, and the same Active-with-public-boundary state also covers an interrupted publish. Decide what an exact
  Owner review decision retains and what deliberate withdrawal ends; trace both paths through their real continuations
  (the reopen transition in `lib/work-unit/lifecycle-transitions.ts`, the attestation callback in
  `handlers/lifecycle-delivery-review.ts`, `PublicationPendingBoundarySchema`); and make recovery and withdrawal
  explicit without discarding accepted decisions or reviving public authority. Coordinate with
  `review-source-authority`.
- **The singleton wedge (key 34).** Records leave the branch at the flip, so a work unit's own writes stop moving its
  head. Before then, a boundary staled by a reason convergence does not satisfy still lands a shipped singleton with no
  Owner-accepted terminus on `resume-pre-publication`, with no continuation: the checkpoint compares
  `candidateSubjectDigest` in `checkpoint-composition.ts`, its `shipped` arm selects `attestNewRootArgv` in
  `checkpoint.ts`, and `refresh-shipped-delivery` is delivery-only. Recovery
  authority binds typed Candidate and lifecycle records, never whether a meta sits under `active/` or `completed/`.
  Never reintroduce an early checkpoint invocation: PR #634 proved it refuses `unsafe-reconcile` before the push and
  `lifecycle-incomplete` before `with-integration` archival. Evidence: PR #629, merged under explicit Owner
  authorization. `delivery-correction-convergence` keeps stacked-delivery convergence (key 35).
- **Errand frontline skip.** The skip marker (`recordSingletonFrontlineInitialSkip`) is keyed by Candidate ID, so an
  Errand's skip leaves no trace, and a head move before any standard-review attempt reopens the phase. Key the marker's
  subject by vehicle lineage — a new record shape, which the cohort's pull-forward filter keeps out of Errands, so it
  rides this member, as its capture said — record it on an Errand's accepted skip, and in the same change rename "phase"
  to "window", the Owner's name for the one-time opportunity before the change request, everywhere at once:
  `frontline-phase.ts` and `frontlinePhaseClosed`; the `frontline-phase` record kind, its operation-id domain, and its
  published schema ID `frontline-phase-state` with the schema-inventory variant (`core/operation-state-schema.ts`,
  `core/schema-inventory.ts`); the `FrontlinePhase*` schema and type names; the `frontline-phase-closed` diagnostic; and
  the driver's `phase-closed` skip reason. Both changes orphan recorded skips, since a marker's ID derives from the
  domain and its subject, so they land together and reopen an in-flight Candidate's frontline once.
- **The stored `verificationKind: "tier-3"`.** `quality-gate-hooks` retires the Tier 1/2/3 names but leaves this value
  in the review gate's stored integration boundary record (`RunConvergenceVerificationActionSchema`) and in `arc
  attest` (`lib/work-unit/verbs/attest.ts`), since renaming a live record's value now would stop records an older build
  wrote from parsing. Rename it when the records reshape, in both places together, to the merge quality gate's name,
  confirmed against `spec-quality-gate-hooks.md`.
- **Open.** How review working state splits between stored facts and machine-local state (D5). For the review gate's
  own namespaces the landed map settles the split by responsibility: evidence, outcomes, and accepted termini become
  project-scope records, while operations, locks, materializations, and quarantine stay under `.git/arc/review-gate/`,
  the mixed publisher (`RepositoryGitCommonStatePublisher`) splitting accordingly; the spec still lists the split as
  left to Part B. What stays open is those records' field schemas, and raw review evidence outside the gate's
  namespaces: archive sweeps the per-work-unit workspace, taking `review-standard-*` chunk reports, aggregate
  results, and evaluator reports with it — lost for good once, when the notes snapshot predated the review. If they are
  evidence, they become stored records; if scratch, `archive-work-unit.md` says so, its teardown-ownership sentence
  excludes the user subdirectory, and `integrate-work-unit.md`'s `arc user close` is named the idempotent backstop it
  is. Also open: whether the archived-singleton continuation ships before the flip — it arises only under
  `archive.cadence: with-integration` — or key 34 closes at the flip; `WORKING-MEMORY`'s checkpoint entry waits on it.
- **Coordination.** `review-protocol-alignment` designs the Owner-accepted terminus's durable form against the
  contract with this member (key 80). `handlers/review.ts`'s split precedes both this member's store swap and the
  planning-lane deletion. Review-lane contracts — pass accumulation across an approved fix, protocol ordering — stay
  with `review-activity-contracts`.

---
