# Task List: Integration Boundary Accuracy

- **Design:** `spec-integration-boundary-accuracy.md`

---

## Delivery Plan

_Amended 2026-08-15 — single-PR pivot._ Originally projected as a six-member stack to `main`. The landing
machinery shipped with `delivery-stack-topology`, but its corrective follow-up
`delivery-native-stack-composition` records a dependency on this work unit, so serialized stack landing would
hold that follow-up behind six sequential member landings. The decomposition below is unchanged and retained as
review boundaries; only the merge topology collapses. Superseded by this amendment: the stack-to-`main`
projection, per-member independent landability, the per-member cut-and-land procedure, the `Predecessor` column
(review order is now simply ascending), and the deferral of landing to `delivery-stack-topology`.

Hand-authored. No plan record exists — the identities below are chunk keys, and with a single merge boundary
there are no deliverables for a record to derive from.

_Amended 2026-08-15 — verification remediation._ The verification boundary's adversarial pass found the landed
typed surfaces unreachable from production and three control obligations dropped; Phase 7 remediates them and
Verification moves to Phase 8. Chunk 7 is added as its review boundary. Nothing else in this section changes.

_Amended 2026-08-15 — review-record reduction._ The reopened boundary's second adversarial pass found a further
stratum: completeness gaps rather than reachability gaps. Phase 8 remediates them and Verification moves to Phase
9. Chunk 8 is added as its review boundary. The § G spec amendment it carries **reduces** delivered scope — the
composed review record is cut on external-precedent grounds — so chunk 8's review should read the spec's amendment
blocks first, since three of its tasks are deletions justified there rather than in this plan.

_Amended 2026-08-16 — composition-stratum remediation._ The verification boundary's third entry — a structured
falsification pass, not a third adversarial pass — completed the criteria walk and found a further stratum:
composition-over-time defects, where each verb is locally correct and the failure appears only when the spine's
own ceremony writes feed a later verb's validation. Phase 9 remediates them and Verification moves to Phase 10.
Chunk 9 is added as its review boundary; the projection's chunk counts update accordingly. Findings, dispositions,
and the check-doc constraints that shaped them are recorded in `notes-integration-boundary-accuracy.md`.

_Amended 2026-08-17 — verification re-entry._ The fourth entry's targeted re-validation found two defects inside
Phase 9's own remediations (V4-B1, V4-M1 in `notes-integration-boundary-accuracy.md`), and its adversarial pass a
third in the adjacent convergence gate (V4-M2). They remediate as Tasks 9.10 through 9.12 inside Phase 9, so chunk
9's commit range extends to cover them; the chunk table, the count, and every seam are unchanged.

_Projection:_ one pull request to `main`, reviewed locally in chunks. Each chunk below is one review pass, taken
in ascending order; the verification task (Phase 10) belongs to no chunk. Chunk closure, complete union coverage
across the nine, and the seam review below carry the review obligation the stack's per-member pull requests would
have carried.

| # | Chunk                   | Chunk key                            | Phase | Design elements                |
| - | ----------------------- | ------------------------------------ | ----- | ------------------------------ |
| 1 | Candidate attestation   | `candidate-review-attestation`       | 1     | E1–E4, E6, E9                  |
| 2 | Publication boundary    | `submission-publication-boundary`    | 2     | E3, E5–E9, F1–F4               |
| 3 | Review primitives       | `integration-review-primitives`      | 3     | B4, B8, D1–D3                  |
| 4 | Checkpoint composition  | `integration-checkpoint-composition` | 4     | A, B1, B3–B5, B7               |
| 5 | Settlement and merge    | `integration-settlement-merge`       | 5     | B2–B4, D2, G, H                |
| 6 | Workflow convergence    | `integration-workflow-convergence`   | 6     | A, B4–B8, C1–C7, D1–D3, G–H, I |
| 7 | Production wiring       | `integration-production-wiring`      | 7     | D1, E3–E4, E6, G2, B1–B2, B6   |
| 8 | Review-record reduction | `review-record-reduction`            | 8     | G (amended), B3, E9, D1, B1    |
| 9 | Composition remediation | `composition-stratum-remediation`    | 9     | B1–B3, B5, D1–D3, E1–E5, E9    |

Chunk N covers Phase N exactly, so every chunk resolves to a contiguous commit range and no review pass needs a
hand-assembled diff.

**Named seams** — cross-chunk contracts no single chunk's review covers:

| Seam               | Incident | Owner | Acceptance                                                                  |
| ------------------ | -------- | ----- | --------------------------------------------------------------------------- |
| Candidate gate     | 1, 2, 4  | 4     | Checkpoint rejects unattested lineage heads; submit carries the reservation |
| Namespace handover | 2, 4, 5  | 5     | Bare `arc integrate` errors to `arc submit`; subcommands compose later      |
| Checkpoint handle  | 4, 5     | 5     | Merge executes only the handle's persisted composition                      |
| Primitive reuse    | 3, 5, 6  | 6     | One wait implementation and one PR-resolution logic serve both lanes        |

_Per-chunk procedure_ — stated once, applied to every chunk: review the chunk's commit range against its design
elements, settling each seam at its owning chunk. One exact-head pull request carries all nine; ordinary
repository checks and the ARC merge lock govern the single landing, with no separate delivery proof.

---

## **Phase 1:** Candidate attestation and pre-publication review

_Purpose:_ Land Candidate as a storage-neutral verified lineage with machine-owned private-review progress —
the attestation record, the idempotent `propose` verb, the typed pre-publication review procedure, and the
status/session-init projection. Review chunk `candidate-review-attestation`. Spec elements: E1–E4, E6, E9.

_Design decisions:_ Candidate is a projection over typed evidence — never a fifth `State` value, stored
boolean, or exact-head flag; lineage advances through existing `review-response` records rather than a new
pass ledger or findings store. Full rationale in `spec-integration-boundary-accuracy.md` § E.

### `[x]` **1.1 Define Candidate attestation, currentness, and projection records**

- _Goal:_ Candidate exists as a typed attestation plus verified lineage the CLI validates and advances without
  parsing session narration — surviving operational-only churn, advancing on approved review responses, and
  blocking on unexplained reviewable deltas with no refresh or repair path.

    - `[x]` **1.1.a `CandidateAttestationV1` schema and managed-record projection**
        - Added canonical Candidate attestation, subject-snapshot, managed-record serialization, and the optional
          `Candidate` identity projection on semantic and Markdown work-unit records.

    - `[x]` **1.1.b Lineage currentness composing `review-response` evidence**
        - Candidate currentness now reduces approved exact old/new targets while treating operational-only head
          movement as mechanically current.

    - `[x]` **1.1.c Delta-verification evidence on response records**
        - Response evidence binds `targeted | focused | full`, verification references, disposition identity, and
          applying actors to the Candidate lineage.

    - `[x]` **1.1.d Unexplained-delta blocking**
        - Unexplained reviewable changes return their exact added, removed, and changed paths with the sole recovery
          action of establishing a new root through full verification.

- _Outcome:_ Candidate is a storage-neutral typed lineage: its canonical subject excludes operational projections,
  approved responses advance it without a second fix ledger, and unrecognized reviewable content fails closed.

### `[x]` **1.2 Replace verification finalization with idempotent `propose`**

- _Goal:_ `arc propose` records Candidate at the verification-finalize fire point and re-attests a converged
  lineage head, adding no interlock, commit, or user decision on either form; a repeated same-target call is a
  no-op.

    - `[x]` **1.2.a `arc propose <name> --json` verb, handler, and dispatch**
        - Added the typed CLI path, staged-Git subject adapter, canonical Candidate store, managed meta
          projection, and real-CLI staging proof; `finalize` now accepts planning fire-points only.

    - `[x]` **1.2.b Converged re-attestation form**
        - Recognized implementation-changing response lineages receive one exact-head full attestation;
          same-target repetition is a no-op and unexplained reviewable changes retain the original root and block.

    - `[x]` **1.2.c Call-site and reference updates**
        - The shipped verification workflow and CLI quick reference now invoke `arc propose`, mirrored in the
          self-hosting project copy; Candidate review remains execution work before submission.

- _Outcome:_ Verification now closes on a durable, idempotent Candidate attestation instead of entering
  integration by narrative pointer; root creation and converged re-attestation share one typed verb.

### `[x]` **1.3 Drive pre-publication review and convergence verification**

- _Goal:_ Pre-publication review runs as one typed conditional procedure honoring ordered-source reservation
  across binding times, review fixes receive bounded primary-owned verification, and a converged
  implementation-changing lineage reaches exactly one final Tier 3 plus re-attestation.

    - `[x]` **1.3.a Typed pre-publication procedure**
        - Added one strict projection that sequences active self-review, advisory frontline review, standard review,
          response, convergence verification, and submission loci with one typed next action each.

    - `[x]` **1.3.b Ordered-source reservation across binding times**
        - The policy driver now reserves the first remaining hosted standard source before pull-request binding,
          then resumes that source after binding without leapfrogging to a lower-ranked local carrier.

    - `[x]` **1.3.c Delta-verification applicability procedure**
        - Added exact old/new subject-delta and prior-evidence projection plus primary-selected
          `targeted | focused | full` response recording, rejecting projections inconsistent with their targets.

    - `[x]` **1.3.d Convergence verification path**
        - Settled implementation-changing lineages project exactly one convergence-verification locus and return
          to idempotent `arc propose`; unchanged lineages proceed directly to submission readiness.

    - `[x]` **1.3.e Policy-driver integration**
        - The procedure delegates lane resolution to `arc review resolve`'s policy driver, preserving exact-target
          re-entry, safe fallback, chunk/pass accounting, and the existing exact ceiling-override stop.

- _Outcome:_ Private review is one typed conditional procedure: frontline remains advisory, ordered hosted
  reservations survive publication binding, and fix lineages converge through primary-owned evidence before one
  final full attestation.

### `[x]` **1.4 Project Candidate and review loci into status and session initialization**

- _Goal:_ Agent discovery at this boundary is typed and idempotent — six operational loci, each with one next
  action, with no parsing of review config, Candidate digests, pass counts, or narrative fields.

    - `[x]` **1.4.a Status and session-init locus projection**
        - Added one strict six-locus contract shared by pre-publication reduction, publication resume projection,
          active status, checkout-derived status, and session initialization. Candidate-bearing `Active` metadata
          enters the typed review procedure; `Integrating` metadata projects publication continuation. Deferred
          reservations remain Candidate-bound and are rejected before private review obligations settle.

    - `[x]` **1.4.b Precomposed interaction text**
        - Every locus now carries one validated action kind, command, and non-empty interaction text; the real CLI
          session-init envelope preserves the projection without requiring narrative reconstruction.

    - `[x]` **1.4.c Narrative de-authority**
        - Removed `Next Action` prefix inference from active status and checkout-subject projection: lifecycle
          `State` now owns session scheduling, so an `Active` work unit remains execution even when stale narration
          names integration or archival workflows. Unit, integration, and session-init E2E pins now assert that
          narrative independence.

- _Outcome:_ Candidate/review/publication discovery is one typed six-locus projection carried through status and
  session initialization; lifecycle scheduling and free-form session narration remain separate axes.

## **Phase 2:** Submission and the publication boundary

_Purpose:_ Separate attestation from publication scheduling — rename the lifecycle transition to `submit`,
free the `integrate` namespace, and move the transition to the publication-step head so `Integrating` is true
in every lock mode. Review chunk `submission-publication-boundary`. Spec elements: E3, E5–E9, F1–F4.

_Design decisions:_ The rename precedes the spine verbs (Phases 4–5) so `integrate` is free as a namespace
before `checkpoint` and `merge` mint under it. The fire position lands at the publication-step head, before
the push extension — the one placement costing one commit, one push, no recomposition (placement table in
`spec-integration-boundary-accuracy.md` § F).

### `[x]` **2.1 Rename the lifecycle transition to `submit` and free the `integrate` namespace**

- _Goal:_ The scheduling verb is named for the act it performs, `integrate` survives only as the namespace for
  the later phase procedures, and no inventoried source, doc, or test surface still names the old verb.

    - `[x]` **2.1.a `lifecycle-transitions.ts` — the load-bearing rename**
        - Renamed the typed verb, transition edge, `reopen` inverse, illegal-cell table, and composite declaration
          from `integrate` to `submit`.

    - `[x]` **2.1.b Remaining source surfaces**
        - Renamed dispatch, CLI registration, handler, command-input policy, and the verb module/API to `submit`.

    - `[x]` **2.1.c Bare `arc integrate` error stub**
        - Reserved `arc integrate` as a procedure namespace with an `arc submit` redirect and composed subcommand
          listing.

    - `[x]` **2.1.d Doc surface sweep**
        - Updated the integration/reopen workflows, command references, and the two named backlog drafts; mirrored
          framework files remain aligned across package and project copies.

    - `[x]` **2.1.e Verb-name test updates**
        - Renamed the verb suite and updated dispatch, executor, handler, command-inventory, no-input, and bare
          namespace regression coverage.

- _Outcome:_ `submit` now owns the lifecycle transition end to end while bare `integrate` is reserved for the
  later checkpoint/merge procedure namespace, with no compatibility alias.

### `[x]` **2.2 Enforce Candidate-aware, reservation-preserving submission**

- _Goal:_ `arc submit` schedules publication only over a current Candidate lineage with every configured
  pre-publication obligation settled or typed no-op — carrying the exact hosted-first deferred reservation as
  the sole exception, never reporting it settled.

    - `[x]` **2.2.a Submission eligibility**
        - Submission now requires the managed Candidate identity, a current fully converged lineage, and the typed
          `candidate-submit-ready` locus; every other open locus refuses before reconcile or phase mutation. The
          exact hosted-first reservation remains present rather than being classified as settled or no-op.

    - `[x]` **2.2.b Transition effects**
        - `Active → Integrating` now projects and durably stores the publication resume boundary, carrying any
          reservation unchanged; the boundary file joins the transition's staged meta and ROADMAP effects.

    - `[x]` **2.2.c Idempotent repetition**
        - Repeating `submit` from `Integrating` returns the durable publication or hosted-review locus and its one
          next action without replaying lifecycle mutation.

- _Outcome:_ Submission is now an exact Candidate gate and durable publication handoff: open private obligations
  fail closed, the hosted-first reservation survives the phase transition, and interrupted publication has an
  idempotent machine-readable resume point.

### `[x]` **2.3 Move the transition to the publication-step head and preserve exact resume loci**

- _Goal:_ `Integrating` truthfully means submission is underway from the moment it is set: the transition
  commit rides the same push it schedules, and both interruption shapes project one exact resume action.

- _Note:_ Pin updates ride the member that changes the pinned surface: this member rewrites
  `pr-open-extensions.test.ts`'s work-unit ordering test (its push-before-frontline ordering inverts under
  Task 2.4); the file's errand pins (the enumeration table, the seam-fire ordering) belong to Phase 6.

    - `[x]` **2.3.a Fire position (F1)**
        - `submit` now fires at the head of Step 3 before the push-review extension and push release, so its
          transition commit is part of the one reviewed and published tree.

    - `[x]` **2.3.b Composed next-action value (F2)**
        - Submission input composition moved with the transition and records the publication action to push and
          open the pull request.

    - `[x]` **2.3.c Resume row (F3)**
        - The `integrating` / no-PR row resumes Step 3 at its idempotent push action; session-init and checkout
          recovery preserve the exact durable publication boundary and hosted reservation.

    - `[x]` **2.3.d Fire-point record (F4)**
        - Both shipped and self-hosting State tables now set `Integrating` at publication Step 3 and define it as
          submission/public integration underway.

- _Outcome:_ The transition commit, push review, and push release now form one ordered publication boundary, while
  both interruption shapes resume at the same idempotent push with the Candidate-bound reservation intact.

### `[x]` **2.4 Converge the publication-boundary prose on the propose/submit interval**

- _Goal:_ No workflow step instructs a pre-publication review lane after `submit` fires: the lanes run under
  `Active` in the propose/submit interval, and the post-PR arm resumes the carried reservation instead of
  re-deriving it.

    - `[x]` **2.4.a Relocate Step 3's lane dispatch**
        - The frontline-first and pre-PR standard dispatch now runs in Step 2 under `Active`, reduces to the typed
          `candidate-submit-ready` boundary, and precedes both `submit` and push in both workflow copies. The
          containment test now pins that order and retains the local-lane command surface in the workflow.

    - `[x]` **2.4.b Re-key Step 4's hosted-findings arm to the carried reservation**
        - Post-PR review now reads `integrationBoundary.reservation`, binds the opened target to its Candidate and
          reserved source, and requests that provider directly without rerunning chunking or source ordering.

- _Outcome:_ Private review now lives wholly in the propose/submit interval, while the only standard-review work
  permitted after publication is the exact hosted-first obligation reserved before the pull request existed.

## **Phase 3:** Integration review primitives

_Purpose:_ Land the typed, provider-neutral primitives both publication lanes share — exact-head
change-request disposition, merge-method validation, the extracted bounded-wait primitive, and the
required-checks await. Verbs land before the prose that consumes them; workflow call sites convert in Phase 6.
Review chunk `integration-review-primitives`. Spec elements: B4, B8, D1–D3.

### `[x]` **3.1 Resolve exact-head change-request disposition and next action, host-anchored**

- _Goal:_ One typed disposition answers the pre-create, resume-point, and stub-launch questions for any head —
  correct even from a stale checkout — so no lane hand-parses PR state again.

    - `[x]` **3.1.a Verb and input validation**
        - Added `arc review change-request resolve --head-ref <branch> --head-sha <oid> --json`, with strict
          40-hex input validation and local/live-remote ref comparison from the derived origin repository.

    - `[x]` **3.1.b Six typed dispositions plus `targetRef` and `nextAction`**
        - The resolver returns `none`, `open`, `merged-at-head`, `merged-stale-head`, `closed-unmerged`, or
          `ambiguous` with complete candidates, plus a typed target and next action; lookup failures stop typed.

    - `[x]` **3.1.c Host-anchored resolution**
        - A SHA fallback query resolves merged or renamed heads after both invoking-checkout refs disappear.

- _Outcome:_ One GitHub-backed resolver now answers creation, reuse, completion, reconcile, reopen, and stop
  decisions without treating the invoking checkout's ref freshness as host truth.

### `[x]` **3.2 Resolve the configured merge method against live repository policy**

- _Goal:_ No lane discovers a disallowed merge method by attempting the merge: one resolution logic serves the
  errand pre-arm, the checkpoint, and the merge-time revalidation.

    - `[x]` **3.2.a `arc review merge-method resolve --json`**
        - Added a command that derives the repository and configured method, reads GitHub's live merge-policy
          booleans, and returns either a fingerprinted validation or a typed stop without substitution.

    - `[x]` **3.2.b Fingerprint drift detection**
        - The canonical fingerprint covers repository identity and the ordered allowed-method set, and changes
          whenever that live policy projection changes.

- _Outcome:_ The errand, checkpoint, and merge lanes can share one fail-closed merge-method decision and compare
  its live policy identity across resolutions.

### `[x]` **3.3 Extract the provider-neutral bounded wait primitive**

- _Goal:_ One backoff-and-deadline wait implementation exists in the namespace, shared by the hosted-review
  await and the required-checks await.

    - `[x]` **3.3.a Extract from `awaitHostedReview`**
        - Added `bounded-wait.ts` for deadline enforcement, exponential backoff, bounded abort handling, and a
          generic attempt/deadline result seam; provider-specific schemas remain with their instantiations.

    - `[x]` **3.3.b Re-instantiate the hosted-review await on the primitive**
        - `awaitHostedReview` now maps its existing observations and envelopes through the shared loop without
          changing stale-head, terminal, backoff, abort, or deadline behavior.

- _Outcome:_ Hosted review and required checks now share one provider-neutral timing mechanism while retaining
  independent observation and envelope vocabulary.

### `[x]` **3.4 Instantiate the required-checks await on the exact head**

- _Goal:_ Required-check state on an exact head is observable through one bounded call that yields at its
  deadline instead of requiring an agent polling loop.

    - `[x]` **3.4.a Checks await instantiation**
        - Added `arc review checks await --pull-request <number> --head-sha <oid> --json`, with configurable
          bounded-wait flags, typed `pending` / `green` / `failed` / `not-required` results, and a per-poll
          stale-head guard. Deadline `pending / await` is distinct from `failed / stop`.

- _Outcome:_ Required GitHub checks are now one bounded exact-head observation rather than an agent polling loop,
  and reuse the same deadline and backoff implementation as hosted review.

## **Phase 4:** Integration checkpoint composition

_Purpose:_ Collapse the stopless pre-approval span into a fail-closed checkpoint verb composing only
decision-relevant evidence — typed readiness verdicts folding lifecycle readiness, digest-bound
settlement-plan persistence, and the exception-filtered interlock surface with its typed extension boundary.
Review chunk `integration-checkpoint-composition`. Spec elements: A, B1, B3–B5, B7.

_Design decisions:_ One reader per fact — the checkpoint reads lifecycle completeness from the status
projection directly and the standalone readiness verb shrinks to what its remaining consumers need. The
`pre-merge` seam's shared fire position is workflow prose and lands with lane convergence (Phase 6).

### `[x]` **4.1 Build the typed integration checkpoint and readiness verdicts, folding lifecycle readiness**

- _Goal:_ The entire pre-stop sequence is one typed verdict, and a `ready` envelope carries everything the
  approver decides on — nothing rederived downstream, nothing forensic re-examined.

    - `[x]` **4.1.a `arc integrate checkpoint <name> --json` and its three verdicts**
        - Added the public checkpoint subcommand and strict `ready`, `reconcile`, and reason-discriminated
          `blocked` envelopes; safe behind-base results retain the authoritative drift and host-cross-checked facts.

    - `[x]` **4.1.b `ready` envelope composition**
        - The exact Candidate head now binds a provisional opaque handle, candidate-tail reference, requirement and
          status summaries, the live-policy-validated merge method, and the content-gated review record.

    - `[x]` **4.1.c Lifecycle-readiness fold and the convergence gate**
        - Checkpoint composition reads the canonical lifecycle query directly for the configured cadence and rejects
          any current implementation-changing Candidate lineage whose convergence attestation remains pending.

- _Outcome:_ The pre-approval span now reduces to one machine-owned verdict: safe drift returns its complete
  reconcile evidence, while a clean exact head reaches approval only through lifecycle, Candidate, host, and
  merge-policy facts bound into the ready envelope.

### `[x]` **4.2 Shrink `arc review readiness` contract-preservingly for its remaining consumers**

- _Goal:_ The readiness verb is the thin completeness read its remaining consumers need — the forensic
  checkout posture (symlink, escape, duplicate-artifact) guards no chartered threat and is deleted.

    - `[x]` **4.2.a Remove the forensic posture**
        - Readiness now follows ordinary operator-owned filesystem links, omits containment probes, and selects the
          latest completed archive without treating older copies as hostile ambiguity.

    - `[x]` **4.2.b Consumer contract preservation**
        - The strict request and envelope schemas remain unchanged, as do merge-lock release gating,
          delivery-member authentication, and local-lane handler behavior.

- _Outcome:_ Readiness is now a lifecycle-completeness reader over the attended checkout, retaining every
  consumer-facing identity, cadence, delivery, and failure contract while dropping the unchartered filesystem
  threat model.

### `[x]` **4.3 Persist digest-bound approval composition and settlement plans**

- _Goal:_ The merge verb can execute exactly what approval covered without any agent-carried value: record,
  plan, and method persist verb-side, keyed by a handle that distinguishes two checkpoint runs at the same
  head.

    - `[x]` **4.3.a Canonical settlement plan**
        - Added one canonical cross-channel plan whose actions reuse the hosted-settle and review-respond request
          schemas while binding origin/fix targets, actors, finding/thread identities, dispositions, and replies.

    - `[x]` **4.3.b Digest-bound handle**
        - The handle carries the approved head plus a run-distinct canonical digest over checkpoint identity,
          settlement plan, composed review record, and validated merge method; retrieval recomputes every binding.

    - `[x]` **4.3.c Verb-side persistence and retrieval**
        - Checkpoint composition now creates immutable canonical JSON records under the work unit's dot-prefixed
          user workspace, with a typed handle-keyed reader for the merge verb.

- _Outcome:_ Approval state now crosses the human stop as one immutable, locally persisted composition: repeated
  same-head runs cannot alias, and plan/record/method drift or handle substitution fails closed before downstream
  execution.

### `[x]` **4.4 Compose exception-filtered machine evidence with a typed extension boundary**

- _Goal:_ A clean candidate's interlock surface renders what the approver decides on — collapsing done by a
  unit-testable composer, never by agent discretion — while free-form extension evidence stays visibly
  extension-owned.

    - `[x]` **4.4.a Exception-filtering composer**
        - Added a strict nine-signal composer: clean evidence collapses to one count, while only unclean signals
          expand with their machine-owned evidence in ready-envelope approval text.

    - `[x]` **4.4.b Typed insertion boundary**
        - Every ready envelope now carries a separate `{ label: "Extension report", content: null }` block after
          machine evidence; the composer accepts no free-form extension content.

- _Outcome:_ Checkpoint readiness now delivers the approver's actual decision surface as validated text, retaining
  complete exception evidence without flooding the clean path or claiming authority over extension-owned output.

## **Phase 5:** Settlement and pinned merge

_Purpose:_ Make exactly the approved settlement and record execute before a policy-revalidated, pinned merge —
idempotent settlement execution, lock release and the checks await inside the merge span, re-lock as the
fail-closed exit, and the `Coverage`-free record. Review chunk `integration-settlement-merge`. Spec elements:
B2–B4, D2, G, H.

_Design decisions:_ The merge span composes the shipped `arc merge lock` verbs — release keeps its
bind/gate/settle semantics; what relocates is the sequencing around it and the re-lock obligation, from a
workflow-wide prose invariant into the verb's exit paths. The `Coverage` cut lands here whole: it is a pure
field-scoped deletion, not gated on the Phase 6 rewrite.

### `[x]` **5.1 Execute persisted review settlements idempotently**

- _Goal:_ Only the approved disposition set settles — the persisted plan is the sole source, execution is
  idempotent, and anything missing, stale, ambiguous, or actor-mismatched invalidates before release or merge.

    - `[x]` **5.1.a Idempotent execution through existing settlement APIs**
        - Executes the persisted canonical plan in order through the hosted-settlement and review-response APIs;
          replay accepts already-settled actions, and missing, stale, ambiguous, or actor-mismatched evidence
          invalidates before any later action runs.

### `[x]` **5.2 Release the lock, await required checks, revalidate policy and drift, merge pinned**

- _Goal:_ The post-approval span runs as one fail-closed verb: the pin is a precondition the verb validates —
  a mismatched head returns `invalidated` with no prose instructing anyone to check.

    - `[x]` **5.2.a `arc integrate merge <name> --checkpoint <handle> --json` and its verdicts**
        - Added the registered CLI surface and strict `merged`, typed `invalidated`, `awaiting-checks`, and
          `blocked` envelopes.

    - `[x]` **5.2.b The absorbed span**
        - Executes the persisted plan, validates the exact current head and lifecycle, releases through the existing
          lock verb, awaits exact-head checks, rejects merge-policy movement, posts the persisted record, reads
          authoritative final drift, and invokes the host's head-pinned merge.

### `[x]` **5.3 Re-lock on every approval-voiding exit; leave a deadline yield released**

- _Goal:_ The repository lock cannot misreport approval state — enforcement lives in the verb's exit paths,
  and the workflow-wide prose invariant it replaces can be deleted in Phase 6.

    - `[x]` **5.3.a Re-lock exits**
        - Every approval-voiding exit compensates through the existing hold verb before returning; a failed hold
          becomes `blocked`, while a checks deadline returns `awaiting-checks` with the approved release standing.

### `[x]` **5.4 Post the checkpointed review record without `Coverage`**

- _Goal:_ The posted record is byte-for-byte what the approver previewed, and `Coverage` is gone from the
  pull-request record everywhere it was prescribed — a pure deletion with nothing replacing it.

    - `[x]` **5.4.a Post the persisted record**
        - The merge verb replaces the pull request's top-level Review section with the checkpointed bytes and never
          recomposes the record inside the post-approval span.

    - `[x]` **5.4.b Field-scoped `Coverage` cut at all five inventoried sites**
        - Removed the PR-record field and its authoring guidance from the template, work-unit integration lane,
          and errand lane in both framework copies; `effectiveCoverage` and unrelated coverage contracts remain.

## **Phase 6:** Workflow convergence

_Purpose:_ Reduce both integration workflows to typed procedures plus their real stops — the reconcile-arm
orchestration verbs, the work-unit lane's checkpoint-to-merge spine, the errand lane's convergence on the
shared primitives, the errand tail's terminal-exit semantics, and the prose-pin test rewrite. Review chunk
`integration-workflow-convergence`. Spec elements: A, B4–B8, C1–C7, D1–D3, G–H, I.

_Design decisions:_ Verbs landed before the prose that consumes them; this member converts the prose. The
shared `pre-merge` seam position lands here with both lanes and the extension contract's position statement —
between a `ready` checkpoint and the interlock stop, one enactment per path. Prose invariants that the verbs
now enforce are deleted; the bias-guarding invariants that remain are stated once each.

### `[x]` **6.1 Merge the base only against the checkpointed revision**

- _Goal:_ The reconcile arm's refresh-compare-merge span is one verb call with no narrated git mechanics.

    - `[x]` **6.1.a `arc base merge --expected-base <oid> --json`**
        - Added the typed CLI procedure and production Git adapter: it refreshes and pins the configured base,
          skips contained revisions, merges append-only, and aborts conflicts back to the exact clean pre-merge state.

### `[x]` **6.2 Resolve exact-target review status after head-changing reconciliation**

- _Goal:_ The post-reconcile conjunction — checks, routed obligation, base position — is one typed answer the
  workflow follows, and a stale target reference is rejected rather than silently re-resolved.

    - `[x]` **6.2.a `arc review status --target <target-ref> --json`**
        - Added the exact-target status command over the resolver's `targetRef`; it rejects stale heads and returns
          required checks, routed reservation state, current base identity, and a typed action for every outcome.

### `[x]` **6.3 Converge the work-unit lane: checkpoint-to-merge spine, interlock surface, pin disclosure**

- _Goal:_ The final integration step reads as cadence — checkpoint, one human stop, merge — with its residual
  length a function of its stop inventory, the approval pin enforced rather than narrated, and check state
  reported as observed.

    - `[x]` **6.3.a Pre-stop span**
        - Replaced the pre-approval mechanics with the checkpoint call, verbatim machine evidence, and a separately
          labelled extension report fired once between `ready` and the interlock; updated the extension contract.

    - `[x]` **6.3.b Post-approval span**
        - Replaced the post-approval cascade with the checkpointed merge call, retained the approval-consequence
          disclosure, removed all three conditionality loci, and left required-check waiting to the typed verb.

    - `[x]` **6.3.c Resolver consumption at resume and creation**
        - Routed resume and pre-create validation through the exact-head change-request resolver, including
          `closed-unmerged`, merged-at-head, stale-head, ambiguity, and blocked dispositions.

    - `[x]` **6.3.d Self-validation deletions**
        - Removed workflow-side envelope-shape validation for the owned checkpoint, base-merge, review-status,
          reconcile, and merge procedures.

### `[x]` **6.4 Recast the work-unit reconcile arm as thin orchestration**

- _Goal:_ The arm is orchestration over typed procedures holding exactly its seven stops — the judgment leaf,
  the direction leaf, three interlock releases, and two extension fire points — and nothing deterministic
  between them.

    - `[x]` **6.4.a Rewire the spans**
        - Rewired the reconcile verdict through typed base merge, fresh change-request resolution and review status
          after head-changing pushes, and the existing WU reconcile dispatch with its direction leaf adjacent.

    - `[x]` **6.4.b Preserve every stop**
        - Preserved the review-applicability judgment, retain-advisories direction, one commit and two push
          interlock releases, and both push-extension fire points in their required order.

    - `[x]` **6.4.c State the surviving invariants once**
        - Reduced the bias guards to one statement each for non-carried clearance, non-authoritative advisory
          receipts, and sole integration-interlock merge authority.

### `[x]` **6.5 Converge the errand lane: seam placement, record cut, pin disclosure, lane arms**

- _Goal:_ The errand ship path composes the shared primitives — typed PR resolution, pre-armed merge-method
  validation, one seam fire — while keeping its one-fire lock shape and losing the same narration defects as
  the work-unit lane.

    - `[x]` **6.5.a Typed lane arms**
        - Routed every pre-create disposition through the exact-head change-request resolver, validated the merge
          method before lock release, and left required-check waiting with the host.

    - `[x]` **6.5.b Single seam fire at the shared position**
        - Collapsed Errand settlement to one rendered `pre-merge` extension report between final-head readiness and
          the integration interlock; the extension contract now names both lanes.

    - `[x]` **6.5.c Narration cuts and the one-fire rule**
        - Removed both approval-conditionality restatements, retained the authorization disclosure, stated one
          shared re-lock rule, and constrained the review record to `Local`, `Hosted PR`, and `Triage`.

### `[x]` **6.6 Restore the errand tail's terminal-exit semantics and check-cadence honesty**

- _Goal:_ The ship path completes in-session by default — `leave` is a terminal exit ramp for a session-ending
  tail, never a routine mid-ship transition or a blind re-entry loop.

    - `[x]` **6.6.a Terminal, conditional leave**
        - Restricted `leave` to a session-ending unresolved tail or a machine move; an open PR, pending checks or
          review, and starting another Errand no longer trigger teardown.

    - `[x]` **6.6.b Post-leave replay**
        - Routed post-leave completion through the identity's owning open or materialize driver and removed the
          torn-down checkout as a replay surface.

    - `[x]` **6.6.c Check-cadence honesty on the errand arms**
        - Reports required checks as observed while native auto-merge and reviewed-lane host enforcement own the
          wait; no Errand step assumes an early green state.

### `[x]` **6.7 Replace prose-string pins with typed contract and cross-lane scenario coverage**

- _Goal:_ The tests that pinned the rewritten prose assert the new typed contracts and structural facts — not
  paraphrasable sentences — and the end-to-end scenarios cover both lanes' new shapes.

    - `[x]` **6.7.a Audit the four not-yet-audited pin files**
        - Audited `review-gate-packaging.test.ts`, `archive-staging.test.ts`, `framework-sync.test.ts`, and
          `unit/load-set/projection.test.ts`; their package, fixture, parity, and load-set contracts remain valid.

    - `[x]` **6.7.b Converge the pin files on typed contracts**
        - Recast `review-driver-lifecycle.test.ts`, `pr-open-extensions.test.ts`,
          `review-gate-workflows.test.ts`, and `integration-reconcile-workflow.test.ts` around typed
          dispositions, exact-head command ordering, extension placement, and lock counts.

    - `[x]` **6.7.c End-to-end scenario fixtures**
        - Covered no-review, frontline, local-first, hosted-first, submit interruption, review-fix lineage,
          convergence pending/completion, cap exhaustion, awaiting-checks resume, and unexplained Candidate drift;
          added explicit converged-submit and same-checkpoint resume cases.

## **Phase 7:** Production wiring and obligation restoration

_Purpose:_ Close the verification boundary's findings — reach the landed typed surfaces from production, and
restore the three control obligations the convergence rewrite dropped. Review chunk
`integration-production-wiring`. The findings record, its verified evidence, and why the implementer pass missed
the blocker class are in `notes-integration-boundary-accuracy.md` § Verification Findings.

_Design decisions:_ The blocker class is one defect, not four — Phase 1's modules landed with their contracts and
tests but no production callers — so 7.2 through 7.5 sequence as a single wiring pass. Order is load-bearing:
7.5 ahead of 7.4 would convert today's silent empty composition into a hard `composition-unavailable` block. The
restored disclosure and readiness gate go to the surface each lane already traverses — the interlock composer and
the checkpoint's lifecycle read — rather than to new prose invariants, preserving the determinism relocation this
work unit exists to make.

_Amended 2026-08-15 — lane-progress split._ Scoping the pre-publication wiring established that the procedure's
policy requests need per-attempt lane progress the system computes but does not keep: `awaitHostedReview` already
returns the driver's exact outcome vocabulary, the standard lane persists nothing per attempt, and the records that
do persist collapse `rate-limited` / `transient-unavailable` / `capability-unsupported` / `source-unbound` into one
`unavailable` — losing precisely the distinction `isSafeUnavailable` reads to decide source fall-through. Having
the agent carry those facts instead would reintroduce the defect Goal 6 names (`pass ceilings are CLI-owned`), so
persistence lands first, as its own review increment: 7.1 below. Everything that was 7.1–7.9 shifts to 7.2–7.10;
no task's content changed except 7.2's, which now composes from the persisted progress.

_Amended 2026-08-15 — settlement invalidation typing._ Composing the plan in 7.5 made Criterion 3's
`actor-mismatched` arm reachable on the review-response channel for the first time, and its refusals throw rather
than returning a typed state. Task 7.12 closes it, appended rather than inserted because the load-bearing ordering
binds only 7.2 through 7.5.

No success criterion is added or amended. The existing criteria already require these behaviors; the gap was in
how they were verified, not in what they state.

### `[x]` **7.1 Persist driver-grade lane progress at attempt end**

- _Goal:_ Per-attempt review progress is durable at the fidelity the policy driver reads, so source order and pass
  ceilings are owned by the CLI rather than assembled by an agent.

- _Rationale:_ This is not new state. The outcome vocabulary already exists at attempt time and is discarded;
  what lands here is keeping it. Composing the existing `ReviewOperationStateStore` rather than adding a store
  keeps the change to a record variant plus its write sites.

- _Note:_ Amended 2026-08-15, after 7.1.a, and corrected during 7.1.c. Walking the write sites established that
  each lane's _persisted_ outcome is collapsed — the frontline run state to eight values, the local attest lane to
  the receipt's four — so neither storage distinguishes the four unavailable-class outcomes the driver's
  fall-through decision reads. That is why 7.1.b narrowed to the hosted lane. The first reading generalized this
  to what the frontline lane _computes_, which was wrong: `FrontlineExecutionOutcome` carries a `reason.class`
  beside its `outcome` holding the full distinction, so no schema widening is needed and 7.1.c is the same shape
  of mapping the hosted lane uses. The local lane stays unrecorded pending its own assessment, and the reader
  distinguishes an unrecorded lane from a lane with no attempts rather than returning a bare empty list for both.

    - `[x]` **7.1.a `lane-progress` operation-state variant**
        - Added the variant to `ReviewOperationStateSchema`'s discriminated union carrying lane, repository,
          change request, head, pass count, and ordered attempts, registered alongside its siblings so the
          existing versioned store persists it.
        - Attempt source identity and outcome use the policy driver's vocabulary rather than this module's looser
          identifier, so progress that could not be replayed into a policy request is refused at write. The target
          is spelled in the core boundary's neutral terms (`repositoryId`, nullable `changeRequestId`, `headSha`)
          because the core source is guarded against host vocabulary; mapping to the driver's target belongs to
          the reader in 7.1.d.

    - `[x]` **7.1.b Hosted-lane write site**
        - Added `lane-progress.ts` — a stable per-lane-and-head operation identity, an append that carries the
          attempt and advances the pass count, and the hosted binding that maps each concluded await state onto
          the driver's vocabulary. The hosted-await handler records after the await returns, so the await
          function and every lane's observable behavior are unchanged.
        - Pass accounting follows the driver's own `consumedPass` distinction — a verdict-bearing outcome
          consumes a pass, an unavailable or failed attempt does not — rather than being inferred from the
          outcome at the write site. A deadline yield concludes no attempt and records nothing.

    - `[x]` **7.1.c Frontline lane write site**
        - Mapped the computed `(outcome, reason.class)` pair onto the driver's vocabulary and recorded the
          frontline lane where the run command already holds both the outcome and the store. No schema widening
          was needed: the reason class already carries every unavailable-class distinction the fall-through
          decision reads.
        - The four retryable carrier failures map onto `transient-unavailable` — the lane itself routes exactly
          those to a retry action, and it is the only value in the driver's vocabulary carrying that meaning.
          `invalid-output` maps to `malformed` and `authorization-rejected` to `terminal-failure`, keeping a
          carrier that produced unusable output distinct from one that refused, which is the distinction
          `coderabbit-cli-compatibility` needs preserved.
        - **Additional Context:** `USER-INBOX § Work Unit` — "Make frontline review resilient to CodeRabbit CLI
          auto-updates" (`WU_Target: coderabbit-cli-compatibility`). It records the same collapse from the other
          side: a successful review discarded because the lane flattened a version mismatch into malformed
          output, with the explicit requirement that the diagnostic name expected and observed values rather than
          collapse them. Read it before shaping this vocabulary, and route the work there instead if the two
          prove to be one concern.

    - `[x]` **7.1.d Lane-progress reader**
        - Added `readLaneProgress`, projecting persisted progress into the driver's `completedPasses` and ordered
          `attempts` with the recorded outcomes unchanged. An unrecorded lane returns its own status rather than
          zero attempts, so a caller composing a policy request cannot read "nothing was kept" as "nothing
          happened", and the projection is guarded on lane, repository, and head as well as the record key.
        - **Corrected 7.1.b's repository identity.** The hosted write stored the host's `owner/repo` slug where
          the frontline write stored the repository identity every sibling operation record uses, leaving the two
          lanes keyed in different identifier spaces and unreachable by one reader. The hosted lane now resolves
          the same identity; host coordinates travel on `changeRequestId` and the caller's policy target.

- _Outcome:_ Both publication lanes now keep their attempts at the fidelity the policy driver reads, and one
  reader projects either. The unit's shape changed twice under investigation: the frontline lane needed no schema
  widening once its reason class was read correctly, and the two write sites disagreed on repository identity
  until the reader forced the question. What stays unrecorded is the local attest lane, whose receipt vocabulary
  genuinely cannot express the fall-through distinction — so 7.2 must treat an unrecorded lane as its own fact
  rather than an empty one.

### `[x]` **7.2 Register and wire the pre-publication procedure**

- _Goal:_ The typed pre-publication procedure is reachable from the CLI, so the next action every Candidate-bearing
  locus names is a command that exists, and a standard-review reservation is created on the production path rather
  than only under test.

    - `[x]` **7.2.a `arc review pre-publication` registration and handler**
        - Registered the subcommand under the `review` namespace with the `<name> --json` shape the four emitting
          sites name, and added `handleReviewPrePublication` routing it to `projectPrePublicationReview`. Failures
          emit the review family's error envelope under a new `review-pre-publication` mode.
        - Added `--self-review <state>`: the procedure's `run-self-review` arm needs a fact no repository read
          establishes, and without it an active self-review method would loop the bare command forever. Absent the
          flag, the state derives from the method's effective activity — `inactive` when off, `pending` when on.

    - `[x]` **7.2.b Request composition from repository state**
        - Split composition into `pre-publication-request.ts` (the lane assembly over five injected reads) and
          `pre-publication-composition.ts` (the production binder over Candidate record, git subject, active meta,
          origin coordinates, repository identity, and the durable lane store), following the checkpoint's own
          reducer/binder shape. Progress comes from 7.1's reader, so the command self-composes from a slug.
        - The change set's routing facts are author judgments the CLI does not establish, so the standard-review
          obligation routes as an unknown change set — `required`, reason `unknown-change-set` — with the two facts
          the repository does carry, the work unit's `Class` and effective method activity, supplied exactly.
        - Extracted `resolveConfiguredLanePolicy`; `arc review resolve` now shares that source-order and
          pass-ceiling resolution rather than carrying its own copy.

    - `[x]` **7.2.c Reservation creation on the production path**
        - The registered handler reaches `createStandardReviewReservation` through the procedure: with no open
          change request the target composes `pullRequest: null`, the standard lane resolves to
          `awaiting-change-request`, and the hosted-first source is reserved before pull-request binding.
        - A non-open change request leaves the target unbound rather than binding a closed or merged one, so a
          lower-ranked local carrier cannot take a reserved hosted source's place.

    - `[x]` **7.2.d Command-surface coverage**
        - Extended the command-surface suite with a derived scan: every `arc …` invocation the source emits as a
          corrective action must resolve to a registered command. Verified against the defect — reverting the
          registration fails it at all four emitting sites.
        - Covered the composition (lane assembly, routing, self-review derivation, progress replay, each refusal
          arm) and the handler (envelope, reservation, advisory routing, refusals).

- _Outcome:_ The spine's middle verb exists and self-composes. Two facts forced decisions the subtask text did not
  anticipate: self-review state is not derivable from the repository, so it became an explicit option rather than a
  silently-stuck arm; and durable progress and the live target are read independently, so they can disagree — a
  hosted attempt recorded at a head whose change request has since closed now refuses with the conflict named
  rather than throwing. An unrecorded lane composes as no attempts and says so on stderr, because the local attest
  lane persists nothing and the two cases are indistinguishable from storage alone.

### `[x]` **7.3 Close the submission-boundary write path**

- _Goal:_ `arc submit` succeeds on its first call over a ready Candidate — the durable boundary is written where
  the pre-publication locus settles, not by the consumer that refuses without it.

    - `[x]` **7.3.a Write the boundary at the pre-publication settle point**
        - `arc review pre-publication` writes and stages the durable boundary when its locus reduces to
          `candidate-submit-ready`, before the result is claimed. The envelope already satisfies the boundary
          schema, so the file's canonical shape and staged-effect behavior are unchanged.
        - **Not a move.** `handleSubmit`'s post-transition write records `publication-pending`, which is what its
          idempotent repeat arm reads — removing it would break the arm 7.3.b preserves. The two writes record
          different loci: this one settles pre-publication, that one advances past it.

    - `[x]` **7.3.b Submit over a first-call boundary**
        - `handleSubmit` needed no change — it already read the boundary, kept the repeat arm, and refused when
          absent. What it needed was a boundary to read, and one correction so that reading it does not block the
          Candidate it settles.
        - **Correction.** Staging the boundary put it in the reviewable subject, so `projectCandidateCurrentness`
          returned `blocked` and submission refused on the very path the settle-point write opens. The boundary is
          the Candidate's own projection, like the record beside it, so `collectGitCandidateTarget` now classifies
          both as `candidate-projection` — resolving each through its store's own path resolver rather than the
          inlined literal the record previously duplicated.

    - `[x]` **7.3.c End-to-end reachability proof**
        - Added `publication-spine.e2e.test.ts`: `propose → pre-publication → submit` against the built CLI, with
          the boundary written and staged at the settle point, submission succeeding on its first call, and a
          repeat reporting the publication resume point. A second case covers the open-obligation arm — an active
          self-review method stops the procedure before it settles, no boundary is written, and submission refuses.
        - Origin coordinates resolve to `owner/repo` at a reserved `.invalid` host, so the change-request probe
          fails at name resolution and the spine proof stays offline and deterministic.

- _Outcome:_ The spine's first call runs end to end. The write was an addition rather than the planned move —
  `handleSubmit`'s tail write records a different locus, and the repeat arm reads it — and moving the write
  forward of submission's currentness check exposed the subject-classification gap that the boundary, unlike the
  record, had never hit.

### `[x]` **7.4 Advance Candidate lineage in production**

- _Goal:_ An approved review response and its delta-verification evidence append to the managed Candidate record,
  so lineage currentness, the `implementationChanged` reduction, and B1's convergence guard all reach live paths.

    - `[x]` **7.4.a Response append on the production path**
        - `arc review respond` gained a settlement pass: the same approved dispositions and durable source,
          resubmitted with the `verifiedFix` block the primary owns (applicability plus verification evidence). It
          hosts the append because it is the only surface that validates the disposition digest and both actor
          identities against durable records — supplying them anywhere else would restore agent-owned authority.
        - The pass reaches `ready-to-persist` through the response planner, whose production caller had pinned
          `persist: false` with a null candidate target — the same landed-but-unwired shape as the checkpoint's
          hardcoded record. The changed target it needs is the stale reading the approval pass treats as a dead
          end, so a landed fix is what distinguishes the two passes rather than a separate verb.
        - Lineage targets stay CLI-derived: `projectCandidateDeltaVerification` reduces the recognized head and the
          indexed subject, and an already-explained subject appends nothing, so a repeated pass is a no-op rather
          than a second empty response. The appended record stages like `propose`'s.

    - `[x]` **7.4.b Convergence-guard reachability**
        - Added `candidate-lineage.e2e.test.ts`: `propose → local review → respond → propose` through the public
          verbs, with the checkpoint run over the production Candidate reader. Only the host- and artifact-dependent
          reads ahead of the guard are stubbed, so the branch under test is decided by the record the commands wrote.
        - The advanced lineage blocks on `candidate-convergence-pending` and clears through the convergence
          `arc propose`; a second case pins the repeat pass.

- _Outcome:_ The lineage advances from an approved fix rather than only from `propose`'s empty literal, which
  turns the checkpoint's vacuously-true convergence guard into one a live record can fail. Scoping surfaced a
  decision the task text left open — which registered handler hosts the append — and the disposition binding
  settled it: only respond holds a digest and actors it can validate.

### `[x]` **7.5 Compose the checkpoint's review record and settlement plan**

- _Goal:_ The checkpoint persists the review record and canonical settlement plan the approver decides on, and the
  merge verb posts and executes exactly that composition.

    - `[x]` **7.5.a Review-record composition**
        - Added `review-record.ts`: the pull request's `## Review` section composed from the approved disposition
          records the Candidate's responses name — `Local` and `Hosted PR` from each record's source kind, `Triage`
          from the approvers and the final disposition of every distinct material finding.
        - Reaching those records by disposition-set identity needed an enumeration over the repository's
          approved-disposition storage, since the lineage records which set a response settled and not the operation
          that produced it. A lineage entry the repository cannot produce refuses rather than composing partially.

    - `[x]` **7.5.b Settlement-plan composition**
        - The same records compose one `review-response` action each in `lineage-review-composition.ts`, binding the
          originating target read back from the lane that owns the operation and, where the set authorized a fix, the
          head those fixes settled at.
        - Settlement carries that head to its executor. An approved set replayed after its fix landed pins the settled
          head rather than the originating review target, which the fix itself leaves stale.

    - `[x]` **7.5.c Review-bearing checkpoint and merge coverage**
        - Extended the lineage end-to-end coverage: a review-bearing work unit composes its record and plan from the
          records the public verbs wrote, the persisted plan executes twice to the same result through the production
          settlement path, the composed record reaches the posting boundary, and final drift and a substituted handle
          both invalidate.

- _Outcome:_ Composing the plan surfaced that the review-response channel had no executable replay: the response
  planner returns the fix state its approval pass already consumed, and the originating target is stale by
  settlement time, so every review-bearing merge would have invalidated. Settling that axis — the replay pins the
  settled fix target, as the hosted channel already did — is what makes the composed plan executable rather than
  merely well-formed.

### `[x]` **7.6 Restore the review-applicability disclosure at the work-unit interlock**

- _Goal:_ The facts § G2 priced the `Coverage` deletion against — every review applicability call, targeted
  verification, and the candidate-tail diff — are surfaced at the stop on both lanes, not just the errand one.

- _Outcome:_ The `integration-interlock` callout now surfaces the composed candidate-tail diff — Release Notes
  entry and Completion Notes — with swept and regenerated artifacts named rather than diffed, beside the ready
  evidence and the applicability calls retained from Step 4. Narrowed from `main`'s "complete candidate-tail diff"
  by decision here: mechanical ROADMAP regen carries no review signal at the stop, and the Goal's three facts stay
  surfaced. The nine-signal composer is untouched, so Criterion 2's pinned count holds.

### `[x]` **7.7 Restore the lifecycle-artifact readiness gate on a lock-independent path**

- _Goal:_ Completion Notes and any applicable Release Notes are verified before merge in every lock mode, closing
  the `merge.lock: none` hole where nothing checks them.

- _Outcome:_ `readLifecycleSummary` reads the work unit's meta at its index-resolved path and folds
  `lifecycleArtifactFacts` — a shared export both `readiness.ts` lanes now call — into the lifecycle summary, whose
  schema refuses to report `complete` while facts remain. The checkpoint reads no lock mode and `merge` refuses
  without a persisted handle, so the gate is unavoidable under either mode. Covered on both archive cadences,
  including the archived `with-integration` meta.

### `[x]` **7.8 Restore the errand lane's pre-create head re-validation**

- _Goal:_ No pull request is created against a head that changed after validation, in either lane.

- _Outcome:_ The remote-head comparison against `proposedChangeRequest.headSha` is reinstated in both copies of
  `run-errand.md`, in its original position between the `pre-pr-open` actions and the lock-resolve call that
  precedes creation; the work-unit lane keeps the resolver-time check the design authorizes. A step-wide
  `not.toContain("git ls-remote --heads origin")` in `pr-open-extensions.test.ts` had pinned the deletion —
  over-broad for a rule about hand-rolled PR-state resolution, and the reason an authorized control obligation
  could be dropped without failing anything. That ban is now scoped to the dispatch region, with a positive test
  pinning the guard's presence and its position between the hook and creation.

### `[x]` **7.9 Name a corrective command on every spine refusal**

- _Goal:_ Every checkpoint, merge, and submit refusal names the failed invariant and one corrective command, per
  Criterion 15's closing clause.

- _Outcome:_ Refusals across `checkpoint`, `merge`, and `submit` carry a `remedy` beside the typed reason — the
  failed invariant, a render-verbatim sentence, and the corrective command as argv — with `nextAction` unchanged.
  Both reason sets and their exhaustive tests derive from the refusal schemas rather than a hand-listed table, so
  a new reason without a remedy fails to compile. Criterion 15's "one corrective command" is read as the specific
  verb where one exists (`arc propose` for the Candidate arms, `arc wu reconcile` for submit's reconcile stops)
  and as the idempotent resume point where the operator satisfies the invariant by hand — composing Completion
  Notes, explaining a lineage delta — rather than naming a verb that cannot author the missing work.

### `[x]` **7.10 Correct the `arc integrate` command reference**

- _Goal:_ `QUICK-REFERENCE` describes the namespace as it shipped.

    - Replaced the bare `arc integrate` entry with the two registered subcommands and their signatures —
      `arc integrate checkpoint <name> [--json]` and `arc integrate merge <name> --checkpoint <handle> [--json]` —
      in `.arc/reference/QUICK-REFERENCE.md` and its `QUICK-REFERENCE.template.md` counterpart.

### `[x]` **7.11 Converge the workflow onto the registered pre-publication procedure**

- _Goal:_ One path resolves the pre-publication lanes. The command every Candidate locus emits and the procedure
  `integrate-work-unit.md` instructs are the same procedure, not two routes to the same lane resolution.

- _Outcome:_ The routing axis settled toward the command accepting what the workflow already composed, so the
  reducer's documentation, atomic-determinacy, ownership, and authority arms stay reachable from this path
  instead of every work unit routing `required`. The settling principle — the caller asserts facts the
  repository cannot read, the CLI reduces them — then decided two per-lane inputs the task line had not named:
  converging § 2 wholesale would have dropped chunked scope selection and the ceiling-override return path,
  since neither was carried. Both now compose through `--lanes`, with the target and lane supplied from the
  resolved composition rather than restated, which makes the driver's target- and lane-mismatch refusals
  unreachable from this path. Change-set facts normalize on rejection and lane judgment refuses, deliberately:
  a dropped scope reviews the whole target and a dropped override re-blocks an approved pass, while a rejected
  routing fact already falls to the conservative route. § 2 now names one command and keeps the driver's
  `state` / `nextAction` table intact.

### `[x]` **7.12 Return typed settlement invalidations from the review-response channel**

- _Goal:_ An actor-mismatched or record-missing review-response settlement invalidates under its own typed reason,
  as the hosted channel already does, rather than surfacing as an untyped operation failure.

    - Added `actor-mismatch` and `missing-record` variants to `RespondEnvelopeSchema`, both resuming at
      `respond-again`, and returned them from the settlement-replay arm of `respondToReviewCommand`.
    - `settlement-execution.ts` now classifies the review-response channel through
      `reviewResponseInvalidation`, mirroring `hostedInvalidation` — both channels name their own refusals, so
      no error message is read back at the merge boundary.

- _Outcome:_ Typed state is scoped to the replay arm alone: the attended response path still throws, because an
  interactive caller reads the exception while the replay runs unattended behind the merge verb, where a thrown
  refusal is legible only as `operation-failed`. Actor validation split into a pure `actorMismatch` classifier
  that both arms share, so the two paths cannot drift on what counts as a mismatch. The conflicting-record case
  stays a `corrupt-state` throw and lands as `ambiguous` — it is corruption rather than one of the two reasons
  Criterion 3 names — and an unrecognized state still maps to `ambiguous` rather than settled.

## **Phase 8:** Review-record reduction and verification remediation

_Purpose:_ Close the reopened verification boundary's findings. Chunk `review-record-reduction`. The findings
record, the precedent review that decided the § G reduction, and the four design decisions with their rejected
alternatives are in `notes-integration-boundary-accuracy.md` § Verification Findings — pass two.

_Design decisions:_ 8.1 is load-bearing and lands first — removing the composed review record is what shrinks 8.2
to its settlement-plan half and dissolves the lane-labelling defect entirely. The remaining tasks are independent
of each other.

_Amended 2026-08-15 — spec amendment._ § G now cuts `Hosted PR` and `Triage` and retains an attestation-shaped
local-review marker; B3 governs the settlement plan alone; Criterion 3 is amended forward. This is a deliberate
scope **reduction** decided on external precedent grounds, not a criterion trimmed to fit what shipped — the
distinction and its reasoning are recorded in the spec's own amendment blocks.

### `[x]` **8.1 Reduce the review record to an attested local-review marker**

- _Goal:_ The pull-request record reports only what a reader cannot otherwise obtain — that gated review ran
  locally before publication — and nothing composes, digests, or posts a review record.

    - `[x]` **8.1.a Template and field grammar**
        - Cut `## Review` from `template-pull-request.md`'s main fence and its `## Optional Sections` entry; added
          `**Local review:** {carrier identity}` beneath `**Design:**`. § Section Guidance now carries a
          `Local review` field entry in place of the `Review` section entry, and the Delivery-Member Variant line
          lists the field rather than the section among the surfaces retaining ordinary content gates. The
          `Success-criteria status` anti-pattern, which pointed at "the normalized review record above", now points
          at the field. Both template copies edited in step.

    - `[x]` **8.1.b Workflow prose, both lanes**
        - Removed the record preview from `run-errand.md`'s settle step, the record from its integration-interlock
          disclosure, and the stale-summary replacement from its post-approval step. `integrate-work-unit.md`'s
          canonical-shape parenthetical now reads `Design` and lists the optional `Local review` field, with a
          sentence on what the field carries. The two workflow pins that asserted the composed record were
          converted: `review-gate-workflows.test.ts` now pins its absence, and `review-driver-lifecycle.test.ts`
          pins the template's attestation field in place of the `## Review` section.

    - `[x]` **8.1.c Composition and posting removal**
        - Deleted `review-record.ts` and its unit test; `lineage-review-composition.ts` now returns only the
          settlement half. The checkpoint's `reviewRecord` slot is gone from `CheckpointReadyCompositionSchema`,
          the persisted composition record, and its digest, taking with it the two disposition-alignment
          cross-checks that compared the plan against lineage-derived ids. The merge verb lost
          `postReviewRecord`, `review-record-failed`, and the body-splicing `replaceReviewSection`. The machine
          signal is now `settlement` / `Settlement`, derived from the persisted plan's disposition count.

- _Outcome:_ The composed record is gone end to end — template, both lane workflows, composition, persistence,
  and posting — and the surviving `**Local review:**` field is authored at PR-body composition rather than
  composed at the checkpoint, so nothing downstream of approval writes to the pull request. Removing the record
  also removed the checkpoint's only independent cross-check on the settlement plan's disposition set; the plan is
  now self-describing, which is the axis Task 8.2 re-derives it on.

### `[x]` **8.2 Compose the settlement plan from approved-disposition records**

- _Goal:_ Every approved disposition set the Candidate covers reaches the settlement plan, including sets that
  authorized no fix, so the merge verb's compare-and-confirm sees them.

    - `[x]` **8.2.a Enumerate-then-scope**
        - `lineage-review-composition.ts` enumerates `listDispositionRecords()` and scopes to the full Candidate
          span, read as one `rev-list attestation.baseRevision..approvedHead`. Records the lineage names still
          resolve strictly; the store is repository-common, so a record whose originating operation is unreadable
          cannot be placed in any span and is left out rather than refusing this work unit's checkpoint.
        - Composition order is span position, tiebroken by `dispositionSetId`. Two e2e tests carry it: a defer-only
          approval reaching the plan while the lineage provably never names it, and a review that ran before a fix
          landed surviving a span a candidate-tail lower bound would have excluded.

### `[x]` **8.3 Restore the proposed-disposition disclosure at the work-unit interlock**

- _Goal:_ The approver sees every disposition their approval decides, including sets reaching the interlock
  unapproved for the final combined gate.

    - `[x]` **8.3.a Callout restoration**
        - The `integration-interlock` callout now surfaces the proposed final dispositions beside the review
          applicability calls and targeted verification Task 7.6 restored, naming them as the no-action
          record-only sets the checkpoint payload does not carry — so the approver has to gather them rather
          than read them off the ready evidence. Approval decides those proposals and settles the
          review-response channel alone, since hosted settlement already ran at Step 4. Both copies edited in
          step; `review-gate-workflows.test.ts`'s consequence-ordering pin follows the scoped clause.

### `[x]` **8.4 Convert the remaining PR-state branch site to the typed resolver**

- _Goal:_ All five inventoried sites resolve through one typed disposition; the delivered count is 4/5.

    - `[x]` **8.4.a Review-entry resolve**
        - `integrate-work-unit.md` § 4 binds the open PR from the resolver's returned `candidate` — carried by
          the reuse and reopen arms Steps 1 and 3 dispatch on — or from the request Step 3 just opened, and
          composes `openedChangeRequest` from it. The untyped "resolve the one open PR" step is gone, so no
          entry path into review iteration hand-rolls PR-state resolution.

### `[x]` **8.5 Derive the publication locus and compute the hosted-reservation requirement**

- _Goal:_ No surface asserts a review fact it did not read, and every enumerated locus is reachable.

    - `[x]` **8.5.a Derive the locus**
        - `projectPublicationBoundary` takes the reservation and change-request evidence in place of a
          caller-supplied `state`, and derives `hosted-review-pending` from their conjunction — a reserved review
          needs a change request to run against, so a reservation still awaiting one continues publication. The
          three production callers pass what they hold: `submit.ts` names the absent change request at the
          publication-step head, and the two boundary readers pass the fallback they already had.

    - `[x]` **8.5.b Compute the reservation requirement**
        - New `hosted-reservation-discharge.ts` decides discharge from `lane-progress`: a verdict-bearing attempt
          (`clean` or `findings`) by the reserved `sourceId` on the standard lane anywhere in the Candidate span,
          read as `rev-list attestation.baseRevision..approvedHead`. Reading the span rather than the approved head
          keeps a review that ran before a later fix from being discarded.
        - `checkpoint-composition.ts` composes the `hosted-review-reservation` requirement from that discharge
          against the locus it derives from the change request it already resolved — the production site where the
          hosted arm becomes reachable — and the stored locus is no longer read as authority.
        - `checkpoint.ts` refuses a pending hosted requirement as the typed `hosted-reservation-pending` ahead of
          the bind check, so activating the computation lands the named reason rather than the generic composition
          failure.
        - `status-composition.ts` settles the routed obligation on the same discharge evidence in place of
          `boundary.reservation !== null`, which no writer clears.

    - `[x]` **8.5.c Render the Requirements signal**
        - The `Requirements` machine signal takes its `clean` and evidence from `requirementSummary`, so a
          requirement the composer leaves outstanding under a satisfied conclusion reaches the approver as a
          machine-evidence exception instead of being overwritten by a clean literal.

- _Outcome:_ The three surfaces that reported the hosted-review obligation now read it: the locus from
  reservation-plus-change-request, the checkpoint requirement and review status from the lane's own verdict.
  Activating the computation also activated the checkpoint's dormant conclusion check, which is why the typed
  refusal is part of this increment rather than 8.6's. `status-composition.ts` is one of three composition modules
  no test reaches, so its obligation mapping currently rides on the discharge projection's unit coverage.

### `[x]` **8.6 Name a corrective command on pre-publication refusals**

- _Goal:_ Criterion 15's closing clause is unqualified; the spine's middle verb refuses without a remedy.

    - `[x]` **8.6.a Extend `spineRemedy`**
        - `review-command-envelope.ts` now carries the remedy map for the pre-publication verb, keyed by the
          refusal codes the error envelope itself declares, and the mode's error variants require a
          `SpineRemedy` where every other review-family mode's are unchanged. The corrective command is the
          idempotent `arc review pre-publication <slug> --json` re-attempt; a refusal of the work-unit operand
          itself has no exact re-attempt, so it names `arc status --project --json` instead.

### `[x]` **8.7 Pin the restored interlock disclosure and render the tail-diff reference**

- _Goal:_ The premise Criterion 12's "nothing replaces it" rests on cannot regress silently again.

    - `[x]` **8.7.a Positive pins**
        - `review-gate-workflows.test.ts` now pins the merge stop's disclosure positively in both copies — the
          candidate-tail diff over the Release Notes entry and Completion Notes, swept artifacts named rather
          than diffed, the retained applicability calls and targeted verification, and the proposed final
          dispositions with their no-action record-only sets — beside the negative pin that already guarded the
          region.
        - `composeCheckpointInterlockSurface` takes the candidate-tail reference and renders it beneath the
          decision line on both the clean and exception paths, so the head the approver would diff reaches them
          through the text the workflow already renders verbatim.

### `[x]` **8.8 Pin the routed-obligation derivation**

- _Goal:_ The obligation state `arc review status` reports is proved against a repository that recorded the
  evidence, not inferred from the projection it delegates to.

    - `[x]` **8.8.a Discharge-state coverage at the e2e tier**
        - Three cases in `candidate-lineage.e2e.test.ts` drive the derivation over the settled-lineage fixture:
          a reserved source whose recorded standard-lane verdict settles it, the same reservation with no
          recorded attempt leaving review required, and an absent publication boundary reporting blocked. The
          reservation, boundary, and lane attempt are written through their production writers, so the read
          under test consumes the records production would have left.

- _Outcome:_ Reaching the derivation cost one export — `readRoutedObligation` — rather than the
  dependency-injection change the module would otherwise need, which stays out of scope and captured. The three
  host-dependent reads around it in `status-composition.ts` are still unreached; this covers the routed-obligation
  path alone.

## **Phase 9:** Composition-stratum remediation

_Purpose:_ Close the third verification entry's findings — the composition-over-time stratum, where each verb is
locally correct and the failure appears only when the spine's own ceremony writes feed a later verb's validation.
Chunk `composition-stratum-remediation`. The findings, their verified evidence chains, and the adjudications are
in `notes-integration-boundary-accuracy.md` § Verification Findings — third-entry falsification pass.

_Design decisions:_ Three check-doc constraints shaped the dispositions. Classification is by class, not path:
system-regenerated projections are operational state per the tracked-vs-materialized line, resolved through the
layout. Stale state is caught by read-time validation, never a discharge write — the write-someone-must-remember
shape is the recorded F6 failure mode. Remedies are precomposed CLI-side, and typed surfaces are fixed rather
than prose bypass blessed. Tasks are independent of each other except that 9.8 consumes 9.3's boundary-validation
shape.

_Note:_ Scope guard for every task in this phase: the recorded finding's verified evidence chain is the task's
scope boundary. Several findings are edge-case-flavored; that is not an invitation to harden adjacent surfaces —
hardening beyond what a finding's evidence demonstrates is a scope expansion to propose, never to build.

### `[x]` **9.1 Pin the settled head on every settlement replay**

- _Goal:_ A defer- or reject-only approved disposition set replays to `already-settled` at merge time; no validly
  approved settlement invalidates the merge.

- _Outcome:_ Every composed review-response settlement now pins the checkpoint-approved head, including no-fix
  sets. A real-CLI moved-head replay reaches the durable already-settled path and completes the plan.

### `[x]` **9.2 Classify system-regenerated projections as operational**

- _Goal:_ The spine's own ceremony writes never read as an unexplained reviewable delta; `submit`'s ROADMAP
  render blocks neither checkpoint nor re-attestation.

- _Outcome:_ Candidate collection now classifies the layout-resolved regenerated project document as operational.
  A real transition-style ROADMAP commit remains current while a subsequent reviewable delta still blocks.

### `[x]` **9.3 Bind submission authorization to the lineage head**

- _Goal:_ `arc submit` refuses a boundary written for an earlier lineage head, so E3's changed-target re-entry
  cannot be skipped.

- _Outcome:_ Durable review boundaries now carry the recognized Candidate revision. Submission rejects an older
  revision before reconcile or lifecycle mutation and routes directly back to `arc review pre-publication`.

### `[x]` **9.4 Close the merge verb's re-lock and merged-state gaps**

- _Goal:_ Every approval-voiding exit re-locks, `checkpoint-missing` included, and a landed merge is never
  reported `relock-failed`.

- _Outcome:_ A missing checkpoint now uses the common re-lock path. Catch recovery re-reads exact pull-request
  state first, reporting a merge that landed instead of attempting to hold its lock.

### `[x]` **9.5 Emit schema-valid typed refusals from the integration handlers**

- _Goal:_ Every refusal `integrate checkpoint` and `integrate merge` emit validates against the published result
  schemas and names a corrective command.

- _Outcome:_ Both handlers now compose invalid-input and dependency-failure refusals through their published
  schemas, including corrective command remedies; malformed checkpoint-store reads no longer escape as crashes.

### `[x]` **9.6 Precompose the moved-head resolution remedy**

- _Goal:_ An interrupted fix-loop resume — committed, unpushed, PR open at the prior head — projects
  push-and-re-resolve rather than a bare stop.

- _Outcome:_ The open-request/prior-head ambiguity now carries a push-and-re-resolve remedy, and the resume table
  follows emitted remedy text. Multi-candidate and other ambiguous states remain bare stops.

### `[x]` **9.7 Name where review landed on the composed decision line**

- _Goal:_ A clean candidate's interlock surface renders all three of Criterion 2's decision facts.

- _Outcome:_ The checkpoint decision now names either the local attestation carrier or the discharged hosted
  source. Discharge detail is reduced to that provenance alone, so the line carries no review-record summary.

### `[x]` **9.8 Keep the typed publication pointer truthful**

- _Goal:_ No post-submission surface emits a resume command for a transition that already fired, and the
  next-action vocabulary carries no dead members.

- _Outcome:_ Stored and unchanged submission boundaries now resume at the workflow's idempotent branch push.
  Passive status/session projections remain store-only; review continuation uses one live pre-publication action,
  and the four superseded lane/hosted action kinds are no longer schema members.

### `[x]` **9.9 Close the minor-findings batch**

- _Goal:_ Every recorded minor closes or carries a deliberate residue note in the findings record.

_Outcome:_ Typed refusals and blocked results now carry JSON-safe remedies, convergence-pending boundaries persist,
and integration prose/tests pin the executable wait and interlock contracts. Same-session handoff finalization also
uses exact-head typed PR resolution; only the hosted settlement composer's authority decision remains deliberate
residue, as recorded in `notes-integration-boundary-accuracy.md`.

### `[x]` **9.10 Let a no-fix settlement pin the head it settled at**

- _Goal:_ A defer- or reject-only set composes and settles when nothing moved the head after its review; the
  changed-target requirement applies only where a fix moved one.

    - The changed-target requirement now fires only for fix-bearing sets; the repository-match half stays
      unconditional and split out, so each clause carries its own message.
    - Real-CLI settlement of a defer-only set at an unchanged head, plus unit cases pinning both directions of the
      split clause.

- _Outcome:_ A fix moves the head by definition and a no-fix set does not, so settling at the origin target is the
  no-fix case's normal shape rather than the incoherence the single clause read it as.

### `[x]` **9.11 Bind the submission boundary to the reviewed change set**

- _Goal:_ Operational-only churn between pre-publication and `arc submit` never invalidates a boundary whose
  review evidence is current, while a boundary written for different reviewable content still refuses.

    - `candidateSubjectDigest` replaces `candidateRevision` on the boundary, the publication projection, and the
      pre-publication envelope, sourced from the currentness read each side already performs.
    - `authorizeSubmission` authorizes against it, keeping the pre-publication remedy; real-CLI coverage submits
      after an operational-only commit advances the head, and unit coverage refuses changed reviewable content.

- _Outcome:_ Submission binds what review covered rather than where the head stands, which is what makes the
  binding survive the spine's own ceremony writes — the same read-time-validation shape the phase's other
  remediations settled on. Changed reviewable content is caught twice over: the candidate gate refuses an
  unexplained delta before this check, and an explained one (a fix the lineage advanced past) refuses here.

### `[x]` **9.12 Key Candidate convergence to the verified content**

- _Goal:_ A re-attestation the primary actually ran satisfies convergence, so no operational-only commit before
  `arc propose` leaves submission and checkpoint permanently refusing.

    - Convergence matches a lineage attestation by reviewable-subject digest; the revision it was written at stays
      recorded as provenance rather than serving as the match key.
    - Real-CLI coverage: an operational-only commit between the verified-fix response and `arc propose`, after
      which the checkpoint no longer reports `candidate-convergence-pending`.

- _Outcome:_ Closes finding V4-M2. The convergence gate and `arc propose` had disagreed about which revision
  identified the same verification — propose writes the recognized head, the gate read the response revision — so
  the two could never meet once the head advanced. Content-keying settles it for every later advance too, rather
  than moving the mismatch one commit further out.

## **Phase 10:** Verification

_Amended 2026-08-16._ Verification moved here from Phase 9. The boundary has been entered three times; the third
entry's structured falsification pass completed the criteria walk, and its findings are recorded in
`notes-integration-boundary-accuracy.md` § Verification Findings — third-entry falsification pass. Both
adversarial passes remain spent against the `Heavy` cap. On re-entry after Phase 9: re-run Tier 3 over the
remediated tree, re-validate the criteria the findings touched (2, 3, 5, 6, 7, 9, 11, 15) by confirming each
remediation against its recorded finding, and mark the Success Criteria — the full falsification walk need not
repeat for criteria the record already closes clean.

_Amended 2026-08-17._ That re-entry ran: Tier 3 green at `6668cf53c`, and the eight-criterion walk plus the four
seams confirmed all but Criteria 3 and 6, whose remediations carried the two defects recorded as V4-B1 and V4-M1.
A scoped adversarial pass over those two criteria and the remediation commits then found V4-M2 in the adjacent
convergence gate. Tasks 9.10 through 9.12 close all three. On this re-entry the criteria walk narrows to 3, 6, and
15 and to whatever the three fixes reach; Tier 3 re-runs because review-driven fixes landed.

### `[x]` **10.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Markdown lint over 664 files, the three `lint:arc:*` contract checks, both lint passes, both
  type checks, 9992 tests passing (1 skipped across 792 files), and a clean build — run whole over the remediated
  tree, and re-run after each review-driven fix rather than carried forward.
- _Success criteria:_ 19 criteria, all met; three carry deviation notes where a spec amendment governs the judgment
  (Criteria 3, 7, 15). The fourth entry re-validated the eight criteria the third entry's findings touched, walked
  Criteria 1, 6, and 17 that no prior entry had closed, and confirmed all four named seams. Its three findings
  (V4-B1, V4-M1, V4-M2 — recorded in `notes-integration-boundary-accuracy.md`) remediated as Tasks 9.10 through
  9.12; Criterion 15 was held open until the last of them landed. Hosted lane behavior is implemented and typed but
  proven against typed ports rather than a live host, with the first hosted run recorded as the forcing event.

---

## **Phase 11:** Design-audit remediation

_Purpose:_ Close the confirmed findings of the pre-integration design audit (recorded in
`notes-integration-boundary-accuracy.md` § Design Audit — pre-integration four-lens pass) before entering
`integrate-work-unit.md`: two Candidate-lifecycle blockers this work unit would hit on its own ship path, a set
of prose and contract trims, the spine-verb rename, and rationale-recording amendments. Every `.arc/**` workflow
or template edit lands in both copies per the two-copy discipline.

_Design decisions:_ Appended after the closed verification phase deliberately: the `verify-work-unit.md` ceremony
(Task 10.1) is complete and is not re-entered; this phase closes through the design's own convergence path — one
converged Tier 3 plus re-attestation (Task 11.12) — which § E4 defines for exactly this situation. Task 11.1
lands first because every later task stales the Candidate, and until re-rooting exists a staled Candidate is
unrecoverable (the audit's second blocker). Task ordering after 11.2 is flexible except 11.10 (rename) before
11.11 (amendments reference the final verb names) and 11.12 last. Each task carries explicit scope bounds; work
beyond a task's named surface is out of scope for this phase regardless of adjacency.

### `[x]` **11.1 `arc propose` establishes a new lineage root over a blocked Candidate**

- _Goal:_ A blocked Candidate has the escape § E2 records — full verification followed by re-attestation
  establishes a **new** lineage root that records the superseded `candidateId` — so no Candidate state is
  terminal. The existing record is never repaired, refreshed, or edited in place.

- _Outcome:_ `arc propose <name> --new-root` reaches a re-root arm in `runPropose`; the root-creation path is
  now one `establishRoot` helper both arms share, returning `operation: "re-root"` when it supersedes. The
  superseded `candidateId` lands in the new attestation as `supersedes`, digest-covered rather than free-standing
  metadata. The arm fires only on a blocked lineage, so a not-blocked target keeps its ordinary arm and a
  repeated invocation stays a no-op. `checkpoint.ts`'s `candidate-unexplained-delta` remedy now offers
  `proposeNewRootArgv` and names both routes — the approved response, or full verification plus the re-root —
  instead of a bare re-attempt that would block again.

### `[x]` **11.2 Candidate subject classification survives lifecycle relocation**

- _Goal:_ A `with-integration` ship reaches checkpoint `ready`: the archive sweep's content-identical relocation
  of work-unit artifacts (`active/` → `completed/<dated>/…`) and every system-regenerated projection classify as
  operational, while a content **change** to any work-unit artifact remains a reviewable delta.

- _Outcome:_ `git-candidate-subject.ts` classifies through a new layout inverse
  (`identifyWorkUnitArtifactPath` / `isProjectDocumentPath` in `lib/layout/identification.ts`), which reads
  candidate addresses out of a path's segments and confirms them by projecting back — so the projection stays the
  single authority on path shape. Treatment now resolves by class: the work unit's own `meta` is operational at
  any placement, project documents come from the layout's document vocabulary rather than a roadmap comparison,
  and a relocated artifact's new location is operational.

    - Refinement to the recorded approach, verified against the reproduced blocker: classifying the relocation
      operational is necessary but not sufficient — dropping the artifact from the reviewable set registers as a
      `removed` delta and blocks all the same. The relocated content therefore stays keyed to the artifact's
      canonical `active/` path, so a move alone leaves the reviewable subject byte-identical while an edit made
      along the way still lands as a `changed` entry. No attestation-schema, digest-algorithm, or record-store
      change; re-keying reaches work-unit artifacts only, not paths generally.

    - The key is the artifact's project-active path because `backlog` → `active` → `completed` are stages one
      artifact passes through; contributor scope is a different owner, not a stage, so a contributor-scoped
      artifact keys to its own path rather than collapsing two artifacts onto one entry.

    - Forward-compat (`strategy-storage-evolution.md` Principles 1–2): the classifier is a pure path function
      with no git, I/O, or existence check, and the `candidate-projection` exclusion still carries either
      placement of the record. Under the materialized target these artifacts leave the code repo's diff entirely
      and the classification goes inert rather than wrong — the same exposure the two path literals it replaced
      already carried.

    - The `candidate-lineage` e2e gained the missing `with-integration` legs — relocation through to a checkpoint
      that no longer refuses, and its negative twin where a post-relocation edit still refuses. Both `manual`
      legs are unchanged.

### `[x]` **11.3 Step 2 executes as written: chunking after its producer, idempotence stated exactly**

- _Goal:_ `integrate-work-unit.md` Step 2's first chunking invocation has an obtainable input, and its
  re-invocation guidance states the actual contract instead of overpromising idempotence.

- _Amended 2026-08-17 — prose-only was insufficient._ The recorded approach assumed the `policy` envelope
  carries the composed immutable target. It does not: `policy` targets are `{repository, pullRequest, headSha}`
  with no `targetId`, and most states carry no target at all, while `arc review chunking resolve` requires the
  full exact-target identity. The gap is wider than chunking — `arc review frontline run` requires the same
  identity, and the only surface that composed one was `arc review local prepare`. Reordering alone would have
  replaced one unobtainable input with another, so the task is amended to prose **plus** the bounded CLI addition
  that makes the ordering executable. Approved before implementation.

- _Outcome:_ `arc review pre-publication` now composes the exact target and carries it as `target` on its
  envelope, so the operations it routes to have an obtainable input. It is nullable: derivation refuses on a
  dirty tree, and the procedure has arms — self-review, convergence verification, submission — that need no
  target, so unavailability reports through an advisory rather than refusing the whole boundary. The durable
  submission boundary is unchanged: `prePublicationBoundary` strips the live target before persistence, since a
  boundary keyed to the reviewable subject must not carry a fact that goes stale when the head moves.

    - Step 2's prose (both copies) now invokes the procedure first, resolves chunking against the envelope's
      `target`, and routes a selected scope back through `--lanes` and the `stale-target / select-scope` arm.
      The idempotence sentence is replaced by the actual contract: re-supply `--change-set` and `--self-review`
      verbatim, because lane progress is recovered from the durable record and author judgment is not.

    - Root cause worth naming: `ReviewPolicyTarget` was documented as "the immutable target both lanes review",
      which is what the audit read. Its doc comment now distinguishes routing from identity. Durable CLI-side
      persistence of the judgment inputs remains captured for `review-request-contracts`, not built here.

    - Not in scope: CLI changes; new flags or derivation arms on the chunking command.

### `[x]` **11.4 The reconcile arm neither waits on checks pre-approval nor re-reads state nothing consumes**

- _Goal:_ The merge verb's await is the single place the work-unit lane waits on required checks (§ B8,
  Success Criterion 17), and the reconcile arm carries no dead round-trips.

- _Outcome:_ `checks-pending` keeps its state but now carries `nextAction: "rerun-checkpoint"` (`status.ts`),
  so it joins `base-moved` on the one route Step 13 already had; the dispatch row in both workflow copies drops
  the `arc review checks await` invocation and names why — the checkpoint never gates on check state (it reads
  `requiredChecks` only for an interlock-surface signal) and `merge-composition.ts` holds the lane's sole
  `awaitRequiredChecks` call. `arc review checks await` is now reached from no agent prose, which is what § B8
  asserts.

    - The post-`arc wu reconcile` resolver + status pair is deleted; only "restart this step" remains. Verified
      dead rather than merely unread: `resolveChangeRequest` is a pure host read with no persistence, and
      `checkpoint-composition.ts` re-resolves the change request from the current head itself, so the restart
      already rebuilds everything the pair produced.

    - § C3 gains the amendment reconciling its `checks-pending` member with § B8's single-wait-site claim. The
      contract test that pinned the old dispatch now pins the new one plus the verb's absence from the gate.

### `[x]` **11.5 Small workflow-prose trims: deadline-yield resume, extension-block omission, settlement fold**

- _Goal:_ Three bookkeeping-ceremony lines stop costing routine runs: a deadline yield resumes immediately, an
  inactive extension renders nothing, and review settlement is confirmed once.

- _Outcome:_ All three land in `integrate-work-unit.md` (both copies, byte-identical). The `awaiting-checks / retry`
  arm re-invokes immediately and names `payload.elapsedMs` as disclosure of the wait already served — confirmed
  against `bounded-wait.ts`, where it is `now() - startedAt` passed to the deadline branch, never a delay to
  observe. The `#pre-merge` block returns to the corpus-wide "Otherwise, skip", since
  `composeCheckpointInterlockSurface` types the slot's content as `z.null()` and so already models an inactive
  extension as rendering nothing.

    - The old Steps 5 and 6 fold into one `5) Confirm review coordination`, which states `review-settled` once as
      the candidate-entry state and keeps the bias guard against a raw local report or unattested result.

    - The fold renumbers Steps 6–14 to 5–13, with every in-file cross-reference and the `Steps 12–13` range moved
      with it. Two live external pointers followed: `QUICK-REFERENCE.md` and its packaged template, both of which
      named the post-merge cleanup step. A stale `clean-work-unit.md` back-reference ("invoked from Step 5") became
      correct through the renumber rather than needing an edit.

    - Three test files pinned the old numbering or the replaced prose and now pin the new contract. Reflowed the
      extension block so the post-`ready` no-commit sentence stays on one line — two suites match it as a
      contiguous string.

    - `run-errand.md` carries the same render-`None` line on the errand lane, introduced by this work unit's own
      `refactor(errand)` commit. Left out of this task — outside its named surface, and the composer rationale
      above does not reach a lane with no composer. Surfaced at the gate and routed into Task 11.6, which already
      edits that file.

### `[ ]` **11.6 Errand pre-create head validation goes through the typed resolver**

- _Goal:_ Goal 4 holds on both lanes: no agent-executed remote parse remains in `run-errand.md`'s pre-create
  sequence.

- _Approach:_ Both copies: replace the `git ls-remote --heads origin` read and 40-hex comparison with
  re-invoking `arc review change-request resolve` after the pre-create hook (the only thing that can move the
  head since the prior call) and dispatching on its typed state — mirroring the work-unit lane's "this resolver
  call is the pre-create exact-head validation."

    - Not in scope: CLI changes; other errand-lane steps.

### `[ ]` **11.7 `arc propose` returns the shared integration-boundary locus with a truthful pointer**

- _Goal:_ One typed locus union (§ E9) with no untruthful next action: `propose` never points at submission the
  authoritative projection would refuse.

- _Approach:_ Delete the private `CandidatePrePublicationLocusSchema` in `verbs/propose.ts`; return the shared
  locus shape, deriving the kind from the same projection the pre-publication procedure uses — or return the
  conservative `candidate-review-pending` and let one idempotent hop resolve the finer locus (the § E9
  amendment's own pattern). Submit-readiness is never derived from `record.responses.length`.

    - Not in scope: new locus kinds; changes to `arc status` / session-init projection; `submit`'s
      authorization checks (already correct).

### `[ ]` **11.8 CLI trims: `submit` input defaults and single-source shared shapes**

- _Goal:_ The transition verb stops demanding judgment-shaped constants, and shapes the code already declares
  exist once.

- _Approach:_ (a) `--action` defaults to the transition's own publication pointer and `--last-completed`
  derives from the task list's last completed leaf via existing readers — both flags stay as overrides, and a
  failed derivation still requires the flag; the `unchanged` short-circuit no longer demands either string.
  (b) Export one `aggregateChecks` (three inline copies: `checkpoint-composition.ts`, `status-composition.ts`,
  `checks-await.ts`). (c) Derive the checkpoint's merge-method schemas from `merge-method.ts`'s source schema
  instead of hand-mirroring (`strategy-procedure-evolution.md` Principle 4).

    - Not in scope: removing the flags; changing `submit`'s authorization or transition semantics; unifying the
      three bounded-wait timeout policies (captured for follow-up).

### `[ ]` **11.9 Host-evidence honesty: merge-method scope stated exactly; no fabricated conflict paths**

- _Goal:_ Surfaces describe what they read: the merge-method contract names repository-level allowances (not
  "the ruleset"), and no field labels the PR's changed files as conflicts.

- _Approach:_ (a) Amend spec § D3/§ B4 (and the Non-Goals sentence) to "repository merge-method allowances",
  recording the residual explicitly: branch-level rules (`required_linear_history` foremost) are unread, so a
  branch-scoped restriction still surfaces only at the merge attempt; annotate Success Criterion 10
  accordingly (forward amendment — original text retained). Record the same-shape § B8 residual: an empty
  required-checks read cannot distinguish an unconfigured host from a deferred run not yet created. Both
  residuals' code fix is the captured host-evidence accuracy bundle, not this task. (b) In
  `checkpoint-composition.ts`, stop populating `conflictingPaths` from the PR files listing; drop the field and
  the `regenerablePaths.every` branch with it (effectively dead — it can pass only for an all-regenerable
  change set), keeping the fail-closed direction (`hostSafe` = host-mergeable only) and reporting host
  mergeability without fabricated paths.

    - Not in scope: adding a rulesets/branch-protection read; `mergeStateStatus` adoption; any change to the
      analyzer half of `reconcileSafety`.

### `[ ]` **11.10 Rename the spine verbs: `propose` → `attest`, `submit` → `publish`**

- _Goal:_ The two spine verbs stop inverting established host-VCS vocabulary (Gerrit's "submit" is the merge;
  the host's "propose changes" opens the pull request). `attest` names what the verb does to the Candidate;
  `publish` matches the spec's own "schedules publication."

- _Approach:_ Full sweep, no alias (§ E8 applies; nothing external consumes pre-release, and the fast-follow
  consumer starts from the landed names): the verb registry and transition edge (`lifecycle-transitions.ts` —
  the load-bearing one), dispatch, `cli.ts`, handlers, verb modules, emitted command strings in locus
  next-actions (`integration-boundary-locus.ts`, `verbs/propose.ts`, checkpoint remedies), both workflow
  copies, `QUICK-REFERENCE`, the `strategy-work-organization.md` `State` table, and every test pinning the old
  names. Append a spec § E amendment recording the rename and the external-precedent check that motivated it
  (original § E text retained, per the § G amendment's pattern).

    - `arc attest` (lifecycle) and `arc review local attest` (evaluator submission) share a word in distinct
      namespaces and consistent senses — verify no command-registration collision, and nothing else.

    - Not in scope: the `arc integrate` namespace (`checkpoint` / `merge` stay); the `Integrating` state name
      (rename already rejected in § Alternatives); any semantic change riding the rename.

### `[ ]` **11.11 Record the rationale for audited deviations that stand**

- _Goal:_ Each deviation the audit upheld carries its reasoning where the next auditor will look, in appended
  amendment blocks — no settled text edited.

- _Approach:_ (a) Spec § D2/§ B8 amendment: the work-unit lane's in-verb checks wait versus host auto-merge —
  cross-reference ADR-031 Decision #5 (auto-merge survives write-actor pushes; arming-time matching does not
  guard merge time) and record the structural chain: the solo operator authors the pull request and cannot
  approve it host-side, so approval lives in the terminal and the pin rides the host's exact-head merge
  parameter; required-approvals + dismiss-stale is the industry expression of the same property, unavailable
  here. (b) § D2 clause: why the bounded wait rather than the host CLI's blocking watch (no deadline, no typed
  envelope, no stale-head guard). (c) § D1 amendment naming the `change-request` vocabulary collision with the
  host's "changes requested" review state and why the host-neutral term stands; append the reconciling note to
  ADR-005 per `strategy-adr-methodology.md` (amendment, not supersession). (d) Cross-cutting note: the
  dismiss-stale/required-approvals host mechanism was considered; the terminal interlock wins on the
  self-approval constraint.

    - Not in scope: behavior changes; new mechanisms; editing any settled spec or ADR text in place.

### `[ ]` **11.12 Convergence verification and re-attestation over the remediated tree**

- _Goal:_ The remediated tree carries a converged full attestation and the work unit stands at the integration
  boundary with a current Candidate under the renamed verbs.

- _Approach:_ Run Tier 3 whole (code and Markdown both changed); walk the Success Criteria this phase touched —
  including the four added 2026-08-17 items and Criterion 5's boundary (re-rooting is attestation, not repair)
  — then run the renamed attestation verb over the recognized lineage. The Candidate will be blocked-stale from
  this phase's own edits, so the re-attestation exercises Task 11.1's path as its first real consumer.

    - _Note:_ The `adversarial-review` cap remains spent (see § Additional Context in `SESSION-NOTES` and the
      Phase 10 amendments); no adversarial pass fires here without a fresh, explicit cap-override decision.

---

## Success Criteria

- `[x]` The final integration step's residual length is a function of its stop inventory; the reconcile arm
  holds five stop-bearing spans containing seven stops
    - _Re-counted against the delivered arm after this phase's prose edits: five spans (base merge, the
      merged-and-gate applicability judgment, review status, the WU reconcile, the commit/push releases) carrying
      seven stops, two of them judgment — matching § C's table._
- `[x]` A clean candidate's interlock surface renders what the approver decides on, collapsed by the composer;
  extension evidence renders in a separate labelled block — both tested structurally
- `[x]` The posted review record and executed settlement are exactly what approval covered; missing, stale,
  ambiguous, or actor-mismatched settlement invalidates before release or merge
    - _Amended 2026-08-15 — see `spec-integration-boundary-accuracy.md` § G and its Criterion 3 amendment. Judge
      against: **the executed settlement is exactly what approval covered**; missing, stale, ambiguous, or
      actor-mismatched settlement invalidates before release or merge. The record clause is withdrawn with the
      composed record. Original text retained above, not edited into agreement._
    - _Deviation: met against the amended text only. Every approved set now replays at the head it settled at,
      no-fix sets included, so a defer- or reject-only settlement executes instead of invalidating the merge
      (Tasks 9.1 and 9.10)._
- `[x]` `propose` and `submit` replace their predecessors with zero added happy-path commands, commits,
  approvals, or agent judgments
- `[x]` Candidate is a typed attestation and verified lineage — advancing on approved responses, surviving
  operational-only churn, blocking unexplained deltas — with no refresh or repair command
- `[x]` Ordered standard-review sources preserve preference across publication; the deferred hosted-first
  reservation is carried, never reported settled or no-op, and cannot be leapfrogged
- `[x]` Review-fix verification is bounded and primary-owned; implementation changes receive one converged
  Tier 3 plus `arc propose`, and checkpoint readiness rejects an unattested lineage head
    - _Deviation: the persisted applicability decision is attested judgment and evidence routing, read by no
      mechanical consumer — recorded in § E4's amendment rather than left as an unfinished consumer. Convergence
      enforcement is `implementationChanged` plus the re-attestation gate._
- `[x]` `arc integrate` names no lifecycle transition and survives only as the namespace for `checkpoint` and
  `merge`; the old verb name is absent from every inventoried source, doc, and test surface
- `[x]` `Integrating` means submission is underway; transitioned-but-unpushed and pushed-but-uncreated
  interruptions each project one exact resume action without claiming a PR exists
- `[x]` No agent hand-rolls a wait, a parse, or a merge-method discovery; PR resolution covers all six
  disposition classes at every inventoried site; the merge verb rejects post-checkpoint policy movement
- `[x]` The repository lock cannot misreport approval state: release only through the verb's lifecycle gate,
  re-lock on every approval-voiding exit, a deadline yield leaves the release standing, and no workflow-wide
  prose invariant carries the re-lock obligation
- `[x]` `Coverage` is absent from the pull-request record at all five inventoried sites, nothing replaces it,
  and the three non-record `Coverage` families are untouched
- `[x]` The approval pin is enforced, not narrated: the conditionality clause is gone from all five loci while
  the consequence disclosure remains, and a mismatched-head merge call returns `invalidated`
- `[x]` Every logical control obligation survives or names its covering enforcement; only the four authorized
  relocations move, and every deletion names the host pin or typed reader covering it
- `[x]` Agent discovery is typed and idempotent: every locus carries one next action, repeated calls advance
  or report the same observable resume point, and every refusal names the failed invariant and one corrective
  command
    - _Deviation: `arc status` and session initialization project the conservative entry locus per § E9's
      amendment; the finer pre-submission loci resolve one typed hop away through the idempotent pre-publication
      procedure. The amendment licenses that bound and not an untruthful pointer._
- `[x]` The errand ship path completes in-session by default; `leave` fires only on a session-ending tail, and
  the unattended-merge replay references no retained checkout
- `[x]` No prose step assumes required checks are green before the merge verb's await; the interlock surface
  reports check state as observed; a deferred-CI project runs both lanes unchanged
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

_Added 2026-08-17 — design-audit remediation (forward amendment; the original set above is unchanged, and the
two `[x]` standard items above are re-judged at Task 11.12 over the remediated tree):_

- `[ ]` A `with-integration` ship reaches checkpoint `ready` after archive composition — proven by an e2e leg
  exercising archive and checkpoint jointly
- `[ ]` A blocked Candidate has a deliberate re-root path through full verification that records the superseded
  lineage; no command repairs or refreshes an existing record
- `[ ]` The reconcile arm waits on required checks nowhere; the merge verb's await remains the work-unit lane's
  single wait site
- `[ ]` The renamed spine verbs are complete: `propose` and `submit` are absent from every source, doc, and test
  surface the way Criterion 8 required of `integrate`

**Delivery integrity.** Executable checks fail when the spine misses its intent: the merge verb returns
`invalidated` on a mismatched head, the checkpoint blocks an unattested or unexplained lineage, and the real-CLI
Candidate-lineage and publication-spine suites drive `propose → review → respond → submit` through the public
verbs. Host-dependent behavior is proven against typed ports and offline fixtures rather than a live host, so
CodeRabbit and Codex PR lane behavior is implemented-and-typed, not proven live; the first hosted run is the
forcing event. One deliberate residue remains owned: the production-uncalled `composeHostedSettlementAction`
stays census input for `review-source-authority` rather than gaining an artificial caller here.
