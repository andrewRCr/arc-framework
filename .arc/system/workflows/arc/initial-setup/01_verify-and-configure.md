# Workflow: Verify and Configure ARC

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Verify that `arc init` completed successfully and walk through project
configuration. This workflow runs once after init — for ongoing health checks, use
`/arc-verify` instead.

**When to use**: After running `arc init` (fresh install or joining an existing project).

**Which path applies**: `arc init` detects whether ARC is already present in the repo.

- **Fresh install** — first time ARC is used in this repo. Full verification and
  configuration walkthrough.
- **Join existing** — ARC was already initialized by another team member. Verify local
  setup and review existing configuration.

---

## Path 1: Fresh Install

### Verify Directory Structure

Confirm that `.arc/` was created at the repo root with the expected structure:

- `active/` — Current work tracking (WORK-STATUS, task lists)
- `backlog/` — Future work pipeline (ROADMAP, backlogs)
- `reference/` — Constitutional documents, strategies, ADRs
- `system/` — Agent configs, workflows, githooks, settings

### Verify Session State

Confirm that `.arc/active/WORK-STATUS.md` exists with initial "no active work" defaults:

```markdown
**Branch**: `main`
**Task List**: [none]
**Following Task List**: No
**Next Task**: —
**Last Completed**: —
**Blockers**: [none]
**Next Action**: Run initial setup → `01_verify-and-configure.md`
```

### Verify Agent Configuration

Confirm that agent-specific directories were created for the selected tools
(e.g., `.claude/`, `.codex/`, `.gemini/`). Each contains pre-built skills and
settings for that agent platform.

### Configuration Walkthrough

Review `.arc/system/arc-config.yml` section by section. For each setting, consider the
current value, what it controls, and whether the available alternatives (documented in
the file's inline comments) are a better fit.

**Sections to review:**

- **Branch model** — base branch and protection level
- **Commit discipline** — message format and context footer requirements
- **Merge strategy** — how branches are integrated
- **Hooks** — pre-commit and commit-msg validation toggles
- **Review** — pre-merge diff review
- **Platform** — git hosting platform (informational)
- **Project Management** — PM mode (already set during init, confirm)
- **Team mode** — solo vs. team behavioral defaults

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent — file
structure, config validity, hook status, and reference integrity. This is optional but
recommended for first-time setup.

### Next Step

Proceed to [02_define-project.md](02_define-project.md) to establish the project's
identity and planning documents.

---

## Path 2: Join Existing

ARC was already initialized and committed by another team member. The `.arc/` directory,
configuration, and constitutional documents are already in the repo.

### Verify Local Setup

Confirm that `arc init` set up the local environment:

- **Agent directories** — tool-specific directories created for your selected tools
  (e.g., `.claude/`, `.codex/`). These contain skills and settings.
- **Git hooks** — symlinks installed from `.git/hooks/` to `.arc/system/githooks/`.
  Verify with `ls -la .git/hooks/`.
- **Identity** — `git config arc.identity` is set. This determines your personal
  workspace directory (`user/{identity}/`).

### Configuration Review

Review `.arc/system/arc-config.yml` section by section. The configuration was set during
initial setup — review each value, what it controls, and what it means for your workflow.
Adjustments are committed to the repo like any other code change. The config file's inline
comments document all available values.

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent.

### Next Step

Constitutional documents (META-PRD, TECHNICAL-OVERVIEW, DEV-RULES.PROJECT) already exist.
Read them for project context rather than creating them — skip
[02_define-project.md](02_define-project.md) unless documents need updating.

If the project uses arc-in-git PM mode (`pm.mode: arc-in-git` in config), review
ROADMAP.md and PROJECT-STATUS.md for current project state.
