# Spec (`detailed` · `RFC`): decompose-base-mobility

- **Origin:** [internal]

- **Purpose:** Move one canonically finalized decomposition candidate across unrelated base advancement and land
  it safely without rewriting history, weakening transition evidence, or importing host policy into the transform.

---

## Introduction / Context

The v3 retirement core deliberately establishes a conservative floor: one exact committed source, one pinned
result base, one base-rooted candidate, and one finalized transition patch. That floor is sufficient for a safe
transform, but normal review latency allows the configured integration base to advance before the candidate lands.

Today that movement either strands otherwise-valid evidence or tempts callers to reconstruct Git topology and
receipt meaning independently. Base mobility is a distinct authority: it may move an already-authorized candidate
through unrelated history, but it must never re-decide the semantic cut or silently admit overlap.

This work unit depends on `decompose-transform-integrity`, which owns the v3 schemas, canonical validator,
transition patch, hook verdicts, ROADMAP overlay, and typed recovery actions.

## Goals

1. Advance a committed but unlanded full-protection candidate across base movement through one append-only merge.
2. Admit landing over an exact descendant base only when the recorded patch and dependencies still replay exactly.
3. Bind every decision to one immutable base/head pair and fail closed on movement.
4. Make a descendant current base the baseline for the integration-anchor fact, which exact-base-only anchoring
   cannot serve.
5. Preserve ordinary exact-base behavior as the conservative fallback.

## Non-Goals

- Define or decode v3 evidence, allocation, planning profiles, cohort topology, or semantic distribution.
- Refresh a landed receipt, rewrite history, rebase, amend, force-push, or generalize conflict resolution.
- Implement extraction source thinning or its no-receipt recovery model.
- Repair candidate teardown. The discard surface refuses a committed candidate at three independent layers and
  cannot process one at all, so making teardown survive a partial state means building a committed-candidate
  abandon route — a concern independent of base movement, owned by `decompose-candidate-abandon`. This work unit's
  restore path is bounded by the merge it performs and leaves the candidate committed, exactly as it found it.
- Grant planning-lane or CODEOWNERS authority; `decompose-planning-lane` owns that optional host policy.
- Add a pending record, refresh ledger, landing transaction, cache, token, or operator-authored Git proof.
- Treat rebase, cherry-pick, or revert state as merge-parent authority.
- Advance a **prepared but unfinalized** candidate across base movement. The mechanism generalizes — the same
  append-only merge applies, and the authored-half invariant above is what would license it — but no observed
  failure yet requires it, and the pre-commit case forfeits only authoring effort where the committed case forfeits
  completed review. The seam is named here so a later work unit can take it without redesign.

## Proposed Design

### Consume one canonical validator boundary

Mobility consumes the core's finalized v3 receipt, mode-aware transition patch, dependency inventory,
`ValidatedTransitionOverlay`, and typed mismatch/action result. It supplies exact Git objects and path states
through injected readers but never recomputes canonical identities, parses receipt JSON independently, or judges
semantic destination content.

#### What reuse reaches, and where it stops

The reuse boundary is not a module boundary. It falls between the machinery that reasons about **committed trees
and pure facts** and the machinery that manages a **live, uncommitted candidate**, and only the first half is
available here.

Reusable, because it operates on committed objects or pure inputs: canonical receipt validation, repository-plan
composition, preparation-fact assembly, the integration-anchor producer and its configured-base adapter, and the
ROADMAP regeneration remedy. None of these reads a candidate worktree or index.

Not reusable, because it is uncommitted-only by construction: candidate occupation, candidate inspection, and
candidate discard. Each re-derives an expected candidate shape and requires the on-disk candidate to match it,
including a head equal to the prepared base — which a committed candidate never has. Exactly one existing path
destroys a candidate carrying commits past its result base, and it requires a resolved landed anchor.

The consequence for this work unit is narrow and worth stating plainly: it may consume the first half freely, and
it must not reach for the second. Its committed-unlanded precondition is therefore proven by its own reader over
pinned refs and claim state, not by adapting an inspection built for the uncommitted case, and its restore returns
the candidate to the committed state it found rather than tearing anything down.

### Append-only committed-unlanded base advancement

The explicit route is:

```text
arc decompose <origin> --advance-base <receipt-id>
```

The mode is named for base advancement rather than refresh. The core already owns an uncommitted `refreshed`
finalization state that replaces staged receipt bytes at the same path against an unchanged result base, with its
own `refresh-*` refusal codes. This mode is the committed, base-advancing sibling of that operation; the two must
stay distinguishable at the command surface and in every refusal code.

It exists only under full protection and is mutually exclusive with every other decomposition mode. The command
requires the exact clean deterministic candidate, proves that its canonical receipt commit is not reachable from
the configured base, pins the live base, and merges that base into the candidate without rebase, amend, or
force-push.

Only canonical ROADMAP regeneration may be resolved automatically. Recorded path, type, and mode overlap and
dependency drift are refused ahead of the merge by the landing verdict below, so they abort without mutating
anything; any other conflict or ref movement, arising once the merge is under way, aborts and restores the bounded
pre-merge candidate. After the merge, the command preserves all semantic destination bytes and modes, regenerates
ROADMAP, and stages one same-path current receipt accepted by the core hook verdict.

Repetition follows the same authority rather than a one-shot guard. Re-invocation while the recorded result base
is still the live base is a no-op over an already-advanced candidate; a base that has advanced again runs the same
append-only merge again. The candidate stays committed-unlanded across both, so the precondition holds on every
pass and the recorded-versus-live base comparison distinguishes the two cases without an advancement ledger. A
one-shot guard would instead defeat the goal wherever a review window is long enough for the base to move twice.

Partial protection commits directly on the configured base and has no committed-unlanded state to advance.

#### The landing verdict gates the merge, and the merge is not a second overlap authority

The command establishes its entire authority before it mutates anything, and this is total rather than partial
because every check it needs reads committed objects. Three admissions precede the merge:

- **Canonical receipt validation**, which also mints the transition overlay this operation later supplies to
  ROADMAP regeneration — the overlay has no other legitimate source.
- **The descendant-base landing verdict** over the pinned base and candidate head.
- **Re-derivation against the advanced base** — the plan composition and preparation assembly described below.
  Composition reads only the source, merge-base, and result-base trees and never the candidate, so it can be
  proven against the live base ahead of the merge rather than discovered after it.

A refusal from any of the three aborts with nothing to restore.

Only once all three admit does the merge run, and the merge is not a fourth overlap authority. The landing verdict
owns recorded-path, mode, type, and dependency overlap; re-derivation owns whatever the advanced base did to the
origin's own predecessor state, the receipt path, ROADMAP, cohort topology, and destination shapes; the merge can
still conflict on a path none of them recorded. None subsumes another — in particular, re-derivation's predecessor
equality is a three-way test against a recomputed merge base, anchored differently from the validator's per-path
replay, and each admits cases the other refuses. A conflict surviving all three is a genuine surprise rather than
the expected refusal, and — ROADMAP excepted — it restores rather than resolving.

#### ROADMAP regeneration supplies its overlay rather than discovering one

The shared merge-conflict remedy discovers transition authority from a pinned snapshot and requires the receipt's
recorded result base to equal the live configured base. Advancement is precisely the state where those differ, so
that discovery path refuses by construction and cannot serve this command.

The remedy exists because a commit hook must _find_ authority it was not given. This command already holds
validated authority for the exact receipt it was invoked with, so it regenerates through the same ROADMAP renderer
with the overlay **supplied**, skipping only the discovery and selection layer that has nothing to decide here.
That adds no second renderer and no second conflict classifier; the generic remedy keeps its own path unchanged for
every caller that must still discover.

#### Advancing the base re-derives every base-dependent fact and never the cut

The recorded result base is machine-derived, so advancement must restate it. The authored cut is not: it is a
separate block whose bytes carry every semantic decision a human made and approved.

Restating the base is not a local substitution. The record's identity chain runs from the base through the
preflight identity, the plan identity, and the preparation identity — and a fourth family of facts, the
prospective projection carrying the plan-bound overlay and the ROADMAP before/after pair, belongs to neither the
machine nor the authored block and must move as well, because this command regenerates ROADMAP. Substituting the
base and re-deriving a chosen few digests would leave the remainder inconsistent and the record unparseable by
the core's own validator.

The operation therefore re-runs the existing derivation instead of patching its outputs. It restates the result
base and preflight identity on the recorded cut map, re-composes the repository plan against the advanced base
from that unchanged authored cut, and re-assembles the preparation facts through the same constructor that built
them the first time. Every base-dependent identity is produced by the producer that owns it, and the core's
existing cross-checks between plan, map, and facts hold unchanged.

Two properties make this safe to run before the merge. Composition pins the base by requiring the restated head to
be the live tip of the recorded base ref — exactly what advancement restates it to — and it reads only committed
trees, never the candidate. So the whole re-derivation is provable against the live base while the candidate still
sits untouched.

Re-composition is not a second **semantic** decision point: the authored cut it composes from is byte-identical,
so no allocation, destination, or disposition is re-decided. It is emphatically a second **admission** point.
Composition re-evaluates the origin's predecessor state, the receipt path, ROADMAP presence, cohort topology,
destination shapes, and dependent writability at the advanced base, and any of those can refuse a base the landing
validator admits. That is the point of running it: a base advance that quietly changed the origin's own artifacts
is invisible to a per-path transition replay and fatal to the plan.

One invariant governs the whole operation: **the authored cut must remain byte-identical, and every fact derived
from the base is re-derived by its own producer.** A digest inequality over the authoring block, or a receipt
identity that moves, aborts and restores. Receipt identity is what makes the second half of that check meaningful
— derived from origin, source branch, and source head alone, it is invariant under base movement, which is what
keeps the refreshed receipt on its original path.

### Descendant-base landing

A small read-only validator consumes `{receipt, currentBaseOid, candidateHeadOid}` plus exact commit, path-state,
and dependency readers.

It accepts:

- the exact recorded result base; or
- a strict descendant containing only unrelated changes relative to every recorded touched path and incoming
  dependency.

It refuses regressed or divergent history; changed creates/writes/deletes; content-equal mode changes; non-regular
objects; new dependencies on the retired origin; extra transition paths; or stale base/head observations. The
recorded transition patch is the complete overlap model **for the paths the transition touches**. Non-touched paths
are ignored by construction, and drift in the origin's own predecessor state is not this validator's question —
re-derivation answers that one.

The dependency check is a base-to-base comparison, not a comparison against the recorded inventory. Recorded
incoming edges are derived at the selected source snapshot, which for a started-planning origin is its own branch
rather than the base, so treating them as a base-side inventory compares unlike things. The question this
validator asks is narrower and well-posed: does any work unit visible at the current base depend on the retired
origin when it did not at the recorded result base?

The validator is host-neutral. Exact-ref review and optional clearance wiring belong to
`decompose-planning-lane`.

### Descendant-current integration anchor

This is the sharpest of the two problems, and it is not a latency concern. The anchor holds only while the current
base head _is_ the landing commit, so its operating window is exactly one commit wide: the first unrelated merge
after a decomposition lands makes every member of the resulting cohort permanently unlaunchable, refused at
graduation preflight with no bypass. On any repository with concurrent work that window closes in minutes.

It is in fact guaranteed to close, because the sanctioned completion procedure itself closes it. Finishing a
decomposition requires a follow-up commit to record the external dependency edges a cut map cannot carry — so the
transform destroys the anchor its own output depends on, and a decomposition is unusable unless every member is
started before anything else merges. That is not a workable contract.

Descendant anchoring is therefore the **baseline** this fact needs rather than an extension to a working one. The
exact-base derivation is not a conservative default with a narrow window; it is a derivation with no realistic
window at all, and the exact-tree proof it carries is retained for what that proof actually protects rather than
for the base-equality it currently rides on.

The core defines `DecompositionIntegrationAnchor` and derives it only where the current configured base _is_ the
landing commit. Mobility reuses that shape unchanged — it already carries `currentBaseHead` and `landedCommitHead`
as separate fields, so a descendant current base needs no new field on the anchor itself, no second anchor fact,
and no consumer interface. What the derivation gains is an input, not an output: the producer takes the descent
relation as a supplied fact (below). It extends at two named points:

- the **pure producer**, which today refuses a descendant current base outright and grants no descendant mobility
  by construction; and
- the **configured-base Git adapter**, whose landing detection today admits only a base commit whose first parent
  is the recorded prepared base.

The extension consumes a **different proof** from the landing validator above, and conflating the two is the
principal hazard in this area. The landing validator answers a pre-landing question — may this unlanded candidate
still land over a base that moved? — and evaluates each recorded `before` state at the current base. The anchor
answers a post-landing question — did this decomposition land, given the base has since advanced past it? — where
those same `before` states have already been consumed by the landing commit itself. A validator built for the first
question refuses every case of the second.

The anchor's proof is therefore its own: locate the landing commit beneath the advanced base, confirm the current
base descends from it, and confirm the recorded transition holds between the prepared base and that landing commit.
Both proofs bind an immutable base/head pair and fail closed on movement; neither substitutes for the other.

Locating that commit is a bounded enumeration of what the base has gained since the prepared base, not a walk down
the base's first-parent line. The distinction is correctness before it is cost: a base that advanced through a
merge puts the landing commit off the first-parent line entirely, so a first-parent walk misses exactly the case
this design exists to admit. Enumerating the commits the base has gained finds it wherever it sits, is bounded by
how far the base has advanced rather than by repository history, and asks nothing of path-history simplification.
The landing predicate applied to that set is the core's existing one, unchanged.

The producer performs no ref or history lookup of its own, so descent reaches it as a supplied fact bound to the
exact landing/current pair it describes; a proof naming any other pair authorizes nothing. What that supplied
descent replaces is only the producer's exact-equality refusal. The adapter's separate insistence that the
candidate tree equal the _current base_ tree is **relocated, not removed**: it is re-read against the located
landing commit, where it means what it always meant, rather than against a base that has since advanced — where it
would refuse every descendant case by construction.

Relocating rather than deleting is deliberate. The producer carries an equivalent landing-tree check, so deletion
looks safe and is not: the adapter's check fires first and refuses as a transition mismatch, while the producer's
refuses as a landing-topology fault. Those reasons reach callers — landed-handoff surfaces every refusal reason
verbatim — so deleting the adapter's check silently reclassifies an existing exact-base refusal.

Existing exact-base callers keep their current verdicts unchanged, and the anchor's structural consumers are
unmodified.

A result-branch commit, staged receipt, remote branch, clearance status, or old receipt in unlanded ancestry is
not an anchor. The adapter uses pin, validate, and reread; movement, deletion, or history replacement invalidates
the fact.

The fact is consumer-blind, so descendant reach extends to every consumer at once — receipt-backed cleanup, the
claim-retirement gate, landed-handoff emission, and the graduation transaction behind work-unit launch. Branching
it by consumer would mint the second consumer interface this design forbids. The mobility layer performs no
teardown of its own, and no second receipt or durable publication ledger is introduced.

The descent relation reaches the producer as a **required** input rather than an optional one. Every consumer in
service today resolves through the single configured-base adapter, so requiring the field grants no reach that
optionality would withhold; what it buys is that no future producer path can take exact semantics by silently
omitting the fact. Descent is a claim about a specific pair, and a caller that has not established it should be
unable to say nothing and be understood as saying "exact".

The cost is bounded and paid in one place: one production construction site and the test literals that build the
same facts. The second producer call site in the tree is a pure resolver with no production caller, so it inherits
the requirement without a behavioral consequence.

None of this touches how the four consumers _consume_ a resolved anchor — their code, their contracts, and their
refusal reasons are unmodified, which is what the no-second-interface commitment actually asserts.

### One recovery vocabulary

The core's closed recovery union is `retry`, `discard`, `re-preflight`, `reauthor`, and prose-only `guidance`.
Mobility consumes that vocabulary unchanged and adds exactly one arm — `advance-base` — carrying only the origin
and receipt facts that authorize this work unit's command. It adds no second remedy classifier, no prose-derived
remedy, and no parallel mapper. Mismatch loci remain diagnostics and never become command operands.

The new arm's principal duty is to convert one existing dead end. The core refuses a committed candidate parent
with a `committed-candidate` cause that resolves to prose `guidance` — inspect the committed state instead of
retrying or discarding it — because at core scope no safe route exists.

Only one of the states behind that refusal is repairable here. The same refusal fires for a committed preparation
and for an unparseable record as well as for a committed receipt, and the authorizing facts are identical in all
three, so authority alone cannot discriminate. The refusal therefore carries the decoded record kind, and only the
committed-receipt case resolves to `advance-base`; the other two keep the existing guidance, which for them stays
the honest answer. Routing all three would replace a true dead end with an invocation that refuses later.

Binding unavailability resolves to the same arm through a cause of its own. The action vocabulary gains exactly
one arm; the cause vocabulary gains one too, because no existing cause represents a host unable to retain an
immutable base/head pair.

That cause is constructed by the command, not carried out of the validator. The command already holds the
authorizing origin and receipt facts and already observes the failed re-read, so it can name the cause directly.
The alternative — threading a recovery-bearing channel out of a pure validator — would mint a carrier the
subsystem does not have today, since the one typed validator-to-mapper path carries a canonical mismatch and
nothing else. Keeping construction at the command leaves the landing validator free of recovery entirely: it
returns a verdict, and the caller decides what a refused verdict means.

## Alternatives & Rationale

### Require every candidate to restart from the new base

Safe but needlessly destructive after semantic authoring and review. Exact append-only advancement retains the
candidate and preserves reviewable history while refusing real overlap.

### Rebase or amend the receipt commit

Rejected because it rewrites the reviewed candidate and weakens stable exact-ref binding.

### Make descendant landing part of the planning-lane host recipe

Rejected because landing correctness is transform behavior. Host policy may consume the verdict but must not own
or redefine it.

### Persist a landing or refresh transaction

Rejected. Exact refs, canonical evidence, bounded Git state, and idempotent retries supply sufficient recovery.

## Cross-cutting Considerations

- **Security:** every mutation follows an immutable source/base/candidate proof; races fail closed.
- **Compatibility:** only canonical v3 evidence receives mobility; obsolete development schemas grant no
  authority.
- **Testing:** focused real-Git DAGs own base advancement, descendant replay, ref races, and anchor reachability.
- **Rollout:** the core exact-base transform remains safe before this member lands.
- **Performance:** landing validation is proportional to recorded touched paths and dependencies, not repository
  size. Re-derivation is not — it re-runs the core's own composition, whose cost is the transform's existing cost —
  and the landing-commit search is one bounded enumeration of what the base gained since the prepared base, not a
  per-commit walk.

## Success Criteria

- A canonical full-protection candidate advances across unrelated base movement through one append-only merge.
- ROADMAP is the only automatically resolved conflict; every other conflict restores the bounded candidate.
- The restaged same-path receipt passes the core hook and remains the sole live current receipt.
- Exact and strict-descendant bases land only when all touched paths, modes, types, and dependencies replay.
- The shared integration anchor resolves over a descendant current base — after the canonical receipt and
  transition validate against the reread configured base — so a member stays launchable across unrelated commits
  on the base rather than only while the base head is the landing commit.
- Ref movement, divergence, overlap, or unavailable immutable-pair binding produces one typed recovery action.
- A committed receipt parent resolves to the actionable `advance-base` arm instead of terminal prose guidance,
  while a committed preparation or unparseable record keeps its existing guidance.
- The base-advancing mode stays distinguishable from the core's uncommitted same-base receipt refresh at the
  command surface and in every refusal code.
- Canonical validation, the landing verdict, and re-derivation against the advanced base all precede the merge; a
  refusal from any of them aborts with no repository mutation to restore.
- Advancement re-derives every base-dependent fact through its own producer; a change to the authored cut, or a
  receipt identity that moves, aborts.
- A base advance that alters the origin's own predecessor state is refused, even where the recorded transition
  patch replays cleanly.
- ROADMAP regenerates through the shared renderer with a supplied overlay, leaving the discovery-based remedy
  unchanged for its own callers.
- A refused advancement leaves the candidate exactly as it found it — committed, unlanded, and no further torn
  down than before the attempt.
- No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate validator is
  added.

## Open Questions

[none]
