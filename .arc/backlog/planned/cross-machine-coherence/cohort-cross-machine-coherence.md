# Cohort: `cross-machine-coherence`

> _Coordination record for the cross-machine-coherence cohort — `coord-probe` and
> `cross-machine-sync-coherence`. Membership is **derived** from each member's `Cohort` field; this doc holds
> only what the cohort owns as a whole. Internal-dev-facing; not shipped. Each member's design lives in its own
> `draft-*`._

**Parent:** [none]

**Purpose:** Close the class of failure where a **sibling machine acts on stale or incomplete cross-machine state
at a session boundary**. Both members answer the same underlying question — "machine B is unaware of a state
change made on machine A" — from two orthogonal angles: `coord-probe` resolves _where should I be working_ when
in-git signals fail or are insufficient (cross-machine resume, branch-gone, team scale), and
`cross-machine-sync-coherence` makes a _partial notes push_ visible to siblings so B no longer reads a stale
handoff as complete. Distinct mechanism classes (read-side coordination discovery vs. sync-state transport
coherence); one shared concern (cross-machine coherence at session-init), which is why they group rather than
sit as unrelated P1s.

---

## Coordination

Sequencing: **no hard internal edge** — neither member `Depends On` the other; both depend only on
`worktree-foundation` (shipped). The soft pull runs `cross-machine-sync-coherence` slightly upstream (its
sync-state freshness is a candidate signal into `coord-probe`'s ranking — see Shared contracts), but
`coord-probe` ships its v1 without that signal, so the edge never hardens. Pick order at activation by
re-grounding cost and determinacy, not dependency.

### Shared contracts

- **Sync-state freshness as a probe signal** — owned by `cross-machine-sync-coherence` (the remote partial-push
  / sync-state marker), optionally consumed by `coord-probe`. Once a sibling can see "machine A attempted a notes
  push for HEAD X but didn't complete," that freshness becomes one candidate signal in `coord-probe`'s
  where-am-I ranking. **Soft, not a gate:** `coord-probe` v1 ships with in-git + `gh` signals only; the
  sync-state signal joins later. Authoritative design stays in each owner's draft; recorded here only as the
  seam.

### Soft coordination

- **Shared session-init surface.** Both members edit `session-init.md` and the status probe envelope:
  `coord-probe` adds a branch-gone fire-point that consumes the probe; `cross-machine-sync-coherence` adds a
  base-ref-staleness / sync-state surface (a `baseBranchSync`-shaped slot) and sharpens the clean-arm
  `loadNeeded` drift surfacing. Align slot/envelope conventions and sequence the edits so the two don't collide
  on the same workflow.
- **Grooming status (2026-06-25).** Both drafts predate substantial shipped work and need a re-grounding pass
  before spec: `coord-probe` (2026-04-28) carries stale `plan-*.md` sequencing and an unabsorbed ADR-020
  `pm.mode: external` collapse; `cross-machine-sync-coherence` (2026-05-05) self-declares "not ready for PRD
  promotion" and its inbound buffer leans on now-shipped primitives (the projection bridge from
  `notes-merge-coherence`, the `origin/<base>`-distance primitive from `concurrent-work-conventions`, folded-in
  defects from `async-merge-lifecycle` / `lifecycle-state-resolver` / `errand-lattice`). `cross-machine-sync-coherence`
  is a **decompose candidate** (narrow partial-push marker vs. broad sync-state coherence, plus a separable
  base-ref-staleness probe and a CAS-on-state-refs concern that "wants its own home"); if it splits, the
  resulting members' coordination lands here.

### Cross-cohort

- **ADR-022 managed operational-state documents** depend on `cross-machine-sync-coherence`'s transport
  hardening — the partial-push gap gates the "notes-synced" storage classification for those members. Do not
  assume the transport is solved; coordinate. See `adr-022-managed-operational-state-documents.md`
  § Coordination.
- **`finalize-parallelism`** (agile-parallelism cohort) `Depends On` **both** members — this cohort is its last
  open gate (its other deps, `single-owner-wu-model` and `out-of-wu-entry`, have shipped). Both members shipping
  unblocks it.

### Closeout criteria

The cohort archives when **both members ship** (`coord-probe` and `cross-machine-sync-coherence`, or its
decomposition's members) — which clears `finalize-parallelism`'s last dependency.

## Members

### `coord-probe`

- _Exposes:_ a `coord-probe` method + `arc coord probe` CLI (pluggable adapters: bundled `in-git` / `gh`, custom
  contract) returning a candidate list at session-init's branch-gone fire point — the read-side "where should I
  be working" answer.
- _Consumes:_ `cross-machine-sync-coherence`'s sync-state freshness as an optional ranking signal (soft; v1
  ships without it).

### `cross-machine-sync-coherence`

- _Exposes:_ a remote signal making a partial notes push visible to sibling clones (sync-state marker /
  freshness), plus the session-init drift-surfacing it feeds — the cross-machine coherence other members read.
- _Consumes:_ nothing from `coord-probe`; depends only on shipped `worktree-foundation` and the shipped
  notes/base-distance primitives it extends.

## ADR anchors

- `adr-020-adopt-principle-anchored-scalable-core.md` — collapses `pm.mode: external`, so `coord.adapter`
  activates on a configured tracker pointer rather than keying off `pm.mode == external`.
- `adr-022-managed-operational-state-documents.md` — the notes-synced operational-state classification gated by
  `cross-machine-sync-coherence`'s transport hardening.

---
