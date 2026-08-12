# Draft: Decomposition Conservation and Authoring Hardening

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during the
  `chunked-delivery` cohort cut. Widened at the 2026-08-11 residuals consolidation: absorbed the surviving scope
  of the retired `decompose-finalization-diagnostics` and `decompose-authoring-expressiveness` members.
- **Purpose:** Make a decomposition cut provable and expressible end to end: conservation proves preservation over
  every origin artifact whose content retirement would remove, the authored cut map can state placement and
  dependency intent the author already knows, and every refusal names differing evidence and a correct next
  action.

---

## Conservation boundary

### Problem / Motivation

The shipped transform inventories and proves conservation over the configured design artifact, then retires the
whole origin artifact group. A `notes-*` companion is outside `planningProfile.sourceDesign`, so it is neither
inventoried nor allocatable, while the retirement delta still plans its deletion.

The first real instance carried assurance and seam-algebra content in a notes companion. The cut assigned that
content to a member, but an unmodified transform would have deleted it while reporting complete conservation.
History makes recovery possible, yet no diagnostic says recovery is needed.

This boundary carries more weight than the original capture assumed: with transaction verification no longer
duplicating git's own record, conservation proof is the only remaining net under a content-preserving split. Size
the work against that role.

### Alternatives

- **Refuse on uninventoried retirement content:** the cheapest safe default. Any nonempty origin artifact outside
  the conservation inventory blocks the transform until the author disposes of it explicitly.
- **Inventory companion content:** extend allocation and conservation to supported companion families. This gives
  the fullest authoring path but must define how non-design documents become addressable source units.
- **Explicit disposal record:** let the author attest a disposition for content outside the design inventory and
  carry that decision in the transition record. Declined at the record's schema authoring (no live consumer read
  it), but the record is unsealed and pre-release, so admitting the field later costs nothing. Coordinate with the
  landed record schema before adopting this arm.

### Direction to settle

Start from the invariant that retirement may delete no content the proof neither preserved nor explicitly
disposed. Prefer refusal as the fail-safe baseline, then decide whether notes companions warrant first-class
allocation. Keep the current manual workaround — folding companion content into the design artifact — as migration
evidence, not the permanent contract.

## Authored cut-map expressiveness

_Absorbed from `decompose-authoring-expressiveness`; the locator and external-edge gaps survive the transition
record's cut. The drafted meta-edit half retired with it: post-cut meta edits were refused because the sealed
projection and receipt did not include them, and that machinery no longer exists._

Two authoring limits make a semantically complete cut impossible to encode:

1. **Locator gap.** An allocation's `targetLocator` resolves against the destination's current state. A newly
   scaffolded member has no authored sections, so section locators fail and only `preamble` resolves. Conserved
   content lands in an unstructured block even when the author knows its intended destination structure.
2. **External-edge gap.** `internalEdges` requires both endpoints to be new members, so a member cannot declare a
   dependency on an existing work unit outside the cut.

Approach carried forward: define target positions against the prospective destination (post-scaffold locators or a
stable allocation-order/anchor representation); add external dependency edges whose targets resolve as work-unit
slugs against the authoritative roster, carried through prospective projection, ROADMAP rendering, and
publication; preserve conservation and topology validation for internal edges without overloading their proof to
imply an external dependency was created by the cut.

## Refusal remedies and scoped gating

_Absorbed from `decompose-finalization-diagnostics`; its hidden-locus gap retired with `--finalize` (the surviving
modes are `--preflight`, `--execute`, `--advance-base`, and `--execute` is the sole terminal mutation), while the
remedy scope survived the reshape and grew._

- **Mismatch without evidence.** Projection refusals name a surface but provide no differing paths or
  expected/actual digests, forcing the operator to guess which edit deviated. Attach differing paths or digest
  pairs while retaining stable, machine-readable refusal codes.
- **Remedy authoring at corpus scale.** The corpus carries 92 distinct typed refusal codes; the recurring defect
  is a missing precomposed remedy — with one, code count costs the executing agent nothing; without one, even ten
  force improvisation. Remedy authoring is this member's scope.
- **Scoped repository gating.** Cohort consistency checks can block a scoped transform on unrelated pre-existing
  grouping defects the candidate did not introduce. Move repository-wide consistency to its own corpus gate,
  scope it to transform-touched paths, or treat pre-existing violations as advisory while refusing only
  violations the transform would introduce.
- Reconcile workflow prose, emitted `next.command`, and runtime remedies as one contract. Consume
  `roadmap-tooling`'s projection decisions rather than minting a decomposition-only projection rule.

## Unknowns and Assumptions

- How non-design documents become addressable source units, if the companion-inventory arm wins.
- Should destination structure be an authored skeleton, a locator over the post-allocation projection, or an
  ordering relation among allocations?
- What snapshot proves an external dependency resolved at authoring and still resolves at publication, and how a
  later dependency-contract drift interacts with the revalidation owned by `decomposition-doctrine`.
- Which diagnostic details are safe and stable enough for structured output across large projections.

## Scope Estimate

Medium–Large — conservation inventory policy and refusal/allocation mechanics, cut-map schema and projection
changes, refusal-remedy authoring across the corpus, and real-cut coverage. Three separably deliverable arms
(conservation baseline first); recalibrate the estimate at spec close per the cohort's hardening-admission
boundary.
