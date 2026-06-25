# Cohort: `cross-machine-coherence`

> _Coordination record for the cross-machine-coherence cohort — `partial-push-marker` and
> `stale-state-detect-and-pull`. Membership is **derived** from each member's `Cohort` field; this doc holds
> only what the cohort owns as a whole. Internal-dev-facing; not shipped. Each member's design lives in its own
> `draft-*`._

**Parent:** [none]

**Purpose:** Close the class of failure where a **sibling machine acts on stale or incomplete cross-machine
state at a session boundary** — "machine B is unaware of a state change machine A / origin made." The two
members are the symmetric halves of that concern: `partial-push-marker` is the **push side** (machine A's
incomplete notes push becomes _visible_ to B), and `stale-state-detect-and-pull` is the **pull / arrival side**
(B _detects_ its local state is stale — base ref, `plan/`-orphan, notes drift — and _gets current_). One
mechanism produces the cross-machine signal; the other consumes it and remediates.

> _Decomposed from `cross-machine-sync-coherence` (2026-06-25): the marker mechanism → `partial-push-marker`,
> the B-side detection cluster + the `arc sync` pull-leg → `stale-state-detect-and-pull`. The single-machine
> state-ref CAS shed to `state-ref-write-safety` (agile-parallelism); the former cohort sibling `coord-probe`
> relocated standalone to `external-coord-probe` (its branch-gone correctness had shipped in Worktree
> Foundation, leaving only an external-tracker enhancement — not cross-machine coherence)._

---

## Coordination

Sequencing: **no hard internal edge** — neither member `Depends On` the other; both depend only on
`worktree-foundation` (shipped). The soft pull runs `partial-push-marker` slightly upstream (it _produces_ the
marker `stale-state-detect-and-pull` consumes), but the consumer degrades gracefully without it, so the edge
never hardens. Pick order at activation by priority — the marker (`P1`, the data-loss closer) leads the
detection-and-pull member (`P2`).

### Shared contracts

- **Partial-push marker freshness** — produced by `partial-push-marker` (the remote sibling sync-state ref),
  consumed by `stale-state-detect-and-pull` on the B side (its drift detection reads "A attempted a push for
  HEAD X but didn't complete") and, optionally and cross-WU, by `external-coord-probe` (as a ranking signal).
  Authoritative design stays in the producer's draft; recorded here only as the seam.
- **Recovery-presentation register contract** — `partial-push-marker` specifies the three-register model and the
  payload-backed affordances the B-side consumer renders against; `stale-state-detect-and-pull` owns the actual
  rendering (a producer non-goal). Authoritative design lives in the producer's `spec-partial-push-marker.md`
  § 8 — recorded here, where the consumer reads it, as the unambiguous contract. The marker is **lag, not loss**:
  A's work is safe on A; it simply hasn't arrived.

  The consumer renders the two **B-side** registers below; **Act** (A, push-time: auto-retry → primed retry →
  informed defer) is producer-owned (§ 7) and never consumer-rendered. Each affordance traces to a concrete
  marker-payload field (§ 3 — `machineId`, `lastAttemptedCommit`, `attemptTimestamp`, `intent`):

  | Register    | Where                | Posture              | Affordance → payload field                                                          |
  |-------------|----------------------|----------------------|-------------------------------------------------------------------------------------|
  | **Aware**   | B, at session-init   | lag, not loss        | short-sha ← `lastAttemptedCommit` · when ← `attemptTimestamp` · whose ← `machineId` |
  | **Caution** | B, at the force gate | context for the call | the Aware fields **plus** "an incomplete push landed here; merge preserves both"    |

    - **Aware** — a calm, non-gating one-liner in session-init's existing advisory tier (alongside base-drift and
      local-ahead-notes). The operating agent proceeds-with-context and **never auto-resolves** — it does not
      force-push to "fix" stale notes.
    - **Caution** — the same payload surfaced at B's force gate as context for the destructive call; it informs the
      choice, it does not gate it (the human owns force with full information).
    - **Self-invalidation** — render an entry only while it is **live**. Liveness is the producer-side predicate
      (`intent` vs. origin's actual notes-ref state): _fulfilled_ once A's notes land at origin (the surface falls
      silent, no timer), else _live_ while the notes ref is still behind. The **14-day TTL** on `attemptTimestamp`
      (§ 6) is the backstop that ages out an intent an abandoned machine never returned to resolve.

### Soft coordination

- **No session-init edit collision.** Only `stale-state-detect-and-pull` edits `session-init.md` and the status
  probe envelope — it owns **all** B-side consumption: the base-ref-staleness slot (`baseBranchSync`-shaped,
  aligned with the shipped `baseDistance` channel), the clean-arm drift surfacing, the `plan/`-orphan sweep, and
  the marker's Aware-register rendering. `partial-push-marker`'s surfaces are disjoint — the push flow
  (`arc sync` / `arc release push`), the sync-state ref write, and `arc-handoff` (the Act register). The seam is
  the **sync-state ref schema** (see Shared contracts), not a shared workflow: align the ref/payload conventions
  so the producer writes what the consumer's probe slot expects.
- **One inbound-pull primitive.** `stale-state-detect-and-pull` owns the inbound pull used by _both_ the
  session-init base-ref pull and the `arc sync` bidirectional leg — built once, not per entry point.

### Cross-cohort

- **`adr-022` managed operational-state documents** depend on `partial-push-marker`'s transport hardening — the
  partial-push gap gates the "notes-synced" storage classification for those members. Coordinate; do not assume
  the transport solved. See `adr-022-managed-operational-state-documents.md` § Coordination.
- **`state-ref-write-safety`** (agile-parallelism cohort) is the **single-machine twin** of
  `partial-push-marker`: the marker guards cross-machine clobbering, the CAS guards same-machine inter-process
  clobbering. Both lift into `arc-backend`'s version-checked-writes substrate — the two halves of "don't
  clobber shared state."
- **`finalize-parallelism`** (agile-parallelism cohort) `Depends On` both members — this cohort is part of its
  last open gate (alongside `state-ref-write-safety`). `external-coord-probe` was dropped from that gate at the
  2026-06-25 restructure.

### Closeout criteria

The cohort archives when **both members ship** — clearing the cross-machine-coherence portion of
`finalize-parallelism`'s dependencies.

## Members

### `partial-push-marker`

- _Exposes:_ a remote sibling sync-state ref (Option A, settled — per-machine-keyed entries, union-merged)
  making a partial notes push visible to sibling clones, **plus** the A-side push-time recovery surface (the
  scope widened from B-side visibility to the full partial-push lifecycle). The cross-machine signal the other
  members read. (`P1`; the data-loss closer.)
- _Consumes:_ nothing from the sibling; depends only on shipped `worktree-foundation`.

### `stale-state-detect-and-pull`

- _Exposes:_ B-side arrival coherence — base-ref staleness probe, `plan/`-orphan sweep, notes/disk drift
  detection, retired-subdir cleanup, and a bidirectional `arc sync` / session-init inbound pull leg. (`P2`.)
- _Consumes:_ `partial-push-marker`'s freshness signal (soft; degrades without it); extends shipped projection
  (`notes-merge-coherence`) and ref-distance (`concurrent-work-conventions`) machinery.

## ADR anchors

- `adr-022-managed-operational-state-documents.md` — the notes-synced operational-state classification gated by
  `partial-push-marker`'s transport hardening.

---
