# Draft: Bound Decomposition Preflight Cost

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-28); captured during
  `decompose-transform-integrity` PR #383 nitpick disposition (consolidates review items 15, 16, 18).
- **Purpose:** Bound the v3 read-only decomposition preflight's multiplicative costs so wide-branch,
  wide-topology, and large-document repositories stay usable without weakening the integrity contracts the
  preflight exists to enforce.
- **Sequencing:** **Post-core** relative to `decompose-transform-integrity`. Keep this optimization out of the
  active integrity implementation unless measurement shows a release-blocking regression. Optional members of that
  cohort (extraction, durable-consumers, base-mobility, planning-lane) own different authority axes — not this
  preflight cost surface.

---

## Problem / Motivation

The v3 read-only preflight has three independent multiplicative costs that are harmless on current fixture scale
but structurally unbounded:

1. **Local-branch discovery** — lists each branch's full `.arc` tree, then reads every meta blob sequentially
   (grows as branches × metas; Git leg turns growth into subprocess count).
2. **Locator revalidation** — reparses and canonicalizes every scanned unit for every stored source unit
   (units²).
3. **Content scanning** — re-encodes the document prefix for every unit boundary (document length × units).

## Approach (candidate)

1. Measure representative wide-branch, wide-topology, and large-document cases first.
2. Define explicit cost bounds from the measurements.
3. Batch or bound Git object reads while preserving the pinned-ref / reread race contract.
4. Precompute a validated locator representation without weakening the runtime boundary.
5. Derive UTF-8 byte offsets in one pass without changing Unicode boundary semantics.

## Scope Estimate

Medium — measurement harness + bounded preflight path changes; design must not relax integrity refusals.

## Continuity

- Captured as review nits against the core DTI implementation; deliberately **not** absorbed mid-flight into
  that WU's already-oversized authority spine.
- Sibling: DTI durable-consumers bounds long-lived _receipt_ enumeration — different surface from pre-mutation
  preflight.
