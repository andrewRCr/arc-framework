# Spec (`detailed` · `RFC`): delivery-rebuild-continuity

- **Origin:** [internal]

- **Purpose:** Make a private delivery chain rebuildable when the base moves under it, and make justified gate and
  Candidate evidence survive that rebuild, so neither initial authoring nor a correction-time recut forces a
  ceremony the covered inputs did not change.

> [!IMPORTANT]
> **Partially re-entered to `draft-design` (2026-09-21).** D1, D2, D3, D4, and D7 are settled and carry the
> adversarial pass's verified dispositions. **D5 and D6 are re-opened for derivation and must not be read as
> settled** — the finalization pass established that per-member verification belongs after publication, which
> removes the window their evidence machinery exists to serve. The same applies to goals 3 and 4, success criteria
> 11 through 13 and 16, their § Alternatives & Rationale entries, and the D5/D6 rows of the deliverable stack.
> `draft-delivery-rebuild-continuity.md` § Re-entry: where per-member verification runs carries the finding record,
> the external evidence, the decision, and what remains open. The Candidate applicability obligations behind
> criteria 2 through 5 survive the re-entry and are still owed.

---

## Introduction / Context

A delivery plan lands one work unit as an ordered stack of members. Before publication the stack lives on
ARC-private refs, its gates run in detached worktrees under the repository's common directory, and eligibility is
**prepared** once and **closed** later — two separate observation windows with a full Tier 2 pass across every
member between them.

Two independent failures are proven from field incidents, and the second consumes the first.

**The chain cannot be rebuilt through a typed operation.** Initial unpublished stack authoring exposes
plan-derived gate locators but constructs nothing: recovery means hand-authoring normalized trees, lifecycle and
Candidate exclusions, commits, leased private-ref updates, and detached gate worktrees. The bound correction route
has the same hole from the other side — the correction controller authorizes a fix on the top authoring locus and
tells the session to cut the affected suffix, but exposes no operation that constructs one, so re-entry dispatches
rematerialization against unchanged private candidates and deterministically refuses `completeness-mismatched`.

**Evidence justified against the old chain does not survive the rebuild.** The eligibility close refuses
`source-moved` on _any_ protected-base movement after the entire window has been proved intact, so disjoint
movement that touches no member path still forces a full re-prepare and re-gate. Gate results themselves have no
home outside the session transcript: the workflow has the operator hand-compose the result list, pipe it to the
close, then supply the same list again to publish. And an authorized prepublication base reconciliation had no
Candidate-applicability route at that lifecycle stage, so attestation called the delta unexplained and demanded a
full new root.

The failures compose. A rebuild is expensive (a three-member, 13-commit rebuild measured ~38 minutes end to end,
almost none of it the rebase), and every rebuild currently discards evidence that a correct observation would have
carried — including two complete sets of three Tier 2 gates spent on a wrong-anchor preflight gap.

Now is the moment because the recovery route that makes a stacked landing safe to attempt
(`delivery-post-landing-conflict-recovery`) shipped 2026-09-19, so this work unit can record a stacked delivery as
its intended shape rather than as a risk. The field incidents, the characterization ledger rows that name this work
unit as owner, and the pinned-probe detail live in `notes-delivery-rebuild-continuity.md`.

## Goals

1. A clean unbound stack reaches exact gate-ready coordinates through one typed operation, with no per-member
   hand-authored Git steps — and the bound correction route reaches the same constructor from the other direction.
2. Disjoint protected-base movement re-observes eligibility without repeating member gates whose covered inputs are
   unchanged, while changed covered inputs — including a changed gate definition — still prevent unsupported reuse.
3. Gate evidence outlives the session that produced it, and is re-checked against freshly observed coordinates
   rather than trusted.
4. A gate result is attributable to its exact coordinates **and** to an environment that is not a sibling
   worktree's, stated so that ecosystems needing no provisioning are not refused.
5. A refusal names which side moved and what would clear it, and a remedy a refusal names can actually clear it.
6. The covered-input rule is stated once, in a surface every post-execution ceremony reaches, rather than
   re-derived per lane.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This work unit owns prepublication delivery authoring and recovery ergonomics, private candidate reconstruction
after an approved delivery-member fix, initial private delivery gates, preservation and reassessment of evidence
while private delivery preparation changes its observation window or exact targets, and stating the covered-input
rule and choosing its surface.

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
- add a configuration axis for the gate execution-environment contract (§ Alternatives & Rationale);
- add a bounded in-call recheck of the protected tip after the target is bound (§ Alternatives & Rationale);
- reap the malformed gate directories already on disk — that is an Errand's, not this work unit's.

**Adjacent owners.** `review-checkout-lifecycle` holds ephemeral review and conflict checkouts. Refusal-remedy
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
D5 follows D6 despite the lower number, and D7 precedes D4 despite the higher one.

| ID | Deliverable                                                      | Depends on | Retires     |
| -- | ---------------------------------------------------------------- | ---------- | ----------- |
| D1 | The covered-input rule, stated in a shared surface               | —          | —           |
| D2 | Eligibility close stops refusing on non-covered source movement  | —          | probe 1     |
| D3 | `completeness-*` refusals carry direction and remedy             | —          | —           |
| D4 | Chain constructor, anchor preflight, `rebuild-required`          | D7         | probes 2, 3 |
| D5 | Gate execution-environment contract                              | D4, D6     | —           |
| D6 | Evidence carry, and the gate-result record that persists it      | D4         | —           |
| D7 | One chain-reconstruction primitive, construct split from publish | —          | —           |

**D1 and D2 land first, as one delivery member.** D2 is D1's first operationalization — the rule says a ceremony
repeats only when a covered input changed, and D2 is the boundary where a non-covered input currently forces the
repetition. They are also the safest first member of a stack this work unit intends to dogfood: neither depends on
the mechanism being repaired, so a delivery defect while landing them degrades the evidence rather than blocking
the fix that makes the rest landable. **D7 lands next** — after that first member and before D4, which depends on
it — so the refactor of published-side machinery never runs as the first member (§ D7).

**Known transient — the D2-before-D6 window, accepted deliberately.** D2 removes the blanket `source-moved` entry
that today forces a re-gate on any base movement, and D6 supplies the gate-identity digest that replaces the half
of that coverage worth keeping. Between D2 landing and D6 landing, a base change that edits the Tier 2 command set
is unguarded: a result gated under the old commands would be reused. **Closing condition: D6 landing.** The window
is accepted rather than closed by reordering, because putting D6 first makes the riskiest deliverable the one that
lands on an unrepaired mechanism — the opposite of the reasoning that selected D1+D2 — and the exposure is a
development-time reuse of gate evidence in a pre-public-release project whose delivery stack is dogfooded by its
own author.

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
placement for the eligibility close, D6's added refusal reasons for the gate-result validation seam, and
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
gate results bind to exactly those coordinates. `protectedBase` moving invalidates nothing inside that function:
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
   base already overlapping a later member when the window opens would be admitted, consume a full Tier 2 pass
   across every member, and refuse at close. That is the prepare-admits-then-close-refuses shape pinned probe 2
   holds as a defect, and D2 must not reintroduce it at another boundary.
5. Re-scope `samePredecessorRelation` to compare `chainBase`, dropping `observedTip` and kind equality.
6. Only then narrow the final ref loop to `[top, ...members]`.

After part 5 the snapshot's `predecessorRelation` field carries provenance plus one surviving close-time equality
target — its chain base — rather than the whole relation it pins today.

**The widened guard must not name a member it cannot attribute.** Both refusals report the _first_ member's
`deliverableId` beside `paths` drawn from the overlap, under a shared detail string saying the movement overlaps
"this delivery member". Once the operand spans the chain those paths may belong to a member the refusal does not
name — a refusal misidentifying its own subject, inside the work unit whose Goal 5 is that a refusal names which
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
later-member overlap when the window opens refuses at _prepare_ rather than after the gates have run; the refusal
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
  **before** returning gate work, so a mechanically wrong anchor cannot consume a full gate cycle before the
  eligibility close rejects it.
- On the bound review-fix route, after the authorized top correction is clean and committed, rebuild the selected
  member and every dependent private candidate from the current public ancestry and canonical member boundaries,
  place their managed gates, then resume rematerialization.
- Emit a close-side `rebuild-required` reason naming the rebuild owed — the shape pinned probe 3 awaits, distinct
  from the prepare-side preflight refusal probe 2 awaits. D4 therefore spans both boundaries.
- Replay converges. Conflicts, dirty or foreign gates, moved authority or public heads, stale authorization, and
  incomplete normalization refuse **without a partial adopted chain**.
- A real conflict stops with its exact member and leaves the old chain usable.

**One locator, two callers.** Every managed gate's path derives from the same locator the reaper uses. The
gate-pair primitive takes `checkoutPath` as a bare non-empty string with nothing tying it to a gates root, and
`residue-reaping.ts` is the only site that composes `<commonDir>/arc/delivery-gates/<planId>/<chunkKey>`. The
guarantee today is the caller's, not the primitive's: the one path that reaches the primitive refuses
`authoring-rematerialize-coordinate-mismatch` unless the resolved locator path equals the requested checkout path.
No malformed gate directory is reachable on current source; the hazard is that D4's new unbound caller would have
to re-derive that same guard, and a caller that omitted it would place a gate permanently unreachable by reaping
with nothing to reject it. Close the class **at the primitive** rather than per caller. This also gives D5 a
canonical gate identity to record provenance against.

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

**Gates are returned provisioned.** The constructor runs the project's configured worktree provisioning on each
gate it places, because "gate-ready coordinates" means Tier-2-ready: a placed but unprovisioned gate defers the
failure to the first Tier 2 run, after the gate already exists, and an unprovisioned detached checkout under the
primary's `.git/` is precisely the resolution D5 refuses. This is the operation's only material cost — the object
work is sub-second per member, while provisioning is about 5.4s and 148 MB per gate at this project's settings.
Projects whose ecosystem needs no provisioning configure none and pay nothing; the contract is stated on
attributable resolution, not on provisioning (§ D5).

**The typed result enumerates per-member disposition.** For every member the result names whether its cut was
**retained unchanged** or **recut**. On success that is what tells the operator which members owe fresh gates —
without it the unchanged-chain arm is unobservable, and D6 has no key for which rows remain valid. On refusal the
result names the exact member that stopped it.

**No partial adopted chain, and the mechanism that makes it true.** Objects first: every member's tree and commit
is constructed before anything is adopted. Object construction has no side effects, so a conflict at member N stops
with nothing to undo and leaves the previous chain exactly as it stood — the exact-member conflict stop above is
that property rather than a second mechanism. Adoption is then one batched compare-and-swap across the whole member
set, each ref carrying its expected old value and the batch applying all-or-nothing; the batched ref-update form
already has a caller in this codebase, used today only to verify leases. A refused batch adopts nothing.

**Gates are placement, not adoption, and their failure is a recoverable stop.** Gates are reconciled per member
after adoption, so a failed placement leaves an adopted ref whose gate is absent or stale. The residue reaper
compares candidate and gate **heads** rather than mere presence, so it refuses that pair — correctly, since the pair
really is inconsistent — and nothing between prepare and closeout re-checks it. That refusal is a stop rather than a
wedge precisely because replay converges: re-running the constructor observes the adopted ref, re-places the missing
or stale gate, and restores the pair. The failure path therefore never deletes a candidate ref whose gate survives,
the typed result names every gate it could not place or remove, and the remedy it names is the replay that actually
clears it.

**What the constructor does not claim.** It does not make tests instantaneous or auto-resolve a semantic conflict —
the measured 38 minutes went largely to semantic conflict resolution after an upstream test-file extraction and to
finding post-cut changes that belonged in specific members. Gate-result carry and bounded re-verification are D6's.

### D5 — Gate execution-environment contract

**The contract, stated ecosystem-neutrally:** a gate result must be attributable to its exact coordinates **and**
to an environment that is not a sibling's. Provisioning is one mechanism for that, not the contract — ecosystems
with global caches or committed resolution need no provisioning at all, and a refusal keyed to "no provisioning
configured" would refuse projects that are already correct.

**Verified at the real path shape rather than argued (2026-09-21).** An unprovisioned detached checkout under the
primary's `.git/` resolved a dependency from the primary's `node_modules` — the original failure reproduced in one
command. Running the configured worktree provisioning in place installed the workspace locally in 5.4s, built the
bundle, and moved resolution to the gate's own tree; the primary's manifest was untouched. The provisioning helper
takes a path and carries no work-unit or branch coupling, so gates reach it unchanged.

**Observed at recording, refused at close — never at creation.** A silently inherited environment is not
observable ahead of time, and the only predicate available at creation is the rejected one. The recording verb
observes it instead, in the gate, and writes a typed provenance value onto the gate-result row. The refusal then
reads the row's own recorded value and needs no fresh observation at close; its fire site is the existing
gate-result validation, with one added refusal reason — the placement a restrictive rule requires, rather than
doctrine alone in a strategy.

**The predicate.** Not "resolved outside its own tree" — shared caches are correct and ordinary across ecosystems,
and that predicate would trip Go's module cache, Gradle's and Maven's home caches, and Cargo's registry. What
actually failed was resolution from **another registered worktree of this repository**: a sibling's build output,
not a shared cache. The recorder resolves the realpath of the dependency root it actually used and tests whether it
falls under a registered worktree other than the gate's own; `scanRegisteredWorktrees` already supplies that
roster, and the gate-pair module already imports it. Nothing in source attributes a resolution today, so this is
**new observation work D5 owns**, not a read of existing behavior.

**Provenance is a closed value:** resolution observed in-gate, observed under another registered worktree, or
**not observable**. Only the middle refuses. The `not-observable` arm is what keeps the contract from being more
exacting than the ecosystem: where a project's resolution cannot be attributed, the row records that and passes.

**Recorder-written only.** The value reaches the validation seam as a run attribute the recorder wrote; a
caller-supplied row carries none and is accepted exactly as today (§ D6).

**Accepted cost.** An unusable result is learned at close rather than prevented at creation, so a gate cycle can be
spent before that is known — the same disposition § Alternatives & Rationale settles for the publication window.
Per-gate provisioning costs about 148 MB at this project's settings, which a project's own provisioning script is
free to reduce, and the contract as stated survives a Tier 2 that runs in CI rather than in a local gate.

### D6 — Evidence carry, and the gate-result record that persists it

**The minimal carry contract already exists and is enforced.** A gate result binds `deliverableId`, `head`, `tree`,
and `status`; validation runs those results against a **freshly prepared** snapshot and refuses only on duplicate,
missing, reordered, stale (head or tree differ), or failed. A fresh preparation that reproduces the same member
head and tree therefore already accepts a prior gate result — the **permissive** half of the covered-input rule is
implemented at this seam. Two things are missing: a caller-side home for the evidence, and a binding for the gate
itself.

**The record: a fourth sibling namespace, `delivery/gate-results`.** The delivery namespace vocabulary is
enumerated in the substrate (`GitCommonStateLocationSchema` constrains the `delivery` root to
`["plans", "state", "authoring"]`), and its inferred location type is what makes a fourth member a
compiler-checked extension rather than a loose addition. The record is **keyed by plan** and carries **one row per
deliverable**.

- **Rows are addressed by `deliverableId`, never by position.** Amendment classification refuses only the
  `landed-*` cases, so an amendment may drop or reorder **unlanded** members while the plan keeps its `planId`; a
  positionally-addressed record would then be read as missing or reordered. Addressed by deliverable, a reorder is
  unobservable, a dropped member leaves an unreferenced row the reap removes, and a member with no row refuses
  `missing-gate-result` — the correct outcome, since that member has not been gated at its current coordinates.
  Existing validation is unchanged by this, which is the point: `missing-gate-result` and `reordered-gate-result`
  are two of the bare refusals D3 exists to retire, and a record that made them fire spuriously would put this work
  unit on both sides of its own charter.
- **The default materializes rows in the current snapshot's member order.**
- **Reaping follows the plan.** `retirement.ts` removes the plan and state records under `closeout.ts`'s
  orchestration; `gate-results` is reaped there too, beside the records it is keyed with.

**Three extraction constraints, each checkable.** Copy the `plans` / `state` pattern rather than `authoring`'s,
which holds its port, adapter, and location literal in one module and would not lift cleanly.

1. Declare the namespace in `GitCommonStateLocationSchema`'s `delivery` enum — the surface that has consumers — and
   decide whether the consumer-less `DeliveryStateNamespace` alias is updated alongside it or removed.
2. Put the port in `ports.ts` with its own closed failure contract, and the git-common adapter in `local-stores.ts`,
   which alone names the location literal.
3. Write plan-keyed through the publisher's **locked read-modify-publish** path, computing new content from
   `current` inside the `update` callback — not the revisioned publish the state store uses, whose
   expected-revision contract would force a retry loop.

Forward extraction is then one new adapter against an unchanged port with no caller edits, and the leak check is a
grep for the location literal outside its adapter.

**The writer is a per-gate recording verb.** Nothing produces a gate result today — `gateResults` appears in source
only as a request operand. The verb runs inside the gate worktree once Tier 2 passes and **observes the member's
head and tree itself** rather than accepting typed coordinates. That retires a procedural-substrate violation as
well as a durability gap: today the coordinates are machine-emitted by a prior verb and the workflow has the
session re-type them into the next request body.

**Run attributes — one field group, not two mechanisms.** Beyond the four covered-input fields, a recorded row
carries what the run itself can attest: the identity of the gate definition that produced it, and D5's environment
provenance. Both are observable only by the recorder, both are checked at the same validation seam, and both refuse
on the same kind of drift.

- **Gate identity closes the restrictive half of success criterion 1.** Nothing in a member's coordinates binds
  _which gate_ ran. The Tier 2 command set is defined in a tracked file that rides the protected base, so a base
  change editing the gate commands touches no member path, yields an empty overlap intersection, and is invisible
  to the relation guard. Today the blanket `source-moved` entry stands in for this check by accident; D2 removes
  it. The row records a **digest of the resolved command set** the gate executed, and validation refuses on drift
  with one added reason.
- **Digest the commands, not the file that holds them.** Scoping this to the file would re-fire the gate on any
  edit to surrounding prose — repeating a ceremony whose covered inputs did not change, which is the first clause
  of the same criterion and this work unit's whole purpose.
- **A caller-supplied row is unattributed.** The request schema is a strict object of deliverable ID, coordinates,
  and status, and both close and publish require it, so a hand-composed list cannot carry a digest or a provenance
  value. Such a row is accepted exactly as today, and neither the gate-identity refusal nor D5's refusal can fire
  on it. This is a deliberate asymmetry, not a hole: the recorder is the only party that can observe either
  property, and an unattributed row is no weaker than the hand-supplied list that is the sole path today.

**Both consumers default, and the default is wired per handler arm.** Publish requires the same list the close
does, and the workflow has the session supply it twice, so a record that defaults only the close leaves the hand-off
unfixed in the second window. Wire the default in the `eligibility-close` and `publish` handler arms — **not**
inside `executeWithFreshDeliveryEligibility`, which already reads an absent `gateResults` as _skip gate validation_
and whose reconcile path depends on exactly that when it passes a `memberOffset`. Changing the shared meaning would
silently start validating a path that deliberately does not. Both verbs continue to accept an explicit operand
exactly as they do today: the record is a **default**, not a replacement.

**A stored gate result is not a persisted authorization token.** The close still re-prepares fresh, and validation
still compares head and tree against the freshly observed member before accepting. The record is an input to that
check, never a bypass of it, and the only trust it carries — a passing status — is exactly the trust the
hand-supplied list carries today.

**Applicability reaches the existing seam.** The substrate to extend is the existing path-treatment, typed-delta,
reducer, evidence-reference, and operator-bound Candidate applicability machinery, across one cohesive boundary. An
authoritative prepublication reconcile or rebuild cause must reach the existing `covered | targeted-check |
changed` authority seam through Candidate currentness rather than degrading to unexplained solely because of its
lifecycle stage.

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
  D7 exists to remove, and enough to make success criterion 14's "one implementation" false. Its provider
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
redundant-ceremony class this work unit exists to remove. Each deliverable carries its own prose edit, so verb and
prose land in the same member and the same review.

- **D4** replaces § Prepare private delivery candidates' per-member cut narration — recording each authored cut at
  its returned private candidate ref and matching detached gate path — with the constructor invocation.
- **D5** adds the recording-verb step that runs in each gate once Tier 2 passes.
- **D6** removes the hand-composed `gateResults` block, in both the eligibility-close window and the publish window.

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

**Provisioning gates by sharing the primary's dependency tree, rejected.** Symlinking or otherwise sharing a
sibling checkout's installed tree would make provisioning free, and it is the wrong shape twice over: the artifact
under test here is the gate's own built bundle, so a shared tree tests the wrong bytes; and the shared root
realpaths under another registered worktree, which is exactly what D5 refuses. The ecosystem's answer to install
cost is a package-manager-level store or cache — a content-addressed store, an HTTP cache, a lockfile-keyed CI
restore — all of which share immutable artifacts rather than a mutable sibling tree, and all of which D5's
predicate deliberately permits.

**Deleting the `source-moved` base entry, rejected.** The close's relation recomputation runs over two snapshot
values, so it is deterministic and observes nothing; removing the loop entry alone would leave genuinely
overlapping movement unseen. Switching `observedTip` to the live tip **alone, without narrowing the comparison that
reads it**, also rejected: that comparison reads `observedTip` first, so every movement — disjoint included — would
refuse `wrong-predecessor`, and the relation kind legitimately changes when the base advances. Taking the live read
and the narrowed comparison together is what keeps a real guard on a fresh observation, which is why the parts land
as one change.

**Four homes for gate results, eliminated on source grounds.**

- `delivery/state` holds **no record for this plan during the window** — publish is where the store read returns
  null and initial binding creates it, so on an initial publication (the exact case this work unit exists to fix)
  there is no state record at close to read. The close does reach that namespace for its `head-already-bound`
  check; what is absent is this plan's own record, not store access.
- `delivery/plans` is **digest-sealed**: the plan digest derives over every field but itself and the close refuses
  `plan-moved` on any drift, so a per-run mutable field cannot ride it.
- The **tracked Candidate record** is wrong twice over — it is a working-tree path, and it is an unconditional
  non-regenerable lifecycle-contribution path compared against the protected base, so every gate-result write would
  trip `lifecycle-contribution` at the next close, on the very tracked tier whose retirement D4 designs around.
- `delivery/authoring` is the wrong **window** rather than the wrong substrate: it carries plan-composition
  material keyed by map, is reached from the composition handler and never the execution one, and composition
  deletes its snapshot on completion — so it has closed before prepare opens.

**A field on the plan record, rejected — and not for contention.** The publisher performs read, modify, and publish
inside one namespace lock, so concurrent gate writers against a single plan-keyed record serialize and never
conflict; the version-conflict failure belongs to the revisioned publisher the state store uses. The real ground is
structural fit: the family already draws this line — `plans` holds immutable plan identity, `state` holds the
mutable execution state that accrues across a lifecycle. Gate results are the second kind, so a fourth sibling
extends an existing distinction while a field on the plan record inverts one. A digest-excluded field also carries
two defects the namespace does not: the digest-checked publish would let a digest-invisible field pass while a
second writer silently clobbers the first, and exact restore acquires an unanswered question about whether
restoring a plan restores or discards its gate results.

**Per-deliverable record names, rejected.** The lock is per namespace, so they would not reduce serialization
either — and they cost a sanitized name (the record-name pattern admits lowercase dotted names while a
`deliverableId` is a `sha256:` digest), a new record-name function, and a new addressed-identity rule, in exchange
for nothing measurable.

**A scratch artifact the operator re-supplies, rejected.** It keeps the evidence agent-typed, readable by nothing
else, and carries its own lifecycle with no owner — the failure shape already recorded against ceremony-created
residue. The record is reaped beside the plan and state records it is keyed with, which is what closes that
objection.

**In-operation plumbing only, rejected.** It would close the case where preparation, gates, and close run inside
one continuous session, but preparation's contract pins the chain _before_ workflow-owned gates run, so the gates
fall between preparation and close by construction, and that window is as long as Tier 2 takes across every member.
One measured incident spent two complete sets of three Tier 2 gates inside such a window. The hand-off must outlive
a session.

**Pre-writing pending rows at prepare and flipping them on completion, rejected** — it adds states and
partial-failure modes without buying anything.

**Digesting the gate file rather than the resolved command set, rejected** — it would re-fire a ceremony on edits
to surrounding prose, which is the failure the first clause of criterion 1 forbids.

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

**A configuration axis for the gate execution-environment contract, rejected.** The originating capture asks for
three acceptable behaviors — resolve from the authoritative source checkout, provision, or fail explicitly — not
for a knob; the earlier "project-configurable" reading overstated the ask. Three reads converge on no axis: the
proportionality flag for speculative capability, the storage direction's axis-explosion test (could this be a
property of an existing axis?), and its rule that workflow logic stays mode-agnostic.

**Reordering D6 ahead of D2 to close the gate-identity window, rejected** — see § Proposed Design, Known transient.

## Cross-cutting Considerations

**Trust boundaries.** The gate-result record is an input to a check, never a bypass of one; the close re-prepares
fresh and re-compares coordinates before accepting a row. Run attributes are recorder-written only, and the
asymmetry that leaves caller-supplied rows unattributed is deliberate and stated (§ D6) so it is not later read as
an oversight. Nothing here grants review clearance, gate success, or publication authority, and terminal
integration retains its own current checkpoint evidence and exact-head approval.

**Performance and cost.** The constructor's object work is sub-second per member; its only material cost is the
provisioning it now performs, about 5.4s and 148 MB per gate at this project's settings, which a project's own
provisioning script may reduce and an ecosystem needing none pays not at all. The rebuild baseline to beat is the
measured ~38-minute three-member rebuild, almost none of which was the rebase itself — so the constructor's value
is in the preflight and the evidence carry, not in raw Git speed, and it is not claimed to collapse that figure.
Namespace writes serialize under one lock, which is what makes concurrent gate writers safe without a retry loop.

**Disk lifecycle.** Gate checkouts are the one surface that could accumulate, and the reclaim path already exists:
member teardown removes each gate with a roster-guarded `git worktree remove` — no `--force`, so a foreign or
dirty checkout refuses rather than being destroyed — and that reclaims the provisioned tree entire, gitignored
content included. Teardown runs **per member as it lands** rather than once at closeout, so peak usage is bounded
by concurrent gates rather than by the plan's length. What this work unit adds is the failure path: a refused
construction removes the gates it placed, and names any it could not (§ D4). Reaping the malformed gate
directories already on disk remains an Errand's, not this work unit's.

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
prepare rather than after the gates have run. **D3 breaks the only executable record of the byte-identity it exists
to destroy** — an ordinary equality assertion, not a pinned observation, holding the authoring and rematerialization
results equal — which becomes assertions on the now-distinct payloads. D3 and D4 therefore touch one test file from
different delivery members, and each landing rewrites only its own cases. D5's surface widens past its criterion's
refusal case to clean creation, re-entry, and different dependency versions across worktrees. D6 must cover the
record-read path, the explicit-operand path, a stale record refused on drift, and the reconcile path's
absent-operand semantics left intact. D7's identity check must reach the adapter's reusable-candidate arm and stay
clear of the library's contained-movement shortcut — that check is what licenses a refactor of published-side
machinery during this work unit's own landing. D4 must cover the batched adoption refusing whole, and a failed gate
placement clearing on replay rather than blocking closeout.

**Migration and rollout.** Pre-public-release posture applies: no backward-compatibility aliases, migration
readers, or data migrations for the new namespace — development state is cleared or regenerated instead. The
namespace is additive and compiler-checked at its enum; the consumer-less `DeliveryStateNamespace` alias is decided
(updated or removed) as part of D6's first extraction constraint. The stack lands per the delivery shape above,
with the single-branch fallback recorded up front.

**Forward compatibility.** The record stays among the code-owned records the repository keeps outside its markdown
surfaces and never joins the managed operational-state document set, which projects markdown rather than holding
delivery evidence. The constraint that guards this is against a **generic evidence store** — an arbitrary
evidence-kind framework with its own vocabulary — not against a fourth sibling in a family that already enumerates
three. The storage direction endorses this shape: it warns specifically against a record that can only exist as a
tracked-tree file (the defect the eliminated Candidate-record home carries), and asks that a write never silently
clobber a canonical that moved — which the locked read-modify-publish writer satisfies by leaving no stale read to
carry a version for. A git-common record keeps the service-optional property, and a namespace inside an existing
tier is neither a knob nor an axis. Authority for what covers what stays with the Candidate machinery and the
applicability assessment. D4's resolver seam keeps the tracked-tier exclusion set a filter removal rather than a
rewrite when operational state moves off-branch.

**Coordination.**

- `evidence-applicability` may consume this work unit's exact base and currentness result at the handoff seam, but
  does not own candidate reconstruction and must not require a broad freeze while private gates run.
- `singleton-integration-continuity` owns the singleton integration tail and disclaims delivery mechanics. Two
  seams: **no implementation overlap** — both write the integration checkpoint from opposite sides, so one sequences
  to land before the other starts implementing, either order; and a **shared remedy-composition surface** — D3 and
  the sibling's host-admission remedy discrimination are the same family, the sibling claims spine ownership for the
  lifecycle-tail half, and D3 stays the delivery lane's instance and cites the spine rather than restating the
  obligation.
- `review-checkout-lifecycle` holds ephemeral review and conflict checkouts, and the execution-environment contract
  D5 instantiates was originally captured against it. The direction is deliberately reversed: that work unit is
  paused mid-planning in a stale checkout, so this one authors the first concrete instance and the general contract
  inherits it on resume. Revising the delivery instance to match a generalized contract is in bounds for that work
  unit.
- `candidate-reroot-recovery-frame` may preserve resumability but owns no applicability decision.
- Keep **Make no-material Frontline follow-up effective across Candidate rerouting** independent unless source
  inspection proves its blocker is the same evidence-target binding rather than merely adjacent vocabulary.

**Residual scope legibility.** The delivery shape narrows a refusal and never a tolerance, so residual scope is
invisible on tolerant results — which is why a checkpoint advisory can read "merge the base before continuing edits
on those paths" on the very result that just admitted a reviewable path. Making the residual scope legible in the
payload is this work unit's design response; which component composes the message is the Errand's.

## Success Criteria

Criteria 1–7 are carried verbatim from the originating evidence-applicability capture. They
predate this work unit's deliverable stack, so the substrate each is validated against is named here rather than
in the criterion: 1 → D2 (the permissive clause) with D6 (the restrictive clause); 2, 3, 4, and 5 → D6, reaching
the existing applicability machinery, with D4 supplying the verified before/after coordinates; 6 → D4's replay and
no-partial-adopted-chain rules plus the publication-window disposition recorded in § Alternatives & Rationale;
7 → the end-to-end case across D2, D4, and D6. Naming the mapping changes no criterion's text. Criteria 8–16 were
authored against this work unit's own deliverables and name theirs inline.

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

8. The covered-input rule is stated once in a surface non-delivery ceremonies reach, and its firing condition
   demonstrably reaches those consumers — verified by reading the trigger, not by asserting the placement (D1).
9. A `completeness-*` refusal names which side moved and what would clear it, and any remedy it names can actually
   clear it (D3).
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

14. Chain reconstruction has one implementation after this work unit: the published-side refresh adapter builds and
    publishes its suffix through the shared halves, producing a tree and commit identical to its previous inline
    path — message and parents included — with existing refresh behavior unchanged (D7).
15. No step in `deliver-stack.md` instructs the operator to perform what a shipped verb performs: the per-member
    cut narration, and the hand-composed gate-result block in both the eligibility-close and publish windows, are
    gone, and the recording step is present (D4, D5, D6).
16. The constructor returns gates that pass Tier 2 without further provisioning, and names each member's cut as
    retained or recut; a construction that refuses adopts no ref at all; and a gate it could not place or remove is
    named in the result and clears on replay rather than blocking closeout (D4).

## Open Questions

[none] — every settle-able decision is settled.

What remains open is implementation detail, plus four named obligations that belong to execution rather than to
design: D1's trigger-reach check (§ D1), D2's demonstration that the fresh overlap guard and the independent
chain-base refusal cover the fabricated-snapshot case (§ D2, Residual A), the surface that supplies member
boundaries for a first cut (§ D4), and the extraction-constraint decision on the consumer-less namespace alias
(§ D6). Each is stated where it fires and carries its own verification; none defers a design decision.
