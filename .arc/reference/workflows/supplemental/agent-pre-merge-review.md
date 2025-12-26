# Agent Pre-Merge Review Workflow

**Primary Agent**: CodeRabbit (adaptable to other agents)

## Overview

This workflow documents the **two-pass defense-in-depth strategy** for AI agent code reviews before merging work
to main:

1. **Local Mode (Pass 1)**: Run agent review locally before creating PR → catch 80-90% of issues
2. **PR Mode (Pass 2)**: Address agent comments on actual PR → catch remaining 10-20% of issues

This two-pass approach ensures **clean initial PRs** with focused, high-value PR reviews, similar to running
linters locally before CI.

## When to Use This Workflow

**Timing**: After feature work is complete and archived, before integration to main

**Choose your mode**:

- **Local Mode** - Use when reviewing locally before creating pull request (you are here for first pass)
- **PR Mode** - Use when addressing review comments on existing pull request (second pass after PR creation)

---

## Local Mode: Pre-PR Review

**Purpose**: Catch the majority of issues before PR creation using local agent review

**When**: After feature complete/archived, before `gh pr create`

### Process

#### 1. Run Local Review

```bash
# Example with CodeRabbit CLI (adjust for your agent)
coderabbit review local

# Wait for agent to complete analysis
# Agent generates findings report (not PR comments)
```

**Note**: Findings are typically **pasted directly into the conversation** rather than saved to a
tracking file. This allows for immediate evaluation and fixes without additional file management overhead.

#### 2. Process Findings

Work through agent findings sequentially using the **Decision Framework**:

**Workflow**: User pastes finding → AI helps evaluate → AI suggests fix (or recommends deferral/rejection) →
fix if applicable or move on → Repeat for next finding

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

- Conflicts with project standards (e.g., using `Any` vs `object`)
- Out of scope for current work
- Agent misunderstands the context

#### 3. Make Fixes Locally

```bash
# Work through all findings
# Make fixes to local files
# DO NOT commit yet
```

**Track your decisions:**

- Which findings you fixed
- Which you're deferring (with brief reason)
- Which you're rejecting (with brief reason)

#### 4. Commit Changes

```bash
# Stage all changes
git add [files]

# Single batch commit (preferred)
git commit -m "fix: Address local agent review findings" \
  -m "**Fixed:**" \
  -m "- [Finding 1 description]" \
  -m "- [Finding 2 description]" \
  -m "" \
  -m "**Deferred:**" \
  -m "- [Finding X]: [Brief reason]" \
  -m "" \
  -m "**Rejected:**" \
  -m "- [Finding Y]: [Brief reason]"

# Push to branch
git push origin [branch-name]
```

**Alternative**: Split commits only if fixes have substantially different scope/impact (backend vs frontend,
critical bugs vs improvements)

#### 5. Create Pull Request

```bash
# Now create PR with cleaner code
gh pr create --title "[Title]" --body "[Description]"

# Agent will run PR review (Pass 2)
# Expect fewer findings than if you'd skipped local review
```

**Local Mode Complete** - Proceed to PR Mode when agent comments appear on PR

---

## PR Mode: PR-Triggered Review

**Purpose**: Address remaining agent findings on actual pull request

**When**: After PR created, agent has posted review comments

**Context**: This is Pass 2 - most issues were caught in local review, this catches the remaining 10-20%

### Core Principles

1. **Sequential processing** - Address comments one at a time to avoid duplicate agent responses
2. **Batch commits** - Minimize PR commits to reduce automated review triggers
3. **Issue vs. nitpick distinction** - Only generate replies for actual issues requiring explanation
4. **Commit-first replies** - Include accurate commit hashes in responses

### Process

#### 1. Sequential Comment Processing

Work through comments **one at a time** in order:

**For each comment, evaluate:**

**a) Validity**

- Is this a real issue or just a preference?
- Does it align with project standards?

**b) Context**

- Does it conflict with documented strategic deferrals?
- Is this code scheduled for replacement/deletion?
- Is it within the current feature scope?

**c) Impact**

- Does it affect functionality or just code quality?
- Is it worth addressing now vs. later?

**d) Classification**

- **Issue**: Requires explanation/justification in reply (deferred work, scope decisions, bugs)
- **Nitpick**: Simple fix, no reply needed (typos, formatting, minor improvements)

#### 2. Decision Framework

Use same framework as Local Mode:

**✅ FIX NOW** if:

- Legitimate bug affecting current functionality
- Documentation inconsistency causing confusion
- Simple fix (<10 lines, low risk)
- Improves code we're actively maintaining

**⏸️ DEFER** (requires reply) if:

- Code is scheduled for deletion in next phase
- Already documented as strategic deferral
- Requires substantial refactoring of temporary code
- Part of a different feature/phase

**❌ REJECT** (requires reply) if:

- Conflicts with project standards (e.g., using `Any` vs `object`)
- Out of scope for current work
- Agent misunderstands the context

**🔧 SILENT FIX** (nitpick - no reply) if:

- Typo corrections
- Formatting improvements
- Minor code quality enhancements
- Simple clarifications that don't need justification

#### 3. Fix Collection Phase

**Important**: Make fixes but **DO NOT commit yet**

```bash
# Work through all comments sequentially
# Make fixes to local files
# DO NOT commit individual changes
# DO NOT reply to comments yet
```

**Track which comments need replies:**

- Issues requiring defer/reject explanation
- Issues with substantive fixes needing context

**Track which are nitpicks:**

- Simple fixes that need no explanation
- Will be silently included in batch commit

#### 4. Batch Commit Strategy

**After processing all comments**, commit fixes using **one of these strategies**:

**Strategy A: Single Batch Commit (PREFERRED)**

Use when all fixes are related to PR review feedback:

```bash
# Stage all changes
git add [files]

# Commit everything together
git commit -m "fix: Address AI code review feedback" \
  -m "**Issues fixed:**" \
  -m "- [Issue 1 description]" \
  -m "- [Issue 2 description]" \
  -m "" \
  -m "**Nitpicks addressed:**" \
  -m "- [Nitpick 1, 2, 3 summary]" \
  -m "" \
  -m "**Deferred:**" \
  -m "- [Issue X]: [Brief reason - detailed in PR comment]"

# Push to PR
git push origin [branch-name]
```

**Strategy B: Split Commits (ONLY IF NECESSARY)**

Split **only** if fixes have substantially different scope/impact:

- Separate **critical bug fixes** from **minor improvements**
- Separate **backend changes** from **frontend changes** (if large)
- Separate **test fixes** from **production code changes** (if significant)

**General rule**: Prefer single batch commit unless splitting provides meaningful semantic separation.

#### 5. Generate Replies (with commit hashes)

**Setup (once per PR review):**

Create a single temp file for all replies: `_temp_agent_reply.md`

AI updates this file for each comment requiring a reply (don't create new files).

**For Issues (not nitpicks):**

**a) AI updates temp file** with new reply content (overwrites previous)

**b) Reply format for fixes:**

```markdown
[Brief acknowledgment]

[What was fixed and why]

Fixed in commit [hash].
```

**c) Reply format for deferrals:**

```markdown
[Acknowledgment of concern]

Declining because:

1. **[Reason 1]** - [Details]
2. **[Reason 2]** - [Details]

[Context/justification - link to PRD/documentation if applicable]
```

**d) Copy from VS Code:**

1. Open `_temp_agent_reply.md` in VS Code
2. Select all (Ctrl+A)
3. Copy (Ctrl+C)
4. Paste into GitHub comment

**e) Repeat** for next comment requiring reply (AI overwrites temp file)

**For Nitpicks:**

- No reply needed
- Silently included in batch commit
- Resolve conversation immediately after commit is pushed

#### 6. Final Resolution

After all fixes committed and replies posted:

1. **Verify commits are in PR** - Check GitHub shows your fixes
2. **Resolve conversations** - Mark conversations as resolved:
   - Issues with fixes: After posting reply with commit hash
   - Nitpicks: Immediately (no reply needed)
   - Deferrals: Leave open for agent/team to acknowledge
3. **Wait for re-review** - Agent may respond to deferrals
4. **Delete temp file** - `rm _temp_agent_reply.md` after all replies posted

---

## Common Patterns

### Pattern 1: DRF Code Scheduled for Deletion (Defer)

**Comment**: "Fix validation in DRF serializer"

**Classification**: Issue (requires defer explanation)

**Response** (PR Mode only):

```markdown
Valid concern, but declining to fix. This DRF serializer is scheduled
for complete removal in API Layer Phase 2 (documented deferral in
prd-api-layer-modernization-p2.md). Fixing would add churn to code
with ~2 week lifespan.

Current functionality works correctly. Will be updated during planned refactoring.
```

### Pattern 2: Documentation Inconsistency (Fix)

**Comment/Finding**: "PRD has conflicting statements about scope"

**Classification**: Issue (substantive fix)

**Action**: Fix immediately

**Response** (PR Mode only):

```markdown
Good catch! Fixed Non-Goals section to clarify [specific item] is
in-scope as an exception to the general rule.

Fixed in commit [hash].
```

### Pattern 3: Test Quality Improvement (Fix)

**Comment/Finding**: "Test should assert X instead of just Y"

**Classification**: Issue (adds context)

**Action**: Fix immediately

**Response** (PR Mode only):

```markdown
Valid improvement. Added assertion for X to verify [behavior].

Fixed in commit [hash].
```

### Pattern 4: Typo in Comment (Nitpick)

**Comment/Finding**: "Typo: 'recieve' should be 'receive'"

**Classification**: Nitpick (silent fix)

**Action**: Fix silently, include in batch commit

**Response** (PR Mode): No reply, resolve conversation immediately

### Pattern 5: Configuration/Template Mismatch (Fix with context)

**Comment/Finding**: "Template says X but config says Y"

**Classification**: Issue (needs explanation)

**Action**: Fix immediately

**Response** (PR Mode only):

```markdown
Template is correct - it matches **production** config. Test config
uses different value for [reason]. Added comment to clarify the
intentional difference.

Fixed in commit [hash].
```

---

## Tips

### Two-Pass Strategy Benefits

**Local Mode (Pass 1):**

- Catches majority of issues before PR creation
- Cleaner initial PR for human reviewers
- Faster iteration (no PR overhead)
- No reply overhead

**PR Mode (Pass 2):**

- Catches context-specific issues from actual diff view
- Catches issues that emerge from integration concerns
- Lower volume of findings (most caught in Pass 1)
- More focused review conversation

**Combined Result:**

- Higher quality code merged to main
- Less PR review noise and back-and-forth
- Better use of agent capabilities (two perspectives)
- Cleaner git history

### Agent-Specific Adaptations

**CodeRabbit**:

- Local: Use `coderabbit review local` CLI command
- PR: Replying to in-repo comments triggers automatic response
- Use sequential processing to avoid duplicate agent reviews
- Agent understands technical context well

**GitHub Copilot Reviews**:

- May require more explicit context in replies
- Adjust tone/detail as needed

**Other Agents**:

- Adapt to agent's local review capabilities
- Maintain core workflow (evaluate → fix → commit)

### Formatting Issues (Windows, PR Mode)

**Problem**: Copy/paste from terminal loses markdown formatting

**Solutions**:

1. **Use temp file** (recommended): AI creates `_temp_agent_reply.md`, copy from VS Code
2. **Type directly**: GitHub's comment box supports markdown
3. **Use clipboard manager**: ClipClip/Ditto (may add extra whitespace)

### Batching Strategy Guidance

**Single commit is ideal** because:

- Minimizes automated review triggers (e.g., CodeRabbit re-review)
- Cleaner commit history for PR review
- Easier to reference in replies (one hash) - PR Mode only
- Reduces CI/CD pipeline runs

**Split commits ONLY when**:

- Critical bug fix needs immediate visibility separate from minor improvements
- Backend and frontend changes are substantial enough to review separately
- Changes have fundamentally different scope/impact that justifies semantic separation

**Never split**:

- Just to separate "types" of fixes (typos vs. refactoring) if they're all minor
- To match the number of agent comments (batching is the goal)
- For convenience (adds overhead, triggers more reviews)

### Reply Tone (PR Mode)

- **Be concise** - Agents are AI, don't need politeness padding
- **Be specific** - Reference line numbers, commit hashes, config values
- **Provide context** - Link to PRDs, documented deferrals, related issues
- **Use markdown** - Bold key points, use code blocks for references

---

## Anti-Patterns

❌ **Don't**:

- **Skip local review** - Pass 1 catches majority of issues, don't skip it
- Reply to comments immediately (PR Mode - triggers duplicate agent reviews)
- Rush to fix everything without evaluating context
- Make changes to code scheduled for deletion
- Ignore legitimate bugs just because code is temporary
- Resolve conversations before committing fixes (PR Mode)
- Copy/paste replies directly from terminal (PR Mode - formatting breaks)
- Create multiple commits unnecessarily (triggers more reviews)
- Reply to nitpicks (PR Mode - clutters PR conversation)

✅ **Do**:

- **Run local review first** - Always do Pass 1 before creating PR
- Evaluate findings/comments against project standards
- Reference documented strategic deferrals
- Fix legitimate issues even in temporary code if they affect current functionality
- Batch all fixes into one commit (or minimal commits)
- Commit first, then reply with commit reference (PR Mode)
- Use temp files for formatted replies (PR Mode)
- Distinguish issues (need reply in PR Mode) from nitpicks (silent fix)
- Include commit hashes in replies for accuracy (PR Mode)

---

## Example Sessions

### Example 1: Local Mode (Pre-PR)

**Agent (CodeRabbit) local review with 15 findings:**

1. ✅ **PRD scope inconsistency** → Fix (updated Non-Goals)
2. ✅ **Typo in docstring** → Fix silently
3. ⏸️ **Email service stub returns** → Defer (DRF code scheduled for deletion)
4. ✅ **Test clarity** → Fix (renamed test, added docstring)
5. ✅ **Import ordering** → Fix silently
6. ✅ **Template comment needed** → Fix (added clarification comment)
7. ✅ **Type annotation missing** → Fix
8. ✅ **Unused import** → Fix silently
9. ⏸️ **Complex function refactor** → Defer (out of scope)
10. ✅ **Missing test case** → Fix (added edge case test)
11. ✅ **Variable naming** → Fix
12. ❌ **Use Any instead of object** → Reject (conflicts with project standards)
13. ✅ **Missing docstring** → Fix
14. ✅ **Hardcoded value** → Fix (extract to config)
15. ✅ **Formatting inconsistency** → Fix silently

**Workflow:**

1. Process all 15 findings, make fixes locally (11 fixes, 2 defers, 2 rejects)
2. Commit all fixes in **one batch commit**: `fix: Address local agent review findings`
3. Create PR with cleaner code
4. Agent runs PR review (Pass 2) - finds 3 additional issues (80% reduction)

**Result**: 1 commit before PR, 11 fixes applied, 2 deferred (documented), 2 rejected (noted)

**Time**: ~45 minutes (review + fixes + commit)

### Example 2: PR Mode (Post-PR)

**Agent (CodeRabbit) PR review with 3 comments** (after local review):

1. ✅ **Test assertion could be stronger** → Issue: Fixed (added assertion) - reply with context
2. 🔧 **Minor wording improvement** → Nitpick: Fixed silently - no reply
3. ⏸️ **Consider extracting helper** → Issue: Deferred (nice-to-have, not critical) - reply with deferral

**Workflow:**

1. Process all 3 comments sequentially, make all fixes locally
2. Commit all fixes in **one batch commit**: `fix: Address AI code review feedback`
3. Push to PR (triggers one agent re-review, not three)
4. Generate 2 replies for issues (items 1, 3) with accurate commit hash
5. Resolve nitpick immediately (item 2) without reply
6. Leave deferral (item 3) open for agent acknowledgment

**Result**: 1 commit, 2 replies, 1 silent fix, 1 deferred

**Time**: ~15 minutes (review + fixes + replies)

**Total Time (Both Passes)**: ~60 minutes for comprehensive two-pass review

---

## Metrics & Outcomes

**Historical Data (example project):**

| Branch                       | Local Review Findings | PR Review Findings | Reduction | Time Saved |
|------------------------------|-----------------------|--------------------|-----------|------------|
| Authentication Modernization | N/A (no local review) | 5                  | N/A       | N/A        |
| API Layer P2                 | 15 (estimated)        | 3 (estimated)      | 80%       | ~30 min    |

**Expected Pattern:**

- Local Mode catches: 80-90% of total issues
- PR Mode catches: 10-20% of total issues (context-specific)
- Time investment: Local +30 min, PR -30 min = net neutral with better outcomes

---

**Workflow Version**: v3.0 (two-pass strategy with local + PR modes)

**Last Updated**: 2025-10-21
