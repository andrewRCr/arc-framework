# Configuration

ARC has 11 non-negotiable principles and a set of configurable conventions that implement them.
Configuration is how you adapt conventions to your team's workflow — the principles stay fixed,
the implementation details flex.

This page covers the mechanisms at guide level. For the exhaustive convention inventory,
validation scenarios, and architectural rationale, see `strategy-configurability-architecture.md`
in your `.arc/reference/strategies/` directory.

## Three Mechanisms

ARC provides three distinct customization mechanisms, each for a different kind of change:

### Configuration values

**File:** `arc-config.yml` in `.arc/system/`

Values that affect behavior — toggles, mode selections, enforcement levels. The file uses flat
dotted keys (`commit.format`, `branch.protection`) with inline comments explaining each setting,
its default, and alternatives.

```yaml
# Commit message format enforced by commit-msg hook.
#   conventional - type(scope): description (default)
#   custom       - validates against commit.custom_pattern regex
#   any          - no format validation
commit.format: conventional
```

Settings group into two categories:

- **Runtime settings** take effect immediately when you edit the file — hooks and the agent read
  the value at runtime. Examples: `commit.format`, `hooks.pre_commit`, `branch.protection`,
  `merge.strategy`.
- **Structural settings** affect which files are installed. Changing them requires
  `arc init --reconfigure` to add, remove, or re-render files. Examples: `pm.mode`,
  `team.mode`. Use `--dry-run` to preview changes before applying.

**Per-developer overrides:** A few settings that vary by developer (like `user.sync_push`) use
git config for personal overrides: `git config arc.sync_push manual`. The project config sets
the team default; git config provides the individual exception.

### Method overrides

**File:** `arc-methods.md` in `.arc/system/workflows/`

Replace *how* ARC does something while preserving *what* it accomplishes. Each method defines a
contract (the invariant) and a default implementation. Your team supplies an alternative that
satisfies the same contract.

```markdown
## commit-format

**Contract:** Commits follow a consistent, communicative format that
enables automated tooling and readable history.

### commit-format.override

[No override configured]

### commit-format.default

Conventional commit format: `type(scope): description`
```

To override: replace `[No override configured]` with your team's implementation. The agent
checks `.override` first — if populated, it follows the override and skips `.default`.

Available methods: `commit-format`, `commit-context-format`, `issue-triage`, `test-first`,
`session-state`, `pre-merge-review`, `review-triage`, `quality-gate-commands`.

Method content loads on-demand when the agent reaches the relevant workflow step, not at session
start. This keeps initialization fast and context focused.

### Extension points

**File:** `arc-extensions.md` in `.arc/system/workflows/`

Inject additional steps at specific locations in ARC workflows — without replacing existing
steps. Extensions add behavior on top of ARC's defaults.

```markdown
## post-task-quality

**Fires:** After Tier 1 checks pass, before marking task complete

**Contract:** Additional quality checks after every task. Must return
a clear pass/fail signal.

### post-task-quality.steps

[No extension configured]
```

To extend: replace `[No extension configured]` with your steps. Available extension points:

| Extension                 | When it fires                                     |
|---------------------------|---------------------------------------------------|
| `post-task-quality`       | After Tier 1 checks, before marking task complete |
| `post-unit-quality`       | After Tier 2 checks at coherent unit completion   |
| `post-task-completion`    | After task marked complete, before reporting      |
| `post-context-load`       | After standard document loading at session start  |
| `pre-stage-review`        | After staging changes, before creating a commit   |
| `pre-merge-review`        | After pre-merge review, before push and PR        |
| `post-work-unit-activate` | After a work unit moves from backlog to active    |
| `post-work-unit-archive`  | After a work unit is archived                     |

## Beyond the Three Mechanisms

Not all customization goes through config, methods, or extensions. Some conventions are
configured by editing the file that embodies them:

- **Templates** (`reference/templates/`) — edit PRD, plan, and task list templates to change
  document structure
- **Project strategies** (`reference/strategies/project/`) — create domain-specific guidance for
  your project (authentication patterns, testing methodology, component styling)
- **Domain-specific rules** (`reference/constitution/`) — extend `DEV-RULES.PROJECT.md` with
  domain files like `DEV-RULES.FRONTEND.md` or `DEV-RULES.AUTH.md`
- **QUICK-REFERENCE** (`reference/QUICK-REFERENCE.md`) — update commands and environment
  context for your platform and tooling

These are project-owned files — you create and maintain them. ARC doesn't ship project-specific
content (except templates as starting points).

## Enforcement vs. Guidance

An important design detail: relaxing enforcement is not the same as removing guidance. When you
set `commit.format: any`, the git hook stops validating commit messages — but the agent still
produces conventional commits because it read ARC's development methodology, which describes
conventional commits as the recommended format.

This separation is intentional:

- **Config** = enforcement boundary (will the hook block you?)
- **Methodology docs** = quality guidance (what does ARC recommend?)
- **Relaxing config** = same guidance, less friction

This makes adoption smoother — you can start with relaxed enforcement while learning ARC, then
tighten as the conventions prove their value. The agent's behavior is consistent throughout.

## The Settings

`arc-config.yml` ships with all settings documented via inline comments. The groups:

| Group        | What it controls                                                         |
|--------------|--------------------------------------------------------------------------|
| `branch.*`   | Base branch, protection mode (partial/full)                              |
| `commit.*`   | Message format, context footer requirement, custom patterns              |
| `merge.*`    | Integration strategy (merge/rebase/squash)                               |
| `hooks.*`    | Pre-commit and commit-msg hook toggles, validation settings              |
| `review.*`   | Pre-merge diff review toggle                                             |
| `platform.*` | Git hosting platform (informational — affects agent command suggestions) |
| `pm.*`       | Project management mode (none/arc-in-git/external)                       |
| `team.*`     | Team mode toggle                                                         |
| `user.*`     | Session state sync behavior                                              |

For the complete setting reference with all values and defaults, see `arc-config.yml` itself —
it's designed to be self-documenting.
