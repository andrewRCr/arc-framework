# Draft: Bound Decomposition Preflight Cost

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-28); captured during
  `decompose-transform-integrity` PR #383 nitpick disposition (consolidates review items 15, 16, 18).
- **Purpose:** Bound the v3 read-only decomposition preflight's multiplicative costs so wide-branch,
  wide-topology, and large-document repositories stay usable without weakening the integrity contracts the
  preflight exists to enforce.
- **Sequencing:** Member of `decompose-transform-integrity/decompose-core-hardening`. The shipped core remains
  authoritative for preflight integrity; this work bounds cost without reopening its semantics.

---

## Problem / Motivation

The v3 read-only preflight has four independent multiplicative costs that are harmless on current fixture scale
but structurally unbounded:

1. **Local-branch discovery** — lists each branch's full `.arc` tree, then reads every meta blob sequentially
   (grows as branches × metas; Git leg turns growth into subprocess count).
2. **Locator revalidation** — reparses and canonicalizes every scanned unit for every stored source unit
   (units²).
3. **Content scanning** — re-encodes the document prefix for every unit boundary (document length × units).
4. **Repository-plan hydration** — reads every object byte in the source, merge-base, and result-base trees again
   during post-occupation revalidation, even when their immutable OIDs are unchanged.

## Approach (candidate)

1. Measure representative wide-branch, wide-topology, and large-document cases first.
2. Define explicit cost bounds from the measurements.
3. Batch, cache by immutable OID, or lazily hydrate Git objects while preserving the pinned-ref / reread race
   contract.
4. Precompute a validated locator representation without weakening the runtime boundary.
5. Derive UTF-8 byte offsets in one pass without changing Unicode boundary semantics.

## Scope Estimate

Medium — measurement harness + bounded preflight path changes; design must not relax integrity refusals.

## Continuity

- Captured against the core implementation and promoted after real-cut evidence established the hardening
  program.
- Sibling: DTI durable-consumers bounds long-lived _receipt_ enumeration — different surface from pre-mutation
  preflight.
