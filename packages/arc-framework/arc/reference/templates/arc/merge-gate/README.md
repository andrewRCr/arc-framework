# Merge-Gate Recipe (GitHub)

Copy-ready recipe for the **auto-merge lane**: planning and backlog grooming auto-merges once checks pass,
while constitutional docs (rules, ADRs, strategies) and all code stay in the reviewed lane. See
[strategy-work-organization.md § Auto-Merge Lane][doctrine] for the doctrine these files implement.

These templates are **GitHub-flavored**. The doctrine is host-agnostic — other hosts adapt the same three
conditions (a stable required check, owner review on reviewed-lane paths only, and native auto-merge) using
their own primitives; only this recipe is GitHub-specific.

## Files

- `merge-ok.yml` — a GitHub Actions workflow exposing the `merge-ok` status check. It classifies each PR's
  lane from its changed paths, runs the heavy jobs only on the reviewed lane, and rolls their result up into
  the single check that branch protection requires. Replace the `quality` placeholder with your real
  build/test steps (or graft the `classify` + `merge-ok` jobs onto your existing CI workflow — `needs` only
  reaches jobs in the same workflow).
- `CODEOWNERS` — the reviewed-lane ownership skeleton. Owned paths require review; the trailing unowned block
  clears the auto-merge-lane paths so they need none. Replace `@your-org/reviewers` with your reviewers.

## Apply

1. Drop `merge-ok.yml` into `.github/workflows/` and fold in your real CI steps; place `CODEOWNERS` at
   `.github/CODEOWNERS` (or repo root / `docs/`).
2. In branch protection for your base branch, mark **`merge-ok`** as a required status check and enable
   **Require review from Code Owners**. Do not require the heavy jobs directly — they are lane-filtered and
   would stall planning-only PRs at *Pending*.
3. Enable the repository's **native auto-merge** setting.

A planning-only PR then merges unattended once `merge-ok` is green; a reviewed-lane PR additionally waits on
owner approval.

---

[doctrine]: ../../../strategies/arc/strategy-work-organization.md#auto-merge-lane
