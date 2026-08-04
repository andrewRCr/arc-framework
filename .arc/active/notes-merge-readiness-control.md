# Notes: merge-readiness-control

Reference context for task generation and execution — verified provider and platform behavior underlying the
spec's D1 mechanism claims.

## Provider behavior under the draft window

- **Codex** (verified live, fixture PR #442, closed unmerged, 2026-08-03): `@codex review` works on a draft
  PR — eyes-reaction in ~90s, review comment on the exact commit. The trigger list Codex advertises (PR opened
  for review, draft marked ready, the mention) belongs to its **auto-review** feature; with auto-review
  disabled — this project's posture for both providers — only the mention triggers, so nothing fires at the
  ready flip. Projects that enable provider auto-review should expect a benign, comment-only review to fire
  post-flip.
- **CodeRabbit**: manual invocation on drafts known-working from prior use (not re-verified — no need to spend
  a run); its auto-review skips drafts by default, which is the desired behavior under this lifecycle.
- **Copilot**: review requests on draft PRs are documented.

## Draft availability — evidence trail

- Draft PR creation verified working on this private repo (GitHub Pro), 2026-08-03.
- GitHub's docs no longer carry any plan-gating note for draft PRs — PR-stage page, about-PRs page, and plans
  page all checked; the old Team/Enterprise-only wording for private repos is gone.
- Residual uncertainty applies to Free-plan private repos only, covered by `merge.lock: none`.

## Auto-merge disarm semantics (source of D4's incompatibility claim)

Native auto-merge disarms only when someone **without** write access pushes, or the base branch switches; it
survives new pushes from write-permission actors. `expectedHeadOid` (GraphQL) / `--match-head-commit` (CLI)
guard **arming** time, not merge time — an armed auto-merge merges whatever head eventually satisfies
requirements.
