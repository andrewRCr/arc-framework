# Workflow: Agent PR Review

This workflow documents a generic process for addressing AI code review agent comments (e.g., CodeRabbit,
GitHub Copilot Reviews) efficiently, balancing thoroughness with pragmatic decision-making and minimizing
automated review triggers. Adapt tool-specific notes as needed.

## Core Principles

1. **Sequential processing** - Address comments one at a time to avoid duplicate agent responses
2. **Batch commits** - Minimize PR commits to reduce automated review triggers
3. **Issue vs. nitpick distinction** - Only generate replies for actual issues requiring explanation
4. **Commit-first replies** - Include accurate commit hashes in responses

## Process

### 1. Sequential Comment Processing

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

### 2. Decision Framework

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

- Conflicts with established project standards (e.g., language- or type-safety rules)
- Out of scope for current work
- Agent misunderstands the context

**🔧 SILENT FIX** (nitpick - no reply) if:

- Typo corrections
- Formatting improvements
- Minor code quality enhancements
- Simple clarifications that don't need justification

### 3. Fix Collection Phase

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

### 4. Batch Commit Strategy

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
git push origin feature/[branch-name]
```

**Strategy B: Split Commits (ONLY IF NECESSARY)**

Split **only** if fixes have substantially different scope/impact:

- Separate **critical bug fixes** from **minor improvements**
- Separate **backend changes** from **frontend changes** (if large)
- Separate **test fixes** from **production code changes** (if significant)

**General rule**: Prefer single batch commit unless splitting provides meaningful semantic separation.

### 5. Generate Replies (with commit hashes)

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

### 6. Final Resolution

After all fixes committed and replies posted:

1. **Verify commits are in PR** - Check GitHub shows your fixes
2. **Resolve conversations** - Mark conversations as resolved:
    - Issues with fixes: After posting reply with commit hash
    - Nitpicks: Immediately (no reply needed)
    - Deferrals: Leave open for agent/team to acknowledge
3. **Wait for re-review** - Agent may respond to deferrals
4. **Delete temp file** - `rm _temp_agent_reply.md` after all replies posted

## Common Patterns

### Pattern 1: Legacy Code Scheduled for Replacement (Defer)

**Comment**: "Fix validation in legacy serializer/module"

**Classification**: Issue (requires defer explanation)

**Response**:

```markdown
Valid concern, but declining to fix. This legacy component is scheduled
for replacement in the next phase (documented deferral in the relevant
feature PRD). Fixing now would add churn to code with a short remaining
lifespan.

Current functionality works correctly and will be replaced by the new
implementation in the upcoming migration.
```

### Pattern 2: Documentation Inconsistency (Fix)

**Comment**: "PRD has conflicting statements about scope"

**Classification**: Issue (substantive fix)

**Response**:

```markdown
Good catch! Fixed Non-Goals section to clarify [specific item] is
in-scope as an exception to the general rule.

Fixed in commit [hash].
```

### Pattern 3: Test Quality Improvement (Fix)

**Comment**: "Test should assert X instead of just Y"

**Classification**: Issue (adds context)

**Response**:

```markdown
Valid improvement. Added assertion for X to verify [behavior].

Fixed in commit [hash].
```

### Pattern 4: Typo in Comment (Nitpick)

**Comment**: "Typo: 'recieve' should be 'receive'"

**Classification**: Nitpick (silent fix, no reply)

**Action**: Fix silently, include in batch commit, resolve conversation immediately

### Pattern 5: Configuration/Template Mismatch (Fix with context)

**Comment**: "Template says X but config says Y"

**Classification**: Issue (needs explanation)

**Response**:

```markdown
Template is correct - it matches **production** config. Test config
uses different value for [reason]. Added comment to clarify the
intentional difference.

Fixed in commit [hash].
```

## Tips

### Agent-Specific Adaptations

Tool adaptations (examples):

- CodeRabbit: replying inline may trigger automatic responses; sequential processing helps avoid duplicates
- GitHub Copilot Reviews: may require more explicit context in replies
- Other agents: adapt reply style to agent capabilities; maintain the core workflow (sequential → batch → reply)

### Formatting Issues (Windows)

**Problem**: Copy/paste from terminal loses markdown formatting

**Solutions**:

1. **Use temp file** (recommended): AI creates `_temp_agent_reply.md`, copy from VS Code
2. **Type directly**: GitHub's comment box supports markdown
3. **Use clipboard manager**: ClipClip/Ditto (may add extra whitespace)

### Batching Strategy Guidance

**Single commit is ideal** because:

- Minimizes automated review triggers (e.g., agent re-review)
- Cleaner commit history for PR review
- Easier to reference in replies (one hash)
- Reduces CI/CD pipeline runs

**Split commits ONLY when**:

- Critical bug fix needs immediate visibility separate from minor improvements
- Backend and frontend changes are substantial enough to review separately
- Changes have fundamentally different scope/impact that justifies semantic separation

**Never split**:

- Just to separate "types" of fixes (typos vs. refactoring) if they're all minor
- To match the number of agent comments (batching is the goal)
- For convenience (adds overhead, triggers more reviews)

### Reply Tone

- **Be concise** - Agents are AI, don't need politeness padding
- **Be specific** - Reference line numbers, commit hashes, config values
- **Provide context** - Link to PRDs, documented deferrals, related issues
- **Use markdown** - Bold key points, use code blocks for references

## Anti-Patterns

❌ **Don't**:

- Reply to comments immediately (triggers duplicate agent reviews)
- Rush to fix everything without evaluating context
- Make changes to code scheduled for deletion
- Ignore legitimate bugs just because code is temporary
- Resolve conversations before committing fixes
- Copy/paste replies directly from terminal (formatting breaks)
- Create multiple commits unnecessarily (triggers more reviews)
- Reply to nitpicks (clutters PR conversation)

✅ **Do**:

- Process comments sequentially
- Evaluate each comment against project standards
- Reference documented strategic deferrals
- Fix legitimate issues even in temporary code if they affect current functionality
- Batch all fixes into one commit (or minimal commits)
- Commit first, then reply with commit reference
- Use temp files for formatted replies
- Distinguish issues (need reply) from nitpicks (silent fix)
- Include commit hashes in replies for accuracy

## Example Session

**Agent (CodeRabbit) review with 6 comments:**

1. ✅ **PRD scope inconsistency** → Issue: Fixed (updated Non-Goals) - reply with context
2. 🔧 **Typo in docstring** → Nitpick: Fixed silently - no reply
3. ⏸️ **Email service stub returns** → Issue: Deferred (DRF code scheduled for deletion) - reply with deferral
4. ✅ **Test clarity** → Issue: Fixed (renamed test, added docstring) - reply with explanation
5. 🔧 **Import ordering** → Nitpick: Fixed silently - no reply
6. ✅ **Template comment needed** → Issue: Fixed (added clarification comment) - reply

**Workflow:**

1. Process all 6 comments sequentially, make all fixes locally
2. Commit all fixes in **one batch commit**: `fix: Address AI code review feedback`
3. Push to PR (triggers one agent re-review, not six)
4. Generate 4 replies for issues (items 1, 3, 4, 6) with accurate commit hash
5. Resolve nitpicks immediately (items 2, 5) without reply
6. Leave deferral (item 3) open for agent acknowledgment

**Result**: 1 commit, 4 replies, 2 silent fixes, 1 deferred

**Time**: ~30 minutes (review + fixes + replies)

## Future Improvements

- **Pre-commit agent check**: Configure agent to review before PR creation
- **Custom rules**: Add agent-specific config (e.g., `.coderabbit.yaml`) to suppress common false positives
- **Auto-defer patterns**: Tag known temporal code for agent to skip
- **Issue vs. nitpick automation**: Train agent to flag only substantive issues
