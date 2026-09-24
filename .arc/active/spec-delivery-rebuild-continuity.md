# Spec (`detailed` · `RFC`): delivery-rebuild-continuity

- **Origin:** [internal]

- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified Candidate
  evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a ceremony the
  covered inputs did not change.

---

## Introduction / Context

A delivery plan lands one work unit as an ordered stack of members. Before publication a plan owns **no member
heads at all**: `refs/heads/delivery/*` is the _published_ namespace, where writing a member ref is itself the act
of publishing, and members exist only as observed cuts of the work-unit branch's own history. What does exist
privately is the plan-derived, checkout-paired candidate namespace the correction routes and the review gate read.
Eligibility is **prepared** once and **closed** later — two separate observation windows, today with a full Tier 2
pass across every member running in detached worktrees between them.

Two independent failures are proven from field incidents, and the second consumes the first.

**The chain cannot be rebuilt through a typed operation.** Initial unpublished stack authoring exposes plan-derived
candidate locators but constructs nothing: recovery means hand-authoring normalized trees, lifecycle and Candidate
exclusions, commits, leased private-ref updates, and detached candidate checkouts. The bound correction route has the
same hole from the other side — the correction controller authorizes a fix on the top authoring locus and tells the
session to cut the affected suffix, but exposes no operation that constructs one, so re-entry dispatches
rematerialization against unchanged private candidates and deterministically refuses `completeness-mismatched`. That
is the first stop, not the last. Past a hand recut, the route's terminal carry proof compares a lifecycle-bearing top
raw and refuses every work unit on its lifecycle paths; the first correction's acknowledgement expects a boundary
publication never writes; and past that, the continuation stops at the first position read after the
acknowledgement's own record commit. The route has run end to end exactly once, on a hot-patched bundle.

**Evidence justified against the old chain does not survive the rebuild.** The eligibility close refuses
`source-moved` on _any_ protected-base movement after the entire window has been proved intact, so disjoint
movement that touches no member path still forces a full re-prepare and re-gate. And a rebuilt chain reaches the
Candidate applicability seam through a door that throws it away: the effective-target projection composes a
complete `covered | targeted-check | changed` decision carrying its offer text, its choices, and its projection
and residual digests, and the delivery reconcile arm collapses every non-current result into one opaque
`candidate-not-current` refusal. Read through the review gate's own doors that projection reaches the operator;
read through delivery's, it dead-ends.

**A published stack cannot take a conflicting base move.** A third failure, independent of both, sits on the published
side. When `main` moves with a change that overlaps an unlanded published member, the member cannot land until it is
restacked onto the base, and that restack needs a hand resolution neither refresh route admits: a registered stack's
whole-stack refresh prepares a resolution workspace, imports the operator's resolution, and refuses it on scope, and
adopting an operator's own restack refuses any conflicted member on either stack shape. The consent both routes
implement is reachable only through a selected review fix. And once the top merges `main`, as two of the five stacks so
far did, every refresh arm without a selection refuses the top's movement, so even a clean restack has no route.
Conflicting restacks are routine wherever work runs in parallel — a third of the delivery refresh and absorption merges
recorded here since 2026-08-28 carried a conflict resolution — and one stack crossed exactly this case by hand.

The per-member gate pass between the two eligibility windows is a fourth finding, and it is the one that moved. Gate
results have no home outside the session transcript, so the workflow has the operator hand-compose the result list, pipe
it to the close, then supply the same list again to publish. That durability gap is real; this work unit answers it by
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
2. Disjoint protected-base movement re-observes eligibility and closes eligible rather than refusing, while
   movement overlapping content a member actually authored still refuses and names that member.
3. Publication refuses a chain prepared against a Candidate its attestation no longer covers, by reading evidence
   the work unit has already produced rather than by running verification of its own.
4. A refusal names which side moved and what would clear it, and a remedy a refusal names can actually clear it —
   including a rebuilt chain's applicability, which reaches the operator's decision rather than an opaque refusal.
5. The covered-input rule is stated once, in a surface every post-execution ceremony reaches, rather than
   re-derived per lane.
6. A published stack whose base moved with a change overlapping an unlanded member reaches landing through one
   resolution and one consent in either stack shape, with the resolved member's review re-admitted at its exact head
   rather than carried.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This work unit owns prepublication delivery authoring and recovery ergonomics, private candidate reconstruction after an
approved delivery-member fix and the correction continuation's reach from that fix to the rebuild, where per-member
checks run relative to publication, the admission of a consented conflict resolution when the base moves under a
published stack, with the disclosure that also reaches the selected review fix's and the native post-landing consents,
the refresh arms' admission of a top's append-only movement and delivery entry's reading of it, preservation and
reassessment of evidence while private delivery preparation changes its observation window or exact targets, and stating
the covered-input rule and choosing its surface.

It does **not**:

- implement provider restacking, add a kind of public Delivery State write, or change the published-side refresh path
  beyond § D9's admissions — a consented conflict resolution and the top's append-only movement. The duplicated top
  absorption that path carries stays out, routed as its own work unit (§ Alternatives & Rationale). The bound correction
  route's rematerialization keeps making the writes it makes today, over a rebuilt suffix and a terminal that may carry
  a base the top absorbed, widened only so that the first unlanded member's rewrite may advance the target append-only
  when the chain re-anchors (§ D4). The one shared piece is the private pair coordinator both routes call: D4's
  candidate-checkout rename and dirty-path widening reach it there without changing what that route does;
- choose review policy or finding dispositions, widen the repository-wide integration lane, or weaken review or
  gate obligations;
- change review-fix authorization or consumption beyond a fix response following the selected member's moved base
  (§ D8), or retire a pending delivery review-fix authority;
- rewrite public history, or redesign Tier 2 membership or cost, proposal-side review scope, or host/checkpoint
  authorization;
- own general recovery orchestration, audit every ceremony against the covered-input rule, or retrofit the
  boundaries the characterization found repeating;
- add a generic evidence store, an ancestry-only carry, or an arbitrary evidence-kind framework;
- define any project's check policy, or require that every published member be checked in isolation — which checks
  run against a published change request is the project's own configuration (§ D6);
- add a bounded in-call recheck of the protected tip after the target is bound (§ Alternatives & Rationale);
- reap the malformed `delivery-gates/` directories already on disk — that is an Errand's, not this work unit's.

**Adjacent owners.** `review-checkout-lifecycle` holds the frontline review path's ephemeral checkout — its registration
and its retained diagnostics — and hands chunk projections to `chunk-scope-binding`. Delivery's own checkouts are a
different family: candidate checkout and resolution paths derive from plan identity and the residue reaper owns them —
the resolution paths once § D4 has it reap them — so neither is that work unit's. Refusal-remedy accuracy is
execute-bound and routed as an Errand. `review-signal-convergence` owns disposition supersession, which completes the
remedy of the bound later-member stop where the selected member is unchanged (§ D4). Concurrent gate-process exhaustion
stays with `test-suite-contention-hardening`. `delivery-correction-convergence` keeps the record-only convergence loop —
a correction whose own record writes reopen applicability although nothing moved — and its closeout and diagnostic
hygiene. What left the bound correction route unreachable end to end came here, because a constructor the route cannot
reach delivers nothing: the terminal's carry proof comparing a lifecycle-bearing top raw (§ D4), and the two controller
refusals a correction meets once the top advances or its first acknowledgement lands (§ D8). The singleton record-write
stale-boundary arm went to `singleton-integration-continuity`, whose tail it is. Two landing-path defects are routed as
Errands rather than carried: a sequential landing's carry proof taking the plan's moved target as a later member's
predecessor, and a conflicting member's landing reaching no typed refusal, whose remedy is the refresh route § D9 opens
to a conflicting restack. The retired `wu-integration-target` projection and the late plan revision did not create the
plan-derived gate paths and are neither cause nor remedy.

## Proposed Design

### Boundary outcome and delivery shape

**`stays one WU + delivery-plan candidate`.** The concern stays cohesive — every deliverable below is the same mechanism
(a delivery chain whose sources move under a plan — the base, the top, or a correction) observed at a different
lifecycle position — and its deliverables are each independently landable on `main`, which is the delivery-plan test
rather than the decomposition test. Evidence basis: prepublication evidence applicability consumes verified rebuild
endpoints and its implementation must coordinate with authoring; and the source read below establishes that D1, D2, and
D3 land without the constructor. Decided planning judgment — re-raise only on a material new-evidence delta. This spec
is authored slice-aware; it publishes and binds no delivery state.

The boundary was widened past the successor's original scope deliberately. The completed `evidence-applicability`
planning close cut this successor to the overlapping and interrupted-authoring cases — that work unit says _when_ a
rebuild is owed, this one says _how_. The consolidation widened it to disjoint movement and initial authoring as
well, superseding the narrower successor boundary rather than diverging from it.

The boundary moved once more on a material delta, and the outcome was re-read rather than assumed to hold. A source
triage found three of `delivery-correction-convergence`'s items on the critical path of every stacked correction — the
terminal carry proof, and the two continuation refusals § D8 removes — and this work unit exists to make stacked
delivery work, its own included. They came here; that work unit keeps record-only convergence. The outcome stands:
the three are the same chain observed at correction time, the terminal proof rides D4's bound route, and D8 is
independently landable.

It moved a third time on the same kind of delta. A published stack whose base moved with a change overlapping an
unlanded member has no typed route in either stack shape, the field has crossed it by hand, and the routed
landing-conflict Errand and D4's entangled-chain stop on the bound route both name the refresh route as their remedy — a
route that clears only a clean restack, and only over a top that has not merged `main`, until D9. The outcome stands: it
is the same chain with its base moved, observed at the published position, and D9 is independently landable. The refresh
arms' admission of the top's append-only movement, and delivery entry's reading of it, ride with D9 for the same reason:
without them the refresh route is unreachable once the top merges `main`.

Rows are in ID order; `Depends on` carries the delivery plan's dependency ordering, which is not a task sequence.
**The set is D1, D2, D3, D4, D6, D8, D9 — five and seven are unassigned and stay that way**, so a deliverable ID means
the same thing in the task list, the delivery plan, and every commit that cites one. D5 went with the
prepublication gate window it served (§ D6); D7 routed out of this work unit (§ Alternatives & Rationale); D8 came in
from `delivery-correction-convergence`'s re-cut and took the next unused number rather than a retired one, and D9 the
number after it.

| ID | Deliverable                                                     | Depends on        | Retires |
| -- | --------------------------------------------------------------- | ----------------- | ------- |
| D1 | The covered-input rule, stated in a shared surface              | —                 | —       |
| D2 | Eligibility close admits non-covered movement, per member       | —                 | probe 1 |
| D3 | Anchor and completeness refusals carry direction and remedy     | —                 | probe 2 |
| D4 | Member constructor and the close-side `rebuild-required` reason | D3, D8, D9        | probe 3 |
| D6 | Publication reads the attestation; projection reaches operator  | D4 (verification) | —       |
| D8 | The correction continuation reaches its rebuild                 | —                 | —       |
| D9 | Conflicting restack onto a moved base admitted under consent    | —                 | —       |

**D8 depends on nothing here, and D4's bound route depends on it.** D8's three changes sit in the correction
continuation's landed-prefix read, the acknowledgement's boundary carry, and the fix response the acknowledgement
records, none of which the constructor reads, and it unblocks every stacked correction whether or not D4 has landed —
the provider-refresh route included — so it is first-landable. The edge runs the other way: a top that absorbed a base
and was pushed is exactly the movement the continuation's landed-prefix read refuses at its entry, so D4's bound-route
coverage over such a top, which criterion 15 requires, cannot run until D8 has landed, and a re-anchored member's fix
response cannot be acknowledged before it either. D4 depends on D3 for its stale arm and on D8 for that verification,
mirroring D6's dependence on D4.

**D9 depends on nothing here, and D4's entangled-chain stop depends on it.** D9 changes the published-side refresh and
adoption paths and delivery entry's reading of a moved top, none of which the constructor reads, so it is
first-landable. On the bound route D4 re-anchors an overlapping chain itself, and only its entangled-chain stop names
the refresh — run around the set-aside correction, over a top that merged `main`. That clears only with D9: the refresh
arms then observe the moved top, and the restack that conflicts is admitted under consent. So D4 depends on D9 for the
remedy that stop names. Landing it early unblocks the other held stacks soonest; this work unit's own delivery runs the
top's build, which carries D9 whatever the landing order.

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable. That member also carries the removal of the per-member gate operand, which
is what closes the window D2 would otherwise open between its own landing and D6's: with per-member gates gone
there is no gate result left to reuse across the base movement D2 has just taught the close to admit, and only
the landing that removes them can close it. The cost is named rather than hidden — it makes the deliberately
safest first member also the largest single mechanical change here.

**No gate-reuse window between members.** D2 removes the blanket `source-moved` entry that forces a re-gate on any
base movement, and nothing downstream has to restore a narrower form of that coverage: with no per-member
prepublication gating there is no reusable gate result to guard and no gate definition whose drift could be missed.
That is the window the earlier D2-before-D6 concern named, and it is closed rather than accepted.

**One transient is accepted rather than absent, and it is named.** The `gateResults` removal rides the D1+D2
member while the attestation read that replaces it is D6, which depends on D4. Between those landings `arc delivery
publish` reads no verification evidence of its own — strictly weaker than today, and the state § Alternatives
rejects as a destination. It is accepted as an interval because `prepare-work-unit` still refuses without a
work-unit attestation upstream, so the unit is verified even while publication does not check it, and because the
gate-result list it replaces was never an independent witness. Landing D6 earlier is not available: it depends on
D4, and holding the operand until then would keep per-member gate results being reused across exactly the base
movement D2 has just taught the close to admit. This is the stack's one accepted inter-member risk, and it is the
one place a member's landing order is constrained by one — disclosed at the landing rather than discovered there.

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
consumed by whoever designs a ceremony boundary rather than by an executing session deciding whether to run a gate,
and belongs in the strategy. The **restrictive** half — changed covered inputs prevent unsupported reuse — reads as
a constraint and is placed **at the fire site** rather than only in the strategy: D2 is that placement for the
eligibility close, and `DEV-RULES.ARC` § Rule Authority already holds the check-integrity backstop that makes an
agent-side reuse decision invariant. So the constraint half lands where its operation fires and the strategy
carries the generalization.

**The load-set-scoping irrelevance defect does not bite here.** That recorded defect governs _demoting_ content with
no trigger. Nothing is demoted: this adds to an on-demand surface that already has a correctly-scoped trigger, so
the reachability clause applies rather than the demotion one.

**The firing condition was read rather than assumed, and it reaches.** The `STRATEGY-INDEX` entry fires "before
designing or changing one work unit's publication boundary, delivery landing window, terminal merge authority, or
post-landing closeout." It does not name review admission, the section the rule lands in — but its **first and
fourth clauses are work-unit-generic rather than delivery-scoped**, so a non-delivery ceremony designer working the
post-execution tail is reached by the trigger as it stands. **No widening rides D1**, and the always-loaded set
does not grow.

### D2 — Eligibility close admits non-covered movement, measured per member

`source-moved` is the last check in the mechanical close — a flat loop over `[protectedBase, top, ...members]`
comparing head and tree, reached only after predecessor relation, chain base, lifecycle paths, normalized
completeness, plan revision, and member bindings have all passed. `top` and `members` must not move, because the
snapshot's per-member coordinates are what the close validated the chain against. `protectedBase` moving
invalidates nothing inside that function: every other read of `snapshot.protectedBase` there takes the **recorded**
value (the relation recomputation's `observedTip`, the normalized-completeness tree, the chain-base value shortcut,
and the refusal payload's inert `protectedBaseRef`).

Two facts make a naive deletion wrong. The close **cannot currently see base movement at all** — the relation is
recomputed from two snapshot values over immutable commits, so it is deterministic and exists for snapshot
integrity, not fresh observation; drop the loop entry and genuinely overlapping movement passes unseen. And
switching `observedTip` to the live tip trades one refusal for another, because `samePredecessorRelation` compares
`observedTip` first, so any movement — disjoint included — refuses `wrong-predecessor`, and the relation _kind_
moves legitimately too (a member cut from the old base reads `advanced` against it and `diverged` against the
advanced one). What survives as the invariant is **`chainBase`**, recorded by value at prepare and therefore still
pinned as `refs/heads/main` moves past it — that pin is what the members were cut from.

**The guard's operand is per member, and every chain-wide operand fails.** Today's guard measures the **first**
member alone, so movement overlapping a later member yields an empty intersection and passes. Widening it to the
final candidate does not fix that and introduces two defects of its own. The existing analyzer is a two-endpoint
tree diff from a merge base, so a member that absorbed a base merge into its own range has that base content in
its own left set and refuses on content it never authored. And the chain-wide right set can omit a contested path
entirely: where an earlier member authored a path that a later member then absorbed, the base-to-chain
intersection is empty while the earlier member genuinely conflicts. Measuring a chain is the deeper error —
members land **individually**, so the question a refusal must answer is per member by construction.

**Authored means a commit set, not a tree diff.** Member _k_'s authored paths are the paths touched by the commits
in `m_k ^predecessor_k ^tip` — the commits the base does not already contain — which excludes absorbed base
content wherever the merge sits. A merge commit's authored content is its conflict resolution, which exists only
in the merge, so the read takes the **combined** diff: on a constructed merge whose resolution is a member's only
touch of a contested path, combined diff reports that path while both the default walk and `--no-merges` report
nothing. The right-hand operand is the base's own movement the member has not absorbed, `merge-base(m_k, tip)..tip`.
Both halves have precedent and neither is the read itself — `rev-list` ahead-sets exist but read commits, not
paths, and per-commit `diff-tree --name-only` has ten call sites while combined diff has none — so this is one
small new primitive, named as such.

**The change is six coordinated parts:**

1. Re-observe the predecessor relation against a **live** protected-base read.
2. Move the substantive-overlap guard **out of the relation** into a per-member walk at **both** prepare and
   close, measuring each member's authored commit set against the movement it has not absorbed.
3. Reduce the relation to variant plus `chainBase`, dropping its overlap read for a merge-base supplier over the
   exported sole-merge-base resolver.
4. Re-scope `samePredecessorRelation` to compare `chainBase`, dropping `observedTip` and kind equality.
5. Retain the protected base through a pinned check ahead of the final loop, observing the recorded **head**
   rather than its ref. It is **not** an entry in the narrowed loop and must not be written as one: the loop's
   refusal is `source-moved`, whose payload composes a reprepare `nextAction` from the ref that moved, and nothing
   has moved here — reprepare is not the remedy. The check runs ahead of the loop with its own dispositions: an
   absent object is `evidence-unavailable`, and a resolved commit whose tree disagrees with the snapshot is
   snapshot fabrication, which reprepare cannot clear. A commit's tree is immutable, so this check cannot refuse
   on base movement, which is the whole point of the narrowing, while it still catches the fabricated or reaped
   snapshot the loop catches today.
6. Only then narrow the final ref loop to `[top, ...members]`.

This list is **not** a re-scoped relation operand, and must not be written as one. The relation keeps one pair —
the first member and the live tip — for its variant and `chainBase`; the guard leaves it entirely. With the guard
gone, `relation.overlap` and `relation.mergeBase` lose their last readers and leave the relation type rather than
lingering as unread fields, and the recorded `predecessorRelation` becomes provenance compared on `chainBase`
alone rather than a close-time equality target.

**Both sites place the guard where today's first-member guard stands**, inside the function that computes the
relation, so it consumes that function's own live base read and no tip is threaded across a call boundary. At the
close that is the current `diverged`-with-substantive-paths check, widened to a loop over the snapshot's members
and left **above** the relation comparison and the chain-base check: admissibility is decided before those
comparisons because a snapshot carrying content it may not proceed over reobserves identically and compares equal.
Prepare derives each predecessor as it goes — the chain base for the first member, the previous member afterwards
— so its guard rides the candidate loop that builds them, after the empty-candidate check, which also means a
candidate that is not a member is never measured. The close receives every member whole in the snapshot and needs
a loop in place rather than a loop to ride. Because the guard sits below the mechanical close's single convergence
point, the non-publication close carries it by construction rather than by its callers happening to run prepare
first. Each site binds its own tip once — prepare the base it observes when the window opens, the close the base
part 1 has it re-observe — so no rule is owed for two live base reads disagreeing inside one close.

**The measurement takes one new eligibility dependency, not a scatter of thin ones.** It takes the member, its
predecessor, the live tip, and the work-unit id, and returns the existing overlap reader's own result union so the
`ambiguous`, `unrelated`, and `unavailable` arms keep their current dispositions. Inside, it composes pieces that
already exist — the exported sole-merge-base resolver, a base-side changed-path read from that merge base, and the
path-treatment classifier under the work-unit treatment context — around the one new primitive above. The existing
overlap reader cannot serve: its successful result exposes only the merge base and the classified intersection,
never the base-side path set on its own, and its left set is the two-endpoint tree diff this deliverable rejects.
One method is one test-double obligation per implementer, against two production implementers and six test and
helper files. Net dependency count across both dependency types is **+1**.

**The intersection classifies exactly as the existing overlap does** — reviewable, evidence-neutral, regenerable,
with the refusal reading only the reviewable set. Without that step a base regenerating a lifecycle document
collides with every member that touched it. The walk runs on every relation variant rather than only `diverged`: a
member the tip already contains has an empty commit set by construction, since `^tip` excludes it, so the rewound
case is a no-op rather than a special case. The ambiguity count goes from one to _n_, since each
`merge-base(m_k, tip)` can be criss-cross; all of them take the existing `ambiguous-predecessor-base` refusal and
its `git merge` remedy, with `detail` naming the member.

**Attribution falls out of the measurement rather than costing a separate derivation.** Both refusals today report
the first member's `deliverableId` beside paths drawn from the overlap, under a detail string claiming the movement
overlaps "this delivery member" — which a chain-wide operand would make false, a refusal misidentifying its own
subject inside the work unit whose Goal 4 is that a refusal names which side moved. Measuring per member makes the
member that owns the paths the member the refusal names, so no fallback to naming the chain is owed.

**The refusal's remedy text changes on this landing too.** Both refusals carry "Rebuild the delivery chain against the
observed tip; no safe automated rebuild command is available", which describes a rebuild on the observed tip — a base
the top may not have absorbed, which § D4 never anchors on. D2 restates it: merge the base into the top and resolve it,
then rebuild the chain from the top — by hand until D4 names construct as that rebuild — so criterion 9 holds at each
landing. The remedy holds on the bound correction route as well: there the correction controller dispatches construct on
the guard's refusal, and construct, which reads the top, clears it where the top has absorbed the movement and otherwise
refuses with this remedy (§ D4).

**The single-member chain is a case to verify, not one to skip.** It keeps today's merge base — `predecessor_1` is
the chain base — but not today's measurement: the left operand changes at _k_=1 exactly as everywhere else, from a
two-endpoint tree diff to the member's authored commit set. The two diverge precisely when a base merge sits inside
the single member's own range, which is the case the fix exists for.

**Residual A — the weakened snapshot-integrity check.** Dropping `observedTip` and kind equality weakens what that
comparison performs, and what survives is thinner than its five compared fields suggest: the close already refuses
independently when `snapshot.chainBase.head` disagrees with the freshly reobserved relation's chain base, and
prepare already binds those two together, so a `chainBase`-only comparison adds one intra-snapshot consistency
check rather than a second binding. The fresh per-member guard plus that independent chain-base refusal are the
real replacement. **Do not re-derive a duplicate comparison from the six-part list**; verification must instead
show that the replacement covers the fabricated-snapshot case the old comparison caught.

**Residual B — the enclosing verb's live reads stay as they stand, and one operand is pinned.**
`closeDeliveryEligibilityForPublication` runs two live protected-base reads _above_ the mechanical close
(lifecycle-path resolution from `refs/heads/<base>`, and each member's lifecycle-contribution revalidation, where
`deriveDeliveryMemberLifecycleRevalidation` passes a ref _name_ resolved live at `ls-tree` time while passing the
chain base beside it as a recorded OID). They refuse identically today, so D2 neither narrows them away nor
regresses them. The unpinned operand is pinned to `snapshot.protectedBase.head` — a one-token change — on this same
delivery member: it already edits the enclosing function, removing the gate-result operand beside this derivation,
and no other deliverable touches it.

**Verification obligations.** Disjoint movement closes `eligible`. Overlapping movement still refuses, including
movement that overlaps a **later** member and not the first, which today's first-member operand misses, and movement
that overlaps an **earlier** member which a later one has absorbed, which no chain-wide operand catches. A base merge
inside a member's own range is not mistaken for that member's authored content, including the **single-member** chain
where that merge sits inside the only member's range. The refusal names the member whose paths actually intersect. The
per-member ambiguous merge base takes the existing refusal. A base already carrying a later-member overlap when the
window opens refuses at **prepare** rather than only at the close. The fabricated-snapshot case the re-scoped comparison
no longer catches by `observedTip` is still caught. Once D4 lands, the same guard passes a **constructed** chain whose
members absorbed bases wherever it passes the uncut history, and passes the constructed chain where the uncut history
refuses only because a later member's merge resolved an earlier member's conflict with the base (§ D4). The fixture must
stop stubbing `resolveLifecyclePaths` to a single constant **and carry a non-regenerable lifecycle path** — its only
lifecycle path today is regenerable, and regenerable paths compare against the chain base rather than the protected
base, so un-stubbing alone leaves neither live protected-base read observable. A second, unpinned case in probe 1's own
file, which today refuses `source-moved` after a base advance and closes `eligible` afterwards, is rewritten alongside
the probe rather than retired with it.

**The per-member gate operand is removed on this same delivery member.** The window D2 would otherwise open — its
landing admitting base movement while per-member gate results are still reused across it — closes only from the
landing that removes those gates, not from a later one (§ Boundary outcome and delivery shape, § Workflow surface).

### D3 — Anchor and completeness refusals carry direction and remedy

The `completeness-*` refusal returns `{ status, reason }` and nothing else, while richer sibling refusals in the
same function carry `deliverableId`, `detail`, and often `relation` and `remedy`. This is why the authoring and
rematerialization cells produce byte-identical typed results for **opposite** conditions with **opposite** remedies.
Production order (dropped, then invented, then mismatched) means the reason today follows what the base change
touched rather than what the operator did — the same recut after a base advance that adds a path returns
`completeness-invented`. Direction is what disambiguates that.

**Direction comes from one ancestry call, not from a widened port.** Direction is not a tree question, so the
absence of a tree reader on the eligibility dependency interface does not bear on it. The normalized comparison
builds an expectation from the top and compares it against the final candidate, so a path present on both sides
with different content lands in `mismatchedPaths` whichever side moved it: the partition is **symmetric by
construction**, and carrying it forward reproduces the tie with more fields.

**What names a side is whether the chain's base is contained in the top.** Two conditions reach the
`completeness-*` refusal today, and they need opposite remedies. A **stale chain** is one the top has moved past — a review
fix, further work, or a base merge landed on the work-unit branch after the chain was cut — so the top holds content
the chain lacks, and the remedy is to rebuild from the top. A chain **cut on a base the top has not absorbed**
carries base-only content the top lacks — the 2026-09-13 incident's chain rebuilt directly on current `main`, and
probe 2's recut on the moved base — and the remedy is to recut on the top's own base, or to merge that base into the
top first when the newer base is what is wanted. A chain anchored on a base the top does not contain is the
authoring-side condition by definition, and one anchored on a base the top contains is routed to the rebuild. That
routing is right even where the chain is not simply stale: a hand-authored chain whose first member sits on the
top's base while a later member absorbed a base the top lacks reads as stale — built, and it does — and a rebuild
that takes every absorbed base from the top's own history clears it, which is the recut from the cut list. Construct
reading that chain as it stands refuses it before building, naming the member whose base the top lacks and that
recut, rather than importing the base (§ D4). The constructor never produces such a chain.

That reader is already declared and already wired. The eligibility dependencies declare `readAncestry(ancestor,
descendant)` returning `ancestor`, `not-ancestor`, or `unresolvable`, and one call — `readAncestry(chainBase, top)`
— distinguishes the conditions: `ancestor` is a chain on a base the top contains, `not-ancestor` is the chain cut on
a base the top lacks, and `unresolvable` takes the existing unavailable-evidence arm. This is **anchor
compatibility**, the question construct also asks before it builds (§ D4). It is not **cut compatibility** — § D2's
per-member measurement of authored content against unabsorbed movement, which decides whether an unchanged chain
survives disjoint movement. Under disjoint movement the anchor read is always true, so neither predicate stands in for
the other.

**The read sits at eligibility prepare, and again at the close.** Both heads it compares are in hand at prepare as soon
as the relation yields the chain base, so a chain on a base the top lacks is decided before any window opens: prepare
refuses it there, ahead of the per-member guard, as `wrong-predecessor` carrying the direction and the recut-or-merge
remedy. That reason already means the chain's predecessor is wrong, so the refusal union does not widen, and it is the
shape pinned probe 2 awaits — preparation refused, the close not reached — so D3 retires probe 2. The direction and
remedy attach only where the anchor read emits the reason. Its other emitters keep their own payloads — among them the
per-member guard's restated remedy (§ D2), and the member walk's refusal of a member that does not descend from the one
below it, whose remedy § D4 supplies. Read at the close alone, where the refusal sits today, the probe's hand recut
would still prepare and then refuse, and nothing specified would ever change what prepare returns. The close repeats the
read above its completeness comparison for the reason § D2 places its guard below the close's single convergence point:
a snapshot that reaches the close without this prepare is covered by construction rather than by its caller. So a
completeness failure the close reaches is the stale chain, always.

**Not whether the final candidate is contained in the top.** That read works only for a chain cut from the
work-unit branch's own history, where the terminal cut is a commit the top descends from. It fails on every chain
the constructor builds: a constructed member is a fresh object carrying its range's net contribution on a rebuilt
predecessor, and the top never contains it, so the read would report divergence on every stale constructed chain
and the close-side `rebuild-required` reason would never fire. Recording which top a chain was built from was
declined in each of its forms: an adoption-shaped terminal vehicle with the top as a parent makes the vehicle's
ancestry carry the whole work-unit history, which D2's per-member guard would read as the terminal's authored
content; the top in the vehicle's message needs a message-reading port; the top as a caller operand threads it
through publish, rematerialization, and the correction controller. Each pays to answer a question the chain base
already answers.

**The close-side `rebuild-required` reason needs no discriminator of its own.** With the anchor refusal ahead of
it, a completeness mismatch at the close is always the stale-chain condition, whose remedy is a rebuild through the
constructor; the authoring-side condition never gets that far. That stale arm is the correction controller's
construct-owed predicate (§ D4), which is one reason D4 depends on D3. The read also answers the objection that the
direction-decider named for the constructor carries no signal: the predecessor relation relates the **first
member** to the **protected base** and reads no chain-to-top ancestry, and this call is that missing read.

**The accepted consequence: content committed only in a candidate checkout does not carry.** The stale arm rebuilds from
the top, which follows from § D4's principle that the work-unit branch is the shared working history and a member is a
derived presentation of it. It is safe in routine operation, which was walked against a representative delivery sequence
rather than assumed. The completeness refusal is reached by exactly four callers — the eligibility close verb,
publication, the bound rematerialization route, and the pre-publication review gate — and on none of them does the
workflow have anyone commit in a candidate checkout. Pre-publication review fixes land on the top: the Candidate
projection reads the work-unit checkout's `HEAD`, and the review gate skips member-target composition while an approved
fix is pending. The workflow's step after an approved fix is construct, placed on the member the finding was raised on
(§ D4), so the next composing pass reads a rebuilt chain — the pass reviewing the fix itself composes nothing, since it
reviews the retained target the pending fix names; where that step is skipped, the next composition reaches the stale
arm, which names the rebuild that picks the fix up — the backstop on this caller rather than its routine path. A base
merge into the top classifies the same way. The one route where an operator authors in a candidate checkout — provider
refresh, for a registered member — runs no completeness close at all. What remains is an off-workflow hand commit into a
candidate checkout, which is the hand-authoring D4 retires. **Two disclosures cover it, and neither is a mechanism:**
the stale-arm refusal text says the rebuild is taken from the top and that content committed only in a candidate
checkout does not carry, and D4's `deliver-stack.md` edit states that candidates are derived from the top and authored
there (§ Workflow surface). The refusal text reaches the operator on the pre-publication review gate only once that
caller stops dropping it, and the drop spans three type sites rather than one mapping: the composition's refusal type in
`pre-publication-delivery-targets.ts` carries `reason`, `deliverableId`, and `detail` but has no remedy field;
`PrePublicationComposition`'s refused arm in `pre-publication-request.ts` carries only a reason and a code; and the
request sentence composed there keeps the reason alone. D3 carries detail and remedy through all three, taken as a
deliberate addition to its scope, because without them the direction and remedy never reach the operator on that caller.
The frontline run's response binding reads the same composition and throws a generic mismatch whenever it does not
compose (`handlers/review.ts`). That one stays opaque by decision: it is a staleness check — the binding no longer
matches the current Candidate and plan — and its remedy, re-requesting pre-publication review, surfaces the full
payload. Refusal-text accuracy beyond that is the routed Errand's. A detector refusing a candidate that holds content
the top lacks would be more exacting than the idiom — stacked-change tools regenerate presentation branches from their
source and force-update them without such a check.

So D3 is the prepare-side anchor refusal and its repetition at the close, the stale arm's enriched payload, and the
pre-publication request's three type sites above — **not** a port widening, a refusal-union widening, and three
collapsing-site updates. Any task decomposition that reproduces those is working from the superseded shape.

**The path partitions stay out of the payload.** They are discarded at the port by construction: the normalized
comparison is declared returning a match or a `{ status, reason }`, so the dropped and invented sets exist only
inside the adapter that classifies the reason from them. Carrying them forward **is** the port widening this
deliverable removes from scope, across all eight sites the port has, to buy a longer message from a partition that
is symmetric and names no side. The one sibling refusal carrying a typed path array draws the line rather than
contradicting it: those paths are the evidence deciding that refusal, while these would describe one the ancestry
call has already decided.

**D3 lands before D4, and D4 upgrades the arm D3 names.** D3 leaves the stale arm on `completeness-*`, now carrying
direction, detail, and today's `delivery-authoring-rebuild-required` remedy with a null command, clearable by hand. D4
then turns it into the close-side `rebuild-required` reason, naming construct in `automatedCommand` — and the
refusal-union widening that reason needs is D4's, not D3's. With that, the three `completeness-*` reasons leave the
union, since the close is their only emitter; the completeness port keeps its own classification, unchanged. D4 depends
on D3 for that upgrade and for the controller's predicate (§ D4). The construct command the upgraded arm names carries
no placement, because a completeness refusal cannot tell a correction from further work; its detail says the top's new
content goes to the terminal unless the member a correction belongs to is named. Success criterion 9 holds at each
landing: the remedy named is one that clears the refusal — by hand before D4, through construct after it.

**Typed-crossing rider.** `checkpointMovementCause` is stringly typed at its producer and absent from the
consumer's declared input, so neither end of that crossing is compiler-enforced while every sibling crossing
introduced alongside it is. No live defect; the hazard is a new overlap status reaching the surface unadmitted and
silently. It rides D3 as the same family — a refusal payload whose typing does not carry what its consumer must
discriminate on. It edits the singleton integration checkpoint, a module assigned to a sibling work unit under a
sequencing constraint the delivery shape says no member carries; § Cross-cutting Considerations holds that seam.

**Scope note.** D3 cites the lifecycle-tail remedy-composition spine claimed by `singleton-integration-continuity`
rather than restating the obligation; D3 is the delivery lane's instance of it. D3 retires pinned probe 2 and alone
does **not** retire probe 3, whose awaited shape is a close-side `rebuild-required` reason — that is D4's.

### D4 — Member constructor and the close-side `rebuild-required` reason

**One constructor, parameterized by the predecessor relation.** The two directions are opposites — at initial
authoring the members are ahead of the top and the remedy is to recut on the top's base; at bound correction the
top is ahead of the members and the remedy is to rebuild the suffix from the corrected top — but the direction is
decided by the predecessor relation the preflight must read anyway. Two direction-specific builders would duplicate
that preflight and re-create the same collapse from the other side.

**One implementation is forced rather than chosen.** Provider refresh operates over members that already exist as
published requests, and first-cut reconstruction happens before publication, where there is nothing for the
provider to rebase and the contribution proof would have no published member to compare. Routing reconstruction
through the host would leave the unbound route needing an ARC-side implementation anyway — the second
implementation this deliverable exists to prevent. The provider route also binds reconstruction to one host's stack
support and binds correctness to external semantics ARC does not control.

It owns **coordinate production** and composes existing primitives: the locator, materialization,
lifecycle-normalization, private candidate-pair, lease, and eligibility surfaces, plus the object-construction
primitives in the same library. It introduces no parallel plan or state record: what it keeps across a stop — a stopped
binding's record and the resolutions an agent gave its conflicts — is in-progress operation state, a ref in the plan's
candidate namespace and files in its resolution path family, removed when the operation completes, as
`.git/rebase-merge` is a rebase's (below); it names local objects and checkouts and ends with the operation, so it is
not the operational state the storage direction materializes off-branch. Every existing construction site builds
**tops** under a fixed two-parent shape and a fixed message, so none of them is a member builder this can consume; the
constructor's member shape is new, and the duplicated top absorption is a separate pre-existing defect that routes out
(§ Alternatives & Rationale).

**A rebuilt member carries its net contribution in one authored commit.** Delivery already does not preserve a
member's authored commit graph — the provider rebase linearizes each member range with no merge-preserving flag, and
ARC's own contribution proof accepts when a single three-way composition equals the member's tree, so tree equality
against a squash-equivalent reapplication is already the definition of a correct rebase here. Member ranges contain
base merges structurally rather than incidentally: `DEV-RULES.ARC` § Rebase scope forbids rewriting a pushed branch
to absorb base changes and requires merging the base in instead, so a work unit of any duration produces ranges
containing base merges by rule — measured at 2 and 3 merge commits across the live plan's 25- and 22-commit
members. Replaying such a range commit by commit must either drop each merge, changing what the member contains, or
recreate it against a base the rebuilt predecessor may already have moved past. A net-contribution recut is
unaffected by what a range contains internally, so the member's authored content is one commit.

**The base a member's range absorbed is not authored content, so no member's authored commit may carry it, and the first
cut anchors every member on the newest base the top absorbed.** At the first cut nothing is published — no request, no
review anchor, no provider state — so re-anchoring a member costs nothing, and with every member's predecessor already
containing that base, a range's own base merges contribute only their recorded resolution (below) and no authored commit
can carry base content. The authoring-side recut reads the cut list too, so it is a first cut in this sense. After the
first cut a member's base changes only through the overlap clearing below, so the one **absorption merge** left is the
terminal's: a base the top absorbed that no member below the terminal overlaps goes to the terminal as a merge of that
base into the rebuilt highest member — its tree the three-way absorption, taking the terminal's attributed version from
before its own remainder is folded on every path the base's resolution touched (below) — followed by the terminal's
authored commit. This was chosen on built evidence over six topologies, against the uncut work-unit history as the
baseline, rather than argued:

- **Single-commit members on their old predecessors** put the absorbed base's content into the authored commit, and
  § D2's guard — which reads a member's authored paths as exactly what its own commits touch — refuses the constructor's
  own output on content the member never wrote, in every topology whose range holds a base merge, with no base movement
  after construct at all.
- **One commit with the absorbed base as a second parent** matches the baseline on the guard and fails the provider
  route: a plain rebase drops merge commits, the member's entire content sits in that merge, and a restacked member
  lost all of it. The contribution proof refused rather than accepting silently, but the registered route would
  break for every rebuilt member that absorbed a base.
- **An absorption merge at every member whose range absorbed a newer base** passed the guard and a provider restack, but
  left a middle member's request showing the base's movement for as long as the members below it were unlanded, and left
  a lower member on an older base than the one it would land on, where its landing could conflict with the protected
  base.
- **The newest-base anchor at the first cut** closed every first cut complete with the guard passing and the
  authored-commit check clean, each member one authored commit; kept every member's content through a provider restack,
  with the contribution proof accepting; stops on a restack over a resolved absorption exactly where the uncut history
  stops today; and reproduced every object id when rebuilt over its own output or under disjoint movement. It survives a
  merge-preserving rebase as well as a plain one, so it does not rest on which the provider runs.

**What a member records as absorbed is read from the chain, never assumed.** A merge parent asserts that the member
contains all of that base's content. The first build produced the hazard in that from a rule that looked right: giving a
member a correction's absorbed base when a later member was the one that absorbed it put base content into the member's
authored commit, and the guard and the completeness comparison both passed it. So the newest base the top absorbed goes
where the overlap clearing below puts it — the whole chain or the terminal alone — never to a member merely because a
correction was placed there. Construct then verifies before adopting anything that **each authored commit changes only
paths its member authored**: § D2's authored read over the member's source range, plus the non-merge commits of a delta
placed on it, plus, on a re-anchored first member, the paths of the base's recorded resolution, since that commit is
where the resolution lives. That check passes a work unit that deliberately reverts a base change in its own commit, and
it refuses a planted misattribution the guard and completeness both pass. A failure is a defect in the constructor
rather than in the work unit, so it refuses terminally with nothing adopted.

**Overlap clearing: base movement a member below the terminal overlaps re-anchors the whole unlanded chain.** Base
movement a member authored against refuses at § D2's guard, and the only thing that clears it is that member carrying
the base and the work unit's resolution. So construct reads the newest base the top absorbed — the merge base of the top
and the live tip — and the base's recorded resolution (below). When any unlanded member below the terminal authored a
path that the movement between that member's base and the newest one touches, or that the resolution touched — a delta
placed on a member counting as that member's authorship, as in the authored-commit check — construct re-anchors every
unlanded member on the newest base: the first member's predecessor becomes that base, and each member is reapplied on
its rebuilt predecessor. A resolution path counts because a departure there is the operator adapting that member's
content to the base, which a path intersection alone would not see. Movement no member below the terminal overlaps goes
to the terminal alone, as its absorption merge, and every lower member is retained unchanged. Movement **beyond** that
newest base that intersects a member's authored paths is movement the top has not absorbed, and construct refuses it on
either route, naming the member and the remedy the guard now names too (§ D2): merge the base into the top and resolve,
then construct.

**Re-anchoring on overlap, and its cost.** The alternative — giving the newest base to the lowest member the guard would
refuse and every member above it, keeping the members below by object id — recuts less, and the field ruled it out.
`evidence-applicability`'s integration merge `4ae7872f35` conflicted on four paths and departed from the mechanical
merge on two more, five of the six authored by its middle member and the sixth by its terminal, while the first two
members were bound and unlanded: lowest-member absorption would have left `main`'s movement showing in that middle
request, left the first member on an older base than the one it would land on, and — on the bound route — changed a
published member beyond its fix. Stacked-change tools answer a moved trunk the same way: a restack rebases the stack
onto it. The cost is stated: on overlap every unlanded member is rebuilt, so every unlanded request is force-updated and
loses its commit-anchored review comments, and on the bound route every unlanded published member is republished. A
carried member republishes under the mechanical contribution proof, as refresh adoption already admits; only a member
whose attributed content differs from what it published needs consent. Disjoint movement keeps the narrower rule, since
there it changes nothing a lower member contains.

**A path the base's recorded resolution touched takes its attributed version.** The top holds the work unit's resolution
of the base: the paths where its own merges of that base conflicted, and the paths where a merge departed from the
mechanical merge of its parents — an adaptation beyond the conflicts. That set, lifecycle paths excluded, is the base's
**recorded resolution**: the set `git log --remerge-diff` shows for those merges, and the one § D9 discloses. It is one
computation over a window its reader chooses — construct reads it from the chain base, and across a mixed chain's break
from each carried member's recorded predecessor up to the base the members below the break absorbed (below); the
contribution proof (below) from each proved member's recorded predecessor — the base movement that predecessor lacks,
which for a constructed chain reads the same merges and, unlike the chain base, moves only when that member is rebound;
and the refresh arms from the recorded terminal (§ D9). The proof's window is not § D2's operand, `merge-base(m_k,
tip)`: a recorded terminal carries every base the top absorbed, since adoption builds it on the top's own head
(`chain-adoption.ts:109-111`), so that operand starts past an earlier absorption and drops the paths its merge resolved
— modelled, a second correction re-anchoring after a disjoint first one, it dropped the one path where the terminal's
proof diverged. The top's version of such a path combines the absorbing member's content, the base's movement, the
resolution, and every later member's own edits to that path. The member's version is the top's with every later member's
own non-merge commits to that path reverted, newest first, and the delta's own non-merge commits to it reverted with
them wherever the delta is placed, so a correction reaches a member only through the fold (below); on a chain a stopped
rewrite loop left mixed, what the advance passes that the member below the break never held is undone on the top first
(below). A member takes that version on every resolved path its own range, or a member below it, authored — a delta
placed on it counting toward the authored-commit check and the overlap clearing, not here (§ Alternatives & Rationale);
members below a path's owner keep the base's version; and a resolved path no member authored — a departure on content
the base added — goes with the base to the lowest member that absorbs it. The reverts apply hunk by hunk, so a later
member editing a different hunk reverts cleanly. A revert that conflicts means the member's resolution and a later
member's edit share a hunk, and no version of the path belongs to the member alone: construct stops, naming the member
and path, with nothing adopted. That stop is an **entangled chain**; its remedy is structural rather than mechanical,
and each route has its own. Before publication it is a plan revision combining the two members, which the unbound plan's
supported-replacement path provides. On the bound route, where a bound plan admits no such revision, it is the operator
refresh: set the correction aside by reverting it on the top, restack the suffix through `refresh plan` and `refresh
adopt` with the resolution admitted under § D9's consent, then restore the correction and continue, which rebuilds over
the restacked chain. The mechanism is composed from three-way merge and per-commit reverts, so it adds no Git primitive;
what it adds is reuse of a resolution the work unit already authored, departures included (§ Alternatives & Rationale).

**An attributed version the member does not already carry is proposed, not adopted.** Attribution can move a resolution
the work unit recorded in a later member's range, or on the top, down into a member that never carried it — an inference
no tool makes (§ Alternatives & Rationale). So where a non-terminal member's attributed version of a path differs from
what that member's **source** carries there — its boundary commit at the first cut, its private candidate before
publication, its published head on the bound route — construct stops before adopting anything, naming each such member
and path with the attributed content, under a digest over the plan, the members, the source top's head, and each path's
attributed blob. Every proposal in the run is gathered before the stop, so one stop presents them all and one
continuation accepts them: re-running construct with that digest as an operand. On the bound route the controller
dispatches construct and the workflow forbids a lower-level verb, so the controller maps the proposal to a typed stop
whose resume action is `arc delivery review-fix continue` with the digest already in its input, and resubmitting that
action unchanged after approval is the acceptance — the idiom of construct's own exact continuation (below) and of
§ D9's adoption consent, an exact resubmission. The verification stop is not the precedent: its resume action carries
only the repository and remote (`review-fix-continuation.ts:432-437`), and the operator adds the result. The continue
input, a strict object today (`delivery-execution.ts:812-817`), gains an optional acceptance digest, which only this
stop's resume action carries and the controller forwards to the construct it dispatches: transient input, nothing
recorded. Construction is deterministic, so the continuation rebuilds the same objects and adopts them, and a digest
that no longer matches — the top moved between the stop and the continue — stops again on the new proposal. Nothing new
is recorded. Before publication the accepted content sits in the member's candidate from then on, and that candidate is
the witness a later rebuild compares against, so a rebuild reproducing the same content does not ask again — including
after a lower member's recut gives this one a new predecessor, which is why the comparison is path content rather than
object id. On the bound route the witness is the member's published head, so a rebuild asks again whenever its
attributed content differs from what the member has published — after an interrupted drive, or when the top moves before
the loop republishes it — and stops asking once the member is republished. A rebuild whose attributed content differs
asks again, since what was accepted is exact content. Declining leaves the entangled chain's structural remedy for its
route. The terminal never proposes, since its version of every path is the top's own, and disjoint movement goes to the
terminal, so a rebuild with no overlap never stops here. On the bound route the acceptance is also the consent a changed
published member needs (below).

Built on a third model over every earlier topology plus the new cases. Every row closed complete with the guard passing
and the authored-commit check clean, with no absorption merge below the terminal: overlap on the first or a middle
member re-anchors the chain with the resolution, and a fresh first cut from the same cut points produces the identical
chain; different-hunk edits by a lower and a higher member attribute cleanly; same-hunk edits stop entangled; disjoint
movement merged into the top reaches the terminal with every lower member retained; and a provider restack of a
re-anchored chain keeps its content with the contribution proof accepting. A model of the `4ae7872f35` shape — a top
merge that conflicts on the terminal's path and departs on a lower member's path and on content the base added — lost
both departures under conflict-only attribution and closed incomplete; with the recorded resolution it closes complete,
and so do a departure on the terminal's own path and a follow-up commit on the top that edits content the base added.

The principle that makes this coherent: **the work-unit branch is the shared working history, and a member request is a
derived presentation of it.** Append-only governs the shared base, where `strategy-concurrent-work` § Append-only until
integration places it as the single hard invariant; presentation branches are regenerated and force-updated, which is
what the existing member-ref rewrite already does under `--force-with-lease`. This is the stacked-change idiom rather
than a departure from it. The cost is stated rather than waved past: a member's request shows one authored commit after
a rebuild, so review comments anchored to a specific commit do not survive one — the cost ghstack and Graphite users
accept, with the full authored history remaining on the work-unit branch.

**Authorship is preserved byte-exactly, because the recut would otherwise destroy it.** Under `team.mode` a
member's range may carry several authors and a naive rebuild reattributes all of them to whoever ran it. The
constructor writes commit objects through `hash-object -t commit -w --stdin`, carrying author and committer through
the raw port's byte-oriented input. `commit-tree` under an environment passthrough is rejected: a process
environment is string-typed, so an identity that is not valid UTF-8 cannot survive it byte-exactly. Credit survives
because `strategy-team-coordination` § Ownership already routes non-owner contribution through `Co-authored-by:`
trailers — the constructor unions the range's trailers in first-appearance order, deduplicated, and adds one for
any author in the range whose identity the boundary commit does not carry. A member a correction was placed on
counts the delta's commits as part of its range for this purpose: a fix lands on the top, past every boundary, so
without that its author would reach the published member uncredited.

**What the commit says.** Publication reads nothing from a member's commit message: the request title is composed from
the plan member's title under the identity parsed from the authored terminal title, and the body from the operator's
presentation. The message's durable consumer is the history the member lands into. Its subject is the request title's
identity **without** the stack position — `{type}({workUnitId}): {planned.title}` — so the landed commit and the request
a reviewer approved agree by construction, while `[k/n]` stays in the presentation where it belongs and does not go
stale in history. No body is derived: each rebuilt authored commit is a function of five inputs and nothing else — the
plan-derived subject, the composed tree, the new predecessor as parent, the author and committer lines copied
byte-exactly from the member's boundary commit, and the unioned co-authorship trailers — so an unchanged rebuild
reproduces the same object id and its push is a no-op rather than a force-update. An absorption merge is determined the
same way by fewer inputs: its two parents, its composed tree, the same boundary commit's author and committer lines, and
a fixed subject in the family the existing construction sites use (`Absorb protected base into delivery member`), since
nothing presents it. ARC's own `commit-msg` contract does not reach these objects: `hash-object` fires no hook, and a
derived presentation owes no `Context:` trailer.

**Where the constructed chain lives before review.** Private review reads the candidate pair, so the pair is not
optional — the pre-publication review gate composes per-member targets by deriving locators, preparing eligibility over
the reserved candidate refs, and verifying each candidate checkout exact, for every delivery work unit — skipped only
where a pending approved fix retains its exact reviewed target — and in its own process. A member that exists only as an
unreferenced object is invisible to the reviewer who must approve it. So each rebuilt member is written to
`refs/arc/delivery-candidates/{planId}/{chunkKey}` with its paired detached candidate checkout, through the
route-agnostic pair primitives the correction verbs already sit on. That coordinator is idempotent by construction:
absent creates, matching returns `already-rematerialized`, half-present refuses `candidate-pair-split`, a pair at the
old coordinates is rewritten and its checkout reset, and a pair at neither refuses `candidate-pair-moved`. **No new
namespace is minted** — the rejected alternatives were a private staging namespace of this work unit's own, or a shared
staging substrate extracted now across roughly ten thousand source lines in six files. Because the pair is written at
construct time the objects are referenced from the moment they exist, so the garbage-collection exposure an unreferenced
chain would carry does not arise, and the ordering constraint that exposure implied is retired with it. The terminal
member gets a pair too: the residue locator deriver maps every plan member and the review gate verifies a checkout for
every locator, so the terminal's eligibility vehicle still needs a ref and a checkout or review refuses at the terminal
index.

**The checkout half is renamed from "gate" to candidate checkout, riding D4.** It was named for the Tier 2 run
that happened in it; with no run in the window its role is the reviewable working tree, and "gate" now collides with
both the quality gates and the pre-publication review gate that reads it. The replacement is already the codebase's
own word, `verifyDeliveryCandidateCheckout`. The locator's `gatePath` becomes `checkoutPath`; the `delivery-gates/`
directory under the Git common directory becomes `delivery-checkouts/`; the `candidate-gate-*` refusal reasons —
the reaper's `candidate-gate-mismatch` included — become `candidate-checkout-*`; and the coordinator's
`prepare`/`observe`/`reset…CandidateGate` functions and types take `CandidateCheckout`. It rides D4 because D4
already reshapes the pair and widens its coordinator's observation port. On the provider-refresh route that shares
the coordinator it is a rename only — identifiers, reason strings, and the checkout directory — and no behavior on
that route changes, which keeps it inside § Non-Goals. The `ReviewFix` prefix on the pair primitives stays: it is
history rather than scope, and renaming it is a separate concern.

**Where construct runs.** Its output must exist before private review reads it, and a pre-publication caller returns
after eligibility closes while delivery execution continues below — so the sequence is construct, then private review,
then publish, and publish re-prepares over the same refs it does today. The same step recurs after an approved
pre-publication fix: construct runs again with the member the finding was raised on as its placement, before the next
composing review pass — the pass reviewing the fix itself composes nothing, since it reads the retained target the
pending fix names. **D4** changes nothing about publish's operand or machinery; D6 separately removes two of its
operands (§ D6). Construct is a **new plan-scoped verb in the authoring family**, beside `authoring locate` rather than
a mode on either authoring write verb: both of those assert a provider-refresh route and require a selected deliverable,
an expected state revision, and a derivation record, none of which an unbound first cut has, and both take exact
caller-computed coordinates where deriving the coordinates is what construct is for. The primitives beneath them are
route-agnostic and are what construct reuses, so the new surface is one verb rather than new machinery. What the verb
owns that the existing ones do not is its **own authority predicate**: the plan, an active work unit matching the plan's
work unit, no active operation, a state valid against the plan where one exists, and the anchor-compatibility check
below — the first four being exactly the checks the existing arm performs before its review-fix-specific fifth, so this
narrows an existing authority model rather than adding one.

**Member boundaries are an operand, not a derivation.** Delivery derives no boundaries; it is given them. Eligibility
prepare takes the candidate list as command input and checks count, order, and uniqueness against the plan, so the
boundary set is a caller-supplied operand at the first window, exactly as the constructor requires at first cut.

**After the first cut, construct reads the chain as it stands, not the cut list.** Before publication that is the
private candidates; on the bound route it is the Delivery State member records, which persist each member's ref and
coordinates. The operator's cut list serves the first cut, and again each recut of a chain as it stands that is wrong:
the authoring-side recut § D3's anchor refusal names, and the recut a stopped binding owes under a plan revised since it
stopped (§ D4, No partial adopted chain). Read after the first cut, the cut list undoes earlier placements: its terminal
is the pre-fix top, so a second construct re-folds the first fix together with the second into the second's member.
Built: the first fix left the member it had been placed on, while reading the chain as it stands kept it there.

**Each member's range runs from the predecessor it was built on, never from its list neighbour.** For the first member
that is its authored commit's parent; for a later one, its authored commit's parent, or that parent's first parent when
the parent is its absorption merge; on the bound route, the record's `coordinates.base`. A rewrite that stopped partway
leaves new lower members over an old suffix, and an old suffix member's list neighbour is a new member it was never
built on. Read from the neighbour, the old member's range reverses what the rebuild changed below it: modelled on a
chain left mixed under a re-anchor, that built an incomplete chain, and read from each member's own predecessor it
rebuilt the full chain identically whether the rewrite stopped after the first member or the second. The stacked-change
tools answer the same question the same way — git-spice records each branch's base by name and hash, Sapling keeps
mutation records, git-branchless an event log — and none derives a stopped change's range from its rebuilt neighbour;
reading the predecessor from the commit graph rather than from a separate record also leaves nothing to drift out of
step with the commits it describes.

**A chain a stopped rewrite loop left mixed is constructed as the chain it was becoming.** A binding or a
rematerialization loop that stops partway leaves the chain **mixed**: its lower members rebuilt, and above them a member
whose recorded predecessor is not the head of the member below it — the chain's first **break**. Construct reads only
the one the bound route's rewrite loop leaves in the member records: a stopped binding's is continued, recut under a
revised plan, or on the bound route never read (§ D4, No partial adopted chain). Its break is the dependent of the
member `findExactPendingSelectedRefresh` finds from the landed prefix (`suffix-reconciliation.ts:126-138`), the terminal
included until the tail's rebind records it on the highest member's head (`suffix-rematerialization.ts:441-449`). Under
a re-anchor the members below the break sit on the new base and those above it on the old, so reapplying an old range
onto a re-anchored member meets the base's movement there, and construct would stop on a conflict no member made. So
from the break upward construct carries each range across by a three-way merge on its recorded predecessor, taking the
attributed version on that member's share of the base's recorded resolution read from the recorded predecessor — the
contribution proof's window (below) — up to the base the members below the break absorbed, the merge base of the member
below the break and the live tip; a conflict outside that share stops as any reapplication conflict does. Without that
upper bound, a later disjoint base whose resolution departs on a path no member authored would be carried into a middle
member rather than reach the terminal's absorption.

One rule serves a resume and a rebuild. With nothing moved the controller finds the loop's candidates still eligible and
dispatches rematerialization, which binds from where the loop stopped, and construct over the same records carries the
chain to those candidates object for object. Modelled on the `4ae7872f35` shape stopped after its first rewrite, against
construct over the loop's own candidates, placed on the member the loop rewrote and on no member, which isolates the
carry from the placement: identical ids, trees, and parents with nothing moved, under a disjoint base the top then
absorbed, under overlap on a member above the break or on the rewritten one, and under a later disjoint base carrying a
departure no member authored; and again with the correction above the break, a second correction and a base move in
either order, a lifecycle commit between two corrections, and a pending tail with and without a second correction. A
second correction spanning two members stopped identically on both, and every unmixed chain reproduced its object ids
with the carry disabled. The bound route places on the correction record's selected member, the rewritten one in each of
these, and with the model's proof check reading a member carried across the break as the carry builds it, every row
placed there reproduced the candidates' outcome. Reading the members from the loop's candidates, and completing the loop
before any rebuild, were rejected (§ Alternatives & Rationale).

**The delta is read from the top's own first-parent line.** It starts after the chain's **source top** — the newest
commit on that line whose normalized tree equals the terminal's — and its commits are the ones a placement moves and
whose authors the co-authorship union counts. Only its non-merge commits are authored content; its merges are base
absorption, which the overlap clearing places. When no commit on that line matches, the chain was not built from this
top's history, and construct refuses naming the recut from the cut list. While the chain is mixed the source top
advances past what the stopped correction already carries: the terminal's record is one the stopped run never reached,
so its source top predates that correction, and a second correction for the member the run rewrote would otherwise fold
the first again into a member already carrying it. The source top moves along that line past each commit the member
below the break already carries — one whose normalized tree equals its first parent's, a base merge whose base that
member contains, or a change whose cherry-pick onto that member is empty, the test by which `git rebase` drops a commit
that has become empty — and stops at the first it does not carry. Modelled, a second correction then rebuilt identically
to construct over the loop's candidates.

**A change the advance passes is still owed where the member below the break never held it.** The members above the
break are the old ones, which the stopped correction never reached, and a change can be carried below the break yet
still owed above it: a correction removing a file or a line only a member above the break holds cherry-picks empty onto
the member below, which never held that content, and one commit can fix the member below while removing content the
terminal authored — in another file, or ten lines down the file it fixes. Read as carried, either left the terminal
incomplete against the top, so § D3's stale arm refused, construct was owed again over a chain it rebuilt identically,
and the driver refused `delivery-review-fix-no-progress`. So the advance reads each non-merge commit it passes against
the break's recorded predecessor — the member below the break as it was before the rewrite — hunk by hunk, by three-way
merges, as attribution's reverts are read. The record is read re-anchored on the base the members below the break
absorbed, where the member below now sits: on each path the base moved between the record's own base and that one, the
record's version and that base's merged over the record's own base, since on its older base the record conflicts with a
change beside the base's movement for that movement alone. A path where that merge conflicts is one the member below
authored against the base, and keeps the record as it was: modelled, a later member's line beside the resolution there,
or beside the base's movement of another hunk of the path, stopped the construct that re-anchored the member below as an
entangled chain before any loop bound it, and a line away from both read as owed from the record as it was. On each path
the commit changes, its change merged onto that record yields the part the member below carries, a conflict there
counting the path as carried whole; that part merged onto the commit's parent leaves, between it and the commit, the
part the member below never held — the whole change where nothing reached the record — and where that second merge
conflicts the path counts as never held, whole, as where nothing reached the record, so its change folds at the
placement, where a conflict stops as any member's composition does. Every uncarried part stays in the delta and folds
with it at the placement, from which the fold reaches the members above that hold the content, and attribution reads the
top with it undone, as it reverts the delta's own commits (above), so it reaches no member but through the fold; where
undoing it conflicts — a later commit on the top sharing its hunk — construct stops there with nothing adopted, naming
the path, with the later-member stop's remedy. The mixed chain construct reads is the one the bound route's rewrite loop
leaves (above), so the placement is the correction record's selected member — at or below the member below the break,
since the pending response's currency admits no break below it (below) — and a fold that would change any other member
stops (below), a member carried across the break included. Every uncarried part therefore lies above the placement,
where its one outcome is the later-member stop: a second correction removing content only a member above the break holds
cherry-picks empty onto the member below, so the advance passes it, and read as carried it is dropped into the dead end
above; read hunk by hunk it stays owed, and the fold stops at the member that holds the content, a typed stop naming the
split where the dead end named nothing. The base merges the advance passes stay out: their resolution is the carry's
attribution's, and their clean movement arrives from the chain below. Modelled against construct over the loop's
candidates at every placement, which isolates the read from the route — removals of a whole file and of a single line,
on a member above the break and on the terminal, as the first correction and as a second; removals the advance passes
placed on no member, on the member that added the content, and on the terminal, including one of a line a later member
rewrote; one correction commit fixing the member below the break while removing the terminal's file, or its line ten
lines down the file it fixes; one fixing that member while removing a middle member's line, as one commit and as two, at
the stopped run's placement, including after only a disjoint base moved; and a correction on a path the new base moved
cleanly — identical in every case. On the bound route, with the model's proof check reading the members carried across
the break, a second correction removing a file only the terminal holds stopped at the terminal as over the loop's
candidates, with no base movement and under a re-anchor, and so did one removing the terminal's line from a path the
base merge resolved, and one removing a line the terminal added to a path the member below the break resolved against
the base. Read against the record on its older base, the first of those counted as carried whole, beside the base's
movement, and reached the published terminal through attribution unstopped. Testing each passed commit whole or path by
path, folding every uncarried part at the break, splitting it by whether the member below carries the rest of its
commit, applying the passed changes to each range above the break that touches the path, reading the record on its older
base, and reading a mixed chain as the chain before the stopped run were rejected (§ Alternatives & Rationale).

The deleted authoring snapshot is not a blocker: a member's span is fully determined by its predecessor's head and its
own, so the range is recoverable from two heads, and what the snapshot recorded is authoring provenance rather than
the partition a rebuild needs. That retires all three options a rebuild was thought to need: persisting the partition
in the digest-sealed plan, retaining the authoring snapshot, and deriving boundaries at construct time. The remaining
obligation is the **seam**, not the source: the boundary operand must reach the constructor through one seam serving
both in-repo and off-branch planning storage, the same discipline the lifecycle exclusion set already states.

**Boundaries cannot place a correction, so where one goes is an operand too.** Boundaries are cut points in history,
and a correction committed on the top always falls past the last of them. Under canonical boundaries a fix approved
for member _k_ lands in the terminal's range, members _k_ through _n_−1 keep their ranges and predecessors, and each
reproduces its old object id — reported retained unchanged, carrying none of the fix. Built: with no placement, a
rebuilt chain retained every member and left the terminal incomplete against the corrected top. Authoring the fix in
the member's candidate checkout is no carrier (§ D3's accepted consequence), and re-cutting the boundaries means
rewriting a pushed branch.

So construct takes a **placement** — the member a correction belongs to — and folds the **delta**, the corrected top's
normalized content over the chain's terminal, into that member and into every later member as it is reapplied on it,
exactly as any rebuilt member is reapplied on its predecessor; members below the placement are retained unchanged unless
the overlap clearing re-anchors the chain. For content the placed member holds the later folds change nothing, since
each later member already carries the correction from its predecessor, so a later member folds only on the paths its own
range changes, where content only it holds can be: a correction removing a whole file, or a whole hunk, a later member
added has nothing to remove at the placed member, and the later member's reapplication alone would restore it, as `git
commit --fixup` with autosquash does. So the terminal's tree equals the corrected top's. Modelled over an unbroken chain
with no base merge, one correction commit fixing the first member while removing the terminal's file, or its line in a
shared file: folded at the placed member alone, the terminal kept what the correction removed; folded at every member
from the placement up, it closed complete. Stopping such a correction before publication was declined: the change has
one right answer, and the later fold is it. Removing only part of a later member's hunk, or a line of a file only a
later member holds, edits that member's version and conflicts at the placed member, which stops for its resolution
(below). On the bound route a later fold that changes a member takes the later-member stop, before anything is adopted:
rematerialization proves every member but the selected one a reapplication of what it published
(`git-contribution-proof.ts:88-124`), admitting only the base's recorded resolution, and a member the fold changed has
changed beyond its fix. The stop is construct's, read at the fold at every member above the placement, one that absorbs
the base or is carried across a break included, rather than left to the proof, which refuses such a member off the
base's recorded resolution but on it admits the attribution it recomputes, reading a correction below the member as part
of the history it sits on (below). The placement is supplied by whoever holds it: on the bound route the controller
passes the correction record's selected deliverable; pre-publication, the workflow step that constructs after an
approved fix passes the member the finding was raised on. With no placement the delta goes to the terminal, where the
history's own tail belongs — further work after the chain was cut, and a base merged into the top unless it overlaps a
lower member. Deriving the placement from the review response that approved a fix was declined: construct would read the
review gate's records to answer a question the step invoking it already holds.

**A delta's base absorption and its authored content go to different members.** When the corrected range itself merged a
newer base, placing the whole delta in member _k_ would put base content into _k_'s authored commit — the hazard the
authored-commit check exists for. So the delta splits: its base absorption is the newest base the top absorbed, which
the overlap clearing places exactly as it places a base merged into the top with no correction at all, and its authored
remainder goes to the placed member, folded after that member absorbs the base when it does: a remainder that edits
content the base added has nothing to apply to before then. Since attribution reverts the delta at every member (above),
the fold always waits: construct composes the chain without it first — each member reapplied, or carried, on its
predecessor, absorbing the base where it does — and then folds the delta from the placement up, each member above the
placed one first reapplied on the folded member below and then folding on its own paths, so the paths its own fold skips
carry the correction; modelled under a re-anchor, the member above the placement lost the fix without it. So a conflict
composing the chain without the delta stops before any the fold meets. The split point is that base's absorption into
the source top, read by attribution (below). Built with the fix on the first member and on a later one, over a disjoint
and an overlapping absorbed base: each rebuilt complete with the guard passing, the fix in the placed member and the
base where the overlap clearing put it; with no placement the same fix was separated out of the overlapped member's
attributed version into the terminal.

**The split point is read by attribution, so the base merge need not sit directly on the source top.** It is the
three-way absorption outside the paths the delta's own base merges conflicted on or departed on, and on each such path
the top's version with the delta's own non-merge commits to it reverted, newest first — the attribution above, which
reverts the delta at every member, with the delta standing in for the later members. A fix committed before the merge
therefore splits as one committed after it does, unless it shares a hunk with the resolution. A commit and a later
commit recorded as reverting it (`This reverts commit <id>.`) drop out together, the oldest pair first, so a revert of
the revert re-applies. A revert that conflicts means the correction and the resolution share a hunk: construct stops
naming the placed member and the path, with nothing adopted — an **entangled correction**. Its remedy is on the top and
the same on both routes: revert the correction (`git revert`, resolved by hand to the resolution without it), re-apply
it as a new commit after the merge, and continue — on the bound route by re-entering `review-fix continue`, a fresh
drive, since the refused construct ended the last one; the pair drops out, the re-applied commit folds cleanly, and no
refresh is needed. Committed after the merge, the same fix reverts cleanly, since the merge already holds the resolution
without it, which is why the remedy moves it there. The terminal's absorption merge holds the member's version from
before its own remainder is folded, so a correction on a resolved path placed on the terminal, or left unplaced, sits in
the authored commit, where a plain rebase keeps it, rather than in the merge. Built on a fourth model: a fix to another
hunk of a resolved path, a fix to a path the merge did not resolve, and a fix between two base merges each rebuilt
complete where a split requiring the merge directly on the source top stopped; a fix to the resolved hunk stopped
entangled before the merge and split cleanly after it, and once set aside and re-applied — by a new commit, and by
reverting the revert — rebuilt complete with the fix in the placed member; a correction placed on the terminal sat in
the absorption merge until the merge took the version from before the fold; and every earlier row reproduced its object
ids.

**A conflict composing a member stops for its resolution, and the continue carries the chain on.** Wherever construct
composes a member — reapplying or carrying its range on its predecessor, folding the delta at the placed member or a
later one — Git's three-way merge can conflict on content no recorded resolution answers. A fix to the line beside one a
later member rewrote conflicts at the placed member, since a line merge takes touching changes as one hunk, exactly as
`git rebase` replaying the same commits would; so does a fix to the hunk a later member rewrote, and a removal of part
of what a later member added. Every stacked-change tool meets such a conflict in its restack and does one thing with it:
it stops at that branch, the operator resolves, and a continue carries the restack on. Construct does the same. It stops
with nothing adopted, naming the member, the step, and the conflicting paths, and prepares that member's resolution
workspace in the plan's resolution path family (`residue-reaping.ts:79-104`), under a sub-path of construct's own that
no member's slug can take, so it never occupies the path § D9's registered route prepares its workspace at: a conflict
stop records nothing, so one abandoned before an older chain was published would otherwise sit where that route's
prepare and its protected-ref scan read it (`github-refresh.ts:279-290`, `:299-337`). The workspace holds the
composition's two sides merging over its base, with Git's conflicted result, so it is dirty from the start, and the gate
checkout's removal refuses a dirty checkout and never forces one (`residue-reaping.ts:139-145`, `:151-191`). Construct
removes its own by force, only at that sub-path and only as a detached worktree registered there, an attached checkout
or an unregistered path still refusing: one left holding another composition is replaced, and at its last bind construct
removes every one the plan's runs left, as the reaper removes one an abandoned run left, by the same rule
(§ Cross-cutting Considerations, Disk lifecycle). The resolution is committed there on the two sides construct named,
and the continue — construct again, as the stop names it — imports it, checks both parents, records it under that
sub-path against the composition's three input trees, and removes the workspace, as the registered route imports its own
(`github-refresh.ts:340-381`). The record keeps the resolution as content rather than as an object id — every path where
it differs from Git's mechanical composition, the conflicts and any departure — as `git rerere` keeps its resolutions
under `rr-cache`, so nothing it holds depends on an object staying reachable. Construct takes a recorded resolution
wherever it meets that exact composition again, and for no other: a further correction, or a base that moved, composes
differently and stops afresh. Before publication the records go at construct's last bind; on the bound route they
outlive it (below). A resolution answers its own step: a reapplication's is the member's content before its fold, which
still runs, and a fold's is the member's content after its whole fold. That is why a later member folds only on its own
paths (above): folding the whole delta there, the first reading, re-conflicted a resolution at every member above the
placed one, up to the one holding the adjacent content. At the terminal before publication a conflict does not stop,
since the terminal's content is the corrected top's normalized tree by definition, and construct takes it. This is the
hand-back declined for a base conflict (§ Alternatives & Rationale), and the difference is what the top holds: it has
already resolved a base conflict, and construct reads that resolution from it, but what the placed member should hold of
a correction the top applied over every member is recorded nowhere. The resolution workspace is not a candidate
checkout, and a resolution is an input to the stop it answers, with construct writing the commit, so the accepted
consequence (§ D3) stands. The entangled stops keep their remedies on the top: an entangled revert is not a composition
to resolve in a member but two authored changes the top has to separate.

**Resolved at the placed member, a correction is placed by its resolution.** A conflict between a correction and a later
member's version at the placed member asks what that member should hold, and three answers are defensible: its own
version, leaving the whole correction to the later member's fold — a re-placement; its own version plus its own part of
the correction — a split; or both sides, where the correction is wholly the placed member's and only touches a line the
later member changed. Which is right is read from the conflict against the finding the correction answers, which the
agent resolving it holds and can check the result against, where a rule over Git's conflict regions cannot: a fix beside
a line the later member rewrote and a fix with a removal of part of the later member's hunk each conflict as one region,
so reading the regions called both wholly the later member's, and re-placing moved the placed member's fix into the
later member (§ Alternatives & Rationale). Whatever the resolution leaves out, the fold at the later member carries,
where it applies. Modelled on five shapes — a fix beside a line the terminal rewrote, a fix with a removal of part of
the terminal's hunk, a fix with a removal of a line the terminal inserted, a fix wholly to the terminal's rewritten
hunk, and a fix with a removal of a line of a file only the terminal holds — each completed with one resolution at the
placed member and the terminal taking the top's version, and so did the same fix under a re-anchor, whose fold waits for
the absorption. A continue over the recorded resolutions reproduced the chain object for object, and a further
correction met new compositions and stopped afresh.

**On the bound route a later member's resolution is admitted as its reapplication, and a fold that would change a later
member still stops.** Rematerialization proves every member but the selected one a reapplication of what it published
(`git-contribution-proof.ts:88-124`), admitting only the base's recorded resolution (below). The selected member's
resolution needs no admission: its rewrite is the reviewed fix, and the suffix rewrite proves nothing of it
(`suffix-reconciliation.ts:707-710`). A later member's reapplication on the corrected member can conflict as well — a
fix beside a line the later member rewrote — and its resolution is admitted as the registered route admits a locally
resolved dependent (`provider-refresh-execution.ts:448-478`): every conflict the proof finds must be one resolved, here
by a resolution construct recorded for that exact composition, and the member's content must be that resolution. What
the resolution holds is the agent's to keep to the reapplication alone — the member's published change on the corrected
predecessor and nothing more, never the top's version of a hunk the correction also changed — and no check can confirm
that it does: where Git conflicts it offers no clean reapplication to compare against, and the registered route's
admission checks that each conflict was resolved by a recorded resolution, never what that resolution holds. Kept to the
reapplication, the resolution leaves the fold at that member to expose a correction that reaches its content, which then
stops as the later-member stop (below); one that takes the top's version there passes the proof and leaves the fold
nothing to change, so the correction reaches the published member unstopped. The backstop is § D9's: the resolution is
disclosed as a consented resolution is, its conflict paths and every path where it departs from the mechanical
composition, and the member joins the verification set with the selected one. At landing, review readiness proves its
contribution from its reviewed head, the conflicted proof classifies as an interaction, and its prior approval does not
carry: it reaches the Owner as a decision, as § D9's admitted members do. The records construct keeps for it outlive its
binding here, since the proof reads them, and the rematerialization tail removes them when it completes. A fold that
would change any member but the selected one — cleanly, as the removal of a file only a later member added does, or
through a conflict — stops before anything is adopted, as the **later-member stop**, naming the member and the paths,
since admitting it would change a published member beyond its fix. Construct reads it at the fold, a member that absorbs
the base or is carried across a break included, because on the base's recorded resolution the proof would admit the
change (above). Its remedy turns on whether the selected member changed. Where it did, the correction holds a part for
each, and the stop names the split on the top in the entangled correction's idiom: revert the correction, re-apply the
selected member's part and continue, then deliver the rest as terminal work through Candidate verification. Where it did
not, the correction is wholly the later member's, and the stop names the pending review-fix authority it cannot
discharge: consuming the fix authorization requires the reviewed member's head to change, and the hosted fix target must
be the reviewed request. The route that clears it supersedes that disposition with a reply that the finding is addressed
in the later member, then delivers the change as terminal work; disposition supersession is
`review-signal-convergence`'s, which integrates after this work unit, so until it lands nothing retires a pending
delivery review-fix authority and the stop needs the Owner's direction (§ Non-Goals, Adjacent owners). Placement across
members was declined (§ Alternatives & Rationale). Modelled on the bound route: a fix beside a line the terminal rewrote
completed with the terminal's resolved reapplication admitted; every shape whose correction also reached a later
member's content took the later-member stop, a later member that absorbs the base under a re-anchor included, and a
second correction reaching a member carried across a stopped loop's break took it there, as over the loop's candidates;
split on the top, the selected member's part alone completed. Taking the top's version at a conflicted terminal here, as
construct does before publication, was rejected: a fix beside the terminal's rewritten line, and the same fix with a
removal of part of the terminal's hunk beside it, present the identical conflict, and taking the top admits the removal
into the published terminal past the later-member stop. The finding the correction answers tells the two apart, and the
agent holds it where the CLI does not, so the CLI taking the top would decide what belongs to the agent; the agent
resolving to the reapplication alone lets the fold tell them apart.

**How the bound correction route reaches it.** The route is **`rematerialize`** — one of the four the review-fix
planner emits, beside `provider-refresh`, `terminal-authoring`, and `terminal-rebind`. The **registered** path is
`provider-refresh`, which is provider-native, reaches no constructor, and is the path § Non-Goals disclaims; the
constructor must not be wired into it. Two verbs share the word and must not be confused: the route's `nextAction`
names **`arc delivery rematerialize`**, which rewrites member refs from the private candidates, while **`arc delivery
authoring rematerialize`** is the provider-refresh route's pair-preparation step. What the constructor cannot reuse
is that authoring verb, which compare-and-swaps toward the published member head and refuses anything else, so a
rebuilt coordinate has no way in through it; the primitives beneath it accept any coordinate, which is where
construct enters. That verb's conflation of binding a coordinate with resetting to the public member is captured
as its own concern rather than widened here.

**The controller dispatches construct; rematerialization stays a binding verb.** Today, once top authoring is ready, the
correction continuation dispatches `arc delivery rematerialize` directly — there is no construct step, and the workflow
forbids the operator to invoke a lower-level delivery mutation by hand, so nothing can insert one. That verb then
rewrites member refs from the unchanged private candidates, which is exactly what refused `completeness-mismatched` in
the 2026-09-09 incident. So the continuation gains one dispatched action ahead of it: after the authorized top
correction is clean and committed, the controller dispatches construct over the unlanded suffix with the correction
record's selected deliverable as its placement, then `arc delivery rematerialize` over the chain construct produced,
then the existing review-fix verification. The route's "cut the complete suffix" becomes the controller's dispatched
step rather than an operator instruction. Rematerialization composing construct inside itself was declined: it gives the
binding verb a second job and hides the constructor's typed per-member result behind it. Its precondition and its
terminal proof do change on this route (below); its job does not. The cost is one new continuation action kind, its
outcome mapping in the review-fix driver, the projection predicate below, the eligibility verdict as a new projection
input the handler computes ahead of projecting, the proposal's typed stop with its resume action, the continue input's
optional acceptance digest, the pending selected-refresh interception scoped to the provider-refresh route and the
pending response's currency admitting a stopped loop's mixed chain (below), and the continuation's text. This is also
what places the pair coordinator on the bound route at all — today the handler observes the pair only on
`provider-refresh` — so the coordinator's dirty-checkout refusal guards the bound route only once construct is
dispatched there.

**The projection decides which action is owed from an eligibility verdict it is given.** The review-fix driver
re-projects after every executed action and refuses `delivery-review-fix-no-progress` when an action repeats at
unchanged progress, and that progress carries the state revision, the operation, the boundary version, and Delivery
State's own heads — not the private candidate refs construct writes. Construct dispatched unconditionally would repeat
at identical progress and refuse. So construct is owed while eligibility over the private candidates refuses on § D3's
stale arm — the chain incomplete against the corrected top — on § D2's guard, or on the member walk's
`wrong-predecessor`, which a binding stopped on this route leaves and construct clears by rebinding every pair from the
member records (§ D4, No partial adopted chain); `arc delivery rematerialize` is next once it closes eligible. The guard
cannot say whether the top absorbed the movement it names: it measures the private candidates against the live tip,
which they lack whether or not the top merged it. Construct reads the top, so it decides. Movement the top has absorbed
it clears, by carrying that base into the terminal, or across the chain when a member below the terminal overlaps it
(below); movement the top has not absorbed it refuses with its own typed result, naming the base merge the top still
owes. Either way it cannot repeat. The projector is a pure function over state, route, branch, and authoring inputs and
reads no Git, so the verdict reaches it as an input: the handler runs eligibility prepare and close over the private
candidates before projecting and passes the result in. Any other refusal — the anchor refusal, whose `wrong-predecessor`
carries its direction and remedy, a lifecycle refusal — stops the continuation carrying that refusal and a remedy for
this route, since construct here clears none of them. A refused construct ends the drive with its typed result, and the
driver's fingerprint set lives for one drive, so the operator's repair and the re-entry after it are a fresh drive
rather than a repeat. Built and checked: the predicate reads construct before the rebuild and rematerialize after it.

**A stopped loop re-enters through the route, not the refresh.** A rewrite loop stopped partway leaves a break the
continuation reads as a provider refresh still pending — an unlanded member whose head its dependent does not yet record
as its base — and the continuation intercepts that shape before it reads the route, dispatching the dependent-suffix
`refresh execute` (`review-fix-continuation.ts:506-520`, `:576-584`, reading `suffix-reconciliation.ts:109-138`). On an
unregistered stack that verb refuses `presentation-<status>` before any reservation (`github-refresh.ts:1064-1065`), so
today a bound-route correction whose loop stops has no way back to rematerialization or construct. The dead end predates
this work unit; criterion 6's interruption clause makes it this one's. So the interception applies only on the
provider-refresh route, as that route's own branch already applies it (`review-fix-continuation.ts:655-663`). The route
is a live presentation observation that Delivery State does not record — `review-fix-plan` routes `provider-refresh` on
a registered stack and `rematerialize` on an unregistered one (`review-fix.ts:374-416`) — so at correction routing the
handler takes that observation before the interception and hands the route to the projection
(`delivery-execution.ts:3477-3494`). The Candidate-verification entry keeps today's interception: it carries no selected
member to observe a route for (`entry-inspection.ts:968-975`), and a loop stopped on the rematerialize route never
reaches it, since the top still carries the correction and entry reads `correction-route-ambiguous` first
(`entry-inspection.ts:941-966`). On the rematerialize route re-entry reaches the projection above: authoring readiness
there reads the top against the terminal's recorded head (`delivery-execution.ts:3029-3031`, `:3085-3088`), which the
stopped loop has not moved, and the projection dispatches rematerialization while the loop's candidates still close
eligible, or construct over the mixed chain once something has moved.

**A stopped loop's pending review response stays current.** When no correction task is open, the controller derives the
member from the pending approved review response (`entry-inspection.ts:1047-1056`, `delivery-execution.ts:3247-3290`),
and that response must still be current: its member's head the reviewed head, or a break directly above the member with
the refresh pending (`review-fix-continuation.ts:283-297`); otherwise it refuses `review-fix-response-stale` unless the
reviewed head is an ancestor of the member's new head, which a rebuilt member — one authored commit on its predecessor —
never has. A stopped loop that supersedes no pending correction leaves no pending verification, which the tail installs
only on completion (`suffix-rematerialization.ts:455-459`), and no operation once reconcile has settled any it left
reserved, so a loop stopped after rewriting the selected member's first dependent — a pending tail included — would
refuse stale on that path. A superseding loop stopped between rewrites leaves the verification it superseded instead:
each rewrite's reservation carries that pending set, and clearing the reservation reinstalls it
(`operation.ts:253-270`), so re-entry reads `review-fix-verification-required` and routes correction from that
verification (`delivery-execution.ts:3407-3446`), selecting its member. So currency also admits a mixed chain whose
first break lies above the selected member when the reviewed head is an ancestor of the break's recorded predecessor:
that predecessor is the old chain the stopped run was rewriting, which the reviewed head was part of, and today's second
clause is the case of a break directly above the member. A break below the selected member, or a reviewed head the old
chain does not contain, still refuses stale.

**On the bound route the base the top absorbed goes to the terminal, unless a published member below it overlaps.** A
top that merged the base while members were bound and unlanded is ordinary rather than rare: two of the five stacks
delivered so far did it, three times between them, and one took a reviewed member correction an hour after its second
merge. Suffix rematerialization proves every member but the selected one a mechanical reapplication of its published
contribution, so under disjoint movement construct keeps every non-terminal member's recorded base, folds the correction
into the placed member as everywhere else, and gives the newest base the top absorbed to the terminal alone, as its
absorption merge. That shape was built against the real contribution proof and top adoption rather than argued: over a
disjoint base merged into the top with the fix on the first member and on a middle one, across two base merges, and for
a second correction after the first had rebound, every unselected member proved a mechanical reapplication, the rebuilt
chain closed complete, top adoption accepted it, and a rebuild over its own output reproduced every id. Overlap
re-anchors here as it does before publication, rather than refusing and routing to the operator refresh: `4ae7872f35`
resolved paths its bound middle member authored, so that refusal would have fired on the field case, and the refresh it
named restacks by hand what construct reads from the top.

**A re-anchor advances the target, through the first member's rewrite.** Re-anchoring rewrites the first unlanded member
onto a base that is not the Delivery State target, and two of rematerialization's checks refuse that: its precondition
requires the snapshot's chain base to equal the target, refusing `snapshot-mismatch`, and every member rewrite it issues
requests the current target, which the suffix rewrite requires to equal the current one, refusing `position-mismatch`;
the existing suffix-retarget recognizer covers only a first member moving under an unchanged target. So on a re-anchor
the precondition accepts a snapshot whose chain base — the re-anchored base the members are now built on — descends from
the target and contains the first unlanded member's recorded base, and the first unlanded member's rewrite requests that
re-anchored base as the target — an append-only advance, checked the way refresh adoption already checks its target and
refusing `target-rewritten` otherwise. Every later rewrite then finds the target equal to the snapshot's chain base and
requests it unchanged. Built at the operation layer against package source: the suffix rewrite refused a requested
advance, and beneath it a member rewrite carrying the advance reserved, validated as the active operation, and applied;
the intermediate state — target advanced, later members still on their old predecessors — validated against the plan;
and the next member's rewrite reserved and applied. The precondition's half is read from source, not built. The newest
base must contain both the target and the first unlanded member's recorded base, which after a partial landing are
different commits (below); where it does not, the top has not absorbed the landing, and construct refuses naming the
base merge into the top that clears it. What the loop does not hold still is anything read from the chain base: after
the first rewrite the target and the first unlanded member's recorded base are both the re-anchored base, from which the
recorded resolution reads empty — which is why the proof reads its window from each member's own recorded predecessor
(below).

**The contribution proof admits a changed member's resolution, recomputing it rather than trusting construct.** A
re-anchored member is not a mechanical reapplication of what it published wherever the base's recorded resolution
touched a path it or a member below it authored: its content there is the attributed version, and the real proof refuses
it `contribution-diverged` or `contribution-conflicted` on exactly those paths. So rematerialization's proof admits a
divergence confined to the resolution paths where the rebuilt content equals the attributed version, and discloses every
such path. The proof computes the resolution set and the attribution itself — from the top, the proved member's recorded
predecessor, the protected base, and the published members — and never receives them from construct, which is what it
checks. Its attribution is the chain as construct's fold leaves it: the top's version with every later member's own
commits reverted, and a correction's with them only below the selected member, since at and above it the fold carries
the correction. Construct reverts the correction at every member and lets the fold carry it back (above), and the two
agree wherever the fold leaves a member above the selected one unchanged, since the correction then reaches it only
through its reapplication on the folded member below; where the fold would change it, the later-member stop has stopped
construct first. The model checks that agreement for a member carried across a break; for a member that absorbs the base
it rests on that argument, and on a test that runs it against the real proof (§ Cross-cutting Considerations, Testing).
Its window is that recorded predecessor rather than the chain base, because rematerialization re-proves every unselected
member on each pass of its loop (`suffix-rematerialization.ts:184-203`, `:276-305`) and the first member's rewrite moves
the chain base to the re-anchored one; a member's recorded predecessor moves only when that member is rebound — at its
own rewrite, or for the terminal at the tail's rebind (`suffix-rematerialization.ts:441-453`) — after which its proof is
trivial, so the window holds across the loop and across a re-entry. Modelled on the `4ae7872f35` shape: every member's
recorded predecessor read the whole resolution, the re-anchored base read none, and the terminal refused on its resolved
path without the admission. The admission applies at both proof sites: prepare's carried proof, and the suffix rewrite's
own per-member proof, which re-proves each unselected member raw after its ref moves
(`suffix-reconciliation.ts:707-710`, wired at `delivery-execution.ts:6544-6550`). A member admitted this way has
changed, so it joins the verification set with the selected one, its verdict taken from the pass before its own rewrite,
while its record is still its published state. The loop replaces its verdicts on every pass
(`suffix-rematerialization.ts:309`) and verifies the last pass's changed set (`:332`), by which point every rewritten
member's record equals its candidate and proves tree-equal, so an admitted middle member would drop out even from an
uninterrupted re-anchor; the verdicts accumulate across the loop's passes instead. A loop that starts over a mixed chain
cannot recover the verdicts the stopped loop computed, since every member it rewrote now proves tree-equal, so it adds
every unlanded member up to and including the one whose head its dependent does not yet record, found from the landed
prefix (`suffix-reconciliation.ts:126-138`) — conservative, and needing no durable record. A correction that supersedes
one still awaiting verification verifies the pending set verbatim (`suffix-rematerialization.ts:330`), so a member it
admits that the superseded correction did not would go unverified; it verifies instead the pending set unioned with its
own admitted members, and installs that union in place of the pending set it contains, which the install refuses today
(`review-fix-verification.ts:47-49`). Each rewrite's reservation still carries the pending set exactly and restores it
on completion (`operation.ts:448-453`, `:255-267`), so what the superseded correction was owed stays owed. An admitted
member's consent is construct's proposal: a published member whose attributed content differs from what it published is
exactly what construct proposes, and construct adopts nothing until the operator accepts, by resubmitting the stop's
resume action, which carries the proposal's digest (above). An interrupted drive needs no carrier for that consent. With
nothing moved it resumes rematerialization over the candidates the operator accepted, and the proof admits their members
on rebuilt content equal to the attribution it recomputes. With something moved it rebuilds, and construct, comparing
against what each member has published, proposes again whatever the stopped loop had not yet republished — one more ask,
accepted by resubmitting that stop's pre-filled action (§ Alternatives & Rationale). Built against the real proof: an
unselected member re-anchored under a base that touched none of its resolved paths proved a mechanical reapplication,
and the re-anchored terminal refused only on the resolved path. The fix response the acknowledgement records follows the
selected member's moved base, which § D8 carries.

**The terminal's carry proof changes three times, and the first change corrects a defect.** Rematerialization proves the
terminal too — it is never the selected member — and compares it raw: its before-member is the terminal as Delivery
State records it, the lifecycle-bearing top, while its rebuilt candidate is lifecycle-normalized, as every eligibility
candidate must be. So the proof refuses `contribution-diverged` on exactly the work unit's lifecycle paths, for every
work unit, over a perfect chain. That is the 2026-09-09 incident's third stop, crossed only by hot-patching the built
bundle; the route has run end to end exactly once, on that patch, and no test runs its handler against real Git. The
proof now compares lifecycle-normalized, under the normalization completeness already applies, so the lifecycle path
group composes into it while every non-lifecycle divergence still refuses. And where the terminal carries an absorption
merge, its after-predecessor is that merge — the predecessor it was built on — rather than the rebuilt highest member,
from which the absorbed base reads as the terminal's own divergence and refuses; built, the proof refused the one and
accepted the other. The merge is admitted as that predecessor only under a structural check: its first parent is the
rebuilt highest member, its second is contained in both the protected base and the top, and its tree is the clean
three-way absorption of the two outside the base's recorded resolution and, on each resolved path, the attributed
version the proof recomputes — the top's own, for the terminal, since on this route no correction is placed on it. The
constructed merge takes the member's version on the resolved paths, so it departs from the clean merge-tree exactly
there; built over disjoint movement, where that merge-tree always exists because a conflict needs a lower member's path,
it differed on the resolved paths alone, each holding the top's own version. Its before-predecessor stays the recorded
base, as for every member. The third is the resolution: where the top's merge of the base conflicted on a path the
terminal authored, the real proof with the absorption merge as after-predecessor refused `contribution-conflicted` on
that path alone, and so did the proof over the same chain re-anchored; with the rebuilt highest member it refused
`contribution-diverged` on that path and on the base's own path. So the terminal takes the admission above, reading the
top's own version as the attributed one, and the structural rule stays beside it because the base's own path is not a
resolution path.

**The operator refresh is the route that clears an entangled chain here.** Both stack shapes reach it: `arc delivery
refresh plan`, a restack of the suffix to exactly the planned suffix — `refresh execute` on a registered stack, the
operator's own restack on an unregistered one — then `arc delivery refresh adopt`, which checks no registration, proves
each moved member a mechanical reapplication, and re-chains the recorded bases onto the observed target. It needs every
unlanded request open on its chained base, which publication sets and the host keeps by retargeting a request when the
member below it lands. An entangled chain's restack conflicts by definition, and the top that entangled it has merged
`main`. § D9 admits both: the restack under consent — through ARC's resolution workspace on a registered stack, through
one exact resubmission on adoption — and the top's append-only movement on the refresh arms, which refuse while authored
content rides on the top with a non-terminal member outstanding. Setting the correction aside first is what lets the
refresh run.

**A correction after a partial landing keeps the suffix on the base it was built on, until a re-anchor moves it.** An
unlinked landing moves only the plan's target, to the landing merge, and leaves the first unlanded member recorded on
the landed member's head — a commit the landing merge contains by the landing's own proof, and the top contains through
the ancestry adoption publication made. The native route restacks the suffix onto the target, and two readers still
assume that shape: suffix rematerialization requires the snapshot's chain base to equal the target, and the
active-operation check requires a member after a landed one to sit on the target head. Neither holds on an unlinked
stack after its first landing, so a correction there refuses a bare `snapshot-mismatch` with no remedy, and an
interrupted correction cannot be re-observed. So on the bound route the chain base is the first unlanded member's
recorded base — the target itself until anything lands, since materialization cuts the first member on it — and both
readers accept a member after a landed one on either the target head or that landed member's own head, with the target's
containment of the chain base checked. `snapshot-mismatch` gains remedy text. The proofs then take the right endpoints:
the first unlanded member's before- and after-predecessor are both the landed member's head, so an unselected one
reduces to tree equality. The landing proof's own predecessor is the same stored base, and correcting it is a routed
Errand's (§ Non-Goals, Adjacent owners). A re-anchor after a partial landing advances the target from the landing merge
to the newest base, which contains it whenever the top has absorbed the landing.

**Required behavior:**

- Prepare or compare-and-swap rebuild the complete unpublished candidate chain from its member sources — the operator's
  cut list at the first cut, for the authoring-side recut, and for the recut a stopped binding owes under a revised
  plan, the chain as it stands afterwards, each member's range read from the predecessor it was built on — together with
  the placement operand and authoritative lifecycle exclusions. At the first cut the chain base is the newest base the
  top absorbed, and every member is anchored on it; afterwards it is the base the chain was built on, unless the overlap
  clearing re-anchors the chain.
- Check anchor compatibility before building anything: every base the sources carry is one the originating top contains,
  so a mechanically wrong anchor refuses — naming the member and the recut from the cut list — rather than being
  discovered by the eligibility close after a whole chain was built against it. A chain whose terminal matches no commit
  on the top's first-parent line has no source top, and refuses naming the recut too.
- Under disjoint protected-base movement, retain that chain base and return an **unchanged chain** when the existing
  cuts remain compatible. Cut compatibility is the predicate § D2 gives both eligibility boundaries — per-member
  authored content measured against the movement that member has not absorbed — so one rule governs construct and
  eligibility instead of two that can disagree. A newer base OID alone must not trigger recutting, and newer
  base-only bytes the originating top lacks must not be silently imported.
- When an unlanded member below the terminal authored a path that the movement to the newest base the top absorbed
  touches, or that the base's recorded resolution touched, re-anchor every unlanded member on that base; otherwise give
  it to the terminal alone, retaining every lower member. Each resolved path takes the attributed version — the top's
  with every later member's own commits to it and the delta's reverted, wherever the delta is placed — at every member
  whose own range authored it or that sits above a member that did, a delta placed on a member not counting, members
  below its owner keep the base's version, and a resolved path no member authored goes to the lowest member that absorbs
  the base. A revert that conflicts stops as an entangled chain, naming the member, the path, and its route's remedy.
  Movement beyond that base that a member authored against refuses, naming the base merge into the top.
- Stop before adopting anything when a non-terminal member's attributed version of a path differs from what its source
  carries there, presenting every such member and path in one proposal under one digest — over the plan, the members,
  the source top's head, and each path's attributed blob — and naming the continuation that accepts it; re-running with
  that digest adopts the same objects, a stale digest stops again on the new proposal, and, before publication, a
  rebuild reproducing accepted content does not ask again, while on the bound route a rebuild asks again until the
  member is republished.
- Emit one authored commit per plan member — **n**, the terminal's eligibility vehicle included — each carrying that
  member's net contribution reapplied onto its new predecessor, the terminal's alone preceded by an absorption merge of
  the newest base the top absorbed when that base goes to the terminal, under the message, authorship, and determinism
  rules above.
- Compose the chain without the delta first, each member reapplied or carried on its predecessor and absorbing the base
  where it does, then fold the delta — the top's first-parent line after the source top — into the placed member and
  into every later member as it is reapplied on the folded member below, above the placed member only on the paths that
  member's own range changes, and on the bound route stopping instead where that would change a later member (below);
  with no placement, into the terminal. A delta that absorbed a newer base splits — the absorption where the overlap
  clearing puts it, the authored remainder to the placed member — the split point taking, on each path the delta's base
  merges conflicted or departed on, the top's version with the delta's own non-merge commits to it reverted newest
  first, a commit and its recorded revert dropping out together. A revert that conflicts stops as an entangled
  correction naming the placed member and path, whose remedy on either route is to revert the correction on the top,
  re-apply it after the merge, and continue. The terminal's absorption merge takes the member's version from before the
  remainder is folded.
- Across a chain the bound route's rewrite loop left mixed — from the first unlanded member whose recorded predecessor
  is not the head of the member below it, the terminal included until the tail's rebind — carry each range by a
  three-way merge on its recorded predecessor, taking the attributed version on the member's share of the recorded
  resolution read from that predecessor up to the base the members below the break absorbed; a conflict outside it stops
  for its resolution as any conflict composing a member does. While the chain is mixed, advance the source top past the
  top's first-parent commits the member below the break already carries — a normalized tree equal to its first parent's,
  a base merge whose base that member contains, a change whose cherry-pick onto it is empty — stopping at the first it
  does not. Read each non-merge commit it passes hunk by hunk, by three-way merges, against the break's recorded
  predecessor re-anchored on the base the members below the break absorbed — on each path the base moved in between, the
  record merged with that base over its own base, a path where that merge conflicts keeping the record as it was — and
  keep what that record never held in the delta, folded at the placement and undone on the top for attribution, counting
  a path whose carried part does not merge back onto the commit's parent as never held; where undoing it conflicts, stop
  naming the path, with the later-member stop's remedy. With nothing moved the result is the chain the stopped loop was
  building, object for object; a fold reaching a member carried across the break takes the later-member stop there.
- Stop, with nothing adopted, on any conflict composing a member — reapplying or carrying its range, folding the delta
  at the placed member or a later one — naming the member, the step, and the paths, and prepare that member's resolution
  workspace under construct's own sub-path of the plan's resolution path family, holding the composition's two sides
  merging over its base with Git's conflicted result, and replacing one that holds another composition — removing
  construct's workspaces by force, only there and only as a detached worktree registered at that path. On the continue,
  import the resolution committed there on the two named sides, check both parents, record it as content under that
  sub-path against the composition's three input trees, and remove the workspace; take a recorded resolution wherever
  the identical composition recurs — a reapplication's before the member's fold, a fold's as the member's content after
  its whole fold — and remove the records, and every workspace construct left, at the last bind. Before publication,
  take the corrected top's normalized tree at a conflicted terminal rather than stopping.
- On the bound route, admit a later member's resolved reapplication where every conflict the contribution proof finds is
  resolved by a resolution recorded for that exact composition and the member's content is that resolution, rendering
  the stop to the agent as its reapplication alone — its published change on the corrected predecessor, never the top's
  version — and disclosing its conflict paths and every path where it departs from the mechanical composition, and
  entering the member in the verification set, its prior approval left to review readiness at landing, where it does not
  carry; keep the records until the rematerialization tail completes, which removes them. Stop before adopting anything
  where a fold would change any member but the selected one, cleanly or through a conflict, a member that absorbs the
  base or is carried across a stopped loop's break included, read at the fold rather than left to the contribution proof
  — the later-member stop — naming the member and the paths, and, where the selected member changed, the split on the
  top: revert the correction, re-apply the selected member's part and continue, and deliver the rest as terminal work;
  where it did not, the pending review-fix authority it cannot discharge, which needs the Owner's direction.
- Verify before adopting anything that each authored commit changes only paths its member authored — plus, on a
  re-anchored first member, the recorded resolution's paths — and refuse terminally, as a constructor defect with
  nothing adopted, when one does not.
- Bind each constructed member into the existing private candidate namespace with its paired candidate checkout, so
  the pre-publication review gate can read it and the chain is referenced from the moment it exists.
- Observe every member's candidate pair **before binding any**. A dirty, foreign, or attached checkout, or a
  half-present pair, refuses with nothing adopted — the clean-tree precondition checked up front, the way `git
  rebase` refuses to start over a dirty tree and stacked-change tools check for uncommitted changes before a
  restack. It is the same read the coordinator makes per member at bind time, repeated ahead of the first write
  rather than relocated: the bind-time read stays, since the provider-refresh route calls the coordinator unchanged
  and the stop-and-resume path depends on it.
- Refuse a rebuild a candidate checkout cannot be reset for by **naming the dirty paths observed**, separating
  untracked residue from tracked modification because their remedies differ, and stating that re-running resumes.
  This is the one place the reused primitives do not suffice as they stand: the observation port collapses a
  non-empty status read to a bare `dirty` and the coordinator carries it on a string-typed reason, so both widen to
  carry the paths. The data is already collected and discarded — the status read distinguishes untracked from
  tracked.
- On the bound review-fix route, after the authorized top correction is clean and committed, rebuild the selected member
  with the correction folded into it and every dependent member reapplied on it, a fold that would change a dependent
  taking the later-member stop, from the Delivery State member records with the first unlanded member's recorded base as
  chain base, dispatched by the correction controller while § D3's stale arm, § D2's guard, or the member walk's
  `wrong-predecessor` over the pairs a binding stopped here left refuses. The overlap clearing applies there as before
  publication. A re-anchor's newest base must contain the Delivery State target and that recorded base, and construct
  refuses naming the base merge into the top when it does not; a published member whose attributed content differs from
  what it published is proposed, and the acceptance is the consent its republication needs.
- At correction routing, observe the route before the continuation's pending selected-refresh interception and apply the
  interception only on the provider-refresh route, so a correction whose rewrite loop stopped on an unregistered stack
  re-enters through the rematerialize route's projection: rematerialization while the loop's candidates still close
  eligible, construct over the mixed chain once something has moved. Admit as still current a pending approved review
  response whose chain's first break lies above its selected member when the reviewed head is an ancestor of the break's
  recorded predecessor.
- On a re-anchor, accept in suffix rematerialization's precondition a snapshot whose chain base, the re-anchored base,
  descends from the Delivery State target and contains the first unlanded member's recorded base, and request that base
  as the target on the first unlanded member's rewrite; admit, on that rewrite only, a requested target that descends
  from the current one, checked as refresh adoption checks its target and refusing `target-rewritten` otherwise; every
  other requested target must still equal the current one.
- Prove the terminal's carried contribution lifecycle-normalized, taking its absorption merge as its after-predecessor
  where it carries one, admitted only when its first parent is the rebuilt highest member, its second is contained in
  the protected base and the top, and its tree is their clean three-way absorption outside the base's recorded
  resolution and the top's own version on each resolved path, no correction being placed on the terminal on this route.
- Admit in rematerialization's contribution proof, for every unselected member the terminal included, a divergence
  confined to the base's recorded resolution where the rebuilt content equals the attributed version — the top's own for
  the terminal — computing both from the top, the proved member's recorded predecessor, the protected base, and the
  published members rather than receiving them, so the window holds across the loop's re-proofs and a re-entry; apply it
  at both proof sites, prepare's carried proof and the suffix rewrite's per-member proof after the ref moves; disclose
  every admitted path and enter every admitted member in the verification set, taking each member's verdict from the
  pass before its own rewrite so the verdicts accumulate across the loop; on a correction superseding one still awaiting
  verification, verify the pending set unioned with the admitted members and install that union in place of the pending
  set it contains, each rewrite's reservation still carrying the pending set exactly; and on a loop that starts over a
  mixed chain, enter every unlanded member up to and including the one whose head its dependent does not yet record.
- After a partial landing, accept a first unlanded member recorded on the landed member's own head as well as on the
  target head — in suffix rematerialization's precondition and in the active-operation predecessor check — with the
  target's containment of it checked, and give `snapshot-mismatch` a remedy.
- Upgrade § D3's stale arm to a close-side `rebuild-required` reason naming construct — the shape pinned probe 3
  awaits, distinct from the prepare-side anchor refusal probe 2 awaits and § D3 retires — widening the refusal-reason
  union to carry it, with the three `completeness-*` reasons leaving the union.
- Replay converges. Conflicts, dirty or foreign checkouts, moved authority or public heads, stale authorization, and
  incomplete normalization — every condition observable before the first write — stop or refuse **without a partial
  adopted chain**.
- A conflict stops with its exact member and that member's resolution workspace, and leaves the old chain usable:
  objects are constructed first, so a conflict anywhere in any member's composition stops before anything is adopted.
- A failure partway through binding **stops and resumes** rather than rolling back, per the adoption paragraph below;
  before publication the mixed chain it leaves is refused by prepare, naming `construct --continue` as the remedy, and
  converged by continuing, which binds the chain construct recorded, composing nothing; on the bound route prepare's
  refusal owes construct, which rebuilds from the member records, which binding never writes, and binds over the pairs
  as it observes them.
- Before publication, record a binding before binding the first member — one ref in the plan's candidate namespace,
  under a leaf no member's slug can take, at a record commit whose parent is the constructed chain's terminal and whose
  message carries the placement and the plan's digest — through ref primitives of its own, creating it only where none
  stands and replacing or deleting it only against the value read, and delete it when the last member binds. While a
  record under the current plan's digest stands, bind the recorded chain's remaining members on `construct --continue`,
  composing nothing, and refuse any other construct run with nothing done, naming it. Under a record from another plan
  digest, delete it and cut from the cut list when construct is given the revised plan's cut list, and otherwise refuse
  with nothing done, naming that recut. Offer no abort.
- Reap the plan's resolution path family — construct's workspaces, removed by construct's rule, by force only at its
  sub-path and only as a detached worktree registered there, and its recorded resolutions — and a stopped binding's
  record, through the record's own delete, with the rest of the plan's residue.

**Substrate contracts versus tracked-tier projection.** Coordinate production today normalizes trees against lifecycle
and Candidate records, because those artifacts ride the work unit's code history, and it reapplies each member's net
contribution as a fresh commit because a normalized tree is not any commit the branch already has. Both are tracked-tier
projection, and the storage direction schedules their retirement (`strategy-storage-evolution` § Holistic Design,
tracked-tier delivery projection retirement): once operational state materializes off-branch, the exclusion set empties,
members become ordinary interior refs of the work-unit branch, and restacking a published stack passes to the provider.
What retires is therefore more than a filter — lifecycle normalization, net-contribution reapplication, the absorption
merges and the attributed resolution that places them, and the commit construction built on them (the derived subject,
byte-exact authorship, the co-authorship union) all go, because an interior-ref member is an existing commit rather
than a constructed one.

What survives is the verb's contract rather than its interior: the typed per-member result, degenerating to cutting and
binding refs; the member-boundary operand and its seam; the placement operand naming the member a correction belongs to;
the anchor and cut compatibility predicates eligibility applies at both of its boundaries; the member-source rule
reading each range from the predecessor it was built on; the up-front pair observation and stop-and-resume binding with
its continue; compare-and-swap on every ARC-owned ref write; and member-boundary verification, which the storage
direction names as a substrate-independent contract alongside the delivery-typed terminal-authorization arm. The
rebuild-specific guarantees — the retained chain base under disjoint movement, the overlap clearing, the conflict stops
and their resolutions, the later-member stop, and both entangled stops — hold for as long as ARC reconstructs members,
and lapse with the reconstruction rather than migrating anywhere.

**Author the constructor so the retirement is a removal rather than a rewrite.** Two constraints carry it. The exclusion
set reaches the constructor through one resolver seam the constructor does not own, never as an inlined path list;
today's supplier is `resolveCurrentLifecyclePaths`, and the storage move is what empties it. And the constructor's
stages stay **separable** — cut the member boundaries, compose each member's tree, write its commits, bind the pair — so
the retirement deletes the middle two and leaves cut-and-bind behind the same verb, rather than requiring the verb to be
rewritten around a different shape.

**The constructor places both halves of the pair, and the checkout is not optional.** The primitive is atomic by
construction — it creates the ref under a zero lease and then adds the detached worktree, rolling the ref back if
the worktree fails — and the coordinator refuses `candidate-pair-split` whenever exactly one half is absent. There
is no ref-only arm to take. Nor would one be wanted: § D6 removes the per-member Tier 2 **run** from the window,
but the checkout's surviving reader is the **pre-publication review gate**, which requires it non-dirty with head
and tree equal to the member's before composing a single target. The checkout is the reviewable working tree, not
a leftover of where gates used to run, so removing the run does not remove it.

Before binding any member the constructor observes every existing candidate checkout and refuses a dirty, foreign,
or attached one. That refusal is what makes "nothing adopted" true for the checkout conditions: a leftover pair
surfaces at the boundary that noticed it, before any write, instead of midway through binding or at the next
correction that trips over it.

**The disk cost is carried rather than waived.** Measured on one live three-member plan in this repository, the
existing checkouts total 671M; one is 235M, of which 148M is the dependency tree a Tier 2 run deposited, leaving
**83M of checked-out working tree per member** held from construct until reap. With no gate run in the window the
dependency trees no longer accumulate, but the working trees do, and the reaper is what bounds them — which is
why the pair contract and the reaper's `candidate-checkout-mismatch` refusal are load-bearing rather than
incidental.

**The typed result enumerates per-member disposition.** For every member the result names whether its cut was **retained
unchanged**, **recut**, or recut from a resolution, the last naming the resolved paths, so what an agent resolved stands
apart from what construct derived. Without it the unchanged-chain arm is unobservable: an operator cannot tell a chain
the constructor deliberately left alone from one it silently failed to touch. On refusal the result names the exact
member that stopped it and the remedy its route has — the base merge into the top, the recut from the cut list,
`construct --continue` for a stopped binding or the recut under a revised plan, the split on the top or the pending
authority for the bound later-member stop, the entangled chain's structural remedy, or setting an entangled correction
aside on the top and re-applying it. A conflict stop and a proposal are outcomes of their own rather than refusals —
nothing is wrong, a resolution or an acceptance is owed: the conflict stop carries the member, the step, the paths, the
workspace, and the continue; the proposal carries each proposed member and path, the attributed content, the digest, and
the exact continuation. The workflow surfaces each as one prompt to its resolver (§ Cross-cutting Considerations, Stop
routing).

**No partial adopted chain, and the mechanism that makes it true.** Objects first: every member's tree and commit is
constructed before anything is adopted. Object construction touches no chain state, so a conflict at member N stops with
nothing to undo and leaves the previous chain exactly as it stood — the conflict stop above is that property rather than
a second mechanism, and it is what carries the guarantee on the path where it can fail; its one write is the member's
resolution workspace, which holds no chain state.

Adoption then binds each member's pair under the **compare-and-swap on every ARC-owned write** that is this substrate's
safety property everywhere else, member by member, through the idempotent pair coordinator. No all-or-nothing batch is
specified. A ref transaction is available — `update-ref --stdin` already commits a verified branch deletion when an
Errand is abandoned — but it could not deliver the property: each pair's checkout half is a worktree write that no ref
transaction covers. What the property needs is split by when a condition is observable. Every condition observable
before the first write — conflicts, dirty, foreign, or attached checkouts, half-present pairs, moved heads, stale
authorization — stops or refuses up front with nothing adopted. A failure partway through binding — a checkout that
turns dirty, or a candidate ref that moves, after the up-front observation — **stops and resumes** rather than rolling
back, which is the stacked-change idiom: a restack that fails partway leaves the lower branches restacked and finishes
with a continue. The pairs already bound stay bound, the member it stopped on binds nothing, and the unbound remainder
stays reachable before publication through the binding's record (below); on the bound route construct builds it again
from the same inputs, object for object. The chain is then **mixed** — new lower members over an old suffix — and
eligibility prepare refuses it `wrong-predecessor`, since the old suffix's first member does not descend from the new
member below it, so a mixed chain is never admitted. That is the member walk's emitter, which today carries no remedy;
D4 gives it the one that clears a mixed chain on each route — before publication `construct --continue` (below), since
the anchor read's recut from the cut list would discard earlier placements and merging a base would change nothing, and
on the bound route construct, which the projection owes on this refusal (§ D4, How the bound correction route reaches
it). Either converges. The continue binds the chain the stopped run constructed, which the record keeps reachable, so
the result is that chain object for object, and construct on the bound route binds the chain it builds over the pairs as
it observes them; a pair already at its constructed coordinates returns `already-rematerialized`, a pair at its old
coordinates is rewritten and its checkout reset, and a pair at neither refuses `candidate-pair-moved` for the next run
to re-observe. An all-or-nothing batch would be more exacting than the idiom this substrate follows everywhere else.

**Before publication a stopped binding is continued, never re-run with other operands.** There construct reads the
private candidates it binds, so a binding that stops leaves construct's own source mixed. Every member is constructed
before the first binds, so a binding that stops has already built the whole chain, and the continue binds what remains
of it rather than constructing it again. Before it binds the first member construct records the binding: one ref in the
plan's candidate namespace, under a leaf no member's slug can take, at a record commit whose parent is the constructed
chain's terminal — so every member it built stays reachable — and whose message carries the placement and the plan's
digest. The ref is created only where none stands and replaced or deleted only against the value read, by
compare-and-swap like every other ARC-owned write, through primitives of its own, since the candidate ref primitives
admit only a member's slug as the leaf and rewrite only a ref that stands (`git-materialization.ts:10`, `:89-98`,
`:115`, `:152-160`), and construct deletes it when the last member binds; it holds the chain for the one operation, as
`git rebase --update-refs` holds each branch's rewritten commit until it writes the refs at the end. While the record
stands, `construct --continue` composes nothing: it binds the recorded chain's remaining members, re-observing each pair
as binding always does, so recorded state alone decides what it binds, and the agent's part is to clear what stopped the
binding and run it; any other construct run refuses with nothing done, naming it, as `git rebase` refuses while one is
in progress and names its `--continue`. A correction committed on the top after the stop is the next construct's: the
continue binds the chain as it was built, § D3's stale arm then names construct for the moved top, and construct over
the completed chain places the new correction where it is given. A plan revised since the stop is a new chain, so a
record under another plan digest is neither continued nor read: construct given the revised plan's cut list deletes the
record and cuts from the list, as at the first cut, and any other run refuses with nothing done, naming that recut,
which re-places what earlier constructs placed, as any recut from the cut list does. Constructing the stopped binding
again over the mixed chain it left, the first reading, was rejected (§ Alternatives & Rationale). There is no abort. The
pairs already bound stay bound, and dropping the record alone would hand the mixed chain to whatever operands came next
— what git-spice's abort of one interrupted branch leaves — which is what the record exists to prevent; restoring every
pair, as `gt abort` restores a whole restack, would need each pair's old coordinates and a reverse bind, for a rare race
whose continue always completes. A conflict stop, which comes before any bind, needs none: nothing was recorded and the
previous chain stands, so it is abandoned by not continuing, and construct's next run to complete removes the workspace
it left. A stopped binding's complete outcomes are the continue or a revised plan's recut; the reaper removes an
abandoned record with the rest of the plan's residue (§ Cross-cutting Considerations, Disk lifecycle).

**On the bound route a stopped binding is constructed again.** There construct reads the member records, which binding a
candidate pair never writes, so a binding that stops leaves construct's source whole. Prepare's member walk refuses the
pairs it left `wrong-predecessor`, the projection owes construct on that refusal as on § D3's stale arm, and the
controller dispatches it with the selected member, as always; construct rebuilds from the member records and binds over
the pairs as it observes them. With nothing moved that is the stopped chain again, object for object, its unbound
objects recreated rather than kept reachable, and nothing is recorded, refused, or handed to the agent. A selection that
changes before rematerialization publishes a chain construct built — after a binding stopped here, or any stop between
the two — is placed afresh, since construct reads the published members: the whole unpublished delta goes to the new
selection, where a correction for a member below it folds in with no stop and one for a member above it stops. Whether
one correction may supersede another still unpublished is disposition supersession, `review-signal-convergence`'s
(§ Non-Goals, Adjacent owners). The rematerialization loop records nothing either and builds no chain ahead of its
rewrites, so a construct over a chain that loop left mixed reads it by the carry and advances by the cherry-pick test
(above), and there the later-member stop keeps an uncarried part out of any member but the selected one. That leaves two
boundaries, stated rather than closed: after such a loop stopped and something moved, a correction touching the line
beside a later member's stops at the selected member for one more resolution; and a selection that changes before
publication is placed afresh.

**What the constructor does not claim.** It does not make tests instantaneous or auto-resolve a semantic conflict —
the measured 38 minutes went largely to semantic conflict resolution after an upstream test-file extraction and to
finding post-cut changes that belonged in specific members. Evidence carry at publication is D6's.

**Prior intent this restores.** The completed `delivery-native-stack-composition` design records that base movement
before materialization is an ordinary work-unit base merge followed by member verification reruns, commits that the
protected base is never frozen, and budgets **no manual recuts**. Its later typed authoring verbs both require an
already-bound Delivery State revision and were scoped to public review-fix replay; the unbound initial-publication
case was neither implemented nor recorded as a deferral.

### D6 — Publication reads the attestation; the projection reaches the operator

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

**The predicate already exists one seam over and is reused rather than designed again.** The work-unit publication
verb projects the effective target and derives its own currentness as `state === "current"` **and**
`convergenceVerification === "satisfied"`, then refuses when the Candidate lineage is not current, re-reading it
after reconcile before any mutation. It is even delivery-aware at its boundary locus. The seam that does not read
it is `arc delivery publish`, which enters fresh eligibility directly and consults neither the Candidate record nor
the submission boundary. D6 therefore **composes that existing derivation** at the delivery seam rather than
deriving a second currentness predicate there — which is the proportionate shape and carries the convergence half
for free. A task list must not author a new predicate here.

**Reuse means extraction, and the delivery seam does not inherit the boolean.** The derivation lives today as a
closure local to the work-unit publication handler, and it reduces the projection to one `candidateCurrent`
boolean whose single refusal names one remedy — re-attest. Composed at delivery publication as it stands, that
would re-create at a fifth read site the very collapse this deliverable removes at the reconcile seam. So the
derivation is **extracted into a function both seams call**, and delivery publication's refusal follows the
`readCandidate` pattern below: a non-current Candidate refuses carrying the arm's own disposition — `state` and
`nextAction`, with `reason` and `detail` where the arm has them — **beside** the re-attest route rather than in
place of it, and a pending convergence refuses naming the response awaiting it and the required scope. That is
explanation, not a decision surface: the undecided arm's choices belong at reconcile, where an operator decision
genuinely lives, not at a publication gate. The work-unit publication verb keeps its own refusal as it stands.

**What the read uniquely catches, stated so a test can falsify it.** A chain prepared against a superseded subject
and left **unrebuilt** needs no new mechanism: delivery publication re-derives everything from live refs and the
close ends in normalized completeness against the freshly observed top, so that state already refuses. The state
only this read sees is the **complement** — the top advances _and_ the chain is rebuilt to match it, with
attestation not re-run. Completeness then compares equal, the plan digest is unchanged, the predecessor relation
over the first member and the protected base is untouched, and `top-ref-mismatch` compares ref _names_ rather than
heads, so an advanced top passes both the pre- and post-prepare checks. Every mechanical check passes over content
no gate ever saw. The falsifiable shape is exactly that: advance the top, rebuild the chain so completeness passes,
skip re-attestation, and require publication to refuse.

**The hole is not one the constructor opens** — `arc delivery publish` has never read the attestation, entering
fresh eligibility directly and consulting neither the Candidate record nor the submission boundary. What D4 changes
is the cost of standing in it: rebuilding onto an advanced top previously meant re-running preparation, which
re-attests, and a reconstruction verb reaches the same state without passing through one. The read is owed either
way; the constructor is why it stops being theoretical.

**Convergence is a second state, and not the delivery-state record it resembles.** `convergenceVerification`
reduces over approved review-fix response transitions: a response whose evidence does not carry leaves the
projection `pending` at a `focused` or `full` required scope, with the pending response named. That is
Candidate-record-derived. Delivery state separately records `pendingReviewFixVerification`, and the terminal-rebind
arm reads the two independently — they are related but not the same record, and this design does not assert they
coincide. What matters is that the delivery close reads neither.

**What it establishes, stated precisely.** The attestation is work-unit-level: it establishes that the union
reviewable contribution passed, never that a non-terminal member passed in isolation. Per-member content may reach
the landing window having been checked only as part of a composed state, with the `Integrating` window, the
terminal checkpoint, and the base's own required checks as the net. This is the accepted consequence of the
check-placement decision (§ Alternatives & Rationale), stated here so it is not later read as an oversight.

**The `gateResults` operand is removed, and nothing replaces it.** It is D6's content by subject but **lands on the
D1+D2 member**, because only the landing that removes the gates closes the window D2 opens (§ Boundary outcome and
delivery shape). Deliverable ownership and landing position differ here deliberately; nowhere else do they. It
reaches **four** seams, and the fourth is not a drop. The first three — the eligibility close, the prepare arm's
optional revalidation, and `publish` — drop it outright. Its validator refuses on five reasons, none of which
survives:

- `duplicate-gate-result`, `missing-gate-result`, and `reordered-gate-result` are well-formedness of a
  caller-supplied list. They exist only because the list exists.
- `gate-result-failed` is the verification evidence this work unit relocates.
- `gate-result-stale` binds each result to its member's exact head and tree, which reads as structural but is not:
  the snapshot and the results arrive from the **same caller**, so the pair never witnessed anything a caller could
  not fabricate together. Removing it costs no anti-fabrication property because it never held one — consistent
  with the snapshot being an ephemeral mechanical value rather than a persisted authorization token.

`CandidateGateResultSchema`, the `DeliveryCandidateGateResult` type, the validator, and its five refusal reasons
become unreachable and are removed with the operand.

**The fourth seam is the public-failure composer, and it is restated rather than dropped.** It derives a refusal's
`requestedHead` from the final gate result when the request carried no coordinates — an `?? finalGate.head`
fallback inside an **owned public failure contract**. Removing the operand silently changes that field's value by
deleting its fallback, so this seam owes a stated replacement rather than a deletion: the composer must say what
`requestedHead` carries when the request supplies no coordinates, and the contract's field must narrow
deliberately rather than by the disappearance of its source. A task list built from a three-seam enumeration would
leave the dangling fallback in place.

**The mutation path's verification loop goes; the verifier itself stays.**
`verifyDeliveryCandidateCheckout` does two independent things: it inspects a checkout for dirt and exact
coordinates, and it re-observes the candidate ref against the snapshot. On the mutation path what the inspection
established was that a Tier 2 run happened at the member's exact coordinates in a clean tree — gate attribution,
not publication safety. With no run in the window that subject is gone, so the **per-candidate loop the mutation
path runs ahead of the close is removed, and `checkoutPath` goes off the mutation request with it**. Both callers
of that path lose it together: it is one loop at one call site, serving `publish` and the bound rematerialization
route alike, and neither retains a use for it. **This removal lands on D6, not with the `gateResults` operand on
the D1+D2 member.** Between those landings the loop is harmless — it inspects a clean checkout that no run touched —
and until D4 dispatches construct on the bound route it is that route's only checkout inspection, so removing it
earlier would open a second inter-member window beside the one accepted above.

Nothing is left unguarded by that removal, and the two guards that matter are elsewhere:

- **The reviewable working tree keeps its guard.** The pre-publication review gate calls the same function over
  every derived locator before composing a single target. Composition consumes only `{ baseRef, diffBaseSha,
  headSha }`, so the verification is not a composition input — it is the proof that the tree a reviewer is about
  to be asked to approve is clean and at the member's exact coordinates. That subject is unaffected by where
  checks run, so this caller is untouched.
- **The correction-authoring pair keeps its dirt check.** On the bound route the pair is where the constructor
  writes, and the correction controller dispatches construct there (§ D4), which lands before this deliverable. The
  constructor's up-front observation refuses a dirty candidate checkout before anything moves — a guard that sits
  closer to the write than the eligibility loop did. The operator's editing locus on that route is the **top
  authoring locus**, not the member's candidate checkout, so the removed inspection was not standing where the edits
  happen.

So `verifyDeliveryCandidateCheckout` and everything it needs — `inspectCheckout`, `checkout-dirty`,
`checkout-moved` — all stay live for the review-gate caller. **What this deliverable removes is the mutation
path's use of the verifier, not the verifier.** Candidate drift is not left uncovered either: the close's own
final loop re-observes every member ref after the verification loop would have run, and D2 keeps members in that
loop while narrowing only the protected-base entry.

**What the eligibility close validates afterwards is purely mechanical, and already substantial:** the fresh plan read
against the snapshot's plan identity, revision, and digest; lifecycle-path resolution and the unchanged-paths comparison
across both the lifecycle and regenerable sets; per-member lifecycle revalidation; the live protected-base
re-observation and the per-member authored-overlap guard D2 adds; the independent chain-base refusal; § D3's anchor
read, repeated above the completeness comparison; and normalized completeness. The close holds no verification role at
all, which is why removing its only verification operand leaves it coherent rather than hollowed out.

**The reconcile seam surfaces the applicability decision it currently discards.** The substrate criteria 2 through
5 need already exists and delivery already reaches it: projecting an effective Candidate target does not stop at a
blocked currentness but derives structural contribution endpoints and a proof, returning either a
machine-recognized current target or a fully composed decision carrying the `covered | targeted-check | changed`
choices, its offer and prompt text, and its projection and residual digests. The defect is the delivery handler's
result mapping — the typed base reconcile collapses every non-current effective state into one opaque
`candidate-not-current` refusal, discarding all of it.

**Five delivery read sites, three dispositions.** The typed base reconcile arm takes the port-contract change,
because it is where an operator decision genuinely lives: the same function already handles a changed effective
state further down, reading its current target to compose a projected one, so the guard short-circuits a path the
function otherwise knows how to walk, and reconcile is exactly where a rebuilt chain's subject legitimately moves.

- **The record-effect recovery arm and the boundary-carry arm stay collapsed.** The first reconstructs what a write
  already did and asks a yes-or-no identity question with no operator decision available; it is one of eleven
  identical returns and already carries an operator-facing remedy elsewhere. The second compares the recognized
  subject digest against the digest its boundary was established at, so a decision _means_ the position moved and
  the refusal is accurate — surfacing a seam there would let an operator carry a boundary across the very change
  the boundary exists to bound.
- **The fourth site is `readCandidate`**, which projects the same effective target and collapses every non-current
  arm to `non-current`, whose only extra field is an optional terminal delta. Its consumer already discriminates one
  case and routes everything else to work-unit verification. That remedy is **heavy, not wrong**, and the
  difference decides the fix: a fresh attestation at the current subject establishes the durable baseline the
  projection consults first, so re-rooting resolves every arm and is the universally valid route — removing it
  would leave `classification-failed`, whose own `nextAction` is `stop`, with nowhere to go, the guard-only dead end
  `DEV-RULES.PROJECT` § Recovery-complete refusals forbids. The defect is the word the carried criterion uses:
  _unexplained_. The collapse hides that the cheaper arms exist where they apply. So `non-current` gains a
  `projection` field carrying the arm's own disposition **beside** the verify-work-unit route rather than in place
  of it — explanation added, no decision surface introduced.
- **What the widened arm carries, checked against the schema rather than assumed.** Only `state` and `nextAction`
  are present on all nine variants, so the field holds those two with `reason` and `detail` **optional** beside the
  existing terminal delta. The arm flattens rather than re-exporting the projection union, following the port's
  existing convention.
- **The fifth site is delivery publication**, which this deliverable adds, and it explains its refusal the way
  `readCandidate` does (above): the arm's own disposition beside the re-attest route, pending convergence named.
- **The return shape is a port-contract change, not a richer return statement** — the same distinction D3 draws,
  resolved the same way. A `decision-required` result is not a failure; it is a request for authority, so it
  becomes an outcome beside `refused` rather than a new refusal reason. Mapping it onto the refusal union would
  flatten a decision into a failure a second time, one layer above the defect being corrected.

**What reaches the operator, stated exactly.** Not every non-current target reaches them with choices — only the
one undecided arm has any. `request-authority` becomes an outcome beside `refused` and carries the
`covered | targeted-check | changed` choices with their offer text; `establish-new-root` refuses while naming its
exact continuation; and `rerun-checkpoint`, `stop`, and `upgrade` stay conservative refusals carrying their own
detail instead of one opaque `candidate-not-current`. Every non-current arm reaches the operator with **its own
remedy**; the one undecided arm reaches them with **choices**. This neither turns stop-class arms into
non-refusals nor promises choices for arms that have none.

**A content-preserving rebuild needs none of that path.** The Candidate subject is work-unit-level — one identity,
one digest over the unit's whole reviewable contribution against the protected base — so a rebuild that recuts
member commits without changing that union leaves the subject digest equal and currentness projects as current
through its operational-only advance arm. D4's constructor is what makes the antecedent hold rather than assume
it: under disjoint movement it returns an unchanged chain, and newer base-only bytes the originating top lacks are
never silently imported.

### D8 — The correction continuation reaches its rebuild

**A constructor the correction route cannot reach delivers nothing, and two refusals stand in front of it.** Both sit in
the correction continuation rather than in the constructor, both fire on the route's ordinary path rather than on base
movement, and every stacked delivery so far crossed them by hand — the hand workaround for the second producing exactly
the condition the first refuses. They came here from `delivery-correction-convergence` for that reason (§ Non-Goals,
Adjacent owners). A third change rides with them, because § D4's re-anchor makes it reachable: the fix response across a
change to the selected member's base (below).

**The continuation's landed-prefix read is the one strict read in a tolerant chain.** The continuation learns which
members have landed by calling the public `position` command, at three sites: the routing-required branch, correction
preparation, and the verification-required branch when a selected refresh is pending. Public position refuses
`review-fix-routing-required` whenever the terminal top carries a **pushed** append-only advance — its remote head past
the bound head, with the top request's head equal to it — and the continuation reads that refusal as no position at
all, stopping `review-fix-position-unavailable`. Its own record effects produce that advance: the acknowledgement's
boundary carry is committed and pushed on the top, and so is an applicability selection, and a top that merged the
base is one too. So a correction stops at the first read after its own acknowledgement, and an existing continuation
case asserts exactly that stop. Every step downstream of the read already observes in a tolerant mode — plan, publish,
rematerialization, and refresh — and the facts beneath position keep the state's members under that movement, so the
landed prefix is still derivable exactly. What refuses is one explicit check.

**So the continuation reads the landed prefix through an internal arm of the same observation, which returns the
prefix and skips that check.** It is read-only and grants nothing. Every mutation keeps its expected-state-revision
check; non-append-only or ambiguous movement still yields no facts, so the continuation still refuses; and substantive
movement is still refused where it is today — reconcile without a selection requires a current Candidate, and the
acknowledgement checks its target. Rebinding the terminal ahead of the read was declined: the terminal rebind refuses
`terminal-publication-required` when the checkout is ahead of an unmoved request head, which is the rematerialization
route's legitimate unpushed correction, so it would need gating of its own not to break the route it was meant to
unblock. Restoring the pending-selected-refresh gate `38bd7bc7c` removed was declined too: it would feed an empty
prefix and undo that change's refusal of a stale landed member.

**Public `position` is left as it stands.** What an operator asking where the chain stands should be told after a
record-only advance is a question about the public verb's contract, not about whether a correction can proceed, so the
fix above does not need it. Its pinned probe — "resumes the bound chain at a terminal top that advanced by an
append-only commit" — stays pinned with `delivery-correction-convergence`'s record-only scope, which owns what the
public verb says after a record-only advance (§ Coordination).

**The first acknowledgement's boundary carry accepts the boundary publication leaves.** The acknowledgement carries the
public boundary to the corrected Candidate and accepts only a `delivery-status-required` source, while delivery
publication writes `publication-pending`, because the change requests do not exist yet when publication claims its
boundary. The transition between them is projected at attestation, which refuses while verification is pending, and
at checkpoint composition, which projects it in memory and writes nothing. So the first correction's acknowledgement
refuses `public-boundary-mismatch` before any write, and the driver surfaces it as a stopped effect. The carry now also
accepts a `publication-pending` source under the same reservation, Candidate, and digest checks, emitting the
corrective `delivery-status-required` shape through the projection attestation already uses. Two facts make that
exact rather than permissive: the carry already composes the public-review continuation, which refuses unless every
member holds a change request, so it advances the locus only where publication actually happened; and one function
serves the acknowledgement, the carry port, and crash-recovery reconstruction, whose check requires exactly the locus
the new output is, so recovery stays provable. The advance rides the acknowledgement's existing record commit, adding
no top commit and so no new exposure to the read above. Dispatching attestation first was declined: it must run before
the route's mutation, needs the task list closed, stages a boundary no expectation captures — so reconstruction cannot
prove it — and adds a pushed top commit of its own.

**The fix response follows the selected member's moved base.** § D4's re-anchor on the bound route moves the selected
member's base, and a delivery-member review target pins that base as its diff base. Acknowledgement builds the
response's new target from the **reviewed** target's diff base plus the member's current head and tree, while the replay
after it checks the recorded target's diff base against the member's current recorded base, and `arc review respond`
composes the target from that base. The two agree only while the selected member's base does not move, which holds for
every correction today, so the divergence is latent; once the chain re-anchors, the replay refuses
`review-fix-response-replay-stale` on every re-entry. Consumption would refuse first regardless, since it requires the
old and new targets to share their diff base. So acknowledgement composes the new target the way respond does, from the
Delivery State member's current base and head, and consumption admits a changed diff base for `delivery-member` targets
only when the new one equals the member base the caller supplies from Delivery State. Errand and Candidate targets keep
strict equality, and so does respond's own consumption, which records a response only where acknowledgement has not —
within the drive, acknowledgement records it first and respond replays it. The hosted target names the repository,
request, and head, never a base, so hosted settlement is unchanged, and the request binding and the vehicle still carry
the member's identity. `review-signal-convergence` rewrote the same review-gate files and reconciles them when it
integrates (§ Coordination).

**Verification obligations.** A record-only pushed top advance with an approved lower-member response drives through to
authoring; the continuation still refuses a non-append-only top advance, and a landed selected member under movement
still refuses as a stale landed member; public position still refuses under the same advance. The existing case
asserting `review-fix-position-unavailable` after acknowledgement, carry, commit, and push is rewritten to assert the
continuation proceeding. The carry advances a `publication-pending` source, and refuses one where a member lacks its
change request or the reservation does not match; reconstruction recovers from a `publication-pending` before-boundary;
and the continuation runs once from the boundary publication actually writes, rather than only from fixtures that write
the future locus directly, as every continuation fixture does today. An acknowledgement after the selected member's base
moved records a target on the new base that the replay then accepts, and consumption refuses a changed diff base for an
Errand or Candidate target, and for a delivery-member target whose new base is not the one supplied.

### D9 — A conflicting restack onto a moved base is admitted under consent

**When `main` moves with a change that overlaps an unlanded published member, the stack has no typed way forward.** The
member's request cannot merge until the member is restacked onto the base, and that restack needs a hand resolution.
Both refresh routes stop at it. On a registered stack the whole-stack refresh runs the provider's restack; when the
provider stops on a conflict, the adapter falls back to a two-parent merge, prepares a resolution workspace for the
conflicting member, and on the rerun imports the operator's resolution — and then refuses it
`conflict-resolution-mismatch`, because the admission gate accepts a locally resolved member only in the selected
review-fix scope (`provider-refresh-execution.ts:451`). The import has already moved the operator's local member ref and
removed the workspace, so every retry repeats the same refusal. On either stack shape, adoption of the operator's own
restack proves each moved member a mechanical reapplication and refuses `contribution-conflicted`: its consent arm is
reached only with a selected member (`suffix-reconciliation.ts:765-773`), and a selected member exists only after a
published correction on a registered stack, or while a rematerialization loop stopped partway leaves one.
`evidence-applicability` crossed exactly this by hand — its second member merged with the first member's landing merge,
which carried newer `main` content, and conflicted on three paths (`ed59db877`). Everything else the admission needs
already exists: the conflict collector, the consent input and its exact-match check, and settlement's re-assessment of
the approved set. So D9 opens that protocol to base movement rather than designing a second one.

**The two routes take consent differently, because they differ in who made the move.**

- On a registered stack ARC made the move. The resolution is authored in ARC's workspace on the two parents ARC named —
  the member's recorded head and its refreshed predecessor — and the import checks both (`github-refresh.ts:361-363`).
  The rerun is the continue, as it is in every stacked-change tool's restack, so the whole-stack scope admits a locally
  resolved member on the terms the selected scope already uses: every conflict the arbiter finds must be one the
  operator resolved, and any other still refuses, naming its paths. No digest stop is added, because the parent binding
  is already exact and a second prompt would add nothing.
- On adoption the operator made the move outside ARC, so the adopt call is ARC's first sight of the resolution. The
  existing consent protocol runs there under a new scope arm with no selected member — a third arm on the
  conflict-resolution scope union beside `dependent-suffix` and `native-suffix`, following the post-landing work unit's
  precedent of a distinct arm rather than a relaxed shared one. The first attempt writes nothing and returns
  `conflict-resolution-required` with the conflicts, the external ref restorations, and the exact resubmission input,
  bound to the state revision and to a digest of the observed suffix. Only that input, resubmitted unchanged, admits
  those members; a resubmission a member or resolution has since made stale refuses, and a fresh call stops again on the
  new input. A moved member without a conflict still has to prove a mechanical reapplication. Adopt accepts any restack
  shape the proof accepts — rebase or merge — so the operator restacks with whatever tool they use. After a partial
  landing its subject starts at the first unlanded member, whose request the host has retargeted to the target, and the
  proof takes that member's recorded base — the landed member's head — as the before-predecessor
  (`delivery-execution.ts:4507-4529`), so the case `evidence-applicability` crossed by hand reaches this arm.

**Consent covers everything the resolution changed, and the operator sees it.** The contribution proof reports a
conflicted member from the mechanical composition's conflict paths and discards the composed tree it already holds
(`git-contribution-proof.ts:109-111`), so nothing relates a resolution to the conflicts it resolves: a resolution that
also edits other paths is admitted under a consent naming only the conflicts. D9 keeps it: the proof's conflicted result
carries the composed tree. Each admitted member's disclosure lists its conflict paths and, separately, every other path
where the resolution departs from the mechanical composition, and names the one command that shows exactly the
resolution — the composed tree against the member's tree, the view `git show --remerge-diff` gives a merge. Where
consent is a digest stop, the digest already binds each member's exact head and tree, so what is disclosed is what is
admitted; on the registered route, where the rerun is the consent, the settled result reports it. Every consent arm's
arbiter reaches the same proof, and the native post-landing arm's collector wraps the shared one
(`native-landing.ts:1233-1265`), so the disclosure reaches D9's arms, the selected review-fix scope's, and the native
post-landing one's. Nothing else about the native arm changes: its scope, its digest, and its settlement under the held
reservation stay as shipped.

**The reservation carries the admitted members, and nothing else is owed.** Settlement runs after the members are pushed
and re-derives what was approved from the reservation, never from the consent input, which is what lets a crashed settle
recover. Today only the review-fix pair carries approved members, and a reservation may name them only beside a selected
member (`operation.ts:229-231`). D9 adds one reservation field for members admitted with a conflict when no member is
selected — valid only in the provider-refresh and provider-adoption modes, only over affected members, in state order —
and settlement requires the conflicts it re-finds to equal it exactly, as it already does for the pair. No pending
verification is written. `pendingReviewFixVerification` is the review-fix flow's own state machine, not a slot for what
is owed, and the post-landing work unit settled that a settled member needs none: the next landing cycle refuses any
member that cannot pass review readiness on its exact head. That is where re-review happens. The review gate proves the
member's contribution from its reviewed head, a conflicted proof classifies as an interaction, and the prior approval
does not carry — it reaches the Owner as a decision, which is the host norm of an approval surviving only an unchanged
diff. Neither shipped exclusion is crossed: the field is scoped to one operation and cleared with it, so it is no
generalized approval record, and it is no obligation slot. The terminal keeps its posture — its absorption and push are
what a clean whole-stack refresh already does, with no obligation attached.

**Two latent defects on the registered route are corrected with it.** The admission's refusal is what made the import
loop, so admitting ends the loop; the import stays where it is, and a rerun after any later stop resumes from the
imported resolution — the selected scope's cascading-conflict case already resolves two members across two stops and
admits both, over the same code path. And a conflict above the first member may not resume after the target moved: the
reuse check for the retained refreshed predecessor computes that predecessor's mechanical tree over its own
predecessor's recorded head — the recorded target, for the first member — rather than over what the refresh observed
(`github-refresh.ts:483-499`), so the retained candidate would fail it, the provider would restack the predecessor again
under a new object id, and the operator's resolution would name a predecessor that no longer exists. That is read from
source and untested: reproduce it before fixing it, and fix it by checking against what the refresh observed. The
whole-stack refresh's conflict stop also gains the remedy it lacks — today the only remedy text is the review-fix
driver's, so an operator refreshing after `main` moved is handed a workspace path and nothing else. The stop names the
workspace, the two-parent merge to commit there, and the rerun.

**A top that merged `main` loses every refresh arm without a selection, so those arms read its movement the way
construct reads a delta.** A base merged into the top is append-only movement of the terminal past its bound head, and
only the terminal-remedy and review-fix modes observe through it (`delivery-execution.ts:4433-4441`). The exact and
refresh-adopt modes pass no append-only allowance, so the terminal observes inexact once its remote head moves and
`refresh plan` refuses `position-mismatch` (`delivery-execution.ts:4819-4824`); `refresh adopt` refuses the movement
without a selected member (`suffix-reconciliation.ts:795-797`), and past both, the terminal absorption every restack
leaves owed compares the checked-out top with the recorded terminal and refuses `top-moved`
(`chain-absorption.ts:276-278`); registered complete-remainder execution refuses the movement outside the
dependent-suffix scope (`provider-refresh-execution.ts:326-329`). The exclusion is written rather than accidental:
`delivery-native-stack-composition`'s 2026-08-26 amendment carried the movement through the registered review-fix
refresh alone and stated that ordinary refresh planning and adoption and complete-remainder execution "remain exact",
giving scope as its only reason. Two of the five stacks delivered so far merged `main` into the top, and § D4's
entangled-chain remedy is exactly such a restack. So `refresh plan`, registered complete-remainder `refresh execute`,
and `refresh adopt` without a selected member observe the terminal under the append-only allowance the review-fix modes
use and settle it the same way: the live top is the absorption baseline, and only the final suffix-plus-top write
installs the terminal coordinate. The movement is split as construct splits a delta (§ D4). The top's first-parent
merges whose second parent the protected base contains are base absorption, and their recorded resolution — this
reader's window starts at the recorded terminal — is disclosed. Commits touching only lifecycle paths are records. The
top's content over the split point — the base's absorption into the recorded terminal, read by § D4's attribution —
lifecycle paths excluded, is the authored remainder; a commit and its recorded revert net out, neither records nor
remainder, and an entangled correction counts as remainder, its refusal naming the set-aside. The arms admit when that
remainder is empty or no non-terminal member is outstanding; otherwise they refuse naming the commits, the paths, and
both routes — terminal work through Candidate verification, or the member correction — as `correction-route-ambiguous`
already does. The refusal keeps a refresh from installing an unfolded member correction into the terminal binding, where
construct's delta would then start past it and never place it. A correction set aside by a revert on the top nets to an
empty remainder, which is the shape § D4's entangled-chain remedy takes. The movement is disclosed rather than consented
to, because the top's authoring is the operator's own and `delivery-native-stack-composition` already admits it. This
supersedes that amendment's "remain exact" for these three arms; public position and every unproved movement stay exact.

**Delivery entry reads the top's movement the same way, as a named scope expansion.** Entry inspection reports
`correction-route-ambiguous` when the terminal delta carries non-lifecycle paths while a non-terminal member is
outstanding, and reads that delta as a raw tree diff from the recorded terminal to `HEAD`, so a top that only merged
`main` reads as carrying content and stops ambiguous on an ordinary integration reconcile. It takes the shared
authored-remainder reading instead: base absorption and records carry nothing, and only an authored remainder is
ambiguous. The reading already exists for the refresh arms, and leaving entry on the raw diff would stop the ordinary
base merge before either route runs.

**Required behavior:**

- A whole-stack refresh on a registered stack whose restack conflicts at a non-terminal member stops with the resolution
  workspace and a remedy naming it, the merge to commit there, and the rerun. The rerun admits every locally resolved
  member whose resolution has exactly the named parents, still refuses a conflict the operator did not resolve, and
  settles with the admitted members in the reservation.
- A conflict above the first member after the target moved resumes from the retained refreshed predecessor, checked
  against what the refresh observed rather than the recorded chain.
- Adopting an operator's restack with no selected member — including after a partial landing — where a moved member
  conflicts, returns `conflict-resolution-required` under the new scope arm with nothing written; the unchanged
  resubmission admits exactly those members; a changed or stale input refuses, and a fresh call after a member or
  resolution changed stops again on the new input.
- Every admitted member's disclosure lists its conflict paths, every other path its resolution changed relative to the
  mechanical composition, and the command that shows the resolution — on both routes, on the selected scope's consent,
  and on the native post-landing arm's.
- The reservation carries members admitted without a selection in its own field; settlement requires the conflicts it
  re-finds to equal that set, recovers from the reservation after a crash, and writes no pending verification.
- At landing, review readiness classifies an admitted member's resolved contribution as an interaction, and its prior
  approval does not carry.
- `refresh plan`, registered complete-remainder `refresh execute`, and `refresh adopt` without a selected member observe
  the terminal under the append-only allowance and settle it with the live top as the absorption baseline, splitting its
  movement as construct splits a delta — base absorption with its recorded resolution disclosed, lifecycle-only records,
  and the authored remainder, a commit and its recorded revert netting out and an entangled correction counting as
  remainder. They admit when the remainder is empty or no non-terminal member is outstanding, and otherwise refuse
  naming the commits, the paths, and both routes.
- Delivery entry inspection reads the terminal delta the same way, reporting `correction-route-ambiguous` only for an
  authored remainder while a non-terminal member is outstanding.

**Verification obligations.** On a registered stack, over real Git with the provider stubbed at its process boundary: a
conflict at the first member against a moved target, and one at a later member against its refreshed predecessor, each
resolved in the workspace and rerun to settlement; two conflicting members in one refresh, resolved across two stops and
both admitted; a second, unresolved conflict still refusing; a resolution on other parents refusing; and the retry loop
gone. The later-member reuse defect is reproduced before it is fixed. On adoption: the stop writes nothing; the exact
resubmission adopts, including on an unregistered stack whose first member has landed and whose second conflicts with
the moved base; a resubmission made stale by the state revision, a moved member, or an altered resolution refuses, and a
fresh call stops again; an unconflicted moved member is still proved. A resolution that edits a path beyond its
conflicts is disclosed as such, and changing it changes the digest. A settle interrupted after the pushes recovers from
the reservation. After adoption, landing readiness reports the resolved member as needing the Owner's decision. The
selected scope's and the native post-landing arm's existing consent cases pass with the added disclosure, and the native
arm discloses a path beyond its conflicts. Over a top that merged `main` after the recorded terminal, `refresh plan`,
complete-remainder execution, and adoption without a selection admit the movement with its resolution disclosed, and
admit a record commit on the top too; an authored commit while a non-terminal member is outstanding refuses naming both
routes, and the same commit set aside by a revert admits. Entry inspection over a top that only merged `main` reports
Candidate verification rather than ambiguity. The bound route's end-to-end case gains an entangled chain cleared by
setting the correction aside, restacking under consent through `refresh adopt`, restoring the correction, and
continuing.

### Workflow surface

The deliverables above change what the operator does, so `deliver-stack.md` is in this work unit's owned surface:
shipping the verbs without it leaves prose instructing the operator to perform what the verbs now perform — the
redundant-ceremony class this work unit exists to remove. Each deliverable that changes the operator's steps
carries its own prose edit, so verb and prose land in the same member and the same review.

- **D2's member** carries the removal of the per-member gate operand, which is a **section rewrite rather than a
  few stale sentences**: roughly ten instructions across authoring, gate execution, and the mutation verb, the
  hand-composed `gateResults` payload block, and the operand on two CLI request shapes. It includes the
  instruction binding per-member review and disposition to that run, and the post-interruption instruction to
  rerun the candidate gates before re-invoking the mutation verb. § Validate and publish's statement that the
  mutation verb reruns exact Tier 2 result admission goes with it, because the operand it admits leaves on this
  member. Where per-member checks run instead is stated in `strategy-integration.md` § Delivery Shape and Landing
  Window, not restated here.
- **D4** replaces § Prepare private delivery candidates' per-member cut narration — recording each authored cut at its
  returned private candidate ref and matching detached gate path — with the constructor invocation, adds the construct
  step ahead of private review in the sequence the section already describes, and states that candidates are derived
  from the top and authored there, so content committed only in a candidate checkout does not carry into a rebuild
  (§ D3). The candidate-checkout rename reaches the same prose, and "candidate checkout" becomes a load-bearing term
  there: the section defines it once where it first uses it, and the workflow uses it exactly thereafter. On the bound
  route, § Review and land the current member enumerates what the correction continuation's typed action may do and
  which service contracts the controller derives inputs for; construct joins both lists, ahead of rematerializing the
  exact suffix, so the prose names the dispatched step the controller now takes. The same section renders a construct
  proposal on that route, whose acceptance — resubmitting unchanged the stop's resume action, which carries the
  proposal's digest — is the consent for the published members it changes; a conflict stop, whose workspace is resolved
  before `review-fix continue` is re-entered; and the later-member stop, which names the split on the top where the
  selected member changed and otherwise the pending review-fix authority, waiting on the Owner's direction. The
  operator-initiated refresh's text, which says the operator refreshes "the disclosed registered set", widens to an
  unregistered stack's suffix, since the entangled-chain stop on the bound route names that route for either shape.
  After an approved pre-publication fix, § Prepare private delivery candidates has the operator run construct again,
  placed on the member the finding was raised on, before the next composing review pass. The same section states when
  the cut list is supplied — at the first cut, and for the recut an anchor refusal names — and the overlap route: a
  guard refusal is cleared by merging the base into the top, resolving it, and running construct; a proposal stop by
  rendering its proposal and, on its resolver's acceptance, running the continuation it names; an entangled chain, or a
  declined proposal, by its route's structural remedy — a plan revision combining the members before publication, and on
  the bound route the operator refresh around the set-aside correction: revert the correction on the top, refresh and
  adopt the suffix, restore the correction, and continue; an entangled correction, on either route, by reverting the
  correction on the top, re-applying it after the merge, and continuing; a conflict stop by resolving in the workspace
  it names and running the continue; a stopped binding by `construct --continue`, or under a revised plan by the recut
  from its cut list; and the bound later-member stop by the split it names — revert the correction on the top, re-apply
  the selected member's part and continue, then deliver the rest as terminal work — or by the Owner's direction on the
  pending authority. Each stop is rendered to its resolver (§ Cross-cutting Considerations, Stop routing).
- **D6** states at § Validate and publish that the mutation verb reads the attestation and refuses a non-current
  Candidate, and that the operator renders the refusal's own remedy — the verb performs the read, the prose never
  narrates it as an operator step — and drops the mutation verb's checkout locators and the post-gate checkout
  verification wording with the loop that consumed them.
- **D9** adds to § Review and land the current member the whole-stack refresh's conflict stop — render the returned
  workspace, paths, and remedy, stop for the attended resolution, then rerun the same `arc delivery refresh execute` —
  beside the adoption consent stop the section already carries, which now renders each member's disclosure of the paths
  its resolution changed beyond the conflicts; § Settle a disclosed suffix collision renders the same disclosure on the
  native post-landing stop. Over a top that merged `main`, the refresh steps render the disclosed resolution with the
  rest of the result, and an authored-remainder refusal renders its own remedy, so neither adds a step.

This is the procedure substrate's own case rather than an exception to it: a mechanics-narrating line no verb
covers is a verb-gap signal, and these deliverables supply the missing verbs (verbs-over-mechanics); the
hand-composed result block is prose moving data the CLI already holds (if the CLI can compute it, the CLI computes
it); and the replacement steps render precomposed result text rather than new prose templates.

## Alternatives & Rationale

**Two direction-specific builders, rejected.** Initial authoring and bound correction are opposite directions, but
they already share pair creation and the direction is decided by the predecessor relation the preflight must read
anyway. Two builders would duplicate the preflight and re-create the same collapse from the other side.

**Stopping at the lowest conflicting member and handing back a conflict the top already resolved, rejected — and so is
adopting the attributed resolution unseen.** Handing back is what rebase-based stacking tools do. Here the conflict is
one the work unit has already resolved — the top holds the resolution — so handing it back asks the operator to resolve
it again, per member, on every rebuild that crosses it. Reuse has precedent, and the precedent leaves the result for
review: `git rerere` replays a recorded resolution only when the same conflict recurs, is seedable from existing merges
through `contrib/rerere-train.sh`, and by default leaves what it replayed in the working tree for the operator to stage;
the absorb tools (`git absorb`, `hg absorb`, `jj absorb`) infer which earlier commit a change belongs to from which
commits own its lines; git-spice has an unreleased merge-based restack; and Jujutsu propagates a conflict into
descendants rather than resolving it. None takes a resolution recorded in a **later** merge as the source for an
**earlier** member, which is what attribution does, and `rerere` replays conflicts only, where attribution also carries
a merge's departures from the mechanical merge — so construct proposes it rather than adopting it: an attributed version
a member does not already carry stops the run once, and one continuation carrying the proposal's digest accepts it
(§ D4). The attributed version is composed from three-way merge and per-commit reverts, and its boundary is explicit: a
revert that conflicts is an entangled chain, cleared by its route's structural remedy — a plan revision before
publication, the operator refresh around the set-aside correction on the bound route — never by a guess (§ D4).

**On the bound route, refusing any corrected top that absorbed a base, rejected — and so is refusing only an overlapping
one.** Refusing outright was this design's first rule, and it kept every published member unchanged. Measured against
delivered stacks it refuses an ordinary correction: two of five merged the base into the top while members were bound
and unlanded, and one took a member correction right after. Carrying the base in the terminal alone keeps that property
under disjoint movement without the refusal. The second rule refused when the base overlapped an unlanded published
member below the terminal, naming the operator refresh, and the field reversed it too: `4ae7872f35` resolved paths its
bound middle member authored, so the refusal fires on the field case, and the refresh it names restacks by hand what
construct reads from the top. So overlap re-anchors the unlanded chain on the bound route as it does before publication,
and the property the rule was for becomes consent: a published member changes beyond its fix only where construct
proposed the change and the operator accepted it, and the contribution proof admits exactly that change, recomputing it
rather than receiving it (§ D4).

**Absorbing the newest base at the lowest overlapped member, reversed.** The second build gave the newest base the top
absorbed to the lowest member the guard would refuse and every member above it, keeping the members below by object id.
It rejected anchoring the whole chain because that recuts members the base never touched, each force-updated with its
review anchors discarded, and cited git-spice restacking only what moved to avoid quadratic force-pushes and check runs.
The trigger for reversing it was a field case: `evidence-applicability`'s integration merge `4ae7872f35` conflicted on
four paths and departed from the mechanical merge on two more, five of the six authored by its bound middle member.
Lowest-member absorption would have left `main`'s movement showing in that middle request, left the first member on an
older base than the one it would land on, and on the bound route changed a published member beyond its fix. The
git-spice rule answers which branches a restack must touch when one branch moved; a moved trunk under a stack is
restacked onto whole by every stacked-change tool. The cost of the reversal is stated with the rule (§ D4): on overlap
every unlanded request is force-updated and loses its commit-anchored review comments, and on the bound route every
unlanded published member is republished. Disjoint movement keeps the narrower rule, since there it changes nothing a
lower member contains.

**On the bound route, placing a correction on the later member it reached, recomputing the fold at each later member,
and forward-slicing disposition supersession, declined.** Before publication a resolution at the placed member places a
correction, whole or in part, and the fold carries the rest (§ D4). On the bound route placement across members would
split the reviewed member from the later one, and needs a Delivery State carrier for the placement, a fix response
answering one request with another's head, and a hosted reply across requests — about a dozen sites through the
correction controller and the review gate — for a case found by building rather than in the field. Letting the bound
route fold as the unbound one does means recomputing the fold at every later member inside the contribution proof — a
third kind of admission beside the recorded resolution and the resolved reapplication, over content nobody resolved or
reviewed. The resolved reapplication the route does admit is the registered route's dependent-suffix rule applied at a
second site, over a resolution recorded for the exact composition. For a correction wholly the later member's, the
remedy that fits is superseding the selected member's fix disposition and delivering the change as terminal work, and
disposition supersession is `review-signal-convergence`'s, implemented and integrating after this work unit. Slicing it
forward into this one would carry another work unit's implemented change, and the disposition lineage it rests on, into
a second branch that both then reconcile. So the later-member stop stays a typed stop naming the pending authority where
the selected member did not change, and its remedy completes when that work unit integrates (§ D4, § Non-Goals).

**Reading a mixed chain from a stopped loop's candidates, or completing the loop before any rebuild, rejected — and so
is setting a second correction aside.** A stopped rewrite loop leaves the private candidates it was rewriting to, and
reading the unlanded members from them while the chain is mixed was the first rule. It fails twice: candidates are
reaped only at closeout (`closeout.ts:166`), so once a provider refresh advances the records a candidate an earlier
correction left behind regresses content; and any requirement that the records equal the candidates is broken by
construct itself, whose rebuild moves the candidates past the records with nothing moved by hand. For the first of those
reasons an accepted candidate is not the consent witness for an interrupted drive either, so a re-entry that rebuilds
asks once more. Completing the loop before any rebuild needs a snapshot the loop cannot get: its prepare needs
eligibility to close eligible, and the overlap guard runs inside prepare on the first candidate against the protected
base (`eligibility.ts:421-431`), so completing past movement means splitting eligibility — new mechanism for a state the
carry already reads. A second correction for the member a stopped loop rewrote could have stopped with a remedy — set it
aside on the top, let the first correction finish, re-apply it — but that hands the operator a remedy for a state ARC
left, where advancing the source top past what that member already carries completes it (§ D4).

**Testing each passed commit whole or path by path, folding every uncarried part at the break, splitting it by whether
the member below carries the rest of its commit, applying what the advance passes to the ranges above the break, and
rebuilding the chain from before the stopped run, rejected — and so is carrying the continuation in the typed result
alone.** Each would repair the advance reading a removal above the break as carried (§ D4). Counting a passed commit as
carried only when its cherry-pick is empty onto the rewritten member and not onto that member's record from before the
rewrite repairs a removal a commit makes alone, and fails one commit that fixes the member below the break while
removing content the terminal authored: that commit is carried in one place and not in another, so a test on the whole
commit has no right answer. Reading the record path by path fails the same commit when both changes share a file:
modelled, a fix to the member's line and a removal of the terminal's line ten lines down counted the whole file as
carried, and the terminal kept the line; the adopted test reads it hunk by hunk. Folding every uncarried part at
whatever placement a re-run was given moved one the stopped run had placed on the first member into the terminal when
the re-run was placed there or on no member — after only a disjoint base moved, too — leaving the middle member with a
line the approved fix removed and the terminal complete, so nothing refused it; folding every uncarried part at the
break instead moved a later correction's removal of the middle member's line, placed on the terminal, into the middle
member. Splitting them by whether the member below the break carries part of the commit — owing a commit carried in part
from the break, and folding one carried not at all at the placement — repaired both for a correction in one commit and
failed the same correction in two: modelled, the fix to the first member in one commit and the removal of the middle
member's line in the next, re-run with the placement on the terminal, left the middle member with the line. What decides
where an uncarried part goes is where the stopped run placed its correction, which only that run knows — so before
publication a stopped binding is not constructed again at all: the record keeps the chain that run built and the
continue binds it (§ D4), and an uncarried part is read only on the chain the bound route's rewrite loop leaves, whose
placement is the selected member and where its one outcome is the later-member stop. There the test on the whole commit
would also stop a second correction making such a removal alone; the hunk read is kept whole rather than a narrower test
fitted to the shapes that route reaches today, since it also answers a commit carried in part, which the whole-commit
test fails. Carrying the continuation in the typed result alone, recording nothing, leaves a construct run any other way
to place an uncarried part at its own placement, silently. Applying each passed change by three-way merge to both ends
of every range above the break whose own changes touch the path ignores the placement: modelled, a removal of a line the
middle member added, placed on no member or on the terminal, moved into the middle member, where construct over the
loop's candidates removes it at the terminal, and a removal of that line after the terminal rewrote it stopped on a
conflict the candidates never met. Reading a mixed chain as the chain before the stopped run — the members below the
break recovered from the commit graph, starting at the break's recorded predecessor — and constructing it whole would
retire the carry and the advance together, but it discards what the members below the break record of where the stopped
correction went. Modelled, a rebuild placing its delta elsewhere republished the member below the break without the
correction that member had already published, and one placing it there re-anchored the members below the break onto
disjoint movement § D4 sends to the terminal alone. Reading what the member below never held costs two merges per path a
passed commit changes, and each uncarried part goes with the delta to the placement.

**Constructing a stopped binding again over the mixed chain it left, before publication, rejected.** The thirteenth
pass's continuation constructed the chain again over what the binding left, with the operands it recorded, the advance
first passing every commit up to the top the stopped run was built from. Modelled, that dropped a correction the stopped
run had placed above the member below the break, or on no member — none of it was bound below the break, so the part
that applies to that member's old record was not carried — and carried one on a path a later member shares into the
middle member. Passing the recorded top only where the placement is at or below the member below the break repaired
those, and still left a correction fixing the placed member while removing the next member's adjacent line incomplete:
the next member's recorded resolution had carried the removal, and no reading of the passed commits sees a resolution;
reading that conflict as not carried folded the correction into the placed member again and stopped for a resolution
already given. The stopped run built the whole chain before binding any of it, so constructing it again re-derives what
the run already holds (§ D4). On the bound route construct reads the member records, which a stopped binding leaves
whole, so constructing again there rebuilds from an unmixed source and is not this reading.

**Recording the binding on the bound route too, rejected.** Its refusal of another placement left a supersession
selecting another member with no route: the controller dispatches construct with the selected member, and no operator
may run a lower verb by hand. A dispatched continue would not keep the superseded placement either, since the moved top
makes construct owed before rematerialization, and construct there reads the member records. Constructing again from
them needs no record (§ D4).

**Continuing a stopped binding on any construct run, rejected.** It is correct before publication, where construct would
then build over the completed chain, but it departs from git's refuse-and-name idiom, and the agent must clear what
stopped the binding before any continue, so the explicit `construct --continue` costs a flag rather than a stop (§ D4).

**Starting over under a revised plan from the chain as it stands, rejected.** A revision keeps the plan id
(`handlers/delivery.ts:727-755`), so the stopped binding's candidates stand under the same refs, and reading them as the
chain as it stands recomposes the mixed chain this design retired. The recut from the revised plan's cut list reads none
of them (§ D4).

**Reading a correction's conflict regions to choose its remedy, re-placing it, splitting it before publication, and
taking the member's version at a conflict, superseded.** That rule stops a correction that conflicts with a later
member's version at the placed member and reads whether it is mixed — whether, folded there with each conflicting region
and each path conflicting whole taken at the member's version, it still changes the member — to choose a remedy: a
correction wholly the later member's is re-placed there before publication, and a mixed one names a split on the top.
Git's conflict regions cannot carry that reading. A change beside another conflicts as one region with it, so a fix
beside a line the terminal rewrote, a fix with a removal of part of the terminal's hunk, and a fix with a removal of a
line the terminal inserted each read "not mixed", and re-placing moved the placed member's fix into the terminal; the
split, performed by hand, stopped again on its first part. Taking the member's version at every such conflict drops the
placed member's own part in the same shapes. The rule stood in for a judgement only the finding settles, and the
resolution is that judgement made where it can be checked: the member's own version is the re-placement, its own version
plus its part the split, and both sides the answer for a correction that only touches the later member's line (§ D4).

**Folding the whole delta at every member above the placement, superseded.** Each later member folded the delta on every
path, including paths its own range never changes, where its reapplication had already carried the correction from the
member below. Once the placed member held a resolution the delta no longer applied cleanly there: modelled over five
shapes, the member above the placed one stopped again in four, and so would every member up to the one holding the
adjacent content. Confined to the member's own paths, the fold reaches the content only that member holds, and nothing
else.

**Reading a correction into attribution above its placement, counting it as the placed member's authorship, and reading
the hunk read's record on its older base, superseded.** Attribution reverted a delta's commits only at members below its
placement, and a delta placed on a member made that member the author of every path it touched. Above the placement the
attributed version then already held the correction, and the fold at a later member found nothing to change: modelled, a
correction on the first member removing the terminal's line from a path whose base merge departed, a path the terminal
authored, completed on the bound route with the line gone from the published terminal, past the later-member stop.
Counting the delta as the placed member's authorship moved that path's resolution into the placed member: before
publication it proposed there a departure the correction never changed, and on a chain a stopped rewrite loop left mixed
it stopped construct as an entangled chain at the middle member, which authored nothing there, with a structural remedy
where the later-member stop names a split. On that chain the hunk read met the break's recorded predecessor on its older
base, where a change beside the base's movement conflicts for that movement alone and counted as carried whole: a second
correction removing the terminal's line from a path the base merge resolved passed as carried, in neither the delta nor
any member's range, and reached the published terminal through attribution. Construct now reverts the correction at
every member and lets the fold carry it, the fold following the chain's composition; the contribution proof keeps the
earlier reading, which is the chain as that fold leaves it (§ D4).

**Taking the top's version at a conflicted terminal on the bound route, rejected.** Before publication the terminal's
content is the corrected top's by definition, so construct takes it at a conflict. On the bound route the terminal is a
published member proved a reapplication of what it published, and a fix beside the terminal's rewritten line and the
same fix with a removal of part of the terminal's hunk present the identical conflict there; taking the top admits the
removal into the published terminal past the later-member stop. Only the finding the correction answers tells the two
apart, and the agent resolving the conflict holds it where the CLI does not: taking the top would be the CLI deciding
what belongs to the agent, and a resolution kept to the reapplication, with each fold confined to its member's own
paths, lets the fold show the removal as the later-member stop (§ D4). Keeping to the reapplication is an obligation no
check confirms, since Git offers no clean reapplication to compare a conflicted resolution against; the backstop is
landing, where the member's approval does not carry (§ D9).

**Keying a recorded resolution by its two parents, or by its conflict text, rejected.** The registered route's import
checks a resolution's two parents, which fits one workspace and one rerun. Construct takes a resolution across runs,
where the same two sides can recur over another base, and that is another composition with its own answer, so the key is
all three input trees. `git rerere` keys a resolution by the conflict's text and replays it wherever that hunk conflicts
again, whatever else differs; construct replays only a resolution given for the identical composition and stops afresh
otherwise, the stricter reading for content a published member carries.

**Keeping the refresh arms exact over a moved top, superseded.** `delivery-native-stack-composition`'s 2026-08-26
amendment kept ordinary refresh planning and adoption and complete-remainder execution exact, giving scope as its only
reason. Two of the five stacks so far merged `main` into the top, and over such a top every published-side refresh
without a selection is unreachable, § D4's entangled-chain remedy included. The arms now admit the top's append-only
movement, split as construct splits a delta; an authored remainder with a non-terminal member outstanding still refuses,
which is the case exactness guarded — an unfolded member correction installed into the terminal binding (§ D9). Taking
consent for the movement rather than disclosing it was declined: the top's authoring is the operator's own, and that
work unit already admits it on the review-fix refresh.

**Splitting a delta only where its base merge sits on the source top, superseded — and reading resolved paths as
disclosed on the refresh arms, rejected.** The earlier split took the clean absorption of the base into the source top
and, where that conflicted, the range's own merge only when it sat directly on the source top, so a fix committed before
a conflicting merge stopped even when it touched nothing the merge resolved, and the refresh arms, split the same way,
had no reading for a conflicting absorption at all. Attribution reads the split point without asking where the merge
sits (§ D4). For the arms, treating every resolved path as disclosed resolution would be simpler and never stop, but a
correction confined to those paths — a fix to another hunk of a resolved path, committed before the merge — would then
reach the terminal binding unplaced, which is the case the arms' refusal exists for; built, the split refuses it.

**After a partial landing, re-anchoring the suffix onto the landing merge, rejected.** It would make the readers'
assumption true rather than relaxing them, but it changes every unlanded published member's recorded base on every
correction after a landing, whether or not anything overlaps — a republication the native route performs through a
provider restack, and one the overlap clearing performs only when a member overlaps the base the top absorbed (§ D4).
Reading the first unlanded member's recorded base as the chain base needs no write: that base is already what the member
was built on, what the landing merge contains, and what the landing proof should take as its predecessor too.

**Leaving a conflicting restack of a published member to a work unit of its own, rejected.** It was this design's lean
while the case looked rare. It is not: a third of the delivery refresh and absorption merges recorded here since
2026-08-28 carried a conflict resolution, and one stack crossed this exact case by hand. Without it, a published stack
whose base moves with an overlapping change is wedged in either shape, and two stops — D4's entangled-chain stop on the
bound route and the routed Errand's refusal at landing — name a remedy that clears only a clean restack, over a top that
has not merged `main`. The admission reuses a consent protocol that already exists, so it is a new arm, not a new
design.

**Refusing a resolution that edits beyond its conflicts, rejected.** It is the tighter boundary, and it would keep a
second path list out of the consent. But a semantic conflict routinely needs an edit outside the conflicted paths — an
interface the base renamed, used elsewhere in the member — and refusing would send each such case through a separate
member correction. The host norms and `--remerge-diff` treat the whole departure from the mechanical merge as the
resolution to review, so D9 discloses it: the digest binds what is admitted, and review readiness at landing re-admits
the member either way.

**A digest stop on the registered route as well, rejected.** Symmetry with adoption is the only argument for it. On the
registered route the resolution is authored in ARC's workspace on the exact parents ARC named, so the rerun already
carries the operator's act, and a second prompt would add friction to the step every stacked-change tool makes a single
continue.

**Recording a verification obligation for an admitted member, rejected.** `pendingReviewFixVerification` is keyed on a
selected correction and is not a generic slot for what is owed, and the post-landing work unit declined the same field
for the same reason. Review readiness on the member's exact head already refuses it at the next landing cycle, which is
where a resolved member's re-review belongs.

**Extracting the reconstruction duplication here (the former D7), routed out.** Its stated justification was that
the construct/publish split is what D4 needs regardless, with D4 consuming the construct half alone. **D4 consumes
nothing of it.** The bound route reaches top adoption, while the duplication is on the absorption side — and D4's
member construction reaches neither, because every existing absorption primitive builds **tops** under a fixed
two-parent shape while D4 builds members with their own parent, message, and byte-exact authorship.

What survives is a real pre-existing defect: the absorption is written twice, in the library and inline in the provider
refresh adapter, with byte-identical commit and reflog messages, and only the library copy carries the guard refusing
delivery-namespace tops. Both call sites are on the provider-refresh path, which § Non-Goals disclaims apart from D9's
admissions, and reworking that machinery for a refactor would put this work unit's own stacked landing in the blast
radius for a benefit landing elsewhere. It routes out as its own work unit, carrying the finding that the top is
constructed at **three** sites across two modules — not the pair the deliverable named — so a future extraction
considers all three.

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

**Trust boundaries.** Publication reads the work-unit attestation; it does not produce one, and reading it grants no
review clearance, no check success, and no merge authority. The eligibility close re-prepares fresh and compares
coordinates itself rather than trusting a supplied result — which is what it already did, minus two operands that were
never independent witnesses: a gate-result list and the mutation path's checkout path, each supplied by the same caller
as the snapshot it was checked against. What the close trusts about the protected base afterwards is a **pinned
observation** of the recorded head rather than the current base: the narrowed loop no longer watches the base ref, and
the pinned check above proves the recorded commit still resolves to the recorded tree. The reconcile seam's correction
widens what an operator is _shown_, never what they may authorize: the choices, texts, and digests it surfaces are the
same ones the review gate's doors already compose, and the authority to select among them stays exactly where it is.
Terminal integration retains its own current checkpoint evidence and exact-head approval. An attribution proposal is
accepted only by the operator's continuation carrying its digest — on the bound route the proposal stop's `review-fix
continue` resume action resubmitted unchanged, transient input the controller forwards and nothing records — and the
digest binds exact content, so no rebuild adopts content a member's source did not carry without that act, and a changed
proposal cannot ride an old acceptance. On the bound route that acceptance is also the consent for each published member
it changes, and the contribution proof admits a changed member only where its divergence is confined to the base's
recorded resolution and equals the attribution the proof recomputes from the top, the proved member's recorded
predecessor, the protected base, and the published members — never from what construct supplies. A later member's
resolved reapplication is a second way a published member changes on that route: it is admitted only against a
resolution recorded for that exact composition, which the agent keeps to the member's published change and no check
confines, disclosed as § D9's resolutions are, and entered in the verification set, its prior approval not carrying at
landing, where it reaches the Owner; a resolution is an input to the stop it answers and construct writes every commit,
so a resolution workspace is no carrier (§ D3). The first unlanded member's rewrite may move the Delivery State target
only forward, to a base that descends from it, checked as refresh adoption checks its target. D8 widens what one
boundary carry accepts and nothing it authorizes: the `publication-pending` source advances only under the reservation,
Candidate, and digest checks the carry already makes, and only where every member holds a change request; and its
landed-prefix read is read-only, leaving every mutation behind it to its own revision check. Its fix-response change
admits a changed diff base only for a delivery-member target whose new base equals the member base the caller supplies
from Delivery State, and leaves Errand and Candidate targets strict. D9 admits content no reviewer has seen, so it
admits only what the operator made or saw and approved: on the registered route a resolution authored in ARC's workspace
on the exact parents ARC named, on adoption an unchanged resubmission of a consent input whose digest binds each
member's exact head and tree. Each admission discloses every path where the resolution departs from the mechanical
composition, and admission grants no review clearance: the member's prior approval does not carry, and review readiness
at landing puts it before the Owner. The refresh arms' admission of a moved top discloses rather than consents, because
the top's authoring is the operator's own, and refuses an authored remainder while a non-terminal member is outstanding,
so no member correction reaches the terminal binding unplaced. The split it reads pairs a commit with its revert by the
top's own revert record, which is the operator's authoring like the rest of the top; a revert that leaves part of a
correction behind is read, and disclosed, as resolution.

**Stop routing.** ARC sits between an agent, its Owner, and the repository, and the tools this design takes its idiom
from — git and the stacked-change tools — send every stop to a person. The design follows their mechanics: when an
operation stops, what it records, and how a continue resumes it. It diverges only in who takes each stop, sending it to
the lowest layer that can resolve it safely. The **CLI** takes what recorded state determines, and there is no stop. The
**agent** takes what the CLI cannot decide but one reasonable answer settles and the agent can check against the
repository; a typed stop that hands it the facts and the continuation is then the intended result rather than friction,
since construct cannot make every outcome determinate. The **Owner** takes only what changes something a person approved
or owns, or what has more than one defensible outcome with product consequences — accepting, on the bound route,
attributed content a published member's source never carried, and a published member whose approval does not carry,
which reaches the Owner at landing. This extends ADR-016's graduated autonomy with fixed human endpoints from session
operations to delivery's stops: the human floor stays where that ADR puts it, and nothing here takes control from an
Owner who wants more of it. A stop's remedy is judged by this routing as well as by idiom: the CLI inferring what it
should have carried, or deciding what belongs to the agent, is a defect, and so is a stop that hands the Owner a
judgement that only goes one way. Where this design says **operator**, it means whoever runs ARC, the agent or its
Owner; this routing names which of them takes each stop, and § D9's consents — the rerun on a registered stack, the
exact resubmission on adoption — are the continuation of whoever resolved, the Owner's floor there being landing, where
an admitted member's approval does not carry.

The stops construct makes, and who takes each:

| Stop                                                        | Who takes it                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A conflict composing a member                               | Agent: resolves in the member's resolution workspace, then continues                                     |
| A conflict at the terminal, before publication              | CLI: takes the corrected top's version; no stop                                                          |
| A later member's conflicting reapplication, bound route     | Agent resolves the reapplication alone; the proof admits it, and at landing the Owner takes its approval |
| The later-member stop, selected member changed              | Agent: the split on the top                                                                              |
| The later-member stop, selected member unchanged            | Owner: the pending review-fix authority                                                                  |
| An attribution proposal                                     | Agent before publication; Owner on the bound route                                                       |
| An entangled correction                                     | Agent: revert it on the top, re-apply it after the merge, continue                                       |
| An entangled chain                                          | Owner before publication (a plan revision); agent on the bound route (the refresh), Owner at landing     |
| A stopped binding before publication, `wrong-predecessor`   | Agent: runs `construct --continue`, which binds the chain construct recorded                             |
| A stopped binding under a revised plan                      | Agent: the recut from the revised plan's cut list                                                        |
| A stopped binding, bound route                              | CLI: the controller dispatches construct again; no stop                                                  |
| The guard: movement beyond the newest base the top absorbed | Agent: merge the base into the top, then construct                                                       |

**Performance and cost.** The constructor's object work is sub-second per member. It does place a detached worktree per
member, whose cost § Disk lifecycle accounts for rather than waiving; nothing else it does carries a material cost. The
rebuild baseline to beat is the measured ~38-minute three-member rebuild, almost none of which was the rebase itself, so
the constructor's value is in the preflight and the evidence carry rather than raw Git speed, and it is not claimed to
collapse that figure. Removing the per-member Tier 2 pass removes the dominant term in the prepublication window
outright.

**Disk lifecycle.** The prepublication window **does** hold a checkout per member, because the pair primitive is atomic
and the review gate reads the checkout half (§ D4). The accounting is therefore owed and is stated rather than waived:
measured on one live three-member plan, the checkouts total 671M, of which 148M in the largest is a dependency tree a
Tier 2 run deposited. Removing the per-member run removes that deposit, leaving roughly **83M of checked-out working
tree per member** held from construct until reap — so this work unit reduces the window's disk footprint substantially
while not reducing it to zero. The residue reaper already owns the bound-correction pairs and is sized for them; what
changes is that the unbound route now creates pairs too, which is why the pair contract and the reaper's
`candidate-checkout-mismatch` refusal are load-bearing. The plan's resolution path family is bounded the same way: a
conflict's workspace goes when the continue imports it, and every workspace construct left goes at its last bind, with
the recorded resolutions — those on the bound route when the rematerialization tail completes; a stopped binding's
record, with the chain it keeps reachable, goes at the last bind; and the reaper removes whatever an abandoned run left,
which § D4 adds, since it derives the resolution path today and never reaps it, and no locator it derives names the
record's leaf — construct's workspaces by construct's own forced rule, since each is dirty from the start and the gate
checkout's removal never forces one, and the record through its own delete. Reaping the malformed `delivery-gates/`
directories already on disk is an Errand's, not this work unit's.

**Testing.** Three pinned probes hold this boundary's behavior. They pass today; each fails the moment the behavior
changes, printing the sentence naming what it was waiting for and its exact replacement. Retiring them is in scope
rather than a regression — a fix here cannot merge while one is red, and each is a single pinned-observation call to
replace, though ordinary assertions in the same files change alongside them. **They retire independently, one per
boundary, which constrains the cut: a deliverable that changes one boundary retires that boundary's probe in the same
landing**. A probe that instead reports that the held result no longer describes what happens and the awaited one has
not arrived either has found behavior neither shape names — that is a finding, not a retirement.

1. `delivery-window-base-movement.test.ts` — "discards them when the base advances on a path no member touches"
   (D2).
2. `delivery-rebuild-base-movement.test.ts` — "admits a chain recut on the moved base, then refuses it after the gates
   would have run" (D3 — the prepare-side anchor refusal). The gate cycle its text cites leaves with the D1+D2 member,
   and its awaited shape — preparation refused, the close not reached — holds without it, since whether the chain is on
   a base the top contains is decided from two heads prepare already has. An ordinary assertion beside it — the same
   recut with the base adding a path rather than changing one — flips with it to preparation refused, since the anchor
   read does not depend on what kind of change the base made.
3. `delivery-rebuild-base-movement.test.ts` — "refuses the unchanged private candidates once the correction lands
   on the top" (D4 — the close-side `rebuild-required` reason, which is why a D3 that only enriches the
   `completeness-*` payload leaves this probe green and unretired).

Further test obligations. D2's fixture must stop stubbing lifecycle-path resolution to a single constant **and**
carry a non-regenerable lifecycle path, since regenerable paths compare against the chain base and leave both live
protected-base reads unobservable either way; D2 must also cover a pre-existing later-member overlap refusing at
prepare rather than at the close, and the guard's refusal carrying the restated remedy rather than "against the
observed tip". **D3 breaks the only executable record of the byte-identity it exists
to destroy** — an ordinary equality assertion, not a pinned observation, holding the authoring and rematerialization
results equal — which becomes assertions on the now-distinct payloads. D3 and D4 therefore touch one test file from
different delivery members, and each landing rewrites only its own cases. D3 must cover **both** conditions of the
chain-base read — a chain cut on a base the top lacks refusing at **prepare** with the recut-or-merge remedy and the
close not reached, and refusing the same way at the close when a snapshot reaches it without that prepare; and a
chain base the top contains reaching the close's stale arm, whose remedy is the rebuild — and the stale arm's text
disclosing that the rebuild is taken from the top; a hand-authored chain whose later member absorbed a base the top
lacks classifying stale; and the pre-publication review gate's refusal carrying the payload's detail and remedy
through all three type sites to the operator rather than the reason alone, with the frontline response binding's
refusal unchanged.

The D1+D2 member must cover the removal of the `gateResults` operand at the three seams that drop it **and** the
public-failure composer's restated `requestedHead` at the fourth, and the pinned lifecycle-revalidation operand
(§ D2, Residual B). D6 must cover publication refusing a chain whose Candidate advanced after attestation **and**
publishing cleanly when it did not; that refusal carrying the arm's `state` and `nextAction` beside the re-attest
route, and a pending convergence naming its awaiting response and required scope, while the work-unit publication
verb's own refusal is unchanged over the extracted derivation; the mutation path closing with its verification loop
gone and no `checkoutPath` on its request, on **both** its callers, while the pre-publication review gate still
refuses a dirty or mismatched checkout and the pair coordinator still refuses a dirty candidate checkout — with the
close's own final loop still re-observing every member ref; and the reconcile seam returning a composed
applicability decision, with the two sibling read sites still refusing opaquely — the negative case is what keeps
the correction scoped.

D8 carries its own obligations (§ D8): a record-only pushed top advance with an approved lower-member response driving
through to authoring, the refusals it keeps, the carry from `publication-pending` with its two refusals, reconstruction
from that before-boundary, one continuation run from the boundary publication actually writes, and an acknowledgement
after the selected member's base moved, with consumption's refusals for the other target kinds and for a base that is
not the one supplied. The existing case asserting `review-fix-position-unavailable` after the acknowledgement's record
commit changes with it, as an ordinary assertion rather than a pinned probe.

D9 carries its own obligations (§ D9): conflicts at the first and a later member of a registered stack resolved in the
workspace and settled, two of them across two stops, with the later-member reuse defect reproduced before it is fixed;
the adoption stop, its exact resubmission — after a partial landing too — and its stale and altered refusals; the
disclosure of a path beyond the conflicts, on every consent arm; recovery of an interrupted settle from the reservation;
and landing readiness after adoption. Over a top that merged `main`, the refresh arms without a selection admit the
movement with its resolution disclosed and a record commit, refuse an authored remainder while a non-terminal member is
outstanding — a correction confined to the resolved paths, and an entangled correction naming the set-aside, included —
and admit it once set aside by a revert, a correction committed before the merge included; entry inspection over such a
top reports Candidate verification rather than ambiguity. The bound route's end-to-end case gains an entangled chain
cleared by setting the correction aside, restacking under consent through `refresh adopt`, restoring the correction, and
continuing.

**Criterion 7 owns one end-to-end fixture, jointly D2's and D4's.** A three-member chain meets a disjoint base advance —
closing `eligible` with the chain unchanged and no member recut — and then base movement overlapping a member below the
terminal, which refuses naming that member and the base merge into the top. Once that base is merged into the top and
resolved, construct re-anchors the unlanded chain on it, each member taking its attributed version of the resolved
paths, and the rebuilt chain closes `eligible`. It lands with whichever of the two members lands second, since it cannot
run until both mechanisms exist, and it is the only criterion whose check spans deliverables.

D4 must cover a conflict at member N adopting nothing and leaving the previous chain usable; a dirty, foreign, or
attached checkout at a member above the first refusing up front with nothing adopted; a failure injected partway through
binding before publication leaving a mixed chain that eligibility prepare refuses `wrong-predecessor` naming `construct
--continue` as its remedy, and the continue converging it; any other construct run refusing while the stopped binding's
record stands, naming the continue; the record's ref created, replaced, and deleted only by compare-and-swap, through
its own primitives; under a record from another plan digest, construct given the revised plan's cut list deleting it and
cutting from the list, and any other run refusing, naming that recut; the last bind removing the record; and on the
bound route the same failure's `wrong-predecessor` owing construct, dispatched with the selected member, which rebuilds
the stopped chain object for object with nothing recorded, and with the selection changed before it, rebuilds for the
new one; the recut reproducing the same object ids when none of its inputs changed, including under disjoint movement;
author and committer surviving byte-exactly through a non-UTF-8 identity; and the co-authorship union preserving every
author on the range and on any delta placed on the member; anchor compatibility refusing a hand chain whose first
member, and one whose later member, carries a base the top lacks, each naming the member and the recut from the cut
list; and a chain whose terminal matches no commit on the top's first-parent line refusing, naming the recut. The
close-side `rebuild-required` reason must be exercised over a **constructed** chain whose top then advances, not only
over probe 3's fixture: that fixture branches the top from the terminal candidate, so it cannot tell the chain-base read
from a final-candidate read, and only a constructed chain — whose members the top never contains — does. On the bound
route, the correction controller dispatching construct ahead of `arc delivery rematerialize` and entering review-fix
verification after it is covered end to end, including the projection choosing rematerialize on the pass after construct
rather than refusing `delivery-review-fix-no-progress`; a guard refusal dispatching construct, which clears it where the
top absorbed the movement — at the terminal under disjoint movement, by re-anchoring the chain under overlap — and
otherwise refuses naming the base merge into the top, ending the drive rather than repeating. A corrected top that
absorbed a disjoint base carries it in the terminal alone — with the fix on the first member, on a middle one, across
two base merges, and for a second correction after a first rebound, whose structural check reads the resolution from the
terminal's recorded predecessor — with every unselected member proving a mechanical reapplication and the terminal's
proof accepting over its absorption merge; a merge that fails the structural check — outside the resolution, or on a
resolved path unequal to the top's own version — is refused as that predecessor, and the constructed merge, which
differs from the clean merge-tree on the resolved paths, is admitted; a base overlapping an unlanded non-terminal member
re-anchors the unlanded chain, proposing each published member whose attributed content changed through a typed stop
whose resume action carries the digest, leaving no record, and, once that action is resubmitted unchanged, advancing the
target through the first member's rewrite and rematerializing with the contribution proof admitting each such member's
resolution paths and the terminal's — at both proof sites, including a terminal that already carries an earlier
correction's absorption merge, and still after the first rewrite has advanced the target and after a re-entry, where a
window read from the chain base would find no resolution; an admitted middle member stays in the verification set
through an uninterrupted re-anchor, whose last pass proves it tree-equal, and a correction superseding one still
awaiting verification verifies and installs the pending set unioned with its own admitted members while each rewrite's
reservation carries the pending set exactly; a newest base that does not contain the target and the first unlanded
member's recorded base refuses naming the base merge into the top; rematerialization's precondition accepts the
re-anchored chain base and refuses one that does not descend from the target; the first member's rewrite refuses
`target-rewritten` a requested target that does not descend from the current one, and a later member's rewrite still
refuses any changed target; the proof refuses a divergence outside the resolution paths or unequal to the attribution it
recomputes, and, with a correction placed below a later member that absorbs the base, admits that member where the
correction leaves its resolved paths alone, while the later-member stop adopts nothing where it reaches one; an
entangled chain clears through the operator refresh around the set-aside correction; an entangled correction ends the
drive with its typed result and, once set aside and re-applied on the top, clears on re-entering `review-fix continue`;
a later member's reapplication that conflicts stops for its resolution and, resolved to the reapplication alone and
continued, is admitted by the proof, disclosed, and verified, its prior approval not carrying at landing, while a member
with no resolution recorded for that composition, or content other than the one recorded, is refused, and one resolved
to the top's version is admitted too, disclosed as any resolution is — the obligation's stated boundary, which no check
closes — and the tail's completion removes the records; and the later-member stop adopts nothing, naming the pending
review-fix authority where the selected member is unchanged, and the split where it changed, whose selected member's
part then discharges the authority through `review-fix continue`. The terminal's proof accepts a lifecycle-bearing top
and still refuses a non-lifecycle divergence. A correction after one member has landed — with the base unmoved, and
moved disjointly since — prepares, rematerializes, and re-observes an interrupted run, and one whose top absorbed an
overlapping base re-anchors with the target advanced from the landing merge. A rewrite loop stopped after its first
rewrite on an unregistered stack re-enters through the rematerialize route rather than `refresh execute`: with nothing
moved it resumes rematerialization, entering every member below the break in the verification set; after the top absorbs
a disjoint base, an overlapping one, or a second correction for the rewritten member, it dispatches construct over the
mixed chain, whose rebuilt chain equals construct over the loop's candidates, or stops where they stop, and proposes
once more what the stopped loop had not yet republished, accepted by resubmitting the stop's action; on a registered
stack the same shape still reaches the provider refresh. With no correction task open, a loop stopped after its second
rewrite, and one stopped at a pending tail, re-enter from the pending approved review response rather than refusing
`review-fix-response-stale`, and a response whose reviewed head the break's recorded predecessor does not contain still
refuses stale; a superseding loop stopped between rewrites re-enters through the verification it restored and routes
correction from it. **The handler runs against real Git here, not a mocked executor**: every existing handler test mocks
it and every suffix snapshot in the unit tests uses a chain base equal to the target, which is how a route refusing
every work unit on its lifecycle paths stayed green. One such case is end to end: an unregistered three-member stack
whose top carries lifecycle content and has absorbed a disjoint base, with its first member landed, taking a correction
on its second member from the controller through construct and rematerialization to top adoption.

The member shape, the overlap clearing, the member sources, and placement carry the obligations the four builds
established, each as a test rather than a restatement of it, and the test set's topologies are what criterion 11's
parity clause is measured over. § D2's guard passes a constructed chain wherever it passes the uncut history across
members whose ranges absorbed bases, and passes it where the uncut history refuses only because a later member's merge
resolved an earlier member's conflict with the base. A first cut anchors every member on the newest base the top
absorbed, with no absorption merge below the terminal. A provider-style plain rebase of a constructed dependent suffix —
a re-anchored chain and a terminal carrying an absorption merge included — keeps every member's content and the
contribution proof accepts it. The authored-commit check passes a member that deliberately reverts a base change in its
own commit, and refuses terminally, with nothing adopted, a planted misattribution the guard and completeness both pass.
Overlap on the first or a middle member re-anchors the whole unlanded chain with the resolution, identical to a fresh
first cut from the same cut points; disjoint movement reaches the terminal alone with every lower member retained by
object id; the recorded resolution's departures — on a lower member's path, on the terminal's, and on content the base
added — reach the member each belongs to, and a `4ae7872f35`-shaped chain closes complete on both routes, as does a
follow-up commit on the top that edits content the base added; a lower and a higher member editing different hunks of
the moved path each take their attributed version, and editing the same hunk stops entangled naming the member and path;
and movement beyond the newest base the top absorbed refuses naming the base merge. An attributed version a member's
source does not carry stops with nothing adopted, presenting every proposed member and path under one digest; the
continuation carrying that digest adopts exactly the objects the stopped run built; a digest made stale by a top that
moved stops again on the new proposal; a later rebuild reproducing the accepted content before publication — including
after a lower member's recut — does not ask again, and one on the bound route asks again until the member is
republished; and a rebuild over disjoint movement, and the terminal, never propose. A correction placed on the first
member, and on a later one, lands there with members below it retained unless the overlap clearing re-anchors the chain
and the terminal complete, and with no placement lands in the terminal; one placed on the first member that also removes
a whole file, or a whole block of a shared file, only the terminal added reaches the terminal complete with no break and
no base merge, and on the bound route takes the later-member stop naming the split, under a re-anchor too, where the
terminal absorbs the base; so does one removing the terminal's line from a path whose base merge departed and the
terminal authored, the placed member keeping the base's version of that path before publication; one removing a single
line of the terminal's block, or of a file only the terminal holds, stops at the placed member for its resolution, and
resolved to that member's version with its own fix completes, the terminal taking the top's version; two sequential
corrections placed on different members each stay where they were placed; continuing a stopped binding — stopped after
the first member, and after the second, under a re-anchor, and with the correction placed below, at, and above the
member below the break and on no member, including one fixing the placed member while removing the next member's
adjacent line — binds the full rebuild's object ids, composing nothing; construct over a chain a stopped rewrite loop
left mixed, placed on the correction record's selected member, equals construct over the loop's candidates — with
nothing moved, under disjoint movement, under overlap above the break and on the rewritten member, under a later
disjoint base carrying a departure no member authored, with a second correction for the selected member, with a
lifecycle commit between two corrections, with a pending tail, and with a correction on a path the new base moved
cleanly — and a second correction spanning two members, and one reaching content only a member above the break holds — a
whole file or a single line, with no base movement and under a re-anchor, and, under a re-anchor, the terminal's line in
a path the base merge resolved or a line the terminal added to a path the member below the break resolved — stop
identically on both, the latter as the later-member stop at that member; a later member's line beside the resolution of
a path the member below the break authored, or beside the base's movement of another hunk of it, stops the construct
that re-anchored that member as an entangled chain; a correction whose range absorbed a newer base splits — with the
merge directly on the source top, after a fix to another hunk of a resolved path, after a fix to a path the merge did
not resolve, and between two base merges — the absorption going where the overlap clearing puts it and the remainder
folded after it; a fix to the resolved hunk stops as an entangled correction naming the placed member and path, and once
set aside and re-applied on the top — by a new commit, and by reverting the revert — rebuilds complete with the fix in
the placed member; a correction on a resolved path placed on the terminal, or unplaced, sits in its authored commit
rather than its absorption merge; a conflict at the placed member — a fix beside a line a later member rewrote, a fix
with a removal of part of its hunk, of a line it inserted, or of a line of a file only it holds, and a fix wholly to its
rewritten hunk — stops with nothing adopted and that member's workspace prepared, and one resolution there, continued,
completes the chain with the terminal taking the top's version, under a re-anchor whose fold waits for the absorption
too; a continue over recorded resolutions reproduces the chain object for object, a further correction composing
differently stops afresh, and a workspace left holding another composition is replaced; a correction committed after a
binding stopped is placed by the next construct, over the chain the continue bound; a workspace an abandoned conflict
stop left never occupies the registered route's path and goes when construct next completes, removed by force only at
construct's own sub-path; the reaper removes an abandoned workspace, dirty, by construct's forced rule, its recorded
resolutions, and a stopped binding's record through the record's own delete; and the upgraded stale arm's detail states
the terminal default and how to name a placement. The candidate-checkout rename is covered where it changes observable
behavior: pairs placed under `delivery-checkouts/`, and the reaper refusing `candidate-checkout-mismatch`.

**Migration and rollout.** Pre-public-release posture applies: removing the `gateResults` operand, its schema, its type,
and its five refusal reasons (on the D1+D2 member), and removing the per-member `checkoutPath` from the mutation request
(on D6), are breaking changes to unpublished project-owned contracts, which this project's posture permits in place — no
compatibility aliases, no migration readers, and development state is cleared or regenerated rather than migrated. D9's
reservation field and scope arm are additive to the same unpublished schemas. The stack lands per the delivery shape
above, with the single-branch fallback recorded up front. The candidate-checkout rename moves the checkout directory,
and the on-disk half is development state under the same posture: for any plan in flight when D4 lands, its old
checkouts are removed and its candidate refs deleted, and construct regenerates the pairs — a ref left without its
checkout would otherwise refuse `candidate-pair-split` and block closeout. The doctrine half lands with it:
`strategy-integration.md`'s two edits, `ADR-035`, and a dated cross-reference amendment on `ADR-034` ride D6 rather than
a follow-on, because the next delivery cut is the sibling this work unit exists to unblock and would otherwise inherit
the retired model.

**The doctrine half, specified.** Three documentation artifacts ride D6, each stated here rather than left to the
implementer to re-derive:

- **`strategy-integration.md` § Publication Boundary — one addition.** The section already says verification
  establishes an attestation over the exact work-unit subject, that private review and convergence settle against
  that Candidate before publication, and that the attestation "is neither a review verdict nor merge authority."
  All of that survives. The existing text states an **order**; the addition makes it a **check** — publication
  reads the Candidate's currentness and convergence state and refuses a subject the attestation no longer covers,
  so work prepared against a superseded Candidate cannot reach a public head. The section's second paragraph
  already handles the mirror case of a moving _public_ head; this closes the private side it leaves open.
- **`strategy-integration.md` § Delivery Shape and Landing Window — one line splits.** "Review and checks gate
  members incrementally, but merges run in one post-publication landing window" conflates two things and leaves
  check placement unstated — the same gap `ADR-034` left when it decided merge timing only. Review admission keeps
  its incremental gating and stays owned by § Review Admission and Head Movement; **member checks run after
  publication**, against each published change request, on whatever check policy the project configures.
  Publication carries one work-unit attestation, never a per-member check result. The accepted consequence is
  stated in the strategy and not only in the ADR, because the strategy is adopter-facing and cannot reference an
  internal decision record: a non-terminal member may reach the landing window without having been checked in
  isolation, with the terminal checkpoint, the integration interlock, and the base's own required checks standing
  between the composed result and the protected base.
- **`ADR-035: Run Delivery Member Checks After Publication`**, at
  `adr-035-run-delivery-member-checks-after-publication.md`. A new record rather than a supersession: `ADR-034`
  decides the review lane and the bottom-up post-publication merge window, and none of that changes — this decides
  a different axis the original left unlocated. It decides check placement, records the alternatives the external
  research surfaced and why local per-member gating before publication was declined, states that publication reads
  the work-unit attestation instead, and states the accepted consequence above. `ADR-034` gains a **dated
  cross-reference amendment** pointing at it and noting that its check clause is located there — its Decision
  item 2 reads "member review and checks settle incrementally, but merge acts wait for the `Integrating` window,"
  which draws an incremental-versus-batched contrast and never locates checks relative to publication; read as a
  guarantee that every member's checks settle, it would sit in tension with the decision here.

**Edit direction for every documentation destination** · `[invariant]`. `strategy-integration.md` and
`deliver-stack.md` each exist as two byte-identical copies — the shipped package source and the repository's own
`.arc/` checkout. Framework content changes go through the **package source** and sync outward, never the reverse,
so neither destination is edited in place in `.arc/`. `ADR-035` is project-internal and unmirrored, which is why
the shipped strategy cannot reference it: the strategy edits must stand on their own text, and only the
project-internal `ADR-034` amendment may cite the new record.

**Forward compatibility.** Nothing here adds a durable record kind, a namespace, or an evidence vocabulary — D9's one
new field lives on the existing reservation and is cleared with it, and what construct keeps across a stop is
in-progress operation state under the plan's existing candidate namespace and resolution path family, removed when the
operation completes, as `.git/rebase-merge` is — so the constraint against a generic evidence store is satisfied by
construction rather than by argument. Authority for what covers what stays with the Candidate machinery and the
applicability assessment, which is where it already sits — this work unit adds no second opinion about applicability, it
removes a door that was discarding the first one. D4's resolver seam and separable stages keep the tracked-tier
projection's retirement a removal rather than a rewrite when operational state moves off-branch (§ D4, Substrate
contracts versus tracked-tier projection).

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
  Nothing routes to it from here and no seam is shared: delivery's prepublication pairs are owned end to end by the
  residue reaper and the pair coordinator, a different family from the frontline path's ephemeral checkout. D4 does
  widen one checkout-observation port — the dirty-status read that collapses to a bare `dirty` — but that port is
  the pair coordinator's, so the widening lands inside delivery's own family rather than crossing the seam.
- `delivery-correction-convergence` keeps record-only convergence and the public `position` probe held over a
  record-only terminal advance (§ D8). The seam is the correction continuation: D8 changes how
  the continuation reads the landed prefix and what the acknowledgement's carry accepts, and that work unit's
  record-only loop runs through the same continuation afterwards, so whichever lands second rebases its continuation
  cases on the other's. The re-cut is routed as a `USER-INBOX` capture against that work unit rather than edited into
  its draft from here.
- `candidate-reroot-recovery-frame` may preserve resumability but owns no applicability decision.
- `review-signal-convergence` is implementation-complete and integrates after this work unit. Two seams. It rewrote the
  review-gate files § D8's fix-response change touches — the acknowledgement's response advance now writes into a
  disposition lineage, and fix authorization, respond, advisory records, and the delivery handler's review-fix
  continuation changed with it — while leaving the new target's composition and consumption's diff-base equality as they
  are, so the two changes meet only textually and it reconciles them when it integrates. And its disposition
  supersession is what completes the remedy of the bound later-member stop where the selected member is unchanged
  (§ D4); until it lands, that stop needs the Owner's direction. Both seams are routed as a `USER-INBOX` capture against
  it rather than edited into its planning artifacts.
- `delivery-native-stack-composition` is complete. § D9 supersedes its 2026-08-26 amendment's "remain exact" for the
  three refresh arms without a selection, recorded here as a supersession rather than an edit to the archived spec.
- Keep **Make no-material Frontline follow-up effective across Candidate rerouting** independent unless source
  inspection proves its blocker is the same evidence-target binding rather than merely adjacent vocabulary.

**Residual scope legibility.** The delivery shape narrows a refusal and never a tolerance, so residual scope is
invisible on tolerant results — which is why a checkpoint advisory can read "merge the base before continuing edits
on those paths" on the very result that just admitted a reviewable path. Making the residual scope legible in the
payload is this work unit's design response; which component composes the message is the Errand's.

## Success Criteria

1. Disjoint protected-base movement reobserves eligibility and closes eligible rather than refusing, while movement
   overlapping any member's own authored contribution — measured per member against the movement that member has
   not absorbed — still prevents unsupported reuse, and the refusal names the member whose paths intersect (D2).
2. Exact member and suffix transitions receive carry, bounded supplemental, or fresh treatment from verified
   before/after coordinates; ancestry or contribution similarity alone never establishes evidence applicability.
3. An authorized prepublication base reconciliation or rebuilt-chain result reaches Candidate applicability through
   verified endpoints and does not become unexplained merely because it happened before publication.
4. Bounded residuals use the existing operator-bound selection, and supplemental evidence binds to the current
   obligation; unavailable, unbounded, stale, or unrecognized transitions remain conservative.
5. Every delivery site that reads the effective candidate target consumes one coherent applicability result without
   turning it into review clearance or publication authority. The eligibility close is not such a site: it reads
   neither the Candidate record nor the convergence state, and criterion 13 carries the read sites that do.
6. Movement, interruption, and replay preserve completed valid work, reject stale selections, and reobserve all
   mutation authority. In particular, an already-bound-target retry with protected-tip movement after eligibility
   close has a tested safe disposition or an explicit, evidence-backed non-authoritative residual; no recheck is
   claimed to eliminate every external race. Terminal integration retains its own current checkpoint evidence and
   exact-head approval.
7. An end-to-end three-member case encounters disjoint movement and then overlapping reconciliation, repeating only
   the evidence justified by each delta and never forcing an unexplained full reset solely at a lifecycle seam
   (D2 + D4, jointly — see § Cross-cutting Considerations, Testing).
8. The covered-input rule is stated once in a surface non-delivery ceremonies reach, and its firing condition
   demonstrably reaches those consumers — verified by reading the trigger, not by asserting the placement (D1).
9. A chain that does not normalize to the top names which side moved and what would clear it — at eligibility
   prepare when the chain is on a base the top lacks, at the close when the top has moved past the chain — and any
   refusal that names a remedy can have that remedy actually clear it (D3).
10. A clean unbound stack reaches reviewable candidates through one typed authoring verb with no per-member
    hand-authored Git steps; replay converges; a conflict stops with its exact member and that member's resolution
    workspace, leaving the previous chain usable, and the continue after its resolution carries the chain on; a binding
    that stops partway is continued rather than re-run; every stop names the remedy its route has; and a resolution
    attributed to a member that did not carry it is adopted only through one approval, which a rebuild reproducing it
    never asks for again (D4).
11. A rebuilt member carries its net contribution as one authored commit — the terminal alone preceded by one absorption
    merge, when it takes a base newer than its predecessor's — whose author and committer are its boundary commit's
    byte-exactly and whose trailers carry forward the co-authorship of its range and of any correction placed on it,
    under a subject derived from the same identity its request title carries. Across the topologies in the test set, the
    per-member guard passes a constructed chain wherever it passes the uncut history, and also where the uncut history
    refuses only an overlap the top has already resolved; no authored commit carries a path its member did not author; a
    correction lands in the member it was placed on — including one committed before a base merge into the top, and in
    the member's authored commit rather than an absorption merge — and stays there through a later correction placed
    elsewhere, while its removal of a whole file or hunk only a later member added reaches that member before
    publication, and on the bound route takes the later-member stop; the contribution proof accepts a constructed member
    against the moved predecessor, including after a provider restack, a rebuilt terminal against its absorption merge,
    and a member whose content differs only on the base's recorded resolution against the attributed version it
    recomputes; and rebuilding unchanged inputs, continuing a stopped binding, or constructing over a chain a stopped
    rewrite loop left mixed reproduces the same object ids (D4).
12. Delivery publication refuses a chain that was rebuilt to match an advanced top without re-attestation — the state
    the completeness comparison cannot see — and accepts a content-preserving rebuild whose subject digest is
    unchanged (D6).
13. A non-current effective target reaches the operator with its own remedy at the delivery reconcile seam, at
    `readCandidate`, and at delivery publication; the one undecided arm reaches them with choices at reconcile
    rather than a refusal; the record-effect recovery and boundary-carry sites keep their single refusal, each
    accurate for the question it asks; and no stop-class arm is routed to a remedy that cannot clear it (D6).
14. A rebuild blocked by a candidate checkout it cannot reset names the dirty paths it observed and separates untracked
    residue from tracked modification, and re-running the same command after the repair continues rather than restarting
    — verified on both the refusal and the continuation (D4).
15. The bound correction route runs end to end over real Git on an unregistered stack whose top carries lifecycle
    content and has absorbed a base, including after a partial landing. Disjoint movement reaches the terminal alone and
    every unselected member proves a mechanical reapplication; a base a published member authored against re-anchors the
    unlanded chain, advancing the target append-only, and each member whose attributed content changed is proposed,
    admitted by the proof once accepted, and verified; and an entangled chain clears through the refresh its stop names,
    whether that restack is clean or conflicts; and an entangled correction clears once set aside and re-applied on the
    top, the continuation re-entered (D4, D9).
16. A member correction runs from its approval through its acknowledgement and record commits to the review request,
    starting from the boundary publication actually writes, with no hand step; every refusal of substantive or ambiguous
    top movement is unchanged; and a fix response is acknowledged, and its replay accepted, after the selected member's
    base moved, while a consumption whose new diff base is not the member's recorded base still refuses (D8).
17. A published, unlanded non-terminal member whose restack onto a moved base conflicts reaches landing in either stack
    shape through one resolution and one consent — resolved in ARC's workspace and rerun on a registered stack, adopted
    through one exact resubmission on an unregistered one — with every path the resolution changed beyond the conflicts
    disclosed, a stale or altered resolution refused, and the member's prior review not carried: review readiness at
    landing asks for it again at the member's exact head. The selected review fix's consent and the native post-landing
    one disclose the same way (D9).
18. A first cut anchors every member on the newest base the top absorbed, so only the terminal ever carries an
    absorption merge. A fixture shaped like `4ae7872f35` — a merge of `main` into the top that conflicts on one member's
    path and departs from the mechanical merge on a lower member's path and on content the base added — rebuilds
    complete on both routes, with every departure in the member it belongs to and none in an authored commit whose
    member did not author it (D4).
19. A conflict composing a member — a correction beside or within a later member's version, or removing part of what it
    added — stops with nothing adopted and that member's resolution workspace prepared, and the continue after one
    resolution rebuilds complete, the terminal taking the top's version before publication and a recorded resolution
    taken again only for the identical composition. On the bound route a later member's resolved reapplication is
    admitted by the contribution proof and verified, its prior approval not carrying at landing, and a fold that would
    change a later member stops with nothing adopted, naming the split on the top where the selected member changed —
    which, reverted and re-applied in its two parts, rebuilds complete with each part in its own member — and the
    pending review-fix authority where it did not (D4).
20. Over a top that merged `main`, refresh planning, complete-remainder execution, and adoption without a selection
    admit the movement, its resolution disclosed, when nothing authored rides on it or no non-terminal member is
    outstanding, and otherwise refuse naming the commits, the paths, and both routes — a correction confined to the
    resolved paths included, while one set aside by a revert nets out; delivery entry reads a top that only merged
    `main` as owing Candidate verification rather than as ambiguous (D9).

**Criteria 2 through 6 carry no deliverable tag, and that is deliberate.** They came from the
`evidence-applicability` capture and state properties of the Candidate-applicability substrate this work unit
consumes rather than changes; D6's reconcile-seam correction is the only place this work unit touches that
substrate, and criterion 13 is where that touch is checked. They are carried because the capture's obligations
survive the boundary widening, not because a deliverable here implements them. Criterion 7 is the exception and is
owned, because the end-to-end case is work this work unit must actually author.

**Criterion 1 restates its predecessor.** The original read "without repeating member gates whose covered inputs
remain unchanged; changed gate definitions or other actual covered inputs prevent unsupported reuse." With per-member
gates removed there are no member gates to repeat and no gate definition to cover, so the clause is restated around
what the close actually does. Its two-clause structure — permissive and restrictive — is preserved. Criteria that
bound the retired gate-result record and its execution environment are gone with it.

## Open Questions

Every settle-able decision is settled.

What remains open is implementation detail, plus **one** named obligation that belongs to execution rather than to
design: D2's demonstration that the per-member guard and the independent chain-base refusal cover the
fabricated-snapshot case the re-scoped comparison no longer catches (§ D2, Residual A). It is stated where it fires
and carries its own verification; it defers no design decision.

Two questions that stood here are **settled and no longer obligations**. Member boundaries: delivery derives none, it is
given them as the operator's cut list at the first cut and for the authoring-side recut, and reads the chain as it
stands afterwards — the private candidates before publication, the Delivery State member records on the bound route —
with each member's range taken from the predecessor it was built on (§ D4); what remains is the seam carrying the
operand across both planning-storage modes, stated there as a design constraint. And D1's trigger reach: the firing
condition was read rather than assumed, its first and fourth clauses are work-unit-generic, so it reaches the rule's
non-delivery consumers as it stands and no trigger widening rides D1 (§ D1).
