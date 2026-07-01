# Draft: user-notes-retention

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `user-save-status-divergence` draft-design, assessing the ancestry-nearest fix's cost profile against notes
  accumulation.
- **Purpose:** Design a retention / compaction policy for the user-notes ref (`refs/notes/arc/user/{identity}`)
  so it stops growing unbounded — safely, without dropping a sibling machine's un-synced notes.

---

## Problem / Motivation

The user-notes ref grows monotonically — one commit per `arc user save` — and is never pruned, squashed, or
GC'd (no notes-prune / compact / retention / GC logic anywhere in `packages/arc-framework/src`). At ~961
ref-history commits / ~861 notes today, on a *solo* repo. The real driver is **unbounded growth**: storage,
cross-machine sync cost, and the hygiene of ever-accumulating retired-WU notes — **sharpened by parallelism**
(near launch), which multiplies worktrees and save frequency. Shipped/retired-WU per-WU subdir notes persist in
ref history forever even after their local subdirs are reconciled away.

Not the `DEFAULT_MAX_ANCESTOR_WALK` (1000) cap: newest-first resolution returns on the first entry regardless of
total count; the cap only bites a narrow deep-per-WU-note miss case, and `user-save-status-divergence`'s
HEAD-ancestry rewrite removes even that. Distinct from `user-save-status-divergence` (shipped): that WU only
makes its *own* read cost degrade gracefully; it does **not** address unbounded growth — this is the separate,
broader story.

## Approach

Design the policy against the **cross-machine sync-safety constraint first** — what is provably safe to
prune/rewrite given siblings may hold un-pushed notes (pruning/squashing rewrites the ref, which siblings pull,
so it must not drop another machine's un-synced notes or break the partial-push / coherence machinery). Then the
mechanism: retention window, retired-WU pruning, optional history squash.

Team framing: refs are per-identity, so team size multiplies the *number* of refs (each read identity-scoped),
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
