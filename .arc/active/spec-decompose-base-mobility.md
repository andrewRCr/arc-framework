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

1. Advance a committed but unlanded full-protection candidate — one whose recorded source snapshot is independent
   of the base — across base movement through one append-only merge.
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
  Restating a live candidate claim's own binding is none of these — it rewrites one field pair on a record that
  already exists, rather than introducing a second record or a durable transaction — and is in scope below.
- Advance a candidate whose recorded source ref is the result-base ref. Such a source head moves with every base
  advance, and restating it is closed off by receipt identity. The test is structural — recorded source ref equal
  to recorded result-base ref — not a source-kind check: a backlog-stub origin always lands in that state, and a
  started-planning origin whose planning branch _is_ the base lands in it too, so keying on kind would build a
  different gate than the one this reasoning justifies.
- Treat rebase, cherry-pick, or revert state as merge-parent authority.
- Advance a **prepared but unfinalized** candidate across base movement. The mechanism generalizes — the same
  append-only merge applies, and the authored-half invariant above is what would license it — but no observed
  failure yet requires it, and the pre-commit case forfeits only authoring effort where the committed case forfeits
  completed review. The seam is named here so a later work unit can take it without redesign.

## Proposed Design

### Consume one canonical validator boundary

Mobility consumes the core's finalized v3 receipt, mode-aware transition patch, dependency inventory,
`ValidatedTransitionOverlay`, and typed mismatch/action result. It supplies exact Git objects and path states
through injected readers but never **reimplements** canonical identity computation, parses receipt JSON
independently, or judges semantic destination content. It does re-derive base-dependent identities when the base
moves — through the core's own producers, never a substitute of its own (below).

#### What reuse reaches, and where it stops

The reuse boundary is not a module boundary. It falls between the machinery that reasons about **committed trees
and pure facts** and the machinery that manages a **live, uncommitted candidate**, and only the first half is
available here.

Reusable, because it derives from committed objects or pure inputs rather than from an expected candidate shape:
canonical receipt validation, repository-plan composition — including the ROADMAP render it performs —
preparation-fact assembly, and the integration-anchor producer with its configured-base adapter. None of these
requires the candidate to look any particular way.

The discriminator is **not** "touches the index." The ROADMAP regeneration remedy reads and writes the index by
design, and mobility still cannot use it — not because of what it touches, but because it discovers authority
mobility already holds, and renders from inputs the plan does not own (below).

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

The only path resolved automatically is a regenerable projection, and it is re-derived rather than merged.
Recorded semantic-path, type, and mode overlap and dependency drift are refused ahead of the merge by the landing
verdict below, so they abort without mutating anything; any other conflict or ref movement, arising once the merge
is under way, aborts and restores the bounded pre-merge candidate. After the merge, the command preserves all
semantic destination bytes and modes, re-derives ROADMAP from the restated record, and stages one same-path current
receipt accepted by the core hook verdict.

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
the expected refusal, and — regenerable projections excepted — it restores rather than resolving.

#### ROADMAP is re-derived by the plan that owns it, not resolved by the shared remedy

ROADMAP is a regenerable projection of operational state that happens, for now, to be a tracked file. Advancement
treats it as exactly that: not content to be preserved across a merge, but a view to be re-derived from the record
the operation just restated. The plan re-composition already renders it — that render is how the plan knows
ROADMAP's post-transition state at all — so advancement stages those bytes as the resolution and is done.

The shared merge-conflict remedy is not used, for two independent reasons. It discovers transition authority from a
pinned snapshot and requires the receipt's recorded result base to equal the live configured base, which is
precisely the state advancement is not in — so its discovery half refuses by construction. And its resolution half
renders from inputs the plan does not own: it reads the merged index under an overlay its own discovery must
supply, where the plan renders the projected tree it already composed under the overlay it already holds.

Using the plan's own render is not a second renderer — it is the renderer the plan already runs, producing the
bytes the plan already projected. It is what keeps the projection truthful: the core's own finalization admits a
candidate only when its ROADMAP equals the render its plan projected against the result base, and re-deriving
through the plan is what preserves that standard for an advanced receipt instead of quietly exempting it. The
generic remedy keeps its own path unchanged for every caller that must still discover.

**The regeneration assert gains the same restatement arm.** The pre-commit assert independently re-renders the
staged projection and demands byte equality, discovering its transition overlay from the staged retirement record —
and it recognizes only an _added_ record, because every producer before advancement commits its receipt exactly
once. Advancement stages a modification at that same path, so an unextended assert re-renders with no overlay while
the plan rendered with one; and the divergence reaches rendered bytes, because the overlay suppresses the retired
origin's own entry and advancement's source-ref pin guarantees that entry is present to suppress. The discovery
therefore accepts a modified record at the receipt's own path under exactly the proof the commit gate's advancing
arm applies: authored block byte-equal to the receipt at `HEAD`, machine-derived facts free to move. A restated
receipt grants its overlay; an amendment grants nothing, exactly as a malformed added record grants nothing today.

**The conflict remedy's provenance discovery gains the third arm of the same proof.** The ROADMAP auto-remedy runs
at every commit, not only where a caller invokes it, and its eligibility is shape-level: a merge-like state with
the projection staged and no wider conflict is exactly advancement's commit. Its discovery classifies the staged
record against each parent's copy of the same path, and a parent carrying different bytes reads as namespace
corruption — the state a restated receipt produces against the candidate's own pre-merge tip by construction. The
classification therefore gains the restatement arm: a parent copy whose authored block is byte-equal to the staged
record's, with only machine-derived facts moved, is restated provenance rather than conflict. The arm is
two-layered, because the provenance vocabulary is a closed contract recording where exact receipt bytes were
observed and a restated parent is exactly not that: the vocabulary gains a named restated kind bound to the
parent's commit, and the selector's provenance-validity check admits that kind as satisfying its parent
requirement. Recording a restated parent through the exact-bytes kinds instead would silently falsify the contract
every other caller reads; relaxing validity without a recorded kind would erase the distinction its refusal exists
to draw. With both layers extended, discovery succeeds on its own terms — at commit time the restated record's
result base _is_ the live configured base — and the remedy's re-render converges with the plan's staged bytes, the
equality the regeneration assert independently enforces. The command's own resolution still never routes through
the remedy: mid-merge, before the restatement is staged, discovery refuses exactly as recorded above.

**Interim by construction.** This whole surface exists because ROADMAP is currently carried on every branch. The
project's storage direction moves operational-state projections off the tracked tier, at which point ROADMAP is not
an allowed path, not in the transition patch, and has no merge behavior to resolve. The design is deliberately
shaped so that arriving there is a deletion — one excluded path, one render call, and the restatement discovery
arms — rather than an unpicking of ROADMAP-specific reasoning spread across the landing verdict, the seal, and the
merge.

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

The origin's own source snapshot must also still be pinned, which bounds where advancement applies. Composition
pins two refs, not one: it requires the recorded source ref to still resolve to the recorded source head, exactly
as it requires that of the base. Where the source is an independent planning branch, that holds across base
movement. Where the recorded source ref _is_ the result-base ref, it cannot — the source head moves with the base,
and restating it is not available, because receipt identity digests it and a moved identity moves the receipt path.
Such a candidate is refused on its precondition rather than advanced, and refused there rather than left to surface
as an opaque composition failure once the operation is under way.

Two properties make the re-derivation safe to run before the merge. Composition pins the base by requiring the
restated head to be the live tip of the recorded base ref — exactly what advancement restates it to — and it
**mutates nothing and reads no candidate worktree or index**. So the whole re-derivation is provable against the
live base while the candidate still sits untouched, and a refusal costs no restore.

It is not, however, a pure function of committed trees. The projection render it performs consumes live local-ref
and decomposition-claim state alongside the trees it reads. That is a real dependency rather than an incidental
one — it is the same live state advancement itself operates in — and it is why the projection's bytes are settled
by the render, not by the merge.

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

The receipt is re-sealed on that path, and that is not optional bookkeeping: a receipt's finalized half is bound
to its preparation's allowed paths by canonical equality, and ROADMAP is one of those paths with its prior state
read at the result base — so advancement moves the transition patch and its digest, and the recorded finalized
half cannot be re-paired with the restated preparation. Sealing happens **after** the merge, through the same
receipt constructor finalization uses and from the same live path reads, carrying the recorded distribution
choice forward untouched: advancement re-derives base-dependent facts and decides nothing about distribution.

Sealing after the merge rather than before it is deliberate, and it costs the operation nothing it claimed. What
precedes the merge is the **admission** decision — the three refusals above — and the plan re-composition that
proves the advanced base still admits this cut. The receipt then records what the merge produced, read live, which
is the same discipline core finalization already follows.

The merged result is held to the plan's projection on every allowed path, projections included. Because ROADMAP is
re-derived through the plan's own render rather than resolved by a foreign one, its merged bytes and its projected
bytes are the same bytes by construction — so the equality is a real check on every path rather than a check with a
hole in it. That is what keeps an advanced receipt satisfying the same invariant core finalization enforces on
every other receipt: its `prospectiveProjection` describes a tree that actually existed. A divergence anywhere
restores rather than staging a record the tree does not match.

#### The commit gate assumes a candidate that has not committed, so it must name the advancing shape

The core's finalized-record commit gate refuses this operation's commit on three independent arms, and each refusal
traces to one assumption: that a candidate's head equals its prepared base, so its receipt is always being **added**
for the first time. A merge may not introduce a retirement record at all. A record change must be an addition, with
nothing at that path in `HEAD`. And the staged write set must equal the receipt path plus its transition patch
exactly.

Every one of those holds for the core, because the core commits a candidate exactly once, from a worktree whose
head is still the prepared base. Advancement commits a candidate that has already committed: its receipt is at
`HEAD`, so the change is a modification; the commit is a merge, because that is the whole mechanism; and a merge's
change set carries inherited paths the exact-write-set rule was never written against. Splitting the operation
into two commits does not escape it — the modified-not-added refusal fires on an ordinary commit too.

The gate therefore gains an authorized arm for the advancing shape: a base-advancing merge whose record change is a
**restatement** of the receipt already at that path, under the same receipt identity, with a write set that admits
the merge's inherited paths. Distinguishing a restatement from an amendment is what the arm must actually decide,
and receipt identity alone cannot decide it: identity digests the origin and its source, never the authored cut, so
a record whose authored block was rewritten keeps its identity and its path while its preparation identity moves —
the same signature a legitimate restatement presents. The arm decides on bytes it already reads: the staged
record's authored block must be byte-equal to the receipt at `HEAD`, and only the machine-derived facts may move.
Authored bytes that move are an amendment and are refused. The advancement command's own byte-identical-cut abort
is the producer-side twin of this proof, not a substitute — the gate defends against every producer, not only the
well-behaved one.

This extends the gate rather than redefining it. No existing caller's verdict changes, because no existing caller
can produce the shape — only advancement commits a candidate whose receipt already exists. It is the same boundary
the landing relation sits on: the cohort reserves the core's authority to _define_ evidence and finalization, not
to foreclose a member naming a state the core cannot reach.

#### The candidate's claim is bound to the base it was cut against, so advancement restates it

Under full protection the candidate is held by a transient claim whose binding records the result base head and
the cut-map digest alongside the origin, candidate branch, and source head. Both of the first two move under
advancement — the base head by definition, the digest because it covers the machine block the base sits in. The
claim record is written once at acquisition and its binding is immutable thereafter. The binding is a closed
shape, and every transition the state machine offers either moves the claim's own lifecycle — acquire, occupy,
retire — or the worktree reservation beside it; none updates the binding. Acquiring over a live claim with a
changed binding is a conflict rather than an update.

Left alone, that is a silent stranding rather than a refusal. Receipt-backed cleanup admits only a claim whose
binding matches the anchor's facts, so an advanced-and-landed candidate would pass every gate this work unit adds
and then fail the one that reclaims it — the candidate branch and worktree would survive indefinitely, with no
step in the transform reporting anything wrong.

Advancement therefore restates the binding as part of the same authority that restates the record: same claim, same
generation, same candidate — one field pair rewritten to the values re-derivation just produced. The alternative,
narrowing the cleanup gate to compare only base-invariant facts, would buy the same result by weakening the gate
for every caller, including the exact-base ones that have no base movement to tolerate. The two fields are there
to bind a claim to an exact cut; advancement moves the cut's base and so owns moving them with it.

### Descendant-base landing

A small read-only validator consumes `{receipt, currentBaseOid, candidateHeadOid}` plus exact commit, path-state,
and dependency readers.

It accepts:

- the exact recorded result base; or
- a strict descendant containing only unrelated changes relative to every recorded touched path and incoming
  dependency.

It refuses regressed or divergent history; changed creates/writes/deletes; content-equal mode changes; non-regular
objects; new dependencies on the retired origin; extra transition paths; or stale base/head observations. The
recorded transition patch is the complete overlap model **for the semantic paths the transition touches**.
Non-touched paths are ignored by construction, and drift in the origin's own predecessor state is not this
validator's question — re-derivation answers that one.

**Regenerable projections are excluded from the overlap model**, and this exclusion is what makes the mode work at
all rather than a convenience. ROADMAP is a recorded touched path — every decomposition changes it — and the base
changes it on essentially every advance, since it projects the very lifecycle events that move the base. Treating
that as overlap would refuse the ordinary case the mode exists to serve, and would refuse it for a file whose
contents advancement re-derives rather than preserves. The exclusion is keyed off the plan's own projection slot
rather than a path spelled into the validator, so it names a _class_ — regenerable views — and disappears with that
class when projections leave the tracked tier.

The distinction the validator draws is therefore preserved-versus-re-derived, not touched-versus-untouched. A
semantic destination must replay exactly, because advancement must not alter what review approved. A projection
must not, because advancement recomputes it from the restated record.

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
relation and the landing-relation kind as supplied facts (below). It extends at two named points:

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

Selecting among what the relations admit is the search's own responsibility, because more than one commit
satisfies them in the ordinary case. The candidate relations admit any commit carrying the prepared base in the
named slot, so an unrelated sibling commit off the prepared base matches alongside the candidate; the search
replays every such match against the recorded transition and keeps only those that replay. A landing merge over a
descendant base carries the prepared base in no slot at all, so it is admitted by its own relation rather than by
replay: its second parent is a surviving candidate, its first parent strictly descends from the prepared base, and
its tree takes the candidate's content on every recorded touched path and its first parent's elsewhere —
regenerable projections excepted, exactly as the landing verdict excepts them. The parent structure is what
identifies the landing merge; one so identified whose tree deviates from that composition is refused as altered
during resolution rather than dropped to elect its own candidate. The search then takes the survivor
that descends from every other: the landing merge where one exists, the candidate itself under a fast-forward
landing. Nothing surviving is not-landed; survivors with no ancestry relation between them are ambiguous, and both
are existing arms. Selecting by enumeration order instead would report a merge landing as a fast-forward, recording
a landing topology that never happened so that one receipt carried different anchor facts before and after the base
advanced — the second derivation route this design forbids.

#### Advancement mints a candidate shape the landing relations do not yet name

The core enumerates two exact landing relations: a fast-forward, where the base head's single parent is the
prepared base, and a merge, where the base head's **first** parent is. Both name the prepared base in a fixed slot
of one pinned commit, which is what makes them proofs rather than searches — the recorded principle is that neither
a candidate tree nor a history-wide receipt search proves landing.

Advancement absorbs the base by merging it into the candidate, so the candidate becomes a two-parent commit whose
first parent is its own predecessor and whose second is the base. Landing that by merge at the prepared base is
unaffected: the landing commit's first parent is still the prepared base. Landing it by **fast-forward** is not —
the base head then _is_ the candidate, with two parents and the prepared base in the second slot, so the
fast-forward relation fails on arity and the merge relation fails on order. The decomposition has landed and no
relation names it.

Fast-forward is not the exotic case here; it is the likely one, because an advanced candidate already contains the
base and that is what git does by default.

The fast-forward relation therefore generalizes, and the relation set is stated exhaustively so nothing is left to
reading: a merge landing at the prepared base is arity two with the prepared base in slot zero; a fast-forward
landing is arity one with the prepared base in slot zero, **or** arity two with it in slot one; and a merge landing
over a descendant base is arity two with a surviving candidate in slot one and a strict descendant of the prepared
base in slot zero, proven by the per-path test above rather than by slot equality. Merge at the prepared base is
evaluated first, so no existing verdict moves, and no other shape is admitted.
This is an extension of the relation set, not of the anchor: the result shape gains no arm and no field, and the
four consumers see nothing change — which is what the cohort's no-second-anchor-shape commitment actually
constrains.

The alternative — refusing a fast-forward landing so the operator sees a fault rather than silence — was rejected
on its own terms. Refusing it _visibly_ requires detecting the shape, which is the same detection that admits it;
constraining costs identical machinery and returns a correctly-performed landing refused after the fact, on a
repository whose merge configuration the operator may not control.

The producer performs no ref or history lookup of its own, so descent reaches it as a supplied fact bound to the
exact landing/current pair it describes; a proof naming any other pair authorizes nothing. Under the prepared-base
relations that supplied descent replaces only the producer's exact-equality current-base refusal, and every other
check runs byte-for-byte unchanged. The descendant-merge relation cannot pass two of those checks by
construction — its landing's first parent is a descendant rather than the prepared base, and its tree is the
per-path composition rather than the candidate's — so the supplied fact widens to carry the relation kind, and the
producer's arm for that kind verifies what remains its own to verify: the candidate in the landing's second slot,
a slot-zero strict-descent proof bound to the recorded prepared base and the landing's first parent, and the
adapter-derived per-path composition verdict in place of landing-tree equality — refusing a deviating composition
as the same landing-topology fault, and a mis-bound proof on the same arm a mis-bound descent proof takes. The
adapter's separate insistence that the
candidate tree equal the _current base_ tree is **relocated, not removed**: it is re-read against the selected
landing commit, where it means what it always meant, rather than against a base that has since advanced — where it
would refuse every descendant case by construction. It stays a refusal applied after selection rather than a
survival test within it, so a landing whose tree was altered during resolution is refused rather than passed over
in favor of a commit whose tree the base does not hold.

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

The descent relation and the landing-relation kind reach the producer as **required** inputs rather than optional
ones. Every consumer in service today resolves through the single configured-base adapter, so requiring the fields
grants no reach that optionality would withhold; what it buys is that no future producer path can take exact
semantics by silently omitting the fact. Descent is a claim about a specific pair, and a caller that has not
established it should be unable to say nothing and be understood as saying "exact".

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
- **Testing:** focused real-Git DAGs own base advancement, descendant replay, ref races, and anchor reachability,
  carried through to claim retirement rather than stopping at anchor resolution — a candidate that resolves its
  anchor and then cannot be reclaimed passes every shallower check.
- **Rollout:** the core exact-base transform remains safe before this member lands.
- **Performance:** landing validation is proportional to recorded touched paths and dependencies, not repository
  size. Re-derivation is not — it re-runs the core's own composition, whose cost is the transform's existing cost —
  and the landing-commit search is one bounded enumeration of what the base gained since the prepared base, not a
  per-commit walk — guarded by an ancestry check, without which a prepared base whose history was replaced widens
  the enumeration past the advance it is meant to bound.

## Success Criteria

- A canonical full-protection candidate advances across unrelated base movement through one append-only merge.
- A regenerable projection is the only automatically resolved path, and it is re-derived rather than merged; every
  other conflict restores the bounded candidate.
- The restaged same-path receipt passes the core hooks and remains the sole live current receipt, through
  authorized advancing-shape arms on the commit gate, the projection regeneration assert, and the conflict
  remedy's provenance discovery — all deciding restatement by the same authored-block byte-equality proof — that
  leave every existing caller's verdict unchanged.
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
- ROADMAP is re-derived through the plan's own render and staged as the resolution, leaving the shared
  discovery-based remedy untouched for its own callers.
- The advanced receipt is sealed after the merge from live path reads, and every allowed path — projections
  included — matches the re-composed plan's projection, so an advanced receipt satisfies the same
  prospective-projection invariant core finalization enforces on every other receipt.
- Regenerable projections are excluded from the landing verdict's overlap model, so a base advance that changed
  only ROADMAP is admitted rather than refused.
- A candidate whose recorded source ref is the result-base ref is refused on its precondition, without mutating the
  repository, on a structural test rather than a source-kind check.
- A decomposition landed by fast-forward onto an advanced candidate resolves its anchor, with every pre-existing
  exact-base verdict unchanged.
- A merge landing over a descendant base records the landing merge itself as the landing commit, so one receipt's
  anchor facts read the same before and after unrelated base movement.
- A landed advanced candidate retires through the ordinary receipt-backed cleanup gate, because advancement
  restated its claim binding alongside the record rather than leaving the claim bound to the superseded base.
- A refused advancement leaves the candidate exactly as it found it — committed, unlanded, and no further torn
  down than before the attempt.
- No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate validator is
  added.

## Open Questions

[none]
