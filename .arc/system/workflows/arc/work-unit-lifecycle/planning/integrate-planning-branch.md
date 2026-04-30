---
purpose: PR and merge a planning branch — lighter than work-unit integration (no completion doc, no pre-merge review).
audience: agent
---

# Workflow: Integrate Planning Branch

Planning branches deliver planning artifacts (PRDs, task lists) and optionally archival of a prior work unit
to the base branch via PR. Lighter than [integrate-work-unit][integrate-work-unit] — no completion doc,
no pre-merge review, no task verification.

**When to use:** Planning artifacts are committed on the planning branch and ready for review.

**What comes before:**

- Simple planning branch: [activate-planning-branch][activate-planning-branch] → [1_create-prd][create-prd]
  → [2_generate-tasks][generate-tasks]
- Batch branch (fully protected): activate-planning-branch → [archive-work-unit][archive-work-unit]
  → create-prd → generate-tasks

**What comes after:** Graduated → [activate-work-unit][activate-work-unit] (from base branch, after merge).
Shelved → planning ends here; no activation.

## Mode Detection

Check [`arc-config.yml`][arc-config] → `pm.mode` to determine where planning artifacts live:

- **arc-in-git**: PRD and task list are in `backlog/{category}/`; plan-doc and status file are in
  `active/{category}/` (plan-doc moved at planning activation by `activate-planning-branch` Step 4).
  WU activation moves PRD and task list to `active/`.
- **none / external**: All artifacts are already in `active/{category}/` (saved there by `2_generate-tasks`).
  Activation skips the file move.

The workflow steps below apply in all modes — only the artifact paths differ.

## Scope Boundaries

Planning branches deliver artifacts to the base branch — nothing more. The boundary between "planning
delivered" and "implementation started" is the PR merge.

**Belongs on the planning branch:**

- Planning artifacts: PRD and task list in `backlog/{category}/` (arc-in-git) or `active/{category}/`
  (none / external); plan-doc in `active/{category}/` (after planning activation in arc-in-git mode)
- Status file (`active/{category}/status-{name}.md`) — created at planning activation by
  [`activate-planning-branch`][activate-planning-branch] Step 5
- Plan-doc and status-file disposition at integration (graduated / shelved — see Step 2)
- Archival of completed work unit (batch branches — via [archive-work-unit][archive-work-unit])
- Archival-triggered PM updates (ROADMAP marking completed WU, PROJECT-STATUS reflecting archival —
  via [post-work-unit-archive extensions][arc-ext-post-archive])
- Strategy or workflow improvements discovered during planning
- Quality gate fixes on files modified by the branch

**Does NOT belong on the planning branch:**

- Moving PRD and task list from `backlog/` to `active/` (arc-in-git — [activate-work-unit][activate-work-unit]
  Step 3)
- Status file transition `Planning → In Progress` (activate-work-unit Step 4)
- Activation-triggered PM updates (ROADMAP marking new WU in-progress, PROJECT-STATUS reflecting new
  active work — activate-work-unit extensions)
- Implementation work of any kind

---

## Steps

### 1) Verify Readiness

- [ ] Planning work committed: PRD and task list (graduated path) or plan-doc evolution (shelved path)
- [ ] If batch: archival complete and committed ([archive-work-unit][archive-work-unit] steps 1–7)
- [ ] Quality gates pass on new/modified files
- [ ] Working tree is clean

### 2) Apply Disposition

Choose the disposition path based on planning outcome and apply it on the planning branch — the
disposition lands on the base branch via merge.

#### Graduated path · planning yielded PRD + task list ready for activation

- **Plan-doc** (arc-in-git only): `git rm .arc/active/{category}/plan-{name}.md` — the PRD is now the
  canonical Spec. Skip in `none / external` modes (plan-doc co-located with PRD; no rotation needed).
- **Status file**: leave in place. Downstream [`activate-work-unit.md`][activate-work-unit] Step 4
  transition path handles `State: Planning → In Progress` and the field deltas.

```bash
# arc-in-git only
git rm .arc/active/{category}/plan-{name}.md
git commit -m "docs(arc): graduate plan-{name} to PRD

Context: tasks-{name}.md (planning)"
```

#### Shelved path · planning did not graduate

- **Plan-doc**:
    - **arc-in-git**: `git mv .arc/active/{category}/plan-{name}.md .arc/backlog/{category}/` —
      return for future incubation.
    - **none / external**: leave in place (no backlog directory exists; plan-doc remains in
      `active/{category}/` for follow-up).
- **Status file**: `git rm .arc/active/{category}/status-{name}.md` — no WU follows; the
  planning-state pointer serves no purpose.

```bash
# arc-in-git: paired commits — status removal as a dedicated chore(status):, plan-doc move as a
# separate ceremony commit (per DEV-RULES.ARC § Commit Discipline status-file commit shape)
git rm .arc/active/{category}/status-{name}.md
git commit -m "chore(status): retire shelved {name}

Context: planning (no associated task list)"

git mv .arc/active/{category}/plan-{name}.md .arc/backlog/{category}/
git commit -m "docs(arc): shelve plan-{name} back to backlog

Context: planning (no associated task list)"
```

### 3) Push and Create PR

```bash
git push -u origin {planning-branch}
gh pr create --base {base-branch} --head {planning-branch}
```

> **Platform:** Commands use GitHub CLI (`gh`). For other platforms, see QUICK-REFERENCE
> § Platform Commands for equivalent tools and commands.

**PR title:** prefix `[PLAN]` per [template-pull-request § PR Title Format][template-pull-request].

**PR description** — Use [template-pull-request § Planning PR Variant][template-pull-request] for
body structure (covers simple and batch shapes). Planning branches don't have completion docs, so
the PR description stands alone.

**PR body scope:** Describe what the PR delivers, not post-merge workflow continuity (see
[DEV-RULES.ARC][dev-rules-arc] § Write for the reader).

### 4) Address Review Feedback

If reviewers raise concerns about scope, requirements, or task breakdown:

1. Fix on the planning branch, commit
2. Re-run quality gates on modified files after fixes

### 5) Merge and Clean Up

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

### 6) Transition to Activation · graduated path only

> **Skip this step** if Step 2's disposition was shelved — there is no activation.

Planning artifacts are now on the base branch. When ready to begin implementation:

**→ [activate-work-unit.md](../activate-work-unit.md)** — creates the implementation branch, moves
PRD and task list from backlog to active (arc-in-git), transitions the existing status file from
`Planning` to `In Progress`.

Activation may happen immediately or in a later session. The artifacts are stable on the base branch.

**Session boundary:** If activation does not follow immediately in this session, run
[session-handoff][session-handoff] before ending. Capture in SESSION-NOTES that the planning branch
is merged and the work unit is ready for activation. The status file is on the base branch in
`State: Planning`; [`activate-work-unit.md`][activate-work-unit] Step 4 transitions it at activation time.

---

[activate-planning-branch]: activate-planning-branch.md
[integrate-work-unit]: ../integrate-work-unit.md
[activate-work-unit]: ../activate-work-unit.md
[archive-work-unit]: ../archive-work-unit.md
[create-prd]: ../../1_create-prd.md
[generate-tasks]: ../../2_generate-tasks.md
[arc-config]: ../../../../arc-config.yml
[arc-ext-post-archive]: ../../../../extensions/post-work-unit-archive.md
[session-handoff]: ../../session-lifecycle/session-handoff.md
[dev-rules-arc]: ../../../../../reference/constitution/DEV-RULES.ARC.md
[template-pull-request]: ../../../../../reference/templates/template-pull-request.md
