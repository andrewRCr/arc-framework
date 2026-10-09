# Draft: Storage Projection

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Build the working copy: the store projected as ordinary, whole, human-readable files at the familiar
  `.arc/` paths, opened by name and searchable in whatever editor a person uses, with the caller-visible behavior
  `storage-contract` defines.
- **Planning posture:** `P1`; `Class` settles at planning. Design may run alongside `storage-contract`'s once that
  draft settles the projection's caller-visible behavior; implementation may start once its spec is approved
  (`cohort-state-storage.md` § Coordination).

---

## Scope

- **Materialization and persistence** at firing points, with a base stamp on each projected file's first line for
  stale saves, the entry merge for single-file lists such as the inbox and working memory, and writer-pushed refresh
  of every worktree's copy (`analysis-storage-substrate-direction.md` § 6.9).
- **Files the store does not know yet** are adopted into their owner; an ownerless file is flagged in `arc status`,
  and teardown refuses while one is unadopted (§ 6.10).
- **The ignore strategy ADR-035 settles:** the shared surfaces through `.git/info/exclude`, written once per clone at
  first materialization; `.arc/user/*/` kept in `.gitignore`; a tracked root `.ignore` re-including all four for the
  ripgrep family; the Zed setting printed by `arc init` rather than written.
- **Windows** (§ 6.10): close before renaming, retry with a re-check while a holder refuses, bounded retry on
  `EPERM`, `EBUSY`, and `EACCES`, a re-check that sees a same-size save, bigint stats, and CRLF normalized to LF; the
  store and projection tests in the Windows portability lane.
- **More than one source:** the store now and the package later (`framework-core-from-package`), with read-only
  copies.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Upgrade the linked-worktree user-surface signpost to the OSD content view**

- _Redistributed:_ moved from `operational-state-docs` under `storage-contract` C2, the record-aware seam (2026-09-30).
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-state-docs`), housekeep drain (2026-07-07);
  captured during `finalize-parallelism` Task 2.6.d (linked-worktree signpost) design discussion, 2026-07-05.
- _Concern:_ FP Task 2.6.d ships an interim per-surface signpost stub in linked worktrees (standing in for the
  removed identity-global `WORKING-MEMORY` / `USER-INBOX` copies). Because no content-projection CLI exists yet, the
  stub points at the raw primary-worktree path for content plus `arc user status` for drift.
- _Approach:_ When this WU ships the records-canonical → rendered-projection view (e.g. an `arc <surface> show`
  that renders any identity-global surface, and eventually fetches it when content is no longer a local file),
  upgrade the signpost to point at that view instead of the raw primary path. Socket now, projection later — FP
  deliberately mints no content CLI.

### `[ ]` **Spawned worktree `SESSION-NOTES` can be stale while status reports clean**

- _Redistributed:_ moved from `operational-state-docs` under `storage-contract` C2, the record-aware seam (2026-09-30);
  shared surfaces project into every worktree, and the projection keeps each worktree's copy current (C6).
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ At session-init in the `recovery-load-scoping` worktree, the checkout-local
  `.arc/user/andrew/recovery-load-scoping/SESSION-NOTES.md` was still the seed `arc start` wrote at spawn
  (`Commit at Handoff: 3e65d5d39`, "Next Action is seeded to `[begin current workflow]`"), while the real
  handoff notes — written by the prior session and matching HEAD (`392924790`) — lived in the **primary**
  worktree's identity-global tree. Two copies, silently divergent. `arc user status` reported
  `andrew: Up to date.` and the session-init probe's `user` slot resolved `state: clean`,
  `recommendedAction: skip`, so nothing surfaced the divergence; a session trusting the local copy would resume
  from a stale baseline and re-derive completed work.

- _Approach:_ decide which copy is authoritative for a spawned worktree and make the freshness check compare
  them, rather than reporting clean when the on-disk copy the session will actually read is stale.

- _Captured during:_ `recovery-load-scoping` session-init (2026-07-24); noticed because the seed's
  `Commit at Handoff` disagreed with the probe's HEAD.

---
