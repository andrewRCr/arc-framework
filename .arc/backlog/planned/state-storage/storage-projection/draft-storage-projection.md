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
