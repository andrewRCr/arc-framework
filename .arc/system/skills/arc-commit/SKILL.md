---
name: arc-commit
description: Commit current repository changes with atomic boundaries as per ARC conventions. Use when asked to commit work, prepare a clean commit from pending changes, or triage whether the change set is simple vs multi-task and needs splitting.
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
     - **Status-file updates do not ride with content commits.** They fire only at
       handoff or workflow-ceremony boundaries, as dedicated `chore(status):` commits.
       See DEV-RULES.ARC § Status-file timing and § Status-file commit shape.

2. Choose the path.

   - Simple path: one clear concern, no cross-session overlap.
   - Complex path: multiple concerns, accumulated multi-session work, or interleaved edits
     that should be separated.

3. Load commit format guidance.

   - Read `system/methods/commit-format.md` and `system/methods/commit-context-format.md`
     before composing any commit message. Both paths require this — the format spec includes
     context footer patterns that are not safe to assume from memory.

4. Execute the chosen workflow.

   - For simple path: stage only files for one logical change and commit using the loaded
     format guidance.
   - For complex path: follow
     `.arc/system/workflows/arc/supplemental/prepare-commits.md` to analyze and split
     changes into atomic commits.

5. Enforce atomicity.

   - Do not include unrelated files in the same commit.
   - If separation is unclear, stop and re-check file-level intent before committing.

6. Verify staging before committing.

   - Run `git diff --cached --stat` after staging. Pre-staged files can silently slip in;
     intended files can be left out. Verify the staging area matches intent.
