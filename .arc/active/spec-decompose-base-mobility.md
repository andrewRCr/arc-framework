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

Only canonical ROADMAP regeneration may be resolved automatically. Any other conflict, path/type/mode overlap,
dependency drift, ref movement, or raised resolution aborts and restores the bounded pre-merge candidate. After the
merge, the command preserves all semantic destination bytes and modes, regenerates ROADMAP, and stages one
same-path current receipt accepted by the core hook verdict.

Partial protection commits directly on the configured base and has no committed-unlanded state to advance.

#### ROADMAP regeneration supplies its overlay rather than discovering one

The shared merge-conflict remedy discovers transition authority from a pinned snapshot and requires the receipt's
recorded result base to equal the live configured base. Advancement is precisely the state where those differ, so
that discovery path refuses by construction and cannot serve this command.

The remedy exists because a commit hook must _find_ authority it was not given. This command already holds
validated authority for the exact receipt it was invoked with, so it regenerates through the same ROADMAP renderer
with the overlay **supplied**, skipping only the discovery and selection layer that has nothing to decide here.
That adds no second renderer and no second conflict classifier; the generic remedy keeps its own path unchanged for
every caller that must still discover.

#### Advancing the base re-derives machine facts and never the cut

The recorded result base is machine-derived, so advancement must restate it. The authored half of the cut map is
not: it is a separate block whose bytes carry every semantic decision a human made and approved.

The operation therefore substitutes the proven-safe base into the machine facts and re-derives the dependent
identities through the core's own digest helpers, gated on the landing validator's verdict. It does not re-run
plan composition, because there is no new plan to compose — and the guards that refuse a moved result base exist
to stop a plan executing against a base it was not composed for, a doubt the validator has already discharged.

One invariant governs the whole operation: **the machine half may advance; the authored half must remain
byte-identical.** A digest inequality over the authored block aborts and restores. The receipt identity is
unaffected either way, being derived from origin, source branch, and source head alone, which is what keeps the
refreshed receipt on its original path.

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
as separate fields, so a descendant current base needs no new field, fact, or consumer interface — and extends the
derivation at two named points:

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

Existing exact-base callers keep their current verdicts unchanged, and the anchor's structural consumers are
unmodified.

A result-branch commit, staged receipt, remote branch, clearance status, or old receipt in unlanded ancestry is
not an anchor. The adapter uses pin, validate, and reread; movement, deletion, or history replacement invalidates
the fact.

The fact is consumer-blind, so descendant reach extends to every consumer at once — receipt-backed cleanup, the
claim-retirement gate, landed-handoff emission, and the graduation transaction behind work-unit launch. Branching
it by consumer would mint the second consumer interface this design forbids. The mobility layer performs no
teardown of its own, and no second receipt or durable publication ledger is introduced.

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
retrying or discarding it — because at core scope no safe route exists. That is precisely the state this work unit
repairs, so the cause resolves to `advance-base` whenever the established facts authorize the command, and falls
back to the existing guidance when they do not. A host unable to retain an immutable base/head pair resolves to
the same arm.

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
- A committed candidate parent resolves to the actionable `advance-base` arm instead of terminal prose guidance
  whenever the established facts authorize the command.
- The base-advancing mode stays distinguishable from the core's uncommitted same-base receipt refresh at the
  command surface and in every refusal code.
- Advancement restates only machine-derived facts; a change to the authored half of the cut map aborts and
  restores.
- ROADMAP regenerates through the shared renderer with a supplied overlay, leaving the discovery-based remedy
  unchanged for its own callers.
- Candidate teardown completes from any partial state, and no terminal refusal advertises a retry that re-enters
  the same path.
- No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate validator is
  added.

## Open Questions

[none]
