# Draft: Cross-Worktree Git State Safety

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-10); observed live during
  `merge-readiness-control` execution.
- **Purpose:** Prevent one worktree's stash or rerere operations from silently consuming or teaching resolutions
  from another work unit.

---

## Problem / Motivation

All worktrees share repository-level Git state. A path-scoped `git stash push` can exit successfully while creating
no stash; a paired positional `git stash pop` can then consume another work unit's top entry. Resolving the resulting
conflict may also record rerere data derived from the foreign content, allowing an unrelated future conflict to
reuse a destructive resolution silently.

The failure is cross-worktree by construction, and both the empty push and later rerere reuse can look successful.

## Direction

- Define a safe pairing contract that proves a stash was created and refers to it explicitly rather than by stack
  position.
- Decide whether rerere needs isolation or suppression for stash-apply conflicts, or whether a stronger operational
  guard is sufficient.
- Cover concurrent worktree use and the empty path-scoped stash case.
- Place the resulting guidance or mechanism where every session that can invoke the unsafe sequence will encounter
  it.

## Open Questions

- Can Git expose enough stable stash identity to make the pairing portable across supported environments?
- Is documentation sufficient for a silent data-loss shape, or should ARC wrap or validate the operation?
- What rerere scope can be narrowed without weakening ordinary merge-conflict reuse?

---
