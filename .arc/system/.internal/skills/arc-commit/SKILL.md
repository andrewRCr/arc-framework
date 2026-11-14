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
     - **Tasks close with the commit that carries their work.** A task-loop commit
       closes them at its fire site (`arc release commit --close`, or `arc task close`
       right after a raw commit); an incidental commit closes none.
     - **ARC state rides with no commit.** The task list, the meta, and the other ARC
       records persist with `arc save`; commits carry tracked files only.

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
     separation is unclear at staging time, stop and re-check file-level intent. Run
     `git diff --cached --stat` to verify staging matches intent — pre-staged files can
     silently slip in; intended files can be left out. Commit using the loaded format guidance.
     Class-tag routing (`taskCommit` /
     `workflowCommit` / raw) depends on the invoking context — per DEV-RULES.ARC § Commit
     Discipline → Commit control.
   - **Complex path:** follow
     `.arc/system/workflows/arc/supplemental/prepare-commits.md` to analyze and split
     changes into atomic commits.
