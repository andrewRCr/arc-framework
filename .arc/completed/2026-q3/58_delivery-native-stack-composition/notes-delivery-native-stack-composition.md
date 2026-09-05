# Notes: delivery-native-stack-composition

## Contents

- [Comparator vs plan-semantics fingerprinting](#comparator-vs-plan-semantics-fingerprinting)
- [Applicability: contribution equivalence versus path carry-forward](#applicability-contribution-equivalence-versus-path-carry-forward)
- [Success Criterion 18 — why it was re-cut](#success-criterion-18--why-it-was-re-cut)
- [Member checkouts and recovery authority](#member-checkouts-and-recovery-authority)
- [Corrective integration and member-only review](#corrective-integration-and-member-only-review)
- [Corrective transition audit boundary](#corrective-transition-audit-boundary)
- [Supplemental progress and per-pass source choice](#supplemental-progress-and-per-pass-source-choice)
- [Pending review-fix authority without a task cursor](#pending-review-fix-authority-without-a-task-cursor)
- [Authored partitions and adversarial attention](#authored-partitions-and-adversarial-attention)
- [First adversarial pass amendments](#first-adversarial-pass-amendments)
- [Second adversarial pass amendments](#second-adversarial-pass-amendments)
- [Refresh and native-landing lifecycle audit amendment](#refresh-and-native-landing-lifecycle-audit-amendment)
- [Hosted-review authority audit amendment](#hosted-review-authority-audit-amendment)
- [Live GitHub Stacks API observation](#live-github-stacks-api-observation)
- [Guard-test digest history](#guard-test-digest-history)
- [Consumed `integration-boundary-accuracy` substrate](#consumed-integration-boundary-accuracy-substrate)
- [Correction-cycle rescue — decision record (2026-08-31)](#correction-cycle-rescue--decision-record-2026-08-31)

## Comparator vs plan-semantics fingerprinting

The contribution-proof comparator (`contribution-proof.ts` / `git-contribution-proof.ts`) and the plan-semantics
fingerprinting in `fingerprint.ts` are distinct concepts and must not conflate: the comparator proves content
equivalence of a carried member across predecessor movement; the fingerprint identifies plan-member semantics
across revisions. The arbiter swap replaces the former's fallback only — `fingerprint.ts` is untouched.

## Applicability: contribution equivalence versus path carry-forward

The review gate already owns an applicability notion. `applicability.ts`'s `classifyReviewApplicability` derives a
**path-based** proof — reviewed paths intersected with the change set's delta paths, yielding `carry` or
`incremental` — registered in the kernel registry under its own canonical domain. The projection this work unit
adds is a different notion wearing the same word: it decides whether head movement changed the **contribution**,
arbitrated over commits and trees, and it is what preserves a review across a mechanical restack. The path proof
cannot express that case, because a rebased commit touches exactly the same paths. Neither replaces the other and
neither should absorb the other's identity — the new projection takes its own name at its own surface.

## Success Criterion 18 — why it was re-cut

The criterion originally read "this work unit's own delivery is executed on this topology, and the run's ceremony is
measured against the pre-commitment budget with any overrun named." Both halves failed as acceptance evidence. The
measurement half named no metric, no instrument, and no consumer for the number, against a design whose own
non-goals exclude new observation records. The dogfooding half is unverifiable at every boundary the task plan owns,
because the evidence only arrives after the landing window closes. The replacement operationalizes the same Goal 8
from the built delivery path — decision count, absence of manual recut and synthetic reconciliation, and the
named-guard rule — which the task list's cross-member seam group already carried.

## Member checkouts and recovery authority

Delivery-member and gate checkouts are operation-local Git inputs, not ARC work-unit loci. The agent remains in the
originating checkout, whose ordinary session state and compaction-recovery seed remain authoritative. Review-gate
reads may resolve a member head back to its owning work unit through the delivery reverse lookup, but that lookup
does not install lifecycle artifacts, construct a second roster row, or lend the originating checkout's load set to
another checkout. This keeps delivery addressability separate from session identity and avoids adding recovery
machinery for a locus ARC never enters.

The originating marker-owned checkout is stable for the work unit's lifetime. Moving its branch to a clean checkout
does not move session authority; it creates a same-work-unit locus collision that must refuse until the branch is
restored to the origin. Codex may follow an ARC-declared ready transient because that is an explicit child frame, but
it never infers a work-unit successor from branch, active-meta, or transcript coincidence. This keeps repeated
delivery correction, review, verification, and integration cycles stationary even when member and gate operation
inputs turn over around them.

## Corrective integration and member-only review

`Integrating` is the durable public delivery phase, not a cursor saying every earlier workflow lane must replay.
Ordinary review fixes and verification-conformance corrections therefore remain `Integrating`. Review findings stay
inside the review-response protocol and never become task-list work. A conformance gap that proves the implementation
plan incomplete appends a forward corrective task, but the open task and its applicable verification are derived
sub-stages inside integration rather than an `Integrating → Active` transition.

Session initialization and compaction recovery consume the same authoritative facts. A canonical open corrective
task projects the task loop while preserving the stored integration state and boundary. After task closure,
Candidate currentness, convergence status, the existing delivery verification continuation, and the integration
boundary select applicable verification, Candidate attestation, or public review resumption. Recovery accepts only
the exact same-WU progression from an integration seed to those derived continuations, including the corresponding
task-cursor and load-set change; it never changes checkout, invents a second locus, or re-enters a completed private
lane. Missing, ambiguous, stale, or mismatched facts remain fail-closed.

The recovery contract is an exact projection matrix, not a general permission to tolerate drift:

- ordinary public integration with `no-open-task` may acquire a corrective `process-task-loop` projection only when
  the fresh canonical cursor names an appended task in the same WU and the originating checkout is unchanged;
- corrective task work may advance to another leaf or `verify-work-unit` only when a fresh structural scan proves
  the seed leaf closed and the new cursor is the canonical next executable result;
- corrective verification may return to public integration only when fresh Candidate and versioned boundary facts
  establish the exact public member-review continuation; and
- a deleted or substituted task, reverse stage movement, changed WU/checkout, malformed cursor, or any additional
  load-set difference remains a recovery stop.

This keeps the compaction seed useful as a strict baseline while allowing the small, mechanically proven lifecycle
progressions that can occur between seed emission and recovery. The stage is derived and ephemeral; `Integrating`
remains the only persisted lifecycle value throughout.

A canonical Delivery Plan changes review target cardinality for every lane. Frontline and standard review use exact
delivery-member targets; inability to materialize or bind a member is a stop, never a whole-work-unit fallback.
Before publication, enabled Frontline review progresses over members in plan order. Once the delivery is bound and
public, Frontline is no longer eligible: corrections resume the retained hosted member progression at the exact
affected heads, while work-unit seam and union verification preserve cross-member coverage. A new typed public
correction resume point may extend the existing version-checked integration boundary, but no new lifecycle state,
review ledger, correction ledger, storage axis, or branch-derived authority is introduced.

The public stacked-review cursor is likewise a derived join, not another ledger. `arc review status --work-unit`
validates the current integration boundary and retained delivery plan/state, joins each member's bound change request
to standard-lane progress by stable deliverable identity, and returns the full ordered conjunction plus one exact
next action for its first outstanding member. Each member exposes position/title, target, discharged/outstanding
state, completed-pass count, configured ceiling, and chronological attempt history. A findings pass consumes a pass;
settling its findings closes that attempt but does not discharge the member or masquerade as convergence. The active
driver tail begins after the latest settled-findings attempt, so two settled findings passes correctly require an
explicit pass-three ceiling override. Session entry, compaction recovery, ordinary re-entry, supplemental review, and
ceiling approval preserve this WU-scoped cursor instead of asking an agent or Owner to reconstruct a member target.
The exact historical `{targetRef}` placeholder is normalized on boundary read for upgrade compatibility; newly
projected boundaries always carry the self-contained WU command.

Before binding, the member coordinates come from existing delivery authoring authority: the canonical plan derives
each private candidate ref and detached gate checkout, fresh eligibility closes their exact heads/trees against the
protected base and originating top, and delivery materialization supplies each predecessor/head pair (using the
originating top for the terminal member). Review consumes that ephemeral projection and records only its ordinary
per-target progress. It never treats the plan's prose or branch spelling as coordinates and never persists another
target list. After binding, retained plan/state/change-request coordinates remain the hosted-review authority already
used by status and discharge.

The executable correction belongs to the existing Member 7 closing task. Reopening Task 7.7 keeps the canonical
delivery owner and review-fix routing intact; placing it under the completed work-unit verification task would make
the cursor invisible and would also leave the correction outside member coverage.

`arc reopen` retains one exceptional meaning: actual withdrawal from public integration. A coherently bound delivery
cannot be withdrawn by closing or drafting only its terminal request, so ordinary reopen refuses there until a
delivery-wide withdrawal contract exists. A one-time recovery repair normalized this work unit from the legacy
`Active` / `prepare-work-unit` residue to `Integrating` before the remaining correction mechanics were complete: the
new recovery audit correctly refused the contradictory state and could not seed a continuation from it. The
maintainer-authorized repair advanced only the normalization promised by Task 7.7.R.l, retaining the originating
checkout, branch, Candidate, and delivery binding. That task now revalidates the persisted public locus and resumes
the published member reviews without Frontline or generic prepublication replay.

### Corrective transition audit boundary

Repeated successful module and synthetic-rehearsal runs did not establish an end-to-end delivery lifecycle. The
eight-member rehearsal used synthetic object IDs, in-memory state, and mocked ports, so it never exercised physical
refs, Git-common versioned stores, the originating Candidate head, production status/request admission, or writes
interrupted between Candidate, boundary, meta, and index persistence. A green replay of that test is not evidence
that stacked delivery can re-enter corrective review.

The 2026-08-30 transition audit freezes provider operations until one bounded correction batch closes these exact
reachable failures:

- materialization must reobserve a state-exact member ref and repair absence through its existing reserved operation;
- corrective status must validate current Candidate authority at the originating WU head while retaining exact
  historical member targets and an exact current delivery continuation;
- a stale same-Candidate continuation must repair forward through versioned storage instead of stranding re-entry;
- explicit incremental review of the first outstanding member must pass the same production admission as complete
  review, remain non-settling, and leave the complete obligation runnable; and
- the regression carrier must use real commits, refs, local stores, and production handlers, mocking only the external
  provider effect.

The live Member 4 correction then exposed one remaining entry failure. Publishing the selected member correctly
advanced delivery state before its dependent suffix refresh, which made the Candidate boundary's exact delivery
continuation stale. That staleness is the intended trigger for versioned Candidate renewal, but the session projector
reduced the delivery-entry refusal to an unresolved checkout before it could select the renewal sub-stage. Compaction
seeding and recovery therefore stopped even though the originating checkout, Candidate baseline, delivery state, and
public reservation were all exact. The repair classifies only this typed stale-continuation result as
`candidate-renewal-required`, keeps session recovery in the existing integration workflow, and leaves attestation to
revalidate and write the fresh boundary. It does not accept a stale binding as public-review authority, enter the
verification workflow, replay verification, move lifecycle state, or weaken any other mismatch refusal.

The live correction closed the loop rather than relying on the synthetic seam. External refresh rewrote exactly
Members 5–7, ARC adopted and acknowledged the scoped Member 4/6 continuation, and delivery state advanced from 127
to 130 while the public boundary remained at 127. The repaired session projector stayed resolved in
`integrate-work-unit`; entry inspection emitted the exact ordinary attestation action; attestation returned
`unchanged` and version-wrote the state-130 continuation; and reinspection returned `continue-hosted-review`.
This is the durable recovery invariant: forward continuation drift is repaired inside integration, while new content
still projects the existing Candidate verification closeout from its exact durable boundary, and every unrelated
mismatch remains fail-closed. The clean post-commit probe caught the missing typed bridge for that second case before
push; `candidate-verification-required` now preserves the resolved checkout without manufacturing attestation or
review authority.

The audit matrix covers initial publication, correction task entry, verification return, Candidate renewal,
compaction recovery, public member status/request/await, review-fix continuation, materialization retry, first-member
ordering, and terminal conjunction. A row is closed only by executable evidence at its production seam or an explicit
out-of-scope disposition; another happy-path run is not a completion condition.

Correction validation remains complete in disposition but incremental in work: the current member report rechecks
every criterion against the corrected reachable tree while carrying exact prior evidence for unaffected criteria;
an adversarial companion, when invoked, still reruns the complete selected rubric while concentrating fresh attention
on the corrective delta and its member/cross-member interactions. Only invalidated scope or authority reopens the
original boundary itself. Private Frontline and generic prepublication never replay.

### Scoped correction verification must advance Candidate authority

The live Member 1 pass-5 correction exposed the distinction the prior stale-continuation repair did not cover. That
repair is correct when Delivery State advances but the Candidate subject remains current: `arc attest` can refresh
the versioned public boundary without verification. A real correction changes the reviewable top, however, so the
Candidate becomes genuinely non-current. Clearing `pendingReviewFixVerification` without recording the checks that
just passed leaves entry with only the conservative whole-WU verification route; session-init and compaction recovery
then faithfully project the wrong next step and the retained member/pass position becomes operationally invisible.

The correction keeps lifecycle state monotonic in `Integrating` and extends the existing Candidate transition union
with one `verification-response`. It binds the exact prior/current Candidate targets, the entry-emitted continuation
digest, primary actor/time, applicability, and evidence references. This is the durable result of the already owed
member criteria plus Tier 1 checks, not a new ledger, delivery-state proof, hosted-review verdict, or approximation of
`review-signal-convergence`.

Write ordering is recovery-significant: Candidate evidence is version-written and staged while the delivery
continuation is still pending; only then may the versioned acknowledgement clear Delivery State. A crash before the
clear re-enters through the still-pending continuation and recognizes the exact Candidate transition. A lost response
after the clear reconstructs the exact one-field predecessor and recognizes the same transition. Any selector,
digest, target, evidence, ownership, or state mismatch refuses. The acknowledgement then returns the exact ordinary
attestation action; `unchanged` refreshes the public boundary, fresh integration entry resumes hosted review, and
compaction recovery never enters whole-WU verification, Frontline, or generic prepublication.

Task-interlock review exposed that the first implementation installed this authority only after registered
dependent refresh. The invariant applies to all correction settlement routes. Complete unregistered rematerialization
now installs the pending continuation in its final top/state transition even when the top was already rebound, and an
exact terminal correction rebind validates the durable Candidate baseline, append-only current target, public
boundary, selected terminal request, and state version before writing the terminal coordinate plus the same pending
continuation. Both return the shared acknowledgment locator, so recovery never has to rederive which mutation route
produced the verified delta.

Two adjacent concerns do not enter this batch. Ordinary singleton withdrawal can retain a stale public boundary and
needs lifecycle/review ownership beyond bound stacked delivery. A general reusable scenario runner belongs with
composable workflow and review-architecture evolution after these concrete production seams have executable tests.

### Supplemental progress and per-pass source choice

Member progress is factual history, while the policy driver's active attempt tail is complete-lane control state.
Every hosted attempt whose repository, request, review target, and stable delivery-member identity match therefore
appears chronologically in the public member cursor. Only a requested or effective complete attempt may enter the
active complete-lane tail, and only an effectively complete terminal result consumes a pass. A pure incremental
result remains visible without changing discharge, pass count, source fallback, or the next required complete pass.

An Owner may select a configured hosted source for one work-unit status invocation. The existing standard-review
driver remains the authority: it validates the selection against configuration, eligibility, prior source progress,
and the exact ceiling consequence. The returned hosted action carries that force invocation through request-time
canonical recomposition and binds it to the selected provider. Nothing persists the selection; omitting it on the
next status call immediately restores configured source ordering, including when progression reaches another member.
This is transport for existing source judgment, not convergence policy or a new review terminus.

### Pending review-fix authority without a task cursor

Review-fix continuation has two independent ownership authorities. Verification-conformance corrections are task
work and retain their existing open-cursor route. An approved review finding is instead a canonical review response:
its disposition record already binds the work unit, delivery plan, deliverable, reviewed head, and fix authorization,
and review doctrine prohibits manufacturing a task merely to make that member discoverable.

When no task is open, the controller must therefore enumerate existing disposition records and select exactly one
authorized, unsettled delivery-member fix for the active work unit and current plan. It validates the selected member
against canonical Delivery State before dispatching the same correction procedure. Settled responses, unrelated work
units or plans, missing authorization, malformed coordinates, and stale authority are ineligible; multiple eligible
responses refuse as ambiguous rather than choosing by chronology or branch. This is composition over the existing
record-of-record, not a new selector, input, ledger, or lifecycle state.

Task-cursor routing continues to take precedence when an open conformance task exists. The changed-target response
path remains responsible for versioning the verified current head onto the selected approved record, and ordinary
cursorless integration remains unchanged when no pending approved member response exists.

## Authored partitions and adversarial attention

A large whole-target adversarial pass may reuse stable boundaries the work already authored — delivery members,
review chunks, criteria groups, or an equivalent partition — to keep each reviewer's attention bounded. The advisory
shape is deliberately coarser than member count: at most two or three contract-closed groups, followed by a fresh
reviewer responsible for cross-group seams and aggregate union coverage. The composite remains one logical pass and
keeps the complete rubric.

This is a lightweight carrier in the central adversarial method, not a second chunking protocol. It does not satisfy
`review-chunking`, infer partitions, fan out 1:1 by member, persist state, add a CLI verb, or create another
interlock. The stronger bounded chunk-series carrier continues to own satisfying review chunking.

## First adversarial pass amendments

The first fresh-context whole-suite pass found ten source-verifiable gaps. The accepted forward amendments keep each
remedy inside existing substrate except for the one host mutation surface the terminal topology demonstrably needs:

- predecessor movement always invokes mechanical reapply; tree equality shortcuts only an unchanged predecessor;
- publication pushes refs, opens requests bottom-up, then optionally registers using the resulting request IDs;
- every shared change-request resolver caller supplies its own acceptable-base set to the pure classifier;
- review-only member ownership lookup does not create a member-checkout session or recovery locus;
- the criteria grammar distinguishes valid root criteria, silently inert two- or three-space indentation,
  four-or-more-space refusal, and root task-ID-like checkbox refusal;
- physical teardown retains exact member bindings until terminal proof, review settlement, and final retirement;
- gate checkout cleanup derives an exact ARC-owned path and validates path, ref or head, detached state, and
  cleanliness rather than discovering ownership by HEAD coincidence;
- ARC-issued provider mutations reserve before the call, while external refresh results are observed, proved, and
  version-check adopted without a fictitious reservation for unknowable heads;
- review applicability discovers older attempts through a bounded query over the existing lane-progress records,
  not a new ledger or index; and
- the highest-member branch deletion is the ordinary host-retarget trigger; only a failed automatic outcome exposes
  explicit `retarget` or `reopen-and-retarget` remedies, each followed by fresh observation.

## Second adversarial pass amendments

The second whole-suite pass found five source-verifiable gaps. Their accepted amendments close contracts already
promised by the design without adding a ledger, record family, provider abstraction, or another review authority:

- the acceptance language preserves the existing path-based applicability proof and prohibits only a duplicate
  contribution-equivalence projection or arbiter;
- terminal publication receives one distinct caller-authored ordinary title/body, validates it with the member
  presentations before mutation, and treats it as an operation input rather than persisted delivery state;
- content-neutral top adoption uses a dedicated in-core containment classification, because the shipped eligibility
  comparator establishes exact normalized equality rather than contribution containment;
- contribution applicability has a closed exact-coordinate result consumed by both request admission and discharge,
  with an explicit residual-delta Owner selection versioned onto the existing lane-progress attempt for replay; and
- candidate-ref cleanup authority comes from the ARC-reserved namespace, exact plan/member identity, and expected
  head, not historical creation provenance that the recordless cleanup design cannot establish.

## Refresh and native-landing lifecycle audit amendment

The bounded D5/D6 audit after repeated Member 6 adversarial passes found one shared planning failure rather than an
open-ended defect tail: Phase 6 had been sliced horizontally by primitive and surface, so no task or executable
scenario owned the complete refresh-adoption or semantic native-fallback transition. Local service, schema, handler,
and workflow assertions could all pass while production composition remained absent.

The first forward correction kept provider/operator refresh external and unreserved, removed the fictitious
ARC-issued provider mutation, and reused `rewrite/provider-adoption` only after exact observed heads existed to own
ARC's top absorption, publication, and final suffix-plus-top CAS. Self-delivery then exposed that this disposition
had removed provider-native actuation from a work unit chartered to supply it. D5.9 restored official provider
refresh mechanics behind an isolated preparation adapter while ARC retained reservation, proof, lease publication,
recovery, top settlement, and state authority. External refresh and `rewrite/provider-adoption` remain an attended
fallback, now explicitly selectable after a pre-reservation provider refusal. Native selection stays state-bound,
and `native-stack-required` remains distinct from the `native-stale-suffix` refresh trigger. Member 6 closeout
requires executable vertical lifecycle scenarios, including interruption boundaries, rather than accepting
isolated primitive and workflow-string coverage.

## Hosted-review authority audit amendment

The Phase 7 pre-implementation check found the same horizontal-ownership pattern before code landed. Reservation,
request, lane progress, discharge, applicability, and workflow prose each had a task, but no task owned the complete
selector-to-terminal lifecycle. More importantly, the plan placed an authoritative Owner selection on lane progress,
whose governing review-architecture contract makes it machine-local and non-evidentiary.

The correction keeps attempt progress operational and moves only the exact-bound Owner selection to the existing
canonical Candidate transition sequence. A distinct target-neutral arm avoids changing Candidate target reduction;
the lane query becomes a storage-neutral discovery port with typed incomplete evidence, and the existing review
verbs carry one exact member selector through status, request, await, attempt, settle, and terminal conjunction.
Phase 7 closes through executable vertical scenarios over that complete spine rather than accepting isolated schema,
handler, reducer, and workflow-string tests.

## Live GitHub Stacks API observation

The 2026-08-24 probe created temporary draft pull requests `andrewRCr/arc-framework#546` through `#548` over one
three-head chain. Raw registration of the lower requests `#546` and `#547` returned HTTP `201` as stack `#549`.
Complete REST timeline snapshots for all three requests were byte-identical before and after registration, so the
raw endpoint added no pull-request timeline event. Both the registration response and a fresh stack read contained
only `#546` and `#547`; dependent unregistered top `#548` was absent.

The fresh stack read exposed one adapter-shape correction: its member entries carried exact ordered request numbers
and head refs/SHAs but no member-level `base` objects. The root still carried `base.ref: main`. The observer now
validates that root plus the exact ordered heads and derives an omitted member base from the preceding returned head;
if the provider returns a member base, it remains an exact required match. The classic token's
`gist, read:org, repo, user, workflow` scope set was sufficient, while GitHub advertised no endpoint-specific
accepted OAuth scope. This establishes a sufficient live credential, not a narrower minimum.

Cleanup unstacked `#549`, closed all three temporary requests, and deleted their remote branches. No probe commit
landed on `main`; the closed pull-request records remain as the durable provider evidence.

## Guard-test digest history

`delivery-terminal-workflow.test.ts` once pinned a whole-file sha256 over the workflow document. It was removed
because it froze a shared document (any unrelated edit broke the pin) and its reconstruction literal had gone
stale. That failure is the rationale behind the replacement-guard rule: structural assertions over the specific
contract (presence, uniqueness, ordering), never a digest over a shared document.

## Consumed `integration-boundary-accuracy` substrate

The design consumes the landed typed substrate rather than minting parallel reads: `arc review change-request
resolve` (member pull-request resolution / reverse lookup), `arc review status`, `arc base merge`,
`arc review merge-method resolve`, and the provider-neutral bounded wait — a stack-merge-API await is that wait's
natural third instantiation.

## Correction-cycle rescue — decision record (2026-08-31)

Owner-approved decision record for finishing this integration. It settles what the review-correction path must
become before live member cycling resumes, what is deliberately excluded, and how the change lands. Written so the
resuming session can act without re-deriving any of it; the underlying evidence lives in the
`USER-INBOX § Right-size stacked review correction as one resumable control loop` capture and its siblings.

### Evidence base, compressed

Six integration days produced 255 distinct commits (deduped across stack rematerialization): 45% repaired the
delivery/review/lifecycle machinery itself under dogfood, 36% were attest/publish/reopen/renew/absorb ceremony, and
3% carried an actual hosted-review finding fix. A prescribed correction cycle contains 1–3 decision-bearing stops
against 6–10 deterministic-only stops, 5–7 manual re-invocations of the correction continuation, 3–5 full
review-status recompositions, and 7–12 full delivery-entry recompositions; observed attended cost ran 45–105
minutes per cycle. Mature stacked-PR practice (Graphite, `gh stack`, git-machete, jj) lands the equivalent
mechanical span as one command plus unattended CI wait, with human attention reserved for semantic conflicts and
the re-review-scope decision. The machinery-repair bucket is largely paid; the ceremony bucket is structural and
recurs per cycle, so it is what the rescue removes. One emblem: `5678fd278` is an empty commit created solely to
advance a head past a typed ancestry check.

### Decisions

1. **Hosted member cycling is paused** until the rescue slice lands and its acceptance run passes. No new hosted
   passes, no new provider spend; the pending narrow correction (retained review-fix response across a provably
   mechanical refresh) commits first so the boundary is durable.
2. **The correction cycle becomes one driven control loop owned by the CLI.** The existing
   `review-fix continue` projector already composes complete argv+input for its six dispatch kinds; the driver
   executes them in-process instead of handing them back, and returns only typed stops. This is hard-coded,
   delivery-correction-specific code-tier logic under `strategy-procedure-evolution` Principle 1 — deliberately
   not a general workflow engine, step vocabulary, or agent-interpreted control flow.
3. **Machine-owned record-only commits and pushes run inside the driver without per-fire approval.** The
   Review-Increment bounded exception already admits candidate-tail cleanup and lifecycle ceremony ahead of the
   final interlock; the boundary-projection commit, applicability `commit-selection` commit, and the top push
   after renewal are that class. Each drive emits an effect log (commits created, refs pushed, renewals
   performed) surfaced in the completion report — disclosure, not approval. The user-facing configurability of
   this posture (some operators will want a stop here) is deliberately deferred and routed to the backlog's
   approval-semantics owners; the default here is autonomous-with-disclosure.
4. **Whether a restack invalidates prior review authority is decided by proof, not by re-asking.** Generalizing
   the retained-response fallback: head movement that is provably mechanical — strict ancestor descent with
   contribution-equivalent reviewed content under the existing arbiter — preserves pending review-fix responses
   and Owner applicability selections, recording the proof; anything unprovable fails closed to the existing
   re-ask. This is the industry posture (restacks do not dismiss approvals) made exact.
5. **The boundary-renewal cycle stops being self-inflicted.** `acknowledge` bumps the state revision that the
   integration boundary pins, so renewal fires every cycle by construction and `arc attest` returns `unchanged`.
   The driver folds record-only renewal in (or the boundary tolerates same-Candidate revision advance); a
   `blocked / establish-new-root` result remains a typed stop with its continuation surfaced, never auto-run.

### Driver contract

`arc delivery review-fix continue` (driven form) executes deterministic steps until a typed stop. Exhaustive stop
set: **finding-disposition approval** (entering the cycle); **authoring** (the fix itself — `authoring-required`
becomes a first-class arm for the non-terminal route rather than prose inside `recommendedActionText`);
**one consolidated verification stop** per cycle (member-scoped `validate-criteria` walks and the
`verificationResult` composition stay agent judgment; Tier 1 execution is mechanical and may run machine-owned
against the composed target); **semantically ambiguous conflict** — returned with the reserved merge base, both
parents, and a prepared isolated resolution workspace or exact `merge-tree` invocation plus a resume action, so
natural-merge semantics cannot be substituted by accident; **new review spend** (ceiling override, hosted request
where a metered pass is consumed, an applicability selection not mechanically preserved under Decision 4);
**destructive authority**; and **exact-head integration/merge authorization**. Everything else — publish, refresh
execute/adopt, reconcile, acknowledge, renewal, record commits, top push, re-entry — is driver-internal. The
driver resumes idempotently from the persisted operation record after interruption or compaction, and running as
one process collapses the repeated status/entry recompositions to one observation per drive.

### Contract repairs riding the slice

- Every emitted next action is directly submit-ready (the hosted `await` envelope today requires an
  undocumented reconstructed wrapper).
- A stale publish action is deferred or recomposed when newer unauthored same-member work exists; the agent no
  longer detects that sequencing mismatch manually.
- `idle / continue-work-unit` returns the real continuation when the entry status is
  `candidate-verification-required` instead of reporting nothing actionable.
- Confirm the contribution-equivalence escape actually exempts unchanged dependents from per-member criteria
  re-walks in practice; a correction to a low member should not cost seven walks.
- Same-member findings batch into one republish by default; publishing between findings of one pass is the
  exception and needs a reason.

### Hard boundaries

No review-convergence policy (owned by `review-signal-convergence`); no generalized orchestration, step
vocabulary, or composition substrate (owned by `composable-workflows` / `review-orchestration-right-sizing`); no
storage redesign; minimal new investment in the filtered member-ref projection machinery, which the storage
direction already records for retirement once operational state materializes off-branch. If the rescue cannot be
built inside these boundaries, stop expanding and finish the remaining members through a fixed manual runbook.

### Process shape

The rescue lands through the established correction model: one forward design amendment to
`spec-delivery-native-stack-composition.md` (driver contract, typed stop set, mechanical-preservation rule) plus a
reopened corrective task group — no replay of the planning stages. The design is settled by field evidence and
this record; the cohort's hardening-admission boundary asks that new mechanism arrive as a deliberate design
amendment, which this satisfies. A targeted task audit over the new group at resume is cheap insurance and
optional. Acceptance: one production-style end-to-end case covering review-response-owned correction × provider
refresh × verification × Candidate renewal × unresolved hosted settlement, driven through the composed loop (the
pending e2e addition is most of the fixture); then the next live Member 1 correction is the acceptance run —
attended stops limited to the typed set above, attended time in minutes. While hosted or CI waits run, this WU
parks and disjoint project work advances; integration becomes an asynchronous lane rather than the project's
foreground.

### Routed out, not lost

Generalized control-loop doctrine, the duplicated review dispatch tables, and prose-orchestration removal —
`review-orchestration-right-sizing` / `composable-workflows` (captures exist; refreshed with this week's
evidence). Standing lifecycle-advancement direction across re-entry — the existing
`lifecycle-advancement-provenance` capture. Commit-autonomy user-facing configurability — new capture to the
approval-semantics backlog owners. Incremental-versus-complete pass economics — `review-signal-convergence`.
Probe, seed, and note-discovery performance — `session-init-performance`. Tier 2/3 convergence (Tier 3 exceeds
Tier 2 by `build` alone) — quality-gates housekeeping.

### Amendment 1 — equivalent-offer aggregation (2026-09-01)

Live Member 1 re-entry exposed a case the original record did not anticipate: applicability is projected per
retained review attempt, so one semantic Owner judgment ("the later clean passes already cover this residual")
returned as three serial attended stops — same member, same source, same current head, differing only by retained
attempt identity — each costing a selection, a record commit, a push, and a recomposition. The stops are
individually legal under the typed set, but the second and third carried no new decision, against the record's own
no-gate-without-a-decision intent. This amendment is in-charter, not deferred review architecture: the cohort
record assigns review applicability across non-substantive head movement to this work unit, and nothing here
decides whether further review is worthwhile.

Decided behavior: review status composes pending applicability offers into equivalence classes keyed by member,
source, current head, residual-equivalence, and prior head within the already-reviewed pass set. One attended
offer presents the class; the Owner's single answer applies to every member of it; the driver records each exact
selection individually per the existing Candidate contract, coalesced into one commit and one push (confirm the
contract binds record content, not commit cardinality; if it genuinely demands per-record commits, surface that as
its own question rather than assuming). Any offer outside the class boundary — a different source, a changed head,
a new or materially different residual — remains a separate attended stop. No standing grant object is persisted:
a bounded batch authority expressed by the Owner in-session is the answer format, not a stored contract — the
durable standing-direction design stays with `lifecycle-advancement-provenance`.

Proof: extend the production end-to-end case with two retained equivalent attempts, asserting one aggregated
offer, individual selection records, and one commit/push; the next natural live occurrence is the acceptance run.
Sequencing: Member 1's remaining CodeRabbit applicability queue clears first under the already-granted bounded
batch rule (reaching the outstanding Codex obligation is the urgent path); the amendment lands before member
cycling resumes beyond that, since every future correction adds retained attempts and replays this shape at
growing depth.

Routed out, not built here: mechanical supersession — never offering an attempt whose residual a later clean pass
at a descendant head provably covers — is review-evidence liveness, owned by `review-orchestration-right-sizing`
and adjacent to the existing terminal-record garbage-collection capture; captured to `USER-INBOX` with this
instance as evidence.

### Amendment 2 — member-scoped Owner terminus parity (2026-09-01)

After the final Member 1 record-only minor was settled, status correctly reached the configured ceiling but offered
only another-pass authorization. The generic standard-review driver already supports an explicit Work Unit Owner
terminus, yet stacked delivery transported source choice, coverage, and ceiling authority while omitting that existing
judgment. The single Candidate-wide boundary terminus cannot be reused: doing so would close the complete work-unit
standard lane and skip every remaining delivery member.

Decided behavior: restore parity through one exact member-bound wrapper around the existing
`review-terminus/v1` conclusion. A ceiling status returns the complete acceptance offer; a separate mutating command
authenticates the live Owner, revalidates the Candidate, boundary version, first-outstanding vehicle and head, and
completed-pass count, then appends the conclusion through the existing version-checked integration-boundary store.
The record applies only to that exact member head and lets the conjunction select its next member. Pending findings
or applicability decisions retain precedence, and changed coordinates require fresh direction. The operation never
reports clean, pass-complete, evaluator-satisfied, or converged.

This is transport and durable scoping of shipped Owner authority, not signal-convergence policy. No provider outcome,
severity threshold, standing grant, Candidate transition, operation-state outcome, record family, or generic driver
is added. Future `review-signal-convergence` remains authoritative for deriving convergence from durable result and
disposition evidence; its minors-only rule would independently reach the same live Member 1 outcome.

Forward clarification (2026-09-02): the same explicit member-bound Owner terminus may be offered before the
configured ceiling, but only after at least one exact completed standard-review pass whose requested or effective
coverage is complete. The offer accompanies the otherwise ordinary next-pass action; it neither replaces that action
nor discharges the member until the authenticated Owner accepts it through the existing mutation command. Pending
findings or settlement, unresolved applicability, a pending hosted request, checks, unavailable evidence, and every
existing higher-priority stop suppress the offer. Acceptance revalidates the same Candidate, boundary,
first-outstanding member/head, qualifying-pass evidence, and completed-pass count, and the stored conclusion keeps
the same exact-head scope and staleness behavior. This is an earlier presentation of explicit shipped Owner
authority, not a machine inference that review is clean, sufficient, complete, or converged. It adds no provider
result, severity/minors rule, threshold, default, standing grant, or review-signal-convergence policy.

Live re-entry clarification (2026-09-02): Member 6 acceptance exposed one remaining proof-width defect. The exact
terminus record committed above the state-bound terminal head, then the task-closure record added a second
Candidate-represented operational commit. Status recognized only the current head or its immediate parent, so it
lost the valid state anchor and returned the singleton stale-target remedy instead of Member 7. The accepted
correction generalizes the existing record-advance proof only across that bounded suffix: locate the exact Delivery
State terminal coordinate between the durable Candidate baseline and recognized current head, prove the
baseline-to-state movement preserves the committed Candidate subject, verify the stored tree, and separately retain
ordinary Candidate currentness at the recognized head. It adds no standing grant, convergence rule, state mutation,
provider action, or generic ancestry
escape.

Fresh-root authority clarification (2026-09-03): the next live status run proved that fresh Candidate roots reset
canonical applicability-selection transitions even when an earlier delivery member's exact head, base, progress,
and authenticated Owner terminus remain unchanged. Member 5 therefore re-offered the exact residual already recorded
as `covered` before the root, despite its boundary carrying the later exact-head terminus. That stop has no new
decision. An exact current vehicle/head terminus whose completed-pass count still matches now remains conclusive over
this applicability replay. Findings, hosted settlement, request or await state, local continuation, changed member
coordinates, and changed pass counts still precede it. The correction preserves existing Owner authority; it does not
copy a superseded Candidate transition, infer convergence, or add a standing grant.

### Amendment 3 — executable pre-reservation conflict resume (2026-09-01)

The live Member 3 correction reached the rescue's intended attended conflict stop while provider preparation was
restacking Member 4. The result carried the logical merge base, exact parents, conflicted path, merge-tree command,
and selector-free resume envelope, but no way for the resumed provider preparation to consume the approved resolved
tree. Its temporary workspace was deleted on refusal. Publishing the exact two-parent merge manually then made
canonical position observation refuse before preparation because Delivery State correctly retained the old head.
The typed stop was diagnostic rather than executable, contrary to the rescue contract.

Decided behavior: a pre-reservation provider-history conflict keeps the remote ref and Delivery State unchanged. The
attended resolution is recorded only on the exact named local member ref. Re-entry validates that ref as one locally
readable commit with the returned old member first parent and refreshed predecessor second parent, imports that exact
commit into the fresh isolated provider preparation, and continues through the existing reservation and lease
publication. Missing or mismatched local evidence and any premature remote movement refuse. The returned guidance
states the local-only boundary explicitly. No conflict record, generalized workspace mechanism, caller-authored
member selector, or autonomous resolution is added; the local exact commit is the already-approved content input and
the existing provider-refresh operation remains the sole mutation authority after reservation.

The live ref was restored by exact lease from the prematurely published merge to its state-authoritative old head;
the approved merge remains on the clean local member ref as the acceptance fixture. Task 7.7.R.u.p owns the bounded
repair and must drive this same correction through reserved publication and scoped verification before hosted member
cycling resumes.

### Amendment 4 — cascading conflict coordinates stay executable (2026-09-01)

The next live Member 3 retry accepted the approved Member 4 merge and continued constructing the suffix inside its
fresh isolated provider repository. It then reached a genuine Member 7 content conflict after mechanically absorbing
the intervening members. The returned second parent named that newly constructed predecessor, but the adapter deleted
the only repository containing it and cleaned every private candidate ref before returning. The stop was individually
legal yet impossible to execute: the advertised merge-tree command and exact two-parent merge both failed because the
refreshed predecessor object no longer existed locally or remotely.

Decided behavior: a content-conflict stop may return only after both named parents are readable from the owning
checkout. When the refreshed predecessor exists only in isolated preparation, import it first under the same
deterministic private refresh-candidate ref ordinary successful preparation would use. Retain that one anchor only
for the conflict stop; other refusals keep complete cleanup. The anchor is liveness, not authority: it cannot publish,
settle state, or substitute for the operator's exact local two-parent resolution. On resume, that approved local
merge is the only reason the stale scan may retain the anchor. Isolated preparation then reuses the exact anchored
commit and its mechanical second-parent chain only after reproving each old-head first parent and merge tree; commit
metadata is therefore preserved rather than assumed reproducible. If a non-conflict refusal cleaned the private ref,
the exact local resolution can reconstruct it from the still-reachable parent before the same validation. Unreferenced,
malformed, or mismatched anchors retain ordinary cleanup or refusal. Task 7.7.R.u.q owns this bounded extension and
the current Member 7 conflict is its production acceptance case.

### Amendment 5 — restarted corrections consume exact existing evidence (2026-09-01)

Final live acceptance exposed four places where the driven correction still depended on agent reconstruction. An
ordinary commit in the detached authoring gate moved `HEAD` but not its deterministic candidate ref, so readiness
returned `authoring-locus-moved` and required a manual compare-and-swap. A durable approved disposition remained
present after transient lane projection moved, yet hosted status returned the original `respond-to-findings` stop and
required manual evidence-file replay. A successful hosted request had no durable pending handle, so restart could
offer a duplicate request rather than the exact await. Conflict resolution still depended on acquiring a named
branch in the owning checkout, where stale temporary resolution worktrees and indexes could block the otherwise
valid correction.

Decided behavior: correction re-entry consumes exact existing evidence before asking or spending again. A clean
detached authoring head is rebound to its deterministic candidate ref only after strict descent, required-ancestor,
selected-contribution, and compare-and-swap checks. An exact durable approved response is validated against its
delivery vehicle, source, target, and current continuation, then driven without a second disposition decision. A
successful hosted request persists its full submit-ready handle immediately; status returns that exact await while
it remains pending and never admits another request for the same pass. Provider conflict returns a deterministic
ARC-owned detached resolution workspace backed by the owning repository, so no named branch checkout is required;
only exact clean residue at that locator may be reused or replaced, and all dirty, moved, foreign, malformed, or
ambiguous residue refuses without cleanup.

These are bounded recovery/projection repairs to the existing rescue, not new policy or authority. No generalized
worktree sweeper, standing grant, disposition inference, provider request record family, workflow engine, or review
convergence rule is added. Task 7.7.R.u.r owns the test-first implementation and extends the established production
correction fixture; Member 5 remains unspent until that proof is green.

Forward clarification: “selected-contribution” in the authoring-rebind sentence is not an equivalence requirement.
Approved finding authoring is expected to change the selected contribution. The rebind proves only exact deterministic
checkout/ref identity, cleanliness, strict descent, required ancestry, approved-finding path presence, and CAS; scoped
verification remains responsible for the corrected content.

Forward clarification: exact durable response replay also preserves the existing hosted settlement contract. The
stored verified-fix applicability and verification references are transported with the approved response, and the
rediscovered attempt is rebound to that disposition. If its provider threads remain unsettled, the driver returns the
exact `hosted-settlement-required / finding-settlement / review-hosted-settle` stop and plan rather than re-asking the
decision or falsely advancing status. This is execution of the already-approved response, not new approval, provider
spend, convergence policy, or an expansion of the rescue stop model.

### Amendment 6 — approved member fixes acquire their authoring locus first (2026-09-02)

Live Member 4 correction exposed an ordering defect outside the original rescue fixture: `arc review respond`
durably recorded an approved delivery-member fix but returned the generic `ready-to-fix / apply-fix` envelope. That
surface invited authoring in the session's work-unit checkout before the selector-free correction driver had selected
the member's current presentation and exact authoring checkout. The later driver could refuse or recover the mismatch,
but only after the agent had spent a correction cycle in the wrong place. The recovery projection had the same gap:
the pending durable response was visible to the driver, but not to delivery entry or compaction recovery, so re-entry
could appear to resume ordinary hosted review instead of the already-approved correction.

Decided behavior: an approved fix on a hosted delivery-member vehicle returns a distinct
`delivery-correction-required` envelope with a submit-ready selector-free correction action. It never returns the
generic singleton `apply-fix` instruction. The action enters `arc delivery review-fix continue`, which first returns
the exact authoring locus and an invocation-scoped binding over the existing fix authorization, disposition set,
delivery plan, work unit, selected member, reviewed head, and checkout/ref pair. The agent edits only that returned
locus and resumes through the returned action; a different checkout or stale binding refuses before correction
publication or response persistence.

The locus rule follows the already-designed route rather than imposing a new topology. A registered non-terminal
member authors in its deterministic detached candidate gate. An unregistered suffix retains D5.8's complete-suffix
rematerialization from the top authoring locus. The terminal member retains direct authoring on the work-unit branch,
because that branch is the selected terminal member. Delivery entry, session status, and compaction recovery recognize
the same pending durable response as `delivery-correction` and route to the selector-free driver without re-asking the
finding disposition or reconstructing a member. The originating work-unit checkout remains the sole session and
recovery locus throughout; member and gate checkouts are operation inputs only.

This is a sequencing and projection guard over existing authority. It adds no stored grant, review policy, delivery
state, convergence judgment, generalized workflow loop, or new authoring topology. The still-separate question of
which already-authorized conflict compositions can run machine-owned is routed to the review/approval architecture
backlog; semantic ambiguity remains an attended stop.

### Amendment 7 — provider refresh cannot move checked-out member refs (2026-09-02)

The live Member 5 correction refreshed its dependent suffix while the canonical Member 7 branch was still checked
out in a temporary resolution worktree. Git's shared branch ref advanced correctly, but that worktree's index and
files remained at the old commit, making 81 unchanged paths appear staged. Exact tree comparison proved there were no
user edits; the checkout was stale only because ARC had moved its checked-out ref behind its files. This is a
supported stacked-delivery correctness failure, not ordinary cleanup residue.

Decided behavior: after isolated provider preparation identifies the canonical non-terminal member refs that would
actually move, refresh checks those refs against Git's registered-worktree topology before reservation or
publication. Any occupied ref returns every exact checkout path, removes prepared private candidates, and leaves
Delivery State plus local and remote canonical refs unchanged. A resumed reservation repeats the same check before
pending publication and retains its operation if occupancy appeared after reservation. Detached candidate and
resolution gates are not canonical-ref occupancy. ARC never silently updates a checked-out member ref or resets its
worktree; the operator explicitly realigns or removes the named checkout, then retries. Task 7.7.R.y owns the bounded
test-first repair and the existing proven-clean stale Member 7 checkout is the live acceptance residue.

The next live correction exposed the downstream form of the same ownership failure: provider refresh had advanced
the canonical Member 6 head while ARC's deterministic detached candidate ref and gate still agreed at an older
machine materialization. Exact-locus correction then correctly refused to treat the old head as an ancestor of the
new public head, but it had no safe way to prepare its own clean private authoring surface first.

Decided behavior: before returning registered non-terminal review-fix authoring, ARC derives only that member's
deterministic candidate ref and gate from repository, plan, and member identity. It may rematerialize the pair to the
current selected public head only after proving the gate is registered at the exact derived path, detached, fully
clean and operation-free, with `HEAD` equal to the candidate ref, and after revalidating the exact Delivery State
revision and selected-member coordinates. Pair absence takes the existing fresh-preparation route; an exact current
pair replays without mutation. Dirty, authored-ahead, split, attached, foreign, malformed, ambiguous, or raced state
refuses intact. A successful private rematerialization is a machine-owned driver effect disclosed in the invocation
effect log, then returns the existing `authoring-required` stop. It moves no canonical ref or remote, spends no
provider review, and does not weaken the strict post-authoring rebind, scoped verification, or publication guards.
Task 7.7.R.z owns the bounded repair; the clean stale Member 7 gate is the one-time bootstrap locus and the pending
Member 6 correction is the live acceptance.

### Amendment 8 — oversized members enter chunked local standard review (2026-09-03)

Live Member 7 made D8.3's whole-work-unit exclusion and D8.4's chunked-local seam posture collide at an executable
gap. Its exact member target contains 200 files and 34,609 changed lines, exceeding both configured attention
signals (150 files and 5,000 lines); CodeRabbit then refused the admitted request at its 150-file limit. Hosted
Codex would still receive the same unreviewable whole target. Work-unit status can select only hosted source IDs,
and the delivery-local admission path does not carry a chunked scope selection, so the existing
`review-chunking`/`standard-review` carrier cannot currently be reached for a delivery member.

Decided behavior: before admitting hosted spend, work-unit review status measures the exact first-outstanding
member target and resolves the existing change-set-size attention signal. When that signal selects chunking, status
returns one submit-ready `review-local-prepare` action for the exact delivery-member head with an explicit
`chunked` scope selection. Hosted and whole-target-only carriers are ineligible for that selection, so ordinary
source ordering chooses the existing curated-scope-capable delegated-agent carrier rather than requesting another
whole-target provider pass. The selection crosses delivery reservation admission, local prepare/resume, and
attestation without caller reconstruction. Any target movement invalidates it and requires a fresh size and scope
resolution.

Execution uses the existing chunking contract: contract-closed chunks with changed tests kept beside behavior,
complete diff union, a dedicated cross-chunk seam, and a fresh non-author aggregate evaluator. The aggregate result
is one exact-target standard-review pass; no partial chunk report can settle the member. The partition and coverage
facts remain orchestration inputs rather than a new delivery record, standing grant, source policy, or convergence
decision. Delivery topology and published pull requests remain unchanged; dynamic member resegmentation stays
deferred to `review-orchestration-right-sizing`.

The acceptance proof is one production-style delivery-status/local-review round trip with an oversized exact member
and one live Member 7 run using roughly five contract closures plus seam and fresh aggregate. The current CI fixture
is repaired in the same corrective group: production delivery-position E2E repositories must bind their commit hook
to the repository-local ARC CLI rather than accidentally depending on a globally installed executable. Explicit
provider-refusal parsing remains routed to `review-activity-contracts`; the new-head pre-request size gate removes it
from this WU's live path without claiming the old refused attempt completed.

Implementation clarification: if existing lane history already contains a non-completing attempt from a carrier that
is ineligible for the newly selected chunk scope, retain that attempt as factual history but exclude it from
current-scope terminal and fallback control. It consumes no pass. A clean or findings-bearing terminal result from an
ineligible carrier is still invalid and fails closed.

### Amendment 9 — explicit coverage cannot silently broaden (2026-09-03)

The approved live Member 7 pass 4 requested incremental coverage after three complete local passes. Work-unit status
accepted that request, but the member's cumulative size selected D8.14's chunked delegated carrier. Its delivery
admission carries no coverage, local prepare therefore materialized the complete `8a45168e6..5609e63c1` member
target, and local lane projection treats every terminal delegated result as complete. The returned reviewer contract
made the mismatch visible before evaluator spend: the Owner authorized the bounded `515c63bbd..5609e63c1`
correction delta, not another 34,609-line complete pass.

Decided behavior: explicit coverage is an authority and cost boundary, not an advisory that carrier selection may
widen. When an incremental request would select the current complete-only chunked local carrier, work-unit status
returns `blocked / coverage-unsupported / stop` before emitting `review-local-prepare`. It retains the exact member
cursor and consumes no pass. Complete oversized-member review and hosted incremental review remain unchanged. The
already-prepared live operation is concluded honestly without attesting partial work as complete; the exact
correction delta then runs as a disclosed fresh-context supplemental review, after which the existing Owner terminus
is the only path that may settle the member.

Routed out, not built here: a first-class local incremental carrier needs an exact prior/current review span,
incremental-size carrier selection, coverage retained through operation state and attestation, and a non-settling
lane result. That is review-orchestration design and is captured under `review-orchestration-right-sizing`. This
amendment adds only the no-silent-upgrade guard and no new record, source-order rule, convergence policy, or generic
control loop.

### Amendment 10 — terminal authoring waits for hosted publication (2026-09-04)

The first live Member 8 correction after the rescue was committed locally and the selector-free driver was resumed
before the work-unit branch was pushed. Local authoring readiness treated the clean descendant as ready and dispatched
terminal reconciliation; the existing exact-host guard then returned `top-request-mismatch`. No state was corrupted,
but the stop carried no new decision and its generic effect-failure text hid the missing publication step.

Decided behavior: before dispatching terminal reconciliation, the controller freshly observes the terminal request.
The exact local authoring head is ready; the prior state-bound request head returns the existing
`authoring-required` stop with explicit verify, commit, push, and resume guidance; any unrelated request head refuses
as moved. Content commits and pushes remain outside the driver's machine-owned record-effect exception. This is a
bounded submit-ready authoring repair under the rescue contract, not a new stop, automatic content publication,
standing approval, or generalized workflow mechanism.

### Amendment 11 — initial publication requires exact member gate evidence (2026-09-04)

After all eight member reviews settled, exact-head CI inspection showed Members 1–6 red, Member 7 green, and the
terminal member without a full rollup. The failures were deterministic boundary defects later members had repaired:
Members 1–2 shared the command-surface false positive, Members 3–6 shared missing canonical delivery-plan fixtures,
and Members 4–6 shared checkpoint/mock-isolation defects repaired in Member 7. The final union's green suite did not
prove those earlier cumulative trees independently shippable.

This violates D2/D2.1. The task loop did require Tier 2 before each closing member verifier, but ordinary completion
persisted only the criteria report and treated `[x]` as implying the gate run. Delivery eligibility verified clean
checkout coordinates around workflow-owned gates without consuming their outcome, and pre-publication review could
therefore compose every member target even when the gate step had been skipped or had gone stale. Publication is the
first hard correction seam: it creates the refs and requests that schedule hosted CI, so it cannot consult that CI
before mutation; review settlement and hosted checks correctly remain independent, while landing already refuses a
non-green exact head.

The bounded repair keeps both axes separate. Initial delivery eligibility close and publish consume one ephemeral
Tier 2 `passed` result for every exact candidate deliverable/head/tree, revalidating it against the same fresh
candidate observation used for publication. No result, mismatched coordinates, duplicates, reordering, or any
non-pass refuses before ref or host mutation. The evidence is an explicit caller report of zero-exit project gates,
not protection against a malicious caller, and it is never persisted. This preserves D7.7's no-store decision and
does not add a generic command runner. The current stack is repaired at the earliest failing cumulative boundaries
(Members 1, 3, and 4), then restacked while preserving the final union. Exact member Tier 2 runs prove each repaired
boundary before provider spend. Scheduling hosted CI as each member's review settles remains routed to
`ci-defer-heavy-reconciliation`; it is not pulled into this correction.

### Amendment 12 — conflict retries preserve their retained predecessor identity (2026-09-04)

The live Member 1 boundary repair reached Member 3's expected provider-history conflict after mechanically rebasing
Member 2. ARC anchored that exact temporary Member 2 commit and prepared Member 3's detached two-parent resolution
workspace. On retry, the provider recreated the same Member 2 contribution with a new commit identity before reaching
the same Member 3 conflict. Workspace adoption then compared the approved merge to the newly generated parent and
refused `conflict-resolution-mismatch`, even though the retained exact predecessor remained locally readable. Repeating
the provider replay could never satisfy the documented resume contract.

Decided behavior: conflict-candidate discovery treats an exact clean detached resolution workspace as the same
pre-reservation evidence source as an already-advanced named member ref. It derives the workspace's retained
predecessor chain only after the existing ordered-parent and object/tree checks. When a repeated provider collision
has independently recreated one of those mechanical members, recovery replaces that isolated temporary identity with
the retained exact candidate only when it proves the old member as first parent and the current exact predecessor as
second parent; later conflict-workspace adoption then consumes the parent it originally named. Missing, dirty, stale,
mismatched, or ambiguous evidence keeps the existing refusal and cleanup behavior. No remote ref, Delivery State,
review authority, new record, or generalized retry policy is added. Task 7.7.R.u.s owns the bounded repair and the
current Member 1 correction is its live acceptance.

_Forward clarification:_ The ordered-parent proof above applies to the attended resolution commit, whose first
parent remains the old member and whose second parent remains the refreshed predecessor. A provider-rebased
mechanical predecessor may instead be a single-parent commit. Reusing that predecessor requires its deterministic
candidate ref, an exact tree equal to the three-way merge result under the original base, and ancestry from the
current exact predecessor; only the attended resolution retains the exact two-parent requirement.

### Amendment 13 — exact-head Owner terminus dominates applicability replay (2026-09-04)

After all member review cycles had settled, Member 1 re-entry exposed another historical applicability offer at its
current repaired head. The boundary retained an Owner terminus for an older head and the Candidate retained several
earlier review attempts, so status correctly declined to carry the old exact-head authority forward. It then exposed
only the next binary applicability selection, however, even after the Owner explicitly decided that no further
review was required for the current head. Clearing every historical projection first would spend one attended
decision, record commit, push, and status recomposition per residual without changing the Owner's terminal decision.

Decided behavior: a non-conflicting `resolve-review-applicability` result may carry the same submit-ready exact-member
Owner-terminus offer as an ordinary next-pass result when the member has at least one completed complete review pass.
The workflow presents that terminus alternative first. Explicit acceptance revalidates and records authority for the
exact current member head and completed-pass count; on re-entry, the existing terminus discharge suppresses every
older replayable applicability projection for that member. If the Owner does not accept the terminus, the unchanged
applicability selection remains executable. Blocked or conflicting applicability, pending findings or settlement,
hosted request or await state, local continuation, zero-pass or incremental-only progress, and stale coordinates
retain their existing precedence.

This changes no applicability evidence: accepting the terminus does not classify an old residual as `covered`, and
it makes no clean, convergence, evaluator-satisfaction, or pass-sufficiency claim. No automatic later-pass
supersession, attempt chronology, new record, standing grant, generic workflow loop, or review-signal policy is
added. The deeper review-evidence-liveness question remains routed to `review-orchestration-right-sizing`; this
amendment only makes already-shipped Owner authority reachable before bookkeeping that its acceptance renders moot.

### Amendment 14 — committed Owner termini re-enter through terminal rebind (2026-09-05)

The live Member 1 acceptance recorded and pushed exact-head Owner terminus authority, then followed the documented
direct status re-entry. Status observed the advanced work-unit head before Delivery State carried that exact terminal
coordinate and returned stale terminal coordinates instead of the next outstanding member. The existing selector-free
correction driver then performed its machine-owned terminal rebind and immediately returned Member 3, proving the
mechanism was already complete and the defect was the workflow route.

Decided behavior: `recorded / commit-boundary` commits and pushes the exact terminus record, then resumes through the
existing selector-free correction driver so any owed exact terminal rebind precedes hosted status. `exact-replay /
continue` and `refused / rerun-status` still re-enter status directly because they create no new branch head. This is
a route correction only: no new state, driver behavior, Candidate renewal, review authority, applicability judgment,
convergence policy, or provider spend is introduced. Task 7.7.R.ae owns the workflow contract and focused regression.

### Amendment 15 — prepared native landing recovery and bounded fan-out (2026-09-05)

The first seven-member atomic landing preparation crossed the caller's 30-second execution window while serially
rechecking each member. Its process continued and persisted operation `a36abfee-c91e-46c0-87e7-30fb54f521c6`, but
the response was lost. A retry loaded the pre-reservation revision and later refused after the first process advanced
state. Canonical reconciliation then treated the reservation's null provider identity as a possibly lost synchronous
submission and returned `submission-before-persist-unresolved`. Fresh host inspection proved all seven exact heads
still open, draft, green, and unmerged; session history proved `land-submit` had never been invoked. The conservative
reducer was correct for a submitted effect, but the record could not represent the actual prepared-only state.

Decided behavior: native reservations persist both their selected `linked-single | linked-atomic` arm and a
`prepared | submitting` phase. A prepared reservation reconstructs the exact member/head set, consequence, and
submit-ready action and returns to the same integration interlock without host-effect observation. The submit path
does every read-only revalidation first, releases configured locks, then compare-and-set publishes `submitting`
immediately before provider submission; a failed phase write performs no provider call. A submitting reservation
without an identity retains the existing fail-closed recovery because the call may have crossed the boundary.

Preparation fans independent readiness reads out concurrently and returns every unready member/head in canonical
plan order. This directly removes the observed roughly three-minute seven-member serial wait and makes any refusal
actionable in one result. It does not parallelize provider mutation, add a retry loop, weaken per-member readiness,
or authorize landing. The current pre-release reservation is regenerated in the new shape from its exact selected
action; no compatibility reader or migration surface is added. Task 9.1.R.n owns the focused test-first repair and
the replayed live atomic preparation is its acceptance run before the integration interlock.

### Amendment 16 — native submit shares the prepared set's review boundary (2026-09-05)

The recovered seven-member preparation completed under one shared delivery-review conjunction, but its first approved
submit refused `fresh-set-refused` before lock release or provider mutation. Source tracing found the same defect one
layer later: final submission mapped the full review-status reducer over every reserved member instead of reusing the
set-wide readiness adapter. Polling, native-effect classification, all-landed state settlement, suffix reconciliation,
fresh position routing, highest-member teardown, and terminal checkpoint contain no further delivery-review reduction.

Decided behavior: the submission service requests one readiness result for the exact reserved set, and its production
adapter binds one routed delivery-review conjunction to concurrent exact request, head, and check observations for all
members. A mismatch still refuses before lock release, submission-phase persistence, and the provider call. One
built-CLI acceptance continues past the earlier pending-effect stopping point through effect settlement and the
existing teardown-to-terminal route, so preparation and provider submission are no longer separately proved halves.
The existing fresh `delivery position` continuation remains authoritative; no direct terminal action, new record,
review policy, generic control loop, storage change, or speculative lock-recovery mechanism is added.

### Amendment 17 — a prepared reservation cannot invalidate its own review revalidation (2026-09-05)

The D9.12 correction reached one shared review reduction, but the faithful live submit still refused
`fresh-set-refused`. The reduction itself used ordinary corrective review status. Native preparation had advanced
Delivery State from revision 453 idle to revision 454 with an active prepared operation, so continuation validation
returned `state-not-idle`; the newly committed WU correction also advanced the live work-unit head beyond the
Candidate coordinate. Reconciliation preserved the prepared operation, submit refused it, and Candidate attestation
refused while state was active, forming a typed deadlock before lock release or provider mutation. The prior E2E had
used `reservation: null` with no corrective continuation and therefore never exercised either production guard.

Decided behavior: only native submit for the exact current prepared operation may project review readiness through
the reservation. It first validates the active-operation revision and snapshot, plan and operation IDs,
`land / native / prepared` phase, and null effect identity. It then removes only that proven reservation from the
comparison, uses the operation's pre-reservation state revision, and projects Candidate currentness at the terminal
coordinate held by that state rather than the later work-unit head. The delivery-review conjunction is still reduced
once, and each selected member still gets fresh exact pull-request, ref, head, and required-check observation before
any lock release, state transition, or provider call. Ordinary review status remains blocked over the same active
state, so this is not a general stale-Candidate escape. A production-style E2E now carries a real hosted reservation
and corrective continuation, proves ordinary status blocks, advances the terminal head after preparation, submits
successfully through the narrow scope, and continues through effect settlement and terminal handoff.

### Amendment 18 — prepared review keeps the unselected terminal's historical target (2026-09-05)

The first D9.13 live retry again refused `fresh-set-refused`, still before lock release or provider mutation. Direct
scoped reduction showed `The retained delivery-member review targets are unavailable.` Fresh host inspection proved
PRs 550–556 remained at every exact prepared head with green checks, while PR 557 had correctly advanced from the
state-bound terminal coordinate to the newly pushed WU correction. The shared review conjunction enumerates all eight
members, so its generic target resolver rejected that terminal mismatch even though native landing affects only the
seven non-terminal members. The E2E had advanced local HEAD but left its fake terminal request at the old head, which
is why D9.13 appeared complete.

Decided behavior: the exact prepared-native projection retains the state-bound terminal head as the historical
review target when the terminal member is not among the operation's affected IDs and the same bound pull request
remains open on the same repository and ref. It does not reclassify, review, or authorize the later terminal content;
that content remains subject to the later Candidate and terminal-integration path. Every selected non-terminal member
still uses its freshly observed current request head and checks, and ordinary status retains its mismatch refusal.
The production E2E now advances both local HEAD and the fake terminal pull request before submit, and a focused unit
case proves only the exact terminal identity may retain its prepared historical head.

### Amendment 19 — native settlement consumes one aggregate merge commit (2026-09-05)

The first live native effect crossed the provider boundary and GitHub reported it `merged`. PRs 550–556 all closed
within six seconds, retained their exact authorized heads and authored bases, and reported one shared merge commit,
`d7f6f9ef73a91af1ea1fda8b181531cb23fa823e`; `main` advanced to that same commit. The commit has the exact
pre-effect protected base as first parent, the highest selected member as second parent, and the highest selected
tree. ARC nevertheless returned `ambiguous-result` because its post-effect observer tried to prove the shared commit
as each member's independent merge result. That model was exercised only by a fictional E2E fixture which created a
different sequential merge commit for every request.

Decided behavior: a multi-member `linked-atomic` settlement validates every selected request at its exact repository,
identity, head, authored base, and merged state, requires the complete set to name one common merge commit, and proves
that aggregate commit once against the highest selected head and protected-target ancestry. Divergent merge commits,
partial closure, invalid aggregate structure, and contradictory effect status remain closed refusals with the
reservation intact. The production E2E now emits the live provider shape and separately proves divergent coordinates
remain ambiguous. No provider-general result model, sequential fallback, or new recovery authority is added.

### Amendment 20 — landed bindings are not outstanding review evidence (2026-09-05)

After aggregate settlement, Delivery State revision 457 correctly retained PRs 550–556 for teardown and moved the
protected target to `d7f6f9ef73a91af1ea1fda8b181531cb23fa823e`, whose tree equals the highest non-terminal
member's cumulative tree. The integration entry seam nevertheless selected PR 550 as the first member “still under
review” solely because its request binding remained present. That produced `correction-route-ambiguous` for the
terminal correction commits, made `delivery position` bounce into an idle correction driver, and prevented both
session-init locus resolution and compaction recovery. The retained binding was real but its interpretation was not:
teardown requires it precisely because the member has already landed.

Decided behavior: outstanding-member selection ignores the plan-ordered prefix through the highest non-terminal
member whose cumulative tree is now the protected target, then selects the first bound request above that prefix.
This keeps a partially landed stack's next member actionable while making a fully landed non-terminal set route a
non-current terminal Candidate directly to verification closeout. The focused selector and entry tests pass, and a
live dirty-tree acceptance changed the entry to `candidate-verification-required`; session-init then wrote a fresh
seed and `recover audit` returned `ready` for the exact checkout and dirty path set. Position and teardown remain
responsible for fresh provider state, so this seam gains no merge or review authority.

### Amendment 21 — terminal closeout must not reconstruct hosted or sequential work (2026-09-05)

After the verified terminal correction and Delivery State rebind, session-init still projected
`hosted-review-pending / continue-hosted-review` even though the retained records were Owner termini and the Owner
had directed that no further review run. The read-only status command then selected already-landed PR 550 and
reported its merged request as `base-moved`. The cause was not new review signal: target resolution rebound the
first merged member's historical span to the new post-landing Candidate base. That reconstruction is required when
sequential landing rewrites state coordinates, but it is false for the native aggregate result, which retains the
exact authored member chain while advancing the protected target once.

Decided behavior: delivery reservations use a provider-neutral continuation locus and action. The command reduces
the retained conjunction; only its returned hosted-request action represents provider work. For merged members,
exact equality between retained state heads, observed request heads, and the complete authored predecessor chain
preserves the stored member bases. Any changed coordinate retains the existing sequential reconstruction. A
same-Candidate stale continuation routes to ordinary attestation before a subject-digest mismatch can fabricate a
hard stop; attestation alone validates and writes the renewal.

The first live teardown separately refused because PR 556 correctly retained its authored predecessor branch as its
base after native aggregate landing. Teardown now accepts a closed set: the protected target and, only for the exact
selected landed member, its immediate predecessor ref from the coherent plan/state chain. Initial validation, final
reobservation, and interrupted-operation recovery derive the same set. This adds no provider-general base policy,
review verdict store, convergence rule, or standing authority; the live Owner decision is recorded through the
existing exact terminus offer before teardown resumes.

### Amendment 22 — terminal settlement is status resolution, not review continuation (2026-09-05)

The first provider-neutral correction still named its durable locus `delivery-review-continuation` and told the
operator to `continue-delivery-review`. That was more accurate than `hosted-review-pending`, but it remained false at
the live terminal point: every member's review had been explicitly Owner-settled, and only the exact terminal-head
record still needed durable reduction before teardown. No new pass or review judgment remained.

Decided behavior: the canonical boundary is `delivery-status-required` with `resolve-delivery-status`, exposed to
entry as `deliveryStatusAction` and carried through correction as `delivery-status`. The same work-unit reducer may
return a review action earlier in a delivery, but the boundary itself claims only that status must be reduced. Only
an exact downstream `review-hosted-request` authorizes provider work. At this terminal point the reduction should
return settled immediately and hand control to position and teardown after the already-directed exact Owner terminus
is recorded. The exact older delivery-shaped `hosted-review-pending` record remains a read-only normalization input;
canonical writes use the neutral shape.

### Amendment 23 — changed-Candidate verification must remain a recoverable integration frame (2026-09-05)

The first compaction after the terminal terminology correction could not write a seed: the Candidate was correctly
non-current and delivery entry correctly returned `candidate-verification-required`, but checkout projection first
required the stored boundary to match the older durable Candidate subject. That guard nulled `sessionType`,
`workflow`, and the load set before delivery entry could select verification, so recovery stopped with “Selected
entering work-unit projection is incomplete.” Manually restoring the boundary would have hidden the actual state and
made the next compaction vulnerable to the same failure.

Decided behavior: a non-current Integrating Candidate with a structurally closed task list may retain the integration
session and load `verify-work-unit` only when the independent delivery-entry reducer returns
`candidate-verification-required`. The projection carries `integrationBoundary: null`, so it revives no stale review,
publication, or merge authority; all other missing or mismatched-boundary states remain unresolved. Candidate
attestation continues to revalidate the exact public delivery continuation before it writes anything. Focused unit
coverage proves both arms, and the rebuilt live CLI wrote a fresh seed and returned a ready recovery audit for this
exact checkout, head, workflow, closed cursor, load set, and dirty path set.

### Amendment 24 — base movement must not suppress an exact Owner terminus (2026-09-05)

The renewed terminal Candidate correctly retained seven discharged members and selected only Member 8 as
outstanding. The Owner had already directed that no further review run, and Member 8 retained two completed complete
passes, but status returned only `base-moved / rerun-checkpoint`; the terminus binder admitted review requests,
applicability offers, and ceiling stops but not that mechanically earlier result. Checkpoint then needed the stale
terminal binding rebound before it could recognize PR 557's still-valid stacked base, so it stopped
`unsafe-reconcile`. The stop carried no new decision and routed around the required teardown sequence.

Decided behavior: `base-moved` remains a checkpoint rerun by default, but WU-scoped delivery status may attach the
same submit-ready exact-head Owner-terminus offer when the first outstanding member has a completed complete pass.
Explicit acceptance settles only review for that member and head; it does not attest base currentness, CI, or merge
readiness. Zero-pass and incremental-only progress remain ineligible. The existing terminus commit and correction
continuation then own terminal-coordinate rebind and delivery-position re-entry, restoring the intended
status → Owner terminus → rebind → teardown → retarget → checkpoint order without new authority or review spend.
