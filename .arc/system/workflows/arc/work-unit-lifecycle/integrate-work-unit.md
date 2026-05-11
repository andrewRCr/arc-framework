---
purpose: Prepare completed work for integration — docs cleanup, completion metadata, code review, and merge.
audience: agent
arc:
  methods:
    - diff-review
    - review-triage
  extensions:
    - pre-merge-review
---

# Workflow: Integrate Work Unit

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
end.

See [Work Organization Strategy][work-org] for the complete task list and branch relationship model.

## Workflow Overview

**All work follows the same integration workflow**, regardless of category (feature/technical/incidental):

1. **Phase 1: On Child Branch** — Clean docs, create completion metadata, commit
2. **Phase 2: Code Review & Merge** — Review, PR, merge to parent

**Key principle:** Documentation cleanup and completion metadata are part of the child branch deliverable,
not a post-merge activity. This ensures PR reviewers see clean, well-organized docs.

---

## Phase 1: On Child Branch (Before PR)

**Context:** You're on the child branch where work was completed (e.g., `incidental/fix-auth-edge-cases`).

**On workflow entry:** if the active status file's `**Next Action:**` doesn't already point at this workflow,
update it to `integrate-work-unit Step 1 — verify completion` before proceeding. This keeps the integration-
signal convention consistent across handoffs that fall between verification and Step 6c (per
[session-handoff][session-handoff] § _Workflow step pointer_; consumed by session-init `sessionType` inference).

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
based on work complexity.

**Before drafting, gather:**

- Task list overview (first ~100 lines) — Scope, context, what was planned
- Final phase(s) of task list — actual completion state, follow-up work status
- CLEANUP-PROGRESS data (for large files) — metrics collected during cleanup
- Git log for the final commit hash: `git log -1 --oneline`
- Activation commit for the `**Started:**` date:
  `git log --diff-filter=A -- .arc/active/{category}/status-{name}.md` (the commit that
  created the status file is the activation event; use its date)

**After drafting (standard template only), verify every claim:**

- [ ] _Started / Completed dates:_ Started = activation commit date; Completed = integration
      prep date

- [ ] _Pull Request URL:_ field remains `{pending until archival}` — archive fills the durable link after merge

- [ ] _Phase count:_ matches actual phases in task file — `grep -c "^## \*\*Phase" tasks-{name}.md`

- [ ] _Quantitative claims:_ each number verified in task file (note where verified —
      e.g., "7 themes" → Phase X, line Y). Avoid file/test counts in Verification — pre-merge
      review routinely shifts those numbers, leaving the doc stale at archive time.

- [ ] _Follow-up work:_ reflects FINAL phase state; only list items ACTUALLY still deferred
      at task end

- [ ] _No stale references:_ no mentions of deleted notes files, completed deferred items, etc.

- [ ] _All major phases represented:_ check CLEANUP-PROGRESS data includes all phases

Lightweight template: verify the summary against the task list by inspection (no structured
checklist).

### 4) Commit Documentation Changes

Commit all documentation updates to the child branch. Stage the work unit's files by the
`*-{name}.md` name-suffix glob — this scopes to the current WU (category directories can hold
multiple WUs in parallel or across overlapping lifecycles) and captures all modified, added,
and deleted files for this WU in one pattern.

```bash
git add .arc/active/{category}/*-{name}.md
```

**What this stages:** Task list, notes, completion doc, PRD (if planned work), status file,
and atomic companion file — all follow the `*-{name}.md` convention. Unmodified files are
no-ops.

**Supplementary files:** If analysis/research files were kept in Step 1c and their filenames
don't include `{name}` (free-form-named, e.g., `analysis-reviewer-response.md`), add them
explicitly alongside the glob:

```bash
git add .arc/active/{category}/*-{name}.md \
       .arc/active/{category}/analysis-{topic}.md
```

**Atomic companion file:** If `atomic-{name}.md` contains no checkbox items (no `- [` lines),
delete it before staging — an empty companion file has no archival value. If it contains
completed or deferred items, the directory-level add includes it for archival alongside the
task list.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Documentation prep commits use type/scope `docs(arc)` or `docs({category})` with the `(integration)`
context footer pattern — e.g., `Context: status-{name}.md (integration)`. Review-fix commits during
integration use the `(code review)` footer on `tasks-{name}.md` or `plan-{name}.md` instead — see the
[commit-context-format method][arc-methods-ccf].

> [!IMPORTANT]
> `workflow-interlock`: Stop after integration-prep documentation is committed. Surface Phase 1
> completion and await direction before proceeding to pre-merge review and PR creation.

---

## Phase 2: Code Review & Merge

**Context:** Still on child branch, docs are clean and committed. **PR is not created yet.**

**Status file discipline:** Once `clean-work-unit.md` Mode 2 has written
`**State:** Complete`, the status file is stable through the review and merge window. Update
it only for phase-boundary events (Step 6c below; substantive deliverable change driven by
review, rare; archival). Cycle-level review context — findings in flight, drafted replies,
pass numbers — belongs in SESSION-NOTES and the PR itself, not in the status file.

### 5) Pre-Merge Inbox Review

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

1. Execute the [diff-review method][arc-methods-diff-review] — review the aggregate diff, classify
   findings using the [review-triage method][arc-methods-rt] (fix-now/defer/reject/silent-fix)
2. If `pre-merge-review` appears in the active-extensions list (established at session init), load and
   execute its [`.actions`][arc-ext-pre-merge-review]. Otherwise, skip this sub-step.
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

Update and commit with the `(integration)` context footer — the completion doc doubles as the
PR description.

### 6c) Update Status File

Update the per-WU status file (`.arc/active/{category}/status-{name}.md`) so `**Next Action:**` reflects the
next judgment-bearing integration step: `integrate-work-unit Step 8 — address PR review findings`.

This intentionally pre-advances over Step 7. Step 7 is safe to bridge without an intermediate metadata commit
because it meets three criteria:

- **Mechanical** — push and PR creation require no workflow judgment after Step 6c.
- **Idempotent or absence-detectable** — `gh pr create` errors if the PR already exists; `gh pr list`
  confirms whether PR creation happened after a crash.
- **Low redo cost** — re-running Step 7 after a false-negative absence check is cheap.

**Crash recovery:** If a session resumes with `**Next Action:**` already pointing at Step 8, verify whether the
PR exists before starting review work:

```bash
gh pr list --head {branch-name} --base {parent-branch}
```

If no PR exists, run Step 7 first. If the PR exists, continue to Step 8.

Commit shape follows [DEV-RULES.ARC][dev-rules-arc] § Status-file commit shape: bundle with the Step 6b commit
when one is being made (parent `docs(arc):` type, `(integration)` context footer); standalone otherwise
(`chore(status):` type, same footer). Status must be committed before the PR is created — a status-file commit
after push resets automated PR reviews.

**Handoff guidance:** Prefer handoff here, before PR creation, or after continuing into Step 8 review work. Avoid
handoff in the awkward window between `gh pr create` and the reviewer's first pass: the handoff commit itself
would re-trigger automated review, and the first review response commonly produces another commit immediately
afterward.

### 7) Push and Create PR

> [!IMPORTANT]
> `workflow-interlock`: Stop before creating the PR. Surface PR title/body readiness, branch state,
> and review plan; await direction before pushing or opening the PR.

Push the branch upstream (`workflowPush`): `-u origin {branch-name}`. Then create the PR:

```bash
gh pr create --base {parent-branch} --head {branch-name}
```

**PR title:** follow [template-pull-request § PR Title Format][template-pull-request].
Implementation PRs use no bracket prefix — Conventional Commits type carries the signal.

**PR body:** load [template-pull-request.md][template-pull-request] before drafting — the
template defines the canonical body shape (Spec / Summary / Changes / optional Test Plan /
Out of Scope / Follow-Up Work) and its anti-patterns. The completion doc is the content
source (what landed); the template is the body structure — they carry different audiences
(archive-reader vs. reviewer) and don't share a section layout. Map completion-doc material
into the template's shape rather than transcribing sections verbatim.

Do not add sections describing post-merge workflow continuity or next actions — those belong
in the status file and SESSION-NOTES, not the PR body. See [DEV-RULES.ARC][dev-rules-arc]
§ Write for the reader.

Leave the completion doc's `**Pull Request:**` field as `{pending until archival}`. The PR URL is active
context during review, and [archive-work-unit][archive-work-unit] fills the durable archive link after merge.

### 8) Address PR Review Findings

Process findings from PR reviewers (human or automated) using the
[review-triage method][arc-methods-rt]. For each finding, classify and act:

- **Fix/silent-fix**: Update code, batch into a single commit when possible
- **Defer/reject**: Document reason in PR reply
- **Update completion metadata** if work outcomes changed (completion doc should reflect final state)
- **Re-run Tier 1 quality gates** on all modified files — mandatory after review-driven commits
- Commit fixes with the `(code review)` context footer

### 9) Merge Pull Request

> [!IMPORTANT]
> `integration-interlock`: Stop before merging. Surface PR review status, checks, unresolved
> threads, and merge method; await explicit integration approval before merging.

```bash
# Via GitHub CLI — use flag matching merge.strategy in arc-config.yml
gh pr merge {pr-number} --merge   # default; use --squash or --rebase per config

# Or locally
git checkout parent-branch
git merge child-branch --no-ff
```

Then push (`workflowPush`) the merged result: `origin {parent-branch}`.

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

**State value:** `Superseded (partial)` on the status file (see [Work Unit State][work-org-state] for the enum).

**Required elements:**

1. **Status file** (during life — deleted at archive):

   ```markdown
   **State:** Superseded (partial)
   **Superseded By:** `tasks-{new-approach}.md` (YYYY-MM-DD)
   ```

   `Superseded By:` is an optional status-file field documented in [Work Unit State][work-org-state].

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

   Same `[~]` convention used in [success criteria][task-list-formatting] for superseded criteria.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[arc-methods-rt]: ../../../methods/review-triage.md
[arc-methods-diff-review]: ../../../methods/diff-review.md
[arc-methods-ccf]: ../../../methods/commit-context-format.md
[arc-ext-pre-merge-review]: ../../../extensions/pre-merge-review.md
[arc-config]: ../../../arc-config.yml
[template-completion-doc]: ../../../../reference/templates/template-completion-doc.md
[work-org-state]: ../../../../reference/strategies/arc/strategy-work-organization.md#work-unit-state
[rotate-branch]: rotate-branch.md
[activate-planning-branch]: planning/activate-planning-branch.md
[archive-work-unit]: archive-work-unit.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[session-handoff]: ../session-lifecycle/session-handoff.md
[template-pull-request]: ../../../../reference/templates/template-pull-request.md
