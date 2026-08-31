# Notes: delivery-native-stack-composition

## Contents

- [Comparator vs plan-semantics fingerprinting](#comparator-vs-plan-semantics-fingerprinting)
- [Applicability: contribution equivalence versus path carry-forward](#applicability-contribution-equivalence-versus-path-carry-forward)
- [Success Criterion 18 — why it was re-cut](#success-criterion-18--why-it-was-re-cut)
- [Member checkouts and recovery authority](#member-checkouts-and-recovery-authority)
- [Corrective integration and member-only review](#corrective-integration-and-member-only-review)
- [Corrective transition audit boundary](#corrective-transition-audit-boundary)
- [Authored partitions and adversarial attention](#authored-partitions-and-adversarial-attention)
- [First adversarial pass amendments](#first-adversarial-pass-amendments)
- [Second adversarial pass amendments](#second-adversarial-pass-amendments)
- [Refresh and native-landing lifecycle audit amendment](#refresh-and-native-landing-lifecycle-audit-amendment)
- [Hosted-review authority audit amendment](#hosted-review-authority-audit-amendment)
- [Live GitHub Stacks API observation](#live-github-stacks-api-observation)
- [Guard-test digest history](#guard-test-digest-history)
- [Consumed `integration-boundary-accuracy` substrate](#consumed-integration-boundary-accuracy-substrate)

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

Two adjacent concerns do not enter this batch. Ordinary singleton withdrawal can retain a stale public boundary and
needs lifecycle/review ownership beyond bound stacked delivery. A general reusable scenario runner belongs with
composable workflow and review-architecture evolution after these concrete production seams have executable tests.

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
