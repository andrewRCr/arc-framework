---
name: arc-commit
description: Commit current repository changes with atomic boundaries. Use when asked to commit work, prepare a clean commit from pending changes, or triage whether the change set is simple vs multi-task and needs splitting.
---

# Atomic Commit

1. Assess the pending work first.

   - Run `git status` and `git --no-pager diff --stat`.
   - Confirm whether changes represent one logical task or multiple interleaved tasks.

2. Choose the path.

   - Simple path: one clear concern, no cross-session overlap.
   - Complex path: multiple concerns, accumulated multi-session work, or interleaved edits
     that should be separated.

3. Execute the chosen workflow.

   - For simple path: stage only files for one logical change and commit using the format
     in `DEV-RULES.ARC.md` section "Commit format".
   - For complex path: follow
     `.arc/system/workflows/arc/supplemental/commit-guide.md` to analyze and split
     changes into atomic commits.

4. Stage WORK-STATUS.md with every task commit.

   - Before staging, update WORK-STATUS.md — advance Next Task, Last Completed, and
     Next Action to reflect the post-commit state.
   - Stage it alongside the task list changes. This is the primary update mechanism.

5. Enforce atomicity.

   - Do not include unrelated files in the same commit.
   - If separation is unclear, stop and re-check file-level intent before committing.
