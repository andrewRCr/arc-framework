# Draft: Delivery Correction Convergence

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-09-09); split from stacked-delivery correction-path
  dogfooding after `plan-segmentation` shipped.
- **Purpose:** Make a reviewed stacked-delivery correction converge across normalized rematerialization, public
  boundary renewal, machine-owned applicability effects, and hosted-response replay without weakening exact-head
  review authority.

---

## Inbound Buffer — Pending Integration

### `[ ]` **Give a singleton a reachable remedy when its own record writes stale the publication boundary**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: delivery-correction-convergence`

- _Observation:_ This draft already names the mechanism for a stacked delivery — "persisting either `review-required`
  or record-only `covered` applicability moves the terminal head and immediately reopens applicability over the record
  effect itself, creating a self-invalidating loop even though the base did not move". The same loop fires on an
  **ordinary singleton with no delivery plan**, and there it has no exit. Observed live: a criterion-driven reviewable
  change landed after `arc publish`; the checkpoint refused `candidate-publication-stale`
  (`checkpoint-composition.ts:1201-1209` compares the boundary's `candidateSubjectDigest` against the recognized
  target's subject digest); and the offered `resume-pre-publication` remedy requires an active meta that the archive
  sweep had already removed. The sibling arm built for a shipped work unit, `refresh-shipped-delivery`, is
  delivery-only and requires a `delivery-status-required` locus that a singleton never holds.

- _The sharp form:_ the ceremony's own bookkeeping commit — the one recording the Owner's `covered` applicability
  selection — is what invalidated the boundary the checkpoint needed. Every remedy for that state writes another
  record.

- _Why this draft rather than a new one:_ the mechanism is identical and this work unit already owns public boundary
  renewal and machine-owned applicability effects. The design's own consolidate-by-mechanism rule directs one owner
  per mechanism rather than one per boundary. What is new is the singleton arm, not the failure.

- _Approach:_ carry the singleton case into the same convergence path — either an arm that renews a publication
  boundary for a work unit already swept to `completed/`, or a rule that machine-owned record-only effects do not
  restale the boundary they were written to satisfy.

- _Evidence:_ `concurrent-integration-characterization` PR #629, merged at `7ca98e1c9` under explicit Owner
  authorization because no typed route to a `ready` checkpoint existed. Base unmoved at `cbf075da7` throughout;
  Candidate `sha256:4b669fca…`, subject advanced `f78db4bf…` → `4cdee44f…`.

- _Failed workflow-only slice:_ PR #634 tried invoking the final checkpoint before the archive sweep. Source
  verification proved that route cannot work: after the completion commit but before its push, local and public
  heads differ and the checkpoint returns `unsafe-reconcile`; after a push but before `with-integration` archival,
  lifecycle state is still incomplete and the publication read is never reached. The PR was withdrawn with a
  zero-file diff. Do not reintroduce an early invocation or reinterpret either refusal as clearance.

- _Forward-compatibility:_ recovery authority must bind typed Candidate and lifecycle records rather than whether a
  Markdown projection currently lives under `active/` or `completed/`. Coordinate the durable continuation with
  `operational-state-docs`, which owns storage-agnostic lifecycle access and integration-resume derivation; DCC still
  owns the convergence behavior itself.

- _Sequencing:_ `RELEASE-GATES.md` places this work unit third and says "promote earlier only if an active correction
  hits this exact blocker". An active integration hit it on 2026-09-15 and had to merge outside the checkpoint, so the
  promotion trigger this map wrote for itself is now satisfied. Weigh that against
  `delivery-post-landing-conflict-recovery` holding the first slot.

- _Not `delivery-post-landing-conflict-recovery`:_ considered and rejected on its own text. Its trigger is a landed
  delivery member whose retained suffix, terminal binding, or base-history shape leaves the exact-head comparison
  unsatisfiable — none of which a singleton has — and its boundary excludes "unrelated prepublication authoring and
  review-fix convergence", which is the half this failure lives in. The echo is real but narrow: its purpose warns
  against letting an Owner authorization become a general escape contract, which is how this landing was made. That
  is the shape of the escape, not the mechanism that forced it.

- _Captured during:_ `concurrent-integration-characterization` integration, 2026-09-15.

### `[ ]` **Converge record-only terminal rebind without a fictitious review-fix task**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: delivery-correction-convergence (planned)`

- _Observation:_ After `evidence-applicability` re-rooted its Candidate at `f98ef4864`, the only new bytes were
  managed Candidate and meta records. Terminal delivery rebind nevertheless created
  `pendingReviewFixVerification` for Member 3, although there was no authored review fix or correction task.
  The typed continuation required a fresh member-criteria walk and Tier 1 over that exact tree; acknowledging the
  marker then automatically committed and pushed another two-file Candidate-boundary update (`8bdb5f116`) and
  rebound the terminal coordinate. This is disproportionate ceremony for proved machine-only movement and makes
  the continuation's head-changing effects hard to anticipate.

- _Approach:_ include record-only Candidate re-root and terminal rebind in the planned correction-convergence
  design. Distinguish machine-owned coordinate movement from a behavioral review fix before creating a review-fix
  verification obligation; expose any automatic boundary commit and push in the typed continuation. Preserve
  exact-target binding, real changed-member verification, and review authority when source content changes.

- _Captured during:_ `evidence-applicability` published three-member delivery integration, PR #620, 2026-09-13.

### `[ ]` **Keep pre-terminal delivery status observable during staged top corrections**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: delivery-correction-convergence`

- _Observation:_ On `evidence-applicability` head `1118f2f2b`, `arc review status --work-unit` selected exact
  Member 2 PR #619 and returned `review-local-prepare` despite classified overlapping base movement. Staging the
  same six-file top-branch correction, without moving HEAD or Delivery State, instead selected terminal PR #620 and
  returned `status-unavailable` because the owning Candidate was not current. Unstaging restored the M2 action;
  restaging reproduced the block. The index alone changed which member status could observe.

- _Source boundary:_ `projectGitCandidateEffectiveTarget` treats the work-unit index as a staged Candidate delta;
  `readRoutedObligation` then blocks before composing the delivery conjunction, so work-unit status uses its
  terminal fallback target. This is truthful about the unapproved top delta but conflates it with an unchanged
  pre-terminal member's review status.

- _Approach:_ in the planned public correction/currentness design, preserve exact selected-member status while
  reporting the pending top Candidate delta separately. Never treat staged bytes as approved Candidate evidence,
  review clearance, or merge authority; a changed member, ambiguous binding, or terminal action still fails closed.

- _Boundary:_ public delivery status during top-branch correction, not a generic ignore-index rule or a new
  Candidate re-root operation. Coordinate with the existing record-only boundary-renewal concern above.

- _Captured during:_ `evidence-applicability` pre-terminal status correction, 2026-09-14.

### `[ ]` **Keep delivery review-fix continuation reachable across a moved terminal top**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: delivery-correction-convergence`

- _Observation:_ With approved Member 2 PR #619 findings at head `05a57a719`, `arc delivery review-fix continue`
  refused `review-fix-position-unavailable`. Its `readLandedDeliverableIds` calls `arc delivery position`, which
  refused `review-fix-routing-required` because terminal state revision 32 still names `1118f2f2b` while the clean
  Work Unit checkout and open top PR #620 both name append-only head `0b3ed3c07`. The position refusal points back
  to review-fix planning, but the correction driver treats it as no position and stops before its terminal-rebind
  path or selected-member authoring. Direct `arc delivery review-fix plan` still selected the exact M2
  `provider-refresh` route. No member content was authored.

- _Approach:_ make the correction driver resolve or return a typed terminal rebind before requiring a landed-prefix
  position that terminal movement blocks, or let position expose the exact selected-member prefix without granting
  terminal clearance. Preserve revision-checked state publication, exact reviewed-member binding, and refusal on
  ambiguous or substantive top movement. Test the record-only top-advance plus approved M2 response path through
  the successful authoring route, as well as refusal cases.

- _Boundary:_ public delivery correction convergence; coordinate with the record-only terminal-rebind and staged-top
  status captures above. Do not make a new Work Unit prerequisite for EA's bounded live recovery.

- _Captured during:_ `evidence-applicability` Member 2 review response, 2026-09-14.

### Honor correction proof and supersession contracts during rematerialization

_Routed from `USER-INBOX § Errand`, 2026-09-09._

After record-to-coordinate projection was corrected locally, delivery suffix rematerialization refused only the
owning work unit's lifecycle paths. Canonical state binds the terminal member to the lifecycle-bearing work-unit
top, while eligibility deliberately closes its private candidate with those paths restored to the protected base.
Raw mechanical reapplication therefore contradicts the rematerializer's own normalized-completeness contract
before an otherwise-valid review fix can reserve. The design must settle how the already-derived lifecycle-path
group composes into terminal carry proof while every non-lifecycle divergence continues to refuse.

The first public member review exposes three related convergence failures:

- A correction verification acknowledgement requires the source boundary to have already advanced from
  `publication-pending` to `delivery-status-required`, but no documented transition establishes that future locus
  before the first correction.
- Persisting either `review-required` or record-only `covered` applicability moves the terminal head and immediately
  reopens applicability over the record effect itself, creating a self-invalidating loop even though the base did
  not move.
- Those later machine-owned Candidate-record commits make the durable correction target appear stale before the
  already-approved hosted response can replay.

Define one coherent correction path from rematerialization through verification acknowledgement, applicability
selection, record persistence, and final review request. Carry currentness across only proved machine-owned
record effects, keep the operator's selected outcome intact, and preserve the verified fix-response target across
the same exact record-only segment. Neither carry may represent a behavioral source delta as reviewed, and typed
operational refusals must remain distinguishable from unexpected executor failures.

---

## Pinned probes waiting on this work

`concurrent-integration-characterization` left two probes holding this boundary's behavior as it stands. They
**pass today** and the suite is green; each fails the moment the behavior changes, printing the sentence that
names what the probe was waiting for and the exact replacement:

> This now produces the result it was waiting for, so the hold is spent: replace this call with a plain
> assertion on `<result>`.

Retiring them is part of this work's scope rather than a regression — a fix here cannot merge while one is red,
and each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary.

- `delivery-position.test.ts` — "resumes the bound chain at a terminal top that advanced by an append-only commit"
- `delivery-terminal-recovery.e2e.test.ts` — "routes a record-only advance past the head the terminal binds"

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behavior neither shape names. That is a finding, not a retirement. The recorded
observations and the reasoning behind each awaited result are in
`notes-concurrent-integration-characterization.md` § Characterization ledger.
