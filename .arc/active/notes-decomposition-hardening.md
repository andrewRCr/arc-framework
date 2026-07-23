# Notes: decomposition-hardening

- [Failure-class × verb matrix](#failure-class--verb-matrix)
- [Forward-compat principle map](#forward-compat-principle-map)
- [Implementation & coordination seams](#implementation--coordination-seams)

## Failure-class × verb matrix

The parallel-era failure classes and how each verb exhibits them. `✅` marks a class confirmed live; the rest are
latent-but-structurally-shared (the root-cause fixes cover them). Useful as an execution checklist — each cell is a
case to verify a fix covers.

| Failure class                                             | decompose                 | rename                             | abandon / park            |
| --------------------------------------------------------- | ------------------------- | ---------------------------------- | ------------------------- |
| **Checkout-local view** (`buildLifecycleIndex(cwd)`)      | source + edges blind      | ref-sweep blind                    | retire-only               |
| **ROADMAP-regen oracle timing** (live/remote-ref pre-del) | latent, **more exposed**  | ✅ **confirmed live**              | share `reconcile-roadmap` |
| **Reference-sweep completeness** (gone-slug mentions)     | `Depends On`-only         | ✅ **confirmed incomplete**        | n/a                       |
| **Non-self-healing residue** (orphaned branch/wt/subdir)  | manual `teardown --force` | dir-name lags identity             | share deferred teardown   |
| **Husk-consistency of worktree ops**                      | bespoke terminal          | ✅ **confirmed** (POSIX self-move) | park re-cuts on resume    |

`decompose` is _more_ exposed on the ROADMAP-oracle class, not less: it defers the origin branch reap to a
post-merge `teardown --force`, so `origin/plan/<slug>` persists across the whole transform and merge.

## Forward-compat principle map

Which check-doc principle each area answers (the check-docs adjudicated the open forks and all push the fixes into
the shared CLI substrate). Cite the specific principle when validating an area's implementation against its
check-doc.

- **Storage-evolution** (`strategy-storage-evolution.md`) — resolve inventories against the WU-record _abstraction_
  (Principle 1/5), never a git-worktree/ref enumeration the backend dissolves; cross-WU repoint is a
  version-checked write (Principle 3); keep the retirement-record store access-path abstract (Principle 2) —
  coordinate its location with `retirement-record-relocation`.
- **Procedure-evolution** (`strategy-procedure-evolution.md`) — the terminal, successor derivation, and dispatch
  are CLI-computed (Principle 1); emitted verbatim text is precomposed CLI-side (Principle 6); new arms land as
  typed cut-map fields, not prose conditionals (Principle 2); workflow prose invokes verbs, never narrates
  mechanics (Principle 3).
- **Knowledge-evolution** (`strategy-knowledge-evolution.md`) — the substrate is a genuine multi-consumer fan-in
  (four verbs), so consolidating its shared vocabulary is on-model, not premature (Principle 6); the one new
  load-bearing term (flat-sibling / `cohortless`) is defined once in the spec, while area 3's rename-move marker is
  an operational projection reusing the husk stamp rather than minted terminal vocabulary (Principle 7).

## Implementation & coordination seams

Where each area touches existing code and which sibling WUs own adjacent surfaces. Cross-references for planning
context — not a work queue for those WUs.

**Existing modules each area extends (not a parallel mechanism):**

- **Area 1 read** — switch `decompose`'s inventory source from `buildLifecycleIndex(cwd)`
  (`lifecycle-index.ts`) to `resolveComposedLifecycleIndex` (`composed-lifecycle-index.ts`), already the
  `arc status --project` index and already cross-worktree-aware.
- **Area 1 write** — generalize `dischargeDepEdges` (`side-effects/discharge-dep-edges.ts`), which already rewrites
  a WU's own `Depends On` via `resolveDepStates` + `setMetaBulletFields`. The new machinery is the subject-keyed
  **receipt-discovery read** — the content-addressed store (`retirement-record-store.ts`, keyed by a digest of
  subject+transition+sourceBranch+sourceHead) cannot answer a subject-only query today.
- **Area 2** — `parseCutMap` / `ParentPosition` (`decompose-cut-map.ts`) + `scaffoldCohortMembers` (`verbs/decompose.ts`).
- **Area 3** — `runRename` / `resolveRenameWorktreeMove` / `reconcileWorktree` (`verbs/rename.ts`,
  `mutators/reconcile-worktree.ts`; the teardown branch's self-teardown refusal is the pattern to mirror) +
  `runStaleWorktreeSweep` (`session-init/stale-worktree-sweep.ts`) + husk stamp (`git/worktree-marker.ts`).
- **Area 4** — `sweepRenameReferences` (`rename-reference-sweep.ts`; extend past `setMetaTitle`'s meta-only H1
  rewrite in `mutators/rewrite-renamed-meta.ts`) + the `reconcile-roadmap` render path (`status/` +
  `side-effects/readiness-regen.ts`).

**Cross-WU coordination seams** (record; route sibling notifications at planning close):

- `wu-lifecycle-state-model` — owns husk/terminal-state vocabulary, **unsettled**; area 3 uses an operational
  stamped marker (a derived projection), minting no lifecycle-state term. That WU may re-vocabulary the marker
  later without schema churn.
- `retirement-record-relocation` — owns the retirement-record store location; areas 1/3 read it. Coordinate the
  path _and_ area 1's new subject-keyed receipt-discovery read.
- `lifecycle-transition-core` — owns the `discharge-dep-edges` reconcile area 1 generalizes; extend it, never mint
  a parallel mechanism.
- `review-gate-right-sizing` — merge-guard boundary **settled**: area 1's `integrate`-time fail-closed reconcile
  lands at the integrate interlock, not RGRS's closed readiness union.
- `cohort-cut-coherence` — adjacent rail to area 2 (what a cohort absorbs on exit vs. the cohort-less split shape);
  coordinate, don't fold.
- `decomposition-doctrine` — demand driver (more cuts, earlier); soft precedence pairing, no hard edge.
- `pr-decomposition` — orthogonal axis (review-surface carving vs. concern splitting); keep cut-map and chunk
  vocabularies distinct.
- **`assess-cohort-fit` has four pending editors** — this WU (cohort-less verdict / `cohortless` value),
  `decomposition-doctrine`, `cohort-cut-coherence`, `pr-decomposition`. Sequence the method edits at each WU's
  grooming close so one surface doesn't churn four ways.
- **Integration order** — `review-chunking` ships before this WU integrates; a large candidate here reviews via
  `review-chunking`.
