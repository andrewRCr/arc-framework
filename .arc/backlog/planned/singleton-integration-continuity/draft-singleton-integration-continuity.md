# Draft: singleton-integration-continuity

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-09-19); split from the back-end half of
  `wu-lifecycle-state-model` and scheduled as corrective delivery-runway work unit 4.
- **Purpose:** Keep the Candidate, singleton lifecycle position, and integration checkpoint coherent from
  publication through merge, archival, and teardown, while treating artifact placement as a projection rather
  than durable state authority.
- **Planning posture:** `Heavy`, `P1`. Planning may overlap `delivery-rebuild-continuity`; implementation follows
  the corrective runway and must preserve forward compatibility with `strategy-storage-evolution.md`.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns and moved lifecycle-tail records pending holistic integration at this work unit's first_
> _planning iteration. Integrate — or consciously reject — each one._

### `[ ]` **Prevent local-ref residue from outranking an archived Shipped record**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-20); confirmed by teardown on 2026-08-15.
- _Concern:_ readiness composition merges local-ref oracle candidates with tree records so a lingering
  `feat/<slug>` ref can emit Active over an authoritative `completed/` meta reading Shipped. ROADMAP regeneration
  then resurrects shipped work and discharged dependency edges.
- _Evidence:_ deleting the lingering branch immediately restored the correct Shipped result; delivery candidate
  refs and temporary worktrees were inert to status. Their separate cleanup-driver gap is already owned by
  `delivery-native-stack-composition`.
- _Fold-in:_ make completed-and-Shipped tree evidence outrank generic local-ref candidates while surfacing the ref
  as cleanup residue. Preserve legitimate in-flight authority and verify the dependency-discharge consumer.

### `[ ]` **Recognize the archived-but-not-torn-down work unit as a proved terminal frame**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during
  `session-locus-model` closeout recovery.
- _Concern:_ the supported integration cadence archives the active meta before merge and physical teardown. An
  interruption in that interval leaves a valid durable role whose active-subject projection is
  `subject-unresolved`, even when a unique same-slug completed subject, exact checkout/head, and open change request
  prove the monotonic terminal transition.
- _Fold-in:_ extend the existing pending-teardown terminal-condition decision to cover this pre-merge interval and
  define the state/projection authority recovery consumes. Coordinate exact-generation mutation and locked cleanup
  with `locus-generation-binding`; keep arbitrary missing or ambiguous subjects fail-closed.
- _Verification:_ cover archive-before-merge restart, merge-before-teardown, partial teardown, retained-control
  finalization, and missing/ambiguous completed-subject negatives in reader, session-init, and recovery tests.

### `[ ]` **Own placement-as-record: directory layout is projection of lifecycle state**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-07-18);
  captured at the storage-substrate grooming (2026-07-17).
- _Concern:_ `backlog/{provisional,planned}` / `active/` / `completed/` placement is today a state _encoding_ —
  the storage-substrate grooming names this a coupling smell: concurrent lifecycle transitions make placement a
  shared-mutable surface, and changing the layout breaks anything that reads it.
- _Fold-in:_ record the target consequence as a design position at grooming: lifecycle state is a record field;
  directory placement is a projection of it; relocating a WU is a record-field change ARC cannot break on.
  Coordinate with `coupling-blast-radius-audit` (now a hard dep of this WU — its enumeration surfaces the
  placement readers) and `strategy-storage-evolution.md` Principles 1–2.

### `[ ]` **Formalize the shipped, pending-teardown worktree terminal condition**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `finalize-parallelism` Task 4.1 slate resolution.
- _Concern:_ `worktree-teardown-decoupling` deliberately represents a self-teardown husk through existing
  signals—detached HEAD, ARC ownership marker, and a completed-record match—without adding a lifecycle state.
  Decide whether that terminal condition graduates into the four-state vocabulary, becomes an annotation, or
  remains a derived operational projection.
- _Boundary:_ consume the shipped mechanics and the `session-locus-model` reporting record; do not rebuild them.
  This WU owns the state vocabulary and may re-vocabulary the locus record later without schema churn.

### `[ ]` **The readiness reform has a tail-end twin: verification-passed wants a `Candidate` projection**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Forward amendment (2026-08-19):_ The transition descriptions below are historical input, not the current
  boundary contract. `arc attest` runs after verification and establishes the private Candidate/prepublication
  locus; `arc publish` ends private preparation and starts public integration before the first push and change
  request. Keep Candidate on the attested artifact/projection axis when integrating this item.

- _Observation:_ the core reform names planning-completion as an attested artifact-axis signal that `State`
  flattens into the scheduling axis, with the missing primitive being its projection to an observable field
  (`Ready`). The identical shape exists at the other end of the lifecycle and is not captured. Verification
  completes entirely under `**State:** Active` — the task list's verification phase runs Tier 3 gates, success
  criteria, and the adversarial pass before any lifecycle transition — and its terminal event, `arc finalize
  verify`, records itself **only as a string prefix in the meta's free-text `Next Action`**, which the session-init
  probe then pattern-matches to set `sessionType: integration`. That is the same defect the reform already
  states for readiness, in the same field, one lifecycle stage later.

- _Observation (what the signal is worth):_ past verification means the implementation holds up against its
  design, which is materially stronger and different in kind from "the code may still have defects" — the
  integration-level concern. Nothing in `State` distinguishes them, so an outside observer, the roadmap, and an
  agent deciding what a work unit needs next all read the weaker signal.

- _Observation (the flattening this exposes):_ ARC distinguishes review **lanes** — frontline and local versus
  hosted and PR — but has no lifecycle distinction between "no eyes on this but ours" and "visible to the team or
  the public." The lanes carry the audience difference; the state model does not. A `Candidate` state is where
  that distinction would live: work whose implementation is attested but which has not yet gone public.

- _Approach:_ treat `Candidate` as the tail-end peer of `Ready` on the same attested artifact axis, so the reform
  lands one projection primitive with two instances rather than solving readiness and then rediscovering the shape.
  The two transitions the vocabulary then supports are **attest** (implementation clears, enter verification and
  local review — private) and **publish** (verification and local review clear, open the pull request — public).

- _Related — a live inconsistency the tail state would resolve:_ `integrate-work-unit` Step 1 states that
  "the `Integrating` state covers PR open through review-response," but fires the transition at Step 1 while the
  pull request opens at Step 3, with the local self-review preflight in between. So a work unit is `Integrating`
  through a window where nothing is public. The lifecycle command is now `arc publish`; its owning boundary work
  moves that fire point to the publication-step head while deliberately minting **no** state and not re-keying
  `Integrating`, per the `project-state-integrity` axis contract recorded in this WU's buffer. That
  change shrinks `Integrating` to the public phase, which is the carve-out a `Candidate` state would make anyway,
  so the two compose rather than collide.

- _Captured during:_ `review-protocol-alignment` grooming, 2026-07-26 — surfaced while settling the scheduling
  verb now named `arc publish`, distinct from the `arc integrate` procedure namespace.

### `[ ]` **Prevent withdrawn singleton Candidates from reviving without a new public boundary**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-09-07);
  captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ a withdrawn one-member delivery Candidate can be rediscovered from surviving topology and treated as
  publishable again even though its public boundary was explicitly retired.
- _Fold-in:_ model withdrawal as a lifecycle fact that prevents implicit revival; require a new authorized public
  boundary to create a successor Candidate while preserving the historical record.

### `[ ]` **Discriminate the host-admission remedy by observed condition, not one pending bucket**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ `createGhChangeRequestMergeObservationPort` distinguishes seven `unresolved` conditions, each
  with its own detail string, and the checkpoint collapses every one of them into `reason: "host-pending"` with
  the single remedy "Retry the bounded checkpoint observation." Only three are actually pending: the two API
  failures and the three-read limit reached while GitHub is still computing. The other four cannot be changed by
  retrying — a `baseRef` or PR-number mismatch, head containment unavailable under strict target policy,
  test-merge parents not matching the requested coordinates, and `pull.mergeable === false`. The last is the
  sharpest: a genuine merge conflict is reported as "host-pending" and the operator is told to retry.

- _Evidence from a live run, 2026-09-19:_ `arc integrate checkpoint` returned `host-pending` with the retry
  remedy; the retry returned a byte-identical refusal, because the condition was stable. The remedy induced
  exactly one wasted cycle and would have induced unbounded cycles from a caller that trusted it.

- _Already narrowed, do not re-diagnose:_ the instance above was the base-OID comparison in the pull-metadata
  check, fixed by PR #659 (`fix(integration): validate named base in host admission`), which compares the base
  _ref name_ there and proves the base OID through ordered test-merge parents instead. That removed the
  condition that fired on **every** base movement. What remains is the structural over-broadness, not that bug.

- _Approach:_ carry the observation's condition out of the adapter as a typed discriminant rather than only as
  prose detail, and key the remedy on it: retry for the genuinely pending three, push for a head mismatch,
  retarget for a base-ref mismatch, resolve conflicts for `mergeable === false`, reconcile the base for the
  containment case. Rename or split the reason so a stable condition is not reported as pending.

- _Family:_ the inverse of the "diagnostics that report a state without naming the fix" family tracked under
  "Make the in-flight artifact advisory name its remedy" — this one names a fix that does not apply, which is
  worse, because a correct-looking remedy invites the retry loop instead of an investigation.

- _Scope:_ refusal discrimination and remedy selection; no change to admission semantics, the three-read bound,
  or the test-merge proof.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration base reconcile, 2026-09-19.

### `[ ]` **Name what settlement covers on the interlock surface, not just how many**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ the checkpoint's interlock surface is the evidence an owner approves a merge over, and its
  `settlement` section renders only a count — "1 approved disposition set(s) require settlement." Every sibling
  section on that same surface names its specifics: required checks name the state and that it is bound to the
  exact approved head, merge method names its method _and_ its policy fingerprint digest, and the checkpoint
  section names the full checkpoint handle. Settlement is the only section that asks the owner to accept an
  exception without saying what the exception is.

- _The information is already in hand at the render site._ `checkpoint.ts` composes the plan, extracts
  `settledDispositions = settlementDispositionIds(settlementPlan)` — deduplicated and sorted — and then uses only
  `.length` in the rendered evidence. Each action is richly typed: a `channel` discriminant (`hosted`,
  review-response, `candidate-response-confirmation`) plus a `dispositionId` digest and channel-specific fields.
  So the channel mix and the identifiers are both available and deliberate, not reconstructible guesses. This is
  a rendering omission, not a data-availability problem.

- _No other route to it._ The plan is persisted into the checkpoint record and executed at merge
  (`merge-composition.ts` `executeSettlement`), but no result payload emits the plan or the disposition ids —
  the checkpoint payload carries `approvedHead`, `candidateTailDiff`, `requirementSummary`, `statusSummary`,
  `checkpointHandle`, `mergeMethod`, `interlockSurface`, and `movementObservation`, and nothing else mentions
  settlement. An operator cannot look up what they are approving without reading the stored record.

- _Evidence:_ observed on the live approval for PR #656 at approved head `f882afc2d`, 2026-09-19. The surface
  reported one disposition set requiring settlement and gave no channel, id, or target; the merge then settled it
  silently. Nothing went wrong — the point is that nothing could have been checked.

- _Approach:_ render the settlement section from the plan the way its peers render theirs — per-channel counts
  and the disposition ids (short digests are enough, matching how merge method already prints a policy
  fingerprint) — and consider emitting the plan in the checkpoint payload for machine callers that must reason
  about it before approving.

- _Distinct from the advisory-remedy family:_ those entries are about a diagnostic that fails to name an action.
  This one names no action because none is wanted — it under-describes a condition the owner is asked to accept.
  The shared root is that a surface whose only job is to inform a decision is withholding what it already holds.

- _Scope:_ interlock-surface rendering and optionally payload exposure; no change to settlement composition,
  execution, or the checkpoint handle contract.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration merge approval, 2026-09-19.

### `[ ]` **Decide whether raw review evidence survives the archive sweep, and say so**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- _Observation:_ `arc archive` removes the per-WU user workspace as part of the ship sweep. Observed directly
  during `delivery-post-landing-conflict-recovery`: `.arc/user/andrew/<wu>/` was gone at 22:45:40 local, between
  the archive-phase composition commit and the archival commit, taking `SESSION-NOTES.md` and both
  `review-standard-*` record directories (chunk reports, aggregate result, evaluator report) with it. The
  contents are gitignored, so nothing is in git, and the notes-sync ref `refs/notes/arc/user/andrew` held only a
  snapshot predating that day's review work — so the raw evaluator output is unrecoverable. Two consequences
  follow. `integrate-work-unit.md` Step 10 calls `arc user close` and describes itself as "the owning caller";
  by then it is always a no-op on this path. And `archive-work-unit.md` states that teardown belongs to Step 11,
  which is true of the branch and worktree but not of the user subdir it silently retires.

- _Why it matters:_ the narrative survived here only because Steps 5-6 write Release Notes and Completion Notes
  into the tracked meta before Step 8 sweeps — that ordering is sound and should stay. But this work unit closed
  on an owner-accepted review terminus rather than a clean pass, which is exactly the case where the raw
  findings are the evidence someone would want later, and they are the part that does not survive.

- _Approach:_ settle the intent first — whether review artifacts are session-local scratch (disposable at ship)
  or evidence (durable past ship). If durable, carry them into the archived `completed/<dated>/<NN>_<name>/`
  set or into the notes ref before the sweep runs. If disposable, say so plainly in `archive-work-unit.md`,
  correct its teardown-ownership sentence to exclude the user subdir, and reduce Step 10's `arc user close` to
  the documented idempotent backstop it actually is.

- _Boundary:_ the sweep's scope over the user subdir and the two workflow statements that describe it. Not a
  redesign of the user workspace, the notes-sync mechanism, or review-record composition.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration, 2026-09-18, after the loss was
  observed and confirmed against the sync state and notes ref rather than inferred.

---

## Seed design record

- _Proposal shape:_ mint a new work unit from the back-end half of the existing `wu-lifecycle-state-model` stub,
  and add it to `RELEASE-GATES.md`'s stabilization sequence as the non-delivery sibling of the three `delivery-*`
  work units. This is a **split plus schedule**, not a new concern: most of the territory is already captured in
  that stub's inbound buffer. Do not re-derive it at drain; read the buffer first.

- _Why split rather than fold in._ `wu-lifecycle-state-model`'s stated Purpose is front-end — unbundling
  planning-completeness from activation/scheduling so async parallelism can hold impl-ready work in the backlog.
  Its buffer has since accreted the back-end: publication → merge → archival → teardown state coherence. Those
  are two designs sharing the word "lifecycle". Folding this session's defects into the existing stub makes an
  already-large stub larger and later, and couples an urgent corrective need to an unrelated reform.
  `RELEASE-GATES.md` already warns against growing one uncut work unit ("Do not extend the consolidation
  further"); splitting is the same instinct applied in the other direction.

- _The spine, stated as one thing._ Every defect observed belongs to a **seam between three state machines that
  were each designed separately**, not to a bug inside any one of them: the **Candidate** (subject digest,
  lineage, terminus), the **lifecycle position** (`Active`/`Integrating`/`Shipped`, `active/` vs `completed/`),
  and the **integration checkpoint** (base movement, publication currentness, merge authority). A work unit that
  owns "these three agree from publication through merge to archival" has a real boundary; one that owns "assorted
  singleton bugs" does not.

- _Why it rotted unobserved._ Recent work has concentrated on stacked delivery, which exercises its own code path
  through the same ceremonies. The singleton integration tail has not been walked end to end in some time. The
  three `delivery-*` work units in the runway are scoped at delivery mechanics — stacked members, private chains,
  correction convergence — so none of them would have surfaced this.

- _Evidence: five reproductions from one continuous run_ (`delivery-post-landing-conflict-recovery` integration,
  2026-09-18/19), each recorded in its own entry above where one exists:

    1. **Terminus vs the mandatory base merge** (Candidate ↔ checkpoint). An accepted terminus is bound to an exact
       subject digest; the checkpoint requires a base reconcile; the reconcile changes the digest and invalidates
       the terminus; the only route to re-accept one appears solely after a completed pass, which the invalidation
       zeroes. Execute-bound errand, queue position 1.
    2. **Swept work unit misreported** (lifecycle ↔ status). After the archive commit, `arc status {name}` returns
       `planning / active` for the checked-out work unit. Execute-bound errand, queue position 2.
    3. **Archive-before-merge circular dependency** (lifecycle ↔ checkpoint). Under `archive.cadence:
       with-integration` both positions block once the boundary is stale: archived routes to a continuation that
       refuses on a shipped work unit, un-archived blocks on `lifecycle-incomplete`.
    4. **Archival destroys review evidence** (lifecycle ↔ evidence). `arc archive` retires the per-WU user
       workspace, taking the raw evaluator reports with it; only the narrative survives, because composition
       happens to run first.
    5. **Singleton routed through a delivery reader** (singleton ↔ delivery). `arc review status --work-unit`
       returns an operational-failure remedy for what is simply the wrong route for a non-delivery work unit.

- _Prior art already in the stub's buffer — confirm, do not re-derive:_

    - **"Recognize the archived-but-not-torn-down work unit as a proved terminal frame"** (2026-08-03) describes
      defect 3's interval exactly: "the supported integration cadence archives the active meta before merge and
      physical teardown. An interruption in that interval leaves a valid durable role whose active-subject
      projection is `subject-unresolved`."
    - **"Prevent local-ref residue from outranking an archived Shipped record"** (2026-08-20) is very likely
      defect 2's mechanism, already diagnosed with a fix direction: a lingering `feat/<slug>` ref outranks an
      authoritative `completed/` meta, and "deleting the lingering branch immediately restored the correct Shipped
      result". **Unconfirmed:** that entry reports `Active` where this session observed `Planning`. Confirm they
      are one defect before designing, and merge the entries if so.
    - **"Own placement-as-record: directory layout is projection of lifecycle state"**, **"Formalize the shipped,
      pending-teardown worktree terminal condition"**, **"Prevent withdrawn singleton Candidates from reviving
      without a new public boundary"**, and **"The readiness reform has a tail-end twin: verification-passed wants
      a `Candidate` projection"** all sit on the back-end axis and should move with the split.

- _Forward-compat: both check-docs fire, and each names a real tension._

    - **`strategy-storage-evolution.md`** — two of its Self-Check triggers hit directly: "storage of WU artifacts
      — where `meta-*` … live" and "WU identity or branch coupling — how ARC associates WU records with git
      artifacts (branches, worktrees, commits)". Defect 2 _is_ a branch-coupling defect. The `active/` →
      `completed/<dated>/<NN>_{name}/` move is placement-as-record, which is a tracked-`.arc/` assumption; under
      the materialized-git-backing-store target, lifecycle state is a record in the store rather than a directory
      the file sits in. The fix must not deepen placement-as-record — resolve state from the record and let
      placement be a projection of it. In-repo remains a supported tier, so the move does not disappear; it stops
      being the source of truth.
    - **`strategy-procedure-evolution.md`** — the archive-before-merge ordering is **prose-encoded logic**. The
      checkpoint branches on `lifecycle.state === "shipped"`, but the reason it is shipped at that moment is a
      step ordering that exists only in `integrate-work-unit.md`'s narrative. No type expresses "archived early,
      under `with-integration`, and therefore not yet merged". That is exactly the accretion this check-doc warns
      against, and it is why defect 3 presents as a circular dependency rather than a typed refusal.

- _Residual after errand 1 lands — this work unit inherits it._ The terminus-carry errand
  (`chore/carry-accepted-review-terminus`, reviewed read-only 2026-09-19) gates the carry on
  `currentness.convergenceVerification === "satisfied"`, which is the only path that publishes with
  `repairCurrent: true`. That is the right gate and it clears defect 1 on the converged path. It leaves defect 3
  untouched: the `shipped` → `attestNewRootArgv` selector in `checkpoint.ts` and the
  `lifecycle-incomplete` ↔ `resume-pre-publication` circularity both survive. So whenever a boundary goes stale
  for a reason convergence does **not** satisfy, a shipped work unit still lands on `resume-pre-publication`
  with no reachable continuation — `arc review pre-publication` refuses on the absent active meta, `arc publish`
  is not open to a shipped work unit, and un-archiving to escape re-blocks on `lifecycle-incomplete`. The wedge
  is narrowed to a smaller entry condition, not removed. Whether that remaining entry condition is reachable in
  practice is worth establishing early here, because it decides whether this is a latent hazard or a live one.

- _Two carried review notes from that errand, if they are not closed there._ The locus allow-list in
  `recoverAttestedOwnerTerminusBoundary` (`publication-pending` | `hosted-review-pending` |
  `delivery-status-required`) is its one untested guard — the four unit cases vary `repairCurrent`, `candidateId`
  and a null terminus, none varies `locus` — and that guard is what stops a terminus being rebound into a locus
  that never earned one. Separately, a carried terminus retains `completedPasses` measured over the pre-movement
  subject while feeding `readLaneProgressAcrossLineage`; keeping it as provenance of the judgment rather than
  authority over the new subject looks right, but given convergence-acceptance is the ordinary terminus it wants
  an explicit statement rather than an incidental one.

- _Sixth territory item: a shipped work unit leaves its `plan/` branch behind, and nothing reaps it._ After ship,
  both `feat/<slug>` and `origin/plan/<slug>` survive. `arc teardown` resolves exactly one matching local branch
  and refuses on multiple matches; it does not discover or delete a live remote-only sibling (confirmed by the
  primary while reviewing errand 2, 2026-09-19). So the `plan/` ref outlives the work unit with no verb that
  retires it.

    - **This is defect 2's fuel supply, not a separate annoyance.** The surviving `origin/plan/<slug>` carries
      `State: Planning` in its tracked meta, and that branch observation is exactly what produced the
      `planning / active` misreport. Errand 2 corrects the _precedence_ so the archived meta outranks it; the ref
      still exists and is still read. Retire the residue and defect 2 loses its input entirely rather than being
      out-ranked at read time — worth deciding deliberately which of the two is the real fix and whether both are
      wanted.
    - **Ownership check, done 2026-09-19 — do not redo it.** `graduation-cleanup` covers planning-history squash
      and the `--force-with-lease` push at Planning → Active; a grep across its draft for stale/delete/remote/reap
      matched only that force-push line. It does not reap the branch. `delivery-native-stack-composition` owns a
      cleanup-driver gap, but for delivery candidate refs and temporary worktrees.  `review-checkout-lifecycle`
      owns review materializations and ceremony-created checkouts. None covers a singleton work unit's `plan/`
      branch, and no inbox entry claims it.
    - **Prior art one lifecycle class over.** The execute-bound errand "Reap zero-delta Errand branches during
      clean abandonment" states this principle exactly, for Errands: "a successful terminal operation immediately
      created an advisory the following operation had to investigate." Same shape, different subject. Decide
      whether the work-unit case is that errand generalized or a sibling of it; prefer generalizing, since two
      lifecycle classes independently reaching the same defect is the argument for stating the obligation once.
    - **Approach direction.** Make the ref set a work unit owns explicit, and have the terminal operation retire
      the whole set rather than one resolved branch. A multi-match should produce a reap plan, not a refusal.
      Cover local and remote-tracking refs; preserve anything unmerged or carrying unique content.

- _Advisory dependency — the residue advisory cannot be authored until this work unit supplies a verb._ The reflex
  fix is to warn about the residue. Two captures constrain that, and the order matters.

    - `operational-advisory-registers` holds the governing rule — "an advisory with no available action is not an
      advisory… either give it an action or do not raise it" — and already names a linked-worktree
      cleanup-residue section among the sections it must classify.
    - The execute-bound errand "Make the in-flight artifact advisory name its remedy" is closer still: same
      advisory family, same shadowed-meta trigger, and its approach appends an interlock-gated `git branch -d
      <branch>` remedy. But it scopes to "a local branch with no worktree and no marker," and this residue is
      remote-only. That is a **scope extension to that errand**, not a new concern — widen it there rather than
      opening a third site.
    - That errand also carries a standing escalation clause: it is "fourth in a family of diagnostics that report
      a state without naming the fix… If a fifth appears, state the obligation once in the spine rather than
      patching another site." A new cleanup-residue warning would be the fifth, so the clause fires — and this
      work unit is the spine for the lifecycle-tail half of that family.
    - **Ordering constraint:** no residue advisory can name a runnable verb until the reap above exists. Land the
      retire-the-ref-set behaviour here first; the advisory work then has something to point at.
    - **Corrected assumption — recorded so nobody re-derives it.** Stale branches do _not_ generate session-init
      noise. The derived-locus roster is checkout-based: verified 2026-09-19 against a live `arc recover audit`
      whose roster contained only `free-primary` / `work-unit` / `unresolved-checkout` / `unmanaged-checkout`
      rows, each keyed to a checkout path, with `locusGuidance.cleanup: []` and no row for the then-live
      `origin/plan/delivery-post-landing-conflict-recovery`.
    - **The residue is unmonitored at rest, and that is the sharper form of the problem.** The in-flight
      derivation advisory (`in-flight-derivation.ts`, "… was shadowed by …") fired at every publish and archive
      ceremony in this run, which makes it look like the residue is being reported. It is not, at the state that
      matters. `classifyInput` enumerates **active** metas only — "every readable meta becomes a work-unit
      candidate" — and `dedupeWorkUnitCandidates` emits `candidate-shadowed` only for group members that lost to
      a winner. Before the archive, `feat/<slug>` and `origin/plan/<slug>` both carry an active meta, the group
      has two members, and the advisory fires. The archive moves the `feat/` meta to `completed/`, the group
      drops to one, its sole member wins by default, and the warning stops — at exactly the moment the `plan/`
      ref becomes permanent residue. Confirmed 2026-09-19 against the errand-2 terminal-topology regression,
      which leaves one warning and it is not this one. Note the silencing is caused by the **archive step**, not
      by errand 2's precedence change, which does not touch this module; do not mis-attribute it to the fix.
    - Consequence for the reap work above: there is no standing signal for this residue at all. The advisory
      covers only the transient pre-archive window, so the permanent state is unobserved rather than merely
      noisy. That strengthens the case for a reap verb instead of better reporting.

- _Scope boundary — what this work unit does **not** take._ Review-lane contracts (pass accumulation across an
  approved fix, the unstated protocol-ordering constraint) belong to `review-activity-contracts`; folding them in
  would recreate the same two-axis error this split exists to correct. Pure ergonomics (commit-template subject
  overflow, the frontline action that loops, the unsatisfiable singleton remedy) stay errands. Delivery mechanics
  stay with the three `delivery-*` work units.

- _Sequencing._ Errands 1 and 2 ship first and independently — they unblock the wedged work unit and should not
  wait on this design. This work unit then takes the structural question, including whatever those two fixes
  reveal. Note the ordering is not optional: this work unit would hit defect 1 at its own merge, so it cannot
  dogfood itself until errand 1 lands.

- _Open questions for the Owner at drain._ Whether the front/back split of `wu-lifecycle-state-model` is clean or
  whether the core async reform depends on back-end axes in ways the buffer does not show; whether the back-end
  half takes a new slug or keeps the existing one with the front-end half re-stubbed; and where it lands in the
  `RELEASE-GATES.md` order relative to `delivery-rebuild-continuity` and `delivery-correction-convergence`.

- _Honest limit on the evidence._ One continuous run, on one work unit, in the self-hosting repository. The
  reproductions are solid and several are independently confirmed in the buffer from earlier dates, but the
  breadth claim — "the singleton integration tail has an unobserved seam" — rests on this one walk plus that prior
  art, not on a survey.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration, 2026-09-19, at the point where the
  work unit could not complete its own merge.

---
