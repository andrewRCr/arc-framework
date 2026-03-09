---
name: atomic-commit
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
     `.arc/system/workflows/arc/supplemental/prepare-commits.md` to analyze and split
     changes into atomic commits.

4. Enforce atomicity.

   - Do not include unrelated files in the same commit.
   - If separation is unclear, stop and re-check file-level intent before committing.
