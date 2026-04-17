# Workflow: Integrate Work Unit

**Audience:** Agent-executed — your agent follows this to prepare completed work for integration.

After all tasks are marked complete and verification passes, this workflow prepares the work for integration:
documentation cleanup, completion metadata, code review, and merge. The work unit's branch becomes a clean,
reviewable deliverable.

**When to use:** All tasks in the task list are marked `[x]` and the verification phase has passed.

**What comes after:** Once merged, run [archive-work-unit][archive-work-unit] to move files to the archive and
delete the per-WU status file.

**Multi-branch work units** follow three operations across their lifecycle:

1. **Rotate** — Intermediate merge. A branch's scope is done but the task list has remaining work.
   Merge the branch, set up the next one, continue working. No completion doc, no archival.
   See [rotate-branch][rotate-branch] workflow.
2. **Integrate** — This workflow. All tasks complete. Prepare docs, review, PR, merge.
3. **Archive** — Post-merge. Move files to archive, delete the status file. See
   [archive-work-unit][archive-work-unit].

Rotation may happen multiple times during a work unit; integration and archival each happen exactly once at the
end. The per-WU status file travels with the task list across rotations via normal merge flow — no
mid-lifecycle resets or absorbs.

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
- [ ] Task list Success Criteria all checked (expected — verification phase should have validated these)
- [ ] PRD alignment (if PRD exists — planned work only):
    - [ ] Confirm success criteria against PRD — second pass after verification phase. Note any
      deviations or criteria met differently than originally planned
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

### 1c) Evaluate Supplementary Files (If Any Exist)

Check for standalone supplementary files in the work unit directory — `analysis-*`, `research-*`,
or similar reference documents created during work.

**If none exist:** Skip to Step 2.

**If found, evaluate each for lasting reference value:**

- **Keep** — Contains archival-worthy analysis, research synthesis, or design exploration with
  future reference value beyond this work unit → include in Step 4 commit. During archival,
  [archive-work-unit](archive-work-unit.md) Step 3 routes these to `.arc/reference/analysis/` or
  `.arc/reference/research/` as appropriate.
- **Delete** — Scratchpad content, superseded analysis, or content already absorbed into task
  file, notes, ADRs, or strategy documents → delete before committing.

**Rule of thumb:** Same as notes files — "Would I reference this 6 months from now, and is it not
already captured elsewhere?" These files don't need cleaning (they're reference-ready by nature),
just a keep/delete decision.

### 2) Clean Up Documentation (MANDATORY)

**Run [clean-work-unit.md](clean-work-unit.md) workflow in Mode 2 (Archival Preparation).**

This produces: clean task file (temporal markers removed, detailed granularity preserved), notes file
evaluated for archival worthiness (kept and cleaned, or deleted if scratchpad), cross-references updated,
and the status file `**State:**` field set to `Complete`.

**Verify before proceeding:** Confirm the status file `**State:**` now reads `Complete`.

### 3) Create Completion Metadata

Create `completion-{name}.md` in the same directory as the task list. Follow the templates and
guidance in [template-completion-doc.md][template-completion-doc] — choose standard or lightweight
based on work complexity. Complete the verification checklist (standard template) before proceeding.

### 4) Commit Documentation Changes

Commit all documentation updates to the child branch. Stage the entire work unit directory —
this captures all modified, added, and deleted files without requiring explicit enumeration.

```bash
git add .arc/active/{category}/
```

**What this stages:** Task list, notes, completion doc, PRD (if planned work), atomic companion
file, and any supplementary files (analysis, research) kept in Step 1c. Unmodified files are
no-ops.

**Atomic companion file:** If `atomic-{name}.md` contains no checkbox items (no `- [` lines),
delete it before staging — an empty companion file has no archival value. If it contains
completed or deferred items, the directory-level add includes it for archival alongside the
task list.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Documentation prep commits use type/scope `docs(arc)` or `docs({category})` with the `(integration)`
context footer pattern — e.g., `Context: tasks-{name}.md (integration)`. Review-fix commits during
integration use the `(code review)` footer instead — see `arc-methods.md` § commit-context-format.

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
3. Commit any fixes with the `(code review)` context footer

When disabled, proceed directly to push and PR creation.

### 6b) Completion Metadata Freshness Check

**Skip if** no commits were made during Phase 2 (steps 5–6). If review-driven fixes, refactoring,
or additional tests were committed during Phase 2, verify `completion-{name}.md` still reflects the
delivered state:

- **Verification section**: Quality gate status and claims still accurate?
- **Implementation Highlights**: Do review fixes add noteworthy technical content? (security
  hardening, extracted helpers, new patterns)
- **Key Deliverables**: Do new tests or capabilities change the deliverable summary?
- **Follow-Up Work**: Were new deferrals captured during review?

Update and commit with the `(integration)` context footer. The completion doc doubles as the PR
description — stale metadata in the PR undermines the review it's meant to support.

### 6c) Update Status File

Update the per-WU status file (`.arc/active/{category}/status-{name}.md`) so `**Next Action:**` reflects the
current integration step (e.g., "integrate-work-unit Step 7 — push and create PR"). Stage and commit with the
`(integration)` context footer — bundle with the Step 6b commit if one is being made, or commit standalone if
no other Phase 2 changes exist. This ensures the status file is committed before the PR is created — a
standalone status-file commit after push resets automated PR reviews.

### 7) Push and Create PR

```bash
git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}
```

Use `completion-{name}.md` as PR description template — copy/adapt sections for the PR body.
When adapting, do not add new sections describing post-merge workflow continuity or next
actions — those belong in the status file and SESSION-NOTES, not the PR body. The reader is
reviewing a change set. See [DEV-RULES.ARC][dev-rules-arc] § Write for the reader.

**After the PR is created:** Update the completion doc's `**Pull Request:**` field with the PR URL
returned by `gh pr create`. Commit alongside any Step 8 review-driven fixes, or standalone if
none (with `(integration)` context footer).

### 8) Address PR Review Findings

Process findings from PR reviewers (human or automated) using the
[review-triage method][arc-methods-rt]. For each finding, classify and act:

- **Fix/silent-fix**: Update code, batch into a single commit when possible
- **Defer/reject**: Document reason in PR reply
- **Update completion metadata** if work outcomes changed (completion doc should reflect final state)
- **Re-run Tier 1 quality gates** on all modified files — mandatory after review-driven commits
- Commit fixes with the `(code review)` context footer

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

**State value:** `Superseded (partial)` on the status file (see [`template-status.md`][template-status] State enum).

**Required elements:**

1. **Status file** (during life — deleted at archive):

   ```markdown
   **State:** Superseded (partial)
   **Superseded By:** `tasks-{new-approach}.md` (YYYY-MM-DD)
   ```

   `Superseded By:` is an optional status-file field documented in [`template-status.md`][template-status].

2. **Completion doc** (archival record):

   ```markdown
   **Superseded By:** `tasks-{new-approach}.md` (YYYY-MM-DD)
   ```

   Also document in the body what was completed vs superseded — the completion doc is the archival
   entry point, so this narrative needs to stand alone without the status file.

3. **Supersession rationale** (in the task list body): Brief explanation of what triggered the change and
   what remains valid vs obsolete.

4. **Decision point marker** (in the task list body): Insert before first superseded task:

   ```markdown
   ---

   **⚠️ Supersession Point (YYYY-MM-DD):** Tasks X.Y onwards superseded by [reason].
   See `tasks-{new-approach}.md` for continuation. Earlier phases (1-X.Z) remain valid -
   [brief explanation of what's reused].

   ---
   ```

5. **Mark superseded tasks with `[~]`:** Clearly indicates tasks weren't abandoned without thought:

   ```markdown
   - [~] **4.1 Task description** *(superseded by infinite scroll)*
   ```

   The `[~]` marker means "intentionally not done" — distinct from `[ ]` (pending) and `[x]`
   (complete). Same convention used in [success criteria][task-list-formatting] for superseded
   criteria.

**Key principle:** The `[~]` marker + decision point note creates a clear audit trail showing intentional
architectural pivot, not abandoned work. Header metadata (State, Superseded By) lives in the status file
and completion doc — not on the task list header.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-methods]: ../../arc-methods.md
[arc-methods-rt]: ../../arc-methods.md#review-triage
[arc-methods-pmr]: ../../arc-methods.md#pre-merge-review
[arc-ext-pre-merge-review]: ../../arc-extensions.md#pre-merge-review
[arc-config]: ../../../arc-config.yml
[template-completion-doc]: ../../../../reference/templates/template-completion-doc.md
[template-status]: ../../../../reference/templates/template-status.md
[rotate-branch]: rotate-branch.md
[activate-planning-branch]: planning/activate-planning-branch.md
[archive-work-unit]: archive-work-unit.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
