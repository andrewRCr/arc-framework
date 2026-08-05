# Spec (`detailed` · `RFC`): decompose-extraction

- **Origin:** [internal]

- **Purpose:** Extract unbuilt planning scope into independently deliverable work units while the origin survives,
  landing complete destinations before an explicit, byte-preserving, independently retryable source finish.

---

## Introduction / Context

Retirement decomposition replaces an origin completely and seals the transition with a retirement receipt.
Extraction is intentionally different: the origin remains authoritative for retained scope, its implementation
work must not be treated as a rider, and source thinning occurs only after the additive result has landed.

The transform therefore has two safe legs. First it creates and lands new destinations without touching the
source. Later, from the surviving source, an explicit preview/apply command proves those destinations in the live
integration base and removes only the approved source units.

This work unit consumes the v3 inventory, allocation, planning-profile, cohort-topology, exact-base result,
workflow, and mechanical validation contracts from `decompose-transform-integrity`. It does not depend on
base-mobility: exact-base refusal remains a safe floor.

## Goals

1. Create a complete additive result from exact committed source evidence without mutating the surviving origin.
2. Require every extracted new member to own substantive source material.
3. Prevent multi-member cohortless fan-out and preserve an origin-addressable durable anchor.
4. Preview and explicitly apply byte-exact source thinning only after all transferred destinations have landed.
5. Make finish idempotent and recoverable from changed source, missing destinations, partial apply, or lost scratch.
6. Preserve the no-extraction-receipt and no-cross-branch-transaction boundary.

## Non-Goals

- Retire the origin, create a retirement receipt, or grant receipt-backed teardown/launch authority.
- Split already-committed implementation across several results; the existing full-split escape hatch remains.
- Infer semantic allocation, transfer fuzzy source matches, or reconstruct a lost authored cut.
- Add a pending record, extraction ledger, rollback journal, scheduler state, or automated post-merge launch claim.
- Implement committed-unlanded refresh, descendant-base admission, or planning-lane policy.

## Proposed Design

### Anchored extraction placement

The surviving origin is always a logical decomposition anchor. When extraction creates multiple new WUs, it must
also use an origin-named cohort/subcohort, or the existing parent cohort's at-cap fan-out anchor. Multi-member
`cohortless` extraction is invalid. A one-member extraction may remain cohortless when every source unit has a
destination-owned home and the surviving origin is an adequate human anchor.

The core's doctrine, `assess-cohort-fit`, cut-map validation, and topology planner enforce this rule. Extraction
consumes that anchor fact and reports its current display path. Member metas remain authoritative for current
membership, dependencies, priority, workflow, and state.

Extraction creates no durable launch publication. Its initial continuation is the surviving active origin, or an
explicit operator decision to continue none; newly created leaves remain ordinarily startable after landing.
Automated launch may be added only through a separately authorized exact-set claim, never by fabricating a
retirement receipt.

### Additive result leg

The completed v3 map allocates every scanned source unit exactly once or explicitly drops it with a reason. Every
new extracted member owns at least one real destination-owned unit; an existing home or cohort-shared unit cannot
stand in for substantive member scope.

The command uses the core's validated exact-base result projection, profile inference, path-state planning,
dependency transforms, cohort topology, and bounded recovery. It scaffolds and stages only additive destination,
dependency, cohort, and ROADMAP changes. It creates no preparation or receipt authority and leaves the source
branch, source artifacts, and committed implementation bytes unchanged.

Prepared result-branch artifacts are not published work units. Before the additive result lands, the configured
integration base must not resolve or start a new member from the candidate or source branch. After landing and base
synchronization, ordinary lifecycle resolution discovers the members from the integration base and derives their
ready or blocked state from the landed metas. Extraction does not create a cross-branch launch shortcut.

The one post-authoring distribution interlock reviews actual destinations, retained-origin ownership, reasoned
drops, dependencies, and anchor orientation before the additive commit. The shared cohort-consistency hook keeps
an incomplete Purpose scaffold uncommittable.

### Explicit source finish

The mutually exclusive command mode is:

```text
arc decompose <origin> --finish <cut-map>
```

It previews by default; `--apply` is valid only with `--finish`. Invocation requires the exact surviving source
branch/head and clean relevant paths.

The finish adapter pins the configured integration base and proves every transferred destination's exact path,
locator, stored bytes, mode, profile, and dependency there. It rereads the base immediately before mutation and
refuses branch-only, uncommitted, partial, changed, missing, or concurrently moved targets.

### Byte-preserving thinning

A pure planner consumes the core scanner's original UTF-8 byte ranges and returns each source path's before digest
and mode, retained bytes or deletion, and removed locators.

- Surviving-origin allocations remain.
- Units transferred to validated new-member, existing-home, or cohort-coordination destinations are removed.
- A reasoned drop is explicit removal authority approved by the distribution interlock.
- Unallocated or implicit deletion is impossible.

All source preimages are compare-and-swapped before the first write. Apply preserves untouched bytes, BOM, newline
style, ordering, and file mode. A failure restores only bounded preimages and reports any remaining path exactly.

### Proportional recovery

Finish returns `previewed`, `finished`, `already-finished`, or one typed refusal. Authored choices carry forward
only while the exact v3 source ID and locator resolve uniquely and the destination remains valid; machine digests
may refresh. Added, moved, removed, or ambiguous units require reauthoring.

If scratch is lost, preflight regenerates machine inventory and the operator reauthors the semantic cut against
landed facts. Git may prove destinations and already-applied thinning, but it cannot reconstruct intent.

## Alternatives & Rationale

### Thin the source in the additive result

Rejected because it couples two branches and can delete source scope before destinations are durably available.

### Add an extraction receipt or transaction record

Rejected. The surviving source, landed destinations, exact map, and bounded preimages provide recovery without a
second durable coordinator.

### Match changed units by heading text or content similarity

Rejected because fuzzy transfer can silently move a human ownership decision to the wrong block.

### Permit multi-member cohortless extraction

Rejected because it destroys the operator's origin-addressable model of the fan-out even when content ownership is
mechanically complete.

## Cross-cutting Considerations

- **Safety:** all destructive work is source-local, previewed, explicit, and compare-and-swap guarded.
- **Compatibility:** the core v3 map is required; legacy maps cannot author extraction.
- **Human operation:** the surviving origin and required multi-member anchor preserve the split's mental model.
- **Testing:** pure byte-planner tests combine with one real additive-land-then-finish topology.
- **Rollout:** before this member lands, the core supports retirement only.

## Success Criteria

- Extraction lands complete profile-correct destinations before any source byte changes.
- Multi-member extraction cannot be cohortless and reports its durable logical anchor.
- The surviving origin, committed implementation, and unrelated source work remain unchanged through the additive
  leg.
- New members are nonexistent to base-rooted lifecycle resolution before the additive result lands and become
  ordinarily discoverable, ready, or blocked only from the synchronized landed base.
- Finish previews by default and applies only after exact live-base destination validation and reread.
- Thinning preserves every byte and mode outside the approved transfer/drop set across Markdown and whole files.
- Repeat finish is idempotent; changed source, base race, partial apply, missing target, and lost scratch remain
  recoverable without durable coordination state.
- No retirement receipt, extraction ledger, cross-branch transaction, fuzzy reconciliation, or automated launch
  authority is created.

## Open Questions

[none]
