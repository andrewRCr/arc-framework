# Spec (`detailed` · `RFC`): decompose-extraction

- **Origin:** [internal]

- **Purpose:** Extract unbuilt planning scope into independently deliverable work units while the origin survives,
  landing complete destinations before an explicit, byte-preserving, independently retryable source finish.

---

## Introduction / Context

Retirement decomposition replaces an origin completely and records the transition in a durable transition record —
kind, successors, and the authored disposition of each incoming dependency edge. Extraction is intentionally
different: the origin remains authoritative for retained scope, its implementation work must not be treated as a
rider, and source thinning occurs only after the additive result has landed. The surviving origin itself is
extraction's durable record — it stays addressable, and the landed metas carry every repointed dependency edge —
so extraction writes no transition record of any kind.

The transform therefore has two safe legs. First it creates and lands new destinations without touching the
source. Later, from the surviving source, an explicit preview/apply command proves those destinations in the live
integration base and removes only the approved source units.

This work unit consumes the core's v3 inventory, allocation, planning-profile, cohort-topology, and mechanical
validation contracts from `decompose-transform-integrity`, and composes the core's reusable sub-planners —
exact-base path-state planning, plan composition, dependency transforms, internal topology, allowed-path
enforcement, and bounded preimage recovery — under a new additive-only result composer; the retirement projection
itself is retirement-coupled and stays untouched. Base mobility has shipped for the retirement candidate
(`--advance-base`); extraction does not participate — exact-base refusal remains its safe floor.

## Goals

1. Create a complete additive result from exact committed source evidence without mutating the surviving origin.
2. Require every extracted new member to own substantive source material — a net-new destination→allocation
   coverage check over the core's allocation→destination validation.
3. Keep multi-member extraction origin-addressable: the surviving origin counts as a placement constituent, so
   more than one new member forces `cohort`, `subcohort`, or `at-cap` placement — never `direct-member`.
4. Preview and explicitly apply byte-exact source thinning only after all transferred destinations have landed.
5. Make finish idempotent and recoverable from changed source, missing destinations, partial apply, or lost scratch.
6. Preserve the no-record boundary: no transition record, extraction receipt, or cross-branch transaction.
7. Land extraction as a first-class arm of shipped doctrine: `assess-boundary-fit.md`, `decompose-work-unit.md`,
   and `strategy-work-organization.md` state the same extraction boundary once this work unit ships.

## Non-Goals

- Retire the origin, write a transition record of any kind, or grant record-backed teardown/launch authority.
- Split already-committed implementation across several results; the existing full-split escape hatch remains.
- Infer semantic allocation, transfer fuzzy source matches, or reconstruct a lost authored cut.
- Add a pending record, extraction ledger, rollback journal, scheduler state, or automated post-merge launch claim.
- Admit extraction maps to `--advance-base` or add committed-unlanded refresh for the extraction candidate: the
  mode refuses them with a typed reason; a stale candidate is discarded through ordinary cleanup and re-executed
  against the current base.

## Proposed Design

### Anchored extraction placement

The surviving origin is always a logical decomposition anchor and always counts as a placement constituent. When
extraction creates more than one new member, the completed map must select `cohort`, `subcohort`, or `at-cap`
placement; `direct-member` is valid only when extraction creates exactly one new member, every non-dropped source
unit has a destination-owned or retained home, explicitly reasoned drops remain valid, and the surviving origin is
an adequate human anchor. Under `at-cap` placement the origin's name persists as the parent cohort's write-once
fan-out provenance note, not as a live grouping node, and the origin is never listed among the rendered fan-out
members — it counts for placement cardinality only.

The core's internal topology planner already accepts a surviving origin; extraction becomes its first caller. The
origin folds into the constituent count for the multi-member gates, and the planner gains a direct-member arm so a
surviving origin plus exactly one new member remains valid. Extraction reports the anchor's current display path.
Member metas remain authoritative for current membership, dependencies, priority, workflow, and state.

Shipped doctrine currently states the inverse boundary — `assess-boundary-fit.md` and `decompose-work-unit.md`
exclude an active origin and extraction from the core transform, while `strategy-work-organization.md`
§ Active-state decomposition still promises extraction as a directly supported operation. This work unit amends
all three surfaces to one shared statement: extraction is the supported active-origin arm, entered through its own
command mode, with the core retirement transform unchanged.

Extraction stores no launch advice, publication packet, or selected successor. Newly created leaves become
ordinarily startable only through their landed base metas; the distribution interlock's human orientation names
the surviving active origin as the natural continuation.

### Additive result leg

Extraction admits a surviving origin in started `Planning` or `Active` state: the retirement preflight's
started-planning gate widens with an origin-state arm, the machine envelope's source kind gains a matching value,
and profile inference reads the same design-artifact families. A backlog stub is not an extraction origin — it
has no committed implementation to protect, and splitting one is retirement decomposition's territory — so a
backlog-stub envelope under the extraction shape is a typed decode mismatch. The scanned inventory remains those
design artifacts — the origin's task list is never a source unit, so pruning it after extraction is ordinary
work-unit editing by the origin's owner, not part of the transform. After finish applies, that ordinary edit and
any affected Next Task / Next Action pointer reconciliation join the durable finish release for both Active and
started-Planning origins. The envelope's source kind and the map's authoring shape cross-validate at decode: an
`Active`-state origin is valid only under the extraction shape, and the retirement shapes accept only the
retirement source kinds — widening admission cannot open the retirement transform to a surviving origin.

The completed v3 map declares itself with an explicit `extraction` authoring shape — at least one new member,
existing homes permitted, placement counting the surviving origin as a constituent (`direct-member` valid only
with exactly one new member; the cohort placements valid from one new member up) — and allocates every scanned
source unit exactly once: to a new-member destination, an existing home, cohort coordination, an explicit
retained-by-origin disposition, or an explicitly reasoned drop. Every non-dropped unit therefore has either a
destination-owned home or an explicit retained-origin home; a reasoned drop remains approved removal authority
and is not rejected for having no surviving home. The schema's existing ownership tag remains
`destination-owned` for retained-origin and drop dispositions. Retained-by-origin dispositions are valid only
under the extraction shape; retirement-shaped maps reject them at decode, so the retirement transform stays
fail-closed against extraction content. Every new extracted member owns at least one real destination-owned unit;
an existing home, cohort-shared unit, or retained origin scope cannot stand in for substantive member scope. That
destination→allocation coverage check is net-new — the core validates only that each allocation names a declared
destination.

Incoming dependency edges keep the authored-disposition contract, widened under the extraction shape alone: a
`replace` disposition may name the surviving origin among its targets — the origin alone keeps the dependent's
edge unchanged, the origin beside a new member keeps and extends it — so a dependent of retained scope is never
silently stripped of its origin dependency. The retirement flow's origin-reference refusals do not apply under
the extraction shape.

A new additive-only composer produces the result from the core's reusable sub-planners: exact-base path-state
planning, plan composition, dependency transforms, internal topology, allowed-path enforcement, and bounded
preimage recovery. It scaffolds and stages only additive destination, dependency, cohort, and ROADMAP changes; it
plans no retirement delta and requires no predecessor meta. Conservation validates the retained origin under a
surviving-origin arm — the retirement flow's origin-as-destination refusal does not reach explicitly retained
scope — and leaves the source branch, source artifacts, and committed implementation bytes unchanged. The
composer mints no origin-suppressing transition overlay — the shared plan contract's overlay slot becomes
optional rather than minted-and-discarded — so the surviving origin stays visible in the staged ROADMAP
projection, and the shared plan composition's retirement-coupled exclusive inputs likewise become optional rather
than being fed degenerate claims. Extraction reuses the core's existing projection render seam — it adds no
renderer contract or stamp variant of its own. Its result report carries retained-origin ownership, reasoned
drops, and anchor orientation as typed fields. The additive leg enters through its own mutually exclusive mode —
`arc decompose <origin> --extract <cut-map>` — and the retirement modes (`--execute`, `--advance-base`) refuse an
extraction-shaped map with a typed reason.

Prepared result-branch artifacts are not published work units. New members scaffold as Planning-state backlog
metas on the extraction candidate branch: a base-rooted checkout does not contain them, and in-flight
derivation — which surfaces only active metas and filters marker-owned candidate branches — never reports them.
After landing and base synchronization, ordinary lifecycle resolution discovers the members and derives their
ready or blocked state from the landed metas. This pre-landing invisibility is asserted by a dedicated test rather
than assumed. Extraction does not create a cross-branch launch shortcut.

The workflow's sole semantic distribution interlock reviews the actual distributed authority, dependency effects,
and topology; extraction widens its surfacing set with the result report's retained-origin ownership, reasoned
drops, and anchor orientation — CLI-reported fields, never agent re-derivation — before the additive commit. The
shared cohort-consistency check learns the scaffold's `—` finalization sentinel as an unsatisfied Purpose floor —
closing a live gap that today lets the incomplete scaffold commit — keeping it uncommittable across the
backlog-planned paths extraction scaffolds into.

### Explicit source finish

The finish leg is extraction's second mutually exclusive mode on the command's deliberately narrowed surface
(beside the retirement modes `--preflight`, `--execute`, `--advance-base` and extraction's own `--extract`):

```text
arc decompose <origin> --finish <cut-map>
```

It previews by default; `--apply` is valid only with `--finish`. Invocation requires the exact surviving source
branch/head and clean relevant paths.

The finish adapter pins the configured integration base and proves every transferred destination's exact path,
locator, stored bytes, mode, profile, and dependency there. It rereads the base immediately before mutation and
refuses branch-only, uncommitted, partial, changed, missing, or concurrently moved targets.

### Byte-preserving thinning

The core scanner computes each unit's byte offsets today and discards them; extraction widens the content-unit
contract additively so every scanned unit carries its original UTF-8 byte range. A pure planner consumes those
ranges and returns each source path's before digest and mode, retained bytes or deletion, and removed locators.

- Surviving-origin allocations remain.
- Units transferred to validated new-member, existing-home, or cohort-coordination destinations are removed.
- A reasoned drop is explicit removal authority approved by the distribution interlock.
- Unallocated or implicit deletion is impossible.

All source preimages are compare-and-swapped before the first write. Apply preserves untouched bytes, BOM, newline
style, ordering, and file mode. A failure restores only bounded preimages and reports any remaining path exactly.

### Proportional recovery

Finish returns `previewed`, `finished`, `already-finished`, or one typed refusal. A `finished` apply leaves exact
source mutations staged; the origin owner reconciles the surviving task list and affected Next Task / Next Action
pointers, exact-set verifies the combined release, and commits it before candidate cleanup. An
`already-finished` result makes no new mutation and requires proof that this state is already durable rather than a
new ceremonial commit. Authored choices carry forward only while the exact v3 source ID and locator resolve
uniquely and the destination remains valid; machine digests may refresh. Added, moved, removed, or ambiguous units
require reauthoring.

If scratch is lost, preflight regenerates machine inventory and the operator reauthors the semantic cut against
landed facts. Git may prove destinations and already-applied thinning, but it cannot reconstruct intent. A failed
or stale additive attempt leaves only an ARC-owned candidate that ordinary cleanup removes; extraction adds no
discard verb or recovery protocol of its own.

## Alternatives & Rationale

### Thin the source in the additive result

Rejected because it couples two branches and can delete source scope before destinations are durably available.

### Write a surviving-origin transition record

Rejected. The record's slot is exclusive per origin, so an extraction record would occupy the slot a later genuine
retirement needs; its kinds and consumers assume a terminal origin; and extraction's one irreproducible fact set —
the repointed dependency edges — lands durably in the affected metas themselves. The surviving origin is the
record.

### Match changed units by heading text or content similarity

Rejected because fuzzy transfer can silently move a human ownership decision to the wrong block.

### Permit multi-member extraction under `direct-member` placement

Rejected because it destroys the operator's origin-addressable model of the fan-out even when content ownership is
mechanically complete.

### Participate in `--advance-base`

Rejected for this member. The retirement candidate earns advancement because reauthoring a full retirement is
expensive; an extraction candidate is cheap to regenerate, its authored choices carry forward under the recovery
rules, and the finish leg already revalidates against the live base by design. The mode refuses extraction maps
with a typed reason instead of admitting them.

## Cross-cutting Considerations

- **Safety:** all destructive work is source-local, previewed, explicit, and compare-and-swap guarded.
- **Compatibility:** the core v3 map is required; legacy maps cannot author extraction. The extraction shape,
  retained-by-origin disposition, and scanner byte-range widening are additive — retirement-shaped maps decode
  and validate unchanged, and reject extraction-only dispositions at decode.
- **Human operation:** the surviving origin and required multi-member placement preserve the split's mental model.
- **Testing:** pure byte-planner tests combine with one real additive-land-then-finish topology, plus a dedicated
  pre-landing invisibility assertion.
- **Rollout:** before this member lands, the core supports retirement only; the three doctrine surfaces flip to
  the shared boundary statement in the same change set.
- **Hardening admission (restated from `cohort-decompose-transform-integrity.md`):** a finding against this member
  blocks only on a violated goal or invariant, a concrete failure reachable in a supported lifecycle, a violated
  existing authority contract, or loss, corruption, or unsafe ambiguity of in-scope planning content. A proposal
  adding a durable record, identity, ledger, state machine, recovery branch, or new authority is a scope change
  routed through design amendment, never a silently promoted fix.
- **Size posture (spec-close recalibration):** `Class` stays `Heavy`. Against the original estimate the surface
  gained the net-new additive composer, the destination-coverage check, the scanner byte-range widening, the
  three-surface doctrine amendment, the surviving-origin admission arm, the `extraction` authoring shape, and the
  shared Purpose-floor sentinel fix, and shed the retired finalize/continuation integration and the planning-lane
  consideration.

## Success Criteria

- Extraction admits a surviving origin in started `Planning` or `Active` state and scans only its design
  artifacts; a backlog-stub envelope under the extraction shape is a typed decode mismatch.
- Extraction lands complete profile-correct destinations before any source byte changes.
- Multi-member extraction cannot select `direct-member` placement and reports its durable logical anchor; a
  surviving origin plus exactly one new member remains valid under `direct-member`.
- The surviving origin, committed implementation, and unrelated source work remain unchanged through the additive
  leg.
- Prepared members are invisible to lifecycle resolution and in-flight derivation before the additive result
  lands — asserted by test — and become ordinarily discoverable, ready, or blocked only from the synchronized
  landed base.
- Every extracted member owns substantive allocated scope, enforced by the destination→allocation coverage check.
- A dependent of retained scope keeps its origin dependency edge; extraction never silently strips one.
- The staged ROADMAP projection keeps the surviving origin visible, through the core's existing render seam.
- Finish previews by default and applies only after exact live-base destination validation and reread.
- A finished apply durably commits exact source thinning together with ordinary surviving task-list and affected
  Next Task / Next Action reconciliation for both Active and started-Planning origins before candidate cleanup;
  already-finished retries make no mutation or invented commit.
- Thinning preserves every byte and mode outside the approved transfer/drop set across Markdown and whole files.
- Repeat finish is idempotent; changed source, base race, partial apply, missing target, and lost scratch remain
  recoverable without durable coordination state.
- No transition record, extraction ledger, cross-branch transaction, fuzzy reconciliation, or automated launch
  authority is created; `--execute` and `--advance-base` refuse extraction-shaped maps with typed reasons, and
  retirement-shaped maps reject retained-by-origin dispositions and `Active`-origin envelopes at decode.
- An incomplete cohort scaffold cannot commit: the shared cohort-consistency check refuses the `—` sentinel
  Purpose floor.
- `assess-boundary-fit.md`, `decompose-work-unit.md`, and `strategy-work-organization.md` state the same
  extraction boundary once this work unit ships.

## Open Questions

[none]
