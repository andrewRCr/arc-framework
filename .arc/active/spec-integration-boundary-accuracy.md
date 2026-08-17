# Spec (`detailed` · `RFC`): integration-boundary-accuracy

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 9) at its 2026-07-26
  formalization-readiness read.

- **Purpose:** Correct the integration boundary's procedural surfaces where they misdescribe what they do, and
  relocate the determinism they carry as prose into typed verbs that can enforce it — leaving the workflow's stops,
  and only its stops, in prose.

---

## Introduction / Context

The final integration step is the corpus's highest-density imperative surface, and four of its procedural surfaces
are truthful about the system while misleading about themselves:

- The **integration interlock** renders everything it verified — a nine-part surface — rather than what the approver
  decides on.
- The **lifecycle verb** `arc integrate` is named for its phase's content rather than the scheduling act it
  performs; its own help string disclaims the reading ("marks phase entry, not the merge").
- The **`Integrating` transition** fires before submission begins while the state is documented as if a pull
  request already exists. The missing distinction is between an implementation attested as reviewable, the
  configurable private review interval, and public integration.
- The **`Coverage` field** in the public pull-request record reports on the review process rather than on the
  change, addressing a reader who has no model for its vocabulary.

Underneath them is the substrate defect: the final integration step carries roughly 170 lines of machine-decidable
sequencing encoded as prose (the errand lane's ship block roughly 230 more), which no surface can describe
accurately because prose cannot enforce a sequence. `strategy-procedure-evolution` Principle 1 names this
anti-pattern and illustrates it with a one-line condition; this is the same pattern at whole-step scale. And the
substrate accretes: the merge-lock protocol contributes a re-lock obligation restated across every exit path — a
`try/finally` written as a prose invariant the stochastic interpreter must carry — plus its release/hold dispatch
narration.

These resolve as one work unit because the fixes interlock: the verb rename is a precondition for naming the new
verbs, the fire-point correction is what makes the rename true, and relocating the determinism is what lets the
interlock's surface be composed rather than narrated.

The cost is not carried-and-skipped load. The workflow loads only when integrating, and every line applies when it
does. The cost is execution fidelity under a stochastic interpreter, and it worsens with accretion because prose
constraints do not compose: each added imperative dilutes the attention available to the others. The remedy is
therefore relocation, not relaxation — loosening deterministic constraints would trade a fidelity problem for a
correctness one.

### Inventory this design is priced against (verified 2026-08-12)

Every existing-surface reach claim below is counted from source, not characterized. New mechanisms are enumerated
by owning source family after the table rather than assigned a false pre-implementation file count.

**Counting convention (uniform):** counts are of **`.arc/**` and `packages/arc-framework/src/**` loci**. Doc rows do
**not** double-count the `packages/arc-framework/arc/**` mirror — every `.arc/**` doc edit has exactly one packaged
counterpart, so multiply doc counts by two for edit volume. Test files are counted separately from source.

| Surface                                        | Count                   | Loci                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Coverage` prescriptions (review-record field) | 5 sites / 3 files       | `template-pull-request.md` ×3 (skeleton, section guidance, optional-sections guidance); `integrate-work-unit.md` ×1; `run-errand.md` ×1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PR-state branch sites                          | 5 sites / 2 workflows   | `integrate-work-unit.md` ×4 (resume guard + fallback, pre-create hook skip, review-entry resolve, merge skip); `run-errand.md` ×1 (pre-create enumeration + four-row table over a raw paginated query)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pre-merge` fire instructions in `run-errand`  | 2                       | one ahead of the `## Review` composition, one after approved-head retention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `integrate` verb-name surfaces — source        | 5 files                 | `lifecycle-transitions.ts` (the authoritative `VERBS` registry, the `integrate` transition edge, `reopen`'s `inverse`, the illegal-cell table); `verbs/dispatch.ts` (`CONTEXT_DEFAULTING_VERBS` + its kind map); `cli.ts` (registration); `handlers/lifecycle.ts`; `lib/work-unit/verbs/integrate.ts`                                                                                                                                                                                                                                                                                                                                                                                         |
| `integrate` verb-name surfaces — docs          | 5 files                 | `integrate-work-unit.md`; `reopen-work-unit.md` (names `integrate` as the verb whose field reset it inherits); `QUICK-REFERENCE`; 2 backlog drafts (`wu-lifecycle-state-model`, `roadmap-tooling`) — the last two are forward-references, not invocations                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tests reaching the `integrate` verb/command    | 5 files                 | `verbs/integrate.test.ts`, `verbs/dispatch.test.ts`, `lifecycle-executor.test.ts`, `handlers/lifecycle-verbs.test.ts`, `command-input/repository-inventory.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tests pinning rewritten workflow prose         | 4 verified, more likely | Assertions verified line-by-line: `review-driver-lifecycle.test.ts` (`Coverage` present in both copies; the three `arc merge lock` invocations; `arc review readiness -`), `pr-open-extensions.test.ts` (`pre-merge` ordering, freeze-window text), `review-gate-workflows.test.ts` (merge pseudocode verbatim, head-retention, sole-merge-authority, push→CI→`pre-merge` order, errand auto-merge `--auto … --match-head-commit` shape), `integration-reconcile-workflow.test.ts` (interlock callout text). Not yet audited, but reference the rewritten workflows: `review-gate-packaging.test.ts`, `archive-staging.test.ts`, `framework-sync.test.ts`, `unit/load-set/projection.test.ts` |
| `arc merge lock` fire sites in workflows       | 2 workflows             | `integrate-work-unit.md` (resolve at PR open, release before merge, the re-lock arms on non-merge and nonzero-merge exits); `run-errand.md` (resolve at PR open, release before the auto-merge and reviewed-lane arms, the matching re-lock arms)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Integrating` fire-point record                | 1                       | the `State` table in `strategy-work-organization`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The new Candidate slice extends the managed WU/lifecycle-tail record family, verification-finalize verb family,
review-response evidence and policy driver, and status/session-initialization projection; it adds the `propose`
command at the lifecycle handler/dispatch boundary. Checkpoint, PR-resolution, checks-await, base-merge,
review-status, and merge-method commands are new surfaces in their named command families. Task generation must
ground the exact file inventory for those additions rather than treating this table as their implementation map.

**The `Coverage` cut is field-scoped, not string-scoped.** Three unrelated `Coverage` families must survive: the
`standard-review` rubric dimension, `generate-tasks`' task-list validation property, and `DEV-RULES.PROJECT`'s test
coverage expectations. A string sweep breaks all three.

Every `.arc/**` edit doubles into `packages/arc-framework/arc/**` per the two-copy discipline. Archived
`completed/**` artifacts are historical records and are **not** swept.

## Goals

1. **The final integration step reads as cadence, not as a program.** Every stopless run is a verb call; what
   remains is the stops in order, each with the invariant that guards it.
2. **The machine-computed interlock surface is exception-filtered by the composer**, not by agent discretion — a
   clean candidate renders what the approver decides on, while free-form extension evidence remains a separately
   identified surface.
3. **Each corrected surface describes what it does** — `propose` attests a reviewable implementation, `submit`
   schedules it for publication, `Integrating` means submission/public integration is underway, the approval pin is
   enforced rather than narrated, and the public pull-request record reports on the change rather than on the review
   process.
4. **No agent hand-rolls a wait, a parse, or a merge-method discovery** at either integration boundary.
5. **Determinism is relocated — or deleted where enforcement already exists — without losing a logical control
   obligation.** Every interlock release and extension seam present today survives; duplicate enactments of one
   seam may collapse to one fire; and an obligation whose failure the host-enforced pin or an existing typed
   reader already covers may be deleted outright, each deletion enumerated with the covering enforcement named.
   Obligations are priced against the chartered threat — accidental agent error and single-operator concurrency,
   plus the one observed human threat the merge lock guards — never against hostile concurrent mutation. Four
   relocations are authorized: B6 moves the work-unit `pre-merge` fire later, B6 replaces `run-errand`'s duplicate
   enactment with one fire at that shared position, F moves the transition's `commit-interlock` release from entry
   to submission, and B2 absorbs the merge-lock release with re-lock as its fail-closed exit path. No other
   control obligation moves or disappears unenumerated.
6. **Routine operation becomes simpler, not more ceremonial.** The no-review path adds no command, commit,
   approval, or agent-decision count; source order, pass ceilings, Candidate lineage, resume selection, and
   projection-only drift are CLI-owned.

## Non-Goals

- **Restructuring the remainder of the integration workflow.** `composable-workflows` owns the corpus-wide
  authoring pattern; this work removes determinism and does not reshape what is left.
- **Generalizing the interlock-surface treatment to every workflow interlock.** One dogfooded instance, under the
  remove-determinism boundary.
- **The rest of `wu-lifecycle-state-model`.** This work pulls forward only its tail-end artifact attestation:
  Candidate is a projection, not a fifth lifecycle `State`. Preactivation `Ready`, readiness decay, activation
  mechanics, placement-as-record, terminal vocabulary, and the general storage substrate remain deferred.
- **Superseding `merge.strategy`.** It stays authoritative over what the project wants; the repository's
  merge-method allowances are authoritative over what the host accepts.
- **Re-running full verification after every review fix.** Delta verification is primary-owned and
  consequence-scaled; one converged Tier 3 attests a changed implementation after review, rather than multiplying
  full verification and adversarial passes by the number of fixes.
- **A deprecation or alias window for the renamed command.** Pre-public-release, no external callers.
- **Repository-side CI trigger policy.** When heavy CI starts — at pull-request open, on review state, via
  labels — is host policy owned by the repository's own workflow configuration (here, the
  `ci-defer-heavy-reconciliation` concern). B8 makes the boundary contract honest about _awaiting_ checks
  wherever the project chose to run them; it does not choose for the project.
- **Errand-tail CLI surfacing and teardown drivers.** Making a left errand visible and mergeable on session-init,
  the local-branch-ref question in `arc errand leave`, and remote-branch teardown at close are errand-lifecycle
  code concerns routed to their own captures. Element I fixes only what the ship path's prose instructs.
- **Narrating less of `arc teardown`.** Step 14's mechanics narration is a real verbs-over-mechanics debt, but it
  sits outside the integration boundary's accuracy defects; the corpus-wide conversion owns it.

## Proposed Design

### A. The boundary rule — what may be absorbed

**A verb may absorb a span only if the span is _stopless_.** A stop is any point where control must return to the
agent, and there are exactly three kinds:

| Kind                     | Why it resists absorption                                  |
| ------------------------ | ---------------------------------------------------------- |
| **Judgment leaf**        | No machine-decidable form                                  |
| **Interlock release**    | A user control point, configurable per project             |
| **Extension fire point** | Project-authored free-form actions no CLI verb can execute |

They differ in why they resist but not in whether they do. Treating only judgment as the boundary is the error that
makes a verb look larger than it can be.

**A mechanical yield is not a stop.** The three kinds share one property: the agent must supply something no verb
can. A bounded wait returning at its deadline supplies nothing — the caller resolves it by re-invoking the same call
unchanged — so a deadline return does not break stoplessness.

This rule is the design center; every cut below derives from it rather than being argued separately. It also
retro-explains the control: `verify-work-unit` is clean because it has one stop and no determinism between.

### B. The integration spine — two verbs around one human stop

The two spans that are stopless are the ones on either side of the human.

**B1. `arc integrate checkpoint <name> --json`** absorbs the pre-stop sequence: the authoritative drift read and its
validation, the reconcile decision, lifecycle and cadence resolution, and the readiness envelope. It returns one
typed verdict:

- **`ready`** — carrying the approved head, a checkpoint handle (B3), the candidate-tail diff reference, the
  requirement and status summary, the validated merge method, and the composed review record.
- **`reconcile`** — carrying the drift verdict; routes to the orchestration path in C.
- **`blocked`** — carrying a typed reason.

B1 treats E4's converged exact-head full attestation as a readiness prerequisite whenever the current Candidate
lineage contains an implementation-changing review response.

**B1 composes lifecycle readiness itself; the standalone forensic read shrinks.** Today the final step conjoins
three independent readers of lifecycle truth — the status projection, the archive sweep's products, and a
readiness verb that treats the operator's own checkout as untrusted (symlink, escape, and duplicate-artifact
forensics). The forensic posture guards no chartered threat — the checkout is the single attended operator's own
— so B1 reads lifecycle completeness from the status projection directly, and `arc review readiness` shrinks to
the thin completeness read its remaining consumers (merge-lock release gating, the delivery-member vehicle, the
local lanes) actually need. The shrink is contract-preserving for those consumers: their request and envelope
shapes and semantics do not change, and any consumer-visible narrowing is a defect, not a cut. One reader per
fact; the checkpoint envelope is where the facts compose.

**B2. `arc integrate merge <name> --checkpoint <handle> --json`** absorbs the post-approval sequence: execute the
approved settlement plan, recompose and compare the head against the approved value, re-read status, release the
merge lock, await required checks on the exact head, revalidate the merge method, replace the review summary, read
final drift, and perform the pinned merge. It returns `merged`, `invalidated` with a typed reason,
`awaiting-checks` (D2's mechanical yield), or `blocked`. It fails closed on any mismatch, and every
approval-voiding exit re-locks before returning (D2).

The span is stopless, but the workflow's own declaration does not prove it: that declaration is bounded to
final-drift-read → merge, a strict subset of what B2 absorbs. The wider span needs its own argument, and it is
one line — every step between approval and the final drift read is a machine action over canonical state (execute
the approved plan, recompose, compare, re-read status, release the lock, await checks, replace the summary).
Settlement applies decisions the approver already authorized; the lock release enacts the publication that
approval scheduled; replacing the stale PR summary posts text the checkpoint already composed. Neither decides
anything. No judgment leaf, interlock release, or extension fire point falls inside.

**B3. The handoff carries the checkpoint's composition and settlement plan verbatim; nothing is rederived.** The
merge verb must post the `## Review` record the approver previewed and execute the final dispositions and channel
settlements that approval authorizes. The approved disposition set is the shared input to both products; a redirect
routes to composition correction and a fresh checkpoint.

> _Amended 2026-08-15 — per § G's review-record reduction._ The record half of the sentence above no longer
> applies: there is no composed `## Review` record, so the merge verb posts nothing and the composed record leaves
> the digest, the checkpoint composition, and the merge verb's responsibilities entirely. B3 governs the
> **settlement plan** alone. The proportionality reading behind the split: the settlement plan is authority and the
> record was prose, and bundling them applied plan-grade rigor — digest binding, verbatim posting, invalidation on
> drift — to advisory content.

- The canonical settlement plan binds the exact originating and fix targets, actor, finding and thread identities,
  dispositions, and reply content needed by the existing source settlement APIs. The handle is the approved head
  plus a digest over that plan, the composed review record, and the validated merge method. **The digest is
  load-bearing, not ceremony:** the head alone cannot distinguish two checkpoint runs at the _same_ head, which
  B6's retry-safe seam re-fire can produce.
- The composed record, settlement plan, and validated merge method persist **verb-side**, keyed by the handle, in
  gitignored per-WU state. They are not agent-carried values or meta-file content.
- B2 executes the persisted plan idempotently before recomposing the head. `settled` and `already-settled` continue;
  missing, stale, ambiguous, or actor-mismatched settlement returns `invalidated` before release or merge. B2 never
  rebuilds the plan from mutable threads or agent narration.
- **No additional invalidation machinery.** Any input to the record that could change outside the approval either
  moves the head or unsettles PR state, and B2 already fails closed on both.
- **Not carried:** the candidate-tail diff and the seam's extension report — interlock surface, consumed by the
  human before the stop.

**B4. The merge method resolves as a configured preference validated against the repository's merge-method
allowances.** A selection those allowances disallow stops with both values named rather than being silently
rewritten. **The validation belongs on both lanes and at both work-unit decision times**: the observed 2026-07-26
failure occurred on the errand lane, while host policy may also move between checkpoint and merge. D3 therefore runs
in the errand lane before auto-merge, in B1 before the interlock, and again inside B2 immediately before the final
drift read. B2 requires the revalidated method to equal the checkpointed method; policy movement returns
`invalidated`, never a silent substitution.

_Amended 2026-08-17 — host-evidence scope._ The validated surface is the repository's own merge-method allowances
(`allow_merge_commit` / `allow_rebase_merge` / `allow_squash_merge`), which the original "ruleset" wording
overclaimed. **Residual:** branch-level rules — `required_linear_history` foremost — are unread, so a method these
allowances admit can still be refused at the merge attempt under a branch-scoped restriction. Closing that needs a
branch-rules read, which this work unit does not carry.

**B5. Machine-surface discipline lands as precomposed text, not as an instruction.** The checkpoint envelope carries
its machine-computed interlock surface already composed and exception-filtered — clean signals collapsed to a line,
unclean ones expanded. A rendering rule in markdown is untestable; the same rule in a composer is a unit test away.

**B6. The `pre-merge` seam fires between `checkpoint` returning `ready` and the integration-interlock stop** —
verb-independent, so the work-unit and errand paths share one fire point. `run-errand`'s two fire instructions
collapse to a single fire at that shared position. The position sits later than today's work-unit placement; diff
and review-record composition author no head update, so the extension's contract holds at either position and the
later one strictly shrinks the window between the seam and merge authorization.

**B7. Composer authority stops at machine-computed evidence.** The seam's actions report checks, conversations, and
requirements after the verb composed its surface, and their free-form output cannot honestly be exception-filtered
by that earlier composer. The checkpoint envelope therefore reserves a typed insertion boundary, not a claim of
content ownership: the workflow renders any extension report as a separately labelled block after the precomposed
machine surface. It does not splice or summarize the report. A future typed extension may opt into composer
filtering; free-form actions remain visibly extension-owned.

**B8. Required checks are awaited where they actually run — inside the merge verb — and nowhere earlier.**
Whether a project runs CI at pull-request open or defers its heavy legs until review settles is host policy,
owned by the repository's own workflow configuration and review-state automation (a Non-Goal here). The boundary
contract stops assuming: no prose step treats checks as already green at the interlock — the interlock surface
reports check state as observed — and B2's await-required-checks arm is the single place the work-unit lane waits
on them, yielding `awaiting-checks` at its deadline. The errand lane's auto-merge arm already delegates the same
wait to the host. A deferred-CI project therefore runs this boundary unchanged, with no added agent polling and
no new prose; the residual cost is one checks-length wait inside B2, largely absorbed when review approval is
what starts the deferred run.

_Amended 2026-08-17 — why the wait is the work-unit lane's own._ B8 places the wait inside the merge verb on this
lane while the errand lane delegates it to the host, and the asymmetry is not an inconsistency to resolve later:
the errand lane arms auto-merge, and this lane structurally cannot (D2's amendment carries the chain, from
ADR-031 Decision #5 through the solo operator's inability to approve their own pull request). A deferred-CI
project therefore pays the wait here because there is nowhere else on this lane to pay it.

_Amended 2026-08-17 — host-evidence scope._ The same shape of residual as B4's sits on the check read itself: an
empty required-checks result cannot distinguish a repository with no required checks configured from a deferred run
not yet created, and both reduce to `not-required`. Closing it needs the branch-rules read alongside the check list,
which this work unit does not carry.

### C. The behind-base reconcile arm becomes an orchestration path

The arm looks absorbable and is not: walked against source it holds **five stop-bearing spans containing seven
individual stops** across roughly sixty-five lines, and only two are judgment.

| Span | Content                                                             | Kind                       |
| ---- | ------------------------------------------------------------------- | -------------------------- |
| 1    | Drift read, envelope validation, safety predicate, host cross-check | deterministic              |
| 2    | Refresh, base-identifier compare, append-only merge                 | deterministic              |
| 3    | Gates, recompose → **review-applicability call** and its branch     | **judgment leaf**          |
| 4    | Push extension contract, `workflowPush` release                     | **fire point + interlock** |
| 5    | CI and routing re-read, base-moved loop-back                        | deterministic              |
| 6    | Current-WU reconcile dispatch → **retain-advisories direction**     | **direction leaf**         |
| 7    | Gates over the staged correction, `workflowCommit` release          | **interlock**              |
| 8    | Push extension contract, `workflowPush` release, restart            | **fire point + interlock** |

It is an alternation, not determinism with a leaf in it, and the longest stopless run is a handful of lines. No
absorbing verb exists: one would swallow two extension fire points and three interlock releases. The arm becomes a
thin orchestration path over stopless procedures:

- **C1.** Span 1 is already absorbed — B1 returns `reconcile` carrying the validated safety facts.
- **C2.** Span 2 becomes `arc base merge --expected-base <oid> --json`: refresh, compare the base identifier, and
  merge append-only. It returns `merged`, `skipped-clean`, `base-moved`, or `conflict`. This also removes a mechanics
  leak, since prose currently narrates the git merge itself.
- **C3.** Span 5 becomes `arc review status --target <target-ref> --json`. The opaque target reference comes from
  D1 and binds repository, head ref, and exact head. After any head-changing reconcile push, the orchestration
  re-runs D1 and passes the fresh reference; C3 rejects a stale reference. The call returns required-check status,
  routed review obligation, current base OID, and one of `settled`, `review-required`, `checks-pending`,
  `base-moved`, or `blocked`; the workflow follows its typed next action rather than recomputing the conjunction.

    - _Amended 2026-08-17 — single wait site._ `checks-pending` reports the observed check state; its next action
      routes back through the checkpoint alongside `base-moved`, never into a wait. B8 places the only work-unit
      wait inside the merge verb, and the checkpoint tolerates non-green checks, so a second pre-approval wait here
      would have contradicted B8 and Success Criterion 17 while blocking a deferred-CI project before approval.
- **C4.** Span 6's dispatch verb already exists; what deletes is the prose validating its envelope. The
  retain-advisories direction leaf remains immediately after the typed dispatch.
- **C5.** Spans 3, 4, 6, 7, and 8 stay prose — they _are_ the cadence.

**C6. Self-validation prose is deleted wherever a verb we own returns the envelope.** The step currently instructs
the agent to confirm the drift verb returned well-formed typed fields. If that verb can emit a malformed envelope,
that is a defect in the verb.

**C7. Bias-guarding invariants survive as prose, stated once each** — clearance never carries, advisory receipts are
not merge authority, the interlock is the sole merge authority. They are currently restated six or seven times
across the phase; once the verbs enforce the sequence, one statement each is enough.

### D. Three supporting verbs the spine requires

All three are determinism removal rather than new capability, and all three are reached by the errand path as well,
so none nests under `arc integrate`.

**D1. `arc review change-request resolve --head-ref <branch> --head-sha <oid> --json`** derives the repository from
the current checkout, validates the supplied 40-hex head against both local and remote refs, and returns a
`targetRef` plus the resolved disposition — `none`, `open` (reuse this request), `merged-at-head`,
`merged-stale-head`, `closed-unmerged`, or `ambiguous` carrying every candidate — and a typed `nextAction`.
`closed-unmerged` is its own member rather than folding into `ambiguous`: a single closed PR is an unambiguous
match, and labelling it ambiguous would be a verb misdescribing what it found. The errand table stops on that class
today, and the work-unit resume table has no row for it at all — an asymmetry the shared verb settles. It serves two
different questions
and must carry both: the errand path's **pre-create enumeration** ("does a PR exist for this head, may I create
one") and the work-unit path's **resume-point** question ("given resolver state and PR state, which incomplete step
do I re-enter"). It replaces all 5 inventoried branch sites and folds in the work-unit creation path's missing
pre-create head validation, an asymmetry the shared verb settles. Resolution is host-anchored rather than
checkout-anchored: a stale invoking checkout whose local refs cannot see a merged or renamed head still receives
the correct disposition, which its third consumer (stub launch) specifically requires.

_Amended 2026-08-17 — the `change-request` vocabulary collision._ The host-neutral term collides with GitHub's
`CHANGES_REQUESTED` review decision, and the two meet in one file: `change-request-lifecycle.ts` names the pull
request as a change request while reading `reviewDecision === "CHANGES_REQUESTED"` to mean a reviewer asked for
work. A reader can take "change request" for the review state rather than the request itself. The host-neutral
term stands anyway: ADR-005 § Part 3 settles that ARC names the entity in host-neutral terms — "Merge Requests /
Pull Requests" — because GitLab, Bitbucket, and GitHub disagree on the noun, and a verb serving all three cannot
adopt one host's word. The collision is with a review _state_, which the code always names in the host's own
screaming case, so the two never appear in the same grammatical position. ADR-005 carries the reconciling note.

**D2. Lock release and the checks wait live inside the merge span, with re-lock as its fail-closed exit.** The
repository lock is the pull request's draft state (`merge.lock: draft`), operated by the `arc merge lock` family:
`release` already binds the exact head, gates on lifecycle readiness, and settles the flip verb-side,
self-reverting when the head moves during settlement. What remains agent-carried is the sequencing around it —
release, re-read checks, merge — plus a re-lock obligation restated across every exit path. B2 absorbs that span:

- **Release through the existing verb.** B2 invokes the release with its bind/gate/settle semantics unchanged.
  Release remains lifecycle-gated and is never head-authorization — the pin is.
- **Await required checks through one command.** The provider-neutral bounded wait extracted from
  `awaitHostedReview` instantiates a second time as the required-checks await on the exact head. It observes
  `pending`, `green`, `failed`, and `not-required`, carries the stale-head guard, and yields `awaiting-checks` at
  its deadline; re-invoking B2 is the coarse retry. Under a deferred-CI policy (B8) this arm is where the
  deferred run is absorbed.
- **Re-lock is the invalidation exit, enforced rather than narrated.** Every B2 exit in an approval-voiding class
  — head mismatch, settlement failure, merge-method movement, non-clean final drift, failed required checks —
  re-locks before returning `invalidated` or `blocked`. The obligation relocates from a workflow-wide prose
  invariant into the verb's exit path, where it is a unit test.
- **A deadline yield does not re-lock.** `awaiting-checks` leaves the release standing: the approval already
  authorized publication of this exact head, the required checks independently block a premature merge, and a
  re-lock would misreport an approved candidate as unapproved while churning the host on every resume. Only exits
  that void the approval re-lock.
- **The errand lane keeps its one-fire shape.** Its auto-merge arm delegates the checks wait to the host and its
  release stays a structural precondition of arming auto-merge; its re-lock rule is stated once (C7 discipline),
  since no absorbing verb exists on that lane.
- **The anti-polling rule is restated once, correctly.** The cost is not polling — the bounded wait polls. It is
  that a poll tick in the agent's turn loop is a full model inference over the whole conversation, where an
  in-process tick costs nothing. The shape is a coarse agent-level loop over a fine in-process one.

_Amended 2026-08-17 — why this lane waits in-verb._ The obvious alternative is the host's own auto-merge: arm it
and let the host wait. ADR-031 Decision #5 already rejects it for this lane, and the reason is structural rather
than preferential — native auto-merge survives pushes from write-permission actors, so matching the head at
arming time guards nothing at merge time, which is exactly what exact-head authorization requires. The chain
runs deeper than the host mechanism: a solo operator authors the pull request and therefore cannot approve it
host-side, so the approval lives in the terminal and the pin rides the host's own exact-head merge parameter.
Required approvals plus dismiss-stale-reviews is the industry expression of the same property, and it is
unavailable precisely because the author and the approver are one person here. The in-verb wait is what remains
once that door is closed, not a preference over it.

_Amended 2026-08-17 — why a bounded wait rather than the host CLI's watch._ `gh pr checks --watch` blocks until
the checks settle and would remove the wait implementation entirely. It is not adopted because it supplies none
of the three properties this arm's contract rests on: no deadline to yield at, so a hung run holds the session
indefinitely; no typed envelope, so the outcome would be re-derived by parsing terminal output; and no
stale-head guard, so it would happily report on checks belonging to a head the approval never covered. The
bounded wait exists to carry those three, and the same instance already serves the hosted-review wait.

**D3. `arc review merge-method resolve --json`** derives the repository and configured `merge.strategy`, reads the
repository's live merge-method allowances, and returns `validated / use-method` with the method plus a policy
fingerprint, or `blocked / stop` naming the configured and allowed values. It exists because B4 needs the same read
on two lanes that share no other surface. The work-unit checkpoint and merge call consume it, and the errand path
calls it before arming auto-merge. One verb, three call sites, no duplicated resolution logic. The read's scope and
its branch-rules residual are B4's amendment.

### E. `propose` attests a Candidate; `submit` schedules publication

Lifecycle `State` remains the **scheduling axis**. Candidate is the tail-end peer of preactivation readiness on the
orthogonal artifact axis: an implementation whose full verification completed and which is eligible to enter code
review, but whose configured pre-publication review obligations may still be open. It is a projection over typed
evidence, never a fifth `State` value or a stored boolean.

**E1. `arc propose <name> --json` replaces `arc finalize verify`.** Its initial invocation runs at the existing
verification-finalize fire point after Tier 3, success-criteria validation, and any configured adversarial
verification. It writes the integration pointer and Candidate lineage root through the managed WU record, stages
with the existing verification commit, leaves `State: Active`, and returns the typed pre-publication locus. E4
reuses the same verb to attest a later converged review head. Neither form creates an additional interlock, commit,
or user decision.

The schema is TypeScript-owned and projects into the managed WU record:

```text
CandidateAttestationV1 {
  candidateId
  workUnit
  subjectDigest
  baseRevision
  attestedBy
  attestedAt
  verificationEvidenceRef
}
```

`subjectDigest` covers the reviewable WU content while excluding the Candidate record's own projection and other
code-owned operational-state writes, avoiding self-reference and harmless handoff churn. The exact review target
remains head-bound in the existing review controller. `candidateId` binds those exact-target operations back to the
attestation.

_Amended 2026-08-16 — classification clarification._ "Other code-owned operational-state writes" includes the
system-regenerated projections a lifecycle transition renders and stages — `ROADMAP` foremost — resolved by class
through the layout, never an enumerated path list. The delivered classification had narrowed the exclusion to the
meta file alone, which let `submit`'s own ROADMAP render read as an unexplained reviewable delta and block both
checkpoint and re-attestation (finding V3-B2, third-entry falsification pass). This names what the original
sentence already intended; it widens no scope.

**E2. Candidate currentness composes existing response evidence.** The initial `arc propose` establishes the
lineage root. Approved review fixes already persist the old target, new target, disposition identity, applying
actor, and verification references through `review-response`; those records advance Candidate automatically. A
later `arc propose` may attest only the recognized current lineage head under E4. No Candidate pass counter,
findings store, source router, refresh command, or second fix ledger is introduced. A code-owned operational-only
delta preserves Candidate mechanically. An unexplained reviewable delta returns `blocked` with the exact delta and
one action back to full verification, which establishes a new lineage root rather than repairing the old one.

**E3. Pre-publication review is one typed conditional procedure.** It runs author self-review when active, the
frontline lane when configured, and the standard lane before publication only when the first remaining ordered
standard source is local. `review.standard_sources` is an ordered reservation across binding times: a higher-ranked
hosted source returns `awaiting-change-request` and may not be leapfrogged by a lower-ranked local carrier merely
because no pull request exists yet. Frontline remains advisory and never satisfies `standard-review`.

The existing policy driver owns source order, safe fallback, pass counts, chunk aggregation, and ceiling overrides.
A changed exact target re-enters that driver; an exceptional pass beyond the configured ceiling still requires the
existing exact approval. After the pull request opens, the same obligation resumes at its reserved hosted source,
requests and awaits that review, and runs review-response cycles to clean convergence or the configured cap. If a
local-first source already fulfilled `standard-review`, no hosted standard review is requested merely because a pull
request now exists.

**E4. Review fixes use primary-owned verification applicability.** Each approved pass's fixes form one bounded
increment. The CLI supplies the exact delta and prior evidence; the primary selects:

- `targeted` — affected fast gates plus impacted success criteria/spec claims;
- `focused` — targeted integration checks plus impacted conformance claims; or
- `full` — Tier 3 plus a complete success-criteria walk when behavioral, authority, contract, architectural,
  gate-oracle, materially interacting, or uncertain change undermines the original attestation.

The choice and evidence persist with the response record. A reviewer or adversarial pass never selects the scope.
Full `verify-work-unit` and its adversarial fire point do not automatically re-run after every fix.

_Amended 2026-08-16 — applicability record status._ The persisted applicability is attested judgment and evidence
routing for the primary's own verification of that increment; no mechanical consumer reads it back, and none is
owed. Convergence enforcement remains `implementationChanged` plus this section's re-attestation gate (finding
V3-M7 — recorded so the write-only field is not later read as an unfinished consumer).

After review converges on an implementation-changing lineage, typed status projects
`candidate-convergence-verification-pending`. The primary runs one final Tier 3 and then invokes `arc propose` over
the recognized current lineage. That invocation records full verification evidence for the exact converged head,
leaves `Active` or `Integrating` unchanged, and rejects any unexplained delta rather than repairing or refreshing
Candidate. Repeating it at the same target is a no-op. B1 blocks checkpoint readiness when the current
implementation-changing lineage head lacks this full attestation. An unchanged tree reuses the initial attestation.

**E5. `arc submit <name> --json` replaces the old `arc integrate` transition.** It requires a current Candidate
lineage and every configured pre-publication obligation settled or typed no-op, with one exact exception: a
hosted-first standard obligation at `awaiting-change-request` / `open-change-request` is submit-eligible when its
durable obligation reference is carried across pull-request creation. That state is a deferred reservation, never
reported as settled or no-op; no other open obligation permits submission. `submit` then fires
`Active → Integrating`, writes the publication resume pointer plus any carried reservation, and stages the existing
transition commit and ROADMAP projection. `Integrating` means submission/public integration is underway; a pull
request need not exist at the exact transition instant. After creation, the same obligation resumes at the reserved
hosted source under E3.

**E6. The zero-review path is zero-cost.** `propose` replaces one existing command, `submit` replaces another, and
the intervening procedure returns no-op. It adds no command, commit, approval, or judgment count. Repeated
same-target `propose` is a no-op; repeated `submit` reports the observable publication resume point. The
review-fix path reuses `propose` only once after a changed implementation converges.

**E7. The rename frees `integrate` as a namespace.** `arc integrate checkpoint` and `arc integrate merge` are
honest phase procedures rather than subcommands beneath a transition named like the merge. Bare `arc integrate`
errors with a pointer to `arc submit` and lists its subcommands.

**E8. No alias window.** The project is pre-public-release with no callers outside this repository, so no
compatibility obligation exists to discharge and an alias would preserve the misleading name.

**E9. Agent discovery is a typed projection.** `arc status` and session initialization resolve Candidate and review
evidence into `candidate-review-pending`, `candidate-fix-pending`,
`candidate-convergence-verification-pending`, `candidate-submit-ready`, `publication-pending`, or
`hosted-review-pending`, each with one typed next action and precomposed interaction text where needed.
`candidate-submit-ready` may carry only E5's exact hosted-first deferred reservation. These are operational loci,
not stored lifecycle states. Narrative `Next Action` prefixes are no longer operational authority for this
boundary. The agent never parses review config, compares Candidate digests, counts passes, clears records, or
reconstructs resume state.

_Amended 2026-08-16 — projection scope._ `arc status` and session initialization project the conservative entry
locus for each boundary — `candidate-review-pending` under `Active`, the stored publication boundary under
`Integrating` — and the finer pre-submission loci (`candidate-fix-pending`,
`candidate-convergence-verification-pending`, `candidate-submit-ready`) resolve through the idempotent
pre-publication procedure's envelope, one typed hop away. That bounds which surfaces perform evidence reduction
while preserving typed discovery without narrative parsing (finding V3-M2). What this does **not** license is an
untruthful pointer: a post-submission surface may not emit a resume command for a transition that already fired,
and the stored boundary's next action must route the publication resume the workflow actually executes (finding
V3-M10). Original text retained above, not edited into agreement.

_Amended 2026-08-17 — spine-verb rename._ The two verbs ship as **`arc attest`** and **`arc publish`**; § E's text
above keeps the original names and is not edited into agreement. The names this section chose invert established
host-VCS vocabulary: in Gerrit "submit" _is_ the merge, and the host's own "propose changes" is what opens the pull
request — so both read as the opposite of what the verb does. `attest` names what the verb does to the Candidate,
and `publish` matches this section's own "schedules publication". The rename carries the typed loci with it
(`candidate-publish-ready`, `publish-candidate`) so no operator-facing surface names a verb that no longer exists;
E8's no-alias rule applies unchanged. `Integrating` keeps its name (already settled under § Alternatives), the
`arc integrate` namespace is untouched, and nothing about the boundary's semantics moves with the words.

### F. The transition fires at the publication boundary

Verification is not the misplaced part: the task list's verification phase runs Tier 3 gates, success criteria, and
any adversarial verification entirely under `**State:** Active`; E1 then records Candidate, and configured private
review also remains under `Active`. What the transition sits before is **publication**.

Because the transition is a commit — it flips the state, writes the pointer fields, regenerates `ROADMAP`, stages
both, and lands `chore(arc): submit {name}` — "the pull-request-open boundary" is three placements with
materially different mechanics:

| Placement                                                | Cost                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| After the push, before creation                          | Flip commit is not on the pushed head — forces a second push and a recomposition of the proposed target                                        |
| After creation                                           | The PR's opening head differs from the branch head — forces a post-open push and a recomposition before the `post-pr-open` exact-head contract |
| **At the head of the publication step, before the push** | One commit, one push, no recomposition                                                                                                         |

- **F1.** Fire `submit` at the head of the publication step — specifically **before the step's
  `#pre-push-review` extension contract**, not between that contract and the push. The step head carries three
  consecutive stops (the transition's own `commit-interlock` release, the push extension fire point, then the
  `push-interlock` release), and the ordering is load-bearing rather than incidental: firing after the extension
  would leave `pre-push-review` having reviewed a tree that then gained a commit before the push it gates. Firing
  before the extension means it reviews the tree actually pushed. Verification, author preflight, frontline review,
  and any preferred local standard review stay under `Active`; `Integrating` covers submission/publication underway
  through public review-response.
- **F2.** Step 1's composed `next action` value is written by the transition, so it moves with it.
- **F3.** The resume table's `integrating` / no-PR-open row stays reachable rather than becoming dead: because the
  transition fires before the push, that row covers both a transitioned-but-unpushed session and a
  pushed-but-uncreated one. Its resume point is the publication step **from the push** — which is idempotent — not
  PR creation directly; sending the unpushed arm straight to creation would run it against a branch with no remote
  head.
- **F4.** The `State` table's `Integrating` fire-point entry updates from Step 1 to the publication step.

This mints no lifecycle state and re-keys none. The short transitioned-but-unpushed interval is truthful:
submission/publication is underway, with the exact next action identifying whether the remaining work is push or
open/reuse PR. Happy-path duration is seconds; interruption remains honest and resumable rather than being
mislabelled as if a PR already existed.

**Lock mode grades the boundary; it does not move it.** Under `merge.lock: draft` the opened pull request is
visible but review-suppressed — a middle state between private work and released candidate — and the release that
ends it is merge-side machinery B2 owns, fired from the integration approval, not a lifecycle transition.
`Integrating` claims only that submission / public integration is underway, true from the publication-step head
in every lock mode; under `merge.lock: none` the middle state collapses and nothing here changes. A finer
audience model (private / visible-suppressed / released) is `wu-lifecycle-state-model`'s to mint on its two-axis
vocabulary if it earns one; this design neither requires nor precludes it.

### G. `Coverage` is cut from the pull-request record

The field renders as prose like "targeted verification carried prior complete coverage across the archive-only
candidate tail" — four load-bearing internal terms addressed to a reader with no model for any of them, which
`DEV-RULES.ARC` § Commit and PR surface language already prohibits. `Local`, `Hosted PR`, and `Triage` survive that
test; `Coverage` is audit metadata whose only interested reader already approved it.

- **G1.** Cut it from the record at all 5 inventoried sites, field-scoped per the inventory's warning.
- **G2. Nothing replaces it — the cut is a pure deletion.** No goal here requires the coverage content to persist,
  and the approver's visibility does not depend on it: the integration interlock surfaces "every review
  applicability call and targeted verification" as an item distinct from the `## Review` record, so the coverage
  facts are still surfaced live at the stop. They simply stop being written to the pull request and stop being
  persisted anywhere. Should a durable review-coverage record ever be wanted, it needs its own justification and
  its own concern; it is not smuggled in behind a field deletion.

_Amended 2026-08-15 — review-record reduction._

G1 and G2 stand. What follows narrows the **retained** fields, reversing the judgment recorded in
§ Alternatives under **Retained review-record fields** — which flagged itself as "a judgment rather than a
validated requirement" that "has not been tested outside this project."

**What prompted the re-examination** was the verification boundary's second adversarial pass: the composed record
labelled the frontline advisory lane as `Hosted PR`, dropped every approved disposition set that authorized no fix,
and was never surfaced to the approver it was composed for. **What justifies the change** is not those defects but
an external precedent review run before deciding. The defects prompted the question; the precedent answers it. Had
precedent supported the shape, the correct response would have been to fix the three defects as scoped.

The precedent review found no established convention, in any surveyed ecosystem, that records in a pull-request
body what review a change received. Two traditions exist. Commit trailers (`Reviewed-by:` and family — kernel, Git,
Gerrit; on hosted platforms, Node.js's required `Reviewed-By:` and GitLab's `approved_by`) attest **who** reviewed
and never **what was found**. Detached signed attestations (SLSA Source Track, in-toto) are explicitly not prose,
and their review-specific predicate remains unratified. A structured findings-and-disposition summary in a PR body
is unprecedented. Separately, SARIF via platform code scanning already models finding-level disposition as a
queryable standard with structured dismissal reasons.

- **G3. `Hosted PR` is cut.** It reports review that ran on the pull request, which the platform already exposes
  natively and which the hosted reviewer's own bot commonly writes into the body itself. A third copy carries no
  information.
- **G4. `Triage` is cut.** Its vocabulary — material finding, disposition, deferred — addresses a reader with no
  model for it, the same test G1 applied to `Coverage`. Where finding-level disposition is genuinely wanted,
  SARIF-plus-code-scanning is the standard to meet rather than parallel in prose.
- **G5. A single local-review marker survives.** Review carried locally before publication leaves no platform
  trace, and no vendor or convention carries it forward. This is the one field with information content a reader
  cannot otherwise obtain, and the reason to keep it is the team case: without it, a gated pre-publication review
  is invisible to everyone but its operator.
- **G6. The marker is attestation-shaped, not report-shaped, and is authored rather than composed.** It names the
  carrier and nothing else — no pass counts, no finding summaries, no dispositions. It renders as a bold
  top-of-body field beneath `**Design:**`, grouping the ARC-authored metadata and following the template's own
  convention that bold field labels are top-of-body metadata. It is omitted entirely when no local review ran — no
  `None`, no heading, no section. It is written when the PR body is composed, since the pre-publication lanes have
  settled by then, so it neither goes stale nor requires the merge verb to post anything. **It must not use
  `Reviewed-by:`**, which is human and consent-gated by long-standing convention; no tool-as-reviewer standard
  exists, so this is minted, not adopted.
- **G7. Richer review reporting is an extension concern.** A project wanting counts, dispositions, or per-lane
  detail attaches it at the `pre-merge` seam in whatever shape it wants. ARC ships none.

### H. The approval-invalidation narration is deleted

The exact-head pin stays: it is a compare-and-swap guarding a real failure mode — an agent pushing a fix in the
window between approval and merge. What is wrong is telling the approver their approval is conditional. The pin
constrains the _agent_, not the human, and any change in that window would have come from the human anyway.

Keep the mechanism, delete the explanation, and let the invalidation path speak only when it fires. This becomes
structural rather than instructional: the approval binds to the head as a token B2 validates, so the rule stops
being a paragraph the agent must remember and narrate and becomes a precondition the verb enforces.

- **H1. The narration has five loci across both workflows**, and the cut is site-bound like every other:
  `integrate-work-unit.md` ×3 — the checkpoint-invalidation paragraph, the interlock callout's conditionality
  clause, and the post-approval invalidation paragraph — and `run-errand.md` ×2, its interlock callout and the
  following paragraph. Both copies of each per the two-copy discipline.
- **H2. The boundary is disclosure versus narration**, and it must be stated before anyone edits those callouts:
  the sentence carrying what approval _does_ (applies dispositions, ends review, authorizes merge) is welded to the
  clause telling the approver their approval is conditional. **The disclosure stays; only the conditionality clause
  goes.** Deleting the whole sentence would remove the approver's consequence disclosure, which is the opposite of
  this work unit's intent.
- **H3. H reaches the errand copy.** The narration defect is identical there and `run-errand` is already in the
  change set for G, B6, D2, and D3. This does not cross the Non-Goal against generalizing the interlock-surface
  treatment: that Non-Goal excludes extending B5's **precomposition** mechanism (which is work-unit-only, since the
  errand path has no checkpoint verb), not deleting an identical false statement. Leaving the errand copy alone
  would fix one surface and keep its twin — a divergence nothing would record.

### I. The errand tail leaves only when the session actually ends

`arc errand leave --state awaiting-merge` is a terminal exit ramp — the identity outlives a disposable checkout so
work can pause, move machines, or stop holding a session open — never a routine mid-ship transition. The ship
path's prose says so:

- **I1. The leave step is conditional and terminal.** The default path completes in-session through the
  integration interlock and the lane action; leave fires only when the session is ending with the tail
  unresolved (or the work is moving machines). Its trigger clause names that session-end condition — not a
  PR-state condition satisfiable four steps and one human stop upstream of where the step sits.
- **I2. The unattended-merge replay is stated against the post-leave world.** Completion replays through the
  identity's owning open/materialize driver; no step references a retained checkout that a leave has already
  torn down.
- **I3. Batch throughput needs no leave.** The drain does not block on merges: the auto-merge arm plus the
  completion backstops are the pipeline, and batch doctrine runs entries sequentially in lockstep. The ship path
  never proposes leaving as a way to start the next errand.

Surfacing a left errand's mergeability on session-init is CLI work owned elsewhere (Non-Goals); this element only
stops the workflow from manufacturing the blind leave/re-enter loop.

## Alternatives & Rationale

**On the substrate remedy**

- **Relax the integration step's constraints rather than relocate them.** Rejected — the sequencing is
  deterministic, so loosening it trades a fidelity problem for a correctness one. The constraints are not wrong;
  they are in the wrong substrate.
- **Trim the interlock's rendered surface in prose.** Rejected as the same defect one level up: a rendering rule in
  markdown is untestable and re-litigated at every site.
- **Generalize to every workflow interlock.** Rejected — `composable-workflows` owns the corpus-wide pattern and
  records a graduation trigger covering this class. Fixing one site in a way that generalizes locally would mint the
  competing convention its adoption ladder exists to prevent.
- **Wait for `composable-workflows` entirely.** Rejected — it is `planned` inside a cohort, staged large, and
  carries ten unintegrated buffer items, so waiting defers the fix indefinitely. Extraction is also the one change
  safe ahead of it: it shrinks what that work unit later converts.

**On the spine and its boundaries**

- **Fold the whole reconcile arm into the checkpoint verb.** Rejected — it makes a read-and-verdict command mutating
  and swallows five stop-bearing spans containing seven individual stops, including two extension fire points and
  three interlock releases, silently deleting live control points from any project that populates them.
- **Absorb the arm into a third `arc integrate reconcile` verb cut at the judgment leaf.** Rejected once the stop
  inventory is complete: the leaf is not the only stop, so a span starting after it still swallows the push
  extension contract and the push and commit interlock releases.
- **Leave the reconcile arm wholly in prose.** Rejected — roughly two-thirds is deterministic, including a
  mechanics-narrating merge and two envelope self-validations, so leaving it intact would apply the thesis to
  everything except its strongest instance.
- **Absorb the `pre-merge` seam into the checkpoint verb** (callback, or a returned `seamPending` obligation).
  Rejected on the contract: extension actions are project-authored prose no verb can execute, and `run-errand` fires
  the same extension without a checkpoint, so one contract would grow two enactments.
- **Split the pre-stop sequence into three verbs around the seam.** Rejected — the seam's output has no typeable
  shape, so a downstream compose verb could not consume it, and the split buys ordering the contract does not
  require while costing a verb.
- **Fire the seam before the checkpoint verb.** Rejected — it would fire before the readiness envelope its actions
  report against exists, and would burn a retry-safe fire whenever the checkpoint returns `reconcile`.

**On the handoff and the wait**

- **Recompose the `## Review` record inside the merge verb.** Rejected — the approved disposition set is the
  composed input, so recomposition can only diverge from the previewed record, and it narrows the exact-head pin to
  the tree when what was approved includes the record.
- **Hand the composed record back through the merge verb's arguments.** Rejected — it puts a precomposed surface in
  the agent's hands between composition and posting, weakening precomposition exactly where B5 leans on it.
- **Put the lock release and checks wait outside the merge verb.** Rejected — release through merge is the span
  declared stopless and holds the pin's most head-sensitive moment, so splitting it hands the agent a live window
  immediately before merge. The boundary rule does not require the split, because a deadline return is a
  mechanical yield.
- **Re-lock across a checks-deadline yield.** Rejected — it misreports an approved candidate as unapproved,
  churns the host on every resume, and guards nothing the required checks do not already block.
- **Gate heavy CI on the draft→ready flip (`ready_for_review`).** Rejected — under `merge.lock: draft` every
  merge performs that flip, so the required check would re-enter flight at the exact moment the merge needs it.
  Review-state automation that starts the deferred run at approval avoids the trap, and choosing among such
  policies is the repository's, not this boundary's (Non-Goals; B8 owns only the honest await).
- **Leave approved dispositions and channel settlement outside the merge handle.** Rejected — settlement is part
  of what the integration interlock authorizes, and reconstructing it from mutable threads after approval would
  sever the exact approval boundary. The checkpoint therefore persists one digest-bound plan and B2 executes it
  idempotently.
- **Build the checks await as its own mechanism.** Rejected — `awaitHostedReview` is already the shape, and a
  second independently-authored bounded wait would put two backoff-and-deadline implementations in one namespace.
- **Leave the checks wait to the agent** (status quo). Rejected — it contradicts the sibling step's own prohibition
  on agent polling loops, and each tick costs a full model inference.
- **Leave the errand checkout at pull-request open as the default.** Rejected — it converts operational re-entry
  into normal waiting against the lifecycle's own recorded guardrails, and with no settledness signal it
  degenerates into blind repeated re-entry: the polling loop the review protocol forbids, relocated into the
  errand lifecycle.
- **Leave in order to pipeline a batch.** Rejected — the drain already does not block on merges (the auto-merge
  arm plus completion backstops are the pipeline), and batch doctrine runs entries sequentially in lockstep;
  leaving buys no throughput the lane does not already provide.
- **Resolve the merge method from the ruleset alone, superseding `merge.strategy`.** Rejected — the setting is an
  established configuration axis with documented traceability consequences, and superseding it is neither necessary
  to fix the observed failure nor this concern's to decide.
- **Validate the merge method inside the checkpoint verb only**, leaving the errand lane as-is. Rejected — the
  errand lane's auto-merge arm is exactly where the observed failure occurred, and it reaches no checkpoint verb,
  so the fix would miss its own motivating case. Duplicating the resolution into the errand step
  instead was also rejected: two implementations of one config-plus-allowances read would drift. Hence D3, one verb
  with two callers.
- **Fold `closed-unmerged` into D1's `ambiguous` stop**, matching the errand table's residual row. Rejected — a
  single closed pull request is an unambiguous match, so reporting it as ambiguous is a verb misdescribing what it
  found, which is the defect class this work unit exists to remove. It also erases the distinction a caller needs:
  a closed-unmerged head may be legitimately re-openable, while a genuinely ambiguous result never is.
- **Exclude `run-errand`'s PR-resolution block as out-of-boundary.** Rejected — the diagnostic criterion that
  excludes `verify-work-unit` (the defect tracks machine-decidable branching) admits this, and the errand path is
  already in the change set for G, B6, and D2.

**On Candidate convergence**

- **Add a dedicated convergence-attestation command.** Rejected — the operation has the same meaning as the
  initial attestation over a later authorized lineage head. Reusing `arc propose` keeps discovery compact and makes
  repeated same-target invocation naturally idempotent.
- **Treat the final Tier 3 result as agent-carried evidence.** Rejected — B1 needs an exact-head, durable
  prerequisite it can validate without parsing session narration.

**On the rename**

- **A compound — `enter-integration` / `begin-integrating`.** Rejected — no sibling transition verb is compound, and
  putting the phase noun back into the command re-couples the act to the phase. A compound is right only when no
  domain verb fits; here one does. `activate` is not `enter-active`.
- **Noun-ify to `arc integration`.** Rejected — it fixes the misread but breaks the family's verb form, does not say
  what it does to the state, and fails to free the word.
- **Fold verification and integration under one generic name such as `finalization`.** Rejected on two independent
  grounds: `arc finalize` already exists as a planning-ceremony verb (including `arc finalize verify`), and
  collapsing two phases under one name would re-key existing `State` meanings.
- **Rename the `Integrating` state alongside the command.** Rejected — it re-keys an existing meaning, spans every
  meta file plus the resolver, session type, and cadence checks, and buys little once the command stops competing
  for the word.
- **Retain `arc integrate` as an alias for a deprecation window.** Rejected per E8.
- **Keep Candidate wholly deferred to `wu-lifecycle-state-model`.** Rejected after adversarial review exposed that
  publication accuracy depends on distinguishing verified/reviewable work from publicly integrating work. The
  narrow E slice composes with that WU's two-axis model without pulling forward preactivation readiness or minting a
  lifecycle state.
- **Make Candidate an exact-head boolean.** Rejected — its own projection write changes the head, harmless
  operational writes would cause churn, and ordinary review fixes would force manual realignment. The attestation
  plus authorized verified lineage preserves exact-target review authority without a second controller.
- **Run a lower-ranked local standard source before PR while a preferred hosted source waits for one.** Rejected —
  ordered sources express preference across binding times, not merely among sources eligible at the current instant.

**On the fire point**

- **Fire immediately before or immediately after `gh pr create`** — the literal reading of "at the pull-request-open
  boundary." Both rejected per the placement table in F: the transition is a commit, so either placement puts it on
  the wrong side of the push and forces a second one plus a recomposition.

**On the record**

- **Keep `Coverage` but reword it for a general reader.** Rejected — the wording is not what fails. The field
  reports on the review process rather than on the change, so no phrasing makes it relevant to the audience the
  surface addresses.
- **Route the cut `Coverage` content to Completion Notes rather than deleting it.** Rejected, and the rejection is
  load-bearing because the upstream draft had settled the opposite. Three grounds. **No goal requires persistence:**
  the record clause is satisfied by deletion, and the approver still sees the coverage facts live at the interlock,
  which surfaces applicability calls and targeted verification as an item distinct from the `## Review` record.
  **There is no coherent write point:** Notes are composed and committed at Steps 9–10, the late applicability calls
  land at Steps 12–13, no lifecycle-authored commit is permitted after the checkpoint, and under `with-integration`
  the meta file has already been relocated into `completed/<dated>/` by Step 11's archive sweep — so the routing
  would amount to amending an archived artifact. **The cost runs the wrong way:** it adds a commit and an interlock
  to the phase this work unit exists to simplify, to persist metadata whose only interested reader already approved
  it. A durable review-coverage record may be worth having, but it needs its own justification rather than arriving
  as a side effect of removing a field.
- **Re-run `verify-work-unit` in full after every review fix.** Rejected — it compounds full-suite and adversarial
  cost per pass even when the change is narrow. E4 preserves conformance through one primary-owned delta judgment
  per fix increment and one bounded final full-suite run when implementation changed.

## Cross-cutting Considerations

**Trust boundaries and authority.** No new authority is granted. The integration interlock remains the sole merge
authority; the merge-lock release is still enacted only from that interlock's approval (now inside B2), so
`TECHNICAL-OVERVIEW` § Self-Hosting Review Gate's contract holds. B2 fails closed on head mismatch, unsettled PR
state, changed merge policy, failed required checks, and non-clean drift, re-locking on every approval-voiding
exit. The lock is the pull request's draft state — a per-PR structural hold, never equated with a required check
(repo-configured, fail-closed) — and merge safety is never inferred from agent-layer discipline. The lock proves
no review evidence; it only holds the merge closed while evidence is produced.

**The host mechanism for the same property was considered and does not reach.** GitHub's required-approvals plus
dismiss-stale-reviews is the industry expression of "approval covers this exact content, and content movement
voids it" — the same property the terminal interlock and the exact-head pin enforce here, and the reason to
prefer a host mechanism where one fits. It does not fit this repository: a solo operator authors the pull request
and cannot approve their own, so the required approval can never be satisfied and the dismiss-stale machinery
never has an approval to dismiss. The terminal interlock is what holds the property when the host's expression of
it is structurally unavailable, not a bespoke preference over it. The same constraint decides D2's in-verb checks
wait and B8's lane asymmetry; both carry the chain in their own amendments.

**Proportionality.** Every persistent mechanism traces to a chartered threat: B3's digest to same-head checkpoint
ambiguity under B6's retry-safe re-fire (an agent-side failure mode this design itself creates and must close);
E1's attestation to exact-head review authority surviving operational-only churn; D2's re-lock exits to the
observed human host-UI merge window the lock exists to guard. Obligations layered over the host-enforced pin that
traced only to hostile concurrent mutation — an unchartered threat — are deleted under Goal 5 rather than
relocated: the post-approval re-validation cascade beyond one exact-head status read, the duplicate drift reads,
and the forensic checkout posture of the readiness read (B1). At an external-authority seam the design pins what
the host offers to pin, keeps exactness in its own validation, and discloses the residual rather than demanding
enforcement the platform does not sell.

**Storage and identity.** Candidate and checkpoint records use the managed-record/storage abstraction with
version-checked writes; markdown is a projection, not the authority. No contract depends on the record being tracked
in the code repository, and WU identity remains independent of branch identity. The design introduces no storage
mode or per-artifact configuration axis.

**Testing.** The relocation moves invariants from prose into code, where they become directly testable. New
coverage: the two spine envelopes' typed verdicts and fail-closed paths; machine-surface exception filtering plus
the separate extension block; the extracted wait primitive under both instantiations; lock release gating, re-lock
on every approval-voiding exit, and the deadline yield that leaves the release standing; PR resolution across all
six dispositions; merge-method validation at all three call sites; settlement-plan composition, digest binding,
idempotent execution, and every invalidation class; Candidate projection and lineage; ordered-source reservation
carried through submit; delta-verification routing; converged exact-head re-attestation; idempotent propose/submit;
and typed session-resume loci. End-to-end fixtures cover the minimal no-review path, frontline review, local-first
standard review, hosted-first standard review, interruption between submit and PR creation, a review-fix lineage
advance, convergence-verification pending and completion, cap exhaustion, an `awaiting-checks` resume, and
unexplained Candidate drift.

**This is partly a swap, not purely a gain, and the change set must say so.** Workflow prose here is _not_ untested:
integration tests assert the exact strings this design rewrites — the merge pseudocode block B2 absorbs, the
approved-head retention line, "integration-interlock is the sole merge authority", the push→CI→`pre-merge` ordering,
the interlock callout's opening text, the three `arc merge lock` invocations, the errand auto-merge command shape,
and `Coverage`'s presence in both workflow copies. Those pins must be **rewritten to assert the new contracts**,
not merely added to; a task list that budgets only new tests will surface the delta as red CI mid-implementation.
The inventory prices four such files as verified with four more to audit, and that audit is itself a task rather
than an assumption. String pins are also the wrong long-term instrument for judgment prose — the eval harness owns
that layer when it lands — so the rewritten pins assert typed contracts and structural facts, not paraphrasable
sentences, wherever the new surface allows it.

**Performance.** A coarse agent-level loop over a fine in-process wait replaces per-tick full-conversation
inference. A resumed B2 re-runs its idempotent settlement and status reads across deadline resumes, deliberately
trading cheap idempotent host work for exact-head-safe recovery. Candidate adds no happy-path command, commit,
approval, or judgment count.
Review fixes run one consequence-scaled delta verification per bounded fix increment and at most one converged
full-suite rerun, rather than multiplying Tier 3 by pass count.

**Migration and rollout.** No deprecation surface — E8. The rename sweeps the inventoried surfaces: 5 source files,
5 doc files (×2 for the packaged mirror), and 5 verb-name test files, with archived `completed/**` artifacts
excluded. **`lifecycle-transitions.ts` is the load-bearing one** — it holds the `VERBS` registry the `Verb` type
derives from, the transition edge, `reopen`'s `inverse`, and the illegal-cell table; the rename cannot land without
it, and it is invisible to a grep for the invocation string `arc integrate`. Two backlog drafts reference the old
name; per the standing rename discipline, unlanded names are never forward-referenced, so those update when this
lands rather than before.

**Delivery topology.** This work unit delivers as a stack: one concern, one spec, dependency-ordered members each
independently landable to `main` (the delivery-plan record's `stack-to-main` projection). The rename (E) and
fire-point move (F) land in an early member ahead of the extraction; verbs land before the workflow prose that
consumes them; the workflow convergence lands last. The delivery plan is authored from the generated task list at
the end of task generation; the landing machinery ships with `delivery-stack-topology` ahead of this work unit's
first integration. The surfaces stay coupled by design — delivery topology, not work-unit boundary, absorbs the
size.

**Coordination.** `composable-workflows` — adjacent owner. This loop-style workflow takes its Level 1–2 shape: a
bounded resident spine containing stops, with pre-publication review, response, and reconcile as typed conditional
procedures; deterministic routing and emitted text live in CLI envelopes. It adds no agent-interpreted markup or
agenda compiler. Extracting the wait primitive is inside the boundary because a TypeScript wait loop is unaffected
by a workflow-authoring convention. C and E are worked instances of its procedure-library-plus-thin-orchestration
model, and A supplies the stopless extraction predicate. `stub-mint-to-launch` is a third D1 consumer.
`wu-lifecycle-state-model` retains the general two-axis vocabulary and all non-Candidate scope.

**`review-protocol-alignment` — now a four-member cohort; the live coupling is its first member.**
`review-signal-convergence` (unblocked, cohort-first) reorders `integrate-work-unit.md`'s Step 3 lane dispatch and
Step 4 hosted-findings arm — regions this design also reaches through C, E3, and E4, so the edits are sequenced,
never merged blind, whichever lands first. `review-activity-contracts` later re-touches the review-applicability
step this design leaves in place as a judgment leaf; that is additive, not contested. The request-contracts member
owns verb input legibility across the review family; the surfaces minted here are flag/handle based — D1, D2's
await, D3, C2, and C3 name their inputs — and add no opaque `<file | ->` request-body command for it to remediate.

**`review-source-authority` — one owner for the ordered reservation.** Its inbound buffer carries the same pre-PR
hosted-source-priority defect E3/E5 fix; ownership is settled here (this work unit lands first), and its buffer
item reduces to a pointer at the landed behavior — routed to it as a capture, not by editing its draft from this
branch.

**`operational-advisory-registers` — vocabulary consumer.** B5's exception filtering, B7's extension block, and
E9's precomposed interaction text are register-bearing surfaces; when that work unit lands its register
vocabulary, these compose it rather than minting a competitor.

**`ci-defer-heavy-reconciliation` — the repo-side complement of B8.** It owns when heavy CI starts (label
lifecycle, trigger selection, the commented-approval defect); B8 owns the boundary's honest await. Neither
consumes the other's contract.

**`review-orchestration-right-sizing` — downstream pruner.** The proportionality traces above are written to be
its inputs: every mechanism this design mints carries its chartered-threat rationale, so the later right-sizing
pass inherits reasons rather than targets.

**Forward-compat of the await parameterization.** The checks await is the second instantiation, and two instances are
thin evidence that the parameterization is right. If a third bounded wait later resists the shape, the primitive
absorbs a variant rather than the callers bending to it.

**Retained review-record fields.** Cutting `Coverage` is settled; retaining `Local`, `Hosted PR`, and `Triage` rests
on the reading that a reader wants to know who reviewed and what became of the findings. That has not been tested
outside this project and the whole section is optional today, so the retention is a judgment rather than a validated
requirement.

> _Reversed 2026-08-15._ The judgment above was tested against external precedent and did not survive; `Hosted PR`
> and `Triage` are cut and the residue is an attestation-shaped marker. See § G's review-record reduction
> amendment for the finding, the reasoning, and the boundary between what prompted the re-examination and what
> justifies the change.

## Success Criteria

1. **The final integration step's residual length is a function of its stop inventory.** Every stopless run is a
   verb call; what remains is the stops in order, each with the guarding invariant. Checkable against C's table for
   the reconcile arm, which fixes that arm at five stop-bearing spans containing seven individual stops.
2. **A fully clean candidate's machine-computed interlock surface renders what the approver decides on** — what is
   merging, where review landed, the merge method — not all nine established facts, with the collapsing done by the
   composer. Free-form extension evidence renders in a separate labelled block. Both are tested structurally, not
   judged from a transcript.
3. **The posted review record and executed settlement are exactly what approval covered.** The checkpoint persists
   one digest-bound record and canonical settlement plan; merge posts the record and executes the plan
   idempotently. Missing, stale, ambiguous, or actor-mismatched settlement invalidates before release or merge.
    - _Amended 2026-08-15 — per § G's review-record reduction._ The original text is preserved above; it is not
      edited into agreement with what shipped. **Reads:** _The executed settlement is exactly what approval
      covered._ The checkpoint persists one digest-bound canonical settlement plan; merge executes it
      idempotently. Missing, stale, ambiguous, or actor-mismatched settlement invalidates before release or merge.
      The record clause is withdrawn with the composed record itself; no posted-record obligation survives. This
      narrows a criterion at the verification boundary, which is defensible only because the narrowing is a
      deliberate scope reduction on external grounds, decided by the maintainer, with the original text and the
      reason both visible.
4. **`propose` and `submit` name different axes without adding happy-path ceremony.** `arc propose` replaces
   `arc finalize verify`, records Candidate while leaving `State: Active`, and `arc submit` replaces the old
   transition. Under no-review configuration the path adds zero commands, commits, approvals, and agent judgments.
5. **Candidate is a typed attestation and verified lineage, not a lifecycle state or exact-head boolean.** A
   review-driven old-target/new-target response with approved delta verification advances it automatically;
   operational-only projection churn preserves it; a changed converged lineage receives an exact-head full
   attestation through `arc propose`; an unexplained reviewable delta blocks with the exact delta and one corrective
   action. No Candidate refresh or repair command exists.
6. **Ordered standard-review sources preserve preference across publication.** With
   `[coderabbit-pr,codex-pr,delegated-agent]`, pre-PR resolution returns `awaiting-change-request`, then selects
   CodeRabbit PR after creation; submit carries that exact deferred reservation without calling it settled or
   no-op, and the delegated agent cannot leapfrog it. Reversing the order selects the local carrier before
   submission. Frontline remains a separate advisory lane.
7. **Review-fix verification is bounded and primary-owned.** One fix increment produces one
   `targeted | focused | full` decision with persisted evidence. Full verification and adversarial verification do
   not automatically re-enter per pass; any implementation changes receive one converged Tier 3 run followed by
   `arc propose`, and B1 rejects the current head until that full attestation exists.
8. **`arc integrate` names no lifecycle transition.** `arc submit` is the scheduling verb; the old verb name is
   absent from all inventoried source, doc, and test surfaces — including `lifecycle-transitions.ts`'s `VERBS`
   registry, transition edge, `reopen` inverse, and illegal-cell table; `integrate` survives only as the namespace
   for `checkpoint` and `merge`; a bare invocation names its replacement and lists subcommands.
9. **`Integrating` means submission/public integration is underway.** `submit` fires at the publication-step head
   ahead of the push extension. Transitioned-but-unpushed and pushed-but-uncreated interruptions both project one
   exact resume action, without claiming a PR already exists.
10. **No agent hand-rolls a wait, a parse, or a merge-method discovery.** The required-checks await is a bounded
   verb arm resumable across its deadline; PR resolution returns a typed disposition covering all six classes at
   all 5 inventoried sites; and no lane discovers a disallowed merge method by attempting the merge.
   B2 also rejects host-policy movement after checkpoint.
    - _Amended 2026-08-17 — host-evidence scope._ The original text is preserved above; it is not edited into
      agreement with what shipped. **Reads:** _...and no lane discovers a **repository-disallowed** merge method by
      attempting the merge._ The validation reads the repository's merge-method allowances alone (B4's amendment),
      so a branch-scoped restriction — `required_linear_history` foremost — is still discovered at the merge
      attempt. The criterion narrows to what the shipped read can establish; the wider claim returns with a
      branch-rules read.
11. **The repository lock cannot misreport approval state.** Release happens only through the verb's lifecycle
   gate inside B2; every approval-voiding exit re-locks before returning; a checks-deadline yield leaves the
   release standing with the required checks as the blocking authority; and no workflow-wide prose invariant
   carries the re-lock obligation — the errand lane states its one-fire rule once.
12. **`Coverage` is absent from the pull-request record** at all 5 inventoried sites, nothing replaces it, and the
   three non-record `Coverage` families are untouched.
13. **The approval pin is enforced, not narrated.** No surface tells the approver their approval is conditional: the
   conditionality clause is gone from all 5 H1 loci across both workflows while the consequence disclosure remains,
   and the pin is a precondition the merge verb validates — demonstrable by a mismatched-head call returning
   `invalidated` with no prose instructing the agent to check.
14. **Every logical control obligation survives or names its covering enforcement, and each change is
   authorized.** Every interlock release survives. The `pre-merge` extension seam has one enactment per path: the
   work-unit fire moves later and `run-errand`'s duplicate fires collapse to one at the shared position. The
   transition's `commit-interlock` release moves to the publication-step head; the merge-lock release and re-lock
   obligation move into B2. Every Goal 5 deletion names the host pin or typed reader that covers the failure it
   guarded. Any other relocation, deletion, or lost obligation is a defect.
15. **Agent discovery is typed and idempotent.** Session initialization resolves Candidate/review loci without
   parsing narrative fields, including `candidate-convergence-verification-pending`; every locus carries one next
   action; repeated propose, submit, review-resume, checkpoint, and merge calls either advance or report the same
   observable resume point; every refusal names the failed invariant and one corrective command.
16. **The errand ship path completes in-session by default.** `arc errand leave` fires only on a session-ending
   tail: its trigger clause names session end, no step instructs leaving at pull-request open, and the
   unattended-merge replay references no retained checkout.
17. **The boundary is honest about check cadence.** No prose step assumes required checks are green before B2's
   await; the interlock surface reports check state as observed; a deferred-CI project runs both lanes unchanged
   with no added agent polling.

## Open Questions

Implementation detail, resolved during the work:

- **The storage locus and serialization format for checkpoint persistence.** B3 fixes that it is verb-side,
  gitignored, per-WU, and keyed by the handle; which file under the per-WU user workspace and what encoding is a
  tactical call.
- **Module placement for the extracted wait primitive** and how much of `awaitHostedReview`'s envelope vocabulary
  becomes shared schema versus per-instantiation.
