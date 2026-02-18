# Workflow: Agent Pre-Merge Review

**Audience:** Agent-executed — your agent follows this for pre-merge code review.

**Purpose**: Two-pass defense-in-depth strategy for AI agent code reviews before merging work.

1. **Pass 1 (Local)**: Run agent review locally before creating PR — catch the majority of issues
2. **Pass 2 (PR)**: Address agent comments on actual PR — catch remaining context-specific issues

This ensures clean initial PRs with focused, high-value PR reviews — similar to running linters
locally before CI.

**Applies to all merges:** main, parent branches (stacked workflow), any PR where review is warranted.

**Tool adaptation:** This workflow describes the strategy and decision-making process. Specific review
tools (CodeRabbit, GitHub Copilot, etc.) plug into the generic steps — see
[Tool-Specific Notes](#tool-specific-notes) for tool commands and platform details.

---

## Decision Framework

Used in both passes. For each finding, evaluate validity (real issue or preference?), context
(conflicts with documented deferrals? code scheduled for replacement?), and impact (functionality
vs code quality?).

**✅ FIX NOW** if:

- Legitimate bug affecting current functionality
- Documentation inconsistency causing confusion
- Simple fix (<10 lines, low risk)
- Improves code we're actively maintaining

**⏸️ DEFER** (document reason) if:

- Code is scheduled for deletion in next phase
- Already documented as strategic deferral
- Requires substantial refactoring of temporary code
- Part of a different feature/phase

**❌ REJECT** (note reason) if:

- Conflicts with project standards
- Out of scope for current work
- Agent misunderstands the context

**🔧 SILENT FIX** (minor/nitpick findings — no reply needed) if:

- Typo corrections, formatting improvements
- Minor code quality enhancements
- Simple clarifications that don't need justification

---

## Pass 1: Local Review (Before PR)

**When**: After work is complete, before `gh pr create`.

### 1) Run Local Review

Run your review tool's local analysis command. Findings are typically pasted into the conversation
for immediate evaluation rather than saved to a tracking file.

### 2) Process Findings

Work through findings sequentially using the Decision Framework above.

**Workflow**: Review finding → evaluate → fix or decide disposition → repeat.

### 3) Commit Fixes

Stage all fixes and commit as a single batch (preferred). Track which findings were fixed, deferred,
or rejected — include in commit message:

```bash
git commit -m "fix: address local agent review findings

Fixed:
- [Finding 1 description]
- [Finding 2 description]

Deferred:
- [Finding X]: [Brief reason]

Rejected:
- [Finding Y]: [Brief reason]"
```

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

Work through PR comments sequentially using the Decision Framework. For each comment:

1. **Evaluate and fix** (or decide to defer/reject)
2. **If substantive**: Draft reply immediately (use `[commit-hash]` placeholder) — captures context
   while fresh
3. **If minor/nitpick**: No reply needed, just fix silently
4. **Do NOT commit yet** — collect all fixes first

### 2) Batch Commit

After processing all comments, commit fixes in a single batch:

```bash
git commit -m "fix: address AI code review feedback

Issues fixed:
- [Issue 1 description]
- [Issue 2 description]

Nitpicks addressed:
- [Summary of minor fixes]

Deferred:
- [Issue X]: [Brief reason — detailed in PR comment]"

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
  breaks create awkward formatting.

### GitHub Copilot Reviews

- May require more explicit context in replies
- Adjust classification mapping to Copilot's severity levels

### Other Tools

- Adapt local review command and classification terminology
- Core workflow (evaluate → fix → batch commit → reply) applies regardless of tool

---

## Illustrative Metrics

The following are illustrative estimates, not measured benchmarks. Actual results vary by project
complexity, review tool, and codebase.

| Scenario                    | Local Findings | PR Findings | Estimated Reduction |
|-----------------------------|----------------|-------------|---------------------|
| Without local review        | N/A            | ~15         | N/A                 |
| With local review (Pass 1)  | ~15            | ~3          | ~80%                |

**Expected pattern:** Local review catches the majority of issues. PR review catches
context-specific issues that only emerge from the actual diff. Time investment is roughly neutral
(local review time offset by reduced PR review complexity).

---

## Anti-Patterns

- ❌ Skip local review — Pass 1 catches the majority of issues
- ❌ Reply before committing (PR Mode) — commit first, reply with hash
- ❌ Multiple small commits for review fixes — batch to minimize re-review triggers
- ❌ Reply to nitpicks — clutters PR conversation; silent fix and resolve
- ❌ Rush fixes without evaluating context — check for documented deferrals first
- ❌ Fix code scheduled for deletion — defer unless it affects current functionality
