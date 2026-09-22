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

**State:** `re-entered` (2026-09-21, second). D1 and D2 are crystallized in
`spec-delivery-rebuild-continuity.md` and carry the finalization pass's certification. D3, D4, D6, and D7 are
re-opened for derivation.

**Read the two re-entry sections first, newest first.** § Re-entry: what the finalization pass confirmed
supersedes everything below it for D3, D4, D6, and D7. § Re-entry: where per-member verification runs still holds
for the check-placement decision and supersedes the D5 and D6 material in § Decisions and § The deliverable stack.
Nothing below either section has been revised for either re-entry.

**Resolved**

- Where per-member verification runs, what gates publication, what the eligibility close validates, and the fate of
  the gate-result operand (§ Re-entry).

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

## Re-entry: what the finalization pass confirmed (2026-09-21, second)

`create-spec`'s finalization adversarial pass ran as an authored-partition carrier over the deliverable stack —
three scoped reviewers across D1+D2+D3, D4+D7, and D6 plus the doctrine half. Every finding below was verified
against source by the primary before being recorded; the reviewers' reports are advisory and are not the record.
This section supersedes the D3, D4, D6, and D7 material everywhere below it, including in the first re-entry.

**This is the second re-entry, and it is narrower than the first.** D1 and D2 were certified correct and complete
enough to generate a task list from. They stay crystallized in the spec and keep their place as the stack's first
delivery member. What re-opens is D3, D4, D6, and D7.

**`Class` stays `Heavy`.** Every question below composes over existing substrate — ancestry readers, commit-tree
shapes, the plan schema, verbs that already exist. None of it invents a concept absent from the problem domain,
which is the `Novel` threshold.

### The blocker that reverses a settled decision

**The private candidate ref and its detached gate worktree are one pair, and three sites refuse a half of it.**
The spec had the constructor produce refs and place no checkout, on the reasoning that the checkout only ever
existed to run Tier 2 in. That reasoning was wrong, and the substrate says so in three places:

- `residue-reaping.ts` skips a member whose candidate **and** gate are both absent, and otherwise refuses
  `candidate-gate-mismatch` unless both are observed at the same head. A candidate with no gate is exactly the
  refused shape.
- That refusal is fatal rather than advisory: `closeout.ts` returns `blocked("reap-…")` before
  `retireCompletedDeliveryRecords`, so a plan whose candidates were authored without gates cannot close out.
- The correction routing refuses `authoring-candidate-pair-split` on `gateAbsent !== refAbsent`, and the pair
  coordinator in `review-fix-candidate-gate.ts` creates a pair only when **both** halves are absent, refusing
  `candidate-pair-split` when exactly one is.

Nothing deletes the private candidates earlier — `deleteDeliveryCandidateRef` has one caller, the reaper — so
publication does not clear them and the unpaired state persists to closeout.

**The fork to settle.** Restore the pair and drop only the provisioning and the Tier 2 run; or relax the pairing
invariant at all three sites, with each refusal reason re-derived and the relaxation verified; or have publication
reap the private candidates. The first is the smallest and is a return to an already-authored shape, but it should
be chosen on its merits rather than by default.

**A fourth arm, found in source after the fork was written.** The pairing invariant is not a property of private
candidate refs in general — it is a property of the **plan-derived** `delivery-candidates` locator set. A second
private per-member namespace already exists and is gate-less —
`refs/arc/delivery-refresh-candidates/{planId}/{chunkKey}`, minted by `deliveryProviderRefreshCandidateFor` over the
plan's nonterminal members. One reaper run handles both namespaces under structurally different contracts. The
`delivery-candidates` arm enumerates from the plan through `deriveDeliveryResidueLocators` and refuses
`candidate-gate-mismatch` unless both halves are observed at the same head; the refresh arm enumerates the ref
namespace itself with `for-each-ref`, carries no gate at all, deletes each ref individually, and refuses only on its
own observation or delete failure. A ref-only private member namespace is therefore already legal, already swept, and
already closes out. The fourth arm is to mint the rebuilt chain's private members outside the plan-derived locator
set, on the refresh namespace's pattern, where the pairing invariant never binds.

That arm cannot reuse the refresh namespace, which is now settled rather than open. The refresh host enumerates the
whole namespace by `planId` and hands every ref it finds to `cleanup`, which deletes each one — the enumeration
attaches an empty `deliverableId`, so it does not discriminate by member. Any rebuilt member parked there would be
reaped by the next provider refresh as if it were a refresh candidate. The arm therefore needs a genuinely new third
namespace with its own sweep owner and boundary, and the plan-keyed residue locators would not cover it.

**The gate creator is single, and measured.** One site creates a gate worktree — `review-fix-candidate-gate.ts` — and
one site constructs the gate path — `residue-reaping.ts`. The refresh host also runs `worktree add --detach`, but
against `delivery-resolutions/{planId}/{chunkKey}`, a different namespace with its own lifecycle, so it is not a
second gate creator. Nothing in the delivery library, its handler, or the refresh host runs `npm ci` or `npm install`:
ARC never provisions a gate. The dependency tree that appears in a live gate is deposited by the Tier 2 run performed
inside it, which is the cost this work unit is removing.

Measured on one live plan in this repository: three gates for a three-member stack total 671M. One gate is 235M, of
which 148M is the installed dependency tree, leaving **83M of checked-out working tree per member**. So dropping the
Tier 2 run removes roughly two thirds of the per-gate cost and leaves a real remainder that scales linearly with stack
length. "Restore the pair" is not free, and the number to weigh it against is 83M per member held from construct until
reap, not the cost of the `worktree add` call.

**There is no private pre-publication member namespace, so the fork stands.** The tempting reading — that
reconstruction could rebuild the member heads it already owns and mint no candidates — is false.
`refs/heads/delivery/*` is the _published_ namespace: `publishDeliveryMemberRef` creates the local branch and pushes
the matching remote ref as one act, and `rewriteDeliveryMemberRef` advances remote then local under one retained
operation. No path writes a delivery member ref locally without touching the remote, so writing there _is_ publishing.

The complete inventory of `refs/arc/delivery*` is two namespaces — the gate-paired `delivery-candidates` and the
indiscriminately-swept `delivery-refresh-candidates` — and neither is a general private staging area. Before
publication a plan owns no member heads at all. Any design that holds a rebuilt chain on refs before publishing it
must therefore either accept the pairing invariant or mint a genuinely new third namespace.

**This falsifies a premise the spec states as fact, and that correction is owed.** The spec's opening characterization
reads "Before publication the stack lives on ARC-private refs." It does not. That sentence is what makes a private
candidate chain sound like existing substrate this design can lean on, and every argument built on it inherits the
error. Correcting it is not optional cleanup — it changes what the reconstruction is allowed to assume it has.

**What that opens instead is the construct/publish signature.** If construct truly "returns coordinates and mutates
nothing" as the spec states, the rebuilt commits are unreferenced Git objects and no candidate ref is ever minted, so
the pairing invariant never engages — at the price of garbage-collection exposure between construct and publish, and
of the prepared-tree resume flag having nowhere to live. This binds the pair question to the construct/publish split
rather than settling it independently.

**The "prepared-tree resume flag" is not a construct/publish split, which weakens the case for durability.**
`resumingPreparedTree` in `chain-absorption.ts` is a within-operation idempotency guard: when the worktree is dirty,
it asks whether the dirt is exactly the prepared tree a previous run already wrote out, and only then declines to
refuse `worktree-dirty`. It resumes a worktree-mutating step inside one operation; it is not evidence of a designed
pause between constructing a chain and publishing it. The same read shows the absorption primitive mutating both the
working tree (`read-tree --reset -u`) and the top ref, which is the opposite of the "returns coordinates and mutates
nothing" signature D7 assigns it.

**Two things the reversal does not touch.** Provisioning is genuinely separable — the pair needs a gate worktree at
the candidate's head, not a provisioned one, so the per-gate install cost still goes. And the removal of the
`gateResults` operand stands on its own evidence, unaffected by any of this.

### Where the chain lives before publication, scoped (2026-09-21)

Three options, and they are not the same size. **(i)** Construct and publish in one operation with the rebuilt commits
left unreferenced: no namespace, no sweep arm, no refusal reasons, nothing minted and so nothing to reap. **(ii)**
Mint a third private namespace: the ref mechanics are already shared — `rewriteExactLocalRef` and
`deleteExactLocalRef` take a per-kind validity predicate — so this is one regex, one locator deriver, four thin
wrappers, one sweep arm mirroring the refresh arm, two refusal reasons, and handler wiring. **(iii)** Extract a shared
staging substrate now: reconcile gate-paired against ref-only, plan-derived locators against namespace enumeration,
and two sweep owners, then re-derive the closeout blocking semantics `candidate-gate-mismatch` feeds — across roughly
ten thousand source lines in six files with about thirty-five hundred lines of directly coupled test, changing live
behavior on the path whose failure mode is a plan that cannot close out.

**The lean is (i), and its justification is not the garbage-collection grace period.** That grace is `gc.pruneExpire`,
which an adopting project may set to `now`; a design that depends on someone else's default is not a design. The
durable property is that the publish path contains no auto-gc trigger at all: it observes with `ls-remote`, writes
with `update-ref`, and pushes — and auto-gc fires only from porcelain that creates objects. That holds under any
configuration.

**The residual is concurrent access, and it is disclosed rather than denied.** Auto-gc runs against the shared common
directory and can be triggered by porcelain in any sibling worktree. Under an adopter configuration of
`pruneExpire=now`, another checkout's commit or fetch between this operation's `commit-tree` and its push can prune
the unreferenced chain. Git documents that hazard for `--prune=now` directly. The exposure belongs to the
configuration that created it; the design's obligation is to minimize the window by ordering construct immediately
before publication with only plumbing in between, and to say so rather than claim immunity.

That yields a hard ordering constraint: **every fetch-bearing observation must precede construct.** `git fetch`
creates objects and is an auto-gc trigger, and the delivery handler already fetches inside its position and
provider-refresh observation helpers. Any of those placed after construct would move the race inside ARC's own
operation rather than leaving it with the adopter's configuration.

**(i) also requires a verb-layout decision that is not yet made.** It holds only if construct runs inside a
publish-shaped verb. D3 currently names a standalone reconstruction primitive and D4 names a close-side
`rebuild-required` reason; if the operator invokes a rebuild verb and then publishes separately, the window reopens
across processes no matter what. The precedent to name is `arc delivery rematerialize` — "Reclose and rewrite one
complete reviewed suffix" — which is already close-and-rewrite within one process. Placing construct there is a D4
change (i) depends on, and it belongs in the option's cost, not outside it.

**One cost cancels out across all three options.** The object-only constructor is D7's refactor and every option needs
it: the existing absorption primitive runs `read-tree --reset -u` and moves the top ref, which serves none of them.
Option (ii)'s line estimate excludes work that (i) also pays, so the comparison is only fair once that is said.

**Partial publication is the case that would argue for (ii), and it appears survivable.** Publication iterates
members; if member k refuses on a stale lease or collision, members before k are published and the rest are
unreferenced objects. The recovery-complete route is to re-construct the suffix from the published predecessor, which
is deterministic from the plan. If the publish loop turns out to assume a resumable private ref for exactly this case,
that is where (ii)'s argument actually lives and the lean should be re-examined.

**The publish loop does not assume a resumable private ref, which closes the last argument for (ii).**
`materializeBoundDeliveryChain` iterates members and derives its resumability from two sources that are already
durable: the Delivery State record, and re-observation of the published ref itself. For each member it compares the
stored ref and head, re-observes, and skips the member when the remote already carries that head; absence falls
through to a re-publish, and a different head refuses. Each member that does publish lands through a persisted
deterministic step.

So a mid-loop refusal leaves the published prefix recorded in Delivery State and observable on the remote, and the
unpublished suffix as nothing but objects. Under option (i) the retry re-enters the same verb and re-constructs that
suffix from the plan and the published predecessor — deterministic input, and the loop's skip-when-already-observed
behavior makes replaying the prefix a no-op. The retry must re-construct rather than resume, because the unreferenced
objects may be gone; that is the disclosed residual doing exactly what it was disclosed for, not a gap.

**Decision: option (i).** Construct and publish run as one operation with the rebuilt commits unreferenced, no private
namespace is minted, and D4 is amended to place construct inside a publish-shaped verb on the `arc delivery
rematerialize` precedent. The concurrency residual under an adopter's `pruneExpire=now` is disclosed rather than
defended against, every fetch-bearing observation is ordered before construct, and the object-only constructor is
carried by D7 as all three options required it.

### What a rebuilt member actually is (2026-09-21)

**Delivery constructs no member commits today.** `deriveDeliveryMaterialization` copies each member's head and tree
straight out of the eligibility snapshot and sets `coordinates.base` to the predecessor's head; materialization points
a ref at that existing commit and publication pushes it. Members are observed cuts of the work unit branch's own
history, not objects delivery builds.

**Every object-construction site in the library builds the top, never a member.** `chain-adoption` emits `commit-tree
top.tree -p top.head -p highestMember.head` under a fixed message, and `chain-absorption` does the same twice more.
All three are two-parent, both parents fixed, message fixed, and all three move the top ref. None of them constructs a
member, and no other site does either.

**So D4's "no new object-construction path" is false, and not marginally.** The primitives it names to compose build
tops. Member reconstruction has no existing implementation to consume, which also means D7's construct half cannot
serve it unparameterized: a rebuilt member needs its own parent and its own message, and the success criterion that
pins both to the absorption shape pins the wrong thing.

**A member is a range, but a recut need not replay it.** `memberContributionSteps` maps a chunk key to a set of
contribution step identifiers, and a member's span runs from its predecessor's head to its own. That made a rebuild
look like rebase work. It is not, because `proveGitDeliveryContribution` already computes the exact tree a recut
needs: `readMergeTreeComposition` with the old predecessor as merge base, the new predecessor as one side, and the
member head as the other, yields the member's contribution reapplied onto the new predecessor. Today that tree is
computed only to verify what an external provider's rebase produced — the `mechanical-reapply` proof accepts when the
reapplied tree equals the provider's member tree.

**So ARC's own contribution contract is tree-level, not commit-level.** The proof compares trees and never inspects
commit count or ancestry shape. A reconstruction that produced one commit per member would satisfy it exactly as a
provider's multi-commit rebase does.

**That reposes the shape question as commit granularity, not ancestry.** **(A)** Squash-recut: compose the existing
tree computation with one `commit-tree <tree> -p <new-predecessor> -m <message>` per member. Small, composes what
exists, and finally makes D4's "composes existing primitives" nearly true — one added call rather than a new engine.
It collapses each member to a single commit, so a published pull request shows one commit instead of the author's.
**(B)** True replay: preserve each member's commit range, which needs a per-commit loop, per-commit conflict handling,
and author and committer preservation. Preserves reviewer-visible granularity and any per-commit review anchors.
**(C)** Two-parent absorption: matches the existing top-side primitives but constructs a merge per member, which
nothing in the codebase does and which does not read as a stack.

**Lean: (A), with (B) as the thing to choose deliberately if reviewer granularity is load-bearing.** The goal this
work unit states is continuity of justified evidence across a rebuild, not preservation of authoring granularity, and
(A) is the only option whose cost matches the deliverable the stack budgets for. What (A) spends is per-commit review
anchors on republished members — comments attached to a commit that no longer exists. Not yet decided.

Open within this: whether replayed commits must preserve author and committer identity as well as message, and what
the exact-member conflict stop looks like when the conflict falls partway through a member's range rather than at its
boundary.

**Authorship reattribution is a defect in every option that uses `commit-tree`.** `RawGitExec` accepts only `cwd`,
`input`, and `objectAccess` — no environment — so a rebuilt commit takes the operator's configured identity. For a
single-author stack that is invisible. Under `team.mode`, where a member's commits may carry several authors, a
rebuild silently reattributes all of them to whoever ran it. Preserving attribution is still expressible through the
existing port, but by writing the raw commit object through `hash-object -t commit -w --stdin` rather than by
`commit-tree`, since the port does carry `input`.

**Industry idiom decides the granularity question against squashing** (recorded as judgment, not as a verified
survey). Every mature stacked-change tool preserves the reviewable unit across a restack: ghstack and spr are
commit-per-request by construction, Sapling tracks successors across rewrites, Jujutsu keeps change identity stable
across rebase, and Graphite restacks branches while preserving the commits inside them. None squashes on restack.
Squashing is a merge-time decision that hosts expose separately. The identity-preservation machinery those tools carry
— stable change identifiers, obsolescence markers, commit metadata — exists precisely because review anchors and
incremental re-review depend on it.

ARC's member is branch-shaped rather than commit-shaped, so the closest analogue is Graphite, which preserves commits
within a restacked branch. Choosing the squash-recut would therefore depart from idiom at an observable cost —
per-commit review anchors on republished members — and would leave unhandled a case the norm covers, incremental
re-review after a restack. That is exactly the divergence trigger the project's own rules name, and it would be
decided once for every adopting project rather than by each of them.

**Revised lean: (B), preserve each member's commit range.** The cost gap is also smaller than first estimated: the
replay loop reuses the same three-way tree computation per commit that the contribution proof already performs, and
the attribution fix it needs is owed under (A) as well. (A) remains defensible only if per-commit review is judged not
load-bearing, and that judgment would be made on every adopter's behalf.

### Member ranges contain base merges, which reframes the shape question (2026-09-21)

Measured against the live plan rather than reasoned about: its members span 25 and 22 commits, and those ranges
contain 2 and 3 merge commits respectively — including a plain `Merge branch 'main'`. This is structural rather than
incidental. `DEV-RULES.ARC` § Rebase scope forbids rewriting a pushed branch to absorb base changes and requires
merging the base in instead, so a work unit of any duration produces member ranges containing base merges by rule.

**That breaks the idiom comparison.** ghstack, spr, Sapling and Jujutsu operate over linear stacks whose unit is one
clean commit. An ARC member is a range that may contain merges. The tools preserve commit identity across restack
because their unit survives a rebase intact; a range containing a merge of the very base that moved does not. The
earlier appeal to idiom compared objects that are not alike, and the conclusion it produced does not carry.

**True replay now has to answer a question it previously did not.** Replaying a range containing `Merge branch 'main'`
must either drop the merge, changing what the member contains, or recreate it with a second parent from a base the new
chain does not descend from. Neither is clean precisely when the base is what moved. Squash-recut is unaffected: the
three-way composition the contribution proof already computes collapses a member's net contribution onto its new
predecessor whatever the range contains internally.

**And the provider already performs this rebase.** `DeliveryProviderRefreshPreparationPort.prepare` takes the plan,
repository, scope and the before-snapshot, and the GitHub adapter behind it shells to `gh stack rebase --upstack
--no-trunk`; ARC then proves the result with the `mechanical-reapply` tree comparison and compare-and-swaps each
member ref. So delivery's existing answer to "the base moved" is that the host rebases and ARC proves the tree. A
reconstruction routed the same way would inherit commit granularity and authorship natively — `git rebase` preserves
both, which the ARC-side `commit-tree` path cannot — and would make D4's promise to compose existing primitives true,
on the provider library rather than on `chain-absorption`.

**The fork is therefore three-way, not two.** **(A)** ARC squash-recut: well-defined under internal merges, smallest,
collapses each member to one commit. **(B)** ARC true replay: preserves granularity but owes an answer for merges
inside a range, and is the largest. **(D)** Route through the provider preparation port as provider-refresh already
does: inherits granularity, authorship and merge handling, and reuses the existing proof — at the cost of binding
reconstruction to provider capability, which a provider-free or local mode would not have. Whether the port's scope
operand can express a moved base is the open question (D) turns on.

### Why member ranges contain merges, examined rather than assumed (2026-09-21)

The append-only rule carries two different rationales in two places. `DEV-RULES.ARC` § Rebase scope says rewriting
published commits orphans SHA-keyed Git notes and forces a force-push. `strategy-concurrent-work` § Append-only until
integration gives the stronger one and calls it the strategy's single hard invariant: once a branch is pushed another
machine, worktree, or teammate may hold it, so rewriting forces everyone into non-fast-forward reconciliation and can
orphan commits that live only on a machine holding the old history.

**The rule holds, and it is not an ARC imposition.** "Do not rewrite published history" is mainstream Git practice
rather than a local convention, so keeping it is alignment with idiom, not divergence from it. Pushing a work-unit
branch early is the precondition that makes the branch shared — it is not the reason for the rule, and it is
deliberate, because a shared pushed branch is what carries a work unit between machines. The notes rationale is the
weaker and more ARC-specific of the two and would soften once operational state moves off-branch; the shared-history
rationale is unaffected by that move, so the rule survives it.

Worth carrying forward: the same strategy already names integration as **the single sanctioned rewrite point**,
explicitly including squash and final rebase. Rewriting is not forbidden everywhere — it is forbidden while a branch
is a shared working base.

### Why the provider route does not replace an ARC-side answer (2026-09-21)

The provider route is better isolated than it first appears: `gh stack rebase` runs in a separate checkout, its
results are fetched back into `refs/arc/delivery-refresh-candidates/*`, head and tree are compared against the
isolated result, and only then does `rewriteMemberRef` compare-and-swap. Nothing is published before it is proved, and
merges inside a member range become Git's problem rather than ARC's.

**But it cannot serve the unbound route.** Provider refresh operates over members that already exist as published
requests — it reads published heads, and a host stack command needs a stack to act on. First-cut reconstruction
happens before publication, where there is nothing for the provider to rebase. So routing through the provider would
leave the unbound route needing an ARC-side implementation anyway, which is the second implementation D4 exists to
prevent. The provider route adds a path rather than replacing one.

Its other costs are real but secondary: it binds reconstruction to one host's stack support, leaving other hosts and
any local or backend-served mode without it, and it binds correctness to external semantics ARC does not control. That
last one is already evidenced in the adapter, which seeds a ref's reflog twice to work around `gh stack rebase
--upstack --no-trunk` using `merge-base --fork-point` for the first dependent.

**So the ARC-side shape still has to be chosen, and it has to work where ranges contain base merges.** That points at
(A), the squash-recut, on structural grounds rather than cost: it is well-defined whatever a member's range contains,
it composes the tree computation the contribution proof already performs, and the granularity it gives up is
granularity that true replay cannot faithfully preserve across a moved base anyway.

### Decision: squash-recut, under the derived-presentation principle (2026-09-21)

**Delivery already does not preserve a member's commit graph, so the squash-recut introduces nothing.** The adapter
invokes `gh stack rebase --upstack` with `--no-trunk` on a dependent suffix and no other flags — in particular no
merge-preserving flag — so the provider rebase linearizes each member range and drops the base merges inside it.
(Inferred from the invocation and from ordinary rebase semantics rather than observed against a live stack; the
adapter's own workaround for `merge-base --fork-point` behavior is consistent with a plain rebase.)

The proof agrees from the other side, and this is the stronger evidence. `proveGitDeliveryContribution` accepts when a
single three-way composition — old predecessor as merge base, new predecessor against the old member head — equals the
member's tree. ARC's definition of a correct rebase is therefore tree equality against a squash-equivalent
reapplication. **The contribution contract already treats a member as a net contribution rather than a commit
sequence.** A constructor that emits one commit per member satisfies the contract exactly as the provider's result
does.

**The principle that makes this coherent: the work-unit branch is the shared working history, and a member request is
a derived presentation of it.** Append-only governs the shared base — where it is mainstream Git practice and where
`strategy-concurrent-work` places it — while presentation branches are regenerated and force-updated, which is what
`rewriteDeliveryMemberRef` already does under `--force-with-lease`. This is the stacked-change idiom rather than a
departure from it: ghstack regenerates its requests from source commits and force-pushes them, and Graphite
force-pushes on every restack. The earlier reading — that preserving commits across a restack is the norm ARC would be
breaking — mistook the tools' _source_ model for their _presentation_ model.

**The cost, stated rather than waved past:** a member's request shows one commit after a rebuild, so review comments
anchored to a specific commit do not survive one. That is the same cost ghstack and Graphite users accept, and the
full authored history remains on the work-unit branch, which is the artifact that keeps it.

**The unbound route is also why one implementation covers both.** Provider refresh needs published heads, and the
unbound constructor produces objects for members that do not yet exist as refs — so there is no provider-side rebase
to prove against, and `proveGitDeliveryContribution` would have no `after.member` to compare. ARC-side construction is
forced there rather than chosen, which is what makes D4's single-implementation premise hold instead of merely assert.

### Where member boundaries come from (2026-09-21)

**Delivery derives no boundaries; it is given them.** `prepareDeliveryEligibility` takes `candidates: { deliverableId,
ref }[]` as command input. It checks count, order, and uniqueness against the plan, refuses `direct-delivery-ref` if
any candidate points into `refs/heads/delivery/`, then observes each ref live. The boundary set is a caller-supplied
operand at the first window, exactly as D4 already says it should be at the constructor.

**Once materialized, the boundaries are durable.** Delivery State persists a member record per deliverable carrying
its ref and coordinates, which is what the publish loop compares against when it decides a member is already
published. So after first materialization a rebuild has the member heads it needs from state, without re-deriving
anything.

**And the deleted authoring snapshot is not the blocker the finding set took it for.** A member's span is fully
determined by its predecessor's head and its own — `coordinates.base` is exactly the predecessor head — so the commit
range is recoverable from two heads. `memberContributionSteps` records which contribution steps composed a member,
which is authoring provenance rather than the partition a rebuild needs. Losing it costs the ability to explain a
member's composition, not the ability to rebuild one.

That retires the three options the finding set framed as the real choice — persisting the partition in the
digest-sealed plan, retaining the authoring snapshot, or deriving boundaries at construct time. None is needed.
Boundaries stay an input, supplied at first cut by the same caller that supplies prepare's candidates and read from
Delivery State thereafter.

**The remaining obligation is the seam, not the source.** The terminal member sits apart from the stack because
planning artifacts ride the work unit's own history and have to be carried somewhere; that is interim, and it changes
once operational state materializes off-branch. In-repo planning Markdown stays a supported mode rather than becoming
a legacy path, so the boundary operand must reach the constructor through one seam that serves both modes — the same
discipline D4 already states for the lifecycle exclusion set, and for the same reason: the storage move should be a
filter swap, not a rewrite.

### The rest of the confirmed set

**The bound route's mechanism runs backwards.** `arc delivery authoring rematerialize` takes
`requestedHead: selected.coordinates.head` — the **published** member — and compare-and-swaps the private candidate
toward it, with `beforeHead` read live off the candidate ref. The spec's ordering, "rebuild the suffix from the
corrected top, then resume rematerialization," would have the verb rewind the rebuild it just performed. The two
run in opposite directions over the same ref. The spec also never names which correction route it means; the
routing splits `provider-refresh` from `terminal-authoring`, with different loci, and neither string appears.

**Two verbs were conflated, and it matters for which operand survives.** `arc delivery authoring rematerialize`
prepares one member's pair through `observeDeliveryReviewFixCandidateGate` and never calls
`verifyDeliveryCandidateCheckout`. `arc delivery rematerialize` — "Reclose and rewrite one complete reviewed
suffix" — loops `verifyDeliveryCandidateCheckout` over **every unlanded member**. Any argument about where the
per-member checkout operand survives has to name which of the two it means.

**The rebuilt member's commit shape was never stated.** The primitive D4 is told to consume emits a fixed
two-parent absorption merge under a fixed message, and D7's split parameterizes neither parents nor message while
its success criterion pins both. Meanwhile the probe D4 must retire models a recut as single-parent cuts, and D4
itself forbids importing newer base-only bytes. Whether a rebuilt private member is an append-only merge carrying
the old chain's ancestry or a fresh single-parent cut decides what D4 invokes, whether D7's construct half can
serve it unparameterized, and whether "no new object-construction path" is true at all.

**First-cut member boundaries have no surviving surface.** The plan member carries intent and no content
partition; the commit-level boundaries live only in the composition projection's `memberContributionSteps`, fed
from the authoring snapshot — and composition deletes that snapshot on completion. The surviving `taskIds`
projection is lossy and one-way. So this is not "confirm which surface supplies boundaries"; the real options are
to persist boundaries in the digest-sealed plan, to stop deleting the snapshot, or to derive them at construct
time from the live top's history. Each is a design decision with downstream cost, and this is the headline path of
the goal about a clean unbound stack, not edge residue.

**The refusal-direction mechanism cannot produce direction.** The normalized-tree comparison partitions paths into
dropped, invented, and mismatched — which paths differ, never which side moved. A modified path lands in
`mismatched` whichever side moved it, and both cells the deliverable cites as its motivating defect produce
exactly `mismatched`. Carrying the partition forward reproduces the same tie with more fields. The premise behind
the port widening is also false: direction needs an ancestry reader rather than a tree reader, and `readAncestry`
is already in the eligibility dependency interface and already wired at both relation call sites. Separately, the
correction direction's remedy is the close-side `rebuild-required` reason the spec assigns to D4, which the
deliverable's dependency column does not record.

**What the attestation read actually catches is the complement of what the spec claims.** `publish` re-derives its
snapshot from live refs, so the normalized-completeness comparison already refuses when the branch advanced and
the chain was not rebuilt to match. The state only the attestation read can see is the other one: the operator
advances the branch **and** rebuilds the chain to match it without re-running attestation — completeness then
matches and every mechanical check passes. Stated as it is, the deliverable's success criterion is satisfiable by
the pre-existing refusal, so a test written to it passes whether or not the read was ever wired.

**The effective-target projection is modeled as two-state and has eight non-current arms.** Only
`decision-required` carries choices and offer texts; `changed` and `staged-change` carry none. Taken literally,
"surface the projection's own typed result" turns the stop-class arms into non-refusals, contradicting the carried
criterion that unavailable, unbounded, stale, or unrecognized transitions stay conservative. Taken narrowly it
contradicts the criterion promising that **any** non-current target reaches the operator with choices and texts.
Which arms map where is a masked decision.

**"Three delivery read sites" is four.** `repository-entry.ts` collapses the same projection into `non-current`,
and its consumer turns that into a demand to re-run full work-unit verification — which is what the carried
criterion about never forcing an unexplained full reset at a lifecycle seam forbids. It sits at the same lifecycle
position as the reconcile arm and is currently invisible to the scoping argument.

**The direction-decider D4 names carries no signal.** The predecessor relation relates the **first member** to the
**protected base** and reads no member-to-top ancestry. The probe whose retirement gates D4's landing moves only
the top locus, leaving that relation identical to the healthy case. An operand that would discriminate is named
nowhere.

**D7's stated obstacle is not the real one.** The primitive does not bind its exec — it takes one as an ordinary
input, and the handler already supplies a cwd-scoped exec per call site. The genuine obstacles are larger: a port
mismatch between the library's byte-oriented raw exec and the adapter's string-oriented injected exec, and a
construct/publish coupling carried by the prepared-tree resume flag, which the spec's "returns coordinates and
mutates nothing" signature has nowhere to put. The dogfooding exposure the spec accepts for this deliverable is
only as good as that obstacle analysis.

### Settled, and not re-opened

D1 and D2 were certified against source in detail: the six coordinated parts, the later-member overlap gap, the
`chainBase` invariant, the misattributed-member hazard, both residuals, and the fixture obligations all hold. Four
in-spec corrections are owed and need no derivation:

- Narrowing the close's final ref loop removes the only integrity check on the recorded protected base, whose tree
  the close still consumes as authoritative for non-regenerable lifecycle paths. Either pin it by observing the
  recorded head and comparing trees, or record the loss and correct the trust-boundary sentence.
- The six-part list never says whether the re-scoped overlap operand replaces the recorded relation or adds a
  second read; the close's chain-base equality is apples-to-apples only if both relations are computed over the
  same operand.
- The normalized-completeness port has seven implementers, not the three the spec names.
- Every documentation destination names a file with two byte-identical copies and no stated edit direction. The
  first re-entry settled this — framework content changes go through the package source and sync outward, never
  the reverse — and the spec dropped it. It applies to the strategy and to the delivery workflow alike, and the
  new decision record is project-internal and unmirrored, so the shipped strategy cannot reference it.

Two further corrections belong to the re-opened half and are recorded here so they are not lost: the typed-crossing
rider edits the singleton integration checkpoint, a module the spec assigns to a sibling work unit under a
sequencing constraint the delivery shape says no member carries; and the deliverable that removes the per-member
gate run leaves four sentences in the delivery workflow ordering the operator against an act that no longer
happens, including the one binding per-member review and disposition to it.

### Open for this re-entry

1. The candidate/gate pair fork above.
2. What shape a rebuilt private member's commit takes, and what that makes true of the construct/publish split.
3. Where first-cut member boundaries come from.
4. How the bound correction route reaches the constructor, given that the rematerialization verb targets the
   published head.
5. What names refusal direction, and where the close-side rebuild reason gets its discriminator.
6. What publication's attestation read is actually for, restated around the state it uniquely catches.
7. Which arms of the effective-target projection reach the operator as a decision, and which stay refusals —
   including the fourth read site.
8. Whether the construct/publish split survives its real obstacles at the size the stack budgets for it.

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

**An ADR is authored here.** `ADR-034` owns delivery landing timing. Its decision batches merge acts and says
member review and checks "settle incrementally" — a contrast with batching that never locates checks relative to
publication. So it decided when members _merge_ and left where their checks _run_ undecided. Nothing else records that choice
either: the per-member pre-publication gate appears to be "verify before publish" inherited from the singleton
lifecycle and generalized to every member of a stack without a recorded decision. This work unit authors that
decision rather than inheriting it further.

### What this changes in scope

Stated as of the settled re-entry — the resolutions below refine what the decision alone implied.

**Out:** D5 entirely; D6's `delivery/gate-results` namespace, its per-gate recording verb, the gate-identity digest,
and the run-attribute field group. Gate provisioning inside the constructor goes with them, and with it the
per-gate provisioning cost, the disk-lifecycle question, and the gate-removal arm of the no-partial rule. The
`gateResults` operand goes at all three seams that take it, and `CandidateGateResultSchema`, the
`DeliveryCandidateGateResult` type, its validator, and the validator's five refusal reasons become unreachable with
it. Goals 3 and 4 retire.

**Unchanged and already crystallized:** D2, D3, D4, and D7. The chain still has to be rebuildable through one
typed operation, the eligibility close still has to stop refusing on non-covered base movement, refusals still have
to name a direction, and chain reconstruction still has to have one implementation. None of these depend on where
gates run. D1's rule is unchanged and better motivated than before, but its restrictive half loses one of its two
named fire sites when D6's gate-result seam goes.

**Still owed regardless, and not dissolved by this decision:** the Candidate applicability obligations behind
success criteria 2 through 5. Those concern review evidence and Candidate currentness, not Tier 2 gate results, so
they survive the re-entry intact. The pass left them resting on a direction-level paragraph naming no mechanism;
the trace below settles what they actually require, and it is narrower than the pass assumed.

**In:** publication reading the work-unit Candidate attestation; the reconcile read site surfacing the composed
applicability decision rather than flattening it; `strategy-integration.md` § Publication Boundary gaining its read
clause and § Delivery Shape and Landing Window splitting review from checks; `ADR-035` plus a Tier 2
cross-reference amendment on `ADR-034`; the `deliver-stack.md` edits that follow from removing the gate-execution
and gate-result steps; and the goal and success-criterion renumbering.

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

### Resolved: what the eligibility close validates

**The `gateResults` operand is removed and nothing replaces it.** It reaches three seams — `eligibility close`, the
prepare arm's optional revalidation, and `publish` — and all three drop it.

Its validator refuses on five reasons, and decomposing them shows why none survives. `duplicate-gate-result`,
`missing-gate-result`, and `reordered-gate-result` are well-formedness of a caller-supplied list: they exist only
because the list exists, and are vacuous without it. `gate-result-failed` is the verification evidence this work
unit relocates. `gate-result-stale` binds each result to its member's exact head and tree, which looks structural
but is not — the snapshot and the results both arrive from the same caller, so the pair never witnessed anything a
caller could not fabricate together. Removing it costs no anti-fabrication property because it never held one, which
is consistent with what the source already shows: the snapshot is an ephemeral mechanical value, never a persisted
authorization token.

**What remains is a purely mechanical close, and it is already substantial.** The fresh plan read against the
snapshot's plan identity, revision, and digest; lifecycle-path resolution and the unchanged-paths comparison over
both lifecycle and regenerable sets; per-member lifecycle revalidation; and everything D2 adds — the live
protected-base re-observation, the overlap guard on that fresh relation re-scoped to the final candidate, the
independent chain-base refusal, and normalized completeness.

That division is the right one. The close is a mechanical eligibility gate over chain structure; verification enters
once at publish by reading the work-unit attestation, and again after publication as the published requests' own
checks. The close holds no verification role at all, which is why removing its only verification operand leaves it
coherent rather than hollowed out.

**Removal scope.** `CandidateGateResultSchema`, the `DeliveryCandidateGateResult` type, the validator, and its five
refusal reasons all become unreachable and go with the operand.

### Resolved: the ADR stands alone, with a cross-reference amendment on ADR-034

**A new record rather than a supersession.** `ADR-034` decides to make agentic review the primary lane and to land
ordered delivery members in one bottom-up, post-publication window. Nothing here touches that: merge timing, the
landing window, the terminal vehicle, the integration interlock, and native stack registration all survive
unchanged. The tier table reserves supersession for reversing or significantly altering the decision, and this does
neither — it decides a different axis the original left unlocated.

**It is not silent on `ADR-034` either, which is why an amendment rides with it.** That record's Decision item 2
reads "member review and checks settle incrementally, but merge acts wait for the `Integrating` window," and its
Context repeats that the chosen window "retains incremental member review and checks; it batches only the merge
acts." The contrast being drawn is incremental-versus-batched, and neither sentence locates checks relative to
publication — which is the gap this work unit fills. Read as a guarantee that every member's checks settle, though,
it sits in tension with member checks becoming the project's configured policy. A Tier 2 amendment is the exact
instrument: the methodology lists cross-references to later records as qualifying, and this adds information
without rewriting what is already there.

**Shape.** `ADR-035: Run Delivery Member Checks After Publication`, at
`adr-035-run-delivery-member-checks-after-publication.md`. It decides check placement; records the alternatives the
external research surfaced and why local per-member gating before publication was declined; states that publication
reads the work-unit attestation instead; and states the accepted consequence that a non-terminal member may reach
the landing window without having been checked in isolation. `ADR-034` gains a dated amendment pointing at it and
noting that its check clause is located there.

### Resolved: goals 3 and 4, and the gate language around them

**Goal 3 retires.** "Gate evidence outlives the session that produced it, and is re-checked against freshly observed
coordinates rather than trusted" exists because the 2026-09-12 incident lost completed gate results when its session
ended. With per-member gates removed there is no gate evidence to outlive anything, and the loss it names cannot
recur. Restating it around the work-unit attestation would be worse than retiring it: that property is already true
of the attestation substrate today, so the restated goal would describe existing behavior this work unit does not
change.

**Goal 4 retires with D5.** "A gate result is attributable to its exact coordinates and to an environment that is
not a sibling worktree's" is D5's goal, and the environment predicate it names is the one the adversarial pass
falsified. With no gate provisioning there is no execution environment left to attribute.

**Goal 2 restates rather than retires.** It was not named in the question but carries the same dependency —
"without repeating member gates whose covered inputs are unchanged, while changed covered inputs, including a
changed gate definition, still prevent unsupported reuse." Its core is D2 and survives; its gate framing does not.
It restates around what the close actually does: disjoint protected-base movement re-observes eligibility and closes
eligible rather than refusing.

**Goal 6 survives unchanged, and is better motivated than before.** The covered-input rule as D1 states it is
generic — a ceremony in the post-execution tail repeats only when an input its earlier result covered has changed —
and never gate-specific. Its surviving instances are stronger than the one it loses: the work-unit attestation that
publication now reads, and the `covered | targeted-check | changed` applicability seam, are both durable records,
where gate results were ephemeral and supplied by the same caller as the snapshot they were validated against.

**One correction inside D1.** Its constraint-versus-doctrine split places the restrictive half at two fire sites —
D2's eligibility close, and "D6's added refusal reasons for the gate-result validation seam." The second no longer
exists. The restrictive half places at D2 and at `DEV-RULES.ARC` § Rule Authority's check-integrity backstop, and
the D6 placement drops.

Goals renumber from six to four.

### Resolved: the CLI-executed gate verb is dropped from this work unit

It entered as a possible enabler for the gate-identity digest, and that digest is gone. Nothing in the surviving
stack needs a machine-resolvable gate command set: publication reads an attestation, the eligibility close validates
structure, and member checks run on the published requests under the project's own policy.

The friction that motivated it is real and outlives this work unit. The Tier 2 command set is a fenced prose block
reached through an explicit passthrough method carrying an override path, and no CLI resolves either surface, so
every ceremony that says "run the gates" spends agent attention rediscovering them. That is a design worth
recording, and squarely in `strategy-procedure-evolution`'s territory, which makes it a work unit rather than an
errand. It routes to the inbox rather than riding here.

### Open for the re-entered half

[none] — every question the re-entry opened is settled above. What remains is re-running `create-spec` over the
re-derived half: D5 and D6 come out, D6's applicability paragraph is replaced by the reconcile-seam correction,
goals and success criteria renumber, and the spec's IMPORTANT callout marking this half re-opened is removed once
the spec carries the settled text.

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
