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
privately is the plan-derived, gate-paired candidate namespace the correction routes and the review gate read.
Eligibility is **prepared** once and **closed** later — two separate observation windows, today with a full Tier 2
pass across every member running in detached worktrees between them.

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
2. Disjoint protected-base movement re-observes eligibility and closes eligible rather than refusing, while
   movement overlapping content a member actually authored still refuses and names that member.
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

- implement provider restacking, mutate public Delivery State, or touch the published-side refresh path at all —
  including the duplicated top absorption that path carries, which routes out as its own work unit
  (§ Alternatives & Rationale);
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

Rows are in ID order; `Depends on` carries the delivery plan's dependency ordering, which is not a task sequence.
**The set is D1, D2, D3, D4, D6 — five and seven are unassigned and stay that way**, so a deliverable ID means
the same thing in the task list, the delivery plan, and every commit that cites one. D5 went with the
prepublication gate window it served (§ D6); D7 routed out of this work unit (§ Alternatives & Rationale).

| ID | Deliverable                                                    | Depends on        | Retires     |
| -- | -------------------------------------------------------------- | ----------------- | ----------- |
| D1 | The covered-input rule, stated in a shared surface             | —                 | —           |
| D2 | Eligibility close admits non-covered movement, per member      | —                 | probe 1     |
| D3 | `completeness-*` refusals carry direction and remedy           | D4 (remedy)       | —           |
| D4 | Member constructor, anchor preflight, `rebuild-required`       | —                 | probes 2, 3 |
| D6 | Publication reads the attestation; projection reaches operator | D4 (verification) | —           |

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

**Residual B — the enclosing verb's live reads stay as they stand.** `closeDeliveryEligibilityForPublication` runs
two live protected-base reads _above_ the mechanical close (lifecycle-path resolution from `refs/heads/<base>`, and
each member's lifecycle-contribution revalidation, where the derivation passes a ref _name_ resolved live at
`ls-tree` time while passing the chain base beside it as a recorded OID). They refuse identically today, so D2
neither narrows them away nor regresses them. The unpinned operand routes to D6.

**Verification obligations.** Disjoint movement closes `eligible`. Overlapping movement still refuses, including
movement that overlaps a **later** member and not the first, which today's first-member operand misses, and
movement that overlaps an **earlier** member which a later one has absorbed, which no chain-wide operand catches. A
base merge inside a member's own range is not mistaken for that member's authored content, including the
**single-member** chain where that merge sits inside the only member's range. The refusal names the member whose
paths actually intersect. The per-member ambiguous merge base takes the existing refusal. A base already carrying a
later-member overlap when the window opens refuses at **prepare** rather than only at the close. The
fabricated-snapshot case the re-scoped comparison no longer catches by `observedTip` is still caught. The fixture
must stop stubbing `resolveLifecyclePaths` to a single constant **and carry a non-regenerable lifecycle path** —
its only lifecycle path today is regenerable, and regenerable paths compare against the chain base rather than the
protected base, so un-stubbing alone leaves neither live protected-base read observable. A second, unpinned case in
probe 1's own file, which today refuses `source-moved` after a base advance and closes `eligible` afterwards, is
rewritten alongside the probe rather than retired with it.

**The per-member gate operand is removed on this same delivery member.** The window D2 would otherwise open — its
landing admitting base movement while per-member gate results are still reused across it — closes only from the
landing that removes those gates, not from a later one (§ Boundary outcome and delivery shape, § Workflow surface).

### D3 — `completeness-*` refusals carry direction and remedy

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
construction**, and carrying it forward reproduces the tie with more fields. What names a side is whether the final
candidate is contained in the top.

That reader is already declared, already wired, and already in scope at the refusal site. The eligibility
dependencies declare `readAncestry(ancestor, descendant)` returning `ancestor`, `not-ancestor`, or `unresolvable`;
the close binds `finalCandidate` from the snapshot's last member and has `snapshot.top` beside it, immediately above
the `completeness-*` refusal. One call there distinguishes the conditions: **contained** means the top advanced and
the chain is stale; **not contained** means the chain diverged from the top; `unresolvable` takes the existing
unavailable-evidence arm.

**The close-side `rebuild-required` reason gets its discriminator from the same call.** Contained plus a
completeness mismatch is the stale-chain condition whose remedy is a rebuild; not contained is the authoring-side
condition with a different remedy. This also answers the objection that the direction-decider named for the
constructor carries no signal: the predecessor relation relates the **first member** to the **protected base** and
reads no member-to-top ancestry, and this call is that missing read.

So D3 is enriching the refusal payload with direction and remedy, plus one ancestry call — **not** a port widening,
a refusal-union widening, and three collapsing-site updates. Any task decomposition that reproduces those is
working from the superseded shape.

**The path partitions stay out of the payload.** They are discarded at the port by construction: the normalized
comparison is declared returning a match or a `{ status, reason }`, so the dropped and invented sets exist only
inside the adapter that classifies the reason from them. Carrying them forward **is** the port widening this
deliverable removes from scope, across all eight sites the port has, to buy a longer message from a partition that
is symmetric and names no side. The one sibling refusal carrying a typed path array draws the line rather than
contradicting it: those paths are the evidence deciding that refusal, while these would describe one the ancestry
call has already decided.

**The remedy D3 names is D4's, which is what the dependency column records.** The enriched payload names the D4
construct verb in `automatedCommand`; until D4 lands the existing `delivery-authoring-rebuild-required` remedy with
a null command stands, clearable by hand. Success criterion 9 is what forces the pairing: a refusal that names a
remedy must name one that can actually clear it.

**Typed-crossing rider.** `checkpointMovementCause` is stringly typed at its producer and absent from the
consumer's declared input, so neither end of that crossing is compiler-enforced while every sibling crossing
introduced alongside it is. No live defect; the hazard is a new overlap status reaching the surface unadmitted and
silently. It rides D3 as the same family — a refusal payload whose typing does not carry what its consumer must
discriminate on. It edits the singleton integration checkpoint, a module assigned to a sibling work unit under a
sequencing constraint the delivery shape says no member carries; § Cross-cutting Considerations holds that seam.

**Scope note.** D3 cites the lifecycle-tail remedy-composition spine claimed by `singleton-integration-continuity`
rather than restating the obligation; D3 is the delivery lane's instance of it. D3 alone does **not** retire pinned
probe 3, whose awaited shape is a close-side `rebuild-required` reason — that is D4's.

### D4 — Member constructor, anchor preflight, `rebuild-required`

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
lifecycle-normalization, private-gate, lease, and eligibility surfaces, plus the object-construction primitives in
the same library. It introduces no parallel plan or state record. Every existing construction site builds **tops**
under a fixed two-parent shape and a fixed message, so none of them is a member builder this can consume; the
constructor's member shape is new, and the duplicated top absorption is a separate pre-existing defect that routes
out (§ Alternatives & Rationale).

**A rebuilt member is one commit carrying the member's net contribution.** Delivery already does not preserve a
member's commit graph — the provider rebase linearizes each member range with no merge-preserving flag, and ARC's
own contribution proof accepts when a single three-way composition equals the member's tree, so tree equality
against a squash-equivalent reapplication is already the definition of a correct rebase here. Member ranges contain
base merges structurally rather than incidentally: `DEV-RULES.ARC` § Rebase scope forbids rewriting a pushed branch
to absorb base changes and requires merging the base in instead, so a work unit of any duration produces ranges
containing base merges by rule — measured at 2 and 3 merge commits across the live plan's 25- and 22-commit
members. Replaying such a range must either drop the merge, changing what the member contains, or recreate it with
a second parent from a base the new chain does not descend from. A net-contribution recut is unaffected by what a
range contains internally.

The principle that makes this coherent: **the work-unit branch is the shared working history, and a member request
is a derived presentation of it.** Append-only governs the shared base, where `strategy-concurrent-work` § Append-only
until integration places it as the single hard invariant; presentation branches are regenerated and force-updated,
which is what the existing member-ref rewrite already does under `--force-with-lease`. This is the stacked-change
idiom rather than a departure from it. The cost is stated rather than waved past: a member's request shows one
commit after a rebuild, so review comments anchored to a specific commit do not survive one — the cost ghstack and
Graphite users accept, with the full authored history remaining on the work-unit branch.

**Authorship is preserved byte-exactly, because the recut would otherwise destroy it.** Under `team.mode` a
member's range may carry several authors and a naive rebuild reattributes all of them to whoever ran it. The
constructor writes commit objects through `hash-object -t commit -w --stdin`, carrying author and committer through
the raw port's byte-oriented input. `commit-tree` under an environment passthrough is rejected: a process
environment is string-typed, so an identity that is not valid UTF-8 cannot survive it byte-exactly. Credit survives
because `strategy-team-coordination` § Ownership already routes non-owner contribution through `Co-authored-by:`
trailers — the constructor unions the range's trailers in first-appearance order, deduplicated, and adds one for
any author in the range whose identity the boundary commit does not carry.

**What the commit says.** Publication reads nothing from a member's commit message: the request title is composed
from the plan member's title under the identity parsed from the authored terminal title, and the body from the
operator's presentation. The message's durable consumer is the history the member lands into. Its subject is the
request title's identity **without** the stack position — `{type}({workUnitId}): {planned.title}` — so the landed
commit and the request a reviewer approved agree by construction, while `[k/n]` stays in the presentation where it
belongs and does not go stale in history. No body is derived: each rebuilt commit is a function of five inputs and
nothing else — the plan-derived subject, the composed tree, the new predecessor as parent, the author and committer
lines copied byte-exactly from the member's boundary commit, and the unioned co-authorship trailers — so an
unchanged rebuild reproduces the same object id and its push is a no-op rather than a force-update. ARC's own
`commit-msg` contract does not reach these objects: `hash-object` fires no hook, and a derived presentation owes no
`Context:` trailer.

**Where the constructed chain lives before review.** Private review reads the candidate pair, so the pair is not
optional — the pre-publication review gate composes per-member targets by deriving locators, preparing eligibility
over the reserved candidate refs, and verifying each gate checkout exact, unconditionally for a delivery work unit
and in its own process. A member that exists only as an unreferenced object is invisible to the reviewer who must
approve it. So each rebuilt member is written to `refs/arc/delivery-candidates/{planId}/{chunkKey}` with its paired
detached gate checkout, through the route-agnostic pair primitives the correction verbs already sit on. That
coordinator is idempotent by construction: absent creates, matching returns `already-rematerialized`, half-present
refuses `candidate-pair-split`. **No new namespace is minted** — the rejected alternatives were a private staging
namespace of this work unit's own, or a shared staging substrate extracted now across roughly ten thousand source
lines in six files. Because the pair is written at construct time the objects are referenced from the moment they
exist, so the garbage-collection exposure an unreferenced chain would carry does not arise, and the ordering
constraint that exposure implied is retired with it. The terminal member gets a pair too: the residue locator
deriver maps every plan member and the gate verifies a checkout for every locator, so the terminal's eligibility
vehicle still needs a ref and a checkout or review refuses at the terminal index.

**Where construct runs.** Its output must exist before private review reads it, and a pre-publication caller
returns after eligibility closes while delivery execution continues below — so the sequence is construct, then
private review, then publish, and publish re-prepares over the same refs it does today. **D4** changes nothing
about publish's operand or machinery; D6 separately removes two of its operands (§ D6). Construct is a **new
plan-scoped verb in the authoring family**, beside `authoring
locate` rather than a mode on either authoring write verb: both of those assert a provider-refresh route and
require a selected deliverable, an expected state revision, and a derivation record, none of which an unbound first
cut has, and both take exact caller-computed coordinates where deriving the coordinates is what construct is for.
The primitives beneath them are route-agnostic and are what construct reuses, so the new surface is one verb rather
than new machinery. What the verb owns that the existing ones do not is its **own authority predicate**: the plan,
an active work unit matching the plan's work unit, no active operation, a state valid against the plan where one
exists, and the anchor preflight below — the first four being exactly the checks the existing arm performs before
its review-fix-specific fifth, so this narrows an existing authority model rather than adding one.

**Member boundaries are an operand, not a derivation.** Delivery derives no boundaries; it is given them. Eligibility
prepare takes the candidate list as command input and checks count, order, and uniqueness against the plan, so the
boundary set is a caller-supplied operand at the first window, exactly as the constructor requires at first cut.
Once materialized the boundaries are durable: Delivery State persists a member record per deliverable carrying its
ref and coordinates. The deleted authoring snapshot is not a blocker — a member's span is fully determined by its
predecessor's head and its own, so the range is recoverable from two heads; what the snapshot recorded is authoring
provenance rather than the partition a rebuild needs. That retires all three options a rebuild was thought to need:
persisting the partition in the digest-sealed plan, retaining the authoring snapshot, and deriving boundaries at
construct time. The remaining obligation is the **seam**, not the source: the boundary operand must reach the
constructor through one seam serving both in-repo and off-branch planning storage, the same discipline the
lifecycle exclusion set already states.

**How the bound correction route reaches it.** The route is **`rematerialize`** — one of the four the review-fix
planner emits, beside `provider-refresh`, `terminal-authoring`, and `terminal-rebind`. The **registered** path is
`provider-refresh`, which is provider-native, reaches no constructor, and is the path § Non-Goals disclaims; the
constructor must not be wired into it. The correction controller authorizes a fix on the top and tells the
session to cut the affected suffix. What the constructor cannot reuse is the existing rematerialization _verb_,
which compare-and-swaps toward the published member head and refuses anything else, so a rebuilt coordinate has no
way in through it; the primitives beneath it accept any coordinate, which is where construct enters. That verb's
conflation of binding a coordinate with resetting to the public member is captured as its own concern rather than
widened here.

**Required behavior:**

- Prepare or compare-and-swap rebuild the complete unpublished candidate chain from an anchor compatible with the
  originating top and the observed protected-base relation, the canonical member boundaries, and authoritative
  lifecycle exclusions.
- Under disjoint protected-base movement, retain the top's compatible chain base and return an **unchanged chain**
  when the existing cuts remain compatible. Compatibility is decided by the same predicate § D2 gives the close —
  per-member authored content measured against the movement that member has not absorbed — so one rule governs both
  boundaries instead of two that can disagree. A newer base OID alone must not trigger recutting, and newer
  base-only bytes the originating top lacks must not be silently imported.
- Emit one commit per plan member — **n**, the terminal's eligibility vehicle included — each carrying that
  member's net contribution reapplied onto its new predecessor, under the message, authorship, and determinism
  rules above.
- Preflight any proposed chain's predecessor relation and normalized completeness against the originating top
  **before** returning coordinates, so a mechanically wrong anchor is caught at the prepare boundary rather than by
  the eligibility close after the whole chain has been built against it.
- Bind each constructed member into the existing private candidate namespace with its paired gate checkout, so the
  pre-publication review gate can read it and the chain is referenced from the moment it exists.
- Refuse a rebuild the gate cannot be reset for by **naming the dirty paths observed**, separating untracked
  residue from tracked modification because their remedies differ, and stating that re-running resumes — the pair
  coordinator is idempotent, so repair-and-retry continues rather than restarting. This is the one place the reused
  primitives do not suffice as they stand: the observation port collapses a non-empty status read to a bare
  `dirty` and the coordinator carries it on a string-typed reason, so both widen to carry the paths. The data is
  already collected and discarded — the status read distinguishes untracked from tracked.
- On the bound review-fix route, after the authorized top correction is clean and committed, rebuild the selected
  member and every dependent member from the current public ancestry and canonical member boundaries.
- Emit a close-side `rebuild-required` reason naming the rebuild owed — the shape pinned probe 3 awaits, distinct
  from the prepare-side preflight refusal probe 2 awaits. D4 therefore spans both boundaries, and it is the remedy
  D3's enriched payload names.
- Replay converges. Conflicts, dirty or foreign checkouts, moved authority or public heads, stale authorization,
  and incomplete normalization refuse **without a partial adopted chain**.
- A real conflict stops with its exact member and leaves the old chain usable. A conflict partway through a
  member's range leaves the pairs already bound untouched and binds nothing for the member it stopped on, so the
  partial work is discarded as unreferenced objects and the chain retains its last coherent state.

**Substrate contracts versus tracked-tier projection.** Coordinate production today normalizes trees against
lifecycle and Candidate records because those artifacts ride the work unit's code history. That normalization is
tracked-tier projection, and the storage direction schedules its retirement: once operational state materializes
off-branch, members become ordinary interior refs and the exclusion set empties. Everything else — anchor
preflight, the retained chain base, compare-and-swap rebuild, the no-partial-adopted-chain rule, the exact-member
conflict stop, member-boundary verification — is substrate-independent. **Author the split so the retirement is a
filter removal rather than a rewrite: the exclusion set reaches the constructor through one resolver seam the
constructor does not own, never as an inlined path list.** `operational-state-docs` is the eventual supplier of
that seam; until it lands, the seam is a boundary with one caller.

**The constructor places both halves of the pair, and the checkout is not optional.** The primitive is atomic by
construction — it creates the ref under a zero lease and then adds the detached worktree, rolling the ref back if
the worktree fails — and the coordinator refuses `candidate-pair-split` whenever exactly one half is absent. There
is no ref-only arm to take. Nor would one be wanted: § D6 removes the per-member Tier 2 **run** from the window,
but the checkout's surviving reader is the **pre-publication review gate**, which requires it non-dirty with head
and tree equal to the member's before composing a single target. The checkout is the reviewable working tree, not
a leftover of where gates used to run, so removing the run does not remove it.

Before moving a member's candidate ref the constructor observes the existing gate path and refuses a dirty or
foreign one. That refusal is legibility rather than safety: it surfaces a leftover pair at the boundary that
noticed it instead of at the next correction that trips over it.

**The disk cost is carried rather than waived.** Measured on one live three-member plan in this repository, the
gates total 671M; one is 235M, of which 148M is the dependency tree a Tier 2 run deposited, leaving **83M of
checked-out working tree per member** held from construct until reap. With no gate run in the window the
dependency trees no longer accumulate, but the working trees do, and the reaper is what bounds them — which is
why the pair contract and the reaper's `candidate-gate-mismatch` refusal are load-bearing rather than incidental.

**The typed result enumerates per-member disposition.** For every member the result names whether its cut was
**retained unchanged** or **recut**. Without it the unchanged-chain arm is unobservable: an operator cannot tell a
chain the constructor deliberately left alone from one it silently failed to touch. On refusal the result names the
exact member that stopped it.

**No partial adopted chain, and the mechanism that makes it true.** Objects first: every member's tree and commit
is constructed before anything is adopted. Object construction has no side effects, so a conflict at member N stops
with nothing to undo and leaves the previous chain exactly as it stood — the exact-member conflict stop above is
that property rather than a second mechanism, and it is what carries the guarantee on the path where it can fail.

Adoption then binds each member's pair under the **compare-and-swap on every ARC-owned write** that is this
substrate's safety property everywhere else, member by member, through the idempotent pair coordinator. No
all-or-nothing batch is specified, and none is claimed as precedent: `update-ref --stdin` has exactly one caller
in this codebase, a verification-only lease that writes `start` / `verify` / `prepare` and always terminates with
`abort` over a single ref — it issues no `update` directive and no `commit`, so a batched transaction would be new
surface rather than a reused one. It is also not what the property needs. A failure partway through binding leaves
the pairs already bound untouched and binds nothing for the member it stopped on; the unbound remainder is
discarded as unreferenced objects, the chain retains its last coherent state, and re-running converges because
absent creates, matching returns `already-rematerialized`, and a half-present pair refuses `candidate-pair-split`.

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
route alike, and neither retains a use for it.

Nothing is left unguarded by that removal, and the two guards that matter are elsewhere:

- **The reviewable working tree keeps its guard.** The pre-publication review gate calls the same function over
  every derived locator before composing a single target. Composition consumes only `{ baseRef, diffBaseSha,
  headSha }`, so the verification is not a composition input — it is the proof that the tree a reviewer is about
  to be asked to approve is clean and at the member's exact coordinates. That subject is unaffected by where
  checks run, so this caller is untouched.
- **The correction-authoring pair keeps its dirt check.** On the bound route the pair is where the constructor
  writes, and the pair coordinator's own gate observation already refuses a dirty gate before anything moves —
  a guard that sits closer to the write than the eligibility loop did. The operator's editing locus on that route
  is the **top authoring locus**, not the member gate, so the removed inspection was not standing where the edits
  happen.

So `verifyDeliveryCandidateCheckout` and everything it needs — `inspectCheckout`, `checkout-dirty`,
`checkout-moved` — all stay live for the review-gate caller. **What this deliverable removes is the mutation
path's use of the verifier, not the verifier.** Candidate drift is not left uncovered either: the close's own
final loop re-observes every member ref after the verification loop would have run, and D2 keeps members in that
loop while narrowing only the protected-base entry.

**What the eligibility close validates afterwards is purely mechanical, and already substantial:** the fresh plan
read against the snapshot's plan identity, revision, and digest; lifecycle-path resolution and the unchanged-paths
comparison across both the lifecycle and regenerable sets; per-member lifecycle revalidation; and everything D2
adds — the live protected-base re-observation, the per-member authored-overlap guard, the independent chain-base
refusal, and normalized completeness. The close holds no verification role at all, which is why removing its only
verification operand leaves it coherent rather than hollowed out.

**The reconcile seam surfaces the applicability decision it currently discards.** The substrate criteria 2 through
5 need already exists and delivery already reaches it: projecting an effective Candidate target does not stop at a
blocked currentness but derives structural contribution endpoints and a proof, returning either a
machine-recognized current target or a fully composed decision carrying the `covered | targeted-check | changed`
choices, its offer and prompt text, and its projection and residual digests. The defect is the delivery handler's
result mapping — the typed base reconcile collapses every non-current effective state into one opaque
`candidate-not-current` refusal, discarding all of it.

**Four delivery read sites, three dispositions.** The typed base reconcile arm takes the port-contract change,
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

**D6 also pins the unpinned operand** in the member lifecycle-contribution revalidation that D2 leaves standing
(§ D2, Residual B) — a one-token change, routed here because D6 touches that comparison anyway.

### Workflow surface

The deliverables above change what the operator does, so `deliver-stack.md` is in this work unit's owned surface:
shipping the verbs without it leaves prose instructing the operator to perform what the verbs now perform — the
redundant-ceremony class this work unit exists to remove. Each deliverable that changes the operator's steps
carries its own prose edit, so verb and prose land in the same member and the same review.

- **D2's member** carries the removal of the per-member gate operand, which is a **section rewrite rather than a
  few stale sentences**: roughly ten instructions across authoring, gate execution, and the mutation verb, the
  hand-composed `gateResults` payload block, and the operand on two CLI request shapes. It includes the
  instruction binding per-member review and disposition to that run, and the post-interruption instruction to
  rerun the candidate gates before re-invoking the mutation verb. Where per-member checks run instead is stated in
  `strategy-integration.md` § Delivery Shape and Landing Window, not restated here.
- **D4** replaces § Prepare private delivery candidates' per-member cut narration — recording each authored cut at
  its returned private candidate ref and matching detached gate path — with the constructor invocation, and adds
  the construct step ahead of private review in the sequence the section already describes.
- **D6** drops § Validate and publish's exact Tier 2 result admission, and states the attestation read that
  replaces it.

This is the procedure substrate's own case rather than an exception to it: a mechanics-narrating line no verb
covers is a verb-gap signal, and these deliverables supply the missing verbs (verbs-over-mechanics); the
hand-composed result block is prose moving data the CLI already holds (if the CLI can compute it, the CLI computes
it); and the replacement steps render precomposed result text rather than new prose templates.

## Alternatives & Rationale

**Two direction-specific builders, rejected.** Initial authoring and bound correction are opposite directions, but
they already share pair creation and the direction is decided by the predecessor relation the preflight must read
anyway. Two builders would duplicate the preflight and re-create the same collapse from the other side.

**Extracting the reconstruction duplication here (the former D7), routed out.** Its stated justification was that
the construct/publish split is what D4 needs regardless, with D4 consuming the construct half alone. **D4 consumes
nothing of it.** The bound route reaches top adoption, while the duplication is on the absorption side — and D4's
member construction reaches neither, because every existing absorption primitive builds **tops** under a fixed
two-parent shape while D4 builds members with their own parent, message, and byte-exact authorship.

What survives is a real pre-existing defect: the absorption is written twice, in the library and inline in the
provider refresh adapter, with byte-identical commit and reflog messages, and only the library copy carries the
guard refusing delivery-namespace tops. Both call sites are on the provider-refresh path, which § Non-Goals
disclaims, and touching published-side machinery would put this work unit's own stacked landing in the blast
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

**Trust boundaries.** Publication reads the work-unit attestation; it does not produce one, and reading it grants
no review clearance, no check success, and no merge authority. The eligibility close re-prepares fresh and compares
coordinates itself rather than trusting a supplied result — which is what it already did, minus two operands that
were never independent witnesses: a gate-result list and the mutation path's checkout path, each supplied by the
same caller as the snapshot it was checked against. What the close trusts about the protected base afterwards is a
**pinned observation** of the recorded head rather than the current base: the narrowed loop no longer watches the
base ref, and the pinned check above proves the recorded commit still resolves to the recorded tree. The reconcile
seam's correction widens what an operator is _shown_, never what they may authorize: the choices, texts, and
digests it surfaces are the same ones the review gate's doors already compose, and the authority to select among
them stays exactly where it is. Terminal integration retains its own
current checkpoint evidence and exact-head approval.

**Performance and cost.** The constructor's object work is sub-second per member. It does place a detached
worktree per member, whose cost § Disk lifecycle accounts for rather than waiving; nothing else it does carries a
material cost. The rebuild baseline to beat is the measured ~38-minute three-member rebuild,
almost none of which was the rebase itself, so the constructor's value is in the preflight and the evidence carry
rather than raw Git speed, and it is not claimed to collapse that figure. Removing the per-member Tier 2 pass
removes the dominant term in the prepublication window outright.

**Disk lifecycle.** The prepublication window **does** hold a checkout per member, because the pair primitive is
atomic and the review gate reads the checkout half (§ D4). The accounting is therefore owed and is stated rather
than waived: measured on one live three-member plan, the gates total 671M, of which 148M in the largest is a
dependency tree a Tier 2 run deposited. Removing the per-member run removes that deposit, leaving roughly **83M of
checked-out working tree per member** held from construct until reap — so this work unit reduces the window's disk
footprint substantially while not reducing it to zero. The residue reaper already owns the bound-correction pairs
and is sized for them; what changes is that the unbound route now creates pairs too, which is why the pair contract
and the reaper's `candidate-gate-mismatch` refusal are load-bearing. Reaping the malformed gate directories already
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
`gateResults` operand at the three seams that drop it **and** the public-failure composer's restated
`requestedHead` at the fourth; the mutation path closing with its verification loop gone and no `checkoutPath` on
its request, on **both** its callers, while the pre-publication review gate still refuses a dirty or mismatched
checkout and the pair coordinator still refuses a dirty gate — with the close's own final loop still re-observing
every member ref; and the reconcile seam
returning a composed applicability decision, with the two sibling read sites still refusing opaquely — the negative
case is what keeps the correction scoped.
**Criterion 7 owns one end-to-end fixture, jointly D2's and D4's.** A three-member chain meets a disjoint base
advance — closing `eligible` with the chain unchanged and no member recut — and then an overlapping reconciliation
that refuses, names the member whose authored paths intersect, and is cleared by a rebuild through the
constructor. It lands with whichever of the two members lands second, since it cannot run until both mechanisms
exist, and it is the only criterion whose check spans deliverables.

D4 must cover a conflict at member N adopting nothing and leaving the previous chain usable, binding converging on
replay through the idempotent pair coordinator, the recut reproducing the same object id when none of its five
inputs changed, author and committer surviving byte-exactly through a non-UTF-8 identity, and the co-authorship
union preserving every author on the range.

**Migration and rollout.** Pre-public-release posture applies: removing the `gateResults` operand, its schema, its
type, and its five refusal reasons, and removing the per-member `checkoutPath` from the mutation request, are
breaking changes to
unpublished project-owned contracts, which this project's posture permits in place — no compatibility aliases, no
migration readers, and development state is cleared or regenerated rather than migrated. The stack lands per the
delivery shape above, with the single-branch fallback recorded up front. The doctrine half lands with it:
`strategy-integration.md`'s two edits, `ADR-035`, and a dated cross-reference amendment on `ADR-034` ride D6 rather
than a follow-on, because the next delivery cut is the sibling this work unit exists to unblock and would otherwise
inherit the retired model.

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
  Nothing routes to it from here and no seam is shared: delivery's prepublication pairs are owned end to end by the
  residue reaper and the pair coordinator, a different family from the frontline path's ephemeral checkout. D4 does
  widen one checkout-observation port — the dirty-status read that collapses to a bare `dirty` — but that port is
  the pair coordinator's, so the widening lands inside delivery's own family rather than crossing the seam.
- `candidate-reroot-recovery-frame` may preserve resumability but owns no applicability decision.
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
9. A `completeness-*` refusal names which side moved and what would clear it, and any refusal that names a remedy can
   have that remedy actually clear it (D3).
10. A clean unbound stack reaches reviewable candidates through one typed authoring verb with no per-member
    hand-authored Git steps; replay converges; and a real conflict stops with its exact member, leaving the previous
    chain usable (D4).
11. A rebuilt member carries its range's net contribution as one commit whose author and committer are its boundary
    commit's byte-exactly and whose trailers carry the range's co-authorship forward, under a subject derived from
    the same identity its request title carries; the contribution proof accepts it against the moved predecessor,
    and rebuilding unchanged inputs reproduces the same object id (D4).
12. Delivery publication refuses a chain that was rebuilt to match an advanced top without re-attestation — the state
    the completeness comparison cannot see — and accepts a content-preserving rebuild whose subject digest is
    unchanged (D6).
13. A non-current effective target reaches the operator with its own remedy at every delivery read site, the one
    undecided arm reaches them with choices rather than a refusal, and no stop-class arm is routed to a remedy that
    cannot clear it (D6).
14. A rebuild blocked by a gate it cannot reset names the dirty paths it observed and separates untracked residue
    from tracked modification, and re-running the same command after the repair continues rather than restarting —
    verified on both the refusal and the continuation (D4).

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

[none] — every settle-able decision is settled.

What remains open is implementation detail, plus **one** named obligation that belongs to execution rather than to
design: D2's demonstration that the per-member guard and the independent chain-base refusal cover the
fabricated-snapshot case the re-scoped comparison no longer catches (§ D2, Residual A). It is stated where it fires
and carries its own verification; it defers no design decision.

Two questions that stood here are **settled and no longer obligations**. Member boundaries: delivery derives none,
it is given them as a caller-supplied operand at the first window and from the persisted member records afterwards
(§ D4) — what remains is the seam carrying the operand across both planning-storage modes, stated there as a design
constraint. And D1's trigger reach: the firing condition was read rather than assumed, its first and fourth clauses
are work-unit-generic, so it reaches the rule's non-delivery consumers as it stands and no trigger widening rides
D1 (§ D1).
