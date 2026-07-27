# Notes: Decompose Transform Integrity

## Implementation Grounding

- `packages/arc-framework/src/lib/work-unit/composed-lifecycle-index.ts` contains
  `resolveComposedLifecycleIndex`, the current write-authority seam that first exposed the mismatch between a
  base-rooted result checkout and branch-private planning source artifacts.
- `packages/arc-framework/__tests__/e2e/lifecycle-exit.e2e.test.ts` scaffolds the started origin in a linked
  worktree but invokes decomposition from the base checkout, then installs only
  `hook-validate-decompose-record` as its pre-commit hook. The real-topology replacement needs the complete
  shipped hook chain.
- `packages/arc-framework/__tests__/integration/decompose-shapes.test.ts` includes extraction and other positive
  shapes with empty `sourceAllocations`. Those fixtures are useful regression targets for the v3 non-empty member
  allocation and conservation requirements.
- The first real symmetric attempt exposed unrelated branch-private riders, including the
  `review-adapter-extensibility` stub and a project compatibility-posture rule. A retirement regression should
  include representative planning and non-planning riders rather than only an origin artifact group.
- Merge-parent coverage should include a finalized receipt inherited from the first parent and absent from
  `MERGE_HEAD`; that was the topology in which regeneration could resurrect the retired origin.
- The staged ROADMAP supersession correction landed in `9704cc42c`. Treat it as existing substrate to validate
  through a real decomposition; implement only transform-local gaps that remain.
- At planning time the receipt namespace held nine records totaling about 56 KB; the two decomposition receipts
  were roughly 7 KB and 15 KB. The observed scaling problem was one `git show` process per record, not current
  storage volume.
