---
purpose: PR-side review-finding response cycle for this project — fetch via gh api, triage, fix, reply, push, verify.
audience: agent
arc:
  methods:
    - review-triage
---

# Workflow: Address PR Review (Project-Specific)

Project-specific elaboration of [integrate-work-unit][integrate-work-unit] § 8 — Address PR Review
Findings — for the gh-api-driven flow this project uses with CodeRabbit. Multi-pass-friendly:
each review cycle follows the same shape until zero unresolved threads remain on the PR.

**Tool baseline:** GitHub `gh` CLI for REST + GraphQL; CodeRabbit as the primary review agent.
The cycle shape (fetch → triage → fix-now-commit → reply-for-defer/reject → completion-doc-check
→ push → post-push verify) is tool-agnostic — adapt commands to other review tools as needed.

---

## Cycle Overview

For each CodeRabbit review pass:

1. Fetch unresolved review threads
2. Triage findings, present dispositions to user, await approval
3. Apply fix-now changes (atomic commits, no push yet); re-run Tier 1 quality gates
4. Post replies + resolve threads for defer/reject (before push so CR doesn't re-raise)
5. Completion doc freshness check; update if needed
6. Push
7. Post-push verification (auto-resolution caught fix-now threads; defer/reject stayed resolved)
8. If CR's next pass surfaces new findings, return to step 1; otherwise the cycle is closed.

Final state: zero unresolved review threads on the PR.

---

## 1) Fetch Unresolved Review Threads

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 10) {
            nodes { id body author { login } }
          }
        }
      }
    }
  }
}' -f owner={OWNER} -f repo={REPO} -F pr={PR_NUMBER}
```

Filter to unresolved threads with jq:

```bash
... | jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false))'
```

`{PR_NUMBER}` for the current branch's PR is `gh pr view --json number -q .number`.

## 2) Triage Findings

For each unresolved thread, classify per the [review-triage method][arc-methods-rt]:
fix-now / silent-fix / defer / reject. Present the full triage to the user with rationale per
finding. Wait for user approval (or iterate on dispositions if pushback) before implementing.

## 3) Apply Fix-Now Changes (Don't Push Yet)

For fix-now and silent-fix items:

- Apply changes locally
- Commit with `(code review)` context footer
- Atomicity by logical scope: same concern across N findings → one commit; different concerns →
  separate commits. Commit count is independent of finding count.
- Document dispositions in the commit message per the [review-triage method][arc-methods-rt] format
  (not required for silent-fix-only commits).

**Re-run Tier 1 quality gates** on modified files after fix-now commits per
[DEV-RULES.PROJECT][dev-rules-project] § Quality Gates. Pre-commit hooks cover shellcheck and
validators; `lint:md:file`, `lint:ts`, and `test:unit` need explicit invocation. Mandatory after
review-driven commits.

**Do not push yet.** Push triggers CR's next review pass; the rest of this cycle (defer/reject
replies, completion doc check) needs to be in place before that.

## 4) Post Replies for Defer / Reject

For findings that result in NO code change (defer / reject), reply and resolve the thread before
push so CR sees the resolved state and doesn't re-raise the finding on its next pass.

**Reply** (REST API):

```bash
gh api repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/comments/{COMMENT_ID}/replies \
  -F body='Deferred — code is scheduled for removal in [Phase X]. Brief rationale.'
```

**Resolve thread** (GraphQL mutation):

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}' -f threadId={THREAD_ID}
```

**Reply guidelines:**

- Concise — agents are AI, skip politeness padding
- Specific — line numbers, config values, doc / PRD references
- Standalone — each reply is its own GitHub comment; if two findings share reasoning, restate the
  point briefly in each rather than cross-referencing

**No reply for fix-now / silent-fix.** CR auto-resolves threads where the relevant file changed
and the fix is clear. Replying just adds noise. Verify auto-resolution in step 7.

## 5) Completion Doc Freshness Check

If review-driven commits in this cycle made substantive changes, verify `completion-{name}.md`
still reflects the delivered state — see [integrate-work-unit][integrate-work-unit] § 6b for the
field-by-field check.

**Substantive vs cosmetic test** — *would the completion doc's headline sections genuinely change?*

- **Substantive** (run check): new / removed capability, field rename across surfaces, enum
  extension, new deferral, security hardening, new tests reflecting new coverage
- **Cosmetic** (skip check): typos, formatting, link target corrections, doc-consistency-only
  fixes, comment-level clarifications

If updated, commit the completion doc edit with `(code review)` context footer.

## 6) Push

```bash
git push origin {BRANCH_NAME}
```

CR's next review pass kicks off. Replies posted in step 4 are in place, so CR sees resolved
threads for defer/reject items and doesn't re-raise them.

## 7) Post-Push Verification

**Wait for user signal before running verification.** CR's next review pass typically takes
5–10 minutes (occasionally 3–4, sometimes longer); polling proactively wastes effort and
tokens. The user signals when CR has finished — at that point, run the verification below.

After CR's next pass completes:

- **Fix-now threads:** CR auto-closes when the relevant file changed and the fix matches the
  suggestion. Manually resolve any it missed (`resolveReviewThread` mutation per step 4).
- **Defer/reject threads:** confirm they stayed resolved. CR sometimes replies acknowledgment
  prose ("understood", etc.) without changing the resolution state — spot-check the thread.
  Manual verification fine; doesn't need automation.

Then re-fetch unresolved threads (step 1). If new findings surfaced, the cycle continues. If zero
unresolved, the PR is review-clean.

---

## Final-State Verification

```bash
gh api graphql -f query='
{ repository(owner: "{OWNER}", name: "{REPO}") {
    pullRequest(number: {PR_NUMBER}) {
      reviewThreads(first: 100) { nodes { isResolved } }
    } } }' \
  | jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false)) | length'
```

Output `0` → PR ready to merge.

---

## Tool-Specific Notes

### CodeRabbit

- **Classification mapping:** CR uses `Issue` (substantive) and `Nitpick` (minor). Map Issue →
  fix-now / defer / reject by content; Nitpick → silent-fix or reject (for noise).
- **Auto-resolution:** CR self-closes threads when the relevant file changed and the fix matches.
  Don't rely on it 100% — verify in step 7.
- **Pause / resume:** post `@coderabbitai pause` as a PR comment to suppress auto-review on
  subsequent pushes; `@coderabbitai resume` to re-enable. Use only when forced to push
  intermediate state (safety backup, CI check, cross-machine handoff). Default flow doesn't need
  this.
- **Project-level config** (optional): `.coderabbit.yaml` at repo root —
  `auto_review.auto_pause_after_reviewed_commits: N`, `auto_review.ignore_title_keywords:
  [wip, draft]`. See CodeRabbit docs.

---

## Anti-Patterns

- **Push before all cycle findings are addressed** (code or replies). Push triggers CR re-review;
  partial state confuses the diff and can resurface defer/reject items.
- **Reply to fix-now / silent-fix items.** CR auto-resolves on file change; replies just add
  noise. Save replies for items where the rationale isn't visible from the diff.
- **Bundle multiple cycles into one push to "minimize commits".** Wrong axis. Push count =
  re-review pass count; commit count is independent.
- **Skip the completion doc check for substantive cycles.** The completion doc IS the PR
  description; stale headline sections undermine the review it supports.
- **Update the status file for cycle bookkeeping** (cycle numbers, drafted replies, commit
  ranges). Cycle context lives in SESSION-NOTES, PR comments, and git log. The status file is
  stable through the review window — see [integrate-work-unit][integrate-work-unit] Phase 2
  § Status file discipline.
- **Skip post-push verification.** Auto-resolution isn't reliable enough to trust without
  checking. A 30-second scan catches the threads CR missed.

---

[arc-methods-rt]: ../../methods/review-triage.md
[dev-rules-project]: ../../../reference/constitution/DEV-RULES.PROJECT.md
[integrate-work-unit]: ../arc/work-unit-lifecycle/integrate-work-unit.md
