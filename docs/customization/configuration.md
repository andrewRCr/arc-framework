# Configuration

ARC has 11 non-negotiable principles and a set of configurable conventions that implement them.
`arc-config.yml` is how you adapt conventions to your team's workflow. The principles stay fixed;
the implementation details flex.

For methods, extensions, and other customization mechanisms, see
[Methods & Extensions](methods.md). For platform-level automation, see
[Agent Hooks](hooks.md).

## The Design Philosophy

ARC ships with all enforcement active — conventional commits, context footers, commit-msg hooks,
branch protection. The defaults represent ARC's recommended configuration. Adopters who encounter
friction adjust individual settings after experiencing the framework, rather than making
enforcement decisions before their first session.

??? info "Why strong defaults?"

    Strong defaults serve two purposes: they demonstrate the conventions in practice before
    asking adopters to commit, and they eliminate the "blank slate" problem where teams must
    make dozens of configuration decisions before writing their first line of code.

    `arc-config.yml` includes inline comments explaining each setting's purpose, default value,
    and alternatives. This self-documenting config file is the primary mechanism for adopters
    to discover what's adjustable and how to adjust it.

### Enforcement vs. guidance

An important design detail: relaxing enforcement is not the same as removing guidance. When you
set `commit.format: any`, the git hook stops validating commit messages — but the agent still
produces conventional commits because it read ARC's development methodology, which describes
conventional commits as the recommended format.

This separation is intentional:

- **Config** = enforcement boundary (will the hook block you?)
- **Methodology docs** = quality guidance (what does ARC recommend?)
- **Relaxing config** = same guidance, less friction

This makes adoption smoother. Start with relaxed enforcement while learning ARC, then tighten
as the conventions prove their value. The agent's behavior is consistent throughout — enforcement
catches up to what the agent was already doing.

### Scaling in both directions

The same-files, config-driven approach enables smooth scaling:

- **Tightening:** Change `commit.format` from `any` to `conventional`, enable
  `hooks.commit_msg`. No file additions, no reinstallation. The agent already knows the
  conventions — enforcement catches up.
- **Loosening:** Set `hooks.commit_msg: disabled`. The agent still produces quality output;
  enforcement is relaxed.
- **Adding method overrides:** Independent of enforcement changes. Override session-state
  without touching enforcement settings. See [Methods & Extensions](methods.md).
- **Changing PM mode:** Independent of enforcement and method changes. Switch via
  `arc init --reconfigure`. See [Structural vs. runtime settings](#structural-vs-runtime-settings).

### Adoption flexibility

Adoption flexibility has two independent axes:

| Axis                 | What varies                   | Mechanism                            |
| -------------------- | ----------------------------- | ------------------------------------ |
| Method customization | ARC defaults vs. team methods | Overrides in `arc-methods.md`        |
| Functionality scope  | What features are installed   | PM mode selection (`pm.mode`)        |

Enforcement depth — how strictly conventions are applied — is not a named axis. It is simply
"edit `arc-config.yml`." Three adopter postures:

1. "I don't care about format" → `commit.format: any`, agent produces quality output
2. "I want ARC's convention enforced" → `commit.format: conventional`, hooks enforce (default)
3. "I want something *different* enforced" → Method overrides + custom config patterns

## How `arc-config.yml` Works

`arc-config.yml` is the single configuration file for all convention-level settings. It uses
dotted keys for logical grouping within a flat-file, shell-parseable format.

```yaml
# ARC Framework Configuration
#
# Only conventions (tier 2) appear here — principles (tier 1) are non-negotiable.
# Format: Flat key-value pairs with dotted grouping.

branch.base: main
branch.protection: partial
commit.format: conventional
commit.context_footer: required
merge.strategy: merge
hooks.pre_commit: enabled
hooks.commit_msg: enabled
platform.type: github
pm.mode: none
```

!!! tip "Why dotted keys and flat files?"

    Git hooks read config without a YAML library. The `grep + cut` parsing approach must remain
    viable. Dotted keys give logical grouping (`branch.*`, `commit.*`) without requiring a
    parser upgrade.

### What earns a config setting

Not every convention needs a config knob:

- **Runtime-checkable** → config setting. The value is needed at runtime by hooks, workflows,
  or agent guidance. All current settings fall here.
- **File-customizable** → edit the file. Template formats, document structure, agent-specific
  content — the file itself is the configuration.
- **Behavioral guidance** → edit the prose. Review increment scope, collaborative voice,
  completion protocol details — adjusted by editing strategy or workflow documents.

A convention earns a config setting when its value is consumed programmatically **and** the
alternative (editing framework files directly) would create update or maintenance problems.

### Structural vs. runtime settings

Settings divide into two categories based on how changes take effect:

**Structural settings** affect which files are installed. Changing them requires
`arc init --reconfigure`:

- `pm.mode` — Adds or removes arc-in-git files (ROADMAP, backlogs, PROJECT-STATUS)
- `team.mode` — Adds or removes team coordination content in templates
- `project_name` — Re-renders token substitutions across templates

Use `--dry-run` to preview changes before applying.

**Runtime settings** are read by hooks and the agent at runtime. Change them by editing
`arc-config.yml` directly — no command needed:

- `commit.format`, `commit.context_footer` — Hook validation rules
- `hooks.pre_commit`, `hooks.commit_msg` — Hook enable/disable
- `branch.base`, `branch.protection` — Branch model
- `merge.strategy` — Integration strategy
- `platform.type` — Agent platform awareness
- `review.pre_merge` — Pre-merge review toggle

### Project-wide by design

`arc-config.yml` is a project-level file — all settings apply to the entire team. There is no
per-developer layering mechanism.

Per-developer values (identity, role) route through **git config** (`git config arc.identity
alice`), which is already per-developer by design. Project-level defaults that individuals may
want to override (e.g., `user.sync_push`) follow the same pattern: `arc-config.yml` sets the
team default, git config provides a personal override.

??? info "Why not layered config?"

    A layered system (`arc-config.yml` → `user/{identity}/config.yml`) would add resolution
    mechanics, documentation overhead, and implementation complexity for currently 1–2
    per-developer settings. If per-developer config needs grow significantly, the
    `user/{identity}/` directory is the natural home — the architecture accommodates this
    without committing to it now.

### Settings with behavioral implications

Most settings are straightforward toggles. Some carry deeper implications:

**Merge strategy** (`merge.strategy`) has three values with different traceability
characteristics:

- **`merge`** (default) — Preserves branch topology and individual commit history. Most
  aligned with P6 (traceability).
- **`rebase`** — Linear history, commits replayed onto base. Hashes change, which can
  complicate traceability if commits are referenced elsewhere by hash.
- **`squash`** — Individual commits collapse into one per branch. Traceability shifts to PR
  descriptions, which must carry what individual commits would normally provide.

ARC accommodates squash merging by shifting traceability mechanisms, not by blocking the choice.

## CLI Commands

| Command                  | Scope           | What it does                                                   |
| ------------------------ | --------------- | -------------------------------------------------------------- |
| `arc init`               | Project setup   | Scaffold `.arc/` directory, manifest, hooks, config, templates |
| `arc init --reconfigure` | Project config  | Change structural settings (pm.mode, team.mode, project name)  |
| `arc init --dry-run`     | Preview         | Show what `--reconfigure` would change without applying        |
| `arc join`               | Personal setup  | Set up developer workspace: role, identity, hooks, skills      |
| `arc join --reconfigure` | Personal config | Change role and/or tool selection, regenerate skills           |
| `arc update`             | Framework sync  | Update framework files to latest version                       |

**Project-level vs. personal:** `init` operates on the shared project installation. `join`
operates on the developer's personal workspace. Both are idempotent.

## All Settings

Every setting in `arc-config.yml`, with its options and default.

### Branch model

| Setting             | Options           | Default   | What it controls                                                                                                         |
| ------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `branch.base`       | Any branch name   | `main`    | Primary integration branch                                                                                               |
| `branch.protection` | `partial`, `full` | `partial` | Branch and PR requirements for changes. `partial`: planned work requires branches. `full`: all changes require branches. |

### Commit discipline

| Setting                  | Options                                         | Default        | What it controls                                    |
| ------------------------ | ----------------------------------------------- | -------------- | --------------------------------------------------- |
| `commit.format`          | `conventional`, `custom`, `any`                 | `conventional` | Commit message format enforced by hook              |
| `commit.context_footer`  | `required`, `recommended`, `custom`, `disabled` | `required`     | Context footer requirement                          |
| `commit.custom_pattern`  | Regex string                                    | *(empty)*      | Custom format regex (when `format: custom`)         |
| `commit.context_pattern` | Regex string                                    | *(empty)*      | Custom footer regex (when `context_footer: custom`) |

### Merge strategy

| Setting          | Options                     | Default | What it controls                        |
| ---------------- | --------------------------- | ------- | --------------------------------------- |
| `merge.strategy` | `merge`, `rebase`, `squash` | `merge` | How branches integrate into base branch |

### Hooks

| Setting                             | Options                   | Default              | What it controls                              |
| ----------------------------------- | ------------------------- | -------------------- | --------------------------------------------- |
| `hooks.pre_commit`                  | `enabled`, `disabled`     | `enabled`            | Pre-commit check execution                    |
| `hooks.commit_msg`                  | `enabled`, `disabled`     | `enabled`            | Commit message format validation              |
| `hooks.task_numbering`              | `error`, `warning`, `off` | `error`              | Task numbering format check (1.1.a not 1.1.1) |
| `hooks.subject_max_length`          | Integer                   | `72`                 | Maximum commit subject line length            |
| `hooks.subject_warn_length`         | Integer                   | `60`                 | Warning threshold for subject line length     |
| `hooks.skip_extensions`             | Pipe-separated patterns   | `md\|yml\|yaml\|...` | File extensions skipped during meta-ref check |
| `hooks.test_patterns`               | Pipe-separated patterns   | `__tests__/\|...`    | Test paths excluded from meta-ref checking    |
| `hooks.meta_ref_patterns`           | Pipe-separated patterns   | *(see below)*        | Patterns flagged as meta-project references   |
| `hooks.contributor_protected_paths` | Pipe-separated patterns   | `active/\|backlog/`  | Directories that warn when staged by contrib  |

### Review

| Setting            | Options               | Default   | What it controls                                        |
| ------------------ | --------------------- | --------- | ------------------------------------------------------- |
| `review.pre_merge` | `enabled`, `disabled` | `enabled` | Whether the agent reviews aggregate diff before pushing |

### Platform

| Setting         | Options                                         | Default  | What it controls                                                   |
| --------------- | ----------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `platform.type` | `github`, `gitlab`, `bitbucket`, `azure-devops` | `github` | Git hosting platform (informational — affects command suggestions) |

### Project management

| Setting   | Options                          | Default | What it controls                                             |
| --------- | -------------------------------- | ------- | ------------------------------------------------------------ |
| `pm.mode` | `none`, `arc-in-git`, `external` | `none`  | PM mode. **Structural** — requires `arc init --reconfigure`. |

### Team mode

| Setting     | Options         | Default | What it controls                                                 |
| ----------- | --------------- | ------- | ---------------------------------------------------------------- |
| `team.mode` | `false`, `true` | `false` | Multi-developer mode. **Structural** — `arc init --reconfigure`. |

See [Team Coordination](../reference/team-coordination.md) for the full coordination protocol.

### User directory

| Setting          | Options                      | Default  | What it controls                                                                                                                                           |
| ---------------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.sync_push` | `always`, `prompt`, `manual` | `always` | Auto-push session state via git notes after handoff. Defaults to `prompt` when `team.mode: true` is set during init. Override: `git config arc.sync_push`. |

## Validation Scenarios

Three high-risk scenarios that test the configurability model against real adopter situations.

??? example "Scenario A: Scrum team with Jira"

    A Scrum team uses Jira for sprint tracking and wants `[JIRA-XXX] description` as their
    commit format. They want task completion to update Jira, not just markdown checkboxes.

    **What they configure:**

    - `commit.format: custom` with `commit.custom_pattern` matching their Jira format
    - `commit.context_footer: custom` with `commit.context_pattern` matching `Closes JIRA-XXX`
    - Post-task-completion extension: update Jira ticket status after ARC marks `[x]`
    - Method override for commit context format: Jira ticket reference replaces ARC's
      `Context: tasks-*.md` footer

    **What stays the same:** All 11 principles honored. Quality gates still run. The agent
    still follows ARC's task loop — it marks `[x]` in the task list (core behavior) and then
    updates Jira via the extension. Session ceremonies, specification-driven planning, and
    co-development are unchanged.

    **PM mode:** `external` (Jira is the PM tool).

??? example "Scenario B: Factory-style agent (bookend pattern)"

    A team uses ARC for planning and integration but delegates bounded, well-specified
    execution to an async agent (Codex cloud, Devin).

    **What they configure:** Default settings. No special configurability needed — the bookend
    pattern is about how the team *uses* ARC, not how they configure it.

    **How it works:** ARC governs planning (PRDs, task decomposition with acceptance criteria)
    and integration (quality gates, PR review, traceability). The execution phase — where the
    async agent works autonomously — operates outside ARC's methodology. ARC's specification-driven
    planning output serves as the dispatch specification. ARC's quality gates verify the
    result at integration.

    **What ARC does not cover:** The execution phase itself. ARC's co-development principles
    (P2, P3, P11) do not apply during delegated execution. The team accepts this tradeoff for
    bounded, deterministic work where the cost of reduced human involvement is low.

??? example "Scenario C: Relaxed to full enforcement"

    A solo developer relaxes enforcement during early adoption (`commit.format: any`,
    `hooks.commit_msg: disabled`) to reduce friction while learning ARC. After a few weeks,
    they adopt full enforcement.

    **The scaling path:**

    1. Edit `arc-config.yml`: change `commit.format` to `conventional`, `commit.context_footer`
       to `required`, enable `hooks.commit_msg`
    2. Done. No file additions, no reinstallation, no migration.

    **What the developer notices:** Commits that would have been accepted are now validated.
    The quality is the same (the agent was already producing conventional commits); the
    enforcement is new. The transition is smooth because the relaxed period demonstrated the
    conventions in practice before enforcement was activated.
