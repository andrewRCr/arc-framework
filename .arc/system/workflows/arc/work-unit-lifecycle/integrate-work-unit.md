# Workflow: Integrate Work Unit

**Audience:** Agent-executed — your agent follows this to prepare completed work for integration.

After all tasks are marked complete and verification passes, this workflow prepares the work for integration:
documentation cleanup, completion metadata, code review, and merge. The work unit's branch becomes a clean,
reviewable deliverable.

**When to use:** All tasks in the task list are marked `[x]` and the verification phase has passed.

**What comes after:** Once merged, run [archive-work-unit][archive-work-unit] to move files to the archive
and reset tracking state.

**Multi-branch work units** follow three operations across their lifecycle:

1. **Rotate** — Intermediate merge. A branch's scope is done but the task list has remaining work.
   Merge the branch, set up the next one, continue working. No completion doc, no archival.
   See [rotate-branch][rotate-branch] workflow.
2. **Integrate** — This workflow. All tasks complete. Prepare docs, review, PR, merge.
3. **Archive** — Post-merge. Move files to archive, update tracking. See
   [archive-work-unit][archive-work-unit].

Rotation may happen multiple times during a work unit; integration and archival each happen exactly once
at the end.

See [Work Organization Strategy][work-org] for the complete task list and branch relationship model.

**Method dependencies (load on first reference):** This workflow references two arc-methods. When first
encountered, load the relevant section of [`arc-methods.md`][arc-methods] — check `.override` first; use
`.default` if no override is configured.

- [pre-merge-review][arc-methods-pmr] — aggregate diff review before push
- [review-triage][arc-methods-rt] — classifying and acting on review findings

## Workflow Overview

**All work follows the same integration workflow**, regardless of category (feature/technical/incidental):

1. **Phase 1: On Child Branch** — Clean docs, create completion metadata, commit
2. **Phase 2: Code Review & Merge** — Review, PR, merge to parent

**Key principle:** Documentation cleanup and completion metadata are part of the child branch deliverable,
not a post-merge activity. This ensures PR reviewers see clean, well-organized docs.

---

## Phase 1: On Child Branch (Before PR)

**Context:** You're on the child branch where work was completed (e.g., `incidental/fix-auth-edge-cases`).

### 1) Verify Work Completion

- [ ] All task list subtasks and parent tasks marked `[x]`
- [ ] Task list header `**Status:**` updated to `Complete`
- [ ] Task list Success Criteria all checked (expected — verification phase should have validated these)
- [ ] PRD alignment (if PRD exists — planned work only):
    - [ ] Confirm success criteria against PRD — second pass after verification phase. Note any
      deviations or criteria met differently than originally planned
    - [ ] PRD header `**Status:**` updated to `Complete`
    - [ ] PRD Open Questions resolved with brief notes on decisions made
- [ ] All quality gates passed (documented as completed subtasks in task list)
- [ ] Implementation verified in development environment (if applicable — documentation-only work may not need this)

### 1b) Generated Code Sync Check (If Applicable)

**If your project has generated code** (API types, schema files, etc.), verify they're in sync before proceeding:

```bash
# Check if source files changed that would require regeneration
git diff {{BASE_BRANCH}} --name-only | grep -E "{{GENERATED_CODE_SOURCE_PATTERN}}"

# If any matches, regenerate (project-specific command)
{{TYPE_GENERATION_COMMAND}}

# Check for uncommitted changes
git diff --exit-code {{GENERATED_FILES_PATTERN}}
```

**If diff shows changes:** Commit them before proceeding. CI may fail if generated files drift from source.

### 2) Clean Up Documentation (MANDATORY)

**Run [clean-work-unit.md](clean-work-unit.md) workflow in Mode 2 (Archival Preparation).**

This produces: clean task file (temporal markers removed, detailed granularity preserved), notes file
evaluated for archival worthiness (kept and cleaned, or deleted if scratchpad), cross-references updated.

### 3) Create Completion Metadata

Create `completion-{name}.md` in the same directory as the task list. Follow the templates and
guidance in [template-completion-doc.md][template-completion-doc] — choose standard or lightweight
based on work complexity. Complete the verification checklist (standard template) before proceeding.

### 4) Commit Documentation Changes

Commit all documentation updates to the child branch.

```bash
git add .arc/active/{category}/tasks-{name}.md
git add .arc/active/{category}/notes-{name}.md   # if exists
git add .arc/active/{category}/atomic-{name}.md  # if populated (delete if empty — see below)
git add .arc/active/{category}/completion-{name}.md
git add .arc/active/{category}/prd-{name}.md     # if planned work with PRD updates
```

**Atomic companion file:** If `atomic-{name}.md` contains no checkbox items (no `- [` lines),
delete it rather than archiving — an empty companion file has no archival value. If it contains
completed or deferred items, include it in the commit for archival alongside the task list.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Documentation prep commits use type/scope `docs(arc)` or `docs({category})` with the `(integration)`
context footer pattern — e.g., `Context: tasks-{name}.md (integration)`. Review-fix commits during
integration use the same pattern.

**⛔ CHECKPOINT:** Phase 1 complete. Proceed to Phase 2 for code review before creating the PR.

---

## Phase 2: Code Review & Merge

**Context:** Still on child branch, docs are clean and committed. **PR is not created yet.**

### 5) Pre-Merge Inbox Review · `#pre-merge-inbox-review`

**arc-in-git mode only** (`pm.mode: arc-in-git`). Skip if inbox is empty or PM mode is `none`/`external`.

Before pushing, triage any items in `user/{identity}/ATOMIC-INBOX.md`. This ensures captured
items are processed before the work unit closes, rather than accumulating indefinitely.

**Triage actions per item:**

- **Keep** — still relevant, still yours → leave in inbox
- **Do now** — small enough to complete before integration → execute, commit, remove from inbox
- **Promote** — bigger than expected or shared concern → move to appropriate `BACKLOG-*.md`
- **Redirect** (team) — another domain or team member's area → promote to backlog with context note
- **Drop** — stale or no longer relevant → remove

Promoted items are committed on the work unit branch (included in the PR). Cross-member
transfer routes through backlog, not into another person's inbox.

### 6) Pre-Merge Review · `#pre-merge-review`

If `review.pre_merge` is enabled (default) in [`arc-config.yml`][arc-config]:

1. Execute the [pre-merge-review method][arc-methods-pmr] — review the aggregate diff, classify
   findings using the [review-triage method][arc-methods-rt] (fix/defer/reject/silent-fix)
2. If [pre-merge-review extensions][arc-ext-pre-merge-review] are configured, execute them
3. Commit any fixes with the `(integration)` context footer

When disabled, proceed directly to push and PR creation.

### 7) Push and Create PR

```bash
git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}
```

Use `completion-{name}.md` as PR description template — copy/adapt sections for the PR body.

### 8) Address PR Review Findings

Process findings from PR reviewers (human or automated) using the
[review-triage method][arc-methods-rt]. For each finding, classify and act:

- **Fix/silent-fix**: Update code, batch into a single commit when possible
- **Defer/reject**: Document reason in PR reply
- **Update completion metadata** if work outcomes changed (completion doc should reflect final state)
- **Re-run Tier 1 quality gates** on all modified files — mandatory after review-driven commits
- Commit fixes with the `(integration)` context footer

### 9) Merge Pull Request

```bash
# Via GitHub CLI — use flag matching merge.strategy in arc-config.yml
gh pr merge {pr-number} --merge   # default; use --squash or --rebase per config

# Or locally
git checkout parent-branch
git merge child-branch --no-ff
git push
```

If merged via PR, switch to the parent branch and pull before proceeding:

```bash
git switch {parent-branch}
git pull origin {parent-branch}
```

**After merge:** Proceed to [archive-work-unit][archive-work-unit] for post-merge archival.

> **Full protection (`branch.protection: full`):** Archival commits can't go directly to the base
> branch. Choose based on what comes next:
>
> - **Next work unit planned** (typical): Run
>   [activate-planning-branch][activate-planning-branch] to set up a batch branch, then archive
>   and plan on the same branch. One PR covers both lifecycle transitions.
> - **No next work unit imminent**: Create a short-lived housekeeping branch
>   (`chore/archive-{name}`) for archival alone — see
>   [archive-work-unit][archive-work-unit] header note for the standalone pattern.

---

## Common Pitfalls

- Skip doc hygiene → Run [clean-work-unit.md](clean-work-unit.md) Mode 2 first
- Skip completion doc → ALL work gets `completion-{name}.md` (lightweight or standard)
- Skip local review → Findings after push require additional commits on the PR
- Push before Phase 1 commit → PR diff includes uncommitted doc cleanup

---

## Appendix

### Handling Partially Superseded Work

**When to use:** Work where significant progress was made before an architectural decision changed direction.
Earlier phases remain valid (will be used by new approach), but later phases are obsolete.

**Status field:** `**Status:** Superseded (partial)`

**Required elements:**

1. **Header metadata:**

   ```markdown
   **Completed:** YYYY-MM-DD
   **Status:** Superseded (partial)
   **Superseded By:** `tasks-{new-approach}.md` (YYYY-MM-DD)
   ```

2. **Supersession rationale:** Brief explanation of what triggered the change and what remains valid vs obsolete.

3. **Decision point marker:** Insert before first superseded task:

   ```markdown
   ---

   **⚠️ Supersession Point (YYYY-MM-DD):** Tasks X.Y onwards superseded by [reason].
   See `tasks-{new-approach}.md` for continuation. Earlier phases (1-X.Z) remain valid -
   [brief explanation of what's reused].

   ---
   ```

4. **Mark superseded tasks with `[~]`:** Clearly indicates tasks weren't abandoned without thought:

   ```markdown
   - [~] **4.1 Task description** *(superseded by infinite scroll)*
   ```

   The `[~]` marker means "intentionally not done" — distinct from `[ ]` (pending) and `[x]`
   (complete). Same convention used in [success criteria][task-list-formatting] for superseded
   criteria.

5. **Completion doc:** Include `**Status:** Superseded (partial)` and document what was completed vs superseded.

**Key principle:** The `[~]` marker + decision point note creates clear audit trail showing intentional
architectural pivot, not abandoned work.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-methods]: ../../arc-methods.md
[arc-methods-rt]: ../../arc-methods.md#review-triage
[arc-methods-pmr]: ../../arc-methods.md#pre-merge-review
[arc-ext-pre-merge-review]: ../../arc-extensions.md#pre-merge-review
[arc-config]: ../../../arc-config.yml
[template-completion-doc]: ../../../../reference/templates/template-completion-doc.md
[rotate-branch]: rotate-branch.md
[activate-planning-branch]: planning/activate-planning-branch.md
[archive-work-unit]: archive-work-unit.md
