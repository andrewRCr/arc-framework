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

- `active/` — Current work tracking (per-WU meta files, task lists). Created
  lazily at first work unit activation; absent immediately after init.
- `backlog/` — Future work pipeline (ROADMAP, backlogs) · only with `pm.mode: arc-in-git`
- `reference/` — Constitutional documents, strategies, ADRs
- `system/` — Agent configs, workflows, githooks, settings

### Verify Session State

No active meta file exists yet — per-WU meta files (`meta-{name}.md`) are
created in `.arc/active/` at first work unit activation, not at init.

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
constraints, so the next `arc-session` invocation surfaces the pointer to this
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
  `commit-footer.md` to reference tickets instead of task lists.
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
interlock layer (the `arc.commitInterlock` / `arc.pushInterlock` settings reviewed during
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

### Optional: Install Compaction Recovery Hooks

ARC ships opt-in hook recipes for harnesses with reliable compaction events. The hooks write a
machine-local compaction seed before auto/manual compaction and require `session-recover` after
compaction, so the ARC procedural layer is restored without rerunning full session init.

This is a project-scoped harness-config write, not a user/global hook, git-hook, or release-wrapper
allowlist. Hooks run local commands, so install only after the user explicitly accepts the trust
shift for the current project and harness. Do not auto-install during `arc init`, and do not install
for unrecognized harnesses. Do not install clear-time recovery injection; the only allowed `clear`
hook is cleanup-only stale-marker removal, so deliberate resets continue to enter ARC through ordinary
`session-init`.

Three options:

- **Install for this harness** — continue only after explicit user acceptance, then select the
  matching recipe below.
- **Defer** — continue initial setup; the recipe files remain available under
  `.arc/system/.internal/harness-hooks/`.
- **Skip entirely** — continue initial setup; the portable `arc-recover` skill remains the fallback.

On accept, write only the selected harness recipe:

- **Claude Code** — merge into the project-root harness config:
  `.arc/system/.internal/harness-hooks/claude-code/compaction-recovery.settings.json` into
  `.claude/settings.json`. Merge the top-level `hooks` object; preserve all unrelated settings and
  existing non-ARC hook entries.
- **Codex CLI** — merge into the project-root harness config:
  `.arc/system/.internal/harness-hooks/codex-cli/hooks.json` into `.codex/hooks.json`, then ensure
  `.codex/config.toml` has `[features] hooks = true` unless an existing policy or user choice keeps
  hooks disabled. Codex project-local hooks load only after the project `.codex/` layer and the
  exact hook definitions are trusted.

Install discipline:

- Use structured JSON/TOML edits where available. If a target file does not exist, create it with
  only the accepted recipe content and any required parent directory.
- Before each write, create a timestamped backup beside the target file.
- Idempotency is exact-entry based: if the ARC matcher group and command handler already exist, do
  not duplicate them. Preserve all non-ARC hook groups and handlers.
- The installed events are harness-specific: Claude Code installs only `PreCompact(manual|auto)` and
  `SessionStart(compact)`. Codex CLI installs `PreCompact(manual|auto)`, `PostToolUse`,
  `UserPromptSubmit`, and cleanup-only `SessionStart(clear)`; Codex `PreCompact` writes a
  session-scoped pending marker beside the seed, the first tool boundary after compaction injects
  recovery context mid-turn (`PostToolUse`), and `UserPromptSubmit` is the turn-boundary backstop
  when no tool call follows. The two channels share an atomic per-marker claim, so recovery injects
  exactly once and later boundaries stay silent until recovery clears the marker. Recovery restores
  ARC session context; repository instruction
  files such as `AGENTS.md` and `CLAUDE.md` remain harness-managed and outside ARC's recovery load set.
  Do not add Codex `SessionStart(compact)` or a catch-all `SessionStart` matcher, and do not make
  `SessionStart(clear)` inject recovery.
- After writing, re-read the target files and report one line:
  `ARC post-compaction session-recovery hooks installed for <harness>.`
- Ask the user to review/trust the new hook definitions in the harness UI when the harness requires
  it (Codex uses `/hooks`; Claude Code exposes hook review through its hook settings flow). Codex
  silently skips untrusted or modified hook definitions — including in non-interactive runs — so any
  later change to an installed hook entry needs a re-trust before it fires again.
- Rollback by restoring the timestamped backup, or by removing only the ARC recipe entries. For
  Codex, remove `[features].hooks` only if this install created that key.

### Optional: Set Up the Auto-Merge Gate

**Applies only under `branch.protection: full`** (reviewed in § Configuration Walkthrough). Skip under partial
protection — there a planning-path Errand is already a direct base-branch commit with no merge-wait, so the
lane buys nothing.

Under full protection every change ships through a branch and PR, including the planning/backlog grooming that
makes up most Errands. The auto-merge gate lets those low-risk planning PRs merge unattended once checks pass,
while constitutional docs (rules, ADRs, strategies) and code still require review. See
[strategy-work-organization § Auto-Merge Lane][work-org-auto-merge] for the doctrine.

It is GitHub-flavored (driven via `gh`) and a repo-level, one-time setup. Three options:

- **Set up now** — run the [Set Up the Auto-Merge Gate workflow][setup-merge-gate]: it drops in the `merge-ok`
  status job and a planning-paths CODEOWNERS, requires the `merge-ok` check in branch protection, and enables
  native auto-merge. Idempotent and safe to re-run.
- **Defer** — run that workflow whenever ready; it works post-init or later.
- **Skip entirely** — the lane is optional; the framework doesn't gate it out.

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
  to `.arc/system/.internal/githooks/`. Verify with `git config core.hooksPath` or check your
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

### Optional: Install Compaction Recovery Hooks

ARC ships opt-in hook recipes for Claude Code and Codex CLI. They write a machine-local seed before
compaction and require `session-recover` after `compact`; `clear` does not inject recovery.

This is a project-scoped harness-config write and requires explicit user trust. If the user accepts,
write only the selected harness recipe into the current project:

- **Claude Code** — merge
  `.arc/system/.internal/harness-hooks/claude-code/compaction-recovery.settings.json` into
  `.claude/settings.json`.
- **Codex CLI** — merge `.arc/system/.internal/harness-hooks/codex-cli/hooks.json` into
  `.codex/hooks.json`, then ensure `.codex/config.toml` has `[features] hooks = true` unless an
  existing policy or user choice keeps hooks disabled.

Use structured JSON/TOML edits where available, back up target files first, preserve non-ARC hooks,
and keep exact-entry idempotency. Claude Code installs only `PreCompact(manual|auto)` and
`SessionStart(compact)`; Codex CLI installs `PreCompact(manual|auto)`, `PostCompact(manual|auto)`,
`UserPromptSubmit`, and cleanup-only `SessionStart(clear)` as the documented workaround for Codex's
missing immediate post-compaction context injection. Codex's pending marker is scoped to the current
thread, and recovery restores ARC session context; repository instruction files such as `AGENTS.md`
and `CLAUDE.md` remain harness-managed and outside ARC's recovery load set. After writing, re-read
the target files and report one line:
`ARC post-compaction session-recovery hooks installed for <harness>.`
Then ask the user to review/trust the hook definitions in the harness UI. Roll back by restoring
the backup, or by removing only the ARC recipe entries. For Codex, remove `[features].hooks` only
if this install created that key.

### Optional: Verify Installation

Run `/arc-verify` to confirm that the installation is complete and consistent.

### Next Step

Constitutional documents (PROJECT-PRD, TECHNICAL-OVERVIEW, AGENT-BRIEF.PROJECT, DEV-RULES.PROJECT,
QUICK-REFERENCE) already exist. Read them for project context rather than creating them —
skip [02_define-project.md](02_define-project.md) unless documents need updating.

> **With arc-in-git PM** (`pm.mode: arc-in-git`) — Review ROADMAP.md for current project state.

---

[config-arch]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
[interlock-strategy]: ../../../../reference/strategies/arc/strategy-interlock-release-wrappers.md
[setup-workflow]: ../supplemental/setup-release-wrapper.md
[work-org-auto-merge]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
[setup-merge-gate]: ../supplemental/setup-merge-gate.md
