# Draft: session-locus-operability-hardening

- **Origin:** [internal] — follows the repository-wide recovery stop caused by an Errand lease minted with an
  unverifiable `/usr/bin/bash` process boundary on 2026-08-04. The immediate continuity repair is preserved by
  commit `5c6dd5c74`.
- **Purpose:** Make session locus authority fail closed at the affected boundary without turning one degraded
  checkout into a repository-wide outage, and establish durable ownership continuity across ordinary CLI process
  boundaries.
- **State:** Planned follow-up to the immediate transient-lease continuity repair.

---

## Problem / Motivation

The session-locus model currently composes two individually conservative choices into a global failure amplifier:

1. Session ownership is inferred from native process ancestry. A legitimate directed command can encounter an
   unrecognized shell boundary and produce an unverifiable anchor.
2. Recovery and reconciliation stop when any managed row has an unknown lease, including a foreign locus unrelated
   to the healthy work unit trying to recover.

The incident halted every active session and work unit until the exact lease generation was repaired. The immediate
hotfix prevents Errand open and locus attach from minting another unverifiable lease and permits an exact,
operator-confirmed unknown generation to resume. It does not settle the intended fault domain, replace ancestry as
the durable session identity, or prove that every lease producer and consumer preserves continuity.

## Approach (provisional)

- Define which relationships make a degraded locus authoritative for a command: current, selected target, parent,
  allocation target, or an exact alias dependency. Keep unrelated rows observable without letting them stop healthy
  recovery or reconciliation.
- Settle a durable session capability that survives ordinary CLI subprocess boundaries. Treat process inspection as
  liveness evidence rather than assuming ancestry alone is a sufficient conversational identity.
- Audit every role/lease producer, attachment, refresh, release, recovery, and teardown path against one continuity
  invariant: a successful mutation must leave authority that the next legitimate command can verify or safely
  recover.
- Exercise multi-session fail-first fixtures: a healthy work unit beside unknown primary residue, affected-locus
  recovery, foreign-live refusal, command-process replacement, harness restart, and exact-generation races.
- Reassess repository-wide stop aggregation only after the affected-locus safety proof is explicit; fault
  containment must not weaken double-occupancy prevention.

## Ownership Boundaries

- `locus-generation-binding` owns exact generation capabilities and under-lock revalidation.
- `errand-transient-lifecycle` owns leave, pause, materialize, and identity-state transitions.
- `staleness-guard-policy` owns which stale development commands may mutate state; it must absorb the discovered
  omission of locus mutators from the hard-fail set.
- Cross-machine arbitration and backend storage evolution remain outside this work unless the durable capability
  cannot be specified safely without them.

## Initial Success Conditions

1. Recovery of a healthy work-unit locus remains available when an unrelated checkout has an unknown lease.
2. The affected checkout still fails closed, and no operator confirmation can take over a verifiably foreign live
   lease.
3. Every successful lease-producing command leaves a generation the next legitimate command can verify or recover
   through an exact, non-destructive path.
4. Ordinary CLI subprocess changes do not strand a live ARC session or require a false `no live session`
   attestation.
5. Multi-session tests prove both fault containment and unchanged exclusivity across the primary and linked
   worktrees.
