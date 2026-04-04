# Updating ARC

ARC is designed to evolve. When a new version of the framework is released, the CLI updates your
`.arc/` files while preserving your customizations. This page explains how the update system works
and what you can safely edit.

## Running an Update

```bash
arc update
```

The CLI reads the manifest from your last install or update, compares it against the new framework
version, and applies changes file by file. The output tells you what happened:

```text
v0.3.0 → v0.4.0
12 updated, 3 unchanged, 5 skipped, 1 new
```

- **Updated** — framework content merged into your files
- **Unchanged** — no differences between versions
- **Skipped** — scaffolded files that are entirely yours (never touched)
- **New** — files added in the new version
- **Conflicts** — files where your changes and framework changes overlap (rare, requires manual
  resolution)

## File Classifications

Every file in `.arc/` has a classification that determines how updates treat it.

### Framework

ARC methodology files — workflows, strategies, READMEs, git hooks, templates. Rarely customized by adopters.

**Update behavior:** Auto-merged via three-way merge. Conflicts are flagged for review but are
uncommon since these files shouldn't be modified directly.

**If you need to customize:** Don't edit Framework files. Your changes will be overwritten. Use the
appropriate customization mechanism instead: [config values, method overrides, or extension
points](reference/configuration.md).

### Configurable

Files with both framework structure and project-specific content. Framework sections and your
sections are separated cleanly, usually at the section level.

**Examples:** `DEV-RULES.PROJECT.md`, `AGENT-BRIEFING.PROJECT.md`, `QUICK-REFERENCE.md`,
`STRATEGY-INDEX.md`, `arc-config.yml`, `arc-methods.md`, `arc-extensions.md`.

**Update behavior:** Three-way merge. Framework sections update cleanly; conflicts in project
sections are expected and flagged for resolution.

**These are the files you're meant to edit.** Your project standards, quality gates, agent
configuration, strategy index entries, config values, method overrides, and extension steps all live
in Configurable files.

### Scaffolded

Created once during `arc init` from a template. You replace all placeholder content with
project-specific content. The framework never touches them again.

**Examples:** `WORK-STATUS.md`, `META-PRD.md`, `PROJECT-STATUS.md`, `ROADMAP.md`, backlog files.

**Update behavior:** Skipped entirely. These are yours after initialization.

### Project-Owned

Files you create during development — task lists, PRDs, ADRs, project strategies
(`strategies/project/`), project workflows (`workflows/project/`), notes. Not part of the template
system.

**Update behavior:** Ignored completely. The CLI never reads or writes these files.

## Three-Way Merge

The update system uses git's three-way merge algorithm, the same one that powers `git merge`. For
each file being updated, three versions are compared:

1. **Base** — the pristine framework content from when you last installed or updated (stored
   internally in `.arc/system/.internal/pristine.json`)
2. **Current** — what's on disk now (your potentially customized version)
3. **Other** — the new framework version

If you haven't modified the file (current matches base), the new version replaces it cleanly. If
you have modified it, the merge algorithm integrates both sets of changes. Only when both you and
the framework changed the same lines does a conflict occur.

## What's Safe to Edit

| Classification | Safe to edit? | What happens on update                 |
|----------------|---------------|----------------------------------------|
| Framework      | No            | Your changes are overwritten           |
| Configurable   | Yes           | Three-way merge preserves your changes |
| Scaffolded     | Yes           | Never touched after init               |
| Project-Owned  | Yes           | Never touched at all                   |

The practical rule: if a file has project-specific sections or was created from a template for you
to fill in, it's safe to edit. If it's pure ARC methodology content (workflows, strategies, hook
scripts), customize through config, methods, or extensions instead.

For the complete file inventory with classifications and naming conventions, see
`strategy-file-classification.md` in `.arc/reference/strategies/arc/`.

## Skills and Hooks

**Agent skills** (e.g., `.claude/skills/arc-*/`) are regenerated on every update — they're
deterministic copies from the framework. If you've modified a skill file, the update overwrites it
and warns you. Skill customization should happen through the framework's configuration mechanisms,
not by editing generated files.

**Git hooks** are Framework-classified and update normally. Hook behavior is controlled through
`arc-config.yml` settings (`hooks.pre_commit`, `hooks.commit_msg`, etc.), not by editing the hook
scripts directly.

## Reconfiguring After Init

Some settings are structural: they affect which files exist, not just how existing files behave.
Changing `pm.mode` from `none` to `arc-in-git`, for example, adds backlog files, a roadmap, and
project status tracking.

To change structural settings after initialization:

```bash
arc init --reconfigure
```

For personal workspace settings (role, tools):

```bash
arc join --reconfigure
```

Both support `--dry-run` to preview changes without applying them.
