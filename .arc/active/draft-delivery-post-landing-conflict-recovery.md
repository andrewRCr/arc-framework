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
- **Readiness:** `maturing` — the fundamentals are settled: what the relation is, who consumes it, where the
  unresolved condition lives, and what the recovery shape is. The open items are detail-design within those —
  variant naming, one path-set trade, and how much verification a resolved suffix inherits.

---

## Continuity

### Resolved

- **The two routed captures are integrated.** Both entered the body below; § Retained capture detail keeps the
  success criteria, boundaries, and file pointers that the body does not restate. Nothing from either was dropped.
- **Seven probe rows are owned here**, distributed across three of the characterization's four axes — not the four
  loci the origin captures described. § The failure family carries them.
- **The boundary with `delivery-correction-convergence` is settled on evidence** rather than on the steering map's
  base-unmoved criterion, which does not separate the two adjacent rows. § Boundaries.
- **The ambiguity seam has four verbs, not three**, and the fourth returns a wrong answer instead of refusing.
- **The rebind verb already works.** What is missing is a route to it from the verbs that read the binding.
- **The post-land refusal is correct.** Its defect is the guidance wrapped around it one layer up.
- **Boundary: stays one WU, and not a delivery-plan candidate.** `assess-boundary-fit`, 2026-09-16. The three
  conditions are separable as conditions but not as concerns: public review is a reader in both Axis A and Axis B
  and their fixes must agree there, the purpose above already names all three as one lost route, and the gate this
  work is measured against is satisfied only when all three land — so a cut adds cross-unit coordination and buys
  nothing on the critical path. Axis D alone also sits below the WU-warrant rail; it is a phase, not a sibling. The
  delivery-plan arm is declined for a reason specific to this work unit rather than on sizing: a plan means a
  stacked landing, and this work unit is the shipped post-landing recovery path that the risk gate requires
  _before_ such a landing. Stacking it would run the unfixed machinery to fix the unfixed machinery, with Axis D as
  the failure mode and no route back. Land it single-branch. Re-raise only on a material evidence delta; choosing
  the resolver below is that delta.
- **The resolver fork is settled: one relation-typed read, not two primitives.** Base cardinality above one is
  reachable only when neither revision reaches the other, so Axis B's condition lives inside Axis A's diverged
  outcome. Verified from the definition and confirmed empirically — § Established practice.
- **Axis D's completing input is settled in shape.** No surveyed system feeds a hand resolution back into a
  pinned replay; the resolved suffix becomes a new contribution that re-enters verification.
- **The row set is majority singleton, and the singleton closeout path already compares by ancestry.** Four of
  seven rows are singleton-shaped; the relation is a concept the codebase already has in one place and lacks in
  the other. Adopt it by reader, never by shape. § The failure family — Shape coverage.
- **The unresolved condition is a pending-obligation record, not a phase and not a transition.**
  `pendingReviewFixVerification` is the precedent and the state schema already refuses it unless the delivery is
  idle, so idle-but-owing is a first-class state with a validator behind it. It stores the obligation and nothing
  derived, and binds to exact coordinates as a validity predicate so staleness fails closed. Settled against the
  Owner's criterion: durability is warranted where its absence would make ARC wrong rather than uninformed.
  § The relation — Where the unresolved condition lives.
- **The subject's path set is commit-derived, and the merge-diff mode is load-bearing.** Net has no
  cardinality-safe construction, so this is availability rather than preference; touched is also the less
  movement-sensitive of the two, inverting the trade as it was recorded. Git's default suppresses a merge's own
  diff, which would reintroduce the omission vulnerability this reframe exists to close — and base merges are
  now the named cardinality remedy, so merges are on the path rather than at its edge. `--cc` is the only mode
  that catches a merge-introduced change without inheriting the merged-in base's changes. Verified in a scratch
  repository. § The relation — The subject's path set.
- **What the record carries is settled, and the asymmetry lives in the binding rather than a policy.** Three
  classes: an identity-bound obligation that survives arbitrary movement, an immutable disclosure of what the
  operator was shown, and a disclosure-bound decision that dies exactly when its subject stops being what is
  there. Nothing derived. A resolved suffix inherits nothing positive and needs nothing — mechanical proof
  re-derives and the record carries the judgment. § The relation — What the record may carry.
- **Gerrit's asymmetry and ARC's own standing acceptance rule agree once movement is distinguished from
  change.** The recorded failure — an approved fix revoking the acceptance that authorized it by advancing the
  Candidate — is the Axis A defect one layer up, on a surface carrying an Owner's authority rather than a
  coordinate.
- **The design clears the recoverable-refusal rule, with one scope addition and one remedy it had not named.**
  Closeout's eight-term conjunction owes a reason per term: the relation makes its comparison correct while the
  refusal still cannot report which term failed, and that clause is not separable from the ancestry fix. And
  merging the base in collapses merge-base cardinality to one — a corollary of the dominance proof this draft
  already carries — which turns Axis B's refusals from correct-but-terminal into recoverable by an operation ARC
  already mandates. § Refusal-recoverability audit.
- **The settled fundamentals clear the four project check-docs and two unbuilt designs.** No conflict; three
  constraints adopted — each variant carries a typed remedy action rather than prose, the encumbrance predicate
  feeds the planned typed resume slot rather than paralleling it, and the variant names are controlled
  vocabulary with a definition obligation. § Forward-compatibility check.
- **Native restacking is why the validity predicate needs the relation.** The storage target permits end-to-end
  restacking once identity decouples from branch SHAs; under equality every restack would invalidate every held
  decision, turning redundant ceremony from an incident into a cadence.
- **The obligation composes at the predicate, not the payload.** The two records differ in content and
  staleness semantics and are not established as mutually exclusive, so a single discriminated field would
  impose an exclusion nothing supports. What is genuinely shared is the encumbrance check — already
  hand-enumerated in the same order in `compose.ts` and `retirement.ts` — where a third term added site by site
  would let a missed site report a delivery unencumbered while something is owed.
- **The two halves of the design meet at that predicate.** Checking whether a held decision still applies is a
  bound-versus-observed comparison, which is the relation — so the relation serves the recovery record, not only
  the readers that motivated it.
- **The relation carries six variants, and `rewound` is one of them.** A bound head that descends the observed
  one is Git's _behind_ and `merge.ts`'s `head-contained-by-base`. Fail-closed consumers reach the same verdict
  whether or not it is separated, but the remedy differs — and ARC's one existing hand-derivation already gives
  it a distinct `nextAction`, which is evidence the distinction is load-bearing rather than symmetric.
- **The relation splits into a pure classifier and a thin reader per executor.** Its three consumers share no
  executor shape, and this dissolves the split rather than electing one: the variant logic takes two directional
  answers plus cardinality and is testable without Git, while each consumer supplies a small reader over the
  executor it already has.
- **The relation is extraction, not invention, and it is proportionate.** `scripts/base/merge.ts` already
  derives it by hand in the prescribed layering, separating three of the needed distinctions by remedy.
  `assess-design-proportionality` returned `proportionate` with a scope guard, 2026-09-16. § The relation.
- **Review readiness misses rather than mismatches.** Its member lookup is keyed on the exact observed head, so
  a moved head finds no member and there is no bound coordinate to compare — the relation alone cannot reach
  this reader. The fix is to resolve by the deliverable identity the reader already holds and compare second.
- **Cardinality is a field on the diverged variant, not a variant of its own.** It is reachable only inside
  divergence, and applicability is its only consumer.
- **The six readers are classified, and two of them stop having the problem.** The subject collector and the
  overlap analyzer ask membership questions and answer them with a base-anchored diff; deriving their paths from
  the branch's own commits removes the ambiguity rather than handling it. Three readers want the relation itself.
  § Reader inventory — Membership or content.

### Open

- **Variant naming, and where the definition lives.** The six distinctions are settled and their names are not;
  the nearest candidates are Git's porcelain vocabulary and `merge.ts`'s existing state names. These are
  controlled vocabulary rather than taste — load-bearing terms owing a definition before use, derived from the
  type rather than restated beside it.

### Next

One item remains: variant naming and where its definition lives. Then the readiness boundary, where
`adversarial-review` is recommended — and this draft is squarely the shape that pass attacks well, being
externally-derived reasoning folded across several sessions with several claims corrected only because
something prompted a re-check. Two items owe confirmation before anything emits them: the base-merge remedy's
per-reader applicability, and whether a merge queue's landed head reaches closeout as the request head.

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

A completing input is still owed. What the probe removes is the assumption that operator resolution is that input.

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

## Reader inventory — source-verified

Read from source 2026-09-16, and the arithmetic behind the resolver fork in § Continuity. Every reader resolves its
merge base independently; there is no shared primitive today.

| Locus                                  | Call                   | Disposition                            |
| -------------------------------------- | ---------------------- | -------------------------------------- |
| `git-candidate-subject.ts`             | `merge-base` (no flag) | silent pick — Axis B's wrong answer    |
| `git-candidate-applicability.ts`       | `merge-base --all`     | typed `merge-base-ambiguous`           |
| `git-candidate-effective-target.ts`    | `merge-base --all`     | untyped `throw` — Axis B's fourth verb |
| `base-overlap.ts`                      | `merge-base --all`     | `unavailable / merge-base-failed`      |
| `git-decompose-v3-repository-plan.ts`  | `merge-base --all`     | typed `ambiguous-merge-base`           |
| `git-decompose-v3-retirement-delta.ts` | `merge-base --all`     | typed `ambiguous-merge-base`           |

The untyped throw carries "The Candidate target has no sole base coordinate." — the same string the ledger records
as a blocked obligation's `detail`, confirming the surfaced message is an exception text rather than a result.

The last two rows are outside this work unit's probe rows and are recorded because they change the fork's
arithmetic: the decomposition subsystem independently reached the same read-all-then-refuse shape under a **third**
spelling of the reason code. Six call sites, four dispositions, three spellings of one condition. Whatever is
settled here is settling a repetition ARC already carries, not introducing an abstraction it lacks.

### Membership or content

Classified 2026-09-16 by reading each reader's actual question against the line Git draws in § Established
practice.

| Reader                              | Question it asks                         | Shape                  |
| ----------------------------------- | ---------------------------------------- | ---------------------- |
| `git-candidate-subject.ts`          | which changes are mine                   | membership, as content |
| `base-overlap.ts`                   | do both sides touch the same paths       | membership, as content |
| `git-candidate-effective-target.ts` | which single base coordinate do I record | coordinate identity    |
| `git-candidate-applicability.ts`    | how has the base moved under my baseline | relation               |
| review readiness                    | is the bound head still the observed one | lookup, then relation  |
| closeout                            | is the bound head still the observed one | relation               |

**Two readers stop having the problem.** `git-candidate-subject.ts` selects paths with
`diff --name-only <picked-base> <head>`, and `base-overlap.ts` diffs both sides from one picked base before
intersecting. Both therefore select paths that are an artifact of which ancestor got chosen. A branch's own
changed paths are instead derivable from the commits reachable from it and not from _any_ merge base — the
`--all` form Git already uses for membership — so the selection becomes cardinality-independent and the ambiguity
never reaches them.

**One difference, since settled.** Paths touched by a branch's own commits are not the same set as its net
diff: a path changed and then reverted within the branch appears in the commit-derived set and not in the net
one. For overlap that errs toward reporting overlap, the fail-closed direction. For the subject it is settled in
§ The relation — The subject's path set, which also records why the merge-diff mode is part of the design.

**Three readers want the relation itself** and are the resolver's real consumers — though review readiness
cannot compute one until its lookup is inverted, for the reason recorded in § The relation. The fourth,
`git-candidate-effective-target.ts`, wants a single coordinate to record — and under cardinality above one no such
coordinate exists, so it has to carry the base set or the relation rather than throw for the absence of a
singleton.

`lib/git/ancestry.ts` is the existing ancestry-helper module and already wraps `merge-base --independent`, so a
shared resolver would have a home rather than needing one invented.

**Scope line on the repetition.** The four readers carrying this work unit's rows have observed failures behind
them and are in scope. The two decomposition call sites do not; unifying them would be symmetry rather than a
traced need, so the shared primitive should be _available_ to them without this work unit retrofitting them.

## Substrate: one observation mode, three postures

`terminalAuthoringMovement` already exists and is the nearest thing ARC has to a typed movement classification.
Source-verified 2026-09-16: the _option_ is a two-value union — `allow-append-only` and
`allow-append-only-frozen-request` — set at two handler call sites, while the _fact_ it produces is a record
carrying the deliverable, before and after coordinates, and a publication lease head. The ledger's count of five
observation modes passing the allowance is recorded there and is not re-derived here.

The characterization records that its consumers disagree:

- the position verb passes one value — the allowance makes the movement an observable **fact** rather than
  admitting it, and the verb then refuses on that fact's presence;
- session-init passes none, so the strictest posture is the default for the surface that only reads;
- review readiness and closeout read head equality with no ancestry term at all, so the fact never reaches them.

Three consumers, three postures, three recorded failures. Whether this is the unifying substrate for Axis A — or
for the whole family — is the first open question in § Continuity.

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

### Git already draws the line this design needs, and ARC is on the wrong side of it

`git log A...B` is defined as `r1 r2 --not $(git merge-base --all r1 r2)` — commit-set membership computed
against every base, cardinality-independent by construction. `git diff A...B` is defined as
`git diff $(git merge-base A B) B` — a tree diff against one arbitrary base, cardinality-fragile. Git answers
"which commits are mine" safely and "what content changed" fragilely, and documents both.

`git-candidate-subject.ts` asks a contribution question and answers it the fragile way. Before designing a
cardinality-aware content path, establish which readers are really asking membership questions — those stop
having the problem rather than needing it handled.

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
verification such a contribution inherits — no positive review, with a standing veto surviving. That a conflicted
patch set classifies as `REWORK` follows from the two mechanisms but is not documented as such; treat it as
derived.

`git rerere` is the one mechanism that carries a resolution across a moved base — it fingerprints normalized
conflict hunks rather than commit identity, so it is base-agnostic by construction. It is also local, opt-in, and
consulted only inside Git's own three-way merge; no server-side queue reads it. Recorded as considered and
inapplicable rather than unexamined. Jujutsu's structural conflict propagation is the same note from the other
side: real prior art, single-repository, with no review or landing system built on it.

### Merge-queue composition, confirmed

GitHub's merge queue builds a temporary branch carrying the base plus every queued request ahead of the subject,
and lands that. The landed commit is structurally not the request's own head — which confirms the constraint in
§ Boundaries: under the current equality comparison, a project running that queue would meet
`delivery-member-unbound` on every landing rather than occasionally.

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

**Extraction is also the only available composition.** Ten-odd ancestry helpers are hand-rolled across the
codebase and no two agree on a return shape — `boolean` in `from-branch.ts`, `branch-bounded-notes-export.ts`,
and `in-flight-derivation.ts`; `"ancestor" | "not-ancestor" | "unavailable"` in `chain-containment.ts`;
`"ancestor" | "not-ancestor" | null` in `git-contribution-proof.ts`; an injected predicate port in
`scripts/base/merge.ts`. They also split across three executor shapes: `GitExec`, `RawGitExec` with
`objectAccess: "local-only"`, and the review gate's own injected ports. No existing helper is consumable by all
three relation readers, which is what makes a shared primitive composition rather than new mechanism.

**Four sites already read both directions and derive this relation by hand**, each under its own return type
and vocabulary: `scripts/base/merge.ts` to decide whether a base merge is needed, `in-flight-derivation.ts` to
order two candidates, `push-fetch.ts` to choose between fast-forward and refusal on a notes ref, and
`sync-status.ts` to classify a local ref against its fetched remote. None of them names the thing it computes.
Four independent derivations of one relation is the repetition this design ends, and it is a stronger warrant
than the single-site precedent alone.

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
disagree here specifically — two of them return `false` for a failed read, which reads as "not an ancestor"
and is how an operational failure becomes a verdict.

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
the same two facts, in the order that can tell a stale binding from an absent one. No new selector arm, no
store change, and the existing `delivery-member-mismatch` facts keep their meaning.

Closeout needs no such inversion — `verifyDeliveryTerminalSettlement` already holds the terminal member and
compares its recorded head directly. Its defect is the bare equality inside the eight-term conjunction, which
the relation replaces in place.

### Where the unresolved condition lives

Settled 2026-09-16 against a stated criterion: **durability is warranted where its absence would make ARC
wrong rather than merely uninformed.** A resumed session that reports what is owed and re-derives the rest is
acceptable; one that acts on a stale cached fact is not. The cost to avoid is redundant ceremony, and the
realistic driver is not carelessness — the post-execution tail legitimately runs for days when it waits on an
asynchronous human review, and no session should have to stay open across that.

Both framings in the original capture are wrong, and ARC already carries the shape that is right.

**Not a durable phase.** `activeOperation` is the durable-phase mechanism, and it means _something is running_ —
its `land` arm already carries a `prepared` / `submitting` phase, so the pattern exists and is in use. It is the
wrong home twice over: a days-long wait on a human is not an operation in flight, and an active operation blocks,
so modelling the wait that way would refuse every reader that declines on `operation-active` for the duration.
That is the redundant-ceremony failure arriving by a different door.

**Not a reservation-local transition.** It cannot outlive the session, so resuming re-asks the operator for a
decision they already made. That is the ceremony repetition this work exists to remove, and it is the case the
days-long tail makes ordinary rather than exotic.

**A pending-obligation record, sibling to `pendingReviewFixVerification`.** That field is the precedent and it
was built for exactly this state: it records _what is still owed_ after an operation completes, carries member
identities and nothing else, and the state schema refuses it unless `activeOperation` is null — "pending
review-fix verification requires an idle delivery state". Idle-but-owing is already a first-class delivery state
with a validator behind it.

Its shape is why it satisfies the criterion. It stores no derived fact, so there is nothing to go stale: whether
the predecessor landed, whether the replay still conflicts, and which paths collide are all re-derived on
resumption, cheaply and locally. What survives is the obligation and the human decision behind it — the two
things that cannot be recomputed from Git at any price.

**Staleness fails closed through a validity predicate, not through freshness.** Bind the record to the exact
coordinates the decision was made against, as § Retained capture detail already requires. Those coordinates are
not there to be trusted as current; they are there so that a resumed session can prove the decision still
applies. `boundPlan`'s `planRevision` and `planDigest` are the same predicate in the same schema, and
§ Established practice names the idiom — a conditional precondition, checked at use, refusing on mismatch. A
record whose coordinates no longer match does not mislead and does not silently proceed; it reports that the
decision it holds was made against something else.

**This is where the two halves of the design meet.** That predicate is a comparison of a bound coordinate
against an observed one — which is the relation, and which under today's equality check would read a compatible
advance as a mismatch and send the operator back to a decision they already made. The relation is not only
fixing the readers in § The failure family; it is the mechanism this record needs to tell _moved compatibly_
from _no longer applies_.

**What stays open is how much the record may carry**, and it is the sharp end rather than a detail. Holding the
obligation is safe. Holding the operator's semantic approval is a durable human decision, and ARC has been bitten
there before — an accepted review terminus that later movement silently revoked. Gerrit's asymmetry is the model
already recorded in § Established practice: no positive approval survives a rework, while a standing minimum
score does. Applied here that reads as an approval which does not outlive the contribution it approved, and a
refusal that persists until answered — which is the same question as the new-contribution path's inheritance,
not a second one.

### The subject's path set — touched, and the merge-diff mode is load-bearing

Settled 2026-09-16, empirically. § Reader inventory left this open and framed it as a trade between a safe but
noisier set and a precise but movement-sensitive one. **Both halves of that framing were wrong.**

**Net has no cardinality-safe construction, so it is not an available option.** A net path set is the diff
between a base and the head, which requires exactly one base — the fragile form Git documents and the condition
Axis B is about. The two ways to get a net set without picking arbitrarily are already eliminated in
§ Established practice: agreement across all bases refuses in essentially every real criss-cross, and a
synthesized virtual base commits to an answer a read-only classification must not. Touched is commit-relative
and needs no base at all, being Git's own cardinality-independent membership form. The choice is availability,
not preference.

**Touched is also the less movement-sensitive of the two, which inverts the recorded trade.** Under append-only
movement the touched set only grows — a path entering it never leaves — so a change-and-revert pair moves the
subject digest once. A net set flips the same path in and then back out, moving the digest twice. Confirmed in a
scratch repository: after adding and reverting a path, the commit-derived set retains it and the base-relative
diff drops it. The residual over-inclusion is real but bounded and monotone, and over-inclusion is the
fail-closed direction for a currentness comparison.

**The merge-diff mode is part of the design, not an implementation detail.** Git's default suppresses a merge
commit's own diff, so a change introduced _by_ a merge and present in neither parent is invisible to the plain
commit-derived read. That is the Azure and GitLab vulnerability class this draft already names — changes present
in the branch and absent from the evidence surface — reintroduced by the naive form of the very reframe meant to
close it. It is not theoretical here: this design now names merging the base in as the remedy for cardinality
above one, so branches carrying merges are the path it creates rather than an edge case.

Four modes, measured against both failures:

| Mode               | Catches a merge-introduced change | Keeps the merged-in base's changes out |
| ------------------ | --------------------------------- | -------------------------------------- |
| default            | no                                | yes                                    |
| `-m`               | yes                               | no                                     |
| `--diff-merges=on` | yes                               | no                                     |
| `--cc`             | yes                               | yes                                    |

`--cc` is the only one that passes both, because it reports a merge's changes only where they differ from
_every_ parent — which is exactly "content the merge itself introduced" rather than content inherited from the
side that was merged in. `-m` diffs against each parent separately, so merging the base in makes every base
change look like the branch's own contribution, which would corrupt the subject in the ordinary case rather
than a hostile one.

Record the mode with the reason. A later reader simplifying this call to a plain path listing would silently
restore the omission, and no test that does not construct a merge would notice.

### What the record may carry

Settled 2026-09-16. This is the same question as what a resolved suffix inherits, and it resolves by the
principle the record already runs on, applied one level down: **carry what cannot be recomputed; re-derive
everything that can.** Mechanical proof is cheap and honest to redo. A person's judgment is neither.

Two constraints govern it and they appear to conflict. § Established practice records Gerrit's asymmetry — no
positive approval survives a rework, while a standing minimum score does. ARC's own standing rule runs the other
way: an Owner's acceptance binds thereafter, and ARC may report that the subject moved and what changed but may
not silently revoke, re-ask, or route another metered pass on the strength of that movement alone. That rule
exists because ARC violated it — an approved fix that advanced the Candidate revoked the acceptance which had
authorized it.

**They agree once movement is distinguished from change**, which is what the relation is for. An approval scoped
to content does not survive that content being rewritten; a decision about a subject is not revoked by movement
that leaves the subject intact. The recorded failure is ARC treating any advance as a change — the Axis A defect
one layer up, in a surface that carries an Owner's authority rather than a coordinate. Both constraints are
satisfied by binding each thing to what it is actually about.

**Three classes, three binding semantics, nothing derived.**

| Class          | Binds to                                           | Survives                                                    |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| The obligation | member identity                                    | arbitrary movement; discharged only by being met            |
| The disclosure | exact coordinates, trees, and conflict paths shown | immutable once written                                      |
| The decision   | the disclosure                                     | exactly while the disclosure still describes observed state |

**The asymmetry lives in the binding, not in a policy.** The obligation is identity-bound, so no movement
retires it — it is owed until something discharges it, which is the fail-closed signal Gerrit keeps across
arbitrary change. The decision is disclosure-bound, so it dies precisely when the thing it approved stops being
what is there. Neither needs a rule deciding what survives; the binding decides, and a reader can check it.
`pendingReviewFixVerification` is already the identity-bound half of that shape in ARC today.

**Why persisting the decision is safe here**, stated as the guards rather than assumed:

- It is scoped to the disclosed conflicted contributions only, with mechanical proof continuing for every other
  movement — § Retained capture detail's obligation, and the reason the approval can be narrow.
- It binds to the disclosure rather than to the member, so it cannot widen. A resolution that later touches a
  path outside the disclosed set is not covered, structurally rather than by a check someone must remember.
- It authorizes a conflict resolution and nothing further. Merge to integration remains its own explicit
  authorization and is not reachable from here · `[invariant]`.
- It is written at the moment the operator decides, together with what they were shown, and never reconstructed
  afterwards. A record that ARC composes later asserting an approval happened would be ARC attesting its own
  output; the disclosure is what makes a person the witness instead.

**What the resolved suffix inherits: nothing positive, and it needs nothing.** The survey already established
that no system feeds a hand resolution into a pinned replay — the suffix becomes a new contribution that
re-enters verification. Mechanical proof re-derives at that point, cheaply, and the human decision does not need
to be inherited by the artifact because the record carries it. The obligation stands until that new contribution
discharges it. This is the minimal shape rather than a chosen one: the alternative that carries less is
re-asking the operator on resumption, which is exactly the redundant ceremony this work unit exists to remove,
and the alternative that carries more would have the artifact inherit a verification it did not earn.

**The refusal this creates answers the recoverability rule.** When the disclosure no longer describes observed
state, the record must report which coordinate moved and how — the relation is the vocabulary — and route to the
new-contribution path, re-asking with a fresh disclosure. Re-asking there is correct rather than redundant: the
content genuinely changed. The ceremony being eliminated is re-asking when nothing relevant did.

### What composes with the existing obligation, and what only rhymes

Asked because this work unit adds the second instance of a shape ARC already has, which makes the duplication
ours rather than inherited — the test § Reader inventory applies to the decomposition call sites, run from the
other side. Two candidates, and they separate.

**The payloads do not compose.** `pendingReviewFixVerification` carries member identities and nothing else;
a suffix-resolution obligation needs the coordinate predicate and the conflict paths, because it is the one
that can go stale. They are owed to different parties, too — one obliges ARC to re-verify, the other obliges
a person to decide. More decisively, **nothing establishes that they are mutually exclusive**: a review fix may
be awaiting verification when a predecessor lands and the suffix conflicts. A single nullable discriminated
field would impose an exclusion no evidence supports, and `activeOperation`'s union is not a precedent for it —
an operation genuinely is one-at-a-time, and the schema says so. Unifying would also convert roughly twenty
direct field reads across eight modules to abstract over one built record and one not yet authored, which is
where a premature abstraction gets its shape wrong.

**The encumbrance predicate does compose, and this change is what makes it bite.** Asking "may this delivery
proceed, and if not what holds it" is already hand-enumerated rather than shared:

```text
if (state.activeOperation !== null)                return refused("operation-active");
if (state.pendingReviewFixVerification !== null)   return refused("pending-review-fix-verification");
```

That exact pair appears in `compose.ts` and again in `retirement.ts`, in the same order with the same two
terms, while `entry-inspection.ts` reads the second term to _route_ to a continuation rather than refuse. A
third obligation means every such site grows a third term, and a site that grows only two keeps reporting a
delivery unencumbered while something is owed. That is the failure the Owner's criterion rules out by name:
not a stale fact, but bookkeeping that lets ARC report wrong.

So extract the predicate, not the payloads — one reader over the state answering what encumbers it, with each
obligation contributing a term and each caller keeping its own policy over the answer. Refusing sites keep
refusing, the routing site keeps routing, and adding a fourth obligation later touches one place.

**This stays inside the change rather than beside it.** The extraction's sites — `compose.ts`, `retirement.ts`,
`entry-inspection.ts`, `landing.ts` — are already this work unit's, named in § Retained capture detail's file
list, and the third term is one this work unit introduces. Finishing that is completion. What it does not
license is converting the twenty payload reads, which remain untraced.

### Proportionality

`assess-design-proportionality`, 2026-09-16 — **`proportionate`**, with one scope guard.

The trace: the relation's existence is required by the two Axis A rows and the four Axis B ones; each variant
beyond a boolean buys one distinct remedy, and remedy accuracy is the defect the in-flight Errand is already
correcting, so variant granularity is traced rather than symmetric. Rigor stays where consequence is — the
write boundary keeps its exact preconditions (`update-ref`'s old-oid, revision-checked state writes,
lease-checked publication) and the relation is added above it, read-only. The minimal alternative — add an
ancestry term at the two Axis A readers and leave the rest — is rejected by the draft's own recorded
constraint: reader-by-reader adoption is how the two implementations diverged, and it leaves Axis B's four
vocabularies standing. Cardinality and divergence are intrinsic to Git history, not states this solution
creates.

**The guard is scope.** Twenty `--is-ancestor` call sites carry no observed failure between them; retrofitting
them is symmetry, not traced need. The primitive is _available_ to them and this work unit converts none —
the same line § Reader inventory already draws for the two decomposition call sites.

## Forward-compatibility check

Run 2026-09-16 against the four project check-docs and two planned-but-unbuilt designs, before settling what the
obligation record may carry. **Nothing in the settled fundamentals conflicts.** Three constraints sharpen the
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
one those designs will compile. The predicate is a contributor to that slot, and the obligation record is a fact
it reads.

The deeper agreement is doctrinal. "Derive continuation from live state" is the criterion this draft settled on
independently — store the obligation, re-derive every fact that can be recomputed. `draft-operational-state-docs`
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

### Recorded — native restacking is what makes the validity predicate need the relation

`strategy-storage-evolution` § Holistic Design carries a delivery-specific target: once operational state
materializes off-branch and identity no longer couples to branch SHAs, delivery replaces its filtered-member
projection with ordinary interior-ref members and **permits native restacking end to end**, while preserving the
terminal-authorization arm and member-boundary verification as substrate-independent contracts.

Routine restacking moves member heads as a matter of course. A held decision bound to exact coordinates and
checked by equality would be invalidated by every restack — the redundant-ceremony failure arriving at a cadence
rather than an incident. Checked by the relation it behaves correctly: an append-only advance reads `advanced`
and the decision still applies, while a true rewrite reads `diverged` or `rewound` and the decision genuinely
should not survive, which is the Gerrit asymmetry again. So the relation is not only this work unit's fix; it is
the precondition for the restacking that target intends. The preserved contracts are safe here — this design
adds reachability above the write boundary and relaxes nothing at it.

### Checked and not firing

`strategy-knowledge-evolution` reaches this design only through Principle 6, extract on fan-in rather than
aesthetics, which independently confirms § What composes: the predicate has three consumers and the payloads
have one built and one unauthored. `strategy-pm-composition-evolution` finds no new external-authority surface —
the change-request binding is untouched, and resolving a member by deliverable identity rather than by head
object id moves toward its Principle 5 and `strategy-storage-evolution`'s Principle 5, both of which hold work
unit identity independent of any single repository's branch state. Storage Principles 2 and 3 are satisfied
rather than strained: the record is plain schema data in the delivery state namespace, carries no tracked-tree
assumption, and its validity predicate is a version-checked write precondition of exactly the kind Principle 3
requires.

## Refusal-recoverability audit

Run 2026-09-16 against the four clauses of the recoverable-refusal rule being encoded into project rules — a
recoverable refusal preserves a safe retry or restart route, reports the observed condition, names an actionable
remedy, and keeps the normal success path reachable after repair.

The rule is close to this work unit's thesis stated generally, so the audit is a fit check rather than a
translation. Every row here fails at least two clauses today; that is § The failure family restated in the
rule's vocabulary. What the audit is for is the design's answers, and it found one gap and one remedy the design
had not named.

| Row                   | Fails today                 | The design's answer                                    |
| --------------------- | --------------------------- | ------------------------------------------------------ |
| Review readiness      | condition, remedy, retry    | inverted lookup, then the relation; rebind is the verb |
| Closeout              | condition, remedy, retry    | relation in place — **condition still unmet, below**   |
| Whole-WU verification | reports no condition at all | membership derivation; the refusal never arises        |
| Prepublication        | remedy, success path        | typed relation, plus the base-merge remedy below       |
| Public review target  | condition, remedy, retry    | typed result rather than a throw; same remedy          |
| Landing overlap       | remedy, success path        | membership derivation; the refusal never arises        |
| Post-land replay      | all four                    | the obligation record and the new-contribution path    |

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
other seven need only stop sharing a word.

### The remedy the design should name — merging the base in collapses cardinality

§ Established practice proves that an ancestor uniquely dominates, so `merge-base --all` returns exactly one
whenever one revision reaches the other. The corollary was not drawn: **merging one side into the other makes it
an ancestor, which collapses cardinality above one to exactly one.** A criss-cross is not a permanent property
of two revisions; it is a property of their current shape, and an append-only merge changes that shape.

That converts Axis B's refusals from correct-but-terminal into recoverable, and the remedy is already ARC's
mandated way to absorb base movement — merge the base in rather than rebase a published branch. It is idiomatic,
available, and non-destructive, which is what clauses three and four ask for.

Two honest limits. Which merge clears which reader is per-reader: each compares its own pair, and the merge has
to relate that pair rather than merely be some merge. And the remedy is unavailable where an append-only merge
is not permitted, in which case the refusal stands and clause one is satisfied by the restart route instead —
which the obligation record already supplies. Confirm the per-reader applicability before the remedy is named in
any emitted text.

### The design's own refusals, held to the same rule

Two are introduced here and both must answer it.

- **A stale validity predicate.** When the coordinates a held decision was made against no longer relate to the
  observed ones, the record must report which coordinate moved and how — the relation is already the vocabulary
  for that — and route to the new-contribution path rather than merely declining. The restart route is the point
  of the record; a refusal that does not name it would reintroduce the dead end one layer up.
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
speculative integration branch produces a new commit, and rebase-style submit strategies rewrite on the way in
(each mechanism pending confirmation from the practice survey). Under this work unit's Axis A defect — a binding
compared by head equality with no ancestry term — every such landing reads as `delivery-member-unbound` or
`terminal-unsettled`. Merge-queue compatibility is therefore not separate work layered on this design; it is the
same comparison, stated against an external head-mover rather than an internal one.

Carry it as a constraint, not a feature: whatever replaces the equality comparison must not assume the landed head
is the head ARC bound. Current compatibility is **unverified** — every enumerated row moves the head from inside
ARC, and no probe covers an external mover.

### Errands in flight

- **Refusal-remedy accuracy** (`execute-bound`, started in the primary checkout). Determinate diagnostic and argv
  correction across the integration checkpoint, its advisory register, the drift continuation, and teardown. It
  lands first and gives this design a corrected baseline. It must not invent the missing post-landing transition.
  **Consequence for this draft:** every refusal string quoted above is pre-Errand. Design against the decision each
  verb reaches, not against its current prose.
- **Append-only terminal movement in session-init delivery position** (`execute-bound`). The third consumer of the
  substrate above. Reader-level, and downstream of whatever binding relation this design settles.
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

## Pinned probes

Six probes hold this boundary's behaviour as it stands. They **pass today**; each fails the moment the behaviour
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
- `history-shape-ambiguity.test.ts` — "refuses with a typed reason rather than choosing one of the two bases"
- `history-shape-ambiguity.test.ts` — "reports the overlap unavailable rather than proving it from one of the two
  bases"
- `review-status-base-movement.test.ts` — "directs a checkpoint rerun on a base that moved only in shape"

A seventh row is owned here and **deliberately unpinned**: `delivery-rebuild-base-movement.test.ts` — "returns the
identical refusal after the operator resolves the conflicted path". It proves the named remedy does not clear the
refusal, which no other test asserts, and the refusal itself is correct.

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behaviour neither shape names. That is a finding, not a retirement.

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

§ The relation rests on source read 2026-09-16 rather than on survey: `scripts/base/merge.ts`'s two directional
reads and their states, the ancestry helpers' return shapes and executor split, `DeliveryMemberSelector` and
`stateMemberMatches`, the absence of any production constructor for the `ref` arm, and the integration test that
pins its conjunction. The count of roughly ten hand-rolled helpers is approximate and deliberately so — it bounds
a repetition rather than enumerating a work list, and § The relation's scope guard converts none of them.
