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
constraints, so the next `arc-resume` invocation surfaces the pointer to this
workflow in its orientation output.

### Verify Agent Configuration

Confirm that agent-specific directories were created for the selected tools
(e.g., `.claude/`, `.codex/`, `.gemini/`). Each contains pre-built skills and
settings for that agent platform.

### User Workspace

`arc init` created `user/{identity}/` as a personal workspace directory (gitignored).
This is where session-specific files live — SESSION-NOTES.md (written at session handoff),
and with arc-in-git PM mode, ATOMIC-INBOX.md (deferred tasks).

Confirm identity is set:

```bash
git config arc.identity
```

Session context portability is controlled by `user.notes_push` in `arc-config.yml` — this
determines whether session notes are automatically pushed to the remote via git notes
(`on-sync` for solo, `prompt` for team). Individual developers can override with
`git config arc.notesPush`.

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

### Optional: Set Up Interlock Release Wrappers

Most setups ask for confirmation before every `git commit` / `git push` — through the
agent harness's per-invocation prompt, a custom user-level hook, or both. Once ARC's
interlock layer (the `commit_interlock` / `push_interlock` settings reviewed during
initial configuration) is already authorizing each commit and push at the workflow
level, that per-invocation confirmation can become redundant.

The release wrappers (`arc release commit` and `arc release push`) close that gap:
ARC's interlock validation becomes the per-invocation authorization point for those
specific commands, and the wrappers run without re-asking for confirmation that ARC has
already given. Raw `git commit` / `git push` continue to prompt as before — only
wrapper invocations are affected.

The trade-off is trust: ARC's mechanical validation replaces the prompting layer as the
review surface for matching invocations. Setup is a per-developer per-machine opt-in,
and it's reasonable to defer until ARC's commit and push flow feels familiar.

See [Interlock Release Wrappers Strategy][interlock-strategy] for the full trust-model
framing, when-to-use guidance, and prompt-source layer interactions. The [Set Up
Release Wrappers Workflow][setup-workflow] carries the step-by-step procedure that
`arc release setup install` drives.

Three options:

- **Set up now** — run `arc release setup install`. The setup workflow detects the
  harness, walks through trust-model acknowledgment, and verifies before recording
  opt-in.
- **Defer** — continue initial setup; run `arc release setup install` whenever ready.
- **Skip entirely** — continue initial setup; `arc release setup install` remains
  available regardless of this choice. The framework doesn't gate the feature out.

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
- **Git hooks** — if your project uses a hook manager (husky, lefthook, pre-commit),
  ARC hooks are integrated into the manager's config. Otherwise, `core.hooksPath` is set
  to `.arc/system/githooks/`. Verify with `git config core.hooksPath` or check your
  hook manager's config for ARC entries.
- **Identity** — `git config arc.identity` is set. This determines your personal
  workspace directory (`user/{identity}/`).
- **User workspace** — `user/{identity}/` exists. Check `user.notes_push` in
  `arc-config.yml` for the team's sync behavior; override locally with
  `git config arc.notesPush` if needed.

### Configuration Review

Review `.arc/system/arc-config.yml` section by section. The configuration was set during
initial setup — review each value, what it controls, and what it means for your workflow.
Adjustments are committed to the repo like any other code change. The config file's inline
comments document all available values.

### Optional: Set Up Release Wrappers

ARC's release wrappers — `arc release commit` and `arc release push` — wrap
`git commit` / `git push` with mechanical interlock validation (the same interlock
values reviewed during § Configuration Review), refuse destructive flags, and write one
audit-log entry per invocation. Setup translates a small allowlist into the harness's
permission surface so the wrappers run without per-invocation harness prompts under
default-prompt harnesses; under bypass-mode harnesses, setup records opt-in to engage
the validation + audit layer as the canonical authorization signal for matching
invocations. The trade-off is a per-developer per-machine opt-in.

See [Interlock Release Wrappers Strategy][interlock-strategy] for the full trust-model
framing, when-to-use guidance, and per-harness setup notes.

Three options:

- **Set up now** — run `arc release setup install`. The setup workflow detects the
  harness, walks through trust-model acknowledgment, writes the allowlist, verifies with
  a behavioral test under default-prompt mode, and records opt-in.
- **Defer** — continue initial setup; run `arc release setup install` whenever ready.
  Available indefinitely.
- **Skip entirely** — continue initial setup; `arc release setup install` remains
  available regardless of this choice. The framework doesn't gate the feature out.

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent.

### Next Step

Constitutional documents (META-PRD, TECHNICAL-OVERVIEW, AGENT-BRIEF.PROJECT, DEV-RULES.PROJECT,
QUICK-REFERENCE) already exist. Read them for project context rather than creating them —
skip [02_define-project.md](02_define-project.md) unless documents need updating.

> **With arc-in-git PM** (`pm.mode: arc-in-git`) — Review ROADMAP.md and PROJECT-STATUS.md
> for current project state.

---

[config-arch]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
[interlock-strategy]: ../../../../reference/strategies/arc/strategy-interlock-release-wrappers.md
[setup-workflow]: ../supplemental/setup-release-wrapper.md
