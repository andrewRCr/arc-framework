# Draft: Measure and Bound Decomposition Command Cost

- **Origin:** [internal] — merged at the 2026-08-11 residuals consolidation from the retired
  `decompose-preflight-scaling` (captured 2026-07-28, PR #383 nitpick disposition, review items 15/16/18) and
  `decompose-finalization-scaling` (captured 2026-07-30, `decompose-transform-integrity` delivery slice 06). The
  two halves share one measurement harness and one Git-subprocess-fan-out failure mode across adjacent halves of
  the same command.
- **Purpose:** Measure, then bound, the decomposition command's subprocess and concurrency growth across its
  read-only preflight and terminal execute halves — without changing canonical ordering, Git pathspec semantics,
  Unicode boundary semantics, or fail-closed transition evidence.

---

## Measurement first — the recorded numbers are stale

The execute-half evidence (19 source units, 5 destinations, 16 allowed paths, 2,504-file repository:
`--preflight` 15.6s, `--execute` 2m28s, system time at 56% of user time) was measured against projection and
sealing machinery the transition record has since retired (~5k non-test lines including managed-path result
sealing). Much of the recorded cost may no longer exist. **Run the measurement pass before designing anything on
the execute half; that half may retire on the number.** The preflight half was untouched by the cut and is a
normal measure-then-bound start.

The measurement pass separates worktree creation, managed-path projection, staged-path discovery, and non-Git
computation, across representative wide-branch, wide-topology, and large-document cases.

## Problem / Motivation

**Preflight half** — four independent multiplicative costs, harmless on current fixture scale but structurally
unbounded:

1. **Local-branch discovery** — lists each branch's full `.arc` tree, then reads every meta blob sequentially
   (branches × metas; the Git leg turns growth into subprocess count).
2. **Locator revalidation** — reparses and canonicalizes every scanned unit for every stored source unit (units²).
3. **Content scanning** — re-encodes the document prefix for every unit boundary (document length × units).
4. **Repository-plan hydration** — re-reads every object byte in the source, merge-base, and result-base trees
   during post-occupation revalidation, even when their immutable OIDs are unchanged.

**Execute half** — per-path Git-backed reads for managed-path state projection plus per-path staged-path probes,
with no concurrency or subprocess bound. If post-cut measurement still shows material cost, the operational stake
is real: a runtime exceeding common two-minute command timeouts turns termination into a stranded partial
candidate (the retired `decompose-candidate-abandon`'s field evidence traced exactly to a timed-out `--execute`).

## Approach

1. Measure per the pass above; define explicit cost bounds from the numbers, then retire or bound each half on
   the evidence.
2. Batch, cache by immutable OID, or lazily hydrate Git objects while preserving the pinned-ref / reread race
   contract.
3. Bound projection concurrency and batch staged-path probes only behind byte-identical, order-identical outcomes
   with unchanged error policy.
4. Precompute a validated locator representation and derive UTF-8 byte offsets in one pass without changing the
   runtime boundary or Unicode semantics.
5. Prove output and refusal parity against the shipped paths before adopting any faster path.

## Scope Estimate

Light–Medium — a measurement harness plus bounded path changes proportional to what the numbers justify; the
execute half may reduce to a retirement note. Design must not relax integrity refusals.
