# Task List: Integration Boundary Accuracy

- **Design:** `spec-integration-boundary-accuracy.md`

---

## Delivery Plan

Hand-authored in the shape the authoring command will later render and replace. No plan record exists yet —
the identities below are the author-supplied chunk keys the eventual record derives from; the strict
design-inventory JSON is hand-built at record composition.

_Projection:_ stack-to-`main`. Every member is independently landable and reaches the protected base at member
size; the verification task (Phase 7) is assigned to no member. Landing runs on `delivery-stack-topology`'s
machinery once it ships; implementation and stacking do not wait on it.

| # | Member                 | Chunk key                            | Phase | Design elements                | Predecessor |
|---|------------------------|--------------------------------------|-------|--------------------------------|-------------|
| 1 | Candidate attestation  | `candidate-review-attestation`       | 1     | E1–E4, E6, E9                  | —           |
| 2 | Publication boundary   | `submission-publication-boundary`    | 2     | E3, E5–E9, F1–F4               | 1           |
| 3 | Review primitives      | `integration-review-primitives`      | 3     | B4, B8, D1–D3                  | 2           |
| 4 | Checkpoint composition | `integration-checkpoint-composition` | 4     | A, B1, B3–B5, B7               | 3           |
| 5 | Settlement and merge   | `integration-settlement-merge`       | 5     | B2–B4, D2, G, H                | 4           |
| 6 | Workflow convergence   | `integration-workflow-convergence`   | 6     | A, B4–B8, C1–C7, D1–D3, G–H, I | 5           |

**Named seams** — cross-member contracts no single member's review covers:

| Seam               | Incident | Owner | Acceptance                                                                  |
|--------------------|----------|-------|-----------------------------------------------------------------------------|
| Candidate gate     | 1, 2, 4  | 4     | Checkpoint rejects unattested lineage heads; submit carries the reservation |
| Namespace handover | 2, 4, 5  | 5     | Bare `arc integrate` errors to `arc submit`; subcommands compose later      |
| Checkpoint handle  | 4, 5     | 5     | Merge executes only the handle's persisted composition                      |
| Primitive reuse    | 3, 5, 6  | 6     | One wait implementation and one PR-resolution logic serve both lanes        |

_Per-member procedure_ — stated once, applied to every member: cut from the `main` containing the member's
predecessor; ordinary repository checks, exact-head pull request, and ARC merge lock govern the landing; no
separate delivery proof. Integration holds until `delivery-stack-topology` ships the landing machinery;
implementation need not wait.

---

## **Phase 1:** Candidate attestation and pre-publication review

_Purpose:_ Land Candidate as a storage-neutral verified lineage with machine-owned private-review progress —
the attestation record, the idempotent `propose` verb, the typed pre-publication review procedure, and the
status/session-init projection. Stack member `candidate-review-attestation`; independently landable. Spec
elements: E1–E4, E6, E9.

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

### `[ ]` **1.4 Project Candidate and review loci into status and session initialization**

- _Goal:_ Agent discovery at this boundary is typed and idempotent — six operational loci, each with one next
  action, with no parsing of review config, Candidate digests, pass counts, or narrative fields.

    - `[ ]` **1.4.a Status and session-init locus projection**
        - `candidate-review-pending`, `candidate-fix-pending`, `candidate-convergence-verification-pending`,
          `candidate-submit-ready`, `publication-pending`, `hosted-review-pending`; `candidate-submit-ready`
          may carry only the exact hosted-first deferred reservation

    - `[ ]` **1.4.b Precomposed interaction text**
        - each locus carries one typed next action and precomposed interaction text where needed

    - `[ ]` **1.4.c Narrative de-authority**
        - narrative `Next Action` prefixes stop being operational authority for this boundary; consuming
          surfaces read the projection — including the terminal string the old `verify` fire-point wrote,
          which `propose`'s typed locus replaces
        - the retired inference is `INTEGRATION_WORKFLOW_PREFIX` in `commands/active/status.ts` (reverse
          mapping in `subject-meta.ts`); its pins in `session-type.test.ts`, `integration/active.test.ts`,
          and `session-init.e2e.test.ts` flip with this member

## **Phase 2:** Submission and the publication boundary

_Purpose:_ Separate attestation from publication scheduling — rename the lifecycle transition to `submit`,
free the `integrate` namespace, and move the transition to the publication-step head so `Integrating` is true
in every lock mode. Stack member `submission-publication-boundary`; independently landable. Spec elements: E3,
E5–E9, F1–F4.

_Design decisions:_ The rename precedes the spine verbs (Phases 4–5) so `integrate` is free as a namespace
before `checkpoint` and `merge` mint under it. The fire position lands at the publication-step head, before
the push extension — the one placement costing one commit, one push, no recomposition (placement table in
`spec-integration-boundary-accuracy.md` § F).

### `[ ]` **2.1 Rename the lifecycle transition to `submit` and free the `integrate` namespace**

- _Goal:_ The scheduling verb is named for the act it performs, `integrate` survives only as the namespace for
  the later phase procedures, and no inventoried source, doc, or test surface still names the old verb.

    - `[ ]` **2.1.a `lifecycle-transitions.ts` — the load-bearing rename**
        - the `VERBS` registry (the `Verb` type derives from it), the `integrate` transition edge, `reopen`'s
          `inverse`, and the illegal-cell table; invisible to a grep for the invocation string
        - `integrate` is declared a composite verb alongside `decompose`; the renamed edge keeps that
          declaration shape

    - `[ ]` **2.1.b Remaining source surfaces**
        - `verbs/dispatch.ts` (`CONTEXT_DEFAULTING_VERBS` + kind map), `cli.ts` registration,
          `handlers/lifecycle.ts`, `lib/work-unit/verbs/integrate.ts`

    - `[ ]` **2.1.c Bare `arc integrate` error stub**
        - errors with a pointer to `arc submit`; subcommand listing composes in as `checkpoint` and `merge`
          land in later members

    - `[ ]` **2.1.d Doc surface sweep**
        - invocation and name references in the integration and reopen workflows and command references (both
          copies); the two backlog drafts update now that the name lands (unlanded names are never
          forward-referenced)

    - `[ ]` **2.1.e Verb-name test updates**
        - `verbs/integrate.test.ts`, `verbs/dispatch.test.ts`, `lifecycle-executor.test.ts`,
          `handlers/lifecycle-verbs.test.ts`, `command-input/repository-inventory.test.ts`

### `[ ]` **2.2 Enforce Candidate-aware, reservation-preserving submission**

- _Goal:_ `arc submit` schedules publication only over a current Candidate lineage with every configured
  pre-publication obligation settled or typed no-op — carrying the exact hosted-first deferred reservation as
  the sole exception, never reporting it settled.

    - `[ ]` **2.2.a Submission eligibility**
        - requires current Candidate lineage; the one exception: a hosted-first standard obligation at
          `awaiting-change-request` / `open-change-request` is submit-eligible when its durable obligation
          reference is carried across pull-request creation
        - Build `test-first` (one behavior at a time):
            - an open non-reserved obligation refuses submission
            - the carried reservation is never reported settled or no-op

    - `[ ]` **2.2.b Transition effects**
        - fires `Active → Integrating`, writes the publication resume pointer plus any carried reservation,
          stages the existing transition commit and ROADMAP projection

    - `[ ]` **2.2.c Idempotent repetition**
        - a repeated `submit` reports the observable publication resume point

### `[ ]` **2.3 Move the transition to the publication-step head and preserve exact resume loci**

- _Goal:_ `Integrating` truthfully means submission is underway from the moment it is set: the transition
  commit rides the same push it schedules, and both interruption shapes project one exact resume action.

- _Note:_ Pin updates ride the member that changes the pinned surface: this member rewrites
  `pr-open-extensions.test.ts`'s work-unit ordering test (its push-before-frontline ordering inverts under
  Task 2.4); the file's errand pins (the enumeration table, the seam-fire ordering) belong to Phase 6.

    - `[ ]` **2.3.a Fire position (F1)**
        - `submit` fires at the head of the publication step (Step 3, Open the PR), before the step's
          push-review extension contract — the extension must review the tree actually pushed; the step
          head's three consecutive stops keep their order

    - `[ ]` **2.3.b Composed next-action value (F2)**
        - written by the transition, so it moves with it

    - `[ ]` **2.3.c Resume row (F3)**
        - the Step 1 resume table's `integrating` / no-PR-open row covers transitioned-but-unpushed and
          pushed-but-uncreated; its resume point is the publication step from the push (idempotent), never PR
          creation directly

    - `[ ]` **2.3.d Fire-point record (F4)**
        - `strategy-work-organization`'s `State` table entry for `Integrating` updates from Step 1 to the
          publication step (both copies)

### `[ ]` **2.4 Converge the publication-boundary prose on the propose/submit interval**

- _Goal:_ No workflow step instructs a pre-publication review lane after `submit` fires: the lanes run under
  `Active` in the propose/submit interval, and the post-PR arm resumes the carried reservation instead of
  re-deriving it.

    - `[ ]` **2.4.a Relocate Step 3's lane dispatch**
        - the frontline-then-pre-PR-standard dispatch block moves to a pre-publication step within
          `integrate-work-unit.md`, ahead of the publication step — the containment pins require the
          local-lane command surface to stay in this workflow — driven by the Phase 1 typed procedure and
          completing before `submit` fires at the step head, so `submit`'s refusal on open non-reserved
          obligations is consistent with every review-configured path (both copies)
        - the work-unit ordering test in `pr-open-extensions.test.ts` ("after the final WU push and before PR
          creation") rewrites to the relocated order with this change

    - `[ ]` **2.4.b Re-key Step 4's hosted-findings arm to the carried reservation**
        - review iteration resumes the reserved hosted source `submit` carried across PR creation; the arm
          reads the reservation, never re-derives source order (both copies)

## **Phase 3:** Integration review primitives

_Purpose:_ Land the typed, provider-neutral primitives both publication lanes share — exact-head
change-request disposition, merge-method validation, the extracted bounded-wait primitive, and the
required-checks await. Verbs land before the prose that consumes them; workflow call sites convert in Phase 6.
Stack member `integration-review-primitives`; independently landable. Spec elements: B4, B8, D1–D3.

### `[ ]` **3.1 Resolve exact-head change-request disposition and next action, host-anchored**

- _Goal:_ One typed disposition answers the pre-create, resume-point, and stub-launch questions for any head —
  correct even from a stale checkout — so no lane hand-parses PR state again.

    - `[ ]` **3.1.a Verb and input validation**
        - `arc review change-request resolve --head-ref <branch> --head-sha <oid> --json`; derives the
          repository from the current checkout, validates the 40-hex head against local and remote refs

    - `[ ]` **3.1.b Six typed dispositions plus `targetRef` and `nextAction`**
        - `none`, `open`, `merged-at-head`, `merged-stale-head`, `closed-unmerged`, `ambiguous` (carrying
          every candidate); `closed-unmerged` is its own member — a single closed PR is an unambiguous match
          and may be legitimately re-openable
        - Build `test-first` (one behavior at a time):
            - each disposition class returns its typed next action
            - `ambiguous` carries every candidate; `closed-unmerged` never folds into it
            - a lookup or host failure returns a typed stop, never `none`

    - `[ ]` **3.1.c Host-anchored resolution**
        - a stale invoking checkout whose local refs cannot see a merged or renamed head still receives the
          correct disposition (the stub-launch consumer requires this)

### `[ ]` **3.2 Resolve the configured merge method against live repository policy**

- _Goal:_ No lane discovers a disallowed merge method by attempting the merge: one resolution logic serves the
  errand pre-arm, the checkpoint, and the merge-time revalidation.

    - `[ ]` **3.2.a `arc review merge-method resolve --json`**
        - derives the repository and configured `merge.strategy`, reads the live ruleset, returns
          `validated / use-method` with the method plus a policy fingerprint, or `blocked / stop` naming the
          configured and allowed values — never a silent substitution
        - Build `test-first` (one behavior at a time):
            - an allowed configured method validates with a fingerprint
            - a disallowed configured method blocks naming both values
            - an unreadable ruleset returns `blocked / stop`, never a fallback method

    - `[ ]` **3.2.b Fingerprint drift detection**
        - a changed policy between two resolutions yields a different fingerprint (the merge verb's equality
          check keys on it)

### `[ ]` **3.3 Extract the provider-neutral bounded wait primitive**

- _Goal:_ One backoff-and-deadline wait implementation exists in the namespace, shared by the hosted-review
  await and the required-checks await.

    - `[ ]` **3.3.a Extract from `awaitHostedReview`**
        - source lives at `src/scripts/review-gate/hosted/await.ts`
        - module placement and how much envelope vocabulary becomes shared schema are tactical calls
          (spec § Open Questions); if a third wait later resists the shape, the primitive absorbs a variant

    - `[ ]` **3.3.b Re-instantiate the hosted-review await on the primitive**
        - contract-preserving: existing envelope shapes, backoff, and deadline semantics unchanged; existing
          tests stay green

### `[ ]` **3.4 Instantiate the required-checks await on the exact head**

- _Goal:_ Required-check state on an exact head is observable through one bounded call that yields at its
  deadline instead of requiring an agent polling loop.

    - `[ ]` **3.4.a Checks await instantiation**
        - `arc review checks await --json` — review-family sibling of `arc review hosted await`; observes
          `pending`, `green`, `failed`, and `not-required`; carries the stale-head guard; yields at its
          deadline (the caller resolves a deadline yield by re-invoking the same call unchanged)
        - Build `test-first` (one behavior at a time):
            - each observed state returns typed; a moved head trips the stale-head guard
            - the deadline yield is distinguishable from failure

## **Phase 4:** Integration checkpoint composition

_Purpose:_ Collapse the stopless pre-approval span into a fail-closed checkpoint verb composing only
decision-relevant evidence — typed readiness verdicts folding lifecycle readiness, digest-bound
settlement-plan persistence, and the exception-filtered interlock surface with its typed extension boundary.
Stack member `integration-checkpoint-composition`; independently landable. Spec elements: A, B1, B3–B5, B7.

_Design decisions:_ One reader per fact — the checkpoint reads lifecycle completeness from the status
projection directly and the standalone readiness verb shrinks to what its remaining consumers need. The
`pre-merge` seam's shared fire position is workflow prose and lands with lane convergence (Phase 6).

### `[ ]` **4.1 Build the typed integration checkpoint and readiness verdicts, folding lifecycle readiness**

- _Goal:_ The entire pre-stop sequence is one typed verdict, and a `ready` envelope carries everything the
  approver decides on — nothing rederived downstream, nothing forensic re-examined.

    - `[ ]` **4.1.a `arc integrate checkpoint <name> --json` and its three verdicts**
        - `ready`, `reconcile` (carrying the drift verdict and validated safety facts — the reconcile arm's
          span 1), `blocked` (typed reason)
        - Build `test-first` (one behavior at a time):
            - each verdict class carries its typed payload
            - behind-base state returns `reconcile` with the validated facts, not a prose instruction

    - `[ ]` **4.1.b `ready` envelope composition**
        - approved head, checkpoint handle, candidate-tail diff reference, requirement and status summary,
          merge method validated through the Phase 3 resolver, and the composed review record

    - `[ ]` **4.1.c Lifecycle-readiness fold and the convergence gate**
        - reads lifecycle completeness from the status projection (no conjoined independent readers); blocks
          readiness when the current implementation-changing lineage head lacks the converged full
          attestation

### `[ ]` **4.2 Shrink `arc review readiness` contract-preservingly for its remaining consumers**

- _Goal:_ The readiness verb is the thin completeness read its remaining consumers need — the forensic
  checkout posture (symlink, escape, duplicate-artifact) guards no chartered threat and is deleted.

    - `[ ]` **4.2.a Remove the forensic posture**
        - the checkout is the single attended operator's own; deletion is authorized under Goal 5 with the
          covering reading named (implementation: `scripts/review-gate/readiness.ts`)
        - `readiness.test.ts`'s forensic assertions (`symlinked-root`, `escaping-artifact`,
          `duplicate-artifact`) delete with the posture they pin

    - `[ ]` **4.2.b Consumer contract preservation**
        - merge-lock release gating, the delivery-member vehicle, and the local lanes keep their request and
          envelope shapes and semantics; any consumer-visible narrowing is a defect — contract tests prove it

### `[ ]` **4.3 Persist digest-bound approval composition and settlement plans**

- _Goal:_ The merge verb can execute exactly what approval covered without any agent-carried value: record,
  plan, and method persist verb-side, keyed by a handle that distinguishes two checkpoint runs at the same
  head.

    - `[ ]` **4.3.a Canonical settlement plan**
        - binds the exact originating and fix targets, actor, finding and thread identities, dispositions,
          and reply content needed by the existing settlement APIs (`arc review hosted settle`,
          `arc review respond` — `response-plan-schema.ts` / `response-plan.ts`)

    - `[ ]` **4.3.b Digest-bound handle**
        - the approved head plus a digest over the plan, the composed review record, and the validated merge
          method — the head alone cannot distinguish same-head checkpoint runs
        - Build `test-first` (one behavior at a time):
            - two checkpoint runs at the same head yield distinct handles
            - a handle validates only its own persisted composition

    - `[ ]` **4.3.c Verb-side persistence and retrieval**
        - gitignored per-WU state keyed by the handle (storage locus and encoding are tactical —
          spec § Open Questions); a retrieval surface the merge verb consumes; not agent-carried, not
          meta-file content

### `[ ]` **4.4 Compose exception-filtered machine evidence with a typed extension boundary**

- _Goal:_ A clean candidate's interlock surface renders what the approver decides on — collapsing done by a
  unit-testable composer, never by agent discretion — while free-form extension evidence stays visibly
  extension-owned.

    - `[ ]` **4.4.a Exception-filtering composer**
        - clean signals collapse to a line, unclean ones expand; precomposed text, not a rendering
          instruction
        - Build `test-first` (one behavior at a time):
            - a fully clean envelope renders the decision surface, not all nine facts
            - any unclean signal expands with its evidence

    - `[ ]` **4.4.b Typed insertion boundary**
        - the envelope reserves a separately labelled block position for an extension report; the composer
          never splices or summarizes free-form output

## **Phase 5:** Settlement and pinned merge

_Purpose:_ Make exactly the approved settlement and record execute before a policy-revalidated, pinned merge —
idempotent settlement execution, lock release and the checks await inside the merge span, re-lock as the
fail-closed exit, and the `Coverage`-free record. Stack member `integration-settlement-merge`; independently
landable. Spec elements: B2–B4, D2, G, H.

_Design decisions:_ The merge span composes the shipped `arc merge lock` verbs — release keeps its
bind/gate/settle semantics; what relocates is the sequencing around it and the re-lock obligation, from a
workflow-wide prose invariant into the verb's exit paths. The `Coverage` cut lands here whole: it is a pure
field-scoped deletion, not gated on the Phase 6 rewrite.

### `[ ]` **5.1 Execute persisted review settlements idempotently**

- _Goal:_ Only the approved disposition set settles — the persisted plan is the sole source, execution is
  idempotent, and anything missing, stale, ambiguous, or actor-mismatched invalidates before release or merge.

    - `[ ]` **5.1.a Idempotent execution through existing settlement APIs**
        - executes through `arc review hosted settle` / `arc review respond`; `settled` and
          `already-settled` continue; the plan is never rebuilt from mutable threads or agent narration
        - Build `test-first` (one behavior at a time):
            - re-execution after partial settlement completes without duplicate side effects
            - each invalidation class (missing, stale, ambiguous, actor-mismatched) returns before release

### `[ ]` **5.2 Release the lock, await required checks, revalidate policy and drift, merge pinned**

- _Goal:_ The post-approval span runs as one fail-closed verb: the pin is a precondition the verb validates —
  a mismatched head returns `invalidated` with no prose instructing anyone to check.

    - `[ ]` **5.2.a `arc integrate merge <name> --checkpoint <handle> --json` and its verdicts**
        - `merged`, `invalidated` (typed reason), `awaiting-checks`, `blocked`

    - `[ ]` **5.2.b The absorbed span**
        - execute the persisted plan (5.1) → recompose and compare the head against the approved value →
          re-read status → release through `arc merge lock` (bind/gate/settle semantics unchanged; release is
          never head-authorization — the pin is) → await required checks on the exact head (the Phase 3
          await; the single place the work-unit lane waits) → revalidate the merge method and require
          equality with the checkpointed method → replace the review summary with the persisted record → read
          final drift → perform the pinned merge
        - Build `test-first` (one behavior at a time):
            - a head not equal to the approved value returns `invalidated` before release
            - post-checkpoint policy movement returns `invalidated`, never a silent substitution
            - failed required checks invalidate; `not-required` proceeds

### `[ ]` **5.3 Re-lock on every approval-voiding exit; leave a deadline yield released**

- _Goal:_ The repository lock cannot misreport approval state — enforcement lives in the verb's exit paths,
  and the workflow-wide prose invariant it replaces can be deleted in Phase 6.

    - `[ ]` **5.3.a Re-lock exits**
        - head mismatch, settlement failure, merge-method movement, non-clean final drift, failed required
          checks — each re-locks (`arc merge lock hold`) before returning `invalidated` or `blocked`
        - Build `test-first` (one behavior at a time):
            - every approval-voiding exit class re-locks before returning
            - `awaiting-checks` leaves the release standing (the checks are the blocking authority;
              re-invoking the verb is the coarse retry)

### `[ ]` **5.4 Post the checkpointed review record without `Coverage`**

- _Goal:_ The posted record is byte-for-byte what the approver previewed, and `Coverage` is gone from the
  pull-request record everywhere it was prescribed — a pure deletion with nothing replacing it.

- _Note:_ `review-driver-lifecycle.test.ts` asserts the field's presence in both workflow copies; those
  assertions flip to absence with this member.

    - `[ ]` **5.4.a Post the persisted record**
        - the merge verb posts the checkpoint's composed record; recomposition inside the merge span is the
          rejected alternative — divergence from the previewed record is the defect

    - `[ ]` **5.4.b Field-scoped `Coverage` cut at all five inventoried sites**
        - the PR template's three sites and one site in each integration workflow (both copies per the
          two-copy discipline); field-scoped, not string-scoped — the `standard-review` rubric dimension, the
          task-list validation property, and the test-coverage expectations are untouched
        - the `effectiveCoverage` envelope field (both workflows' review-upgrade arms and the hosted-await
          tests) is a separate identifier and survives untouched

## **Phase 6:** Workflow convergence

_Purpose:_ Reduce both integration workflows to typed procedures plus their real stops — the reconcile-arm
orchestration verbs, the work-unit lane's checkpoint-to-merge spine, the errand lane's convergence on the
shared primitives, the errand tail's terminal-exit semantics, and the prose-pin test rewrite. Stack member
`integration-workflow-convergence`; independently landable. Spec elements: A, B4–B8, C1–C7, D1–D3, G–H, I.

_Design decisions:_ Verbs landed before the prose that consumes them; this member converts the prose. The
shared `pre-merge` seam position lands here with both lanes and the extension contract's position statement —
between a `ready` checkpoint and the interlock stop, one enactment per path. Prose invariants that the verbs
now enforce are deleted; the bias-guarding invariants that remain are stated once each.

### `[ ]` **6.1 Merge the base only against the checkpointed revision**

- _Goal:_ The reconcile arm's refresh-compare-merge span is one verb call with no narrated git mechanics.

    - `[ ]` **6.1.a `arc base merge --expected-base <oid> --json`**
        - refresh, compare the base identifier, merge append-only; returns `merged`, `skipped-clean`,
          `base-moved`, or `conflict`
        - Build `test-first` (one behavior at a time):
            - a moved base identifier returns `base-moved` without merging
            - the merge is append-only (no rewrite of published commits)
            - `conflict` returns without partial merge state

### `[ ]` **6.2 Resolve exact-target review status after head-changing reconciliation**

- _Goal:_ The post-reconcile conjunction — checks, routed obligation, base position — is one typed answer the
  workflow follows, and a stale target reference is rejected rather than silently re-resolved.

    - `[ ]` **6.2.a `arc review status --target <target-ref> --json`**
        - consumes the opaque reference from the change-request resolver (repository, head ref, exact head);
          returns required-check status, routed review obligation, current base OID, and one of `settled`,
          `review-required`, `checks-pending`, `base-moved`, `blocked`
        - Build `test-first` (one behavior at a time):
            - a stale reference is rejected (the workflow re-runs the resolver after a head-changing push)
            - each outcome carries its typed next action

### `[ ]` **6.3 Converge the work-unit lane: checkpoint-to-merge spine, interlock surface, pin disclosure**

- _Goal:_ The final integration step reads as cadence — checkpoint, one human stop, merge — with its residual
  length a function of its stop inventory, the approval pin enforced rather than narrated, and check state
  reported as observed.

    - `[ ]` **6.3.a Pre-stop span**
        - replace Step 13's pre-approval prose with the checkpoint call; render the precomposed interlock
          surface
          and the separately labelled extension block; fire the `pre-merge` seam between a `ready` checkpoint
          and the interlock (the extension contract's position statement updates with this)

    - `[ ]` **6.3.b Post-approval span**
        - replace the post-approval prose with the merge call; delete the three work-unit
          approval-conditionality loci while keeping the consequence disclosure (what approval does —
          applies dispositions, ends review, authorizes merge); no prose step assumes checks are green

    - `[ ]` **6.3.c Resolver consumption at resume and creation**
        - the resume table's PR-state rows and the creation path's missing pre-create head validation route
          through the change-request resolver, including the row the old table lacked for a closed-unmerged
          head

    - `[ ]` **6.3.d Self-validation deletions**
        - prose confirming that owned verbs returned well-formed envelopes is deleted — a malformed envelope
          is the verb's defect

### `[ ]` **6.4 Recast the work-unit reconcile arm as thin orchestration**

- _Goal:_ The arm is orchestration over typed procedures holding exactly its seven stops — the judgment leaf,
  the direction leaf, three interlock releases, and two extension fire points — and nothing deterministic
  between them.

    - `[ ]` **6.4.a Rewire the spans**
        - span 1 arrives as the checkpoint's `reconcile` verdict; span 2 becomes the base-merge verb; span 5
          becomes the review-status verb with resolver re-run after any head-changing push; span 6's dispatch
          keeps its typed verb with the envelope-validation prose deleted and the retain-advisories direction
          leaf immediately after

    - `[ ]` **6.4.b Preserve every stop**
        - the review-applicability judgment leaf, the retain-advisories direction leaf, the commit and push
          interlock releases, and both push extension fire points survive in order

    - `[ ]` **6.4.c State the surviving invariants once**
        - clearance never carries; advisory receipts are not merge authority; the interlock is the sole merge
          authority — one statement each, replacing the six-or-seven-fold restatements

### `[ ]` **6.5 Converge the errand lane: seam placement, record cut, pin disclosure, lane arms**

- _Goal:_ The errand ship path composes the shared primitives — typed PR resolution, pre-armed merge-method
  validation, one seam fire — while keeping its one-fire lock shape and losing the same narration defects as
  the work-unit lane.

    - `[ ]` **6.5.a Typed lane arms**
        - the pre-create enumeration and four-row table over a raw paginated query route through the
          change-request resolver; the merge-method resolver runs before arming auto-merge (the observed
          failure's exact site); auto-merge keeps delegating the checks wait to the host
        - `pr-open-extensions.test.ts` pins the enumeration table and query string verbatim; those assertions
          rewrite with this change (Task 6.7.b)

    - `[ ]` **6.5.b Single seam fire at the shared position**
        - the two `pre-merge` fire instructions collapse to one at the shared position

    - `[ ]` **6.5.c Narration cuts and the one-fire rule**
        - the two errand approval-conditionality loci go, disclosure stays; the re-lock rule is stated once
          (no absorbing verb exists on this lane); record composition is verified `Coverage`-free

### `[ ]` **6.6 Restore the errand tail's terminal-exit semantics and check-cadence honesty**

- _Goal:_ The ship path completes in-session by default — `leave` is a terminal exit ramp for a session-ending
  tail, never a routine mid-ship transition or a blind re-entry loop.

    - `[ ]` **6.6.a Terminal, conditional leave**
        - the trigger clause names the session-end condition (or moving machines), not a PR-state condition
          satisfiable upstream; no step proposes leaving at pull-request open or to start the next errand
          (the auto-merge arm plus completion backstops are the batch pipeline)

    - `[ ]` **6.6.b Post-leave replay**
        - completion replays through the identity's owning open/materialize driver; no step references a
          checkout the leave tore down

    - `[ ]` **6.6.c Check-cadence honesty on the errand arms**
        - no errand step treats checks as green before the host's own wait; a deferred-CI project runs the
          lane unchanged

### `[ ]` **6.7 Replace prose-string pins with typed contract and cross-lane scenario coverage**

- _Goal:_ The tests that pinned the rewritten prose assert the new typed contracts and structural facts — not
  paraphrasable sentences — and the end-to-end scenarios cover both lanes' new shapes.

    - `[ ]` **6.7.a Audit the four not-yet-audited pin files**
        - `review-gate-packaging.test.ts`, `archive-staging.test.ts`, `framework-sync.test.ts`,
          `unit/load-set/projection.test.ts` — the audit is a task, not an assumption; unpinned assertions
          surface as red CI mid-implementation otherwise

    - `[ ]` **6.7.b Converge the pin files on typed contracts**
        - the pins earlier members' changes reach ride those members (Task 2.4 — the work-unit ordering test;
          Task 5.4 — `Coverage` presence); this pass rewrites the remainder in
          `review-driver-lifecycle.test.ts`, `pr-open-extensions.test.ts`
          (errand enumeration table, seam-fire ordering), `review-gate-workflows.test.ts`, and
          `integration-reconcile-workflow.test.ts` — readiness and merge-lock invocation strings, merge
          pseudocode, callout text — to assert typed envelopes and structural facts, not paraphrasable
          sentences

    - `[ ]` **6.7.c End-to-end scenario fixtures**
        - minimal no-review path; frontline review; local-first standard review; hosted-first standard
          review; interruption between submit and PR creation; a review-fix lineage advance;
          convergence-verification pending and completion; cap exhaustion; an `awaiting-checks` resume;
          unexplained Candidate drift

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

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
