# Workflow: Integrate Planning Branch

**Audience:** Agent-executed — your agent follows this to PR and merge a completed planning branch.

Planning branches deliver planning artifacts (PRDs, task lists) and optionally archival of a prior work unit
to the base branch via PR. This is intentionally lighter than [integrate-work-unit][integrate-work-unit] —
no completion doc, no pre-merge review, no task verification — because planning branches carry artifacts,
not implementation.

**When to use:** Planning artifacts are committed on the planning branch and ready for review.

**What comes before:**

- Simple planning branch: [activate-planning-branch][activate-planning-branch] → [1_create-prd][create-prd]
  → [2_generate-tasks][generate-tasks]
- Batch branch (fully protected): activate-planning-branch → [archive-work-unit][archive-work-unit]
  → create-prd → generate-tasks

**What comes after:** [activate-work-unit][activate-work-unit] (from base branch, after merge)

## Mode Detection

Check [`arc-config.yml`][arc-config] → `pm.mode` to determine where planning artifacts live:

- **arc-in-git**: Artifacts are in `backlog/{category}/`. Activation moves them to `active/`.
- **none / external**: Artifacts are already in `active/{category}/` (saved there by `2_generate-tasks`).
  Activation skips the file move.

The workflow steps below apply in all modes — only the artifact paths differ.

## Scope Boundaries

Planning branches deliver artifacts to the base branch — nothing more. The boundary between "planning
delivered" and "implementation started" is the PR merge.

**Belongs on the planning branch:**

- Planning artifacts (PRD, task list, notes) in `backlog/{category}/` (arc-in-git) or
  `active/{category}/` (none/external)
- Archival of completed work unit (batch branches — via [archive-work-unit][archive-work-unit])
- Archival-triggered PM updates (ROADMAP marking completed WU, PROJECT-STATUS reflecting archival —
  via [post-work-unit-archive extensions][arc-ext-post-archive])
- Strategy or workflow improvements discovered during planning
- Quality gate fixes on files modified by the branch

**Does NOT belong on the planning branch:**

- Moving files from `backlog/` to `active/` (arc-in-git — [activate-work-unit][activate-work-unit]
  Step 3)
- Status file creation for the new work unit (activate-work-unit Step 5)
- Activation-triggered PM updates (ROADMAP marking new WU in-progress, PROJECT-STATUS reflecting new
  active work — activate-work-unit extensions)
- Implementation work of any kind

---

## Steps

### 1) Verify Readiness

- [ ] Planning artifacts committed (PRD and task list — see [Mode Detection](#mode-detection) for path)
- [ ] If batch: archival complete and committed ([archive-work-unit][archive-work-unit] steps 1–7)
- [ ] Quality gates pass on new/modified files
- [ ] Working tree is clean

### 2) Push and Create PR

```bash
git push -u origin {planning-branch}
gh pr create --base {base-branch} --head {planning-branch}
```

> **Platform:** Commands use GitHub CLI (`gh`). For other platforms, see QUICK-REFERENCE for
> equivalent tools and commands.

**PR description** — planning branches don't have completion docs, so the PR description stands alone:

- **Simple planning branch:** Summarize the planned work unit — name, category, scope overview.
  Reference the PRD for details.
- **Batch branch:** Summarize both transitions. Archival section: completed WU name, key outcomes.
  Planning section: new WU name, scope, phase/task count.

**Scope of the PR body:** Describe what this PR delivers, not what happens next. Workflow
continuity (post-merge activation, session boundaries, "next action after merge" style
sections) belongs in SESSION-NOTES, not the PR body. The reader is reviewing a change set —
keep the body scoped to what they need to evaluate it. See [DEV-RULES.ARC][dev-rules-arc]
§ Write for the reader.

### 3) Address Review Feedback

If reviewers raise concerns about scope, requirements, or task breakdown:

1. Fix on the planning branch, commit
2. Re-run quality gates on modified files after fixes

### 4) Merge and Clean Up

```bash
# Merge — use flag matching merge.strategy in arc-config.yml
gh pr merge {pr-number} --merge   # default; use --squash or --rebase per config

# Switch to base branch and pull merged changes
git switch {base-branch}
git pull origin {base-branch}

# Delete planning branch
git branch -d {planning-branch}
git push origin --delete {planning-branch}  # if not auto-deleted by platform
```

### 5) Transition to Activation

Planning artifacts are now on the base branch. When ready to begin implementation:

**→ [activate-work-unit.md](../activate-work-unit.md)** — creates the implementation branch, moves
artifacts from backlog to active (arc-in-git), updates tracking state.

Activation may happen immediately or in a later session. The artifacts are stable on the base branch.

**Session boundary:** If activation does not follow immediately in this session, run
[session-handoff][session-handoff] before ending. Capture in SESSION-NOTES that the planning branch
is merged and the work unit is ready for activation. The base branch has no status file for this WU
yet — `activate-work-unit.md` Step 5 creates it at activation time.

---

## Common Pitfalls

- **PM updates for the new WU on the planning branch** — Activation-triggered updates (ROADMAP marking
  new WU in-progress, PROJECT-STATUS updates) belong in [activate-work-unit][activate-work-unit], not
  here. Only archival-triggered updates (marking the completed WU) belong on batch branches.
- **Moving files from backlog to active** (arc-in-git) — That's
  [activate-work-unit][activate-work-unit] Step 3. Planning branches deliver to `backlog/`;
  activation moves to `active/`.
- **Skipping quality gates** — Planning artifacts are documentation — markdown linting still applies.
- **Forgetting branch cleanup** — Delete the planning branch after merge to keep branches tidy.

---

[activate-planning-branch]: activate-planning-branch.md
[integrate-work-unit]: ../integrate-work-unit.md
[activate-work-unit]: ../activate-work-unit.md
[archive-work-unit]: ../archive-work-unit.md
[create-prd]: ../../1_create-prd.md
[generate-tasks]: ../../2_generate-tasks.md
[arc-config]: ../../../../arc-config.yml
[arc-ext-post-archive]: ../../../arc-extensions.md#post-work-unit-archive
[session-handoff]: ../../session-lifecycle/session-handoff.md
[dev-rules-arc]: ../../../../../reference/constitution/DEV-RULES.ARC.md
