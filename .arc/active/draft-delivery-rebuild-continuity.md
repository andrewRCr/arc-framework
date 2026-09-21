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

**State:** `maturing` — scope is known and the constructor's shape is settled; the open items are detail design.

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
  already there (§ Open decisions, 3).
- D2's shape, and what it may not do alone: narrowing the close's final ref loop is safe only together with a live
  re-read and a re-scoped relation comparison (§ What the source shows, 4).

**Open**

- D5's configurability axis — whether the gate execution-environment contract is project-configurable at all
  (§ Open decisions, 1).
- The publication-window recheck: bounded in-call recheck versus later review gates as the authority boundary
  (§ Open decisions, 2).
- Whether evidence carry needs persistence at all, held behind the capture's own adequacy gate
  (§ Open decisions, 5).

**Next**

The first delivery member (D1+D2) is fully bounded. Settle decisions 1, 2, and 5 — all settle-able in planning,
all bounding later members — then re-run `assess-draft-readiness`.

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
`dbd74aca4`. Three findings that the captures did not have, and that move the design.

**1. Two of the three primitives the authoring capture asks for already exist.**
`createDeliveryReviewFixCandidatePair` in `review-fix-candidate-gate.ts` performs the ARC-private `update-ref` and
the detached `git worktree add` for the gate. It takes `{head, tree}` as input and is reachable only from the bound
`authoring-rematerialize` path. Nothing under the delivery library constructs a tree or commit — the plumbing lives
elsewhere in the codebase and the delivery lane has never built a Git object. So the missing piece is narrower than
"own commit and tree construction, refs, and gate placement": it is **coordinate production**, plus a route from
the unbound initial-authoring path to primitives that already exist.

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
`completeness-*` refusal returns `{ status, reason }` and nothing else, while every sibling refusal in the same
function carries `deliverableId`, `relation`, `detail`, and often `remedy`. `snapshot.top`, `finalCandidate`, and
both base trees are all in scope at that line. This is why the authoring and rematerialization cells produce
byte-identical typed results for opposite conditions with opposite remedies.

**4. The final ref loop is the only live read of the protected base — which makes narrowing it a three-part
change, not a deletion.** Traced every consumer of `snapshot.protectedBase`; all of them read the **recorded**
value, none reads the live ref:

- `compareNormalizedCompleteness` receives `snapshot.protectedBase` and uses only its `tree`, forwarded as
  `protectedBaseTree` to the normalized-tree comparison.
- `suffix-rematerialization.ts` compares `{ ref: snapshot.protectedBase.ref, ...snapshot.chainBase }` against the
  bound Delivery State target's recorded coordinates — value against value, and it borrows only the _ref name_
  from `protectedBase` while the coordinates come from `chainBase`.
- The `currentChainBase` resolution uses `snapshot.protectedBase` as a value shortcut when the chain-base head
  equals it.

So nothing depends on the live base being unchanged, which is the answer the narrowing needs. But two facts make
the naive narrowing wrong:

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

Residual to carry into the spec: dropping `observedTip` and kind equality weakens the snapshot-integrity check
that comparison currently performs. The fresh overlap guard plus the retained `chainBase` binding are the
replacement; verification must show they cover the fabricated-snapshot case the old comparison caught.

## The constructor

**One constructor, parameterized by the predecessor relation.** The two directions are opposites — at initial
authoring the members are ahead of the top and the remedy is to recut on the top's base; at bound correction the
top is ahead of the members and the remedy is to rebuild the suffix from the corrected top — but they already share
pair creation, and the direction is decided by the predecessor relation the preflight must read anyway. Two
direction-specific builders would duplicate the preflight and re-create the same collapse from the other side.

It owns coordinate production and composes the existing locator, materialization, lifecycle-normalization,
private-gate, lease, and eligibility primitives. It introduces no parallel plan or state record.

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
| D4 | The chain constructor and its anchor preflight                  | —             | probes 2, 3 |
| D5 | Gate execution-environment contract                             | loosely on D4 | —           |
| D6 | Evidence carry across changed members and suffixes              | D4            | —           |

D2 is a four-part change rather than a check removal — see § What the source shows, 4. Its verification must
cover disjoint movement closing `eligible`, overlapping movement still refusing on the fresh relation, and the
fabricated-snapshot case the re-scoped comparison no longer catches by `observedTip`.

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable.

**Single-branch fallback, recorded up front.** If the stacked landing cannot proceed, this work unit lands as a
plain single-branch merge. The failure mode being guarded is depending on the broken mechanism to ship its own
fix. Post-landing recovery has shipped, so the risk gate's first condition is met by evidence rather than by
contingency — re-verify the route at the specific landing.

## Open decisions

1. **Is D5 configurable at all?** The capture asks for a "project-configurable execution-environment contract"
   — provision the gate's own dependencies, or intentionally bind them to the owning source checkout, with a clear
   refusal if neither is established. The proportionality read flags the configurability axis as
   `speculative-capability`: the minimal credible alternative is to bind gates to the owning source checkout and
   refuse when that is unestablished, with no configuration axis until a second mode is actually required. The
   requirement that survives either way is the refusal — arbitrary ignored `node_modules` presence, and the primary
   checkout's dependencies, must never count as proof of readiness. Decide the axis before elaborating it.

2. **The publication-window recheck.** Once `state.target` is bound, `materializeBoundDeliveryChain` skips its
   observed-tip check. Each retry freshly closes eligibility before mutation, but the protected ref can move
   between that close and later private-ref or draft-PR effects, which can leave stale publication artifacts
   without granting merge authority. Determine whether a bounded in-call recheck materially improves the retry, or
   whether later review gates are the appropriate authority boundary. **Do not treat either outcome as implicit.**
   The characterization recorded this cell deliberately unpinned so neither resolution is prejudged; its evidence
   is that the tip guard lives inside the branch that binds the target, so it stops applying at exactly the moment
   the chain becomes publishable. D7 requires a tip proof before the initial chain-base record and that proof is
   taken by the first pass; its separately accepted observation-to-merge race concerns terminal merging, not this
   window.

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

4. **Settled** — see § What the source shows, 4. No consumer depends on the live protected base being unchanged,
   but the narrowing is a four-part coordinated change rather than a check removal, and it re-scopes
   `samePredecessorRelation`. One residual carries into the spec: the weakened snapshot-integrity check.

5. **Does evidence carry need persistence?** The substrate to extend is the existing path-treatment, typed-delta,
   reducer, evidence-reference, and operator-bound Candidate applicability machinery, across one cohesive boundary;
   an authoritative prepublication reconcile or rebuild cause must reach the existing
   `covered | targeted-check | changed` authority seam through Candidate currentness rather than degrading to
   unexplained solely because of its lifecycle stage. Held behind the capture's own adequacy gate: first prove the
   existing
   minimal contract — a prior gate result already binds deliverable ID, head, tree, and status, and may be accepted
   by a fresh snapshot when those covered inputs are unchanged — before adding persistence. Add no generic evidence
   store, ancestry-only carry, or arbitrary evidence-kind framework. Introduce persistence only if planning proves
   existing records and typed continuation cannot retain the required exact evidence.

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
   on the top" (D4).

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not arrived
either" has found behavior neither shape names. That is a finding, not a retirement.

## What the characterization did not cover

Its enumerated first matrix spans **base movement only** — boundary by movement kind — and its boundary list did
not include delivery authoring or rematerialization at all. So the authoring half of this surface was never probed
by it, and head movement, merge-base cardinality, and ceremony-concurrent writes were outside the axis entirely. A
second matrix covering those axes was added after this work unit's stub was written; read its ledger rows rather
than treating the first matrix's `tolerates` verdicts as coverage of this surface.

---
