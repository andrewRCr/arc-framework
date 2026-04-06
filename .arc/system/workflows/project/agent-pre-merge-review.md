# Workflow: Agent Pre-Merge Review (Project-Specific)

**Audience:** Agent-executed — your agent follows this for pre-merge code review.

**Purpose**: Two-pass defense-in-depth strategy for AI agent code reviews before merging work.
This is a project-specific workflow that populates the `pre-merge-review` extension point in
[arc-extensions.md][arc-ext-pre-merge-review]. It supplements the canonical
[review-triage method][arc-methods-rt], which governs finding classification.

1. **Pass 1 (Local)**: Run agent review locally before creating PR — catch the majority of issues
2. **Pass 2 (PR)**: Address agent comments on actual PR — catch remaining context-specific issues

This ensures clean initial PRs with focused, high-value PR reviews — similar to running linters
locally before CI.

**Applies to all merges:** base branch, parent branches (stacked workflow), any PR where review
is warranted.

**Tool adaptation:** This workflow describes the strategy and process. Specific review tools
(CodeRabbit, GitHub Copilot, etc.) plug into the generic steps — see
[Tool-Specific Notes](#tool-specific-notes) for tool commands and platform details.

---

## Pass 1: Local Review (Before PR)

**When**: After Phase 1 docs are committed in integrate-work-unit, before push.

### 1) Run Local Review

Run your review tool's local analysis command. Findings are typically pasted into the conversation
for immediate evaluation rather than saved to a tracking file.

### 2) Process Findings

Work through findings sequentially using the [review-triage method][arc-methods-rt]
(fix/defer/reject/silent-fix classification).

**Workflow**: Review finding -> evaluate -> fix or decide disposition -> repeat.

### 3) Commit Fixes

Stage all fixes and commit as a single batch (preferred). Document dispositions in the commit
message per the review-triage method's documentation format. Use the `(integration)` context
footer.

Split commits only if fixes have substantially different scope (e.g., critical bugs separate from
minor improvements).

### 4) Create Pull Request

```bash
gh pr create --base {parent-branch} --head {branch-name}
```

For stacked branches, create PR against the parent branch, not main.

Agent runs PR review (Pass 2) — expect fewer findings than without local review.

---

## Pass 2: PR Review (After PR Created)

**When**: After PR created, review agent has posted comments.

**Core principles:**

- **Sequential processing** — address comments one at a time to avoid duplicate agent responses
- **Batch commits** — minimize commits to reduce automated review triggers
- **Classification-aware** — review tools classify findings by severity; substantive findings
  get replies, minor suggestions get silent fixes

### 1) Process Comments

Work through PR comments sequentially using the [review-triage method][arc-methods-rt]. For each
comment:

1. **Evaluate and fix** (or decide to defer/reject)
2. **If substantive**: Draft reply immediately (use `[commit-hash]` placeholder) — captures context
   while fresh
3. **If minor/nitpick**: No reply needed, just fix silently
4. **Do NOT commit yet** — collect all fixes first

### 2) Batch Commit

After processing all comments, commit fixes in a single batch. Document dispositions per the
review-triage method. Use the `(integration)` context footer.

```bash
git push origin {branch-name}
```

### 3) Post Replies and Resolve

1. Get commit hash: `git log -1 --format=%h`
2. Replace `[commit-hash]` placeholders in drafted replies
3. Post replies to substantive findings (fixes, deferrals, rejections)
4. Resolve conversations: fixes after posting reply, nitpicks immediately, deferrals left open
   for acknowledgment

**Reply guidelines:**

- Be concise — agents are AI, skip politeness padding
- Be specific — reference line numbers, commit hashes, config values
- Provide context — link to PRDs, documented deferrals, related issues
- Each reply must be standalone — it will be posted as an individual GitHub comment. Don't
  reference other replies by number; if two findings share reasoning, restate the key point
  briefly or describe the other finding by topic

---

## Common Patterns

### Scheduled for Deletion (Defer)

**Finding**: "Fix validation in this serializer"
**Response**: Decline — code scheduled for removal in [Phase/Task]. Fixing adds churn to
short-lived code. Current functionality works correctly.

### Documentation Inconsistency (Fix)

**Finding**: "PRD has conflicting statements about scope"
**Action**: Fix immediately. Reply with what was corrected and commit hash.

### Minor Quality (Silent Fix)

**Finding**: "Typo: 'recieve' should be 'receive'"
**Action**: Fix silently, include in batch commit, resolve conversation without reply.

---

## Tool-Specific Notes

### CodeRabbit

- **Local review**: `coderabbit` (or `cr`). Use `--plain` for detailed output, `--prompt-only` for
  agent-optimized output. `--base {branch}` to specify comparison branch.
- **Classification**: Uses "Issue" (substantive, needs reply) and "Nitpick" (minor, silent fix)
- **PR behavior**: Replying to comments triggers automatic agent response — process sequentially
  to avoid duplicates
- **Temp file for replies**: Draft in `.arc/active/{category}/temp-agent-reply.md` (gitignored),
  copy to GitHub comment. Write as single continuous lines — GitHub wraps automatically, hard
  breaks create awkward formatting. Number replies in the order findings are reviewed — this
  preserves correspondence with PR comment order for efficient posting. Always append new
  replies to the end of the file. Place the `[commit-hash]` placeholder at the end of each
  reply (e.g., "Updated X to Y. Fixed in [commit-hash].").

### GitHub Copilot Reviews

- May require more explicit context in replies
- Adjust classification mapping to Copilot's severity levels

### Other Tools

- Adapt local review command and classification terminology
- Core workflow (evaluate -> fix -> batch commit -> reply) applies regardless of tool

---

## Anti-Patterns

- Do not skip local review — Pass 1 catches the majority of issues
- Do not reply before committing (PR Mode) — commit first, reply with hash
- Do not make multiple small commits for review fixes — batch to minimize re-review triggers
- Do not reply to nitpicks — clutters PR conversation; silent fix and resolve
- Do not rush fixes without evaluating context — check for documented deferrals first
- Do not fix code scheduled for deletion — defer unless it affects current functionality

---

[arc-methods-rt]: ../../../../.arc/system/workflows/arc-methods.md#review-triage
[arc-ext-pre-merge-review]: ../../../../.arc/system/workflows/arc-extensions.md#pre-merge-review
