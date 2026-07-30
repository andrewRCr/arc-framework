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

1. Refresh a committed but unlanded full-protection candidate through one append-only base merge.
2. Admit landing over an exact descendant base only when the recorded patch and dependencies still replay exactly.
3. Bind every decision to one immutable base/head pair and fail closed on movement.
4. Extend the core integration-anchor fact to a live descendant current base.
5. Preserve ordinary exact-base behavior as the conservative fallback.

## Non-Goals

- Define or decode v3 evidence, allocation, planning profiles, cohort topology, or semantic distribution.
- Refresh a landed receipt, rewrite history, rebase, amend, force-push, or generalize conflict resolution.
- Implement extraction source thinning or its no-receipt recovery model.
- Grant planning-lane or CODEOWNERS authority; `decompose-planning-lane` owns that optional host policy.
- Add a pending record, refresh ledger, landing transaction, cache, token, or operator-authored Git proof.
- Treat rebase, cherry-pick, or revert state as merge-parent authority.

## Proposed Design

### Consume one canonical validator boundary

Mobility consumes the core's finalized v3 receipt, mode-aware transition patch, dependency inventory,
`ValidatedTransitionOverlay`, and typed mismatch/action result. It supplies exact Git objects and path states
through injected readers but never recomputes canonical identities, parses receipt JSON independently, or judges
semantic destination content.

### Append-only committed-unlanded refresh

The explicit route is:

```text
arc decompose <origin> --refresh <receipt-id>
```

It exists only under full protection. The command requires the exact clean deterministic candidate, proves that
its canonical receipt commit is not reachable from the configured base, pins the live base, and merges that base
into the candidate without rebase, amend, or force-push.

Only canonical ROADMAP regeneration may be resolved automatically. Any other conflict, path/type/mode overlap,
dependency drift, or ref movement aborts and restores the bounded pre-merge candidate. After the merge, the command
preserves all semantic destination bytes and modes, regenerates ROADMAP through its existing owner, and stages one
same-path current receipt accepted by the core hook verdict.

Partial protection commits directly on the configured base and has no committed-unlanded refresh state.

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

The core defines `DecompositionIntegrationAnchor` and derives it for an exact prepared base. Mobility reuses that
shape and extends its derivation to the current configured base after the descendant validator proves the same
canonical receipt and transition against the immutable live base/head pair. It does not define another fact or
consumer interface.

A result-branch commit, staged receipt, remote branch, clearance status, or old receipt in unlanded ancestry is
not an anchor. The adapter uses pin, validate, and reread; movement, deletion, or history replacement invalidates
the fact.

Receipt-backed cleanup may consume this fact, but the mobility layer does not perform teardown. No second receipt
or durable publication ledger is introduced.

### One recovery vocabulary

Mobility returns the core action vocabulary: `retry`, `refresh-base`, `re-preflight`, or `reauthor`, with the
stable mismatch locus. It adds no prose-based remedy classifier. A host unable to retain an immutable base/head
pair returns the core `refresh-base` action, executed through this work unit's append-only refresh command.

## Alternatives & Rationale

### Require every candidate to restart from the new base

Safe but needlessly destructive after semantic authoring and review. Exact append-only refresh retains the
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
- **Testing:** focused real-Git DAGs own refresh, descendant replay, ref races, and anchor reachability.
- **Rollout:** the core exact-base transform remains safe before this member lands.
- **Performance:** validation is proportional to recorded touched paths and dependencies, not repository size.

## Success Criteria

- A canonical full-protection candidate refreshes across unrelated base advancement through one append-only merge.
- ROADMAP is the only automatically resolved conflict; every other conflict restores the bounded candidate.
- The same-path refreshed receipt passes the core hook and remains the sole live current receipt.
- Exact and strict-descendant bases land only when all touched paths, modes, types, and dependencies replay.
- The shared integration anchor extends to a descendant current base only after the canonical receipt and
  transition validate against the reread configured base.
- Ref movement, divergence, overlap, or unavailable immutable-pair binding produces one typed recovery action.
- No rebase, amend, force-push, mobility ledger, host-policy grant, or duplicate validator is added.

## Open Questions

[none]
