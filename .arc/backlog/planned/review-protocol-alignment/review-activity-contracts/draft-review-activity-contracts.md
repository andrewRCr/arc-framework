# Draft: review-activity-contracts

- **Origin:** [internal]
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Keep hosted-review guidance at its contract floor and make planning and verification audit dispatch
  explicit, typed, and bounded.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Make review spend visible before it is incurred, and keep "review" to one sense per surface**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-activity-contracts`

- _Observation:_ A delegated-agent review ran during task execution, before any Candidate existed, and bound to
  nothing; the standard lane later composed as no attempts. The immediate reachability gap is routed as an Errand
  (§ Errand, "Say in the task loop that review during task work discharges no review lane"). What stays here is the
  part that is design rather than wording.

- _Approach:_ two pieces. First, a vocabulary pass over the task-loop surface, where "review" currently names a
  human-approval boundary and a lane with bound evidence without distinguishing them — the cohort's Shared Goal
  "load-bearing vocabulary is used exactly" applied to the one file an agent holds at the moment of the decision.
  Second, have `arc attest` report the composed lane evidence for the subject it mints, so the first moment a
  bindable target exists is also the moment its review evidence is stated — here, frontline none and standard none.
  That is a field on an existing typed result, which is the cohort's sanctioned remedy form rather than new
  orchestration machinery.

- _Prior art:_ this is D7.1's move for a second rule at a second decision point. D7.1 found the stop discipline
  stated "only in a completed work unit's archived spec, which the agent running integration never loads" and
  resolves it by stating it in `integrate-work-unit.md`. Same shape, different rule, different workflow.

- _Relation to D7.2:_ "Gate the activity, not the mechanism" argues from adopters who decline spend at every fire
  point and get nothing back. This incident is the inverse failure — spend incurred willingly that bought nothing
  creditable — so it is evidence for the same goal from the other side.

- _Boundary:_ does not re-derive which rules yield to judgment, which stays with `judgment-authority-model`, and
  does not add a review-budget ledger, already rejected under the cohort's Alternatives.

- _Captured during:_ `concurrent-integration-characterization` pre-publication review, 2026-09-15.

### `[ ]` **Make no-material Frontline follow-up effective across Candidate rerouting**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-16).

- _Observation:_ A private delivery-member Frontline pass returned the typed
  `frontlineFollowUp: stop / no-approved-material-fix` result after every finding was rejected against the
  governing contracts. Candidate response and delivery rerouting then selected the member's new exact head with no
  durable Frontline progress, forcing another whole-target pass that reproduced the same two out-of-contract
  findings. The typed no-material result is therefore operationally ineffective at the transition where it is
  supposed to guide continuation.

- _Approach:_ trace the result's intended binding and lifetime through Candidate advancement and private-member
  recomposition. Either consume a safely preserved exact typed continuation across the authorized transition, or
  stop returning a follow-up signal that no caller can act on. Preserve exact-target review authority: changed or
  materially interacting bytes must still create a fresh obligation, and rejected findings must never become review
  clearance by implication.

- _Boundary:_ keep this an atomic Frontline response/rerouting contract reconciliation. If a correct repair requires
  persistent cross-target review evidence or a new applicability doctrine, promote or absorb it into the direct
  successor to `evidence-applicability` rather than hiding design in the Errand.

- _Note:_ review-infrastructure smell — the observed symptom is narrow, but the drain should re-triage it if the
  binding cannot be repaired by composing existing response and Candidate-transition records.

- _Captured during:_ `evidence-applicability` private delivery review dogfooding, 2026-09-12.

### `[ ]` **Make the frontline run-or-skip decision explicit in delivery review**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- WU_Target: review-activity-contracts

- _Observation:_ the first post-ship stacked-delivery session followed `arc delivery position` into the exact
  member's typed standard-review status action and silently skipped the configured `coderabbit-cli` frontline
  activity. `deliver-stack.md` says to apply `frontline-review` before standard review, but that callout is not a
  typed step in the member dispatch and no adjacent surface requires or records an explicit run/skip judgment. The
  required hosted standard review still ran, so this is an agent-ergonomics and activity-accounting gap rather than
  a weakened merge gate.

- _Approach:_ at the delivery-member review decision point, surface one explicit typed frontline run-or-skip action
  whose skip carries the agent's disclosed rationale. Compose configured source availability and exact-target
  currentness without making the advisory lane mandatory, duplicating the standard-review obligation, or adding a
  permission turn when the agent can make the bounded judgment.

- _Field evidence (2026-09-12):_ private prepublication needed to skip Frontline for an exact 13,395-line Member 2
  while retaining it for a 4,913-line Member 3. The `--lanes` judgment and opaque resume token replayed the skip
  across every outstanding member: retaining it suppressed Member 3, while dropping it reselected Member 2. The
  safe workaround had to run Member 3's exact-target Frontline operation outside the composed cursor. Bind a skip
  to the selected target or deliverable and consume it when that target advances, so the next member recomposes its
  configured default rather than inheriting prospective advisory-lane authority.

- _Files:_ delivery-member review dispatch in `deliver-stack.md` and the review status/position composition that
  owns the adjacent typed action, as the design requires.

- _Captured during:_ `plan-segmentation` Member 1 hosted-review correction, 2026-09-09.

### `[ ]` **Make review-lane progression monotonic after publication**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: review-activity-contracts`

- _Observation:_ frontline is the local prepublication shaping pass: it narrows what a later human or hosted
  standard reviewer sees. During Errand PR #637, frontline and hosted review were clean on one head; a narrow
  CI-driven E2E expectation correction moved the head, and hosted Codex then completed a full clean review on the
  new exact target. Afterward, the lane driver still returned `ready / run-frontline` for that current head. The
  requested CodeRabbit CLI pass was canceled before it produced a durable operation. This is a backward lifecycle
  edge, not missing review coverage: once the change is public or standard review has begun, automatically returning
  to a prepublication lane adds no shaping value.

- _Approach:_ make review progression monotonic. Frontline may run only before publication and before standard
  review begins. Crossing either boundary closes frontline for that review cycle; later target movement routes
  through the standard lane's applicability decision — targeted verification, incremental review, or complete
  review — and never automatically reopens frontline. This is lifecycle applicability, not standard evidence
  pretending to satisfy a frontline pass. An unresolved frontline finding or authorized fix must still settle
  before the transition, so opening a PR cannot launder unfinished frontline work.

- _Fit:_ this sharpens `review-activity-contracts` D7.4/D7.6 and the cohort's tiny-Errand proportionality
  regression. Those already state that exact-head movement does not itself require new review activity and that a
  non-interacting test-only delta must not acquire another provider request; add the explicit no-backedge contract
  across Errand, singleton-WU, and delivery-member review choreography.

- _Boundary:_ preserve exact-head invalidation of review evidence and merge authority. Do not record standard review
  as a frontline result or fabricate a clean/skip attempt. An explicitly requested extra advisory pass may remain
  possible, but it is not an automatic lifecycle route.

- _Captured during:_ `preserve-checkout-identity-through-authorized-integration-operation` Errand integration,
  PR #637, 2026-09-16.

### `[ ]` **Represent authorized incremental review without whole-target clearance**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain (2026-08-20).
- _Concern:_ an operator-authorized exact-delta closure pass has no typed source for ordinary findings response
  unless it falsely presents itself as managed whole-target review.
- _Fold-in:_ bind exact base/head, direct-seam scope, evaluator evidence, and an explicit no-clearance property;
  admit its findings to the ordinary disposition path without satisfying or weakening a full-final obligation.

### `[ ]` **Carry review authorization across approved exact-head fixups**

- _Routed from:_ `USER-INBOX § Work Unit` (retargeted from `interlock-release-refinement`), housekeep drain
  (2026-08-20).
- _Concern:_ after the developer approved a provider review, its finding, the bounded fix, and the resulting commit,
  the harness demanded another egress authorization merely because required re-review used a new exact head.
- _Fold-in:_ preserve authorization when provider, repository, base, bounded path set, and review purpose remain
  unchanged across an approved finding fix. The new exact head remains mandatory evidence; new providers, broader
  exposure, unrelated or unapproved mutation, and ambiguity still stop.

### `[ ]` **Right-size applicability and adversarial-pass calibration against live evidence**

- _Routed from:_ two `USER-INBOX § Work Unit` captures, housekeep drain (2026-08-20).
- _Concern:_ the modal single-fix path performs a dominated per-increment applicability pass immediately before
  converged Tier 3, while verification's optional adversarial pass found two material defect strata after two
  self-verification passes claimed complete success and exhausted the configured Heavy cap.
- _Fold-in:_ owe no applicability judgment when no review ran; skip the per-increment pass when it is already the
  converging increment; retain the multi-increment case. Recalibrate activity posture and cap reporting so an
  advisory/capped pass is not silently the only instrument performing load-bearing correctness work.

### `[ ]` **Consider per-WU scope-boundary awareness for hosted reviewers**

- _Routed from:_ `USER-INBOX § Work Unit` (resolved `WU_Target: review-activity-contracts`), housekeep drain
  (2026-08-10).
- _Concern:_ hosted reviewers cannot see a WU's Non-Goals through the current static guidance surface. During the
  guidance redesign, evaluate supplying the governing spec's scope boundary and requiring scope-crossing findings
  to ground why adequacy requires the crossing; primary triage remains the backstop.

### `[ ]` **Right-size review activity around disclosed agent judgment**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand closeout and
  `review-protocol-alignment` decomposition (2026-07-26).
- _Concern:_ Integrating a tiny Errand took ~40 minutes of protocol over implementation — pre-PR source
  selection error, unused local operation, disproportionate hosted-finding disposition construction,
  undocumented settlement identity representation, blindness to CodeRabbit's edited incremental-clean
  signal, unnecessary repeat-review after a non-interacting test-only delta, and confusion between posting
  a request artifact and a provider actually running a review. Machinery intended to streamline review
  created additional failure modes.
- _Governing constraint:_ ARC must not prevent an agent from applying ordinary, disclosed common-sense
  judgment. Mechanization should enforce genuine authority and bias boundaries, automate deterministic
  work, and make evidence dependable — not elevate procedural state over clear source evidence.
- _Fold-in:_ re-audit every review activity, stop, re-trigger, and adapter wait by concrete risk guarded;
  prefer typed automation; admit disclosed judgment where evidence already serves a default's purpose;
  retain hard stops for bias-guarding independence, mutation approval, and exact-head merge authority.
  Coordinate rule-yield / override with `judgment-authority-model`. Use the tiny-Errand path as a friction
  regression scenario.

### `[ ]` **Enforce visible adversarial-review pass caps in automatic audit dispatch**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `review-signal-convergence` draft closeout.
- _Concern:_ automatic planning/verification audit can dispatch `adversarial-review` without making the
  current pass count and exhaustion state visible — agents continue past the cap without noticing authority
  ended. `review-signal-convergence` D6.2 settles the rule: every result reports `Pass N of M`, `N == M`
  stops before another evaluator invocation, a recommendation never authorizes continuation.
- _Fold-in:_ apply that rule to every configured automatic planning and verification audit fire-point;
  make `cap-exhausted` terminal; require explicit approval naming activity and next pass for exactly one
  additional invocation; keep the cap out of evaluator context while making it explicit in primary control
  flow and the operator-facing report.

### `[ ]` **Bound and disclose read-only scouts inside review activities**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `review-signal-convergence` adversarial spec review Pass 2.
- _Concern:_ a standard non-partitioned adversarial pass spawned two read-only helper scouts without the
  invocation contract stating whether scouts were permitted or bounded — so `Pass N of M` conceals actual
  evaluator-call cost.
- _Fold-in:_ let an activity contract authorize a small bounded scout set without counting each scout as
  another logical pass. Default: at most two low-effort, fresh-context, read-only scouts with distinct
  source loci; scouts return facts not findings/verdicts; report `Pass N of M` with actual reviewer/scout
  call count. Fan-out beyond the declared bound requires explicit approval.

### `[ ]` **Recognize CodeRabbit's edited incremental-clean signal**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ after an incremental CodeRabbit review found no new issues, CodeRabbit edited its pre-existing
  walkthrough comment (`No actionable comments were generated…`, `updatedAt` past the request) rather than
  creating a new PR review — so `arc review hosted await` stayed `pending` forever.
- _Fold-in:_ model CodeRabbit's authenticated summary-edit completion shape as a provider-specific clean
  observation. Correlate bot/app identity, request time, exact head, summary comment identity and
  `updatedAt`, and the provider's stable clean marker. Cover both new-review completion and edited-summary
  incremental completion.

### `[ ]` **Derive hosted settlement actor identity inside the adapter**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-07-27); captured during `decompose-roadmap-supersession` Errand integration.
- _Concern:_ `review hosted settle` exposes freeform `actorIdentity`, but the GitHub adapter compares it to
  the authenticated account's numeric database ID rather than login — supplying `andrewRCr` produced
  `actor-mismatch` until the numeric ID was discovered by source inspection.
- _Fold-in:_ derive the settlement actor inside the trusted adapter rather than requiring the caller to echo
  an undocumented provider-specific identity representation. Preserve exact actor and current-target
  validation.

### `[ ]` **Recognize hosted acknowledgement and retrigger semantics before completion waiting**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ hosted review waiting enters the long completion window without first distinguishing accepted,
  refused, duplicate, and retrigger-required provider responses.
- _Fold-in:_ model provider acknowledgement as an authenticated intermediate activity outcome with typed
  retrigger rules. Explicit correlated refusal recognition is extracted as an immediate Errand.

---

### `[ ]` **Carry proportionate review evidence and pass accounting across approved review fixes**

- _Routed from:_ consolidated `USER-INBOX` captures, housekeep drain (2026-09-19).
- _Consolidates:_
    - Make review passes accumulate across an approved review fix, and recommend rather than reset.
    - Settle whether a passed frontline verdict survives a review-fix head.
    - Let an incremental pass settle a lane whose complete coverage already happened.

#### Capture: Make review passes accumulate across an approved review fix, and recommend rather than reset

- `WU_Target: review-activity-contracts`

- _Root:_ ARC treats an approved review fix as a full reset of review evidence — and, at
  `suffix-reconciliation.ts:651-658`, republishes only the fixed member's coordinates, leaving the delivery
  members above it on heads that no longer descend from it. Both are the same shape: a review fix leaves the
  state around it un-reconciled. The second produced a live authority defect in this very work unit (a later
  member's head admitted under an earlier member's vehicle), which suggests the root is wider than review
  evidence alone and worth scoping as such. The design intent is the
  opposite — avoid redundant ceremony, repeat an expensive pass only on semantic grounds, and reach the Owner
  as a deterministic recommendation the agent applies judgment on top of. `evidence-applicability` shipped
  exactly that machinery; it is not wired to review lanes, and the one cause that matters most here is pinned
  to the expensive answer. Five layers, each verified at source during
  `delivery-post-landing-conflict-recovery`.

- _Layer 1 — the pass is recorded and complete._ Git-common
  `review-gate/operations/operation-e71c08c3…json`: lane `standard`, head `31d0bea2`, `completedPasses: 1`,
  one attempt, `outcome: "findings"`, `chunkSeriesComplete: true`. Nothing is lost at the recording layer.

- _Layer 2 — a re-root empties the lineage; a settled response does not._ Established by running both paths.
  When an approved fix settles through `arc review respond -` with `verifiedFix`, the record gains a
  transition (`oldTarget` → `newTarget`, carrying the applicability), `candidateReviewResponses` reads it into
  `lineageHeadShas` (`pre-publication-composition.ts:103-109`), and the prior head's progress carries — the
  router moved from `pass: 1` to `pass: 2` across the settlement, and the standard lane's
  "no durable progress" advisory disappeared. After `arc attest --new-root`, by contrast, the record carries
  `lineageAttestations: []`, no transitions, and `baseRevision` rewritten to the fix commit, so the reviewed
  head drops out and `readLaneProgressAcrossLineage` sums zero. The plumbing is therefore mostly right; what
  breaks it is the re-root, and `candidate-reroot-recovery-frame`'s Problem statement describes a re-root as a
  normal post-fix transition. Settle whether a re-root must discard prior lane progress or should carry the
  superseded root forward.

- _Layer 3 — only the debit carries. Confirmed live on the correct protocol path._
  `lane-progress.ts:645-652` sums `completedPasses` across every lineage head but takes `attempts` from the
  current head alone (`current?.status === "recorded" ? current.attempts : []`). Spend accumulates; evidence
  does not. Observed directly after a correctly ordered proposal → approval → fix → `verifiedFix` settlement:
  the router returned `pass: 2, maxPasses: 2, attemptedSources: []` and asked for another whole-target standard
  pass. So an approved review fix costs a pass and earns no clearance even when nothing was done out of order,
  and a second fix would exhaust the ceiling into `obtain-ceiling-override`. This is the layer that most
  directly contradicts the stated intent, and it is independent of layers 2 and 6.

- _Layer 4 — the reducer denies review-clearance what it grants verification._ `reducer.ts:84-93`, same
  `cause: "approved-fix"`: `verification` is graded by `delta.approvedScope` (`targeted` → carries, `focused`
  → supplemental, `full` → fresh), while `review-clearance` short-circuits to `final("fresh",
  "approved-fix-review-clearance")` with `judgmentRequired: false` and no comment justifying it, in a file
  that comments everything. `ApprovedFixResponseSchema` (`schema.ts:169-176`) already carries `applicability`
  and `approvedVerification` on that delta — the input is present and discarded — and `assertClosedAxes`
  imposes no constraint against reading it. Note the contrast: base movement _does_ get proportionate
  review-clearance treatment (`disjoint` → `carries`). It is specifically the approved-fix arm that is pinned.

- _Layer 5 — the routing never asks._ `pre-publication-request.ts` and `review-policy-driver.ts` contain no
  reference to the applicability reducer at all, so even a `carries` verdict would not reach lane routing.

- _Layer 6, folded in from the same session — the protocol ordering is unstated and its refusal unclearable._
  `prepare-work-unit.md` never states that the approved `arc review respond -` pass must reach the CLI
  _before_ the fix commit. It says "submit approved dispositions with `arc review respond -`" (singular) and
  "Approval of the complete unchanged surfaced set is required before any mutation" — both of which read as
  _obtain the Owner's approval, then fix_. The only signal is "re-invoke" in "re-invoke the same approved `arc
  review respond -` request with `verifiedFix`", and the reason is never given: the approved pass mints the fix
  authorization the settlement consumes. `respond`'s dispatch states are also not enumerated beside the
  pre-publication ones. When the ordering is missed, `respond` refuses `stale-target / prepare-current-target`
  — and that act cannot clear it: re-rooting makes the lineage current at the new head, and `respond` returns
  the identical refusal, because `readCandidateLineage(source.target)` can no longer find the reviewed target.
  `respond-command.ts` is byte-identical to `main`, so this is live there. A refusal naming an act that cannot
  clear it is the class `delivery-post-landing-conflict-recovery` exists to remove, here at the review boundary.

- _Layer 6 field confirmation from an Errand, 2026-09-21._ After an approved hosted-review fix was applied and its
  gates passed, invoking the `verifiedFix` response before committing could not derive an immutable changed target:
  the dirty checkout surfaced the `clean-worktree` repository precondition. Committing through the already-approved
  increment and then re-invoking the same response succeeded as `errand-advanced`. That mechanical order is sound —
  review evidence should bind to a commit, not mutable worktree bytes — but the public method language still says
  `ready-to-persist` returns to the commit interlock while binding authorization consumption “before any push,” and
  the Errand workflow compresses apply, verify, commit, push, and settlement into prose. Specify the typed sequence
  explicitly: approve/provision the fix; apply and verify; commit; re-enter with `verifiedFix` on the clean new HEAD;
  then push and perform any hosted after-fix settlement. Preserve exact-target mechanics; fix the continuation and
  remedy language rather than allowing dirty-worktree target derivation.

- _Cost when it fires:_ a complete chunked standard review — seven evaluators plus an aggregate, 25 findings
  verified at source, dispositioned and Owner-approved, 18 fixes applied, Tier 3 green — earned no lane credit.
  Pre-publication re-routed to `ready / local-prepare`, `pass: 1`, `attemptedSources: []`.

- _Approach:_ decide whether review-pass durability is a property of the verdict or of the diff, then make the
  answer typed. Concretely: let `review-clearance` read the approved scope the delta already carries instead of
  short-circuiting; carry attempts, not only spend, across a lineage; preserve lineage across a re-root, or
  state why a re-root must discard it; and have lane routing consult the reducer so a `carries` or
  `supplemental` verdict can reach the dispatch. Keep `judgmentRequired: true` as the seam where the agent
  reasons and the Owner decides — the recommendation should be deterministic, the spend never automatic.

- _Ownership checked, not assumed:_ `candidate-reroot-recovery-frame` is adjacent and excludes this by its own
  scope boundary — "Do not redesign review-fix disposition authority or Candidate lineage outside the recovery
  interval"; it owns the session/locus/compaction frame _during_ the transition. `evidence-applicability`
  shipped, closed and torn down (PR #620); RELEASE-GATES already notes "the mechanism that made the residue
  possible is not fixed — only this instance was", and its residue routes to `delivery-rebuild-continuity`,
  which is the private chain moving under a plan. The two sibling entries already routed to
  `review-activity-contracts` — "Settle whether a passed frontline verdict survives a review-fix head" and
  "Let an incremental pass settle a lane whose complete coverage already happened" — pose this as a design
  question for frontline and incremental coverage; neither names layers 2 through 6. This entry supplies the
  evidence and the loci for all of them.

- _Superseded, recorded so it is not re-reported:_ the `--schema` discoverability half is fixed. PRs #653 and
  #654 put the review request family behind `--schema`, and `REVIEW_RESPOND_REQUEST_SCHEMA_ID` registers
  `RespondRequestSchema` — the union — so `arc review respond --schema` now shows both the proposal and
  approved arms including `verifiedFix`. It was unavailable during this session only because the branch base
  (`c93ab8962`, PR #652) predates those merges. Re-scope the skeletons entry against that when next touched.

- _Captured during:_ the `delivery-post-landing-conflict-recovery` work unit, 2026-09-18.

#### Capture: Settle whether a passed frontline verdict survives a review-fix head

- `WU_Target: review-activity-contracts`

- _Observation:_ every review fix moves the head, and the gate treats the new head as a target with no frontline
  progress, so a lane that already passed is re-offered from zero. The Owner's stated intuition is that "once
  frontline is passed, it's passed" — frontline is an advisory pre-publication lane, and re-running it on a head
  that differs only by an approved, already-reviewed fix costs a pass and re-surfaces findings already
  dispositioned.

- _Relation to the existing capture:_ this WU's draft already owns the narrow case at
  `draft-review-activity-contracts.md:47` ("Make no-material Frontline follow-up effective across Candidate
  rerouting"), where a typed `frontlineFollowUp: stop / no-approved-material-fix` result failed to survive
  Candidate rerouting. That entry is scoped to a _no-material_ result crossing a _Candidate_ transition. This one
  is the general form: any passed frontline verdict crossing any review-fix head.

- _Tension to settle, not assume:_ the existing entry's approach line already states the counterweight — "changed
  or materially interacting bytes must still create a fresh obligation, and rejected findings must never become
  review clearance by implication." The general rule "once passed, always passed" would violate that directly. The
  settlement is therefore not "carry the verdict forward" but "define the class of head movement that preserves
  it" — plausibly: a head whose delta is confined to an approved fix set already dispositioned against the same
  rubric, with any other byte change resetting the lane.

- _Approach:_ decide whether frontline pass durability is a property of the verdict or of the diff, then make the
  answer typed rather than incidental. If durability is diff-shaped, the gate needs a cheap "is this head a pure
  review-fix descendant of the passed head" predicate; the disposition-set identity recorded in the fix commit is
  a candidate binding.

- _Captured during:_ the `delivery-entry-input-shape` errand, 2026-09-18, from an Owner observation made while
  skipping frontline on a review-fix head.

#### Capture: Let an incremental pass settle a lane whose complete coverage already happened

- `WU_Target: review-activity-contracts`

- _Relation to the existing entries:_ this WU's draft already owns the concern twice — at
  `draft-review-activity-contracts.md:144` ("Carry review authorization across approved exact-head fixups"), whose
  stated concern is verbatim this situation, and at `:432` point 4, where a narrow non-interacting delta carries
  prior complete coverage. What neither has is the mechanism, below, or the Owner's framing of the remedy. Fold
  this in rather than opening a parallel design.

- _Mechanism, verified in source:_ four facts a fixer needs. First, `retrigger` — the field whose whole purpose is
  to say an incremental re-review suffices — is produced by `routing.ts`, carried into the requirement and the
  persisted handle, and compared for equality in `review-command-envelope.ts:406`, but is never read by any
  settlement or coverage code. It has no effect on anything. Second, `readLaneProgress` is keyed by `headSha`, so
  complete coverage on an ancestor head is structurally invisible to the current head. Third,
  `status-errand.ts:182` gates settlement on `effectiveCoverage === "complete"` alone, while `status.ts:976` and
  `hosted-reservation-discharge.ts:509,629` accept the broader `requestedCoverage === "complete" ||
  effectiveCoverage === "complete"` — the Errand path is stricter than its siblings; whether that asymmetry is
  intended is not evident from source. Fourth, `lane-progress.ts:334` sets `consumedPass` only for complete
  coverage, so incremental passes are free but structurally incapable of settling.

- _`effectiveCoverage` does not observe anything (Owner-supplied, verified 2026-09-18):_ CodeRabbit defaults to
  whole-target on the **first** request against a PR whether the command is `@coderabbitai review` or
  `@coderabbitai full review`; the distinction only takes effect on later passes. ARC does not model this. At
  `coderabbit.ts:512` the adapter returns `effectiveCoverage: coverage` — a verbatim echo of what the caller
  requested — so for this provider `effectiveCoverage` and `requestedCoverage` are always equal, and the
  `requestedCoverage === "complete" || effectiveCoverage === "complete"` disjunction at `status.ts:976` and
  `hosted-reservation-discharge.ts:509,629` is a distinction without a difference. `status-errand.ts:182` is
  therefore gating settlement on the string the caller typed, not on what the provider did. A first-pass
  `incremental` request that CodeRabbit ran as whole-target is recorded as incremental and refuses to settle a
  lane the provider in fact fully covered.

- _Ground truth is already parsed and discarded:_ `coderabbit.ts:32-33` defines
  `COMPLETE_REPLY = /^Full review finished\.$/` against `INCREMENTAL_REPLY = /^Review finished\.$/` — the
  provider announces which coverage it actually ran. But `:78-82` selects the regex _from the expected coverage_,
  using the reply only to confirm the requested thing finished rather than to learn what happened. The cheapest
  correct fix is to set `effectiveCoverage` from the observed reply instead of echoing the request; the signal
  needs no new provider call. Owner's framing: ARC may not need to model this distinction at all — if coverage
  cannot be observed faithfully for a provider, gating settlement on it is worse than not modelling it.

- _Net effect:_ every review-fix head demands a fresh complete provider review, however small and however
  thoroughly the delta was just reviewed. On this errand the delta past the last complete pass was three
  test-only files, +14/-18, reviewed clean incrementally, and the lane still would not settle.

- _Owner framing of the remedy:_ not an automatic carry, which is how `:432` currently reads, but a judgment-routed
  one — "that's for the agent to recommend / user to decide/request, not ARC to dictate (assuming a full review
  has already _happened_)". A change can still be large enough to warrant fresh complete coverage; the objection
  is to ARC deciding that unilaterally. This is more consistent with the draft's own stated posture, which defers
  to `judgment-authority-model` and keeps disclosed common-sense judgment available.

- _Interim mechanism is invisible:_ the Owner-directed Errand review stop shipped in PR #622 and does cover this,
  at `run-errand.md:380`. But it lives only in workflow prose — nothing in `arc review status`, `arc review
  terminus --help`, or any refusal surfaces it, and `terminus accept` is delivery-member only, which actively
  suggests no Errand equivalent exists. An agent that has not already read that passage reaches for another
  complete pass instead; that is what happened here, and the Owner had to supply the mechanism from memory.
  Owner-agreed (2026-09-18): whatever settles the durable contract must also make the interim path discoverable
  from the refusal, so the override is reachable without prior knowledge of the workflow passage.

- _Loose thread:_ disposition set `ff0f3074bccc7717`, recorded in commit `91bc4131f`, resolves to nothing in ARC
  state — the finding was triaged and fixed conversationally because the pass-2 hosted await returned
  `terminal-failure` before binding it to an operation. Settle here or under `review-signal-convergence`; it does
  not warrant its own entry.

- _Captured during:_ the `delivery-entry-input-shape` errand, 2026-09-18.

- _Folded in:_ "Decide whether a small fix to a non-material finding should cost a full review", routed from `USER-INBOX
  § Work Unit`, housekeep drain (2026-10-09). The Errand capture "Show at the disposition gate that fixing a finding
  moves the head and costs a review pass" waits on this decision.

    - _Observation:_ `evidence-applicability` scales verification with the approved fix scope (`targeted` carries,
      `focused` gets a supplemental check, `full` gets fresh verification), but D3 rule 2 makes review clearance over any
      `approved-fix` `fresh`. So even a targeted one-line fix of a confirmed minor requires another review pass at the new
      head. `review-signal-convergence` softens this only through an incremental correction pass over the fix range
      (§ 5), and Errands can't request one, so on PR #836 a 20-line minor fix cost a complete CodeRabbit pass.

    - _Design needed:_ whether a fix approved for a non-material finding at `targeted` (or `focused`) scope should carry
      review clearance, be limited to its own diff, or keep requiring a fresh pass; how that interacts with convergence's
      "a confirmed minor never buys a pass" (§ 3), its `changed-target` reroute (§ 7), and the rule that only actual
      review establishes coverage (§ 5); and what evidence a carried clearance would need so the agent never clears its
      own fix.

    - _Observation:_ an Owner-level design question, not an implementation defect: both shipped designs require the
      post-fix review as written. The defect parts are captured separately (Errand incremental route; disposition-gate
      pass cost).

    - _Captured during:_ the review of PR #836 against `review-signal-convergence` and `evidence-applicability`,
      2026-10-08.

### `[ ]` **Stop letting an omitted activity flag silently deactivate a configured review lane**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-activity-contracts`

- _Observation:_ `arc review resolve -` declares `frontlineActive: z.boolean().default(false)`
  (`review-policy-driver.ts:114`). Omitting it validates cleanly and drives line 558,
  `reason: request.frontlineActive ? "no-source" : "inactive"`, so the lane returns `skipped / none (inactive)` —
  indistinguishable from a genuinely inactive lane. This happened during `delivery-request-identity` while
  `frontline-review.md` was `active: true`, `review.frontline_sources: [coderabbit-cli]` was configured, and
  `review.frontline_max_passes: 2`. The frontline lane was silently skipped and the workflow's instruction to
  "follow only the driver's typed state" made that skip look authoritative.

- _Second half:_ the same errand's `resolveReviewRouting` returned `frontlineAction: "offer"` — an offer owed to
  the Owner — and nothing in the protocol carried it to a prompt. An offer that only exists inside a decision
  object the agent then discards is not an offer.

- _Approach:_ two shapes for this WU's "explicit, typed, and bounded" goal. Make lane activity derived from
  configuration rather than a caller-supplied boolean, or require the field with no default so omission refuses
  instead of suppressing; and give `frontlineAction: "offer"` a typed surfacing obligation rather than leaving it
  to prose. A default that disables a configured-active lane is the inverse of fail-closed.

- _Captured during:_ the `delivery-request-identity` errand, 2026-09-18.

### `[ ]` **Make a `recommended` standard-review obligation stop for an Owner decision, not spend like `required`**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: review-activity-contracts`

- _Owner direction (2026-09-19):_ a `recommended` obligation should surface an Owner decision. It is not intended
  to spend a metered pass silently on the strength of being merely recommended.

- _Observation:_ `recommended` is load-bearing for whether a finding blocks and inert for whether a pass is
  spent — the distinction is honored on the axis that costs nothing and dropped on the axis that costs money.
  Every reader of the routing projection tests only `exempt` and treats the rest alike
  (`policy/review-policy-driver.ts:563`, `core/gate-contract-v2.ts:140`,
  `core/review-command-envelope.ts:362,370,423`, `policy/planning-grooming-command.ts:126,133`,
  `runtime/local-prepare.ts:186`), even though `ReviewObligationSchema` carries three values
  (`policy/routing-schema.ts:12`). One axis over, the two-valued requirement obligation does discriminate:
  only `required` produces blockers and gates the verdict (`core/requirements.ts:109`, `core/verdict.ts:71`),
  and `aggregateRequirementDisposition` ranks `required` above `recommended`
  (`core/requirements.ts:126`).

- _Observation:_ the state this wants already exists in the sibling lane, which together with the above is
  what makes the gap look like an omission rather than a decision. Frontline routing is
  `z.enum(["skip", "offer", "attempt"])`, and `action === "offer"` resolves to `state: "offered"`
  with `nextAction: "obtain-authorization"`
  (`policy/frontline-command.ts:102`) — a typed, pre-spend stop for exactly this decision. The standard lane
  has no analogue. For the observed change the two lanes disagreed on the same routing verdict:
  `arc review frontline resolve -` returned `skipped / none`, while `arc review resolve -` lane=standard
  returned `ready / hosted-request`.

- _Observation:_ the one route that avoids the spend is closed on a first pass. The Owner-directed review stop
  requires naming "at least one completed same-claim standard-review pass and its disposition/settlement state",
  and stops when the evidence is incomplete — so it cannot be reached before a pass has been spent. There is no
  pre-spend decision point at all.

- _Observed on:_ a 58-line Markdown-only change to one workflow file, routed `contentKind: documentation`,
  `reviewRisk: routine` → `reviewed-routine-documentation`, `standardReview: recommended`,
  `retrigger: incremental`. A full `coderabbit-pr` pass was requested, awaited, and consumed
  (`consumedPass: true`), returning clean.

- _Approach:_ give the standard lane an `offered` state on the frontline lane's model — `recommended` stops at
  an Owner decision before any source dispatch instead of falling through to `hosted-request`. The precedent
  next door means this is likely a narrow addition rather than new machinery. Keep it separate from the
  Owner-directed review stop, which is a post-spend acceptance of residual risk over completed passes; this is
  a pre-spend authorization of whether to spend at all. Decide what a decline records, so a declined
  recommendation is legible later as a considered choice rather than a lane that never ran.

- _Boundary:_ obligation dispatch and the decision point only. Not a change to how routing derives `recommended`,
  which behaved correctly here, and not provider selection or ceiling accounting — the cumulative pass-ceiling
  entry (§ Errand) stays separate.

- _Relation:_ sibling to this WU's existing "Make review spend visible before it is incurred, and keep 'review' to
  one sense per surface" — same concern one step earlier, at the point where the spend is authorized rather than
  where it is displayed.

- _Touchpoint:_ `review-signal-convergence` D6.4 reorders the same lane dispatch ("triage and source-bind, then
  the driver call, then response"). It is not the owner here — its concern is evidence and convergence after a
  pass runs, and it declines new approval vocabulary — but an `offered` state lands in the sequence it is
  rewriting, so whichever ships second should read the other.

- _Captured during:_ the `publish-errand-merge-skeleton` errand, PR #655, 2026-09-19.

### `[ ]` **Carry private correction coverage across a Candidate re-root**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain (2026-09-30);
  captured during `review-signal-convergence` prepublication Pass 13, 2026-09-26.
- _Observation:_ During `review-signal-convergence` Pass 13, a verified Pass 12 response and
  complete local review supported an exact incremental correction scope on the same Candidate root.
  An additional source correction required `arc attest --new-root`. ARC preserved 12 spent passes,
  but the new Candidate id had no response transition and the local coverage selector required an
  exact Candidate-id match to the Pass 12 producer, so it could no longer offer incremental review.
  The existing `review-activity-contracts` draft names re-root lineage and incremental settlement
  generally, but does not explicitly own this private, origin-linked no-PR admission case or its
  cross-root evidence proof. `candidate-reroot-recovery-frame` excludes this authority design.
- _Approach:_ Decide what exact, validated supersession and performed-response evidence may carry a
  prior complete-review basis into a new Candidate root. Preserve exact-head invalidation and
  Owner pass authority; offer incremental as a scoped choice only when the complete chain and live
  Git/Candidate contribution prove it. Cover the origin-linked no-PR route and an out-of-band
  re-root in a real CLI test, including a refusal when the proof does not hold.

### `[ ]` **Put the verified-fix response before after-fix hosted settlement in the shipped workflow prose**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain (2026-09-30);
  captured during Errand `verified-fix-reentry`, 2026-09-28.
- _Observation:_ Layer 6's field confirmation specifies the order approve → apply and verify → commit →
  `verifiedFix` response → push and after-fix hosted settlement. The shipped prose still states the older order in
  two places, and omits the response in a third:
    - `run-errand.md` § Integrate Step 4, the `findings / triage` arm, and `integrate-work-unit.md`'s matching hosted
      arm both say to apply, verify, commit, and push the fixes, "then settle every `afterFixFindingIds` entry", and
      only afterwards "the verified-fix response continuation". Hosted settlement of a `fix` finding needs the
      recorded response, so the prose order fails at the first after-fix settle. The delivery-member arm of
      `integrate-work-unit.md` is already correct: it requires `delivery-member-advanced` first.
    - `run-errand.md` Step 2's frontline and local `findings / respond` arm ends at "Approved fixes run Tier 1 gates,
      commit atomically, push, and create a new target" and never names the `verifiedFix` response. `arc review
      resolve` needs that recorded response to see the fix for incremental applicability.
- _Already landed, so the prose is no longer a dead end:_ PR #729 (`034d338a9`) makes a `ready-to-fix` response name
  `reentryCommand: "respond-verified-fix"` for every source. It also makes `arc review hosted settle` return a
  typed `fix-not-performed / complete-verified-fix` refusal, with that response as the remedy, instead of a generic
  error. Following the current prose now ends at a recoverable refusal; what remains is stating the right order.
- _Approach:_ fold into Layer 6's typed sequence. Have the three arms follow `payload.reentryCommand` after the fix
  commit and only then run after-fix settlement. Edit the package source and sync `.arc/`.

### `[ ]` **Bind the review disposition set to the stored review fact, not the fix commit's body**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-activity-contracts`), housekeep drain (2026-09-30);
  captured during `storage-contract` draft close, 2026-09-30.
- _Observation:_ `review-triage` puts a `Review disposition set` body on review fix commits, and this draft names the
  disposition-set identity recorded in the fix commit as a candidate binding for frontline pass durability.
  `storage-contract` takes ARC's process vocabulary out of code commits by default (C8's surface boundary), and once
  durable review facts are stored at project scope (C2), the disposition set belongs there rather than in commit
  bodies.
- _Approach:_ Design the binding against the stored review fact, and drop the commit body once review facts are
  stored.

## Hosted Guidance Contract

Established against source: the hosted adapters inject **no** guidance — `CodeRabbitHostedAdapter.request` posts exactly
`@coderabbitai full review` (or `@coderabbitai review`), the Codex adapter posts `@codex review`, and the CodeRabbit CLI
provider injects none. The live typed generator has one consumer, the local carrier's guidance projection. **The two
static `arc:review-guidance` blocks are therefore the sole channel by which any ARC rubric reaches a hosted reviewer**,
which is why they cannot simply be deleted. They are byte-identical (31 lines each, modulo indentation), nothing
validates them, and they have already drifted: both carry **six** rubric dimensions while
`STANDARD_REVIEW_BASELINE_CONTRACT` carries **five** — the sixth, "Repository contract coherence", exists in no typed
source. The published `sha256:cea850…` digest recomputes correctly from the typed contract and proves nothing: it does
not cover the rendered dimension prose, so it is structurally incapable of detecting that drift and did not.

**D3.1 — The trim.** Criterion: _keep only what a provider cannot know_. Cut the finding requirements and five of the
six rubric dimensions — instructing a specialized code reviewer to check correctness, boundary cases, or to cite a
stable locus is its product, not information, and at `path: "**/*"` that cost is paid on every file. Cut the
`Rubric:` / `sha256:` line, which has no live consumer and is demonstrably not a drift check. Four items survive in both
`.coderabbit.yaml` and `AGENTS.md`:

1. **Exact-scope binding** — the complete requested change set, not a sample or only the latest fix; bind to the exact
   requested target.
2. **The clean-result floor** — unavailable, partial, ambiguous, or failed review is never clean.
3. **The evaluator boundary** — the review is not given author conclusions, preferred fixes, self-verification
   claims, or suspected weak spots. Stated as the exclusion it is, matching the typed `excludedContext`; an earlier
   phrasing ("do not accept author conclusions") named a different actor and a different obligation, and would not
   have been derivable from the field it is checked against.
4. **Repository contract coherence** — rewritten out of dimension register into the same register as the other three,
   naming the actual contracts: the two-copy package-source / project-instance sync discipline, the self-hosting
   `npx arc` invocation rule, and the adopter-facing versus internal-dev audience boundary.

Item 4 survives **by** the criterion rather than as an exception to it: a generic reviewer cannot know these. It stays
untyped, deliberately — no method declares the `review-augmentation` frontmatter that would route a project dimension
into the projection, and minting one to maintain a single line would re-instate the generator this trim deletes. Both
files are this repository's own configuration rather than shipped artifacts, so repository-specific content is exactly
what belongs in a repo-local static block.

**D3.2 — The parity check.** At four items, parity resolves without restoring a generator. A new
`lint:arc:review-guidance` root script backed by `src/scripts/audit-review-guidance.ts` — the dev-only home the existing
`lint:arc:*` family already uses, since `src/` is excluded from the package's published `files` — asserts:

- string equality (modulo indentation) between the two carriers' block bodies;
- items 1, 2, and 3 against `STANDARD_REVIEW_BASELINE_CONTRACT.coverage`, `.cleanRule.nonCleanResults`, and
  `.evaluatorBoundary.excludedContext` respectively. Item 2's backing is `nonCleanResults` alone, not the whole
  `cleanRule` object: `requiredDimensionTreatment` ("all rubric dimensions considered") refers to the five dimensions
  `D3.1` cuts, so it is deliberately no longer carried to hosted reviewers and there is nothing left to check it
  against.

`evaluatorBoundary` is typed and is checkable exactly as `coverage` and `cleanRule` are; leaving it unchecked would
reopen the untyped drift channel this unit exists to close. Only item 4 has no typed source — deliberately, per the
paragraph below.

**Its coverage is partial by construction and the check states so in its own output:** string equality covers all four
items across the two copies, the typed fields back items 1 through 3, and item 4 is unbacked. A check that reads as
total when it is not is the defect this design unit exists to remove, so the check reporting its own reach is part of
the deliverable rather than a nicety.

## Audit Activity Control

**D7.1 — Carry the stop discipline into the workflow.** The choreography already matches its design intent: human stops
track authority rather than every judgment, final dispositions and release coincide in one structured gate when nothing
earlier needs approval, exceeding a pass ceiling is a third stop by exception, and ordinary agent judgments do not
create permission turns. Counting `integrate-work-unit.md`'s own stop-class callouts confirms the shape. But that
statement lives only in a completed work unit's archived spec, which the agent running integration never loads. State it
in `integrate-work-unit.md`, where the decision is made. State the dual explicitly too: protocol state may bind or
invalidate evidence, but it does not replace the workflow's disclosed review-applicability judgment with mandatory
activity.

**D7.2 — Gate the activity, not the mechanism.** Both review lanes ship with empty source lists, so no automatic review
spend is incurred until a source is named. The adversarial method has **no configuration surface at all**, across four
standalone offer fire-points — the three planning stages and verification. An adopter who does not want subagent spend
can only decline, at every fire point, indefinitely: four permission turns that return nothing.

A key gating `adversarial-review` itself is rejected — it contradicts the method's own identity contract, which states
that the caller owns launch policy and that the mechanism never weakens the caller's obligation. The method is a
carrier, not an activity, and its context-provisioning table already lists frontline and standard review as fire-points,
so the lanes are among its callers. Instead, each review **activity** carries its own evaluator key, the way the lanes
already carry source lists. Two new keys in `arc-config.yml`, beside `review.frontline_sources` and
`review.standard_sources`:

```yaml
# Evaluator for planning-stage design audits (draft-design, create-spec, generate-tasks).
# Subagent carriers only: hosted and CLI providers review diffs and cannot audit a design
# document. `none` disables the audit; the stage-completion check is unaffected.
review.planning_audit: none        # none (default) | delegated-agent
review.verification_audit: none    # same domain
```

Four review activities, one uniform place to look. The value is singular where the lane keys are plural, so "one
evaluator, no fallback" reads off the shape rather than a comment. `adversarial-review` gets no configuration surface.

**A config key is not a YAML line.** `review.frontline_sources` and `review.standard_sources` are each declared in
`src/lib/config/schema.ts`, validated in `src/commands/config/validate.ts`, and one is referenced in
`src/commands/update.ts`. The two new keys follow the same path — schema declaration, validation with a typed
diagnostic for an out-of-domain value, and both copies of `arc-config.yml`. The package-source copy ships the `none`
default; whether this repository's own instance overrides it is a project decision recorded against the sanctioned
divergences the framework-sync test already admits.

**One key per activity family, not per stage.** The adopter decision is a single posture question. If granularity is
ever wanted, the natural cut is _early versus finalization_, not per-stage, and it arrives additively as a scope
qualifier beside the evaluator key — evaluator and scope are orthogonal, so splitting later is cheaper than
un-splitting.

**Disabled by default for consent, not because the practice is marginal.** It matches the empty source lists. Recorded
explicitly because a reader meeting a disabled default could otherwise infer the practice earns little: adopting these
passes moved issue-catching from _during or after code review_ to _before implementation_.

**Configuration is inert until a declared fire-point.** A non-`none` evaluator key is not ambient permission to spawn
and does not authorize the evaluator outside its activity. Each invocation is explicit through the conjunction of:

1. the executing workflow reaching its declared adversarial-review fire-point;
2. that activity's config key naming a registered evaluator; and
3. the dispatch binding the exact artifacts, rubric, orientation, pass cap, and prior findings, with a read-only
   no-edit contract.

That conjunction is the per-invocation activation carrier: the config selects the activity posture, while the current
workflow fire-point authorizes this run now. It needs no second conversational permission turn, and it creates no
standing "subagents allowed" state. The invocation and evaluator are surfaced with the resulting pass so an automatic
launch remains legible. This is a read-only derivation activity under DEV-RULES.ARC § Sub-agent scope; it does not
relax execution delegation.

**D7.3 — The evaluator domain is derived from an explicit audit capability.** `nextAction: "local-prepare"` proves
only that a source implements the local code-review operation; that operation derives a Git target and standard-review
requirement and does not establish arbitrary document-and-rubric audit support. The registration capability therefore
gains `auditActivities: ("planning" | "verification")[]`. `delegated-agent` declares both activities; providers that
only review diffs declare neither.

Each audit config key derives its valid evaluator domain by selecting registrations that name its activity. Naming a
hosted provider is then a validation error with a typed diagnostic rather than a runtime surprise, and the domain stays
correct as adapters change without treating an unrelated dispatch tag as proof. The constraint remains structural: at
draft-design time there is no diff and no pull request, only a document, so only a carrier explicitly declaring that
audit contract can serve. `delegated-agent` names the **carrier**, not the gate lane.

**D7.4 — Which stops survive streamlining.** The verification fire-point stops at every `Class` — the adversarial
fire-point scales its _posture_ by `Class` but the offer awaits a call regardless, so at `Light` it is a permission turn
about a pass the posture already declines to recommend. Removing it uniformly would reach every fire-point including the
three planning stages, which is wrong. The rule that decides:

> **A stop is required wherever the completion signal is not fully observable in the artifact.**

- **The verification trigger is artifact-observable.** The task list's phases are complete and the verification phase is
  the literal next item. An agent reading the artifact holds exactly what the developer holds, so the stop adds no
  information. Reaching this declared fire-point with a configured evaluator is therefore the explicit invocation;
  no additional authorization turn is required. Declining costs little either way: the adversarial pass **augments**
  the self-verify and never replaces it, so the floor beneath an automatically fired pass is the full criteria
  validation that runs regardless.
- **Planning-stage boundaries are not.** Whether a draft is done depends on intent the developer has not yet uttered,
  which no artifact carries and no readiness read can reach. Here the stop **is** the input channel, so it holds even
  when a project has opted in. Live evidence from this work unit's own grooming: the concern that became
  `integration-boundary-accuracy` existed only in the developer's head at the moment the draft otherwise read as
  complete; an autofired pass would have attacked a draft about to grow by roughly a third.
- **Integration has no standalone offer fire-point, but it remains in scope for proportional activity control.** Source
  lists opt the lanes into review spend; they do not decide whether a moved target needs a repeated complete pass, a
  focused supplemental pass, or only targeted verification. That remains the workflow's review-applicability judgment.
  Exact-head movement invalidates SHA-bound evidence and merge authority; it does not by itself invalidate the
  applicability of prior complete coverage. A request artifact proves delivery only, not that a provider accepted,
  started, or completed work, so no wait may be justified from delivery state alone.

**D7.5 — The planning-stage surface is a convergence check, not a spawn authorization form.** What is approved is that
_the stage is complete_; that agreement supplies the intent the artifact cannot show. Once supplied, the now-current
fire-point plus the configured evaluator explicitly activates the individual pass — not as standing consent and not as
a second decision. So the surface is one conversational question — this stage looks done, is there anything to raise
before it is attacked — never an enumeration of pass counts, rubrics, and evaluator conditions.

**What each surface owns after the change:** the `*_sources` and `*_audit` keys select whether an activity is enabled
and which evaluator serves it; the current declared workflow fire-point activates each individual invocation; `Class`
keeps only recommendation posture and pass cap, no longer doubling as an on/off switch; and the stage-completion stop
is untouched, being an input channel rather than a spend decision.

**D7.6 — Keep a tiny-Errand proportionality regression.** The `decompose-roadmap-supersession` integration is the
counterexample this design must make impossible: a small change with complete hosted coverage, one approved fix, clean
focused verification, and a later non-interacting test-only adjustment spent roughly forty minutes in review protocol
before merge. The path created an unused local operation, required caller-side internal record construction, waited on
an edited-summary signal the adapter could not observe, requested an unnecessary repeat review, and then treated the
posted request as work in progress.

The regression is behavioral, not a wall-clock threshold:

1. the preferred hosted source remains pending until pull-request coordinates exist instead of falling through to an
   unused local operation;
2. public verbs own any record construction needed for hosted response and settlement;
3. provider observation distinguishes delivery from accepted, running, and terminal activity, including an edited
   incremental-clean signal;
4. a narrow, demonstrably non-interacting target delta carries prior complete coverage through targeted verification
   without another provider request; and
5. the integration surface expands only unclean or decision-bearing facts while exact-head merge authority remains
   fail-closed.

The general rule-yield and runtime-override model remains `judgment-authority-model`'s. This unit consumes its governing
constraint — disclosed common-sense judgment stays available unless a genuine authority or bias boundary forbids it —
and owns the review-activity mechanics that must not obstruct that judgment.

---
