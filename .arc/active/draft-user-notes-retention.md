# Draft: user-notes-retention

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `user-save-status-divergence` draft-design, assessing the ancestry-nearest fix's cost profile against notes
  accumulation.
- **Purpose:** Design a retention / compaction policy for the user-notes ref (`refs/notes/arc/user/{identity}`)
  so it stops growing unbounded — safely, without dropping a sibling machine's un-synced notes.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration. These two_
> _captures make this WU the single home for the remaining user-notes coherence + retention concerns after_
> _`notes-sync-ref-coherence`'s thin forward-fix shipped as PR #206._

### `[ ]` **Absorb the notes paired-push ref-coherence bug as a named growth-source (post-#206 remainder)**

- _Routed from:_ `USER-INBOX § Work Unit` (was `WU_Target: notes-sync-ref-coherence`, now dissolved into #206 +
  this WU), housekeep drain (2026-07-07); diagnosed at the `roadmap-tooling` decompose handoff (2026-07-06) and
  re-verified live 2026-07-07.
- _Concern:_ The paired-push notes leg (`handlers/sync.ts` → `commands/user/paired-push.ts` →
  `lib/user-sync/branch-bounded-notes-export.ts`) rewrites remote notes history (one commit per note → ~884
  commits) and non-force-pushes it, but cleanup only `update-ref -d`s the temp ref — **nothing fast-forwards the
  local canonical `refs/notes/arc/user/<id>` to the pushed tip.** So local stays behind, `arc user status` reports
  `diverged` while `arc sync` reports success, and it **self-perpetuates**: every sync re-rewrites ~884 commits →
  unbounded remote history bloat. Content is byte-identical both sides (benign), but it re-diverges + re-bloats every
  sync (remote ref grew 10,802 → 11,688 in one handoff sync). Inherent to branch-bounded export since the
  parallelism forward-port (`815f0cf3`).
- _Post-#206 remainder this WU inherits (the thin forward-fix shipped as PR #206 — post-push `update-ref`,
  CAS-guarded, scoped to `omittedCommits === 0`):_
    - **(a) branch-bounded (`omitted > 0`) reconcile — the actual biting case.** The primary main sync runs the
      rewrite path with `omitted = 19` (notes on handoff commits from unmerged feature branches), so #206's
      `omittedCommits.length > 0 → return` guard (`branch-bounded-notes-export.ts:250`) skips the adopt. The wanted
      fix is narrower than a full union merge: **adopt-if-superset** — the rewrite path already stages `tempRef` from
      origin then overlays branch-reachable local notes, so in steady state `tempRef` **is** a content-superset of
      local (re-verified 905 = 905, 0 local-only). Adopt it when it contains every local `(blob,commit)` pair even
      with `omitted > 0`; fall back to a true **union merge** only when `tempRef` is a genuine subset (rarer).
    - **(b) compact the already-bloated remote history** (the ~884-commit re-rewrites; the cross-machine
      rewrite-safety design).
    - **(c) `arc sync` success-verdict coherence guard** — must not report success while status is diverged +
      regression test.
- _Two self-clearing mislabels (verify at fix, else file a diagnostic follow-up):_ (1) `arc user status` reports
  `cross-machine` on what is a **same-host** lineage-rewrite divergence (the classifier infers from divergence shape,
  not machine-id); (2) the session-init partial-push surface frames an own-host marker as a sibling's push. Both
  should self-clear once the missing fast-forward lands. The machine-id angle was already investigated + closed (it
  is host-level via the git common-dir store; per-worktree `.machine-id` files were legacy leftovers, removed).
- _Coordination:_ `sync-primitive-discipline` is adjacent (which-primitive contract + prose alignment) but distinct
  — this is an implementation coherence bug in the export itself. Coordinate, don't fold.
- _Sequencing (WORKING-MEMORY directive):_ this WU is next after housekeep; bump its meta Priority `P3 → P1` at WU
  start + re-render ROADMAP. Bloat compounds ~+886 commits/sync until it lands — avoid unnecessary primary syncs
  meanwhile; reconcile with `git update-ref refs/notes/arc/user/andrew <remote-tip>` (verify 0 local-only first).

### `[ ]` **Frame pre-migration root-SESSION-NOTES notes as correctness-relevant cruft, not just growth**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: user-notes-retention`), housekeep drain (2026-07-07); captured
  during `finalize-parallelism` notes base-resolution investigation, 2026-07-06.
- _Concern:_ 427 of the ~882 `main`-reachable annotated commits on `refs/notes/arc/user/andrew` are
  pre-per-WU-subdir root-`SESSION-NOTES.md` notes (newest `2ad2b83f`, 2026-05-19). They are both the retired-WU
  accumulation this WU targets AND the direct source of a live mis-resolution (a WU-agnostic
  `path === LEGACY_ROOT_SESSION_NOTES` clause in `noteManifestContainsWu` made every such note match every WU — a
  false `mixed` drift; that match bug is fixed separately).
- _Approach:_ retention / compaction of pre-migration history would independently have prevented that bug — scope the
  prune / rewrite-safety policy treating the legacy notes as correctness-relevant cruft, not just storage weight.
  Minor doc-fix while there: the draft's "~861 notes today" is now ~882 `main`-reachable / 901 total.

## Problem / Motivation

The user-notes ref grows monotonically — one commit per `arc user save` — and is never pruned, squashed, or
GC'd (no notes-prune / compact / retention / GC logic anywhere in `packages/arc-framework/src`). At ~961
ref-history commits / ~861 notes today, on a _solo_ repo. The real driver is **unbounded growth**: storage,
cross-machine sync cost, and the hygiene of ever-accumulating retired-WU notes — **sharpened by parallelism**
(near launch), which multiplies worktrees and save frequency. Shipped/retired-WU per-WU subdir notes persist in
ref history forever even after their local subdirs are reconciled away.

Not the `DEFAULT_MAX_ANCESTOR_WALK` (1000) cap: newest-first resolution returns on the first entry regardless of
total count; the cap only bites a narrow deep-per-WU-note miss case, and `user-save-status-divergence`'s
HEAD-ancestry rewrite removes even that. Distinct from `user-save-status-divergence` (shipped): that WU only
makes its _own_ read cost degrade gracefully; it does **not** address unbounded growth — this is the separate,
broader story.

## Approach

Design the policy against the **cross-machine sync-safety constraint first** — what is provably safe to
prune/rewrite given siblings may hold un-pushed notes (pruning/squashing rewrites the ref, which siblings pull,
so it must not drop another machine's un-synced notes or break the partial-push / coherence machinery). Then the
mechanism: retention window, retired-WU pruning, optional history squash.

Team framing: refs are per-identity, so team size multiplies the _number_ of refs (each read identity-scoped),
not any single ref's size — the sharp axis is **per-identity** accumulation (long-lived heavy user / high
parallelism). Forward-compat: sanity-check against `strategy-storage-evolution` / `draft-arc-backend` (the
git-backing-store direction) so the policy doesn't bake in a "tracked in the code repo" assumption.

- **Files:** `packages/arc-framework/src/commands/user/save-load.ts`,
  `packages/arc-framework/src/commands/user/sync-status.ts`,
  `packages/arc-framework/src/commands/user/notes-ref.ts`, `packages/arc-framework/src/lib/user-sync/`.

## Related sub-concern — adaptive reachability filtering (evaluate; may split out)

`filterCommitsReachableFromHead` (`lib/git/ancestry.ts`) materializes the full `git rev-list HEAD` set to filter
annotated note commits — a deliberate batch tradeoff. A large-history / small-note-set repo may prefer
per-candidate `merge-base --is-ancestor`; a large-note-set repo may prefer the current batch. The durable answer
is likely **adaptive** (thresholded / measured), validated with benchmarks over history-size × note-count, with
optional per-invocation caching where read surfaces share a candidate set.

- **Disposition:** fits this WU's read-cost story; **if this WU stays prune/compact-only, split this into a
  dedicated performance-tuning WU under `architecture-remediation`.**
- **Files:** `packages/arc-framework/src/lib/git/ancestry.ts`,
  `packages/arc-framework/src/commands/user/save-load.ts`.

## Scope Estimate

Medium–Large — a real retention policy plus a rewrite-safety story; spec-worthy.
