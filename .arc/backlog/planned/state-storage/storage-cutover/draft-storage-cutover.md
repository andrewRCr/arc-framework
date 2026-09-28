# Draft: Storage Cutover

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stages 3 and 4 of the storage program.
- **Purpose:** Flip this repository — and CineXplorer — onto the ref store in one rehearsed window, retire Git notes,
  then delete what the flip made dead and rewrite the documentation to the new model.
- **Planning posture:** `P1`; `Class` settles at planning. Its design is small — a window runbook and mechanical
  deletion — so it may split by subsystem once the flip is done, to run the deletion passes in parallel.

---

## Scope

- **Rehearsal** on a scratch repository first, then the window: quiesce, import, flip, retire notes
  (`analysis-storage-substrate-direction.md` § 10.3). Planning-only work units' artifacts import from their branch
  heads, `delivery-rebuild-continuity`'s included; implementation work units land first where possible, or park at
  a task boundary.
- **Deletion passes** over the categories the flip makes dead (§ 10.4): notes-specific sync, branch-tree readers,
  lifecycle classification and exclusion, the lifecycle hook checks, and the CI planning classifier.
- **Documentation:** the mechanics and lifecycle-path documentation in both copies, and the rules the register marks
  rewritten at cutover.
- **The register's cutover rows** (`cohort-state-storage.md` § Storage-coupling register).

---
