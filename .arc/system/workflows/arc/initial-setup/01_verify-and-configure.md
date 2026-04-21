---
purpose: Verify that `arc init` completed successfully and walk through initial project configuration.
audience: collaborative (human and agent)
---

# Workflow: Verify and Configure ARC

This workflow runs once after init — for ongoing health checks, use `/arc-verify` instead.

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

- `active/` — Current work tracking (per-WU status files, task lists). Created
  lazily at first work unit activation; absent immediately after init.
- `backlog/` — Future work pipeline (ROADMAP, backlogs) · only with `pm.mode: arc-in-git`
- `reference/` — Constitutional documents, strategies, ADRs
- `system/` — Agent configs, workflows, githooks, settings

### Verify Session State

No active status file exists yet — per-WU status files (`status-{name}.md`) are
created in `.arc/active/{category}/` at first work unit activation, not at init.

Initial session state lives in the bootstrap Persistent Context entry in
`.arc/user/{identity}/SESSION-NOTES.md`, pre-populated by `arc init`:

```markdown
## Persistent Context

**Post-install setup:**
_Remove when: initial-setup sequence complete._

- First session after `arc init`. Work through the initial-setup sequence,
  starting at `.arc/system/workflows/arc/initial-setup/01_verify-and-configure.md`.
  The workflow guides onward steps.
```

Confirm the entry is present. Session-init treats Persistent Context as active
constraints, so the next `/arc-resume` surfaces the pointer to this workflow in
its orientation output.

### Verify Agent Configuration

Confirm that agent-specific directories were created for the selected tools
(e.g., `.claude/`, `.codex/`, `.gemini/`). Each contains pre-built skills and
settings for that agent platform.

**Agent config file:** Check whether a `{AGENT}.ARC.md` file exists in
`system/agent/` for the agent running this workflow. Common agents (Claude,
Codex, Gemini, Copilot, Cursor, Windsurf, Warp) ship with pre-built files
installed by `arc init`. If no file exists for the current agent, create one
from [template-agent.md][template-agent] — copy to `system/agent/{AGENT}.ARC.md`,
replacing `[AGENT]` with the uppercase agent name and `[Agent]` with the
display name. The agent can then populate it with real guidance as the project
evolves.

### User Workspace

`arc init` created `user/{identity}/` as a personal workspace directory (gitignored).
This is where session-specific files live — SESSION-NOTES.md (written at session handoff),
and with arc-in-git PM mode, ATOMIC-INBOX.md (deferred tasks).

Confirm identity is set:

```bash
git config arc.identity
```

Session context portability is controlled by `user.sync_push` in `arc-config.yml` — this
determines whether session notes are automatically pushed to the remote via git notes
(`always` for solo, `prompt` for team). Individual developers can override with
`git config arc.syncPush`.

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

### Customization Beyond Config

ARC has two additional customization surfaces worth knowing about:

- **`system/methods/`** — one file per method, each replacing *how* ARC does something.
  Example: a team using Jira populates the `.override` section in
  `commit-context-format.md` to reference tickets instead of task lists.
- **`system/extensions/`** — one file per extension point, each adding *extra steps* at
  workflow points. Example: populate `.actions` in `post-task-quality.md` to run a security
  scan after every task, or `post-task-completion.md` to sync task completion to an external
  tracker.

Both ship with placeholders that work out of the box. They're configured on-demand as
specific workflows reference them — not during initial setup.

Teams also extend ARC through project-owned content: project strategies
(`strategies/project/`), project workflows (`workflows/project/`), and
DEV-RULES.PROJECT (defined in the next workflow). These grow organically as project
patterns emerge. See [Configurability Architecture Strategy][config-arch] for the
full model.

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent — file
structure, config validity, hook status, and reference integrity. This is optional but
recommended for first-time setup.

### Next Step

Proceed to [02_define-project.md](02_define-project.md) to establish the project's
identity and constitutional documents.

---

## Path 2: Join Existing

ARC was already initialized and committed by another team member. The `.arc/` directory,
configuration, and constitutional documents are already in the repo.

### Verify Local Setup

Confirm that `arc init` set up the local environment:

- **Agent directories** — tool-specific directories created for your selected tools
  (e.g., `.claude/`, `.codex/`). These contain skills and settings.
- **Agent config file** — check whether `system/agent/{AGENT}.ARC.md` exists for
  the agent running this workflow. If not, create one from
  [template-agent.md][template-agent] (see Path 1 § Verify Agent Configuration).
- **Git hooks** — if your project uses a hook manager (husky, lefthook, pre-commit),
  ARC hooks are integrated into the manager's config. Otherwise, `core.hooksPath` is set
  to `.arc/system/githooks/`. Verify with `git config core.hooksPath` or check your
  hook manager's config for ARC entries.
- **Identity** — `git config arc.identity` is set. This determines your personal
  workspace directory (`user/{identity}/`).
- **User workspace** — `user/{identity}/` exists. Check `user.sync_push` in
  `arc-config.yml` for the team's sync behavior; override locally with
  `git config arc.syncPush` if needed.

### Configuration Review

Review `.arc/system/arc-config.yml` section by section. The configuration was set during
initial setup — review each value, what it controls, and what it means for your workflow.
Adjustments are committed to the repo like any other code change. The config file's inline
comments document all available values.

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent.

### Next Step

Constitutional documents (META-PRD, TECHNICAL-OVERVIEW, AGENT-BRIEFING.PROJECT, DEV-RULES.PROJECT,
QUICK-REFERENCE) already exist. Read them for project context rather than creating them —
skip [02_define-project.md](02_define-project.md) unless documents need updating.

> **With arc-in-git PM** (`pm.mode: arc-in-git`) — Review ROADMAP.md and PROJECT-STATUS.md
> for current project state.

---

[config-arch]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
[template-agent]: ../../../../reference/templates/template-agent.md
