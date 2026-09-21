# Spec (`detailed` · `RFC`): delivery-rebuild-continuity

- **Origin:** [internal]

- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified Candidate
  evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a ceremony the
  covered inputs did not change.

> [!IMPORTANT]
> **Partially re-entered to `draft-design` (2026-09-21, second).** D1 and D2 are settled: the finalization pass
> certified them against source, and they keep their place as the stack's first delivery member. **D3, D4, D6, and
> D7 are re-opened for derivation and must not be read as settled** — the pass confirmed that the private candidate
> ref and its detached gate worktree are one pair three sites refuse a half of, that the bound correction route's
> rematerialization verb runs opposite to the direction D4 asks of it, that the rebuilt member's commit shape and
> the source of first-cut member boundaries were never settled, that the refusal-direction mechanism cannot produce
> direction, and that publication's attestation read is stated as catching a state the close already refuses. The
> same applies to their success criteria, their § Alternatives & Rationale entries, their § Workflow surface
> bullets, and the § Open Questions obligations that name them.
> `draft-delivery-rebuild-continuity.md` § Re-entry: what the finalization pass confirmed carries the verified
> finding set, the fork it opens, the four in-spec corrections D1 and D2 still owe, and what remains open.

---

## Introduction / Context

A delivery plan lands one work unit as an ordered stack of members. Before publication the stack lives on
ARC-private refs, and eligibility is **prepared** once and **closed** later — two separate observation windows,
today with a full Tier 2 pass across every member running in detached worktrees between them.

Two independent failures are proven from field incidents, and the second consumes the first.

**The chain cannot be rebuilt through a typed operation.** Initial unpublished stack authoring exposes
plan-derived gate locators but constructs nothing: recovery means hand-authoring normalized trees, lifecycle and
Candidate exclusions, commits, leased private-ref updates, and detached gate worktrees. The bound correction route
has the same hole from the other side — the correction controller authorizes a fix on the top authoring locus and
tells the session to cut the affected suffix, but exposes no operation that constructs one, so re-entry dispatches
rematerialization against unchanged private candidates and deterministically refuses `completeness-mismatched`.

**Evidence justified against the old chain does not survive the rebuild.** The eligibility close refuses
`source-moved` on _any_ protected-base movement after the entire window has been proved intact, so disjoint
movement that touches no member path still forces a full re-prepare and re-gate. And a rebuilt chain reaches the
Candidate applicability seam through a door that throws it away: the effective-target projection composes a
complete `covered | targeted-check | changed` decision carrying its offer text, its choices, and its projection
and residual digests, and the delivery reconcile arm collapses every non-current result into one opaque
`candidate-not-current` refusal. Read through the review gate's own doors that projection reaches the operator;
read through delivery's, it dead-ends.

The per-member gate pass between those two windows is a third finding, and it is the one that moved. Gate results
have no home outside the session transcript, so the workflow has the operator hand-compose the result list, pipe it
to the close, then supply the same list again to publish. That durability gap is real; this work unit answers it by
removing the window rather than by persisting its output (§ Alternatives & Rationale).

The failures compose. A rebuild is expensive (a three-member, 13-commit rebuild measured ~38 minutes end to end,
almost none of it the rebase), and every rebuild currently discards evidence that a correct observation would have
carried — including two complete sets of three Tier 2 gates spent on a wrong-anchor preflight gap.

Now is the moment because the recovery route that makes a stacked landing safe to attempt
(`delivery-post-landing-conflict-recovery`) shipped 2026-09-19, so this work unit can record a stacked delivery as
its intended shape rather than as a risk. The field incidents, the characterization ledger rows that name this work
unit as owner, and the pinned-probe detail live in `notes-delivery-rebuild-continuity.md`.

## Goals

1. A clean unbound stack reaches exact publication-ready coordinates through one typed operation, with no
   per-member hand-authored Git steps — and the bound correction route reaches the same constructor from the other
   direction.
2. Disjoint protected-base movement re-observes eligibility and closes eligible rather than refusing, while changed
   covered inputs still prevent unsupported reuse.
3. Publication refuses a chain prepared against a Candidate its attestation no longer covers, by reading evidence
   the work unit has already produced rather than by running verification of its own.
4. A refusal names which side moved and what would clear it, and a remedy a refusal names can actually clear it —
   including a rebuilt chain's applicability, which reaches the operator's decision rather than an opaque refusal.
5. The covered-input rule is stated once, in a surface every post-execution ceremony reaches, rather than
   re-derived per lane.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This work unit owns prepublication delivery authoring and recovery ergonomics, private candidate reconstruction
after an approved delivery-member fix, where per-member checks run relative to publication, preservation and
reassessment of evidence while private delivery preparation changes its observation window or exact targets, and
stating the covered-input rule and choosing its surface.

It does **not**:

- implement provider restacking, or mutate public Delivery State — D7 extracts the **local** reconstruction the
  published-side refresh already performs, and leaves its provider delegation and change-request mutation untouched;
- choose review policy or finding dispositions, widen the repository-wide integration lane, or weaken review or
  gate obligations;
- rewrite public history, or redesign Tier 2 membership or cost, proposal-side review scope, or host/checkpoint
  authorization;
- own general recovery orchestration, audit every ceremony against the covered-input rule, or retrofit the
  boundaries the characterization found repeating;
- add a generic evidence store, an ancestry-only carry, or an arbitrary evidence-kind framework;
- define any project's check policy, or require that every published member be checked in isolation — which checks
  run against a published change request is the project's own configuration (§ D6);
- add a bounded in-call recheck of the protected tip after the target is bound (§ Alternatives & Rationale);
- reap the malformed gate directories already on disk — that is an Errand's, not this work unit's.

**Adjacent owners.** `review-checkout-lifecycle` holds the frontline review path's ephemeral checkout — its
registration and its retained diagnostics — and hands chunk projections to `chunk-scope-binding`. Delivery's own
checkouts are a different family: gate and resolution paths derive from plan identity and the residue reaper owns
them, so neither is that work unit's. Refusal-remedy
accuracy is execute-bound and routed as an Errand. Concurrent gate-process exhaustion stays with
`test-suite-contention-hardening`. `delivery-correction-convergence` stays its own planned stub: its failure fires
even though the base did not move — its own record writes reopen applicability — so it is a convergence problem
rather than a movement one, and the split was deliberate. The retired `wu-integration-target` projection and the
late plan revision did not create the plan-derived gate paths and are neither cause nor remedy.

## Proposed Design

### Boundary outcome and delivery shape

**`stays one WU + delivery-plan candidate`.** The concern stays cohesive — every deliverable below is the same
mechanism (a private chain moving under a plan) observed at a different lifecycle position — and its deliverables
are each independently landable on `main`, which is the delivery-plan test rather than the decomposition test.
Evidence basis: prepublication evidence applicability consumes verified rebuild endpoints and its implementation
must coordinate with authoring; and the source read below establishes that D1, D2, and D3 land without the
constructor. Decided planning judgment — re-raise only on a material new-evidence delta. This spec is authored
slice-aware; it publishes and binds no delivery state.

The boundary was widened past the successor's original scope deliberately. The completed `evidence-applicability`
planning close cut this successor to the overlapping and interrupted-authoring cases — that work unit says _when_ a
rebuild is owed, this one says _how_. The consolidation widened it to disjoint movement and initial authoring as
well, superseding the narrower successor boundary rather than diverging from it.

Rows are in ID order; `Depends on` carries the delivery plan's dependency ordering, which is not a task sequence —
D7 precedes D4 despite the higher number. **The set is D1, D2, D3, D4, D6, D7 — five is unassigned and stays
that way**, so a deliverable ID means the same thing in the task list, the delivery plan, and every commit that
cites one.

| ID | Deliverable                                                      | Depends on | Retires     |
| -- | ---------------------------------------------------------------- | ---------- | ----------- |
| D1 | The covered-input rule, stated in a shared surface               | —          | —           |
| D2 | Eligibility close stops refusing on non-covered source movement  | —          | probe 1     |
| D3 | `completeness-*` refusals carry direction and remedy             | —          | —           |
| D4 | Chain constructor, anchor preflight, `rebuild-required`          | D7         | probes 2, 3 |
| D6 | Evidence carry: publication reads the work-unit attestation      | —          | —           |
| D7 | One chain-reconstruction primitive, construct split from publish | —          | —           |

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable. **D7 lands next** — after that first member and before D4, which depends on
it — so the refactor of published-side machinery never runs as the first member (§ D7).

**No transient window between members.** D2 removes the blanket `source-moved` entry that forces a re-gate on any
base movement, and nothing downstream has to restore a narrower form of that coverage: with no per-member
prepublication gating there is no reusable gate result to guard and no gate definition whose drift could be missed.
The stack therefore carries no accepted inter-member risk, and no member's landing order is constrained by one.

**Single-branch fallback.** If the stacked landing cannot proceed, this work unit lands as a plain single-branch
merge. The failure mode being guarded is depending on the broken mechanism to ship its own fix. Post-landing
recovery has shipped, so the risk gate's first condition is met by evidence rather than by contingency — re-verify
the route at the specific landing.

### D1 — The covered-input rule, stated in a shared surface

**The rule.** A ceremony in the post-execution tail repeats only when an input its earlier result covered has
changed; evidence applicability follows the content an earlier result covers, never head movement by itself.
Changed covered inputs continue to prevent unsupported reuse.

**Destination: `strategy-integration.md` § Review Admission and Head Movement**, generalizing the sentence already
there — the section currently states the evidence-applicability-scoped form of exactly this rule. The work is to
widen it to every ceremony in the post-execution tail, not to author a new home. The **document's** charter is the
post-execution tail almost word for word — publication boundary, landing window, exact-head review admission,
terminal checkpoint and merge, post-landing hand-back — and the named section is one of those siblings rather than
the whole span, so the placement rides the document's reach rather than the section's. Its index entry is already a
directive firing condition naming both trigger and suppressed default, so reachability is satisfied by an existing
trigger and the always-loaded set does not grow; it ships, so ceremonies in adopter projects reach it; and it is not
delivery-scoped — the section already states that delivery and singleton integration share the same authority
boundary.

**The constraint-versus-doctrine split.** A hard invariant may not sit mid-document in an on-demand file. The
**permissive** half — a ceremony need not repeat when its covered inputs are unchanged — is design doctrine,
consumed by whoever designs a ceremony boundary, and belongs in the strategy. The **restrictive** half — changed
covered inputs prevent unsupported reuse — reads as a constraint and is placed **at the fire site**: D2 is that
placement for the eligibility close, D6's attestation read is that placement for publication, and
`DEV-RULES.ARC` § Rule Authority already holds the check-integrity backstop that makes an agent-side reuse
decision invariant.

**Residual to check rather than assume:** the generalization widens the content past what the existing trigger
names. That trigger enumerates four surfaces — publication boundary, delivery landing window, terminal merge
authority, post-landing closeout — and does **not** name review admission, the section the rule lands in, so it is
not the generic post-execution-tail wording a first reading suggests. Confirm against the firing condition itself
whether it reaches the rule's non-delivery consumers; if it does not, a one-clause widening of the trigger rides D1
rather than becoming its own concern.

### D2 — Eligibility close stops refusing on non-covered source movement

`source-moved` is the last check in the mechanical close — a flat loop over `[protectedBase, top, ...members]`
comparing head and tree, reached only after predecessor relation, chain base, lifecycle paths, normalized
completeness, plan revision, and member bindings have all passed. `top` and `members` must not move, because the
snapshot's per-member coordinates are what the close validated the chain against. `protectedBase` moving
invalidates nothing inside that function:
every other read of `snapshot.protectedBase` there takes the **recorded** value (the relation recomputation's
`observedTip`, the normalized-completeness tree, the chain-base value shortcut, and the refusal payload's inert
`protectedBaseRef`).

Two facts make a naive deletion wrong. The close **cannot currently see base movement at all** — the relation is
recomputed from two snapshot values over immutable commits, so it is deterministic and exists for snapshot
integrity, not fresh observation; drop the loop entry and genuinely overlapping movement passes unseen. And
switching `observedTip` to the live tip trades one refusal for another, because `samePredecessorRelation` compares
`observedTip` first, so any movement — disjoint included — refuses `wrong-predecessor`, and the relation _kind_
moves legitimately too (a member cut from the old base reads `advanced` against it and `diverged` against the
advanced one). What survives as the invariant is **`chainBase`**, recorded by value at prepare and therefore still
pinned as `refs/heads/main` moves past it — that pin is what the members were cut from.

**The change is six coordinated parts:**

1. Re-observe the predecessor relation against a **live** protected-base read.
2. Keep the `diverged`-with-substantive-`overlap` guard on that **fresh** relation, where it becomes a real safety
   check instead of a replay of a recorded one.
3. Re-scope that guard's overlap operand from `firstMember` to `finalCandidate` — already resolved beside it at
   that line. Prepare requires each later member to descend from its predecessor, so the final candidate's diff
   against the base is the whole chain's, while members 2..n contribute nothing to the left-hand set today: base
   movement overlapping a **later** member but not the first yields an empty intersection and passes.
4. Re-scope the **prepare-side** guard's operand the same way. Prepare computes its own relation over the first
   candidate and refuses on it, so widening only the close would leave the two windows guarding different sets — a
   base already overlapping a later member when the window opens would be admitted at prepare and refused only at
   the close, after the whole window's work. That is the prepare-admits-then-close-refuses shape pinned probe 2
   holds as a defect, and D2 must not reintroduce it at another boundary.
5. Re-scope `samePredecessorRelation` to compare `chainBase`, dropping `observedTip` and kind equality.
6. Only then narrow the final ref loop to `[top, ...members]`.

After part 5 the snapshot's `predecessorRelation` field carries provenance plus one surviving close-time equality
target — its chain base — rather than the whole relation it pins today.

**The widened guard must not name a member it cannot attribute.** Both refusals report the _first_ member's
`deliverableId` beside `paths` drawn from the overlap, under a shared detail string saying the movement overlaps
"this delivery member". Once the operand spans the chain those paths may belong to a member the refusal does not
name — a refusal misidentifying its own subject, inside the work unit whose Goal 4 is that a refusal names which
side moved. Resolve the overlapping paths to the member that contributed them and name that member; this costs a
per-member path set the close does not build today. Where attribution is genuinely unavailable, the detail must say
the movement overlaps the delivery **chain** rather than claim a member.

**Residual A — the weakened snapshot-integrity check.** Dropping `observedTip` and kind equality weakens what that
comparison performs, and what survives is thinner than "five parts" suggests: the close already refuses
independently when `snapshot.chainBase.head` disagrees with the freshly reobserved relation's chain base, and
prepare already binds those two together, so a `chainBase`-only comparison adds one intra-snapshot consistency
check rather than a second binding. The fresh overlap guard plus that independent chain-base refusal are the real
replacement. **Do not re-derive a duplicate comparison from the five-part list**; verification must instead show
that the replacement covers the fabricated-snapshot case the old comparison caught.

**Residual B — the enclosing verb's live reads stay as they stand.** `closeDeliveryEligibilityForPublication` runs
two live protected-base reads _above_ the mechanical close (lifecycle-path resolution from `refs/heads/<base>`, and
each member's lifecycle-contribution revalidation, where the derivation passes a ref _name_ resolved live at
`ls-tree` time while passing the chain base beside it as a recorded OID). They refuse identically today, so D2
neither narrows them away nor regresses them. The unpinned operand routes to D6.

**Verification obligations.** Disjoint movement closes `eligible`; overlapping movement still refuses on the fresh
relation, including movement that overlaps a later member and not the first; a base that **already** carries a
later-member overlap when the window opens refuses at _prepare_ rather than at the close; the refusal
names the member whose paths actually intersect; and the fabricated-snapshot case is still caught. The fixture must
stop stubbing `resolveLifecyclePaths` to a single constant **and carry a non-regenerable lifecycle path** — its only
lifecycle path today is regenerable, and regenerable paths compare against the chain base rather than the protected
base, so un-stubbing alone still leaves neither live protected-base read observable. D2 also changes a second,
unpinned case in probe 1's own file, which today refuses `source-moved` after a base advance and closes `eligible`
afterwards; it is rewritten alongside the probe rather than retired with it.

### D3 — `completeness-*` refusals carry direction and remedy

The `completeness-*` refusal returns `{ status, reason }` and nothing else, while richer sibling refusals in the
same function carry `deliverableId`, `detail`, and often `relation` and `remedy`. This is why the authoring and
rematerialization cells produce byte-identical typed results for **opposite** conditions with **opposite** remedies.

**Naming a direction is a port-contract change, not a richer return statement.** What is in scope at the refusal
site is four coordinate pairs, and the eligibility dependency interface exposes no tree reader — from OIDs alone the
close cannot say which side moved. The data that names direction already exists one layer down and is discarded:
the normalized-tree comparison computes dropped, invented, and mismatched path sets, and every adapter collapses all
three into a single token before the close ever sees them. D3 therefore widens the normalized-completeness port's
refused contract to carry those partitions, widens its strict refusal union alongside, and updates the three sites
that collapse it — the delivery execution handler, the pre-publication composition adapter, and the shared test
fixture. That is materially larger than enriching a refusal payload, and it is what the direction actually
requires.

The refusal must name which side moved and what would clear it, and any remedy it names must be one that actually
clears it. Production order (dropped, then invented, then mismatched) means the reason today follows what the base
change touched rather than what the operator did — the same recut after a base advance that adds a path returns
`completeness-invented`. Direction is what disambiguates that.

**Typed-crossing rider.** `checkpointMovementCause` is stringly typed at its producer and absent from the
consumer's declared input, so neither end of that crossing is compiler-enforced while every sibling crossing
introduced alongside it is. No live defect; the hazard is a new overlap status reaching the surface unadmitted and
silently. It rides D3 as the same family — a refusal payload whose typing does not carry what its consumer must
discriminate on.

**Scope note.** D3 cites the lifecycle-tail remedy-composition spine claimed by `singleton-integration-continuity`
rather than restating the obligation; D3 is the delivery lane's instance of it. D3 alone does **not** retire pinned
probe 3, whose awaited shape is a close-side `rebuild-required` reason — that is D4's.

### D4 — Chain constructor, anchor preflight, `rebuild-required`

**One constructor, parameterized by the predecessor relation.** The two directions are opposites — at initial
authoring the members are ahead of the top and the remedy is to recut on the top's base; at bound correction the
top is ahead of the members and the remedy is to rebuild the suffix from the corrected top — but they already share
pair creation, and the direction is decided by the predecessor relation the preflight must read anyway.

It owns **coordinate production** and composes existing primitives rather than introducing new ones: the locator,
materialization, lifecycle-normalization, private-gate, lease, and eligibility surfaces, plus the object-
construction primitives already in the same library — `chain-absorption`'s `merge-tree --write-tree` /
`commit-tree` / leased `update-ref` sequence, and `chain-adoption`'s compare-and-swap adoption. It introduces no
parallel plan or state record and **no new object-construction path**: it consumes D7's construct half, so no third
implementation of chain reconstruction exists after this work unit.

**Required behavior:**

- Prepare or compare-and-swap rebuild the complete unpublished candidate chain from an anchor compatible with the
  originating top and the observed protected-base relation, the canonical member boundaries, and authoritative
  lifecycle exclusions.
- Under disjoint protected-base movement, retain the top's compatible chain base and return an **unchanged chain**
  when the existing cuts remain compatible. Compatibility is decided by the same predicate § D2 gives the close —
  the freshly observed predecessor relation, with a `diverged` kind carrying substantive overlap against the final
  candidate as the disqualifier — so one rule governs both boundaries instead of two that can disagree. A newer base
  OID alone must not trigger recutting, and newer base-only bytes the originating top lacks must not be silently
  imported.
- Preflight any proposed chain's predecessor relation and normalized completeness against the originating top
  **before** returning coordinates, so a mechanically wrong anchor is caught at the prepare boundary rather than by
  the eligibility close after the whole chain has been built against it.
- On the bound review-fix route, after the authorized top correction is clean and committed, rebuild the selected
  member and every dependent private candidate from the current public ancestry and canonical member boundaries,
  then resume rematerialization — which creates each member's authoring pair itself when one is absent.
- Emit a close-side `rebuild-required` reason naming the rebuild owed — the shape pinned probe 3 awaits, distinct
  from the prepare-side preflight refusal probe 2 awaits. D4 therefore spans both boundaries.
- Replay converges. Conflicts, dirty or foreign gates, moved authority or public heads, stale authorization, and
  incomplete normalization refuse **without a partial adopted chain**.
- A real conflict stops with its exact member and leaves the old chain usable.

**One locator, for refs and for the checkouts that remain.** Both halves of a member's coordinates derive from the
same locator the reaper uses: `residue-reaping.ts` is the only site that composes
`refs/arc/delivery-candidates/<planId>/<chunkKey>` beside `<commonDir>/arc/delivery-gates/<planId>/<chunkKey>`, and
the constructor consumes that locator rather than recomposing either. The malformed-gate hazard an unbound caller
would otherwise introduce does not arise, because the unbound route places no gate at all; the only route that
still creates a pair is the bound correction one, where the primitive's caller already refuses
`authoring-rematerialize-coordinate-mismatch` unless the resolved locator path equals the requested checkout path.
The class is closed by **removing the second creator**, not by hardening the primitive against one.

**Substrate contracts versus tracked-tier projection.** Coordinate production today normalizes trees against
lifecycle and Candidate records because those artifacts ride the work unit's code history. That normalization is
tracked-tier projection, and the storage direction schedules its retirement: once operational state materializes
off-branch, members become ordinary interior refs and the exclusion set empties. Everything else — anchor
preflight, the retained chain base, compare-and-swap rebuild, the no-partial-adopted-chain rule, the exact-member
conflict stop, member-boundary verification — is substrate-independent. **Author the split so the retirement is a
filter removal rather than a rewrite: the exclusion set reaches the constructor through one resolver seam the
constructor does not own, never as an inlined path list.** `operational-state-docs` is the eventual supplier of
that seam; until it lands, the seam is a boundary with one caller.

**Where member boundaries come from.** The boundary set reaches the constructor as an explicit input it does not
derive. On the bound correction route the existing member refs supply it. On the unbound route they cannot: the
persisted plan member carries intent — chunk key, title, contract, task and design element identifiers, landability,
deliverable identity, fingerprint — and nothing that partitions content, while the commit-level boundary evidence
lives in the authoring snapshot that composition deletes on completion (§ Alternatives & Rationale). Confirming
which surface supplies boundaries for a first cut is named in § Open Questions as an execution obligation, because
it is a question about where existing data lives rather than an unsettled design decision.

**The constructor produces refs, and observes checkouts rather than placing them.** Every member checkout existed
to run Tier 2 in, and § D6 removes that run from the window — so the constructor places none, provisions none, and
the prepublication window carries no per-member working tree at all. It still derives each member's locator, so it
still **observes** the derived gate path and refuses a dirty or foreign one before moving that member's candidate
ref off the head a stale pair sits at. That refusal is legibility rather than safety — it surfaces a leftover pair
at the boundary that noticed it, instead of at the next correction that trips over it.

**Why no prepublication checkout is safe to omit.** The obvious loss is a guard: a dirty member checkout currently
signals uncommitted work the operator may believe is already in the member. That signal was gate-attribution
evidence — it bound a Tier 2 run to the coordinates it ran against — and with no run in the window it guards nothing
that reaches a public head, since publication pushes the candidate ref and no checkout is an input to it. The
scenario itself also stops arising: with no per-member working tree before publication, a stray edit has nowhere to
land, and the operator's only authoring locus is the top. What remains is a **stale** pair from an earlier
correction cycle carrying uncommitted work, and three existing refusals already hold it — the reaper refuses a dirty
gate and never force-removes one, the rematerialization verb refuses a dirty authoring locus before reusing the
pair, and the constructor's own observation above surfaces it earlier than either. Nothing new is built for this.

**The typed result enumerates per-member disposition.** For every member the result names whether its cut was
**retained unchanged** or **recut**. Without it the unchanged-chain arm is unobservable: an operator cannot tell a
chain the constructor deliberately left alone from one it silently failed to touch. On refusal the result names the
exact member that stopped it.

**No partial adopted chain, and the mechanism that makes it true.** Objects first: every member's tree and commit
is constructed before anything is adopted. Object construction has no side effects, so a conflict at member N stops
with nothing to undo and leaves the previous chain exactly as it stood — the exact-member conflict stop above is
that property rather than a second mechanism. Adoption is then one batched compare-and-swap across the whole member
set, each ref carrying its expected old value and the batch applying all-or-nothing; the batched ref-update form
already has a caller in this codebase, used today only to verify leases. A refused batch adopts nothing.

**What the constructor does not claim.** It does not make tests instantaneous or auto-resolve a semantic conflict —
the measured 38 minutes went largely to semantic conflict resolution after an upstream test-file extraction and to
finding post-cut changes that belonged in specific members. Evidence carry at publication is D6's.

### D6 — Evidence carry: publication reads the work-unit attestation

**The carry that survives is the one the work unit already produces.** `verify-work-unit` completes every
project-designated gate and attests the result as a durable Candidate; `prepare-work-unit` starts from that
attestation and refuses to proceed without one. A full work-unit gate run therefore already precedes every
publication, and the integration checkpoint already trusts its record — it refuses `candidate-missing` with
"Integration requires a managed Candidate attestation." Publication is the one seam in that sequence that does not
read it.

**Publication reads currentness and convergence, and runs nothing.** `publish` today requires a non-empty
per-member gate-result list and reruns exact Tier 2 result admission against the post-gate checkouts. That operand
goes (below); what takes its place is a read of the durable Candidate — its projected currentness and its
convergence state — refusing a subject the attestation no longer covers.

The attestation is present by construction, so this refuses in exactly one state: **the Candidate advanced after
attestation and the delivery chain was prepared against the superseded subject.** `prepare-work-unit` already
directs that an approved fix changing the Candidate requires rerunning delivery preparation; this read is what
catches a chain that did not. That is this work unit's own continuity failure, caught at the seam where it becomes
public rather than after.

**What it establishes, stated precisely.** The attestation is work-unit-level: it establishes that the union
reviewable contribution passed, never that a non-terminal member passed in isolation. Per-member content may reach
the landing window having been checked only as part of a composed state, with the `Integrating` window, the
terminal checkpoint, and the base's own required checks as the net. This is the accepted consequence of the
check-placement decision (§ Alternatives & Rationale), stated here so it is not later read as an oversight.

**The `gateResults` operand is removed, and nothing replaces it.** It reaches three seams — the eligibility close,
the prepare arm's optional revalidation, and `publish` — and all three drop it. Its validator refuses on five
reasons, none of which survives:

- `duplicate-gate-result`, `missing-gate-result`, and `reordered-gate-result` are well-formedness of a
  caller-supplied list. They exist only because the list exists.
- `gate-result-failed` is the verification evidence this work unit relocates.
- `gate-result-stale` binds each result to its member's exact head and tree, which reads as structural but is not:
  the snapshot and the results arrive from the **same caller**, so the pair never witnessed anything a caller could
  not fabricate together. Removing it costs no anti-fabrication property because it never held one — consistent
  with the snapshot being an ephemeral mechanical value rather than a persisted authorization token.

`CandidateGateResultSchema`, the `DeliveryCandidateGateResult` type, the validator, and its five refusal reasons
become unreachable and are removed with the operand.

**The per-member checkout operand goes with the run it attributed.** `verifyDeliveryCandidateCheckout` does two
independent things: it inspects a checkout for dirt and exact coordinates, and it re-observes the candidate ref
against the snapshot. Only the first needs a checkout to exist, and what it establishes is that a Tier 2 run happened
at the member's exact coordinates in a clean tree — gate attribution, not publication safety. It has three call paths,
and two lose their subject once no Tier 2 runs before publication:

- `publish` takes `checkoutPath` per member from its own request, so the path and the snapshot it is checked
  against arrive from the same caller — the `gate-result-stale` shape again, and no more of a witness here.
- The review gate's pre-publication delivery-target derivation asserts every member's checkout is exact before
  composing targets. Composition needs none of it: a delivery member target is `{ baseRef, diffBaseSha, headSha }`,
  and the frontline provider materializes its own checkout.
- The bound rematerialization route **keeps** it. There the pair is the correction-authoring locus, the path is
  derived rather than supplied, and the dirt check is the one guard standing where the operator actually edits.

So `checkoutPath` becomes optional on the mutation candidate, `publish` stops sending it, the pre-publication
derivation drops its verification loop and its dependency wiring, and the function skips the checkout inspection
when no path is given while always re-observing the ref. The ref re-observation is what catches candidate drift
between the close and the first push, and it is untouched.

**What the eligibility close validates afterwards is purely mechanical, and already substantial:** the fresh plan
read against the snapshot's plan identity, revision, and digest; lifecycle-path resolution and the unchanged-paths
comparison across both the lifecycle and regenerable sets; per-member lifecycle revalidation; and everything D2
adds — the live protected-base re-observation, the overlap guard on that fresh relation re-scoped to the final
candidate, the independent chain-base refusal, and normalized completeness. The close holds no verification role
at all, which is why removing its only verification operand leaves it coherent rather than hollowed out.

**The reconcile seam surfaces the applicability decision it currently discards.** The substrate criteria 2 through
5 need already exists and delivery already reaches it: projecting an effective Candidate target does not stop at a
blocked currentness but derives structural contribution endpoints and a proof, returning either a
machine-recognized current target or a fully composed decision carrying the `covered | targeted-check | changed`
choices, its offer and prompt text, and its projection and residual digests. The defect is the delivery handler's
result mapping — the typed base reconcile collapses every non-current effective state into one opaque
`candidate-not-current` refusal, discarding all of it.

- **Only that site is corrected.** Two other delivery read sites collapse the same projection and are right to.
  The record-effect recovery arm reconstructs what a write already did and asks a yes-or-no identity question with
  no operator decision available; it is one of eleven identical returns and already carries an operator-facing
  remedy elsewhere. The boundary-carry arm compares the recognized subject digest against the digest its boundary
  was established at, so a decision _means_ the position moved and the refusal is accurate — surfacing a seam there
  would let an operator carry a boundary across the very change the boundary exists to bound.
- **The evidence that the reconcile arm is different** is internal to it: the same function already handles a
  changed effective state further down, reading its current target to compose a projected one. The guard
  short-circuits a path the function otherwise knows how to walk, and reconcile is precisely where a rebuilt
  chain's subject legitimately moves.
- **The return shape is a port-contract change, not a richer return statement** — the same distinction D3 draws,
  and it resolves the same way. A `decision-required` result is not a failure; it is a request for authority, so it
  does not become a refusal reason. The reconcile arm surfaces the projection's **own typed result** — the shape
  the effective-target projection already returns at its tail for a non-current state — as an outcome beside
  `refused` rather than inside it. Mapping it onto the refusal union would flatten a decision into a failure a
  second time, one layer above the defect being corrected.

**A content-preserving rebuild needs none of that path.** The Candidate subject is work-unit-level — one identity,
one digest over the unit's whole reviewable contribution against the protected base — so a rebuild that recuts
member commits without changing that union leaves the subject digest equal and currentness projects as current
through its operational-only advance arm. D4's constructor is what makes the antecedent hold rather than assume
it: under disjoint movement it returns an unchanged chain, and newer base-only bytes the originating top lacks are
never silently imported.

**D6 also pins the unpinned operand** in the member lifecycle-contribution revalidation that D2 leaves standing
(§ D2, Residual B) — a one-token change, routed here because D6 touches that comparison anyway.

### D7 — One chain-reconstruction primitive, construct split from publish

**The duplication is pre-existing and exact.** `chain-absorption.ts` and the published-side refresh adapter both
build a merged tree with `merge-tree --write-tree` and commit it with `commit-tree <tree> -p <top> -p
<predecessor>` under the byte-identical message `Absorb refreshed delivery predecessor`. The adapter's
`exactMechanicalTree`, its conflict-candidate reuse, and its absorption are pure Git with no host call in them;
what is genuinely host-coupled in that module is the provider-delegated restack, the change-request mutation, and
temporary-clone management. The composition seam already exists and is already used for one operand — the refresh
execution dependencies inject the library absorption as `absorbTop` — while the adapter's own preparation bypasses
it for the member suffix.

**Why the library primitive cannot be shared as it stands.** Not because the adapter avoids publishing — it
publishes too, checking the member ref out, resetting the working tree with `read-tree --reset -u`, and ending in a
leased `update-ref` under the same reflog message the library writes. The obstacle is narrower and structural: the
library primitive refuses any top ref under the delivery namespace, which is exactly what a published member ref is,
and it binds its Git exec at construction while the adapter works in a temporary clone. Sharing therefore means
lifting the ref-namespace guard to the caller and parameterizing the exec, not swapping a call site.

**A split is what D4 needs regardless**, since D4 constructs and only then adopts under a no-partial-adoption rule.
D7 is the seam all consumers stand on:

- Split `chain-absorption.ts` into a **construct** half (merged tree plus commit object, returning coordinates and
  mutating nothing) and a **publish** half (working-tree reset plus leased ref update). The existing bundled entry
  point remains as the composition of the two, so current callers are unchanged.
- Lift the top-ref namespace guard out of the primitive to its callers, so a delivery-namespace ref is admissible
  where the caller vouches for it, and take the exec as a parameter rather than binding it.
- Rewire the refresh adapter's inline suffix reconstruction through **both** halves. Sharing only the construct half
  would leave its reset-and-leased-update sequence duplicating the library's byte for byte — the very duplication
  D7 exists to remove, and enough to make success criterion 13's "one implementation" false. Its provider
  delegation, change-request mutation, and clone management stay exactly where they are.
- D4 consumes the construct half alone, because its adoption is the batched compare-and-swap in § D4 rather than a
  single leased update.

**Behavior-preserving, and verified as such.** D7 changes no constructed object: verification pins that the tree
and commit the adapter produces through the shared halves are identical to what its inline path produced, message
and parents included, alongside the existing refresh coverage. Two shapes the check must reach beyond the ordinary
merge path: the adapter's **reusable-candidate arm**, which constructs no commit at all and instead validates an
existing candidate against the merged tree, and the library's **contained-movement shortcut**, which commits the
top's own tree under a different message. Scope the construct half to the merge path and leave the shortcut inside
the bundled entry point, or the shared half will emit objects the adapter's inline path never produced.

**The dogfooding exposure, named.** D7 touches the published-side machinery this work unit's own stacked landing
exercises when its landed prefix advances, which is the hazard that put D1+D2 first. It is accepted because D7 is a
pure refactor with an identity check rather than a behavior change, and because the alternative — three
implementations, or a follow-on left in the same design space — is worse. D7 lands after the D1+D2 member and
before D4, never as the first member.

### Workflow surface

The deliverables above change what the operator does, so `deliver-stack.md` is in this work unit's owned surface:
shipping the verbs without it leaves prose instructing the operator to perform what the verbs now perform — the
redundant-ceremony class this work unit exists to remove. Each deliverable that changes the operator's steps
carries its own prose edit, so verb and prose land in the same member and the same review.

- **D4** replaces § Prepare private delivery candidates' per-member cut narration — recording each authored cut at
  its returned private candidate ref and matching detached gate path — with the constructor invocation, which
  returns refs and no gate path to record.
- **D6** drops the instruction to run the complete Tier 2 command set in every returned checkout and the
  hand-composed `gateResults` block that reports its results, at both the eligibility-close and publish windows;
  drops § Validate and publish's exact Tier 2 result admission; and drops the post-interruption instruction to
  rerun the candidate gates before re-invoking the mutation verb. Where per-member checks run instead is stated in
  `strategy-integration.md` § Delivery Shape and Landing Window, not restated here.

This is the procedure substrate's own case rather than an exception to it: a mechanics-narrating line no verb
covers is a verb-gap signal, and these deliverables supply the missing verbs (verbs-over-mechanics); the
hand-composed result block is prose moving data the CLI already holds (if the CLI can compute it, the CLI computes
it); and the replacement steps render precomposed result text rather than new prose templates.

## Alternatives & Rationale

**Two direction-specific builders, rejected.** Initial authoring and bound correction are opposite directions, but
they already share pair creation and the direction is decided by the predecessor relation the preflight must read
anyway. Two builders would duplicate the preflight and re-create the same collapse from the other side.

**Leaving the pre-existing reconstruction duplication in place, rejected.** The lighter arm was to have D4 compose
the library primitive, capture the adapter's duplicate implementation, and leave its removal to a follow-on. It was
rejected on two grounds. The split D7 performs is a precondition for D4 composing anything at all — the bundled
primitive cannot be consumed without publishing — so the "capture it" arm does not actually avoid the work, it
only ships the split without its second consumer. And deferring leaves the question open in exactly the design
space that is currently loaded, which is where a follow-on is most likely to re-derive it wrongly. The accepted
cost is the dogfooding exposure named in § D7.

**Deleting the `source-moved` base entry, rejected.** The close's relation recomputation runs over two snapshot
values, so it is deterministic and observes nothing; removing the loop entry alone would leave genuinely
overlapping movement unseen. Switching `observedTip` to the live tip **alone, without narrowing the comparison that
reads it**, also rejected: that comparison reads `observedTip` first, so every movement — disjoint included — would
refuse `wrong-predecessor`, and the relation kind legitimately changes when the base advances. Taking the live read
and the narrowed comparison together is what keeps a real guard on a fresh observation, which is why the parts land
as one change.

**A bounded in-call recheck of the protected tip after binding, rejected.** Once the target is bound, bound-chain
materialization skips its observed-tip check, and the protected ref can move between a fresh eligibility close and
later private-ref or draft-PR effects, leaving stale publication artifacts without granting merge authority. Two
independent reads settle it the same way. Industry practice at this seam is uniform: merge-queue mergeability is
advisory and recomputed at the merge gate, submit rules evaluate at submit time, speculative gating resets and
rebuilds, stacked-PR tooling restacks on demand and defers to the host's merge rules. The safety property
everywhere is compare-and-swap at the mutating write plus authority at the final gate — never a pre-check inserted
mid-sequence — and the leased private-ref updates already hold the first half. Adding a recheck would be more
exacting than the host at a host seam, which the project's external-seam rule declines while keeping stronger
exactness in ARC-owned validation; and the durable integration-resume surface being typed elsewhere would later
have to absorb a bespoke recheck. **The design response is legibility, not prevention:** make the residual scope
visible in the payload, keep compare-and-swap on every ARC-owned write, and disclose the race as a
recovery-complete refusal does. Later review gates remain the authority boundary.

**Running per-member Tier 2 locally before publication, rejected.** The alternative is the shape the
prepublication window has today: a full Tier 2 pass per member in a provisioned detached worktree, with durable
gate-result carry so the window's output survives the session that produced it. Two independent grounds reject it.
Its own machinery could not be built as specified: the gate-identity digest had no
resolution source, because the command set is prose reached through an explicit passthrough that no CLI resolves,
and this project's own gate selection narrows Tier 2 by changed paths, so "the resolved command set" names no
single value even at one instant. And external practice is uniform against the shape: no mature stacked-change tool
verifies locally before publication — ghstack, spr, Graphite, GitHub's native stacks, Sapling, and Jujutsu all
verify through per-change checks after push; Graphite skips checks on mid-stack changes by default and reasserts
them at merge-queue time; Google's presubmit is deliberately not full-suite and runs affected tests remotely; merge
queues verify speculative combined states server-side. The nearest analogues that do gate thoroughly before landing
— Chromium's commit queue, remote-execution-backed presubmits — achieve it by making verification remote and
cached, never local. A build cache's own trust model is the same point from the other side: locally-produced
entries are exactly what a remote action cache refuses to trust, which is a direct precedent against recording
local gate results as durable reusable evidence.

**Gating publication on nothing at all, rejected.** The minimal reading of that reversal is to drop the operand and
add no replacement, leaving publication an ordinary unverified act. It was declined because it discards a result
ARC already requires, already pays for, and already trusts at the integration checkpoint. Reading prior
verification at a gate is itself the idiom rather than a departure from it — the staged pipeline is a fast commit
build with slower stages behind it, and the work-unit gate run is that commit build; Gerrit gates submit by reading
a `Verified` label a prior run produced. Declining to read at publish while requiring the same record at
integration is not less exacting, only inconsistent about when it looks.

**A fast check subset at the top member, rejected.** It keeps a local signal before publication at the cost of
inventing a "fast subset" concept with no existing substrate behind it, and the same practice that puts per-change
checks after publication puts advisory pre-push subsets on the advisory side. The top member's tree is the union
contribution the attestation already covers, so the subset would re-run a reduced form of a check that has already
run in full.

**Superseding `ADR-034` rather than amending it, rejected.** That record decides to make agentic review the primary
lane and to land ordered members in one bottom-up, post-publication window, and nothing here touches that: merge
timing, the landing window, the terminal vehicle, the integration interlock, and native registration all survive.
Supersession is reserved for reversing or significantly altering a decision, and this decides a different axis the
original left unlocated — its Decision draws an incremental-versus-batched contrast for member review and checks
without placing checks relative to publication. A new record plus a dated cross-reference amendment is the
instrument that fits.

## Cross-cutting Considerations

**Trust boundaries.** Publication reads the work-unit attestation; it does not produce one, and reading it grants
no review clearance, no check success, and no merge authority. The eligibility close re-prepares fresh and compares
coordinates itself rather than trusting a supplied result — which is what it already did, minus two operands that
were never independent witnesses: a gate-result list and a checkout path, each supplied by the same caller as the
snapshot it was checked against. The reconcile seam's correction widens what an operator is _shown_, never what they
may authorize: the choices, texts, and digests it surfaces are the same ones the review gate's doors already
compose, and the authority to select among them stays exactly where it is. Terminal integration retains its own
current checkpoint evidence and exact-head approval.

**Performance and cost.** The constructor's object work is sub-second per member and it creates no worktree, so it
carries no other material cost. The rebuild baseline to beat is the measured ~38-minute three-member rebuild,
almost none of which was the rebase itself, so the constructor's value is in the preflight and the evidence carry
rather than raw Git speed, and it is not claimed to collapse that figure. Removing the per-member Tier 2 pass
removes the dominant term in the prepublication window outright.

**Disk lifecycle.** The prepublication window holds no per-member checkouts, so it owes no disk accounting at all
— the gate directories exist only while a bound correction is being authored, which is the one route that still
creates a pair and the one the residue reaper was already sized for. Reaping the malformed gate directories already
on disk is an Errand's, not this work unit's.

**Testing.** Three pinned probes hold this boundary's behavior. They pass today; each fails the moment the behavior
changes, printing the sentence naming what it was waiting for and its exact replacement. Retiring them is in scope
rather than a regression — a fix here cannot merge while one is red, and each is a single pinned-observation call to
replace, though ordinary assertions in the same files change alongside them. **They retire independently, one per
boundary, which constrains the cut: a deliverable that changes one boundary retires that boundary's probe in the
same landing**. A probe that instead reports that the held result no
longer describes what happens and the awaited one has not arrived either has found behavior neither shape names —
that is a finding, not a retirement.

1. `delivery-window-base-movement.test.ts` — "discards them when the base advances on a path no member touches"
   (D2).
2. `delivery-rebuild-base-movement.test.ts` — "admits a chain recut on the moved base, then refuses it after the
   gates would have run" (D4 — the prepare-side anchor preflight).
3. `delivery-rebuild-base-movement.test.ts` — "refuses the unchanged private candidates once the correction lands
   on the top" (D4 — the close-side `rebuild-required` reason, which is why a D3 that only enriches the
   `completeness-*` payload leaves this probe green and unretired).

Further test obligations. D2's fixture must stop stubbing lifecycle-path resolution to a single constant **and**
carry a non-regenerable lifecycle path, since regenerable paths compare against the chain base and leave both live
protected-base reads unobservable either way; D2 must also cover a pre-existing later-member overlap refusing at
prepare rather than at the close. **D3 breaks the only executable record of the byte-identity it exists
to destroy** — an ordinary equality assertion, not a pinned observation, holding the authoring and rematerialization
results equal — which becomes assertions on the now-distinct payloads. D3 and D4 therefore touch one test file from
different delivery members, and each landing rewrites only its own cases. D6 must cover publication refusing a
chain whose Candidate advanced after attestation **and** publishing cleanly when it did not; the removal of the
`gateResults` operand at all three seams; the checkout operand's asymmetry — publication and pre-publication target
derivation succeeding with no member checkout on disk, while the bound rematerialization route still refuses a
dirty authoring locus — with the candidate-ref re-observation still catching drift in both; and the reconcile seam
returning a composed applicability decision, with the two sibling read sites still refusing opaquely — the negative
case is what keeps the correction scoped.
D7's identity check must reach the adapter's reusable-candidate arm and stay clear of the
library's contained-movement shortcut — that check is what licenses a refactor of published-side machinery during
this work unit's own landing. D4 must cover the batched adoption refusing whole and converging on replay.

**Migration and rollout.** Pre-public-release posture applies: removing the `gateResults` operand, its schema, its
type, and its five refusal reasons, and making the per-member `checkoutPath` optional, are breaking changes to
unpublished project-owned contracts, which this project's posture permits in place — no compatibility aliases, no
migration readers, and development state is cleared or regenerated rather than migrated. The stack lands per the
delivery shape above, with the single-branch fallback recorded up front. The doctrine half lands with it:
`strategy-integration.md`'s two edits, `ADR-035`, and a dated cross-reference amendment on `ADR-034` ride D6 rather
than a follow-on, because the next delivery cut is the sibling this work unit exists to unblock and would otherwise
inherit the retired model.

**Forward compatibility.** Nothing here adds a durable record, a namespace, or an evidence vocabulary, so the
constraint against a generic evidence store is satisfied by construction rather than by argument. Authority for
what covers what stays with the Candidate machinery and the applicability assessment, which is where it already
sits — this work unit adds no second opinion about applicability, it removes a door that was discarding the first
one. D4's resolver seam keeps the tracked-tier exclusion set a filter removal rather than a rewrite when
operational state moves off-branch.

**Coordination.**

- `evidence-applicability` may consume this work unit's exact base and currentness result at the handoff seam, but
  does not own candidate reconstruction and must not require a broad freeze across the prepublication window.
- `singleton-integration-continuity` owns the singleton integration tail and disclaims delivery mechanics. Two
  seams: **no implementation overlap** — both write the integration checkpoint from opposite sides, so one sequences
  to land before the other starts implementing, either order; and a **shared remedy-composition surface** — D3 and
  the sibling's host-admission remedy discrimination are the same family, the sibling claims spine ownership for the
  lifecycle-tail half, and D3 stays the delivery lane's instance and cites the spine rather than restating the
  obligation.
- `review-checkout-lifecycle` owns frontline review checkout registration and diagnostics, scoped to that path.
  Nothing routes to it from here and no seam is shared: this work unit authors no checkout contract at all, and
  removing the prepublication per-member checkouts only reduces what registers in the primary's worktree list.
- `candidate-reroot-recovery-frame` may preserve resumability but owns no applicability decision.
- Keep **Make no-material Frontline follow-up effective across Candidate rerouting** independent unless source
  inspection proves its blocker is the same evidence-target binding rather than merely adjacent vocabulary.

**Residual scope legibility.** The delivery shape narrows a refusal and never a tolerance, so residual scope is
invisible on tolerant results — which is why a checkpoint advisory can read "merge the base before continuing edits
on those paths" on the very result that just admitted a reviewable path. Making the residual scope legible in the
payload is this work unit's design response; which component composes the message is the Errand's.

## Success Criteria

Criteria 1–7 are carried from the originating evidence-applicability capture. They predate this work unit's
deliverable stack, so the substrate each is validated against is named here rather than in the criterion:
1 → D2 (the permissive clause) with D6 (the restrictive clause); 2, 3, 4, and 5 → D6, reaching the existing
applicability machinery, with D4 supplying the verified before/after coordinates; 6 → D4's replay and
no-partial-adopted-chain rules plus the publication-window disposition recorded in § Alternatives & Rationale;
7 → the end-to-end case across D2, D4, and D6. Criteria 8–16 were authored against this work unit's own
deliverables and name theirs inline.

**Criteria 1 and 2 are restated rather than carried verbatim**, recorded here because carried criteria are
pre-commitment text. Criterion 1 required that disjoint movement not repeat "member gates" and that "changed gate
definitions" prevent reuse; criterion 2 required that similarity never establish "whole-gate applicability." All
three phrases name the per-member prepublication gate window that the check-placement decision removed, so each is
restated to the substance it was expressing — the covered-input rule, and applicability resting on verified
coordinates rather than on resemblance. Criteria 3 through 7 are carried verbatim.

1. Disjoint protected-base movement reobserves eligibility without repeating a ceremony whose covered inputs remain
   unchanged; covered inputs that did change prevent unsupported reuse.
2. Exact member and suffix transitions receive carry, bounded supplemental, or fresh treatment from verified
   before/after coordinates; ancestry or contribution similarity alone never establishes that an earlier result
   still applies.
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

8. The covered-input rule is stated once in a surface non-delivery ceremonies reach, and its firing condition
   demonstrably reaches those consumers — verified by reading the trigger, not by asserting the placement (D1).
9. A `completeness-*` refusal names which side moved and what would clear it, and any remedy it names can actually
   clear it (D3).
10. A clean unbound stack reaches publication-ready coordinates through one typed operation with no per-member
    hand-authored Git steps and no per-member worktree created; replay converges; and a real conflict stops with
    its exact member, leaving the previous chain usable (D4).
11. Publication refuses a chain prepared against a Candidate that advanced after its attestation, and publishes
    unchanged when it did not; no `gateResults` operand remains at the eligibility close, the prepare-side
    revalidation, or publish; and publication and pre-publication target derivation both succeed with no member
    checkout on disk, while the bound rematerialization route still refuses a dirty authoring locus (D6).
12. A rebuilt chain whose effective Candidate target is not current reaches the operator as a composed
    applicability decision carrying its choices, texts, and digests, rather than as an opaque refusal — while the
    record-effect recovery and boundary-carry read sites continue to refuse without one, which is what keeps the
    correction scoped to the seam that needs it (D6).
13. Chain reconstruction has one implementation after this work unit: the published-side refresh adapter builds and
    publishes its suffix through the shared halves, producing a tree and commit identical to its previous inline
    path — message and parents included — with existing refresh behavior unchanged (D7).
14. No step in `deliver-stack.md` instructs the operator to perform what a shipped verb performs: the per-member
    cut narration is replaced by the constructor invocation, and the hand-composed gate-result block is gone from
    both the eligibility-close and publish windows (D4, D6).
15. The constructor names each member's cut as retained or recut, and a construction that refuses adopts no ref at
    all (D4).
16. The doctrine lands with the mechanism: `strategy-integration.md` states that publication reads a work-unit
    attestation and that member checks run after publication under the project's own policy, `ADR-035` records the
    check-placement decision, and `ADR-034` carries a dated cross-reference amendment to it (D6).

## Open Questions

[none] — every settle-able decision is settled.

What remains open is implementation detail, plus three named obligations that belong to execution rather than to
design: D1's trigger-reach check (§ D1), D2's demonstration that the fresh overlap guard and the independent
chain-base refusal cover the fabricated-snapshot case (§ D2, Residual A), and the surface that supplies member
boundaries for a first cut (§ D4). Each is stated where it fires and carries its own verification; none defers a
design decision.
