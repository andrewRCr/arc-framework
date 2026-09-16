# Draft: Delivery Post-Landing Conflict Recovery

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14), which carried its captures and added field evidence.
- **Purpose:** Give a landed delivery member a typed route back to closeout when its retained suffix, its terminal
  binding, or the shape of the base history leaves the exact-head comparison unsatisfiable — without relaxing that
  comparison or turning an Owner authorization into a general escape contract.
- **Planning posture:** The failures are proven and reproduced under probe. The originating instance is retired, so
  nothing is blocked on this work today; what remains is that the mechanism which produced the residue is unfixed
  and the next stacked landing meets it again. The surface spans whole-work-unit verification, Candidate
  applicability, public review, landing, and closeout, which establishes `Class: Heavy` and a `P1` slot.
- **Readiness:** `maturing`. Five adversarial passes (2026-09-16), the fifth certifying and not-ready with four
  blockers. The terminal-member cluster those blockers converged on has since settled on probe rather than on
  reasoning: the marker is the Candidate applicability decision, its record is the `applicability-selection`
  transition, the absorption arm's invariance is measured, the acceptance evidence is derived from Git rather than
  written, and decline is a release transition rather than an undo. Five items are open and **none is
  structural** — two await text, one a measurement, one a naming call, one a repair choice. What the design _is_
  no longer moves; the consolidation and its coherence re-read have run, and the sixth pass is next.

---

## Continuity

The settled record is organized by what it settles, not by which pass settled it. Items marked `[frozen]` were
verified against source — and where empirical, against a scratch repository — by three independent adversarial
passes and appear in every one's withstood list; a later pass attacks them again only on new evidence, never on
re-reading. Items marked `[certified]` were verified against source by the fifth, certifying pass and returned in
its withstood set — short of the three-pass frozen bar, but not fresh ground either. Items marked `[probed]` rest
on a measurement recorded in § Pinned probes. Everything else is settled by source read and open to ordinary
re-examination.

### Settled — scope, boundary, and the failure family

- **Seven probe rows are owned here** `[frozen]`, across three of the characterization's four axes — not the four
  loci the origin captures described. § The failure family.
- **The ambiguity seam has four verbs, not three** `[frozen]`, and the fourth returns a wrong answer instead of
  refusing.
- **The rebind verb already works** `[frozen]`. What is missing is a route to it from the verbs that read the
  binding.
- **The post-land refusal is correct** `[frozen]`. Its defect is the guidance wrapped around it one layer up.
- **Closeout's conjunction owes a reason per term** `[frozen]` — taken into scope by the Owner, 2026-09-16. The
  sizing rests on fourteen conditions reaching one word, not eight. § The gap.
- **The absorption arm is in scope** — the terminal collision is a structurally separate refusal from the member
  suffix, so a member-only protocol would leave it emitting a remedy nothing can clear. The separate terminal top
  is durable surface rather than a bridge, so its recovery is designed as a permanent path. § Axis D.
- **The boundary holds: one work unit** `[frozen]`, and the boundary with `delivery-correction-convergence` is
  settled on evidence, re-affirmed after a pass concentrated its findings in one half. § Boundaries.
- **The two routed captures are integrated** `[frozen]`. § Retained capture detail keeps what the body does not
  restate.
- **The settled fundamentals clear the four project check-docs and two unbuilt designs** `[frozen]`, with three
  constraints adopted. § Forward-compatibility check.

### Settled — the relation

- **Cardinality is a refinement of divergence, and the resolver fork follows** `[frozen]`. One relation-typed read
  answers both; cardinality is a field on the diverged variant, not a variant, and applicability is its only
  consumer.
- **The relation is extraction, not invention, and it is proportionate** `[frozen]`. Four sites already derive it
  by hand under four return types. `assess-design-proportionality` returned `proportionate` with its scope guard.
- **It carries six variants over an ordered pair** `[frozen]`, split into a pure classifier and a thin reader per
  executor. The reader produces the unavailable outcome, which is where the hand-rolled helpers collapse it.
- **Readers split between the shared base resolver and the relation** `[frozen]`, five and four respectively.
  Read-all, refuse-on-more-than-one, then diff or record from the single base. The staged arm of the subject
  collector takes the same rule, and its probe is now pinned. § Reader inventory carries the arithmetic, which
  has been corrected twice, and the sweep command that re-derives it.
- **The subject's path set is base-relative, with cardinality refused rather than picked** `[frozen]`. The
  commit-derived answer was falsified twice: it cannot see a branch retaining its own side of a base-changed path
  across a base merge, and the content-inclusive digest inverts its movement-sensitivity claim. § The subject's
  path set.
- **Review readiness misses rather than mismatches** `[frozen]`, because its lookup is keyed on the observed head.
  Resolve by the deliverable identity the reader already holds and compare second. The inversion conforms
  readiness rather than introducing a pattern: `sameDeliveryReviewMemberVehicle` is
  `sameDeliveryReviewMemberIdentity(…) && expected.head === actual.head`, so its head term is precisely the
  equality this design replaces with the relation everywhere else, and `status.ts` and
  `hosted-reservation-admission.ts` already resolve identity-first across head movement. Readiness is the outlier.
- **Merging the base in collapses cardinality, per coordinate pair** `[frozen]`. It reaches the sites comparing a
  head against a base; it does not reach the two comparing a pinned durable baseline, whose route is re-baselining.

**The movement substrate is a different axis, and the question was posed against the wrong object** `[certified]`.
`terminalAuthoringMovement` is an admission option, a lease-proof fact, and a durable operation field — three
things under one name, none of them a movement classification. The relation sits beneath it at `readAncestry`'s
layer, which § Shape already assigns to the thin reader, one direction per call: one says what the movement is,
the other whether this observation mode admits it. Axis A unifies on the relation and this is not its vehicle —
the frozen consumer set of three stands, and `terminalAuthoringMovement`'s own reads are not converted, since
conversion would add only a reason for a refusal that is routed out rather than owed here. The in-flight
session-init Errand is therefore not downstream: neither the option nor the fact changes shape, so it ships in
either order. § The movement substrate.

**The readiness lookup resolves by deliverable identity, behind a fifth interface** `[certified]`. Of three routes one
is eliminated — `resolveDischargeTargets` refuses `unavailable` for the whole enumeration when any member carries
a null `changeRequest` or `coordinates`, turning _this member is not bound_ into _delivery state is unavailable_,
which is the Axis A conflation relocated. The surviving two converge, and the interface boundary decides between
them: `resolveTerminalRecords` already performs the plan read, state read, and coherence check a
deliverable-keyed method's body needs, so that route is its body behind a named method with a typed result, taken
as a fifth interface beside the four in `core/delivery-member-lookup.ts` rather than widening
`DeliveryMemberLookup` by use. The result carries four arms — not-in-plan, in-plan-unbound, bound, unavailable —
because `stateMemberMatches` opens with a null-`coordinates` guard and `coordinates` is independently nullable;
in-plan-unbound is `absent` while not-in-plan is an identity error carrying its own remedy. `absent` therefore
means _no member_, which both surviving routes agree on and only the eliminated one would have changed.
§ Readiness reads its key backwards.

**Two evidence corrections have landed against this set**, both to evidence rather than to conclusions, and the
resolver fork's conclusion is strengthened by each. The call-site inventory was short twice — a full sweep finds
fifteen distinct base-resolving call sites, seven of which pick silently, where the table carried seven and one.
And the silent pick is not unique to the Candidate subject collector: `repository-target.ts` picks silently on the
local review host's diff base, the review-evidence surface this draft's own argument is about. What was wrong was
the arithmetic, the uniqueness claim, and a `source-verified` label claimed twice over a short table — which is
why § Reader inventory now records the sweep command rather than the assurance.

### Settled — the recovery protocol

**The protocol's input side is already built, on the sibling provider path.**

- **ARC already implements disclose-and-resubmit.** `adoptExternalDeliverySuffixRefresh` collects the complete
  conflict set, returns `conflict-resolution-required` carrying a resubmittable disclosure, and waives proof for
  precisely the approved members.
- **The decision is a resubmitted disclosure, not a stored record.** ARC persists nothing on the input side, so
  nothing can go stale; what survives the wait is the reservation already durable in `activeOperation`. This
  retracts the pending-obligation record, the content-equality predicate, and `readEntries` as its primitive.
- **Arrival needs no new operation and no state-schema change.** The native path consumes the resubmitted
  disclosure in the same `land-status` call that settles, because its reservation is already held: the landing
  projection is passed unpersisted at the same revision, and every conflict refusal returns before the single
  state write.
- **The approval fires on genuine collisions only.** Identical trees take the `tree-equality` fast path and clean
  reapplies take `mechanical-reapply`, both silent. Movement alone never asks anyone anything.
- **Adoption is request-side** — the conflict collection, the disclosure, and a scope discriminant on the
  `native-land-status` request, not a state-schema change.
- **Gerrit's asymmetry and ARC's standing acceptance rule agree** once movement is distinguished from change: what
  survives arbitrary movement is the fail-closed signal, and an approval never carries itself.

**No obligation field is written, and the encumbrance is structural instead.** `pendingReviewFixVerification` is
the review-fix flow's own state machine — an acknowledgement identity key, a field terminal integration renews
from its candidate, and a bar on native stack link and unlink — not a generic slot for what is owed, and a native
landing has no selection to write into it. For non-terminal members nothing needs one: the settle writes resolved
heads into state coordinates and the next landing cycle refuses any member that cannot pass `reviewReadiness` on
its exact head. The encumbrance-predicate extraction therefore stays captured rather than scoped — there is no
third obligation term, and an audit fact is not an encumbrance.

**The terminal member is gated by the Candidate at the integration checkpoint, not by delivery** `[probed]`. The
per-head readiness gate never runs for it — `deriveNativeDeliveryRegisteredRemainder` slices it off — so reading
for a delivery-side marker finds nothing. Two checkpoint mechanisms hold it, and the rebind verb is neither:
that verb has one production call site, inside `arc delivery reconcile`, so it never runs on a native landing.
The **terminal coordinate advance proof** reads the absorbed head and withholds a proof, because the Candidate's
recognized target does not reach that commit — measured, not reasoned — which leaves the public review
continuation unable to read current and the checkpoint refusing `refresh-required`. The **Candidate applicability
dispatch** is the second, reachable because the currentness projection passes an applicability result straight
through; its result schema forbids an `applicable` payload and demands a resolution selector on
`decision-required`. That selection is the acceptance: an `applicability-selection` transition, which already
carries the disclosure, the accepting identity, and a binding that dies when the content is rewritten. Reusing
the `review-terminus/v1` family was considered and rejected on source: its discharge reader matches on the
vehicle without inspecting `kind`, so a second `kind` there would discharge hosted review for an unreviewed head.
§ The waiver record.

**The absorption arm is Axis D's twin on composition, and carries a live untyped adoption route** `[probed]`. Its
three composition inputs are recorded rather than observed, so the operator's resolution cannot reach them —
resolve-and-rerun returns the byte-identical refusal. But `observeExactAbsorption` adopts a commit on its parent
pair alone, with any tree, so a hand-resolved merge settles and writes that tree into the terminal coordinate.
The evidence that it _was_ a resolution is **derived, not written**: the resolved top's parent line is exactly
`<head> <priorTop> <refreshedMember>`, and `priorTop` is data applicability already holds. The residual it
reports is the operator's own resolution rather than the whole absorbed predecessor. § Axis D, § The waiver record.

**`covered` is the Owner's escape hatch, and the practice survey supports it.** ARC's evidence layer reduces an
absorption to `fresh` with `judgmentRequired: false` while the Candidate layer offers `covered` anyway, so
accepting one is an override of a stated machine read. No surveyed system offers a typed per-change override —
but every one permits an unconstrained human re-assertion, so the rule that generalizes is about automatic carry,
not about override, and ARC's version is the better-recorded form of a gesture the industry takes for granted.
§ Established practice.

**Decline releases the wedge; it does not reverse the landing.** The two disclosure points sit on opposite sides
of the local-ref rewrite, so it is two cases: the suffix arm has nothing to restore, the absorption arm must put
back refs ARC moved itself. The restoration shape transfers from the provider path against local refs; the
transition shape transfers from the not-applied clear, but not its code path, which reconciles observed host
facts. § The decline route.

### Open

Five, **none of them structural**, after the terminal-member cluster settled across two probes and a practice
survey and decline settled on a mutation-order read. Every remaining item is detail: two await text, one awaits a
measurement, one awaits a naming call, and one awaits a repair choice over a defect the staged-arm probe
surfaced. Nothing open now changes what the design _is_ — which is the condition § Next's consolidation step was
waiting for.

- **How the override presents itself.** Settled in direction 2026-09-16, detail open. `covered` is the Owner's
  escape hatch and stays reachable; what remains is the wording and placement that make it read as an override
  rather than a routine pick. The decision surface should carry ARC's own evidence reduction — `fresh`, with
  `judgmentRequired: false` — beside the choice, so the Owner overrides a stated machine read rather than
  selecting from an undifferentiated menu, and `targeted-check` should be offered as the bounded-evidence
  alternative without being the forced path. § Established practice carries why the hatch is right; what is not
  yet written is the text.
- **Which verb surface the release transition takes.** Settled in substance 2026-09-16; only its placement is
  open. § The decline route establishes what it does — restore any local member refs ARC rewrote by lease,
  publish `activeOperation: null` at the exact revision, report what it left standing — and that the two
  disclosure points need different amounts of restoration because they sit on opposite sides of
  `native-landing.ts:956`. What is not settled is whether that lands as its own `delivery native` verb or as a
  declining arm of `land-status`, which turns on a CLI-surface convention this draft has no reading of. Ask at
  spec time rather than guessing here; nothing else in the design depends on the answer.
- **Whether an all-neutral conflict set should settle without asking.** ARC classifies paths `reviewable` /
  `evidence-neutral` / `regenerable`; a collision confined to lifecycle projections carries no judgment. Gating
  the disclosure on at least one `reviewable` path is the proposal; the subset's reachability is unmeasured.
- **The word for the rewound variant, and the vocabulary collision.** The union's shape is settled — a
  four-variant relation wrapped in a reader result. What remains is the word for `rewound` and the collision
  with `lib/delivery/predecessor-relation.ts`, which types an ordered-pair relation as
  `exact | disjoint-ahead | overlapping-ahead | unrelated`, whose `exact` arm is this design's `unchanged` and
  `advanced` collapsed together. Two ordered-pair relations in one subsystem need one vocabulary, and the
  adopted controlled-vocabulary constraint decides which way.

    **The analog to test against is Git's own vocabulary, not Gerrit's.** This is an ordered-pair ancestry
    relation, and Git already names every arm of one — ancestor, descendant, fast-forward, diverged, unrelated
    histories — with exact meanings a reader arrives holding and `merge-base --is-ancestor` as the primitive
    underneath. Gerrit's change kinds are the wrong shelf to reach for here: they classify _a change against its
    predecessor_ under a review model, not _two revisions against each other_. Settle the names against Git's
    terms first and invent only what Git leaves unnamed, which is chiefly the rewound direction. Note the pull
    the other way before choosing: § Established practice records why the applicability proofs deliberately do
    **not** borrow external labels, and the deciding difference is that those name a proof while these name a
    topology Git already has words for.

    **One direction touches a request contract, and the project's posture discharges it.**
    `PredecessorRelationSchema` is not internal: it sits in `EligibilitySnapshotSchema`, which sits in
    `CloseSchema` — the strict-JSON request `eligibility-close` parses — and the same snapshot is emitted as a
    result, so those literals are written by one verb and read back by another. Renaming its arms is therefore
    a request-contract change rather than a local rename. `DEV-RULES.PROJECT` § Engineering Standards settles
    what that costs: until the first public release, unpublished project-owned contracts may change in place
    and no compatibility alias is owed. The item stays a naming call — on that ground, rather than on not
    having looked.

- **How the flaky committed-arm hold is repaired.** Scoped 2026-09-16 by the Owner; the repair itself open. That
  hold binds to which of two equally good ancestors `git merge-base` returns, which Git does not contract, so it
  can report its awaited result with no fix having landed — a hold that reads _spent_ on its own is not evidence.
  Three routes: re-shape it to an outcome as the staged-arm hold does, make the arrangement deterministic so the
  pick is stable, or drop it as redundant against the digest hold beside it, which already reports the same
  defect stably. The flip was observed once and has not been reproduced on demand, so the determinism route owes
  a reproduction before it can be claimed to work. § Pinned probes.

### Next

**The coherence consolidation has run** (2026-09-16). § Continuity is organized by what it settles rather than by
which pass settled it, with certification carried per item — `[frozen]` for the three-pass bar, `[certified]` for
the fifth pass's withstood set, `[probed]` for a measured claim — so a later pass can see what it may re-attack
without reading a stratigraphy. The self-check against the pre-rewrite layers caught three claims that had gone
missing in the rewrite and restored them; run that check on any future consolidation rather than trusting the
reorganization.

**The staged-arm probe is closed** (2026-09-16), and no owed evidence remains. It holds the staged arm
_collecting_ where the settled rule says it should refuse, so a fix applied to the committed arm alone leaves it
red. Closing it surfaced a defect in its sibling, taken into scope by the Owner the same day: § Pinned probes
carries the defect and § Open carries the choice of repair.

**The sixth pass is next.** The two remaining text items — the override's wording and the refusal disclosure — are
the same surface speaking to the same person and should be written together, but neither blocks the pass. Read
§ Adversarial pass record before spending it: it carries the fifth pass's findings as `prior-findings` and its
withstood set, so the sixth re-derives neither and re-attacks nothing already checked.

**Both probes are spent.** The absorption-arm probe returned a third outcome — invariant composition plus a live
untyped adoption route. The derived-evidence probe confirmed the parent-line derivation and the precise residual,
and surfaced the layer disagreement now standing in § Open. Both live in the planning probe recorded in
§ Pinned probes; neither needs re-running to design against.

**Two standing procedures, one of them new.**

- **The ledger-diff check.** Before any commit that rewrites § Continuity, diff the pre-rewrite § Open against
  the post-rewrite one and account for every item that left. Run across this session's two settlements: four
  items left and two arrived. The marker and the record's home settled on the absorption-arm probe and the
  absorption-arm probe spent itself, admitting the admission tension; the derived-evidence probe then settled
  that tension and admitted the presentation question in its place; the practice survey settled that question's
  direction, leaving it open only for its text; and decline settled on a mutation-order read, leaving only which
  verb surface carries it. The all-neutral narrowing and the rewound variant carried unchanged throughout. Four
  stood where six did, and none was structural where three were. Run again on the staged-arm close: none left
  and one arrived — the committed-arm hold's repair, scoped from a defect that probe surfaced rather than
  from a design question. Five now stand, and **none is structural**.
- **The settle-time dependency sweep, added 2026-09-16.** When a settlement retracts or replaces a named object,
  grep the whole draft for that name and re-read every hit before committing. The ledger-diff check is
  section-scoped; this failure is document-scoped, and the two are not the same guard. The fifth pass's first
  blocker was five passages standing on an obligation the ledger had already dissolved, and verifying it took one
  `grep -n pendingReviewFixVerification`. Both regressions that pass found would have been caught by running it
  at settle time rather than at audit time. **Widened 2026-09-16, after it missed one.** A settlement that retracts a
  _position_ leaves no name to grep, which is how two passages went on prescribing a remedy the same commit's
  § Open had already rejected by name. So the sweep takes two keys: the object's name where a settlement replaces
  one, and the rejected alternative's own wording where it replaces a reading. Write the rejected reading into the
  settled passage — then the next sweep has a string to find, and the reader learns why the other branch is closed.

**On the pass loop.** Five have run against a `Heavy` cap of two, each of the last three finding its blocker
inside the previous pass's repair. Read the fifth pass's own split before spending a sixth: two of its four
blockers were regressions of that kind, and the other five findings were latent depth no earlier pass had
reached. The loop is not failing to converge on repairs — it is surfacing settlements that were never swept into
the body, which is what the sweep above exists to stop. The terminal-member cluster has now settled on probe, so
the sixth pass is due — and it is the first to run against a body whose load-bearing claims were measured rather
than reasoned, which is the condition the previous five lacked.

---

## Problem / Motivation

Ordinary movement after a member lands can leave a merged member under a reservation with no typed conflict
continuation. The exact-head comparisons that protect delivery are correct; what is missing is any route back when
independent evidence already proves the contribution landed and only the coordinate disagrees.

The originating instance is closed. `evidence-applicability` landed on `main` as `cbf075da7`, its final member
merged at head `841ddb632`, and `arc delivery closeout` refused `terminal-unsettled` because the retained terminal
member still bound reviewed head `57ce62b1d`. An execute-bound Errand retired that residue operationally; the work
unit is shipped and torn down, and `candidate-reroot-recovery-frame` is no longer queued behind it. Only the
instance was fixed. The durable route is this work unit's, and the next stacked landing reaches the same wall.

---

## The failure family

`concurrent-integration-characterization` widened to a second matrix specifically because its first — six
post-execution boundaries by base-movement kind — re-finds none of these failures. They move a bound record's head,
the shape of the history, or a ceremony's own writes, not the base. Seven of its rows resolve here.

Each row below is a recorded observation against base `cbf075da7`, not a claim.

### Shape coverage

This work unit's name skews delivery; its row set does not. **Four of the seven rows are recorded against a
`singleton`** — an ordinary single-request work unit with no delivery plan — and all four are Axis B. Only Axis
A's two rows and Axis D's one are `delivery-member`.

The distribution is not incidental. Axis B's condition is the shape of the history, which a singleton reaches
exactly as readily as a stack, and the most severe row here — the silent base pick — is a singleton row. Two of
the four readers it runs through, the subject collector and the overlap analyzer, serve both shapes, so the
majority of this work unit's value lands on the ordinary case rather than the stacked one.

**Axis A has no singleton row because the singleton path already gets it right.** Retirement containment compares
by ancestry, with `merge-base --is-ancestor` against the pinned base. Delivery terminal settlement asks the same
lifecycle question and compares `request.headSha === terminal.coordinates.head` — raw equality, no ancestry term.
One question, two implementations, and the older one is correct. The relation this design introduces is therefore
not a new concept for the codebase: it is the concept the singleton path already uses, which the delivery path
re-implemented worse.

That equality also sits inside an eight-term conjunction collapsing to a single `terminal-unsettled` reason, so
the refusal is cause-blind as well as ancestry-blind — which is why its remedy can only name a rerun over inputs
that never reach the term that actually failed.

**The risk this creates is in the fix, not the evidence.** Adopt the relation by reader, never by shape. A
delivery-scoped rollout would leave the singleton readers on whichever comparison they happen to carry, which is
how the two implementations diverged in the first place.

### Axis A — a reader compares a bound head with no ancestry term

The rebind verb itself is covered and works: `delivery-terminal-recovery.e2e.test.ts` observes it four ways,
including rebinding stale terminal coordinates to the independently settled current Candidate and renewing
verification for substantive movement past a settled record-only terminal. The matrix marks that cell
not-applicable for exactly that reason, and puts the probe on **the binding's readers** — with the note that this
is why every recorded failure survived that coverage.

- **Public review.** Readiness against a member whose branch advanced past the head its record binds returns
  `invalid` / `delivery-member-unbound`, no remedy. The probe asserts directly that this is the same result the
  same handler returns over a repository carrying no delivery state at all: the comparison is head equality and
  reads no ancestry, so **a stale binding and an absent binding are indistinguishable here**.
- **Closeout.** Against a terminal the host merged at a descendant of the bound head, closeout returns `blocked` /
  `terminal-unsettled` with a remedy directing a rerun over the same work-unit, repository, and remote inputs —
  none of which reaches the binding the comparison actually reads. Recorded `did-not-clear`.

Divergent — non-append-only — head movement is enumerated and closed. Every capture asks for append-only movement
to be recognized and for divergence to stay fail-closed, and none reports divergence being wrongly admitted.

### Axis B — merge-base cardinality is not one, and four readers disagree

One condition, four readers, four behaviours. Three refuse in three vocabularies; the fourth does not refuse.

| Reader                | Mechanism            | Result                                                 |
| --------------------- | -------------------- | ------------------------------------------------------ |
| Whole-WU verification | plain `merge-base`   | silently picks one; nothing records the choice         |
| Prepublication        | Candidate `--all`    | `classification-unavailable / merge-base-ambiguous`    |
| Public review         | sole-base resolver   | untyped throw, surfaced as a blocked obligation detail |
| Landing               | the overlap analyzer | `reconcile`; overlap `unavailable / merge-base-failed` |

- **Whole-WU verification is the severe one.** The collected subject named the base's own change and **omitted the
  branch's commit entirely** — no refusal, no reason, nothing recording that a choice between two ancestors was
  made. A companion case proves the subject digest differs across the two arrangements, and the digest is what
  currentness compares: identical branch work therefore reads as a changed Candidate and the ordinary fallback
  demands a fresh root. That is the mechanism behind the field's roughly 130 removed paths and its demand for a
  full new root over a terminal branch that already contained the landed predecessor. Classified
  `redundant ceremony`, and it is the only cell on this seam that returns a wrong answer rather than a stop.
- **Prepublication refuses the same condition the row above passes through silently.** Both readers are correct
  about the history and disagree about what follows from it: one boundary binds a subject derived from an
  arbitrary choice while the next declines to classify at all.
- **Public review sends the caller back to a checkpoint that already passed.** Status reports `base-moved` /
  `rerun-checkpoint`; the routed obligation reads `blocked` carrying "The Candidate target has no sole base
  coordinate." Nothing about the branch's contribution changed, and the rerun reads the same history and reaches
  the same reading — `did-not-clear`.
- **Landing degrades its evidence, not its verdict.** The drift read returns `reconcile` either way; only the
  overlap under it goes unavailable. That is what makes the consequence a classification failure rather than a
  drift failure — and it becomes a stop one layer up, at the checkpoint's
  `delivery-terminal-blocked / drift-classification-unavailable`.

A base with no common ancestor at all is enumerated and closed: the analyzer already gives it a distinct
`unrelated` status.

### Axis D — post-land suffix settlement composes before it reads the resolution

Replaying a pinned pre-landing contribution onto a landed predecessor returns `contribution-conflicted` naming the
path — and returns the **byte-identical refusal** once the operator resolves that path onto the landed predecessor.

The conflict is composed from three coordinates: the pinned predecessor as merge base, the pinned member, and the
observed landed predecessor. The resolved member head is consulted only after composition succeeds, so it cannot
affect a composition that conflicts. The probe proves the directed action is not an input to the outcome.

This sharpens the field record rather than repeating it. That record attributed the dead end to an external stack
rebase being unable to change the pinned replay; the pinned side is only half of it. The replay's other endpoint
does follow the operator, and still cannot help, because the conflict is decided before that endpoint is read.

The refusal is classified `fail-closed, correct` and is deliberately unpinned — a hand-resolved suffix is not a
mechanical reapply, and the proof is right not to call it one. **The defect is one layer up, at
`native-landing.ts`**, where the settlement wraps this result in guidance directing the operator to resolve the
listed paths and rerun `arc delivery native land-status`. That text names a remedy the row proves cannot clear it.
It is not covered by the in-flight drift-remedy Errand, whose sites are the integration checkpoint, its advisory
register, the drift continuation, and teardown.

**Source confirms what the probe measured, and shows why.** `proveGitDeliveryContribution` reaches its verdict
through `readMergeTreeComposition` on `(before.predecessor.head, after.predecessor.head, before.member.head)` —
the pre-landing predecessor as merge base, the landed predecessor, and the pre-landing member. The observed
member head reaches only the tree comparison that runs _after_ a clean composition. The invariance is structural,
not incidental: no act of the operator is an input to the composition that refuses them.

**The completing input has a name, and ARC has built half of it.** It is not the operator's resolution — it is
the operator's **acceptance** of a movement ARC cannot prove, which is exactly what the provider path obtains
through `conflict-resolution-required`. The obtaining half is adoptable as it stands; the discharging half is
gated on a selection referent this path does not have. § What the record may carry reads both from source.

The same guidance line is wrong a second way, and the fix is one arm wider than first recorded. Four of this
function's refusal arms omit "Keep the reservation", and **two of them share the shape**: the suffix-proof arm
above, and the terminal-absorption arm, which emits "Resolve the listed top absorption paths, then rerun" on a
`content-conflict` from `absorbTop`. An implementer taking the earlier wording literally would fix one and
leave its twin.

**The absorption arm is taken into scope by the Owner, 2026-09-16.** The recovery protocol as adopted reaches
only the member suffix: `changedDeliveryProviderRefreshMovements` derives its movements from snapshot _members_
(`suffix-reconciliation.ts:194-204`), and `collectDeliveryProviderRefreshConflicts` builds the conflict set from
those. `absorbTop`'s `content-conflict` is a structurally separate refusal at `native-landing.ts:993-1001`, so a
member-only protocol leaves the terminal collision emitting a remedy nothing can clear — the failure this work
unit is named for. The capture requires both halves: approved successor **and top** resolutions.

**The separate terminal top is durable surface, not a bridge.** It is the current shape because native stack
composition without a separate top member depends on `strategy-storage-evolution` and `arc-backend`, neither of
which has landed. It stays a supported configuration afterward, for projects that do not maintain a separate
backing repository. Its conflict recovery is therefore designed as a permanent path, and the proportionality
trace runs to a configuration ARC intends to keep rather than to a workaround it intends to retire.

**The probe ran, and returned a third outcome neither branch anticipated.** The composition is invariant, as the
suffix arm's is — and a complete recovery route nevertheless exists, one layer above the composition and unnamed
by the guidance.

**The composition side is Axis D's twin.** `reconcileLinkedNativeDeliverySuffix` builds the call from three
coordinates, and the operator's resolved top is none of them: the merge base is `beforeSuffix.at(-1).coordinates`
(the recorded before-state), `top` is `input.landed.value.members.at(-1).coordinates` (recorded state, never
re-observed), and only `highestMember` is live — and it follows the host's landing, not the operator.
`absorbGitDeliveryChain` composes exactly those under `merge-tree --write-tree --merge-base`. The existing
conflict test seals it: after the refusal, HEAD is pinned at `top` and the worktree is clean, so there is nothing
staged for the operator to "resolve the listed paths" in.

**The escape is an adoption branch that runs before the composition.** When HEAD has left `top.head`,
`observeExactAbsorption` accepts it whenever `rev-list --parents -n 1 HEAD` is exactly
`<head> <top.head> <highestMember.head>` and the worktree is clean — **on the parent pair alone, with any tree**.
An operator who merges the refreshed predecessor by hand and commits produces precisely that shape, so the
settlement succeeds and writes their tree into the terminal coordinate. Measured rather than reasoned: the
planning probe drives the whole sequence against a scratch repository, and the hand merge is adopted even though
Git resolved it against a different merge base than the absorption composes against.

**So the arm is recoverable today, and the guidance is wrong in three separate ways.** Resolving the listed paths
in the worktree and rerunning returns the byte-identical refusal; committing the resolution as an ordinary
single-parent commit returns the _different_ `top-moved` refusal; and the merge parent the operator actually
needs — `highestMember.head` — is never disclosed by the refusal at all.

**What it costs is the marker this design was hunting.** The adopted tree is never proved anywhere downstream —
the integration checkpoint's residual proof takes the Candidate as both of its member endpoints, so the absorbed
commit is not one of its subjects. That is the residual proof only: the checkpoint's other two readers do reach
the absorbed head, and both refuse it — § Continuity carries them. What the terminal member lacks is not a gate
but a _record_: the acceptance channel it already carries is untyped and unrecorded. That reframed the structural
item then open: the question was never how to invent a waiver for the terminal member, but how to type the
acceptance that already happens.

---

## What the field record got wrong

Recorded so an implementer starting from the origin captures does not inherit these.

- **"Three of the four loci are one ambiguity at three verbs."** Four verbs. The fourth is whole-WU verification,
  and it is the one that does not refuse.
- **Locus 2 attributed the fresh-root demand to the `attest` fallback.** The fallback behaves correctly on the
  subject it is given; the arbitrary ancestor choice upstream is what makes that subject wrong.
- **The post-land capture asks for a durable re-enterable settlement as though the replay were the defect.** The
  replay's refusal is correct. The narrower true defects are the guidance text and the absence of any completing
  input.
- **The origin captures frame loci 3 and 4 as needing a recovery route to be invented.** The rebind verb exists,
  is covered, and works. The gap is that the readers refuse without offering it.
- **The posture said "live and currently blocking."** The instance was retired by its Errand before this session.

---

## Reader inventory — derived by sweep

Re-derived 2026-09-16 after two successive undercounts. The label changed deliberately: `source-verified` was
claimed twice over a table that was short both times, so the method is recorded instead of the assurance.

```sh
grep -rn '"merge-base"' packages/arc-framework/src --include=*.ts \
  | grep -v __tests__ | grep -v is-ancestor | grep -v independent
```

That returns sixteen hits at **fifteen distinct call sites** (one site contributes both its invocation and its
error-reporting args). **Seven pick silently** — no `--all`, one of N bases taken as the answer. Every reader
resolves its base independently; there is no shared primitive today.

| Locus                                      | Call                   | Disposition                            |
| ------------------------------------------ | ---------------------- | -------------------------------------- |
| `git-candidate-subject.ts`                 | `merge-base` (no flag) | silent pick — Axis B's wrong answer    |
| `repository-target.ts`                     | `merge-base` (no flag) | silent pick — review diff base         |
| `git-candidate-applicability.ts`           | `merge-base --all`     | typed `merge-base-ambiguous`           |
| `git-candidate-effective-target.ts`        | `merge-base --all`     | untyped `throw` — Axis B's fourth verb |
| `base-overlap.ts`                          | `merge-base --all`     | `unavailable / merge-base-failed`      |
| `git-contribution-proof.ts`                | `merge-base --all`     | `null` — endpoints-unverified          |
| `git-review-contribution-applicability.ts` | `merge-base --all`     | typed `merge-base-ambiguous`           |
| `git-decompose-v3-repository-plan.ts`      | `merge-base --all`     | typed `ambiguous-merge-base`           |
| `git-decompose-v3-retirement-delta.ts`     | `merge-base --all`     | typed `ambiguous-merge-base`           |

Five further silent picks sit outside this work unit's concerns and are listed for the sweep's completeness
rather than for treatment: `identity-transaction.ts`, `from-branch.ts`, `github-refresh.ts` (one of its two),
`committed-progress.ts`, and `hosted-reservation-discharge.ts`. `github-refresh.ts` also carries an `--all` site.

The untyped throw carries "The Candidate target has no sole base coordinate." — the same string the ledger records
as a blocked obligation's `detail`, confirming the surfaced message is an exception text rather than a result.

**`repository-target.ts` is taken into scope, and it is the strongest trace in the table.** Its silently picked
base becomes `diffBaseSha` and `diffBaseTree` — the local review host's diff base. That value is review-target
_identity_: it is asserted in the gate's identity module, compared on admission, and the reviewed change set is
computed as `base..head` from it. So a silent pick here means the review examined the wrong change set, which is
this draft's own central argument about silent picks landing on the review-evidence surface itself. It carries no
probe row, which is why the earlier scope line excluded it; the Owner scoped it in on the argument instead,
2026-09-16. Its refusal channel already exists — the function throws a closed-union derivation error on this
line today — and the base-merge remedy reaches it, because it compares a `(head, base)` pair.

**`git-review-contribution-applicability.ts` is a near-twin of Candidate applicability**, asking the same
"how has the base moved under my pinned prior" question over `(priorHead, currentBase)` under the same typed
reason. § Resolver or relation now carries it, the proof gate, and the review host's diff base.

The two decomposition sites remain outside: they reached the same read-all-then-refuse shape independently, under
a third spelling of the reason code, with no observed failure behind either. Fifteen call sites, five
dispositions, three spellings of the reason and one refusal that never names it. Whatever is settled here is
settling a repetition ARC already carries, not introducing an abstraction it lacks.

### Resolver or relation

Classified 2026-09-16 and **re-classified after an adversarial pass falsified the first attempt**. The first
reading split these readers into membership questions and relation questions, and sent the two path-selecting
readers down a commit-derived route that removed their need for a base. That was wrong, and the way it was wrong
is recorded here because the correction is the design.

| Reader                                     | Question it asks                            | Needs                 |
| ------------------------------------------ | ------------------------------------------- | --------------------- |
| `git-candidate-subject.ts`                 | what content did I contribute               | the base resolver     |
| `base-overlap.ts`                          | do both sides change the same content       | the base resolver     |
| `git-candidate-effective-target.ts`        | which single base coordinate do I record    | the base resolver     |
| `git-contribution-proof.ts`                | which single predecessor do I prove against | the base resolver     |
| `repository-target.ts`                     | which single base defines the change set    | the base resolver     |
| `git-candidate-applicability.ts`           | how has the base moved under my baseline    | the relation          |
| `git-review-contribution-applicability.ts` | the same, under my pinned prior             | the relation          |
| review readiness                           | is the bound head still the observed one    | lookup, then relation |
| closeout                                   | is the bound head still the observed one    | the relation          |

**Why the commit-derived route failed.** Paths derived from a branch's own commits are cardinality-independent,
which is what made the route attractive. But a branch contributes content relative to a base, and after the base
is merged in, keeping the branch's side of a path the base changed is a substantive contribution that no
branch-side commit records on its own. Every commit-derived mode either misses it or admits the base's own
changes — demonstrated in a scratch repository, with the merge carrying the reversion rather than a commit after
it. That is the omission class § Established practice raises above every other row, reachable **by design**
rather than by hostility, because this design names merging the base in as its cardinality remedy.

**The subject was on the right side of Git's line all along.** It asks a content question and answers it with a
content tool; what it lacked was cardinality handling, not a different question. The correction is therefore the
smallest one available: read the base with `--all` and refuse typed when the count is not one, which is what
three of these readers already do. Under that rule the base-relative diff is well defined, because the ambiguity
it was fragile to has been refused rather than silently resolved.

**Five readers want the shared base resolver; four want the relation.** The resolver is read-all,
refuse-on-more-than-one, then diff or record from the single base. It is not a new primitive — it is the shape
`base-overlap.ts` and `git-candidate-effective-target.ts` already implement separately, and the one the
decomposition call sites reached independently under a third spelling.

**The last three rows were added 2026-09-16 after a pass found them unallocated**, and the split they join is
unchanged — what was wrong was the arithmetic, for the third time in this draft's inventories.
`git-review-contribution-applicability.ts` asks Candidate applicability's question over `(priorHead,
currentBase)` under the same typed reason, so it lands where its twin does. `git-contribution-proof.ts` and
`repository-target.ts` each need one base coordinate to consume — a predecessor to compose against, a base to
define `base..head` — so both take the resolver. Only `repository-target.ts` is in scope by a traced need; the
other two are listed so the allocation is complete, not so this work unit converts them.

**The staged arm follows the same rule.** When the subject collector is given no revision it compares the index
against the base, and that arm is live: `git-candidate-effective-target.ts` takes it whenever no target is
supplied and feeds the result into Candidate currentness. It needs the identical treatment — resolve with
`--all`, refuse on more than one, else diff the index against the single base. Its probe is now pinned: the
existing pin exercises only the committed arm and would otherwise have retired green over an untouched silent
pick. § Pinned probes.

**What the resolver does not settle** is the coordinate obligation under cardinality above one. No consumer can
take a base _set_ — reading tree entries needs one ref and rematerialization needs one predecessor — so the
base-set arm is dead and the coordinate readers refuse. Only Candidate applicability carries cardinality onward,
as a field on the diverged variant, because it alone consumes the relation rather than a coordinate.

`lib/git/ancestry.ts` is the correctly-named home and already wraps `merge-base --independent` — but it holds
only candidate-set reduction (`filterCommitsReachableFromHead`, `reduceCommitsToCausallyMaximal`) and no
ordered-pair read at all. The `--is-ancestor` primitive lives in
`lib/work-unit/git-decomposition-object-readers.ts` and is re-rolled eighteen places beside it. Placing both
primitives there is a move, not an extension.

**Scope line on the repetition.** The readers carrying this work unit's rows have observed failures behind them
and are in scope. The two decomposition call sites do not; unifying them would be symmetry rather than a traced
need, so the shared primitives should be _available_ to them without this work unit retrofitting them.

## The movement substrate — three things under one name

Settled 2026-09-16 against source. The question is usually posed as _whether the relation replaces
`terminalAuthoringMovement`, sits beside it, or takes it as a policy layer_ — and all three readings share a
premise source does not support: that the thing is a movement classification. It is not one. The name covers
three separate things.

| The name covers       | Where                                | What it is                                           |
| --------------------- | ------------------------------------ | ---------------------------------------------------- |
| an observation option | `delivery-position-facts.ts:56`      | admission policy — two values, set at two call sites |
| a produced fact       | `schema.ts:195-200`                  | a lease proof, carrying `publicationLeaseHead`       |
| an operation field    | `schema.ts:323` / `operation.ts:206` | durable state on the `rewrite` arm                   |

The option is set at `delivery-execution.ts:4248,4251`, keyed on the observation `mode`: `terminal-remedy` takes
`allow-append-only-frozen-request`, the four review-fix modes take `allow-append-only`, and every other mode
passes nothing. The fact is produced only at the terminal index and only when the option is present, and its
distinguishing content is `publicationLeaseHead` — the intermediate published head. No ancestry relation carries
that, and none should.

**What classifies sits one layer down.** `observeTarget` and `observeMember` reach `readAncestry` three times,
and that call — `merge-base --is-ancestor`, returning `ancestor` / `not-ancestor` / `unresolvable` — is the whole
of the classification the option gates. So the relation belongs beneath `terminalAuthoringMovement`, at the layer
§ Shape already assigns to the thin reader: one direction per call, classifier above.

**Relation and option are different axes, and folding them is the error the question invited.** The relation says
what the movement is; the option says whether this observation mode admits it. `terminalAuthoringMovement` is
therefore a consumer rather than a peer, and the three postures collapse together — nothing replaces it, nothing
layers over it, and the admission policy stays exactly where it is.

**Axis A unifies on the relation, and this is not its vehicle.** Review readiness and closeout have no exactness
gate and no option to set; they compare heads and want the ancestry term, which they take from the relation
directly. § Resolver or relation's three relation readers therefore stand unchanged, and
`terminalAuthoringMovement`'s own reads are not converted here. Those reads keep `unchanged` and `advanced` —
`observeTarget` answers `"exact"` and `"append-only"` — and turn everything else into one refusal, so the only
thing conversion would add is a reason for that refusal. That is precisely the defect routed out below, not a
distinction this design owes.

### Three consumers, three postures — and what each actually reads

The characterization's recorded disagreement is real; what changes is its explanation.

- **The position verb** passes `allow-append-only`, then refuses on the fact's presence with
  `review-fix-routing-required` / `nextAction: "plan-review-fix"`. That is a routing signal rather than a stop,
  and it is the shape the other two surfaces want.
- **Session-init** passes no options at all — `status.ts:1100` calls the observer with dependencies and no policy
  argument, so the strictest posture is the default for the surface that only reads. An in-flight Errand owns
  that call site.
- **Review readiness and closeout** read head equality with no ancestry term, so neither the option nor the fact
  ever reaches them. They are the Axis A rows, and the relation is what they are missing.

**One defect surfaced under this read and is routed out rather than taken.** `DeliveryPositionObservation`'s
refused arm is `{ status: "refused" }` with no reason field, so every internal refusal in `observeMember` and
`observeFacts` reaches `readDeliveryPositionView` as the single reason `observation-unavailable` — a proven
terminal rewrite, an ancestry read Git could not answer, an unreachable host, and a benign append-only advance
all arrive as one word. It is the Axis A collapse one layer out, it carries no probe row here, and
`operational-advisory-registers` owns richer diagnostics at that boundary already.

---

## Established practice

Surveyed 2026-09-16 against three questions this design turns on, primary sources preferred. Two results are
decisive, one closes an open question, and two candidate arms are eliminated.

### Cardinality is a refinement of divergence, not a second axis

Verified here rather than taken on report. If X is an ancestor of Y then X is itself a common ancestor of the
pair, and every other common ancestor is an ancestor of X — so X uniquely dominates and `merge-base --all`
returns exactly one. Cardinality above one therefore implies neither revision reaches the other. Confirmed
empirically: an ancestor/descendant pair returns one base, a criss-cross returns two with neither side an
ancestor of the other.

**This settles the resolver fork.** Axis B's condition is reachable only inside Axis A's diverged outcome, so the
two are not parallel mechanisms waiting to be unified by preference. One relation-typed read answers both,
carrying base cardinality and its consequences as fields on the diverged variant. Two independent primitives
would each have to re-derive the same reachability to know whether the second even applies.

### Git draws a line here, and the lesson is narrower than it first appears

`git log A...B` is defined as `r1 r2 --not $(git merge-base --all r1 r2)` — commit-set membership computed
against every base, cardinality-independent by construction. `git diff A...B` is defined as
`git diff $(git merge-base A B) B` — a tree diff against one arbitrary base, cardinality-fragile. Git answers
"which commits are mine" safely and "what content changed" fragilely, and documents both.

**The tempting inference from that is wrong, and this draft made it before correcting it.** The fragility is in
`merge-base` picking arbitrarily, not in asking a content question. A reader that genuinely asks what content it
contributed cannot be rescued by switching to the membership form: § Reader inventory records the case that
breaks it, where a branch's contribution is the retention of its own side of a path the base changed and no
branch-side commit carries it. What Git's line actually licenses is narrower — resolve the base with `--all` and
refuse when the count is not one, and the content form is then exactly as sound as the membership form.

### The silent pick is a recognized vulnerability class, not a rough edge

Azure DevOps detects multiple merge bases per pull request and surfaces "Multiple merge bases detected. The list
of commits displayed might be incomplete", framing it as security awareness: the single-base diff can be abused
so that changes present in the branch are absent from the review surface, creating "treacherous logic gaps".
GitLab carries an open issue for the same defect, where its diff view and its code-owner-approval calculation can
pick different bases.

ARC's exposure is the same shape and lands on evidence rather than a UI: the subject digest feeds Candidate
currentness and review applicability, so a silently-chosen base produces review evidence that omits changes. That
raises the whole-WU verification row above the other three rather than leaving it one of four.

### Arms eliminated

- **Union or intersection of changed paths across all bases** — no precedent, and the arithmetic defeats it. The
  diff from one base necessarily contains the other base's own changes, so requiring agreement refuses in
  essentially every real criss-cross. It is "refuse whenever cardinality exceeds one" in a selective-looking
  disguise.
- **A synthesized virtual base** — Git's own merge strategy, but merge-producing: it commits to an answer.
  Mercurial rejected it deliberately in favour of bid merge, recording that a virtual ancestor can make
  already-resolved conflicts reappear and reversed changes oscillate. It does not fit a read-only classification.
- **Refusing on disagreement across all bases** — defensible, but not idiom. Mercurial's bid merge prefers
  unanimity and degrades to majority; Azure and GitLab disclose rather than refuse. Prepublication may keep this
  as a deliberately stricter local policy, provided it is not claimed as established practice.

### Comparing a bound coordinate: add a term, never relax the lock

Git keeps exact equality at the layer that must not weaken — `update-ref`'s `old-oid` precondition — and adds
reachability above it. Its transaction outcomes stay textually distinct for a ref that already exists, a ref
missing but expected, and a ref at an unexpected value. Git does not collapse absent into changed at any layer.
This work unit's readiness reader does.

`--force-if-includes` is the nearest precedent: Git had an equality lease, found it defeated by a compatible
advance it could not see through, and closed the gap by adding a reachability check **on top of** the lease
rather than loosening it. `%(upstream:track)` then carries the vocabulary in porcelain — up to date, ahead,
behind, ahead and behind, upstream gone, and no upstream configured — the distinctions needed here, already
shipped and already separate from the write-time check.

There is no canonical name for the combined result type. The nearest named vocabulary is Git's own
fast-forward / non-fast-forward and the version-vector lineage's _descends_ versus _concurrent_, which Dynamo
splits as syntactic against semantic reconciliation. Adopt the shape and the layering; the type is ours to name.

### Gerrit types what ARC hand-rolls

Verified against Gerrit's own source and current documentation 2026-09-16.

Gerrit classifies every new patch set by `ChangeKind`, which carries six values: `NO_CHANGE`, `NO_CODE_CHANGE`,
`TRIVIAL_REBASE`, `TRIVIAL_REBASE_WITH_MESSAGE_UPDATE`, `MERGE_FIRST_PARENT_UPDATE`, and `REWORK`. They form a
hierarchy — a more trivial kind also satisfies a query for a less trivial one — and `changekind:REWORK` is
documented as equivalent to `is:ANY`, making it the catch-all rather than a selective filter. The kind is computed
by comparing the new tree against what cherry-picking the prior commit onto the new parent would produce, with a
separate delta check and a commit-message comparison. The repository's merge strategy is an input, so it is
deterministic given fixed commits _and_ fixed configuration, not from commit content alone.

`copyCondition` is the per-label query deciding which approvals survive a new patch set. Two defaults matter, and
they are different things:

- **Gerrit core with no `copyCondition` configured** — nothing is copied, for any change kind; the evaluation is
  skipped outright.
- **A stock install's own project config** — Code-Review carries
  `changekind:NO_CHANGE OR changekind:TRIVIAL_REBASE OR is:MIN`, and Verified carries
  `changekind:NO_CHANGE OR changekind:NO_CODE_CHANGE`.

So a rework inherits no positive review, **but a standing minimum score survives it**, because `is:MIN` is
change-kind-agnostic. That asymmetry is the precedent worth taking, and it is a sharper one than a blanket
"nothing carries": the signal that survives arbitrary movement is the fail-closed one, and only that one. A veto
persists until it is answered; an approval does not outlive the thing it approved.

What ARC has in place of this is an observation-mode flag three consumers read three ways. The intent matches;
the typing and the explicit policy layer are what is missing.

**What the survey says about an operator escape hatch, read carefully.** Surveyed 2026-09-16 across Gerrit,
GitHub, GitLab, Phabricator, Gitea, Graphite, and Zuul. No system offers a typed per-change "prior review still
covers this" record — and the first reading of that, that ARC should not offer one either, does not survive
looking at what the mechanisms actually require. Dropping an approval **invalidates a record; it does not demand
evidence.** A Gerrit reviewer may re-vote on a `REWORK` having opened nothing; GitHub and GitLab both restore an
approval in one click. The unconstrained human re-assertion is universal, and it is the same function an Owner
acceptance performs — ARC's version simply records who did it and binds it to digests that die on rewrite, which
none of them do.

**So the rule that generalizes is about automatic carry, not about override.** The `is:MIN` asymmetry is its
sharpest form: the fail-closed signal survives arbitrary movement and the permissive one never carries itself.
An acceptance must therefore be a fresh, attributed act each time — which is what an `applicability-selection`
already is, and what an automatically-copied approval is not.

**Phabricator is the cautionary case, and the lesson is discrimination rather than abstinence.**
`differential.sticky-accept` defaults true, carrying an accept across **any** update including a full rework, and
its history records silent staleness defects. What makes it unsafe is that it never distinguishes a trivial
update from a reworked one. ARC discriminates first — `subject-equality`, `tree-equality`, `mechanical-reapply`
all pass silently — and reaches for a person only where discrimination fails, which is the opposite posture.

**One convergence worth recording.** GitLab resets approvals by comparing `git patch-id`, so a rebase that
preserves the patch survives and a conflict-resolved one does not. That is functionally this design's
`tree-equality` / `mechanical-reapply` fast paths reached independently, which is corroboration for the
classifier rather than something to adopt.

**Why the names diverge, recorded so the divergence reads as considered.** ARC's `subject-equality` /
`tree-equality` / `mechanical-reapply` and Gerrit's `NO_CHANGE` / `NO_CODE_CHANGE` / `TRIVIAL_REBASE` coincide
case for case, and they are still not the same vocabulary: ARC's values name **the proof that was found**,
Gerrit's name **the kind of change observed**. The distinction is not cosmetic here, because every neighbouring
value in this subsystem is proof-shaped — the contribution proof, the residual proof, the relation's own reader
result — so a classification-shaped name would misdescribe what the value is and what produced it. Gerrit's set
also carries two commitments worth declining: `REWORK` is documented as equivalent to `is:ANY`, a catch-all
rather than a classification, and `TRIVIAL_REBASE_WITH_MESSAGE_UPDATE` and `MERGE_FIRST_PARENT_UPDATE` presuppose
patch sets and commit messages as the review unit where ARC's unit is a Candidate subject.

What ARC does take from Gerrit is the part that carries: its **definition** of the boundary — a rebase that
required Git to resolve a conflict is not trivial — which this design reuses verbatim as the meaning of _not
mechanically derivable_. Borrow the predicate, decline the labels.

### Axis D: the refusal is the industry boundary

No surveyed system — GitHub, Gerrit, Graphite, Zuul, bors, or Google's tooling — consumes an operator's
out-of-band conflict resolution back into a pinned mechanical replay. The universal pattern is to stop, evict,
and require a new artifact that re-enters verification. Gerrit's most conflict-tolerant primitive is its rebase
with conflicts allowed, which produces a patch set whose files carry Git conflict markers and reports that fact
back through `containsGitConflicts`; a human still has to resolve the markers in a further patch set, and it
cannot be combined with rebasing on behalf of the uploader, precisely so unseen conflict edits are never treated
as approved. The pinned replay's byte-identical refusal is therefore the standard boundary rather than a defect,
and the remaining question is not whether to consume the resolution but what this work unit's new-contribution
path looks like. Gerrit's change-kind and copy-condition model is the fullest precedent for how much prior
verification such a contribution inherits — no positive review, with a standing veto surviving. **That a
conflict-resolved rebase classifies as `REWORK` is documented rather than derived**, corrected 2026-09-16:
`TRIVIAL_REBASE` is defined to exclude a rebase that "required git to perform any conflict resolution", so the
exclusion is the classifier's own rule. It is also the cleanest public definition of _not mechanically derivable_
and is worth reusing as one.

`git rerere` is the one mechanism that carries a resolution across a moved base — it fingerprints normalized
conflict hunks rather than commit identity, so it is base-agnostic by construction. It is also local, opt-in, and
consulted only inside Git's own three-way merge; no server-side queue reads it. Recorded as considered and
inapplicable rather than unexamined. Jujutsu's structural conflict propagation is the same note from the other
side: real prior art, single-repository, with no review or landing system built on it.

### Merge-queue composition — the mechanism, and what does not follow from it

GitHub's merge queue builds a temporary branch carrying the base plus every queued request ahead of the
subject, and lands that. The landed commit is structurally not the request's own head.

**The stronger reading of that fact does not survive source.** Both affected readers compare a _change-request_
head rather than the landed commit — `retirement.ts` tests `request.headSha === terminal.coordinates.head`, and
review readiness reads `request.pullRequest.headSha` — so a queue that leaves the request's own head alone is
orthogonal to this comparison, and it does not follow that such a project would meet `delivery-member-unbound`
on every landing. What remains true is the constraint in § Boundaries: whatever replaces the equality comparison
must not assume the landed head is the head ARC bound, because a rebase-style submit strategy does move the
request head. Whether any given queue configuration does so is unverified, and no probe covers an external
mover.

## The relation

Authored 2026-09-16 against the layering § Established practice establishes: exact equality preserved at the
write boundary, reachability added above it.

### ARC already computes this, once, by hand

`scripts/base/merge.ts` derives the relation inline, in exactly that layering. `endpointMovement` holds the
equality check first; two directional `merge-base --is-ancestor` reads then add reachability above it, and the
two directions select three outcomes that already carry distinct next actions:

| Directional read                | State                    | Next action          |
| ------------------------------- | ------------------------ | -------------------- |
| bound base reaches the head     | `skipped-clean`          | `continue-reconcile` |
| the head reaches the bound base | `head-contained-by-base` | `rerun-checkpoint`   |
| neither                         | falls through to merge   | —                    |

Three of the distinctions this design needs, already computed, already separated by remedy. The relation is
ARC-internal precedent as well as Git's, and the work here is extraction rather than invention. § The failure
family already recorded the other half of that: retirement containment compares by ancestry while delivery
terminal settlement compares by equality.

**Extraction is also the only available composition.** A non-test sweep returns nineteen `--is-ancestor`
invocation sites across eighteen files, each behind its own helper, and no two agree on a return shape —
`boolean` in `from-branch.ts`, `branch-bounded-notes-export.ts`, and `in-flight-derivation.ts`;
`"ancestor" | "not-ancestor" | "unavailable"` in `chain-containment.ts`; `"ancestor" | "not-ancestor" | null` in
`git-contribution-proof.ts`; an injected predicate port in `scripts/base/merge.ts`.

```sh
grep -rn -- '--is-ancestor' packages/arc-framework/src --include=*.ts \
  | grep -v __tests__ | grep -v 'command: "git", args:'
```

They also split across three executor shapes: `GitExec`, `RawGitExec` with `objectAccess: "local-only"`, and the
review gate's own injected ports. No existing helper is consumable by all three relation readers, which is what
makes a shared primitive composition rather than new mechanism.

**The third value is the measured defect, and it is worse than "several".** Exactly one of the nineteen names a
third value in its own type — `git-decomposition-object-readers.ts`'s `GitAncestryResult`. Eight collapse an
operational failure into "not an ancestor" through a bare `catch`, so a read Git could not answer becomes a
verdict. The remaining ten each invent a local third channel — a `null`, a rethrow, a fallback branch — and no
two agree on which. That is § The variants' `unknown` argument counted rather than asserted; three of the eight
were re-read by hand to confirm the classifier.

**Four sites already read both directions and derive this relation by hand**, each under its own return type
and vocabulary: `scripts/base/merge.ts` to decide whether a base merge is needed, `in-flight-derivation.ts` to
order two candidates, `push-fetch.ts` to choose between fast-forward and refusal on a notes ref, and
`sync-status.ts` to classify a local ref against its fetched remote. None of them names the thing it computes.
Four independent derivations of one relation is the repetition this design ends, and it is a stronger warrant
than the single-site precedent alone.

**Two more derive it partially, and both lose `rewound` doing it.** Both are inside delivery. `observeTarget`
(`delivery-position-facts.ts:122-139`) takes equality plus one direction and answers `"exact"` / `"append-only"` /
`null`, so a rewound target, a diverged target, and an object Git could not read are one value.
`predecessorRelation` (`lib/delivery/predecessor-relation.ts`) takes one direction plus path overlap and answers
`exact | disjoint-ahead | overlapping-ahead | unrelated`, collapsing `unchanged` and `advanced` into `exact` and
refining the other side by overlap instead of by ancestry. Neither is a competitor: each wants the relation
underneath it and keeps its own refinement above. `predecessorRelation` is also the vocabulary collision
§ Continuity's open item now carries.

### The variants

Anchored on `%(upstream:track)`'s shipped vocabulary and on `merge.ts`'s existing state names. **The naming is
proposed, not settled**; the six distinctions are.

| Variant     | Holds when                               | Git's name       | Consumer consequence                        |
| ----------- | ---------------------------------------- | ---------------- | ------------------------------------------- |
| `unchanged` | observed head equals the bound head      | up to date       | proceed — today's equality check, preserved |
| `advanced`  | the bound head reaches the observed head | ahead            | the movement Axis A must admit              |
| `rewound`   | the observed head reaches the bound head | behind           | the record is ahead of reality              |
| `diverged`  | neither reaches the other                | ahead and behind | fail-closed; carries base cardinality       |
| `absent`    | no record binds this subject at all      | gone             | today's answer for a stale binding          |
| `unknown`   | the ancestry read did not establish one  | —                | stop; never collapses into a verdict        |

Two of these are the whole Axis A defect. `advanced` and `absent` are today indistinguishable at review
readiness, which is what the pinned probe records; separating them is the fix.

**Cardinality is a field on `diverged`, not a variant.** § Established practice proves cardinality above one is
reachable only when neither revision reaches the other, so a variant would place it beside a case it lives
inside. Applicability is its only consumer; the other readers neither ask nor branch on it.

**`unknown` never collapses.** Git keeps a ref that is missing from a ref at an unexpected value; ARC's
addition is that an ancestry read which failed operationally is a third thing again. The hand-rolled helpers
disagree here specifically — several return `false` for a failed read, which reads as "not an ancestor" and is
how an operational failure becomes a verdict.

**Two of the six are not relations, and the contract says so.** Two directional ancestry answers span exactly
four states — `unchanged`, `advanced`, `rewound`, `diverged`. `absent` has no bound revision to compare, so the
classifier cannot be called at all; `unknown` is a read-availability outcome the reader produces. **The contract is
a four-variant relation wrapped in a reader result**, not a flat six-variant union. Settled 2026-09-16, on three
things already in this draft rather than on preference.

- The settled readiness route gives its lookup four arms — not-in-plan, in-plan-unbound, bound, unavailable — so
  `absent` and `unavailable` are already lookup outcomes. A flat union would represent the same fact in two places
  and leave which one is authoritative undecided.
- § Forward-compatibility's adopted constraint gives every variant a typed remedy action. Under the wrapped shape
  `absent` and `unknown` carry theirs on the reader result, which is the layer that produces them and therefore
  the layer that knows the remedy.
- `predecessor-relation.ts:24-26` ships this exact shape in this subsystem today —
  `{ status: "resolved"; relation } | { status: "unavailable"; detail }` over a four-variant relation. The flat
  union would put two incompatible contracts on one seam.

What stays open is the word for `rewound` and the vocabulary collision with that neighbour, not the shape. That
is a naming choice rather than a structural one, and it propagates into every typed remedy dispatch. The
distinctions stand either way.

### Shape

Two layers. A **pure classifier** takes the two directional answers and the base cardinality and returns the
variant — no Git dependency, so the variant logic is exhaustively testable without a repository, which is what
every hand-rolled helper above gave up. A **thin reader per executor** supplies those answers over whatever
executor its consumer already holds.

**The executor plurality is not an obstacle here, and the design should not claim credit for absorbing one.**
`GitExec` and `RawGitExec` differ in one real way — `RawGitExec` returns `Uint8Array` for commands whose
NUL-framed output must survive as bytes, which is what lets applicability's strict decoder detect malformed
path evidence. That distinction is essential and this work unit should not collapse it. It is also irrelevant
to this primitive: `merge-base --is-ancestor` writes no stdout and answers through its exit code, so every
executor already supplies everything the reader needs and each adapter is a few lines. The split earns its
place on the two reasons below, not on absorbing an executor difference the predicate never touches.

The classifier is pure, so every variant is reachable in a test without constructing a repository state that
produces it. And the reader is the only layer that can produce `unknown` honestly: it knows whether Git
answered, so the classifier never has to invent a verdict for an answer it did not get. That is precisely the
failure recorded below — the collapse happens where the exit code is read, which is the layer this design
makes a single one.

### Readiness reads its key backwards

Source-verified 2026-09-16. This is a design consequence the reader inventory did not carry, and it changes
what the readiness fix is.

`readiness.ts` resolves its member with `resolveMemberByHead(request.pullRequest.headSha)`, and every
production member lookup is keyed the same way: `DeliveryMemberSelector` has a `head` arm and a `ref` arm, and
`stateMemberMatches` requires `member.coordinates.head` to equal the observed head on **both**. The `ref` arm
conjoins rather than compares, has zero production constructors, and an integration test deliberately pins
that a correct head under a wrong ref resolves to nothing — so the conjunction is intended, not accidental.

The consequence: **a moved head does not mismatch, it misses.** No member is found, so there is no bound
coordinate to compare and the relation cannot be computed at this reader at all. Adding an ancestry term to a
comparison that never runs would change nothing.

The fix is an inversion the reader already has the inputs for. Its vehicle carries `planId`, `deliverableId`,
and `workUnitSlug`, and the code resolves by head and then _validates_ those three against the result. Resolve
by the identity it already holds, then compare the recorded head against the observed one with the relation:
the same two facts, in the order that can tell a stale binding from an absent one.

**That order is the review gate's own, and readiness is its outlier.** `sameDeliveryReviewMemberVehicle` is
`sameDeliveryReviewMemberIdentity(…) && expected.head === actual.head` — identity first, head second — and
`status.ts` and `hosted-reservation-admission.ts` both resolve that way across head movement. Its head term is
the one equality this design replaces with the relation everywhere else, so the inversion conforms readiness to
an established in-subsystem shape rather than introducing one.

**It is not free, and an earlier pass of this draft said it was.** `DeliveryMemberLookup` exposes exactly one
method and it is head-keyed, and neither `DeliveryMemberSelector` arm keys on the deliverable — so the inversion
needs a lookup route that does not exist today. Three were available; the route is now settled, and the reasoning
matters more than the choice.

**`resolveDischargeTargets` is eliminated because it relocates the defect.** Its loop refuses `unavailable` for
the whole enumeration when any member carries a null `changeRequest` or null `coordinates` — not only the member
asked about — so on a stack whose third member is not yet hosted, a question about the first fails, and fails as
_could not establish_ rather than _not bound_. That is the Axis A conflation moved one reader over.

**The other two converge, so the choice is the result type rather than the mechanism.** `resolveTerminalRecords`
already performs the plan read, state read, and coherence check that a deliverable-keyed method's body needs; the
deliverable-keyed route is that body behind a named method with a typed result. The design takes the named
method, as a fifth interface beside the four already in `core/delivery-member-lookup.ts`, leaving
`DeliveryMemberLookup` single-method — the structure that file already uses. Routing through
`resolveTerminalRecords` instead would widen a method named for terminal integration by use rather than by
design, which is a narrow fault but a sufficient one.

**The selector carries `planId` beside `deliverableId`.** `resolveMember` scans every plan's state in the
namespace and refuses `ambiguous-match` on more than one hit, and the readiness vehicle holds both fields
already. It spells the third one `workUnitSlug` where `DeliveryReviewMemberVehicle` spells it `workUnitId`, so
the call is a conversion rather than a direct hand-off.

**Identity lookup reaches a member head lookup structurally cannot, and that sets the result's arity.**
`stateMemberMatches` opens with `if (member.coordinates === null) return false`, a guard shared by both existing
arms, and `coordinates` is independently nullable in the state schema. Admitting the identity arm therefore means
moving that guard into the two coordinate-keyed arms, which is a change to a shared predicate rather than an
added case. The result carries four arms — not-in-plan, in-plan-unbound, bound, unavailable. **In-plan-unbound is
`absent`**, by § The variants' reading of a subject nothing binds; **not-in-plan is an identity error**, not a
relation variant, and § Forward-compatibility gives it its own remedy rather than the variant's.

**What the route no longer decides.** Both surviving routes agree that `absent` means _no member_ rather than _no
hosted member_, so the variant's meaning does not turn on the choice — only the eliminated route would have made
it mean the other thing. That is why this settles rather than staying structural, and it is the second thing the
"costs nothing" estimate missed; the first was that no lookup route existed at all.

**Two of the three `delivery-member-mismatch` facts become tautological, and one does not.** Under identity
resolution the member is found _by_ plan and work unit, so those two comparisons cannot fail; a head bound
elsewhere surfaces through the relation instead. The deliverable comparison survives as a real outcome — a
deliverable absent from this plan is the lookup's not-in-plan arm, a miss rather than a tautology. The
properties are kept; two of the facts that report them go away, and the third changes name.

Closeout needs no such inversion — `verifyDeliveryTerminalSettlement` already holds the terminal member and
compares its recorded head directly. Its defect is the bare equality inside the eight-term conjunction, which
the relation replaces in place.

### Where the unresolved condition lives

Settled 2026-09-16 against a stated criterion: **durability is warranted where its absence would make ARC wrong
rather than merely uninformed.** A resumed session that reports what is owed and re-derives the rest is
acceptable; one that acts on a stale cached fact is not. The cost to avoid is redundant ceremony, and the
realistic driver is not carelessness — the post-execution tail legitimately runs for days when it waits on an
asynchronous human review, and no session should have to stay open across that.

**Re-settled after reading the landing path.** The criterion was right and the answer derived from it was wrong,
because the question presumed a durable record was needed. It is not. The thing that must outlive the wait
already exists, and it is the held reservation.

**Nothing about the wait is cached, so nothing can go stale.** `reconcileLinkedNativeDeliverySuffix` runs only on
refs that have already moved: it requires the provider to have retargeted the request, the observed ref head to
equal the request head, and at least one member to have moved, refusing `suffix-request-mismatch` or
`suffix-result-unchanged` otherwise. Every refusal returns before its single state write, so the reservation
persists untouched. The operator's own work therefore happens entirely _before_ any disclosure exists, across as
many days as it takes, with each `land-status` run refusing afresh against live observation.

**The disclosure is regenerated, never stored.** When a movement finally cannot be proved, that run composes the
disclosure out of what it has just observed; a later run with nothing moved composes a byte-identical one. So the
window in which a disclosure can be invalidated is disclosure-to-acceptance, not conflict-to-resolution — and a
disclosure invalidated inside that window _should_ be refused, because the operator would otherwise be accepting
a description of a state that no longer exists. The days-long tail never touches the predicate.

That is why all three earlier framings were wrong. A durable phase was the wrong home because a days-long wait on
a person is not an operation in flight. A reservation-local transition was the wrong home because it cannot
outlive the session. A pending-obligation record sibling to `pendingReviewFixVerification` was the wrong home
because there is nothing to hold: the reservation outlives the session already, and the disclosure is cheaper to
recompute than to validate.

**What the criterion costs here, stated plainly.** The operator's acceptance is not durable either. An interrupted
settlement means resubmitting the same disclosure — one command, an identical conflict set, no judgment asked a
second time. ARC reports what is owed and re-derives the rest, which is the acceptable side of the criterion; it
never acts on a cached fact, because it caches none.

**That is the input side, and the terminal acceptance is deliberately the other way.** An `applicability-selection`
transition is durable on the Candidate's own record and is never re-asked once taken. The two are consistent
because they hold different things: nothing needs caching about a disclosure that recomputes identically, while an
authority decision is precisely the thing that must survive. § The waiver record.

**The predicate is the resubmitted disclosure itself.** `adoptExternalDeliverySuffixRefresh` composes
`{ planId, scope, expectedStateRevision, observedSuffixDigest, conflicts }` and refuses
`conflict-resolution-mismatch` unless a resubmission canonicalizes identically against a freshly derived one.
That is the conditional-precondition idiom § Established practice names, with the digest as the entity tag. The
earlier open question — whether the predicate reads recorded coordinates or re-resolved roles — dissolves: it
reads neither, because it re-derives the entire comparand and compares canonical forms. The dilemma was
manufactured by assuming stored content.

**What the relation still supplies is the report.** When a digest does not match, the refusal should name which
coordinate moved and how, in the vocabulary the rest of this design uses, rather than emitting a bare mismatch.
That is the one place this half consumes the frozen half, and it is the same role the relation plays everywhere
else here: it reports the condition, it does not decide it.

### The decline route, and what it does not undo

Settled 2026-09-16 by reading the settle path's mutation order. The item was carried as one question and it is
two, because the two disclosure points sit on **opposite sides of the first mutation**.

| Step                      | Site                     | Effect                          |
| ------------------------- | ------------------------ | ------------------------------- |
| suffix contribution proof | `native-landing.ts:881`  | refuses — **no mutation yet**   |
| local member-ref rewrite  | `native-landing.ts:956`  | **mutates local member refs**   |
| terminal absorption       | `native-landing.ts:984`  | refuses — **after the rewrite** |
| top publication           | `native-landing.ts:1009` | mutates the remote top          |

So the absorption arm is Axis D's twin on composition and **not** its twin here: declining the suffix arm has
nothing to restore, while declining the absorption arm must put back refs ARC itself moved a moment earlier.
Treating decline as one undifferentiated release would either leave those refs moved or invent a restoration the
suffix arm never needs.

**Decline releases the wedge; it does not reverse the landing.** This is the part most likely to be misread. The
predecessor really did land and the host really did restack — declining does not and cannot undo either. What the
operator regains is a delivery that is no longer held behind `operation-active`, so they can reconcile by hand,
abandon, or tear down. The conflict persists, and the next `land-status` refuses afresh against live observation
exactly as § Where the unresolved condition lives describes. A decline that claimed to undo the movement would be
promising something the host owns.

**The restoration's shape already exists on the provider path.** `adoptExternalDeliverySuffixRefresh` emits
`{ ref, observedHead, restoreHead }` per moved member and tells the operator to "restore every listed external ref
by exact lease." The native case is the same triple against a narrower target: the refs are **local**, ARC moved
them itself, and `rewriteLocalRef` already takes `{ ref, beforeHead, requestedHead }` — so the reverse call is the
existing verb with its arguments swapped, lease-checked, refusing rather than forcing when the lease fails. No
force-push is involved on either arm, which keeps this clear of the rebase-and-force prohibition.

**The transition's shape already exists too, one arm over.** `native-landing.ts:657-680` clears `activeOperation`
on a `not-applied` effect and returns `{ status: "retryable", transition: "cleared", action:
"delivery-native-land-select", selector: { planId, operationKind, operationId, affectedDeliverableIds, mode } }` —
a typed clear carrying a named resume action and an exact subject selector. A decline wants that shape, not that
arm: `reconcileDeliveryOperation` reconciles against **observed host facts** and its `retry` outcome means the
effect did not apply. Here the effect did apply; the operator is declining to **adopt** it. That is a different
transition against the same reservation, so it takes the template rather than the code path.

**What it therefore needs, stated as scope.** A release transition on `delivery native` that takes the exact
reservation selector, restores any local member refs ARC rewrote by lease (a no-op on the suffix arm), publishes
`activeOperation: null` at the exact revision, and returns a typed result naming what it restored and what it
deliberately left standing. Its refusal must be recoverable on the same rule everything else here follows: a
failed lease reports the observed head and leaves the reservation held rather than half-releasing it.

### Naming the variants, and where the definition lives

Settled 2026-09-16 on the two parts that carry consequences; the word choice itself is recorded as proposed.

**Neither existing vocabulary can be adopted, for opposite reasons.**

`merge.ts`'s names — `skipped-clean`, `head-contained-by-base` — are _caller-outcome_ names: they say what that
one caller does about the relation, not what is true of the two revisions. A shared primitive has three callers
who do different things with the same fact, so outcome names cannot be the shared vocabulary. That is not an
objection to the precedent; it is the clearest statement of why extraction is needed at all.

Git's porcelain names — ahead, behind, ahead and behind — are _viewpoint-relative_. Git's viewpoint is fixed
(local against upstream) and ARC's is not: this design compares a bound coordinate against an observed one at
two readers and a baseline against a current base at a third. "Ahead" would mean opposite things at different
call sites, and reversing it is a silent defect rather than a type error. Adopt the distinctions, which
§ Established practice already does; do not adopt the words.

**The relation is over an ordered pair, and the order carries the direction.** Name it `(reference, subject)`
and define every variant as a statement about the subject relative to the reference, exactly as
`merge-base --is-ancestor <ancestor> <descendant>` is positional rather than semantic. Each caller then declares
which of its revisions is which, and no variant flips meaning between call sites. This is the part the two
rejected vocabularies get wrong, and it is settled independently of what the variants are called.

**Proposed words**, from the subject's side of that pair: `unchanged`, `advanced`, `rewound`, `diverged`,
`absent`, `unknown`. `diverged` is Git's own concept and `merge.ts`'s fall-through; `absent` is preferred over
Git's `gone`, which implies something was once there; `unknown` is ARC's addition and has no Git counterpart
because Git throws where this must classify. `rewound` is the least settled — it names the shape correctly but
faintly implies a cause, when the same relation also holds for a record binding something never published.

**The definition lives in the type.** `strategy-procedure-evolution` Principle 4 holds that contract surfaces
derive from the TypeScript types rather than being hand-authored a second time, and this is such a surface: a
closed variant set consumed by typed readers and carried in a versioned record schema. A prose glossary beside
it would be the second copy that principle exists to prevent.

**It does not join the briefs' vocabulary, and the reason is a constraint already adopted.** Principle 7's
briefs tier carries terms an agent must know in order to _operate_ — `Class`, errand, interlock, review
increment. These variants appear in emitted results rather than in instructions, and § Forward-compatibility
check already requires each variant to carry a typed remedy action rather than prose. An actor therefore
dispatches the action instead of interpreting the word, so the name has no always-loaded miss-cost to justify a
slot. Where a variant does reach a durable record, the record's own schema is its definition.

### The subject's path set — base-relative, with cardinality refused rather than picked

Settled 2026-09-16, **after an adversarial pass falsified the commit-derived answer this section previously
carried.** The earlier reading treated the choice as touched-versus-net and concluded that a commit-derived set
was both the only cardinality-safe option and the less movement-sensitive one. Both halves were wrong, and the
correction removes machinery rather than adding it.

**The set is the base-relative diff from the single resolved base.** Under the resolver rule in § Reader
inventory the base is read with `--all` and the reader refuses when the count is not one, so the diff's
fragility is discharged by refusal rather than by an arbitrary pick. No merge-diff mode selection, no union, no
special handling of merge commits: the subject is a tree-to-tree comparison, which is what a content question
deserves.

**What the commit-derived answer got wrong.** Empirically, a branch that merges the base in and keeps its own
side of a path the base changed contributes that retention, and no branch-side commit records it. The condensed
merge mode that suppresses the merged-in base's changes also suppresses this, and the mode that catches it
admits every base change as the branch's own. The base-relative diff reports it correctly, and the merge that
created the situation has made the base an ancestor — so cardinality is one and the diff is well defined
exactly where the design most needs it.

**And the movement-sensitivity claim was inverted at the metric that matters.** The subject digest is taken over
path, content digest, and mode — not over path names. A path changed and then reverted within the branch
therefore leaves a commit-derived set carrying a no-op entry whose content matches the base, so the digest
differs from the attested one permanently and currentness never clears. The base-relative set drops the path and
the digest returns to its attested value. The commit-derived answer would have _added_ a durable
redundant-ceremony source while this draft recorded it as removing one.

Two consequences worth keeping. The severe row's defect was never that the subject asked a base-relative
question; it was the silent pick, and refusing on cardinality is the whole fix. And the remedy in
§ Refusal-recoverability audit does double duty here: merging the base in both clears the refusal and makes the
content comparison well defined.

### What the record may carry

Re-settled 2026-09-16. The question was asked as though the record had to be designed. It does not: ARC already
runs this protocol on the provider path, and the native landing path is the one missing it.

**The existing protocol, read from source.** `adoptExternalDeliverySuffixRefresh` in `suffix-reconciliation.ts`:

1. `collectDeliveryProviderRefreshConflicts` gathers the **complete** conflict set rather than returning on the
   first — every member whose movement proves `contribution-conflicted`, each with its paths. Any other refusal
   stays hard.
2. With conflicts present and no resolution supplied, it returns `conflict-resolution-required` carrying the
   conflicts, a resubmittable `resolutionInput`, and `externalRefRestorations` — the exact ref, observed head,
   and restore head needed to undo the movement by lease if the operator declines.
3. With a resolution supplied, it refuses `conflict-resolution-mismatch` unless that blob canonicalizes
   identically to a freshly derived one, then reserves an operation carrying the approved member ids.
4. `settleReservedDeliverySuffixRefresh` re-derives the conflict set under that reservation and requires the
   approved id set to match, then rewrites local refs, absorbs and publishes the top, and writes
   `pendingReviewFixVerification` from the approved ids.

**The capture asked for this shape by name.** § Retained capture detail's carried obligation is to "bind the
decision to the exact plan, operation, state revision, observed suffix, member identities, before/after refs and
trees, and conflict paths", and to "require semantic approval only for the disclosed conflicted contributions;
continue mechanical proof for every other movement". That is `resolutionInput` and the approved-id waiver, term
for term. The capture also attributed suffix reconciliation to `native-landing.ts`; the protocol it describes
lives in `suffix-reconciliation.ts`, which is why it read as unbuilt.

**The three classes were right; the obligation class turned out not to exist.** The disclosure is the
`resolutionInput` and the decision is that blob resubmitted — both confirmed. The obligation was recorded as
`pendingReviewFixVerification`, then as a selection-referent question, and settling that question dissolved it.

**That field is the review-fix flow's own state machine, not a generic slot for what is owed.** Four couplings,
each verified: the acknowledgement handshake refuses `selected-deliverable-mismatch` unless the acknowledger
names the same `selectedDeliverableId`, so the value is an identity key; terminal integration's review-fix arm
**renews** the field from its candidate's selection and validates the candidate against the pending scope; a
non-null value refuses native stack **link and unlink**, removing the degrade-to-sequential escape several
sibling refusals recommend by name; and publication, reservation-nulling, and supersession all key on the same
selection. Writing it from a native landing would mean inventing a selection three readers misinterpret, and
leaving `review-fix acknowledge` as the only discharge verb.

**The waiver needs no obligation at all, because the encumbrance is already structural.** Trace the cycle the
settlement hands back to. The settle writes the resolved heads into `state.members[].coordinates` and clears the
operation. The next cycle's `deriveNativeDeliveryRegisteredRemainder` builds each member's `headSha` **from those
coordinates**, so it carries the hand-resolved head. `prepareNativeDeliveryLanding` refuses `member-not-ready`
unless every member passes its readiness dependency, and that dependency calls `reviewReadiness` keyed on the
exact head. A hand-resolved head carries no review evidence, so it refuses there by construction — and there is
no bypass, because the arm selector releases to terminal integration only on `no-nonterminal-remainder`, which
means every non-terminal member has already passed that gate.

So the retained capture's requirement — new member heads receive fresh applicability, review, and checks before
landing — is delivered by the existing gate rather than by anything this design adds. No blocking field, no
discharge, and therefore **no referent to select**. The question dissolved rather than resolving.

**A coherence check worth recording.** That gate holds today _because_ of the defect this work unit fixes:
readiness misses on a moved head. After the Axis A correction it resolves by identity and reports a typed
mismatch instead. Either way it refuses, so the fix and the waiver compose without regression.

**The loop-back, stated once.** This draft proposed a sibling obligation field, retracted it on the reading that
the protocol emits `pendingReviewFixVerification`, and source says that field belongs to another flow. The
original instinct was right for a reason neither version had — and the answer is still not a sibling field.
For non-terminal members no obligation field is needed at all; for the terminal member the gate is the
Candidate's, at the integration checkpoint, and a sibling field was always the wrong shape for it because the
problem there is which reader looks, not which slot holds.

**Abort narrows with it.** With nothing written to state, declining a waiver leaves no obligation to clear, which
reduces it to a question about refs alone. Settled 2026-09-16: the provider path's ref-restoration semantics do
transfer, against a narrower target — the refs are local and ARC moved them itself — and the two disclosure points
need different amounts of it. § The decline route.

### The waiver record joins an existing family

Settled 2026-09-16, and it settles a composition question the Owner has now raised four times in this work unit.
A waiver is a person accepting something ARC could not mechanically establish. That is the same act as an
Owner-accepted review terminus, and **ARC already carries a typed durable shape for it.**

`OwnerAcceptedReviewTerminusSchema` is `{ schemaVersion, semanticsVersion: "review-terminus/v1", kind:
"owner-accepted", lane, acceptedBy, completedPasses }`, and `DeliveryReviewMemberTerminusSchema` binds one such
conclusion to a subject: `{ vehicle, terminus }`. The vehicle is `DeliveryReviewMemberVehicleSchema` —
`{ kind: "delivery-member", planId, deliverableId, workUnitId, head }` — with `sameDeliveryReviewMemberIdentity`
comparing identity while **ignoring head**. Subject vehicle, typed conclusion, versioned semantics, and a
recorded accepting identity are all present.

**The shape argument was right and the family was the wrong one.** Settled 2026-09-16 by probe: for the terminal
member the acceptance ARC already carries is the **Candidate applicability selection**, not a second `kind` beside
the review terminus. Reaching for the terminus family would have minted a record next to a store whose only reader
matches on the vehicle without inspecting `kind` — and would have duplicated a decision that already exists one
boundary later, with better evidence.

**What the existing decision already is.** A terminal coordinate that moves to a head the machine cannot prove
falls to `classifyCandidateApplicability`'s judgment arm: `state: "decision-required"`, `nextAction:
"request-authority"`, carrying the diverged `paths`, the `verdict`, the projection, both digests, and
`choices: ["covered", "targeted-check", "changed"]`. Selecting `covered` writes an `applicability-selection`
transition bound to `priorTarget`, `currentTarget`, `projectionDigest`, `residualDigest`, and `selectedBy`. That
is the disclosure, the acceptance, the accepting identity, and a binding that dies when the content is rewritten —
the four properties this section went looking for, already typed and already durable.

**And its cheap arm is genuinely cheap.** `reduceCandidateDurableBaselineRecord` advances the durable target to
`currentTarget` for every choice except `changed`, so a `covered` selection makes the Candidate current at the
resolved head with `recognition: { kind: "durable" }` — no new lineage root, no re-attestation. The probe asserts
this by making a second applicability request throw: an accepted resolution is never re-asked. That matters
because this draft elsewhere classifies re-attestation as exactly the redundant ceremony this work exists to
reduce; routing the waiver here reduces it rather than adding to it.

**The three machine proofs are the same vocabulary this design already speaks.** Applicability grants `applicable`
on `subject-equality`, `tree-equality`, or `mechanical-reapply` — term for term the fast paths the suffix arm
takes silently. Movement alone never reaches the operator on either surface, and the judgment arm fires on the
same event: a real content collision.

**The evidence is derived, and nothing is written at settle time.** Probed 2026-09-16 against a post-landing
shape — predecessor landed into the base, base moved on the colliding path, top absorbed the refreshed member by
hand. Two results, both measured:

- **The absorption shape is recoverable from Git alone.** The resolved top's parent line is exactly
  `<head> <priorTop> <refreshedMember>`, and `priorTop` is `baselineTarget.revision` — data
  `projectGitCandidateApplicability` already holds, with a `RawGitExec` already in hand. So the decision surface
  can recognize an operator-resolved absorption without a settle-time record, which keeps § Where the unresolved
  condition lives' no-cache posture intact rather than carving an exception in it.
- **The disclosure is already precise.** The decision reports `paths: ["shared.txt"]` — the operator's own
  resolution, not the whole absorbed predecessor. The expected failure mode did not occur: because the landed
  predecessor is already in the base the contribution replays onto, its content is explained rather than residual.
  So the framing is what is missing, not the data.

**One finding cuts the other way, and it should not be smoothed over.** The verdict is `interaction`, not
`clean-divergence` — the mechanical replay itself conflicted, which is definitionally why an absorption reaches a
person. `reduceEvidenceApplicability` maps that to `{ verdict: "fresh", judgmentRequired: false }`: ARC's evidence
layer asks for fresh evidence and offers **no** judgment. The Candidate layer above it still offers `covered`. So
accepting an absorption is an _override_ of the reduction rather than a judgment the reduction invited, and the
two layers disagree about whether a choice is on offer at all. That is arguably right for a waiver — a person
accepting what the machine will not certify is the whole act — but it means `covered` must not be presented as
the routine outcome, and it leaves a narrower question open. § Open.

**The binding difference is one rule applied to different subjects, not a second rule.** A review terminus binds
to a work unit's review state and survives movement that leaves the reviewed content intact; an applicability
selection binds to disclosed content and dies when that content is rewritten. § What the record may carry already
records the reconciliation — movement is distinguished from change, and each thing binds to what it is actually
about. Two acceptances, one rule.

**What this work unit does and does not do.** It mints no record at all: the terminal member's acceptance is the
`applicability-selection` transition ARC already writes. It does **not** abstract the two acceptances into a
shared primitive, because `review-source-authority` owns a live defect in the terminus's binding — an acceptance
dropped when the Candidate advances, and the frontline lane refused outright — and an abstraction authored here
would be authored against a shape that work unit is about to change. The seam is routed there instead.
§ Boundaries.

**A pointer the readiness question consumed.** `sameDeliveryReviewMemberIdentity` is already
resolve-by-identity-then-compare-head, which is the shape § Readiness reads its key backwards prescribes — and
that section now carries it as the argument that the inversion conforms readiness to the review gate's own order
rather than introducing one. The lookup route settled there on a named fifth interface, so no fourth route is in
question.

**How often the gate fires, because that is what decides whether it is friction.** It fires only when `merge-tree`
cannot compose a member's pre-landing content across its predecessor's landing — a genuine content collision
between a landed change and a dependent one. The ordinary restack is silent: identical trees take the
`tree-equality` fast path, a clean reapply takes `mechanical-reapply`, and neither asks anyone anything. Movement
alone never reaches the operator. So the approval is not a tax on routine landing; it is the event this work unit
is named after, and its rate is the rate of real post-landing conflicts.

**One narrowing worth considering.** ARC already classifies paths `reviewable` / `evidence-neutral` /
`regenerable` through `classifyPathTreatment`, and a collision confined to lifecycle projections — the roadmap, a
work unit's own artifacts — carries no judgment to exercise. Gating the disclosure on at least one `reviewable`
conflicting path would keep the question for the cases that have one. Recorded as open rather than adopted: the
classifier's regenerable set is currently narrow, and whether the all-neutral case is reachable often enough to
earn the term is unmeasured. Adopting it on the reasoning alone would be the symmetry § Proportionality rules out.

**What the gate may not become is agent judgment.** Waiving a failed contribution proof is an authorization over
a check whose subject is usually the agent's own restack, and `DEV-RULES.ARC` § Rule Authority puts that limb out
of the agent's reach — the claim needs a witness the agent does not write. The narrowing above changes how often
a person is asked; it does not move who decides.

### What composes with the existing obligation, and what only rhymes

Asked because this work unit looked like it was adding a second instance of a shape ARC already has. It is not
adding one at all, which changes both answers.

**The payloads do not compose, and the question dissolved with the obligation.**
`pendingReviewFixVerification` carries `{ selectedDeliverableId, memberDeliverableIds }` — a selection key and a
plan-ordered set — and the selection key is exactly what a native landing cannot supply. The settlement writes
nothing into it. There is no second record to unify with because there is no second record. The earlier
analysis stands as a correct answer to a question this design no longer asks.

**The encumbrance predicate loses its trace.** Asking "may this delivery proceed, and if not what holds it" is
hand-enumerated rather than shared:

```text
if (state.activeOperation !== null)                return refused("operation-active");
if (state.pendingReviewFixVerification !== null)   return refused("pending-review-fix-verification");
```

That pair appears in `compose.ts`, in `retirement.ts`, twice in `terminal-integration.ts` — the
integration-checkpoint and terminal-absorption reader, which is the closeout boundary a waiver must not slip
past — and in `public-review-continuation.ts:71`, while `entry-inspection.ts` reads both to _route_ rather than
refuse. The public-review site is the only one that collapses both terms into a single `state-not-idle`, which
is the cause-blindness § Refusal-recoverability takes into scope at closeout, reached here on a second surface.
The argument for extracting a shared
predicate was that a third obligation would make every such site grow a third term, and a site that grew only
two would report an unencumbered delivery while something was owed. **There is no third field** — and that is
now an absence rather than a composition. The waiver writes no obligation, so no reader grows a third term.
What the argument no longer does is establish that nothing is owed; see below.

So the extraction is still duplication without a traced need, and § Proportionality's rule still disposes of
it: compose existing substrate, and never build on symmetry. **Route it to capture rather than into scope**, on
the same line § Reader inventory draws for the decomposition call sites. The disposition is unchanged; its
warrant is now the absence of a third obligation rather than the presence of a shared one.

**What the removed write was carrying, and what does not carry it.** The risk that made the extraction look
necessary is real: a waived movement must not reach closeout looking clean. An earlier settlement met it by
writing the approved ids into `pendingReviewFixVerification`. Dissolving the referent removed that marker, and
the argument that replaced it — the next landing cycle refuses any member that cannot pass review readiness on
its exact head — **does not reach the terminal member**. `deriveNativeDeliveryRegisteredRemainder` iterates
`plan.members.slice(start, -1)` (`native-landing.ts:98`) and refuses `member-mismatch` when the selected member
is the last one, so the terminal member is sliced off before `prepareNativeDeliveryLanding` runs its per-head
readiness refusal at all.

For every non-terminal member the substitute gate holds and nothing is owed past it. **The terminal member's
marker is the Candidate applicability selection**, settled 2026-09-16 — a different gate on a different surface,
which is why reading for a delivery-side one found nothing. The gate sits at the integration checkpoint, in two
mechanisms: the terminal coordinate advance proof, which withholds a proof for a head the Candidate's recognized
target does not reach, and the Candidate applicability dispatch, whose result schema will not accept an
`applicable` payload and demands a resolution selector on `decision-required`. § The waiver record reads both
from source and probe.

**What is genuinely missing is narrower, and it is a hole rather than an absence.** The adoption branch above the
composition accepts an operator's merge on its parent pair alone, so a hand-resolved tree can enter the terminal
coordinate without anything marking it as a resolution. The applicability decision downstream still fires — the
tree is unproved, so it lands in the judgment arm — but it presents as an unexplained member rewrite rather than
as the absorption the operator just resolved. § Refusal-recoverability audit's fourth clause is satisfied; what
fails is disclosure quality. **Fencing the adoption to the mechanical composition is the answer to reject** — it
closes the only working recovery route and returns the terminal top to unrecoverable. The remedy is
admit-then-decide: adoption stays reachable, and the decision surface derives the evidence that it _was_ a
resolution from the resolved top's parent line, carrying the absorption's conflict set into the presentation.
§ The waiver record.

**The spine extraction had a causal justification and source refuted it.** An earlier version here said the two
settle functions had diverged — one collecting the complete conflict set, the other returning on the first
refusal — and that the divergence _was_ Axis D. It is not a divergence. Both provider functions carry the same
fork: `adoptExternalDeliverySuffixRefresh` runs `collectDeliveryProviderRefreshConflicts` when a selection is
present and `proveDeliveryProviderRefreshMovements`, which returns on the first refusal, when it is not;
`settleReservedDeliverySuffixRefresh` carries the identical fork keyed on the approved id set. **The
complete-conflict-set behaviour is gated on selection, not drifted between copies** — the same referent that
§ What the record may carry now records as open.

**So the least elaborate credible route is the one to take.** Both helpers are already module-level exports. The
native loop can build `DeliveryProviderRefreshMovement` values directly — it already constructs exactly that
shape in its observed-member list — supply a predecessor-pair map so the arbiter closure can form contribution
endpoints, and take the resubmitted disclosure through the `native-land-status` request. That delivers Axis D's
fix without touching the provider path at all.

**What extraction would actually buy is smaller than claimed.** An earlier estimate here put the duplication at
roughly a hundred and fifty lines; reading both tails, the genuinely common core is the local-ref rewrite loop
plus a structurally similar absorb-then-publish sequence, and the surrounding steps diverge on both sides — the
native tail alone observes member-ref checkouts, while the provider tail alone composes a terminal conflict
preparation, threads a publication lease head, cleans up prepared candidates, and projects a verification
continuation. The estimate was soft and should not carry weight on its own; the refuted causal claim is what
decides this.

**And the seam would sit in the wrong place.** The one fork a shared spine must carry is the selection gate — the
single thing that genuinely differs between the two paths. Abstracting over the least-alike element is the
signature of a premature abstraction, which is the failure this section already names on the payload side.
§ Proportionality's rule closes it: compose existing substrate, and never build on symmetry.

**Recorded as a reversal rather than a silent change.** The Owner chose maximal composition on the strength of
the divergence claim; that claim is refuted, so the decision was re-put with the correction in hand and settled
on the narrower route, 2026-09-16. The duplication that remains is real and untraced to any defect, which makes
it a capture rather than scope — the same line drawn for the decomposition call sites.

### Proportionality

`assess-design-proportionality`, 2026-09-16 — **`proportionate` for the relation half; re-run and narrowed for
the recovery half after the fourth pass returned `missed-composition` against it.**

The relation's trace is unchanged: its existence is required by the two Axis A rows and the four Axis B ones;
each variant beyond a boolean buys one distinct remedy, and remedy accuracy is the defect the in-flight Errand is
already correcting, so variant granularity is traced rather than symmetric. Rigor stays where consequence is —
the write boundary keeps its exact preconditions (`update-ref`'s old-oid, revision-checked state writes,
lease-checked publication) and the relation is added above it, read-only. The minimal alternative — add an
ancestry term at the two Axis A readers and leave the rest — is rejected by the draft's own recorded constraint:
reader-by-reader adoption is how the implementations diverged, and it leaves Axis B's vocabularies standing.
Cardinality and divergence are intrinsic to Git history, not states this solution creates.

**The recovery half's verdict did not survive its own trace.** The settle-spine extraction was justified by a
causal claim source refutes, and a less elaborate route reaching the same outcome existed unevaluated — which is
`missed-composition` by definition. The narrowed answer stands on the remaining trace: Axis D needs the complete
conflict set and a waiver, and two already-exported helpers supply both. § What composes.

**The scope guard, now with one addition.** Nineteen `--is-ancestor` call sites carry no observed failure between
them; retrofitting them is symmetry, not traced need, and this work unit converts none. The same line holds for
the two decomposition call sites and for the five silent picks outside this work unit's concerns.
`repository-target.ts` crossed it in the other direction — scoped in by the Owner on the strength of its trace
rather than on symmetry, because its silently picked base is review-target identity. § Reader inventory.

## Forward-compatibility check

Run 2026-09-16 against the four project check-docs and two planned-but-unbuilt designs, before settling how the
operator's decision is carried. **Nothing in the settled fundamentals conflicts.** Three constraints sharpen the
design and are adopted below; one convergence is recorded because it makes the relation load-bearing for a
reason this draft had not derived.

### Adopted — each variant carries a typed remedy action, not prose

`strategy-procedure-evolution` Principle 6 requires emitted text to be precomposed CLI-side rather than templated
in prose, and `draft-composable-workflows` carries the sharper form: structured remedies already publish an
executable half that the recommendation contract drops, leaving workflow prose to hardcode a different command.

That is § Axis D's defect stated generally. The settlement there wraps a correct refusal in guidance naming a
remedy the probe proves cannot clear it — a published result reduced to prose that says something else. Since
the six variants are separated **because** each carries a distinct remedy, the remedy is part of the type: a
typed action the caller dispatches, not a sentence a later reader re-authors. This is the constraint that makes
variant separation pay off rather than merely describe.

### Adopted — the encumbrance predicate feeds the resume slot rather than paralleling it

`draft-composable-workflows` owns typing the integration resume point, today a prose join over lifecycle,
change-request, worktree, and branch facts the CLI already composes. `draft-operational-state-docs` owns the
durable resume directive and requires it be code-owned, storage-agnostic, and **derive precise continuation from
live state**.

Both are the same shape as § What composes — one reader answering what encumbers a delivery, each obligation
contributing a term. Keep it that way deliberately: this work unit must not mint a second resume path beside the
one those designs will compile. Adopting the built protocol satisfies this by adding no field at all: a waiver
creates no new encumbrance term, so the resume slot's reader keeps exactly the two terms it already has. The
terminal member's closeout marker satisfies it the same way — the gate is the Candidate applicability decision on
a different surface, which adds no delivery-side term either. The constraint is met on both paths.

The deeper agreement is doctrinal, and the re-settlement strengthened it rather than straining it. "Derive
continuation from live state" is the criterion this draft reached independently, and the adopted protocol goes
further than the criterion demands: it stores nothing on the input side, deriving the whole disclosure from live
observation on every run. `draft-operational-state-docs`
also carries `_Awaiting: <trigger>_` for captures blocked on an external condition, which records the unblock
condition, suppresses time-based nudging, and is re-evaluated as a judgment pointer rather than an automated
one. Different surface, same doctrine. Name this one consistently with that rather than inventing a third
vocabulary for it.

### Adopted — the variant names are controlled vocabulary, not a naming preference

`strategy-procedure-evolution` Principle 7 holds that a term doing technical work is defined once and used
exactly, and that a new load-bearing term earns its definition before use. The six variants are exactly such
terms: they will appear in refusal reasons, remedies, and any surface that reports why a comparison failed. The
open naming item is therefore a placement obligation with a home to find, not a matter of taste — and
Principle 4's generated-not-hand-written rule means the definition derives from the type rather than being
restated beside it.

### Recorded — native restacking makes the disclosure short-lived, and that is accepted

`strategy-storage-evolution` § Holistic Design carries a delivery-specific target: once operational state
materializes off-branch and identity no longer couples to branch SHAs, delivery replaces its filtered-member
projection with ordinary interior-ref members and **permits native restacking end to end**, while preserving the
terminal-authorization arm and member-boundary verification as substrate-independent contracts.

Routine restacking rewrites member heads as a matter of course, so any predicate reading head identity would
invalidate a held decision on every restack — the redundant-ceremony failure arriving at a cadence rather than as
an incident. The adopted predicate **is** head-sensitive: `observedSuffixDigest` covers the whole observed
suffix snapshot. This check therefore fires, and the answer is a bound rather than an immunity.

**The bound is the reservation.** A disclosure exists only between the run that composes it and the resubmission
that consumes it, and that window sits entirely under a held native land reservation which refuses any second
delivery operation. ARC cannot restack underneath it, so the forward direction's routine restacking cannot reach
the predicate however common it becomes. The days-long wait sits _before_ the disclosure, where nothing is held.

**The residual is the operator's own concurrent push.** Someone who resolves the disclosed collision and also
pushes an unrelated member before resubmitting will be re-disclosed. That costs one `land-status` run returning
an identical conflict set and one resubmission — no new judgment, and the re-disclosure is correct, since the
snapshot they were shown is no longer the one they would be accepting.

**Accepted rather than designed around.** Narrowing the predicate to the disclosed paths would buy immunity to
that case, at the cost of departing from the built protocol and storing per-path content — which § Proportionality
rules out as symmetry and which the Owner's direction to adopt the precedent settles. Recorded here so the
acceptance is visible rather than silent: this is a known edge with a named cost, not an unexamined one.

The preserved contracts are safe — this design adds reachability above the write boundary and relaxes nothing at
it.

### Checked and not firing

`strategy-knowledge-evolution` reaches this design only through Principle 6, extract on fan-in rather than
aesthetics, which now confirms § What composes from the other direction: the second payload this design was
expected to add does not exist, so there is no fan-in to extract on and the predicate stays captured.
`strategy-pm-composition-evolution` finds no new external-authority surface — the change-request binding is
untouched, and resolving a member by deliverable identity rather than by head object id moves toward its
Principle 5 and `strategy-storage-evolution`'s Principle 5, both of which hold work unit identity independent of
any single repository's branch state.

Storage Principles 2 and 3 both clear. The earlier clearance was written over a stored record that no longer
exists; what replaces it stores nothing on the input side, so Principle 2's tracked-tree question does not arise
for the disclosure. Nor does it arise for the acceptance: the terminal member's is the `applicability-selection`
transition, already written to the Candidate's own managed record rather than to anything this design introduces.
Principle 3's version-checked precondition is satisfied by the resubmission predicate, which compares canonical
forms against freshly derived state.

## Refusal-recoverability audit

Re-run 2026-09-16 against the rule as it landed in project rules, which is wider than the four clauses the
first run used. The landed text gates on a distinction before those four apply, and adds a verification
obligation after them:

- **Clause 0, the gate.** An operational refusal is incomplete unless it distinguishes terminal failure from a
  recoverable stop.
- **Clauses 1-4.** Preserve a safe retry or restart route, report the observed condition, name an actionable
  remedy, keep the normal success path reachable after repair.
- **Clause 5, verification.** At material boundaries, verification must cover both the refusal and successful
  continuation after the condition is repaired.
- And the closing constraint: do not add guard-only dead ends.

The rule is close to this work unit's thesis stated generally, so the audit is a fit check rather than a
translation. Every row here fails at least two clauses today; that is § The failure family restated in the
rule's vocabulary. What the audit is for is the design's answers, and it found one gap and one remedy the design
had not named.

| Row                   | Fails today                 | The design's answer                                    |
| --------------------- | --------------------------- | ------------------------------------------------------ |
| Review readiness      | condition, remedy, retry    | inverted lookup, then the relation; rebind is the verb |
| Closeout              | condition, remedy, retry    | relation in place — **condition still unmet, below**   |
| Whole-WU verification | reports no condition at all | base resolved with `--all`; refuses, base-merge remedy |
| Prepublication        | remedy, success path        | typed relation; **remedy is re-baselining, below**     |
| Public review target  | condition, remedy, retry    | typed result rather than a throw; base-merge remedy    |
| Landing overlap       | remedy, success path        | refuses typed; base-merge except the checkpoint pair   |
| Post-land replay      | clause 0, then all four     | protocol answers all five; **0 restated below**        |

### Clause zero states Axis D more precisely than this draft did

The draft's framing is that `native-landing.ts:898`'s guidance names a route that cannot work. The rule's gate
clause says it sharper: `contribution-conflicted` **presents as a recoverable stop and is terminal under
repair**. It names the conflicted paths and directs a rerun, which is the shape of a recoverable refusal, while
the composition that produced it reads no operator input, so no repair changes the verdict. The refusal does not
distinguish which kind it is, and it misrepresents itself as the recoverable one — which is why the guidance
encodes a wrong answer rather than merely an unhelpful one. Adopt the gate clause's wording where the draft
currently says "names a route that cannot work": the defect is the missing distinction, and the wrong guidance
is its symptom.

### Clause five lands on this design's task plan, not on the surface it audits

"Verification must cover both the refusal and successful continuation after the condition is repaired" is an
obligation on what this work unit builds. Every refusal it introduces owes a paired probe rather than a
refusal-only one:

- the rejected resubmission, and a resubmission that then succeeds;
- the waiver's disclosure, and the settle that follows acceptance;
- `unknown`, and the same read succeeding once the object is fetchable;
- each variant's typed remedy, and the reader clearing after that remedy runs.

The audit's other rows inherit it. The base-merge remedy is claimed to make Axis B's refusals recoverable, and
clause five says a refusal probe alone does not carry that claim — the merge must be shown to clear it.
§ Pinned probes currently pins refusals; the continuation half is owed across the board. This is a task-planning
input rather than a design change, and it is the clearest thing the re-run added.

### The gap — the relation fixes the comparison, not the cause-blindness

Closeout's equality sits inside an eight-term conjunction that collapses to a single `terminal-unsettled`
reason. § The failure family already recorded that the refusal is cause-blind as well as ancestry-blind, and
treated the second as this work unit's concern. Under this rule the first is not separable from it: replacing
the equality term with the relation makes the comparison correct while the refusal still cannot **report the
observed condition**, because seven other terms reach the same word. A caller told `terminal-unsettled` still
cannot tell a moved head from a wrong base ref, and the remedy still cannot name the failing term — which is
exactly why the recorded remedy directs a rerun over inputs that never reach it.

So the conjunction owes a reason per term. **Taken into scope by the Owner, 2026-09-16**, over the narrower arm
that would give only the relation's term a distinct reason and leave the other seven collapsed: that arm fixes
the ancestry row while leaving the rule's second clause unsatisfiable everywhere else. It is also the smaller
change than it looks — the relation supplies the vocabulary for the one term that was ancestry-blind, and the
other terms need only stop sharing a word.

**The sizing was taken on a short count.** That one reason is reachable three ways, not one: a five-condition
pre-guard before the conjunction is built, an unobserved host request, and the conjunction itself. Fourteen
conditions reach one word rather than eight. The direction is unchanged and the extra conditions sit in the
same function, but the claim that this is smaller than it looks was made against the wrong number.

### The remedy the design should name — merging the base in collapses cardinality

§ Established practice proves that an ancestor uniquely dominates, so `merge-base --all` returns exactly one
whenever one revision reaches the other. The corollary was not drawn: **merging one side into the other makes it
an ancestor, which collapses cardinality above one to exactly one.** A criss-cross is not a permanent property
of two revisions; it is a property of their current shape, and an append-only merge changes that shape.

That converts Axis B's refusals from correct-but-terminal into recoverable, and the remedy is already ARC's
mandated way to absorb base movement — merge the base in rather than rebase a published branch. It is idiomatic,
available, and non-destructive, which is what clauses three and four ask for.

**Applicability is per coordinate pair, not per reader.** The remedy reaches a call site only if the merge
relates the exact pair that site compares, and one reader can serve pairs of different topology — which an
adversarial pass demonstrated after this section had already been written in per-reader terms. The sole-base
resolver and the overlap analyzer's delivery and review call sites compare a `(head, base)` pair, so merging the
base in collapses their cardinality and their refusals are recoverable.

**The overlap analyzer's integration-checkpoint call site is not one of them.** There it compares the pinned
Candidate durable baseline against the base, so the merge moves neither element and the refusal stands — the
same refutation recorded below for Candidate applicability, reached through a different reader. Its residue is
smaller, though: at that site the resolved base lands only in drift evidence rather than being consumed as a
ref, so what fails there is recoverability alone and not the coordinate obligation.

**Candidate applicability is a refutation, not a pending confirmation.** It compares the _pinned_ baseline
target against the current base, and that baseline is reduced from the Candidate's durable managed record.
Merging the base into the branch advances the Candidate head and changes neither element of that pair, so the
topology between them is untouched and the ambiguous refusal stands. The remedy does not reach this reader at
all.

Its actual route is to re-pin the baseline, which happens through a fresh authority transition on the record —
that is, re-attestation. That is a real success path, so clause four is satisfiable, but it is expensive, and
this draft elsewhere classifies exactly that demand as the redundant ceremony this work exists to reduce. The
honest statement is a distinction rather than a remedy: a criss-cross **manufactured by the silent pick** is
redundant ceremony and this design removes its cause, while a **genuine criss-cross under a pinned baseline** is
the cost of the history's shape, and re-baselining is the price of clearing it. Name re-baselining there rather
than gesturing at a route that does not exist.

Where an append-only merge is not permitted at all, the refusal stands and clause one is satisfied by the
restart route instead.

### The design's own refusals, held to the same rule

Three are introduced here and each must answer it.

- **A rejected resubmission.** When a resubmitted disclosure no longer matches a freshly derived one, the refusal
  must name which coordinate moved and how — the relation is the vocabulary — and re-emit the current disclosure
  in the same breath, so the operator's next act is one resubmission rather than a rediscovery. A bare
  `conflict-resolution-mismatch` satisfies the second clause and fails the third and fourth.
- **A waived movement reaching closeout unmarked.** For non-terminal members the next landing cycle's per-head
  readiness refusal is the gate. For the terminal member the gate is the Candidate applicability decision, which
  refuses to recognize an unproved head without a recorded authority selection — so the success path is not
  reachable while something is owed. What the rule still catches is the adoption branch: it admits a hand-resolved
  tree on a parent-pair match, so the resolution reaches that decision stripped of the evidence that would let the
  operator recognize their own act. Closing that is a disclosure fix, not a fence — the decision surface derives
  the absorption from the resolved top's parent line and carries the conflict set into its presentation.
- **`unknown`.** An ancestry read that did not establish an answer is retryable by construction, and the clause
  it most easily fails is the third: it must say the read failed rather than implying a verdict about history.
  This is the variant's whole purpose, and it is why the reader rather than the classifier produces it.

## Boundaries with neighbouring work

### `delivery-correction-convergence` — settled

The two adjacent rows look like one mechanism and are not:

- **Theirs** (landing / position over an append-only terminal advance): refuses `review-fix-routing-required`. The
  recognition mechanism is built; what is missing is a route from the fact to resumption.
- **Ours** (public review readiness): the comparison reads no ancestry, so the movement is never a fact it holds.

**Sees it and will not route** versus **cannot see it**. That cut is evidence-backed and does not depend on the
steering map's "the base did not move" criterion, which does not separate these two. The map's criterion still
holds for that stub's other captures — record-only rebind minting a fix task, and staged-top status flipping.

### `delivery-rebuild-continuity` — disjoint by lifecycle side

Private-chain and base-movement-driven; this work unit is public-side and post-landing. Its own draft records the
same split and states that this work unit ships first, because it is the recovery route that makes a stacked
landing safe to attempt at all. Its rows — the eligibility window, the materialization window, delivery authoring,
rematerialization — are not owned here.

**One doctrine reaches this work unit from there.** That work unit also carries the routed ceremony-repetition
rule — _a ceremony repeats only when a covered input changed, and head or base movement is never itself a covered
input_ — under an explicit constraint that it land in a shared rule or strategy that non-delivery ceremonies reach,
not in any delivery-scoped document. The two rows classified `redundant ceremony` above are that rule's absence
seen from this side, so cite it once it lands rather than restating it here. Its capture disowns
refusal-remedy-accuracy work, which is the execute-bound Errand's, and that Errand's sites do not include
`native-landing.ts` — so the guidance defect in § Axis D sits below both and stays here.

### Merge queues — compose with, do not adopt

Adopting a merge queue is a recorded non-goal, retired at the characterization's design as "not the remedy for
ARC-only re-ceremony". That stands. What does not follow from it is indifference to a project that runs one.

A merge queue is a head-mover. Its landed commit is generally not the head the change was reviewed at — a
speculative integration branch produces a new commit, and rebase-style submit strategies rewrite on the way in.
Whether that reaches ARC's readers depends on a detail source settles against the stronger claim: both compare a
change-request head rather than the landed commit, so a queue that leaves the request head alone is orthogonal
to this comparison. A rebase-style strategy that moves the request head is not, and that is the case the
constraint below covers.

Carry it as a constraint, not a feature: whatever replaces the equality comparison must not assume the landed head
is the head ARC bound. Current compatibility is **unverified** — every enumerated row moves the head from inside
ARC, and no probe covers an external mover.

### `review-source-authority` — the acceptance-primitive seam, routed not taken

This work unit no longer mints a waiver record at all: the terminal member's acceptance is the Candidate
applicability selection ARC already carries (§ The waiver record joins an existing family). That **sharpens** the
seam rather than dissolving it, because there are now three instances of one shape in the tree — an Owner
accepting a review terminus, an Owner accepting a review contribution's applicability, and an Owner accepting a
Candidate movement whose contribution ARC cannot prove — and the third is the one this design consumes. Whether
they should consume one abstracted acceptance primitive is a real question and it is **not this work unit's to
answer**.

`review-source-authority` owns a live defect in the terminus's binding — the acceptance is dropped when the
Candidate advances, and the frontline lane refuses an Owner terminus outright. An abstraction authored here would
be authored against a shape that work unit is about to change, which is the premature-abstraction failure this
draft already names twice on other seams.

So the discipline is the one used for the merge-base primitive and for the obligation payloads: **use the
existing mechanism, add no abstraction, and route the seam.** Consuming the applicability selection rather than
minting a sibling record is the strongest available form of that discipline — it adds no vocabulary at all, so
whatever unification that work unit reaches finds one fewer instance to reconcile. Capture the seam to it at
planning close.

### Errands in flight

- **Refusal-remedy accuracy** (`execute-bound`, started in the primary checkout). Determinate diagnostic and argv
  correction across the integration checkpoint, its advisory register, the drift continuation, and teardown. It
  lands first and gives this design a corrected baseline. It must not invent the missing post-landing transition.
  **Consequence for this draft:** every refusal string quoted above is pre-Errand. Design against the decision each
  verb reaches, not against its current prose.
- **Append-only terminal movement in session-init delivery position** (`execute-bound`). Owns the
  `status.ts:1100` call site, which passes no observation options today. **Not downstream of this design** —
  settling the substrate showed that neither the admission option nor the movement fact changes shape, so it
  ships in either order. Its capture carries the `position` verb's routing precedent for the fix.
- **Checkout identity through an authorized integration operation** (`execute-bound`). Adjacent; durable
  authorization and resumable-frame design are reserved to `recovery-hardening`.
- **Two EA-landing Errands** — registered-native route selection, and sequential prepare-to-apply readiness. Same
  files, different failures; coordinate on landing paths.

---

## Retained capture detail

Preserved from the two routed captures, which are otherwise integrated above. Their provenance: both routed from
`USER-INBOX § Work Unit` at the `concurrent-integration-characterization` close-out, 2026-09-14; captured during
`evidence-applicability` M1 post-landing recovery (2026-09-13) and terminal landing dogfooding (2026-09-14).

**Success criterion.** After a real overlapping base change prevents the host's rebase of a successor, the CLI
returns an exact actionable resolution offer; approved successor and top resolutions can settle the retained
operation and continue the delivery. New member heads receive fresh applicability, review, and checks before
landing. Stale decisions, undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous
host results still refuse without claiming clearance. Cover conflicting and clean suffixes, terminal-top conflict,
and interruption/retry with Git-backed and handler-level tests, including no duplicate merge submission.

**Boundary.** Do not weaken repository-wide contribution proof, relax exact-head host merge protection, weaken
terminal absorption checks, treat a new commit id as a fresh review obligation, accept arbitrary state edits, or
fold in unrelated prepublication authoring and review-fix convergence. A conflict-free virtual merge alone does not
establish evidence carry. Never infer disjointness from it. Preserve fail-closed treatment for unresolved
substantive overlap and stale coordinates. The Owner-directed one-time recoveries that unblocked the live instance
are operational unblocks, not evidence that the durable mechanism is complete and not a general escape contract.

**Design obligations carried forward.** Record the verified predecessor effect once and admit an attended
resolution for the remaining registered suffix and excluded terminal top. Bind the decision to the exact plan,
operation, state revision, observed suffix, member identities, before/after refs and trees, and conflict paths.
Require semantic approval only for the disclosed conflicted contributions; continue mechanical proof for every
other movement. Reobserve host effects and refs, use lease-checked publication and revision-checked state writes,
and make interrupted retries converge without resubmitting a landed member. Carry a current terminal binding
through review readiness and lock release. Include the Candidate producer and its recovery path.

**Files.** Native landing and suffix reconciliation (`native-landing.ts`), delivery execution request/result
schemas, contribution and terminal absorption composition, base overlap/drift analysis,
`git-candidate-applicability.ts`, integration checkpoint composition, exact-base merge continuation, the
`deliver-stack` workflow, and focused unit/integration and delivery terminal integration tests.

**Dropped deliberately in this consolidation.** The origin captures' verbatim observation paragraphs, whose
content is now carried by § The failure family with the probe evidence that supersedes the field narration; and
their per-capture `_Approach:_` framing, whose corrected readings are recorded in § What the field record got
wrong. No success criterion, boundary, or file pointer was dropped.

---

## Adversarial pass record

Five passes have run (2026-09-16) against a `Heavy` cap of two, the fifth certifying and returning not-ready. Its
two products are kept here rather than in session state: a later pass consumes both, and a draft that sends its
reader elsewhere for them is not the complete input it claims to be.

### What the fifth pass cleared

Its withstood set, verified against source and returned as checked. A later pass re-attacks any of it only on new
evidence, never on re-reading — which is what the `[certified]` marker in § Continuity points at.

- Both recorded sweep commands reproduce exactly: merge-base at fifteen sites with seven silent picks, and
  `--is-ancestor` at nineteen sites across eighteen files.
- `scripts/base/merge.ts`'s two-direction derivation.
- Axis D's structural invariance in `git-contribution-proof.ts:89-128`.
- The four-arms-two-share-the-shape guidance count in `native-landing.ts`.
- The movement substrate settlement in full.
- The readiness lookup elimination and the `stateMemberMatches` guard.
- `repository-target.ts`'s scope-in trace through identity, admission, and change-set.
- The fourteen-condition closeout arithmetic.
- The acceptance-family schemas as quoted.
- `predecessorRelation`'s collision as real rather than rhetorical.
- Readiness-bar criteria two and three.

### What the fifth pass found, and where each landed

The seven findings, carried as `prior-findings` for the sixth. Outcomes are tracked; the pass transcript is not
retained, so nothing below should be re-derived from one.

- **Blocker — the obligation write settled two incompatible ways across five sections.** Swept. The terminal gap
  it exposed became an open structural item, itself since settled on probe.
- **Blocker — the waiver's second `kind` either discharges hosted review for an unreviewed head or has no named
  home.** Shape kept, placement reopened; since settled on the Candidate applicability selection instead.
- **Blocker — the excluded terminal top has no resolution mechanism.** Scoped in by the Owner; its probe has
  since run and closed.
- **Blocker — abort was tagged detail-design on a premise source refutes.** Re-tagged structural; since settled
  on the settle path's mutation order.
- **Major — the relation's contract shape was settle-able and had been filed as detail.** Settled as a wrapped
  four-variant relation.
- **Major — three in-scope base-readers were absent from the classification.** Classified, and the split's count
  corrected to five and four.
- **Minor — the encumbrance-pair site set was short by one.** `public-review-continuation.ts:71` folded in.

**One finding carried a wrong number, and the correction is this draft's rather than the pass's.** It claimed the
only non-settle clear of `activeOperation` is `residue-reaping.ts:374`. There are six. The conclusion survives,
because none of the six is a _decline_ route — the nearest, `native-landing.ts:663`, fires only on a
`not-applied` effect — and the body now states it that way. Do not re-import the original number.

**Two of the four blockers were regressions rather than latent depth**, both produced by settling a premise
without re-deriving what stood on it. That is the failure the settle-time dependency sweep in § Next exists to
stop, and it is why a sixth pass is worth spending rather than evidence that the loop will not converge: the
other five findings were depth no earlier pass had reached.

---

## Pinned probes

Eight probes hold this boundary's behaviour as it stands. They **pass today**; each fails the moment the behaviour
changes, printing the sentence that names what it was waiting for and the exact replacement:

> This now produces the result it was waiting for, so the hold is spent: replace this call with a plain
> assertion on `<result>`.

Retiring them is part of this work's scope rather than a regression — a fix here cannot merge while one is red,
and each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary.

- `review-readiness-delivery-binding.test.ts` — "reports nothing bound when a member's head advanced without
  changing its contribution"
- `delivery-binding-head-movement.test.ts` — "reports a terminal unsettled when the host merged it past the head
  it binds"
- `history-shape-ambiguity.test.ts` — "reports the base's own change as the contribution when two merge bases exist"
- `history-shape-ambiguity.test.ts` — "reads the ambiguous subject against the one the same branch work produces
  unambiguously"
- `history-shape-ambiguity.test.ts` — "refuses with a typed reason rather than choosing one of the two bases"
- `history-shape-ambiguity.test.ts` — "collects a staged subject from one chosen ancestor when two merge bases
  exist"
- `history-shape-ambiguity.test.ts` — "reports the overlap unavailable rather than proving it from one of the two
  bases"
- `review-status-base-movement.test.ts` — "directs a checkpoint rerun on a base that moved only in shape"

**The staged-arm pin landed 2026-09-16, and it is shaped differently from its siblings on purpose.** It holds an
_outcome_ — collected, where the settled rule says refused — rather than a path set, because closing it surfaced
that a path set is not a stable observable over an ambiguous history. `git merge-base` without `--all` returns one
best common ancestor and does not say which, so the collected paths are whichever half that choice exposes.
**Its committed-arm sibling binds to exactly that**, and was observed once during a twelve-worker run reporting
`[branch-side]` — its awaited result — where three other runs reported `[base-side]`. On that run the hold read
as _spent_, which is a false retirement rather than a fix. **Repairing it is in scope**, taken by the Owner
2026-09-16 on the ground that retiring these pins is already this work's, and a hold that can read _spent_
without a fix is not evidence. Which repair is § Open's. Until it lands, do not read a green run of that pin as
evidence of anything.

A ninth row is owned here and **deliberately unpinned**: `delivery-rebuild-base-movement.test.ts` — "returns the
identical refusal after the operator resolves the conflicted path". It proves the named remedy does not clear the
refusal, which no other test asserts, and the refusal itself is correct.

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behaviour neither shape names. That is a finding, not a retirement.

**One planning probe sits beside the pins rather than among them**, written 2026-09-16 to settle the
terminal-member cluster: `probe-terminal-waiver-applicability.test.ts` carries two cases. The first drives a
conflicted absorption through an operator's hand merge, the adoption branch, the contribution proof, the
applicability decision, and a `covered` selection. The second builds the post-landing shape — predecessor landed,
base moved on the colliding path — and asserts both the resolved top's parent line and the exact applicability
outcome it produces, including the evidence reduction that disagrees with the choice offered above it.

It is not an `expectPinnedObservation` call, because its halves face opposite ways: the adoption assertions hold
behaviour this design intends to change, while the applicability and derivation assertions hold behaviour it
intends to keep and build on. Convert the adoption assertions to a pin when the admission route lands; keep the
rest as ordinary regression coverage. Its value now is that the cluster's load-bearing claims are measured rather
than reasoned — including the two that came back other than expected.

**A second planning probe settles the checkpoint's trigger**, written 2026-09-16 after the sixth pass found the
gate attributed to a verb that never runs here. In `delivery-public-review-continuation-git.test.ts`, "produces
no advance proof for an operator-absorbed top the Candidate does not reach" builds a real absorption — a
two-parent commit over the recorded parent pair whose tree is neither parent's, because a person chose its
content — records it in the terminal coordinate exactly, and asserts that
`projectGitDeliveryTerminalCoordinateAdvance` still returns no proof. The recorded-tree check passes and the
ancestry term is what refuses, which is the link the draft had been asserting rather than measuring. It holds
behaviour this design keeps, so it is ordinary regression coverage rather than a pin.

---

## Evidence base

The recorded observations and the reasoning behind each awaited result are in
`notes-concurrent-integration-characterization.md` — § Second matrix for the axis derivation and the
eighteen-failure table each cell traces to, and § Second-matrix probe rows for the readings above. Read those
rather than the first matrix, whose `tolerates` verdicts cover base movement only and are not coverage of this
surface.

§ Established practice rests on a bounded survey rather than an exhaustive one, and its footing is uneven. Read
from primary sources: Git's revision grammar and diff definitions, and Gerrit's change-kind, copy-condition, and
shipped label config. Derived and then confirmed empirically here: cardinality above one implying divergence.
Weaker, and worth re-checking before anything load-bearing rests on it: Mercurial's bid-merge rationale comes from
a wiki page of roughly 3.0 vintage, and "no system refuses on cross-base disagreement" is an absence rather than a
citation.

The 2026-09-16 approval-carry survey adds primary sources on the escape-hatch question: Gerrit's `config-labels`
change-kind definitions and the shipped `copyCondition` in `AllProjectsInput.java`, GitLab's approval-settings
documentation including its `patch-id` reset rule, GitHub's branch-protection and ruleset documentation, and
Phabricator's `differential.sticky-accept` default in source. Two cautions carried from it. **"No system offers a
typed per-change override" is an absence, not a citation** — it is deliberately given no weight above, where the
argument rests instead on what the mechanisms positively permit. And **GitHub's dismissal default is inferred**
from opt-in phrasing rather than stated, so nothing here should rest on GitHub's default specifically.

§ The relation rests on source read 2026-09-16 rather than on survey: `scripts/base/merge.ts`'s two directional
reads and their states, the ancestry helpers' return shapes and executor split, `DeliveryMemberSelector` and
`stateMemberMatches`, the absence of any production constructor for the `ref` arm, and the integration test that
pins its conjunction. The hand-rolled-helper count is measured rather than bounded as of 2026-09-16 —
nineteen `--is-ancestor` invocation sites across eighteen files, sweep command recorded in § The relation,
third-value split spot-verified at three sites. It still bounds a repetition rather than enumerating a work
list: § The relation's scope guard converts none of them.
