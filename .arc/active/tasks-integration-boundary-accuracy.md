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

_Projection:_ one pull request to `main`, reviewed locally in chunks. Each chunk below is one review pass, taken
in ascending order; the verification task (Phase 8) belongs to no chunk. Chunk closure, complete union coverage
across the seven, and the seam review below carry the review obligation the stack's per-member pull requests would
have carried.

| # | Chunk                  | Chunk key                            | Phase | Design elements                |
| - | ---------------------- | ------------------------------------ | ----- | ------------------------------ |
| 1 | Candidate attestation  | `candidate-review-attestation`       | 1     | E1–E4, E6, E9                  |
| 2 | Publication boundary   | `submission-publication-boundary`    | 2     | E3, E5–E9, F1–F4               |
| 3 | Review primitives      | `integration-review-primitives`      | 3     | B4, B8, D1–D3                  |
| 4 | Checkpoint composition | `integration-checkpoint-composition` | 4     | A, B1, B3–B5, B7               |
| 5 | Settlement and merge   | `integration-settlement-merge`       | 5     | B2–B4, D2, G, H                |
| 6 | Workflow convergence   | `integration-workflow-convergence`   | 6     | A, B4–B8, C1–C7, D1–D3, G–H, I |
| 7 | Production wiring      | `integration-production-wiring`      | 7     | D1, E3–E4, E6, G2, B1–B2, B6   |

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
elements, settling each seam at its owning chunk. One exact-head pull request carries all six; ordinary
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

No success criterion is added or amended. The existing criteria already require these behaviors; the gap was in
how they were verified, not in what they state.

### `[ ]` **7.1 Persist driver-grade lane progress at attempt end**

- _Goal:_ Per-attempt review progress is durable at the fidelity the policy driver reads, so source order and pass
  ceilings are owned by the CLI rather than assembled by an agent.

- _Rationale:_ This is not new state. The outcome vocabulary already exists at attempt time and is discarded;
  what lands here is keeping it. Composing the existing `ReviewOperationStateStore` rather than adding a store
  keeps the change to a record variant plus its write sites.

    - `[ ]` **7.1.a `lane-progress` operation-state variant**
        - Add the variant to `ReviewOperationStateSchema`'s discriminated union carrying lane, target, source
          identity, the driver-grade outcome, and pass count, so the existing versioned store persists it.

    - `[ ]` **7.1.b Write sites on all three lanes**
        - Record the outcome where each lane already computes it — the hosted await, the frontline run path, and
          the local attest path — without changing any lane's observable behavior.

    - `[ ]` **7.1.c Lane-progress reader**
        - Project persisted progress into the driver's `completedPasses` and ordered `attempts`, preserving
          fall-through fidelity so a reconstructed request is accepted by the policy request schema's ordering and
          fall-through refinements.

### `[ ]` **7.2 Register and wire the pre-publication procedure**

- _Goal:_ The typed pre-publication procedure is reachable from the CLI, so the next action every Candidate-bearing
  locus names is a command that exists, and a standard-review reservation is created on the production path rather
  than only under test.

    - `[ ]` **7.2.a `arc review pre-publication` registration and handler**
        - Register the subcommand in `cli.ts` under the `review` namespace and route it to
          `projectPrePublicationReview`, matching the `<name> --json` shape the four emitting sites already name.

    - `[ ]` **7.2.b Request composition from repository state**
        - Compose both lane policy requests from the Candidate record, the git subject, resolved review config, and
          7.1's lane-progress reader, so the command self-composes from a slug with no caller-supplied progress.

    - `[ ]` **7.2.c Reservation creation on the production path**
        - Reach `createStandardReviewReservation` from the registered handler so an ordered hosted-first source is
          reserved before pull-request binding, and the reservation the submission boundary carries is a real one.

    - `[ ]` **7.2.d Command-surface coverage**
        - Extend the command-inventory and handler suites to assert the subcommand is registered and that every
          locus-emitted corrective command resolves to a registered command.

### `[ ]` **7.3 Close the submission-boundary write path**

- _Goal:_ `arc submit` succeeds on its first call over a ready Candidate — the durable boundary is written where
  the pre-publication locus settles, not by the consumer that refuses without it.

    - `[ ]` **7.3.a Write the boundary at the pre-publication settle point**
        - Move the `writeSubmissionBoundary` call out of `handleSubmit`'s post-transition tail to the point where
          the locus reduces to `candidate-submit-ready`, keeping the file's canonical shape and staged-effect
          behavior unchanged.

    - `[ ]` **7.3.b Submit over a first-call boundary**
        - `handleSubmit` reads the settled boundary, retains its idempotent repeat-from-`Integrating` arm, and
          keeps refusing when no boundary exists — a state that is now reachable only by genuinely open
          obligations.

    - `[ ]` **7.3.c End-to-end reachability proof**
        - Cover `propose → pre-publication → submit` against the real CLI, so the spine's first-call path is
          proven by execution rather than by injected dependencies.

### `[ ]` **7.4 Advance Candidate lineage in production**

- _Goal:_ An approved review response and its delta-verification evidence append to the managed Candidate record,
  so lineage currentness, the `implementationChanged` reduction, and B1's convergence guard all reach live paths.

    - `[ ]` **7.4.a Response append on the production path**
        - Reach `recordCandidateVerifiedResponse` from the registered handler and persist the appended record, so
          `responses` is written by something other than `propose`'s empty literal.

    - `[ ]` **7.4.b Convergence-guard reachability**
        - Cover a review-fix lineage that drives `implementationChanged` true, blocks the checkpoint on pending
          convergence, and clears through `arc propose` — the guard at `checkpoint.ts` proven reachable.

### `[ ]` **7.5 Compose the checkpoint's review record and settlement plan**

- _Goal:_ The checkpoint persists the review record and canonical settlement plan the approver decides on, and the
  merge verb posts and executes exactly that composition.

    - `[ ]` **7.5.a Review-record composition**
        - Replace the hardcoded null record in `checkpoint-composition.ts` with composition from the Candidate's
          responses, preserving the schema's record/disposition-identity invariant.

    - `[ ]` **7.5.b Settlement-plan composition**
        - Replace the hardcoded empty plan with the canonical cross-channel plan built from the same responses, so
          the digest binds a plan that has actions in it.

    - `[ ]` **7.5.c Review-bearing checkpoint and merge coverage**
        - Cover a review-bearing work unit through checkpoint and merge: the record posts, the plan executes
          idempotently, and drift or handle substitution still fails closed.

### `[ ]` **7.6 Restore the review-applicability disclosure at the work-unit interlock**

- _Goal:_ The facts § G2 priced the `Coverage` deletion against — every review applicability call, targeted
  verification, and the candidate-tail diff — are surfaced at the stop on both lanes, not just the errand one.

    - Restore the item to the work-unit interlock callout in both copies, matching `run-errand.md`'s surviving
      wording so the lanes stop diverging.
    - Keep the nine-signal composer count intact: the disclosure is a surfaced item, not a tenth machine signal —
      Criterion 2 and the composer's structural tests pin that count.

### `[ ]` **7.7 Restore the lifecycle-artifact readiness gate on a lock-independent path**

- _Goal:_ Completion Notes and any applicable Release Notes are verified before merge in every lock mode, closing
  the `merge.lock: none` hole where nothing checks them.

    - Fold the artifact-presence read into the checkpoint's own lifecycle composition — the one gate both lock
      modes traverse — rather than restoring a workflow-prose step or depending on the lock release.
    - Cover the `none` lock mode explicitly: a work unit missing Completion Notes must not reach a `ready` verdict.

### `[ ]` **7.8 Restore the errand lane's pre-create head re-validation**

- _Goal:_ No pull request is created against a head that changed after validation, in either lane.

    - Reinstate the remote-head comparison against `proposedChangeRequest.headSha` in both copies of
      `run-errand.md`, positioned after the `pre-pr-open` actions and immediately before creation.
    - `pre-pr-open` is project-authored and guaranteed only retry-safe, so resolver-time validation upstream of it
      does not cover this window.

### `[ ]` **7.9 Name a corrective command on every spine refusal**

- _Goal:_ Every checkpoint, merge, and submit refusal names the failed invariant and one corrective command, per
  Criterion 15's closing clause.

    - Carry a corrective command alongside the typed reason on the blocked envelopes rather than widening
      `nextAction` — `candidate-convergence-pending` names `arc propose`, the merge-method and relock reasons name
      their own remedies.
    - Give `submit`'s string refusals the same treatment.

### `[ ]` **7.10 Correct the `arc integrate` command reference**

- _Goal:_ `QUICK-REFERENCE` describes the namespace as it shipped.

    - List `arc integrate checkpoint` and `arc integrate merge` and stop presenting bare `arc integrate` as
      invocable, in both copies.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The final integration step's residual length is a function of its stop inventory; the reconcile arm
  holds five stop-bearing spans containing seven stops
- `[ ]` A clean candidate's interlock surface renders what the approver decides on, collapsed by the composer;
  extension evidence renders in a separate labelled block — both tested structurally
- `[ ]` The posted review record and executed settlement are exactly what approval covered; missing, stale,
  ambiguous, or actor-mismatched settlement invalidates before release or merge
- `[ ]` `propose` and `submit` replace their predecessors with zero added happy-path commands, commits,
  approvals, or agent judgments
- `[ ]` Candidate is a typed attestation and verified lineage — advancing on approved responses, surviving
  operational-only churn, blocking unexplained deltas — with no refresh or repair command
- `[ ]` Ordered standard-review sources preserve preference across publication; the deferred hosted-first
  reservation is carried, never reported settled or no-op, and cannot be leapfrogged
- `[ ]` Review-fix verification is bounded and primary-owned; implementation changes receive one converged
  Tier 3 plus `arc propose`, and checkpoint readiness rejects an unattested lineage head
- `[ ]` `arc integrate` names no lifecycle transition and survives only as the namespace for `checkpoint` and
  `merge`; the old verb name is absent from every inventoried source, doc, and test surface
- `[ ]` `Integrating` means submission is underway; transitioned-but-unpushed and pushed-but-uncreated
  interruptions each project one exact resume action without claiming a PR exists
- `[ ]` No agent hand-rolls a wait, a parse, or a merge-method discovery; PR resolution covers all six
  disposition classes at every inventoried site; the merge verb rejects post-checkpoint policy movement
- `[ ]` The repository lock cannot misreport approval state: release only through the verb's lifecycle gate,
  re-lock on every approval-voiding exit, a deadline yield leaves the release standing, and no workflow-wide
  prose invariant carries the re-lock obligation
- `[ ]` `Coverage` is absent from the pull-request record at all five inventoried sites, nothing replaces it,
  and the three non-record `Coverage` families are untouched
- `[ ]` The approval pin is enforced, not narrated: the conditionality clause is gone from all five loci while
  the consequence disclosure remains, and a mismatched-head merge call returns `invalidated`
- `[ ]` Every logical control obligation survives or names its covering enforcement; only the four authorized
  relocations move, and every deletion names the host pin or typed reader covering it
- `[ ]` Agent discovery is typed and idempotent: every locus carries one next action, repeated calls advance
  or report the same observable resume point, and every refusal names the failed invariant and one corrective
  command
- `[ ]` The errand ship path completes in-session by default; `leave` fires only on a session-ending tail, and
  the unattended-merge replay references no retained checkout
- `[ ]` No prose step assumes required checks are green before the merge verb's await; the interlock surface
  reports check state as observed; a deferred-CI project runs both lanes unchanged
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
