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
- **Readiness:** `rough` — the failure family is fully characterized and its boundaries are settled; no mechanism
  has been chosen yet.

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
- **The six readers are classified, and two of them stop having the problem.** The subject collector and the
  overlap analyzer ask membership questions and answer them with a base-anchored diff; deriving their paths from
  the branch's own commits removes the ambiguity rather than handling it. Three readers want the relation itself.
  § Reader inventory — Membership or content.

### Open

- **The relation's result type and its variants** — the distinctions are settled (unchanged, advanced compatibly,
  diverged, absent, unknown) but their naming and the shape of the diverged variant's cardinality field are not.
  No canonical name exists to adopt.
- **What the new-contribution path looks like for a resolved suffix**, and how much prior verification it
  inherits. Gerrit's change-kind and copy-condition model is the precedent, and its shape is an asymmetry: no
  positive review survives a rework, while a standing minimum score does.
- **Whether the subject's path set should be what its commits touched or what they net to.** The reframing in
  § Reader inventory creates this rather than removing it. Touched is safe for overlap in the fail-closed
  direction, but for the subject it admits paths whose content is unchanged, which trades directly against how
  sensitive Candidate currentness is to movement — the sensitivity this work exists to reduce.
- **Whether a durable `landed-awaiting-suffix-resolution` phase or a reservation-local transition composes better**
  with the existing provider-adoption conflict machinery. Carried unresolved from the origin capture.

### Next

Author the relation type against Git's layering — equality preserved at the write boundary, reachability added
above it — with the classification above fixing who consumes it, and the asymmetry Gerrit demonstrates as the
model for what survives movement. Fire `assess-design-proportionality` before elaborating the mechanism.

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
| review readiness                    | is the bound head still the observed one | relation               |
| closeout                            | is the bound head still the observed one | relation               |

**Two readers stop having the problem.** `git-candidate-subject.ts` selects paths with
`diff --name-only <picked-base> <head>`, and `base-overlap.ts` diffs both sides from one picked base before
intersecting. Both therefore select paths that are an artifact of which ancestor got chosen. A branch's own
changed paths are instead derivable from the commits reachable from it and not from _any_ merge base — the
`--all` form Git already uses for membership — so the selection becomes cardinality-independent and the ambiguity
never reaches them.

**One caveat, recorded rather than glossed.** Paths touched by a branch's own commits are not the same set as its
net diff: a path changed and then reverted within the branch appears in the commit-derived set and not in the net
diff. For the overlap question that errs toward reporting overlap, which is the fail-closed direction and
therefore safe. For the subject it admits paths whose content is unchanged, which trades against the digest's
sensitivity and is **not** settled here.

**Three readers want the relation itself** and are the resolver's real consumers. The fourth,
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
