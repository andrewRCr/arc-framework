# Draft: Delivery Rebuild Continuity

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14). It consolidates two capture targets that were cut by
  lifecycle position — the former `delivery-authoring-rebuild` and `delivery-prepublication-evidence-applicability`
  — into the one mechanism they share, plus the ceremony-repetition doctrine row routed at that work unit's
  close-out re-read (2026-09-15).
- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified gate and
  Candidate evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a
  ceremony the covered inputs did not change.
- **Planning posture:** `Class: Heavy`, `P1`. The failures are proven from captured field incidents; the mechanism
  needs design across authoring, gate provisioning, and evidence applicability.

---

## Readiness

**State:** `re-entered` (2026-09-21). The D1, D2, D3, D4, and D7 half remains formalization-ready and is
crystallized in `spec-delivery-rebuild-continuity.md`. The D5 and D6 half is re-opened for derivation — see
§ Re-entry: where per-member verification runs. Nothing below that section has been revised for the re-entry yet;
read it first, because it supersedes the D5 and D6 material in § Decisions and § The deliverable stack.

**Resolved**

- Boundary: one work unit with an authored delivery plan (§ Boundary and Class).
- `Class: Heavy`, on the derivation axis, composing rather than inventing (§ Boundary and Class).
- One constructor parameterized by the predecessor relation, not two direction-specific builders (§ The
  constructor).
- The deliverable stack and its order, with the covered-input rule plus the eligibility-close narrowing landing
  first (§ The deliverable stack).
- Anchor selection under disjoint protected-base movement: retain the originating top's compatible chain base;
  a newer base OID alone never triggers a recut.
- D1's destination: `strategy-integration.md` § Review Admission and Head Movement, generalizing the sentence
  already there (§ Decisions, 3).
- D2's shape, and what it may not do alone: narrowing the close's final ref loop is safe only together with a live
  re-read and a re-scoped relation comparison (§ What the source shows, 4).
- D5 takes no configuration axis: the gate execution-environment contract reuses the project's existing worktree
  provisioning, verified at the real gate path, and its enforcement rides the gate-result record's run attributes
  rather than a creation-time refusal (§ Decisions, 1).
- The publication window: later review gates are the authority boundary, with no bounded in-call recheck
  (§ Decisions, 2).
- Evidence carry's minimal contract, proven in source rather than assumed — a prior gate result already binds
  deliverable ID, head, tree, and status, and a fresh snapshot accepts it unchanged (§ What the source shows, 5).
- The constructor's substrate-versus-projection split, so the tracked-tier normalization retires as a filter
  removal rather than a rewrite (§ The constructor).
- Where the gate-result hand-off lives: a fourth sibling namespace, `delivery/gate-results`, plan-keyed and written
  through the locked read-modify-publish path by a per-gate recording verb, defaulting both the close and publish,
  with three checkable extraction constraints (§ Decisions, 5).
- Rows are addressed by `deliverableId` rather than by position, which makes an unlanded-member reorder
  unobservable and keeps the reap at `closeout.ts` beside the plan and state records (§ Decisions, 5).
- Gate identity is a recorded run attribute — a digest of the resolved command set, refused on drift — which is
  what closes success criterion 1's restrictive half; scoping it to the command set rather than the file that holds
  them is what keeps it from re-firing a ceremony whose covered inputs did not change (§ Decisions, 5).
- Run attributes are recorder-written only: a caller-supplied result carries none and is accepted exactly as today,
  so neither the gate-identity nor the environment refusal can fire on it (§ Decisions, 5).
- The D2-before-D6 window is accepted deliberately rather than closed by reordering, and is recorded as a known
  transient with its closing condition named (§ The deliverable stack).
- D5's refusal predicate: the recorder resolves the realpath of the dependency root it used and tests it against
  the registered-worktree roster, recording a typed provenance value refused at the gate-result validation seam —
  new observation work D5 owns, not a read of existing behavior (§ Decisions, 1).

**Open**

- [none]

**Next**

Every settle-able decision is settled. Three adversarial passes ran at the readiness boundary on 2026-09-21. The
second reopened the gate-result record's key, D5's refusal predicate, and the publish consumer. The third was run
past the Class-scaled pass cap deliberately, because the passes had not converged — above-minor findings went four
then three — and because the second pass's own folds had never been attacked. It returned a blocker: success
criterion 1's restrictive clause had no mechanism, and D2 plus D6 together removed the blanket refusal that stood
in for one by accident. That is now closed by gate identity as a recorded run attribute, alongside a
first-member-scoped overlap operand, the row's addressing, and D5's observation predicate. The first delivery
member (D1+D2) stays fully bounded, and D3 through D6 each carry a stated direction with their residuals named for
the spec. The draft is ready for create-spec.

---

## Re-entry: where per-member verification runs (2026-09-21)

`create-spec` fired the mid-stage re-entry valve on a derivation signal whose _direction_ is unshaped, so this half
routes back to `draft-design` rather than being corrected in place. Recorded here before the ratchet, in the
valve's own order: capture durably, ratchet, re-enter.

**`Class` stays `Heavy`.** The re-entered design composes a well-documented industry pattern rather than inventing
concepts absent from the problem domain, which is the `Novel` threshold. The derivation is real; it is composition.

### What forced it

The finalization adversarial pass ran three scoped reviewers across the deliverable stack. Two findings against D5
and D6 survived source verification and could not be repaired in place.

**The gate-identity digest has no resolution source, and its referent is not well defined.** The Tier 2 command set
is a fenced bash block of prose in `QUICK-REFERENCE.md`, reached through a `quality-gate-commands` method that is an
explicit passthrough carrying an adopter override path. No CLI code resolves either surface, and the delivery
workflow has the _agent_ run the commands, so a recorder running in the gate cannot attest what executed. The
project's own gate-selection rule then narrows Tier 2 by changed paths, so two members of one plan may legitimately
run different subsets — "the resolved command set" names no single value even at one instant, and a resolver would
not fix that. Both available comparands fail as well: digesting the gate's own tree digests the member's tree, which
the constructor deliberately leaves unchanged under disjoint movement, so the digest cannot drift in exactly the
case the rule exists for; digesting the base's copy needs a fresh close-time resolution that does not exist.

**D5's environment predicate refuses every correct gate.** Gate checkouts are placed under the repository's common
directory, which is itself nested inside the primary worktree's registered path. "Resolved under a registered
worktree other than the gate's own" therefore matches the primary for a correctly provisioned, correctly in-gate
resolution — the accept case inverted, structurally rather than at an edge.

The second is a narrow correction. The first is not: the mechanism was asking for a capability — machine-resolvable,
machine-executed gates — that does not exist and that this work unit had no mandate to build. A deliverable that can
only work once a capability outside its scope arrives is a direction problem, not a shape problem.

### What the external research established

The question that opened was whether per-member verification belongs before publication at all. Sourced synthesis:

- **No mature stacked-PR tool verifies locally before publication.** ghstack, spr, Graphite, GitHub's native
  stacks, Sapling, and Jujutsu all verify through per-change CI after push. None carries a local pre-publication
  gate.
- **Graphite skips CI on mid-stack changes by default policy**, forcing it back on only at merge-queue time. Even
  per-member verification _server-side, after publication_ is treated as more than teams want by default. A
  per-member full suite run _locally, before_ publication is strictly more expensive than the thing the market
  leader turns off.
- **The mainstream position is explicit.** Google's presubmit is deliberately not full-suite — "too expensive" in
  their own words — and even presubmit runs only affected tests, remotely, with broader coverage post-submit.
  Fowler's staged pipeline is the canonical shape: a fast commit build, slower stages behind it.
- **Merge queues verify speculative combined states server-side** (GitHub merge queue, Zuul, Prow's Tide, bors).
  Tide _aborts_ stale speculative batches when the base moves rather than reusing any earlier result.
- **The closest precedent is Arcanist**, which can run lint and unit tests before a revision is created — but it is
  opt-in, commonly scoped to affected files, and advisory, with server-side CI authoritative at land time.
- **A deliberate search for a category that legitimately gates before publication came back negative.** The nearest
  analogues, Chromium's commit queue and remote-execution-backed presubmits, achieve thorough pre-land verification
  by making it _remote and cached_, never local.

Two findings bear on the evidence record specifically, independent of where gates run:

- **Locally-produced results are the case the closest analogue refuses to trust.** A remote build cache's action
  cache is input-addressed rather than content-verifiable, and the documented mitigation is to make it read-only,
  populated only by a trusted remote execution service, precisely because locally-produced entries cannot be
  verified. That is a direct precedent against recording local gate results as durable reusable evidence.
- **Test evidence is held to a stricter carry-forward bar than review evidence.** Gerrit carries a `Verified` label
  forward only when the parent tree, code delta, and commit message are unchanged, while it carries human review
  approval across a trivial rebase. Its designers made _test_ results harder to carry than _review_ results. A
  coordinate-based re-check sits on the looser side of that split, where practice puts the tighter test.

### The decision

**Per-member verification moves after publication.** The prepublication window stops running a full Tier 2 pass in
a provisioned checkout per member, and per-member verification becomes the published change request's own checks.
D5 and D6's evidence half exists only to carry locally-produced gate results across a window this decision removes,
so it goes with it.

**The policy change rides this work unit.** It is not routed to a successor. `RELEASE-GATES` sequences
`review-signal-convergence` — the highest-leverage ship on the board — behind this work unit precisely because RSC's
own landing is a delivery cut. The next delivery therefore rides whatever gate model this work unit ships, so
shipping the known-wrong model and deferring the correction would propagate it into the very work this unit exists
to unblock. The work unit gets smaller in mechanism and gains a doctrine change.

**An ADR is authored here.** `ADR-034` owns delivery landing timing and deliberately scoped itself to merge acts —
"member review and checks settle incrementally, but merge acts wait for the `Integrating` window" — so it decided
when members _merge_ and never decided when checks _run_ relative to publication. Nothing else records that choice
either: the per-member pre-publication gate appears to be "verify before publish" inherited from the singleton
lifecycle and generalized to every member of a stack without a recorded decision. This work unit authors that
decision rather than inheriting it further.

### What this changes in scope

**Out:** D5 entirely; D6's `delivery/gate-results` namespace, its per-gate recording verb, the gate-identity digest,
and the run-attribute field group. Gate provisioning inside the constructor goes with them, and with it the
per-gate provisioning cost, the disk-lifecycle question, and the gate-removal arm of the no-partial rule.

**Unchanged and already crystallized:** D1, D2, D3, D4, and D7. The chain still has to be rebuildable through one
typed operation, the eligibility close still has to stop refusing on non-covered base movement, refusals still have
to name a direction, and chain reconstruction still has to have one implementation. None of these depend on where
gates run.

**Still owed regardless, and not dissolved by this decision:** the Candidate applicability obligations behind
success criteria 2 through 5. Those concern review evidence and Candidate currentness, not Tier 2 gate results, so
they survive the re-entry intact. The pass left them resting on a direction-level paragraph naming no mechanism;
the trace below settles what they actually require, and it is narrower than the pass assumed.

**In:** the `strategy-integration.md` § Publication Boundary change, the ADR, and the `deliver-stack.md` edits that
follow from removing the gate-execution and gate-result steps.

### The applicability obligations, traced

Criteria 2 through 5 entered the re-entry as an open obligation with no named mechanism behind it. Tracing the
substrate settles them, and moves them out of construction work almost entirely.

**D6's stated mechanism does not exist.** Its text has an authorized reconcile or rebuild degrading to
_unexplained_ solely because of its lifecycle stage. The `unexplained` evidence-delta producer variant has no
construction site anywhere in the source — the only causes ever composed are base movement, approved fix, and
member rewrite — so the reducer arm that turns it into a `fresh` verdict is unreachable. The operator-facing
"unexplained" is a different object entirely: the integration checkpoint's `candidate-unexplained-delta`, raised
when projected Candidate currentness blocks because the current subject digest differs from the durable
baseline's.

**The authority seam already exists, and delivery already reaches it.** Projecting an effective Candidate target
does not stop at a blocked currentness. It derives structural contribution endpoints and a proof, then returns
either a machine-recognized current target or a fully composed decision carrying the `covered | targeted-check |
changed` choices, its offer and prompt text, and its projection and residual digests. Three delivery read sites
reach that projection. The two delivery calls that read raw currentness instead are baseline self-consistency
assertions against the baseline's own target — not comparisons against a rebuilt head.

**A content-preserving rebuild needs none of it.** The Candidate subject is work-unit-level: one identity, one
digest over the unit's whole reviewable contribution against the protected base. A rebuild that recuts member
commits without changing that union leaves the subject digest equal, so currentness projects as current through
its operational-only advance arm — the revision moves, the subject does not, and the evidence carries with no new
mechanism at all. The constructor's own required behavior is what makes that antecedent hold rather than merely
assume it: under disjoint movement it returns an unchanged chain, and newer base-only bytes the originating top
lacks are never silently imported. The union is therefore preserved exactly where the carry is claimed. The one
route that does change it — rebuilding the suffix after an authorized top correction — changes it by authority and
takes its own lineage transition, so the digest moving there is the seam working rather than a carry failing.

**The real gap is a result mapping, not a substrate.** Each delivery read site collapses every non-current
effective state into one opaque refusal, discarding a composed decision's choices, texts, and digests. The review
gate's own doors surface that same projection to the operator. So the degradation D6 named is genuine and is
exactly lifecycle-staged — but it lives in the delivery handler's result mapping rather than in the applicability
machinery, which is why no amount of extending that machinery would have reached it.

**Only the reconcile site is a defect.** Two of the three refuse correctly. The record-effect recovery arm
reconstructs what a write already did and asks a yes-or-no identity question with no operator decision available;
it is one of eleven identical returns and already carries an operator-facing remedy elsewhere. The boundary-carry
arm compares the recognized subject digest against the digest its boundary was established at, so a decision
_means_ the position moved and the refusal is accurate — surfacing a seam there would let an operator carry a
boundary across the very change the boundary exists to bound. The typed base reconcile is different: the same
function already handles a changed effective state further down, reading its current target to compose a projected
one, so the guard short-circuits a path the function otherwise knows how to walk — and reconcile is exactly where a
rebuilt chain's subject legitimately moves.

**What this leaves.** Criteria 2 through 5 stop being substrate extension and become one narrow correction plus
verification — surface the composed decision at the reconcile read site instead of flattening it, and prove a
rebuilt chain reaches the seam rather than an opaque refusal. They do not warrant a deliverable of their own.

### Resolved: what gates publication

**Publication reads the work-unit Candidate attestation; it runs nothing.** The per-member Tier 2 operand goes
away — `publish` today requires a non-empty gate-result list and reruns exact Tier 2 result admission against the
post-gate checkouts, and all of that is removed. What replaces it is not a new check but an existing one currently
produced and then ignored: Candidate currentness and convergence, read from the record `verify-work-unit` already
wrote.

**The signal is already unconditional.** `verify-work-unit` completes every project-designated gate and attests the
result as a durable Candidate; `prepare-work-unit` starts from that attestation and refuses to proceed without one.
A full work-unit gate run therefore already precedes every publication. Declining to read it would discard a result
ARC required, paid for, and already trusts at the integration checkpoint, which refuses `candidate-missing` with
"Integration requires a managed Candidate attestation."

**This is the idiom rather than a departure from it.** The research argues against _running_ per-member verification
locally before publication, which is what this work unit removes. It does not argue against reading a completed
work-unit verification: the staged-pipeline shape is a fast commit build with slower stages behind it, and the
work-unit gate run is that commit build. Gerrit gates submit by reading a `Verified` label a prior run produced.
Reading prior verification at a gate is ordinary.

**What the read catches.** The attestation is present by construction, so the check refuses in exactly one state —
the Candidate advanced after attestation and the delivery chain was prepared against the superseded subject.
`prepare-work-unit` already directs that an approved fix changing the Candidate requires rerunning delivery
preparation; reading currentness at publish is what catches a chain that did not. That is the continuity failure
this work unit exists for, caught at the seam where it becomes public.

**What it does not give.** The attestation is work-unit-level. It establishes that the union contribution passed,
never that a non-terminal member passed in isolation. Per-member content may reach the merge boundary without ever
having been checked alone, with the `Integrating` window, the terminal checkpoint, and the host's required checks as
the net. That is the accepted consequence, and the ADR states it rather than leaving a reader to infer that every
member was independently verified.

**Per-member checks are the project's CI policy, not ARC's requirement.** ARC publishes the stack; which published
members get checked is configuration the project owns. That is what admits the churn-reducing pattern the research
recorded — skipping checks on mid-stack members and reasserting them at merge-queue time — without ARC building any
mechanism for it. The ADR states the permission, never the policy.

### Resolved: how the publication boundary restates itself

Less changes than the question assumed. § Publication Boundary never mentions per-member gates: it already says
verification establishes an attestation over the exact work-unit subject, that private review and convergence settle
against that Candidate before publication, and that the attestation "is neither a review verdict nor merge
authority." All of that survives unchanged and is already correct for the decision above.

It needs one addition — that publishing **reads** the attestation rather than merely following it in sequence. The
existing text states an order; the decision makes it a check. The added clause says publication reads the
Candidate's currentness and convergence state and refuses a subject the attestation no longer covers, so work
prepared against a superseded Candidate cannot reach a public head. The section's second paragraph already handles
the mirror case of a moving _public_ head; this closes the private side it leaves open.

**The ambiguity is one line, and it is in § Delivery Shape and Landing Window rather than § Publication Boundary:**
"Review and checks gate members incrementally, but merges run in one post-publication landing window." It conflates
two different things and leaves check placement unstated — which is exactly the gap `ADR-034` left when it decided
merge timing only. It splits: review admission keeps its incremental gating and stays owned by § Review Admission
and Head Movement; member checks run after publication, against each published change request, on whatever check
policy the project configures. Publication carries one work-unit attestation, never a per-member check result.

**The consequence is stated rather than left to inference.** A non-terminal member may reach the landing window
without having been checked in isolation; the terminal checkpoint, the integration interlock, and the base's own
required checks are what stand between the composed result and the protected base. This belongs in the strategy and
not only in the ADR: the strategy is adopter-facing and cannot reference an internal decision record, so operational
rationale a reader needs has to stand alone there. The section already carries the companion half — that after
merge, base CI is the backstop and should run the same legs that gate a change request.

**Edit target.** `strategy-integration.md` is framework content whose two copies are currently byte-identical, so
the change goes through `packages/arc-framework/arc/**` and syncs to `.arc/`, never the reverse.

### Open for the re-entered half

1. What does the eligibility close validate once gate results are no longer its input? Existing validation accepts a
   caller-supplied result list; whether that operand remains, and what it means, is open.
2. Does the ADR amend `ADR-034` or supersede nothing and stand alone? Its axis is different — check placement rather
   than merge timing — which argues for a new record cross-referencing it.
3. What becomes of goals 3 and 4 as stated, both of which name gate evidence and gate-result attribution directly.
4. Is a CLI-executed gate verb still wanted as a convenience once it is no longer load-bearing for evidence, or
   dropped?

## Problem / Motivation

Initial and correction-time private-chain recuts, gate placement, and gate provisioning remain manual or unproven.
When the protected base moves under a bound plan, the chain has to be rebuilt, and everything already justified
against the old chain — gate results, Candidate evidence, applicability — has to be re-established or carried. The
captured incidents show both halves failing independently, and the second consuming the first.

The evidence-applicability capture states the target shape directly: disjoint protected-base movement should
re-observe eligibility **without repeating member gates whose covered inputs remain unchanged**, while changed gate
definitions or other actual covered inputs continue to prevent unsupported reuse.

## Boundary and Class

**Boundary outcome: `stays one WU + delivery-plan candidate`.** The concern stays cohesive — every deliverable
below is the same mechanism (a private chain moving under a plan) observed at a different lifecycle position — and
its deliverables are each independently landable on `main`, which is the delivery-plan test rather than the
decomposition test. Evidence basis: the consolidation's own two grounds (prepublication evidence applicability
consumes verified rebuild endpoints, and its implementation must coordinate with authoring), plus the source read
in § What the source shows, which establishes that D1, D2, and D3 land without the constructor. Sticky planning
judgment; re-raise only on a material new-evidence delta.

**Boundary widened past the successor's original scope, deliberately.** The completed `evidence-applicability`
planning close cut this successor to the overlapping and interrupted-authoring cases: that work unit says _when_ a
rebuild is owed (the predecessor-relation predicate), and the successor says _how_. The consolidation widened it to
disjoint movement and initial authoring as well, on the grounds recorded above. That widening supersedes the
narrower successor boundary rather than diverging from it.

**`Class: Heavy`**, confirmed rather than ratcheted. The derivation trigger fires — a real design must be authored
across three lifecycle positions before a competent engineer can start. The invent-versus-compose scan lands on
**compose**: every piece composes existing primitives (the locator, materialization, lifecycle normalization, the
private-gate pair, leases, eligibility, the applicability reducer), and nothing requires a concept the problem
domain lacks. So `Heavy`, not `Novel`. The capture's provisional `Heavy` signal — "planning may reduce the class
only if the existing records and reducer make the work a mechanical extension with no new authority design" — is
not met: the constructor is new authority design.

Planning depth for this stage: **`high`**.

## What the source shows

Read against `eligibility.ts`, `review-fix-candidate-gate.ts`, and the `delivery authoring` verb surface at
`dbd74aca4`. Five findings that the captures did not have, and that move the design.

**1. Two of the three primitives the authoring capture asks for already exist.**
`createDeliveryReviewFixCandidatePair` in `review-fix-candidate-gate.ts` performs the ARC-private `update-ref` and
the detached `git worktree add` for the gate. It takes `{head, tree}` as input and is reachable only from the bound
`authoring-rematerialize` path. Object construction already exists in the same library too: `chain-absorption.ts`
runs `merge-tree --write-tree` for a real three-way merge, then `commit-tree` on the merged tree and a leased
`update-ref`; `chain-adoption.ts` runs `commit-tree` plus a compare-and-swap `update-ref`. That is the shape a recut
member needs. So the missing piece is narrower still than "own commit and tree construction, refs, and gate
placement": it is **coordinate production**, plus a route from the unbound initial-authoring path to primitives that
already exist — and the constructor composes those primitives rather than writing object construction from scratch.

**2. The eligibility-close refusal needs no constructor.** `source-moved` is the last check in
`closeDeliveryEligibility` — a flat loop over `[protectedBase, top, ...members]` comparing head and tree. Every
check above it has already passed: predecessor relation, chain base, lifecycle paths, normalized completeness, plan
revision, member bindings. The loop conflates two purposes. `top` and `members` must not move, because the gate
results bind to exactly those coordinates. `protectedBase` moving invalidates nothing, because every consumer of it
already matched against the snapshot's recorded value.

The genuinely unsafe case is caught upstream and carries a named remedy: a `diverged` relation with non-empty
`overlap.substantivePaths` refuses `wrong-predecessor` with `remedy: delivery-authoring-rebuild-required`.

One subtlety makes this a fix rather than a deletion. `predecessorRelation` is recomputed at close, but against
`observedTip: snapshot.protectedBase.head` — the snapshot's recorded base, not the live one. The close therefore
proves the chain against a stale tip and then rejects because the live ref moved. The correction is to re-observe
the relation against the **live** tip and let the existing overlap guard decide, not to drop the final check.

**3. The direction-blind refusal is one return statement, and the direction is already in scope.** The
`completeness-*` refusal returns `{ status, reason }` and nothing else, while the richer sibling refusals in the same
function — `ambiguous-predecessor-base`, `unrelated-predecessor`, and the three `wrong-predecessor` arms — carry
`deliverableId` and `detail`, and often `relation` and `remedy`. The remaining two named refusals are partial:
`head-already-bound` carries only `deliverableId`, and `source-moved` carries `source` and `nextAction`. About half
return bare, so the asymmetry that matters is between refusals that could name a direction and one that holds the
operands to do it and does not. `snapshot.top`, `finalCandidate`, and
both base trees are all in scope at that line. This is why the authoring and rematerialization cells produce
byte-identical typed results for opposite conditions with opposite remedies.

**4. Inside the mechanical close, the final ref loop is the only live read of the protected base — which makes
narrowing it a five-part change, not a deletion.** Every read of `snapshot.protectedBase` inside
`closeMechanicalDeliveryEligibility` takes the **recorded** value; the final ref loop is the only live read:

- The `predecessorRelation` recomputation passes `observedTip: snapshot.protectedBase.head` — a recorded value,
  which is why the recomputation is deterministic (below).
- `compareNormalizedCompleteness` receives `snapshot.protectedBase` and uses only its `tree`, forwarded as
  `protectedBaseTree` to the normalized-tree comparison.
- The `currentChainBase` resolution uses `snapshot.protectedBase` as a value shortcut when the chain-base head
  equals it.
- The `source-moved` refusal payload carries `protectedBaseRef: snapshot.protectedBase.ref`, which is inert — it
  is narration on a refusal the narrowing removes.

So nothing inside the mechanical close depends on the live base being unchanged, which is the answer the narrowing
needs. (`suffix-rematerialization.ts` also compares `{ ref: snapshot.protectedBase.ref, ...snapshot.chainBase }`
value-against-value, but it is reached from the handler rather than from inside this function, so it is not one of
these consumers.)

**The enclosing verb is a different matter.** `closeDeliveryEligibilityForPublication` runs two live protected-base
reads _above_ the mechanical close: it resolves the lifecycle path set from `refs/heads/<base>` and refuses
`lifecycle-paths-moved` on drift, and it revalidates each member's lifecycle contribution, where
`deriveDeliveryMemberLifecycleRevalidation` passes `snapshot.protectedBase.ref` — a ref _name_, resolved live at
`ls-tree` time — while passing the chain base beside it as a recorded OID.

That asymmetry is the finding: the derivation already knows how to pin, pins one operand and not the other, and
leaves `snapshot.protectedBase.head` unused in the same snapshot. The exposure is narrow. On genuinely disjoint
movement the entries at this work unit's lifecycle paths do not change, so the comparison matches and nothing
refuses; it reaches only movement at this work unit's _own_ lifecycle paths — which includes the Candidate record
`review-fix-record-effects.ts` writes, so the reachable case sits inside this work unit's territory rather than off
to one side. It refuses identically today, so D2 neither narrows it away nor regresses it. Pinning it is a one-token
change, routed to D6 because D6 touches this comparison anyway and D2 keeps its scope as the safest first member.
Verification must widen the fixture regardless: the pinned probes stub `resolveLifecyclePaths` to a constant that is
the single regenerable path, so neither live read is observable today.

But two further facts make the naive narrowing wrong:

**The close cannot currently see base movement at all.** `predecessorRelation` is recomputed at close from
`memberHead: firstMember.head` and `observedTip: snapshot.protectedBase.head` — both snapshot values over
immutable commits — so the recomputation is deterministic and can never differ from the stored relation. Its
purpose is snapshot integrity (catching a snapshot whose relation was fabricated), not fresh observation. Remove
the final loop's `protectedBase` entry and the close stops observing the live base entirely, so genuinely
_overlapping_ movement would pass unseen.

**And switching `observedTip` to the live tip trades one refusal for another.** `samePredecessorRelation` compares
`observedTip` before anything else, so any base movement — disjoint included — fails it and refuses
`wrong-predecessor` with "The reobserved predecessor relation does not match the prepared snapshot." The relation
_kind_ moves legitimately too: a member cut from the old base reads `advanced` against it and `diverged` against
the advanced one.

**What survives as the invariant is `chainBase`, not the base tip.** At prepare, `chainBase` is recorded by value
— for an `unchanged` or `advanced` relation it is copied from the protected base's coordinates, otherwise it is a
separately observed ref — so it stays pinned even as `refs/heads/main` moves past it. That pin is what actually
protects the members: it is what they were cut from.

**And the guard that survives is scoped to one member, not the chain.** The close computes its relation from
`firstMember = snapshot.members[0]`, and `predecessorRelation` passes that head straight into
`readOverlap(memberHead, observedTip)`, which intersects the paths changed between the merge base and _that member_
with the paths the base changed. Prepare requires every later member to be a descendant of its predecessor, so
members 2..n contribute nothing to the left-hand set. Base movement that overlaps a later member but not the first
therefore yields an empty intersection and passes the guard. Re-scope the left operand to `finalCandidate` — already
resolved beside `firstMember` at that line — whose changed-path set is the union across the chain.

The fix is therefore five coordinated parts: re-observe the relation against a **live** protected-base read; keep
the `diverged`-with-substantive-overlap guard on that fresh relation, where it becomes a real safety check instead
of a replay; re-scope that guard's overlap operand from the first member to the final candidate; re-scope
`samePredecessorRelation` to compare `chainBase` and drop `observedTip` and kind equality;
and only then narrow the final ref loop to `[top, ...members]`. The snapshot's `predecessorRelation` field becomes
provenance rather than a close-time equality target.

Residual to carry into the spec: dropping `observedTip` and kind equality weakens the snapshot-integrity check that
comparison currently performs, and what survives of the re-scoped comparison is thinner than "five parts" suggests.
The close already refuses independently when `snapshot.chainBase.head` disagrees with the freshly reobserved
relation's chain base, and prepare already binds those two together, so a `chainBase`-only comparison adds one
intra-snapshot consistency check rather than a second binding. The fresh overlap guard plus that independent
chain-base refusal are the real replacement; verification must show they cover the fabricated-snapshot case the old
comparison caught, and the spec must not re-derive a duplicate comparison from the five-part list.

**5. The gate-result carry contract exists and is enforced for the coordinates it binds; what is missing is a
caller-side home and a binding for the gate itself.**
`DeliveryCandidateGateResult` binds `deliverableId`, `head`, `tree`, and `status` — exactly the minimal contract the
evidence-carry decision proposed to prove before considering persistence. `validateDeliveryCandidateGateResults` runs
those results against a **freshly prepared** snapshot and refuses only on duplicate, missing, reordered,
`gate-result-stale` (head or tree differ), or `gate-result-failed`. So a fresh preparation that reproduces the same
member head and tree already accepts a prior gate result: the _permissive_ half of the covered-input rule is
implemented at this seam. The restrictive half is not. Those four fields are the member's coordinates; nothing in
them identifies the gate that ran, so a changed gate definition is not a covered input this seam can see. Today the
close's blanket refusal on any protected-base movement masks that — it forces a re-gate regardless — and D2 removes
it. Decision 5 carries the replacement.

The snapshot is explicitly an ephemeral mechanical value and never a persisted authorization token, and `gateResults`
arrives as a caller-supplied input on the close and publish requests. The library therefore never held the completed
results and never discarded them — the session did. That relocates the 2026-09-12 loss from the evidence model to
the caller-side hand-off, which is what decision 5 settles.

## The constructor

**One constructor, parameterized by the predecessor relation.** The two directions are opposites — at initial
authoring the members are ahead of the top and the remedy is to recut on the top's base; at bound correction the
top is ahead of the members and the remedy is to rebuild the suffix from the corrected top — but they already share
pair creation, and the direction is decided by the predecessor relation the preflight must read anyway. Two
direction-specific builders would duplicate the preflight and re-create the same collapse from the other side.

It owns coordinate production and composes existing primitives rather than new ones: the locator, materialization,
lifecycle-normalization, private-gate, lease, and eligibility surfaces, plus the object-construction primitives
already in the same library — `chain-absorption`'s `merge-tree --write-tree` / `commit-tree` / leased `update-ref`
sequence, and `chain-adoption`'s compare-and-swap adoption. It introduces no parallel plan or state record, and no
new object-construction path.

Required behavior, carried forward from the captures:

- Prepare or compare-and-swap rebuild the complete unpublished candidate chain from an anchor compatible with the
  originating top and the observed protected-base relation, the canonical member boundaries, and authoritative
  lifecycle exclusions.
- Under disjoint protected-base movement, retain the top's compatible chain base and return an **unchanged chain**
  when the existing cuts remain compatible. A newer base OID alone must not trigger recutting, and newer base-only
  bytes the originating top lacks must not be silently imported.
- Preflight any proposed chain's predecessor relation and normalized completeness against the originating top
  **before** returning gate work, so a mechanically wrong anchor cannot consume a full gate cycle before
  `eligibility close` rejects it.
- On the bound review-fix route, after the authorized top correction is clean and committed, rebuild the selected
  member and every dependent private candidate from the current public ancestry and canonical member boundaries,
  place their managed gates, then resume rematerialization.
- Derive every managed gate's path from the same locator the reaper uses. The gate-pair primitive takes
  `checkoutPath` as a caller-supplied `z.string().min(1)` with nothing tying it to a gates root, while
  `residue-reaping.ts` is the only site that composes `<commonDir>/arc/delivery-gates/<planId>/<chunkKey>`. The
  guarantee today is the caller's, not the primitive's: the one path that reaches the primitive is
  `authoring-rematerialize`, which refuses `authoring-rematerialize-coordinate-mismatch` unless the resolved
  locator path equals the requested checkout path. So no malformed gate directory is reachable on current source —
  the hazard is that D4's new unbound caller would have to re-derive that same guard, and a caller that omitted it
  would place a gate permanently unreachable by reaping with nothing to reject it. One locator with two callers
  closes the class at the primitive instead of per caller; reaping the instances already on disk is an errand's,
  not this work unit's. This also gives D5 a canonical gate identity to record provenance against.
- Replay converges. Conflicts, dirty or foreign gates, moved authority or public heads, stale authorization, and
  incomplete normalization refuse **without a partial adopted chain**.
- A real conflict stops with its exact member and leaves the old chain usable.

**Substrate contracts versus tracked-tier projection.** Coordinate production today includes normalizing trees
against lifecycle and Candidate records, because those artifacts ride the work unit's code history. That
normalization is tracked-tier projection, and the storage direction schedules its retirement: once operational state
materializes off-branch, members become ordinary interior refs and the exclusion set empties. The rest of the
constructor is substrate-independent — anchor preflight, the retained chain base, compare-and-swap rebuild, the
no-partial-adopted-chain rule, the exact-member conflict stop, and member-boundary verification all survive that
change unaltered. Author the split so the retirement stays a filter removal rather than a rewrite: the exclusion set
reaches the constructor through one resolver seam the constructor does not own, never as an inlined path list.
`operational-state-docs` is the eventual supplier of that seam through its classification annotation; until it
lands, the seam is simply a boundary with one caller.

A clean, unbound stack reaches exact gate-ready coordinates through one typed operation with **no per-member
hand-authored Git steps**. The constructor does not claim to make tests instantaneous or to auto-resolve a semantic
conflict — the 2026-09-13 incident's 38 minutes went largely to semantic conflict resolution after an upstream
test-file extraction, and to finding post-cut changes that belonged in specific members. Gate-result carry and
bounded re-verification are D6's, not the constructor's.

**Prior intent this restores.** The completed `delivery-native-stack-composition` design explicitly records that
base movement before materialization is an ordinary work-unit base merge followed by member verification reruns,
commits that the protected base is never frozen, and budgets **no manual recuts**. It later exposed the typed
`authoring rematerialize` and `authoring rebind` verbs, but both require an already-bound Delivery State revision
and were scoped to public review-fix replay. The unbound initial-publication case was neither implemented nor
recorded as a deferral — that work unit's own initial publication preceded its late exact-tree gate-admission
amendments, so its dogfood concentrated on bound correction and landing recovery and never exercised this final
prepublication path.

## The deliverable stack

Each row is independently landable on `main`. Rows are in ID order; the `Depends on` column carries the delivery
plan's dependency ordering, which is not a task sequence — D5 follows D6 despite the lower number.

| ID | Deliverable                                                     | Depends on    | Retires     |
| -- | --------------------------------------------------------------- | ------------- | ----------- |
| D1 | The covered-input rule, stated in a shared surface              | —             | —           |
| D2 | Eligibility close stops refusing on non-covered source movement | —             | probe 1     |
| D3 | `completeness-*` refusals carry direction and remedy            | —             | —           |
| D4 | Chain constructor, anchor preflight, `rebuild-required`         | —             | probes 2, 3 |
| D5 | Gate execution-environment contract                             | D4, D6        | —           |
| D6 | Evidence carry, and the gate-result record that persists it     | D4            | —           |

D2 is a five-part change rather than a check removal — see § What the source shows, 4. Its verification must
cover disjoint movement closing `eligible`, overlapping movement still refusing on the fresh relation — including
movement that overlaps a **later** member and not the first, which the current first-member operand misses — and the
fabricated-snapshot case the re-scoped comparison no longer catches by `observedTip`. The fixture must also stop
stubbing `resolveLifecyclePaths` to a single constant, or neither live protected-base read in the enclosing close is
observable to any probe.

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable.

**That ordering opens a window, and this work unit accepts it deliberately.** D2 removes the blanket `source-moved`
entry that today forces a re-gate on any base movement, and D6 supplies the gate-identity digest that replaces the
half of that coverage worth keeping. Between D2 landing and D6 landing, a base change that edits the Tier 2 command
set is unguarded: a result gated under the old commands would be reused. The window is accepted rather than closed
by reordering, because putting D6 first makes the riskiest deliverable the one that lands on an unrepaired
mechanism — the opposite of the reasoning that selected D1+D2 — and the exposure is a development-time reuse of
gate evidence in a pre-public-release project whose delivery stack is dogfooded by its own author. Record it in the
spec as a known transient with its closing condition named, not as a residual discovered later.

**D3 carries one typed-crossing rider.** `checkpointMovementCause` is stringly typed at its producer and absent
from the consumer's declared input, so neither end of that crossing is compiler-enforced while every sibling
crossing introduced alongside it is. No live defect; the hazard is that a new overlap status reaches the surface
unadmitted and silently. It rides D3 because it is the same family — a refusal payload whose typing does not carry
what its consumer must discriminate on — and it was verified against source before it was deferred from a
pre-publication review.

**Single-branch fallback, recorded up front.** If the stacked landing cannot proceed, this work unit lands as a
plain single-branch merge. The failure mode being guarded is depending on the broken mechanism to ship its own
fix. Post-landing recovery has shipped, so the risk gate's first condition is met by evidence rather than by
contingency — re-verify the route at the specific landing.

## Decisions

1. **Settled: D5 takes no configuration axis.** The contract binds a gate to an environment established for it
   and refuses a silently inherited one; the mechanism is the project's existing worktree provisioning, reused
   rather than duplicated.

   The originating capture asks for three acceptable behaviors — a prepared checkout must resolve dependencies from
   its authoritative source checkout, provision its own, or fail explicitly — not for a knob. The earlier
   "project-configurable" reading overstated the ask and is corrected here. Three reads then converge on no axis:
   the proportionality flag (`speculative-capability`), the storage direction's axis-explosion test (could this be
   a property of an existing axis?), and its rule that workflow logic stays mode-agnostic.

   Verified at the real path shape on 2026-09-21 rather than argued. An unprovisioned detached checkout under the
   primary's `.git/` resolved a dependency from the primary's `node_modules` — the 2026-09-12 failure reproduced in
   one command. Running the configured worktree provisioning in place installed the workspace locally in 5.4s,
   built the bundle, and moved resolution to the gate's own tree; the primary's manifest was untouched. The
   provisioning helper takes a path and carries no work-unit or branch coupling, so gates reach it unchanged.

   **State the contract ecosystem-neutrally.** A gate result must be attributable to its exact coordinates _and_ to
   an environment that is not a sibling's. Provisioning is one mechanism for that, not the contract: ecosystems
   with global caches or committed resolution need no provisioning at all, and a refusal keyed to "no provisioning
   configured" would refuse projects that are already correct — more exacting than the ecosystem, which is the
   posture to avoid.

   **Where the contract is enforced, and on what predicate.** Not at gate creation: a silently inherited
   environment is not observable ahead of time, and the only predicate available there is the rejected one. The
   recording verb observes it instead, in the gate, and writes a typed provenance value onto the gate-result row.

   The predicate is **not** "resolved outside its own tree" — shared caches are correct and ordinary across
   ecosystems, so Go's module cache, Gradle's and Maven's home caches, and Cargo's registry would all trip it. What
   actually failed on 2026-09-12 was resolution from _another registered worktree of this repository_: a sibling's
   build output, not a shared cache. The worktree roster already makes that checkable. So provenance is a closed
   value — resolution observed inside this gate, observed under another registered worktree, or **not observable** —
   and only the middle one refuses.

   The `not-observable` arm is what keeps this from being more exacting than the ecosystem: where a project's
   resolution cannot be attributed, the result records that and passes. The refusal reads the row's own recorded
   value and needs no fresh observation at close, which is what the earlier consumption-time framing lacked. Its
   fire site is the existing gate-result validation, with one added refusal reason — the placement decision 3
   requires for a restrictive rule, rather than doctrine alone in a strategy document. The value reaches that seam
   as a recorder-written run attribute on the row; a caller-supplied row carries none and is accepted unchanged
   (§ Decisions, 5). The observation itself is new work, and decision 5 states its predicate.

   The cost stays as decision 2 settles it: an unusable result is learned at close rather than prevented at
   creation, and a gate cycle can be spent before that is known.

   Two things to carry into the spec: the per-gate cost is about 148 MB at this project's settings, which a
   project's own provisioning script is free to reduce; and the contract as stated survives a Tier 2 that runs in
   CI rather than in a local gate.

2. **Settled: later review gates are the authority boundary; no bounded in-call recheck.** Once `state.target` is
   bound, `materializeBoundDeliveryChain` skips its observed-tip check. Each retry freshly closes eligibility
   before mutation, but the protected ref can move between that close and later private-ref or draft-PR effects,
   which can leave stale publication artifacts without granting merge authority. The tip guard lives inside the
   branch that binds the target, so it stops applying at exactly the moment the chain becomes publishable.

   Two independent reads settle it the same way. Industry practice at this seam is uniform: a merge queue's
   mergeability is advisory and recomputed at the merge gate, submit rules evaluate at submit time, speculative
   gating resets and rebuilds rather than preventing staleness, and stacked-PR tooling restacks on demand and
   defers to the host's merge rules. The safety property everywhere is compare-and-swap at the mutating write plus
   authority at the final gate — never a pre-check inserted mid-sequence — and the leased private-ref updates
   already hold the first half. Adding a recheck would be more exacting than the host at a host seam, which the
   project's external-seam rule declines while keeping stronger exactness in ARC-owned validation. Forward
   compatibility points the same way: the durable integration-resume surface is being typed elsewhere, and a
   bespoke in-call recheck is what that work would later have to absorb.

   The design response to the residual is legibility, not prevention: make the residual scope visible in the
   payload, keep the compare-and-swap on every ARC-owned write, and disclose the race as a recovery-complete
   refusal does. Success criterion 6 admits this outcome directly through its explicit, evidence-backed
   non-authoritative residual.

3. **Settled: `strategy-integration.md` § Review Admission and Head Movement**, generalizing the sentence already
   there. That section currently reads "Evidence applicability follows the content an earlier result covers, never
   head movement by itself" — the specific form of exactly this rule, scoped to evidence applicability. The work is
   to widen it to every ceremony in the post-execution tail, not to author a new home.

   Five things make this the right surface rather than a nearest fit. The specific form already lives there, so
   this generalizes a sentence at its own home rather than burying doctrine in whichever strategy owns the domain
   — which is the distinction `strategy-knowledge-evolution` Principle 1 draws. The strategy's charter is the
   post-execution tail almost word for word: publication boundary, landing window, exact-head review admission,
   the terminal checkpoint and merge, and post-landing hand-back. Its `STRATEGY-INDEX` entry is already a
   directive firing condition naming both trigger and suppressed default ("ALWAYS load before designing or
   changing one work unit's publication boundary … do not distribute integration doctrine across lifecycle
   workflows"), so reachability is satisfied by an existing correctly-scoped trigger and the always-loaded set
   does not grow (Principles 2 and 10). It ships — `init-recipe.json` line 32 — so ceremonies in adopter projects
   reach it. And it is not delivery-scoped: the section already states that delivery and singleton integration use
   the same authority boundary, which is the capture's own constraint satisfied rather than worked around.

   Residual for D1 to check rather than assume: the generalization widens the content past what the existing
   trigger names, so confirm the firing condition still reaches the rule's non-delivery consumers. Its wording
   spans the post-execution tail generically, so it likely does; if it does not, a one-clause widening of the
   trigger rides D1 rather than becoming its own concern.

   **The constraint-versus-doctrine split, stated so it is not lost.** Principle 1 forbids placing a hard
   invariant mid-document in an on-demand file. The permissive half of this rule — a ceremony need not repeat when
   its covered inputs are unchanged — is design doctrine, consumed by whoever designs a ceremony boundary, not by
   an executing session deciding whether to run a gate. The restrictive half — changed covered inputs prevent
   unsupported reuse — reads as a constraint, and is placed **at the fire site** rather than only in the strategy:
   D2 is that placement for the eligibility close, and `DEV-RULES.ARC` § Rule Authority already holds the
   check-integrity backstop that makes an agent-side reuse decision invariant. So the constraint half lands where
   its operation fires and the strategy carries the generalization.

   **The load-set-scoping irrelevance defect does not bite here.** That recorded defect governs _demoting_ content
   with no trigger. Nothing is demoted: this adds to an on-demand surface that already has a correctly-scoped
   trigger, so clause (a) reachability applies rather than clause (b).

   Original constraint, retained as the record: not in this draft's body, and not in a delivery-scoped document. The
   rule spans every ceremony in the post-execution tail while this work unit is one consumer of it; the
   characterization's forward-compatibility screen fired `knowledge-evolution` on exactly this point, with the
   pointer "placement of agent-facing guidance". Land it in a shared surface that non-delivery ceremonies reach and
   let this work unit cite it like any other consumer. Placement is the open question; wording is not.

   **Why this work unit owns it.** The rule has to be settled for this surface regardless: this draft's Purpose
   states it ("neither initial authoring nor a correction-time recut forces a ceremony the covered inputs did not
   change"), the evidence-applicability capture cites the doctrine as already settled, and success criterion 1
   operationalizes it. Stating it once costs a paragraph rather than a phase. Its weight accumulated rather than
   faded: the characterization's second matrix kept routing findings back to its absence, and refusal-remedy
   accuracy reached four instances, three of them working remedies the failing result never names and one a remedy
   that is named and provably cannot clear its own refusal.

4. **Settled** — see § What the source shows, 4. No consumer _inside the mechanical close_ depends on the live
   protected base being unchanged, but the narrowing is a five-part coordinated change rather than a check removal,
   and it re-scopes `samePredecessorRelation`. Two residuals carry into the spec: the weakened snapshot-integrity
   check, and the enclosing close's two live protected-base reads, which D2 leaves exactly as they stand. The
   unpinned operand in `deriveDeliveryMemberLifecycleRevalidation` routes to D6, and the probe fixture's stubbed
   `resolveLifecyclePaths` widens regardless of which deliverable pins it.

5. **Settled: gate results land in a fourth delivery namespace, written by a per-gate recording verb, and the close
   reads them when its operand is omitted.** The minimal contract the capture asked to prove first — a prior gate result
   binds deliverable ID, head, tree, and status, and may be accepted by a fresh snapshot when those covered inputs
   are unchanged — is implemented and enforced today (§ What the source shows, 5). What was missing was never the
   model; it was a home for the hand-off, and naming "the existing record family" was not yet naming one.
   Two source checks bound what is left. **No persisted delivery record carries gate results** — nothing in the
   delivery library outside the eligibility module mentions them, so binding the target does not retain them
   either. And the workflow driving the stack tells the session to **hand-compose the result list** — deliverable
   ID, the returned candidate head, the returned tree, `status: "passed"` — pipe it to the close, then supply the
   same list again to publish. The transcript is the only home this evidence has ever had, across two separate
   windows.

   That removes the lighter arm. In-operation plumbing would close the case where preparation, gates, and close run
   inside one continuous session, but preparation's own contract pins the chain _before workflow-owned gates run_,
   so the gates fall between preparation and close by construction, and that window is as long as Tier 2 takes
   across every member. The 2026-09-13 incident spent two complete sets of three Tier 2 gates inside one such
   window. So the hand-off must outlive a session, and the surviving choice was between a scratch artifact the
   operator re-supplies and a durable record in the delivery family. The record wins: a scratch
   artifact keeps the evidence agent-typed, readable by nothing else, and carries its own lifecycle with no owner —
   the failure shape already recorded against ceremony-created residue.

   Two further reads point the same way, independently of continuity. Hand-composed results mean the session types
   the coordinates it claims were tested; the close still compares them against a freshly observed member and
   refuses `gate-result-stale` on any drift, so this is not a trust hole today, but recording them at the source
   removes the transcription step rather than validating around it. And the current shape is a procedural-substrate
   violation as it stands: the coordinates are machine-emitted by a prior verb, and the workflow has the session
   re-type them into the next request body — prose moving data the CLI already holds, which is exactly what the
   substrate rule's first principle forbids. A recorded result is therefore the compliant shape, not only the
   durable one.

   **What the durable arm must not be read as weakening.** A stored gate result is not a persisted authorization
   token. The close still re-prepares fresh, and the validator still compares head and tree against the freshly
   observed member before accepting. The record is an input to that check, never a bypass of it, and the only trust
   it carries — `status: "passed"` — is exactly the trust the hand-supplied list carries today.

   The substrate to extend is the existing path-treatment, typed-delta, reducer, evidence-reference, and
   operator-bound Candidate applicability machinery, across one cohesive boundary; an authoritative prepublication
   reconcile or rebuild cause must reach the existing `covered | targeted-check | changed` authority seam through
   Candidate currentness rather than degrading to unexplained solely because of its lifecycle stage. Add no generic
   evidence store, ancestry-only carry, or arbitrary evidence-kind framework.

   **Four homes are eliminated on source grounds.** `delivery/state` holds no record for this plan during the window:
   `publish` is where `stateStore.read` returns null and initial binding creates it, so on an initial publication —
   the exact case this work unit exists to fix — there is no state record at close to read. The close does reach that
   namespace, through `resolveMemberReadOnly` for its `head-already-bound` check; what is absent is this plan's own
   record, not store access. `delivery/plans` is digest-sealed: `planDigest` derives over every field but itself and
   the close refuses `plan-moved` on any drift, so a per-run mutable field cannot ride it. The tracked Candidate
   record is wrong twice over — it is a working-tree path, and it is an unconditional non-regenerable
   lifecycle-contribution path compared against the protected base, so every gate-result write would trip
   `lifecycle-contribution` at the next close, on the very tracked tier § The constructor says is retiring. And
   `delivery/authoring` is the wrong _window_ rather than the wrong substrate: it carries plan-composition material
   keyed by `mapId`, it is reached from the composition handler and never from the execution one, and composition
   deletes its snapshot on completion — so it has closed before prepare opens.

   **The fourth sibling namespace, `delivery/gate-results`.** The delivery namespace vocabulary is already
   enumerated in the substrate: `GitCommonStateLocationSchema` constrains the `delivery` root to
   `z.enum(["plans", "state", "authoring"])`, and its inferred `GitCommonStateLocation` is what makes a fourth
   member a compiler-checked extension rather than a loose addition. The `DeliveryStateNamespace` alias beside it
   looks like the same gate and is not — it has no consumer anywhere in source, so declaring a member there checks
   nothing. `parseAddress` already carries an `authoring`-only extension special case, so per-namespace rules have
   precedent. It is keyed by plan and carries one row per deliverable.

   **Why a namespace rather than a field on the plan record.** Not contention — that argument was checked and does
   not hold. `GitCommonStatePublisher.update` performs read, modify, and publish inside one namespace lock, so
   concurrent gate writers against a single plan-keyed record serialize and never conflict; the `version-conflict`
   failure belongs to `publishRevisionedRecord`, which the state store uses when a caller reads early and publishes
   later. The same lock is per namespace, so per-deliverable record names would not reduce serialization either —
   and they are rejected on that basis, having cost a sanitized name (`parseAddress` admits
   `^[a-z0-9][a-z0-9.-]*\.json$` while a `deliverableId` is `sha256:<64 hex>`), a new record-name function, and a
   new addressed-identity rule, in exchange for nothing measurable.

   The real ground is structural fit. The family already draws this line: `plans` holds immutable plan identity,
   `state` holds the mutable execution state that accrues across a lifecycle. Gate results are the second kind, so
   a fourth sibling extends an existing distinction while a field on the plan record inverts one. A digest-excluded
   field also carries two defects the namespace does not: `publishCurrent` is digest-checked, so a digest-invisible
   field passes that check and a second writer silently clobbers the first, and `restoreExact` acquires an
   unanswered question about whether restoring a plan restores or discards its gate results.

   **The writer uses the locked read-modify-publish path.** It must compute new content from `current` inside the
   `update` callback rather than reading early and publishing later against an expected revision — the opposite of
   the state store's pattern, and what makes concurrent gate writes safe without a retry loop.

   **Three extraction constraints, each checkable.** Copy the `plans` / `state` pattern rather than `authoring`'s:
   `authoring-store.ts` holds its port, its adapter, and its location literal in one module, and is the family
   member that would not lift cleanly.

   - Declare the namespace in `GitCommonStateLocationSchema`'s `delivery` enum — the surface that has consumers —
     and decide whether the dead `DeliveryStateNamespace` alias is updated alongside it or removed.
   - Put the port in `ports.ts` with its own closed failure contract, and the git-common adapter in
     `local-stores.ts`, which alone names the location literal.
   - Write plan-keyed, through the publisher's locked read-modify-publish path (`update`) — not the revisioned
     publish the state store uses, whose expected-revision contract is what would force a retry loop.

   Forward extraction is then one new adapter against an unchanged port with no caller edits, and the leak check is
   a grep for the location literal outside its adapter — today three literals across two modules.

   **Rows are addressed by deliverable, and reaping follows the plan.** `retirement.ts` removes the plan and state
   records under `closeout.ts`'s orchestration, and composition deletes the authoring pair; `gate-results` is
   reaped there too, beside the records it is keyed with, which is what keeps it from reproducing the
   unowned-lifecycle objection this decision raised against the scratch artifact.

   That leaves the amendment interaction, and the row's address settles it. `classifyDeliveryPlanAmendment` refuses
   only the `landed-*` cases, so an amendment may drop or reorder **unlanded** members while the plan keeps its
   `planId` — and a positionally-addressed record would then survive into a validation that reads it as missing or
   reordered. So rows are stored addressed by `deliverableId` rather than by position, and the default materializes
   them in the current snapshot's member order. A reorder is then not observable: each row is found by the
   deliverable it belongs to. A dropped member leaves an unreferenced row, which the reap removes. A member with no
   row shortens the list and refuses `missing-gate-result`, which is the correct outcome — that member has not been
   gated at its current coordinates. Existing validation is unchanged by this, which is the point: the refusal it
   already emits stays right, and no new bare refusal is minted. That matters because `missing-gate-result` and
   `reordered-gate-result` are two of the bare `{ status, reason }` refusals D3 exists to retire, and a record that
   made them fire spuriously would put this work unit on both sides of its own charter.

   **The writer is a per-gate recording verb.** Nothing produces a gate result today: `gateResults` appears in
   source only as a request operand. The verb runs inside the gate worktree once Tier 2 passes and observes the
   member's head and tree itself rather than accepting typed coordinates, which is what retires the substrate
   violation above. The rejected alternative — pre-writing pending rows at prepare and flipping them on
   completion — adds states and partial-failure modes without buying anything.

   **Run attributes, and why they are one field group rather than two mechanisms.** Beyond the four covered-input
   fields, a recorded row carries what the run itself can attest: the identity of the gate definition that
   produced it, and D5's environment provenance (§ Decisions, 1). Both are properties only the recorder can
   observe, both are checked at the same validation seam, and both refuse on the same kind of drift — so they are
   one addition to the row, not two.

   **Gate identity closes success criterion 1's second clause, which nothing in the design closed before.**
   `DeliveryCandidateGateResult` binds deliverable ID, head, tree, and status; nothing binds _which gate_ ran. The
   Tier 2 command set is not in a member's coordinates — it is defined in a tracked repository file that rides the
   protected base — so a base change that edits the gate commands touches no member path, yields an empty overlap
   intersection, and is invisible to the relation guard. Today the blanket `source-moved` entry in the final ref
   loop forces a full re-prepare and re-gate on _any_ base movement, so it stands in for this check by accident;
   D2 removes it and D6 makes results outlive the session. Criterion 1 is pre-commitment text whose two clauses are
   a pair, so the second needs a mechanism of its own: the row records a digest of the **resolved command set** the
   gate executed, and validation refuses on drift with one added reason.

   **Digest the commands, not the file that holds them.** Scoping this to the file would re-fire the gate on any
   edit to surrounding prose — needlessly repeating a ceremony whose covered inputs did not change, which is the
   first clause of the same criterion and this work unit's whole purpose. The covered input is the command set that
   ran; the digest covers exactly that.

   **How a row acquires run attributes, and what the explicit operand does.** The recorder produces them; the
   explicit operand does not. `CandidateGateResultSchema` is a `strictObject` of deliverable ID, coordinates, and
   status, and both `CloseSchema` and `PublishSchema` require it — a hand-composed list therefore cannot carry a
   digest or a provenance value, and asking it to would change the operand shape this decision promises to leave
   alone. So a caller-supplied row is **unattributed**: it is accepted exactly as today, and neither the
   gate-identity refusal nor D5's refusal can fire on it. Both checks bind only to rows the recorder wrote. That is
   a deliberate asymmetry rather than a hole — the recorder is the only party that can observe either property, and
   an unattributed row is no weaker than the hand-supplied list that is the sole path today. State it in the spec
   so it is not read as an oversight, and carry it into criterion 12's `not-attributable` arm.

   **What the environment observation actually is.** "A by-product of running in the gate" is a location, not a
   mechanism: running inside the gate does not by itself establish where a dependency resolved from. The recorder
   resolves the realpath of the dependency root it actually used and tests whether it falls under a registered
   worktree of this repository other than the gate's own — `scanRegisteredWorktrees` already supplies that roster,
   and `review-fix-candidate-gate.ts` already imports it. Where an ecosystem exposes no resolvable root, the value
   is `not-observable` and the row passes. Nothing in source attributes a resolution today, so this is new work
   that D5 owns rather than a read of existing behavior.

   **Forward compatibility.** The record stays among the code-owned records the repository keeps outside its
   markdown surfaces, and never joins the managed operational-state document set — the meta, session-notes,
   working-memory, inbox, and status family — which projects markdown rather than holding delivery evidence. The
   constraint written here earlier read "never as a new record class"; what it guards is a **generic evidence
   store**, an arbitrary evidence-kind framework with its own vocabulary, not a fourth sibling in a family that
   already enumerates three. Read that way, the storage direction endorses this shape rather than tolerating it:
   its second principle warns specifically against a record that can only exist as a tracked-tree file, which is
   the defect the eliminated Candidate-record home carries. The third principle asks that a write never silently
   clobber a canonical that moved; the chosen writer satisfies that by reading and writing inside one namespace
   lock, so no stale read exists to carry a version for — a different means than the revisioned publisher's
   expected-revision comparison, and the reason this design declines that publisher rather than a gap in it. A
   git-common record satisfies the tenth's service-optional rule, and a namespace inside the existing tier is
   neither a knob nor an axis, so the eighth and ninth are untouched. The authority for what covers what stays with
   the Candidate machinery and `assess-evidence-applicability`.

   **Both consumers default, and the default is wired per handler arm.** `publish` requires the same list the
   close does — `PublishSchema` extends with `gateResults: min(1)` — and the workflow has the session supply it
   twice, so a record that defaults only the close leaves the hand-off unfixed in the second window and commits the
   substrate violation once more. Wire the default in the `eligibility-close` and `publish` handler arms rather
   than inside `executeWithFreshDeliveryEligibility`, because that shared function already reads an absent
   `gateResults` as _skip gate validation_, and the reconcile path depends on exactly that when it passes a
   `memberOffset`. Changing the shared meaning would silently start validating a path that deliberately does not.

   Carried into the spec: both verbs accept an explicit operand exactly as they do today, so the record is a
   default rather than a replacement, and verification must cover the record-read path, the explicit-operand path,
   a stale record refused on drift, and the reconcile path's absent-operand semantics left intact.

## Success criteria

Pre-commitment text, carried verbatim from the evidence-applicability capture. These are the target the outcome is
judged against.

1. Disjoint protected-base movement reobserves eligibility without repeating member gates whose covered inputs
   remain unchanged; changed gate definitions or other actual covered inputs prevent unsupported reuse.
2. Exact member and suffix transitions receive carry, bounded supplemental, or fresh treatment from verified
   before/after coordinates; ancestry or contribution similarity alone never establishes whole-gate applicability.
3. An authorized prepublication base reconciliation or rebuilt-chain result reaches Candidate applicability through
   verified endpoints and does not become unexplained merely because it happened before publication.
4. Bounded residuals use the existing operator-bound selection, and supplemental evidence binds to the current
   obligation; unavailable, unbounded, stale, or unrecognized transitions remain conservative.
5. Preparation, eligibility close, private-review composition, publication/materialization, and private-review
   correction consume one coherent applicability result without turning it into review clearance, gate success, or
   publication authority.
6. Movement, interruption, and replay preserve completed valid work, reject stale selections, and reobserve all
   mutation authority. In particular, an already-bound-target retry with protected-tip movement after eligibility
   close has a tested safe disposition or an explicit, evidence-backed non-authoritative residual; no recheck is
   claimed to eliminate every external race. Terminal integration retains its own current checkpoint evidence and
   exact-head approval.
7. An end-to-end three-member case encounters disjoint movement and then overlapping reconciliation, repeating only
   the evidence justified by each delta and never forcing an unexplained full reset solely at a lifecycle seam.

**Forward amendment (2026-09-21).** Criteria 1-7 were carried verbatim from the evidence-applicability capture,
whose scope § Boundary and Class records this work unit as deliberately widening — so three deliverables had no
criterion of their own. These are added rather than edited; the original targets stand unchanged.

8. The covered-input rule is stated once in a surface non-delivery ceremonies reach, and its firing condition
   demonstrably reaches those consumers — verified by reading the trigger, not by asserting the placement (D1).
9. A `completeness-*` refusal names which side moved and what would clear it, and any refusal that names a remedy
   can have that remedy actually clear it (D3).
10. A clean unbound stack reaches gate-ready coordinates through one typed operation with no per-member
    hand-authored Git steps; replay converges; and a real conflict stops with its exact member, leaving the previous
    chain usable (D4).
11. A gate result recorded in one session is consumed by a close **and by a publish** in a later session without
    the operator re-supplying it; a result whose member coordinates have drifted is refused rather than reused; and
    the reconcile path's absent-operand meaning is unchanged (D6).
12. A gate result produced in a worktree that resolved dependencies from another registered worktree of this
    repository is refused at close, while one whose resolution was in-gate or not attributable is accepted (D5).
13. A recorded gate result whose gate definition changed is refused at close, while a base change that leaves the
    resolved command set identical reuses it — the two clauses of criterion 1 demonstrated against one mechanism;
    and a caller-supplied result, which carries no run attributes, is accepted exactly as it is today (D6).

For D5, the verification surface widens past criterion 12's refusal: clean creation, re-entry, and different
dependency versions across worktrees.

## Scope boundary

This work unit owns prepublication delivery authoring and recovery ergonomics, private candidate reconstruction
after an approved delivery-member fix, initial private delivery gates, preservation and reassessment of evidence
while private delivery preparation changes its observation window or exact targets, and stating the covered-input
rule and choosing its surface.

It does **not**: implement provider restacking; mutate public Delivery State; choose review policy or finding
dispositions; widen the repository-wide integration lane; weaken review or gate obligations; rewrite public
history; redesign Tier 2 membership or cost, proposal-side review scope, or host/checkpoint authorization; own
general recovery orchestration; audit every ceremony against the covered-input rule; or retrofit the boundaries the
characterization found repeating.

Adjacent owners: `review-checkout-lifecycle` holds ephemeral review and conflict checkouts. Refusal-remedy accuracy
is execute-bound and routed as an Errand. Concurrent gate-process exhaustion remains with
`test-suite-contention-hardening`. The retired `wu-integration-target` projection and the late plan revision did
not create the plan-derived gate paths and are neither the cause nor the remedy.

## Coordination

**`evidence-applicability`** may consume this work unit's exact base and currentness result at the handoff seam,
but does not own candidate reconstruction and must not require a broad freeze while private gates run.

**`singleton-integration-continuity`** is the non-delivery sibling on the corrective runway. It owns the singleton
integration tail — the seam between the Candidate, the lifecycle position, and the integration checkpoint — and
explicitly disclaims delivery mechanics. Two seams to hold:

- **No implementation overlap.** Both work units write the integration checkpoint from opposite sides. Sequence one
  to land before the other starts implementing; either order works. The sibling records this; this work unit
  records it too so neither side has to infer it.
- **Shared remedy-composition surface.** This work unit's D3 and the sibling's host-admission remedy
  discrimination are the same family — a refusal whose reason carries no direction, or names a remedy that cannot
  clear it. The sibling claims spine ownership for the lifecycle-tail half of that family. D3 stays the delivery
  lane's instance and cites the spine rather than restating the obligation.

**`review-checkout-lifecycle`** holds ephemeral review and conflict checkouts, and the execution-environment
contract D5 instantiates was originally captured against it. The direction is deliberately reversed: that work unit
is paused mid-planning in a stale checkout, so this one authors the first concrete instance rather than consuming a
design that may still move, and the general contract inherits it on resume. Revising the delivery instance to match
a generalized contract is in bounds for that work unit; the seam is recorded as a capture against it, never in its
artifacts.

**`delivery-post-landing-conflict-recovery`** was the third contract the steering map held out of this
consolidation, as public-side and post-landing. It **shipped 2026-09-19**, discharging that exclusion: it is the
recovery route that makes a stacked landing safe to attempt, which is what lets this work unit record a stacked
delivery as its intended shape rather than a risk.

**`candidate-reroot-recovery-frame`** may preserve resumability but owns no applicability decision.

Keep **Make no-material Frontline follow-up effective across Candidate rerouting** independent unless source
inspection proves its blocker is the same evidence-target binding rather than merely adjacent vocabulary.

**`delivery-correction-convergence`** stays its own planned stub. Its failure fires even though the base did not
move — its own record writes reopen applicability — so it is a convergence problem rather than a movement one, and
it was split from stacked-delivery dogfooding deliberately. Do not extend the consolidation to it.

## Evidence base

### Field incidents

- **2026-09-09** · `plan-segmentation`, the first stacked delivery after `delivery-native-stack-composition`

  Initial unpublished stack authoring had no typed constructor. Recovery required manually constructing normalized
  trees, excluding lifecycle and Candidate records, creating commits, lease-updating ARC-private refs, and
  repositioning detached gate worktrees before eligibility could be prepared again.

- **2026-09-09** · `plan-segmentation`

  The correction controller authorized a fix on the top authoring locus and told the session to cut the complete
  affected suffix, but exposed no typed operation that could construct it. On re-entry it dispatched
  rematerialization against the unchanged private candidate refs, which deterministically refused
  `completeness-mismatched`.

- **2026-09-12** · `test-suite-right-sizing` delivery preparation

  `worktree.post_create` provisions ARC-spawned WU worktrees, but initial delivery authoring exposes plan-derived
  gate locators without constructing or provisioning those detached checkouts. Gates lacked `node_modules` during
  Tier 2, and a gate under the primary checkout's `.git` directory can silently resolve the primary checkout's
  dependencies rather than its owning WU's, making a test failure misleading.

- **2026-09-12** · `evidence-applicability` private delivery verification and review dogfooding

  Three connected evidence losses. One narrowly verified Candidate fix changed a private suffix and made every
  descendant member owe complete Tier 2 again. Eligibility preparation and close are separate observation windows,
  so a fresh preparation can retain the same exact member heads and trees while workflow continuity discards the
  completed gate results. And an authorized base reconciliation during prepublication had no Candidate-applicability
  route at that lifecycle stage, so `arc attest` called the delta unexplained and demanded a full new root.

- **2026-09-13** · `evidence-applicability`

  A chain rebuilt directly on current `main` prepared, then refused `completeness-mismatched` at close: two newer
  disjoint base PRs were present in the final member and absent from the top. Recutting on the top's existing base
  yielded `disjoint-ahead` with no overlapping paths and closed `eligible` without moving the top branch.

- **2026-09-13** · `evidence-applicability`

  Rebuilding three members (13 commits) took about 38 minutes end to end. The clean 13-commit rebase itself took
  under a second; the time went to semantic conflict resolution after an upstream test-file extraction, to finding
  post-cut changes that belonged in specific members, and to two complete sets of three Tier 2 gates spent on the
  wrong-anchor preflight gap.

The 2026-09-13 anchor incident is the load-bearing one: anchor selection must preserve that successful path rather
than force a base merge.

### Characterization ledger rows

Four rows in `notes-concurrent-integration-characterization.md` name this work unit as owner. Read them before
designing against this surface.

- **Eligibility window, disjoint base movement.** The close refuses `source-moved` carrying
  `nextAction: reprepare-delivery-eligibility`, after the entire window has been proved intact. A third case
  establishes the gates are not what is refused: a mechanical close taking no gate results returns a result
  byte-identical to the publication close that validated two passing ones. Classified `redundant ceremony`.
- **Materialization window, disjoint base movement.** Classified `tolerates` and **deliberately unpinned** so
  neither resolution of open decision 2 is prejudged.
- **Delivery authoring, disjoint base movement.** Preparation returns `prepared`, then close refuses
  `completeness-mismatched` — on a fact preparation already held. The reason also follows what the base change
  touched rather than what the operator did: the same recut after a base advance that adds a path returns
  `completeness-invented`, because production takes dropped, then invented, then mismatched in that order.
- **Rematerialization, base movement under a bound plan.** Its typed result is identical to the authoring cell's,
  proven by a third case comparing them equal. One reason code covers two opposite conditions, carries no
  direction, and names neither remedy.

Two further observations bear on the design. The delivery shape narrows a refusal and never a tolerance, so it is
visible only where the singleton path would have stopped — the residual scope is invisible on tolerant results,
which is why the checkpoint's advisory can read "Merge the base before continuing edits on those paths" on the very
result that just admitted a reviewable path. Making the residual scope legible in the payload is the design
response; which component composes the message is the open half, and the message itself is the Errand's.

### Pinned probes

Three probes hold this boundary's behavior as it stands. They **pass today** and the suite is green; each fails the
moment the behavior changes, printing the sentence that names what the probe was waiting for and its exact
replacement. Retiring them is in scope rather than a regression — a fix here cannot merge while one is red, and
each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary, which
constrains how the stack is cut: a deliverable that changes one boundary retires that boundary's probe in the same
landing.

1. `delivery-window-base-movement.test.ts` — "discards them when the base advances on a path no member touches"
   (D2).
2. `delivery-rebuild-base-movement.test.ts` — "admits a chain recut on the moved base, then refuses it after the
   gates would have run" (D4).
3. `delivery-rebuild-base-movement.test.ts` — "refuses the unchanged private candidates once the correction lands
   on the top" (D4). Its awaited shape is a _close_ result carrying a new `rebuild-required` reason, not the
   prepare-side refusal probe 2 awaits — so D4 spans both boundaries: the anchor preflight that refuses before gate
   work, and the close-side reason code naming the rebuild owed. A D3 that only enriches the `completeness-*`
   payload leaves this probe green and unretired.

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not arrived
either" has found behavior neither shape names. That is a finding, not a retirement.

## What the characterization did not cover

Its enumerated first matrix spans **base movement only** — boundary by movement kind — and its boundary list did
not include delivery authoring or rematerialization at all. So the authoring half of this surface was never probed
by it, and head movement, merge-base cardinality, and ceremony-concurrent writes were outside the axis entirely. A
second matrix covering those axes was added after this work unit's stub was written; read its ledger rows rather
than treating the first matrix's `tolerates` verdicts as coverage of this surface.

---
