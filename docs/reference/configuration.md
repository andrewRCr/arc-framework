# Configuration

ARC has 11 non-negotiable principles and a set of configurable conventions that implement them.
Configuration is how you adapt conventions to your team's workflow — the principles stay fixed,
the implementation details flex.

This page covers the mechanisms and all available settings at guide level. For the exhaustive
convention inventory, validation scenarios, and architectural rationale, see
`strategy-configurability-architecture.md` in your `.arc/reference/strategies/` directory.

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

To override a method, replace `[No override configured]` in its `.override` section with your
team's implementation. The agent checks `.override` first — if populated, it follows the override
and skips `.default`. Here's what an override looks like for commit format:

```markdown
### commit-format.override

Jira-prefixed format: `[PROJECT-123] type: description`

Subject line must start with a Jira ticket in brackets, followed by a
type keyword and colon. Body follows the same conventions as the default.

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
```

The contract is preserved (commits follow a consistent, communicative format) while the
implementation changes to match your team's tooling.

Available methods:

| Method                  | What it controls                                                    |
|-------------------------|---------------------------------------------------------------------|
| `commit-format`         | Commit message structure (type, scope, body)                        |
| `commit-context-format` | Context footer patterns linking commits to tasks                    |
| `issue-triage`          | Severity thresholds for fix-vs-defer decisions on discovered issues |
| `test-first`            | Decision tree for when to write tests before implementation         |
| `session-state`         | How session state is read and written at boundaries                 |
| `pre-merge-review`      | Aggregate diff review before pushing                                |
| `review-triage`         | Classifying and acting on review findings                           |
| `quality-gate-commands` | Project-specific quality gate command definitions                   |

Method content loads on-demand when the agent reaches the relevant workflow step, not at session
start. This keeps initialization fast and context focused.

### Extension points

**File:** `arc-extensions.md` in `.arc/system/workflows/`

Inject additional steps at specific locations in ARC workflows — without replacing existing
steps. Extensions add behavior on top of ARC's defaults.

To extend, replace `[No extension configured]` in the `.steps` section with your steps. Here's
an example that adds a security scan after each task's quality checks:

```markdown
### post-task-quality.steps

Run Snyk security scan on modified files:

1. `npx snyk test --file=package.json` — check for known vulnerabilities
2. If new vulnerabilities found, report in task completion summary
3. Critical/high severity → fail the quality check (block task completion)
4. Medium/low → note in completion summary, continue
```

Available extension points:

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

## All Settings

Every setting in `arc-config.yml`, with its options and default:

### Branch model

| Setting             | Options           | Default   | What it controls                                                                                                         |
|---------------------|-------------------|-----------|--------------------------------------------------------------------------------------------------------------------------|
| `branch.base`       | Any branch name   | `main`    | Primary integration branch                                                                                               |
| `branch.protection` | `partial`, `full` | `partial` | Branch and PR requirements for changes. `partial`: planned work requires branches. `full`: all changes require branches. |

### Commit discipline

| Setting                  | Options                                         | Default        | What it controls                                    |
|--------------------------|-------------------------------------------------|----------------|-----------------------------------------------------|
| `commit.format`          | `conventional`, `custom`, `any`                 | `conventional` | Commit message format enforced by hook              |
| `commit.context_footer`  | `required`, `recommended`, `custom`, `disabled` | `required`     | Context footer requirement                          |
| `commit.custom_pattern`  | Regex string                                    | *(empty)*      | Custom format regex (when `format: custom`)         |
| `commit.context_pattern` | Regex string                                    | *(empty)*      | Custom footer regex (when `context_footer: custom`) |

### Merge strategy

| Setting          | Options                     | Default | What it controls                        |
|------------------|-----------------------------|---------|-----------------------------------------|
| `merge.strategy` | `merge`, `rebase`, `squash` | `merge` | How branches integrate into base branch |

### Hooks

| Setting                             | Options                   | Default              | What it controls                                  |
|-------------------------------------|---------------------------|----------------------|---------------------------------------------------|
| `hooks.pre_commit`                  | `enabled`, `disabled`     | `enabled`            | Pre-commit check execution                        |
| `hooks.commit_msg`                  | `enabled`, `disabled`     | `enabled`            | Commit message format validation                  |
| `hooks.task_numbering`              | `error`, `warning`, `off` | `error`              | Task numbering format check (1.1.a not 1.1.1)     |
| `hooks.subject_max_length`          | Integer                   | `72`                 | Maximum commit subject line length                |
| `hooks.subject_warn_length`         | Integer                   | `60`                 | Warning threshold for subject line length         |
| `hooks.skip_extensions`             | Pipe-separated patterns   | `md\|yml\|yaml\|...` | File extensions skipped during meta-ref checking  |
| `hooks.test_patterns`               | Pipe-separated patterns   | `__tests__/\|...`    | Test paths excluded from meta-ref checking        |
| `hooks.meta_ref_patterns`           | Pipe-separated patterns   | *(see below)*        | Patterns flagged as meta-project references       |
| `hooks.contributor_protected_paths` | Pipe-separated patterns   | `active/\|backlog/`  | Directories that warn when staged by contributors |

### Review

| Setting            | Options               | Default   | What it controls                                        |
|--------------------|-----------------------|-----------|---------------------------------------------------------|
| `review.pre_merge` | `enabled`, `disabled` | `enabled` | Whether the agent reviews aggregate diff before pushing |

### Platform

| Setting         | Options                                         | Default  | What it controls                                                   |
|-----------------|-------------------------------------------------|----------|--------------------------------------------------------------------|
| `platform.type` | `github`, `gitlab`, `bitbucket`, `azure-devops` | `github` | Git hosting platform (informational — affects command suggestions) |

### Project management

| Setting   | Options                          | Default | What it controls                                             |
|-----------|----------------------------------|---------|--------------------------------------------------------------|
| `pm.mode` | `none`, `arc-in-git`, `external` | `none`  | PM mode. **Structural** — requires `arc init --reconfigure`. |

### Team mode

| Setting     | Options         | Default | What it controls                                                                                                         |
|-------------|-----------------|---------|--------------------------------------------------------------------------------------------------------------------------|
| `team.mode` | `false`, `true` | `false` | Multi-developer mode. **Structural** — requires `arc init --reconfigure`. See [Team Coordination](team-coordination.md). |

### User directory

| Setting          | Options                      | Default  | What it controls                                                                           |
|------------------|------------------------------|----------|--------------------------------------------------------------------------------------------|
| `user.sync_push` | `always`, `prompt`, `manual` | `always` | Auto-push session state via git notes after handoff. Override: `git config arc.sync_push`. |
