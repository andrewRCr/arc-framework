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

1. Fetch unresolved review threads — and non-inline comments (CR body/summary nitpicks, outside-diff notes)
2. Triage findings, present dispositions to user, await approval
3. Apply fix-now changes (atomic commits, no push yet); re-run Tier 1 quality gates
4. Post replies + resolve threads for defer/reject (before push so CR doesn't re-raise)
5. Completion doc freshness check; update if needed
6. Push
7. Post-push verification (auto-resolution caught fix-now threads; defer/reject stayed resolved)
8. Recommend whether another review round is warranted — return to step 1 only when remaining
   findings justify it; otherwise resolve the fixed threads and close.

Final state: zero unresolved review threads on the PR — reached by addressing findings, not by an
assumed fixed number of passes.

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
            nodes { id databaseId body author { login } }
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

### Non-inline comments (CodeRabbit body nitpicks + outside-diff notes)

Not every CodeRabbit finding is an inline `reviewThread`. CR also posts a **review summary body**
and collapses **nitpicks** and **"outside diff range"** notes into review / issue comments that the
`reviewThreads` query above never returns. Fetch those too, or they go silently unaddressed:

```bash
# CR review bodies (summary + walkthrough)
gh api repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/reviews \
  --jq '.[] | select(.user.login | test("coderabbit"; "i")) | {id, body}'

# PR-level issue comments (status / summary comments, @-mention replies)
gh api repos/{OWNER}/{REPO}/issues/{PR_NUMBER}/comments \
  --jq '.[] | select(.user.login | test("coderabbit"; "i")) | {id, body}'
```

Scan each body for `<details>`-collapsed **nitpick** blocks and **outside-diff-range** sections;
extract the actionable items and carry them into triage (step 2) alongside the inline threads.
These have no thread to resolve — they are addressed by the fix or by a reply, not a
`resolveReviewThread` mutation.

## 2) Triage Findings

For each unresolved thread — and each non-inline item surfaced above — classify per the
[review-triage method][arc-methods-rt]: fix-now / silent-fix / defer / reject. Present the full
triage to the user with rationale per finding. Wait for user approval (or iterate on dispositions
if pushback) before implementing. Non-inline nitpicks are usually `silent-fix` or `reject` (noise);
outside-diff-range notes can be substantive — triage on content, not location.

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

The REST replies endpoint expects the numeric comment `databaseId`, not the GraphQL global node
`id`. Capture both in the GraphQL fetch above (`nodes { id databaseId ... }`); use `databaseId`
here and `id` for the resolve mutation in the next block.

```bash
gh api repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}/comments/{COMMENT_DATABASE_ID}/replies \
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

Push the review-fixup commits: `origin {BRANCH_NAME}`.

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

## 8) Retry Recommendation

Another review round is not automatic — recommend one only when it earns its latency. After a
cycle's fixes are pushed, weigh whether a further pass is worth triggering or awaiting, and surface
a one-line recommendation for the user to decide:

- **Recommend another round** when the fix-now changes were substantive enough to plausibly
  introduce new issues, or a prior pass left material findings a re-review would re-check.
- **Recommend closing** when the remaining work is cosmetic, all substantive findings are resolved,
  or successive passes are returning only noise — resolve the fixed threads, address any non-inline
  remainder, and move to merge.

Trigger a round by posting `@coderabbitai review` as a PR comment (the same command that requests
the initial review); to stop further passes while closing out, post `@coderabbitai pause` (see
Tool-Specific Notes). The recommendation is advisory — the user decides whether to spend another
round.

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
- **Comment locations:** findings live in three places — inline `reviewThreads` (resolvable), the
  **review summary body** (walkthrough + collapsed nitpicks), and **PR issue comments**
  (status / summary, "outside diff range" notes). Only the first has threads to resolve; fetch all
  three (step 1) so body nitpicks and outside-diff notes aren't missed.
- **Auto-resolution:** CR self-closes threads when the relevant file changed and the fix matches.
  Don't rely on it 100% — verify in step 7.
- **Trigger:** post `@coderabbitai review` as a PR comment to request a review pass — the initial
  review and every subsequent round are requested this way.
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
- **Update the meta file for cycle bookkeeping** (cycle numbers, drafted replies, commit
  ranges). Cycle context lives in SESSION-NOTES, PR comments, and git log. The meta file is
  stable through the review window — see [integrate-work-unit][integrate-work-unit] Phase 2
  § Meta file discipline.
- **Skip post-push verification.** Auto-resolution isn't reliable enough to trust without
  checking. A 30-second scan catches the threads CR missed.
- **Assume a fixed number of review rounds.** Don't loop reflexively until "CR goes quiet," nor
  stop at an arbitrary count — recommend another pass only when remaining findings justify the
  latency (step 8).
- **Triage only inline threads.** Body nitpicks and outside-diff-range notes never appear in
  `reviewThreads`; fetching threads alone silently drops them (step 1 § Non-inline comments).

---

[arc-methods-rt]: ../../methods/review-triage.md
[dev-rules-project]: ../../../system/rules/DEV-RULES.PROJECT.md
[integrate-work-unit]: ../arc/work-unit-lifecycle/integrate-work-unit.md
