# Draft: Seam Delivery and Review Records

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route delivery and review records — Candidate records with their supersession, retirement, and
  withdrawal, and the review gate's durable evidence, outcomes, and termini — through the storage contract, so a work
  unit's own record writes stop moving its head.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, from a draft
  the readiness check found formalization-ready for the cut (2026-10-09); what stays open is this member's own detail
  design.
- **Next:** draft-design, when it holds a design slot (`cohort-storage-seam.md` § Coordination): re-verify its
  consumer-map rows against the current code and settle its open items.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
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
