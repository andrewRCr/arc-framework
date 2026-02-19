Let's commit the current changes. First, assess the situation:

1. Run `git status` and `git --no-pager diff --stat` to understand what's pending.

2. **If simple** (single task/concern, clear scope, no multi-session overlap):
   - Stage files for one logical change
   - Commit using the format from DEVELOPMENT-RULES.md § Commit Message Format (already loaded at session init)
   - Git hooks validate automatically — no further guidance needed

3. **If complex** (multiple tasks accumulated, multi-session uncommitted work, interleaved changes
   that need separating): Read and follow `.arc/reference/workflows/supplemental/atomic-commit.md`
   for the full analysis workflow.
