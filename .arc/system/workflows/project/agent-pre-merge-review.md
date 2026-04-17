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
message per the review-triage method's documentation format. Use the `(code review)` context
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
- **Atomic commits, one push per review cycle** — the review tool re-triggers on push, not
  commit. Commit atomically per logical scope (ARC's atomicity principle); collect all fixes
  from the current review pass; push once when done. Commit count doesn't matter — push count
  does. See Step 3 for intermediate-push escape hatches.
- **Classification-aware** — review tools classify findings by severity; substantive findings
  get replies, minor suggestions get silent fixes

### 1) Process Comments

Work through PR comments sequentially using the [review-triage method][arc-methods-rt]. For each
comment:

1. **Evaluate and fix** (or decide to defer/reject)
2. **If substantive**: Draft reply immediately (use `[commit-hash]` placeholder) — captures context
   while fresh
3. **If minor/nitpick**: No reply needed, just fix silently
4. **Commit atomically by logical scope** as you complete each scope of fixes. Multiple
   commits are fine — scope matters more than count. Do NOT push yet.

### 2) Commit Fixes (Atomic by Scope)

Commit fixes with the `(code review)` context footer, grouped by logical scope rather than
mechanically per finding. Same concern across N findings → one commit. Different concerns →
separate commits. Document dispositions per the [review-triage method][arc-methods-rt] in
the relevant commit message.

### 2b) Completion Doc Freshness Check (Pre-Push)

If review-driven commits in this cycle included substantive changes, verify
`completion-{name}.md` still reflects the delivered state before pushing. Run the
field-by-field check per [integrate-work-unit.md][integrate-work-unit] § 6b
(Summary / Key Deliverables / Implementation Highlights / Verification / Follow-Up Work).
Update and commit with `(integration)` context footer if stale.

**Substantive vs. cosmetic triage** — one test: *"would the completion doc's headline
sections genuinely change?"*

- **Substantive** (run the check): new or removed capability, field rename across
  surfaces, enum extension, consolidated or refactored concept already summarized in
  the doc, new deferral captured, security hardening, new tests reflecting new coverage.
- **Cosmetic** (skip the check): typos, formatting, link target corrections,
  doc-consistency-only fixes, comment-level clarifications.

Skip this step if every fix in this cycle was cosmetic. Otherwise run it once, just
before pushing — a two-minute scan. The completion doc doubles as the PR description;
stale metadata in the PR undermines the review it's meant to support.

### 3) Push Once Per Review Cycle

After all fixes from this review pass are committed, push:

```bash
git push origin {branch-name}
```

The review tool re-triggers on push, not commit — one push per cycle = one re-review pass
showing the delta. This is the core noise-reduction discipline; commit atomicity is
independent of it.

**Intermediate push needed?** When a safety backup, CI validation, or cross-machine handoff
requires pushing before the review cycle is complete, use the review tool's pause mechanism
if available (e.g., CodeRabbit's `@coderabbitai pause` — see [Tool-Specific
Notes](#tool-specific-notes)). Push, continue working, post resume when ready for
re-review. Default flow never needs this.

### 4) Post Replies and Resolve

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
**Action**: Fix silently, bundle into the relevant scope commit, resolve conversation without
reply.

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
- **Pause/resume for intermediate pushes**: Post `@coderabbitai pause` as a PR comment to
  suppress automatic re-review on subsequent pushes; post `@coderabbitai resume` when ready
  for re-review. Use when a safety backup, CI validation, or cross-machine handoff forces a
  push before the review cycle is complete. The default workflow (atomic commits locally,
  one push per cycle) doesn't need this — pause/resume is the escape hatch, not the norm.
- **Project-level noise reduction** (optional): `.coderabbit.yaml` at the repo root supports
  `auto_review.auto_pause_after_reviewed_commits: N` (auto-pauses after N commits) and
  `auto_review.ignore_title_keywords: [wip, draft]`. See CodeRabbit configuration docs.

### GitHub Copilot Reviews

- May require more explicit context in replies
- Adjust classification mapping to Copilot's severity levels

### Other Tools

- Adapt local review command and classification terminology
- Core workflow (evaluate → fix → atomic commits → single push → reply) applies regardless
  of tool; check for tool-specific pause/resume equivalents before relying on push batching alone

---

## Anti-Patterns

- Do not skip local review — Pass 1 catches the majority of issues
- Do not reply before pushing — replies reference a commit hash that must exist on origin
  for GitHub to link it
- Do not push before all review-pass findings are addressed — push triggers re-review;
  commits do not. Atomic commits + one push per cycle is the discipline. Pause/resume is
  an escape hatch for forced intermediate pushes, not a default
- Do not collapse atomic commits into a single mega-batch to "minimize commits" — that
  conflates commit count with push count. The tool doesn't care about commit count
- Do not reply to nitpicks — clutters PR conversation; silent fix and resolve
- Do not rush fixes without evaluating context — check for documented deferrals first
- Do not fix code scheduled for deletion — defer unless it affects current functionality

---

[arc-methods-rt]: ../../../../.arc/system/workflows/arc-methods.md#review-triage
[arc-ext-pre-merge-review]: ../../../../.arc/system/workflows/arc-extensions.md#pre-merge-review
[integrate-work-unit]: ../arc/work-unit-lifecycle/integrate-work-unit.md
