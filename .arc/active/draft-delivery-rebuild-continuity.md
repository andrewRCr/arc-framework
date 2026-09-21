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

**State:** `maturing` — scope is known and five of six decisions hold, but the gate-result hand-off reopened at the
readiness boundary and its record and writer are unshaped.

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
  provisioning, verified at the real gate path, and its enforcement rides the gate-result record's provenance rather
  than a creation-time refusal (§ Decisions, 1).
- The publication window: later review gates are the authority boundary, with no bounded in-call recheck
  (§ Decisions, 2).
- Evidence carry's minimal contract, proven in source rather than assumed — a prior gate result already binds
  deliverable ID, head, tree, and status, and a fresh snapshot accepts it unchanged (§ What the source shows, 5).
- The constructor's substrate-versus-projection split, so the tracked-tier normalization retires as a filter
  removal rather than a rewrite (§ The constructor).
- What the gate-result hand-off may **not** live on: three record homes are eliminated on verified source grounds,
  leaving one surviving candidate to shape (§ Decisions, 5).

**Open**

- Which record carries the gate-result hand-off, and which verb writes it. Three homes are eliminated and
  `delivery/authoring` is the surviving candidate, but no writer exists on any surface today (§ Decisions, 5).

**Next**

One decision reopened. An adversarial pass on 2026-09-21 found decision 5 settled only on its read side: the record
family it named cannot hold gate results, on three independent source grounds. Shape the surviving candidate and its
writer, then re-assess. Everything else held — D1 through D4 and D6 each carry a stated direction with their
residuals named, and the first delivery member (D1+D2) stays fully bounded.

---

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
function — `ambiguous-predecessor-base`, `unrelated-predecessor`, the three `wrong-predecessor` arms,
`head-already-bound`, and `source-moved` — carry `deliverableId`, `relation`, `detail`, and often `remedy`. About half
return bare, so the asymmetry that matters is between refusals that could name a direction and one that holds the
operands to do it and does not. `snapshot.top`, `finalCandidate`, and
both base trees are all in scope at that line. This is why the authoring and rematerialization cells produce
byte-identical typed results for opposite conditions with opposite remedies.

**4. Inside the mechanical close, the final ref loop is the only live read of the protected base — which makes
narrowing it a four-part change, not a deletion.** Traced every consumer of `snapshot.protectedBase` in
`closeMechanicalDeliveryEligibility`; all of them read the **recorded** value, none reads the live ref:

- `compareNormalizedCompleteness` receives `snapshot.protectedBase` and uses only its `tree`, forwarded as
  `protectedBaseTree` to the normalized-tree comparison.
- `suffix-rematerialization.ts` compares `{ ref: snapshot.protectedBase.ref, ...snapshot.chainBase }` against the
  bound Delivery State target's recorded coordinates — value against value, and it borrows only the _ref name_
  from `protectedBase` while the coordinates come from `chainBase`.
- The `currentChainBase` resolution uses `snapshot.protectedBase` as a value shortcut when the chain-base head
  equals it.

So nothing inside the mechanical close depends on the live base being unchanged, which is the answer the narrowing
needs.

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

The fix is therefore four coordinated parts: re-observe the relation against a **live** protected-base read; keep
the `diverged`-with-substantive-overlap guard on that fresh relation, where it becomes a real safety check instead
of a replay; re-scope `samePredecessorRelation` to compare `chainBase` and drop `observedTip` and kind equality;
and only then narrow the final ref loop to `[top, ...members]`. The snapshot's `predecessorRelation` field becomes
provenance rather than a close-time equality target.

Residual to carry into the spec: dropping `observedTip` and kind equality weakens the snapshot-integrity check that
comparison currently performs, and what survives of the re-scoped comparison is thinner than "four parts" suggests.
The close already refuses independently when `snapshot.chainBase.head` disagrees with the freshly reobserved
relation's chain base, and prepare already binds those two together, so a `chainBase`-only comparison adds one
intra-snapshot consistency check rather than a second binding. The fresh overlap guard plus that independent
chain-base refusal are the real replacement; verification must show they cover the fabricated-snapshot case the old
comparison caught, and the spec must not re-derive a duplicate comparison from the four-part list.

**5. The gate-result carry contract already exists and is enforced; what is missing is a caller-side home.**
`DeliveryCandidateGateResult` binds `deliverableId`, `head`, `tree`, and `status` — exactly the minimal contract the
evidence-carry decision proposed to prove before considering persistence. `validateDeliveryCandidateGateResults` runs
those results against a **freshly prepared** snapshot and refuses only on duplicate, missing, reordered,
`gate-result-stale` (head or tree differ), or `gate-result-failed`. So a fresh preparation that reproduces the same
member head and tree already accepts a prior gate result: the covered-input rule is implemented at this seam.

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

Each row is independently landable on `main`. Order is the delivery plan's dependency ordering, not a task
sequence.

| ID | Deliverable                                                     | Depends on    | Retires     |
| -- | --------------------------------------------------------------- | ------------- | ----------- |
| D1 | The covered-input rule, stated in a shared surface              | —             | —           |
| D2 | Eligibility close stops refusing on non-covered source movement | —             | probe 1     |
| D3 | `completeness-*` refusals carry direction and remedy            | —             | —           |
| D4 | Chain constructor, anchor preflight, `rebuild-required`         | —             | probes 2, 3 |
| D5 | Gate execution-environment contract                             | D4, D6        | —           |
| D6 | Evidence carry across changed members and suffixes              | D4            | —           |

D2 is a four-part change rather than a check removal — see § What the source shows, 4. Its verification must
cover disjoint movement closing `eligible`, overlapping movement still refusing on the fresh relation, and the
fabricated-snapshot case the re-scoped comparison no longer catches by `observedTip`. The fixture must also stop
stubbing `resolveLifecyclePaths` to a single constant, or neither live protected-base read in the enclosing close is
observable to any probe.

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable.

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

   **Where the contract is enforced.** Not at gate creation — that boundary has no neutral predicate, because a
   silently inherited environment is not observable ahead of time and the only available test is the rejected one.
   The gate-result record D6 must build carries the provenance instead: where the result was produced and whether
   provisioning ran. D1's covered-input rule then refuses reuse on the same ground as any other changed covered
   input rather than on a bespoke axis. That puts the refusal at evidence consumption rather than at worktree
   creation — the same boundary decision 2 settles for the publication window — and keeps the wiring to one existing
   helper whose unconfigured case is already a notice rather than a refusal. The cost is that an unusable result is
   learned at close rather than prevented at creation: legibility over prevention, deliberately, as in decision 2.

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
   protected base being unchanged, but the narrowing is a four-part coordinated change rather than a check removal,
   and it re-scopes `samePredecessorRelation`. Two residuals carry into the spec: the weakened snapshot-integrity
   check, and the enclosing close's two live protected-base reads, which D2 leaves exactly as they stand. The
   unpinned operand in `deriveDeliveryMemberLifecycleRevalidation` routes to D6, and the probe fixture's stubbed
   `resolveLifecyclePaths` widens regardless of which deliverable pins it.

5. **Open: the gate-result hand-off needs a record and a writer.** The read side is settled — the close consumes a
   durable result when its operand is omitted — and so are the eliminations below. What is unshaped is which record
   carries it and which verb writes it. The minimal contract the capture asked to prove first — a prior gate result
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
   operator re-supplies and a field on the record family that already exists. The record family wins: a scratch
   artifact keeps the evidence agent-typed, readable by nothing else, and carries its own lifecycle with no owner —
   the failure shape already recorded against ceremony-created residue.

   Two further reads point the same way, independently of continuity. Hand-composed results mean the session types
   the coordinates it claims were tested; the close still compares them against a freshly observed member and
   refuses `gate-result-stale` on any drift, so this is not a trust hole today, but recording them at the source
   removes the transcription step rather than validating around it. And the current shape is a procedural-substrate
   violation as it stands: the coordinates are machine-emitted by a prior verb, and the workflow has the session
   re-type them into the next request body — prose moving data the CLI already holds, which is exactly what the
   substrate rule's first principle forbids. The record-family field is therefore the compliant shape, not only the
   durable one.

   **What the durable arm must not be read as weakening.** A stored gate result is not a persisted authorization
   token. The close still re-prepares fresh, and the validator still compares head and tree against the freshly
   observed member before accepting. The record is an input to that check, never a bypass of it, and the only trust
   it carries — `status: "passed"` — is exactly the trust the hand-supplied list carries today.

   The substrate to extend is the existing path-treatment, typed-delta, reducer, evidence-reference, and
   operator-bound Candidate applicability machinery, across one cohesive boundary; an authoritative prepublication
   reconcile or rebuild cause must reach the existing `covered | targeted-check | changed` authority seam through
   Candidate currentness rather than degrading to unexplained solely because of its lifecycle stage. Add no generic
   evidence store, ancestry-only carry, or arbitrary evidence-kind framework in either arm.

   **Three homes are eliminated on source grounds.** `delivery/state` does not exist during the window: the close
   handler never touches the state store, and `publish` is where `stateStore.read` returns null and initial binding
   creates the record — so on an initial publication, the exact case this work unit exists to fix, there is no state
   record at close to read. `delivery/plans` is digest-sealed: `planDigest` derives over every field but itself and
   the close refuses `plan-moved` on any drift, so a per-run mutable field cannot ride it. And the tracked Candidate
   record is wrong twice over — it is a working-tree path, and it is an unconditional non-regenerable
   lifecycle-contribution path compared against the protected base, so every gate-result write would trip
   `lifecycle-contribution` at the next close, on the very tracked tier § The constructor says is retiring.

   **What survives.** `delivery/authoring` is git-common, exists during authoring, and already carries its own
   `version-conflict` lifecycle — the one namespace whose window matches the hand-off's. Shape it there, or record
   why not. No writer exists on any surface: `gateResults` appears in source only as a request operand, and the
   workflow has the session compose the list by hand, so the producing verb must be designed rather than found.

   **Forward compatibility.** Whatever record carries it stays among the code-owned records the repository keeps
   outside its markdown surfaces — never a new record class, and never a member of the managed operational-state
   document set, which is the meta, session-notes, working-memory, inbox, and status family rather than delivery
   evidence. The storage direction binds it: storage-agnostic, version-checked on write, never a record that exists
   only in a service. The authority for what covers what stays with the Candidate machinery and
   `assess-evidence-applicability`. D5's provenance rides this same record (§ Decisions, 1), so D5 cannot be shaped
   until this is.

   Carried into the spec: the close accepts an explicit operand exactly as it does today, so the record is a
   default rather than a replacement, and verification must cover the record-read path, the explicit-operand path,
   and a stale record refused on drift.

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

For D5, the verification surface is clean creation, re-entry, and different dependency versions across worktrees.

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
