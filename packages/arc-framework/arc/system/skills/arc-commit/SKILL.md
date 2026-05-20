---
name: arc-commit
description: Commit pending changes following ARC atomicity discipline, triaging whether to bundle as one commit or split across multiple.
disable-model-invocation: false
---

# ARC Commit

1. Assess the pending work first.

   - Run `git status` and `git --no-pager diff --stat`.
   - Determine whether changes are one logical change or multiple. Tests:
     - **Scope, not volume.** Multiple task IDs sharing a cohesive lens are one
       commit (one problem solved). Volume of changed lines is not the metric.
     - **Reversibility.** If reverting one change would force reverting others,
       they belong together. If they fail or succeed independently, they split.
     - **Task list checkboxes ride with content commits.** They are derived state —
       don't put them in a separate meta-commit, and don't hunk-split them across
       content commits to preserve 1:1 task-ID-to-checkbox granularity.
     - **Meta-file updates do not ride with code commits.** They fire only at
       handoff or workflow-ceremony boundaries; shape (dedicated vs bundled with
       concurrent ceremony content) follows DEV-RULES.ARC § Meta-file timing and
       § Meta-file commit shape.

2. Choose the path.

   - Simple path: one clear concern, no cross-session overlap.
   - Complex path: multiple concerns, accumulated multi-session work, or interleaved edits
     that should be separated.

3. Load commit format guidance.

   - Read `system/methods/commit-format.md` and `system/methods/commit-footer.md`
     before composing any commit message. Both paths require this — the format spec includes
     context footer patterns that are not safe to assume from memory.

4. Execute the chosen path.

   - **Simple path:** stage only files for one logical change — no unrelated files. If
     separation is unclear at staging time, stop and re-check file-level intent. Pre-commit
     review extension (`#pre-commit-review`): if `pre-commit-review` appears in the
     active-extensions list established at session init, load and execute its `.actions`
     before commit. Halt-on-fail surfaces actionable message; user can fix and retry or
     explicit-invoke bypass. Otherwise, skip. Run `git diff --cached --stat` to verify
     staging matches intent — pre-staged files can silently slip in; intended files can be
     left out. Commit using the loaded format guidance. Class-tag routing (`taskCommit` /
     `workflowCommit` / raw) depends on the invoking context — per DEV-RULES.ARC § Commit
     Discipline → Commit control.
   - **Complex path:** follow
     `.arc/system/workflows/arc/supplemental/prepare-commits.md` to analyze and split
     changes into atomic commits.
