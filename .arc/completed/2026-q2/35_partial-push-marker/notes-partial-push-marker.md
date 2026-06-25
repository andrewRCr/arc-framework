# Notes: Partial-Push Marker

## Risk gradient

The severity profile the design is scoped against — why the residual window is accepted rather than closed to
zero, and why the only data-loss path is left behind an explicit force gate rather than blocked.

| Scenario                                                          | Likelihood | Severity          | Protected today?          |
| ----------------------------------------------------------------- | ---------- | ----------------- | ------------------------- |
| Stale handoff on B (reads outdated session-notes from origin)     | Low        | Low — recoverable | No                        |
| B works on stale baseline (saves notes not reflecting A's intent) | Lower      | Medium            | Partial (merge default)   |
| Force-push overwrites B's intermediate work                       | Very low   | High — data loss  | Partial (force is opt-in) |

Per-identity refs are independent; different developers' notes refs are decoupled by namespace. The mechanism is
per-identity.

## Existing safety nets (shipped — don't rebuild)

What protects users today, by firing frequency. The marker is additive to these, not a replacement.

1. **Stale-local-note warning on the originating machine** — when the latest local note attaches to an ancestor
   of `HEAD`, push/status surfaces warn. Self-heals on next session start on the same machine.
2. **Save verification (write-side postcondition)** — the originating machine's local notes are correct after
   save; only `origin` is stale.
3. **Recovery prompt defaults** — the non-fast-forward notes-push recovery defaults to **merge** (preserves
   both); force is explicit opt-in, never `--yes`-accepted.
4. **Partial-push marker on the originating machine** — `.sync-state.json`, persists across same-machine
   sessions; cleared once `origin` matches the local notes ref.

The unprotected window is between A's partial push and A's next session, if B starts working in that window —
the gap the remote marker closes.

## Forward-compat — the arc-backend lift

The marker is a **storage-agnostic record**, not a tracked-tree artifact: the sync-state ref is its git-native
tier-2 transport, and the record lifts into `arc-backend`'s version-checked-writes / optimistic-concurrency
substrate (`draft-arc-backend.md` § Concurrency & Version History) without reshape — the CAS / union-merge /
non-fast-forward-retry shape *is* that substrate's optimistic concurrency in git-native form. Specific mappings,
per `strategy-storage-evolution` (Principles 2, 3, 5):

- **Per-machine keying → per-writer concurrency metadata** at the backend — not the "LWW small-records" bucket;
  this is the version-checked-write machinery itself.
- **Machine-id → a client / session identifier** in the backend's concurrency layer.
- **The three-register recovery model prefigures the backend's multi-writer-freshness bet** —
  own-edits-always-fresh (A's Act register) and deliberate-refresh-on-shared-reads (B's Aware register) are the
  git-native form of "fresh-on-your-writes, refresh-on-shared-reads."

It is the cross-machine twin of `state-ref-write-safety`'s single-machine CAS — together the two halves of
"don't clobber shared state." Build the marker's write path CAS-ready so the two compose when both land.
