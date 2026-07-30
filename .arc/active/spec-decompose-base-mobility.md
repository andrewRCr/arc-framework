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
4. Extend the core integration-anchor fact to a live descendant current base.
5. Preserve ordinary exact-base behavior as the conservative fallback.
6. Leave no candidate that recovery cannot finish tearing down.

## Non-Goals

- Define or decode v3 evidence, allocation, planning profiles, cohort topology, or semantic distribution.
- Refresh a landed receipt, rewrite history, rebase, amend, force-push, or generalize conflict resolution.
- Implement extraction source thinning or its no-receipt recovery model.
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

The command establishes authority before it mutates anything. It validates the finalized receipt canonically —
the same validation that mints the transition overlay this operation later supplies to ROADMAP regeneration — and
then runs the descendant-base landing validator over the pinned base and candidate head. A refusal from either
aborts before any mutation, so the ordinary refusal costs no restore at all.

Only once both admit does the merge run. The two are not redundant and neither subsumes the other: the validator
is the semantic overlap authority over recorded paths, modes, types, and dependencies, while the merge can still
conflict on a path the recorded transition never touched. A conflict surviving a clean landing verdict is
therefore a genuine surprise rather than the expected refusal, and — ROADMAP excepted — it restores rather than
resolving. Overlap the validator refuses never reaches the merge; overlap only the merge can see never becomes an
automatic resolution.

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
base and preflight identity on the recorded cut map, re-composes the repository plan against the proven-safe base
from that unchanged authored cut, and re-assembles the preparation facts through the same constructor that built
them the first time. Every base-dependent identity is produced by the producer that owns it, and the core's
existing cross-checks between plan, map, and facts hold unchanged. Re-composition is not a second decision point:
the authored cut it composes from is byte-identical, and the incoming edges it reads at the new base are the ones
the landing validator has already cleared.

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
recorded transition patch is the complete overlap model. Non-touched paths are ignored by construction.

The validator is host-neutral. Exact-ref review and optional clearance wiring belong to
`decompose-planning-lane`.

### Descendant-current integration anchor

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

The producer performs no ref or history lookup of its own, so descent reaches it as a supplied fact bound to the
exact landing/current pair it describes; a proof naming any other pair authorizes nothing. What that supplied
descent replaces is only the producer's exact-equality refusal. The adapter's separate insistence that the
candidate tree equal the _current base_ tree is not relaxed but retired: read against the located landing commit
instead, it is already the producer's own landing-tree equality, and duplicating it against a base that has since
advanced would refuse every descendant case by construction.

Existing exact-base callers keep their current verdicts unchanged, and the anchor's structural consumers are
unmodified.

A result-branch commit, staged receipt, remote branch, clearance status, or old receipt in unlanded ancestry is
not an anchor. The adapter uses pin, validate, and reread; movement, deletion, or history replacement invalidates
the fact.

The fact is consumer-blind, so descendant reach extends to every consumer at once — receipt-backed cleanup, the
claim-retirement gate, landed-handoff emission, and the graduation transaction behind work-unit launch. Branching
it by consumer would mint the second consumer interface this design forbids. The mobility layer performs no
teardown of its own, and no second receipt or durable publication ledger is introduced.

Consumer-blindness carries a cost that is paid rather than avoided. The producer is reached from two call sites,
not one — the configured-base adapter and the pure landed-handoff resolver — so the descent fact is a **required**
input and the handoff path supplies it too: its Git adapter derives the relation exactly as the configured-base
adapter does, leaving the pure resolver a pass-through that still performs no history search of its own. An
optional fact defaulting to exact is the cheaper edit and the wrong one, granting descendant reach to one consumer
while withholding it from another — precisely the per-consumer branching this design forbids.

That distinction reads as a contradiction unless stated precisely. What is unmodified is how the four consumers
_consume_ a resolved anchor: their code, their contracts, and their refusal reasons. The handoff's own plumbing
changes because it is a second _producer_ call site, not because the fact was branched for it.

### Recovery must be able to finish what it starts

A bounded restore is only as good as the cleanup that completes it, and today that cleanup cannot complete. Candidate
teardown computes four independent absence facets — worktree registration, path, marker, and branch — but treats
"all four already absent" as its only success, sending every residual facet through an exactness check that
destroys nothing unless the candidate is intact. A partially torn-down candidate therefore refuses permanently:
once the worktree is gone and the branch remains, exactness can never hold again. Both refusals advertise a retry
that re-enters the identical path, so a terminal state reads as transient and loops the operator.

That failure is independent of base movement — it reproduces against a completely stable base, from any refused
finalization — but it is load-bearing here, because this work unit's restore guarantee is what produces partially
torn-down candidates. Mobility that cannot be cleaned up when the move is refused is worth little.

Teardown therefore becomes facet-wise and idempotent: each of registration, path, marker, and branch is removed
independently, and "nothing left" is success for that facet rather than a precondition across all four. Exactness
continues to gate destroying an **intact** candidate, so the wrong thing is never deleted; it does not gate
finishing the teardown of one already partially destroyed, whose identity is already pinned by claim, branch, and
path. A terminal refusal names the manual step instead of advertising a retry that cannot succeed.

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
immutable base/head pair, and neither a mismatch locus nor a validator-constructed action may carry it.

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
- **Performance:** validation is proportional to recorded touched paths and dependencies, not repository size.

## Success Criteria

- A canonical full-protection candidate advances across unrelated base movement through one append-only merge.
- ROADMAP is the only automatically resolved conflict; every other conflict restores the bounded candidate.
- The restaged same-path receipt passes the core hook and remains the sole live current receipt.
- Exact and strict-descendant bases land only when all touched paths, modes, types, and dependencies replay.
- The shared integration anchor extends to a descendant current base only after the canonical receipt and
  transition validate against the reread configured base.
- Ref movement, divergence, overlap, or unavailable immutable-pair binding produces one typed recovery action.
- A committed receipt parent resolves to the actionable `advance-base` arm instead of terminal prose guidance,
  while a committed preparation or unparseable record keeps its existing guidance.
- The base-advancing mode stays distinguishable from the core's uncommitted same-base receipt refresh at the
  command surface and in every refusal code.
- The landing verdict gates the merge; a refused verdict aborts before any repository mutation.
- Advancement re-derives every base-dependent fact through its own producer; a change to the authored cut, or a
  receipt identity that moves, aborts and restores.
- ROADMAP regenerates through the shared renderer with a supplied overlay, leaving the discovery-based remedy
  unchanged for its own callers.
- Candidate teardown completes from any partial state, and no terminal refusal advertises a retry that re-enters
  the same path.
- No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate validator is
  added.

## Open Questions

[none]
